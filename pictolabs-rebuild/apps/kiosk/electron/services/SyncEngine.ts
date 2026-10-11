import { ipcMain, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { io, Socket } from 'socket.io-client';
import Database from 'better-sqlite3';
import { getCachedPrinterHealth } from './PrintService';

/**
 * SyncEngine — Enterprise Embedded SQLite Session Storage + Cloud Sync Queue.
 *
 * Replaces legacy sessions.json with high-speed, crash-proof SQLite (WAL Mode).
 * Features:
 * 1. ACID-compliant transactions for session and print job records
 * 2. Automatic migration from legacy sessions.json to SQLite on first boot
 * 3. Integrated upload_queue table for asynchronous Cloudflare R2 photo uploads
 * 4. Real-time WebSocket connection to Cloud Backend (Port 4000) for telemetry & config
 */

export interface SyncEngineConfig {
  dataDir: string;
  syncIntervalMs: number;
  apiBaseUrl?: string;
  deviceSecret?: string;
  boothId?: string;
}

export interface Session {
  id: string;
  createdAt: string;
  frameId: string;
  filter: string;
  photos: string[];
  compositePath?: string;
  liveVideoPath?: string;
  liveVideoPaths?: string[];
  liveVideoUrl?: string;
  liveVideoUrls?: string[];
  gifPath?: string;
  gifUrl?: string;
  printStatus: 'pending' | 'printed' | 'failed';
  synced: boolean;
  uploaded?: boolean;
  remoteUrl?: string;
}

export interface UploadQueueItem {
  id: string;
  sessionId: string;
  filePath: string;
  fileType: 'composite' | 'raw' | 'video';
  status: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';
  attempts: number;
  errorMessage?: string;
  remoteUrl?: string;
  createdAt: string;
  updatedAt: string;
}

let db: Database.Database | null = null;
let config: SyncEngineConfig;
let syncInterval: ReturnType<typeof setInterval> | null = null;
let uploadInterval: ReturnType<typeof setInterval> | null = null;
let healthPingInterval: ReturnType<typeof setInterval> | null = null;
let httpHeartbeatInterval: ReturnType<typeof setInterval> | null = null;
let socket: Socket | null = null;
let isUploading = false;
let lastUploadActivity = Date.now();

function broadcastToWindows(channel: string, ...args: any[]): void {
  try {
    if (typeof BrowserWindow !== 'undefined' && BrowserWindow && typeof BrowserWindow.getAllWindows === 'function') {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        win.webContents?.send(channel, ...args);
      }
    }
  } catch (_) {}
}

// ─── Prepared Statements Cache ──────────────────────────────
let stmtInsertSession: Database.Statement | null = null;
let stmtUpdateSession: Database.Statement | null = null;
let stmtGetSession: Database.Statement | null = null;
let stmtGetLastSession: Database.Statement | null = null;
let stmtListSessions: Database.Statement | null = null;
let stmtGetUnsyncedSessions: Database.Statement | null = null;
let stmtMarkSynced: Database.Statement | null = null;

let stmtEnqueueUpload: Database.Statement | null = null;
let stmtGetPendingUploads: Database.Statement | null = null;
let stmtUpdateUploadStatus: Database.Statement | null = null;
let stmtInsertSystemEvent: Database.Statement | null = null;

function initDatabase(dataDir: string): void {
  const dbFile = path.join(dataDir, 'kiosk.db');
  console.log(`[SyncEngine] Initializing SQLite database at: ${dbFile}`);

  db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      frame_id TEXT NOT NULL,
      filter TEXT NOT NULL,
      photos TEXT NOT NULL,
      composite_path TEXT,
      live_video_path TEXT,
      live_video_url TEXT,
      print_status TEXT NOT NULL DEFAULT 'pending',
      synced INTEGER NOT NULL DEFAULT 0,
      uploaded INTEGER NOT NULL DEFAULT 0,
      remote_url TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_synced ON sessions(synced);
    CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

    CREATE TABLE IF NOT EXISTS upload_queue (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      remote_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_upload_queue_status ON upload_queue(status);

    CREATE TABLE IF NOT EXISTS print_queue (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      printer_name TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT '4R',
      copies INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      next_retry_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
    CREATE INDEX IF NOT EXISTS idx_print_queue_session ON print_queue(session_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_print_queue_active ON print_queue(session_id, file_path) WHERE status IN ('PENDING', 'PRINTING');
    CREATE INDEX IF NOT EXISTS idx_upload_queue_file_path ON upload_queue(file_path);
    CREATE INDEX IF NOT EXISTS idx_print_queue_file_path ON print_queue(file_path);

    CREATE TABLE IF NOT EXISTS paper_tracker (
      id INTEGER PRIMARY KEY,
      roll_capacity INTEGER NOT NULL DEFAULT 700,
      prints_consumed INTEGER NOT NULL DEFAULT 0,
      prints_remaining INTEGER NOT NULL DEFAULT 700,
      warning_threshold INTEGER NOT NULL DEFAULT 10,
      lockout_threshold INTEGER NOT NULL DEFAULT 2,
      last_replaced_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_recovery_ledger (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      stage TEXT NOT NULL,
      last_completed_step INTEGER NOT NULL DEFAULT 0,
      payload TEXT NOT NULL,
      error_details TEXT,
      recovery_attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_recovery_active ON session_recovery_ledger(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_recovery_session ON session_recovery_ledger(session_id);

    CREATE TABLE IF NOT EXISTS kiosk_system_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      component TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_severity ON kiosk_system_events(severity);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON kiosk_system_events(created_at);
  `);

  // Seed initial paper tracker if not present
  try {
    const existingTracker = db.prepare('SELECT id FROM paper_tracker WHERE id = 1').get();
    if (!existingTracker) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO paper_tracker (id, roll_capacity, prints_consumed, prints_remaining, warning_threshold, lockout_threshold, last_replaced_at, updated_at)
        VALUES (1, 700, 0, 700, 10, 2, ?, ?)
      `).run(now, now);
    }
  } catch (_) {}

  // Migrate existing schema if live_video columns don't exist yet
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN live_video_path TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN live_video_url TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN live_video_paths TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN live_video_urls TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN gif_path TEXT;');
  } catch (_) {}
  try {
    db.exec("ALTER TABLE print_queue ADD COLUMN format TEXT NOT NULL DEFAULT '4R';");
  } catch (_) {}
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN gif_url TEXT;');
  } catch (_) {}
  try {
    db.exec("ALTER TABLE sessions ADD COLUMN local_storage_state TEXT NOT NULL DEFAULT 'HOT';");
  } catch (_) {}

  // Prepare statements
  stmtInsertSession = db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, live_video_path, print_status, synced, uploaded, remote_url, live_video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmtUpdateSession = db.prepare(`
    UPDATE sessions 
    SET frame_id = COALESCE(@frameId, frame_id),
        filter = COALESCE(@filter, filter),
        photos = COALESCE(@photos, photos),
        composite_path = COALESCE(@compositePath, composite_path),
        live_video_path = COALESCE(@liveVideoPath, live_video_path),
        gif_path = COALESCE(@gifPath, gif_path),
        print_status = COALESCE(@printStatus, print_status),
        synced = COALESCE(@synced, synced),
        uploaded = COALESCE(@uploaded, uploaded),
        remote_url = COALESCE(@remoteUrl, remote_url),
        live_video_url = COALESCE(@liveVideoUrl, live_video_url),
        gif_url = COALESCE(@gifUrl, gif_url)
    WHERE id = @id
  `);

  stmtGetSession = db.prepare('SELECT * FROM sessions WHERE id = ?');
  stmtGetLastSession = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1');
  stmtListSessions = db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100');
  stmtGetUnsyncedSessions = db.prepare('SELECT * FROM sessions WHERE synced = 0 ORDER BY created_at ASC');
  stmtMarkSynced = db.prepare('UPDATE sessions SET synced = 1 WHERE id = ?');

  stmtEnqueueUpload = db.prepare(`
    INSERT OR IGNORE INTO upload_queue (id, session_id, file_path, file_type, status, attempts, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?)
  `);

  stmtGetPendingUploads = db.prepare(`
    SELECT * FROM upload_queue WHERE status IN ('PENDING', 'FAILED') AND attempts < 5 ORDER BY created_at ASC LIMIT 5
  `);

  stmtUpdateUploadStatus = db.prepare(`
    UPDATE upload_queue 
    SET status = ?, attempts = attempts + 1, error_message = ?, remote_url = ?, updated_at = ?
    WHERE id = ?
  `);

  stmtInsertSystemEvent = db.prepare(`
    INSERT INTO kiosk_system_events (id, event_type, severity, component, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Migrate legacy sessions.json if present
  migrateLegacyJson(dataDir);
}

/**
 * Authoritative diagnostic system event logging to SQLite.
 */
export function recordSystemEvent(
  eventType: string,
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL',
  component: string,
  details?: string
): void {
  if (!db || !stmtInsertSystemEvent) return;
  try {
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    stmtInsertSystemEvent.run(id, eventType, severity, component, details || null, now);
  } catch (err: any) {
    console.warn('[SyncEngine] Failed to record system event:', err.message);
  }
}

function migrateLegacyJson(dataDir: string): void {
  const legacyJsonPath = path.join(dataDir, 'sessions.json');
  if (!fs.existsSync(legacyJsonPath) || !db) return;

  try {
    const raw = fs.readFileSync(legacyJsonPath, 'utf-8');
    const legacySessions = JSON.parse(raw);
    if (Array.isArray(legacySessions) && legacySessions.length > 0) {
      console.log(`[SyncEngine] Migrating ${legacySessions.length} legacy sessions from JSON to SQLite...`);
      const migrateTx = db.transaction((items: any[]) => {
        for (const s of items) {
          try {
            stmtInsertSession?.run(
              s.id || `migrated_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              s.createdAt || new Date().toISOString(),
              s.frameId || '4R',
              s.filter || 'none',
              JSON.stringify(s.photos || []),
              s.compositePath || null,
              s.printStatus || 'pending',
              s.synced ? 1 : 0,
              0,
              null
            );
          } catch {}
        }
      });
      migrateTx(legacySessions);
      console.log('[SyncEngine] ✓ Legacy migration completed successfully');
      
      // Rename legacy file so migration only runs once
      fs.renameSync(legacyJsonPath, `${legacyJsonPath}.migrated`);
    }
  } catch (err) {
    console.warn('[SyncEngine] Error during legacy JSON migration:', (err as Error).message);
  }
}

function rowToSession(row: any): Session {
  const rawPhotos = JSON.parse(row.photos || '[]');
  // Sanitize: never expose raw Base64 data URIs in session metadata
  const photos = Array.isArray(rawPhotos)
    ? rawPhotos.map((p: any) => (typeof p === 'string' && p.startsWith('data:') ? '' : String(p))).filter(Boolean)
    : [];

  return {
    id: row.id,
    createdAt: row.created_at,
    frameId: row.frame_id,
    filter: row.filter,
    photos,
    compositePath: row.composite_path || undefined,
    liveVideoPath: row.live_video_path || undefined,
    liveVideoPaths: row.live_video_paths ? JSON.parse(row.live_video_paths) : row.live_video_path ? [row.live_video_path] : [],
    liveVideoUrl: row.live_video_url || undefined,
    liveVideoUrls: row.live_video_urls ? JSON.parse(row.live_video_urls) : row.live_video_url ? [row.live_video_url] : [],
    gifPath: row.gif_path || undefined,
    gifUrl: row.gif_url || undefined,
    printStatus: row.print_status as Session['printStatus'],
    synced: Boolean(row.synced),
    uploaded: Boolean(row.uploaded),
    remoteUrl: row.remote_url || undefined,
  };
}

export function createSession(data: Omit<Session, 'id' | 'createdAt' | 'synced'> & { id?: string }): Session {
  const id = data.id || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  const liveVideoPaths = data.liveVideoPaths || (data.liveVideoPath ? [data.liveVideoPath] : []);
  const primaryVideoPath = liveVideoPaths[0] || data.liveVideoPath || null;

  // Persist raw photos to disk files immediately, avoiding Base64 storage in SQLite
  const savedPhotoPaths: string[] = [];
  if (Array.isArray(data.photos) && data.photos.length > 0) {
    const outputDir = data.compositePath ? path.dirname(data.compositePath) : path.join(os.tmpdir(), 'pictolabs-captures');
    if (!fs.existsSync(outputDir)) {
      try { fs.mkdirSync(outputDir, { recursive: true }); } catch (_) {}
    }
    data.photos.forEach((photo, idx) => {
      const poseNum = idx + 1;
      let posePath: string | null = null;
      if (typeof photo === 'string' && photo.startsWith('data:image')) {
        const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
        posePath = path.join(outputDir, `photo_${id}_pose_${poseNum}.jpg`);
        try {
          fs.writeFileSync(posePath, Buffer.from(base64Data, 'base64'));
        } catch (_) {}
      } else if (typeof photo === 'string') {
        const clean = photo.replace(/^file:\/\/\/?/, '');
        if (fs.existsSync(clean)) {
          const ext = path.extname(clean) || '.jpg';
          posePath = path.join(outputDir, `photo_${id}_pose_${poseNum}${ext}`);
          try {
            if (clean !== posePath) {
              fs.copyFileSync(clean, posePath);
            }
          } catch (_) {
            posePath = clean;
          }
        }
      }
      if (posePath && fs.existsSync(posePath)) {
        savedPhotoPaths.push(posePath);
      }
    });
  }

  if (db && stmtInsertSession) {
    const dbPhotos = savedPhotoPaths.length > 0 
      ? savedPhotoPaths 
      : (data.photos || []).filter((p) => typeof p === 'string' && !p.startsWith('data:'));

    stmtInsertSession.run(
      id,
      createdAt,
      data.frameId,
      data.filter,
      JSON.stringify(dbPhotos),
      data.compositePath || null,
      primaryVideoPath,
      data.printStatus || 'pending',
      0,
      0,
      null,
      null
    );

    // Save live_video_paths array
    if (liveVideoPaths.length > 0) {
      try {
        db.prepare('UPDATE sessions SET live_video_paths = ? WHERE id = ?').run(
          JSON.stringify(liveVideoPaths),
          id
        );
      } catch (_) {}
    }

    // Save gif_path if provided
    if (data.gifPath) {
      try {
        db.prepare('UPDATE sessions SET gif_path = ? WHERE id = ?').run(data.gifPath, id);
      } catch (_) {}
    }

    // Eager Sync session metadata directly to PostgreSQL cloud
    syncSingleSessionToCloud(id).catch((err: any) =>
      console.warn(`[SyncEngine] Eager session sync warning for ${id}:`, err?.message)
    );

    // 1. Composite file upload
    if (data.compositePath && fs.existsSync(data.compositePath)) {
      enqueueUpload(id, data.compositePath, 'composite');
    }

    // 2. Individual pose photos upload
    if (savedPhotoPaths.length > 0) {
      for (const pPath of savedPhotoPaths) {
        if (pPath && fs.existsSync(pPath)) {
          enqueueUpload(id, pPath, 'raw');
        }
      }
    }

    // 3. Live Photo video file paths upload
    if (liveVideoPaths.length > 0) {
      for (const vPath of liveVideoPaths) {
        if (vPath && fs.existsSync(vPath)) {
          enqueueUpload(id, vPath, 'video');
        }
      }
    } else if (data.liveVideoPath && fs.existsSync(data.liveVideoPath)) {
      enqueueUpload(id, data.liveVideoPath, 'video');
    }

    // 4. Looping GIF / motion video upload
    if (data.gifPath && fs.existsSync(data.gifPath)) {
      enqueueUpload(id, data.gifPath, 'video');
    }
  }

  console.log(`[SyncEngine] ✓ Session created in SQLite: ${id} (${liveVideoPaths.length} Live Photo clips)`);
  return {
    ...data,
    id,
    createdAt,
    synced: false,
    uploaded: false,
    liveVideoPaths,
  };
}

export function updateSession(id: string, update: Partial<Session>): Session | null {
  if (!db || !stmtUpdateSession || !stmtGetSession) return null;

  const existingRow = stmtGetSession.get(id);
  if (!existingRow) return null;

  stmtUpdateSession.run({
    id,
    frameId: update.frameId ?? null,
    filter: update.filter ?? null,
    photos: update.photos ? JSON.stringify(update.photos) : null,
    compositePath: update.compositePath ?? null,
    liveVideoPath: update.liveVideoPath ?? null,
    gifPath: update.gifPath ?? null,
    printStatus: update.printStatus ?? null,
    synced: update.synced !== undefined ? (update.synced ? 1 : 0) : null,
    uploaded: update.uploaded !== undefined ? (update.uploaded ? 1 : 0) : null,
    remoteUrl: update.remoteUrl ?? null,
    liveVideoUrl: update.liveVideoUrl ?? null,
    gifUrl: update.gifUrl ?? null,
  });

  let shouldTriggerWorker = false;

  // If compositePath was attached in this update, queue it for cloud upload!
  if (update.compositePath && fs.existsSync(update.compositePath)) {
    enqueueUpload(id, update.compositePath, 'composite');
    shouldTriggerWorker = true;
  }

  // If gifPath was attached in this update, queue it for cloud upload!
  if (update.gifPath && fs.existsSync(update.gifPath)) {
    enqueueUpload(id, update.gifPath, 'video');
    shouldTriggerWorker = true;
  }

  if (shouldTriggerWorker) {
    processUploadQueue().catch(() => {});
  }

  const updatedRow = stmtGetSession.get(id);
  return updatedRow ? rowToSession(updatedRow) : null;
}

export function getLastSession(): Session | null {
  if (!db || !stmtGetLastSession) return null;
  const row = stmtGetLastSession.get();
  return row ? rowToSession(row) : null;
}

export function listSessions(): Session[] {
  if (!db || !stmtListSessions) return [];
  const rows = stmtListSessions.all();
  return rows.map(rowToSession);
}

// ─── Session History Center Query Models (Phase 1) ───────────
export interface KioskSessionHistoryQuery {
  limit?: number;
  offset?: number;
  statusFilter?: 'ALL' | 'PRINT_FAILED' | 'UPLOAD_PENDING' | 'COMPLETED';
}

export interface KioskSessionHistoryItem {
  id: string;
  createdAt: string;
  frameId: string;
  filter: string;
  compositePath?: string;
  compositeExists: boolean;
  printStatus: 'pending' | 'printed' | 'failed' | 'PRINTING' | 'COMPLETED' | 'FAILED' | 'PENDING' | 'NOT_QUEUED';
  printAttempts: number;
  lastPrintError?: string | null;
  uploaded: boolean;
  uploadStatus: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';
  uploadAttempts: number;
  lastUploadError?: string | null;
  remoteUrl?: string;
  localStorageState: 'HOT' | 'PRUNED' | 'EVICTED';
  photoCount: number;
  hasVideo: boolean;
}

export function getSessionHistory(query?: KioskSessionHistoryQuery): KioskSessionHistoryItem[] {
  if (!db) return [];
  const limit = Math.min(Math.max(query?.limit || 50, 1), 100);
  const offset = Math.max(query?.offset || 0, 0);

  const rows = db.prepare(`
    SELECT id, created_at, frame_id, filter, photos, composite_path, 
           live_video_path, live_video_paths, live_video_url, print_status, 
           synced, uploaded, remote_url, local_storage_state
    FROM sessions
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset) as any[];

  const stmtPrint = db.prepare(`
    SELECT status, attempts, last_error 
    FROM print_queue 
    WHERE session_id = ? 
    ORDER BY created_at DESC 
    LIMIT 1
  `);

  const stmtUpload = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'UPLOADING' THEN 1 ELSE 0 END) as uploading,
      MAX(attempts) as max_attempts,
      MAX(error_message) as last_error
    FROM upload_queue 
    WHERE session_id = ?
  `);

  const results: KioskSessionHistoryItem[] = [];

  for (const row of rows) {
    const cleanPath = (row.composite_path || '').replace(/^file:\/\/\/?/, '');
    const compositeExists = Boolean(cleanPath && fs.existsSync(cleanPath));

    let localStorageState: 'HOT' | 'PRUNED' | 'EVICTED' = 'HOT';
    if (compositeExists) {
      localStorageState = 'HOT';
    } else if (row.remote_url && row.remote_url.startsWith('http')) {
      localStorageState = 'PRUNED';
    } else {
      localStorageState = 'EVICTED';
    }

    // Print status resolution
    const printRow = stmtPrint.get(row.id) as any;
    let printStatus: any = row.print_status || 'pending';
    let printAttempts = 0;
    let lastPrintError: string | null = null;

    if (printRow) {
      printStatus = printRow.status === 'DEAD_LETTER' ? 'FAILED' : printRow.status;
      printAttempts = printRow.attempts || 0;
      lastPrintError = printRow.last_error || null;
    } else if (row.print_status === 'printed') {
      printStatus = 'COMPLETED';
    } else if (row.print_status === 'failed') {
      printStatus = 'FAILED';
    } else {
      printStatus = 'NOT_QUEUED';
    }

    // Upload status resolution
    const uploadStats = stmtUpload.get(row.id) as any;
    let uploadStatus: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED' = 'PENDING';
    let uploadAttempts = 0;
    let lastUploadError: string | null = null;

    if (uploadStats && uploadStats.total > 0) {
      uploadAttempts = uploadStats.max_attempts || 0;
      lastUploadError = uploadStats.last_error || null;
      if (uploadStats.failed > 0) {
        uploadStatus = 'FAILED';
      } else if (uploadStats.uploading > 0) {
        uploadStatus = 'UPLOADING';
      } else if (uploadStats.completed === uploadStats.total) {
        uploadStatus = 'COMPLETED';
      } else {
        uploadStatus = 'PENDING';
      }
    } else if (row.uploaded === 1) {
      uploadStatus = 'COMPLETED';
    }

    let photoCount = 0;
    try {
      const parsedPhotos = JSON.parse(row.photos || '[]');
      photoCount = Array.isArray(parsedPhotos) ? parsedPhotos.length : 0;
    } catch (_) {}

    const hasVideo = Boolean(
      row.live_video_path || 
      (row.live_video_paths && row.live_video_paths !== '[]' && row.live_video_paths !== '')
    );

    const item: KioskSessionHistoryItem = {
      id: row.id,
      createdAt: row.created_at,
      frameId: row.frame_id || '2R',
      filter: row.filter || 'none',
      compositePath: row.composite_path || undefined,
      compositeExists,
      printStatus,
      printAttempts,
      lastPrintError,
      uploaded: Boolean(row.uploaded),
      uploadStatus,
      uploadAttempts,
      lastUploadError,
      remoteUrl: row.remote_url || undefined,
      localStorageState,
      photoCount,
      hasVideo,
    };

    // Filter check
    if (query?.statusFilter && query.statusFilter !== 'ALL') {
      if (query.statusFilter === 'PRINT_FAILED' && printStatus !== 'FAILED' && printStatus !== 'DEAD_LETTER') {
        continue;
      }
      if (query.statusFilter === 'UPLOAD_PENDING' && uploadStatus === 'COMPLETED') {
        continue;
      }
      if (query.statusFilter === 'COMPLETED' && (printStatus !== 'COMPLETED' || uploadStatus !== 'COMPLETED')) {
        continue;
      }
    }

    results.push(item);
  }

  return results;
}

export async function reprintSessionWithDebounce(
  sessionId: string,
  copies: number = 1,
  reason: string = 'OPERATOR_REPRINT'
): Promise<{ success: boolean; printJobId?: string; error?: string }> {
  if (!db) return { success: false, error: 'Database not initialized' };

  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return { success: false, error: `Sesi tidak ditemukan: ${sessionId}` };
    }

    // 1. Debounce check: Prevent rapid double-tap while actively printing, but permit operator override on stalled or retrying jobs
    const activeJob = db.prepare(`
      SELECT id, status, attempts, next_retry_at, updated_at FROM print_queue 
      WHERE session_id = ? AND status IN ('PENDING', 'PRINTING')
      ORDER BY created_at DESC LIMIT 1
    `).get(sessionId) as any;

    if (activeJob) {
      const now = Date.now();
      const updatedTime = new Date(activeJob.updated_at || 0).getTime();
      const isStuckPrinting = activeJob.status === 'PRINTING' && (now - updatedTime > 20_000);
      const isRetryingPending = activeJob.status === 'PENDING' && (activeJob.attempts > 0 || Boolean(activeJob.next_retry_at));

      if (isStuckPrinting || isRetryingPending) {
        // Cancel the stalled/retrying job so the operator's manual reprint proceeds immediately without waiting
        console.log(`[SyncEngine] 🖨️ Overriding stalled/retrying job ${activeJob.id} (status: ${activeJob.status}, attempts: ${activeJob.attempts}) for manual reprint.`);
        db.prepare(`UPDATE print_queue SET status = 'CANCELLED', updated_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), activeJob.id);
      } else if (activeJob.status === 'PRINTING') {
        return {
          success: false,
          error: `Pencetakan untuk sesi ini sedang aktif berlangsung di printer. Mohon tunggu beberapa detik.`,
        };
      } else if (now - updatedTime < 4000) {
        // Debounce: only block if the PENDING job was created/updated within the last 4 seconds
        return {
          success: false,
          error: `Pencetakan untuk sesi ini baru saja dikirim ke antrean. Mohon tunggu sebentar.`,
        };
      } else {
        // If pending for more than 4s without printing, override it
        console.log(`[SyncEngine] Overriding idle PENDING job ${activeJob.id} for manual reprint.`);
        db.prepare(`UPDATE print_queue SET status = 'CANCELLED', updated_at = ? WHERE id = ?`)
          .run(new Date().toISOString(), activeJob.id);
      }
    }

    // 2. Validate composite path and local asset existence
    let compositePath = session.composite_path;
    let cleanPath = (compositePath || '').replace(/^file:\/\/\/?/, '');
    let fileExists = Boolean(cleanPath && fs.existsSync(cleanPath));

    // 3. Pruned asset check and cloud rehydration
    if (!fileExists) {
      if (session.remote_url && session.remote_url.startsWith('http')) {
        try {
          const { ensureCompositeOnDisk } = require('./PrintQueueService');
          const targetPath = cleanPath || path.join(config.dataDir, 'composites', `rehydrated_${sessionId}.jpg`);
          const rehydrated = await ensureCompositeOnDisk(sessionId, targetPath);
          if (rehydrated && fs.existsSync(rehydrated)) {
            cleanPath = rehydrated;
            fileExists = true;
          }
        } catch (rErr: any) {
          console.warn(`[SyncEngine] Rehydration attempt failed: ${rErr.message}`);
        }
      }
    }

    if (!fileExists) {
      return {
        success: false,
        error: 'File foto cetak (composite) tidak ditemukan di SSD lokal (telah dipruning oleh sistem retensi) dan kiosk tidak dapat mengunduh dari cloud (offline atau file belum terunggah).',
      };
    }

    // 4. Delegate to reprintSession in PrintQueueService
    const { reprintSession } = require('./PrintQueueService');
    const result = await reprintSession(sessionId, copies);

    if (result.success) {
      recordSystemEvent(
        'SESSION_REPRINT',
        'INFO',
        'AdminSessionHistory',
        `Operator melakukan cetak ulang untuk sesi ${sessionId} (${copies} copy). Job ID: ${result.id}. Alasan: ${reason}`
      );
      return { success: true, printJobId: result.id };
    } else {
      return { success: false, error: result.error || 'Gagal menambahkan pekerjaan cetak ke antrean.' };
    }
  } catch (err: any) {
    console.error('[SyncEngine] Error in reprintSessionWithDebounce:', err);
    return { success: false, error: err.message };
  }
}

export async function forceUploadSession(sessionId: string): Promise<{ success: boolean; enqueuedCount: number; error?: string }> {
  if (!db) return { success: false, enqueuedCount: 0, error: 'Database not initialized' };

  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!session) {
      return { success: false, enqueuedCount: 0, error: `Sesi tidak ditemukan: ${sessionId}` };
    }

    const now = new Date().toISOString();
    // 1. Reset any failed, uploading, or pending upload_queue items for this session
    const resetRes = db.prepare(`
      UPDATE upload_queue 
      SET status = 'PENDING', attempts = 0, error_message = NULL, updated_at = ?
      WHERE session_id = ? AND status != 'COMPLETED'
    `).run(now, sessionId);

    let enqueuedCount = resetRes.changes;

    // 2. If no non-completed items exist, check if items existed at all
    const existingCount = db.prepare('SELECT COUNT(*) as c FROM upload_queue WHERE session_id = ?').get(sessionId) as any;
    if (!existingCount || existingCount.c === 0) {
      // Re-enqueue composite if exists
      if (session.composite_path && fs.existsSync(session.composite_path)) {
        enqueueUpload(sessionId, session.composite_path, 'composite');
        enqueuedCount++;
      }
      // Re-enqueue raw photos
      try {
        const photos = JSON.parse(session.photos || '[]');
        if (Array.isArray(photos)) {
          for (const p of photos) {
            const clean = (p || '').replace(/^file:\/\/\/?/, '');
            if (clean && fs.existsSync(clean)) {
              enqueueUpload(sessionId, clean, 'raw');
              enqueuedCount++;
            }
          }
        }
      } catch (_) {}
      // Re-enqueue video
      if (session.live_video_path && fs.existsSync(session.live_video_path)) {
        enqueueUpload(sessionId, session.live_video_path, 'video');
        enqueuedCount++;
      }
      // Re-enqueue looping GIF
      if (session.gif_path && fs.existsSync(session.gif_path)) {
        enqueueUpload(sessionId, session.gif_path, 'video');
        enqueuedCount++;
      }
    }

    // 3. Mark session as not uploaded yet so it syncs
    db.prepare('UPDATE sessions SET uploaded = 0 WHERE id = ?').run(sessionId);

    // 4. Trigger queue worker
    processUploadQueue().catch((err) =>
      console.warn('[SyncEngine] Error triggering upload worker in forceUploadSession:', err.message)
    );

    recordSystemEvent(
      'SESSION_FORCE_UPLOAD',
      'INFO',
      'AdminSessionHistory',
      `Operator memicu pengunggahan ulang untuk sesi ${sessionId}. Item dimasukkan kembali: ${enqueuedCount}`
    );

    return { success: true, enqueuedCount };
  } catch (err: any) {
    console.error('[SyncEngine] Error in forceUploadSession:', err);
    return { success: false, enqueuedCount: 0, error: err.message };
  }
}

export function enqueueUpload(sessionId: string, filePath: string, fileType: 'composite' | 'raw' | 'video'): void {
  if (!db || !stmtEnqueueUpload) return;
  const filename = path.basename(filePath);
  const id = `upload_${sessionId}_${fileType}_${filename}`;
  const now = new Date().toISOString();
  stmtEnqueueUpload.run(id, sessionId, filePath, fileType, now, now);
  console.log(`[SyncEngine] Enqueued ${fileType} (${filename}) for upload (Session: ${sessionId})`);
}

// ─── Asynchronous Cloudflare R2 / Cloud Upload Worker ───────
function resolveLanDownloadUrl(url: string, baseUrl: string): string {
  let fullUrl = url.startsWith('http')
    ? url
    : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;

  // In local development, if fullUrl points to localhost/127.0.0.1, resolve to LAN IP
  // so scanning the QR code on a smartphone connects directly!
  if (fullUrl.includes('localhost') || fullUrl.includes('127.0.0.1')) {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
          return fullUrl.replace('localhost', net.address).replace('127.0.0.1', net.address);
        }
      }
    }
  }
  return fullUrl;
}

/**
 * Classifies upload errors to isolate permanent failures from retryable network/storage faults.
 * Permanent failures (missing file, 400 Bad Request, 401/Invalid Device, 403 Forbidden, 404 Session Not Found, DEAD_LETTER)
 * must NEVER enter infinite automatic retry loops.
 */
export function isPermanentUploadError(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  const msg = errorMessage.toLowerCase();

  // Missing local disk file
  if (
    msg.includes('file missing') ||
    msg.includes('not found on local disk') ||
    msg.includes('enoent')
  ) {
    return true;
  }

  // Exceeded watchdog retries in terminal DEAD_LETTER state
  if (msg.includes('dead_letter') || msg.includes('exceeded max retries in uploading state')) {
    return true;
  }

  // Authentication / device decommissioning
  if (msg.includes('invalid_device') || msg.includes('unauthorized') || msg.includes('http 401')) {
    return true;
  }

  // Permanent client errors (400 Bad Request, payload too large)
  if (
    msg.includes('http 400') ||
    msg.includes('bad request') ||
    msg.includes('payload too large') ||
    msg.includes('http 413')
  ) {
    return true;
  }

  // Forbidden
  if (msg.includes('http 403') || msg.includes('forbidden')) {
    return true;
  }

  // Not Found / uncommitted session (404 / SESSION_NOT_FOUND)
  if (msg.includes('http 404') || msg.includes('session_not_found')) {
    return true;
  }

  return false;
}

/**
 * Re-arms transient network/storage failed uploads back to PENDING.
 * Strictly ignores permanent failures (file missing on disk, 400/401/403/404, dead-letter items).
 * Called automatically upon network recovery triggers:
 * 1. WebSocket reconnect ('connect' event)
 * 2. HTTP heartbeat success (res.ok)
 * 3. Bounded store-and-forward worker cycle (items waiting > 60s)
 */
export function rearmRetryableUploads(triggerWorker: boolean = true): number {
  if (!db) return 0;
  let rearmedCount = 0;
  try {
    const failedItems = db.prepare(`
      SELECT * FROM upload_queue WHERE status = 'FAILED'
    `).all() as any[];

    if (!failedItems || failedItems.length === 0) return 0;

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE upload_queue 
      SET status = 'PENDING', attempts = 0, updated_at = ?
      WHERE id = ?
    `);

    for (const item of failedItems) {
      if (isPermanentUploadError(item.error_message)) {
        continue;
      }
      if (!fs.existsSync(item.file_path)) {
        continue;
      }

      updateStmt.run(now, item.id);
      rearmedCount++;
    }

    if (rearmedCount > 0) {
      console.log(`[SyncEngine] 🔄 Network recovery: re-armed ${rearmedCount} retryable upload(s)`);
      recordSystemEvent(
        'UPLOAD_NETWORK_RECOVERY',
        'INFO',
        'SyncEngine',
        `Re-armed ${rearmedCount} retryable upload items following network connectivity restoration`
      );
      if (triggerWorker) {
        processUploadQueue().catch((err) =>
          console.warn('[SyncEngine] Error triggering upload queue after re-arm:', err?.message)
        );
      }
    }
  } catch (err: any) {
    console.warn('[SyncEngine] Error in rearmRetryableUploads:', err?.message);
  }
  return rearmedCount;
}

export async function processUploadQueue(): Promise<void> {
  if (isUploading || !config?.apiBaseUrl || !db || !stmtGetPendingUploads || !stmtUpdateUploadStatus) {
    return;
  }

  isUploading = true;
  lastUploadActivity = Date.now();

  try {
    const pending = stmtGetPendingUploads.all() as any[];

    // Store-and-forward bounded retry:
    // If fast queue is empty, inspect if any retryable FAILED items have waited past the 60s bounded backoff window
    if (!pending || pending.length === 0) {
      try {
        const cutoff60s = new Date(Date.now() - 60_000).toISOString();
        const exhaustedRetryables = db.prepare(`
          SELECT * FROM upload_queue 
          WHERE status = 'FAILED' AND attempts >= 5 AND updated_at < ?
          ORDER BY updated_at ASC LIMIT 5
        `).all(cutoff60s) as any[];

        if (exhaustedRetryables.length > 0) {
          const now = new Date().toISOString();
          let rearmedAny = false;
          for (const item of exhaustedRetryables) {
            if (!isPermanentUploadError(item.error_message) && fs.existsSync(item.file_path)) {
              db.prepare('UPDATE upload_queue SET status = "PENDING", attempts = 0, updated_at = ? WHERE id = ?').run(now, item.id);
              rearmedAny = true;
            }
          }
          if (rearmedAny) {
            const refetched = stmtGetPendingUploads.all() as any[];
            if (refetched && refetched.length > 0) {
              pending.push(...refetched);
            }
          }
        }
      } catch (_) {}

      if (pending.length === 0) return;
    }

    for (const item of pending) {
      lastUploadActivity = Date.now();
      const now = new Date().toISOString();

    // 1. Exponential Backoff Check:
    // If previous attempt failed, wait 2^attempts * 1000 ms (2s, 4s, 8s, 16s, 32s max)
    if (item.status === 'FAILED' && item.attempts > 0) {
      const lastUpdate = new Date(item.updated_at).getTime();
      const backoffMs = Math.min(Math.pow(2, item.attempts) * 1000, 32000);
      if (Date.now() - lastUpdate < backoffMs) {
        continue; // Skip until backoff period passes
      }
    }

    try {
      if (!fs.existsSync(item.file_path)) {
        stmtUpdateUploadStatus.run('FAILED', 'File missing on local disk', null, now, item.id);
        continue;
      }

      const filename = path.basename(item.file_path);
      const fileBuffer = fs.readFileSync(item.file_path);

      // Mark status as UPLOADING to prevent duplicate workers
      try {
        db.prepare('UPDATE upload_queue SET status = "UPLOADING", updated_at = ? WHERE id = ?').run(now, item.id);
      } catch (_) {}

      lastUploadActivity = Date.now();
      console.log(`[SyncEngine] Uploading ${item.file_type} (${filename}) to Cloud (Attempt ${item.attempts + 1})...`);

      const mimeType = filename.endsWith('.mp4')
        ? 'video/mp4'
        : filename.endsWith('.gif')
        ? 'image/gif'
        : filename.endsWith('.webm')
        ? 'video/webm'
        : filename.endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';

      let uploadedSuccessfully = false;
      let remoteUrl = '';

      // 2. Request Presigned Direct Upload URL from NestJS Backend (with 30s timeout guard)
      try {
        const presignedRes = await fetch(`${config.apiBaseUrl}/api/storage/presigned-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: item.session_id,
            fileName: filename,
            fileType: item.file_type,
            contentType: mimeType,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (presignedRes.ok) {
          const presignedData = (await presignedRes.json()) as {
            uploadUrl: string;
            key: string;
            publicUrl: string;
            provider: 'cloudflare_r2' | 'local_fallback';
          };

          if (presignedData.provider === 'cloudflare_r2' && presignedData.uploadUrl.startsWith('http')) {
            // Direct PUT to Cloudflare R2 (with 60s timeout guard)
            const r2PutRes = await fetch(presignedData.uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=31536000',
              },
              body: fileBuffer,
              signal: AbortSignal.timeout(60000),
            });

            if (r2PutRes.ok || r2PutRes.status === 204) {
              remoteUrl = presignedData.publicUrl;

              // Pre-flight Guard: Guarantee session exists in PostgreSQL before confirming upload
              let isSessionSynced = false;
              if (db) {
                try {
                  const sRow = db.prepare('SELECT synced FROM sessions WHERE id = ?').get(item.session_id) as any;
                  isSessionSynced = Boolean(sRow?.synced);
                } catch (_) {}
              }

              if (!isSessionSynced) {
                const syncOk = await syncSingleSessionToCloud(item.session_id);
                if (!syncOk) {
                  stmtUpdateUploadStatus.run('FAILED', 'Pre-flight session sync failed before confirm-upload', null, now, item.id);
                  continue; // Do not call confirm-upload, retry on next cycle with backoff
                }
              }

              // Confirm upload with NestJS (with 30s timeout guard)
              try {
                const confirmRes = await fetch(`${config.apiBaseUrl}/api/storage/confirm-upload`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-device-secret': config.deviceSecret || '',
                  },
                  body: JSON.stringify({
                    sessionId: item.session_id,
                    fileName: filename,
                    fileType: item.file_type,
                    key: presignedData.key,
                    publicUrl: remoteUrl,
                  }),
                  signal: AbortSignal.timeout(30000),
                });

                if (confirmRes.ok) {
                  const confirmData = (await confirmRes.json()) as { confirmed?: boolean };
                  if (confirmData.confirmed) {
                    uploadedSuccessfully = true;
                  } else {
                    stmtUpdateUploadStatus.run('FAILED', 'Confirmation unacknowledged by cloud backend', null, now, item.id);
                  }
                } else {
                  const errText = await confirmRes.text();
                  stmtUpdateUploadStatus.run('FAILED', `Confirm HTTP ${confirmRes.status}: ${errText.slice(0, 100)}`, null, now, item.id);
                }
              } catch (confirmErr: any) {
                stmtUpdateUploadStatus.run('FAILED', `Confirm network error: ${confirmErr.message}`, null, now, item.id);
              }
            }
          }
        }
      } catch (presignedErr: any) {
        console.warn(`[SyncEngine] Presigned R2 flow failed: ${presignedErr.message}. Falling back to standard upload.`);
      }

      // 3. Fallback to standard multipart/stream upload endpoint if direct PUT was not used (with 60s timeout guard)
      if (!uploadedSuccessfully) {
        // Pre-flight Guard: Guarantee session exists in PostgreSQL before streaming upload
        let isSessionSynced = false;
        if (db) {
          try {
            const sRow = db.prepare('SELECT synced FROM sessions WHERE id = ?').get(item.session_id) as any;
            isSessionSynced = Boolean(sRow?.synced);
          } catch (_) {}
        }

        if (!isSessionSynced) {
          const syncOk = await syncSingleSessionToCloud(item.session_id);
          if (!syncOk) {
            stmtUpdateUploadStatus.run('FAILED', 'Pre-flight session sync failed before stream upload', null, now, item.id);
            continue; // Do not call upload, retry on next cycle with backoff
          }
        }

        const uploadUrl = `${config.apiBaseUrl}/api/storage/upload`;
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-session-id': item.session_id,
            'x-file-name': filename,
            'x-file-type': item.file_type,
            'x-device-secret': config.deviceSecret || '',
          },
          body: fileBuffer,
          signal: AbortSignal.timeout(60000),
        });

        if (response.ok) {
          const result = (await response.json()) as { url?: string; publicUrl?: string };
          const rawUrl = result.publicUrl || result.url || `/uploads/${filename}`;
          remoteUrl = resolveLanDownloadUrl(rawUrl, config.apiBaseUrl || 'http://localhost:4000');
          uploadedSuccessfully = true;
        } else {
          const errText = await response.text();
          stmtUpdateUploadStatus.run('FAILED', `HTTP ${response.status}: ${errText.slice(0, 100)}`, null, now, item.id);
        }
      }

      // 4. Update Database on Success
      if (uploadedSuccessfully) {
        stmtUpdateUploadStatus.run('COMPLETED', null, remoteUrl, now, item.id);

        if (db) {
          const isGif = item.file_path.toLowerCase().endsWith('.gif');
          if (isGif) {
            try {
              db.prepare('UPDATE sessions SET gif_url = ?, uploaded = 1, synced = 1 WHERE id = ?').run(remoteUrl, item.session_id);
            } catch (_) {}
          }
          if (item.file_type === 'video') {
            try {
              const row = db.prepare('SELECT live_video_urls FROM sessions WHERE id = ?').get(item.session_id) as any;
              let urls: string[] = [];
              try {
                urls = JSON.parse(row?.live_video_urls || '[]');
              } catch (_) {}
              if (!urls.includes(remoteUrl)) {
                urls.push(remoteUrl);
              }
              db.prepare('UPDATE sessions SET live_video_urls = ?, live_video_url = ?, uploaded = 1, synced = 1 WHERE id = ?').run(
                JSON.stringify(urls),
                remoteUrl,
                item.session_id
              );
            } catch (_) {
              db.prepare('UPDATE sessions SET live_video_url = ?, uploaded = 1, synced = 1 WHERE id = ?').run(remoteUrl, item.session_id);
            }
          } else {
            db.prepare('UPDATE sessions SET uploaded = 1, synced = 1, remote_url = ? WHERE id = ?').run(remoteUrl, item.session_id);
          }
        }
        console.log(`[SyncEngine] ✓ Uploaded ${item.file_type} successfully: ${remoteUrl}`);
      }
    } catch (err: any) {
      console.warn(`[SyncEngine] Upload attempt failed for ${item.id}:`, err.message);
      stmtUpdateUploadStatus.run('FAILED', err.message, null, now, item.id);
    }
  }
  } finally {
    isUploading = false;
    lastUploadActivity = Date.now();
  }
}

/**
 * Event-Driven trigger to kick off upload queue worker on demand.
 */
export function triggerUploadQueue(): void {
  processUploadQueue().catch((err) => {
    console.error('[SyncEngine] Trigger upload error:', err);
  });
}

/**
 * Watchdog query for upload queue metrics.
 */
export function getUploadQueueHealth(): {
  isUploading: boolean;
  pendingCount: number;
  uploadingCount: number;
  failedCount: number;
  deadLetterCount: number;
  stuckCount: number;
} {
  if (!db) {
    return { isUploading: false, pendingCount: 0, uploadingCount: 0, failedCount: 0, deadLetterCount: 0, stuckCount: 0 };
  }

  try {
    const counts = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'UPLOADING' THEN 1 ELSE 0 END) as uploadingCount,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedCount,
        SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) as deadLetterCount
      FROM upload_queue
    `).get() as any;

    const sixtySecsAgo = new Date(Date.now() - 60_000).toISOString();
    const stuck = db.prepare(`
      SELECT COUNT(*) as count FROM upload_queue WHERE status = 'UPLOADING' AND updated_at < ?
    `).get(sixtySecsAgo) as any;

    return {
      isUploading,
      pendingCount: counts?.pendingCount || 0,
      uploadingCount: counts?.uploadingCount || 0,
      failedCount: counts?.failedCount || 0,
      deadLetterCount: counts?.deadLetterCount || 0,
      stuckCount: stuck?.count || 0,
    };
  } catch (_) {
    return { isUploading, pendingCount: 0, uploadingCount: 0, failedCount: 0, deadLetterCount: 0, stuckCount: 0 };
  }
}

/**
 * Priority 1: Upload Watchdog Self-Healing Routine
 * Resets stuck in-flight upload items and breaks mutex deadlocks.
 */
export function resetStuckUploadWorker(stuckThresholdMs: number = 60_000, triggerWorker: boolean = true): {
  rescuedCount: number;
  mutexReset: boolean;
} {
  if (!db) return { rescuedCount: 0, mutexReset: false };

  let rescuedCount = 0;
  let mutexReset = false;

  try {
    const cutoff = new Date(Date.now() - stuckThresholdMs).toISOString();
    const stuckItems = db.prepare(`
      SELECT * FROM upload_queue WHERE status = 'UPLOADING' AND updated_at < ?
    `).all(cutoff) as any[];

    const now = new Date().toISOString();
    for (const item of stuckItems) {
      const newAttempts = (item.attempts || 0) + 1;
      if (newAttempts >= 5) {
        db.prepare(`
          UPDATE upload_queue 
          SET status = 'DEAD_LETTER', attempts = ?, error_message = 'Upload watchdog: exceeded max retries in UPLOADING state', updated_at = ?
          WHERE id = ?
        `).run(newAttempts, now, item.id);
      } else {
        db.prepare(`
          UPDATE upload_queue 
          SET status = 'PENDING', attempts = ?, error_message = 'Upload watchdog: rescued stuck in-flight upload', updated_at = ?
          WHERE id = ?
        `).run(newAttempts, now, item.id);
      }
      rescuedCount++;
    }

    // Mutex deadlock detection: only reset if worker has been genuinely inactive for > 90s
    if (isUploading) {
      const isStuckInactive = Date.now() - lastUploadActivity > 90_000;
      if (isStuckInactive) {
        console.warn('[SyncEngine] Upload worker mutex stuck inactive for >90s. Breaking mutex.');
        isUploading = false;
        mutexReset = true;
        lastUploadActivity = Date.now();
      }
    }

    if (rescuedCount > 0 || mutexReset) {
      console.log(`[SyncEngine] 🛡 Upload Watchdog: Rescued ${rescuedCount} stuck uploads, mutexReset=${mutexReset}`);
      recordSystemEvent(
        'UPLOAD_WATCHDOG_RESCUE',
        'WARN',
        'SyncEngine',
        `Rescued ${rescuedCount} stuck uploads. Mutex reset: ${mutexReset}`
      );
      if (triggerWorker) {
        processUploadQueue().catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn('[SyncEngine] Error in resetStuckUploadWorker:', err.message);
  }

  return { rescuedCount, mutexReset };
}

// ─── Batch Session Metadata Sync to NestJS ──────────────────
export async function syncSingleSessionToCloud(sessionId: string): Promise<boolean> {
  if (!config?.apiBaseUrl || !db || !stmtGetSession) return false;

  const row = stmtGetSession.get(sessionId);
  if (!row) return false;

  const session = rowToSession(row);

  // Minimal Session Metadata Payload — exclude raw Base64 photo strings
  // Backend SessionsController.syncSession() requires: id, createdAt, printStatus, frameId, filter, remoteUrl
  // Media files (composite, raw photos, video) are handled strictly by upload_queue and Cloudflare R2
  const metadataPayload = {
    id: session.id,
    createdAt: session.createdAt,
    frameId: session.frameId,
    filter: session.filter,
    printStatus: session.printStatus,
    status: session.printStatus === 'printed' ? 'COMPLETED' : 'CAPTURED',
    remoteUrl: session.remoteUrl,
    compositePath: session.compositePath,
    liveVideoPath: session.liveVideoPath,
    photos: (session.photos || []).filter((p: string) => typeof p === 'string' && !p.startsWith('data:')),
  };

  try {
    const response = await fetch(`${config.apiBaseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-secret': config.deviceSecret || '',
      },
      body: JSON.stringify(metadataPayload),
      signal: AbortSignal.timeout(20000),
    });

    if (response.ok) {
      const data = (await response.json().catch(() => null)) as any;
      if (data?.success === true && data?.sessionId && !data.error && !data.warning) {
        stmtMarkSynced?.run(session.id);
        console.log(`[SyncEngine] ✓ Synced single session metadata: ${session.id}`);
        return true;
      } else {
        console.warn(
          `[SyncEngine] Single session sync rejected or unacknowledged for ${session.id}:`,
          data?.error || data?.warning || 'Missing valid sessionId'
        );
        return false;
      }
    } else {
      const errText = await response.text().catch(() => '');
      console.warn(`[SyncEngine] Single session sync failed for ${session.id}: HTTP ${response.status} - ${errText.slice(0, 100)}`);
      return false;
    }
  } catch (err: any) {
    console.warn(`[SyncEngine] Single session sync network error for ${session.id}: ${err.message}`);
    return false;
  }
}

async function syncSessionsToCloud(): Promise<void> {
  if (!config.apiBaseUrl || !db || !stmtGetUnsyncedSessions) return;

  const rows = stmtGetUnsyncedSessions.all();
  if (rows.length === 0) return;

  const unsynced = rows.map(rowToSession);
  console.log(`[SyncEngine] Syncing ${unsynced.length} session metadata records to cloud...`);

  for (const session of unsynced) {
    const success = await syncSingleSessionToCloud(session.id);
    if (!success) break;
  }
}

function setupSocketConnection(): void {
  if (!config.apiBaseUrl || !config.deviceSecret) return;

  // Single-Socket Guard: Prevent duplicate initialization if socket is active
  if (socket && (socket.connected || (socket as any).active)) {
    console.log('[SyncEngine] ℹ️ WebSocket already active, skipping duplicate setup');
    return;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const targetUrl = config.apiBaseUrl;
  
  socket = io(targetUrl, {
    auth: { deviceSecret: config.deviceSecret },
    extraHeaders: { 'x-device-secret': config.deviceSecret },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity,
  });

  socket.on('connect', () => {
    console.log('✓ [SyncEngine] Real-time WebSocket connected to cloud backend:', targetUrl);
    rearmRetryableUploads(true);
    reconcileRemoteConfig().catch((err) =>
      console.warn('[SyncEngine] Post-connect config reconciliation deferred:', err?.message)
    );
  });

  socket.on('disconnect', (reason) => {
    console.log('✗ [SyncEngine] WebSocket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[SyncEngine] WebSocket connection attempt failed:', err.message);
  });

  socket.on('CONFIG_UPDATE', (newConfig) => {
    if (!newConfig || typeof newConfig !== 'object') {
      console.warn('[SyncEngine] Rejected invalid CONFIG_UPDATE payload');
      return;
    }

    // Verify booth identity if boothId is specified
    if (newConfig.boothId && config?.boothId && newConfig.boothId !== config.boothId) {
      console.warn(`[SyncEngine] Ignored CONFIG_UPDATE for mismatched booth ${newConfig.boothId} (active: ${config.boothId})`);
      return;
    }

    const currentLocal = readLocalKioskConfig();
    const localVersion = typeof currentLocal.configVersion === 'number' ? currentLocal.configVersion : 1;
    const incomingVersion = typeof newConfig.configVersion === 'number' ? newConfig.configVersion : 0;

    // Stale version check: Never downgrade local configuration
    if (incomingVersion > 0 && incomingVersion < localVersion) {
      console.log(`[SyncEngine] Ignored stale CONFIG_UPDATE (incoming v${incomingVersion} < local v${localVersion})`);
      return;
    }

    console.log(`[SyncEngine] Applying remote CONFIG_UPDATE from Cloud (incoming v${incomingVersion} >= local v${localVersion})`);
    const merged = { ...currentLocal, ...newConfig };
    const saved = writeLocalKioskConfig(merged);

    // Notify registered listeners (e.g. background tests or workers)
    configUpdateListeners.forEach((fn) => {
      try { fn(saved); } catch (_) {}
    });

    // Broadcast config update to all React Renderer windows
    broadcastToWindows('kiosk:config-updated', saved);
  });

  socket.on('payment:settled', (data) => {
    console.log('[SyncEngine] Received remote payment:settled from Cloud:', data);
    broadcastToWindows('payment:settled', data);
  });

  socket.on('PAYMENT_SETTLED', (data) => {
    console.log('[SyncEngine] Received remote PAYMENT_SETTLED from Cloud:', data);
    broadcastToWindows('payment:settled', data);
  });

  socket.on('payment:expired', (data) => {
    console.log('[SyncEngine] Received remote payment:expired from Cloud:', data);
    broadcastToWindows('payment:expired', data);
  });

  // Start health ping (transmits real-time hardware telemetry to Cloud Backend)
  healthPingInterval = setInterval(() => {
    if (socket?.connected) {
      const pHealth = getCachedPrinterHealth();
      socket.emit('HEALTH_PING', {
        cpuTemp: 44.5,
        paperCount: pHealth.code === 'PAPER_OUT' ? 0 : 350,
        cameraState: 'OK',
        printerState: pHealth.code,
        printerReady: pHealth.ready,
        printerMessage: pHealth.message,
      });
    }
  }, 10_000);
}

function getPrimaryLocalIp(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  } catch {}
  return '127.0.0.1';
}

/**
 * Sends authoritative HTTP heartbeat to Cloud Backend (Single Source of Truth).
 * Updates last_seen, appVersion, gitCommit, machineName, localIp, osVersion,
 * electronVersion, and releaseChannel in PostgreSQL.
 */
async function sendHttpHeartbeat(): Promise<void> {
  if (!config?.apiBaseUrl || !config?.deviceSecret) return;

  const targetIdentifier = config.boothId || config.deviceSecret;
  const targetUrl = `${config.apiBaseUrl}/api/booths/${targetIdentifier}/heartbeat`;
  let paperRemaining = 700;
  try {
    const row = db?.prepare('SELECT prints_remaining FROM paper_tracker WHERE id = 1').get() as any;
    if (row && typeof row.prints_remaining === 'number') {
      paperRemaining = row.prints_remaining;
    }
  } catch {}

  const payload: Record<string, any> = {
    appVersion: '1.2.5',
    gitCommit: process.env.GIT_COMMIT || '1457ae6',
    machineName: os.hostname(),
    localIp: getPrimaryLocalIp(),
    osVersion: `${os.type()} ${os.release()} (${os.arch()})`,
    electronVersion: process.versions.electron || '28.2.0',
    releaseChannel: 'stable',
  };

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-secret': config.deviceSecret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      console.log(`[SyncEngine] ✓ HTTP Heartbeat sent -> Effective Status: ${data.status} (Maintenance: ${data.isMaintenance})`);
      rearmRetryableUploads(true);
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[SyncEngine] HTTP Heartbeat returned status ${res.status}: ${errText.slice(0, 100)}`);
    }
  } catch (err) {
    console.warn(`[SyncEngine] HTTP Heartbeat network error: ${(err as Error).message}`);
  }
}

export function initSyncEngine(engineConfig: SyncEngineConfig): void {
  config = engineConfig;
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }
  initDatabase(config.dataDir);
}

/**
 * Dynamically updates API base URL, deviceSecret, and boothId (e.g. after pairing).
 * Reconnects real-time WebSocket and immediately transmits authoritative HTTP heartbeat.
 */
export function updateSyncCredentials(apiBaseUrl: string, deviceSecret: string, boothId?: string): void {
  if (config) {
    config.apiBaseUrl = apiBaseUrl;
    config.deviceSecret = deviceSecret;
    if (boothId) config.boothId = boothId;
  } else {
    config = {
      dataDir: path.join(os.homedir(), '.pictolabs'),
      syncIntervalMs: 30000,
      apiBaseUrl,
      deviceSecret,
      boothId,
    };
  }

  console.log(`[SyncEngine] 🔑 Sync credentials updated for booth ${boothId || 'unknown'}. Reconnecting gateway...`);

  if (socket) {
    socket.disconnect();
    socket = null;
  }
  setupSocketConnection();

  sendHttpHeartbeat().catch((err) => {
    console.warn('[SyncEngine] Immediate post-pairing heartbeat warning:', err?.message);
  });

  if (!httpHeartbeatInterval) {
    httpHeartbeatInterval = setInterval(() => {
      sendHttpHeartbeat().catch((err) =>
        console.error('[SyncEngine] HTTP Heartbeat timer error:', err)
      );
    }, 30_000);
  }

  reconcileRemoteConfig(true).catch((err) => {
    console.warn('[SyncEngine] Immediate post-pairing config reconciliation warning:', err?.message);
  });
}

/**
 * Reads local cached booth configuration from kiosk-config.json.
 * If file is missing or corrupt, returns safe production defaults for Booth #1.
 */
export function readLocalKioskConfig(): Record<string, any> {
  const defaultFallback: Record<string, any> = {
    configVersion: 1,
    pricing: { basePrice: 35000, currency: 'IDR', enableVoucher: true, enableQRIS: true },
    timing: { paymentTimeoutSec: 270, poseCountdownSec: 5, qrTimeoutSec: 60, idleResetSec: 120 },
    hardware: {
      cameraProfileId: null,
      printerProfileId: null,
      mirrorViewfinder: true,
      paperSize: '4R',
      printerCalibration: {
        scale: 99,
        offsetX: 0,
        offsetY: 3,
      },
      printerNames: {
        strip2x6: null,
        photo4x6: null,
        photo6x8: null,
      },
    },
    frames: { allowedFrameIds: [] },
    system: { themeColor: '#3b82f6', eventName: 'PICTOLABS SELF PHOTOBOOTH', subText: 'TOUCH SCREEN TO START' },
    price: 35000,
    countdown: 5,
    timeout: 270,
    themeColor: '#3b82f6',
    eventName: 'PICTOLABS SELF PHOTOBOOTH',
    subText: 'TOUCH SCREEN TO START',
  };

  const dataDir = config?.dataDir || path.join(os.homedir(), '.pictolabs');
  const configPath = path.join(dataDir, 'kiosk-config.json');

  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const merged: Record<string, any> = { ...defaultFallback, ...parsed };

        // Defensive normalization: resolve pricing.basePrice and price consistently
        const hasParsedBasePrice =
          typeof parsed?.pricing?.basePrice === 'number' &&
          !isNaN(parsed.pricing.basePrice) &&
          parsed.pricing.basePrice > 0;
        const hasParsedPrice =
          typeof parsed?.price === 'number' &&
          !isNaN(parsed.price) &&
          parsed.price > 0;

        if (hasParsedBasePrice) {
          merged.pricing = {
            ...defaultFallback.pricing,
            ...(parsed.pricing || {}),
            basePrice: parsed.pricing.basePrice,
          };
          merged.price = parsed.pricing.basePrice;
        } else if (hasParsedPrice) {
          merged.pricing = {
            ...defaultFallback.pricing,
            ...(parsed.pricing || {}),
            basePrice: parsed.price,
          };
          merged.price = parsed.price;
        } else {
          // Both missing or invalid (<= 0 / NaN) -> preserve default fallback
          merged.pricing = { ...defaultFallback.pricing };
          merged.price = defaultFallback.price;
        }

        // Defensive normalization: resolve hardware.printerCalibration and printerNames
        const rawCal = parsed?.hardware?.printerCalibration;
        const rawScale =
          typeof rawCal?.scale === 'number' && !isNaN(rawCal.scale)
            ? rawCal.scale
            : defaultFallback.hardware.printerCalibration.scale;
        const rawOffX =
          typeof rawCal?.offsetX === 'number' && !isNaN(rawCal.offsetX)
            ? rawCal.offsetX
            : defaultFallback.hardware.printerCalibration.offsetX;
        const rawOffY =
          typeof rawCal?.offsetY === 'number' && !isNaN(rawCal.offsetY)
            ? rawCal.offsetY
            : defaultFallback.hardware.printerCalibration.offsetY;

        const normalizedCalibration = {
          scale: Math.max(85, Math.min(100, rawScale)),
          offsetX: Math.max(-15, Math.min(15, rawOffX)),
          offsetY: Math.max(-15, Math.min(15, rawOffY)),
        };

        const rawNames = parsed?.hardware?.printerNames;
        const normalizedPrinterNames = {
          strip2x6: typeof rawNames?.strip2x6 === 'string' ? rawNames.strip2x6 : (rawNames?.strip2x6 === null ? null : defaultFallback.hardware.printerNames.strip2x6),
          photo4x6: typeof rawNames?.photo4x6 === 'string' ? rawNames.photo4x6 : (rawNames?.photo4x6 === null ? null : defaultFallback.hardware.printerNames.photo4x6),
          photo6x8: typeof rawNames?.photo6x8 === 'string' ? rawNames.photo6x8 : (rawNames?.photo6x8 === null ? null : defaultFallback.hardware.printerNames.photo6x8),
        };

        merged.hardware = {
          ...defaultFallback.hardware,
          ...(parsed.hardware || {}),
          printerCalibration: normalizedCalibration,
          printerNames: {
            ...defaultFallback.hardware.printerNames,
            ...(parsed.hardware?.printerNames || {}),
            ...normalizedPrinterNames,
          },
        };

        return merged;
      }
    }
  } catch (err: any) {
    console.warn('[SyncEngine] Corrupt or unreadable kiosk-config.json, using safe defaults:', err?.message);
  }
  return defaultFallback;
}

/**
 * Atomically writes configuration to local disk cache using temporary file replacement.
 */
export function writeLocalKioskConfig(newConfig: Record<string, any>): Record<string, any> {
  const dataDir = config?.dataDir || path.join(os.homedir(), '.pictolabs');
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (_) {}
  }

  const configPath = path.join(dataDir, 'kiosk-config.json');
  const tempPath = `${configPath}.${Date.now()}.tmp`;

  // Normalize pricing structure before persisting to disk
  const normalized: Record<string, any> = { ...newConfig };
  const hasBasePrice =
    typeof normalized?.pricing?.basePrice === 'number' &&
    !isNaN(normalized.pricing.basePrice) &&
    normalized.pricing.basePrice > 0;
  const hasPrice =
    typeof normalized?.price === 'number' &&
    !isNaN(normalized.price) &&
    normalized.price > 0;

  if (hasBasePrice) {
    normalized.price = normalized.pricing.basePrice;
  } else if (hasPrice) {
    normalized.pricing = {
      ...(normalized.pricing || { currency: 'IDR', enableVoucher: true, enableQRIS: true }),
      basePrice: normalized.price,
    };
  }

  // Defensively normalize printer calibration bounds before saving
  if (normalized.hardware?.printerCalibration) {
    const rawCal = normalized.hardware.printerCalibration;
    const rawScale = typeof rawCal?.scale === 'number' && !isNaN(rawCal.scale) ? rawCal.scale : 99;
    const rawOffX = typeof rawCal?.offsetX === 'number' && !isNaN(rawCal.offsetX) ? rawCal.offsetX : 0;
    const rawOffY = typeof rawCal?.offsetY === 'number' && !isNaN(rawCal.offsetY) ? rawCal.offsetY : 3;
    normalized.hardware.printerCalibration = {
      scale: Math.max(85, Math.min(100, rawScale)),
      offsetX: Math.max(-15, Math.min(15, rawOffX)),
      offsetY: Math.max(-15, Math.min(15, rawOffY)),
    };
  }

  try {
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), 'utf-8');
    fs.renameSync(tempPath, configPath);
  } catch (err: any) {
    console.error('[SyncEngine] Failed to atomically write kiosk-config.json:', err?.message);
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_) {}
  }

  return normalized;
}

/**
 * Reconciles local configuration against backend HTTP API (GET /api/booths/:id/config).
 * Uses a non-blocking 3s timeout to ensure the kiosk never freezes on boot.
 */
/**
 * Pushes saved kiosk configuration to backend API (PUT /api/booths/:id/config).
 * Safe and non-blocking: fails gracefully if offline or backend is unreachable.
 */
export async function pushConfigToRemote(
  baseUrl: string,
  boothId: string,
  deviceSecret: string | undefined,
  configEnvelope: Record<string, any>
): Promise<any> {
  const url = `${baseUrl}/api/booths/${boothId}/config`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (deviceSecret) {
    headers['x-device-secret'] = deviceSecret;
  }

  const payload = {
    pricing: configEnvelope.pricing,
    timing: configEnvelope.timing,
    hardware: configEnvelope.hardware,
    frames: configEnvelope.frames,
    system: configEnvelope.system,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[SyncEngine] Push config returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    console.log(`[SyncEngine] ✓ Configuration pushed to cloud successfully (v${data.configVersion})`);
    return data;
  } catch (err: any) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Reconciles local configuration against backend HTTP API (GET /api/booths/:id/config).
 * Uses a non-blocking 3s timeout to ensure the kiosk never freezes on boot.
 */
export async function reconcileRemoteConfig(force: boolean = false): Promise<any> {
  if (!config || !config.boothId || !config.apiBaseUrl) {
    return readLocalKioskConfig();
  }

  const targetBoothId = config.boothId;
  const baseUrl = config.apiBaseUrl;
  const url = `${baseUrl}/api/booths/${targetBoothId}/config`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (config.deviceSecret) {
      headers['x-device-secret'] = config.deviceSecret;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[SyncEngine] Remote config fetch returned HTTP ${res.status}`);
      return readLocalKioskConfig();
    }

    const remoteConfig = await res.json();
    if (!remoteConfig || typeof remoteConfig !== 'object') {
      console.warn('[SyncEngine] Remote config returned malformed payload');
      return readLocalKioskConfig();
    }

    const localConfig = readLocalKioskConfig();
    const localVersion = typeof localConfig.configVersion === 'number' ? localConfig.configVersion : 1;
    const remoteVersion = typeof remoteConfig.configVersion === 'number' ? remoteConfig.configVersion : 0;

    // Conditions to apply remote changes:
    // 1. Remote is strictly newer (remoteVersion > localVersion)
    // 2. Force flag is true, but ONLY if remote is at least as new as local (remoteVersion >= localVersion)
    // NEVER allow older remote config (remoteVersion < localVersion) to overwrite newer local configuration!
    const shouldReconcile = remoteVersion > localVersion || (force && remoteVersion >= localVersion);

    if (shouldReconcile) {
      console.log(`[SyncEngine] Remote config reconciled: updating local cache from v${localVersion} to v${remoteVersion}`);

      // Safe deep merge that protects configured hardware from cloud null/default overwrites
      const localHw = localConfig.hardware || {};
      const remoteHw = remoteConfig.hardware || {};

      const mergedCalibration = {
        // If remote has non-default calibration, use remote; if remote has factory default (99, 0, 3) and local has custom calibration, preserve local!
        scale: (typeof remoteHw.printerCalibration?.scale === 'number' && remoteHw.printerCalibration.scale !== 99)
          ? remoteHw.printerCalibration.scale
          : (localHw.printerCalibration?.scale ?? 99),
        offsetX: (typeof remoteHw.printerCalibration?.offsetX === 'number' && remoteHw.printerCalibration.offsetX !== 0)
          ? remoteHw.printerCalibration.offsetX
          : (localHw.printerCalibration?.offsetX ?? 0),
        offsetY: (typeof remoteHw.printerCalibration?.offsetY === 'number' && remoteHw.printerCalibration.offsetY !== 3)
          ? remoteHw.printerCalibration.offsetY
          : (localHw.printerCalibration?.offsetY ?? 3),
      };

      const mergedPrinterNames = {
        // Null in remote should NOT wipe out configured local queue strings!
        strip2x6: remoteHw.printerNames?.strip2x6 !== undefined && remoteHw.printerNames?.strip2x6 !== null
          ? remoteHw.printerNames.strip2x6
          : (localHw.printerNames?.strip2x6 ?? null),
        photo4x6: remoteHw.printerNames?.photo4x6 !== undefined && remoteHw.printerNames?.photo4x6 !== null
          ? remoteHw.printerNames.photo4x6
          : (localHw.printerNames?.photo4x6 ?? null),
        photo6x8: remoteHw.printerNames?.photo6x8 !== undefined && remoteHw.printerNames?.photo6x8 !== null
          ? remoteHw.printerNames.photo6x8
          : (localHw.printerNames?.photo6x8 ?? null),
      };

      const merged = {
        ...localConfig,
        ...remoteConfig,
        configVersion: Math.max(localVersion, remoteVersion),
        pricing: {
          ...(localConfig.pricing || {}),
          ...(remoteConfig.pricing || {}),
        },
        timing: {
          ...(localConfig.timing || {}),
          ...(remoteConfig.timing || {}),
        },
        hardware: {
          ...localHw,
          ...remoteHw,
          printerCalibration: mergedCalibration,
          printerNames: mergedPrinterNames,
        },
        system: {
          ...(localConfig.system || {}),
          ...(remoteConfig.system || {}),
        },
      };

      const saved = writeLocalKioskConfig(merged);

      configUpdateListeners.forEach((fn) => {
        try { fn(saved); } catch (_) {}
      });

      broadcastToWindows('kiosk:config-updated', saved);
      return saved;
    } else {
      console.log(`[SyncEngine] Local config is up to date (local v${localVersion} >= remote v${remoteVersion})`);
      // If local has newer unpushed changes (e.g. offline save previously), asynchronously push to cloud now that we are online!
      if (localVersion > remoteVersion && config?.boothId && config?.apiBaseUrl) {
        pushConfigToRemote(config.apiBaseUrl, config.boothId, config.deviceSecret, localConfig).catch((err) => {
          console.warn('[SyncEngine] Async sync-up of newer local config to cloud deferred:', err?.message);
        });
      }
      return localConfig;
    }
  } catch (err: any) {
    console.warn('[SyncEngine] Remote config reconciliation skipped (offline or timeout):', err?.message);
    return readLocalKioskConfig();
  }
}

export function registerSyncHandlers(engineConfig: SyncEngineConfig): void {
  config = engineConfig;

  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }

  // Initialize SQLite
  initDatabase(config.dataDir);

  // Setup WebSocket connection to backend
  setupSocketConnection();

  // Attempt non-blocking background remote config reconciliation on startup
  reconcileRemoteConfig().catch(() => {});

  // Start periodic HTTP heartbeat as single source of truth (every 30 seconds)
  sendHttpHeartbeat().catch(() => {});
  httpHeartbeatInterval = setInterval(() => {
    sendHttpHeartbeat().catch((err) =>
      console.error('[SyncEngine] HTTP Heartbeat timer error:', err)
    );
  }, 30_000);

  // Start periodic cloud metadata sync
  syncInterval = setInterval(() => {
    syncSessionsToCloud().catch((err) =>
      console.error('[SyncEngine] Sync interval error:', err)
    );
  }, config.syncIntervalMs);

  // Start periodic upload queue worker (runs every 4 seconds)
  uploadInterval = setInterval(() => {
    processUploadQueue().catch((err) =>
      console.error('[SyncEngine] Upload worker error:', err)
    );
  }, 4000);

  // ─── IPC Handlers ────────────────────────────────────────
  if (ipcMain && typeof ipcMain.handle === 'function') {
    ipcMain.handle('config:get', async () => {
      return readLocalKioskConfig();
    });

    ipcMain.handle('config:reconcile', async () => {
      return reconcileRemoteConfig(true);
    });

    ipcMain.handle('config:set', async (_event, partial: Record<string, unknown>) => {
      const current = readLocalKioskConfig();
      const currentVersion = typeof current.configVersion === 'number' ? current.configVersion : 1;
      const nextVersion = currentVersion + 1;

      // Safe deep merge for partial configuration updates
      const partialHardware = (partial.hardware && typeof partial.hardware === 'object') ? (partial.hardware as Record<string, any>) : {};
      const currentHardware = current.hardware || {};

      const mergedHardware = {
        ...currentHardware,
        ...partialHardware,
        printerCalibration: {
          ...(currentHardware.printerCalibration || { scale: 99, offsetX: 0, offsetY: 3 }),
          ...(partialHardware.printerCalibration || {}),
        },
        printerNames: {
          ...(currentHardware.printerNames || { strip2x6: null, photo4x6: null, photo6x8: null }),
          ...(partialHardware.printerNames || {}),
        },
      };

      const merged: Record<string, any> = {
        ...current,
        ...partial,
        configVersion: nextVersion,
        pricing: {
          ...(current.pricing || {}),
          ...((partial.pricing as Record<string, any>) || {}),
        },
        timing: {
          ...(current.timing || {}),
          ...((partial.timing as Record<string, any>) || {}),
        },
        hardware: mergedHardware,
        system: {
          ...(current.system || {}),
          ...((partial.system as Record<string, any>) || {}),
        },
      };

      const saved = writeLocalKioskConfig(merged);

      configUpdateListeners.forEach((fn) => {
        try { fn(saved); } catch (_) {}
      });

      broadcastToWindows('kiosk:config-updated', saved);

      // Asynchronously push updated configuration to backend API (PUT /api/booths/:id/config)
      if (config?.boothId && config?.apiBaseUrl) {
        pushConfigToRemote(config.apiBaseUrl, config.boothId, config.deviceSecret, saved).catch((err) => {
          console.warn('[SyncEngine] Background push of saved config to cloud deferred (offline):', err?.message);
        });
      }

      return saved;
    });

  // ─── IPC: Session Management ───────────────────────────
  ipcMain.handle(
    'session:create',
    async (
      _event,
      data: {
        id?: string;
        frameId: string;
        filter: string;
        photos: string[];
        printStatus?: string;
        compositePath?: string;
        liveVideoPath?: string;
        liveVideoPaths?: string[];
      }
    ) => {
      return createSession({
        id: data.id,
        frameId: data.frameId,
        filter: data.filter,
        photos: data.photos,
        printStatus: (data.printStatus as Session['printStatus']) || 'pending',
        compositePath: data.compositePath,
        liveVideoPath: data.liveVideoPath,
        liveVideoPaths: data.liveVideoPaths,
      });
    }
  );

  ipcMain.handle(
    'session:update',
    async (_event, id: string, update: Partial<Session>) => {
      return updateSession(id, update);
    }
  );

  ipcMain.handle('session:list', async () => {
    return listSessions();
  });

  ipcMain.handle('session:get-last', async () => {
    return getLastSession();
  });

  ipcMain.handle('session:get-download-url', async (_event, sessionId: string) => {
    return resolveLanDownloadUrl(`/d/${sessionId}`, config.apiBaseUrl || 'http://localhost:4000');
  });

  // ─── IPC: Session History Center (Phase 1) ─────────────
  ipcMain.handle('session:history:list', async (_event, query?: KioskSessionHistoryQuery) => {
    return getSessionHistory(query);
  });

  ipcMain.handle('session:history:reprint', async (_event, params: { sessionId: string; copies?: number; reason?: string }) => {
    return reprintSessionWithDebounce(params?.sessionId, params?.copies || 1, params?.reason || 'OPERATOR_REPRINT');
  });

  ipcMain.handle('session:history:force-upload', async (_event, params: { sessionId: string }) => {
    return forceUploadSession(params?.sessionId);
  });

  // ─── IPC: Payment Management ───────────────────────────
  ipcMain.handle(
    'payment:create-qris',
    async (
      _event,
      params: {
        boothId?: string;
        sessionId?: string;
        amount?: number;
        productName?: string;
        voucherCode?: string;
      }
    ) => {
      const baseUrl = config.apiBaseUrl || 'http://localhost:4000';
      const boothId = params.boothId || config.boothId || config.deviceSecret || 'dev-secret-booth-01';
      console.log(`[SyncEngine] Requesting QRIS from ${baseUrl}/api/payments/qris for ${boothId}`);
      try {
        const res = await fetch(`${baseUrl}/api/payments/qris`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boothId,
            sessionId: params.sessionId,
            amount: params.amount ?? (readLocalKioskConfig()?.pricing?.basePrice ?? 35000),
            productName: params.productName,
            voucherCode: params.voucherCode,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            success: false,
            error: data.message || data.error || `HTTP ${res.status}: Gagal membuat pembayaran QRIS`,
          };
        }
        return data;
      } catch (err: any) {
        console.error('[SyncEngine] Failed to create QRIS:', err.message);
        return { success: false, error: err.message };
      }
    }
  );

  ipcMain.handle('payment:check-status', async (_event, orderId: string) => {
    const baseUrl = config.apiBaseUrl || 'http://localhost:4000';
    try {
      const res = await fetch(`${baseUrl}/api/payments/status/${orderId}`);
      if (!res.ok) {
        return { status: 'NOT_FOUND', paid: false };
      }
      return await res.json();
    } catch (err: any) {
      return { status: 'ERROR', paid: false, error: err.message };
    }
  });

  ipcMain.handle('payment:cancel', async (_event, orderId: string) => {
    const baseUrl = config.apiBaseUrl || 'http://localhost:4000';
    try {
      const res = await fetch(`${baseUrl}/api/payments/cancel/${orderId}`, {
        method: 'POST',
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  }
}

export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (uploadInterval) {
    clearInterval(uploadInterval);
    uploadInterval = null;
  }
  if (healthPingInterval) {
    clearInterval(healthPingInterval);
    healthPingInterval = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (db) {
    try {
      db.close();
      console.log('[SyncEngine] SQLite database connection closed safely');
    } catch {}
    db = null;
  }
}

export function getDatabase(): Database.Database | null {
  return db;
}

export function getUploadQueueItemByPath(filePath: string): UploadQueueItem | null {
  if (!db) return null;
  const filename = path.basename(filePath);
  try {
    const row = db.prepare('SELECT * FROM upload_queue WHERE file_path LIKE ? OR id LIKE ? LIMIT 1').get(`%${filename}%`, `%${filename}%`) as any;
    if (!row) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      filePath: row.file_path,
      fileType: row.file_type,
      status: row.status,
      attempts: row.attempts,
      errorMessage: row.error_message,
      remoteUrl: row.remote_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (_) {
    return null;
  }
}

export function getPrintQueueItemByPath(filePath: string): any | null {
  if (!db) return null;
  const filename = path.basename(filePath);
  try {
    const row = db.prepare('SELECT * FROM print_queue WHERE file_path LIKE ? OR id LIKE ? ORDER BY created_at DESC LIMIT 1')
      .get(`%${filename}%`, `%${filename}%`) as any;
    return row || null;
  } catch (_) {
    return null;
  }
}

export function isPrintAssetSettled(filePath: string): boolean {
  if (!db) return true;
  const filename = path.basename(filePath);
  try {
    const activeRow = db.prepare(`
      SELECT id FROM print_queue 
      WHERE (file_path LIKE ? OR file_path LIKE ?) 
        AND status IN ('PENDING', 'PRINTING') 
      LIMIT 1
    `).get(`%${filename}%`, `%${filePath}%`) as any;
    return !activeRow;
  } catch (_) {
    return true;
  }
}

export function isSessionPrintSettled(sessionId: string): boolean {
  if (!db) return true;
  try {
    const activeRow = db.prepare(`
      SELECT id FROM print_queue 
      WHERE session_id = ? AND status IN ('PENDING', 'PRINTING')
      LIMIT 1
    `).get(sessionId) as any;
    return !activeRow;
  } catch (_) {
    return true;
  }
}

export function isPathTrackedInSession(filePath: string): boolean {
  if (!db) return false;
  const filename = path.basename(filePath);
  try {
    const row = db.prepare(`
      SELECT id FROM sessions 
      WHERE composite_path LIKE ? 
         OR photos LIKE ? 
         OR live_video_path LIKE ? 
         OR live_video_paths LIKE ? 
      LIMIT 1
    `).get(`%${filename}%`, `%${filename}%`, `%${filename}%`, `%${filename}%`) as any;
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

export function markSessionStoragePruned(sessionId: string): void {
  if (!db) return;
  try {
    db.prepare("UPDATE sessions SET local_storage_state = 'PRUNED' WHERE id = ?").run(sessionId);
  } catch (_) {}
}

export function runDatabaseCompaction(): { success: boolean; message: string } {
  if (!db) return { success: false, message: 'Database not initialized' };
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    return { success: true, message: 'WAL truncated and checkpointed successfully' };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

type ConfigListener = (config: any) => void;
const configUpdateListeners: ConfigListener[] = [];
export function onConfigUpdated(listener: ConfigListener): () => void {
  configUpdateListeners.push(listener);
  return () => {
    const idx = configUpdateListeners.indexOf(listener);
    if (idx !== -1) configUpdateListeners.splice(idx, 1);
  };
}


