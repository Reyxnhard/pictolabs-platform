# FINAL PRODUCTION DEPLOYMENT GUIDE: PICTOLABS VPS

> **Target OS:** Ubuntu 24.04 LTS (Vanilla Cloud VPS - DigitalOcean / Linode / AWS EC2 / Hetzner)  
> **Recommended Specs:** 2 vCPU, 4GB RAM, 50GB SSD Storage  
> **Domain Stack:**  
> - `api.pictolabs.id` (NestJS REST API, WebSockets, Storage Gateway)  
> - `admin.pictolabs.id` (React Vite Admin Dashboard)  
> - `dl.pictolabs.id` (Cloudflare R2 Media Download Gateway)  
> **Classification:** Production Runbook  

---

## Prerequisites Checklist Before You Start

- [ ] A fresh, unconfigured Ubuntu 24.04 server with root SSH access.
- [ ] Registered domain (`pictolabs.id`) managed via Cloudflare DNS.
- [ ] Midtrans Production Server Key and Client Key.
- [ ] Cloudflare R2 bucket (`pictolabs-media-prod`) created with API token.
- [ ] Resend API key (`re_...`) with validated sender domain.
- [ ] WhatsApp Gateway token (Fonnte / Wablas) and admin phone number.

---

## Phase 1: Server Provisioning & OS Hardening

SSH into the server as root:
```bash
ssh root@<YOUR_SERVER_IP>
```

### 1.1 Update base system packages
```bash
apt update && apt upgrade -y
```

### 1.2 Configure UFW Firewall
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

### 1.3 Install Docker Engine & Compose Plugin
```bash
apt install -y ca-certificates curl gnupg lsb-release
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verify installation:
```bash
docker --version && docker compose version
```

---

## Phase 2: DNS Records Setup (Cloudflare)

Log in to your Cloudflare Dashboard $\rightarrow$ DNS Management for `pictolabs.id`, and add three `A` records:

| Type | Name | IPv4 Address | Proxy Status |
| :---: | :---: | :---: | :---: |
| **A** | `api` | `<YOUR_SERVER_IP>` | **DNS Only** (Grey Cloud during SSL issuance) |
| **A** | `admin` | `<YOUR_SERVER_IP>` | **DNS Only** (Grey Cloud during SSL issuance) |
| **A** | `dl` | `<YOUR_SERVER_IP>` | **DNS Only** (Grey Cloud during SSL issuance) |

> [!IMPORTANT]
> Keep Cloudflare proxy set to **DNS Only** (grey cloud) while bootstrapping SSL so Let's Encrypt can directly verify the server IP over port 80. You may re-enable Cloudflare orange cloud after verification.

---

## Phase 3: Repository Setup & Secrets Configuration

### 3.1 Clone the repository
```bash
mkdir -p /opt/pictolabs
cd /opt/pictolabs
git clone https://github.com/<your-org>/pictolabs.git .
cd pictolabs-rebuild
```

### 3.2 Create the production `.env` file
```bash
cp .env.production.example .env
nano .env
```

Generate cryptographically secure secrets:
```bash
# Generate DB Password:
openssl rand -base64 32

# Generate JWT Secret:
openssl rand -base64 48
```

Fill in the `.env` values:
```ini
# --- DATABASE CONFIGURATION ---
POSTGRES_USER=pictolabs_admin
POSTGRES_PASSWORD=<PASTE_GENERATED_DB_PASSWORD>
POSTGRES_DB=pictolabs_prod
DATABASE_URL=postgresql://pictolabs_admin:<PASTE_GENERATED_DB_PASSWORD>@postgres:5432/pictolabs_prod?schema=public

# --- APPLICATION RUNTIME ---
PORT=4000
NODE_ENV=production
JWT_SECRET=<PASTE_GENERATED_JWT_SECRET>
JWT_EXPIRES_IN=7d
DASHBOARD_URL=https://admin.pictolabs.id

# --- PAYMENT GATEWAY (Midtrans Production) ---
PAYMENT_GATEWAY_PROVIDER=MIDTRANS
PAYMENT_GATEWAY_ENV=production
MIDTRANS_SERVER_KEY=Mid-server-YOUR_PRODUCTION_SERVER_KEY
MIDTRANS_CLIENT_KEY=Mid-client-YOUR_PRODUCTION_CLIENT_KEY
MIDTRANS_IS_PRODUCTION=true
PAYMENT_WEBHOOK_SECRET=replace_with_webhook_secret

# --- CLOUDFLARE R2 STORAGE ---
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=pictolabs-media-prod
R2_PUBLIC_DOMAIN=https://dl.pictolabs.id
MEDIA_CLOUD_RETENTION_DAYS=30
MEDIA_LOCAL_RETENTION_DAYS=7

# --- TRANSACTIONAL EMAIL (Resend) ---
RESEND_API_KEY=re_YOUR_PRODUCTION_RESEND_KEY
EMAIL_FROM=Pictolabs <delivery@pictolabs.id>

# --- WHATSAPP ALERTS ---
WA_ENABLED=true
WA_GATEWAY_URL=https://api.fonnte.com/send
WA_API_KEY=YOUR_FONNTE_TOKEN
WA_ADMIN_PHONE=081234567890
```

---

## Phase 4: Zero-Failure SSL Bootstrapping

Execute the included automated SSL bootstrapping script. This script eliminates the chicken-and-egg startup deadlock by generating dummy self-signed certificates, bringing up Nginx on port 80, obtaining real Let's Encrypt multi-domain certificates, and reloading Nginx:

```bash
chmod +x scripts/init-letsencrypt.sh
./scripts/init-letsencrypt.sh
```

Output should conclude with:
```
===================================================================
  SSL Bootstrap Complete! All domains secured with HTTPS.
===================================================================
```

---

## Phase 5: Build & Launch Full Container Fleet

Deploy all services (`postgres`, `redis`, `backend`, `dashboard`, `nginx`, `certbot`):
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Verify that all 5 application containers are up and healthy:
```bash
docker compose -f docker-compose.prod.yml ps
```

Expected status:
```
NAME                   IMAGE                       STATUS
pictolabs-postgres     postgres:16-alpine          Up (healthy)
pictolabs-redis        redis:7-alpine              Up (healthy)
pictolabs-backend      pictolabs-rebuild-backend   Up (healthy)
pictolabs-dashboard    pictolabs-rebuild-dashboard Up (healthy)
pictolabs-nginx        nginx:alpine                Up
pictolabs-certbot      certbot/certbot:latest      Up
```

---

## Phase 6: Database Seeding & Initial Credentials

The backend container automatically applies all PostgreSQL migrations on startup (`npx prisma migrate deploy`).

Now seed the initial production HQ, branch, and Booth #1:
```bash
docker compose -f docker-compose.prod.yml exec backend node seed.js
```

Expected output:
```
Database seeded successfully: Booth ID <BOOTH_UUID>
```

---

## Phase 7: Post-Deployment Smoke Tests

### 7.1 Verify Backend Health
```bash
curl -I https://api.pictolabs.id/api/storage/health
```
**Expected Response:** `HTTP/2 200 OK`

### 7.2 Verify Dashboard Web Interface
Open your web browser and navigate to:
```
https://admin.pictolabs.id
```
**Expected Response:** Fast-loading, responsive Pictolabs Admin Dashboard.

### 7.3 Midtrans Webhook Registration
1. Log in to [Midtrans Merchant Dashboard](https://dashboard.midtrans.com).
2. Go to **Settings** $\rightarrow$ **Configuration**.
3. Set **Payment Notification URL** to:
   ```
   https://api.pictolabs.id/api/payments/webhook
   ```
4. Click **Update Settings**.

---

## Phase 8: Operational Management

### View live logs
```bash
# All logs:
docker compose -f docker-compose.prod.yml logs -f

# Backend API logs only:
docker compose -f docker-compose.prod.yml logs -f backend

# Nginx access & error logs:
docker compose -f docker-compose.prod.yml logs -f nginx
```

### Restarting services
```bash
docker compose -f docker-compose.prod.yml restart backend dashboard
```

### Automated SSL Renewal
The `pictolabs-certbot` container runs an automated 12-hour background check that renews certificates approaching expiry and signals Nginx to reload.
