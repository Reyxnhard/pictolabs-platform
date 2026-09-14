import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GenerateActivationTokenDto {
  @ApiProperty({ description: 'Target Booth UUID' })
  @IsString()
  @IsNotEmpty()
  boothId: string;

  @ApiProperty({ description: 'Time-to-live in minutes (default: 15)', default: 15, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  ttlMinutes?: number;
}

