# SPRINT 5C IMPLEMENTATION PLAN
## Security & Deployment Readiness for Commercial Booth #1

> **Sprint**: Sprint 5C  
> **Milestone**: Pre-Production Operational Gate for Commercial Deployment  
> **Document Status**: Complete Implementation Specification  
> **Date**: September 10, 2026  
> **Scope Adjustment Note**: **Role-Based Access Control (RBAC) has been removed from Sprint 5C** to streamline deployment focus onto authentication, infrastructure, alerting, and operational readiness.  
> **Primary Sources of Truth**: `SPRINT_5C_PRD.md`, `PROJECT_STATUS_REPORT.md`, `PICTOLABS_PLATFORM_ARCHITECTURE.md`

---

## 1. Goal & Architectural Scope

The goal of Sprint 5C is to prepare Pictolabs for the physical, real-world deployment of **Booth #1** in a commercial shopping mall.

### Core Objectives
1. **Secure the Control Plane**: Lock the operations dashboard behind an authentication gate (`/login`) and enforce JWT verification across all backend REST APIs.
2. **Turnkey Production Infrastructure**: Provide automated Docker Compose cloud orchestration, Nginx HTTPS reverse proxy configuration, and a Windows kiosk shell lockdown script.
3. **Live Customer & Operational Communications**: Replace mock email logging with live transactional softfile delivery (SendGrid/Resend) and establish emergency WhatsApp alerts for hardware failures.
4. **Localization Foundation**: Set **Bahasa Indonesia** as the default dashboard language while maintaining English future-readiness.
5. **Real-Time Hardware Health**: Visual booth telemetry for cameras, printers, and storage queues in the dashboard.

---

## 2. In-Depth Technical Specifications (8 Scope Items)

---

### Item 1: Dashboard Login Screen

#### Technical Approach
- Implement a dedicated page component `LoginPage.tsx` in `apps/dashboard/src/pages/LoginPage.tsx`.
- Design a clean, responsive glassmorphic login interface featuring Pictolabs branding, email input, password input with show/hide toggle, "Sign In" button with loading spinner, and error alert banners.
- Create a client-side authentication store `useAuthStore` (`apps/dashboard/src/stores/useAuthStore.ts`) using Zustand:
  - State: `token`, `user` (`id`, `email`, `name`, `role`), `isAuthenticated`, `isLoading`, `error`.
  - Actions: `login(email, password)`, `logout()`, `initialize()`.
  - Persist token and user profile in `localStorage`.
- Add an authenticated User Profile & Sign Out menu to `AppShell.tsx` header displaying user name, email badge, and "Keluar" / "Sign Out" button.

#### Database Changes
- None required. The `User` table already exists in `schema.prisma` with `id`, `email`, `password` (bcrypt hashed), `name`, and `role`.
- A database seed script ensures a default administrator account (`admin@pictolabs.id`) is seeded upon migration.

#### API Changes
- Consumes the existing endpoint:
  - `POST /api/auth/login` — Accepts `{ email, password }`, returns `{ accessToken, user: { id, email, name, role } }`.

#### Dashboard Changes
- **New File**: `apps/dashboard/src/pages/LoginPage.tsx`
- **New File**: `apps/dashboard/src/stores/useAuthStore.ts`
- **Modified**: `apps/dashboard/src/components/layout/AppShell.tsx` (adds user avatar & logout button)
- **Modified**: `apps/dashboard/src/App.tsx` (registers `/login` route)

#### Risks & Mitigations
- *Risk*: User session lost on browser tab refresh.  
  *Mitigation*: Rehydrate auth state from `localStorage` during initial app mount in `useAuthStore.initialize()`.

#### Dependencies
- Backend `POST /api/auth/login`, Zustand.

#### Acceptance Criteria
- `AC-1.1`: Navigating to `/login` renders email input, password input, and submit button.
- `AC-1.2`: Submitting invalid credentials displays an error message without clearing the email input.
- `AC-1.3`: Submitting valid credentials stores the JWT in `localStorage`, updates user state, and navigates to `/`.
- `AC-1.4`: Clicking "Sign Out" in the dashboard header clears stored credentials and redirects to `/login`.

---

### Item 2: JWT Authentication Architecture

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
  - `BoothsController` (management routes)
  - `SessionsController` (archive, search, re-delivery routes)
  - `SupportController` (customer search routes)
  - `GalleryController` (administrative asset views)
- Explicit `@Public()` whitelist applied to:
  - `POST /api/auth/login` (authentication)
  - `POST /api/auth/booth` (booth edge auth)
  - `POST /api/payments/webhook` (Midtrans webhook, verified via SHA-512)
  - `GET /d/:sessionId` (public mobile gallery page)
  - `GET /api/gallery/:sessionId` (customer gallery JSON manifest)
  - `GET /api/gallery/:sessionId/zip` (customer streaming ZIP download)
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
  *Mitigation*: Separate `BoothSecretGuard` from `JwtAuthGuard`, accompanied by explicit automated E2E tests verifying kiosk heartbeats succeed without user tokens.

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

### Item 4: Deployment Readiness (Production Infrastructure & Kiosk Lockdown)

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
- *Risk*: Windows Automatic Updates unexpectedly rebooting the kiosk during retail operating hours.  
  *Mitigation*: Lockdown script configures Windows Group Policy (GPO) to permanently disable automatic reboots.

#### Dependencies
- Docker Engine, Ubuntu 22.04/24.04 VPS, Windows 10/11 IoT on physical kiosk PC.

#### Acceptance Criteria
- `AC-4.1`: Executing `docker compose -f docker-compose.prod.yml up -d` boots backend, database, redis, and nginx with 100% healthy statuses.
- `AC-4.2`: `GET /api/health` returns HTTP 200 with all subsystem health statuses marked connected.
- `AC-4.3`: Running `scripts/lockdown-kiosk.ps1` on a Windows machine configures auto-start and blocks access to the Windows desktop.

---

### Item 5: Email Provider Integration (Live Transactional Delivery)

#### Technical Approach
- Create a dedicated `EmailService` (`apps/backend/src/email/email.service.ts`) supporting SendGrid and Resend REST APIs or SMTP.
- Configurable environment credentials: `EMAIL_PROVIDER` (`resend` or `sendgrid`), `EMAIL_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.
- Graceful Mock Fallback: If `EMAIL_API_KEY` is not provided, log a clear console warning and fall back to simulated console delivery without crashing.
- Responsive HTML Email Template:
  - Branded Pictolabs header with venue name (e.g. *Grand Indonesia*).
  - High-res photo strip composite preview.
  - Primary CTA button: "Download Photos & Videos" linking to `/d/:sessionId`.
  - Retention notice: *"Your photos are available for 30 days until [Date]."*
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
  *Mitigation*: Document mandatory DNS records (`v=spf1 ...`, DKIM TXT) in `DEPLOYMENT_PLAN.md`.

#### Dependencies
- Resend or SendGrid API key, DNS records on `pictolabs.id`.

#### Acceptance Criteria
- `AC-5.1`: Calling `POST /api/sessions/:id/redelivery/email` with valid API key dispatches real HTML email arriving in inbox within 30 seconds.
- `AC-5.2`: When API key is unset, service logs payload to console and returns simulated success.
- `AC-5.3`: Exceeding 3 emails per session within 1 hour returns HTTP 429 Too Many Requests.

---

### Item 6: WhatsApp Alert Foundation (Emergency Tech Notifications)

#### Technical Approach
- Create a backend `AlertService` (`apps/backend/src/alerts/alert.service.ts`) implementing an outbound webhook dispatcher for WhatsApp gateways (Fonnte, Wablas, or Twilio).
- Configurable credentials: `WA_GATEWAY_URL`, `WA_API_KEY`, `WA_ADMIN_PHONE`, `WA_ENABLED` (boolean).
- Anti-Spam Throttling: Implement an in-memory/Redis cooldown tracker enforcing a 15-minute cooldown per alert type per booth.
- Indonesian Plain-Text Template:
  ```
  🚨 [PICTOLABS ALERT - GANGGUAN HARDWARE]
  Booth: Booth #1 (Grand Indonesia)
  Status: PRINTER ERROR / PAPER JAM
  Waktu: 10 Sep 2026, 14:30 WIB
  Detail: Windows spooler melaporkan job print gagal.
  Tindakan: Periksa roll kertas printer dan bersihkan cutter.
  Dashboard: https://admin.pictolabs.id/booths/bth-01
  ```
- Alert Triggers:
  1. `BOOTH_OFFLINE`: Heartbeat missing for ≥ 5 minutes.
  2. `CAMERA_OFFLINE`: Canon DSLR disconnects and fallback webcam activates.
  3. `PRINTER_ERROR`: Print spooler error or paper jam reported.
  4. `PAYMENT_ANOMALY`: Multiple consecutive QRIS payment timeouts.

#### Database Changes
- None required.

#### API Changes
- **New Endpoint**: `POST /api/alerts/test` (restricted to authenticated admin) to verify WhatsApp gateway connectivity.

#### Dashboard Changes
- None required (headless notification engine).

#### Risks & Mitigations
- *Risk*: Third-party WhatsApp gateway downtime blocking backend operations.  
  *Mitigation*: Outbound alert dispatch executes asynchronously with a 5-second timeout, ensuring zero blockage of customer kiosk flows.

#### Dependencies
- WhatsApp gateway API credentials (Fonnte/Wablas/Twilio).

#### Acceptance Criteria
- `AC-6.1`: Triggering a test alert sends a formatted WhatsApp message to the target phone number within 10 seconds.
- `AC-6.2`: Triggering the same alert within 15 minutes is suppressed by the deduplication cooldown.
- `AC-6.3`: When `WA_ENABLED=false`, alert events are logged locally without throwing errors.

---

### Item 7: Localization Foundation (Bahasa Indonesia Default, English Ready)

#### Technical Approach
- Implement a lightweight, centralized translation architecture:
  - Create dictionary files:
    - `apps/dashboard/src/locales/id.json` (Bahasa Indonesia — DEFAULT).
    - `apps/dashboard/src/locales/en.json` (English — Secondary).
  - Create a custom hook `useTranslation` (`apps/dashboard/src/locales/useTranslation.ts`) backed by a persistent language store in `localStorage`.
  - Default language: `id` (Bahasa Indonesia).
  - Standardize operational terminology:
    - Navigation: *Ringkasan* (Overview), *Daftar Booth* (Booths), *Riwayat Sesi* (Sessions), *Galeri Media* (Gallery), *Bantuan & Pencarian* (Support).
    - Statuses: *Terhubung* (Online), *Terputus* (Offline), *Terganggu* (Degraded), *Perawatan* (Maintenance).
    - Support Actions: *Kirim Ulang Email* (Resend Email), *Perpanjang Link* (Extend Link), *Cetak Ulang Darurat* (Emergency Reprint).
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

### Item 8: Booth Health Dashboard Foundation

#### Technical Approach
- Leverage the Sprint 4B heartbeat telemetry (`last_seen`, `cameraState`, `printerState`, `cpuTemp`, `paperCount`) stored in `booths` and `booth_health_logs`.
- Create a dedicated `BoothHealthCard.tsx` component in `apps/dashboard/src/components/booths/BoothHealthCard.tsx`.
- Enhance the Booth detail drawer in `BoothsPage.tsx` with:
  - **Connectivity Gauge**: Online (<60s, Green), Degraded (<5m, Yellow), Offline (≥5m, Red).
  - **Peripheral Subsystem Status**:
    - Camera: Canon DSLR Connected (Green) vs Webcam Fallback (Yellow) vs Disconnected (Red).
    - Printer: Ready (Green) vs Low Paper (<20 sheets, Yellow) vs Jam/Offline (Red).
    - Storage Queue: 0 Pending (Green) vs Syncing Queue (Yellow).
  - **Runtime Badges**: Machine Name, Local IP, App Version, Git Commit Hash, OS Version.
  - **Quick Action Buttons**: Toggle Maintenance Mode, Remote Ping, Refresh Telemetry.

#### Database Changes
- None required. Database already includes `BoothHealthLog` table and `Booth` metadata fields.

#### API Changes
- Extend or verify `GET /api/booths/:id/health` returning aggregated latest telemetry and peripheral statuses.

#### Dashboard Changes
- **New File**: `apps/dashboard/src/components/booths/BoothHealthCard.tsx`
- **Modified**: `apps/dashboard/src/pages/BoothsPage.tsx` (embeds health card in booth inspection drawer)
- **Modified**: `apps/dashboard/src/pages/OverviewPage.tsx` (adds fleet health summary counter)

#### Risks & Mitigations
- *Risk*: Stale telemetry shown if a booth drops offline.  
  *Mitigation*: Display exact "Terakhir Terlihat" (Last Seen) relative timestamp badge (e.g. *12 detik yang lalu*).

#### Dependencies
- `GET /api/booths/:id/health`, Sprint 4B heartbeat data.

#### Acceptance Criteria
- `AC-8.1`: Booth drawer renders visual status cards for Camera, Printer, and Storage queue.
- `AC-8.2`: Disconnecting the camera or printer on the kiosk updates the dashboard health status to warning/error within 60 seconds.
- `AC-8.3`: Toggling Maintenance mode updates the kiosk screen to out-of-order and updates dashboard status within 2 seconds.

---

## 3. Phased Implementation Order

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SPRINT 5C EXECUTION PHASES                                     │
├────────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ PHASE 1: CORE SECURITY GATE    │ PHASE 2: COMMUNICATIONS & I18N │ PHASE 3: DEPLOYMENT & HEALTH   │
│ • Item 2: JWT Backend Security │ • Item 5: Email Provider       │ • Item 4: Cloud Docker Compose │
│ • Item 1: Dashboard Login Page │ • Item 6: WhatsApp Alert       │ • Item 4: Kiosk Shell Lockdown │
│ • Item 3: Protected Routes &   │ • Item 7: Bahasa Indonesia     │ • Item 8: Booth Health Board   │
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
2. Implement `AlertService` with WhatsApp webhook dispatcher and 15-minute cooldown throttling.
3. Implement `apps/dashboard/src/locales/` with Bahasa Indonesia default and header language switcher.

### Phase 3: Deployment Readiness & Hardware Health (Estimated: 1–1.5 Days)
*Primary Objective: Turnkey cloud hosting, kiosk PC lockdown, and visual hardware monitoring.*
1. Finalize `docker-compose.prod.yml`, Nginx HTTPS reverse proxy, and `GET /api/health`.
2. Author Windows kiosk shell lockdown script (`scripts/lockdown-kiosk.ps1`).
3. Build `BoothHealthCard.tsx` in dashboard for visual camera, printer, and queue telemetry.
4. Execute full automated verification and regression testing.

---

## 4. Estimated Complexity

### **Overall Sprint Complexity: MEDIUM**
- **Justification**:
  - Backend JWT and Prisma `User` models already exist in working code, requiring only guard wiring rather than greenfield architecture.
  - Email and WhatsApp integrations follow standardized external webhook/API patterns with built-in mock fallbacks.
  - Removing RBAC eliminates complex multi-role database migration, schema changes, and fine-grained permission matrix testing.
  - Localization and health cards are straightforward frontend additions using established patterns.
- **Estimated Effort**: **3 to 3.5 engineering days**.

---

## 5. Rollback Strategy

| Subsystem | Potential Failure Mode | Rollback Protocol |
| :--- | :--- | :--- |
| **JWT Security** | Edge kiosks blocked from sending heartbeats due to misconfigured guards. | Kiosk communication uses `BoothSecretGuard` independently. If user JWT causes issues, comment out the global `APP_GUARD` in `app.module.ts` to restore unauthenticated access in 60 seconds without redeploying kiosks. |
| **Dashboard Auth** | Support staff unable to log in due to auth store or token issues. | Remove `<RequireAuth>` wrapper in `App.tsx` and redeploy dashboard static bundle to revert to open dashboard mode. |
| **Email Service** | SendGrid / Resend API key invalid or domain unverified. | `EmailService` automatically falls back to console logging if credentials fail, ensuring no customer transactions or support requests fail. |
| **WhatsApp Alerts** | WhatsApp gateway rate limit or provider outage. | Alert dispatcher operates completely asynchronously with a 5-second timeout; gateway errors are caught and logged without affecting core kiosk or payment processing. |
| **Localization** | Untranslated strings or layout breaks. | Language switcher defaults back to English fallback strings if translation keys are missing. |

---

## 6. Production Impact Assessment

1. **Zero Regression on Kiosk Core Engines**:
   - Canon DSLR EDSDK C++ binding (`CameraService.ts`) is completely untouched.
   - Sharp 300 DPI composite layout engine (`RenderEngine.ts`) is completely untouched.
   - DNP thermal dye-sublimation print spooler is completely untouched.
   - Midtrans QRIS payment engine (`PaymentsService.ts`) is completely untouched.
2. **Customer Privacy Secured**:
   - Customer photos, email addresses, and phone numbers are no longer exposed on open network routes.
3. **Operational Visibility Established**:
   - Support staff can operate the dashboard in Bahasa Indonesia.
   - Technicians receive automated WhatsApp alerts when hardware failures occur.
4. **Booth #1 Ready for Commercial Installation**:
   - Turnkey Docker Compose configuration and Windows Shell Launcher script provide an immediate, repeatable deployment path for the physical kiosk.

---
*End of Sprint 5C Implementation Plan.*
