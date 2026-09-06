const fs = require('fs');

const buf = fs.readFileSync('C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/main/index.jsc');
const str = buf.toString('latin1');

// Let's find all occurrences of strings around connect, disconnect, and liveView
function printSurrounding(keyword, radius = 500) {
  let pos = 0;
  console.log(`\n=================== SURROUNDING: ${keyword} ===================`);
  while ((pos = str.indexOf(keyword, pos)) !== -1) {
    const slice = str.slice(Math.max(0, pos - radius), pos + radius);
    const clean = slice.replace(/[^\x20-\x7E]+/g, ' | ');
    console.log(`[Pos ${pos}]:\n${clean}\n`);
    pos += keyword.length + 10;
  }
}

printSurrounding('CONNECT_NATIVE_CAMERA', 400);
printSurrounding('DISCONNECT_NATICE_CAMERA', 400);
printSurrounding('watchCameras', 400);
printSurrounding('scheduleLiveViewRestore', 400);
