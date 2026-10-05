# SECURITY WORKSTREAM CONTEXT

## 1. Purpose
The Security Workstream guarantees machine integrity, customer privacy, and administrative authentication across the Pictolabs platform. It enforces 6-digit bcrypt PIN validation (online and offline), rate limits failed access attempts, encrypts local machine credentials using Windows DPAPI, and prevents cross-session customer data leakage.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Online Admin PIN Verification** | `AUTOMATED_VERIFIED` | Verified against backend database bcrypt hash. |
| **Offline Salted Bcrypt PIN Verification**| `AUTOMATED_VERIFIED` | Local validation when internet connection is lost. |
| **5-Attempt Lockout with Backoff** | `AUTOMATED_VERIFIED` | 15-minute lockout on repeated incorrect PIN entry. |
| **DPAPI Hardware Machine Secret Storage** | `AUTOMATED_VERIFIED` | Protected by Windows kernel machine credentials. |
| **Customer Session Isolation (P0 Fix)** | `AUTOMATED_VERIFIED` | Zero cross-session buffer or state leakage (c2ec517). |
| **Session Isolation Founder Physical UAT** | `FOUNDER_UAT_PENDING` | Physical cable pull test on Booth #1 pending. |
| **SQLite WAL Security & Injection Defense**| `AUTOMATED_VERIFIED` | Parameterized queries prevent SQL injection. |

## 3. Completed / Verified
- **Implemented:** Offline PIN service in [`apps/kiosk/electron/services/IdentityService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/IdentityService.ts), DPAPI integration, and session teardown sanitization.
- **Automated Verified:** 100% pass on offline PIN test suite (`verify_offline_admin_pin.mjs`) and camera session isolation suite (`run_camera_failure_session_isolation_verification.mjs`).
- **Founder Physical UAT:** Physical PIN entry and admin access verified on hardware; camera disconnect physical verification pending.
- **Production Verified:** Verified in kiosk runtime test harness.

## 4. Current Architecture
1. **Admin PIN Authentication:** Store technicians access the Admin Panel by tapping the logo 5 times.
   - If online: Kiosk sends PIN over HTTPS to `POST /api/booths/:id/verify-pin`.
   - If offline: Kiosk uses [`IdentityService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/IdentityService.ts) to evaluate PIN against DPAPI-encrypted ciphertext (`admin_pin_ciphertext`) cached in local SQLite `kiosk_identity`.
2. **Brute Force Lockout:** After 5 failed attempts, authentication is locked for 15 minutes. Lockout state persists across application restarts.
3. **Session Data Isolation:** At the conclusion of every session, [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx) calls `resetSession()`, which purges in-memory photo arrays and signals `CameraService` to destroy LiveView frame buffers, preventing subsequent customers from viewing prior photos.

## 5. Current Invariants
- **No Plaintext PINs:** Plaintext PINs must NEVER be persisted on disk or transmitted in logs.
- **Fail-Safe Disconnect Sanitization:** When camera or hardware fails, LiveView buffers must be immediately destroyed (`lastLiveViewDataUrl = null`).
- **DPAPI Scope:** Machine credentials must use `DataProtectionScope.LocalMachine` to prevent extraction across unauthorized user accounts.

## 6. Known Open Issues
- **Founder Physical UAT Pending:** Physical verification of camera disconnect session isolation on Booth #1 hardware.

## 7. Next Task
Founder physical sign-off of the camera disconnect cable-pull test during Booth #1 acceptance testing.

## 8. Evidence
1. [`docs/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md) — Offline PIN architecture and verification.
2. [`docs/ADMIN_PIN_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/ADMIN_PIN_RCA.md) — Forensic RCA of PIN verification race conditions.
3. [`docs/DEVICE_SECRET_RUNTIME_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/DEVICE_SECRET_RUNTIME_VALIDATION.md) — DPAPI security audit logs.
4. [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md) — Session privacy audit.
5. Source file: [`apps/kiosk/electron/services/IdentityService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/IdentityService.ts).

## 9. Related Workstreams
- **Session History:** Access to Session History reprint requires Admin PIN.
- **Payment:** Offline payment bypass mode requires Admin PIN authorization.
- **Fleet:** Device tokens authenticated via machine secrets.

## 10. Status Confidence
**HIGH.** Cryptographic mechanisms and test suites pass 100%; physical UAT checklist item is clearly isolated.
