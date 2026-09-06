const fs = require('fs');
const content = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/renderer/assets/index-e8362e52.js', 'utf8');

let pos = 0;
while ((pos = content.indexOf('electronAPI', pos)) !== -1) {
  console.log('electronAPI found at offset', pos);
  console.log(content.slice(Math.max(0, pos - 100), pos + 100));
  pos += 12;
}
