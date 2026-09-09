import { Module, Global } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AlertController } from './alert.controller';

@Global()
@Module({
  controllers: [AlertController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
