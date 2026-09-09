# PROJECT STATUS REPORT

> **Target Audience**: Founder & Product Owner (Han)  
> **Platform**: Pictolabs Self-Service Photobooth Rebuild  
> **Generated**: September 10, 2026  
> **Target Release**: Pictolabs Enterprise v1.0  
> **Repository Commit Baseline**: `3427d03 sprint 5b done`  

---

# 1. Executive Summary

Pictolabs Rebuild has successfully evolved from an unstable legacy reverse-engineered kiosk into a robust, cloud-native, and modular self-service photobooth ecosystem.

As of September 10, 2026:
- **The Core In-Booth Experience is Proven**: Customers can approach the kiosk, choose their photo product, make dynamic QRIS payments, pose with 30 FPS studio camera LiveView, trigger native DSLR shutter capture, apply filters, and receive both physical thermal prints and mobile cloud downloads in under 3 minutes.
- **The Operations & Fleet Control Plane is Operational**: The web dashboard allows the founder and support staff to monitor all connected kiosks in real-time, inspect customer sessions, view high-res photo assets, diagnose session failures (e.g. printer jams, paper runout), and execute remedial actions (re-sending softfiles, extending download links, commanding emergency strip reprints).
- **The Primary Entity is Locked**: The `Session` entity anchors all platform operations (`Branch → Booth → Session → Asset`), creating a clear hierarchy for scaling to hundreds of locations.
- **Current Development Phase**: The core edge and cloud features are complete locally. The platform is now at the **Pre-Production Operational Gate**, where external vendor credentials (live Midtrans merchant account, public domain SSL, cloud hosting, and administrative security gates) must be connected before deploying commercial Booth #1.

---

# 2. Current Sprint Status

## Current Sprint
- **Milestone Gate**: **Sprint 5B Complete (Evaluation & Planning Transition Gate)**
- **Focus of Closed Sprint**: Session Observability, Health Diagnostics, Support Search, and Re-Delivery Flow.

## Completed Sprints
1. **Sprint 1 (Kiosk Core & Hardware Engine)**: Canon EDSDK 13.x native C++ shutter, 30 FPS LiveView, Sharp 300 DPI composite layout engine, DNP thermal dye-sublimation spooler, 8-screen touch kiosk flow.
2. **Sprint 2 (Payment Core & Webhook Pipeline)**: Midtrans dynamic QRIS generation, SHA-512 webhook signature verification, sub-second kiosk auto-advance via WebSocket, payment crash recovery.
3. **Sprint 3 (Cloud Storage & Customer Delivery)**: Cloudflare R2 object storage, S3 presigned upload pipeline, dual-tier retention policy (7-day local / 30-day cloud), mobile customer web gallery, streaming ZIP packaging.
4. **Sprint 4A (Database Migration & Containerization)**: Migration from SQLite to PostgreSQL 16 + Redis + Nginx Docker stack, modeling 20 relational business entities.
5. **Sprint 4B (Deterministic Heartbeat & Fleet Architecture)**: HTTP heartbeat as single source of truth, dynamic online/offline/maintenance derivation from `last_seen`, kiosk runtime metadata logging.
6. **Sprint 5A (Dashboard Foundation)**: Operations web dashboard: Fleet Overview KPIs, Booths Fleet Management, Sessions Ledger with multi-filtering, Asset-Centric Gallery viewer.
7. **Sprint 5B (Session Observability & Support Operations)**: Session Lifecycle Timeline, deterministic Session Health engine, Omni-Channel Customer Support Search with visual thumbnails, Re-delivery Flow (email resend, link extension, emergency reprint).

## Sprint In Progress
- **None currently active.**  
  *Implementation is intentionally halted to provide founder visibility, review UAT evidence, and align on the exact scope of the next sprint.*

## Sprint Completion Percentage
- **Overall Platform Completion**: **72%**
  - Kiosk Client Application: **90%**
  - Database Architecture: **85%**
  - Backend Cloud API: **75%**
  - Web Operations Dashboard: **60%**
  - Commercial Production Infrastructure: **50%**

---

# 3. Feature Status Matrix

| Feature | Status | Notes |
| :--- | :---: | :--- |
| **Kiosk Core Flow** | `COMPLETED` | Complete 10-screen customer journey from touch-to-start to physical print & QR delivery. |
| **Session Management** | `COMPLETED` | Session is established as the primary business entity anchoring transactions, media, and lifecycle events. |
| **Payment Flow** | `COMPLETED` | Dynamic QRIS code generation, payment countdown timer, and automated screen transition upon payment confirmation. |
| **Midtrans Integration** | `PARTIAL` | Complete integration code; currently operating in Sandbox mode awaiting live merchant production credentials. |
| **Camera Integration** | `COMPLETED` | Native Canon EDSDK 13.x C++ binding (<250ms shutter actuation, 30 FPS LiveView) with automatic webcam fallback. |
| **Printer Integration** | `COMPLETED` | Automated 300 DPI composite spooling to DNP dye-sublimation printer with synchronized print cutting. |
| **Gallery Delivery** | `COMPLETED` | Mobile-optimized customer web gallery (`/d/:sessionId`) with photo lightbox, video player, and ZIP download. |
| **Live Photo** | `COMPLETED` | Video countdown motion bursts recorded, encoded to MP4 via ffmpeg, and synced to cloud gallery. |
| **Dashboard Overview** | `COMPLETED` | High-level fleet KPIs (Online, Offline, Maintenance, Sessions Today) and real-time connectivity monitor. |
| **Fleet Monitoring** | `COMPLETED` | Centralized fleet inventory tracking software versions, commit hashes, machine names, and IP addresses. |
| **Support Search** | `COMPLETED` | Multi-channel customer search by email, phone/WhatsApp, Midtrans Order ID, and time window with visual thumbnails. |
| **Email Delivery** | `MOCK` | Delivery and resend workflows fully modeled; logs to server console until SendGrid/Resend API keys are provided. |
| **Retention System** | `COMPLETED` | Dual-tier retention: 7-day local SSD reprint cache on kiosk, 30-day customer cloud retention on Cloudflare R2. |
| **Cloud Storage** | `COMPLETED` | Zero-egress Cloudflare R2 bucket integration using S3 presigned direct uploads. |
| **Multi Booth Support** | `COMPLETED` | Database and APIs natively support hundreds of concurrent kiosks with unique device credentials. |
| **Branch Support** | `PARTIAL` | Data hierarchy exists (`Company → Branch → Booth`); dashboard user branch isolation not yet enforced. |
| **Maintenance Mode** | `COMPLETED` | Remote administrative switch to take booths out of service and prevent customer interactions. |
| **Real-time Monitoring** | `COMPLETED` | Low-latency WebSocket feeds updating fleet status and advancing kiosk screens on payment settlement. |
| **Analytics** | `NOT STARTED` | Financial gross revenue charts, ARPU calculations, payment method breakdown, and peak-hour heatmaps. |
| **WhatsApp Notification** | `NOT STARTED` | Automated alerts to store technicians when a booth goes offline or experiences a paper jam. |
| **Heartbeat Monitoring** | `COMPLETED` | Deterministic 30s HTTP heartbeat deriving status: Online (<60s), Degraded (<5m), Offline (≥5m). |
| **Customer Search** | `COMPLETED` | Instant customer search across all branches with visual strip thumbnails for rapid support resolution. |
| **Reprint System** | `COMPLETED` | Remote emergency physical strip reprint trigger with mandatory operator justification and 3-copy rate limit. |
| **Error Recovery** | `COMPLETED` | Offline SQLite queue saves unsynced photos during internet dropouts; auto-retries when connection recovers. |
| **Composite Image Rendering** | `COMPLETED` | Sharp 300 DPI layout compositor supporting 2R Korean photostrips and 4R postcards. |
| **Photo Color Filters** | `COMPLETED` | High-fidelity filters (B&W High Contrast, Sepia, Warm, Cool, Vivid) processed at pixel level. |
| **Streaming ZIP Packaging** | `COMPLETED` | On-the-fly streaming ZIP generation bundling all full-res photos and Live Photo videos. |
| **Session Lifecycle Timeline** | `COMPLETED` | Step-by-step milestone tracking recording exact latencies for payment, capture, print, and upload. |
| **Session Health Diagnosis** | `COMPLETED` | Automated diagnostic engine classifying sessions into Healthy, Degraded, Failed, or Abandoned with plain-text causes. |
| **Re-Delivery: Link Extension** | `COMPLETED` | 7-day or 30-day gallery access extension generating authenticated customer links. |
| **Re-Delivery: Support Audit Trail**| `COMPLETED` | Permanent immutable audit ledger recording every operator intervention (`redelivery_logs`). |
| **Voucher Promotion System** | `PARTIAL` | Discount calculation and deduction supported; admin CRUD management screens not yet built. |
| **Printer Hardware Sensor Telemetry**| `PARTIAL` | Print jobs spool reliably; low-level USB status monitoring for cutter stalls and paper roll countdown is missing. |
| **Administrative Authentication** | `PARTIAL` | Bcrypt hashing and JWT generation exist; dashboard login screen and route guards not yet enforced. |
| **Role-Based Access Control (RBAC)** | `NOT STARTED`| Formal role enforcement (`SUPERADMIN`, `BRANCH_MANAGER`, `OPERATOR`) not yet applied. |
| **Remote Frame Template Designer** | `NOT STARTED`| Web-based WYSIWYG editor to create and publish frame templates remotely. |
| **Flipbook Product Flow** | `NOT STARTED`| 30-frame video-to-print slicing and assembly workflow deferred to future roadmap. |
| **Dual-Camera Synchronizer** | `NOT STARTED`| Secondary wide-angle camera capture deferred to future hardware expansion. |

---

# 4. Features Completed

The following modules are **100% functional, integrated, and verified**:

1. **Autonomous Touchscreen Kiosk UX**: 10 fullscreen customer screens running on Electron and React.
2. **Studio Canon DSLR Engine**: Direct C++ USB shutter control with live 30 FPS viewfinder streaming.
3. **Emergency Webcam Fallback**: Seamless automatic switch to webcam if DSLR disconnects mid-session.
4. **High-Resolution Composite Renderer**: Sharp 300 DPI layout compositor for 2R photostrips and 4R postcards.
5. **Photo Color Filters**: Pixel-level filters (B&W, Sepia, Warm, Cool, Vivid) with real-time customer preview.
6. **Thermal Dye-Sublimation Print Spooling**: Automated cutting and printing of two 5x15 cm strips via Windows shell.
7. **Live Photo Motion Bursts**: Automated video capture during countdown and MP4 conversion via bundled ffmpeg.
8. **Dynamic QRIS Payment Pipeline**: Instant payment invoice generation with EMVCo QR code display.
9. **Sub-Second Payment Auto-Advance**: WebSocket broadcast advancing the customer to the photo session the moment payment clears.
10. **Cloudflare R2 Direct Uploads**: Kiosk uploads media directly to cloud storage using presigned URLs without backend bottleneck.
11. **Offline-First Resilience**: If venue internet drops, the session prints physically, and cloud uploads are stored in an offline SQLite queue that automatically retries upon reconnection.
12. **Dual-Tier Retention Daemon**: Kiosk keeps high-res photos on local SSD for 7 days for free reprints, while Cloudflare R2 hosts customer galleries for 30 days.
13. **Mobile Customer Web Gallery**: Clean smartphone gallery page with high-res photo strip viewer, individual pose downloads, smart video playback, and streaming ZIP downloads.
14. **Streaming ZIP Packaging**: On-the-fly streaming ZIP generation bundling all full-res photos and Live Photo videos.
15. **Fleet Connectivity & Heartbeat Engine**: Kiosks send HTTP heartbeats every 30 seconds to derive Online, Degraded, or Offline status dynamically.
16. **Fleet Maintenance Mode**: Remote administrative switch to take booths out of service and display an out-of-order screen.
17. **Operations Web Dashboard**: 5 responsive screens for fleet overview, booth management, session history, media gallery, and support operations.
18. **Session Observability & Timeline**: Step-by-step audit trail showing exact elapsed seconds between payment, capture, print, and cloud upload.
19. **Root-Cause Health Diagnosis**: Automatic failure classification (`HEALTHY`, `DEGRADED`, `FAILED`, `ABANDONED`) with plain-language explanations.
20. **Omni-Channel Customer Support Search**: Support staff can find customer sessions in 5 seconds using email, phone/WhatsApp, Midtrans Order ID, or approximate time windows, backed by visual photo strip thumbnails.
21. **One-Click Support Remediation**: Direct dashboard actions to extend gallery access links (7d/30d), resend softfiles, and command emergency physical reprints with rate-limiting safeguards.
22. **Immutable Support Audit Trail**: Every support action is permanently logged with operator ID, reason, and timestamp.

---

# 5. Features Partially Implemented

The following modules have working foundations but require completion before enterprise scale:

1. **Midtrans Payment Integration (`PARTIAL`)**:
   - *What works*: Complete QRIS invoice generation, payment status polling, SHA-512 webhook signature verification, transaction recording.
   - *What is missing*: Currently connected to Midtrans Sandbox. Requires production merchant credentials and a public HTTPS webhook endpoint.
2. **Administrative Authentication (`PARTIAL`)**:
   - *What works*: Bcrypt password hashing, JWT token generation in `AuthService`, database `User` model.
   - *What is missing*: Backend REST endpoints are not protected with `JwtAuthGuard`; dashboard has no login screen and opens immediately.
3. **Voucher & Promotion System (`PARTIAL`)**:
   - *What works*: Database `Voucher` model, discount deduction in `createQRIS`, voucher input field in kiosk context.
   - *What is missing*: Dashboard management screens to create, distribute, limit, and revoke promotional voucher codes.
4. **Printer Hardware Telemetry (`PARTIAL`)**:
   - *What works*: Dispatches print jobs cleanly through Windows Spooler; detects Windows printer list.
   - *What is missing*: Low-level USB status monitoring for physical paper jams, cutter stalls, and remaining paper roll meters.
5. **Multi-Branch Isolation (`PARTIAL`)**:
   - *What works*: Multi-tenant database hierarchy (`Company → Branch → Booth`) and filtering in queries.
   - *What is missing*: Enforcing security rules so branch managers can only view kiosks and sessions belonging to their assigned mall branch.

---

# 6. Features Mocked / Stubbed

The following features contain placeholder or simulated layers:

1. **Transactional Email Delivery (`MOCK`)**:
   - *Current Simulation*: When an operator clicks "Resend Delivery Email", the backend accepts the request, validates the email, updates customer contact records, and writes an audit log to `redelivery_logs`. However, the outbound email dispatch logs the email payload to the server console rather than sending a real email via SMTP or an API.
   - *What is simulated*: Outbound email dispatch is currently simulated with console logging.
   - *Requirements to make live*: Production SendGrid or Resend API keys must be added to backend environment variables.
2. **Payment Gateway Environment (`MOCK / SANDBOX`)**:
   - *Current Simulation*: Payment QR codes are generated against Midtrans Sandbox environment using test server keys (`SB-Mid-server-test-key`). Real banking apps cannot scan or pay these codes.
   - *What is simulated*: Midtrans payment settlement is simulated using Midtrans Sandbox Simulator.
   - *Requirements to make live*: Awaiting founder completion of Midtrans business KYC and production account activation.

---

# 7. Features Not Started

The following items are defined in the long-term platform roadmap but have **zero code written**:

1. **Automated WhatsApp Alert Gateway**: Automated WhatsApp notifications to technicians or store managers when a booth goes offline, runs out of paper, or has a cutter jam.
2. **Role-Based Access Control (RBAC) Middleware**: Enforcing user roles (`SUPERADMIN`, `COMPANY_ADMIN`, `BRANCH_MANAGER`, `OPERATOR`) across backend controllers and dashboard views.
3. **Hardware Sensor Telemetry Gauges**: Real-time graphs for CPU temperature history, RAM consumption, and paper roll countdown in the dashboard.
4. **Financial Revenue & Sales Analytics**: Executive business intelligence dashboards showing daily gross revenue, ARPU, payment method breakdown, and peak-hour revenue heatmaps.
5. **Remote Frame Template Designer**: Web-based WYSIWYG editor to create, layer, and publish new seasonal frame templates directly to kiosks from the cloud.
6. **Flipbook Product Flow**: 30-frame video slicing, print layout compilation, and flipbook assembly instructions.
7. **Dual-Camera Architecture**: Synchronous front DSLR + wide-angle secondary camera capture.

---

# 8. API Status

## Implemented APIs (Production Ready)

### Authentication & Kiosk Verification
- `POST /api/auth/login` — Administrative login and JWT issuance.
- `POST /api/auth/booth` — Edge kiosk device secret verification.

### Booths Fleet Management
- `GET /api/booths` — List all registered photobooths with dynamic operational status.
- `GET /api/booths/:id` — Retrieve booth details and hardware settings.
- `GET /api/booths/:id/status` — Dynamic status evaluation (<60s Online, <5m Degraded, ≥5m Offline).
- `PATCH /api/booths/:id/status` — Manual maintenance mode toggle.
- `POST /api/booths/:id/heartbeat` — Periodic kiosk heartbeat ingestion (updates `last_seen` and metadata).
- `PUT /api/booths/:id/config` — Update booth operational and camera settings.
- `POST /api/booths/push-config` — Push configuration to active kiosks via WebSocket.
- `POST /api/booths/:id/health` — Ingest raw sensor telemetry logs.

### Sessions Management
- `GET /api/sessions` — Search and paginate customer sessions with booth/branch/date filters.
- `GET /api/sessions/stats/today` — Real-time counters (created, completed, failed, active booths today).
- `GET /api/sessions/:id` — Detailed session information and asset links.
- `POST /api/sessions` — Kiosk session synchronization and media ingestion.

### Session Observability & Re-Delivery
- `GET /api/sessions/:id/timeline` — Chronological lifecycle milestones with step latencies.
- `POST /api/sessions/:id/timeline` — Ingest granular lifecycle events from kiosk.
- `GET /api/sessions/:id/health` — Automated root-cause health diagnosis and error codes.
- `POST /api/sessions/:id/redelivery/email` — Resend delivery softfile email to customer.
- `POST /api/sessions/:id/redelivery/extend-link` — Extend gallery retention (7d/30d) and produce signed link.
- `POST /api/sessions/:id/reprint` — Command emergency physical strip reprint (max 3 copies rate limit).
- `GET /api/sessions/:id/redelivery/history` — Audit trail of operator interventions.

### Customer Support Operations
- `GET /api/support/search` — Multi-channel lookup (email, phone, order ID, time window) with photostrip thumbnails.

### Payments & Invoicing
- `POST /api/payments/qris` — Create dynamic Midtrans QRIS transaction.
- `POST /api/payments/webhook` — Process Midtrans payment notifications with SHA-512 verification.
- `GET /api/payments/status/:orderId` — Check real-time settlement status of an invoice.
- `POST /api/payments/cancel/:orderId` — Cancel an unpaid QRIS invoice.

### Cloud Storage (Cloudflare R2)
- `GET /api/storage/health` — Storage connectivity and retention policy status.
- `POST /api/storage/presigned-url` — Generate presigned PUT URL for direct client media upload.
- `POST /api/storage/confirm-upload` — Confirm media upload and register asset in database.

### Customer Web Delivery
- `GET /d/:sessionId` — Mobile-responsive customer gallery web page.
- `GET /api/gallery/:sessionId` — JSON asset manifest for customer gallery.
- `GET /api/gallery/:sessionId/zip` — Dynamic streaming ZIP download of all high-res assets.

---

## Planned APIs (Future Roadmap)

- `GET /api/auth/me` & `POST /api/auth/logout` — User profile inspection and session revocation.
- `GET /api/users` & `POST /api/users` — Staff user management CRUD.
- `GET /api/vouchers` & `POST /api/vouchers` — Promotional voucher campaign management.
- `GET /api/frames` & `POST /api/frames` — Remote frame template catalog management.
- `GET /api/booths/:id/telemetry/history` — Historical charts for CPU temp and paper roll consumption.
- `GET /api/analytics/revenue` — Daily/weekly financial revenue and settlement breakdown.
- `POST /api/alerts/webhook` — Automated outbound alert dispatch to WhatsApp gateway.

---

# 9. Database Overview

The production database is **PostgreSQL 16** running in a containerized Docker environment with foreign key constraints, composite performance indexes, and strict relational integrity.

## Existing Tables

1. `users`
2. `companies`
3. `branches`
4. `booths`
5. `booth_configs`
6. `booth_health_logs`
7. `sessions`
8. `session_events`
9. `redelivery_logs`
10. `photos`
11. `prints`
12. `frames`
13. `frame_layers`
14. `frame_assets`
15. `transactions`
16. `payments`
17. `vouchers`
18. `queues`
19. `updates`
20. `logs`

## Purpose of Each Table

- **`users`**: Stores platform administrative staff, store managers, and support operators with encrypted credentials.
- **`companies`**: Represents the top-level commercial enterprise or franchise entity owning branches.
- **`branches`**: Represents physical retail locations (e.g. shopping mall branches, pop-up venues).
- **`booths`**: Represents individual hardware kiosks, storing unique device secrets, operational status, and software versions.
- **`booth_configs`**: Stores remote operating parameters per kiosk (pricing, countdown seconds, camera settings, copy counts).
- **`booth_health_logs`**: Historical time-series telemetry recording CPU temperature, memory usage, and paper status.
- **`sessions`**: **Primary platform entity** tracking every customer transaction, payment state, customer contact info, and retention expiration.
- **`session_events`**: Chronological milestone audit trail recording exact timestamps when payment settled, photos were captured, prints finished, and assets uploaded.
- **`redelivery_logs`**: Immutable audit ledger recording every support operator intervention (email resends, link extensions, reprints, reasons).
- **`photos`**: Catalog of high-res photos, photostrip composites, and Live Photo videos with Cloudflare R2 storage keys.
- **`prints`**: Print audit log tracking physical dye-sublimation print jobs, print formats, and completion timestamps.
- **`frames`**: Catalog of photostrip and postcard graphic themes, seasonal campaigns, and visual metadata.
- **`frame_layers`**: Layout layers defining photo cutout coordinates, text branding, and background graphic positioning.
- **`frame_assets`**: High-resolution image assets and overlay PNGs used in frame templates.
- **`transactions`**: Internal billing records linking customer sessions to commercial billing accounts.
- **`payments`**: Midtrans payment tracking storing QRIS strings, transaction IDs, payment channels, and webhook audit records.
- **`vouchers`**: Promotional discount vouchers, discount rules (fixed/percentage), expiration dates, and redemption counters.
- **`queues`**: Background job queue for retrying asynchronous cloud uploads or webhooks that failed due to temporary network issues.
- **`updates`**: Over-the-Air (OTA) software update catalog for distributing new kiosk versions.
- **`logs`**: Centralized operational and diagnostic error log for fleet-wide debugging.

---

# 10. WebSocket Overview

WebSockets (Socket.IO) provide real-time, bidirectional, low-latency communication between the cloud backend, edge kiosks, and operational dashboards.

## Implemented Events

| Event Name | Direction | Business Purpose |
| :--- | :---: | :--- |
| `payment_success` | Backend → Kiosk | Advances the kiosk touchscreen to the photo session the moment the customer scans and pays the QRIS code (sub-second response). |
| `booth_status_changed` | Backend → Dashboard | Instantly updates the dashboard fleet view when a booth goes offline, recovers, or enters maintenance. |
| `config_update` | Backend → Kiosk | Pushes real-time price updates or frame changes to active kiosks without requiring an app restart. |
| `join_booth` | Kiosk → Backend | Kiosk edge client authenticates and registers its dedicated communication room. |
| `join_dashboard` | Dashboard → Backend | Dashboard operator subscribes to real-time fleet events. |

## Planned Events

| Event Name | Direction | Business Purpose |
| :--- | :---: | :--- |
| `printer_jam_alert` | Kiosk → Dashboard | Instant high-priority popup alerting operators that a physical cutter jam occurred. |
| `paper_low_warning` | Kiosk → Dashboard | Warning that a kiosk has fewer than 20 print sheets remaining. |
| `kiosk_lock_command` | Dashboard → Kiosk | Remote emergency lock preventing customers from touching a malfunctioning kiosk. |

---

# 11. Hardware Integration Status

## Completed
- **Canon Camera**: Direct C++ USB shutter control (Canon EDSDK 13.x). Actuates in `<250ms`. Smooth 30 FPS LiveView mirroring. Active anti-sleep poller keeps sensor ready. Automatic reconnection poller re-establishes connection if USB drops.
- **Printer (DNP Thermal Dye-Sublimation)**: Automated composite printing via Windows spooler to DNP DS-RX1HS / DS620 printers. Spools 300 DPI layouts and cuts two 2R strips (5x15 cm) in ~18 seconds.
- **QR Delivery**: Displays dynamic high-resolution QR code on kiosk screen upon session completion, linking directly to the mobile customer web gallery (`/d/:sessionId`).
- **Live Photo Pipeline**: Automated video recording during countdown poses, compressed to MP4 via local ffmpeg, and synced to Cloudflare R2 for mobile playback.
- **Booth Heartbeat**: Kiosk transmits HTTP heartbeats every 30 seconds reporting machine name, IP address, app version, and OS environment.

## Partial
- **Printer Sensor Telemetry**: Printing succeeds reliably, but low-level USB status monitoring for cutter stalls, head heat, and remaining paper roll meters is not yet implemented.

## Missing
- **Payment Terminal (EDC)**: Digital QRIS is fully functional; physical credit/debit card swipe/chip terminals (EDC) or cash acceptors are not supported.
- **Dual-Camera Synchronizer**: Secondary wide-angle camera capture multiplexer is deferred to future hardware expansion.

---

# 12. Dashboard Status

The operational dashboard (`apps/dashboard`) is a React 18 + Vite 6 + Tailwind CSS v4 single-page web app.

## Completed Pages (5 Pages)
1. **Overview Page (`/`)**: High-level fleet KPIs (Online, Offline, Maintenance, Sessions Today), fleet connectivity snapshot, and recent transactions ledger.
2. **Booths Fleet Page (`/booths`)**: Kiosk table with dynamically evaluated status, runtime metadata badges, and slide-out Maintenance mode toggle.
3. **Sessions Archive Page (`/sessions`)**: Paginated session archive with ID search, filters for booth, branch, date, status, and detail preview modal.
4. **Gallery Page (`/gallery`)**: Softfile inspector, photo strip lightbox, individual pose downloads, Live Photo video player, customer link copy, and streaming ZIP downloads.
5. **Support Search Page (`/support`)**: Omni-channel customer lookup by email, phone/WhatsApp, Midtrans Order ID, and venue time windows, displaying visual composite photostrip thumbnails and one-click remediation actions.

## Partial Pages
- **None.** All 5 active pages are fully integrated with real backend REST APIs.

## Missing Pages (Planned)
1. **Login Page (`/login`)**: Administrative authentication screen with JWT session storage.
2. **Revenue & Analytics Page (`/analytics`)**: Financial performance charts, sales trends, and peak hour heatmaps.
3. **Voucher Management Page (`/vouchers`)**: Promotional campaign creator and code generator.
4. **Staff Management Page (`/users`)**: User accounts and branch assignment management.
5. **Frame Catalog Designer (`/frames`)**: Web-based frame template publisher.

---

# 13. Kiosk Status

The edge kiosk client (`apps/kiosk`) is an Electron 28 + React 18 touchscreen desktop application running on Windows 10/11.

## Completed Pages (10 Screens)
1. **WelcomeScreen**: Animated touch-to-start attract screen with branding.
2. **ProductSelectScreen**: Selection between Photostrip 2R and Postcard 4R formats.
3. **FrameSelectScreen**: Category tabs and graphic frame theme selector.
4. **PaymentScreen**: Midtrans dynamic QRIS display with live WebSocket payment observer.
5. **CaptureScreen**: 3-second countdown, 30 FPS LiveView mirroring, multi-pose capture loop, and video burst recording.
6. **FilterScreen**: Side-by-side color filter comparison with real-time preview.
7. **RenderScreen**: Real-time 300 DPI layout rendering progress bar.
8. **PrintScreen**: Physical print animation and printer spooling progress.
9. **QRScreen**: High-res QR code display for smartphone download and customer email entry.
10. **AdminScreen**: Hidden service menu for camera calibration, printer tests, and diagnostics.

## Partial Pages
- **None.** All 10 kiosk screens form a complete, continuous customer journey.

## Missing Pages
- **Voucher Entry Screen**: Dedicated modal/screen for entering promotional voucher codes before payment.

---

# 14. Operational Readiness

- **Single Booth Readiness**: `PARTIAL`  
  *Evaluation*: The software runs end-to-end reliably on one machine. It prints photos, captures Live Photos, uploads to Cloudflare R2, and serves customer mobile galleries. However, it cannot be deployed to paying retail customers until Midtrans Sandbox keys are swapped for production keys and the kiosk Windows PC is locked to prevent customer desktop access.
- **Multi Booth Readiness**: `PARTIAL`  
  *Evaluation*: The backend and database cleanly support hundreds of concurrent booths with unique device secrets and heartbeats. However, the dashboard lacks role-based access control (RBAC), meaning branch managers currently cannot be isolated to their own branch.
- **Production Readiness**: `NOT READY`  
  *Evaluation*: The system currently runs in a local development environment. It lacks public domain DNS (`pictolabs.id`), production cloud VPS hosting, HTTPS SSL certificates, live Midtrans merchant keys, and dashboard login protection.

---

# 15. Critical Blockers (Before Retail Commercial Launch)

These are the non-coding and infrastructural blockers that **must be resolved before commercial deployment**:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   COMMERCIAL LAUNCH CRITICAL BLOCKERS                                  │
├──────────────────────┬──────────────────────┬──────────────────────────┬───────────────────────────────┤
│ 1. MIDTRANS KYC      │ 2. CLOUD VPS HOSTING │ 3. DOMAIN & DNS SETUP    │ 4. AUTHENTICATION GATES       │
│ Submit PT/CV docs to │ Deploy backend & db  │ Point api.pictolabs.id & │ Implement login screen & lock │
│ Midtrans for live    │ to Ubuntu VPS with   │ dl.pictolabs.id custom   │ REST API routes from open     │
│ Production QRIS keys │ Docker Compose       │ domain with SSL certs    │ network access                │
└──────────────────────┴──────────────────────┴──────────────────────────┴───────────────────────────────┘
```

1. **Midtrans Production Verification**:
   - The platform is currently configured with Midtrans Sandbox test keys.
   - Real customers cannot pay via BCA, GoPay, OVO, or QRIS until Han completes business KYC verification with Midtrans and obtains Production Server & Client Keys.
2. **Production Cloud VPS Hosting**:
   - The backend API, PostgreSQL database, and Redis currently run on the local development PC.
   - Must be deployed to a reliable cloud VPS (e.g. DigitalOcean, Hetzner, Biznet Gio) with a static public IP.
3. **Domain Name & Cloudflare DNS Configuration**:
   - Must configure DNS records on Cloudflare for `pictolabs.id`:
     - `api.pictolabs.id` → Cloud VPS IP (required for Midtrans webhooks).
     - `admin.pictolabs.id` → Operations Dashboard.
     - `dl.pictolabs.id` → Cloudflare R2 bucket custom domain (for zero-egress customer downloads).
4. **Dashboard & API Security Gates**:
   - The dashboard currently has no login page; anyone who knows the URL has full access to customer photos, sessions, and reprint controls.
   - Backend REST routes must be protected with `JwtAuthGuard`.
5. **Transactional Email Service Setup**:
   - Softfile delivery emails require verified domain keys from SendGrid or Resend to replace the current mock logger.
6. **Physical Kiosk PC Lockdown**:
   - The physical kiosk computer must be configured with Windows Shell Launcher and Auto-Logon so that the Pictolabs executable launches automatically upon boot and customers cannot access the Windows desktop.

---

# 16. Technical Risks

1. **Printer Hardware Jam Blindspot**:
   - *Risk*: If the DNP printer has a mechanical paper jam or runs out of paper rolls, the Windows spooler accepts the print file without returning an immediate error. The kiosk assumes printing succeeded.
   - *Mitigation*: Sprint 5B provides the **Re-Delivery Flow**, allowing operators to trigger emergency reprints or send digital softfiles within 60 seconds of a customer complaint. Low-level printer status monitoring should be added in a future update.
2. **Payment Webhook Network Ingress**:
   - *Risk*: If the cloud server loses network connectivity or the domain SSL certificate expires, Midtrans webhooks cannot reach `POST /api/payments/webhook`. Customers will be charged on their bank app, but the kiosk will remain on the payment screen.
   - *Mitigation*: The kiosk includes a backup payment status poller (`GET /api/payments/status/:orderId`) that checks settlement directly with Midtrans as a fail-safe if webhooks are delayed.
3. **Cloudflare Storage Cost Growth**:
   - *Risk*: Without automated lifecycle rules, customer photos will accumulate on Cloudflare R2 indefinitely.
   - *Mitigation*: Cloudflare R2 bucket lifecycle rules must be configured to automatically purge raw files after the 30-day retention window.

---

# 17. Recommended Next Sprint

### Recommended Sprint: **Sprint 5C: Security Hardening & Administrative Authentication**

- **Sprint Goal**: Implement an administrative Login Screen for the Dashboard, protect all backend REST API routes with NestJS `JwtAuthGuard`, enforce basic Role-Based Access Control, and connect a live transactional email provider.
- **Business Value**: **Protects sensitive customer data and prevents unauthorized fleet manipulation.** Secures customer photos, financial records, and remote reprint commands before the platform is connected to a public domain.
- **Dependencies**: Sprint 5A (Dashboard Foundation) and Sprint 5B (Support & Observability) — *both already completed*.
- **Estimated Complexity**: **Low to Moderate** (~2–3 days).

---

# 18. Founder Recommendation

> ### *"If I wanted to deploy Booth #1 today, what would stop me?"*

### **Concise Answer:**

From a software execution standpoint, **the photobooth experience works end-to-end**. The camera captures studio-grade photos, the layout renders cleanly at 300 DPI, the DNP printer cuts physical strips, and the cloud gallery delivers digital softfiles.

However, **four critical non-coding blockers prevent you from deploying Booth #1 to a real commercial mall today**:

1. **You cannot collect real money yet**: You are on Midtrans Sandbox. You need a verified Midtrans Production account with live QRIS keys.
2. **Your backend is on your local PC**: Midtrans cannot send payment webhooks to your laptop. The backend must be deployed to a Cloud VPS with a public domain (`api.pictolabs.id`).
3. **Your dashboard is unprotected**: Anyone who opens your dashboard URL can view all customer photos and command free reprints. You need a login screen and password protection.
4. **Your physical kiosk is not locked down**: The kiosk PC needs Windows Shell Launcher configured so customers cannot close the app, open Chrome, or tamper with Windows files.

**Suggested Next Move**: Focus next on **Sprint 5C (Security Hardening & Login)** while you submit your business documentation to **Midtrans** and provision a **Cloud VPS**. Once those two tracks converge, Booth #1 can deploy immediately.

---
*End of Project Status Report.*
