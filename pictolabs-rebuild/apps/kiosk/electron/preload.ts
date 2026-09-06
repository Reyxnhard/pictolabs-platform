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
    capturePhoto: (): Promise<string> =>
      ipcRenderer.invoke('camera:capture'),
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
  },

  // ─── Render Engine ─────────────────────────────────────
  render: {
    composite: (
      photos: string[],
      frameId: string,
      filter: string
    ): Promise<string> =>
      ipcRenderer.invoke('render:composite', photos, frameId, filter),
  },

  // ─── Sessions ───────────────────────────────────────────
  session: {
    getLast: (): Promise<any> =>
      ipcRenderer.invoke('session:get-last'),
    list: (): Promise<any[]> =>
      ipcRenderer.invoke('session:list'),
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

