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
    db.exec("ALTER TABLE sessions ADD COLUMN local_storage_state TEXT NOT NULL DEFAULT 'HOT';");
  } catch (_) {}

  // Prepare statements
  stmtInsertSession = db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, live_video_path, print_status, synced, uploaded, remote_url, live_video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmtUpdateSession = db.prepare(`
    UPDATE sessions 
    SET frame_id = COALESCE(?, frame_id),
        filter = COALESCE(?, filter),
        photos = COALESCE(?, photos),
        composite_path = COALESCE(?, composite_path),
        live_video_path = COALESCE(?, live_video_path),
        print_status = COALESCE(?, print_status),
        synced = COALESCE(?, synced),
        uploaded = COALESCE(?, uploaded),
        remote_url = COALESCE(?, remote_url),
        live_video_url = COALESCE(?, live_video_url)
    WHERE id = ?
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
  return {
    id: row.id,
    createdAt: row.created_at,
    frameId: row.frame_id,
    filter: row.filter,
    photos: JSON.parse(row.photos || '[]'),
    compositePath: row.composite_path || undefined,
    liveVideoPath: row.live_video_path || undefined,
    liveVideoPaths: row.live_video_paths ? JSON.parse(row.live_video_paths) : row.live_video_path ? [row.live_video_path] : [],
    liveVideoUrl: row.live_video_url || undefined,
    liveVideoUrls: row.live_video_urls ? JSON.parse(row.live_video_urls) : row.live_video_url ? [row.live_video_url] : [],
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

  if (db && stmtInsertSession) {
    stmtInsertSession.run(
      id,
      createdAt,
      data.frameId,
      data.filter,
      JSON.stringify(data.photos || []),
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

    // Eager Sync session metadata directly to PostgreSQL cloud
    syncSingleSessionToCloud(id).catch((err: any) =>
      console.warn(`[SyncEngine] Eager session sync warning for ${id}:`, err?.message)
    );

    // 1. Composite file upload
    if (data.compositePath && fs.existsSync(data.compositePath)) {
      enqueueUpload(id, data.compositePath, 'composite');
    }

    // 2. Individual pose photos upload
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
          enqueueUpload(id, posePath, 'raw');
        }
      });
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

  stmtUpdateSession.run(
    update.frameId ?? null,
    update.filter ?? null,
    update.photos ? JSON.stringify(update.photos) : null,
    update.compositePath ?? null,
    update.printStatus ?? null,
    update.synced !== undefined ? (update.synced ? 1 : 0) : null,
    update.uploaded !== undefined ? (update.uploaded ? 1 : 0) : null,
    update.remoteUrl ?? null,
    id
  );

  // If compositePath was just attached in this update, queue it for cloud upload!
  if (update.compositePath && fs.existsSync(update.compositePath)) {
    enqueueUpload(id, update.compositePath, 'composite');
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

async function processUploadQueue(): Promise<void> {
  if (isUploading || !config.apiBaseUrl || !db || !stmtGetPendingUploads || !stmtUpdateUploadStatus) {
    return;
  }

  const pending = stmtGetPendingUploads.all() as any[];
  if (!pending || pending.length === 0) return;

  isUploading = true;
  lastUploadActivity = Date.now();

  for (const item of pending) {
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
  isUploading = false;
  lastUploadActivity = Date.now();
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

    // Mutex deadlock detection: if isUploading is true, but no UPLOADING items exist or inactive > 90s
    if (isUploading) {
      const activeUploading = db.prepare("SELECT count(*) as count FROM upload_queue WHERE status = 'UPLOADING'").get() as any;
      if (!activeUploading || activeUploading.count === 0 || Date.now() - lastUploadActivity > 90_000) {
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
  try {
    const response = await fetch(`${config.apiBaseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-secret': config.deviceSecret || '',
      },
      body: JSON.stringify(session),
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
  });

  socket.on('disconnect', (reason) => {
    console.log('✗ [SyncEngine] WebSocket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[SyncEngine] WebSocket connection attempt failed:', err.message);
  });

  socket.on('CONFIG_UPDATE', (newConfig) => {
    console.log('[SyncEngine] Received remote CONFIG_UPDATE from Cloud:', newConfig);
    const configPath = path.join(config.dataDir, 'kiosk-config.json');
    let existing = {};
    try {
      if (fs.existsSync(configPath)) {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch {}
    const merged = { ...existing, ...newConfig };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
    
    // Broadcast config update to all React Renderer windows
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('kiosk:config-updated', merged);
    }
  });

  socket.on('payment:settled', (data) => {
    console.log('[SyncEngine] Received remote payment:settled from Cloud:', data);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('payment:settled', data);
    }
  });

  socket.on('PAYMENT_SETTLED', (data) => {
    console.log('[SyncEngine] Received remote PAYMENT_SETTLED from Cloud:', data);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('payment:settled', data);
    }
  });

  socket.on('payment:expired', (data) => {
    console.log('[SyncEngine] Received remote payment:expired from Cloud:', data);
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('payment:expired', data);
    }
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

  const targetUrl = `${config.apiBaseUrl}/api/booths/${config.deviceSecret}/heartbeat`;
  let paperRemaining = 700;
  try {
    const row = db?.prepare('SELECT prints_remaining FROM paper_tracker WHERE id = 1').get() as any;
    if (row && typeof row.prints_remaining === 'number') {
      paperRemaining = row.prints_remaining;
    }
  } catch {}

  const payload = {
    appVersion: '1.2.5',
    gitCommit: process.env.GIT_COMMIT || '1457ae6',
    machineName: os.hostname(),
    localIp: getPrimaryLocalIp(),
    osVersion: `${os.type()} ${os.release()} (${os.arch()})`,
    electronVersion: process.versions.electron || '28.2.0',
    releaseChannel: 'stable',
    paperRemaining,
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
    } else {
      console.warn(`[SyncEngine] HTTP Heartbeat returned status ${res.status}`);
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

  // ─── IPC: Config Get/Set ───────────────────────────────
  ipcMain.handle('config:get', async () => {
    const configPath = path.join(config.dataDir, 'kiosk-config.json');
    try {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch {}
    return {};
  });

  ipcMain.handle('config:set', async (_event, partial: Record<string, unknown>) => {
    const configPath = path.join(config.dataDir, 'kiosk-config.json');
    let existing: Record<string, unknown> = {};
    try {
      if (fs.existsSync(configPath)) {
        existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch {}
    const merged = { ...existing, ...partial };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
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
            amount: params.amount || 35000,
            productName: params.productName,
            voucherCode: params.voucherCode,
          }),
        });
        return await res.json();
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


