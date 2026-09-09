import { Controller, Post, Body } from '@nestjs/common';
import { AlertService, AlertSeverity } from './alert.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller(['api/alerts', 'alerts'])
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Public()
  @Post('test')
  async sendTestAlert(
    @Body()
    body: {
      boothId?: string;
      boothName?: string;
      severity?: AlertSeverity;
      title?: string;
      detail?: string;
      action?: string;
    },
  ) {
    return this.alertService.sendAlert({
      boothId: body.boothId || 'bth-test-01',
      boothName: body.boothName || 'Booth Uji Coba #1',
      type: 'MANUAL_TEST_ALERT',
      severity: body.severity || 'INFO',
      title: body.title || 'Uji Coba Notifikasi WhatsApp',
      detail: body.detail || 'Verifikasi konektivitas gateway WhatsApp Sprint 5C.',
      action: body.action || 'Tidak diperlukan tindakan. Sistem beroperasi normal.',
      skipCooldown: true,
    });
  }
}
