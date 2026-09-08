import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BoothThresholdsDto {
  @ApiProperty({ example: 60, description: 'Seconds threshold for ONLINE state' })
  onlineUnderSeconds: number;

  @ApiProperty({ example: 300, description: 'Seconds threshold for DEGRADED state' })
  degradedUnderSeconds: number;

  @ApiProperty({ example: 300, description: 'Seconds threshold for OFFLINE state' })
  offlineOverSeconds: number;
}

export class BoothRuntimePlatformDto {
  @ApiPropertyOptional({ example: '1.2.0' })
  appVersion?: string | null;

  @ApiPropertyOptional({ example: 'Windows 11 Pro 23H2 (Build 22631)' })
  osVersion?: string | null;

  @ApiPropertyOptional({ example: '28.2.0' })
  electronVersion?: string | null;

  @ApiPropertyOptional({ example: 'stable' })
  releaseChannel?: string | null;

  @ApiPropertyOptional({ example: 'PICTO-BOOTH-01' })
  machineName?: string | null;

  @ApiPropertyOptional({ example: '192.168.1.105' })
  localIp?: string | null;
}

export class BoothStatusResponseDto {
  @ApiProperty({ example: '80e05c47-50f9-4d8a-a6f5-a958f1be5df3' })
  boothId: string;

  @ApiProperty({ example: 'Grand Indonesia Kiosk' })
  name: string;

  @ApiProperty({
    example: 'ONLINE',
    enum: ['ONLINE', 'DEGRADED', 'OFFLINE', 'MAINTENANCE'],
    description: 'Effective operational status (dynamically computed from last_seen, or MAINTENANCE override)',
  })
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE' | string;

  @ApiProperty({
    example: false,
    description: 'True if booth is locked in administrative maintenance mode',
  })
  isMaintenance: boolean;

  @ApiPropertyOptional({ example: '2026-09-09T02:55:00.000Z' })
  lastSeen?: string | null;

  @ApiPropertyOptional({ example: 15, description: 'Elapsed seconds since last received heartbeat' })
  secondsSinceLastHeartbeat?: number | null;

  @ApiProperty({ type: () => BoothThresholdsDto })
  thresholds: BoothThresholdsDto;

  @ApiProperty({ type: () => BoothRuntimePlatformDto })
  runtime: BoothRuntimePlatformDto;
}
