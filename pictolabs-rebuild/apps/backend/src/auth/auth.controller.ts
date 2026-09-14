import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './login.dto';

@ApiTags('Auth')
@Controller(['api/auth', 'auth'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({ summary: 'User and Administrator Login' })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(
      dto.email,
      dto.password,
    );
  }

  @Public()
  @Post('booth-auth')
  async boothAuth(@Body() body: { deviceSecret: string }) {
    return this.authService.validateBooth(body.deviceSecret);
  }
}
