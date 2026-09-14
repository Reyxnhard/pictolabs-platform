import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RePairDto {
  @ApiProperty({ description: 'Target Booth UUID' })
  @IsString()
  @IsNotEmpty()
  boothId: string;
}
