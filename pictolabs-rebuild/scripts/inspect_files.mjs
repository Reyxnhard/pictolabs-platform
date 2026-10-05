import fs from 'fs';
import path from 'path';

const dataDir = 'C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data';

function inspectDir(subDir) {
  const dirPath = path.join(dataDir, subDir);
  if (!fs.existsSync(dirPath)) return;
  console.log(`\n=== ${subDir.toUpperCase()} ===`);
  const files = fs.readdirSync(dirPath);
  for (const f of files) {
    const fullPath = path.join(dirPath, f);
    const stat = fs.statSync(fullPath);
    if (stat.mtime > new Date('2026-10-05T08:00:00Z')) {
      console.log(`${f} | size: ${stat.size} | birth: ${stat.birthtime.toISOString()} | mtime: ${stat.mtime.toISOString()}`);
    }
  }
}

inspectDir('captures');
inspectDir('composites');
inspectDir('videos');
