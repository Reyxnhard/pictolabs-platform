# Pictolabs Photobooth — Phase 3.2E Burn-In & Stress Test Matrix
**Document ID:** `DOC-P3.2E-BI-01`  
**Date:** September 13, 2026  
**Status:** READY FOR VERIFICATION  
**Target Environments:** Staging Kiosk Hardware / CI Simulation Environment

---

## 1. Overview & Test Objectives

The Phase 3.2E Burn-In Test Suite is designed to empirically validate the endurance, stability, and autonomous self-healing capabilities of the Pictolabs Photobooth platform. Commercial photobooths must operate unattended in high-traffic shopping malls and event venues without requiring operator reboots or experiencing performance degradation.

### 1.1. Key Pass/Fail Guardrails
Across all test scenarios, the system must strictly adhere to the following non-negotiable boundaries:
1. **Zero Photo Loss:** No captured, rendered, or paid customer asset may be dropped, orphaned, or permanently corrupted.
2. **Zero Financial Loss:** No customer payment may be settled without either completing the session, offering recovery, or providing an HMAC-SHA256 Rescue Voucher.
3. **Memory Ceiling Stability:** V8 heap usage must not grow monotonically across 100 sessions; RSS must stabilize $< 900\text{ MB}$.
4. **Zero Zombie Child Processes:** No orphaned `ffmpeg.exe`, `node.exe`, `powershell.exe`, or `rundll32.exe` processes may linger after task completion.
5. **Deterministic WAL Compaction:** SQLite WAL file (`kiosk.db-wal`) must not grow unbounded ($< 32\text{ MB}$ under sustained load).

---

## 2. Core Stress & Endurance Test Matrix (Scenarios A through J)

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                             BURN-IN TEST MATRIX ROADMAP                                  │
├──────────────────────────┬───────────────────────────┬───────────────────────────────────┤
│  LOAD ENDURANCE          │  QUEUE STRESS             │  FAULT INJECTION & RECOVERY       │
│  A. 10 Consecutive Sess. │  D. Upload Queue Burst    │  F. Crash Mid-Upload              │
│  B. 50 Consecutive Sess. │  E. Print Queue Burst     │  G. Crash Mid-Print               │
│  C. 100 Consecutive Sess.│                           │  H. Recovery Spam (Circuit Break) │
│                          │                           │  I. Disk Almost Full (<2GB)       │
│                          │                           │  J. Network Offline 30 Minutes    │
└──────────────────────────┴───────────────────────────┴───────────────────────────────────┘
```

---

### Scenario A: 10 Consecutive Sessions (Smoke & Baseline)

- **Setup:**
  - Fresh kiosk boot with empty SQLite queues.
  - Mock payment and camera drivers enabled.
  - Initial baseline metrics recorded: Heap, RSS, file descriptors.
- **Execution:**
  - Automatically execute 10 back-to-back full customer journeys:
    1. Select 6-photo strip layout
    2. Simulate QRIS payment settlement
    3. Capture 6 photos with live view preview
    4. Apply Retro filter
    5. Sharp composite render (1200x1800 at 300 DPI)
    6. Enqueue physical print (2 copies)
    7. Generate QR digital download code
    8. Return to WelcomeScreen
- **Expected Result:**
  - All 10 sessions write recovery checkpoints and transition cleanly to `'COMPLETED'`.
  - 10 composite photos saved to disk and enqueued for upload and print.
  - All 20 prints accounted for in `paper_tracker` (prints remaining: $700 \to 680$).
- **Pass Criteria:**
  - 100% session completion rate (0 failures).
  - V8 heap delta after 10 sessions $< 35\text{ MB}$ above baseline.
  - Zero hanging file handles.

---

### Scenario B: 50 Consecutive Sessions (Medium Endurance & Buffer Recycling)

- **Setup:**
  - Initial paper count: 700 prints.
  - Storage retention configured with standard 7-day TTL and 5 GB safeguard.
- **Execution:**
  - Run 50 continuous session cycles without rebooting Electron.
  - Simulate varying customer behaviors:
    - 35 standard sessions (capture, render, print, QR).
    - 10 sessions with 1 retake each.
    - 5 sessions selecting 4-pose postcard format instead of strip.
- **Expected Result:**
  - Total 50 composites rendered.
  - Total print queue jobs completed: 50 jobs (100 physical print units deducted).
  - SQLite WAL checkpoints automatically every 1,000 pages.
- **Pass Criteria:**
  - No memory runaway (Heap $< 350\text{ MB}$, RSS $< 750\text{ MB}$).
  - Paper counter shows exactly 600 prints remaining.
  - All 50 session records synced to Cloud backend.

---

### Scenario C: 100 Consecutive Sessions (24-Hour Peak Retail Simulation)

- **Setup:**
  - System configured for automated soak test with mock hardware.
  - Memory profiler logging `process.memoryUsage()` every 5 sessions.
- **Execution:**
  - Run 100 continuous customer sessions at 45-second intervals.
  - Simulates an entire high-volume Saturday event.
  - Total media generated: 600 raw photos (~1.2 GB), 100 composites (~300 MB), 100 live-photo MP4s (~500 MB).
- **Expected Result:**
  - Total 2.0 GB of media generated and organized in `pictolabs-data/`.
  - Upload queue worker processes all 300 assets (composites, raw, videos).
  - Storage Retention engine monitors free disk space continuously.
- **Pass Criteria:**
  - Heap usage after 100 sessions does not exceed $450\text{ MB}$.
  - GC successfully reclaims transient buffers between sessions.
  - Zero database locks (`SQLITE_BUSY` errors = 0).
  - System event log has 0 unhandled exceptions.

---

### Scenario D: Upload Queue Burst Stress (50 Concurrent Assets Under Packet Loss)

- **Setup:**
  - Network emulator configured with 35% packet loss and 250ms latency.
  - Backend API presigned URL endpoint throttled with 1,500ms response delay.
- **Execution:**
  - Enqueue 50 media assets (20 composites, 20 MP4 videos, 10 raw JPEGs) into SQLite `upload_queue` simultaneously.
  - Start upload queue worker.
  - Midway through execution (at item #25), disconnect network for 60 seconds, then reconnect.
- **Expected Result:**
  - When network drops, in-flight uploads trigger fetch abort timeouts (30s) and transition to `'FAILED'`.
  - Exponential backoff scheduler delays retries appropriately (`2s, 4s, 8s, 16s, 32s`).
  - Upon network restoration, worker resumes queue draining.
- **Pass Criteria:**
  - All 50 assets eventually achieve `'COMPLETED'` status with valid `remote_url`.
  - `isUploading` mutex never stays locked in a stuck state.
  - Zero corrupted files stored on Cloudflare R2.

---

### Scenario E: Print Queue Stress (Burst Printing & Paper-Out Mid-Queue)

- **Setup:**
  - Initial paper count set to 15 prints.
  - Print Queue configured with 3-second print worker interval.
- **Execution:**
  - Burst enqueue 10 print jobs (2 copies each = 20 total prints requested).
  - Jobs #1 through #7 process normally (consuming 14 prints, leaving 1 print).
  - Job #8 encounters `PAPER_OUT` condition (printer hardware status reports code 4).
  - Pause for 10 seconds (simulating operator paper roll reload to 700).
  - Reset paper roll via `PaperTrackerService.resetRoll(700)`.
- **Expected Result:**
  - Job #8 fails pre-flight hardware gate and transitions to `'PENDING'` with backoff delay.
  - Hardware monitor sets status to `PAPER_OUT` and emits IPC warning.
  - When paper is reloaded, worker detects `READY` status on next tick and completes Job #8, #9, and #10.
- **Pass Criteria:**
  - Exactly 20 print copies completed across all 10 jobs.
  - Final paper count: exactly 695 prints ($700 - 5$).
  - No double prints or duplicated queue entries.

---

### Scenario F: Crash During Upload (Power Loss / Process Kill Mid-Transfer)

- **Setup:**
  - Start an active upload of a large 15 MB composite TIFF/JPEG file.
- **Execution:**
  - Monitor upload status. At the exact moment `upload_queue.status == 'UPLOADING'` and data is streaming to R2, execute a hard force kill on the process:
    `Stop-Process -Name Pictolabs -Force` (or `process.exit(137)`).
  - Restart the kiosk application.
- **Expected Result:**
  - Tier 1 Supervisor resurrects the kiosk within 3.5 seconds.
  - Startup reconciliation scans `upload_queue` for orphaned `'UPLOADING'` rows.
  - The interrupted job is reset to `'PENDING'`.
  - Upload queue worker restarts and successfully completes the file upload.
- **Pass Criteria:**
  - The file arrives intact on Cloudflare R2 with valid checksum.
  - Database row status updates to `'COMPLETED'`.
  - No orphaned temporary buffers on local disk.

---

### Scenario G: Crash During Physical Print (Crash While Spooling)

- **Setup:**
  - Enqueue print job.
- **Execution:**
  - Immediately after job transitions to `'PRINTING'` (Windows spooler called via PowerShell), kill the kiosk process.
  - Verify that child `powershell.exe` or `rundll32.exe` is either terminated or detached.
  - Relaunch kiosk.
- **Expected Result:**
  - `reconcileStartupPrintJobs()` detects the interrupted job in `'PRINTING'` state.
  - To prevent physical double-printing of expensive photo paper, the job is evaluated:
    - If printer hardware reports job completed in spooler, mark `'COMPLETED'`.
    - If print failed or spooler is empty, mark `'PENDING'` with backoff.
- **Pass Criteria:**
  - System boots without crashing.
  - No duplicate print copies generated.
  - Sessions table reflects accurate `print_status`.

---

### Scenario H: Recovery Spam & Circuit Breaker Trip

- **Setup:**
  - Customer session paid and checkpointed at `CAPTURING` (Pose 2 complete).
- **Execution:**
  - Restart 1: Kiosk boots, displays *"Sesi Anda Dipulihkan!"*. User clicks "Lanjutkan". Immediately kill process.
  - Restart 2: Kiosk boots, increments `recovery_attempts = 2`. Displays recovery modal. Kill process again.
  - Restart 3: Kiosk boots. `recovery_attempts` reaches 3 ($\ge 2$ threshold).
- **Expected Result:**
  - Circuit Breaker trips: auto-resume is prevented to stop infinite boot loops.
  - Session status updates to `'ABANDONED'`.
  - Kiosk displays Rescue Voucher Modal with offline HMAC-SHA256 QR code.
- **Pass Criteria:**
  - Kiosk breaks the crash reboot loop.
  - Valid Rescue Voucher is generated and saved to database.
  - Kiosk navigates cleanly to `WelcomeScreen` for the next customer.

---

### Scenario I: Disk Almost Full ($< 2.0\text{ GB}$ Emergency Lockout)

- **Setup:**
  - Fill data volume with dummy test files until free space is $1.8\text{ GB}$.
- **Execution:**
  - Trigger Disk Space Watchdog cycle (runs every 60 seconds).
- **Expected Result:**
  - Disk Watchdog detects free space $< 2.0\text{ GB}$ (Critical Watermark).
  - Priority Waterfall Emergency purge executes:
    1. Purges uploaded raw photos $>48$h old.
    2. Purges uploaded videos $>48$h old.
  - If disk space is still $< 2.0\text{ GB}$ (because dummy files cannot be purged):
    - Kiosk transitions to `MAINTENANCE_LOCKOUT`.
    - UI locks to full-screen Maintenance overlay.
    - QRIS payment generation is disabled.
    - Telemetry alert sent to Cloud Dashboard.
- **Pass Criteria:**
  - Kiosk prevents new customer transactions before disk hits 0 bytes.
  - Exits maintenance mode only after free space rises $\ge 5.0\text{ GB}$.

---

### Scenario J: Network Offline for 30 Minutes (Store-and-Forward Endurance)

- **Setup:**
  - Disconnect all network interfaces (Ethernet & Wi-Fi) on the kiosk.
- **Execution:**
  - Maintain offline state for 30 continuous minutes.
  - Conduct 5 complete customer sessions locally:
    - Mock payment authorization (or cash/bypass mode).
    - Photos captured, filtered, rendered, and printed physically.
    - Composites stored in local SQLite `sessions` and `upload_queue`.
  - After 30 minutes, restore internet connectivity.
- **Expected Result:**
  - All 5 customer sessions complete locally without errors.
  - During offline period, HTTP heartbeats log network warnings without crashing.
  - When connection is restored:
    - WebSocket reconnects automatically.
    - Upload queue worker drains all 5 sessions to Cloudflare R2.
    - Sync engine syncs session metadata to Cloud PostgreSQL.
- **Pass Criteria:**
  - Zero lost customer photos or prints during offline operation.
  - 100% of pending sessions and media synced within 90 seconds of network return.
  - Dashboard updates booth status from `OFFLINE` back to `ONLINE`.

---

## 3. 72-Hour Continuous Burn-In Profile

For formal production deployment sign-off, the kiosk must complete a 72-Hour Soak Test under simulated event conditions:

| Period | Activity Pattern | Sessions/Hour | Primary Verification Target |
|---|---|---|---|
| **Hour 00 – 12** | Peak retail load | 30 sessions/hr | Sharp memory recycling, LiveView buffer flushing |
| **Hour 12 – 24** | Moderate load | 15 sessions/hr | Print worker reliability, WAL checkpointing |
| **Hour 24 – 36** | Idle overnight | 0 sessions/hr | Camera keep-alive sleep prevention, memory stability |
| **Hour 36 – 48** | Burst traffic + transient network drops | 40 sessions/hr | Upload queue retry backoff, socket auto-reconnect |
| **Hour 48 – 60** | Low disk space injection | 20 sessions/hr | Watermark cleanup triggering, orphan janitor |
| **Hour 60 – 72** | Recovery stress & rapid restarts | 25 sessions/hr | Circuit breaker, ledger reconciliation, voucher signing |

### Soak Test Acceptance Gate:
- **Total Sessions:** $\ge 1,000$ completed sessions.
- **System Uptime:** $100.0\%$ (no unhandled process death).
- **Final Memory RSS:** $\le 850\text{ MB}$ (no linear drift).
- **Total Orphan Files:** $0$ orphan captures.
- **Database Consistency:** `PRAGMA integrity_check` returns `ok`.
