import { ipcMain } from 'electron';
import { exec } from 'child_process';
import { getDefaultPrinterName, getIsBypassMode, resolvePrinterProfile, setDefaultPrinterName } from './PrintService';
import { getHardwareStatus } from './PrinterHardwareAdapter';

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
  name: 'DS-RX1',
  message: 'Printer siap mencetak',
  lastCheckedAt: new Date().toISOString(),
};

let consecutiveErrorCount = 0;
let lastWin32CheckTime = 0;
const DEBOUNCE_THRESHOLD = 2; // Require 2 consecutive failed queries to escalate to OFFLINE (hysteresis)

/**
 * Query native Win32 printer hardware state and physical USB presence using PowerShell CIM and PnP.
 */
function queryWin32PrinterState(printerName: string): Promise<{
  connected: boolean;
  physicalPresent: boolean;
  detectedErrorState: number;
  extendedPrinterStatus: number;
  workOffline: boolean;
  name?: string;
  rawJson?: any;
}> {
  return new Promise((resolve) => {
    const profile = resolvePrinterProfile(printerName);
    const escapedName = printerName.replace(/'/g, "''");
    const hwPattern = profile.hardwareIdPattern;

    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $escaped = '${escapedName}'
      $hwPattern = '${hwPattern}'

      # 1. Query Physical USB PnP Device
      $pnp = $null
      if ($hwPattern) {
        $pnp = Get-PnpDevice -InstanceId $hwPattern -ErrorAction SilentlyContinue | Where-Object { $_.Present -eq $true } | Select-Object -First 1
      }

      # 2. Query Software Print Queue
      $p = Get-CimInstance -ClassName Win32_Printer -Filter "Name = '$escaped'" -ErrorAction SilentlyContinue
      if (-not $p -or $p.WorkOffline -or (($p.PrinterState -band 4) -ne 0)) {
        $activeSibling = Get-CimInstance -ClassName Win32_Printer | Where-Object {
          ($_.DriverName -like '${profile.driverPattern}' -or $_.Name -like '*${profile.name}*') -and
          -not $_.WorkOffline -and
          (($_.PrinterState -band 4) -eq 0)
        } | Select-Object -First 1
        if ($activeSibling) {
          $p = $activeSibling
        }
      }
      if (-not $p) {
        $p = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Name -eq $escaped -or $_.DriverName -like '${profile.driverPattern}' } | Select-Object -First 1
      }
      if (-not $p) {
        $p = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1
      }

      if ($p) {
        [PSCustomObject]@{
          Found = $true
          FoundPhysical = if ($hwPattern) { [bool]$pnp } else { $true }
          Name = $p.Name
          WorkOffline = [bool]$p.WorkOffline
          DetectedErrorState = [int]$p.DetectedErrorState
          ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus
          PrinterStatus = [int]$p.PrinterStatus
          PrinterState = [int]$p.PrinterState
        } | ConvertTo-Json -Compress
      } else {
        [PSCustomObject]@{ Found = $false; FoundPhysical = $false } | ConvertTo-Json -Compress
      }
    `;

    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`,
      { timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve({ connected: false, physicalPresent: false, detectedErrorState: 0, extendedPrinterStatus: 0, workOffline: true });
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          if (!parsed.Found) {
            resolve({ connected: false, physicalPresent: false, detectedErrorState: 0, extendedPrinterStatus: 0, workOffline: true });
            return;
          }

          const physicalPresent = Boolean(parsed.FoundPhysical);
          const workOffline = Boolean(parsed.WorkOffline);
          const connected = physicalPresent && !workOffline;

          resolve({
            connected,
            physicalPresent,
            detectedErrorState: Number(parsed.DetectedErrorState || 0),
            extendedPrinterStatus: Number(parsed.ExtendedPrinterStatus || 0),
            workOffline,
            name: parsed.Name,
            rawJson: parsed,
          });
        } catch (_) {
          resolve({ connected: false, physicalPresent: false, detectedErrorState: 0, extendedPrinterStatus: 0, workOffline: true });
        }
      }
    );
  });
}

let activeHardwarePromise: Promise<PrinterHardwareStatus> | null = null;

/**
 * Perform a hardware health check cycle.
 */
export async function checkPrinterHardware(forceFresh = false): Promise<PrinterHardwareStatus> {
  if (activeHardwarePromise) {
    return activeHardwarePromise;
  }

  activeHardwarePromise = (async () => {
    try {
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

      const targetPrinter = getDefaultPrinterName() || 'DS-RX1';

      // 1. Direct DNP mechanical telemetry probe
      const hw = await getHardwareStatus(targetPrinter, forceFresh);
      if (hw.state === 'COVER_OPEN') {
        cachedHardwareStatus = {
          connected: true,
          ready: false,
          status: 'DOOR_OPEN',
          name: targetPrinter,
          message: hw.message,
          errorCode: 'DOOR_OPEN',
          lastCheckedAt: now,
        };
        return cachedHardwareStatus;
      }
      if (hw.state === 'PAPER_OUT') {
        cachedHardwareStatus = {
          connected: true,
          ready: false,
          status: 'PAPER_OUT',
          name: targetPrinter,
          message: hw.message,
          errorCode: 'PAPER_OUT',
          lastCheckedAt: now,
        };
        return cachedHardwareStatus;
      }
      if (hw.state === 'RIBBON_OUT') {
        cachedHardwareStatus = {
          connected: true,
          ready: false,
          status: 'PAPER_OUT',
          name: targetPrinter,
          message: hw.message,
          errorCode: 'RIBBON_OUT',
          lastCheckedAt: now,
        };
        return cachedHardwareStatus;
      }
      if (hw.state === 'JAMMED') {
        cachedHardwareStatus = {
          connected: true,
          ready: false,
          status: 'PAPER_JAM',
          name: targetPrinter,
          message: hw.message,
          errorCode: 'PAPER_JAM',
          lastCheckedAt: now,
        };
        return cachedHardwareStatus;
      }
      if (hw.state === 'OFFLINE') {
        cachedHardwareStatus = {
          connected: false,
          ready: false,
          status: 'OFFLINE',
          name: targetPrinter,
          message: hw.message,
          errorCode: 'PRINTER_OFFLINE',
          lastCheckedAt: now,
        };
        return cachedHardwareStatus;
      }
      if (hw.state === 'ERROR') {
        cachedHardwareStatus = {
          connected: true,
          ready: false,
          status: 'DRIVER_ERROR',
          name: targetPrinter,
          message: hw.message,
          errorCode: 'HARDWARE_ERROR',
          lastCheckedAt: now,
        };
        return cachedHardwareStatus;
      }

      // Fast-path: If DNP hardware is confirmed READY and queue was verified within 25s,
      // avoid spawning heavy powershell.exe on every polling tick.
      if (
        !forceFresh &&
        cachedHardwareStatus.status === 'READY' &&
        cachedHardwareStatus.name &&
        Date.now() - lastWin32CheckTime < 25000
      ) {
        cachedHardwareStatus.lastCheckedAt = now;
        return cachedHardwareStatus;
      }

      const query = await queryWin32PrinterState(targetPrinter);
      lastWin32CheckTime = Date.now();

      if (query.name && query.name !== targetPrinter) {
        console.log(`[PrinterMonitorService] 🔄 Dynamic printer migration: '${targetPrinter}' -> '${query.name}'`);
        setDefaultPrinterName(query.name);
      }

      if (!query.connected || !query.physicalPresent) {
        consecutiveErrorCount++;
        cachedHardwareStatus = {
          connected: false,
          ready: false,
          status: 'OFFLINE',
          name: query.name || targetPrinter,
          message: 'Printer tidak terhubung atau kabel USB terputus',
          errorCode: 'PRINTER_OFFLINE',
          lastCheckedAt: now,
        };
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
        name: query.name || targetPrinter,
        message,
        errorCode: statusCode !== 'READY' ? statusCode : undefined,
        rawState: query.detectedErrorState,
        lastCheckedAt: now,
      };

      return cachedHardwareStatus;
    } finally {
      activeHardwarePromise = null;
    }
  })();

  return activeHardwarePromise;
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
    return checkPrinterHardware(true);
  });
}
