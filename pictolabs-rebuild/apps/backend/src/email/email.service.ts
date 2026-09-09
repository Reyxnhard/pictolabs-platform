import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

export interface SendEmailOptions {
  sessionId: string;
  recipientEmail: string;
  photoStripUrl?: string;
  customerDownloadUrl: string;
  venueName?: string;
  expirationDate?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private emailRateLimits = new Map<string, number[]>();

  /**
   * Enforces max 3 emails per session per hour rate limit.
   */
  checkRateLimit(sessionId: string): void {
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const timestamps = (this.emailRateLimits.get(sessionId) || []).filter((t) => t > oneHourAgo);

    if (timestamps.length >= 3) {
      throw new HttpException(
        'Rate limit exceeded: maximum 3 emails per session per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    timestamps.push(now);
    this.emailRateLimits.set(sessionId, timestamps);
  }

  /**
   * Dispatches branded photostrip delivery email via Resend API or mock fallback.
   */
  async sendSoftfiles(options: SendEmailOptions) {
    this.checkRateLimit(options.sessionId);

    const apiKey = process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY;
    const from = process.env.EMAIL_FROM || 'Pictolabs <delivery@pictolabs.id>';
    const venue = options.venueName || 'Grand Indonesia';
    const expiration = options.expirationDate || '30 hari';
    const subject = `Foto & Video Anda dari Pictolabs (${venue})`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Pictolabs Softfile Delivery</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
    .header { background: linear-gradient(135deg, #6366f1, #a855f7); padding: 32px; text-align: center; color: white; }
    .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
    .content { padding: 32px 24px; text-align: center; }
    .preview-box { margin: 20px auto; max-width: 280px; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); }
    .btn { display: inline-block; background: #6366f1; color: #ffffff !important; padding: 14px 32px; border-radius: 8px; font-weight: 600; text-decoration: none; margin-top: 24px; }
    .retention-box { margin-top: 24px; padding: 12px; background: #0f172a; border-radius: 8px; font-size: 13px; color: #94a3b8; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>PICTOLABS PHOTOBOOTH</h1>
      <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">Kenangan Anda di ${venue}</p>
    </div>
    <div class="content">
      <h2 style="margin: 0 0 12px 0; color: #f1f5f9; font-size: 20px;">Foto & Live Photo Anda Siap!</h2>
      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
        Terima kasih telah berfoto di Pictolabs. Anda dapat mengunduh seluruh file foto beresolusi tinggi, photostrip composite, dan video Live Photo melalui tautan di bawah ini:
      </p>
      ${
        options.photoStripUrl
          ? `<div class="preview-box"><img src="${options.photoStripUrl}" alt="Photostrip" style="width: 100%; display: block;" /></div>`
          : ''
      }
      <a href="${options.customerDownloadUrl}" class="btn" target="_blank">Unduh Foto & Video (ZIP)</a>
      <div class="retention-box">
        ⏳ <strong>Catatan Penyimpanan:</strong> File foto digital Anda disimpan secara aman selama <strong>${expiration}</strong>. Pastikan untuk mengunduh seluruh foto sebelum masa berlaku berakhir.
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} Pictolabs Photobooth. Layanan Pelanggan: support@pictolabs.id
    </div>
  </div>
</body>
</html>
`;

    if (apiKey) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [options.recipientEmail],
            subject,
            html: htmlContent,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Resend API failed (${response.status}): ${errText}`);
        }

        const data = await response.json();
        this.logger.log(`Live transactional email delivered via Resend: ID ${data.id} to ${options.recipientEmail}`);
        return { success: true, provider: 'RESEND', id: data.id, recipientEmail: options.recipientEmail };
      } catch (err: any) {
        this.logger.error(`Resend API delivery error: ${err.message}. Falling back to simulated log.`);
        // Fallback gracefully without breaking customer flow
        return { success: true, provider: 'FALLBACK_MOCK', error: err.message, recipientEmail: options.recipientEmail };
      }
    } else {
      this.logger.warn(`[Resend Mock Logger] RESEND_API_KEY not configured. Simulated email delivery to: ${options.recipientEmail}`);
      this.logger.debug(`[Mock Subject] ${subject}`);
      return { success: true, provider: 'MOCK', simulated: true, recipientEmail: options.recipientEmail };
    }
  }
}
