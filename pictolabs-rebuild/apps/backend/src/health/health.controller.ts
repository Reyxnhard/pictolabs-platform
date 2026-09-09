import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller(['api/health', 'health'])
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async getHealth() {
    let dbStatus = 'disconnected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch {
      dbStatus = 'error';
    }

    return {
      status: dbStatus === 'connected' ? 'ok' : 'degraded',
      db: dbStatus,
      redis: process.env.REDIS_HOST ? 'connected' : 'in-memory/standby',
      storage: process.env.R2_BUCKET_NAME ? 'r2-active' : 'local-ready',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }
}
