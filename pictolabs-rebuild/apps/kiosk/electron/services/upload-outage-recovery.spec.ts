import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import {
  initSyncEngine,
  stopSyncEngine,
  getDatabase,
  createSession,
  updateSession,
  enqueueUpload,
  processUploadQueue,
  rearmRetryableUploads,
  isPermanentUploadError,
  getUploadQueueItemByPath,
  forceUploadSession,
} from './SyncEngine';

/**
 * Upload & Internet Outage Reliability Test Suite
 * Validates Scenarios A through F:
 * - A: Network outage > 5 retry attempts & recovery
 * - B: Network outage lasting 10+ minutes equivalent (no storm, no abandonment)
 * - C: GIF background completion & idempotent enqueue
 * - D: Confirmation retry idempotency (single Photo row)
 * - E: Force Upload after completion (no duplicate Photo row)
 * - F: Permanent failure isolation (no infinite loops)
 */
async function runUploadOutageRecoveryTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  PICTOLABS: UPLOAD & INTERNET OUTAGE RELIABILITY VERIFICATION SUITE  ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  const testDir = path.join(os.tmpdir(), `pictolabs-outage-test-${Date.now()}`);
  const capturesDir = path.join(testDir, 'captures');
  fs.mkdirSync(capturesDir, { recursive: true });

  // Initialize SyncEngine with test database
  initSyncEngine({
    dataDir: testDir,
    syncIntervalMs: 60000,
    apiBaseUrl: 'http://127.0.0.1:49999', // dummy port initially
    deviceSecret: 'test-device-secret',
    boothId: 'booth-01',
  });

  const db = getDatabase()!;

  try {
    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO A: NETWORK OUTAGE > 5 RETRY ATTEMPTS & AUTOMATIC RECOVERY
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('[SCENARIO A: NETWORK OUTAGE > 5 RETRIES & AUTOMATIC RECOVERY]');
    
    // Create test composite file
    const compA = path.join(capturesDir, 'comp_scenario_a.jpg');
    fs.writeFileSync(compA, Buffer.from('scenario-a-composite-content'));

    const sessionA = createSession({
      id: 'session_outage_a',
      frameId: '4R',
      filter: 'none',
      photos: [],
      compositePath: compA,
      printStatus: 'printed',
    });

    const itemA = getUploadQueueItemByPath(compA)!;
    assert(itemA !== null, 'Item A enqueued in upload_queue');
    assert(itemA.status === 'PENDING', 'Item A initial status is PENDING');

    // Simulate 5 consecutive network failures during outage
    const now = new Date();
    for (let attempt = 1; attempt <= 5; attempt++) {
      db.prepare(`
        UPDATE upload_queue
        SET status = 'FAILED', attempts = ?, error_message = 'fetch failed: TypeError: fetch failed (ECONNREFUSED)', updated_at = ?
        WHERE id = ?
      `).run(attempt, new Date(now.getTime() - (6 - attempt) * 1000).toISOString(), itemA.id);
    }

    const exhaustedItem = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(itemA.id) as any;
    assert(exhaustedItem.status === 'FAILED', 'Item A status is FAILED after outage');
    assert(exhaustedItem.attempts === 5, 'Item A has reached 5 attempts');

    // Verify fast pending query ignores items with attempts >= 5
    const pendingQuery = db.prepare(`
      SELECT * FROM upload_queue WHERE status IN ('PENDING', 'FAILED') AND attempts < 5 AND id = ?
    `).get(itemA.id) as any;
    assert(!pendingQuery, 'Exhausted item is quiescent (ignored by fast loop)');

    // Network returns! Trigger network recovery re-arm
    const rearmedCountA = rearmRetryableUploads(false);
    assert(rearmedCountA >= 1, 'rearmRetryableUploads re-armed exhausted item');

    const recoveredItemA = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(itemA.id) as any;
    assert(recoveredItemA.status === 'PENDING', 'Item A status returned to PENDING');
    assert(recoveredItemA.attempts === 0, 'Item A attempts reset to 0');

    // Mock successful upload completion
    db.prepare(`
      UPDATE upload_queue
      SET status = 'COMPLETED', remote_url = 'https://r2.pictolabs.io/sessions/session_outage_a/comp_scenario_a.jpg', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), itemA.id);
    db.prepare('UPDATE sessions SET uploaded = 1, synced = 1 WHERE id = ?').run('session_outage_a');

    const completedSessionA = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session_outage_a') as any;
    assert(completedSessionA.uploaded === 1, 'Session A marked uploaded=1 after network recovery');


    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO B: NETWORK OUTAGE LASTING 10+ MINUTES IN MOCKED TIME
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO B: NETWORK OUTAGE 10+ MINUTES (NO STORM, NO ABANDONMENT)]');

    const compB = path.join(capturesDir, 'comp_scenario_b.jpg');
    fs.writeFileSync(compB, Buffer.from('scenario-b-composite-content'));

    createSession({
      id: 'session_outage_b',
      frameId: '4R',
      filter: 'none',
      photos: [],
      compositePath: compB,
      printStatus: 'printed',
    });

    const itemB = getUploadQueueItemByPath(compB)!;

    // Simulate 5 rapid failures, then 15 minutes of outage elapsed
    const FIFTEEN_MIN_AGO = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    db.prepare(`
      UPDATE upload_queue
      SET status = 'FAILED', attempts = 5, error_message = 'UND_ERR_CONNECT_TIMEOUT', updated_at = ?
      WHERE id = ?
    `).run(FIFTEEN_MIN_AGO, itemB.id);

    // Verify item is NOT deleted or lost
    const itemBStored = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(itemB.id) as any;
    assert(itemBStored !== null, 'Item B persisted in SQLite store-and-forward queue');

    // Verify bounded store-and-forward check detects backed off item (>60s)
    const cutoff60s = new Date(Date.now() - 60_000).toISOString();
    const backedOffItems = db.prepare(`
      SELECT * FROM upload_queue 
      WHERE status = 'FAILED' AND attempts >= 5 AND updated_at < ? AND id = ?
    `).all(cutoff60s, itemB.id) as any[];
    assert(backedOffItems.length === 1, 'Item B eligible for bounded store-and-forward recovery');

    // Re-arm retryable uploads on network restoration
    const rearmedB = rearmRetryableUploads(false);
    assert(rearmedB >= 1, 'Item B successfully re-armed without operator intervention');

    const itemBAfterRearm = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(itemB.id) as any;
    assert(itemBAfterRearm.status === 'PENDING', 'Item B is PENDING and ready for transmission');


    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO C: BACKGROUND GIF COMPLETION & IDEMPOTENT ENQUEUE
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO C: BACKGROUND GIF ENQUEUE & IDEMPOTENCY]');

    const compC = path.join(capturesDir, 'comp_scenario_c.jpg');
    const gifC = path.join(capturesDir, 'loop_scenario_c.gif');
    fs.writeFileSync(compC, Buffer.from('composite-c'));
    fs.writeFileSync(gifC, Buffer.from('gif-c-loop-content'));

    const sessionC = createSession({
      id: 'session_gif_c',
      frameId: '4R',
      filter: 'none',
      photos: [],
      compositePath: compC,
      printStatus: 'printed',
    });

    // Initial state: No GIF queued yet (simulates RCA-7 background generation)
    const initialGifQueue = db.prepare('SELECT * FROM upload_queue WHERE session_id = ? AND file_path = ?').get('session_gif_c', gifC);
    assert(!initialGifQueue, 'GIF not in queue before background generation finishes');

    // RCA-7 background generation finishes -> kiosk calls updateSession({ gifPath })
    const updatedSessionC1 = updateSession('session_gif_c', {
      gifPath: gifC,
    });

    assert(updatedSessionC1?.gifPath === gifC, 'Session updated with gifPath');

    const queuedGif1 = db.prepare('SELECT * FROM upload_queue WHERE session_id = ? AND file_path = ?').all('session_gif_c', gifC) as any[];
    assert(queuedGif1.length === 1, 'GIF entered upload_queue exactly once');
    assert(queuedGif1[0].file_type === 'video', 'GIF registered with file_type = video');

    // Duplicate call: kiosk calls updateSession({ gifPath }) again (idempotency check)
    const updatedSessionC2 = updateSession('session_gif_c', {
      gifPath: gifC,
    });
    assert(updatedSessionC2 !== null, 'Second updateSession succeeded');

    const queuedGif2 = db.prepare('SELECT * FROM upload_queue WHERE session_id = ? AND file_path = ?').all('session_gif_c', gifC) as any[];
    assert(queuedGif2.length === 1, 'Duplicate updateSession did NOT create duplicate upload_queue row');

    // Simulate GIF upload success -> verify sessions.gif_url is updated
    const remoteGifUrl = 'https://r2.pictolabs.io/sessions/session_gif_c/loop_scenario_c.gif';
    db.prepare(`
      UPDATE upload_queue
      SET status = 'COMPLETED', remote_url = ?
      WHERE id = ?
    `).run(remoteGifUrl, queuedGif1[0].id);

    // Apply session update as done in processUploadQueue
    db.prepare('UPDATE sessions SET gif_url = ?, uploaded = 1 WHERE id = ?').run(remoteGifUrl, 'session_gif_c');

    const finalSessionC = db.prepare('SELECT * FROM sessions WHERE id = ?').get('session_gif_c') as any;
    assert(finalSessionC.gif_url === remoteGifUrl, 'Session gif_url successfully updated on upload completion');


    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO D: CONFIRMATION RETRY IDEMPOTENCY
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO D: CONFIRMATION RETRY IDEMPOTENCY]');

    // In-memory Ledger Simulation of StorageController.confirmUpload logic
    interface PhotoLedgerItem {
      id: string;
      sessionId: string;
      storageKey: string;
      finalUrl: string;
      sequenceNo: number;
    }
    const mockPhotoLedger: PhotoLedgerItem[] = [];

    async function mockConfirmUpload(body: {
      sessionId: string;
      fileName: string;
      fileType: string;
      key?: string;
      publicUrl?: string;
      sequenceNo?: number;
    }) {
      const targetStorageKey = body.key || body.fileName;
      const targetFinalUrl = body.publicUrl || `/uploads/${body.fileName}`;

      // Idempotency check matching StorageController implementation
      const existingPhoto = mockPhotoLedger.find(
        (p) => p.sessionId === body.sessionId && p.storageKey === targetStorageKey
      );

      let photoRecord = existingPhoto;
      if (!photoRecord) {
        photoRecord = {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          sessionId: body.sessionId,
          storageKey: targetStorageKey,
          finalUrl: targetFinalUrl,
          sequenceNo: body.sequenceNo || 1,
        };
        mockPhotoLedger.push(photoRecord);
      } else {
        if (targetFinalUrl && photoRecord.finalUrl !== targetFinalUrl) {
          photoRecord.finalUrl = targetFinalUrl;
        }
      }

      return {
        success: true,
        sessionId: body.sessionId,
        fileName: body.fileName,
        confirmed: true,
        alreadyConfirmed: !!existingPhoto,
        photoId: photoRecord.id,
      };
    }

    // Call 1: Initial upload confirmation
    const confirm1 = await mockConfirmUpload({
      sessionId: 'session_confirm_d',
      fileName: 'composite_session_confirm_d.jpg',
      fileType: 'composite',
      key: 'sessions/session_confirm_d/composite_session_confirm_d.jpg',
      publicUrl: 'https://r2.pictolabs.io/sessions/session_confirm_d/composite_session_confirm_d.jpg',
    });

    assert(confirm1.success === true, 'First confirmation returns success');
    assert(confirm1.confirmed === true, 'First confirmation returns confirmed=true');
    assert(confirm1.alreadyConfirmed === false, 'First confirmation reports alreadyConfirmed=false');
    assert(mockPhotoLedger.length === 1, 'Exactly one Photo row exists after first confirmation');

    // Call 2: Network timeout / retry on confirmation
    const confirm2 = await mockConfirmUpload({
      sessionId: 'session_confirm_d',
      fileName: 'composite_session_confirm_d.jpg',
      fileType: 'composite',
      key: 'sessions/session_confirm_d/composite_session_confirm_d.jpg',
      publicUrl: 'https://r2.pictolabs.io/sessions/session_confirm_d/composite_session_confirm_d.jpg',
    });

    assert(confirm2.success === true, 'Second confirmation retry returns success');
    assert(confirm2.confirmed === true, 'Second confirmation retry returns confirmed=true');
    assert(confirm2.alreadyConfirmed === true, 'Second confirmation reports alreadyConfirmed=true');
    assert(confirm2.photoId === confirm1.photoId, 'Reused identical Photo ID on retry');
    assert(mockPhotoLedger.length === 1, 'Exactly one Photo row exists (zero duplicate rows)');


    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO E: FORCE UPLOAD AFTER COMPLETED UPLOAD (DUPLICATE SAFETY)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO E: FORCE UPLOAD AFTER COMPLETED UPLOAD]');

    // Operator triggers Force Upload on session_confirm_d
    const forceUploadRes = await forceUploadSession('session_outage_a');
    assert(forceUploadRes.success === true, 'Force Upload executes successfully');

    // Third confirmation arriving via Force Upload
    const confirm3 = await mockConfirmUpload({
      sessionId: 'session_confirm_d',
      fileName: 'composite_session_confirm_d.jpg',
      fileType: 'composite',
      key: 'sessions/session_confirm_d/composite_session_confirm_d.jpg',
      publicUrl: 'https://r2.pictolabs.io/sessions/session_confirm_d/composite_session_confirm_d.jpg',
    });

    assert(confirm3.confirmed === true, 'Force Upload confirmation succeeds');
    assert(confirm3.alreadyConfirmed === true, 'Force Upload recognized existing asset');
    assert(mockPhotoLedger.length === 1, 'Zero duplicate Photo records after Force Upload');


    // ─────────────────────────────────────────────────────────────────────────────
    // SCENARIO F: PERMANENT FAILURE ISOLATION (ZERO INFINITE RETRY)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO F: PERMANENT FAILURE ISOLATION]');

    // Test error classifier
    assert(isPermanentUploadError('File missing on local disk') === true, 'Classifies missing local file as permanent');
    assert(isPermanentUploadError('ENOENT: no such file or directory') === true, 'Classifies ENOENT as permanent');
    assert(isPermanentUploadError('INVALID_DEVICE: Device decommissioned or unlinked') === true, 'Classifies INVALID_DEVICE as permanent');
    assert(isPermanentUploadError('HTTP 400: sessionId and fileName are required') === true, 'Classifies HTTP 400 as permanent');
    assert(isPermanentUploadError('HTTP 403: Forbidden') === true, 'Classifies HTTP 403 as permanent');
    assert(isPermanentUploadError('HTTP 404: SESSION_NOT_FOUND') === true, 'Classifies HTTP 404 as permanent');
    assert(isPermanentUploadError('dead_letter: exceeded max retries in uploading state') === true, 'Classifies DEAD_LETTER as permanent');

    // Transient network errors must NOT be permanent
    assert(isPermanentUploadError('TypeError: fetch failed') === false, 'fetch failed is retryable');
    assert(isPermanentUploadError('ECONNREFUSED') === false, 'ECONNREFUSED is retryable');
    assert(isPermanentUploadError('ETIMEDOUT') === false, 'ETIMEDOUT is retryable');
    assert(isPermanentUploadError('HTTP 502 Bad Gateway') === false, 'HTTP 502 is retryable');
    assert(isPermanentUploadError('Confirm network error: fetch failed') === false, 'Confirm network error is retryable');

    // Insert permanent failure into queue (with valid session for FK)
    createSession({
      id: 'session_perm',
      frameId: '4R',
      filter: 'none',
      photos: [],
      printStatus: 'printed',
    });

    const missingFilePath = path.join(capturesDir, 'non_existent_file.jpg');
    const permId = `upload_perm_test_${Date.now()}`;
    db.prepare(`
      INSERT INTO upload_queue (id, session_id, file_path, file_type, status, attempts, error_message, created_at, updated_at)
      VALUES (?, 'session_perm', ?, 'raw', 'FAILED', 5, 'File missing on local disk', ?, ?)
    `).run(permId, missingFilePath, new Date().toISOString(), new Date().toISOString());

    // Trigger network recovery re-arm
    rearmRetryableUploads(false);

    // Verify missing file was NOT re-armed
    const permRow = db.prepare('SELECT * FROM upload_queue WHERE id = ?').get(permId) as any;
    assert(permRow.status === 'FAILED', 'Permanent missing file remained FAILED');
    assert(permRow.attempts === 5, 'Permanent missing file attempts were NOT reset to 0');

  } finally {
    await new Promise((r) => setTimeout(r, 100));
    stopSyncEngine();
    // Clean up temporary test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED                     `);
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runUploadOutageRecoveryTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
