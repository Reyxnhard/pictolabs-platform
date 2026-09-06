import { Module } from '@nestjs/common';
import { KioskGateway } from './kiosk.gateway';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [KioskGateway],
  exports: [KioskGateway],
})
export class GatewayModule {}
