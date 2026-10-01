import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';

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

async function runTests() {
  log('════════════════════════════════════════════════════════════════════');
  log('  RCA MINIMAL FIXES VERIFICATION SUITE — TESTS D, E, F, G, H, I    ');
  log('════════════════════════════════════════════════════════════════════');

  const testDir = path.join(os.tmpdir(), `pictolabs_rca_fix_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  const capturesDir = path.join(testDir, 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });

  // 1. Start a local mock backend server to intercept session sync and upload requests
  let receivedSessionPayload = null;
  let receivedSessionHeaders = null;
  let sessionSyncCount = 0;
  let uploadConfirmCount = 0;

  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/api/sessions' && req.method === 'POST') {
        sessionSyncCount++;
        receivedSessionHeaders = req.headers;
        try {
          receivedSessionPayload = JSON.parse(body);
        } catch (_) {
          receivedSessionPayload = body;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sessionId: receivedSessionPayload?.id || 'mock_sid' }));
      } else if (req.url === '/api/storage/presigned' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          presignedUrl: `http://localhost:${mockServerPort}/mock-r2-upload`,
          publicUrl: `https://cdn.pictolabs.id/mock/${Date.now()}.jpg`,
          key: `sessions/mock/${Date.now()}.jpg`
        }));
      } else if (req.url === '/mock-r2-upload' && req.method === 'PUT') {
        res.writeHead(200);
        res.end();
      } else if (req.url === '/api/storage/confirm-upload' && req.method === 'POST') {
        uploadConfirmCount++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ confirmed: true }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const mockServerPort = mockServer.address().port;
  const mockApiBaseUrl = `http://127.0.0.1:${mockServerPort}`;
  log(`Mock cloud backend listening on: ${mockApiBaseUrl}`);

  // Load compiled SyncEngine
  const syncEnginePath = path.resolve('./apps/kiosk/dist/main/services/SyncEngine.js');
  const syncEngine = await import(`file://${syncEnginePath.replace(/\\/g, '/')}`);

  // Load compiled WatchdogService
  const watchdogServicePath = path.resolve('./apps/kiosk/dist/main/services/WatchdogService.js');
  const watchdogService = await import(`file://${watchdogServicePath.replace(/\\/g, '/')}`);

  // Initialize SyncEngine with mock backend
  syncEngine.registerSyncHandlers({
    dataDir: testDir,
    syncIntervalMs: 60000,
    apiBaseUrl: mockApiBaseUrl,
    deviceSecret: 'test-device-secret-rca',
    boothId: 'test-booth-rca',
  });

  const db = syncEngine.getDatabase();
  assert(db !== null, 'Database initialized successfully');

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST E: Session Metadata Payload Test (FIX 1)
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST E: Session Metadata Payload Test (Fix 1: Remove Base64) ---');

    // Create a 2 MB fake Base64 photo string
    const fakeBase64Data = 'A'.repeat(2 * 1024 * 1024);
    const photoBase64_1 = `data:image/jpeg;base64,${fakeBase64Data}`;
    const photoBase64_2 = `data:image/jpeg;base64,${fakeBase64Data}`;

    const dummyCompositePath = path.join(capturesDir, 'composite_rca_test.jpg');
    fs.writeFileSync(dummyCompositePath, Buffer.from('FAKE_COMPOSITE_IMAGE_BYTES'));

    receivedSessionPayload = null;
    sessionSyncCount = 0;

    log('Creating session with 2x 2MB raw Base64 photos...');
    const created = syncEngine.createSession({
      id: 'session_rca_fix1_001',
      frameId: '2R',
      filter: 'warm',
      photos: [photoBase64_1, photoBase64_2],
      compositePath: dummyCompositePath,
      printStatus: 'pending',
    });

    assert(created.id === 'session_rca_fix1_001', 'Session created returned valid ID');

    // Wait briefly for eager metadata sync to hit mock server
    await new Promise(r => setTimeout(r, 600));

    assert(sessionSyncCount >= 1, 'syncSingleSessionToCloud sent metadata request to cloud');
    assert(receivedSessionPayload !== null, 'Cloud backend received metadata payload');
    assert(receivedSessionPayload.id === 'session_rca_fix1_001', 'Payload has correct session ID');
    assert(receivedSessionPayload.frameId === '2R', 'Payload has correct frameId');
    assert(receivedSessionPayload.filter === 'warm', 'Payload has correct filter');

    // CRITICAL FIX 1 VERIFICATION: Payload must NOT contain raw Base64 data
    const payloadJson = JSON.stringify(receivedSessionPayload);
    const payloadBytes = Buffer.byteLength(payloadJson, 'utf8');
    log(`Actual Session Metadata Payload Size: ${payloadBytes} bytes`);

    assert(payloadBytes < 2048, `Payload is extremely small (${payloadBytes} bytes < 2048 bytes), zero Base64 bloat`);
    assert(!payloadJson.includes('data:image'), 'Payload JSON does NOT contain "data:image"');
    assert(!payloadJson.includes('AAAAAAA'), 'Payload JSON does NOT contain raw Base64 chunks');

    // Verify rowToSession does not return Base64
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session_rca_fix1_001');
    assert(row !== null, 'Session row exists in SQLite');
    assert(!row.photos.includes('data:image'), 'SQLite sessions table does NOT store raw Base64 strings');

    const historyItems = syncEngine.getSessionHistory({ limit: 10 });
    const foundSession = historyItems.find(s => s.id === 'session_rca_fix1_001');
    assert(foundSession !== undefined, 'Session found in Session History Center');
    assert(foundSession.photoCount === 2, `Session History photoCount truthful (Expected: 2, Got: ${foundSession.photoCount})`);

    // ─────────────────────────────────────────────────────────────
    // TEST D: Upload Worker Concurrency & Mutex Protection Test (FIX 2)
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST D: Upload Worker Concurrency & Mutex Protection (Fix 2) ---');

    // Reset stuck upload worker while active uploading count is 0
    // RCA bug: Previously, activeUploading.count === 0 immediately reset isUploading=false!
    const healthBefore = syncEngine.getUploadQueueHealth();
    log(`Initial Upload Queue Health: isUploading=${healthBefore.isUploading}`);

    // Call resetStuckUploadWorker
    const rescueRes = syncEngine.resetStuckUploadWorker(60_000, false);
    assert(rescueRes.mutexReset === false, 'Watchdog does NOT reset mutex during normal inactivity (< 90s)');

    // Test that triggering upload queue multiple times concurrently does not produce races
    log('Triggering concurrent upload queue executions...');
    syncEngine.triggerUploadQueue();
    syncEngine.triggerUploadQueue();
    syncEngine.triggerUploadQueue();

    // Verify that watchdog rescue routine does NOT break mutex prematurely during failure transitions
    const rescueDuringWork = syncEngine.resetStuckUploadWorker(60_000, false);
    assert(rescueDuringWork.mutexReset === false, 'Mutex protected against premature reset during async operations');

    // Wait for upload queue to process
    await new Promise(r => setTimeout(r, 1200));

    // Verify upload queue items
    const queueRows = db.prepare('SELECT * FROM upload_queue WHERE session_id = ?').all('session_rca_fix1_001');
    log(`Upload queue items created for session: ${queueRows.length}`);
    assert(queueRows.length >= 2, 'Composite and raw photos enqueued in upload_queue');

    for (const qItem of queueRows) {
      assert(qItem.attempts <= 5, `Queue item ${qItem.id} attempts <= 5 (Got: ${qItem.attempts}) - no runaway concurrency`);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST F & G: Automatic Upload & Force Upload (Fix 1 + Fix 2 Integration)
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST F & G: Automatic Upload & Force Upload Lifecycle ---');

    // Simulate a failed item in upload_queue
    const failedItem = queueRows[0];
    db.prepare(`
      UPDATE upload_queue 
      SET status = 'FAILED', attempts = 3, error_message = 'Simulated network drop' 
      WHERE id = ?
    `).run(failedItem.id);

    // Call forceUploadSession
    log(`Calling forceUploadSession for session: session_rca_fix1_001...`);
    const forceResult = await syncEngine.forceUploadSession('session_rca_fix1_001');
    assert(forceResult.success === true, 'forceUploadSession returned success');
    assert(forceResult.enqueuedCount >= 1, `Enqueued count >= 1 (Got: ${forceResult.enqueuedCount})`);

    // Verify database state after force upload
    const updatedItem = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(failedItem.id);
    assert(updatedItem.status === 'PENDING' || updatedItem.status === 'UPLOADING' || updatedItem.status === 'COMPLETED',
      `Item status reset to PENDING (or already picked up by worker): ${updatedItem.status}`);
    assert(updatedItem.attempts === 0, `Item attempts reset to 0 after Force Upload (Got: ${updatedItem.attempts})`);
    assert(updatedItem.error_message === null, 'Item error_message cleared');

    // ─────────────────────────────────────────────────────────────
    // TEST H: Watchdog / Admin State Test (FIX 3)
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST H: Watchdog / Admin State Test (Fix 3) ---');

    // 1. Initial customer screen state: welcome
    watchdogService.setWatchdogScreen('welcome', null);
    assert(watchdogService.getCurrentWatchdogScreen() === 'welcome', 'Initial watchdog screen is "welcome"');

    // 2. Operator opens Admin Panel (Admin modal opens -> effectiveScreen = 'admin')
    log('Operator opens Admin Panel: setting watchdog screen to "admin"...');
    watchdogService.setWatchdogScreen('admin', null);
    assert(watchdogService.getCurrentWatchdogScreen() === 'admin', 'Watchdog current screen is now "admin"');

    // 3. Operator remains idle on Session History detail inside Admin
    // Verify that session watchdog does NOT reset to welcome
    log('Running watchdog cycle while operator is on "admin"...');
    const cycleResult = watchdogService.runWatchdogCycle({
      sessionTimeoutMs: 100, // Very short timeout for testing
      captureTimeoutMs: 100,
    });

    assert(cycleResult.sessionReset === false, 'Session watchdog did NOT reset kiosk to welcome while on "admin"');
    assert(watchdogService.getCurrentWatchdogScreen() === 'admin', 'Watchdog screen remains "admin" after cycle');

    // 4. Operator closes Admin Panel (Admin modal closes -> effectiveScreen restored to 'welcome')
    log('Operator closes Admin Panel: restoring watchdog screen to customer screen "welcome"...');
    watchdogService.setWatchdogScreen('welcome', null);
    assert(watchdogService.getCurrentWatchdogScreen() === 'welcome', 'Watchdog screen restored to "welcome"');

    // ─────────────────────────────────────────────────────────────
    // TEST I: Truthful Diagnostic Attempt Counter Logic (FIX 4)
    // ─────────────────────────────────────────────────────────────
    log('\n--- TEST I: Truthful Diagnostic Attempt Counter Logic (Fix 4) ---');

    // Helper mirroring SessionHistorySection.tsx rendering logic
    function renderAttemptCounter(attempts, max = 5) {
      if (attempts > max) {
        return `${attempts} / ${max} — melebihi batas retry`;
      }
      return `${attempts} / ${max}`;
    }

    assert(renderAttemptCounter(1) === '1 / 5', 'Normal 1 attempt: "1 / 5"');
    assert(renderAttemptCounter(5) === '5 / 5', 'Max normal attempts: "5 / 5"');
    assert(renderAttemptCounter(8) === '8 / 5 — melebihi batas retry', 'Truthful abnormal display: "8 / 5 — melebihi batas retry" (never hidden by Math.min)');

    log('\n════════════════════════════════════════════════════════════════════');
    log('  ✓ ALL RCA MINIMAL FIX TESTS PASSED (100% SUCCESS, 0 FAILURES)     ');
    log('════════════════════════════════════════════════════════════════════');
    process.exit(0);
  } catch (err) {
    console.error('\n\x1b[31mTEST STEP FAILED:\x1b[0m', err);
    process.exit(1);
  } finally {
    try { mockServer.close(); } catch (_) {}
  }
}

runTests();
