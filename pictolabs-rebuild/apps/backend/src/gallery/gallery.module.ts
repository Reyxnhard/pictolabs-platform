import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GalleryController],
})
export class GalleryModule {}
