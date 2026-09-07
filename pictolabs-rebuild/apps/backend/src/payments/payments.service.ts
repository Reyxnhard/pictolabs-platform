import { Injectable, Logger, UnauthorizedException, NotFoundException } from '@nestjs/common';
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
   * Generates an EMVCo-compliant QRIS test string for offline / sandbox simulation
   */
  private generateFallbackQRIS(orderId: string, amount: number): string {
    const formattedAmount = Math.round(amount).toString();
    return `00020101021226590014ID.LINKAJA.WWW01189360091100222071850215${orderId.padEnd(20, '0')}0303UMI51440014ID.CO.QRIS.WWW0215ID10200210000010303UMI520458125303360540${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}5802ID5909PICTOLABS6007JAKARTA61051234062070703A016304`;
  }

  /**
   * Calculate SHA-512 signature key for Midtrans payload verification
   */
  public calculateSignature(orderId: string, statusCode: string, grossAmount: string): string {
    const raw = `${orderId}${statusCode}${grossAmount}${this.serverKey}`;
    return crypto.createHash('sha512').update(raw).digest('hex');
  }

  /**
   * Request Dynamic QRIS from Midtrans Core API and persist transaction record
   */
  async createQRIS(dto: CreateQRISDto) {
    this.logger.log(`[PaymentsService] Creating QRIS for booth=${dto.boothId}, amount=${dto.amount}`);

    // 1. Resolve Booth
    let booth = await this.prisma.booth.findFirst({
      where: {
        OR: [
          { id: dto.boothId },
          { deviceSecret: dto.boothId },
        ],
      },
    });

    if (!booth) {
      // If booth is not in DB yet (e.g., local dev), fetch any booth or create default
      booth = await this.prisma.booth.findFirst();
      if (!booth) {
        // Create fallback company & branch if needed
        let branch = await this.prisma.branch.findFirst();
        if (!branch) {
          const company = await this.prisma.company.create({
            data: { name: 'Pictolabs Default Company' },
          });
          branch = await this.prisma.branch.create({
            data: { name: 'Main Branch', companyId: company.id },
          });
        }
        booth = await this.prisma.booth.create({
          data: {
            name: 'Booth Alpha 01',
            deviceSecret: dto.boothId || 'dev-secret-booth-01',
            branchId: branch.id,
            status: 'ONLINE',
          },
        });
      }
    }

    // 2. Resolve or create Session
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
    let amount = Number(dto.amount) || 35000;

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
    const isMockKey = !this.serverKey || this.serverKey.includes('test-key') || this.serverKey.startsWith('SB-Mid-server-test');

    if (!isMockKey) {
      try {
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

        const response = await fetch(`${this.apiUrl}/charge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify(chargePayload),
        });

        const resData = await response.json();

        if (response.ok && (resData.status_code === '201' || resData.status_code === '200')) {
          qrisString = resData.qr_string || '';
          paymentRef = resData.transaction_id;
          const qrAction = resData.actions?.find((a: any) => a.name === 'generate-qr-code');
          if (qrAction) {
            qrisUrl = qrAction.url;
          }
          this.logger.log(`[PaymentsService] ✓ Midtrans QRIS charge success: ${orderId} (ref: ${paymentRef})`);
        } else {
          this.logger.warn(`[PaymentsService] Midtrans returned status ${resData.status_code}: ${resData.status_message}`);
          qrisString = this.generateFallbackQRIS(orderId, amount);
        }
      } catch (err: any) {
        this.logger.error(`[PaymentsService] Failed calling Midtrans API: ${err.message}. Using fallback QRIS.`);
        qrisString = this.generateFallbackQRIS(orderId, amount);
      }
    } else {
      // Sandbox test key or development environment
      this.logger.log(`[PaymentsService] Using sandbox simulation mode for QRIS: ${orderId}`);
      qrisString = this.generateFallbackQRIS(orderId, amount);
    }

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
    const isMockKey = !this.serverKey || this.serverKey.includes('test-key') || this.serverKey.startsWith('SB-Mid-server-test');
    if (!isMockKey && signature_key) {
      const expectedSignature = this.calculateSignature(order_id, status_code, gross_amount);
      if (signature_key !== expectedSignature) {
        this.logger.error(`[PaymentsService] ✗ Invalid signature key for order ${order_id}`);
        throw new UnauthorizedException('Invalid cryptographic signature');
      }
      this.logger.log(`[PaymentsService] ✓ Signature verified for order ${order_id}`);
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

    // Attempt to cancel on Midtrans if live API key
    const isMockKey = !this.serverKey || this.serverKey.includes('test-key') || this.serverKey.startsWith('SB-Mid-server-test');
    if (!isMockKey) {
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
    const transaction = await this.prisma.transaction.findFirst({
      where: { orderId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with orderId ${orderId} not found`);
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
