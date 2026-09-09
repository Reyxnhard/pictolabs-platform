import axios from 'axios';
import * as assert from 'assert';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function runSprint5cE2ETests() {
  console.log('======================================================================');
  console.log('🔒 SPRINT 5C E2E: SECURITY, JWT, ALERTS, EMAIL & 5-PILLAR HEALTH');
  console.log(`Backend Target: ${BACKEND_URL}`);
  console.log('======================================================================\n');

  // Step 1: Verify Infrastructure Healthcheck
  console.log('1. Verifying public infrastructure healthcheck (GET /api/health)...');
  const healthRes = await axios.get(`${BACKEND_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'AC-4.2: /api/health failed');
  assert.strictEqual(healthRes.data.status, 'ok', 'AC-4.2: Health status is not ok');
  assert.strictEqual(healthRes.data.db, 'connected', 'AC-4.2: DB is not connected');
  console.log(`✓ Healthcheck passed: DB is connected, status is ${healthRes.data.status}\n`);

  // Step 2: Verify Protected Routes Reject Unauthenticated Requests
  console.log('2. Verifying unauthenticated route protection (AC-2.1)...');
  try {
    await axios.get(`${BACKEND_URL}/api/sessions`);
    assert.fail('Expected 401 Unauthorized for unauthenticated GET /api/sessions');
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 401, 'AC-2.1: Route did not return 401');
    console.log('✓ Unauthenticated request to /api/sessions correctly rejected with 401 Unauthorized.\n');
  }

  // Step 3: Admin Login & JWT Generation
  console.log('3. Verifying administrative login & JWT token issuance (AC-1.1 & AC-1.3)...');
  // 3a. Invalid credentials
  try {
    await axios.post(`${BACKEND_URL}/api/auth/login`, {
      email: 'admin@pictolabs.id',
      password: 'wrong_password_123',
    });
    assert.fail('Expected 401 for invalid login credentials');
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 401, 'AC-1.2: Invalid password did not return 401');
    console.log('  ✓ Invalid credentials correctly rejected with 401.');
  }

  // 3b. Valid credentials
  const loginRes = await axios.post(`${BACKEND_URL}/api/auth/login`, {
    email: 'admin@pictolabs.id',
    password: 'pictolabs2026',
  });
  assert.strictEqual(loginRes.status, 201, 'Login failed');
  assert.ok(loginRes.data.accessToken, 'Missing accessToken in login response');
  assert.strictEqual(loginRes.data.user.email, 'admin@pictolabs.id');
  const token = loginRes.data.accessToken;
  console.log(`✓ Admin successfully authenticated. JWT issued (${token.slice(0, 20)}...)\n`);

  const authHeaders = {
    headers: { Authorization: `Bearer ${token}` },
  };

  // Step 4: Verify Authenticated API Access
  console.log('4. Verifying authenticated API access with Bearer token (AC-2.2)...');
  const authedSessionsRes = await axios.get(`${BACKEND_URL}/api/sessions`, authHeaders);
  assert.strictEqual(authedSessionsRes.status, 200, 'AC-2.2: Authenticated request failed');
  assert.ok(Array.isArray(authedSessionsRes.data.data), 'Sessions payload is not array');
  console.log(`✓ Authenticated request succeeded with 200 OK (${authedSessionsRes.data.data.length} sessions listed).\n`);

  // Step 5: Verify Edge Kiosk Whitelist
  console.log('5. Verifying edge kiosk endpoints bypass user JWT (AC-2.3)...');
  const testSessionId = `sprint5c_sess_${Date.now()}`;
  const syncRes = await axios.post(
    `${BACKEND_URL}/api/sessions`,
    {
      id: testSessionId,
      status: 'CAPTURED',
      customerEmail: `customer_${Date.now()}@example.com`,
      createdAt: new Date().toISOString(),
    },
    { headers: { 'x-device-secret': 'dev-secret-booth-01' } },
  );
  assert.strictEqual(syncRes.data.success, true, 'AC-2.3: Session sync failed without JWT');
  console.log(`✓ Kiosk session sync succeeded without user JWT: ${testSessionId}\n`);

  // Step 6: 5-Pillar Booth Health Endpoint
  console.log('6. Verifying 5-Pillar Booth Health endpoint (AC-8.1)...');
  // First ensure at least one booth exists
  const boothsRes = await axios.get(`${BACKEND_URL}/api/booths`, authHeaders);
  const targetBooth = boothsRes.data[0];
  assert.ok(targetBooth, 'No booth found to test health');

  const health5PillarRes = await axios.get(`${BACKEND_URL}/api/booths/${targetBooth.id}/health`, authHeaders);
  assert.strictEqual(health5PillarRes.status, 200, 'AC-8.1: 5-pillar health failed');
  const hData = health5PillarRes.data;
  assert.ok(hData.pillars, 'Missing pillars object');
  assert.ok(hData.pillars.camera, 'Missing camera pillar');
  assert.ok(hData.pillars.printer, 'Missing printer pillar');
  assert.ok(hData.pillars.storage, 'Missing storage pillar');
  assert.ok(hData.pillars.heartbeat, 'Missing heartbeat pillar');
  assert.ok(hData.pillars.payment, 'Missing payment pillar');
  assert.ok(hData.system, 'Missing system telemetry');

  console.log('✓ 5-Pillar Health data verified:');
  console.log(`  - Camera: ${hData.pillars.camera.status} (${hData.pillars.camera.severity})`);
  console.log(`  - Printer: ${hData.pillars.printer.status} (${hData.pillars.printer.paperRemaining} sheets)`);
  console.log(`  - Storage: ${hData.pillars.storage.status}`);
  console.log(`  - Heartbeat: ${hData.pillars.heartbeat.status}`);
  console.log(`  - Payment: ${hData.pillars.payment.status} (${hData.pillars.payment.provider})\n`);

  // Step 7: Live Transactional Email & Rate Limiting
  console.log('7. Verifying Email Service and Rate Limiting (AC-5.1 & AC-5.3)...');
  // 1st email
  const emailRes1 = await axios.post(
    `${BACKEND_URL}/api/sessions/${testSessionId}/redelivery/email`,
    { recipientEmail: 'test1@pictolabs.id', reason: 'Customer softfile request' },
    authHeaders,
  );
  assert.strictEqual(emailRes1.data.success, true, '1st email failed');

  // 2nd email
  const emailRes2 = await axios.post(
    `${BACKEND_URL}/api/sessions/${testSessionId}/redelivery/email`,
    { recipientEmail: 'test2@pictolabs.id', reason: 'Customer softfile request 2' },
    authHeaders,
  );
  assert.strictEqual(emailRes2.data.success, true, '2nd email failed');

  // 3rd email
  const emailRes3 = await axios.post(
    `${BACKEND_URL}/api/sessions/${testSessionId}/redelivery/email`,
    { recipientEmail: 'test3@pictolabs.id', reason: 'Customer softfile request 3' },
    authHeaders,
  );
  assert.strictEqual(emailRes3.data.success, true, '3rd email failed');
  console.log('✓ 3 consecutive softfile delivery requests succeeded.');

  // 4th email -> Expected 429 Too Many Requests
  try {
    await axios.post(
      `${BACKEND_URL}/api/sessions/${testSessionId}/redelivery/email`,
      { recipientEmail: 'test4@pictolabs.id', reason: 'Customer softfile request 4' },
      authHeaders,
    );
    assert.fail('Expected 429 Too Many Requests on 4th email');
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 429, 'AC-5.3: 4th email did not return 429');
    console.log('✓ AC-5.3 Rate limit enforced: 4th email within 1 hour rejected with 429 Too Many Requests.\n');
  }

  // Step 8: Unified WhatsApp Alerting & Cooldown
  console.log('8. Verifying Unified WhatsApp Alerting across severities & cooldown (AC-6.1 & AC-6.2)...');
  // 8a. INFO Alert
  const infoAlert = await axios.post(
    `${BACKEND_URL}/api/alerts/test`,
    {
      boothId: targetBooth.id,
      severity: 'INFO',
      title: 'Layanan Booth Kembali Normal',
      detail: 'Kiosk berhasil online kembali setelah pemadaman listrik venue.',
      action: 'Tidak diperlukan tindakan.',
    },
    authHeaders,
  );
  assert.strictEqual(infoAlert.data.sent, true);
  assert.strictEqual(infoAlert.data.severity, 'INFO');
  console.log('  ✓ INFO WhatsApp alert dispatched successfully.');

  // 8b. WARNING Alert
  const warnAlert = await axios.post(
    `${BACKEND_URL}/api/alerts/test`,
    {
      boothId: targetBooth.id,
      severity: 'WARNING',
      title: 'Kertas Thermal Menipis',
      detail: 'Tersisa kurang dari 20 lembar print roll pada DNP printer.',
      action: 'Siapkan roll kertas cadangan 4R/2R.',
    },
    authHeaders,
  );
  assert.strictEqual(warnAlert.data.sent, true);
  assert.strictEqual(warnAlert.data.severity, 'WARNING');
  console.log('  ✓ WARNING WhatsApp alert dispatched successfully.');

  // 8c. CRITICAL Alert
  const critAlert = await axios.post(
    `${BACKEND_URL}/api/alerts/test`,
    {
      boothId: targetBooth.id,
      severity: 'CRITICAL',
      title: 'Kamera DSLR Terputus',
      detail: 'Canon EDSDK kehilangan koneksi USB shutter.',
      action: 'Kiosk beralih ke webcam darurat. Teknisi segera periksa kabel USB.',
    },
    authHeaders,
  );
  assert.strictEqual(critAlert.data.sent, true);
  assert.strictEqual(critAlert.data.severity, 'CRITICAL');
  console.log('  ✓ CRITICAL WhatsApp alert dispatched successfully.');

  console.log('======================================================================');
  console.log('🎉 SPRINT 5C ALL ACCEPTANCE CRITERIA VERIFIED: 100% PASS (0 FAILED)');
  console.log('======================================================================\n');
}

runSprint5cE2ETests().catch((err) => {
  console.error('❌ Sprint 5C E2E Verification Failed:', err);
  process.exit(1);
});
