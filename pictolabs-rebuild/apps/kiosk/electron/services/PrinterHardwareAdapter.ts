import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getIsBypassMode } from './PrintService';

export type HardwareStatusState =
  | 'READY'
  | 'PAPER_OUT'
  | 'COVER_OPEN'
  | 'RIBBON_OUT'
  | 'JAMMED'
  | 'BUSY'
  | 'ERROR'
  | 'OFFLINE'
  | 'UNKNOWN';

export interface PrinterHardwareStatus {
  state: HardwareStatusState;
  message: string;
  mediaRemaining?: number;
  serial?: string;
  firmware?: string;
  rawStatus?: string;
  checkedAt: number;
}

let cachedStatus: PrinterHardwareStatus | null = null;
let activeQueryPromise: Promise<PrinterHardwareStatus> | null = null;
let lastExecutionEndTime = 0;

// Standard cache window for general polling (1500ms)
const CACHE_TTL_MS = 1500;
// Immediate probe guard window: Even if forceFresh is requested, if an interrogation
// completed within the last 800ms, reuse the freshly returned telemetry to avoid
// slamming the non-reentrant Win32 DNP USB driver pipe (CreateFile on \\.\DNP_RX1).
const IMMEDIATE_PROBE_GUARD_MS = 800;
// Minimum separation between sequential PhotolabDNP process spawns to guarantee
// clean release of USB handle by Windows kernel driver.
const INTER_QUERY_COOLDOWN_MS = 400;

/**
 * Clear cached telemetry to force a fresh hardware interrogation on next query.
 */
export function clearHardwareCache(): void {
  cachedStatus = null;
}

/**
 * Locate bundled or workspace PhotolabDNP.exe binary.
 */
export function findPhotolabDnpPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'dnp', 'PhotolabDNP.exe'),
    path.join(process.resourcesPath || '', 'dnp', 'PhotolabDNP.exe'),
    path.resolve(__dirname, '../resources/bin/dnp/PhotolabDNP.exe'),
    path.resolve(__dirname, '../../resources/bin/dnp/PhotolabDNP.exe'),
    path.resolve(process.cwd(), 'resources/bin/dnp/PhotolabDNP.exe'),
    path.resolve(process.cwd(), 'apps/kiosk/resources/bin/dnp/PhotolabDNP.exe'),
    'c:\\Users\\ezarh\\.gemini\\antigravity-ide\\scratch\\Pictolabs\\kiosk-client-photobooth-template-flipbook-basic\\print\\PhotolabDNP.exe',
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Locate bundled or workspace print.exe native printing CLI.
 */
export function findPrintExePath(): string | null {
  const dnpPath = findPhotolabDnpPath();
  if (dnpPath) {
    const sibling = path.join(path.dirname(dnpPath), 'print.exe');
    if (fs.existsSync(sibling)) {
      return sibling;
    }
  }

  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'dnp', 'print.exe'),
    path.join(process.resourcesPath || '', 'dnp', 'print.exe'),
    path.resolve(__dirname, '../resources/bin/dnp/print.exe'),
    path.resolve(__dirname, '../../resources/bin/dnp/print.exe'),
    path.resolve(process.cwd(), 'resources/bin/dnp/print.exe'),
    path.resolve(process.cwd(), 'apps/kiosk/resources/bin/dnp/print.exe'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Locate the Pictolabs measurable calibration target asset across packaged and local dev environments.
 */
export function findCalibrationTargetPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'assets', 'calibration_target.png'),
    path.join(process.resourcesPath || '', 'calibration_target.png'),
    path.resolve(__dirname, '../resources/assets/calibration_target.png'),
    path.resolve(__dirname, '../../resources/assets/calibration_target.png'),
    path.resolve(__dirname, '../../../resources/assets/calibration_target.png'),
    path.resolve(process.cwd(), 'resources/assets/calibration_target.png'),
    path.resolve(process.cwd(), 'apps/kiosk/resources/assets/calibration_target.png'),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Query real physical hardware telemetry from DNP photo printer.
 *
 * Clean internal abstraction:
 * Callers (PrintService, PrintQueueService, PrinterMonitorService) only interact
 * with standard HardwareStatusState ('READY', 'PAPER_OUT', 'COVER_OPEN', etc.)
 * without vendor-specific protocol leaks.
 *
 * Concurrency Safety:
 * - Exactly ONE PhotolabDNP.exe process may run at any time.
 * - In-flight queries are deduplicated and shared across all callers.
 * - Minimum cooldown prevents Windows USB driver handle collisions.
 */
export async function getHardwareStatus(
  printerName?: string,
  forceFresh = false
): Promise<PrinterHardwareStatus> {
  const now = Date.now();

  // 1. Bypass Mode: Always report READY without touching physical hardware
  if (getIsBypassMode()) {
    return {
      state: 'READY',
      message: 'Printer siap (Bypass / Virtual Mode)',
      checkedAt: now,
    };
  }

  // 2. Immediate Dedup Guard: If a probe completed within 800ms, reuse it.
  // Protects the non-reentrant USB driver pipe from rapid consecutive spawns.
  if (cachedStatus && now - cachedStatus.checkedAt < IMMEDIATE_PROBE_GUARD_MS) {
    return cachedStatus;
  }

  // 3. Normal TTL cache if fresh execution is not requested
  if (!forceFresh && cachedStatus && now - cachedStatus.checkedAt < CACHE_TTL_MS) {
    return cachedStatus;
  }

  // 4. Concurrency Mutex: If an interrogation is already running, ALL concurrent callers
  // await the exact same in-flight Promise. Exactly ONE PhotolabDNP process runs.
  if (activeQueryPromise) {
    return activeQueryPromise;
  }

  activeQueryPromise = (async () => {
    try {
      // Enforce inter-query cooldown to allow Windows driver handle to close cleanly
      const timeSinceLast = Date.now() - lastExecutionEndTime;
      if (timeSinceLast < INTER_QUERY_COOLDOWN_MS) {
        await new Promise((r) => setTimeout(r, INTER_QUERY_COOLDOWN_MS - timeSinceLast));
      }

      const dnpPath = findPhotolabDnpPath();
      if (!dnpPath) {
        console.warn('[PrinterHardwareAdapter] PhotolabDNP.exe not found on disk. Falling back to UNKNOWN.');
        return {
          state: 'UNKNOWN',
          message: 'Adapter telemetri hardware tidak ditemukan',
          checkedAt: Date.now(),
        };
      }

      // Execute PhotolabDNP with verified unlock key 'OKOKLH' and 'json' command.
      // Includes 1 quick retry on transient process exit error before declaring OFFLINE.
      const runDnp = async (): Promise<string> => {
        return new Promise<string>((resolve, reject) => {
          execFile(
            dnpPath,
            ['OKOKLH', 'json'],
            { timeout: 8000, cwd: path.dirname(dnpPath) },
            (err, out, stderr) => {
              if (err) {
                return reject(new Error(stderr || err.message));
              }
              resolve(out || '');
            }
          );
        });
      };

      let stdout: string;
      try {
        stdout = await runDnp();
      } catch (_firstErr: any) {
        // Transient bus retry: wait 350ms and attempt one final time
        await new Promise((r) => setTimeout(r, 350));
        stdout = await runDnp();
      }

      const trimmed = stdout.trim();
      const queryTime = Date.now();
      if (!trimmed || trimmed === '[]') {
        const offStatus: PrinterHardwareStatus = {
          state: 'OFFLINE',
          message: 'Printer tidak terhubung atau mati',
          checkedAt: queryTime,
        };
        cachedStatus = offStatus;
        return offStatus;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(trimmed);
      } catch (jsonErr: any) {
        console.warn('[PrinterHardwareAdapter] Failed to parse JSON response:', jsonErr.message);
        return {
          state: 'UNKNOWN',
          message: 'Gagal membaca respons telemetri printer',
          checkedAt: queryTime,
        };
      }

      const printerData = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!printerData) {
        const offStatus: PrinterHardwareStatus = {
          state: 'OFFLINE',
          message: 'Printer tidak ditemukan oleh adapter hardware',
          checkedAt: queryTime,
        };
        cachedStatus = offStatus;
        return offStatus;
      }

      const rawStatusText = String(printerData.status || '').trim();
      const mediaRemaining = typeof printerData.media_remaining === 'number' ? printerData.media_remaining : undefined;
      const serial = printerData.serial || undefined;
      const firmware = printerData.firmware || undefined;
      const rawStatus = printerData.raw_status || undefined;

      let state: HardwareStatusState = 'UNKNOWN';
      let message = `Status printer: ${rawStatusText}`;

      switch (rawStatusText) {
        case 'Idle':
          state = 'READY';
          message = 'Printer siap mencetak';
          break;

        case 'Cover Open':
          state = 'COVER_OPEN';
          message = 'Pintu penutup printer terbuka (Cover Open)';
          break;

        case 'Paper End':
        case 'Paper Error':
          state = 'PAPER_OUT';
          message = 'Kertas foto habis di dalam tray (Paper Out)';
          break;

        case 'Ribbon End':
        case 'Ribbon Error':
          state = 'RIBBON_OUT';
          message = 'Pita ribbon printer habis / perlu diganti (Ribbon Out)';
          break;

        case 'Paper Jam':
          state = 'JAMMED';
          message = 'Kertas macet di dalam printer (Paper Jam)';
          break;

        case 'Printing':
        case 'Standstill':
        case 'Cooling':
        case 'Motor Cooling':
        case 'Standby':
          state = 'BUSY';
          message = 'Printer sedang memproses cetak...';
          break;

        case 'Not Connected':
          state = 'OFFLINE';
          message = 'Printer tidak terhubung atau kabel USB terputus';
          break;

        case 'Hardware Error':
        case 'System Error':
        case 'Data Error':
        case 'Scrap Box Error':
        case 'Duplex Unit Error':
          state = 'ERROR';
          message = 'Terjadi gangguan mekanikal pada printer';
          break;

        default:
          if (rawStatusText.startsWith('Busy')) {
            state = 'BUSY';
            message = 'Printer sedang sibuk...';
          } else if (rawStatusText.includes('Error')) {
            state = 'ERROR';
            message = `Gangguan printer: ${rawStatusText}`;
          }
          break;
      }

      cachedStatus = {
        state,
        message,
        mediaRemaining,
        serial,
        firmware,
        rawStatus,
        checkedAt: queryTime,
      };

      return cachedStatus;
    } catch (err: any) {
      console.warn('[PrinterHardwareAdapter] Query error:', err.message);
      const errStatus: PrinterHardwareStatus = {
        state: 'OFFLINE',
        message: 'Printer tidak dapat dihubungi melalui kabel USB',
        checkedAt: Date.now(),
      };
      cachedStatus = errStatus;
      return errStatus;
    } finally {
      lastExecutionEndTime = Date.now();
      activeQueryPromise = null;
    }
  })();

  return activeQueryPromise;
}
