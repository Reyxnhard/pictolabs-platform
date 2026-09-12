import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [GalleryController],
})
export class GalleryModule {}
