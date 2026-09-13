import * as fs from 'fs';
import * as path from 'path';
import { ipcMain } from 'electron';
import {
  getDatabase,
  getUploadQueueItemByPath,
  isPrintAssetSettled,
  isPathTrackedInSession,
  markSessionStoragePruned,
  runDatabaseCompaction,
} from './SyncEngine';
import { isPrintJobPendingOrPrinting } from './PrintQueueService';
import { isPathTrackedInActiveLedger } from './RecoveryLedgerService';

/**
 * StorageRetentionService — Local Kiosk Media Storage Lifecycle & Purge Daemon
 *
 * Requirements (Phase 3.2C):
 * 1. Three-Key Safety Lock:
 *    - Key 1: Operational TTL (Age >= 7 days under normal operation, >= 48h under low-disk emergency).
 *    - Key 2: Cloud Sync Verified (upload_queue.status == 'COMPLETED').
 *    - Key 3: Print Queue Settled (print_queue status == 'COMPLETED' / no active print job).
 * 2. Transient & Orphan Janitor:
 *    - Cleans up leftover .webm countdown files, *_concat.txt manifests, and abandoned retake captures.
 * 3. Priority Low-Disk Safeguard (< 5 GB):
 *    - Emergency waterfall: Cleans transient/orphans -> Completed Raw Photos (>48h) -> Completed Videos (>48h) -> Completed Composites (>48h).
 * 4. Zero Photo Loss & Zero Spooler Race Conditions.
 * 5. Windows File Lock Tolerance (EBUSY / EPERM caught safely).
 */

/**
 * Pictolabs Dual-Tier Storage Retention Policy & Watermarks
 */
export const RETENTION_POLICY = {
  RAW_PHOTO_DAYS: 7,     // Raw DSLR camera captures (7 days local retention)
  COMPOSITE_DAYS: 7,     // 300 DPI composite print assets (7 days local retention)
  VIDEO_DAYS: 3,         // Live Photo MP4 & GIF motion clips (3 days local retention)
  CLOUD_DAYS: 30,        // Cloudflare R2 bucket retention (30 days cloud lifecycle)
  WARNING_DISK_GB: 10,   // Elevated warning telemetry threshold (10 GB)
  EMERGENCY_DISK_GB: 5,  // Emergency Priority Waterfall threshold (5 GB)
  CRITICAL_DISK_GB: 2,   // Critical kiosk lockout threshold (2 GB)
};

export interface StorageRetentionOptions {
  mediaDirectories: string[];
  retentionDays?: number; // fallback: 7 days
  rawPhotoRetentionDays?: number; // default: 7 days
  compositeRetentionDays?: number; // default: 7 days
  videoRetentionDays?: number; // default: 3 days
  warningFreeDiskGb?: number; // default: 10 GB
  minFreeDiskGb?: number; // default: 5 GB
  criticalFreeDiskGb?: number; // default: 2 GB
  runIntervalMs?: number; // default: 24 hours
  dryRun?: boolean;
}

export interface RetentionCleanupResult {
  scannedFiles: number;
  purgedFiles: number;
  orphansCleaned: number;
  skippedUncompletedFiles: number;
  skippedActivePrintFiles: number;
  freedBytes: number;
  freedFormatted: string;
  diskFreeGb: number;
  timestamp: string;
}

export interface RetentionStats {
  retentionDays: number;
  rawPhotoRetentionDays: number;
  compositeRetentionDays: number;
  videoRetentionDays: number;
  warningFreeDiskGb: number;
  minFreeDiskGb: number;
  criticalFreeDiskGb: number;
  diskFreeGb: number;
  lastRunResult: RetentionCleanupResult | null;
}

export interface ThreeKeyEvaluation {
  canPurge: boolean;
  effectiveTtlDays: number;
  key1_ttlPassed: boolean;
  key2_cloudUploaded: boolean;
  key3_printSettled: boolean;
  reason: string;
}

let retentionOptions: StorageRetentionOptions = {
  mediaDirectories: [],
  retentionDays: 7,
  rawPhotoRetentionDays: 7,
  compositeRetentionDays: 7,
  videoRetentionDays: 3,
  warningFreeDiskGb: 10,
  minFreeDiskGb: 5,
  criticalFreeDiskGb: 2,
  runIntervalMs: 24 * 60 * 60 * 1000,
};

let retentionInterval: ReturnType<typeof setInterval> | null = null;
let lastCleanupResult: RetentionCleanupResult | null = null;
let isDiskLockedOut = false;

export interface DiskWatchdogStatus {
  freeDiskGb: number;
  watermark: 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'CRITICAL';
  isLockedOut: boolean;
  purgedFiles: number;
}

/**
 * Format bytes into human readable string (KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Measure available free disk space in Gigabytes.
 */
export function getFreeDiskSpaceGb(targetPath?: string): number {
  const dirToCheck = targetPath || retentionOptions.mediaDirectories[0] || process.cwd();
  try {
    if (fs.existsSync(dirToCheck)) {
      const statfs = fs.statfsSync(dirToCheck);
      const freeBytes = Number(statfs.bfree) * Number(statfs.bsize);
      return Number((freeBytes / (1024 * 1024 * 1024)).toFixed(2));
    }
  } catch (err: any) {
    console.warn(`[StorageRetentionService] Unable to stat disk free space: ${err.message}`);
  }
  return 999; // Assume plenty if undetectable
}

/**
 * Evaluates the authoritative Three-Key Safety Lock for a file:
 * Key 1: File Age >= asset-specific TTL (Raw: 7d, Composite: 7d, Video: 3d)
 * Key 2: upload_queue.status == 'COMPLETED'
 * Key 3: print_queue is settled (no PENDING / PRINTING jobs)
 */
export function evaluateThreeKeyLock(
  filePath: string,
  stat: fs.Stats,
  retentionDaysOverride?: number
): ThreeKeyEvaluation {
  const now = Date.now();
  const fileAgeMs = now - stat.mtimeMs;

  // Determine TTL based on asset type
  let effectiveTtlDays = retentionDaysOverride ?? RETENTION_POLICY.RAW_PHOTO_DAYS;
  if (!retentionDaysOverride) {
    if (filePath.endsWith('.mp4') || filePath.endsWith('.gif') || filePath.includes('videos')) {
      effectiveTtlDays = RETENTION_POLICY.VIDEO_DAYS; // 3 Days
    } else if (filePath.includes('composites') || path.basename(filePath).startsWith('composite_')) {
      effectiveTtlDays = RETENTION_POLICY.COMPOSITE_DAYS; // 7 Days
    } else {
      effectiveTtlDays = RETENTION_POLICY.RAW_PHOTO_DAYS; // 7 Days
    }
  }

  const retentionMs = effectiveTtlDays * 24 * 60 * 60 * 1000;

  // Key 1: Operational TTL
  const key1_ttlPassed = fileAgeMs >= retentionMs;

  // Key 2: Confirmed Cloud Upload
  const uploadItem = getUploadQueueItemByPath(filePath);
  const key2_cloudUploaded = uploadItem?.status === 'COMPLETED';

  // Key 3: Print Queue Settlement
  const isPrintActive = isPrintJobPendingOrPrinting(filePath);
  const key3_printSettled = !isPrintActive && isPrintAssetSettled(filePath);

  const canPurge = key1_ttlPassed && key2_cloudUploaded && key3_printSettled;

  let reason = 'ALL_KEYS_PASSED';
  if (!key1_ttlPassed) {
    reason = `LOCKED_KEY1_TTL (${(fileAgeMs / 86400000).toFixed(1)}d < ${effectiveTtlDays}d)`;
  } else if (!key2_cloudUploaded) {
    reason = `LOCKED_KEY2_UPLOAD (${uploadItem?.status || 'NOT_ENQUEUED'})`;
  } else if (!key3_printSettled) {
    reason = 'LOCKED_KEY3_PRINT_ACTIVE';
  }

  return {
    canPurge,
    effectiveTtlDays,
    key1_ttlPassed,
    key2_cloudUploaded,
    key3_printSettled,
    reason,
  };
}

/**
 * Run orphan and transient janitor to remove abandoned temp files and retake discards.
 */
export function runOrphanJanitor(directories: string[]): { cleanedCount: number; freedBytes: number } {
  let cleanedCount = 0;
  let freedBytes = 0;
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const TWO_HOURS = 2 * ONE_HOUR;

  for (const dir of directories) {
    if (!fs.existsSync(dir)) continue;

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats | null;
      try {
        stat = statSyncSafe(fullPath);
        if (!stat || !stat.isFile()) continue;
      } catch (_) {
        continue;
      }

      const fileAgeMs = now - stat.mtimeMs;

      // 1. Transient WebM countdown clips older than 1 hour (unlinked after MP4 conversion)
      if (entry.endsWith('.webm') && fileAgeMs >= ONE_HOUR) {
        if (unlinkSafe(fullPath)) {
          cleanedCount++;
          freedBytes += stat.size;
          console.log(`[StorageRetentionService] ✓ JANITOR: Purged transient WebM clip: ${entry}`);
        }
        continue;
      }

      // 2. FFmpeg concatenation and temp manifests
      if ((entry.endsWith('_concat.txt') || entry.endsWith('.tmp')) && fileAgeMs >= ONE_HOUR) {
        if (unlinkSafe(fullPath)) {
          cleanedCount++;
          freedBytes += stat.size;
          console.log(`[StorageRetentionService] ✓ JANITOR: Purged temp manifest: ${entry}`);
        }
        continue;
      }

      // 3. Untracked camera capture discards (e.g. customer retook photo) older than 2 hours
      if (entry.startsWith('capture_') && entry.endsWith('.jpg') && fileAgeMs >= TWO_HOURS) {
        const isTracked = isPathTrackedInSession(fullPath);
        const uploadItem = getUploadQueueItemByPath(fullPath);
        const isLedgerTracked = isPathTrackedInActiveLedger(fullPath);
        if (!isTracked && !uploadItem && !isLedgerTracked) {
          if (unlinkSafe(fullPath)) {
            cleanedCount++;
            freedBytes += stat.size;
            console.log(`[StorageRetentionService] ✓ JANITOR: Purged untracked retake capture: ${entry}`);
          }
        }
      }
    }
  }

  return { cleanedCount, freedBytes };
}

function statSyncSafe(targetPath: string): fs.Stats | null {
  try {
    return fs.statSync(targetPath);
  } catch (_) {
    return null;
  }
}

function unlinkSafe(targetPath: string): boolean {
  try {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return true;
    }
  } catch (err: any) {
    console.warn(`[StorageRetentionService] Failed unlinking ${targetPath} (lock/busy): ${err.message}`);
  }
  return false;
}

/**
 * Run comprehensive storage retention cleanup cycle.
 */
export function runRetentionCleanupNow(optionsOverride?: Partial<StorageRetentionOptions>): RetentionCleanupResult {
  const opts = { ...retentionOptions, ...optionsOverride };
  const retentionDays = opts.retentionDays ?? 7;
  const minFreeDiskGb = opts.minFreeDiskGb ?? 5;
  const now = Date.now();

  let scannedCount = 0;
  let purgedCount = 0;
  let skippedCount = 0;
  let skippedPrintCount = 0;
  let freedBytes = 0;

  console.log(`[StorageRetentionService] Starting media retention cleanup (Three-Key Lock: >${retentionDays}d, upload=COMPLETED, print=SETTLED)...`);

  // STEP 1: Run Orphan Janitor for transient & abandoned files
  const janitorResult = runOrphanJanitor(opts.mediaDirectories);
  freedBytes += janitorResult.freedBytes;

  interface CandidateFile {
    filePath: string;
    fileType: 'raw' | 'video' | 'composite';
    mtimeMs: number;
    size: number;
    sessionId?: string;
  }

  const completedCandidates: CandidateFile[] = [];

  // STEP 2: Scan media directories and evaluate Three-Key Lock
  for (const dir of opts.mediaDirectories) {
    if (!fs.existsSync(dir)) continue;

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = statSyncSafe(fullPath);
      if (!stat || !stat.isFile()) continue;

      scannedCount++;

      const evaluation = evaluateThreeKeyLock(fullPath, stat, retentionDays);
      const uploadItem = getUploadQueueItemByPath(fullPath);

      if (uploadItem?.status === 'COMPLETED') {
        const fileType: 'raw' | 'video' | 'composite' =
          uploadItem.fileType === 'raw' || dir.includes('captures')
            ? 'raw'
            : uploadItem.fileType === 'video' || dir.includes('videos')
            ? 'video'
            : 'composite';

        completedCandidates.push({
          filePath: fullPath,
          fileType,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          sessionId: uploadItem.sessionId,
        });
      }

      // Normal Tier 1 (7-Day TTL) Purge
      if (evaluation.canPurge) {
        if (unlinkSafe(fullPath)) {
          purgedCount++;
          freedBytes += stat.size;
          console.log(`[StorageRetentionService] ✓ PURGED expired media: ${entry} (${evaluation.reason})`);
          if (uploadItem?.sessionId) {
            markSessionStoragePruned(uploadItem.sessionId);
          }
        }
      } else {
        if (!evaluation.key3_printSettled) {
          skippedPrintCount++;
          console.warn(`[StorageRetentionService] 🛡 PRESERVED file (Print Job Active): ${entry}`);
        } else if (!evaluation.key2_cloudUploaded && evaluation.key1_ttlPassed) {
          skippedCount++;
          console.warn(`[StorageRetentionService] 🛡 PRESERVED file (Upload Not Completed): ${entry} (${evaluation.reason})`);
        }
      }
    }
  }

  // STEP 3: Disk Watermark Checks & Priority Low-Disk Safeguard
  let currentDiskFreeGb = getFreeDiskSpaceGb();
  const warningDiskGb = opts.warningFreeDiskGb ?? RETENTION_POLICY.WARNING_DISK_GB;
  const criticalDiskGb = opts.criticalFreeDiskGb ?? RETENTION_POLICY.CRITICAL_DISK_GB;
  const emergencyDiskGb = opts.minFreeDiskGb ?? RETENTION_POLICY.EMERGENCY_DISK_GB;

  // Watermark logging
  if (currentDiskFreeGb < criticalDiskGb) {
    console.error(
      `[StorageRetentionService] 🚨 CRITICAL DISK WATERMARK: Free disk space is critically low (${currentDiskFreeGb} GB < ${criticalDiskGb} GB)! Kiosk lockout advised.`
    );
  } else if (currentDiskFreeGb < warningDiskGb) {
    console.warn(
      `[StorageRetentionService] ⚠️ WARNING DISK WATERMARK: Free disk space is degraded (${currentDiskFreeGb} GB < ${warningDiskGb} GB). Proactive purge advised.`
    );
  }

  if (currentDiskFreeGb < emergencyDiskGb) {
    console.warn(
      `[StorageRetentionService] Low disk space detected (${currentDiskFreeGb} GB < ${emergencyDiskGb} GB threshold). Activating Priority Waterfall purge...`
    );

    const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

    // Filter candidates that have surpassed the 48h emergency threshold
    const eligibleEmergency = completedCandidates.filter(
      (c) => now - c.mtimeMs >= TWO_DAYS_MS && fs.existsSync(c.filePath)
    );

    // Priority 1: Raw Photos (Largest space saver)
    const rawCandidates = eligibleEmergency
      .filter((c) => c.fileType === 'raw')
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Priority 2: Videos (MP4/GIF)
    const videoCandidates = eligibleEmergency
      .filter((c) => c.fileType === 'video')
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    // Priority 3: Composites (Only if print settled)
    const compositeCandidates = eligibleEmergency
      .filter((c) => c.fileType === 'composite' && isPrintAssetSettled(c.filePath))
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    const waterfallQueue = [...rawCandidates, ...videoCandidates, ...compositeCandidates];

    for (const candidate of waterfallQueue) {
      if (currentDiskFreeGb >= emergencyDiskGb) break;
      if (!fs.existsSync(candidate.filePath)) continue;

      if (unlinkSafe(candidate.filePath)) {
        purgedCount++;
        freedBytes += candidate.size;
        console.log(`[StorageRetentionService] ✓ EMERGENCY PURGED (${candidate.fileType}): ${path.basename(candidate.filePath)}`);
        if (candidate.sessionId) {
          markSessionStoragePruned(candidate.sessionId);
        }
        currentDiskFreeGb = getFreeDiskSpaceGb();
      }
    }
  }

  // STEP 4: Database Maintenance (Checkpoint WAL)
  try {
    runDatabaseCompaction();
  } catch (_) {}

  const result: RetentionCleanupResult = {
    scannedFiles: scannedCount,
    purgedFiles: purgedCount,
    orphansCleaned: janitorResult.cleanedCount,
    skippedUncompletedFiles: skippedCount,
    skippedActivePrintFiles: skippedPrintCount,
    freedBytes,
    freedFormatted: formatBytes(freedBytes),
    diskFreeGb: currentDiskFreeGb,
    timestamp: new Date().toISOString(),
  };

  lastCleanupResult = result;
  console.log(
    `[StorageRetentionService] Cleanup finished: ${purgedCount} purged (${janitorResult.cleanedCount} orphans), ${skippedCount} preserved, ${formatBytes(freedBytes)} freed. Free disk: ${currentDiskFreeGb} GB.`
  );

  return result;
}

/**
 * Get current retention policy telemetry and stats.
 */
export function getRetentionStats(): RetentionStats {
  return {
    retentionDays: retentionOptions.retentionDays ?? RETENTION_POLICY.RAW_PHOTO_DAYS,
    rawPhotoRetentionDays: retentionOptions.rawPhotoRetentionDays ?? RETENTION_POLICY.RAW_PHOTO_DAYS,
    compositeRetentionDays: retentionOptions.compositeRetentionDays ?? RETENTION_POLICY.COMPOSITE_DAYS,
    videoRetentionDays: retentionOptions.videoRetentionDays ?? RETENTION_POLICY.VIDEO_DAYS,
    warningFreeDiskGb: retentionOptions.warningFreeDiskGb ?? RETENTION_POLICY.WARNING_DISK_GB,
    minFreeDiskGb: retentionOptions.minFreeDiskGb ?? RETENTION_POLICY.EMERGENCY_DISK_GB,
    criticalFreeDiskGb: retentionOptions.criticalFreeDiskGb ?? RETENTION_POLICY.CRITICAL_DISK_GB,
    diskFreeGb: getFreeDiskSpaceGb(),
    lastRunResult: lastCleanupResult,
  };
}

/**
 * Initialize Storage Retention Daemon on kiosk startup.
 */
export function initStorageRetention(options: StorageRetentionOptions): void {
  retentionOptions = {
    ...retentionOptions,
    ...options,
  };

  console.log(
    `[StorageRetentionService] Initialized with ${retentionOptions.retentionDays ?? 7}-day retention policy and ${retentionOptions.minFreeDiskGb ?? 5}GB safeguard threshold.`
  );

  // Register IPC handlers for renderer / dev tools (if running inside Electron runtime)
  if (ipcMain && typeof ipcMain.handle === 'function') {
    ipcMain.handle('retention:run-cleanup', async () => {
      return runRetentionCleanupNow();
    });

    ipcMain.handle('retention:get-stats', async () => {
      return getRetentionStats();
    });

    ipcMain.handle('retention:is-locked-out', async () => {
      return getIsDiskLockedOut();
    });

    ipcMain.handle('retention:eval-watchdog', async () => {
      return evaluateDiskSpaceWatchdog();
    });
  }

  // Run once shortly after startup (deferred 5 seconds to allow sync engine init)
  setTimeout(() => {
    try {
      runRetentionCleanupNow();
    } catch (err: any) {
      console.warn(`[StorageRetentionService] Initial cleanup run error:`, err.message);
    }
  }, 5000);

  // Schedule daily periodic execution
  const intervalMs = retentionOptions.runIntervalMs || 24 * 60 * 60 * 1000;
  retentionInterval = setInterval(() => {
    try {
      runRetentionCleanupNow();
    } catch (err: any) {
      console.warn(`[StorageRetentionService] Periodic cleanup error:`, err.message);
    }
  }, intervalMs);
}

/**
 * Stop the Storage Retention Daemon on app quit.
 */
export function stopStorageRetention(): void {
  if (retentionInterval) {
    clearInterval(retentionInterval);
    retentionInterval = null;
  }
}

export function getIsDiskLockedOut(): boolean {
  return isDiskLockedOut;
}

export function setDiskLockedOut(locked: boolean): void {
  isDiskLockedOut = locked;
}

/**
 * Priority 4: Disk Space Watchdog Evaluation Routine
 * Inspects free disk space, runs immediate emergency purge if degraded,
 * and engages/disengages maintenance lockout with 3GB hysteresis.
 */
export function evaluateDiskSpaceWatchdog(): DiskWatchdogStatus {
  const freeDiskGb = getFreeDiskSpaceGb();
  const warningDiskGb = retentionOptions.warningFreeDiskGb ?? RETENTION_POLICY.WARNING_DISK_GB; // 10 GB
  const emergencyDiskGb = retentionOptions.minFreeDiskGb ?? RETENTION_POLICY.EMERGENCY_DISK_GB; // 5 GB
  const criticalDiskGb = retentionOptions.criticalFreeDiskGb ?? RETENTION_POLICY.CRITICAL_DISK_GB; // 2 GB

  let watermark: 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'CRITICAL' = 'NORMAL';
  let purgedFiles = 0;

  if (freeDiskGb < criticalDiskGb) {
    watermark = 'CRITICAL';
    isDiskLockedOut = true;
    console.error(
      `[StorageRetentionService] 🚨 CRITICAL DISK WATCHDOG: ${freeDiskGb} GB < ${criticalDiskGb} GB. Maintenance lockout ENGAGED.`
    );
    try {
      const res = runRetentionCleanupNow();
      purgedFiles = res.purgedFiles;
    } catch (_) {}
  } else if (freeDiskGb < emergencyDiskGb) {
    watermark = 'EMERGENCY';
    console.warn(
      `[StorageRetentionService] ⚠️ EMERGENCY DISK WATCHDOG: ${freeDiskGb} GB < ${emergencyDiskGb} GB. Running Waterfall Purge.`
    );
    try {
      const res = runRetentionCleanupNow();
      purgedFiles = res.purgedFiles;
    } catch (_) {}
  } else if (freeDiskGb < warningDiskGb) {
    watermark = 'WARNING';
  } else {
    watermark = 'NORMAL';
    // Hysteresis: clear lockout if free disk recovered >= emergency threshold (5.0 GB)
    if (isDiskLockedOut && freeDiskGb >= emergencyDiskGb) {
      isDiskLockedOut = false;
      console.log(
        `[StorageRetentionService] ✓ Disk space recovered (${freeDiskGb} GB >= ${emergencyDiskGb} GB). Maintenance lockout DISENGAGED.`
      );
    }
  }

  return {
    freeDiskGb,
    watermark,
    isLockedOut: isDiskLockedOut,
    purgedFiles,
  };
}

