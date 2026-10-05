# SPRINT 5C IMPLEMENTATION PLAN (REVISION V2)
## Security & Deployment Readiness for Commercial Booth #1

> **Sprint**: Sprint 5C  
> **Milestone**: Pre-Production Operational Gate for Commercial Deployment  
> **Document Status**: Revision V2 — Fully Aligned & Approved Scope  
> **Date**: September 10, 2026  
> **Revisions Applied in V2**:
> 1. **RBAC Completely Removed**: No multi-role hierarchy; focused strictly on user authentication (Login + JWT + Protected Routes).
> 2. **Localization Foundation Added**: Bahasa Indonesia as default dashboard language, English future-ready with a centralized translation dictionary.
> 3. **Booth Health Dashboard Added**: Visual 5-pillar health monitoring (Camera, Printer, Storage, Heartbeat, Payment).
> 4. **Unified WhatsApp Alerting**: All system and operational alerts routed directly to WhatsApp.
> 5. **Standardized Severity Model**: Three-tier classification (`INFO`, `WARNING`, `CRITICAL`).

---

## 1. Goal & Architectural Scope

The goal of Sprint 5C (V2) is to prepare Pictolabs for the physical, real-world deployment of **Booth #1** in a commercial shopping mall.

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SPRINT 5C (V2) CORE ARCHITECTURE                                     │
├──────────────────────────────┬─────────────────────────────┬───────────────────────────────────────────┤
│ 1. DASHBOARD LOGIN & AUTH    │ 2. JWT SECURITY & GUARDS    │ 3. PROTECTED ROUTES & INTERCEPTORS        │
│ • Responsive /login screen   │ • Global NestJS AuthGuard   │ • <RequireAuth> route wrapper             │
│ • Client auth store (Zustand)│ • Whitelist public routes   │ • Axios 401 redirect to /login            │
│ • User header menu & logout  │ • Edge X-Booth-Secret guard │ • Session persistence in localStorage     │
├──────────────────────────────┼─────────────────────────────┼───────────────────────────────────────────┤
│ 4. DEPLOYMENT READINESS      │ 5. EMAIL INFRASTRUCTURE     │ 6. WHATSAPP UNIFIED ALERTING              │
│ • docker-compose.prod.yml    │ • Live SendGrid/Resend API  │ • All alerts delivered to WhatsApp        │
│ • Nginx SSL reverse proxy    │ • Branded HTML softfile mail│ • Severity: INFO / WARNING / CRITICAL     │
│ • Windows Kiosk Shell lock   │ • Rate limiting (max 3/hr)  │ • 15-minute anti-spam deduplication       │
├──────────────────────────────┴─────────────────────────────┴───────────────────────────────────────────┤
│ 7. LOCALIZATION FOUNDATION                                 │ 8. BOOTH HEALTH DASHBOARD FOUNDATION      │
│ • Bahasa Indonesia by DEFAULT                              │ • 5 Pillars: Camera, Printer, Storage,    │
│ • English future-ready (ID | EN toggle)                    │   Heartbeat, Payment                      │
│ • Centralized dictionary & useTranslation hook             │ • Visual telemetry cards & quick actions  │
└────────────────────────────────────────────────────────────┴───────────────────────────────────────────┘
```

---

## 2. In-Depth Technical Specifications (8 Scope Items)

---

### Item 1: Dashboard Login Screen

#### Technical Approach
- Implement a dedicated page component `LoginPage.tsx` in `apps/dashboard/src/pages/LoginPage.tsx`.
- Design a clean, responsive glassmorphic login interface featuring Pictolabs branding, email input, password input with show/hide visibility toggle, "Masuk" / "Sign In" button with loading spinner, and inline error alert banners.
- Create a client-side authentication store `useAuthStore` (`apps/dashboard/src/stores/useAuthStore.ts`) using Zustand:
  - State: `token`, `user` (`id`, `email`, `name`), `isAuthenticated`, `isLoading`, `error`.
  - Actions: `login(email, password)`, `logout()`, `initialize()`.
  - Persist token and user profile in `localStorage`.
- Add an authenticated User Profile & Sign Out menu to `AppShell.tsx` header displaying user avatar initials, name, email badge, and "Keluar" / "Sign Out" button.

#### Database Changes
- None required. The `User` table already exists in `schema.prisma` with `id`, `email`, `password` (bcrypt hashed), `name`.
- A database seed script ensures a default administrator account (`admin@pictolabs.id`) is seeded.

#### API Changes
- Consumes the existing endpoint:
  - `POST /api/auth/login` — Accepts `{ email, password }`, returns `{ accessToken, user: { id, email, name } }`.

#### Dashboard Changes
- **New File**: `apps/dashboard/src/pages/LoginPage.tsx`
- **New File**: `apps/dashboard/src/stores/useAuthStore.ts`
- **Modified**: `apps/dashboard/src/components/layout/AppShell.tsx` (adds user menu & logout button)
- **Modified**: `apps/dashboard/src/App.tsx` (registers `/login` route)

#### Risks & Mitigations
- *Risk*: Session desynchronization across browser tabs.  
  *Mitigation*: Rehydrate auth state from `localStorage` during initial app mount in `useAuthStore.initialize()`.

#### Dependencies
- Backend `POST /api/auth/login`, Zustand.

#### Acceptance Criteria
- `AC-1.1`: Navigating to `/login` renders email input, password input, and submit button.
- `AC-1.2`: Submitting invalid credentials displays a clear error message without clearing the email input.
- `AC-1.3`: Submitting valid credentials stores the JWT in `localStorage`, updates user state, and navigates to `/`.
- `AC-1.4`: Clicking "Keluar" (Sign Out) in the dashboard header clears stored credentials and redirects to `/login`.

---

### Item 2: JWT Authentication & Backend Security

#### Technical Approach
- Create a reusable NestJS `JwtAuthGuard` in `apps/backend/src/auth/guards/jwt-auth.guard.ts` extending `@nestjs/passport` `AuthGuard('jwt')`.
- Implement a `@Public()` decorator utilizing NestJS `Reflector` to mark public routes that bypass user authentication.
- Register `JwtAuthGuard` as a global guard in `apps/backend/src/app.module.ts` via `APP_GUARD`.
- Implement a dedicated `BoothSecretGuard` for edge kiosk communication, validating `X-Booth-Secret` header against the database `booth.deviceSecret` so kiosks do not require user JWTs.
- Enforce strict production safety: backend refuses to boot in `production` if `JWT_SECRET` is unset, default, or fewer than 32 characters.

#### Database Changes
- None required.

#### API Changes
- Global protection applied to all controllers:
  - `BoothsController` (fleet management routes)
  - `SessionsController` (archive, timeline, re-delivery routes)
  - `SupportController` (customer search routes)
  - `GalleryController` (administrative asset views)
- Explicit `@Public()` whitelist applied to:
  - `POST /api/auth/login` (admin login)
  - `POST /api/auth/booth` (booth edge auth)
  - `POST /api/payments/webhook` (Midtrans webhook, verified via SHA-512)
  - `GET /d/:sessionId` (public customer mobile gallery page)
  - `GET /api/gallery/:sessionId` (public customer gallery JSON manifest)
  - `GET /api/gallery/:sessionId/zip` (public customer streaming ZIP download)
  - `GET /api/health` (infrastructure health check)
- Kiosk edge routes protected via `@UseGuards(BoothSecretGuard)`:
  - `POST /api/booths/:id/heartbeat`
  - `POST /api/booths/:id/health`
  - `POST /api/sessions`
  - `POST /api/sessions/:id/timeline`

#### Dashboard Changes
- Update `apps/dashboard/src/services/api.ts` to attach `Authorization: Bearer <token>` automatically on every outgoing HTTP request.

#### Risks & Mitigations
- *Risk*: Edge kiosk requests blocked if kiosk endpoints are accidentally guarded by user JWT.  
  *Mitigation*: Separate `BoothSecretGuard` from `JwtAuthGuard`, accompanied by automated tests verifying kiosk heartbeats succeed without user tokens.

#### Dependencies
- `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`.

#### Acceptance Criteria
- `AC-2.1`: An unauthenticated `GET /api/sessions` returns `HTTP 401 Unauthorized`.
- `AC-2.2`: An authenticated `GET /api/sessions` with `Authorization: Bearer <valid_token>` returns `HTTP 200 OK`.
- `AC-2.3`: `POST /api/booths/:id/heartbeat` with a valid `X-Booth-Secret` header succeeds without user JWT.
- `AC-2.4`: Customer gallery endpoint `GET /api/gallery/:sessionId` remains publicly accessible without credentials.

---

### Item 3: Protected Routes & Axios Interceptors

#### Technical Approach
- Create a route wrapper component `<RequireAuth>` in `apps/dashboard/src/components/auth/RequireAuth.tsx`.
- Wrap all operational routes (`/`, `/booths`, `/sessions`, `/gallery`, `/support`) inside `<RequireAuth>` in `App.tsx`.
- If user is not authenticated, redirect to `/login` preserving the attempted path in `location.state.from`.
- Add an Axios response interceptor in `apps/dashboard/src/services/api.ts` that detects `HTTP 401 Unauthorized` responses:
  - Dispatches `useAuthStore.getState().logout()`.
  - Clears `localStorage`.
  - Redirects browser to `/login?reason=expired`.

#### Database Changes
- None required.

#### API Changes
- None required.

#### Dashboard Changes
- **New File**: `apps/dashboard/src/components/auth/RequireAuth.tsx`
- **Modified**: `apps/dashboard/src/App.tsx` (wraps operational routes in `<RequireAuth>`)
- **Modified**: `apps/dashboard/src/services/api.ts` (adds request auth header & 401 response interceptor)

#### Risks & Mitigations
- *Risk*: Infinite redirect loop if `/login` is placed inside `<RequireAuth>`.  
  *Mitigation*: Keep `/login` route declared outside the `<RequireAuth>` boundary.

#### Dependencies
- `react-router-dom`, Zustand `useAuthStore`.

#### Acceptance Criteria
- `AC-3.1`: Direct browser navigation to `http://localhost:5173/sessions` while logged out immediately redirects to `/login`.
- `AC-3.2`: Logging in successfully navigates user back to `/sessions` instead of default `/`.
- `AC-3.3`: When backend returns a 401 response during active usage, the dashboard automatically logs out and redirects to `/login`.

---

### Item 4: Deployment Readiness (Cloud & Edge Infrastructure)

#### Technical Approach
- **Cloud Orchestration Stack**:
  - Finalize production `docker-compose.prod.yml` running:
    - `pictolabs-backend`: NestJS production container (Node 20 Alpine).
    - `pictolabs-postgres`: PostgreSQL 16 Alpine with persistent volume and daily automated `pg_dump` backup mapping.
    - `pictolabs-redis`: Redis 7 Alpine with persistent AOF storage.
    - `pictolabs-nginx`: Nginx reverse proxy managing SSL/TLS termination, HTTP/2, WebSocket upgrades, and static dashboard serving.
  - Finalize `.env.production.example` documenting all production secrets.
  - Implement health endpoint `GET /api/health` checking database connectivity, Redis ping, and Cloudflare R2 storage readiness.
- **Physical Edge Kiosk Lockdown**:
  - Provide an automated PowerShell script `scripts/lockdown-kiosk.ps1` for Windows 10/11 IoT on Booth #1:
    - Configure Windows Shell Launcher replacing `explorer.exe` with `Pictolabs.exe`.
    - Disable Windows hotkeys via Registry: `Ctrl+Alt+Del`, `Alt+Tab`, `Windows Key`, `Alt+F4`.
    - Enable Windows Auto-Logon on boot and auto-restart policy if process terminates.
    - Lock screen orientation to 1080x1920 portrait display.

#### Database Changes
- None required.

#### API Changes
- **New Endpoint**: `GET /api/health` — Returns `{ status: "ok", db: "connected", redis: "connected", r2: "healthy", timestamp }`.

#### Dashboard Changes
- Production Vite build output (`dist/`) packaged and served as static assets via Nginx container.

#### Risks & Mitigations
- *Risk*: Windows Automatic Updates rebooting kiosk during retail operating hours.  
  *Mitigation*: Lockdown script configures Windows Group Policy (GPO) to permanently disable automatic reboots.

#### Dependencies
- Docker Engine, Ubuntu 22.04/24.04 VPS, Windows 10/11 IoT on physical kiosk PC.

#### Acceptance Criteria
- `AC-4.1`: Executing `docker compose -f docker-compose.prod.yml up -d` boots backend, database, redis, and nginx with 100% healthy statuses.
- `AC-4.2`: `GET /api/health` returns HTTP 200 with all subsystem health statuses marked connected.
- `AC-4.3`: Running `scripts/lockdown-kiosk.ps1` on a Windows machine configures auto-start and blocks access to the Windows desktop.

---

### Item 5: Email Provider Integration (Live Transactional Softfiles)

#### Technical Approach
- Create a dedicated `EmailService` (`apps/backend/src/email/email.service.ts`) supporting SendGrid and Resend REST APIs or SMTP.
- Configurable environment credentials: `EMAIL_PROVIDER` (`resend` or `sendgrid`), `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.
- Graceful Mock Fallback: If `EMAIL_API_KEY` is not provided, log a clear console warning and fall back to simulated console delivery without crashing.
- Responsive HTML Email Template:
  - Branded Pictolabs header with venue name (e.g. *Grand Indonesia*).
  - High-res photo strip composite preview.
  - Primary CTA button: "Unduh Foto & Video" (Download Photos & Videos) linking to `/d/:sessionId`.
  - Retention notice: *"Foto Anda tersimpan selama 30 hari hingga [Tanggal Expiration]."*
- Wire into:
  1. Kiosk session completion (when customer enters email on `QRScreen`).
  2. Support re-delivery endpoint `POST /api/sessions/:id/redelivery/email`.
- Rate limiting: maximum 3 emails per session per hour.
- Audit logging: record dispatch status to `session_events` and `redelivery_logs`.

#### Database Changes
- None required. `redelivery_logs` and `session_events` already support delivery audit tracking.

#### API Changes
- Update `POST /api/sessions/:id/redelivery/email` to invoke `EmailService.sendSoftfiles(session, recipientEmail)`.

#### Dashboard Changes
- Display live delivery feedback (Delivered / Rate Limited / Failed) in Re-delivery modal.

#### Risks & Mitigations
- *Risk*: Emails marked as spam by Gmail/Yahoo due to unconfigured SPF/DKIM records.  
  *Mitigation*: Document mandatory DNS records (`v=spf1 ...`, DKIM TXT) in deployment checklist.

#### Dependencies
- Resend or SendGrid API key, DNS records on `pictolabs.id`.

#### Acceptance Criteria
- `AC-5.1`: Calling `POST /api/sessions/:id/redelivery/email` with valid API key dispatches real HTML email arriving in inbox within 30 seconds.
- `AC-5.2`: When API key is unset, service logs payload to console and returns simulated success.
- `AC-5.3`: Exceeding 3 emails per session within 1 hour returns HTTP 429 Too Many Requests.

---

### Item 6: WhatsApp Unified Alert Foundation

#### Technical Approach
- **Core Directive: All system, hardware, and operational alerts are delivered directly to WhatsApp.**
- Create a backend `AlertService` (`apps/backend/src/alerts/alert.service.ts`) implementing an outbound webhook dispatcher for WhatsApp gateways (Fonnte, Wablas, or Twilio).
- Configurable credentials: `WA_GATEWAY_URL`, `WA_API_KEY`, `WA_ADMIN_PHONE`, `WA_ENABLED` (boolean).
- Internal Severity Classification:
  - `INFO`: Kiosk rebooted, service restored, test alerts, daily summary.
  - `WARNING`: Webcam fallback active, paper low (<20 sheets), 1 missed heartbeat, payment status polling fallback active.
  - `CRITICAL`: Printer jam/spooler failure, camera completely disconnected, booth offline ≥ 5m, Cloudflare R2 upload failure, payment webhook error spike.
- Anti-Spam Throttling: Enforce an in-memory/Redis cooldown tracker (15-minute cooldown per alert type per booth) to prevent message flooding during sustained outages.
- Standardized Indonesian Plain-Text Templates:
  ```
  [SEVERITY ICON] PICTOLABS ALERT - [SEVERITY]
  Booth: Booth #1 (Grand Indonesia - Lantai 3)
  Masalah: [EVENT TITLE]
  Waktu: 10 Sep 2026, 14:30 WIB
  Detail: [EVENT DESCRIPTION]
  Tindakan: [RECOMMENDED ACTION]
  Dashboard: https://admin.pictolabs.id/booths/bth-01
  ```

#### Database Changes
- None required (alert records logged to `logs` table).

#### API Changes
- **New Endpoint**: `POST /api/alerts/test` (restricted to authenticated admin) to verify WhatsApp gateway connectivity.

#### Dashboard Changes
- None required (headless notification engine).

#### Risks & Mitigations
- *Risk*: WhatsApp gateway outage or rate limiting.  
  *Mitigation*: Outbound alert dispatch executes asynchronously with a 5-second timeout, ensuring zero latency impact on kiosk transactions.

#### Dependencies
- WhatsApp gateway API credentials (Fonnte/Wablas/Twilio).

#### Acceptance Criteria
- `AC-6.1`: Triggering an alert event sends a formatted WhatsApp message to the target phone number within 10 seconds.
- `AC-6.2`: Triggering the same alert within 15 minutes is suppressed by the deduplication cooldown.
- `AC-6.3`: When `WA_ENABLED=false`, alert events are logged locally without throwing errors.

---

### Item 7: Localization Foundation (Bahasa Indonesia Default, English Ready)

#### Technical Approach
- Implement a lightweight, centralized translation architecture:
  - Create dictionary files:
    - `apps/dashboard/src/locales/id.json` (Bahasa Indonesia — **DEFAULT**).
    - `apps/dashboard/src/locales/en.json` (English — Secondary).
  - Create a custom hook `useTranslation` (`apps/dashboard/src/locales/useTranslation.ts`) backed by a persistent language store in `localStorage`.
  - Default language: `id` (Bahasa Indonesia).
  - Standardize operational terminology:
    - Navigation: *Ringkasan* (Overview), *Daftar Booth* (Booths), *Riwayat Sesi* (Sessions), *Galeri Media* (Gallery), *Bantuan & Pencarian* (Support).
    - Statuses: *Terhubung* (Online), *Terputus* (Offline), *Terganggu* (Degraded), *Perawatan* (Maintenance).
    - Support Actions: *Kirim Ulang Email* (Resend Email), *Perpanjang Link* (Extend Link), *Cetak Ulang Darurat* (Emergency Reprint).
    - Health: *Kamera* (Camera), *Printer* (Printer), *Penyimpanan* (Storage), *Detak Jantung* (Heartbeat), *Pembayaran* (Payment).
  - Add a sleek language switcher toggle (`ID | EN`) in the `AppShell.tsx` navigation header.

#### Database Changes
- None required.

#### API Changes
- None required.

#### Dashboard Changes
- **New File**: `apps/dashboard/src/locales/id.json`
- **New File**: `apps/dashboard/src/locales/en.json`
- **New File**: `apps/dashboard/src/locales/useTranslation.ts`
- **Modified**: `apps/dashboard/src/components/layout/AppShell.tsx` (adds language switcher toggle)
- **Modified**: Page components refactored to use `t('key')` labels.

#### Risks & Mitigations
- *Risk*: Indonesian text overflowing fixed-width buttons.  
  *Mitigation*: Audit button padding and flex layouts to ensure fluid expansion for Indonesian phrasing.

#### Dependencies
- None (pure React Context / custom Zustand store).

#### Acceptance Criteria
- `AC-7.1`: Dashboard loads in Bahasa Indonesia by default across navigation, buttons, and status labels.
- `AC-7.2`: Clicking the `EN` toggle switches all dashboard text to English immediately without reloading the page.
- `AC-7.3`: Language preference persists in `localStorage` across browser restarts.

---

### Item 8: Booth Health Dashboard Foundation (5 Core Pillars)

#### Technical Approach
- Build dedicated **5-Pillar Health Gauges** inside the Booth detail drawer (`apps/dashboard/src/components/booths/BoothHealthCard.tsx`):
  1. **Camera**:
     - *Normal*: Canon DSLR Connected (Green).
     - *Warning*: Webcam Fallback Active (Yellow).
     - *Critical*: Camera Disconnected (Red).
     - Actions: Remote Shutter Test, LiveView Ping.
  2. **Printer**:
     - *Normal*: DNP Spooler Ready, Paper Roll Healthy (Green).
     - *Warning*: Low Paper (<20 sheets remaining, Yellow).
     - *Critical*: Cutter Jam / Spooler Error (Red).
     - Actions: Test Print Spool.
  3. **Storage**:
     - *Normal*: Cloudflare R2 Reachable, 0 Unsynced Local Queue (Green).
     - *Warning*: Unsynced Offline Queue Processing (Yellow).
     - *Critical*: Cloud Upload Failures / R2 Credentials Expired (Red).
     - Actions: Force Sync Offline Queue.
  4. **Heartbeat**:
     - *Normal*: Heartbeat < 60s ago (Green).
     - *Warning*: Degraded (60s – 5m, Yellow).
     - *Critical*: Offline (≥ 5m, Red).
     - Display: "Terakhir terlihat [X] detik yang lalu".
  5. **Payment**:
     - *Normal*: Midtrans QRIS Operational, Instant Webhooks Active (Green).
     - *Warning*: Polling Fallback Active (Yellow).
     - *Critical*: Consecutive QRIS Failures / Webhook Unreachable (Red).
     - Display: Daily QRIS Success Rate (e.g. *98.5% Berhasil*).
- Aggregated health evaluation displayed on `OverviewPage.tsx` and `BoothsPage.tsx`.

#### Database Changes
- None required. Database already includes `BoothHealthLog` table and `Booth` metadata fields (`last_seen`, `cameraState`, `printerState`, `cpuTemp`, `paperCount`).

#### API Changes
- Extend or verify `GET /api/booths/:id/health` returning aggregated 5-pillar health telemetry and peripheral status.

#### Dashboard Changes
- **New File**: `apps/dashboard/src/components/booths/BoothHealthCard.tsx`
- **Modified**: `apps/dashboard/src/pages/BoothsPage.tsx` (embeds 5-pillar health card in booth inspection drawer)
- **Modified**: `apps/dashboard/src/pages/OverviewPage.tsx` (adds fleet health summary counters)

#### Risks & Mitigations
- *Risk*: Stale health readings if kiosk is offline or heartbeat interval is delayed.  
  *Mitigation*: Display exact relative timestamp badge (e.g. *12 detik yang lalu*) and visually gray out stale readings.

#### Dependencies
- `GET /api/booths/:id/health`, Sprint 4B heartbeat data.

#### Acceptance Criteria
- `AC-8.1`: Booth drawer renders visual status cards for all 5 pillars: Camera, Printer, Storage, Heartbeat, and Payment.
- `AC-8.2`: Disconnecting the camera or printer on the kiosk updates the dashboard health status to warning/error within 60 seconds.
- `AC-8.3`: Toggling Maintenance mode updates the kiosk screen to out-of-order and updates dashboard status within 2 seconds.

---

## 3. WhatsApp Unified Alerting Matrix & Severity Model

All alerts are dispatched to the operations WhatsApp gateway using the following standardized protocol:

| Event | Severity | Trigger Condition | Delivery | Expected Action / Playbook |
| :--- | :---: | :--- | :---: | :--- |
| **Camera Disconnected** | `CRITICAL` | Canon EDSDK disconnects, no video frames. | **WhatsApp** | Kiosk activates webcam fallback; technician reseats USB cable. |
| **Webcam Fallback Active** | `WARNING` | Kiosk operating on backup webcam. | **WhatsApp** | Non-blocking; technician schedules DSLR inspection. |
| **Printer Cutter Jam** | `CRITICAL` | Spooler reports cutter jam or print failure. | **WhatsApp** | Attendant toggles Maintenance mode, clears paper path. |
| **Paper Low (<20 Sheets)** | `WARNING` | Kiosk reports print counter nearing roll end. | **WhatsApp** | Attendant prepares replacement 4R/2R paper roll. |
| **Booth Offline (≥5m)** | `CRITICAL` | Kiosk misses heartbeats for 5 consecutive minutes. | **WhatsApp** | Verify mall electrical power breaker and venue Wi-Fi. |
| **Heartbeat Missed (1x)** | `WARNING` | Kiosk misses 1 heartbeat (60s – 5m window). | **WhatsApp** | Transient network drop; auto-recovery monitored. |
| **Storage Upload Critical** | `CRITICAL` | Cloudflare R2 upload fails repeatedly. | **WhatsApp** | Check cloud credentials; kiosk buffers in local SQLite. |
| **Payment Webhook Failure** | `CRITICAL` | ≥ 3 consecutive QRIS timeouts or webhook 500s. | **WhatsApp** | Inspect cloud SSL cert and Midtrans merchant dashboard. |
| **Payment Polling Active** | `WARNING` | Webhook delayed; kiosk using polling fallback. | **WhatsApp** | Transient network congestion; transactions still settle. |
| **Kiosk Back Online** | `INFO` | Kiosk reconnects after being offline. | **WhatsApp** | Confirmation of resolution; fleet status restored to Green. |
| **Test Alert** | `INFO` | Operator dispatches manual verification ping. | **WhatsApp** | Verifies WhatsApp gateway delivery pipeline. |

---

## 4. Phased Implementation Order

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SPRINT 5C EXECUTION PHASES                                     │
├────────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ PHASE 1: CORE SECURITY GATE    │ PHASE 2: COMMUNICATIONS & I18N │ PHASE 3: DEPLOYMENT & HEALTH   │
│ • Item 2: JWT Backend Security │ • Item 5: Email Provider       │ • Item 4: Cloud Docker Compose │
│ • Item 1: Dashboard Login Page │ • Item 6: WhatsApp Alert       │ • Item 4: Kiosk Shell Lockdown │
│ • Item 3: Protected Routes &   │ • Item 7: Bahasa Indonesia     │ • Item 8: 5-Pillar Health Card │
│   Axios Auth Interceptors      │   Default & Localization       │ • End-to-End Verification      │
└────────────────────────────────┴────────────────────────────────┴────────────────────────────────┘
```

### Phase 1: Core Security Gate (Estimated: 1 Day)
*Primary Objective: Protect backend APIs and dashboard before public network exposure.*
1. Implement `JwtAuthGuard`, `BoothSecretGuard`, and `@Public()` decorator in backend.
2. Apply global protection across all administrative REST controllers.
3. Build `LoginPage.tsx`, `useAuthStore`, and `<RequireAuth>` in dashboard.
4. Configure Axios request header injection and 401 response redirect interceptor.

### Phase 2: Communications & Localization (Estimated: 1 Day)
*Primary Objective: Enable real external delivery, technician alerts, and Indonesian UI.*
1. Implement `EmailService` supporting SendGrid/Resend API with responsive HTML softfile template.
2. Implement `AlertService` with WhatsApp webhook dispatcher, three-tier severity, and 15-minute cooldown.
3. Implement `apps/dashboard/src/locales/` with Bahasa Indonesia default and header language switcher.

### Phase 3: Deployment Readiness & 5-Pillar Health (Estimated: 1–1.5 Days)
*Primary Objective: Turnkey cloud hosting, kiosk PC lockdown, and visual hardware monitoring.*
1. Finalize `docker-compose.prod.yml`, Nginx HTTPS reverse proxy, and `GET /api/health`.
2. Author Windows kiosk shell lockdown script (`scripts/lockdown-kiosk.ps1`).
3. Build `BoothHealthCard.tsx` covering Camera, Printer, Storage, Heartbeat, and Payment.
4. Execute full automated verification and regression testing.

---

## 5. Estimated Complexity

### **Overall Sprint Complexity: MEDIUM**
- **Justification**:
  - Backend JWT and Prisma `User` models already exist in working code, requiring guard wiring rather than greenfield architecture.
  - Removing RBAC eliminated complex multi-role schema migrations and fine-grained permission matrix testing.
  - Email and WhatsApp integrations follow standardized external webhook/API patterns with built-in mock fallbacks.
  - Localization and the 5-pillar health card are modular frontend additions utilizing established data structures.
- **Estimated Effort**: **3 to 3.5 engineering days**.

---

## 6. Rollback Strategy

| Subsystem | Potential Failure Mode | Rollback Protocol |
| :--- | :--- | :--- |
| **JWT Security** | Edge kiosks blocked from sending heartbeats due to misconfigured guards. | Kiosk communication uses `BoothSecretGuard` independently. If user JWT causes issues, comment out the global `APP_GUARD` in `app.module.ts` to restore unauthenticated access in 60 seconds without redeploying kiosks. |
| **Dashboard Auth** | Support staff unable to log in due to auth store or token issues. | Remove `<RequireAuth>` wrapper in `App.tsx` and redeploy dashboard static bundle to revert to open dashboard mode. |
| **Email Service** | SendGrid / Resend API key invalid or domain unverified. | `EmailService` automatically falls back to console logging if credentials fail, ensuring no customer transactions or support requests fail. |
| **WhatsApp Alerts** | WhatsApp gateway rate limit or provider outage. | Alert dispatcher operates completely asynchronously with a 5-second timeout; gateway errors are caught and logged without affecting core kiosk or payment processing. |
| **Localization** | Untranslated strings or layout breaks. | Language switcher defaults back to English fallback strings if translation keys are missing. |

---

## 7. Production Impact Assessment

1. **Zero Regression on Kiosk Core Engines**:
   - Canon DSLR EDSDK C++ binding (`CameraService.ts`) is completely untouched.
   - Sharp 300 DPI composite layout engine (`RenderEngine.ts`) is completely untouched.
   - DNP thermal dye-sublimation print spooler is completely untouched.
   - Midtrans QRIS payment engine (`PaymentsService.ts`) is completely untouched.
2. **Customer Privacy Secured**:
   - Customer photos, email addresses, and phone numbers are no longer exposed on open network routes.
3. **Operational Visibility Established**:
   - Support staff can operate the dashboard in Bahasa Indonesia.
   - Technicians receive automated WhatsApp alerts classified by `INFO`, `WARNING`, and `CRITICAL`.
   - The 5 core operational pillars (Camera, Printer, Storage, Heartbeat, Payment) are visually observable in real time.
4. **Booth #1 Ready for Commercial Installation**:
   - Turnkey Docker Compose configuration and Windows Shell Launcher script provide an immediate, repeatable deployment path for the physical kiosk.

---

## 8. Definition of Done (DoD) for Sprint 5C (V2)

A feature is considered complete and approved only when all the following criteria are verified:

1. **Authentication Gate**:
   - The dashboard cannot be accessed without entering valid credentials at `/login`.
   - Logging in issues a signed JWT and populates user state.
   - Logging out completely purges credentials and returns to `/login`.
2. **API Protection**:
   - Every administrative REST route returns `401 Unauthorized` when called without a valid token.
   - Kiosk heartbeat and sync endpoints continue functioning using booth device secrets.
3. **Live Transactional Email**:
   - Completing a session with an email address sends a real, formatted HTML email arriving in an inbox within 30 seconds.
   - Dashboard "Kirim Ulang Email" dispatches a real email and logs an entry in `redelivery_logs`.
4. **Unified WhatsApp Notification**:
   - Triggering any alert dispatches a formatted Indonesian WhatsApp message classified by `INFO`, `WARNING`, or `CRITICAL` within 10 seconds.
   - 15-minute anti-spam deduplication suppresses duplicate alerts.
5. **Localization (Bahasa Indonesia Default)**:
   - Dashboard renders in Bahasa Indonesia by default across all screens.
   - Language switcher switches dynamically between `ID` and `EN` with persistence.
6. **5-Pillar Booth Health**:
   - Booth inspection drawer displays real-time status cards for Camera, Printer, Storage, Heartbeat, and Payment.
7. **Deployment Blueprint**:
   - `docker-compose.prod.yml` and `.env.production.example` are verified.
   - Windows kiosk shell lockdown script is verified on a Windows machine.
8. **Zero Regression**:
   - Core kiosk capture, DNP printing, Sharp 300 DPI rendering, and Midtrans QRIS payment continue operating with zero regressions.

---
*End of Sprint 5C Implementation Plan (Revision V2).*
