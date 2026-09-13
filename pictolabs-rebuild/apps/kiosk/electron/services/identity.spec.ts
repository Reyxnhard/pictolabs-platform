import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';

// Setup isolated temporary directory for test storage
const TEST_DIR = path.join(os.tmpdir(), `pictolabs-identity-test-${Date.now()}`);
fs.mkdirSync(TEST_DIR, { recursive: true });

import {
  setCustomIdentityDir,
  getIdentityStorageDir,
  getIdentityFilePath,
  encryptSecret,
  decryptSecret,
  getDeviceFingerprint,
  saveIdentity,
  loadIdentity,
  wipeIdentity,
  getKioskIdentityDTO,
  getActiveDeviceSecret,
  isKioskPaired,
} from './IdentityService';

import { initSyncEngine, stopSyncEngine, getDatabase } from './SyncEngine';

async function runIdentityStorageTests() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  PICTOLABS PHASE 3.3 AUTOMATED SUITE: LOCAL IDENTITY & DPAPI STORAGE');
  console.log(`  Test Working Dir: ${TEST_DIR}`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  let passedCount = 0;
  let failedCount = 0;

  function pass(testName: string) {
    passedCount++;
    console.log(`  ✓ [PASS] ${testName}`);
  }

  function fail(testName: string, err: any) {
    failedCount++;
    console.error(`  ✗ [FAIL] ${testName}:`, err.message || err);
  }

  // Configure custom identity directory & initialize SQLite test instance
  setCustomIdentityDir(TEST_DIR);
  initSyncEngine({
    dataDir: TEST_DIR,
    syncIntervalMs: 60000,
    apiBaseUrl: 'http://localhost:4000',
  });

  // ─────────────────────────────────────────────────────────
  // TEST 1: Encryption and Decryption Round-Trip
  // ─────────────────────────────────────────────────────────
  try {
    const rawSecret = 'sec_live_9f8b4a2e1c0d3e5f7a9b8c0d1e2f3a4b5c6d7e8f0a1b2c3d4e5f6a7b8c9d0e1f';
    const ciphertext = encryptSecret(rawSecret);

    assert.ok(ciphertext.startsWith('dpapi:') || ciphertext.startsWith('b64:'));
    assert.notStrictEqual(ciphertext, rawSecret, 'Ciphertext must not be plaintext');

    const decrypted = decryptSecret(ciphertext);
    assert.strictEqual(decrypted, rawSecret, 'Decrypted secret must exactly match raw plaintext');

    // Test legacy un-encrypted fallback
    const legacyPlain = 'dev-secret-booth-01';
    assert.strictEqual(decryptSecret(legacyPlain), legacyPlain);

    pass('Priority 2: DPAPI/Cipher secret encryption and decryption round-trip');
  } catch (err: any) {
    fail('Priority 2: DPAPI/Cipher secret encryption and decryption round-trip', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 2: Device Fingerprinting
  // ─────────────────────────────────────────────────────────
  try {
    const fp = getDeviceFingerprint();
    assert.ok(fp.hostname && fp.hostname.length > 0);
    assert.ok(fp.osVersion && fp.osVersion.length > 0);
    assert.ok(fp.macAddress && fp.macAddress.length >= 12);
    assert.strictEqual(fp.appVersion, '1.0.0');

    pass('Priority 3: Hardware fingerprinting collects hostname, OS, and MAC address');
  } catch (err: any) {
    fail('Priority 3: Hardware fingerprinting collects hostname, OS, and MAC address', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 3: Atomic Identity Persistence & SQLite Mirroring
  // ─────────────────────────────────────────────────────────
  try {
    // Initial state: Unpaired
    wipeIdentity();
    assert.strictEqual(isKioskPaired(), false);
    assert.strictEqual(getActiveDeviceSecret(), null);

    const testSecret = 'sec_live_deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb';
    const saved = saveIdentity(
      {
        boothId: 'booth-central-park-02',
        boothName: 'Central Park Kiosk #2',
        branchId: 'branch-cp',
        branchName: 'Central Park Mall',
        companyId: 'comp-pictolabs',
        location: 'LG Floor Fashion District',
        apiBaseUrl: 'https://api.pictolabs.id',
      },
      testSecret
    );

    assert.strictEqual(saved.provisioningVersion, 1);
    assert.strictEqual(saved.boothId, 'booth-central-park-02');
    assert.strictEqual(isKioskPaired(), true);
    assert.strictEqual(getActiveDeviceSecret(), testSecret);

    // Verify identity.json exists on disk
    const idPath = getIdentityFilePath();
    assert.ok(fs.existsSync(idPath));
    const diskContent = JSON.parse(fs.readFileSync(idPath, 'utf-8'));
    assert.strictEqual(diskContent.boothId, 'booth-central-park-02');
    assert.strictEqual(diskContent.provisioningVersion, 1);
    assert.ok(diskContent.deviceSecretCiphertext);

    // Verify SQLite table mirror
    const db = getDatabase();
    assert.ok(db);
    const row = db.prepare('SELECT * FROM kiosk_identity WHERE id = 1').get() as any;
    assert.ok(row);
    assert.strictEqual(row.booth_id, 'booth-central-park-02');
    assert.strictEqual(row.booth_name, 'Central Park Kiosk #2');
    assert.strictEqual(row.provisioning_version, 1);

    // Verify KioskIdentityDTO exposed to UI does not leak secret
    const dto = getKioskIdentityDTO();
    assert.strictEqual(dto.isPaired, true);
    assert.strictEqual(dto.boothId, 'booth-central-park-02');
    assert.strictEqual(dto.boothName, 'Central Park Kiosk #2');
    assert.strictEqual((dto as any).deviceSecretCiphertext, undefined);
    assert.strictEqual((dto as any).deviceSecret, undefined);

    pass('Priority 2: Atomic identity persistence, versioning, and SQLite mirroring');
  } catch (err: any) {
    fail('Priority 2: Atomic identity persistence, versioning, and SQLite mirroring', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 4: Identity Loading on Subsequent App Boot
  // ─────────────────────────────────────────────────────────
  try {
    const loaded = loadIdentity('http://localhost:4000', false);
    assert.ok(loaded);
    assert.strictEqual(loaded.boothId, 'booth-central-park-02');
    assert.strictEqual(loaded.provisioningVersion, 1);
    assert.strictEqual(getActiveDeviceSecret(), 'sec_live_deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb');

    pass('Priority 2: Persistent identity reload on boot retains active credentials');
  } catch (err: any) {
    fail('Priority 2: Persistent identity reload on boot retains active credentials', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 5: Identity Wipe (Emergency Reset / Factory Reset)
  // ─────────────────────────────────────────────────────────
  try {
    wipeIdentity();

    assert.strictEqual(isKioskPaired(), false);
    assert.strictEqual(getActiveDeviceSecret(), null);
    assert.strictEqual(fs.existsSync(getIdentityFilePath()), false);

    const db = getDatabase();
    const row = db?.prepare('SELECT * FROM kiosk_identity WHERE id = 1').get();
    assert.strictEqual(row, undefined);

    const dto = getKioskIdentityDTO();
    assert.strictEqual(dto.isPaired, false);
    assert.strictEqual(dto.boothId, null);

    pass('Priority 2: Identity wipe cleanly un-pairs kiosk and purges file and SQLite mirrors');
  } catch (err: any) {
    fail('Priority 2: Identity wipe cleanly un-pairs kiosk and purges file and SQLite mirrors', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 6: Legacy Pilot Migration (Backward Compatibility)
  // ─────────────────────────────────────────────────────────
  try {
    // With no identity on disk, loadIdentity with allowLegacyAutoSeed=true should auto-migrate pilot
    const migrated = loadIdentity('http://localhost:4000', true);
    assert.ok(migrated);
    assert.strictEqual(migrated.boothId, 'pilot-booth-01');
    assert.strictEqual(getActiveDeviceSecret(), 'dev-secret-booth-01');
    assert.strictEqual(isKioskPaired(), true);

    pass('Priority 5: Backward compatibility migration auto-seeds Pilot Booth #1 without locking out units');
  } catch (err: any) {
    fail('Priority 5: Backward compatibility migration auto-seeds Pilot Booth #1 without locking out units', err);
  }

  // Clean up test directory
  stopSyncEngine();
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (_) {}

  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`LOCAL IDENTITY SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('──────────────────────────────────────────────────────────────────────\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runIdentityStorageTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
