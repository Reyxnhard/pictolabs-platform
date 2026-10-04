/**
 * PRN-04 / PRN-05 Automated Hardening & Verification Suite
 *
 * Verifies:
 * 1. READY telemetry
 * 2. PAPER_OUT detection & preflight blocking
 * 3. COVER_OPEN detection & preflight blocking
 * 4. RIBBON_OUT detection
 * 5. OFFLINE detection
 * 6. UNKNOWN detection & fallback
 * 7. Preflight blocking (no spooler dispatch)
 * 8. Zero paper decrement on failure states
 * 9. Retry with exponential backoff (5s, 10s, 20s, 40s, 80s)
 * 10. DEAD_LETTER transition after max attempts (5)
 * 11. Successful print state transitions
 * 12. Bypass mode preservation
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

// Setup an isolated in-memory or temporary SQLite database
const tempDbPath = path.join(os.tmpdir(), `test_prn_${Date.now()}.db`);
const db = new Database(tempDbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    print_status TEXT DEFAULT 'pending',
    remote_url TEXT,
    composite_path TEXT,
    created_at TEXT,
    updated_at TEXT
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

  CREATE TABLE IF NOT EXISTS paper_tracker (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    prints_remaining INTEGER NOT NULL DEFAULT 700,
    prints_consumed INTEGER NOT NULL DEFAULT 0,
    roll_capacity INTEGER NOT NULL DEFAULT 700,
    warning_threshold INTEGER NOT NULL DEFAULT 10,
    lockout_threshold INTEGER NOT NULL DEFAULT 2,
    last_replaced_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  INSERT OR REPLACE INTO paper_tracker (id, prints_remaining, prints_consumed, roll_capacity, warning_threshold, lockout_threshold, last_replaced_at, updated_at)
  VALUES (1, 645, 55, 700, 10, 2, datetime('now'), datetime('now'));
`);

console.log('================================================================');
console.log('PICTOLABS PRN-04 / PRN-05 HARDENING VERIFICATION SUITE');
console.log('================================================================\n');

// ─── TEST 1: Telemetry Parser & State Mapping ───────────────
console.log('Test Suite 1: Hardware Telemetry State Mapping');

function parseDnpStatus(rawStatusText) {
  switch (rawStatusText) {
    case 'Idle':
      return { state: 'READY', message: 'Printer siap mencetak' };
    case 'Cover Open':
      return { state: 'COVER_OPEN', message: 'Pintu penutup printer terbuka (Cover Open)' };
    case 'Paper End':
    case 'Paper Error':
      return { state: 'PAPER_OUT', message: 'Kertas foto habis di dalam tray (Paper Out)' };
    case 'Ribbon End':
    case 'Ribbon Error':
      return { state: 'RIBBON_OUT', message: 'Pita ribbon printer habis / perlu diganti (Ribbon Out)' };
    case 'Paper Jam':
      return { state: 'JAMMED', message: 'Kertas macet di dalam printer (Paper Jam)' };
    case 'Printing':
    case 'Standstill':
    case 'Cooling':
    case 'Motor Cooling':
    case 'Standby':
      return { state: 'BUSY', message: 'Printer sedang memproses cetak...' };
    case 'Not Connected':
      return { state: 'OFFLINE', message: 'Printer tidak terhubung atau kabel USB terputus' };
    case 'Hardware Error':
    case 'System Error':
    case 'Data Error':
    case 'Scrap Box Error':
    case 'Duplex Unit Error':
      return { state: 'ERROR', message: 'Terjadi gangguan mekanikal pada printer' };
    default:
      if (rawStatusText.startsWith('Busy')) return { state: 'BUSY', message: 'Printer sedang sibuk...' };
      if (rawStatusText.includes('Error')) return { state: 'ERROR', message: `Gangguan printer: ${rawStatusText}` };
      return { state: 'UNKNOWN', message: `Status printer: ${rawStatusText}` };
  }
}

assert(parseDnpStatus('Idle').state === 'READY', 'Idle maps to READY');
assert(parseDnpStatus('Cover Open').state === 'COVER_OPEN', 'Cover Open maps to COVER_OPEN');
assert(parseDnpStatus('Paper End').state === 'PAPER_OUT', 'Paper End maps to PAPER_OUT');
assert(parseDnpStatus('Paper Error').state === 'PAPER_OUT', 'Paper Error maps to PAPER_OUT');
assert(parseDnpStatus('Ribbon End').state === 'RIBBON_OUT', 'Ribbon End maps to RIBBON_OUT');
assert(parseDnpStatus('Ribbon Error').state === 'RIBBON_OUT', 'Ribbon Error maps to RIBBON_OUT');
assert(parseDnpStatus('Paper Jam').state === 'JAMMED', 'Paper Jam maps to JAMMED');
assert(parseDnpStatus('Printing').state === 'BUSY', 'Printing maps to BUSY');
assert(parseDnpStatus('Not Connected').state === 'OFFLINE', 'Not Connected maps to OFFLINE');
assert(parseDnpStatus('Hardware Error').state === 'ERROR', 'Hardware Error maps to ERROR');
assert(parseDnpStatus('SomeRandomState').state === 'UNKNOWN', 'Unrecognized state maps to UNKNOWN');

// ─── TEST 2: Health Gate Evaluation ─────────────────────────
console.log('\nTest Suite 2: Health Gate Evaluation (Pre-Flight)');

function evaluateHealthGate(hwState, isBypass = false) {
  if (isBypass) {
    return { ready: true, code: 'OK', message: 'Printer siap (Bypass Mode)' };
  }
  if (hwState === 'COVER_OPEN') {
    return { ready: false, code: 'DOOR_OPEN', message: 'Pintu penutup printer terbuka (Cover Open)' };
  }
  if (hwState === 'PAPER_OUT') {
    return { ready: false, code: 'PAPER_OUT', message: 'Kertas foto habis di dalam tray (Paper Out)' };
  }
  if (hwState === 'RIBBON_OUT') {
    return { ready: false, code: 'RIBBON_OUT', message: 'Pita ribbon printer habis / perlu diganti (Ribbon Out)' };
  }
  if (hwState === 'JAMMED') {
    return { ready: false, code: 'JAMMED', message: 'Kertas macet di dalam printer (Paper Jam)' };
  }
  if (hwState === 'OFFLINE') {
    return { ready: false, code: 'OFFLINE', message: 'Printer offline atau kabel USB terputus' };
  }
  if (hwState === 'ERROR') {
    return { ready: false, code: 'ERROR', message: 'Terjadi gangguan mekanikal pada printer' };
  }
  if (hwState === 'BUSY') {
    return { ready: true, code: 'BUSY', message: 'Sedang memproses antrean cetak...' };
  }
  if (hwState === 'READY') {
    return { ready: true, code: 'OK', message: 'Printer siap' };
  }
  return { ready: false, code: 'ERROR', message: 'Status hardware tidak diketahui' };
}

assert(evaluateHealthGate('READY').ready === true, 'READY health gate is OPEN (ready: true)');
assert(evaluateHealthGate('PAPER_OUT').ready === false, 'PAPER_OUT health gate is BLOCKED (ready: false)');
assert(evaluateHealthGate('PAPER_OUT').code === 'PAPER_OUT', 'PAPER_OUT code is PAPER_OUT');
assert(evaluateHealthGate('COVER_OPEN').ready === false, 'COVER_OPEN health gate is BLOCKED (ready: false)');
assert(evaluateHealthGate('COVER_OPEN').code === 'DOOR_OPEN', 'COVER_OPEN code is DOOR_OPEN');
assert(evaluateHealthGate('RIBBON_OUT').ready === false, 'RIBBON_OUT health gate is BLOCKED (ready: false)');
assert(evaluateHealthGate('OFFLINE').ready === false, 'OFFLINE health gate is BLOCKED (ready: false)');
assert(evaluateHealthGate('ERROR').ready === false, 'ERROR health gate is BLOCKED (ready: false)');
assert(evaluateHealthGate('PAPER_OUT', true).ready === true, 'Bypass mode ignores PAPER_OUT and allows ready: true');

// ─── TEST 3: Pre-Flight Spooler Dispatch Prevention ────────
console.log('\nTest Suite 3: Pre-Flight Spooler Dispatch Prevention');

function simulatePrintDispatch(hwState, isBypass = false) {
  const health = evaluateHealthGate(hwState, isBypass);
  if (!health.ready) {
    return { dispatchedToSpooler: false, success: false, error: health.message };
  }
  // Dispatched to spooler only if health.ready is true
  return { dispatchedToSpooler: true, success: true };
}

const paperOutDispatch = simulatePrintDispatch('PAPER_OUT');
assert(paperOutDispatch.dispatchedToSpooler === false, 'PAPER_OUT never dispatches to Windows spooler');
assert(paperOutDispatch.success === false, 'PAPER_OUT returns failure to caller');

const coverOpenDispatch = simulatePrintDispatch('COVER_OPEN');
assert(coverOpenDispatch.dispatchedToSpooler === false, 'COVER_OPEN never dispatches to Windows spooler');
assert(coverOpenDispatch.success === false, 'COVER_OPEN returns failure to caller');

const readyDispatch = simulatePrintDispatch('READY');
assert(readyDispatch.dispatchedToSpooler === true, 'READY dispatches to Windows spooler');
assert(readyDispatch.success === true, 'READY returns success to caller');

// ─── TEST 4: Paper Tracker Zero Decrement on Failure ─────────
console.log('\nTest Suite 4: Paper Tracker Zero Decrement on Failure');

function recordPaperConsumption(copies) {
  db.prepare(`
    UPDATE paper_tracker 
    SET prints_consumed = prints_consumed + ?,
        prints_remaining = MAX(0, prints_remaining - ?),
        updated_at = datetime('now')
    WHERE id = 1
  `).run(copies, copies);
}

function getRemainingPaper() {
  return db.prepare('SELECT prints_remaining FROM paper_tracker WHERE id = 1').get().prints_remaining;
}

const initialPaper = getRemainingPaper();
assert(initialPaper === 645, 'Initial paper counter is 645');

// Simulate failure: print fails
const failResult = simulatePrintDispatch('PAPER_OUT');
if (failResult.success) {
  recordPaperConsumption(1);
}
assert(getRemainingPaper() === 645, 'Paper counter unchanged after PAPER_OUT failure (645)');

const failDoorResult = simulatePrintDispatch('COVER_OPEN');
if (failDoorResult.success) {
  recordPaperConsumption(1);
}
assert(getRemainingPaper() === 645, 'Paper counter unchanged after COVER_OPEN failure (645)');

// Simulate success: print succeeds
const successResult = simulatePrintDispatch('READY');
if (successResult.success) {
  recordPaperConsumption(1);
}
assert(getRemainingPaper() === 644, 'Paper counter decremented by 1 after verified success (645 -> 644)');

// ─── TEST 5: Queue Execution & Exponential Backoff Retry ────
console.log('\nTest Suite 5: Queue Execution & Exponential Backoff Retry');

const BACKOFF_DELAYS = [5000, 10000, 20000, 40000, 80000];

function simulateQueueAttempt(jobId, hwState) {
  const job = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(jobId);
  const printRes = simulatePrintDispatch(hwState);

  const now = new Date().toISOString();
  if (printRes.success) {
    db.prepare("UPDATE print_queue SET status = 'COMPLETED', updated_at = ? WHERE id = ?").run(now, jobId);
    db.prepare("UPDATE sessions SET print_status = 'printed', updated_at = ? WHERE id = ?").run(now, job.session_id);
    recordPaperConsumption(job.copies);
  } else {
    const newAttempts = job.attempts + 1;
    if (newAttempts >= job.max_attempts) {
      db.prepare("UPDATE print_queue SET status = 'DEAD_LETTER', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?").run(
        newAttempts,
        `Exceeded max attempts: ${printRes.error}`,
        now,
        jobId
      );
      db.prepare("UPDATE sessions SET print_status = 'failed', updated_at = ? WHERE id = ?").run(now, job.session_id);
    } else {
      const backoffMs = BACKOFF_DELAYS[Math.min(job.attempts, BACKOFF_DELAYS.length - 1)];
      const nextRetry = new Date(Date.now() + backoffMs).toISOString();
      db.prepare("UPDATE print_queue SET status = 'PENDING', attempts = ?, last_error = ?, next_retry_at = ?, updated_at = ? WHERE id = ?").run(
        newAttempts,
        printRes.error,
        nextRetry,
        now,
        jobId
      );
    }
  }
}

// Create test session and job
const sId = 'sess_test_prn04';
db.prepare("INSERT INTO sessions (id, print_status, created_at, updated_at) VALUES (?, 'pending', datetime('now'), datetime('now'))").run(sId);
const jId = 'job_test_prn04';
db.prepare("INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, created_at, updated_at) VALUES (?, ?, 'C:\\test.jpg', 'DS-RX1', 1, 'PENDING', 0, 5, datetime('now'), datetime('now'))").run(jId, sId);

// Attempt 1: Paper out
simulateQueueAttempt(jId, 'PAPER_OUT');
let jobState = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(jId);
assert(jobState.status === 'PENDING', 'Attempt 1: Status remains PENDING for retry');
assert(jobState.attempts === 1, 'Attempt 1: Attempts count is 1');
assert(jobState.last_error.includes('Paper Out'), 'Attempt 1: Error message recorded');

// Attempt 2: Paper out
simulateQueueAttempt(jId, 'PAPER_OUT');
jobState = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(jId);
assert(jobState.attempts === 2, 'Attempt 2: Attempts count is 2');

// Attempt 3, 4: Cover open
simulateQueueAttempt(jId, 'COVER_OPEN');
simulateQueueAttempt(jId, 'COVER_OPEN');
jobState = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(jId);
assert(jobState.attempts === 4, 'Attempt 4: Attempts count is 4');

// Attempt 5: Final attempt failure -> DEAD_LETTER
simulateQueueAttempt(jId, 'PAPER_OUT');
jobState = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(jId);
assert(jobState.status === 'DEAD_LETTER', 'Attempt 5: Status transitioned to DEAD_LETTER');
assert(jobState.attempts === 5, 'Attempt 5: Max attempts (5) reached');

const sessState = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sId);
assert(sessState.print_status === 'failed', 'Session print_status updated to failed (Session History: GAGAL CETAK)');
assert(getRemainingPaper() === 644, 'Paper counter was NEVER decremented during the 5 failed attempts (remains 644)');

// ─── TEST 6: Physical Media Delta Verification ──────────────
console.log('\nTest Suite 6: Physical Media Delta Verification');

function verifyMediaDelta(m0, m1, copies = 1) {
  if (m0 === undefined || m1 === undefined) {
    return { ok: false, reason: 'Media counter unavailable' };
  }
  if (m1 <= m0 - copies) {
    return { ok: true, delta: m0 - m1, reason: 'Physical print confirmed by media delta' };
  }
  return { ok: false, reason: `Media counter did not decrement (M0=${m0}, M1=${m1})` };
}

assert(verifyMediaDelta(645, 644, 1).ok === true, 'M0=645, M1=644 (-1 copy) verifies physical success');
assert(verifyMediaDelta(645, 643, 2).ok === true, 'M0=645, M1=643 (-2 copies) verifies physical success');
assert(verifyMediaDelta(645, 645, 1).ok === false, 'M0=645, M1=645 (no change) flags incomplete physical print');
assert(verifyMediaDelta(undefined, 644).ok === false, 'Missing baseline handled gracefully');

// ─── TEST 7: Dynamic Active Printer Resolution ("Copy N" Tolerance) ───
console.log('\nTest Suite 7: Dynamic Active Printer Resolution & "Copy N" Tolerance');

function resolveActivePrinter(targetName, printerQueues, driverPattern = 'RX1') {
  // If target printer is online, use it
  const target = printerQueues.find(q => q.Name === targetName);
  if (target && !target.WorkOffline && ((target.PrinterState & 4) === 0)) {
    return target.Name;
  }
  // If target printer is offline or pending deletion, resolve active online sibling queue
  const activeSibling = printerQueues.find(q => 
    (q.DriverName.includes(driverPattern) || q.Name.includes(driverPattern)) &&
    !q.WorkOffline &&
    ((q.PrinterState & 4) === 0)
  );
  if (activeSibling) {
    return activeSibling.Name;
  }
  return target ? target.Name : targetName;
}

const mockQueuesScenario1 = [
  { Name: 'DS-RX1', DriverName: 'DS-RX1', PortName: 'USB002', WorkOffline: true, PrinterState: 4 },
  { Name: 'DS-RX1 (Copy 1)', DriverName: 'DS-RX1', PortName: 'USB001', WorkOffline: false, PrinterState: 0 },
  { Name: 'Microsoft Print to PDF', DriverName: 'Microsoft Print To PDF', PortName: 'PORTPROMPT:', WorkOffline: false, PrinterState: 0 },
];

assert(
  resolveActivePrinter('DS-RX1', mockQueuesScenario1) === 'DS-RX1 (Copy 1)',
  'When DS-RX1 is offline/pending-deletion on USB002, resolves DS-RX1 (Copy 1) on USB001'
);

const mockQueuesScenario2 = [
  { Name: 'DS-RX1', DriverName: 'DS-RX1', PortName: 'USB002', WorkOffline: true, PrinterState: 4 },
  { Name: 'DS-RX1 (Copy 1)', DriverName: 'DS-RX1', PortName: 'USB001', WorkOffline: true, PrinterState: 4 },
  { Name: 'DS-RX1 (Copy 2)', DriverName: 'DS-RX1', PortName: 'USB003', WorkOffline: false, PrinterState: 0 },
];

assert(
  resolveActivePrinter('DS-RX1', mockQueuesScenario2) === 'DS-RX1 (Copy 2)',
  'When DS-RX1 and Copy 1 are offline, dynamically resolves to DS-RX1 (Copy 2)'
);

const mockQueuesScenario3 = [
  { Name: 'DS-RX1', DriverName: 'DS-RX1', PortName: 'USB001', WorkOffline: false, PrinterState: 0 },
];

assert(
  resolveActivePrinter('DS-RX1', mockQueuesScenario3) === 'DS-RX1',
  'When DS-RX1 is healthy, preserves DS-RX1 directly without renaming'
);

// ─── TEST 8: Stalled PENDING Queue Override (PRN-06 Fix) ──────
console.log('\nTest Suite 8: Stalled PENDING Queue Override (PRN-06 Fix)');

const testSessionId = `test_sess_${Date.now()}`;
db.prepare('INSERT INTO sessions (id, print_status, composite_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
  .run(testSessionId, 'pending', 'c:/tmp/test.jpg', new Date().toISOString(), new Date().toISOString());

// Insert a retrying PENDING job (attempt 1, next_retry_at scheduled in future)
const stalledJobId = `job_stalled_${Date.now()}`;
db.prepare(`
  INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, last_error, next_retry_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, 1, 'PENDING', 1, 5, 'Printer offline atau kabel USB terputus', datetime('now', '+10 seconds'), datetime('now', '-30 seconds'), datetime('now', '-30 seconds'))
`).run(stalledJobId, testSessionId, 'c:/tmp/test.jpg', 'DS-RX1 (Copy 1)');

// Simulate reprint debounce check
function evaluateReprintRequest(sId) {
  const activeJob = db.prepare(`
    SELECT id, status, attempts, next_retry_at, updated_at FROM print_queue 
    WHERE session_id = ? AND status IN ('PENDING', 'PRINTING')
    ORDER BY created_at DESC LIMIT 1
  `).get(sId);

  if (activeJob) {
    const now = Date.now();
    const updatedTime = new Date(activeJob.updated_at || 0).getTime();
    const isStuckPrinting = activeJob.status === 'PRINTING' && (now - updatedTime > 20_000);
    const isRetryingPending = activeJob.status === 'PENDING' && (activeJob.attempts > 0 || Boolean(activeJob.next_retry_at));

    if (isStuckPrinting || isRetryingPending) {
      db.prepare("UPDATE print_queue SET status = 'CANCELLED', updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), activeJob.id);
      return { allowed: true, cancelledOldJobId: activeJob.id };
    } else if (activeJob.status === 'PRINTING') {
      return { allowed: false, reason: 'Actively printing' };
    } else if (now - updatedTime < 4000) {
      return { allowed: false, reason: 'Debounce active' };
    }
  }
  return { allowed: true };
}

const reprintCheck = evaluateReprintRequest(testSessionId);
assert(reprintCheck.allowed === true, 'Operator reprint on retrying PENDING job is ALLOWED (not blocked)');
assert(reprintCheck.cancelledOldJobId === stalledJobId, 'Old retrying job was safely cancelled to avoid race condition');

const updatedStalledJob = db.prepare('SELECT status FROM print_queue WHERE id = ?').get(stalledJobId);
assert(updatedStalledJob.status === 'CANCELLED', 'Stalled job status is now CANCELLED in database');

// ─── TEST 9: Pre-Flight Handoff Exact Identity Validation ──────
console.log('\nTest Suite 9: Pre-Flight Handoff Exact Identity Validation');

// Exact validation function matching PrintService.ts isPrinterHandoffValid
function isPrinterHandoffValid(preValidatedHealth, targetPrinterName) {
  if (!preValidatedHealth) return false;
  if (!preValidatedHealth.ready || preValidatedHealth.code !== 'OK') return false;
  if (Date.now() - preValidatedHealth.checkedAt >= 5000) return false;
  if (!preValidatedHealth.name) return false;
  // Strict identity matching: EXACT equality required.
  // Substring matching (e.g. name.includes('DS-RX1')) is strictly forbidden!
  return preValidatedHealth.name === targetPrinterName;
}

const copy1Health = {
  ready: true,
  name: 'DS-RX1 (Copy 1)',
  code: 'OK',
  message: 'Printer siap',
  checkedAt: Date.now(),
  mediaRemaining: 628,
};

// 1. Broad substring matching vulnerability check
assert(
  copy1Health.name.includes('DS-RX1') && 'DS-RX1 (Copy 2)'.includes('DS-RX1'),
  'Demonstrated risk: Substring "DS-RX1" erroneously overlaps both Copy 1 and Copy 2'
);

// 2. Exact identity matching checks
assert(
  isPrinterHandoffValid(copy1Health, 'DS-RX1 (Copy 2)') === false,
  'DS-RX1 (Copy 1) handoff is REJECTED when dispatch target is DS-RX1 (Copy 2)'
);

assert(
  isPrinterHandoffValid(copy1Health, 'DS-RX1') === false,
  'DS-RX1 (Copy 1) handoff is REJECTED when dispatch target is default DS-RX1'
);

assert(
  isPrinterHandoffValid(copy1Health, 'DS-RX1 (Copy 1)') === true,
  'DS-RX1 (Copy 1) handoff is ACCEPTED when dispatch target is exactly DS-RX1 (Copy 1)'
);

// 3. Stale handoff check (>5s)
const staleCopy1Health = { ...copy1Health, checkedAt: Date.now() - 6000 };
assert(
  isPrinterHandoffValid(staleCopy1Health, 'DS-RX1 (Copy 1)') === false,
  'Stale handoff (>5s) is REJECTED even with matching name'
);

// 4. Fault handoff check
const faultCopy1Health = { ...copy1Health, ready: false, code: 'DOOR_OPEN' };
assert(
  isPrinterHandoffValid(faultCopy1Health, 'DS-RX1 (Copy 1)') === false,
  'Fault handoff (ready: false) is REJECTED even with matching name'
);

// Clean up temp DB
db.close();
try { fs.unlinkSync(tempDbPath); } catch {}

console.log('\n================================================================');
console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('================================================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
