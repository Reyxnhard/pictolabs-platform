import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import {
  evaluateThreeKeyLock,
  runOrphanJanitor,
  runRetentionCleanupNow,
  initStorageRetention,
  stopStorageRetention,
  getRetentionStats,
} from './StorageRetentionService';
import {
  initSyncEngine,
  getDatabase,
  getUploadQueueItemByPath,
  isPrintAssetSettled,
  runDatabaseCompaction,
} from './SyncEngine';
import { ensureCompositeOnDisk, isPrintJobPendingOrPrinting } from './PrintQueueService';

/**
 * Phase 3.2C Storage Lifecycle & Retention Engine Test Suite
 */
async function runStorageRetentionTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   PICTOLABS PHASE 3.2C: STORAGE LIFECYCLE & RETENTION ENGINE TESTS   ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const testDir = path.join(os.tmpdir(), `pictolabs-retention-test-${Date.now()}`);
  const capturesDir = path.join(testDir, 'captures');
  const compositesDir = path.join(testDir, 'composites');
  const videosDir = path.join(testDir, 'videos');

  fs.mkdirSync(capturesDir, { recursive: true });
  fs.mkdirSync(compositesDir, { recursive: true });
  fs.mkdirSync(videosDir, { recursive: true });

  // Initialize SyncEngine with test database
  initSyncEngine({
    dataDir: testDir,
    syncIntervalMs: 60000,
    apiBaseUrl: 'http://localhost:4000',
    deviceSecret: 'test-secret',
  });

  const db = getDatabase()!;

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: THREE-KEY SAFETY LOCK
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 1: THREE-KEY SAFETY LOCK]');
  const now = Date.now();
  const TEN_DAYS_AGO = new Date(now - 10 * 24 * 60 * 60 * 1000);
  const ONE_DAY_AGO = new Date(now - 1 * 24 * 60 * 60 * 1000);

  // Scenario 1A: File age < 7 days (Young file, Uploaded & Printed) -> LOCKED by Key 1
  const youngFile = path.join(compositesDir, 'composite_young.jpg');
  fs.writeFileSync(youngFile, Buffer.alloc(1024, 0));
  fs.utimesSync(youngFile, ONE_DAY_AGO, ONE_DAY_AGO);

  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded)
    VALUES ('session_young', ?, '2R', 'none', '[]', ?, 'printed', 1, 1)
  `).run(ONE_DAY_AGO.toISOString(), youngFile);

  db.prepare(`
    INSERT INTO upload_queue (id, session_id, file_path, file_type, status, attempts, created_at, updated_at)
    VALUES ('upload_young', 'session_young', ?, 'composite', 'COMPLETED', 1, ?, ?)
  `).run(youngFile, ONE_DAY_AGO.toISOString(), ONE_DAY_AGO.toISOString());

  const eval1A = evaluateThreeKeyLock(youngFile, fs.statSync(youngFile), 7);
  console.log(`  1A: Young File (<7d, upload=COMPLETED, print=COMPLETED): canPurge = ${eval1A.canPurge} (${eval1A.reason})`);
  if (eval1A.canPurge !== false) throw new Error('Test 1A Failed: Young file should be preserved!');

  // Scenario 1B: File age > 7 days, but Upload is PENDING -> LOCKED by Key 2
  const oldPendingUpload = path.join(compositesDir, 'composite_pending_upload.jpg');
  fs.writeFileSync(oldPendingUpload, Buffer.alloc(1024, 0));
  fs.utimesSync(oldPendingUpload, TEN_DAYS_AGO, TEN_DAYS_AGO);

  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded)
    VALUES ('session_pending_up', ?, '2R', 'none', '[]', ?, 'printed', 0, 0)
  `).run(TEN_DAYS_AGO.toISOString(), oldPendingUpload);

  db.prepare(`
    INSERT INTO upload_queue (id, session_id, file_path, file_type, status, attempts, created_at, updated_at)
    VALUES ('upload_pending', 'session_pending_up', ?, 'composite', 'PENDING', 0, ?, ?)
  `).run(oldPendingUpload, TEN_DAYS_AGO.toISOString(), TEN_DAYS_AGO.toISOString());

  const eval1B = evaluateThreeKeyLock(oldPendingUpload, fs.statSync(oldPendingUpload), 7);
  console.log(`  1B: Old File (>7d, upload=PENDING): canPurge = ${eval1B.canPurge} (${eval1B.reason})`);
  if (eval1B.canPurge !== false || eval1B.key2_cloudUploaded !== false) {
    throw new Error('Test 1B Failed: Unuploaded file must NOT be purged!');
  }

  // Scenario 1C: File age > 7 days, Upload COMPLETED, but Print is PRINTING -> LOCKED by Key 3
  const oldActivePrint = path.join(compositesDir, 'composite_active_print.jpg');
  fs.writeFileSync(oldActivePrint, Buffer.alloc(1024, 0));
  fs.utimesSync(oldActivePrint, TEN_DAYS_AGO, TEN_DAYS_AGO);

  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded)
    VALUES ('session_active_print', ?, '2R', 'none', '[]', ?, 'printing', 1, 1)
  `).run(TEN_DAYS_AGO.toISOString(), oldActivePrint);

  db.prepare(`
    INSERT INTO upload_queue (id, session_id, file_path, file_type, status, attempts, created_at, updated_at)
    VALUES ('upload_active_print', 'session_active_print', ?, 'composite', 'COMPLETED', 1, ?, ?)
  `).run(oldActivePrint, TEN_DAYS_AGO.toISOString(), TEN_DAYS_AGO.toISOString());

  db.prepare(`
    INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, created_at, updated_at)
    VALUES ('print_job_active', 'session_active_print', ?, 'DNP RX1', 1, 'PRINTING', 1, ?, ?)
  `).run(oldActivePrint, TEN_DAYS_AGO.toISOString(), TEN_DAYS_AGO.toISOString());

  const eval1C = evaluateThreeKeyLock(oldActivePrint, fs.statSync(oldActivePrint), 7);
  console.log(`  1C: Old File (>7d, upload=COMPLETED, print=PRINTING): canPurge = ${eval1C.canPurge} (${eval1C.reason})`);
  if (eval1C.canPurge !== false || eval1C.key3_printSettled !== false) {
    throw new Error('Test 1C Failed: Active print job must lock file from purge!');
  }

  // Scenario 1D: File age > 7 days, Upload COMPLETED, Print COMPLETED -> UNLOCKED (All 3 Keys Passed!)
  const oldCompletedFile = path.join(compositesDir, 'composite_fully_completed.jpg');
  fs.writeFileSync(oldCompletedFile, Buffer.alloc(2048, 0));
  fs.utimesSync(oldCompletedFile, TEN_DAYS_AGO, TEN_DAYS_AGO);

  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded)
    VALUES ('session_completed', ?, '2R', 'none', '[]', ?, 'printed', 1, 1)
  `).run(TEN_DAYS_AGO.toISOString(), oldCompletedFile);

  db.prepare(`
    INSERT INTO upload_queue (id, session_id, file_path, file_type, status, attempts, created_at, updated_at)
    VALUES ('upload_completed', 'session_completed', ?, 'composite', 'COMPLETED', 1, ?, ?)
  `).run(oldCompletedFile, TEN_DAYS_AGO.toISOString(), TEN_DAYS_AGO.toISOString());

  db.prepare(`
    INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, created_at, updated_at)
    VALUES ('print_job_done', 'session_completed', ?, 'DNP RX1', 1, 'COMPLETED', 1, ?, ?)
  `).run(oldCompletedFile, TEN_DAYS_AGO.toISOString(), TEN_DAYS_AGO.toISOString());

  const eval1D = evaluateThreeKeyLock(oldCompletedFile, fs.statSync(oldCompletedFile), 7);
  console.log(`  1D: Old File (>7d, upload=COMPLETED, print=COMPLETED): canPurge = ${eval1D.canPurge} (${eval1D.reason})`);
  if (eval1D.canPurge !== true) {
    throw new Error('Test 1D Failed: Completed file older than 7 days must be safe to purge!');
  }
  console.log('  ✓ [PASS] TEST 1: Three-Key Safety Lock deterministically enforces all 3 conditions\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: ORPHAN & TRANSIENT JANITOR
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 2: ORPHAN & TRANSIENT JANITOR]');
  const TWO_HOURS_AGO = new Date(now - 2.5 * 60 * 60 * 1000);

  // Transient WebM older than 1 hour
  const oldWebm = path.join(videosDir, 'livephoto_abandoned_pose_1.webm');
  fs.writeFileSync(oldWebm, Buffer.alloc(5000, 0));
  fs.utimesSync(oldWebm, TWO_HOURS_AGO, TWO_HOURS_AGO);

  // Concat text manifest older than 1 hour
  const oldConcat = path.join(videosDir, 'gif_abandoned_concat.txt');
  fs.writeFileSync(oldConcat, 'file test.jpg\n');
  fs.utimesSync(oldConcat, TWO_HOURS_AGO, TWO_HOURS_AGO);

  // Untracked retake capture older than 2 hours
  const oldRetakeCapture = path.join(capturesDir, 'capture_retake_discarded.jpg');
  fs.writeFileSync(oldRetakeCapture, Buffer.alloc(8000, 0));
  fs.utimesSync(oldRetakeCapture, TWO_HOURS_AGO, TWO_HOURS_AGO);

  const janitorResult = runOrphanJanitor([capturesDir, videosDir]);
  console.log(`  Janitor Cleaned: ${janitorResult.cleanedCount} orphan files, Freed: ${janitorResult.freedBytes} bytes`);

  if (fs.existsSync(oldWebm)) throw new Error('Test 2 Failed: Abandoned WebM was not purged!');
  if (fs.existsSync(oldConcat)) throw new Error('Test 2 Failed: Concat manifest was not purged!');
  if (fs.existsSync(oldRetakeCapture)) throw new Error('Test 2 Failed: Untracked retake capture was not purged!');
  console.log('  ✓ [PASS] TEST 2: Orphan Janitor successfully purged transient WebMs, manifests, and retake discards\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: FULL RETENTION CLEANUP CYCLE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 3: FULL RETENTION CLEANUP CYCLE]');
  const cleanupResult = runRetentionCleanupNow({
    mediaDirectories: [capturesDir, compositesDir, videosDir],
    retentionDays: 7,
    minFreeDiskGb: 0, // Normal retention run
  });

  console.log(`  Scanned: ${cleanupResult.scannedFiles}, Purged: ${cleanupResult.purgedFiles}, Skipped Uncompleted: ${cleanupResult.skippedUncompletedFiles}, Skipped Active Print: ${cleanupResult.skippedActivePrintFiles}`);

  if (fs.existsSync(oldCompletedFile)) throw new Error('Test 3 Failed: 10-day completed file was not purged!');
  if (!fs.existsSync(youngFile)) throw new Error('Test 3 Failed: Young file was incorrectly deleted!');
  if (!fs.existsSync(oldPendingUpload)) throw new Error('Test 3 Failed: Pending upload file was incorrectly deleted!');
  if (!fs.existsSync(oldActivePrint)) throw new Error('Test 3 Failed: Active print file was incorrectly deleted!');

  // Verify SQLite session record updated to PRUNED
  const sRow = db.prepare("SELECT local_storage_state FROM sessions WHERE id = 'session_completed'").get() as any;
  console.log(`  Session 'session_completed' local_storage_state: ${sRow?.local_storage_state}`);
  if (sRow?.local_storage_state !== 'PRUNED') {
    throw new Error('Test 3 Failed: Session was not marked PRUNED in SQLite!');
  }
  console.log('  ✓ [PASS] TEST 3: Full cleanup cycle purged expired media and marked SQLite state PRUNED\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: CLOUD REHYDRATION FOR REPRINTS
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 4: CLOUD REHYDRATION FOR REPRINTS]');
  // Simulate mock server or data URI download
  const prunedCompositePath = path.join(compositesDir, 'composite_pruned_session.jpg');
  const mockImageContent = Buffer.alloc(2048, 42);

  // Start temporary mock HTTP server for rehydration test
  const http = await import('http');
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': mockImageContent.length });
    res.end(mockImageContent);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const port = (mockServer.address() as any).port;
  const mockR2Url = `http://127.0.0.1:${port}/sessions/rehydrate_test/composite.jpg`;

  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, remote_url, print_status, synced, uploaded)
    VALUES ('session_rehydrate', ?, '2R', 'none', '[]', ?, ?, 'printed', 1, 1)
  `).run(TEN_DAYS_AGO.toISOString(), prunedCompositePath, mockR2Url);

  // Verify file does NOT exist currently
  if (fs.existsSync(prunedCompositePath)) fs.unlinkSync(prunedCompositePath);
  console.log(`  Pre-rehydration: File exists = ${fs.existsSync(prunedCompositePath)}`);

  // Call ensureCompositeOnDisk
  const rehydratedPath = await ensureCompositeOnDisk('session_rehydrate', prunedCompositePath);
  console.log(`  Rehydrated Path: ${rehydratedPath}`);
  console.log(`  Post-rehydration: File exists = ${fs.existsSync(prunedCompositePath)}`);

  mockServer.close();

  if (!rehydratedPath || !fs.existsSync(prunedCompositePath)) {
    throw new Error('Test 4 Failed: Rehydration did not restore composite from cloud URL!');
  }
  console.log('  ✓ [PASS] TEST 4: Cloud Rehydration successfully restored missing local composite for reprint\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: DATABASE COMPACTION (WAL CHECKPOINT)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 5: DATABASE WAL COMPACTION]');
  const compactionResult = runDatabaseCompaction();
  console.log(`  Compaction Result: ${JSON.stringify(compactionResult)}`);
  if (!compactionResult.success) {
    throw new Error('Test 5 Failed: WAL compaction failed!');
  }
  console.log('  ✓ [PASS] TEST 5: SQLite WAL compaction and checkpoint executed cleanly\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: EMERGENCY LOW-DISK WATERFALL (< 5GB)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('[TEST 6: EMERGENCY LOW-DISK PRIORITY WATERFALL]');
  const THREE_DAYS_AGO = new Date(now - 3 * 24 * 60 * 60 * 1000);

  // Raw photo older than 48h (3 days old)
  const emergencyRaw = path.join(capturesDir, 'photo_emergency_raw.jpg');
  fs.writeFileSync(emergencyRaw, Buffer.alloc(4096, 1));
  fs.utimesSync(emergencyRaw, THREE_DAYS_AGO, THREE_DAYS_AGO);

  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status, synced, uploaded)
    VALUES ('session_emergency', ?, '2R', 'none', '[]', NULL, 'printed', 1, 1)
  `).run(THREE_DAYS_AGO.toISOString());

  db.prepare(`
    INSERT INTO upload_queue (id, session_id, file_path, file_type, status, attempts, created_at, updated_at)
    VALUES ('upload_emerg_raw', 'session_emergency', ?, 'raw', 'COMPLETED', 1, ?, ?)
  `).run(emergencyRaw, THREE_DAYS_AGO.toISOString(), THREE_DAYS_AGO.toISOString());

  // Run cleanup with minFreeDiskGb = 9999 to simulate low disk space!
  const emergencyResult = runRetentionCleanupNow({
    mediaDirectories: [capturesDir, compositesDir, videosDir],
    retentionDays: 7, // Even though normal retention is 7d, emergency waterfall targets completed files >48h
    minFreeDiskGb: 9999, // Force emergency purge condition
  });

  console.log(`  Emergency Purged Files: ${emergencyResult.purgedFiles}, Freed: ${emergencyResult.freedFormatted}`);
  if (fs.existsSync(emergencyRaw)) {
    throw new Error('Test 6 Failed: Completed raw photo older than 48h was not purged under emergency disk pressure!');
  }
  console.log('  ✓ [PASS] TEST 6: Emergency Priority Waterfall successfully freed disk space from completed >48h assets\n');

  // Cleanup test environment
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   ALL 6 TESTS PASSED: PHASE 3.2C IMPLEMENTATION IS 100% VERIFIED!    ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
}

runStorageRetentionTests().catch((err) => {
  console.error('\n❌ PHASE 3.2C TEST SUITE FAILED:', err);
  process.exit(1);
});
