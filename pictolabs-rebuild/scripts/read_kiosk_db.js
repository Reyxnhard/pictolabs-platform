const Database = require('better-sqlite3');
const dbPath = 'C:/Users/ezarh/AppData/Roaming/@pictolabs/kiosk/pictolabs-data/kiosk.db';

try {
  const db = new Database(dbPath);
  console.log('=== Recent print_queue entries ===');
  const jobs = db.prepare('SELECT id, session_id, printer_name, status, attempts, last_error, next_retry_at, created_at, updated_at FROM print_queue ORDER BY created_at DESC LIMIT 10').all();
  console.log(JSON.stringify(jobs, null, 2));

  console.log('\n=== Recent sessions ===');
  const sessions = db.prepare('SELECT id, print_status, created_at FROM sessions ORDER BY created_at DESC LIMIT 10').all();
  console.log(JSON.stringify(sessions, null, 2));
} catch (e) {
  console.error('Database query error:', e.message);
}
