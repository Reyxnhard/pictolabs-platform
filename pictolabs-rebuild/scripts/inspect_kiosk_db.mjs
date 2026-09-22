import Database from 'better-sqlite3';

const dbPath = 'C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\kiosk.db';

try {
  const db = new Database(dbPath);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in kiosk.db:', tables.map((t) => t.name));
  for (const t of tables) {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
    console.log(`  Table [${t.name}]:`, cols.map((c) => c.name).join(', '));
    const count = db.prepare(`SELECT count(*) as c FROM ${t.name}`).get();
    console.log(`    Row count: ${count.c}`);
  }
} catch (e) {
  console.error('Error reading kiosk.db:', e.message);
}
