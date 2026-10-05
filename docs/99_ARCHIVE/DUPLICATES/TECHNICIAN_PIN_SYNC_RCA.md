# ROOT CAUSE ANALYSIS: TECHNICIAN PIN LIFECYCLE & SYNC FLOW
**Document ID:** `TECHNICIAN_PIN_SYNC_RCA.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Flow:** Dashboard → Backend → Database → Sync Engine → Kiosk Local Storage → Operator Panel Validation  
**Date:** September 23, 2026  
**Status:** COMPLETE (Zero Implementation — Strictly Empirical Runtime & Code Evidence)

---

## 1. Executive Summary & Test Findings

During manual validation, three sequential tests produced the following observations:
- **Test A (Dashboard PIN update)**: Succeeded (`PUT /api/booths/:id/pin` returned HTTP 200).
- **Test B (New PIN entered on Kiosk keypad)**: Rejected with red visual error shake.
- **Test C (Kiosk restarted, new PIN re-entered)**: Still rejected.

### The Core Finding
A rigorous empirical trace of the end-to-end PIN lifecycle reveals **two distinct, compounding root causes**:

1. **Architectural Gap (The Disconnected Sync Pipeline)**:
   There is **no sync pipeline** connecting the Backend to the Kiosk Sync Engine or local SQLite database for the technician PIN. The backend never transmits the PIN or its hash in WebSocket events (`CONFIG_UPDATE`) or HTTP Heartbeat responses. Kiosk SQLite (`kiosk.db`) contains **zero tables and zero columns** for PIN data.
   Instead, `AdminScreen.tsx` was architected to perform a **direct live HTTP verification** against `POST /api/booths/:id/verify-pin`.

2. **Runtime Binary Target Mismatch (The Exact Failure in Test B & Test C)**:
   The physical kiosk running on the machine is launched via the Windows Start Menu shortcut pointing to:
   `C:\Program Files\Pictolabs Kiosk\Pictolabs Kiosk.exe` (Timestamp: `2026-09-22 02:19:42 UTC`).
   Inside its packaged bundle (`resources/app.asar`), `AdminScreen.tsx` has:
   - Target backend URL: fallback to `http://localhost:4000` (since `VITE_BACKEND_URL` is undefined).
   - Target booth identifier: fallback to `'dev-secret-booth-01'`.
   
   When the technician enters PIN `112233` on the installed kiosk:
   - Kiosk executes `fetch('http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin')`.
   - Port 4000 is closed locally -> Windows raises `ECONNREFUSED` / Network Error.
   - The catch block sets `pinError: true`, immediately rejecting the PIN.
   - Restarting the kiosk (Test C) relaunches the exact same stale binary in `C:\Program Files\Pictolabs Kiosk\`, repeating the failure identically.

---

## 2. End-to-End Flow Trace & Empirical Evidence

```
┌────────────────────────┐
│   ADMIN DASHBOARD      │  PUT /api/booths/:id/pin { newPin: "112233" }
│ (BoothDetailDrawer.tsx)│──────────────────────────────────────────┐
└────────────────────────┘                                          │ [PASS] HTTP 200
                                                                    ▼
                                                       ┌────────────────────────┐
                                                       │   BACKEND CONTROLLER   │
                                                       │ (booths.controller.ts) │
                                                       └───────────┬────────────┘
                                                                   │
                                                                   ▼
                                                       ┌────────────────────────┐
                                                       │    BACKEND SERVICE     │
                                                       │  (booths.service.ts)   │
                                                       └───────────┬────────────┘
                                                                   │ bcrypt.hash(newPin, 10)
                                                                   ▼
                                                       ┌────────────────────────┐
                                                       │   POSTGRESQL DATABASE  │
                                                       │ Table: booths          │
                                                       │ Col: admin_pin_hash    │
                                                       └───────────┬────────────┘
                                                                   │
                     ╔═════════════════════════════════════════════╧═══════════════════════════════════════╗
                     ║ [BREAK POINT 1: ARCHITECTURAL GAP - NO SYNC PIPELINE]                               ║
                     ║ • Backend updatePin() does NOT emit WebSocket event                                  ║
                     ║ • Heartbeat response does NOT include PIN or hash                                    ║
                     ║ • GET /api/booths/:id explicitly strips adminPinHash for security                   ║
                     ╚═════════════════════════════════════════════╤═══════════════════════════════════════╝
                                                                   │
                                                                   ▼ (MISSING)
                                                       ┌────────────────────────┐
                                                       │   KIOSK SYNC ENGINE    │
                                                       │    (SyncEngine.ts)     │
                                                       │  * Zero PIN handlers   │
                                                       └───────────┬────────────┘
                                                                   │
                                                                   ▼ (MISSING)
                                                       ┌────────────────────────┐
                                                       │  LOCAL SQLITE STORAGE  │
                                                       │       (kiosk.db)       │
                                                       │  * Zero PIN columns    │
                                                       └───────────┬────────────┘
                                                                   │
                     ╔═════════════════════════════════════════════╧═══════════════════════════════════════╗
                     ║ [BREAK POINT 2: INSTALLED RUNTIME BINARY TARGET MISMATCH]                            ║
                     ║ • AdminScreen attempts live HTTP fetch instead of local SQLite read                  ║
                     ║ • Installed C:\Program Files app uses stale fallback: http://localhost:4000          ║
                     ║ • Hardcoded boothIdentifier: dev-secret-booth-01                                     ║
                     ║ • Result: ECONNREFUSED -> PIN rejected on kiosk screen                               ║
                     ╚══════════════════════════════════════════════════════════════════════════════════════╝
```

---

## 3. Detailed Investigation of the 8 Focus Areas

### 3.1 Dashboard PIN Save API
- **Client Implementation**:
  - File: [`apps/dashboard/src/services/boothsApi.ts:25-28`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/services/boothsApi.ts#L25-L28)
  - Method: `updateBoothPin(id: string, newPin: string)`
  - Invoked from: [`apps/dashboard/src/components/booths/BoothDetailDrawer.tsx:158`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/components/booths/BoothDetailDrawer.tsx#L158)
  - UI Feedback: Displays `"✓ PIN Teknisi berhasil diubah! Kiosk langsung tersinkron."`
- **Backend Controller**:
  - File: [`apps/backend/src/booths/booths.controller.ts:171-184`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.controller.ts#L171-L184)
  - Endpoint: `PUT /api/booths/:id/pin`
  - DTO: `UpdatePinDto` (validates 6-digit numeric string).
- **Backend Service**:
  - File: [`apps/backend/src/booths/booths.service.ts:320-341`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts#L320-L341)
  - Execution:
    ```typescript
    const saltRounds = 10;
    const hash = await bcrypt.hash(newPin, saltRounds);
    await this.prisma.booth.update({
      where: { id: booth.id },
      data: { adminPinHash: hash },
    });
    ```
- **Runtime Evidence**:
  - Direct runtime verification against `https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin`:
    - Payload `{ pin: "112233" }` → **HTTP 200** `{ success: true, verified: true, boothId: "554147f9-c7f7-47fe-966d-fcbf3223fec4" }`.
    - Payload `{ pin: "885926" }` → **HTTP 200** `{ success: true, verified: false, boothId: "554147f9-c7f7-47fe-966d-fcbf3223fec4" }`.
  - **Verdict**: Step 1 is **100% OPERATIONAL**.

---

### 3.2 Database Column Storing Technician PIN
- **Engine**: PostgreSQL 16 (on production cloud `api.pictolabs.id`).
- **Prisma Schema**:
  - File: [`apps/backend/prisma/schema.prisma:66`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L66)
  - Table: `booths`
  - Column: `admin_pin_hash` (Prisma model field: `adminPinHash String? @map("admin_pin_hash")`)
- **Auxiliary Tables**:
  - `booth_configs` table stores ONLY: `cameraSettings`, `printerSettings`, `generalSettings`. It contains NO PIN columns.
  - There are NO columns named `technician_pin` or `pin` in PostgreSQL.
- **Data Format**: Standard bcrypt hash string (prefix `$2b$10$...`).
- **Verdict**: Step 2 is **100% OPERATIONAL**.

---

### 3.3 Booth Sync Payload
- **Investigation**: Does the backend emit any WebSocket message or HTTP response payload containing the PIN or its hash?
- **WebSocket Gateway (`kiosk.gateway.ts`)**:
  - In `handleConnection()`:
    ```typescript
    if (booth.config?.generalSettings) {
      const general = JSON.parse(booth.config.generalSettings);
      client.emit('CONFIG_UPDATE', general);
    }
    ```
    Emits ONLY `booth.config` (`generalSettings`: price, countdown, timeout). `adminPinHash` is on `booth` table, NOT `booth.config`.
  - In `booths.service.ts:updatePin()`:
    **Zero WebSocket events are emitted.** `this.kioskGateway.pushConfigUpdate(...)` is never called.
  - In `sprint5e-revision.e2e.ts:113-124`:
    Explicitly tests and enforces that `adminPinHash` is **never exposed** in any API response:
    `assert.strictEqual('adminPinHash' in targetBooth, false, 'Security violation: adminPinHash leaked in list!');`
- **HTTP Heartbeat (`POST /api/booths/:id/heartbeat`)**:
  - Heartbeat response returns:
    `{ acknowledged: true, isMaintenance, status, secondsSinceLastHeartbeat, appVersion, gitCommit, machineName, localIp, osVersion, electronVersion, releaseChannel }`.
  - Zero PIN or hash data is transmitted.
- **Verdict**: **BREAK POINT 1**. The cloud backend has **ZERO sync payload** for the technician PIN.

---

### 3.4 Kiosk Sync Engine
- **Source**: [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) (1,422 lines)
- **Code Audit**:
  - Grep for `pin` or `PIN`: **0 matches found**.
  - SyncEngine handles:
    1. Processing `upload_queue` for photos/videos to Cloudflare R2 presigned URLs.
    2. Managing `print_queue` and triggering printer hardware.
    3. Emitting `HEALTH_PING` telemetry every 10 seconds.
    4. Sending HTTP Heartbeat `POST /api/booths/:id/heartbeat` every 30 seconds.
    5. Listening for `CONFIG_UPDATE` (writes to `kiosk-config.json` for theme colors and banner text).
    6. Listening for `payment:settled` (relays to renderer for QR payment completion).
- **Verdict**: The Kiosk Sync Engine does not manage, synchronize, or listen for PIN updates.

---

### 3.5 Local SQLite Storage
- **File Location**: `C:\Users\ezarh\AppData\Roaming\@pictolabs\kiosk\pictolabs-data\kiosk.db`
- **Empirical SQLite Schema Inspection (`PRAGMA table_info`)**:
  Runtime query executed via Node `better-sqlite3` on `kiosk.db`:

| Table Name | Existing Columns | PIN / Hash Column Present? |
| :--- | :--- | :---: |
| `sessions` | `id, created_at, frame_id, filter, photos, composite_path, live_video_path, live_video_url, print_status, synced, uploaded, remote_url, live_video_paths, live_video_urls, local_storage_state` | **NO** |
| `upload_queue` | `id, session_id, file_path, file_type, status, attempts, error_message, remote_url, created_at, updated_at` | **NO** |
| `print_queue` | `id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, last_error, next_retry_at, created_at, updated_at` | **NO** |
| `paper_tracker` | `id, roll_capacity, prints_consumed, prints_remaining, warning_threshold, lockout_threshold, last_replaced_at, updated_at` | **NO** |
| `session_recovery_ledger` | `id, session_id, status, stage, last_completed_step, payload, error_details, recovery_attempts, expires_at, created_at, updated_at` | **NO** |
| `kiosk_system_events` | `id, event_type, severity, component, details, created_at` | **NO** |
| `kiosk_identity` | `id, booth_id, booth_name, branch_id, branch_name, company_id, location, api_base_url, paired_at, provisioning_version, updated_at` | **NO** |

- **Local JSON Storage**:
  - `kiosk-config.json`: content is `{}`.
  - `kiosk-identity.json`: does not exist (migrated to SQLite `kiosk_identity`).
- **Verdict**: Kiosk local storage has **ZERO tables and ZERO columns** storing any technician PIN or hash.

---

### 3.6 Operator Panel PIN Validation Logic
- **UI Screen**: [`apps/kiosk/src/screens/AdminScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx)
- **Mechanism**:
  Instead of verifying against SQLite, `AdminScreen.tsx` submits candidate PINs via HTTP `fetch()`:
  ```typescript
  const res = await fetch(`${backendUrl}/api/booths/${boothIdentifier}/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: candidate }),
  });
  ```
- **The Runtime Failure in Installed App**:
  - File inspected: `C:\Program Files\Pictolabs Kiosk\resources\app.asar`
  - Build date: `2026-09-22 02:19:42 UTC`
  - String search inside installed `app.asar`:
    - `Includes resolveTargetEndpoint?`: **FALSE**
    - `Includes http://localhost:4000?`: **TRUE**
    - `Includes dev-secret-booth-01?`: **TRUE**
  - In this installed build:
    `backendUrl` falls back to `'http://localhost:4000'`
    `boothIdentifier` falls back to `'dev-secret-booth-01'`
  - When the user presses digits on the installed kiosk:
    1. Kiosk dispatches `POST http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin`.
    2. Windows network stack rejects connection (`ECONNREFUSED`).
    3. `verifyPin` catch block triggers:
       ```typescript
       catch (err) {
         console.error('[AdminScreen] PIN verification network error:', err);
         setPinError(true);
         setTimeout(() => { setPin(''); setPinError(false); }, 800);
       }
       ```
    4. Keypad shakes red and resets. Candidate PIN is rejected.
- **Auxiliary Hardware Validation (`PaperTrackerService.ts`)**:
  In [`apps/kiosk/electron/services/PaperTrackerService.ts:108`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PaperTrackerService.ts#L108):
  ```typescript
  // Validate technician PIN
  const cleanPin = String(pin || '').trim();
  if (cleanPin !== DEFAULT_OPERATOR_PIN && cleanPin !== '123456') {
    return { success: false, error: 'PIN Operator tidak valid' };
  }
  ```
  `PaperTrackerService` has a secondary hardcoded check against `081299` and `123456`, completely disconnected from the booth database.

---

### 3.7 Bcrypt Comparison Logic
- **Location**: Executed **server-side only** in [`apps/backend/src/booths/booths.service.ts:294-314`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts#L294-L314):
  ```typescript
  async verifyPin(identifier: string, candidatePin: string) {
    const booth = await this.findBoothByIdentifier(identifier);
    let isMatch = false;
    if (booth.adminPinHash) {
      isMatch = await bcrypt.compare(candidatePin, booth.adminPinHash);
    } else {
      isMatch = candidatePin === '885926';
    }
    return { success: true, verified: isMatch, boothId: booth.id };
  }
  ```
- **Is bcrypt comparison executed on Kiosk?**:
  **NO.** The kiosk renderer bundle has no bcrypt library. The candidate PIN is sent over HTTP to the backend.
- **Mathematical Correctness**:
  Verified via live script querying `api.pictolabs.id`:
  - `candidatePin = "112233"` → `verified = true` (Matches new hash).
  - `candidatePin = "885926"` → `verified = false` (Rejected).
  - `candidatePin = "123456"` → `verified = false` (Rejected).
- **Verdict**: Bcrypt comparison logic on the backend is **100% ACCURATE**.

---

### 3.8 PIN Cache / Memory State
- **Backend Cache**:
  None. `booths.service.ts` queries PostgreSQL directly on every call.
- **Kiosk Memory State**:
  - `AdminScreen.tsx`: holds candidate digits in local React component state `useState('')`. Discarded after 6 digits.
  - `KioskConfigContext.tsx`: holds `config: KioskConfig`. Contains no PIN fields.
  - `IdentityService.ts`: caches `cachedIdentity`. Contains no PIN fields.
- **Behavior Across Kiosk Restart (Test C)**:
  - When the kiosk restarts, RAM is wiped.
  - Local SQLite and JSON still have no PIN.
  - The OS executes `C:\Program Files\Pictolabs Kiosk\Pictolabs Kiosk.exe`.
  - The stale binary launches and continues attempting to call `http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin`.
  - Restarting provides zero benefit because the installed executable binary is unchanged.

---

## 4. Synthesis: Exact Break Points

| # | Break Point Description | Architectural Layer | Impact |
| :-: | :--- | :--- | :--- |
| **1** | **No Sync Pipeline from Backend to Kiosk** | Cloud Backend (`booths.service.ts`) | The backend never sends PIN updates to `kiosk.gateway.ts`, `SyncEngine.ts`, or heartbeat responses. Kiosk never receives the PIN or hash passively. |
| **2** | **Zero Local SQLite PIN Schema** | Kiosk Client (`kiosk.db`) | SQLite has 7 tables, none of which store PIN. Offline PIN verification is impossible under the current schema. |
| **3** | **Installed Production Binary Uses Stale Endpoints** | Windows Executable (`C:\Program Files\Pictolabs Kiosk`) | The installed app still has `app.asar` from `2026-09-22 02:19` which calls `http://localhost:4000` with `dev-secret-booth-01`. All verification attempts throw network errors. |
| **4** | **Hardcoded Fallback in PaperTrackerService** | Kiosk Hardware (`PaperTrackerService.ts:108`) | Resetting the paper roll counter checks against hardcoded `081299` / `123456`, ignoring both cloud and custom PINs. |

---

## 5. Proposed Fixes

Two architectural remediation options are available:

### Option A: Align Live HTTP Verification (Fastest — Zero Schema Changes)
In this model, the kiosk continues to verify PINs directly against the backend over HTTP.
1. **Deploy Patched ASAR to Program Files**:
   Copy the updated, verified `app.asar` from `apps/kiosk/release/win-unpacked/resources/app.asar` into `C:\Program Files\Pictolabs Kiosk\resources\app.asar`.
   *(This includes `resolveTargetEndpoint()`, which dynamically reads `apiBaseUrl: "https://api.pictolabs.id"` and `boothId: "554147f9-c7f7-47fe-966d-fcbf3223fec4"` from local SQLite identity).*
2. **Harmonize `PaperTrackerService.ts`**:
   Remove the hardcoded `081299` check in `PaperTrackerService.ts` and forward the PIN check through the authenticated IPC bridge.

### Option B: True Offline-First SQLite Sync Architecture (Recommended for Enterprise)
If mall kiosks must allow technician PIN login even during complete internet/cellular outages:
1. **Extend Local SQLite Schema (`kiosk_identity`)**:
   Add `admin_pin_hash TEXT` to `kiosk_identity` table in `kiosk.db`.
2. **Sync Pin Hash via Heartbeat & WebSocket**:
   - In `booths.service.ts:processHeartbeat()`: Include `adminPinHash` in the heartbeat response payload.
   - In `booths.service.ts:updatePin()`: Emit a WebSocket event `PIN_HASH_UPDATED` containing the new bcrypt hash to the specific booth room.
3. **Persist Hash in `SyncEngine.ts`**:
   Listen for `PIN_HASH_UPDATED` or heartbeat response, and execute `UPDATE kiosk_identity SET admin_pin_hash = ? WHERE id = 1`.
4. **Local Verification via IPC**:
   Create IPC handler `kiosk.auth.verifyPin(candidate)` in Electron Main process. Main process compares `candidate` against `kiosk_identity.admin_pin_hash` using `bcryptjs`.
   This guarantees **instant, 100% offline-capable, tamper-resistant technician authentication**.
