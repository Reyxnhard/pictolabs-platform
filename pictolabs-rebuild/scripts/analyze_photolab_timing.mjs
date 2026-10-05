import fs from 'fs';

const logContent = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/logs/app-2026-08-30.log', 'utf8');
const lines = logContent.split('\n');

const events = [];
for (const line of lines) {
  if (line.includes('Button Print Clicked') || line.includes('Sending print command to windows') || line.includes('Image Printed') || line.includes('Image generated, printing') || line.includes('deferred sync firing')) {
    const timeMatch = line.match(/\[(\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2})\]/);
    if (timeMatch) {
      events.push({ time: timeMatch[1], text: line.trim() });
    }
  }
}

console.log(`Found ${events.length} print lifecycle events in Photolab log:`);
for (let i = 0; i < Math.min(events.length, 30); i++) {
  console.log(`${events[i].time} | ${events[i].text.substring(25, 120)}`);
}
