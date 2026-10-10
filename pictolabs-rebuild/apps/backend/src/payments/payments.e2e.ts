import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { KioskGateway } from '../gateway/kiosk.gateway';
import * as crypto from 'crypto';

// ─── Mathematical EMVCo & CRC-16 Verification Utilities ───────

function computeCRC16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parseEMVCoTLV(qris: string): { valid: boolean; error?: string; tags: Record<string, string> } {
  let index = 0;
  const tags: Record<string, string> = {};
  while (index < qris.length) {
    if (index + 4 > qris.length) {
      return { valid: false, error: `Truncated tag/length header at index ${index}`, tags };
    }
    const tag = qris.slice(index, index + 2);
    const len = parseInt(qris.slice(index + 2, index + 4), 10);
    if (isNaN(len)) {
      return { valid: false, error: `Invalid length digits for tag ${tag}`, tags };
    }
    index += 4;
    if (index + len > qris.length) {
      return { valid: false, error: `Tag ${tag} specifies length ${len} exceeding remaining bytes`, tags };
    }
    tags[tag] = qris.slice(index, index + len);
    index += len;
  }
  return { valid: true, tags };
}

function verifyEMVCoCRC(qris: string): boolean {
  if (!qris.includes('6304')) return false;
  const crcIndex = qris.lastIndexOf('6304');
  const payloadToVerify = qris.slice(0, crcIndex + 4);
  const expectedCrc = qris.slice(crcIndex + 4, crcIndex + 8).toUpperCase();
  const calculatedCrc = computeCRC16(payloadToVerify);
  return calculatedCrc === expectedCrc;
}

// ─── Main E2E Runner ──────────────────────────────────────────

async function runPaymentSprint2Tests() {
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  PICTOLABS: MIDTRANS QRIS SANDBOX INTEGRATION & GATEWAY AUDIT  ');
  console.log('═════════════════════════════════════════════════════════════════');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const paymentsService = app.get(PaymentsService);
  const prisma = app.get(PrismaService);
  const gateway = app.get(KioskGateway);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  const originalFetch = globalThis.fetch;

  try {
    // ─── Setup Booth for Testing ─────────────────────────────
    let testBooth = await prisma.booth.findFirst({ where: { deviceSecret: 'test-booth-sprint2' }, include: { config: true } });
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
        include: { config: true },
      });
    }

    // Ensure booth config basePrice is 35000
    if (!testBooth.config) {
      await prisma.boothConfig.create({
        data: {
          boothId: testBooth.id,
          generalSettings: JSON.stringify({ pricing: { basePrice: 35000 } }),
        },
      });
    }

    // ─── MILESTONE 1: Placeholder Credentials Protection ─────
    console.log('\n[MILESTONE 1: Placeholder Credentials Protection]');
    // Verify that when serverKey is a placeholder ('SB-Mid-server-test-key'), createQRIS fails explicitly with 503
    (paymentsService as any).serverKey = 'SB-Mid-server-test-key';
    let placeholderBlocked = false;
    let placeholderError = '';
    try {
      await paymentsService.createQRIS({
        boothId: testBooth.id,
        amount: 35000,
        productName: 'Photostrip 2R',
      });
    } catch (err: any) {
      placeholderBlocked = true;
      placeholderError = err.message;
      assert(err.status === 503, 'AC-1.1: Placeholder server key throws ServiceUnavailableException (HTTP 503)');
      assert(
        err.message.includes('belum dikonfigurasi'),
        'AC-1.2: Error message clearly indicates gateway credentials are not configured'
      );
    }
    assert(placeholderBlocked, 'AC-1.3: Refuses to generate dummy/fake QRIS when serverKey is placeholder');

    // ─── MILESTONE 2: Authoritative Amount & Anti-Tampering ──
    console.log('\n[MILESTONE 2: Authoritative Amount & Anti-Tampering]');
    (paymentsService as any).serverKey = 'SB-Mid-server-VALID-TEST-KEY-42';
    let tamperingBlocked = false;
    try {
      await paymentsService.createQRIS({
        boothId: testBooth.id,
        amount: 1000, // Client spoofed Rp 1.000 instead of Rp 35.000
      });
    } catch (err: any) {
      tamperingBlocked = true;
      assert(err.status === 400, 'AC-2.1: Tampered amount throws BadRequestException (HTTP 400)');
      assert(err.message.includes('Payment amount mismatch'), 'AC-2.2: Explains payment amount mismatch');
    }
    assert(tamperingBlocked, 'AC-2.3: Anti-tampering check validates against server authoritative price');

    // ─── MILESTONE 3: Gateway Error, Timeout, & Rejection ────
    console.log('\n[MILESTONE 3: Gateway Error, Timeout, & Rejection Handling]');

    // Case 3A: Midtrans HTTP 401 Unauthorized (Invalid credentials)
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status_code: '401',
          status_message: 'Access denied due to unauthorized transaction, please check client key or server key',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );

    let authErrorCaught = false;
    try {
      await paymentsService.createQRIS({
        boothId: testBooth.id,
        amount: 35000,
      });
    } catch (err: any) {
      authErrorCaught = true;
      assert(err.status === 502, 'AC-3.1: Midtrans HTTP 401 triggers BadGatewayException (HTTP 502)');
      assert(err.message.includes('401') || err.message.includes('Access denied'), 'AC-3.2: Error message relays gateway rejection');
    }
    assert(authErrorCaught, 'AC-3.3: Midtrans 401 does NOT fall back to fake QR');

    // Case 3B: Midtrans Timeout / Abort
    globalThis.fetch = async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    };

    let timeoutErrorCaught = false;
    try {
      await paymentsService.createQRIS({
        boothId: testBooth.id,
        amount: 35000,
      });
    } catch (err: any) {
      timeoutErrorCaught = true;
      assert(err.status === 502, 'AC-3.4: Gateway timeout triggers BadGatewayException (HTTP 502)');
      assert(err.message.includes('timeout'), 'AC-3.5: Error message mentions connection timeout');
    }
    assert(timeoutErrorCaught, 'AC-3.6: Gateway timeout does NOT fall back to fake QR');

    // ─── MILESTONE 4: Authentic Midtrans 201 Contract Processing ─
    console.log('\n[MILESTONE 4: Authentic Midtrans 201 Contract Processing]');

    // Build a realistic EMVCo QRIS string for Midtrans 201 response
    function formatTag(tag: string, val: string): string {
      const len = val.length.toString().padStart(2, '0');
      return `${tag}${len}${val}`;
    }

    function buildValidEMVCoQRIS(params: { orderId: string; amount: number; merchantName: string; city: string; postalCode: string }): string {
      const sub26_00 = formatTag('00', 'COM.GO-JEK.WWW');
      const sub26_01 = formatTag('01', '012345678901234567');
      const sub26_02 = formatTag('02', params.orderId);
      const tag26Val = `${sub26_00}${sub26_01}${sub26_02}`;

      const sub51_00 = formatTag('00', 'ID.CO.QRIS.WWW');
      const sub51_01 = formatTag('01', '1020021000001');
      const tag51Val = `${sub51_00}${sub51_01}`;

      const formattedAmount = Math.round(params.amount).toString();

      const parts = [
        formatTag('00', '01'),
        formatTag('01', '12'),
        formatTag('26', tag26Val),
        formatTag('51', tag51Val),
        formatTag('52', '5812'),
        formatTag('53', '360'),
        formatTag('54', formattedAmount),
        formatTag('58', 'ID'),
        formatTag('59', params.merchantName),
        formatTag('60', params.city),
        formatTag('61', params.postalCode),
        formatTag('62', formatTag('07', '03A01')),
      ];

      const prefix = parts.join('') + '6304';
      const crc = computeCRC16(prefix);
      return `${prefix}${crc}`;
    }

    const mockTxId = `midtrans_tx_${Date.now()}`;
    const authenticEMVCoString = buildValidEMVCoQRIS({
      orderId: 'TRX_SAMPLE_ORDER_1',
      amount: 35000,
      merchantName: 'PICTOLABS',
      city: 'JAKARTA',
      postalCode: '12340',
    });
    const mockQrImageUrl = `https://api.sandbox.midtrans.com/v2/qris/${mockTxId}/qr-code`;

    let capturedOutboundBody: any = null;
    let capturedOutboundAuth: any = null;

    globalThis.fetch = async (_url, init) => {
      capturedOutboundAuth = (init?.headers as any)?.['Authorization'];
      capturedOutboundBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          status_code: '201',
          status_message: 'Success, QRIS transaction is created',
          transaction_id: mockTxId,
          order_id: capturedOutboundBody.transaction_details.order_id,
          merchant_id: 'G141536081',
          gross_amount: '35000.00',
          currency: 'IDR',
          payment_type: 'qris',
          transaction_time: new Date().toISOString(),
          transaction_status: 'pending',
          fraud_status: 'accept',
          actions: [
            {
              name: 'generate-qr-code',
              method: 'GET',
              url: mockQrImageUrl,
            },
          ],
          qr_string: authenticEMVCoString,
          expiry_time: new Date(Date.now() + 270 * 1000).toISOString(),
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const validQrisResult = await paymentsService.createQRIS({
      boothId: testBooth.id,
      amount: 35000,
      productName: 'Photostrip 2R',
    });

    assert(validQrisResult.success === true, 'AC-4.1: createQRIS returns success: true on HTTP 201');
    assert(validQrisResult.orderId.startsWith('TRX_'), `AC-4.2: orderId is properly formatted (${validQrisResult.orderId})`);
    assert(validQrisResult.qrisString === authenticEMVCoString, 'AC-4.3: qrisString matches Midtrans payload exactly');
    assert(validQrisResult.qrisUrl === mockQrImageUrl, 'AC-4.4: qrisUrl matches Midtrans actions url');
    assert(capturedOutboundBody.payment_type === 'qris', 'AC-4.5: Outbound payment_type is qris');
    assert(capturedOutboundBody.qris?.acquirer === 'gopay', 'AC-4.6: Outbound qris acquirer is gopay');
    assert(Boolean(capturedOutboundAuth && capturedOutboundAuth.startsWith('Basic ')), 'AC-4.7: Outbound request includes Basic Authorization header');

    // DB Persistence
    const dbTx = await prisma.transaction.findUnique({
      where: { orderId: validQrisResult.orderId },
      include: { payment: true, session: true },
    });
    assert(!!dbTx, 'AC-4.8: Transaction persisted in PostgreSQL');
    assert(dbTx?.status === 'PENDING', 'AC-4.9: Transaction status is PENDING');
    assert(dbTx?.payment?.paymentRef === mockTxId, 'AC-4.10: Payment stores Midtrans transaction_id as paymentRef');
    assert(dbTx?.payment?.qrisUrl === mockQrImageUrl, 'AC-4.11: Payment stores Midtrans qrisUrl');

    // ─── MILESTONE 5: Rigorous EMVCo TLV & CRC-16 Verification ─
    console.log('\n[MILESTONE 5: Rigorous EMVCo TLV & CRC-16 Verification]');
    const parsedValid = parseEMVCoTLV(validQrisResult.qrisString);
    assert(parsedValid.valid === true, 'AC-5.1: EMVCo TLV stream parses without byte errors');
    assert(parsedValid.tags['00'] === '01', 'AC-5.2: Tag 00 Payload Format Indicator is 01');
    assert(parsedValid.tags['01'] === '12', 'AC-5.3: Tag 01 Point of Initiation Method is 12 (Dynamic)');
    assert(parsedValid.tags['53'] === '360', 'AC-5.4: Tag 53 Transaction Currency is 360 (IDR)');
    assert(parsedValid.tags['58'] === 'ID', 'AC-5.5: Tag 58 Country Code is ID');
    assert(parsedValid.tags['63']?.length === 4, 'AC-5.6: Tag 63 CRC-16 length is exactly 4 characters');
    assert(verifyEMVCoCRC(validQrisResult.qrisString) === true, 'AC-5.7: CRC-16 CCITT (0x1021) mathematically matches checksum');

    // Negative check: verify that parser detects the old broken fallback string as invalid
    const oldBrokenString = `00020101021226590014ID.LINKAJA.WWW01189360091100222071850215TRX_554147_1790112969137_1ZZD0303UMI51440014ID.CO.QRIS.WWW0215ID10200210000010303UMI5204581253033605400410005802ID5909PICTOLABS6007JAKARTA61051234062070703A016304`;
    const parsedBroken = parseEMVCoTLV(oldBrokenString);
    assert(parsedBroken.valid === false, 'AC-5.8: TLV Parser correctly detects old fallback string as corrupt');
    assert(verifyEMVCoCRC(oldBrokenString) === false, 'AC-5.9: CRC-16 check correctly rejects old fallback string (missing CRC)');

    // ─── MILESTONE 6: Webhook Signature Verification ─────────
    console.log('\n[MILESTONE 6: Webhook Signature & State Transitions]');
    const calculatedSig = paymentsService.calculateSignature(validQrisResult.orderId, '200', '35000.00');

    // Case 6A: Missing signature
    let missingSigCaught = false;
    try {
      await paymentsService.handleWebhook({
        order_id: validQrisResult.orderId,
        status_code: '200',
        gross_amount: '35000.00',
        transaction_status: 'settlement',
      });
    } catch (err: any) {
      missingSigCaught = true;
      assert(err.status === 401, 'AC-6.1: Missing signature key throws UnauthorizedException (HTTP 401)');
    }
    assert(missingSigCaught, 'AC-6.2: Webhook rejects callback without signature');

    // Case 6B: Spoofed / Invalid signature
    let spoofedSigCaught = false;
    try {
      await paymentsService.handleWebhook({
        order_id: validQrisResult.orderId,
        status_code: '200',
        gross_amount: '35000.00',
        transaction_status: 'settlement',
        signature_key: 'deadbeef_spoofed_signature',
      });
    } catch (err: any) {
      spoofedSigCaught = true;
      assert(err.status === 401, 'AC-6.3: Spoofed signature key throws UnauthorizedException (HTTP 401)');
    }
    assert(spoofedSigCaught, 'AC-6.4: Webhook rejects callback with invalid signature');

    // Case 6C: Valid signature -> Settle transaction
    let wsEventFired = false;
    let wsPayloadReceived: any = null;
    (gateway as any).notifyPaymentSettled = (bId: string, p: any) => {
      wsEventFired = true;
      wsPayloadReceived = p;
    };

    const webhookResult = await paymentsService.handleWebhook({
      order_id: validQrisResult.orderId,
      status_code: '200',
      gross_amount: '35000.00',
      transaction_status: 'settlement',
      fraud_status: 'accept',
      signature_key: calculatedSig,
      transaction_id: mockTxId,
      payment_type: 'qris',
    });

    assert(webhookResult.status === 'ok', 'AC-6.5: Valid webhook processed with status: ok');

    const settledTx = await prisma.transaction.findUnique({
      where: { orderId: validQrisResult.orderId },
      include: { payment: true, session: true },
    });
    assert(settledTx?.status === 'SETTLED', 'AC-6.6: Transaction transitioned to SETTLED');
    assert(settledTx?.payment?.status === 'SUCCESS', 'AC-6.7: Payment transitioned to SUCCESS');
    assert(settledTx?.session?.status === 'PAID', 'AC-6.8: Session transitioned to PAID');
    assert(wsEventFired, 'AC-6.9: WebSocket notifyPaymentSettled triggered');
    assert(wsPayloadReceived?.orderId === validQrisResult.orderId, 'AC-6.10: WebSocket payload contains exact orderId');

    // Case 6D: Idempotency
    const dupResult = await paymentsService.handleWebhook({
      order_id: validQrisResult.orderId,
      status_code: '200',
      gross_amount: '35000.00',
      transaction_status: 'settlement',
      fraud_status: 'accept',
      signature_key: calculatedSig,
    });
    assert(dupResult.status === 'ok' && Boolean(dupResult.message?.includes('already settled')), 'AC-6.11: Duplicate webhook handled idempotently');

    // ─── MILESTONE 7: Simulation Endpoint Security Bounds ─────
    console.log('\n[MILESTONE 7: Simulation Endpoint Security Bounds]');

    // Case 7A: Cannot simulate settlement on a transaction with real gateway paymentRef
    let realSimBlocked = false;
    try {
      await paymentsService.simulateSettlement(validQrisResult.orderId);
    } catch (err: any) {
      realSimBlocked = true;
      assert(err.status === 400 || err.status === 403, 'AC-7.1: Simulation rejected on settled/real-gateway transaction');
    }
    assert(realSimBlocked, 'AC-7.2: Real gateway transaction cannot be settled via backdoor simulation');

    // Case 7B: Simulation strictly blocked in production
    (paymentsService as any).isProduction = true;
    let prodSimBlocked = false;
    try {
      await paymentsService.simulateSettlement('dummy-order-id');
    } catch (err: any) {
      prodSimBlocked = true;
      assert(err.status === 403, 'AC-7.3: Simulation in production throws ForbiddenException (HTTP 403)');
    }
    assert(prodSimBlocked, 'AC-7.4: Internal simulation is strictly disabled when isProduction is true');
    (paymentsService as any).isProduction = false;

    // ─── MILESTONE 8: Timeout & Cancellation ─────────────────
    console.log('\n[MILESTONE 8: Timeout & Cancellation]');
    // Create a new pending transaction
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          status_code: '201',
          status_message: 'Success, QRIS transaction is created',
          transaction_id: `tx_cancel_${Date.now()}`,
          order_id: `TRX_CANCEL_${Date.now()}`,
          payment_type: 'qris',
          actions: [{ name: 'generate-qr-code', method: 'GET', url: 'https://test.url' }],
          qr_string: authenticEMVCoString,
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );

    const cancelQris = await paymentsService.createQRIS({
      boothId: testBooth.id,
      amount: 35000,
    });

    const cancelResult = await paymentsService.cancelTransaction(cancelQris.orderId);
    assert(cancelResult.success === true, 'AC-8.1: cancelTransaction returns success: true');

    const cancelledTx = await prisma.transaction.findUnique({
      where: { orderId: cancelQris.orderId },
    });
    assert(cancelledTx?.status === 'CANCELLED', 'AC-8.2: Transaction status transitioned to CANCELLED');

    const statusCheck = await paymentsService.checkStatus(cancelQris.orderId);
    assert(statusCheck.status === 'CANCELLED', 'AC-8.3: checkStatus confirms status is CANCELLED');

    console.log('\n═════════════════════════════════════════════════════════════════');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('═════════════════════════════════════════════════════════════════');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Test execution threw unhandled exception:', err);
    process.exit(1);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
}

runPaymentSprint2Tests();
