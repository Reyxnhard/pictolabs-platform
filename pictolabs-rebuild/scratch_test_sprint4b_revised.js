const http = require('http');
const { execSync } = require('child_process');

const BOOTH_ID = '80e05c47-50f9-4d8a-a6f5-a958f1be5df3';
const BASE_URL = 'http://localhost:4000';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function runSql(sql) {
  const sanitized = sql.replace(/"/g, '\\"');
  const cmd = `docker exec -i pictolabs-postgres psql -U pictolabs -d pictolabs -t -A -c "${sanitized}"`;
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

async function runTests() {
  console.log('=== SPRINT 4B REVISED TEST SUITE ===\n');

  try {
    // 1. Send heartbeat with runtime platform fields
    console.log('1. Testing POST /api/booths/:id/heartbeat with platform fields (NO hardware telemetry)...');
    const heartbeatPayload = {
      appVersion: '1.2.5',
      machineName: 'PICTO-REVISED-01',
      localIp: '192.168.1.188',
      osVersion: 'Windows 11 Pro 23H2 (Build 22631)',
      electronVersion: '28.2.0',
      releaseChannel: 'stable',
    };

    const hbRes = await request('POST', `/api/booths/${BOOTH_ID}/heartbeat`, heartbeatPayload);
    console.log('   Heartbeat Response Status:', hbRes.status);
    console.log('   Heartbeat Body:', JSON.stringify(hbRes.body, null, 2));

    if (hbRes.status !== 200 && hbRes.status !== 201) {
      throw new Error(`Heartbeat failed with status ${hbRes.status}`);
    }
    if (hbRes.body.status !== 'ONLINE') {
      throw new Error(`Expected effective status ONLINE, got ${hbRes.body.status}`);
    }
    if (hbRes.body.osVersion !== heartbeatPayload.osVersion) {
      throw new Error(`osVersion mismatch: ${hbRes.body.osVersion}`);
    }
    if (hbRes.body.electronVersion !== heartbeatPayload.electronVersion) {
      throw new Error(`electronVersion mismatch: ${hbRes.body.electronVersion}`);
    }
    if (hbRes.body.releaseChannel !== 'stable') {
      throw new Error(`releaseChannel mismatch: ${hbRes.body.releaseChannel}`);
    }
    console.log('   [PASS] Heartbeat successfully ingested and runtime platform fields updated.\n');

    // 2. Verify Database Source of Truth: booths.status must NOT be 'ONLINE'
    console.log('2. Verifying database state in PostgreSQL...');
    const rawRow = runSql(`SELECT status || '|' || COALESCE(os_version, '') || '|' || COALESCE(electron_version, '') || '|' || COALESCE(release_channel, '') FROM booths WHERE id = '${BOOTH_ID}'`);
    const [dbStatus, dbOs, dbElectron, dbChannel] = rawRow.split('|');
    console.log('   Database Row values:', { dbStatus, dbOs, dbElectron, dbChannel });

    if (dbStatus === 'ONLINE') {
      throw new Error(`FAILED: booths.status is stored as 'ONLINE' in PostgreSQL. Requirement states ONLINE must NOT be stored as source of truth!`);
    }
    console.log(`   [PASS] booths.status in DB is '${dbStatus}' (NOT 'ONLINE'). Database truth is preserved.\n`);

    // 3. Test Dynamic Computed Statuses (ONLINE, DEGRADED, OFFLINE)
    console.log('3. Testing dynamic status evaluation from last_seen...');
    
    // 3a. Recent last_seen (<60s) -> ONLINE
    const statusRes1 = await request('GET', `/api/booths/${BOOTH_ID}/status`);
    console.log('   Status (<60s ago):', statusRes1.body.status, `(${statusRes1.body.secondsSinceLastHeartbeat}s ago)`);
    if (statusRes1.body.status !== 'ONLINE') throw new Error('Expected ONLINE');

    // 3b. Simulate 120s ago -> DEGRADED
    runSql(`UPDATE booths SET last_seen = NOW() - INTERVAL '120 seconds' WHERE id = '${BOOTH_ID}'`);
    const statusRes2 = await request('GET', `/api/booths/${BOOTH_ID}/status`);
    console.log('   Status (120s ago):', statusRes2.body.status, `(${statusRes2.body.secondsSinceLastHeartbeat}s ago)`);
    if (statusRes2.body.status !== 'DEGRADED') throw new Error(`Expected DEGRADED, got ${statusRes2.body.status}`);

    // 3c. Simulate 360s ago -> OFFLINE
    runSql(`UPDATE booths SET last_seen = NOW() - INTERVAL '360 seconds' WHERE id = '${BOOTH_ID}'`);
    const statusRes3 = await request('GET', `/api/booths/${BOOTH_ID}/status`);
    console.log('   Status (360s ago):', statusRes3.body.status, `(${statusRes3.body.secondsSinceLastHeartbeat}s ago)`);
    if (statusRes3.body.status !== 'OFFLINE') throw new Error(`Expected OFFLINE, got ${statusRes3.body.status}`);
    console.log('   [PASS] Dynamic time-based evaluation (ONLINE -> DEGRADED -> OFFLINE) verified.\n');

    // 4. Test Manual Maintenance Mode (PATCH /api/booths/:id/status)
    console.log('4. Testing Manual Maintenance Mode...');
    const patchRes = await request('PATCH', `/api/booths/${BOOTH_ID}/status`, {
      status: 'MAINTENANCE',
      reason: 'Replacing paper roll and calibrating flash',
    });
    console.log('   PATCH Response:', patchRes.status, patchRes.body);
    if (patchRes.status !== 200) throw new Error(`PATCH status failed: ${patchRes.status}`);
    if (patchRes.body.status !== 'MAINTENANCE' || !patchRes.body.isMaintenance) {
      throw new Error(`Expected MAINTENANCE mode, got ${patchRes.body.status}`);
    }

    // 4b. GET /api/booths/:id/status should return MAINTENANCE
    const maintStatusRes = await request('GET', `/api/booths/${BOOTH_ID}/status`);
    console.log('   GET Status during maintenance:', maintStatusRes.body.status, 'isMaintenance:', maintStatusRes.body.isMaintenance);
    if (maintStatusRes.body.status !== 'MAINTENANCE' || !maintStatusRes.body.isMaintenance) {
      throw new Error('Status breakdown does not report MAINTENANCE');
    }

    // 4c. Heartbeat received during MAINTENANCE mode must NOT clear MAINTENANCE mode!
    console.log('   Sending fresh heartbeat while in MAINTENANCE mode...');
    const hbDuringMaint = await request('POST', `/api/booths/${BOOTH_ID}/heartbeat`, heartbeatPayload);
    console.log('   Heartbeat response status during maintenance:', hbDuringMaint.body.status, 'isMaintenance:', hbDuringMaint.body.isMaintenance);
    if (hbDuringMaint.body.status !== 'MAINTENANCE' || !hbDuringMaint.body.isMaintenance) {
      throw new Error('Heartbeat overrode MAINTENANCE status! MAINTENANCE must take absolute precedence.');
    }
    console.log('   [PASS] MAINTENANCE mode strictly overrides network connectivity status.\n');

    // 5. Return status to NORMAL
    console.log('5. Returning booth to NORMAL mode...');
    const restoreRes = await request('PATCH', `/api/booths/${BOOTH_ID}/status`, {
      status: 'NORMAL',
    });
    console.log('   PATCH Restore Response:', restoreRes.status, restoreRes.body);
    if (restoreRes.body.status !== 'ONLINE') {
      throw new Error(`Expected ONLINE after returning to NORMAL with fresh heartbeat, got ${restoreRes.body.status}`);
    }

    // 6. Test GET /api/booths and legacy /booths route
    console.log('6. Testing booth listings (GET /api/booths & GET /booths)...');
    const listRes = await request('GET', '/api/booths');
    console.log(`   /api/booths returned ${listRes.body.length} booth(s). Status: ${listRes.body[0]?.status}`);
    if (listRes.body[0]?.status !== 'ONLINE') throw new Error('List status is not ONLINE');

    const legacyListRes = await request('GET', '/booths');
    console.log(`   /booths (legacy) returned ${legacyListRes.body.length} booth(s). Status: ${legacyListRes.body[0]?.status}`);
    if (legacyListRes.body[0]?.status !== 'ONLINE') throw new Error('Legacy list status is not ONLINE');
    console.log('   [PASS] Booth listing endpoints return computed status and backward compatibility is preserved.\n');

    console.log('=============================================');
    console.log('ALL SPRINT 4B REVISED REQUIREMENTS VERIFIED: PASS');
    console.log('=============================================');
  } finally {
    // cleanup
  }
}

runTests().catch((err) => {
  console.error('\nTEST FAILED WITH ERROR:', err);
  process.exit(1);
});
