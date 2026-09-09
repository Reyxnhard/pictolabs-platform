# POST SPRINT 5C DEPLOYMENT READINESS AUDIT
## Unvarnished Technical Assessment for Commercial Booth #1 Launch

> **Audit Date**: September 10, 2026  
> **Target Milestone**: Commercial Booth #1 Mall Deployment  
> **Auditor**: Antigravity Technical Architecture & Deployment Auditor  
> **Methodology**: Static Code Analysis, Automated Test Verification, Runtime Environment Inspection  
> **Scope**: 12 Critical Operational & Security Pillars  

---

## Executive Summary Status Matrix

| # | Audit Item | Classification | Readiness Score | Action Required Before Retail Opening |
| :-: | :--- | :---: | :---: | :--- |
| **1** | **Authentication** | **PRODUCTION READY** | 90% | Change default password; add IP rate-limiting to `/login`. |
| **2** | **JWT Security** | **PRODUCTION READY** | 95% | Ensure strong `JWT_SECRET` in production `.env`. |
| **3** | **Dashboard Login** | **PRODUCTION READY** | 95% | None blocking; consider session timeout warning. |
| **4** | **Localization** | **PARTIAL** | 80% | Translate remaining secondary tables / admin settings. |
| **5** | **Email Provider** | **PARTIAL** | 75% | Add live Resend API key and verify domain DNS (DKIM/SPF). |
| **6** | **WhatsApp Alerting** | **PARTIAL** | 70% | Connect paid WhatsApp gateway endpoint (Fonnte/Wablas). |
| **7** | **Booth Health Dashboard** | **PRODUCTION READY** | 95% | None blocking; ensure kiosk heartbeat loop runs continuously. |
| **8** | **Docker Production Deployment** | **PARTIAL** | 65% | Add missing Sprint 5C envs to `docker-compose.prod.yml` & configure NGINX dashboard host. |
| **9** | **Midtrans Production Readiness** | **PARTIAL** | 70% | Swap Sandbox keys for Production Merchant credentials; verify webhook URL. |
| **10** | **Cloudflare R2 Production Readiness** | **PARTIAL** | 80% | Grant `Lifecycle` permission to R2 API token; bind CNAME `dl.pictolabs.id`. |
| **11** | **Kiosk Lockdown Readiness** | **NOT VERIFIED** | 50% | Run `lockdown-kiosk.ps1` on physical Windows PC and test touchscreen gestures. |
| **12** | **Commercial Booth #1 Readiness** | **PARTIAL** | 75% | Complete physical hardware staging (Canon DSLR + DNP printer + PC) and live end-to-end dry run. |

---

## Detailed Audit by Pillar

---

### 1. Authentication
- **Classification**: `PRODUCTION READY`
- **Evidence**:
  - Implementation in [`pictolabs-rebuild/apps/backend/src/auth/auth.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/auth/auth.service.ts).
  - Automatically seeds default administrator (`admin@pictolabs.id`) on application boot with `bcrypt` (10 salt rounds).
  - Secure credential comparison (`bcrypt.compare`); rejects invalid email/password with HTTP 401 Unauthorized.
  - Automated E2E verification passed in [`sprint5c.e2e.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sprint5c.e2e.ts) (Step 3: valid credentials issue JWT, invalid credentials rejected).
- **Remaining Gaps**:
  - No self-service password reset or password change UI inside the dashboard (password modification currently requires direct DB query or initialization script).
  - No account lockout mechanism after repeated failed attempts (e.g. lockout after 5 failed passwords).
- **Production Risks**:
  - **Critical Risk**: Default deployment credentials (`admin@pictolabs.id` / `pictolabs2026`) must be changed immediately upon production database provisioning. Leaving the default password exposed to public internet will allow unauthorized access to all session photos and financial records.
  - Potential brute-force vulnerability on `/api/auth/login` without upstream rate limiting.

---

### 2. JWT Security
- **Classification**: `PRODUCTION READY`
- **Evidence**:
  - Global `JwtAuthGuard` registered as NestJS `APP_GUARD` in [`app.module.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/app.module.ts).
  - Passport JWT strategy in [`auth/strategies/jwt.strategy.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/auth/strategies/jwt.strategy.ts) validates Bearer tokens on all incoming HTTP requests.
  - Public whitelist decorator `@Public()` in [`auth/decorators/public.decorator.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/auth/decorators/public.decorator.ts) correctly exempts customer galleries (`/d/:sessionId`), Midtrans webhooks, and `/api/health`.
  - Dedicated `BoothSecretGuard` in [`auth/guards/booth-secret.guard.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/auth/guards/booth-secret.guard.ts) enables edge kiosks to communicate via `X-Booth-Secret` header without requiring human user JWTs.
  - Automated E2E verified in `sprint5c.e2e.ts` (Steps 2, 4, 5).
- **Remaining Gaps**:
  - Stateless JWT token lifecycle (expires in 7 days). No token blacklist or revocation list (e.g., Redis-backed revocation table) is currently implemented.
  - Secret key falls back to default string (`pictolabs-dev-secret`) if `JWT_SECRET` is omitted from environment variables.
- **Production Risks**:
  - If an admin JWT token is stolen or leaked from a public device, it cannot be revoked before 7 days without rotating the global `JWT_SECRET` (which invalidates all active sessions).

---

### 3. Dashboard Login
- **Classification**: `PRODUCTION READY`
- **Evidence**:
  - Modern glassmorphic login UI in [`apps/dashboard/src/pages/LoginPage.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/pages/LoginPage.tsx).
  - Client authentication store [`useAuthStore.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/stores/useAuthStore.ts) securely persists token and user metadata in `localStorage`.
  - Route guard wrapper [`RequireAuth.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/components/auth/RequireAuth.tsx) intercepts unauthorized navigation, preserves requested destination, and redirects to `/login`.
  - Axios response interceptor in [`services/api.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/services/api.ts) automatically attaches `Authorization: Bearer <token>` and purges session on HTTP 401.
  - Header profile indicator in [`Header.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/components/layout/Header.tsx) shows user avatar, email, and functioning "Keluar" (Sign Out) button.
  - Production build compiled cleanly (`tsc -b && vite build` in 3.25s).
- **Remaining Gaps**:
  - No remember-me expiration duration option (fixed to browser `localStorage`).
  - No advance warning modal before token expiration (simply redirects to `/login` when an API call fails with 401).
- **Production Risks**:
  - If dashboard operator leaves browser open on a shared retail booth computer without locking, access remains active until token expiration.

---

### 4. Localization
- **Classification**: `PARTIAL`
- **Evidence**:
  - Centralized JSON translation dictionaries in [`apps/dashboard/src/locales/id.json`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/locales/id.json) (Default: Bahasa Indonesia) and [`en.json`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/locales/en.json) (Secondary: English).
  - Custom hook [`useTranslation.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/locales/useTranslation.ts) supporting fallback keys, dot notation nesting, and automatic persistence to `localStorage` (`pictolabs_lang`).
  - Interactive header switcher (`ID | EN`) allows instant language switching without reloading the page.
  - Core views fully localized: Navigation Sidebar, Header, LoginPage, BoothHealthCard, Support Search, Session Timeline, and Redelivery panel.
- **Remaining Gaps**:
  - Secondary/nested tables (e.g. deep Analytics breakdowns, raw SQL/Prisma logs, system configuration parameters) still contain hardcoded English strings.
  - Customer-facing kiosk UI uses a separate hardcoded text structure rather than sharing this central localization hook.
- **Production Risks**:
  - Booth operators or local technicians reading diagnostic screens may encounter mixed English and Indonesian terminology during troubleshooting.

---

### 5. Email Provider
- **Classification**: `PARTIAL`
- **Evidence**:
  - Service implemented in [`apps/backend/src/email/email.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/email/email.service.ts).
  - Direct integration with Resend REST API (`https://api.resend.com/emails`) via native `fetch`.
  - Professional responsive HTML photostrip softfile template with download button, retention warning, and venue branding.
  - Rate limiting safeguard: enforces maximum 3 emails per session per hour (returns HTTP 429 Too Many Requests on breach).
  - Graceful mock fallback: if `RESEND_API_KEY` is missing or API errors, falls back to logging without crashing kiosk customer flow.
  - Integrated into [`SessionRedeliveryService.resendEmail(...)`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sessions/session-redelivery.service.ts).
  - Verified in `sprint5c.e2e.ts` (Step 7).
- **Remaining Gaps**:
  - Running in `FALLBACK_MOCK` mode because a valid production Resend API key (`re_...`) has not been populated in the environment.
  - Domain verification (DNS DKIM, SPF, and DMARC records for `delivery@pictolabs.id`) has not been completed on Resend's production dashboard.
- **Production Risks**:
  - Until a verified domain and active API key are configured, emails sent to customers will only be simulated in backend logs; real customers will not receive softfiles via email.

---

### 6. WhatsApp Alerting
- **Classification**: `PARTIAL`
- **Evidence**:
  - Operational alerting service implemented in [`apps/backend/src/alerts/alert.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/alerts/alert.service.ts).
  - Supports three severity levels: `INFO`, `WARNING`, `CRITICAL` with visual emoji indicators.
  - Pre-formatted Indonesian alert messages including booth name, venue branch, incident summary, timestamp, direct dashboard remediation URL, and technician action.
  - Anti-spam deduplication: enforces 15-minute cooldown per alert type per booth.
  - Exposed test endpoint `POST /api/alerts/test` for gateway validation.
  - Verified in `sprint5c.e2e.ts` (Step 8).
- **Remaining Gaps**:
  - Currently running in simulated mock mode (`simulated: true`) because `WA_GATEWAY_URL` and `WA_API_KEY` are not configured in `.env`.
  - No active vendor account (e.g. Fonnte, Wablas, or Meta WhatsApp Cloud API) has been provisioned.
- **Production Risks**:
  - In an unattended booth environment, critical hardware issues (paper jam, camera disconnect, power cycle) will fail to alert field staff via WhatsApp until gateway credentials are added.

---

### 7. Booth Health Dashboard
- **Classification**: `PRODUCTION READY`
- **Evidence**:
  - Dedicated UI component [`BoothHealthCard.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/components/booths/BoothHealthCard.tsx) embedded in [`BoothDetailDrawer.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/components/booths/BoothDetailDrawer.tsx).
  - Visualizes all 5 operational pillars:
    1. **Camera**: Canon DSLR 30 FPS LiveView vs Webcam Fallback vs Disconnected.
    2. **Printer**: DNP Spooler Status & Remaining Paper Counter (e.g. *320 lembar*).
    3. **Storage**: Cloudflare R2 Connection & Offline Upload Queue status.
    4. **Heartbeat**: Status delta (<60s Online, <5m Degraded, ≥5m Offline).
    5. **Payment**: Midtrans QRIS status & gateway settlement indicator.
  - Backend API endpoint `GET /api/booths/:id/health` implemented in [`booths.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts) and verified in `sprint5c.e2e.ts` (Step 6).
- **Remaining Gaps**:
  - Telemetry values depend on the kiosk transmitting regular `/api/booths/:id/heartbeat` payloads. If the kiosk loses internet, the backend correctly flags the booth as OFFLINE, but the last-known paper count or camera status remains frozen until reconnection.
- **Production Risks**:
  - If mall Wi-Fi has high packet loss or latency spikes, heartbeat thresholds might cause transient "DEGRADED" warnings even if the booth is physically operational.

---

### 8. Docker Production Deployment
- **Classification**: `PARTIAL`
- **Evidence**:
  - Deployment configuration files: [`docker-compose.prod.yml`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/docker-compose.prod.yml), [`docker-compose.yml`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/docker-compose.yml), and [`nginx/nginx.conf`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/nginx/nginx.conf).
  - PostgreSQL 16 Alpine, Redis 7 Alpine, NestJS Backend, and NGINX run healthy in containerized setup.
  - Production environment template [`pictolabs-rebuild/.env.production.example`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/.env.production.example) documents all required keys.
  - NGINX configuration includes rate-limiting zones, SSL configuration, WebSocket reverse-proxying, and HTTP 206 video range request forwarding.
- **Remaining Gaps**:
  - **Environment Passthrough Omission**: `docker-compose.prod.yml` does not currently pass the new Sprint 5C variables (`RESEND_API_KEY`, `WA_GATEWAY_URL`, `WA_API_KEY`, `WA_ADMIN_PHONE`, `WA_ENABLED`) into the `backend.environment` container configuration.
  - **Dashboard Hosting**: The dashboard is currently hosted as a separate Vite dev/preview server. `docker-compose.prod.yml` and `nginx.conf` lack an `admin.pictolabs.id` static file service block for serving pre-built dashboard assets directly from NGINX.
  - **SSL Certificates**: Real Let's Encrypt certificates for `api.pictolabs.id` and `dl.pictolabs.id` must be provisioned on the production VPS host.
- **Production Risks**:
  - Deploying `docker-compose.prod.yml` without updating its `environment` block will silently run backend email and WhatsApp services in mock mode.
  - Dashboard will not be accessible over HTTPS until an NGINX server block or static hosting container (e.g. Vercel/Cloudflare Pages or NGINX static volume) is configured for `admin.pictolabs.id`.

---

### 9. Midtrans Production Readiness
- **Classification**: `PARTIAL`
- **Evidence**:
  - Implemented in [`apps/backend/src/payments/payments.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts).
  - Core API QRIS integration with `midtrans-client`.
  - Dynamic order ID generation: `TRX_<booth>_<timestamp>_<rand>`.
  - SHA-512 webhook signature verification: `crypto.createHash('sha512').update(...)`.
  - Real-time WebSocket emission to kiosk upon settlement confirmation.
  - Fallback EMVCo QRIS string generation for offline simulation.
- **Remaining Gaps**:
  - Currently configured with Midtrans Sandbox server/client keys (`SB-Mid-server-...`).
  - Production Midtrans merchant account has not been linked (`MIDTRANS_IS_PRODUCTION=true` with live `Mid-server-...` keys).
  - Live bank settlement test (BCA QRIS / GoPay / ShopeePay real money payment) has not been performed in production.
  - Midtrans Merchant Administration Portal (MAP) webhook notification URL must be configured to point to `https://api.pictolabs.id/api/payments/webhook`.
- **Production Risks**:
  - Customers in the mall cannot scan and pay with real banking apps until the merchant account is activated and live keys are loaded.
  - If the webhook URL or signature verification fails in production, the customer's payment will succeed in their mobile banking app, but the kiosk will remain stuck on the payment waiting screen.

---

### 10. Cloudflare R2 Production Readiness
- **Classification**: `PARTIAL`
- **Evidence**:
  - Storage service implemented in [`apps/backend/src/storage/storage.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts).
  - S3-compatible client (`@aws-sdk/client-s3`) configured with Cloudflare R2 endpoint.
  - Presigned upload URL generation with 15-minute expiration window.
  - Dual-tier retention strategy (7-day local on kiosk, 30-day in R2 cloud).
  - Full Sprint 3 storage regression suite passed 100% (30/30 assertions in `npm run test:storage`).
- **Remaining Gaps**:
  - During test execution, setting the bucket lifecycle returned:  
    `WARN [StorageService] Could not set R2 bucket lifecycle: Access Denied`  
    The configured R2 API token has Read/Write permissions but lacks `Lifecycle` policy administration permissions.
  - Custom public CDN domain (`dl.pictolabs.id`) requires DNS CNAME verification in Cloudflare dashboard.
- **Production Risks**:
  - Without automated bucket lifecycle expiration, photos uploaded to Cloudflare R2 will persist indefinitely, increasing storage costs and violating the customer 30-day retention privacy commitment unless manually purged.
  - If R2 credentials fail in production, the backend defaults to local VPS disk storage, which could eventually exhaust disk space.

---

### 11. Kiosk Lockdown Readiness
- **Classification**: `NOT VERIFIED`
- **Evidence**:
  - Automated PowerShell script created in [`pictolabs-rebuild/scripts/lockdown-kiosk.ps1`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/lockdown-kiosk.ps1).
  - Configures Windows Registry for Custom Shell Launcher (`Winlogon\Shell = Pictolabs.exe`).
  - Disables Task Manager (`DisableTaskMgr = 1`), Lock Workstation (`DisableLockWorkstation = 1`), and Change Password (`DisableChangePassword = 1`).
  - Disables Windows hotkeys (Win Key, Alt+Tab, Alt+F4) and enables automatic logon.
- **Remaining Gaps**:
  - Script has **NOT** yet been executed or verified on the physical Windows 10/11 IoT mini-PC designated for Booth #1.
  - Physical touch gestures (e.g. edge-swiping from right to reveal Action Center, or edge-swiping from left to reveal Task View) have not been tested on the physical touchscreen.
  - Automatic restart behavior during retail mall hours (10:00 - 22:00 WIB) has not been validated against Windows Update policies.
- **Production Risks**:
  - A curious mall customer could swipe from the screen edge, summon the Windows Taskbar or On-Screen Keyboard, and minimize or close the photobooth application.
  - Windows Update could trigger an unexpected restart in the middle of a customer photo session.

---

### 12. Commercial Booth #1 Readiness
- **Classification**: `PARTIAL`
- **Evidence**:
  - Complete software stack implemented:
    - Kiosk UX (welcome, payment, capture, layout selection, filter processing, printing).
    - Canon DSLR camera driver integration (EDSDK 30 FPS LiveView + mechanical shutter trigger).
    - DNP DS-RX1HS dye-sublimation printer spooler integration.
    - Sharp 300 DPI high-resolution strip compositing engine.
    - Midtrans QRIS integration.
    - Cloudflare R2 cloud backup and customer softfile gallery.
    - 5-Pillar Booth Health telemetry and unified WhatsApp alert foundation.
    - Admin Dashboard authentication and localization.
  - All automated regression suites pass 100% (Sprint 3, Sprint 5B, Sprint 5C).
- **Remaining Gaps**:
  - Physical assembly, hardware burn-in, and full end-to-end integration test in the actual booth cabinet:
    1. Canon DSLR camera mount, manual zoom/focus lock, and power adapter stability.
    2. DNP printer paper roll alignment, cutter clearance, and paper collection tray.
    3. Mini-PC ventilation and thermal management during continuous photo processing.
    4. Stable 4G/LTE cellular backup modem alongside mall Wi-Fi.
    5. Complete real-money transaction test (Pay with GoPay -> Take 4 photos -> Composite -> Print 2 physical strips -> Receive softfile email -> View online gallery).
- **Production Risks**:
  - Hardware physical disconnects (USB cable vibration loosening, camera auto-sleep trigger, printer paper roll misfeed) during mall opening day.
  - High ambient booth temperatures causing CPU thermal throttling and stuttering 30 FPS LiveView.

---

## Action Plan to Achieve 100% Production Readiness

```mermaid
flowchart TD
    subgraph Pre-Deployment Checklist
        A[1. Swap Midtrans Production Keys] --> B[2. Add Resend Live API Key & Verify DNS]
        B --> C[3. Connect WhatsApp Gateway URL & Token]
        C --> D[4. Update docker-compose.prod.yml with new Envs]
        D --> E[5. Change Admin Default Password in DB]
    end

    subgraph Physical Hardware Staging
        F[6. Run lockdown-kiosk.ps1 on Booth #1 Mini-PC] --> G[7. Connect Canon DSLR & DNP Printer]
        G --> H[8. Perform Real-Money End-to-End Test Run]
    end

    Pre-Deployment Checklist --> Physical Hardware Staging
    Physical Hardware Staging --> I[🚀 Commercial Launch: Booth #1]
```

1. **Step 1: Production Keys Configuration**
   - Populate live production keys in `.env`: `MIDTRANS_SERVER_KEY`, `RESEND_API_KEY`, `WA_GATEWAY_URL`, `WA_API_KEY`.
   - Grant `Lifecycle` permissions to Cloudflare R2 API token.
2. **Step 2: Docker Compose Production Alignment**
   - Pass Sprint 5C environment variables into `backend` service in `docker-compose.prod.yml`.
   - Configure NGINX static asset serving or reverse proxy for `admin.pictolabs.id`.
3. **Step 3: Administrative Security Hardening**
   - Change default administrator password from `pictolabs2026` to a secure 32-character passphrase.
4. **Step 4: Physical Hardware Staging & Lockdown**
   - Execute `lockdown-kiosk.ps1` on Booth #1 PC.
   - Run 10 consecutive full sessions (shutter + print + upload) to verify mechanical stability and thermal levels.

---
*End of Post Sprint 5C Deployment Readiness Audit.*
