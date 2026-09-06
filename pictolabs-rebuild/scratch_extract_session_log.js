const fs = require('fs');

const content = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/logs/app-2026-08-30.log', 'utf8');
const lines = content.split('\n');

// Find a session start
const sessionLines = [];
let capturing = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('CONNECT_NATIVE_CAMERA') || line.includes('StartPage') || line.includes('CameraContext') || line.includes('takePicture')) {
    sessionLines.push(line);
    if (sessionLines.length > 50) break;
  }
}

console.log(sessionLines.slice(0, 40).join('\n'));
