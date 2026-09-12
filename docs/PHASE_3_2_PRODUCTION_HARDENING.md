# PHASE 3.2 PRODUCTION HARDENING BLUEPRINT
## Architecture Decisions & Reliability Blueprint for Commercial Pilot Deployment
**Target System:** Pictolabs Unattended Autonomous Photobooth (Edge Kiosk + Cloud Orchestration)  
**Document Ref:** `/docs/PHASE_3_2_PRODUCTION_HARDENING.md`  
**Status:** DEFINITIVE BLUEPRINT & ARCHITECTURAL SPECIFICATION  
**Scope:** Pre-Pilot Hardening, Resilience, Hardware Failsafes, and Lifecycle Policies  

---

## 1. Executive Vision & Hardening Tenets

The Pictolabs platform is designed for commercial deployment in high-traffic, unattended retail environments (shopping malls, entertainment centers). In this operational setting, physical hardware and edge software operate without a dedicated technician on site. 

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    THE ZERO-INTERVENTION UNATTENDED TENETS                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Zero Lost Revenue     : A customer who pays must always receive their photos.│
│ 2. Zero Unhandled Black  : The kiosk never shows a Windows desktop or error box.│
│ 3. Self-Healing Edge     : All queues, processes, and drivers auto-recover.     │
│ 4. Deterministic Storage : Local disk never fills up; assets purge safely.      │
│ 5. Proactive Fleet Telemetry: Hardware failures alert cloud before customer sees│
└─────────────────────────────────────────────────────────────────────────────────┘
```

This blueprint defines the architecture, state machines, and fail-safe policies required for **Phase 3.2 Production Hardening** prior to the commercial rollout of Pilot Booth #1.

---

## 2. Crash Recovery Architecture

Unexpected power interruptions (mall power cuts, cord accidental unplugging, circuit breaker trips) and OS freezes represent the highest failure risk for physical photobooths. The system must gracefully recover from power failure at any stage of the session lifecycle.

```
                  ┌───────────────────────────────┐
                  │    TRANSACTION SETTLED (PG)   │
                  └───────────────┬───────────────┘
                                  │
      ┌───────────────────────────┼───────────────────────────┐
      ▼                           ▼                           ▼
[CRASH IN CAPTURE]         [CRASH IN RENDER]          [CRASH IN PRINT/UPLOAD]
      │                           │                           │
      ▼                           ▼                           ▼
Boot: Scan Ledger          Boot: Raw Photos Exist?    Boot: Reconnect Spooler
Check Elapsed Time         Re-Render Composite        Resume Upload Queue
• <15m: Resume Prompt      Advance to RENDERED        Strict Cloud Confirm
• >15m: Issue QR Voucher   Enqueue Print & Sync       Zero Photo Loss
```

### 2.1 Power Loss During Capture (Mid-Session)
- **State at Failure**: Payment is confirmed on Cloud (`PAYMENT_SETTLED`). SQLite record exists. The customer was mid-capture (e.g. between Pose 2 and Pose 4). Raw files on disk are incomplete.
- **Architectural Decision**: **Session Recovery Ledger & Time-Bounded Resume Window**.
- **Edge Policy**:
  - The kiosk maintains a local SQLite `session_recovery_ledger` recording active pose progress in real time (`current_pose`, `total_poses`, `selected_frame_id`, `updated_at`).
  - Upon system restart, the boot sequence inspects the recovery ledger.
  - If an unfinished paid session is detected:
    1. **If Restart Elapsed Time $\le$ 15 Minutes**: The kiosk assumes the same customer is standing in front of the booth. The screen displays: *"Sesi Anda terputus karena gangguan daya. Melanjutkan pemotretan..."* and resumes capture from the last uncompleted pose.
    2. **If Restart Elapsed Time > 15 Minutes**: The kiosk assumes the customer has walked away. The kiosk automatically finalizes the session record as `INTERRUPTED_ABANDONED`, generates a unique **Rescue Voucher Code** in the cloud database with 100% discount, and logs an alert to the Admin Dashboard. If the customer returns, scanning their Midtrans payment receipt at the kiosk or contacting customer support immediately validates the voucher for a free replacement session.

### 2.2 Power Loss During Rendering (Sharp Pipeline)
- **State at Failure**: All 4 raw pose photos were successfully written to the local SSD (`/captures/raw/`). The kiosk lost power while executing the Sharp 300 DPI composite rendering pipeline. No composite image exists yet.
- **Architectural Decision**: **Deterministic Idempotent Re-Render**.
- **Edge Policy**:
  - Raw camera files on disk are immutable once captured.
  - Upon system restart, the boot audit checks sessions where `status = 'CAPTURED'` but `composite_path` is null or missing on disk.
  - The kiosk triggers an automatic, headless background re-render using the raw pose files and the stored frame template configuration.
  - Once rendered, the session status updates to `RENDERED`, and print and upload tasks are enqueued into their respective persistent queues.

### 2.3 Power Loss During Upload (Cloudflare R2 Sync)
- **State at Failure**: Composite render is complete. Binary upload to Cloudflare R2 was actively streaming, or the kiosk lost power right before calling `POST /api/storage/confirm-upload`.
- **Architectural Decision**: **Persistent Transactional Upload Queue with Pre-flight Guard**.
- **Edge Policy**:
  - Queue items reside in local SQLite with transactional state (`PENDING`, `PROCESSING`, `FAILED`, `COMPLETED`).
  - Upon restart, any queue item stuck in `PROCESSING` is automatically reset to `PENDING` with retry backoff.
  - The Pre-flight Guard (`SyncEngine.ts`) checks the SQLite `synced` flag. If the session metadata is not yet in PostgreSQL, it executes `syncSingleSessionToCloud(sessionId)` before dispatching the R2 upload and `confirm-upload`.
  - Zero photo assets are lost; upload resumes automatically in the background without affecting the next customer.

### 2.4 Power Loss During Printing (Thermal Sublimation Spooling)
- **State at Failure**: Print command was dispatched to the Windows Spooler or the DNP printer was physically drawing paper when power cut out.
- **Architectural Decision**: **Decoupled Spooler Reconciliation & Physical Status Verification**.
- **Edge Policy**:
  - The printer spooler queue is managed via a dedicated SQLite table `print_queue`.
  - Upon boot, the kiosk queries the Win32 Print Spooler API.
  - If the previous print job was deleted or corrupted by the power loss:
    1. The kiosk checks the physical printer status (sensor health).
    2. If the printer is ready, it re-dispatches the composite print job automatically (`attempts` incremented).
    3. If the printer reports a physical paper jam caused by the power cut, the kiosk flags the job as `PRINT_JAMMED_NEEDS_SERVICE`, transitions the UI to digital-only mode, and alerts the operator.

### 2.5 Master Startup Recovery Sequence
Every time the kiosk application launches, it executes a deterministic 5-stage initialization protocol before presenting the customer Welcome Screen:

```
[SYSTEM BOOT]
      │
      ▼
STAGE 1: SQLite WAL Checkpoint & Integrity Verification
      │   (Resolve any uncommitted WAL transactions from sudden shutdown)
      ▼
STAGE 2: Hardware Diagnostic Self-Test (POST)
      │   (Ping Canon DSLR, Ping Thermal Printer, Ping Local Network)
      ▼
STAGE 3: Session Recovery Ledger Audit
      │   (Detect in-flight paid sessions; branch to Resume, Voucher, or Archive)
      ▼
STAGE 4: Background Queue Re-Hydration
      │   (Reset hanging 'PROCESSING' upload/print records to 'PENDING')
      ▼
STAGE 5: Fleet Liveness Heartbeat Handshake
      │   (Report BOOT_SUCCESS and hardware health to Cloud API)
      ▼
[ATTRACT / WELCOME SCREEN READY]
```

---

## 3. Printer Reliability Architecture

In unattended photobooths, thermal dye-sublimation printers (DNP DS-RX1HS / DS620) are the primary physical mechanical point of failure. The software architecture must actively isolate and handle all mechanical printer exceptions.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PRINTER RELIABILITY MATRIX                            │
├───────────────────┬───────────────────────────┬─────────────────────────────────┤
│ Exception Event   │ Detection Mechanism       │ Architectural System Response   │
├───────────────────┼───────────────────────────┼─────────────────────────────────┤
│ USB Disconnect    │ WMI Win32_PnPEntity (3s)  │ Freeze spooler; auto-reconnect  │
│ Paper Out         │ Low-Paper Interlock ($\le2$)│ Disable Payment; Maintenance UI │
│ Ribbon Out        │ Win32 Spooler Status Code │ Switch to Digital-Only Delivery │
│ Paper Jam         │ Win32 Spooler Status Code │ Alert Dashboard; Freeze Spooler │
│ Spooler Crash     │ RPC Windows Service Ping  │ Auto-restart `spoolsv.exe`       │
└───────────────────┴───────────────────────────┴─────────────────────────────────┘
```

### 3.1 Low-Paper Interlock & Out-of-Paper Prevention
- **The Problem**: A customer completes payment via QRIS, but the printer has zero paper remaining, resulting in an unfulfilled physical print and customer distress.
- **Architectural Policy**: **Proactive Payment Interlock**.
  - The kiosk maintains a persistent sheet counter tracking prints remaining on the loaded roll (e.g. 700 prints initial capacity for DNP DS-RX1).
  - Every physical print job atomically decrements the counter in SQLite.
  - **The 2-Sheet Safety Ceiling**: When remaining prints $\le 2$:
    1. The Kiosk Welcome Screen immediately disables the "Mulai / Start" button.
    2. The UI displays an informative status: *"Booth Sedang Mengisi Kertas (Maintenance)"*.
    3. The backend heartbeat reports `printerStatus: 'PAPER_EMPTY'`.
    4. The Cloud Dashboard triggers an immediate High-Priority WhatsApp notification to the local mall technician.
  - Under no circumstances is QRIS payment generation allowed when paper capacity is exhausted.

### 3.2 Ribbon Exhaustion & Mechanical Jam Handling
- **Detection**: Background service queries the Win32 Spooler API every 5 seconds inspecting `pStatus` flags (`PRINTER_STATUS_NOT_AVAILABLE`, `PRINTER_STATUS_USER_INTERVENTION`, `PRINTER_STATUS_PAPER_JAM`).
- **Policy**:
  - If a mechanical jam occurs *after* payment and capture:
    1. The kiosk displays an apology screen: *"Pencetakan fisik mengalami kendala teknis. Foto Anda aman di server kami!"*
    2. The screen displays a large QR code and input field for WhatsApp/Email softfile delivery.
    3. The session status in PostgreSQL is marked `COMPLETED_PRINT_FAILED`.
    4. An automated customer support ticket is created in the Admin Dashboard with an option for the operator to dispatch a remote reprint once the printer is serviced.

### 3.3 USB Disconnect & Spooler Hang Self-Healing
- If the printer USB cable is jostled or experiences an electrostatic disconnect:
  1. The kiosk detects printer absence via WMI device polling within 3 seconds.
  2. Active print jobs in the local SQLite `print_queue` are **paused**, not dropped.
  3. The kiosk initiates an automated USB bus re-scan.
  4. If the Windows Print Spooler service (`spoolsv.exe`) becomes non-responsive, the background watchdog executes an elevated service restart (`net stop spooler && net start spooler`).
  5. Upon reconnect, paused jobs resume printing automatically in chronological order.

### 3.4 Persistent Print Queue (`print_queue`)
Print execution is strictly decoupled from the UI thread and executed via a persistent SQLite queue:

| Column | Type | Description |
|:---|:---|:---|
| `id` | TEXT PK | UUID of the print task |
| `session_id` | TEXT | Foreign key to `sessions.id` |
| `file_path` | TEXT | Absolute path to 300 DPI composite JPEG |
| `copies` | INTEGER | Number of physical copies (1 to 4) |
| `status` | TEXT | `PENDING`, `PRINTING`, `PRINTED`, `FAILED` |
| `attempts` | INTEGER | Retry counter (Max: 3) |
| `last_error` | TEXT | Exact Windows API error code |
| `created_at` | DATETIME | Timestamp of enqueue |
| `updated_at` | DATETIME | Timestamp of status change |

---

## 4. Storage Lifecycle Policy

High-resolution DSLR RAW photos and video bursts generate approximately **60 MB to 100 MB of data per session**. In an active mall booth processing 100 sessions daily, local SSD storage would deplete by 10 GB per week. A deterministic, multi-tier storage lifecycle policy is mandatory.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           STORAGE LIFECYCLE TIERS                               │
├─────────────────┬───────────────────────────┬───────────────────────────────────┤
│ Asset Category  │ Local Edge SSD Retention  │ Cloudflare R2 Cloud Retention     │
├─────────────────┼───────────────────────────┼───────────────────────────────────┤
│ RAW Photos      │ 7 Days (Reprint cache)    │ 30 Days (Standard customer access)│
│ Composite Strip │ 7 Days (Reprint cache)    │ 30 Days (Standard customer access)│
│ Live Photo MP4  │ 3 Days (High disk weight) │ 30 Days (Standard customer access)│
│ Boomerang GIF   │ 3 Days (High disk weight) │ 30 Days (Standard customer access)│
│ Session Logs    │ 14 Days (Compressed)      │ 90 Days (Cloud audit ledger)      │
└─────────────────┴───────────────────────────┴───────────────────────────────────┘
```

### 4.1 Local SSD Cleanup Policy (The Three-Key Safety Lock)
- **Execution**: Electron background cron service executing daily at **03:00 AM local venue time** (mall closed).
- **The Non-Negotiable Safety Rule**: Local files are NEVER purged based on date alone. A file may only be deleted if it satisfies the **Three-Key Safety Lock**:
  1. **Key 1 (Age Threshold)**: File creation timestamp exceeds the retention window ($t > 7$ days for photos, $t > 3$ days for videos).
  2. **Key 2 (Local Sync Confirmation)**: The parent session record in SQLite has `synced == 1`.
  3. **Key 3 (Cloud Storage Confirmation)**: The upload queue record in SQLite has `status == 'COMPLETED'` with an explicit cloud confirmation token.
- **Emergency Disk Watermark Trigger**:
  - The kiosk monitors free disk space every 15 minutes.
  - **Normal Operation**: Free SSD space $\ge 20$ GB.
  - **Warning Watermark (< 15 GB)**: Kiosk immediately purges Live Photo MP4 video files older than 24 hours that satisfy Key 2 and Key 3.
  - **Critical Emergency Watermark (< 5 GB)**: Kiosk purges all confirmed RAW photos older than 48 hours and emits a `CRITICAL_DISK_SPACE` alert to the Cloud Dashboard.

### 4.2 Cloud Retention Policy (Zero-Egress Cost Control)
- **Standard Lifecycle**: Softfiles hosted on Cloudflare R2 bucket `pictolabs-media-prod` have a standard TTL of **30 calendar days**.
- **Cloudflare Lifecycle Rules**: S3 object prefix rules automatically transition files tagged `status:standard` to deletion at 30 days, preventing infinite cloud storage cost accumulation.
- **Extended Retention Add-On**: If a customer purchases an extended retention pass (e.g. 1 year storage) or customer support manually extends a session, the backend updates `sessions.retentionExpiresAt` and applies an S3 object tag `retention:extended`, bypassing the 30-day automated purge.

---

## 5. Fleet Monitoring & Telemetry Requirements

Unattended operation requires continuous, deterministic telemetry transmitted from each edge kiosk to the central NestJS Cloud Engine.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        FLEET TELEMETRY INGESTION PIPELINE                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Kiosk Edge Agent (Every 30 Seconds)                                             │
│   ├── Host Telemetry    : CPU Temp, RAM, Disk Free GB, OS Build                 │
│   ├── Hardware Health   : DSLR Connected, Printer Spooler, Paper Remaining      │
│   ├── Queue Depth       : Upload Queue Pending, Print Queue Pending             │
│   └── Version Hash      : App Semantic Version, Git Commit SHA                  │
│                                                                                 │
│   ──► POST /api/booths/:id/heartbeat (HTTPS with x-device-secret)               │
│                                                                                 │
│ Cloud Ingestion Engine (NestJS)                                                 │
│   ├── Dynamic Liveness  : <60s = ONLINE | <5m = DEGRADED | >=5m = OFFLINE       │
│   ├── Health Evaluation : Check Sensor Thresholds vs Warning Rules              │
│   └── Alert Dispatch    : Push WebSocket to Dashboard & High-Priority Webhook   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Telemetry Metric Payload
Every 30 seconds, each booth transmits an authenticated JSON payload via `POST /api/booths/:id/heartbeat`:

1. **Host Hardware & OS**:
   - `cpuTemperature`: Celsius (alert if $> 75^\circ\text{C}$).
   - `ramUsagePercent`: Percentage memory consumption (alert if $> 85\%$).
   - `diskFreeGigabytes`: Available SSD space in GB (alert if $< 10\text{ GB}$).
   - `osUptimeSeconds`: Windows OS continuous runtime.
2. **Peripheral Hardware Health**:
   - `cameraStatus`: `CONNECTED_DSLR`, `WEBRTC_FALLBACK`, `DISCONNECTED`.
   - `printerStatus`: `READY`, `PRINTING`, `PAPER_EMPTY`, `PAPER_JAM`, `OFFLINE`.
   - `paperRemainingEstimate`: Integer sheet count (0 to 700).
3. **Pipeline & Queue Health**:
   - `pendingUploadCount`: Number of items awaiting cloud sync.
   - `failedUploadCount`: Number of items failing sync retries.
   - `pendingPrintCount`: Number of jobs in spooler queue.
4. **Software Identity**:
   - `appVersion`: Deployed semantic version (e.g. `"1.2.0"`).
   - `gitCommit`: Exact 7-character Git commit hash.
   - `lastSuccessfulSessionAt`: ISO timestamp of the most recent completed customer transaction.

### 5.2 Dynamic Fleet Liveness Derivation
In accordance with the architectural decision in `/docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`, kiosk liveness is **never stored as a static database flag mutated by WebSockets**. It is dynamically evaluated from the timestamp of the last valid HTTP heartbeat:
- **`ONLINE`**: Heartbeat received within the last **60 seconds**.
- **`DEGRADED`**: No heartbeat for **60 to 300 seconds** (network lag or temporary cellular jitter).
- **`OFFLINE`**: No heartbeat for **$\ge$ 300 seconds (5 minutes)**. Triggers fleet alert.
- **`MAINTENANCE`**: Manual operator override via Admin Dashboard.

---

## 6. Deployment Readiness Checklist (Pilot Booth #1)

Before Pilot Booth #1 is transported to the mall and opened to paying retail customers, the following checklist must be completed, signed off, and recorded.

### Category A: Electrical & Physical Hardware
- [ ] **A.1 Dedicated UPS Installation**: 1200VA / 720W online UPS installed inside booth enclosure; battery backup tested under full load (kiosk PC + DNP printer + lighting) with a minimum 15-minute runtime.
- [ ] **A.2 BIOS Auto-Power-On**: Motherboard BIOS configured to `"Power On After AC Loss"`. Validated by pulling main wall plug and verifying automatic boot when plugged back in.
- [ ] **A.3 Camera Power Coupling**: Canon DSLR powered via continuous AC-to-DC dummy battery coupler (no reliance on internal camera lithium batteries).
- [ ] **A.4 Camera Keep-Alive Verified**: Active keepalive signal (`ExtendShutDownTimer`) verified over 6 continuous hours; camera did not enter sleep mode.
- [ ] **A.5 Printer Mechanical Calibration**: DNP printer mechanical margin aligned; test print executed with sharp 300 DPI output and clean border cut.

### Category B: Operating System & Lockdown
- [ ] **B.1 Multi-Touch Gesture Lockdown**: Windows 11 edge swipes, 3-finger swipes, 4-finger swipes, and task view completely disabled via registry and Group Policy.
- [ ] **B.2 Notification Center Deactivation**: Action Center, lock screen notifications, and Windows update popups suppressed.
- [ ] **B.3 Shell Replacement Configured**: Kiosk executable configured as custom Windows shell or launched via startup registry with explorer taskbar permanently hidden.
- [ ] **B.4 Keyboard Interception**: Special shortcut keys (`Alt+Tab`, `Ctrl+Alt+Del`, `Win Key`, `F11`) intercepted and blocked.
- [ ] **B.5 Process Watchdog Service Active**: External watchdog service active; killing `Pictolabs.exe` via Task Manager automatically relaunches the fullscreen kiosk within 3 seconds.
- [ ] **B.6 Operator Admin PIN**: Default `1234` PIN replaced with secure 6-digit salted bcrypt hash; entry concealed behind 5-tap logo gesture.

### Category C: Data Integrity & Queues (Phase 2 Gates)
- [ ] **C.1 Session ID Fracture Verified**: Payment `sessionId` propagated across all screens to render engine; exactly 1 session record in PostgreSQL per transaction.
- [ ] **C.2 Pre-flight Sync Guard Active**: Upload queue halts confirm-upload if session is un-synced; zero orphan photos in R2.
- [ ] **C.3 Strict Confirmation Validated**: Upload queue marks `COMPLETED` only upon `{ confirmed: true }` response from backend; network failure triggers exponential backoff retry.
- [ ] **C.4 Low-Paper Interlock Tested**: Software halts QRIS generation when paper counter drops to $\le 2$.
- [ ] **C.5 Local Storage Cleanup Tested**: Daily 03:00 AM purge script validates Three-Key Safety Lock before unlinking disk files.

### Category D: Cloud Infrastructure & Payment
- [ ] **D.1 Production Midtrans Keys**: Merchant production server/client keys configured; test transaction of IDR 1,000 settles successfully to corporate account.
- [ ] **D.2 Cloudflare R2 Bucket Connected**: Production bucket `pictolabs-media-prod` operational with automated 30-day lifecycle rule.
- [ ] **D.3 Domain & SSL Active**: Backend and dashboard reachable over valid HTTPS/WSS with automated Let's Encrypt SSL certificate renewal.
- [ ] **D.4 Fleet Heartbeat Ingestion**: Kiosk appears as `ONLINE` in dashboard with accurate IP, app version, git commit hash, and sensor telemetry.

---

## 7. Architectural Decisions Summary

| Area | Decision | Rationale |
|:---|:---|:---|
| **Crash Recovery** | Time-bounded Resume ($\le 15\text{m}$) + Auto Rescue Voucher ($> 15\text{m}$) | Balances on-site customer convenience with security; prevents abandoned sessions from blocking the booth. |
| **Render Failures** | Idempotent Headless Re-Render from Immutable Raw Photos | Eliminates need for customer re-capture if power cuts during post-processing. |
| **Paper Management**| Proactive Low-Paper Interlock at $\le 2$ prints | Eliminates the single worst customer experience: paying for a photo that cannot physically print. |
| **Edge Storage** | Three-Key Safety Lock for SSD Cleanup | Guarantees local files are never deleted unless confirmed present in Cloudflare R2. |
| **Print Spooling** | Decoupled SQLite `print_queue` | Isolates UI thread from printer latency and mechanical jams; enables autonomous print retries. |
| **Fleet Liveness** | Dynamically Evaluated from 30s HTTP Heartbeat | Eliminates false `ONLINE` ghost states caused by dropped WebSocket sockets. |

---
*End of Phase 3.2 Production Hardening Blueprint. This document governs all hardening, stability, and failsafe engineering prior to Pilot Booth commercial activation.*
