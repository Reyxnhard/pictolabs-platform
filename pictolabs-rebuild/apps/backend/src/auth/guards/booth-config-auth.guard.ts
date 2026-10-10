import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Dual Authentication Guard for Booth Configuration:
 * Supports physical Kiosks authenticated via X-Device-Secret (or X-Booth-Secret),
 * as well as Admin Dashboard callers authenticated via Bearer JWT.
 */
@Injectable()
export class BoothConfigAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const targetBoothId = request.params?.id || request.body?.boothId;

    // 1. Physical Kiosk Authentication (X-Device-Secret or X-Booth-Secret)
    const secret = request.headers['x-device-secret'] || request.headers['x-booth-secret'];
    if (secret) {
      const booth = await this.prisma.booth.findFirst({
        where: {
          OR: [
            { deviceSecret: String(secret) },
            { device: { deviceSecret: String(secret), status: 'ACTIVE' } },
          ],
        },
      });

      if (!booth) {
        throw new UnauthorizedException('Invalid booth device secret');
      }

      if (targetBoothId && booth.id !== targetBoothId && booth.deviceSecret !== targetBoothId) {
        throw new UnauthorizedException('Device secret does not match target booth ID');
      }

      request.booth = booth;
      return true;
    }

    // 2. Admin Dashboard Authentication (Bearer JWT)
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      try {
        const payload = this.jwtService.verify(token);
        request.user = payload;
        return true;
      } catch (err: any) {
        throw new UnauthorizedException(`Invalid admin token: ${err.message}`);
      }
    }

    throw new UnauthorizedException(
      'Authentication required: Provide X-Device-Secret or Admin Authorization Bearer token'
    );
  }
}
