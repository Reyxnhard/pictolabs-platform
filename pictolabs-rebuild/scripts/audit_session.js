const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, '@pictolabs', 'kiosk', 'pictolabs-data', 'kiosk.db');
const db = new Database(dbPath);

console.log('=== TABLES IN DB ===');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables.map(t => t.name));

const sessionId = 'session_1791152680331_p3rhos';

console.log('\n=== SESSION RECORD ===');
const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
console.log(JSON.stringify(session, null, 2));

console.log('\n=== PRINT QUEUE FOR SESSION ===');
const queueRows = db.prepare('SELECT * FROM print_queue WHERE session_id = ? ORDER BY created_at ASC').all(sessionId);
console.log(JSON.stringify(queueRows, null, 2));

for (const t of tables) {
  if (['sessions', 'print_queue'].includes(t.name)) continue;
  try {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all().map(c => c.name);
    if (cols.includes('session_id')) {
      const records = db.prepare(`SELECT * FROM ${t.name} WHERE session_id = ?`).all(sessionId);
      if (records.length > 0) {
        console.log(`\n=== TABLE: ${t.name} ===`);
        console.log(JSON.stringify(records, null, 2));
      }
    }
  } catch (e) {
    // skip
  }
}
