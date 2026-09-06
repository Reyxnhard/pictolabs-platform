import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, pass: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const match = await bcrypt.compare(pass, user.password);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async validateBooth(deviceSecret: string) {
    const booth = await this.prisma.booth.findUnique({
      where: { deviceSecret },
      include: { config: true, branch: true },
    });
    if (!booth) {
      throw new UnauthorizedException('Invalid device secret');
    }
    const payload = { sub: booth.id, type: 'BOOTH' };
    return {
      token: this.jwtService.sign(payload),
      booth: {
        id: booth.id,
        name: booth.name,
        branch: booth.branch.name,
        config: booth.config,
      },
    };
  }
}
