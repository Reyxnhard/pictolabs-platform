# PICTOLABS VPS DEPLOYMENT READINESS REPORT

> **Document Type:** Production Deployment Assessment & VPS Migration Plan  
> **Evaluation Date:** September 12, 2026  
> **Target OS:** Ubuntu 24.04 LTS (Vanilla Cloud VPS)  
> **Audience:** Founder & Engineering Operations  
> **Classification:** Technical Audit & Operational Roadmap  

---

# Executive Summary

This report evaluates the current readiness of the Pictolabs platform for production deployment onto a clean Ubuntu 24.04 LTS Virtual Private Server (VPS). 

| Category | Component | Status | Key Notes |
| :--- | :--- | :---: | :--- |
| **Container Engine** | Docker & Compose | **PARTIAL** | Core services exist; Dashboard container & initial SSL bootstrapping missing. |
| **API Core** | NestJS Backend | **READY** | Containerized, multi-stage Node 20 build with healthchecks. |
| **Frontend UI** | Admin Dashboard | **PARTIAL** | Vite build compiles; missing Dockerfile and Nginx virtual host. |
| **Primary Database** | PostgreSQL 16 | **PARTIAL** | Schema ready; pending delta migration file generation before deploy. |
| **Cache Layer** | Redis 7 | **PLANNED** | Container active in compose; backend currently operates with in-memory stores. |
| **Object Storage** | Cloudflare R2 | **READY** | Full S3 SDK integration, auto 30-day lifecycle, local fallback support. |
| **Transactional Email** | Resend API | **READY** | Branded HTML templates with 3/hr rate limits and mock fallbacks. |
| **Alert Gateway** | WhatsApp (Fonnte/Wablas) | **READY** | Multi-tier severity alerting with suppression cooldowns. |
| **Payment Gateway** | Midtrans Core API | **READY** | Production-switchable, SHA-512 webhook verification, cash bypass. |
| **OVERALL READINESS** | **Ubuntu 24.04 VPS** | **PARTIAL** | 4 actionable blockers must be resolved prior to launch. |

---

# 1. Docker Status

### Is `docker-compose.yml` implemented?
**Yes.** The repository maintains two separate compose configurations:
1. `docker-compose.yml`: Development profile running PostgreSQL 16 (`pictolabs-db`) and Redis 7 (`pictolabs-redis`) with host port bindings.
2. `docker-compose.prod.yml`: Production profile orchestrating multi-container architecture on internal bridge network `pictolabs-network`.

### Is it production ready?
**PARTIAL (Not yet plug-and-play).**
- **Missing Container:** `apps/dashboard` (the web admin console) is completely omitted from `docker-compose.prod.yml`.
- **SSL Dependency Trap:** `nginx.conf` directly references Let's Encrypt certificate paths (`/etc/letsencrypt/live/api.pictolabs.id/fullchain.pem`). On a virgin VPS, Nginx will fail to start on first launch because these certificate files do not exist yet.

### Container Fleet in `docker-compose.prod.yml`
| Container Name | Image / Build Source | Ports | Volume Mounts | Healthcheck |
| :--- | :--- | :---: | :--- | :---: |
| **`pictolabs-postgres`** | `postgres:16-alpine` | `127.0.0.1:5432` | `postgres_data:/var/lib/postgresql/data` | `pg_isready` |
| **`pictolabs-redis`** | `redis:7-alpine` | `127.0.0.1:6379` | `redis_data:/data` (`--appendonly yes`) | `redis-cli ping` |
| **`pictolabs-backend`** | `apps/backend/Dockerfile` | `4000:4000` | `backend_uploads:/app/apps/backend/public/uploads` | `GET /api/storage/health` |
| **`pictolabs-nginx`** | `nginx:alpine` | `80:80`, `443:443` | `./nginx/nginx.conf`, `./nginx/certs`, `./nginx/certbot-challenge` | N/A |
| *`pictolabs-dashboard`* | *Missing from compose* | *N/A* | *No volume or container defined* | *Missing* |

---

# 2. Backend

* **Internal Port:** `4000` (Exposed internally to Nginx reverse proxy)
* **Runtime:** Node.js 20 LTS (Alpine Linux) with `dumb-init` signal management.
* **Environment Variables Required:**
  ```env
  PORT=4000
  NODE_ENV=production
  DATABASE_URL=postgresql://user:password@postgres:5432/pictolabs_prod?schema=public
  JWT_SECRET=min_64_char_random_string
  JWT_EXPIRES_IN=7d
  DASHBOARD_URL=https://admin.pictolabs.id

  # Payment Gateway
  PAYMENT_GATEWAY_PROVIDER=MIDTRANS
  PAYMENT_GATEWAY_ENV=production
  MIDTRANS_SERVER_KEY=Mid-server-prod-key
  MIDTRANS_CLIENT_KEY=Mid-client-prod-key
  MIDTRANS_IS_PRODUCTION=true
  PAYMENT_WEBHOOK_SECRET=custom_signature_token

  # Object Storage
  R2_ACCOUNT_ID=cloudflare_account_id
  R2_ACCESS_KEY_ID=r2_access_key
  R2_SECRET_ACCESS_KEY=r2_secret_key
  R2_BUCKET_NAME=pictolabs-media-prod
  R2_PUBLIC_DOMAIN=https://dl.pictolabs.id
  MEDIA_CLOUD_RETENTION_DAYS=30
  MEDIA_LOCAL_RETENTION_DAYS=7

  # Transactional Email
  RESEND_API_KEY=re_prod_key
  EMAIL_FROM=Pictolabs <delivery@pictolabs.id>

  # WhatsApp Gateway
  WA_ENABLED=true
  WA_GATEWAY_URL=https://api.fonnte.com/send
  WA_API_KEY=fonnte_or_wablas_device_token
  WA_ADMIN_PHONE=0812xxxxxxxx
  ```
* **External Dependencies:**
  - PostgreSQL 16 (internal network)
  - Redis 7 (internal network)
  - Midtrans Core API (`https://api.midtrans.com/v2`)
  - Cloudflare R2 (`https://<account-id>.r2.cloudflarestorage.com`)
  - Resend REST API (`https://api.resend.com/emails`)
  - WhatsApp Gateway Provider (`https://api.fonnte.com/send`)

---

# 3. Dashboard

* **Port:** `5173` (Vite dev server) / Port `80/443` (when served as static SPA in production).
* **Build Status:** **VERIFIED.** Running `npm run build` inside `apps/dashboard` produces an optimized static bundle in `apps/dashboard/dist/` (`assets/`, `index.html`, SVG bundles) with zero type or bundling errors.
* **Environment Variables Required:**
  * `VITE_API_BASE_URL`: Injected at build time to `https://api.pictolabs.id`. (Falls back to `http://localhost:4000` if omitted).

---

# 4. Database

* **PostgreSQL Implemented?**  
  **Yes.** Prisma schema is configured for PostgreSQL (`provider = "postgresql"`).
* **Schema Migration Implemented?**  
  **PARTIAL (Migration delta required).**  
  The repository has 4 historical migrations ending at commit `20260909030000`. However, schema additions implemented in Sprints 5B through 5E (including `RedeliveryLog`, `adminPinHash` on `Booth`, `customerEmail` on `Session`, and audit trails) are currently in `schema.prisma` but have **not** been captured in a migration SQL file.  
  > [!IMPORTANT]
  > Running `npx prisma migrate deploy` in production today will fail to create these tables, causing runtime 500 errors when the Kiosk or Dashboard triggers PIN validation or softfile redelivery. A migration must be generated prior to release.
* **Seed Data Required?**  
  **Yes.** `apps/backend/seed.js` exists and must be executed immediately following the initial migration to populate:
  - `Company`: "Pictolabs HQ"
  - `Branch`: "Grand Indonesia Kiosk"
  - `Booth`: "PICTOLABS-DEV-01" with hardware secret and baseline configuration.

---

# 5. Redis

* **Status:** **PLANNED / STANDBY CONTAINER**
* `redis:7-alpine` is provisioned in `docker-compose.prod.yml` with persistent append-only storage.
* **Current Application Usage:** Currently, the NestJS backend uses in-memory data structures (Maps and Sets) for rate limiting, alert cooldowns, and WebSocket connection state. Redis client bindings are not yet hooked into the NestJS dependency injection tree. The system operates fully without Redis active, but Redis is available on port 6379 for future queue scaling.

---

# 6. Storage

* **Cloudflare R2 Integrated?**  
  **Yes.** Implemented in `StorageService` (`apps/backend/src/storage/storage.service.ts`) using official AWS SDK v3 (`@aws-sdk/client-s3`).
* **Features Supported:**
  - Presigned upload URLs for direct client-to-R2 upload.
  - S3 server-side streaming and Range header support for video scrubbing.
  - Automated 30-day bucket lifecycle expiration configuration.
  - Graceful fallback to local disk storage (`public/uploads`) if R2 credentials are not supplied.
* **Required Environment Variables:**
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`.

---

# 7. Email

* **Resend Integrated?**  
  **Yes.** Implemented in `EmailService` (`apps/backend/src/email/email.service.ts`).
* **Features Supported:**
  - Responsive, dark-mode branded HTML customer photostrip template.
  - Delivery rate limiter (strictly enforces maximum 3 emails per session per hour).
  - Graceful fallback simulation logger if `RESEND_API_KEY` is missing or API errors occur.
* **Required Environment Variables:**
  - `RESEND_API_KEY`: API token starting with `re_`.
  - `EMAIL_FROM`: Validated sender domain (e.g. `Pictolabs <delivery@pictolabs.id>`).

---

# 8. WhatsApp

* **Gateway Integrated?**  
  **Yes.** Implemented in `AlertService` (`apps/backend/src/alerts/alert.service.ts`).
* **Features Supported:**
  - Unified HTTP webhook dispatch (Fonnte / Wablas standard API).
  - Structured operational alerts with markdown headers (INFO, WARNING, CRITICAL).
  - Suppression cooldown logic (prevents alert spam loops during flapping hardware).
  - Fallback console logging when unconfigured.
* **Required Environment Variables:**
  - `WA_ENABLED=true`
  - `WA_GATEWAY_URL` (e.g., `https://api.fonnte.com/send`)
  - `WA_API_KEY` (Device API token)
  - `WA_ADMIN_PHONE` (Admin/Technician recipient mobile number)

---

# 9. Payment

* **Midtrans Sandbox Implemented?**  
  **Yes.** Complete Dynamic QRIS generation, EMVCo fallback string generator for offline simulation, SHA-512 webhook signature verification, and manual cash bypass in Operator Control Panel.
* **Midtrans Production Ready?**  
  **Code-level: YES. Operational-level: PENDING CREDENTIALS.**  
  Switching `MIDTRANS_IS_PRODUCTION=true` switches all upstream endpoints from `api.sandbox.midtrans.com` to `api.midtrans.com`. Production go-live requires:
  1. Inputting active Production Server and Client keys into `.env`.
  2. Setting the Webhook URL to `https://api.pictolabs.id/api/payments/webhook` in the Midtrans Merchant Portal.

---

# 10. Deployment Readiness Classification

```
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║                     DEPLOYMENT STATUS: PARTIAL                        ║
║                                                                       ║
║   The backend architecture, database schema, storage, email, alerts,  ║
║   and payment integrations are code-complete. However, four critical  ║
║   infrastructure blockers prevent immediate 1-click VPS go-live.      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

# 11. What is Blocking Deployment Today?

1. **Dashboard Containerization & Web Routing:**
   `apps/dashboard` has no Dockerfile and is not in `docker-compose.prod.yml`. Nginx is only configured to proxy `api.pictolabs.id` and `dl.pictolabs.id`. There is no web server or route for `admin.pictolabs.id`.
2. **Prisma Migration Delta:**
   New models (`RedeliveryLog`, `adminPinHash`, `customerEmail`) exist in `schema.prisma` but have no SQL migration files. Running `npx prisma migrate deploy` on a clean PostgreSQL database will leave the database schema incomplete.
3. **SSL Certificate Bootstrap Loop:**
   `nginx.conf` expects Let's Encrypt certificates to already exist on disk. Starting Nginx on a clean machine fails immediately because the certs do not exist, blocking Certbot from completing the challenge.
4. **DNS & Production Credential Injection:**
   Cloudflare DNS must point `api.pictolabs.id` and `admin.pictolabs.id` to the VPS IP, and real third-party production credentials (Midtrans, R2, Resend, WhatsApp) must be populated in `.env`.

---

# 12. Fresh Ubuntu 24.04 VPS Operational Guide

Follow these exact steps to achieve a working production deployment on a fresh server.

### Phase 1: Server Provisioning & OS Hardening
1. **Connect & update packages:**
   ```bash
   ssh root@<YOUR_VPS_IP>
   apt update && apt upgrade -y
   ```
2. **Configure UFW Firewall:**
   ```bash
   ufw allow OpenSSH
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw --force enable
   ```
3. **Install Docker Engine & Docker Compose Plugin:**
   ```bash
   apt install -y ca-certificates curl gnupg
   install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   chmod a+r /etc/apt/keyrings/docker.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
   apt update
   apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

### Phase 2: DNS Configuration
4. In Cloudflare DNS Dashboard, create `A` records pointing to the VPS IP:
   - `api.pictolabs.id` $\rightarrow$ `<YOUR_VPS_IP>` (Proxy: OFF / DNS only during certbot)
   - `admin.pictolabs.id` $\rightarrow$ `<YOUR_VPS_IP>` (Proxy: OFF / DNS only during certbot)
   - `dl.pictolabs.id` $\rightarrow$ `<YOUR_VPS_IP>` (Proxy: OFF / DNS only during certbot)

### Phase 3: Code Deployment & Migration Sync
5. **Clone the repository:**
   ```bash
   git clone https://github.com/<your-org>/pictolabs.git /opt/pictolabs
   cd /opt/pictolabs/pictolabs-rebuild
   ```
6. **Generate PostgreSQL delta migration:**
   Ensure the database migration capturing `RedeliveryLog` and `adminPinHash` is compiled into `prisma/migrations`.

### Phase 4: Production Environment Setup
7. **Create `/opt/pictolabs/pictolabs-rebuild/.env`:**
   ```bash
   cp .env.production.example .env
   nano .env
   ```
   * Generate passwords:
     - `POSTGRES_PASSWORD`: Use `openssl rand -base64 32`
     - `JWT_SECRET`: Use `openssl rand -base64 48`
   * Populate Midtrans Production Keys, Cloudflare R2 Keys, Resend Key, and WhatsApp Token.

### Phase 5: Initial SSL Certificate Issuance
8. **Obtain SSL certificates via Certbot Standalone:**
   ```bash
   apt install -y certbot
   certbot certonly --standalone -d api.pictolabs.id -d admin.pictolabs.id -d dl.pictolabs.id --non-interactive --agree-tos -m ops@pictolabs.id
   ```
9. **Link certificates into Nginx mounts:**
   ```bash
   mkdir -p /opt/pictolabs/pictolabs-rebuild/nginx/certs
   # Nginx volume mounts /etc/letsencrypt directly into the container
   ```

### Phase 6: Build & Launch Fleet
10. **Build Dashboard static assets:**
    ```bash
    npm ci
    npm run build --workspace=@pictolabs/dashboard
    ```
11. **Launch production containers:**
    ```bash
    docker compose -f docker-compose.prod.yml up -d --build
    ```
12. **Verify container status:**
    ```bash
    docker compose -f docker-compose.prod.yml ps
    ```
    All 4 containers (`pictolabs-postgres`, `pictolabs-redis`, `pictolabs-backend`, `pictolabs-nginx`) must display status `healthy` or `running`.

### Phase 7: Seed Database & Verify
13. **Seed database:**
    ```bash
    docker exec -it pictolabs-backend node seed.js
    ```
14. **Smoke test API endpoints:**
    ```bash
    curl -I https://api.pictolabs.id/api/storage/health
    # Expect HTTP/2 200 OK
    ```
15. **Midtrans Webhook Registration:**
    Open Midtrans Merchant Portal $\rightarrow$ Settings $\rightarrow$ Configuration:
    - Set Payment Notification URL to: `https://api.pictolabs.id/api/payments/webhook`
16. **Access Dashboard:**
    Open browser to `https://admin.pictolabs.id` and confirm real-time booth status displays.
