import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@Controller(['api/auth', 'auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @Post('booth-auth')
  async boothAuth(@Body() body: { deviceSecret: string }) {
    return this.authService.validateBooth(body.deviceSecret);
  }
}
