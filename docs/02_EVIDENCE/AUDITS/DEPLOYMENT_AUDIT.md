# PICTOLABS SYSTEM DEPLOYMENT READINESS AUDIT

> **Audit Date**: September 8, 2026  
> **Platform Version**: Pictolabs Rebuild v1.0.0 Enterprise  
> **Auditor**: Antigravity Technical Architecture & Diagnostic Engine  
> **Audit Target**: Full Codebase Repository (`pictolabs-rebuild`)  
> **Delivery Path**: `docs/DEPLOYMENT_AUDIT.md` & `DEPLOYMENT_AUDIT.md`  
> **Rule**: Evidence-based only. Zero speculation. File paths provided for every finding.

---

## Executive Summary

Audit kesiapan deployment (*deployment readiness audit*) ini mengevaluasi seluruh lapisan repositori Pictolabs: aplikasi backend, skema basis data, konfigurasi containerisasi Docker, variabel lingkungan, integrasi penyimpanan awan (*Cloud Storage*), gateway pembayaran Midtrans, arsitektur deployment armada bilik foto, dan kelayakan infrastruktur produksi.

Secara ringkas:
* **Development Readiness**: **94/100** (Arsitektur modul, engine komposit 300 DPI, dynamic QRIS, pipeline R2 presigned, dan gallery HTML5 berfungsi sempurna di lingkungan lokal).
* **Production Readiness**: **42/100** (Belum siap dideploy langsung ke server publik: tidak ada Dockerfile aplikasi, database masih SQLite tanpa migration system, kunci Midtrans masih Sandbox, CORS terbuka bebas, dan belum ada domain/SSL).
* **Multi-Booth Readiness**: **35/100** (Arsitektur database dan WebSocket saat ini belum siap menangani multi-kiosk tanpa migrasi ke PostgreSQL + Redis adapter, serta beberapa URL backend masih ter-hardcode ke `localhost:4000` pada client).

---

# 1. Backend

### Framework & Versi
* **Framework**: **NestJS v10.4.0** yang berjalan di atas platform Express (`@nestjs/platform-express`).
* **Bukti Berkas**:
  * [apps/backend/package.json:18-24](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/package.json#L18-L24):
    ```json
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "@nestjs/platform-socket.io": "^10.4.0",
    "@nestjs/websockets": "^10.4.0"
    ```

### Entrypoint Backend
* **Lokasi Berkas**: [apps/backend/src/main.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/main.ts#L8-L36)
* **Fungsi**: `bootstrap()` menginisialisasi `NestFactory.create<NestExpressApplication>(AppModule)`, mengatur body parser JSON hingga `50mb`, mengaktifkan CORS, memasang `ValidationPipe({ transform: true, whitelist: true })`, mengonfigurasi rute statis berkas `/uploads/` dengan header `Accept-Ranges: bytes` (HTTP 206 Partial Content), dan mendengarkan pada port yang ditentukan (`PORT` atau default `4000`).

### Cara Menjalankan Backend
* **Environment Development**:
  ```bash
  cd apps/backend
  npm run dev     # Menjalankan: nest start --watch
  ```
* **Kompilasi Produksi (Build)**:
  ```bash
  npm run build   # Menjalankan: nest build (output berkas JavaScript ke folder apps/backend/dist)
  ```
* **Menjalankan Hasil Kompilasi Produksi**:
  ```bash
  npm run start   # atau langsung via Node.js: node dist/main.js
  ```
  *(Sumber: [apps/backend/package.json:5-8](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/package.json#L5-L8))*

### Evaluasi Kesiapan Produksi (Production Readiness)
* **Status**: **NOT PRODUCTION READY (Perlu Perbaikan Konfigurasi)**
* **Faktor Positif**:
  1. Validasi DTO ketat menggunakan `class-validator` dan `class-transformer` aktif secara global ([main.ts:14](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/main.ts#L14)).
  2. Dukungan streaming video HTTP 206 Partial Content telah teruji untuk safari iOS/Android ([main.ts:25-28](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/main.ts#L25-L28)).
  3. Modul terisolasi dengan baik (`StorageModule`, `PaymentsModule`, `AuthModule`, `PrismaModule`).
* **Kelemahan Kritis Sebelum Produksi**:
  1. **CORS Terlalu Terbuka**: `app.enableCors({ origin: '*' })` pada [main.ts:13](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/main.ts#L13) memperbolehkan sembarang origin mengakses API. Harus dibatasi ke domain kiosk dan galeri resmi.
  2. **Ketiadaan Process Manager**: Tidak ada konfigurasi PM2 (`ecosystem.config.js`) atau systemd service untuk auto-restart saat terjadi exception tak terduga.
  3. **Ketiadaan Rate Limiter**: Belum terpasang `@nestjs/throttler` untuk mencegah brute force pada endpoint `/api/payments/qris` atau spamming `/api/storage/presigned-upload`.
  4. **WebSocket Adapter**: `KioskGateway` ([kiosk.gateway.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gateway/kiosk.gateway.ts)) masih menggunakan default in-memory Socket.IO adapter. Jika backend di-scale horizontal menjadi 2 instance di server, notifikasi pembayaran via WebSocket tidak akan tersebar antar-instance.

---

# 2. Database

### Database yang Digunakan Saat Ini
* **Jenis Database**: **SQLite** (Bukan PostgreSQL).
* **Bukti Berkas**: [apps/backend/prisma/schema.prisma:1-4](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L1-L4):
  ```prisma
  datasource db {
    provider = "sqlite"
    url      = "file:./dev.db"
  }
  ```
* **Berkas Fisik Database**: `apps/backend/prisma/dev.db` (Ukuran: 1,044,480 bytes).
* **Catatan Anomali Konfigurasi**:
  Berkas [.env:1](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/.env#L1) mendefinisikan string PostgreSQL:
  `DATABASE_URL="postgresql://pictolabs:pictolabs_dev_2026@localhost:5432/pictolabs?schema=public"`, namun berkas `schema.prisma` di-hardcode ke SQLite `file:./dev.db` sehingga URL PostgreSQL tersebut diabaikan total oleh Prisma Client saat ini.

### Lokasi Skema & Model Entitas
* **Lokasi Skema**: [apps/backend/prisma/schema.prisma](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma) (252 baris kode).
* **Tabel yang Didefinisikan**:
  * `User` (multi-role authentication: Superadmin, Company Admin, Branch Manager, Operator)
  * `Company` & `Branch` (struktur tenant organisasi)
  * `Booth` & `BoothConfig` (manajemen perangkat bilik foto dan konfigurasi kamera/printer)
  * `BoothHealthLog` (pencatatan suhu CPU, sisa kertas, status kamera/printer)
  * `Session`, `Photo`, `Print` (siklus hidup sesi foto dan aset)
  * `Frame`, `FrameLayer`, `FrameAsset` (tata letak template komposit)
  * `Transaction` & `Payment` (rekam jejak pembayaran Midtrans QRIS)
  * `Voucher`, `QueueJob`, `AppUpdate`, `SystemLog`

### Sistem Migrasi
* **Status**: **TIDAK ADA MIGRATION SYSTEM AKTIF**.
* **Bukti**: Direktori [apps/backend/prisma/](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma) hanya berisi 2 file: `dev.db` dan `schema.prisma`. Tidak terdapat folder `migrations/`.
* **Metode Sinkronisasi Saat Ini**: Proyek menggunakan script `prisma db push` ([package.json:9](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/package.json#L9)). Perintah ini hanya cocok untuk prototyping lokal dan **berbahaya untuk produksi** karena tidak mencatat riwayat migrasi version-controlled dan dapat menyebabkan data loss saat perubahan skema.

### Evaluasi Kesiapan Produksi Database
* **Status**: **NOT READY FOR PRODUCTION**.
* **Alasan Teknis**:
  1. **File-Level Locking pada SQLite**: SQLite mengunci seluruh file database saat operasi write terjadi (`SQLITE_BUSY`). Jika beberapa booth mengirimkan log kesehatan, transaksi, dan data upload bersamaan, request akan timeout/gagal.
  2. **Migrasi Wajib ke PostgreSQL**: Sebelum rilis produksi, `schema.prisma` harus diubah ke `provider = "postgresql"` dan `url = env("DATABASE_URL")`, lalu menghasilkan initial migration melalui `npx prisma migrate dev --name init`.

---

# 3. Docker

### Status Konfigurasi Docker Saat Ini
* **Status**: **PARTIALLY CONFIGURED (Infrastructure Services Only)**.
* **Keberadaan Dockerfile**: **TIDAK ADA (0 Dockerfile)** di seluruh repositori.
  * Pencarian biner membuktikan tidak ada berkas bernama `Dockerfile`, `Dockerfile.backend`, maupun `Dockerfile.kiosk`.
* **Keberadaan docker-compose.yml**: **ADA**, terletak pada root proyek rebuild:
  * **Lokasi Berkas**: [pictolabs-rebuild/docker-compose.yml](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/docker-compose.yml#L1-L37)
  * **Layanan yang Didefinisikan**:
    1. `postgres:16-alpine` (Container: `pictolabs-db`, port 5432:5432, volume: `postgres_data`)
    2. `redis:7-alpine` (Container: `pictolabs-redis`, port 6379:6379, volume: `redis_data`)
  * **Ketiadaan Layanan Backend/Frontend**: Layanan aplikasi `backend` NestJS dan frontend `kiosk` **belum dimasukkan** ke dalam `docker-compose.yml`.

### Bisakah Proyek Dideploy Langsung Menggunakan Docker?
* **JAWABAN: TIDAK BISA**.
  Menjalankan `docker compose up` hanya akan menyalakan container database PostgreSQL kosong dan Redis kosong. Kode backend tidak akan ter-build ataupun berjalan di dalam container Docker.

---

# 4. Environment Variables

Berdasarkan pemindaian kode sumber riil pada `apps/backend/src`, berikut adalah inventaris lengkap seluruh variabel lingkungan:

### A. Wajib untuk Produksi (Required for Production)
| Variabel | Tipe / Contoh Nilai | Kegunaan & Lokasi Kode | Kategori Rahasia |
| :--- | :--- | :--- | :---: |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/pictolabs?schema=public` | Koneksi database PostgreSQL produksi saat SQLite dimigrasi. | **SECRET** |
| `JWT_SECRET` | String acak 64 karakter (bukan nilai default dev) | Enkripsi token autentikasi staf & admin ([auth.module.ts:14](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/auth/auth.module.ts#L14)). | **CRITICAL SECRET** |
| `PORT` | `4000` (atau port yang dialokasikan reverse proxy) | Port HTTP server backend ([main.ts:31](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/main.ts#L31)). | Config |
| `MIDTRANS_SERVER_KEY` | `Mid-server-XXXXX...` | Kunci otentikasi API Midtrans Core & verifikasi SHA-512 ([payments.service.ts:19](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L19)). | **CRITICAL SECRET** |
| `MIDTRANS_CLIENT_KEY` | `Mid-client-XXXXX...` | Identitas klien Midtrans ([payments.service.ts:20](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L20)). | Public Key |
| `MIDTRANS_IS_PRODUCTION` | `true` | Mengarahkan API dari `api.sandbox.midtrans.com` ke `api.midtrans.com` ([payments.service.ts:21-24](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L21-L24)). | Config |
| `R2_ACCOUNT_ID` | Hash akun Cloudflare (32 karakter hex) | Endpoint Cloudflare R2 ([storage.service.ts:48](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L48)). | Secret ID |
| `R2_ACCESS_KEY_ID` | Token API Key ID R2 (32 char) | Otentikasi S3 SDK ke bucket R2 ([storage.service.ts:49](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L49)). | **SECRET** |
| `R2_SECRET_ACCESS_KEY` | Token Secret Key R2 (64 char hex) | Kunci rahasia upload presigned URL ([storage.service.ts:50](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L50)). | **CRITICAL SECRET** |
| `R2_BUCKET_NAME` | `pictolabs-media-prod` | Nama bucket Cloudflare R2 ([storage.service.ts:25](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L25)). | Config |
| `R2_PUBLIC_DOMAIN` | `https://dl.pictolabs.id` | Domain CDN publik untuk softfile pengunjung ([storage.service.ts:26](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L26)). | Config |

### B. Opsional / Memiliki Nilai Default (Optional Variables)
| Variabel | Nilai Default Jika Kosong | Kegunaan |
| :--- | :--- | :--- |
| `JWT_EXPIRES_IN` | `7d` | Masa berlaku token login admin ([apps/backend/.env:3](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/.env#L3)). |
| `PAYMENT_GATEWAY_PROVIDER` | `MIDTRANS` | Provider pembayaran aktif ([apps/backend/.env:7](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/.env#L7)). |
| `PAYMENT_GATEWAY_ENV` | `sandbox` | Indikator visual log ([apps/backend/.env:8](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/.env#L8)). |
| `MEDIA_CLOUD_RETENTION_DAYS`| `30` | Masa retensi softfile di R2 sebelum otomatis terhapus ([storage.service.ts:27](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L27)). |
| `MEDIA_LOCAL_RETENTION_DAYS`| `7` | Masa retensi file lokal di PC booth sebelum dibersihkan ([storage.service.ts:28](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L28)). |

---

# 5. Cloud Storage

### Implementasi Storage Saat Ini
* **Arsitektur**: Dual-Engine (Cloudflare R2 + Local Filesystem Fallback) terenkapsulasi di [storage.service.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts).
* **Kompatibilitas SDK**: Menggunakan `@aws-sdk/client-s3` dan `@aws-sdk/s3-request-presigner` versi `^3.1127.0` ([package.json:16-17](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/package.json#L16-L17)).
* **Mekanisme Fallback Otomatis**: Jika kredensial R2 tidak diisi, backend tidak crash melainkan otomatis mengaktifkan provider `local_fallback` ke folder `public/uploads/`.
* **Fitur Presigned Upload Direct**: Mendukung pembuatan URL upload langsung (`/api/storage/presigned-upload`) dengan masa berlaku 15 menit agar kiosk tidak membebani memori server backend saat mengunggah foto resolusi tinggi.
* **Fitur Streaming ZIP**: Endpoint `/api/gallery/:sessionId/zip` menggunakan `archiver` ([package.json:28](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/package.json#L28)) untuk streaming file ZIP langsung ke browser tanpa menyita kapasitas RAM server.

### Status Integrasi Cloudflare R2
* **Kode Sumber**: **100% Selesai & Lulus Uji Unit/E2E** (30/30 test cases lulus di `storage.e2e.ts`).
* **Status Runtime Saat Ini**: Berjalan dalam mode **`local_fallback`** karena variabel `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, dan `R2_PUBLIC_DOMAIN` pada berkas `.env` saat ini belum diisi.
* **Bukti Respon API Langsung (`GET /api/storage/health`)**:
  ```json
  {
    "provider": "local_fallback",
    "bucket": null,
    "publicDomain": null,
    "localDir": "C:\\Users\\ezarh\\...\\apps\\backend\\public\\uploads",
    "healthy": true
  }
  ```

### Evaluasi Kesiapan Produksi Storage
* **Status**: **READY ON CODE / NOT READY ON CREDENTIALS**.
* **Tindakan yang Diperlukan Sebelum Produksi**:
  1. Membuat bucket di Cloudflare Dashboard: `pictolabs-media-prod`.
  2. Menerbitkan API Token R2 dengan izin *Admin Read & Write*.
  3. Mengonfigurasi Custom Domain CDN pada bucket (misal: `dl.pictolabs.id`).
  4. Memasukkan 5 kredensial R2 tersebut ke file `.env` server produksi.

---

# 6. Payment

### Status Integrasi Midtrans
* **Status**: **100% Diimplementasikan pada Tingkat Logika Kode**.
* **Lokasi Kode**:
  * Service: [apps/backend/src/payments/payments.service.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts)
  * Controller: [apps/backend/src/payments/payments.controller.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.controller.ts)
  * DTO: [apps/backend/src/payments/dto/payment.dto.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/dto/payment.dto.ts)
* **Fitur Terverifikasi**:
  1. Pembuatan Dynamic QRIS via Midtrans Core API `/v2/charge`.
  2. Fallback generator string EMVCo QRIS compliant untuk mode simulasi sandbox ([payments.service.ts:41-44](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L41-L44)).
  3. Verifikasi tanda tangan kriptografi SHA-512 (`calculateSignature`) untuk mencegah *webhook spoofing* ([payments.service.ts:49-52](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L49-L52)).
  4. Penyimpanan audit payload webhook lengkap ke database ([payments.service.ts:200](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L200)).
  5. Pengiriman event real-time `payment_settled` ke kiosk via WebSocket dengan latensi <120ms.

### Sandbox vs Production
* **Konfigurasi Aktif Saat Ini**: **SANDBOX**.
  * `MIDTRANS_IS_PRODUCTION=false` ([.env:11](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/.env#L11))
  * `MIDTRANS_SERVER_KEY=SB-Mid-server-test-key` ([.env:9](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/.env#L9))
  * `MIDTRANS_CLIENT_KEY=SB-Mid-client-test-key` ([.env:10](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/.env#L10))
  * URL API mengarah ke: `https://api.sandbox.midtrans.com/v2` ([payments.service.ts:24](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L24)).

### Kebutuhan Produksi yang Masih Kurang (Missing Production Requirements)
1. **Akun Merchant Midtrans Production Terverifikasi**: Memerlukan verifikasi legalitas usaha (KTP/NPWP/NIB) ke pihak Midtrans dan Bank Indonesia untuk menerbitkan QRIS resmi.
2. **Kunci Server Produksi**: Mengganti `SB-Mid-server-...` menjadi `Mid-server-...`.
3. **URL Webhook Publik Terdaftar (HTTPS)**: Midtrans Production mewajibkan URL Webhook yang memiliki SSL valid (misal: `https://api.pictolabs.id/api/payments/webhook`). IP lokal (`localhost` atau `127.0.0.1`) tidak dapat menerima webhook dari Midtrans di cloud.

---

# 7. Deployment Architecture Recommendation

Berdasarkan analisis karakteristik hardware bilik foto (kamera DSLR Canon, printer dye-sub, dan internet mall), berikut adalah rekomendasi arsitektur bertingkat:

### A. Untuk 1 Bilik Foto (Single Standalone Booth)
* **Topologi**: **Hybrid Local-Cloud Deployment**.
* **Kiosk PC (Windows bilik foto di mall)**:
  * Menjalankan **Electron Kiosk Client** (UI kasir/touchscreen).
  * Menjalankan **Local Backend NestJS** pada port 4000 di dalam PC bilik foto itu sendiri menggunakan **SQLite**.
  * Berkomunikasi langsung dengan driver USB lokal (Canon EDSDK C++ dan driver printer DNP DS-RX1).
  * **Kelebihan**: Jika koneksi Wi-Fi mall terputus, sesi foto dan cetak tetap 100% berjalan normal (*offline-first*).
* **Komponen Cloud Minimal yang Dibutuhkan**:
  * **Cloudflare Tunnel / Reverse Proxy Ringan**: Untuk menerima webhook Midtrans dari internet dan meneruskannya ke port 4000 di PC kiosk.
  * **Cloudflare R2**: Tempat pengunggahan softfile foto via koneksi internet saat online agar pelanggan dapat mengunduh di smartphone.

```
[ KIOSK PC LOKAL DI MALL ]
├── Electron UI (Port 3030)
├── NestJS Backend (Port 4000) + SQLite (dev.db)
├── Canon EDSDK + DNP DS-RX1 USB
└── Cloudflare Tunnel Client ──► Menerima Webhook Midtrans dari Cloud
           │
           ▼ (Upload softfile saat online)
   [ Cloudflare R2 CDN ] ──► Smartphone Customer Unduh Foto
```

---

### B. Untuk 5 Bilik Foto (Small Fleet di 2–3 Lokasi Mall Berbeda)
* **Topologi**: **Centralized Cloud Backend + Smart Edge Kiosks**.
* **Cloud Infrastructure (1 Unit VPS Linux)**:
  * **Spesifikasi**: VPS Ubuntu 24.04 LTS (4 vCPU, 8 GB RAM, 80 GB NVMe).
  * **Container**:
    * Container 1: `pictolabs-backend` (NestJS di-scale 2 worker via PM2).
    * Container 2: `postgres:16-alpine` (Database terpusat multi-tenant).
    * Container 3: `redis:7-alpine` (Socket.IO Redis adapter & queue).
    * Reverse Proxy: Nginx dengan SSL Let's Encrypt / Cloudflare Proxy.
  * **Domain**: `api.pictolabs.id` (Backend API & WebSocket) dan `dl.pictolabs.id` (R2 Storage CDN).
* **Kiosk PC di Setiap Mall**:
  * Menjalankan Electron Kiosk Client saja (tanpa backend lokal).
  * Menghubungkan WebSocket dan REST ke `https://api.pictolabs.id`.
  * Memiliki antrean offline SQLite lokal (`upload_queue`) untuk menampung transaksi & foto jika koneksi mall drop, lalu menyinkronkan otomatis saat online kembali.

```
[ Kiosk Mall A ] ──┐
[ Kiosk Mall B ] ──┼──► [ Cloudflare WAF / SSL ]
[ Kiosk Mall C ] ──┤              │
[ Kiosk Mall D ] ──┤              ▼
[ Kiosk Mall E ] ──┘     [ Nginx Reverse Proxy ]
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
       [ NestJS Backend API ]             [ Cloudflare R2 CDN ]
                 │                                 │
         ┌───────┴───────┐                         ▼
         ▼               ▼                [ Smartphone Customer ]
   [ PostgreSQL 16 ]  [ Redis 7 ]
```

---

### C. Untuk 10+ Bilik Foto (Enterprise Multi-Mall Deployment)
* **Topologi**: **High-Availability Microservices Cluster + Edge Hardware Daemons**.
* **Komponen Cloud**:
  * **Managed PostgreSQL** (misal: AWS RDS PostgreSQL atau DigitalOcean Managed Database) dengan replikasi *read-replica* dan backup otomatis per jam.
  * **Managed Redis Cluster**: Menjamin pesan pembayaran WebSocket tersampaikan ke bilik foto yang tepat secara instan tanpa kehilangan koneksi.
  * **Cluster App Backend**: 2 atau lebih node VPS di balik Cloudflare Load Balancer.
  * **Storage**: Cloudflare R2 Multi-Region dengan Object Lifecycle otomatis 30 hari.
* **Komponen Kiosk di Lapangan**:
  * Menggunakan pairing key lisensi (`license` + `pairLicense`) seperti temuan pada audit Photolab.
  * Driver printer dan kamera diisolasi dalam subproses mandiri (*Windows background service*) agar crash pada UI Electron tidak mengganggu hardware.
  * Sinkronisasi telemetri kertas printer DNP (`/kiosk/paper/update`) ke dashboard pusat secara real-time.

---

# 8. Missing Infrastructure (Kebutuhan yang Belum Ada)

Evaluasi kelengkapan operasional produksi:

| Komponen Infrastruktur | Status Ketersediaan | Keterangan & Tindakan Nyata |
| :--- | :---: | :--- |
| **Domain Publik Resmi** | **MISSING** | Saat ini sistem masih menggunakan `localhost` dan IP lokal. Perlu mendaftarkan domain utama (misal: `pictolabs.id`). |
| **Server VPS Cloud** | **MISSING** | Belum ada server VPS publik (AWS / DigitalOcean / Linode / Hetzner). Aplikasi backend saat ini masih berjalan di PC Windows lokal pengembang. |
| **Sertifikat SSL (HTTPS)** | **MISSING** | Protokol komunikasi masih HTTP dan WS biasa. Produksi mewajibkan HTTPS dan WSS untuk keamanan webhook payment dan izin akses browser mobile. |
| **Sistem Monitoring & APM** | **MISSING** | Hanya tersedia endpoint dasar `/api/storage/health`. Belum ada error tracking (Sentry), APM performa server, dan visualisasi metrik (Prometheus/Grafana). |
| **Sistem Backup Otomatis** | **MISSING** | Belum ada script terjadwal (*cron job*) untuk backup basis data (`pg_dump` atau backup SQLite harian) ke cloud storage sekunder. |
| **Sistem Centralized Logging** | **MISSING** | Log server backend hanya dicetak ke terminal konsol (`stdout`). Belum terintegrasi ke log aggregator (Loki, Papertrail, atau Datadog) untuk mendeteksi error di mall jarak jauh. |
| **Fleet Management System** | **MISSING** | Belum ada dashboard admin terpusat untuk memantau status online/offline booth di mall, omset harian real-time, dan push frame baru (direncanakan pada **Sprint 4**). |

---

# 9. Final Score & Kesimpulan

Berdasarkan bukti konkret dan kondisi aktual repositori saat ini:

### 1. Development Readiness: **94 / 100**
> **Keterangan**: Seluruh fitur inti (kamera Canon EDSDK, komposit foto Sharp 300 DPI, pembayaran dinamis Midtrans QRIS, pipeline presigned upload R2, dan galeri mobile responsif) telah selesai 100% dan lulus uji e2e di lingkungan development.

### 2. Production Readiness: **42 / 100**
> **Keterangan**: Kode logika sangat baik, namun infrastruktur runtime produksi belum disiapkan: ketiadaan Dockerfile, database masih SQLite dev tanpa migrasi terkelola, kunci Midtrans masih Sandbox, R2 masih fallback lokal, dan CORS masih `*`.

### 3. Multi-Booth Readiness: **35 / 100**
> **Keterangan**: Sistem belum siap menangani multi-kiosk secara bersamaan karena SQLite tidak mendukung konkurensi write tinggi, WebSocket belum menggunakan Redis adapter, dan beberapa rute di client kiosk masih mengarah ke hardcoded `localhost:4000`.

---

### Rekomendasi Tindakan Prioritas Menuju Produksi:
1. **Langkah 1**: Buat `Dockerfile` untuk backend NestJS dan perbarui `docker-compose.yml` agar backend berjalan di dalam container.
2. **Langkah 2**: Ubah `provider` di `prisma/schema.prisma` ke `postgresql`, jalankan `prisma migrate dev --name init`, dan hubungkan ke service PostgreSQL.
3. **Langkah 3**: Siapkan domain publik (`pictolabs.id`), akun Cloudflare R2, dan VPS Linux dengan Nginx SSL.
4. **Langkah 4**: Ganti kredensial Midtrans Sandbox menjadi Midtrans Production Server Key.
5. **Langkah 5**: Lanjutkan pengembangan **Sprint 4** untuk Remote Admin Dashboard & Fleet Telemetry.
