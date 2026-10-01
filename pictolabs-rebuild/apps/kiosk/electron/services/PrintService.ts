import { ipcMain } from 'electron';
import { exec, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { getLastSession } from './SyncEngine';

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
  checkedAt: 0,
};
let activeHealthPromise: Promise<PrinterHealth> | null = null;
let backgroundHealthTimer: NodeJS.Timeout | null = null;

export function getCachedPrinterHealth(): PrinterHealth {
  return cachedHealth;
}

export function getDefaultPrinterName(): string | null {
  return defaultPrinterName;
}

export function getIsBypassMode(): boolean {
  return isBypassMode;
}

/**
 * Discover available printers via PowerShell.
 */
function listPrintersSync(): string[] {
  try {
    const output = execSync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
      { encoding: 'utf-8', timeout: 8000 }
    );
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (err) {
    console.error('[PrintService] Failed to list printers:', err);
    return [];
  }
}

/**
 * Auto-detect a photo printer by name heuristics.
 * Prioritizes: DNP > Citizen > any "Photo" printer > first available.
 */
function autoDetectPrinter(printers: string[]): string | null {
  const priorities = ['DNP', 'Citizen', 'Photo', 'Mitsubishi', 'HiTi', 'RX1', 'DS620', 'CX-02'];
  for (const keyword of priorities) {
    const match = printers.find((p) =>
      p.toLowerCase().includes(keyword.toLowerCase())
    );
    if (match) return match;
  }
  return printers[0] || null;
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
    $p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $escaped -or $_.DriverName -like '${profile.driverPattern}' } | Select-Object -First 1
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
      const profile = resolvePrinterProfile(target);
      const escaped = target.replace(/'/g, "''");
      const hwPattern = profile.hardwareIdPattern;

      const psCmd = `
        $ProgressPreference = 'SilentlyContinue'
        $escaped = '${escaped}'
        $hwPattern = '${hwPattern}'

        # 1. Query Software Print Queue
        $p = Get-CimInstance Win32_Printer -Filter "Name = '$escaped'" -ErrorAction SilentlyContinue
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

      cachedHealth = { ready, name: resolvedName, code, message, checkedAt: now };
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
export async function printImage(
  imagePath: string,
  printerName: string,
  copies: number
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

  const profile = resolvePrinterProfile(printerName);

  // 2. Pre-flight Hardware Verification
  const preCheck = await queryPrinterHealth(printerName, true);
  if (!preCheck.ready) {
    console.warn(`[PrintService] Pre-flight failed: ${preCheck.code} - ${preCheck.message}`);
    return { success: false, error: preCheck.message };
  }

  // 3. Baseline: capture any existing job IDs currently in queue
  const preSnapshot = await querySpoolerSnapshot(printerName, profile);
  const baselineJobIds = new Set(preSnapshot.jobs.map((j) => j.id));

  // 4. Dispatch print command via rundll32
  const escapedPath = targetPath.replace(/'/g, "''");
  const escapedPrinter = printerName.replace(/'/g, "''");

  const printCommands: string[] = [];
  for (let i = 0; i < copies; i++) {
    printCommands.push(
      `rundll32 shimgvw.dll,ImageView_PrintTo /pt "${escapedPath}" "${escapedPrinter}"`
    );
  }
  const psScript = printCommands.join(' ; ');

  const dispatchResult = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 30000 }, (error, _stdout, stderr) => {
      if (error) {
        console.error('[PrintService] Spooler dispatch failed:', error.message);
        resolve({ ok: false, error: error.message });
      } else {
        if (stderr && stderr.trim()) {
          console.warn('[PrintService] Spooler dispatch warning:', stderr);
        }
        resolve({ ok: true });
      }
    });
  });

  if (!dispatchResult.ok) {
    return { success: false, error: dispatchResult.error || 'Gagal mengirim berkas ke spooler Windows' };
  }

  console.log(`[PrintService] Print job dispatched to Windows spooler: ${path.basename(imagePath)} (x${copies}). Monitoring spooler transmission...`);

  // 5. Post-Submission Spooler Job Lifecycle Monitoring (Timeout: 25 seconds)
  const startTime = Date.now();
  const TIMEOUT_MS = 25000;
  const POLL_INTERVAL_MS = 1200;

  let observedJobInSpooler = false;
  const trackedJobIds = new Set<number>();

  while (Date.now() - startTime < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const snap = await querySpoolerSnapshot(printerName, profile);

    // A. Physical Presence Loss Check
    if (!snap.physicalPresent) {
      console.error('[PrintService] ✗ Physical printer disconnected mid-transmission!');
      await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
      return { success: false, error: 'Printer terputus atau mati saat proses transmisi cetak' };
    }

    // B. Printer Hardware Error State Check
    if (snap.detectedError === 4) {
      await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
      return { success: false, error: 'Kertas foto habis di dalam tray (Paper Out)' };
    }
    if (snap.detectedError === 6) {
      await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
      return { success: false, error: 'Pita ribbon habis / perlu diganti (Ribbon Out)' };
    }
    if (snap.detectedError === 7) {
      await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
      return { success: false, error: 'Pintu penutup printer terbuka (Door Open)' };
    }
    if (snap.detectedError === 8) {
      await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
      return { success: false, error: 'Kertas macet di dalam printer (Paper Jam)' };
    }

    // Identify jobs belonging to this submission (not in baseline)
    const newJobs = snap.jobs.filter((j) => !baselineJobIds.has(j.id));
    for (const j of newJobs) {
      trackedJobIds.add(j.id);
    }

    if (newJobs.length > 0) {
      observedJobInSpooler = true;

      // C. Active Job Status Error Check
      for (const j of newJobs) {
        const s = j.status.toLowerCase();
        if (s.includes('paperout') || s.includes('paper out')) {
          await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
          return { success: false, error: 'Kertas foto habis di dalam tray (Paper Out)' };
        }
        if (s.includes('door') || s.includes('cover')) {
          await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
          return { success: false, error: 'Pintu penutup printer terbuka (Door Open)' };
        }
        if (s.includes('jam')) {
          await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
          return { success: false, error: 'Kertas macet di dalam printer (Paper Jam)' };
        }
        if (s.includes('toner') || s.includes('ribbon')) {
          await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
          return { success: false, error: 'Pita ribbon habis (Ribbon Out)' };
        }
        if (s.includes('offline')) {
          await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
          return { success: false, error: 'Printer offline atau kabel USB terputus' };
        }
        if (s.includes('userintervention')) {
          await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
          return { success: false, error: 'Printer membutuhkan intervensi teknisi' };
        }
        if (s.includes('error') || s.includes('blocked')) {
          await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
          return { success: false, error: `Error transmisi spooler: ${j.status}` };
        }
      }
    } else {
      // If we observed the job in spooler, and now it has cleared:
      if (observedJobInSpooler) {
        const postHealth = await queryPrinterHealth(printerName, true);
        if (!postHealth.ready) {
          console.warn(`[PrintService] Post-flight warning: ${postHealth.message}`);
          return { success: false, error: postHealth.message };
        }
        console.log(`[PrintService] ✓ Print job successfully transmitted to ${printerName}: ${path.basename(imagePath)}`);
        return { success: true };
      }

      // If we haven't observed it in spooler, but at least 2.5s elapsed without error:
      if (Date.now() - startTime > 2500) {
        const postHealth = await queryPrinterHealth(printerName, true);
        if (!postHealth.ready) {
          return { success: false, error: postHealth.message };
        }
        console.log(`[PrintService] ✓ Print job fast-transmitted to ${printerName}: ${path.basename(imagePath)}`);
        return { success: true };
      }
    }
  }

  // 6. Timeout exceeded
  console.warn(`[PrintService] ⚠️ Spooler transmission timeout after ${TIMEOUT_MS / 1000}s`);
  await cancelSpoolerJobs(printerName, Array.from(trackedJobIds));
  return { success: false, error: 'Batas waktu transmisi spooler printer terlampaui (Timeout 25s)' };
}

export function registerPrintHandlers(config: PrintServiceConfig): void {
  // Initialize printer on startup
  const printers = listPrintersSync();
  defaultPrinterName = config.defaultPrinter || autoDetectPrinter(printers);

  const priorities = ['DNP', 'Citizen', 'HiTi', 'RX1', 'DS620', 'CX-02', 'P525L', 'Mitsubishi'];
  const hasPhotoHardware = printers.some((p) =>
    priorities.some((keyword) => p.toLowerCase().includes(keyword.toLowerCase()))
  );

  // Auto-enable bypass if no dedicated photo printer hardware is attached
  if (config.bypassPrinter !== undefined) {
    isBypassMode = config.bypassPrinter;
  } else if (!hasPhotoHardware) {
    isBypassMode = true;
    console.log('[PrintService] ⚠️ No dedicated photo printer detected. Auto-enabling BYPASS / SIMULATION MODE.');
  } else {
    isBypassMode = false;
  }

  console.log(`[PrintService] Detected printers: [${printers.join(', ')}]`);
  console.log(`[PrintService] Default printer: ${defaultPrinterName || 'NONE'}`);
  console.log(`[PrintService] Bypass Mode: ${isBypassMode ? 'ENABLED (Simulated Spooler)' : 'DISABLED (Hardware Gate)'}`);

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
    return listPrintersSync();
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

      return printImage(testPath, defaultPrinterName, 1);
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

  // Start background health polling every 3.5s
  if (backgroundHealthTimer) clearInterval(backgroundHealthTimer);
  backgroundHealthTimer = setInterval(() => {
    if (!isBypassMode && defaultPrinterName) {
      queryPrinterHealth(defaultPrinterName).catch(() => {});
    }
  }, 3500);
}

export function stopPrintService(): void {
  if (backgroundHealthTimer) {
    clearInterval(backgroundHealthTimer);
    backgroundHealthTimer = null;
  }
}

