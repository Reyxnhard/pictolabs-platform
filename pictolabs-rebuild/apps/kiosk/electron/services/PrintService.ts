import { ipcMain, BrowserWindow } from 'electron';
import { exec, execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getLastSession, readLocalKioskConfig } from './SyncEngine';
import { setPrintDispatchActive } from './PrinterMonitorService';
import { findPrintExePath, getHardwareStatus, PrinterHardwareStatus } from './PrinterHardwareAdapter';

/**
 * PrintService — Enterprise Windows Spooler Integration for DNP & Photo Printers.
 *
 * Provides:
 * 1. Deep Win32 / WMI printer health interrogation (Paper Out, Ribbon End, Door Open, Jam)
 * 2. Cached 3-second status polling to prevent blocking UI thread
 * 3. One-click operator Reprint of last customer composite
 * 4. Mechanical cutter calibration test print (2-inch strip)
 */

export interface PrintServiceConfig {
  defaultPrinter?: string; // override auto-detect
  bypassPrinter?: boolean;
}

export interface PrinterHealth {
  ready: boolean;
  name: string;
  code: 'OK' | 'PAPER_OUT' | 'LOW_PAPER' | 'RIBBON_OUT' | 'DOOR_OPEN' | 'JAMMED' | 'OFFLINE' | 'BUSY' | 'ERROR' | 'NO_PRINTER';
  message: string;
  checkedAt: number;
  mediaRemaining?: number;
}

// ─── Win32 Spooler / WMI Status Bitmask Constants ───────────
export const PRINTER_STATE_PAUSED            = 0x00000001;
export const PRINTER_STATE_ERROR             = 0x00000002;
export const PRINTER_STATE_PENDING_DELETION  = 0x00000004;
export const PRINTER_STATE_PAPER_JAM         = 0x00000008;
export const PRINTER_STATE_PAPER_OUT         = 0x00000010;
export const PRINTER_STATE_MANUAL_FEED       = 0x00000020;
export const PRINTER_STATE_PAPER_PROBLEM     = 0x00000040;
export const PRINTER_STATE_OFFLINE           = 0x00000080;
export const PRINTER_STATE_IO_ACTIVE         = 0x00000100;
export const PRINTER_STATE_BUSY              = 0x00000200;
export const PRINTER_STATE_PRINTING          = 0x00000400;
export const PRINTER_STATE_OUTPUT_BIN_FULL   = 0x00000800;
export const PRINTER_STATE_NOT_AVAILABLE     = 0x00001000;
export const PRINTER_STATE_WAITING           = 0x00002000;
export const PRINTER_STATE_PROCESSING        = 0x00004000;
export const PRINTER_STATE_INITIALIZING      = 0x00008000;
export const PRINTER_STATE_WARMING_UP        = 0x00010000;
export const PRINTER_STATE_TONER_LOW         = 0x00020000;
export const PRINTER_STATE_NO_TONER          = 0x00040000;
export const PRINTER_STATE_PAGE_PUNT         = 0x00080000;
export const PRINTER_STATE_USER_INTERVENTION = 0x00100000;
export const PRINTER_STATE_OUT_OF_MEMORY     = 0x00200000;
export const PRINTER_STATE_DOOR_OPEN         = 0x00400000;
export const PRINTER_STATE_SERVER_UNKNOWN    = 0x00800000;
export const PRINTER_STATE_POWER_SAVE        = 0x01000000;

let defaultPrinterName: string | null = null;
let isBypassMode = true; // Auto-bypass by default when no physical photo printer is connected
let cachedHealth: PrinterHealth = {
  ready: true,
  name: 'DS-RX1',
  code: 'OK',
  message: 'Printer siap',
  checkedAt: Date.now(),
};
let activeHealthPromise: Promise<PrinterHealth> | null = null;
let backgroundHealthTimer: NodeJS.Timeout | null = null;

export function getCachedPrinterHealth(): PrinterHealth {
  return cachedHealth;
}

export function getDefaultPrinterName(): string | null {
  return defaultPrinterName;
}

export function setDefaultPrinterName(val: string): void {
  defaultPrinterName = val;
}

export function getIsBypassMode(): boolean {
  return isBypassMode;
}

export function setIsBypassMode(val: boolean): void {
  isBypassMode = val;
}

/**
 * Discover available printers asynchronously.
 * Prioritizes Electron native getPrintersAsync() when a window is available (<15ms, non-blocking Win32 EnumPrinters),
 * with non-blocking PowerShell exec fallback.
 */
export async function listPrinters(): Promise<string[]> {
  try {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    if (win && win.webContents) {
      const nativePrinters = await win.webContents.getPrintersAsync();
      if (Array.isArray(nativePrinters) && nativePrinters.length > 0) {
        return nativePrinters.map((p) => p.name).filter(Boolean);
      }
    }
  } catch (err) {
    console.warn('[PrintService] Native getPrintersAsync failed, falling back to PowerShell:', err);
  }

  return new Promise<string[]>((resolve) => {
    exec(
      'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Printer | Sort-Object WorkOffline | Select-Object -ExpandProperty Name"',
      { timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve([]);
          return;
        }
        const names = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        resolve(names);
      }
    );
  });
}

/**
 * Backward-compatible synchronous stub (returns currently detected default or empty array, non-blocking).
 */
export function listPrintersSync(): string[] {
  return defaultPrinterName ? [defaultPrinterName] : [];
}

/**
 * Auto-detect a photo printer by name heuristics.
 * Prioritizes: DNP > Citizen > any "Photo" printer > first available.
 */
export function autoDetectPrinter(printers: string[]): string | null {
  const priorities = ['DNP', 'Citizen', 'Photo', 'Mitsubishi', 'HiTi', 'RX1', 'DS620', 'CX-02', 'P525L', 'CY-02', 'DS-RX1'];
  for (const keyword of priorities) {
    const match = printers.find((p) =>
      p.toLowerCase().includes(keyword.toLowerCase())
    );
    if (match) return match;
  }
  return null;
}

/**
 * Asynchronously initialize printer detection and bypass state post-startup.
 */
export async function initPrinterDiscovery(config: PrintServiceConfig = {}): Promise<string[]> {
  try {
    const printers = await listPrinters();
    const resolvedDefault = config.defaultPrinter || autoDetectPrinter(printers);
    if (resolvedDefault) {
      defaultPrinterName = resolvedDefault;
    }

    const priorities = ['DNP', 'Citizen', 'HiTi', 'RX1', 'DS620', 'CX-02', 'P525L', 'Mitsubishi'];
    const hasPhotoHardware = printers.some((p) =>
      priorities.some((keyword) => p.toLowerCase().includes(keyword.toLowerCase()))
    );

    if (config.bypassPrinter !== undefined) {
      isBypassMode = config.bypassPrinter;
    } else if (!hasPhotoHardware) {
      isBypassMode = true;
      console.log('[PrintService] ⚠️ No dedicated photo printer detected. Auto-enabling BYPASS / SIMULATION MODE.');
    } else {
      isBypassMode = false;
    }

    cachedHealth = {
      ready: true,
      name: defaultPrinterName || 'DS-RX1',
      code: 'OK',
      message: isBypassMode ? 'Printer siap (Bypass / Virtual Mode)' : 'Printer siap',
      checkedAt: Date.now(),
    };

    console.log(`[PrintService] Detected printers (async): [${printers.join(', ')}]`);
    console.log(`[PrintService] Default printer: ${defaultPrinterName || 'NONE'}`);
    console.log(`[PrintService] Bypass Mode: ${isBypassMode ? 'ENABLED (Simulated Spooler)' : 'DISABLED (Hardware Gate)'}`);

    return printers;
  } catch (err) {
    console.error('[PrintService] Async printer discovery error:', err);
    return [];
  }
}

// ─── Printer Hardware Profiles & PnP Detection ──────────────
export interface PrinterHardwareProfile {
  name: string;
  driverPattern: string;
  hardwareIdPattern: string;
  deviceDescription: string;
}

export const SUPPORTED_PRINTER_PROFILES: Record<string, PrinterHardwareProfile> = {
  'DS-RX1': {
    name: 'DS-RX1',
    driverPattern: '*RX1*',
    hardwareIdPattern: 'USB\\VID_1343&PID_0005*',
    deviceDescription: 'Dai Nippon Printing DS-RX1',
  },
  'CITIZEN-CX02': {
    name: 'CX-02',
    driverPattern: '*CX*02*',
    hardwareIdPattern: 'USB\\VID_1B90&PID_0284*',
    deviceDescription: 'Citizen Systems CX-02',
  },
  'HITI-P525L': {
    name: 'P525L',
    driverPattern: '*525L*',
    hardwareIdPattern: 'USB\\VID_0A82&PID_0525*',
    deviceDescription: 'HiTi P525L Photo Printer',
  },
};

export function resolvePrinterProfile(printerName?: string): PrinterHardwareProfile {
  if (!printerName) return SUPPORTED_PRINTER_PROFILES['DS-RX1'];
  const upper = printerName.toUpperCase();
  for (const key of Object.keys(SUPPORTED_PRINTER_PROFILES)) {
    const profile = SUPPORTED_PRINTER_PROFILES[key];
    if (upper.includes(profile.name.toUpperCase()) || upper.includes(key)) {
      return profile;
    }
  }
  return SUPPORTED_PRINTER_PROFILES['DS-RX1'];
}

/**
 * Helper to purge active print jobs from Windows Spooler for target printer.
 */
export async function cancelSpoolerJobs(printerName: string, jobIds?: number[]): Promise<void> {
  try {
    const escaped = printerName.replace(/'/g, "''");
    let script: string;
    if (jobIds && jobIds.length > 0) {
      const idList = jobIds.join(',');
      script = `
        $ProgressPreference = 'SilentlyContinue'
        @(${idList}) | ForEach-Object {
          Remove-PrintJob -PrinterName '${escaped}' -ID $_ -ErrorAction SilentlyContinue
        }
      `;
    } else {
      script = `
        $ProgressPreference = 'SilentlyContinue'
        Get-PrintJob -PrinterName '${escaped}' -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue
      `;
    }
    const b64 = Buffer.from(script, 'utf16le').toString('base64');
    await new Promise<void>((resolve) => {
      exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { timeout: 5000 }, () => resolve());
    });
  } catch (err: any) {
    console.warn('[PrintService] Warning purging spooler jobs:', err?.message);
  }
}

/**
 * Snapshot active spooler jobs and physical printer presence.
 */
async function querySpoolerSnapshot(printerName: string, profile: PrinterHardwareProfile): Promise<{
  physicalPresent: boolean;
  workOffline: boolean;
  detectedError: number;
  printerState: number;
  jobs: Array<{ id: number; status: string; document: string }>;
}> {
  const escaped = printerName.replace(/'/g, "''");
  const hwPattern = profile.hardwareIdPattern;

  const script = `
    $ProgressPreference = 'SilentlyContinue'
    $escaped = '${escaped}'
    $hwPattern = '${hwPattern}'

    $pnp = $null
    if ($hwPattern) {
      $pnp = Get-PnpDevice -InstanceId $hwPattern -ErrorAction SilentlyContinue | Where-Object { $_.Present -eq $true } | Select-Object -First 1
    }
    $p = Get-CimInstance Win32_Printer -Filter "Name = '$escaped'" -ErrorAction SilentlyContinue
    if (-not $p -or $p.WorkOffline -or (($p.PrinterState -band 4) -ne 0)) {
      $activeSibling = Get-CimInstance Win32_Printer | Where-Object {
        ($_.DriverName -like '${profile.driverPattern}' -or $_.Name -like '*${profile.name}*') -and
        -not $_.WorkOffline -and
        (($_.PrinterState -band 4) -eq 0)
      } | Select-Object -First 1
      if ($activeSibling) {
        $p = $activeSibling
      }
    }
    if (-not $p) {
      $p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $escaped -or $_.DriverName -like '${profile.driverPattern}' } | Select-Object -First 1
    }
    $jobs = @()
    if ($p) {
      $jobs = @(Get-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue)
    }

    [PSCustomObject]@{
      PhysicalPresent = if ($hwPattern) { [bool]$pnp } else { $true }
      WorkOffline = if ($p) { [bool]$p.WorkOffline } else { $true }
      DetectedError = if ($p) { [int]$p.DetectedErrorState } else { 0 }
      PrinterState = if ($p) { [int]$p.PrinterState } else { 0 }
      Jobs = @($jobs | ForEach-Object {
        [PSCustomObject]@{
          Id = [int]$_.Id
          Status = [string]$_.JobStatus
          Document = [string]$_.DocumentName
        }
      })
    } | ConvertTo-Json -Compress
  `;

  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { timeout: 6000 }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve({
          physicalPresent: false,
          workOffline: true,
          detectedError: 0,
          printerState: 0,
          jobs: [],
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({
          physicalPresent: Boolean(parsed.PhysicalPresent),
          workOffline: Boolean(parsed.WorkOffline),
          detectedError: Number(parsed.DetectedError || 0),
          printerState: Number(parsed.PrinterState || 0),
          jobs: Array.isArray(parsed.Jobs) ? parsed.Jobs : [],
        });
      } catch {
        resolve({
          physicalPresent: false,
          workOffline: true,
          detectedError: 0,
          printerState: 0,
          jobs: [],
        });
      }
    });
  });
}

/**
 * Query detailed hardware health status of a printer via WMI/CIM and physical PnP.
 */
export async function queryPrinterHealth(printerName?: string, bypassCache = false): Promise<PrinterHealth> {
  const target = printerName || defaultPrinterName || 'DS-RX1';
  const now = Date.now();

  if (isBypassMode) {
    return {
      ready: true,
      name: target ? `${target} (Bypass Mode)` : 'Virtual Photo Printer (Bypass Dev Mode)',
      code: 'OK',
      message: 'Printer siap (Bypass / Virtual Mode)',
      checkedAt: now,
    };
  }

  // Return cached status if checked within the last 2 seconds unless bypassCache is requested
  if (!bypassCache && now - cachedHealth.checkedAt < 2000 && cachedHealth.name === target && cachedHealth.checkedAt > 0) {
    return cachedHealth;
  }

  if (activeHealthPromise) {
    return activeHealthPromise;
  }

  activeHealthPromise = (async () => {
    try {
      // 0. Primary Physical Telemetry Gate: Query internal DNP engine telemetry
      const hw = await getHardwareStatus(target, bypassCache);
      if (hw.state === 'COVER_OPEN') {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'DOOR_OPEN',
          message: hw.message,
          checkedAt: now,
          mediaRemaining: hw.mediaRemaining,
        };
        return cachedHealth;
      }
      if (hw.state === 'PAPER_OUT') {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'PAPER_OUT',
          message: hw.message,
          checkedAt: now,
          mediaRemaining: hw.mediaRemaining,
        };
        return cachedHealth;
      }
      if (hw.state === 'RIBBON_OUT') {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'RIBBON_OUT',
          message: hw.message,
          checkedAt: now,
          mediaRemaining: hw.mediaRemaining,
        };
        return cachedHealth;
      }
      if (hw.state === 'JAMMED') {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'JAMMED',
          message: hw.message,
          checkedAt: now,
          mediaRemaining: hw.mediaRemaining,
        };
        return cachedHealth;
      }
      if (hw.state === 'OFFLINE') {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'OFFLINE',
          message: hw.message,
          checkedAt: now,
          mediaRemaining: hw.mediaRemaining,
        };
        return cachedHealth;
      }
      if (hw.state === 'ERROR') {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'ERROR',
          message: hw.message,
          checkedAt: now,
          mediaRemaining: hw.mediaRemaining,
        };
        return cachedHealth;
      }

      const profile = resolvePrinterProfile(target);
      const escaped = target.replace(/'/g, "''");
      const hwPattern = profile.hardwareIdPattern;

      const psCmd = `
        $ProgressPreference = 'SilentlyContinue'
        $escaped = '${escaped}'
        $hwPattern = '${hwPattern}'

        # 1. Query Software Print Queue
        $p = Get-CimInstance Win32_Printer -Filter "Name = '$escaped'" -ErrorAction SilentlyContinue
        if (-not $p -or $p.WorkOffline -or (($p.PrinterState -band 4) -ne 0)) {
          $activeSibling = Get-CimInstance Win32_Printer | Where-Object {
            ($_.DriverName -like '${profile.driverPattern}' -or $_.Name -like '*${profile.name}*') -and
            -not $_.WorkOffline -and
            (($_.PrinterState -band 4) -eq 0)
          } | Select-Object -First 1
          if ($activeSibling) {
            $p = $activeSibling
          }
        }
        if (-not $p) {
          $p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq '$escaped' -or $_.DriverName -like '${profile.driverPattern}' } | Select-Object -First 1
        }
        if (-not $p) {
          $p = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1
        }

        # 2. Query Physical USB Plug and Play Device
        $pnp = $null
        if ($hwPattern) {
          $pnp = Get-PnpDevice -InstanceId $hwPattern -ErrorAction SilentlyContinue | Where-Object { $_.Present -eq $true } | Select-Object -First 1
        }

        # 3. Active Spooler Jobs & Errors
        $jobs = @()
        if ($p) {
          $jobs = @(Get-PrintJob -PrinterName $p.Name -ErrorAction SilentlyContinue)
        }
        $jobStatuses = @($jobs | ForEach-Object { [string]$_.JobStatus })
        $hasJobError = ($jobStatuses | Where-Object { $_ -match 'Error|PaperOut|Offline|UserIntervention|Blocked|PaperJam' }).Count -gt 0

        [PSCustomObject]@{
          FoundQueue = [bool]$p
          FoundPhysical = if ($hwPattern) { [bool]$pnp } else { $true }
          Name = if ($p) { $p.Name } else { '$escaped' }
          WorkOffline = if ($p) { [bool]$p.WorkOffline } else { $true }
          PrinterStatus = if ($p) { [int]$p.PrinterStatus } else { 0 }
          PrinterState = if ($p) { [int]$p.PrinterState } else { 0 }
          DetectedErrorState = if ($p) { [int]$p.DetectedErrorState } else { 0 }
          ExtendedPrinterStatus = if ($p) { [int]$p.ExtendedPrinterStatus } else { 0 }
          HasJobError = [bool]$hasJobError
          JobStatuses = $jobStatuses
        } | ConvertTo-Json -Compress
      `;

      const b64 = Buffer.from(psCmd, 'utf16le').toString('base64');
      const stdout = await new Promise<string>((resolve) => {
        exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, { timeout: 8000 }, (err, out) => {
          if (err) resolve('');
          else resolve((out || '').trim());
        });
      });

      if (!stdout) {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'NO_PRINTER',
          message: 'Printer tidak terhubung ke Windows',
          checkedAt: now,
        };
        return cachedHealth;
      }

      const data = JSON.parse(stdout);
      if (!data.FoundQueue) {
        cachedHealth = {
          ready: false,
          name: target,
          code: 'NO_PRINTER',
          message: 'Antrean printer tidak ditemukan di Windows',
          checkedAt: now,
        };
        return cachedHealth;
      }

      const resolvedName = data.Name || target;
      if (resolvedName && resolvedName !== defaultPrinterName) {
        console.log(`[PrintService] 🔄 Dynamic printer migration: '${defaultPrinterName}' -> '${resolvedName}'`);
        defaultPrinterName = resolvedName;
      }
      const printerState = Number(data.PrinterState) || 0;
      const detectedError = Number(data.DetectedErrorState) || 0;
      const extendedStatus = Number(data.ExtendedPrinterStatus) || 0;
      const jobStatuses: string[] = Array.isArray(data.JobStatuses) ? data.JobStatuses : [];
      const jobStatusStr = jobStatuses.join(' ').toLowerCase();

      let code: PrinterHealth['code'] = 'OK';
      let message = 'Printer siap';
      let ready = true;

      // Priority 1: Hardware Disconnected / Physical USB Absent / Offline
      if (!data.FoundPhysical || data.WorkOffline || (printerState & PRINTER_STATE_OFFLINE) !== 0 || extendedStatus === 7) {
        code = 'OFFLINE';
        message = 'Printer offline atau kabel USB terputus';
        ready = false;
      }
      // Priority 2: Door Open
      else if ((printerState & PRINTER_STATE_DOOR_OPEN) !== 0 || detectedError === 7 || jobStatusStr.includes('door')) {
        code = 'DOOR_OPEN';
        message = 'Pintu penutup printer terbuka (Door Open)';
        ready = false;
      }
      // Priority 3: Paper Out
      else if (
        (printerState & PRINTER_STATE_PAPER_OUT) !== 0 ||
        (printerState & PRINTER_STATE_PAPER_PROBLEM) !== 0 ||
        detectedError === 4 ||
        jobStatusStr.includes('paperout') ||
        jobStatusStr.includes('paper out')
      ) {
        code = 'PAPER_OUT';
        message = 'Kertas foto habis di dalam tray (Paper Out)';
        ready = false;
      }
      // Priority 4: Ribbon / Toner Out
      else if (
        (printerState & PRINTER_STATE_NO_TONER) !== 0 ||
        detectedError === 6 ||
        jobStatusStr.includes('toner') ||
        jobStatusStr.includes('ribbon')
      ) {
        code = 'RIBBON_OUT';
        message = 'Pita ribbon habis / perlu diganti (Ribbon Out)';
        ready = false;
      }
      // Priority 5: Paper Jam
      else if (
        (printerState & PRINTER_STATE_PAPER_JAM) !== 0 ||
        detectedError === 8 ||
        jobStatusStr.includes('jam')
      ) {
        code = 'JAMMED';
        message = 'Kertas macet di dalam printer (Paper Jam)';
        ready = false;
      }
      // Priority 6: Spooler Error or User Intervention Required
      else if (
        (printerState & PRINTER_STATE_USER_INTERVENTION) !== 0 ||
        (printerState & PRINTER_STATE_ERROR) !== 0 ||
        extendedStatus === 9 ||
        data.HasJobError
      ) {
        code = 'ERROR';
        message = 'Printer membutuhkan intervensi operator (Error Spooler)';
        ready = false;
      }
      // Priority 7: Low Paper Warning (Still Ready to Print)
      else if (
        (printerState & PRINTER_STATE_TONER_LOW) !== 0 ||
        detectedError === 3
      ) {
        code = 'LOW_PAPER';
        message = 'Kertas atau pita ribbon hampir habis (< 20 lembar)';
        ready = true;
      }
      // Priority 8: Busy / Printing
      else if (
        (printerState & PRINTER_STATE_BUSY) !== 0 ||
        (printerState & PRINTER_STATE_PRINTING) !== 0 ||
        data.PrinterStatus === 4
      ) {
        code = 'BUSY';
        message = 'Sedang memproses antrean cetak...';
        ready = true;
      }

      cachedHealth = { ready, name: resolvedName, code, message, checkedAt: now, mediaRemaining: hw.mediaRemaining };
      return cachedHealth;
    } catch {
      cachedHealth = {
        ready: true,
        name: target,
        code: 'OK',
        message: 'Status normal',
        checkedAt: now,
      };
      return cachedHealth;
    } finally {
      activeHealthPromise = null;
    }
  })();

  return activeHealthPromise;
}

/**
 * Print an image file using Windows ImageView_PrintTo with post-submission spooler job monitoring.
 */
/**
 * Strict validator for pre-flight health handoff.
 * Requires:
 * 1. preValidatedHealth exists, is ready, and code is OK.
 * 2. Probe was completed within the last 5000ms.
 * 3. Printer name matches the EXACT resolved target printer identity (no broad/substring matching).
 *    e.g. 'DS-RX1 (Copy 1)' !== 'DS-RX1 (Copy 2)' and 'DS-RX1' !== 'DS-RX1 (Copy 1)'.
 */
export function isPrinterHandoffValid(
  preValidatedHealth: PrinterHealth | undefined,
  targetPrinterName: string
): boolean {
  if (!preValidatedHealth) return false;
  if (!preValidatedHealth.ready || preValidatedHealth.code !== 'OK') return false;
  if (Date.now() - preValidatedHealth.checkedAt >= 5000) return false;
  if (!preValidatedHealth.name) return false;

  // Strict identity matching: EXACT equality required.
  // Broad substring matching (e.g. name.includes('DS-RX1')) is strictly forbidden
  // to avoid cross-queue pollution in multi-printer booths (DS-RX1 vs Copy 1 vs Copy 2).
  return preValidatedHealth.name === targetPrinterName;
}

/**
 * Resolves the target Windows printer queue according to fail-safe PR-02 rules:
 * 1. If an explicit queue is requested or configured for the media format:
 *    - Verify that it exists in installed Windows printers.
 *    - If missing: fail fast with an actionable error (no silent redirection).
 * 2. If no explicit queue is configured (null):
 *    - Use detected default printer ONLY if it is installed and valid.
 * 3. If neither exists or is installed:
 *    - Return an error rejecting the print request safely.
 */
export async function resolvePrinterQueue(
  requestedPrinter?: string | null,
  mediaFormat?: string | null,
  installedPrintersOverride?: string[]
): Promise<{ success: boolean; printerName?: string; error?: string }> {
  const localConfig = readLocalKioskConfig();
  const queueMap = localConfig?.hardware?.printerNames;

  // Determine candidate queue
  let candidateQueue: string | null = requestedPrinter || null;
  if (candidateQueue === 'Default Printer' || candidateQueue === 'AUTO' || candidateQueue === 'DEFAULT') {
    candidateQueue = null;
  }
  if (!candidateQueue && mediaFormat) {
    if (mediaFormat === '2R' || mediaFormat === 'strip2x6') {
      candidateQueue = queueMap?.strip2x6 || null;
    } else if (mediaFormat === '4R' || mediaFormat === 'photo4x6') {
      candidateQueue = queueMap?.photo4x6 || null;
    } else if (mediaFormat === '6R' || mediaFormat === 'photo6x8') {
      candidateQueue = queueMap?.photo6x8 || null;
    }
  }

  // Get available printers
  const installedPrinters = installedPrintersOverride || (await listPrinters());

  if (candidateQueue) {
    // Explicit queue requested or configured
    const isInstalled = installedPrinters.some(
      (p) => p.toLowerCase() === candidateQueue!.toLowerCase()
    );
    if (!isInstalled && installedPrinters.length > 0) {
      return {
        success: false,
        error: `Antrean printer terkonfigurasi '${candidateQueue}' tidak ditemukan di sistem Windows. Pastikan nama antrean printer sesuai di Admin Panel.`,
      };
    }
    const exactMatch = installedPrinters.find(
      (p) => p.toLowerCase() === candidateQueue!.toLowerCase()
    );
    return { success: true, printerName: exactMatch || candidateQueue };
  }

  // Fallback: candidateQueue is null, use detected default printer
  const defaultPrinter = getDefaultPrinterName();
  if (defaultPrinter) {
    const isInstalled = installedPrinters.length === 0 || installedPrinters.some(
      (p) => p.toLowerCase() === defaultPrinter.toLowerCase()
    );
    if (isInstalled) {
      const exactMatch = installedPrinters.find(
        (p) => p.toLowerCase() === defaultPrinter.toLowerCase()
      );
      return { success: true, printerName: exactMatch || defaultPrinter };
    }
  }

  // If installedPrinters has photo printers detected via autoDetectPrinter:
  const autoDetected = autoDetectPrinter(installedPrinters);
  if (autoDetected) {
    return { success: true, printerName: autoDetected };
  }

  return {
    success: false,
    error: 'Tidak ada printer foto yang terdeteksi atau terkonfigurasi di sistem Windows.',
  };
}

export async function printImage(
  imagePath: string,
  printerName?: string | null,
  copies: number = 1,
  preValidatedHealth?: PrinterHealth,
  onPhaseChange?: (phase: 'PRINTING' | 'VERIFYING') => void,
  mediaFormat?: string | null
): Promise<{ success: boolean; error?: string }> {
  // 1. Bypass Mode check
  if (isBypassMode) {
    console.log(`[PrintService] [BYPASS] Simulated print job: ${path.basename(imagePath)} (x${copies})`);
    return { success: true };
  }

  let targetPath = imagePath;

  // If given a base64 data URI, write it to a temp JPEG first
  if (imagePath.startsWith('data:image')) {
    try {
      const base64Data = imagePath.replace(/^data:image\/\w+;base64,/, '');
      const tempDir = path.join(os.tmpdir(), 'pictolabs-print');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      targetPath = path.join(tempDir, `print_${Date.now()}.jpg`);
      fs.writeFileSync(targetPath, Buffer.from(base64Data, 'base64'));
    } catch (err) {
      return { success: false, error: `Failed to write temp print file: ${(err as Error).message}` };
    }
  }

  if (!fs.existsSync(targetPath)) {
    return { success: false, error: `File not found: ${targetPath}` };
  }

  // 2. Resolve Active Printer Identity with Strict Fail-Safe Matching
  const resolution = await resolvePrinterQueue(printerName, mediaFormat);
  if (!resolution.success || !resolution.printerName) {
    console.error(`[PrintService] Queue resolution failed: ${resolution.error}`);
    return { success: false, error: resolution.error || 'Antrean printer tidak valid' };
  }
  const activePrinter = resolution.printerName;

  // 3. Dispatch print command via native print.exe CLI
  const printExe = findPrintExePath();
  if (!printExe) {
    console.error('[PrintService] print.exe utility not found on disk');
    return { success: false, error: 'Utilitas cetak (print.exe) tidak ditemukan' };
  }

  // Dynamic calibration parameter injection from hydrated local config
  // Contract: scale in %, offsets in hundredths of an inch (1/100 inch = 0.254 mm)
  const localConfig = readLocalKioskConfig();
  const calib = localConfig?.hardware?.printerCalibration;
  const rawScale = typeof calib?.scale === 'number' && !isNaN(calib.scale) ? calib.scale : 99;
  const rawOffX = typeof calib?.offsetX === 'number' && !isNaN(calib.offsetX) ? calib.offsetX : 0;
  const rawOffY = typeof calib?.offsetY === 'number' && !isNaN(calib.offsetY) ? calib.offsetY : 3;

  const scaleArg = String(Math.max(85, Math.min(105, rawScale)));
  const offXArg = String(Math.max(-25, Math.min(25, rawOffX)));
  const offYArg = String(Math.max(-25, Math.min(25, rawOffY)));

  // Native CLI argument vector:
  // print.exe <imagePath> [copies] [scale%] [offsetX] [offsetY] [printerName]
  const printArgs = [
    targetPath,
    String(copies),
    scaleArg,
    offXArg,
    offYArg,
    activePrinter,
  ];

  console.log(`[PrintService] Dispatching print via print.exe to '${activePrinter}' (x${copies}) [scale: ${scaleArg}%, offX: ${offXArg}, offY: ${offYArg}]`);

  if (onPhaseChange) {
    onPhaseChange('PRINTING');
  }

  const dispatchResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    execFile(
      printExe,
      printArgs,
      { timeout: 30000, cwd: path.dirname(printExe) },
      (error, stdout, stderr) => {
        if (error) {
          console.error('[PrintService] print.exe dispatch failed:', error.message, stderr);
          resolve({ ok: false, error: stderr || error.message });
        } else {
          if (stderr && stderr.trim()) {
            console.warn('[PrintService] print.exe warning:', stderr);
          }
          console.log('[PrintService] print.exe completed successfully:', stdout.trim());
          resolve({ ok: true });
        }
      }
    );
  });

  if (!dispatchResult.ok) {
    return { success: false, error: dispatchResult.error || 'Gagal mengirim berkas ke spooler Windows' };
  }

  // RCA-7 Contract:
  // Once print.exe exits with code 0, Windows GDI has committed the job to the Windows Print Spooler.
  // Physical print lifecycle is handed off to Windows Spooler and DNP printer firmware.
  // We do NOT perform blocking spooler polling loops or DNP USB telemetry interrogation during active printing.
  console.log(`[PrintService] ✓ Print job accepted by Windows Spooler via print.exe: ${path.basename(imagePath)} (x${copies})`);
  return { success: true };
}

export function registerPrintHandlers(config: PrintServiceConfig): void {
  // Set initial synchronous defaults without blocking main thread
  defaultPrinterName = config.defaultPrinter || null;
  if (config.bypassPrinter !== undefined) {
    isBypassMode = config.bypassPrinter;
  } else {
    isBypassMode = true; // Safe default until printer discovery completes
  }

  // Seed cached health with initial ready state and timestamp
  cachedHealth = {
    ready: true,
    name: defaultPrinterName || 'DS-RX1',
    code: 'OK',
    message: isBypassMode ? 'Printer siap (Bypass / Virtual Mode)' : 'Printer siap',
    checkedAt: Date.now(),
  };

  // Kick off non-blocking printer discovery in the background
  setImmediate(() => {
    initPrinterDiscovery(config).catch((err) => {
      console.warn('[PrintService] Background printer discovery error:', err);
    });
  });

  // ─── Print ─────────────────────────────────────────────
  ipcMain.handle(
    'printer:print',
    async (_event, imagePath: string, copies: number = 1) => {
      if (isBypassMode) {
        console.log(`[PrintService] [BYPASS] Simulated print job: ${path.basename(imagePath)} (x${copies})`);
        return { success: true };
      }
      if (!defaultPrinterName) {
        return { success: false, error: 'No printer configured or detected' };
      }
      return printImage(imagePath, defaultPrinterName, copies);
    }
  );

  // ─── Printer Health & Pre-Session Gate ──────────────────
  ipcMain.handle('printer:health', async () => {
    if (isBypassMode) {
      return {
        ready: true,
        name: defaultPrinterName ? `${defaultPrinterName} (Bypass Mode)` : 'Virtual Photo Printer (Bypass Dev Mode)',
        code: 'OK',
        message: 'Printer siap (Bypass / Virtual Mode)',
        checkedAt: Date.now(),
      };
    }
    if (!defaultPrinterName) {
      return {
        ready: false,
        name: 'NONE',
        code: 'NO_PRINTER',
        message: 'Tidak ada printer terpasang di sistem',
        checkedAt: Date.now(),
      };
    }
    return queryPrinterHealth(defaultPrinterName);
  });

  // ─── Legacy Printer Status ─────────────────────────────
  ipcMain.handle('printer:status', async () => {
    if (isBypassMode) {
      return { ready: true, name: 'Virtual Printer (Bypass)' };
    }
    if (!defaultPrinterName) {
      return { ready: false, name: 'None' };
    }
    const health = await queryPrinterHealth(defaultPrinterName);
    return { ready: health.ready, name: health.name, message: health.message };
  });

  // ─── List Printers ─────────────────────────────────────
  ipcMain.handle('printer:list', async () => {
    return listPrinters();
  });

  // ─── Set Default Printer ───────────────────────────────
  ipcMain.handle('printer:set-default', async (_event, printerName: string) => {
    defaultPrinterName = printerName;
    return { success: true, name: defaultPrinterName };
  });

  // ─── Operator Reprint Last Photo ───────────────────────
  ipcMain.handle('printer:reprint-last', async () => {
    const lastSession = getLastSession();
    if (isBypassMode) {
      console.log(`[PrintService] [BYPASS] Simulated reprint of session: ${lastSession?.id || 'none'}`);
      return {
        success: true,
        sessionId: lastSession?.id || 'simulated',
        compositePath: lastSession?.compositePath || 'simulated.jpg',
      };
    }

    if (!defaultPrinterName) {
      return { success: false, error: 'Tidak ada printer terpasang' };
    }

    if (!lastSession || !lastSession.compositePath) {
      return { success: false, error: 'Tidak ada riwayat foto komposit terakhir' };
    }

    if (!fs.existsSync(lastSession.compositePath)) {
      return { success: false, error: `Berkas komposit tidak ditemukan di disk: ${lastSession.compositePath}` };
    }

    console.log(`[PrintService] [Operator Action] Reprinting last session: ${lastSession.id}`);
    const printResult = await printImage(lastSession.compositePath, defaultPrinterName, 1);
    return {
      success: printResult.success,
      sessionId: lastSession.id,
      compositePath: lastSession.compositePath,
      error: printResult.error,
    };
  });

  // ─── Operator Cut / Calibration Test ───────────────────
  ipcMain.handle('printer:cut-test', async () => {
    if (isBypassMode) {
      console.log('[PrintService] [BYPASS] Simulated paper cut test');
      return { success: true };
    }

    if (!defaultPrinterName) {
      return { success: false, error: 'Tidak ada printer terpasang' };
    }

    try {
      const sharp = require('sharp');
      const testDir = path.join(os.tmpdir(), 'pictolabs-print');
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const testPath = path.join(testDir, 'cut_test.jpg');

      // Create a small 2-inch calibration strip (600x600 px)
      await sharp({
        create: {
          width: 1200,
          height: 600,
          channels: 3,
          background: { r: 240, g: 240, b: 240 },
        },
      })
        .jpeg({ quality: 90 })
        .toFile(testPath);

      setPrintDispatchActive(true);
      try {
        return await printImage(testPath, defaultPrinterName, 1);
      } finally {
        setPrintDispatchActive(false);
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // ─── Set Bypass Mode ───────────────────────────────────
  ipcMain.handle('printer:set-bypass', async (_event, enabled: boolean) => {
    isBypassMode = Boolean(enabled);
    console.log(`[PrintService] Bypass mode dynamically set to: ${isBypassMode}`);
    return { success: true, bypass: isBypassMode };
  });

  // Background health monitoring is centrally managed by PrinterMonitorService
  // to prevent duplicate PowerShell process spawning and CPU contention.
}

export function stopPrintService(): void {
  if (backgroundHealthTimer) {
    clearInterval(backgroundHealthTimer);
    backgroundHealthTimer = null;
  }
}

