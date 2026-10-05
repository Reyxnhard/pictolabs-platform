# SPRINT 1 IMPLEMENTATION PLAN: HARDWARE RESILIENCE & CLOUD SYNC

> **Source of Truth**: [MASTER_PROJECT_STATUS.md](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/MASTER_PROJECT_STATUS.md)  
> **Target Version**: Pictolabs v1.0 Enterprise  
> **Sprint Scope**: Focus ONLY on the 4 foundational resilience items:  
> 1. Replace `sessions.json` with SQLite (`better-sqlite3`)  
> 2. Hidden Operator Admin Panel  
> 3. Printer Health Validation & Pre-Session Gate  
> 4. Cloudflare R2 Upload Pipeline & Digital Delivery  

---

## User Review Required

> [!IMPORTANT]
> **Native Dependency Note**: Item 1 introduces `better-sqlite3` into Electron Main Process (`apps/kiosk`). Since Electron uses its own V8 ABI, we must run `electron-rebuild` or install prebuilt binaries compatible with Electron v44.x.
>
> **Printer Status Polling Note**: Item 3 introduces a pre-session hardware gate. If a printer is reported as "Paper Out" or "Offline", the Kiosk will gracefully inhibit the payment button and display an operator contact/maintenance banner.

---

## Proposed Changes

---

### Item 1: Replace `sessions.json` with SQLite (`better-sqlite3`)

#### Objective
Eliminate the risk of JSON file corruption during sudden power outages or concurrent write bursts. Implement an embedded, ACID-compliant SQLite database in Electron Main Process using Write-Ahead Logging (WAL) mode for atomic session persistence and zero data loss.

#### Current State
In [`apps/kiosk/electron/services/SyncEngine.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts), all sessions are kept in an in-memory array `let sessions: Session[] = []` and serialized on every mutation via `fs.writeFileSync(dbPath, JSON.stringify(sessions, null, 2))`. If the booth PC loses power during `writeFileSync`, the file is truncated to 0 bytes and all historical local sessions are lost.

#### Files Impacted
* **[MODIFY]** [`apps/kiosk/package.json`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/package.json): Add `better-sqlite3` and `@types/better-sqlite3`.
* **[MODIFY]** [`apps/kiosk/electron/services/SyncEngine.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts): Replace JSON file reading/writing with SQLite database initialization, WAL pragma, table schemas, prepared statements, and automated one-time migration from `sessions.json`.
* **[MODIFY]** [`apps/kiosk/electron/main.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/main.ts): Close SQLite database connection cleanly during `before-quit` and `window-all-closed` hooks.
* **[MODIFY]** [`apps/kiosk/src/ipc/bridge.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/ipc/bridge.ts): Ensure typed query interfaces reflect local database queries.

#### Dependencies
* `better-sqlite3` (v11.x)
* `@types/better-sqlite3`

#### Risks & Mitigations
* **Risk**: Native Node ABI mismatch between Node.js and Electron runtime.  
  *Mitigation*: Use precompiled binaries or configure `electron-builder` native rebuild hooks.
* **Risk**: Existing local test data in `sessions.json` becomes orphaned.  
  *Mitigation*: Include automatic migration function `migrateLegacyJsonToSqlite()` on database boot.

#### Acceptance Criteria
* SQLite database file `kiosk.db` created in `app.getPath('userData')/pictolabs-data/`.
* `PRAGMA journal_mode = WAL;` and `PRAGMA synchronous = NORMAL;` active.
* Session creation and updates execute via prepared statements (`INSERT INTO sessions...`, `UPDATE sessions...`) in $<5\text{ ms}$.
* Simulated abrupt process kill (`taskkill /F`) does not corrupt database file.
* Legacy `sessions.json` records automatically imported on initial startup.

#### Estimated Effort
**1.5 Days**

---

### Item 2: Hidden Operator Admin Panel

#### Objective
Provide a secure, concealed interface for on-site mall technicians and booth operators to perform diagnostics, reprint photos without charging customers, test printer paper cuts, inspect camera USB status, and adjust local hardware settings without exiting Kiosk mode.

#### Current State
Kiosk currently operates in a continuous 8-screen public consumer loop. If a thermal printer jams, prints crookedly, or customer asks for a reprint due to accidental dropping of paper, the operator has no tool other than killing the process via Windows Task Manager.

#### Files Impacted
* **[NEW]** [`apps/kiosk/src/screens/AdminScreen.tsx`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx): Fullscreen modal with secure 4-digit PIN pad, quick-action cards (Reprint Last Photo, Printer Cut Test, Camera Status, Restart Kiosk, Exit Kiosk).
* **[MODIFY]** [`apps/kiosk/src/screens/WelcomeScreen.tsx`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/WelcomeScreen.tsx): Concealed gesture detector (5 consecutive taps within 3 seconds on the top-left logo) triggering the Admin PIN pad.
* **[MODIFY]** [`apps/kiosk/src/App.tsx`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/App.tsx): Route handler and modal overlay for Admin Screen.
* **[MODIFY]** [`apps/kiosk/electron/services/PrintService.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts): Add IPC handler `printer:reprint-last` to reprint composite image without session creation.
* **[MODIFY]** [`apps/kiosk/src/ipc/bridge.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/ipc/bridge.ts): Expose admin IPC methods (`kiosk.admin.reprintLast()`, `kiosk.admin.exitKiosk()`, `kiosk.admin.restartKiosk()`).

#### Dependencies
* React 18, Lucide React icons, Electron `app.relaunch()`, `app.exit()`.

#### Risks & Mitigations
* **Risk**: Customers accidentally triggering the admin screen during normal kiosk interaction.  
  *Mitigation*: Require a specific multi-tap cadence (5 taps within 3 seconds in a 60x60px invisible bounding box) followed by a 4-digit master PIN.
* **Risk**: Operator brute-forcing or forgetting the PIN.  
  *Mitigation*: Configurable PIN in `kiosk-config.json` (default `1234`), 30-second lockout after 5 incorrect attempts, and ability to reset PIN remotely via cloud dashboard.

#### Acceptance Criteria
* Secret gesture (5 taps on top-left logo) reliably opens PIN modal.
* Correct PIN unlocks Admin Dashboard; incorrect PIN displays error shake animation.
* "Reprint Last Photo" immediately sends the most recent composite image to Windows spooler with 1 click.
* "Printer Cut Test" prints a small 2-inch calibration strip.
* Camera preview widget shows live sensor health and firmware model.
* Clean return to `WelcomeScreen` on close.

#### Estimated Effort
**2.0 Days**

---

### Item 3: Printer Health Validation & Pre-Session Gate

#### Objective
Prevent customers from paying and shooting poses when the physical printer is out of paper, has a ribbon jam, or has an open cover. Provide early hardware gating that protects booth revenue and customer satisfaction.

#### Current State
[`PrintService.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts) only executes a simple PowerShell `PrinterStatus` query which usually returns `Normal` even if the printer paper tray is empty. As a result, customers can complete payment and photo poses, only to encounter an error at the final printing step.

#### Files Impacted
* **[MODIFY]** [`apps/kiosk/electron/services/PrintService.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts):
  - Enhance status interrogation using Win32 Spooler / WMI `Win32_Printer` bitmask flags (`ExtendedPrinterStatus`, `DetectedErrorState`).
  - Detect specific DNP / Citizen error codes: `0x00000010` (Paper Jam), `0x00000020` (Paper Out), `0x00000400` (Door Open), `0x00000002` (Error).
  - Implement caching loop with 3-second throttle to avoid continuous PowerShell execution.
* **[MODIFY]** [`apps/kiosk/src/screens/WelcomeScreen.tsx`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/WelcomeScreen.tsx): Check printer health on mount. If critical error detected, disable "START PHOTO" and display a polite maintenance pill: `"Printer sedang pemeliharaan kertas"`.
* **[MODIFY]** [`apps/kiosk/src/screens/PaymentScreen.tsx`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/PaymentScreen.tsx): Re-validate printer health immediately before displaying QRIS payment options.
* **[MODIFY]** [`apps/kiosk/electron/services/SyncEngine.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts): Send real-time printer error telemetry (`PRINTER_ERROR: PAPER_OUT`) in WebSocket `HEALTH_PING`.

#### Dependencies
* Windows Management Instrumentation (WMI / CIM via PowerShell or Win32 native wrapper).

#### Risks & Mitigations
* **Risk**: Querying WMI `Win32_Printer` synchronously can block the Node.js event loop by 500–1000 ms.  
  *Mitigation*: Run status check inside a dedicated background worker interval and cache the result in memory; UI queries the cached status in $<1\text{ ms}$.
* **Risk**: Generic printer drivers not reporting paper-out accurately.  
  *Mitigation*: Map custom status codes specific to DNP DS-RX1 / DS620 driver tables with fallback to print queue spool error check.

#### Acceptance Criteria
* Removing paper tray or cutting ribbon immediately flags printer as `NOT_READY` with specific cause (`PAPER_OUT` or `COVER_OPEN`).
* Kiosk UI disables payment and start button when printer is `NOT_READY`.
* Reloading paper and closing tray auto-clears the warning within 3 seconds, re-enabling the kiosk automatically.
* Cloud dashboard receives instant alert when kiosk printer enters error state.

#### Estimated Effort
**1.5 Days**

---

### Item 4: Cloudflare R2 Upload Pipeline & Digital Delivery

#### Objective
Build a robust, non-blocking asynchronous cloud upload service that pushes full-resolution 300 DPI composite images and raw photos to a high-speed, zero-egress Cloudflare R2 object storage bucket, transforming the current mock QR code into a genuine high-speed digital download link.

#### Current State
[`RenderEngine.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/RenderEngine.ts) saves composite images to the local hard drive `userData/pictolabs-data/composites/`. [`QRScreen.tsx`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx) generates a QR code pointing to `https://pictolabs.id/d/PICTO-...`, but the link returns a 404 because no cloud upload has occurred.

#### Files Impacted
* **[NEW]** `apps/backend/src/storage/storage.service.ts`: NestJS S3/R2 client initialized with `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Provides presigned upload URL generator (`getUploadUrl(sessionId, filename)`).
* **[NEW]** `apps/backend/src/storage/storage.controller.ts`: Endpoint `POST /api/storage/presigned-url` protected by kiosk `x-device-secret`.
* **[MODIFY]** `apps/backend/src/app.module.ts`: Import and register `StorageModule`.
* **[MODIFY]** `apps/backend/.env`: Add Cloudflare R2 credentials:
  ```env
  R2_ACCOUNT_ID=xxxx
  R2_ACCESS_KEY_ID=xxxx
  R2_SECRET_ACCESS_KEY=xxxx
  R2_BUCKET_NAME=pictolabs-photos
  R2_PUBLIC_DOMAIN=https://photos.pictolabs.id
  ```
* **[MODIFY]** [`apps/kiosk/electron/services/SyncEngine.ts`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts):
  - Add an asynchronous FIFO upload worker.
  - When a session finishes rendering, the composite JPEG (3–5 MB) is queued for upload.
  - Worker fetches presigned PUT URL from backend and streams binary data directly to Cloudflare R2.
  - Implements exponential backoff retry (3 attempts) on connection dropouts.
* **[MODIFY]** [`apps/kiosk/src/screens/QRScreen.tsx`](file:///C:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx): Render QR code directing to `https://pictolabs.id/d/{sessionId}` with download identifier backed by live R2 object.

#### Dependencies
* `@aws-sdk/client-s3` (v3.x)
* `@aws-sdk/s3-request-presigner` (v3.x)
* Node.js `stream` / `fetch` (standard in Node 20+)

#### Risks & Mitigations
* **Risk**: Slow upload speeds on mall 4G LTE connections delaying the user flow.  
  *Mitigation*: **Completely decoupled async execution**. The upload occurs in the background while the user is printing and scanning the QR code; it never blocks UI transitions.
* **Risk**: Network disconnection during upload causing lost customer photos.  
  *Mitigation*: Offline queue stores pending uploads in local SQLite; retry loop automatically resumes when connection returns. Local copies remain safely on disk.

#### Acceptance Criteria
* Backend generates valid S3/R2 presigned PUT URLs within $<50\text{ ms}$.
* Kiosk background worker successfully uploads 300 DPI composite images to Cloudflare R2.
* Public CDN URL (`https://photos.pictolabs.id/...`) accessible worldwide via HTTPS with CDN cache headers.
* Scanning the QR code on a smartphone opens and downloads the exact 1200x1800 px composite photo.
* Upload operations incur zero UI stutter or latency on the kiosk screen.

#### Estimated Effort
**2.0 Days**

---

## Verification Plan

### Automated Tests
* SQLite Unit Tests: Verify table creation, schema integrity, and prepared statement execution speed.
* R2 Storage Tests: Test presigned URL generation and test binary PUT upload via NestJS test suite (`npm run test -- storage`).

### Manual Hardware & Integration Verification
1. **SQLite Resilience Test**:
   - Create a session on Kiosk $\rightarrow$ Force-kill Electron process via `taskkill /F /IM electron.exe` mid-run $\rightarrow$ Restart app $\rightarrow$ Verify database reopens with zero corruption and all session records intact.
2. **Admin Panel Verification**:
   - Tap top-left corner of `WelcomeScreen` 5 times within 3s $\rightarrow$ Confirm PIN modal appears $\rightarrow$ Enter PIN $\rightarrow$ Tap "Reprint" $\rightarrow$ Verify Windows printer receives the print job.
3. **Printer Gate Verification**:
   - Open printer lid (simulate door open) $\rightarrow$ Confirm Kiosk displays maintenance notice and disables Start button $\rightarrow$ Close lid $\rightarrow$ Verify notice clears and kiosk re-enables.
4. **Cloudflare R2 Verification**:
   - Complete a photo session $\rightarrow$ Verify upload job triggers in background $\rightarrow$ Scan generated QR code with smartphone camera $\rightarrow$ Confirm 300 DPI composite photo displays on mobile browser.

---

## Sprint 1 Timeline & Resource Allocation

| Item | Focus Area | Complexity | Est. Duration | Target Lead |
| :--- | :--- | :---: | :---: | :--- |
| **Item 1** | Replace `sessions.json` with SQLite (`better-sqlite3`) | Medium | 1.5 Days | Electron / Data |
| **Item 2** | Hidden Operator Admin Panel & Reprint | Medium | 2.0 Days | Kiosk UI / IPC |
| **Item 3** | Printer Health Validation & Pre-Session Gate | High | 1.5 Days | Windows Hardware |
| **Item 4** | Cloudflare R2 Upload Pipeline & Digital Delivery | High | 2.0 Days | Backend / Cloud |
| **Total** | **Sprint 1 Complete Cycle** | **High** | **7.0 Days** | **Full-Stack Team** |
