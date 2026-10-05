# PICTOLABS — PILOT READINESS MASTER TIMELINE v3

**Purpose:** master continuity timeline untuk menjaga roadmap historis, status aktual, execution order, dan release gates Pictolabs tetap konsisten ketika proyek berpindah chat.

**Version:** Master Timeline v3.0  
**Updated:** 6 October 2026  

**Current stage:** Pilot Hardening  
**Current active phase:** Transition from Printer RCA-7 closure → Camera Reliability & Camera Management  
**Current gate:** Formal Printer RCA-7 release closure, then Camera RCA / mapping  
**Pilot target:** 1 booth → operational proof → scale 5–10 booths

---

## 1. Project Rules

### Source of truth
- `MASTER_PROJECT_STATUS.md`
- `PICTOLABS_MASTER_BLUEPRINT.md`
- `PROJECT_HANDOFF.md`
- Sprint/phase plans
- Feature-specific RCA / Fix Reports
- Founder Physical UAT

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
| P0 | Admin Panel remains accessible offline | **CLOSED / PASS** | Offline Admin PIN telah diperbaiki dengan local secure hash verification dan admin panel telah tervalidasi dalam offline flow. |
| P0 | Session corruption after camera failure | **UNRESOLVED / NEEDS VALIDATION** | Belum ada bukti penutupan eksplisit untuk requirement historis ini. Jangan samakan dengan bug sinkronisasi webcam/DSLR yang saat ini didefer. |

## P1 — Pilot-Critical Features

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P1 | Printer offline during session handling | **UAT PASS — FORMAL CLOSURE PENDING** | RCA-7 simplification implemented, automated/build verification passed, Founder Physical UAT passed. Remaining gate is clean commit → push → VPS deploy → smoke test. |
| P1 | Upload queue monitoring | **FUNCTIONAL PASS / PRODUCTION REGRESSION OPEN** | Automatic upload, Force Upload, queue/recovery behavior and Session History correlation have passed Founder UAT. Dedicated internet-outage regression and production verification remain. |
| P1 | Session history + reprint center | **CLOSED — PHASE 1–2** | History, detail, reprint 1x/2x, double-tap protection, offline history, offline HOT reprint, automatic upload, Force Upload telah Founder-verified PASS. |
| P1 | Real Midtrans Sandbox | **OPEN — SANDBOX / PRODUCTION VERIFICATION** | Functional payment flow exists and sandbox/real-provider verification remains a separate gate. Production merchant approval/credentials/E2E are not closed. |

## P2 — Camera / UX Capability

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P2 | Camera Device Selector | **OPEN — NEW CAMERA WORKSTREAM** | Kebutuhan baru diperluas menjadi pemilihan DSLR / mirrorless / webcam per booth. Belum closed. |
| P2 | Webcam Live Preview | **CORE CAPABILITY EXISTS / RELIABILITY OPEN** | Webcam live preview sudah digunakan, tetapi source preview ↔ capture consistency belum closed. |
| P2 | Camera Settings | **NOT STARTED** | ISO, shutter, aperture, WB, exposure compensation, focus/AF sesuai capability perlu dipetakan dan diimplementasikan secara capability-based. |
| P2 | DSLR / Mirrorless / Webcam Support | **OPEN — ARCHITECTURE + DEVICE ABSTRACTION** | Perlu camera abstraction dan device capability model tanpa membongkar CameraService yang sudah stabil kecuali diperlukan. |
| P2 | Preview ↔ Capture Consistency | **OPEN — RELIABILITY BUG** | Ada evidence preview/countdown dapat menggunakan webcam sementara capture menggunakan DSLR. Ini menjadi reliability requirement. |

## P3 — Operational / Extended Center

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P3 | Session History Center | **PHASE 1–2 CLOSED / DASHBOARD PHASE 3 NOT STARTED** | Jangan mengubah status menjadi fully complete: core kiosk history/reprint/force-upload sudah closed, tetapi Dashboard Session History Phase 3 masih belum dimulai. |
| P3 | Restart Recovery | **OPEN / NEXT AFTER CAMERA** | Kiosk restart recovery tetap menjadi phase tersendiri setelah printer formal closure dan camera reliability gate. |

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

# 10. Printer Execution Simplification / RCA-7 — IMPLEMENTED + FOUNDER UAT PASS

V2 implementation is complete and has passed automated verification. Founder Physical UAT remains the final closure gate.

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

- PRN hardening suite: 49/49 PASS.
- Electron TypeScript build: PASS.
- Renderer build: PASS.

### Founder UAT status

RCA-7 Founder Physical UAT is **PASS**. Confirmed:
- Normal customer print.
- Background GIF/MP4 no longer blocks print path.
- Printer OFF before dispatch → queue remains pending and later dispatches when printer returns.
- Disconnect after dispatch.
- Paper Out behavior.
- Cover Open behavior.
- Admin reprint.
- No delayed watchdog-driven duplicate print.
- No spontaneous second physical print.

Important semantic decision:
- `COMPLETED` in the simplified execution boundary means **Print Dispatch / Windows Spooler Accepted**, not guaranteed physical mechanical completion.
- A pending queue that prints once after the printer returns is expected behavior.
- A physical print followed by application retry that creates a second physical print remains a critical bug.

Formal closure still requires:
- clean commit
- push GitHub
- production deploy
- VPS smoke test

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

RCA-7 is now **Founder-UAT PASS**, but the project phase is not formally closed until the release gate is completed:

```text
RCA / design audit        PASS
Implementation            PASS
Automated regression      PASS
Production build          PASS
Founder Physical UAT      PASS
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

# 12. Camera Management & Reliability — NEW ACTIVE WORKSTREAM

The original timeline described the camera core as ~95% / stable. That remains valid for the existing core capture path, but new evidence and founder requirements create a separate workstream.

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

This must be treated as a real reliability issue, not merely a future UI enhancement.

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

## Phase 1 — Formal Printer RCA-7 Closure
**CURRENT RELEASE GATE**

```text
Founder UAT PASS
→ clean commit
→ push GitHub
→ deploy VPS
→ VPS smoke
→ CLOSED
```

No new printer redesign unless new evidence appears.

## Phase 2 — Camera Reliability RCA
**NEXT**

RCA-only first:
- reproduce preview/capture mismatch
- map camera lifecycle
- identify source-of-truth state
- inspect fallback behavior
- inspect reconnect/restart
- compare with Photolab only where useful

Deliverable:
`CAMERA_RELIABILITY_RCA.md`

No implementation until RCA is audited.

## Phase 3 — Camera Management & Device Capability
After RCA approval:
- device selector
- DSLR / mirrorless / webcam abstraction
- capability detection
- in-app camera settings
- preview/capture consistency
- reconnect/recovery

Each feature must pass automated/build/runtime/Founder UAT gates.

## Phase 4 — Upload / Internet Production Regression

Validate:

```text
Internet OFF
→ local capture
→ pending upload
→ Internet returns
→ automatic retry
→ R2
→ completed
```

Also:
- Force Upload
- duplicate prevention
- upload failure recovery
- Session History correlation
- retention rules
- production R2 lifecycle/configuration

## Phase 5 — Real Midtrans Verification

Separate functional implementation from production readiness:

```text
sandbox / provider E2E
→ webhook / settlement
→ failure / timeout
→ production merchant readiness
→ production E2E
```

Do not call production payment readiness CLOSED until the actual production gate passes.

## Phase 6 — Kiosk Restart / Session Recovery

Test:
- restart during active session
- restart during upload
- restart around print dispatch
- queue recovery
- no duplicate print
- no duplicate upload
- no orphan session
- recovery ledger consistency

## Phase 7 — Dashboard Session History Phase 3 / Operational Layer

Start only after core kiosk reliability gates are stable.

Scope to be confirmed:
- dashboard session list
- search/filter
- session detail
- support actions
- asset visibility
- operational diagnostics
- fleet correlation

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
- ~5s print-start latency investigation
- camera source synchronization bug
- Midtrans production readiness/verification as applicable
- Dashboard Session History Phase 3
- remote reprint / broader fleet operations
- scale from 1 → 5–10 booths

---

# 17. Current Snapshot

```text
Architecture / Foundation        CLOSED
P0 Admin                         CLOSED
Session History Phase 1–2       CLOSED

Printer RCA-7 Implementation    PASS
Printer RCA-7 Founder UAT       PASS
Printer Formal Release Closure  PENDING

Camera Core                     STABLE
Camera Reliability              OPEN
Camera Management               NOT STARTED
Camera Device Selector          NOT STARTED
Camera Settings                 NOT STARTED
DSLR/Mirrorless/Webcam model    OPEN

Upload Functional               PASS
Upload Production Regression    OPEN

Midtrans Functional             PASS / VERIFY
Midtrans Production             OPEN

Dashboard Session History P3    NOT STARTED
Fleet Operations                PARTIAL / OPEN
Restart Recovery                NEXT

Full Regression                 PENDING
Production Release              PENDING
VPS Deployment                  PENDING
Pilot Booth #1                  NOT READY
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

When moving the project to a new chat:

1. Load this timeline.
2. Load `PROJECT_HANDOFF.md`.
3. Load `MASTER_PROJECT_STATUS.md`.
4. Load the latest feature RCA/Fix Report.
5. Check the latest Founder Physical UAT.
6. Continue from the current active gate.
7. Do not restart analysis from zero.
8. Do not declare a phase closed from an AG implementation report alone.

**Current active gate:**

> Formal closure of Printer RCA-7 (commit → push → VPS deploy → smoke), then Camera Reliability RCA.

Do not reopen closed Session History work without new evidence. Do not start Camera implementation before the Camera RCA is audited. Do not treat Photolab reference features as automatic Pictolabs requirements.
