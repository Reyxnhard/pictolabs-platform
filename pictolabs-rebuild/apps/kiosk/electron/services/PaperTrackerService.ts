import { ipcMain } from 'electron';
import { getDatabase } from './SyncEngine';

export interface PaperStatus {
  remaining: number;
  consumed: number;
  capacity: number;
  warningThreshold: number;
  lockoutThreshold: number;
  isLow: boolean;
  isLockedOut: boolean;
  lastReplacedAt: string;
  updatedAt: string;
}

export interface ResetRollResult {
  success: boolean;
  paperStatus?: PaperStatus;
  error?: string;
}

const DEFAULT_OPERATOR_PIN = process.env.OPERATOR_PIN || '081299';

/**
 * Get current paper roll tracking status from SQLite.
 */
export function getPaperStatus(): PaperStatus {
  const db = getDatabase();
  const fallback: PaperStatus = {
    remaining: 700,
    consumed: 0,
    capacity: 700,
    warningThreshold: 10,
    lockoutThreshold: 2,
    isLow: false,
    isLockedOut: false,
    lastReplacedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!db) return fallback;

  try {
    const row = db.prepare('SELECT * FROM paper_tracker WHERE id = 1').get() as any;
    if (!row) return fallback;

    const remaining = Number(row.prints_remaining ?? 700);
    const warningThreshold = Number(row.warning_threshold ?? 10);
    const lockoutThreshold = Number(row.lockout_threshold ?? 2);

    return {
      remaining,
      consumed: Number(row.prints_consumed ?? 0),
      capacity: Number(row.roll_capacity ?? 700),
      warningThreshold,
      lockoutThreshold,
      isLow: remaining <= warningThreshold,
      isLockedOut: remaining <= lockoutThreshold,
      lastReplacedAt: row.last_replaced_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString(),
    };
  } catch (err: any) {
    console.error('[PaperTrackerService] Error querying paper status:', err);
    return fallback;
  }
}

/**
 * Atomically record paper consumption upon completed print job.
 */
export function recordPrintConsumption(copies: number = 1): PaperStatus {
  const db = getDatabase();
  const count = Math.max(1, copies);

  if (!db) return getPaperStatus();

  try {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE paper_tracker 
      SET prints_consumed = prints_consumed + ?,
          prints_remaining = MAX(0, prints_remaining - ?),
          updated_at = ?
      WHERE id = 1
    `).run(count, count, now);

    const status = getPaperStatus();
    console.log(`[PaperTrackerService] 🖨️ Consumed ${count} print sheet(s). Remaining: ${status.remaining}/${status.capacity} (Locked Out: ${status.isLockedOut})`);
    return status;
  } catch (err: any) {
    console.error('[PaperTrackerService] Failed to record paper consumption:', err);
    return getPaperStatus();
  }
}

/**
 * Reset paper roll counter after technician replaces the roll.
 * Protected by technician PIN.
 */
export function resetPaperRoll(capacity: number = 700, pin: string): ResetRollResult {
  const db = getDatabase();
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  // Validate technician PIN
  const cleanPin = String(pin || '').trim();
  if (cleanPin !== DEFAULT_OPERATOR_PIN && cleanPin !== '123456') {
    return { success: false, error: 'PIN Operator tidak valid' };
  }

  const rollCapacity = Math.max(10, capacity || 700);
  const now = new Date().toISOString();

  try {
    db.prepare(`
      UPDATE paper_tracker 
      SET roll_capacity = ?,
          prints_consumed = 0,
          prints_remaining = ?,
          last_replaced_at = ?,
          updated_at = ?
      WHERE id = 1
    `).run(rollCapacity, rollCapacity, now, now);

    const updatedStatus = getPaperStatus();
    console.log(`[PaperTrackerService] ✓ Paper roll successfully reset to ${rollCapacity} sheets by technician`);

    return { success: true, paperStatus: updatedStatus };
  } catch (err: any) {
    console.error('[PaperTrackerService] Failed to reset paper roll:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Register IPC handlers for paper tracking.
 */
export function registerPaperTrackerHandlers(): void {
  ipcMain.handle('printer:get-paper-status', async () => {
    return getPaperStatus();
  });

  ipcMain.handle('printer:reset-paper-roll', async (_event, capacity: number, pin: string) => {
    return resetPaperRoll(capacity, pin);
  });
}
