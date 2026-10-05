import Database from 'better-sqlite3';

const dbPath = 'C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\kiosk.db';
const db = new Database(dbPath);

console.log('=== SESSIONS FROM TODAY (V7 UAT) ===');
const sessions = db.prepare("SELECT * FROM sessions WHERE created_at > '2026-10-05T08:00:00' ORDER BY created_at ASC").all();
console.log(JSON.stringify(sessions, null, 2));

console.log('\n=== PRINT QUEUE ROWS FROM TODAY (V7 UAT) ===');
const printJobs = db.prepare("SELECT * FROM print_queue WHERE created_at > '2026-10-05T08:00:00' ORDER BY created_at ASC").all();
console.log(JSON.stringify(printJobs, null, 2));

console.log('\n=== UPLOAD QUEUE ROWS FROM TODAY (V7 UAT) ===');
const uploadJobs = db.prepare("SELECT * FROM upload_queue WHERE created_at > '2026-10-05T08:00:00' ORDER BY created_at ASC").all();
console.log(JSON.stringify(uploadJobs, null, 2));

console.log('\n=== KIOSK SYSTEM EVENTS FROM TODAY (V7 UAT) ===');
const events = db.prepare("SELECT * FROM kiosk_system_events WHERE created_at > '2026-10-05T08:00:00' ORDER BY created_at ASC").all();
console.log(JSON.stringify(events, null, 2));
