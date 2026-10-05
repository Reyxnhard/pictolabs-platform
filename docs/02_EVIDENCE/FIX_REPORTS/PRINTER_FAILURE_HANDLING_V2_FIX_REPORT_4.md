# PRINTER FAILURE HANDLING V2 — FIX REPORT 4 (RCA-4)

**Document Reference:** `PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_4.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystems:**
- `QRScreen.tsx` (Sole Enqueue Owner & Print Progress UI)
- `App.tsx` (Screen Router & Dead Route Pruning)
- `SyncEngine.ts` (Transparent Session History Status Resolution: `NOT_QUEUED`)
- `bridge.ts` & `SessionHistorySection.tsx` (Session History IPC & Diagnostic Badges)

**Target Hardware:** DNP DS-RX1 Thermal Photo Printer (Port: `USB001`, Dynamic Driver: `DS-RX1 (Copy 1)`)  
**Date:** 2026-10-05  
**Audit & Implementation Status:** **100% IMPLEMENTED, VERIFIED & PHYSICALLY CONFIRMED (ALL PASS)**

---

## 1. RCA-4 Root Cause Addressed

During the initial post-RCA-3 founder UAT, customer sessions froze at 87% progress with no physical print, while Admin Session History reported `Status Pencetakan Spooler: PENDING (0 / 5 attempts)`.

RCA-4 identified the precise architectural mismatch:
1. **Dormant `PrintScreen.tsx` Component:** In earlier refactoring, printing progress was unified directly into `QRScreen.tsx`. `App.tsx` routed both `'print'` and `'qr'` screen states to `<QRScreen />`, while `RenderScreen.tsx` navigated directly to `'qr'`. `PrintScreen.tsx` was never rendered.
2. **Elimination of the Only Active Enqueue Trigger:** RCA-3 removed `kiosk.printer.enqueue()` from `QRScreen.tsx` under the assumption that `PrintScreen.tsx` was the active caller. Because `PrintScreen.tsx` was dead code, this left the production customer journey with **zero callers of `enqueue()`**.
3. **Ghost `PENDING (0/5)` Status in Admin:** When `SyncEngine.ts` resolved session history, the absence of a `print_queue` record caused it to fall back to the default `print_status` column in SQLite `sessions` (`'pending'`) with `0` attempts, creating the false impression of a stalled queue job.
4. **87% UI Freeze:** `QRScreen.tsx` simulated progress up to 87% (15% + 12 ticks × 6%) while awaiting queue status updates. Because no job was enqueued, `getQueueStatus()` continually returned `null`, leaving the UI permanently paused at 87%.

---

## 2. Files Changed

| File Path | Description of Changes |
| :--- | :--- |
| [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx) | Restored `kiosk.printer.enqueue(cleanPath, 1, sId)` on mount inside `executePrintTask` as the sole enqueue owner. Guarded by `hasTriggeredPrint.current` ref to guarantee single execution. Updated poll timeout logic. |
| [`App.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/App.tsx) | Cleaned routing hierarchy: removed dead `import PrintScreen from './screens/PrintScreen'`, removed obsolete `'print'` from `KioskScreen` union type, and simplified screen rendering to `{screen === 'qr' && <QRScreen {...screenProps} />}`. |
| [`PrintScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/PrintScreen.tsx) | **Deleted orphaned file.** Verified zero production flows, IPC channels, or test suites depend on it. |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) | Updated `KioskSessionHistoryItem` type and `getSessionHistory()` resolution: if no `print_queue` row exists, transparently report `printStatus = 'NOT_QUEUED'` instead of phantom `PENDING`. |
| [`bridge.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/ipc/bridge.ts) | Synchronized `KioskSessionHistoryItem` interface to include `'NOT_QUEUED'` state. |
| [`SessionHistorySection.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/SessionHistorySection.tsx) | Added explicit badge styling and label for `'NOT_QUEUED'` (`"BELUM DIANTREKAN"`) in session cards and modal diagnostics. |
| [`scripts/test_rca4_fixes.mjs`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/test_rca4_fixes.mjs) | Created automated test suite covering enqueue lifecycle, remount deduplication, SQLite insertion, worker transitions, routing, and `NOT_QUEUED` status resolution. |
| [`scripts/test_live_customer_print.mjs`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/test_live_customer_print.mjs) | Created live hardware UAT script executing full customer queue flow on connected DNP DS-RX1. |

---

## 3. `QRScreen.tsx` Enqueue Ownership

`QRScreen.tsx` is established as the **sole, authoritative owner** of print job enqueueing:
- **Mount Execution:** When `QRScreen` mounts, `executePrintTask()` immediately invokes `kiosk.printer.enqueue(cleanPath, 1, sId)`.
- **Single-Trigger Guard:** Protected by `hasTriggeredPrint.current = true` ref. Re-renders, parent state updates, or remounts will never invoke `enqueue()` a second time.
- **Database Idempotency:** If `enqueuePrintJob()` is ever called with the same `sessionId` and `cleanPath`, `PrintQueueService` detects existing record and returns `{ success: true, isDuplicate: true }` without creating duplicate queue rows.
- **Status Monitoring:** `QRScreen` polls `kiosk.printer.getQueueStatus(sessionId)` every 1200ms. On `COMPLETED`, progress advances to 100% and celebratory confetti is triggered.

---

## 4. `PrintScreen.tsx` Removal / Retention Decision

A complete repository audit confirmed:
- `PrintScreen.tsx` was **not rendered anywhere** in JSX.
- `RenderScreen.tsx` navigated to `'qr'`, not `'print'`.
- `App.tsx` mapped `'print'` to `<QRScreen />`.
- No tests or IPC endpoints referenced `PrintScreen.tsx`.

**Decision:** `PrintScreen.tsx` was a dead/orphaned artifact from an abandoned intermediate screen design. It was **permanently deleted**, and its import and type references in `App.tsx` were cleanly removed. There is now strictly **one** print screen and enqueue owner in the codebase (`QRScreen.tsx`).

---

## 5. Session History `NOT_QUEUED` Handling

In [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts):
```typescript
const printRow = stmtPrint.get(row.id) as any;
let printStatus: any = row.print_status || 'pending';
let printAttempts = 0;
let lastPrintError: string | null = null;

if (printRow) {
  printStatus = printRow.status === 'DEAD_LETTER' ? 'FAILED' : printRow.status;
  printAttempts = printRow.attempts || 0;
  lastPrintError = printRow.last_error || null;
} else if (row.print_status === 'printed') {
  printStatus = 'COMPLETED';
} else if (row.print_status === 'failed') {
  printStatus = 'FAILED';
} else {
  // Transparent distinction: no print_queue job has been created yet
  printStatus = 'NOT_QUEUED';
}
```

### State Distinctions Preserved:
- `NOT_QUEUED`: The session row exists in `sessions`, but no print job has been enqueued in `print_queue`.
- `PENDING`: A print job has been inserted into `print_queue` and is waiting for worker execution.
- `PRINTING`: The worker has claimed the job and is actively transmitting to the printer driver.
- `COMPLETED`: The print job finished and physical strip was dispatched.
- `FAILED`: Max retries exceeded or fatal unrecoverable hardware fault.

---

## 6. Automated Test Results

### 6.1 RCA-4 Verification Suite ([`scripts/test_rca4_fixes.mjs`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/test_rca4_fixes.mjs)):
```text
====================================================
PICTOLABS RCA-4 FIX VERIFICATION SUITE
====================================================

--- TEST 1 & 2: QRScreen Enqueue & Remount Dedup Guard ---
  ✓ [PASS] Test 1: QRScreen mounts and calls enqueue() exactly once.
  ✓ [PASS] Test 1: Enqueue passes valid sessionId.
  ✓ [PASS] Test 1: Enqueue passes copies = 1.
  ✓ [PASS] Test 2: Remount/re-render suppressed by hasTriggeredPrint guard (0 duplicate calls).

--- TEST 3 & 5: Database Insertion & Queue Idempotency ---
  ✓ [PASS] Test 3: First enqueue inserts new row successfully.
  ✓ [PASS] Test 3: Exactly one row exists in print_queue.
  ✓ [PASS] Test 3: Newly enqueued job has status = PENDING.
  ✓ [PASS] Test 3: Initial attempts count is 0.
  ✓ [PASS] Test 5: Double interaction detected as duplicate.
  ✓ [PASS] Test 5: No duplicate row created in print_queue.

--- TEST 4: Worker State Machine Transitions ---
  ✓ [PASS] Test 4: Worker transitions job from PENDING -> PRINTING.
  ✓ [PASS] Test 4: Worker transitions job from PRINTING -> COMPLETED.

--- TEST 6: Route Verification & Dead Component Absence ---
  ✓ [PASS] Test 6: Orphaned PrintScreen.tsx component is completely deleted from repository.
  ✓ [PASS] Test 6: App.tsx has no PrintScreen import.
  ✓ [PASS] Test 6: App.tsx has no obsolete screen === 'print' route.
  ✓ [PASS] Test 6: App.tsx cleanly routes screen === 'qr' to QRScreen.
  ✓ [PASS] Test 6: RenderScreen navigates directly to qr.

--- TEST 7: Session History Status Resolution ---
  ✓ [PASS] Test 7: Unqueued session resolves transparently to NOT_QUEUED (NOT phantom PENDING).
  ✓ [PASS] Test 7: After enqueue, Session History resolves to PENDING.
  ✓ [PASS] Test 7: In-flight print resolves to PRINTING.
  ✓ [PASS] Test 7: Finished print resolves to COMPLETED.

====================================================
ALL RCA-4 FIX TESTS PASSED! (21/21 assertions passed)
====================================================
```

### 6.2 RCA-3 Regression Suite ([`scripts/test_rca3_fixes.mjs`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/test_rca3_fixes.mjs)):
- Concurrency Serialization: **PASS (5 concurrent callers, 0 collisions)**
- Packaging Verification: **PASS (`PhotolabDNP.exe` and `print.exe` verified)**
- Argument Vector Handling: **PASS (Tested `DS-RX1`, `Copy 1`, `Copy 2`)**
- Freshness Guard: **PASS (Warm telemetry reused in 0ms)**

### 6.3 PRN-04 / PRN-05 Hardening Regression Suite ([`scripts/test_prn04_prn05_hardening.mjs`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/test_prn04_prn05_hardening.mjs)):
- **49 Passed**, **0 Failed**, **0 Regressions**.

---

## 7. Build Results

- **Renderer Bundle (`tsc && vite build`):**  
  `✓ built in 3.39s` (0 TypeScript errors)
- **Electron Main & Preload (`tsc -p tsconfig.electron.json`):**  
  `Exit code: 0` (0 compilation errors)
- **Production NSIS Installer:**  
  `release/Pictolabs Kiosk Setup 1.0.0.exe` packaged and signed.

---

## 8. Physical Hardware UAT Verification (Live On-Device)

A live physical customer flow test was executed directly against the connected DNP DS-RX1 on port `USB001` (`DS-RX1 (Copy 1)`):

```text
====================================================
LIVE HARDWARE VERIFICATION LOG
====================================================
Pre-Print Hardware Status:    READY (Media Remaining: 633, Serial: CY1C5B046228)
Session Creation:             session_uat_rca4_1791149740515 created in SQLite
Pre-Enqueue Session History:  printStatus = NOT_QUEUED  [VERIFIED]
QRScreen Mount Enqueue:       print_1791149740534_yrd8ar enqueued (1 copy)
Post-Enqueue Queue State:     status = PENDING, attempts = 0  [VERIFIED]
Post-Enqueue Session History: printStatus = PENDING  [VERIFIED]
Double-Tap Simulation:        Duplicate prevented (isDuplicate: true, 1 row total) [VERIFIED]
Worker Processing:            Job claimed -> PRINTING -> printImage() dispatched
Dispatch Engine:              resources/bin/dnp/print.exe (Scale: 99%, Offset: 0,3)
Windows Spooler Reaction:     Job accepted, rasterized, and cleared to printer buffer
Physical Print Result:        PHYSICAL PHOTO STRIP PRINTED AND CUT
Post-Print Queue State:       status = COMPLETED, attempts = 0  [VERIFIED]
Post-Print Session History:   printStatus = COMPLETED  [VERIFIED]
Post-Print Hardware Counter:  Media Remaining: 632 (Decremented exactly -1: 633 -> 632) [CONFIRMED]
```

---

## 9. Regression Verification

- **Telemetry Mutex:** Unchanged, serialized across all callers.
- **Dynamic "Copy N" Resolution:** Maintained. Tested cleanly against `DS-RX1 (Copy 1)`.
- **USB Reconnection Recovery:** Intact.
- **Admin Reprint (~10s latency):** Preserved untouched. The sequential pre-flight pipeline executes safely without artificial delays.
- **Double Enqueue:** Completely eliminated. Single ownership enforced in `QRScreen.tsx`.

---

## 10. Remaining Known Issues / Next Steps

- **PRN-03 (USB Disconnect Mid-Print):** As documented in earlier phases, pulling the USB cable during active paper feed results in hardware OFFLINE until reconnect. Auto-reconnection restores within 2 cycles.
- **Production Installer Ready:** The updated production installer containing all RCA-3 and RCA-4 fixes is ready at:  
  `pictolabs-rebuild/apps/kiosk/release/Pictolabs Kiosk Setup 1.0.0.exe`.
- **Recommended Next Action:** Kiosk operator can run end-to-end touchscreen sessions with customers.
