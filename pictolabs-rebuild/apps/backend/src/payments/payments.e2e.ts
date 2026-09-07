import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { KioskGateway } from '../gateway/kiosk.gateway';
import * as crypto from 'crypto';

async function runPaymentSprint2Tests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PICTOLABS SPRINT 2: PAYMENT & TRANSACTION SYSTEM E2E ');
  console.log('═══════════════════════════════════════════════════════');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const paymentsService = app.get(PaymentsService);
  const prisma = app.get(PrismaService);
  const gateway = app.get(KioskGateway);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  try {
    // ─── Setup Booth for Testing ─────────────────────────────
    let testBooth = await prisma.booth.findFirst({ where: { deviceSecret: 'test-booth-sprint2' } });
    if (!testBooth) {
      let company = await prisma.company.findFirst();
      if (!company) {
        company = await prisma.company.create({ data: { name: 'Test Company' } });
      }
      let branch = await prisma.branch.findFirst({ where: { companyId: company.id } });
      if (!branch) {
        branch = await prisma.branch.create({ data: { name: 'Test Branch', companyId: company.id } });
      }
      testBooth = await prisma.booth.create({
        data: {
          name: 'Sprint 2 Test Booth',
          deviceSecret: 'test-booth-sprint2',
          branchId: branch.id,
          status: 'ONLINE',
        },
      });
    }

    console.log('\n[MILESTONE 1 & 2: Dynamic QRIS Generation & DB Persistence]');
    const qrisResult = await paymentsService.createQRIS({
      boothId: testBooth.id,
      amount: 35000,
      productName: 'Photostrip 2R',
    });

    assert(qrisResult.success === true, 'AC-1.1: createQRIS returns success: true');
    assert(qrisResult.orderId.startsWith('TRX_'), `AC-1.2: orderId is formatted properly (${qrisResult.orderId})`);
    assert(typeof qrisResult.qrisString === 'string' && qrisResult.qrisString.length > 50, 'AC-1.3: qrisString contains valid EMVCo payload');
    assert(qrisResult.amount === 35000, 'AC-1.4: Nominal amount is correctly recorded');

    const dbTx = await prisma.transaction.findUnique({
      where: { orderId: qrisResult.orderId },
      include: { payment: true, session: true },
    });
    assert(!!dbTx, 'AC-2.1: Transaction persisted in SQLite dev.db');
    assert(dbTx?.status === 'PENDING', 'AC-2.2: Initial transaction status is PENDING');
    assert(dbTx?.payment?.status === 'PENDING', 'AC-2.3: Initial payment status is PENDING');
    assert(dbTx?.session?.status === 'PENDING_PAYMENT', 'AC-2.4: Session status is PENDING_PAYMENT');

    console.log('\n[MILESTONE 3: Cryptographic Signature Calculation]');
    const calculatedSig = paymentsService.calculateSignature(qrisResult.orderId, '200', '35000.00');
    const manualSig = crypto
      .createHash('sha512')
      .update(`${qrisResult.orderId}20035000.00${process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-test-key'}`)
      .digest('hex');
    assert(calculatedSig === manualSig, 'AC-3.1: SHA-512 signature key calculation matches Midtrans standard');

    console.log('\n[MILESTONE 4: Webhook Settlement & State Machine]');
    let wsEventFired = false as boolean;
    let wsPayloadReceived: any = null;
    const origNotify = (gateway as any).notifyPaymentSettled?.bind(gateway);
    (gateway as any).notifyPaymentSettled = (bId: string, p: any) => {
      wsEventFired = true;
      wsPayloadReceived = p;
      if (origNotify) origNotify(bId, p);
    };

    const webhookPayload = {
      order_id: qrisResult.orderId,
      status_code: '200',
      gross_amount: '35000.00',
      transaction_status: 'settlement',
      fraud_status: 'accept',
      signature_key: calculatedSig,
      transaction_id: `midtrans_${Date.now()}`,
      payment_type: 'qris',
    };

    const webhookResult = await paymentsService.handleWebhook(webhookPayload);
    assert(webhookResult.status === 'ok', 'AC-4.1: Webhook acknowledged with status: ok');

    const settledTx = await prisma.transaction.findUnique({
      where: { orderId: qrisResult.orderId },
      include: { payment: true, session: true },
    });
    assert(settledTx?.status === 'SETTLED', 'AC-4.2: Transaction status transitioned to SETTLED');
    assert(settledTx?.payment?.status === 'SUCCESS', 'AC-4.3: Payment status transitioned to SUCCESS');
    assert(settledTx?.session?.status === 'PAID', 'AC-4.4: Session status transitioned to PAID');
    assert(Boolean(wsEventFired), 'AC-4.5: WebSocket notifyPaymentSettled triggered');
    assert(wsPayloadReceived?.orderId === qrisResult.orderId, 'AC-4.6: WebSocket payload contains exact orderId');

    console.log('\n[MILESTONE 5: Webhook Idempotency]');
    const dupResult = await paymentsService.handleWebhook(webhookPayload);
    assert(dupResult.status === 'ok' && Boolean(dupResult.message?.includes('already settled')), 'AC-5.1: Duplicate webhook handled idempotently');

    console.log('\n[MILESTONE 6: Fallback Polling & Crash Recovery]');
    const statusCheck = await paymentsService.checkStatus(qrisResult.orderId);
    assert(statusCheck.paid === true, 'AC-6.1: checkStatus confirms paid: true for settled transaction');
    assert(statusCheck.status === 'SETTLED', 'AC-6.2: checkStatus returns status: SETTLED');

    console.log('\n[MILESTONE 7: Timeout & Cancellation]');
    const cancelQris = await paymentsService.createQRIS({
      boothId: testBooth.id,
      amount: 35000,
    });
    const cancelResult = await paymentsService.cancelTransaction(cancelQris.orderId);
    assert(cancelResult.success === true, 'AC-7.1: cancelTransaction returns success: true');

    const cancelledTx = await prisma.transaction.findUnique({
      where: { orderId: cancelQris.orderId },
    });
    assert(cancelledTx?.status === 'CANCELLED', 'AC-7.2: Transaction status transitioned to CANCELLED');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('═══════════════════════════════════════════════════════');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Test execution threw unhandled exception:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runPaymentSprint2Tests();
