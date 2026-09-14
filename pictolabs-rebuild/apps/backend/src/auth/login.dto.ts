import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@pictolabs.id', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'pictolabs2026', description: 'User account password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
