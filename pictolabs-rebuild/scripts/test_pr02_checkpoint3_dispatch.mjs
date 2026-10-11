import assert from 'assert';
import fs from 'fs';
import path from 'path';

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  PICTOLABS PR-02 CHECKPOINT 3: DYNAMIC CALIBRATION & QUEUE RESOLUTION');
console.log('══════════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

// ─── 1. SIMULATED QUEUE RESOLUTION LOGIC ─────────────────────────────
// Mirrors apps/kiosk/electron/services/PrintService.ts resolvePrinterQueue & autoDetectPrinter

function autoDetectPrinter(printers) {
  const priorities = ['DNP', 'Citizen', 'Photo', 'Mitsubishi', 'HiTi', 'RX1', 'DS620', 'CX-02', 'P525L', 'CY-02', 'DS-RX1'];
  for (const keyword of priorities) {
    const match = printers.find((p) =>
      p.toLowerCase().includes(keyword.toLowerCase())
    );
    if (match) return match;
  }
  return null;
}

function resolvePrinterQueuePure(params) {
  const {
    requestedPrinter,
    mediaFormat,
    installedPrinters,
    configQueueMap,
    defaultPrinterName
  } = params;

  let candidateQueue = requestedPrinter || null;
  if (candidateQueue === 'Default Printer' || candidateQueue === 'AUTO' || candidateQueue === 'DEFAULT') {
    candidateQueue = null;
  }

  if (!candidateQueue && mediaFormat) {
    if (mediaFormat === '2R' || mediaFormat === 'strip2x6') {
      candidateQueue = configQueueMap?.strip2x6 || null;
    } else if (mediaFormat === '4R' || mediaFormat === 'photo4x6') {
      candidateQueue = configQueueMap?.photo4x6 || null;
    } else if (mediaFormat === '6R' || mediaFormat === 'photo6x8') {
      candidateQueue = configQueueMap?.photo6x8 || null;
    }
  }

  if (candidateQueue) {
    const isInstalled = installedPrinters.some(
      (p) => p.toLowerCase() === candidateQueue.toLowerCase()
    );
    if (!isInstalled && installedPrinters.length > 0) {
      return {
        success: false,
        error: `Antrean printer terkonfigurasi '${candidateQueue}' tidak ditemukan di sistem Windows. Pastikan nama antrean printer sesuai di Admin Panel.`,
      };
    }
    const exactMatch = installedPrinters.find(
      (p) => p.toLowerCase() === candidateQueue.toLowerCase()
    );
    return { success: true, printerName: exactMatch || candidateQueue };
  }

  if (defaultPrinterName) {
    const isInstalled = installedPrinters.length === 0 || installedPrinters.some(
      (p) => p.toLowerCase() === defaultPrinterName.toLowerCase()
    );
    if (isInstalled) {
      const exactMatch = installedPrinters.find(
        (p) => p.toLowerCase() === defaultPrinterName.toLowerCase()
      );
      return { success: true, printerName: exactMatch || defaultPrinterName };
    }
  }

  const autoDetected = autoDetectPrinter(installedPrinters);
  if (autoDetected) {
    return { success: true, printerName: autoDetected };
  }

  return {
    success: false,
    error: 'Tidak ada printer foto yang terdeteksi atau terkonfigurasi di sistem Windows.',
  };
}

// ─── 2. DYNAMIC CALIBRATION ARGUMENT BUILDER ─────────────────────────
// Mirrors apps/kiosk/electron/services/PrintService.ts printArgs assembly

function buildPrintArgs(targetPath, copies, calib, activePrinter) {
  const rawScale = typeof calib?.scale === 'number' && !isNaN(calib.scale) ? calib.scale : 99;
  const rawOffX = typeof calib?.offsetX === 'number' && !isNaN(calib.offsetX) ? calib.offsetX : 0;
  const rawOffY = typeof calib?.offsetY === 'number' && !isNaN(calib.offsetY) ? calib.offsetY : 3;

  const scaleArg = String(Math.max(85, Math.min(105, rawScale)));
  const offXArg = String(Math.max(-25, Math.min(25, rawOffX)));
  const offYArg = String(Math.max(-25, Math.min(25, rawOffY)));

  return [
    targetPath,
    String(copies),
    scaleArg,
    offXArg,
    offYArg,
    activePrinter,
  ];
}

// ─── EXECUTE SUITE ───────────────────────────────────────────────────

async function runSuite() {
  // Test 1: Explicit queue matching installed Windows printer
  test('TEST 1: Explicit queue match resolves exact installed Windows printer name', () => {
    const installed = ['DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const res = resolvePrinterQueuePure({
      requestedPrinter: 'ds-rx1 (copy 2)',
      mediaFormat: '2R',
      installedPrinters: installed,
      configQueueMap: { strip2x6: null, photo4x6: null, photo6x8: null },
      defaultPrinterName: null,
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.printerName, 'DS-RX1 (Copy 2)');
  });

  // Test 2: Explicit configured queue missing from Windows -> FAIL FAST (NO silent redirect)
  test('TEST 2: Explicit queue missing from Windows fails fast with actionable error', () => {
    const installed = ['DS-RX1 (Copy 2)', 'Microsoft Print to PDF'];
    const res = resolvePrinterQueuePure({
      requestedPrinter: 'CITIZEN CY-02',
      mediaFormat: '2R',
      installedPrinters: installed,
      configQueueMap: { strip2x6: null, photo4x6: null, photo6x8: null },
      defaultPrinterName: 'DS-RX1 (Copy 2)',
    });
    assert.strictEqual(res.success, false);
    assert(res.error.includes('CITIZEN CY-02'));
    assert(res.error.includes('tidak ditemukan di sistem Windows'));
  });

  // Test 3: Null queue with media format explicit queue missing -> FAIL FAST
  test('TEST 3: Media format configured queue missing fails fast', () => {
    const installed = ['DS-RX1 (Copy 2)'];
    const res = resolvePrinterQueuePure({
      requestedPrinter: null,
      mediaFormat: '4R',
      installedPrinters: installed,
      configQueueMap: { strip2x6: null, photo4x6: 'DNP DS-RX1 4x6 Dedicated', photo6x8: null },
      defaultPrinterName: 'DS-RX1 (Copy 2)',
    });
    assert.strictEqual(res.success, false);
    assert(res.error.includes('DNP DS-RX1 4x6 Dedicated'));
    assert(res.error.includes('tidak ditemukan di sistem Windows'));
  });

  // Test 4: Null queue with media format explicit queue installed -> resolved to media queue
  test('TEST 4: Media format configured queue installed resolves correctly', () => {
    const installed = ['DS-RX1 (Copy 2)', 'DS-RX1 4x6 Dedicated'];
    const res = resolvePrinterQueuePure({
      requestedPrinter: null,
      mediaFormat: '4R',
      installedPrinters: installed,
      configQueueMap: { strip2x6: null, photo4x6: 'DS-RX1 4x6 Dedicated', photo6x8: null },
      defaultPrinterName: 'DS-RX1 (Copy 2)',
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.printerName, 'DS-RX1 4x6 Dedicated');
  });

  // Test 5: Null queue and null media format fallback to default printer
  test('TEST 5: Null queue falls back safely to verified default printer', () => {
    const installed = ['DS-RX1 (Copy 2)', 'Fax'];
    const res = resolvePrinterQueuePure({
      requestedPrinter: null,
      mediaFormat: '2R',
      installedPrinters: installed,
      configQueueMap: { strip2x6: null, photo4x6: null, photo6x8: null },
      defaultPrinterName: 'DS-RX1 (Copy 2)',
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.printerName, 'DS-RX1 (Copy 2)');
  });

  // Test 6: Legacy AUTO or 'Default Printer' string treated as null (not literal queue)
  test('TEST 6: Legacy AUTO and Default Printer strings are safely sanitized', () => {
    const installed = ['DS-RX1 (Copy 2)'];
    const resAuto = resolvePrinterQueuePure({
      requestedPrinter: 'AUTO',
      mediaFormat: null,
      installedPrinters: installed,
      configQueueMap: null,
      defaultPrinterName: 'DS-RX1 (Copy 2)',
    });
    assert.strictEqual(resAuto.success, true);
    assert.strictEqual(resAuto.printerName, 'DS-RX1 (Copy 2)');

    const resDef = resolvePrinterQueuePure({
      requestedPrinter: 'Default Printer',
      mediaFormat: null,
      installedPrinters: installed,
      configQueueMap: null,
      defaultPrinterName: 'DS-RX1 (Copy 2)',
    });
    assert.strictEqual(resDef.success, true);
    assert.strictEqual(resDef.printerName, 'DS-RX1 (Copy 2)');
  });

  // Test 7: Zero photo printers installed -> fails fast with photo printer error
  test('TEST 7: No photo printer in Windows rejects safely with actionable error', () => {
    const installed = ['Microsoft Print to PDF', 'Fax', 'OneNote (Desktop)'];
    const res = resolvePrinterQueuePure({
      requestedPrinter: null,
      mediaFormat: '2R',
      installedPrinters: installed,
      configQueueMap: { strip2x6: null, photo4x6: null, photo6x8: null },
      defaultPrinterName: null,
    });
    assert.strictEqual(res.success, false);
    assert(res.error.includes('Tidak ada printer foto yang terdeteksi'));
  });

  // Test 8: Dynamic calibration arguments with default values
  test('TEST 8: Dynamic calibration arguments with default values [99%, 0, 3]', () => {
    const args = buildPrintArgs('C:\\photos\\strip.jpg', 2, { scale: 99, offsetX: 0, offsetY: 3 }, 'DS-RX1 (Copy 2)');
    assert.deepStrictEqual(args, [
      'C:\\photos\\strip.jpg',
      '2',
      '99',
      '0',
      '3',
      'DS-RX1 (Copy 2)'
    ]);
  });

  // Test 9: Dynamic calibration arguments with custom calibrated values
  test('TEST 9: Custom calibration values correctly propagated to CLI argument vector', () => {
    const args = buildPrintArgs('C:\\photos\\strip.jpg', 1, { scale: 97, offsetX: -8, offsetY: 12 }, 'DS-RX1 (Copy 2)');
    assert.deepStrictEqual(args, [
      'C:\\photos\\strip.jpg',
      '1',
      '97',
      '-8',
      '12',
      'DS-RX1 (Copy 2)'
    ]);
  });

  // Test 10: Dynamic calibration arguments clamp out-of-bounds scale and offsets
  test('TEST 10: Out-of-bounds calibration strictly clamped to approved safe limits [85..105, -25..25]', () => {
    const args = buildPrintArgs('C:\\photos\\strip.jpg', 1, { scale: 120, offsetX: -60, offsetY: 80 }, 'DS-RX1 (Copy 2)');
    assert.deepStrictEqual(args, [
      'C:\\photos\\strip.jpg',
      '1',
      '105',
      '-25',
      '25',
      'DS-RX1 (Copy 2)'
    ]);

    const argsUnder = buildPrintArgs('C:\\photos\\strip.jpg', 1, { scale: 60, offsetX: -35, offsetY: -35 }, 'DS-RX1 (Copy 2)');
    assert.deepStrictEqual(argsUnder, [
      'C:\\photos\\strip.jpg',
      '1',
      '85',
      '-25',
      '-25',
      'DS-RX1 (Copy 2)'
    ]);
  });

  // Test 11: Missing or null calibration safely falls back to defaults
  test('TEST 11: Missing or null calibration fields fallback safely to defaults', () => {
    const argsNull = buildPrintArgs('C:\\photos\\strip.jpg', 1, null, 'DS-RX1 (Copy 2)');
    assert.deepStrictEqual(argsNull, [
      'C:\\photos\\strip.jpg',
      '1',
      '99',
      '0',
      '3',
      'DS-RX1 (Copy 2)'
    ]);

    const argsNaN = buildPrintArgs('C:\\photos\\strip.jpg', 1, { scale: NaN, offsetX: null, offsetY: undefined }, 'DS-RX1 (Copy 2)');
    assert.deepStrictEqual(argsNaN, [
      'C:\\photos\\strip.jpg',
      '1',
      '99',
      '0',
      '3',
      'DS-RX1 (Copy 2)'
    ]);
  });

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} PASSED / ${failed} FAILED (${Math.round((passed / (passed + failed)) * 100)}%)`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
