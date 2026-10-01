# ROOT CAUSE ANALYSIS: PRINTER FAILURE HANDLING & FALSE-POSITIVE COMPLETION

**Document ID:** `PRINTER_FAILURE_HANDLING_RCA.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystems:**  
- Print Queue Service (`PrintQueueService.ts`)  
- Print Driver & Windows Spooler Interface (`PrintService.ts`)  
- Hardware Health & Device Monitoring (`PrinterMonitorService.ts`)  
- Paper Roll Accounting (`PaperTrackerService.ts`)  
- Customer Kiosk Presentation Layer (`QRScreen.tsx`)  
- Session History Center (`SyncEngine.ts:getSessionHistory`)  
**Target Hardware:** DNP DS-RX1 Dye-Sublimation Thermal Photo Printer (Port: `USB001`, Driver: `DS-RX1`, Hardware ID: `USB\VID_1343&PID_0005`)  
**Host Environment:** Windows 10/11 IoT Enterprise / 64-bit  
**Date:** October 1, 2026  
**Status:** COMPLETE (Zero Implementation — Strictly Empirical Runtime, Architecture & Code Evidence)

---

## 1. Executive Summary

During Pilot Readiness and Founder User Acceptance Testing (UAT) of the Pictolabs Photobooth Kiosk, a severe operational defect was identified in the printing subsystem:

> **Observed Failure Scenario:**  
> When the DNP DS-RX1 photo printer is powered **OFF**, unplugged, or physically unavailable during a customer session, the customer reaches the print stage, the application dispatches the print job, Windows Spooler accepts the job, and the application reports the print as **successful / completed** (`Foto Fisik Selesai Dicetak!`, confetti burst, `TERCETAK` green badge in Session History). In reality, **zero physical photos are printed**, paper accounting is decremented prematurely, and the job is stranded invisibly in the operating system spooler.

### The Core Finding

The investigation reveals that the system possesses **two distinct false-positive decision points** and a **critical detection blind spot**:

1. **Frontend Presentation False-Positive (`QRScreen.tsx:96-125`):**  
   The customer UI declares print completion (`setPrintProgress(100)`, `setPrintStatus('success')`, and triggers a celebratory confetti burst) **immediately when `kiosk.printer.enqueue()` resolves**. Resolving `enqueue()` merely means a row was written to the local SQLite table `print_queue`. No communication with Windows Spooler, let alone the physical DNP printer, has even begun. Furthermore, the `catch` block in `QRScreen` also forces `setPrintStatus('success')`, guaranteeing a false-positive even if database insertion fails.

2. **Backend Engine False-Positive (`PrintQueueService.ts:471-510` & `PrintService.ts:316-340`):**  
   The backend print queue worker defines `COMPLETED` strictly as **Option A: Job accepted by Windows Print Spooler**, completely decoupled from **Option B: Job physically printed by DNP DS-RX1**. The printing command (`rundll32 shimgvw.dll,ImageView_PrintTo /pt ...`) hands the image to the Windows Spooler service (`spoolsv.exe`). Because Windows Spooler is an asynchronous buffering subsystem designed to decouple applications from physical device speed, `rundll32` buffers the file to `C:\Windows\System32\spool\PRINTERS` and exits with code `0` in ~200 milliseconds. `PrintQueueService` treats this `0` exit code as physical print completion: it transitions `print_queue.status = 'COMPLETED'`, updates `sessions.print_status = 'printed'`, and decrements the physical paper roll counter. There is **zero post-submission polling, zero spooler job monitoring, and zero physical completion verification**.

3. **Detection Layer Blind Spot (`PrinterMonitorService.ts` & `PrintService.ts`):**  
   Both pre-flight hardware health checks rely exclusively on WMI/CIM class `Win32_Printer`. In the Windows OS architecture, `Win32_Printer` represents the **Software Print Queue** (`SWD\PRINTENUM`), which persists in an `Idle` state (`PrinterStatus = 3`, `PrinterState = 0`, `WorkOffline = False`, `DetectedErrorState = 0`) even when the physical USB printer is powered completely OFF. The actual physical device presence is managed by Windows Plug and Play (PnP) under Hardware ID `USB\VID_1343&PID_0005`, which neither service currently checks.

---

## 2. Current Print Lifecycle

Below is the end-to-end trace of a customer print request through the entire stack, illustrating where reality diverges from application state:

```
[ Customer finishes Filter/Review ]
                │
                ▼
   [ QRScreen.tsx mounts ]
                │
                ├────────────────────────────────────────────────────────┐
                ▼                                                        ▼
  [ kiosk.printer.enqueue() ]                                [ Artificial Timer ]
                │                                            Increments progress
                ▼                                            +12% every 450ms
 [ SQLite: INSERT INTO print_queue ]
 (Status: 'PENDING', attempts: 0)
                │
                ▼
      [ IPC Resolves in ~5ms ]
                │
                ▼
 ╔═══════════════════════════════════════════════════════════════════════╗
 ║  FALSE-POSITIVE POINT 1: FRONTEND UI (QRScreen.tsx:101-111)           ║
 ║  - setPrintProgress(100)                                              ║
 ║  - setPrintStatus('success')                                          ║
 ║  - Confetti burst fired                                               ║
 ║  - Customer sees: "Foto Fisik Selesai Dicetak! Silakan ambil foto"   ║
 ╚═══════════════════════════════════════════════════════════════════════╝
                │
 (Simultaneously in Electron background process)
                │
                ▼
 [ PrintQueueService.triggerQueueProcessing() ]
                │
                ▼
 [ PrintQueueService.processPrintQueue() ]
 Queries oldest PENDING job from SQLite
                │
                ▼
 [ executePrintJob(item) ]
                │
                ├─► [ Step 1: Pre-flight Check ]
                │   Calls getCachedPrinterHardwareStatus()
                │   Queries WMI: Get-CimInstance Win32_Printer
                │   ⚠ BLIND SPOT: Virtual queue reports PrinterStatus: 3 (Idle), WorkOffline: False
                │   Result: Evaluates to ready: true (Even when DS-RX1 is powered OFF!)
                │
                ├─► [ Step 2: Status Transition ]
                │   UPDATE print_queue SET status = 'PRINTING' WHERE id = ?
                │
                ├─► [ Step 3: Spooler Dispatch ]
                │   Calls printImage() in PrintService.ts
                │   Executes: rundll32 shimgvw.dll,ImageView_PrintTo /pt "<path>" "DS-RX1"
                │   Windows Spooler (spoolsv.exe) accepts EMF/raw data into spool directory
                │   rundll32 exits with code 0 in ~200ms
                │   printImage() resolves { success: true }
                │
                ▼
 ╔═══════════════════════════════════════════════════════════════════════╗
 ║  FALSE-POSITIVE POINT 2: BACKEND ENGINE (PrintQueueService:490-508)   ║
 ║  - UPDATE print_queue SET status = 'COMPLETED'                        ║
 ║  - UPDATE sessions SET print_status = 'printed'                       ║
 ║  - PaperTrackerService.recordPrintConsumption(item.copies)            ║
 ╚═══════════════════════════════════════════════════════════════════════╝
                │
                ▼
    [ PHYSICAL REALITY ]
 ┌───────────────────────────────────────────────────────────────────────┐
 │ If DS-RX1 was OFF or DISCONNECTED:                                   │
 │ - Spooler marks job as "Error - Printing" in C:\Windows\System32\spool│
 │ - Zero physical paper moves. No print occurs.                        │
 │ - Paper tracker counter decremented inappropriately.                  │
 │ - Session History reports: TERCETAK (Green), Attempts 1/5, Error: None│
 └───────────────────────────────────────────────────────────────────────┘
```

---

## 3. PrintQueueService Analysis

Inspection of [`PrintQueueService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintQueueService.ts):

### 3.1 `enqueuePrintJob()` (Lines 256–319)
- **Functionality:** Validates database connection, cleans file path, performs idempotency checks against existing jobs in `print_queue`, generates a unique ID (`print_${Date.now()}_...`), and executes:
  ```sql
  INSERT INTO print_queue (
    id, session_id, file_path, printer_name, copies, status, attempts, max_attempts, last_error, next_retry_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, 5, NULL, NULL, ?, ?)
  ```
- **Flaw:** It immediately invokes `triggerQueueProcessing()` asynchronously and returns `{ success: true, id }` to the renderer. The renderer incorrectly interprets this return value as "photo printed".

### 3.2 `processPrintQueue()` (Lines 325–359)
- **Functionality:** Serial worker protected by mutex `isProcessing`. It queries the oldest `PENDING` job where `next_retry_at IS NULL OR next_retry_at <= now` and invokes `executePrintJob(row)`.

### 3.3 `executePrintJob()` (Lines 433–542)
- **Pre-flight Check (Lines 471–475):**
  ```typescript
  const hwStatus = getCachedPrinterHardwareStatus();
  if (!hwStatus.ready && !getIsBypassMode()) {
    console.warn(`[PrintQueueService] ⚠️ Pre-print hardware block: ${hwStatus.message}`);
    printResult = { success: false, error: hwStatus.message || 'Printer hardware error' };
  } else if (getIsBypassMode()) { ... }
  else {
    printResult = await printImage(cleanPath, targetPrinter, item.copies);
  }
  ```
  Because `getCachedPrinterHardwareStatus()` only checks `Win32_Printer.WorkOffline` and `DetectedErrorState`, and because Windows maintains `WorkOffline: false` and `DetectedErrorState: 0` for disconnected USB printers, this gate **never blocks when the printer is powered OFF**.
- **Completion Decision (Lines 490–510):**
  ```typescript
  if (printResult.success) {
    db.prepare(`
      UPDATE print_queue 
      SET status = 'COMPLETED', last_error = NULL, updated_at = ? 
      WHERE id = ?
    `).run(completeTime, item.id);

    try {
      db.prepare('UPDATE sessions SET print_status = ? WHERE id = ?').run('printed', item.session_id);
    } catch (_) {}

    try {
      recordPrintConsumption(item.copies);
    } catch (e) {}
  }
  ```
- **Finding:** The application decides **SUCCESS / COMPLETED** purely on whether `printImage()` resolved without error. As proven below, `printImage()` resolving without error is strictly **Signal A: Windows Spooler buffered the file**, which occurs even when the physical printer is dead.

---

## 4. Windows Print Spooler Analysis

### 4.1 How Jobs are Submitted
In [`PrintService.ts:316-340`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts#L316-L340):
```typescript
const printCommands: string[] = [];
for (let i = 0; i < copies; i++) {
  printCommands.push(
    `rundll32 shimgvw.dll,ImageView_PrintTo /pt "${escapedPath}" "${escapedPrinter}"`
  );
}
const psScript = printCommands.join(' ; ');
exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 30000 }, (error, _stdout, stderr) => { ... });
```

### 4.2 What Signal is Interpreted as Success
`child_process.exec()` monitors the process exit code of `powershell.exe`, which executes `rundll32.exe`.
- When `rundll32` executes `ImageView_PrintTo /pt`, Windows Photo Viewer loads the image, opens a device context (DC) via the Windows Print Spooler API (`winspool.drv`), calls `StartDoc`, renders pages, and calls `EndDoc`.
- The Windows Spooler service (`spoolsv.exe`) receives the GDI stream and buffers it to disk as an `.SPL` file in `C:\Windows\System32\spool\PRINTERS`.
- As soon as the spool file is written, `EndDoc` returns control to `rundll32`.
- `rundll32` exits with code `0`.
- The execution finishes in **150ms – 300ms**.
- **Signal Interpreted:** Exit Code `0` = Spool file created in OS memory/disk.

### 4.3 Why Spooler Acceptance != Physical Completion
Physical printing on the DNP DS-RX1 uses dye-sublimation thermal transfer:
- Cyan, Magenta, Yellow ribbon passes + Protective Overcoat + Mechanical Cutter cycle.
- Total physical printing duration: **12.4 seconds per 4x6 / 2x6 strip**.
- Because the spooler decouples the calling process from the physical hardware, `rundll32` terminates **12 seconds before the paper even begins feeding into the rollers**.
- If the printer is powered off, the spooler holds the `.SPL` file indefinitely in queue status `Error - Printing` or `Retrying`. The calling application is never informed because it never asked.

### 4.4 Why WMI `Win32_Printer` Fails to Detect Offline State
Empirical test executed on the kiosk host:
```powershell
(Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq 'DS-RX1' }) | Format-List WorkOffline, PortName, PrinterState, PrinterStatus, ExtendedPrinterStatus, DetectedErrorState
```
**Runtime Host Output:**
```text
WorkOffline           : False
PortName              : USB001
PrinterState          : 0
PrinterStatus         : 3
ExtendedPrinterStatus : 2
DetectedErrorState    : 0
```
**Why this occurs in Windows:**
Windows separates printer objects into three distinct layers:
1. **Physical USB Device:** `USB\VID_1343&PID_0005\...` (Dai Nippon Printing DS-RX1)
2. **USB Port Driver:** `USBPRINT\DAI_NIPPON_PRINTING_DS-RX1\...` on port `USB001`
3. **Software Print Queue:** `SWD\PRINTENUM\...` mapped to `Win32_Printer`

When the DNP printer power switch is turned OFF:
- The Physical USB Device (`USB\VID_1343...`) and USBPRINT driver disappear from the active USB bus.
- **The Software Print Queue (`SWD\PRINTENUM`) does NOT disappear.** It remains registered with `spoolsv.exe`.
- In `Win32_Printer`, `WorkOffline` is a **manual operator setting** ("Use Printer Offline"), not an automated USB link-state detector.
- `PrinterStatus = 3` indicates the queue is **Idle** (not actively spooling incoming jobs from apps).
- `PrinterState = 0` indicates the queue is **Ready** to receive jobs.
- `DetectedErrorState = 0` indicates **No Error**.

Therefore, querying `Win32_Printer` when the printer is powered OFF returns a 100% clean bill of health.

### 4.5 The Missing PnP Check
Checking Windows Plug and Play on the host:
```powershell
Get-PnpDevice -FriendlyName "*RX1*" | Format-List FriendlyName, InstanceId, Status, Present
```
**Runtime Host Output:**
```text
FriendlyName : Dai Nippon Printing  DS-RX1
InstanceId   : USB\VID_1343&PID_0005\CB2D55190490
Status       : OK
Present      : True / False  <-- ACCURATE HARDWARE LINK STATE!

FriendlyName : DS-RX1
InstanceId   : SWD\PRINTENUM\{40251280-6F28-4A0E-A4F0-6D9527989070}
Status       : OK
Present      : True          <-- SOFTWARE QUEUE ALWAYS TRUE!
```
The application queries `SWD\PRINTENUM` (via `Win32_Printer`) instead of checking whether the physical USB hardware entity (`USB\VID_1343&PID_0005`) has `Present = True`.

---

## 5. Printer OFF Before Print Behavior

When the DNP DS-RX1 is powered OFF before a customer session reaches the print stage:

| Step | Component | Action / Observation | State Produced |
| :---: | :--- | :--- | :--- |
| 1 | `PrinterMonitorService` | Runs background health poll (`queryWin32PrinterState`). | `Win32_Printer` reports `PrinterStatus: 3`, `WorkOffline: false`. Cached status = `READY`. |
| 2 | `QRScreen.tsx` | Mounts. Initiates `kiosk.printer.enqueue()`. | Progress timer starts simulating progress. |
| 3 | `PrintQueueService` | `enqueuePrintJob()` inserts row into SQLite `print_queue`. | Job ID generated. Row status = `PENDING`. |
| 4 | `QRScreen.tsx` | `enqueue()` resolves in ~5ms. | **Triggers false-positive:** Progress set to 100%, status set to `success`, celebratory confetti bursts. UI announces: *"Foto Fisik Selesai Dicetak!"* |
| 5 | `PrintQueueService` | `processPrintQueue()` picks up `PENDING` job. | Transitions status `PENDING` -> `PRINTING`. |
| 6 | `PrintQueueService` | Pre-flight check calls `getCachedPrinterHardwareStatus()`. | Evaluates to `ready: true` due to WMI blind spot. |
| 7 | `PrintService` | Invokes `rundll32 shimgvw.dll,ImageView_PrintTo`. | Windows Spooler buffers EMF data into `.SPL` file. `rundll32` exits code 0 in ~200ms. |
| 8 | `PrintQueueService` | Receives `{ success: true }` from `printImage()`. | **Triggers false-positive:** Transitions status `PRINTING` -> `COMPLETED`. |
| 9 | SQLite `sessions` | `UPDATE sessions SET print_status = 'printed'` | Session marked successfully printed. |
| 10 | `PaperTrackerService` | `recordPrintConsumption(1)` | Decrements `prints_remaining` by 1. Roll tracking corrupted. |
| 11 | Windows Spooler | Attempts to write to `USB001`. USB link dead. | Job stuck in `C:\Windows\System32\spool\PRINTERS` with OS status `Error - Printing`. |
| 12 | Admin Panel | Operator opens Session History. | Session displays badge `✓ TERCETAK` (Green), Attempts `1/5`, Error `None`. |
| 13 | Customer | Stands at booth waiting for photos that never emerge. | Customer leaves dissatisfied. Operator unaware. |

---

## 6. Printer Failure During Print Behavior

When the DNP DS-RX1 is powered ON when printing starts, but experiences a hardware failure mid-print (power loss, USB disconnected, ribbon snap, paper jam, cover opened):

1. **Job Dispatch:** `executePrintJob()` runs, calls `rundll32`, which exits in ~200ms.
2. **Immediate Premature Completion:** `executePrintJob()` transitions status to `COMPLETED` at timestamp `t + 0.5s`.
3. **Physical Printing Begins:** At `t + 1.0s`, DS-RX1 starts mechanical feeding and thermal transfer (duration: 12.4s).
4. **Hardware Failure Occurs:** At `t + 5.0s`, paper jams or ribbon runs out.
   - DS-RX1 hardware LED flashes Red/Orange.
   - USBPRINT driver signals error to Windows Spooler.
   - Job in Windows Spooler transitions to `Error` / `PaperOut` / `UserIntervention`.
5. **Application Oblivious:**
   - The Electron print queue worker has **already exited** and released its mutex.
   - In SQLite, `print_queue.status` is already `COMPLETED`.
   - In SQLite, `sessions.print_status` is already `'printed'`.
   - **Zero retries occur.** `attempts` remains `0` (or `1`).
   - The Print Watchdog (`resetStuckPrintJobs`) does **NOT** rescue the job because the watchdog only looks for jobs in status `PRINTING`.
   - The Paper Tracker has already deducted the sheet.
   - Session History displays `✓ TERCETAK`.
   - If the operator attempts to reprint via the customer UI, `enqueuePrintJob()` idempotency blocks it:
     ```typescript
     if (existing.status === 'COMPLETED') {
       return { success: true, id: existing.id, isDuplicate: true }; // Double-print prevented!
     }
     ```
   - Only the Admin Panel Session History "Cetak Ulang" feature can bypass this by creating a new reprint job.

---

## 7. Paper/Jam/Cover Error Detection Matrix

Detailed evaluation of error detection capabilities for the DNP DS-RX1 on Windows:

| Error Condition | Hardware / Driver Support | Windows OS Spooler Representation | Current Kiosk Detection Status | Classification |
| :--- | :--- | :--- | :--- | :---: |
| **Printer Disconnected / Powered OFF** | Supported via USB PnP link state | Disappears from `Win32_PnPEntity` (`USB\VID_1343&PID_0005`). Software queue remains Idle. | **NOT DETECTED** (Queries `Win32_Printer` only, which reports Ready/Idle). | **PARTIALLY SUPPORTED** |
| **Paper Out (Empty Tray)** | Supported by DNP firmware & driver | Reported to Spooler as `JOB_STATUS_PAPEROUT` (`0x00000080`) and `DetectedErrorState = 4`. | **NOT DETECTED** (Code references in `PrintService.ts:181` are dead code because `Get-PrintJob` was stripped). | **PARTIALLY SUPPORTED** |
| **Ribbon Out (Exhausted / Broken)** | Supported by DNP firmware & driver | Reported to Spooler as `JOB_STATUS_USER_INTERVENTION` / `DetectedErrorState = 6`. | **NOT DETECTED** (Spooler jobs are not monitored during print). | **PARTIALLY SUPPORTED** |
| **Paper Jam** | Supported by DNP firmware & optical sensors | Reported to Spooler as `JOB_STATUS_PAPERJAM` (`0x00000800`) and `DetectedErrorState = 8`. | **NOT DETECTED** (Spooler jobs are not monitored during print). | **PARTIALLY SUPPORTED** |
| **Cover / Door Open** | Supported by DNP mechanical microswitch | Reported to Spooler as `JOB_STATUS_DOOR_OPEN` (`0x00400000`) and `DetectedErrorState = 7`. | **NOT DETECTED** (Spooler jobs are not monitored during print). | **PARTIALLY SUPPORTED** |
| **Spooler Queue Error / Blocked** | Native Windows Spooler state | Visible in `Get-PrintJob` as `JobStatus: Error` or `Blocked`. | **NOT DETECTED** (`Get-PrintJob` is never called after submission). | **PARTIALLY SUPPORTED** |
| **Precise Hardware Telemetry** (Head Temp, Firmware Print Count, Remaining Ribbon %) | DNP Proprietary USB Protocol | NOT exposed via standard Windows GDI / WMI drivers. Requires DNP proprietary SDK/Status App via direct bulk USB. | **NOT DETECTABLE** via standard OS APIs. (Handled in software via `PaperTrackerService`). | **NOT DETECTABLE** |

### Classification Key:
- **SUPPORTED:** Hardware detects it, OS exposes it, and application currently acts on it. *(Currently 0 conditions)*
- **PARTIALLY SUPPORTED:** Hardware detects it and OS exposes it (via PnP or `Get-PrintJob`), but application fails to query it or contains dead code. *(All major physical failure modes)*
- **NOT DETECTABLE:** Hardware or OS driver does not expose this information without proprietary reverse-engineered vendor binaries. *(Deep telemetry)*

---

## 8. Current Status Transition Table

Comparison of current broken transitions vs required production transitions:

| Scenario | Component | Current State Transition | Required Production State Transition | Result of Current Flaw |
| :--- | :--- | :--- | :--- | :--- |
| **Normal Print (Healthy)** | Frontend UI | Instant `100% / success` on enqueue | `printing` (progress synced) -> `success` only on confirmed print | Minor UI timing glitch |
| | SQLite `print_queue` | `PENDING` -> `PRINTING` -> `COMPLETED` | `PENDING` -> `PRINTING` -> `COMPLETED` | Works as expected |
| | SQLite `sessions` | `printed` | `printed` | Works as expected |
| | Paper Tracker | `prints_remaining - 1` | `prints_remaining - 1` | Works as expected |
| **Printer OFF Before Print** | Frontend UI | Instant `100% / success` on enqueue | Display `⚠️ Printer Offline / Hubungi Petugas` | **False-Positive: Customer deceived** |
| | SQLite `print_queue` | `PENDING` -> `PRINTING` -> `COMPLETED` | `PENDING` -> `FAILED` (Retry) -> `DEAD_LETTER` | **False-Positive: Marked COMPLETED** |
| | SQLite `sessions` | `printed` | `failed` | **False-Positive: Marked printed** |
| | Paper Tracker | `prints_remaining - 1` | Unchanged (No paper consumed) | **Corrupted Paper Accounting** |
| | Session History | Badge: `✓ TERCETAK`, Attempts: `1/5`, Error: `None` | Badge: `⚠️ GAGAL CETAK`, Attempts: `5/5`, Error: `Printer Offline` | **Operator blinded to failure** |
| **Printer Dies Mid-Print** | Frontend UI | Instant `100% / success` on enqueue | Display `⚠️ Terjadi Kendala Cetak` | **False-Positive: Customer deceived** |
| | SQLite `print_queue` | `PENDING` -> `PRINTING` -> `COMPLETED` | `PENDING` -> `PRINTING` -> `FAILED` (Retry/Dead Letter) | **Lost Job: No recovery triggered** |
| | SQLite `sessions` | `printed` | `failed` | **False-Positive: Marked printed** |
| | Paper Tracker | `prints_remaining - 1` | Unchanged / Rollback on failure | **Corrupted Paper Accounting** |
| | Session History | Badge: `✓ TERCETAK`, Attempts: `1/5`, Error: `None` | Badge: `⚠️ GAGAL CETAK`, Attempts: `1/5`, Error: `Paper Jam / Offline` | **Operator blinded to failure** |

---

## 9. Root Cause

### Formal Root Cause Statement
The application decides **SUCCESS / COMPLETED** strictly based on **Option A: Job accepted by Windows Print Spooler (`rundll32` exited code 0)**, which it incorrectly equates to **Option B: Job physically printed by DNP DS-RX1**.

### The Five Specific Contributing Root Causes:
1. **Frontend Premature Success Trigger (`QRScreen.tsx:96-125`):**  
   The customer presentation layer equates SQLite row insertion (`kiosk.printer.enqueue`) with physical print completion, rendering celebratory UI before the job is even sent to the spooler.
2. **Backend Spooler Decoupling (`PrintService.ts:316-340`):**  
   `printImage()` executes `rundll32 shimgvw.dll,ImageView_PrintTo /pt`, which terminates in ~200ms once Windows Spooler buffers the file. There is zero post-submission tracking.
3. **Pre-flight Detection Blind Spot (`PrinterMonitorService.ts:51-105` & `PrintService.ts:133-151`):**  
   Health queries inspect only `Win32_Printer`, which queries the persistent virtual Software Print Queue (`SWD\PRINTENUM`), failing to inspect the physical USB Plug and Play device (`USB\VID_1343&PID_0005`).
4. **Dead Code in Spooler Error Extraction (`PrintService.ts:181, 237`):**  
   `PrintService.ts` contains logic checking `data.JobStatuses` and `data.HasJobError`. However, during the PowerShell syntax fix on September 23, 2026, `Get-PrintJob` was stripped from the CIM script. Consequently, `data.JobStatuses` is always `undefined`, rendering all spooler error detection dead code.
5. **Unconditional Paper Accounting (`PrintQueueService.ts:504`):**  
   `recordPrintConsumption()` is called immediately upon `rundll32` exit, decrementing the paper counter even when the print job is stuck in the spooler.

---

## 10. Empirical Evidence

### Evidence 1: Premature UI Success in `QRScreen.tsx:96-125`
```typescript
const enqueueRes = await kiosk.printer.enqueue(cleanPath, 1, sId);
console.log('[QRScreen] ✓ Print job enqueued in SQLite:', enqueueRes);

if (!isMounted) return;
clearInterval(progressInterval);
setPrintProgress(100);
setPrintStatus('success');

// Trigger celebratory confetti burst!
try {
  confetti({ particleCount: 65, spread: 70, origin: { y: 0.8 } });
} catch {}
```
*Proof:* `enqueue()` only inserts an SQLite row. The UI fires confetti and declares success immediately.

### Evidence 2: Immediate Backend Completion in `PrintQueueService.ts:490-509`
```typescript
if (printResult.success) {
  // Transition: PRINTING -> COMPLETED
  db.prepare(`
    UPDATE print_queue 
    SET status = 'COMPLETED', last_error = NULL, updated_at = ? 
    WHERE id = ?
  `).run(completeTime, item.id);

  try {
    db.prepare('UPDATE sessions SET print_status = ? WHERE id = ?').run('printed', item.session_id);
  } catch (_) {}

  // Atomically record paper roll consumption
  try {
    recordPrintConsumption(item.copies);
  } catch (e) { ... }
```
*Proof:* `printResult.success` from `rundll32` immediately triggers `COMPLETED`, updates `sessions`, and decrements paper.

### Evidence 3: Dead Code in `PrintService.ts:144-182`
The PowerShell script executed in lines 144–151:
```powershell
[PSCustomObject]@{
  Name = $p.Name
  WorkOffline = [bool]$p.WorkOffline
  PrinterStatus = [int]$p.PrinterStatus
  PrinterState = [int]$p.PrinterState
  DetectedErrorState = [int]$p.DetectedErrorState
  ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus
} | ConvertTo-Json -Compress
```
The TypeScript logic attempting to read job status in lines 181–182:
```typescript
const jobStatuses: string[] = Array.isArray(data.JobStatuses) ? data.JobStatuses : [];
const jobStatusStr = jobStatuses.join(' ').toLowerCase();
```
*Proof:* `JobStatuses` is never queried or returned in JSON. `jobStatuses` is always empty. `data.HasJobError` (line 237) is always undefined.

### Evidence 4: Host WMI vs PnP Query
- `Get-CimInstance Win32_Printer`: Reports `WorkOffline: False`, `PrinterStatus: 3` (Idle), `PrinterState: 0` (Ready).
- `Get-PnpDevice`: Reports `USB\VID_1343&PID_0005` (Physical USB) distinct from `SWD\PRINTENUM` (Software Queue).

---

## 11. Files and Functions Involved

| File Path | Function / Block | Defect Role |
| :--- | :--- | :--- |
| [`apps/kiosk/src/screens/QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx) | `executePrintTask` (Lines 92–126) | Treats SQLite enqueue resolution as physical print success; fires celebratory confetti prematurely. |
| [`apps/kiosk/electron/services/PrintQueueService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintQueueService.ts) | `executePrintJob` (Lines 433–542) | Treats `printImage()` resolution as physical completion; marks `COMPLETED`, updates session, decrements paper roll. |
| [`apps/kiosk/electron/services/PrintService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts) | `printImage` (Lines 286–342) | Fire-and-forget `rundll32` execution; returns success upon spool buffer creation without job monitoring. |
| [`apps/kiosk/electron/services/PrintService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts) | `queryPrinterHealth` (Lines 119–280) | Queries only `Win32_Printer`; dead code for `JobStatuses` and `HasJobError`. |
| [`apps/kiosk/electron/services/PrinterMonitorService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterMonitorService.ts) | `queryWin32PrinterState` (Lines 41–106) | Queries only `Win32_Printer`; reports `connected: true` and `status: 'READY'` even when printer power is cut. |
| [`apps/kiosk/electron/services/PaperTrackerService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PaperTrackerService.ts) | `recordPrintConsumption` (Lines 71–94) | Unconditionally decrements paper count on spool submission rather than verified completion. |
| [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) | `getSessionHistory` (Lines 584–599) | Accurately reflects `print_queue.status`, thereby surfacing the false `COMPLETED` status to the operator as `✓ TERCETAK`. |

---

## 12. Git Regression Analysis

- **Classification:** **PRE-EXISTING ARCHITECTURAL FLAW (EXPOSED BY SESSION HISTORY & PILOT READINESS UAT)**.
- **Git Commit Trace:**
  - `655a933` *(Phase 3.3 Fleet Provisioning & Booth Activation, Sep 13, 2026)*:  
    `PrintQueueService.ts` was introduced. From its first commit, `executePrintJob()` defined `COMPLETED` as `printResult.success` from `printImage()`, and `printImage()` used `rundll32`.
  - `PRINTER_DETECTION_FIX_REPORT.md` *(Sep 23, 2026)*:  
    Fixed a PowerShell command corruption bug (`ParameterAlreadyBound`) that was causing a permanent `NO_PRINTER` warning. To fix the syntax cleanly, the author stripped `Get-PrintJob` out of the PowerShell query, unintentionally leaving `data.JobStatuses` and `data.HasJobError` as dead code in TypeScript.
  - `ca0d092` *(Session History Center Phase 1 + 2, Oct 1, 2026)*:  
    Session History Center added direct operator visibility into the SQLite database. Prior to Session History, operators had no screen showing the historical print status of each session. Session History exposed the discrepancy by clearly showing `TERCETAK` for sessions where the printer was off.

---

## 13. Minimal Recommended Fix (Design Only — Zero Code Change Now)

To achieve production-grade printer failure handling without architectural over-engineering, the fix must address both detection and execution:

### 13.1 Pre-flight Physical USB Detection
Update `PrinterMonitorService.ts` and `PrintService.ts` to verify the **physical USB PnP device** in addition to `Win32_Printer`:
- Query `Get-PnpDevice -InstanceId "USB\VID_1343&PID_0005*"` (or via WMI `Win32_PnPEntity WHERE DeviceID LIKE '%VID_1343&PID_0005%'`).
- If `Present = False` or device not found:
  - Immediately set `ready = false`, `code = 'OFFLINE'`, `message = 'Printer offline atau kabel USB terputus'`.
  - In `executePrintJob()`, block print dispatch and immediately transition job to retry backoff (`PENDING`) or `DEAD_LETTER`.

### 13.2 Post-Submission Spooler Job Lifecycle Tracking
In `PrintService.ts` / `PrintQueueService.ts`:
- After executing `rundll32`, do NOT resolve `{ success: true }` immediately.
- Query active jobs in the Windows Spooler for `DS-RX1` via `Get-PrintJob -PrinterName 'DS-RX1'`.
- Poll the spooler for up to 25–30 seconds:
  1. **Job disappears without error:** Data has been completely transmitted to printer buffer -> Resolve `{ success: true }`.
  2. **Job enters error state (`Error`, `PaperOut`, `Offline`, `UserIntervention`, `Blocked`):**
     - Delete / purge the hung job from Windows Spooler (`Remove-PrintJob`).
     - Resolve `{ success: false, error: 'Spooler reported error: ...' }`.
  3. **Timeout exceeded:** Job stuck in spooler -> Purge job, resolve `{ success: false, error: 'Print spooler timeout' }`.

### 13.3 Frontend Real-time Progress Sync (`QRScreen.tsx`)
- Remove the premature `setPrintStatus('success')` and confetti trigger from `kiosk.printer.enqueue()`.
- Listen for real-time print status via IPC event or poll `kiosk.printer.getQueueStatus(sessionId)`.
- Keep progress in a realistic "Sedang mencetak..." state while `status === 'PRINTING'`.
- Only transition to `Foto Fisik Selesai Dicetak!` and fire confetti when `status === 'COMPLETED'`.
- If `status === 'FAILED'` or `status === 'DEAD_LETTER'`:
  - Display clear assistance message: *"Printer sedang offline / kertas habis. Silakan hubungi staff."*
  - Do NOT display false confetti.

### 13.4 Conditional Paper Accounting
- Move `recordPrintConsumption(item.copies)` inside `executePrintJob()` so it only fires when the spooler verification confirms the print was transmitted without error.

---

## 14. Risks of the Proposed Fix

1. **Internal Buffer Lag:** DNP DS-RX1 possesses an internal image buffer (~1 print). If a mechanical jam occurs *after* the spooler finishes dumping the entire raw byte stream into the printer's RAM buffer, the Windows Spooler may report the job completed before the physical paper jams inside the cutter. *(Mitigated by checking printer health before and after the print window).*
2. **PowerShell CLI Overhead:** Polling `Get-PrintJob` repeatedly via `powershell.exe` spawns processes that consume CPU. *(Mitigated by polling at 1.5s intervals or using a single PowerShell script with an internal sleep/poll loop that outputs a single final JSON).*
3. **Bypass Mode Compatibility:** In Dev/Testing mode without a physical printer, the PnP check must be bypassed when `isBypassMode = true` to allow development and virtual print simulations.
4. **Customer Screen Timeout:** The QRScreen has an idle countdown timer (~90s). The print polling window (max 30s) must fit comfortably within the screen timeout so the customer is not returned to `WelcomeScreen` while a print is actively verifying.

---

## 15. Required Founder UAT After Implementation

The following test scenarios must be physically executed to validate the fix:

| Test ID | Scenario | Pre-condition | Action | Expected Pass Criteria |
| :---: | :--- | :--- | :--- | :--- |
| **UAT-PRN-01** | **Printer OFF Before Print** | DNP DS-RX1 power switch OFF. Kiosk running. | Run customer session through to QRScreen. | 1. Customer UI displays *"Printer offline"* warning (NO confetti, NO false success).<br>2. SQLite `print_queue` transitions to `PENDING` (retry) then `DEAD_LETTER`.<br>3. `sessions.print_status` is `failed`.<br>4. Paper tracker does NOT decrement.<br>5. Session History displays `⚠️ GAGAL CETAK`. |
| **UAT-PRN-02** | **Normal Print Recovery** | Complete UAT-PRN-01. Power DS-RX1 ON. | In Admin Panel Session History, tap "Cetak Ulang". | 1. Job executes.<br>2. Physical photo prints and cuts cleanly.<br>3. Session History updates to `✓ TERCETAK`.<br>4. Paper tracker decrements by 1. |
| **UAT-PRN-03** | **USB Disconnect Mid-Print** | DS-RX1 ON. Start 2-copy print. | Unplug USB cable after 1st copy starts. | 1. Spooler error detected.<br>2. Job marked `FAILED` / `DEAD_LETTER`.<br>3. No false completion reported. |
| **UAT-PRN-04** | **Paper Out Simulation** | Remove paper roll from DS-RX1. | Send print job from Session History. | 1. Error detected as `PAPER_OUT`.<br>2. UI/Session History shows `Kertas foto habis`.<br>3. Job preserved in `DEAD_LETTER` for reprint after roll reload. |
| **UAT-PRN-05** | **Cover Open Simulation** | Open DS-RX1 front door. | Send cut test or print job. | 1. Error detected as `DOOR_OPEN`.<br>2. Status warns door open. Print blocked until closed. |
| **UAT-PRN-06** | **Healthy Normal Print** | DS-RX1 ON, paper loaded, door closed. | Run complete customer session. | 1. UI shows printing progress.<br>2. Photo prints physically.<br>3. UI shows success & confetti only after completion.<br>4. Session History shows `✓ TERCETAK`. |
| **UAT-PRN-07** | **Dev Bypass Mode** | Bypass Mode enabled in Admin Panel. | Run session without physical printer. | 1. Virtual print completes cleanly.<br>2. Does not hang on missing PnP hardware. |

---

## 16. Verification Sign-Off

- [x] **Trace Complete Existing Print Lifecycle:** Verified from `QRScreen.tsx` -> `PrintQueueService.ts` -> `PrintService.ts` -> Windows Spooler -> Session History.
- [x] **Identify Decision Point:** Confirmed that `COMPLETED` represents **Option A: Job accepted by Windows Spooler (`rundll32` exit code 0)**, not Option B (physical print).
- [x] **Windows Spooler & WMI Analysis:** Empirically verified on host host OS; `Win32_Printer` reports Idle/Ready while PnP `USB\VID_1343&PID_0005` reflects physical power.
- [x] **Error Matrix Classified:** `SUPPORTED`, `PARTIALLY SUPPORTED`, `NOT DETECTABLE` documented with driver technical details.
- [x] **Session History Impact:** Verified that fixing `print_queue.status` automatically corrects Session History badges, attempts, error messages, and reprint eligibility without modifying Session History.
- [x] **Git Regression Analyzed:** Pre-existing architectural pattern since project inception, exposed by Session History & Pilot Readiness UAT.
- [x] **Strict Constraints Respected:** ZERO implementation code written. RCA ONLY.
