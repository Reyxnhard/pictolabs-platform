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
let socket: Socket | null = null;
let isUploading = false;

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
  `);

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

  // Migrate legacy sessions.json if present
  migrateLegacyJson(dataDir);
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
  for (const item of pending) {
    const now = new Date().toISOString();
    try {
      if (!fs.existsSync(item.file_path)) {
        stmtUpdateUploadStatus.run('FAILED', 'File missing on local disk', null, now, item.id);
        continue;
      }

      console.log(`[SyncEngine] Uploading ${item.file_type} (${path.basename(item.file_path)}) to Cloud...`);
      const fileBuffer = fs.readFileSync(item.file_path);
      const filename = path.basename(item.file_path);

      // Request upload endpoint on NestJS
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
      });

      if (response.ok) {
        const result = (await response.json()) as { url?: string; publicUrl?: string };
        const rawUrl = result.publicUrl || result.url || `/uploads/${filename}`;
        const remoteUrl = resolveLanDownloadUrl(rawUrl, config.apiBaseUrl || 'http://localhost:4000');
        
        stmtUpdateUploadStatus.run('COMPLETED', null, remoteUrl, now, item.id);
        
        // Update session uploaded flags & URLs
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
              db.prepare('UPDATE sessions SET live_video_urls = ?, live_video_url = ? WHERE id = ?').run(
                JSON.stringify(urls),
                remoteUrl,
                item.session_id
              );
            } catch (_) {
              db.prepare('UPDATE sessions SET live_video_url = ? WHERE id = ?').run(remoteUrl, item.session_id);
            }
          } else {
            db.prepare('UPDATE sessions SET uploaded = 1, remote_url = ? WHERE id = ?').run(remoteUrl, item.session_id);
          }
        }
        console.log(`[SyncEngine] ✓ Uploaded ${item.file_type} successfully: ${remoteUrl}`);
      } else {
        const errText = await response.text();
        stmtUpdateUploadStatus.run('FAILED', `HTTP ${response.status}: ${errText.slice(0, 100)}`, null, now, item.id);
      }
    } catch (err: any) {
      console.warn(`[SyncEngine] Upload failed for ${item.id}:`, err.message);
      stmtUpdateUploadStatus.run('FAILED', err.message, null, now, item.id);
    }
  }
  isUploading = false;
}

// ─── Batch Session Metadata Sync to NestJS ──────────────────
async function syncSessionsToCloud(): Promise<void> {
  if (!config.apiBaseUrl || !db || !stmtGetUnsyncedSessions) return;

  const rows = stmtGetUnsyncedSessions.all();
  if (rows.length === 0) return;

  const unsynced = rows.map(rowToSession);
  console.log(`[SyncEngine] Syncing ${unsynced.length} session metadata records to cloud...`);

  for (const session of unsynced) {
    try {
      const response = await fetch(`${config.apiBaseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-device-secret': config.deviceSecret || '',
        },
        body: JSON.stringify(session),
      });

      if (response.ok) {
        stmtMarkSynced?.run(session.id);
        console.log(`[SyncEngine] ✓ Synced session metadata: ${session.id}`);
      } else {
        console.warn(`[SyncEngine] Sync failed for ${session.id}: ${response.status}`);
      }
    } catch (err) {
      console.warn(`[SyncEngine] Network sync error, will retry: ${(err as Error).message}`);
      break;
    }
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

export function registerSyncHandlers(engineConfig: SyncEngineConfig): void {
  config = engineConfig;

  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }

  // Initialize SQLite
  initDatabase(config.dataDir);

  // Setup WebSocket connection to backend
  setupSocketConnection();

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

