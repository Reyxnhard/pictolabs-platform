import { Controller, Post, Body, Get, Param, UseGuards, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('booth-auth')
  async boothAuth(@Body() body: { deviceSecret: string }) {
    return this.authService.validateBooth(body.deviceSecret);
  }
}
