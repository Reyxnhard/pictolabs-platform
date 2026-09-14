import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateActivationTokenDto } from './dto/generate-token.dto';
import { ActivateDeviceDto } from './dto/activate-device.dto';
import * as crypto from 'crypto';

// Non-ambiguous Base32 alphabet (no 0/O, 1/I/L)
const TOKEN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

interface FailedAttemptTracker {
  count: number;
  lockedUntil: number;
}

@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);
  private failedAttempts = new Map<string, FailedAttemptTracker>();

  constructor(private prisma: PrismaService) {}

  /**
   * Helper: Generate high-entropy, human-friendly activation token (ACT-XXXX-XXXX)
   */
  private generateTokenCode(): string {
    const randomBytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += TOKEN_ALPHABET[randomBytes[i] % TOKEN_ALPHABET.length];
    }
    return `ACT-${code.slice(0, 4)}-${code.slice(4, 8)}`;
  }

  /**
   * Generate an activation token for an existing booth from the Dashboard
   */
  async generateToken(dto: GenerateActivationTokenDto, userId?: string) {
    const booth = await this.prisma.booth.findUnique({
      where: { id: dto.boothId },
      include: { branch: true },
    });

    if (!booth) {
      throw new NotFoundException(`Booth ${dto.boothId} not found`);
    }

    const ttlMinutes = dto.ttlMinutes && dto.ttlMinutes > 0 ? dto.ttlMinutes : 15;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    const token = this.generateTokenCode();

    // Revoke any previous pending tokens for this booth
    await this.prisma.activationToken.updateMany({
      where: { boothId: booth.id, status: 'PENDING' },
      data: { status: 'REVOKED' },
    });

    const record = await this.prisma.activationToken.create({
      data: {
        token,
        boothId: booth.id,
        createdByUserId: userId || null,
        expiresAt,
        status: 'PENDING',
      },
    });

    const qrPayload = JSON.stringify({
      version: 1,
      token,
      boothId: booth.id,
      boothName: booth.name,
      branchName: booth.branch?.name,
      expiresAt: expiresAt.toISOString(),
    });

    this.logger.log(`[ProvisioningService] Generated activation token ${token} for ${booth.name} (TTL: ${ttlMinutes}m)`);

    return {
      success: true,
      token: record.token,
      boothId: booth.id,
      boothName: booth.name,
      branchName: booth.branch?.name,
      expiresAt: expiresAt.toISOString(),
      qrPayload,
    };
  }

  /**
   * Validate activation token status before kiosk enters activation
   */
  async validateToken(rawToken: string) {
    const cleanToken = rawToken.toUpperCase().trim();
    const record = await this.prisma.activationToken.findUnique({
      where: { token: cleanToken },
      include: { booth: { include: { branch: true } } },
    });

    if (!record) {
      return { valid: false, reason: 'TOKEN_NOT_FOUND' };
    }

    if (record.status !== 'PENDING') {
      return { valid: false, reason: `TOKEN_${record.status}` };
    }

    if (new Date() > record.expiresAt) {
      return { valid: false, reason: 'TOKEN_EXPIRED' };
    }

    return {
      valid: true,
      boothId: record.boothId,
      boothName: record.booth.name,
      branchName: record.booth.branch?.name,
      expiresAt: record.expiresAt.toISOString(),
    };
  }

  /**
   * Complete pairing handshake: consumes token and issues cryptographic deviceSecret
   */
  async activateDevice(dto: ActivateDeviceDto, clientIp?: string) {
    const ip = clientIp || 'unknown';
    const nowMs = Date.now();

    // 1. Rate Limiting / Brute-Force Protection
    const tracker = this.failedAttempts.get(ip);
    if (tracker && tracker.lockedUntil > nowMs) {
      const waitSec = Math.ceil((tracker.lockedUntil - nowMs) / 1000);
      throw new ForbiddenException(`Too many failed activation attempts. Try again in ${waitSec} seconds.`);
    }

    const cleanToken = dto.token.toUpperCase().trim();
    const tokenRecord = await this.prisma.activationToken.findUnique({
      where: { token: cleanToken },
      include: { booth: { include: { branch: true, config: true } } },
    });

    const isTokenValid =
      tokenRecord &&
      tokenRecord.status === 'PENDING' &&
      new Date() <= tokenRecord.expiresAt;

    if (!isTokenValid) {
      const currentFails = (tracker?.count || 0) + 1;
      if (currentFails >= 5) {
        this.failedAttempts.set(ip, { count: 0, lockedUntil: nowMs + 15 * 60_000 });
        this.logger.warn(`[ProvisioningService] IP ${ip} locked out for 15 minutes due to 5 failed activation attempts.`);
      } else {
        this.failedAttempts.set(ip, { count: currentFails, lockedUntil: 0 });
      }
      throw new BadRequestException('INVALID_OR_EXPIRED_TOKEN');
    }

    // Reset failure counter on valid token
    this.failedAttempts.delete(ip);

    // 2. Generate 256-bit cryptographically secure deviceSecret
    const deviceSecret = `sec_live_${crypto.randomBytes(32).toString('hex')}`;
    const fp = dto.deviceFingerprint || {};

    // 3. Atomically consume token, register device, and update booth
    const booth = tokenRecord.booth;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Mark token consumed
      await tx.activationToken.update({
        where: { id: tokenRecord.id },
        data: {
          status: 'CONSUMED',
          usedAt: now,
          usedByDeviceGuid: fp.machineGuid || null,
          ipAddress: clientIp || null,
        },
      });

      // Upsert device bound to this booth
      await tx.device.upsert({
        where: { boothId: booth.id },
        update: {
          deviceSecret,
          machineGuid: fp.machineGuid || null,
          macAddress: fp.macAddress || null,
          hostname: fp.hostname || null,
          osVersion: fp.osVersion || null,
          appVersion: fp.appVersion || null,
          status: 'ACTIVE',
          pairedAt: now,
          lastSeenAt: now,
        },
        create: {
          boothId: booth.id,
          deviceSecret,
          machineGuid: fp.machineGuid || null,
          macAddress: fp.macAddress || null,
          hostname: fp.hostname || null,
          osVersion: fp.osVersion || null,
          appVersion: fp.appVersion || null,
          status: 'ACTIVE',
          pairedAt: now,
          lastSeenAt: now,
        },
      });

      // Synchronize booth fields for backward compatibility
      await tx.booth.update({
        where: { id: booth.id },
        data: {
          deviceSecret,
          status: 'NORMAL',
          lastSeen: now,
          appVersion: fp.appVersion || booth.appVersion,
          machineName: fp.hostname || booth.machineName,
          osVersion: fp.osVersion || booth.osVersion,
          electronVersion: fp.electronVersion || booth.electronVersion,
        },
      });
    });

    this.logger.log(
      `[ProvisioningService] ✓ Device successfully paired to ${booth.name} (${booth.id}) via ${cleanToken}`
    );

    let parsedConfig: any = { price: 35000, countdown: 5, timeout: 120 };
    if (booth.config?.generalSettings) {
      try {
        parsedConfig = JSON.parse(booth.config.generalSettings);
      } catch (_) {}
    }

    return {
      success: true,
      boothId: booth.id,
      boothName: booth.name,
      branchId: booth.branchId,
      branchName: booth.branch?.name || 'Main Branch',
      companyId: booth.branch?.companyId || null,
      location: booth.branch?.location || 'Indonesia',
      deviceSecret,
      config: parsedConfig,
      pairedAt: now.toISOString(),
    };
  }

  /**
   * Re-pair Hardware (Laptop Swap)
   * Decommissions existing hardware record and generates an immediate swap token
   */
  async rePairHardware(boothId: string, userId?: string) {
    const booth = await this.prisma.booth.findUnique({
      where: { id: boothId },
      include: { device: true },
    });

    if (!booth) {
      throw new NotFoundException(`Booth ${boothId} not found`);
    }

    // Mark previous device as DECOMMISSIONED
    if (booth.device) {
      await this.prisma.device.update({
        where: { id: booth.device.id },
        data: { status: 'DECOMMISSIONED' },
      });
      this.logger.warn(`[ProvisioningService] Decommissioned device ${booth.device.id} for booth ${booth.name}`);
    }

    // Issue swap token (15 mins)
    return this.generateToken({ boothId: booth.id, ttlMinutes: 15 }, userId);
  }

  /**
   * Emergency Device Revocation (Stolen / Compromised Hardware)
   */
  async revokeDevice(boothId: string) {
    const booth = await this.prisma.booth.findUnique({
      where: { id: boothId },
      include: { device: true },
    });

    if (!booth) {
      throw new NotFoundException(`Booth ${boothId} not found`);
    }

    if (booth.device) {
      await this.prisma.device.update({
        where: { id: booth.device.id },
        data: { status: 'REVOKED' },
      });
    }

    // Invalidate booth device secret with revoked sentinel
    const revokedSecret = `sec_revoked_${Date.now()}`;
    await this.prisma.booth.update({
      where: { id: booth.id },
      data: {
        deviceSecret: revokedSecret,
        status: 'MAINTENANCE',
      },
    });

    this.logger.error(`[ProvisioningService] 🚨 Device revoked for booth ${booth.name} (${booth.id})`);

    return {
      success: true,
      message: `Device for booth ${booth.name} has been revoked.`,
    };
  }

  /**
   * List all devices with associated booth information
   */
  async listDevices() {
    return this.prisma.device.findMany({
      include: {
        booth: {
          select: {
            id: true,
            name: true,
            status: true,
            lastSeen: true,
            deviceSecret: true,
            branch: {
              select: {
                id: true,
                name: true,
                location: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * List all booths with their active devices and branch info
   */
  async listBooths() {
    return this.prisma.booth.findMany({
      include: {
        branch: true,
        device: true,
        activationTokens: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

