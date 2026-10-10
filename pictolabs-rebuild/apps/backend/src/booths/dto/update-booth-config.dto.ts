import { IsOptional, IsNumber, IsString, IsBoolean, IsArray, ValidateNested, IsPositive, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PricingConfigDto {
  @IsOptional()
  @IsInt({ message: 'Harga dasar (basePrice) harus berupa bilangan bulat.' })
  @IsPositive({ message: 'Harga dasar (basePrice) harus berupa bilangan bulat positif (> 0).' })
  basePrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsBoolean()
  enableVoucher?: boolean;

  @IsOptional()
  @IsBoolean()
  enableQRIS?: boolean;
}

export class TimingConfigDto {
  @IsOptional()
  @IsNumber()
  paymentTimeoutSec?: number;

  @IsOptional()
  @IsNumber()
  poseCountdownSec?: number;

  @IsOptional()
  @IsNumber()
  qrTimeoutSec?: number;

  @IsOptional()
  @IsNumber()
  idleResetSec?: number;
}

export class PrinterCalibrationDto {
  @IsOptional()
  @IsNumber()
  @Min(85, { message: 'Skala kalibrasi minimal 85%.' })
  @Max(105, { message: 'Skala kalibrasi maksimal 105%.' })
  scale?: number;

  @IsOptional()
  @IsNumber()
  @Min(-25, { message: 'Offset X kalibrasi minimal -25mm.' })
  @Max(25, { message: 'Offset X kalibrasi maksimal 25mm.' })
  offsetX?: number;

  @IsOptional()
  @IsNumber()
  @Min(-25, { message: 'Offset Y kalibrasi minimal -25mm.' })
  @Max(25, { message: 'Offset Y kalibrasi maksimal 25mm.' })
  offsetY?: number;
}

export class PrinterNamesDto {
  @IsOptional()
  @IsString()
  strip2x6?: string | null;

  @IsOptional()
  @IsString()
  photo4x6?: string | null;

  @IsOptional()
  @IsString()
  photo6x8?: string | null;
}

export class HardwareConfigDto {
  @IsOptional()
  @IsString()
  cameraProfileId?: string | null;

  @IsOptional()
  @IsString()
  printerProfileId?: string | null;

  @IsOptional()
  @IsBoolean()
  mirrorViewfinder?: boolean;

  @IsOptional()
  @IsString()
  paperSize?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PrinterCalibrationDto)
  printerCalibration?: PrinterCalibrationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PrinterNamesDto)
  printerNames?: PrinterNamesDto;
}

export class FramesConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFrameIds?: string[];
}

export class SystemConfigDto {
  @IsOptional()
  @IsString()
  themeColor?: string;

  @IsOptional()
  @IsString()
  eventName?: string;

  @IsOptional()
  @IsString()
  subText?: string;
}

export class UpdateBoothConfigDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => PricingConfigDto)
  pricing?: PricingConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimingConfigDto)
  timing?: TimingConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => HardwareConfigDto)
  hardware?: HardwareConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FramesConfigDto)
  frames?: FramesConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SystemConfigDto)
  system?: SystemConfigDto;

  // Backward compatibility legacy flat fields
  @IsOptional()
  @IsInt({ message: 'Harga dasar (price) harus berupa bilangan bulat.' })
  @IsPositive({ message: 'Harga dasar (price) harus berupa bilangan bulat positif (> 0).' })
  price?: number;

  @IsOptional()
  @IsNumber()
  countdown?: number;

  @IsOptional()
  @IsNumber()
  timeout?: number;

  @IsOptional()
  @IsString()
  themeColor?: string;

  @IsOptional()
  @IsString()
  eventName?: string;

  @IsOptional()
  @IsString()
  subText?: string;
}

export interface BoothConfigEnvelope {
  configVersion: number;
  updatedAt: string;
  boothId: string;

  pricing: {
    basePrice: number;
    currency: string;
    enableVoucher: boolean;
    enableQRIS: boolean;
  };

  timing: {
    paymentTimeoutSec: number;
    poseCountdownSec: number;
    qrTimeoutSec: number;
    idleResetSec: number;
  };

  hardware: {
    cameraProfileId: string | null;
    printerProfileId: string | null;
    mirrorViewfinder: boolean;
    paperSize: string;
    printerCalibration?: {
      scale: number;
      offsetX: number;
      offsetY: number;
    };
    printerNames?: {
      strip2x6?: string | null;
      photo4x6?: string | null;
      photo6x8?: string | null;
      [key: string]: string | null | undefined;
    };
  };

  frames: {
    allowedFrameIds: string[];
  };

  system: {
    themeColor: string;
    eventName: string;
    subText: string;
  };

  // Top-level aliases for backward compatibility with existing kiosk code
  price?: number;
  countdown?: number;
  timeout?: number;
  themeColor?: string;
  eventName?: string;
  subText?: string;
}
