import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageUploadResult {
  filename: string;
  url: string;
  publicUrl: string;
  provider: 'cloudflare_r2' | 'local_fallback';
}

export interface PresignedUrlResult {
  uploadUrl: string;
  key: string;
  publicUrl: string;
  expiresAt: string;
  provider: 'cloudflare_r2' | 'local_fallback';
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
  private s3Client: any = null;
  private readonly r2Bucket = process.env.R2_BUCKET_NAME || '';
  private readonly r2PublicDomain = process.env.R2_PUBLIC_DOMAIN || '';
  private readonly cloudRetentionDays = parseInt(process.env.MEDIA_CLOUD_RETENTION_DAYS || '30', 10);
  private readonly localRetentionDays = parseInt(process.env.MEDIA_LOCAL_RETENTION_DAYS || '7', 10);

  constructor() {
    this.initStorage();
  }

  async onModuleInit() {
    // Attempt to configure 30-day lifecycle expiration if R2 is active
    if (this.s3Client && this.r2Bucket) {
      await this.configureBucketLifecycle(this.cloudRetentionDays);
    }
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
   * Configure Cloudflare R2 / S3 Lifecycle Rule for 30-day automatic deletion.
   */
  async configureBucketLifecycle(expirationDays: number = 30): Promise<{ success: boolean; message: string }> {
    if (!this.s3Client || !this.r2Bucket) {
      return { success: false, message: 'Cloudflare R2 not active; skipped bucket lifecycle config.' };
    }

    try {
      const { PutBucketLifecycleConfigurationCommand } = require('@aws-sdk/client-s3');
      const command = new PutBucketLifecycleConfigurationCommand({
        Bucket: this.r2Bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: 'Pictolabs30DayAssetRetention',
              Status: 'Enabled',
              Filter: { Prefix: '' },
              Expiration: {
                Days: expirationDays,
              },
            },
          ],
        },
      });

      await this.s3Client.send(command);
      this.logger.log(
        `[StorageService] Applied ${expirationDays}-day automatic expiration lifecycle to bucket: ${this.r2Bucket}`
      );
      return { success: true, message: `R2 lifecycle configured for ${expirationDays} days.` };
    } catch (err: any) {
      this.logger.warn(`[StorageService] Could not set R2 bucket lifecycle: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Generate Presigned Upload PUT URL for Direct Kiosk-to-R2 Ingestion.
   * If R2 is not configured, returns local upload fallback endpoint.
   */
  async getPresignedUploadUrl(params: {
    sessionId: string;
    fileName: string;
    fileType?: string;
    contentType?: string;
    expiresInSeconds?: number;
  }): Promise<PresignedUrlResult> {
    const { sessionId, fileName, contentType = 'application/octet-stream', expiresInSeconds = 900 } = params;
    const safeFilename = path.basename(fileName);
    const key = `sessions/${sessionId}/${safeFilename}`;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    if (this.s3Client && this.r2Bucket) {
      try {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
        const command = new PutObjectCommand({
          Bucket: this.r2Bucket,
          Key: key,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000',
        });

        const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
        const publicUrl = this.r2PublicDomain
          ? `${this.r2PublicDomain.replace(/\/$/, '')}/${key}`
          : `https://${this.r2Bucket}.r2.cloudflarestorage.com/${key}`;

        return {
          uploadUrl,
          key,
          publicUrl,
          expiresAt,
          provider: 'cloudflare_r2',
        };
      } catch (err: any) {
        this.logger.error(`[StorageService] Failed generating presigned R2 URL: ${err.message}. Falling back.`);
      }
    }

    // Local fallback endpoint
    const uploadUrl = `/api/storage/upload`;
    const publicUrl = `/uploads/${safeFilename}`;
    return {
      uploadUrl,
      key: safeFilename,
      publicUrl,
      expiresAt,
      provider: 'local_fallback',
    };
  }

  /**
   * Verify if an object exists in Cloudflare R2 or local storage.
   */
  async verifyObjectExists(key: string): Promise<boolean> {
    if (this.s3Client && this.r2Bucket) {
      try {
        const { HeadObjectCommand } = require('@aws-sdk/client-s3');
        const cmd = new HeadObjectCommand({
          Bucket: this.r2Bucket,
          Key: key,
        });
        await this.s3Client.send(cmd);
        return true;
      } catch (_) {
        return false;
      }
    }

    const localFile = path.join(this.uploadDir, path.basename(key));
    return fs.existsSync(localFile);
  }

  /**
   * Delete an object from Cloudflare R2 and local filesystem.
   */
  async deleteObject(key: string): Promise<boolean> {
    let deleted = false;
    if (this.s3Client && this.r2Bucket) {
      try {
        const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
        const cmd = new DeleteObjectCommand({
          Bucket: this.r2Bucket,
          Key: key,
        });
        await this.s3Client.send(cmd);
        deleted = true;
      } catch (err: any) {
        this.logger.warn(`[StorageService] Failed to delete R2 object ${key}: ${err.message}`);
      }
    }

    const localFile = path.join(this.uploadDir, path.basename(key));
    if (fs.existsSync(localFile)) {
      try {
        fs.unlinkSync(localFile);
        deleted = true;
      } catch (_) {}
    }

    return deleted;
  }

  /**
   * Save uploaded photo composite or raw image buffer directly.
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
      retentionPolicy: {
        localRetentionDays: this.localRetentionDays,
        cloudRetentionDays: this.cloudRetentionDays,
        localDeletionCondition: 'upload_status == COMPLETED',
        cloudDeletionMode: 'automatic_lifecycle_30_days',
        galleryExpiredState: 'valid_url_expiration_page_http_200',
      },
      healthy: true,
      timestamp: new Date().toISOString(),
    };
  }
}
