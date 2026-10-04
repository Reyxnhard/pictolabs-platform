import fs from 'fs';

const buf = fs.readFileSync('apps/kiosk/resources/bin/dnp/print.exe');

// Check PE machine type
const peOffset = buf.readUInt32LE(0x3C);
const machine = buf.readUInt16LE(peOffset + 4);
console.log('PE machine: 0x' + machine.toString(16), machine === 0x8664 ? '(x64)' : machine === 0x14C ? '(x86)' : '');

// Extract ASCII strings
const asciiStrings = [];
let cur = '';
for (let i = 0; i < buf.length; i++) {
  const b = buf[i];
  if (b >= 32 && b <= 126) {
    cur += String.fromCharCode(b);
  } else {
    if (cur.length >= 4) asciiStrings.push(cur);
    cur = '';
  }
}

// Extract UTF-16LE strings
const utf16Strings = [];
let cur16 = '';
for (let i = 0; i < buf.length - 1; i += 2) {
  const c = buf.readUInt16LE(i);
  if (c >= 32 && c <= 126) {
    cur16 += String.fromCharCode(c);
  } else {
    if (cur16.length >= 4) utf16Strings.push(cur16);
    cur16 = '';
  }
}

console.log('--- ALL UNIQUE RELEVANT STRINGS ---');
const all = Array.from(new Set([...asciiStrings, ...utf16Strings]));
const filtered = all.filter(s => /print|copy|copies|arg|usage|scale|offset|dnp|rx1|job|spool|format|page/i.test(s));
console.log(filtered.join('\n'));
