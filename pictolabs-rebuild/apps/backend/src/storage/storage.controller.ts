import {
  Controller,
  Post,
  Get,
  Delete,
  Query,
  Req,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService
  ) {}

  @Get('health')
  getHealth() {
    return this.storageService.getHealthStatus();
  }

  @Post('presigned-url')
  async getPresignedUrl(
    @Body()
    body: {
      sessionId: string;
      fileName: string;
      fileType?: string;
      contentType?: string;
      expiresInSeconds?: number;
    }
  ) {
    if (!body?.sessionId || !body?.fileName) {
      throw new HttpException('sessionId and fileName are required', HttpStatus.BAD_REQUEST);
    }
    return this.storageService.getPresignedUploadUrl(body);
  }

  @Post('confirm-upload')
  async confirmUpload(
    @Body()
    body: {
      sessionId: string;
      fileName: string;
      fileType: string;
      key?: string;
      publicUrl?: string;
      sequenceNo?: number;
    }
  ) {
    if (!body?.sessionId || !body?.fileName) {
      throw new HttpException('sessionId and fileName are required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(
      `[StorageController] Confirming upload for session=${body.sessionId}, file=${body.fileName}, type=${body.fileType}`
    );

    try {
      const existingSession = await this.prisma.session.findUnique({
        where: { id: body.sessionId },
      });

      if (existingSession) {
        await this.prisma.photo.create({
          data: {
            sessionId: body.sessionId,
            finalUrl: body.publicUrl || `/uploads/${body.fileName}`,
            storageKey: body.key || body.fileName,
            sequenceNo: body.sequenceNo || 1,
          },
        });

        await this.prisma.session.update({
          where: { id: body.sessionId },
          data: { status: 'COMPLETED' },
        });
      }

      return {
        success: true,
        sessionId: body.sessionId,
        fileName: body.fileName,
        confirmed: true,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      this.logger.warn(`[StorageController] DB confirmation non-fatal warning: ${err.message}`);
      return {
        success: true,
        sessionId: body.sessionId,
        fileName: body.fileName,
        confirmed: true,
        dbWarning: err.message,
      };
    }
  }

  @Post('lifecycle-sync')
  async syncLifecycle(@Body() body?: { days?: number }) {
    const days = body?.days || 30;
    return this.storageService.configureBucketLifecycle(days);
  }

  @Post('upload')
  async uploadFile(
    @Req() req: Request,
    @Headers('x-session-id') sessionId?: string,
    @Headers('x-file-name') headerFileName?: string,
    @Headers('x-file-type') fileType?: string,
    @Headers('x-device-secret') deviceSecret?: string
  ) {
    this.logger.log(
      `[StorageController] Incoming upload: session=${sessionId}, file=${headerFileName}, type=${fileType}`
    );

    // Read raw body stream into buffer
    const chunks: Buffer[] = [];
    try {
      const buffer = await new Promise<Buffer>((resolve, reject) => {
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', (err) => reject(err));
      });

      if (!buffer || buffer.length === 0) {
        throw new HttpException('Empty upload payload', HttpStatus.BAD_REQUEST);
      }

      const safeFilename = headerFileName || `composite_${sessionId || Date.now()}.jpg`;
      const mimeType = safeFilename.endsWith('.mp4')
        ? 'video/mp4'
        : safeFilename.endsWith('.webm')
        ? 'video/webm'
        : fileType === 'video'
        ? 'video/mp4'
        : 'image/jpeg';
      const result = await this.storageService.saveFile(safeFilename, buffer, mimeType);

      return {
        success: true,
        sessionId,
        filename: result.filename,
        url: result.url,
        publicUrl: result.publicUrl,
        provider: result.provider,
        sizeBytes: buffer.length,
      };
    } catch (err: any) {
      this.logger.error(`[StorageController] Upload failed: ${err.message}`);
      throw new HttpException(
        `Failed to process upload: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('url')
  getUrl(@Query('key') key: string) {
    if (!key) {
      throw new HttpException('Query parameter "key" is required', HttpStatus.BAD_REQUEST);
    }
    const publicUrl = this.storageService.getFileUrl(key);
    return { key, publicUrl };
  }

  @Get('presigned-download-url')
  async getPresignedDownloadUrl(
    @Query('key') key: string,
    @Query('expiresIn') expiresIn?: string
  ) {
    if (!key) {
      throw new HttpException('Query parameter "key" is required', HttpStatus.BAD_REQUEST);
    }
    const seconds = expiresIn ? parseInt(expiresIn, 10) : 3600;
    const downloadUrl = await this.storageService.getPresignedDownloadUrl(key, seconds);
    return { key, downloadUrl, expiresInSeconds: seconds };
  }

  @Delete('file')
  async deleteFile(@Query('key') key: string) {
    if (!key) {
      throw new HttpException('Query parameter "key" is required', HttpStatus.BAD_REQUEST);
    }
    const success = await this.storageService.deleteFile(key);
    return { key, deleted: success };
  }
}
