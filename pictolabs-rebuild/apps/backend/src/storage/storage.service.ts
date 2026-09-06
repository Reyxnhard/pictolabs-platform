import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageUploadResult {
  filename: string;
  url: string;
  publicUrl: string;
  provider: 'cloudflare_r2' | 'local_fallback';
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
  private s3Client: any = null;
  private readonly r2Bucket = process.env.R2_BUCKET_NAME || '';
  private readonly r2PublicDomain = process.env.R2_PUBLIC_DOMAIN || '';

  constructor() {
    this.initStorage();
  }

  private initStorage() {
    // Ensure local upload folder exists as fallback
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created local upload storage directory at: ${this.uploadDir}`);
    }

    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (accountId && accessKeyId && secretAccessKey && this.r2Bucket) {
      try {
        // Dynamically require to ensure compatibility even before or after install
        const { S3Client } = require('@aws-sdk/client-s3');
        this.s3Client = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
        this.logger.log(`[StorageService] Cloudflare R2 client initialized for bucket: ${this.r2Bucket}`);
      } catch (err: any) {
        this.logger.warn(`[StorageService] Failed to load AWS S3 SDK for R2: ${err.message}. Using local storage.`);
      }
    } else {
      this.logger.log('[StorageService] Cloudflare R2 credentials not fully set. Using high-speed local filesystem fallback.');
    }
  }

  /**
   * Save uploaded photo composite or raw image buffer.
   */
  async saveFile(
    filename: string,
    buffer: Buffer,
    mimeType: string = 'image/jpeg'
  ): Promise<StorageUploadResult> {
    // 1. Always persist a local copy for zero-latency on-premise access & recovery
    const localFilePath = path.join(this.uploadDir, filename);
    fs.writeFileSync(localFilePath, buffer);
    const localUrl = `/uploads/${filename}`;

    // 2. If Cloudflare R2 is configured, upload to R2 bucket
    if (this.s3Client && this.r2Bucket) {
      try {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        const uploadCmd = new PutObjectCommand({
          Bucket: this.r2Bucket,
          Key: `photos/${filename}`,
          Body: buffer,
          ContentType: mimeType,
          CacheControl: 'public, max-age=31536000',
        });

        await this.s3Client.send(uploadCmd);
        const publicR2Url = this.r2PublicDomain
          ? `${this.r2PublicDomain.replace(/\/$/, '')}/photos/${filename}`
          : localUrl;

        this.logger.log(`[StorageService] Uploaded to Cloudflare R2: ${publicR2Url}`);
        return {
          filename,
          url: localUrl,
          publicUrl: publicR2Url,
          provider: 'cloudflare_r2',
        };
      } catch (err: any) {
        this.logger.error(`[StorageService] Cloudflare R2 upload error: ${err.message}. Falling back to local storage.`);
      }
    }

    return {
      filename,
      url: localUrl,
      publicUrl: localUrl,
      provider: 'local_fallback',
    };
  }

  getHealthStatus() {
    return {
      provider: this.s3Client ? 'cloudflare_r2' : 'local_fallback',
      bucket: this.r2Bucket || null,
      publicDomain: this.r2PublicDomain || null,
      localDir: this.uploadDir,
      healthy: true,
    };
  }
}
