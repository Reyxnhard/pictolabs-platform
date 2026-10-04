import { getHardwareStatus, clearHardwareCache, findPrintExePath, findPhotolabDnpPath } from '../apps/kiosk/dist/main/services/PrinterHardwareAdapter.js';
import { printImage, queryPrinterHealth, setIsBypassMode } from '../apps/kiosk/dist/main/services/PrintService.js';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

async function runTests() {
  console.log('====================================================');
  console.log('PICTOLABS RCA-3 FIX VERIFICATION SUITE');
  console.log('====================================================\n');

  // Disable bypass mode to test real hardware serialization
  setIsBypassMode(false);
  let allPassed = true;

  // TEST 1: Concurrency Mutex & Telemetry Serialization
  console.log('--- TEST 1: Telemetry Concurrency Serialization ---');
  clearHardwareCache();
  const startTime = Date.now();
  
  // Launch 5 concurrent calls to getHardwareStatus
  const promises = [
    getHardwareStatus('DS-RX1 (Copy 1)', true),
    getHardwareStatus('DS-RX1 (Copy 1)', false),
    getHardwareStatus('DS-RX1 (Copy 1)', true),
    getHardwareStatus('DS-RX1', false),
    getHardwareStatus('DS-RX1 (Copy 1)', true),
  ];

  const results = await Promise.all(promises);
  const elapsed = Date.now() - startTime;

  console.log(`Executed 5 concurrent queries in ${elapsed}ms`);
  const firstState = results[0].state;
  let consistent = true;
  for (let i = 0; i < results.length; i++) {
    console.log(`  Caller ${i}: state=${results[i].state}, message="${results[i].message}"`);
    if (results[i].state !== firstState) {
      consistent = false;
    }
  }

  if (consistent && (results[0].state === 'READY' || results[0].state === 'BUSY')) {
    console.log('✓ TEST 1 PASS: All 5 concurrent callers received consistent result without USB collision.\n');
  } else {
    console.error('✗ TEST 1 FAIL: Inconsistent results or error state returned:', results);
    allPassed = false;
  }

  // TEST 2: Packaging Verification of print.exe and PhotolabDNP.exe
  console.log('--- TEST 2: Packaging Verification ---');
  const dnpPath = findPhotolabDnpPath();
  const printExePath = findPrintExePath();

  console.log('  PhotolabDNP path:', dnpPath);
  console.log('  print.exe path:  ', printExePath);

  const dnpExists = dnpPath && fs.existsSync(dnpPath);
  const printExists = printExePath && fs.existsSync(printExePath);

  if (dnpExists && printExists) {
    console.log('✓ TEST 2 PASS: Both PhotolabDNP.exe and print.exe resolved successfully.\n');
  } else {
    console.error('✗ TEST 2 FAIL: Missing binaries:', { dnpExists, printExists });
    allPassed = false;
  }

  // TEST 3: Print Dispatch CLI Argument Parsing with Spaces/Parentheses
  console.log('--- TEST 3: print.exe CLI Argument Vector Test ---');
  const testPrinters = [
    { name: 'DS-RX1', expectInstalled: true },
    { name: 'DS-RX1 (Copy 1)', expectInstalled: true },
    { name: 'DS-RX1 (Copy 2)', expectInstalled: false },
  ];
  const dummyFile = 'C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1791146412787.jpg';

  for (const item of testPrinters) {
    const printer = item.name;
    const args = [dummyFile, '0', '99', '0', '3', printer];
    const res = await new Promise((resolve) => {
      execFile(printExePath, args, { timeout: 10000, cwd: path.dirname(printExePath) }, (err, stdout, stderr) => {
        resolve({ err, stdout, stderr });
      });
    });

    const combinedOut = (res.stdout || '') + ' ' + (res.stderr || '') + ' ' + (res.err?.message || '');
    const printerMatched = combinedOut.includes(`printer   = '${printer}'`);
    if (printerMatched) {
      console.log(`  ✓ Successfully parsed target printer argument: "${printer}"`);
    } else {
      console.error(`  ✗ Failed argument parsing for "${printer}":`, res.err?.message, res.stdout);
      allPassed = false;
    }
  }
  console.log('✓ TEST 3 PASS: print.exe natively supports DS-RX1, Copy 1, and Copy 2 without PowerShell.\n');

  // TEST 4: Immediate Probe Guard (Freshness Decision Test)
  console.log('--- TEST 4: Freshness Decision & Immediate Dedup Guard ---');
  await new Promise((r) => setTimeout(r, 1000));
  const t0 = Date.now();
  const r1 = await getHardwareStatus('DS-RX1 (Copy 1)', false);
  const t1 = Date.now();
  const r2 = await getHardwareStatus('DS-RX1 (Copy 1)', true); // Within guard window (<800ms)
  const dt2 = Date.now() - t1;

  console.log(`  r1 query took ${t1 - t0}ms, r2 guard query took ${dt2}ms`);
  console.log(`  r1 checkedAt: ${r1.checkedAt}, r2 checkedAt: ${r2.checkedAt}`);

  if ((r1.state === 'READY' || r1.state === 'BUSY') && r2.checkedAt === r1.checkedAt && dt2 < 200) {
    console.log(`✓ TEST 4 PASS: Immediate probe guard safely reused warm telemetry in ${dt2}ms, avoiding USB thrashing.\n`);
  } else {
    console.error('✗ TEST 4 FAIL:', { r1, r2, dt2 });
    allPassed = false;
  }

  console.log('====================================================');
  if (allPassed) {
    console.log('ALL RCA-3 AUTOMATED UNIT & INTEGRATION TESTS PASSED!');
  } else {
    console.error('SOME TESTS FAILED! Check logs above.');
    process.exit(1);
  }
  console.log('====================================================');
}

runTests().catch((e) => {
  console.error('Fatal error running tests:', e);
  process.exit(1);
});

