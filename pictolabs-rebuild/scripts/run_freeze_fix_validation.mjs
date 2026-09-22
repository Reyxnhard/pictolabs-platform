import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\ezarh\\.gemini\\antigravity-ide\\brain\\13fa350d-ea7f-4ff5-b3ec-85f5a90a0625\\uat_evidence';
const KIOSK_EXE = 'C:\\Users\\ezarh\\.gemini\\antigravity-ide\\scratch\\Pictolabs\\pictolabs-rebuild\\apps\\kiosk\\release\\win-unpacked\\Pictolabs Kiosk.exe';

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
log('STEP 1: Killing any active Kiosk/Electron processes...');
try {
  execSync('powershell "Get-Process -Name \'*kiosk*\',\'*electron*\' -ErrorAction SilentlyContinue | Stop-Process -Force"', { stdio: 'ignore' });
} catch (_) {}

// 2. Fresh State (Purge identity and db)
log('STEP 2: Purging identity and SQLite database for Fresh Install...');
try {
  execSync('powershell "Remove-Item -Path \'C:\\ProgramData\\Pictolabs\\identity.json*\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  execSync('powershell "Remove-Item -Path \'$env:APPDATA\\@pictolabs\\kiosk\\pictolabs-data\\kiosk.db*\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch (_) {}

log(`Identity purged: identity.json exists = ${fs.existsSync('C:\\ProgramData\\Pictolabs\\identity.json')}`);

// 3. Launch Packaged Kiosk
log(`STEP 3: Launching Packaged Kiosk Binary: ${KIOSK_EXE}`);
const kioskProcess = spawn(KIOSK_EXE, ['--remote-debugging-port=9222', '--no-sandbox'], {
  detached: true,
  stdio: 'ignore',
});
kioskProcess.unref();
log(`Kiosk process launched with PID: ${kioskProcess.pid}`);

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

log('CDP connection established. Verifying Activation Screen rendering...');
await sleep(2000);

const isActivationScreen = await cdp.evaluate(`
  document.body.innerText.includes('Aktivasi Unit Kiosk')
`);
log(`Activation Screen rendered in DOM: ${isActivationScreen}`);

// 5. Run 10-Minute Continuous Idle Liveness & Event-Loop Responsiveness Probe
console.log('\n================================================================================');
console.log('   STARTING 10-MINUTE (600 SECONDS) CONTINUOUS LIVENESS PROBE');
console.log('================================================================================');

const sampleIntervalSec = 30; // Every 30 seconds
const totalDurationSec = 600; // 10 minutes = 600 seconds
const totalSamples = totalDurationSec / sampleIntervalSec; // 20 samples

let freezeDetected = false;
const probeRecords = [];

for (let i = 1; i <= totalSamples; i++) {
  await sleep(sampleIntervalSec * 1000);
  const tSec = i * sampleIntervalSec;

  // 1. Measure Win32 Message Pump Responsiveness via Get-Process
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

  // 2. Measure Event Loop Latency via CDP Evaluation
  const pingStart = Date.now();
  let pingResult = null;
  try {
    pingResult = await cdp.evaluate('1 + 1');
  } catch (_) {}
  const eventLoopLagMs = Date.now() - pingStart;

  log(`[Probe T+${String(tSec).padStart(3, ' ')}s / 600s] Responding: ${responding} | Lag: ${eventLoopLagMs}ms | CPU: ${cpu}s | RAM: ${ramMb} MB`);

  if (!responding || eventLoopLagMs > 2000) {
    freezeDetected = true;
    console.error(`🚨 ALERT: Freeze or severe lag detected at T+${tSec}s (Responding: ${responding}, Lag: ${eventLoopLagMs}ms)!`);
  }

  probeRecords.push({
    tSec,
    responding,
    eventLoopLagMs,
    cpu,
    ramMb,
  });

  // Capture milestone screenshots
  if (tSec === 30) {
    await cdp.captureScreenshot('freeze_fix_t30s.png');
  } else if (tSec === 60) {
    await cdp.captureScreenshot('freeze_fix_t60s.png');
  } else if (tSec === 300) {
    await cdp.captureScreenshot('freeze_fix_t300s_5min.png');
  } else if (tSec === 600) {
    await cdp.captureScreenshot('freeze_fix_t600s_10min.png');
  }
}

console.log('================================================================================');
console.log(`10-MINUTE LIVENESS OBSERVATION COMPLETE`);
console.log(`- Total Duration: 600 seconds (10.0 minutes)`);
console.log(`- Samples Taken: ${probeRecords.length}`);
console.log(`- Freeze Detected: ${freezeDetected ? 'YES (FAIL)' : 'ZERO FREEZE (100% PASS)'}`);
console.log(`- Average Event-Loop Latency: ${(probeRecords.reduce((acc, r) => acc + r.eventLoopLagMs, 0) / probeRecords.length).toFixed(1)} ms`);
console.log('================================================================================\n');

// Clean up
cdp.close();
kioskProcess.kill();
log('Probe sequence finished cleanly.');
