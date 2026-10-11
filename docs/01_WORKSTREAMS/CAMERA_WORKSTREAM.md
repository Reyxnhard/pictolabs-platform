# CAMERA WORKSTREAM CONTEXT

## 1. Purpose
The Camera Workstream governs image acquisition, live framing, sensor triggering, and image pipeline lifecycle for Pictolabs photobooths. It interfaces with Canon EOS DSLR hardware via native C++ bindings, provides WebRTC camera fallback, manages real-time LiveView streams, and guarantees zero session data leakage between consecutive customers.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Native Canon EDSDK 13.x Core** | `AUTOMATED_VERIFIED` | Direct C++ DLL binding compiled for Electron main process. |
| **DSLR Shutter & Capture Pipeline** | `AUTOMATED_VERIFIED` | High-resolution capture at 300 DPI with orientation correction. |
| **WebRTC Fallback Mode** | `AUTOMATED_VERIFIED` | Engages webcam when DSLR is disconnected or unpowered. |
| **Camera Disconnect / Reconnect Recovery** | `AUTOMATED_VERIFIED` | Hot-plug listener re-establishes EDSDK session automatically. |
| **Session Isolation & Buffer Purge (P0 Fix)** | `AUTOMATED_VERIFIED` | Commit `c2ec517` verified via 23/23 automated test checks. |
| **Session Isolation Founder Physical UAT** | `FOUNDER_UAT_VERIFIED` | Physical USB disconnect test on Booth #1 hardware PASS. |
| **Preview ↔ Capture Consistency** | `FOUNDER_UAT_VERIFIED` | Resolved via CAMERA-01 Checkpoints 1 & 2; sensor parity, real-image capture, SD baseline freshness, and Founder Physical UAT PASS. |
| **Multi-Camera Device Selector** | `NOT_STARTED` | Future operator UI for multi-camera booths (PR-03). |
| **In-App Camera Settings (ISO/Shutter)** | `NOT_STARTED` | Planned for remote administrative calibration (PR-03). |
| **Mirrorless SDK Support** | `NOT_STARTED` | Post-pilot roadmap item. |

## 3. Completed / Verified
- **Implemented:** Native C++ EDSDK integration in [`CameraService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts), deterministic session teardown in [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx) and [`WelcomeScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/WelcomeScreen.tsx), buffer sanitization on disconnect, and typed IPC status contract.
- **Automated Verified:**
  - 23/23 tests passing in `scripts/run_camera_failure_session_isolation_verification.mjs`.
  - 21/21 tests passing in `scripts/test_camera01_checkpoint1_ipc_status.mjs`.
  - 27/27 tests passing in `scripts/test_camera01_checkpoint2_capture_pipeline.mjs`.
  - 18/18 checks passing in `scripts/run_camera01_checkpoint2_runtime_verification.mjs`.
  - Zero TypeScript compiler errors (`tsc --noEmit`, `tsc -p tsconfig.electron.json`).
  - Production build verified in `apps/kiosk`.
- **Founder Physical UAT:** All 5 physical scenarios on Booth #1 verified PASS:
  1. DSLR normal capture & high-res print.
  2. Live USB cable pull during countdown (clean failover to webcam, zero synthetic blue images).
  3. USB hot-plug reconnect (auto-resumes Canon LiveView without double timers).
  4. Lens cap AF failure test (clean failure handling, zero stale SD reads).
  5. 30-minute standby keep-alive heartbeat (`ExtendShutDownTimer` prevents camera sleep).
- **Production Verified:** Studio photobooth core capture flow verified in staging environment.

## 4. Current Architecture
The camera system operates via a dual-mode hybrid architecture:
1. **Primary Mode (DSLR):** Electron main process spawns native EDSDK worker communicating over IPC bridge (`kiosk.camera`). LiveView stream is pushed as base64 JPEG buffers to React canvas at 24–30 FPS.
2. **Fallback Mode (WebRTC):** If no Canon frame arrives within 2,000ms or Canon disconnects, [`CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx) engages WebRTC `getUserMedia` to render standard webcam video and synchronizes status via `notifyWebcamReady`.
3. **Sensor Parity Enforcement:** When the active sensor is `'webcam'`, shutter captures directly from the HTML5 video element via canvas snapshot; main process refuses physical Canon shutter actuation.
4. **Session Teardown:** On session completion, `resetSession()` triggers `kiosk.camera.resetSession()`, setting `lastLiveViewDataUrl = null` and clearing local frame buffers.

## 5. Current Invariants
- **Continuous AC Power Coupler:** Canon EOS DSLR continuous booth operation requires the documented ACK-E10 continuous AC power coupler adapter (DR-E10 DC coupler) with the camera battery door snapped shut completely. Operating on internal LP-E10 battery is strictly prohibited as it triggers auto-power-down sleep after 30 minutes, halting photobooth operations.
- **Sensor Synchronization (Parity Rule):** Preview camera and capture camera MUST represent the identical physical camera sensor unless an explicit fallback transition is accepted by the user.
- **Real-Image Only:** Customer sessions must never generate synthetic blue images (`generateTestImage()`). Failed captures must fail safely without advancing pose.
- **SD-Card Freshness:** Mode B card scans must verify candidates against pre-shutter baseline, accept only positive-size JPEGs, and never download stale files.
- **Buffer Sanitization:** `CameraService.ts` MUST clear `lastLiveViewDataUrl` immediately upon camera disconnect; frozen frames must never be displayed to subsequent customers.
- **Zero Data Leakage:** Sesi baru selalu mulai dari `photos = []` dan `currentPose = 1`; sesi pelanggan lama tidak boleh mewariskan foto apa pun ke sesi berikutnya.
- **Isolated Recovery:** Crash recovery must only load existing photos if `isRecovered === true` is explicitly asserted by [`RecoveryLedgerService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/RecoveryLedgerService.ts).

## 6. Known Open Issues
- **Resolved in CAMERA-01:** Historical Preview ↔ Capture Mismatch resolved across Checkpoints 1 & 2.
- **Planned Next (PR-03):** Admin Panel camera device selection UI and in-app exposure settings (ISO, shutter speed).
- **Deferred / Post-Pilot:** Mirrorless Canon SDK and multi-camera physical switching.

## 7. Next Task
Proceed to **`PR-03 — Camera Selection & Configuration`** (Admin Panel camera selector UI, capability detection, and exposure controls per booth).

## 8. Evidence
1. [`docs/02_EVIDENCE/RCA/CAMERA_RELIABILITY_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/CAMERA_RELIABILITY_RCA.md) — Root cause analysis & Checkpoint 1/2 closure report.
2. [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md) — Surgical fix report (23/23 tests pass).
3. Commit `b9a6b26` (*"fix(camera01): correct camera status transitions and reconnect handling"*).
4. Automated verification scripts: `test_camera01_checkpoint1_ipc_status.mjs`, `test_camera01_checkpoint2_capture_pipeline.mjs`, `run_camera01_checkpoint2_runtime_verification.mjs`.

## 9. Related Workstreams
- **Kiosk Hardening:** USB disconnect recovery depends on supervisor process stability.
- **Storage:** Capture outputs directly feed Sharp composite rendering and R2 uploads.
- **Session History:** Session photo isolation directly protects customer privacy in history archives.

## 10. Status Confidence
**HIGH.** Ground truth code, automated test suites (89 checks), real Electron runtime, and Founder Physical UAT on Booth #1 hardware are completely verified.
