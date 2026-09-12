# Phase 3.2 Implementation Roadmap
## Production Hardening & Fleet Resilience Execution Plan
**Target System:** Pictolabs Unattended Autonomous Photobooth (Edge Kiosk + NestJS Cloud Engine)  
**Document Ref:** `/docs/PHASE_3_2_IMPLEMENTATION_ROADMAP.md`  
**Parent Blueprint:** `/docs/PHASE_3_2_PRODUCTION_HARDENING.md`  
**Target Milestone:** Pilot Booth #1 Commercial Deployment Ready  
**Status:** APPROVED EXECUTION ROADMAP  

---

## Current State

### Project Condition Summary
- **Core Edge Loop**: Touchscreen flow, Canon DSLR 30 FPS LiveView capture, Sharp 300 DPI composite rendering, Midtrans Dynamic QRIS, and Cloudflare R2 direct uploads are functionally operational in development mode.
- **Phase 2 Status (Data Integrity & Reliability)**:
  - Fix #1 (Session ID Fracture), Fix #2 (Photo Loss Race Condition), Fix #3 (Ghost Session Prevention), and Fix #4 (Upload Queue Confirmation) have been implemented and validated via automated E2E tests (11/11 PASSED).
  - Awaiting final git commit closure before Phase 3.2 execution commences.
- **Prerequisites & Dependencies**:
  1. **Phase 2 Code Freeze**: Working tree diff for `PaymentScreen.tsx`, `SyncEngine.ts`, and `storage.controller.ts` must be committed and tagged (`v0.9.2-phase2-integrity`).
  2. **Phase 3.2 Architectural Blueprint Approval**: Finalized and signed off in `/docs/PHASE_3_2_PRODUCTION_HARDENING.md`.
  3. **No Unfinished Database Migrations**: PostgreSQL Prisma schema and Kiosk SQLite schema must be clean and verified.

---

## Work Breakdown Structure

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      PHASE 3.2 WORK BREAKDOWN STRUCTURE                         │
├───────────────────────┬─────────────────────────┬───────────────────────────────┤
│ RESILIENCE CORE       │ HARDWARE RELIABILITY    │ FLEET & DEPLOYMENT            │
├───────────────────────┼─────────────────────────┼───────────────────────────────┤
│ Epic 1: Crash Recovery│ Epic 5: Print Queue     │ Epic 8: Storage Cleanup Engine│
│ Epic 2: Session Ledger│ Epic 6: Printer Monitor │ Epic 9: Fleet Heartbeat       │
│ Epic 3: Render Recovery│Epic 7: Low Paper Lock  │ Epic 10: Deployment Readiness │
│ Epic 4: Upload Recovery│                        │                               │
└───────────────────────┴─────────────────────────┴───────────────────────────────┘
```

---

### Epic 1 — Crash Recovery System (Master Startup Protocol)

- **Objective**: Establish a deterministic 5-stage boot initialization sequence in the Electron main process that validates database integrity, executes hardware self-tests, audits interrupted sessions, re-hydrates background queues, and performs a cloud liveness handshake before rendering the customer UI.
- **Files Affected**:
  - `apps/kiosk/electron/main.ts`
  - `apps/kiosk/electron/services/CrashRecoveryService.ts` *(NEW)*
  - `apps/kiosk/electron/services/HardwareDiagnosticService.ts` *(NEW)*
- **Database Changes**:
  - SQLite: `CREATE TABLE system_boot_log (id INTEGER PRIMARY KEY AUTOINCREMENT, boot_at DATETIME, clean_shutdown INTEGER, recovery_actions_taken TEXT)`
  - PostgreSQL: None.
- **Backend Changes**:
  - Ingest `BOOT_SUCCESS` event via the heartbeat endpoint.
- **Kiosk Changes**:
  - Intercept Electron `app.whenReady()` with synchronous sequential checks.
  - Implement crash flag detection: On clean shutdown, write `clean_shutdown = 1`; on boot, if `clean_shutdown == 0`, trigger recovery mode.
- **Complexity**: High
- **Risk**: High (Boot stalls or unhandled exceptions block the kiosk from launching).
- **Estimated Effort**: 3 Days

#### Acceptance Criteria
1. When the kiosk PC powers on, the application boots through all 5 stages in under 4.5 seconds.
2. If the previous shutdown was abrupt, `system_boot_log` records `clean_shutdown = 0` and executes recovery handlers.
3. If hardware fails self-test, the kiosk navigates to `MaintenanceScreen` instead of freezing on a white screen.
4. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Power cord pulled during OS operation $\rightarrow$ Restart boots cleanly into recovery audit.
- Corrupted SQLite WAL journal $\rightarrow$ Automatic WAL recovery and integrity check pass.

---

### Epic 2 — Session Recovery Ledger (Mid-Capture Interruption)

- **Objective**: Track capture pose progress in real time within SQLite. On restart after a power loss during capture, provide a 15-minute resumption window for the customer, or automatically issue an authoritative cloud rescue voucher if the customer has abandoned the booth.
- **Files Affected**:
  - `apps/kiosk/electron/services/CrashRecoveryService.ts`
  - `apps/kiosk/src/screens/CaptureScreen.tsx`
  - `apps/kiosk/src/screens/RecoveryScreen.tsx` *(NEW)*
  - `apps/backend/src/payments/payments.service.ts`
  - `apps/backend/src/sessions/sessions.service.ts`
- **Database Changes**:
  - SQLite: `CREATE TABLE session_recovery_ledger (session_id TEXT PRIMARY KEY, current_pose INTEGER, total_poses INTEGER, frame_id TEXT, updated_at DATETIME)`
  - PostgreSQL: Add enum values to `SessionStatus`: `INTERRUPTED_ABANDONED`, `RESUMED`.
- **Backend Changes**:
  - Endpoint `POST /api/sessions/:id/rescue-voucher`: Issues a 100% discount voucher linked to the abandoned transaction.
- **Kiosk Changes**:
  - Update `session_recovery_ledger` after each camera shutter release.
  - On startup, if an interrupted session has an elapsed time $\le$ 15 minutes, route to `RecoveryScreen.tsx` with a 60-second countdown: *"Sesi Anda terputus. Tekan untuk melanjutkan pemotretan!"*
  - If elapsed time > 15 minutes, mark `INTERRUPTED_ABANDONED`, call rescue voucher API, and clear ledger.
- **Complexity**: High
- **Risk**: High (Risk of customer resuming someone else's abandoned session if timer logic is flawed).
- **Estimated Effort**: 3 Days

#### Acceptance Criteria
1. Power cut during Pose 2 $\rightarrow$ Restart within 5 minutes displays `RecoveryScreen`.
2. Pressing "Lanjutkan" resumes capture directly at Pose 3 with existing poses preserved.
3. Restart after 25 minutes $\rightarrow$ Sesi marked `INTERRUPTED_ABANDONED`, voucher created on cloud, kiosk resets to Welcome Screen.
4. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Customer walks away after power loss $\rightarrow$ System times out, creates rescue voucher, does not expose photos to the next visitor.

---

### Epic 3 — Render Recovery (Sharp Pipeline Resiliency)

- **Objective**: Guarantee that power loss during the Sharp composite rendering pipeline does not require customer re-capture by performing an automated, idempotent headless re-render from immutable raw photos upon system restart.
- **Files Affected**:
  - `apps/kiosk/electron/services/RenderEngine.ts`
  - `apps/kiosk/electron/services/CrashRecoveryService.ts`
- **Database Changes**:
  - SQLite: None (utilizes existing `sessions` table where `status = 'CAPTURED'` and `composite_path IS NULL`).
  - PostgreSQL: None.
- **Backend Changes**: None.
- **Kiosk Changes**:
  - During startup Stage 3, query for sessions where raw photo files exist in `/captures/raw/` but composite file is missing.
  - Trigger headless `compositeImages()` execution in the background.
  - On render completion, update SQLite status to `RENDERED`, enqueue physical print, and enqueue cloud upload.
- **Complexity**: Medium
- **Risk**: Low (Raw photos are already safely written to disk).
- **Estimated Effort**: 1.5 Days

#### Acceptance Criteria
1. Terminate process (`taskkill /F`) at 50% Sharp rendering progress.
2. Restart kiosk application.
3. Startup sequence identifies un-rendered session and re-executes Sharp rendering.
4. Composite image file generated at 300 DPI (1200x1800); print and upload queues receive tasks.
5. **PASS/FAIL**: PASS.

#### Failure Test Cases
- One raw pose file corrupted on disk $\rightarrow$ System logs error, emits alert, and falls back to rescue voucher flow.

---

### Epic 4 — Upload Recovery (Persistent Queue Re-hydration)

- **Objective**: Ensure that power interruptions during Cloudflare R2 uploads or confirm-upload network calls never leave upload tasks stranded in `PROCESSING` state, maintaining strict exponential backoff and zero photo loss.
- **Files Affected**:
  - `apps/kiosk/electron/services/SyncEngine.ts`
- **Database Changes**:
  - SQLite: Add column `attempts` and `last_error` to `upload_queue` if not already present.
  - PostgreSQL: None.
- **Backend Changes**: None (uses hardened Phase 2 `confirm-upload` endpoint).
- **Kiosk Changes**:
  - Startup Stage 4 executes: `UPDATE upload_queue SET status = 'PENDING' WHERE status = 'PROCESSING'`.
  - Enforce persistent retry backoff calculation: $\text{delay} = \min(2^{\text{attempts}} \times 5, 300)$ seconds.
  - If `attempts >= 10`, flag `PERMANENT_FAILURE` and emit a critical alert to the heartbeat payload.
- **Complexity**: Low
- **Risk**: Low
- **Estimated Effort**: 1 Day

#### Acceptance Criteria
1. Cut network interface during an active 15 MB video burst upload to Cloudflare R2.
2. Restart kiosk while offline.
3. Queue item resets to `PENDING` with retry backoff.
4. When network interface is restored, upload resumes, succeeds, and marks `COMPLETED` only after backend confirmation.
5. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Cloudflare R2 returns HTTP 503 $\rightarrow$ Queue increments `attempts`, enters backoff, does not mark `COMPLETED`.

---

### Epic 5 — Print Queue (Persistent Decoupled Spooler)

- **Objective**: Decouple physical printing from the UI interaction thread by establishing a transactional SQLite `print_queue` that survives application crashes and OS reboots, with automated retry mechanisms.
- **Files Affected**:
  - `apps/kiosk/electron/services/PrintQueueService.ts` *(NEW)*
  - `apps/kiosk/electron/services/PrinterService.ts`
  - `apps/kiosk/src/screens/PrintScreen.tsx`
- **Database Changes**:
  - SQLite: `CREATE TABLE print_queue (id TEXT PRIMARY KEY, session_id TEXT, file_path TEXT, copies INTEGER, status TEXT, attempts INTEGER DEFAULT 0, last_error TEXT, created_at DATETIME, updated_at DATETIME)`
  - PostgreSQL: Add column `printStatus` to `sessions` table.
- **Backend Changes**:
  - Add `printStatus` field to `POST /api/sessions` synchronization schema.
- **Kiosk Changes**:
  - Replace direct fire-and-forget PowerShell spooler calls with `enqueuePrintJob()`.
  - Implement a dedicated background spooler worker processing `print_queue` sequentially with 3-second spacing.
  - `PrintScreen.tsx` observes job status via IPC events (`PRINTING` $\rightarrow$ `PRINTED`).
- **Complexity**: Medium
- **Risk**: Medium (Physical printer spooler race conditions).
- **Estimated Effort**: 2.5 Days

#### Acceptance Criteria
1. Dispatching a print job writes a record to `print_queue` before Windows spooler is called.
2. Killing `Pictolabs.exe` while printing $\rightarrow$ Restart reconciles spooler state and resumes pending jobs.
3. Successful print updates SQLite status to `PRINTED`.
4. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Windows Spooler service (`spoolsv.exe`) crashed $\rightarrow$ Worker attempts service restart via elevated command and retries job.

---

### Epic 6 — Printer Monitoring (Win32 Sensor Hooks & Hardware State)

- **Objective**: Implement low-level Win32 Spooler and WMI device polling to detect printer offline state, USB disconnections, paper jams, ribbon depletion, and mechanical errors in real time.
- **Files Affected**:
  - `apps/kiosk/electron/services/PrinterMonitorService.ts` *(NEW)*
  - `apps/kiosk/electron/services/PrinterService.ts`
- **Database Changes**:
  - SQLite: `CREATE TABLE printer_hardware_state (id INTEGER PRIMARY KEY, status TEXT, is_connected INTEGER, paper_status TEXT, last_checked_at DATETIME)`
  - PostgreSQL: None.
- **Backend Changes**: None.
- **Kiosk Changes**:
  - Poll Windows Spooler API every 5 seconds inspecting `PRINTER_INFO_2` status flags (`PRINTER_STATUS_PAPER_JAM`, `PRINTER_STATUS_NOT_AVAILABLE`, `PRINTER_STATUS_USER_INTERVENTION`).
  - Listen for USB PnP device removal/arrival notifications.
  - Emit real-time hardware status events across IPC to the React frontend.
- **Complexity**: High
- **Risk**: Medium (C++ / PowerShell Win32 API binding compatibility across Windows builds).
- **Estimated Effort**: 3 Days

#### Acceptance Criteria
1. Unplugging DNP USB cable is detected within 3 seconds; status updates to `DISCONNECTED`.
2. Paper jam triggers `PRINTER_STATUS_PAPER_JAM`; active jobs freeze immediately.
3. Status changes propagate to the local database and heartbeat telemetry.
4. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Transient USB electrostatic flicker $\rightarrow$ Poller waits 3 seconds before escalating to prevent false alarms.

---

### Epic 7 — Low Paper Interlock (Proactive Out-of-Paper Prevention)

- **Objective**: Track physical paper roll consumption atomically in SQLite. Prevent customer payment initiation whenever remaining prints $\le 2$, automatically transitioning the booth into Maintenance mode and dispatching cloud alerts.
- **Files Affected**:
  - `apps/kiosk/electron/services/PaperTrackerService.ts` *(NEW)*
  - `apps/kiosk/src/screens/WelcomeScreen.tsx`
  - `apps/kiosk/src/screens/MaintenanceScreen.tsx`
  - `apps/backend/src/booths/booths.service.ts`
- **Database Changes**:
  - SQLite: `CREATE TABLE paper_tracker (id INTEGER PRIMARY KEY, roll_capacity INTEGER, prints_consumed INTEGER, prints_remaining INTEGER, last_replaced_at DATETIME)`
  - PostgreSQL: Add column `paperRemaining` and `printerStatus` to `booths` table.
- **Backend Changes**:
  - Ingest `paperRemaining` in heartbeat payload; trigger high-priority alert if $\le 10$ sheets.
- **Kiosk Changes**:
  - Atomically increment `prints_consumed` and decrement `prints_remaining` on each completed print job.
  - Welcome Screen interlock: If `prints_remaining <= 2`, disable "Start" button, render "Sedang Pengisian Ulang Kertas", and block QRIS generation.
  - Provide technician PIN interface in Admin screen to reset counter upon loading a new 700-sheet roll.
- **Complexity**: Medium
- **Risk**: Critical (Failing to block payment leads to direct customer financial disputes).
- **Estimated Effort**: 2 Days

#### Acceptance Criteria
1. Starting from 5 remaining prints, simulate 3 prints $\rightarrow$ Remaining prints decrements to 2.
2. At 2 remaining prints, Welcome Screen locks immediately; QRIS button cannot be tapped.
3. Cloud dashboard reflects `paperRemaining: 2` with warning badge.
4. Admin enters PIN, clicks "Reset Roll (700)" $\rightarrow$ Counter resets, Welcome Screen unlocks.
5. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Kiosk loses power mid-print $\rightarrow$ Decrement occurs in database transaction at job completion, preventing double-decrement.

---

### Epic 8 — Storage Cleanup Engine (Three-Key Safety Lock)

- **Objective**: Implement an automated local SSD cleanup cron service that safely deletes aged media files based on the strict Three-Key Safety Lock rule, preventing SSD depletion while ensuring zero un-synced photo loss.
- **Files Affected**:
  - `apps/kiosk/electron/services/StorageRetentionService.ts`
- **Database Changes**:
  - SQLite: Index `sessions(synced, created_at)` and `upload_queue(session_id, status)`.
  - PostgreSQL: None.
- **Backend Changes**: None.
- **Kiosk Changes**:
  - Schedule background cleanup daily at 03:00 AM local time.
  - Implement the **Three-Key Safety Lock Query**:
    ```sql
    SELECT s.id, s.composite_path FROM sessions s
    WHERE s.created_at < datetime('now', '-7 days')
      AND s.synced = 1
      AND NOT EXISTS (
        SELECT 1 FROM upload_queue u 
        WHERE u.session_id = s.id AND u.status != 'COMPLETED'
      );
    ```
  - Unlink verified local files and log freed megabytes.
  - Watermark safeguards: If free SSD $< 15$ GB, clean verified video bursts $> 24$h; if $< 5$ GB, clean verified photos $> 48$h and alert cloud.
- **Complexity**: Medium
- **Risk**: High (Accidental deletion of un-synced photos causes irreversible data loss).
- **Estimated Effort**: 2 Days

#### Acceptance Criteria
1. Files older than 7 days but with `synced = 0` are **NEVER deleted**.
2. Files older than 7 days with `synced = 1` and all upload queue items `COMPLETED` are safely deleted.
3. Free SSD space calculation logs accurately to telemetry.
4. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Network down for 8 consecutive days $\rightarrow$ Cleanup runs but skips all sessions; zero files deleted.

---

### Epic 9 — Fleet Heartbeat & Real-Time Telemetry

- **Objective**: Upgrade the 30-second kiosk heartbeat payload to include complete host performance metrics, peripheral statuses, queue depths, and deployed software hashes, enabling proactive fleet monitoring.
- **Files Affected**:
  - `apps/kiosk/electron/services/SyncEngine.ts`
  - `apps/backend/src/booths/booths.controller.ts`
  - `apps/backend/src/booths/booths.service.ts`
- **Database Changes**:
  - PostgreSQL: Add fields to `booths` model:
    `cpuTemp Float?`, `ramUsage Float?`, `diskFreeGb Float?`, `pendingUploads Int?`, `failedUploads Int?`
- **Backend Changes**:
  - Update `POST /api/booths/:id/heartbeat` validation schema.
  - Evaluate dynamic liveness: `< 60s` Online, `< 300s` Degraded, `$\ge$ 300s` Offline.
- **Kiosk Changes**:
  - Use `systeminformation` or native Node/OS utilities to sample CPU temperature, memory usage, and free disk bytes every 30 seconds.
  - Include peripheral states (DSLR status, printer status, paper counter) in payload.
- **Complexity**: Medium
- **Risk**: Low
- **Estimated Effort**: 2 Days

#### Acceptance Criteria
1. Heartbeat POST dispatches every 30 seconds containing valid JSON telemetry.
2. Dashboard reflects real-time CPU temp, RAM, and disk free GB.
3. Disconnecting kiosk network causes dashboard status to transition from `ONLINE` $\rightarrow$ `DEGRADED` (at 60s) $\rightarrow$ `OFFLINE` (at 300s).
4. **PASS/FAIL**: PASS.

#### Failure Test Cases
- High CPU load ($> 85^\circ\text{C}$) $\rightarrow$ Telemetry transmits warning; cloud logs alert.

---

### Epic 10 — Deployment Readiness (OS Lockdown & Watchdog Supervisor)

- **Objective**: Execute physical operating system lockdown on the kiosk PC (Windows 11), configure an external watchdog service for automated crash resurrection, implement PIN security, and conduct a 72-hour burn-in stress test.
- **Files Affected**:
  - `apps/kiosk/electron/main.ts`
  - `apps/kiosk/src/screens/WelcomeScreen.tsx`
  - Windows Registry & Group Policy configuration scripts
  - NSSM Watchdog service configuration
- **Database Changes**: None.
- **Backend Changes**: None.
- **Kiosk Changes**:
  - Deploy Registry script: Disable edge swipe, Action Center, multi-touch gestures, and lock screen notifications.
  - Conceal Operator Admin entry: 5-tap gesture on brand logo; 6-digit salted bcrypt PIN.
  - Configure **NSSM** watchdog service: Checks `Pictolabs.exe` every 2 seconds; restarts process within 3 seconds if terminated or unresponsive.
  - Execute 72-hour burn-in test simulating 500 automated continuous sessions.
- **Complexity**: High
- **Risk**: High (OS misconfiguration could lock technicians out of Windows).
- **Estimated Effort**: 4 Days

#### Acceptance Criteria
1. Edge swipes from left, right, top, bottom do not open any Windows UI.
2. `taskkill /F /IM Pictolabs.exe` causes the app to re-appear in fullscreen within 3 seconds.
3. Logo 5-tap gesture opens PIN modal; entering `1234` fails; entering secure 6-digit PIN grants access.
4. Kiosk survives 72-hour burn-in test with zero memory leaks, camera drops, or unhandled crashes.
5. **PASS/FAIL**: PASS.

#### Failure Test Cases
- Continuous touch bombardment on screen $\rightarrow$ OS does not minimize window or reveal taskbar.

---

## Dependency Graph

The implementation sequence is architectured to prevent regression and ensure each component builds on a verified foundation:

```
[PHASE 2 CLOSURE]
      │ (Tagged: v0.9.2-phase2-integrity)
      ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: QUEUE & HARDWARE DATA FOUNDATIONS                   │
├───────────────────────────────┬─────────────────────────────┤
│ Epic 5: Print Queue           │ Epic 6: Printer Monitoring  │
│ (Decoupled SQLite Spooler)    │ (Win32 Sensor Hooks & WMI)  │
└───────────────────────────────┴─────────────────────────────┘
      │                               │
      └───────────────┬───────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 2: HARDWARE INTERLOCKS & TELEMETRY                     │
├───────────────────────────────┬─────────────────────────────┤
│ Epic 7: Low Paper Interlock   │ Epic 9: Fleet Heartbeat     │
│ (Payment Prevention at <=2)   │ (Host & Peripheral Health)  │
└───────────────────────────────┴─────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 3: CRASH RECOVERY & STORAGE RESILIENCE                 │
├───────────────────────────────┬─────────────────────────────┤
│ Epic 2: Session Ledger        │ Epic 3: Render Recovery     │
│ Epic 4: Upload Recovery       │ Epic 8: Storage Cleanup     │
└───────────────────────────────┴─────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ TIER 4: MASTER INTEGRATION & OS SUPERVISION                 │
├─────────────────────────────────────────────────────────────┤
│ Epic 1: Crash Recovery System (Master 5-Stage Boot Manager) │
│ Epic 10: Deployment Readiness (Lockdown, Watchdog, Burn-in) │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
         [PILOT BOOTH #1 READY FOR DEPLOYMENT]
```

---

## Recommended Execution Order

To maximize engineering velocity and minimize architectural disruption, the epics must be executed in the following chronological batches:

1. **Sprint 3.2A — Print Pipeline & Sensor Reliability** (Days 1–5):
   - Execute **Epic 5** (Print Queue Persistence).
   - Execute **Epic 6** (Printer Win32 Monitoring).
   - Execute **Epic 7** (Low Paper Payment Interlock).
   *Milestone Gate*: Physical printing is fully transactional, queued in SQLite, and blocked when paper is low.

2. **Sprint 3.2B — Telemetry & Edge Storage Lifecycle** (Days 6–9):
   - Execute **Epic 9** (Fleet Heartbeat & Dynamic Liveness).
   - Execute **Epic 8** (Storage Cleanup Engine with Three-Key Lock).
   *Milestone Gate*: Kiosk transmits full hardware diagnostics to cloud; SSD disk auto-purges verified assets.

3. **Sprint 3.2C — Crash Recovery & State Reconciliation** (Days 10–15):
   - Execute **Epic 2** (Session Recovery Ledger & Rescue Vouchers).
   - Execute **Epic 3** (Sharp Render Recovery).
   - Execute **Epic 4** (Upload Queue Re-hydration).
   - Execute **Epic 1** (Master 5-Stage Boot Ingestion Protocol).
   *Milestone Gate*: Pulling power at any point in the customer journey leaves zero lost revenue and self-heals on boot.

4. **Sprint 3.2D — OS Lockdown & Burn-In Certification** (Days 16–20):
   - Execute **Epic 10** (Windows 11 Touch Lockdown, NSSM Watchdog, PIN Hardening).
   - Execute 72-Hour Continuous Burn-In Test.
   *Milestone Gate*: System certified as tamper-proof, crash-resilient, and production-ready.

---

## Estimated Timeline

```
Week 1: Hardware Reliability & Spooler Architecture
├── Day 1-2: Epic 5 (Print Queue Persistence in SQLite)
├── Day 3-4: Epic 6 (Printer Win32 Spooler Sensor Hooks)
└── Day 5:   Epic 7 (Low Paper Interlock Integration)

Week 2: Telemetry, Liveness & Storage Lifecycle
├── Day 6-7: Epic 9 (Fleet Heartbeat Payload & Liveness Migration)
├── Day 8-9: Epic 8 (Storage Cleanup Engine with Three-Key Lock)
└── Day 10:  Integration Testing of Hardware + Cloud Telemetry

Week 3: Comprehensive Crash Recovery Architecture
├── Day 11-12: Epic 2 (Session Recovery Ledger & Rescue Voucher Engine)
├── Day 13:    Epic 3 (Sharp Headless Render Recovery)
├── Day 14:    Epic 4 (Upload Queue Auto-Rehydration)
└── Day 15:    Epic 1 (Master 5-Stage Startup Protocol Integration)

Week 4: OS Lockdown, Watchdog & Burn-In Certification
├── Day 16-17: Epic 10 Part 1 (Windows Registry Lockdown & Gesture Suppression)
├── Day 18:    Epic 10 Part 2 (NSSM Watchdog & Auto-Relaunch Supervisor)
├── Day 19-21: 72-Hour Continuous Burn-In Load Test (500 Sessions)
└── Day 22:    Final Handover & Sign-Off for Pilot Booth #1
```

---

## Definition of Done (Pilot Booth #1 Activation Gate)

Pilot Booth #1 is officially declared **Ready for Commercial Deployment** when and only when all of the following conditions are met and documented with passing evidence:

1. **Zero Session Fracture**:
   - `PaymentsService` authoritative `sessionId` is the sole ID across the entire lifecycle; exactly 1 session record in PostgreSQL per customer transaction.
2. **Deterministic Power Loss Survival**:
   - Power cut during capture offers resume ($\le 15$m) or issues cloud rescue voucher ($> 15$m).
   - Power cut during render executes automatic headless re-render on reboot.
   - Power cut during upload resumes automatically via Pre-flight Guard.
   - Power cut during print re-spools or flags maintenance without losing record.
3. **Hardware Interlock Security**:
   - Welcome Screen strictly disables payment when paper roll has $\le 2$ prints remaining.
   - Disconnecting DSLR or printer transitions status in under 3 seconds without an unhandled exception.
4. **Guaranteed Zero Photo Loss**:
   - No photo upload is marked `COMPLETED` without explicit cloud confirmation (`confirmed: true`).
   - Local SSD purge deletes files **only if** older than retention threshold AND confirmed synced in cloud.
5. **Tamper-Proof OS Lockdown**:
   - Windows touch edge swipes, notification centers, and system hotkeys are 100% blocked.
   - Terminating kiosk process triggers automated watchdog resurrection in $< 3$ seconds.
   - Default PIN replaced with secure 6-digit bcrypt hash; access requires 5-tap logo gesture.
6. **Fleet Observability Verified**:
   - Kiosk transmits authenticated 30-second heartbeat with CPU temp, RAM, disk space, and queue metrics.
   - Cloud dashboard dynamically calculates `ONLINE` / `DEGRADED` / `OFFLINE` states accurately.
7. **72-Hour Burn-In Certified**:
   - Kiosk executes 500 automated sessions over 72 continuous hours without memory leakage, camera disconnection, or unhandled errors.

---
*End of Phase 3.2 Implementation Roadmap. This document governs the sequential engineering execution of production hardening for Pilot Booth #1.*
