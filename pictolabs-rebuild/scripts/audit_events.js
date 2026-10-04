const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.env.APPDATA, '@pictolabs', 'kiosk', 'pictolabs-data', 'kiosk.db');
const db = new Database(dbPath);

console.log('=== PAPER TRACKER ===');
console.log(db.prepare('SELECT * FROM paper_tracker').all());

console.log('\n=== SESSION RECOVERY LEDGER ===');
console.log(db.prepare('SELECT * FROM session_recovery_ledger ORDER BY created_at DESC LIMIT 10').all());

console.log('\n=== KIOSK SYSTEM EVENTS ===');
console.log(db.prepare('SELECT * FROM kiosk_system_events ORDER BY created_at DESC LIMIT 20').all());
