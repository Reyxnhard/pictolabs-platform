# PRINTER WORKSTREAM CONTEXT

## 1. Purpose
The Printer Workstream manages physical photostrip output on DNP DS-RX1 dye-sublimation hardware. It guarantees exact printer identity matching, handles print queue persistence in SQLite WAL, coordinates Windows GDI spooler dispatch via `print.exe`, prevents duplicate physical printing, supports on-demand administrative reprints, and governs hardware calibration (scale 85–100%, X/Y alignment ±15 units, and media profiles for 2R photostrips vs 4R postcards).

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Direct GDI `print.exe` Dispatch** | `AUTOMATED_VERIFIED` | Replaced multi-second polling loops with direct execution. |
| **In-Memory Advisory Health Gate** | `AUTOMATED_VERIFIED` | 0ms check against cached state; suppresses pre-dispatch delays. |
| **Decoupled GIF/LivePhoto Transcode** | `AUTOMATED_VERIFIED` | FFmpeg transcoding moved to background; customer UI wait <3.5s. |
| **Anti-Duplication Watchdog (`DEAD_LETTER`)**| `AUTOMATED_VERIFIED` | In-flight jobs timeout to `DEAD_LETTER`; automatic retry strictly banned. |
| **Admin Reprint (1x / 2x with Debounce)** | `AUTOMATED_VERIFIED` | Debounced at 4,000ms; dispatches exactly one physical reprint. |
| **Startup Freeze Elimination & Async Discovery** | `CLOSED` | Electron getPrintersAsync (<15ms), 3s deferred monitor; sub-second boot. |
| **Founder Physical Hardware UAT (RCA-7)** | `FOUNDER_UAT_PASS` | **PASS** — Founder physical UAT: zero duplicate prints, customer print & admin reprint verified on Booth #1. |
| **Printer RCA-7 Physical Regression** | `PASS` | **PASS** — Live physical printing, mechanical cutter, and DS-RX1 detection verified during Startup UAT. |
| **PR-02 Profiles & Hardware Calibration** | `READY_FOR_FOUNDER_PHYSICAL_UAT` | **IMPLEMENTED & VERIFIED** — Scale 85–100%, offset ±15 (1/100 inch), atomic mutex, safe stale-lock recovery, uncut 4x6 queue guard, 17/17 blocker tests, 25 checkpoint tests (9/5/11), clean monorepo build, unpacked artifact verified. |
| **Founder Physical Hardware UAT (PR-02)** | `PENDING_AUTHORIZATION` | Awaiting explicit Founder authorization before executing physical calibration test prints on Booth #1. |
| **Release Closure** | `RELEASE_CLOSURE_PENDING` | Production installer packaged (`Pictolabs Kiosk Setup 1.0.0.exe`); awaiting physical UAT & VPS deployment. |
| **Physical Paper Sensor Verification** | `DEFERRED` | Application relies on Windows Spooler acceptance semantics. |

## 3. Completed / Verified
- **Implemented:** Streamlined `PrintService.ts` (~1.0s dispatch), advisory cache in `PrintQueueService.ts`, background transcoding in `RenderScreen.tsx`, telemetry suppression during USB write in `PrinterMonitorService.ts`, non-blocking asynchronous printer discovery (`getPrintersAsync()`), reference-parity calibration model (scale 85–100%, offset ±15 native units, baseline 99/0/3), atomic dispatch locking, and safe stale-lock process liveness verification.
- **Automated Verified:** 100% PASS across automated suites:
  - PR-02 Blocker Verification: `test_pr02_blocker_fixes_verification.mjs` (17/17 passed).
  - PR-02 Checkpoint 1 (Normalization & Schemas): `test_pr02_checkpoint1_normalization.mjs` (9/9 passed).
  - PR-02 Checkpoint 2 (Kiosk Hydration & Isolation): `test_pr02_checkpoint2_kiosk_hydration.mjs` (5/5 passed).
  - PR-02 Checkpoint 3 (Dynamic CLI Dispatch & Queue Resolution): `test_pr02_checkpoint3_dispatch.mjs` (11/11 passed).
  - PR-01 Foundation: `test_pr01_booth_config_foundation.mjs` (22/22 passed).
  - Kiosk Unit Specs: `config-hydration.spec.ts` (10/10 passed), `rca7-simplification.spec.ts` (10/10 passed), `rca6-regression.spec.ts` (36/36 passed).
- **Production Build & Packaging Verified:**
  - Monorepo production build: `turbo run build` passed across 4 packages (`@pictolabs/shared`, `@pictolabs/backend`, `@pictolabs/kiosk`, `@pictolabs/dashboard`) in 15.48s.
  - Standalone installer previously packaged: `apps/kiosk/release/Pictolabs Kiosk Setup 1.0.0.exe`.
  - Fresh unpacked runtime verified: `apps/kiosk/release/win-unpacked/resources/assets/calibration_target.png` exists (123,101 bytes, valid PNG, $1200 \times 1800\text{ px}$).
- **Founder Physical UAT:**
  - RCA-7 / Startup / Session History: **PASS.** Founder personally tested physical Booth #1 hardware: customer capture + physical print PASS, Admin reprint PASS, zero duplicate printing, cold startup < 2s PASS.
  - PR-02 Physical Calibration: **PENDING AUTHORIZATION.** Automated and packaging verification complete; physical printing strictly prohibited until authorized.

## 4. Current Architecture
The printer pipeline follows a streamlined, direct-dispatch architecture:
1. **Render Decoupling:** [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx) generates the 300 DPI composite JPEG in ~2.0s, saves the SQLite session record, dispatches GIF encoding asynchronously in the background, and navigates immediately to [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx).
2. **Pre-Dispatch Gate:** `PrintQueueService.ts` checks `getCachedPrinterHardwareStatus()` (0ms in-memory). If printer is OFFLINE or DOOR_OPEN, fails fast pre-dispatch.
3. **Atomic Mutual-Exclusion Lock:** `acquirePrintDispatchLock(owner)` in [`PrinterMonitorService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterMonitorService.ts) enforces singular process ownership across `QUEUE_WORKER`, `CALIBRATION`, and `MANUAL`.
   - If customer job is printing, operator calibration test-print is rejected fast with `"Printer sedang memproses pencetakan lain. Harap tunggu hingga selesai."`.
   - If calibration cut-test is active, customer queue jobs remain safely `PENDING` in SQLite and worker retries after 1000ms.
4. **Execution & Process Lifetime:** `PrintService.ts` registers the spawned child PID (`registerActivePrintPid`), executes native `print.exe` with dynamic calibration parameters (`scale%`, `offsetX`, `offsetY`, `printerName`), sets `isDispatchActive = true` (preventing `PrinterMonitorService` from polling USB), and marks job `COMPLETED` immediately upon exit code 0. Lock is released strictly in `finally`.
5. **Semantics:** `COMPLETED` is explicitly defined as **Print Dispatch / Windows Spooler Accepted**, not optical proof of mechanical paper exit.
6. **Safe Stale-Lock Recovery:** If a dispatch lock is contested after $>60\text{ seconds}$, `PrinterMonitorService` inspects process liveness (`isPrintProcessAlive`) via child PID and OS task table (`tasklist /FI "IMAGENAME eq print.exe"`).
   - If alive, it attempts termination via `terminateAndConfirmPrintProcess()` (`SIGTERM` + `taskkill /F /FI "IMAGENAME eq print.exe" /T`).
   - If termination fails or process remains active, **recovery is strictly refused**, preventing two concurrent `print.exe` dispatches.
   - Lock is reclaimed only after process exit is confirmed.
7. **Calibration Media Safety:** `printer:cut-test` invokes [`resolveCalibrationPrinterQueue()`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts).
   - Requires explicitly configured 4R queue in `hardware.printerNames.photo4x6`.
   - Strictly blocks queues configured for 2-inch cut (`strip2x6` or names with `/2x6|strip|2-inch|2 inch|\bcut\b|\bpotong\b/i` unless explicitly `uncut`).
   - Fails fast with clear Indonesian error if 4R is unconfigured or missing from Windows, preserving the physical integrity of the $1200 \times 1800\text{ px}$ calibration target.
8. **USB Cooldown Guard:** `checkPrinterHardware()` skips DNP native USB queries while dispatch is active and for 4,000ms post-dispatch, protecting USB bus stability.

## 5. Current Invariants
- **Spooler Handoff Semantics:** Printer completion MUST NOT be presented as optical proof; application status indicates Windows Spooler acceptance.
- **Windows Print Spooler Dependency:** Native `print.exe` GDI dispatch strictly depends on the Windows Print Spooler service (`spoolsv.exe`) running with `StartupType: Automatic`. If `spoolsv.exe` is stopped or crashes during Windows servicing, `print.exe` exits with non-zero code and fails fast.
- **No Automatic Retry:** Once `print.exe` is invoked, watchdog automatic retry is strictly PROHIBITED. Stuck jobs transition to terminal `DEAD_LETTER`.
- **Single Enqueue Owner:** Exactly one enqueue call per customer flow (`QRScreen.tsx`) and exactly one per Admin Reprint flow (`SessionHistorySection.tsx`).
- **USB Collision Prevention:** `PrinterMonitorService.ts` MUST NOT query native DNP USB telemetry while `print.exe` is actively writing to the printer spooler or within 4,000ms cooldown.
- **Exact Printer Matching:** Strict string matching enforced (`DS-RX1 (Copy 2)`).
- **Singular Print Process:** Exactly one `print.exe` process may execute at any given time.
- **Uncut Calibration Queue:** Calibration test-prints must NEVER route to a 2-inch cut queue.
- **Physical UAT Boundary:** Zero unauthorized physical prints without Founder authorization.

## 6. Known Open Issues & Next Steps
- **RCA-7 Release Closure:** Standalone installer is packaged (`Pictolabs Kiosk Setup 1.0.0.exe`); pending final VPS release deployment smoke test after all Pilot Readiness gates.
- **PR-02 Gate Status:** Implementation, automated verification across 4 scripts (17/17 blocker, 9/5/11 checkpoints), build (`turbo run build`), and unpacked packaging verified.
- **Next Step:** Obtain Founder Authorization for Physical UAT on Pilot Booth #1 hardware to verify physical print quality, 2R margin offset accuracy, and sharpness.
- **Hardware Pre-requisite on Booth #1:** The presence and driver configuration of an uncut 4×6 queue on Booth #1 Windows Spooler must be physically confirmed by the operator before triggering test prints.

## 7. Next Task
1. Include simplified printer binaries and PR-02 assets in the final production installer package for Booth #1 deployment.
2. Execute Founder Physical UAT on Booth #1 once authorized.

## 8. Evidence
1. [`docs/02_EVIDENCE/FIX_REPORTS/PR-02_PRINTER_PROFILES_AND_CALIBRATION_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PR-02_PRINTER_PROFILES_AND_CALIBRATION_IMPLEMENTATION_REPORT.md) — Comprehensive PR-02 implementation, packaging, and test report.
2. [`docs/02_EVIDENCE/AUDITS/PR-02_CALIBRATION_IMPLEMENTATION_PLAN_AND_PREFLIGHT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PR-02_CALIBRATION_IMPLEMENTATION_PLAN_AND_PREFLIGHT.md) — Preflight audit and calibration parameter contract.
3. [`docs/02_EVIDENCE/AUDITS/PR-02_REFERENCE_FEATURE_COMPARISON_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PR-02_REFERENCE_FEATURE_COMPARISON_AUDIT.md) — Reverse-engineering benchmark of reference calibration implementation.
4. [`docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) — Original RCA-7 fix report.
5. [`docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md) — Latency and USB driver collision diagnostics.
6. [`docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_6.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_6.md) — Anti-duplicate watchdog mutex analysis.
7. Commit `787b95d` (*"fallback Printer Hardening, remove all overenginerr stuff"*).
8. Source file: [`apps/kiosk/electron/services/PrintService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts).
9. PR-02 Commits: `cc8cb38`, `35edd1f`, `d6104a3`, `426bd8a`, `9499f4a`.

## 9. Related Workstreams
- **Session History:** Admin Reprint triggers physical reprints via `SyncEngine`.
- **Kiosk Hardening:** Watchdog process monitors kiosk health without triggering false reprints.
- **Booth Configuration (PR-01):** Dynamic calibration and per-media queue names hydrated from booth configuration envelope.

## 10. Status Confidence
**HIGH.** 100% information continuity preserved, zero dropped historical context, 100% automated test pass (17/17 blocker suite, 25 checkpoint tests across 3 suites [9/5/11], 36/36 RCA-6, 10/10 RCA-7, 22/22 PR-01), clean monorepo build, fresh unpacked packaged artifact verified. Zero physical prints dispatched pending Founder sign-off.
