# SPRINT 5B CLOSURE PLAN: SUPPORT & RE-DELIVERY PLATFORM
**Pictolabs Cloud Photobooth Platform**
*Target Date:* September 13, 2026  
*Document Version:* 1.0.0 (Production Candidate)  
*Status:* READY FOR EXECUTION  

---

## 1. Executive Summary

Rencana Penutupan Sprint 5B (*Sprint 5B Closure Plan*) ini mendefinisikan langkah rekayasa konkret untuk menyelesaikan **seluruh kesenjangan teknis (*gaps*)** yang teridentifikasi dalam audit arsitektur repositori Pictolabs.

Fokus penutupan terdiri dari 4 intervensi teknis terarah:
1. **Unifikasi Session ID:** Menghubungkan alur `PaymentScreen` $\rightarrow$ `CaptureScreen` agar transaksi pembayaran dan aset foto terikat pada satu ID sesi tunggal di PostgreSQL.
2. **Kiosk Dispatch Emergency Reprint:** Mengintegrasikan `SessionRedeliveryService` dengan `KioskGateway` untuk menyalurkan perintah cetak ulang fisik ke printer DNP kiosk secara real-time via WebSocket.
3. **Penyelarasan Retensi Galeri:** Menyelaraskan logika `isSessionExpired()` di `GalleryController` agar mematuhi kolom `retentionExpiresAt` dan token otorisasi perpanjangan.
4. **Decoupling Galeri dari Filesystem Lokal:** Memodernisasi `GalleryController` untuk mengambil daftar aset langsung dari database `Photo` dan membentuk URL CDN Cloudflare R2 yang valid.

Estimasi total waktu pengerjaan adalah **4.5 jam kerja teknis** tanpa membutuhkan perubahan skema database Prisma.

---

## 2. Technical Findings & Root Causes

Berdasarkan audit source code aktual, berikut adalah akar penyebab teknis yang wajib diselesaikan:

1. **Root Cause 1 (Session ID Dropped in UI State):**
   - Di `PaymentScreen.tsx:L95`, kiosk hanya mengeksekusi `setOrderId(res.orderId)` dan mengabaikan `res.sessionId`.
   - Di `CaptureScreen.tsx:L51-53`, guard `session.sessionId || ...` selalu bernilai falsy, memicu pembuatan UUID acak baru saat sesi pemotretan dimulai.
2. **Root Cause 2 (Missing WebSocket Gateway Injection in Redelivery Service):**
   - `SessionRedeliveryService` ([session-redelivery.service.ts:L8-11](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sessions/session-redelivery.service.ts#L8-L11)) hanya menginjeksi `PrismaService` dan `EmailService`.
   - Tidak ada keterhubungan ke `KioskGateway` untuk memancarkan event `server.to('booth:' + boothId).emit('kiosk:trigger-reprint', ...)`.
3. **Root Cause 3 (Hardcoded Age Check in Gallery Expiration Logic):**
   - `GalleryController.isSessionExpired()` ([gallery.controller.ts:L228](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gallery/gallery.controller.ts#L228)) menghitung selisih hari mentah dari `createdAt`. Pengecekan tidak mengevaluasi apakah `session.retentionExpiresAt > new Date()`.
4. **Root Cause 4 (Local Disk Coupling in Asset Discovery):**
   - `GalleryController.findSessionAssets()` ([gallery.controller.ts:L96](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gallery/gallery.controller.ts#L96)) memindai `/public/uploads` di server lokal. Saat kiosk mengunggah langsung ke Cloudflare R2, galeri mengembalikan 0 aset.

---

## 3. Risk Assessment & Mitigation

| Risk ID | Risiko Potensial | Dampak | Mitigasi dalam Closure Plan |
| :--- | :--- | :---: | :--- |
| **RSK-CL-01** | Kiosk sedang offline saat perintah reprint dikirim dari Dashboard | Kertas tidak keluar, operator mengira sistem error | Backend mencatat status `DISPATCHED_OFFLINE` jika socket tidak terhubung dan menyimpan antrean di tabel `QueueJob`. |
| **RSK-CL-02** | Operator melakukan spamming tombol reprint | Kertas DNP terbuang sia-sia (biaya ribbon) | Enforce limit ketat maksimal 3 kali reprint per sesi yang divalidasi di level transaksi database (`SessionRedeliveryService:L140`). |
| **RSK-CL-03** | Inkonsistensi path file foto pada galeri R2 | Gambar broken saat dibuka customer | Format key S3 diseragamkan ke format kanonikal: `sessions/${sessionId}/${fileName}`. |
| **RSK-CL-04** | Regresi build pada aplikasi Electron Kiosk | Kiosk gagal booting di lokasi venue | Perubahan pada Kiosk diisolasi pada layer React component props tanpa menyentuh driver C++ EDSDK / DNP. |

---

## 4. Acceptance Criteria

Sprint 5B dinyatakan resmi **PASSED & CLOSED** apabila seluruh kriteria berikut terpenuhi dalam uji verifikasi:

1. **AC-CL.1 (Unified Data Integrity):**
   - Record di tabel `transactions` dan tabel `photos` memiliki nilai `sessionId` yang identik.
2. **AC-CL.2 (Live Physical Reprint):**
   - Menekan tombol "Reprint Strip" di Dashboard memicu printer DNP di kiosk mencetak salinan baru dalam waktu $<3$ detik (jika kiosk online).
3. **AC-CL.3 (Reprint Protection):**
   - Upaya reprint ke-4 pada sesi yang sama ditolak oleh API dengan error `HTTP 400 Bad Request`.
4. **AC-CL.4 (Retention Extension Functional):**
   - Sesi foto berusia 35 hari yang telah diperpanjang melalui Dashboard dapat dibuka oleh customer melalui URL `https://pictolabs.id/d/:sessionId` dengan status `HTTP 200 OK`.
5. **AC-CL.5 (Cloud-Native Gallery Resolution):**
   - Halaman `/d/:sessionId` dan endpoint JSON `/api/gallery/:sessionId` menampilkan foto dari Cloudflare R2 tanpa memerlukan file di disk server VPS.
6. **AC-CL.6 (Audit Trail Completeness):**
   - Setiap tindakan operator (Reprint, Extend, Resend Email) tercatat permanen dengan email operator, alasan, dan timestamp di tabel `redelivery_logs`.

---

## 5. Implementation Order & Work Breakdown

Pengerjaan dibagi menjadi 4 paket kerja (*Work Packages*) berurutan:

```
[WP-1: Kiosk State Patch] ──> [WP-2: Gallery Retention Sync] ──> [WP-3: Emergency Reprint Dispatch] ──> [WP-4: R2 Gallery Decoupling]
      (1.0 Jam)                        (0.5 Jam)                                (2.0 Jam)                               (1.0 Jam)
```

---

### Paket Kerja 1 (WP-1): Unifikasi Session ID Kiosk
- **Target File:**  
  - [`apps/kiosk/src/screens/PaymentScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/PaymentScreen.tsx)
  - [`apps/kiosk/src/screens/CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx)
- **Instruksi Spesifik:**
  1. Pada `PaymentScreen.tsx`, di dalam fungsi `requestQRIS()`:
     ```typescript
     const res = await kiosk.payment.createQRIS({ amount: price, productName: ... });
     if (res.success && res.sessionId) {
       setOrderId(res.orderId);
       updateSession({ sessionId: res.sessionId }); // <--- PERBAIKAN UTAMA
       localStorage.setItem('pictolabs-active-order-id', res.orderId);
     }
     ```
  2. Pada `CaptureScreen.tsx`:
     Hapus logika inisialisasi ID acak baru jika `session.sessionId` sudah terdefinisi:
     ```typescript
     const activeSessionIdRef = useRef<string>(
       session.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
     );
     ```
- **Estimasi:** 1.0 jam

---

### Paket Kerja 2 (WP-2): Penyelarasan Retensi Galeri Customer
- **Target File:**  
  - [`apps/backend/src/gallery/gallery.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gallery/gallery.controller.ts)
- **Instruksi Spesifik:**
  Modifikasi fungsi `isSessionExpired()` pada baris 225-233:
  ```typescript
  if (session) {
    if (session.status === 'PURGED') {
      return { expired: true, reason: 'session_purged_by_lifecycle' };
    }
    // Periksa apakah masa perpanjangan retensi masih aktif
    if (session.retentionExpiresAt && new Date(session.retentionExpiresAt) > new Date()) {
      return { expired: false, reason: 'extended_retention_active' }; // <--- PERBAIKAN
    }
    const ageDays = (Date.now() - session.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays >= 30) {
      return { expired: true, reason: `session_age_${Math.floor(ageDays)}_days` };
    }
  }
  ```
- **Estimasi:** 0.5 jam

---

### Paket Kerja 3 (WP-3): Implementasi Real-Time WebSocket Emergency Reprint
- **Target File:**  
  - [`apps/backend/src/gateway/kiosk.gateway.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gateway/kiosk.gateway.ts)
  - [`apps/backend/src/sessions/session-redelivery.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sessions/session-redelivery.service.ts)
  - [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts)
- **Instruksi Spesifik:**
  1. Di `kiosk.gateway.ts`, tambahkan method pengiriman reprint:
     ```typescript
     dispatchEmergencyReprint(boothId: string, payload: { sessionId: string; copies: number; compositeUrl?: string }) {
       this.logger.log(`[WebSocket] Dispatching emergency reprint to booth ${boothId} for session ${payload.sessionId}`);
       this.server.to(`booth:${boothId}`).emit('kiosk:trigger-reprint', payload);
     }
     ```
  2. Di `session-redelivery.service.ts`, injeksikan `KioskGateway`:
     ```typescript
     constructor(
       private readonly prisma: PrismaService,
       private readonly emailService: EmailService,
       private readonly gateway: KioskGateway, // <--- INJEKSI
     ) {}
     ```
     Panggil `this.gateway.dispatchEmergencyReprint(session.boothId, { ... })` di dalam `triggerReprint()`.
  3. Di `SyncEngine.ts` kiosk Electron:
     Dengarkan event `kiosk:trigger-reprint` dan salurkan ke driver printer:
     ```typescript
     socket.on('kiosk:trigger-reprint', async (data) => {
       console.log('[SyncEngine] Received remote reprint command:', data);
       // Ambil composite lokal atau download dari remoteUrl, lalu cetak
       const sessionRow = stmtGetSession?.get(data.sessionId);
       if (sessionRow?.composite_path && fs.existsSync(sessionRow.composite_path)) {
         const { printImage } = require('./PrintService');
         await printImage(sessionRow.composite_path, data.copies || 1);
       }
     });
     ```
- **Estimasi:** 2.0 jam

---

### Paket Kerja 4 (WP-4): Decoupling Galeri dari Disk Lokal VPS
- **Target File:**  
  - [`apps/backend/src/gallery/gallery.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gallery/gallery.controller.ts)
- **Instruksi Spesifik:**
  1. Ubah `getGalleryData()` dan `renderGalleryPage()` untuk membaca aset dari database:
     ```typescript
     const session = await this.prisma.session.findUnique({
       where: { id: sessionId },
       include: { photos: { orderBy: { sequenceNo: 'asc' } }, booth: true },
     });
     ```
  2. Konstruksi URL media menggunakan `photo.finalUrl` atau `${r2PublicDomain}/${photo.storageKey}`.
  3. Hilangkan ketergantungan pada `this.uploadDir` lokal.
- **Estimasi:** 1.0 jam

---

## 6. Rollback Plan

Jika terjadi kendala saat eksekusi perbaikan:

1. **Rollback Kiosk Electron (Client Layer):**
   - Revert commit terakhir di lokal kiosk:
     ```bash
     git checkout HEAD~1 -- apps/kiosk/src/screens/PaymentScreen.tsx apps/kiosk/src/screens/CaptureScreen.tsx apps/kiosk/electron/services/SyncEngine.ts
     npm run build:kiosk
     ```
   - Restart aplikasi Electron kiosk.
2. **Rollback Backend NestJS (Cloud Layer):**
   - Karena perbaikan tidak melakukan migrasi skema database, rollback dilakukan murni pada level git source & container restart:
     ```bash
     git checkout HEAD~1 -- apps/backend/src/
     docker compose -f docker-compose.prod.yml restart backend
     ```
3. **Data Safety Assurance:**
   - Database PostgreSQL tidak mengalami perubahan struktur tabel. Semua data sesi lama tetap utuh dan kompatibel 100%.

---

## 7. Verification Checklist & Sign-off Matrix

Eksekusi checklist ini setelah ke-4 paket kerja selesai diterapkan untuk validasi penutupan resmi Sprint 5B:

| Task ID | Item Pengujian | Skenario Validasi | Hasil yang Diharapkan | Status |
| :--- | :--- | :--- | :--- | :---: |
| **VAL-01** | Session ID Consistency | Buat QRIS $\rightarrow$ Foto di Kiosk | Nilai `order.sessionId` == `photos[0].sessionId` di DB | [ ] |
| **VAL-02** | Physical Reprint Trigger | Klik "Reprint" di Dashboard | Mesin DNP kiosk mencetak strip foto fisik | [ ] |
| **VAL-03** | Reprint Rate Limit | Klik Reprint 4x berturut-turut | API membalas HTTP 400 pada klik ke-4 | [ ] |
| **VAL-04** | Extended Retention Access | Set DB sesi ke umur 35 hari, perpanjang via Dashboard | Akses `/d/:sessionId` menampilkan foto (Bukan Expired) | [ ] |
| **VAL-05** | Cloud-Native Gallery | Hapus folder lokal `/public/uploads` di VPS | Galeri tetap menampilkan seluruh foto dari R2 | [ ] |
| **VAL-06** | Audit Trail Verification | Periksa tabel `redelivery_logs` | Catatan tersimpan lengkap dengan operator & payload | [ ] |

---

### Sign-off Blokir Sprint 5B

- [ ] **Lead Backend Engineer:** ____________________  *(Tanggal: ___/___/2026)*
- [ ] **Kiosk / Embedded Engineer:** ____________________  *(Tanggal: ___/___/2026)*
- [ ] **Product Owner / Founder:** ____________________  *(Tanggal: ___/___/2026)*
