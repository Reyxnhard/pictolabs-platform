const fs = require('fs');
const path = require('path');

const dir = 'C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/renderer/assets';
const files = ['Photobooth-a1c9d72a.js', 'StartPage-ddccaa99.js', 'index-e8362e52.js'];

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  // Check for regex matching electronAPI calls
  const matches = content.match(/[a-zA-Z0-9_$]+\.electronAPI\.[a-zA-Z0-9_$]+/g) || [];
  console.log(`\n=== electronAPI calls in ${file} ===`);
  console.log([...new Set(matches)]);
  
  const matchesWindow = content.match(/window\.electronAPI\.[a-zA-Z0-9_$]+/g) || [];
  console.log(`window.electronAPI calls in ${file}:`, [...new Set(matchesWindow)]);
}
