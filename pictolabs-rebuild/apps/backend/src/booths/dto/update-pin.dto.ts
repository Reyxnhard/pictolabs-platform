import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class UpdatePinDto {
  @ApiProperty({
    example: '948271',
    description: 'New 6-digit technician administrator PIN',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 numeric digits' })
  newPin: string;
}
