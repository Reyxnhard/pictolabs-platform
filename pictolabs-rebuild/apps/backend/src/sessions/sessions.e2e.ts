import axios from 'axios';
import assert from 'assert';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4000';

async function runSessionsE2E() {
  console.log('======================================================================');
  console.log('🧪 SPRINT 5A E2E: SESSIONS QUERY & ASSET-CENTRIC GALLERY VERIFICATION');
  console.log(`Backend Target: ${BASE_URL}`);
  console.log('======================================================================\n');

  // 1. Ingest test session via existing POST /api/sessions
  console.log('1. Ingesting test session...');
  const testSessionId = `session_5a_test_${Date.now()}`;
  const syncRes = await axios.post(
    `${BASE_URL}/api/sessions`,
    {
      id: testSessionId,
      status: 'CUSTOM_UNKNOWN_STATUS', // Test resilience to arbitrary/unknown status
      createdAt: new Date().toISOString(),
    },
    {
      headers: {
        'x-device-secret': 'dev-secret-booth-01',
      },
    }
  );
  assert.ok(syncRes.status === 200 || syncRes.status === 201, 'Session sync should respond 200/201');
  assert.strictEqual(syncRes.data.success, true, 'Session sync response success should be true');
  console.log(`✓ Test session ingested: ${testSessionId} with status: CUSTOM_UNKNOWN_STATUS\n`);

  // 2. Verify GET /api/sessions (Pagination & listing)
  console.log('2. Testing GET /api/sessions (Listing & Pagination)...');
  const listRes = await axios.get(`${BASE_URL}/api/sessions?page=1&limit=5`);
  assert.strictEqual(listRes.status, 200, 'GET /api/sessions should return 200 OK');
  assert.ok(Array.isArray(listRes.data.data), 'Sessions data should be an array');
  assert.ok(listRes.data.pagination, 'Pagination object should be present');
  assert.strictEqual(listRes.data.pagination.page, 1, 'Page should be 1');
  console.log(`✓ Retrieved ${listRes.data.data.length} sessions. Total in DB: ${listRes.data.pagination.total}\n`);

  // 3. Verify Search by Session ID
  console.log('3. Testing GET /api/sessions?search=:id ...');
  const searchRes = await axios.get(`${BASE_URL}/api/sessions?search=${testSessionId}`);
  assert.strictEqual(searchRes.status, 200);
  assert.ok(searchRes.data.data.length >= 1, 'Search by ID should return at least 1 result');
  assert.strictEqual(searchRes.data.data[0].id, testSessionId, 'Found session ID should match testSessionId');
  assert.strictEqual(searchRes.data.data[0].status, 'CUSTOM_UNKNOWN_STATUS', 'Should preserve custom unknown status');
  console.log(`✓ Search returned matching session with raw status: ${searchRes.data.data[0].status}\n`);

  // 4. Verify GET /api/sessions/stats/today
  console.log('4. Testing GET /api/sessions/stats/today (Operational KPIs)...');
  const statsRes = await axios.get(`${BASE_URL}/api/sessions/stats/today`);
  assert.strictEqual(statsRes.status, 200);
  assert.ok(typeof statsRes.data.sessionsToday === 'number', 'sessionsToday must be a number');
  assert.ok(typeof statsRes.data.completedToday === 'number', 'completedToday must be a number');
  assert.ok(typeof statsRes.data.failedToday === 'number', 'failedToday must be a number');
  assert.ok(typeof statsRes.data.activeBoothsToday === 'number', 'activeBoothsToday must be a number');
  assert.ok(statsRes.data.sessionsToday >= 1, 'sessionsToday must be >= 1 after our test ingestion');
  console.log(`✓ Today KPIs: Sessions=${statsRes.data.sessionsToday}, Completed=${statsRes.data.completedToday}, ActiveBooths=${statsRes.data.activeBoothsToday}\n`);

  // 5. Verify GET /api/sessions/:id (Session Detail)
  console.log('5. Testing GET /api/sessions/:id (Single Detail)...');
  const detailRes = await axios.get(`${BASE_URL}/api/sessions/${testSessionId}`);
  assert.strictEqual(detailRes.status, 200);
  assert.strictEqual(detailRes.data.id, testSessionId);
  assert.ok(detailRes.data.boothName, 'boothName should be populated');
  assert.ok(detailRes.data.customerDownloadUrl.includes(testSessionId), 'customerDownloadUrl should contain session ID');
  console.log(`✓ Retrieved detail for ${testSessionId} at booth: ${detailRes.data.boothName}\n`);

  // 6. Verify Asset-Centric Gallery API GET /api/gallery/:sessionId
  console.log('6. Testing GET /api/gallery/:sessionId (Asset-Centric Structure)...');
  const galleryRes = await axios.get(`${BASE_URL}/api/gallery/${testSessionId}`);
  assert.strictEqual(galleryRes.status, 200);
  assert.strictEqual(galleryRes.data.sessionId, testSessionId);
  assert.ok(galleryRes.data.assets, 'assets object should be present');
  assert.ok('photoStrip' in galleryRes.data.assets, 'photoStrip property should be in assets');
  assert.ok(Array.isArray(galleryRes.data.assets.photos), 'photos array should be in assets');
  assert.ok(Array.isArray(galleryRes.data.assets.livePhotos), 'livePhotos array should be in assets');
  console.log(`✓ Gallery metadata returned with asset-centric structure (photoStrip, photos, livePhotos)\n`);

  console.log('======================================================================');
  console.log('🎉 ALL SPRINT 5A BACKEND ENDPOINTS PASSED WITH 100% SUCCESS!');
  console.log('======================================================================\n');
}

runSessionsE2E().catch((err) => {
  console.error('❌ Test failed:', err.message);
  if (err.response) {
    console.error('Response data:', err.response.data);
  }
  process.exit(1);
});
