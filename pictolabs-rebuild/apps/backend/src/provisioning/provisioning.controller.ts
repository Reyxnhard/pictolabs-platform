import { Controller, Post, Get, Body, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ProvisioningService } from './provisioning.service';
import { GenerateActivationTokenDto } from './dto/generate-token.dto';
import { ActivateDeviceDto } from './dto/activate-device.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Provisioning')
@Controller(['api/provisioning', 'provisioning'])
export class ProvisioningController {
  constructor(private readonly provisioningService: ProvisioningService) {}

  @Post('tokens/generate')
  @ApiOperation({ summary: 'Generate a 15-minute single-use booth activation token (Admin Only)' })
  @ApiResponse({ status: 201, description: 'Activation token and QR payload generated' })
  async generateToken(@Body() dto: GenerateActivationTokenDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.provisioningService.generateToken(dto, userId);
  }

  @Public()
  @Get('tokens/:token/validate')
  @ApiOperation({ summary: 'Validate activation token status' })
  @ApiParam({ name: 'token', description: 'Activation code (e.g. ACT-8K2M-9P4W)' })
  async validateToken(@Param('token') token: string) {
    return this.provisioningService.validateToken(token);
  }

  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate physical kiosk device and receive cryptographic deviceSecret' })
  @ApiResponse({ status: 200, description: 'Device successfully paired' })
  async activateDevice(@Body() dto: ActivateDeviceDto, @Req() req: any) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
    return this.provisioningService.activateDevice(dto, clientIp);
  }

  @Post('re-pair')
  @ApiOperation({ summary: 'Re-pair hardware after laptop failure (Laptop Swap)' })
  async rePairHardware(@Body('boothId') boothId: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.provisioningService.rePairHardware(boothId, userId);
  }

  @Post('devices/:boothId/revoke')
  @ApiOperation({ summary: 'Emergency revocation of a device (Stolen/Compromised)' })
  async revokeDevice(@Param('boothId') boothId: string) {
    return this.provisioningService.revokeDevice(boothId);
  }
}
