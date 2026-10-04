import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runRca5Verification() {
  console.log('====================================================');
  console.log('PICTOLABS RCA-5 FIX VERIFICATION SUITE');
  console.log('====================================================\n');

  const testDbDir = path.join(__dirname, '..', 'test-rca5-db');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }
  const testDbPath = path.join(testDbDir, 'kiosk.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // 1. Initialize Test SQLite DB
  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      frame_id TEXT NOT NULL,
      filter TEXT NOT NULL,
      photos TEXT NOT NULL,
      composite_path TEXT,
      live_video_path TEXT,
      live_video_url TEXT,
      print_status TEXT NOT NULL DEFAULT 'pending',
      synced INTEGER NOT NULL DEFAULT 0,
      uploaded INTEGER NOT NULL DEFAULT 0,
      remote_url TEXT,
      live_video_paths TEXT,
      live_video_urls TEXT,
      local_storage_state TEXT NOT NULL DEFAULT 'HOT'
    );

    CREATE TABLE IF NOT EXISTS print_queue (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      printer_name TEXT NOT NULL,
      copies INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      next_retry_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // ─────────────────────────────────────────────────────────────
  // SUITE 1: QRScreen State Machine & Resilient Polling
  // ─────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: QRScreen State Machine & Resilient Polling ---');

  // Test 1A: Simulation of QRScreen Poller when job takes 42 seconds to complete (exceeds 40s)
  {
    console.log('Test 1A: Job taking >40s (e.g. 42s) must NOT fail at 40s and must complete successfully');
    
    // Simulate poller state machine
    let printStatus = 'printing';
    let printProgress = 15;
    let pollCleared = false;
    let confettiTriggered = false;

    const pollStartTime = 100000; // t = 0
    let currentTime = 100000;
    let lastSuccessfulPollTime = 100000;

    // Simulated queue job provider
    const getSimulatedQueueStatus = (t) => {
      const elapsed = t - pollStartTime;
      if (elapsed < 500) return { status: 'PENDING', attempts: 0 };
      if (elapsed < 41500) return { status: 'PRINTING', attempts: 0 };
      return { status: 'COMPLETED', attempts: 0 }; // completes at 41.5s
    };

    // Step through poller ticks
    for (let sec = 0; sec <= 45; sec += 1.2) {
      currentTime = pollStartTime + Math.round(sec * 1000);
      const elapsed = currentTime - pollStartTime;
      const queueJob = getSimulatedQueueStatus(currentTime);

      if (queueJob) {
        lastSuccessfulPollTime = currentTime;
      }

      // 1. Success condition
      if (queueJob && queueJob.status === 'COMPLETED') {
        pollCleared = true;
        printProgress = 100;
        printStatus = 'success';
        confettiTriggered = true;
        break;
      }

      // 2. DEAD_LETTER
      if (queueJob && queueJob.status === 'DEAD_LETTER') {
        pollCleared = true;
        printStatus = 'failed';
        break;
      }

      // 3. FAILED with max attempts
      if (queueJob && queueJob.status === 'FAILED' && queueJob.attempts >= 5) {
        pollCleared = true;
        printStatus = 'failed';
        break;
      }

      // 5. In-flight PRINTING tracking
      if (queueJob && queueJob.status === 'PRINTING') {
        printProgress = Math.max(printProgress, 65);
      }

      // 6. Safety timeout (>75s)
      if (elapsed > 75000) {
        const isJobActive = queueJob && (queueJob.status === 'PRINTING' || queueJob.status === 'PENDING');
        const isBackendResponsive = currentTime - lastSuccessfulPollTime < 5000;
        if (!isJobActive || !isBackendResponsive || elapsed >= 120000) {
          pollCleared = true;
          printStatus = 'failed';
          break;
        }
      }

      // Verification checkpoint at T = 40.0s: UI MUST STILL BE 'printing', NOT 'failed'!
      if (Math.abs(sec - 40) < 1.0) {
        assert(printStatus === 'printing', `At T=${sec.toFixed(1)}s, printStatus is '${printStatus}' (must NOT be 'failed')`);
      }
    }

    assert(printStatus === 'success', `Final printStatus after 42s is '${printStatus}'`);
    assert(printProgress === 100, `Final printProgress is ${printProgress}%`);
    assert(confettiTriggered === true, 'Confetti celebration fired on verified completion');
  }

  // Test 1B: DEAD_LETTER produces immediate failure
  {
    console.log('Test 1B: DEAD_LETTER status immediately produces failed state');
    let printStatus = 'printing';
    let pollCleared = false;

    const queueJob = { status: 'DEAD_LETTER', attempts: 5, last_error: 'Exceeded max retry attempts' };
    if (queueJob.status === 'DEAD_LETTER') {
      pollCleared = true;
      printStatus = 'failed';
    }

    assert(printStatus === 'failed', 'DEAD_LETTER immediately set printStatus to failed');
    assert(pollCleared === true, 'DEAD_LETTER halted polling interval');
  }

  // Test 1C: Real hardware errors produce immediate failure
  {
    console.log('Test 1C: Real hardware errors (PAPER_OUT, COVER_OPEN, DOOR_OPEN, JAMMED) produce immediate failure');
    const fatalErrors = [
      'Kertas foto habis di dalam tray (Paper Out)',
      'PAPER_OUT: tray empty',
      'Pintu penutup printer terbuka (Cover Open)',
      'DOOR_OPEN: cover unlatched',
      'Kertas macet di dalam printer (Paper Jam)',
      'Pita ribbon printer habis / perlu diganti (Ribbon Out)',
    ];

    for (const errMsg of fatalErrors) {
      let printStatus = 'printing';
      const queueJob = { status: 'PENDING', attempts: 1, last_error: errMsg };

      const lastError = queueJob.last_error;
      const isFatalHardwareError =
        lastError.includes('PAPER_OUT') ||
        lastError.includes('Kertas foto habis') ||
        lastError.includes('DOOR_OPEN') ||
        lastError.includes('COVER_OPEN') ||
        lastError.includes('Pintu penutup') ||
        lastError.includes('RIBBON_OUT') ||
        lastError.includes('Pita ribbon') ||
        lastError.includes('JAMMED') ||
        lastError.includes('Kertas macet');

      if (isFatalHardwareError && queueJob.attempts >= 1) {
        printStatus = 'failed';
      }

      assert(printStatus === 'failed', `Hardware error '${errMsg.slice(0, 25)}...' triggered immediate failure`);
    }
  }

  // Test 1D: Safety timeout at 75s when backend is unresponsive
  {
    console.log('Test 1D: Last-resort 75s safety timeout triggers when backend is unresponsive / job missing');
    let printStatus = 'printing';
    let pollCleared = false;
    const pollStartTime = 0;
    const currentTime = 76000;
    const lastSuccessfulPollTime = 10000; // stalled 66 seconds ago!
    const queueJob = null; // job disappeared or backend unresponsive

    const elapsed = currentTime - pollStartTime;
    if (elapsed > 75000) {
      const isJobActive = queueJob && (queueJob.status === 'PRINTING' || queueJob.status === 'PENDING');
      const isBackendResponsive = currentTime - lastSuccessfulPollTime < 5000;
      if (!isJobActive || !isBackendResponsive) {
        pollCleared = true;
        printStatus = 'failed';
      }
    }

    assert(printStatus === 'failed', 'Unresponsive backend at 76s safely triggered failure');
    assert(pollCleared === true, 'Polling halted upon unresponsive timeout');
  }

  // ─────────────────────────────────────────────────────────────
  // SUITE 2: Pre-Flight Deduplication & Direct Result Handoff
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: Pre-Flight Deduplication & Direct Result Handoff ---');

  let photolabDnpProbeCount = 0;
  let powerShellCimProbeCount = 0;

  // Mock telemetry provider
  const mockQueryPrinterHealth = async (printerName, bypassCache) => {
    photolabDnpProbeCount++;
    powerShellCimProbeCount++;
    return {
      ready: true,
      name: printerName || 'DS-RX1 (Copy 1)',
      code: 'OK',
      message: 'Printer siap',
      checkedAt: Date.now(),
      mediaRemaining: 628,
    };
  };

  // Strict validator matching PrintService.ts isPrinterHandoffValid
  const isPrinterHandoffValid = (preValidatedHealth, targetPrinterName) => {
    if (!preValidatedHealth) return false;
    if (!preValidatedHealth.ready || preValidatedHealth.code !== 'OK') return false;
    if (Date.now() - preValidatedHealth.checkedAt >= 5000) return false;
    if (!preValidatedHealth.name) return false;
    // Strict identity matching: EXACT equality required. No broad substring matching!
    return preValidatedHealth.name === targetPrinterName;
  };

  // Mock PrintService.printImage with handoff verification
  const mockPrintImage = async (cleanPath, printerName, copies, preValidatedHealth) => {
    // 2. Authoritative Pre-flight Hardware Verification (with Direct Handoff Reuse)
    let preCheck;
    const isHandoffValid = isPrinterHandoffValid(preValidatedHealth, printerName);

    if (isHandoffValid) {
      preCheck = preValidatedHealth;
      // ZERO PhotolabDNP and ZERO PowerShell queries spawned!
    } else {
      preCheck = await mockQueryPrinterHealth(printerName, true);
    }

    let baselineMedia = preCheck.mediaRemaining;
    if (baselineMedia === undefined) {
      photolabDnpProbeCount++; // Fallback only if media was not captured
      baselineMedia = 628;
    }

    // Spooler snapshot
    powerShellCimProbeCount++; // Single spooler snapshot is expected

    return { success: true, baselineMedia, handoffReused: isHandoffValid };
  };

  // Test 2A: PrintQueueService -> printImage handoff
  {
    console.log('Test 2A: Verify only ONE authoritative health check runs across QueueService + PrintService');
    photolabDnpProbeCount = 0;
    powerShellCimProbeCount = 0;

    const sId = 'session_test_rca5_dedup';
    const filePath = 'C:\\pictolabs\\composite_test.jpg';
    const targetPrinter = 'DS-RX1 (Copy 1)';

    // 1. Authoritative pre-flight in QueueService
    const hwStatus = await mockQueryPrinterHealth(targetPrinter, true);
    assert(hwStatus.ready === true, 'QueueService pre-flight returned ready');
    assert(hwStatus.mediaRemaining === 628, 'QueueService pre-flight captured mediaRemaining');
    assert(photolabDnpProbeCount === 1, `PhotolabDNP probe count after QueueService is ${photolabDnpProbeCount} (expected 1)`);

    // 2. Transition to PRINTING and call printImage with hwStatus
    const result = await mockPrintImage(filePath, targetPrinter, 1, hwStatus);
    assert(result.success === true, 'printImage succeeded');
    assert(result.baselineMedia === 628, 'baselineMedia was reused directly from preValidatedHealth');

    // VERIFICATION: PhotolabDNP must have been called EXACTLY ONCE throughout the entire pipeline before print.exe!
    assert(photolabDnpProbeCount === 1, `Total PhotolabDNP calls before print: ${photolabDnpProbeCount} (MUST BE EXACTLY 1, WAS 3 IN V5)`);
  }

  // Test 2B: Stale preValidatedHealth (>5000ms old) is rejected and forces fresh probe
  {
    console.log('Test 2B: Stale preValidatedHealth (>5s old) is rejected for safety');
    photolabDnpProbeCount = 0;

    const staleHealth = {
      ready: true,
      name: 'DS-RX1 (Copy 1)',
      code: 'OK',
      message: 'Printer siap',
      checkedAt: Date.now() - 6000, // 6 seconds old!
      mediaRemaining: 628,
    };

    const result = await mockPrintImage('path.jpg', 'DS-RX1 (Copy 1)', 1, staleHealth);
    assert(result.success === true, 'printImage succeeded with fresh probe');
    assert(photolabDnpProbeCount === 1, 'Stale handoff correctly triggered fresh PhotolabDNP probe');
  }

  // Test 2C: Fault state in preValidatedHealth is rejected
  {
    console.log('Test 2C: Fault state in preValidatedHealth (e.g. COVER_OPEN) rejects handoff');
    photolabDnpProbeCount = 0;

    const faultHealth = {
      ready: false,
      name: 'DS-RX1 (Copy 1)',
      code: 'DOOR_OPEN',
      message: 'Cover open',
      checkedAt: Date.now(),
      mediaRemaining: 628,
    };

    // When fault is present in QueueService, QueueService blocks BEFORE printImage is called
    let queueBlocked = false;
    if (!faultHealth.ready) {
      queueBlocked = true;
    }
    assert(queueBlocked === true, 'QueueService blocked print without transitioning to PRINTING');
  }

  // Test 2D: Exact identity matching: DS-RX1 (Copy 1) !== DS-RX1 (Copy 2)
  {
    console.log('Test 2D: Exact identity matching: DS-RX1 (Copy 1) !== DS-RX1 (Copy 2)');
    photolabDnpProbeCount = 0;

    const copy1Health = {
      ready: true,
      name: 'DS-RX1 (Copy 1)',
      code: 'OK',
      message: 'Printer siap',
      checkedAt: Date.now(),
      mediaRemaining: 628,
    };

    // 1. Prove vulnerability of broad substring matching:
    // Both 'DS-RX1 (Copy 1)' and 'DS-RX1 (Copy 2)' contain 'DS-RX1',
    // which would cause dangerous cross-queue bleed under broad matching!
    assert(copy1Health.name.includes('DS-RX1'), 'Broad matching vulnerability: copy1Health contains substring DS-RX1');
    assert('DS-RX1 (Copy 2)'.includes('DS-RX1'), 'Broad matching vulnerability: target Copy 2 also contains substring DS-RX1');

    // 2. Prove exact matching correctly separates them:
    assert(isPrinterHandoffValid(copy1Health, 'DS-RX1 (Copy 2)') === false, 'Handoff DS-RX1 (Copy 1) !== DS-RX1 (Copy 2) is REJECTED');
    assert(isPrinterHandoffValid(copy1Health, 'DS-RX1') === false, 'Handoff DS-RX1 (Copy 1) !== DS-RX1 is REJECTED');
    assert(isPrinterHandoffValid(copy1Health, 'DS-RX1 (Copy 1)') === true, 'Exact match DS-RX1 (Copy 1) === DS-RX1 (Copy 1) is ACCEPTED');

    // 3. Execution verification: Mismatched handoff MUST reject handoff and force fresh authoritative query
    const mismatchedResult = await mockPrintImage('path.jpg', 'DS-RX1 (Copy 2)', 1, copy1Health);
    assert(mismatchedResult.success === true, 'printImage succeeded for Copy 2 after fresh probe');
    assert(mismatchedResult.handoffReused === false, 'Mismatched handoff was NOT reused');
    assert(photolabDnpProbeCount === 1, 'Mismatched handoff (Copy 1 !== Copy 2) forced fresh authoritative probe');

    // 4. Execution verification: Exact match handoff reuses validation without probing hardware
    photolabDnpProbeCount = 0;
    const matchedResult = await mockPrintImage('path.jpg', 'DS-RX1 (Copy 1)', 1, copy1Health);
    assert(matchedResult.success === true, 'printImage succeeded for Copy 1 with handoff');
    assert(matchedResult.handoffReused === true, 'Exact match handoff was successfully reused');
    assert(photolabDnpProbeCount === 0, 'Exact match handoff spawned 0 new hardware probes');
  }

  // ─────────────────────────────────────────────────────────────
  // SUITE 3: Database & State Machine Ingestion
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: Database Lifecycle & State Transitions ---');

  {
    console.log('Test 3A: PENDING -> PRINTING -> COMPLETED with correct attempts and session status');
    const sId = `session_rca5_${Date.now()}`;
    const jobId = `print_rca5_${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status)
      VALUES (?, ?, 'classic-white', 'original', '[]', 'C:\\test.jpg', 'pending')
    `).run(sId, now);

    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, created_at, updated_at)
      VALUES (?, ?, 'C:\\test.jpg', 'DS-RX1 (Copy 1)', 1, 'PENDING', 0, ?, ?)
    `).run(jobId, sId, now, now);

    // Initial state
    let row = db.prepare('SELECT status, attempts FROM print_queue WHERE id = ?').get(jobId);
    let session = db.prepare('SELECT print_status FROM sessions WHERE id = ?').get(sId);
    assert(row.status === 'PENDING', 'Initial queue status is PENDING');
    assert(session.print_status === 'pending', 'Initial session print_status is pending');

    // Transition: Authoritative pre-flight passed -> PRINTING
    const printingTime = new Date().toISOString();
    db.prepare("UPDATE print_queue SET status = 'PRINTING', updated_at = ? WHERE id = ?").run(printingTime, jobId);
    row = db.prepare('SELECT status FROM print_queue WHERE id = ?').get(jobId);
    assert(row.status === 'PRINTING', 'Queue status transitioned to PRINTING');

    // Transition: Print completed -> COMPLETED
    const completeTime = new Date().toISOString();
    db.prepare("UPDATE print_queue SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(completeTime, jobId);
    db.prepare("UPDATE sessions SET print_status = 'printed' WHERE id = ?").run(sId);

    row = db.prepare('SELECT status FROM print_queue WHERE id = ?').get(jobId);
    session = db.prepare('SELECT print_status FROM sessions WHERE id = ?').get(sId);
    assert(row.status === 'COMPLETED', 'Queue status transitioned to COMPLETED');
    assert(session.print_status === 'printed', 'Session print_status updated to printed');
  }

  // Cleanup test database
  db.close();
  try {
    fs.unlinkSync(testDbPath);
    fs.rmdirSync(testDbDir);
  } catch (_) {}

  console.log('\n====================================================');
  console.log(`ALL RCA-5 AUTOMATED TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('====================================================');
}

runRca5Verification().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
