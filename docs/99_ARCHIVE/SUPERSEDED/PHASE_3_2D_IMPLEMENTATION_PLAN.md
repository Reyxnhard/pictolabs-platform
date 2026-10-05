# Pictolabs Phase 3.2D Implementation Plan: Crash Recovery Ledger & Mid-Capture Resiliency

**Document Version:** 1.0.0  
**Date:** September 13, 2026  
**Status:** Ready for Execution (Planning Only — No Code Changes Yet)  
**Target Milestone:** Phase 3.2D — Crash Recovery Ledger  
**Scope:** Electron Main Services, SQLite Schemas, IPC Bridge, and Renderer Screens  

---

## 1. Overview & Objectives

Phase 3.2D ensures that any sudden disruption (power outage, Windows reboot, Electron crash, or BSOD) during an active paid customer session does not cause loss of customer progress or financial loss.

This document details the exact execution blueprint for Phase 3.2D, encompassing file modifications, database migrations, testing strategies, and rollout safeguards.

---

## 2. Engineering Opinion: Why a Dedicated Ledger?

### Technical Comparison of Recovery Approaches:

| Architectural Approach | Feasibility | Technical Tradeoffs & Failure Modes | Verdict |
|---|---|---|---|
| **Approach 1: Using only `sessions` table** | Poor | The `sessions` table represents a finalized, settled business transaction. Forcing partial, rapidly mutating intermediate states (e.g. Pose 1 captured, Pose 2 pending, frame template draft) into `sessions`: <br>1. Violates domain integrity and schema nullability constraints.<br>2. Triggers premature or invalid cloud synchronization to PostgreSQL via `SyncEngine`.<br>3. Creates race conditions between background upload workers and active camera capture threads. | **REJECTED** |
| **Approach 2: Using only Queues (`upload_queue` & `print_queue`)** | Inadequate | Queues are asynchronous background job dispatchers designed solely for file I/O operations (R2 HTTP uploads and Win32 print spooling). They have zero concept of user journey, screen navigation, camera pose indices, countdown state, or UI restoration. | **REJECTED** |
| **Approach 3: Using only Startup Filesystem Scanning** | Brittle & Risky | Relying on scanning `captures/` and `videos/` on startup to infer what happened is non-deterministic: <br>1. Cannot distinguish between an abandoned retake, a discarded test photo, and a customer's active Pose 2.<br>2. Cannot determine customer product selection, frame template, price paid, or payment order ID.<br>3. Risks reviving dirty or cancelled sessions. | **REJECTED** |
| **Approach 4: Dedicated Write-Ahead Crash Recovery Ledger (Selected)** | Optimal | Adopts the classic **Write-Ahead Log (WAL) pattern**: <br>1. Atomically persists step-by-step state checkpoints in sub-millisecond SQLite writes.<br>2. Decouples ephemeral operational progress from finalized analytical session records.<br>3. Enables deterministic state hydration upon Electron boot.<br>4. Supports automated expiration (15-minute TTL) and graceful fallback to Rescue Vouchers. | **RECOMMENDED (SELECTED)** |

---

## 3. Files to Change & Affected Components

### 3.1 Electron Main Process & Services

1. **`apps/kiosk/electron/services/RecoveryLedgerService.ts` [NEW FILE]**
   - Implements `RecoveryLedgerService`:
     - `initRecoveryLedger(db)`: SQLite table creation and prepared statements.
     - `recordPaymentSettled(orderId, sessionId, productData)`: Initial ledger journal entry.
     - `updateLedgerCheckpoint(sessionId, stage, step, payloadUpdate)`: Sub-millisecond step updates.
     - `getActiveRecoverableSession()`: Queries for unexpired (`< 15 min`), uncompleted sessions on boot.
     - `markLedgerRecovered(sessionId)`: Increments `recovery_attempts`.
     - `markLedgerCompleted(sessionId)`: Marks normal end-of-session completion.
     - `generateRescueVoucher(sessionId, reason)`: Generates cryptographic voucher code.
     - `registerRecoveryLedgerHandlers()`: IPC endpoints for renderer communication.

2. **`apps/kiosk/electron/services/SyncEngine.ts` [MODIFY]**
   - Integrate `session_recovery_ledger` table creation in `initDatabase()`.
   - Add SQLite index: `CREATE INDEX IF NOT EXISTS idx_recovery_active ON session_recovery_ledger(status, expires_at);`.
   - Prevent `StorageRetentionService` orphan janitor from purging files tracked in an active recovery ledger.

3. **`apps/kiosk/electron/main.ts` [MODIFY]**
   - Register `registerRecoveryLedgerHandlers()` during `app.whenReady()`.
   - Wire boot check: broadcast `kiosk:recovery-detected` to renderer upon window load if an active recoverable session exists.

### 3.2 IPC Bridge & Renderer Contract

4. **`apps/kiosk/electron/preload.ts` [MODIFY]**
   - Expose `kiosk.recovery`:
     - `checkRecoverableSession()`: Promise<RecoverableSession | null>
     - `resumeSession(sessionId)`: Promise<SessionData>
     - `discardSession(sessionId)`: Promise<void>
     - `claimRescueVoucher(sessionId)`: Promise<RescueVoucher>
     - `checkpoint(stage, step, payload)`: Promise<void>

5. **`apps/kiosk/src/ipc/bridge.ts` [MODIFY]**
   - Add TypeScript interfaces: `RecoveryStage`, `RecoveryLedgerItem`, `RescueVoucher`.
   - Provide browser mock implementations for local web dev mode.

### 3.3 React Frontend Screens & State Management

6. **`apps/kiosk/src/App.tsx` [MODIFY]**
   - On initial mount (`useEffect`), call `kiosk.recovery.checkRecoverableSession()`.
   - If an active recoverable session is returned, display an interactive **Session Recovery Modal**:
     - Shows photo preview, elapsed time, and stage (*"Lanjutkan Sesi Anda?"*).
     - Allows 60-second customer auto-resume or manual cancel.
     - Hydrates `session` state and navigates directly to target screen (`capture`, `filter`, `render`, or `qr`).

7. **`apps/kiosk/src/screens/PaymentScreen.tsx` [MODIFY]**
   - When QRIS payment settles, immediately call `kiosk.recovery.checkpoint('PAYMENT_SETTLED', 0, payload)`.

8. **`apps/kiosk/src/screens/FrameDesignScreen.tsx` [MODIFY]**
   - Upon selecting frame design, call `kiosk.recovery.checkpoint('FRAME_SELECTED', 0, { frameDesignId })`.

9. **`apps/kiosk/src/screens/CaptureScreen.tsx` [MODIFY]**
   - Support initialization with existing `photos` array and starting pose index `currentPose = initialPose`.
   - In `handleNext()`: after each pose capture, call `kiosk.recovery.checkpoint('CAPTURING', nextPose, { photos })`.
   - In `handleRetake()`: sync updated photos array to ledger checkpoint.

10. **`apps/kiosk/src/screens/RenderScreen.tsx` [MODIFY]**
    - Call `kiosk.recovery.checkpoint('RENDER_PENDING', totalPoses, { filter })` before Sharp execution.
    - Upon render completion, call `kiosk.recovery.checkpoint('READY_FOR_PRINT', totalPoses, { compositePath })`.

11. **`apps/kiosk/src/screens/QRScreen.tsx` [MODIFY]**
    - Upon countdown completion or customer tapping "Selesai", call `kiosk.recovery.checkpoint('COMPLETED', totalPoses, {})`.

---

## 4. SQLite Impact & Database Migration

### 4.1 Schema Additions (Additive & Zero Breaking Changes)

```sql
-- apps/kiosk/electron/services/RecoveryLedgerService.ts
CREATE TABLE IF NOT EXISTS session_recovery_ledger (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE',          -- 'ACTIVE', 'RECOVERED', 'ABANDONED', 'COMPLETED'
  stage TEXT NOT NULL,                           -- 'PAYMENT_SETTLED', 'FRAME_SELECTED', 'CAPTURING', 'RENDER_PENDING', 'READY_FOR_PRINT', 'COMPLETED'
  last_completed_step INTEGER NOT NULL DEFAULT 0, -- Pose index (0, 1, 2, 3, 4)
  payload TEXT NOT NULL,                         -- Serialized JSON snapshot of session data
  error_details TEXT,                            -- Diagnostic crash log if available
  recovery_attempts INTEGER NOT NULL DEFAULT 0,  -- Loop detection safeguard (max 2)
  expires_at TEXT NOT NULL,                      -- ISO String (Now + 15 minutes)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recovery_active ON session_recovery_ledger(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_recovery_session ON session_recovery_ledger(session_id);
```

### 4.2 Migration Strategy
- Fully backward compatible: executes via `CREATE TABLE IF NOT EXISTS`.
- No modifications to existing `sessions`, `upload_queue`, or `print_queue` column definitions.
- Automatic WAL mode checkpointing integrated with Phase 3.2C's `runDatabaseCompaction()`.

---

## 5. Cloud Backend Impact

### 5.1 Rescue Voucher Cloud Verification Endpoint
- Cloud API endpoint: `POST /api/vouchers/issue` and `POST /api/vouchers/redeem`.
- If a customer session cannot be physically completed at Booth #1 due to hardware breakdown, the ledger issues a signed cryptographic voucher:
  ```json
  {
    "voucherCode": "VOUCH-B01-SESS1789-A9B4F1",
    "amount": 35000,
    "product": "Photostrip 2R",
    "validUntil": "2026-10-13T18:00:00Z",
    "signature": "hmac_sha256_signature"
  }
  ```
- Any kiosk in the fleet scanning this voucher can validate it with central PostgreSQL and start a complimentary session.

---

## 6. Comprehensive Testing Plan

We will create an automated unit/integration test suite:  
**`apps/kiosk/electron/services/crash-recovery.spec.ts`**

### Test Scenarios to Verify:
1. **Test 1: Payment Settlement Journaling**
   - Verify ledger creates `ACTIVE` record with 15-minute TTL when payment is confirmed.
2. **Test 2: Mid-Capture Checkpointing**
   - Simulate Pose 1 $\rightarrow$ verify ledger updates `last_completed_step = 1`.
   - Simulate Pose 2 $\rightarrow$ verify ledger updates `last_completed_step = 2`.
   - Simulate Retake $\rightarrow$ verify ledger updates photo array accordingly.
3. **Test 3: Startup Recovery Detection**
   - Simulate sudden process crash at Pose 2.
   - Re-initialize service $\rightarrow$ verify `getActiveRecoverableSession()` detects session.
   - Verify integrity check on disk captures.
4. **Test 4: Render Interruption Recovery**
   - Crash during composite render $\rightarrow$ verify recovery resumes with all 4 photos intact.
5. **Test 5: Crash Loop Prevention (Circuit Breaker)**
   - Simulate repeated crash on same session.
   - Verify that after 2 failed recovery attempts, session is marked `ABANDONED` and issues a `RescueVoucher`.
6. **Test 6: Expiration Janitor**
   - Verify that sessions older than 15 minutes are not restored to the UI and transition to `EXPIRED`.

---

## 7. Rollout & Safety Plan

1. **Feature Flagging**:
   - `enableCrashRecoveryLedger: true` (default). Can be toggled off instantly in `kiosk-config.json` if required.
2. **Interactive Customer Prompt**:
   - The kiosk will never restart camera capture unexpectedly in front of a new customer.
   - It always shows a 60-second dialog with clear buttons:
     - `[ Lanjutkan Sesi ]`: Resumes photos immediately.
     - `[ Sesi Baru / Cetak Voucher ]`: Issues voucher and resets kiosk for next person.
3. **Zero Impact on Happy Path**:
   - Normal customer sessions take < 2 minutes and mark ledger `'COMPLETED'`, which is pruned during daily maintenance.
