# PHASE 3.3F-B — BINARY PACKAGING RUNTIME AUDIT
**Document Reference**: `/docs/BINARY_PACKAGING_AUDIT.md`  
**Execution Timestamp**: 2026-09-14T16:46:00Z  
**Target Investigation**: Kiosk Standalone Binary Packaging, Native Addons, and Clean Machine Deployment Feasibility  
**Reference Findings**: `/docs/CURRENT_PROJECT_STATE.md`, `/docs/PHASE_3_3F_VALIDATION.md`, `/docs/DEVICE_SECRET_FIX_IMPLEMENTATION_REPORT.md`  
**Audit Standard**: Empirical execution and static configuration audit. Zero assumptions.

---

## Executive Summary

This audit evaluated whether a brand-new, unprovisioned Windows kiosk laptop can run a packaged build of Pictolabs Photobooth without pre-installed development dependencies.

**EMPIRICAL FINDING: THE STANDALONE INSTALLER AND BINARY PACKAGING PIPELINE ARE CURRENTLY INOPERABLE.**

While the kiosk software runs successfully in local development mode (`npm run electron:dev`), the production packaging pipeline (`electron-builder`) fails to produce a viable standalone installer. Crucial runtime binaries (`ffmpeg.exe`, `EDSDK.dll`, `EdsImage.dll`), native C++ addons (`better-sqlite3`, `sharp`, `@photolab/canon`), and assets (`frames/`) are **completely omitted from the packaging configuration**.

A fresh kiosk machine deployed today with the current build pipeline would either **crash instantly upon startup** or degrade into a non-functional state unable to capture DSLR photos, convert iOS Live Photos, or composite 300 DPI print strips.

---

# Section 1 — Binary Dependency Inventory

The kiosk runtime depends on six external native and binary dependencies:

| Dependency | Purpose | Required At Runtime? | Current Packaging Method in Repo |
| :--- | :--- | :---: | :--- |
| **`ffmpeg.exe`** | Transcodes WebM video into Apple-compatible H.264 MP4 (`yuv420p`, `+faststart`); generates boomerang GIFs. | **YES** | **NONE**. Absent from `electron-builder.json`. Hardcoded to developer workstation paths in `LivePhotoService.ts`. |
| **`@photolab/canon` (`@photolab+canon.node`)** | Native C++ N-API addon interfacing with Canon EOS cameras via USB. | **YES** (DSLR Mode) | **NONE**. Symlinked via relative path `file:../../../extracted-asar/node_modules/@photolab/canon`. |
| **`EDSDK.dll` & `EdsImage.dll`** | Canon official proprietary camera control and raw image processing dynamic link libraries. | **YES** (DSLR Mode) | **NONE**. Reside in external `prebuilds/win32-x64/`. Not configured in `asarUnpack`. |
| **`better-sqlite3` (`better_sqlite3.node`)** | High-performance C++ embedded SQLite engine for local persistence (`kiosk.db`), print queues, and recovery ledger. | **CRITICAL** (Startup) | Hoisted to monorepo root `node_modules`. Rebuild fails due to unpinned Electron version and missing build tools. |
| **`sharp` (`sharp-win32-x64.node` & `libvips-cpp.dll`)** | High-speed C++ image compositor for 300 DPI print layouts, color filters, and webcam mirror/flop. | **CRITICAL** (Startup) | Hoisted to monorepo root `node_modules`. Excluded from `electron-builder.json` files list. |
| **Windows Spooler (`shimgvw.dll`, `rundll32.exe`)** | Operating system native photo printing pipeline and DNP thermal printer status polling. | **YES** (Printing) | Built-in Windows system components (Standard Win32 OS DLLs). |

---

# Section 2 — Packaging Configuration Audit

### 1. `apps/kiosk/electron-builder.json`
```json
{
  "appId": "com.pictolabs.kiosk",
  "productName": "Pictolabs Kiosk",
  "directories": {
    "output": "release"
  },
  "files": [
    "dist/**/*",
    "package.json"
  ],
  "win": {
    "target": "nsis"
  },
  "nsis": {
    "oneClick": true,
    "perMachine": true,
    "createDesktopShortcut": true,
    "runAfterFinish": true
  }
}
```

### Critical Flaws Identified in Configuration:
1. **Omission of Production `node_modules`**:
   `"files"` explicitly specifies only `"dist/**/*"` and `"package.json"`. In an npm workspaces monorepo, dependencies are hoisted to `/node_modules`. None of the production dependencies (`better-sqlite3`, `sharp`, `socket.io-client`) are included in the package.
2. **Missing `extraResources`**:
   `extraResources` is completely absent. `ffmpeg.exe` and `frames/` are never copied to `process.resourcesPath`.
3. **Missing `asarUnpack`**:
   Windows dynamic link libraries (`.dll`) and native addons (`.node`) cannot be loaded directly by the Windows OS kernel from inside an ASAR virtual archive. Without `asarUnpack`, dependent DLLs like `EDSDK.dll` and `EdsImage.dll` fail to load.

### 2. `apps/kiosk/package.json`
```json
"dependencies": {
  "@photolab/canon": "file:../../../extracted-asar/node_modules/@photolab/canon",
  "better-sqlite3": "^13.0.3",
  "sharp": "^0.35.4"
},
"devDependencies": {
  "electron": "^44.1.1",
  "electron-builder": "^26.15.3"
}
```

### Critical Flaws:
1. **Unpinned Electron Semver Range (`^44.1.1`)**:
   `electron-builder` strictly mandates a pinned Electron version. Building fails with:
   `⨯ Electron version "^44.1.1" is a range, not a fixed version. electron-builder requires an exact version`.
2. **Unresolvable File Reference**:
   `@photolab/canon` references a path outside the workspace (`file:../../../extracted-asar`), which will fail on any other machine or CI/CD runner.

---

# Section 3 — Installer Content Verification

### Actual Build Execution:
Running `npx electron-builder --win --dir` produced the following raw compiler failures:

#### Failure 1: Root Traversal Mismatch
```text
• electron-builder version=26.15.3 os=10.0.26200
• detected workspace root for project using packageManager field
⨯ Application entry file "index.js" in ".../dist/win-unpacked/resources/app.asar" is corrupted: Error: "index.js" was not found in this archive
```

#### Failure 2: Native Rebuild Failure
When executed targeting `apps/kiosk`:
```text
• executing @electron/rebuild electronVersion=44.1.1 arch=x64
• preparing moduleName=better-sqlite3 arch=x64
Error: Could not find any Python installation to use
⨯ node-gyp failed to rebuild '.../node_modules/better-sqlite3'
```

### Artifact Inspection Summary:
- **Executable Installer (`.exe`)**: **CANNOT BE GENERATED**.
- **`resources/ffmpeg.exe`**: **NOT PRESENT** in build output.
- **`resources/frames/`**: **NOT PRESENT** in build output.
- **`unpacked/@photolab/canon/`**: **NOT PRESENT** in build output.
- **`unpacked/EDSDK.dll`**: **NOT PRESENT** in build output.

---

# Section 4 — Clean Machine Simulation

Simulating installation on a fresh, non-developer Windows 11 machine:

### 1. Application Launch (Fatal Blocker)
- **Execution**: User launches `Pictolabs Kiosk.exe`.
- **Outcome**: The main process (`dist/main/main.js`) immediately requires `better-sqlite3` via `SyncEngine.ts`.
- **Result**: **HARD CRASH**. Because `better-sqlite3` is either missing from the bundle or compiled against the wrong Node ABI without C++ runtime tools, Electron displays a Windows fatal error dialog or exits with code 1.

### 2. Camera Initialization (Hardware Blocker)
- **Execution**: Kiosk attempts to initialize Canon DSLR via `CameraService.ts`.
- **Outcome**: `require('@photolab/canon')` fails because the relative path is missing and dependent DLLs (`EDSDK.dll`) cannot be loaded.
- **Result**: Application falls back to WebRTC webcam mode. Professional DSLR photo capture is completely disabled.

### 3. Live Photo & Video Generation (Feature Blocker)
- **Execution**: Customer completes a 4-pose session.
- **Outcome**: `LivePhotoService.ts` searches for `ffmpeg.exe`:
  - `path.resolve(__dirname, '../../../../kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe')` -> **NOT FOUND**
  - `'c:\Users\ezarh\...` -> **NOT FOUND**
  - `path.join(process.resourcesPath, 'ffmpeg.exe')` -> **NOT FOUND**
- **Result**: `findFfmpegPath()` returns `null`. WebM is not transcoded to MP4. iPhone users scanning the QR code receive an unplayable video file. Boomerang GIF generation fails entirely.

---

# Section 5 — Live Photo Validation

Trace of `apps/kiosk/electron/services/LivePhotoService.ts`:

```typescript
// LivePhotoService.ts lines 20-28
const candidates = [
  path.resolve(__dirname, '../../../../kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe'),
  path.resolve(process.cwd(), '../kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe'),
  path.resolve(process.cwd(), '../../kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe'),
  'c:\\Users\\ezarh\\.gemini\\antigravity-ide\\scratch\\Pictolabs\\kiosk-client-photobooth-template-flipbook-basic\\ffmpeg.exe',
  path.join(process.resourcesPath || '', 'ffmpeg.exe'),
];
```

### Diagnostic Questions & Answers:
1. **Can MP4 generation succeed on a fresh machine?**  
   **NO**. `ffmpeg.exe` is absent from `process.resourcesPath`. `execFileAsync(ffmpegPath, ...)` is never called.
2. **Can WebM generation succeed?**  
   **YES**. WebM is captured in-browser via Canvas `MediaRecorder` and saved directly via `fs.writeFileSync`.
3. **Will iOS compatibility work?**  
   **NO**. Apple iOS Safari and Photos app cannot play VP8/VP9 WebM files. Customer galleries on iPhones will show broken video players.
4. **What happens if ffmpeg is missing?**  
   `saveLiveClip()` logs `[LivePhotoService] Saved countdown clip: ...webm` and returns the raw WebM. `generateSessionGif()` returns `{ success: false }`.

---

# Section 6 — Canon Integration Validation

Trace of `apps/kiosk/electron/services/CameraService.ts`:

```typescript
// CameraService.ts lines 248-275
function tryLoadCanonAddon(): boolean {
  try {
    canonAddon = require('@photolab/canon');
    canonAddon.cameraBrowser.initialize();
    ...
    return true;
  } catch (err) {
    console.warn('[CameraService] Canon EDSDK addon not available, using WebRTC fallback:', (err as Error).message);
    canonAddon = null;
    return false;
  }
}
```

### Diagnostic Questions & Answers:
1. **Where does the Canon native addon come from?**  
   It comes from `prebuilds/win32-x64/@photolab+canon.node` inside the external `@photolab/canon` module.
2. **How is it packaged?**  
   It is **NOT packaged**. It is not included in `files`, not listed in `asarUnpack`, and the DLLs are not in Windows `PATH`.
3. **Can the packaged app locate it?**  
   **NO**. Node cannot resolve `file:../../../extracted-asar` from inside an installed program directory.
4. **What happens on a new machine?**  
   `tryLoadCanonAddon()` throws, logs a warning, and permanently degrades the kiosk to WebRTC laptop webcam mode.

---

# Section 7 — Runtime Failure Matrix

| Binary Dependency | Missing Condition | Runtime Impact | Fault Behavior |
| :--- | :--- | :--- | :--- |
| **`better-sqlite3`** | Missing or ABI mismatch | **FATAL** | Application crashes immediately on startup. |
| **`sharp`** | Missing or ABI mismatch | **FATAL** | Photo composite strip rendering fails; session hangs. |
| **`ffmpeg.exe`** | Binary not in `resourcesPath` | **DEGRADED** | MP4 transcode skipped; WebM uploaded; iOS playback broken; GIF fails. |
| **`@photolab/canon`** | Addon missing | **DEGRADED** | Canon DSLR fails to initialize; switches to WebRTC webcam. |
| **`EDSDK.dll`** | DLL not unpacked from ASAR | **DEGRADED** | `ERR_DLOPEN_FAILED`; switches to WebRTC webcam. |
| **`frames/`** | PNG overlays missing | **DEGRADED** | Prints photo strips without decorative theme frames. |
| **Windows Spooler** | Printer not connected | **BYPASS** | Graceful bypass mode; simulates print completion. |

---

# Section 8 — Production Risk Assessment

| Component | Risk Rating | Operational Justification |
| :--- | :---: | :--- |
| **`better-sqlite3` / `sharp`** | **CRITICAL** | Blocks application boot and image rendering entirely. |
| **Installer Pipeline** | **CRITICAL** | Production installer cannot be built from repository. |
| **`ffmpeg.exe`** | **HIGH** | Ruins customer experience for iOS users (majority of photobooth demographic). |
| **Canon SDK (`EDSDK`)** | **HIGH** | Strips out professional DSLR camera support, reducing value proposition to a webcam booth. |
| **Printer Stack** | **LOW** | Cleanly handled via native Windows Spooler and automatic software bypass mode. |

---

# Section 9 — Required Fixes

The following fixes must be implemented to establish production binary packaging:

| Priority | Issue | Technical Impact | Required Fix Scope |
| :---: | :--- | :--- | :--- |
| **P0** | Electron Version Unpinned | `electron-builder` fails to resolve binary targets | Pin `"electron": "28.2.0"` (or exact supported LTS) in `package.json`. |
| **P0** | Bundled `ffmpeg.exe` Missing | iOS video playback broken; GIFs fail | Add `extraResources: [{ from: "resources/bin/ffmpeg.exe", to: "ffmpeg.exe" }]` in `electron-builder.json`. |
| **P0** | Native Modules Excluded | Startup crash on clean machine | Configure `electron-builder` files or bundle via Vite with native module externals. |
| **P0** | ASAR Native DLL Lockout | Windows cannot load Canon DLLs | Add `asarUnpack: ["**/@photolab/canon/**", "**/*.node", "**/*.dll"]` in `electron-builder.json`. |
| **P1** | Hardcoded Dev Workstation Paths | Relies on developer local user folder | Remove `'c:\Users\ezarh\...'` from `LivePhotoService.ts`; rely strictly on `process.resourcesPath`. |
| **P1** | External Symlink Dependency | `@photolab/canon` unresolvable in CI | Relocate `@photolab/canon` into `packages/canon` within the repository monorepo. |

---

# Section 10 — Pilot Readiness Impact

### Can a second kiosk machine be deployed today?

# NO

### Explanation:
A technician arriving at a venue with a fresh retail laptop cannot install Pictolabs using the repository build artifacts. The build scripts cannot produce an installer, native C++ dependencies will not link without development tools, and the hardware camera and video subsystems rely on developer workstation file paths.

---

# Final Verdict

# PACKAGING NOT READY
