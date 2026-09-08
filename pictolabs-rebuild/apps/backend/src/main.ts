import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const express = require('express');
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  app.enableCors({ origin: '*' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Ensure public/uploads directory exists
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Serve static assets at /uploads/ with HTTP 206 Partial Content (Range) support
  app.useStaticAssets(uploadsDir, {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  });

  // Configure Swagger OpenAPI 3.0 Documentation
  const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pictolabs Photobooth Cloud API')
    .setDescription('Operational monitoring, fleet telemetry, storage ingestion, and payment gateway APIs')
    .setVersion('1.0.0')
    .addTag('Booths', 'Fleet heartbeat, dynamic status tracking, and configuration push')
    .addTag('Storage', 'Cloudflare R2 object storage and presigned upload ingestion')
    .addTag('Payments', 'Midtrans QRIS dynamic payment integration')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`[Pictolabs Backend] Running on http://localhost:${port}`);
  console.log(`[Pictolabs Backend] Static photos served at http://localhost:${port}/uploads/`);
}
bootstrap();
