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
  log('====================================================');
  log('  PRINTER DETECTION & HEALTH RUNTIME VERIFICATION');
  log('====================================================');

  // Step 1: Clean up any running kiosk processes
  log('1. Cleaning up previous kiosk processes...');
  try {
    execSync('taskkill /F /IM "Pictolabs Kiosk.exe" /T', { stdio: 'ignore' });
  } catch (_) {}

  await sleep(1500);

  // Step 2: Spawn Kiosk with remote debugging port 9222
  log('2. Launching packaged Kiosk binary with remote debugging port 9222...');
  const proc = spawn(KIOSK_EXE, ['--remote-debugging-port=9222', '--enable-logging'], {
    stdio: 'ignore',
  });

  await sleep(5000);

  // Step 3: Connect via Chrome DevTools Protocol
  log('3. Connecting to Kiosk Chromium renderer via CDP...');
  const targetsRes = await fetch('http://127.0.0.1:9222/json');
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  log(`Connected to target: "${pageTarget.title}" (${pageTarget.url})`);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args?.map(a => a.value || a.description || '').join(' ');
      if (text.includes('AdminScreen') || text.includes('Printer') || text.includes('PIN')) {
        log(`[Renderer Console] ${text}`);
      }
    }
    if (msg.method === 'Network.responseReceived') {
      const resp = msg.params.response;
      if (resp.url.includes('verify-pin')) {
        log(`[Network Response] ${resp.status} ${resp.statusText} for ${resp.url}`);
      }
    }
  });

  await new Promise((resolve) => ws.on('open', resolve));

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await sendCmd('Runtime.enable');
  await sendCmd('Page.enable');
  await sendCmd('DOM.enable');
  await sendCmd('Network.enable');

  async function evaluate(expression) {
    const res = await sendCmd('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(JSON.stringify(res.result.exceptionDetails));
    }
    return res.result?.result?.value;
  }

  async function captureScreenshot(filepath) {
    const res = await sendCmd('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.result.data, 'base64');
    fs.writeFileSync(filepath, buffer);
    log(`✓ Saved screenshot to ${path.basename(filepath)}`);
  }

  // Step 4: Verify window.kiosk.printer.getHealth()
  log('4. Testing window.kiosk.printer.getHealth()...');
  const health = await evaluate('window.kiosk.printer.getHealth()');
  log(`getHealth() Result: ${JSON.stringify(health, null, 2)}`);

  // Step 5: Verify window.kiosk.printer.getHardwareStatus()
  log('5. Testing window.kiosk.printer.getHardwareStatus()...');
  const hwStatus = await evaluate('window.kiosk.printer.getHardwareStatus()');
  log(`getHardwareStatus() Result: ${JSON.stringify(hwStatus, null, 2)}`);

  // Step 6: Enter AdminScreen via Staff button
  log('6. Clicking Staff button (#btn-kiosk-admin-entry)...');
  await evaluate('document.getElementById("btn-kiosk-admin-entry")?.click()');
  await sleep(1500);

  // Step 7: Enter PIN 112233
  log('7. Entering Admin PIN: 112233...');
  const pinScript = `
    (async () => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const findBtn = (d) => buttons.find(b => b.textContent?.trim() === String(d) || b.id === 'btn-pin-' + d);
      for (const d of ['1', '1', '2', '2', '3', '3']) {
        const btn = findBtn(d);
        if (btn) btn.click();
        await new Promise(r => setTimeout(r, 120));
      }
    })()
  `;
  await evaluate(pinScript);
  await sleep(4000);

  // Step 8: Verify Authenticated Operator Panel
  log('8. Inspecting Operator Panel...');
  const authState = await evaluate(`
    (() => {
      const isAuth = document.body.innerText.includes('OPERATOR CONTROL PANEL') || 
                     document.body.innerText.includes('Diagnostik Hardware') ||
                     document.body.innerText.includes('Thermal Printer');
      
      const badge = Array.from(document.querySelectorAll('span')).find(s => 
        s.textContent.includes('SIAP') || 
        s.textContent.includes('NO_PRINTER') || 
        s.textContent.includes('OFFLINE') || 
        s.textContent.includes('ERROR')
      );

      const printerCard = Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('Thermal Printer'))?.parentElement?.parentElement;
      const cardText = printerCard ? printerCard.innerText : '';

      return {
        isAuthenticated: isAuth,
        badgeText: badge ? badge.textContent.trim() : 'NONE',
        cardText: cardText,
        hasNoPrinter: document.body.innerText.includes('NO_PRINTER'),
        hasSiapBadge: document.body.innerText.includes('✓ SIAP'),
        bodyLength: document.body.innerText.length
      };
    })()
  `);
  log(`Operator Panel State: ${JSON.stringify(authState, null, 2)}`);

  // Step 9: Capture Operator Panel Screenshot
  const ssPath = path.join(ARTIFACT_DIR, 'uat_printer_detection_verified.png');
  await captureScreenshot(ssPath);

  // Step 10: Verify Cut Test still works
  log('10. Testing window.kiosk.printer.cutTest()...');
  const cutResult = await evaluate('window.kiosk.printer.cutTest()');
  log(`Cut Test Result: ${JSON.stringify(cutResult, null, 2)}`);

  ws.close();

  // Summary
  log('====================================================');
  log('  VERIFICATION SUMMARY');
  log('====================================================');
  log(`1. getHealth() ready: ${health?.ready} (Expected: true)`);
  log(`2. getHealth() code: ${health?.code} (Expected: OK)`);
  log(`3. getHealth() name: ${health?.name} (Expected: DS-RX1)`);
  log(`4. getHardwareStatus() status: ${hwStatus?.status} (Expected: READY)`);
  log(`5. Operator Panel Authenticated: ${authState.isAuthenticated} (Expected: true)`);
  log(`6. Thermal Printer Badge: ${authState.badgeText} (Expected: ✓ SIAP)`);
  log(`7. NO_PRINTER Present: ${authState.hasNoPrinter} (Expected: false)`);
  log(`8. Cut Test Success: ${cutResult?.success} (Expected: true)`);
  log('====================================================');

  const allPass = 
    health?.ready === true &&
    health?.code === 'OK' &&
    health?.name === 'DS-RX1' &&
    hwStatus?.status === 'READY' &&
    authState.hasSiapBadge === true &&
    authState.hasNoPrinter === false &&
    cutResult?.success === true;

  if (allPass) {
    log('🎉 ALL PRINTER DETECTION & HARDWARE CHECKS PASSED!');
    process.exit(0);
  } else {
    log('⚠️ SOME CHECKS DID NOT PASS. Review log above.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('FATAL verification error:', err);
  process.exit(1);
});
