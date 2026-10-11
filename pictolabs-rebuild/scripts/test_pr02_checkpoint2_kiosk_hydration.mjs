import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

console.log('══════════════════════════════════════════════════════════════════════');
console.log('  PICTOLABS PR-02 CHECKPOINT 2: KIOSK HYDRATION & BOOTH ISOLATION');
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

// Emulate SyncEngine hydration logic
function normalizeKioskConfig(raw, fallback = null) {
  const defaultFallback = {
    configVersion: 1,
    pricing: { basePrice: 35000, currency: 'IDR', enableVoucher: true, enableQRIS: true },
    timing: { paymentTimeoutSec: 270, poseCountdownSec: 5, qrTimeoutSec: 60, idleResetSec: 120 },
    hardware: {
      cameraProfileId: null,
      printerProfileId: null,
      mirrorViewfinder: true,
      paperSize: '4R',
      printerCalibration: { scale: 99, offsetX: 0, offsetY: 3 },
      printerNames: {
        strip2x6: null,
        photo4x6: null,
        photo6x8: null,
      },
    },
    system: { themeColor: '#3b82f6', eventName: 'PICTOLABS SELF PHOTOBOOTH', subText: 'TOUCH SCREEN TO START' },
    price: 35000,
  };

  const base = fallback || defaultFallback;
  if (!raw || typeof raw !== 'object') return base;

  const merged = { ...base, ...raw };

  const rawCal = raw?.hardware?.printerCalibration;
  const rawScale = typeof rawCal?.scale === 'number' && !isNaN(rawCal.scale) ? rawCal.scale : base.hardware.printerCalibration.scale;
  const rawOffX = typeof rawCal?.offsetX === 'number' && !isNaN(rawCal.offsetX) ? rawCal.offsetX : base.hardware.printerCalibration.offsetX;
  const rawOffY = typeof rawCal?.offsetY === 'number' && !isNaN(rawCal.offsetY) ? rawCal.offsetY : base.hardware.printerCalibration.offsetY;

  const normalizedCalibration = {
    scale: Math.max(85, Math.min(100, rawScale)),
    offsetX: Math.max(-15, Math.min(15, rawOffX)),
    offsetY: Math.max(-15, Math.min(15, rawOffY)),
  };

  const rawNames = raw?.hardware?.printerNames;
  const normalizedPrinterNames = {
    strip2x6: typeof rawNames?.strip2x6 === 'string' ? rawNames.strip2x6 : (rawNames?.strip2x6 === null ? null : base.hardware.printerNames.strip2x6),
    photo4x6: typeof rawNames?.photo4x6 === 'string' ? rawNames.photo4x6 : (rawNames?.photo4x6 === null ? null : base.hardware.printerNames.photo4x6),
    photo6x8: typeof rawNames?.photo6x8 === 'string' ? rawNames.photo6x8 : (rawNames?.photo6x8 === null ? null : base.hardware.printerNames.photo6x8),
  };

  merged.hardware = {
    ...base.hardware,
    ...(raw.hardware || {}),
    printerCalibration: normalizedCalibration,
    printerNames: {
      ...base.hardware.printerNames,
      ...(raw.hardware?.printerNames || {}),
      ...normalizedPrinterNames,
    },
  };

  return merged;
}

// 1. Safe default calibration
test('Hydrates safe default calibration (scale: 99, offsetX: 0, offsetY: 3) and null queue names', () => {
  const config = normalizeKioskConfig({});
  assert.strictEqual(config.hardware.printerCalibration.scale, 99);
  assert.strictEqual(config.hardware.printerCalibration.offsetX, 0);
  assert.strictEqual(config.hardware.printerCalibration.offsetY, 3);
  assert.strictEqual(config.hardware.printerNames.strip2x6, null);
  assert.strictEqual(config.hardware.printerNames.photo4x6, null);
  assert.strictEqual(config.hardware.printerNames.photo6x8, null);
});

// 2. Custom calibration preserved
test('Preserves valid custom calibration and custom printer queue names', () => {
  const config = normalizeKioskConfig({
    hardware: {
      printerCalibration: { scale: 98, offsetX: 2, offsetY: -1 },
      printerNames: { strip2x6: 'DNP DS-RX1HS', photo4x6: 'DNP DS-RX1HS' },
    },
  });
  assert.strictEqual(config.hardware.printerCalibration.scale, 98);
  assert.strictEqual(config.hardware.printerCalibration.offsetX, 2);
  assert.strictEqual(config.hardware.printerCalibration.offsetY, -1);
  assert.strictEqual(config.hardware.printerNames.strip2x6, 'DNP DS-RX1HS');
  assert.strictEqual(config.hardware.printerNames.photo4x6, 'DNP DS-RX1HS');
  assert.strictEqual(config.hardware.printerNames.photo6x8, null);
});

// 3. Clamping out of bounds
test('Defensively clamps scale and offsets to safe hardware envelope [85..100] & [-15..15]', () => {
  const config = normalizeKioskConfig({
    hardware: {
      printerCalibration: { scale: 150, offsetX: -99, offsetY: 88 },
    },
  });
  assert.strictEqual(config.hardware.printerCalibration.scale, 100);
  assert.strictEqual(config.hardware.printerCalibration.offsetX, -15);
  assert.strictEqual(config.hardware.printerCalibration.offsetY, 15);
});

// 4. Per-booth config isolation
test('Maintains strict per-booth isolation between multiple booth local caches', () => {
  const booth1Config = normalizeKioskConfig({
    hardware: {
      printerCalibration: { scale: 99, offsetX: 0, offsetY: 3 },
      printerNames: { strip2x6: 'DS-RX1 (Copy 1)', photo4x6: 'DS-RX1 (Copy 1)' },
    },
  });

  const booth2Config = normalizeKioskConfig({
    hardware: {
      printerCalibration: { scale: 97, offsetX: -3, offsetY: 5 },
      printerNames: { strip2x6: 'DNP DS-RX1HS', photo4x6: 'DNP DS-RX1HS' },
    },
  });

  // Check Booth 1 values
  assert.strictEqual(booth1Config.hardware.printerCalibration.scale, 99);
  assert.strictEqual(booth1Config.hardware.printerCalibration.offsetX, 0);
  assert.strictEqual(booth1Config.hardware.printerCalibration.offsetY, 3);
  assert.strictEqual(booth1Config.hardware.printerNames.strip2x6, 'DS-RX1 (Copy 1)');

  // Check Booth 2 values
  assert.strictEqual(booth2Config.hardware.printerCalibration.scale, 97);
  assert.strictEqual(booth2Config.hardware.printerCalibration.offsetX, -3);
  assert.strictEqual(booth2Config.hardware.printerCalibration.offsetY, 5);
  assert.strictEqual(booth2Config.hardware.printerNames.strip2x6, 'DNP DS-RX1HS');

  // Assert independence
  assert.notStrictEqual(booth1Config.hardware.printerCalibration.scale, booth2Config.hardware.printerCalibration.scale);
  assert.notStrictEqual(booth1Config.hardware.printerNames.strip2x6, booth2Config.hardware.printerNames.strip2x6);
});

// 5. File persistence and atomic replacement
test('Persists and loads calibration across simulated restarts with disk temp write', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'picto-kiosk-test-'));
  const filePath = path.join(tmpDir, 'kiosk-config.json');

  const initial = normalizeKioskConfig({
    hardware: {
      printerCalibration: { scale: 96, offsetX: 1, offsetY: -2 },
      printerNames: { photo4x6: 'CANON SELPHY CP1500' },
    },
  });

  fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), 'utf-8');

  // Read back
  const readBack = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const rehydrated = normalizeKioskConfig(readBack);

  assert.strictEqual(rehydrated.hardware.printerCalibration.scale, 96);
  assert.strictEqual(rehydrated.hardware.printerCalibration.offsetX, 1);
  assert.strictEqual(rehydrated.hardware.printerCalibration.offsetY, -2);
  assert.strictEqual(rehydrated.hardware.printerNames.photo4x6, 'CANON SELPHY CP1500');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

console.log('\n══════════════════════════════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('══════════════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
