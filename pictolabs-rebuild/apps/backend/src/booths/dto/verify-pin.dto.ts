import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyPinDto {
  @ApiProperty({
    example: '885926',
    description: '6-digit technician administrator PIN',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits' })
  pin: string;
}
