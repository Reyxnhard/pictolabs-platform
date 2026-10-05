# PICTOLABS — PRN-04 / PRN-05 FIX IMPLEMENTATION REPORT (V2)
**Document Version:** 2.0.0  
**Target Subsystem:** Kiosk Photo Printer Pipeline (DNP DS-RX1)  
**Status:** IMPLEMENTED & VERIFIED — PENDING FOUNDER PHYSICAL UAT  
**Date:** 2026-10-04  

---

## 1. Root Cause Addressed

Physical UAT on previous Printer Failure Handling (V1) revealed:
- **PRN-04 (Paper Out):** Printer has no paper roll $\rightarrow$ Kiosk UI reported success ("Selesai"), Session History marked as `TERCETAK`, paper was decremented. **FALSE SUCCESS.**
- **PRN-05 (Cover Open):** Front door/cover opened $\rightarrow$ Kiosk UI reported success ("Selesai"), Session History marked as `TERCETAK`, paper was decremented. **FALSE SUCCESS.**

### Confirmed Mechanical & Driver Behavior:
As proven in [PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md), the DNP DS-RX1 uses a standard Windows GPD driver architecture (`DSRX1.GPD` / `usbprint.sys`). The printer controller contains an onboard 64 MB SDRAM frame buffer.
1. When a print job is submitted via `rundll32 shimgvw.dll,ImageView_PrintTo`, Windows Spooler rasterizes the bitmap and streams it over USB into the printer's SDRAM buffer within 1–2 seconds.
2. Because the USB controller successfully receives all bytes into SDRAM, Windows Spooler considers its transmission complete and immediately purges/deletes the print job from the spooler queue.
3. Windows WMI (`Win32_Printer`) and CIM providers report `DetectedErrorState = 0`, `PrinterState = 0`, and `WorkOffline = False`. The standard Windows GPD driver does not implement a bidirectional Language Monitor to reflect internal mechanical engine state back to the Windows Spooler subsystem.
4. The application previously interpreted `Spooler Job Cleared + queryPrinterHealth() == OK` as physical paper completion. This assumption was invalid for the DNP DS-RX1.

---

## 2. Telemetry Mechanism Selected

### Selected: Option A — Native DNP Telemetry Adapter via `PhotolabDNP.exe` (Official SDK)
The solution restores and integrates the native DNP Status SDK wrapper located at:
`apps/kiosk/resources/bin/dnp/PhotolabDNP.exe`

### Reverse-Engineering & Activation Details:
During Phase 1 probe, `PhotolabDNP.exe` initially failed when called without arguments with exit code `57005 (0xDEAD)`. Reverse-engineering the PE structure, .NET 8 single-file bundle metadata, and legacy Electron bytecode revealed:
1. `PhotolabDNP.exe` is a self-contained .NET 8 single-file application embedding `PhotolabDNP.dll`, `CspStat.dll` (Citizen/DNP Status SDK v0.7.1.5), and Visual C++ 9.0 CRT/MFC dependencies.
2. `PhotolabDNP.exe` enforces a command-line security key: `OKOKLH`.
3. Command syntax:
   ```powershell
   PhotolabDNP.exe OKOKLH json
   ```
4. When invoked with the key `OKOKLH`, the executable communicates directly with the DNP DS-RX1 USB controller via `CspStat.dll`, returning structured JSON telemetry in under **850 milliseconds**.

---

## 3. Why It Was Selected Over Alternative Options

| Criterion | Option A: Native DNP Telemetry (`PhotolabDNP.exe`) | Option B: `IOCTL_USBPRINT_GET_LPT_STATUS` (0x220030) |
| :--- | :--- | :--- |
| **Mechanical Telemetry** | **Complete:** Exposes `Idle`, `Cover Open`, `Paper End`, `Paper Error`, `Ribbon End`, `Paper Jam`, `Not Connected`. | **Incomplete / Non-functional:** DNP DS-RX1 USB driver does not emulate standard IEEE 1284 parallel port status bits; Windows Spooler locks port `\\.\USB002` exclusively. |
| **Consumable Accuracy** | **Hardware Media Counter:** Returns exact remaining prints on physical roll (e.g. `645`). | **None:** Generic IOCTLs have no concept of roll media capacity. |
| **Firmware & Serial Identification** | **Full:** Returns printer model, serial number (`CY1C5B046228`), and firmware version (`DS-RX1 02.04`). | **None.** |
| **Execution Speed** | $\approx 830 - 860\text{ ms}$ via clean Node `child_process.execFile`. | N/A (Port handle access denied). |
| **Production Readiness** | Proven against the physical kiosk DS-RX1 hardware. | Rejected during Phase 1 probe. |

---

## 4. Hardware Telemetry Evidence (Live Physical Capture)

Live interrogation of the physically connected DNP DS-RX1 on the Windows 11 kiosk produced the following verified outputs:

### A. Live JSON Output (`PhotolabDNP.exe OKOKLH json`):
```json
[
  {
    "name": "RX-00",
    "port": 0,
    "device_type": "RX",
    "serial": "CY1C5B046228",
    "firmware": "DS-RX1 02.04",
    "duplex_firmware": "",
    "resolution": "300x300",
    "media_type": "00301",
    "media_remaining": 645,
    "life_counter": 8127,
    "counter_a": 8118,
    "counter_b": 8118,
    "status": "Idle",
    "raw_status": "0x00010001",
    "color_data_ver": "DS-RX1_300_0201.CWD",
    "free_buffer": 2,
    "is_tower": false,
    "panorama_support": false,
    "panorama_printable_raw": 0
  }
]
```

### B. Internal Engine Status Table (Extracted from .NET Metadata):
- `"Idle"` $\rightarrow$ `READY` (Normal idle state)
- `"Cover Open"` $\rightarrow$ `COVER_OPEN` (Front or top mechanical cover open)
- `"Paper End"`, `"Paper Error"` $\rightarrow$ `PAPER_OUT` (Paper roll empty or feed failure)
- `"Ribbon End"`, `"Ribbon Error"` $\rightarrow$ `RIBBON_OUT` (Thermal ribbon exhausted)
- `"Paper Jam"` $\rightarrow$ `JAMMED` (Paper transport jam)
- `"Printing"`, `"Standstill"`, `"Cooling"`, `"Motor Cooling"` $\rightarrow$ `BUSY` (Active printing cycle)
- `"Not Connected"` $\rightarrow$ `OFFLINE` (USB detached / printer powered off)
- `"Hardware Error"`, `"System Error"` $\rightarrow$ `ERROR` (Mechanical engine fault)

---

## 5. Files Changed & Created

1. **Created:** [PrinterHardwareAdapter.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterHardwareAdapter.ts)
   - Created clean internal abstraction `getHardwareStatus(printerName?: string, forceFresh?: boolean): Promise<PrinterHardwareStatus>`.
   - Exposes standardized `HardwareStatusState` (`READY`, `PAPER_OUT`, `COVER_OPEN`, `RIBBON_OUT`, `JAMMED`, `BUSY`, `ERROR`, `OFFLINE`, `UNKNOWN`).
   - Implements 1200ms throttling cache to prevent USB port saturation.
   - Encapsulates binary location, security unlock key `OKOKLH`, and customer-safe status messages.

2. **Created:** [resources/bin/dnp/](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/resources/bin/dnp)
   - Bundles `PhotolabDNP.exe`, `Microsoft.VC90.CRT`, `Microsoft.VC90.MFC`, and `ParameterFiles`.

3. **Modified:** [PrintService.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts)
   - Integrated `getHardwareStatus` into `queryPrinterHealth()`. If physical status is `PAPER_OUT`, `COVER_OPEN`, `RIBBON_OUT`, `JAMMED`, `OFFLINE`, or `ERROR`, `queryPrinterHealth()` immediately returns `ready: false` with the customer-safe message.
   - **Pre-Flight Gate:** Blocks print job dispatch before Windows Spooler can receive the raster file.
   - **Baseline Media Capture:** Records $M_0$ (initial roll count) before dispatch.
   - **Mid-Flight Telemetry Probe:** Continuously polls hardware status during spooler transmission.
   - **Post-Submission Verification:** Replaces naive "spooler cleared = success" assumption with physical verification loop (confirms $M_1 \le M_0 - \text{copies}$ or return to healthy `READY` without mechanical errors).
   - Exported `setIsBypassMode(val: boolean)` for administrative and automated testing control.

4. **Modified:** [PrinterMonitorService.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterMonitorService.ts)
   - Integrated `getHardwareStatus` into background health polling (`checkPrinterHardware()`), ensuring the operator UI badge immediately reflects `PAPER_OUT` or `DOOR_OPEN` in real-time.

5. **Modified:** [electron-builder.json](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron-builder.json)
   - Added `resources/bin/dnp` $\rightarrow$ `bin/dnp` to `extraResources` for production NSIS packaging.

6. **Created:** [test_prn04_prn05_hardening.mjs](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/test_prn04_prn05_hardening.mjs)
   - 43-assertion automated test suite verifying state parsing, preflight blocking, zero paper decrement, exponential backoff, DEAD_LETTER transitions, media delta accounting, and bypass mode.

---

## 6. Architecture Impact

```mermaid
flowchart TD
    subgraph UI ["Customer Screen & Operator UI"]
        QRScreen["QRScreen.tsx"]
        History["Session History UI"]
        Badge["Printer Health Badge"]
    end

    subgraph Service ["Print Orchestration Layer"]
        PQS["PrintQueueService.ts\n(SQLite Queue & Backoff Retry)"]
        PTS["PaperTrackerService.ts\n(Roll Decrement)"]
        PS["PrintService.ts\n(Spooler & Telemetry Orchestrator)"]
        PMS["PrinterMonitorService.ts\n(Background Poller)"]
    end

    subgraph Adapter ["Clean Hardware Abstraction"]
        PHA["PrinterHardwareAdapter.ts\ngetHardwareStatus()"]
    end

    subgraph Native ["Physical Devices & Windows Subsystem"]
        DNP["PhotolabDNP.exe (OKOKLH)\nCspStat.dll"]
        PHYS["Physical DNP DS-RX1\n(USB002 Engine)"]
        SPOOL["Windows Spooler\n(rundll32 ImageView_PrintTo)"]
    end

    PQS -->|"1. Pre-Flight Health Check"| PS
    PS -->|"2. Hardware Status Probe"| PHA
    PHA -->|"3. Exec JSON (850ms)"| DNP
    DNP -->|"4. USB Engine Status"| PHYS

    PHA --"PAPER_OUT / COVER_OPEN"--> PS
    PS --"ready: false (BLOCK)"--> PQS
    PQS --"Do NOT dispatch"--> SPOOL
    PQS --"NO paper decrement"--> PTS
    PQS --"PENDING (Retry Backoff)"--> PQS
    PQS --"After 5 retries: DEAD_LETTER"--> History
    History -->|"GAGAL CETAK"| History
    PQS --"Print Failed Status"--> QRScreen

    PHA --"READY (Idle)"--> PS
    PS -->|"Dispatch Raster"| SPOOL
    SPOOL -->|"64MB Buffer Drained"| PS
    PS -->|"Post-Submission Verify\n(M1 == M0 - 1)"| PHA
    PS --"Verified Success"--> PQS
    PQS -->|"Atomic Decrement"| PTS
    PQS -->|"COMPLETED"--> QRScreen
    QRScreen -->|"Confetti & TERCETAK"| QRScreen

    PMS -->|"Background Poll"| PHA
    PMS -->|"Real-Time Status"| Badge
```

### Architectural Guarantees Preserved:
1. **No architectural rewrite:** `PrintQueueService`, SQLite persistent storage, exponential backoff (`5s, 10s, 20s, 40s, 80s`), and Session History remain intact.
2. **Customer messaging isolation:** Technical details like `0x00010001` or `CspStat.dll` are never exposed to customers. Customer screens display friendly, actionable text ("Kertas foto habis di printer", "Pintu penutup printer terbuka").
3. **Paper roll protection:** `recordPrintConsumption()` is called strictly upon verified print success.
4. **Bypass mode preserved:** `getIsBypassMode() === true` bypasses hardware probes, enabling headless testing and virtual dev workflows without regression.

---

## 7. Automated Test Results

Executed automated test suite: `node pictolabs-rebuild/scripts/test_prn04_prn05_hardening.mjs`

```text
================================================================
PICTOLABS PRN-04 / PRN-05 HARDENING VERIFICATION SUITE
================================================================

Test Suite 1: Hardware Telemetry State Mapping
  ✓ PASS: Idle maps to READY
  ✓ PASS: Cover Open maps to COVER_OPEN
  ✓ PASS: Paper End maps to PAPER_OUT
  ✓ PASS: Paper Error maps to PAPER_OUT
  ✓ PASS: Ribbon End maps to RIBBON_OUT
  ✓ PASS: Ribbon Error maps to RIBBON_OUT
  ✓ PASS: Paper Jam maps to JAMMED
  ✓ PASS: Printing maps to BUSY
  ✓ PASS: Not Connected maps to OFFLINE
  ✓ PASS: Hardware Error maps to ERROR
  ✓ PASS: Unrecognized state maps to UNKNOWN

Test Suite 2: Health Gate Evaluation (Pre-Flight)
  ✓ PASS: READY health gate is OPEN (ready: true)
  ✓ PASS: PAPER_OUT health gate is BLOCKED (ready: false)
  ✓ PASS: PAPER_OUT code is PAPER_OUT
  ✓ PASS: COVER_OPEN health gate is BLOCKED (ready: false)
  ✓ PASS: COVER_OPEN code is DOOR_OPEN
  ✓ PASS: RIBBON_OUT health gate is BLOCKED (ready: false)
  ✓ PASS: OFFLINE health gate is BLOCKED (ready: false)
  ✓ PASS: ERROR health gate is BLOCKED (ready: false)
  ✓ PASS: Bypass mode ignores PAPER_OUT and allows ready: true

Test Suite 3: Pre-Flight Spooler Dispatch Prevention
  ✓ PASS: PAPER_OUT never dispatches to Windows spooler
  ✓ PASS: PAPER_OUT returns failure to caller
  ✓ PASS: COVER_OPEN never dispatches to Windows spooler
  ✓ PASS: COVER_OPEN returns failure to caller
  ✓ PASS: READY dispatches to Windows spooler
  ✓ PASS: READY returns success to caller

Test Suite 4: Paper Tracker Zero Decrement on Failure
  ✓ PASS: Initial paper counter is 645
  ✓ PASS: Paper counter unchanged after PAPER_OUT failure (645)
  ✓ PASS: Paper counter unchanged after COVER_OPEN failure (645)
  ✓ PASS: Paper counter decremented by 1 after verified success (645 -> 644)

Test Suite 5: Queue Execution & Exponential Backoff Retry
  ✓ PASS: Attempt 1: Status remains PENDING for retry
  ✓ PASS: Attempt 1: Attempts count is 1
  ✓ PASS: Attempt 1: Error message recorded
  ✓ PASS: Attempt 2: Attempts count is 2
  ✓ PASS: Attempt 4: Attempts count is 4
  ✓ PASS: Attempt 5: Status transitioned to DEAD_LETTER
  ✓ PASS: Attempt 5: Max attempts (5) reached
  ✓ PASS: Session print_status updated to failed (Session History: GAGAL CETAK)
  ✓ PASS: Paper counter was NEVER decremented during the 5 failed attempts (remains 644)

Test Suite 6: Physical Media Delta Verification
  ✓ PASS: M0=645, M1=644 (-1 copy) verifies physical success
  ✓ PASS: M0=645, M1=643 (-2 copies) verifies physical success
  ✓ PASS: M0=645, M1=645 (no change) flags incomplete physical print
  ✓ PASS: Missing baseline handled gracefully

================================================================
TEST RESULTS: 43 PASSED, 0 FAILED
================================================================
```

---

## 8. Existing Regression Test Results

1. **Electron Main TypeScript Build:**
   ```powershell
   npx tsc -p tsconfig.electron.json
   # Output: Exit code 0 (0 errors)
   ```
2. **Kiosk Renderer Build:**
   ```powershell
   npm run build
   # Output: vite v6.4.3 built in 4.52s (0 errors)
   ```
3. **Workspace Monorepo Typecheck:**
   ```powershell
   npm run typecheck (turbo run typecheck)
   # Tasks: 3 successful, 3 total (0 errors)
   ```
4. **Live DS-RX1 Hardware Interrogation Test:**
   ```powershell
   node pictolabs-rebuild/scripts/test_live_compiled.js
   # Output: state: "READY", mediaRemaining: 645, serial: "CY1C5B046228", firmware: "DS-RX1 02.04" (861ms)
   ```

---

## 9. Known Limitations

1. **Single USB Connection at a Time:** DNP DS-RX1 USB communication does not support multi-threaded concurrent queries on the same port handle. The `PrinterHardwareAdapter` implements a 1200ms throttle cache and deduplicates active query promises to ensure the USB interface is never locked.
2. **Printer In-Flight Sleep:** While the mechanical thermal head is moving, rapid external status queries could momentarily interrupt the print carriage. The telemetry probe is therefore queried once at pre-flight, and spaced by 1200ms during post-flight monitoring.
3. **Paper Out Timing:** When paper runs out during the middle of a print, DNP reports `Paper End` or `Paper Error`. The post-submission verification loop traps this and aborts within 25 seconds.

---

## 10. Founder UAT Protocol

Please execute the following 3 tests on the physical kiosk machine:

### Test Case 1: PRN-04 — Paper Out Verification
1. Remove or unspool the paper roll from the DNP DS-RX1 printer (so the paper sensor is unblocked).
2. Start a normal customer session on the kiosk.
3. Complete photography and reach the `QRScreen`.
4. **Expected Result:**
   - Kiosk does **NOT** dispatch the print to the Windows Spooler.
   - QRScreen does **NOT** show 100% or trigger celebratory confetti.
   - QRScreen displays a friendly support message: *"Kertas foto habis di dalam printer (Paper Out)"*.
   - Paper tracker in database is **NOT** decremented (remains unchanged).
   - In Session History Center, the session displays as `GAGAL CETAK` (Eligible for reprint).
   - Reload paper $\rightarrow$ Tap "Cetak Ulang" in Session History $\rightarrow$ Photo prints cleanly.

### Test Case 2: PRN-05 — Cover Open Verification
1. Ensure paper is installed, but open the front lever/cover of the DNP DS-RX1.
2. Start a customer session and proceed to printing.
3. **Expected Result:**
   - Kiosk does **NOT** report success.
   - Screen indicates printer door is open.
   - Paper counter is **NOT** decremented.
   - In Session History Center, the session displays as `GAGAL CETAK`.
   - Close the cover $\rightarrow$ System recovers and allows reprint.

### Test Case 3: PRN-06 — Healthy Print Verification
1. Ensure printer has paper, ribbon, and the cover is securely closed.
2. Start a session and proceed to printing.
3. **Expected Result:**
   - Photo is physically printed and cut by the DNP cutter.
   - QRScreen celebrates with confetti once physical completion is verified.
   - Paper counter decrements by exactly 1 (e.g. 645 $\rightarrow$ 644).
   - Session History Center marks session as `TERCETAK`.

---

## 11. Production Readiness Statement

> **Production readiness pending Founder Physical UAT.**  
> Automated verification and live hardware telemetry interrogation have passed 100% (43/43 assertions, live DS-RX1 serial `CY1C5B046228` validated). Full operational closure will occur upon Founder physical validation of PRN-04, PRN-05, and PRN-06.
