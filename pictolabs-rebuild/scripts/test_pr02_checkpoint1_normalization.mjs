/**
 * PICTOLABS PR-02 CHECKPOINT 1 AUTOMATED VERIFICATION
 * Validates Printer Calibration Schema, DTO Bounds, Normalization Clamping, and Merging.
 */

import { BoothsService } from '../apps/backend/dist/booths/booths.service.js';
import { PrinterCalibrationSchema, PrinterNamesSchema } from '../packages/shared/dist/index.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failed++;
  }
}

async function run() {
  console.log('================================================================');
  console.log('PR-02: CHECKPOINT 1 — CALIBRATION NORMALIZATION & VALIDATION');
  console.log('================================================================\n');

  // 1. Zod schema validation
  console.log('--- 1. Shared Zod Schemas ---');
  const defaultCal = PrinterCalibrationSchema.parse({});
  assert(
    defaultCal.scale === 99 && defaultCal.offsetX === 0 && defaultCal.offsetY === 3,
    'PrinterCalibrationSchema defaults to scale 99, offsetX 0, offsetY 3'
  );

  let schemaErrorCaught = false;
  try {
    PrinterCalibrationSchema.parse({ scale: 120 });
  } catch {
    schemaErrorCaught = true;
  }
  assert(schemaErrorCaught, 'PrinterCalibrationSchema rejects scale 120 (> 105)');

  const parsedNames = PrinterNamesSchema.parse({ strip2x6: 'DNP DS-RX1', photo4x6: 'CITIZEN CY-02' });
  assert(
    parsedNames.strip2x6 === 'DNP DS-RX1' && parsedNames.photo4x6 === 'CITIZEN CY-02',
    'PrinterNamesSchema parses custom media queue names'
  );

  // 2. BoothsService normalizeConfigEnvelope
  console.log('\n--- 2. BoothsService Normalization Clamping ---');
  const service = new BoothsService(null, null);

  const env1 = service.normalizeConfigEnvelope({}, 'booth-test-01');
  assert(
    env1.hardware.printerCalibration.scale === 99 &&
    env1.hardware.printerCalibration.offsetX === 0 &&
    env1.hardware.printerCalibration.offsetY === 3,
    'Missing hardware config normalizes to factory defaults (99, 0, 3)'
  );
  assert(
    env1.hardware.printerNames.strip2x6 === null &&
    env1.hardware.printerNames.photo4x6 === null &&
    env1.hardware.printerNames.photo6x8 === null,
    'Missing printerNames normalizes to safe null defaults'
  );

  const env2 = service.normalizeConfigEnvelope({
    hardware: {
      printerCalibration: { scale: 120, offsetX: -50, offsetY: 40 },
    },
  }, 'booth-test-01');
  assert(
    env2.hardware.printerCalibration.scale === 105 &&
    env2.hardware.printerCalibration.offsetX === -25 &&
    env2.hardware.printerCalibration.offsetY === 25,
    'Out-of-bounds calibration safely clamped to [85..105] and [-25..25]'
  );

  const env3 = service.normalizeConfigEnvelope({
    hardware: {
      printerCalibration: { scale: 70, offsetX: 10, offsetY: -15 },
    },
  }, 'booth-test-01');
  assert(
    env3.hardware.printerCalibration.scale === 85 &&
    env3.hardware.printerCalibration.offsetX === 10 &&
    env3.hardware.printerCalibration.offsetY === -15,
    'Low scale (70%) clamped to minimum 85%, valid offsets preserved'
  );

  const env4 = service.normalizeConfigEnvelope({
    hardware: {
      printerNames: { strip2x6: 'DNP DS-RX1HS' },
    },
  }, 'booth-test-01');
  assert(
    env4.hardware.printerNames.strip2x6 === 'DNP DS-RX1HS' &&
    env4.hardware.printerNames.photo4x6 === null,
    'Custom media queue merged without erasing other defaults'
  );

  console.log('\n================================================================');
  console.log(`CHECKPOINT 1 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run();
