import { spawn, execSync } from 'child_process';
import fs from 'fs';

const API_BASE = 'https://api.pictolabs.id';
const KIOSK_EXE = 'C:\\Users\\ezarh\\.gemini\\antigravity-ide\\scratch\\Pictolabs\\pictolabs-rebuild\\apps\\kiosk\\release\\win-unpacked\\Pictolabs Kiosk.exe';
const ID_FILE = 'C:\\ProgramData\\Pictolabs\\identity.json';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

async function getAdminToken() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@pictolabs.id', password: 'pictolabs2026' }),
  });
  const data = await res.json();
  return data.accessToken;
}

async function verifyFleetStatus(token) {
  const res = await fetch(`${API_BASE}/api/booths`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const booths = await res.json();
  return booths[0];
}

async function main() {
  log('====================================================');
  log('  DEVICE VISIBILITY RUNTIME VERIFICATION');
  log('====================================================');

  // Step 1: Clean up any old kiosk processes
  log('1. Cleaning up any previous Kiosk processes...');
  try {
    execSync('powershell "Get-Process -Name \'*kiosk*\' -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
  } catch (_) {}

  // Step 2: Check identity file
  log('2. Verifying local identity file...');
  if (!fs.existsSync(ID_FILE)) {
    console.error('FATAL: identity.json not found at ' + ID_FILE);
    process.exit(1);
  }
  const idData = JSON.parse(fs.readFileSync(ID_FILE, 'utf8'));
  log(`✓ Loaded identity: Booth ${idData.boothName} (${idData.boothId})`);

  // Step 3: Check initial status from Cloud API
  log('3. Authenticating with Cloud Backend...');
  const token = await getAdminToken();
  const initialBooth = await verifyFleetStatus(token);
  log(`Initial Cloud Status for ${initialBooth.name}: ${initialBooth.status} (Last seen: ${initialBooth.lastSeen}, Age: ${initialBooth.secondsSinceLastHeartbeat}s)`);

  // Step 4: Launch updated Kiosk binary
  log('4. Launching updated Kiosk binary (win-unpacked)...');
  let kioskOutput = '';
  let heartbeatSuccessCount = 0;
  let heartbeat400Count = 0;
  let duplicateSocketDisconnections = 0;

  const kiosk = spawn(KIOSK_EXE, ['--enable-logging'], {
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  });

  kiosk.stdout?.on('data', (d) => {
    const str = d.toString();
    kioskOutput += str;
    if (str.includes('HTTP Heartbeat sent -> Effective Status: ONLINE')) {
      heartbeatSuccessCount++;
      log(`🎯 [KIOSK STDOUT] ${str.trim()}`);
    } else if (str.includes('WebSocket connected')) {
      log(`🔌 [KIOSK STDOUT] ${str.trim()}`);
    } else if (str.includes('io server disconnect')) {
      duplicateSocketDisconnections++;
      log(`⚠️ [KIOSK STDOUT] Disconnected: ${str.trim()}`);
    }
  });

  kiosk.stderr?.on('data', (d) => {
    const str = d.toString();
    kioskOutput += str;
    if (str.includes('HTTP Heartbeat returned status 400')) {
      heartbeat400Count++;
      log(`❌ [KIOSK STDERR] 400 Heartbeat Error: ${str.trim()}`);
    } else if (str.includes('HTTP Heartbeat sent')) {
      heartbeatSuccessCount++;
      log(`🎯 [KIOSK STDERR] ${str.trim()}`);
    }
  });

  // Step 5: Wait 35 seconds to allow at least 2 heartbeat intervals
  log('5. Monitoring live Kiosk runtime for 35 seconds...');
  for (let i = 1; i <= 7; i++) {
    await sleep(5000);
    log(`... Elapsed: ${i * 5}s / 35s`);
  }

  // Step 6: Query Cloud Backend while Kiosk is running
  log('6. Verifying real-time Cloud Backend status while Kiosk is alive...');
  const liveBooth = await verifyFleetStatus(token);
  log('----------------------------------------------------');
  log(`Live Booth Name: ${liveBooth.name}`);
  log(`Live Computed Status: ${liveBooth.status}`);
  log(`Live Last Seen: ${liveBooth.lastSeen}`);
  log(`Live Seconds Since Heartbeat: ${liveBooth.secondsSinceLastHeartbeat}s`);
  log(`Live Device Status: ${liveBooth.device?.status}`);
  log(`Live Device Hostname: ${liveBooth.device?.hostname}`);
  log('----------------------------------------------------');

  // Step 7: Terminate test kiosk
  log('7. Terminating test Kiosk process...');
  kiosk.kill();
  await sleep(2000);

  // Step 8: Assertions
  log('\n====================================================');
  log('  FINAL VERIFICATION REPORT');
  log('====================================================');
  log(`Heartbeat 200/201 Success Count: ${heartbeatSuccessCount}`);
  log(`Heartbeat 400 Error Count: ${heartbeat400Count}`);
  log(`Duplicate Socket Disconnections: ${duplicateSocketDisconnections}`);
  log(`Cloud Status: ${liveBooth.status}`);
  log(`Heartbeat Freshness: ${liveBooth.secondsSinceLastHeartbeat}s (< 60s threshold)`);

  const passHeartbeat = heartbeatSuccessCount > 0 && heartbeat400Count === 0;
  const passSocket = duplicateSocketDisconnections === 0;
  const passOnline = liveBooth.status === 'ONLINE' && liveBooth.secondsSinceLastHeartbeat < 60;

  log(`Pass Criteria 1 (Heartbeat Accepted): ${passHeartbeat ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`Pass Criteria 2 (No Duplicate Socket Disconnect): ${passSocket ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`Pass Criteria 3 (Cloud Status is ONLINE): ${passOnline ? 'PASS ✓' : 'FAIL ✗'}`);

  if (passHeartbeat && passSocket && passOnline) {
    log('🎉 ALL VERIFICATION CRITERIA PASSED! Device visibility is 100% resolved.');
    fs.writeFileSync('device_visibility_verification.log', kioskOutput, 'utf8');
    process.exit(0);
  } else {
    log('❌ Verification failed. Check logs.');
    fs.writeFileSync('device_visibility_verification.log', kioskOutput, 'utf8');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
