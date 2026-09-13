import { Test, TestingModule } from '@nestjs/testing';
import { ProvisioningService } from './provisioning.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Phase 3.3 ProvisioningService Unit & Integration Tests', () => {
  let service: ProvisioningService;
  let mockPrisma: any;

  const mockBooth = {
    id: 'booth-grand-indonesia-01',
    name: 'GI Booth #1',
    branchId: 'branch-gi',
    status: 'NORMAL',
    appVersion: '1.2.5',
    machineName: 'GI-KIOSK-01',
    osVersion: 'Windows 11',
    electronVersion: '28.2.0',
    branch: {
      id: 'branch-gi',
      name: 'Grand Indonesia Mall',
      companyId: 'comp-pictolabs',
      location: 'West Mall Fl. 3',
    },
    config: {
      generalSettings: JSON.stringify({ price: 35000, countdown: 5 }),
    },
  };

  beforeEach(() => {
    mockPrisma = {
      booth: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      activationToken: {
        updateMany: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      device: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
    };

    service = new ProvisioningService(mockPrisma as unknown as PrismaService);
  });

  describe('1. Token Generation (Priority 1: Identity Model)', () => {
    it('generates ACT-XXXX-XXXX token using non-ambiguous Base32 character set with 15min TTL', async () => {
      mockPrisma.booth.findUnique.mockResolvedValue(mockBooth);
      mockPrisma.activationToken.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.activationToken.create.mockImplementation(({ data }: any) => ({
        id: 'tok-1',
        ...data,
      }));

      const res = await service.generateToken({ boothId: mockBooth.id });

      expect(res.success).toBe(true);
      expect(res.token).toMatch(/^ACT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
      expect(res.boothId).toBe(mockBooth.id);
      expect(res.boothName).toBe(mockBooth.name);

      // Verify expiration is roughly 15 minutes in the future
      const expires = new Date(res.expiresAt).getTime();
      const now = Date.now();
      expect(expires - now).toBeGreaterThan(14 * 60_000);
      expect(expires - now).toBeLessThanOrEqual(16 * 60_000);
    });

    it('throws NotFoundException if booth does not exist', async () => {
      mockPrisma.booth.findUnique.mockResolvedValue(null);
      await expect(service.generateToken({ boothId: 'non-existent' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('2. Token Validation (Priority 3: Activation Flow)', () => {
    it('returns valid: true for active pending token', async () => {
      const activeToken = {
        id: 'tok-valid',
        token: 'ACT-7K9M-3WXY',
        boothId: mockBooth.id,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        booth: mockBooth,
      };
      mockPrisma.activationToken.findUnique.mockResolvedValue(activeToken);

      const res = await service.validateToken('act-7k9m-3wxy');
      expect(res.valid).toBe(true);
      expect(res.boothId).toBe(mockBooth.id);
    });

    it('returns valid: false if token expired', async () => {
      const expiredToken = {
        id: 'tok-exp',
        token: 'ACT-EXPD-9999',
        boothId: mockBooth.id,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 60_000), // 1 min ago
        booth: mockBooth,
      };
      mockPrisma.activationToken.findUnique.mockResolvedValue(expiredToken);

      const res = await service.validateToken('ACT-EXPD-9999');
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('TOKEN_EXPIRED');
    });

    it('returns valid: false if token already consumed', async () => {
      const consumedToken = {
        id: 'tok-used',
        token: 'ACT-USED-1234',
        boothId: mockBooth.id,
        status: 'CONSUMED',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        booth: mockBooth,
      };
      mockPrisma.activationToken.findUnique.mockResolvedValue(consumedToken);

      const res = await service.validateToken('ACT-USED-1234');
      expect(res.valid).toBe(false);
      expect(res.reason).toBe('TOKEN_CONSUMED');
    });
  });

  describe('3. Activation Handshake & Rate Limiting (Priority 3: Activation Flow)', () => {
    it('enforces brute-force lockout after 5 consecutive failed attempts from same IP', async () => {
      mockPrisma.activationToken.findUnique.mockResolvedValue(null);

      const testIp = '192.168.1.100';

      // 4 failures should throw BadRequestException
      for (let i = 0; i < 4; i++) {
        await expect(
          service.activateDevice({ token: 'ACT-INVALID-TKN' }, testIp)
        ).rejects.toThrow(BadRequestException);
      }

      // 5th failure triggers lockout
      await expect(
        service.activateDevice({ token: 'ACT-INVALID-TKN' }, testIp)
      ).rejects.toThrow(BadRequestException);

      // 6th attempt is blocked by rate-limiter with ForbiddenException
      await expect(
        service.activateDevice({ token: 'ACT-INVALID-TKN' }, testIp)
      ).rejects.toThrow(ForbiddenException);
    });

    it('successfully activates device, consumes token, and returns 256-bit deviceSecret', async () => {
      const activeToken = {
        id: 'tok-pair',
        token: 'ACT-PAIR-OK99',
        boothId: mockBooth.id,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 10 * 60_000),
        booth: mockBooth,
      };
      mockPrisma.activationToken.findUnique.mockResolvedValue(activeToken);
      mockPrisma.activationToken.update.mockResolvedValue({ ...activeToken, status: 'CONSUMED' });
      mockPrisma.device.upsert.mockResolvedValue({ id: 'dev-1' });
      mockPrisma.booth.update.mockResolvedValue({ ...mockBooth });

      const res = await service.activateDevice(
        {
          token: 'ACT-PAIR-OK99',
          deviceFingerprint: {
            machineGuid: 'WIN-GUID-9922',
            macAddress: '00:1A:2B:3C:4D:5E',
            hostname: 'KIOSK-GI-01',
            osVersion: 'Windows 11',
            electronVersion: '28.2.0',
            appVersion: '1.2.5',
          },
        },
        '10.0.0.5'
      );

      expect(res.success).toBe(true);
      expect(res.boothId).toBe(mockBooth.id);
      expect(res.deviceSecret).toMatch(/^sec_live_[0-9a-f]{64}$/); // 256-bit hex
      expect(mockPrisma.activationToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tok-pair' },
          data: expect.objectContaining({ status: 'CONSUMED' }),
        })
      );
      expect(mockPrisma.device.upsert).toHaveBeenCalled();
    });
  });

  describe('4. Hardware Re-pairing & Revocation (Priority 3: Activation Flow)', () => {
    it('re-pairs hardware with a new deviceSecret and preserves booth status', async () => {
      mockPrisma.booth.findUnique.mockResolvedValue(mockBooth);
      mockPrisma.device.findUnique.mockResolvedValue({ id: 'dev-old', boothId: mockBooth.id, status: 'ACTIVE' });
      mockPrisma.device.upsert.mockResolvedValue({ id: 'dev-new' });
      mockPrisma.booth.update.mockResolvedValue(mockBooth);

      const res = await service.rePairHardware(mockBooth.id, {
        hostname: 'NEW-KIOSK-PC',
        machineGuid: 'NEW-GUID-3344',
      });

      expect(res.success).toBe(true);
      expect(res.newDeviceSecret).toMatch(/^sec_live_[0-9a-f]{64}$/);
      expect(mockPrisma.device.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { boothId: mockBooth.id },
        })
      );
    });

    it('revokes device access immediately on emergency technician command', async () => {
      mockPrisma.booth.findUnique.mockResolvedValue(mockBooth);
      mockPrisma.device.update.mockResolvedValue({ id: 'dev-1', status: 'REVOKED' });
      mockPrisma.booth.update.mockResolvedValue(mockBooth);

      const res = await service.revokeDevice(mockBooth.id, 'Stolen kiosk hardware');
      expect(res.success).toBe(true);
      expect(mockPrisma.device.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { boothId: mockBooth.id },
          data: expect.objectContaining({ status: 'REVOKED' }),
        })
      );
    });
  });
});
