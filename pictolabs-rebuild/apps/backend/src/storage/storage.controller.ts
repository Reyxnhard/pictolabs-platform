import {
  Controller,
  Post,
  Get,
  Req,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { StorageService } from './storage.service';

@Controller('api/storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(private readonly storageService: StorageService) {}

  @Get('health')
  getHealth() {
    return this.storageService.getHealthStatus();
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
}
