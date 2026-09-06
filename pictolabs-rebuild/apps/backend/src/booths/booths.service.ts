import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type BoothStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'CAPTURING' | 'PRINTING' | string;

@Injectable()
export class BoothsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.booth.findMany({
      include: { branch: true, config: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findById(id: string) {
    const booth = await this.prisma.booth.findUnique({
      where: { id },
      include: { branch: true, config: true, healthLogs: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
    if (!booth) throw new NotFoundException('Booth not found');
    return booth;
  }

  async updateConfig(boothId: string, configData: any) {
    return this.prisma.boothConfig.upsert({
      where: { boothId },
      update: { ...configData },
      create: { boothId, ...configData },
    });
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

  async updateStatus(boothId: string, status: BoothStatus) {
    return this.prisma.booth.update({
      where: { id: boothId },
      data: { status },
    });
  }
}
