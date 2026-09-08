import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional } from 'class-validator';

export class UpdateBoothStatusDto {
  @ApiProperty({
    example: 'MAINTENANCE',
    enum: ['MAINTENANCE', 'NORMAL'],
    description: 'Set to MAINTENANCE to lock booth for servicing, or NORMAL to resume automated dynamic monitoring',
  })
  @IsString()
  @IsIn(['MAINTENANCE', 'NORMAL'])
  status: 'MAINTENANCE' | 'NORMAL';

  @ApiPropertyOptional({
    example: 'Cleaning DSLR sensor and replacing DNP RX1HS photo paper roll',
    description: 'Optional operational reason for manual maintenance override',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
