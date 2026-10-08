# PRINTER WORKSTREAM CONTEXT

## 1. Purpose
The Printer Workstream manages physical photostrip output on DNP DS-RX1 dye-sublimation hardware. It guarantees exact printer identity matching, handles print queue persistence in SQLite WAL, coordinates Windows GDI spooler dispatch via `print.exe`, prevents duplicate physical printing, and supports on-demand administrative reprints.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Direct GDI `print.exe` Dispatch** | `AUTOMATED_VERIFIED` | Replaced multi-second polling loops with direct execution. |
| **In-Memory Advisory Health Gate** | `AUTOMATED_VERIFIED` | 0ms check against cached state; suppresses pre-dispatch delays. |
| **Decoupled GIF/LivePhoto Transcode** | `AUTOMATED_VERIFIED` | FFmpeg transcoding moved to background; customer UI wait <3.5s. |
| **Anti-Duplication Watchdog (`DEAD_LETTER`)**| `AUTOMATED_VERIFIED` | In-flight jobs timeout to `DEAD_LETTER`; automatic retry strictly banned. |
| **Admin Reprint (1x / 2x with Debounce)** | `AUTOMATED_VERIFIED` | Debounced at 4,000ms; dispatches exactly one physical reprint. |
| **Startup Freeze Elimination & Async Discovery** | `CLOSED` | Electron getPrintersAsync (<15ms), 3s deferred monitor; sub-second boot. |
| **Founder Physical Hardware UAT** | `FOUNDER_UAT_PASS` | **PASS** — Founder physical UAT: zero duplicate prints, customer print & admin reprint verified on Booth #1. |
| **Printer RCA-7 Physical Regression** | `PASS` | **PASS** — Live physical printing, mechanical cutter, and DS-RX1 detection verified during Startup UAT. |
| **Release Closure** | `RELEASE_CLOSURE_PENDING` | Production installer packaged (`Pictolabs Kiosk Setup 1.0.0.exe`); awaiting VPS deployment. |
| **Physical Paper Sensor Verification** | `DEFERRED` | Application relies on Windows Spooler acceptance semantics. |

## 3. Completed / Verified
- **Implemented:** Streamlined `PrintService.ts` (~1.0s dispatch), advisory cache in `PrintQueueService.ts`, background transcoding in `RenderScreen.tsx`, telemetry suppression during USB write in `PrinterMonitorService.ts`, and non-blocking asynchronous printer discovery (`getPrintersAsync()`).
- **Automated Verified:** 100% PASS across 5 automated suites: `rca7-simplification.spec.ts` (6/6), `rca6-regression.spec.ts` (36/36), `printer-failure-hardening.spec.ts` (9/9), `print-queue.spec.ts` (9/9), `burn-in.spec.ts` (34/34).
- **Founder Physical UAT:** **PASS.** Founder personally tested physical Booth #1 hardware: customer capture + physical print PASS, Admin reprint PASS, zero duplicate printing, cold startup < 2s PASS.
- **Production Verified:** Verified in local hardware kiosk staging environment; standalone installer packaged (`apps/kiosk/release/Pictolabs Kiosk Setup 1.0.0.exe`).

## 4. Current Architecture
The printer pipeline follows a streamlined, direct-dispatch architecture:
1. **Render Decoupling:** [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx) generates the 300 DPI composite JPEG in ~2.0s, saves the SQLite session record, dispatches GIF encoding asynchronously in the background, and navigates immediately to [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx).
2. **Pre-Dispatch Gate:** `PrintQueueService.ts` checks `getCachedPrinterHardwareStatus()` (0ms in-memory). If printer is OFFLINE or DOOR_OPEN, fails fast pre-dispatch.
3. **Execution:** `PrintService.ts` sets `isDispatchActive = true` (preventing `PrinterMonitorService` from polling USB), spawns native `print.exe`, and marks job `COMPLETED` immediately upon exit code 0.
4. **Semantics:** `COMPLETED` is explicitly defined as **Print Dispatch / Windows Spooler Accepted**, not optical proof of mechanical paper exit.

## 5. Current Invariants
- **Spooler Handoff Semantics:** Printer completion MUST NOT be presented as optical proof; application status indicates Windows Spooler acceptance.
- **Windows Print Spooler Dependency:** Native `print.exe` GDI dispatch strictly depends on the Windows Print Spooler service (`spoolsv.exe`) running with `StartupType: Automatic`. If `spoolsv.exe` is stopped or crashes during Windows servicing, `print.exe` exits with non-zero code and fails fast.
- **No Automatic Retry:** Once `print.exe` is invoked, watchdog automatic retry is strictly PROHIBITED. Stuck jobs transition to terminal `DEAD_LETTER`.
- **Single Enqueue Owner:** Exactly one enqueue call per customer flow (`QRScreen.tsx`) and exactly one per Admin Reprint flow (`SessionHistorySection.tsx`).
- **USB Collision Prevention:** `PrinterMonitorService.ts` MUST NOT query native DNP USB telemetry while `print.exe` is actively writing to the printer spooler.
- **Exact Printer Matching:** Strict string matching enforced (`DS-RX1 (Copy 1)`).

## 6. Known Open Issues
- **Blocker:** None. Subsystem logic is closed.
- **Hardening / Release Closure:** Build standalone installer (`Pictolabs Kiosk Setup 1.0.0.exe`) and perform final VPS release deployment smoke test.

## 7. Next Task
Include simplified printer binaries in the final production installer package for Booth #1 deployment.

## 8. Evidence
1. [`docs/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) — Comprehensive fix report and test suite logs.
2. [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md) — Latency and USB driver collision diagnostics.
3. [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_6.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_6.md) — Watchdog mutex race analysis that caused duplicate printing.
4. Commit `787b95d` (*"fallback Printer Hardening, remove all overenginerr stuff"*).
5. Source file: [`apps/kiosk/electron/services/PrintService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts).

## 9. Related Workstreams
- **Session History:** Admin Reprint triggers physical reprints via `SyncEngine`.
- **Kiosk Hardening:** Watchdog process monitors kiosk health without triggering false reprints.

## 10. Status Confidence
**HIGH.** Code simplified, automated tests 100% pass, Founder physical UAT passed, and zero duplicate print symptoms confirmed.
