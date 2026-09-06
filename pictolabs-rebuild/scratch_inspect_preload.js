const fs = require('fs');

const buf = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/preload/index.jsc');
const str = buf.toString('latin1');
const matches = str.match(/[\x20-\x7E]{4,}/g) || [];
console.log('Strings in preload/index.jsc:');
console.log([...new Set(matches.filter(s => s.length > 3))]);
