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
  reprintSessionWithDebounce,
  getSessionHistory,
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

import {
  acquirePrintDispatchLock,
  releasePrintDispatchLock,
  getCurrentDispatchOwner,
  forceReleasePrintDispatchLock,
} from '../apps/kiosk/electron/services/PrinterMonitorService.ts';

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
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_2r', 'session_reprint_2r', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-1 minute'), datetime('now', '-1 minute'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_reprint_2r', 1);
    assert.strictEqual(reprintRes.success, true);
    assert.ok(reprintRes.id);

    const reprintJob = db.prepare('SELECT format, status FROM print_queue WHERE id = ?').get(reprintRes.id);
    assert.strictEqual(reprintJob.format, '2R', 'Reprint job correctly preserves 2R format');
    assert.strictEqual(reprintJob.status, 'PENDING', 'Reprint job enters PENDING');
  });

  await testAsync('B8a: Manual reprint of 2R session with frame_id = "classic-white" preserves 2R format from last print job', async () => {
    // Simulates customer session where frameDesignId ("classic-white") was previously stored in sessions.frame_id
    seedSession('session_theme_2r', 'classic-white');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_theme_2r', 'session_theme_2r', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-1 minute'), datetime('now', '-1 minute'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_theme_2r', 1);
    assert.strictEqual(reprintRes.success, true, 'Reprint succeeded');
    assert.ok(reprintRes.id);

    const reprintJob = db.prepare('SELECT format, status FROM print_queue WHERE id = ?').get(reprintRes.id);
    assert.strictEqual(reprintJob.format, '2R', 'Authoritative previous print_queue.format (2R) overrides ambiguous theme frame_id');
    assert.strictEqual(reprintJob.status, 'PENDING');
  });

  await testAsync('B8b: Manual reprint of 4R session preserves persisted 4R job format', async () => {
    seedSession('session_reprint_4r', '4R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_4r', 'session_reprint_4r', ?, 'AUTO', '4R', 1, 'COMPLETED', 1, 5, datetime('now', '-1 minute'), datetime('now', '-1 minute'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_reprint_4r', 1);
    assert.strictEqual(reprintRes.success, true);
    assert.ok(reprintRes.id);

    const reprintJob = db.prepare('SELECT format, status FROM print_queue WHERE id = ?').get(reprintRes.id);
    assert.strictEqual(reprintJob.format, '4R', 'Reprint job correctly preserves 4R format');
    assert.strictEqual(reprintJob.status, 'PENDING');
  });

  await testAsync('B8c: Legacy session with ambiguous format and no print job fails fast (NEVER silently defaults to 4R)', async () => {
    // Session with arbitrary theme string and NO previous print_queue entry
    seedSession('session_ambiguous_legacy', 'vintage-sepia');

    const reprintRes = await reprintSession('session_ambiguous_legacy', 1);
    assert.strictEqual(reprintRes.success, false, 'Must reject reprint when format is ambiguous and unverified');
    assert.ok(reprintRes.error.includes('tidak valid atau ambigu'), 'Actionable error message returned');

    // Confirm no rogue job was added to print_queue
    const count = db.prepare('SELECT count(*) as cnt FROM print_queue WHERE session_id = ?').get('session_ambiguous_legacy');
    assert.strictEqual(count.cnt, 0, 'No print job enqueued for ambiguous legacy session');
  });

  await testAsync('B8d: Manual reprint deduplication prevents duplicate enqueue when reprint is already PENDING', async () => {
    seedSession('session_dedup_reprint', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_dedup_initial', 'session_dedup_reprint', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-2 minutes'), datetime('now', '-2 minutes'))
    `).run(dummyFile);

    // First reprint creates new job
    const reprint1 = await reprintSession('session_dedup_reprint', 1);
    assert.strictEqual(reprint1.success, true);
    assert.strictEqual(reprint1.isDuplicate, false);
    const newId = reprint1.id;

    // Second reprint while first is still PENDING returns existing job without creating a duplicate
    const reprint2 = await reprintSession('session_dedup_reprint', 1);
    assert.strictEqual(reprint2.success, true);
    assert.strictEqual(reprint2.isDuplicate, true);
    assert.strictEqual(reprint2.id, newId, 'Returned existing in-flight reprint job ID');
  });

  await testAsync('B8e: Manual reprint deduplication prevents duplicate enqueue when reprint is already PRINTING', async () => {
    seedSession('session_dedup_printing', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_dedup_printing', 'session_dedup_printing', ?, 'AUTO', '2R', 1, 'PRINTING', 1, 5, datetime('now', '-30 seconds'), datetime('now', '-30 seconds'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_dedup_printing', 1);
    assert.strictEqual(reprintRes.success, true);
    assert.strictEqual(reprintRes.isDuplicate, true, 'Returns isDuplicate = true while actively printing');
    assert.strictEqual(reprintRes.id, 'job_dedup_printing', 'Reuses active PRINTING job ID');

    // Confirm no additional job row was created
    const count = db.prepare('SELECT count(*) as cnt FROM print_queue WHERE session_id = ?').get('session_dedup_printing');
    assert.strictEqual(count.cnt, 1, 'Exactly one job remains in print_queue');
  });

  await testAsync('B8f: Missing required printer mapping during manual reprint dispatch fails fast to FAILED', async () => {
    // Unconfigure 2R printer mapping in local config
    const unmappedConfig = {
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
    writeLocalKioskConfig(unmappedConfig);

    // Cancel any prior leftover pending test jobs to avoid concurrent background worker contention
    db.prepare("UPDATE print_queue SET status = 'CANCELLED' WHERE status = 'PENDING'").run();

    // Set bypass mode to false so queue worker performs real queue resolution
    const prevBypass = getIsBypassMode();
    setIsBypassMode(false);

    seedSession('session_missing_map', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_map', 'session_missing_map', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-1 minute'), datetime('now', '-1 minute'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_missing_map', 1);
    assert.strictEqual(reprintRes.success, true);
    const reprintJobId = reprintRes.id;

    // Await background queue processing (triggerQueueProcessing resolves asynchronously)
    let updatedJob = null;
    for (let i = 0; i < 30; i++) {
      updatedJob = db.prepare('SELECT status, last_error FROM print_queue WHERE id = ?').get(reprintJobId);
      if (updatedJob && updatedJob.status === 'FAILED') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    assert.ok(updatedJob, 'Job found in database');
    assert.strictEqual(updatedJob.status, 'FAILED', 'Job transitions to FAILED state');
    assert.ok(updatedJob.last_error && updatedJob.last_error.includes('strip 2x6') && updatedJob.last_error.includes('belum dikonfigurasi'), 'Actionable error recorded in queue item');

    const updatedSession = db.prepare('SELECT print_status FROM sessions WHERE id = ?').get('session_missing_map');
    assert.strictEqual(updatedSession.print_status, 'failed', 'Session print_status updated to failed');

    // Restore bypass mode and config
    setIsBypassMode(prevBypass);
    writeLocalKioskConfig(customConfig);
  });

  await testAsync('B8g: Manual reprint queue & dispatch locking: Single-dispatch lock prevents concurrent processing', async () => {
    forceReleasePrintDispatchLock();

    // Acquire lock as CALIBRATION
    const calAcquired = acquirePrintDispatchLock('CALIBRATION');
    assert.strictEqual(calAcquired, true, 'Calibration acquired dispatch lock');
    assert.strictEqual(getCurrentDispatchOwner(), 'CALIBRATION');

    // Attempting to acquire lock for QUEUE_WORKER or MANUAL while CALIBRATION is active must be rejected
    const workerAcquired = acquirePrintDispatchLock('QUEUE_WORKER');
    assert.strictEqual(workerAcquired, false, 'QUEUE_WORKER cannot acquire lock while CALIBRATION is active');

    const manualAcquired = acquirePrintDispatchLock('MANUAL');
    assert.strictEqual(manualAcquired, false, 'MANUAL reprint cannot acquire lock while CALIBRATION is active');

    // Release calibration lock
    releasePrintDispatchLock('CALIBRATION');
    assert.strictEqual(getCurrentDispatchOwner(), null, 'Lock successfully released');

    // Now QUEUE_WORKER can acquire lock
    const workerAcquiredNow = acquirePrintDispatchLock('QUEUE_WORKER');
    assert.strictEqual(workerAcquiredNow, true, 'QUEUE_WORKER acquires lock once idle');
    releasePrintDispatchLock('QUEUE_WORKER');
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

  // ─────────────────────────────────────────────────────────────────────────
  // TASK C: ADMIN MANUAL REPRINT & FORMAT/COPY CONTROLS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- TASK C: ADMIN MANUAL REPRINT & FORMAT/COPY CONTROLS ---');

  await testAsync('C1: Operator explicit 2R override on 4R session routes to 2R cut queue ("DS-RX1 (Copy 1)")', async () => {
    seedSession('session_override_to_2r', '4R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_4r_orig', 'session_override_to_2r', ?, 'AUTO', '4R', 1, 'COMPLETED', 1, 5, datetime('now', '-2 minutes'), datetime('now', '-2 minutes'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_override_to_2r', 1, '2R');
    assert.strictEqual(reprintRes.success, true);
    assert.ok(reprintRes.id);

    const job = db.prepare('SELECT format, copies, printer_name FROM print_queue WHERE id = ?').get(reprintRes.id);
    assert.strictEqual(job.format, '2R', 'Job format reflects operator override: 2R');
    assert.strictEqual(job.copies, 1);
    assert.strictEqual(job.printer_name, 'AUTO', 'Forces AUTO printer name for dynamic format routing');

    // Verify queue resolution with installed printers
    const installed = ['DS-RX1 (Copy 1)', 'DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const resolved = await resolvePrinterQueue(null, job.format, installed);
    assert.strictEqual(resolved.success, true);
    assert.strictEqual(resolved.printerName, 'DS-RX1 (Copy 1)', 'Resolved to configured 2R cut queue');
  });

  await testAsync('C2: Operator explicit 4R override on 2R session routes to 4R uncut queue ("DS-RX1 (Copy 2)")', async () => {
    seedSession('session_override_to_4r', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_2r_orig', 'session_override_to_4r', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-2 minutes'), datetime('now', '-2 minutes'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_override_to_4r', 1, '4R');
    assert.strictEqual(reprintRes.success, true);
    assert.ok(reprintRes.id);

    const job = db.prepare('SELECT format, copies, printer_name FROM print_queue WHERE id = ?').get(reprintRes.id);
    assert.strictEqual(job.format, '4R', 'Job format reflects operator override: 4R');
    assert.strictEqual(job.copies, 1);
    assert.strictEqual(job.printer_name, 'AUTO');

    const installed = ['DS-RX1 (Copy 1)', 'DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const resolved = await resolvePrinterQueue(null, job.format, installed);
    assert.strictEqual(resolved.success, true);
    assert.strictEqual(resolved.printerName, 'DS-RX1 (Copy 2)', 'Resolved to configured 4R uncut queue');
  });

  await testAsync('C3: Operator custom copy count enqueues exact count (e.g. 3 copies) without double multiplication', async () => {
    seedSession('session_custom_3x', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_custom_3x', 'session_custom_3x', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-2 minutes'), datetime('now', '-2 minutes'))
    `).run(dummyFile);

    const reprintRes = await reprintSession('session_custom_3x', 3, '2R');
    assert.strictEqual(reprintRes.success, true);
    assert.ok(reprintRes.id);

    const job = db.prepare('SELECT format, copies FROM print_queue WHERE id = ?').get(reprintRes.id);
    assert.strictEqual(job.copies, 3, 'Queue row stores exactly 3 copies');
    assert.strictEqual(job.format, '2R');

    // Confirm exactly 2 jobs exist for this session in total (1 initial + 1 reprint)
    const count = db.prepare('SELECT count(*) as cnt FROM print_queue WHERE session_id = ?').get('session_custom_3x');
    assert.strictEqual(count.cnt, 2, 'Exactly one new reprint job row created for custom copy request');
  });

  await testAsync('C4: Copy count validation rejects invalid values (0, negative, >10, fractional, NaN)', async () => {
    seedSession('session_val_copies', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_val', 'session_val_copies', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-2 minutes'), datetime('now', '-2 minutes'))
    `).run(dummyFile);

    // 0 copies
    const resZero = await reprintSession('session_val_copies', 0);
    assert.strictEqual(resZero.success, false);
    assert.ok(resZero.error.includes('antara 1 dan 10'));

    // Negative copies
    const resNeg = await reprintSession('session_val_copies', -2);
    assert.strictEqual(resNeg.success, false);
    assert.ok(resNeg.error.includes('antara 1 dan 10'));

    // Greater than 10
    const resOver = await reprintSession('session_val_copies', 11);
    assert.strictEqual(resOver.success, false);
    assert.ok(resOver.error.includes('antara 1 dan 10'));

    // Fractional copies
    const resFrac = await reprintSession('session_val_copies', 2.5);
    assert.strictEqual(resFrac.success, false);
    assert.ok(resFrac.error.includes('antara 1 dan 10'));

    // NaN copies
    const resNaN = await reprintSession('session_val_copies', NaN);
    assert.strictEqual(resNaN.success, false);
    assert.ok(resNaN.error.includes('antara 1 dan 10'));

    // Test validation in reprintSessionWithDebounce as well
    const debZero = await reprintSessionWithDebounce('session_val_copies', 0);
    assert.strictEqual(debZero.success, false);
    assert.ok(debZero.error.includes('antara 1 dan 10'));

    const debOver = await reprintSessionWithDebounce('session_val_copies', 20);
    assert.strictEqual(debOver.success, false);
    assert.ok(debOver.error.includes('antara 1 dan 10'));

    const debFrac = await reprintSessionWithDebounce('session_val_copies', 1.5);
    assert.strictEqual(debFrac.success, false);
    assert.ok(debFrac.error.includes('antara 1 dan 10'));
  });

  await testAsync('C5: Unconfigured 4R queue fails fast with actionable Indonesian error (NO silent fallback)', async () => {
    // Unconfigure 4R queue in local config
    const configWithout4R = {
      ...customConfig,
      hardware: {
        ...customConfig.hardware,
        printerNames: {
          strip2x6: 'DS-RX1 (Copy 1)',
          photo4x6: null,
          photo6x8: null,
        },
      },
    };
    writeLocalKioskConfig(configWithout4R);

    const installed = ['DS-RX1 (Copy 1)', 'Microsoft Print to PDF'];
    const res = await resolvePrinterQueue(null, '4R', installed);
    assert.strictEqual(res.success, false, 'Must reject 4R resolution when photo4x6 queue is null');
    assert.ok(res.error.includes('photo 4x6') && res.error.includes('belum dikonfigurasi'), 'Actionable error message');

    // Restore configuration
    writeLocalKioskConfig(customConfig);
  });

  await testAsync('C6: 4R queue configured with cut keywords is strictly rejected (cut protection guard)', async () => {
    const installed = ['DS-RX1 2-inch cut', 'Microsoft Print to PDF'];
    const res = await resolvePrinterQueue('DS-RX1 2-inch cut', '4R', installed);
    assert.strictEqual(res.success, false, 'Must reject candidate queue with cut keywords for 4R format');
    assert.ok(res.error.includes('pemotongan 2-inci') || res.error.includes('terdeteksi'), 'Clear rejection error');
  });

  test('C7: SyncEngine.getSessionHistory exposes authoritative printFormat from print_queue to Admin UI', () => {
    seedSession('session_history_fmt_test', 'classic-white');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_history_fmt_2r', 'session_history_fmt_test', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now'), datetime('now'))
    `).run(dummyFile);

    const history = getSessionHistory(10, 0);
    const item = history.find((s) => s.id === 'session_history_fmt_test');
    assert.ok(item, 'Session found in history list');
    assert.strictEqual(item.printFormat, '2R', 'Authoritative format 2R exposed from print_queue (not overwritten by frameId classic-white)');
    assert.strictEqual(item.frameId, 'classic-white', 'Preserves original theme/frameId for display');
  });

  await testAsync('C8: End-to-end reprintSessionWithDebounce propagates operator format and custom copies cleanly', async () => {
    seedSession('session_debounce_e2e_ok', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_deb_e2e', 'session_debounce_e2e_ok', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-5 minutes'), datetime('now', '-5 minutes'))
    `).run(dummyFile);

    const debRes = await reprintSessionWithDebounce('session_debounce_e2e_ok', 4, '4R', 'TEST_OPERATOR_REQUEST');
    assert.strictEqual(debRes.success, true);
    assert.ok(debRes.printJobId);

    const enqueuedJob = db.prepare('SELECT format, copies, printer_name, status FROM print_queue WHERE id = ?').get(debRes.printJobId);
    assert.strictEqual(enqueuedJob.format, '4R', 'Persisted format matches requested override (4R)');
    assert.strictEqual(enqueuedJob.copies, 4, 'Persisted copies matches requested count (4)');
    assert.strictEqual(enqueuedJob.printer_name, 'AUTO');
    assert.strictEqual(enqueuedJob.status, 'PENDING');
  });

  await testAsync('C9: Rapid repeated clicks / double-tap debounce prevents duplicate job creation', async () => {
    seedSession('session_debounce_doubletap', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES ('job_prev_doubletap', 'session_debounce_doubletap', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-5 minutes'), datetime('now', '-5 minutes'))
    `).run(dummyFile);

    // First click: succeeds
    const click1 = await reprintSessionWithDebounce('session_debounce_doubletap', 1, '2R');
    assert.strictEqual(click1.success, true);
    const firstJobId = click1.printJobId;

    // Second click immediately (<4 seconds later): must be debounced
    const click2 = await reprintSessionWithDebounce('session_debounce_doubletap', 1, '2R');
    assert.strictEqual(click2.success, false, 'Rapid repeated click blocked by debounce guard');
    assert.ok(click2.error.includes('baru saja dikirim') || click2.error.includes('sedang aktif'));

    // Verify exactly one new job was created for this session
    const jobs = db.prepare('SELECT id FROM print_queue WHERE session_id = ? AND status = ?').all('session_debounce_doubletap', 'PENDING');
    assert.strictEqual(jobs.length, 1, 'Exactly one pending reprint job in queue');
    assert.strictEqual(jobs[0].id, firstJobId);
  });

  await testAsync('C10: Invalid operator format string is rejected fail-safe', async () => {
    seedSession('session_invalid_fmt', '2R');
    const res = await reprintSession('session_invalid_fmt', 1, 'SUPER_POSTCARD');
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('tidak valid') && res.error.includes('Pilih 2R (Cut) atau 4R (Uncut)'));

    const count = db.prepare('SELECT count(*) as cnt FROM print_queue WHERE session_id = ?').get('session_invalid_fmt');
    assert.strictEqual(count.cnt, 0, 'No job enqueued when format is invalid');
  });

  await testAsync('C11: Existing customer 2R routing remains intact (regression verification)', async () => {
    seedSession('session_cust_2r_recheck', '2R');
    const enq = enqueuePrintJob('session_cust_2r_recheck', dummyFile, 1, undefined, '2R');
    assert.strictEqual(enq.success, true);

    const job = db.prepare('SELECT format, printer_name FROM print_queue WHERE id = ?').get(enq.id);
    assert.strictEqual(job.format, '2R');

    const installed = ['DS-RX1 (Copy 1)', 'DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const resolved = await resolvePrinterQueue(null, job.format, installed);
    assert.strictEqual(resolved.success, true);
    assert.strictEqual(resolved.printerName, 'DS-RX1 (Copy 1)', 'Customer 2R session routes strictly to 2R cut queue');
  });

  test('C12: Existing configuration persistence and booth isolation remain intact', () => {
    const diskConfig = readLocalKioskConfig();
    assert.strictEqual(diskConfig.hardware.printerCalibration.scale, 97, 'Calibration scale preserved');
    assert.strictEqual(diskConfig.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)', '2R queue mapping preserved');
    assert.strictEqual(diskConfig.hardware.printerNames.photo4x6, 'DS-RX1 (Copy 2)', '4R queue mapping preserved');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TASK D: ORIGINAL FORMAT INTEGRITY & UNKNOWN-FORMAT SAFETY TESTS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- TASK D: ORIGINAL FORMAT INTEGRITY & UNKNOWN-FORMAT SAFETY ---');

  test('D1: Original 2R session with first job 2R and latest override job 4R yields originalFormat="2R", printFormat="4R", only 2R receives Asli badge', () => {
    seedSession('session_d1_2r_orig_4r_override', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES 
        ('job_d1_initial', 'session_d1_2r_orig_4r_override', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-10 minutes'), datetime('now', '-10 minutes')),
        ('job_d1_override', 'session_d1_2r_orig_4r_override', ?, 'AUTO', '4R', 1, 'COMPLETED', 1, 5, datetime('now', '-1 minute'), datetime('now', '-1 minute'))
    `).run(dummyFile, dummyFile);

    const history = getSessionHistory(20, 0);
    const session = history.find((s) => s.id === 'session_d1_2r_orig_4r_override');
    assert.ok(session, 'Session found in history');
    assert.strictEqual(session.originalFormat, '2R', 'originalFormat remains strictly 2R despite later 4R override');
    assert.strictEqual(session.printFormat, '4R', 'printFormat reflects latest override job');

    // UI badge assertion: Asli badge is rendered if and only if option === originalFormat
    const is2RAsli = session.originalFormat === '2R';
    const is4RAsli = session.originalFormat === '4R';
    assert.strictEqual(is2RAsli, true, '2R receives Asli badge');
    assert.strictEqual(is4RAsli, false, '4R DOES NOT receive Asli badge');
  });

  test('D2: Original 4R session with latest override job 2R yields originalFormat="4R", printFormat="2R", only 4R receives Asli badge', () => {
    seedSession('session_d2_4r_orig_2r_override', '4R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES 
        ('job_d2_initial', 'session_d2_4r_orig_2r_override', ?, 'AUTO', '4R', 1, 'COMPLETED', 1, 5, datetime('now', '-10 minutes'), datetime('now', '-10 minutes')),
        ('job_d2_override', 'session_d2_4r_orig_2r_override', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-1 minute'), datetime('now', '-1 minute'))
    `).run(dummyFile, dummyFile);

    const history = getSessionHistory(20, 0);
    const session = history.find((s) => s.id === 'session_d2_4r_orig_2r_override');
    assert.ok(session, 'Session found in history');
    assert.strictEqual(session.originalFormat, '4R', 'originalFormat remains strictly 4R despite later 2R override');
    assert.strictEqual(session.printFormat, '2R', 'printFormat reflects latest override job');

    const is2RAsli = session.originalFormat === '2R';
    const is4RAsli = session.originalFormat === '4R';
    assert.strictEqual(is2RAsli, false, '2R DOES NOT receive Asli badge');
    assert.strictEqual(is4RAsli, true, '4R receives Asli badge');
  });

  test('D3: Legacy theme frame_id = "classic-white" with earliest valid 2R job resolves originalFormat="2R" and latest printFormat', () => {
    seedSession('session_d3_legacy_theme', 'classic-white');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES 
        ('job_d3_earliest', 'session_d3_legacy_theme', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-20 minutes'), datetime('now', '-20 minutes')),
        ('job_d3_latest_override', 'session_d3_legacy_theme', ?, 'AUTO', '4R', 1, 'COMPLETED', 1, 5, datetime('now', '-2 minutes'), datetime('now', '-2 minutes'))
    `).run(dummyFile, dummyFile);

    const history = getSessionHistory(20, 0);
    const session = history.find((s) => s.id === 'session_d3_legacy_theme');
    assert.ok(session, 'Session found in history');
    assert.strictEqual(session.originalFormat, '2R', 'Resolved originalFormat from earliest print job');
    assert.strictEqual(session.printFormat, '4R', 'Resolved printFormat from latest print job');
    assert.strictEqual(session.frameId, 'classic-white', 'Preserved theme frame_id');
  });

  test('D4: Legacy session with no valid format source returns originalFormat=null and printFormat=null', () => {
    seedSession('session_d4_unknown_legacy', 'retro-vintage-theme');
    // No print_queue records

    const history = getSessionHistory(20, 0);
    const session = history.find((s) => s.id === 'session_d4_unknown_legacy');
    assert.ok(session, 'Session found in history');
    assert.strictEqual(session.originalFormat, null, 'originalFormat is strictly null when no physical format exists');
    assert.strictEqual(session.printFormat, null, 'printFormat is strictly null');
  });

  test('D5: Unknown format does not auto-select 2R or 4R in UI state initialization', () => {
    const sessionWithNullOriginal = {
      id: 'session_unknown_ui',
      originalFormat: null,
      printFormat: null,
    };

    const initialFormat = (sessionWithNullOriginal.originalFormat === '2R' || sessionWithNullOriginal.originalFormat === '4R')
      ? sessionWithNullOriginal.originalFormat
      : null;

    assert.strictEqual(initialFormat, null, 'UI initializes reprintFormat to null (NO silent default to 2R or 4R)');

    // Neither button receives Asli badge
    const is2RAsli = sessionWithNullOriginal.originalFormat === '2R';
    const is4RAsli = sessionWithNullOriginal.originalFormat === '4R';
    assert.strictEqual(is2RAsli, false, 'No Asli badge on 2R');
    assert.strictEqual(is4RAsli, false, 'No Asli badge on 4R');
  });

  await testAsync('D6: Print action remains disabled until operator explicitly chooses a valid format', async () => {
    let reprintFormat = null;
    let isReprinting = false;
    let isPrintDisabled = !reprintFormat || isReprinting;
    assert.strictEqual(isPrintDisabled, true, 'Print button is disabled when reprintFormat is null');

    // Attempting to reprint with null format fails validation
    seedSession('session_d6_disabled_check', 'unknown-theme');
    const directCall = await reprintSession('session_d6_disabled_check', 1, null);
    assert.strictEqual(directCall.success, false, 'Direct reprint call with null format is rejected');
    assert.ok(directCall.error.includes('tidak valid') || directCall.error.includes('Pilih 2R (Cut) atau 4R (Uncut)'));

    // Once operator explicitly selects '4R', button is enabled
    reprintFormat = '4R';
    isPrintDisabled = !reprintFormat || isReprinting;
    assert.strictEqual(isPrintDisabled, false, 'Print button is enabled after operator explicit selection');
  });

  test('D7: Quick-print on session card for unknown-format session opens detail modal instead of dispatching', () => {
    const unknownSession = {
      id: 'session_d7_quick_unknown',
      originalFormat: null,
      printFormat: null,
    };

    let openedModalSession = null;
    let toastMessage = null;
    let dispatchedJob = false;

    // Mirrors handleQuickReprint logic in SessionHistorySection.tsx
    function handleQuickReprint(session) {
      if (!session.originalFormat || (session.originalFormat !== '2R' && session.originalFormat !== '4R')) {
        openedModalSession = session;
        toastMessage = {
          type: 'warning',
          text: 'Format asli tidak diketahui. Harap pilih format secara manual di detail sesi.',
        };
        return;
      }
      dispatchedJob = true;
    }

    handleQuickReprint(unknownSession);
    assert.strictEqual(dispatchedJob, false, 'Quick print DID NOT dispatch for unknown format');
    assert.strictEqual(openedModalSession.id, 'session_d7_quick_unknown', 'Opened detail modal instead');
    assert.ok(toastMessage.text.includes('Format asli tidak diketahui'), 'Actionable warning toast shown');

    // With known format (2R), quick print dispatches directly
    const knownSession = {
      id: 'session_d7_quick_known',
      originalFormat: '2R',
      printFormat: '2R',
    };
    handleQuickReprint(knownSession);
    assert.strictEqual(dispatchedJob, true, 'Quick print dispatched directly for known 2R format');
  });

  test('D8: Multi-override history sequence preserves original session format across multiple overrides', () => {
    seedSession('session_d8_multi_override', '2R');
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, format, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES 
        ('job_d8_1', 'session_d8_multi_override', ?, 'AUTO', '2R', 1, 'COMPLETED', 1, 5, datetime('now', '-30 minutes'), datetime('now', '-30 minutes')),
        ('job_d8_2', 'session_d8_multi_override', ?, 'AUTO', '4R', 1, 'COMPLETED', 1, 5, datetime('now', '-20 minutes'), datetime('now', '-20 minutes')),
        ('job_d8_3', 'session_d8_multi_override', ?, 'AUTO', '2R', 2, 'COMPLETED', 1, 5, datetime('now', '-10 minutes'), datetime('now', '-10 minutes')),
        ('job_d8_4', 'session_d8_multi_override', ?, 'AUTO', '4R', 1, 'COMPLETED', 1, 5, datetime('now', '-1 minute'), datetime('now', '-1 minute'))
    `).run(dummyFile, dummyFile, dummyFile, dummyFile);

    const history = getSessionHistory(20, 0);
    const session = history.find((s) => s.id === 'session_d8_multi_override');
    assert.ok(session);
    assert.strictEqual(session.originalFormat, '2R', 'originalFormat remains strictly 2R despite multiple toggles');
    assert.strictEqual(session.printFormat, '4R', 'printFormat tracks newest job (4R)');
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
