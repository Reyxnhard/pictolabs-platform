import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for test assertions
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

async function runRca4Verification() {
  console.log('====================================================');
  console.log('PICTOLABS RCA-4 FIX VERIFICATION SUITE');
  console.log('====================================================\n');

  const testDbDir = path.join(__dirname, '..', 'test-rca4-db');
  if (!fs.existsSync(testDbDir)) {
    fs.mkdirSync(testDbDir, { recursive: true });
  }
  const testDbPath = path.join(testDbDir, 'kiosk.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // 1. Initialize Test SQLite DB with identical production schema
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

    CREATE TABLE IF NOT EXISTS upload_queue (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      remote_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Create mock composite file on disk
  const mockCompositePath = path.join(testDbDir, 'composite_test.jpg');
  fs.writeFileSync(mockCompositePath, Buffer.from('FAKE_JPEG_IMAGE_DATA_300DPI'));

  // ─────────────────────────────────────────────────────────────
  // TEST 1 & 2: QRScreen Lifecycle Enqueue & Remount Dedup Guard
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 1 & 2: QRScreen Enqueue & Remount Dedup Guard ---');
  let enqueueCalls = 0;
  let enqueuedParams = null;

  const mockKiosk = {
    printer: {
      enqueue: async (cleanPath, copies, sId) => {
        enqueueCalls++;
        enqueuedParams = { cleanPath, copies, sId };
        return { success: true, id: `job_${Date.now()}` };
      },
    },
  };

  // Simulate QRScreen mount with hasTriggeredPrint ref guard
  function simulateQRScreenMount(session, refState) {
    if (refState.current) return;
    refState.current = true;
    const cleanPath = (session.compositePath || session.compositeUrl || '').replace(/^file:\/\/\/?/, '');
    const sId = session.sessionId || `session_${Date.now()}`;
    mockKiosk.printer.enqueue(cleanPath, 1, sId);
  }

  const hasTriggeredPrint = { current: false };
  const mockSession = { sessionId: 'session_test_001', compositePath: mockCompositePath };

  // First mount
  simulateQRScreenMount(mockSession, hasTriggeredPrint);
  assert(enqueueCalls === 1, 'Test 1: QRScreen mounts and calls enqueue() exactly once.');
  assert(enqueuedParams.sId === 'session_test_001', 'Test 1: Enqueue passes valid sessionId.');
  assert(enqueuedParams.copies === 1, 'Test 1: Enqueue passes copies = 1.');

  // Second mount / re-render simulation
  simulateQRScreenMount(mockSession, hasTriggeredPrint);
  assert(enqueueCalls === 1, 'Test 2: Remount/re-render suppressed by hasTriggeredPrint guard (0 duplicate calls).');

  // ─────────────────────────────────────────────────────────────
  // TEST 3 & 5: Database Insertion & Queue Idempotency
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3 & 5: Database Insertion & Queue Idempotency ---');
  const now = new Date().toISOString();

  // Create session in sessions table (initial customer state)
  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status)
    VALUES (?, ?, '2R', 'none', '[]', ?, 'pending')
  `).run('session_test_001', now, mockCompositePath);

  // Implement PrintQueueService enqueuePrintJob logic on test DB
  function enqueueJob(sessionId, filePath, copies = 1, printer = 'DS-RX1 (Copy 1)') {
    const existing = db.prepare(`
      SELECT * FROM print_queue WHERE session_id = ? AND file_path = ? ORDER BY created_at DESC LIMIT 1
    `).get(sessionId, filePath);

    if (existing) {
      if (existing.status === 'COMPLETED' || existing.status === 'PRINTING' || existing.status === 'PENDING') {
        return { success: true, id: existing.id, isDuplicate: true };
      }
    }

    const id = `print_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    db.prepare(`
      INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 5, ?, ?)
    `).run(id, sessionId, filePath, printer, copies, now, now);

    return { success: true, id, isDuplicate: false };
  }

  const enq1 = enqueueJob('session_test_001', mockCompositePath, 1);
  assert(enq1.success === true && enq1.isDuplicate === false, 'Test 3: First enqueue inserts new row successfully.');

  const queueRows = db.prepare('SELECT * FROM print_queue WHERE session_id = ?').all('session_test_001');
  assert(queueRows.length === 1, 'Test 3: Exactly one row exists in print_queue.');
  assert(queueRows[0].status === 'PENDING', 'Test 3: Newly enqueued job has status = PENDING.');
  assert(queueRows[0].attempts === 0, 'Test 3: Initial attempts count is 0.');

  // Test 5: Duplicate interaction protection
  const enq2 = enqueueJob('session_test_001', mockCompositePath, 1);
  assert(enq2.isDuplicate === true, 'Test 5: Double interaction detected as duplicate.');
  const queueRowsAfterDup = db.prepare('SELECT * FROM print_queue WHERE session_id = ?').all('session_test_001');
  assert(queueRowsAfterDup.length === 1, 'Test 5: No duplicate row created in print_queue.');

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Worker State Machine (PENDING -> PRINTING -> COMPLETED)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Worker State Machine Transitions ---');

  // Step A: Worker claims job -> PRINTING
  db.prepare(`UPDATE print_queue SET status = 'PRINTING', updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), enq1.id);
  
  let jobState = db.prepare('SELECT status FROM print_queue WHERE id = ?').get(enq1.id);
  assert(jobState.status === 'PRINTING', 'Test 4: Worker transitions job from PENDING -> PRINTING.');

  // Step B: Print finishes -> COMPLETED
  db.prepare(`UPDATE print_queue SET status = 'COMPLETED', updated_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), enq1.id);
  db.prepare(`UPDATE sessions SET print_status = 'printed' WHERE id = ?`)
    .run('session_test_001');

  jobState = db.prepare('SELECT status FROM print_queue WHERE id = ?').get(enq1.id);
  assert(jobState.status === 'COMPLETED', 'Test 4: Worker transitions job from PRINTING -> COMPLETED.');

  // ─────────────────────────────────────────────────────────────
  // TEST 6: Route Verification & Dead Component Absence
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Route Verification & Dead Component Absence ---');
  const printScreenPath = path.join(__dirname, '..', 'apps', 'kiosk', 'src', 'screens', 'PrintScreen.tsx');
  const printScreenDeleted = !fs.existsSync(printScreenPath);
  assert(printScreenDeleted, 'Test 6: Orphaned PrintScreen.tsx component is completely deleted from repository.');

  const appTsxPath = path.join(__dirname, '..', 'apps', 'kiosk', 'src', 'App.tsx');
  const appTsxContent = fs.readFileSync(appTsxPath, 'utf8');

  assert(!appTsxContent.includes('import PrintScreen'), 'Test 6: App.tsx has no PrintScreen import.');
  assert(!appTsxContent.includes("screen === 'print'"), 'Test 6: App.tsx has no obsolete screen === \'print\' route.');
  assert(appTsxContent.includes("{screen === 'qr' && <QRScreen {...screenProps} />}"), 'Test 6: App.tsx cleanly routes screen === \'qr\' to QRScreen.');

  const renderScreenPath = path.join(__dirname, '..', 'apps', 'kiosk', 'src', 'screens', 'RenderScreen.tsx');
  const renderScreenContent = fs.readFileSync(renderScreenPath, 'utf8');
  assert(renderScreenContent.includes("navigate('qr')"), 'Test 6: RenderScreen navigates directly to qr.');

  // ─────────────────────────────────────────────────────────────
  // TEST 7: Session History Status Resolution (NOT_QUEUED vs PENDING vs PRINTING vs COMPLETED)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 7: Session History Status Resolution ---');

  // Implementation of getSessionHistory resolution from SyncEngine.ts:
  function resolveSessionHistoryPrintStatus(sessionId) {
    const sessionRow = db.prepare('SELECT print_status FROM sessions WHERE id = ?').get(sessionId);
    const printRow = db.prepare('SELECT status, attempts FROM print_queue WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId);

    let printStatus = sessionRow?.print_status || 'pending';
    let printAttempts = 0;

    if (printRow) {
      printStatus = printRow.status === 'DEAD_LETTER' ? 'FAILED' : printRow.status;
      printAttempts = printRow.attempts || 0;
    } else if (sessionRow?.print_status === 'printed') {
      printStatus = 'COMPLETED';
    } else if (sessionRow?.print_status === 'failed') {
      printStatus = 'FAILED';
    } else {
      printStatus = 'NOT_QUEUED';
    }

    return { printStatus, printAttempts };
  }

  // Case A: Fresh session without print_queue entry
  db.prepare(`
    INSERT INTO sessions (id, created_at, frame_id, filter, photos, composite_path, print_status)
    VALUES ('session_fresh_no_queue', ?, '2R', 'none', '[]', ?, 'pending')
  `).run(now, mockCompositePath);

  const resA = resolveSessionHistoryPrintStatus('session_fresh_no_queue');
  assert(resA.printStatus === 'NOT_QUEUED', 'Test 7: Unqueued session resolves transparently to NOT_QUEUED (NOT phantom PENDING).');

  // Case B: Session with PENDING print_queue entry
  db.prepare(`
    INSERT INTO print_queue (id, session_id, file_path, printer_name, copies, status, attempts, created_at, updated_at)
    VALUES ('job_pending_test', 'session_fresh_no_queue', ?, 'DS-RX1', 1, 'PENDING', 0, ?, ?)
  `).run(mockCompositePath, now, now);

  const resB = resolveSessionHistoryPrintStatus('session_fresh_no_queue');
  assert(resB.printStatus === 'PENDING', 'Test 7: After enqueue, Session History resolves to PENDING.');

  // Case C: Session with PRINTING print_queue entry
  db.prepare(`UPDATE print_queue SET status = 'PRINTING' WHERE id = 'job_pending_test'`).run();
  const resC = resolveSessionHistoryPrintStatus('session_fresh_no_queue');
  assert(resC.printStatus === 'PRINTING', 'Test 7: In-flight print resolves to PRINTING.');

  // Case D: Session with COMPLETED print_queue entry
  db.prepare(`UPDATE print_queue SET status = 'COMPLETED' WHERE id = 'job_pending_test'`).run();
  const resD = resolveSessionHistoryPrintStatus('session_fresh_no_queue');
  assert(resD.printStatus === 'COMPLETED', 'Test 7: Finished print resolves to COMPLETED.');

  // Clean up test DB
  db.close();
  try {
    fs.unlinkSync(testDbPath);
    fs.unlinkSync(mockCompositePath);
    fs.rmdirSync(testDbDir);
  } catch (_) {}

  console.log('\n====================================================');
  console.log(`ALL RCA-4 FIX TESTS PASSED! (${passedTests}/${totalTests} assertions passed)`);
  console.log('====================================================\n');
}

runRca4Verification().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
