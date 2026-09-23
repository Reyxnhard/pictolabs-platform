# Root Cause Analysis: Offline Payment Bypass Failure

**Incident Title**: Offline Payment Bypass Fails Due to Inverted Execution Order & Hard Network Dependency  
**Severity**: P0 Blocker (Kiosk Session Blocked When Offline Even With Bypass Enabled)  
**Status**: RCA Complete — Pending Implementation Authorization  
**Target Component**: `apps/kiosk/src/screens/PaymentScreen.tsx`, `apps/kiosk/electron/services/SyncEngine.ts`  
**Date**: September 24, 2026  

---

## 1. Executive Summary

During Pilot Readiness testing with internet disconnected:
1. The **Admin Panel** was successfully unlocked offline via local Windows DPAPI PIN verification (**PASS**).
2. The operator enabled **Mode Auto-Bypass Pembayaran** in the Admin Panel (`localStorage.setItem('pictolabs-auto-bypass-payment', 'true')`).
3. Upon returning to the customer workflow and entering the **Payment Screen**, the screen displayed:
   > **"GAGAL MEMBUAT PEMBAYARAN"**  
   > *Terjadi kesalahan komunikasi dengan server pembayaran.*
4. The kiosk session became completely blocked, rendering the photobooth unusable offline despite bypass being enabled (**FAIL**).

### Root Cause in One Sentence
**Payment Bypass was architected as a post-transaction settlement simulator rather than an entry-level authorization gate; `PaymentScreen` unconditionally invokes `requestQRIS()` over the network on mount, causing a fatal network exception that blocks the UI in `paymentState = 'ERROR'` before the auto-bypass listener can ever evaluate the bypass flag.**

---

## 2. Forensic Code Audit

### Audit 1: Payment Screen Initialization Flow
*File: `apps/kiosk/src/screens/PaymentScreen.tsx` (Lines 162–230)*

When `PaymentScreen` mounts, its initialization lifecycle executes:
```typescript
// ─── 3. Crash Recovery & Auto-initiate on Mount ────────────
useEffect(() => {
  if (hasInitiatedRef.current) return;
  hasInitiatedRef.current = true;

  const savedOrderId = localStorage.getItem('pictolabs-active-order-id');
  if (savedOrderId) {
    // Check status of previous order via network...
    kiosk.payment.checkStatus(savedOrderId)...
  } else {
    // ⚠️ UNCONDITIONAL INVOCATION OF REMOTE QRIS CREATION
    requestQRIS();
  }
}, []);
```

**Audit Finding**:
On component mount, if there is no pending `savedOrderId`, `PaymentScreen` **unconditionally** calls `requestQRIS()`. There is zero pre-flight inspection of `localStorage.getItem('pictolabs-auto-bypass-payment')`.

---

### Audit 2: Bypass Flag Read Timing
*File: `apps/kiosk/src/screens/PaymentScreen.tsx` (Lines 359–372)*

The only location in `PaymentScreen` where the auto-bypass flag is inspected is inside `useEffect #8`:
```typescript
// ─── 8. Auto-Bypass Listener (If enabled in Admin Panel) ────
useEffect(() => {
  if (paymentState === 'AWAITING_PAYMENT' && orderId) {
    const isAutoBypass =
      typeof window !== 'undefined' && localStorage.getItem('pictolabs-auto-bypass-payment') === 'true';
    if (isAutoBypass) {
      console.log('[PaymentScreen] Auto-Bypass active. Simulating payment settlement in 1.2s...');
      const timer = setTimeout(() => {
        handleBypassPayment();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }
}, [paymentState, orderId, handleBypassPayment]);
```

**Audit Finding**:
The bypass flag read is **trapped behind two strict prerequisites**:
1. `paymentState === 'AWAITING_PAYMENT'`
2. `orderId` must be truthy (non-empty string).

When offline:
- `requestQRIS()` fails during network dispatch.
- `paymentState` transitions: `'INITIAL'` ➔ `'GENERATING_QR'` ➔ `'ERROR'`.
- `paymentState` **never** equals `'AWAITING_PAYMENT'`.
- `orderId` remains `''`.

Consequently, **`useEffect #8` evaluates to false and never executes the bypass logic.**

---

### Audit 3: `createPayment()` Execution Path (`requestQRIS`)
*File: `apps/kiosk/src/screens/PaymentScreen.tsx` (Lines 120–159)*
*File: `apps/kiosk/electron/services/SyncEngine.ts` (Lines 1230–1263)*

Tracing the exact call stack when `requestQRIS()` executes:

1. `PaymentScreen.tsx`:
   ```typescript
   setPaymentState('GENERATING_QR');
   setErrorMessage(null);

   const res = await kiosk.payment.createQRIS({
     amount: price,
     productName: sessionRef.current.productName || 'Photostrip 2R',
   });
   ```
2. `preload.ts`:
   ```typescript
   createQRIS: (payload) => ipcRenderer.invoke('payment:create-qris', payload)
   ```
3. `SyncEngine.ts`:
   ```typescript
   ipcMain.handle('payment:create-qris', async (_event, params) => {
     const baseUrl = config.apiBaseUrl || 'http://localhost:4000';
     const boothId = params.boothId || config.boothId || config.deviceSecret;
     try {
       // ⚠️ HTTP POST ATTEMPT TO REMOTE / CLOUD BACKEND
       const res = await fetch(`${baseUrl}/api/payments/qris`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ boothId, amount: params.amount, ... }),
       });
       return await res.json();
     } catch (err: any) {
       // Catches network error (fetch failed / ENOTFOUND / ETIMEDOUT)
       return { success: false, error: err.message };
     }
   });
   ```
4. Back in `PaymentScreen.tsx`:
   ```typescript
   if (!res.success || !res.qrisString) {
     throw new Error(res.error || 'Gagal menghasilkan barcode QRIS');
   }
   // ...
   } catch (err: any) {
     console.error('[PaymentScreen] Error creating QRIS:', err);
     setErrorMessage(err.message || 'Gagal menghubungi gerbang pembayaran');
     setPaymentState('ERROR'); // ⚠️ TRANSITION TO FATAL ERROR
   }
   ```
5. `PaymentScreen.tsx` renders the Error Modal:
   ```tsx
   {paymentState === 'ERROR' && (
     <div className="...">
       <AlertTriangle className="w-10 h-10" />
       <h3>GAGAL MEMBUAT PEMBAYARAN</h3>
       <p>{errorMessage || 'Terjadi kesalahan komunikasi dengan server pembayaran.'}</p>
     </div>
   )}
   ```

---

### Audit 4: Midtrans Dependency Chain
*File: `apps/backend/src/payments/payments.service.ts` (Lines 57–160)*

If the kiosk was online or trying to reach a backend:
1. `PaymentsService.createQRIS()` calls Midtrans Core API:
   ```typescript
   const authHeader = `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`;
   const chargePayload = {
     payment_type: 'qris',
     transaction_details: { order_id: orderId, gross_amount: amount },
   };

   const midtransRes = await fetch(`${this.coreApiUrl}/v2/charge`, {
     method: 'POST',
     headers: { Authorization: authHeader, ... },
     body: JSON.stringify(chargePayload),
   });
   ```
2. When the internet connection is severed:
   - For remote kiosk: Kiosk network adapter cannot reach `baseUrl` (`api.pictolabs.id`).
   - For local backend: Backend cannot reach `api.sandbox.midtrans.com` or `api.midtrans.com`.
3. In all offline conditions, remote payment creation is mathematically guaranteed to fail.

---

### Audit 5: Evaluation Timing — Before vs. After Transaction Creation

| Phase | Expected (Offline Bypass) | Current Reality (Buggy Implementation) |
|---|---|---|
| **Evaluation Point** | **PRE-TRANSACTION** (Before any network calls) | **POST-TRANSACTION** (After order creation succeeds) |
| **Prerequisite** | `localStorage('pictolabs-auto-bypass-payment') === 'true'` | `paymentState === 'AWAITING_PAYMENT' && orderId != ''` |
| **Network Call** | NONE (0 HTTP calls, instant local settlement) | Remote `fetch('/api/payments/qris')` + Remote `fetch('/api/payments/simulate')` |
| **Offline Behavior** | Skips QRIS, mints local offline session, transitions to frame design | Throws network error, sets `paymentState = 'ERROR'`, blocks session |

Furthermore, the manual bypass handler `handleBypassPayment()` in `PaymentScreen.tsx` also contains the exact same dependency:
```typescript
const handleBypassPayment = useCallback(async () => {
  if (!orderId) return; // ⚠️ ABORTS IF NO ORDER ID EXISTS
  setIsBypassing(true);
  try {
    const backendUrl = ...;
    const res = await fetch(`${backendUrl}/api/payments/simulate/${orderId}`, ...);
    // ...
```
Because no `orderId` exists when offline, even clicking a bypass button would abort immediately.

---

## 3. Exact Execution Order Trace

The actual execution sequence observed in runtime:

```
┌────────────────────────────────────────────────────────┐
│ 1. Customer taps "Touch Screen" / selects Frame        │
│    App navigates to 'payment'                          │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. PaymentScreen Mounts                                │
│    - paymentState: 'INITIAL'                           │
│    - orderId: ''                                       │
│    - ⚠️ Auto-Bypass flag is NOT checked                │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 3. Mount Effect Runs (useEffect #3)                    │
│    - savedOrderId checked -> null                      │
│    - ⚠️ requestQRIS() invoked unconditionally          │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 4. requestQRIS() Initiated                             │
│    - paymentState -> 'GENERATING_QR'                   │
│    - kiosk.payment.createQRIS() called                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 5. IPC Dispatch (SyncEngine.ts)                        │
│    - fetch(`${baseUrl}/api/payments/qris`)             │
│    - ❌ NETWORK ERROR: "fetch failed" (Offline)        │
│    - SyncEngine returns { success: false, error: ... } │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 6. Error Handling in requestQRIS                       │
│    - res.success === false                             │
│    - Throws Error('fetch failed')                      │
│    - Catch block triggered                             │
│    - paymentState -> 'ERROR'                           │
│    - errorMessage: 'Gagal menghubungi gerbang...'      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 7. UI Renders Error State                              │
│    - "GAGAL MEMBUAT PEMBAYARAN" displayed              │
│    - Session deadlocked                                │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 8. Auto-Bypass Effect Evaluated (useEffect #8)         │
│    - Guard: (paymentState === 'AWAITING_PAYMENT'       │
│              && orderId)                               │
│    - Evaluates to: FALSE ('ERROR' !== 'AWAITING...'    │
│                    && '' is falsy)                     │
│    - ❌ Auto-Bypass logic NEVER FIRES                  │
└────────────────────────────────────────────────────────┘
```

---

## 4. Downstream Offline Readiness Audit

An audit was conducted on downstream screens to determine whether the photobooth can function if payment is bypassed offline:

| Component | Offline Readiness | Evidence / Mechanism |
|---|---|---|
| **CaptureScreen** | **100% Offline** | Uses local `@photolab/canon` SDK, local WebM muxer, and generates synthetic session ID (`session_${Date.now()}_${rand}`) if missing. |
| **RenderScreen** | **100% Offline** | Sharp runs in local Node.js process; saves final strip PNG locally; inserts session into local SQLite database; adds upload task to pending queue. |
| **PrintScreen** | **100% Offline** | Spools print job directly to local Win32 printer driver (e.g. DNP DS-RX1HS) via local OS spooler. |
| **QRScreen** | **100% Offline** | Displays LAN IP URL for local Wi-Fi download or offline placeholder; logs `COMPLETED` checkpoint in local ledger. |

**Conclusion**: The **entire hardware, rendering, printing, and session lifecycle is 100% offline-capable**. The Payment Screen is the single artificial blocker.

---

## 5. Architectural Flaw Summary

1. **Inverted Responsibility**: Auto-bypass was implemented as an "after-the-fact test simulation" of a remote webhook, not as an **operational bypass mode** designed for offline venue reliability.
2. **Missing Pre-Flight Gate**: The component lacks an entry-level check on mount to bypass payment initiation entirely.
3. **Hard Network Coupling in PaymentScreen**: `requestQRIS()` assumes network is always reachable, with no offline branch or synthetic local order minting.

---

## 6. Proposed Surgical Fix Architecture (Design Only)

When authorization is granted, the minimal surgical fix will:

1. **Evaluate Bypass Pre-Flight (On Mount)**:
   At the very top of `PaymentScreen` (or inside the mount effect *before* `requestQRIS`):
   ```typescript
   const isAutoBypass =
     typeof window !== 'undefined' && localStorage.getItem('pictolabs-auto-bypass-payment') === 'true';

   if (isAutoBypass) {
     // 1. Mint local offline synthetic order & session ID
     const localOrderId = `bypass_offline_${Date.now()}`;
     const localSessionId = sessionRef.current.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
     
     // 2. Update session context
     updateSession({ sessionId: localSessionId });
     
     // 3. Set visual settled state
     setOrderId(localOrderId);
     setPaymentState('SETTLED');
     
     // 4. Save checkpoint & navigate directly to frame-design in 800ms
     setTimeout(() => navigate('frame-design'), 800);
     return;
   }
   ```
2. **Zero Network Calls in Bypass Mode**:
   Bypass will never invoke `createQRIS` or call `/api/payments/simulate`.
3. **Local Error Recovery Bypass**:
   Even if the screen enters `paymentState === 'ERROR'` (e.g., if auto-bypass was toggled on after error), clicking the "Bypass" button will immediately settle locally without network requirements.

---
*Report compiled autonomously by Antigravity AI Engineering agent.*
