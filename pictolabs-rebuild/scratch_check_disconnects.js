const fs = require('fs');

const content = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/logs/app-2026-08-30.log', 'utf8');
const lines = content.split('\n');

const disconnects = lines.filter(l => l.includes('CameraDisconnect') || l.includes('detached') || l.includes('sleep'));
console.log(`Found ${disconnects.length} disconnect/detached events on 30-08-2026:`);
console.log(disconnects.slice(0, 20).join('\n'));
