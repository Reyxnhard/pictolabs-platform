import { ipcMain } from 'electron';
import { exec } from 'child_process';
import { getDefaultPrinterName, getIsBypassMode } from './PrintService';

export type PrinterHardwareStatusCode =
  | 'READY'
  | 'OFFLINE'
  | 'PAPER_JAM'
  | 'PAPER_OUT'
  | 'DOOR_OPEN'
  | 'USER_INTERVENTION'
  | 'DRIVER_ERROR';

export interface PrinterHardwareStatus {
  connected: boolean;
  ready: boolean;
  status: PrinterHardwareStatusCode;
  name: string;
  message: string;
  errorCode?: string;
  rawState?: number;
  lastCheckedAt: string;
}

let monitorInterval: NodeJS.Timeout | null = null;
let cachedHardwareStatus: PrinterHardwareStatus = {
  connected: true,
  ready: true,
  status: 'READY',
  name: 'Default Printer',
  message: 'Inisialisasi printer...',
  lastCheckedAt: new Date().toISOString(),
};

let consecutiveErrorCount = 0;
const DEBOUNCE_THRESHOLD = 2; // Require 2 consecutive failed queries to escalate to OFFLINE (hysteresis)

/**
 * Query native Win32 printer hardware state using PowerShell CIM.
 */
function queryWin32PrinterState(printerName: string): Promise<{
  connected: boolean;
  detectedErrorState: number;
  extendedPrinterStatus: number;
  workOffline: boolean;
  rawJson?: any;
}> {
  return new Promise((resolve) => {
    const escapedName = printerName.replace(/'/g, "''");
    const script = `
      $p = Get-CimInstance -ClassName Win32_Printer -Filter "Name = '${escapedName}'" -ErrorAction SilentlyContinue
      if (-not $p) {
        $p = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default -eq $true }
      }
      if ($p) {
        [PSCustomObject]@{
          Found = $true
          Name = $p.Name
          WorkOffline = [bool]$p.WorkOffline
          DetectedErrorState = [int]$p.DetectedErrorState
          ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus
          PrinterStatus = [int]$p.PrinterStatus
          PrinterState = [int]$p.PrinterState
        } | ConvertTo-Json -Compress
      } else {
        [PSCustomObject]@{ Found = $false } | ConvertTo-Json -Compress
      }
    `;

    exec(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/\n/g, ' ')}"`,
      { timeout: 4000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve({ connected: false, detectedErrorState: 0, extendedPrinterStatus: 0, workOffline: true });
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (!parsed.Found) {
            resolve({ connected: false, detectedErrorState: 0, extendedPrinterStatus: 0, workOffline: true });
            return;
          }

          resolve({
            connected: !parsed.WorkOffline,
            detectedErrorState: Number(parsed.DetectedErrorState || 0),
            extendedPrinterStatus: Number(parsed.ExtendedPrinterStatus || 0),
            workOffline: Boolean(parsed.WorkOffline),
            rawJson: parsed,
          });
        } catch (_) {
          resolve({ connected: false, detectedErrorState: 0, extendedPrinterStatus: 0, workOffline: true });
        }
      }
    );
  });
}

/**
 * Perform a hardware health check cycle.
 */
export async function checkPrinterHardware(): Promise<PrinterHardwareStatus> {
  const now = new Date().toISOString();

  // Bypass Mode for Dev / Testing
  if (getIsBypassMode()) {
    cachedHardwareStatus = {
      connected: true,
      ready: true,
      status: 'READY',
      name: 'Virtual DNP DS-RX1 (Dev Bypass)',
      message: 'Printer siap (Bypass Mode)',
      lastCheckedAt: now,
    };
    return cachedHardwareStatus;
  }

  const targetPrinter = getDefaultPrinterName() || 'DNP DS-RX1';
  const query = await queryWin32PrinterState(targetPrinter);

  if (!query.connected) {
    consecutiveErrorCount++;
    if (consecutiveErrorCount >= DEBOUNCE_THRESHOLD) {
      cachedHardwareStatus = {
        connected: false,
        ready: false,
        status: 'OFFLINE',
        name: targetPrinter,
        message: 'Printer tidak terhubung atau kabel USB terputus',
        errorCode: 'PRINTER_OFFLINE',
        lastCheckedAt: now,
      };
    }
    return cachedHardwareStatus;
  }

  // Reset error debounce counter when connection is confirmed
  consecutiveErrorCount = 0;

  // Evaluate Win32 DetectedErrorState and PrinterState bitmasks
  // DetectedErrorState: 4: No Paper, 6: No Toner/Ribbon, 7: Door Open, 8: Jammed
  let statusCode: PrinterHardwareStatusCode = 'READY';
  let message = 'Printer siap mencetak';
  let isReady = true;

  if (query.detectedErrorState === 8) {
    statusCode = 'PAPER_JAM';
    message = 'Kertas tersangkut pada printer (Paper Jam)';
    isReady = false;
  } else if (query.detectedErrorState === 4 || query.detectedErrorState === 6) {
    statusCode = 'PAPER_OUT';
    message = 'Kertas atau ribbon printer habis (Paper/Ribbon Out)';
    isReady = false;
  } else if (query.detectedErrorState === 7) {
    statusCode = 'DOOR_OPEN';
    message = 'Penutup printer terbuka (Door Open)';
    isReady = false;
  } else if (query.detectedErrorState === 10) {
    statusCode = 'USER_INTERVENTION';
    message = 'Printer membutuhkan intervensi teknisi';
    isReady = false;
  } else if (query.detectedErrorState !== 0 && query.detectedErrorState !== 2) {
    statusCode = 'DRIVER_ERROR';
    message = `Status driver error: Code ${query.detectedErrorState}`;
    isReady = false;
  }

  cachedHardwareStatus = {
    connected: true,
    ready: isReady,
    status: statusCode,
    name: targetPrinter,
    message,
    errorCode: statusCode !== 'READY' ? statusCode : undefined,
    rawState: query.detectedErrorState,
    lastCheckedAt: now,
  };

  return cachedHardwareStatus;
}

/**
 * Get cached hardware status synchronously for fast UI rendering.
 */
export function getCachedPrinterHardwareStatus(): PrinterHardwareStatus {
  return cachedHardwareStatus;
}

/**
 * Start background printer hardware monitoring loop.
 */
export function startPrinterMonitor(intervalMs: number = 5000): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }

  // Run immediate initial check
  checkPrinterHardware().catch((err) => {
    console.warn('[PrinterMonitorService] Initial check error:', err);
  });

  monitorInterval = setInterval(() => {
    checkPrinterHardware().catch((err) => {
      console.warn('[PrinterMonitorService] Poller check error:', err);
    });
  }, intervalMs);

  console.log(`[PrinterMonitorService] ✓ Printer hardware monitor started (${intervalMs}ms polling)`);
}

/**
 * Stop background monitoring.
 */
export function stopPrinterMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[PrinterMonitorService] Printer hardware monitor stopped');
  }
}

/**
 * Register IPC handlers.
 */
export function registerPrinterMonitorHandlers(): void {
  ipcMain.handle('printer:get-hardware-status', async () => {
    return checkPrinterHardware();
  });
}
