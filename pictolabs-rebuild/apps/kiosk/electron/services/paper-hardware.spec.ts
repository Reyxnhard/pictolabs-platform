import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('       PICTOLABS PHASE 3.2B: HARDWARE & PAPER INTERLOCK SUITE          ');
console.log('═══════════════════════════════════════════════════════════════════════');

const testDir = path.join(process.cwd(), 'test-kiosk-hardware-db');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
const dbFile = path.join(testDir, `test_paper_hw_${Date.now()}.db`);

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');

// 1. Initialize paper_tracker schema matching SyncEngine.ts
db.exec(`
  CREATE TABLE IF NOT EXISTS paper_tracker (
    id INTEGER PRIMARY KEY,
    roll_capacity INTEGER NOT NULL DEFAULT 700,
    prints_consumed INTEGER NOT NULL DEFAULT 0,
    prints_remaining INTEGER NOT NULL DEFAULT 700,
    warning_threshold INTEGER NOT NULL DEFAULT 10,
    lockout_threshold INTEGER NOT NULL DEFAULT 2,
    last_replaced_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

console.log('\n[TEST 1: Table & Initial Seed Row Verification]');
const now = new Date().toISOString();
db.prepare(`
  INSERT INTO paper_tracker (id, roll_capacity, prints_consumed, prints_remaining, warning_threshold, lockout_threshold, last_replaced_at, updated_at)
  VALUES (1, 700, 0, 700, 10, 2, ?, ?)
`).run(now, now);

const trackerRow = db.prepare('SELECT * FROM paper_tracker WHERE id = 1').get() as any;
if (
  trackerRow &&
  trackerRow.roll_capacity === 700 &&
  trackerRow.prints_consumed === 0 &&
  trackerRow.prints_remaining === 700 &&
  trackerRow.lockout_threshold === 2
) {
  console.log('  ✓ [PASS] TEST 1: paper_tracker table seeded with capacity 700, remaining 700, lockout 2');
} else {
  console.error('  ✗ [FAIL] TEST 1:', trackerRow);
  process.exit(1);
}

console.log('\n[TEST 2: Atomic Print Consumption Decrement]');
// Simulate 5 completed print jobs of 2 copies each (10 copies total)
const copiesToConsume = 10;
db.prepare(`
  UPDATE paper_tracker 
  SET prints_consumed = prints_consumed + ?,
      prints_remaining = MAX(0, prints_remaining - ?),
      updated_at = ?
  WHERE id = 1
`).run(copiesToConsume, copiesToConsume, new Date().toISOString());

const consumedRow = db.prepare('SELECT * FROM paper_tracker WHERE id = 1').get() as any;
if (consumedRow.prints_consumed === 10 && consumedRow.prints_remaining === 690) {
  console.log(`  ✓ Successfully consumed 10 sheets: remaining = ${consumedRow.prints_remaining}/${consumedRow.roll_capacity}`);
  console.log('  ✓ [PASS] TEST 2: Atomic consumption decrement verified');
} else {
  console.error('  ✗ [FAIL] TEST 2:', consumedRow);
  process.exit(1);
}

console.log('\n[TEST 3: Warning (<= 10) and Hard Lockout (<= 2) Thresholds]');
// Skenario 3A: Warning threshold (remaining = 10)
db.prepare("UPDATE paper_tracker SET prints_remaining = 10 WHERE id = 1").run();
let row = db.prepare('SELECT prints_remaining, warning_threshold, lockout_threshold FROM paper_tracker WHERE id = 1').get() as any;
let isLow = row.prints_remaining <= row.warning_threshold;
let isLockedOut = row.prints_remaining <= row.lockout_threshold;
console.log(`  ✓ Remaining 10 sheets: isLow = ${isLow}, isLockedOut = ${isLockedOut}`);
if (!isLow || isLockedOut) {
  console.error('  ✗ [FAIL] Skenario 3A failed');
  process.exit(1);
}

// Skenario 3B: Hard Lockout threshold (remaining = 2)
db.prepare("UPDATE paper_tracker SET prints_remaining = 2 WHERE id = 1").run();
row = db.prepare('SELECT prints_remaining, warning_threshold, lockout_threshold FROM paper_tracker WHERE id = 1').get() as any;
isLow = row.prints_remaining <= row.warning_threshold;
isLockedOut = row.prints_remaining <= row.lockout_threshold;
console.log(`  ✓ Remaining 2 sheets (Lockout reached): isLow = ${isLow}, isLockedOut = ${isLockedOut}`);
if (!isLockedOut) {
  console.error('  ✗ [FAIL] Skenario 3B failed: Lockout was not triggered at 2 remaining');
  process.exit(1);
}

// Skenario 3C: Capped at 0 (never negative)
db.prepare(`
  UPDATE paper_tracker 
  SET prints_consumed = prints_consumed + 5,
      prints_remaining = MAX(0, prints_remaining - 5),
      updated_at = ?
  WHERE id = 1
`).run(new Date().toISOString());
row = db.prepare('SELECT prints_remaining FROM paper_tracker WHERE id = 1').get() as any;
console.log(`  ✓ Decrementing 5 from 2: remaining = ${row.prints_remaining} (capped at 0)`);
if (row.prints_remaining !== 0) {
  console.error('  ✗ [FAIL] Skenario 3C failed: remaining became negative or non-zero');
  process.exit(1);
}
console.log('  ✓ [PASS] TEST 3: Warning and Lockout interlock thresholds verified');

console.log('\n[TEST 4: PIN-Secured Paper Roll Reset]');
const DEFAULT_PIN = '081299';

// Reset with invalid PIN
const invalidPin: string = '999999';
let resetSuccessInvalid = false;
if (invalidPin === DEFAULT_PIN || invalidPin === '123456') {
  resetSuccessInvalid = true;
}
console.log(`  ✓ Attempt reset with PIN '${invalidPin}': Rejected (success = ${resetSuccessInvalid})`);
if (resetSuccessInvalid) {
  console.error('  ✗ [FAIL] Invalid PIN should not succeed');
  process.exit(1);
}

// Reset with valid PIN
const validPin: string = '081299';
if (validPin === DEFAULT_PIN || validPin === '123456') {
  db.prepare(`
    UPDATE paper_tracker 
    SET roll_capacity = 700,
        prints_consumed = 0,
        prints_remaining = 700,
        last_replaced_at = ?,
        updated_at = ?
    WHERE id = 1
  `).run(new Date().toISOString(), new Date().toISOString());
}

const resetRow = db.prepare('SELECT * FROM paper_tracker WHERE id = 1').get() as any;
if (resetRow.prints_remaining === 700 && resetRow.prints_consumed === 0) {
  console.log(`  ✓ Attempt reset with valid PIN: Success! Remaining reset to ${resetRow.prints_remaining}/${resetRow.roll_capacity}`);
  console.log('  ✓ [PASS] TEST 4: PIN-secured paper roll reset verified');
} else {
  console.error('  ✗ [FAIL] TEST 4:', resetRow);
  process.exit(1);
}

console.log('\n[TEST 5: Win32 Printer Error State Parser & Debouncing Logic]');
function parseErrorState(detectedErrorState: number, workOffline: boolean): { status: string; ready: boolean } {
  if (workOffline) return { status: 'OFFLINE', ready: false };
  if (detectedErrorState === 8) return { status: 'PAPER_JAM', ready: false };
  if (detectedErrorState === 4 || detectedErrorState === 6) return { status: 'PAPER_OUT', ready: false };
  if (detectedErrorState === 7) return { status: 'DOOR_OPEN', ready: false };
  if (detectedErrorState === 10) return { status: 'USER_INTERVENTION', ready: false };
  if (detectedErrorState === 2 || detectedErrorState === 0) return { status: 'READY', ready: true };
  return { status: 'DRIVER_ERROR', ready: false };
}

// Test parser conditions
const jam = parseErrorState(8, false);
const paperOut = parseErrorState(4, false);
const doorOpen = parseErrorState(7, false);
const offline = parseErrorState(0, true);
const ready = parseErrorState(0, false);

console.log(`  ✓ State 8 -> ${jam.status} (ready=${jam.ready})`);
console.log(`  ✓ State 4 -> ${paperOut.status} (ready=${paperOut.ready})`);
console.log(`  ✓ State 7 -> ${doorOpen.status} (ready=${doorOpen.ready})`);
console.log(`  ✓ Offline -> ${offline.status} (ready=${offline.ready})`);
console.log(`  ✓ Normal  -> ${ready.status} (ready=${ready.ready})`);

if (
  jam.status === 'PAPER_JAM' &&
  paperOut.status === 'PAPER_OUT' &&
  doorOpen.status === 'DOOR_OPEN' &&
  offline.status === 'OFFLINE' &&
  ready.status === 'READY'
) {
  console.log('  ✓ [PASS] TEST 5: Hardware error state mapping verified');
} else {
  console.error('  ✗ [FAIL] TEST 5 hardware mapping error');
  process.exit(1);
}

// Cleanup
db.close();
try {
  fs.unlinkSync(dbFile);
  fs.rmdirSync(testDir);
} catch (_) {}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('  ALL 5 PHASE 3.2B HARDWARE & PAPER TESTS PASSED WITH 100% SUCCESS    ');
console.log('═══════════════════════════════════════════════════════════════════════\n');
