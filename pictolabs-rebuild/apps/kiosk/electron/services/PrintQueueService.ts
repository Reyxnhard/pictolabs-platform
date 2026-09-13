import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getDatabase, recordSystemEvent } from './SyncEngine';
import { getDefaultPrinterName, getIsBypassMode, printImage } from './PrintService';
import { recordPrintConsumption } from './PaperTrackerService';
import { getCachedPrinterHardwareStatus } from './PrinterMonitorService';

export type PrintQueueStatus = 'PENDING' | 'PRINTING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER' | 'CANCELLED';

export interface PrintQueueItem {
  id: string;
  session_id: string;
  file_path: string;
  printer_name: string;
  copies: number;
  status: PrintQueueStatus;
  attempts: number;
  max_attempts: number;
  last_error?: string | null;
  next_retry_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrintJobDTO {
  id: string;
  sessionId: string;
  printerName: string;
  filePath: string;
  status: PrintQueueStatus;
  copies: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueueMetricsDTO {
  pending: number;
  printing: number;
  failed: number;
  deadLetter: number;
  completed: number;
  cancelled: number;
  total: number;
}

export interface EnqueueResult {
  success: boolean;
  id?: string;
  isDuplicate?: boolean;
  error?: string;
}

// Exponential backoff delays: 5s, 10s, 20s, 40s, 80s
const BACKOFF_DELAYS = [5000, 10000, 20000, 40000, 80000];

let printWorkerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;
let hasPendingWork = false;

function mapRowToDTO(row: any): PrintJobDTO {
  return {
    id: row.id,
    sessionId: row.session_id,
    printerName: row.printer_name,
    filePath: row.file_path,
    status: row.status,
    copies: row.copies,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error ?? null,
    nextRetryAt: row.next_retry_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Startup Recovery: Reconcile any in-flight print jobs that were interrupted by an unexpected shutdown or crash.
 * Resets status from 'PRINTING' back to 'PENDING'.
 */
export function reconcileStartupPrintJobs(): void {
  const db = getDatabase();
  if (!db) return;

  try {
    const now = new Date().toISOString();
    const result = db.prepare(`
      UPDATE print_queue 
      SET status = 'PENDING', 
          last_error = 'Interrupted by application crash or restart (recovered)',
          updated_at = ? 
      WHERE status = 'PRINTING'
    `).run(now);

    if (result.changes > 0) {
      console.log(`[PrintQueueService] ⚠️ Reconciled ${result.changes} hanging print jobs back to PENDING`);
    }
  } catch (err: any) {
    console.warn('[PrintQueueService] Error reconciling startup print jobs:', err?.message);
  }
}

/**
 * Kill any orphaned or hung print subprocesses (rundll32.exe on Windows).
 */
export function killHungPrintProcesses(): void {
  if (process.platform === 'win32') {
    try {
      const { exec } = require('child_process');
      exec('taskkill /F /FI "IMAGENAME eq rundll32.exe" /T', () => {});
    } catch (_) {}
  }
}

/**
 * Priority 2: Print Watchdog Self-Healing Routine
 * Resets jobs stuck in 'PRINTING' longer than stuckThresholdMs (default 120s)
 * and safely clears mutex deadlocks.
 */
export function resetStuckPrintJobs(stuckThresholdMs: number = 120_000): { rescuedCount: number; mutexReset: boolean } {
  const db = getDatabase();
  if (!db) return { rescuedCount: 0, mutexReset: false };

  let rescuedCount = 0;
  let mutexReset = false;

  try {
    const cutoff = new Date(Date.now() - stuckThresholdMs).toISOString();
    const stuckJobs = db.prepare(`
      SELECT * FROM print_queue 
      WHERE status = 'PRINTING' AND updated_at < ?
    `).all(cutoff) as PrintQueueItem[];

    for (const job of stuckJobs) {
      killHungPrintProcesses();

      const newAttempts = (job.attempts || 0) + 1;
      const maxAttempts = job.max_attempts || 5;
      const now = new Date().toISOString();

      if (newAttempts >= maxAttempts) {
        db.prepare(`
          UPDATE print_queue 
          SET status = 'DEAD_LETTER', attempts = ?, last_error = 'Print watchdog: job exceeded timeout threshold (max retries reached)', updated_at = ?
          WHERE id = ?
        `).run(newAttempts, now, job.id);
      } else {
        const backoffMs = BACKOFF_DELAYS[Math.min(job.attempts, BACKOFF_DELAYS.length - 1)];
        const nextRetry = new Date(Date.now() + backoffMs).toISOString();
        db.prepare(`
          UPDATE print_queue 
          SET status = 'PENDING', attempts = ?, last_error = 'Print watchdog: rescued stuck in-flight print job', next_retry_at = ?, updated_at = ?
          WHERE id = ?
        `).run(newAttempts, nextRetry, now, job.id);
      }
      rescuedCount++;
    }

    if (isProcessing && stuckJobs.length === 0) {
      const activePrinting = db.prepare("SELECT count(*) as count FROM print_queue WHERE status = 'PRINTING'").get() as any;
      if (!activePrinting || activePrinting.count === 0) {
        isProcessing = false;
        mutexReset = true;
      }
    } else if (rescuedCount > 0) {
      isProcessing = false;
      mutexReset = true;
    }

    if (rescuedCount > 0 || mutexReset) {
      console.log(`[PrintQueueService] 🛡 Print Watchdog: Rescued ${rescuedCount} stuck jobs, mutexReset=${mutexReset}`);
      recordSystemEvent(
        'PRINT_WATCHDOG_RESCUE',
        'WARN',
        'PrintQueueService',
        `Rescued ${rescuedCount} stuck print jobs. Mutex reset: ${mutexReset}`
      );
      triggerQueueProcessing();
    }
  } catch (err: any) {
    console.warn('[PrintQueueService] Error in resetStuckPrintJobs:', err?.message);
  }

  return { rescuedCount, mutexReset };
}

/**
 * Watchdog query for print queue metrics.
 */
export function getPrintQueueHealth(): {
  isProcessing: boolean;
  pendingCount: number;
  printingCount: number;
  failedCount: number;
  deadLetterCount: number;
  stuckCount: number;
} {
  const db = getDatabase();
  if (!db) {
    return { isProcessing: false, pendingCount: 0, printingCount: 0, failedCount: 0, deadLetterCount: 0, stuckCount: 0 };
  }

  try {
    const counts = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'PRINTING' THEN 1 ELSE 0 END) as printingCount,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedCount,
        SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) as deadLetterCount
      FROM print_queue
    `).get() as any;

    const twoMinutesAgo = new Date(Date.now() - 120_000).toISOString();
    const stuck = db.prepare(`
      SELECT count(*) as count FROM print_queue WHERE status = 'PRINTING' AND updated_at < ?
    `).get(twoMinutesAgo) as any;

    return {
      isProcessing,
      pendingCount: counts?.pendingCount || 0,
      printingCount: counts?.printingCount || 0,
      failedCount: counts?.failedCount || 0,
      deadLetterCount: counts?.deadLetterCount || 0,
      stuckCount: stuck?.count || 0,
    };
  } catch (_) {
    return { isProcessing, pendingCount: 0, printingCount: 0, failedCount: 0, deadLetterCount: 0, stuckCount: 0 };
  }
}

/**
 * Event-Driven Trigger: Immediately signals worker to process pending jobs.
 * If currently busy, flags hasPendingWork to process immediately upon finishing.
 */
export function triggerQueueProcessing(): void {
  if (isProcessing) {
    hasPendingWork = true;
    return;
  }

  setImmediate(() => {
    processPrintQueue().catch((e) => {
      console.warn('[PrintQueueService] Event trigger error:', e);
    });
  });
}

/**
 * Enqueue a print job into the SQLite persistent print_queue with idempotency protection.
 */
export function enqueuePrintJob(
  sessionId: string,
  filePath: string,
  copies: number = 1,
  printerName?: string
): EnqueueResult {
  const db = getDatabase();
  if (!db) {
    return { success: false, error: 'Database not initialized' };
  }

  const cleanPath = filePath.replace(/^file:\/\/\/?/, '');
  const now = new Date().toISOString();
  const targetPrinter = printerName || getDefaultPrinterName() || 'Default Printer';

  // 1. Idempotency Protection: Check if an active job already exists for (session_id, file_path)
  try {
    const existing = db.prepare(`
      SELECT * FROM print_queue WHERE session_id = ? AND file_path = ? ORDER BY created_at DESC LIMIT 1
    `).get(sessionId, cleanPath) as PrintQueueItem | undefined;

    if (existing) {
      if (existing.status === 'COMPLETED') {
        console.log(`[PrintQueueService] ⚡ Idempotency: Job for session ${sessionId} (${cleanPath}) is already COMPLETED (jobId: ${existing.id}). Double-print prevented.`);
        return { success: true, id: existing.id, isDuplicate: true };
      }

      if (existing.status === 'PRINTING' || existing.status === 'PENDING') {
        console.log(`[PrintQueueService] ⚡ Idempotency: Job for session ${sessionId} (${cleanPath}) is already ${existing.status} (jobId: ${existing.id}). Preventing duplicate enqueue.`);
        triggerQueueProcessing();
        return { success: true, id: existing.id, isDuplicate: true };
      }

      if (existing.status === 'DEAD_LETTER' || existing.status === 'FAILED') {
        console.log(`[PrintQueueService] ⚡ Idempotency: Job for session ${sessionId} (${cleanPath}) was ${existing.status}. Reviving to PENDING.`);
        db.prepare(`
          UPDATE print_queue 
          SET status = 'PENDING', attempts = 0, last_error = NULL, next_retry_at = NULL, updated_at = ?
          WHERE id = ?
        `).run(now, existing.id);
        triggerQueueProcessing();
        return { success: true, id: existing.id, isDuplicate: true };
      }
    }

    // 2. Insert new job
    const id = `print_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(`
      INSERT INTO print_queue (
        id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, last_error, next_retry_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 5, NULL, NULL, ?, ?)
    `).run(id, sessionId, cleanPath, targetPrinter, copies, now, now);

    console.log(`[PrintQueueService] ✓ Enqueued print job ${id} for session ${sessionId} (${copies} copies)`);

    // 3. Event-Driven: Trigger processing immediately
    triggerQueueProcessing();

    return { success: true, id, isDuplicate: false };
  } catch (err: any) {
    console.error('[PrintQueueService] Failed to enqueue print job:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Process pending print jobs from the queue with retry and exponential backoff.
 * Loops until all currently ready PENDING jobs are processed.
 */
export async function processPrintQueue(): Promise<void> {
  const db = getDatabase();
  if (!db || isProcessing) return;

  isProcessing = true;

  try {
    while (true) {
      hasPendingWork = false;
      const now = new Date().toISOString();

      // Query oldest ready job
      const row = db.prepare(`
        SELECT * FROM print_queue 
        WHERE status = 'PENDING'
          AND (next_retry_at IS NULL OR next_retry_at <= ?)
        ORDER BY created_at ASC 
        LIMIT 1
      `).get(now) as PrintQueueItem | undefined;

      if (!row) {
        break; // No more ready jobs
      }

      await executePrintJob(row);
    }
  } catch (err: any) {
    console.error('[PrintQueueService] Unexpected error processing print queue:', err);
  } finally {
    isProcessing = false;
    if (hasPendingWork) {
      triggerQueueProcessing();
    }
  }
}

/**
 * Execute a single print job:
 * 1. Validates file existence on disk
 * 2. Transition: PENDING -> PRINTING
 * 3. Calls printImage() on target printer
 * 4. On success: Transition PRINTING -> COMPLETED
 * 5. On failure: Schedules retry with backoff OR transition PRINTING -> FAILED/DEAD_LETTER
 */
/**
 * Cloud Rehydration: If local composite photo is missing from disk (e.g. pruned by retention engine),
 * stream-download it from Cloudflare R2 via sessions.remote_url and save to disk before printing.
 */
export async function ensureCompositeOnDisk(sessionId: string, filePath: string): Promise<string | null> {
  const cleanPath = filePath.replace(/^file:\/\/\/?/, '');
  if (fs.existsSync(cleanPath)) {
    return cleanPath;
  }

  const db = getDatabase();
  if (!db) return null;

  try {
    const sessionRow = db.prepare('SELECT remote_url, composite_path FROM sessions WHERE id = ?').get(sessionId) as any;
    const remoteUrl = sessionRow?.remote_url;

    if (!remoteUrl || !remoteUrl.startsWith('http')) {
      return null;
    }

    console.log(`[PrintQueueService] 🔄 Rehydrating pruned composite for session ${sessionId} from Cloudflare R2: ${remoteUrl}`);
    const res = await fetch(remoteUrl);
    if (!res.ok) {
      console.warn(`[PrintQueueService] Rehydration fetch failed: HTTP ${res.status}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 50) {
      return null;
    }

    const dir = path.dirname(cleanPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(cleanPath, buffer);
    console.log(`[PrintQueueService] ✓ Successfully rehydrated composite from R2: ${cleanPath} (${buffer.length} bytes)`);
    return cleanPath;
  } catch (err: any) {
    console.warn(`[PrintQueueService] Rehydration error for session ${sessionId}:`, err.message);
    return null;
  }
}

export function isPrintJobPendingOrPrinting(filePath: string): boolean {
  const db = getDatabase();
  if (!db) return false;
  const filename = path.basename(filePath);
  try {
    const row = db.prepare(`
      SELECT id FROM print_queue 
      WHERE (file_path LIKE ? OR file_path LIKE ?) 
        AND status IN ('PENDING', 'PRINTING') 
      LIMIT 1
    `).get(`%${filename}%`, `%${filePath}%`) as any;
    return Boolean(row);
  } catch (_) {
    return false;
  }
}

export async function executePrintJob(item: PrintQueueItem): Promise<void> {
  const db = getDatabase();
  if (!db) return;

  const cleanPath = item.file_path.replace(/^file:\/\/\/?/, '');

  // Check if file exists on disk, attempt rehydration from R2 if pruned
  if (!fs.existsSync(cleanPath) && !getIsBypassMode()) {
    const rehydrated = await ensureCompositeOnDisk(item.session_id, cleanPath);
    if (!rehydrated || !fs.existsSync(cleanPath)) {
      const errMsg = `Print file not found on disk: ${cleanPath}`;
      console.error(`[PrintQueueService] ✗ ${errMsg}`);
      db.prepare(`
        UPDATE print_queue 
        SET status = 'DEAD_LETTER', last_error = ?, updated_at = ? 
        WHERE id = ?
      `).run(errMsg, new Date().toISOString(), item.id);

      try {
        db.prepare('UPDATE sessions SET print_status = ? WHERE id = ?').run('failed', item.session_id);
      } catch (_) {}
      return;
    }
  }

  // 1. Transition: PENDING -> PRINTING
  const printingTime = new Date().toISOString();
  db.prepare(`
    UPDATE print_queue 
    SET status = 'PRINTING', updated_at = ? 
    WHERE id = ?
  `).run(printingTime, item.id);

  console.log(`[PrintQueueService] Printing job ${item.id} (Session: ${item.session_id}, Attempt: ${item.attempts + 1})...`);

  // 2. Call to printImage() / driver with hardware pre-flight check
  let printResult: { success: boolean; error?: string };

  const hwStatus = getCachedPrinterHardwareStatus();
  if (!hwStatus.ready && !getIsBypassMode()) {
    console.warn(`[PrintQueueService] ⚠️ Pre-print hardware block: ${hwStatus.message}`);
    printResult = { success: false, error: hwStatus.message || 'Printer hardware error' };
  } else if (getIsBypassMode()) {
    console.log(`[PrintQueueService] [BYPASS] Simulated print job: ${cleanPath} (x${item.copies})`);
    printResult = { success: true };
  } else {
    const targetPrinter = item.printer_name || getDefaultPrinterName();
    if (!targetPrinter) {
      printResult = { success: false, error: 'No printer configured or detected' };
    } else {
      printResult = await printImage(cleanPath, targetPrinter, item.copies);
    }
  }

  const completeTime = new Date().toISOString();

  // 3. Status Transitions
  if (printResult.success) {
    // Transition: PRINTING -> COMPLETED
    db.prepare(`
      UPDATE print_queue 
      SET status = 'COMPLETED', last_error = NULL, updated_at = ? 
      WHERE id = ?
    `).run(completeTime, item.id);

    try {
      db.prepare('UPDATE sessions SET print_status = ? WHERE id = ?').run('printed', item.session_id);
    } catch (_) {}

    // Atomically record paper roll consumption
    try {
      recordPrintConsumption(item.copies);
    } catch (e) {
      console.warn('[PrintQueueService] Failed to record paper consumption:', e);
    }

    console.log(`[PrintQueueService] ✓ Print job ${item.id} COMPLETED successfully`);
  } else {
    const newAttempts = item.attempts + 1;
    const maxAttempts = item.max_attempts || 5;
    const errText = printResult.error || 'Unknown printer error';

    if (newAttempts >= maxAttempts) {
      // Transition: PRINTING -> FAILED / DEAD_LETTER (Max attempts reached, preserved in DB)
      db.prepare(`
        UPDATE print_queue 
        SET status = 'DEAD_LETTER', attempts = ?, last_error = ?, next_retry_at = NULL, updated_at = ? 
        WHERE id = ?
      `).run(newAttempts, `Exceeded max ${maxAttempts} retry attempts: ${errText}`, completeTime, item.id);

      try {
        db.prepare('UPDATE sessions SET print_status = ? WHERE id = ?').run('failed', item.session_id);
      } catch (_) {}

      console.error(`[PrintQueueService] ✗ Print job ${item.id} entered DEAD_LETTER state after ${newAttempts} attempts: ${errText}`);
    } else {
      // Retry Scheduler: Transition PRINTING -> PENDING with exponential backoff
      const backoffMs = BACKOFF_DELAYS[Math.min(item.attempts, BACKOFF_DELAYS.length - 1)];
      const nextRetryDate = new Date(Date.now() + backoffMs).toISOString();

      db.prepare(`
        UPDATE print_queue 
        SET status = 'PENDING', attempts = ?, last_error = ?, next_retry_at = ?, updated_at = ? 
        WHERE id = ?
      `).run(newAttempts, errText, nextRetryDate, completeTime, item.id);

      console.warn(`[PrintQueueService] ⚠️ Print job ${item.id} failed (Attempt ${newAttempts}/${maxAttempts}). Next retry in ${backoffMs / 1000}s. Error: ${errText}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1: Queue Monitoring API
// ─────────────────────────────────────────────────────────────────────────────

export function getAllPrintJobs(): PrintJobDTO[] {
  const db = getDatabase();
  if (!db) return [];
  try {
    const rows = db.prepare('SELECT * FROM print_queue ORDER BY created_at DESC LIMIT 100').all();
    return rows.map(mapRowToDTO);
  } catch (err: any) {
    console.error('[PrintQueueService] Error in getAllPrintJobs:', err);
    return [];
  }
}

export function getPrintJob(id: string): PrintJobDTO | null {
  const db = getDatabase();
  if (!db) return null;
  try {
    const row = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(id);
    return row ? mapRowToDTO(row) : null;
  } catch (err: any) {
    console.error('[PrintQueueService] Error in getPrintJob:', err);
    return null;
  }
}

export function getPendingPrintJobs(): PrintJobDTO[] {
  const db = getDatabase();
  if (!db) return [];
  try {
    const rows = db.prepare("SELECT * FROM print_queue WHERE status = 'PENDING' ORDER BY created_at ASC").all();
    return rows.map(mapRowToDTO);
  } catch (err: any) {
    console.error('[PrintQueueService] Error in getPendingPrintJobs:', err);
    return [];
  }
}

export function getFailedPrintJobs(): PrintJobDTO[] {
  const db = getDatabase();
  if (!db) return [];
  try {
    const rows = db.prepare("SELECT * FROM print_queue WHERE status IN ('FAILED', 'DEAD_LETTER') ORDER BY updated_at DESC").all();
    return rows.map(mapRowToDTO);
  } catch (err: any) {
    console.error('[PrintQueueService] Error in getFailedPrintJobs:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2: Manual Retry
// ─────────────────────────────────────────────────────────────────────────────

export function retryPrintJob(jobId: string): { success: boolean; error?: string } {
  const db = getDatabase();
  if (!db) return { success: false, error: 'Database not initialized' };

  try {
    const row = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(jobId) as any;
    if (!row) return { success: false, error: 'Job not found' };

    if (row.status !== 'FAILED' && row.status !== 'DEAD_LETTER') {
      return { success: false, error: `Only FAILED or DEAD_LETTER jobs can be retried (current status: ${row.status})` };
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE print_queue 
      SET status = 'PENDING', attempts = 0, last_error = NULL, next_retry_at = NULL, updated_at = ?
      WHERE id = ?
    `).run(now, jobId);

    console.log(`[PrintQueueService] 🔄 Retried job ${jobId} (reset from ${row.status} -> PENDING, attempts reset to 0)`);
    triggerQueueProcessing();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 3: Manual Reprint
// ─────────────────────────────────────────────────────────────────────────────

export async function reprintSession(sessionId: string): Promise<{ success: boolean; id?: string; error?: string }> {
  const db = getDatabase();
  if (!db) return { success: false, error: 'Database not initialized' };

  try {
    let filePath: string | null = null;
    let targetPrinter: string | null = null;
    let copies: number = 1;

    // 1. Find composite photo from sessions table
    const sessionRow = db.prepare('SELECT composite_path FROM sessions WHERE id = ?').get(sessionId) as any;
    if (sessionRow && sessionRow.composite_path) {
      filePath = sessionRow.composite_path;
    }

    // 2. Fallback to latest print_queue job for this session
    if (!filePath) {
      const lastJob = db.prepare(`
        SELECT file_path, printer_name, copies 
        FROM print_queue 
        WHERE session_id = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get(sessionId) as any;

      if (lastJob && lastJob.file_path) {
        filePath = lastJob.file_path;
        targetPrinter = lastJob.printer_name;
        copies = lastJob.copies || 1;
      }
    }

    if (!filePath) {
      return { success: false, error: `No composite photo found for session ${sessionId}` };
    }

    const cleanPath = filePath.replace(/^file:\/\/\/?/, '');

    // Ensure file exists on disk, attempt rehydration from R2 if pruned
    if (!fs.existsSync(cleanPath)) {
      await ensureCompositeOnDisk(sessionId, cleanPath);
    }

    const printer = targetPrinter || getDefaultPrinterName() || 'Default Printer';
    const newJobId = `print_reprint_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    // 3. Create new print_queue row (without modifying old job)
    db.prepare(`
      INSERT INTO print_queue (
        id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, last_error, next_retry_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 5, NULL, NULL, ?, ?)
    `).run(newJobId, sessionId, cleanPath, printer, copies, now, now);

    console.log(`[PrintQueueService] 🖨️ Manual reprint initiated: New job ${newJobId} created for session ${sessionId} (${cleanPath})`);
    triggerQueueProcessing();

    return { success: true, id: newJobId };
  } catch (err: any) {
    console.error('[PrintQueueService] Error in reprintSession:', err);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 4: Cancel Job
// ─────────────────────────────────────────────────────────────────────────────

export function cancelPrintJob(jobId: string): { success: boolean; error?: string } {
  const db = getDatabase();
  if (!db) return { success: false, error: 'Database not initialized' };

  try {
    const row = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(jobId) as any;
    if (!row) return { success: false, error: 'Job not found' };

    if (row.status === 'PRINTING') {
      return { success: false, error: 'Cannot cancel job currently printing' };
    }

    if (row.status === 'COMPLETED') {
      return { success: false, error: 'Cannot cancel job already completed' };
    }

    if (row.status === 'CANCELLED') {
      return { success: true };
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE print_queue 
      SET status = 'CANCELLED', updated_at = ?
      WHERE id = ?
    `).run(now, jobId);

    console.log(`[PrintQueueService] 🚫 Job ${jobId} status changed from ${row.status} to CANCELLED`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 5: Queue Status UI Support & Metrics
// ─────────────────────────────────────────────────────────────────────────────

export function getQueueMetrics(): QueueMetricsDTO {
  const db = getDatabase();
  const defaultMetrics: QueueMetricsDTO = {
    pending: 0,
    printing: 0,
    failed: 0,
    deadLetter: 0,
    completed: 0,
    cancelled: 0,
    total: 0,
  };

  if (!db) return defaultMetrics;

  try {
    const row = db.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'PRINTING' THEN 1 ELSE 0 END) as printing,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'DEAD_LETTER' THEN 1 ELSE 0 END) as deadLetter,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
        COUNT(*) as total
      FROM print_queue
    `).get() as any;

    if (!row) return defaultMetrics;

    return {
      pending: row.pending || 0,
      printing: row.printing || 0,
      failed: row.failed || 0,
      deadLetter: row.deadLetter || 0,
      completed: row.completed || 0,
      cancelled: row.cancelled || 0,
      total: row.total || 0,
    };
  } catch (err: any) {
    console.error('[PrintQueueService] Error calculating queue metrics:', err);
    return defaultMetrics;
  }
}

/**
 * Backward compatibility: get status of the print queue job for a session.
 */
export function getPrintQueueStatus(sessionId?: string): PrintJobDTO | null {
  const db = getDatabase();
  if (!db || !sessionId) return null;

  try {
    const row = db.prepare(`
      SELECT * FROM print_queue 
      WHERE session_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get(sessionId) as any;

    return row ? mapRowToDTO(row) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Start the background worker watchdog polling loop.
 * Polling acts as a safety net / watchdog while queue processing is event-driven.
 */
export function startPrintWorker(watchdogIntervalMs: number = 5000): void {
  // 1. Startup Recovery: reconcile any hanging jobs from crashes
  reconcileStartupPrintJobs();

  if (printWorkerInterval) {
    clearInterval(printWorkerInterval);
  }

  // 2. Event-driven kickoff for any recovered/pending jobs on boot
  triggerQueueProcessing();

  // 3. Watchdog timer for retries and safety net
  printWorkerInterval = setInterval(() => {
    triggerQueueProcessing();
  }, watchdogIntervalMs);

  console.log(`[PrintQueueService] ✓ Event-driven print queue worker active (Watchdog: ${watchdogIntervalMs}ms)`);
}

/**
 * Stop the background worker.
 */
export function stopPrintWorker(): void {
  if (printWorkerInterval) {
    clearInterval(printWorkerInterval);
    printWorkerInterval = null;
    console.log('[PrintQueueService] Print queue worker stopped');
  }
}

/**
 * Register IPC handlers for Print Queue.
 */
export function registerPrintQueueHandlers(): void {
  ipcMain.handle('printer:enqueue', async (_event, filePath: string, copies: number = 1, sessionId?: string) => {
    const sId = sessionId || `session_${Date.now()}`;
    return enqueuePrintJob(sId, filePath, copies);
  });

  // Monitoring
  ipcMain.handle('printer:get-all', async () => {
    return getAllPrintJobs();
  });

  ipcMain.handle('printer:get-job', async (_event, id: string) => {
    return getPrintJob(id);
  });

  ipcMain.handle('printer:get-pending', async () => {
    return getPendingPrintJobs();
  });

  ipcMain.handle('printer:get-failed', async () => {
    return getFailedPrintJobs();
  });

  // Actions
  ipcMain.handle('printer:retry-job', async (_event, jobId: string) => {
    return retryPrintJob(jobId);
  });

  ipcMain.handle('printer:reprint-session', async (_event, sessionId: string) => {
    return reprintSession(sessionId);
  });

  ipcMain.handle('printer:cancel-job', async (_event, jobId: string) => {
    return cancelPrintJob(jobId);
  });

  ipcMain.handle('printer:queue-metrics', async () => {
    return getQueueMetrics();
  });

  // Backward compatibility
  ipcMain.handle('printer:queue-status', async (_event, sessionId: string) => {
    return getPrintQueueStatus(sessionId);
  });

  ipcMain.handle('printer:queue-list', async () => {
    return getAllPrintJobs();
  });

  ipcMain.handle('printer:recover-job', async (_event, jobId: string) => {
    return retryPrintJob(jobId);
  });
}
