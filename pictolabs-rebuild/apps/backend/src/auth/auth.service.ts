import { Injectable, UnauthorizedException, OnModuleInit, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultAdmin();
  }

  async seedDefaultAdmin() {
    try {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: 'admin@pictolabs.id' },
      });
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash('pictolabs2026', 10);
        await this.prisma.user.create({
          data: {
            email: 'admin@pictolabs.id',
            password: hashedPassword,
            name: 'Pictolabs Admin',
            role: 'ADMIN',
          },
        });
        this.logger.log('Seeded default administrator account: admin@pictolabs.id');
      }
    } catch (err: any) {
      this.logger.warn(`Could not seed admin user: ${err.message}`);
    }
  }

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
