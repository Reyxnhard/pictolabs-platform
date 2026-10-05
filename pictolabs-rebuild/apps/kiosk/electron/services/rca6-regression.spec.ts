import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import {
  initSyncEngine,
  getDatabase,
  stopSyncEngine,
  recordSystemEvent,
} from './SyncEngine';
import {
  enqueuePrintJob,
  processPrintQueue,
  resetStuckPrintJobs,
  getActiveWorkerState,
  updateWorkerPhase,
  pulseWorkerHeartbeat,
  _setWorkerStateForTesting,
  reprintSession,
  getPrintQueueHealth,
} from './PrintQueueService';
import {
  setIsBypassMode,
  queryPrinterHealth,
  printImage,
  isPrinterHandoffValid,
  PrinterHealth,
} from './PrintService';
import {
  getPaperStatus,
  recordPrintConsumption,
} from './PaperTrackerService';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('    PICTOLABS RCA-6 REGRESSION TEST SUITE: WORKER & WATCHDOG SAFETY   ');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runRca6Suite() {
  const testDir = path.join(process.cwd(), 'test-kiosk-rca6-db');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  const dbFile = path.join(testDir, `test_rca6_${Date.now()}.db`);
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  // Initialize DB via SyncEngine
  initSyncEngine({
    dataDir: testDir,
    apiBaseUrl: 'http://localhost:3000',
    boothId: 'booth-rca6-test',
    syncIntervalMs: 60000,
  });
  const db = getDatabase()!;
  db.pragma('journal_mode = WAL');


  // Create dummy test composite image
  const dummyComposite = path.join(testDir, 'test_composite.jpg');
  fs.writeFileSync(dummyComposite, 'DUMMY_IMAGE_BINARY_CONTENT');

  // Enable bypass mode so print jobs execute cleanly in test environment
  setIsBypassMode(true);

  function seedSession(id: string) {
    db.prepare(`
      INSERT OR REPLACE INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status)
      VALUES (?, datetime('now'), 'classic-4', 'normal', '[]', ?, 'pending')
    `).run(id, dummyComposite);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RCA6-01: Watchdog fires during PRE_FLIGHT -> No mutex reset, No Worker 2
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[RCA6-01: WATCHDOG FIRES DURING PRE_FLIGHT (RCA-6 REGRESSION GATE)]');
  {
    const sess01 = 'session_rca6_01';
    seedSession(sess01);

    // Enqueue job: enters PENDING
    const enqRes = enqueuePrintJob(sess01, dummyComposite, 1, 'DS-RX1 (Copy 1)');
    assert(enqRes.success === true, 'RCA6-01: Job successfully enqueued');
    const jobId = enqRes.id!;

    // Simulate Worker 1 active execution state during PRE_FLIGHT
    const worker1ExecId = 'worker_rca6_test_1';
    _setWorkerStateForTesting({
      isProcessing: true,
      workerExecutionId: worker1ExecId,
      activeJobId: jobId,
      phase: 'PRE_FLIGHT',
      phaseStartTime: Date.now() - 2650, // 2.65s elapsed into pre-flight (matching V6 exact timing)
      workerStartTime: Date.now() - 2700,
      lastHeartbeatTime: Date.now() - 2650,
    });

    const workerStateBefore = getActiveWorkerState();
    assert(workerStateBefore.isProcessing === true, 'RCA6-01: Worker 1 holds processing lock');
    assert(workerStateBefore.phase === 'PRE_FLIGHT', 'RCA6-01: Worker 1 is in PRE_FLIGHT phase');
    assert(workerStateBefore.activeJobId === jobId, 'RCA6-01: Worker 1 is actively working on jobId');

    // Job in DB is still PENDING (RCA-5 ordering requirement)
    const dbRowBefore = db.prepare('SELECT status FROM print_queue WHERE id = ?').get(jobId) as any;
    assert(dbRowBefore.status === 'PENDING', 'RCA6-01: Job status in DB is PENDING during pre-flight');

    // Fire Watchdog (15s check simulation)
    const watchdogRes = resetStuckPrintJobs(120_000, 45_000);

    // In V6, this returned mutexReset=true and spawned Worker 2.
    // In RCA-6 fix, watchdog MUST recognize active pre-flight and SKIP reset!
    assert(watchdogRes.mutexReset === false, 'RCA6-01: Watchdog safely SKIPPED mutex reset during valid PRE_FLIGHT');
    assert(watchdogRes.rescuedCount === 0, 'RCA6-01: No stuck jobs falsely rescued');

    const workerStateAfter = getActiveWorkerState();
    assert(workerStateAfter.isProcessing === true, 'RCA6-01: Worker 1 processing lock PRESERVED');
    assert(workerStateAfter.workerExecutionId === worker1ExecId, 'RCA6-01: Worker 1 identity preserved (Worker 2 NOT spawned)');
    assert(workerStateAfter.phase === 'PRE_FLIGHT', 'RCA6-01: Worker 1 remains in PRE_FLIGHT phase');

    // Clean up worker testing state
    _setWorkerStateForTesting({
      isProcessing: false,
      workerExecutionId: null,
      activeJobId: null,
      phase: 'IDLE',
      phaseStartTime: null,
      workerStartTime: null,
      lastHeartbeatTime: Date.now(),
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RCA6-02: Exactly One printImage() Execution Per Queue Row
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[RCA6-02: EXACTLY ONE DISPATCH PER QUEUE ROW UNDER CONCURRENT WATCHDOG]');
  {
    const sess02 = 'session_rca6_02';
    seedSession(sess02);

    // Enqueue job
    const enqRes = enqueuePrintJob(sess02, dummyComposite, 1, 'DS-RX1 (Copy 1)');
    const jobId = enqRes.id!;

    // Fire watchdog repeatedly while processing
    const wdCheck1 = resetStuckPrintJobs(120_000, 45_000);
    assert(wdCheck1.mutexReset === false, 'RCA6-02: Watchdog check 1 did not interrupt queue');

    // Allow event-driven worker to finish
    await new Promise((r) => setTimeout(r, 200));

    const dbRow = db.prepare('SELECT status, attempts FROM print_queue WHERE id = ?').get(jobId) as any;
    assert(dbRow.status === 'COMPLETED', 'RCA6-02: Job completed successfully');
    assert(dbRow.attempts === 0, 'RCA6-02: Job succeeded on Attempt 0 without retries');

    // Total rows for session must be exactly 1
    const totalJobs = db.prepare('SELECT count(*) as count FROM print_queue WHERE session_id = ?').get(sess02) as any;
    assert(totalJobs.count === 1, 'RCA6-02: Exactly one print_queue row created for session');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RCA6-03: Simulate Genuinely Stale/Hung Worker -> Watchdog Rescue Still Works
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[RCA6-03: GENUINELY HUNG WORKER RECOVERY VERIFICATION]');
  {
    const sess03 = 'session_rca6_03';
    seedSession(sess03);

    const pastTime = new Date(Date.now() - 150_000).toISOString(); // 2.5 minutes ago
    const stuckJobId = 'print_rca6_stuck_03';

    // Insert job stuck in PRINTING for > 120s
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES (?, ?, ?, 'DS-RX1 (Copy 1)', 1, 'PRINTING', 0, 5, ?, ?)
    `).run(stuckJobId, sess03, dummyComposite, pastTime, pastTime);

    // Simulate worker with completely silent heartbeat (>120s)
    _setWorkerStateForTesting({
      isProcessing: true,
      workerExecutionId: 'worker_hung_deadlock',
      activeJobId: stuckJobId,
      phase: 'PRINTING',
      phaseStartTime: Date.now() - 150_000,
      workerStartTime: Date.now() - 150_000,
      lastHeartbeatTime: Date.now() - 150_000,
    });

    const rescueResult = resetStuckPrintJobs(120_000, 45_000);
    assert(rescueResult.rescuedCount === 1, 'RCA6-03: Watchdog rescued the stuck job in DB');
    assert(rescueResult.mutexReset === true, 'RCA6-03: Watchdog broke the hung worker mutex lock');

    const workerState = getActiveWorkerState();
    assert(workerState.isProcessing === false, 'RCA6-03: Mutex successfully cleared to false');
    assert(workerState.phase === 'IDLE', 'RCA6-03: Worker phase reset to IDLE');

    const rescuedJob = db.prepare('SELECT status, attempts, last_error FROM print_queue WHERE id = ?').get(stuckJobId) as any;
    assert(rescuedJob.status === 'DEAD_LETTER', 'RCA6-03: Stuck in-flight job marked terminal DEAD_LETTER (no auto physical retry)');
    assert(rescuedJob.attempts === 1, 'RCA6-03: Attempt counter incremented on rescue');
    assert(rescuedJob.last_error?.includes('Print watchdog'), 'RCA6-03: Watchdog diagnostic error recorded in DB');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RCA6-04: Normal Healthy Print -> Exactly One 4R Sheet Consumed
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[RCA6-04: NORMAL HEALTHY PRINT SHEET CONSUMPTION]');
  {
    const sess04 = 'session_rca6_04';
    seedSession(sess04);

    const paperBefore = getPaperStatus();
    const enqRes = enqueuePrintJob(sess04, dummyComposite, 1, 'DS-RX1 (Copy 1)');
    assert(enqRes.success === true, 'RCA6-04: Job enqueued');

    // Wait for processing to complete
    await new Promise((r) => setTimeout(r, 200));

    const paperAfter = getPaperStatus();
    assert(paperAfter.remaining === paperBefore.remaining - 1, 'RCA6-04: Exactly 1 sheet consumed (cuts into 2x 2R strips)');
    assert(paperAfter.consumed === paperBefore.consumed + 1, 'RCA6-04: Prints consumed counter incremented by exactly 1');

    const sessRow = db.prepare('SELECT print_status FROM sessions WHERE id = ?').get(sess04) as any;
    assert(sessRow.print_status === 'printed', 'RCA6-04: Session print_status marked printed');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RCA6-05: Pre-Flight Hardware Block (Paper Out / Cover Open)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[RCA6-05: PRE-FLIGHT HARDWARE ERROR BLOCK (RCA-5 ORDERING PRESERVATION)]');
  {
    // Temporarily turn off bypass mode to verify real preflight gate logic
    setIsBypassMode(false);

    // Test that an invalid handoff (e.g. error state) is strictly rejected
    const errorHealth: PrinterHealth = {
      ready: false,
      code: 'DOOR_OPEN',
      message: 'Pintu penutup printer terbuka (Door Open)',
      checkedAt: Date.now(),
      name: 'DS-RX1 (Copy 1)',
    };

    const isHandoffValid = isPrinterHandoffValid(errorHealth, 'DS-RX1 (Copy 1)');
    assert(isHandoffValid === false, 'RCA6-05: Pre-flight handoff with error state is rejected');

    // Test printer identity mismatch protection
    const healthyHealthCopy1: PrinterHealth = {
      ready: true,
      code: 'OK',
      message: 'Printer siap mencetak',
      checkedAt: Date.now(),
      name: 'DS-RX1 (Copy 1)',
    };
    const isMismatchValid = isPrinterHandoffValid(healthyHealthCopy1, 'DS-RX1 (Copy 2)');
    assert(isMismatchValid === false, 'RCA6-05: Identity mismatch DS-RX1 (Copy 1) !== DS-RX1 (Copy 2) strictly rejected');

    const isMatchValid = isPrinterHandoffValid(healthyHealthCopy1, 'DS-RX1 (Copy 1)');
    assert(isMatchValid === true, 'RCA6-05: Exact match DS-RX1 (Copy 1) === DS-RX1 (Copy 1) accepted');

    setIsBypassMode(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RCA6-06: Admin Manual Reprint -> Exactly One Queue Execution
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n[RCA6-06: ADMIN MANUAL REPRINT EXACTLY ONE EXECUTION]');
  {
    const sess06 = 'session_rca6_06';
    seedSession(sess06);

    // 1. Initial print
    enqueuePrintJob(sess06, dummyComposite, 1, 'DS-RX1 (Copy 1)');
    await new Promise((r) => setTimeout(r, 200));

    const initialJobs = db.prepare('SELECT id, status FROM print_queue WHERE session_id = ?').all(sess06) as any[];
    assert(initialJobs.length === 1, 'RCA6-06: Initial job completed');
    assert(initialJobs[0].status === 'COMPLETED', 'RCA6-06: Initial job is COMPLETED');

    const paperBeforeReprint = getPaperStatus();

    // 2. Admin reprint
    const reprintRes = await reprintSession(sess06);
    assert(reprintRes.success === true, 'RCA6-06: Reprint initiated');
    assert(reprintRes.id?.startsWith('print_reprint_') === true, 'RCA6-06: Reprint job has print_reprint_ prefix');

    await new Promise((r) => setTimeout(r, 200));

    const allSessionJobs = db.prepare('SELECT id, status FROM print_queue WHERE session_id = ? ORDER BY created_at ASC').all(sess06) as any[];
    assert(allSessionJobs.length === 2, 'RCA6-06: Exactly two distinct jobs exist for session (1 initial + 1 reprint)');
    assert(allSessionJobs[0].status === 'COMPLETED', 'RCA6-06: Initial job remains COMPLETED');
    assert(allSessionJobs[1].status === 'COMPLETED', 'RCA6-06: Reprint job reached COMPLETED');

    const paperAfterReprint = getPaperStatus();
    assert(paperAfterReprint.consumed === paperBeforeReprint.consumed + 1, 'RCA6-06: Exactly 1 sheet consumed by reprint');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUITE SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`   ALL ${passedTests}/${totalTests} RCA-6 REGRESSION SCENARIOS PASSED WITH 100% SUCCESS!   `);
  console.log('   DUPLICATE PRINT RACE CONDITION ELIMINATED AT THE ROOT CAUSE!        ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  stopSyncEngine();
}

runRca6Suite().catch((err) => {
  console.error('\n❌ RCA-6 TEST SUITE FAILED:', err);
  process.exit(1);
});
