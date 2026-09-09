import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SessionHealthService } from './session-health.service';
import { SessionRedeliveryService } from './session-redelivery.service';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, SessionHealthService, SessionRedeliveryService],
  exports: [SessionsService, SessionHealthService, SessionRedeliveryService],
})
export class SessionsModule {}
