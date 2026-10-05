# PICTOLABS — RCA-7 PRINTER EXECUTION SIMPLIFICATION FIX REPORT
## Critical-Path Streamlining & Non-Duplication Safety Closure

**Document Reference:** `PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystems:**
- `RenderScreen.tsx` (Decoupled Background Live Photo & Animated GIF Engine)
- `PrintService.ts` (Streamlined Native GDI `print.exe` Dispatcher)
- `PrintQueueService.ts` (Advisory In-Memory Pre-Dispatch Gate & Non-Duplicating Watchdog)
- `PrinterMonitorService.ts` (Sole Owner of Telemetry & USB Channel Lifecycle Guard)
- `WatchdogService.ts` (Terminal Software Recovery Supervisor)
- `SessionHistorySection.tsx` & `QRScreen.tsx` (Accurate Spooler Handoff Semantics)

**Date:** 2026-10-05  
**Implementation Status:** **IMPLEMENTED & VERIFIED ACROSS 4 AUTOMATED TEST SUITES (100% PASS) — PENDING FOUNDER PHYSICAL UAT (PHASE NOT CLOSED)**

---

## 1. Executive Summary & Purpose

Following Founder Physical UAT of the V7 build, RCA-7 identified that while RCA-6 (concurrent worker lockups) was solved, Pictolabs suffered from three major latency and reliability bottlenecks:
1. **RenderScreen Freeze (~25s):** Synchronously awaiting dual FFmpeg video/GIF transcoding on the UI thread before navigating to QRScreen and before print enqueue.
2. **Pre-Dispatch Software Overhead (~5s):** Sequential spawns of `PhotolabDNP.exe OKOKLH json` (2.25s) and PowerShell `Get-CimInstance Win32_Printer` (1.2s) and PowerShell `querySpoolerSnapshot` (1.5s) before invoking `print.exe`.
3. **USB Collision Stalls & Watchdog Duplicate Reprint (~134s):** Rapid polling of `PhotolabDNP.exe` during active printing collided with the Win32 kernel USB driver pipe (`\\.\DNP_RX1`), locking the worker for > 120s and triggering a Watchdog rescue that rescheduled a second physical print while the Founder was typing in the IDE terminal.

Following the Founder's approved direction and explicit architectural corrections, the printer execution pipeline has been streamlined to align with the proven Photolab reference architecture while preserving SQLite persistence, Session History, exact printer identity, and fleet safety.

---

## 2. Exact Changes Implemented Across Files

### 2.1 `RenderScreen.tsx` (UI Thread Decoupling)
- **Previous Behavior:** Synchronously awaited `kiosk.livePhoto.generateGif` (MP4 slideshow ~5.4s + animated GIF ~16.4s) before creating the session record and before navigating to `QRScreen`. Customer UI was frozen for 24.56 seconds.
- **New Behavior:** 
  1. Generates 300 DPI composite JPEG via Sharp C++ engine (~2.0s).
  2. Saves initial SQLite session record with `compositePath` and `printStatus: 'pending'`.
  3. Dispatches `kiosk.livePhoto.generateGif(...)` asynchronously in the background (fire-and-forget Promise). Upon completion, updates the session record (`gifPath`) and queues cloud uploads without holding the UI.
  4. Immediately navigates to `QRScreen` in ~2.5 seconds total.
  5. If the customer taps the GIF preview on `QRScreen` before background encoding finishes, `QRScreen` displays an animated pose flipbook immediately.

### 2.2 `PrintService.ts` (Streamlined Dispatch & Zero Polling Loops)
- **Previous Behavior:** Ran pre-flight `queryPrinterHealth` and PowerShell `querySpoolerSnapshot`, spawned `print.exe`, then entered a 25-second polling loop on `spoolsv.exe`, followed by another 25-second polling loop interrogating `PhotolabDNP.exe` for media counter changes.
- **New Behavior:**
  1. Resolves active printer name with exact matching (`DS-RX1 (Copy 1)`).
  2. Spawns `print.exe` with target image path, copies, and active printer queue.
  3. Upon `print.exe` exit code 0, immediately logs success and returns `{ success: true }`.
  4. Completely removed `querySpoolerSnapshot` and the post-submission USB/spooler polling loops.

### 2.3 `PrintQueueService.ts` (Advisory In-Memory Gate & Terminal Watchdog)
- **Previous Behavior:**
  - `executePrintJob` spawned `queryPrinterHealth` (PowerShell + `PhotolabDNP.exe`) on every print, adding 3.5s of pre-dispatch latency.
  - `resetStuckPrintJobs` rescued jobs in status `PRINTING` by reverting them to `PENDING` with retry backoff, causing the unprompted duplicate print during Founder UAT.
- **New Behavior:**
  - `executePrintJob` reads advisory health directly from `getCachedPrinterHardwareStatus()` (0ms in-memory read). If cached status indicates `OFFLINE` or `DOOR_OPEN`, fails fast pre-dispatch without spawning child processes.
  - Wraps `printImage` execution in `setPrintDispatchActive(true / false)` to signal `PrinterMonitorService` that USB data transmission is underway.
  - Marks job `COMPLETED` immediately upon `printResult.success` (defined as: **Print Dispatch / Windows Spooler Accepted**).
  - In `resetStuckPrintJobs`:
    - Stuck threshold lowered to 45 seconds.
    - Kills any hung `print.exe` subprocesses.
    - **Never resets an in-flight job to `PENDING`.** Marks terminal `DEAD_LETTER` with `last_error: 'Print watchdog: print.exe execution timed out (terminal failure)'`.
    - Resets worker mutex (`isProcessing = false`).

### 2.4 `PrinterMonitorService.ts` (Sole Owner & USB Lifecycle Protection)
- **Previous Behavior:** Polled every 5 seconds unconditionally, interrogating `PhotolabDNP.exe` even while `print.exe` was streaming data over USB.
- **New Behavior:**
  - Sole owner of native DNP hardware telemetry and WMI printer queries.
  - Implements `setPrintDispatchActive(active)` lifecycle tracking.
  - In `checkPrinterHardware`: If `isDispatchActive` is true or a print dispatch completed within the last 4 seconds, skips native DNP USB queries and immediately returns `cachedHardwareStatus`.

### 2.5 `WatchdogService.ts` (Supervisor Parameter Alignment)
- Updated default `printTimeoutMs` from 120,000ms down to 45,000ms, reflecting the ~1-second software execution boundary of `print.exe`.

### 2.6 `SessionHistorySection.tsx` & `QRScreen.tsx` (Accurate Semantics)
- Updated status badges in Session History from `"TERCETAK"` to `"DIKIRIM KE PRINTER"` (Software Spooler Accepted).
- Updated QRScreen banner copy to `"Foto Dikirim ke Printer!"` with description `"Perintah cetak diterima printer. Strip foto akan keluar di baki bawah."`
- Preserves the semantic distinction mandated by the Founder: **Software dispatch success ≠ Physical completion proof**.

---

## 3. Operations Removed from Critical Execution Path

| Operation | Previous Duration | Action Taken | Rationale |
| :--- | :---: | :---: | :--- |
| **FFmpeg MP4 Slideshow Transcode** | 5.40s | Moved to background | Printing only requires composite JPEG. |
| **FFmpeg Animated GIF Transcode** | 16.45s | Moved to background | Video/GIF only needed for phone QR download. |
| **`PhotolabDNP.exe` Pre-flight Probe** | 2.25s | Removed from critical path | Background monitor already monitors printer health. |
| **PowerShell `Win32_Printer` Query** | 1.20s | Removed from critical path | Process spawn overhead before GDI submission eliminated. |
| **PowerShell `querySpoolerSnapshot`** | 1.50s | Removed from critical path | Spooler job enumeration is unnecessary overhead. |
| **Spooler Deletion Polling Loop** | 15–25s | Removed completely | Windows Spooler is an asynchronous buffer. |
| **DNP USB Verification Loop** | 15–120s | Removed completely | Eliminates kernel USB driver collisions and watchdog false retries. |
| **Watchdog Automatic Print Retry** | — | Removed completely | Once `print.exe` runs, automatic retry is strictly prohibited. |

---

## 4. Verification of the 10 Core Invariants

| # | Invariant | Verified By | Status |
| :---: | :--- | :--- | :---: |
| **1** | Exactly one customer enqueue owner | `QRScreen.tsx` (guarded by `hasTriggeredPrint.current` ref) | **PASS** |
| **2** | Exactly one Admin Reprint enqueue owner | `SessionHistorySection.tsx` $\rightarrow$ `SyncEngine.reprintSessionWithDebounce` (4s debounce) | **PASS** |
| **3** | Exactly one `print.exe` spawn point | `PrintService.printImage` (`execFile(printExe, printArgs, ...)`) | **PASS** |
| **4** | No watchdog path can retry already-dispatched prints | `resetStuckPrintJobs` sets `DEAD_LETTER`, never `PENDING` | **PASS** |
| **5** | No DNP telemetry query occurs during active print dispatch | `isDispatchActive` guard in `PrinterMonitorService.ts` | **PASS** |
| **6** | No GIF/MP4 generation blocks print dispatch | Asynchronous fire-and-forget Promise in `RenderScreen.tsx` | **PASS** |
| **7** | No spooler polling is required for success | Success returned immediately upon `print.exe` exit 0 | **PASS** |
| **8** | No physical completion verification is required for success | Application lifecycle decoupled from physical thermal feed | **PASS** |
| **9** | Exact printer identity remains enforced | Strict string match preserved (`DS-RX1 (Copy 1)` vs `DS-RX1 (Copy 2)`) | **PASS** |
| **10** | `PrintQueueService` remains persistent | SQLite WAL transactions for all jobs and states | **PASS** |

---

## 5. Automated Test Results

Four test suites executed back-to-back:

### Suite 1: `rca7-simplification.spec.ts` (New Dedicated Suite)
- Command: `npx tsx electron/services/rca7-simplification.spec.ts`
- **Result: 6/6 SCENARIOS PASSED (100% SUCCESS)**
  - `TEST 1`: Normal customer print transitions to `COMPLETED` in <100ms with zero polling stalls.
  - `TEST 2`: Advisory in-memory health gate operates at 0ms with strict identity preservation.
  - `TEST 3`: Watchdog marks stuck in-flight prints terminal `DEAD_LETTER` — zero auto physical retry.
  - `TEST 4`: DNP telemetry queries suppressed during active print execution window.
  - `TEST 5`: Admin reprint dispatches cleanly with exactly one additional execution.
  - `TEST 6`: 10 core invariants audited and confirmed in SQLite.

### Suite 2: `rca6-regression.spec.ts` (RCA-6 Anti-Duplication Suite)
- Command: `npx tsx electron/services/rca6-regression.spec.ts`
- **Result: 36/36 SCENARIOS PASSED (100% SUCCESS)**
  - Verified concurrent workers do not spawn.
  - Verified single worker mutex is respected.
  - Verified paper roll accounting accurately decrements 1 sheet per print.

### Suite 3: `print-queue.spec.ts` (Print Queue Core Capabilities)
- Command: `npx tsx electron/services/print-queue.spec.ts`
- **Result: 9/9 SCENARIOS PASSED (100% SUCCESS)**
  - Enqueue deduplication, crash recovery, manual retry, manual reprint, queue metrics all verified.

### Suite 4: `burn-in.spec.ts` (Full Fleet Stress & Self-Healing Suite)
- Command: `npx tsx electron/services/burn-in.spec.ts`
- **Result: 34/34 ASSERTIONS PASSED (100% SUCCESS)**
  - 100 sessions persisted in WAL database.
  - Emergency lockout, upload queues, recovery ledger, and watchdog self-healing all verified.

---

## 6. Build & Typecheck Results

1. **Frontend / Vite Build:**
   ```bash
   npm run build
   # tsc && vite build -> Exit code 0 (built in 3.11s)
   ```
2. **Electron TypeScript Compilation:**
   ```bash
   npx tsc -p tsconfig.electron.json
   # Exit code 0 (Zero TypeScript errors)
   ```

---

## 7. Performance Comparison: Baseline vs Simplified

| Pipeline Stage | Baseline V7 (Measured) | RCA-7 Simplified | Delta |
| :--- | :---: | :---: | :---: |
| **RenderScreen UI Wait** | 24.56s | **~2.0s** | **-22.5s (92% faster)** |
| **Pre-Flight Hardware Check** | 3.45s | **0.00s** (in-memory) | **-3.45s (100% saved)** |
| **Spooler Baseline Snapshot** | 1.50s | **0.00s** (removed) | **-1.50s (100% saved)** |
| **`print.exe` Dispatch** | 1.30s | **~1.0s** | Maintained |
| **Time to Queue COMPLETED** | ~6.25s | **~1.1s** | **-5.15s (82% faster)** |
| **Post-Submission Polling Stall** | 15s to 120s | **0.00s** (eliminated) | **100% eliminated** |
| **Total Customer Wait (Capture $\rightarrow$ QR Ready)** | **43.0s** | **~3.5s** | **~39.5s faster** |

---

## 8. Known Limitations & Safe Boundaries

1. **Physical Completion Boundary:**  
   Once `print.exe` exits with code 0, the job is marked `COMPLETED` (Spooler Accepted). The application does not monitor mechanical paper travel. If the printer runs out of paper mid-roll, the Windows Spooler halts the queue until the technician reloads paper, at which point Windows finishes printing automatically without application intervention.
2. **Advisory Gate:**  
   In-memory cached health reflects the last query by `PrinterMonitorService` (polled every 8–10 seconds when idle). If a technician unplugs the USB cable literally 1 millisecond before `print.exe` runs, `print.exe` will attempt to write to Windows Spooler; Windows will either queue the job offline or `print.exe` will return a non-zero exit code, cleanly marking the job `FAILED`.

---

## 9. Founder Physical UAT Protocol

The following step-by-step physical test protocol is prepared for the Founder:

### Test 1: Normal Customer Print
1. Boot kiosk client (`npm run electron:dev`).
2. Complete 3 photo captures.
3. Observe RenderScreen: Verify progress bar completes and navigates to QRScreen in **~2 to 3 seconds** (no more 25s hang).
4. Observe QRScreen: Status banner should display `"Foto Dikirim ke Printer!"` within **~2 seconds**.
5. Observe DNP Printer: Physical strips should emerge smoothly ~15 seconds later.
6. Verify output: Exactly 1 sheet of 4R cut into 2 2R strips.
7. Verification: Wait 3 minutes while typing in terminal. Confirm printer **does NOT activate unprompted**.

### Test 2: Admin Reprint
1. Open Admin Panel $\rightarrow$ Session History.
2. Select the session printed in Test 1.
3. Verify status badge reads `"DIKIRIM KE PRINTER"`.
4. Click `"Cetak Ulang (1x)"`.
5. Verify button transitions to `"Memproses..."` and returns in **~1.5 seconds**.
6. Confirm printer executes exactly 1 physical reprint without stalls.

---

## 10. Sprint Lifecycle Status

> ### **PHASE STATUS: PENDING FOUNDER PHYSICAL UAT (NOT CLOSED)**  
> In strict accordance with the Pictolabs Sprint Workflow:
> - Implementation: **COMPLETE**
> - Automated Test Suites: **100% PASS**
> - Production Build & Typecheck: **PASS**
> - Formal Closure requires: **Founder Physical UAT PASS $\rightarrow$ Clean Commit $\rightarrow$ VPS Deploy & Smoke Test.**
