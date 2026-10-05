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
| **Session Isolation Founder Physical UAT** | `FOUNDER_UAT_PENDING` | Physical USB disconnect test on Booth #1 hardware pending. |
| **Preview ↔ Capture Consistency** | `OPEN (KNOWN BUG)` | **ACTIVE RELIABILITY ISSUE (OPEN)** — Requires `CAMERA-01 RCA`. |
| **Multi-Camera Device Selector** | `NOT_STARTED` | Future operator UI for multi-camera booths. |
| **In-App Camera Settings (ISO/Shutter)** | `NOT_STARTED` | Planned for remote administrative calibration. |
| **Mirrorless SDK Support** | `NOT_STARTED` | Post-pilot roadmap item. |

## 3. Completed / Verified
- **Implemented:** Native C++ EDSDK integration in [`CameraService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts), deterministic session teardown in [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx) and [`WelcomeScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/WelcomeScreen.tsx), and buffer sanitization on disconnect.
- **Automated Verified:** 23/23 tests passing in `scripts/run_camera_failure_session_isolation_verification.mjs`; zero cross-session data leaks in SQLite or memory buffers.
- **Founder Physical UAT:** Normal capture flow verified; physical USB cable pull during live countdown pending.
- **Production Verified:** Studio photobooth core capture flow verified in staging environment.

## 4. Current Architecture
The camera system operates via a dual-mode hybrid architecture:
1. **Primary Mode (DSLR):** Electron main process spawns native EDSDK worker communicating over IPC bridge (`kiosk.camera`). LiveView stream is pushed as base64 JPEG buffers to React canvas at 24–30 FPS.
2. **Fallback Mode (WebRTC):** If no Canon frame arrives within 2,000ms, [`CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx) engages WebRTC `getUserMedia` to render standard webcam video.
3. **Session Teardown:** On session completion, `resetSession()` triggers `kiosk.camera.resetSession()`, setting `lastLiveViewDataUrl = null` and clearing local frame buffers.

## 5. Current Invariants
- **Continuous AC Power Coupler:** Canon EOS DSLR continuous booth operation requires the documented ACK-E10 continuous AC power coupler adapter (DR-E10 DC coupler) with the camera battery door snapped shut completely. Operating on internal LP-E10 battery is strictly prohibited as it triggers auto-power-down sleep after 30 minutes, halting photobooth operations.
- **Sensor Synchronization:** Preview camera and capture camera MUST represent the identical physical camera sensor unless an explicit fallback transition is accepted by the user.
- **Buffer Sanitization:** `CameraService.ts` MUST clear `lastLiveViewDataUrl` immediately upon camera disconnect; frozen frames must never be displayed to subsequent customers.
- **Zero Data Leakage:** Sesi baru selalu mulai dari `photos = []` dan `currentPose = 1`; sesi pelanggan lama tidak boleh mewariskan foto apa pun ke sesi berikutnya.
- **Isolated Recovery:** Crash recovery must only load existing photos if `isRecovered === true` is explicitly asserted by [`RecoveryLedgerService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/RecoveryLedgerService.ts).

## 6. Known Open Issues
- **Active Blocker / Reliability:** **Preview ↔ Capture Mismatch.** When Canon LiveView is delayed, the UI engages webcam preview for framing, but when the countdown reaches 0, the code in [`CaptureScreen.tsx:450-462`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L450-L462) unconditionally triggers native Canon shutter over IPC, resulting in customer looking at the wrong lens.
- **Deferred / Post-Pilot:** Manual exposure/ISO controls and in-kiosk device selection.

## 7. Next Task
Authorise and execute **`CAMERA-01 — Reliability RCA`** to synchronize preview source state with capture trigger target before public pilot launch.

## 8. Evidence
1. [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md) — Surgical fix report (23/23 tests pass).
2. [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md) — Root cause analysis of session data leakage.
3. [`docs/SPRINT_1_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_1_REVIEW.md) — Initial Canon EDSDK 13.x binding and LiveView worker proof.
4. Commit `c2ec517` (*"camera session failure fix"*).
5. Source file: [`apps/kiosk/src/screens/CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx).

## 9. Related Workstreams
- **Kiosk Hardening:** USB disconnect recovery depends on supervisor process stability.
- **Storage:** Capture outputs directly feed Sharp composite rendering and R2 uploads.
- **Session History:** Session photo isolation directly protects customer privacy in history archives.

## 10. Status Confidence
**HIGH.** Ground truth code and automated test scripts are completely verified in git history; open preview mismatch is precisely located with line citations.
