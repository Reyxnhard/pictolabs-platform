import fs from 'fs';

const buf = fs.readFileSync('apps/kiosk/resources/bin/dnp/print.exe');

// In .NET 6/7/8 single-file, embedded files start with their headers or MZ / BSJB
// Let's find all occurrences of "BSJB" (.NET metadata signature)
let pos = 0;
const bsjbOffsets = [];
while ((pos = buf.indexOf(Buffer.from('BSJB'), pos)) !== -1) {
  bsjbOffsets.push(pos);
  pos += 4;
}

console.log('BSJB offsets:', bsjbOffsets);

// For each BSJB, let's find the preceding MZ header (start of PE file)
for (const bOffset of bsjbOffsets) {
  // Search backward for "MZ" (0x4D, 0x5A)
  let mzOffset = -1;
  for (let i = bOffset - 4; i >= Math.max(0, bOffset - 0x100000); i--) {
    if (buf[i] === 0x4D && buf[i+1] === 0x5A) {
      // Check if PE header is valid
      const peOffset = buf.readUInt32LE(i + 0x3C);
      if (peOffset < 0x1000 && buf[i + peOffset] === 0x50 && buf[i + peOffset + 1] === 0x45) {
        mzOffset = i;
        break;
      }
    }
  }
  console.log(`BSJB at 0x${bOffset.toString(16)} -> Preceding MZ at 0x${mzOffset.toString(16)}`);
  if (mzOffset > 0) {
    // Extract the embedded DLL!
    // Find length from PE optional header SizeOfImage or bundle entry
    const peOff = buf.readUInt32LE(mzOffset + 0x3C);
    const optHeaderOff = mzOffset + peOff + 4 + 20;
    // For PE32 (0x10b) or PE32+ (0x20b)
    const magic = buf.readUInt16LE(optHeaderOff);
    const sizeOfImage = buf.readUInt32LE(optHeaderOff + 56);
    console.log(`  PE magic: 0x${magic.toString(16)}, sizeOfImage: ${sizeOfImage}`);
    // Save extracted DLL
    const extracted = buf.slice(mzOffset);
    fs.writeFileSync(`scripts/extracted_${mzOffset.toString(16)}.dll`, extracted);
    console.log(`  Saved to scripts/extracted_${mzOffset.toString(16)}.dll`);
  }
}
