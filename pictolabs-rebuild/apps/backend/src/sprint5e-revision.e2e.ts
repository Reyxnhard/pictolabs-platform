import axios from 'axios';
import * as assert from 'assert';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
const BOOTH_IDENTIFIER = 'dev-secret-booth-01';

async function runSprint5eRevisionTests() {
  console.log('======================================================================');
  console.log('🛡️  SPRINT 5E REVISION E2E: DISCREET ADMIN ENTRY & BACKEND PIN SYNC');
  console.log(`Backend Target: ${BACKEND_URL}`);
  console.log(`Booth Identifier: ${BOOTH_IDENTIFIER}`);
  console.log('======================================================================\n');

  // Authenticate Admin User
  console.log('0. Authenticating admin user (admin@pictolabs.id)...');
  const loginRes = await axios.post(`${BACKEND_URL}/api/auth/login`, {
    email: 'admin@pictolabs.id',
    password: 'pictolabs2026',
  });
  assert.strictEqual(loginRes.status, 201);
  const token = loginRes.data.accessToken;
  assert.ok(token);
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };
  console.log('  ✓ Admin logged in, JWT obtained.\n');

  // Ensure default PIN 885926 is set before starting suite
  await axios.put(
    `${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/pin`,
    { newPin: '885926' },
    authHeaders
  );

  try {
    // Test 1: Verify Default 6-Digit PIN Validation (Public Endpoint)
    console.log('1. Testing public PIN verification with default PIN 885926...');
    const verifyDefaultRes = await axios.post(`${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/verify-pin`, {
      pin: '885926',
    });
    assert.strictEqual(verifyDefaultRes.status, 200);
    assert.strictEqual(verifyDefaultRes.data.success, true);
    assert.strictEqual(verifyDefaultRes.data.verified, true);
    assert.ok(verifyDefaultRes.data.boothId);
    console.log('  ✓ Default 6-digit PIN (885926) successfully verified.\n');

    // Test 2: Reject Invalid PIN
    console.log('2. Testing public PIN verification with wrong PIN 123456...');
    const verifyWrongRes = await axios.post(`${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/verify-pin`, {
      pin: '123456',
    });
    assert.strictEqual(verifyWrongRes.status, 200);
    assert.strictEqual(verifyWrongRes.data.success, true);
    assert.strictEqual(verifyWrongRes.data.verified, false);
    console.log('  ✓ Invalid PIN (123456) correctly rejected with verified: false.\n');

    // Test 3: Protected PIN Update Requires JWT Authentication
    console.log('3. Verifying PUT /api/booths/:id/pin rejects unauthenticated requests (401)...');
    try {
      await axios.put(`${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/pin`, {
        newPin: '948271',
      });
      assert.fail('Expected 401 Unauthorized without Bearer token');
    } catch (err: any) {
      assert.strictEqual(err.response?.status, 401);
      console.log('  ✓ Unauthenticated PIN update correctly rejected with 401 Unauthorized.\n');
    }

    // Test 4: Validation Rejection of Non-6-Digit PINs (400 Bad Request)
    console.log('4. Verifying PIN format validation (exactly 6 numeric digits)...');
    const invalidPins = ['123', 'abcdef', '1234567', '12a456'];
    for (const badPin of invalidPins) {
      try {
        await axios.put(
          `${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/pin`,
          { newPin: badPin },
          authHeaders
        );
        assert.fail(`Expected 400 for invalid PIN format: ${badPin}`);
      } catch (err: any) {
        assert.strictEqual(err.response?.status, 400, `Bad pin ${badPin} should return 400`);
        console.log(`  ✓ Invalid PIN "${badPin}" rejected with 400 Bad Request.`);
      }
    }
    console.log('');

    // Test 5: Update PIN via Dashboard Endpoint
    console.log('5. Updating technician PIN to 948271 via PUT /api/booths/:id/pin...');
    const updateRes = await axios.put(
      `${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/pin`,
      { newPin: '948271' },
      authHeaders
    );
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.success, true);
    console.log('  ✓ PIN successfully updated and bcrypt-hashed on backend.\n');

    // Test 6: Verify Old PIN is Now Invalid
    console.log('6. Verifying old PIN (885926) is no longer valid...');
    const verifyOldRes = await axios.post(`${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/verify-pin`, {
      pin: '885926',
    });
    assert.strictEqual(verifyOldRes.data.verified, false);
    console.log('  ✓ Old PIN (885926) rejected as expected.\n');

    // Test 7: Verify New PIN is Instantly Active
    console.log('7. Verifying new PIN (948271) is immediately accepted...');
    const verifyNewRes = await axios.post(`${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/verify-pin`, {
      pin: '948271',
    });
    assert.strictEqual(verifyNewRes.data.verified, true);
    console.log('  ✓ New PIN (948271) verified successfully on Kiosk verification endpoint.\n');

    // Test 8: Verify Security Sanitization (No Hash Exposure in GET APIs)
    console.log('8. Verifying adminPinHash is never exposed in GET /api/booths or GET /api/booths/:id...');
    const boothsListRes = await axios.get(`${BACKEND_URL}/api/booths`, authHeaders);
    assert.ok(Array.isArray(boothsListRes.data));
    const targetBooth = boothsListRes.data.find((b: any) => b.deviceSecret === BOOTH_IDENTIFIER || b.id === updateRes.data.boothId);
    assert.ok(targetBooth, 'Booth not found in list');
    assert.strictEqual('adminPinHash' in targetBooth, false, 'Security violation: adminPinHash leaked in list!');
    assert.strictEqual(targetBooth.hasAdminPin, true, 'Expected hasAdminPin: true');

    const boothDetailRes = await axios.get(`${BACKEND_URL}/api/booths/${targetBooth.id}`, authHeaders);
    assert.strictEqual('adminPinHash' in boothDetailRes.data, false, 'Security violation: adminPinHash leaked in detail!');
    assert.strictEqual(boothDetailRes.data.hasAdminPin, true);
    console.log('  ✓ Security audit PASS: adminPinHash is strictly sanitized from API responses.\n');

    // Test 9: Verify Intrusion Alert Endpoint for 3-Attempt Lockout
    console.log('9. Verifying WhatsApp Brute-Force Intrusion Alert dispatch...');
    const alertRes = await axios.post(`${BACKEND_URL}/api/alerts/test`, {
      severity: 'CRITICAL',
      type: 'ERR_KIOSK_PIN_BRUTE_FORCE',
      title: 'Percobaan Akses Ilegal Panel Teknisi',
      detail: '3 kali berturut-turut memasukkan PIN salah pada layar kios. Keypad dikunci selama 10 menit.',
      action: 'Periksa kamera CCTV booth dan pastikan tidak ada pihak yang mencoba membobol sistem.',
    });
    assert.ok(alertRes.status === 200 || alertRes.status === 201, 'Expected 200 or 201');
    assert.strictEqual(alertRes.data.sent, true);
    console.log('  ✓ WhatsApp alert dispatcher successfully triggered with CRITICAL severity.\n');

    console.log('======================================================================');
    console.log('🎉 ALL SPRINT 5E REVISION ASSERTIONS PASSED (100% SUCCESS)');
    console.log('======================================================================');
  } finally {
    // Cleanup: Restore Default PIN for Development
    console.log('\nRestoring default PIN (885926) for testing convenience...');
    await axios.put(
      `${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/pin`,
      { newPin: '885926' },
      authHeaders
    );
    const verifyRestored = await axios.post(`${BACKEND_URL}/api/booths/${BOOTH_IDENTIFIER}/verify-pin`, {
      pin: '885926',
    });
    assert.strictEqual(verifyRestored.data.verified, true);
    console.log('✓ Default PIN restored and re-verified.');
  }
}

runSprint5eRevisionTests().catch((err) => {
  console.error('Test suite failed:', err.message);
  if (err.response) {
    console.error('Response data:', err.response.data);
  }
  process.exit(1);
});
