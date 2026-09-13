import * as assert from 'assert';
import { ProvisioningService } from './provisioning.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

async function runFleetProvisioningTests() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  PICTOLABS PHASE 3.3 AUTOMATED SUITE: FLEET PROVISIONING & IDENTITY');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  let passedCount = 0;
  let failedCount = 0;

  function pass(testName: string) {
    passedCount++;
    console.log(`  ✓ [PASS] ${testName}`);
  }

  function fail(testName: string, err: any) {
    failedCount++;
    console.error(`  ✗ [FAIL] ${testName}:`, err.message || err);
  }

  // ─── Setup Mock Prisma Service ───────────────────────────
  const mockBooth = {
    id: 'booth-grand-indonesia-01',
    name: 'Grand Indonesia Kiosk #1',
    branchId: 'branch-gi-01',
    status: 'NORMAL',
    appVersion: '1.2.5',
    machineName: 'GI-KIOSK-01',
    osVersion: 'Windows 11',
    electronVersion: '28.2.0',
    branch: {
      id: 'branch-gi-01',
      name: 'Grand Indonesia Mall',
      companyId: 'comp-pictolabs',
      location: 'West Mall Fl. 3',
    },
    config: {
      generalSettings: JSON.stringify({ price: 35000, countdown: 5 }),
    },
  };

  let mockDb = {
    booths: new Map<string, any>(),
    tokens: new Map<string, any>(),
    devices: new Map<string, any>(),
  };

  function resetDb() {
    mockDb.booths.clear();
    mockDb.tokens.clear();
    mockDb.devices.clear();

    mockDb.booths.set(mockBooth.id, { ...mockBooth });
  }

  resetDb();

  const mockPrisma: any = {
    booth: {
      findUnique: async ({ where, include }: any) => {
        const b = mockDb.booths.get(where.id);
        if (!b) return null;
        if (include?.device) {
          return { ...b, device: mockDb.devices.get(b.id) || null };
        }
        return b;
      },
      update: async ({ where, data }: any) => {
        const existing = mockDb.booths.get(where.id);
        if (!existing) throw new Error('Booth not found');
        const updated = { ...existing, ...data };
        mockDb.booths.set(where.id, updated);
        return updated;
      },
    },
    activationToken: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const [key, t] of mockDb.tokens.entries()) {
          if (t.boothId === where.boothId && (where.status === undefined || t.status === where.status)) {
            mockDb.tokens.set(key, { ...t, ...data });
            count++;
          }
        }
        return { count };
      },
      create: async ({ data }: any) => {
        const token = { id: `tok-${Date.now()}-${Math.random()}`, ...data };
        mockDb.tokens.set(data.token, token);
        return token;
      },
      findUnique: async ({ where }: any) => {
        const token = mockDb.tokens.get(where.token);
        if (!token) return null;
        const booth = mockDb.booths.get(token.boothId);
        return { ...token, booth };
      },
      update: async ({ where, data }: any) => {
        for (const [key, t] of mockDb.tokens.entries()) {
          if (t.id === where.id) {
            const updated = { ...t, ...data };
            mockDb.tokens.set(key, updated);
            return updated;
          }
        }
        throw new Error('Token not found for update');
      },
    },
    device: {
      upsert: async ({ where, update, create }: any) => {
        const existing = mockDb.devices.get(where.boothId);
        if (existing) {
          const updated = { ...existing, ...update };
          mockDb.devices.set(where.boothId, updated);
          return updated;
        }
        const created = { id: `dev-${Date.now()}`, ...create };
        mockDb.devices.set(where.boothId, created);
        return created;
      },
      findUnique: async ({ where }: any) => {
        if (where.boothId) return mockDb.devices.get(where.boothId) || null;
        for (const dev of mockDb.devices.values()) {
          if (dev.deviceSecret === where.deviceSecret) return dev;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        for (const [key, dev] of mockDb.devices.entries()) {
          if (dev.boothId === where.boothId || dev.id === where.id) {
            const updated = { ...dev, ...data };
            mockDb.devices.set(key, updated);
            return updated;
          }
        }
        throw new Error('Device not found for update');
      },
    },
    $transaction: async (cb: any) => cb(mockPrisma),
  };

  const service = new ProvisioningService(mockPrisma as unknown as PrismaService);

  // ─────────────────────────────────────────────────────────
  // TEST 1: Token Generation & Entropy Format
  // ─────────────────────────────────────────────────────────
  try {
    const res = await service.generateToken({ boothId: mockBooth.id, ttlMinutes: 15 }, 'admin-usr-1');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.boothId, mockBooth.id);
    assert.strictEqual(res.boothName, mockBooth.name);

    // Verify format ACT-XXXX-XXXX
    assert.match(res.token, /^ACT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);

    // Verify exclusion of ambiguous characters (0, O, 1, I, L)
    const rawChars = res.token.replace(/ACT-|-/g, '');
    assert.strictEqual(/[01OIL]/i.test(rawChars), false, 'Token must not contain ambiguous chars 0, 1, O, I, L');

    // Verify TTL is roughly 15 minutes
    const expiresMs = new Date(res.expiresAt).getTime();
    const diffMins = (expiresMs - Date.now()) / 60000;
    assert.ok(diffMins >= 14 && diffMins <= 16, `TTL was expected ~15m, got ${diffMins}`);

    // Verify QR payload is valid JSON
    const qr = JSON.parse(res.qrPayload);
    assert.strictEqual(qr.version, 1);
    assert.strictEqual(qr.token, res.token);
    assert.strictEqual(qr.boothId, mockBooth.id);

    pass('Priority 1: Token Generation complies with Base32 format and 15m TTL');
  } catch (err: any) {
    fail('Priority 1: Token Generation complies with Base32 format and 15m TTL', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 2: Token Validation (Pending, Expired, Consumed)
  // ─────────────────────────────────────────────────────────
  try {
    const genRes = await service.generateToken({ boothId: mockBooth.id });

    // Valid pending token
    const val1 = await service.validateToken(genRes.token);
    assert.strictEqual(val1.valid, true);
    assert.strictEqual(val1.boothId, mockBooth.id);

    // Case-insensitivity & whitespace trimming
    const valCase = await service.validateToken(`  ${genRes.token.toLowerCase()}  `);
    assert.strictEqual(valCase.valid, true);

    // Non-existent token
    const valUnknown = await service.validateToken('ACT-0000-0000');
    assert.strictEqual(valUnknown.valid, false);
    assert.strictEqual(valUnknown.reason, 'TOKEN_NOT_FOUND');

    // Expired token
    const tokenObj = mockDb.tokens.get(genRes.token);
    tokenObj.expiresAt = new Date(Date.now() - 10000); // expired 10s ago
    const valExpired = await service.validateToken(genRes.token);
    assert.strictEqual(valExpired.valid, false);
    assert.strictEqual(valExpired.reason, 'TOKEN_EXPIRED');

    pass('Priority 3: Token Validation rejects non-existent and expired tokens');
  } catch (err: any) {
    fail('Priority 3: Token Validation rejects non-existent and expired tokens', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 3: Rate Limiting / Brute-Force Lockout
  // ─────────────────────────────────────────────────────────
  try {
    const maliciousIp = '203.0.113.42';

    // 4 invalid attempts should return BadRequestException
    for (let i = 0; i < 4; i++) {
      let threw = false;
      try {
        await service.activateDevice({ token: `ACT-FAIL-000${i}` }, maliciousIp);
      } catch (e: any) {
        threw = true;
        assert.ok(e instanceof BadRequestException);
      }
      assert.strictEqual(threw, true);
    }

    // 5th failed attempt should trigger lockout
    let threwFifth = false;
    try {
      await service.activateDevice({ token: 'ACT-FAIL-0005' }, maliciousIp);
    } catch (e: any) {
      threwFifth = true;
      assert.ok(e instanceof BadRequestException);
    }
    assert.strictEqual(threwFifth, true);

    // 6th attempt should be blocked with ForbiddenException (lockout active)
    let lockedOut = false;
    try {
      await service.activateDevice({ token: 'ACT-ANY-TOKEN' }, maliciousIp);
    } catch (e: any) {
      lockedOut = true;
      assert.ok(e instanceof ForbiddenException);
      assert.ok(e.message.includes('Too many failed activation attempts'));
    }
    assert.strictEqual(lockedOut, true);

    pass('Priority 3: Rate limiter enforces IP lockout on 5 consecutive failed attempts');
  } catch (err: any) {
    fail('Priority 3: Rate limiter enforces IP lockout on 5 consecutive failed attempts', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 4: Online Pairing Handshake & 256-bit Secret Issuance
  // ─────────────────────────────────────────────────────────
  try {
    const pairTokenRes = await service.generateToken({ boothId: mockBooth.id });
    const freshToken = pairTokenRes.token;

    const activationRes = await service.activateDevice(
      {
        token: freshToken,
        deviceFingerprint: {
          machineGuid: 'MS-REG-98765-GUID',
          macAddress: '1A:2B:3C:4D:5E:6F',
          hostname: 'JAKARTA-KIOSK-01',
          osVersion: 'Windows 11 IoT Enterprise',
          electronVersion: '28.2.0',
          appVersion: '1.2.5',
        },
      },
      '192.168.10.25'
    );

    assert.strictEqual(activationRes.success, true);
    assert.strictEqual(activationRes.boothId, mockBooth.id);
    assert.strictEqual(activationRes.boothName, mockBooth.name);

    // Check deviceSecret length: "sec_live_" + 64 hex chars = 73 chars
    assert.match(activationRes.deviceSecret, /^sec_live_[0-9a-f]{64}$/);

    // Check that token is marked as CONSUMED
    const consumedToken = mockDb.tokens.get(freshToken);
    assert.strictEqual(consumedToken.status, 'CONSUMED');
    assert.strictEqual(consumedToken.usedByDeviceGuid, 'MS-REG-98765-GUID');

    // Check that device record is saved in DB
    const savedDev = mockDb.devices.get(mockBooth.id);
    assert.ok(savedDev);
    assert.strictEqual(savedDev.status, 'ACTIVE');
    assert.strictEqual(savedDev.hostname, 'JAKARTA-KIOSK-01');
    assert.strictEqual(savedDev.macAddress, '1A:2B:3C:4D:5E:6F');
    assert.strictEqual(savedDev.deviceSecret, activationRes.deviceSecret);

    // Check that booth deviceSecret is synchronized
    const syncedBooth = mockDb.booths.get(mockBooth.id);
    assert.strictEqual(syncedBooth.deviceSecret, activationRes.deviceSecret);

    // Verify that attempting to consume the same token again is rejected
    let secondUseRejected = false;
    try {
      await service.activateDevice({ token: freshToken }, '192.168.10.26');
    } catch (e: any) {
      secondUseRejected = true;
      assert.ok(e instanceof BadRequestException);
    }
    assert.strictEqual(secondUseRejected, true);

    pass('Priority 3: Activation handshake successfully pairs device and binds 256-bit secret');
  } catch (err: any) {
    fail('Priority 3: Activation handshake successfully pairs device and binds 256-bit secret', err);
  }

  // ─────────────────────────────────────────────────────────
  // TEST 5: Hardware Re-Pairing (Laptop Swap) & Revocation
  // ─────────────────────────────────────────────────────────
  try {
    const oldDevSecret = mockDb.devices.get(mockBooth.id).deviceSecret;

    // 1. Operator initiates hardware swap (decommissions old device and generates swap token)
    const swapTokenRes = await service.rePairHardware(mockBooth.id, 'admin-operator');
    assert.strictEqual(swapTokenRes.success, true);
    assert.match(swapTokenRes.token, /^ACT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);

    // Verify old device was decommissioned
    const oldDev = mockDb.devices.get(mockBooth.id);
    assert.strictEqual(oldDev.status, 'DECOMMISSIONED');

    // 2. Replacement laptop activates with the swap token
    const newActivationRes = await service.activateDevice(
      {
        token: swapTokenRes.token,
        deviceFingerprint: {
          machineGuid: 'NEW-HARDWARE-LAPTOP-GUID',
          macAddress: 'AA:BB:CC:DD:EE:FF',
          hostname: 'JAKARTA-KIOSK-SWAP',
          osVersion: 'Windows 11 Pro',
          electronVersion: '28.2.0',
          appVersion: '1.2.5',
        },
      },
      '192.168.10.30'
    );

    assert.strictEqual(newActivationRes.success, true);
    assert.match(newActivationRes.deviceSecret, /^sec_live_[0-9a-f]{64}$/);
    assert.notStrictEqual(newActivationRes.deviceSecret, oldDevSecret, 'New deviceSecret must differ from old');

    const updatedDev = mockDb.devices.get(mockBooth.id);
    assert.strictEqual(updatedDev.status, 'ACTIVE');
    assert.strictEqual(updatedDev.hostname, 'JAKARTA-KIOSK-SWAP');
    assert.strictEqual(updatedDev.deviceSecret, newActivationRes.deviceSecret);

    // 3. Emergency Revocation (e.g. unit stolen or compromised)
    const revokeRes = await service.revokeDevice(mockBooth.id);
    assert.strictEqual(revokeRes.success, true);

    const revokedDev = mockDb.devices.get(mockBooth.id);
    assert.strictEqual(revokedDev.status, 'REVOKED');

    const revokedBooth = mockDb.booths.get(mockBooth.id);
    assert.strictEqual(revokedBooth.status, 'MAINTENANCE');
    assert.match(revokedBooth.deviceSecret, /^sec_revoked_\d+$/);

    pass('Priority 3 & 4: Hardware re-pairing and emergency revocation execute cleanly');
  } catch (err: any) {
    fail('Priority 3 & 4: Hardware re-pairing and emergency revocation execute cleanly', err);
  }

  console.log('\n──────────────────────────────────────────────────────────────────────');
  console.log(`FLEET PROVISIONING SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('──────────────────────────────────────────────────────────────────────\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runFleetProvisioningTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
