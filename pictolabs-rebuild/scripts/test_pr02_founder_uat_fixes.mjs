/**
 * PICTOLABS PR-02 FOUNDER UAT FAILURES REGRESSION VERIFICATION SUITE
 * 
 * Verifies targeted fixes for:
 * Task A — Configuration Persistence across reload/restart/reconcile
 * Task B — Product-to-Print Format Routing (2R vs 4R)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

// Import SyncEngine and PrintQueue/PrintService modules
import {
  initSyncEngine,
  stopSyncEngine,
  readLocalKioskConfig,
  writeLocalKioskConfig,
  reconcileRemoteConfig,
  pushConfigToRemote,
  getDatabase,
} from '../apps/kiosk/electron/services/SyncEngine.ts';

import {
  resolvePrinterQueue,
  getDefaultPrinterName,
  setIsBypassMode,
  getIsBypassMode,
} from '../apps/kiosk/electron/services/PrintService.ts';

import {
  enqueuePrintJob,
  executePrintJob,
  reprintSession,
  getPrintJob,
  _setWorkerStateForTesting,
} from '../apps/kiosk/electron/services/PrintQueueService.ts';

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  PICTOLABS PR-02: FOUNDER UAT FAILURES REGRESSION SUITE');
console.log('══════════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'picto-pr02-uat-fix-'));
  const dataDirA = path.join(testRoot, 'booth-a');
  const dataDirB = path.join(testRoot, 'booth-b');
  fs.mkdirSync(dataDirA, { recursive: true });
  fs.mkdirSync(dataDirB, { recursive: true });

  // ─────────────────────────────────────────────────────────────────────────
  // TASK A: CONFIGURATION PERSISTENCE TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- TASK A: CONFIGURATION PERSISTENCE ACROSS RESTART ---');

  initSyncEngine({
    dataDir: dataDirA,
    apiBaseUrl: 'http://127.0.0.1:49999',
    boothId: 'booth-test-alpha',
    deviceSecret: 'secret-alpha',
    syncIntervalMs: 60000,
  });

  const customConfig = {
    configVersion: 2,
    hardware: {
      printerCalibration: {
        scale: 97,
        offsetX: 3,
        offsetY: -2,
      },
      printerNames: {
        strip2x6: 'DS-RX1 (Copy 1)',
        photo4x6: 'DS-RX1 (Copy 2)',
        photo6x8: null,
      },
    },
    pricing: {
      basePrice: 40000,
      currency: 'IDR',
      enableVoucher: true,
      enableQRIS: true,
    },
  };

  test('A1: Custom calibration and 2R/4R queue names written atomically to disk', () => {
    const saved = writeLocalKioskConfig(customConfig);
    assert.strictEqual(saved.hardware.printerCalibration.scale, 97);
    assert.strictEqual(saved.hardware.printerCalibration.offsetX, 3);
    assert.strictEqual(saved.hardware.printerCalibration.offsetY, -2);
    assert.strictEqual(saved.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)');
    assert.strictEqual(saved.hardware.printerNames.photo4x6, 'DS-RX1 (Copy 2)');

    const configPath = path.join(dataDirA, 'kiosk-config.json');
    assert.ok(fs.existsSync(configPath), 'kiosk-config.json exists on disk');
    const disk = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(disk.hardware.printerCalibration.scale, 97);
    assert.strictEqual(disk.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)');
    assert.strictEqual(disk.hardware.printerNames.photo4x6, 'DS-RX1 (Copy 2)');
  });

  test('A2: Offline restart hydrates exact custom configuration without defaulting', () => {
    const loaded = readLocalKioskConfig();
    assert.strictEqual(loaded.hardware.printerCalibration.scale, 97, 'Scale preserved across offline restart');
    assert.strictEqual(loaded.hardware.printerCalibration.offsetX, 3, 'OffsetX preserved across offline restart');
    assert.strictEqual(loaded.hardware.printerCalibration.offsetY, -2, 'OffsetY preserved across offline restart');
    assert.strictEqual(loaded.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)', '2R queue preserved across offline restart');
    assert.strictEqual(loaded.hardware.printerNames.photo4x6, 'DS-RX1 (Copy 2)', '4R queue preserved across offline restart');
  });

  await testAsync('A3: Online restart with older remote defaults (v1) NEVER overwrites local custom settings', async () => {
    // Spin up mock server returning v1 factory defaults (null queues and 99/0/3)
    let serverHitCount = 0;
    const server = http.createServer((req, res) => {
      serverHitCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        configVersion: 1, // older than local v2
        hardware: {
          printerCalibration: { scale: 99, offsetX: 0, offsetY: 3 },
          printerNames: { strip2x6: null, photo4x6: null, photo6x8: null },
        },
        pricing: { basePrice: 35000 },
      }));
    });

    await new Promise((resolve) => server.listen(49999, '127.0.0.1', resolve));

    try {
      // Trigger reconcile (simulating app boot)
      const reconciled = await reconcileRemoteConfig(true);
      assert.strictEqual(reconciled.hardware.printerCalibration.scale, 97, 'Scale remains 97 (not overwritten by v1 default 99)');
      assert.strictEqual(reconciled.hardware.printerCalibration.offsetX, 3, 'OffsetX remains 3 (not overwritten by v1 default 0)');
      assert.strictEqual(reconciled.hardware.printerCalibration.offsetY, -2, 'OffsetY remains -2 (not overwritten by v1 default 3)');
      assert.strictEqual(reconciled.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)', '2R queue remains DS-RX1 (Copy 1) (not overwritten by null)');
      assert.strictEqual(reconciled.hardware.printerNames.photo4x6, 'DS-RX1 (Copy 2)', '4R queue remains DS-RX1 (Copy 2) (not overwritten by null)');

      // Verify disk was NOT overwritten with default values
      const diskAfter = readLocalKioskConfig();
      assert.strictEqual(diskAfter.hardware.printerCalibration.scale, 97);
      assert.strictEqual(diskAfter.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)');
      assert.strictEqual(diskAfter.hardware.printerNames.photo4x6, 'DS-RX1 (Copy 2)');
    } finally {
      server.close();
    }
  });

  await testAsync('A4: Cloud push transmits calibration and printer names to backend PUT /api/booths/:id/config', async () => {
    let receivedPayload = null;
    let receivedHeaderSecret = null;

    const pushServer = http.createServer((req, res) => {
      receivedHeaderSecret = req.headers['x-device-secret'];
      let body = '';
      req.on('data', (d) => { body += d; });
      req.on('end', () => {
        receivedPayload = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, configVersion: 3 }));
      });
    });

    await new Promise((resolve) => pushServer.listen(49998, '127.0.0.1', resolve));

    try {
      const pushRes = await pushConfigToRemote('http://127.0.0.1:49998', 'booth-test-alpha', 'secret-alpha', customConfig);
      assert.strictEqual(pushRes.configVersion, 3, 'Backend accepted push and returned incremented version');
      assert.strictEqual(receivedHeaderSecret, 'secret-alpha', 'Device secret sent in header');
      assert.strictEqual(receivedPayload.hardware.printerCalibration.scale, 97);
      assert.strictEqual(receivedPayload.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)');
      assert.strictEqual(receivedPayload.hardware.printerNames.photo4x6, 'DS-RX1 (Copy 2)');
    } finally {
      pushServer.close();
    }
  });

  test('A5: Multi-booth isolation: Booth A config does not leak into Booth B', () => {
    // Initialize Booth B with separate directory
    stopSyncEngine();
    initSyncEngine({
      dataDir: dataDirB,
      apiBaseUrl: 'http://127.0.0.1:49999',
      boothId: 'booth-test-beta',
      deviceSecret: 'secret-beta',
      syncIntervalMs: 60000,
    });

    const boothBConfig = readLocalKioskConfig();
    assert.strictEqual(boothBConfig.hardware.printerCalibration.scale, 99, 'Booth B starts at factory default scale 99');
    assert.strictEqual(boothBConfig.hardware.printerNames.strip2x6, null, 'Booth B queue 2R is null (isolated from Booth A)');
    assert.strictEqual(boothBConfig.hardware.printerNames.photo4x6, null, 'Booth B queue 4R is null (isolated from Booth A)');
  });

  // Switch back to Booth A for Task B
  stopSyncEngine();
  initSyncEngine({
    dataDir: dataDirA,
    apiBaseUrl: 'http://127.0.0.1:49999',
    boothId: 'booth-test-alpha',
    deviceSecret: 'secret-alpha',
    syncIntervalMs: 60000,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TASK B: PRODUCT-TO-PRINT FORMAT ROUTING TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- TASK B: PRODUCT-TO-PRINT FORMAT ROUTING ---');

  const dummyFile = path.join(dataDirA, 'test_render.jpg');
  fs.writeFileSync(dummyFile, 'DUMMY_PRINT_DATA');

  const db = getDatabase();

  function seedSession(id, frameId = '2R') {
    db.prepare(`
      INSERT OR REPLACE INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status)
      VALUES (?, datetime('now'), ?, 'none', '[]', ?, 'pending')
    `).run(id, frameId, dummyFile);
  }

  test('B1: Enqueueing 2R product explicitly stores format = "2R" in SQLite queue', () => {
    seedSession('session_2r_test', '2R');
    const enq = enqueuePrintJob('session_2r_test', dummyFile, 1, undefined, '2R');
    assert.strictEqual(enq.success, true);
    assert.ok(enq.id);

    const row = db.prepare('SELECT format, printer_name, status FROM print_queue WHERE id = ?').get(enq.id);
    assert.strictEqual(row.format, '2R', 'Queue row stored format as 2R');
    assert.strictEqual(row.status, 'PENDING');
  });

  test('B2: Enqueueing 4R product explicitly stores format = "4R" in SQLite queue', () => {
    seedSession('session_4r_test', '4R');
    const enq = enqueuePrintJob('session_4r_test', dummyFile, 1, undefined, '4R');
    assert.strictEqual(enq.success, true);
    assert.ok(enq.id);

    const row = db.prepare('SELECT format, printer_name, status FROM print_queue WHERE id = ?').get(enq.id);
    assert.strictEqual(row.format, '4R', 'Queue row stored format as 4R');
    assert.strictEqual(row.status, 'PENDING');
  });

  test('B3: Implicit enqueue resolves format from sessions table (frame_id "2R")', () => {
    seedSession('session_implicit_2r', '2R');

    const enq = enqueuePrintJob('session_implicit_2r', dummyFile, 1);
    assert.strictEqual(enq.success, true);

    const row = db.prepare('SELECT format FROM print_queue WHERE id = ?').get(enq.id);
    assert.strictEqual(row.format, '2R', 'Resolved format 2R from sessions table');
  });

  await testAsync('B4: 2R product routes strictly to configured 2R queue ("DS-RX1 (Copy 1)")', async () => {
    const installed = ['DS-RX1 (Copy 1)', 'DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const res = await resolvePrinterQueue(null, '2R', installed);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.printerName, 'DS-RX1 (Copy 1)', 'Resolved 2R queue to configured strip2x6 mapping');
  });

  await testAsync('B5: 4R product routes strictly to configured 4R queue ("DS-RX1 (Copy 2)")', async () => {
    const installed = ['DS-RX1 (Copy 1)', 'DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const res = await resolvePrinterQueue(null, '4R', installed);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.printerName, 'DS-RX1 (Copy 2)', 'Resolved 4R queue to configured photo4x6 mapping');
  });

  await testAsync('B6: Unconfigured 2R queue fails fast with actionable error (NO silent default fallback)', async () => {
    // Clear 2R queue in config temporarily
    const configWithout2R = {
      ...customConfig,
      hardware: {
        ...customConfig.hardware,
        printerNames: {
          strip2x6: null,
          photo4x6: 'DS-RX1 (Copy 2)',
          photo6x8: null,
        },
      },
    };
    writeLocalKioskConfig(configWithout2R);

    const installed = ['DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const res = await resolvePrinterQueue(null, '2R', installed);
    assert.strictEqual(res.success, false, 'Must reject 2R resolution when 2R queue is unconfigured');
    assert.ok(res.error.includes('strip 2x6') && res.error.includes('belum dikonfigurasi'), 'Clear actionable error');

    // Restore configuration
    writeLocalKioskConfig(customConfig);
  });

  await testAsync('B7: Missing Windows printer for configured 2R queue fails fast with clear error', async () => {
    // Installed printers does not contain 'DS-RX1 (Copy 1)'
    const installed = ['DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const res = await resolvePrinterQueue(null, '2R', installed);
    assert.strictEqual(res.success, false, 'Must reject when configured 2R queue is missing from Windows');
    assert.ok(res.error.includes('DS-RX1 (Copy 1)') && res.error.includes('tidak ditemukan'), 'Actionable error naming missing queue');
  });

  await testAsync('B8: Manual reprint of 2R session preserves format = "2R" and creates distinct job', async () => {
    seedSession('session_reprint_2r', '2R');

    const reprintRes = await reprintSession('session_reprint_2r', 1);
    assert.strictEqual(reprintRes.success, true);
    assert.ok(reprintRes.id);

    const reprintJob = db.prepare('SELECT format, status FROM print_queue WHERE id = ?').get(reprintRes.id);
    assert.strictEqual(reprintJob.format, '2R', 'Reprint job correctly preserves 2R format');
    assert.strictEqual(reprintJob.status, 'PENDING', 'Reprint job enters PENDING');
  });

  test('B9: Idempotency & deduplication: Duplicate 2R enqueue returns existing job without double printing', () => {
    seedSession('session_dedup_test', '2R');

    const enq1 = enqueuePrintJob('session_dedup_test', dummyFile, 1, undefined, '2R');
    assert.strictEqual(enq1.success, true);
    assert.strictEqual(enq1.isDuplicate, false);

    const enq2 = enqueuePrintJob('session_dedup_test', dummyFile, 1, undefined, '2R');
    assert.strictEqual(enq2.success, true);
    assert.strictEqual(enq2.isDuplicate, true, 'Prevented duplicate 2R job enqueue');
    assert.strictEqual(enq2.id, enq1.id, 'Returned same job ID');
  });

  stopSyncEngine();

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
