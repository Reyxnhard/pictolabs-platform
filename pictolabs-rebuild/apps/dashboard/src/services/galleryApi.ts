import { api, API_BASE_URL } from './api';
import type { GalleryDataResponse } from '../types/asset';

export const galleryApi = {
  async getGalleryData(sessionId: string): Promise<GalleryDataResponse> {
    const res = await api.get<GalleryDataResponse>(`/api/gallery/${sessionId}`);
    return res.data;
  },

  getZipDownloadUrl(sessionId: string): string {
    return `${API_BASE_URL}/api/gallery/${sessionId}/zip`;
  },
};
