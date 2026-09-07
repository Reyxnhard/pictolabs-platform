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

export interface CreateQRISRequest {
  boothId: string;
  sessionId?: string;
  amount: number;
  productName?: string;
  voucherCode?: string;
}

export interface CreateQRISResponse {
  success: boolean;
  orderId: string;
  sessionId: string;
  amount: number;
  qrisString: string;
  qrisUrl?: string;
  expiresAt: string;
}

export interface PaymentSettledEvent {
  orderId: string;
  sessionId: string;
  amount: number;
  status: string;
  settledAt: string;
}

