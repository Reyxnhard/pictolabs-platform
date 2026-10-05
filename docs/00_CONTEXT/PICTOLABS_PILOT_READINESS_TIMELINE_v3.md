# PICTOLABS — PILOT READINESS MASTER TIMELINE v3

**Purpose:** master continuity timeline untuk menjaga roadmap historis, status aktual, execution order, dan release gates Pictolabs tetap konsisten ketika proyek berpindah chat.

**Version:** Master Timeline v3.1  
**Updated:** 6 October 2026  

**Current stage:** Pilot Hardening  
**Current active phase:** Phase 1 — Formal Printer RCA-7 Release Closure (Transition to Phase 2 — Camera Reliability)  
**Current gate:** Formal Printer RCA-7 Release Closure (Production Build → Commit → Push → VPS Deploy → VPS Smoke Test)  
**Pilot target:** 1 booth → operational proof → scale 5–10 booths

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
| P1 | Printer offline during session handling | **FOUNDER_UAT_PASS → RELEASE_CLOSURE_PENDING** | RCA-7 simplification implemented, 49/49 automated tests passed, Founder Physical UAT passed on Booth #1 hardware with zero duplicate prints. Remaining gate: production build, release commit, push, VPS deploy, and smoke test. |
| P1 | Upload queue monitoring | **AUTOMATED_VERIFIED / FOUNDER_UAT_PASS (Targeted) → PRODUCTION_REGRESSION_PENDING** | Automatic upload, Force Upload, SQLite queue recovery, and Session History correlation verified PASS by Founder. Dedicated internet-outage reliability scenario remains to be run. |
| P1 | Session history + reprint center | **CLOSED** | Kiosk Phase 1–2: History, detail, reprint 1x/2x with debounce, double-tap protection, offline history, offline HOT reprint, automatic upload, and Force Upload verified PASS by Founder. Web Dashboard Phase 3 remains `NOT_STARTED`. |
| P1 | Real Midtrans Sandbox | **AUTOMATED_VERIFIED (Sandbox) / NOT_STARTED (Production Merchant)** | Functional payment flow & sandbox webhook verified; production merchant approval and live banking E2E settlement remain open. |

## P2 — Camera / UX Capability

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P2 | Camera Device Selector | **NOT_STARTED** | Multi-camera selection per booth planned for operator UI. |
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

# 10. Printer Execution Simplification / RCA-7 — IMPLEMENTED & FOUNDER_UAT_PASS

RCA-7 simplification is fully **IMPLEMENTED**, **AUTOMATED_VERIFIED** (49/49 PASS across test suites), and has achieved **FOUNDER_UAT_PASS** on physical Booth #1 hardware. Current status is **RELEASE_CLOSURE_PENDING**.

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

Important semantic decision:
- `COMPLETED` in the simplified execution boundary means **Print Dispatch / Windows Spooler Accepted**, not guaranteed physical mechanical completion.
- A pending queue that prints once after the printer returns is expected behavior.
- A physical print followed by application retry that creates a second physical print remains a critical bug.

### Current Release State: FOUNDER_UAT_PASS → RELEASE_CLOSURE_PENDING

Formal closure requirements:
- Production installer packaging
- Clean commit
- Push GitHub
- Production VPS deploy
- VPS smoke test
- Formal sign-off → **CLOSED**

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

# 11. P1 Printer Closure Gate

RCA-7 is now **FOUNDER_UAT_PASS**, but the workstream is not formally closed until the release closure gate is completed:

```text
RCA / design audit        PASS
Implementation            PASS
Automated regression      PASS
Production build          PASS
Founder Physical UAT      PASS
        ↓ (CURRENT POSITION: RELEASE_CLOSURE_PENDING)
Production packaging
        ↓
Clean commit
        ↓
Push GitHub
        ↓
Deploy VPS
        ↓
VPS smoke test
        ↓
CLOSED
```

The future Admin Printer Selection / Multi-Printer feature is **not required** to close the current printer failure-handling phase.

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

## Phase 1 — Formal Printer RCA-7 Release Closure
**CURRENT RELEASE GATE (`RELEASE_CLOSURE_PENDING`)**

```text
Founder UAT PASS
→ production packaging
→ clean commit
→ push GitHub
→ deploy VPS
→ VPS smoke
→ CLOSED
```

No new printer redesign unless new evidence appears.

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

## Phase 4 — Upload / Internet Production Reliability (`OPEN`)
Targeted upload UAT passed, but the complete internet-outage reliability scenario remains open:

```text
Internet OFF
→ local capture
→ pending upload
→ Internet returns
→ automatic retry
→ R2
→ completed
```

Also validate:
- Force Upload
- duplicate prevention
- upload failure recovery
- Session History correlation
- retention rules
- production R2 lifecycle/configuration

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

## Phase 13 — Physical Pilot Booth #1

Only after all Pilot Critical gates pass:

```text
P0 blockers CLOSED
Session History Phase 1–2 CLOSED
Printer RCA-7 CLOSED
Camera Reliability CLOSED
Upload Reliability CLOSED
Payment Production Gate CLOSED
Restart Recovery CLOSED
Full Regression PASS
Founder Pilot UAT PASS
Production Build PASS
GitHub Release PASS
VPS Deploy PASS
VPS Smoke PASS
```

Then:

> PILOT BOOTH #1 READY

# 15. Post-Pilot Scaling

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

# 16. Non-Blocking / Deferred Backlog

- PRN-03 final classification
- ~5s print-start latency investigation (observation, not a blocker)
- camera source synchronization bug (active investigation under Camera Reliability)
- Midtrans production merchant onboarding & live banking app verification
- Dashboard Session History Phase 3
- remote edge reprint / broader fleet operations
- scale from 1 → 5–10 booths

---

# 17. Current Snapshot

```text
Architecture / Foundation        CLOSED
P0 Admin Panel & Security        CLOSED
Session History Phase 1–2 (Kiosk) CLOSED

Printer RCA-7 Implementation     AUTOMATED_VERIFIED
Printer RCA-7 Physical UAT       FOUNDER_UAT_PASS
Printer Subsystem Release        RELEASE_CLOSURE_PENDING

Camera Core Architecture         AUTOMATED_VERIFIED
Camera Reliability               OPEN (BLOCKED ON RCA)
Camera Preview ↔ Capture Sync    OPEN (KNOWN BUG)
Camera Device Selector           NOT_STARTED
Camera Settings (ISO/Shutter)    NOT_STARTED
DSLR/Mirrorless/Webcam Abstraction NOT_STARTED

Upload Core Pipeline             PRODUCTION_VERIFIED (Cloudflare R2 Bucket)
Upload Kiosk Direct Pipeline     AUTOMATED_VERIFIED
Upload Production Outage Gate    OPEN (RELIABILITY SCENARIO PENDING)

Midtrans Sandbox API             AUTOMATED_VERIFIED
Midtrans Production Account      NOT_STARTED (MERCHANT ONBOARDING OPEN)
Offline Payment Bypass           CLOSED / VERIFIED

Dashboard Session History P3     NOT_STARTED
Remote Edge Reprint Dispatch     NOT_STARTED
Restart Recovery Engine          NOT_STARTED / NEXT AFTER CAMERA

Full Customer Flow Regression    PENDING
Founder Pilot UAT                PENDING
Production Installer Packaging   PENDING
VPS Deployment & Smoke Test      PENDING
Pilot Booth #1 Status            NOT_READY (HARDENING IN PROGRESS)
```

## Pilot Critical vs Post-Pilot

### Pilot Critical
- printer formal closure
- camera reliability
- required camera/device configuration for Booth #1
- upload production verification
- payment production readiness
- restart/session recovery
- full customer regression
- Founder Pilot UAT
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

# 18. Continuity Rule for New Chats

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
> - Do not reopen closed Session History work without new evidence.
> - Do not start Camera implementation before the Camera RCA is audited.
> - Do not modify `CameraService.ts` during unrelated work.

**Current active gate:**

> Formal release closure of Printer RCA-7 (`RELEASE_CLOSURE_PENDING`), then Camera Reliability RCA (`CAMERA-01`).
