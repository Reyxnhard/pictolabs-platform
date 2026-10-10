import { z } from 'zod';

export const CameraSettingsSchema = z.object({
  iso: z.number().min(100).max(6400).default(100),
  shutterSpeed: z.string().default('1/125'),
  aperture: z.string().default('f/5.6'),
  whiteBalance: z.number().default(9)
});

export const PrinterSettingsSchema = z.object({
  paperSize: z.enum(['2R', '4R', '6R']).default('4R'),
  copies: z.number().min(1).max(5).default(1),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0)
});

export const GeneralSettingsSchema = z.object({
  price: z.number().int().positive().default(35000),
  countdownTimer: z.number().min(3).max(10).default(5),
  timeout: z.number().min(60).max(600).default(270),
  voucherOnly: z.boolean().default(false)
});

export const PrinterCalibrationSchema = z.object({
  scale: z.number().min(85).max(105).default(99),
  offsetX: z.number().min(-25).max(25).default(0),
  offsetY: z.number().min(-25).max(25).default(3)
});

export const PrinterNamesSchema = z.object({
  strip2x6: z.string().nullable().optional(),
  photo4x6: z.string().nullable().optional(),
  photo6x8: z.string().nullable().optional()
}).passthrough();

