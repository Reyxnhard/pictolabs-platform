# PICTOLABS MASTER PROJECT ROADMAP
## Definitive Single Source of Truth (SSOT) & Engineering Strategic Plan
**Target System:** Pictolabs Unattended Autonomous Photobooth Platform (Edge Kiosk + NestJS Cloud Engine + Operations Dashboard)  
**Document Ref:** `/docs/MASTER_PROJECT_ROADMAP.md`  
**Last Updated:** September 13, 2026  
**Status:** ACTIVE STRATEGIC ROADMAP  

---

## TABLE OF CONTENTS
1. [Core-First Development Policy](#1-core-first-development-policy)
2. [Current Execution Focus](#2-current-execution-focus)
3. [Roadmap Structure & Status Legend](#3-roadmap-structure--status-legend)
4. [Phase 0: Discovery & Reverse Engineering](#4-phase-0-discovery--reverse-engineering)
5. [Phase 1: Core Rebuild](#5-phase-1-core-rebuild)
6. [Phase 2: Data Integrity & Reliability](#6-phase-2-data-integrity--reliability)
7. [Phase 3: Production Hardening](#7-phase-3-production-hardening)
8. [Phase 4: Admin Dashboard & Observability](#8-phase-4-admin-dashboard--observability)
9. [Phase 5: UI/UX Redesign (Stitch)](#9-phase-5-uiux-redesign-stitch)
10. [Phase 6: Multi-Booth Ecosystem & Fleet Orchestration](#10-phase-6-multi-booth-ecosystem--fleet-orchestration)
11. [Phase 7: Commercial Business Features](#11-phase-7-commercial-business-features)
12. [Phase 8: Production Deployment & Cloud Infrastructure](#12-phase-8-production-deployment--cloud-infrastructure)
13. [Phase 9: Pilot Launch & Commercial Rollout](#13-phase-9-pilot-launch--commercial-rollout)
14. [Future Product Vision (Long-Term Strategic Backlog)](#14-future-product-vision-long-term-strategic-backlog)
15. [Consolidated Documentation Index](#15-consolidated-documentation-index)
16. [Gap Analysis & Architectural Blind Spots](#16-gap-analysis--architectural-blind-spots)
17. [Recommended Next Work Sequence](#17-recommended-next-work-sequence)

---

## 1. CORE-FIRST DEVELOPMENT POLICY

> [!IMPORTANT]
> **PICTOLABS ENGINEERING LAW #1: CORE STABILITY PRECEDES FEATURE EXPANSION.**
> Under no circumstances may new features, UI re-skins, or marketing initiatives be introduced if they compromise or distract from the stability, data integrity, and autonomous reliability of the core photobooth transaction loop.

### Hierarchy of Engineering Priorities
1. **Data Integrity**: Zero lost photos, zero split sessions, zero orphan financial transactions.
2. **System Reliability**: Zero unhandled crashes, offline autonomy, failsafe hardware fallback, self-healing queues.
3. **Production Stability**: Deterministic OS lockdown, thermal printer recovery, power-loss crash protection.
4. **Operations Dashboard**: Fleet observability, customer support remediation, transaction accounting.
5. **UI/UX Redesign**: High-conversion visual interfaces, tactile animations, multi-language support.
6. **Future Features**: Loyalty programs, AI filters, corporate B2B tooling, franchise management.

Any code modification must be evaluated against this hierarchy. If a proposed change improves UI (Priority 5) but introduces concurrency risk to the Upload Queue (Priority 1), **the change must be rejected immediately**.

---

## 2. CURRENT EXECUTION FOCUS

### Current Phase: **PHASE 2 — Data Integrity & Reliability**
* **Primary Objective**: Guarantee 100% data integrity between physical kiosk touch events, payment settlements, cloud database records, and customer gallery assets.
* **Non-Negotiable Targets**:
  - **Session Integrity**: Eliminate Session ID Fracture permanently (`PaymentScreen` $\rightarrow$ `RenderScreen`).
  - **Upload Reliability**: Ensure zero unacknowledged photo uploads to Cloudflare R2.
  - **Sync Reliability**: Pre-flight synchronization guarantees session existence in PostgreSQL before photo confirmation.
  - **Eliminate Photo Loss**: Prevent premature `COMPLETED` markers; enforce retry with exponential backoff on all network interruptions.
* **Operational Constraint**: **ALL OTHER WORK IS SECONDARY.** Dashboard feature additions, styling updates, and new hardware integrations remain paused until Phase 2 is signed off with full end-to-end evidence.

---

## 3. ROADMAP STRUCTURE & STATUS LEGEND

To maintain strict alignment across multiple contributors and prevent architectural drift, every milestone in this roadmap is categorized into one of four states:

| Status Tag | Meaning & Engineering Rule |
|:---|:---|
| `[COMPLETED]` | Fully built, integrated into the codebase, verified with automated tests or physical hardware validation. Modifiable only for critical bug fixes. |
| `[IN PROGRESS]` | Actively being engineered, tested, or staged in the current development cycle. Highest engineering priority. |
| `[PLANNED]` | Architecturally scoped with defined requirements, waiting for prerequisite phases to complete. Coding not permitted yet. |
| `[FUTURE VISION]` | Strategic business aspiration. Captures product direction without immediate technical design or implementation. |

---

## 4. PHASE 0: DISCOVERY & REVERSE ENGINEERING
*Status:* `[COMPLETED]`  
*Timeline:* August 2026 – Early September 2026  
*Primary Documentation:* `/docs/OPERATOR_RUNBOOK.md`, `/docs/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md`

### Objectives Achieved
1. **De-obfuscation & Vendor Liberation**:
   - Stripped proprietary commercial binary protections (V8 bytenode `.jsc`, hardware licensing dongles, `node-machine-id` locks).
   - Unlocked 100% intellectual property ownership and source code sovereignty for Pictolabs.
2. **Hardware Protocol Reverse Engineering**:
   - Analyzed Canon EDSDK 13.x native C++ USB communication patterns.
   - Identified DNP DS-RX1 / DS620 thermal printer Windows spooler integration commands (`ImageView_PrintTo`).
   - Reverse-engineered frame composite coordinates, aspect ratio grids (Korea 2R dual-strip, 4R postcard), and color filter pixel algorithms.
3. **Legacy Architecture Audit**:
   - Documented critical vulnerabilities in legacy implementation: unhandled camera sleep timeouts, race conditions in file saving, and vulnerable un-synced local SQLite databases.

---

## 5. PHASE 1: CORE REBUILD
*Status:* `[COMPLETED]`  
*Timeline:* September 1 – September 8, 2026  
*Primary Documentation:* `/docs/MASTER_PROJECT_STATUS.md`, `/docs/PICTOLABS_PLATFORM_ARCHITECTURE.md`, `/docs/R2_INTEGRATION_REPORT.md`, `/docs/MIDTRANS_INTEGRATION_STATUS_REPORT.md`

### Core Capabilities Delivered

#### 1. Native Kiosk Client Engine (`apps/kiosk`)
- **Runtime**: Electron 28 + React 18 + Tailwind CSS v4 in portrait mode (1080x1920).
- **Canon DSLR Shutter Engine (`CameraService.ts`)**:
  - Native C++ binding (`@photolab/canon`) interfacing directly with Canon EDSDK 13.x via USB.
  - Sub-250ms shutter latency.
  - 30 FPS LiveView viewfinder streaming via canvas buffer with horizontal mirror flip.
  - Active Anti-Sleep Keepalive: Dispatches `ExtendShutDownTimer` every 10 seconds to prevent camera power-down.
  - Background Auto-Reconnect: Poller running every 1.5 seconds to auto-detect reconnected DSLR cables.
  - WebRTC Webcam Fallback: Emergency failover to USB/laptop webcam within 2 seconds if DSLR disconnects.
- **Sharp Composite Rendering Engine (`RenderEngine.ts`)**:
  - High-resolution 1200x1800 @ 300 DPI composite layout engine utilizing `sharp`.
  - Automated grid layouts for 2R double photostrip (5x15 cm) and 4R single postcard.
  - Hardware-accelerated pixel filters (B&W High Contrast, Warm, Cool, Sepia, Vivid).
  - Alpha-channel PNG frame overlay composition.
- **Thermal Dye-Sublimation Print Spooler (`PrinterService.ts`)**:
  - Windows Shell integration via PowerShell spooler trigger.
  - Heuristic detection of primary photo printer (DNP DS-RX1, Citizen CX-02, HiTi P525L).
- **Live Photo Burst Capture (`LivePhotoService.ts`)**:
  - 3-second WebM video burst capture during countdown prior to each shutter release.
  - Local MP4 transcoding via bundled static `ffmpeg.exe`.

#### 2. Cloud Engine & Payment Integration (`apps/backend`)
- **Backend Stack**: NestJS 10 REST API, Socket.IO WebSockets, Prisma ORM, PostgreSQL 16.
- **Midtrans Dynamic QRIS Engine (`PaymentsService.ts`)**:
  - Generates authoritative dynamic QRIS invoices per transaction.
  - Validates inbound webhooks (`POST /api/payments/webhook`) using SHA-512 cryptographic signatures.
  - WebSocket auto-advance: Emits `payment_success` to kiosk for sub-second transition to frame selection upon bank settlement.
  - Payment recovery: In-flight order resumption if kiosk application is reloaded during QR display.
- **Cloudflare R2 Object Storage Pipeline (`StorageService.ts`)**:
  - S3-compatible client (`@aws-sdk/client-s3`) targeting zero-egress bucket `pictolabs-media-prod`.
  - Presigned PUT URL generation for secure, direct-from-kiosk uploads.
  - Streaming customer ZIP generator (`/api/gallery/:sessionId/zip`) via Node `archiver` and direct R2 binary streams.
- **Mobile Public Customer Gallery (`GalleryController.ts`)**:
  - Lightweight, mobile-optimized web gallery (`/d/:sessionId`).
  - Full-resolution photo strip viewer, individual pose downloads, and HTML5 video observer for Live Photo playback.
  - 30-day automated retention expiration notice.

#### 3. Edge-to-Cloud Fleet Telemetry (`apps/backend/src/booths`)
- **Deterministic HTTP Heartbeat**: `POST /api/booths/:id/heartbeat` established as the single source of truth for booth liveness (`last_seen`).
- Status dynamically derived: `ONLINE` (<60s), `DEGRADED` (<5m), `OFFLINE` ($\ge$5m).
- Telemetry captures machine hostname, local IP, OS build, app version, and deployed git commit.

---

## 6. PHASE 2: DATA INTEGRITY & RELIABILITY
*Status:* `[IN PROGRESS — Verification Stage]`  
*Target Completion:* September 13, 2026  
*Primary Documentation:* `/docs/2026-09-10_PHASE_2_COMPLETION.md`

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                             PHASE 2 ARCHITECTURE FIX                           │
├────────────────────────────────────────────────────────────────────────────────┤
│  PaymentScreen (Kiosk)                                                         │
│     │ (Receives res.sessionId from Backend QRIS)                               │
│     ▼                                                                          │
│  updateSession({ sessionId }) ──► Persisted in Root React State                │
│     │ (Survives FrameDesign -> Capture -> Render)                              │
│     ▼                                                                          │
│  createSession() (SQLite)                                                      │
│     │                                                                          │
│     ├──────────────────────────► Eager Sync (POST /api/sessions)               │
│     ▼                                                                          │
│  Upload Worker (4s interval)                                                   │
│     │                                                                          │
│     ▼                                                                          │
│  Pre-flight Guard                                                              │
│     ├── synced == 0? ──────────► Force syncSingleSessionToCloud(sessionId)    │
│     │                            (If sync fails: Mark FAILED, Retry later)     │
│     ▼                                                                          │
│  Upload to R2 via Presigned PUT                                                │
│     │                                                                          │
│     ▼                                                                          │
│  POST /api/storage/confirm-upload                                              │
│     ├── Validate x-device-secret (401 if invalid)                              │
│     ├── Validate Session Exists in PG (409 if missing)                         │
│     ├── Link Photo Records & Update Status = COMPLETED                         │
│     └── Return { confirmed: true }                                             │
│     │                                                                          │
│     ▼                                                                          │
│  SyncEngine receives confirmData.confirmed == true?                            │
│     ├── YES ───────────────────► Mark SQLite upload_queue = COMPLETED          │
│     └── NO / Network Err ──────► Mark SQLite upload_queue = FAILED (Retry)     │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Problem Areas & Approved Solutions

#### Fix #1: Session ID Fracture
- **Root Cause**: `PaymentScreen.tsx` received `res.sessionId` from the cloud backend during QRIS generation, but failed to call `updateSession({ sessionId })`. Consequently, `RenderScreen.tsx` fell back to generating an unlinked local timestamp UUID (`session_<timestamp>_<rand>`). Financial records pointed to `session_A`, while photos synced under `session_B`, causing blank customer galleries.
- **Solution**: Explicitly destructure `updateSession` from `ScreenProps` in `PaymentScreen.tsx` and invoke it across all four payment confirmation branches (QRIS creation, order recovery, WebSocket event, polling fallback).
- **Result**: Exactly one authoritative `sessionId` governs the entire lifecycle from invoice creation to photo capture.

#### Fix #2: Photo Loss Race Condition
- **Root Cause**: The upload worker executed every 4 seconds, whereas the session metadata sync executed every 30 seconds. In high-speed network environments, photos finished uploading to R2 before the session record existed in PostgreSQL. The backend failed to insert photos, while the kiosk prematurely marked the upload `COMPLETED`.
- **Solution**:
  1. **Eager Sync**: `createSession()` triggers `syncSingleSessionToCloud(sessionId)` immediately after local SQLite insertion.
  2. **Pre-flight Guard**: Before dispatching `confirm-upload`, the upload worker verifies `synced == 1` in SQLite; if `synced == 0`, it forces immediate inline session sync. If sync fails, upload confirmation is halted and retried.

#### Fix #3: Ghost Session Prevention & Storage Hardening
- **Root Cause**: `storage.controller.ts` contained auto-provisioning fallback logic that automatically created synthetic companies, branches, and dummy booths (`"Booth Alpha 01"`) whenever an un-synced session arrived.
- **Solution**:
  1. Mandatory `x-device-secret` header check returning HTTP 401 `INVALID_DEVICE` on failure.
  2. Strict session verification in PostgreSQL returning HTTP 409 `SESSION_NOT_FOUND` if the session is absent.
  3. Total removal of dummy fallback entities. Database confirmation failures now throw real HTTP 500 errors.

#### Fix #4: Upload Queue Reliability
- **Root Cause**: Kiosk `SyncEngine.ts` marked uploads `COMPLETED` solely on the HTTP 200/204 response from Cloudflare R2, ignoring backend database registration status.
- **Solution**: Kiosk inspects `confirmRes.ok && confirmData.confirmed === true`. If false, the queue item is flagged `FAILED` and scheduled for exponential backoff retry. No upload is marked `COMPLETED` without explicit cloud confirmation.

---

## 7. PHASE 3: PRODUCTION HARDENING
*Status:* `[PLANNED]`  
*Prerequisites:* Phase 2 Complete & Verified  
*Target Completion:* September 20, 2026  
*Primary Documentation:* `/docs/OPERATOR_RUNBOOK_v2.md`, `/docs/SPRINT_5E_KIOSK_HARDENING_PLAN.md`

### Scope & Technical Specifications

#### 1. Hardware Print Telemetry & Sensor Hooks
- Deep Win32 spooler integration via native PowerShell/WMI scripts to detect:
  - `PRINTER_STATUS_PAPER_JAM`
  - `PRINTER_STATUS_PAPER_OUT`
  - `PRINTER_STATUS_NOT_AVAILABLE` / `PRINTER_STATUS_OFFLINE`
  - Ribbon consumption calculation (prints remaining counter).
- Kiosk UI state interlock: Automatically display an "Out of Paper" maintenance screen and prevent payment acceptance if the physical printer has fewer than 2 prints remaining.

#### 2. Automated Storage Retention & SSD Maintenance
- Background cron worker in Electron running daily at 03:00 AM local time.
- **Rule**: Delete local photos and MP4 files older than 7 days **ONLY IF** `synced == 1` in SQLite and confirmed by PostgreSQL.
- Cloud retention worker in NestJS: Mark softfile assets expired after 30 days; schedule R2 lifecycle cleanup rules.

#### 3. Windows Kiosk OS Lockdown
- Shell replacement: Configure Windows 10/11 to boot directly into `pictolabs-kiosk.exe` instead of `explorer.exe`.
- Hardware key interception: Disable `Alt+Tab`, `Ctrl+Alt+Del`, `Win Key`, `F11`, and right-click context menus via low-level keyboard hooks.
- Watchdog daemon: A lightweight background Node/Rust service monitoring `pictolabs-kiosk.exe`. If the process terminates or freezes for >15 seconds, the watchdog kills and relaunches the kiosk cleanly.
- Power recovery: Windows BIOS set to "Power On After AC Loss" so kiosks automatically resume operation when venue electricity is restored.

---

## 8. PHASE 4: ADMIN DASHBOARD & OBSERVABILITY
*Status:* `[PLANNED / PARTIALLY IMPLEMENTED (65%)]`  
*Target Completion:* September 27, 2026  
*Primary Documentation:* `/docs/SPRINT_5A_DASHBOARD_PRD.md`, `/docs/SPRINT_5B_PRD.md`, `/docs/SPRINT_5C_PRD.md`

### Modules & Completion Status

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               PICTOLABS DASHBOARD                               │
├─────────────────┬─────────────────┬──────────────────────┬──────────────────────┤
│ Overview KPIs   │ Fleet Health    │ Sessions & Ledger    │ Support Operations   │
│ [COMPLETED]     │ [IN PROGRESS]   │ [COMPLETED]          │ [STAGED - 5B]        │
│ • Daily Revenue │ • HTTP Heartbeat│ • Multi-filter table │ • Session Timeline   │
│ • Total Prints  │ • Version Hash  │ • Softfile inspector │ • Re-delivery Portal │
│ • Active Booths │ • Sensor Graphs │ • Strip visualizer   │ • Error Diagnosis    │
├─────────────────┴─────────────────┴──────────────────────┴──────────────────────┤
│ Security & Management Layer [PLANNED - 5C]                                     │
│ • JWT Login Gate & Token Refresh                                                │
│ • Role-Based Access Control (Superadmin, Branch Manager, Operator)             │
│ • Dynamic Remote Configuration (Price, Countdown, Frame Catalog Push)           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 1. Sprint 5A: Dashboard Core (Completed)
- React 18 + Vite 6 + Tailwind CSS v4 responsive operations console.
- Overview KPI metrics: Real-time revenue, completed sessions count, active booth count.
- Booth Fleet Table: Dynamic status pills (`ONLINE`, `DEGRADED`, `OFFLINE`) derived from HTTP heartbeat `last_seen`.
- Sessions Ledger: Comprehensive data grid with date-range filters, payment method filters, and session details modal.

#### 2. Sprint 5B: Support Operations & Re-Delivery (Staged)
- **Support Search**: Find customer sessions by transaction ID, phone number, email, or approximate time window.
- **Session Health Timeline**: Chronological visual audit of every state transition (`SESSION_INIT` $\rightarrow$ `PAYMENT_SETTLED` $\rightarrow$ `CAPTURED` $\rightarrow$ `UPLOADED`).
- **One-Click Remediation Panel**:
  - Re-trigger email/WhatsApp gallery delivery.
  - Extend gallery expiration by 7, 14, or 30 days.
  - Emergency reprint dispatch to on-site physical printer.

#### 3. Sprint 5C: Security & Remote Configuration (Planned)
- JWT Authentication Gate: Protect all dashboard routes behind secure email/password authentication.
- Role-Based Access Control (RBAC):
  - `SUPERADMIN`: Full global access, company management, payout settings.
  - `BRANCH_MANAGER`: Scoped strictly to kiosks within their assigned shopping mall branch.
  - `TECHNICIAN`: Hardware telemetry, restart triggers, and paper status only.
- Dynamic Remote Config: Update kiosk pricing (e.g., IDR 35,000 $\rightarrow$ IDR 40,000), capture countdown timers, and active frame packages from the cloud without touching kiosk hardware.

---

## 9. PHASE 5: UI/UX REDESIGN (STITCH)
*Status:* `[PLANNED]`  
*Prerequisites:* Phase 2 & Phase 3 Core Stability  
*Target Completion:* October 2026

### Scope & Experience Goals
1. **Studio-Grade Touchscreen Flow**:
   - Complete visual redesign of kiosk touch interfaces adopting high-conversion, premium aesthetic standards.
   - Smooth 60 FPS screen transitions with fluid tactile micro-animations.
   - Dynamic sound design: High-quality shutter clicks, countdown voice prompts, and celebratory audio cues.
2. **Inclusive & Internationalized UX**:
   - Multi-language toggle on Welcome Screen: Bahasa Indonesia, English, Japanese, Korean.
   - High-contrast visual mode for accessibility.
   - Camera height adjustment guides on LiveView screen.
3. **Public Mobile Gallery Redesign**:
   - Personalized landing page with customer branding.
   - One-tap Instagram Story and TikTok formatted exports.
   - Interactive Apple Live Photo / Boomerang loop toggle viewer.

---

## 10. PHASE 6: MULTI-BOOTH ECOSYSTEM & FLEET ORCHESTRATION
*Status:* `[PLANNED]`  
*Prerequisites:* Phase 4 Admin Dashboard  
*Target Completion:* November 2026

### Scope & Technical Specifications
1. **Multi-Tenant Hierarchy**:
   - Strict database tenant isolation: `Company` $\rightarrow$ `Branch` $\rightarrow$ `Booth`.
   - Dedicated branding, custom frame catalogs, and pricing rules per branch outlet.
2. **Automated Over-The-Air (OTA) Updates**:
   - Secure Electron auto-updater integration via GitHub Releases or private Cloudflare R2 bucket.
   - Staged canary deployments (deploy update to Booth 01; monitor 24h before deploying to fleet).
   - Instant automated rollback if crash rate exceeds 1% post-update.
3. **Local Network Edge Redundancy**:
   - Peer-to-peer kiosk discovery within the same venue LAN.
   - Shared queue failover: If Kiosk A's printer runs out of paper, customer can scan a QR code at Kiosk B in the same store to print their photo strip without paying again.

---

## 11. PHASE 7: COMMERCIAL BUSINESS FEATURES
*Status:* `[PLANNED]`  
*Prerequisites:* Core Platform Complete  
*Target Completion:* Q1 2027

### Features
1. **Multi-Tier Product Matrix**:
   - Support varied product selections: Classic 2-strip, 4R single postcard, 6R family portrait, and metallic foil print formats.
   - Dynamic price calculation based on layout, number of physical copies (1 to 6 sets), and optional digital add-ons.
2. **Automated WhatsApp Media Gateway**:
   - Integration with WhatsApp Business API / Fonnte / Wablas.
   - Automatically push high-res photos and direct gallery links to customer phone numbers upon session completion.
   - Automated 48-hour expiration reminder message.
3. **Hybrid Payment Hardware**:
   - Integration of physical cash bill acceptors (NV9 USB / CashCode) alongside Midtrans QRIS for locations with high cash preference.
   - Hardware coin hopper for exact change return.
4. **On-Screen Customer Feedback**:
   - 5-star rating and emoji survey on exit screen prior to reset.

---

## 12. PHASE 8: PRODUCTION DEPLOYMENT & CLOUD INFRASTRUCTURE
*Status:* `[PLANNED]`  
*Prerequisites:* Phase 2, Phase 3, Phase 4 Complete  
*Target Completion:* Mid Q1 2027  
*Primary Documentation:* `/docs/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md`, `/docs/DEPLOYMENT_PLAN.md`

### Target Production Architecture
- **Cloud Infrastructure**:
  - Cloud VPS (Ubuntu 24.04 LTS, 8 vCPU, 16GB RAM, SSD NVMe).
  - Production Docker Compose: NestJS API, PostgreSQL 16, Redis 7, Nginx Reverse Proxy.
  - Automated database Point-In-Time-Recovery (PITR) with encrypted daily off-site dumps to AWS S3 / Cloudflare R2.
- **Edge Security & Networking**:
  - SSL/TLS termination via Let's Encrypt / Cloudflare SSL.
  - Cloudflare Web Application Firewall (WAF) and DDoS protection.
  - API rate limiting: 100 req/min for public endpoints; strict secret-based authentication for kiosk sync routes.
- **Production Merchant Transition**:
  - Migration from Midtrans Sandbox to Production Live Merchant Account with production server/client keys.
  - Direct QRIS settlement into corporate bank account.

---

## 13. PHASE 9: PILOT LAUNCH & COMMERCIAL ROLLOUT
*Status:* `[PLANNED]`  
*Target Completion:* Late Q1 2027  
*Primary Documentation:* `/docs/OPERATOR_RUNBOOK_v2.md`

### Execution Steps
1. **Pilot Booth #1 Deployment**:
   - Physical deployment at selected high-traffic flagship outlet (e.g. Grand Indonesia West Mall, Jakarta).
   - Complete 72-hour continuous burn-in load test under live retail conditions (minimum 500 paid sessions).
2. **Operational Handover**:
   - On-site training of mall store staff and field maintenance technicians using `OPERATOR_RUNBOOK_v2.md`.
   - Emergency escalation protocol drills (power cut drill, paper jam drill, network outage drill).
3. **Fleet Scale-Out**:
   - Sequential rollout to remaining commercial booths across national shopping mall network.

---

## 14. FUTURE PRODUCT VISION (LONG-TERM STRATEGIC BACKLOG)

> [!NOTE]
> This section captures strategic product concepts intended for exploration **after** the core commercial platform is fully deployed and self-sustaining. Technical specifications and architecture designs are intentionally deferred.

* **Membership & User Accounts**: Customer single sign-on (SSO), profile photo history, and lifetime photostrip collection.
* **Loyalty & Rewards Program**: "Snap 5 sessions, get 1 free", digital stamps, tier-based member perks.
* **Advanced Voucher & Promo Engine**: Influencer promo codes, mall co-branding discount vouchers, dynamic surge/off-peak pricing.
* **Event & Pop-Up Package Mode**: Special kiosk operating mode for private weddings, birthday parties, and corporate events (unlimited free play, custom event branding, guestbook printing).
* **AI Creative Features**:
  - AI Background Replacement (virtual Tokyo streets, vintage studio backdrops).
  - AI Beauty & Skin Radiance Filters.
  - Generative Anime / Comic / 90s Vintage style transfer.
  - AI Group Lighting Auto-Balancing.
* **Advanced BI & Analytics**: Customer dwell time, peak hour footfall analytics, demographic heatmaps (anonymized age/gender estimation via camera sensor).
* **Franchise & Investor Portal**: Automated revenue sharing calculation, real-time royalty disbursement, investor ROI dashboards.
* **Centralized Network Operations Center (NOC)**: Live video feed monitoring of kiosk exteriors, remote desktop intervention, automated hardware failure ticketing.
* **Multi-Tenant Whitelabel Platform (SaaS)**: Enabling independent photobooth operators to license Pictolabs OS for their own custom hardware.
* **Customer Mobile App (iOS / Android)**: Direct cloud photobooth companion app, AR filter preview, nearby booth locator with live queue times.
* **Corporate B2B Dashboard**: Custom portal for corporate clients to rent booths, design custom frame overlays, and capture opted-in marketing leads.
* **Direct Social Integrations**: Instant direct-to-TikTok video posting, Instagram Reels export with trending audio overlays.

---

## 15. CONSOLIDATED DOCUMENTATION INDEX

This master roadmap synthesizes and supersedes the following 20 core documentation artifacts in the `/docs` registry:

| Document File | Original Purpose | Consolidated Value in Roadmap |
|:---|:---|:---|
| `MASTER_PROJECT_STATUS.md` | Initial project status & feature matrix | Foundational inventory for Phase 0 & Phase 1 |
| `PICTOLABS_MASTER_BLUEPRINT.md` | Master engineering blueprint | Operational tenants & hardware specs |
| `PICTOLABS_PLATFORM_ARCHITECTURE.md` | Edge-cloud architecture specification | Domain model & entity relationships |
| `PROJECT_STATUS_AUDIT.md` | Definitive project audit (Sept 10, 2026) | Baseline percentage completion & sprint audit |
| `PROJECT_STATUS_REPORT.md` | Executive management summary | Timeline history & commercial scope |
| `2026-09-10_PHASE_2_COMPLETION.md` | Phase 2 data integrity checkpoint | Technical definitions of Fix #1, #2, #3, #4 |
| `HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`| Fleet liveness architectural decision | HTTP heartbeat policy in Phase 1 & 4 |
| `SPRINT_5A_DASHBOARD_PRD.md` | Dashboard foundation requirements | Feature scope for Phase 4 (Sprint 5A) |
| `SPRINT_5A_IMPLEMENTATION_REPORT.md` | Dashboard implementation audit | Verification data for Phase 4 KPIs |
| `SPRINT_5B_PRD.md` | Support observability & remediation PRD | Support Search & Timeline in Phase 4 |
| `SPRINT_5B_GAP_ANALYSIS.md` | Support tooling gap review | Remediation workflows in Phase 4 |
| `SPRINT_5B_CLOSURE_PLAN.md` | Sprint 5B execution roadmap | Transition gates between Phase 2 & Phase 4 |
| `SPRINT_5C_PRD.md` | Security & dynamic config PRD | JWT, RBAC & Remote Config in Phase 4 |
| `SPRINT_5E_KIOSK_HARDENING_PLAN.md` | Kiosk resilience and lockdown | Technical specs for Phase 3 Hardening |
| `DEPLOYMENT_READINESS_REPORT.md` | Production deployment checklist | Baseline criteria for Phase 8 |
| `FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md`| Step-by-step production rollout guide | DevOps runbook for Phase 8 |
| `OPERATOR_RUNBOOK.md` | Field technician manual (v1) | Legacy operational procedures |
| `OPERATOR_RUNBOOK_v2.md` | Production operator runbook (v2) | Operational protocols for Phase 3 & 9 |
| `R2_INTEGRATION_REPORT.md` | Cloudflare R2 technical verification | S3 pipeline specs for Phase 1 & 2 |
| `MIDTRANS_INTEGRATION_STATUS_REPORT.md`| Payment engine audit | QRIS transaction rules for Phase 1 |

---

## 16. GAP ANALYSIS & ARCHITECTURAL BLIND SPOTS

Through the consolidation of project artifacts, five critical architectural blind spots were identified that must be addressed:

### Gap 1: In-Flight Power Failure Session Recovery
- *The Blind Spot*: If venue electricity is cut while a customer is actively taking photos (between Pose 2 and Pose 3), the payment is already settled in Midtrans/PostgreSQL, but local SQLite files are incomplete.
- *Remediation Plan (Phase 3)*: Implement a crash-recovery ledger in SQLite. On kiosk reboot, if an unfinished paid session is detected, the kiosk prompts: "A previous session was interrupted. Would you like to resume your photos?" or automatically issues a reprint voucher.

### Gap 2: Persistent Offline Queue Survival Across App Restarts
- *The Blind Spot*: While `upload_queue` resides in SQLite, in-memory retry counters previously reset to zero on Electron reload, potentially allowing failing items to loop infinitely without escalating.
- *Remediation Plan (Phase 2/3)*: Enforce persistent `attempts` and `last_error` columns directly in SQLite, with an absolute maximum retry ceiling of 10 attempts before flagging `PERMANENT_FAILURE` and emitting an alert.

### Gap 3: Physical Low-Paper Interlock
- *The Blind Spot*: The kiosk currently allows a customer to pay via QRIS even if the printer has zero sheets left, forcing awkward manual refunds.
- *Remediation Plan (Phase 3)*: The Kiosk Welcome Screen must actively poll printer sheet counters. If counter $\le 2$, the screen disables "Start" and displays "Out of Service: Replenishing Paper".

### Gap 4: Safe SSD Auto-Purge Verification
- *The Blind Spot*: Local disk purge scripts must never rely on local timestamps alone. If cloud sync is lagging, purging by date could delete un-uploaded original photos.
- *Remediation Plan (Phase 3)*: Local deletion requires a two-key lock: `(createdAt < NOW() - 7 days) AND (synced == 1) AND (cloudKeyVerified == 1)`.

### Gap 5: Unified Environment Configuration Schema
- *The Blind Spot*: Environment variable naming across Kiosk (`VITE_API_URL`, `API_BASE_URL`) and Backend (`PORT`, `DATABASE_URL`) had slight naming discrepancies in sample files.
- *Remediation Plan (Phase 8)*: Standardize all configuration files using a single root `.env.example` with strict TypeScript validation (`zod`/`joi`) at process boot.

---

## 17. RECOMMENDED NEXT WORK SEQUENCE

To adhere strictly to the **Core-First Development Policy**, execution must proceed in the following exact sequence:

```
[CURRENT STEP]
      │
      ▼
STEP 1: CLOSE PHASE 2 (DATA INTEGRITY)
      • Review & sign off git diff for Fix #1, Fix #2, Fix #3, Fix #4.
      • Run Phase 2 full regression test suite (11/11 passing).
      • Commit and tag: `git tag -a v0.9.2-phase2-integrity -m "Phase 2 Complete"`.
      │
      ▼
STEP 2: EXECUTE PHASE 3 (PRODUCTION HARDENING)
      • Implement Win32 printer sensor hooks (paper jam / paper out detection).
      • Build safe 7-day local storage cleanup worker.
      • Configure Windows Kiosk OS lockdown and auto-restart watchdog.
      │
      ▼
STEP 3: COMPLETE PHASE 4 (DASHBOARD & OPERATIONAL CONTROL)
      • Deploy Sprint 5B Support Operations & Re-delivery panel.
      • Implement Sprint 5C JWT Auth Gate & Role-Based Access Control (RBAC).
      • Connect dynamic remote pricing and frame configuration.
      │
      ▼
STEP 4: EXECUTE PHASE 8 (PRODUCTION DEPLOYMENT)
      • Provision Cloud VPS, Docker Compose stack, domain SSL, and Midtrans Live keys.
      • Execute 72-hour burn-in stress test.
      │
      ▼
STEP 5: LAUNCH PHASE 9 (COMMERCIAL PILOT #1)
      • Hand over to field operators; initiate commercial operations at Flagship Mall.
```

---
*End of Master Project Roadmap. This document serves as the sole guiding beacon for all current and future engineering activities on the Pictolabs platform.*
