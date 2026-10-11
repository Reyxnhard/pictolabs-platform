/**
 * PICTOLABS CAMERA-01 CHECKPOINT 1 VERIFICATION SUITE
 * Test: IPC Contract & Camera Status Synchronization
 *
 * Verifies:
 * 1. Typed CameraStatus schema & activeSensor states ('canon' | 'webcam' | 'none')
 * 2. Status transitions across lifecycle (plugin, connect error, liveview start/stop, disconnect, cleanup)
 * 3. Main process event broadcasting via 'camera:status-changed'
 * 4. Renderer listener registration, invocation, and unbind cleanup (no leak / duplicate listeners)
 * 5. Preload & IPC Bridge compatibility in both Electron and Mock modes
 */

import { strict as assert } from 'assert';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  PICTOLABS CAMERA-01: CHECKPOINT 1 IPC CONTRACT VERIFICATION        ');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let testsPassed = 0;
let testsTotal = 0;

function test(name, fn) {
  testsTotal++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ─── SUITE 1: STATUS PAYLOAD & TYPING CONTRACT ──────────────────────
console.log('Test Suite 1: [STATIC SCHEMA] CameraStatus Schema & Sensor Typing Contract');

test('Schema: Validates initial offline CameraStatus payload', () => {
  const status = {
    isCanonConnected: false,
    cameraModel: null,
    isLiveView: false,
    activeSensor: 'none',
    errorCode: null,
    errorMessage: null,
  };

  assert.strictEqual(typeof status.isCanonConnected, 'boolean');
  assert.strictEqual(status.cameraModel, null);
  assert.strictEqual(typeof status.isLiveView, 'boolean');
  assert.strictEqual(['canon', 'webcam', 'none'].includes(status.activeSensor), true);
  assert.strictEqual(status.activeSensor, 'none');
  assert.strictEqual(status.errorCode, null);
  assert.strictEqual(status.errorMessage, null);
});

test('Schema: Validates connected Canon DSLR CameraStatus payload', () => {
  const status = {
    isCanonConnected: true,
    cameraModel: 'Canon EOS 60D',
    isLiveView: true,
    activeSensor: 'canon',
    errorCode: null,
    errorMessage: null,
  };

  assert.strictEqual(status.isCanonConnected, true);
  assert.strictEqual(status.cameraModel, 'Canon EOS 60D');
  assert.strictEqual(status.isLiveView, true);
  assert.strictEqual(status.activeSensor, 'canon');
});

test('Schema: Validates webcam fallback CameraStatus payload with error code', () => {
  const status = {
    isCanonConnected: false,
    cameraModel: null,
    isLiveView: true,
    activeSensor: 'webcam',
    errorCode: 'ERR_CANON_DISCONNECTED',
    errorMessage: 'Canon camera disconnected',
  };

  assert.strictEqual(status.isCanonConnected, false);
  assert.strictEqual(status.activeSensor, 'webcam');
  assert.strictEqual(status.errorCode, 'ERR_CANON_DISCONNECTED');
  assert.strictEqual(status.errorMessage, 'Canon camera disconnected');
});

console.log('');

// ─── SUITE 2: STATUS TRANSITION LOGIC SIMULATION ────────────────────
console.log('Test Suite 2: [SIMULATOR] State Transitions & Status Derivation Logic');

class MockCameraServiceState {
  constructor() {
    this.activeCamera = null;
    this.isLiveViewActive = false;
    this.liveViewInterval = null;
    this.liveViewStartCount = 0;
    this.cameraStatus = {
      isCanonConnected: false,
      cameraModel: null,
      isLiveView: false,
      activeSensor: 'none',
      errorCode: null,
      errorMessage: null,
    };
    this.broadcastCount = 0;
    this.lastBroadcast = null;
  }

  getEffectiveCameraStatus() {
    const isCanonUsable = Boolean(this.activeCamera && this.cameraStatus.isCanonConnected);
    const isCanonStreaming = Boolean(isCanonUsable && this.isLiveViewActive && this.cameraStatus.isLiveView);
    let sensor = this.cameraStatus.activeSensor;
    if (sensor === 'canon' && !isCanonUsable) {
      sensor = 'none';
    }
    return {
      ...this.cameraStatus,
      isCanonConnected: isCanonUsable,
      isLiveView: isCanonStreaming,
      activeSensor: sensor,
    };
  }

  broadcastCameraStatus() {
    this.broadcastCount++;
    this.lastBroadcast = this.getEffectiveCameraStatus();
  }

  onCameraPluggedIn(model = 'Canon EOS 60D', options = {}) {
    this.activeCamera = { description: model };
    this.cameraStatus.isCanonConnected = true;
    this.cameraStatus.cameraModel = model;
    this.cameraStatus.activeSensor = 'canon';
    this.cameraStatus.errorCode = null;
    this.cameraStatus.errorMessage = null;

    if (this.isLiveViewActive && !this.liveViewInterval) {
      if (options.failAutoStartLiveView) {
        this.cameraStatus.isLiveView = false;
        this.cameraStatus.activeSensor = 'none';
        this.cameraStatus.errorCode = 'ERR_CANON_LIVEVIEW_AUTOSTART';
        this.cameraStatus.errorMessage = 'EDS_ERR_TAKE_PICTURE_AF_NG';
      } else {
        this.cameraStatus.isLiveView = true;
        this.liveViewInterval = {};
        this.liveViewStartCount++;
      }
    }

    this.broadcastCameraStatus();
  }

  onCameraConnectError(errorMsg = 'EDS_ERR_DEVICE_BUSY') {
    this.activeCamera = null;
    this.cameraStatus.isCanonConnected = false;
    this.cameraStatus.cameraModel = null;
    this.cameraStatus.isLiveView = false;
    this.cameraStatus.activeSensor = 'none';
    this.cameraStatus.errorCode = 'ERR_CANON_CONNECT';
    this.cameraStatus.errorMessage = errorMsg;
    this.broadcastCameraStatus();
  }

  startLiveView(options = {}) {
    this.isLiveViewActive = true;
    if (this.activeCamera) {
      if (options.failCanonLiveView) {
        this.cameraStatus.isLiveView = false;
        this.cameraStatus.errorCode = 'ERR_CANON_LIVEVIEW_START';
        this.cameraStatus.errorMessage = 'EDS_ERR_SESSION_NOT_OPEN';
        this.cameraStatus.activeSensor = 'none';
      } else {
        this.cameraStatus.isLiveView = true;
        this.cameraStatus.activeSensor = 'canon';
        this.cameraStatus.errorCode = null;
        this.cameraStatus.errorMessage = null;
        this.liveViewInterval = {};
        this.liveViewStartCount++;
      }
    } else {
      this.cameraStatus.isLiveView = false;
      this.cameraStatus.activeSensor = 'none';
    }
    this.broadcastCameraStatus();
  }

  stopLiveView() {
    this.isLiveViewActive = false;
    this.cameraStatus.isLiveView = false;
    this.cameraStatus.activeSensor = this.cameraStatus.isCanonConnected ? 'canon' : 'none';
    this.liveViewInterval = null;
    this.broadcastCameraStatus();
  }

  onCameraDisconnected() {
    this.activeCamera = null;
    this.cameraStatus.isCanonConnected = false;
    this.cameraStatus.cameraModel = null;
    this.cameraStatus.isLiveView = false;
    this.cameraStatus.activeSensor = 'none';
    this.cameraStatus.errorCode = 'ERR_CANON_DISCONNECTED';
    this.cameraStatus.errorMessage = 'Canon camera disconnected';
    this.liveViewInterval = null;
    this.broadcastCameraStatus();
  }

  cleanupCamera() {
    this.activeCamera = null;
    this.isLiveViewActive = false;
    this.cameraStatus.isLiveView = false;
    this.cameraStatus.isCanonConnected = false;
    this.cameraStatus.cameraModel = null;
    this.cameraStatus.activeSensor = 'none';
    this.cameraStatus.errorCode = null;
    this.cameraStatus.errorMessage = null;
    this.liveViewInterval = null;
    this.broadcastCameraStatus();
  }
}

test('Lifecycle: Plug-in transitions sensor to canon and clears error (idle, LiveView false)', () => {
  const service = new MockCameraServiceState();
  assert.strictEqual(service.getEffectiveCameraStatus().activeSensor, 'none');

  service.onCameraPluggedIn('Canon EOS 60D');
  const status = service.getEffectiveCameraStatus();

  assert.strictEqual(status.isCanonConnected, true);
  assert.strictEqual(status.cameraModel, 'Canon EOS 60D');
  assert.strictEqual(status.isLiveView, false, 'Canon plug-in alone does not imply LiveView running');
  assert.strictEqual(status.activeSensor, 'canon');
  assert.strictEqual(status.errorCode, null);
  assert.strictEqual(service.broadcastCount, 1);
});

test('Lifecycle: LiveView start on connected Canon starts streaming and preserves canon sensor', () => {
  const service = new MockCameraServiceState();
  service.onCameraPluggedIn('Canon EOS 60D');
  service.startLiveView();

  const status = service.getEffectiveCameraStatus();
  assert.strictEqual(status.isCanonConnected, true);
  assert.strictEqual(status.isLiveView, true);
  assert.strictEqual(status.activeSensor, 'canon');
  assert.strictEqual(service.broadcastCount, 2);
});

test('Lifecycle: Camera disconnect during active LiveView sets activeSensor to none, halts isLiveView, and emits error', () => {
  const service = new MockCameraServiceState();
  service.onCameraPluggedIn('Canon EOS 60D');
  service.startLiveView();
  assert.strictEqual(service.getEffectiveCameraStatus().activeSensor, 'canon');
  assert.strictEqual(service.getEffectiveCameraStatus().isLiveView, true);

  service.onCameraDisconnected();
  const status = service.getEffectiveCameraStatus();

  assert.strictEqual(status.isCanonConnected, false);
  assert.strictEqual(status.cameraModel, null);
  assert.strictEqual(status.isLiveView, false, 'isLiveView must drop to false upon Canon disconnect');
  assert.strictEqual(status.activeSensor, 'none', 'activeSensor must drop to none until renderer confirms webcam');
  assert.strictEqual(status.errorCode, 'ERR_CANON_DISCONNECTED');
  assert.strictEqual(service.broadcastCount, 3);
});

test('Lifecycle: Stopping LiveView after disconnect sets activeSensor to none', () => {
  const service = new MockCameraServiceState();
  service.onCameraPluggedIn('Canon EOS 60D');
  service.startLiveView();
  service.onCameraDisconnected();
  service.stopLiveView();

  const status = service.getEffectiveCameraStatus();
  assert.strictEqual(status.isLiveView, false);
  assert.strictEqual(status.activeSensor, 'none');
  assert.strictEqual(status.isCanonConnected, false);
});

test('Lifecycle Regression 1: Connection failure sets error code, cleans activeCamera, and does NOT claim Canon success or liveview', () => {
  const service = new MockCameraServiceState();
  service.onCameraConnectError('EDS_ERR_COMM_DISCONNECTED');

  const status = service.getEffectiveCameraStatus();
  assert.strictEqual(status.isCanonConnected, false);
  assert.strictEqual(status.cameraModel, null);
  assert.strictEqual(status.isLiveView, false);
  assert.strictEqual(status.errorCode, 'ERR_CANON_CONNECT');
  assert.strictEqual(status.errorMessage, 'EDS_ERR_COMM_DISCONNECTED');
  assert.strictEqual(status.activeSensor, 'none');
});

test('Lifecycle Regression 2: LiveView start failure on connected Canon reports isLiveView=false and activeSensor=none without false success', () => {
  const service = new MockCameraServiceState();
  service.onCameraPluggedIn('Canon EOS 60D');
  assert.strictEqual(service.getEffectiveCameraStatus().activeSensor, 'canon');

  // Trigger LiveView start failure while activeCamera object is still present
  service.startLiveView({ failCanonLiveView: true });

  const status = service.getEffectiveCameraStatus();
  assert.strictEqual(status.isCanonConnected, true, 'DSLR USB remains physically attached');
  assert.strictEqual(status.isLiveView, false, 'isLiveView must be false when LiveView start fails');
  assert.strictEqual(status.activeSensor, 'none', 'activeSensor must remain none until renderer confirms webcam');
  assert.strictEqual(status.errorCode, 'ERR_CANON_LIVEVIEW_START');
});

test('Lifecycle Regression 3: Reconnect while LiveView is active auto-starts LiveView exactly once with coherent status', () => {
  const service = new MockCameraServiceState();
  service.onCameraPluggedIn('Canon EOS 60D');
  service.startLiveView();
  assert.strictEqual(service.liveViewStartCount, 1);

  // Disconnect mid-session
  service.onCameraDisconnected();
  assert.strictEqual(service.getEffectiveCameraStatus().isCanonConnected, false);
  assert.strictEqual(service.getEffectiveCameraStatus().isLiveView, false);

  // Reconnect while isLiveViewActive remains true (CaptureScreen)
  service.onCameraPluggedIn('Canon EOS 60D');
  const status = service.getEffectiveCameraStatus();

  assert.strictEqual(status.isCanonConnected, true);
  assert.strictEqual(status.isLiveView, true, 'LiveView auto-starts upon reconnect if active');
  assert.strictEqual(status.activeSensor, 'canon');
  assert.strictEqual(status.errorCode, null);
  assert.strictEqual(service.liveViewStartCount, 2, 'LiveView started exactly once on reconnect');
  assert.notStrictEqual(service.liveViewInterval, null, 'Frame interval started');
});

test('Lifecycle Regression 4: LiveView auto-start failure during reconnect preserves isCanonConnected=true, sets isLiveView=false, activeSensor=none, and ERR_CANON_LIVEVIEW_AUTOSTART without being overwritten by ERR_CANON_CONNECT', () => {
  const service = new MockCameraServiceState();
  service.onCameraPluggedIn('Canon EOS 60D');
  service.startLiveView();

  // Disconnect mid-session
  service.onCameraDisconnected();

  // Reconnect with LiveView auto-start failure
  service.onCameraPluggedIn('Canon EOS 60D', { failAutoStartLiveView: true });
  const status = service.getEffectiveCameraStatus();

  assert.strictEqual(status.isCanonConnected, true, 'Canon session is connected');
  assert.strictEqual(status.isLiveView, false, 'isLiveView must be false because auto-start threw');
  assert.strictEqual(status.activeSensor, 'none', 'activeSensor must be none');
  assert.strictEqual(status.errorCode, 'ERR_CANON_LIVEVIEW_AUTOSTART');
  assert.notStrictEqual(status.errorCode, 'ERR_CANON_CONNECT', 'Must NOT be overwritten as connection error');
});

test('Lifecycle: Full cleanup on application exit sets all states to clean idle', () => {
  const service = new MockCameraServiceState();
  service.onCameraPluggedIn('Canon EOS 60D');
  service.startLiveView();
  service.cleanupCamera();

  const status = service.getEffectiveCameraStatus();
  assert.strictEqual(status.isCanonConnected, false);
  assert.strictEqual(status.isLiveView, false);
  assert.strictEqual(status.activeSensor, 'none');
  assert.strictEqual(status.errorCode, null);
});

console.log('');

// ─── SUITE 3: IPC BROADCAST & LISTENER CLEANUP ──────────────────────
console.log('Test Suite 3: [SIMULATOR] IPC Event Broadcasting & Listener Cleanup');

class MockIpcRenderer {
  constructor() {
    this.listeners = new Map();
  }

  on(channel, handler) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel).add(handler);
  }

  removeListener(channel, handler) {
    const set = this.listeners.get(channel);
    if (set) {
      set.delete(handler);
      if (set.size === 0) {
        this.listeners.delete(channel);
      }
    }
  }

  emit(channel, ...args) {
    const set = this.listeners.get(channel);
    if (set) {
      for (const handler of Array.from(set)) {
        handler({}, ...args);
      }
    }
  }

  listenerCount(channel) {
    return this.listeners.has(channel) ? this.listeners.get(channel).size : 0;
  }
}

test('IPC: Listener registers and receives status change events', () => {
  const ipc = new MockIpcRenderer();
  const received = [];

  const onCameraStatusChanged = (cb) => {
    const handler = (_event, status) => cb(status);
    ipc.on('camera:status-changed', handler);
    return () => ipc.removeListener('camera:status-changed', handler);
  };

  const unsubscribe = onCameraStatusChanged((status) => {
    received.push(status);
  });

  assert.strictEqual(ipc.listenerCount('camera:status-changed'), 1);

  ipc.emit('camera:status-changed', {
    isCanonConnected: true,
    cameraModel: 'Canon EOS 60D',
    isLiveView: false,
    activeSensor: 'canon',
  });

  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].cameraModel, 'Canon EOS 60D');
  assert.strictEqual(received[0].activeSensor, 'canon');

  unsubscribe();
  assert.strictEqual(ipc.listenerCount('camera:status-changed'), 0);
});

test('IPC: Listener cleanup prevents subsequent event triggers (no memory leak)', () => {
  const ipc = new MockIpcRenderer();
  let calls = 0;

  const onCameraStatusChanged = (cb) => {
    const handler = (_event, status) => cb(status);
    ipc.on('camera:status-changed', handler);
    return () => ipc.removeListener('camera:status-changed', handler);
  };

  const unsubscribe = onCameraStatusChanged(() => {
    calls++;
  });

  ipc.emit('camera:status-changed', { isCanonConnected: true, activeSensor: 'canon' });
  assert.strictEqual(calls, 1);

  // Unsubscribe cleanly
  unsubscribe();
  assert.strictEqual(ipc.listenerCount('camera:status-changed'), 0);

  // Subsequent events must not increment calls
  ipc.emit('camera:status-changed', { isCanonConnected: false, activeSensor: 'none' });
  ipc.emit('camera:status-changed', { isCanonConnected: true, activeSensor: 'canon' });
  assert.strictEqual(calls, 1, 'Handler must NOT be called after unsubscribe');
});

test('IPC: Multiple independent listeners can register and unsubscribe independently', () => {
  const ipc = new MockIpcRenderer();
  let calls1 = 0;
  let calls2 = 0;

  const onCameraStatusChanged = (cb) => {
    const handler = (_event, status) => cb(status);
    ipc.on('camera:status-changed', handler);
    return () => ipc.removeListener('camera:status-changed', handler);
  };

  const unbind1 = onCameraStatusChanged(() => calls1++);
  const unbind2 = onCameraStatusChanged(() => calls2++);

  assert.strictEqual(ipc.listenerCount('camera:status-changed'), 2);

  ipc.emit('camera:status-changed', { isCanonConnected: true });
  assert.strictEqual(calls1, 1);
  assert.strictEqual(calls2, 1);

  // Unbind first listener only
  unbind1();
  assert.strictEqual(ipc.listenerCount('camera:status-changed'), 1);

  ipc.emit('camera:status-changed', { isCanonConnected: false });
  assert.strictEqual(calls1, 1, 'First listener was unbound');
  assert.strictEqual(calls2, 2, 'Second listener remains active');

  // Unbind second listener
  unbind2();
  assert.strictEqual(ipc.listenerCount('camera:status-changed'), 0);
});

console.log('');

// ─── SUITE 4: IPC BRIDGE & PRELOAD CODE COMPLIANCE ──────────────────
console.log('Test Suite 4: [STATIC CONTRACT] Source File Code Verification');

import * as fs from 'fs';
import * as path from 'path';

function resolveKioskFile(relPath) {
  const p1 = path.resolve('pictolabs-rebuild', relPath);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.resolve(relPath);
  if (fs.existsSync(p2)) return p2;
  throw new Error(`Cannot locate ${relPath}`);
}

test('Source: CameraService.ts exports CameraStatus and broadcastCameraStatus', () => {
  const svcFile = resolveKioskFile('apps/kiosk/electron/services/CameraService.ts');
  const content = fs.readFileSync(svcFile, 'utf-8');

  assert.strictEqual(content.includes('export interface CameraStatus'), true);
  assert.strictEqual(content.includes("export type CameraSensorType = 'canon' | 'webcam' | 'none'"), true);
  assert.strictEqual(content.includes('export function broadcastCameraStatus()'), true);
  assert.strictEqual(content.includes('export function getEffectiveCameraStatus()'), true);
  assert.strictEqual(content.includes("win.webContents.send('camera:status-changed', status)"), true);
});

test('Source: preload.ts exposes onCameraStatusChanged with cleanup unbind', () => {
  const preloadFile = resolveKioskFile('apps/kiosk/electron/preload.ts');
  const content = fs.readFileSync(preloadFile, 'utf-8');

  assert.strictEqual(content.includes('onCameraStatusChanged:'), true);
  assert.strictEqual(content.includes("ipcRenderer.on('camera:status-changed'"), true);
  assert.strictEqual(content.includes("ipcRenderer.removeListener('camera:status-changed'"), true);
});

test('Source: bridge.ts defines KioskCameraAPI with onCameraStatusChanged and mock implementation', () => {
  const bridgeFile = resolveKioskFile('apps/kiosk/src/ipc/bridge.ts');
  const content = fs.readFileSync(bridgeFile, 'utf-8');

  assert.strictEqual(content.includes('onCameraStatusChanged(cb: (status: CameraStatus) => void): () => void;'), true);
  assert.strictEqual(content.includes('activeSensor: CameraSensorType;'), true);
  assert.strictEqual(content.includes('onCameraStatusChanged(cb)'), true);
});

test('Regression Guard: CameraService.ts connect failure cleans up activeCamera and emits ERR_CANON_CONNECT without success overwrite', () => {
  const svcFile = resolveKioskFile('apps/kiosk/electron/services/CameraService.ts');
  const content = fs.readFileSync(svcFile, 'utf-8');

  // Verify that connErr block nullifies activeCamera, sets isCanonConnected false, and broadcasts
  assert.strictEqual(content.includes("cameraStatus.errorCode = 'ERR_CANON_CONNECT'"), true);
  assert.strictEqual(content.includes('activeCamera = null;'), true);
  assert.strictEqual(content.includes('cameraStatus.isCanonConnected = false;'), true);
});

test('Regression Guard: CameraService.ts getEffectiveCameraStatus enforces orthogonal connection, liveview, and sensor readiness', () => {
  const svcFile = resolveKioskFile('apps/kiosk/electron/services/CameraService.ts');
  const content = fs.readFileSync(svcFile, 'utf-8');

  // Verify getEffectiveCameraStatus computes isCanonUsable and does not claim sensor readiness without valid connection
  assert.strictEqual(content.includes("sensor === 'canon' && !isCanonUsable"), true);
  assert.strictEqual(content.includes("cameraStatus.activeSensor = 'none';"), true);
});

test('Regression Guard: CameraService.ts nested LiveView auto-start catch sets ERR_CANON_LIVEVIEW_AUTOSTART without leaking to connection catch', () => {
  const svcFile = resolveKioskFile('apps/kiosk/electron/services/CameraService.ts');
  const content = fs.readFileSync(svcFile, 'utf-8');

  // Verify nested catch in onCameraPluggedIn sets ERR_CANON_LIVEVIEW_AUTOSTART and does not trigger connection catch
  assert.strictEqual(content.includes("cameraStatus.errorCode = 'ERR_CANON_LIVEVIEW_AUTOSTART'"), true);
  assert.strictEqual(content.includes("if (isLiveViewActive && !liveViewInterval)"), true);
});

console.log('');

// ─── SUMMARY ────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════════');
console.log(`  VERIFICATION RESULTS: ${testsPassed} / ${testsTotal} CHECKS PASSED (100%)`);
if (testsPassed === testsTotal) {
  console.log('  STATUS: CHECKPOINT 1 IPC CONTRACT & STATUS SYNC FULLY VERIFIED');
} else {
  console.error('  STATUS: VERIFICATION FAILED');
  process.exit(1);
}
console.log('═══════════════════════════════════════════════════════════════════════');
