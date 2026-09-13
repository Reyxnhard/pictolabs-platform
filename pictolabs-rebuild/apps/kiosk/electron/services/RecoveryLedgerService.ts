import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import { getDatabase } from './SyncEngine';

/**
 * Pictolabs Kiosk — Crash Recovery Ledger Service (Phase 3.2D)
 *
 * Implements Write-Ahead State Journaling for customer journeys:
 * 1. Atomically persists checkpoints from Payment Settlement to Physical Print.
 * 2. Provides 15-Minute Recovery Window for sudden power outages or Electron crashes.
 * 3. Incorporates Circuit Breaker (Max 2 recovery attempts) to prevent crash loops.
 * 4. Generates Cryptographic Rescue Vouchers if hardware is unrecoverable.
 */

export type RecoveryStatus = 'ACTIVE' | 'RECOVERED' | 'ABANDONED' | 'COMPLETED';

export type RecoveryStage =
  | 'PAYMENT_SETTLED'
  | 'FRAME_SELECTED'
  | 'CAPTURING'
  | 'CAPTURE_COMPLETE'
  | 'RENDER_PENDING'
  | 'READY_FOR_PRINT'
  | 'COMPLETED';

export interface RecoveryPayload {
  orderId?: string;
  price?: number;
  productId?: string;
  productName?: string;
  frameId?: string;
  frameName?: string;
  frameDesignId?: string;
  frameDesignName?: string;
  frameDesignTheme?: string;
  frameDesignBorderColor?: string;
  photos?: string[];
  filter?: string;
  compositePath?: string;
  compositeUrl?: string;
  liveVideoPaths?: string[];
  liveVideoPath?: string;
  gifPath?: string;
  gifUrl?: string;
  printEnqueued?: boolean;
}

export interface RecoveryLedgerRow {
  id: string;
  session_id: string;
  status: RecoveryStatus;
  stage: RecoveryStage;
  last_completed_step: number;
  payload: string;
  error_details?: string | null;
  recovery_attempts: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface RecoverableSessionDTO {
  id: string;
  sessionId: string;
  status: RecoveryStatus;
  stage: RecoveryStage;
  lastCompletedStep: number;
  payload: RecoveryPayload;
  recoveryAttempts: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  targetScreen: 'product-select' | 'frame-design' | 'capture' | 'filter' | 'render' | 'qr' | 'welcome';
}

export interface RescueVoucher {
  success: boolean;
  voucherCode: string;
  sessionId: string;
  amount: number;
  productName: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  qrPayload: string;
  reason?: string;
}

const LEDGER_TTL_MS = 15 * 60 * 1000; // 15 Minutes Recovery Window
const MAX_RECOVERY_ATTEMPTS = 2;       // Circuit Breaker Threshold
const BOOTH_SECRET = process.env.PICTOLABS_DEVICE_SECRET || 'dev-secret-booth-01';

let localDb: Database.Database | null = null;

function resolveDb(): Database.Database | null {
  return localDb || getDatabase();
}

/**
 * Initialize Recovery Ledger Schema and Indexes in SQLite
 */
export function initRecoveryLedger(externalDb?: Database.Database): void {
  if (externalDb) {
    localDb = externalDb;
  }
  const db = resolveDb();
  if (!db) {
    console.warn('[RecoveryLedgerService] Database not ready yet, deferring table creation');
    return;
  }

  db.exec(`
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
  `);

  console.log('[RecoveryLedgerService] ✓ session_recovery_ledger schema initialized in SQLite');
}

/**
 * Record Payment Settled: The initial journal entry that protects customer funds.
 */
export function recordPaymentSettled(
  sessionId: string,
  orderId: string,
  productData: {
    productId?: string;
    productName?: string;
    price?: number;
    frameId?: string;
    frameName?: string;
  }
): { success: boolean; id: string } {
  const db = resolveDb();
  const id = `ledger_${sessionId}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LEDGER_TTL_MS).toISOString();
  const nowIso = now.toISOString();

  const payload: RecoveryPayload = {
    orderId,
    price: productData.price || 35000,
    productId: productData.productId,
    productName: productData.productName || 'Photostrip',
    frameId: productData.frameId,
    frameName: productData.frameName,
    photos: [],
  };

  if (db) {
    try {
      db.prepare(`
        INSERT INTO session_recovery_ledger (
          id, session_id, status, stage, last_completed_step, payload, recovery_attempts, expires_at, created_at, updated_at
        ) VALUES (?, ?, 'ACTIVE', 'PAYMENT_SETTLED', 0, ?, 0, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          status = 'ACTIVE',
          stage = 'PAYMENT_SETTLED',
          payload = excluded.payload,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `).run(id, sessionId, JSON.stringify(payload), expiresAt, nowIso, nowIso);

      console.log(`[RecoveryLedgerService] 🛡 Journaled PAYMENT_SETTLED for session ${sessionId} (Order: ${orderId})`);
      return { success: true, id };
    } catch (err: any) {
      console.error('[RecoveryLedgerService] Failed to record payment settlement:', err.message);
    }
  }
  return { success: false, id };
}

/**
 * Atomically update progressive milestone checkpoint.
 */
export function updateRecoveryCheckpoint(
  sessionId: string,
  stage: RecoveryStage,
  step: number,
  payloadUpdate: Partial<RecoveryPayload>,
  errorDetails?: string
): boolean {
  const db = resolveDb();
  if (!db) return false;

  try {
    const existing = db.prepare('SELECT payload FROM session_recovery_ledger WHERE session_id = ?').get(sessionId) as any;
    let mergedPayload: RecoveryPayload = {};
    if (existing?.payload) {
      try {
        mergedPayload = JSON.parse(existing.payload);
      } catch (_) {}
    }

    // Merge existing payload with new checkpoint updates
    mergedPayload = {
      ...mergedPayload,
      ...payloadUpdate,
    };

    // If updating photos, ensure no duplicates
    if (payloadUpdate.photos) {
      mergedPayload.photos = Array.from(new Set(payloadUpdate.photos));
    }

    const nowIso = new Date().toISOString();
    // Refresh expires_at to extend 15 minutes from last active touchpoint
    const expiresAt = new Date(Date.now() + LEDGER_TTL_MS).toISOString();

    db.prepare(`
      UPDATE session_recovery_ledger
      SET stage = ?,
          last_completed_step = ?,
          payload = ?,
          error_details = COALESCE(?, error_details),
          expires_at = ?,
          updated_at = ?
      WHERE session_id = ? AND status = 'ACTIVE'
    `).run(stage, step, JSON.stringify(mergedPayload), errorDetails || null, expiresAt, nowIso, sessionId);

    console.log(`[RecoveryLedgerService] ✓ Checkpoint saved: ${sessionId} -> Stage: ${stage} (Step: ${step})`);
    return true;
  } catch (err: any) {
    console.warn(`[RecoveryLedgerService] Could not update checkpoint for ${sessionId}:`, err.message);
    return false;
  }
}

/**
 * Determine the exact target screen to resume based on ledger stage and payload.
 */
export function resolveTargetScreen(stage: RecoveryStage, payload: RecoveryPayload): RecoverableSessionDTO['targetScreen'] {
  switch (stage) {
    case 'PAYMENT_SETTLED':
      return payload.frameDesignId ? 'capture' : 'frame-design';
    case 'FRAME_SELECTED':
      return 'capture';
    case 'CAPTURING':
      return 'capture';
    case 'CAPTURE_COMPLETE':
      return 'filter';
    case 'RENDER_PENDING':
      return 'render';
    case 'READY_FOR_PRINT':
      return 'qr';
    case 'COMPLETED':
    default:
      return 'welcome';
  }
}

/**
 * Check if there is an active, unexpired session awaiting recovery on boot.
 */
export function getActiveRecoverableSession(): RecoverableSessionDTO | null {
  const db = resolveDb();
  if (!db) return null;

  try {
    // First, expire any stale sessions past 15 min TTL
    expireStaleLedgerEntries();

    const row = db.prepare(`
      SELECT * FROM session_recovery_ledger
      WHERE status = 'ACTIVE' AND datetime(expires_at) > datetime('now')
      ORDER BY updated_at DESC LIMIT 1
    `).get() as RecoveryLedgerRow | undefined;

    if (!row) return null;

    // Circuit breaker: prevent infinite crash loop
    if (row.recovery_attempts >= MAX_RECOVERY_ATTEMPTS) {
      console.warn(`[RecoveryLedgerService] 🚨 Circuit breaker triggered for session ${row.session_id} (${row.recovery_attempts} failed attempts). Marking ABANDONED.`);
      markLedgerAbandoned(row.session_id, 'CIRCUIT_BREAKER_MAX_ATTEMPTS_EXCEEDED');
      return null;
    }

    let parsedPayload: RecoveryPayload = {};
    try {
      parsedPayload = JSON.parse(row.payload);
    } catch (_) {}

    // Verify existing photos on disk if mid-capture
    if (Array.isArray(parsedPayload.photos) && parsedPayload.photos.length > 0) {
      const validPhotos = parsedPayload.photos.filter((p) => {
        const clean = p.replace(/^file:\/\/\/?/, '');
        return fs.existsSync(clean) && fs.statSync(clean).size > 1024;
      });
      parsedPayload.photos = validPhotos;
    }

    const targetScreen = resolveTargetScreen(row.stage, parsedPayload);

    return {
      id: row.id,
      sessionId: row.session_id,
      status: row.status,
      stage: row.stage,
      lastCompletedStep: row.last_completed_step,
      payload: parsedPayload,
      recoveryAttempts: row.recovery_attempts,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      targetScreen,
    };
  } catch (err: any) {
    console.warn('[RecoveryLedgerService] Error checking active recoverable session:', err.message);
    return null;
  }
}

/**
 * Mark session as recovered (increments recovery_attempts to guard against crash loops).
 */
export function markLedgerRecovered(sessionId: string): boolean {
  const db = resolveDb();
  if (!db) return false;

  try {
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE session_recovery_ledger
      SET recovery_attempts = recovery_attempts + 1,
          updated_at = ?
      WHERE session_id = ?
    `).run(nowIso, sessionId);
    console.log(`[RecoveryLedgerService] 🔄 Incremented recovery_attempts for ${sessionId}`);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Mark session as COMPLETED (normal end of workflow).
 */
export function markLedgerCompleted(sessionId: string): boolean {
  const db = resolveDb();
  if (!db) return false;

  try {
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE session_recovery_ledger
      SET status = 'COMPLETED',
          stage = 'COMPLETED',
          updated_at = ?
      WHERE session_id = ?
    `).run(nowIso, sessionId);
    console.log(`[RecoveryLedgerService] ✓ Succeeded & Marked COMPLETED: ${sessionId}`);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Mark session as ABANDONED (e.g. customer walked away or chose "Start New Session").
 */
export function markLedgerAbandoned(sessionId: string, reason = 'CUSTOMER_CANCELLED'): boolean {
  const db = resolveDb();
  if (!db) return false;

  try {
    const nowIso = new Date().toISOString();
    db.prepare(`
      UPDATE session_recovery_ledger
      SET status = 'ABANDONED',
          error_details = ?,
          updated_at = ?
      WHERE session_id = ?
    `).run(reason, nowIso, sessionId);
    console.log(`[RecoveryLedgerService] ⚠️ Marked ABANDONED: ${sessionId} (${reason})`);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Generate a Cryptographic Rescue Voucher if hardware fails or customer abandons after paying.
 */
export function generateRescueVoucher(sessionId: string, reason = 'HARDWARE_RECOVERY_FALLBACK'): RescueVoucher {
  const db = resolveDb();
  const now = new Date();
  const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days validity

  let amount = 35000;
  let productName = 'Photostrip';

  if (db) {
    try {
      const row = db.prepare('SELECT payload FROM session_recovery_ledger WHERE session_id = ?').get(sessionId) as any;
      if (row?.payload) {
        const payload = JSON.parse(row.payload) as RecoveryPayload;
        amount = payload.price || amount;
        productName = payload.productName || productName;
      }
    } catch (_) {}
  }

  // Format voucher code: VOUCH-B01-<8-char-hex>-<4-char-checksum>
  const uniqueToken = crypto.randomBytes(4).toString('hex').toUpperCase();
  const rawSignatureInput = `${sessionId}:${amount}:${uniqueToken}:${validUntil}:${BOOTH_SECRET}`;
  const hmac = crypto.createHmac('sha256', BOOTH_SECRET).update(rawSignatureInput).digest('hex');
  const checksum = hmac.slice(0, 4).toUpperCase();
  const voucherCode = `VOUCH-B01-${uniqueToken}-${checksum}`;

  const qrPayload = JSON.stringify({
    type: 'PICTOLABS_RESCUE_VOUCHER',
    code: voucherCode,
    sessionId,
    amount,
    productName,
    validUntil,
    sig: hmac.slice(0, 16),
  });

  console.log(`[RecoveryLedgerService] 🎟 Generated Rescue Voucher ${voucherCode} for session ${sessionId}`);

  return {
    success: true,
    voucherCode,
    sessionId,
    amount,
    productName,
    issuedAt: now.toISOString(),
    expiresAt: validUntil,
    signature: hmac,
    qrPayload,
    reason,
  };
}

/**
 * Automatically expire stale ledger entries older than 15 minutes.
 */
export function expireStaleLedgerEntries(): number {
  const db = resolveDb();
  if (!db) return 0;

  try {
    const nowIso = new Date().toISOString();
    const res = db.prepare(`
      UPDATE session_recovery_ledger
      SET status = 'ABANDONED',
          error_details = 'EXPIRED_15MIN_TTL',
          updated_at = ?
      WHERE status = 'ACTIVE' AND datetime(expires_at) <= datetime('now')
    `).run(nowIso);

    if (res.changes > 0) {
      console.log(`[RecoveryLedgerService] ⏱ Expired ${res.changes} stale ledger session(s) past 15-minute TTL`);
    }
    return res.changes;
  } catch (_) {
    return 0;
  }
}

/**
 * Helper for StorageRetentionService: verify if a file belongs to an active recovery ledger.
 * This prevents the Orphan Janitor from deleting photos during an active recovered session!
 */
export function isPathTrackedInActiveLedger(filePath: string): boolean {
  const db = resolveDb();
  if (!db) return false;

  const filename = path.basename(filePath);
  try {
    const row = db.prepare(`
      SELECT id FROM session_recovery_ledger
      WHERE status = 'ACTIVE'
        AND payload LIKE ?
      LIMIT 1
    `).get(`%${filename}%`) as any;

    return Boolean(row);
  } catch (_) {
    return false;
  }
}

/**
 * Register Electron IPC Handlers for Recovery Ledger
 */
export function registerRecoveryLedgerHandlers(): void {
  initRecoveryLedger();

  ipcMain.handle('recovery:check-recoverable', async () => {
    return getActiveRecoverableSession();
  });

  ipcMain.handle('recovery:resume', async (_event, sessionId: string) => {
    markLedgerRecovered(sessionId);
    return getActiveRecoverableSession();
  });

  ipcMain.handle('recovery:discard', async (_event, sessionId: string, reason?: string) => {
    markLedgerAbandoned(sessionId, reason || 'USER_DISCARDED');
    return { success: true };
  });

  ipcMain.handle('recovery:checkpoint', async (
    _event,
    sessionId: string,
    stage: RecoveryStage,
    step: number,
    payload: Partial<RecoveryPayload>
  ) => {
    return updateRecoveryCheckpoint(sessionId, stage, step, payload);
  });

  ipcMain.handle('recovery:claim-voucher', async (_event, sessionId: string, reason?: string) => {
    markLedgerAbandoned(sessionId, 'VOUCHER_CLAIMED');
    return generateRescueVoucher(sessionId, reason);
  });

  console.log('[RecoveryLedgerService] ✓ Registered IPC handlers for recovery ledger');
}
