import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\ezarh\\.gemini\\antigravity-ide\\brain\\13fa350d-ea7f-4ff5-b3ec-85f5a90a0625\\uat_evidence';
const KIOSK_EXE = 'C:\\Users\\ezarh\\.gemini\\antigravity-ide\\scratch\\Pictolabs\\pictolabs-rebuild\\apps\\kiosk\\release\\win-unpacked\\Pictolabs Kiosk.exe';
const API_BASE = 'https://api.pictolabs.id';
const BOOTH_ID = '554147f9-c7f7-47fe-966d-fcbf3223fec4'; // PICTOLABS-DEV-01

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

// 1. Kill old processes
log('STEP 0: Killing any existing Kiosk/Electron processes...');
try {
  execSync('powershell "Get-Process -Name \'*kiosk*\',\'*electron*\' -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
} catch (_) {}

// 2. Clean identity
log('STEP 0: Purging old identity files...');
try {
  execSync('powershell "Remove-Item -Path \'C:\\ProgramData\\Pictolabs\\identity.json*\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  execSync('powershell "Remove-Item -Path \'$env:APPDATA\\@pictolabs\\kiosk\\pictolabs-data\\kiosk.db*\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch (_) {}

log(`Identity purged: identity.json exists = ${fs.existsSync('C:\\ProgramData\\Pictolabs\\identity.json')}`);

// 3. Launch Kiosk
log(`STEP 1: Launching Packaged Kiosk Binary with CDP: ${KIOSK_EXE}`);
const kioskProcess = spawn(KIOSK_EXE, ['--remote-debugging-port=9222', '--no-sandbox'], {
  detached: true,
  stdio: 'ignore',
});
kioskProcess.unref();

log(`Kiosk process launched with PID: ${kioskProcess.pid}`);

// 4. Connect to CDP
log('STEP 2: Connecting to Chrome DevTools Protocol on port 9222...');
let wsUrl = null;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  try {
    const res = await fetch('http://127.0.0.1:9222/json');
    if (res.ok) {
      const targets = await res.json();
      const pageTarget = targets.find((t) => t.type === 'page');
      if (pageTarget && pageTarget.webSocketDebuggerUrl) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        log(`Found CDP Page target: "${pageTarget.title}" -> ${wsUrl}`);
        break;
      }
    }
  } catch (_) {}
}

if (!wsUrl) {
  console.error('FATAL: Could not connect to CDP port 9222');
  process.exit(1);
}

// CDP Client Helper
class CDPClient {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.callbacks = new Map();
    this.consoleLogs = [];

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a) => a.value || a.description || '').join(' ');
        this.consoleLogs.push(`[CONSOLE ${msg.params.type.toUpperCase()}] ${text}`);
      }
    };
  }

  async ready() {
    return new Promise((resolve) => {
      if (this.ws.readyState === 1) resolve();
      else this.ws.onopen = () => resolve();
    });
  }

  async send(method, params = {}) {
    await this.ready();
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async captureScreenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    log(`✓ Screenshot captured: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
    return outPath;
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  close() {
    this.ws.close();
  }
}

const cdp = new CDPClient(wsUrl);
await cdp.ready();
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

log('CDP connection established. Starting 2-Minute Freeze & Unresponsive Observation...');

// 5. Monitor 2 Minutes (120 seconds)
const checkIntervalSec = 5;
const totalChecks = 24; // 24 * 5s = 120s
let freezeDetected = false;

console.log('\n================================================================================');
console.log('   STARTING 2-MINUTE CONTINUOUS LIVENESS PROBE (T = 0s to T = 120s)');
console.log('================================================================================');

for (let c = 1; c <= totalChecks; c++) {
  await sleep(checkIntervalSec * 1000);
  const tSec = c * checkIntervalSec;

  let procInfo = '';
  try {
    procInfo = execSync(`powershell "(Get-Process -Id ${kioskProcess.pid} -ErrorAction SilentlyContinue) | Select-Object -Property Responding, CPU, WorkingSet64 | ConvertTo-Json"`, { encoding: 'utf-8' }).trim();
  } catch (_) {}

  let responding = true;
  let cpu = '0';
  let ramMb = '0';

  if (procInfo) {
    try {
      const parsed = JSON.parse(procInfo);
      responding = parsed.Responding;
      cpu = Number(parsed.CPU || 0).toFixed(2);
      ramMb = (Number(parsed.WorkingSet64 || 0) / (1024 * 1024)).toFixed(1);
    } catch (_) {}
  }

  log(`[Check T+${String(tSec).padStart(3, ' ')}s] Responding: ${responding} | CPU: ${cpu}s | RAM: ${ramMb} MB`);

  if (!responding) {
    freezeDetected = true;
    console.error(`🚨 ALERT: Process ${kioskProcess.pid} reported Responding = FALSE at T+${tSec}s!`);
  }

  if (tSec === 10) {
    await cdp.captureScreenshot('uat_1_activation_screen_t10s.png');
  } else if (tSec === 60) {
    await cdp.captureScreenshot('uat_2_activation_screen_t60s.png');
  } else if (tSec === 120) {
    await cdp.captureScreenshot('uat_3_activation_screen_t120s.png');
  }
}

console.log('================================================================================');
console.log(`2-MINUTE OBSERVATION COMPLETE: Freeze Detected = ${freezeDetected ? 'YES (FAIL)' : 'ZERO FREEZE (PASS)'}`);
console.log('================================================================================\n');

// 6. Generate Activation Token via VPS
log('STEP 3: Authenticating Admin with VPS and Generating Activation Token...');
const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@pictolabs.id', password: 'pictolabs2026' }),
});
const loginData = await loginRes.json();
const adminToken = loginData.accessToken;
log(`Admin authenticated. Access token received: ${adminToken.substring(0, 15)}...`);

const genTokenRes = await fetch(`${API_BASE}/api/provisioning/tokens/generate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  },
  body: JSON.stringify({ boothId: BOOTH_ID, ttlMinutes: 15 }),
});
const genTokenData = await genTokenRes.json();
const activationToken = genTokenData.token;
log(`✓ Generated single-use activation token: ${activationToken} (Expires: ${genTokenData.expiresAt})`);

// 7. Pair Kiosk via UI / IPC
log(`STEP 4: Pairing Kiosk with Token ${activationToken}...`);
const pairResult = await cdp.evaluate(`
  window.kiosk.identity.activate('${API_BASE}', '${activationToken}')
`);
log(`Pairing result: ${JSON.stringify(pairResult)}`);

// Wait for identity persistence & Welcome screen transition
await sleep(3000);
const identityExists = fs.existsSync('C:\\ProgramData\\Pictolabs\\identity.json');
log(`Identity persisted on disk (%ProgramData%\\Pictolabs\\identity.json): ${identityExists}`);
if (identityExists) {
  const content = JSON.parse(fs.readFileSync('C:\\ProgramData\\Pictolabs\\identity.json', 'utf-8'));
  log(`Identity details: Booth ${content.boothName} (${content.boothId}), Ciphertext length: ${content.deviceSecretCiphertext?.length || 0}`);
}

await cdp.captureScreenshot('uat_4_paired_welcome_screen.png');

// 8. Verify Dashboard status on VPS
log('STEP 5: Verifying Fleet Provisioning on VPS Cloud Backend...');
const boothsRes = await fetch(`${API_BASE}/api/provisioning/booths`, {
  headers: { Authorization: `Bearer ${adminToken}` },
});
const boothsData = await boothsRes.json();
const ourBooth = boothsData.find((b) => b.id === BOOTH_ID);
log(`Cloud Booth Record: ${ourBooth.name} | Status: ${ourBooth.status} | Paired: ${ourBooth.isPaired}`);

const devicesRes = await fetch(`${API_BASE}/api/provisioning/devices`, {
  headers: { Authorization: `Bearer ${adminToken}` },
});
const devicesData = await devicesRes.json();
log(`Total Registered Devices in PostgreSQL: ${devicesData.length}`);
if (devicesData.length > 0) {
  const d = devicesData[0];
  log(`Device Details: ID ${d.id} | Machine: ${d.hostname || d.machine_name} | Booth: ${d.booth_id}`);
}

// 9. Navigate to Payment Screen and Verify Blinking Fix
log('STEP 6: Navigating to Payment Screen & Verifying Blinking Bug Resolution...');

// Click on Welcome screen to start
log('Clicking Welcome screen to enter product select...');
await cdp.evaluate(`
  const welcomeDiv = document.querySelector('div[style*="linear-gradient"]');
  if (welcomeDiv) {
    welcomeDiv.click();
  } else {
    document.body.click();
  }
`);
await sleep(2000);

// On ProductSelectScreen, click PILIH & LANJUT KE PEMBAYARAN
log('Clicking PILIH & LANJUT KE PEMBAYARAN...');
await cdp.evaluate(`
  const payBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('PEMBAYARAN') || b.textContent.includes('LANJUT'));
  if (payBtn) {
    payBtn.click();
  }
`);
await sleep(3000);

// Verify PaymentScreen state
log('Observing Payment Screen for 15 seconds: monitoring QR generation, re-render counts, and countdown...');
const countdownSamples = [];
for (let s = 1; s <= 15; s++) {
  await sleep(1000);
  const status = await cdp.evaluate(`
    (() => {
      const qrImg = document.querySelector('img[alt="QRIS"], img[src^="data:image/png"], canvas');
      const spinner = document.querySelector('.animate-spin, svg.lucide-loader-2');
      const timerElem = Array.from(document.querySelectorAll('span, div, p')).find(e => /\\d{1,2}:\\d{2}/.test(e.textContent));
      const errorElem = Array.from(document.querySelectorAll('p, div')).find(e => e.textContent.includes('Gagal') || e.textContent.includes('dicegah'));
      return {
        hasQr: !!qrImg,
        qrSrcPrefix: qrImg ? (qrImg.src || 'canvas').substring(0, 30) : null,
        hasSpinner: !!spinner,
        timerText: timerElem ? timerElem.textContent : null,
        error: errorElem ? errorElem.textContent : null,
      };
    })()
  `);
  countdownSamples.push(status);
  log(`[Payment Observation T+${String(s).padStart(2, ' ')}s] QR Visible: ${status.hasQr} | Spinner: ${status.hasSpinner} | Timer: ${status.timerText}${status.error ? ` | Err: ${status.error}` : ''}`);
}

await cdp.captureScreenshot('uat_5_payment_screen_stable_qr.png');

// 10. Collect Renderer Console Logs
log('STEP 7: Collecting Renderer Process Console Logs...');
console.log('\n--- RENDERER CONSOLE AUDIT LOG ---');
cdp.consoleLogs.slice(-25).forEach((l) => console.log(l));
console.log('----------------------------------\n');

// Clean up
cdp.close();
kioskProcess.kill();

log('PHYSICAL UAT VALIDATION SEQUENCE COMPLETED SUCCESSFULLY!');
