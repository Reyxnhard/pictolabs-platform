import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('=== [TEST] Offline Admin PIN Verification Flow ===\n');

  const identityServicePath = path.resolve(__dirname, '../apps/kiosk/dist/main/services/IdentityService.js');
  if (!fs.existsSync(identityServicePath)) {
    throw new Error(`IdentityService.js not found at ${identityServicePath}`);
  }

  const {
    loadIdentity,
    verifyLocalAdminPin,
    saveLocalAdminPin,
    getIdentityFilePath,
    getActiveDeviceSecret,
  } = await import(pathToFileURL(identityServicePath).href);

  const idFile = getIdentityFilePath();
  console.log(`Identity storage path: ${idFile}`);
  console.log(`Identity file exists: ${fs.existsSync(idFile)}`);

  // 1. Boot identity load
  console.log('\n--- Step 1: Boot loadIdentity() ---');
  const identity = loadIdentity('https://api.pictolabs.id', false);
  console.log(`Loaded booth: ${identity?.boothName} (${identity?.boothId})`);
  console.log(`Has device secret: ${Boolean(getActiveDeviceSecret())}`);
  console.log(`Has adminPinCiphertext: ${Boolean(identity?.adminPinCiphertext)}`);

  // 2. Verify with correct PIN '112233'
  console.log('\n--- Step 2: Local Verification with Authoritative PIN "112233" (Offline) ---');
  const res112233 = verifyLocalAdminPin('112233');
  console.log(`PIN "112233" verification result:`, res112233);
  if (!res112233.verified) {
    throw new Error('FAIL: Correct PIN "112233" should be verified locally!');
  }
  console.log('✓ PASS: Legitimate PIN verified 100% offline.');

  // 3. Verify with wrong PIN '999999'
  console.log('\n--- Step 3: Local Verification with Wrong PIN "999999" (Offline) ---');
  const resWrong = verifyLocalAdminPin('999999');
  console.log(`PIN "999999" verification result:`, resWrong);
  if (resWrong.verified) {
    throw new Error('FAIL: Wrong PIN "999999" should NOT be verified!');
  }
  console.log('✓ PASS: Wrong PIN rejected locally.');

  // 4. Test updating PIN to new custom PIN '654321'
  console.log('\n--- Step 4: Update to Custom PIN "654321" ---');
  const saveRes = saveLocalAdminPin('654321');
  console.log(`saveLocalAdminPin("654321") result: ${saveRes}`);
  
  const resNew = verifyLocalAdminPin('654321');
  console.log(`New PIN "654321" verification:`, resNew);
  if (!resNew.verified) {
    throw new Error('FAIL: Newly saved PIN "654321" should be verified!');
  }
  console.log('✓ PASS: Custom PIN updated and verified locally.');

  // 5. Restore authoritative PIN '112233'
  console.log('\n--- Step 5: Restore Authoritative PIN "112233" ---');
  saveLocalAdminPin('112233');
  const resRestored = verifyLocalAdminPin('112233');
  console.log(`Restored PIN "112233" verification:`, resRestored);
  if (!resRestored.verified) {
    throw new Error('FAIL: Restored PIN "112233" should be verified!');
  }
  console.log('✓ PASS: Authoritative PIN "112233" restored.');

  console.log('\n=================================================');
  console.log('ALL OFFLINE ADMIN PIN TESTS PASSED SUCCESSFULLY!');
  console.log('=================================================');
}

runTest().catch((err) => {
  console.error('\n❌ Test Error:', err);
  process.exit(1);
});
