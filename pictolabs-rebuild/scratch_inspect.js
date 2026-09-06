const fs = require('fs');

// Read index.jsc strings
const buf = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/main/index.jsc');
const str = buf.toString('latin1');

console.log('=== IPC CAMERA CHANNELS IN MAIN ===');
const matches = str.match(/[A-Z0-9_]{5,}/g) || [];
const cameraChannels = [...new Set(matches.filter(s => s.includes('CAMERA') || s.includes('LIVE_VIEW') || s.includes('DISCONNECT')))];
console.log(cameraChannels);

console.log('\n=== SEARCHING FOR SLEEP / POWER IN MAIN ===');
const sleepTerms = str.match(/[\x20-\x7E]{4,}/g) || [];
const foundSleep = sleepTerms.filter(s => /sleep|power|idle|standby|wakeup|wake|shutdown/i.test(s));
console.log([...new Set(foundSleep)].slice(0, 30));

console.log('\n=== SEARCHING FOR CAMERA LIFECYCLE IN MAIN ===');
const camLifecycle = sleepTerms.filter(s => /connect.*camera|disconnect.*camera|liveview|takepicture|hardconnect/i.test(s));
console.log([...new Set(camLifecycle)]);
