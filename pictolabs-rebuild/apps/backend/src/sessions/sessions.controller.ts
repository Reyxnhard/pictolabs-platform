import { Controller, Post, Body, Headers, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/sessions')
export class SessionsController {
  private readonly logger = new Logger(SessionsController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async syncSession(
    @Body() sessionData: any,
    @Headers('x-device-secret') deviceSecret?: string
  ) {
    this.logger.log(`[SessionsController] Incoming session sync: ${sessionData?.id}`);

    try {
      const booth = await this.prisma.booth.findUnique({
        where: { deviceSecret: deviceSecret || 'dev-secret-booth-01' },
      });

      if (!booth) {
        this.logger.warn(`[SessionsController] Booth not registered for deviceSecret: ${deviceSecret}`);
        return { success: true, acknowledged: true, warning: 'Booth unregistered' };
      }

      const status = sessionData.printStatus === 'printed' ? 'COMPLETED' : 'CAPTURED';

      const session = await this.prisma.session.upsert({
        where: { id: sessionData.id },
        update: {
          status,
          updatedAt: new Date(),
        },
        create: {
          id: sessionData.id,
          boothId: booth.id,
          status,
          createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : new Date(),
        },
      });

      this.logger.log(`[SessionsController] ✓ Session synced to database: ${session.id}`);
      return { success: true, sessionId: session.id };
    } catch (err: any) {
      this.logger.error(`[SessionsController] Error syncing session: ${err.message}`);
      // Return 200 with error flag so kiosk SQLite sync loop doesn't block
      return { success: true, error: err.message };
    }
  }
}
