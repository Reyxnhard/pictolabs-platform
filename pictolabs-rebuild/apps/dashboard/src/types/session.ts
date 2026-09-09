export type CanonicalLifecycle =
  | 'CREATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'CAPTURING'
  | 'PROCESSING'
  | 'UPLOADING'
  | 'READY'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED';

// Allow any string to gracefully support unknown/legacy statuses without runtime crash
export type SessionStatus = CanonicalLifecycle | string;

export interface SessionListItem {
  id: string;
  boothId: string;
  boothName: string;
  branchId: string | null;
  branchName: string;
  status: SessionStatus;
  customerEmail?: string | null;
  customerPhone?: string | null;
  photoCount: number;
  printCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SessionListResponse {
  data: SessionListItem[];
  pagination: SessionPagination;
}

export interface SessionQuery {
  search?: string;
  boothId?: string;
  branchId?: string;
  status?: string;
  date?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

export interface SessionTodayStats {
  sessionsToday: number;
  completedToday: number;
  failedToday: number;
  activeBoothsToday: number;
  calculatedAt: string;
}

export interface SessionDetail {
  id: string;
  boothId: string;
  boothName: string;
  branchId: string | null;
  branchName: string;
  status: SessionStatus;
  customerDownloadUrl: string;
  photos: any[];
  prints: any[];
  transaction?: any;
  createdAt: string;
  updatedAt: string;
}
