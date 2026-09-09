import { api } from './api';
import type { Booth, BoothStatusResponse, UpdateBoothStatusPayload } from '../types/booth';

export const boothsApi = {
  async getBooths(): Promise<Booth[]> {
    const res = await api.get<Booth[]>('/api/booths');
    return res.data;
  },

  async getBoothStatus(id: string): Promise<BoothStatusResponse> {
    const res = await api.get<BoothStatusResponse>(`/api/booths/${id}/status`);
    return res.data;
  },

  async updateBoothStatus(id: string, payload: UpdateBoothStatusPayload): Promise<any> {
    const res = await api.patch(`/api/booths/${id}/status`, payload);
    return res.data;
  },

  async getBoothById(id: string): Promise<Booth> {
    const res = await api.get<Booth>(`/api/booths/${id}`);
    return res.data;
  },

  async updateBoothPin(id: string, newPin: string): Promise<{ success: boolean; message: string; boothId: string }> {
    const res = await api.put<{ success: boolean; message: string; boothId: string }>(`/api/booths/${id}/pin`, { newPin });
    return res.data;
  },
};
