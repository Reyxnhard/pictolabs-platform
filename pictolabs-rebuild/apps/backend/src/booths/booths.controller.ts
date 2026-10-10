import { Controller, Get, Post, Put, Patch, Body, Param, Logger, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { BoothsService } from './booths.service';
import { KioskGateway } from '../gateway/kiosk.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { BoothHeartbeatDto } from './dto/booth-heartbeat.dto';
import { UpdateBoothStatusDto } from './dto/update-booth-status.dto';
import { BoothStatusResponseDto } from './dto/booth-status-response.dto';
import { VerifyPinDto } from './dto/verify-pin.dto';
import { UpdatePinDto } from './dto/update-pin.dto';
import { UpdateBoothConfigDto } from './dto/update-booth-config.dto';
import { Public } from '../auth/decorators/public.decorator';
import { BoothConfigAuthGuard } from '../auth/guards/booth-config-auth.guard';

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
        boothId: result.boothId || id,
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
        boothId: result.boothId,
        status: result.status,
        isMaintenance: result.isMaintenance,
        lastSeen: result.lastSeen,
      });
    }

    return result;
  }

  @Public()
  @UseGuards(BoothConfigAuthGuard)
  @Get(':id/config')
  @ApiOperation({
    summary: 'Get canonical booth configuration',
    description: 'Retrieves canonical normalized configuration envelope. Accessible by Kiosk (via X-Device-Secret) or Admin (via Bearer JWT).',
  })
  @ApiParam({ name: 'id', description: 'Booth UUID or device identifier' })
  async getConfig(@Param('id') id: string) {
    return this.boothsService.getBoothConfig(id);
  }

  @Public()
  @UseGuards(BoothConfigAuthGuard)
  @Put(':id/config')
  @ApiOperation({
    summary: 'Update booth configuration',
    description: 'Safe non-destructive update. Merges changes, increments configVersion, and emits CONFIG_UPDATE to target booth room.',
  })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  @ApiBody({ type: UpdateBoothConfigDto })
  async updateConfig(
    @Param('id') id: string,
    @Body() configDto: UpdateBoothConfigDto,
  ) {
    const updated = await this.boothsService.updateBoothConfig(id, configDto);
    await this.kioskGateway.pushConfigUpdate(id, updated);
    return updated;
  }

  @Post('push-config')
  @ApiOperation({ summary: 'Targeted configuration push via WebSocket (per-booth isolation)' })
  async pushConfig(@Body() body: { boothId?: string; config: any }) {
    const { boothId, config } = body;

    if (!boothId || boothId === 'all') {
      throw new BadRequestException(
        'Explicit target boothId is required. Global broadcast is disabled to enforce per-booth isolation.'
      );
    }

    const updated = await this.boothsService.updateBoothConfig(boothId, config);
    await this.kioskGateway.pushConfigUpdate(boothId, updated);

    return {
      success: true,
      message: `Config updated and pushed to booth ${boothId} successfully`,
      target: boothId,
      config: updated,
    };
  }

  @Public()
  @Post(':id/health')
  @ApiOperation({ summary: 'Legacy health log endpoint' })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  async logHealth(@Param('id') id: string, @Body() healthData: any) {
    return this.boothsService.recordHealth(id, healthData);
  }

  @Public()
  @Post(':id/verify-pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify 6-digit technician administrator PIN',
    description: 'Validates PIN entered on Kiosk against bcrypt hash stored in DB. Fallback to default 885926 if unconfigured.',
  })
  @ApiParam({ name: 'id', description: 'Booth UUID or deviceSecret' })
  @ApiBody({ type: VerifyPinDto })
  @ApiResponse({ status: 200, description: 'PIN verification result' })
  async verifyPin(
    @Param('id') id: string,
    @Body() dto: VerifyPinDto,
  ) {
    return this.boothsService.verifyPin(id, dto.pin);
  }

  @Put(':id/pin')
  @ApiOperation({
    summary: 'Update 6-digit technician administrator PIN',
    description: 'Protected endpoint for Admin Dashboard to reset or update a booth PIN. Hashes PIN using bcrypt before storing.',
  })
  @ApiParam({ name: 'id', description: 'Booth UUID or deviceSecret' })
  @ApiBody({ type: UpdatePinDto })
  @ApiResponse({ status: 200, description: 'PIN updated successfully' })
  async updatePin(
    @Param('id') id: string,
    @Body() dto: UpdatePinDto,
  ) {
    return this.boothsService.updatePin(id, dto.newPin);
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'Get aggregated 5-pillar operational health for booth' })
  @ApiParam({ name: 'id', description: 'Booth UUID' })
  async getHealth(@Param('id') id: string) {
    return this.boothsService.get5PillarHealth(id);
  }
}
