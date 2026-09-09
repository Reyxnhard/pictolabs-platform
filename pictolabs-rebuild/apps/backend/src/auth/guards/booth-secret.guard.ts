import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BoothSecretGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const secret = request.headers['x-booth-secret'] || request.headers['x-device-secret'];
    const boothId = request.params?.id || request.body?.boothId;

    if (!secret) {
      throw new UnauthorizedException('Missing X-Booth-Secret header');
    }

    const booth = await this.prisma.booth.findUnique({
      where: { deviceSecret: String(secret) },
    });

    if (!booth) {
      throw new UnauthorizedException('Invalid booth device secret');
    }

    if (boothId && booth.id !== boothId) {
      throw new UnauthorizedException('Booth secret does not match target booth ID');
    }

    request.booth = booth;
    return true;
  }
}
