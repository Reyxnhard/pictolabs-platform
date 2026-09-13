import { ApiProperty } from '@nestjs/swagger';

export class DeviceFingerprintDto {
  @ApiProperty({ required: false })
  machineGuid?: string;

  @ApiProperty({ required: false })
  macAddress?: string;

  @ApiProperty({ required: false })
  hostname?: string;

  @ApiProperty({ required: false })
  osVersion?: string;

  @ApiProperty({ required: false })
  electronVersion?: string;

  @ApiProperty({ required: false })
  appVersion?: string;
}

export class ActivateDeviceDto {
  @ApiProperty({ description: '8-10 character activation code (e.g. ACT-8K2M-9P4W)' })
  token: string;

  @ApiProperty({ type: DeviceFingerprintDto, required: false })
  deviceFingerprint?: DeviceFingerprintDto;
}
