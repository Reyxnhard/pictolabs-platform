# PICTOLABS REMEDIATION PLAN: NEXT ACTION PLAN
**Document Reference**: `NEXT_ACTION_PLAN.md`  
**Target Goal**: Resolve Activation Freeze (P0), Fix Payment Screen Blinking (P1), and Enable Successful Fleet Provisioning UAT  
**Policy**: STRICT IMPLEMENTATION FREEZE — DESIGN & AUDIT ONLY UNTIL APPROVED  
**Standard**: Zero Architectural Redesign, Minimal-Risk Targeted Remediation, Zero Hardware/Payment Regressions  

---

## 1. Root Cause Validation

### A. Activation Screen Freeze (~T + 5s)
- **Validation**: **CONFIRMED 100%**.
- **Evidence**:
  1. At startup (`electron/main.ts:214`), `initStorageRetention()` registers `setTimeout(() => runRetentionCleanupNow(), 5000)`.
  2. `runRetentionCleanupNow()` executes synchronously on the Electron Main GUI thread.
  3. The function performs intensive synchronous disk I/O (`readdirSync`, `statSync`, `unlinkSync`) and hundreds of unindexed wildcard SQLite `%LIKE%` queries against `sessions`, `upload_queue`, and `session_recovery_ledger`.
  4. On realistic operational test data, this execution consumed **233,888 ms (3.9 minutes)** continuously on the main thread.
  5. Windows Desktop Window Manager (DWM) declares any thread hung if it does not process messages within 5,000 ms of user interaction or OS compositing probe, triggering `"Pictolabs Kiosk is not responding"`.
  6. Disabling `initStorageRetention()` allowed the application to run for **130+ continuous seconds** with `Responding: true` and zero freeze.
- **Critical Architectural Note**:
  The draft fix sitting in the unstaged working tree (`if (!isKioskPaired()) return;` with a 60s delay for paired booths) only temporarily protects unpaired kiosks on the activation screen. As soon as a kiosk is paired (or 60 seconds after startup for an active booth in a mall), it will trigger the same 233-second freeze during customer operations!
  **Conclusion**: Merely postponing or checking pairing status is insufficient. The cleanup daemon itself must be non-blocking and yield the event loop.

### B. Payment Screen Blinking Defect
- **Validation**: **CONFIRMED 100%**.
- **Evidence**:
  1. In `apps/kiosk/src/screens/PaymentScreen.tsx`, `useEffect` #3 (Crash Recovery & Auto-initiate) includes `session.sessionId` in its dependency array.
  2. When `requestQRIS()` executes, it calls `updateSession({ sessionId: res.sessionId })`.
  3. `updateSession` modifies the parent `session` in `App.tsx`, triggering a re-render of `PaymentScreen` with a new `session` reference.
  4. `useEffect` #3 re-triggers immediately. It finds `pictolabs-active-order-id` in `localStorage` and calls `kiosk.payment.checkStatus(savedOrderId)`.
  5. Since the order is freshly created and unpaid, `res.paid` is `false`.
  6. The `else` branch of the status check treats this as "expired or abandoned", deletes the key from `localStorage`, and calls `requestQRIS()` a second time.
  7. This creates an immediate state toggle (`INITIAL` $\rightarrow$ `GENERATING_QR` $\rightarrow$ `AWAITING_PAYMENT` $\rightarrow$ `GENERATING_QR` $\rightarrow$ `AWAITING_PAYMENT`), causing visible UI flashing, loading spinner flicker, and duplicate order creation.

---

## 2. Fix Strategy (Surgical, Zero-Redesign)

### Phase A: Fix StorageRetentionService (P0 Blocker)
1. **Event-Loop Yielding Architecture**:
   - Convert `runRetentionCleanupNow()` to an `async` function (`export async function runRetentionCleanupNow(...)`).
   - Introduce event-loop yields (`await new Promise((resolve) => setImmediate(resolve))`) during directory processing (e.g. after every 5 files examined or after each directory scan).
   - This ensures the Windows Win32 message pump pumps messages every $\le$ 2–5 ms, completely preventing Windows OS from detecting a hung thread.
2. **Context-Aware Execution Guards**:
   - Keep the guard: Do NOT run retention cleanup while the kiosk is in `ActivationScreen` or unpaired (`!isKioskPaired()`).
   - Do NOT run retention cleanup while an active customer photo session is in progress (`isSessionActive()`).
   - Defer startup retention cleanup until **60–120 seconds after kiosk boot**, and only when the kiosk is idle on `WelcomeScreen`.
3. **Preserve Three-Key Lock & Safety Guarantees**:
   - The purge decision logic in `evaluateThreeKeyLock()` remains completely identical (Key 1 TTL $\ge$ 7d, Key 2 Cloud Sync Verified, Key 3 Print Settled).
   - Zero change to file deletion thresholds or policies.

### Phase B: Fix PaymentScreen Blinking (P1 Bug)
1. **Mount-Only Initialization**:
   - Guard initial QRIS creation in `PaymentScreen.tsx` with a ref (`const initializedRef = useRef(false)`) so it runs **strictly once** when the component mounts.
   - Remove `session.sessionId` from the trigger dependencies of `useEffect` #3.
2. **Proper Handling of Active Pending Orders**:
   - If `savedOrderId` exists in `localStorage`, check status:
     - If `res.paid === true`: settle immediately and navigate forward.
     - If `res.status === 'PENDING'` or not expired: resume awaiting payment for that exact `orderId` without discarding it or re-requesting.
     - Only if the order is genuinely `EXPIRED` or cancelled should it generate a new order.
3. **Stabilize Timer & Poller Lifecycles**:
   - Update `timeLeft` countdown interval to avoid destroying/re-creating the timer every second.

### Phase C: Finalize Fleet Provisioning Flow (UAT)
1. **Keep Auto-Seed Strictly Disabled in Packaged Builds**:
   - Retain the fix in `IdentityService.ts`: when `app.isPackaged === true`, auto-seed is permanently disabled.
2. **Export Default in `ActivationScreen.tsx`**:
   - Guarantee `export default ActivationScreen;` is present to prevent React import crashes.
3. **Verify Dashboard Provisioning UI**:
   - Ensure the founder can pair a physical machine from the dashboard modal and verify the machine reflects as `ONLINE`.

---

## 3. Risk Assessment & Affected Modules

| Module | Files Involved | Risk Level | Regression Prevention & Mitigation |
| :--- | :--- | :---: | :--- |
| **Storage Daemon** | `apps/kiosk/electron/services/StorageRetentionService.ts`<br>`apps/kiosk/electron/main.ts` | **LOW** | Converting to async with `setImmediate` yields preserves identical deletion logic while freeing the GUI thread. Three-Key Lock logic is unchanged. |
| **Identity Service** | `apps/kiosk/electron/services/IdentityService.ts` | **LOW** | Only disables legacy auto-seed in packaged builds. Packaged kiosk correctly asks for token on fresh install. |
| **Payment UI** | `apps/kiosk/src/screens/PaymentScreen.tsx` | **LOW** | Standard React hook cleanup. Prevents duplicate QRIS calls and eliminates flicker. Backend payment APIs are untouched. |
| **Camera Service** | `apps/kiosk/electron/services/CameraService.ts` | **ZERO RISK** | **DO NOT TOUCH**. Canon EDSDK C++ addon is completely untouched. |
| **Render Engine** | `apps/kiosk/electron/services/RenderEngine.ts` | **ZERO RISK** | **DO NOT TOUCH**. Sharp 300 DPI engine is completely untouched. |
| **Backend Payments** | `apps/backend/src/payments/payments.service.ts` | **ZERO RISK** | **DO NOT TOUCH**. Midtrans QRIS core is completely untouched. |

---

## 4. Comprehensive Test Plan

### Test 1: Unpaired Kiosk Launch & Message Pump Liveness (Freeze Validation)
- **Precondition**: Remove `%ProgramData%\Pictolabs\identity.json`.
- **Action**: Launch packaged `Pictolabs Kiosk.exe`.
- **Assertions**:
  - `ActivationScreen` renders at $T \le 2.0$s.
  - At $T = 5.0$s, $10.0$s, $30.0$s, $60.0$s, $120.0$s: window responds to OS probes (`GetMessage`/`DispatchMessage`).
  - Windows title bar NEVER displays `"Pictolabs Kiosk is not responding"`.
  - Virtual keypad responds instantly to touch/click inputs without lag.

### Test 2: Paired Kiosk Startup & Heavy Retention Load (Non-Blocking Validation)
- **Precondition**: Kiosk is paired with valid identity. Seed `captures/`, `composites/`, `videos/` with 100+ files older than 7 days and 50 orphan files.
- **Action**: Launch `Pictolabs Kiosk.exe` and navigate between screens.
- **Assertions**:
  - Retention cleanup executes in background after deferred delay.
  - UI animations and clicks remain 60 FPS responsive throughout the cleanup run.
  - Expired files are safely purged according to Three-Key Lock.
  - No active, unprinted, or unsynced files are deleted.

### Test 3: Payment Screen Blinking & QR Generation Stability
- **Action**: Navigate to `PaymentScreen`.
- **Assertions**:
  - QR code generates and displays smoothly.
  - Zero screen flickering, zero double-loading spinners.
  - Only one QRIS transaction is registered in Midtrans / backend.
  - Countdown timer decrements smoothly by 1 second every second.
  - Simulating or completing payment advances to `frame-design` within 1.5 seconds.

### Test 4: End-to-End Fleet Provisioning UAT
- **Action**:
  1. In Admin Dashboard (`/booths`), click `Pair Device` or `+ Activate New Kiosk` to generate `ACT-XXXX-XXXX`.
  2. On fresh kiosk, enter `ACT-XXXX-XXXX` and click `Aktivasi Kiosk Sekarang`.
- **Assertions**:
  - Handshake completes in $<3$ seconds.
  - Kiosk stores encrypted secret via DPAPI in `identity.json`.
  - Kiosk transitions to `WelcomeScreen`.
  - Dashboard updates booth status to `ONLINE` with active telemetry.

---

## 5. Go / No-Go Recommendation

### Recommendation: **GO FOR SCOPED REMEDIATION**

**Rationale**:
1. The root cause of the activation freeze is definitively proven and verified both by code audit and empirical benchmark.
2. The root cause of the payment blinking bug is definitively mapped to a React hook re-render loop.
3. Both fixes are non-invasive, require zero database schema changes, zero architectural redesigns, and zero modifications to isolated hardware/payment services (`CameraService.ts`, `RenderEngine.ts`, `payments.service.ts`).
4. Approving this targeted plan will directly unblock founder UAT and achieve production launch readiness.
