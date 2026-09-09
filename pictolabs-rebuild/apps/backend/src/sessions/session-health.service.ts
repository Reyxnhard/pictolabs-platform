import { Injectable } from '@nestjs/common';

export interface SessionHealthResult {
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'ABANDONED';
  failureCategory?: 'HARDWARE' | 'PAYMENT' | 'NETWORK_STORAGE' | 'CUSTOMER_TIMEOUT';
  failureStep?: string;
  errorCode?: string;
  diagnosticMessage: string;
  recommendedAction: string;
}

@Injectable()
export class SessionHealthService {
  diagnose(session: any): SessionHealthResult {
    const { status, createdAt, prints = [], photos = [], events = [], transaction } = session;
    const now = new Date().getTime();
    const createdTime = new Date(createdAt).getTime();
    const ageMinutes = (now - createdTime) / (1000 * 60);

    // 1. Check for Abandoned / Payment Timeout
    if (
      status === 'CANCELLED' ||
      status === 'EXPIRED' ||
      (status === 'PENDING_PAYMENT' && ageMinutes > 5)
    ) {
      return {
        healthStatus: 'ABANDONED',
        failureCategory: 'CUSTOMER_TIMEOUT',
        failureStep: 'PAYMENT',
        errorCode: 'ERR_PAYMENT_TIMEOUT',
        diagnosticMessage: 'Customer did not complete QRIS payment within 5 minutes.',
        recommendedAction: 'No action required unless customer disputes bank charge. Check Midtrans dashboard if claimed.',
      };
    }

    // 2. Check for explicit FAILED events
    const failedEvent = events.find((e: any) => e.status === 'FAILED');
    if (failedEvent) {
      if (failedEvent.stage === 'PRINTING' || failedEvent.errorCode?.includes('PRINTER')) {
        return {
          healthStatus: 'FAILED',
          failureCategory: 'HARDWARE',
          failureStep: 'PRINTING',
          errorCode: failedEvent.errorCode || 'ERR_PRINTER_PAPER_JAM',
          diagnosticMessage: failedEvent.errorMessage || 'Thermal printer reported paper jam / hardware stall during cut phase.',
          recommendedAction: 'Inspect physical printer tray at kiosk and trigger Emergency Strip Reprint.',
        };
      }

      if (failedEvent.stage === 'CAPTURE' || failedEvent.errorCode?.includes('CAMERA')) {
        return {
          healthStatus: 'FAILED',
          failureCategory: 'HARDWARE',
          failureStep: 'CAPTURE',
          errorCode: failedEvent.errorCode || 'ERR_CAMERA_OFFLINE',
          diagnosticMessage: failedEvent.errorMessage || 'DSLR camera disconnected or shutter communication timed out.',
          recommendedAction: 'Inspect camera USB tether and reboot kiosk hardware runtime.',
        };
      }

      if (failedEvent.stage === 'PAYMENT' || failedEvent.errorCode?.includes('PAYMENT')) {
        return {
          healthStatus: 'FAILED',
          failureCategory: 'PAYMENT',
          failureStep: 'PAYMENT',
          errorCode: failedEvent.errorCode || 'ERR_PAYMENT_FAILED',
          diagnosticMessage: failedEvent.errorMessage || 'Payment gateway notification reported failure or settlement decline.',
          recommendedAction: 'Request customer retry QRIS payment or verify bank reference number.',
        };
      }

      if (failedEvent.stage === 'STORAGE' || failedEvent.errorCode?.includes('STORAGE')) {
        return {
          healthStatus: 'DEGRADED',
          failureCategory: 'NETWORK_STORAGE',
          failureStep: 'STORAGE',
          errorCode: failedEvent.errorCode || 'ERR_R2_UPLOAD_PENDING',
          diagnosticMessage: failedEvent.errorMessage || 'Cloudflare R2 direct stream interrupted; media retained locally on SSD.',
          recommendedAction: 'Trigger Edge Cloud Re-Sync once venue network connection stabilizes.',
        };
      }
    }

    // 3. Check Prints Outcome
    if (prints.length > 0 && prints.every((p: any) => !p.isSuccess)) {
      return {
        healthStatus: 'FAILED',
        failureCategory: 'HARDWARE',
        failureStep: 'PRINTING',
        errorCode: 'ERR_PRINTER_OUTPUT_FAILED',
        diagnosticMessage: 'Thermal print spooler failed to output customer photo strip.',
        recommendedAction: 'Execute emergency reprint from the Re-delivery Control Center.',
      };
    }

    // 4. Check Partial Storage or Offline Queuing
    const pendingPhotos = photos.filter((p: any) => !p.finalUrl && !p.storageKey);
    if (pendingPhotos.length > 0 && status === 'COMPLETED') {
      return {
        healthStatus: 'DEGRADED',
        failureCategory: 'NETWORK_STORAGE',
        failureStep: 'STORAGE',
        errorCode: 'ERR_PARTIAL_STORAGE_SYNC',
        diagnosticMessage: `${pendingPhotos.length} photo assets are still queued on the kiosk local SSD.`,
        recommendedAction: 'Trigger Edge Cloud Re-Sync to pull remaining assets into Cloudflare R2.',
      };
    }

    // 5. Default Healthy
    return {
      healthStatus: 'HEALTHY',
      diagnosticMessage: 'All lifecycle milestones (Payment, Capture, Compositing, Print, Storage) completed normally.',
      recommendedAction: 'Session fulfilled without operational anomalies. Digital gallery access active.',
    };
  }
}
