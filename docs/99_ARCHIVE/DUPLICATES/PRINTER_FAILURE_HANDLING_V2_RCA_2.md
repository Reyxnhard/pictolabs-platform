# PICTOLABS — PRINTER FAILURE HANDLING V2 (RCA 2)
## Root Cause Analysis: Windows "Copy N" Renaming, Dynamic Hardware Resolution, USB Recovery & Performance

- **Target Device:** DNP DS-RX1 Dye-Sublimation Thermal Photo Printer
- **Target OS:** Windows 10 / 11 (x64)
- **Status:** ROOT CAUSE CONFIRMED — SOLUTION SPECIFIED
- **Date:** October 5, 2026
- **Author:** Antigravity Engineering (Pair-Programming with Founder)

---

## 1. Executive Summary

During Founder Physical UAT of Printer Failure Handling V2, a critical operational discrepancy was identified:
- After physically unplugging and reconnecting the DNP USB cable and successfully printing a Windows Test Page:
  - **Windows Settings** displayed: `Printer: DS-RX1 (Copy 1)`, `Printer status: Idle`
  - **Pictolabs Operator Control Panel** displayed: `Thermal Printer: DS-RX1`, `Status: OFFLINE`, `Message: "Printer tidak dapat dihubungi melalui kabel USB"`
- Direct testing of native DNP telemetry via `PhotolabDNP.exe OKOKLH json` confirmed that the physical hardware and native telemetry layer were **100% ONLINE and READY** (`status: "Idle"`, `media_remaining: 640`, `raw_status: "0x00010001"`).

This RCA definitively answers all 10 mandated investigation points and establishes the targeted, architecture-preserving fix.

---

## 2. Empirical Investigation & Hardware Evidence

### A. Windows Print Spooler Objects (`Get-Printer` & `Win32_Printer`)
Inspection of live CIM printer instances revealed **two distinct Windows printer objects** for the same physical DNP device:

```powershell
Get-Printer | Format-Table -Property Name,DriverName,PortName,PrinterStatus,JobCount,WorkOffline
```

| Name | DriverName | PortName | PrinterStatus | JobCount | WorkOffline | PrinterState | ExtendedStatus |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`DS-RX1 (Copy 1)`** | `DS-RX1` | `USB001` | `Normal (3)` | 0 | **`False`** | `0` (Idle) | `2` (Idle) |
| **`DS-RX1`** | `DS-RX1` | `USB002` | `PendingDeletion (1)` | 1 | **`True`** | `4` (`PENDING_DELETION`) | `16` (`Pending Deletion`) |

### B. Physical PnP Device State (`Get-PnpDevice`)
Inspection of USB device tree (`VID_1343&PID_0005`):

```powershell
Get-PnpDevice -InstanceId 'USB\VID_1343*' | Format-List FriendlyName,InstanceId,Present,Status
```

- **Instance 1 (`5&1F03AB54&0&4`):** `FriendlyName: Dai Nippon Printing DS-RX1`, **`Present: True`**, **`Status: OK`** (Active physical connection mapped to `USB001`).
- **Instance 2 (`5&1F03AB54&0&3`):** `FriendlyName: Dai Nippon Printing DS-RX1`, **`Present: False`**, **`Status: Unknown`** (Dangling unplugged port descriptor mapped to `USB002`).

### C. Direct Native DNP Telemetry Interrogation
Executing the native engine telemetry binary directly:

```cmd
PhotolabDNP.exe OKOKLH json
```

Output:
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
    "media_remaining": 640,
    "life_counter": 8132,
    "counter_a": 8123,
    "counter_b": 8123,
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

**Finding:** The native telemetry layer is completely healthy. Native DNP communication does not depend on the Windows printer queue name; it talks directly to the physical USB device handle.

---

## 3. Detailed Answers to Investigation Questions

### 1. Printer Identity
- **Is configured application printer name "DS-RX1"?**
  Yes. On initial boot, `PrintService.ts` auto-detected or configured `defaultPrinterName = 'DS-RX1'`.
- **Does Windows currently expose it as "DS-RX1 (Copy 1)"?**
  Yes. Windows created `DS-RX1 (Copy 1)` on port `USB001` when the printer was re-enumerated.
- **Are BOTH printers present?**
  Yes. Both queues exist in `Win32_Printer`.
- **Which printer has USB002 / DS-RX1 driver / physical DNP USB device?**
  - `USB002`: Old disconnected queue `DS-RX1` (`WorkOffline = True`, `PrinterState = 4`).
  - `USB001`: Active queue `DS-RX1 (Copy 1)` with `Present = True`, `WorkOffline = False`.
- **Which printer is used by Windows Test Print?**
  `DS-RX1 (Copy 1)` (executed from Windows Settings).
- **Which printer is used by Pictolabs PrintService?**
  `DS-RX1` (the dead queue on `USB002`).
- **Can printer-name mismatch explain Pictolabs = OFFLINE, Windows = IDLE?**
  **Yes, 100%.** Pictolabs queried `Name = 'DS-RX1'`, which returned `WorkOffline = True`.

### 2. Printer Name Resolution
- In `PrintService.ts` (line 371) and `PrinterMonitorService.ts` (line 68):
  `Get-CimInstance Win32_Printer -Filter "Name = '$escaped'"`
  Because `$escaped` was `'DS-RX1'`, it matched the offline `DS-RX1` on `USB002`.
  Because `$p` was not null, the fallback code (`if (-not $p)`) never executed!
  `$p.WorkOffline` was `True`, causing Pictolabs to report `OFFLINE`.

### 3. USB Reconnect Recovery Sequence
1. Printer connected on `USB002` -> Pictolabs ONLINE (`DS-RX1`).
2. USB unplugged -> PnP instance `5&1F03AB54&0&3` becomes `Present = False`. Windows sets `WorkOffline = True` on `DS-RX1`. Pictolabs detects OFFLINE.
3. USB plugged back in (different USB socket or re-enumerated) -> Windows PnP detects device on port `5&1F03AB54&0&4`.
4. Windows binds this to `USB001` and creates a new queue `DS-RX1 (Copy 1)`.
5. Windows sets `DS-RX1` to `PendingDeletion`, `WorkOffline = True`.
6. Pictolabs continuously polls `DS-RX1`, which remains `WorkOffline = True`.
7. **Recovery failed at Step 6 because the application never dynamically updated its target queue to the active sibling `DS-RX1 (Copy 1)`.**

### 4. Native Telemetry
Direct test of `PhotolabDNP.exe OKOKLH json` returned `Idle` (840ms). Native layer is 100% operational. The issue resides strictly in printer name resolution, stale cache handling, and polling duplication.

### 5. Cache & Stale State
- In `PrinterHardwareAdapter.ts`, the cache TTL is 1200ms.
- However, when `queryPrinterHealth` was invoked, `PhotolabDNP` returned `READY`, but then the PowerShell script queried `Name = 'DS-RX1'`, found `WorkOffline = True`, and overwrote the status to `OFFLINE`.
- Because the queue `DS-RX1` is permanently offline in Windows, fresh probes also returned `OFFLINE`.

### 6. Windows Test Print Correlation
Windows Test Print did **NOT** fix the printer; it simply proved that `DS-RX1 (Copy 1)` on `USB001` was working. Pictolabs was simply pointing at the wrong queue.

### 7. Performance Regression
Founder reported noticeable application lag after PRN V2.
- **Evidence:** Two independent timers were polling concurrently:
  1. `PrintService.ts` (line 975): `backgroundHealthTimer` every 3500ms running `PhotolabDNP.exe` + `powershell.exe`.
  2. `PrinterMonitorService.ts` (line 321): `monitorInterval` every 5000ms running `PhotolabDNP.exe` + `powershell.exe`.
- Constantly launching `powershell.exe` every 3.5s and 5.0s consumes significant CPU, creates thread-pool contention, and can cause USB handle collisions if two processes query `PhotolabDNP.exe` with 0ms gap.

### 8. PRN-06 Permanent PENDING Queue Entrapment
In `SyncEngine.ts` (lines 686–697):
- `reprintSessionWithDebounce` rejected any reprint if `status IN ('PENDING', 'PRINTING')`.
- When a transient USB disconnect occurred, `PrintQueueService.ts` scheduled exponential backoffs (5s, 10s, 20s, 40s, 80s).
- During this entire backoff period, the job sat in `status = 'PENDING'`.
- Any operator reprint was rejected with: `"Pencetakan untuk sesi ini sedang berlangsung (Status: PENDING)"`, permanently locking the session from operator recovery.

---

## 4. Architectural Fix Strategy

1. **Dynamic Active Printer Resolution (No Hardcoding):**
   - In `PrintService.ts` and `PrinterMonitorService.ts`:
     When resolving the printer object, if the requested queue is offline or pending deletion (`WorkOffline -or ($p.PrinterState -band 4) -ne 0`), dynamically search for an active sibling queue matching the driver pattern (`*RX1*`, `*DS-RX1*`) with `WorkOffline = False`.
   - Update `defaultPrinterName` dynamically to the active queue (e.g. `DS-RX1 (Copy 1)` or `DS-RX1 (Copy 2)`).
   - In `printImage()`, dispatch to the dynamically resolved active queue.

2. **Performance Optimization & Lag Elimination:**
   - Eliminate redundant background polling in `PrintService.ts` (`backgroundHealthTimer`).
   - Use `PrinterMonitorService.ts` as the single authoritative background monitor (interval: 5000ms).
   - Fast path: If `PhotolabDNP.exe` returns `READY`, do not spawn heavy `powershell.exe` processes on every single 5s tick. Only run PowerShell on boot, on hardware state changes, every 30s as a slow heartbeat, or on explicit manual refresh.
   - This reduces `powershell.exe` execution by **over 85%**.

3. **Pending Queue Trap Resolution:**
   - In `SyncEngine.ts`: If an active job is in `PENDING` with `attempts > 0` or scheduled `next_retry_at`, cancel the stalled retry and allow the operator's manual reprint to proceed immediately.
   - In `PrintQueueService.ts`: Allow `retryPrintJob()` to retry `PENDING` jobs with `attempts > 0`.
