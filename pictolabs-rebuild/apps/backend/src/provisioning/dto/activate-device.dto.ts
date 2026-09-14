import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class DeviceFingerprintDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  machineGuid?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  macAddress?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  hostname?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  osVersion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  electronVersion?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  appVersion?: string;
}

export class ActivateDeviceDto {
  @ApiProperty({ description: '8-10 character activation code (e.g. ACT-8K2M-9P4W)' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ type: DeviceFingerprintDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceFingerprintDto)
  deviceFingerprint?: DeviceFingerprintDto;
}

