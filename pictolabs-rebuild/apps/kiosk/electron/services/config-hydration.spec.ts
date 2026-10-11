import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

import {
  initSyncEngine,
  stopSyncEngine,
  readLocalKioskConfig,
  writeLocalKioskConfig,
  reconcileRemoteConfig,
} from './SyncEngine';

async function runConfigHydrationTests() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  PICTOLABS PR-01 REGRESSION SUITE: DEFENSIVE CONFIG HYDRATION');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'picto-config-hydration-test-'));
  const configPath = path.join(testDir, 'kiosk-config.json');

  let passed = 0;
  let failed = 0;

  try {
    // Initialize SyncEngine with isolated test directory
    initSyncEngine({
      dataDir: testDir,
      syncIntervalMs: 30000,
      apiBaseUrl: 'http://127.0.0.1:4000',
      deviceSecret: 'test-secret',
      boothId: 'test-booth-id',
    });

    // ─── TEST 1: Cache { "price": 1000 } does not revert to Rp 35.000 ────────
    try {
      fs.writeFileSync(configPath, JSON.stringify({ price: 1000 }, null, 2), 'utf-8');
      const loaded = readLocalKioskConfig();

      assert.strictEqual(loaded.price, 1000, 'Price must remain 1000');
      assert.strictEqual(loaded.pricing?.basePrice, 1000, 'pricing.basePrice must be normalized to 1000');
      assert.strictEqual(loaded.pricing?.currency, 'IDR', 'pricing currency default must be preserved');
      assert.notStrictEqual(loaded.pricing?.basePrice, 35000, 'Must NOT revert to default 35000');

      console.log('✓ TEST 1 PASS: Cache { "price": 1000 } preserves Rp 1.000 without defaulting to Rp 35.000');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 1 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 2: Cache with valid pricing.basePrice remains consistent ────────
    try {
      const input = {
        configVersion: 5,
        pricing: { basePrice: 45000, currency: 'IDR', enableVoucher: true, enableQRIS: true },
        price: 45000,
      };
      fs.writeFileSync(configPath, JSON.stringify(input, null, 2), 'utf-8');
      const loaded = readLocalKioskConfig();

      assert.strictEqual(loaded.configVersion, 5, 'configVersion must be 5');
      assert.strictEqual(loaded.pricing?.basePrice, 45000, 'pricing.basePrice must be 45000');
      assert.strictEqual(loaded.price, 45000, 'price alias must be 45000');

      console.log('✓ TEST 2 PASS: Cache with valid pricing.basePrice (45000) remains consistent');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 2 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 3: writeLocalKioskConfig normalizes partial writes to disk ─────
    try {
      writeLocalKioskConfig({ price: 25000 });
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      assert.strictEqual(raw.price, 25000, 'Disk price must be 25000');
      assert.strictEqual(raw.pricing?.basePrice, 25000, 'Disk pricing.basePrice must be 25000');

      console.log('✓ TEST 3 PASS: writeLocalKioskConfig automatically writes normalized pricing to disk');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 3 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 4: Invalid price values (0, negative, string) safely fall back ─
    try {
      // 4a. Zero price
      fs.writeFileSync(configPath, JSON.stringify({ price: 0 }, null, 2), 'utf-8');
      let loaded = readLocalKioskConfig();
      assert.strictEqual(loaded.pricing?.basePrice, 35000, 'Price 0 must fall back to default 35000');
      assert.strictEqual(loaded.price, 35000, 'Price 0 alias must fall back to 35000');

      // 4b. Negative price
      fs.writeFileSync(configPath, JSON.stringify({ pricing: { basePrice: -1000 } }, null, 2), 'utf-8');
      loaded = readLocalKioskConfig();
      assert.strictEqual(loaded.pricing?.basePrice, 35000, 'Negative price must fall back to default 35000');
      assert.strictEqual(loaded.price, 35000, 'Negative price alias must fall back to 35000');

      // 4c. Non-numeric price
      fs.writeFileSync(configPath, JSON.stringify({ price: 'invalid' as any }, null, 2), 'utf-8');
      loaded = readLocalKioskConfig();
      assert.strictEqual(loaded.pricing?.basePrice, 35000, 'String price must fall back to default 35000');

      // 4d. Corrupt JSON
      fs.writeFileSync(configPath, '{ invalid json', 'utf-8');
      loaded = readLocalKioskConfig();
      assert.strictEqual(loaded.pricing?.basePrice, 35000, 'Corrupt JSON must safely fall back to 35000');

      console.log('✓ TEST 4 PASS: Invalid price values (0, negative, string, corrupt) fall back safely to 35000');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 4 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 5: Offline reconcile gracefully retains local configuration ────
    try {
      fs.writeFileSync(
        configPath,
        JSON.stringify({ configVersion: 2, price: 1000, pricing: { basePrice: 1000 } }, null, 2),
        'utf-8'
      );

      // Reconcile pointing to unreachable local port
      initSyncEngine({
        dataDir: testDir,
        syncIntervalMs: 30000,
        apiBaseUrl: 'http://127.0.0.1:4099', // Non-existent port
        deviceSecret: 'test-secret',
        boothId: 'test-booth-id',
      });

      const reconciled = await reconcileRemoteConfig(false);
      assert.strictEqual(reconciled.price, 1000, 'Offline reconcile must retain local price');
      assert.strictEqual(reconciled.pricing?.basePrice, 1000, 'Offline reconcile must retain basePrice');

      console.log('✓ TEST 5 PASS: Remote config failure (offline) retains valid local cached price');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 5 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 6: Remote config v14 reconciles and updates local cache ─────────
    let server: http.Server | null = null;
    try {
      // 1. Initial local cache with v1 and price 1000
      fs.writeFileSync(
        configPath,
        JSON.stringify({ configVersion: 1, price: 1000, pricing: { basePrice: 1000 } }, null, 2),
        'utf-8'
      );

      // 2. Start mock HTTP server
      const mockPort = await new Promise<number>((resolve) => {
        server = http.createServer((req, res) => {
          if (req.url === '/api/booths/test-booth-id/config') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              configVersion: 14,
              boothId: 'test-booth-id',
              pricing: { basePrice: 1001, currency: 'IDR', enableVoucher: true, enableQRIS: true },
              system: { themeColor: '#3b82f6', eventName: 'PILOT BOOTH #1', subText: 'TOUCH TO START' },
            }));
          } else {
            res.writeHead(404);
            res.end();
          }
        });
        server.listen(0, '127.0.0.1', () => {
          const address = server!.address() as any;
          resolve(address.port);
        });
      });

      initSyncEngine({
        dataDir: testDir,
        syncIntervalMs: 30000,
        apiBaseUrl: `http://127.0.0.1:${mockPort}`,
        deviceSecret: 'test-secret',
        boothId: 'test-booth-id',
      });

      const reconciled = await reconcileRemoteConfig(false);
      assert.strictEqual(reconciled.configVersion, 14, 'Config version must update to 14');
      assert.strictEqual(reconciled.pricing?.basePrice, 1001, 'pricing.basePrice must update to 1001');
      assert.strictEqual(reconciled.price, 1001, 'price alias must update to 1001');

      // Verify persisted on disk as well
      const diskConfig = readLocalKioskConfig();
      assert.strictEqual(diskConfig.configVersion, 14, 'Disk configVersion must be 14');
      assert.strictEqual(diskConfig.pricing?.basePrice, 1001, 'Disk pricing.basePrice must be 1001');
      assert.strictEqual(diskConfig.price, 1001, 'Disk price alias must be 1001');

      console.log('✓ TEST 6 PASS: Remote config v14 with pricing.basePrice: 1001 reconciles and updates local cache');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 6 FAIL:', err.message);
      failed++;
    } finally {
      if (server) {
        await new Promise((resolve) => (server as http.Server).close(resolve));
      }
    }

    // ─── TEST 7: Missing hardware configuration falls back to safe defaults ───
    try {
      fs.writeFileSync(configPath, JSON.stringify({ configVersion: 1 }, null, 2), 'utf-8');
      const loaded = readLocalKioskConfig();

      assert.strictEqual(loaded.hardware?.printerCalibration?.scale, 99, 'Default scale must be 99');
      assert.strictEqual(loaded.hardware?.printerCalibration?.offsetX, 0, 'Default offsetX must be 0');
      assert.strictEqual(loaded.hardware?.printerCalibration?.offsetY, 3, 'Default offsetY must be 3');
      assert.strictEqual(loaded.hardware?.printerNames?.strip2x6, null, 'Default strip2x6 queue must be null');
      assert.strictEqual(loaded.hardware?.printerNames?.photo4x6, null, 'Default photo4x6 queue must be null');

      console.log('✓ TEST 7 PASS: Missing hardware configuration falls back to safe defaults (99, 0, 3, null)');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 7 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 8: Cache with custom printerCalibration is preserved ──────────
    try {
      const customConfig = {
        configVersion: 2,
        hardware: {
          printerCalibration: { scale: 98, offsetX: 2, offsetY: -1 },
          printerNames: { strip2x6: 'DNP DS-RX1HS', photo4x6: 'DS-RX1 (Copy 2)' },
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(customConfig, null, 2), 'utf-8');
      const loaded = readLocalKioskConfig();

      assert.strictEqual(loaded.hardware?.printerCalibration?.scale, 98, 'Custom scale 98 preserved');
      assert.strictEqual(loaded.hardware?.printerCalibration?.offsetX, 2, 'Custom offsetX 2 preserved');
      assert.strictEqual(loaded.hardware?.printerCalibration?.offsetY, -1, 'Custom offsetY -1 preserved');
      assert.strictEqual(loaded.hardware?.printerNames?.strip2x6, 'DNP DS-RX1HS', 'Custom strip2x6 queue preserved');
      assert.strictEqual(loaded.hardware?.printerNames?.photo4x6, 'DS-RX1 (Copy 2)', 'Custom photo4x6 queue preserved');

      console.log('✓ TEST 8 PASS: Cache with custom printerCalibration and printerNames is preserved');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 8 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 9: Out-of-bounds calibration safely clamped ─────────────────────
    try {
      const oobConfig = {
        configVersion: 3,
        hardware: {
          printerCalibration: { scale: 120, offsetX: -50, offsetY: 40 },
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(oobConfig, null, 2), 'utf-8');
      const loaded = readLocalKioskConfig();

      assert.strictEqual(loaded.hardware?.printerCalibration?.scale, 105, 'OOB scale 120 clamped to 105');
      assert.strictEqual(loaded.hardware?.printerCalibration?.offsetX, -25, 'OOB offsetX -50 clamped to -25');
      assert.strictEqual(loaded.hardware?.printerCalibration?.offsetY, 25, 'OOB offsetY 40 clamped to 25');

      console.log('✓ TEST 9 PASS: Out-of-bounds calibration safely clamped to [85..105] and [-25..25]');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 9 FAIL:', err.message);
      failed++;
    }

    // ─── TEST 10: writeLocalKioskConfig persists calibration to disk ─────────
    try {
      writeLocalKioskConfig({
        hardware: {
          printerCalibration: { scale: 97, offsetX: -2, offsetY: 4 },
          printerNames: { photo4x6: 'EPSON L805' },
        },
      });
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      assert.strictEqual(raw.hardware?.printerCalibration?.scale, 97, 'Disk scale must be 97');
      assert.strictEqual(raw.hardware?.printerCalibration?.offsetX, -2, 'Disk offsetX must be -2');
      assert.strictEqual(raw.hardware?.printerCalibration?.offsetY, 4, 'Disk offsetY must be 4');
      assert.strictEqual(raw.hardware?.printerNames?.photo4x6, 'EPSON L805', 'Disk printer name preserved');

      console.log('✓ TEST 10 PASS: writeLocalKioskConfig atomically persists calibration and queue names to disk');
      passed++;
    } catch (err: any) {
      console.error('✗ TEST 10 FAIL:', err.message);
      failed++;
    }

  } finally {
    stopSyncEngine();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runConfigHydrationTests().catch((err) => {
  console.error('Unhandled Test Failure:', err);
  process.exit(1);
});
