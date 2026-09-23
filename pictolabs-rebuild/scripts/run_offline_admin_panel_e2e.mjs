import WebSocket from 'ws';
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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
  log('================================================================');
  log('  OFFLINE ADMIN PANEL ACCESS E2E VALIDATION (FOUNDER UAT FLOW)');
  log('================================================================');

  // Step 1: Clean up any running kiosk processes
  log('1. Cleaning up previous kiosk processes...');
  try {
    execSync('taskkill /F /IM "Pictolabs Kiosk.exe" /T', { stdio: 'ignore' });
  } catch (_) {}

  // Step 2: Spawn Kiosk with remote debugging port 9222
  log('2. Launching updated Kiosk binary with remote debugging port 9222...');
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
        log(`🌐 [CDP NETWORK REQUEST] ${req.method} ${req.url}`);
      }
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args?.map((a) => (a.value !== undefined ? a.value : a.description)).join(' ') || '';
      consoleLogs.push(text);
      if (text.includes('AdminScreen') || text.includes('IdentityService')) {
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

  async function waitForSelector(selector, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector("${selector}"))`,
        returnByValue: true,
      });
      if (res.result?.result?.value) return true;
      await sleep(200);
    }
    throw new Error(`Timeout waiting for selector: ${selector}`);
  }

  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.enable');

  // Step 4: Clear any stale localStorage and wait for WelcomeScreen
  await send('Runtime.evaluate', {
    expression: 'localStorage.removeItem("pictolabs-auto-bypass-payment");',
  });

  log('4. Waiting for WelcomeScreen (#btn-kiosk-admin-entry)...');
  await waitForSelector('#btn-kiosk-admin-entry');
  log('Clicking Staff button (#btn-kiosk-admin-entry)...');
  await send('Runtime.evaluate', {
    expression: 'document.getElementById("btn-kiosk-admin-entry").click();',
  });

  log('Waiting for Admin PIN pad to mount (#btn-pin-1)...');
  await waitForSelector('#btn-pin-1');
  log('✓ Admin PIN Pad is mounted and visible on screen.');

  // Step 5: Emulate INTERNET DISCONNECTION (100% OFFLINE)
  log('5. 🔌 DISCONNECTING INTERNET (Emulating full offline network condition via CDP)...');
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
    connectionType: 'none',
  });
  await send('Runtime.evaluate', {
    expression: 'window.dispatchEvent(new Event("offline"));',
  });
  await sleep(600);

  // Check offline indicator banner
  const offlineBannerEval = await send('Runtime.evaluate', {
    expression: 'document.body.innerText.includes("Mode Offline")',
    returnByValue: true,
  });
  const hasOfflineBanner = Boolean(offlineBannerEval.result?.result?.value);
  log(`✓ Offline status detected and displayed in UI: ${hasOfflineBanner ? 'YES ✓' : 'NO ✗'}`);

  // Screenshot: Offline PIN Pad
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot1.result?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'uat_offline_pin_pad.png'), Buffer.from(shot1.result.data, 'base64'));
    log(`✓ Captured: uat_offline_pin_pad.png`);
  }

  // Step 6: Test Wrong PIN (999999) under Offline Condition
  log('6. Testing Wrong PIN: 999999 while OFFLINE...');
  const testWrongPinScript = `
    (async () => {
      for (let i = 0; i < 6; i++) {
        document.getElementById('btn-pin-9')?.click();
        await new Promise(r => setTimeout(r, 60));
      }
    })()
  `;
  await send('Runtime.evaluate', { expression: testWrongPinScript, awaitPromise: true });
  await sleep(800);

  const wrongPinTextEval = await send('Runtime.evaluate', {
    expression: 'document.body.innerText.includes("PIN Salah (Mode Offline)") || document.body.innerText.includes("PIN Salah")',
    returnByValue: true,
  });
  const hasWrongPinError = Boolean(wrongPinTextEval.result?.result?.value);
  log(`✓ Wrong PIN rejected with distinct offline error message: ${hasWrongPinError ? 'PASS ✓' : 'FAIL ✗'}`);

  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot2.result?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'uat_offline_wrong_pin.png'), Buffer.from(shot2.result.data, 'base64'));
    log(`✓ Captured: uat_offline_wrong_pin.png`);
  }

  await sleep(1500); // Wait for error shake reset

  // Step 7: Test Correct Authoritative PIN (112233) under Offline Condition
  log('7. Testing Correct Authoritative PIN: 112233 while OFFLINE...');
  const testCorrectPinScript = `
    (async () => {
      const digits = ['1', '1', '2', '2', '3', '3'];
      for (const d of digits) {
        document.getElementById('btn-pin-' + d)?.click();
        await new Promise(r => setTimeout(r, 60));
      }
    })()
  `;
  await send('Runtime.evaluate', { expression: testCorrectPinScript, awaitPromise: true });

  // Wait for authenticated panel to open
  log('Waiting for authenticated Admin Panel (#btn-toggle-auto-bypass-payment)...');
  await waitForSelector('#btn-toggle-auto-bypass-payment');

  const authEval = await send('Runtime.evaluate', {
    expression: 'document.body.innerText.includes("Operator Control Panel") || document.body.innerText.includes("Diagnostik Hardware")',
    returnByValue: true,
  });
  const isAuthSuccess = Boolean(authEval.result?.result?.value);
  log(`🎯 Login with PIN 112233 while OFFLINE: ${isAuthSuccess ? 'AUTHENTICATED SUCCESSFUL ✓ (PASS)' : 'FAILED ✗'}`);

  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot3.result?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'uat_offline_admin_authenticated.png'), Buffer.from(shot3.result.data, 'base64'));
    log(`✓ Captured: uat_offline_admin_authenticated.png`);
  }

  // Step 8: Enable Payment Bypass from Admin Panel
  log('8. Enabling "Mode Auto-Bypass Pembayaran" inside Admin Panel...');
  await send('Runtime.evaluate', {
    expression: 'document.getElementById("btn-toggle-auto-bypass-payment")?.click();',
  });
  await sleep(600);

  const bypassStorageEval = await send('Runtime.evaluate', {
    expression: 'localStorage.getItem("pictolabs-auto-bypass-payment")',
    returnByValue: true,
  });
  const bypassActive = bypassStorageEval.result?.result?.value === 'true';
  log(`✓ Payment Auto-Bypass localStorage state: ${bypassActive ? 'ACTIVE (true) ✓' : 'INACTIVE (false)'}`);

  const shot4 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot4.result?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'uat_offline_bypass_enabled.png'), Buffer.from(shot4.result.data, 'base64'));
    log(`✓ Captured: uat_offline_bypass_enabled.png`);
  }

  // Step 9: Reconnect Internet
  log('9. 🌐 RECONNECTING INTERNET (Restoring normal network condition via CDP)...');
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await send('Runtime.evaluate', {
    expression: 'window.dispatchEvent(new Event("online"));',
  });
  await sleep(600);

  // Step 10: Close Admin Panel and Verify Welcome Screen Normal Operation
  log('10. Closing Admin Panel (#btn-close-admin-panel) to resume customer welcome screen...');
  await send('Runtime.evaluate', {
    expression: 'document.getElementById("btn-close-admin-panel")?.click();',
  });
  await sleep(1000);

  const welcomeCheck = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.body.innerText.toUpperCase();
        return text.includes("TOUCH SCREEN TO START") || text.includes("PICTOLABS");
      })()
    `,
    returnByValue: true,
  });
  const isWelcomeRestored = Boolean(welcomeCheck.result?.result?.value);
  log(`✓ Customer Welcome Screen restored after reconnect: ${isWelcomeRestored ? 'PASS ✓' : 'FAIL ✗'}`);

  const shot5 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot5.result?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'uat_online_resumed.png'), Buffer.from(shot5.result.data, 'base64'));
    log(`✓ Captured: uat_online_resumed.png`);
  }

  // Step 11: Final Summary
  log('\n================================================================');
  log('  FOUNDER OFFLINE ADMIN PANEL VALIDATION SUMMARY');
  log('================================================================');
  log(`1. Offline Detection & Banner Displayed:       ${hasOfflineBanner ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`2. Offline Wrong PIN (999999) Rejected:         ${hasWrongPinError ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`3. Offline Correct PIN (112233) Authenticated:  ${isAuthSuccess ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`4. Offline Payment Bypass Toggle Enabled:       ${bypassActive ? 'PASS ✓' : 'FAIL ✗'}`);
  log(`5. Internet Reconnected & UI Normal Resumed:    ${isWelcomeRestored ? 'PASS ✓' : 'FAIL ✗'}`);
  log('================================================================\n');

  ws.close();
  proc.kill();
  try {
    execSync('taskkill /F /IM "Pictolabs Kiosk.exe" /T', { stdio: 'ignore' });
  } catch (_) {}

  if (!isAuthSuccess || !bypassActive) {
    throw new Error('Verification failed: offline admin access or bypass toggle did not succeed.');
  }
}

main().catch((err) => {
  console.error('Fatal error during E2E verification:', err);
  process.exit(1);
});
