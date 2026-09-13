import { ApiProperty } from '@nestjs/swagger';

export class GenerateActivationTokenDto {
  @ApiProperty({ description: 'Target Booth UUID' })
  boothId: string;

  @ApiProperty({ description: 'Time-to-live in minutes (default: 15)', default: 15, required: false })
  ttlMinutes?: number;
}
