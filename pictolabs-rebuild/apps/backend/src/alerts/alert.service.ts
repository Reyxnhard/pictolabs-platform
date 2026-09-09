import { Injectable, Logger } from '@nestjs/common';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AlertPayload {
  boothId: string;
  boothName?: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  action: string;
  skipCooldown?: boolean;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private cooldowns = new Map<string, number>();

  /**
   * Dispatches an operational alert directly to WhatsApp.
   * Enforces a 15-minute anti-spam cooldown per alert type per booth.
   */
  async sendAlert(payload: AlertPayload) {
    const cooldownKey = `${payload.boothId}:${payload.type}`;
    const now = Date.now();
    const lastSent = this.cooldowns.get(cooldownKey) || 0;
    const cooldownPeriodMs = 15 * 60 * 1000; // 15 minutes

    if (!payload.skipCooldown && now - lastSent < cooldownPeriodMs) {
      const remainingMinutes = Math.ceil((cooldownPeriodMs - (now - lastSent)) / 60000);
      this.logger.debug(
        `[WhatsApp Alert Suppressed] Cooldown active for ${cooldownKey}. (${remainingMinutes}m remaining)`,
      );
      return {
        sent: false,
        cooldownActive: true,
        remainingMinutes,
        message: 'Alert throttled by 15-minute anti-spam cooldown',
      };
    }

    const severityIcon = payload.severity === 'CRITICAL' ? '🚨' : payload.severity === 'WARNING' ? '⚠️' : 'ℹ️';
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const boothLabel = payload.boothName ? `${payload.boothName} (${payload.boothId})` : payload.boothId;
    const dashboardUrl = process.env.DASHBOARD_URL || 'https://admin.pictolabs.id';

    const message = `${severityIcon} *[PICTOLABS ALERT - ${payload.severity}]*
*Booth:* ${boothLabel}
*Masalah:* ${payload.title}
*Waktu:* ${timestamp} WIB
*Detail:* ${payload.detail}
*Tindakan:* ${payload.action}
*Dashboard:* ${dashboardUrl}/booths/${payload.boothId}`;

    const gatewayUrl = process.env.WA_GATEWAY_URL;
    const apiKey = process.env.WA_API_KEY;
    const targetPhone = process.env.WA_ADMIN_PHONE || '081234567890';
    const isEnabled = process.env.WA_ENABLED === 'true';

    // Record cooldown timestamp
    this.cooldowns.set(cooldownKey, now);

    if (isEnabled && gatewayUrl && apiKey) {
      try {
        const response = await fetch(gatewayUrl, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            target: targetPhone,
            message,
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`WhatsApp Gateway Error (${response.status}): ${errBody}`);
        }

        this.logger.log(`WhatsApp ${payload.severity} alert dispatched to ${targetPhone} for booth ${payload.boothId}`);
        return { sent: true, provider: 'WHATSAPP_GATEWAY', message, severity: payload.severity };
      } catch (err: any) {
        this.logger.error(`Failed to dispatch WhatsApp alert: ${err.message}`);
        return { sent: false, error: err.message, message, severity: payload.severity };
      }
    } else {
      // Local development or unconfigured mode
      this.logger.warn(`[WhatsApp Dispatcher Mock - ${payload.severity}] Target: ${targetPhone}\n${message}`);
      return {
        sent: true,
        simulated: true,
        severity: payload.severity,
        targetPhone,
        message,
      };
    }
  }
}
