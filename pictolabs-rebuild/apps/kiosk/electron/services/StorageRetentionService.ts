import * as fs from 'fs';
import * as path from 'path';
import { ipcMain } from 'electron';
import { getDatabase, getUploadQueueItemByPath } from './SyncEngine';

/**
 * StorageRetentionService — Local Kiosk Media Storage Lifecycle & Purge Daemon
 *
 * Requirements:
 * 1. Local kiosk retention: 7 days.
 * 2. Strict condition: Media files are deleted ONLY if upload status == 'COMPLETED'.
 * 3. AC-5.1: Media older than 7 days and marked COMPLETED in upload_queue are purged automatically.
 * 4. AC-5.2: Files NOT marked COMPLETED (PENDING, UPLOADING, FAILED, or untracked) are PRESERVED regardless of age.
 * 5. Disk Safeguard: If free disk space drops below 5 GB, oldest COMPLETED media files are purged early.
 */

export interface StorageRetentionOptions {
  mediaDirectories: string[];
  retentionDays?: number; // default: 7 days
  minFreeDiskGb?: number; // default: 5 GB
  runIntervalMs?: number; // default: 24 hours
}

export interface RetentionCleanupResult {
  scannedFiles: number;
  purgedFiles: number;
  skippedUncompletedFiles: number;
  freedBytes: number;
  freedFormatted: string;
  diskFreeGb: number;
  timestamp: string;
}

export interface RetentionStats {
  retentionDays: number;
  minFreeDiskGb: number;
  diskFreeGb: number;
  lastRunResult: RetentionCleanupResult | null;
}

let retentionOptions: StorageRetentionOptions = {
  mediaDirectories: [],
  retentionDays: 7,
  minFreeDiskGb: 5,
  runIntervalMs: 24 * 60 * 60 * 1000,
};

let retentionInterval: ReturnType<typeof setInterval> | null = null;
let lastCleanupResult: RetentionCleanupResult | null = null;

/**
 * Format bytes into human readable string (KB, MB, GB).
 */
function formatBytes(bytes: number): string {
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
 * Run storage retention cleanup cycle.
 */
export function runRetentionCleanupNow(): RetentionCleanupResult {
  const retentionDays = retentionOptions.retentionDays ?? 7;
  const minFreeDiskGb = retentionOptions.minFreeDiskGb ?? 5;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  let scannedCount = 0;
  let purgedCount = 0;
  let skippedCount = 0;
  let freedBytes = 0;

  console.log(`[StorageRetentionService] Starting media retention cleanup (Rule: >${retentionDays} days AND status == COMPLETED)...`);

  const completedFilesCandidates: { filePath: string; mtimeMs: number; size: number }[] = [];

  for (const dir of retentionOptions.mediaDirectories) {
    if (!fs.existsSync(dir)) continue;

    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (_) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch (_) {
        continue;
      }

      if (!stat.isFile()) continue;
      scannedCount++;

      const fileAgeMs = now - stat.mtimeMs;
      const fileAgeDays = fileAgeMs / (1000 * 60 * 60 * 24);

      // Check upload queue record in SQLite
      const queueItem = getUploadQueueItemByPath(fullPath);
      const isCompleted = queueItem?.status === 'COMPLETED';

      if (isCompleted) {
        completedFilesCandidates.push({
          filePath: fullPath,
          mtimeMs: stat.mtimeMs,
          size: stat.size,
        });
      }

      // Tier 1: 7-Day Local Retention Check
      if (fileAgeMs >= retentionMs) {
        if (isCompleted) {
          // SAFE TO PURGE: older than 7 days AND verified uploaded to cloud
          try {
            fs.unlinkSync(fullPath);
            purgedCount++;
            freedBytes += stat.size;
            console.log(
              `[StorageRetentionService] ✓ PURGED expired media: ${entry} (Age: ${fileAgeDays.toFixed(1)}d, upload status: COMPLETED)`
            );
          } catch (err: any) {
            console.warn(`[StorageRetentionService] Failed unlinking ${fullPath}:`, err.message);
          }
        } else {
          // STRICT SAFETY GUARD: Do NOT delete uncompleted files!
          skippedCount++;
          console.warn(
            `[StorageRetentionService] 🛡 PRESERVED local file: ${entry} (Age: ${fileAgeDays.toFixed(1)}d > ${retentionDays}d, upload status is '${queueItem?.status || 'NOT_ENQUEUED'}')`
          );
        }
      }
    }
  }

  // Tier 2: Low Disk Space Safeguard (< 5 GB)
  let currentDiskFreeGb = getFreeDiskSpaceGb();
  if (currentDiskFreeGb < minFreeDiskGb) {
    console.warn(
      `[StorageRetentionService] Low disk space detected (${currentDiskFreeGb} GB < ${minFreeDiskGb} GB threshold). Activating emergency completed media purge...`
    );

    // Sort completed files by mtime ascending (oldest first)
    completedFilesCandidates.sort((a, b) => a.mtimeMs - b.mtimeMs);

    for (const candidate of completedFilesCandidates) {
      if (currentDiskFreeGb >= minFreeDiskGb) break;
      if (!fs.existsSync(candidate.filePath)) continue;

      try {
        fs.unlinkSync(candidate.filePath);
        purgedCount++;
        freedBytes += candidate.size;
        console.log(
          `[StorageRetentionService] ✓ SAFEGUARD PURGED oldest completed media: ${path.basename(candidate.filePath)}`
        );
        currentDiskFreeGb = getFreeDiskSpaceGb();
      } catch (_) {}
    }
  }

  const result: RetentionCleanupResult = {
    scannedFiles: scannedCount,
    purgedFiles: purgedCount,
    skippedUncompletedFiles: skippedCount,
    freedBytes,
    freedFormatted: formatBytes(freedBytes),
    diskFreeGb: currentDiskFreeGb,
    timestamp: new Date().toISOString(),
  };

  lastCleanupResult = result;
  console.log(
    `[StorageRetentionService] Cleanup finished: ${purgedCount} purged, ${skippedCount} preserved, ${formatBytes(freedBytes)} freed. Free disk: ${currentDiskFreeGb} GB.`
  );

  return result;
}

/**
 * Get current retention policy telemetry and stats.
 */
export function getRetentionStats(): RetentionStats {
  return {
    retentionDays: retentionOptions.retentionDays ?? 7,
    minFreeDiskGb: retentionOptions.minFreeDiskGb ?? 5,
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
    `[StorageRetentionService] Initialized with 7-day retention policy and 5GB safeguard threshold.`
  );

  // Register IPC handlers for renderer / dev tools
  ipcMain.handle('retention:run-cleanup', async () => {
    return runRetentionCleanupNow();
  });

  ipcMain.handle('retention:get-stats', async () => {
    return getRetentionStats();
  });

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
