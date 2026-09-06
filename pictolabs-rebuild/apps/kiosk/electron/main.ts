import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as os from 'os';
import { registerCameraHandlers, cleanupCamera } from './services/CameraService';
import { registerRenderHandlers } from './services/RenderEngine';
import { registerPrintHandlers } from './services/PrintService';
import { registerSyncHandlers, stopSyncEngine } from './services/SyncEngine';

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
    },
  });

  // Load the app
  if (isDev) {
    // In dev mode, load from Vite dev server
    mainWindow.loadURL('http://localhost:3030');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // In production, load the built renderer files
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

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

  // Register all IPC service handlers
  registerCameraHandlers({
    outputDir: CAPTURES_DIR,
    preferCanon: true, // Always prefer Canon EDSDK DSLR if connected
  });

  registerRenderHandlers({
    outputDir: COMPOSITES_DIR,
    framesDir: FRAMES_DIR,
  });

  registerPrintHandlers({
    defaultPrinter: undefined, // Auto-detect
  });

  registerSyncHandlers({
    dataDir: DATA_DIR,
    syncIntervalMs: 30_000, // Sync every 30 seconds
    apiBaseUrl: isDev ? 'http://localhost:4000' : 'https://api.pictolabs.id',
    deviceSecret: 'dev-secret-booth-01', // Should be injected via env/license in prod
  });

  registerSystemHandlers();

  // Create the main window
  createWindow();
});

app.on('before-quit', () => {
  cleanupCamera();
  stopSyncEngine();
});

app.on('window-all-closed', () => {
  cleanupCamera();
  stopSyncEngine();
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
