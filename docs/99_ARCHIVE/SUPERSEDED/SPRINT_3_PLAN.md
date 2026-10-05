# SPRINT 3 IMPLEMENTATION PLAN: CLOUD STORAGE (R2), ASYNC UPLOAD PIPELINE & DIGITAL DELIVERY

> **Platform**: Pictolabs v1.0 Enterprise Edition  
> **Status**: Ready for Implementation (Revised with Cloud Asset Retention Policy)  
> **Sprint Focus**: Cloudflare R2 Object Storage, Presigned Direct Upload, Resilient Offline-First Upload Queue, Public CDN Landing Page, and Dual-Tier Media Retention Policy (7-Day Local & 30-Day Cloud Expiration)  
> **Source of Truth**: [docs/MASTER_PROJECT_STATUS.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/MASTER_PROJECT_STATUS.md), [docs/SPRINT_1_REVIEW.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/SPRINT_1_REVIEW.md) & [docs/SPRINT_2_REVIEW.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/SPRINT_2_REVIEW.md)  
> **Target Platform**: Windows 10/11 Kiosk (Client Media Worker) & NestJS Cloud Backend (Storage Orchestrator & Public CDN Gallery)

---

## 1. Objectives

1. **Zero-Egress Cloud Storage Migration**: Mengintegrasikan Cloudflare R2 via AWS S3 SDK v3 (`@aws-sdk/client-s3`) untuk penyimpanan berkas foto komposit 300 DPI, klip Live Photo MP4, dan foto mentah tanpa biaya transfer data keluar (*zero egress cost*).
2. **Off-Main-Server Direct Upload (Presigned URLs)**: Mengurangi beban I/O dan memori pada server backend NestJS dengan memfasilitasi pengunggahan langsung (*direct client-to-storage upload*) dari Kiosk ke R2 menggunakan presigned PUT URLs berwaktu kedaluwarsa.
3. **Resilient Offline-First Upload Worker**: Memastikan Kiosk kebal terhadap internet lambat atau terputus total; seluruh media dicatat di SQLite lokal (`upload_queue`) dan diunggah otomatis di latar belakang (*background worker*) dengan mekanisme *exponential backoff retry* tanpa mengganggu jalannya bilik foto.
4. **Blazing-Fast Customer Download Web Gallery**: Menyajikan antarmuka mobile-first responsif yang memuat aset media secara instan melalui CDN publik Cloudflare kustom (misal `https://dl.pictolabs.id/{sessionId}`), mendukung pengunduhan satu per satu (HD Photo, Strip, MP4, GIF) serta unduhan arsip ZIP terkompresi penuh.
5. **Dual-Tier Storage Retention & Privacy Management**:
   - **Local Kiosk Retention (7 Hari)**: Menjaga ketersediaan kapasitas SSD di PC bilik foto mall (*unattended kiosks*) dengan menghapus berkas lokal lawas (>7 hari) **hanya jika** status pengunggahan telah berstatus `COMPLETED`.
   - **Cloud R2 Retention (30 Hari)**: Menghapus berkas media di Cloudflare R2 secara otomatis setelah 30 hari demi efisiensi biaya penyimpanan cloud jangka panjang dan kepatuhan privasi data customer (*GDPR/PDP compliance*).
   - **Graceful Gallery Expiration Notice**: Tautan galeri digital pelanggan (`/d/:sessionId`) tetap valid sebagai URL resmi, namun menampilkan halaman pemberitahuan masa aktif kedaluwarsa yang elegan dan ramah pengguna setelah berkas media terhapus.

---

## 2. Scope

### A. Cloudflare R2 / AWS S3 Integration
* Konfigurasi koneksi client S3 SDK v3 pada backend NestJS (`StorageService`):
  * `endpoint`: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`
  * `credentials`: `R2_ACCESS_KEY_ID` dan `R2_SECRET_ACCESS_KEY`
  * `bucket`: `R2_BUCKET_NAME`
  * `publicDomain`: `R2_PUBLIC_DOMAIN` (misal: `https://dl.pictolabs.id` atau subdomain R2 publik).
* Skema penamaan objek Cloud Storage terstruktur:
  * Komposit Cetak 300 DPI: `sessions/{sessionId}/composite.jpg`
  * Foto Mentah: `sessions/{sessionId}/photos/photo_{index}.jpg`
  * Video Live Photo: `sessions/{sessionId}/videos/live_{poseIndex}.mp4`
  * Animasi GIF: `sessions/{sessionId}/gif/animation.gif`
  * Arsip ZIP: `sessions/{sessionId}/bundle.zip`
* Fallback lokal otomatis (*high-speed local filesystem fallback*): Jika kredensial R2 belum diisi, sistem tetap berfungsi 100% menggunakan direktori lokal `public/uploads`.

### B. Presigned Upload URLs & Direct Ingestion
* Endpoint Backend: `POST /api/storage/presigned-url`
  * Parameter: `{ sessionId, fileName, fileType, contentType }`
  * Return: `{ uploadUrl, key, publicUrl, expiresAt }` (masa berlaku 15 menit menggunakan `@aws-sdk/s3-request-presigner`).
* Endpoint Konfirmasi Upload: `POST /api/storage/confirm-upload`
  * Kiosk memberi tahu backend bahwa file telah berhasil terunggah ke Cloud Storage.
  * Backend memperbarui record sesi di database SQLite (`photos.finalUrl`, `session.remoteUrl`, `session.uploaded = true`).

### C. Offline-First Upload Queue (`SyncEngine.ts`)
* Peningkatan antrean lokal `upload_queue` di SQLite Kiosk:
  * Status: `PENDING`, `UPLOADING`, `COMPLETED`, `FAILED`.
  * Pencatatan `attempts` (maksimal 5x percobaan per item).
  * Mekanisme jeda adaptif (*Exponential Backoff*): 2s, 4s, 8s, 16s, 32s.
  * Worker berjalan secara asinkron setiap 4 detik tanpa membebani thread antarmuka React Kiosk.
  * Pemutakhiran status sinkronisasi `sessions` lokal (`synced = 1`, `uploaded = 1`).

### D. Public Web Gallery & Graceful Expiration Page
* Halaman unduh publik: `GET /d/:sessionId` (dan `/api/gallery/:sessionId`)
  * **Kondisi Aktif (< 30 Hari)**:
    * Tampilan web mobile-first dengan tema modern, branding Pictolabs, dan preview aset.
    * Tab navigasi: *Photo Strip*, *Individual Photos*, *Live Photos (MP4)*, dan *Boomerang GIF*.
    * Tombol unduh instan satu klik untuk masing-masing berkas.
    * Tombol *Download Semua (ZIP)* yang mengalirkan (*stream*) arsip terkompresi langsung dari R2 atau server lokal.
  * **Kondisi Kedaluwarsa (>= 30 Hari atau Aset Telah Dihapus)**:
    * Tautan tetap merupakan URL valid (bukan halaman blank atau error 404/500).
    * Menampilkan antarmuka elegan bertema *Masa Aktif Galeri Telah Berakhir*.
    * Penjelasan transparan kepada pengunjung: *"Sesuai kebijakan privasi Pictolabs, berkas foto dan video digital disimpan selama 30 hari sejak sesi pemotretan dan kini telah dihapus secara aman."*
* Integrasi QR Code Kiosk (`QRScreen.tsx`):
  * URL pada QR code secara otomatis mengarah ke domain publik CDN yang terkonfigurasi.

### E. Dual-Tier Storage Retention Policy
1. **Tier 1: Local Kiosk Retention (7 Hari)**:
   * Daemon di Kiosk Electron berjalan saat startup dan setiap 24 jam sekali di latar belakang.
   * Kriteria penghapusan:
     - Berkas berada di folder `captures`, `composites`, atau `videos`.
     - Berkas berusia lebih dari 7 hari (`MEDIA_LOCAL_RETENTION_DAYS = 7`).
     - **Strict Safety Condition**: Berkas **HANYA** boleh dihapus jika rekam jejak di SQLite `upload_queue` telah berstatus `COMPLETED` (telah diverifikasi aman tersimpan di cloud).
   * *Disk Safeguard*: Jika sisa ruang hard disk PC Kiosk kurang dari 5 GB, otomatis menghapus media tertua yang berstatus `COMPLETED` lebih awal.
2. **Tier 2: Cloudflare R2 Retention (30 Hari)**:
   * Konfigurasi Cloudflare R2 Object Lifecycle Rule (`ExpirationInDays: 30`) pada bucket R2 untuk penghapusan otomatis dari cloud.
   * Backend cron sweeper periodik yang mendeteksi sesi berumur >30 hari dan menandai status metadata di database sebagai `PURGED`.

---

## 3. Out of Scope

Fitur-fitur berikut secara tegas **TIDAK TERMASUK** dalam lingkup Sprint 3:
* **Admin Web Analytics Dashboard UI**: Antarmuka visual monitoring cabang, omset, dan telemetri perangkat (*Ditunda ke Sprint 4*).
* **Frame Template Cloud CMS**: Pengunggahan dan pengelolaan layout bingkai via portal web (*Ditunda ke Sprint 4*).
* **OTA Auto-Updater Electron**: Mekanisme auto-update aplikasi bilik foto via `electron-updater` (*Ditunda ke Sprint rilis*).
* **Perubahan Modul Kamera & Render**: Tidak ada modifikasi pada Canon EDSDK binding, live view canvas, atau Sharp layout rendering.
* **Perubahan Modul Pembayaran**: Tidak ada perubahan pada alur Midtrans QRIS atau webhook signature verification dari Sprint 2.

---

## 4. Acceptance Criteria

### AC-1: Cloudflare R2 Connection & Fallback
* [ ] **AC-1.1**: Backend NestJS berhasil melakukan handshake ke Cloudflare R2 menggunakan AWS S3 SDK v3 saat kredensial valid disetel.
* [ ] **AC-1.2**: Jika kredensial R2 kosong/tidak valid, sistem secara otomatis mengalihkan penyimpanan ke disk lokal (`public/uploads`) tanpa melempar fatal error (*graceful degradation*).
* [ ] **AC-1.3**: Endpoint `GET /api/storage/health` mengembalikan status kesehatan storage, nama bucket, provider (`cloudflare_r2` atau `local_fallback`), dan ketersediaan direktori.

### AC-2: Presigned Direct Upload & Media Ingestion
* [ ] **AC-2.1**: Permintaan `POST /api/storage/presigned-url` mengembalikan URL PUT bertanda tangan yang valid dan kedaluwarsa dalam 900 detik.
* [ ] **AC-2.2**: Kiosk dapat mengunggah berkas komposit 300 DPI dan video Live Photo MP4 langsung ke R2 menggunakan presigned URL tersebut.
* [ ] **AC-2.3**: Endpoint `POST /api/storage/confirm-upload` memverifikasi keberadaan file di storage dan menandai sesi di database sebagai `uploaded = true`.

### AC-3: Resilient Offline-First Upload Worker
* [ ] **AC-3.1**: Saat foto selesai diproses di Kiosk, record media otomatis masuk ke tabel `upload_queue` SQLite lokal dengan status `PENDING`.
* [ ] **AC-3.2**: Worker antrean di `SyncEngine.ts` memproses antrean pengunggahan secara independen di latar belakang tanpa menyebabkan stuttering/lag pada animasi Kiosk.
* [ ] **AC-3.3**: Jika koneksi internet terputus di tengah proses upload, worker menandai status `FAILED`, meningkatkan counter `attempts`, dan mencoba kembali secara otomatis (*auto-retry*) saat internet terhubung kembali.

### AC-4: Customer Web Gallery & CDN Delivery
* [ ] **AC-4.1**: Halaman `GET /d/:sessionId` dapat diakses dari smartphone publik melalui browser mobile dalam waktu $<1.5$ detik.
* [ ] **AC-4.2**: Pengunjung dapat memutar video Live Photo (MP4 H.264) dan melihat preview photo strip resolusi tinggi secara responsif.
* [ ] **AC-4.3**: Tombol *Download Semua (ZIP)* menghasilkan unduhan arsip ZIP valid yang memuat seluruh foto, strip komposit, video MP4, dan animasi GIF tanpa file korup.

### AC-5: Dual-Tier Storage Retention & Expiration Policy
* [ ] **AC-5.1**: Media lokal di hard disk bilik yang berumur $>7$ hari dan telah berstatus `COMPLETED` di `upload_queue` dihapus secara otomatis oleh retention daemon.
* [ ] **AC-5.2**: Berkas media lokal yang belum berstatus `COMPLETED` (belum berhasil terunggah ke cloud) **DILARANG DIHAPUS**, berapa pun umurnya, guna mencegah kehilangan data customer.
* [ ] **AC-5.3**: **Cloud assets older than 30 days are automatically removed** dari Cloudflare R2 bucket sesuai lifecycle retention policy.
* [ ] **AC-5.4**: **Expired gallery links remain valid URLs but show an expiration page** (HTTP 200 dengan tampilan pesan kedaluwarsa yang informatif dan elegan, bukan error 404/500).

---

## 5. Risks & Mitigation Strategies

| Risiko Teknis | Tingkat Risiko | Dampak | Strategi Mitigasi |
| :--- | :---: | :--- | :--- |
| **Koneksi Internet Kiosk Lemah di Mall (Bandwidth Throttling)** | **HIGH** | Pengunggahan file video MP4 dan komposit 300 DPI (5-15 MB) memakan waktu lama atau sering gagal. | Kompresi asinkron di worker latar belakang; batasi pengunggahan konkuren maksimal 1 file per waktu; dukung *chunked upload* atau *retry resume*. Alur fisik bilik foto customer tidak pernah diblokir oleh proses upload. |
| **Cloudflare R2 Bucket Misconfiguration / Credential Expired** | **MEDIUM** | Upload gagal dan customer tidak bisa mengunduh softcopy dari smartphone mereka. | Mekanisme *Dual Storage*: Selalu simpan salinan lokal di Kiosk dan sediakan *local LAN fallback download* jika cloud storage tidak terjangkau. |
| **Beban Server Lonjak Saat Banyak Pengunjung Unduh ZIP Bersamaan** | **MEDIUM** | Server backend kehabisan memori atau CPU saat mengompresi arsip ZIP. | Gunakan streaming kompresi (`archiver` stream langsung ke HTTP response tanpa buffering seluruh ZIP di RAM server). |
| **Customer Menghapus Berkas Lokal Sebelum Terunggah (Accidental Data Loss)** | **HIGH** | File hilang permanen sebelum sempat disinkronkan ke cloud. | Validasi ketat di retention daemon: Berkas hanya boleh dihapus jika status di SQLite `upload_queue` adalah `COMPLETED` dan kolom `remote_url` tidak kosong. |
| **Komplain Customer Saat Mengakses Foto yang Sudah Kedaluwarsa (>30 Hari)** | **LOW** | Customer mengira website bilik foto rusak jika muncul pesan 404 / 500 error. | Tampilkan halaman kedaluwarsa khusus (*Graceful Expiration Page*) yang ramah pengguna dengan penjelasan kebijakan privasi 30 hari. |

---

## 6. Dependencies

### New & Existing Packages
* **`@aws-sdk/client-s3`** (`apps/backend`): *Sudah terpasang di `package.json`*. Digunakan untuk inisialisasi client S3 API yang kompatibel dengan Cloudflare R2 dan lifecycle configuration.
* **`@aws-sdk/s3-request-presigner`** (`apps/backend`): *Sudah terpasang di `package.json`*. Digunakan untuk membuat presigned PUT/GET URLs.
* **`archiver` & `@types/archiver`** (`apps/backend`): *Sudah terpasang di `package.json`*. Digunakan untuk streaming kompresi ZIP.
* **`better-sqlite3`** (`apps/kiosk`): *Sudah terpasang*. Digunakan untuk manajemen antrean lokal `upload_queue`.

### Infrastructure & Environment Configuration
Variabel lingkungan yang wajib disediakan di `apps/backend/.env`:
```env
# Cloudflare R2 / AWS S3 Object Storage
R2_ACCOUNT_ID=your_cloudflare_account_id_here
R2_ACCESS_KEY_ID=your_r2_access_key_id_here
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key_here
R2_BUCKET_NAME=pictolabs-media
R2_PUBLIC_DOMAIN=https://dl.pictolabs.id

# Dual-Tier Retention Policy
MEDIA_LOCAL_RETENTION_DAYS=7
MEDIA_CLOUD_RETENTION_DAYS=30
MIN_FREE_DISK_GB=5
```

---

## 7. Files Likely Affected

### Backend Modules (`apps/backend`)
* **[MODIFY]** `src/storage/storage.service.ts`: Implementasi presigned URL generation, multi-file R2 upload helper, R2 lifecycle management, dan health check.
* **[MODIFY]** `src/storage/storage.controller.ts`: Endpoint `POST /api/storage/presigned-url` dan `POST /api/storage/confirm-upload`.
* **[MODIFY]** `src/gallery/gallery.controller.ts`: Pengecekan umur sesi (>30 hari), penyajian template halaman kedaluwarsa (*Expired Gallery Notice*), dan fallback stream ZIP.

### Kiosk Electron (`apps/kiosk/electron`)
* **[MODIFY]** `electron/services/SyncEngine.ts`: Penyempurnaan worker `processUploadQueue()` dengan presigned direct upload, exponential backoff, dan integrasi retention cleanup.
* **[NEW]** `electron/services/StorageRetentionService.ts`: Daemon pembersih media lokal lawas (>7 hari) dengan validasi ketat status `COMPLETED`.
* **[MODIFY]** `electron/main.ts`: Inisialisasi `StorageRetentionService` pada saat app startup.

### Kiosk UI Layer (`apps/kiosk/src`)
* **[MODIFY]** `src/screens/QRScreen.tsx`: Penyajian QR Code dinamis yang menggunakan domain CDN publik (`R2_PUBLIC_DOMAIN` atau backend LAN fallback).

---

## 8. Step-by-Step Implementation Milestones

```
[Milestone 1: Cloud Storage Service, R2 Lifecycle & Health Check]
  │
  ▼
[Milestone 2: Presigned Direct Upload API & Ingestion]
  │
  ▼
[Milestone 3: Offline-First Upload Worker & Adaptive Retry Queue]
  │
  ▼
[Milestone 4: Public Mobile Web Gallery, CDN Delivery & Streaming ZIP]
  │
  ▼
[Milestone 5: Graceful Expiration Page for Purged Sessions (>30 Hari)]
  │
  ▼
[Milestone 6: Local Kiosk Retention Daemon (7 Hari & Disk Safeguard)]
  │
  ▼
[Milestone 7: Comprehensive Automated Verification & E2E Testing]
```

1. **Milestone 1: Cloud Storage Service, R2 Lifecycle & Health Check**
   - Menguji koneksi S3 client ke Cloudflare R2.
   - Konfigurasi aturan lifecycle 30 hari pada R2 bucket.
   - Menguji graceful degradation saat kredensial kosong (`local_fallback`).
2. **Milestone 2: Presigned Direct Upload API & Ingestion**
   - Menambahkan endpoint `POST /api/storage/presigned-url`.
   - Menguji pembuatan URL PUT berdurasi 15 menit dengan otentikasi header yang sesuai.
   - Endpoint `POST /api/storage/confirm-upload`.
3. **Milestone 3: Offline-First Upload Worker & Adaptive Retry Queue**
   - Memperbarui `SyncEngine.ts` untuk menggunakan direct upload presigned URL.
   - Mengimplementasikan jeda bertingkat (*exponential backoff*) saat jaringan offline.
4. **Milestone 4: Public Mobile Web Gallery, CDN Delivery & Streaming ZIP**
   - Mengoptimalkan respons web gallery agar gambar dan video dimuat langsung dari CDN R2.
   - Memastikan tombol unduh ZIP mengompresi berkas secara streaming tanpa lonjakan RAM.
5. **Milestone 5: Graceful Expiration Page for Purged Sessions (>30 Hari)**
   - Mendeteksi sesi berumur >30 hari di `gallery.controller.ts`.
   - Merender halaman antarmuka web khusus yang ramah pengguna dengan pesan kedaluwarsa kebijakan privasi resmi Pictolabs.
6. **Milestone 6: Local Kiosk Retention Daemon (7 Hari & Disk Safeguard)**
   - Membuat `StorageRetentionService.ts` untuk pemindaian berkas lokal lawas.
   - Menguji penghapusan berkas aman yang **hanya** menghapus media berstatus `COMPLETED` dan berumur >7 hari.
7. **Milestone 7: Comprehensive Automated Verification & E2E Testing**
   - Membangun automated test suite untuk pengujian upload queue, presigned URL, web gallery, expired notice, dan retention cleanup.

---

## 9. Definition of Done (DoD)

Sprint 3 dinyatakan selesai (*Complete*) apabila:
1. Seluruh 5 kriteria penerimaan (AC-1 s/d AC-5) lolos pengujian otomatis dan manual, termasuk verifikasi:
   - Media lokal berumur >7 hari terhapus jika dan hanya jika berstatus `COMPLETED`.
   - Aset cloud berumur >30 hari dihapus secara otomatis.
   - Tautan galeri kedaluwarsa tetap valid dan menampilkan halaman notifikasi kedaluwarsa yang elegan.
2. Tidak ada penurunan performa atau regresi pada modul kamera DSLR (Sprint 1) dan sistem pembayaran Midtrans QRIS (Sprint 2).
3. Pengunggahan berkas media lokal ke Cloudflare R2 berjalan otomatis di latar belakang tanpa menghambat antarmuka Kiosk.
4. Customer dapat memindai QR Code di layar akhir Kiosk menggunakan smartphone dan mengunduh seluruh hasil foto serta video secara instan melalui Web Gallery.
5. Pembersihan hard disk Kiosk berjalan aman tanpa risiko menghapus data yang belum tersinkronisasi ke cloud.
6. Kode terkompilasi bersih (`build` dan `typecheck` 0 errors) pada semua workspace (`backend`, `kiosk`, `shared`).
7. Tersusun dokumen penutupan resmi `docs/SPRINT_3_REVIEW.md`.
