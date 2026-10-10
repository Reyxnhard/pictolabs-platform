# PICTOLABS — PILOT READINESS MASTER TIMELINE v3

**Purpose:** master continuity timeline untuk menjaga roadmap historis, status aktual, execution order, dan release gates Pictolabs tetap konsisten ketika proyek berpindah chat.

**Version:** Master Timeline v3.2  
**Updated:** 8 October 2026  

**Current stage:** PILOT HARDENING / PILOT READINESS  
**Current active phase:** Phase B — PR-02 Printer Profiles & Calibration (Planning & Calibration Audit)  
**Current gate:** PILOT READINESS FEATURE GAP CLOSURE  
**Pilot target:** 1 booth (Booth #1) → operational proof → scale 5–10 booths  
**Pilot Booth #1 Status:** NOT READY (Pending Pilot Readiness Gates PR-02 through PR-08, and Payment Gateway Settlement Gate)  

---

## 1. Project Rules

### Source of truth
- Canonical Master Timeline: `docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`
- Current Project State: `docs/00_CONTEXT/CURRENT_PROJECT_STATE.md`
- Master Blueprint: `docs/00_CONTEXT/PICTOLABS_MASTER_BLUEPRINT.md`
- Canonical Workstream Hubs: `docs/01_WORKSTREAMS/*.md`
- Canonical Evidence & RCAs: `docs/02_EVIDENCE/`
- Operational Runbooks: `docs/03_RUNBOOKS/`
- Founder Physical UAT Logs: `docs/02_EVIDENCE/UAT/`

### Architecture constraints
- Do not redesign architecture.
- Do not rebuild the application.
- Do not redesign UI unless required.
- Do not touch `CameraService` during unrelated phases.
- Preserve working architecture.
- Focus on production readiness for Booth #1.

### Phase closure protocol

```text
AG implementation
→ AG completion report
→ ChatGPT audit / RCA validation
→ automated tests
→ production build
→ local/runtime verification
→ Founder Physical UAT
→ PASS
→ commit
→ push GitHub
→ deploy VPS
→ VPS smoke test
→ CLOSED
```

VPS is a deployment/verification environment, not development.

---

# 2. Product / Architecture Baseline

Stack:
- Electron Kiosk
- React Dashboard
- NestJS Backend
- PostgreSQL
- Redis
- Cloudflare R2
- Docker / Docker Compose
- Nginx
- VPS
- Canon EDSDK / DSLR
- Webcam fallback
- DNP DS-RX1
- SQLite local kiosk storage
- Midtrans QRIS

Target customer journey:

```text
Welcome
→ Product
→ Payment
→ Frame / Design
→ Capture
→ Filter
→ Preview
→ Print
→ QR / Download
```

---

# 3. Original Priority Roadmap P0 / P1 / P2 / P3

Roadmap ini dipertahankan sebagai baseline historis. Status di bawah adalah status eksekusi saat ini; item lama tidak dianggap selesai hanya karena fitur yang berdekatan sudah ada.

## P0 — Critical Foundations

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P0 | Admin Panel remains accessible offline | **CLOSED** | Offline Admin PIN fixed with local secure hash verification; admin panel validated in offline flow. |
| P0 | Session corruption after camera failure | **AUTOMATED_VERIFIED / OPEN INVESTIGATION** | P0 data isolation fix verified across 23/23 automated tests (commit `c2ec517`). Live USB disconnect and sensor synchronization remain under Camera Reliability workstream. |

## P1 — Pilot-Critical Features

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P1 | Printer offline during session handling | **CLOSED** | RCA-7 simplification implemented, 49/49 automated tests passed, Founder Physical UAT passed on Booth #1 hardware (10/10 PASS) with zero duplicate prints, Physical Regression PASS during startup UAT, committed (`353f79bd8b1f71213ca8302726976d199ba8270e`), pushed to `origin/main`, deployed to VPS (`43.156.39.26`), and verified by production smoke test. |
| P1 | Upload queue monitoring & outage reliability | **CLOSED** | Two-tier store-and-forward SQLite WAL upload engine with automatic re-arm, background GIF enqueueing, idempotent backend Photo ledger deduplication, Founder Physical UAT passed (S1–S6 PASS), committed (`353f79bd8b1f71213ca8302726976d199ba8270e`), pushed, deployed to VPS, and verified by production smoke test. |
| P1 | Session history + reprint center | **CLOSED** | Kiosk Phase 1–2: History, detail, reprint 1x/2x with debounce, double-tap protection, offline history, offline HOT reprint, automatic upload, and Force Upload verified PASS by Founder. Web Dashboard Phase 3 remains `NOT_STARTED`. |
| P1 | Real Midtrans Sandbox | **AUTOMATED_VERIFIED (Sandbox) / NOT_STARTED (Production Merchant)** | Functional payment flow & sandbox webhook verified; production merchant approval and live banking E2E settlement remain open. |

## P2 — Camera / UX Capability

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P2 | Startup Freeze Elimination | **CLOSED** | Direct `loadFile` bundle loading, asynchronous native `EnumPrinters` (<15ms), and 3s deferred printer hardware monitoring eliminate "Not Responding" freeze (<2s cold launch). Founder Physical UAT passed (8/8 PASS), committed (`353f79bd8b1f71213ca8302726976d199ba8270e`), pushed, deployed to VPS, and smoke tested. |
| P2 | Camera Device Selector | **NOT_STARTED** | Multi-camera selection per booth planned for operator UI (PR-03). |
| P2 | Webcam Live Preview | **AUTOMATED_VERIFIED (Fallback Core) / DEFERRED (Consistency Fix)** | WebRTC fallback functions, but preview/countdown source ↔ capture source consistency requires RCA-01 fix. |
| P2 | Camera Settings | **NOT_STARTED** | ISO, shutter, aperture, WB, exposure compensation capability model planned. |
| P2 | DSLR / Mirrorless / Webcam Support | **NOT_STARTED (Device Abstraction Model)** | Architecture & capability model planned; no code changes until RCA-01. |
| P2 | Preview ↔ Capture Consistency | **BLOCKED / OPEN RELIABILITY BUG** | Active issue: countdown uses webcam, capture triggers DSLR. Active reliability investigation (`CAMERA-01`). |

## P3 — Operational / Extended Center

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P3 | Session History Center | **CLOSED (Phase 1–2 Kiosk Core) / NOT_STARTED (Dashboard Phase 3)** | Core kiosk history/reprint/force-upload is CLOSED; web dashboard archive and remote edge reprint are NOT_STARTED. |
| P3 | Restart Recovery | **NOT_STARTED / PLANNED** | Kiosk restart recovery remains a dedicated hardening gate after printer formal closure and camera reliability. |

### Roadmap interpretation rule

```text
Original roadmap = historical priority baseline
Current execution roadmap = what is actively being hardened now
Pilot release gate = what must actually PASS before Booth #1 is declared ready
```

---

# 4. Historical Milestones

## A. Reverse Engineering / Architecture Freeze — CLOSED

- Existing prototype reverse engineered.
- Architecture considered viable.
- No rebuild planned.
- Project moved from prototype completion to pilot hardening.
- Earlier estimate: ~75–80% complete.
- Camera module ~95%.
- Render engine stable.
- Capture flow stable.

## B. Backend / Device Foundation — CLOSED

Validated:
- activation
- device secret
- heartbeat
- device status
- backend connectivity

## C. Admin PIN — CLOSED

- Admin PIN fixed.
- Offline Admin PIN later fixed using local secure hash verification.
- Admin panel operational.

## D. Core Customer Flow — CLOSED / REGRESSION-VALIDATED

Fixes included:
- Filter
- Render / QR
- Payment QR recreation/loading
- Payment timeout → start
- Customer flow regression

## E. Offline Payment Bypass — CLOSED

Founder-verified:
- Internet OFF + bypass ON → PASS
- Internet OFF + bypass OFF → PASS
- Payment error → bypass → PASS
- Internet ON + bypass OFF → PASS

---

# 5. Session History Center — CLOSED

PRD: `SESSION_HISTORY_CENTER_PRD.md`

Core local tables:
- `sessions`
- `upload_queue`
- `print_queue`
- `paper_tracker`
- `session_recovery_ledger`
- `kiosk_system_events`

Cloud entities:
- sessions
- photos
- prints
- transactions
- payments
- session_events
- redelivery_logs

Features:
- latest session history
- session detail
- reprint
- force upload
- offline history
- paper counters
- upload queue/recovery
- auditability
- dashboard correlation

### Initial failures

- session detail crash / force-close
- Force Upload failure
- automatic upload failure
- customer-flow regression

### RCA

1. DSLR Base64 photos were being serialized into session metadata, producing 15–25MB payloads and timeout risk. Backend did not need that Base64.
2. Upload worker mutex reset could race with active workers, causing concurrency and attempt-count problems.
3. Memory watchdog interpreted Admin modal as `welcome`, exposing restart behavior under memory pressure.

### Fixes

- Strip Base64 from metadata.
- Store raw photos locally and enqueue uploads.
- Fix worker mutex/reset logic.
- Use effective Admin screen in watchdog.
- Show truthful retry attempts.

### Founder UAT after fixes

- automatic upload → PASS
- Force Upload → PASS
- watchdog stability → PASS
- full customer flow → PASS
- physical reprint 1x → PASS
- physical reprint 2x → PASS
- double-tap protection → PASS
- offline history → PASS
- offline HOT reprint → PASS

**Session History Phase 1–2 = CLOSED.**  
*(Note: Web Dashboard Session History Phase 3 and Remote Edge Reprint Dispatch remain `NOT_STARTED` and are decoupled from the Kiosk Phase 1–2 closure).*

---

# 6. Pilot Hardening — Current Era

After Session History closure, the highest-risk P1 was printer failure handling because the booth could report physical printing success when the printer was unavailable.

---

# 7. P1 Printer Failure Handling — V1

## Original false-success

```text
enqueue
→ Windows spooler accepts job
→ app assumes success
→ QRScreen 100%
→ confetti
→ History TERCETAK
→ paper counter decremented
```

while no physical print existed.

## V1 RCA findings

- QRScreen declared success too early.
- `rundll32`/spooler dispatch was treated as physical completion.
- WMI-only health was insufficient.
- Get-PrintJob monitoring had been removed previously.
- Paper accounting was unconditional.

## V1 implementation

- DNP PnP detection: `USB\VID_1343&PID_0005*`
- spooler monitoring
- bounded 25s polling
- error parsing
- stuck-job cleanup
- retry/backoff: 5s / 10s / 20s / 40s / 80s
- DEAD_LETTER only after max attempts
- paper decrement only after success
- QRScreen no optimistic 100%
- Session History maps DEAD_LETTER → FAILED
- bypass preserved

Automated tests:
- printer hardening 9/9 PASS
- Print Queue Core 9/9 PASS
- Paper & Hardware 5/5 PASS
- renderer build PASS
- Electron TypeScript build PASS

Automated PASS did not equal physical production readiness.

---

# 8. Founder Physical Printer UAT V1

| Test | Result |
|---|---|
| PRN-01 Printer OFF | PASS |
| PRN-02 Recovery + Reprint | PASS |
| PRN-03 USB Disconnect | UNKNOWN / INVESTIGATE |
| PRN-04 Paper Out | FAIL |
| PRN-05 Cover Open | FAIL |
| PRN-06 Healthy Print | PASS |
| PRN-07 Bypass | PASS |

### PRN-01 observation

When printer was turned back on, the previous session printed automatically.

Current assessment: not automatically a bug; it is compatible with retry/backoff and a still-valid pending job. Business/UX policy can be revisited later.

### PRN-03 observation

USB was unplugged when printer started making printing sounds. Booth reported failure, but photo physically came out.

Do not assume bug yet. Need final queue/history/paper/retry/telemetry evidence.

---

# 9. PRN-04 / PRN-05 RCA V2 — COMPLETE

Production code was untouched during RCA.

## PRN-04 Paper Out

Observed:
- printer powered on
- paper absent/exhausted
- red error LED
- USB remains connected
- PnP reports healthy
- `Get-PrintJob` reports only `Printing`
- WMI `DetectedErrorState` and `PrinterState` remain non-error
- spooler drains/deletes the job
- application returns success
- QRScreen shows success
- History shows `TERCETAK`
- paper tracker decrements

## PRN-05 Cover Open

Observed:
- cover open
- USB remains connected
- Windows reports normal queue
- `Get-PrintJob` reports `Printing`
- WMI does not expose door state
- spooler drains/deletes job
- application returns success
- QRScreen shows success
- History shows `TERCETAK`

## Confirmed root cause

```text
USB connected
≠ mechanical printer healthy

spooler job drained
≠ physical photo completed
```

The DNP driver/standard Windows spooler path does not expose the mechanical states needed by the current logic.

The first incorrect decision is effectively:

```text
job was observed
+ job disappeared
+ post-health is ready
= success
```

This is invalid for the DNP DS-RX1.

---

# 10. Printer Execution Simplification / RCA-7 — CLOSED

RCA-7 simplification is fully **IMPLEMENTED**, **AUTOMATED_VERIFIED** (49/49 PASS across test suites), **FOUNDER_UAT_PASS** on physical Booth #1 hardware, committed (`353f79bd8b1f71213ca8302726976d199ba8270e`), pushed to `origin/main`, deployed to VPS (`43.156.39.26`), and verified by production smoke test. Current status is **CLOSED**.

### Confirmed V2 root cause discovered during UAT

Windows USB re-enumeration can create a new printer queue such as:

```text
DS-RX1
DS-RX1 (Copy 1)
DS-RX1 (Copy 2)
```

while the old queue may remain `WorkOffline` / `PendingDeletion`. Pictolabs previously remained bound to the stale queue by exact printer name.

V2 therefore adds **dynamic active printer resolution** rather than assuming the Windows queue name is permanent.

### V2 implementation

- Native DNP telemetry through `PhotolabDNP.exe` / `CspStat.dll`.
- Hardware states: `READY`, `PAPER_OUT`, `COVER_OPEN`, `RIBBON_OUT`, `JAMMED`, `BUSY`, `ERROR`, `OFFLINE`, `UNKNOWN`.
- Dynamic active Windows printer resolution when the configured queue is offline/pending deletion.
- Tolerates Windows `Copy N` queue names.
- Synchronizes the resolved active printer name back into the existing PrintService / PrinterMonitorService flow.
- USB reconnect recovery without requiring Windows Test Print or application restart.
- Removed redundant PrintService background polling.
- PrinterMonitorService is the single authoritative background monitor.
- PENDING print jobs in retry/backoff can be manually reprinted by an operator without creating a queue race.
- Paper counter remains protected by verified-success logic.
- Existing retry/backoff remains.
- Bypass remains.

### Automated verification

- PRN hardening suite: 49/49 PASS across 4 suites (`rca7-simplification.spec.ts`, `rca6-regression.spec.ts`, `print-queue.spec.ts`, `burn-in.spec.ts`).
- Electron TypeScript build: PASS.
- Renderer build: PASS.

### Founder Physical UAT Status — PASS

RCA-7 Founder Physical UAT is **FOUNDER_UAT_PASS**. Confirmed on physical hardware:
- **Normal Customer Print:** PASS.
- **Background GIF/MP4 Decoupling:** PASS (no longer blocks print path).
- **Printer OFF Before Dispatch:** PASS (queue remains pending and dispatches when printer returns).
- **Reconnect Pending Queue:** PASS.
- **Disconnect After Dispatch:** PASS.
- **Paper Out Behavior:** PASS.
- **Cover Open Behavior:** PASS.
- **Admin Reprint (1x / 2x with 4,000ms debounce):** PASS.
- **Watchdog / Delayed Previous-Session Scenario:** PASS (no phantom duplicates).
- **Duplicate Physical Print Protection:** PASS (duplicate reprint bug completely eradicated).
- **Physical Regression Verification:** PASS (during Startup UAT on Booth #1).

Important semantic decision:
- `COMPLETED` in the simplified execution boundary means **Print Dispatch / Windows Spooler Accepted**, not guaranteed physical mechanical completion.
- A pending queue that prints once after the printer returns is expected behavior.
- A physical print followed by application retry that creates a second physical print remains a critical bug.

### Current Release State: CLOSED

Formal closure completed on 8 October 2026:
- Production installer packaging: PASS (`Pictolabs Setup 1.0.0.exe`)
- Clean release commit: PASS (`353f79bd8b1f71213ca8302726976d199ba8270e`)
- Push to origin/main: PASS
- Production VPS deploy: PASS (`43.156.39.26`, Docker fleet healthy)
- VPS smoke test: PASS (`/api/health`, `/api/storage/health`, R2 storage)
- Formal sign-off: **CLOSED**

---

# 10A. Future Printer Selection & Multi-Printer Support

This is now an explicit **future product requirement**, because the pilot fleet may not always use the same printer model.

### Product requirement

Admin Panel will eventually provide a **Printer Selection / Printer Configuration** feature so each booth can be configured for its actual supported printer.

The future design must NOT depend on:

```text
printerName = "DS-RX1"
```

or any other fixed Windows queue name.

Instead, printer configuration should resolve through a layered identity:

```text
Booth Printer Configuration
        ↓
Supported Printer Profile / Model
        ↓
Windows active queue
        ↓
USB / PnP identity
        ↓
Native hardware telemetry / serial when supported
```

### Important distinction

The current V2 `Copy N` tolerance is a **recovery mechanism for the same physical printer**, not the final multi-printer architecture.

It should allow:

```text
DS-RX1
DS-RX1 (Copy 1)
DS-RX1 (Copy 2)
```

to represent the same configured physical printer after Windows re-enumeration.

It should NOT automatically treat every printer matching a loose name pattern as interchangeable once a booth supports multiple printer models.

### Future supported model architecture

When multi-printer support is implemented, printer adapters/profiles should define at minimum:
- printer model / driver profile
- detection identity
- Windows queue resolution rules
- native telemetry adapter, when available
- supported health states
- print dispatch method
- media / paper accounting behavior
- recovery behavior

This feature belongs to the **future fleet/configuration roadmap**, not the current Printer Failure Handling V2 closure gate.

# 11. P1 Printer Closure Gate — CLOSED

RCA-7 formal release closure protocol completed and verified:

```text
RCA / design audit        PASS
Implementation            PASS
Automated regression      PASS (49/49)
Production build          PASS (TypeScript, Vite, NSIS Setup 1.0.0.exe)
Founder Physical UAT      PASS (10/10 scenarios on Booth #1)
Physical Regression       PASS (Verified during Startup UAT on Booth #1)
Production packaging      PASS
Clean commit              PASS (353f79bd8b1f71213ca8302726976d199ba8270e)
Push GitHub               PASS (origin/main)
Deploy VPS                PASS (43.156.39.26)
VPS smoke test            PASS (API health, R2 storage, Admin dashboard)
        ↓
CLOSED
```

The future Admin Printer Selection / Multi-Printer feature (PR-02) belongs to the newly opened Pilot Readiness scope and is decoupled from this closed reliability fix.

# 12. Camera Management & Reliability — ACTIVE HARDENING WORKSTREAM (NEXT)

The original timeline described the camera core as ~95% / stable. That remains valid for the existing core capture path, but new evidence and founder requirements create a dedicated reliability and capability workstream.

**Status:** `OPEN RELIABILITY INVESTIGATION` (Next technical hardening priority after Printer release closure).

## Existing reliability evidence

Observed:

```text
Countdown / live preview
→ webcam displayed

Countdown ends
→ DSLR captures

Live mode
→ webcam

Camera restart + USB reconnect
→ behavior normalizes
```

This is an **OPEN reliability defect** (preview/countdown source and capture source resolve to different sensors), not merely a future UI enhancement.

## Founder requirements

The booth should eventually support:

- camera/device selection
- DSLR selection
- mirrorless selection
- webcam selection
- in-app camera settings
- ISO
- shutter speed
- aperture
- white balance
- exposure compensation
- focus / autofocus where supported
- live preview
- capability-aware settings
- reliable reconnect/restart
- preview and capture using the same active camera unless an explicit fallback policy exists

## Proposed workstream order

### CAMERA-01 — Reliability RCA
No code change initially.

Map:
- initialization
- active camera state
- preview source
- countdown source
- capture source
- DSLR readiness
- webcam fallback
- reconnect
- restart
- device selection state

Deliverable:
`CAMERA_RELIABILITY_RCA.md`

### CAMERA-02 — Camera Abstraction / Device Model
Define a common model for:

```text
DSLR
Mirrorless
Webcam
```

with capability-based settings.

### CAMERA-03 — Camera Selector
Admin/operator can select the active camera/device for the booth.

### CAMERA-04 — Capability Detection
Only expose settings supported by the active device.

### CAMERA-05 — In-App Camera Settings
Tier 1:
- ISO
- shutter
- aperture
- WB
- exposure compensation

Tier 2:
- focus / AF
- additional vendor-specific settings where justified

### CAMERA-06 — Preview ↔ Capture Consistency
Enforce that the preview/countdown source and capture source resolve to the same active camera unless fallback is explicitly defined.

### CAMERA-07 — Reconnect / Recovery
Validate:
- USB disconnect
- USB reconnect
- camera restart
- application restart
- fallback/recovery

### CAMERA-08 — Physical UAT Matrix
Validate DSLR, mirrorless and webcam paths according to actual hardware available for the pilot.

## Important architecture rule

Do not rebuild the existing camera subsystem merely to introduce these capabilities.

Treat the existing CameraService as stable infrastructure. Add management/selection/capability layers around it where possible, and only modify the core when RCA proves it is necessary.

Photolab may be used as a behavioral/reference benchmark, but its architecture is not a mandatory blueprint.

# 13. Deferred Printer Latency Observation

Founder observed approximately 5 seconds before physical printing starts.

Status: observation, not yet classified as a bug.

Need to distinguish:
- session completion → 5s → physical print starts
versus
- physical print starts → 5s → software success

Correctness takes priority over latency optimization.

---

# 14. Current / Upcoming Pilot Hardening Timeline

## Phase 1 — Formal Printer RCA-7 Release Closure — CLOSED
**RELEASED & VERIFIED (`CLOSED`)**

```text
Founder UAT PASS (10/10 on Booth #1)
→ production packaging (PASS)
→ clean commit (353f79bd8b1f71213ca8302726976d199ba8270e)
→ push GitHub (PASS)
→ deploy VPS (PASS)
→ VPS smoke (PASS)
→ CLOSED
```

Physical regression verified during Startup UAT on Booth #1 hardware.

## Phase 2 — Camera Reliability RCA & Hardening
**NEXT MAJOR TECHNICAL WORKSTREAM (`OPEN`)**

RCA-only first (`CAMERA-01`):
- reproduce preview/capture mismatch
- map camera lifecycle
- identify source-of-truth state
- inspect fallback behavior
- inspect reconnect/restart
- compare with Photolab only where useful

Deliverable:
`CAMERA_RELIABILITY_RCA.md`

No implementation until RCA is audited. Architecture rule: Do NOT modify `CameraService` code during unrelated documentation tasks.

## Phase 3 — Camera Management & Device Capability (`NOT_STARTED`)
After RCA approval:
- device selector
- DSLR / mirrorless / webcam abstraction
- capability detection
- in-app camera settings
- preview/capture consistency (`CAMERA-06`)
- reconnect/recovery

Each feature must pass automated/build/runtime/Founder UAT gates.

## Phase 4 — Upload / Internet Outage Reliability — CLOSED
**RELEASED & VERIFIED (`CLOSED`)**

Two-tier store-and-forward SQLite WAL upload engine, automatic network restoration re-arm, background GIF enqueueing, and idempotent backend Photo ledger deduplication are fully verified:
- Automated test suite: 47/47 PASS
- Founder Physical UAT: 6/6 scenarios PASS (S1 offline capture, S2 re-connect auto-drain, S3 force upload, S4 session correlation, S5 photo integrity, S6 GIF delivery)
- Release commit: `353f79bd8b1f71213ca8302726976d199ba8270e`
- Push to origin/main: PASS
- VPS deploy: PASS (`43.156.39.26`)
- Production smoke test: PASS (`/api/storage/health`, R2 storage)
- Status: **CLOSED**

## Phase 4A — Startup Freeze Elimination — CLOSED
**RELEASED & VERIFIED (`CLOSED`)**

Direct `loadFile` bundle loading, asynchronous native `EnumPrinters` (<15ms), and 3s deferred printer hardware monitoring eliminate "Not Responding" freeze (<2s cold launch):
- Primary root cause (unconditional localhost:3030 navigation stall ~5.27s): RESOLVED
- Secondary root cause (synchronous PowerShell Get-Printer blocking main thread ~547-566ms): RESOLVED
- Tertiary contention (PowerShell/WMI concurrent hardware query contention): RESOLVED
- Founder Physical UAT: 8/8 checks PASS (Cold launch <2s, zero freeze, DS-RX1 detection, Hardware Gate, customer print, admin reprint, post-startup monitor)
- Release commit: `353f79bd8b1f71213ca8302726976d199ba8270e`
- Push to origin/main: PASS
- VPS deploy: PASS (`43.156.39.26`)
- Status: **CLOSED**

## Phase 5 — Real Midtrans Verification (`OPEN`)
Separate functional implementation from production readiness:

```text
sandbox / provider E2E (AUTOMATED_VERIFIED)
→ webhook / settlement (AUTOMATED_VERIFIED)
→ offline bypass fallback (CLOSED / VERIFIED)
→ production merchant readiness (NOT_STARTED)
→ production E2E (NOT_STARTED)
```

Do not call production payment readiness CLOSED until the actual production merchant onboarding and live banking app transactions pass.

## Phase 6 — Kiosk Restart & Session Recovery (`NOT_STARTED`)
Planned pilot-hardening gate after camera reliability:
- restart during active session
- restart during upload
- restart around print dispatch
- queue recovery
- no duplicate print
- no duplicate upload
- no orphan session
- recovery ledger consistency

## Phase 7 — Dashboard Session History Phase 3 / Operational Layer (`NOT_STARTED`)
Start only after core kiosk reliability gates are stable:
- dashboard session list
- search/filter
- session detail
- support actions
- asset visibility
- operational diagnostics
- fleet correlation
- remote edge reprint dispatch

Do not assume every Photolab dashboard feature belongs in Pilot.

## Phase 8 — Full Customer Journey Regression

Normal:

```text
Welcome
→ Product
→ Payment
→ Frame
→ Capture
→ Filter
→ Preview
→ Print
→ QR
→ Download
→ History
```

Degraded:
- internet outage
- printer outage
- camera fallback

Recovery:
- internet return
- printer return
- camera reconnect

## Phase 9 — Founder Pilot UAT

Operate Booth #1 as a real operator with repeated sessions and failure/recovery scenarios.

Goal:

> Real booth can operate repeatedly without losing sessions, photos, print state, or recovery state.

## Phase 10 — Production Build / Release Gate

```text
source verification
→ TypeScript
→ renderer build
→ Electron production build
→ backend tests
→ regression
→ Docker production build
→ local/runtime verification
```

## Phase 11 — Git Release

```text
local fix
→ local test
→ local production verification
→ Founder verification
→ commit
→ push GitHub
```

## Phase 12 — VPS Deployment + Smoke

```text
GitHub
→ VPS update
→ Docker production build
→ docker compose up -d
→ container health
→ logs
→ smoke test
```

## Phase 13 — Physical Pilot Booth #1 Gate — NOT READY

The reliability release batch has successfully concluded:

```text
P0 blockers:                     CLOSED
Session History Phase 1–2:       CLOSED
Printer RCA-7:                   CLOSED (Founder UAT PASS 10/10)
Upload Outage Reliability:       CLOSED (Founder UAT PASS S1–S6)
Startup Freeze Elimination:      CLOSED (Founder UAT PASS 8/8)
Production Build:                PASS (NSIS Setup 1.0.0.exe, Docker prod)
Git Release:                     PASS (Commit 353f79bd8b1f71213ca8302726976d199ba8270e)
VPS Deploy:                      PASS (43.156.39.26)
VPS Smoke Test:                  PASS (/api/health, /api/storage/health, R2)
        ↓
Reliability Release Batch:       CLOSED
```

**Critical Operational Reality:**  
Deployment of the reliability batch does **NOT** mean Pictolabs is field/event ready. Booth #1 remains **NOT READY** until all newly authorized Pilot Readiness feature gates (PR-01 through PR-08) are designed, implemented, tested, and validated by Founder Physical UAT.

---

# 15. PILOT READINESS — NEW REQUIREMENTS

**Current stage:** PILOT HARDENING / PILOT READINESS  
**Current gate:** PILOT READINESS FEATURE GAP CLOSURE  
**Pilot Booth #1 Status:** NOT READY  

Founder directives have established mandatory feature requirements for Booth #1 field and event operations. The preceding reliability batch is closed, but field deployment is held pending completion of these gates.

## Pilot Readiness Gates

### PR-01 — Booth Configuration Foundation
- **Objective:** Establish a robust device/booth-specific configuration foundation supporting diverse hardware per booth (camera, printer, peripherals, timers) without monolithic global assumptions that all booths are identical.
- **Current status:** CLOSED (Conditional on Live QRIS Exception)
- **Existing foundation:** Database `booths` model, `ActivationToken`, `Device` schema, local `identity.json` in kiosk (`IdentityService.ts`), WebSocket gateway, and canonical `BoothConfig.generalSettings` envelope.
- **Delivered scope:** Canonical `BoothConfigEnvelope` schema (`pricing`, `timing`, `hardware`, `frames`, `system`), version monotonicity, atomic local cache hydration (`kiosk-config.json`), dual auth guard (`BoothConfigAuthGuard`), Admin Dashboard pricing controls, and financial integrity validation.
- **Dependencies:** Core backend database and device identity handshake.
- **Acceptance criteria:** Each booth loads its unique hardware profile; modifying configuration on Booth A does not mutate Booth B; kiosk bootstraps successfully with device-specific parameters.
- **Founder UAT required:** YES
- **Implementation status:** CLOSED
- **Test status:** 22/22 AUTOMATED TESTS PASSED (`scripts/test_pr01_booth_config_foundation.mjs`)
- **UAT status:** FOUNDER UAT PASSED (Non-Payment Configuration & Hydration)
- **Release status:** CLOSED_WITH_EXCEPTION (Formally closed on 2026-10-10 with documented exception: Live Midtrans Dynamic QRIS Sandbox Settlement is decoupled and tracked as an external blocker under Payment Workstream / Pilot-Wide Release Gate due to Midtrans 402 Channel Activation restriction)

### PR-02 — Printer Profiles & Calibration
- **Objective:** Support printer/media profiles (2R photostrips and 4R postcards), bleed calibration, X/Y offset, scale/crop, and a test print calibration workflow to eliminate white edge defects and misaligned cuts after paper/media roll changes.
- **Current status:** OPEN (PLANNING PHASE / AUDIT ONLY — ZERO PREMATURE CODING)
- **Existing foundation:** DNP DS-RX1 GDI execution via native `print.exe`, `PhotolabDNP.exe` telemetry, `PrintService.ts`, GDI rendering pipeline, and PR-01 `hardware.printerProfileId` schema.
- **Missing scope:** Codebase investigation of render/print pipeline coordinate parameters; media profile data model (2R photostrip vs 4R postcard); configurable X/Y offset and bleed parameters; test print calibration pattern generator in Admin Panel; persistent storage of calibration values per booth.
- **Dependencies:** PR-01 (Booth Configuration Foundation — CLOSED), Printer RCA-7 engine (`PrintService.ts` — CLOSED).
- **Acceptance criteria:** Operator can select 2R or 4R profile; calibration test print prints reference alignment grid; X/Y offset and bleed adjustments eliminate white edges on physical prints; calibration persists across reboots.
- **Founder UAT required:** YES
- **Implementation status:** NOT_STARTED (Planning & Audit opened; implementation on hold)
- **Test status:** NOT_STARTED
- **UAT status:** NOT_STARTED
- **Release status:** NOT_STARTED

### PR-03 — Camera Selection & Configuration
- **Objective:** Provide camera device selection (DSLR vs webcam) and camera configuration through Admin Panel per booth, ensuring preview camera and capture camera are strictly synchronized to eradicate the historical mismatch bug.
- **Current status:** NEW / CAMERA WORKSTREAM TO OPEN
- **Existing foundation:** Canon EDSDK v13.x native integration, WebRTC webcam fallback, `CameraService.ts`, and `CaptureScreen.tsx`.
- **Missing scope:** Codebase investigation of current CameraService capabilities and IPC; camera device selector in Admin Panel; capability detection and configuration for supported settings (ISO, shutter speed, aperture, white balance, exposure compensation); preview ↔ capture sensor consistency enforcement so live preview, countdown framing, and capture trigger use the exact same sensor.
- **Dependencies:** PR-01 (Booth Configuration Foundation), CAMERA-01 Reliability RCA.
- **Acceptance criteria:** Operator selects active camera; countdown preview and final capture use the identical camera sensor; supported exposure settings persist per booth; zero camera source desynchronization.
- **Founder UAT required:** YES
- **Implementation status:** NOT_STARTED
- **Test status:** NOT_STARTED
- **UAT status:** NOT_STARTED
- **Release status:** NOT_STARTED

### PR-04 — Frame / Design Asset Management
- **Objective:** Enable uploading, metadata configuration, activation/deactivation, and targeted per-booth assignment of photo frames via Dashboard, replacing hardcoded frame lists.
- **Current status:** NEW / NOT STARTED
- **Existing foundation:** `FrameDesignScreen.tsx` with preset design themes, local SVG/PNG rendering, R2 media storage pipeline.
- **Missing scope:** Backend Frame model and CRUD API (`/api/frames`); Dashboard frame asset upload and assignment drawer; metadata schema for renderer; kiosk frame synchronization and local caching; dynamic rendering of assigned frames on kiosk.
- **Dependencies:** PR-01 (Booth Configuration Foundation), Cloudflare R2 storage gateway.
- **Acceptance criteria:** Admin uploads frame asset with metadata in Dashboard; frame is assigned specifically to Booth #1; Booth #1 automatically downloads and presents the frame; other booths without assignment do not display it.
- **Founder UAT required:** YES
- **Implementation status:** NOT_STARTED
- **Test status:** NOT_STARTED
- **UAT status:** NOT_STARTED
- **Release status:** NOT_STARTED

### PR-05 — Pricing & Print Quantity
- **Objective:** Extend existing pricing functionality to support configurable per-booth tariff and multi-tier print quantity selection (e.g. 1 print = Rp X, 2 prints = Rp Y, 3 prints = Rp Z) impacting dynamic payment generation.
- **Current status:** PARTIALLY EXISTING / NEEDS EXTENSION
- **Existing foundation:** Dashboard `BoothDetailDrawer.tsx` single-session tariff configuration with live WebSocket sync to kiosk; `ProductSelectScreen.tsx` pricing badge.
- **Missing scope:** Data model extension from scalar price to multi-tier quantity pricing model (`printQuantityPricing`); customer print quantity selector screen/component in kiosk flow before payment; dynamic QRIS nominal calculation matching selected quantity; print queue dispatching matching copy count.
- **Dependencies:** PR-01 (Booth Configuration Foundation), existing `PaymentService` & `BoothDetailDrawer`.
- **Acceptance criteria:** Dashboard manages quantity-based pricing per booth; customer selects desired print count (1, 2, or N); generated QRIS exactly matches tier price; printer produces requested quantity without duplicate charges.
- **Founder UAT required:** YES
- **Implementation status:** PARTIALLY_IMPLEMENTED (Scalar price exists; quantity tiers NOT_STARTED)
- **Test status:** NOT_STARTED
- **UAT status:** NOT_STARTED
- **Release status:** NOT_STARTED

### PR-06 — Session Timing Configuration
- **Objective:** Provide configurable per-booth session timers for frame selection, session start countdown, and QR display page, editable via Dashboard without hardcoded timeouts.
- **Current status:** NEW / NOT STARTED
- **Existing foundation:** Hardcoded timer constants in kiosk screens (`PAYMENT_TIMEOUT`, capture countdown, QR screen auto-advance).
- **Missing scope:** Timer configuration schema in booth model (frame selection timeout, session start countdown, QR page timeout); Dashboard input controls; kiosk dynamic timer hydration from booth configuration.
- **Dependencies:** PR-01 (Booth Configuration Foundation).
- **Acceptance criteria:** Dashboard sets custom timer durations per booth; kiosk honors configured timings across frame selection, countdown, and QR page; kiosk recovers cleanly to welcome screen upon expiration.
- **Founder UAT required:** YES
- **Implementation status:** NOT_STARTED
- **Test status:** NOT_STARTED
- **UAT status:** NOT_STARTED
- **Release status:** NOT_STARTED

### PR-07 — Upload Progress Visibility
- **Objective:** Provide clear customer-facing upload progress on kiosk ("Foto sedang di-upload") to prevent false perception of QR/download failure, and Dashboard-side aggregate upload telemetry per booth.
- **Current status:** NEW / OBSERVABILITY LAYER (Upload Reliability Engine is CLOSED)
- **Existing foundation:** Two-tier SQLite WAL store-and-forward engine (`SyncEngine.ts`), `upload_queue` table, WebSocket gateway telemetry events.
- **Missing scope:** Customer UI indicator/progress state on QRScreen while upload queue is draining; Dashboard real-time upload progress drawer showing percentage, status breakdown (completed / uploading / pending / failed), and session completion state.
- **Dependencies:** SQLite WAL upload queue engine (`SyncEngine.ts`), WebSocket telemetry.
- **Acceptance criteria:** Customer QRScreen visibly communicates upload in progress; customer does not assume download failed; Dashboard displays real-time per-booth upload progress and queue drain status.
- **Founder UAT required:** YES
- **Implementation status:** NOT_STARTED
- **Test status:** NOT_STARTED
- **UAT status:** NOT_STARTED
- **Release status:** NOT_STARTED

### PR-08 — Fullscreen Kiosk
- **Objective:** Ensure kiosk application renders as a genuine responsive fullscreen experience matching actual kiosk display viewport and aspect ratio, removing square/boxed viewport letterboxing while preserving photo capture aspect ratios.
- **Current status:** NEW / NOT STARTED
- **Existing foundation:** Electron `main.ts` `BrowserWindow` creation, Tailwind layout classes.
- **Missing scope:** Viewport and resolution audit on physical booth display; removal of fixed-width square wrappers (`w-[640px]`, etc.) across kiosk screens; fluid vertical/portrait layout refactoring that decouples screen aspect ratio from photo output aspect ratio.
- **Dependencies:** Physical booth display resolution specification.
- **Acceptance criteria:** Kiosk UI spans 100% of display viewport without artificial square boxes; typography and touch targets scale naturally; photo and frame aspect ratios remain undistorted.
- **Founder UAT required:** YES
- **Implementation status:** NOT_STARTED
- **Test status:** NOT_STARTED
- **UAT status:** NOT_STARTED
- **Release status:** NOT_STARTED

---

# 16. LEAST / POST-CORE REQUIREMENTS

### EXT-01 — Photolab Retro Filter Research
- **Scope:** Research and investigative benchmarking:
  - Is retro/vintage filter simply a color matrix or multi-stage image processing?
  - Grain/noise simulation pipeline?
  - Tone curve transformations?
  - White balance and color grading presets?
  - Vignette, bloom/glow, optical and texture effects?
  - Preset renderer parameter architecture?
- **Governance:** Founder specifically wants to understand why Photolab separates this as a distinct feature/filter category. Use available Photolab workspace/screen-recording/source material if present. Do not claim implementation details without evidence.
- **Status:** `RESEARCH ONLY / NOT IMPLEMENTATION` (Strictly no premature coding).

### EXT-02 — Event / Operator Mode
- **Scope:** Future operator-controlled photobooth mode for attended events (start session, retake control, manual confirm).
- **Conceptual Model:** Unified application with configurable Booth Mode (`SELF_SERVICE` vs `OPERATOR`), avoiding fork or separate application.
- **Status:** `POST-CORE / NOT STARTED` (Deferred).

### EXT-03 — Subdomain Migration
- **Scope:** Domain routing re-architecture and subdomain renaming.
- **Status:** `INFRASTRUCTURE / LOW PRIORITY / NOT BLOCKING PILOT CORE` (Deferred).

---

# 17. RECOMMENDED EXECUTION SEQUENCE

The Pilot Readiness feature gap closure must proceed in strict phased order to respect architectural dependencies:

```text
Phase A: PR-01 Booth Configuration Foundation
  ↓
Phase B: PR-02 Printer Profiles & Calibration
         PR-03 Camera Selection & Configuration
  ↓
Phase C: PR-04 Frame / Design Asset Management
         PR-05 Pricing & Print Quantity
         PR-06 Session Timing Configuration
  ↓
Phase D: PR-07 Upload Visibility
         PR-08 Fullscreen Kiosk
  ↓
Phase E: Full Pilot Readiness Regression
  ↓
Founder Physical Pilot UAT (Booth #1)
  ↓
Production Build → Git Release → VPS Deploy → VPS Smoke Test
  ↓
PILOT BOOTH #1 READY
```

Only after all required Pilot Readiness gates (PR-01 through PR-08) pass Founder Physical UAT will Booth #1 be declared ready for event field operations.

---

# 18. Post-Pilot Scaling

Only after Booth #1 has operational proof:

```text
1 booth
→ stable operations
→ provisioning verification
→ 5 booths
→ 10 booths
```

Preferred device-first activation flow:

```text
Install kiosk
→ activation screen
→ Admin generates activation token
→ kiosk enters token
→ device paired
→ dashboard configuration
```

---

# 19. Non-Blocking / Deferred Backlog

- PRN-03 final classification
- ~5s print-start latency investigation (observation, not a blocker)
- camera source synchronization bug (active investigation under Camera Reliability)
- Midtrans production merchant onboarding & live banking app verification
- Dashboard Session History Phase 3
- remote edge reprint / broader fleet operations
- scale from 1 → 5–10 booths

---

# 20. Current Snapshot

```text
┌───────────────────────────────────────────────────────────────────────────────────┐
│                      PICTOLABS MASTER EXECUTION SNAPSHOT                          │
├────────────────────────────────────────┬──────────────────────────────────────────┤
│ Subsystem / Component                  │ Current Canonical Status                 │
├────────────────────────────────────────┼──────────────────────────────────────────┤
│ RELIABILITY RELEASE (BATCH CLOSED)     │                                          │
│ - Architecture / Foundation            │ CLOSED                                   │
│ - P0 Admin Panel & Security (Offline)  │ CLOSED                                   │
│ - Session History Phase 1–2 (Kiosk)    │ CLOSED                                   │
│ - Printer Reliability (RCA-7)          │ CLOSED                                   │
│ - Upload Outage Reliability            │ CLOSED                                   │
│ - Startup Freeze Elimination           │ CLOSED                                   │
│ - Production Installer Packaging       │ CLOSED (NSIS Setup 1.0.0.exe)            │
│ - Git Release Commit                   │ CLOSED (353f79bd8b1f71213ca8302726976d1) │
│ - VPS Production Deployment            │ CLOSED (43.156.39.26)                    │
│ - VPS Production Smoke Test            │ CLOSED (PASS)                            │
├────────────────────────────────────────┼──────────────────────────────────────────┤
│ PILOT READINESS (NEW GATES)            │                                          │
│ - PR-01 Booth Configuration Foundation │ CLOSED (Conditional Exception)           │
│ - PR-02 Printer Profiles & Calibration │ OPEN (PLANNING PHASE)                    │
│ - PR-03 Camera Selection & Config      │ NOT_STARTED / CAMERA WORKSTREAM          │
│ - PR-04 Frame / Design Asset Mgmt      │ NOT_STARTED                              │
│ - PR-05 Pricing & Print Quantity       │ PARTIALLY EXISTING / EXTENSION REQUIRED  │
│ - PR-06 Session Timing Configuration   │ NOT_STARTED                              │
│ - PR-07 Upload Progress Visibility     │ NOT_STARTED (OBSERVABILITY LAYER)        │
│ - PR-08 Fullscreen Kiosk               │ NOT_STARTED                              │
├────────────────────────────────────────┼──────────────────────────────────────────┤
│ LEAST / POST-CORE                      │                                          │
│ - EXT-01 Retro Filter Research         │ RESEARCH ONLY / NOT IMPLEMENTATION       │
│ - EXT-02 Event / Operator Mode         │ DEFERRED / POST-CORE                     │
│ - EXT-03 Subdomain Migration           │ DEFERRED / INFRASTRUCTURE                │
├────────────────────────────────────────┼──────────────────────────────────────────┤
│ OVERALL BOOTH #1 FIELD READINESS       │                                          │
│ - Pilot Booth #1 Launch Status         │ NOT READY                                │
└────────────────────────────────────────┴──────────────────────────────────────────┘
```

## Pilot Critical vs Post-Pilot

### Pilot Critical
- PR-01 Booth Configuration Foundation
- PR-02 Printer Profiles & Calibration
- PR-03 Camera Selection & Configuration
- PR-04 Frame / Design Asset Management
- PR-05 Pricing & Print Quantity
- PR-06 Session Timing Configuration
- PR-07 Upload Progress Visibility
- PR-08 Fullscreen Kiosk
- restart/session recovery
- full customer regression
- Founder Physical Pilot UAT (Booth #1)
- production build
- GitHub release
- VPS deploy
- VPS smoke

### Post-Pilot / Scale
- advanced dashboard analytics
- full fleet operations
- remote configuration expansion
- multi-printer administration
- multi-booth scale 5–10
- multi-branch
- OTA
- major UI redesign
- advanced media/design tooling
- Zustand migration

---

# 21. Continuity Rule for New Chats

When moving the project to a new chat, follow the canonical documentation hierarchy established by the project architecture:

### Recommended Reading Order
1. **Master Timeline:** [`docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md)
2. **Current Project State:** [`docs/00_CONTEXT/CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md)
3. **Master Blueprint (Architecture / Scope):** [`docs/00_CONTEXT/PICTOLABS_MASTER_BLUEPRINT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_MASTER_BLUEPRINT.md)
4. **Relevant Workstream Context in `docs/01_WORKSTREAMS/`:**
   - [`PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md)
   - [`CAMERA_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/CAMERA_WORKSTREAM.md)
   - [`SESSION_HISTORY_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/SESSION_HISTORY_WORKSTREAM.md)
   - [`STORAGE_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/STORAGE_WORKSTREAM.md)
   - [`KIOSK_HARDENING_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/KIOSK_HARDENING_WORKSTREAM.md)
   - [`PAYMENT_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PAYMENT_WORKSTREAM.md)
   - [`DEPLOYMENT_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/DEPLOYMENT_WORKSTREAM.md)
   - [`DASHBOARD_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/DASHBOARD_WORKSTREAM.md)
   - [`FLEET_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md)
   - [`SECURITY_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/SECURITY_WORKSTREAM.md)
5. **Relevant Decision Records (when applicable):** e.g. [`docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md)
6. **Latest Canonical Evidence in `docs/02_EVIDENCE/`:** (RCA, FIX_REPORTS, UAT, AUDITS, SPECS_REPORTS)
7. **Operational Runbooks in `docs/03_RUNBOOKS/`:** (DEPLOYMENT, OPERATOR, FOUNDER_UAT)
8. **Implementation / Active Code:** in `apps/` and `packages/`

> [!CAUTION]
> **Continuity Invariants:**
> - Do NOT tell AG to blindly read all Markdown files.
> - Files in `docs/99_ARCHIVE/` are historical reference only and MUST NOT be used as current-state authority.
> - Do not declare a phase closed from an implementation report alone. A Founder Physical UAT PASS does not equal release CLOSED until the release closure gate is completed.
> - Do not reopen closed Session History, Printer RCA-7, Upload Outage Reliability, or Startup Freeze work without new evidence.
> - Do not start Camera implementation before the Camera RCA is audited.
> - Do not modify `CameraService.ts` during unrelated work.
> - Do NOT claim any new Pilot Readiness feature (PR-01 through PR-08) is complete without code implementation, automated tests, and Founder Physical UAT sign-off.

**Current active gate:**

> PILOT READINESS FEATURE GAP CLOSURE (Phase B: PR-02 Printer Profiles & Calibration Planning).

