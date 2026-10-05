# SPRINT 5C PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Security Hardening & Deployment Readiness

> **Sprint**: Sprint 5C  
> **Milestone**: Pre-Production Operational Gate for Commercial Booth #1  
> **Target Audience**: Founder & Product Owner (Han), Engineering Team, Field Operations  
> **Document Status**: Complete PRD Specification  
> **Date**: September 10, 2026  
> **Primary Business Objective**: **Prepare Pictolabs for Real-World Commercial Deployment of Booth #1** — Harden administrative access, enforce Role-Based Access Control (RBAC), secure edge-to-cloud APIs, connect live transactional email delivery, establish WhatsApp alert dispatching, and lock down physical kiosk infrastructure.

---

## 1. Executive Summary & Problem Statement

Sprints 1 through 5B proved and delivered the technical foundation of Pictolabs:
- The kiosk captures studio-grade photos with Canon DSLRs, composits 300 DPI layouts, prints physical strips via DNP thermal printers, records Live Photo videos, and handles QRIS payments.
- The web dashboard monitors fleet heartbeats, diagnoses session health, searches customer transactions across multiple channels, and provides one-click support remediation (re-sending softfiles, extending links, commanding emergency reprints).

However, **the platform currently operates in an unauthenticated, non-isolated development environment**:
1. **Unprotected Dashboard**: The operational dashboard opens directly without credentials. Anyone who discovers the URL can view customer photos, inspect revenue, and command free physical reprints.
2. **Open Backend REST APIs**: Backend management routes lack JWT authentication guards.
3. **No Role Differentiation**: No distinction exists between a senior administrator and a part-time booth attendant.
4. **Simulated Email Softfiles**: Delivery emails are currently logged to the server console rather than dispatched to customer inboxes.
5. **Silent Edge Failures**: Technicians are not alerted via WhatsApp when a kiosk disconnects or jams.
6. **Unlocked Kiosk PC**: Physical Booth #1 runs standard Windows without kiosk shell lockdown, leaving the OS vulnerable to customer tampering.

**Sprint 5C resolves these operational blockers**, elevating Pictolabs from a working technical prototype into a hardened, commercial-grade enterprise system ready for physical installation at retail venues.

---

## 2. Explicit Scope Boundary

### In-Scope Focus Areas
1. **Dashboard Authentication**: User login screen, credential verification, session management, and auto-logout.
2. **JWT Security**: Cryptographic token generation, NestJS authentication guards (`JwtAuthGuard`), edge device secret enforcement.
3. **Role-Based Access Control (RBAC)**: Enforcing 4 operational roles (`Super Admin`, `Admin`, `Support`, `Operator`) across backend APIs and UI views.
4. **Deployment Readiness**: Cloud Docker Compose production orchestration, Nginx HTTPS reverse proxy, domain DNS mapping, and Windows kiosk shell lockdown.
5. **Email Infrastructure**: Live transactional email integration (SendGrid / Resend) with branded HTML templates and delivery tracking.
6. **WhatsApp Alert Foundation**: Webhook-based emergency notification dispatcher alerting technicians to critical hardware and connectivity outages.

### Strictly Out-of-Scope (Deferred to Future Roadmap)
- ❌ Flipbook Product Flow
- ❌ Dual-Camera Synchronizer
- ❌ Financial Revenue Analytics & BI Dashboards
- ❌ Voucher & Discount Promotion Screens
- ❌ Marketing & Loyalty Features
- ❌ Dashboard UI Redesign or Theme Changes

---

## 3. Detailed Feature Specifications

---

### Feature 1: Dashboard Authentication

#### Business Problem
The operations web dashboard (`apps/dashboard`) currently opens directly into the fleet overview, session history, asset gallery, and support operations without requiring authentication. In a commercial environment, this exposes private customer photos, personal contact details (email/phone), and physical reprint controls to anyone on the local network or public internet.

#### User Story
> *As a Pictolabs staff member (support agent, technician, or administrator), I want to log in using my business email and password so that I can securely access the fleet dashboard and perform my daily operational duties.*

#### Functional Requirements
1. **Dedicated `/login` Screen**:
   - Clean, centered login card with Pictolabs branding.
   - Input fields: Email (with format validation) and Password (with toggleable show/hide visibility).
   - "Sign In" button with loading state during network transit.
   - Inline error display for invalid credentials, deactivated accounts, or network timeouts.
2. **Session Persistence & State**:
   - Store authentication token securely in client storage (memory/secure localStorage).
   - Maintain active session across page refreshes.
   - Header profile indicator displaying logged-in user name, email, and assigned role badge.
3. **Route Protection (`<RequireAuth />`)**:
   - Unauthenticated access attempts to any dashboard route (`/`, `/booths`, `/sessions`, `/gallery`, `/support`) must automatically intercept and redirect the user to `/login`, preserving the intended destination URL.
4. **Sign Out & Token Expiration**:
   - Explicit "Sign Out" button in the navigation header that invalidates local session tokens and redirects to `/login`.
   - Automatic session invalidation and redirect upon receiving HTTP 401 Unauthorized from backend APIs.

#### Non-Functional Requirements
- Login page render time < 300ms.
- Authentication request turnaround < 400ms under standard network conditions.
- Zero password leakage: passwords must never be stored in plain text, logged, or exposed in client state.

#### Success Criteria
- Opening `http://localhost:5173/` without an active session immediately redirects to `/login`.
- Submitting valid credentials authenticates the user, navigates to the Overview page, and reveals fleet data.
- Submitting invalid credentials displays a clear error without clearing the email input.
- Clicking "Sign Out" immediately terminates access.

#### Risks & Mitigations
- *Risk*: Support staff locked out during a critical kiosk incident due to forgotten passwords.  
  *Mitigation*: Provide command-line administrative password reset script (`npm run user:reset-password`) for immediate emergency recovery.

#### Dependencies
- Backend `POST /api/auth/login` endpoint.
- Database `users` table.

---

### Feature 2: JWT Security Architecture

#### Business Problem
Backend REST endpoints are currently exposed without request authentication guards. Any external HTTP client or malicious actor capable of sending requests to the backend server can query `/api/sessions`, fetch private customer photos, or command `/api/sessions/:id/reprint` without credentials.

#### User Story
> *As the platform owner, I want every backend administrative API endpoint to cryptographically verify a JSON Web Token (JWT) so that unauthorized requests are immediately blocked with HTTP 401 Unauthorized.*

#### Functional Requirements
1. **Global NestJS `JwtAuthGuard`**:
   - Protect all administrative controllers (`BoothsController`, `SessionsController`, `SupportController`, `GalleryController`) by default.
   - Extract and verify bearer tokens from the `Authorization: Bearer <token>` header.
2. **Explicit Public Route Whitelist (`@Public()`)**:
   - The following public/edge routes must remain accessible without administrative user JWTs:
     - `POST /api/auth/login` — Administrative authentication.
     - `POST /api/auth/booth` — Edge kiosk device secret verification.
     - `POST /api/payments/webhook` — Midtrans payment webhook (verified via SHA-512 signature).
     - `GET /d/:sessionId` — Public customer mobile gallery web page.
     - `GET /api/gallery/:sessionId` — Public customer gallery asset manifest.
     - `GET /api/gallery/:sessionId/zip` — Public customer streaming ZIP download.
3. **Edge Kiosk Device Secret Guard (`BoothSecretGuard`)**:
   - Kiosk-to-cloud communications (`POST /api/booths/:id/heartbeat`, `POST /api/sessions`, `POST /api/sessions/:id/timeline`) must authenticate using the kiosk's unique `device_secret` passed via `X-Booth-Secret` header or edge token.
4. **JWT Payload Specification**:
   - Signed with HMAC-SHA256 using a cryptographically secure `JWT_SECRET`.
   - Payload claims: `sub` (User ID), `email`, `role`, `companyId`, `branchId`, `iat` (issued at), `exp` (expires at).
   - Standard token validity: 24 hours.

#### Non-Functional Requirements
- JWT validation overhead must not exceed 2ms per request.
- Backend must refuse to start in production mode (`NODE_ENV=production`) if `JWT_SECRET` is unset, default, or fewer than 32 characters.

#### Success Criteria
- An unauthenticated request to `GET /api/sessions` returns `HTTP 401 Unauthorized` with `{ "statusCode": 401, "message": "Unauthorized" }`.
- An API request with a valid `Authorization: Bearer <token>` header returns `HTTP 200 OK`.
- Kiosk heartbeats with valid `X-Booth-Secret` continue to ingest successfully without user JWT.

#### Risks & Mitigations
- *Risk*: Edge kiosks fail to communicate if booth routes are accidentally locked behind user JWT guards.  
  *Mitigation*: Strict architectural separation between user JWT guards and booth device secret guards.

#### Dependencies
- `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`.

---

### Feature 3: Role-Based Access Control (RBAC)

#### Business Problem
Different staff members carry vastly different operational responsibilities. A high-school student working as a mall booth attendant should not have permission to view company financial summaries, reconfigure camera shutter speeds, or delete historical records. Currently, any authenticated user has blanket administrative access.

#### User Story
> *As a franchise owner, I want to assign distinct operational roles to my team members so that staff only have access to the specific features, booths, and data relevant to their role.*

#### Functional Requirements
1. **Four Standardized System Roles**:
   - **`SUPER_ADMIN`**: Full platform authority across all companies, branches, and kiosks. Manages system configurations, creates admin accounts, and accesses all audit logs.
   - **`ADMIN`**: Full managerial authority within their assigned company/franchise. Can manage branches, register booths, edit booth configurations, and view operational statistics.
   - **`SUPPORT`**: Customer service role. Can search customer sessions across branches, view session health, inspect high-res photos, resend delivery emails, and extend gallery access links. Cannot modify hardware configurations or take booths into maintenance mode.
   - **`OPERATOR`**: On-site booth attendant assigned to a specific physical branch. Can monitor booth status, toggle maintenance mode during paper changes, and trigger emergency physical reprints (enforcing a 3-copy daily rate limit). Cannot view sessions from other branches.
2. **Backend `@Roles(...)` Decorator & `RolesGuard`**:
   - Enforce role boundaries at controller and method levels.
   - Requests violating role constraints return `HTTP 403 Forbidden`.
3. **Branch-Level Data Filtering**:
   - When an `OPERATOR` queries sessions or booths, the backend automatically scopes the query to their assigned `branch_id`.
4. **Conditional UI Permissions**:
   - Hide or disable restricted action buttons in the dashboard based on active role (e.g. hide "Edit Config" from `SUPPORT` and `OPERATOR`).

#### Non-Functional Requirements
- Role verification resolved in-memory from validated JWT claims without additional database query overhead.

#### Success Criteria
- A `SUPPORT` user attempting to update booth camera configs via `PUT /api/booths/:id/config` receives `403 Forbidden`.
- An `OPERATOR` assigned to "Grand Indonesia" cannot see sessions from "Central Park".
- A `SUPER_ADMIN` can access all records across all locations without restriction.

#### Risks & Mitigations
- *Risk*: Emergency reprints delayed if an attendant's account permissions are misconfigured.  
  *Mitigation*: The `OPERATOR` role explicitly includes reprint permissions with rate-limiting and mandatory reason prompts.

#### Dependencies
- Feature 1 (Dashboard Auth) and Feature 2 (JWT Security).

---

### Feature 4: Deployment Readiness (Cloud & Edge Infrastructure)

#### Business Problem
Pictolabs currently executes in a local development environment. There is no automated production orchestration for hosting the backend, PostgreSQL database, and Redis cache on an Ubuntu cloud server with SSL certificates, and physical Booth #1 runs standard Windows 11 where customers could access the desktop or taskbar.

#### User Story
> *As the founder, I want a turnkey production deployment configuration for our cloud server and an automated kiosk shell lock script for the physical machine so that Booth #1 can operate autonomously and securely in a shopping mall.*

#### Functional Requirements
1. **Cloud Server Orchestration (`docker-compose.prod.yml`)**:
   - Multi-container stack:
     - `pictolabs-backend`: Production NestJS API running in Node.js 20 LTS Alpine.
     - `pictolabs-postgres`: PostgreSQL 16 Alpine with persistent data volume and automated daily backup volume.
     - `pictolabs-redis`: Redis 7 Alpine with persistent append-only file (AOF) caching.
     - `pictolabs-nginx`: Nginx reverse proxy managing SSL certificate termination, gzip/brotli compression, rate limiting, and WebSocket proxying.
2. **Production Environment Configuration Template**:
   - Provide `.env.production.example` documenting all mandatory variables (Midtrans Production Keys, Cloudflare R2 bucket credentials, JWT secret, database credentials, CORS domains).
3. **Public Domain & SSL Setup Architecture**:
   - Map domain DNS records through Cloudflare:
     - `api.pictolabs.id` → Cloud VPS (Backend REST & WebSockets).
     - `admin.pictolabs.id` → Operations Dashboard.
     - `dl.pictolabs.id` → Cloudflare R2 custom domain for zero-egress customer downloads.
4. **Physical Kiosk PC Lockdown Specification**:
   - Windows 10/11 Shell Launcher configuration replacing `explorer.exe` with `Pictolabs.exe`.
   - Windows Registry configuration to disable shortcut keys: `Ctrl+Alt+Del`, `Alt+Tab`, `Windows Key`, `Alt+F4`.
   - Auto-logon configured to bypass Windows login screen upon physical power restoration.
   - Dual-display locking ensuring touch interface remains pinned to 1080x1920 portrait display.

#### Non-Functional Requirements
- Production container restart policy: `restart: unless-stopped`.
- System cold boot to customer attract screen < 45 seconds after physical power is switched on.

#### Success Criteria
- Executing `docker compose -f docker-compose.prod.yml up -d` boots backend, database, redis, and nginx with 100% healthy statuses.
- Health endpoint `GET /api/health` returns HTTP 200 with database and storage operational status.
- Kiosk machine boots straight into the photobooth touchscreen interface with no Windows desktop visible.

#### Risks & Mitigations
- *Risk*: Windows Automatic Updates unexpectedly rebooting the kiosk during retail hours.  
  *Mitigation*: Configure Windows Group Policy (GPO) to permanently defer updates and disable automatic reboots.

#### Dependencies
- Ubuntu 22.04/24.04 Cloud VPS, Docker Engine & Docker Compose, Cloudflare DNS.

---

### Feature 5: Email Infrastructure (Live Transactional Delivery)

#### Business Problem
Digital softfile delivery is a primary value proposition for modern photobooth customers. Currently, softfile email delivery is simulated and only logs to the server console. Customers who enter their email at the kiosk or request assistance from support do not receive real emails.

#### User Story
> *As a photobooth customer, I want to receive an email containing my photo strip and gallery link immediately after leaving the booth so that I can share my photos on social media.*

#### Functional Requirements
1. **Live Transactional Email Service**:
   - Integrate SendGrid or Resend API via a standardized `EmailService`.
   - Load credentials securely from environment variables (`EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`).
2. **Branded HTML Delivery Template**:
   - Responsive layout optimized for mobile email clients (Apple Mail, Gmail, Outlook).
   - Prominent display of customer's high-resolution photo strip.
   - Primary Call-to-Action button: "View & Download All Photos" (direct link to `/d/:sessionId`).
   - Clear retention advisory notice: *"Your photos are hosted securely for 30 days. Please download your full-resolution files before [Expiration Date]."*
   - Venue branding: *"Captured at Pictolabs — Grand Indonesia"*.
3. **Support Resend Integration**:
   - Hook into `POST /api/sessions/:id/redelivery/email` to trigger real email dispatch when an operator clicks "Resend Softfile Email" in the dashboard.
4. **Delivery Audit Logging**:
   - Log email dispatch events to `session_events` (`EMAIL_DISPATCHED`, `EMAIL_DELIVERED`, `EMAIL_FAILED`).
   - Record operator interventions in `redelivery_logs`.
5. **Rate Limiting Safeguard**:
   - Maximum 3 softfile emails per session per hour to prevent accidental spamming.

#### Non-Functional Requirements
- Email dispatch initiated within 3 seconds of session completion or support button click.
- High deliverability: SPF, DKIM, and DMARC DNS records configured on `pictolabs.id` to prevent Spam folder classification.

#### Success Criteria
- Entering an email at the kiosk sends a real email arriving in the customer's inbox in < 30 seconds.
- Clicking "Resend Softfile Email" in the support dashboard delivers a real email and logs the action in the session audit trail.
- Email renders cleanly with images and working download links across iOS and Android mail apps.

#### Risks & Mitigations
- *Risk*: Customer enters a mistyped email address on the kiosk touchscreen (e.g. `user@gmai.con`).  
  *Mitigation*: Support Search (Sprint 5B) allows operators to correct customer email addresses and immediately trigger a resend.

#### Dependencies
- Transactional email provider account (SendGrid or Resend), DNS domain verification records.

---

### Feature 6: WhatsApp Alert Foundation

#### Business Problem
Store technicians and operations staff cannot monitor the web dashboard continuously. When a photobooth experiences a paper roll runout, cutter jam, camera disconnection, or internet outage in a crowded mall, staff remain unaware until frustrated customers complain.

#### User Story
> *As a field technician or store manager, I want to receive an automated WhatsApp notification the moment a booth experiences a hardware failure or goes offline so that I can resolve the issue before customer sales are lost.*

#### Functional Requirements
1. **WhatsApp Notification Gateway Client**:
   - Implement an outbound webhook dispatcher supporting Indonesian business WhatsApp gateways (e.g. Fonnte, Wablas, or Twilio WhatsApp).
   - Configurable environment credentials (`WA_GATEWAY_URL`, `WA_API_KEY`, `WA_ADMIN_PHONE`).
2. **Core Alert Triggers**:
   - **`BOOTH_OFFLINE`**: Kiosk heartbeat missing for ≥ 5 consecutive minutes.
   - **`CAMERA_DISCONNECTED`**: Canon DSLR disconnected and fallback webcam activated.
   - **`PRINTER_ERROR`**: Physical print spooling failure or paper runout detected.
   - **`PAYMENT_ANOMALY`**: Unsettled invoice rate exceeding threshold.
3. **Localized Plain-Text Message Format**:
   - Standardized Indonesian template designed for rapid readability:
     ```
     🚨 [PICTOLABS ALERT - HARDWARE ISSUE]
     Booth: Booth #1 (Grand Indonesia - Level 3)
     Status: PRINTER ERROR / PAPER JAM
     Time: 10 Sep 2026, 14:32 WIB
     Detail: Windows print spooler reported job failure.
     Action Required: Inspect physical printer paper roll and clear cutter.
     Dashboard Link: https://admin.pictolabs.id/booths/bth-01
     ```
4. **Anti-Spam Throttling & Deduplication**:
   - Implement a 15-minute cooldown period per failure type per booth to prevent message flooding during sustained outages.

#### Non-Functional Requirements
- Alert message dispatched within 10 seconds of trigger condition detection.

#### Success Criteria
- Disconnecting the camera or taking a kiosk offline for 5 minutes automatically sends a formatted WhatsApp alert to the designated emergency phone number.
- Subsequent failure events within 15 minutes are throttled and logged without triggering duplicate WhatsApp messages.

#### Risks & Mitigations
- *Risk*: WhatsApp gateway provider service downtime or account rate limiting.  
  *Mitigation*: Alerts must run asynchronously without blocking core kiosk or payment processing pipelines, with fallback logging to the database.

#### Dependencies
- WhatsApp gateway API credentials, `AlertService` in backend.

---

## 4. Proposed Deployment Architecture

The production architecture separates edge hardware execution from cloud operations, ensuring zero data loss and maximum fault tolerance.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       PICTOLABS DEPLOYMENT TOPOLOGY                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘

 [ PHYSICAL RETAIL BOOTH #1 ]
 ┌──────────────────────────────────────────────────────────┐
 │  Windows 10/11 IoT / Shell Launcher                      │
 │  • Pictolabs Kiosk App (Electron 28 + React 18)          │
 │  • Canon EDSDK C++ Engine (DSLR Shutter & 30 FPS LiveView│
 │  • DNP DS-RX1HS Dye-Sub Thermal Printer                  │
 │  • Local SQLite (WAL Mode) Offline Transaction Queue     │
 └────────────────────────────┬─────────────────────────────┘
                              │
                              │ 1. HTTPS Heartbeats & Session Events (X-Booth-Secret)
                              │ 2. Direct S3 Presigned Media Uploads
                              ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │  CLOUDFLARE EDGE NETWORK (pictolabs.id)                                                               │
 │  • DNS Management & DDoS Protection                                                                  │
 │  • SSL/TLS Termination (Strict Full HTTPS)                                                            │
 │  • Custom Domain dl.pictolabs.id (Zero-Egress CDN for Customer Media)                                 │
 └─────────────┬──────────────────────────────────────────────────────────┬──────────────────────────────┘
               │                                                          │
               │ HTTPS Reverse Proxy                                      │ Direct Customer Downloads
               ▼                                                          ▼
 ┌───────────────────────────────────────────────────────┐  ┌────────────────────────────────────────────┐
 │  CLOUD VPS (Ubuntu 24.04 LTS / Docker Compose)        │  │  CLOUDFLARE R2 OBJECT STORAGE              │
 │                                                       │  │                                            │
 │  ┌─────────────────────────────────────────────────┐  │  │  Bucket: pictolabs-production-media        │
 │  │ NGINX REVERSE PROXY (Port 80/443)               │  │  │  • /strips/{sessionId}_strip.jpg          │
 │  │ • api.pictolabs.id (REST API & WebSockets)      │  │  │  • /photos/{sessionId}_pose_*.jpg         │
 │  │ • admin.pictolabs.id (Dashboard Static SPA)     │  │  │  • /videos/{sessionId}_live_*.mp4         │
 │  └────────────────────────┬────────────────────────┘  │  │  • /zips/{sessionId}_all.zip              │
 │                           │                           │  │  Lifecycle: 30-Day Auto Purge              │
 │                           ▼                           │  └────────────────────────────────────────────┘
 │  ┌─────────────────────────────────────────────────┐  │
 │  │ PICTOLABS BACKEND CONTAINER (NestJS / Node 20)  │  │
 │  │ • JwtAuthGuard & RolesGuard (RBAC)              │  │
 │  │ • Midtrans Payment Webhook Pipeline             │  │
 │  │ • EmailService (SendGrid / Resend API) ─────────┼──┼──► [ CUSTOMER INBOX (HTML Delivery) ]
 │  │ • AlertService (WhatsApp Gateway Webhook) ──────┼──┼──► [ TECHNICIAN WHATSAPP (Urgent Alerts) ]
 │  └─────────────┬─────────────────────┬─────────────┘  │
 │                │                     │                │
 │                ▼                     ▼                │
 │  ┌───────────────────────┐ ┌───────────────────────┐  │
 │  │ POSTGRESQL 16         │ │ REDIS 7               │  │
 │  │ Relational Entities   │ │ Session State Caching │  │
 │  │ (20 Tables)           │ │ Socket.IO PubSub      │  │
 │  └───────────────────────┘ └───────────────────────┘  │
 └───────────────────────────────────────────────────────┘
                              ▲
                              │ Authenticated HTTPS (JWT + RBAC)
                              │
 ┌────────────────────────────┴─────────────────────────────┐
 │  OPERATIONS DASHBOARD (Web Browser on admin.pictolabs.id)│
 │  • Super Admin / Admin / Support / Operator Views        │
 │  • Real-Time Fleet Monitor & Health Diagnostics          │
 │  • Support Search & Remediation Controls                 │
 └──────────────────────────────────────────────────────────┘
```

### Architectural Highlights
1. **Zero-Egress Direct Media Pipeline**: The kiosk uploads photos directly to Cloudflare R2 using pre-signed S3 URLs. Media never transits the backend server, eliminating bandwidth bottlenecks.
2. **Offline-First Resilience**: If shopping mall internet drops, the kiosk stores session records in local SQLite and prints physical photos locally. Cloud synchronization retries automatically upon network recovery.
3. **Strict Network Isolation**: The PostgreSQL database and Redis instances are bound to an internal Docker bridge network and are never exposed to the public internet.

---

## 5. Security & Permissions Model

The platform enforces a four-tier Role-Based Access Control (RBAC) hierarchy.

### Role Definitions

| Role | Target Persona | Scope of Authority |
| :--- | :--- | :--- |
| **`SUPER_ADMIN`** | Platform Founder & Lead Architect | Global authority across all companies, branches, and kiosks. Full administrative, financial, and configuration rights. |
| **`ADMIN`** | Franchise Owner / Regional General Manager | Full authority within their assigned company/brand. Can register booths, configure pricing, and view regional operations. |
| **`SUPPORT`** | Central Customer Care Specialist | Cross-branch lookup authority. Can inspect customer sessions, verify payments, resend softfile emails, and extend download links. Cannot alter hardware settings. |
| **`OPERATOR`** | On-Site Mall Booth Attendant | Local branch authority. Can monitor kiosk status, toggle maintenance mode, and command physical reprints for their assigned venue. Cannot view cross-branch records. |

### Permissions Matrix

| Platform Capability | Super Admin | Admin | Support | Operator |
| :--- | :---: | :---: | :---: | :---: |
| **View Fleet Overview & KPIs** | ✅ | ✅ | ✅ | ✅ (Branch Only) |
| **View Booth List & Status** | ✅ | ✅ | ✅ | ✅ (Branch Only) |
| **Edit Booth Hardware Settings (ISO, Timer)** | ✅ | ✅ | ❌ | ❌ |
| **Toggle Maintenance Mode** | ✅ | ✅ | ❌ | ✅ (Branch Only) |
| **View Sessions Archive** | ✅ | ✅ | ✅ | ✅ (Branch Only) |
| **View Customer Photos & Video Assets** | ✅ | ✅ | ✅ | ✅ (Branch Only) |
| **Customer Support Search (Omni-Channel)** | ✅ | ✅ | ✅ | ✅ (Branch Only) |
| **Resend Delivery Email** | ✅ | ✅ | ✅ | ✅ (Branch Only) |
| **Extend Gallery Retention Link (7d / 30d)** | ✅ | ✅ | ✅ | ❌ |
| **Trigger Emergency Physical Reprint** | ✅ | ✅ | ❌ | ✅ (Max 3 / Session) |
| **View Operator Remediation Audit Trail** | ✅ | ✅ | ✅ | ❌ |
| **User & Staff Account Management** | ✅ | ✅ (Within Org) | ❌ | ❌ |
| **System Diagnostics & Server Error Logs** | ✅ | ❌ | ❌ | ❌ |

---

## 6. Alerting Strategy & Incident Playbooks

The alerting system ensures zero silent hardware failures during retail operating hours.

| Trigger Event | Severity | Detection Mechanism | Primary Delivery | Secondary Delivery | Expected Action / Incident Playbook |
| :--- | :---: | :--- | :---: | :---: | :--- |
| **Camera Offline** | `CRITICAL` | Canon EDSDK disconnect event reported by kiosk. | **WhatsApp** to Technician | Dashboard Alert Banner | 1. Kiosk automatically fails over to webcam.<br>2. Technician visits booth to reseat USB cable.<br>3. Restart camera power switch. |
| **Printer Offline / Jam** | `CRITICAL` | Windows Spooler reporting job failure or printer disconnected. | **WhatsApp** to Store Attendant | Dashboard Alert Banner | 1. Attendant toggles booth to Maintenance Mode.<br>2. Clear mechanical paper jam or reload paper roll.<br>3. Execute test print via Admin Menu. |
| **Booth Offline** | `HIGH` | HTTP heartbeat missing for ≥ 5 consecutive minutes (`last_seen`). | **WhatsApp** to Store Manager | Dashboard Fleet Badge | 1. Verify mall electrical power and kiosk breaker.<br>2. Check venue Wi-Fi / 4G router connectivity.<br>3. Inspect kiosk Windows PC status. |
| **Heartbeat Lost** | `MEDIUM` | Kiosk misses 2 consecutive heartbeats (60s – 5m window). | Dashboard Status Yellow | System Error Log | 1. Transient network degradation.<br>2. Monitor for automatic recovery before dispatching field staff. |
| **Storage Critical** | `HIGH` | Cloudflare R2 API responding with upload failures or credentials error. | **Email** to Lead Engineer | System Error Log | 1. Check Cloudflare R2 quota and API token validity.<br>2. Kiosk holds media in local SQLite queue until resolved. |
| **Payment Failure Spike**| `HIGH` | ≥ 3 consecutive QRIS payment timeouts or Midtrans webhook errors. | **WhatsApp** to Tech Support | Dashboard Session Alert | 1. Verify Midtrans gateway status page.<br>2. Confirm cloud server HTTPS certificate is active.<br>3. Test QRIS scan with test banking app. |

---

## 7. Definition of Done (DoD) for Sprint 5C

A feature is considered complete and approved only when all the following criteria are verified:

1. **Authentication Gate**:
   - The dashboard cannot be accessed without entering valid credentials at `/login`.
   - Logging in issues a signed JWT and populates user state.
   - Logging out completely purges credentials and returns to `/login`.
2. **API Protection**:
   - Every administrative REST route returns `401 Unauthorized` when called without a valid token.
   - Kiosk heartbeat and sync endpoints continue functioning using booth device secrets.
3. **Role Enforcement**:
   - An `OPERATOR` account is blocked with `403 Forbidden` if attempting to call administrative configuration endpoints.
   - Session searches for an `OPERATOR` are strictly scoped to their assigned branch.
4. **Live Transactional Email**:
   - Completing a session with an email address sends a real, formatted HTML email arriving in an inbox within 30 seconds.
   - Dashboard "Resend Delivery Email" dispatches a real email and logs an entry in `redelivery_logs`.
5. **WhatsApp Notification**:
   - Triggering a booth disconnect or printer error dispatches a formatted Indonesian WhatsApp message to the registered test number within 10 seconds.
6. **Deployment Blueprint**:
   - `docker-compose.prod.yml` and `.env.production.example` are committed and tested.
   - Windows kiosk shell lockdown documentation is complete and verified on a Windows test machine.
7. **Zero Regression**:
   - Core kiosk capture, DNP printing, Sharp 300 DPI rendering, and Midtrans QRIS payment continue operating with zero regressions.

---
*End of Sprint 5C PRD.*
