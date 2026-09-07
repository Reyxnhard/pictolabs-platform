import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script — runs in a sandboxed renderer context.
 * Exposes a safe `window.kiosk` API via contextBridge so the
 * React app can communicate with the Electron main process
 * without enabling nodeIntegration.
 */

const kioskApi = {
  // ─── Camera ────────────────────────────────────────────
  camera: {
    startLiveView: (): Promise<void> =>
      ipcRenderer.invoke('camera:start-live-view'),
    stopLiveView: (): Promise<void> =>
      ipcRenderer.invoke('camera:stop-live-view'),
    capturePhoto: (options?: { mirrorResult?: boolean }): Promise<string> =>
      ipcRenderer.invoke('camera:capture', options),

    getStatus: (): Promise<{ isCanonConnected: boolean; cameraModel: string | null; isLiveView: boolean }> =>
      ipcRenderer.invoke('camera:status'),
    /** Subscribe to live-view frame stream. Returns unsubscribe fn. */
    onLiveViewFrame: (cb: (frame: string) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, frame: string) =>
        cb(frame);
      ipcRenderer.on('camera:live-view-frame', handler);
      return () => ipcRenderer.removeListener('camera:live-view-frame', handler);
    },
  },

  // ─── Printer ───────────────────────────────────────────
  printer: {
    print: (imagePath: string, copies: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('printer:print', imagePath, copies),
    getPrinterStatus: (): Promise<{ ready: boolean; name: string }> =>
      ipcRenderer.invoke('printer:status'),
    getHealth: (): Promise<{ ready: boolean; name: string; code: string; message: string }> =>
      ipcRenderer.invoke('printer:health'),
    listPrinters: (): Promise<string[]> =>
      ipcRenderer.invoke('printer:list'),
    reprintLast: (): Promise<{ success: boolean; sessionId?: string; error?: string }> =>
      ipcRenderer.invoke('printer:reprint-last'),
    cutTest: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('printer:cut-test'),
    setBypass: (enabled: boolean): Promise<{ success: boolean; bypass: boolean }> =>
      ipcRenderer.invoke('printer:set-bypass', enabled),
  },

  // ─── Render Engine ─────────────────────────────────────
  render: {
    composite: (
      photos: string[],
      frameId: string,
      filter: string
    ): Promise<{ dataUrl: string; filePath: string } | string> =>
      ipcRenderer.invoke('render:composite', photos, frameId, filter),
  },

  // ─── Live Photo ─────────────────────────────────────────
  livePhoto: {
    saveClip: (sessionId: string, poseIndex: number, data: string | Uint8Array | ArrayBuffer): Promise<{ success: boolean; filePath: string; mp4Path?: string }> =>
      ipcRenderer.invoke('livephoto:save-clip', sessionId, poseIndex, data),
    saveClipBuffer: (sessionId: string, poseIndex: number, buffer: Uint8Array | ArrayBuffer): Promise<{ success: boolean; filePath: string; mp4Path?: string }> =>
      ipcRenderer.invoke('livephoto:save-clip-buffer', sessionId, poseIndex, buffer),
    finalize: (sessionId: string, totalPoses?: number): Promise<{ success: boolean; videoPaths: string[]; videoPath: string }> =>
      ipcRenderer.invoke('livephoto:finalize', sessionId, totalPoses),
    generate: (sessionId: string, totalPoses?: number): Promise<{ success: boolean; videoPaths: string[]; videoPath: string }> =>
      ipcRenderer.invoke('livephoto:finalize', sessionId, totalPoses),
    generateGif: (sessionId: string, photoPaths: string[]): Promise<{ success: boolean; gifPath?: string; mp4Path?: string }> =>
      ipcRenderer.invoke('livephoto:generate-gif', sessionId, photoPaths),
    getClipData: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke('livephoto:get-clip-data', filePath),
  },

  // ─── Sessions ───────────────────────────────────────────
  session: {
    create: (data: {
      id?: string;
      frameId: string;
      filter: string;
      photos: string[];
      printStatus?: string;
      compositePath?: string;
      liveVideoPath?: string;
      liveVideoPaths?: string[];
    }): Promise<any> =>
      ipcRenderer.invoke('session:create', data),
    update: (id: string, update: any): Promise<any> =>
      ipcRenderer.invoke('session:update', id, update),
    getLast: (): Promise<any> =>
      ipcRenderer.invoke('session:get-last'),
    list: (): Promise<any[]> =>
      ipcRenderer.invoke('session:list'),
    getDownloadUrl: (sessionId: string): Promise<string> =>
      ipcRenderer.invoke('session:get-download-url', sessionId),
  },

  // ─── Payment ───────────────────────────────────────────
  payment: {
    createQRIS: (payload: {
      boothId?: string;
      sessionId?: string;
      amount?: number;
      productName?: string;
      voucherCode?: string;
    }): Promise<{
      success: boolean;
      orderId: string;
      sessionId: string;
      amount: number;
      qrisString: string;
      qrisUrl?: string;
      expiresAt: string;
      error?: string;
    }> => ipcRenderer.invoke('payment:create-qris', payload),

    checkStatus: (orderId: string): Promise<{
      orderId: string;
      status: string;
      paid: boolean;
      amount: number;
      sessionId?: string;
    }> => ipcRenderer.invoke('payment:check-status', orderId),

    cancel: (orderId: string): Promise<{ success: boolean; orderId?: string }> =>
      ipcRenderer.invoke('payment:cancel', orderId),

    onPaymentSettled: (cb: (data: { orderId: string; amount: number; sessionId?: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
      ipcRenderer.on('payment:settled', handler);
      return () => ipcRenderer.removeListener('payment:settled', handler);
    },

    onPaymentExpired: (cb: (data: { orderId: string }) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, data: any) => cb(data);
      ipcRenderer.on('payment:expired', handler);
      return () => ipcRenderer.removeListener('payment:expired', handler);
    },
  },

  // ─── Config ────────────────────────────────────────────
  config: {
    get: (): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke('config:get'),
    set: (partial: Record<string, unknown>): Promise<void> =>
      ipcRenderer.invoke('config:set', partial),
    onConfigUpdated: (cb: (config: any) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, newConfig: any) => cb(newConfig);
      ipcRenderer.on('kiosk:config-updated', handler);
      return () => ipcRenderer.removeListener('kiosk:config-updated', handler);
    },
  },

  // ─── System ────────────────────────────────────────────
  system: {
    getAppPath: (): Promise<string> =>
      ipcRenderer.invoke('system:app-path'),
    getPlatformInfo: (): Promise<{ platform: string; arch: string }> =>
      ipcRenderer.invoke('system:platform-info'),
    exitKiosk: (): Promise<void> =>
      ipcRenderer.invoke('system:exit-kiosk'),
    restartKiosk: (): Promise<void> =>
      ipcRenderer.invoke('system:restart-kiosk'),
  },
};

contextBridge.exposeInMainWorld('kiosk', kioskApi);

export type KioskAPI = typeof kioskApi;

