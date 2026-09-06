/**
 * IPC Bridge — Renderer-side client for calling Electron main process APIs.
 *
 * In Electron, `window.kiosk` is exposed by the preload script via contextBridge.
 * In browser-only mode (Vite dev without Electron), a mock implementation is used
 * so the React app can still function for UI development.
 */

export interface KioskCameraAPI {
  startLiveView(): Promise<void>;
  stopLiveView(): Promise<void>;
  capturePhoto(): Promise<string>;
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
}

export interface KioskRenderAPI {
  composite(photos: string[], frameId: string, filter: string): Promise<string>;
}

export interface KioskSessionAPI {
  getLast(): Promise<any>;
  list(): Promise<any[]>;
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

export interface KioskAPI {
  camera: KioskCameraAPI;
  printer: KioskPrinterAPI;
  render: KioskRenderAPI;
  session: KioskSessionAPI;
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
  async capturePhoto() {
    console.log('[MockKiosk] Camera: capturePhoto (simulated)');
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
    return canvas.toDataURL('image/jpeg', 0.9);
  },
};

const mockSession: KioskSessionAPI = {
  async getLast() {
    const raw = localStorage.getItem('pictolabs-mock-last-session');
    return raw ? JSON.parse(raw) : null;
  },
  async list() {
    return [];
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

const mockKiosk: KioskAPI = {
  camera: mockCamera,
  printer: mockPrinter,
  render: mockRender,
  session: mockSession,
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
  get session() { return (isElectron() ? window.kiosk! : mockKiosk).session; },
  get config() { return (isElectron() ? window.kiosk! : mockKiosk).config; },
  get system() { return (isElectron() ? window.kiosk! : mockKiosk).system; },
};
