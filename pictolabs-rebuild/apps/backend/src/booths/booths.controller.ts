import { Controller, Get, Post, Put, Body, Param } from '@nestjs/common';
import { BoothsService } from './booths.service';
import { KioskGateway } from '../gateway/kiosk.gateway';
import { PrismaService } from '../prisma/prisma.service';

@Controller('booths')
export class BoothsController {
  constructor(
    private readonly boothsService: BoothsService,
    private readonly kioskGateway: KioskGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async listAll() {
    return this.boothsService.findAll();
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.boothsService.findById(id);
  }

  @Put(':id/config')
  async updateConfig(@Param('id') id: string, @Body() configData: any) {
    const updated = await this.boothsService.updateConfig(id, configData);
    await this.kioskGateway.pushConfigUpdate(id, configData);
    return updated;
  }

  @Post('push-config')
  async pushConfig(@Body() body: { boothId?: string; config: any }) {
    const { boothId, config } = body;

    // Persist to database
    if (!boothId || boothId === 'all') {
      const allBooths = await this.prisma.booth.findMany({ select: { id: true } });
      for (const b of allBooths) {
        await this.boothsService.updateConfig(b.id, {
          generalSettings: JSON.stringify(config),
        });
      }
    } else {
      await this.boothsService.updateConfig(boothId, {
        generalSettings: JSON.stringify(config),
      });
    }

    // Broadcast in real-time to live Kiosks
    await this.kioskGateway.pushConfigUpdate(boothId, config);

    return {
      success: true,
      message: 'Config pushed to live booths successfully',
      target: boothId || 'all',
      config,
    };
  }

  @Post(':id/health')
  async logHealth(@Param('id') id: string, @Body() healthData: any) {
    return this.boothsService.recordHealth(id, healthData);
  }
}
