# PICTOLABS — EXISTING TIMELINE & STATUS MAPPING REPORT

> **Document Type:** Multi-Workstream Documentary Status Mapping & Evidence Verification  
> **Target Scope:** Entire Pictolabs Kiosk, Backend, Dashboard, and Operational Layer  
> **Standard:** Strict Evidentiary Mapping (Documentary Claims vs Code Evidence vs Physical UAT)  
> **Rule:** This is NOT a new Master Timeline. It maps what EXISTING documentation currently claims without inventing consensus where evidence is conflicted.  
> **Date:** October 6, 2026  
> **Status:** OFFICIAL RECONCILIATION AUDIT (Antigravity Core)  

---

## 1. Executive Workstream Status Overview

This mapping contrasts historical documentary claims against actual executable code, test suites, and physical UAT evidence across 10 core subsystems. Confidence levels are assigned strictly based on empirical evidence:
- **`HIGH`**: Implementation and physical Founder UAT evidence match documentary claims.
- **`MEDIUM`**: Code and automated tests exist and pass, but physical hardware UAT or production deployment is pending.
- **`LOW`**: Conceptual documentation exists, but implementation code is missing or minimal.
- **`CONFLICTED`**: Multiple documents or document-vs-code evidence directly contradict each other.

| # | Workstream | Primary Documentary Claims | Repository Code Evidence | Verified Test / UAT Evidence | Unresolved Discrepancy | Confidence Level |
|---|---|---|---|---|---|:---:|
| 1 | **Core Kiosk Journey** | 8-screen loop fully functional, crash-resilient | `apps/kiosk/src/screens/` (Welcome to QR) | 100% customer flow regression pass | None | **`HIGH`** |
| 2 | **Camera Subsystem** | Camera ~95% complete; preview/capture bug deferred | Canon EDSDK binding, WebRTC fallback | Canon shutter <250ms tested; preview mismatch confirmed | Master Timeline v3 self-contradiction on preview bug priority | **`CONFLICTED`** |
| 3 | **Printer Execution** | Printer failure handling V2 / RCA-7 Founder UAT PASS | `print.exe` direct GDI dispatch, decoupled GIF | Automated PRN suite 49/49 PASS; Setup.exe built | Timeline v3 claims Founder UAT passed, but hardware test is pending | **`CONFLICTED`** |
| 4 | **Session History** | Phase 1–2 CLOSED; Phase 3 Dashboard NOT STARTED | SQLite history, 50-grid UI, debounce reprint | Founder Physical UAT PASS (all 9 scenarios, Oct 1) | Phase 3 dashboard archive exists; only WebSocket dispatch unstarted | **`HIGH`** |
| 5 | **Upload & Cloud Storage** | Cloudflare R2 direct presigned upload, dual retention | `storage.service.ts`, `SyncEngine.ts` | 30/30 assertions in `storage.e2e.ts`, Founder UAT pass | Dedicated production network outage stress test pending | **`HIGH`** |
| 6 | **Payment / Midtrans** | Midtrans QRIS 100% complete; sandbox verified | `payments.service.ts` REST API, webhook SHA-512 | 20/20 in `payments.e2e.ts`, Offline bypass Founder UAT | Production merchant approval, live keys, real banking test missing | **`MEDIUM`** |
| 7 | **Fleet & Provisioning** | Base32 token pairing, DPAPI `%ProgramData%` identity | `IdentityService.ts`, `provisioning.service.ts` | 11/11 in `fleet-provisioning.spec.ts`, single booth UAT | Multi-booth concurrency (5–10 booths) unproven physically | **`HIGH` (1 booth)**<br>**`LOW` (5-10 booths)** |
| 8 | **Operational Dashboard** | Sprints 5A, 5B, 5C complete (auth, health, support) | React dashboard (`/login`, `/sessions`, `/support`) | 100% pass on `sessions.e2e.ts` and `sprint5c.e2e.ts` | Live WhatsApp BSP gateway & Resend live API key pending | **`MEDIUM`** |
| 9 | **Windows Kiosk Hardening**| OS lockdown, watchdog supervisor, BIOS power check | `lockdown-kiosk.ps1`, `watchdog-kiosk.ps1` | 10/10 escape vector tests in simulation | Physical execution on real Windows 10/11 IoT hardware pending | **`MEDIUM`** |
| 10 | **Dynamic Frame CMS** | Master blueprint lists remote frame catalog | Hardcoded in `FRAME_DESIGNS` array in TypeScript | Zero test evidence; zero REST endpoints | Blueprint claims dynamic catalog, but code is completely hardcoded | **`LOW`** |

---

## 2. Workstream 1: Core Kiosk Loop & Screen State Machine

### What Existing Documents Claim:
- `PICTOLABS_MASTER_BLUEPRINT.md` and `MASTER_PROJECT_STATUS.md` describe an 8-screen touchscreen journey: `WelcomeScreen` $\rightarrow$ `ProductSelectScreen` $\rightarrow$ `PaymentScreen` $\rightarrow$ `CaptureScreen` $\rightarrow$ `FilterScreen` $\rightarrow$ `RenderScreen` $\rightarrow$ `PrintScreen` $\rightarrow$ `QRScreen`.
- Navigation concurrency locks (`isNavigatingRef`, `isProcessingRef`) prevent double-clicks and race conditions.

### Current Implementation Evidence:
- Verified in `apps/kiosk/src/screens/`:
  - `WelcomeScreen.tsx`: Discreet staff button, `resetSession()` fail-safe interlock.
  - `ProductSelectScreen.tsx`: 2R Photostrip, 4R Wide, Postcard layout selection.
  - `PaymentScreen.tsx`: Dynamic QRIS display, 270s countdown timer, auto-advance on settlement.
  - `CaptureScreen.tsx`: 30 FPS Canvas LiveView, countdown, shutter flash, post-capture review (Retake/Next).
  - `FilterScreen.tsx`: Preset color filters (Normal, B&W, Warm, Cool, Sepia, Vivid).
  - `RenderScreen.tsx`: Sharp 300 DPI composite layout processing (1200x1800 px).
  - `PrintScreen.tsx`: Spooler dispatch animation and status feedback.
  - `QRScreen.tsx`: Softfile QR download code, 60s timeout, auto-session reset.

### Current Test & UAT Evidence:
- Full customer flow validated repeatedly in Founder UAT (Sep 14, Sep 24, Oct 1).
- Customer data isolation verified across sessions (23/23 tests pass).

### Unresolved Discrepancies:
- None. Core loop is stable and regression-tested.

### Confidence Level:
**`HIGH`**

---

## 3. Workstream 2: Camera Subsystem & Optical Pipeline

### What Existing Documents Claim:
- Master Timeline v3 Section 14 claims the Camera Core is "STABLE / ~95% complete".
- Sections 3 and 12 define new requirements: Camera Device Selector, in-app Camera Settings (ISO, shutter, aperture, WB), and Preview $\leftrightarrow$ Capture Consistency.
- Section 16 lists "camera source synchronization bug" as "Non-Blocking / Deferred Backlog".

### Current Implementation Evidence:
- **Canon EDSDK Engine:** `CameraService.ts` wraps `@photolab/canon` native C++ addon. Keep-alive heartbeat (10s), auto-reconnect poller (1.5s), and 3-tier capture (USB event, SD card volume scan, LiveView buffer) exist in code.
- **WebRTC Viewfinder Fallback:** `CaptureScreen.tsx:112-147` initiates `getUserMedia` fallback after 2,000 ms timeout.
- **Preview $\leftrightarrow$ Capture Mismatch Bug:** Empirically verified in code:
  - Viewfinder switches to webcam if Canon LiveView frame is delayed >2s.
  - When countdown ends, `takePhoto()` unconditionally commands Canon DSLR shutter via IPC (`CaptureScreen.tsx:451`).
  - Customer poses for webcam, but DSLR captures photo.
- **In-App Camera Settings:** Zero UI controls, zero IPC channels, and zero EDSDK property setter methods exist for ISO, shutter speed, aperture, or white balance.
- **Device Selector:** Zero code exists for selecting between DSLR, mirrorless, and webcam.

### Current Test & UAT Evidence:
- Canon EOS 60D physical shutter tested (<250ms release latency).
- Camera failure session isolation verified in simulation (`scripts/run_camera_failure_session_isolation_verification.mjs`, 23/23 pass).

### Unresolved Discrepancies:
- **Timeline v3 Contradiction:** Timeline v3 lists the camera preview $\leftrightarrow$ capture sync bug as both "Deferred Non-Blocking" (Section 16) and "Active Reliability Requirement" (Section 3).
- **Settings Reality Gap:** Timeline implies camera management is nearly ready, but settings and device selector are completely unbuilt.

### Confidence Level:
**`CONFLICTED`** (Core shutter is `HIGH`, but settings and preview-sync are `LOW` / `CONFLICTED`).

---

## 4. Workstream 3: Printer Pipeline & Failure Handling

### What Existing Documents Claim:
- `PICTOLABS_PILOT_READINESS_TIMELINE_v3.md` (Lines 104, 391) claims Printer Failure Handling V2 / RCA-7 is "IMPLEMENTED + FOUNDER UAT PASS", with only formal VPS release closure pending.
- `PRINTER_FAILURE_HANDLING_V2_RCA_7.md` documents that V7 UAT found a 20–40s print latency and CIM driver lockups, leading to the RCA-7 Simplification Plan.

### Current Implementation Evidence:
- Commit `787b95d` implemented the simplification:
  - Decoupled GIF generation to background.
  - Direct `print.exe` GDI dispatch to active Windows printer queue.
  - Redefined `COMPLETED` = *Print Dispatch / Windows Spooler Accepted* (`print.exe` exit code 0).
  - Watchdog marks orphaned/stalled jobs as terminal `DEAD_LETTER` (never resets to `PENDING` to prevent duplicate prints).
  - Standalone installer `Pictolabs Kiosk Setup 1.0.0.exe` built.

### Current Test & UAT Evidence:
- Automated PRN hardening suite: 49/49 assertions PASS.
- RCA-6 regression suite: PASS.
- **Founder Physical Hardware UAT on the physical DNP DS-RX1 printer using the new standalone installer has NOT been executed or logged**.

### Unresolved Discrepancies:
- Timeline v3 prematurely declared "Founder Physical UAT passed" for RCA-7, when in reality Founder V7 UAT was what *discovered* the problem, and physical re-testing of the fix is still pending.

### Confidence Level:
**`CONFLICTED`** (Automated implementation is `HIGH`, but physical hardware signoff is `PENDING`).

---

## 5. Workstream 4: Session History Center

### What Existing Documents Claim:
- `SESSION_HISTORY_CENTER_PRD.md` defines Phase 1 (IPC & SQLite query), Phase 2 (Kiosk Touch UI), Phase 3 (Cloud Dashboard Integration & Remote Reprint), and Phase 4 (E2E Verification).
- Timeline v3 states: "Session History Phase 1–2 CLOSED / Dashboard Phase 3 NOT STARTED".

### Current Implementation Evidence:
- **Phase 1 & 2 (Kiosk Edge):** `SessionHistorySection.tsx` inside `AdminScreen.tsx`. 50-session history grid, high-res preview modal, 1x/2x physical reprint with debounce protection, offline HOT reprint, automatic upload, manual Force Upload.
- **Base64 Payload Fix:** Commit `dc8c931` stripped raw DSLR Base64 strings from metadata payloads, fixing upload timeouts.
- **Phase 3 (Dashboard):** `SessionsPage.tsx` and `SupportSearchPage.tsx` exist in `apps/dashboard`, querying PostgreSQL sessions with filters. Only **remote reprint dispatch over live WebSocket** is unbuilt.

### Current Test & UAT Evidence:
- Founder Physical UAT on October 1, 2026: **PASS on all 9 test scenarios** (1x reprint, 2x reprint, double-tap debounce, offline HOT reprint, automatic upload, Force Upload, watchdog stability).

### Unresolved Discrepancies:
- Minor: Timeline v3 states Dashboard Phase 3 is "NOT STARTED", but the web dashboard sessions archive is already operational. Only the WebSocket remote reprint trigger is missing.

### Confidence Level:
**`HIGH`** (Phase 1–2 is genuinely CLOSED).

---

## 6. Workstream 5: Cloud Storage & Media Retention (Cloudflare R2)

### What Existing Documents Claim:
- Sprint 3 Review claims 100% completion of Cloudflare R2 direct presigned upload, offline-first upload queue, dual-tier retention (7-day local, 30-day cloud), and graceful expiration notice (HTTP 200).

### Current Implementation Evidence:
- `storage.service.ts`: AWS S3 SDK v3 client connecting to Cloudflare R2. Presigned PUT generation (15m TTL). Local storage fallback if credentials missing.
- `SyncEngine.ts`: SQLite `upload_queue` in WAL mode, exponential backoff worker (2s–32s) processing uploads every 4 seconds.
- `StorageRetentionService.ts`: Daily daemon purging local media >7 days only if `status === 'COMPLETED'`. Emergency safeguard purges oldest completed media if SSD < 5 GB.
- `gallery.controller.ts`: Mobile-first responsive web gallery, streaming ZIP download (`archiver`), and 30-day HTTP 200 graceful expiration notice.

### Current Test & UAT Evidence:
- Automated test suite `storage.e2e.ts`: 30/30 assertions PASS.
- Founder Physical UAT (Oct 1): Automatic upload and Force Upload PASS.

### Unresolved Discrepancies:
- Dedicated internet outage stress testing on live production R2 bucket with custom domain (`cdn.pictolabs.id`) remains to be validated.

### Confidence Level:
**`HIGH`**

---

## 7. Workstream 6: Payment & Financial Infrastructure (Midtrans)

### What Existing Documents Claim:
- Sprint 2 Review claims Midtrans Dynamic QRIS is 100% complete and production-ready.
- Master Timeline v3 states: "Real Midtrans Sandbox: OPEN — SANDBOX / PRODUCTION VERIFICATION".

### Current Implementation Evidence:
- `payments.service.ts`: REST API Midtrans Core API `/v2/charge`. Generates Dynamic QRIS barcodes.
- `payments.service.ts:168`: Webhook listener with SHA-512 cryptographic signature check (`order_id + status_code + gross_amount + ServerKey`).
- `KioskGateway`: WebSocket `payment:settled` broadcast providing <120ms auto-advance to `FrameDesignScreen`. Fallback polling (3s) in `PaymentScreen.tsx`.
- `AdminScreen.tsx`: Offline Payment Bypass toggle.
- **Production Status:** Code is currently running on **Midtrans Sandbox keys** (`MIDTRANS_IS_PRODUCTION=false`).

### Current Test & UAT Evidence:
- Automated E2E test suite `payments.e2e.ts`: 20/20 assertions PASS.
- Offline Payment Bypass Founder UAT: PASS (4/4 scenarios).
- **Live production merchant account onboarding, live server keys, and live banking settlement verification have NOT taken place**.

### Unresolved Discrepancies:
- Divergence between claims of "100% complete" vs sandbox reality. Production merchant onboarding is pending.

### Confidence Level:
**`MEDIUM`** (Sandbox is `HIGH`, Production Readiness is `OPEN / HARDENING`).

---

## 8. Workstream 7: Fleet Management & Hardware Provisioning

### What Existing Documents Claim:
- Phase 3.3 Completion Report claims full fleet provisioning, Base32 pairing tokens, DPAPI identity, and Single-Socket gateway isolation.

### Current Implementation Evidence:
- `provisioning.service.ts`: Generates human-friendly Base32 pairing tokens (`ACT-XXXX-XXXX`, 15m TTL). Enforces 5-attempt brute-force rate limit per IP. Atomic `POST /api/provisioning/activate` issues 256-bit `deviceSecret`.
- `IdentityService.ts`: Stores encrypted `deviceSecret` in `%ProgramData%\Pictolabs\identity.json` using Windows DPAPI via Electron `safeStorage`. Synchronously mirrors to SQLite `kiosk_identity`.
- `ActivationScreen.tsx`: On-screen 8-character touch keypad for entering activation tokens.
- `KioskGateway`: Single-Socket Connection Policy automatically severs older sockets with `DUPLICATE_DEVICE_SESSION`.
- `BoothsService.recordHeartbeat`: Server-side derived availability status (`ONLINE`, `DEGRADED`, `OFFLINE`, `MAINTENANCE`).

### Current Test & UAT Evidence:
- `fleet-provisioning.spec.ts`: 11/11 assertions PASS.
- `PROVISIONING_UAT_REPORT.md`: Pairing verified on physical kiosk hardware.

### Unresolved Discrepancies:
- Fleet foundation is proven for a single booth. Physical concurrency across 5–10 simultaneous booths has not been validated.

### Confidence Level:
**`HIGH` (Single Booth)** / **`LOW` (5–10 Booth Scale)**

---

## 9. Workstream 8: Operational Support & Cloud Dashboard

### What Existing Documents Claim:
- Sprint 5A, 5B, 5C reviews claim full operational dashboard: Overview KPI cards, Booth detail drawers, Sessions search, Customer support center, Resend email delivery, WhatsApp alerts.

### Current Implementation Evidence:
- `apps/dashboard`:
  - `LoginPage.tsx`: Glassmorphic auth gate, Single Admin model (`admin@pictolabs.id`), JWT in `localStorage`.
  - `OverviewPage.tsx`: Real-time KPI cards (Online, Offline, Maintenance, Sessions Today).
  - `BoothsPage.tsx` & `BoothDetailDrawer.tsx`: Fleet listing, runtime specs, maintenance mode toggle.
  - `SessionsPage.tsx`: Paginated sessions table, filter by booth/branch/date/status.
  - `SupportSearchPage.tsx`: Multi-channel search by customer email, phone, order ID.
  - `BoothHealthCard.tsx`: 5-pillar health telemetry (Camera, Printer, Storage, Heartbeat, Payment).
- `apps/backend`:
  - `email.service.ts`: Resend API integration with responsive HTML photostrip template and 3/hr rate-limit.
  - `alert.service.ts`: WhatsApp alert router with 15-minute anti-spam cooldown.

### Current Test & UAT Evidence:
- Automated test suites: `sessions.e2e.ts` (100% pass), `sprint5c.e2e.ts` (100% pass).
- Founder UAT Sprint 5B verified with live screenshots.

### Unresolved Discrepancies:
- Email and WhatsApp services are operating in console fallback/mock mode awaiting live production API keys.

### Confidence Level:
**`MEDIUM`** (UI and architecture are `HIGH`, live third-party delivery is `PENDING`).

---

## 10. Workstream 9: Windows Kiosk Hardening & OS Lockdown

### What Existing Documents Claim:
- Sprint 5E Revision v2 claims 10/10 escape vectors hardened on Windows 10/11 IoT.
- Custom shell replacement, gesture blocking, supervisor watchdog daemon, and BIOS auto-power check.

### Current Implementation Evidence:
- `scripts/lockdown-kiosk.ps1`:
  - Disables edge swipe (`AllowEdgeSwipe = 0`).
  - Disables Action Center (`DisableNotificationCenter = 1`, `ToastEnabled = 0`).
  - Disables Windows widgets (`AllowNewsAndInterests = 0`).
  - Disables multi-touch gestures (`TurnOffMultitouch = 1`).
  - Configures Winlogon Shell to launch `Pictolabs.exe` instead of `explorer.exe`.
  - Blocks Task Manager and Windows hotkeys (`DisableTaskMgr = 1`, `NoWinKeys = 1`).
- `scripts/watchdog-kiosk.ps1`: 2-second polling supervisor restarting application in <3s on unexpected crash.
- `scripts/bios-power-check.ps1`: Checklist for BIOS AC Restore `Always On` and Fast Startup disabling.

### Current Test & UAT Evidence:
- Automated verification script `test-escape-matrix.ps1`: **10/10 test vectors PASS (ET-01 to ET-10)** in simulated test environment.

### Unresolved Discrepancies:
- Scripts have not been executed on the physical production kiosk hardware for Booth #1.

### Confidence Level:
**`MEDIUM`** (Scripts verified in automated tests; physical deployment pending).

---

## 11. Workstream 10: Dynamic Frame Management & Media CMS

### What Existing Documents Claim:
- `PICTOLABS_MASTER_BLUEPRINT.md` and `MASTER_PROJECT_STATUS.md` describe remote frame configuration and catalog updates from the Cloud Dashboard.

### Current Implementation Evidence:
- In `apps/kiosk/src/screens/FrameDesignScreen.tsx`, frame designs are **hardcoded in a static TypeScript array (`FRAME_DESIGNS`)**:
  - Photostrip 2R (Classic Black, Minimal White, Retro Cream).
  - Wide 4R Grid.
- There is **no web frame editor, no PNG asset uploader, and no dynamic REST API** for managing frame templates.

### Current Test & UAT Evidence:
- Zero automated tests for dynamic frame management.

### Unresolved Discrepancies:
- Complete disconnect between high-level architectural blueprint and actual implementation reality.

### Confidence Level:
**`LOW`** (Hardcoded templates work, but dynamic CMS is `NOT STARTED`).

---
*Report compiled and certified by Antigravity Core Engineering.*  
*Zero speculative claims. All assessments backed strictly by repository code and test artifacts.*
