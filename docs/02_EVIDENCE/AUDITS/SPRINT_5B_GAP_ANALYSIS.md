# SPRINT 5B GAP ANALYSIS: SUPPORT & RE-DELIVERY PLATFORM
**Pictolabs Cloud Photobooth Platform**
*Audit Date:* September 13, 2026  
*Status:* COMPLETE  
*Source of Truth:* Active Codebase (`apps/backend/src/`, `prisma/schema.prisma`, `apps/dashboard/src/`, `apps/kiosk/`)

---

## 1. Executive Summary

Audit terhadap implementasi Sprint 5B (*Support Search Engine, Session Timeline, Session Health Engine, Re-Delivery Flow, Emergency Reprint, Expired Gallery Extension, Email Resend*) menunjukkan bahwa **fondasi data layer, query engine, dan antarmuka Dashboard telah selesai diimplementasikan**.

Namun, audit menemukan **tiga titik diskoneksi kritis (critical missing links)** antara lapisan backend, client kiosk, dan modul galeri pelanggan:
1. **Emergency Reprint Kiosk Unreachable:** Backend mencatat status reprint di database, tetapi tidak memancarkan perintah via WebSocket gateway ke printer fisik kiosk.
2. **Expired Gallery Extension Bypass:** Endpoint perpanjangan memperbarui `retentionExpiresAt` di database, tetapi `GalleryController` mengabaikan kolom tersebut dan tetap memblokir customer dengan hardcoded rule `ageDays >= 30`.
3. **Session ID Fracture:** Kiosk `PaymentScreen` tidak menyimpan `sessionId` yang dibuat saat request QRIS, menyebabkan `CaptureScreen` membuat ID sesi baru. Sesi transaksi dan sesi foto terbelah menjadi dua entitas berbeda di database.

Secara keseluruhan, kesiapan fungsional Sprint 5B berada pada tingkat **72% terhubung**. Dengan perbaikan terarah tanpa migrasi skema database, kesiapan dapat ditingkatkan menjadi **100% dalam estimasi waktu 4.5 jam kerja**.

---

## 2. Technical Findings

### 2.1 Feature-by-Feature Implementation Status

| Feature ID | Feature Name | Code Status | Controller / Service | Database Tables | Frontend UI |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **F-01** | Support Search Engine | **IMPLEMENTED** | `SupportController` / `SupportService` | `sessions`, `booths`, `branches`, `photos`, `prints`, `transactions`, `payments` | `SupportSearchPage.tsx` |
| **F-02** | Session Timeline | **IMPLEMENTED** | `SessionsController` / `SessionsService` | `session_events`, `sessions` | `SessionTimeline.tsx` |
| **F-03** | Session Health Engine | **IMPLEMENTED** | `SessionHealthService` | `sessions`, `session_events`, `prints`, `photos` | `SessionHealthCard.tsx` |
| **F-04** | Re-Delivery Audit Flow | **IMPLEMENTED** | `SessionRedeliveryService` | `redelivery_logs`, `sessions` | `RedeliveryHistoryTable.tsx` |
| **F-05** | Emergency Reprint | **PARTIAL** | `SessionRedeliveryService:triggerReprint` | `prints`, `redelivery_logs`, `session_events` | `ReprintModal.tsx` |
| **F-06** | Gallery Extension | **PARTIAL** | `SessionRedeliveryService:extendLink` | `sessions.retentionExpiresAt`, `redelivery_logs` | `ExtendLinkModal.tsx` |
| **F-07** | Email Softfile Resend | **IMPLEMENTED** | `EmailService:sendSoftfiles` | `sessions`, `redelivery_logs` | `EmailRedeliveryModal.tsx` |

---

### 2.2 Deep-Dive Gap Analysis

#### Gap 1: Emergency Reprint Physical Kiosk Dispatch Missing
- **File Terdampak:**  
  - [`apps/backend/src/sessions/session-redelivery.service.ts:L121-200`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sessions/session-redelivery.service.ts#L121-L200)
  - [`apps/backend/src/gateway/kiosk.gateway.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gateway/kiosk.gateway.ts)
  - [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts)
- **Kondisi Aktual:**
  `SessionRedeliveryService.triggerReprint()` menulis baris baru ke tabel `prints` (`isSuccess: true`), tabel `redelivery_logs`, dan tabel `session_events`. Namun, service ini **tidak menginjeksi `KioskGateway`** dan tidak memancarkan event WebSocket ke kiosk target.
- **Dampak:** Operator menekan tombol "Reprint Strip" di Dashboard; UI memberi notifikasi sukses, tetapi mesin printer fisik di booth tidak mencetak apa pun.

#### Gap 2: GalleryController Mengabaikan Kolom `retentionExpiresAt`
- **File Terdampak:**  
  - [`apps/backend/src/gallery/gallery.controller.ts:L213-247`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gallery/gallery.controller.ts#L213-L247)
  - [`apps/backend/src/sessions/session-redelivery.service.ts:L73-119`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sessions/session-redelivery.service.ts#L73-L119)
- **Kondisi Aktual:**
  `SessionRedeliveryService.extendLink()` sukses memperbarui `retentionExpiresAt` dan menghasilkan URL dengan token `?support_token=...`. Namun, method `isSessionExpired()` di `GalleryController` hanya mengecek:
  ```typescript
  const ageDays = (Date.now() - session.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays >= 30) {
    return { expired: true, reason: `session_age_${Math.floor(ageDays)}_days` };
  }
  ```
  `GalleryController` sama sekali tidak memeriksa apakah `session.retentionExpiresAt > new Date()` dan tidak memeriksa keberadaan `support_token`.
- **Dampak:** Tautan perpanjangan retensi yang diberikan operator ke customer tetap diblokir oleh halaman kedaluwarsa.

#### Gap 3: Session ID Decoupling antara Pembayaran dan Pemotretan
- **File Terdampak:**  
  - [`apps/kiosk/src/screens/PaymentScreen.tsx:L86-97`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/PaymentScreen.tsx#L86-L97)
  - [`apps/kiosk/src/screens/CaptureScreen.tsx:L51-64`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L51-L64)
- **Kondisi Aktual:**
  `PaymentScreen` memanggil `createQRIS` tetapi tidak menyimpan `res.sessionId` ke React context. Di `CaptureScreen`, sistem mengevaluasi `!session.sessionId` dan membangkitkan string ID baru:
  ```typescript
  activeSessionIdRef.current = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  ```
- **Dampak:** Tabel `transactions` dan `payments` terhubung ke sesi kosong (`session_A`). File media diunggah di bawah sesi baru (`session_B`). Operator tidak dapat melacak foto customer berdasarkan Midtrans Order ID di Dashboard.

#### Gap 4: Galeri Masih Membaca Filesystem Lokal VPS
- **File Terdampak:**  
  - [`apps/backend/src/gallery/gallery.controller.ts:L84-147`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gallery/gallery.controller.ts#L84-L147)
- **Kondisi Aktual:**
  `GalleryController.findSessionAssets()` menggunakan `fs.readdirSync(this.uploadDir)` pada direktori lokal `/public/uploads`. Saat kiosk mengunggah langsung ke Cloudflare R2 via presigned URL, file fisik tidak tersimpan di VPS.
- **Dampak:** Galeri menampilkan 0 aset, dan endpoint `/zip` melempar HTTP 404.

---

## 3. Risk Assessment

| Risk ID | Deskripsi Risiko | Severity | Probabilitas | Dampak Bisnis |
| :--- | :--- | :---: | :---: | :--- |
| **RSK-01** | Operator tidak dapat mencetak ulang foto saat kertas macet (Paper Jam) | **HIGH** | **Tinggi** | Komplain pelanggan di booth tidak tertangani secara fisik; kerugian reputasi brand. |
| **RSK-02** | Customer VIP yang meminta perpanjangan link tetap tidak dapat melihat foto | **HIGH** | **Tinggi** | Dukungan pelanggan (CS) gagal menyelesaikan tiket perpanjangan softfile. |
| **RSK-03** | Sesi foto tidak terlacak dari Order ID pembayaran | **CRITICAL** | **Pasti (100%)** | Rekonsiliasi keuangan dan fitur pencarian support berdasarkan mutasi bank gagal menemukan foto. |
| **RSK-04** | Unduhan ZIP gagal total di lingkungan multi-booth | **CRITICAL** | **Pasti (100%)** | 100% customer tidak bisa mengunduh softfile ZIP dari smartphone. |

---

## 4. Acceptance Criteria

Untuk menyatakan Sprint 5B resmi ditutup (*Closed & Ready for Deployment*), sistem wajib memenuhi kriteria berikut:

- [ ] **AC-5B.1 (Reprint Dispatch):** Pemanggilan `POST /api/sessions/:id/reprint` memancarkan WebSocket event `kiosk:trigger-reprint` ke kiosk target; Kiosk Electron menerima event dan memanggil driver DNP spooler.
- [ ] **AC-5B.2 (Rate Limiting Reprint):** Sistem menolak reprint ke-4 untuk sesi yang sama dengan `HTTP 400 Bad Request`.
- [ ] **AC-5B.3 (Retention Extension):** Sesi yang berusia $>30$ hari tetapi memiliki `retentionExpiresAt > NOW()` dapat diakses secara normal (HTTP 200) tanpa diarahkan ke halaman kedaluwarsa.
- [ ] **AC-5B.4 (Session ID Preservation):** Nilai `sessionId` yang terbit pada response `POST /api/payments/qris` bertahan sampai sesi pemotretan, render composite, dan upload media.
- [ ] **AC-5B.5 (Database-Backed Gallery):** `GET /api/gallery/:sessionId` menyajikan URL foto dan live video langsung dari data tabel `photos` di database PostgreSQL.
- [ ] **AC-5B.6 (Audit Logging):** Seluruh tindakan perpanjangan link, pengiriman ulang email, dan perintah reprint tercatat secara permanen di tabel `redelivery_logs`.

---

## 5. Implementation Order

Perbaikan harus dieksekusi berdasarkan hierarki ketergantungan teknis:

1. **Langkah 1: Perbaikan Rantai Session ID (Kiosk UI)**
   - Perbaiki `PaymentScreen.tsx` agar menyimpan `res.sessionId`.
   - Hilangkan generator ID acak di `CaptureScreen.tsx`.
2. **Langkah 2: Sinkronisasi Retensi Galeri (Backend)**
   - Modifikasi `isSessionExpired()` di `GalleryController.ts` agar memeriksa `session.retentionExpiresAt`.
3. **Langkah 3: Implementasi WebSocket Dispatch Emergency Reprint (Backend & Kiosk)**
   - Injeksi `KioskGateway` ke `SessionRedeliveryService`.
   - Tambahkan method `dispatchReprint(boothId, payload)` pada `KioskGateway`.
   - Pasang listener `socket.on('kiosk:trigger-reprint')` di `SyncEngine.ts` kiosk Electron.
4. **Langkah 4: Decouple Galeri dari Filesystem VPS (Backend)**
   - Ubah `GalleryController.ts` untuk membaca aset dari `prisma.photo.findMany()`.

---

## 6. Rollback Plan

Jika patch menimbulkan regresi operasional:

1. **Kiosk Client Rollback:**
   - Kiosk Electron mengisolasi perubahan pada level bundle React (`apps/kiosk/dist`).
   - Rollback instan dilakukan dengan mengembalikan hash commit sebelumnya via git checkout pada repositori lokal kiosk:
     ```bash
     git checkout HEAD~1 -- apps/kiosk/src/screens/PaymentScreen.tsx apps/kiosk/src/screens/CaptureScreen.tsx
     npm run build:kiosk
     ```
2. **Backend NestJS Rollback:**
   - Karena **tidak ada migrasi database**, rollback backend tidak memerlukan migrasi balik (zero DB rollback).
   - Jalankan restart container backend ke image stabil sebelumnya:
     ```bash
     docker compose -f docker-compose.prod.yml restart backend
     ```
3. **Database Integrity Guard:**
   - Seluruh mutasi `redelivery_logs` bersifat *append-only*. Jika terjadi error pada action baru, record lama tidak terpengaruh.

---

## 7. Verification Checklist

Gunakan tabel checklist ini setelah perbaikan diimplementasikan:

| Test ID | Skenario Pengujian | Command / Aksi | Expected Result | Verified |
| :--- | :--- | :--- | :--- | :---: |
| **TC-5B-01** | Verifikasi Unifikasi Session ID | Jalankan 1 sesi transaksi di Kiosk sampai cetak | Record `transactions.sessionId` sama persis dengan `photos.sessionId` | [ ] |
| **TC-5B-02** | Verifikasi Perpanjangan Galeri | Set sesi ke umur 35 hari, panggil `/extend-link` 30 hari | Buka link galeri di browser: Halaman foto tampil normal (Bukan Expired) | [ ] |
| **TC-5B-03** | Verifikasi Emergency Reprint | Buka Dashboard, klik Reprint pada sesi bermasalah | Log backend memancarkan socket event, printer DNP kiosk mencetak strip | [ ] |
| **TC-5B-04** | Verifikasi Rate Limit Reprint | Eksekusi reprint 4 kali berturut-turut pada sesi yang sama | Request ke-4 ditolak dengan HTTP 400 `Emergency reprint rate limit reached` | [ ] |
| **TC-5B-05** | Verifikasi Audit History | Buka tab "Audit Trail" pada Session Detail Modal | Riwayat reprint, extend link, dan resend email muncul kronologis | [ ] |
