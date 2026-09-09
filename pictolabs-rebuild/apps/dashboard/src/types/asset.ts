export interface PhotoStripAsset {
  filename: string;
  url: string;
  sizeFormatted: string;
}

export interface PhotoAsset {
  pose: number;
  filename: string;
  url: string;
  previewUrl?: string;
  sizeFormatted: string;
}

export interface LivePhotoAsset {
  pose: number;
  filename: string;
  url: string;
  sizeFormatted: string;
}

export interface GifAsset {
  filename: string;
  url: string;
  isMp4: boolean;
  sizeFormatted: string;
}

export interface GalleryAssets {
  photoStrip: PhotoStripAsset | null;
  photos: PhotoAsset[];
  livePhotos: LivePhotoAsset[];
  gif?: GifAsset | null;
  totalAssets: number;
}

export interface GalleryDataResponse {
  success: boolean;
  expired: boolean;
  sessionId: string;
  status: string;
  createdAt: string | null;
  customerDownloadUrl: string;
  booth: {
    id: string;
    name: string;
    branchName: string | null;
  } | null;
  assets: GalleryAssets;
  message?: string;
  reason?: string;
}
