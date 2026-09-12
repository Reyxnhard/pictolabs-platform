import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { GalleryController } from './gallery.controller';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as fs from 'fs';
import * as path from 'path';

async function runArch01Tests() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  TASK ARCH-01 VERIFICATION: CLOUDFLARE R2 SINGLE SOURCE OF TRUTH     ');
  console.log('═══════════════════════════════════════════════════════════════════════');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const galleryController = app.get(GalleryController);
  const storageService = app.get(StorageService);
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

  const testSessionId = `session_${Date.now()}_arch01_r2`;
  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads');

  try {
    // Ensure booth exists
    let booth = await prisma.booth.findFirst();
    if (!booth) {
      let company = await prisma.company.create({ data: { name: 'ARCH01 Corp' } });
      let branch = await prisma.branch.create({ data: { name: 'ARCH01 Branch', companyId: company.id } });
      booth = await prisma.booth.create({
        data: {
          name: 'ARCH01 Booth',
          deviceSecret: 'arch01-secret',
          branchId: branch.id,
          status: 'ONLINE',
        },
      });
    }

    // 1. Create session in database
    const session = await prisma.session.create({
      data: {
        id: testSessionId,
        boothId: booth.id,
        status: 'COMPLETED',
      },
    });

    // 2. Register photos in DB pointing to R2 keys
    const r2KeyComposite = `sessions/${testSessionId}/composite_${testSessionId}.jpg`;
    const r2KeyPhoto1 = `sessions/${testSessionId}/photo_${testSessionId}_pose_1.jpg`;
    const r2KeyPhoto2 = `sessions/${testSessionId}/photo_${testSessionId}_pose_2.jpg`;

    await prisma.photo.createMany({
      data: [
        {
          sessionId: testSessionId,
          sequenceNo: 1,
          storageKey: r2KeyComposite,
          finalUrl: storageService.getFileUrl(r2KeyComposite),
        },
        {
          sessionId: testSessionId,
          sequenceNo: 2,
          storageKey: r2KeyPhoto1,
          finalUrl: storageService.getFileUrl(r2KeyPhoto1),
        },
        {
          sessionId: testSessionId,
          sequenceNo: 3,
          storageKey: r2KeyPhoto2,
          finalUrl: storageService.getFileUrl(r2KeyPhoto2),
        },
      ],
    });

    // 3. Confirm NO files exist in local uploads directory for this session
    if (fs.existsSync(uploadDir)) {
      const localFiles = fs.readdirSync(uploadDir).filter((f) => f.includes(testSessionId));
      for (const f of localFiles) {
        fs.unlinkSync(path.join(uploadDir, f));
      }
    }

    console.log('\n[TEST 1: Asset Discovery without Local Filesystem]');
    const galleryData = (await galleryController.getGalleryData(testSessionId)) as any;
    assert(galleryData.success === true, 'T1.1: Gallery API returns success: true');
    assert(galleryData.expired === false, 'T1.2: Session is not expired');
    assert(galleryData.assets.photoStrip !== null, 'T1.3: Composite strip discovered from DB/R2 metadata');
    assert(Boolean(galleryData.assets.photoStrip?.url?.includes(r2KeyComposite)), 'T1.4: Composite URL matches R2 object path');
    assert(galleryData.assets.photos.length === 2, `T1.5: Discovered 2 raw pose photos (found: ${galleryData.assets.photos.length})`);
    assert(Boolean(galleryData.assets.photos[0]?.url?.includes(r2KeyPhoto1)), 'T1.6: Photo 1 URL matches R2 object path');
    assert(galleryData.assets.totalAssets === 3, `T1.7: Total assets is 3 (found: ${galleryData.assets.totalAssets})`);

    console.log('\n[TEST 2: HTML Gallery Page Rendering with R2 URLs]');
    let renderedHtml = '';
    const mockRes = {
      status(code: number) { return this; },
      type(ct: string) { return this; },
      send(body: string) { renderedHtml = body; return this; },
    } as any;

    await galleryController.renderGalleryPage(testSessionId, undefined, mockRes);
    assert(renderedHtml.includes('PICTOLABS'), 'T2.1: Renders Pictolabs brand header');
    assert(renderedHtml.includes(testSessionId), 'T2.2: Renders target session ID');
    assert(renderedHtml.includes(r2KeyComposite), 'T2.3: Renders composite image with R2 URL');
    assert(renderedHtml.includes(r2KeyPhoto1), 'T2.4: Renders pose photo with R2 URL');

    console.log('\n[TEST 3: ZIP Download Stream]');
    let zipStatus = 200;
    let headers: Record<string, string> = {};
    let zipChunks: Buffer[] = [];
    let zipCompleted = false;

    const mockZipRes = {
      status(code: number) { zipStatus = code; return this; },
      setHeader(k: string, v: string) { headers[k] = v; },
      write(chunk: any) {
        if (Buffer.isBuffer(chunk)) zipChunks.push(chunk);
        else zipChunks.push(Buffer.from(chunk));
        return true;
      },
      end(chunk?: any) {
        if (chunk) {
          if (Buffer.isBuffer(chunk)) zipChunks.push(chunk);
          else zipChunks.push(Buffer.from(chunk));
        }
        zipCompleted = true;
      },
      on(event: string, handler: Function) {
        return this;
      },
      once(event: string, handler: Function) {
        return this;
      },
      emit(event: string) {
        return true;
      },
    } as any;

    await galleryController.downloadSessionZip(testSessionId, undefined, mockZipRes);

    assert(zipStatus === 200, `T3.1: ZIP download responds with HTTP 200 (actual: ${zipStatus})`);
    assert(headers['Content-Type'] === 'application/zip', 'T3.2: Content-Type is application/zip');
    assert(headers['Content-Disposition']?.includes(testSessionId), 'T3.3: Content-Disposition sets filename');

    console.log('\n[TEST 4: Retention Extension Check (createdAt > 30d, but retentionExpiresAt active)]');
    const oldSessionId = `session_${Date.now()}_extended`;
    await prisma.session.create({
      data: {
        id: oldSessionId,
        boothId: booth.id,
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days ago
        retentionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Active for 7 more days
      },
    });

    const extendedData = await galleryController.getGalleryData(oldSessionId);
    assert(extendedData.expired === false, 'T4.1: Session with active retentionExpiresAt is marked expired: false');

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log(`  ARCH-01 TEST RESULTS: ${passed} PASSED | ${failed} FAILED `);
    console.log('═══════════════════════════════════════════════════════════════════════');

    // Cleanup
    await prisma.photo.deleteMany({ where: { sessionId: testSessionId } });
    await prisma.session.delete({ where: { id: testSessionId } });
    await prisma.session.delete({ where: { id: oldSessionId } });

    if (failed > 0) process.exit(1);
  } catch (err: any) {
    console.error('ARCH-01 test encountered error:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runArch01Tests();
