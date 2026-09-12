import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StorageController } from './storage.controller';
import { PrismaService } from '../prisma/prisma.service';

async function runConfirmUploadE2ETests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  CONFIRM UPLOAD JIT & ZERO DATA-LOSS VERIFICATION TEST SUITE          ');
  console.log('═══════════════════════════════════════════════════════════════════════');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const storageController = app.get(StorageController);
  const prisma = app.get(PrismaService);

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

  const timestamp = Date.now();
  const existingSessionId = `session_exist_${timestamp}`;
  const unprovisionedSessionId = `session_unprov_${timestamp}`;

  try {
    // 1. Setup booth for test
    let booth = await prisma.booth.findFirst();
    if (!booth) {
      const company = await prisma.company.create({ data: { name: 'Test Co' } });
      const branch = await prisma.branch.create({ data: { name: 'Test Branch', companyId: company.id } });
      booth = await prisma.booth.create({
        data: {
          name: 'Test Booth',
          deviceSecret: 'test-secret-01',
          branchId: branch.id,
          status: 'ONLINE',
        },
      });
    }

    // 2. Pre-create existing session
    await prisma.session.create({
      data: {
        id: existingSessionId,
        boothId: booth.id,
        status: 'PENDING_PAYMENT',
      },
    });

    console.log('\n[TEST CASE 1: Confirm Upload for Pre-existing Session with Valid Device]');
    const res1 = await storageController.confirmUpload({
      sessionId: existingSessionId,
      fileName: `composite_${existingSessionId}.jpg`,
      fileType: 'composite',
      key: `sessions/${existingSessionId}/composite_${existingSessionId}.jpg`,
      publicUrl: `https://test.r2.dev/sessions/${existingSessionId}/composite_${existingSessionId}.jpg`,
    }, booth.deviceSecret);

    assert(res1.success === true, 'Response reports success: true');
    assert(res1.confirmed === true, 'Response reports confirmed: true');

    const checkSession1 = await prisma.session.findUnique({ where: { id: existingSessionId } });
    assert(checkSession1?.status === 'COMPLETED', 'Session status updated to COMPLETED');

    const checkPhoto1 = await prisma.photo.findFirst({ where: { sessionId: existingSessionId } });
    assert(checkPhoto1 !== null, 'Photo record created in PostgreSQL');
    assert(checkPhoto1?.storageKey === `sessions/${existingSessionId}/composite_${existingSessionId}.jpg`, 'Photo storageKey correctly preserved');

    console.log('\n[TEST CASE 2: Strict Rejection for Unprovisioned Session (SESSION_NOT_FOUND)]');
    let sessionNotFoundThrown = false;
    try {
      await storageController.confirmUpload({
        sessionId: unprovisionedSessionId,
        fileName: `photo_${unprovisionedSessionId}_pose_1.jpg`,
        fileType: 'raw',
        key: `sessions/${unprovisionedSessionId}/photo_${unprovisionedSessionId}_pose_1.jpg`,
        publicUrl: `https://test.r2.dev/sessions/${unprovisionedSessionId}/photo_${unprovisionedSessionId}_pose_1.jpg`,
      }, booth.deviceSecret);
    } catch (e: any) {
      if (e.message === 'SESSION_NOT_FOUND' && e.status === 409) {
        sessionNotFoundThrown = true;
      }
    }
    assert(sessionNotFoundThrown === true, 'Throws SESSION_NOT_FOUND (409 Conflict) for unprovisioned session');

    console.log('\n[TEST CASE 3: Strict Rejection for Invalid Device Secret]');
    let invalidDeviceThrown = false;
    try {
      await storageController.confirmUpload({
        sessionId: existingSessionId,
        fileName: `photo_${existingSessionId}_pose_2.jpg`,
        fileType: 'raw',
      }, 'wrong-device-secret');
    } catch (e: any) {
      if (e.message === 'INVALID_DEVICE' && e.status === 401) {
        invalidDeviceThrown = true;
      }
    }
    assert(invalidDeviceThrown === true, 'Throws INVALID_DEVICE (401 Unauthorized) for unknown device secret');

    // Cleanup
    await prisma.photo.deleteMany({ where: { sessionId: existingSessionId } });
    await prisma.session.deleteMany({ where: { id: existingSessionId } });

  } catch (err: any) {
    console.error('Test error:', err);
    failed++;
  } finally {
    await app.close();
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log(`  RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runConfirmUploadE2ETests();
