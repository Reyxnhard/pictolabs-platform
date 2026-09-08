const http = require('http');
const { execSync } = require('child_process');
const io = require('socket.io-client');

const BOOTH_ID = '80e05c47-50f9-4d8a-a6f5-a958f1be5df3';
const DEVICE_SECRET = 'dev-secret-booth-01';
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
  console.log('===========================================================');
  console.log('=== SPRINT 4B FINAL COMPREHENSIVE VERIFICATION SUITE    ===');
  console.log('===========================================================\n');

  // STEP 1: Test HTTP Heartbeat Ingestion with gitCommit
  console.log('1. Testing HTTP Heartbeat (Single Source of Truth) with gitCommit & Platform Metadata...');
  const heartbeatPayload = {
    appVersion: '1.2.5',
    gitCommit: '1457ae6',
    machineName: 'PICTO-REVISED-01',
    localIp: '192.168.1.188',
    osVersion: 'Windows 11 Pro 23H2 (Build 22631)',
    electronVersion: '28.2.0',
    releaseChannel: 'stable',
  };

  const hbRes = await request('POST', `/api/booths/${BOOTH_ID}/heartbeat`, heartbeatPayload);
  console.log('   Heartbeat Response Status:', hbRes.status);
  console.log('   Heartbeat Body:', JSON.stringify(hbRes.body, null, 2));

  if (hbRes.status !== 200 && hbRes.status !== 201) throw new Error(`Heartbeat failed: ${hbRes.status}`);
  if (hbRes.body.status !== 'ONLINE') throw new Error(`Expected ONLINE, got ${hbRes.body.status}`);
  if (hbRes.body.gitCommit !== '1457ae6') throw new Error(`gitCommit mismatch: ${hbRes.body.gitCommit}`);
  if (hbRes.body.osVersion !== heartbeatPayload.osVersion) throw new Error(`osVersion mismatch: ${hbRes.body.osVersion}`);
  if (hbRes.body.electronVersion !== heartbeatPayload.electronVersion) throw new Error(`electronVersion mismatch: ${hbRes.body.electronVersion}`);
  console.log('   ✓ [PASS] Heartbeat ingested with gitCommit and full platform runtime metadata.\n');

  // STEP 2: Verify PostgreSQL Column Persistence and Non-Polluted Source of Truth
  console.log('2. Verifying PostgreSQL state (git_commit column and unpolluted status)...');
  const rawRow = runSql(`SELECT status || '|' || COALESCE(git_commit, '') || '|' || COALESCE(os_version, '') || '|' || COALESCE(electron_version, '') FROM booths WHERE id = '${BOOTH_ID}'`);
  const [dbStatus, dbGit, dbOs, dbElectron] = rawRow.split('|');
  console.log('   Database Row values:', { dbStatus, dbGit, dbOs, dbElectron });

  if (dbGit !== '1457ae6') throw new Error(`PostgreSQL git_commit mismatch: expected 1457ae6, got ${dbGit}`);
  if (dbStatus === 'ONLINE') throw new Error(`CRITICAL: booths.status is stored as 'ONLINE' in DB! Must be 'NORMAL'`);
  console.log('   ✓ [PASS] git_commit successfully persisted in PostgreSQL.');
  console.log(`   ✓ [PASS] booths.status in DB is '${dbStatus}' (NOT 'ONLINE'). Database truth is preserved.\n`);

  // STEP 3: Test Dynamic Status Evaluation from last_seen
  console.log('3. Testing dynamic status evaluation from last_seen...');
  // 3a. Recent (<60s) -> ONLINE
  const statusRes1 = await request('GET', `/api/booths/${BOOTH_ID}/status`);
  console.log('   Status (<60s ago):', statusRes1.body.status, `(${statusRes1.body.secondsSinceLastHeartbeat}s ago)`);
  if (statusRes1.body.status !== 'ONLINE') throw new Error('Expected ONLINE');
  if (statusRes1.body.runtime.gitCommit !== '1457ae6') throw new Error('Status breakdown missing gitCommit');

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
  console.log('   ✓ [PASS] Dynamic status evaluated purely from last_seen (ONLINE -> DEGRADED -> OFFLINE).\n');

  // STEP 4: Test Manual Maintenance Mode (PATCH /api/booths/:id/status)
  console.log('4. Testing Manual Maintenance Mode Override...');
  const patchRes = await request('PATCH', `/api/booths/${BOOTH_ID}/status`, {
    status: 'MAINTENANCE',
    reason: 'Replacing paper and calibrating flash',
  });
  console.log('   PATCH Response:', patchRes.status, patchRes.body);
  if (patchRes.body.status !== 'MAINTENANCE' || !patchRes.body.isMaintenance) throw new Error('Expected MAINTENANCE');

  // Heartbeat received during maintenance mode must NOT clear maintenance mode
  const hbMaint = await request('POST', `/api/booths/${BOOTH_ID}/heartbeat`, heartbeatPayload);
  if (hbMaint.body.status !== 'MAINTENANCE' || !hbMaint.body.isMaintenance) {
    throw new Error('Heartbeat cleared MAINTENANCE status! Maintenance must take absolute precedence.');
  }
  console.log('   ✓ [PASS] Manual MAINTENANCE mode strictly overrides dynamic network status.\n');

  // Restore to NORMAL
  await request('PATCH', `/api/booths/${BOOTH_ID}/status`, { status: 'NORMAL' });
  console.log('   Restored booth status to NORMAL.\n');

  // STEP 5: Verify Requirement 5 — Remove DB Mutations from WebSocket connect/disconnect
  console.log('5. Verifying WebSocket Connect/Disconnect does NOT mutate PostgreSQL status...');
  const beforeConnectStatus = runSql(`SELECT status FROM booths WHERE id = '${BOOTH_ID}'`);
  console.log('   DB status before socket connection:', beforeConnectStatus);

  // Connect kiosk socket
  const clientSocket = io('http://localhost:4000', {
    auth: { deviceSecret: DEVICE_SECRET },
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    clientSocket.on('connect', () => {
      console.log('   Kiosk socket connected with id:', clientSocket.id);
      resolve();
    });
  });

  // Check DB status while socket is connected
  const duringConnectStatus = runSql(`SELECT status FROM booths WHERE id = '${BOOTH_ID}'`);
  console.log('   DB status while socket connected:', duringConnectStatus);
  if (duringConnectStatus === 'ONLINE') {
    throw new Error('FAILED: WebSocket connect mutated booths.status in DB to ONLINE! Requirement 5 violated!');
  }
  console.log('   ✓ [PASS] WebSocket connect did NOT mutate database status.');

  // Emit HEALTH_PING over WebSocket (Requirement 6: Keep telemetry stream)
  console.log('   Testing HEALTH_PING over Socket.IO...');
  clientSocket.emit('HEALTH_PING', {
    cpuTemp: 46.2,
    paperCount: 320,
    cameraState: 'OK',
    printerState: 'READY',
  });
  await new Promise((r) => setTimeout(r, 600));

  const healthLogCount = runSql(`SELECT COUNT(*) FROM booth_health_logs WHERE "boothId" = '${BOOTH_ID}'`);
  console.log('   booth_health_logs count in DB:', healthLogCount);
  if (parseInt(healthLogCount) === 0) throw new Error('HEALTH_PING failed to create health log record');
  console.log('   ✓ [PASS] Socket.IO hardware telemetry stream remains operational.');

  // Disconnect socket
  clientSocket.disconnect();
  await new Promise((r) => setTimeout(r, 600));

  const afterDisconnectStatus = runSql(`SELECT status FROM booths WHERE id = '${BOOTH_ID}'`);
  console.log('   DB status after socket disconnect:', afterDisconnectStatus);
  if (afterDisconnectStatus === 'OFFLINE') {
    throw new Error('FAILED: WebSocket disconnect mutated booths.status in DB to OFFLINE! Requirement 5 violated!');
  }
  console.log('   ✓ [PASS] WebSocket disconnect did NOT mutate database status.\n');

  // STEP 6: Verify DeviceSecret Resolution (POST /api/booths/:deviceSecret/heartbeat)
  console.log('6. Verifying Heartbeat by deviceSecret...');
  const secretHbRes = await request('POST', `/api/booths/${DEVICE_SECRET}/heartbeat`, heartbeatPayload);
  console.log('   Heartbeat by deviceSecret response:', secretHbRes.status, secretHbRes.body.status);
  if (secretHbRes.status !== 200 && secretHbRes.status !== 201) throw new Error('Failed heartbeat by deviceSecret');
  if (secretHbRes.body.boothId !== BOOTH_ID) throw new Error('boothId mismatch in deviceSecret heartbeat');
  console.log('   ✓ [PASS] Booth successfully resolved and updated via deviceSecret.\n');

  console.log('===========================================================');
  console.log('ALL SPRINT 4B ARCHITECTURAL REQUIREMENTS VERIFIED: 100% PASS');
  console.log('===========================================================');
}

runTests().catch((err) => {
  console.error('\nTEST SUITE FAILED WITH ERROR:', err);
  process.exit(1);
});
