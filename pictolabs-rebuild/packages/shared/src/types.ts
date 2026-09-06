import { BOOTH_STATUS, SESSION_STATUS, PAYMENT_STATUS } from './constants';

export type BoothStatus = keyof typeof BOOTH_STATUS;
export type SessionStatus = keyof typeof SESSION_STATUS;
export type PaymentStatus = keyof typeof PAYMENT_STATUS;

export interface CameraSettings {
  iso: number;
  shutterSpeed: string;
  aperture: string;
  whiteBalance: number;
}

export interface PrinterSettings {
  paperSize: string;
  copies: number;
  offsetX: number;
  offsetY: number;
}

export interface GeneralSettings {
  price: number;
  countdownTimer: number;
  timeout: number;
  voucherOnly: boolean;
}

export interface FrameLayerConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}
