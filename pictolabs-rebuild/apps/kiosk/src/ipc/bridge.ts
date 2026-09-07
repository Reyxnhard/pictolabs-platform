/**
 * IPC Bridge — Renderer-side client for calling Electron main process APIs.
 *
 * In Electron, `window.kiosk` is exposed by the preload script via contextBridge.
 * In browser-only mode (Vite dev without Electron), a mock implementation is used
 * so the React app can still function for UI development.
 */

export interface CameraStatus {
  isCanonConnected: boolean;
  cameraModel: string | null;
  isLiveView: boolean;
}

export interface KioskCameraAPI {
  startLiveView(): Promise<void>;
  stopLiveView(): Promise<void>;
  capturePhoto(options?: { mirrorResult?: boolean }): Promise<string>;
  getStatus(): Promise<CameraStatus>;
  onLiveViewFrame(cb: (frame: string) => void): () => void;
}


export interface PrintResult {
  success: boolean;
  error?: string;
}

export interface PrinterStatus {
  ready: boolean;
  name: string;
}

export interface PrinterHealth {
  ready: boolean;
  name: string;
  code: 'OK' | 'PAPER_OUT' | 'LOW_PAPER' | 'RIBBON_OUT' | 'DOOR_OPEN' | 'JAMMED' | 'OFFLINE' | 'BUSY' | 'ERROR' | 'NO_PRINTER';
  message: string;
}

export interface ReprintResult {
  success: boolean;
  sessionId?: string;
  compositePath?: string;
  error?: string;
}

export interface KioskPrinterAPI {
  print(imagePath: string, copies: number): Promise<PrintResult>;
  getPrinterStatus(): Promise<PrinterStatus>;
  getHealth(): Promise<PrinterHealth>;
  listPrinters(): Promise<string[]>;
  reprintLast(): Promise<ReprintResult>;
  cutTest(): Promise<PrintResult>;
  setBypass(enabled: boolean): Promise<{ success: boolean; bypass: boolean }>;
}

export interface RenderResult {
  dataUrl: string;
  filePath: string;
}

export interface KioskRenderAPI {
  composite(photos: string[], frameId: string, filter: string): Promise<RenderResult | string>;
}

export interface LivePhotoFinalizeResult {
  success: boolean;
  videoPaths: string[];
  videoPath?: string;
}

export interface KioskLivePhotoAPI {
  saveClip(sessionId: string, poseIndex: number, data: string | Uint8Array | ArrayBuffer): Promise<{ success: boolean; filePath: string; mp4Path?: string }>;
  saveClipBuffer(sessionId: string, poseIndex: number, buffer: Uint8Array | ArrayBuffer): Promise<{ success: boolean; filePath: string; mp4Path?: string }>;
  finalize(sessionId: string, totalPoses?: number): Promise<LivePhotoFinalizeResult>;
  generate(sessionId: string, totalPoses?: number): Promise<LivePhotoFinalizeResult>;
  generateGif(sessionId: string, photoPaths: string[]): Promise<{ success: boolean; gifPath?: string; mp4Path?: string }>;
  getClipData(filePath: string): Promise<string | null>;
}

export interface SessionRecord {
  id: string;
  createdAt: string;
  frameId: string;
  filter: string;
  photos: string[];
  compositePath?: string;
  liveVideoPath?: string;
  liveVideoPaths?: string[];
  liveVideoUrl?: string;
  liveVideoUrls?: string[];
  gifPath?: string;
  gifUrl?: string;
  printStatus: 'pending' | 'printed' | 'failed';
  synced: boolean;
  uploaded?: boolean;
  remoteUrl?: string;
}

export interface CreateSessionInput {
  id?: string;
  frameId: string;
  filter: string;
  photos: string[];
  printStatus?: 'pending' | 'printed' | 'failed';
  compositePath?: string;
  liveVideoPath?: string;
  liveVideoPaths?: string[];
  gifPath?: string;
}

export interface KioskSessionAPI {
  create(data: CreateSessionInput): Promise<SessionRecord>;
  update(id: string, update: Partial<SessionRecord>): Promise<SessionRecord | null>;
  getLast(): Promise<SessionRecord | null>;
  list(): Promise<SessionRecord[]>;
  getDownloadUrl(sessionId: string): Promise<string>;
}

export interface KioskConfigAPI {
  get(): Promise<Record<string, unknown>>;
  set(partial: Record<string, unknown>): Promise<void>;
  onConfigUpdated(cb: (config: any) => void): () => void;
}

export interface KioskSystemAPI {
  getAppPath(): Promise<string>;
  getPlatformInfo(): Promise<{ platform: string; arch: string }>;
  exitKiosk(): Promise<void>;
  restartKiosk(): Promise<void>;
}

export interface CreateQRISParams {
  boothId?: string;
  sessionId?: string;
  amount?: number;
  productName?: string;
  voucherCode?: string;
}

export interface CreateQRISResult {
  success: boolean;
  orderId: string;
  sessionId: string;
  amount: number;
  qrisString: string;
  qrisUrl?: string;
  expiresAt: string;
  error?: string;
}

export interface PaymentStatusResult {
  orderId: string;
  status: string;
  paid: boolean;
  amount: number;
  sessionId?: string;
}

export interface KioskPaymentAPI {
  createQRIS(params: CreateQRISParams): Promise<CreateQRISResult>;
  checkStatus(orderId: string): Promise<PaymentStatusResult>;
  cancel(orderId: string): Promise<{ success: boolean; orderId?: string }>;
  onPaymentSettled(cb: (data: { orderId: string; amount: number; sessionId?: string }) => void): () => void;
  onPaymentExpired(cb: (data: { orderId: string }) => void): () => void;
}

export interface KioskAPI {
  camera: KioskCameraAPI;
  printer: KioskPrinterAPI;
  render: KioskRenderAPI;
  livePhoto: KioskLivePhotoAPI;
  session: KioskSessionAPI;
  payment: KioskPaymentAPI;
  config: KioskConfigAPI;
  system: KioskSystemAPI;
}

declare global {
  interface Window {
    kiosk?: KioskAPI;
  }
}

/**
 * Check if we're running inside Electron (preload injected window.kiosk).
 */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.kiosk;
}

// ─── Mock Implementation for Browser-Only Dev ────────────

const mockCamera: KioskCameraAPI = {
  async startLiveView() {
    console.log('[MockKiosk] Camera: startLiveView');
  },
  async stopLiveView() {
    console.log('[MockKiosk] Camera: stopLiveView');
  },
  async capturePhoto(_options?: { mirrorResult?: boolean }) {
    console.log('[MockKiosk] Camera: capturePhoto (simulated)', _options);
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#666666';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Simulated Photo', 320, 240);
    ctx.fillText(new Date().toLocaleTimeString(), 320, 270);
    return canvas.toDataURL('image/jpeg', 0.9);
  },
  async getStatus() {
    return {
      isCanonConnected: false,
      cameraModel: 'Webcam Fallback (Browser Dev)',
      isLiveView: false,
    };
  },
  onLiveViewFrame(_cb) {
    console.log('[MockKiosk] Camera: onLiveViewFrame (no-op in browser)');
    return () => {};
  },
};

const mockPrinter: KioskPrinterAPI = {
  async print(imagePath, copies) {
    console.log(`[MockKiosk] Printer: print ${imagePath} x${copies} (simulated)`);
    return { success: true };
  },
  async getPrinterStatus() {
    return { ready: true, name: 'Mock Printer (Dev)' };
  },
  async getHealth() {
    return {
      ready: true,
      name: 'Mock DNP DS-RX1 (Dev)',
      code: 'OK',
      message: 'Printer siap (Mock)',
    };
  },
  async listPrinters() {
    return ['Mock DNP DS-RX1 (Dev)', 'Microsoft Print to PDF'];
  },
  async reprintLast() {
    console.log('[MockKiosk] Printer: reprintLast (simulated)');
    return { success: true, sessionId: 'mock-last-session' };
  },
  async cutTest() {
    console.log('[MockKiosk] Printer: cutTest (simulated)');
    return { success: true };
  },
  async setBypass(enabled) {
    localStorage.setItem('pictolabs-bypass-printer', String(enabled));
    return { success: true, bypass: enabled };
  },
};

const mockRender: KioskRenderAPI = {
  async composite(photos, frameId, filter) {
    console.log(
      `[MockKiosk] Render: composite ${photos.length} photos, frame=${frameId}, filter=${filter} (simulated)`
    );
    await new Promise((r) => setTimeout(r, 2000));
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 600);
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Composite Preview', 200, 280);
    ctx.fillText(`${frameId} | ${filter}`, 200, 310);
    ctx.fillText(`${photos.length} photos`, 200, 340);
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
      filePath: '/mock/composites/composite_simulated.jpg',
    };
  },
};

const mockSession: KioskSessionAPI = {
  async create(data) {
    const session: SessionRecord = {
      id: data.id || `session_${Date.now()}_mock`,
      createdAt: new Date().toISOString(),
      frameId: data.frameId,
      filter: data.filter,
      photos: data.photos,
      compositePath: data.compositePath,
      liveVideoPath: data.liveVideoPath,
      printStatus: data.printStatus || 'pending',
      synced: false,
      uploaded: false,
    };
    localStorage.setItem('pictolabs-mock-last-session', JSON.stringify(session));
    const allRaw = localStorage.getItem('pictolabs-mock-sessions') || '[]';
    try {
      const all = JSON.parse(allRaw);
      all.unshift(session);
      localStorage.setItem('pictolabs-mock-sessions', JSON.stringify(all));
    } catch {}
    return session;
  },
  async update(id, update) {
    const current = await this.getLast();
    if (current && current.id === id) {
      const merged = { ...current, ...update };
      localStorage.setItem('pictolabs-mock-last-session', JSON.stringify(merged));
      return merged;
    }
    return null;
  },
  async getLast() {
    const raw = localStorage.getItem('pictolabs-mock-last-session');
    return raw ? JSON.parse(raw) : null;
  },
  async list() {
    const raw = localStorage.getItem('pictolabs-mock-sessions') || '[]';
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },
  async getDownloadUrl(sessionId) {
    return `http://localhost:4000/d/${sessionId}`;
  },
};

const mockConfig: KioskConfigAPI = {
  async get() {
    const stored = localStorage.getItem('pictolabs-config');
    return stored ? JSON.parse(stored) : {};
  },
  async set(partial) {
    const existing = await this.get();
    const merged = { ...existing, ...partial };
    localStorage.setItem('pictolabs-config', JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('pictolabs:config-updated', { detail: merged }));
  },
  onConfigUpdated(cb) {
    const handler = (e: Event) => cb((e as CustomEvent).detail);
    window.addEventListener('pictolabs:config-updated', handler);
    return () => window.removeEventListener('pictolabs:config-updated', handler);
  },
};

const mockSystem: KioskSystemAPI = {
  async getAppPath() {
    return '/mock/app/path';
  },
  async getPlatformInfo() {
    return { platform: 'browser', arch: 'web' };
  },
  async exitKiosk() {
    console.log('[MockKiosk] System: exitKiosk triggered');
    alert('Mock Kiosk: Exit requested');
  },
  async restartKiosk() {
    console.log('[MockKiosk] System: restartKiosk triggered');
    window.location.reload();
  },
};

const mockLivePhoto: KioskLivePhotoAPI = {
  async saveClip(sessionId: string, poseIndex: number, _data: string | Uint8Array | ArrayBuffer) {
    console.log(`[MockKiosk] LivePhoto: saveClip pose ${poseIndex} for ${sessionId}`);
    return { success: true, filePath: `mock_clip_${poseIndex}.mp4`, mp4Path: `mock_clip_${poseIndex}.mp4` };
  },
  async saveClipBuffer(sessionId: string, poseIndex: number, _buffer: Uint8Array | ArrayBuffer) {
    console.log(`[MockKiosk] LivePhoto: saveClipBuffer pose ${poseIndex} for ${sessionId}`);
    return { success: true, filePath: `mock_clip_${poseIndex}.mp4`, mp4Path: `mock_clip_${poseIndex}.mp4` };
  },
  async finalize(sessionId: string, totalPoses = 4) {
    console.log(`[MockKiosk] LivePhoto: finalize ${totalPoses} separate clips for ${sessionId}`);
    const videoPaths = Array.from({ length: totalPoses }, (_, i) => `mock_livephoto_${sessionId}_pose_${i + 1}.mp4`);
    return { success: true, videoPaths, videoPath: videoPaths[0] };
  },
  async generate(sessionId: string, totalPoses = 4) {
    return this.finalize(sessionId, totalPoses);
  },
  async generateGif(sessionId: string, photoPaths: string[]) {
    console.log(`[MockKiosk] LivePhoto: generateGif for ${sessionId} with ${photoPaths.length} photos`);
    return { success: true, gifPath: `mock_gif_${sessionId}.gif`, mp4Path: `mock_gif_${sessionId}.mp4` };
  },
  async getClipData(filePath: string) {
    return null;
  },
};

const mockPayment: KioskPaymentAPI = {
  async createQRIS(params) {
    console.log('[MockKiosk] Payment: createQRIS', params);
    try {
      const res = await fetch('http://localhost:4000/api/payments/qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boothId: params.boothId || 'dev-secret-booth-01',
          sessionId: params.sessionId,
          amount: params.amount || 35000,
          productName: params.productName,
          voucherCode: params.voucherCode,
        }),
      });
      return await res.json();
    } catch {
      const orderId = `TRX_MOCK_${Date.now()}`;
      return {
        success: true,
        orderId,
        sessionId: params.sessionId || `session_${Date.now()}`,
        amount: params.amount || 35000,
        qrisString: `00020101021226590014ID.LINKAJA.WWW01189360091100222071850215${orderId.padEnd(20, '0')}0303UMI51440014ID.CO.QRIS.WWW0215ID10200210000010303UMI52045812530336054005350005802ID5909PICTOLABS6007JAKARTA61051234062070703A016304`,
        expiresAt: new Date(Date.now() + 270000).toISOString(),
      };
    }
  },
  async checkStatus(orderId) {
    try {
      const res = await fetch(`http://localhost:4000/api/payments/status/${orderId}`);
      return await res.json();
    } catch {
      return { orderId, status: 'PENDING', paid: false, amount: 35000 };
    }
  },
  async cancel(orderId) {
    try {
      const res = await fetch(`http://localhost:4000/api/payments/cancel/${orderId}`, { method: 'POST' });
      return await res.json();
    } catch {
      return { success: true, orderId };
    }
  },
  onPaymentSettled(cb) {
    const handler = (e: any) => cb(e.detail);
    window.addEventListener('pictolabs:payment-settled', handler);
    return () => window.removeEventListener('pictolabs:payment-settled', handler);
  },
  onPaymentExpired(cb) {
    const handler = (e: any) => cb(e.detail);
    window.addEventListener('pictolabs:payment-expired', handler);
    return () => window.removeEventListener('pictolabs:payment-expired', handler);
  },
};

const mockKiosk: KioskAPI = {
  camera: mockCamera,
  printer: mockPrinter,
  render: mockRender,
  livePhoto: mockLivePhoto,
  session: mockSession,
  payment: mockPayment,
  config: mockConfig,
  system: mockSystem,
};

/**
 * Get the Kiosk API — real Electron IPC in production, mock in browser dev.
 */
export function getKioskAPI(): KioskAPI {
  if (isElectron()) {
    return window.kiosk!;
  }
  return mockKiosk;
}

export const kiosk: KioskAPI = {
  get camera() { return (isElectron() ? window.kiosk! : mockKiosk).camera; },
  get printer() { return (isElectron() ? window.kiosk! : mockKiosk).printer; },
  get render() { return (isElectron() ? window.kiosk! : mockKiosk).render; },
  get livePhoto() { return (isElectron() ? window.kiosk! : mockKiosk).livePhoto; },
  get session() { return (isElectron() ? window.kiosk! : mockKiosk).session; },
  get payment() { return (isElectron() ? window.kiosk! : mockKiosk).payment; },
  get config() { return (isElectron() ? window.kiosk! : mockKiosk).config; },
  get system() { return (isElectron() ? window.kiosk! : mockKiosk).system; },
};
