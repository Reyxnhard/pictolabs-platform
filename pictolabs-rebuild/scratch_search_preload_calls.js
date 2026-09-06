const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/renderer/assets';
const files = fs.readdirSync(dir);

for (const file of files) {
  if (!file.endsWith('.js')) continue;
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  for (const term of ['connectNativeCamera', 'disconnectNativeCamera', 'currentStatusNativeCamera']) {
    let idx = 0;
    while ((idx = content.indexOf(term, idx)) !== -1) {
      console.log(`\nFound "${term}" in ${file} at offset ${idx}:`);
      console.log(content.slice(Math.max(0, idx - 150), idx + 250));
      idx += term.length + 1;
    }
  }
}
