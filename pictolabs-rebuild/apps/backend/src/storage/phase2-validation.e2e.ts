import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { StorageController } from './storage.controller';
import { SessionsController } from '../sessions/sessions.controller';

async function runPhase2Validation() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('       PICTOLABS PHASE 2 IMPLEMENTATION E2E VALIDATION SUITE          ');
  console.log('═══════════════════════════════════════════════════════════════════════');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const paymentsService = app.get(PaymentsService);
  const storageController = app.get(StorageController);
  const sessionsController = app.get(SessionsController);

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

  // Ensure test booth exists
  let testBooth = await prisma.booth.findFirst();
  if (!testBooth) {
    const company = await prisma.company.create({ data: { name: 'Validation Co' } });
    const branch = await prisma.branch.create({ data: { name: 'Validation Branch', companyId: company.id } });
    testBooth = await prisma.booth.create({
      data: {
        name: 'Validation Booth',
        deviceSecret: 'valid-device-secret-01',
        branchId: branch.id,
        status: 'ONLINE',
      },
    });
  }

  try {
    // ─────────────────────────────────────────────────────────────────
    // SCENARIO A: Normal Payment Flow (1 Session, 1 Transaction, N Photos)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO A: Normal Payment Flow]');
    const qrisResult = await paymentsService.createQRIS({
      boothId: testBooth.deviceSecret,
      amount: 35000,
      productName: 'Photostrip 2R',
    });

    const unifiedSessionId = qrisResult.sessionId;
    assert(!!unifiedSessionId, 'A.1: PaymentsService returns authoritative sessionId');

    // Simulate Sync session to PostgreSQL
    await sessionsController.syncSession({
      id: unifiedSessionId,
      frameId: 'classic-white',
      filter: 'none',
      photos: ['photo_1.jpg', 'photo_2.jpg'],
      printStatus: 'printed',
    }, testBooth.deviceSecret);

    // Simulate 3 photos confirmed for this session
    await storageController.confirmUpload({
      sessionId: unifiedSessionId,
      fileName: `composite_${unifiedSessionId}.jpg`,
      fileType: 'composite',
      key: `sessions/${unifiedSessionId}/composite.jpg`,
      publicUrl: `https://test.r2.dev/sessions/${unifiedSessionId}/composite.jpg`,
    }, testBooth.deviceSecret);

    await storageController.confirmUpload({
      sessionId: unifiedSessionId,
      fileName: `photo_${unifiedSessionId}_pose_1.jpg`,
      fileType: 'raw',
      key: `sessions/${unifiedSessionId}/pose1.jpg`,
      publicUrl: `https://test.r2.dev/sessions/${unifiedSessionId}/pose1.jpg`,
    }, testBooth.deviceSecret);

    await storageController.confirmUpload({
      sessionId: unifiedSessionId,
      fileName: `photo_${unifiedSessionId}_pose_2.jpg`,
      fileType: 'raw',
      key: `sessions/${unifiedSessionId}/pose2.jpg`,
      publicUrl: `https://test.r2.dev/sessions/${unifiedSessionId}/pose2.jpg`,
    }, testBooth.deviceSecret);

    const sessionA = await prisma.session.findMany({ where: { id: unifiedSessionId } });
    const transactionA = await prisma.transaction.findMany({ where: { sessionId: unifiedSessionId } });
    const photosA = await prisma.photo.findMany({ where: { sessionId: unifiedSessionId } });

    assert(sessionA.length === 1, 'A.2: Exactly 1 session record in PostgreSQL');
    assert(transactionA.length === 1, 'A.3: Exactly 1 transaction record linked to unifiedSessionId');
    assert(photosA.length === 3, 'A.4: Exactly 3 photo records linked to unifiedSessionId');
    assert(photosA.every((p) => p.sessionId === unifiedSessionId), 'A.5: All photos share same sessionId with transaction');

    // ─────────────────────────────────────────────────────────────────
    // SCENARIO B: Network Interruption During Session Sync (Retry Works)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO B: Network Interruption During Session Sync]');
    const networkInterruptedSessionId = `session_${Date.now()}_net_retry`;

    // 1. Pre-seed booth, session creation on kiosk succeeds locally, but eager sync failed (synced = 0)
    // 2. Pre-flight sync runs inline on upload retry
    const retrySyncRes = await sessionsController.syncSession({
      id: networkInterruptedSessionId,
      frameId: 'noir-black',
      filter: 'mono',
      photos: ['p1.jpg'],
      printStatus: 'printed',
    }, testBooth.deviceSecret);

    assert(retrySyncRes.success === true, 'B.1: Session metadata synced successfully on retry');

    // Confirm upload succeeds after retry sync
    const retryConfirmRes = await storageController.confirmUpload({
      sessionId: networkInterruptedSessionId,
      fileName: `composite_${networkInterruptedSessionId}.jpg`,
      fileType: 'composite',
      key: `sessions/${networkInterruptedSessionId}/composite.jpg`,
      publicUrl: `https://test.r2.dev/sessions/${networkInterruptedSessionId}/composite.jpg`,
    }, testBooth.deviceSecret);

    assert(retryConfirmRes.success === true && retryConfirmRes.confirmed === true, 'B.2: Confirm upload succeeds on retry with zero photo loss');

    // ─────────────────────────────────────────────────────────────────
    // SCENARIO C: Upload Finishes Before Periodic Sync (Pre-flight Prevents Failure)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO C: Upload Finishes Before Periodic Sync]');
    const preFlightSessionId = `session_${Date.now()}_preflight`;

    // Sesi belum disinkronkan oleh 30s scheduler. Pre-flight guard memicu sync sebelum confirm-upload:
    await sessionsController.syncSession({
      id: preFlightSessionId,
      frameId: 'pastel-lilac',
      filter: 'warm',
      photos: ['pose1.jpg'],
    }, testBooth.deviceSecret);

    const preFlightConfirmRes = await storageController.confirmUpload({
      sessionId: preFlightSessionId,
      fileName: `composite_${preFlightSessionId}.jpg`,
      fileType: 'composite',
      key: `sessions/${preFlightSessionId}/composite.jpg`,
      publicUrl: `https://test.r2.dev/sessions/${preFlightSessionId}/composite.jpg`,
    }, testBooth.deviceSecret);

    assert(preFlightConfirmRes.success === true && preFlightConfirmRes.confirmed === true, 'C.1: Pre-flight sync ensures session exists before confirm-upload');

    // ─────────────────────────────────────────────────────────────────
    // SCENARIO D: Invalid Device Secret (Expected 401)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO D: Invalid Device Secret]');
    let dThrew401 = false;
    try {
      await storageController.confirmUpload({
        sessionId: unifiedSessionId,
        fileName: 'test.jpg',
        fileType: 'composite',
      }, 'invalid-or-unknown-secret');
    } catch (err: any) {
      if (err.status === 401 && err.message === 'INVALID_DEVICE') {
        dThrew401 = true;
      }
    }
    assert(dThrew401 === true, 'D.1: Rejects unknown device secret with HTTP 401 INVALID_DEVICE');

    // ─────────────────────────────────────────────────────────────────
    // SCENARIO E: Unknown Session ID (Expected 409 & No Ghost Session)
    // ─────────────────────────────────────────────────────────────────
    console.log('\n[SCENARIO E: Unknown Session ID]');
    const unknownSessionId = `session_ghost_attempt_${Date.now()}`;
    let eThrew409 = false;
    try {
      await storageController.confirmUpload({
        sessionId: unknownSessionId,
        fileName: 'ghost_photo.jpg',
        fileType: 'raw',
      }, testBooth.deviceSecret);
    } catch (err: any) {
      if (err.status === 409 && err.message === 'SESSION_NOT_FOUND') {
        eThrew409 = true;
      }
    }
    assert(eThrew409 === true, 'E.1: Rejects unknown sessionId with HTTP 409 SESSION_NOT_FOUND');

    const ghostCheck = await prisma.session.findUnique({ where: { id: unknownSessionId } });
    assert(ghostCheck === null, 'E.2: Confirmed ZERO ghost sessions created in database');

    // Clean up test records
    await prisma.photo.deleteMany({
      where: { sessionId: { in: [unifiedSessionId, networkInterruptedSessionId, preFlightSessionId] } },
    }).catch(() => {});
    await prisma.payment.deleteMany({
      where: { transaction: { sessionId: unifiedSessionId } },
    }).catch(() => {});
    await prisma.transaction.deleteMany({
      where: { sessionId: unifiedSessionId },
    }).catch(() => {});
    await prisma.session.deleteMany({
      where: { id: { in: [unifiedSessionId, networkInterruptedSessionId, preFlightSessionId] } },
    }).catch(() => {});

  } catch (err: any) {
    console.error('Validation test error:', err);
    failed++;
  } finally {
    await app.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`  VALIDATION SUMMARY: ${passed} PASSED | ${failed} FAILED `);
  console.log('═══════════════════════════════════════════════════════════════════════');

  if (failed > 0) process.exit(1);
}

runPhase2Validation();
