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
}

export interface PrinterHealth {
  ready: boolean;
  name: string;
  code: 'OK' | 'PAPER_OUT' | 'LOW_PAPER' | 'RIBBON_OUT' | 'DOOR_OPEN' | 'JAMMED' | 'OFFLINE' | 'BUSY' | 'ERROR' | 'NO_PRINTER';
  message: string;
  checkedAt: number;
}

let defaultPrinterName: string | null = null;
let cachedHealth: PrinterHealth = {
  ready: true,
  name: 'Detecting...',
  code: 'OK',
  message: 'Printer siap',
  checkedAt: 0,
};
let isCheckingHealth = false;

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
      $hasJobError = ($jobs | Where-Object { $_.JobStatus -match 'Error|PaperOut|Blocked' }).Count -gt 0
      
      [PSCustomObject]@{
        Name = $p.Name
        WorkOffline = $p.WorkOffline
        PrinterStatus = $p.PrinterStatus
        DetectedErrorState = $p.DetectedErrorState
        ExtendedPrinterStatus = $p.ExtendedPrinterStatus
        HasJobError = $hasJobError
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
    let code: PrinterHealth['code'] = 'OK';
    let message = 'Printer siap';
    let ready = true;

    if (data.WorkOffline === true) {
      code = 'OFFLINE';
      message = 'Printer offline / kabel USB terputus';
      ready = false;
    } else if (data.DetectedErrorState === 4) {
      code = 'PAPER_OUT';
      message = 'Kertas foto habis (Paper Out)';
      ready = false;
    } else if (data.DetectedErrorState === 6) {
      code = 'RIBBON_OUT';
      message = 'Pita ribbon habis (Ribbon Out)';
      ready = false;
    } else if (data.DetectedErrorState === 7) {
      code = 'DOOR_OPEN';
      message = 'Pintu printer terbuka (Cover Open)';
      ready = false;
    } else if (data.DetectedErrorState === 8) {
      code = 'JAMMED';
      message = 'Kertas macet di dalam printer (Paper Jam)';
      ready = false;
    } else if (data.DetectedErrorState === 3) {
      code = 'LOW_PAPER';
      message = 'Kertas hampir habis (< 20 lembar)';
      ready = true; // Still ready, but warning
    } else if (data.ExtendedPrinterStatus === 7) {
      code = 'OFFLINE';
      message = 'Printer offline';
      ready = false;
    } else if (data.ExtendedPrinterStatus === 9 || data.HasJobError) {
      code = 'ERROR';
      message = 'Antrean spooler printer bermasalah';
      ready = false;
    } else if (data.PrinterStatus === 4) {
      code = 'BUSY';
      message = 'Sedang mencetak antrean lain...';
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
function printImage(
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
  console.log(`[PrintService] Detected printers: [${printers.join(', ')}]`);
  console.log(`[PrintService] Default printer: ${defaultPrinterName || 'NONE'}`);

  // ─── Print ─────────────────────────────────────────────
  ipcMain.handle(
    'printer:print',
    async (_event, imagePath: string, copies: number = 1) => {
      if (!defaultPrinterName) {
        return { success: false, error: 'No printer configured or detected' };
      }
      return printImage(imagePath, defaultPrinterName, copies);
    }
  );

  // ─── Printer Health & Pre-Session Gate ──────────────────
  ipcMain.handle('printer:health', async () => {
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
    if (!defaultPrinterName) {
      return { success: false, error: 'Tidak ada printer terpasang' };
    }

    const lastSession = getLastSession();
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
}

