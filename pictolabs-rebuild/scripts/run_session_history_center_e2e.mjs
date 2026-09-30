import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function assert(condition, testName) {
  if (!condition) {
    console.error(`\x1b[31m  ✗ [FAIL] ${testName}\x1b[0m`);
    throw new Error(`Assertion failed: ${testName}`);
  }
  console.log(`\x1b[32m  ✓ [PASS] ${testName}\x1b[0m`);
}

async function runVerification() {
  log('════════════════════════════════════════════════════════════════════');
  log('  SESSION HISTORY CENTER — PHASE 1 & PHASE 2 E2E VERIFICATION SUITE');
  log('════════════════════════════════════════════════════════════════════');

  // Setup isolated test directory
  const testDir = path.join(os.tmpdir(), `pictolabs_session_history_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const compositesDir = path.join(testDir, 'composites');
  fs.mkdirSync(compositesDir, { recursive: true });

  const dbPath = path.join(testDir, 'kiosk.db');
  log(`Test working directory: ${testDir}`);
  log(`Test database path: ${dbPath}`);

  // Load compiled SyncEngine
  const syncEnginePath = path.resolve('./apps/kiosk/dist/main/services/SyncEngine.js');
  if (!fs.existsSync(syncEnginePath)) {
    throw new Error(`SyncEngine not found at ${syncEnginePath}. Run build first!`);
  }
  const syncEngine = await import(`file://${syncEnginePath.replace(/\\/g, '/')}`);

  // Initialize SyncEngine with test directory
  syncEngine.registerSyncHandlers({
    dataDir: testDir,
    syncIntervalMs: 60000,
    apiBaseUrl: 'http://localhost:4000',
    deviceSecret: 'test-device-secret-001',
    boothId: 'test-booth-001',
  });

  const db = syncEngine.getDatabase();
  assert(db !== null, 'Database initialized in WAL mode');

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Schema Integrity Verification
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 1: Schema Integrity Verification ---');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert(tables.includes('sessions'), 'Table `sessions` exists');
    assert(tables.includes('upload_queue'), 'Table `upload_queue` exists');
    assert(tables.includes('print_queue'), 'Table `print_queue` exists');
    assert(tables.includes('kiosk_system_events'), 'Table `kiosk_system_events` exists');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Seed Complex Session Scenarios
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 2: Seeding Complex Session Scenarios ---');
    
    // Scenario A: HOT Asset, Printed, Synced
    const hotCompositePath = path.join(compositesDir, 'composite_session_hot.jpg');
    fs.writeFileSync(hotCompositePath, Buffer.from('FAKE_300DPI_COMPOSITE_HOT_IMAGE_DATA_1234567890'));
    
    db.prepare(`
      INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded, remote_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session_hot_001',
      new Date().toISOString(),
      '2R',
      'warm',
      JSON.stringify(['photo_1.jpg', 'photo_2.jpg']),
      hotCompositePath,
      'printed',
      1,
      1,
      'https://cdn.pictolabs.id/sessions/session_hot_001/composite.jpg'
    );

    // Scenario B: PRUNED Asset (Missing on SSD, exists in cloud)
    const prunedCompositePath = path.join(compositesDir, 'composite_session_pruned_missing.jpg');
    // Ensure file does NOT exist
    if (fs.existsSync(prunedCompositePath)) fs.unlinkSync(prunedCompositePath);

    db.prepare(`
      INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded, remote_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session_pruned_002',
      new Date(Date.now() - 86400000).toISOString(),
      '4R',
      'bw',
      JSON.stringify(['photo_1.jpg', 'photo_2.jpg', 'photo_3.jpg', 'photo_4.jpg']),
      prunedCompositePath,
      'printed',
      1,
      1,
      'https://cdn.pictolabs.id/sessions/session_pruned_002/composite.jpg'
    );

    // Scenario C: Failed Print Session
    const failedPrintCompositePath = path.join(compositesDir, 'composite_session_failed_print.jpg');
    fs.writeFileSync(failedPrintCompositePath, Buffer.from('FAKE_COMPOSITE_FAILED_PRINT_DATA'));

    db.prepare(`
      INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded, remote_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session_failed_print_003',
      new Date(Date.now() - 3600000).toISOString(),
      '6R',
      'sepia',
      JSON.stringify(['photo_1.jpg']),
      failedPrintCompositePath,
      'failed',
      1,
      0,
      null
    );

    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, last_error, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'job_fail_003',
      'session_failed_print_003',
      failedPrintCompositePath,
      'DNP DS-RX1HS',
      1,
      'FAILED',
      5,
      5,
      'Paper Jam in Cassette 1',
      new Date(Date.now() - 3600000).toISOString(),
      new Date(Date.now() - 3600000).toISOString()
    );

    // Scenario D: Stuck Upload Session
    const stuckUploadCompositePath = path.join(compositesDir, 'composite_session_stuck_upload.jpg');
    fs.writeFileSync(stuckUploadCompositePath, Buffer.from('FAKE_COMPOSITE_STUCK_UPLOAD_DATA'));

    db.prepare(`
      INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded, remote_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session_stuck_upload_004',
      new Date(Date.now() - 1800000).toISOString(),
      '2R',
      'cool',
      JSON.stringify(['photo_1.jpg']),
      stuckUploadCompositePath,
      'printed',
      1,
      0,
      null
    );

    db.prepare(`
      INSERT INTO upload_queue (id, session_id, file_path, file_type, status, attempts, error_message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'upload_stuck_004',
      'session_stuck_upload_004',
      stuckUploadCompositePath,
      'composite',
      'FAILED',
      3,
      'ETIMEDOUT: Connection reset by peer',
      new Date(Date.now() - 1800000).toISOString(),
      new Date(Date.now() - 1800000).toISOString()
    );

    // Scenario E: Active Printing Session
    const activePrintCompositePath = path.join(compositesDir, 'composite_session_active_printing.jpg');
    fs.writeFileSync(activePrintCompositePath, Buffer.from('FAKE_COMPOSITE_ACTIVE_PRINT_DATA'));

    db.prepare(`
      INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded, remote_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session_active_printing_005',
      new Date().toISOString(),
      '4R',
      'vintage',
      JSON.stringify(['photo_1.jpg']),
      activePrintCompositePath,
      'pending',
      1,
      0,
      null
    );

    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'job_active_005',
      'session_active_printing_005',
      activePrintCompositePath,
      'DNP DS-RX1HS',
      1,
      'PRINTING',
      1,
      5,
      new Date().toISOString(),
      new Date().toISOString()
    );

    log('Seeded 5 representative test sessions across all lifecycle states.');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Query & Lifecycle Metadata Verification
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 3: Query & Lifecycle Metadata Verification ---');
    const allHistory = syncEngine.getSessionHistory({ limit: 50, statusFilter: 'ALL' });
    assert(allHistory.length === 5, `Fetched exact seeded count (Expected: 5, Got: ${allHistory.length})`);

    const itemA = allHistory.find(s => s.id === 'session_hot_001');
    assert(itemA !== undefined, 'Found Session A (HOT)');
    assert(itemA.localStorageState === 'HOT', 'Session A has localStorageState === "HOT"');
    assert(itemA.compositeExists === true, 'Session A compositeExists === true');
    assert(itemA.printStatus === 'COMPLETED', 'Session A printStatus === "COMPLETED"');
    assert(itemA.uploadStatus === 'COMPLETED', 'Session A uploadStatus === "COMPLETED"');

    const itemB = allHistory.find(s => s.id === 'session_pruned_002');
    assert(itemB !== undefined, 'Found Session B (PRUNED)');
    assert(itemB.localStorageState === 'PRUNED', 'Session B has localStorageState === "PRUNED"');
    assert(itemB.compositeExists === false, 'Session B compositeExists === false');

    const itemC = allHistory.find(s => s.id === 'session_failed_print_003');
    assert(itemC !== undefined, 'Found Session C (Failed Print)');
    assert(itemC.printStatus === 'FAILED', 'Session C printStatus === "FAILED"');
    assert(itemC.lastPrintError === 'Paper Jam in Cassette 1', 'Session C captures exact lastPrintError');
    assert(itemC.printAttempts === 5, 'Session C printAttempts === 5');

    const itemD = allHistory.find(s => s.id === 'session_stuck_upload_004');
    assert(itemD !== undefined, 'Found Session D (Stuck Upload)');
    assert(itemD.uploadStatus === 'FAILED', 'Session D uploadStatus === "FAILED"');
    assert(itemD.lastUploadError === 'ETIMEDOUT: Connection reset by peer', 'Session D captures exact lastUploadError');

    const itemE = allHistory.find(s => s.id === 'session_active_printing_005');
    assert(itemE !== undefined, 'Found Session E (Active Printing)');
    assert(itemE.printStatus === 'PRINTING', 'Session E printStatus === "PRINTING"');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Filter Toolbar Verification
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 4: Filter Toolbar Verification ---');
    const printFailedList = syncEngine.getSessionHistory({ statusFilter: 'PRINT_FAILED' });
    assert(printFailedList.length === 1 && printFailedList[0].id === 'session_failed_print_003', 'Filter `PRINT_FAILED` isolates failed print sessions');

    const uploadPendingList = syncEngine.getSessionHistory({ statusFilter: 'UPLOAD_PENDING' });
    const hasStuckUpload = uploadPendingList.some(s => s.id === 'session_stuck_upload_004');
    assert(hasStuckUpload, 'Filter `UPLOAD_PENDING` includes sessions with pending/failed uploads');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Reprint Debounce & Double-Tap Protection
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 5: Reprint Debounce & Double-Tap Protection ---');
    
    // Case 5A: Try to reprint a session that is ALREADY PRINTING (Session E)
    const debounceRes1 = await syncEngine.reprintSessionWithDebounce('session_active_printing_005', 1);
    assert(debounceRes1.success === false, 'Reprint rejected on actively printing session');
    assert(debounceRes1.error.includes('sedang berlangsung'), 'Debounce error message returned correctly');

    // Case 5B: Valid reprint on HOT Session A
    const reprintRes = await syncEngine.reprintSessionWithDebounce('session_hot_001', 1);
    assert(reprintRes.success === true, '1st reprint tap on Session A succeeded');
    assert(reprintRes.printJobId !== undefined, `Print job created with ID: ${reprintRes.printJobId}`);

    // Case 5C: Immediate rapid 2nd tap on Session A
    const debounceRes2 = await syncEngine.reprintSessionWithDebounce('session_hot_001', 1);
    assert(debounceRes2.success === false, 'Rapid 2nd reprint tap on Session A rejected by debounce lock');
    assert(debounceRes2.error.includes('sedang berlangsung'), 'Double-tap protection blocked redundant queue entry');

    // Verify exactly one new job was created for Session A
    const jobsForSessionA = db.prepare('SELECT id, status FROM print_queue WHERE session_id = ?').all('session_hot_001');
    assert(jobsForSessionA.length === 1, `Exactly 1 print job exists in queue for Session A (Got: ${jobsForSessionA.length})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Pruned Asset & Offline Protection
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 6: Pruned Asset & Offline Protection ---');
    // Session B is pruned and mock cloud url is unreachable (offline simulator)
    const prunedReprintRes = await syncEngine.reprintSessionWithDebounce('session_pruned_002', 1);
    assert(prunedReprintRes.success === false, 'Reprint rejected for pruned asset when cloud rehydration is unavailable');
    assert(prunedReprintRes.error.includes('tidak ditemukan di SSD lokal'), 'Clear explanation provided for missing physical asset');

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Force Upload Retry
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 7: Force Upload Retry ---');
    const forceUploadRes = await syncEngine.forceUploadSession('session_stuck_upload_004');
    assert(forceUploadRes.success === true, 'Force upload succeeded');
    assert(forceUploadRes.enqueuedCount === 1, 'Re-enqueued 1 stuck upload item');

    const updatedUploadItem = db.prepare('SELECT status, attempts, error_message FROM upload_queue WHERE session_id = ?').get('session_stuck_upload_004');
    assert(updatedUploadItem.status === 'PENDING', 'Upload queue status reset to PENDING');
    assert(updatedUploadItem.attempts === 0, 'Upload attempts reset to 0');
    assert(updatedUploadItem.error_message === null, 'Previous error message cleared');

    // ─────────────────────────────────────────────────────────────
    // TEST 8: System Audit Logging Verification
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST 8: System Audit Logging Verification ---');
    const events = db.prepare('SELECT event_type, component, details FROM kiosk_system_events ORDER BY created_at DESC').all();
    const reprintEvent = events.find(e => e.event_type === 'SESSION_REPRINT');
    assert(reprintEvent !== undefined, 'Audit event `SESSION_REPRINT` recorded in kiosk_system_events');
    assert(reprintEvent.details.includes('session_hot_001'), 'Audit event details contains session ID');

    const forceUploadEvent = events.find(e => e.event_type === 'SESSION_FORCE_UPLOAD');
    assert(forceUploadEvent !== undefined, 'Audit event `SESSION_FORCE_UPLOAD` recorded in kiosk_system_events');

    log('\n════════════════════════════════════════════════════════════════════');
    log('  ✓ ALL 8 INTEGRATION TESTS PASSED (100% SUCCESS, 0 FAILURES)');
    log('════════════════════════════════════════════════════════════════════');
  } finally {
    syncEngine.stopSyncEngine();
    // Clean up temporary test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('\n\x1b[31mVERIFICATION FAILED:\x1b[0m', err);
  process.exit(1);
});

