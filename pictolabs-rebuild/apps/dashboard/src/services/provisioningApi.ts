import { api } from './api';

export interface GenerateTokenResponse {
  success: boolean;
  token: string;
  boothId: string;
  boothName: string;
  branchName?: string;
  expiresAt: string;
  qrPayload: string;
}

export interface ValidateTokenResponse {
  valid: boolean;
  reason?: string;
  boothId?: string;
  boothName?: string;
  branchName?: string;
  expiresAt?: string;
}

export interface ActivateDeviceResponse {
  success: boolean;
  boothId: string;
  boothName: string;
  branchName: string;
  deviceSecret: string;
  config: any;
  pairedAt: string;
}

export const provisioningApi = {
  async generateToken(boothId: string, ttlMinutes: number = 15): Promise<GenerateTokenResponse> {
    const res = await api.post<GenerateTokenResponse>('/api/provisioning/tokens/generate', {
      boothId,
      ttlMinutes,
    });
    return res.data;
  },

  async validateToken(token: string): Promise<ValidateTokenResponse> {
    const res = await api.get<ValidateTokenResponse>(`/api/provisioning/tokens/${encodeURIComponent(token)}/validate`);
    return res.data;
  },

  async activateDevice(token: string, fingerprint?: any): Promise<ActivateDeviceResponse> {
    const res = await api.post<ActivateDeviceResponse>('/api/provisioning/activate', {
      token,
      deviceFingerprint: fingerprint,
    });
    return res.data;
  },

  async rePairHardware(boothId: string): Promise<GenerateTokenResponse> {
    const res = await api.post<GenerateTokenResponse>('/api/provisioning/re-pair', {
      boothId,
    });
    return res.data;
  },

  async revokeDevice(boothId: string): Promise<{ success: boolean; message: string }> {
    const res = await api.post<{ success: boolean; message: string }>(`/api/provisioning/devices/${boothId}/revoke`);
    return res.data;
  },

  async getDevices(): Promise<any[]> {
    const res = await api.get<any[]>('/api/provisioning/devices');
    return res.data;
  },
};
