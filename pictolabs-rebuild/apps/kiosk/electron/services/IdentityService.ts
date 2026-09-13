import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app, safeStorage, ipcMain } from 'electron';
import { getDatabase, recordSystemEvent, updateSyncCredentials } from './SyncEngine';

/**
 * Pictolabs Phase 3.3: Kiosk Identity & Provisioning Service
 *
 * Requirements:
 * 1. Storage Location:
 *    - Windows: %ProgramData%\Pictolabs\identity.json (system-wide, persistent across user wipe)
 *    - Non-Windows / Fallback: %APPDATA%\Pictolabs\identity.json or local dataDir
 * 2. DPAPI Encryption:
 *    - deviceSecret encrypted via Windows DPAPI (Electron safeStorage API)
 * 3. Provisioning Version:
 *    - provisioningVersion: 1
 * 4. SQLite Mirror:
 *    - kiosk_identity table in kiosk.db
 * 5. Backward Compatibility:
 *    - Auto-migrates legacy dev-secret-booth-01 if existing without re-pairing
 */

export interface BoothIdentity {
  provisioningVersion: number;
  boothId: string;
  boothName: string;
  branchId: string;
  branchName: string;
  companyId?: string | null;
  location?: string | null;
  apiBaseUrl: string;
  pairedAt: string;
  updatedAt: string;
  deviceSecretCiphertext: string;
}

export interface KioskIdentityDTO {
  isPaired: boolean;
  provisioningVersion: number;
  boothId: string | null;
  boothName: string | null;
  branchId: string | null;
  branchName: string | null;
  location: string | null;
  apiBaseUrl: string;
  pairedAt: string | null;
}

let activeIdentity: BoothIdentity | null = null;
let activeDeviceSecret: string | null = null;
let customIdentityDir: string | null = null;

/**
 * Resolve system identity directory (%ProgramData%\Pictolabs on Windows)
 */
export function getIdentityStorageDir(): string {
  if (customIdentityDir) return customIdentityDir;

  if (process.platform === 'win32' && process.env.ALLUSERSPROFILE) {
    return path.join(process.env.ALLUSERSPROFILE, 'Pictolabs');
  }

  // Fallback to app userData or os tmpdir
  try {
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'Identity');
    }
  } catch (_) {}

  return path.join(os.homedir(), '.pictolabs');
}

export function getIdentityFilePath(): string {
  return path.join(getIdentityStorageDir(), 'identity.json');
}

export function setCustomIdentityDir(dir: string): void {
  customIdentityDir = dir;
}

/**
 * Encrypt a secret string using Windows DPAPI (Electron safeStorage)
 * with graceful fallback for headless test environments
 */
export function encryptSecret(plainText: string): string {
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const encryptedBuffer = safeStorage.encryptString(plainText);
      return `dpapi:${encryptedBuffer.toString('base64')}`;
    }
  } catch (err: any) {
    console.warn('[IdentityService] safeStorage DPAPI unavailable, using protected fallback:', err?.message);
  }
  // Base64 protected fallback for test runner / dev environments
  return `b64:${Buffer.from(plainText, 'utf-8').toString('base64')}`;
}

/**
 * Decrypt a secret string using Windows DPAPI or fallback
 */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return '';

  if (ciphertext.startsWith('dpapi:')) {
    try {
      const base64Data = ciphertext.replace('dpapi:', '');
      const buffer = Buffer.from(base64Data, 'base64');
      if (safeStorage && typeof safeStorage.decryptString === 'function') {
        return safeStorage.decryptString(buffer);
      }
    } catch (err: any) {
      console.error('[IdentityService] Failed to decrypt DPAPI secret:', err?.message);
    }
  }

  if (ciphertext.startsWith('b64:')) {
    const base64Data = ciphertext.replace('b64:', '');
    return Buffer.from(base64Data, 'base64').toString('utf-8');
  }

  // Raw secret fallback for legacy migrations
  return ciphertext;
}

/**
 * Gather hardware fingerprint for device binding
 */
export function getDeviceFingerprint(): {
  machineGuid?: string;
  macAddress?: string;
  hostname: string;
  osVersion: string;
  electronVersion: string;
  appVersion: string;
} {
  let macAddress = '00:00:00:00:00:00';
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
          macAddress = net.mac;
          break;
        }
      }
    }
  } catch (_) {}

  return {
    machineGuid: os.hostname(), // Using hostname as default identifier; in prod can query Windows Registry MachineGuid
    macAddress,
    hostname: os.hostname(),
    osVersion: `${os.type()} ${os.release()}`,
    electronVersion: process.versions.electron || 'unknown',
    appVersion: '1.0.0',
  };
}

/**
 * Mirror active identity to local SQLite table kiosk_identity
 */
function mirrorToSQLite(identity: BoothIdentity): void {
  const db = getDatabase();
  if (!db) return;

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kiosk_identity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        booth_id TEXT NOT NULL,
        booth_name TEXT NOT NULL,
        branch_id TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        company_id TEXT,
        location TEXT,
        api_base_url TEXT NOT NULL,
        paired_at TEXT NOT NULL,
        provisioning_version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );
    `);

    db.prepare(`
      INSERT INTO kiosk_identity (
        id, booth_id, booth_name, branch_id, branch_name, company_id, location, api_base_url, paired_at, provisioning_version, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        booth_id = excluded.booth_id,
        booth_name = excluded.booth_name,
        branch_id = excluded.branch_id,
        branch_name = excluded.branch_name,
        company_id = excluded.company_id,
        location = excluded.location,
        api_base_url = excluded.api_base_url,
        paired_at = excluded.paired_at,
        provisioning_version = excluded.provisioning_version,
        updated_at = excluded.updated_at;
    `).run(
      identity.boothId,
      identity.boothName,
      identity.branchId,
      identity.branchName,
      identity.companyId || null,
      identity.location || null,
      identity.apiBaseUrl,
      identity.pairedAt,
      identity.provisioningVersion,
      identity.updatedAt
    );
  } catch (err: any) {
    console.warn('[IdentityService] Failed to mirror identity to SQLite:', err?.message);
  }
}

/**
 * Save newly paired identity to disk and SQLite
 */
export function saveIdentity(
  params: {
    boothId: string;
    boothName: string;
    branchId: string;
    branchName: string;
    companyId?: string | null;
    location?: string | null;
    apiBaseUrl: string;
  },
  plainDeviceSecret: string
): BoothIdentity {
  const dir = getIdentityStorageDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const now = new Date().toISOString();
  const ciphertext = encryptSecret(plainDeviceSecret);

  const identity: BoothIdentity = {
    provisioningVersion: 1,
    boothId: params.boothId,
    boothName: params.boothName,
    branchId: params.branchId,
    branchName: params.branchName,
    companyId: params.companyId || null,
    location: params.location || null,
    apiBaseUrl: params.apiBaseUrl,
    pairedAt: now,
    updatedAt: now,
    deviceSecretCiphertext: ciphertext,
  };

  // Atomic file write using temporary swap file
  const filePath = getIdentityFilePath();
  const tempPath = `${filePath}.${Date.now()}.tmp`;

  fs.writeFileSync(tempPath, JSON.stringify(identity, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);

  activeIdentity = identity;
  activeDeviceSecret = plainDeviceSecret;

  // Mirror to SQLite
  mirrorToSQLite(identity);

  // Dynamically inform SyncEngine about newly paired credentials
  try {
    updateSyncCredentials(identity.apiBaseUrl, plainDeviceSecret, identity.boothId);
  } catch (err: any) {
    console.warn('[IdentityService] SyncEngine credentials update skipped/deferred:', err?.message);
  }

  console.log(`[IdentityService] ✓ Identity persisted for ${identity.boothName} (${identity.boothId})`);
  recordSystemEvent('IDENTITY_SAVED', 'INFO', 'IdentityService', `Paired to booth ${identity.boothName} (${identity.boothId})`);

  return identity;
}

/**
 * Load identity from ProgramData or SQLite mirror on app boot
 */
export function loadIdentity(defaultApiUrl: string = 'http://localhost:4000', allowLegacyAutoSeed: boolean = true): BoothIdentity | null {
  const filePath = getIdentityFilePath();

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as BoothIdentity;
      if (parsed.boothId && parsed.deviceSecretCiphertext) {
        activeIdentity = parsed;
        activeDeviceSecret = decryptSecret(parsed.deviceSecretCiphertext);
        mirrorToSQLite(parsed);
        console.log(`[IdentityService] ✓ Loaded identity from ${filePath}: ${parsed.boothName} (${parsed.boothId})`);

        try {
          updateSyncCredentials(parsed.apiBaseUrl, activeDeviceSecret, parsed.boothId);
        } catch (_) {}

        return parsed;
      }
    } catch (err: any) {
      console.error('[IdentityService] Failed to read identity.json:', err?.message);
    }
  }

  // Fallback: Check if SQLite has identity mirror
  const db = getDatabase();
  if (db) {
    try {
      const row = db.prepare('SELECT * FROM kiosk_identity WHERE id = 1').get() as any;
      if (row && row.booth_id) {
        console.log(`[IdentityService] ℹ️ Found SQLite identity mirror for booth ${row.booth_name}`);
      }
    } catch (_) {}
  }

  // Backward compatibility migration for Pilot Booth #1
  const isDev = Boolean(app?.isPackaged === false || process.env.NODE_ENV !== 'production');
  const allowPilotAutoSeed = allowLegacyAutoSeed && (isDev || process.env.PICTOLABS_PILOT_MIGRATION === 'true');
  if (allowPilotAutoSeed) {
    console.log('[IdentityService] ℹ️ Auto-migrating legacy Pilot Booth #1 (dev-secret-booth-01)');
    return saveIdentity(
      {
        boothId: 'pilot-booth-01',
        boothName: 'Pilot Booth #1 (Grand Indonesia)',
        branchId: 'branch-gi-01',
        branchName: 'Grand Indonesia Mall',
        companyId: 'comp-default',
        location: 'West Mall Fl. 3',
        apiBaseUrl: defaultApiUrl,
      },
      'dev-secret-booth-01'
    );
  }

  activeIdentity = null;
  activeDeviceSecret = null;
  return null;
}

/**
 * Wipe identity (used on revocation or factory reset)
 */
export function wipeIdentity(): void {
  const filePath = getIdentityFilePath();
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
  }

  const db = getDatabase();
  if (db) {
    try {
      db.exec('DELETE FROM kiosk_identity WHERE id = 1;');
    } catch (_) {}
  }

  activeIdentity = null;
  activeDeviceSecret = null;
  console.log('[IdentityService] ⚠️ Identity wiped. Kiosk is now UNPAIRED.');
  recordSystemEvent('IDENTITY_WIPED', 'WARN', 'IdentityService', 'Kiosk identity wiped. Unit unpaired.');
}

/**
 * Get current public identity DTO (safe for renderer)
 */
export function getKioskIdentityDTO(): KioskIdentityDTO {
  if (!activeIdentity) {
    return {
      isPaired: false,
      provisioningVersion: 1,
      boothId: null,
      boothName: null,
      branchId: null,
      branchName: null,
      location: null,
      apiBaseUrl: 'http://localhost:4000',
      pairedAt: null,
    };
  }

  return {
    isPaired: true,
    provisioningVersion: activeIdentity.provisioningVersion || 1,
    boothId: activeIdentity.boothId,
    boothName: activeIdentity.boothName,
    branchId: activeIdentity.branchId,
    branchName: activeIdentity.branchName,
    location: activeIdentity.location || null,
    apiBaseUrl: activeIdentity.apiBaseUrl,
    pairedAt: activeIdentity.pairedAt,
  };
}

export function getActiveDeviceSecret(): string | null {
  return activeDeviceSecret;
}

export function isKioskPaired(): boolean {
  return Boolean(activeIdentity?.boothId && activeDeviceSecret);
}

/**
 * Execute online activation handshake with NestJS backend
 */
export async function activateKioskWithToken(
  apiBaseUrl: string,
  token: string
): Promise<{ success: boolean; error?: string; identity?: KioskIdentityDTO }> {
  const url = `${apiBaseUrl}/api/provisioning/activate`;
  const fingerprint = getDeviceFingerprint();

  try {
    console.log(`[IdentityService] Initiating activation handshake with ${url} (Token: ${token})...`);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        deviceFingerprint: fingerprint,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      const errMessage = data.message || data.error || 'Activation failed';
      console.error('[IdentityService] Activation handshake rejected:', errMessage);
      return { success: false, error: errMessage };
    }

    // Save identity locally with DPAPI encryption
    saveIdentity(
      {
        boothId: data.boothId,
        boothName: data.boothName,
        branchId: data.branchId,
        branchName: data.branchName,
        companyId: data.companyId,
        location: data.location,
        apiBaseUrl,
      },
      data.deviceSecret
    );

    return {
      success: true,
      identity: getKioskIdentityDTO(),
    };
  } catch (err: any) {
    console.error('[IdentityService] Network error during activation:', err?.message);
    return { success: false, error: err?.message || 'Network error during activation' };
  }
}

/**
 * Register IPC Handlers for Kiosk Renderer UI
 */
export function registerIdentityHandlers(): void {
  if (ipcMain && typeof ipcMain.handle === 'function') {
    ipcMain.handle('identity:get-status', async () => {
      return getKioskIdentityDTO();
    });

    ipcMain.handle('identity:activate', async (_event, apiBaseUrl: string, token: string) => {
      return activateKioskWithToken(apiBaseUrl, token);
    });

    ipcMain.handle('identity:wipe', async () => {
      wipeIdentity();
      return { success: true };
    });
  }

  console.log('[IdentityService] ✓ Registered IPC handlers for kiosk identity & provisioning');
}
