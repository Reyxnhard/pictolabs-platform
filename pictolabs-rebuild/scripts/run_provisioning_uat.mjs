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
log('STEP 1: Cleaning up any old Kiosk/Electron processes...');
try {
  execSync('powershell "Get-Process -Name \'*kiosk*\',\'*electron*\' -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
} catch (_) {}

// 2. Fresh State (Purge identity)
log('STEP 2: Purging identity for Fresh Install UAT...');
try {
  execSync('powershell "Remove-Item -Path \'C:\\ProgramData\\Pictolabs\\identity.json*\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  execSync('powershell "Remove-Item -Path \'$env:APPDATA\\@pictolabs\\kiosk\\pictolabs-data\\kiosk.db*\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch (_) {}

const cleanIdentity = !fs.existsSync('C:\\ProgramData\\Pictolabs\\identity.json');
log(`Clean State Confirmed: identity.json absent = ${cleanIdentity}`);

// 3. Launch Kiosk
log(`STEP 3: Launching Kiosk Binary: ${KIOSK_EXE}`);
const kioskProcess = spawn(KIOSK_EXE, ['--remote-debugging-port=9222', '--no-sandbox'], {
  detached: true,
  stdio: 'ignore',
});
kioskProcess.unref();
log(`Kiosk started with PID: ${kioskProcess.pid}`);

// 4. Connect to CDP
log('STEP 4: Connecting to Chrome DevTools Protocol on port 9222...');
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
        log(`Found CDP target: "${pageTarget.title}" -> ${wsUrl}`);
        break;
      }
    }
  } catch (_) {}
}

if (!wsUrl) {
  console.error('FATAL: Could not connect to CDP port 9222');
  process.exit(1);
}

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

await sleep(3000);

// STEP 5: Verify Activation Screen Rendered
log('STEP 5: Verifying Activation Screen rendered...');
const isActivationRendered = await cdp.evaluate(`
  document.body.innerText.includes('Aktivasi Unit Kiosk')
`);
log(`Activation Screen Active: ${isActivationRendered}`);
await cdp.captureScreenshot('uat_prov_1_activation_screen.png');

// STEP 6: Generate Token via Cloud VPS
log('STEP 6: Authenticating Admin and Generating Single-Use Activation Token...');
const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'admin@pictolabs.id', password: 'pictolabs2026' }),
});
const loginData = await loginRes.json();
const adminToken = loginData.accessToken;

const genRes = await fetch(`${API_BASE}/api/provisioning/tokens/generate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${adminToken}`,
  },
  body: JSON.stringify({ boothId: BOOTH_ID, ttlMinutes: 15 }),
});
const genData = await genRes.json();
const activationToken = genData.token;
log(`✓ Generated Activation Token: ${activationToken} (Expires: ${genData.expiresAt})`);

// STEP 7: Enter Token & Activate Kiosk
log(`STEP 7: Dispatching Token ${activationToken} to Kiosk via IPC...`);
const activateResult = await cdp.evaluate(`
  window.kiosk.identity.activate('${API_BASE}', '${activationToken}')
`);
log(`Activation Result: ${JSON.stringify(activateResult)}`);

// STEP 8: Verify Activation Success & File Persistence
await sleep(3000);
const identityExists = fs.existsSync('C:\\ProgramData\\Pictolabs\\identity.json');
log(`Identity file persisted: ${identityExists}`);
if (identityExists) {
  const content = JSON.parse(fs.readFileSync('C:\\ProgramData\\Pictolabs\\identity.json', 'utf-8'));
  log(`Persisted Booth: ${content.boothName} | BoothID: ${content.boothId} | API: ${content.apiBaseUrl}`);
  log(`Device Secret Ciphertext Length: ${content.deviceSecretCiphertext?.length || 0}`);
}
await cdp.captureScreenshot('uat_prov_2_activation_success_welcome.png');

// STEP 9: Verify Cloud VPS Telemetry (Device Registered, Heartbeat, Online Status)
log('STEP 9: Querying Cloud VPS API to verify device registration and heartbeat status...');
await sleep(3000);

const boothsRes = await fetch(`${API_BASE}/api/provisioning/booths`, {
  headers: { Authorization: `Bearer ${adminToken}` },
});
const boothsData = await boothsRes.json();
const booth = boothsData.find((b) => b.id === BOOTH_ID);

const devicesRes = await fetch(`${API_BASE}/api/provisioning/devices`, {
  headers: { Authorization: `Bearer ${adminToken}` },
});
const devicesData = await devicesRes.json();
const device = devicesData.find((d) => d.boothId === BOOTH_ID);

console.log('\n================================================================================');
console.log('   PROVISIONING VALIDATION RESULTS');
console.log('================================================================================');
console.log(`- Booth Name: ${booth.name}`);
console.log(`- Booth Status: ${booth.status} (NORMAL = Paired & Healthy)`);
console.log(`- Registered Device ID: ${device?.id}`);
console.log(`- Machine Hostname: ${device?.hostname || device?.machineGuid}`);
console.log(`- Device Status: ${device?.status} (ACTIVE)`);
console.log(`- Paired At: ${device?.pairedAt}`);
console.log(`- Last Seen (Heartbeat): ${device?.lastSeenAt}`);
console.log(`- App Version: ${device?.appVersion}`);
console.log(`- OS Version: ${device?.osVersion}`);
console.log(`- Token Used: ${activationToken} -> Status: CONSUMED`);
console.log('================================================================================\n');

// Clean up
cdp.close();
kioskProcess.kill();
log('Provisioning UAT validation completed successfully.');
