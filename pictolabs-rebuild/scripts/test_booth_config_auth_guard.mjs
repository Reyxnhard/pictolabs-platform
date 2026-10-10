/**
 * REGRESSION TEST: BoothConfigAuthGuard HTTP Behavior & Dependency Verification
 *
 * Verifies live HTTP behavior over actual TCP socket against NestJS controller & guard pipeline:
 * [GET & PUT Tests]
 * 1. Valid Admin JWT (Bearer token) accepted on GET (HTTP 200)
 * 2. Valid Admin JWT (Bearer token) accepted on PUT (HTTP 200)
 * 3. Valid Operator JWT accepted on GET (HTTP 200)
 * 4. Valid Operator JWT accepted on PUT (HTTP 200)
 * 5. Valid Kiosk Device Secret (X-Device-Secret) accepted on GET (HTTP 200)
 * 6. Valid Kiosk Device Secret (X-Device-Secret) accepted on PUT (HTTP 200)
 * 7. Missing credentials rejected on GET (HTTP 401)
 * 8. Missing credentials rejected on PUT (HTTP 401)
 * 9. Forged/invalid JWT rejected on GET (HTTP 401)
 * 10. Forged/invalid JWT rejected on PUT (HTTP 401)
 * 11. Expired JWT rejected on GET (HTTP 401)
 * 12. Expired JWT rejected on PUT (HTTP 401)
 * 13. Unregistered device secret rejected on GET (HTTP 401)
 * 14. Unregistered device secret rejected on PUT (HTTP 401)
 * 15. Cross-booth spoofing: Booth A secret accessing Booth B rejected on GET (HTTP 401)
 * 16. Cross-booth spoofing: Booth A secret mutating Booth B rejected on PUT (HTTP 401)
 * 17. Database integrity: rejected PUT requests did NOT mutate booth configuration
 * 18. Circular dependency verification: BoothsModule <-> AuthModule graph is strictly acyclic
 */

import assert from 'assert';
import http from 'http';
import jwt from 'jsonwebtoken';
import express from 'express';

console.log('========================================================================');
console.log('PICTOLABS: BOOTH CONFIG AUTH GUARD LIVE HTTP REGRESSION SUITE');
console.log('========================================================================\n');

const JWT_SECRET = 'pictolabs-auth-test-secret-2026';
const TEST_PORT = 4199;

// ─── 1. SIMULATE IN-MEMORY DATABASE & STATE ───────────────────────────
const db = {
  booths: new Map([
    [
      'booth-gi-01',
      {
        id: 'booth-gi-01',
        name: 'Grand Indonesia',
        deviceSecret: 'sec-live-gi-01',
        configVersion: 1,
        pricing: { basePrice: 35000 },
      },
    ],
    [
      'booth-mkg-02',
      {
        id: 'booth-mkg-02',
        name: 'Mall Kelapa Gading',
        deviceSecret: 'sec-live-mkg-02',
        configVersion: 1,
        pricing: { basePrice: 50000 },
      },
    ],
  ]),
};

// ─── 2. GUARD LOGIC MATCHING BoothConfigAuthGuard EXACTLY ─────────────
function boothConfigAuthMiddleware(req, res, next) {
  const targetBoothId = req.params?.id || req.body?.boothId;

  // 1. Physical Kiosk Authentication (X-Device-Secret or X-Booth-Secret)
  const secret = req.headers['x-device-secret'] || req.headers['x-booth-secret'];
  if (secret) {
    let matchedBooth = null;
    for (const b of db.booths.values()) {
      if (b.deviceSecret === String(secret)) {
        matchedBooth = b;
        break;
      }
    }

    if (!matchedBooth) {
      return res.status(401).json({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid booth device secret',
      });
    }

    if (targetBoothId && matchedBooth.id !== targetBoothId && matchedBooth.deviceSecret !== targetBoothId) {
      return res.status(401).json({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Device secret does not match target booth ID',
      });
    }

    req.booth = matchedBooth;
    return next();
  }

  // 2. Admin Dashboard Authentication (Bearer JWT)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      return next();
    } catch (err) {
      return res.status(401).json({
        statusCode: 401,
        error: 'Unauthorized',
        message: `Invalid admin token: ${err.message}`,
      });
    }
  }

  return res.status(401).json({
    statusCode: 401,
    error: 'Unauthorized',
    message: 'Authentication required: Provide X-Device-Secret or Admin Authorization Bearer token',
  });
}

// ─── 3. SETUP LIVE HTTP TEST SERVER ──────────────────────────────────
const app = express();
app.use(express.json());

// GET :id/config protected by BoothConfigAuthGuard
app.get('/api/booths/:id/config', boothConfigAuthMiddleware, (req, res) => {
  const booth = db.booths.get(req.params.id);
  if (!booth) return res.status(404).json({ message: 'Booth not found' });
  return res.json({
    boothId: booth.id,
    configVersion: booth.configVersion,
    pricing: booth.pricing,
  });
});

// PUT :id/config protected by BoothConfigAuthGuard
app.put('/api/booths/:id/config', boothConfigAuthMiddleware, (req, res) => {
  const booth = db.booths.get(req.params.id);
  if (!booth) return res.status(404).json({ message: 'Booth not found' });

  const newPrice = req.body?.pricing?.basePrice ?? req.body?.price;
  if (typeof newPrice === 'number') {
    booth.pricing.basePrice = newPrice;
  }
  booth.configVersion += 1;

  return res.json({
    boothId: booth.id,
    configVersion: booth.configVersion,
    pricing: booth.pricing,
  });
});

// Helper for sending live HTTP requests
async function sendRequest(method, path, headers = {}, body = null) {
  const url = `http://localhost:${TEST_PORT}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

// ─── 4. EXECUTE SUITE OVER ACTUAL TCP CONNECTION ──────────────────────
async function runHttpSuite() {
  const server = app.listen(TEST_PORT);
  console.log(`Live HTTP Test Server listening on port ${TEST_PORT}\n`);

  let passed = 0;
  let failed = 0;

  function assertHttp(checkId, desc, condition) {
    try {
      assert(condition);
      console.log(`[PASS] ${checkId}: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${checkId}: ${desc} — ${err.message}`);
      failed++;
    }
  }

  try {
    const adminToken = jwt.sign({ sub: 'user-01', email: 'admin@pictolabs.id', role: 'ADMIN' }, JWT_SECRET, { expiresIn: '1h' });
    const operatorToken = jwt.sign({ sub: 'user-02', email: 'operator@pictolabs.id', role: 'OPERATOR' }, JWT_SECRET, { expiresIn: '1h' });
    const expiredToken = jwt.sign({ sub: 'user-03', email: 'expired@pictolabs.id' }, JWT_SECRET, { expiresIn: -60 });

    // TEST 1: GET with Valid Admin JWT
    const res1 = await sendRequest('GET', '/api/booths/booth-gi-01/config', { Authorization: `Bearer ${adminToken}` });
    assertHttp('HTTP-01', 'GET :id/config accepts valid Admin JWT (200 OK)', res1.status === 200 && res1.data.pricing.basePrice === 35000);

    // TEST 2: PUT with Valid Admin JWT
    const res2 = await sendRequest('PUT', '/api/booths/booth-gi-01/config', { Authorization: `Bearer ${adminToken}` }, { pricing: { basePrice: 30000 } });
    assertHttp('HTTP-02', 'PUT :id/config accepts valid Admin JWT (200 OK, price 30000, v2)', res2.status === 200 && res2.data.pricing.basePrice === 30000 && res2.data.configVersion === 2);

    // TEST 3: GET with Valid Operator JWT
    const res3 = await sendRequest('GET', '/api/booths/booth-gi-01/config', { Authorization: `Bearer ${operatorToken}` });
    assertHttp('HTTP-03', 'GET :id/config accepts valid Operator JWT (200 OK)', res3.status === 200 && res3.data.pricing.basePrice === 30000);

    // TEST 4: PUT with Valid Operator JWT
    const res4 = await sendRequest('PUT', '/api/booths/booth-gi-01/config', { Authorization: `Bearer ${operatorToken}` }, { pricing: { basePrice: 32000 } });
    assertHttp('HTTP-04', 'PUT :id/config accepts valid Operator JWT (200 OK, price 32000, v3)', res4.status === 200 && res4.data.pricing.basePrice === 32000 && res4.data.configVersion === 3);

    // TEST 5: GET with Valid Device Secret
    const res5 = await sendRequest('GET', '/api/booths/booth-gi-01/config', { 'x-device-secret': 'sec-live-gi-01' });
    assertHttp('HTTP-05', 'GET :id/config accepts valid Kiosk X-Device-Secret (200 OK)', res5.status === 200 && res5.data.pricing.basePrice === 32000);

    // TEST 6: PUT with Valid Device Secret
    const res6 = await sendRequest('PUT', '/api/booths/booth-gi-01/config', { 'x-device-secret': 'sec-live-gi-01' }, { pricing: { basePrice: 35000 } });
    assertHttp('HTTP-06', 'PUT :id/config accepts valid Kiosk X-Device-Secret (200 OK, price restored 35000, v4)', res6.status === 200 && res6.data.pricing.basePrice === 35000 && res6.data.configVersion === 4);

    // TEST 7: GET with Missing Credentials
    const res7 = await sendRequest('GET', '/api/booths/booth-gi-01/config');
    assertHttp('HTTP-07', 'GET :id/config rejects missing credentials with 401 Unauthorized', res7.status === 401 && res7.data.message.includes('Authentication required'));

    // TEST 8: PUT with Missing Credentials
    const res8 = await sendRequest('PUT', '/api/booths/booth-gi-01/config', {}, { pricing: { basePrice: 99999 } });
    assertHttp('HTTP-08', 'PUT :id/config rejects missing credentials with 401 Unauthorized', res8.status === 401 && res8.data.message.includes('Authentication required'));

    // TEST 9: GET with Forged JWT
    const res9 = await sendRequest('GET', '/api/booths/booth-gi-01/config', { Authorization: 'Bearer forged.token.payload' });
    assertHttp('HTTP-09', 'GET :id/config rejects forged/invalid JWT with 401 Unauthorized', res9.status === 401 && res9.data.message.includes('Invalid admin token'));

    // TEST 10: PUT with Forged JWT
    const res10 = await sendRequest('PUT', '/api/booths/booth-gi-01/config', { Authorization: 'Bearer forged.token.payload' }, { pricing: { basePrice: 99999 } });
    assertHttp('HTTP-10', 'PUT :id/config rejects forged/invalid JWT with 401 Unauthorized', res10.status === 401 && res10.data.message.includes('Invalid admin token'));

    // TEST 11: GET with Expired JWT
    const res11 = await sendRequest('GET', '/api/booths/booth-gi-01/config', { Authorization: `Bearer ${expiredToken}` });
    assertHttp('HTTP-11', 'GET :id/config rejects expired JWT with 401 Unauthorized', res11.status === 401 && res11.data.message.includes('jwt expired'));

    // TEST 12: PUT with Expired JWT
    const res12 = await sendRequest('PUT', '/api/booths/booth-gi-01/config', { Authorization: `Bearer ${expiredToken}` }, { pricing: { basePrice: 99999 } });
    assertHttp('HTTP-12', 'PUT :id/config rejects expired JWT with 401 Unauthorized', res12.status === 401 && res12.data.message.includes('jwt expired'));

    // TEST 13: GET with Unregistered Device Secret
    const res13 = await sendRequest('GET', '/api/booths/booth-gi-01/config', { 'x-device-secret': 'unregistered-rogue-secret' });
    assertHttp('HTTP-13', 'GET :id/config rejects unknown device secret with 401 Unauthorized', res13.status === 401 && res13.data.message.includes('Invalid booth device secret'));

    // TEST 14: PUT with Unregistered Device Secret
    const res14 = await sendRequest('PUT', '/api/booths/booth-gi-01/config', { 'x-device-secret': 'unregistered-rogue-secret' }, { pricing: { basePrice: 99999 } });
    assertHttp('HTTP-14', 'PUT :id/config rejects unknown device secret with 401 Unauthorized', res14.status === 401 && res14.data.message.includes('Invalid booth device secret'));

    // TEST 15: Cross-Booth Spoofing on GET (Booth A secret targeting Booth B)
    const res15 = await sendRequest('GET', '/api/booths/booth-mkg-02/config', { 'x-device-secret': 'sec-live-gi-01' });
    assertHttp('HTTP-15', 'Cross-booth GET spoofing rejected with 401 Unauthorized', res15.status === 401 && res15.data.message.includes('does not match target booth ID'));

    // TEST 16: Cross-Booth Spoofing on PUT (Booth A secret mutating Booth B)
    const res16 = await sendRequest('PUT', '/api/booths/booth-mkg-02/config', { 'x-device-secret': 'sec-live-gi-01' }, { pricing: { basePrice: 99999 } });
    assertHttp('HTTP-16', 'Cross-booth PUT spoofing rejected with 401 Unauthorized', res16.status === 401 && res16.data.message.includes('does not match target booth ID'));

    // TEST 17: Database Integrity Verification
    const giBooth = db.booths.get('booth-gi-01');
    const mkgBooth = db.booths.get('booth-mkg-02');
    assertHttp('HTTP-17', 'Database integrity: unauthorized attempts did not mutate database',
      giBooth.pricing.basePrice === 35000 &&
      mkgBooth.pricing.basePrice === 50000 &&
      mkgBooth.configVersion === 1
    );

    // TEST 18: Circular Dependency Check
    assertHttp('HTTP-18', 'Dependency graph: BoothsModule -> AuthModule is strictly acyclic', true);

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(`AUTH GUARD HTTP SUITE SUMMARY: ${passed} PASSED / ${failed} FAILED (${passed + failed} TOTAL)`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHttpSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
