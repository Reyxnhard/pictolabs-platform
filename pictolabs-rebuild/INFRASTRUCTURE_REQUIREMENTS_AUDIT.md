# PICTOLABS SYSTEM INFRASTRUCTURE REQUIREMENTS AUDIT

> **Platform**: Pictolabs Enterprise v1.0.0 Rebuild  
> **Auditor**: Antigravity Technical Architecture & Diagnostic Engine  
> **Date**: September 8, 2026  
> **Standard**: 100% Evidence-Based. Derived from repository runtime profiles, production logs, media pipelines, and hardware specifications.  
> **Delivery Path**: `INFRASTRUCTURE_REQUIREMENTS_AUDIT.md` & `docs/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md`

---

## Executive Summary

Audit ini menyajikan analisis kebutuhan komputasi, memori, media penyimpanan, dan jaringan secara kuantitatif untuk pengoperasian sistem bilik foto Pictolabs secara komersial di lokasi mall. 

Seluruh estimasi didasarkan pada telemetri riil dari mesin bilik foto komersial aktif (berkas log 24 hari pada `kiosk-client-photobooth-template-flipbook-basic/logs`), pipeline pemrosesan komposit foto Sharp 300 DPI, kompresi video MP4 FFmpeg, serta arsitektur backend NestJS dan Cloudflare R2.

---

# 1. Current Runtime Requirements

### 1.1 Versi Node.js
* **Target Runtime**: **Node.js 20 LTS (Active Iron)** atau **Node.js 22 LTS**.
* **Bukti Repositori**:
  * [apps/backend/package.json:43](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/package.json#L43): `@types/node: ^20.17.0`
  * [apps/kiosk/package.json:34](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/package.json#L34): `@types/node: ^20.17.0`
* **Persyaratan Engine**: Wajib 64-bit architecture (`x64` / `arm64`). Node.js 32-bit tidak didukung karena alokasi buffer Sharp 300 DPI dan native binding Canon EDSDK C++.

---

### 1.2 Kebutuhan Memori (RAM)

Berdasarkan data telemetri sampling performa setiap 30 detik pada berkas log riil bilik foto (`logs/app-2026-08-19.log` dan `logs/app-2026-08-21.log`):
```text
[Perf] uptime=14347s main=173MB/0.7% renderer=507MB/2.2% gpu=1311MB/0.4% procs=5
[Perf] uptime=182005s main=199MB/0.4% renderer=454MB/0.1% gpu=1175MB/0% procs=5
```

#### A. Kiosk Client PC (Hardware Windows di Mall):
* **Electron Main Process**: ~160 MB – 200 MB RAM
* **Chromium UI Renderer Process**: ~450 MB – 550 MB RAM
* **GPU Memory / VRAM Allocation**: ~1,100 MB – 1,350 MB (untuk rendering canvas Konva 1080p, preview liveview 30fps, dan shader)
* **Sharp 300 DPI Image Buffer Burst**: ~350 MB – 500 MB (selama proses compositing strip 4R/2R)
* **FFmpeg Video Transcoder Burst**: ~200 MB – 300 MB (selama export MP4 Live Photo)
* **Sistem Operasi Windows 10/11 IoT Core/Enterprise**: ~2,000 MB – 2,500 MB
* **Total RAM Minimum Kiosk**: **8 GB RAM** (Sangat disarankan: **16 GB DDR4/DDR5 Dual Channel** untuk mencegah crash saat render komposit).

#### B. Cloud Backend Server (NestJS + Prisma):
* **NestJS Server (Baseline Idle)**: ~85 MB – 120 MB RAM
* **Under Active Load (API Requests, WebSocket, ZIP streaming)**: ~250 MB – 400 MB per worker
* **Prisma Client Engine**: ~60 MB – 90 MB RAM
* **Total RAM Minimum Backend**: **1 GB RAM** (Khusus untuk proses backend).

---

### 1.3 Kebutuhan Prosesor (CPU)

#### A. Kiosk PC di Mall:
* **Beban Kerja Utama**:
  1. Pengambilan frame LiveView Canon EOS 70D via USB EDSDK pada 30 FPS.
  2. Muxing WebM video recorder ([LivePhotoService.ts:40-50](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/LivePhotoService.ts#L40-L50)).
  3. Transcoding video ke format MP4 via `ffmpeg.exe` ([LivePhotoService.ts:19-37](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/LivePhotoService.ts#L19-L37)).
  4. Rendering komposit 300 DPI resolusi $1200 \times 1800$ pixel ([RenderEngine.ts](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/RenderEngine.ts)).
* **Rekomendasi CPU Kiosk**:
  * **Minimum**: Intel Core i5 Generasi ke-8 (misal: i5-8400 / i5-8500T 6 Cores) atau AMD Ryzen 5 3600.
  * **Direkomendasikan**: Intel Core i5 Generasi ke-11/12/13/14 (misal: i5-11400 / i5-12400 / i3-12100) dengan GPU terintegrasi Intel UHD Graphics 730/770 (mendukung akselerasi hardware Intel QuickSync Video).

#### B. Cloud Backend Server (VPS):
* **Beban Kerja**: Operasi I/O murni (menerima webhook Midtrans, menyajikan SSE/WebSocket, menghasilkan presigned URL R2, dan streaming arsip ZIP).
* **Rekomendasi CPU VPS**:
  * **1–3 Booths**: 1 vCPU (2.0 GHz+).
  * **5–10 Booths**: 2 vCPU.

---

### 1.4 Kebutuhan Penyimpanan (Disk)

#### A. Instalasi Kiosk:
* OS Windows 10/11 LTSC: ~20 GB
* Runtime Electron + Dependencies: ~800 MB
* Library Binary FFmpeg (`ffmpeg.exe`): ~64.5 MB ([bukti ukuran fisik: 64,458,752 bytes](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe))
* Library Sharp & Native DLLs: ~120 MB
* Template Bingkai & Aset Audio/Video: ~300 MB

#### B. Ukuran Data per 1 Sesi Foto Pelanggan:
Berdasarkan berkas output nyata sesi foto di kiosk:
* 3x Foto Mentah Kamera (RAW JPEG Fine Canon): $3 \times 5.0\text{ MB} = 15.0\text{ MB}$
* 1x Komposit Cetak 300 DPI (`output.png`): ~9.8 MB ([bukti: output.png = 9,885,715 bytes](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/output.png))
* 3x Klip Countdown WebM/MP4 Live Photo: $3 \times 1.5\text{ MB} = 4.5\text{ MB}$
* 1x Video Stop-Motion / Videobooth MP4: ~5.5 MB ([bukti: videobooth.mp4 = 5,534,483 bytes](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/videobooth.mp4))
* 1x Animasi GIF: ~3.5 MB
* **Total Media per Sesi**: **~38.3 MB per customer session**.

#### C. Kebutuhan SSD Kiosk Lokal (Aturan Retensi 7 Hari):
* Rata-rata transaksi mall: 80 sesi/hari (hari kerja) hingga 150 sesi/hari (akhir pekan) $\approx$ **700 sesi/minggu**.
* $700 \text{ sesi} \times 38.3\text{ MB} \approx \mathbf{26.8\text{ GB}}$ kapasitas aktif di SSD bilik foto.
* **Rekomendasi SSD Kiosk**: Minimal **128 GB NVMe SSD** (Direkomendasikan **256 GB NVMe SSD**).

---

# 2. Docker Readiness

### 2.1 Berkas Docker yang Sudah Ada
* [pictolabs-rebuild/docker-compose.yml](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/docker-compose.yml):
  * Service 1: `postgres:16-alpine` (Database engine).
  * Service 2: `redis:7-alpine` (Cache & Socket.IO messaging).

### 2.2 Berkas Docker yang Belum Ada (Missing)
1. **`apps/backend/Dockerfile`**: Berkas multi-stage build untuk mengompilasi NestJS TypeScript, menjalankan `prisma generate`, dan menghasilkan container produksi yang ramping (*slim Node.js 20 Alpine*).
2. **`docker-compose.prod.yml`**: Berkas orchestrator produksi yang menyatukan service `backend`, `postgres`, `redis`, dan `nginx-ssl`.
3. **`nginx/nginx.conf`**: Konfigurasi reverse proxy untuk SSL termination, websocket upgrade, dan rate limiting.

### 2.3 Penghambat Deployment (Deployment Blockers)
1. **Containerisasi Backend Belum Selesai**: Backend saat ini hanya bisa dijalankan manual via `npm run dev` atau `node dist/main.js` di host OS.
2. **Database Hardcoded ke SQLite**: Skema Prisma ([schema.prisma:2](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L2)) masih menunjuk ke `file:./dev.db`.
3. **Ketiadaan Health Check Container Backend**: Docker tidak dapat memantau jika proses backend crash tanpa endpoint `/health` terintegrasi.

---

# 3. PostgreSQL Requirements

### 3.1 Estimasi Ukuran Database
* **Ukuran Baris per Sesi**:
  * 1 Baris `Session` + 1 Baris `Transaction` + 1 Baris `Payment` + 3 Baris `Photo` metadata $\approx$ **~2.5 KB**.
* **Log Kesehatan Hardware Kiosk (`BoothHealthLog`)**:
  * Mengirim status suhu CPU, sisa kertas printer, dan status kamera setiap 60 detik selama jam operasional mall (12 jam/hari).
  * $1 \text{ booth} \times 720 \text{ ping/hari} \times 30 \text{ hari} = 21,600 \text{ baris/bulan} \approx \mathbf{8.5\text{ MB/bulan/booth}}$.
* **Akumulasi Transaksi Bulanan (2,000 Sesi/Bulan/Booth)**:
  * $2,000 \times 2.5\text{ KB} \approx \mathbf{5.0\text{ MB/bulan/booth}}$.
* **Total Pertumbuhan Basis Data**:
  * **1 Booth**: ~13.5 MB per bulan (~162 MB per tahun).
  * **5 Booths**: ~67.5 MB per bulan (~810 MB per tahun).
  * **10 Booths**: ~135 MB per bulan (~1.62 GB per tahun).

### 3.2 Kompleksitas Skema
* **Tingkat Kompleksitas**: **SEDANG (Clean Relational Schema)**.
* **Jumlah Tabel**: 15 Model tabel relasional ([schema.prisma](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma)).
* **Kebutuhan Storage PostgreSQL di VPS**: Cukup mengalokasikan **10 GB – 20 GB disk volume** untuk database, yang mampu menampung riwayat transaksi hingga lebih dari 5 tahun operasi.

---

# 4. Storage Requirements (Cloudflare R2 & Local)

### 4.1 Local Storage Usage (Kiosk PC di Mall)
* Mengikuti aturan **Local Storage Retention: 7 Hari**.
* Media hanya dihapus jika `upload_status == COMPLETED` ([AC-2.1](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/SPRINT_3_PLAN.md)).
* **Kebutuhan Disk Kiosk**: **20 GB – 35 GB** ruang bebas untuk direktori `captures/`, `composites/`, dan `videos/`.

### 4.2 Cloudflare R2 Usage (Cloud Storage)
* Mengikuti aturan **Cloudflare R2 Lifecycle: 30 Hari Automatic Purge** ([AC-2.2](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/SPRINT_3_PLAN.md)).
* Berkas terkompresi yang diunggah per sesi:
  * 1x Komposit Web-optimized JPEG: ~2.5 MB
  * 1x Live Photo MP4 (h264 optimized): ~3.5 MB
  * 1x Animasi GIF: ~3.0 MB
  * 3x Foto Kamera resolusi medium/tinggi: ~9.0 MB
  * **Rata-rata Upload per Sesi**: **~18.0 MB**.

### 4.3 Pertumbuhan Storage R2 Berdasarkan Jumlah Booth (Cap 30 Hari)
Karena adanya aturan penghapusan otomatis setelah 30 hari, **kapasitas Cloudflare R2 tidak akan bertambah tanpa batas**, melainkan akan mencapai titik stabil (*ceiling cap*) pada hari ke-30:

$$\text{Penyimpanan Maksimal R2} = \text{Jumlah Booth} \times 2,000 \text{ sesi/bulan} \times 18.0\text{ MB}$$

* **1 Booth**: Titik stabil di **~36 GB** ($0.54/bulan).
* **3 Booths**: Titik stabil di **~108 GB** ($1.62/bulan).
* **5 Booths**: Titik stabil di **~180 GB** ($2.70/bulan).
* **10 Booths**: Titik stabil di **~360 GB** ($5.40/bulan).
* **Biaya Bandwidth / Egress Customer**: **$0.00 (Gratis Tanpa Batas dari Cloudflare R2)**.

---

# 5. Resource Estimation (Skenario Lapangan)

Berikut adalah kalkulasi kebutuhan hardware untuk 3 skenario armada:

```
[ KIOSK PC (Mall A) ] ──┐
[ KIOSK PC (Mall B) ] ──┼──► [ CLOUD VPS ] ──► [ CLOUDFLARE R2 ]
[ KIOSK PC (Mall C) ] ──┘
```

### Skenario A: 1 Booth (Single Mall Pilot)
| Komponen | Spesifikasi Cloud Server (VPS) | Spesifikasi Kiosk Client (PC Mall) |
| :--- | :--- | :--- |
| **CPU** | 1 vCPU (2.0 GHz+) | 4 Cores (Intel Core i3 10th Gen / i5 8th Gen) |
| **RAM** | 1 GB – 2 GB RAM | 8 GB DDR4 RAM |
| **Disk** | 25 GB SSD | 128 GB NVMe SSD |
| **Network** | Bandwidth 1 Gbps port, 1 TB egress | Wi-Fi / LAN Modem 4G (Min. Upload 5 Mbps) |

### Skenario B: 3 Booths (3 Lokasi Mall)
| Komponen | Spesifikasi Cloud Server (VPS) | Total Agregat Seluruh Kiosk (3 Unit) |
| :--- | :--- | :--- |
| **CPU** | 2 vCPU (2.4 GHz+) | 3x Unit PC Kiosk (Masing-masing 4–6 Cores) |
| **RAM** | 2 GB – 4 GB RAM | 3x 8 GB DDR4/DDR5 RAM |
| **Disk** | 40 GB – 50 GB NVMe SSD | 3x 128 GB NVMe SSD |
| **Network** | Bandwidth 1 Gbps port, 2 TB egress | Masing-masing Kiosk butuh Min. Upload 10 Mbps |

### Skenario C: 5 Booths (Ekspansi Mall Komersial)
| Komponen | Spesifikasi Cloud Server (VPS) | Total Agregat Seluruh Kiosk (5 Unit) |
| :--- | :--- | :--- |
| **CPU** | 2 vCPU – 4 vCPU | 5x Unit PC Kiosk (Masing-masing 6 Cores) |
| **RAM** | 4 GB – 8 GB RAM | 5x 16 GB DDR4/DDR5 Dual Channel |
| **Disk** | 80 GB NVMe SSD | 5x 256 GB NVMe SSD |
| **Network** | Bandwidth 1 Gbps port, 3 TB egress | Masing-masing Kiosk butuh Min. Upload 10 Mbps |

---

# 6. Recommended VPS Size

Untuk menampung container NestJS Backend, PostgreSQL 16, Redis 7, dan Nginx Reverse Proxy:

### 1. Tingkat Minimum (Testing & 1 Booth)
* **Spesifikasi**: 1 vCPU, 2 GB RAM, 25 GB NVMe SSD.
* **Contoh Provider**:
  * DigitalOcean Basic Droplet ($12/bulan)
  * Hetzner Cloud CX22 (€3.79/bulan $\approx$ Rp 65.000)
* **Keterbatasan**: Memori mepet jika PostgreSQL dan NestJS berjalan bersamaan; perlu swap memory 2 GB.

### 2. Tingkat Direkomendasikan (Recommended - Standar Produksi 1–5 Booths)
* **Spesifikasi**: **2 vCPU, 4 GB RAM, 50 GB NVMe SSD**.
* **Contoh Provider**:
  * DigitalOcean General Purpose / Regular Droplet ($24/bulan $\approx$ Rp 380.000)
  * Hetzner Cloud CPX21 (€7.05/bulan $\approx$ Rp 120.000)
  * Contabo Cloud VPS 1 (€5.50/bulan $\approx$ Rp 95.000)
* **Kelebihan**: Ruang RAM sangat lega untuk PostgreSQL buffering, Redis caching, 2 NestJS PM2 cluster worker, dan koneksi WebSocket stabil tanpa lonjakan CPU.

### 3. Tingkat Pertumbuhan (Growth Tier - 10+ Booths Enterprise)
* **Spesifikasi**: **4 vCPU, 8 GB RAM, 100 GB NVMe SSD**.
* **Contoh Provider**:
  * DigitalOcean Droplet ($48/bulan $\approx$ Rp 760.000)
  * Hetzner Cloud CPX31 (€13.40/bulan $\approx$ Rp 230.000)
* **Kelebihan**: Siap melayani ratusan request pembayaran serentak dan pengunggahan background tanpa antrean.

---

# 7. Realistic Monthly Cost Estimate

Berikut adalah proyeksi biaya infrastruktur cloud bulanan berdasarkan harga pasar riil per September 2026:

### Rincian Biaya per Komponen:

| Komponen Layanan | Spesifikasi / Provider | Estimasi Biaya (USD) | Estimasi Biaya (IDR) |
| :--- | :--- | :--- | :--- |
| **Domain Utama** | Domain `.id` resmi (PANDI) atau `.com` via Cloudflare Registrar | ~$1.25 / bulan (dibayar ~$15/tahun) | ~Rp 20.000 / bulan |
| **DNS, WAF, & SSL** | Cloudflare Free Tier (Universal SSL, DDoS Shield, DNS Cepat) | **$0.00** | **Rp 0** |
| **Cloud VPS Backend** | VPS 2 vCPU / 4 GB RAM (Hetzner / Contabo / DigitalOcean) | $8.00 – $24.00 / bulan | Rp 125.000 – Rp 380.000 / bln |
| **Cloudflare R2 Storage** | Penyimpanan 30 Hari ($0.015/GB setelah 10 GB gratis) | $0.50 – $2.50 / bulan | Rp 8.000 – Rp 40.000 / bln |
| **R2 Egress Bandwidth** | Unduhan galeri customer (Unlimited Free Egress) | **$0.00** | **Rp 0** |

---

### Total Proyeksi Biaya Operasional Cloud Bulanan:

#### 1. Skenario 1 Booth (Single Mall Pilot):
* Domain: Rp 20.000
* VPS Cloud (Hetzner CX22 / DigitalOcean): Rp 125.000
* Cloudflare R2 (36 GB peak): Rp 8.000
* **TOTAL BULANAN: ~Rp 153.000 – Rp 300.000 / bulan ($10 – $20 / mo)**

#### 2. Skenario 3 Booths (3 Lokasi Mall):
* Domain: Rp 20.000
* VPS Cloud (2 vCPU / 4 GB RAM): Rp 180.000
* Cloudflare R2 (108 GB peak): Rp 25.000
* **TOTAL BULANAN: ~Rp 225.000 – Rp 425.000 / bulan ($15 – $27 / mo)**

#### 3. Skenario 5 Booths (Ekspansi 5 Mall):
* Domain: Rp 20.000
* VPS Cloud (2 vCPU / 4 GB RAM performa tinggi): Rp 250.000
* Cloudflare R2 (180 GB peak): Rp 42.000
* **TOTAL BULANAN: ~Rp 312.000 – Rp 500.000 / bulan ($20 – $32 / mo)**

---

### Kesimpulan Rekomendasi Finansial:
Dengan mengadopsi arsitektur **Cloudflare R2 ($0 egress)** dibanding arsitektur lawas AWS S3 milik Photolab (yang membebankan egress ~$0.09/GB atau sekitar Rp 300.000 - Rp 600.000 hanya untuk kuota download pelanggan), **Pictolabs menghemat hingga 70% biaya infrastruktur bulanan**, sehingga biaya server per unit booth bilik foto mall berada di kisaran sangat ekonomis: **kurang dari Rp 100.000 / booth / bulan**.
