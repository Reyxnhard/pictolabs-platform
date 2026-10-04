import fs from 'fs';

const buf = fs.readFileSync('apps/kiosk/resources/bin/dnp/print.exe');

const target = Buffer.from("If the printer name contains", "utf16le");
const idx = buf.indexOf(target);
console.log('Target found at offset:', idx);

if (idx !== -1) {
  const start = Math.max(0, idx - 1000);
  const end = Math.min(buf.length, idx + 2000);
  console.log('--- SURROUNDING TEXT ---');
  // Decode utf16le strings
  let s = '';
  for (let i = start; i < end; i += 2) {
    const code = buf.readUInt16LE(i);
    if (code >= 32 && code <= 126) s += String.fromCharCode(code);
    else if (code === 10 || code === 13) s += '\n';
    else s += ' ';
  }
  console.log(s);
}
