# PICTOLABS — PILOT READINESS MASTER TIMELINE v2

**Purpose:** master continuity timeline untuk menjaga roadmap historis, status aktual, execution order, dan release gates Pictolabs tetap konsisten ketika proyek berpindah chat.

**Version:** Master Timeline v2  
**Updated:** 4 October 2026  

**Current stage:** Pilot Hardening  
**Current active phase:** P1 — Printer Failure Handling  
**Current gate:** PRN-04 / PRN-05 DNP mechanical telemetry fix  
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
| P1 | Printer offline during session handling | **IN PROGRESS** | V1 memperbaiki sebagian failure handling; PRN-04 Paper Out dan PRN-05 Cover Open masih FAIL. V2 sedang membuktikan telemetry DNP yang lebih kuat. |
| P1 | Upload queue monitoring | **PARTIALLY CLOSED / HARDENING NEXT** | Queue/recovery visibility dan Force Upload sudah menjadi bagian Session History Phase 1–2 dan UAT terkait PASS. Reliability saat internet outage masih perlu regression khusus. |
| P1 | Session history + reprint center | **CLOSED — PHASE 1–2** | History, detail, reprint 1x/2x, double-tap protection, offline history, offline HOT reprint, automatic upload, Force Upload telah Founder-verified PASS. |
| P1 | Real Midtrans Sandbox | **DEFERRED / NOT YET VERIFIED** | Real Midtrans validation belum menjadi gate yang selesai. Jangan menyatakan production payment readiness sebelum validasi eksplisit. |

## P2 — Camera / UX Capability

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P2 | Camera Device Selector | **BACKLOG / NOT EXPLICITLY VERIFIED** | Belum ada bukti pada timeline ini bahwa selector device sudah menjadi feature release yang tervalidasi. |
| P2 | Webcam Live Preview | **BACKLOG / NOT EXPLICITLY VERIFIED** | Webcam memang dipakai pada live mode saat ini, tetapi requirement historis ini tetap dicatat sebagai roadmap item sampai scope-nya dinyatakan selesai secara eksplisit. |

## P3 — Operational / Extended Center

| Priority | Original item | Current status | Notes |
|---|---|---|---|
| P3 | Session History Center | **PHASE 1–2 CLOSED / DASHBOARD PHASE 3 NOT STARTED** | Jangan mengubah status menjadi fully complete: core kiosk history/reprint/force-upload sudah closed, tetapi Dashboard Session History Phase 3 masih belum dimulai. |
| P3 | Restart Recovery | **NEXT** | Kiosk restart recovery menjadi phase tersendiri setelah printer dan camera reliability gates selesai. |

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

# 10. Current P1 Fix V2

AG is currently working on telemetry feasibility + implementation.

Preferred order:

1. Existing native DNP telemetry already present in project.
2. Legacy DNP status wrapper / SDK.
3. `IOCTL_USBPRINT_GET_LPT_STATUS` if proven useful on the actual DS-RX1.
4. If no reliable telemetry can be proven, report limitation instead of inventing a false-success heuristic.

Legacy evidence found in earlier code:
- `PhotolabDNP.exe`
- `CspStat.dll`
- media/status output

This must be proven on the current Windows kiosk before production integration.

Required internal status abstraction:

```text
READY
PAPER_OUT
COVER_OPEN
RIBBON_OUT
ERROR
OFFLINE
UNKNOWN
```

Required logic:

```text
PnP check
→ hardware status
→ preflight block if unsafe
→ dispatch only when ready
→ spooler transmission
→ hardware/post-print verification
→ COMPLETED only with strongest available evidence
```

Paper counter must only decrement after verified success.

Existing retry/backoff remains.

Bypass remains.

Camera must not be modified during this printer phase.

---

# 11. P1 Closure Gate

P1 is NOT CLOSED until:

```text
PRN-01 PASS
PRN-02 PASS
PRN-03 resolved
PRN-04 PASS
PRN-05 PASS
PRN-06 PASS
PRN-07 PASS

+ automated tests PASS
+ regression PASS
+ production build PASS
+ Founder Physical UAT PASS
```

---

# 12. Deferred Camera Bug

Observed during printer UAT:

```text
Countdown
→ webcam displayed

Countdown ends
→ DSLR captures

Live mode
→ webcam

Camera restart + USB reconnect
→ normal again
```

Status: DEFERRED.

Do not touch `CameraService` while Printer Failure Handling is active.

After printer closure, investigate:
- camera source state
- DSLR readiness
- webcam fallback
- countdown source
- capture source
- live mode source
- reconnect synchronization
- camera restart recovery

---

# 13. Deferred Printer Latency Observation

Founder observed approximately 5 seconds before physical printing starts.

Status: observation, not yet classified as a bug.

Need to distinguish:
- session completion → 5s → physical print starts
versus
- physical print starts → 5s → software success

Correctness takes priority over latency optimization.

---

# 14. Upcoming Pilot Hardening Timeline

## Phase 1 — Printer Failure Handling V2
**CURRENT**

```text
Telemetry probe
→ implementation
→ automated tests
→ build
→ audit
→ Founder UAT
```

## Phase 2 — PRN-03 Resolution / Printer Full Regression

Resolve:
- USB disconnect behavior
- final queue state
- History state
- paper counter
- retry
- physical output

Then rerun full PRN-01 → PRN-07 matrix.

## Phase 3 — Camera Reliability

Validate:
- DSLR/webcam synchronization
- live mode source
- countdown source
- capture source
- reconnect
- restart
- fallback

## Phase 4 — Upload / Internet Reliability

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

## Phase 5 — Kiosk Restart / Session Recovery

Test:
- restart during active session
- restart during upload
- restart during print
- queue recovery
- no duplicate print
- no duplicate upload
- no orphan session
- recovery ledger consistency

## Phase 6 — Full Customer Journey Regression

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

## Phase 7 — Founder Pilot UAT

Operate booth as a real operator, including repeated sessions and failure/recovery scenarios.

Goal:
> real booth can operate repeatedly without losing sessions, photos, print accounting, or recovery state.

## Phase 8 — Production Build Gate

```text
source verification
→ TypeScript
→ renderer build
→ Electron production build
→ backend tests
→ regression
→ Docker production build
```

## Phase 9 — Git Release

```text
local fix
→ local test
→ local production verification
→ Founder verification
→ commit
→ push GitHub
```

## Phase 10 — VPS Deployment

```text
GitHub
→ VPS update
→ Docker production build
→ docker compose up -d
→ container health
→ logs
```

## Phase 11 — VPS Smoke Test

Validate:
- backend
- PostgreSQL
- Redis
- Nginx
- dashboard
- kiosk API/heartbeat
- activation
- session
- payment
- capture
- print
- upload
- history

## Phase 12 — Physical Pilot Booth #1

Only after all gates pass:

```text
P0 blockers CLOSED
Session History CLOSED
Printer CLOSED
Camera CLOSED
Upload CLOSED
Restart Recovery CLOSED
Full Regression PASS
Founder Pilot UAT PASS
Production Build PASS
GitHub Release PASS
VPS Deploy PASS
VPS Smoke Test PASS
```

Then:

> PILOT BOOTH #1 READY

---

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
P0 Critical Blockers          CLOSED
Session History Phase 1–2    CLOSED

P1 Printer Failure Handling   IN PROGRESS
PRN-01                       PASS
PRN-02                       PASS
PRN-03                       INVESTIGATE
PRN-04                       FAIL
PRN-05                       FAIL
PRN-06                       PASS
PRN-07                       PASS

Printer V2                   IN PROGRESS

Camera Reliability            DEFERRED
Upload Reliability            NEXT
Restart Recovery              NEXT
Full Regression               PENDING
Production Release            PENDING
VPS Deployment                PENDING
Pilot Booth #1                NOT READY
```

---

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

> P1 Printer Failure Handling V2 — prove reliable DNP mechanical telemetry, implement the minimal validated fix, run automated tests/build, then Founder Physical UAT.

Do not move to Camera Reliability until Printer Failure Handling is formally CLOSED.
