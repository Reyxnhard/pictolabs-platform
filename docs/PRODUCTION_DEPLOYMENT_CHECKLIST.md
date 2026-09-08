# PICTOLABS FIRST PRODUCTION DEPLOYMENT CHECKLIST

> **Platform**: Pictolabs Photobooth Enterprise Rebuild v1.0.0  
> **Author**: Antigravity Technical Architecture & Diagnostic Engine  
> **Date**: September 9, 2026  
> **Target Domain**: `pictolabs.id`  
> **Target OS**: Ubuntu 24.04 LTS (x86_64)  
> **Capacity**: 1–5 Commercial Photobooth Kiosks  
> **Stack**: Docker Compose + NestJS (Node 20 Alpine) + PostgreSQL 16 + Redis 7 + Nginx SSL + Cloudflare R2  
> **Audit References**: [DEPLOYMENT_PLAN.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/DEPLOYMENT_PLAN.md) & [LOCAL_DEPLOYMENT_VALIDATION.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/LOCAL_DEPLOYMENT_VALIDATION.md)

---

## Executive Summary & Readiness Prerequisites

Dokumen ini adalah **checklist operasional langkah-demi-langkah (*step-by-step execution runbook*)** untuk memandu tim engineering melakukan rilis perdana sistem Pictolabs ke lingkungan server produksi. Seluruh perintah terminal, konfigurasi DNS, skrip migrasi database, dan tata urutan eksekusi telah diselaraskan dengan arsitektur riil repositori.

### Status Prasyarat (Semua Telah Terpenuhi):
* [x] Domain komersial terdaftar: `pictolabs.id`
* [x] Skema relasional PostgreSQL tervalidasi (`9,571 bytes DDL`, 0 syntax error)
* [x] Dockerfile multi-stage tervalidasi (`tsconfig.base.json` terintegrasi, user `nestjs`, healthcheck aktif)
* [x] NestJS runtime boot & health probe tervalidasi (`HTTP 200 OK` dalam 1.8 detik)
* [x] Target skala awal: 1–5 booth mall aktif (estimasi 250–500 sesi/hari)

---

# 1. Exact DNS Records Needed

Konfigurasi DNS harus diatur melalui dashboard DNS Cloudflare untuk domain **`pictolabs.id`**:

| Tipe | Nama Record | Target / Nilai | TTL | Cloudflare Proxy Status | Tujuan & Fungsi |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **A** | `api` (`api.pictolabs.id`) | `YOUR_VPS_PUBLIC_IP` | Auto | **DNS Only (Grey Cloud)** *(awal)*<br>$\rightarrow$ **Proxied (Orange Cloud)** *(setelah SSL)* | REST API Backend, WebSocket stream kios mall, dan webhook payment gateway |
| **CNAME** | `dl` (`dl.pictolabs.id`) | `<bucket-id>.r2.cloudflarestorage.com` | Auto | **Proxied (Orange Cloud)** | Custom domain publik untuk CDN pengunduhan softfile foto & video Live Photo |
| **A** | `@` (`pictolabs.id`) | `YOUR_VPS_PUBLIC_IP` | Auto | **Proxied (Orange Cloud)** | Landing page / redirect domain utama |
| **CNAME** | `www` (`www.pictolabs.id`) | `pictolabs.id` | Auto | **Proxied (Orange Cloud)** | Canonical alias www |

> [!IMPORTANT]
> **Aturan Khusus Penerbitan Sertifikat Pertama Kali**:  
> Saat pertama kali menjalankan Certbot Standalone pada server VPS, record `api.pictolabs.id` **WAJIB berada pada status "DNS Only" (Grey Cloud)** agar proses verifikasi HTTP-01 Let's Encrypt dapat langsung mencapai port 80 VPS Anda tanpa diintersepsi oleh CDN Cloudflare. Setelah sertifikat berhasil diterbitkan dan Nginx aktif, barulah proxy Cloudflare dapat dinyalakan ("Proxied" / Orange Cloud).

---

# 2. Exact Cloudflare Setup

Lakukan konfigurasi berikut pada panel kontrol Cloudflare (Domain: `pictolabs.id`):

### 2.1 Konfigurasi SSL/TLS
* [ ] Buka menu **SSL/TLS** $\rightarrow$ **Overview**.
* [ ] Ubah mode enkripsi menjadi: **Full (Strict)**.
  *(Mode ini memastikan komunikasi dari browser/kiosk ke Cloudflare terenkripsi, dan dari Cloudflare ke Nginx VPS Anda juga terenkripsi menggunakan sertifikat valid Let's Encrypt).*
* [ ] Buka menu **SSL/TLS** $\rightarrow$ **Edge Certificates**:
  * [ ] Aktifkan **Always Use HTTPS** (`ON`).
  * [ ] Minimum TLS Version: **TLS 1.2**.
  * [ ] Opportunistic Encryption: `ON`.
  * [ ] TLS 1.3: `ON`.
  * [ ] Automatic HTTPS Rewrites: `ON`.

### 2.2 Konfigurasi Jaringan & WebSockets (Kritis untuk Kiosk Mall)
* [ ] Buka menu **Network**:
  * [ ] **WebSockets**: Pastikan berstatus **ON**.  
    *(Wajib aktif agar koneksi Socket.IO KioskGateway `/socket.io/` antara bilik foto mall dan server pusat tidak diblokir).*
  * [ ] **gRPC**: `OFF` (tidak digunakan).
  * [ ] **IPv6 Compatibility**: `ON`.
  * [ ] **Pseudo IPv4**: `Off`.

### 2.3 Konfigurasi Cloudflare R2 Storage (Penyimpanan Softfile)
* [ ] Buka panel **R2 Object Storage**:
  * [ ] Klik **Create bucket**, masukkan nama: `pictolabs-media-prod`.
  * [ ] Location Hint: **APAC (Asia-Pacific)** atau Automatic (terdekat dengan Indonesia).
* [ ] **Hubungkan Custom Domain**:
  * [ ] Masuk ke menu bucket `pictolabs-media-prod` $\rightarrow$ tab **Settings**.
  * [ ] Pada bagian *Public access* $\rightarrow$ *Custom Domains*, klik **Connect Domain**.
  * [ ] Masukkan: `dl.pictolabs.id`.
  * [ ] Cloudflare akan secara otomatis menambahkan CNAME record ke tabel DNS Anda.
* [ ] **Konfigurasi CORS (Cross-Origin Resource Sharing)**:
  * [ ] Pada tab **Settings** $\rightarrow$ **CORS Policy**, masukkan aturan JSON berikut:
    ```json
    [
      {
        "AllowedOrigins": [
          "https://pictolabs.id",
          "https://api.pictolabs.id",
          "http://localhost:3000"
        ],
        "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
        "MaxAgeSeconds": 3600
      }
    ]
    ```
* [ ] **Konfigurasi Lifecycle Rules (Retensi Otomatis 30 Hari)**:
  * [ ] Masuk ke tab **Settings** $\rightarrow$ **Object lifecycle rules**.
  * [ ] Klik **Add rule**:
    * Name: `delete-expired-customer-media-30d`
    * Prefix filter: *Kosongkan (berlaku untuk semua file di bucket)*
    * Action: **Delete objects**
    * Age: **30 days**
* [ ] **Generate API Token Kredensial R2**:
  * [ ] Buka **R2** $\rightarrow$ **Manage R2 API Tokens** $\rightarrow$ **Create API Token**.
  * [ ] Permissions: **Object Read & Write**.
  * [ ] Specify bucket: `pictolabs-media-prod`.
  * [ ] Catat kredensial berikut untuk dimasukkan ke file `.env` VPS:
    * `R2_ACCOUNT_ID`
    * `R2_ACCESS_KEY_ID`
    * `R2_SECRET_ACCESS_KEY`

---

# 3. Exact VPS Specifications Required

Berdasarkan audit kapasitas pada [INFRASTRUCTURE_REQUIREMENTS_AUDIT.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md) untuk skala operasional **1–5 Unit Booth**:

| Komponen Hardware | Spesifikasi Minimum Mutlak | Spesifikasi Rekomendasi (*Recommended*) | Rationale Teknis |
| :--- | :--- | :--- | :--- |
| **Operating System** | **Ubuntu 24.04 LTS (Noble Numbat)** | **Ubuntu 24.04 LTS (Noble Numbat)** | Kernel 6.8+, support systemd cgroup v2 untuk Docker |
| **Processor (CPU)** | **2 vCPU Core** (x86_64) | **4 vCPU Core** (AMD EPYC / Intel Xeon) | Menangani burst Sharp image processing & 5 polling stream |
| **Memory (RAM)** | **4 GB RAM** + 2 GB Swap | **8 GB RAM** + 2 GB Swap | Postgres (1.5GB), NestJS (512MB), Redis (200MB), Nginx (100MB), OS Buffer |
| **Storage (Disk)** | **40 GB NVMe SSD** | **80 GB NVMe SSD** | OS (8GB), Docker images (5GB), Buffer foto lokal 7 hari (20GB) |
| **Jaringan & Bandwidth** | **1 Gbps Port**, 2 TB Traffic/bln | **1 Gbps Port**, 4 TB Traffic/bln | Unduhan gambar frame template dan live preview buffer |
| **Provider Rekomendasi** | Hetzner Cloud **CPX21** (~$12/bln)<br>DigitalOcean **Basic 4GB** ($24/bln) | Hetzner Cloud **CPX31** (~$19/bln)<br>DigitalOcean **General Purpose** ($36/bln) | Lokasi datacenter: Singapore (terdekat) atau Jakarta VPS |

---

# 4. Exact PostgreSQL Setup Steps

Skema database diproyeksikan dan diisolasi di dalam container Docker resmi `postgres:16-alpine`.

### 4.1 Parameter Database Produksi
* **Engine**: PostgreSQL 16.x Alpine
* **Nama Database**: `pictolabs_prod`
* **Nama Pengguna**: `pictolabs_admin`
* **Port Terikat**: `127.0.0.1:5432` *(Terkunci di loopback host, tidak dapat diakses dari internet publik)*
* **Volume Persisten**: `postgres_data` (Docker Named Volume)
* **Encoding / Collation**: `UTF-8`

### 4.2 Langkah-Langkah Eksekusi
1. [ ] **Update DataSource Prisma ke PostgreSQL**:
   Pastikan file [apps/backend/prisma/schema.prisma](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L1-L4) mengarah ke PostgreSQL:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. [ ] **Inisialisasi Service Container**:
   Nyalakan container database PostgreSQL:
   ```bash
   cd /opt/pictolabs/pictolabs-rebuild
   docker compose -f docker-compose.prod.yml up -d postgres
   ```
3. [ ] **Tunggu Status Healthcheck Database**:
   Verifikasi bahwa PostgreSQL siap menerima koneksi:
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres pg_isready -U pictolabs_admin -d pictolabs_prod
   # Output yang wajib muncul: pictolabs_prod:5432 - accepting connections
   ```
4. [ ] **Eksekusi Migrasi Skema Resmi (15 Tabel)**:
   Jalankan migrasi DDL dari dalam backend container:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
   ```
   *Verifikasi*: Seluruh 15 tabel (`users`, `companies`, `branches`, `booths`, `booth_configs`, `booth_health_logs`, `sessions`, `photos`, `prints`, `frames`, `frame_layers`, `frame_assets`, `transactions`, `payments`, `vouchers`, `queues`, `updates`, `logs`) terbuat lengkap dengan primary key UUID dan foreign key constraint.
5. [ ] **Eksekusi Seeding Data Master Awal**:
   Jalankan script seed untuk memasukkan profil perusahaan dan registrasi bilik foto pertama:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend node seed.js
   # Output: Database seeded successfully: Booth ID <UUID>
   ```

---

# 5. Exact SSL Setup Sequence (Mengatasi Cold-Start Trap)

> [!WARNING]
> **Penyebab Kegagalan Nginx**:  
> Nginx akan langsung crash (*emerg BIO_new_file failed*) jika container `nginx` dinyalakan sebelum file `fullchain.pem` dan `privkey.pem` ada di folder `./nginx/certs/live/api.pictolabs.id/`. Ikuti urutan di bawah ini dengan presisi.

### Urutan Eksekusi SSL:
* [ ] **Langkah 5.1: Pastikan Port 80 Bebas**:
  ```bash
  ss -tulpn | grep :80
  # Jika ada apache atau webserver lama, matikan: systemctl stop apache2 2>/dev/null
  ```
* [ ] **Langkah 5.2: Install Certbot Standalone pada Host VPS**:
  ```bash
  apt update && apt install -y certbot
  ```
* [ ] **Langkah 5.3: Terbitkan Sertifikat SSL Let's Encrypt**:
  Pastikan DNS `api.pictolabs.id` sudah mengarah ke IP VPS (Grey Cloud):
  ```bash
  certbot certonly --standalone \
    -d api.pictolabs.id \
    --non-interactive \
    --agree-tos \
    -m admin@pictolabs.id
  ```
  *Verifikasi*: File sertifikat tersimpan di `/etc/letsencrypt/live/api.pictolabs.id/`.
* [ ] **Langkah 5.4: Siapkan Folder Mount untuk Nginx Docker**:
  ```bash
  cd /opt/pictolabs/pictolabs-rebuild
  mkdir -p nginx/certs nginx/certbot-challenge
  
  # Bind mount let's encrypt direktori ke folder projek
  rm -rf nginx/certs/*
  cp -rL /etc/letsencrypt/* nginx/certs/
  ```
* [ ] **Langkah 5.5: Uji Validitas Sintaks Nginx di Container**:
  Setelah sertifikat terpasang di `nginx/certs/live/api.pictolabs.id/`:
  ```bash
  docker compose -f docker-compose.prod.yml run --rm nginx nginx -t
  # Output wajib: nginx: configuration file /etc/nginx/nginx.conf test is successful
  ```
* [ ] **Langkah 5.6: Setup Auto-Renewal Otomatis (Cron Job)**:
  Let's Encrypt kedaluwarsa setiap 90 hari. Pasang skrip pembaruan otomatis:
  ```bash
  cat << 'EOF' > /usr/local/bin/pictolabs-renew-ssl.sh
  #!/bin/bash
  certbot renew --webroot -w /opt/pictolabs/pictolabs-rebuild/nginx/certbot-challenge --quiet
  cp -rL /etc/letsencrypt/* /opt/pictolabs/pictolabs-rebuild/nginx/certs/
  docker compose -f /opt/pictolabs/pictolabs-rebuild/docker-compose.prod.yml exec -T nginx nginx -s reload
  EOF
  
  chmod +x /usr/local/bin/pictolabs-renew-ssl.sh
  
  # Daftarkan ke crontab root (eksekusi setiap tanggal 1 jam 03:00 pagi)
  (crontab -l 2>/dev/null; echo "0 3 1 * * /usr/local/bin/pictolabs-renew-ssl.sh >> /var/log/ssl-renew.log 2>&1") | crontab -
  ```

---

# 6. Exact Docker Deployment Commands

Perintah lengkap dari provisioning OS awal hingga status production live:

### 6.1 Persiapan Host OS & Instalasi Docker Engine v2
```bash
# 1. Update OS & Paket Dasar
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban jq htop ca-certificates gnupg

# 2. Setup Firewall (UFW)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (SSL Renewal & Redirect)
ufw allow 443/tcp   # HTTPS API & WebSocket
ufw --force enable

# 3. Install Docker Engine Resmi (v2)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Verifikasi Docker & Compose
docker --version
docker compose version
```

### 6.2 Clone Repositori & Penataan Folder Kerja
```bash
# Buat direktori aplikasi
mkdir -p /opt/pictolabs
cd /opt/pictolabs

# Clone repositori (gunakan Deploy Key atau HTTPS token)
git clone https://github.com/YOUR_ORGANIZATION/pictolabs.git .

# Masuk ke direktori rebuild
cd pictolabs-rebuild
```

### 6.3 Injeksi Environment Variables Produksi (`.env`)
```bash
cat << 'EOF' > .env
# --- DATABASE CREDENTIALS (POSTGRESQL 16) ---
POSTGRES_USER=pictolabs_admin
POSTGRES_PASSWORD=SECURE_RANDOM_POSTGRES_PASSWORD_MIN_48_CHARS
POSTGRES_DB=pictolabs_prod

# --- APPLICATION AUTH & SECURITY ---
JWT_SECRET=SECURE_RANDOM_JWT_SECRET_STRING_MIN_64_CHARS
JWT_EXPIRES_IN=7d
PORT=4000
NODE_ENV=production

# --- PAYMENT GATEWAY (MIDTRANS PRODUCTION) ---
PAYMENT_GATEWAY_PROVIDER=MIDTRANS
PAYMENT_GATEWAY_ENV=production
MIDTRANS_SERVER_KEY=Mid-server-YOUR_OFFICIAL_PRODUCTION_SERVER_KEY
MIDTRANS_CLIENT_KEY=Mid-client-YOUR_OFFICIAL_PRODUCTION_CLIENT_KEY
MIDTRANS_IS_PRODUCTION=true
PAYMENT_WEBHOOK_SECRET=YOUR_SECURE_WEBHOOK_HASH_SECRET

# --- CLOUDFLARE R2 OBJECT STORAGE (SOFTFILE CDN) ---
R2_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID_HASH
R2_ACCESS_KEY_ID=YOUR_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=YOUR_R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME=pictolabs-media-prod
R2_PUBLIC_DOMAIN=https://dl.pictolabs.id

# --- STORAGE & RETENTION POLICIES ---
MEDIA_CLOUD_RETENTION_DAYS=30
MEDIA_LOCAL_RETENTION_DAYS=7
EOF

# Kunci izin file agar hanya dapat dibaca user root
chmod 600 .env
```

### 6.4 Build & Peluncuran Container
```bash
# 1. Pastikan tsconfig.base.json sudah berada di apps/backend/Dockerfile (telah diperbaiki)
# 2. Build image backend multi-stage
docker compose -f docker-compose.prod.yml build --no-cache

# 3. Jalankan Postgres dan Redis terlebih dahulu
docker compose -f docker-compose.prod.yml up -d postgres redis

# 4. Jalankan migrasi Prisma awal setelah Postgres healthy
docker compose -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.prod.yml exec -T backend npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec -T backend node seed.js

# 5. Jalankan Nginx Reverse Proxy (setelah sertifikat SSL di langkah 5 disalin)
docker compose -f docker-compose.prod.yml up -d nginx
```

---

# 7. Exact Order of Operations (Master Checklist)

Ikuti urutan bernomor ini secara berurutan. Jangan melompati langkah apapun:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. DNS & Cloud  │ ──► │ 2. VPS & Docker │ ──► │ 3. Clone & .env │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 6. DB Migration │ ◄── │ 5. Start DBs    │ ◄── │ 4. Certbot SSL  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 7. Build Backend│ ──► │ 8. Launch Nginx │ ──► │ 9. Verification │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │10. Orange Cloud │
                                                └─────────────────┘
```

- [ ] **Langkah 1: Konfigurasi DNS & R2 di Cloudflare**
  - Buat A record `api.pictolabs.id` $\rightarrow$ VPS IP (Grey Cloud).
  - Buat R2 bucket `pictolabs-media-prod` & hubungkan ke `dl.pictolabs.id`.
  - Pasang Lifecycle rule (30 hari) dan catat R2 API Token.
- [ ] **Langkah 2: Provisioning & Pengamanan Server VPS**
  - Login SSH, upgrade paket OS Ubuntu 24.04.
  - Aktifkan UFW firewall (port 22, 80, 443).
  - Install Docker CE v2 dan Docker Compose plugin.
- [ ] **Langkah 3: Penerbitan Sertifikat SSL Let's Encrypt (Standalone)**
  - Jalankan `certbot certonly --standalone -d api.pictolabs.id`.
  - Pastikan certbot selesai dengan output: `Congratulations! Your certificate and chain have been saved`.
- [ ] **Langkah 4: Setup Repositori & Kredensial Produksi**
  - Clone repositori ke `/opt/pictolabs/pictolabs-rebuild`.
  - Buat file `.env` dengan password database kuat dan production Midtrans keys.
  - Salin sertifikat SSL ke `./nginx/certs/live/api.pictolabs.id/`.
- [ ] **Langkah 5: Kompilasi & Build Docker Container**
  - Jalankan `docker compose -f docker-compose.prod.yml build`.
  - Verifikasi build multi-stage `@pictolabs/shared` dan NestJS berhasil tanpa error.
- [ ] **Langkah 6: Inisialisasi Database PostgreSQL & Redis**
  - Jalankan `docker compose -f docker-compose.prod.yml up -d postgres redis`.
  - Tunggu status `(healthy)` via `docker compose ps`.
- [ ] **Langkah 7: Peluncuran Backend & Migrasi Skema**
  - Jalankan `docker compose -f docker-compose.prod.yml up -d backend`.
  - Eksekusi `docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy`.
  - Eksekusi `docker compose -f docker-compose.prod.yml exec backend node seed.js`.
- [ ] **Langkah 8: Peluncuran Nginx Reverse Proxy**
  - Jalankan `docker compose -f docker-compose.prod.yml up -d nginx`.
  - Verifikasi Nginx running dan tidak crash loop.
- [ ] **Langkah 9: Verifikasi End-to-End Kesehatan API**
  - Uji endpoint: `curl -k https://127.0.0.1/api/storage/health -H "Host: api.pictolabs.id"`.
  - Respon wajib: `{"healthy": true, ...}` status `200 OK`.
- [ ] **Langkah 10: Aktifkan Cloudflare Proxy (Orange Cloud)**
  - Ubah record `api.pictolabs.id` di DNS Cloudflare dari Grey Cloud ke **Orange Cloud (Proxied)**.
  - Pastikan SSL Mode di Cloudflare adalah **Full (Strict)**.
  - Uji via browser dari smartphone/laptop luar: `https://api.pictolabs.id/api/storage/health`.
- [ ] **Langkah 11: Konfigurasi Webhook di Dashboard Midtrans**
  - Buka Dashboard Midtrans Production $\rightarrow$ Settings $\rightarrow$ Configuration.
  - Masukkan Payment Notification URL: `https://api.pictolabs.id/api/payments/webhook/midtrans`.
  - Simpan dan uji send test notification (respon wajib: `200 OK`).
- [ ] **Langkah 12: Pasang Skrip Backup Harian Database**
  - Pasang cron job backup PostgreSQL di crontab host:
    ```bash
    mkdir -p /opt/backups/postgres
    (crontab -l 2>/dev/null; echo "0 2 * * * docker exec pictolabs-postgres pg_dump -U pictolabs_admin pictolabs_prod | gzip > /opt/backups/postgres/db-\$(date +\\%Y\\%m\\%d).sql.gz && find /opt/backups/postgres -type f -mtime +14 -delete") | crontab -
    ```

---

# 8. Rollback Plan if Deployment Fails

Jika terjadi kegagalan fatal pada saat proses deployment produksi, ikuti protokol rollback berikut:

```
┌─────────────────────────────────────────────────────────────┐
│                 INCIDENT SEVERITY MATRIX                    │
├───────────────────┬───────────────────┬─────────────────────┤
│ Level 1 (Low)     │ Level 2 (Medium)  │ Level 3 (Critical)  │
│ Nginx / SSL Fail  │ Container Crash   │ Database Corrupt    │
│ Certbot renewal   │ Revert Docker tag │ Restore pg_dump     │
└───────────────────┴───────────────────┴─────────────────────┘
```

### Skenario A: Kegagalan Migrasi Database (`prisma migrate deploy` Gagal)
* **Penyebab**: Koneksi timeout, permission user ditolak, atau skema konflik.
* **Prosedur Rollback**:
  1. Hentikan container backend:
     ```bash
     docker compose -f docker-compose.prod.yml stop backend
     ```
  2. Drop database yang setengah terbuat dan pulihkan dari backup jika ada:
     ```bash
     docker compose -f docker-compose.prod.yml exec postgres psql -U pictolabs_admin -d postgres -c "DROP DATABASE IF EXISTS pictolabs_prod;"
     docker compose -f docker-compose.prod.yml exec postgres psql -U pictolabs_admin -d postgres -c "CREATE DATABASE pictolabs_prod OWNER pictolabs_admin;"
     ```
  3. Lakukan inspeksi file migrasi di `apps/backend/prisma/migrations/`.

### Skenario B: Container Backend Gagal Booting / Crash Loop
* **Penyebab**: Environment variable salah, missing secret, atau error native sharp.
* **Prosedur Rollback**:
  1. Periksa log error spesifik:
     ```bash
     docker compose -f docker-compose.prod.yml logs --tail=100 backend
     ```
  2. Jika disebabkan oleh bug build kode terbaru, checkout commit Git stabil sebelumnya:
     ```bash
     git log -n 5 --oneline
     git checkout <LAST_STABLE_COMMIT_HASH>
     docker compose -f docker-compose.prod.yml build backend
     docker compose -f docker-compose.prod.yml up -d backend
     ```

### Skenario C: Nginx Crash Loop Karena Sertifikat SSL
* **Penyebab**: File sertifikat Let's Encrypt hilang atau domain belum resolve saat certbot dijalankan.
* **Prosedur Pemulihan Cepat (Bypass ke Self-Signed Sementara)**:
  1. Buat sertifikat dummy self-signed agar Nginx bisa menyala:
     ```bash
     mkdir -p nginx/certs/live/api.pictolabs.id
     openssl req -x509 -nodes -days 7 -newkey rsa:2048 \
       -keyout nginx/certs/live/api.pictolabs.id/privkey.pem \
       -out nginx/certs/live/api.pictolabs.id/fullchain.pem \
       -subj "/CN=api.pictolabs.id"
     ```
  2. Nyalakan Nginx:
     ```bash
     docker compose -f docker-compose.prod.yml restart nginx
     ```
  3. Ubah sementara SSL mode Cloudflare ke **Full** (bukan Strict) hingga Certbot resmi berhasil diperbarui.

### Skenario D: Rollback Total / Bencana Server (Disaster Recovery)
Jika server VPS mengalami kerusakan hardware atau filesystem corrupt:
1. Provisioning VPS baru di region yang sama.
2. Update DNS A record `api.pictolabs.id` ke IP VPS baru.
3. Jalankan kembali langkah 6.1 s.d. 6.4.
4. Restore data transaksi dari file backup gzip terakhir:
   ```bash
   gunzip < /opt/backups/postgres/db-LATEST.sql.gz | docker exec -i pictolabs-postgres psql -U pictolabs_admin -d pictolabs_prod
   ```
5. Foto pelanggan di Cloudflare R2 tetap aman dan tidak terpengaruh karena disimpan terpisah di cloud object storage.
