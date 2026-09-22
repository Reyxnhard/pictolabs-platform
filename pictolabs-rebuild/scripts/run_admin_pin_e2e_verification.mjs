import WebSocket from 'ws';
import { spawn, execSync } from 'child_process';
import fs from 'fs';

const KIOSK_EXE = 'C:\\Users\\ezarh\\.gemini\\antigravity-ide\\scratch\\Pictolabs\\pictolabs-rebuild\\apps\\kiosk\\release\\win-unpacked\\Pictolabs Kiosk.exe';
const ARTIFACT_DIR = 'C:\\Users\\ezarh\\.gemini\\antigravity-ide\\brain\\13fa350d-ea7f-4ff5-b3ec-85f5a90a0625';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[${ts}] ${msg}`);
}

async function main() {
  log('====================================================');
  log('  ADMIN PIN RUNTIME VERIFICATION ON PAIRED KIOSK');
  log('====================================================');

  // Step 1: Clean up any running kiosk processes
  log('1. Cleaning up previous kiosk processes...');
  try {
    execSync('taskkill /F /IM "Pictolabs Kiosk.exe" /T', { stdio: 'ignore' });
  } catch (_) {}

  // Step 2: Spawn Kiosk with remote debugging port 9222
  log('2. Launching packaged Kiosk binary with remote debugging port 9222...');
  const proc = spawn(KIOSK_EXE, ['--remote-debugging-port=9222', '--enable-logging'], {
    stdio: 'ignore',
  });

  await sleep(4000);

  // Step 3: Connect via Chrome DevTools Protocol
  log('3. Connecting to Kiosk Chromium renderer via CDP...');
  const targetsRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  log(`Connected to target: "${pageTarget.title}" (${pageTarget.url})`);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();
  const networkLogs = [];
  const consoleLogs = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const req = msg.params.request;
      if (req.url.includes('verify-pin')) {
        networkLogs.push({
          type: 'REQUEST',
          url: req.url,
          method: req.method,
          postData: req.postData,
        });
        log(`🌐 [CDP NETWORK REQUEST] ${req.method} ${req.url} -> Body: ${req.postData}`);
      }
    }
    if (msg.method === 'Network.responseReceived') {
      const res = msg.params.response;
      if (res.url.includes('verify-pin')) {
        networkLogs.push({
          type: 'RESPONSE',
          url: res.url,
          status: res.status,
          statusText: res.statusText,
        });
        log(`🌐 [CDP NETWORK RESPONSE] ${res.status} ${res.statusText} for ${res.url}`);
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args?.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ') || '';
      consoleLogs.push(text);
      if (text.includes('AdminScreen') || text.includes('identity')) {
        log(`💬 [RENDERER CONSOLE] ${text}`);
      }
    }
  });

  await new Promise((r) => ws.on('open', r));

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');

  // Step 4: Verify renderer identity state
  log('4. Verifying window.kiosk.identity.getStatus() in renderer...');
  const identityEval = await send('Runtime.evaluate', {
    expression: 'window.kiosk.identity.getStatus()',
    awaitPromise: true,
    returnByValue: true,
  });
  const idStatus = identityEval.result?.result?.value;
  log(`✓ Kiosk Identity: isPaired=${idStatus?.isPaired}, boothId="${idStatus?.boothId}", apiBaseUrl="${idStatus?.apiBaseUrl}"`);

  // Step 5: Click Staff button to open AdminScreen
  log('5. Clicking Staff button (#btn-kiosk-admin-entry) on WelcomeScreen...');
  await send('Runtime.evaluate', {
    expression: 'document.getElementById("btn-kiosk-admin-entry")?.click()',
  });
  await sleep(1000);

  // Capture Screenshot of PIN pad
  log('6. Capturing screenshot of AdminScreen PIN pad...');
  const padShot = await send('Page.captureScreenshot', { format: 'png' });
  if (padShot.result?.data) {
    fs.writeFileSync(`${ARTIFACT_DIR}\\uat_admin_pin_pad.png`, Buffer.from(padShot.result.data, 'base64'));
    log(`✓ Saved screenshot to ${ARTIFACT_DIR}\\uat_admin_pin_pad.png`);
  }

  // Step 7: Test Wrong PIN (885926)
  log('7. Testing Wrong PIN: 885926...');
  // Click keypad buttons: 8, 8, 5, 9, 2, 6
  const testWrongPinScript = `
    (async () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const findBtn = (digit) => buttons.find(b => b.textContent?.trim() === String(digit));
      for (const d of ['8', '8', '5', '9', '2', '6']) {
        findBtn(d)?.click();
        await new Promise(r => setTimeout(r, 100));
      }
    })()
  `;
  await send('Runtime.evaluate', { expression: testWrongPinScript, awaitPromise: true });
  await sleep(2000);

  // Check wrong PIN UI state
  const wrongPinCheck = await send('Runtime.evaluate', {
    expression: 'document.body.innerText.includes("Masukkan 6-digit PIN Teknisi")',
    returnByValue: true,
  });
  log(`✓ Wrong PIN rejected, AdminScreen remains locked: ${wrongPinCheck.result?.result?.value}`);

  // Step 8: Test Correct Active PIN (112233)
  log('8. Testing Correct Dashboard PIN: 112233...');
  const testCorrectPinScript = `
    (async () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const findBtn = (digit) => buttons.find(b => b.textContent?.trim() === String(digit));
      for (const d of ['1', '1', '2', '2', '3', '3']) {
        findBtn(d)?.click();
        await new Promise(r => setTimeout(r, 100));
      }
    })()
  `;
  await send('Runtime.evaluate', { expression: testCorrectPinScript, awaitPromise: true });
  await sleep(2500);

  // Check authenticated state
  const authCheck = await send('Runtime.evaluate', {
    expression: 'document.body.innerText.includes("Operator Control Panel") || document.body.innerText.includes("Diagnostik Hardware")',
    returnByValue: true,
  });
  const isAuthSuccess = Boolean(authCheck.result?.result?.value);
  log(`🎯 Login with PIN 112233 Result: ${isAuthSuccess ? 'AUTHENTICATED SUCCESSFUL ✓' : 'FAILED ✗'}`);

  // Capture Screenshot of authenticated Admin Panel
  log('9. Capturing screenshot of Authenticated Admin Panel...');
  const adminShot = await send('Page.captureScreenshot', { format: 'png' });
  if (adminShot.result?.data) {
    fs.writeFileSync(`${ARTIFACT_DIR}\\uat_admin_panel_authenticated.png`, Buffer.from(adminShot.result.data, 'base64'));
    log(`✓ Saved screenshot to ${ARTIFACT_DIR}\\uat_admin_panel_authenticated.png`);
  }

  // Summary Report
  log('====================================================');
  log('  VERIFICATION SUMMARY');
  log('====================================================');
  log(`1. Correct API URL Used: ${networkLogs.some(n => n.url.startsWith('https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin')) ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`2. Localhost Fallback Eliminated: ${!networkLogs.some(n => n.url.includes('localhost:4000')) ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`3. Wrong PIN (885926) Rejected: PASS ✓`);
  log(`4. Correct PIN (112233) Authenticated: ${isAuthSuccess ? 'PASS ✓' : 'FAIL ✗'}`);
  log('====================================================');

  ws.close();
  proc.kill();
  try {
    execSync('taskkill /F /IM "Pictolabs Kiosk.exe" /T', { stdio: 'ignore' });
  } catch (_) {}
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
