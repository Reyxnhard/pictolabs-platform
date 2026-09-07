import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { registerCameraHandlers, cleanupCamera } from './services/CameraService';
import { registerRenderHandlers } from './services/RenderEngine';
import { registerPrintHandlers, stopPrintService } from './services/PrintService';
import { registerSyncHandlers, stopSyncEngine } from './services/SyncEngine';
import { registerLivePhotoHandlers } from './services/LivePhotoService';
import { initStorageRetention, stopStorageRetention } from './services/StorageRetentionService';

// Register privileged custom schemes before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-video',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

/**
 * Pictolabs Kiosk — Electron Main Process
 *
 * Bootstraps the BrowserWindow in kiosk mode, registers all IPC handlers
 * for camera, render engine, printer, and sync, then loads the React app.
 */

const isDev = !app.isPackaged;
const DATA_DIR = path.join(app.getPath('userData'), 'pictolabs-data');
const CAPTURES_DIR = path.join(DATA_DIR, 'captures');
const COMPOSITES_DIR = path.join(DATA_DIR, 'composites');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos');
const FRAMES_DIR = isDev
  ? path.join(__dirname, '..', 'resources', 'frames')
  : path.join(process.resourcesPath, 'frames');

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: !isDev,
    kiosk: !isDev,
    frame: isDev, // Show title bar in dev mode for debugging
    resizable: isDev,
    autoHideMenuBar: true,
    backgroundColor: '#eff6ff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for sharp/native modules in preload
      webSecurity: false, // Allow local video & photo preview in Kiosk mode
    },
  });

  // Load the app
  const distIndex = path.join(__dirname, '..', 'renderer', 'index.html');
  if (isDev) {
    // In dev mode, attempt to load from Vite dev server
    mainWindow.loadURL('http://localhost:3030').catch((err) => {
      console.warn(`[Electron] Vite dev server not reachable (${err.message}). Falling back to: ${distIndex}`);
      if (fs.existsSync(distIndex)) {
        mainWindow?.loadFile(distIndex);
      }
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load the built renderer files
    mainWindow.loadFile(distIndex);
  }

  // Graceful fallback if initial Vite navigation fails with ERR_CONNECTION_REFUSED
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    if (validatedURL.includes('localhost:3030')) {
      console.warn(`[Electron] Failed to load ${validatedURL} (${errorCode}: ${errorDescription}). Loading pre-built bundle from: ${distIndex}`);
      if (fs.existsSync(distIndex)) {
        mainWindow?.loadFile(distIndex);
      }
    }
  });


  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.warn(`[Renderer Console L${level}] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent navigation away from the app
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Prevent new windows from opening
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function registerSystemHandlers(): void {
  ipcMain.handle('system:app-path', async () => {
    return app.getPath('userData');
  });

  ipcMain.handle('system:platform-info', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      electron: process.versions.electron,
      node: process.versions.node,
    };
  });

  ipcMain.handle('system:exit-kiosk', async () => {
    console.log('[System] Operator requested Kiosk exit');
    app.quit();
  });

  ipcMain.handle('system:restart-kiosk', async () => {
    console.log('[System] Operator requested Kiosk restart');
    app.relaunch();
    app.exit(0);
  });
}

// ─── App Lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  console.log('══════════════════════════════════════════');
  console.log('  Pictolabs Kiosk — Electron Main Process');
  console.log(`  Mode: ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'}`);
  console.log(`  Data: ${DATA_DIR}`);
  console.log('══════════════════════════════════════════');

  // Register local-video protocol handler with hardware-accelerated video streaming
  protocol.handle('local-video', async (request) => {
    try {
      let rawPath = decodeURIComponent(request.url.replace(/^local-video:\/\//, ''));
      // Remove leading slash on Windows (e.g. /C:/ -> C:/)
      if (process.platform === 'win32') {
        rawPath = rawPath.replace(/^\/+/, '');
      }
      return net.fetch(pathToFileURL(rawPath).toString());
    } catch (err: any) {
      console.warn(`[local-video] Error handling video request ${request.url}:`, err);
      return new Response('Video not found', { status: 404 });
    }
  });
  console.log('[Protocol] ✓ local-video:// streaming handler registered');

  // Register all IPC service handlers
  registerCameraHandlers({
    outputDir: CAPTURES_DIR,
    preferCanon: true, // Always prefer Canon EDSDK DSLR if connected
    dataDir: DATA_DIR,
  });

  registerRenderHandlers({
    outputDir: COMPOSITES_DIR,
    framesDir: FRAMES_DIR,
  });

  registerPrintHandlers({
    defaultPrinter: undefined, // Auto-detect
  });

  registerLivePhotoHandlers({
    dataDir: DATA_DIR,
    videosDir: VIDEOS_DIR,
  });

  registerSyncHandlers({
    dataDir: DATA_DIR,
    syncIntervalMs: 30_000, // Sync every 30 seconds
    apiBaseUrl: isDev ? 'http://localhost:4000' : 'https://api.pictolabs.id',
    deviceSecret: 'dev-secret-booth-01', // Should be injected via env/license in prod
  });

  // Initialize Dual-Tier 7-Day Storage Retention Daemon
  initStorageRetention({
    mediaDirectories: [CAPTURES_DIR, COMPOSITES_DIR, VIDEOS_DIR],
    retentionDays: 7,
    minFreeDiskGb: 5,
  });

  registerSystemHandlers();

  // Create the main window
  createWindow();
});

app.on('before-quit', () => {
  cleanupCamera();
  stopSyncEngine();
  stopPrintService();
  stopStorageRetention();
});

app.on('window-all-closed', () => {
  cleanupCamera();
  stopSyncEngine();
  stopPrintService();
  stopStorageRetention();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
