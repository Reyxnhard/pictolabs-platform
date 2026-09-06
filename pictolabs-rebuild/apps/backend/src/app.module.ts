import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BoothsModule } from './booths/booths.module';
import { GatewayModule } from './gateway/gateway.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BoothsModule,
    GatewayModule,
    StorageModule,
  ],
})
export class AppModule {}
