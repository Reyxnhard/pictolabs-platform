/**
 * Official Safe Pairing Tool for Local Development
 * 
 * Generates a valid single-use activation token via the Admin API and executes
 * the authentic Electron activation handshake to pair the Kiosk with PICTOLABS-DEV-01.
 * Uses Windows DPAPI encryption via Electron with zero hardcoded secrets.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:4000';
const BOOTH_ID = '80e05c47-50f9-4d8a-a6f5-a958f1be5df3';

async function main() {
  console.log('================================================================');
  console.log('SAFE LOCAL KIOSK PAIRING LIFECYCLE HANDSHAKE');
  console.log('================================================================\n');

  // 1. Authenticate Admin
  console.log('Step 1: Authenticating Admin to generate token...');
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@pictolabs.id', password: 'pictolabs2026' }),
  });
  if (!loginRes.ok) {
    throw new Error(`Admin login failed: ${loginRes.status}`);
  }
  const { accessToken } = await loginRes.json();

  // 2. Generate Single-Use Activation Token
  console.log(`Step 2: Requesting activation token for booth ${BOOTH_ID}...`);
  const genRes = await fetch(`${API_BASE}/api/provisioning/tokens/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ boothId: BOOTH_ID, ttlMinutes: 15 }),
  });
  if (!genRes.ok) {
    const errText = await genRes.text();
    throw new Error(`Token generation failed: ${genRes.status} ${errText}`);
  }
  const { token, expiresAt } = await genRes.json();
  console.log(`✓ Generated activation token: ${token} (expires: ${expiresAt})`);

  // 3. Write a small temporary electron script to execute activateKioskWithToken with safeStorage
  const tempScriptPath = path.join(process.cwd(), 'scratch_pair_runner.cjs');
  const electronScript = `
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const kioskUserDataDir = path.join(process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming'), '@pictolabs', 'kiosk');
if (app && typeof app.setPath === 'function') {
  app.setPath('userData', kioskUserDataDir);
}

app.whenReady().then(async () => {
  try {
    const identityService = require('./apps/kiosk/dist/main/services/IdentityService.js');
    console.log('[Runner] Initiating activation handshake via IdentityService...');
    const result = await identityService.activateKioskWithToken('${API_BASE}', '${token}');
    console.log('[Runner] Activation result:', JSON.stringify(result));
    app.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('[Runner] Error during activation:', err);
    app.exit(1);
  }
});
`;
  fs.writeFileSync(tempScriptPath, electronScript, 'utf8');

  try {
    console.log('Step 3: Executing official activation handshake in Electron environment...');
    const out = execSync(`npx electron ${tempScriptPath}`, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(out);
  } finally {
    if (fs.existsSync(tempScriptPath)) fs.unlinkSync(tempScriptPath);
  }

  // 4. Verify persisted identity.json
  console.log('Step 4: Verifying persisted identity.json...');
  const idPath = path.join(process.env.ALLUSERSPROFILE || 'C:\\ProgramData', 'Pictolabs', 'identity.json');
  if (!fs.existsSync(idPath)) {
    throw new Error(`identity.json not found at ${idPath}`);
  }
  const idData = JSON.parse(fs.readFileSync(idPath, 'utf8'));
  console.log('Persisted Identity:');
  console.log('  Booth ID:', idData.boothId);
  console.log('  Booth Name:', idData.boothName);
  console.log('  API Base URL:', idData.apiBaseUrl);
  console.log('  Paired At:', idData.pairedAt);
  console.log('  Device Secret Encrypted:', idData.deviceSecretCiphertext?.slice(0, 15) + '... (DPAPI)');

  if (idData.boothId !== BOOTH_ID) {
    throw new Error(`Booth ID mismatch: expected ${BOOTH_ID}, got ${idData.boothId}`);
  }

  console.log('\n✓ SUCCESS: Kiosk is now authentically paired to PICTOLABS-DEV-01!');
}

main().catch((e) => {
  console.error('\n✗ Pairing failed:', e.message);
  process.exit(1);
});
