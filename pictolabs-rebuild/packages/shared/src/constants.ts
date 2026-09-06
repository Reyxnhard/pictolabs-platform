export const BOOTH_STATUS = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
  MAINTENANCE: 'MAINTENANCE',
  CAPTURING: 'CAPTURING',
  PRINTING: 'PRINTING',
} as const;

export const SESSION_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CAPTURING: 'CAPTURING',
  PROCESSING: 'PROCESSING',
  PRINTING: 'PRINTING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  EXPIRED: 'EXPIRED',
  FAILED: 'FAILED',
} as const;

export const PAPER_SIZES = {
  '2R': { width: 1200, height: 1800, cuts: 2, name: '2R (Strip)' },
  '4R': { width: 1200, height: 1800, cuts: 1, name: '4R' },
  '6R': { width: 1800, height: 2400, cuts: 1, name: '6R' },
} as const;
