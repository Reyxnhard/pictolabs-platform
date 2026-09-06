const fs = require('fs');

const buf = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/main/index.jsc');
const str = buf.toString('latin1');

const idx = str.indexOf('CONNECT_NATIVE_CAMERA');
console.log('--- CONNECT_NATIVE_CAMERA (offset', idx, ') ---');
const slice = str.slice(idx, idx + 3000);
const clean = slice.replace(/[^\x20-\x7E]+/g, ' | ');
console.log(clean);
