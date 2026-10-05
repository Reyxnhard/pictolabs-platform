import fs from 'fs';

const buf = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/main/index.jsc');
const str = buf.toString('latin1');
const terms = str.match(/[\x20-\x7E]{4,}/g) || [];

console.log('=== PRINT-RELATED STRINGS IN PHOTOLAB MAIN.JSC ===');
const printTerms = terms.filter(s => /print|dnp|spool|exec|paper|rx1|cutter|copies/i.test(s));
console.log([...new Set(printTerms)].slice(0, 100));

console.log('\n=== LOG MESSAGES IN MAIN.JSC ===');
const logTerms = terms.filter(s => /Sending print|Image Printed|Print Command|wrapper|PhotolabDNP/i.test(s));
console.log([...new Set(logTerms)]);
