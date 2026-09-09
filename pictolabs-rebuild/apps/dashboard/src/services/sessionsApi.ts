import { api } from './api';
import type { SessionListResponse, SessionQuery, SessionTodayStats, SessionDetail } from '../types/session';

export const sessionsApi = {
  async getSessions(query: SessionQuery = {}): Promise<SessionListResponse> {
    const params = new URLSearchParams();
    if (query.search) params.append('search', query.search);
    if (query.boothId && query.boothId !== 'ALL') params.append('boothId', query.boothId);
    if (query.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query.status && query.status !== 'ALL') params.append('status', query.status);
    if (query.date) params.append('date', query.date);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));

    const res = await api.get<SessionListResponse>(`/api/sessions?${params.toString()}`);
    return res.data;
  },

  async getTodayStats(): Promise<SessionTodayStats> {
    const res = await api.get<SessionTodayStats>('/api/sessions/stats/today');
    return res.data;
  },

  async getSessionById(id: string): Promise<SessionDetail> {
    const res = await api.get<SessionDetail>(`/api/sessions/${id}`);
    return res.data;
  },
};
