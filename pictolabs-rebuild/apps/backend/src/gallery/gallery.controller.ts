import { Controller, Get, Param, Query, Res, Logger } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const archiver = require('archiver');

interface SessionAssetPhoto {
  pose: number;
  filename: string;
  url: string;
  previewUrl: string;
  sizeFormatted: string;
  storageKey?: string;
}

interface SessionAssetVideo {
  pose: number;
  filename: string;
  url: string;
  sizeFormatted: string;
  storageKey?: string;
}

interface SessionAssetGif {
  filename: string;
  url: string;
  isMp4: boolean;
  sizeFormatted: string;
  storageKey?: string;
}

interface SessionAssetComposite {
  filename: string;
  url: string;
  sizeFormatted: string;
  storageKey?: string;
}

interface SessionAssets {
  sessionId: string;
  composite: SessionAssetComposite | null;
  photos: SessionAssetPhoto[];
  videos: SessionAssetVideo[];
  gif: SessionAssetGif | null;
  totalAssets: number;
}

import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller()
export class GalleryController {
  private readonly logger = new Logger(GalleryController.name);
  private readonly uploadDir = path.resolve(process.cwd(), 'public', 'uploads');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Format byte count into human-readable string (KB, MB).
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  /**
   * Look up public URL for a given filename or storage key.
   */
  private getFileUrl(filename: string, storageKey?: string): string {
    if (storageKey) {
      return this.storageService.getFileUrl(storageKey);
    }
    const r2Domain = process.env.R2_PUBLIC_DOMAIN;
    if (r2Domain) {
      const cleanDomain = r2Domain.replace(/\/+$/, '');
      const prefix = cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`;
      if (filename.startsWith('sessions/') || filename.startsWith('photos/')) {
        return `${prefix}/${filename}`;
      }
      return `${prefix}/photos/${filename}`;
    }
    return `/uploads/${filename}`;
  }

  /**
   * Comprehensive Cloud Asset Discovery:
   * 1. Reads registered Photo records from PostgreSQL database (Prisma).
   * 2. Queries Cloudflare R2 bucket objects under prefix `sessions/${sessionId}/`.
   * 3. Falls back to local directory `public/uploads` for local dev environments.
   * 4. Categorizes discovered assets into Composite, Photos, Live Videos, and GIF.
   */
  private async findSessionAssets(sessionId: string): Promise<SessionAssets> {
    interface DiscoveredAsset {
      filename: string;
      storageKey: string;
      url: string;
      sizeFormatted: string;
      sizeBytes?: number;
      sequenceNo?: number;
    }

    const discoveredMap = new Map<string, DiscoveredAsset>();

    // 1. Check PostgreSQL Database (Prisma)
    try {
      const dbPhotos = await this.prisma.photo.findMany({
        where: { sessionId },
        orderBy: { sequenceNo: 'asc' },
      });

      for (const p of dbPhotos) {
        const storageKey = p.storageKey || p.rawUrl || `sessions/${sessionId}/${p.id}.jpg`;
        const filename = path.basename(storageKey);
        const url = p.finalUrl || this.storageService.getFileUrl(storageKey);
        discoveredMap.set(filename, {
          filename,
          storageKey,
          url,
          sizeFormatted: 'HD',
          sequenceNo: p.sequenceNo,
        });
      }
    } catch (err: any) {
      this.logger.warn(`[GalleryController] DB photo lookup warning for ${sessionId}: ${err.message}`);
    }

    // 2. Query Cloudflare R2 Object Storage (Single Source of Truth)
    try {
      const r2Objects = await this.storageService.listSessionObjects(sessionId);
      for (const obj of r2Objects) {
        const filename = path.basename(obj.key);
        const url = this.storageService.getFileUrl(obj.key);
        const sizeFormatted = obj.size ? this.formatBytes(obj.size) : 'HD';

        const existing = discoveredMap.get(filename);
        if (existing) {
          existing.sizeFormatted = sizeFormatted;
          existing.sizeBytes = obj.size;
          existing.storageKey = obj.key;
          if (!existing.url.startsWith('http')) {
            existing.url = url;
          }
        } else {
          discoveredMap.set(filename, {
            filename,
            storageKey: obj.key,
            url,
            sizeFormatted,
            sizeBytes: obj.size,
          });
        }
      }
    } catch (err: any) {
      this.logger.warn(`[GalleryController] R2 object list warning for ${sessionId}: ${err.message}`);
    }

    // 3. Fallback: Local filesystem inspection (dev / offline mode)
    if (discoveredMap.size === 0 && fs.existsSync(this.uploadDir)) {
      try {
        const files = fs.readdirSync(this.uploadDir).filter((f) => f.includes(sessionId));
        for (const f of files) {
          const fullPath = path.join(this.uploadDir, f);
          const stat = fs.existsSync(fullPath) ? fs.statSync(fullPath) : null;
          const url = this.getFileUrl(f);
          discoveredMap.set(f, {
            filename: f,
            storageKey: f,
            url,
            sizeFormatted: stat ? this.formatBytes(stat.size) : 'HD',
            sizeBytes: stat?.size,
          });
        }
      } catch (_) {}
    }

    const allAssets = Array.from(discoveredMap.values());

    // 1. Composite Photostrip File
    let composite: SessionAssetComposite | null = null;
    const compositeAsset = allAssets.find(
      (a) =>
        (a.filename.startsWith('composite_') || a.filename.includes('photostrip') || a.filename.includes('strip')) &&
        (a.filename.endsWith('.jpg') || a.filename.endsWith('.jpeg') || a.filename.endsWith('.png'))
    );

    if (compositeAsset) {
      composite = {
        filename: compositeAsset.filename,
        url: compositeAsset.url,
        sizeFormatted: compositeAsset.sizeFormatted,
        storageKey: compositeAsset.storageKey,
      };
    }

    // 2. Individual Pose Photos (excluding thumb_ and composite_)
    const photoCandidates = allAssets.filter(
      (a) =>
        !a.filename.startsWith('thumb_') &&
        !a.filename.startsWith('composite_') &&
        !a.filename.includes('photostrip') &&
        (a.filename.startsWith('photo_') || a.filename.includes('_pose_') || a.filename.includes('pose')) &&
        (a.filename.endsWith('.jpg') || a.filename.endsWith('.jpeg') || a.filename.endsWith('.png'))
    );

    const photos: SessionAssetPhoto[] = photoCandidates
      .map((a, idx) => {
        const poseMatch = a.filename.match(/pose_(\d+)/i) || a.filename.match(/photo[-_](\d+)/i);
        const pose = poseMatch ? parseInt(poseMatch[1], 10) : (a.sequenceNo || idx + 1);

        // Check if thumbnail exists in discovered assets
        const thumbAsset = allAssets.find((t) => t.filename === `thumb_${a.filename}`);
        const previewUrl = thumbAsset ? thumbAsset.url : a.url;

        return {
          pose,
          filename: a.filename,
          url: a.url,
          previewUrl,
          sizeFormatted: a.sizeFormatted,
          storageKey: a.storageKey,
        };
      })
      .sort((a, b) => a.pose - b.pose);

    // 3. Separate Live Photo Videos per pose (prefer .mp4 over .webm)
    const videoCandidates = allAssets.filter(
      (a) =>
        !a.filename.startsWith('gif_') &&
        !a.filename.includes('boomerang') &&
        (a.filename.startsWith('livephoto_') || a.filename.includes('live_') || a.filename.includes('_pose_')) &&
        (a.filename.endsWith('.mp4') || a.filename.endsWith('.webm'))
    );

    const videoMap = new Map<string, DiscoveredAsset>();
    for (const v of videoCandidates) {
      const base = v.filename.replace(/\.(mp4|webm)$/, '');
      if (v.filename.endsWith('.mp4') || !videoMap.has(base)) {
        videoMap.set(base, v);
      }
    }

    const videos: SessionAssetVideo[] = Array.from(videoMap.values())
      .map((v, idx) => {
        const poseMatch = v.filename.match(/pose_(\d+)/i) || v.filename.match(/video[-_](\d+)/i);
        const pose = poseMatch ? parseInt(poseMatch[1], 10) : idx + 1;
        return {
          pose,
          filename: v.filename,
          url: v.url,
          sizeFormatted: v.sizeFormatted,
          storageKey: v.storageKey,
        };
      })
      .sort((a, b) => a.pose - b.pose);

    // 4. Looping GIF / Motion Video
    let gif: SessionAssetGif | null = null;
    const gifAsset = allAssets.find(
      (a) =>
        (a.filename.startsWith('gif_') || a.filename.includes('boomerang')) &&
        (a.filename.endsWith('.mp4') || a.filename.endsWith('.gif'))
    );

    if (gifAsset) {
      gif = {
        filename: gifAsset.filename,
        url: gifAsset.url,
        isMp4: gifAsset.filename.endsWith('.mp4'),
        sizeFormatted: gifAsset.sizeFormatted,
        storageKey: gifAsset.storageKey,
      };
    }

    const totalAssets =
      (composite ? 1 : 0) + photos.length + videos.length + (gif ? 1 : 0);

    return {
      sessionId,
      composite,
      photos,
      videos,
      gif,
      totalAssets,
    };
  }

  /**
   * Determine whether a session is expired (>30 days or purged) per Cloud Asset Retention Policy.
   */
  private async isSessionExpired(sessionId: string, explicitQuery?: string): Promise<{ expired: boolean; reason: string }> {
    if (explicitQuery === 'true' || explicitQuery === '1') {
      return { expired: true, reason: 'explicit_retention_check' };
    }

    // 1. Check in Prisma DB if available
    if (this.prisma) {
      try {
        const session = await this.prisma.session.findUnique({
          where: { id: sessionId },
        });
        if (session) {
          if (session.status === 'PURGED') {
            return { expired: true, reason: 'session_purged_by_lifecycle' };
          }
          if (session.retentionExpiresAt) {
            if (new Date() < session.retentionExpiresAt) {
              return { expired: false, reason: 'extended_retention_active' };
            } else {
              return { expired: true, reason: 'extended_retention_expired' };
            }
          }
          const ageDays = (Date.now() - session.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays >= 30) {
            return { expired: true, reason: `session_age_${Math.floor(ageDays)}_days` };
          }
        }
      } catch (_) {}
    }

    // 2. Check timestamp encoded in sessionId: session_<epochMs>_<rand>
    const match = sessionId.match(/^session_(\d{10,13})_/);
    if (match) {
      const epoch = parseInt(match[1], 10);
      const ageDays = (Date.now() - epoch) / (1000 * 60 * 60 * 24);
      if (ageDays >= 30) {
        return { expired: true, reason: `session_age_${Math.floor(ageDays)}_days` };
      }
    }

    return { expired: false, reason: 'active' };
  }

  /**
   * Render Graceful Expiration Page (HTTP 200).
   * In accordance with AC-5.4: Expired gallery links remain valid URLs but show an expiration page.
   */
  private renderExpiredHtml(sessionId: string): string {
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>PICTOLABS — Masa Aktif Galeri Telah Berakhir (${sessionId})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #6366f1;
      --amber: #f59e0b;
      --bg-dark: #070b14;
      --card-bg: rgba(18, 25, 44, 0.78);
      --border-subtle: rgba(255, 255, 255, 0.12);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0d1326 50%, #050811 100%);
      color: #f8fafc;
      min-height: 100vh;
      padding: 30px 16px 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow-x: hidden;
    }
    .container {
      width: 100%;
      max-width: 460px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      text-align: center;
    }
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-weight: 900;
      font-size: 28px;
      letter-spacing: 3px;
      background: linear-gradient(135deg, #a5b4fc 0%, #ffffff 50%, #f472b6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 2px;
    }
    .brand-subtitle {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 24px;
      padding: 36px 24px;
      box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(16px);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .icon-badge {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f59e0b;
      box-shadow: 0 0 28px rgba(245, 158, 11, 0.25);
    }
    .title {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 21px;
      color: #f8fafc;
      line-height: 1.3;
    }
    .badge-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border-subtle);
      border-radius: 9999px;
      padding: 5px 14px;
      font-size: 11px;
      font-weight: 700;
      color: #cbd5e1;
    }
    .badge-amber {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.4);
      color: #fde68a;
    }
    .desc {
      font-size: 13.5px;
      line-height: 1.65;
      color: #94a3b8;
    }
    .desc strong {
      color: #f1f5f9;
    }
    .policy-box {
      width: 100%;
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 16px;
      padding: 16px;
      font-size: 12px;
      color: #94a3b8;
      text-align: left;
      line-height: 1.65;
    }
    .policy-box strong {
      color: #e2e8f0;
    }
    .footer {
      font-size: 11px;
      color: #64748b;
      margin-top: 6px;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="brand-title">PICTOLABS</h1>
      <p class="brand-subtitle">Cloud Media Delivery & Privacy</p>
    </div>
    <div class="card">
      <div class="icon-badge">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <h2 class="title">Masa Aktif Galeri Telah Berakhir</h2>
      <div class="badge-bar">
        <div class="badge">
          <span>SESI: ${sessionId}</span>
        </div>
        <div class="badge badge-amber">
          <span>RETENSI: 30 HARI</span>
        </div>
      </div>
      <p class="desc">
        Sesuai kebijakan privasi data Pictolabs, berkas softfile foto dan Live Photo digital disimpan selama <strong>30 hari</strong> sejak sesi pemotretan dan kini telah <strong>otomatis dihapus secara permanen</strong> dari Cloudflare R2 Storage demi melindungi privasi Anda.
      </p>
      <div class="policy-box">
        <p style="margin-bottom: 4px;">🔒 <strong>Pictolabs Cloud Asset Retention Policy:</strong></p>
        <p>• Masa simpan berkas digital di cloud storage: <strong>30 Hari</strong>.</p>
        <p>• Berkas dihapus otomatis untuk kepatuhan privasi (*GDPR/PDP compliance*).</p>
        <p style="margin-top: 6px; font-size: 11px; color: #64748b;">ID Sesi: ${sessionId} • Status: DIHAPUS (PURGED)</p>
      </div>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} PICTOLABS PHOTOBOOTH • ALL RIGHTS RESERVED</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * JSON metadata API for kiosk, mobile app, or client query.
   */
  @Get('api/gallery/:sessionId')
  async getGalleryData(
    @Param('sessionId') sessionId: string,
    @Query('expired') expiredQuery?: string
  ) {
    const expiration = await this.isSessionExpired(sessionId, expiredQuery);
    if (expiration.expired) {
      return {
        success: true,
        sessionId,
        expired: true,
        message: 'Cloud assets older than 30 days have been automatically purged.',
        reason: expiration.reason,
      };
    }

    let session: any = null;
    try {
      session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        include: {
          booth: {
            include: { branch: true },
          },
        },
      });
    } catch (_) {}

    const assets = await this.findSessionAssets(sessionId);

    return {
      success: true,
      expired: false,
      sessionId,
      status: session?.status || 'COMPLETED',
      createdAt: session?.createdAt ? session.createdAt.toISOString() : null,
      customerDownloadUrl: `https://pictolabs.id/d/${sessionId}`,
      booth: session?.booth
        ? {
            id: session.booth.id,
            name: session.booth.name,
            branchName: session.booth.branch?.name || null,
          }
        : null,
      assets: {
        photoStrip: assets.composite,
        photos: assets.photos,
        livePhotos: assets.videos,
        gif: assets.gif,
        totalAssets: assets.totalAssets,
      },
      // Backward-compatibility fields
      composite: assets.composite,
      photos: assets.photos,
      videos: assets.videos,
      gif: assets.gif,
      totalAssets: assets.totalAssets,
    };
  }

  /**
   * One-Tap "Download All" ZIP Archive Stream.
   * Compiles Composite Photostrip, individual photos, live videos, and GIF into a single ZIP.
   * Streams binary files directly from Cloudflare R2 object storage.
   */
  @Get('api/gallery/:sessionId/zip')
  async downloadSessionZip(
    @Param('sessionId') sessionId: string,
    @Query('expired') expiredQuery: string | undefined,
    @Res() res: Response
  ) {
    this.logger.log(`[GalleryController] Customer requested ZIP download for session: ${sessionId}`);

    const expiration = await this.isSessionExpired(sessionId, expiredQuery);
    if (expiration.expired) {
      return res.status(410).json({
        success: false,
        expired: true,
        message: 'File softfile sesi ini telah kedaluwarsa sesuai kebijakan retensi 30 hari.',
      });
    }

    const assets = await this.findSessionAssets(sessionId);

    if (assets.totalAssets === 0) {
      return res.status(404).send('Tidak ada file softfile yang ditemukan untuk sesi ini.');
    }

    // Use zlib level 1 (fastest) to stream already-compressed JPEG/MP4 assets with near-zero CPU latency
    const archive = new archiver.ZipArchive({ zlib: { level: 1 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="pictolabs_${sessionId}.zip"`
    );

    archive.on('error', (err: any) => {
      this.logger.error(`[GalleryController] ZIP archive error: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).send('Gagal membuat file ZIP.');
      }
    });

    archive.pipe(res);

    // 1. Composite Photostrip (Stream from Cloudflare R2 / Fallback)
    if (assets.composite) {
      const key = assets.composite.storageKey || `sessions/${sessionId}/${assets.composite.filename}`;
      const stream = await this.storageService.getObjectStream(key);
      if (stream) {
        archive.append(stream, { name: `01_photostrip_${sessionId}.jpg` });
      }
    }

    // 2. Raw Pose Photos (Stream from Cloudflare R2 / Fallback)
    for (const p of assets.photos) {
      const key = p.storageKey || `sessions/${sessionId}/${p.filename}`;
      const stream = await this.storageService.getObjectStream(key);
      if (stream) {
        archive.append(stream, { name: `02_photo_pose_${p.pose}.jpg` });
      }
    }

    // 3. Live Photo Videos (Stream from Cloudflare R2 / Fallback)
    for (const v of assets.videos) {
      const key = v.storageKey || `sessions/${sessionId}/${v.filename}`;
      const stream = await this.storageService.getObjectStream(key);
      if (stream) {
        archive.append(stream, { name: `03_livephoto_pose_${v.pose}.mp4` });
      }
    }

    // 4. Boomerang GIF / Loop (Stream from Cloudflare R2 / Fallback)
    if (assets.gif) {
      const key = assets.gif.storageKey || `sessions/${sessionId}/${assets.gif.filename}`;
      const stream = await this.storageService.getObjectStream(key);
      if (stream) {
        const ext = path.extname(assets.gif.filename) || (assets.gif.isMp4 ? '.mp4' : '.gif');
        archive.append(stream, { name: `04_boomerang_${sessionId}${ext}` });
      }
    }

    await archive.finalize();
  }

  /**
   * Customer Mobile Landing Page for QR Code Scan.
   * Displays full session digital softfile:
   * - Composite Frame Photostrip
   * - Individual Pose Photos (with instant-load web thumbnails & original HD download)
   * - Individual Live Photo Videos (with smooth viewport autoplay & 1s keyframes)
   * - Animated Boomerang GIF / MP4
   * - One-Tap "Download Semua (.ZIP)"
   * - Graceful Expiration Notice (HTTP 200) when session >= 30 days
   */
  @Get('d/:sessionId')
  async renderGalleryPage(
    @Param('sessionId') sessionId: string,
    @Query('expired') expiredQuery: string | undefined,
    @Res() res: Response
  ) {
    this.logger.log(`[GalleryController] Customer scanned QR for session: ${sessionId}`);

    // Check 30-day retention expiration
    const expiration = await this.isSessionExpired(sessionId, expiredQuery);
    if (expiration.expired) {
      this.logger.log(`[GalleryController] Session ${sessionId} is expired (${expiration.reason}). Serving graceful expiration page.`);
      return res.status(200).type('html').send(this.renderExpiredHtml(sessionId));
    }

    const assets = await this.findSessionAssets(sessionId);
    const hasAny = assets.totalAssets > 0;

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>PICTOLABS — Digital Softfile & Live Photos (${sessionId})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --rose: #f43f5e;
      --emerald: #10b981;
      --amber: #f59e0b;
      --bg-dark: #070b14;
      --card-bg: rgba(18, 25, 44, 0.75);
      --border-subtle: rgba(255, 255, 255, 0.12);
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0d1326 50%, #050811 100%);
      color: #f8fafc;
      min-height: 100vh;
      padding: 20px 14px 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow-x: hidden;
    }
    .container {
      width: 100%;
      max-width: 480px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    /* Header */
    .header {
      text-align: center;
      padding: 10px 4px 6px;
    }
    .brand-title {
      font-family: 'Outfit', sans-serif;
      font-size: 30px;
      font-weight: 900;
      letter-spacing: -0.5px;
      background: linear-gradient(135deg, #a855f7 0%, #6366f1 40%, #38bdf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 3px;
    }
    .brand-subtitle {
      font-size: 11px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .badge-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .session-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--border-subtle);
      border-radius: 9999px;
      padding: 5px 14px;
      font-size: 11px;
      font-weight: 700;
      color: #cbd5e1;
    }
    .session-badge span.dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
    }
    /* Download All ZIP CTA */
    .cta-zip-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 15px 20px;
      border-radius: 18px;
      font-family: 'Outfit', sans-serif;
      font-weight: 900;
      font-size: 15px;
      color: #ffffff;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%);
      box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.5);
      border: none;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .cta-zip-btn:active {
      transform: scale(0.98);
      filter: brightness(0.92);
    }
    /* Interactive Filter Tabs */
    .tab-bar {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding: 4px 2px 8px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .tab-bar::-webkit-scrollbar {
      display: none;
    }
    .tab-pill {
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9999px;
      padding: 8px 14px;
      font-family: 'Outfit', sans-serif;
      font-size: 12px;
      font-weight: 800;
      color: #cbd5e1;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tab-pill.active {
      background: #ffffff;
      color: #0f172a;
      border-color: #ffffff;
      box-shadow: 0 4px 12px rgba(255, 255, 255, 0.2);
    }
    .tab-pill .count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 1px 6px;
      border-radius: 9999px;
      font-size: 10px;
      font-weight: 900;
      background: rgba(0, 0, 0, 0.2);
      color: inherit;
    }
    .tab-pill.active .count {
      background: rgba(15, 23, 42, 0.15);
      color: #0f172a;
    }
    /* Content Cards */
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--border-subtle);
      border-radius: 24px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-shadow: 0 20px 30px -10px rgba(0, 0, 0, 0.6);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .card-title {
      font-family: 'Outfit', sans-serif;
      font-size: 17px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #f1f5f9;
    }
    .tag {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .tag-blue {
      background: rgba(59, 130, 246, 0.2);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.35);
    }
    .tag-emerald {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .tag-rose {
      background: rgba(244, 63, 94, 0.2);
      color: #fb7185;
      border: 1px solid rgba(244, 63, 94, 0.35);
    }
    .tag-amber {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    /* Media Viewport */
    .media-wrapper {
      position: relative;
      width: 100%;
      background: #020617;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 220px;
    }
    .media-img {
      width: 100%;
      height: auto;
      max-height: 520px;
      object-fit: contain;
      display: block;
      border-radius: 14px;
    }
    .media-video {
      width: 100%;
      height: auto;
      max-height: 420px;
      display: block;
      background: #000;
      border-radius: 14px;
    }
    /* Video Playback Controls Badge */
    .video-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 10;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 800;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .video-badge .live-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #f43f5e;
      box-shadow: 0 0 6px #f43f5e;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }
    /* Action Buttons */
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 13px 18px;
      border-radius: 14px;
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 14px;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
      border: none;
    }
    .btn-blue {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: #ffffff;
      box-shadow: 0 6px 16px -3px rgba(37, 99, 235, 0.4);
    }
    .btn-emerald {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      box-shadow: 0 6px 16px -3px rgba(16, 185, 129, 0.4);
    }
    .btn-rose {
      background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
      color: #ffffff;
      box-shadow: 0 6px 16px -3px rgba(225, 29, 72, 0.4);
    }
    .btn-amber {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #ffffff;
      box-shadow: 0 6px 16px -3px rgba(217, 119, 6, 0.4);
    }
    .btn:active {
      transform: scale(0.98);
      filter: brightness(0.92);
    }
    /* Grid for multiple photos */
    .photo-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    /* Section dividers */
    .section-title {
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      font-weight: 800;
      color: #94a3b8;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin: 10px 0 2px 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    /* Instructions */
    .instructions {
      background: rgba(15, 23, 42, 0.65);
      border: 1px solid var(--border-subtle);
      border-radius: 18px;
      padding: 16px;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .instructions strong {
      color: #f1f5f9;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      color: #64748b;
      margin-top: 8px;
      letter-spacing: 0.5px;
    }
    /* Hidden utility */
    .hidden {
      display: none !important;
    }
    .pending-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      text-align: center;
      gap: 12px;
      color: #94a3b8;
    }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.15);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1 class="brand-title">PICTOLABS</h1>
      <p class="brand-subtitle">Digital Softfile & Live Photos</p>
      <div class="badge-bar">
        <div class="session-badge">
          <span class="dot"></span>
          <span>SESI: ${sessionId}</span>
        </div>
        <div class="session-badge">
          <span>${assets.totalAssets} FILE TERSEDIA</span>
        </div>
      </div>
    </div>

    <!-- 1-Tap Download All (.ZIP) -->
    ${
      hasAny
        ? `<a href="/api/gallery/${sessionId}/zip" class="cta-zip-btn" id="btn-download-all">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download Semua Softfile (.ZIP)</span>
          </a>`
        : ''
    }

    <!-- Filter Segmented Tabs -->
    <div class="tab-bar">
      <button class="tab-pill active" onclick="filterTab('all', this)">
        <span>🌟 Semua</span>
        <span class="count">${assets.totalAssets}</span>
      </button>
      ${
        assets.composite
          ? `<button class="tab-pill" onclick="filterTab('strip', this)">
              <span>📸 Desain Strip</span>
              <span class="count">1</span>
            </button>`
          : ''
      }
      ${
        assets.photos.length > 0
          ? `<button class="tab-pill" onclick="filterTab('photos', this)">
              <span>🖼️ Foto Asli</span>
              <span class="count">${assets.photos.length}</span>
            </button>`
          : ''
      }
      ${
        assets.videos.length > 0
          ? `<button class="tab-pill" onclick="filterTab('videos', this)">
              <span>🎬 Live Photo</span>
              <span class="count">${assets.videos.length}</span>
            </button>`
          : ''
      }
      ${
        assets.gif
          ? `<button class="tab-pill" onclick="filterTab('gif', this)">
              <span>✨ GIF Loop</span>
              <span class="count">1</span>
            </button>`
          : ''
      }
    </div>

    <!-- 1. Desain Photostrip 2R (Frame + Photos) -->
    ${
      assets.composite
        ? `
      <div class="card asset-item" data-category="strip">
        <div class="card-header">
          <h2 class="card-title">📸 Desain Photostrip</h2>
          <span class="tag tag-blue">300 DPI CETAK</span>
        </div>
        <div class="media-wrapper">
          <img 
            src="${assets.composite.url}" 
            class="media-img" 
            alt="Photostrip Pictolabs" 
            loading="eager" 
            decoding="async" 
          />
        </div>
        <a href="${assets.composite.url}" download="pictolabs_strip_${sessionId}.jpg" class="btn btn-blue">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download Desain Strip (${assets.composite.sizeFormatted})</span>
        </a>
      </div>
      `
        : ''
    }

    <!-- 2. Foto Asli Tiap Pose (Original DSLR JPEGs) -->
    ${
      assets.photos.length > 0
        ? `
      <div class="section-title asset-item" data-category="photos">
        <span>🖼️ FOTO ASLI TIAP POSE (${assets.photos.length} FOTO)</span>
      </div>
      <div class="photo-grid">
        ${assets.photos
          .map(
            (p) => `
          <div class="card asset-item" data-category="photos">
            <div class="card-header">
              <h2 class="card-title">Pose ${p.pose}</h2>
              <span class="tag tag-emerald">ORIGINAL HD • ${p.sizeFormatted}</span>
            </div>
            <div class="media-wrapper">
              <img 
                src="${p.previewUrl}" 
                class="media-img" 
                alt="Foto Pose ${p.pose}" 
                loading="lazy" 
                decoding="async" 
              />
            </div>
            <a href="${p.url}" download="pictolabs_photo_${sessionId}_pose_${p.pose}.jpg" class="btn btn-emerald">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download Foto Pose ${p.pose} (${p.sizeFormatted})</span>
            </a>
          </div>
        `
          )
          .join('')}
      </div>
      `
        : ''
    }

    <!-- 3. Live Photo Tiap Pose (Individual Countdown Videos) -->
    ${
      assets.videos.length > 0
        ? `
      <div class="section-title asset-item" data-category="videos">
        <span>🎬 LIVE PHOTO TIAP POSE (${assets.videos.length} VIDEO)</span>
      </div>
      <div class="photo-grid">
        ${assets.videos
          .map(
            (v) => `
          <div class="card asset-item" data-category="videos">
            <div class="card-header">
              <h2 class="card-title">Live Photo Pose ${v.pose}</h2>
              <span class="tag tag-rose">MOTION 30 FPS • ${v.sizeFormatted}</span>
            </div>
            <div class="media-wrapper">
              <div class="video-badge">
                <span class="live-dot"></span>
                <span>LIVE POSE ${v.pose}</span>
              </div>
              <video 
                src="${v.url}" 
                class="media-video smart-video" 
                preload="metadata" 
                playsinline 
                muted 
                loop 
                controls
              ></video>
            </div>
            <a href="${v.url}" download="pictolabs_live_${sessionId}_pose_${v.pose}.mp4" class="btn btn-rose">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download Live Video Pose ${v.pose}</span>
            </a>
          </div>
        `
          )
          .join('')}
      </div>
      `
        : ''
    }

    <!-- 4. Boomerang GIF / Loop Motion -->
    ${
      assets.gif
        ? `
      <div class="card asset-item" data-category="gif">
        <div class="card-header">
          <h2 class="card-title">✨ Boomerang GIF Loop</h2>
          <span class="tag tag-amber">LOOPING MOTION</span>
        </div>
        <div class="media-wrapper">
          ${
            assets.gif.isMp4
              ? `<video 
                   src="${assets.gif.url}" 
                   class="media-video smart-video" 
                   autoplay 
                   loop 
                   muted 
                   playsinline 
                   controls
                 ></video>`
              : `<img 
                   src="${assets.gif.url}" 
                   class="media-img" 
                   alt="Boomerang GIF" 
                   loading="lazy" 
                 />`
          }
        </div>
        <a href="${assets.gif.url}" download="pictolabs_boomerang_${sessionId}.${assets.gif.isMp4 ? 'mp4' : 'gif'}" class="btn btn-amber">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>Download Boomerang Loop</span>
        </a>
      </div>
      `
        : ''
    }

    <!-- If assets are still uploading -->
    ${
      !hasAny
        ? `
      <div class="card">
        <div class="pending-box">
          <div class="spinner"></div>
          <p style="font-size: 14px; font-weight: 700; color: #f8fafc;">Menyiapkan file softfile fotomu...</p>
          <p style="font-size: 12px; color: #94a3b8;">Halaman akan otomatis diperbarui begitu foto selesai diunggah.</p>
        </div>
      </div>
      <script>
        setTimeout(function() { window.location.reload(); }, 2500);
      </script>
      `
        : ''
    }

    <!-- Instructions Guide -->
    <div class="instructions">
      <p style="margin-bottom: 6px;">💡 <strong>Panduan Simpan ke Galeri Smartphone:</strong></p>
      <p>• <strong>iPhone (Safari):</strong> Klik tombol Download, atau tekan lama pada foto/video $\\rightarrow$ pilih <em>"Simpan ke Foto"</em> (Save to Photos).</p>
      <p style="margin-top: 4px;">• <strong>Android (Chrome):</strong> Klik tombol Download, file otomatis tersimpan di folder Unduhan / Galeri.</p>
    </div>

    <div class="footer">
      <p>© ${new Date().getFullYear()} PICTOLABS PHOTOBOOTH • ALL RIGHTS RESERVED</p>
    </div>
  </div>

  <!-- Smart Viewport Video Player & Category Filter Script -->
  <script>
    // 1. Tab filtering logic
    function filterTab(category, btn) {
      document.querySelectorAll('.tab-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      const items = document.querySelectorAll('.asset-item');
      items.forEach(item => {
        if (category === 'all' || item.dataset.category === category) {
          item.classList.remove('hidden');
        } else {
          item.classList.add('hidden');
        }
      });
    }

    // 2. High-Performance IntersectionObserver for mobile video playback:
    // Only plays videos that are currently visible on screen; pauses out-of-view videos.
    // Prevents mobile GPU decoder starvation and eliminates lag/loop issues completely!
    document.addEventListener('DOMContentLoaded', () => {
      const videos = document.querySelectorAll('video.smart-video');
      if ('IntersectionObserver' in window) {
        const videoObserver = new IntersectionObserver((entries) => {
          entries.forEach(entry => {
            const video = entry.target;
            if (entry.isIntersecting) {
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise.catch(() => {});
              }
            } else {
              video.pause();
            }
          });
        }, { threshold: 0.35 });

        videos.forEach(v => videoObserver.observe(v));
      }
    });
  </script>
</body>
</html>`;

    res.type('html').send(html);
  }
}
