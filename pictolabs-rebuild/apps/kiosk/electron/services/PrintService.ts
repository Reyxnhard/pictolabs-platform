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
  name: 'Detecting...',
  code: 'OK',
  message: 'Printer siap',
  checkedAt: 0,
};
let isCheckingHealth = false;
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

/**
 * Query detailed hardware health status of a printer via WMI/CIM.
 */
async function queryPrinterHealth(printerName: string): Promise<PrinterHealth> {
  const now = Date.now();
  // Return cached status if checked within the last 3 seconds
  if (now - cachedHealth.checkedAt < 3000 && cachedHealth.name === printerName) {
    return cachedHealth;
  }

  if (isCheckingHealth) return cachedHealth;
  isCheckingHealth = true;

  try {
    const escaped = printerName.replace(/'/g, "''");
    const psCmd = `
      $p = Get-CimInstance Win32_Printer -Filter "Name = '${escaped}'" -ErrorAction SilentlyContinue
      if (-not $p) {
        Write-Output "NOT_FOUND"
        exit
      }
      $jobs = Get-PrintJob -PrinterName '${escaped}' -ErrorAction SilentlyContinue
      $hasJobError = ($jobs | Where-Object { $_.JobStatus -match 'Error|PaperOut|Blocked|UserIntervention' }).Count -gt 0
      $jobStatuses = @($jobs | ForEach-Object { $_.JobStatus })
      
      [PSCustomObject]@{
        Name = $p.Name
        WorkOffline = [bool]$p.WorkOffline
        PrinterStatus = [int]$p.PrinterStatus
        PrinterState = [int]$p.PrinterState
        DetectedErrorState = [int]$p.DetectedErrorState
        ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus
        HasJobError = [bool]$hasJobError
        JobStatuses = $jobStatuses
      } | ConvertTo-Json -Compress
    `.replace(/\n/g, ' ');

    const stdout = await new Promise<string>((resolve) => {
      exec(`powershell -NoProfile -Command "${psCmd}"`, { timeout: 6000 }, (err, out) => {
        if (err) resolve('');
        else resolve((out || '').trim());
      });
    });

    if (!stdout || stdout === 'NOT_FOUND') {
      cachedHealth = {
        ready: false,
        name: printerName,
        code: 'NO_PRINTER',
        message: 'Printer tidak terhubung ke Windows',
        checkedAt: now,
      };
      return cachedHealth;
    }

    const data = JSON.parse(stdout);
    const printerState = Number(data.PrinterState) || 0;
    const detectedError = Number(data.DetectedErrorState) || 0;
    const extendedStatus = Number(data.ExtendedPrinterStatus) || 0;
    const jobStatuses: string[] = Array.isArray(data.JobStatuses) ? data.JobStatuses : [];
    const jobStatusStr = jobStatuses.join(' ').toLowerCase();

    let code: PrinterHealth['code'] = 'OK';
    let message = 'Printer siap';
    let ready = true;

    // Priority 1: Offline / Disconnected
    if (
      data.WorkOffline === true ||
      extendedStatus === 7 ||
      (printerState & PRINTER_STATE_OFFLINE) !== 0 ||
      (printerState & PRINTER_STATE_NOT_AVAILABLE) !== 0
    ) {
      code = 'OFFLINE';
      message = 'Printer offline / kabel USB terputus';
      ready = false;
    }
    // Priority 2: Cover / Door Open
    else if (
      (printerState & PRINTER_STATE_DOOR_OPEN) !== 0 ||
      detectedError === 7 ||
      jobStatusStr.includes('door')
    ) {
      code = 'DOOR_OPEN';
      message = 'Penutup pintu printer terbuka (Door Open)';
      ready = false;
    }
    // Priority 3: Paper Out / Problem
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

    cachedHealth = { ready, name: printerName, code, message, checkedAt: now };
  } catch {
    // If query fails, fall back to basic readiness to not brick kiosk
    cachedHealth = {
      ready: true,
      name: printerName,
      code: 'OK',
      message: 'Status normal',
      checkedAt: now,
    };
  } finally {
    isCheckingHealth = false;
  }

  return cachedHealth;
}

/**
 * Print an image file using Windows ImageView_PrintTo.
 */
export function printImage(
  imagePath: string,
  printerName: string,
  copies: number
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
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
        resolve({ success: false, error: `Failed to write temp print file: ${(err as Error).message}` });
        return;
      }
    }

    if (!fs.existsSync(targetPath)) {
      resolve({ success: false, error: `File not found: ${targetPath}` });
      return;
    }

    const escapedPath = targetPath.replace(/'/g, "''");
    const escapedPrinter = printerName.replace(/'/g, "''");

    const printCommands: string[] = [];
    for (let i = 0; i < copies; i++) {
      printCommands.push(
        `rundll32 shimgvw.dll,ImageView_PrintTo /pt "${escapedPath}" "${escapedPrinter}"`
      );
    }

    const psScript = printCommands.join(' ; ');

    exec(
      `powershell -NoProfile -Command "${psScript}"`,
      { timeout: 30000 },
      (error, _stdout, stderr) => {
        if (error) {
          console.error('[PrintService] Print failed:', error.message);
          resolve({ success: false, error: error.message });
        } else if (stderr && stderr.trim()) {
          console.warn('[PrintService] Print warning:', stderr);
          resolve({ success: true });
        } else {
          console.log(`[PrintService] ✓ Print job sent: ${path.basename(imagePath)} → ${printerName} (x${copies})`);
          resolve({ success: true });
        }
      }
    );
  });
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

