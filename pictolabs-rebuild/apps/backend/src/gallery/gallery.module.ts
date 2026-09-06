import { Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';

@Module({
  controllers: [GalleryController],
})
export class GalleryModule {}
