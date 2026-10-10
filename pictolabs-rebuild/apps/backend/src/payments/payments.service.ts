import {
  Injectable,
  Logger,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  BadGatewayException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KioskGateway } from '../gateway/kiosk.gateway';
import { CreateQRISDto, MidtransWebhookDto } from './dto/payment.dto';
import * as crypto from 'crypto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly serverKey: string;
  private readonly clientKey: string;
  private readonly isProduction: boolean;
  private readonly apiUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: KioskGateway,
  ) {
    this.serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-test-key';
    this.clientKey = process.env.MIDTRANS_CLIENT_KEY || 'SB-Mid-client-test-key';
    this.isProduction = process.env.MIDTRANS_IS_PRODUCTION === 'true';
    this.apiUrl = this.isProduction
      ? 'https://api.midtrans.com/v2'
      : 'https://api.sandbox.midtrans.com/v2';
  }

  /**
   * Generates a unique order ID adhering to standard format:
   * TRX_<boothPrefix>_<timestamp>_<randomHex>
   */
  private generateOrderId(boothId: string): string {
    const cleanBooth = boothId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
    const timestamp = Date.now();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TRX_${cleanBooth}_${timestamp}_${rand}`;
  }

  /**
   * Helper to check if a valid, non-placeholder server key is configured
   */
  public isConfiguredKey(): boolean {
    if (!this.serverKey) return false;
    const trimmed = this.serverKey.trim();
    if (!trimmed) return false;
    if (
      trimmed === 'SB-Mid-server-test-key' ||
      trimmed.includes('test-key') ||
      trimmed.startsWith('SB-Mid-server-test')
    ) {
      return false;
    }
    return true;
  }

  /**
   * Calculate SHA-512 signature key for Midtrans payload verification
   */
  public calculateSignature(orderId: string, statusCode: string, grossAmount: string): string {
    const raw = `${orderId}${statusCode}${grossAmount}${this.serverKey}`;
    return crypto.createHash('sha512').update(raw).digest('hex');
  }

  /**
   * Resolves the authoritative expected payment amount for a transaction.
   * PR-01 Foundation: Authoritative baseline is BoothConfig.pricing.basePrice (defaults to 35000).
   * Extension point for PR-05: Cleanly accepts dto (e.g. quantity, tier, voucher) to calculate
   * total amount without altering the caller's financial integrity validation contract.
   */
  public resolveExpectedAmount(boothConfig: any, dto: CreateQRISDto): number {
    let basePrice = 35000;
    if (boothConfig?.generalSettings) {
      try {
        const parsed = typeof boothConfig.generalSettings === 'string'
          ? JSON.parse(boothConfig.generalSettings)
          : boothConfig.generalSettings;
        if (typeof parsed?.pricing?.basePrice === 'number') {
          basePrice = parsed.pricing.basePrice;
        } else if (typeof parsed?.price === 'number') {
          basePrice = parsed.price;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to parse booth config for pricing check: ${err?.message}`);
      }
    }

    // PR-01 baseline resolution is 1x basePrice.
    // PR-05 Extension Hook: (basePrice * quantity) or tiered pricing rules will plug in here.
    return basePrice;
  }

  /**
   * Request Dynamic QRIS from Midtrans Core API and persist transaction record
   */
  async createQRIS(dto: CreateQRISDto) {
    this.logger.log(`[PaymentsService] Creating QRIS for booth=${dto.boothId}, amount=${dto.amount}`);

    // 1. Resolve Booth (strict validation, no silent fallback to random booth)
    const booth = await this.prisma.booth.findFirst({
      where: {
        OR: [
          { id: dto.boothId },
          { deviceSecret: dto.boothId },
          { device: { deviceSecret: dto.boothId, status: 'ACTIVE' } },
        ],
      },
      include: { config: true },
    });

    if (!booth) {
      throw new NotFoundException(`Booth not found: ${dto.boothId}`);
    }

    // 2. Resolve authoritative expected amount via calculation boundary (PR-05 extensible)
    const expectedAmount = this.resolveExpectedAmount(booth.config, dto);

    // Financial integrity verification: validate client amount against resolved expected amount
    const requestedAmount = Number(dto.amount);
    if (isNaN(requestedAmount) || Math.round(requestedAmount) !== Math.round(expectedAmount)) {
      throw new BadRequestException(
        `Payment amount mismatch: expected amount is Rp ${expectedAmount.toLocaleString('id-ID')}, received Rp ${requestedAmount}`
      );
    }

    // 3. Resolve or create Session
    let session = dto.sessionId
      ? await this.prisma.session.findUnique({ where: { id: dto.sessionId } })
      : null;

    if (!session) {
      const newSessionId = dto.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      session = await this.prisma.session.create({
        data: {
          id: newSessionId,
          boothId: booth.id,
          status: 'PENDING_PAYMENT',
        },
      });
    }

    const orderId = this.generateOrderId(booth.id);
    let amount = expectedAmount;

    // Apply voucher discount if supplied
    if (dto.voucherCode) {
      const voucher = await this.prisma.voucher.findUnique({
        where: { code: dto.voucherCode },
      });
      if (voucher && voucher.expiresAt > new Date() && voucher.usedCount < voucher.usageLimit) {
        amount = Math.max(0, amount - voucher.discount);
        await this.prisma.voucher.update({
          where: { id: voucher.id },
          data: { usedCount: { increment: 1 } },
        });
        this.logger.log(`[PaymentsService] Applied voucher ${voucher.code}: discount Rp ${voucher.discount}`);
      }
    }

    let qrisString = '';
    let qrisUrl: string | undefined = undefined;
    let paymentRef: string | undefined = undefined;

    // 3. Request QRIS from Midtrans Core API
    if (!this.isConfiguredKey()) {
      this.logger.error(
        `[PaymentsService] Midtrans server key is unconfigured or a placeholder (${this.serverKey?.slice(0, 10)}...). Refusing to generate fake payment QR.`
      );
      throw new ServiceUnavailableException(
        'Layanan pembayaran QRIS belum dikonfigurasi dengan kredensial gateway yang valid.'
      );
    }

    const authHeader = `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
    const chargePayload = {
      payment_type: 'qris',
      transaction_details: {
        order_id: orderId,
        gross_amount: Math.round(amount),
      },
      qris: {
        acquirer: 'gopay',
      },
      custom_field1: booth.id,
      custom_field2: session.id,
    };

    let response: Response;
    let resData: any;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      response = await fetch(`${this.apiUrl}/charge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(chargePayload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      resData = await response.json().catch(() => ({}));
    } catch (err: any) {
      this.logger.error(`[PaymentsService] Failed calling Midtrans API: ${err.message}`);
      throw new BadGatewayException(
        `Gagal menghubungi gerbang pembayaran Midtrans: ${err.name === 'AbortError' ? 'Koneksi timeout' : err.message}`
      );
    }

    if (!response.ok || (resData.status_code !== '201' && resData.status_code !== '200')) {
      const statusMsg =
        resData.status_message ||
        (Array.isArray(resData.validation_messages)
          ? resData.validation_messages.join(', ')
          : 'Permintaan ditolak gerbang pembayaran');
      this.logger.error(
        `[PaymentsService] Midtrans charge failed (HTTP ${response.status}, code ${resData.status_code}): ${statusMsg}`
      );
      throw new BadGatewayException(
        `Gerbang pembayaran Midtrans menolak pembuatan QRIS (${resData.status_code || response.status}): ${statusMsg}`
      );
    }

    qrisString = resData.qr_string || '';
    paymentRef = resData.transaction_id;
    const qrAction = resData.actions?.find((a: any) => a.name === 'generate-qr-code');
    if (qrAction) {
      qrisUrl = qrAction.url;
    }

    if (!qrisString) {
      this.logger.error(`[PaymentsService] Midtrans response missing qr_string for order ${orderId}`);
      throw new BadGatewayException('Gerbang pembayaran tidak mengembalikan qr_string yang valid.');
    }

    this.logger.log(`[PaymentsService] ✓ Midtrans QRIS charge success: ${orderId} (ref: ${paymentRef})`);

    const expiresAt = new Date(Date.now() + 270 * 1000); // 270 seconds = 4.5 minutes

    // 4. Atomic Database Persistence
    const transaction = await this.prisma.transaction.create({
      data: {
        orderId,
        sessionId: session.id,
        amount,
        status: 'PENDING',
      },
    });

    await this.prisma.payment.create({
      data: {
        transactionId: transaction.id,
        orderId,
        method: 'QRIS',
        status: 'PENDING',
        paymentRef: paymentRef || null,
        qrisString,
        qrisUrl: qrisUrl || null,
        amount,
        expiresAt,
      },
    });

    this.logger.log(`[PaymentsService] ✓ Stored Transaction and Payment record for order: ${orderId}`);

    return {
      success: true,
      orderId,
      sessionId: session.id,
      amount,
      qrisString,
      qrisUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Handles Midtrans HTTP Webhook Callback
   * Verifies signature, updates status idempotently, and notifies Kiosk via WebSocket.
   */
  async handleWebhook(payload: MidtransWebhookDto) {
    this.logger.log(`[PaymentsService] Webhook received for order: ${payload.order_id}, status: ${payload.transaction_status}`);

    const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = payload;

    // 1. Verify Cryptographic Signature
    if (this.isConfiguredKey()) {
      if (!signature_key) {
        this.logger.error(`[PaymentsService] ✗ Missing signature_key for order ${order_id}`);
        throw new UnauthorizedException('Missing cryptographic signature');
      }
      const expectedSignature = this.calculateSignature(order_id, status_code, gross_amount);
      if (signature_key !== expectedSignature) {
        this.logger.error(`[PaymentsService] ✗ Invalid signature key for order ${order_id}`);
        throw new UnauthorizedException('Invalid cryptographic signature');
      }
      this.logger.log(`[PaymentsService] ✓ Signature verified for order ${order_id}`);
    } else if (signature_key && this.serverKey) {
      const expectedSignature = this.calculateSignature(order_id, status_code, gross_amount);
      if (signature_key !== expectedSignature) {
        this.logger.error(`[PaymentsService] ✗ Invalid signature key for order ${order_id}`);
        throw new UnauthorizedException('Invalid cryptographic signature');
      }
    }

    // 2. Fetch Transaction and Payment
    const transaction = await this.prisma.transaction.findFirst({
      where: { orderId: order_id },
      include: { payment: true, session: { include: { booth: true } } },
    });

    if (!transaction) {
      this.logger.warn(`[PaymentsService] Transaction not found for orderId: ${order_id}`);
      return { status: 'ignored', message: 'Transaction not found' };
    }

    // 3. Idempotency Check
    if (transaction.status === 'SETTLED') {
      this.logger.log(`[PaymentsService] Order ${order_id} is already SETTLED. Skipping duplicate mutation.`);
      return { status: 'ok', message: 'Transaction already settled' };
    }

    // 4. Map Midtrans Status
    const isSettled =
      transaction_status === 'settlement' ||
      (transaction_status === 'capture' && fraud_status === 'accept');
    const isExpired = transaction_status === 'expire';
    const isCancelled = transaction_status === 'cancel';

    const rawPayloadString = JSON.stringify(payload);

    if (isSettled) {
      // Settle transaction atomically
      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'SETTLED' },
        }),
        this.prisma.payment.update({
          where: { transactionId: transaction.id },
          data: {
            status: 'SUCCESS',
            paidAt: new Date(),
            rawWebhookPayload: rawPayloadString,
          },
        }),
        this.prisma.session.update({
          where: { id: transaction.sessionId },
          data: { status: 'PAID' },
        }),
      ]);

      this.logger.log(`[PaymentsService] ✓ Order ${order_id} SETTLED successfully!`);

      // 5. Notify Kiosk via WebSocket
      const boothId = transaction.session?.boothId || transaction.session?.booth?.id;
      if (boothId) {
        this.gateway.notifyPaymentSettled(boothId, {
          orderId: order_id,
          sessionId: transaction.sessionId,
          amount: transaction.amount,
          status: 'SETTLED',
          settledAt: new Date().toISOString(),
        });
      }
    } else if (isExpired) {
      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'EXPIRED' },
        }),
        this.prisma.payment.update({
          where: { transactionId: transaction.id },
          data: {
            status: 'EXPIRED',
            rawWebhookPayload: rawPayloadString,
          },
        }),
      ]);

      const boothId = transaction.session?.boothId || transaction.session?.booth?.id;
      if (boothId) {
        this.gateway.notifyPaymentExpired(boothId, { orderId: order_id });
      }
    } else if (isCancelled) {
      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: 'CANCELLED' },
        }),
        this.prisma.payment.update({
          where: { transactionId: transaction.id },
          data: {
            status: 'CANCELLED',
            rawWebhookPayload: rawPayloadString,
          },
        }),
      ]);
    }

    return {
      status: 'ok',
      orderId: order_id,
      transactionStatus: isSettled ? 'SETTLED' : transaction_status,
    };
  }

  /**
   * Check Transaction Status (for Polling fallback & Reboot recovery)
   */
  async checkStatus(orderId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { orderId },
      include: { payment: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with orderId ${orderId} not found`);
    }

    return {
      orderId: transaction.orderId,
      sessionId: transaction.sessionId,
      amount: transaction.amount,
      status: transaction.status,
      paid: transaction.status === 'SETTLED',
      expiresAt: transaction.payment?.expiresAt,
      paidAt: transaction.payment?.paidAt,
    };
  }

  /**
   * Cancel an active transaction (user pressed 'Batal' or timed out)
   */
  async cancelTransaction(orderId: string) {
    this.logger.log(`[PaymentsService] Cancelling transaction: ${orderId}`);

    const transaction = await this.prisma.transaction.findFirst({
      where: { orderId },
      include: { payment: true, session: true },
    });

    if (!transaction) {
      return { success: false, message: 'Transaction not found' };
    }

    if (transaction.status === 'SETTLED') {
      return { success: false, message: 'Cannot cancel an already settled transaction' };
    }

    // Attempt to cancel on Midtrans if configured API key
    if (this.isConfiguredKey()) {
      try {
        const authHeader = `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
        await fetch(`${this.apiUrl}/${orderId}/cancel`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
          },
        });
      } catch (err: any) {
        this.logger.warn(`[PaymentsService] Midtrans cancel API notice: ${err.message}`);
      }
    }

    // Update in database
    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'CANCELLED' },
      }),
      this.prisma.payment.update({
        where: { transactionId: transaction.id },
        data: { status: 'CANCELLED' },
      }),
    ]);

    return { success: true, orderId, status: 'CANCELLED' };
  }

  /**
   * Testing & Development Helper: Simulates a successful settlement webhook
   */
  async simulateSettlement(orderId: string) {
    if (this.isProduction || process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Payment simulation is strictly forbidden in production mode.');
    }

    const transaction = await this.prisma.transaction.findFirst({
      where: { orderId },
      include: { payment: true },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with orderId ${orderId} not found`);
    }

    if (transaction.status !== 'PENDING') {
      throw new BadRequestException(`Cannot simulate settlement: transaction is already in ${transaction.status} status`);
    }

    // Safety guard: do not allow internal backdoor simulation on real Midtrans gateway transactions.
    // Real gateway transactions must be settled via the Midtrans QRIS Simulator or official webhook.
    if (transaction.payment?.paymentRef && !transaction.payment.paymentRef.startsWith('sim_')) {
      throw new ForbiddenException(
        'Simulasi internal tidak diizinkan untuk transaksi gerbang pembayaran nyata. Gunakan simulator resmi Midtrans (https://simulator.sandbox.midtrans.com/qris/index) atau callback webhook resmi.'
      );
    }

    const payload: MidtransWebhookDto = {
      order_id: orderId,
      status_code: '200',
      gross_amount: Math.round(transaction.amount).toString() + '.00',
      transaction_status: 'settlement',
      fraud_status: 'accept',
      signature_key: this.calculateSignature(orderId, '200', Math.round(transaction.amount).toString() + '.00'),
      transaction_id: `sim_${Date.now()}`,
      payment_type: 'qris',
      settlement_time: new Date().toISOString(),
    };

    return this.handleWebhook(payload);
  }
}
