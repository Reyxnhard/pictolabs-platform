import { api } from './api';
import type {
  SessionTimelineEvent,
  SessionHealth,
  RedeliveryLogItem,
  SupportSearchQuery,
  SupportSearchResponse,
} from '../types/support';

export const supportApi = {
  async getTimeline(sessionId: string): Promise<SessionTimelineEvent[]> {
    const res = await api.get<SessionTimelineEvent[]>(`/api/sessions/${sessionId}/timeline`);
    return res.data;
  },

  async getHealth(sessionId: string): Promise<SessionHealth> {
    const res = await api.get<SessionHealth>(`/api/sessions/${sessionId}/health`);
    return res.data;
  },

  async resendEmail(
    sessionId: string,
    data: { recipientEmail: string; reason?: string; operatorEmail?: string }
  ) {
    const res = await api.post(`/api/sessions/${sessionId}/redelivery/email`, data);
    return res.data;
  },

  async extendLink(
    sessionId: string,
    data: { extensionDays?: number; reason?: string; operatorEmail?: string }
  ) {
    const res = await api.post(`/api/sessions/${sessionId}/redelivery/extend-link`, data);
    return res.data;
  },

  async triggerReprint(
    sessionId: string,
    data: { copies?: number; reason: string; notes?: string; operatorEmail?: string }
  ) {
    const res = await api.post(`/api/sessions/${sessionId}/reprint`, data);
    return res.data;
  },

  async getRedeliveryHistory(sessionId: string): Promise<RedeliveryLogItem[]> {
    const res = await api.get<RedeliveryLogItem[]>(`/api/sessions/${sessionId}/redelivery/history`);
    return res.data;
  },

  async searchSupport(query: SupportSearchQuery): Promise<SupportSearchResponse> {
    const params = new URLSearchParams();
    if (query.email) params.append('email', query.email);
    if (query.phone) params.append('phone', query.phone);
    if (query.orderId) params.append('orderId', query.orderId);
    if (query.paymentRef) params.append('paymentRef', query.paymentRef);
    if (query.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query.boothId && query.boothId !== 'ALL') params.append('boothId', query.boothId);
    if (query.date) params.append('date', query.date);
    if (query.startTime) params.append('startTime', query.startTime);
    if (query.endTime) params.append('endTime', query.endTime);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const res = await api.get<SupportSearchResponse>(`/api/support/search?${params.toString()}`);
    return res.data;
  },
};
