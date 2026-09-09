import axios from 'axios';
import * as assert from 'assert';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function runSprint5bE2ETests() {
  console.log('======================================================================');
  console.log('🧪 SPRINT 5B E2E: TIMELINE, HEALTH, REDELIVERY & SUPPORT SEARCH');
  console.log(`Backend Target: ${BACKEND_URL}`);
  console.log('======================================================================\n');

  const testSessionId = `session_5b_test_${Date.now()}`;
  const testEmail = `customer_${Date.now()}@pictolabs.id`;

  // 1. Ingest Base Session
  console.log('1. Ingesting test session for Sprint 5B...');
  const ingestRes = await axios.post(
    `${BACKEND_URL}/api/sessions`,
    {
      id: testSessionId,
      status: 'CAPTURED',
      customerEmail: testEmail,
      customerPhone: '081299887766',
      createdAt: new Date().toISOString(),
    },
    { headers: { 'x-device-secret': 'dev-secret-booth-01' } }
  );
  assert.strictEqual(ingestRes.data.success, true, 'AC-0: Session ingest failed');
  console.log(`✓ Session ingested: ${testSessionId} with email ${testEmail}\n`);

  // 2. Record Timeline Milestones
  console.log('2. Recording timeline lifecycle milestones (AC-1.1)...');
  const events = [
    { eventType: 'SESSION_INIT', stage: 'SESSION', status: 'SUCCESS', durationMs: 0 },
    { eventType: 'PAYMENT_PENDING', stage: 'PAYMENT', status: 'SUCCESS', durationMs: 1200 },
    { eventType: 'PAYMENT_SETTLED', stage: 'PAYMENT', status: 'SUCCESS', durationMs: 8500 },
    { eventType: 'CAPTURE_POSE_1', stage: 'CAPTURE', status: 'SUCCESS', durationMs: 14000 },
    { eventType: 'COMPOSITE_RENDERED', stage: 'PROCESSING', status: 'SUCCESS', durationMs: 2500 },
    { eventType: 'PRINT_COMPLETED', stage: 'PRINTING', status: 'SUCCESS', durationMs: 18000 },
    { eventType: 'R2_UPLOAD_COMPLETED', stage: 'STORAGE', status: 'SUCCESS', durationMs: 4100 },
    { eventType: 'DELIVERY_ISSUED', stage: 'DELIVERY', status: 'SUCCESS', durationMs: 300 },
  ];

  for (const ev of events) {
    const evRes = await axios.post(`${BACKEND_URL}/api/sessions/${testSessionId}/timeline`, ev);
    assert.strictEqual(evRes.status, 201, `Failed recording ${ev.eventType}`);
  }
  console.log(`✓ Recorded ${events.length} chronological lifecycle milestones.\n`);

  // 3. Query Timeline API
  console.log('3. Testing GET /api/sessions/:id/timeline (AC-1.1 & AC-1.2)...');
  const timelineRes = await axios.get(`${BACKEND_URL}/api/sessions/${testSessionId}/timeline`);
  assert.strictEqual(timelineRes.status, 200);
  assert.ok(Array.isArray(timelineRes.data));
  assert.strictEqual(timelineRes.data.length, events.length);
  assert.strictEqual(timelineRes.data[0].eventType, 'SESSION_INIT');
  assert.strictEqual(timelineRes.data[timelineRes.data.length - 1].eventType, 'DELIVERY_ISSUED');
  console.log(`✓ Timeline successfully retrieved with ${timelineRes.data.length} ordered milestones.\n`);

  // 4. Test Health Diagnosis (Healthy)
  console.log('4. Testing GET /api/sessions/:id/health (AC-2.1)...');
  const healthRes = await axios.get(`${BACKEND_URL}/api/sessions/${testSessionId}/health`);
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.data.healthStatus, 'HEALTHY');
  assert.ok(healthRes.data.diagnosticMessage.length > 0);
  console.log(`✓ Health diagnosis verified: ${healthRes.data.healthStatus} — "${healthRes.data.diagnosticMessage}"\n`);

  // 5. Test Resend Delivery Email
  console.log('5. Testing POST /api/sessions/:id/redelivery/email (AC-3.1)...');
  const updatedEmail = `new_${testEmail}`;
  const emailRes = await axios.post(`${BACKEND_URL}/api/sessions/${testSessionId}/redelivery/email`, {
    recipientEmail: updatedEmail,
    reason: 'Customer updated email address via support',
    operatorEmail: 'operator@pictolabs.id',
  });
  assert.strictEqual(emailRes.status, 201);
  assert.strictEqual(emailRes.data.success, true);
  assert.strictEqual(emailRes.data.recipientEmail, updatedEmail);
  console.log(`✓ Delivery email dispatched and customer contact updated to ${updatedEmail}\n`);

  // 6. Test Extend Link Retention
  console.log('6. Testing POST /api/sessions/:id/redelivery/extend-link (AC-3.2)...');
  const extendRes = await axios.post(`${BACKEND_URL}/api/sessions/${testSessionId}/redelivery/extend-link`, {
    extensionDays: 30,
    reason: 'Customer requested 30-day gallery extension',
  });
  assert.strictEqual(extendRes.status, 201);
  assert.strictEqual(extendRes.data.success, true);
  assert.ok(extendRes.data.accessUrl.includes(testSessionId));
  console.log(`✓ Link extended: ${extendRes.data.accessUrl} (expires: ${extendRes.data.expiresAt})\n`);

  // 7. Test Emergency Physical Reprint
  console.log('7. Testing POST /api/sessions/:id/reprint (AC-3.3)...');
  const reprintRes = await axios.post(`${BACKEND_URL}/api/sessions/${testSessionId}/reprint`, {
    copies: 2,
    reason: 'PAPER_JAM',
    notes: 'Paper cut jammed on tray 1; reprinting after clear',
    operatorEmail: 'technician@pictolabs.id',
  });
  assert.strictEqual(reprintRes.status, 201);
  assert.strictEqual(reprintRes.data.success, true);
  assert.strictEqual(reprintRes.data.copies, 2);
  console.log(`✓ Emergency reprint dispatched for 2 copies. Reason: ${reprintRes.data.reason}\n`);

  // 8. Test Redelivery Audit History
  console.log('8. Testing GET /api/sessions/:id/redelivery/history (AC-3.4)...');
  const auditRes = await axios.get(`${BACKEND_URL}/api/sessions/${testSessionId}/redelivery/history`);
  assert.strictEqual(auditRes.status, 200);
  assert.ok(Array.isArray(auditRes.data));
  assert.strictEqual(auditRes.data.length, 3);
  const actionTypes = auditRes.data.map((l: any) => l.actionType);
  assert.ok(actionTypes.includes('RESEND_EMAIL'));
  assert.ok(actionTypes.includes('EXTEND_LINK'));
  assert.ok(actionTypes.includes('PHYSICAL_REPRINT'));
  console.log(`✓ Audit history verified with ${auditRes.data.length} immutable remediation records.\n`);

  // 9. Test Omni-Channel Support Search
  console.log('9. Testing GET /api/support/search (AC-4.1 & AC-4.2)...');
  const searchRes = await axios.get(`${BACKEND_URL}/api/support/search?email=${encodeURIComponent(updatedEmail)}`);
  assert.strictEqual(searchRes.status, 200);
  assert.ok(Array.isArray(searchRes.data.results));
  assert.ok(searchRes.data.results.length >= 1);
  const matched = searchRes.data.results.find((r: any) => r.id === testSessionId);
  assert.ok(matched, `Expected to find session ${testSessionId} by email search`);
  assert.strictEqual(matched.customerEmail, updatedEmail);
  assert.strictEqual(matched.health.healthStatus, 'HEALTHY');
  console.log(`✓ Support search found session ${matched.id} by email: ${matched.customerEmail}\n`);

  // 10. Test Root-Cause Diagnosis on Failed Session
  console.log('10. Testing automated root-cause diagnosis on hardware failure session (AC-2.2)...');
  const failedSessionId = `session_failed_${Date.now()}`;
  await axios.post(
    `${BACKEND_URL}/api/sessions`,
    { id: failedSessionId, status: 'FAILED' },
    { headers: { 'x-device-secret': 'dev-secret-booth-01' } }
  );
  await axios.post(`${BACKEND_URL}/api/sessions/${failedSessionId}/timeline`, {
    eventType: 'PRINT_FAILED',
    stage: 'PRINTING',
    status: 'FAILED',
    errorCode: 'ERR_PRINTER_PAPER_JAM',
    errorMessage: 'DNP thermal printer cutter motor stalled during dual-cut cycle',
  });
  const failedHealthRes = await axios.get(`${BACKEND_URL}/api/sessions/${failedSessionId}/health`);
  assert.strictEqual(failedHealthRes.data.healthStatus, 'FAILED');
  assert.strictEqual(failedHealthRes.data.failureCategory, 'HARDWARE');
  assert.strictEqual(failedHealthRes.data.errorCode, 'ERR_PRINTER_PAPER_JAM');
  assert.ok(failedHealthRes.data.recommendedAction.includes('Reprint'));
  console.log(`✓ Root-cause diagnosis verified on failure: Category=${failedHealthRes.data.failureCategory}, Code=${failedHealthRes.data.errorCode}\n`);

  console.log('======================================================================');
  console.log('🎉 ALL SPRINT 5B BACKEND & SUPPORT ENDPOINTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================================');
}

runSprint5bE2ETests().catch((err) => {
  console.error('❌ SPRINT 5B E2E TEST FAILED:', err.response?.data || err.message);
  process.exit(1);
});
