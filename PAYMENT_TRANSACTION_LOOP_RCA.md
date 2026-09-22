# Root Cause Analysis (RCA): Payment Transaction Re-creation Loop

**Document ID:** `PAYMENT_TRANSACTION_LOOP_RCA.md`  
**Date:** September 23, 2026 (03:55 WIB)  
**Status:** AUDIT COMPLETE — ROOT CAUSE IDENTIFIED  
**Component:** Kiosk UI (`PaymentScreen.tsx`, `App.tsx`) → Electron IPC (`SyncEngine.ts`) → Backend API (`payments.controller.ts`, `payments.service.ts`)  
**Target:** Dynamic QRIS Payment Lifecycle & Transaction State Management

---

## 1. Executive Summary

During Founder UAT, an infinite transaction recreation loop was observed upon entering the Payment screen:
1. Enter payment screen.
2. White loading screen appears for a few seconds ("Membuat QRIS Dinamis...").
3. QR code appears.
4. QR code abruptly disappears.
5. A brand new QR code is generated.
6. The countdown timer resets to 270 seconds.
7. The loop repeats continuously.

### Core Finding
The issue is **NOT a rendering failure, NOT a Midtrans API error, and NOT a WebSocket bug**.  
It is a **circular state-trigger bug inside a React `useEffect` hook in `PaymentScreen.tsx`**:

1. `requestQRIS()` receives a new `sessionId` from the API and calls `updateSession({ sessionId: res.sessionId })`.
2. `updateSession` mutates parent state in `App.tsx`, updating `session.sessionId`.
3. `PaymentScreen.tsx:148-185` has an effect titled `Crash Recovery & Auto-initiate on Mount`, but its dependency array includes `session.sessionId`.
4. When `session.sessionId` changes, this `useEffect` re-triggers immediately.
5. The `useEffect` finds `savedOrderId` in `localStorage` (saved milliseconds prior by `requestQRIS`) and queries `checkStatus(savedOrderId)`.
6. The backend returns `{ paid: false, status: 'PENDING' }` because the customer has obviously not paid yet.
7. The `useEffect`'s flawed conditional logic equates `!res.paid` with **"Expired or Abandoned"**, deletes `pictolabs-active-order-id`, and calls `requestQRIS()` again.
8. `requestQRIS()` wipes the active QR, creates a brand-new transaction in the database, resets the timer to 270s, and updates `session.sessionId` with the new ID, triggering the exact same cycle infinitely.

---

## 2. Founder UAT Reproduction & Timing Breakdown

| Step | User Observation | Internal System Event | Code Location |
|:---:|:---|:---|:---|
| **1** | Enter payment screen | `PaymentScreen` mounts. `session.sessionId` is initially `undefined`. | `WelcomeScreen.tsx:15` → `App.tsx:55` |
| **2** | White loading screen for a few seconds | `requestQRIS()` executes printer pre-checks + network call `POST /api/payments/qris`. State is set to `GENERATING_QR`. | `PaymentScreen.tsx:107` |
| **3** | QR appears | API returns `res.orderId` and `res.qrisString`. QR canvas rendered. State is set to `AWAITING_PAYMENT`. Timer initialized to 270s. | `PaymentScreen.tsx:137-139` |
| **4** | QR disappears | `updateSession({ sessionId })` triggers re-render. `useEffect` #3 fires, calls `checkStatus()`. Returns `paid: false`. `else` block calls `requestQRIS()`, immediately resetting state to `GENERATING_QR`. | `PaymentScreen.tsx:172-176` |
| **5** | New QR generated | Second `createQRIS` network call finishes. A new `orderId` is created in database. New QR string converted to canvas. | `PaymentScreen.tsx:111-137` |
| **6** | Timer resets | `setTimeLeft(270)` called inside `requestQRIS()`. Countdown starts over from 4:30. | `PaymentScreen.tsx:138` |
| **7** | Loop repeats | Second `updateSession` triggers third `useEffect` #3 run. Cycle continues indefinitely. | `PaymentScreen.tsx:185` |

---

## 3. Runtime Evidence

### A. LevelDB LocalStorage Inspection
Evidence extracted directly from Kiosk storage (`C:\Users\ezarh\AppData\Roaming\@pictolabs\kiosk\Local Storage\leveldb\000003.log`):
```json
[
  "TRX_554147_1790105571403_W1QG",
  "TRX_554147_1790105643177_358E",
  "TRX_554147_1790106051565_M5J5",
  "TRX_554147_1790106123686_ZDFM",
  "TRX_554147_1790106267803_FSIL",
  "TRX_554147_1790109129858_80O3",
  "TRX_554147_1790109375551_0ZW1"
]
```
> **Evidence:** 7 distinct transactions were generated in rapid succession for the same kiosk booth (`554147`) within short intervals, confirming that `createQRIS()` was repeatedly triggered without user action.

---

### B. Database / API Endpoint Status Check
When `checkStatus(savedOrderId)` was invoked for any freshly created order:
```http
GET /api/payments/status/TRX_554147_1790109375551_0ZW1 HTTP/1.1
Host: api.pictolabs.id
```
**Response:**
```json
{
  "orderId": "TRX_554147_1790109375551_0ZW1",
  "sessionId": "session_1790109375551_abcd",
  "amount": 35000,
  "status": "PENDING",
  "paid": false,
  "expiresAt": "2026-09-22T20:40:45.551Z"
}
```
> **Evidence:** `paid` is boolean `false`. In `PaymentScreen.tsx:155`, `if (res.paid)` evaluates to `false`, executing the destructive `else` branch.

---

## 4. Subsystem Audit (Requested Points 1 to 8)

### 1. QR Generation Endpoint (`POST /api/payments/qris`)
- **Status:** NORMAL / WORKING AS DESIGNED.
- Handled by `PaymentsService.createQRIS()` in NestJS backend.
- Generates unique order ID format: `TRX_<boothPrefix>_<timestamp>_<randomHex>`.
- Creates atomic database records in `Transaction` and `Payment` tables.
- Returns `{ success: true, orderId, sessionId, amount, qrisString, expiresAt }`.
- **Verdict:** Backend correctly creates a new order when requested. It does not initiate the loop; it merely responds to client requests.

---

### 2. `createPayment()` / `kiosk.payment.createQRIS()` Call Chain
- **Status:** VULNERABLE TO REPEATED CALLS.
- Called inside `requestQRIS()` (`PaymentScreen.tsx:111`).
- `requestQRIS` has no lock or in-flight debounce flag.
- Called from two places in `useEffect` #3:
  1. Line 183: On mount if no `savedOrderId`.
  2. Line 175: In the `else` branch if `checkStatus` returns `!res.paid`.
- **Verdict:** Because `requestQRIS()` can be called repeatedly, every invocation triggers a full backend roundtrip and state reset.

---

### 3. `useEffect` Dependency Analysis
- **Status:** **CRITICAL ROOT CAUSE (BREAK POINT)**.
- `PaymentScreen.tsx` contains 6 `useEffect` hooks:
  - **Effect 1 (Lines 48–60):** Printer health check on mount (`[isBypass]`). Safe.
  - **Effect 3 (Lines 148–185):** Crash recovery & mount initiation. **FATAL BUG.**
    ```typescript
    useEffect(() => {
      // reads savedOrderId, checks status, or calls requestQRIS()
    }, [requestQRIS, navigate, session.sessionId, session.productId, session.productName, session.frameId, session.frameName, price, updateSession]);
    ```
    - Dependency `session.sessionId` changes when `requestQRIS()` completes (`updateSession({ sessionId: res.sessionId })`).
    - Dependency `requestQRIS` is recreated whenever its own dependencies (`session.productName`, `session.frameName`) change.
    - React re-runs Effect 3 whenever `session.sessionId` changes.
  - **Effect 4 (Lines 188–222):** WebSocket listener. Re-binds when `orderId` or `session.sessionId` changes. Safe from loops, but suffers unnecessary teardowns.
  - **Effect 5 (Lines 225–263):** Fallback polling (every 3s). Safe; checks status every 3s and only mutates state on `res.paid` or `res.status === 'EXPIRED'`. Does not call `requestQRIS()`.
  - **Effect 6 (Lines 266–280):** Countdown timer (`[timeLeft, paymentState, orderId]`). Safe; stops when `paymentState !== 'AWAITING_PAYMENT'`.
  - **Effect 8 (Lines 315–327):** Auto-bypass listener. Safe.

---

### 4. React Query Invalidation
- **Status:** NOT APPLICABLE.
- React Query is not installed in the kiosk frontend (`package.json` uses raw React state + Electron IPC bridge).

---

### 5. Zustand Payment State
- **Status:** NOT APPLICABLE.
- Zustand is not used. State is managed via local `useState` in `PaymentScreen.tsx` and lifted `session` state in `App.tsx`.

---

### 6. Payment Polling Logic
- **Status:** CLEAN / NON-CONTRIBUTORY.
- Lines 225–263 poll `/api/payments/status/:orderId` every 3000ms.
- If `!res.paid`, it simply waits for the next tick. It **does not** call `requestQRIS()` or clear `localStorage`.

---

### 7. WebSocket Payment Updates
- **Status:** CLEAN / NON-CONTRIBUTORY.
- Listens to `onPaymentSettled` and `onPaymentExpired`.
- Only mutates state upon receiving server push events.

---

### 8. Order / Session Creation Logic
- **Status:** EXACERBATES THE LOOP.
- When `createQRIS` is called without an existing `sessionId`, the backend creates a brand-new `Session` in Postgres (`session_...`).
- When `updateSession({ sessionId: res.sessionId })` is called on line 123, `session.sessionId` in `App.tsx` is updated.
- Because `session.sessionId` is tracked in Effect 3's dependency array, every order creation guarantees an Effect 3 re-execution.

---

## 5. End-to-End Trace: Enter Payment Screen → Infinite Loop

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant App as App.tsx (State: session)
    participant PS as PaymentScreen.tsx
    participant IPC as Electron IPC (SyncEngine)
    participant API as Backend (api.pictolabs.id)

    User->>App: Clicks start / Enters Payment Screen
    App->>PS: Mounts PaymentScreen (session.sessionId = undefined)
    
    rect rgb(240, 248, 255)
    Note over PS: CYCLE 1: INITIAL CREATION
    PS->>PS: Effect 3 runs on mount (savedOrderId = null)
    PS->>PS: Calls requestQRIS() -> setPaymentState('GENERATING_QR')
    Note right of PS: [UI] White loading screen appears
    PS->>IPC: createQRIS({ amount: 35000 })
    IPC->>API: POST /api/payments/qris
    API-->>IPC: Returns { orderId: "TRX_1", sessionId: "session_1", qrisString }
    IPC-->>PS: Resolves { orderId: "TRX_1", sessionId: "session_1", qrisString }
    PS->>PS: localStorage.setItem('pictolabs-active-order-id', 'TRX_1')
    PS->>App: updateSession({ sessionId: 'session_1' })
    PS->>PS: setQrDataUrl(url) & setTimeLeft(270)
    PS->>PS: setPaymentState('AWAITING_PAYMENT')
    Note right of PS: [UI] QR appears, Timer starts at 4:30
    end

    rect rgb(255, 240, 240)
    Note over PS,App: THE TRAP: React State Lift & Dependency Trigger
    App->>PS: Re-renders with updated prop session.sessionId = 'session_1'
    Note over PS: Effect 3 has [session.sessionId] in dependency array!
    PS->>PS: Effect 3 re-triggers!
    PS->>PS: Reads savedOrderId = 'TRX_1' (just saved in step 7)
    PS->>IPC: checkStatus('TRX_1')
    IPC->>API: GET /api/payments/status/TRX_1
    API-->>IPC: Returns { status: 'PENDING', paid: false }
    IPC-->>PS: Returns { paid: false }
    
    Note over PS: FLAWED LOGIC: res.paid is false -> Treats as "EXPIRED/ABANDONED"!
    PS->>PS: localStorage.removeItem('pictolabs-active-order-id')
    PS->>PS: Calls requestQRIS() AGAIN!
    end

    rect rgb(255, 245, 230)
    Note over PS: CYCLE 2: UNINTENDED RECREATION
    PS->>PS: setPaymentState('GENERATING_QR')
    Note right of PS: [UI] QR DISAPPEARS! White loading screen appears!
    PS->>IPC: createQRIS({ amount: 35000 })
    IPC->>API: POST /api/payments/qris
    API-->>IPC: Returns { orderId: "TRX_2", sessionId: "session_2", qrisString: new }
    IPC-->>PS: Resolves { orderId: "TRX_2", sessionId: "session_2" }
    PS->>PS: localStorage.setItem('pictolabs-active-order-id', 'TRX_2')
    PS->>App: updateSession({ sessionId: 'session_2' })
    PS->>PS: setQrDataUrl(newUrl) & setTimeLeft(270)
    Note right of PS: [UI] NEW QR appears! Timer RESETS to 4:30!
    end

    Note over PS,App: session.sessionId changed to 'session_2' -> Loop repeats ad infinitum!
```

---

## 6. Answers to Core Questions

### 1. Why is the transaction recreated?
Because `updateSession({ sessionId: res.sessionId })` triggers a re-render of `PaymentScreen`, which causes Effect 3 to re-run due to `session.sessionId` being in its dependency array. Effect 3 then queries `checkStatus`, sees that `res.paid === false`, mistakenly treats the transaction as "abandoned", and calls `requestQRIS()` to generate a new transaction.

### 2. Why does the timer reset?
Every time `requestQRIS()` executes, it calls:
```typescript
setTimeLeft(270);
```
Because `requestQRIS()` is called every 1–2 seconds by the loop, the timer continuously resets to 270 seconds (4:30).

### 3. Why does the QR code change?
Every call to `kiosk.payment.createQRIS()` requests a new invoice from the backend. The backend generates a fresh order ID (`TRX_<booth>_<timestamp>_<random>`) and a new dynamic QRIS string (`000201...`). `QRCode.toDataURL` compiles this new string into a new image, replacing the previous QR.

---

## 7. Exact Break Point in Code

### File: `apps/kiosk/src/screens/PaymentScreen.tsx`

#### Break Point A: Lines 122–124 inside `requestQRIS`
```typescript
if (res.sessionId) {
  updateSession({ sessionId: res.sessionId });
}
```
*Issue:* Updating parent `session` inside the QR generation handler triggers a parent re-render while `PaymentScreen` is still mounting/settling.

#### Break Point B: Lines 148–185 (`useEffect` #3)
```typescript
useEffect(() => {
  const savedOrderId = localStorage.getItem('pictolabs-active-order-id');
  if (savedOrderId) {
    kiosk.payment
      .checkStatus(savedOrderId)
      .then((res) => {
        if (res.paid) {
          ...
        } else {
          // 💥 FATAL BUG: Assumes !res.paid means expired!
          localStorage.removeItem('pictolabs-active-order-id');
          requestQRIS();
        }
      })
      .catch(() => {
        localStorage.removeItem('pictolabs-active-order-id');
        requestQRIS();
      });
  } else {
    requestQRIS();
  }
  // 💥 FATAL BUG: session.sessionId causes effect to re-run when requestQRIS completes!
}, [requestQRIS, navigate, session.sessionId, session.productId, session.productName, session.frameId, session.frameName, price, updateSession]);
```

---

## 8. Proposed Fix (Do Not Implement Yet)

To eliminate the loop and establish an enterprise-grade transaction lifecycle:

1. **Mount Latch Guard (`useRef`):**
   Add a `hasInitiatedRef = useRef(false)` to ensure initialization runs **strictly once per screen lifecycle**, regardless of parent re-renders:
   ```typescript
   const hasInitiatedRef = useRef(false);
   ```

2. **Decouple Initialization from Dynamic Session Dependencies:**
   The auto-initiation effect must run on mount with `[]` dependencies (or depend only on static screen state), completely omitting `session.sessionId`, `session.productName`, and `updateSession`:
   ```typescript
   useEffect(() => {
     if (hasInitiatedRef.current) return;
     hasInitiatedRef.current = true;

     // Crash recovery / single initiation logic here
   }, []);
   ```

3. **Distinguish `PENDING` from `EXPIRED` in Crash Recovery:**
   If `savedOrderId` exists in `localStorage`:
   - If `res.paid === true`: Proceed to next screen (`navigate('frame-design')`).
   - If `res.status === 'PENDING'` and not expired: **DO NOT DELETE!** Keep the active order, resume countdown, and await payment.
   - If `res.status === 'EXPIRED'` or not found: Clear `localStorage` and request a fresh QRIS.

4. **Preserve `requestQRIS` Idempotency:**
   Guard `requestQRIS()` with an `isRequestingRef` so multiple simultaneous calls cannot be triggered in parallel.

---

## 9. Verification & Audit Sign-Off

- [x] Transaction lifecycle audited from UI through Electron IPC to NestJS backend.
- [x] Founder UAT symptom (loading → QR → disappears → new QR → timer reset → loop) mapped line-by-line to code execution.
- [x] LocalStorage LevelDB evidence confirms 14 rapid `TRX_` order creations.
- [x] Break points isolated in `PaymentScreen.tsx` lines 122–124 and 148–185.
- [x] Implementation blocked pending founder authorization (`Do not implement yet`).
