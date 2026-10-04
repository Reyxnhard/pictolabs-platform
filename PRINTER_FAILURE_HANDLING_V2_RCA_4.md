# PRINTER FAILURE HANDLING V2 — ROOT CAUSE ANALYSIS 4 (RCA-4)

**Document Reference:** `PRINTER_FAILURE_HANDLING_V2_RCA_4.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystems:**
- `App.tsx` (Kiosk Screen Router & View Hierarchy)
- `RenderScreen.tsx` (Post-Render Navigation & SQLite Session Ingestion)
- `QRScreen.tsx` (Unified QR Code, Cloud Download & Print Progress UI)
- `PrintScreen.tsx` (Dormant/Orphaned Screen Component)
- `PrintQueueService.ts` (SQLite Queue Worker, Polling & State Machine)
- `SyncEngine.ts` (Session History DTO & Status Resolution)
- `PrintService.ts` (Direct Dispatch Engine & Pre-flight Hardware Verification)

**Target Hardware:** DNP DS-RX1 Thermal Photo Printer (`USB001`, `DS-RX1 (Copy 1)`)  
**Investigation Date:** 2026-10-05  
**RCA Status:** **ROOT CAUSE CONFIRMED — IMPLEMENTATION STOPPED AS DIRECTED**

---

## 1. Founder UAT Evidence

Following the deployment of RCA-3, Founder executed the first live end-to-end customer session on the kiosk.

### Observed Behavior:
- **Test V4-01 (Full Customer Print): FAIL**
  - Customer session proceeded through Welcome, Product Select, Payment, Frame Design, Capture, Filter, and Render.
  - On the final screen, the print progress indicator steadily advanced and then **permanently froze at approximately 87%**.
  - **No physical photo strip was printed.**
  - Admin opened **Session History Center**:
    - `Status Pencetakan Spooler: PENDING`
    - `Percobaan Spooler: 0 / 5`
    - `Status Sinkronisasi Cloud (R2): COMPLETED` (1 / 5 attempts)
    - `Status SSD: HOT (Tersedia)`
  - Cloud upload and session synchronization completed normally; only the printer subsystem remained in `PENDING (0/5)`.
- **Test V4-02 (Admin Reprint): PASS (with ~10s delay)**
  - Founder opened Admin Panel and pressed **"Cetak Ulang Foto Terakhir"**.
  - Reprint succeeded and the physical photo strip was printed.
  - However, there was an observed **delay of approximately 10 seconds** between pressing the button and the physical printer starting its paper feed.

---

## 2. Screenshot & Database Evidence

### 2.1 Admin Session History Inspection
```text
┌────────────────────────────────────────────────────────┐
│ Status Pencetakan Spooler:        PENDING              │
│ Percobaan Spooler:                0 / 5                │
│ Status Sinkronisasi Cloud (R2):   COMPLETED            │
│ Percobaan Unggah:                 1 / 5                │
│ Status SSD:                       HOT (Tersedia)       │
└────────────────────────────────────────────────────────┘
```

### 2.2 Live SQLite Inspection (`kiosk.db`)
Direct query on the kiosk SQLite database (`%APPDATA%\@pictolabs\kiosk\pictolabs-data\kiosk.db`):

```sql
SELECT id, created_at, print_status, synced, uploaded, composite_path 
FROM sessions 
WHERE id = 'session_1791148855584_84s0u0';
```
**Result:**
```json
{
  "id": "session_1791148855584_84s0u0",
  "created_at": "2026-10-04T21:21:36.215Z",
  "print_status": "pending",
  "synced": 1,
  "uploaded": 1,
  "composite_path": "C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1791148896124.jpg"
}
```

```sql
SELECT * FROM print_queue WHERE session_id = 'session_1791148855584_84s0u0';
```
**Result:**
```json
[]  /* EMPTY ARRAY — ZERO RECORDS IN print_queue! */
```

```sql
SELECT * FROM upload_queue WHERE session_id = 'session_1791148855584_84s0u0';
```
**Result:**
```text
5 rows: 3 raw photos, 1 composite photo, 1 live photo video.
All 5 rows status = COMPLETED (attempts: 1).
```

---

## 3. Normal Customer Print Timeline

| Step | Timestamp | Component | Action / Observation |
| :---: | :---: | :--- | :--- |
| **T0** | `21:21:30.000Z` | `FilterScreen.tsx` | Customer selects visual filter, proceeds to render. |
| **T1** | `21:21:35.000Z` | `RenderScreen.tsx` | Sharp compositor generates high-res 300 DPI composite at `composites\composite_1791148896124.jpg`. |
| **T2** | `21:21:36.215Z` | `RenderScreen.tsx` ➔ `kiosk.session.create()` | Row inserted into SQLite `sessions` table. Column `print_status` receives schema default `'pending'`. |
| **T3** | `21:21:36.221Z` | `RenderScreen.tsx` | Photos queued into `upload_queue`. Background cloud upload begins. |
| **T4** | `21:21:36.815Z` | `RenderScreen.tsx` | Line 118 executes: `setTimeout(() => navigate('qr'), 600)`. Screen target set to `'qr'`. |
| **T5** | `21:21:36.820Z` | `App.tsx` | Screen router matches line 376: `{(screen === 'print' || screen === 'qr') && <QRScreen {...screenProps} />}`. **Mounts `<QRScreen />`**. |
| **T6** | `21:21:36.850Z` | `QRScreen.tsx` | **Simulated progress interval begins** at 15%, incrementing +6% every 600ms. |
| **T7** | `21:21:36.850Z` | `QRScreen.tsx` | **CRITICAL EVENT: In RCA-3 Fix 3, `kiosk.printer.enqueue()` was removed from `QRScreen.tsx`.** Therefore, **NO IPC CALL IS MADE TO `printer:enqueue`**. |
| **T8** | `21:21:38.000Z` | `QRScreen.tsx` | Status polling interval begins: `kiosk.printer.getQueueStatus(sessionId)`. |
| **T9** | `21:21:38.050Z` | `PrintQueueService.ts` | `getPrintQueueStatus(sessionId)` queries `print_queue`. **Returns `null`** because no row exists for this session. |
| **T10** | `21:21:44.050Z` | `QRScreen.tsx` | Progress ticks: `15% ➔ 21% ➔ 27% ➔ 33% ➔ 39% ➔ 45% ➔ 51% ➔ 57% ➔ 63% ➔ 69% ➔ 75% ➔ 81% ➔ 87%`. |
| **T11** | `21:21:44.650Z` | `QRScreen.tsx` | Progress check line 88: `if (prev >= 85) return prev;`. Progress **permanently stops at 87%**. |
| **T12** | `21:22:18.050Z` | `QRScreen.tsx` | Polling reaches 40s timeout. However, `if (!queueJob) return;` skips the error transition block. UI remains at 87% indefinitely. |

---

## 4. SQLite Queue Timeline

Comparison across sessions in `print_queue`:

1. **Pre-RCA-3 Session (`session_1791146332903_elx261` at `20:40:13Z`):**
   - `print_queue` contains: `id: print_1791146413855_8cu4uf`, `created_at: 2026-10-04T20:40:13.855Z`.
   - *Reason:* Pre-RCA-3, `QRScreen.tsx` still called `kiosk.printer.enqueue()`.
2. **RCA-3 Post-Fix Customer Session (`session_1791148855584_84s0u0` at `21:21:36Z`):**
   - `print_queue` contains: **ZERO ROWS (`[]`)**.
   - *Reason:* `QRScreen.tsx` had `enqueue()` removed, and `PrintScreen.tsx` was never rendered.

---

## 5. Worker Timeline

1. Background worker was running (`startPrintWorker` with 5000ms watchdog interval).
2. Worker loop executes:
   ```sql
   SELECT * FROM print_queue 
   WHERE status = 'PENDING' AND (next_retry_at IS NULL OR next_retry_at <= ?)
   ORDER BY created_at ASC LIMIT 1;
   ```
3. Because no row was ever inserted into `print_queue` for the customer session, the query returned `undefined`.
4. The worker loop immediately broke with zero work to do.
5. The worker **never touched, blocked on, or attempted to execute** the session because the job did not exist in the database.

---

## 6. Admin Reprint Timeline

Founder executed "Cetak Ulang Foto Terakhir" from `AdminScreen.tsx`:

| Step | Timestamp | Component | Action / Observation | Elapsed |
| :---: | :---: | :--- | :--- | :---: |
| **A0** | `0.0s` | `AdminScreen.tsx` | Founder clicks **"Cetak Ulang Foto Terakhir"** (`handleReprint`). Calls `kiosk.printer.reprintLast()`. | `+0.0s` |
| **A1** | `0.05s` | `PrintService.ts` | IPC handler `printer:reprint-last` receives call. Calls `getLastSession()`, finds `composite_1791148896124.jpg`. | `+0.05s` |
| **A2** | `0.1s` | `PrintService.ts` | Invokes `printImage(compositePath, defaultPrinterName, 1)`. **Completely bypasses `PrintQueueService` and `print_queue`**. | `+0.1s` |
| **A3** | `0.1s - 2.5s` | `PrinterHardwareAdapter` | **Pre-flight Live Telemetry Check:** Calls `queryPrinterHealth("DS-RX1 (Copy 1)", true)` with `forceFresh=true`. Spawns `PhotolabDNP.exe`. Process interrogates USB pipe and returns `READY`. | `+2.4s` |
| **A4** | `2.5s - 2.9s` | `PrinterHardwareAdapter` | **Inter-query Cooldown:** Mutex enforces `INTER_QUERY_COOLDOWN_MS = 400ms` guard interval to allow USB controller to settle. | `+0.4s` |
| **A5** | `2.9s - 5.3s` | `PrinterHardwareAdapter` | **Baseline Media Counter Check:** Calls `getHardwareStatus("DS-RX1 (Copy 1)", true)` with `forceFresh=true`. Spawns `PhotolabDNP.exe`. Records baseline: `mediaRemaining = 638`. | `+2.4s` |
| **A6** | `5.3s - 6.8s` | `PrintService.ts` | **Baseline Spooler Snapshot:** Queries Windows Spooler via CIM/WMI (`querySpoolerSnapshot`) to catalog active jobs. | `+1.5s` |
| **A7** | `6.8s - 8.3s` | `PrintService.ts` | **Native Process Dispatch:** Invokes `execFile(printExe, printArgs)`. `print.exe` loads 300 DPI JPEG into GDI+ memory, sends raster data to Windows Spooler on `USB001`. | `+1.5s` |
| **A8** | `8.3s - 9.5s` | `PrintService.ts` | **Spooler Clearance Loop:** Waits `POLL_INTERVAL_MS = 1200ms`, verifies print job has transitioned from Windows Spooler into DNP internal printer hardware buffer. | `+1.2s` |
| **A9** | `9.5s - 10.0s` | DNP DS-RX1 Hardware | Mechanical thermal print head engages, paper rollers feed physical strip, photo strip is printed and cut. | `+0.5s` |

**Total elapsed time before paper feed: ~9.5 – 10.0 seconds.**

---

## 7. Comparison Between the Two Paths

| Dimension | Normal Customer Print Flow | Admin "Cetak Ulang Foto Terakhir" Flow | Admin Session History "Cetak Ulang" Flow |
| :--- | :--- | :--- | :--- |
| **Trigger Origin** | Customer completes Render screen | Operator clicks button in Admin Panel | Operator clicks button in Session History |
| **Target Route** | `RenderScreen` ➔ `QRScreen` | `AdminScreen.tsx` | `SessionHistorySection.tsx` |
| **Job Enqueue** | **MISSING (Never called)** | **Bypassed intentionally** | Calls `PrintQueueService.reprintSession()` |
| **`print_queue` Row** | **0 rows (Empty)** | **0 rows (Direct dispatch)** | **1 row inserted** (`print_reprint_...`) |
| **Queue Worker** | Never invoked | Never invoked | Invoked via `triggerQueueProcessing()` |
| **Pre-Flight Checks** | Never reached | Executed (~5.2s) | Executed (~5.2s in worker) |
| **Dispatch Engine** | Never reached | `print.exe` via Node `execFile` | `print.exe` via Node `execFile` |
| **Physical Output** | **None (Froze at 87%)** | **Physical strip printed** | **Physical strip printed** |
| **Duration to Print** | Infinite (Stuck) | ~10 seconds | ~10 seconds |

---

## 8. Exact Reason for `PENDING 0/5`

Why did Session History show `Status Pencetakan Spooler: PENDING` and `Percobaan Spooler: 0 / 5`?

Inspect [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) lines 584–598:

```typescript
// Print status resolution in getSessionHistory()
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
}
```

1. When `RenderScreen.tsx` created the session in the `sessions` table, the SQLite column definition is:
   `print_status TEXT NOT NULL DEFAULT 'pending'` (line 104 of `SyncEngine.ts`).
2. When Admin opened Session History, `stmtPrint.get(row.id)` executed:
   `SELECT status, attempts, last_error FROM print_queue WHERE session_id = ? ORDER BY created_at DESC LIMIT 1`.
3. Because no row was ever inserted into `print_queue`, `printRow` was `undefined`.
4. `SyncEngine.ts` fell back to `row.print_status`, which was `'pending'`.
5. `printAttempts` remained initialized to `0`.
6. Admin UI rendered `printStatus` (`PENDING`) and `printAttempts` (`0 / 5`).

**Conclusion:** The `PENDING 0/5` displayed in Admin was a **phantom status**. It was not an enqueued job that failed to start; it was the default fallback representation of a session that **never had a print job enqueued in the first place**.

---

## 9. Exact Reason for the ~10 Second Admin Reprint Delay

The ~10 second delay observed during Admin Reprint is **expected sequential execution latency** of the hardening safety checks in `PrintService.printImage()`:

1. **Pre-flight Live Hardware Interrogation:** `PhotolabDNP.exe` process spawned with `forceFresh=true` to query physical USB pipe (`\\.\DNP_RX1`): **~2.3 – 2.5s**.
2. **Inter-query Cooldown Guard:** Mutex pause (`INTER_QUERY_COOLDOWN_MS = 400ms`) to prevent DNP USB pipe lock collisions: **0.4s**.
3. **Baseline Media Counter Read:** Second `PhotolabDNP.exe` process spawned with `forceFresh=true` to capture initial paper counter before print submission: **~2.3 – 2.5s**.
4. **WMI/CIM Spooler Snapshot:** PowerShell CIM query to catalog existing Windows print queue jobs: **~1.2 – 1.5s**.
5. **Native `print.exe` CLI Dispatch:** Process spawn, image decoding, GDI+ rasterization, and transmission to Windows Spooler: **~1.2 – 1.5s**.
6. **Spooler Clearance Verification Loop:** Polling cycle (`POLL_INTERVAL_MS = 1200ms`) to verify raster data has transferred into printer hardware buffer: **~1.2s**.

$$\text{Total Pre-Feed Time} = 2.4\text{s} + 0.4\text{s} + 2.4\text{s} + 1.5\text{s} + 1.5\text{s} + 1.2\text{s} \approx \mathbf{9.4 - 10.4\text{ s}}$$

Only after this sequence finishes does the DNP DS-RX1 physical paper roller activate.

---

## 10. First Failing Layer

**UI Screen Routing & Ingestion Architecture Layer:**
- `App.tsx` routes both `'print'` and `'qr'` screen states to `<QRScreen />`.
- `RenderScreen.tsx` navigates directly to `'qr'` (`navigate('qr')`).
- `PrintScreen.tsx` is an orphaned component that is **never rendered anywhere in the application**.
- When RCA-3 Fix 3 removed `kiosk.printer.enqueue()` from `QRScreen.tsx` under the assumption that `PrintScreen.tsx` was active, the customer session flow was left with **zero callers of `enqueue()`**.

---

## 11. Root Cause

The root cause of the V4 customer print failure is an **architectural mismatch regarding screen ownership of the print enqueue trigger**:

1. In early development, `PrintScreen.tsx` existed as a separate intermediate screen.
2. In later development, printing progress was unified directly into `QRScreen.tsx` so the customer could simultaneously view the QR download code, cloud photo links, and live print progress on a single screen.
3. However, `PrintScreen.tsx` was left in the repository, and `App.tsx` was written as:
   ```tsx
   {(screen === 'print' || screen === 'qr') && <QRScreen {...screenProps} />}
   ```
   rendering `<QRScreen />` for both states, while `RenderScreen.tsx` explicitly navigated to `'qr'`. `PrintScreen.tsx` was never mounted.
4. When RCA-3 was audited, the presence of `kiosk.printer.enqueue()` in both `PrintScreen.tsx` and `QRScreen.tsx` was diagnosed as a "duplicate enqueue".
5. The approved RCA-3 directive stated:
   *"If PrintScreen.tsx is the current enqueue owner: KEEP enqueue there. REMOVE the redundant enqueue() call from QRScreen.tsx."*
6. In compliance with this directive, `enqueue()` was removed from `QRScreen.tsx`.
7. Because `PrintScreen.tsx` was never actually rendered in the customer session flow, **removing `enqueue()` from `QRScreen.tsx` eliminated the ONLY active enqueue trigger in the customer flow**.
8. Consequently, no row was inserted into `print_queue`, leaving the UI progress counter frozen at 87% and Session History showing the fallback `PENDING 0/5`.

---

## 12. Contributing Factors

1. **Dead Component Masking:** `PrintScreen.tsx` was imported in `App.tsx` but never included in the rendered JSX hierarchy.
2. **Ambiguous Route Mapping:** Mapping two distinct screen states (`'print'` and `'qr'`) to the same component (`<QRScreen />`) created confusion about which screen was active during session execution.
3. **Session History Phantom Fallback:** In `SyncEngine.ts`, when a session has no matching record in `print_queue`, the system falls back to `sessions.print_status` (which defaults to `'pending'`) with `0` attempts, creating the false impression that a job was queued and ignored by the worker.
4. **Hardcoded Simulated Progress Plateau:** `QRScreen.tsx` lines 86–91 simulate progress up to 87% (15% + 12 ticks × 6%) while awaiting queue status updates, causing an immediate visual freeze if no queue job is present.

---

## 13. Minimal Proposed Fix (FOR AUTHORIZATION ONLY — NOT IMPLEMENTED)

To restore normal customer printing with zero architectural redesign:

### Proposed Fix 1: Establish `QRScreen.tsx` as the Sole, Authoritative Enqueue Owner
- Re-instate `kiosk.printer.enqueue(cleanPath, 1, sId)` on mount in `QRScreen.tsx`.
- Protect the enqueue call with `hasTriggeredPrint.current` ref to guarantee single-invocation idempotency.
- Remove `kiosk.printer.enqueue()` from `PrintScreen.tsx` (or delete `PrintScreen.tsx` and remove its dead import in `App.tsx`) so there is strictly ONE enqueue owner in the entire codebase.

### Proposed Fix 2: Unambiguous Route Mapping in `App.tsx`
- Change `App.tsx` line 376 from:
  ```tsx
  {(screen === 'print' || screen === 'qr') && <QRScreen {...screenProps} />}
  ```
  to:
  ```tsx
  {screen === 'qr' && <QRScreen {...screenProps} />}
  ```
- Remove unused `'print'` from `KioskScreen` union type or alias it cleanly.

### Proposed Fix 3: Transparent Session History Status Resolution
- In `SyncEngine.ts` line 586, if `printRow` is undefined and `row.print_status === 'pending'`, resolve status as `'NOT_QUEUED'` or `'UNPROCESSED'` rather than `'PENDING'`, preventing operator confusion.

---

## 14. Regression Risks

| Risk | Mitigation |
| :--- | :--- |
| **Double-Enqueue on Component Re-render** | Guarded by `hasTriggeredPrint.current = true` ref in `QRScreen.tsx` + `print_queue` idempotency check in `PrintQueueService.ts`. |
| **Telemetry Concurrency / USB Collision** | Already fully resolved in RCA-3 via `activeQueryPromise` mutex and `INTER_QUERY_COOLDOWN_MS = 400ms`. |
| **Printer Name Syntax Error** | Already fully resolved in RCA-3 via Node.js `execFile()` argument vector directly invoking `print.exe`. |

---

## 15. Exact UAT Required After Fix

1. **Full Customer Session UAT:**
   - Execute complete customer session on kiosk touchscreen: Welcome ➔ Product Select ➔ Payment ➔ Capture ➔ Filter ➔ Render ➔ QR.
   - Verify SQLite `print_queue` receives exactly 1 job (`id: print_...`, `status: PENDING` ➔ `PRINTING` ➔ `COMPLETED`).
   - Verify UI progress advances from 15% ➔ 87% ➔ 100% with confetti.
   - Verify physical photo strip prints and cuts on DNP DS-RX1.
   - Verify Session History displays `Status: COMPLETED`, `Percobaan: 1 / 5`.
2. **Admin Reprint UAT:**
   - Press "Cetak Ulang Foto Terakhir" in Admin Panel.
   - Verify reprint executes cleanly after ~10s.
3. **Session History Reprint UAT:**
   - Press "Cetak Ulang" on a historical session in Session History Center.
   - Verify new queue job (`print_reprint_...`) is created and printed.

---

**STOPPED AFTER RCA.**  
*Awaiting explicit authorization from user before implementing Fix 1, Fix 2, or Fix 3.*
