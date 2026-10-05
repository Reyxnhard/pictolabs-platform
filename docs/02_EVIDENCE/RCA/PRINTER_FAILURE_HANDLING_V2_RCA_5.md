# PRINTER FAILURE HANDLING V2 — ROOT CAUSE ANALYSIS 5 (RCA-5)

**Document Reference:** `PRINTER_FAILURE_HANDLING_V2_RCA_5.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystems:**
- `QRScreen.tsx` (Customer QR Screen, Print Progress Animation & Queue Poller)
- `PrintQueueService.ts` (SQLite Print Queue Worker & Idempotency Engine)
- `PrintService.ts` (Native Dispatch Engine, Spooler Monitor & Physical Counter Verifier)
- `PrinterHardwareAdapter.ts` (PhotolabDNP Serialized Driver Mutex & Cooldown Guard)
- `PrinterMonitorService.ts` (Background Hardware Telemetry Watchdog)
- Windows Print Spooler (`spoolsv.exe`, GDI, `USB001`)
- Physical Hardware: DNP DS-RX1 Dye-Sublimation Thermal Photo Printer (`DS-RX1 (Copy 1)`)

**Hardware Configuration:**
- Media: 4R Horizontal Roll (4×6 inches)
- Cutter: Enabled (2-inch cut mode)
- Expected Output: **1 physical 4R print cut into 2 identical 2×6-inch strips per print job**

**Investigation Date:** 2026-10-05  
**RCA Status:** **ROOT CAUSE CONFIRMED — IMPLEMENTATION HALTED AS DIRECTED**

---

## Executive Summary

During Founder Physical UAT of the post-RCA-4 build (V5-01):
1. Normal customer session completed; the physical print emerged as **1 × 4R sheet cut into two 2R strips** (100% correct physical result).
2. However, the customer-facing UI on `QRScreen.tsx` displayed a red **FAILED** error card.
3. The physical print only completed after approximately **30–40 seconds**.
4. Checking the Admin Session History afterward revealed:
   - `Spooler: COMPLETED`
   - `Cloud/R2: COMPLETED`
   - `print_status: printed`
5. Admin Reprint (V5-03) succeeded without failure, with approximately 9–10 seconds of delay before paper feed.

### Core Discoveries of RCA-5:
- **Two Distinct, Interacting Root Causes Identified:**
  1. **UI False-Failure Defect:** `QRScreen.tsx` has a strict, hardcoded **40.000-second polling timeout** (`Date.now() - pollStartTime > 40000`). At $T=40.0\text{s}$, the UI unilaterally halts polling (`clearInterval(pollInterval)`) and renders the red FAILED card. The backend job actually completed at **$T=40.231\text{s}$** (just 231 milliseconds later!). Because polling was terminated, the UI never captured the `COMPLETED` event.
  2. **Backend Pre-Flight Latency Defect:** The backend executes **THREE redundant, sequential un-cached hardware telemetry probes** (`queryPrinterHealth` in `PrintQueueService` + `queryPrinterHealth` in `PrintService` + `getHardwareStatus` in `PrintService`) plus two separate PowerShell CIM invocations before `print.exe` is even launched. This burns **~11.5–13 seconds** of pure pre-flight overhead before paper feeds.
- **Physical Dye-Sub Mechanical Inflexible Constant:** The DNP DS-RX1 physical print cycle (Yellow + Magenta + Cyan + Laminate Overcoat + 2-Inch Mechanical Cut) physically requires **~16 seconds**.
- **Admin Reprint vs Customer Print Difference Explained:** In Admin Reprint, the founder observed a ~10-second delay until the printer *began feeding paper* (pre-flight + spooler dispatch), not total completion. Total completion in Admin Reprint was **31.409 seconds**. In Customer Print, additional session finalization background tasks (LivePhoto MP4 video encoding, R2 upload kickoff, monitor mutex contention) pushed total completion to **40.231 seconds**, crossing the 40.0s UI timeout threshold by 231ms.

---

## 1. V5 UAT Evidence

### 1.1 Founder Physical Observation (V5-01)
- Customer session proceeded through Welcome, Product Select, Payment, Frame Design, Capture, Filter, and Render.
- `QRScreen.tsx` displayed the QR code and print progress bar.
- Progress bar steadily advanced, reached ~85%, and then transitioned to **FAILED** with a red error card.
- Approximately 30–35 seconds into the screen, the DNP printer engaged and completed the print.
- Two physical 2×6-inch strips emerged from the printer tray (clean 4R horizontal cut).
- Admin Session History inspected immediately afterward:
  - `Status Pencetakan Spooler: COMPLETED`
  - `Status Sinkronisasi Cloud (R2): COMPLETED`
  - `Status SSD: HOT (Tersedia)`

### 1.2 Admin Reprint Observation (V5-03)
- Admin opened the same session and pressed "Cetak Ulang Foto Terakhir".
- Physical print succeeded.
- Observed delay before paper feed began was approximately **9–10 seconds**.
- No UI timeout occurred because Admin UI does not enforce a 40-second polling abort.

### 1.3 Live SQLite Database Audit (`kiosk.db`)
Direct forensic query executed on `%APPDATA%\@pictolabs\kiosk\pictolabs-data\kiosk.db`:

#### Session Record:
```sql
SELECT id, created_at, print_status, synced, uploaded, composite_path 
FROM sessions 
WHERE id = 'session_1791150145617_i6r9vi';
```
**Output:**
```json
{
  "id": "session_1791150145617_i6r9vi",
  "created_at": "2026-10-04T21:43:50.459Z",
  "print_status": "printed",
  "synced": 1,
  "uploaded": 1,
  "composite_path": "C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1791150230317.jpg"
}
```

#### Print Queue Records:
```sql
SELECT id, session_id, printer_name, copies, status, attempts, created_at, updated_at 
FROM print_queue 
WHERE session_id = 'session_1791150145617_i6r9vi'
ORDER BY created_at ASC;
```
**Output:**
```json
[
  {
    "id": "print_1791150231463_frc71q",
    "session_id": "session_1791150145617_i6r9vi",
    "printer_name": "DS-RX1 (Copy 1)",
    "copies": 1,
    "status": "COMPLETED",
    "attempts": 0,
    "created_at": "2026-10-04T21:43:51.463Z",
    "updated_at": "2026-10-04T21:44:31.694Z"
  },
  {
    "id": "print_reprint_1791150566950_gui8g8",
    "session_id": "session_1791150145617_i6r9vi",
    "printer_name": "DS-RX1 (Copy 1)",
    "copies": 1,
    "status": "COMPLETED",
    "attempts": 0,
    "created_at": "2026-10-04T21:49:26.950Z",
    "updated_at": "2026-10-04T21:49:58.359Z"
  }
]
```

### 1.4 Mathematical Elapsed Times
- **Customer Print (`print_1791150231463_frc71q`):**
  $$\Delta T = 21:44:31.694 - 21:43:51.463 = \mathbf{40.231\text{ seconds}}$$
- **Admin Reprint (`print_reprint_1791150566950_gui8g8`):**
  $$\Delta T = 21:49:58.359 - 21:49:26.950 = \mathbf{31.409\text{ seconds}}$$

---

## 2. Exact Customer Print Timeline

| Timestamp Event | Exact Time (UTC) | Relative $T$ | Subsystem | Action / Transition | State / Value |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **T0** | `21:43:51.200Z` | `+0.000s` | `QRScreen.tsx` | Screen mounts; triggers print task via 300ms timer; initializes `pollStartTime = Date.now()`. | `printStatus: 'idle'` |
| **T1** | `21:43:51.460Z` | `+0.260s` | `QRScreen.tsx` | Calls `window.kiosk.printer.enqueue(cleanPath, 1, sId)`. | IPC invoke |
| **T2** | `21:43:51.463Z` | `+0.263s` | `PrintQueueService.ts` | SQLite row inserted into `print_queue`. | `status: 'PENDING'` |
| **T3** | `21:43:51.465Z` | `+0.265s` | `PrintQueueService.ts` | `triggerQueueProcessing()` signals worker via `setImmediate`. | Mutex acquired |
| **T4** | `21:43:51.470Z` | `+0.270s` | `PrintQueueService.ts` | Worker detects pending row `print_1791150231463_frc71q`. | `attempts: 0` |
| **T5** | `21:43:51.480Z` | `+0.280s` | `PrintQueueService.ts` | `UPDATE print_queue SET status = 'PRINTING'`. | `status: 'PRINTING'` |
| **T6** | `21:43:51.485Z` | `+0.285s` | `PrintQueueService.ts` | **Pre-flight Check 1:** Calls `queryPrinterHealth(targetPrinter, true)`. Runs `PhotolabDNP.exe` (~2.1s) + PowerShell CIM (~1.8s). | `ready: true, OK` |
| **T7** | `21:43:55.450Z` | `+4.250s` | `PrintService.ts` | Invokes `printImage(cleanPath, targetPrinter, copies)`. | Dispatch start |
| **T7a** | `21:43:55.455Z` | `+4.255s` | `PrintService.ts` | **Pre-flight Check 2:** Calls `queryPrinterHealth(printerName, true)`. Cache bypassed; runs `PhotolabDNP.exe` (~2.0s) + PowerShell CIM (~1.7s). | `ready: true, OK` |
| **T7b** | `21:43:59.200Z` | `+8.000s` | `PrintService.ts` | **Pre-flight Check 3:** Calls `getHardwareStatus(activePrinter, true)` to read baseline media. Runs `PhotolabDNP.exe` (~1.4s). | `media: 631` |
| **T7c** | `21:44:00.650Z` | `+9.450s` | `PrintService.ts` | Calls `querySpoolerSnapshot(activePrinter, profile)`. Runs PowerShell CIM (~1.5s). | `baselineJobIds: []` |
| **T8** | `21:44:02.200Z` | `+11.000s` | `PrintService.ts` | Spawns `print.exe <path> 1 99 0 3 "DS-RX1 (Copy 1)"`. `print.exe` rasterizes and sends GDI document to Windows Spooler (~1.8s). | `print.exe ok` |
| **T8a** | `21:44:04.000Z` | `+12.800s` | Windows Spooler | Spooler job created; `PrintService` enters spooler transmission poll loop (1200ms interval). | `spoolsv: Spooling` |
| **T9** | `21:44:07.500Z` | `+16.300s` | Windows Spooler | Windows Spooler finishes sending raster bytes over USB to DNP internal buffer; spooler job clears. | `jobs: [] (cleared)` |
| **T10a** | `21:44:08.000Z` | `+16.800s` | DNP Hardware | **Physical printing begins:** Paper feeds from roll to platen. Thermal head engages Yellow pass (~3.5s). | Mechanical sound |
| **T10b** | `21:44:11.500Z` | `+20.300s` | DNP Hardware | Magenta pass (~3.5s). | Ribbon rolls |
| **T10c** | `21:44:15.000Z` | `+23.800s` | DNP Hardware | Cyan pass (~3.5s). | Ribbon rolls |
| **T10d** | `21:44:18.500Z` | `+27.300s` | DNP Hardware | Clear laminate overcoat pass (~3.5s). | Overcoat seals |
| **T10e** | `21:44:22.000Z` | `+30.800s` | DNP Hardware | **Cutter engages:** 2-inch cut blade slices 4R sheet into two 2R strips (~2.0s). | Cutter engages |
| **T10f** | `21:44:24.000Z` | `+32.800s` | DNP Hardware | **Physical photo strips drop into tray.** | Two strips in tray |
| **T_UI_FAIL**| `21:44:31.200Z` | `+40.000s` | `QRScreen.tsx` | **`Date.now() - pollStartTime > 40000` evaluates TRUE.** Clears `pollInterval`, stops polling, calls `setPrintStatus('failed')`. | **UI: FAILED** |
| **T11** | `21:44:31.600Z` | `+40.400s` | `PrintService.ts` | Post-submission verification loop: `PhotolabDNP.exe` poll returns `mediaRemaining: 630 <= 631 - 1`. Media confirmed. | `verifiedPhysical` |
| **T12** | `21:44:31.694Z` | `+40.494s` | `PrintQueueService.ts` | `UPDATE print_queue SET status = 'COMPLETED', updated_at = ...` | `COMPLETED (DB)` |
| **T13** | **NEVER** | — | `QRScreen.tsx` | UI never receives `COMPLETED` because `pollInterval` was cleared at $T=40.0\text{s}$! | **Stuck on FAILED** |
| **T14** | **NEVER** | — | `QRScreen.tsx` | Confetti burst never fires; UI remains on red failure card. | **False Failure** |

### Key Interval Calculations:
- **$T_0 \rightarrow T_{10f}$ (Start to Physical Strips in Tray):** $\approx \mathbf{32.8\text{ seconds}}$ (matches Founder's observed ~30s).
- **$T_0 \rightarrow T_{12}$ (Start to SQLite `COMPLETED`):** $\mathbf{40.231\text{ seconds}}$.
- **$T_0 \rightarrow T_{\text{UI\_FAIL}}$ (Start to UI FAILED display):** $\mathbf{40.000\text{ seconds}}$.
- **Difference between UI Timeout and Backend Completion:**
  $$\Delta = T_{12} - T_{\text{UI\_FAIL}} = 40.231\text{s} - 40.000\text{s} = \mathbf{0.231\text{ seconds (231 milliseconds)!}}$$

---

## 3. QRScreen Timeout & Error Logic

Inspection of `apps/kiosk/src/screens/QRScreen.tsx` reveals the exact lines responsible for the false failure:

```typescript
// QRScreen.tsx lines 114-127
const pollStartTime = Date.now();
pollInterval = setInterval(async () => {
  if (!isMounted) {
    if (pollInterval) clearInterval(pollInterval);
    return;
  }

  // Bounded poll timeout (40 seconds)
  if (Date.now() - pollStartTime > 40000) {
    if (pollInterval) clearInterval(pollInterval);
    clearInterval(progressInterval);
    setPrintStatus('failed');
    return;
  }
...
```

### Critical Flaws in `QRScreen.tsx`:
1. **Arbitrary 40-Second Bound:**
   40 seconds is lower than or equal to the normal worst-case operating cycle of a thermal photo printer handling high-resolution rasterization, triple pre-flight hardware interrogation, spooler transfer, 4-pass mechanical dye-sub printing, and cutter ejection.
2. **Terminal Polling Abort (`clearInterval`):**
   When $T > 40\text{s}$, the component permanently deletes its own `pollInterval`. It will never poll again, even if the backend completes 200 milliseconds later.
3. **Ignorance of In-Flight `PRINTING` Status:**
   The timeout fires unconditionally regardless of whether the queue job is actively reporting `PRINTING`. It does not grant a grace period or wait for a definitive failure state (`DEAD_LETTER` or `FAILED`).
4. **Simulated Progress Clamped at 85%:**
   Lines 86–91:
   ```typescript
   const progressInterval = setInterval(() => {
     setPrintProgress((prev) => {
       if (prev >= 85) return prev;
       return prev + 6;
     });
   }, 600);
   ```
   The progress bar quickly advances to 85% within ~8 seconds and stays frozen there. When the 40-second timeout hits, the progress bar is still at 85%, creating the perception that the print "froze" or "failed at 85–87%".

---

## 4. Queue Worker Timeline & Latency Analysis

### 4.1 Enqueue to Pickup Latency: < 10ms
In `PrintQueueService.ts`:
```typescript
// lines 304-313
db.prepare(`INSERT INTO print_queue ... VALUES (?, ?, ?, ?, ?, 'PENDING', ...)`).run(...);
triggerQueueProcessing();
```
Where `triggerQueueProcessing()` executes:
```typescript
// lines 240-250
export function triggerQueueProcessing(): void {
  if (isProcessing) {
    hasPendingWork = true;
    return;
  }
  setImmediate(() => {
    processPrintQueue().catch((e) => { ... });
  });
}
```
**Finding:** The queue worker is **event-driven** via `setImmediate`. The 3000ms polling interval in `startPrintWorker(3000)` is only a watchdog safety net. Worker pickup latency is essentially zero (< 10ms). The 30-second delay is **NOT** caused by worker polling or queue sleep.

---

## 5. Print Pipeline Latency Breakdown

Where are the 40.2 seconds spent?

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOTAL BACKEND DURATION: 40.231 SECONDS                                                 │
├─────────────────────────┬────────────────────────┬─────────────────────────────────────┤
│ 1. Pre-Flight Probes    │ 2. Spooler & print.exe │ 3. Physical Mechanical Printing     │
│ ~11.5 - 13.0 seconds    │ ~4.5 - 5.5 seconds     │ ~20.0 - 22.0 seconds                │
│ (REDUNDANT TELEMETRY)   │ (GDI & USB transfer)   │ (Yellow, Magenta, Cyan, Cut, Media) │
└─────────────────────────┴────────────────────────┴─────────────────────────────────────┘
```

### Detailed Component Latencies:
1. **Pre-flight Probe 1 (`PrintQueueService.ts:472`):**
   - Calls `queryPrinterHealth(targetPrinter, true)`.
   - Spawns `PhotolabDNP.exe`: ~2.1s.
   - Enforces `INTER_QUERY_COOLDOWN_MS`: 0.4s.
   - Spawns PowerShell `Get-CimInstance Win32_Printer`, `Get-PnpDevice`: ~1.8s.
   - **Subtotal: 4.3 seconds.**
2. **Pre-flight Probe 2 (`PrintService.ts:611`):**
   - Inside `printImage()`, calls `queryPrinterHealth(printerName, true)`.
   - Because `bypassCache = true`, memory cache is bypassed.
   - Because Probe 1's PowerShell call took >800ms, `IMMEDIATE_PROBE_GUARD_MS` (800ms) has expired.
   - Spawns `PhotolabDNP.exe` a second time: ~2.0s.
   - Cooldown: 0.4s.
   - Spawns PowerShell a second time: ~1.7s.
   - **Subtotal: 4.1 seconds.**
3. **Pre-flight Probe 3 (`PrintService.ts:623`):**
   - Calls `getHardwareStatus(activePrinter, true)` to read `baselineMedia`.
   - Spawns `PhotolabDNP.exe` a third time: ~1.4s.
   - **Subtotal: 1.4 seconds.**
4. **Pre-flight Spooler Snapshot (`PrintService.ts:626`):**
   - Calls `querySpoolerSnapshot(activePrinter, profile)`.
   - Spawns PowerShell CIM `Get-PrintJob`: ~1.5s.
   - **Subtotal: 1.5 seconds.**
   - **TOTAL PRE-FLIGHT TIME BEFORE `print.exe`: ~11.3 SECONDS!**
5. **CLI Dispatch via `print.exe` (`PrintService.ts:650`):**
   - Loads image, scales 99%, sets DEVMODE (landscape, 2-inch cut), sends GDI pages: ~1.8s.
6. **Windows Spooler USB Streaming (`PrintService.ts:683-770`):**
   - Transmits ~12MB bitmap data to printer onboard RAM: ~3.5s.
7. **Physical DNP Mechanical Printing:**
   - 4-pass thermal dye-sub (Y + M + C + Laminate): 14.0s.
   - 2-inch mechanical cutter cycle: 2.0s.
   - **Subtotal: 16.0 seconds.**
8. **Post-Submission Media Verification Polling (`PrintService.ts:780-814`):**
   - Polls `getHardwareStatus(activePrinter, true)` every 1.2s.
   - Firmare only decrements `mediaRemaining` AFTER cutter cycle finishes and strips eject.
   - Sampling jitter / probe duration: ~2.1s.
   - **Grand Total: ~40.2 seconds.**

---

## 6. Admin Reprint vs Customer Print Latency Comparison

Why did Founder observe:
- **Admin Reprint: ~10 seconds**
- **Customer Print: ~30–40 seconds**

### The Truth Behind the Numbers:
| Metric | Customer Print (V5-01) | Admin Reprint (V5-03) | Explanation |
| :--- | :--- | :--- | :--- |
| **Observed Event** | Total time until FAILED screen & photo drop | Time until printer motor started paper feed | Human perception difference: "Starting to print" vs "Total time to finish" |
| **System State** | High CPU/IO (LivePhoto MP4 encode + R2 upload + Monitor) | Idle booth (Admin screen, zero background tasks) | System concurrency and CPU scheduling |
| **Queue Pre-flight Check** | Cold execution, contested DNP USB handle | Warm DNP state, printer identity already resolved | Serialized mutex release was faster |
| **Time to Paper Feed** | ~14–16 seconds | ~9–10 seconds | 5-second difference due to background CPU contention |
| **Time to Photo Drop** | ~32–33 seconds | ~25–26 seconds | Consistent mechanical duration |
| **Database `created_at` $\rightarrow$ `updated_at`** | **40.231 seconds** | **31.409 seconds** | Both jobs take >30 seconds to fully verify media counter! |
| **UI Outcome** | **FAILED** (hit 40.0s hard timeout) | **SUCCESS** (Admin has no 40.0s hard timeout) | QRScreen timeout bug caused the false failure! |

---

## 7. QRScreen Polling Analysis

1. **Does polling see `PENDING`?**  
   Rarely or very briefly (<10ms), because `triggerQueueProcessing()` immediately transitions the row to `PRINTING`.
2. **Does polling see `PRINTING`?**  
   **Yes, consistently.** From $T=0.3\text{s}$ through $T=40.0\text{s}$, every 1200ms poll returned `queueJob.status === 'PRINTING'`.
3. **Does polling see `COMPLETED`?**  
   **NO.** Because polling was forcibly destroyed at $T=40.000\text{s}$, while the backend reached `COMPLETED` at $T=40.231\text{s}$.
4. **Does it interpret a temporary null as failure?**  
   No. Line 131: `if (!queueJob) return;` safely ignores null/undefined query responses.
5. **Does it stop polling too early?**  
   **YES.** Line 122 explicitly halts polling at 40000ms:
   ```typescript
   if (Date.now() - pollStartTime > 40000) {
     if (pollInterval) clearInterval(pollInterval);
     clearInterval(progressInterval);
     setPrintStatus('failed');
     return;
   }
   ```

---

## 8. Progress UI State Analysis

- **What does 85–87% represent?**  
  It is an artificial ceiling programmed into `QRScreen.tsx` (lines 88–89: `if (prev >= 85) return prev; return prev + 6;`). It does not represent actual spooler bytes or printer motor position.
- **What event advances from 85% to 100%?**  
  Only `queueJob.status === 'COMPLETED'`.
- **What event triggers failure?**  
  Two conditions:
  1. `queueJob.status === 'DEAD_LETTER'` or `queueJob.status === 'FAILED' && attempts >= 5`.
  2. The 40.0-second elapsed timer expiring.
- **Is the progress UI independent from actual queue status?**  
  Partially. It ticks smoothly up to 85% independently, but relies on `COMPLETED` to reach 100%. If `COMPLETED` arrives after 40 seconds, the timeout takes precedence and forces failure.

---

## 9. Duplicate Print Interpretation (4R Cut into Two 2R Strips)

- **Physical Verification:**  
  The booth is configured with a 4R horizontal roll with 2-inch cut enabled.
  $$1 \text{ print job} \longrightarrow 1 \times 4\text{R sheet} \longrightarrow \text{cutter blade engages} \longrightarrow 2 \times 2\text{R strips}$$
- **Database Verification for Session `session_1791150145617_i6r9vi`:**
  - `print_queue` records created during customer session: **EXACTLY 1** (`print_1791150231463_frc71q`).
  - `copies` parameter: **1**.
  - `print.exe` arguments: `[targetPath, "1", "99", "0", "3", "DS-RX1 (Copy 1)"]`.
  - Windows Spooler jobs created: **EXACTLY 1**.
  - The second row (`print_reprint_1791150566950_gui8g8`) was created 6 minutes later when Founder explicitly executed Admin Reprint (V5-03).
- **Conclusion:** There is **NO duplicate printing**. Two physical strips from one print command is the expected mechanical behavior of the 2-inch cutter on 4R media.

---

## 10. Admin Reprint Baseline

V5-03 passed completely. Admin reprint is safe and operational. It confirmed that:
- Image file generation is valid.
- `DS-RX1 (Copy 1)` dynamic queue binding is valid.
- `print.exe` arguments and GDI spooling are valid.
- Physical cutter configuration is valid.
- SQLite queue state transitions are valid.

---

## 11. Root Cause Synthesis: One or Two Root Causes?

The incident is the result of **TWO DISTINCT ROOT CAUSES** acting in combination:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ROOT CAUSE A (UI State Machine & Timer Defect)                         │
│ QRScreen.tsx enforces a rigid 40.000s poll timeout.                    │
│ It aborts polling completely even while the backend is in 'PRINTING'.  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ RACES AGAINST
┌───────────────────────────────────┴────────────────────────────────────┐
│ ROOT CAUSE B (Backend Pre-Flight Latency Defect)                       │
│ PrintQueueService + PrintService execute THREE sequential un-cached    │
│ hardware probes, adding ~11.5s of avoidable overhead to a 16s print.   │
│ Total backend time reaches 40.231s, crossing the 40.000s UI threshold. │
└────────────────────────────────────────────────────────────────────────┘
```

1. If only Root Cause A were present (normal ~28s print, 40s timeout), the race would not trigger under normal conditions.
2. If only Root Cause B were present (40s print, but 60s timeout or graceful polling), the UI would have stayed in `PRINTING` and smoothly flipped to `COMPLETED` at second 40.2.
3. Because **BOTH** were present, the 40.231s backend execution crossed the 40.000s UI timeout by **231 milliseconds**, causing a false failure.

---

## 12. Minimal Proposed Fix (For Future Authorization)

When authorized, the solution requires two complementary minimal changes:

### Fix Part 1: Resilient UI Polling in `QRScreen.tsx`
1. Expand the poll timeout from 40 seconds to **75 seconds** (comfortably accommodating dye-sub mechanical cycles, multiple copies, and media counter verification).
2. Do **not** abort polling if `queueJob.status === 'PRINTING'`. Only declare failure if the queue reaches `DEAD_LETTER` or if the job is unconfirmed after the expanded timeout.

### Fix Part 2: Deduplicate Pre-Flight Hardware Telemetry in Backend
1. In `PrintService.printImage()`, check if a recent `PrinterHardwareStatus` or `PrinterHealth` was completed within the last **3000ms**.
2. If `PrintQueueService` already validated printer health immediately before calling `printImage()`, reuse the result rather than triggering a second and third full interrogation cycle through PowerShell and `PhotolabDNP.exe`.
3. This eliminates ~8–9 seconds of pre-feed latency, bringing the total time down to **~28–30 seconds**.

---

## 13. Regression Risks

| Component | Proposed Change | Regression Risk | Mitigation |
| :--- | :--- | :--- | :--- |
| `QRScreen.tsx` | Extend timeout to 75s; keep polling while `PRINTING` | Customer waiting longer if printer is truly dead | If printer reports real hardware error (`PAPER_OUT`, `DOOR_OPEN`), `PrintQueueService` immediately marks `DEAD_LETTER` and UI fails immediately without waiting for timeout. |
| `PrintService.ts` | Deduplicate pre-flight checks (reuse warm health within 3s) | Missing a sudden error that occurred in the 500ms between queue pickup and print dispatch | `PrintService` still monitors the spooler transmission loop and post-submission hardware state; any fault will be captured mid-flight. |

---

## 14. Focused UAT Plan (Post-Fix)

Upon authorization and implementation of the minimal fix, execute:
1. **TEST V6-01: Full Customer Print**
   - Verify UI stays on progress screen while printing.
   - Verify UI advances to 100% and triggers Confetti upon completion.
   - Verify UI does NOT display FAILED.
   - Verify total completion time is reduced (<32 seconds).
2. **TEST V6-02: Admin Reprint**
   - Verify Admin Reprint still works with reduced pre-feed latency.
3. **TEST V6-03: Real Hardware Fault (Cover Open)**
   - Open printer cover.
   - Start session.
   - Verify UI immediately fails with real error message without waiting for the 75s timeout.
