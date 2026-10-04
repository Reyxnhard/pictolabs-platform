import Database from 'better-sqlite3';

const dbPath = 'C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\kiosk.db';
const db = new Database(dbPath);

console.log('=== LATEST 5 SESSIONS ===');
const sessions = db.prepare('SELECT id, created_at, print_status, composite_path FROM sessions ORDER BY created_at DESC LIMIT 5').all();
for (const s of sessions) {
  console.log(`SESSION: ${s.id} | created: ${s.created_at} | print_status: ${s.print_status} | path: ${s.composite_path}`);
}

console.log('\n=== LATEST 10 PRINT_QUEUE ROWS ===');
const printJobs = db.prepare('SELECT * FROM print_queue ORDER BY created_at DESC LIMIT 10').all();
for (const j of printJobs) {
  console.log(`JOB: ${j.id} | session: ${j.session_id} | printer: ${j.printer_name} | copies: ${j.copies} | status: ${j.status} | attempts: ${j.attempts} | err: ${j.last_error} | created: ${j.created_at} | updated: ${j.updated_at}`);
}


console.log('\n=== LATEST 30 KIOSK_SYSTEM_EVENTS ===');
const events = db.prepare('SELECT * FROM kiosk_system_events ORDER BY created_at DESC LIMIT 30').all();
console.log(JSON.stringify(events, null, 2));

console.log('\n=== PAPER TRACKER ===');
const paper = db.prepare('SELECT * FROM paper_tracker').all();
console.log(JSON.stringify(paper, null, 2));
