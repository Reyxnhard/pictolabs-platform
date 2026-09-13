import { app, BrowserWindow, ipcMain } from 'electron';
import { resetStuckUploadWorker, getUploadQueueHealth, recordSystemEvent } from './SyncEngine';
import { resetStuckPrintJobs, getPrintQueueHealth } from './PrintQueueService';
import { evaluateDiskSpaceWatchdog, getIsDiskLockedOut } from './StorageRetentionService';
import { expireStaleLedgerEntries, updateRecoveryCheckpoint } from './RecoveryLedgerService';
import { stopLiveViewInternal } from './CameraService';

/**
 * Pictolabs Photobooth — Phase 3.2E Watchdog Service
 *
 * Coordinates 5 In-Process Supervisor Layers:
 * 1. Upload Watchdog: Rescues stuck in-flight R2/HTTP uploads and resets deadlocks
 * 2. Print Watchdog: Rescues stuck print jobs and cleans up hung spooler child processes
 * 3. Session Watchdog: Detects customer walkaway (>120s idle) and resets kiosk to welcome
 * 4. Disk Space Watchdog: Monitors free disk space every 60s and engages lockout if <2GB
 * 5. Memory Watchdog: Flushes Sharp buffers, triggers GC (>500MB), and soft-restarts when idle (>800MB)
 */

export interface WatchdogOptions {
  checkIntervalMs?: number;
  sessionTimeoutMs?: number;
  captureTimeoutMs?: number;
  uploadTimeoutMs?: number;
  printTimeoutMs?: number;
}

export interface WatchdogTelemetryDTO {
  uptimeSeconds: number;
  processUptimeSeconds: number;
  currentScreen: string;
  lastActivityAgoSec: number;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
  disk: {
    freeDiskGb: number;
    watermark: 'NORMAL' | 'WARNING' | 'EMERGENCY' | 'CRITICAL';
    isLockedOut: boolean;
  };
  uploadQueue: {
    isUploading: boolean;
    pendingCount: number;
    uploadingCount: number;
    failedCount: number;
    deadLetterCount: number;
    stuckCount: number;
  };
  printQueue: {
    isProcessing: boolean;
    pendingCount: number;
    printingCount: number;
    failedCount: number;
    deadLetterCount: number;
    stuckCount: number;
  };
  timestamp: string;
}

let watchdogInterval: NodeJS.Timeout | null = null;
let lastActivityTimestamp = Date.now();
let currentScreen = 'welcome';
let activeSessionId: string | null = null;
let criticalMemoryStreak = 0;
let isWatchdogRunning = false;

let options: Required<WatchdogOptions> = {
  checkIntervalMs: 15_000,
  sessionTimeoutMs: 120_000,
  captureTimeoutMs: 180_000,
  uploadTimeoutMs: 60_000,
  printTimeoutMs: 120_000,
};

/**
 * Pulse user interaction activity from renderer.
 */
export function pulseActivity(screen?: string, sessionId?: string): void {
  lastActivityTimestamp = Date.now();
  if (screen) currentScreen = screen;
  if (sessionId !== undefined) activeSessionId = sessionId;
}

/**
 * Set active screen and session ID for watchdog context.
 */
export function setWatchdogScreen(screen: string, sessionId?: string | null): void {
  currentScreen = screen;
  lastActivityTimestamp = Date.now();
  if (sessionId !== undefined) activeSessionId = sessionId;
}

export function getCurrentWatchdogScreen(): string {
  return currentScreen;
}

export function getActiveWatchdogSessionId(): string | null {
  return activeSessionId;
}

/**
 * Core Watchdog Cycle: Evaluates all 5 watchdog components.
 */
export function runWatchdogCycle(): {
  uploadRescued: number;
  printRescued: number;
  sessionReset: boolean;
  diskLockedOut: boolean;
  memoryCleaned: boolean;
} {
  const result = {
    uploadRescued: 0,
    printRescued: 0,
    sessionReset: false,
    diskLockedOut: false,
    memoryCleaned: false,
  };

  // 1. Priority 1: Upload Watchdog
  try {
    const uploadRes = resetStuckUploadWorker(options.uploadTimeoutMs);
    result.uploadRescued = uploadRes.rescuedCount;
  } catch (err: any) {
    console.warn('[WatchdogService] Upload watchdog check error:', err?.message);
  }

  // 2. Priority 2: Print Watchdog
  try {
    const printRes = resetStuckPrintJobs(options.printTimeoutMs);
    result.printRescued = printRes.rescuedCount;
  } catch (err: any) {
    console.warn('[WatchdogService] Print watchdog check error:', err?.message);
  }

  // 3. Priority 3: Session Watchdog (Inactivity)
  try {
    const isCustomerScreen = currentScreen !== 'welcome' && currentScreen !== 'admin';
    const effectiveTimeout = currentScreen === 'capture' ? options.captureTimeoutMs : options.sessionTimeoutMs;
    const idleTime = Date.now() - lastActivityTimestamp;

    if (isCustomerScreen && idleTime > effectiveTimeout) {
      console.warn(`[WatchdogService] ⚠️ Customer inactivity timeout detected (${Math.round(idleTime / 1000)}s idle on ${currentScreen}). Resetting to welcome.`);
      result.sessionReset = true;

      // Safe checkpoint if paid session was in progress
      if (activeSessionId) {
        try {
          updateRecoveryCheckpoint(
            activeSessionId,
            'CAPTURING',
            0,
            {},
            'INACTIVITY_ABANDONED_PRESERVED_FOR_RECOVERY'
          );
        } catch (_) {}
      }

      // Stop camera LiveView to conserve DSLR sensor and CPU
      stopLiveViewInternal();

      // Force navigate renderer back to WelcomeScreen
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('watchdog:force-welcome');
        }
      }

      recordSystemEvent(
        'SESSION_INACTIVITY_TIMEOUT',
        'WARN',
        'SessionWatchdog',
        `Kiosk reset from screen '${currentScreen}' after ${Math.round(idleTime / 1000)}s idle.`
      );

      currentScreen = 'welcome';
      activeSessionId = null;
      lastActivityTimestamp = Date.now();
    }
  } catch (err: any) {
    console.warn('[WatchdogService] Session watchdog check error:', err?.message);
  }

  // 4. Priority 4: Disk Space Watchdog
  try {
    const diskStatus = evaluateDiskSpaceWatchdog();
    result.diskLockedOut = diskStatus.isLockedOut;

    if (diskStatus.isLockedOut) {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('retention:lockout', true);
        }
      }
    }
  } catch (err: any) {
    console.warn('[WatchdogService] Disk space watchdog check error:', err?.message);
  }

  // 5. Priority 5: Memory Watchdog
  try {
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / (1024 * 1024));
    const rssMb = Math.round(mem.rss / (1024 * 1024));

    // Level 1: Warning (> 500 MB heap or > 1.2 GB RSS)
    if (heapUsedMb > 500 || rssMb > 1200) {
      result.memoryCleaned = true;
      console.warn(`[WatchdogService] ⚠️ High memory detected: Heap ${heapUsedMb}MB, RSS ${rssMb}MB. Running proactive cleanup.`);

      // Trigger V8 garbage collection if exposed
      if (typeof global.gc === 'function') {
        global.gc();
      }

      // Flush Sharp buffer cache
      try {
        const sharp = require('sharp');
        sharp.cache(false);
        sharp.cache(true);
      } catch (_) {}

      // If not on capture screen, guarantee LiveView is terminated
      if (currentScreen !== 'capture') {
        stopLiveViewInternal();
      }

      recordSystemEvent(
        'MEMORY_WARNING_CLEANUP',
        'WARN',
        'MemoryWatchdog',
        `Heap: ${heapUsedMb}MB, RSS: ${rssMb}MB. Garbage collection and Sharp buffer flush executed.`
      );
    }

    // Level 2: Critical (> 800 MB heap or > 1.8 GB RSS across 3 consecutive checks)
    if (heapUsedMb > 800 || rssMb > 1800) {
      criticalMemoryStreak++;
      console.error(`[WatchdogService] 🚨 CRITICAL MEMORY STREAK (${criticalMemoryStreak}/3): Heap ${heapUsedMb}MB, RSS ${rssMb}MB.`);

      if (criticalMemoryStreak >= 3) {
        if (currentScreen === 'welcome') {
          console.error('[WatchdogService] Executing graceful soft-restart while idle at WelcomeScreen to reclaim memory...');
          recordSystemEvent(
            'MEMORY_CRITICAL_SOFT_RESTART',
            'CRITICAL',
            'MemoryWatchdog',
            `Soft restart triggered. Heap: ${heapUsedMb}MB, RSS: ${rssMb}MB.`
          );
          if (app) {
            app.relaunch();
            app.exit(0);
          }
        } else {
          console.warn('[WatchdogService] Deferring soft restart: Customer session currently active on screen:', currentScreen);
        }
      }
    } else {
      criticalMemoryStreak = 0;
    }
  } catch (err: any) {
    console.warn('[WatchdogService] Memory watchdog check error:', err?.message);
  }

  // 6. Recovery Ledger Sweep (Sweep expired mid-captures every cycle)
  try {
    expireStaleLedgerEntries();
  } catch (_) {}

  return result;
}

/**
 * Returns aggregated production telemetry for HTTP Heartbeat and dashboard monitoring.
 */
export function getWatchdogTelemetry(): WatchdogTelemetryDTO {
  const mem = process.memoryUsage();
  const uploadHealth = getUploadQueueHealth();
  const printHealth = getPrintQueueHealth();
  const diskLocked = getIsDiskLockedOut();

  return {
    uptimeSeconds: Math.round(process.uptime()),
    processUptimeSeconds: Math.round(process.uptime()),
    currentScreen,
    lastActivityAgoSec: Math.round((Date.now() - lastActivityTimestamp) / 1000),
    memory: {
      heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
      heapTotalMb: Number((mem.heapTotal / (1024 * 1024)).toFixed(1)),
      rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
    },
    disk: {
      freeDiskGb: evaluateDiskSpaceWatchdog().freeDiskGb,
      watermark: evaluateDiskSpaceWatchdog().watermark,
      isLockedOut: diskLocked,
    },
    uploadQueue: uploadHealth,
    printQueue: printHealth,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Initialize Watchdog Service daemon and IPC handlers.
 */
export function initWatchdogService(customOptions?: WatchdogOptions): void {
  if (customOptions) {
    options = { ...options, ...customOptions };
  }

  if (watchdogInterval) {
    clearInterval(watchdogInterval);
  }

  isWatchdogRunning = true;
  lastActivityTimestamp = Date.now();

  // Register IPC Handlers (if running inside Electron runtime)
  if (ipcMain && typeof ipcMain.handle === 'function') {
    ipcMain.handle('watchdog:pulse', async (_event, screen?: string, sessionId?: string) => {
      pulseActivity(screen, sessionId);
      return { success: true };
    });

    ipcMain.handle('watchdog:set-screen', async (_event, screen: string, sessionId?: string | null) => {
      setWatchdogScreen(screen, sessionId);
      return { success: true };
    });

    ipcMain.handle('watchdog:status', async () => {
      return getWatchdogTelemetry();
    });

    ipcMain.handle('watchdog:trigger-cycle', async () => {
      return runWatchdogCycle();
    });
  }

  // Start periodic supervisor loop (default 15 seconds)
  watchdogInterval = setInterval(() => {
    try {
      runWatchdogCycle();
    } catch (err: any) {
      console.error('[WatchdogService] Unexpected error in watchdog cycle:', err?.message);
    }
  }, options.checkIntervalMs);

  console.log(`[WatchdogService] ✓ Watchdog Service active (Interval: ${options.checkIntervalMs / 1000}s, Inactivity Timeout: ${options.sessionTimeoutMs / 1000}s)`);
}

/**
 * Stop Watchdog Service daemon on app termination.
 */
export function stopWatchdogService(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
  isWatchdogRunning = false;
  console.log('[WatchdogService] Watchdog Service stopped');
}
