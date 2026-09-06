const fs = require('fs');
const path = require('path');

const logDir = 'C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/logs';
const files = fs.readdirSync(logDir);

for (const file of files) {
  if (!file.endsWith('.log')) continue;
  const content = fs.readFileSync(path.join(logDir, file), 'utf8');
  const lines = content.split('\n');
  const matching = lines.filter(l => /canon|camera|liveview|takepicture|connect|sleep|wake/i.test(l) && !l.includes('[Perf]') && !l.includes('reupload'));
  if (matching.length > 0) {
    console.log(`\n=== Found ${matching.length} matches in ${file} ===`);
    console.log(matching.slice(0, 15).join('\n'));
  }
}
