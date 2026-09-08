import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class BoothHeartbeatDto {
  @ApiPropertyOptional({
    example: '1.2.0',
    description: 'Active Kiosk/Electron software version',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({
    example: 'PICTO-BOOTH-01',
    description: 'Hostname or identifier of the host machine',
  })
  @IsOptional()
  @IsString()
  machineName?: string;

  @ApiPropertyOptional({
    example: '192.168.1.105',
    description: 'Local network IPv4 address of the booth',
  })
  @IsOptional()
  @IsString()
  localIp?: string;

  @ApiPropertyOptional({
    example: 'Windows 11 Pro 23H2 (Build 22631)',
    description: 'Operating system platform and version',
  })
  @IsOptional()
  @IsString()
  osVersion?: string;

  @ApiPropertyOptional({
    example: '28.2.0',
    description: 'Active Electron runtime version',
  })
  @IsOptional()
  @IsString()
  electronVersion?: string;

  @ApiPropertyOptional({
    example: 'stable',
    enum: ['stable', 'beta', 'nightly', 'canary'],
    description: 'Deployment release channel',
  })
  @IsOptional()
  @IsString()
  @IsIn(['stable', 'beta', 'nightly', 'canary'])
  releaseChannel?: string;
}
