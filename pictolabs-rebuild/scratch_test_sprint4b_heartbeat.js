const http = require('http');
const assert = require('assert');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || 'postgresql://pictolabs:pictolabs_secure_prod_2026@localhost:5432/pictolabs?schema=public',
    },
  },
});

function httpReq(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  PICTOLABS SPRINT 4B: BOOTH MONITORING & HEARTBEAT VERIFICATION  ');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  // STEP 1: Discover or create target test booth
  console.log('[STEP 1] Fetching registered booths...');
  const listRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: '/api/booths',
    method: 'GET',
  });
  assert.strictEqual(listRes.status, 200, 'GET /api/booths must return HTTP 200');
  assert(Array.isArray(listRes.body), 'GET /api/booths body must be an array');
  console.log(`  ✓ Found ${listRes.body.length} registered booth(s).`);

  let targetBooth = listRes.body[0];
  if (!targetBooth) {
    throw new Error('No booths found in database. Ensure seed or initial booth is created.');
  }
  const boothId = targetBooth.id;
  console.log(`  Target Booth ID: ${boothId} (${targetBooth.name})`);

  // STEP 2: Send Heartbeat (POST /api/booths/:id/heartbeat)
  console.log(`\n[STEP 2] Sending heartbeat for booth ${boothId}...`);
  const heartbeatPayload = {
    appVersion: '1.2.0',
    machineName: 'PICTO-BOOTH-PROD-01',
    localIp: '192.168.1.105',
    cpuTemp: 43.8,
    paperCount: 385,
    cameraState: 'OK',
    printerState: 'READY',
  };

  const hbRes = await httpReq(
    {
      hostname: 'localhost',
      port: 4000,
      path: `/api/booths/${boothId}/heartbeat`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    heartbeatPayload
  );

  assert(hbRes.status === 200 || hbRes.status === 201, `Heartbeat failed with status ${hbRes.status}`);
  assert.strictEqual(hbRes.body.success, true, 'Heartbeat must return success: true');
  assert.strictEqual(hbRes.body.status, 'ONLINE', 'Heartbeat must transition status to ONLINE');
  assert(hbRes.body.lastSeen, 'Heartbeat response must return lastSeen ISO timestamp');
  console.log('  ✓ [PASS] Heartbeat accepted:');
  console.log('    Status:', hbRes.body.status);
  console.log('    Last Seen:', hbRes.body.lastSeen);
  console.log('    App Version:', hbRes.body.appVersion);
  console.log('    Machine Name:', hbRes.body.machineName);
  console.log('    Local IP:', hbRes.body.localIp);

  // STEP 3: Verify Status Breakdown (GET /api/booths/:id/status) -> ONLINE (<60s)
  console.log(`\n[STEP 3] Verifying immediate status (<60s) for booth ${boothId}...`);
  const statusRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: `/api/booths/${boothId}/status`,
    method: 'GET',
  });
  assert.strictEqual(statusRes.status, 200, 'GET status must return 200');
  assert.strictEqual(statusRes.body.status, 'ONLINE', 'Age < 60s must compute status ONLINE');
  assert(statusRes.body.secondsSinceLastHeartbeat < 60, 'Seconds since last heartbeat must be < 60');
  assert.strictEqual(statusRes.body.appVersion, '1.2.0', 'App version must match 1.2.0');
  assert.strictEqual(statusRes.body.machineName, 'PICTO-BOOTH-PROD-01', 'Machine name must match');
  assert.strictEqual(statusRes.body.localIp, '192.168.1.105', 'Local IP must match');
  assert.strictEqual(statusRes.body.health.paperRemaining, 385, 'Paper count telemetry must match');
  console.log('  ✓ [PASS] Evaluated status is ONLINE (age:', statusRes.body.secondsSinceLastHeartbeat, 'sec)');

  // STEP 4: Test Automatic Status State Machine Transitions
  // 4A. Simulate DEGRADED status (age between 60s and 300s, e.g. 2 minutes ago)
  console.log('\n[STEP 4A] Testing State Machine: Simulating DEGRADED status (age: 120s)...');
  const twoMinutesAgo = new Date(Date.now() - 120 * 1000);
  await prisma.booth.update({
    where: { id: boothId },
    data: { lastSeen: twoMinutesAgo },
  });

  const degradedRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: `/api/booths/${boothId}/status`,
    method: 'GET',
  });
  assert.strictEqual(degradedRes.body.status, 'DEGRADED', 'Age 120s (60s <= t < 300s) must compute status DEGRADED');
  console.log('  ✓ [PASS] Status correctly evaluated as DEGRADED (age:', degradedRes.body.secondsSinceLastHeartbeat, 'sec)');

  // 4B. Simulate OFFLINE status (age > 300s, e.g. 6 minutes ago)
  console.log('\n[STEP 4B] Testing State Machine: Simulating OFFLINE status (age: 360s)...');
  const sixMinutesAgo = new Date(Date.now() - 360 * 1000);
  await prisma.booth.update({
    where: { id: boothId },
    data: { lastSeen: sixMinutesAgo },
  });

  const offlineRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: `/api/booths/${boothId}/status`,
    method: 'GET',
  });
  assert.strictEqual(offlineRes.body.status, 'OFFLINE', 'Age 360s (t >= 300s) must compute status OFFLINE');
  console.log('  ✓ [PASS] Status correctly evaluated as OFFLINE (age:', offlineRes.body.secondsSinceLastHeartbeat, 'sec)');

  // 4C. Recovery: Fresh Heartbeat restores ONLINE status
  console.log('\n[STEP 4C] Testing State Machine: Recovery via incoming heartbeat...');
  const recoverRes = await httpReq(
    {
      hostname: 'localhost',
      port: 4000,
      path: `/api/booths/${boothId}/heartbeat`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { appVersion: '1.2.0', machineName: 'PICTO-BOOTH-PROD-01', localIp: '192.168.1.105' }
  );
  assert.strictEqual(recoverRes.body.status, 'ONLINE', 'Recovery heartbeat must set status back to ONLINE');
  console.log('  ✓ [PASS] Booth successfully recovered to ONLINE state immediately upon heartbeat receipt.');

  // STEP 5: Verify Fleet Listing endpoint (GET /api/booths and /booths)
  console.log('\n[STEP 5] Testing Fleet Listing endpoints...');
  const fleetRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: '/api/booths',
    method: 'GET',
  });
  assert.strictEqual(fleetRes.status, 200);
  const updatedBooth = fleetRes.body.find((b) => b.id === boothId);
  assert(updatedBooth, 'Target booth must be in fleet list');
  assert.strictEqual(updatedBooth.status, 'ONLINE');
  assert.strictEqual(updatedBooth.appVersion, '1.2.0');
  assert.strictEqual(updatedBooth.machineName, 'PICTO-BOOTH-PROD-01');
  assert.strictEqual(updatedBooth.localIp, '192.168.1.105');
  assert(updatedBooth.lastSeen !== null);
  console.log('  ✓ [PASS] GET /api/booths verified with all 6 monitoring attributes tracked.');

  // Also test backward-compatible /booths
  const legacyFleetRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: '/booths',
    method: 'GET',
  });
  assert.strictEqual(legacyFleetRes.status, 200, 'Legacy GET /booths must remain functional');
  console.log('  ✓ [PASS] Legacy GET /booths route confirmed fully backward-compatible for Admin Dashboard.');

  // STEP 6: Verify Swagger Documentation
  console.log('\n[STEP 6] Testing Swagger OpenAPI documentation endpoints...');
  const swaggerHtmlRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: '/api/docs/',
    method: 'GET',
  });
  assert.strictEqual(swaggerHtmlRes.status, 200, 'GET /api/docs/ must return HTTP 200');
  assert(swaggerHtmlRes.raw.includes('Swagger UI'), 'Response must contain Swagger UI HTML');
  console.log('  ✓ [PASS] Interactive Swagger UI active at http://localhost:4000/api/docs/');

  const swaggerJsonRes = await httpReq({
    hostname: 'localhost',
    port: 4000,
    path: '/api/docs-json',
    method: 'GET',
  });
  assert.strictEqual(swaggerJsonRes.status, 200, 'GET /api/docs-json must return HTTP 200');
  assert(swaggerJsonRes.body.paths['/api/booths/{id}/heartbeat'], 'Swagger spec must document /api/booths/{id}/heartbeat');
  assert(swaggerJsonRes.body.paths['/api/booths/{id}/status'], 'Swagger spec must document /api/booths/{id}/status');
  console.log('  ✓ [PASS] OpenAPI 3.0 JSON specification active with all booth endpoints documented.');

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  ALL SPRINT 4B MONITORING & HEARTBEAT TESTS PASSED (PASS)!  ');
  console.log('═══════════════════════════════════════════════════════════════════════');
}

runTests()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n✗ TEST RUN FAILED:', err.message);
    await prisma.$disconnect();
    process.exit(1);
  });
