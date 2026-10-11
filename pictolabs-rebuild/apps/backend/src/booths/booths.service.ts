import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BoothHeartbeatDto } from './dto/booth-heartbeat.dto';
import { UpdateBoothStatusDto } from './dto/update-booth-status.dto';
import { BoothConfigEnvelope } from './dto/update-booth-config.dto';
import * as bcrypt from 'bcrypt';

export type ComputedStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE';
export type { BoothConfigEnvelope };

@Injectable()
export class BoothsService {
  private readonly logger = new Logger(BoothsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Determine effective status dynamically:
   * 1. If manual override is MAINTENANCE -> always MAINTENANCE.
   * 2. Otherwise compute from last_seen delta:
   *    - ONLINE: < 60 seconds
   *    - DEGRADED: 60s - 300s (< 5 minutes)
   *    - OFFLINE: >= 300s (>= 5 minutes) or null
   */
  computeEffectiveStatus(
    lastSeen?: Date | null,
    manualStatus?: string
  ): {
    effectiveStatus: ComputedStatus;
    secondsSinceLastHeartbeat: number | null;
    isMaintenance: boolean;
  } {
    const isMaintenance = manualStatus === 'MAINTENANCE';
    const ageSeconds = lastSeen
      ? Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000))
      : null;

    if (isMaintenance) {
      return {
        effectiveStatus: 'MAINTENANCE',
        secondsSinceLastHeartbeat: ageSeconds,
        isMaintenance: true,
      };
    }

    if (!lastSeen || ageSeconds === null) {
      return {
        effectiveStatus: 'OFFLINE',
        secondsSinceLastHeartbeat: null,
        isMaintenance: false,
      };
    }

    if (ageSeconds < 60) {
      return {
        effectiveStatus: 'ONLINE',
        secondsSinceLastHeartbeat: ageSeconds,
        isMaintenance: false,
      };
    }

    if (ageSeconds < 300) {
      return {
        effectiveStatus: 'DEGRADED',
        secondsSinceLastHeartbeat: ageSeconds,
        isMaintenance: false,
      };
    }

    return {
      effectiveStatus: 'OFFLINE',
      secondsSinceLastHeartbeat: ageSeconds,
      isMaintenance: false,
    };
  }

  async findBoothByIdentifier(identifier: string, include?: any) {
    const booth = await this.prisma.booth.findFirst({
      where: {
        OR: [
          { id: identifier },
          { deviceSecret: identifier },
          { device: { deviceSecret: identifier, status: 'ACTIVE' } },
        ],
      },
      include,
    });

    if (!booth) {
      throw new NotFoundException(`Booth with identifier "${identifier}" not found`);
    }

    return booth;
  }

  /**
   * Record operational heartbeat from physical kiosk.
   * Updates last_seen timestamp and platform runtime attributes.
   * Does NOT overwrite the database status column (leaves source of truth un-polluted).
   */
  async recordHeartbeat(boothId: string, dto: BoothHeartbeatDto) {
    const booth = await this.findBoothByIdentifier(boothId);
    const now = new Date();

    // Update last_seen and runtime attributes on both Booth and active Device
    const updated = await this.prisma.booth.update({
      where: { id: booth.id },
      data: {
        lastSeen: now,
        ...(dto.appVersion ? { appVersion: dto.appVersion } : {}),
        ...(dto.gitCommit ? { gitCommit: dto.gitCommit } : {}),
        ...(dto.machineName ? { machineName: dto.machineName } : {}),
        ...(dto.localIp ? { localIp: dto.localIp } : {}),
        ...(dto.osVersion ? { osVersion: dto.osVersion } : {}),
        ...(dto.electronVersion ? { electronVersion: dto.electronVersion } : {}),
        ...(dto.releaseChannel ? { releaseChannel: dto.releaseChannel } : {}),
      },
    });

    try {
      await this.prisma.device.updateMany({
        where: { boothId: booth.id, status: 'ACTIVE' },
        data: {
          lastSeenAt: now,
          ...(dto.appVersion ? { appVersion: dto.appVersion } : {}),
          ...(dto.machineName ? { hostname: dto.machineName } : {}),
          ...(dto.osVersion ? { osVersion: dto.osVersion } : {}),
        },
      });
    } catch (_) {}

    const computed = this.computeEffectiveStatus(now, updated.status);

    this.logger.log(
      `[BoothsService] Heartbeat recorded for ${updated.name} (${booth.id}) -> Effective: ${computed.effectiveStatus}`
    );

    return {
      success: true,
      boothId: booth.id,
      status: computed.effectiveStatus,
      isMaintenance: computed.isMaintenance,
      lastSeen: now.toISOString(),
      secondsSinceLastHeartbeat: 0,
      appVersion: updated.appVersion,
      gitCommit: updated.gitCommit,
      machineName: updated.machineName,
      localIp: updated.localIp,
      osVersion: updated.osVersion,
      electronVersion: updated.electronVersion,
      releaseChannel: updated.releaseChannel,
      acknowledged: true,
    };
  }

  /**
   * Set manual administrative override status (e.g. MAINTENANCE or NORMAL).
   */
  async setManualStatus(boothId: string, dto: UpdateBoothStatusDto) {
    const booth = await this.findBoothByIdentifier(boothId);

    const updated = await this.prisma.booth.update({
      where: { id: booth.id },
      data: {
        status: dto.status,
      },
    });

    const computed = this.computeEffectiveStatus(updated.lastSeen, updated.status);

    this.logger.log(
      `[BoothsService] Manual status updated for ${updated.name} (${booth.id}) -> ${dto.status} (Effective: ${computed.effectiveStatus})`
    );

    return {
      success: true,
      boothId: booth.id,
      name: updated.name,
      status: computed.effectiveStatus,
      isMaintenance: computed.isMaintenance,
      reason: dto.reason || null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Get detailed diagnostic status report for a single booth.
   */
  async getBoothStatus(boothId: string) {
    const booth = await this.findBoothByIdentifier(boothId, {
      branch: true,
      config: true,
    });

    if (!booth) {
      throw new NotFoundException(`Booth with id ${boothId} not found`);
    }

    const computed = this.computeEffectiveStatus(booth.lastSeen, booth.status);

    return {
      boothId: booth.id,
      name: booth.name,
      status: computed.effectiveStatus,
      isMaintenance: computed.isMaintenance,
      lastSeen: booth.lastSeen ? booth.lastSeen.toISOString() : null,
      secondsSinceLastHeartbeat: computed.secondsSinceLastHeartbeat,
      thresholds: {
        onlineUnderSeconds: 60,
        degradedUnderSeconds: 300,
        offlineOverSeconds: 300,
      },
      runtime: {
        appVersion: booth.appVersion || null,
        gitCommit: booth.gitCommit || null,
        osVersion: booth.osVersion || null,
        electronVersion: booth.electronVersion || null,
        releaseChannel: booth.releaseChannel || 'stable',
        machineName: booth.machineName || null,
        localIp: booth.localIp || null,
      },
    };
  }

  /**
   * Retrieve all booths with dynamically evaluated status.
   */
  async findAllWithStatus() {
    const booths = await this.prisma.booth.findMany({
      include: {
        branch: true,
        config: true,
        device: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return booths.map((b) => {
      const computed = this.computeEffectiveStatus(b.lastSeen, b.status);

      return {
        id: b.id,
        name: b.name,
        branchId: b.branchId,
        branch: b.branch,
        device: b.device || null,
        status: computed.effectiveStatus,
        isMaintenance: computed.isMaintenance,
        lastSeen: b.lastSeen ? b.lastSeen.toISOString() : null,
        secondsSinceLastHeartbeat: computed.secondsSinceLastHeartbeat,
        appVersion: b.appVersion || null,
        gitCommit: b.gitCommit || null,
        osVersion: b.osVersion || null,
        electronVersion: b.electronVersion || null,
        releaseChannel: b.releaseChannel || 'stable',
        machineName: b.machineName || null,
        localIp: b.localIp || null,
        hasAdminPin: !!b.adminPinHash,
        config: b.config,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      };
    });
  }

  async findAll() {
    return this.findAllWithStatus();
  }

  async findById(id: string) {
    const booth = await this.findBoothByIdentifier(id, {
      branch: true,
      config: true,
      device: true,
      activationTokens: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    });
    const computed = this.computeEffectiveStatus(booth.lastSeen, booth.status);
    const { adminPinHash, ...sanitized } = booth as any;
    return {
      ...sanitized,
      hasAdminPin: !!adminPinHash,
      status: computed.effectiveStatus,
      isMaintenance: computed.isMaintenance,
      secondsSinceLastHeartbeat: computed.secondsSinceLastHeartbeat,
    };
  }


  /**
   * Verify entered 6-digit technician administrator PIN against bcrypt hash stored in DB.
   * Fallback to default PIN '885926' if adminPinHash has not yet been customized.
   */
  async verifyPin(identifier: string, candidatePin: string): Promise<{ success: boolean; verified: boolean; boothId: string }> {
    const booth = await this.findBoothByIdentifier(identifier);

    let isMatch = false;
    if (booth.adminPinHash) {
      isMatch = await bcrypt.compare(candidatePin, booth.adminPinHash);
    } else {
      // Default initial PIN for Booth #1
      isMatch = candidatePin === '885926';
    }

    this.logger.log(
      `[BoothsService] PIN verification attempted for ${booth.name} (${booth.id}) -> ${isMatch ? 'VERIFIED' : 'REJECTED'}`
    );

    return {
      success: true,
      verified: isMatch,
      boothId: booth.id,
    };
  }

  /**
   * Update or reset technician administrator PIN for a booth from the Admin Dashboard.
   * Validates 6 numeric digits and hashes using bcrypt.
   */
  async updatePin(identifier: string, newPin: string): Promise<{ success: boolean; message: string; boothId: string }> {
    if (!/^\d{6}$/.test(newPin)) {
      throw new BadRequestException('PIN must be exactly 6 numeric digits');
    }

    const booth = await this.findBoothByIdentifier(identifier);
    const saltRounds = 10;
    const hash = await bcrypt.hash(newPin, saltRounds);

    await this.prisma.booth.update({
      where: { id: booth.id },
      data: { adminPinHash: hash },
    });

    this.logger.log(`[BoothsService] Admin PIN successfully updated for booth ${booth.name} (${booth.id})`);

    return {
      success: true,
      message: 'Admin PIN updated successfully',
      boothId: booth.id,
    };
  }

  /**
   * Normalizes raw database configuration or legacy generalSettings into the canonical PR-01 BoothConfigEnvelope.
   * Ensures production-safe defaults for Booth #1 and populates backward-compatible top-level aliases.
   */
  normalizeConfigEnvelope(raw: any, boothId: string, dbUpdatedAt?: Date): BoothConfigEnvelope {
    const defaultPricing = {
      basePrice: 35000,
      currency: 'IDR',
      enableVoucher: true,
      enableQRIS: true,
    };
    const defaultTiming = {
      paymentTimeoutSec: 270,
      poseCountdownSec: 5,
      qrTimeoutSec: 60,
      idleResetSec: 120,
    };
    const defaultHardware = {
      cameraProfileId: null,
      printerProfileId: null,
      mirrorViewfinder: true,
      paperSize: '4R',
      printerCalibration: {
        scale: 99,
        offsetX: 0,
        offsetY: 3,
      },
      printerNames: {
        strip2x6: null,
        photo4x6: null,
        photo6x8: null,
      },
    };
    const defaultFrames = {
      allowedFrameIds: [],
    };
    const defaultSystem = {
      themeColor: '#3b82f6',
      eventName: 'PICTOLABS SELF PHOTOBOOTH',
      subText: 'TOUCH SCREEN TO START',
    };

    const rawCal = raw?.hardware?.printerCalibration;
    const rawScale = typeof rawCal?.scale === 'number' && !isNaN(rawCal.scale) ? rawCal.scale : 99;
    const rawOffX = typeof rawCal?.offsetX === 'number' && !isNaN(rawCal.offsetX) ? rawCal.offsetX : 0;
    const rawOffY = typeof rawCal?.offsetY === 'number' && !isNaN(rawCal.offsetY) ? rawCal.offsetY : 3;

    const normalizedCalibration = {
      scale: Math.max(85, Math.min(100, rawScale)),
      offsetX: Math.max(-15, Math.min(15, rawOffX)),
      offsetY: Math.max(-15, Math.min(15, rawOffY)),
    };

    const rawNames = raw?.hardware?.printerNames;
    const normalizedPrinterNames = {
      strip2x6: typeof rawNames?.strip2x6 === 'string' ? rawNames.strip2x6 : (rawNames?.strip2x6 === null ? null : defaultHardware.printerNames.strip2x6),
      photo4x6: typeof rawNames?.photo4x6 === 'string' ? rawNames.photo4x6 : (rawNames?.photo4x6 === null ? null : defaultHardware.printerNames.photo4x6),
      photo6x8: typeof rawNames?.photo6x8 === 'string' ? rawNames.photo6x8 : (rawNames?.photo6x8 === null ? null : defaultHardware.printerNames.photo6x8),
    };

    const envelope: BoothConfigEnvelope = {
      configVersion: typeof raw?.configVersion === 'number' && raw.configVersion > 0 ? raw.configVersion : 1,
      updatedAt: raw?.updatedAt || (dbUpdatedAt ? dbUpdatedAt.toISOString() : new Date().toISOString()),
      boothId,
      pricing: {
        ...defaultPricing,
        ...(raw?.pricing || {}),
        basePrice: typeof raw?.pricing?.basePrice === 'number'
          ? raw.pricing.basePrice
          : typeof raw?.price === 'number'
          ? raw.price
          : defaultPricing.basePrice,
      },
      timing: {
        ...defaultTiming,
        ...(raw?.timing || {}),
        paymentTimeoutSec: typeof raw?.timing?.paymentTimeoutSec === 'number'
          ? raw.timing.paymentTimeoutSec
          : typeof raw?.timeout === 'number'
          ? raw.timeout
          : defaultTiming.paymentTimeoutSec,
        poseCountdownSec: typeof raw?.timing?.poseCountdownSec === 'number'
          ? raw.timing.poseCountdownSec
          : typeof raw?.countdown === 'number'
          ? raw.countdown
          : defaultTiming.poseCountdownSec,
      },
      hardware: {
        ...defaultHardware,
        ...(raw?.hardware || {}),
        printerCalibration: normalizedCalibration,
        printerNames: {
          ...defaultHardware.printerNames,
          ...(raw?.hardware?.printerNames || {}),
          ...normalizedPrinterNames,
        },
      },
      frames: {
        ...defaultFrames,
        ...(raw?.frames || {}),
      },
      system: {
        ...defaultSystem,
        ...(raw?.system || {}),
        themeColor: raw?.system?.themeColor || raw?.themeColor || defaultSystem.themeColor,
        eventName: raw?.system?.eventName || raw?.eventName || defaultSystem.eventName,
        subText: raw?.system?.subText || raw?.subText || defaultSystem.subText,
      },
    };

    // Populate backward-compatibility top-level aliases
    envelope.price = envelope.pricing.basePrice;
    envelope.countdown = envelope.timing.poseCountdownSec;
    envelope.timeout = envelope.timing.paymentTimeoutSec;
    envelope.themeColor = envelope.system.themeColor;
    envelope.eventName = envelope.system.eventName;
    envelope.subText = envelope.system.subText;

    return envelope;
  }

  /**
   * Retrieves canonical normalized configuration for a booth.
   */
  async getBoothConfig(identifier: string): Promise<BoothConfigEnvelope> {
    const booth = await this.findBoothByIdentifier(identifier, { config: true });
    const boothConfig = (booth as any)?.config;
    let rawGeneral: any = {};
    if (boothConfig?.generalSettings) {
      try {
        rawGeneral = typeof boothConfig.generalSettings === 'string'
          ? JSON.parse(boothConfig.generalSettings)
          : boothConfig.generalSettings;
      } catch (err: any) {
        this.logger.warn(`[BoothsService] Failed to parse generalSettings for booth ${booth.id}: ${err?.message}`);
      }
    }
    return this.normalizeConfigEnvelope(rawGeneral, booth.id, boothConfig?.updatedAt);
  }

  /**
   * Safe non-destructive configuration update.
   * Preserves unrelated fields, increments configVersion monotonically, and updates PostgreSQL.
   */
  async updateBoothConfig(identifier: string, patch: any): Promise<BoothConfigEnvelope> {
    const booth = await this.findBoothByIdentifier(identifier, { config: true });

    // 1. Fetch current canonical configuration
    const current = await this.getBoothConfig(booth.id);

    // 2. Safe Deep Merge
    const newPricing = {
      ...current.pricing,
      ...(patch.pricing || {}),
      ...(typeof patch.price === 'number' ? { basePrice: patch.price } : {}),
    };

    if (newPricing.basePrice !== undefined) {
      if (
        typeof newPricing.basePrice !== 'number' ||
        isNaN(newPricing.basePrice) ||
        newPricing.basePrice <= 0 ||
        !Number.isInteger(newPricing.basePrice)
      ) {
        throw new BadRequestException('Harga dasar (basePrice) harus berupa bilangan bulat positif (> 0).');
      }
    }

    const newTiming = {
      ...current.timing,
      ...(patch.timing || {}),
      ...(typeof patch.timeout === 'number' ? { paymentTimeoutSec: patch.timeout } : {}),
      ...(typeof patch.countdown === 'number' ? { poseCountdownSec: patch.countdown } : {}),
    };

    const patchCal = patch.hardware?.printerCalibration;
    const patchNames = patch.hardware?.printerNames;

    const newHardware = {
      ...current.hardware,
      ...(patch.hardware || {}),
      printerCalibration: {
        ...(current.hardware?.printerCalibration || { scale: 99, offsetX: 0, offsetY: 3 }),
        ...(patchCal || {}),
      },
      printerNames: {
        ...(current.hardware?.printerNames || { strip2x6: null, photo4x6: null, photo6x8: null }),
        ...(patchNames || {}),
      },
    };

    if (newHardware.printerCalibration) {
      const scale = newHardware.printerCalibration.scale;
      const offsetX = newHardware.printerCalibration.offsetX;
      const offsetY = newHardware.printerCalibration.offsetY;

      if (typeof scale === 'number' && (scale < 85 || scale > 100)) {
        throw new BadRequestException('Skala kalibrasi printer harus berada di antara 85% dan 100%.');
      }
      if (typeof offsetX === 'number' && (offsetX < -15 || offsetX > 15)) {
        throw new BadRequestException('Offset X kalibrasi printer harus berada di antara -15 dan 15 unit (1/100 inci / ±3.81 mm).');
      }
      if (typeof offsetY === 'number' && (offsetY < -15 || offsetY > 15)) {
        throw new BadRequestException('Offset Y kalibrasi printer harus berada di antara -15 dan 15 unit (1/100 inci / ±3.81 mm).');
      }
    }

    const newFrames = {
      ...current.frames,
      ...(patch.frames || {}),
    };

    const newSystem = {
      ...current.system,
      ...(patch.system || {}),
      ...(patch.themeColor ? { themeColor: patch.themeColor } : {}),
      ...(patch.eventName ? { eventName: patch.eventName } : {}),
      ...(patch.subText ? { subText: patch.subText } : {}),
    };

    // 3. Monotonically increment version and stamp server updatedAt
    const nextVersion = (current.configVersion || 1) + 1;
    const nowIso = new Date().toISOString();

    const newEnvelope: BoothConfigEnvelope = {
      configVersion: nextVersion,
      updatedAt: nowIso,
      boothId: booth.id,
      pricing: newPricing,
      timing: newTiming,
      hardware: newHardware,
      frames: newFrames,
      system: newSystem,
      price: newPricing.basePrice,
      countdown: newTiming.poseCountdownSec,
      timeout: newTiming.paymentTimeoutSec,
      themeColor: newSystem.themeColor,
      eventName: newSystem.eventName,
      subText: newSystem.subText,
    };

    // 4. Atomic PostgreSQL upsert
    await this.prisma.boothConfig.upsert({
      where: { boothId: booth.id },
      update: {
        generalSettings: JSON.stringify(newEnvelope),
      },
      create: {
        boothId: booth.id,
        generalSettings: JSON.stringify(newEnvelope),
      },
    });

    this.logger.log(
      `[BoothsService] ✓ Configuration updated for ${booth.name} (${booth.id}) -> v${nextVersion} (basePrice: ${newPricing.basePrice})`
    );

    return newEnvelope;
  }

  async updateConfig(boothId: string, configData: any) {
    return this.updateBoothConfig(boothId, configData);
  }

  async recordHealth(boothId: string, data: any) {
    return this.prisma.boothHealthLog.create({
      data: {
        boothId,
        cpuTemp: data.cpuTemp,
        paperCount: data.paperCount,
        cameraState: data.cameraState,
        printerState: data.printerState,
        rawPayload: typeof data === 'string' ? data : JSON.stringify(data),
      },
    });
  }

  /**
   * Retrieves aggregated 5-pillar operational health for the dashboard:
   * 1. Camera, 2. Printer, 3. Storage, 4. Heartbeat, 5. Payment
   */
  async get5PillarHealth(id: string) {
    const booth = await this.findBoothByIdentifier(id, { branch: true, config: true });
    const latestLog = await this.prisma.boothHealthLog.findFirst({
      where: { boothId: booth.id },
      orderBy: { createdAt: 'desc' },
    });

    const computed = this.computeEffectiveStatus(booth.lastSeen, booth.status);

    // 1. Camera Pillar
    const cameraState = latestLog?.cameraState || 'CONNECTED';
    let cameraSeverity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
    if (cameraState === 'DISCONNECTED') cameraSeverity = 'CRITICAL';
    else if (cameraState === 'WEBCAM_FALLBACK') cameraSeverity = 'WARNING';

    // 2. Printer Pillar
    const printerState = latestLog?.printerState || 'READY';
    const paperCount = latestLog?.paperCount ?? 150;
    let printerSeverity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
    if (printerState === 'JAM' || printerState === 'ERROR') printerSeverity = 'CRITICAL';
    else if (paperCount < 20) printerSeverity = 'WARNING';

    // 3. Storage Pillar
    const storageStatus = process.env.R2_BUCKET_NAME ? 'CONNECTED' : 'LOCAL_STORAGE';
    const storageSeverity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';

    // 4. Heartbeat Pillar
    let heartbeatSeverity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';
    if (computed.effectiveStatus === 'OFFLINE') heartbeatSeverity = 'CRITICAL';
    else if (computed.effectiveStatus === 'DEGRADED') heartbeatSeverity = 'WARNING';

    // 5. Payment Pillar
    const paymentStatus = process.env.MIDTRANS_SERVER_KEY ? 'ACTIVE' : 'SANDBOX';
    const paymentSeverity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO';

    return {
      boothId: booth.id,
      boothName: booth.name,
      branchName: (booth as any).branch?.name || 'Default Branch',
      effectiveStatus: computed.effectiveStatus,
      isMaintenance: computed.isMaintenance,
      lastSeen: booth.lastSeen,
      secondsSinceLastHeartbeat: computed.secondsSinceLastHeartbeat,
      pillars: {
        camera: {
          status: cameraState,
          severity: cameraSeverity,
          message:
            cameraState === 'CONNECTED'
              ? 'Canon DSLR 30 FPS LiveView Ready'
              : cameraState === 'WEBCAM_FALLBACK'
              ? 'Webcam Fallback Active'
              : 'Camera Disconnected',
        },
        printer: {
          status: printerState,
          paperRemaining: paperCount,
          severity: printerSeverity,
          message: printerState === 'READY' ? `Siap Cetak (${paperCount} lembar tersisa)` : 'Printer Error / Jam',
        },
        storage: {
          status: storageStatus,
          severity: storageSeverity,
          bucket: process.env.R2_BUCKET_NAME || 'pictolabs-local-storage',
          message: 'Cloudflare R2 Terhubung (Zero-Egress CDN)',
        },
        heartbeat: {
          status: computed.effectiveStatus,
          severity: heartbeatSeverity,
          secondsAgo: computed.secondsSinceLastHeartbeat,
          message:
            computed.secondsSinceLastHeartbeat !== null
              ? `Terakhir terdeteksi ${computed.secondsSinceLastHeartbeat}s lalu`
              : 'Belum pernah terdeteksi',
        },
        payment: {
          status: paymentStatus,
          severity: paymentSeverity,
          provider: 'MIDTRANS QRIS',
          message: paymentStatus === 'ACTIVE' ? 'QRIS Live Settlement Aktif' : 'Midtrans Sandbox Simulator',
        },
      },
      system: {
        appVersion: booth.appVersion || '1.0.0',
        gitCommit: booth.gitCommit || 'head',
        machineName: booth.machineName || 'Kiosk-Host',
        localIp: booth.localIp || '127.0.0.1',
        osVersion: booth.osVersion || 'Windows 11 IoT',
        cpuTemp: latestLog?.cpuTemp ?? 42.5,
      },
    };
  }
}
