# MIDTRANS QRIS SANDBOX INTEGRATION & SAFETY FIX REPORT
**Document ID:** `DOC-PAYMENT-QRIS-FIX-REPORT-001`  
**Execution Date:** 2026-10-10  
**Status:** LIVE GATEWAY EXECUTED / SAFE REJECTION VERIFIED (Midtrans 402 Channel Inactive) / MOCK SUITE PASS (50/50)  
**Workstream:** Payment Workstream (`docs/01_WORKSTREAMS/PAYMENT_WORKSTREAM.md`)  
**Reference Forensic Audit:** Read-Only Diagnostic Audit & ChatGPT RCA Review  

---

## 1. Executive Summary

Laporan ini mendokumentasikan perbaikan jalur integrasi **Midtrans Dynamic QRIS Sandbox** pada platform Pictolabs Photobooth. Perbaikan ini menyelesaikan akar masalah mengapa QRIS yang ditampilkan di Kiosk ditolak oleh mobile banking / e-wallet dengan pesan *"QR invalid"* dan memastikan sistem tidak lagi menghasilkan string QR tiruan yang rusak saat kredensial gateway tidak tersedia.

### Summary Status Table
| Komponen / Verifikasi | Status | Catatan Otoritatif |
|:---|:---:|:---|
| **Eliminasi Fallback Dummy QR** | **CLOSED (PASS)** | `generateFallbackQRIS()` dihapus dari alur transaksi pelanggan; silent fallback dihentikan total. |
| **Proteksi Kredensial Placeholder** | **CLOSED (PASS)** | Server key placeholder (`SB-Mid-server-test-key`) secara eksplisit memicu HTTP 503 `ServiceUnavailableException`. |
| **Kontrak API Midtrans Sandbox `/v2/charge`** | **CLOSED (PASS)** | Parsing resmi `qr_string`, `transaction_id`, dan `actions[0].url` (QR image URL) diimplementasikan dan diuji. |
| **Penanganan Error Gateway (401, 400, Timeout)** | **CLOSED (PASS)** | Menolak request gateway yang gagal dengan HTTP 502 `BadGatewayException` tanpa membungkusnya sebagai QR valid. |
| **Integritas Nominal & Anti-Tampering** | **PRESERVED (PASS)** | Nominal tagihan tetap mematuhi `pricing.basePrice` otoritatif backend; spoofing nominal ditolak HTTP 400. |
| **Validasi Kriptografi Webhook SHA-512** | **CLOSED (PASS)** | Webhook gateway wajib menyertakan signature SHA-512 yang valid; unauthorized callbacks ditolak HTTP 401. |
| **Pembatasan Keamanan Endpoint Simulasi** | **CLOSED (PASS)** | `simulateSettlement()` diblokir untuk transaksi gateway riil dan mode production (HTTP 403 Forbidden). |
| **Error Handling & Rendering Kiosk** | **CLOSED (PASS)** | Electron SyncEngine meneruskan error ke UI; Kiosk menampilkan modal error resmi & tombol Offline Bypass, bukan merender QR palsu. |
| **Verifikasi Matematis EMVCo TLV & CRC-16** | **CLOSED (PASS)** | Parser EMVCo TLV & kalkulasi CRC-16 CCITT (0x1021) diuji secara matematis; parser menolak payload cacat. |
| **Pengujian Langsung Gateway Midtrans (Live Outbound)** | **EXECUTED / SAFE REJECTION (PASS)** | Backend langsung menghubungi `https://api.sandbox.midtrans.com/v2/charge`. Midtrans merespon code 402 (*"Payment channel is not activated"*); backend menolak secara aman dengan HTTP 502 tanpa membuat QR tiruan. |

---

## 2. Root Cause yang Ditangani

Berdasarkan audit forensik read-only dan review ChatGPT, akar masalah QRIS invalid terdiri dari 4 lapisan:

1. **Placeholder Server Key & Mock Branching:**
   - Variabel lingkungan `MIDTRANS_SERVER_KEY` pada backend lokal diisi placeholder `'SB-Mid-server-test-key'`.
   - Logika percabangan `isMockKey` mengevaluasi key tersebut sebagai `true`, sehingga backend **sama sekali tidak pernah memanggil API Midtrans Sandbox `/v2/charge`**.
2. **Malformed Fallback EMVCo TLV Generator:**
   - Karena diarahkan ke mock, backend menjalankan `generateFallbackQRIS(orderId, amount)`.
   - Generator ini memiliki **panjang Tag 26 yang salah (hardcoded `2659` padahal isinya 80 karakter)**, merusak seluruh bitstream TLV dari karakter ke-63 ke atas.
   - String tersebut berakhir abruptly pada tag `6304` tanpa 4 karakter checksum **CRC-16 CCITT**.
   - Ketika discan oleh aplikasi mobile banking (BCA, Mandiri, BRImo, DANA), pustaka scanner lokal memvalidasi TLV dan CRC gagal seketika sebelum menghubungi switch perbankan, memunculkan popup *"QR invalid"*.
3. **Silent Failure & Masking Error:**
   - Jika kredensial gateway salah atau panggilan Midtrans gagal, kode lama secara diam-diam menangkap error dan mengembalikan dummy string buatan sendiri dengan HTTP 200 `{ success: true, qrisString }`.
   - Akibatnya, tester mengira backend berhasil membuat QRIS padahal sistem menyamarkan kegagalan gateway.
4. **Kebutaan Skrip Tes Lama:**
   - Tes sebelumnya hanya memverifikasi string panjang (`qrisString.length > 50`) atau keberadaan elemen tag `<img>` di DOM, tanpa pernah memeriksa struktur EMVCo TLV, integritas CRC, atau apakah Midtrans benar-benar dihubungi.

---

## 3. Berkas yang Diubah dan Rincian Perubahan

### 1. `apps/backend/src/payments/payments.service.ts`
- **Imports:** Menambahkan `ServiceUnavailableException`, `BadGatewayException`, dan `ForbiddenException`.
- **Method `isConfiguredKey()`:** Menambahkan validator untuk memeriksa apakah `serverKey` ada dan bukan placeholder (`SB-Mid-server-test-key`, `test-key`, dsb.).
- **Method `generateFallbackQRIS()` Dihapus:** Dihapus total dari generator transaksi pelanggan untuk menjamin tidak ada lagi QR palsu yang dibuat untuk pelanggan.
- **Method `createQRIS()`:**
  - Menolak pembuatan QR dengan `ServiceUnavailableException` (HTTP 503) jika `!isConfiguredKey()`.
  - Melakukan panggilan HTTP `fetch` resmi ke `${this.apiUrl}/charge` dengan basic auth `base64(serverKey + ':')`, timeout `AbortController` 10 detik, dan payload standar Midtrans (`payment_type: 'qris'`, `qris: { acquirer: 'gopay' }`, `custom_field1`, `custom_field2`).
  - Menangani respon Midtrans: melempar `BadGatewayException` (HTTP 502) bila status Midtrans bukan 201/200 atau request ditolak (HTTP 401/400/500/timeout).
  - Mengekstrak `qr_string`, `transaction_id` (sebagai `paymentRef`), dan `actions[0].url` (sebagai `qrisUrl`).
  - Menyimpan record `Transaction` dan `Payment` di database.
- **Method `handleWebhook()`:**
  - Jika server key dikonfigurasi, mewajibkan keberadaan `signature_key` dan memvalidasi `SHA512(order_id + status_code + gross_amount + serverKey)`. Jika tidak cocok atau tidak ada signature, melempar `UnauthorizedException` (HTTP 401).
- **Method `simulateSettlement()`:**
  - Ditambahkan pengaman: jika `isProduction` atau `NODE_ENV === 'production'`, melempar `ForbiddenException` (HTTP 403).
  - Ditambahkan pengaman: jika transaksi memiliki `paymentRef` asli dari gateway Midtrans, simulasi internal ditolak dengan `ForbiddenException` (wajib menggunakan Midtrans QRIS Simulator resmi atau callback webhook).

### 2. `apps/backend/src/payments/payments.e2e.ts`
- Diperbarui menjadi suite pengujian komprehensif yang menguji 8 tonggak:
  1. Proteksi kredensial placeholder (HTTP 503).
  2. Proteksi anti-tampering nominal otoritatif (HTTP 400).
  3. Penanganan error gateway Midtrans (HTTP 401 unauthorized, HTTP 400 validation, timeout) menjadi HTTP 502.
  4. Pemrosesan kontrak sukses Midtrans 201 (`qr_string`, `paymentRef`, `qrisUrl`, persistensi DB).
  5. Verifikasi matematis EMVCo TLV bitstream & CRC-16 CCITT (0x1021).
  6. Validasi signature kriptografis webhook SHA-512 & idempotensi.
  7. Batasan keamanan endpoint simulasi.
  8. Pembatalan, polling, dan siklus transaksi.

### 3. `apps/kiosk/electron/services/SyncEngine.ts`
- Handler IPC `payment:create-qris` diperbaiki agar memeriksa `res.ok`. Jika backend mengembalikan status non-200 (misalnya 400, 502, atau 503), SyncEngine meneruskan `{ success: false, error: data.message || data.error }` ke renderer, bukan meneruskan objek mentah tanpa penanganan.

### 4. `apps/kiosk/src/screens/PaymentScreen.tsx`
- Menambahkan validasi awalan standar EMVCo (`000201`) sebelum memanggil `QRCode.toDataURL()`.
- Menangkap pesan error dari gateway dan menampilkannya pada UI error state ("GAGAL MEMBUAT PEMBAYARAN") lengkap dengan opsi tombol "⚡ Bypass Pembayaran (Lanjut Offline)" dan "Coba Lagi".

### 5. `scripts/test_midtrans_qris_sandbox_regression.mjs`
- Skrip verifikasi mandiri independen yang membuktikan 26 skenario regresi dan safety guards secara end-to-end terhadap backend lokal yang sedang aktif.

---

## 4. Hasil Aktual Pengujian, Kompilasi, dan Build

### A. E2E Payment Integration Suite (`apps/backend/src/payments/payments.e2e.ts`)
```text
Command: npx ts-node src/payments/payments.e2e.ts (in apps/backend)
Status: EXIT CODE 0

[MILESTONE 1: Placeholder Credentials Protection]
  ✓ [PASS] AC-1.1: Placeholder server key throws ServiceUnavailableException (HTTP 503)
  ✓ [PASS] AC-1.2: Error message clearly indicates gateway credentials are not configured
  ✓ [PASS] AC-1.3: Refuses to generate dummy/fake QRIS when serverKey is placeholder

[MILESTONE 2: Authoritative Amount & Anti-Tampering]
  ✓ [PASS] AC-2.1: Tampered amount throws BadRequestException (HTTP 400)
  ✓ [PASS] AC-2.2: Explains payment amount mismatch
  ✓ [PASS] AC-2.3: Anti-tampering check validates against server authoritative price

[MILESTONE 3: Gateway Error, Timeout, & Rejection Handling]
  ✓ [PASS] AC-3.1: Midtrans HTTP 401 triggers BadGatewayException (HTTP 502)
  ✓ [PASS] AC-3.2: Error message relays gateway rejection
  ✓ [PASS] AC-3.3: Midtrans 401 does NOT fall back to fake QR
  ✓ [PASS] AC-3.4: Gateway timeout triggers BadGatewayException (HTTP 502)
  ✓ [PASS] AC-3.5: Error message mentions connection timeout
  ✓ [PASS] AC-3.6: Gateway timeout does NOT fall back to fake QR

[MILESTONE 4: Authentic Midtrans 201 Contract Processing]
  ✓ [PASS] AC-4.1: createQRIS returns success: true on HTTP 201
  ✓ [PASS] AC-4.2: orderId is properly formatted (TRX_CC90E3_...)
  ✓ [PASS] AC-4.3: qrisString matches Midtrans payload exactly
  ✓ [PASS] AC-4.4: qrisUrl matches Midtrans actions url
  ✓ [PASS] AC-4.5: Outbound payment_type is qris
  ✓ [PASS] AC-4.6: Outbound qris acquirer is gopay
  ✓ [PASS] AC-4.7: Outbound request includes Basic Authorization header
  ✓ [PASS] AC-4.8: Transaction persisted in PostgreSQL
  ✓ [PASS] AC-4.9: Transaction status is PENDING
  ✓ [PASS] AC-4.10: Payment stores Midtrans transaction_id as paymentRef
  ✓ [PASS] AC-4.11: Payment stores Midtrans qrisUrl

[MILESTONE 5: Rigorous EMVCo TLV & CRC-16 Verification]
  ✓ [PASS] AC-5.1: EMVCo TLV stream parses without byte errors
  ✓ [PASS] AC-5.2: Tag 00 Payload Format Indicator is 01
  ✓ [PASS] AC-5.3: Tag 01 Point of Initiation Method is 12 (Dynamic)
  ✓ [PASS] AC-5.4: Tag 53 Transaction Currency is 360 (IDR)
  ✓ [PASS] AC-5.5: Tag 58 Country Code is ID
  ✓ [PASS] AC-5.6: Tag 63 CRC-16 length is exactly 4 characters
  ✓ [PASS] AC-5.7: CRC-16 CCITT (0x1021) mathematically matches checksum
  ✓ [PASS] AC-5.8: TLV Parser correctly detects old fallback string as corrupt
  ✓ [PASS] AC-5.9: CRC-16 check correctly rejects old fallback string (missing CRC)

[MILESTONE 6: Webhook Signature & State Transitions]
  ✓ [PASS] AC-6.1: Missing signature key throws UnauthorizedException (HTTP 401)
  ✓ [PASS] AC-6.2: Webhook rejects callback without signature
  ✓ [PASS] AC-6.3: Spoofed signature key throws UnauthorizedException (HTTP 401)
  ✓ [PASS] AC-6.4: Webhook rejects callback with invalid signature
  ✓ [PASS] AC-6.5: Valid webhook processed with status: ok
  ✓ [PASS] AC-6.6: Transaction transitioned to SETTLED
  ✓ [PASS] AC-6.7: Payment transitioned to SUCCESS
  ✓ [PASS] AC-6.8: Session transitioned to PAID
  ✓ [PASS] AC-6.9: WebSocket notifyPaymentSettled triggered
  ✓ [PASS] AC-6.10: WebSocket payload contains exact orderId
  ✓ [PASS] AC-6.11: Duplicate webhook handled idempotently

[MILESTONE 7: Simulation Endpoint Security Bounds]
  ✓ [PASS] AC-7.1: Simulation rejected on settled/real-gateway transaction
  ✓ [PASS] AC-7.2: Real gateway transaction cannot be settled via backdoor simulation
  ✓ [PASS] AC-7.3: Simulation in production throws ForbiddenException (HTTP 403)
  ✓ [PASS] AC-7.4: Internal simulation is strictly disabled when isProduction is true

[MILESTONE 8: Timeout & Cancellation]
  ✓ [PASS] AC-8.1: cancelTransaction returns success: true
  ✓ [PASS] AC-8.2: Transaction status transitioned to CANCELLED
  ✓ [PASS] AC-8.3: checkStatus confirms status is CANCELLED

TEST RESULTS: 50 PASSED, 0 FAILED (100%)
```

### B. Standalone Regression Verification (`scripts/test_midtrans_qris_sandbox_regression.mjs`)
```text
Command: node scripts/test_midtrans_qris_sandbox_regression.mjs
Status: EXIT CODE 0
Total Checks: 26 PASSED, 0 FAILED (100%)
```

### C. Existing Foundation Regression Suites
1. **`node scripts/test_pr01_booth_config_foundation.mjs`:**
   - Result: **22 / 22 TESTS PASSED (100%)**.
2. **`node scripts/verify_payment_transaction_lifecycle.mjs`:**
   - Result: **5 / 5 TESTS PASSED (100%)** (Zero loop, zero blink, timer stable).

### D. TypeScript Typecheck & Production Build
1. **Backend Typecheck (`npm run typecheck` in `apps/backend`):**
   - Result: **PASS (Exit code 0)**.
2. **Backend Production Build (`nest build` in `apps/backend`):**
   - Result: **PASS (Exit code 0)**.
3. **Kiosk Production Build (`tsc && vite build` in `apps/kiosk`):**
   - Result: **PASS (Exit code 0)** (`built in 5.22s`, bundle output verified).

---

## 5. Status Pengujian Gateway dan Simulator

### Apakah Gateway Sandbox Benar-Benar Dihubungi?
- **STATUS: EXECUTED (Live Outbound Request Verified).**
- **Bukti Fakta Eksekusi:**
  1. Backend lokal berhasil di-reload dengan kredensial yang dimasukkan Founder pada `apps/backend/.env`.
  2. Permintaan transaksi nyata dikirimkan ke endpoint resmi: `POST https://api.sandbox.midtrans.com/v2/charge`.
  3. Header otorisasi `Basic base64(serverKey + ':')` dikirimkan secara langsung ke server Midtrans.
  4. Server Midtrans Sandbox merespon dengan:
     ```json
     {
       "status_code": "402",
       "status_message": "Payment channel is not activated."
     }
     ```
  5. **Verifikasi Fail-Safe:** Backend menangkap kode 402 tersebut dan melempar `BadGatewayException` (HTTP 502) dengan pesan yang disanitasi:  
     `"Gerbang pembayaran Midtrans menolak pembuatan QRIS (402): Payment channel is not activated."`
  6. **Zero Dummy QR:** Backend **sama sekali tidak menghasilkan string QR palsu**.
  7. **Zero DB Pollution:** Rollback otomatis berjalan sempurna; transaksi gagal tersebut **tidak meninggalkan record dangling PENDING** di PostgreSQL.

### Analisis Akar Masalah Respon 402 ("Payment channel is not activated")
Dalam ekosistem Midtrans, respon 402 ini terjadi karena dua kemungkinan teknis:
1. **Format Prefix Key (Production vs Sandbox):**
   - Kredensial yang tersimpan di `.env` saat ini memiliki prefix `Mid-server-` dan `Mid-client-` (format Production Key Midtrans).
   - Pada Midtrans, Sandbox Key memiliki prefix `SB-Mid-server-` dan `SB-Mid-client-`.
   - Ketika Production Key dipanggil ke endpoint Sandbox (`https://api.sandbox.midtrans.com/v2/charge` karena `MIDTRANS_IS_PRODUCTION=false`), Midtrans Sandbox tidak menemukan kanal pembayaran aktif untuk akun tersebut dan mengembalikan status 402.
2. **Aktivasi Metode Pembayaran QRIS di Midtrans MAP:**
   - Baik di Sandbox maupun Production, metode pembayaran **QRIS** (atau GoPay/QRIS) harus diaktifkan secara eksplisit pada Midtrans Merchant Administration Portal (MAP):
     - Login ke `https://dashboard.sandbox.midtrans.com` (atau `https://dashboard.midtrans.com`).
     - Buka menu **Settings > Payment Methods** (atau *Snap Preferences > Payment Channels*).
     - Pastikan toggle **QRIS** dalam status **Aktif**.

### Status Verifikasi Simulator Resmi Midtrans
- **Simulator Target:** `https://simulator.sandbox.midtrans.com/openapi/qris/index`
- **Status Eksekusi Simulator:** **PENDING CHANNEL ACTIVATION**.
- Segera setelah metode pembayaran QRIS aktif di MAP atau Sandbox Key (`SB-Mid-...`) dimasukkan:
  1. Panggilan `POST /api/payments/qris` akan menghasilkan HTTP 201 Created dengan URL gambar QR Midtrans (`actions[0].url`).
  2. Buka simulator resmi Midtrans di `https://simulator.sandbox.midtrans.com/openapi/qris/index`.
  3. Masukkan URL gambar QR atau scan QR dari layar Kiosk, lalu klik tombol **Pay**.
  4. Status transaksi akan berpindah ke `SETTLED` melalui webhook / polling fallback 3 detik.
> **PERINGATAN RESMI:** QR code dari Midtrans Sandbox **tidak boleh** dan **tidak bisa** dibayar menggunakan aplikasi mobile banking riil (BCA, Mandiri, BRImo, dsb.) karena Sandbox menggunakan National Merchant ID testing yang tidak terdaftar di switch Bank Indonesia production.

---

## 6. Sisa Risiko dan Kesiapan Founder UAT

### Sisa Risiko
1. **Aktivasi Kanal QRIS di Midtrans MAP:** Founder perlu mengaktifkan kanal QRIS di dashboard Midtrans atau memastikan menggunakan Sandbox Key (`SB-Mid-server-...`) jika menguji di lingkungan Sandbox.
2. **Webhook Local Tunnel (ngrok / Cloudflare Tunnel):** Callback webhook cloud Midtrans ke laptop lokal membutuhkan tunnel publik jika ingin menguji instant push; namun status polling fallback 3 detik di `PaymentScreen.tsx` siap menangani update status secara otomatis tanpa tunnel.
3. **Fail-Safe Offline Mode:** Jika gateway Midtrans belum aktif di lapangan, operasional booth tetap terlindungi penuh melalui tombol **"⚡ Bypass Pembayaran (Lanjut Offline)"** dengan PIN Admin.

### Rekomendasi Gate Berikutnya
- **Gate Status:** **LIVE GATEWAY SAFE REJECTION VERIFIED (AUDIT READY)**.
- **Langkah Berikut:**
  1. Founder memeriksa dashboard Midtrans: memastikan toggle **QRIS** aktif pada *Settings > Payment Methods* dan memastikan menggunakan key Sandbox (`SB-Mid-server-...`).
  2. Jalankan pembuatan QRIS ulang di Kiosk dan lakukan simulasi pembayaran melalui **Midtrans QRIS Simulator**.
  3. Konfirmasi transisi otomatis Kiosk ke `FrameSelectScreen`.
  4. Menyerahkan laporan ini untuk audit ChatGPT.
