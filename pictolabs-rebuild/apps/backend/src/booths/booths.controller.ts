import { Controller, Get, Post, Put, Patch, Body, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { BoothsService } from './booths.service';
import { KioskGateway } from '../gateway/kiosk.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { BoothHeartbeatDto } from './dto/booth-heartbeat.dto';
import { UpdateBoothStatusDto } from './dto/update-booth-status.dto';
import { BoothStatusResponseDto } from './dto/booth-status-response.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Booths')
@Controller(['api/booths', 'booths'])
export class BoothsController {
  private readonly logger = new Logger(BoothsController.name);

  constructor(
    private readonly boothsService: BoothsService,
    private readonly kioskGateway: KioskGateway,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all photobooths',
    description: 'Retrieves all registered booths with their dynamically evaluated operational status (ONLINE, DEGRADED, OFFLINE, MAINTENANCE)',
  })
  @ApiResponse({ status: 200, description: 'List of booths with operational status' })
  async listAll() {
    return this.boothsService.findAll();
  }

  @Get(':id/status')
  @ApiOperation({
    summary: 'Get booth status breakdown',
    description: 'Calculates dynamic status based on last_seen heartbeat (<60s ONLINE, <5m DEGRADED, >=5m OFFLINE) or manual MAINTENANCE mode',
  })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  @ApiResponse({ status: 200, description: 'Detailed booth status evaluation', type: BoothStatusResponseDto })
  async getStatus(@Param('id') id: string) {
    return this.boothsService.getBoothStatus(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Set manual maintenance mode or return to normal operational monitoring',
    description: 'Sets administrative status (MAINTENANCE or NORMAL). When set to MAINTENANCE, effective status is locked to MAINTENANCE regardless of heartbeat freshness.',
  })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  @ApiBody({ type: UpdateBoothStatusDto })
  @ApiResponse({ status: 200, description: 'Booth manual status updated successfully' })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBoothStatusDto,
  ) {
    const result = await this.boothsService.setManualStatus(id, dto);

    // Relay real-time status change to connected Admin Dashboards
    if (this.kioskGateway?.server) {
      this.kioskGateway.server.to('dashboards').emit('booth_status_changed', {
        boothId: id,
        status: result.status,
        isMaintenance: result.isMaintenance,
      });
    }

    return result;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get booth by ID' })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  @ApiResponse({ status: 200, description: 'Booth details' })
  async getOne(@Param('id') id: string) {
    return this.boothsService.findById(id);
  }

  @Public()
  @Post(':id/heartbeat')
  @ApiOperation({
    summary: 'Ingest operational heartbeat',
    description: 'Records periodic heartbeat from physical kiosk, updates last_seen and runtime platform attributes (osVersion, electronVersion, releaseChannel). Status is computed dynamically.',
  })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  @ApiBody({ type: BoothHeartbeatDto })
  @ApiResponse({ status: 200, description: 'Heartbeat acknowledged with dynamic status evaluation' })
  async heartbeat(
    @Param('id') id: string,
    @Body() dto: BoothHeartbeatDto,
  ) {
    const result = await this.boothsService.recordHeartbeat(id, dto);

    // Relay real-time status and platform updates to connected Admin Dashboards
    if (this.kioskGateway?.server) {
      this.kioskGateway.server.to('dashboards').emit('booth_status_changed', {
        boothId: id,
        status: result.status,
        isMaintenance: result.isMaintenance,
        lastSeen: result.lastSeen,
      });
    }

    return result;
  }

  @Put(':id/config')
  @ApiOperation({ summary: 'Update booth configuration' })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  async updateConfig(@Param('id') id: string, @Body() configData: any) {
    const updated = await this.boothsService.updateConfig(id, configData);
    await this.kioskGateway.pushConfigUpdate(id, configData);
    return updated;
  }

  @Post('push-config')
  @ApiOperation({ summary: 'Push configuration to all or specific booths via WebSocket' })
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

  @Public()
  @Post(':id/health')
  @ApiOperation({ summary: 'Legacy health log endpoint' })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  async logHealth(@Param('id') id: string, @Body() healthData: any) {
    return this.boothsService.recordHealth(id, healthData);
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'Get aggregated 5-pillar operational health for booth' })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  async getHealth(@Param('id') id: string) {
    return this.boothsService.get5PillarHealth(id);
  }
}
