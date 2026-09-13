import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';
import {
  initRecoveryLedger,
  recordPaymentSettled,
  updateRecoveryCheckpoint,
  getActiveRecoverableSession,
  markLedgerRecovered,
  markLedgerCompleted,
  markLedgerAbandoned,
  generateRescueVoucher,
  expireStaleLedgerEntries,
  isPathTrackedInActiveLedger,
} from './RecoveryLedgerService';

/**
 * Automated Verification Suite for Phase 3.2D Crash Recovery Ledger & Resiliency
 */

async function runCrashRecoveryTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('   PICTOLABS PHASE 3.2D: CRASH RECOVERY LEDGER & RESILIENCY TESTS     ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pictolabs-recovery-test-'));
  const testDbFile = path.join(testTempDir, 'test_kiosk.db');
  const testCapturesDir = path.join(testTempDir, 'captures');
  fs.mkdirSync(testCapturesDir, { recursive: true });

  const testDb = new Database(testDbFile);
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('synchronous = NORMAL');

  // Initialize service with isolated test database
  initRecoveryLedger(testDb);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, message: string) {
    totalTests++;
    if (!condition) {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`  ✓ ${message}`);
      passedTests++;
    }
  }

  try {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Payment Settlement Journaling
    // ─────────────────────────────────────────────────────────────
    console.log('[TEST 1: PAYMENT SETTLEMENT JOURNALING]');
    const session1 = `session_paid_${Date.now()}`;
    const order1 = `ORDER_QRIS_001`;

    const recordRes = recordPaymentSettled(session1, order1, {
      price: 35000,
      productName: 'Photostrip 2R Minimalist',
      frameId: '2R',
    });

    assert(recordRes.success === true, 'Payment settlement recorded successfully');

    const active1 = getActiveRecoverableSession();
    assert(active1 !== null, 'Active recoverable session detected on boot');
    assert(active1?.sessionId === session1, `Session ID matches: ${active1?.sessionId}`);
    assert(active1?.stage === 'PAYMENT_SETTLED', `Stage is PAYMENT_SETTLED`);
    assert(active1?.targetScreen === 'frame-design', `Target screen resolved to frame-design`);
    assert(active1?.payload.price === 35000, 'Price correctly preserved in ledger payload');
    console.log('  ✓ [PASS] TEST 1: Payment Settlement Journaling verified\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Mid-Capture Incremental Pose Checkpointing
    // ─────────────────────────────────────────────────────────────
    console.log('[TEST 2: MID-CAPTURE INCREMENTAL CHECKPOINTING]');
    const photo1Path = path.join(testCapturesDir, 'capture_pose_1.jpg');
    const photo2Path = path.join(testCapturesDir, 'capture_pose_2.jpg');
    fs.writeFileSync(photo1Path, Buffer.alloc(2048, 'x')); // 2KB valid photo
    fs.writeFileSync(photo2Path, Buffer.alloc(2048, 'y')); // 2KB valid photo

    // Frame selected
    updateRecoveryCheckpoint(session1, 'FRAME_SELECTED', 0, {
      frameDesignId: 'noir-black',
      frameDesignName: 'Cinematic Noir',
    });

    let activeCheck = getActiveRecoverableSession();
    assert(activeCheck?.stage === 'FRAME_SELECTED', 'Stage updated to FRAME_SELECTED');
    assert(activeCheck?.targetScreen === 'capture', 'Target screen resolved to capture');

    // Pose 1 captured
    updateRecoveryCheckpoint(session1, 'CAPTURING', 1, {
      photos: [photo1Path],
    });

    activeCheck = getActiveRecoverableSession();
    assert(activeCheck?.stage === 'CAPTURING', 'Stage updated to CAPTURING');
    assert(activeCheck?.lastCompletedStep === 1, 'lastCompletedStep is 1');
    assert(activeCheck?.payload.photos?.length === 1, '1 photo checkpointed');

    // Pose 2 captured
    updateRecoveryCheckpoint(session1, 'CAPTURING', 2, {
      photos: [photo1Path, photo2Path],
    });

    activeCheck = getActiveRecoverableSession();
    assert(activeCheck?.lastCompletedStep === 2, 'lastCompletedStep is 2');
    assert(activeCheck?.payload.photos?.length === 2, '2 photos checkpointed');

    // Retake pose 2 (discard photo 2)
    updateRecoveryCheckpoint(session1, 'CAPTURING', 1, {
      photos: [photo1Path],
    });

    activeCheck = getActiveRecoverableSession();
    assert(activeCheck?.lastCompletedStep === 1, 'lastCompletedStep rolled back to 1 after retake');
    assert(activeCheck?.payload.photos?.length === 1, '1 photo remaining after retake checkpoint');
    console.log('  ✓ [PASS] TEST 2: Incremental pose checkpointing and retake rollback verified\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Path Tracking for Active Ledger (Janitor Protection)
    // ─────────────────────────────────────────────────────────────
    console.log('[TEST 3: ACTIVE LEDGER FILE PROTECTION (ORPHAN JANITOR)]');
    const isPhoto1Tracked = isPathTrackedInActiveLedger(photo1Path);
    const isUntrackedPhotoTracked = isPathTrackedInActiveLedger(path.join(testCapturesDir, 'unrelated_orphan.jpg'));

    assert(isPhoto1Tracked === true, 'photo1 is tracked in active ledger (protected from Janitor)');
    assert(isUntrackedPhotoTracked === false, 'unrelated photo is correctly recognized as not tracked in ledger');
    console.log('  ✓ [PASS] TEST 3: Active ledger photo protection verified\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Render Crash Resumption
    // ─────────────────────────────────────────────────────────────
    console.log('[TEST 4: RENDER CRASH RESUMPTION]');
    const sessionRender = `session_render_${Date.now()}`;
    recordPaymentSettled(sessionRender, 'ORDER_RENDER_002', { price: 35000 });
    updateRecoveryCheckpoint(sessionRender, 'RENDER_PENDING', 3, {
      photos: [photo1Path, photo2Path],
      filter: 'vintage',
      frameId: 'classic-white',
    });

    const activeRender = getActiveRecoverableSession();
    assert(activeRender?.sessionId === sessionRender, 'Most recent active session selected');
    assert(activeRender?.stage === 'RENDER_PENDING', 'Stage is RENDER_PENDING');
    assert(activeRender?.targetScreen === 'render', 'Target screen is render');
    console.log('  ✓ [PASS] TEST 4: Render crash resumption verified\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Circuit Breaker Loop Prevention & Rescue Voucher
    // ─────────────────────────────────────────────────────────────
    console.log('[TEST 5: CIRCUIT BREAKER LOOP PREVENTION & RESCUE VOUCHER]');
    // Simulate repeated crash recovery attempts
    markLedgerRecovered(sessionRender); // Attempt 1
    markLedgerRecovered(sessionRender); // Attempt 2 (Exceeds max)

    const circuitCheck = getActiveRecoverableSession();
    assert(circuitCheck === null || circuitCheck.sessionId !== sessionRender, 'Circuit breaker blocked repeated crash loop for sessionRender');

    // Verify sessionRender was marked ABANDONED
    const row = testDb.prepare('SELECT status, error_details FROM session_recovery_ledger WHERE session_id = ?').get(sessionRender) as any;
    assert(row?.status === 'ABANDONED', 'Session marked ABANDONED after 2 failed recovery attempts');

    // Generate cryptographic rescue voucher
    const voucher = generateRescueVoucher(sessionRender, 'HARDWARE_CIRCUIT_BREAKER');
    assert(voucher.success === true, 'Rescue voucher issued successfully');
    assert(voucher.voucherCode.startsWith('VOUCH-B01-'), `Voucher code format valid: ${voucher.voucherCode}`);
    assert(typeof voucher.signature === 'string' && voucher.signature.length === 64, 'HMAC-SHA256 signature generated');
    assert(voucher.amount === 35000, 'Voucher amount matches paid transaction (35000)');
    console.log('  ✓ [PASS] TEST 5: Circuit breaker and rescue voucher verified\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 6: 15-Minute Expiration Janitor
    // ─────────────────────────────────────────────────────────────
    console.log('[TEST 6: 15-MINUTE EXPIRATION JANITOR]');
    const sessionStale = `session_stale_${Date.now()}`;
    const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes ago
    testDb.prepare(`
      INSERT INTO session_recovery_ledger (
        id, session_id, status, stage, last_completed_step, payload, recovery_attempts, expires_at, created_at, updated_at
      ) VALUES (?, ?, 'ACTIVE', 'CAPTURING', 1, '{}', 0, ?, ?, ?)
    `).run(`ledger_${sessionStale}`, sessionStale, pastDate, pastDate, pastDate);

    const expiredCount = expireStaleLedgerEntries();
    assert(expiredCount >= 1, `Expired ${expiredCount} stale session(s) past 15-minute TTL`);

    const staleRow = testDb.prepare('SELECT status FROM session_recovery_ledger WHERE session_id = ?').get(sessionStale) as any;
    assert(staleRow?.status === 'ABANDONED', 'Stale session transitioned to ABANDONED');
    console.log('  ✓ [PASS] TEST 6: 15-minute expiration janitor verified\n');

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Normal Session Completion
    // ─────────────────────────────────────────────────────────────
    console.log('[TEST 7: NORMAL SESSION COMPLETION]');
    markLedgerCompleted(session1);
    const compRow = testDb.prepare('SELECT status, stage FROM session_recovery_ledger WHERE session_id = ?').get(session1) as any;
    assert(compRow?.status === 'COMPLETED', 'Session 1 status marked COMPLETED');
    assert(compRow?.stage === 'COMPLETED', 'Session 1 stage marked COMPLETED');

    const activeAfterComp = getActiveRecoverableSession();
    assert(activeAfterComp === null, 'No active recoverable sessions remaining');
    console.log('  ✓ [PASS] TEST 7: Normal session completion verified\n');

    console.log('═══════════════════════════════════════════════════════════════════════');
    console.log(`   ALL ${passedTests}/${totalTests} ASSERTIONS PASSED (100% SUCCESS)`);
    console.log('   PHASE 3.2D CRASH RECOVERY LEDGER DETERMINISTICALLY VERIFIED!        ');
    console.log('═══════════════════════════════════════════════════════════════════════');
  } finally {
    try {
      testDb.close();
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

runCrashRecoveryTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
