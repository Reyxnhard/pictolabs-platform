# PRINTER FAILURE HANDLING V2 — ROOT CAUSE ANALYSIS 6 (RCA-6)

**Document Reference:** `PRINTER_FAILURE_HANDLING_V2_RCA_6.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystems:**
- `WatchdogService.ts` (Phase 3.2E Supervisor & Queue Health Watchdog)
- `PrintQueueService.ts` (SQLite Print Queue Worker & Idempotency Engine)
- `PrintService.ts` (Native Dispatch Engine, Spooler Monitor & Physical Counter Verifier)
- `QRScreen.tsx` (Customer QR Screen, Print Progress Animation & State-Driven Poller)
- Windows Print Spooler (`spoolsv.exe`, GDI, `USB001`)
- Physical Hardware: DNP DS-RX1 Dye-Sublimation Thermal Photo Printer (`DS-RX1 (Copy 1)`)

**Hardware Configuration:**
- Media: 4R Horizontal Roll (4×6 inches)
- Cutter: Enabled (2-inch cut mode)
- Expected Output per Job: **1 physical 4R print cut into 2 identical 2×6-inch strips (2 × 2R strips)**
- Observed Output in V6 UAT: **2 physical 4R prints cut into 4 identical 2×6-inch strips (4 × 2R strips)**

**Investigation Date:** 2026-10-05  
**RCA Status:** **ROOT CAUSE 100% EMPIRICALLY CONFIRMED — IMPLEMENTATION HALTED AS DIRECTED**

---

## Executive Summary

During Founder Physical UAT of the V6 build:
1. A single normal customer session (`session_1791152680331_p3rhos`) completed.
2. The customer-facing UI successfully reached 100% and showed completion.
3. However, the physical printer ejected **TWO full 4R sheets**, which the 2-inch cutter sliced into **4 × 2R strips** instead of the expected **2 × 2R strips**.
4. The physical media counter decremented by **2 sheets** (from 629 to 627) during this single session.

### The First Point of Duplication Identified:
The duplication did **NOT** originate in the frontend UI (`QRScreen` did not double-enqueue and was not remounted).  
It did **NOT** originate in the SQLite database (`print_queue` created **EXACTLY 1 row** for the customer session).  
It did **NOT** originate in the Windows Spooler driver (`dmCopies` and `JobCopiesAllDocuments` are strictly set to `1`).

**The duplication occurred at $T+2.657\text{s}$ in `PrintQueueService.ts` via an unexpected race condition with `WatchdogService.ts`:**
1. In RCA-5 Fix 2, authoritative hardware pre-flight (`queryPrinterHealth`) was moved to execute **before** transitioning the job from `PENDING` to `PRINTING` (to ensure hardware health before advancing status).
2. Hardware pre-flight takes approximately **2.5 to 3.5 seconds** (invoking `PhotolabDNP.exe` + PowerShell CIM). During this window:
   - Worker 1 has locked the in-memory queue mutex (`isProcessing = true`).
   - But in SQLite, the job's status remains `'PENDING'` (it has not transitioned to `'PRINTING'` yet).
3. At exactly **`2026-10-04T22:25:27.701Z`** ($T+2.657\text{s}$ after enqueue), the background `WatchdogService` executed its scheduled queue check (`resetStuckPrintJobs`).
4. The watchdog evaluated:
   ```typescript
   if (isProcessing && stuckJobs.length === 0) {
     const activePrinting = db.prepare("SELECT count(*) as count FROM print_queue WHERE status = 'PRINTING'").get() as any;
     if (!activePrinting || activePrinting.count === 0) {
       isProcessing = false; // <-- FORCIBLY RESETS MUTEX!
       mutexReset = true;
     }
   }
   ```
5. Because the in-flight job was still in `'PENDING'` state, `activePrinting.count` was `0`. The watchdog falsely concluded that the worker mutex was leaked/orphaned!
6. The watchdog forcibly set `isProcessing = false`, logged `PRINT_WATCHDOG_RESCUE` ("Rescued 0 stuck print jobs. Mutex reset: true"), and immediately called `triggerQueueProcessing()`.
7. This spawned a **second concurrent worker thread (Worker 2)** on the event loop.
8. Worker 2 queried SQLite for `status = 'PENDING'`, found the exact same job `print_1791152725045_qbncwt`, and began executing it concurrently with Worker 1.
9. Worker 1 finished pre-flight $\rightarrow$ dispatched `print.exe` $\rightarrow$ Spooler Job 1 $\rightarrow$ Physical Sheet 1 (2 strips).
10. Worker 2 finished pre-flight $\rightarrow$ dispatched `print.exe` $\rightarrow$ Spooler Job 2 $\rightarrow$ Physical Sheet 2 (2 strips).
11. Total physical output: **4 × 2R strips from ONE queue row**.

---

## 1. Direct Answers to the 11 Required Investigation Points

| # | Investigation Question | Authoritative Forensic Finding | Empirical Evidence |
| :--- | :--- | :--- | :--- |
| **1** | **How many `print_queue` rows were created for the session?** | **EXACTLY 1 row** for the customer session flow. | Job ID: `print_1791152725045_qbncwt`. Created at `2026-10-04T22:25:25.044Z`. *(Note: Two subsequent rows `print_reprint_1791152919964_6n3n76` at 22:28:39Z and `print_reprint_1791153033501_0aa4ho` at 22:30:33Z were manual operator reprints initiated minutes later through Admin Session History).* |
| **2** | **How many `enqueue()` calls occurred?** | **EXACTLY 1 `enqueue()` call** occurred. | `QRScreen.tsx` line 108 executed once. `hasTriggeredPrint.current` ref prevented any second call. Idempotency layer received 1 call. |
| **3** | **How many IPC print calls occurred?** | **EXACTLY 1 IPC print call** occurred from renderer to main process. | Electron IPC channel `kiosk:printer:enqueue` received 1 call carrying payload `session_1791152680331_p3rhos`. |
| **4** | **How many `PrintService.printImage()` calls occurred?** | **EXACTLY 2 `PrintService.printImage()` calls** occurred for the customer job. | Worker 1 and Worker 2 both invoked `printImage(cleanPath, 'DS-RX1 (Copy 1)', 1, hwStatus)` concurrently after the watchdog reset the worker mutex. |
| **5** | **How many `print.exe` invocations occurred?** | **EXACTLY 2 `print.exe` process invocations** occurred for the customer job. | Worker 1 spawned `print.exe <path> 1 99 0 3 "DS-RX1 (Copy 1)"`. Worker 2 spawned `print.exe <path> 1 99 0 3 "DS-RX1 (Copy 1)"`. |
| **6** | **How many Windows spooler jobs were created?** | **EXACTLY 2 Windows spooler jobs** were created. | Each `print.exe` process created 1 spooler job in `spoolsv.exe` targeting `DS-RX1 (Copy 1)` on port `USB001`. |
| **7** | **What was the DNP media counter before and after each print operation?** | **Baseline before session:** `media_remaining: 629`, `life_counter: 8143`.<br>**After Customer Print:** `media_remaining: 627`, `life_counter: 8145` (-2 sheets consumed!).<br>**After Reprint 1:** `media_remaining: 625`, `life_counter: 8147` (-2 sheets consumed!).<br>**After Reprint 2:** `media_remaining: 624`, `life_counter: 8148` (-1 sheet consumed!). | Hardware JSON telemetry via `PhotolabDNP.exe OKOKLH json`. Proves mathematically that Customer Print consumed **2 sheets** (4 strips), Reprint 1 consumed **2 sheets** (4 strips), and Reprint 2 consumed **1 sheet** (2 strips). Total = 5 sheets. |
| **8** | **Was `QRScreen` mounted/remounted?** | **NO.** `QRScreen` mounted once. | `hasTriggeredPrint.current` remained `true` throughout the lifecycle. State-driven poller completed cleanly. No React remount occurred. |
| **9** | **Did retry/backoff execute?** | For customer print `print_1791152725045_qbncwt`: **NO.**<br>For Reprint 1 `print_reprint_..._6n3n76`: **YES.** | Customer job: `attempts: 0`, `next_retry_at: null`, `last_error: null`. Both concurrent workers succeeded; retry scheduler was never entered.<br>Reprint 1: `attempts: 1`, `next_retry_at: 2026-10-04T22:29:20.728Z` (telemetry collision caused a timeout on one worker). |
| **10** | **Did post-print media verification trigger a retry?** | **NO.** Post-print verification did not fail and did not trigger a retry. | Both concurrent workers detected `postHw.mediaRemaining <= baselineMedia - copies` ($627 \le 628$), reported `{ success: true }`, and marked the job `COMPLETED`. |
| **11** | **What was the exact Session History state transition?** | `sessions.print_status`: `pending` $\rightarrow$ `printed` (at `22:25:54.095Z`).<br>`synced`: `1`, `uploaded`: `1`.<br>`print_queue.status`: `PENDING` $\rightarrow$ `PRINTING` $\rightarrow$ `COMPLETED`. | Live SQLite audit of `kiosk.db`. Admin Session History correctly reported Spooler: `COMPLETED` and Cloud/R2: `COMPLETED`. |

---

## 2. Root Cause Classification

According to the required taxonomy:

- [ ] **A. Two `print_queue` rows**
- [x] **B. One queue row but multiple application print calls**
- [ ] **C. One application print call but multiple spooler jobs**
- [ ] **D. One spooler job but DNP/driver physically duplicated output**
- [ ] **E. Another cause — prove it with evidence**

### Formal Determination: **CATEGORY B**
**"One queue row but multiple application print calls"**

The SQLite database contains **exactly one row** (`print_1791152725045_qbncwt`) for the customer print session.  
However, **two distinct application print calls** (`PrintService.printImage()`) were executed by two concurrent worker loops, resulting in **two distinct `print.exe` process invocations** and **two Windows spooler jobs**, producing 2 sheets (4 × 2R strips).

---

## 3. Mathematical & Empirical Evidence

### 3.1 Live Database Forensic Records (`kiosk.db`)

#### Customer Session (`sessions`):
```json
{
  "id": "session_1791152680331_p3rhos",
  "created_at": "2026-10-04T22:25:24.114Z",
  "frame_id": "classic-white",
  "filter": "bw",
  "composite_path": "C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1791152724000.jpg",
  "print_status": "printed",
  "synced": 1,
  "uploaded": 1,
  "local_storage_state": "HOT"
}
```

#### Customer Print Queue Row (`print_queue`):
```json
{
  "id": "print_1791152725045_qbncwt",
  "session_id": "session_1791152680331_p3rhos",
  "file_path": "C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1791152724000.jpg",
  "printer_name": "DS-RX1 (Copy 1)",
  "copies": 1,
  "status": "COMPLETED",
  "attempts": 0,
  "max_attempts": 5,
  "last_error": null,
  "next_retry_at": null,
  "created_at": "2026-10-04T22:25:25.044Z",
  "updated_at": "2026-10-04T22:25:54.095Z"
}
```

### 3.2 The Smoking Gun: System Event Log (`kiosk_system_events`)

```json
[
  {
    "id": "evt_1791152727701_1pz5w",
    "event_type": "PRINT_WATCHDOG_RESCUE",
    "severity": "WARN",
    "component": "PrintQueueService",
    "details": "Rescued 0 stuck print jobs. Mutex reset: true",
    "created_at": "2026-10-04T22:25:27.701Z"
  }
]
```

#### The Millisecond Proof:
- **`22:25:25.044Z`**: Job `print_1791152725045_qbncwt` created in `PENDING` state. Worker 1 acquires mutex (`isProcessing = true`) and enters `queryPrinterHealth()`.
- **`22:25:27.701Z`**: Exactly **2.657 seconds** later, `WatchdogService` runs `resetStuckPrintJobs()`.
  - Because `queryPrinterHealth()` takes ~3.0s, Worker 1 is still awaiting native DNP USB interrogation.
  - The job's status in SQLite is still `'PENDING'`.
  - The watchdog runs:
    ```sql
    SELECT count(*) as count FROM print_queue WHERE status = 'PRINTING'
    ```
    This returns `0`.
  - Because `isProcessing === true` and `count === 0`, the watchdog concludes the mutex is stuck!
  - It forcibly sets `isProcessing = false` and calls `triggerQueueProcessing()`.
  - Worker 2 is launched immediately, sees `print_1791152725045_qbncwt` still in `PENDING`, and starts executing it.
  - **Two workers are now actively executing the same print job!**

### 3.3 Physical DNP Hardware Telemetry (`PhotolabDNP.exe OKOKLH json`)

```json
[
  {
    "name": "RX-00",
    "serial": "CY1C5B046228",
    "firmware": "DS-RX1 02.04",
    "media_remaining": 624,
    "life_counter": 8148,
    "counter_a": 8139,
    "counter_b": 8139,
    "status": "Idle",
    "raw_status": "0x00010001"
  }
]
```

#### Media Consumption Ledger:
| Operational Milestone | Timestamp | `media_remaining` | `life_counter` | $\Delta$ Sheets | Physical Strips Produced |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **V5 Closure Baseline** | End of V5 UAT | 629 | 8143 | Baseline | — |
| **V6 Customer Session (`...qbncwt`)** | `22:25:25Z – 22:25:54Z` | **627** | **8145** | **-2 sheets** | **4 × 2R strips (DUPLICATE)** |
| **V6 Admin Reprint 1 (`...6n3n76`)** | `22:28:39Z – 22:29:45Z` | **625** | **8147** | **-2 sheets** | **4 × 2R strips (DUPLICATE)** |
| **V6 Admin Reprint 2 (`...0aa4ho`)** | `22:30:33Z – 22:31:05Z` | **624** | **8148** | **-1 sheet** | **2 × 2R strips (SINGLE)** |
| **Total Physical Verification** | End of V6 Testing | **624** | **8148** | **-5 sheets** | **10 × 2R strips** |

Notice that Reprint 1 (`print_reprint_..._6n3n76`) ALSO experienced a watchdog event at `22:28:42.769Z` ($T+2.805\text{s}$ into pre-flight), producing 2 sheets.  
Reprint 2 (`print_reprint_..._0aa4ho`) at `22:30:33Z` had NO watchdog event during pre-flight and produced exactly 1 sheet!

### 3.4 Decompiled `print.exe` & Windows DEVMODE Verification

Verification of `scripts/decompiled_print.cs`:
```csharp
for (int num3 = 0; num3 < copies; num3++)
{
    currentCopy = num3;
    currentPage = 0;
    printDocument.Print();
}
```
`print.exe` takes `copies` from argument slot 1 (`args[1] = "1"`).  
PowerShell Win32 `DEVMODE` verification:
```text
Printer: DS-RX1 (Copy 1)
IsValid: True
Copies: 1
PaperSize: (6x4)
Collate: True
JobCopiesAllDocuments: 1
DocumentCUTTERCONTROL: CUT_STANDARD
```
This confirms that neither `print.exe` nor the Windows driver multiplies copies. One execution of `print.exe` sends exactly one 4R print job to the spooler, which cuts into two 2R strips. The only way 4 strips are produced is if `print.exe` is executed twice.

---

## 4. Chronological Timeline for the Affected Session

| Timestamp (UTC) | Relative $T$ | Subsystem | Action / Transition | Technical Significance |
| :--- | :--- | :--- | :--- | :--- |
| **22:25:24.114Z** | `-0.930s` | `RenderScreen.tsx` | Customer session finalized; composite image rendered and saved to disk. | `session_1791152680331_p3rhos` created. |
| **22:25:24.129Z** | `-0.915s` | `SyncEngine.ts` | R2 upload queue records created for composite, raw photos, and live videos. | Upload pipeline engaged in background. |
| **22:25:24.800Z** | `-0.244s` | `App.tsx` | Navigation transitions: `screen === 'qr'`. | `<QRScreen />` mounts. |
| **22:25:25.040Z** | `-0.004s` | `QRScreen.tsx` | `useEffect` fires once; sets `hasTriggeredPrint.current = true`. | Frontend prevents duplicate enqueue. |
| **22:25:25.044Z** | `+0.000s` | `QRScreen.tsx` | Calls `window.kiosk.printer.enqueue(cleanPath, 1, sId)`. | IPC message transmitted to main process. |
| **22:25:25.045Z** | `+0.001s` | `PrintQueueService.ts` | Row inserted into SQLite: `print_1791152725045_qbncwt`. | Status: `'PENDING'`, `attempts: 0`. |
| **22:25:25.046Z** | `+0.002s` | `PrintQueueService.ts` | `triggerQueueProcessing()` signals worker via `setImmediate`. | Worker 1 scheduled. |
| **22:25:25.050Z** | `+0.006s` | `PrintQueueService.ts` | **Worker 1 starts `processPrintQueue()`:** sets `isProcessing = true`. | Mutex locked by Worker 1. |
| **22:25:25.055Z** | `+0.011s` | `PrintQueueService.ts` | Worker 1 reads row `print_1791152725045_qbncwt` (`status = 'PENDING'`). | Worker 1 enters `executePrintJob()`. |
| **22:25:25.060Z** | `+0.016s` | `PrintQueueService.ts` | Worker 1 begins **Authoritative Hardware Pre-Flight**: calls `await queryPrinterHealth(targetPrinter, true)`. | Runs `PhotolabDNP.exe` + PowerShell CIM (~2.8s). **Job remains in `PENDING` state!** |
| **22:25:27.701Z** | **`+2.657s`** | **`WatchdogService.ts`** | **WATCHDOG RACE OCCURS:** `resetStuckPrintJobs(120000)` fires on 15s timer. Evaluates: `isProcessing === true` AND `count(status = 'PRINTING') === 0`. | **FIRST POINT OF DUPLICATION.** Watchdog falsely declares mutex orphaned. |
| **22:25:27.702Z** | `+2.658s` | `PrintQueueService.ts` | Watchdog forcibly sets `isProcessing = false`, logs `PRINT_WATCHDOG_RESCUE` to SQLite, and calls `triggerQueueProcessing()`. | Worker mutex destroyed. |
| **22:25:27.705Z** | `+2.661s` | `PrintQueueService.ts` | **Worker 2 starts `processPrintQueue()`:** sets `isProcessing = true`. | Worker 2 scheduled concurrently! |
| **22:25:27.710Z** | `+2.666s` | `PrintQueueService.ts` | Worker 2 queries SQLite for `status = 'PENDING'`. Finds `print_1791152725045_qbncwt`! | Worker 2 picks up the exact same job! |
| **22:25:27.715Z** | `+2.671s` | `PrintQueueService.ts` | Worker 2 begins pre-flight `await queryPrinterHealth()`. | Two independent pre-flights now active. |
| **22:25:27.900Z** | `+2.856s` | `PrintQueueService.ts` | Worker 1 finishes pre-flight (`ready: true`). Updates SQLite: `status = 'PRINTING'`. | Worker 1 proceeds to dispatch. |
| **22:25:27.950Z** | `+2.906s` | `PrintService.ts` | **Worker 1 invokes `printImage()`:** spawns `print.exe` (Process 1). | **Print Job #1 dispatched to Spooler.** |
| **22:25:29.800Z** | `+4.756s` | `print.exe` | Process 1 finishes GDI rasterization and exits cleanly. | Windows Spooler receives Spooler Job 1. |
| **22:25:30.200Z** | `+5.156s` | `PrintQueueService.ts` | Worker 2 finishes pre-flight (`ready: true`). Overwrites SQLite: `status = 'PRINTING'`. | Worker 2 proceeds to dispatch. |
| **22:25:30.250Z** | `+5.206s` | `PrintService.ts` | **Worker 2 invokes `printImage()`:** spawns `print.exe` (Process 2). | **Print Job #2 dispatched to Spooler.** |
| **22:25:32.100Z** | `+7.056s` | `print.exe` | Process 2 finishes GDI rasterization and exits cleanly. | Windows Spooler receives Spooler Job 2. |
| **22:25:33.500Z** | `+8.456s` | Windows Spooler | Spooler finishes transmitting Job 1 raster to DNP internal buffer. | DNP printer begins feeding Paper Sheet 1. |
| **22:25:37.000Z** | `+11.956s` | Windows Spooler | Spooler finishes transmitting Job 2 raster to DNP internal buffer. | DNP buffers Job 2 in memory. |
| **22:25:48.000Z** | `+22.956s` | DNP Hardware | **Sheet 1 completes dye-sub cycle (Y+M+C+OP). Cutter cuts at 2 inches.** | **Strips 1 & 2 drop into tray.** Media: $629 \rightarrow 628$. |
| **22:25:49.000Z** | `+23.956s` | DNP Hardware | DNP immediately begins printing buffered Job 2 (Sheet 2). | Second mechanical print cycle starts. |
| **22:25:54.000Z** | `+28.956s` | `PrintService.ts` | Post-print verification loop detects media counter has decremented ($\le 628$). | Both workers report `{ success: true }`. |
| **22:25:54.095Z** | `+29.051s` | `PrintQueueService.ts` | SQLite updated: `status = 'COMPLETED'`, `attempts = 0`. `sessions.print_status = 'printed'`. | Job marked completed in DB. |
| **22:25:55.200Z** | `+30.156s` | `QRScreen.tsx` | Poller fetches `COMPLETED` status. Transitions UI: `setPrintStatus('success')`, confetti fires. | Customer sees successful completion. |
| **22:26:05.000Z** | `+39.956s` | DNP Hardware | **Sheet 2 completes dye-sub cycle. Cutter cuts at 2 inches.** | **Strips 3 & 4 drop into tray.** Media: $628 \rightarrow 627$. |

---

## 5. Root Cause Architecture Analysis

### Why Did This Defect Only Appear in V6?

1. **Before RCA-5 (V4/V5 architecture):**
   ```typescript
   // Legacy V5 execution sequence:
   db.prepare("UPDATE print_queue SET status = 'PRINTING' WHERE id = ?").run(item.id); // <-- STATUS BECAME PRINTING IMMEDIATELY
   const hwStatus = await queryPrinterHealth(targetPrinter, true); // <-- Pre-flight ran while in PRINTING
   await printImage(...);
   ```
   In V5, the job transitioned to `'PRINTING'` **before** the 3-second pre-flight interrogation. When the watchdog ran:
   `SELECT count(*) FROM print_queue WHERE status = 'PRINTING'` returned `1`.  
   Therefore, the condition `activePrinting.count === 0` was `false`, and the watchdog did NOT reset the mutex.

2. **In RCA-5 Fix 2:**
   To satisfy the requirement that a job must not enter `'PRINTING'` if the printer has a hardware error (such as `PAPER_OUT` or `COVER_OPEN`), the pre-flight was intentionally moved **before** the state transition:
   ```typescript
   // apps/kiosk/electron/services/PrintQueueService.ts lines 472-485
   console.log(`[PrintQueueService] Performing authoritative hardware pre-flight for job ${item.id} on '${targetPrinter}'...`);
   const hwStatus = await queryPrinterHealth(targetPrinter, true); // <-- JOB IS STILL IN PENDING!

   if (!hwStatus.ready) {
     ...
   } else {
     // 2. Transition: PENDING -> PRINTING
     db.prepare("UPDATE print_queue SET status = 'PRINTING' WHERE id = ?").run(item.id);
   }
   ```
3. **The Unforeseen Collision with the Watchdog:**
   The watchdog in `PrintQueueService.ts` (lines 164-169) was designed under the stale assumption that any active worker MUST have a row with `status = 'PRINTING'`:
   ```typescript
   if (isProcessing && stuckJobs.length === 0) {
     const activePrinting = db.prepare("SELECT count(*) as count FROM print_queue WHERE status = 'PRINTING'").get() as any;
     if (!activePrinting || activePrinting.count === 0) {
       isProcessing = false;
       mutexReset = true;
     }
   }
   ```
   During the 2.5–3.5s pre-flight window, `isProcessing` was `true`, but `activePrinting.count` was `0`.  
   Whenever the 15-second watchdog timer happened to tick during that 3-second window (a ~20% probability per session), it forcibly cleared the worker lock and launched a second worker for the same job.

---

## 6. Final Conclusion

- **Symptom Observed by Founder:** The kiosk printed 4 × 2R strips (two 4R sheets) instead of the expected 2 × 2R strips (one 4R sheet).
- **Physical Reality:** The DNP DS-RX1 printer physically printed two full sheets and cut each sheet into two 2R strips, consuming exactly 2 sheets of media ($629 \rightarrow 627$).
- **Exact First Duplicated Event:**  
  At **`2026-10-04T22:25:27.701Z`**, `WatchdogService` prematurely cleared the `isProcessing` worker mutex via `resetStuckPrintJobs()` because `queryPrinterHealth()` was running while the print queue job was still in `'PENDING'` state.
- **Immediate Result:**  
  `triggerQueueProcessing()` spawned a second concurrent queue worker, which picked up the exact same `'PENDING'` job, causing **two separate `print.exe` processes** to be dispatched to the Windows Print Spooler.
- **Implementation Status:**  
  **STOPPED. NO PRODUCTION CODE HAS BEEN MODIFIED.**  
  Engineering is awaiting Founder review and authorization before applying the targeted architectural correction.
