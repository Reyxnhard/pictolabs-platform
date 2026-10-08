# UPLOAD RELIABILITY FOUNDER UAT PREPARATION

**Document ID:** `AG-UAT-UPLOAD-OUTAGE-001`  
**Date:** 2026-10-08  
**Target Hardware:** Physical Photobooth Booth #1  
**Subsystems:** Kiosk Client (`apps/kiosk`) & Cloud Backend (`apps/backend`)  
**Audit Reference:** [`docs/02_EVIDENCE/AUDITS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_AUDIT.md)  
**Fix Reference:** [`docs/02_EVIDENCE/FIX_REPORTS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_FIX_REPORT.md)  
**Status:** COMPLETED — FOUNDER PHYSICAL UAT PASS (S1–S6 100% PASS)  
**Release Gate:** UPLOAD OUTAGE RELIABILITY = CLOSED  

---

## 1. Pre-UAT Verification

Prior to conducting physical tests on Booth #1, all code and build artifacts were verified:

### 1.1 Working Tree Audit
The working tree contains **strictly** the approved Upload Reliability fix files:
- Modified:
  - [`pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) (Retry backoff, store-and-forward re-arm, GIF upload enqueue, socket/heartbeat triggers)
  - [`pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts) (Idempotent photo ledger deduplication)
- Automated Test Suite:
  - [`pictolabs-rebuild/apps/kiosk/electron/services/upload-outage-recovery.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/upload-outage-recovery.spec.ts)
- Evidence Documentation:
  - [`docs/02_EVIDENCE/FIX_REPORTS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_FIX_REPORT.md)
  - [`docs/02_EVIDENCE/UAT/AG_UPLOAD_INTERNET_OUTAGE_FOUNDER_UAT_PREPARATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/AG_UPLOAD_INTERNET_OUTAGE_FOUNDER_UAT_PREPARATION.md)

Zero canonical governance files were modified. Zero printer or camera subsystem files were altered.

### 1.2 Automated Test Pass Verification
- **Upload Outage Recovery Suite:** `47 PASSED, 0 FAILED`
  - Scenario A: Outage > 5 retries & recovery $\to$ PASS
  - Scenario B: 10+ min outage store-and-forward $\to$ PASS
  - Scenario C: GIF background completion & idempotency $\to$ PASS
  - Scenario D: Confirmation retry idempotency $\to$ PASS
  - Scenario E: Force Upload after completion $\to$ PASS
  - Scenario F: Permanent failure isolation $\to$ PASS
- **Regression Suites:**
  - Storage Retention ([`storage-retention.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/storage-retention.spec.ts)): `6/6 PASSED`
  - Burn-in Endurance ([`burn-in.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/burn-in.spec.ts)): `34/34 PASSED`
  - Crash Recovery ([`crash-recovery-e2e.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/crash-recovery-e2e.spec.ts)): `33/33 PASSED`
  - Printer RCA-7 ([`rca7-simplification.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/rca7-simplification.spec.ts)): `6/6 PASSED, 10 INVARIANTS INTACT`

### 1.3 Compilation, Launch Readiness & Installer Packaging
- Backend build (`apps/backend`): `npm run build` compiled cleanly (`nest build` code 0).
- Kiosk frontend build (`apps/kiosk`): `npx vite build` completed cleanly (code 0).
- Kiosk Electron compilation (`apps/kiosk`): `npx tsc -p tsconfig.electron.json` exited 0.
- **Production NSIS Installer Build:**
  - Build script: `npm run electron:build` in `apps/kiosk`
  - Output binary: [`pictolabs-rebuild/apps/kiosk/release/Pictolabs Kiosk Setup 1.0.0.exe`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/Pictolabs%20Kiosk%20Setup%201.0.0.exe)
  - File Size: `196.4 MB` (196,416,013 bytes)
  - Packaging Status: Freshly bundled with latest Upload Reliability, GIF ingestion, and Photo idempotency fixes.
  - Deployment Method: Run installer setup directly on Booth #1 or launch via `npm run electron:dev`.

---

## 2. Physical UAT Procedure (Booth #1)

Founder should run the physical test on Booth #1 following this sequence:

### Step 0: Environment Setup
1. Open Terminal 1 (Backend):
   ```bash
   cd pictolabs-rebuild/apps/backend
   npm run dev
   ```
   *Verify backend listens on port 4000.*
2. Open Terminal 2 (Kiosk Client on Booth #1):
   ```bash
   cd pictolabs-rebuild/apps/kiosk
   npm run electron:dev
   ```
   *Verify Kiosk full-screen window mounts on idle screen.*

---

### Scenario 1: Baseline Online Capture & Looping GIF Ingestion
**Goal:** Verify end-to-end cloud upload and GIF upload under normal internet connectivity.
1. Ensure WiFi / Ethernet is **CONNECTED**.
2. Start a standard customer session:
   - Select Frame (e.g. 4R)
   - Complete Payment (QRIS / Bypass)
   - Capture all 3 Poses
   - Select Filter
   - Proceed to Render & Print
3. Observe print execution on DNP printer (unaffected fast path).
4. On the final QR Screen, scan the displayed QR code with a smartphone camera.
5. **Expected Result:**
   - Both the printable Composite photo **and** the animated looping GIF appear in the mobile download portal.
   - Session status in Admin History transitions to `COMPLETED` (green badge).

---

### Scenario 2: Internet Severed During Customer Flow (Store-and-Forward Capture)
**Goal:** Verify kiosk does NOT hang, stutter, or fail when customer uses booth without internet.
1. **Disconnect WiFi / Unplug Ethernet** on Booth #1.
2. Verify top-right indicator shows `Offline` or orange telemetry badge.
3. Start a new customer session while offline:
   - Complete Payment (mock cash / voucher / bypass)
   - Capture all 3 Poses
   - Select Filter
   - Proceed to Render Screen
4. Observe customer flow:
   - Non-blocking rendering completes.
   - Physical print dispatches to DNP printer and prints successfully.
   - QRScreen opens displaying the offline composite photo preview.
5. Open Admin Panel (Shortcut `Ctrl+Shift+A` or 5-tap on logo $\to$ enter PIN `1234`):
   - Navigate to **Riwayat Sesi (Session History)**.
   - Inspect the top row (the offline session).
6. **Expected Result:**
   - Print Status shows `COMPLETED` (green).
   - Upload Status shows `UPLOAD_PENDING` (yellow).
   - Details panel shows Composite and GIF stored locally on SSD with pending cloud upload.

---

### Scenario 3: Extended Network Outage (10–15 Minutes Offline)
**Goal:** Verify retry exhaustion fix: items must not enter rapid storm, nor become permanently stranded after 5 failed attempts.
1. Keep WiFi / Ethernet **DISCONNECTED** for 10–15 minutes.
2. In Terminal 2 (Kiosk stdout logs), observe:
   - Initial 5 attempts occur with exponential backoff (2s, 4s, 8s, 16s, 32s).
   - After Attempt 5, the kiosk stops rapid retry loop (quiescent bounded state).
   - Kiosk UI does NOT stutter or lag.
   - Free SSD space is maintained.
3. Run 1 additional session while still offline:
   - Session finishes locally and prints.
   - Both sessions remain intact in SQLite queue with `UPLOAD_PENDING` status.
4. **Expected Result:**
   - No rapid retry storm in logs.
   - No crash, zero unhandled promise rejections.
   - Sessions are safely retained in local SQLite WAL database.

---

### Scenario 4: Automatic Network Recovery (Zero Operator Intervention)
**Goal:** Verify automatic re-arm mechanism without clicking "Force Upload".
1. **Reconnect WiFi / Plug in Ethernet** on Booth #1.
2. **DO NOT CLICK** "Force Upload" or touch the screen.
3. Watch the screen and terminal logs:
   - Within 5–30 seconds, WebSocket reconnects (`socket.on('connect')`) or HTTP heartbeat succeeds.
   - Re-arm trigger fires automatically: `[SyncEngine] 🔄 Network recovery: re-armed <N> retryable upload(s)`.
   - Upload worker immediately resumes transmitting the queued composites and background GIFs.
4. Open Admin History:
   - Watch the sessions transition from `UPLOAD_PENDING` $\to$ `COMPLETED` (green badge).
5. **Expected Result:**
   - All pending customer uploads complete automatically without human intervention.
   - Cloud status badges turn green.

---

### Scenario 5: Customer QR Code Retrieval Verification
**Goal:** Verify assets uploaded during recovery are retrievable by customer.
1. From the Admin History details panel of the recovered session, scan the QR code or open the customer download URL on a smartphone.
2. **Expected Result:**
   - Customer download portal opens on phone browser.
   - Printable composite photo is downloadable.
   - Looping animated GIF is playable and downloadable.

---

### Scenario 6: Force Upload & Duplicate Ledger Protection
**Goal:** Verify idempotency fix in `/confirm-upload`.
1. In Admin History, locate a session that is already `COMPLETED`.
2. Click the **"Paksa Unggah (Force Upload)"** button on this session.
3. Toast notification confirms: `✓ Pengunggahan ulang dipicu: <N> berkas media dimasukkan kembali`.
4. Observe Terminal 1 (Backend logs):
   - Backend receives `/confirm-upload`.
   - Backend logs idempotent acknowledgment:
     `[StorageController] Idempotent confirmation: Photo record <id> already exists for session=..., key=...`
5. **Expected Result:**
   - Operation completes cleanly with zero errors.
   - Zero duplicate `Photo` records are created in PostgreSQL.
   - Cloudflare R2 object keys remain deterministic.

---

## 3. Expected Result & Founder Physical UAT Outcome

| Scenario | Primary Action | Expected Kiosk Behavior | Expected Backend Behavior | Physical Result |
| :--- | :--- | :--- | :--- | :---: |
| **S1: Baseline Online** | Normal capture $\to$ print with internet active | Print prints immediately; Composite + GIF uploaded; QR download portal loads both assets | Presigned URL generated; R2 PUT succeeds; `/confirm-upload` creates exactly 1 photo record | **PASS** |
| **S2: Offline Session** | Capture $\to$ print while disconnected | Local print succeeds; UI does not block; Admin History shows `UPLOAD_PENDING` | Kiosk does not reach backend; requests safely fail locally | **PASS** |
| **S3: 10m Outage** | Remain offline for 10–15 minutes | After 5 attempts, enters quiescent backoff; no CPU spike or rapid loop | Zero traffic; no ghost sessions created | **PASS** |
| **S4: Network Returns** | Reconnect internet (no manual action) | WebSocket/heartbeat triggers re-arm within 5–30s; status turns `COMPLETED` | Uploads accepted; sessions marked `COMPLETED` | **PASS** |
| **S5: QR Retrieval** | Scan recovered session QR on phone | Mobile portal opens; composite image and looping GIF download cleanly | Cloudflare R2 serves files from deterministic paths | **PASS** |
| **S6: Force Upload** | Click "Paksa Unggah" in Admin History | Upload re-runs without error; Admin UI remains `COMPLETED` | Backend recognizes existing photo record (`alreadyConfirmed: true`); 0 duplicate rows | **PASS** |

---

## 4. What Founder Should Observe

### 4.1 On Kiosk Screen / Admin UI
- **Top Telemetry Indicator:**
  - Online: Green badge `Online`
  - Offline: Orange badge `Offline`
- **Session History Center (`Ctrl+Shift+A` $\to$ Riwayat Sesi):**
  - Offline state: Yellow badge `UPLOAD PENDING`
  - Online state: Green badge `COMPLETED`
  - Details card lists `Composite Photo` and `Motion / Looping GIF` with file sizes and green checkmarks.

### 4.2 In Kiosk Terminal Logs (`Terminal 2`)
When offline:
```
[SyncEngine] Uploading composite (...) to Cloud (Attempt 1)...
[SyncEngine] Presigned R2 flow failed: fetch failed. Falling back to standard upload.
[SyncEngine] Upload attempt failed for ...: fetch failed
```
When internet is restored:
```
✓ [SyncEngine] Real-time WebSocket connected to cloud backend: http://localhost:4000
[SyncEngine] 🔄 Network recovery: re-armed 2 retryable upload(s)
[SyncEngine] Uploading composite (...) to Cloud (Attempt 1)...
[SyncEngine] ✓ Uploaded composite successfully: https://...
[SyncEngine] Uploading video (...loop.gif) to Cloud (Attempt 1)...
[SyncEngine] ✓ Uploaded video successfully: https://...
[SyncEngine] ✓ Synced single session metadata: session_...
```

### 4.3 In Backend Terminal Logs (`Terminal 1`)
On initial confirmation:
```
[StorageController] Confirming upload for session=session_..., file=composite_..., type=composite
[StorageController] Created new Photo record: photo_... (key=sessions/session_.../composite_...)
```
On duplicate / Force Upload confirmation:
```
[StorageController] Confirming upload for session=session_..., file=composite_..., type=composite
[StorageController] Idempotent confirmation: Photo record photo_... already exists for session=session_..., key=sessions/session_.../composite_...
```

---

## 5. Failure Criteria

Physical UAT should be marked **FAIL** if any of the following occur:
1. **Stranded Upload:** After reconnecting internet in Scenario 4, the session remains in `UPLOAD_PENDING` for $>2$ minutes without automatic resumption, requiring manual "Force Upload".
2. **Missing GIF:** Scanning the QR code in Scenario 1 or Scenario 5 displays only the still photo, and the animated looping GIF is missing or broken.
3. **UI Freezing:** Disconnecting internet causes the customer capture, countdown, or render screen to stall or freeze.
4. **Storming:** During the 10-minute outage in Scenario 3, the terminal prints rapid-fire retry errors continuously every second.
5. **Duplicate Photo Rows:** In Scenario 6, clicking Force Upload creates a second duplicate photo record for the same composite in backend database.
6. **Printer Regression:** The print job stalls, fails to print, or behaves differently than approved in RCA-7.

---

## 6. Current Git State

```
Branch: main
HEAD Commit: 1d732b8
Tracked Modifications:
  - modified: pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts
  - modified: pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts
Untracked Files:
  - pictolabs-rebuild/apps/kiosk/electron/services/upload-outage-recovery.spec.ts
  - docs/02_EVIDENCE/FIX_REPORTS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_FIX_REPORT.md
  - docs/02_EVIDENCE/UAT/AG_UPLOAD_INTERNET_OUTAGE_FOUNDER_UAT_PREPARATION.md
Commit/Push/Deploy Status: UNCOMMITTED / NOT PUSHED / NOT DEPLOYED
```

---

## 7. Founder Sign-Off & Release Gate Verdict

- **Automated Verification:** **47/47 PASSED**
- **Physical Founder UAT Execution:** **6/6 PASSED** (S1, S2, S3, S4, S5, S6)
- **Gate Verdict:** **UPLOAD OUTAGE RELIABILITY = CLOSED**
- **Action:** Ready for final release pre-commit synchronization.
