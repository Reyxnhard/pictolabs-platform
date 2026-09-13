import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { BoothsModule } from './booths/booths.module';
import { GatewayModule } from './gateway/gateway.module';
import { StorageModule } from './storage/storage.module';
import { SessionsModule } from './sessions/sessions.module';
import { GalleryModule } from './gallery/gallery.module';
import { PaymentsModule } from './payments/payments.module';
import { SupportModule } from './support/support.module';
import { EmailModule } from './email/email.module';
import { AlertModule } from './alerts/alert.module';
import { HealthModule } from './health/health.module';
import { ProvisioningModule } from './provisioning/provisioning.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BoothsModule,
    GatewayModule,
    StorageModule,
    SessionsModule,
    GalleryModule,
    PaymentsModule,
    SupportModule,
    EmailModule,
    AlertModule,
    HealthModule,
    ProvisioningModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
