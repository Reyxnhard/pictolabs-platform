# ROOT CAUSE ANALYSIS: ADMIN PANEL PIN CHANGE & AUTHENTICATION FLOW

**Document Reference**: `ADMIN_PIN_RCA.md`  
**Classification**: Architecture Audit & Forensic Trace  
**System Target**: Pictolabs Photobooth Platform (Dashboard, Backend, Sync Engine, Kiosk)  
**Investigation Scope**: Dashboard PIN Form → API Request → Database → Sync Engine → Kiosk Config → Admin Panel Authentication  
**Status**: Completed (Audit Only — Zero Code Modifications)

---

## 1. Executive Summary

When an administrator changes the Technician PIN in the Admin Dashboard, the expectation is that the kiosk will immediately update its local configuration and authenticate technicians using the new PIN.

### The Core Finding:
The trace revealed a **fundamental architectural disconnect** between what the Dashboard UI promises and how the Kiosk actually authenticates:
1. **Sync Engine and Kiosk Config are completely bypassed**: When `PUT /api/booths/:id/pin` updates the database, **zero events are emitted to Sync Engine**, and **nothing is written to `kiosk-config.json`**.
2. **Kiosk authenticates via live remote HTTP, NOT local config**: `AdminScreen.tsx` attempts to call `POST /api/booths/:id/verify-pin` on every PIN entry.
3. **Critical Identifier Bug causes PIN Change to FAIL on Paired Kiosks**: `AdminScreen.tsx` attempts to read `(config as any)?.deviceSecret`, which is **always `undefined`** (because `deviceSecret` is encapsulated in `IdentityService` and hidden from the renderer). Consequently, the kiosk falls back to `'dev-secret-booth-01'`. The backend validates against the seed booth rather than the actual booth whose PIN was updated in the Dashboard.
4. **Total Offline Lockout**: If the kiosk loses internet connection, technicians are completely locked out of the Operator Control Panel because verification is 100% remote HTTP with no local offline fallback.

---

## 2. End-to-End Architectural Trace

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. DASHBOARD FORM                                                           │
│    File: apps/dashboard/src/components/booths/BoothDetailDrawer.tsx:132     │
│    • User enters 6-digit numeric string into input field                    │
│    • Client-side validation: /^\d{6}$/.test(newPin)                         │
│    • UI Action: await boothsApi.updateBoothPin(booth.id, newPin)            │
│    • UI Feedback: "✓ PIN Teknisi berhasil diubah! Kiosk langsung tersinkron"│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP PUT /api/booths/:id/pin
                                       │ Body: { newPin: "948271" }
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. API REQUEST & BACKEND CONTROLLER                                         │
│    File: apps/backend/src/booths/booths.controller.ts:171                   │
│    • Endpoint: @Put(':id/pin')                                              │
│    • DTO: UpdatePinDto (@Matches(/^\d{6}$/))                                │
│    • Controller calls: this.boothsService.updatePin(id, dto.newPin)         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Internal TypeScript Call
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. DATABASE PERSISTENCE                                                     │
│    File: apps/backend/src/booths/booths.service.ts:320                      │
│    • Generates bcrypt hash: await bcrypt.hash(newPin, 10)                   │
│    • Updates PostgreSQL: prisma.booth.update({ adminPinHash: hash })        │
│    • Sanitization: adminPinHash stripped from GET /api/booths               │
│    • Returns: { success: true, message: 'Admin PIN updated successfully' }  │
│                                                                             │
│    ❌ ARCHITECTURAL BREAKPOINT 1:                                           │
│    Zero WebSocket events emitted. No pushConfigUpdate() called.             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ ❌ NO DATA SENT
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. SYNC ENGINE                                                              │
│    File: apps/kiosk/electron/services/SyncEngine.ts                         │
│    • SyncEngine listens to CONFIG_UPDATE, payment:settled, and uploads.     │
│    • ❌ ZERO PIN HANDLERS: SyncEngine has no logic, listeners, or state     │
│      for adminPin or adminPinHash.                                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ ❌ NO CONFIG WRITTEN
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. KIOSK CONFIG                                                             │
│    File: apps/kiosk/kiosk-config.json                                       │
│    • kiosk-config.json stores: themeColor, eventName, price, countdown, etc.│
│    • ❌ PIN NEVER STORED: In Sprint 5E, local PIN storage was intentionally │
│      removed from kiosk-config.json to prevent local tampering.             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ ❌ NOT CHECKED BY UI
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. ADMIN PANEL AUTHENTICATION                                               │
│    File: apps/kiosk/src/screens/AdminScreen.tsx:102                         │
│    • Technician taps 6 digits on touch keypad.                              │
│    • Does NOT check kiosk-config.json.                                      │
│    • Makes live remote fetch:                                               │
│      POST ${backendUrl}/api/booths/${boothIdentifier}/verify-pin            │
│                                                                             │
│    ❌ CRITICAL BUG: boothIdentifier is ALWAYS 'dev-secret-booth-01'         │
│       because (config as any)?.deviceSecret is undefined!                   │
│    ❌ CRITICAL BUG: Fails completely if kiosk is offline.                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Deep Trace of Each Step

### Step 1: Dashboard Form
- **Source File**: [`apps/dashboard/src/components/booths/BoothDetailDrawer.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/components/booths/BoothDetailDrawer.tsx#L132-L180)
- **UI Element**: "Kelola PIN Teknisi (6-Digit Bcrypt)" section.
- **Form Mechanics**:
  - Controlled React input state `newPin`, masked as `type="password"` with visibility toggle.
  - Form validation:
    ```typescript
    if (!/^\d{6}$/.test(newPin)) {
      setPinFeedback({ type: 'error', message: 'PIN harus tepat 6 digit angka.' });
      return;
    }
    ```
  - Execution:
    ```typescript
    await boothsApi.updateBoothPin(booth.id, newPin);
    setPinFeedback({ type: 'success', message: '✓ PIN Teknisi berhasil diubah! Kiosk langsung tersinkron.' });
    ```
- **Finding**: The UI feedback explicitly informs the user that the kiosk is "langsung tersinkron" (directly synchronized), creating a false assumption that a push synchronization occurred.

---

### Step 2: API Request & Controller
- **Client Service**: [`apps/dashboard/src/services/boothsApi.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/services/boothsApi.ts#L25-L27)
  ```typescript
  async updateBoothPin(id: string, newPin: string): Promise<{ success: boolean; message: string; boothId: string }> {
    const res = await api.put<{ success: boolean; message: string; boothId: string }>(`/api/booths/${id}/pin`, { newPin });
    return res.data;
  }
  ```
- **Backend Route**: `PUT /api/booths/:id/pin` in [`apps/backend/src/booths/booths.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.controller.ts#L171-L184)
- **DTO Validation**: [`UpdatePinDto`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/dto/update-pin.dto.ts) enforces `@Matches(/^\d{6}$/)`.
- **Finding**: The controller is properly protected by JWT authentication and delegates directly to `boothsService.updatePin(id, dto.newPin)`.

---

### Step 3: Database Persistence
- **Service Implementation**: [`apps/backend/src/booths/booths.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts#L320-L341)
  ```typescript
  async updatePin(identifier: string, newPin: string): Promise<{ success: boolean; message: string; boothId: string }> {
    if (!/^\d{6}$/.test(newPin)) {
      throw new BadRequestException('PIN must be exactly 6 numeric digits');
    }

    const booth = await this.findBoothByIdentifier(identifier);
    const saltRounds = 10;
    const hash = await bcrypt.hash(newPin, saltRounds);

    await this.prisma.booth.update({
      where: { id: booth.id },
      data: { adminPinHash: hash },
    });

    this.logger.log(`[BoothsService] Admin PIN successfully updated for booth ${booth.name} (${booth.id})`);

    return {
      success: true,
      message: 'Admin PIN updated successfully',
      boothId: booth.id,
    };
  }
  ```
- **Schema & Migration**:
  - Model: `Booth` in [`apps/backend/prisma/schema.prisma:66`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L66).
  - PostgreSQL Table: `booths`, column `admin_pin_hash TEXT`.
  - Migration: `20260912220000_sprint5_schema_sync/migration.sql`.
- **Finding**: The database update succeeds completely. The bcrypt hash is stored in PostgreSQL. However, **no WebSocket notification or gateway push is executed in this method**.

---

### Step 4: Sync Engine (The Broken Link)
- **Source File**: [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts)
- **Investigation**:
  - Grep search for `pin` across `SyncEngine.ts` yielded **zero matches**.
  - `SyncEngine` handles `CONFIG_UPDATE` events emitted by `PUT /api/booths/:id/config`, but `updatePin` does not call `kioskGateway.pushConfigUpdate()`.
  - Even if `pushConfigUpdate()` were called, `BoothConfig` in the database does not contain `adminPinHash` (it is on the `Booth` model).
- **Finding**: **Sync Engine plays NO ROLE whatsoever in the PIN lifecycle.**

---

### Step 5: Kiosk Config
- **Source File**: [`apps/kiosk/electron/services/SyncEngine.ts:1159-1179`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1159-L1179) and [`apps/kiosk/src/context/KioskConfigContext.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/context/KioskConfigContext.tsx)
- **Investigation**:
  - `kiosk-config.json` stores:
    ```json
    {
      "themeColor": "#3b82f6",
      "eventName": "PICTOLABS SELF PHOTOBOOTH",
      "subText": "TOUCH SCREEN TO START",
      "price": 35000,
      "countdown": 5,
      "enableVoucher": true,
      "enableQRIS": true,
      "activeLayout": "4R"
    }
    ```
  - In Sprint 5E (see `docs/SPRINT_5E_IMPLEMENTATION_REPORT.md:24`), the architecture explicitly:
    > *"Removed kiosk-local plaintext PIN configuration."*
- **Finding**: **`kiosk-config.json` does not contain, receive, or persist the Admin PIN.**

---

### Step 6: Admin Panel Authentication (Where It All Fails)
- **Source File**: [`apps/kiosk/src/screens/AdminScreen.tsx:102-164`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx#L102-L164)
- **Runtime Flow**:
  When a technician enters 6 digits on the keypad, `verifyPin()` executes:
  ```typescript
  const verifyPin = async (candidate: string) => {
    if (lockoutSeconds > 0 || isVerifying) return;
    setIsVerifying(true);

    try {
      const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || 'http://localhost:4000';
      const boothIdentifier = (config as any)?.deviceSecret || 'dev-secret-booth-01';

      const res = await fetch(`${backendUrl}/api/booths/${boothIdentifier}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate }),
      });

      const data = await res.json().catch(() => ({ verified: false }));

      if (res.ok && data.verified) {
        setIsAuthenticated(true);
        setPinError(false);
        setFailedAttempts(0);
      } else {
        // Increment failed attempts; if >= 3, trigger 10-minute lockout + WhatsApp alert
  ```

---

## 4. Root Causes Identified

### Root Cause 1: Target Identifier Misalignment in Kiosk UI
In `AdminScreen.tsx:108`:
```typescript
const boothIdentifier = (config as any)?.deviceSecret || 'dev-secret-booth-01';
```
- `config` comes from `useKioskConfig()`, which loads `kiosk-config.json`.
- `kiosk-config.json` does **not** have `deviceSecret`.
- `deviceSecret` is securely stored in `kiosk-identity.json` and managed by `IdentityService.ts`.
- Furthermore, `IdentityService.getStatus()` **deliberately does not expose `deviceSecret` to the React renderer** for security reasons (`identity.spec.ts:143`).
- Therefore, `(config as any)?.deviceSecret` is **always `undefined`**.
- As a result, `boothIdentifier` **always falls back to `'dev-secret-booth-01'`**!

**The Failure Scenario**:
1. Founder activates a live kiosk (e.g. `PICTOLABS-DEV-01`, UUID: `8f03be00-e793-490a-a92c-e35c879f8241`).
2. Founder opens Dashboard and changes PIN for `PICTOLABS-DEV-01` to `112233`.
3. Backend updates `admin_pin_hash` for `8f03be00-e793-490a-a92c-e35c879f8241`.
4. Technician walks up to the kiosk and types `112233`.
5. Kiosk calls `POST /api/booths/dev-secret-booth-01/verify-pin` with `pin: "112233"`.
6. Backend queries the database for `deviceSecret = 'dev-secret-booth-01'`.
   - If that record has a different PIN or is unconfigured, it verifies against default `'885926'`.
   - `112233` does NOT match `'885926'`.
7. **Verification FAILS.** The technician is rejected. After 3 attempts, the kiosk keypad locks out for 10 minutes.

---

### Root Cause 2: Hardcoded / Unsynced Backend URL
In `AdminScreen.tsx:107`:
```typescript
const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || 'http://localhost:4000';
```
- In production, `VITE_BACKEND_URL` is typically not bundled or points to a dev default.
- The authoritative API Base URL is saved during device activation in `IdentityService` (`activeIdentity.apiBaseUrl`, e.g. `http://103.187.147.240:4000`).
- `AdminScreen.tsx` does not read `apiBaseUrl` from `kiosk.identity.getStatus()`.
- If the kiosk is deployed to a venue and `VITE_BACKEND_URL` defaults to `localhost:4000`, all PIN verification calls will throw network errors because no backend is running on `localhost`.

---

### Root Cause 3: Zero Offline Resilience (Total Technician Lockout)
- Kiosk photobooths in malls frequently experience transient Wi-Fi drops.
- Because PIN verification is **100% online HTTP**:
  - If the mall network drops, the `fetch()` fails.
  - The catch block in `AdminScreen.tsx:154-160` treats the network error as an invalid PIN:
    ```typescript
    catch (err) {
      console.error('[AdminScreen] PIN verification network error:', err);
      setPinError(true);
      setTimeout(() => { setPin(''); setPinError(false); }, 800);
    }
    ```
  - If the technician attempts to enter the PIN 3 times to troubleshoot why the kiosk is offline, the kiosk **locks the technician out for 10 minutes**!
  - **Paradox**: The Admin Panel is specifically designed for hardware troubleshooting and network diagnostics, but it cannot be accessed when the network is down.

---

### Root Cause 4: PIN Inconsistencies Across the Codebase

| Location | Stated / Expected PIN | Mechanism | Status / Risk |
| :--- | :--- | :--- | :--- |
| **Dashboard Drawer** (`BoothDetailDrawer.tsx`) | 6 digits (Bcrypt hash) | `PUT /api/booths/:id/pin` | Custom user-set PIN in DB |
| **Backend Fallback** (`booths.service.ts:302`) | `'885926'` | Hardcoded fallback if `adminPinHash == null` | Active fallback |
| **Payment Screen Tooltip** (`PaymentScreen.tsx:417`) | `(PIN: 1234)` (4 digits) | Tooltip string only | **Misleading**: Keypad rejects 4 digits |
| **Paper Tracker Reset** (`PaperTrackerService.ts:22`) | `'081299'` or `'123456'` | Hardcoded in Electron service | Secondary PIN bypass |
| **Sprint 1 Documentation** (`SPRINT_1_PLAN.md:84`) | `'1234'` | Historical design | Deprecated |

---

## 5. Architectural Comparison: Intended vs Actual

| Hop in Chain | What Architecture Assumes / Promises | What Actually Happens in Code | Gap Severity |
| :--- | :--- | :--- | :--- |
| **1. Dashboard Form** | Submits new PIN; says kiosk is "langsung tersinkron" | Updates PostgreSQL `admin_pin_hash` via API | **LOW** (Form works, but text is inaccurate) |
| **2. API Request** | Authenticated PUT endpoint | Validates 6 digits; updates DB | **NONE** (Working as designed) |
| **3. Database** | Stores bcrypt hash in `Booth.adminPinHash` | Stored securely, sanitized from GET responses | **NONE** (Working as designed) |
| **4. Sync Engine** | Expected to relay PIN update to kiosk | **ZERO sync**: No WebSocket event emitted; no handler in `SyncEngine.ts` | **HIGH** (Sync Engine is completely skipped) |
| **5. Kiosk Config** | Expected to update local config | **NOTHING written**: `kiosk-config.json` does not store PIN | **MEDIUM** (Design choice was to keep PIN server-side) |
| **6. Admin Panel Auth** | Validates against current booth's PIN | **FAILS**: Uses `'dev-secret-booth-01'` instead of active `boothId`; fails when offline | **CRITICAL** (Prevents PIN change from working on real kiosks) |

---

## 6. Recommended Remediation (Non-Breaking)

To make Admin PIN changes work reliably across both Online and Offline conditions without compromising security:

### Phase 1: Fix Kiosk AdminScreen Resolution (Immediate Fix)
In `apps/kiosk/src/screens/AdminScreen.tsx`:
1. Query `kiosk.identity.getStatus()` on mount.
2. Extract the canonical `boothId` and `apiBaseUrl`.
3. Call `${apiBaseUrl}/api/booths/${boothId}/verify-pin` instead of relying on `dev-secret-booth-01` or `localhost:4000`.

### Phase 2: Offline Fallback Cache via Electron Main Process (IPC)
Because the renderer should not handle raw hashes:
1. When Kiosk is online and paired, backend can transmit a salt/hash token to Electron Main via authenticated WebSocket or heartbeat response.
2. Electron Main stores this encrypted in `kiosk-identity.json` (Windows DPAPI via `safeStorage`).
3. Add IPC handler `kiosk.auth.verifyAdminPin(candidatePin)`:
   - If online: verifies with Cloud Backend.
   - If offline: verifies locally in Electron Main process using bcrypt against the cached hash.
4. Technicians can now access the Admin Panel during venue internet outages.

### Phase 3: Text & Tooltip Alignment
1. In `PaymentScreen.tsx:417`: Change tooltip from `Buka Operator Control Panel (PIN: 1234)` to `Buka Operator Control Panel`.
2. In `PaperTrackerService.ts`: Harmonize paper roll reset to use the unified technician PIN verification rather than hardcoded `'081299'`.
3. In `BoothDetailDrawer.tsx`: Update feedback message to accurately state: `✓ PIN Teknisi berhasil diubah di server cloud.`
