# ROOT CAUSE ANALYSIS: OFFLINE ADMIN PANEL ACCESS FAILURE

**Document ID:** `OFFLINE_ADMIN_PANEL_ACCESS_RCA.md`  
**Classification:** Architecture Audit & Forensic Root Cause Analysis  
**Severity:** P0 (Operational Blocker — Event Booth Unrecoverable)  
**System Target:** Pictolabs Kiosk Client (`apps/kiosk`) & Backend API (`apps/backend`)  
**Investigation Date:** September 24, 2026  
**Status:** COMPLETE (RCA Only — Zero Implementation / Zero Code Modifications)

---

## 1. Executive Summary

During Pilot Readiness testing under offline network conditions, a critical P0 operational vulnerability was discovered:
When the internet connection is severed, an on-site technician entering the **correct 6-digit PIN** is **systematically rejected** by the Kiosk Admin Panel. The keypad shakes red, clears the input, and remains permanently locked.

### The Operational Paradox
The Pictolabs Kiosk runtime engine (Canon DSLR capture, Sharp compositor, DNP dye-sublimation printer spooler, and SQLite session ledger) is architected to operate fully offline. Furthermore, the Admin Panel contains explicit emergency offline controls—specifically **"Mode Auto-Bypass Pembayaran"** (to allow free/cash-handled event sessions without Midtrans QRIS) and **Printer Jam / Spooler Recovery Tools**.

However, **the door to enable these offline recovery features is locked behind a mandatory online HTTP network request**. An internet outage simultaneously disables online QRIS payments and prevents the technician from accessing the very panel needed to switch the booth into offline bypass mode.

### The Immediate Root Cause
1. `AdminScreen.tsx` (lines 170–174) performs a direct, synchronous browser `fetch()` to `https://api.pictolabs.id/api/booths/:id/verify-pin` on the 6th entered digit.
2. In offline conditions, `fetch()` raises an uncaught network exception (`TypeError: Failed to fetch` / DNS `ENOTFOUND`).
3. The exception is caught by a generic `catch (err)` block (lines 216–222), which **conflates network transport failure with an incorrect PIN** and unconditionally triggers `setPinError(true)`.
4. There is **zero local PIN hash, zero salt, and zero offline verification fallback** stored in `%ProgramData%\Pictolabs\identity.json`, SQLite `kiosk.db`, or `kiosk-config.json`.

---

## 2. Reproduction Steps

| Step | Action | Expected Behavior | Observed Behavior (Defect) |
| :--- | :--- | :--- | :--- |
| **1** | Disconnect kiosk machine from the internet (unplug Ethernet / disable Wi-Fi adapter). | Kiosk UI displays offline indicator; offline features remain available. | Kiosk remains on WelcomeScreen or PaymentScreen (QR generation fails). |
| **2** | Operator taps the discreet entry button (hidden corner or "Staff" link on PaymentScreen). | Operator access modal appears with 6-digit PIN keypad. | Operator access modal appears with 6-digit PIN keypad. *(Pass)* |
| **3** | Operator enters the legitimate, authoritative 6-digit PIN (e.g. `885926` or customized PIN). | System verifies PIN locally or falls back to cached hash; unlocks Admin Panel. | Keypad immediately flashes red, triggers shake animation, clears PIN, and remains locked. *(P0 Failure)* |
| **4** | Operator re-attempts PIN entry 3 times. | System differentiates offline network error from malicious brute-force. | In online mode, 3 failures trigger a 10-minute brute-force lockout (`setLockoutSeconds(600)`). In offline mode, network failure continuously rejects input. |
| **5** | Result | Operator manages printer, turns on Auto-Bypass, or reviews diagnostics. | **Booth is 100% paralyzed.** No diagnostics, no printer recovery, no payment bypass. |

---

## 3. End-to-End Architectural Trace

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. STAFF BUTTON INVOCATION                                                  │
│    Files: apps/kiosk/src/screens/WelcomeScreen.tsx:94                       │
│           apps/kiosk/src/screens/PaymentScreen.tsx:421, 460                 │
│    • Operator taps discreet button: onClick={onOpenAdmin}                   │
│    • Callback flows to App.tsx:80 -> setIsAdminOpen(true)                   │
│    • App.tsx:257 renders: <AdminScreen onClose={closeAdmin} />              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. PIN ENTRY (KEYPAD INPUT)                                                 │
│    File: apps/kiosk/src/screens/AdminScreen.tsx:132-141                     │
│    • Technician inputs 6 digits on touch keypad                             │
│    • On 6th digit: if (nextPin.length === 6) verifyPin(nextPin)             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. ENDPOINT RESOLUTION                                                      │
│    File: apps/kiosk/src/screens/AdminScreen.tsx:100-129                     │
│    • resolveTargetEndpoint() resolves:                                      │
│      - backendUrl: "https://api.pictolabs.id"                               │
│      - boothIdentifier: "554147f9-c7f7-47fe-966d-fcbf3223fec4"              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. LIVE REMOTE HTTP CALL (HARD DEPENDENCY ON INTERNET)                      │
│    File: apps/kiosk/src/screens/AdminScreen.tsx:170-174                     │
│    • Executed from React renderer:                                          │
│      fetch(`${backendUrl}/api/booths/${boothIdentifier}/verify-pin`, {      │
│        method: 'POST',                                                      │
│        headers: { 'Content-Type': 'application/json' },                     │
│        body: JSON.stringify({ pin: candidate })                             │
│      })                                                                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                     │
           [INTERNET ONLINE]                     [INTERNET OFFLINE]
                    │                                     │
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│ Cloud Backend: NestJS                │  │ Chromium Network Stack               │
│ POST /api/booths/:id/verify-pin      │  │ • DNS lookup fails (ENOTFOUND)       │
│ • Database lookup in PostgreSQL      │  │ • TCP connection fails (ENETUNREACH) │
│ • bcrypt.compare(pin, adminPinHash)  │  │ • fetch() throws:                    │
│ • Returns { verified: true/false }   │  │   TypeError: Failed to fetch         │
└──────────────────┬───────────────────┘  └──────────────────┬───────────────────┘
                   │                                         │
                   ▼                                         ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│ Kiosk Evaluates HTTP Response        │  │ Kiosk Catch Block (AdminScreen:216)  │
│ • if (data.verified)                 │  │ ❌ FATAL ERROR CONFLATION:            │
│   setIsAuthenticated(true)           │  │ console.error('network error', err); │
│ • else                               │  │ setPinError(true);                   │
│   setPinError(true)                  │  │ setTimeout(() => setPin(''), 800);   │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
                                                             │
                                                             ▼
                                          ┌──────────────────────────────────────┐
                                          │ RESULT: PIN REJECTED                 │
                                          │ • Keypad shakes red                  │
                                          │ • Input cleared                      │
                                          │ • Admin Panel remains locked         │
                                          │ • Operator locked out                │
                                          └──────────────────────────────────────┘
```

---

## 4. Deep Investigation of the 8 Focus Areas

### 4.1 Admin PIN Validation Flow
1. **Trigger:** The operator taps the secret button on `WelcomeScreen` (line 94) or `PaymentScreen` (lines 421, 460).
2. **Mounting:** `App.tsx` activates `isAdminOpen = true`. `AdminScreen.tsx` mounts in unauthenticated state (`isAuthenticated = false`), displaying the numeric PIN pad (lines 419–519).
3. **Digit Accumulation:** Handled by `handleDigit` (lines 132–141). Once `pin.length === 6`, it calls `verifyPin(candidate)`.
4. **Endpoint Resolution:** `resolveTargetEndpoint()` queries `kiosk.identity.getStatus()` for `boothId` and `apiBaseUrl`. In production, it targets `https://api.pictolabs.id/api/booths/<boothId>/verify-pin`.
5. **Execution:** It performs a browser `fetch()` directly from the renderer process without passing through Electron IPC.
6. **Evaluation:** If the HTTP status is 200 and `data.verified === true`, `isAuthenticated` becomes `true`. Otherwise, or on network failure, it triggers `pinError = true` and resets after 800ms.

### 4.2 Local vs. Remote Authentication
- **Remote Authentication:** 100% of the validation logic is executed remotely by `BoothsService.verifyPin` in `apps/backend/src/booths/booths.service.ts:294-315` using PostgreSQL `booth.adminPinHash` and `bcrypt.compare()`.
- **Local Authentication:** **0% exists.**
  - There is no local hash verification.
  - There is no IPC method in `apps/kiosk/electron/preload.ts` for verifying credentials.
  - There is no fallback PIN evaluation in `AdminScreen.tsx`.
  - The kiosk renderer does not have access to any secret or hash to verify the candidate PIN offline.

### 4.3 Booth Config Caching (`kiosk-config.json`)
- Handled by `SyncEngine.ts` via IPC channels `config:get` and `config:set` (lines 1159–1179).
- Stores non-sensitive parameters: `themeColor`, `eventName`, `price`, `countdownSec`, `cameraPreview`, `cameraResult`.
- **Finding:** In Sprint 5E, the PIN was deliberately removed from `kiosk-config.json` to eliminate plaintext exposure on disk. However, **no secure hashed equivalent was created to replace it**.

### 4.4 Device Provisioning Cache (`identity.json` & SQLite `kiosk_identity`)
- Managed by `IdentityService.ts` (`%ProgramData%\Pictolabs\identity.json` and SQLite table `kiosk_identity`).
- The `BoothIdentity` interface (lines 24–36) stores:
  - `boothId`, `boothName`, `branchId`, `branchName`, `companyId`, `location`, `apiBaseUrl`, `pairedAt`, `updatedAt`, `provisioningVersion`, and `deviceSecretCiphertext` (encrypted via Windows DPAPI).
- **Finding:** Neither `identity.json` nor SQLite `kiosk_identity` contains `adminPin`, `adminPinHash`, or any salted verification digest.
- When `activateKioskWithToken()` handshakes with `POST /api/provisioning/activate` (lines 428–460), the cloud response payload does **not** deliver a hashed PIN credential for offline validation.

### 4.5 Auth Token & Network Dependencies
- In `AdminScreen.tsx:170-174`, `fetch()` does not require an `Authorization` Bearer token or `x-device-secret`. It is an unauthenticated POST request sending `{ pin: candidate }` against the booth's UUID route.
- However, it has an absolute, hard dependency on:
  1. Active Windows network adapter (Ethernet/WLAN).
  2. Operating local DNS resolver.
  3. Outbound WAN routing to Cloudflare / VPS IP (`api.pictolabs.id`).
  4. Live NestJS backend service availability.
- A failure in any of these 4 layers immediately breaks the Admin Panel.

### 4.6 Dashboard Sync Dependencies
- In the Admin Dashboard (`BoothDetailDrawer.tsx`), an administrator updates the PIN via `PUT /api/booths/:id/pin`.
- In `apps/backend/src/booths/booths.service.ts:320-336`, the backend computes `bcrypt.hash(newPin, 10)` and updates PostgreSQL.
- **Architectural Gap:**
  - The backend **never emits a WebSocket event** (e.g. `CONFIG_UPDATE` or `PIN_UPDATED`) to inform the booth of the new PIN.
  - The backend HTTP heartbeat response (`POST /api/booths/:id/heartbeat`) does **not** return the current PIN hash or revision.
  - Because `AdminScreen.tsx` was written to query the backend dynamically, the developers never built a push/sync pipeline for PIN updates down to the kiosk.

### 4.7 Offline Mode Behavior
- **Can the booth operate fully offline?**
  - **YES.** The core photobooth pipeline is designed to be completely autonomous:
    - **Camera:** Canon DSLR controlled locally over USB via EDSDK.
    - **Compositor:** High-speed Sharp image pipeline running in Electron main process.
    - **Printer:** Direct Win32 GDI / Spooler communications with DNP DS-RX1HS over USB.
    - **Persistence:** SQLite WAL mode (`kiosk.db`) manages sessions, recovery ledger, and print queues without internet.
    - **Cloud Uploads:** Photos are queued in SQLite `upload_queue` and uploaded when internet returns.
    - **Emergency Payment Bypass:** `PaymentScreen.tsx:359-365` contains a dedicated auto-bypass listener:
      ```typescript
      const isAutoBypass = typeof window !== 'undefined' && 
        localStorage.getItem('pictolabs-auto-bypass-payment') === 'true';
      ```
      When enabled, the booth bypasses QRIS generation and lets customers use the photobooth for free or cash-handled events!
- **The Failure State:**
  - If internet drops during an event, QRIS cannot be generated.
  - The operator must open Admin Panel to activate "Mode Auto-Bypass Pembayaran".
  - But Admin Panel PIN validation requires internet!
  - **Result:** An internet outage completely paralyzes the booth because the operator cannot activate the offline workaround.

### 4.8 Why Correct PIN Becomes Invalid Offline
Lines 216–222 of `AdminScreen.tsx`:
```typescript
} catch (err) {
  console.error('[AdminScreen] PIN verification network error:', err);
  setPinError(true);
  setTimeout(() => {
    setPin('');
    setPinError(false);
  }, 800);
}
```
1. When the kiosk is offline, `fetch()` immediately fails at the socket/DNS level.
2. Chromium rejects the Promise with `TypeError: Failed to fetch`.
3. The `catch (err)` block treats this transport failure identically to a credential mismatch.
4. It sets `pinError: true`, causing the keypad to shake red and wipe the entered PIN.
5. **The correct PIN is rejected not because it was wrong, but because the transport failed.**

---

## 5. Summary of Root Causes

| Level | Root Cause | Impact |
| :--- | :--- | :--- |
| **Architectural** | **100% Coupling to Remote HTTP**: Admin authentication was implemented as a direct client-to-cloud request rather than querying the local device security layer. | Authentication fails instantly whenever internet connectivity is degraded or offline. |
| **Cryptographic / Storage** | **Absence of Local Salted Hash Storage**: Neither DPAPI `identity.json` nor SQLite `kiosk.db` caches a hashed PIN for offline verification. | The device has no local cryptographic truth against which to validate the operator. |
| **Synchronization** | **Missing PIN Push Pipeline**: Cloud backend never sends PIN updates via WebSocket or Heartbeat responses; provisioning never delivers an offline PIN hash. | Kiosk cannot maintain an up-to-date offline cache even if local storage existed. |
| **Code Implementation** | **Error Conflation in `AdminScreen.tsx`**: Network transport rejections are caught and handled as invalid PIN attempts (`setPinError(true)`). | Operator receives misleading "PIN Salah" feedback during network outages. |

---

## 6. Affected Modules

```
apps/
├── kiosk/
│   ├── src/screens/AdminScreen.tsx             <-- Primary failure point: live fetch() & catch-all error
│   ├── electron/services/IdentityService.ts     <-- Missing adminPinHash in BoothIdentity schema
│   ├── electron/services/SyncEngine.ts         <-- Missing PIN sync listener in WebSocket & Heartbeat
│   └── electron/preload.ts                     <-- Missing kiosk.admin.verifyPin IPC bridge
└── backend/
    ├── src/booths/booths.service.ts            <-- updatePin() does not push hash to kiosk
    ├── src/booths/booths.controller.ts         <-- Heartbeat does not return pin hash
    └── src/provisioning/provisioning.service.ts <-- Activation handshake does not provision PIN hash
```

---

## 7. Proposed Fix Strategy (Architectural Recommendation)

> [!NOTE]
> Per user instruction: **RCA Only. Zero implementation, zero refactoring, zero feature work in this phase.**

To achieve 100% offline resilience while maintaining enterprise security and remote dashboard control, the following architecture is proposed for subsequent implementation:

### 1. Cryptographically Hardened Local Cache (Offline-First)
- Store a bcrypt or PBKDF2 hash of the PIN locally inside `%ProgramData%\Pictolabs\identity.json` and mirrored in SQLite table `kiosk_identity`.
- Protect the hash on Windows using Windows DPAPI via Electron's `safeStorage` (matching the existing `deviceSecret` encryption pattern).
- Seed initial provisioning with the default hash (`'885926'`) so brand new unactivated or offline booths can always be managed.

### 2. Move Verification from Renderer to Main Process IPC (`kiosk.admin.verifyPin`)
- Remove direct browser `fetch()` from `AdminScreen.tsx`.
- Call `kiosk.admin.verifyPin(candidatePin)`.
- Main process performs:
  1. **Instant Local Check:** Validate candidate against local DPAPI-protected hash. If valid, return `{ verified: true, mode: 'local' }` in <10ms with zero internet requirement.
  2. **Background Sync (When Online):** If online, synchronize any remote PIN change or send telemetry.

### 3. Bidirectional PIN Sync Pipeline
- **WebSocket Broadcast:** In `booths.service.ts:updatePin()`, emit `socket.emit('PIN_UPDATED', { adminPinHash })` to the targeted booth.
- **Heartbeat Catch-up:** In `booths.service.ts:recordHeartbeat()`, include `adminPinHash` in the response payload. `SyncEngine.ts` compares the hash and updates local DPAPI storage on the 10-second heartbeat.
- **Fleet Provisioning:** In `provisioning.service.ts:activate()`, include `adminPinHash` in the initial activation payload.

### 4. Distinct Error Handling & UI States in `AdminScreen.tsx`
- Clearly distinguish between:
  - `PIN_INCORRECT`: Display red shake animation "PIN Salah".
  - `LOCKOUT_ACTIVE`: Display countdown timer (10 minutes).
  - `OFFLINE_MODE`: Display discreet badge "Offline Mode (Local Security Active)".
- Guarantee that network status never inhibits legitimate operator access.

---

## 8. Conclusion

The pilot blocker is not a failure of the booth hardware or core operating software. It is an **architectural dependency trap**: the Admin Panel was wired directly to a cloud API without an offline cryptographic cache. 

Implementing the proposed dual-mode local/cloud verification will guarantee that operators can always access Payment Bypass, printer controls, and emergency diagnostics under any network conditions.
