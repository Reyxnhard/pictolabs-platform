# PICTOLABS PRODUCTION DEPLOYMENT PLAN

> **Platform**: Pictolabs v1.0.0 Enterprise Rebuild  
> **Author**: Antigravity Technical Architecture & Diagnostic Engine  
> **Date**: September 8, 2026  
> **Target Environment**: Ubuntu 24.04 LTS VPS + Docker Compose + PostgreSQL 16 + Redis 7 + Nginx SSL  
> **Delivery Path**: `DEPLOYMENT_PLAN.md` & `docs/DEPLOYMENT_PLAN.md`  
> **Prerequisites**: Codebase audited in [DEPLOYMENT_AUDIT.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/DEPLOYMENT_AUDIT.md) and [INFRASTRUCTURE_REQUIREMENTS_AUDIT.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md)

---

## Executive Summary

Dokumen ini merupakan panduan implementasi rekayasa perangkat lunak lengkap (*execution blueprint*) untuk memindahkan seluruh ekosistem backend Pictolabs dari lingkungan pengembangan lokal (Windows + SQLite dev) ke lingkungan server produksi komersial (**Ubuntu 24.04 LTS + Docker Containerization + PostgreSQL 16 + Redis 7 + Nginx SSL Reverse Proxy**).

Seluruh artefak konfigurasi teknis telah dibuat dan terintegrasi secara langsung di dalam repositori:
* **Backend Dockerfile**: [pictolabs-rebuild/apps/backend/Dockerfile](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/Dockerfile)
* **Production Orchestration**: [pictolabs-rebuild/docker-compose.prod.yml](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/docker-compose.prod.yml)
* **Nginx Reverse Proxy & SSL**: [pictolabs-rebuild/nginx/nginx.conf](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/nginx/nginx.conf)

---

# 1. Complete Database Migration Plan: SQLite $\rightarrow$ PostgreSQL

### 1.1 Analisis Kondisi & Mengapa Harus Migrasi
* **Kondisi Saat Ini**: Skema Prisma ([apps/backend/prisma/schema.prisma:1-4](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L1-L4)) aktif menggunakan SQLite (`provider = "sqlite"`, `file:./dev.db`).
* **Masalah SQLite pada Produksi Multi-Kiosk**:
  SQLite menggunakan penguncian file database penuh (*exclusive file lock*) saat menulis data. Saat 5–10 kiosk bilik foto di mall mengirim transaksi, mengunggah foto, dan mengirim telemetri kesehatan bersamaan, database akan melempar error `SQLITE_BUSY` yang berujung pada kegagalan transaksi pembayaran.
* **Keuntungan PostgreSQL 16**:
  PostgreSQL mendukung konkurensi tingkat tinggi (*Multi-Version Concurrency Control / MVCC*), penguncian tingkat baris (*row-level locking*), pooling koneksi berkapasitas besar, dan integritas referensial data ACID penuh.

---

### 1.2 Langkah-Langkah Migrasi Skema & Data

```
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│ Langkah 1: Backup SQLite│ ──► │Langkah 2: Update Schema │ ──► │Langkah 3: Start Postgres│
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
                                                                             │
                                                                             ▼
┌─────────────────────────┐     ┌─────────────────────────┐     ┌─────────────────────────┐
│ Langkah 6: Verify & Test│ ◄── │Langkah 5: Seed Baseline │ ◄── │Langkah 4: Apply Migrate │
└─────────────────────────┘     └─────────────────────────┘     └─────────────────────────┘
```

#### Langkah 1: Backup Database SQLite Lokal
Sebelum melakukan perubahan apapun, amankan database SQLite lokal:
```bash
cp apps/backend/prisma/dev.db apps/backend/prisma/dev.db.backup-$(date +%Y%m%d)
```

#### Langkah 2: Modifikasi `schema.prisma` ke PostgreSQL
Ubah konfigurasi datasource pada [apps/backend/prisma/schema.prisma:1-4](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L1-L4):
```diff
 datasource db {
-  provider = "sqlite"
-  url      = "file:./dev.db"
+  provider = "postgresql"
+  url      = env("DATABASE_URL")
 }
```
*(Catatan: Tipe kolom JSON dan enum string yang ada saat ini tetap dipertahankan sebagai `String` sehingga **100% tidak ada baris kode NestJS yang perlu diubah**).*

#### Langkah 3: Menjalankan Container PostgreSQL 16
Nyalakan container PostgreSQL melalui Docker:
```bash
cd pictolabs-rebuild
docker compose -f docker-compose.prod.yml up -d postgres
```

#### Langkah 4: Menghasilkan Migrasi DDL Resmi (Initial Migration)
Jalankan migrasi pertama untuk membuat seluruh 15 tabel relasional di PostgreSQL:
```bash
cd apps/backend
npx prisma migrate dev --name init_postgresql
```
Perintah ini akan secara otomatis:
1. Membaca skema Prisma dan menghasilkan DDL PostgreSQL murni.
2. Membuat tabel `users`, `companies`, `branches`, `booths`, `booth_configs`, `booth_health_logs`, `sessions`, `photos`, `prints`, `frames`, `frame_layers`, `frame_assets`, `transactions`, `payments`, `vouchers`, `queues`, `updates`, dan `logs`.
3. Menghasilkan folder version-controlled: `apps/backend/prisma/migrations/2026XXXXXXXX_init_postgresql/migration.sql`.
4. Meregenerasi client TypeScript Prisma: `npx prisma generate`.

#### Langkah 5: Masukkan Data Awal (Baseline Seeding)
Jalankan script seed untuk memasukkan data master perusahaan dan unit bilik foto:
```bash
node seed.js
```

#### Langkah 6: Verifikasi Koneksi Database
Uji akses tabel dan data menggunakan Prisma Studio:
```bash
npx prisma studio
# Membuka http://localhost:5555 untuk inspeksi visual data PostgreSQL
```

---

# 2. Production Backend Dockerfile

Berkas Dockerfile resmi telah dibuat pada:  
👉 [pictolabs-rebuild/apps/backend/Dockerfile](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/Dockerfile)

### Fitur Kunci Arsitektur Container:
1. **Multi-Stage Build**:
   * **Stage 1 (`builder`)**: Menggunakan `node:20-alpine`, menginstal dependensi build native (`libc6-compat`, `make`, `g++`), mengompilasi `@pictolabs/shared`, menjalankan `prisma generate` untuk driver PostgreSQL, dan mengompilasi NestJS (`npm run build`).
   * **Stage 2 (`runner`)**: Menggunakan image minimalis `node:20-alpine`, hanya menyalin hasil kompilasi `dist/` dan dependensi runtime (`npm prune --omit=dev`), menghasilkan ukuran container sangat ramping (**~180 MB**).
2. **Keamanan Tanpa Root (Non-Root User)**:
   Aplikasi dijalankan di bawah pengguna sistem terbatas `nestjs:nodejs` (UID 1001) untuk mencegah eskalasi privilese container ke host OS.
3. **Init Process Handling (`dumb-init`)**:
   Menggunakan binary `dumb-init` sebagai PID 1 untuk menangani sinyal Linux `SIGTERM` dan `SIGINT` secara benar saat auto-scaling atau graceful shutdown.
4. **Healthcheck Bawaan**:
   Menjalankan probe otomatis setiap 30 detik ke endpoint `/api/storage/health`.

### Isi Lengkap Dockerfile:
```dockerfile
# ==============================================================================
# Pictolabs Backend Production Dockerfile
# Multi-stage build optimized for Node.js 20 Alpine with Prisma & Sharp
# ==============================================================================

# --- Stage 1: Build & Compile ---
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
RUN npm ci

COPY packages/shared ./packages/shared
RUN npm run --workspace=@pictolabs/shared build

COPY apps/backend ./apps/backend
WORKDIR /app/apps/backend
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# --- Stage 2: Production Runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache dumb-init curl

ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

RUN mkdir -p /app/apps/backend/public/uploads && \
    chown -R nestjs:nodejs /app

COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/prisma ./apps/backend/prisma

USER nestjs
WORKDIR /app/apps/backend
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:4000/api/storage/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/main.js"]
```

---

# 3. Production Docker Compose (`docker-compose.prod.yml`)

Berkas orchestrator produksi telah dibuat pada:  
👉 [pictolabs-rebuild/docker-compose.prod.yml](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/docker-compose.prod.yml)

### Spesifikasi Layanan Terpadu:
* **`postgres`**: PostgreSQL 16 Alpine, persistent volume `postgres_data`, terikat ke loopback `127.0.0.1:5432` agar tidak terbuka langsung ke internet publik.
* **`redis`**: Redis 7 Alpine dengan Append-Only File (AOF) aktif untuk menyimpan antrean dan state WebSocket secara persisten.
* **`backend`**: Node.js NestJS container yang menunggu `postgres` dan `redis` dalam status `service_healthy` sebelum dijalankan.
* **`nginx`**: Web server reverse proxy yang membuka port `80` dan `443` ke internet luar.
* **`pictolabs-network`**: Bridge network terisolasi antar-container.

### Struktur Layanan:
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: pictolabs-postgres
    restart: unless-stopped
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-pictolabs}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-pictolabs}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-pictolabs} -d ${POSTGRES_DB:-pictolabs}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - pictolabs-network

  redis:
    image: redis:7-alpine
    container_name: pictolabs-redis
    restart: unless-stopped
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    command: ["redis-server", "--appendonly", "yes"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - pictolabs-network

  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    container_name: pictolabs-backend
    restart: unless-stopped
    expose:
      - "4000"
    environment:
      NODE_ENV: production
      PORT: 4000
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      JWT_SECRET: ${JWT_SECRET}
      MIDTRANS_SERVER_KEY: ${MIDTRANS_SERVER_KEY}
      MIDTRANS_CLIENT_KEY: ${MIDTRANS_CLIENT_KEY}
      MIDTRANS_IS_PRODUCTION: "true"
      R2_ACCOUNT_ID: ${R2_ACCOUNT_ID}
      R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID}
      R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY}
      R2_BUCKET_NAME: ${R2_BUCKET_NAME}
      R2_PUBLIC_DOMAIN: ${R2_PUBLIC_DOMAIN}
    volumes:
      - backend_uploads:/app/apps/backend/public/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - pictolabs-network

  nginx:
    image: nginx:alpine
    container_name: pictolabs-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/letsencrypt:ro
      - ./nginx/certbot-challenge:/var/www/certbot:ro
    depends_on:
      - backend
    networks:
      - pictolabs-network

volumes:
  postgres_data:
  redis_data:
  backend_uploads:

networks:
  pictolabs-network:
    driver: bridge
```

---

# 4. Nginx Reverse Proxy Architecture

Berkas konfigurasi Nginx resmi telah dibuat pada:  
👉 [pictolabs-rebuild/nginx/nginx.conf](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/nginx/nginx.conf)

### 4.1 Diagram Alur Lalu Lintas Jaringan

```
[ INTERNET: Client Kiosk Mall & Smartphone Customer ]
                         │
                         ▼ (Port 80 / 443)
┌─────────────────────────────────────────────────────────────┐
│                 NGINX EDGE REVERSE PROXY                    │
│  • SSL Termination (TLS 1.2 / TLS 1.3 - Let's Encrypt)      │
│  • HTTP 301 Force Redirect to HTTPS                         │
│  • Rate Limiting Zone: 30 req/sec (Burst 50)                │
│  • Max Body Size: 50MB (Foto & Video MP4 Uploads)           │
│  • Security Headers: HSTS, CSP, X-Frame-Options             │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
  [/socket.io/]             [/api/]                  [/d/]
WebSocket Stream        REST Endpoints          Customer Gallery
Upgrade: WebSocket     Proxy to Port 4000      HTML5 View & ZIP
Timeout: 86400s        Timeout: 60s            Range Video 206
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               ▼
            [ Container: pictolabs-backend:4000 ]
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
 [ Container: postgres:5432 ]          [ Container: redis:6379 ]
```

### 4.2 Fitur Teknis Khusus yang Dikonfigurasi:
1. **WebSocket Proxy (`/socket.io/`)**:
   Meneruskan header `Upgrade $http_upgrade` dan `Connection "upgrade"` dengan `proxy_read_timeout 86400s` agar koneksi WebSocket kiosk bilik foto mall tidak terputus setiap 60 detik.
2. **Streaming Video Range Headers (`/uploads/`)**:
   Meneruskan header `Range` dan `If-Range` ke backend agar pemutaran Live Photo video MP4 di perangkat iPhone (Safari iOS) dan Android dapat melakukan scrubbing tanpa error HTTP 416.
3. **Perlindungan DDoS & Brute Force**:
   Menggunakan direktif `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s` dengan toleransi burst hingga 50 request.
4. **Dukungan Sertifikat Otomatis Let's Encrypt**:
   Rute `/.well-known/acme-challenge/` langsung dipetakan ke direktori `/var/www/certbot` agar perpanjangan sertifikat SSL dapat berjalan otomatis tanpa mematikan server Nginx.

---

# 5. Complete Step-by-Step Deployment Guide (Ubuntu 24.04 VPS)

Berikut adalah panduan eksekusi terminal dari nol (*fresh VPS*) hingga sistem live beroperasi penuh:

---

### Tahap 1: Persiapan Server VPS & Pengamanan (Server Hardening)

1. **Masuk ke VPS via SSH**:
   ```bash
   ssh root@YOUR_SERVER_IP
   ```
2. **Update Seluruh Paket OS**:
   ```bash
   apt update && apt upgrade -y
   apt install -y ufw curl git fail2ban jq htop
   ```
3. **Konfigurasi Firewall (UFW)**:
   Hanya izinkan port SSH, HTTP, dan HTTPS:
   ```bash
   ufw default deny incoming
   ufw default allow outgoing
   ufw allow 22/tcp
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable -y
   ```

---

### Tahap 2: Instalasi Docker & Docker Compose v2

Pasang Docker Engine resmi dari repositori Docker:
```bash
# Tambahkan GPG key resmi Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Tambahkan repositori apt
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verifikasi instalasi
docker compose version
```

---

### Tahap 3: Clone Repositori & Persiapan Direktori

1. **Clone Repositori**:
   ```bash
   mkdir -p /opt/pictolabs
   cd /opt/pictolabs
   git clone https://github.com/YOUR_ORGANIZATION/pictolabs.git .
   cd pictolabs-rebuild
   ```
2. **Buat Folder untuk Sertifikat SSL & Nginx**:
   ```bash
   mkdir -p nginx/certs nginx/certbot-challenge
   ```

---

### Tahap 4: Konfigurasi Environment Produksi (`.env.production`)

Buat berkas `.env` produksi di folder `pictolabs-rebuild`:
```bash
cat << 'EOF' > .env
# Database Credentials
POSTGRES_USER=pictolabs_admin
POSTGRES_PASSWORD=GANTI_DENGAN_PASSWORD_DATABASE_KUAT_64_CHAR
POSTGRES_DB=pictolabs_prod

# Application Secrets
JWT_SECRET=GANTI_DENGAN_JWT_SECRET_ACAK_SANGAT_KUAT_MIN_64_CHAR
JWT_EXPIRES_IN=7d

# Midtrans Production Credentials
MIDTRANS_SERVER_KEY=Mid-server-YOUR_REAL_PROD_SERVER_KEY
MIDTRANS_CLIENT_KEY=Mid-client-YOUR_REAL_PROD_CLIENT_KEY
MIDTRANS_IS_PRODUCTION=true

# Cloudflare R2 Credentials
R2_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID_HASH
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME=pictolabs-media-prod
R2_PUBLIC_DOMAIN=https://dl.pictolabs.id

# Retention Policies
MEDIA_CLOUD_RETENTION_DAYS=30
MEDIA_LOCAL_RETENTION_DAYS=7
EOF
```

---

### Tahap 5: Penerbitan Sertifikat SSL Let's Encrypt

1. **Arahkan DNS Record**:
   Pastikan DNS A Record untuk `api.pictolabs.id` telah mengarah ke IP publik VPS Anda.
2. **Terbitkan Sertifikat SSL menggunakan Certbot Standalone**:
   ```bash
   apt install -y certbot
   certbot certonly --standalone -d api.pictolabs.id --non-interactive --agree-tos -m admin@pictolabs.id
   ```
3. **Tautkan Sertifikat ke Volume Nginx Docker**:
   ```bash
   mkdir -p nginx/certs/live/api.pictolabs.id
   cp /etc/letsencrypt/live/api.pictolabs.id/fullchain.pem nginx/certs/live/api.pictolabs.id/
   cp /etc/letsencrypt/live/api.pictolabs.id/privkey.pem nginx/certs/live/api.pictolabs.id/
   ```

---

### Tahap 6: Build & Menjalankan Seluruh Sistem

1. **Jalankan Build Container**:
   ```bash
   docker compose -f docker-compose.prod.yml build
   ```
2. **Nyalakan Layanan di Latar Belakang (Detached Mode)**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
3. **Jalankan Migrasi Skema PostgreSQL di Container**:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
   ```
4. **Jalankan Seeding Data Master Awal**:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend node seed.js
   ```

---

### Tahap 7: Verifikasi Status Deployment

1. **Periksa Status Seluruh Container**:
   ```bash
   docker compose -f docker-compose.prod.yml ps
   ```
   *Ekspektasi Output*: Seluruh 4 container (`pictolabs-postgres`, `pictolabs-redis`, `pictolabs-backend`, `pictolabs-nginx`) berstatus `Up (healthy)`.
2. **Periksa Endpoint API Publik**:
   ```bash
   curl -I https://api.pictolabs.id/api/storage/health
   ```
   *Ekspektasi Respon*: `HTTP/2 200 OK` dengan header security Nginx.
3. **Periksa Log Real-time**:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f backend
   ```

---

# 6. Implementation Time Estimation

Berikut adalah rincian estimasi waktu pengerjaan teknis hingga sistem rilis produksi:

| No | Modul / Tugas Implementasi | Estimasi Waktu | Penanggung Jawab | Dependensi |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Migrasi Skema SQLite $\rightarrow$ PostgreSQL**<br>• Update `schema.prisma`<br>• Generate initial migration SQL<br>• Testing Prisma Client lokal | **1.5 – 2.5 Jam** | Backend Engineer | Docker Desktop lokal |
| **2** | **Containerisasi & Build Docker**<br>• Verifikasi multi-stage Dockerfile<br>• Testing build container NestJS<br>• Optimasi cache layer | **1.5 – 2.0 Jam** | DevOps / Backend | Dockerfile & Monorepo |
| **3** | **Konfigurasi Nginx, SSL & WebSocket**<br>• Setup `nginx.conf`<br>• Testing WebSocket upgrade proxy<br>• Verifikasi video Range headers (206) | **1.0 – 2.0 Jam** | DevOps | Domain DNS aktif |
| **4** | **Provisioning Server VPS Ubuntu 24.04**<br>• Setup SSH, UFW Firewall, Fail2ban<br>• Install Docker & Compose v2<br>• Konfigurasi sistem auto-start (systemd) | **1.5 – 2.0 Jam** | DevOps / Sysadmin | Akun VPS (Hetzner / DO) |
| **5** | **Konfigurasi Akun Produksi Eksternal**<br>• Setup Cloudflare R2 bucket & custom CDN<br>• Input Midtrans Production Server Key<br>• Pendaftaran Webhook HTTPS di Midtrans | **1.0 – 2.0 Jam** | Product Owner / Tech Lead | Akun Midtrans & Cloudflare |
| **6** | **End-to-End Staging Testing & Verification**<br>• Uji coba transaksi QRIS nyata (nominal Rp 1.000)<br>• Uji coba auto-advance WebSocket kiosk<br>• Uji coba unduhan softfile galeri mobile via CDN | **2.0 – 3.0 Jam** | QA / Fullstack | Kiosk client & printer |
| **7** | **Cadangan & Script Pemeliharaan**<br>• Setup cron job backup database PostgreSQL<br>• Setup cron renewal Let's Encrypt SSL | **1.0 – 1.5 Jam** | DevOps | Cron / Shell script |

### **TOTAL ESTIMASI WAKTU IMPLEMENTASI**:
$$\mathbf{10.5 \text{ – } 15.0 \text{ Jam Kerja}} \quad (\approx \mathbf{1.5 \text{ – } 2.0 \text{ Hari Kerja}})$$

---

# 7. Post-Deployment Maintenance Checklist

Setelah deployment selesai, lakukan pemeliharaan rutin berikut:
* [ ] **Backup Harian PostgreSQL**:
  ```bash
  0 2 * * * docker exec pictolabs-postgres pg_dump -U pictolabs_admin pictolabs_prod | gzip > /opt/backups/db-$(date +\%Y\%m\%d).sql.gz
  ```
* [ ] **Perpanjangan Otomatis SSL (Cron Let's Encrypt)**:
  ```bash
  0 3 1 * * certbot renew --quiet && docker compose -f /opt/pictolabs/pictolabs-rebuild/docker-compose.prod.yml restart nginx
  ```
* [ ] **Rotasi Log Docker**:
  Pastikan konfigurasi daemon Docker membatasi ukuran log agar disk server tidak penuh:
  ```json
  {
    "log-driver": "json-file",
    "log-opts": {
      "max-size": "50m",
      "max-file": "5"
    }
  }
  ```
