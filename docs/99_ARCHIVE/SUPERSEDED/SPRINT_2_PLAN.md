# SPRINT 2 IMPLEMENTATION PLAN: PAYMENT & TRANSACTION SYSTEM

> **Platform**: Pictolabs v1.0 Enterprise Edition  
> **Status**: Ready for Implementation  
> **Sprint Focus**: Automated Dynamic QRIS, State Machine, Gateway Integration, Webhook Verification, and Crash Recovery  
> **Source of Truth**: [docs/MASTER_PROJECT_STATUS.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/MASTER_PROJECT_STATUS.md) & [docs/SPRINT_1_REVIEW.md](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/SPRINT_1_REVIEW.md)  
> **Target Platform**: Windows 10/11 Kiosk (Client) & NestJS Cloud Backend (Transactions & Webhooks)

---

## 1. Objectives

1. **Eliminate Payment Mocking**: Menggantikan simulasi pembayaran berbasis tombol di Kiosk dengan integrasi gerbang pembayaran riil (*Dynamic QRIS*) menggunakan Midtrans Core API atau Xendit API.
2. **Autonomous Revenue Flow**: Memastikan bilik foto mandiri (*unattended kiosk*) mampu memverifikasi transaksi pembayaran secara otonom tanpa campur tangan operator fisik.
3. **Sub-Second Auto-Settlement Notification**: Mengalirkan konfirmasi pembayaran dari perbankan/e-wallet ke antarmuka Kiosk dalam waktu kurang dari 1,5 detik melalui Webhook dan WebSocket terenkripsi.
4. **Crash-Resilient Payment Recovery**: Menjamin integritas data transaksi dan status pembayaran tetap dapat dipulihkan (*idempotent recovery*) jika Kiosk mengalami crash, listrik padam, atau internet terputus di tengah proses transaksi.
5. **Zero Financial Leakage**: Memvalidasi integritas tanda tangan kriptografis (*HMAC-SHA512 / Token Signature*) pada setiap callback webhook untuk mencegah manipulasi data pembayaran (*webhook spoofing*).

---

## 2. Scope

### A. Dynamic QRIS Generation
* Integrasi REST API aggregator pembayaran (Midtrans Core API `payment_type: qris` atau Xendit Dynamic QRIS API).
* Pembuatan invoice/transaksi unik dengan ID referensi transaksi berbasis UUID v4 (`orderId`: `TRX_<boothId>_<timestamp>_<rand>`).
* Perhitungan nominal dinamis berdasarkan jenis produk (Photostrip 2R, Wide 4R, Postcard) dan kupon diskon (Voucher validation).
* Konversi string QRIS (*EMVCo QR Code Payload*) menjadi barcode visual beresolusi tinggi di layar Kiosk.

### B. Payment Session Management & Database Persistence
* Pembuatan record transaksi atomik pada tabel `transactions` dan `payments` di Prisma SQLite (Backend) serta sinkronisasi ke SQLite lokal Kiosk (`SyncEngine`).
* Isolasi sesi pembayaran per booth: satu booth hanya dapat memiliki satu transaksi aktif berstatus `AWAITING_PAYMENT`.
* Metadata audit transaksi: nominal, payment gateway provider, referensi settlement perbankan, waktu kadaluarsa, dan IP booth.

### C. Payment State Machine
* Implementasi mesin status formal (*Deterministic Finite State Machine*) untuk mengelola siklus hidup pembayaran:
  ```
  [IDLE]
     │
     ▼ (Select Product)
  [PRINTER_CHECK] ──(Printer Error)──► [MAINTENANCE_BLOCKED]
     │
     ▼ (Printer Ready)
  [INITIALIZED]
     │
     ▼ (Request QRIS)
  [QRIS_GENERATING] ──(API Error)──► [GENERATION_FAILED] ──► [RETRY / CANCEL]
     │
     ▼ (QR Code Rendered)
  [AWAITING_PAYMENT]
     ├── (Countdown = 0 / Cancel) ──► [EXPIRED / CANCELLED] ──► [RESET_TO_WELCOME]
     └── (Webhook Settlement)    ──► [SETTLED]
                                         │
                                         ▼
                                   [SESSION_ACTIVE] ──► [ADVANCE_TO_FRAME_DESIGN]
  ```

### D. Webhook Verification & Cryptographic Security
* Endpoint publik di NestJS: `POST /api/payments/webhook/midtrans` (atau `/xendit`).
* Verifikasi keaslian webhook:
  * **Midtrans**: `SHA512(order_id + status_code + gross_amount + server_key)`.
  * **Xendit**: Verifikasi token header `x-callback-token`.
* Pembaruan status transaksi secara ACID di database (status `SETTLEMENT`).
* Penanganan notifikasi duplikat (*Idempotency handling*): webhook berulang tidak memicu sesi ganda.

### E. WebSocket Real-Time Push Notification
* NestJS `KioskGateway` mengirimkan event `@SubscribeMessage('payment:settled')` secara langsung ke socket booth terkait berdasarkan `boothId`.
* Kiosk menangkap sinyal pembayaran masuk, membunyikan suara notifikasi sukses, dan secara otomatis memindahkan layar dari `PaymentScreen` ke `FrameDesignScreen` tanpa reload.

### F. Payment Timeout & Cancellation Handling
* Timer hitung mundur 270 detik di frontend tersinkronisasi dengan masa aktif QRIS di sisi payment gateway.
* Tombol *Batalkan Transaksi* mengizinkan pengguna membatalkan pembayaran sebelum QRIS dibayar; memicu perintah `cancel/expire` ke payment gateway dan mengembalikan Kiosk ke `WelcomeScreen`.
* Penanganan kondisi tepi (*Edge Case*): Jika uang masuk tepat saat timer habis (0 detik), sistem memprioritaskan status webhook perbankan dan tetap meloloskan pengguna ke sesi foto.

### G. Recovery After Restart / Power Loss
* Jika booth PC mati listrik saat status `AWAITING_PAYMENT`, saat booting Kiosk memeriksa status transaksi terakhir ke server backend (`GET /api/payments/status/:orderId`).
* Jika uang ternyata sudah masuk saat booth mati, Kiosk otomatis melanjutkan ke sesi foto tanpa meminta pembayaran ulang.
* Jika belum terbayar dan telah kedaluwarsa, transaksi ditandai `ABORTED` dan Kiosk langsung siap untuk pengguna baru.

---

## 3. Out of Scope

Fitur-fitur berikut secara eksplisit **TIDAK TERMASUK** dalam lingkup Sprint 2 dan ditunda ke sprint mendatang:
* **Cloudflare R2 / AWS S3 Integration**: Pengunggahan foto ke cloud object storage.
* **CDN Delivery**: Pengaturan domain kustom dan akselerasi CDN untuk pengunduhan digital.
* **Automated Media Cleanup**: Rutinitas penghapusan file foto lokal lama di hard disk.
* **Cloud Dashboard UI**: Antarmuka web analytics dan reporting transaksi di aplikasi Next.js/Vite dashboard.
* **Dynamic Frame Template CMS**: Pengunggahan dan pengelolaan file template bingkai via cloud.
* **OTA Auto-Updater**: Mekanisme auto-update aplikasi Electron Kiosk via `electron-updater`.
* **Kiosk UI Redesign**: Perubahan tata letak atau estetika visual layar Kiosk di luar integrasi modal pembayaran.

---

## 4. Acceptance Criteria

### AC-1: Dynamic QRIS Acquisition & Rendering
* [ ] **AC-1.1**: Saat pengguna menekan metode bayar QRIS di Kiosk, Kiosk mengirim permintaan pembuatan invoice ke `POST /api/payments/qris`.
* [ ] **AC-1.2**: Backend NestJS menghubungi payment gateway sandbox/production dan mengembalikan string QRIS EMVCo serta `orderId` unik dalam waktu $< 2.0$ detik.
* [ ] **AC-1.3**: Layar Kiosk menampilkan QR Code QRIS yang tajam dengan label merchant "PICTOLABS", nominal rupiah yang tepat, dan timer 270 detik yang mulai berhitung mundur.

### AC-2: Webhook Security & Idempotency
* [ ] **AC-2.1**: Endpoint webhook backend menolak (*HTTP 401 Unauthorized*) setiap payload yang tidak memiliki signature kriptografis yang sah.
* [ ] **AC-2.2**: Saat webhook valid diterima dengan status `settlement` atau `capture`, status record di tabel `payments` berubah menjadi `SUCCESS` dan tabel `sessions` berubah menjadi `PAID`.
* [ ] **AC-2.3**: Pengiriman ulang webhook berkali-kali (*retries*) untuk transaksi yang sama tidak menyebabkan mutasi ganda atau error pada database.

### AC-3: Instant Real-time Auto-Advance
* [ ] **AC-3.1**: Setelah webhook terverifikasi di backend, notifikasi WebSocket dikirimkan ke Kiosk dan diterima dalam waktu $< 1.0$ detik.
* [ ] **AC-3.2**: Kiosk menampilkan dialog animasi centang hijau *"PEMBAYARAN SUKSES!"* dan secara otomatis berpindah ke `FrameDesignScreen` dalam 1,5 detik tanpa intervensi manual.

### AC-4: Timeout, Cancellation & Hardware Blocker
* [ ] **AC-4.1**: Jika timer 270 detik habis tanpa ada pembayaran, Kiosk membatalkan invoice di backend dan kembali ke `WelcomeScreen`.
* [ ] **AC-4.2**: Jika printer terdeteksi *Offline* atau *Out of Paper* sebelum QRIS dibuat, sistem memblokir pembuatan QRIS dan menampilkan peringatan perbaikan (*Maintenance Mode*).
* [ ] **AC-4.3**: Jika pengguna menekan tombol *Batal*, status invoice di-expire dan layar kembali ke menu utama.

### AC-5: Crash & Reboot Recovery
* [ ] **AC-5.1**: Jika aplikasi Kiosk ditutup paksa (*kill process*) saat QRIS sedang tampil lalu dibuka kembali, aplikasi memeriksa transaksi aktif terakhir.
* [ ] **AC-5.2**: Jika transaksi telah berstatus lunas di server, Kiosk langsung melanjutkan sesi foto; jika kedaluwarsa, Kiosk kembali ke `WelcomeScreen` dalam status bersih.

---

## 5. Risks & Mitigation Strategies

| Risiko Teknis | Tingkat Risiko | Dampak | Strategi Mitigasi |
| :--- | :---: | :--- | :--- |
| **Koneksi Internet Kiosk Terputus Saat Bayar** | **HIGH** | Customer sudah scan dan saldo terpotong di bank, namun Kiosk tidak menerima event WebSocket karena offline. | Polling cadangan (*fallback poller*): Selain WebSocket, Kiosk melakukan query status berkala (`GET /status`) setiap 3 detik. Jika internet sempat mati dan tersambung kembali, polling langsung memverifikasi pelunasan. |
| **Webhook Spoofing / Tampering** | **HIGH** | Pihak tidak bertanggung jawab mengirim HTTP POST palsu untuk mendapatkan sesi foto gratis. | Wajib memverifikasi signature kriptografis SHA-512 menggunakan secret `SERVER_KEY` sebelum memperbarui status database. |
| **Race Condition: Bayar di Detik Terakhir (0s)** | **MEDIUM** | Notifikasi bank masuk bersamaan saat timer frontend mencapai 0 detik. | Backend menjadi sumber kebenaran tunggal (*Single Source of Truth*). Jika transaksi di bank sudah lunas, status `SETTLED` selalu mengabaikan timeout lokal frontend. |
| **Payment Gateway API Downtime** | **MEDIUM** | Midtrans/Xendit mengalami lonjakan trafik atau timeout, gagal membuat QRIS. | Tampilkan pesan error ramah pengguna *"Gagal menghubungkan ke server bank, silakan coba lagi"* dengan tombol Retry instan tanpa mengulang alur dari awal. |
| **Double Payment pada Sesi Sama** | **LOW** | Satu order ID dibayar dua kali oleh pengguna. | QRIS dinamis bersifat *single-use*. Begitu lunas, QR code langsung dinonaktifkan oleh gateway pembayaran. |

---

## 6. Dependencies

### New Packages Required
* **`midtrans-client`** (atau SDK resmi **`xendit-node`**) pada `apps/backend`:
  * Library resmi untuk pembuatan transaksi QRIS, pembatalan invoice, dan verifikasi hash notifikasi.
* **`crypto`** (Node.js built-in):
  * Digunakan untuk perhitungan signature hash SHA-512 / HMAC.

### Infrastructure & Environment Configuration
Variabel lingkungan yang wajib disediakan di `apps/backend/.env`:
```env
# Payment Gateway Provider (MIDTRANS atau XENDIT)
PAYMENT_GATEWAY_PROVIDER=MIDTRANS
PAYMENT_GATEWAY_ENV=sandbox

# Midtrans Configuration
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false

# Webhook Security
PAYMENT_WEBHOOK_SECRET=your_secure_webhook_token_here
```

---

## 7. Files Likely Affected

### Backend Modules (`apps/backend`)
* **[NEW]** `src/payments/payments.module.ts`: Modul pengelola transaksi dan webhook pembayaran.
* **[NEW]** `src/payments/payments.service.ts`: Logika integrasi Midtrans/Xendit SDK, kalkulasi voucher, dan verifikasi status.
* **[NEW]** `src/payments/payments.controller.ts`: Endpoint pembuatan QRIS (`POST /qris`), pengecekan status (`GET /status/:id`), dan penerima webhook (`POST /webhook`).
* **[MODIFY]** `src/app.module.ts`: Registrasi `PaymentsModule`.
* **[MODIFY]** `src/gateway/kiosk.gateway.ts`: Penambahan event broadcast `payment:settled` dan `payment:expired` berdasarkan `boothId`.
* **[MODIFY]** `prisma/schema.prisma`: Penyempurnaan relasi model `Transaction` dan `Payment` (penambahan field `qrisString`, `paymentGateway`, `rawWebhookPayload`).

### Kiosk Electron (`apps/kiosk/electron`)
* **[MODIFY]** `electron/preload.ts`: Penambahan API bridge `kiosk.payment.createQRIS()`, `kiosk.payment.checkStatus()`, dan listener `kiosk.payment.onSettled()`.
* **[MODIFY]** `electron/services/SyncEngine.ts`: Penyimpanan status transaksi pembayaran ke database SQLite lokal kiosk.

### Kiosk UI Layer (`apps/kiosk/src`)
* **[MODIFY]** `src/ipc/bridge.ts`: Interface TypeScript untuk objek transaksi, invoice QRIS, dan payload status pembayaran.
* **[MODIFY]** `src/screens/PaymentScreen.tsx`: 
  * Menghapus seluruh mock simulator.
  * Menampilkan QR Code dinamis berbasis string EMVCo dari API backend.
  * Menghubungkan listener WebSocket untuk auto-advance saat pembayaran sukses.
  * Penanganan timeout, tombol pembatalan, dan mode pemulihan setelah restart.

---

## 8. Testing Plan

### 1. Unit & Security Tests
* Uji verifikasi signature hash Midtrans/Xendit dengan secret key valid vs invalid (harus me-reject payload palsu).
* Uji idempotency webhook: kirimkan 5 kali payload webhook yang sama secara simultan; pastikan database hanya mencatat satu kali pelunasan tanpa duplikasi session.

### 2. Integration Tests (Sandbox Flow)
* **Skenario Normal**:
  1. Pilih produk di Kiosk $\rightarrow$ Layar pembayaran terbuka.
  2. Request QRIS $\rightarrow$ QR Code tampil $< 2$ detik.
  3. Scan menggunakan simulator Midtrans QRIS $\rightarrow$ Klik *Pay*.
  4. Webhook backend menerima callback $\rightarrow$ Kiosk otomatis berganti layar ke *Frame Design* $< 1.5$ detik.
* **Skenario Timeout**:
  1. Biarkan timer berjalan sampai habis $\rightarrow$ Transaksi dibatalkan otomatis $\rightarrow$ Kiosk kembali ke layar Welcome.
* **Skenario Batalkan Manual**:
  1. Klik tombol *Batal* $\rightarrow$ Transaksi di-cancel di backend $\rightarrow$ Kiosk kembali ke layar Welcome.

### 3. Resilience & Network Fault Injection Tests
* **Internet Drop During Display**: Putus koneksi internet saat QR code sudah tampil di layar $\rightarrow$ Bayar via handphone $\rightarrow$ Sambungkan kembali internet $\rightarrow$ Polling Kiosk harus mendeteksi pelunasan dalam 3 detik dan meloloskan sesi.
* **Power Cut / Crash Reboot**: Matikan paksa proses Electron saat status QRIS aktif $\rightarrow$ Bayar via simulator $\rightarrow$ Buka kembali aplikasi Kiosk $\rightarrow$ Kiosk harus mendeteksi sesi yang sudah lunas dan melanjutkan ke pemotretan tanpa menagih uang lagi.

---

## 9. Definition of Done (DoD)

Sprint 2 dianggap **SELESAI (DONE)** apabila memenuhi seluruh kriteria berikut:

1. **Zero Mock in Payment Flow**: Tidak ada lagi tombol bypass tiruan atau timer dummy di `PaymentScreen.tsx`. Seluruh alur pembayaran menggunakan transaksi QRIS nyata (Sandbox/Production).
2. **End-to-End Automated Settlement**: Pengguna melakukan scan QRIS, membayar via e-wallet, dan layar Kiosk secara otomatis berpindah ke tahap berikutnya tanpa menekan tombol apa pun.
3. **Cryptographically Secured Webhook**: Webhook dilindungi verifikasi hash signature dan tidak dapat di-bypass menggunakan tools seperti Postman/cURL tanpa secret key resmi.
4. **Resilient to Network Outages**: Pembayaran yang terjadi saat internet kiosk sempat terputus tetap tervalidasi begitu koneksi pulih via mekanisme fallback polling.
5. **Clean Builds & TypeScript Compliance**: Seluruh modul backend dan kiosk lulus uji `tsc --noEmit`, `nest build`, dan `vite build` dengan 0 error.
6. **Sprint 2 Review Report**: Laporan penyelesaian Sprint 2 disusun dan didokumentasikan di `docs/SPRINT_2_REVIEW.md`.
