export interface SessionTimelineEvent {
  id: string;
  sessionId: string;
  eventType: string;
  stage: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING' | 'SKIPPED';
  durationMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: any;
  createdAt: string;
}

export interface SessionHealth {
  healthStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'ABANDONED';
  failureCategory?: 'HARDWARE' | 'PAYMENT' | 'NETWORK_STORAGE' | 'CUSTOMER_TIMEOUT';
  failureStep?: string;
  errorCode?: string;
  diagnosticMessage: string;
  recommendedAction: string;
}

export interface RedeliveryLogItem {
  id: string;
  sessionId: string;
  actionType: 'RESEND_EMAIL' | 'EXTEND_LINK' | 'CLOUD_RESYNC' | 'PHYSICAL_REPRINT';
  operatorEmail: string;
  recipient: string | null;
  reason: string;
  status: 'SUCCESS' | 'FAILED';
  responsePayload?: string | null;
  createdAt: string;
}

export interface SupportSearchResult {
  id: string;
  customerEmail: string | null;
  customerPhone: string | null;
  orderId: string | null;
  paymentRef: string | null;
  amount: number;
  boothId: string;
  boothName: string;
  branchId: string | null;
  branchName: string;
  status: string;
  health: SessionHealth;
  thumbnailUrl: string | null;
  photoCount: number;
  printCount: number;
  createdAt: string;
}

export interface SupportSearchResponse {
  results: SupportSearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SupportSearchQuery {
  email?: string;
  phone?: string;
  orderId?: string;
  paymentRef?: string;
  branchId?: string;
  boothId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  limit?: number;
}
