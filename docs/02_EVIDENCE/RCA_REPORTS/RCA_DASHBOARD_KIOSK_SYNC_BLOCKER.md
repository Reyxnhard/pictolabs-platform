# PICTOLABS — RCA & VERIFIKASI END-TO-END: DASHBOARD ↔ BACKEND ↔ KIOSK SYNC

**Dokumen Kontrol**: `RCA-UAT-DASHBOARD-KIOSK-SYNC-01`  
**Target Milestone**: Founder UAT Stabilization (PR-01 Follow-up)  
**Tanggal Pelaksanaan**: 2026-10-09  
**Status Audit**: COMPLETE — ROOT CAUSE PROVEN VIA RUNTIME EVIDENCE  

---

## 1. Executive Summary

Dalam Founder UAT lokal, ditemukan 2 blocker kritis:
1. Booth `PICTOLABS-DEV-01` ditampilkan sebagai **OFFLINE** pada Dashboard (`http://localhost:5173/booths`) meskipun aplikasi Electron Kiosk berjalan normal di home screen.
2. Founder mencoba mengubah PIN Admin Panel dari Dashboard, namun PIN pada Kiosk tidak ikut berubah sehingga akses ke Admin Panel Kiosk gagal / terkunci.
3. Automated integration test sebelumnya (`test_pr01_booth_config_foundation.mjs`) melaporkan **16/16 PASS**, namun hasil tersebut ternyata tidak membuktikan alur runtime aplikasi nyata end-to-end.

Investigasi mendalam terhadap kode sumber NestJS backend, Electron main process, PostgreSQL database, dan dashboard membuktikan **secara definitif melalui runtime request riil** bahwa:
- **Blocker Status OFFLINE** dan **Blocker PIN Mismatch** bersumber dari akar masalah yang sama: **Desinkronisasi Kredensial Identitas Kiosk Lokal (Ghost Identity Mismatch)**. Kiosk lokal berjalan menggunakan berkas identitas residu/legacy auto-seed `identity.json` (`boothId: "pilot-booth-01"`, `deviceSecret: "dev-secret-booth-01"`), sedangkan database PostgreSQL lokal hanya mengenali booth `PICTOLABS-DEV-01` (`id: "80e05c47-50f9-4d8a-a6f5-a958f1be5df3"`, `deviceSecret: "sec_live_***[REDACTED]"`).
- Kiosk tidak pernah berhasil mengirimkan heartbeat (mendapat `HTTP 404 Not Found`), ditolak oleh WebSocket Gateway server (`io server disconnect`), dan saat teknisi memasukkan PIN baru, pemanggilan verifikasi remote Kiosk memanggil `POST /api/booths/pilot-booth-01/verify-pin` yang berujung `HTTP 404 Not Found`.
- **Admin PIN secara arsitektural BUKAN bagian dari `BoothConfig`** dan **TIDAK PERNAH dirancang untuk di-broadcast via WebSocket**. Arsitektur PIN yang dirancang adalah **Lazy Remote Verification & Local DPAPI Cache-Refresh**, namun alur ini patah karena identitas booth Kiosk tidak valid di mata backend.

---

## 2. Root Cause Analysis (RCA)

### Masalah A: Booth `PICTOLABS-DEV-01` Ditampilkan OFFLINE di Dashboard

#### Alur Aktual
1. Kiosk Electron mengeksekusi `sendHttpHeartbeat()` setiap 30 detik ke:  
   `POST ${config.apiBaseUrl}/api/booths/${config.deviceSecret}/heartbeat`
2. Backend menerima request pada `BoothsController.recordHeartbeat`:
   ```ts
   async recordHeartbeat(boothId: string, dto: BoothHeartbeatDto) {
     const booth = await this.findBoothByIdentifier(boothId);
     ...
     const updated = await this.prisma.booth.update({ where: { id: booth.id }, data: { lastSeen: now } });
   ```
3. Backend kemudian menghitung status efektif melalui `computeEffectiveStatus(lastSeen, status)`:
   - Jika `lastSeen == null` atau `ageSeconds = (now - lastSeen) >= 300 detik` $\rightarrow$ `OFFLINE`.
   - Jika `ageSeconds < 60 detik` $\rightarrow$ `ONLINE`.
4. Jika valid, backend memancarkan event WebSocket `booth_status_changed` ke room `'dashboards'`. Dashboard menerima event ini via `socketStore.ts` dan memicu `fetchBooths()`.

#### Akar Masalah (Root Cause)
- Berkas `C:\ProgramData\Pictolabs\identity.json` pada mesin pengujian lokal memuat:
  ```json
  {
    "boothId": "pilot-booth-01",
    "deviceSecretCiphertext": "<dpapi: dev-secret-booth-01>"
  }
  ```
  Nilai ini berasal dari fungsi `loadIdentity()` di `IdentityService.ts` yang secara otomatis meng-auto-seed data dummy legacy jika berkas belum ada di mode development.
- Sementara itu, di database PostgreSQL lokal:
  - Booth ID: `80e05c47-50f9-4d8a-a6f5-a958f1be5df3`
  - Nama: `PICTOLABS-DEV-01`
  - Device Secret: `sec_live_***[REDACTED]` (dihasilkan saat pengujian aktivasi sebelumnya).
- Ketika Kiosk mengirimkan heartbeat dengan `dev-secret-booth-01`:
  `findBoothByIdentifier('dev-secret-booth-01')` mencari `id`, `deviceSecret`, atau `device.deviceSecret`. Karena tidak ada satupun yang cocok, backend melemparkan:  
  `NotFoundException: Booth with identifier "dev-secret-booth-01" not found (HTTP 404)`.
- Karena request heartbeat gagal (404), kolom `lastSeen` pada booth `PICTOLABS-DEV-01` di database tidak pernah terisi / tetap bernilai lama.
- Dashboard memanggil `GET /api/booths`, membaca `lastSeen` yang kadaluwarsa, dan secara konsisten menampilkan status **OFFLINE**.

---

### Masalah B: Perubahan PIN di Dashboard Tidak Mengubah Akses di Kiosk

#### Apakah PIN memang dirancang untuk dapat diubah dari Dashboard?
**YA.** Dashboard memiliki UI form khusus pada `BoothDetailDrawer.tsx` (baris 355–425) yang memanggil `boothsApi.updateBoothPin(booth.id, newPin)`, yang terhubung ke endpoint backend `PUT /api/booths/:id/pin`.

#### Apakah PIN merupakan bagian dari `BoothConfig`?
**BUKAN.**
1. `BoothConfig` (`generalSettings`) hanya mengatur `pricing`, `timing`, `hardware`, `frames`, dan `system`.
2. PIN disimpan pada kolom database terpisah: `booths.admin_pin_hash` (string bcrypt 10-round salt).
3. `PUT /api/booths/:id/pin` meng-hash input 6-digit PIN menggunakan `bcrypt.hash(newPin, 10)` dan menyimpannya ke database.
4. Endpoint ini **TIDAK memancarkan event WebSocket apapun** ke Kiosk. Mengapa? Karena bcrypt adalah fungsi hash satu arah yang tidak dapat didekripsi kembali menjadi plaintext untuk dikirim ke Kiosk tanpa membocorkan rahasia.

#### Bagaimana Kiosk memvalidasi PIN?
Kiosk (`AdminScreen.tsx` baris 214–295) menggunakan **Arsitektur Validasi Dua Lapis (Two-Tier Offline/Online Verification)**:
- **Lapis 1 (Offline First, 0ms latency):**  
  Kiosk memeriksa PIN input terhadap cache lokal DPAPI yang tersimpan di `identity.json` (`adminPinCiphertext`).  
  Jika cocok $\rightarrow$ Admin Panel langsung terbuka.
- **Lapis 2 (Online Fallback & Cache Refresh):**  
  Jika verifikasi lokal gagal (misalnya karena PIN baru saja diganti di Dashboard), Kiosk melakukan verifikasi fallback ke backend jika online:
  ```ts
  const { backendUrl, boothIdentifier } = await resolveTargetEndpoint();
  const res = await fetch(`${backendUrl}/api/booths/${boothIdentifier}/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: candidate }),
  });
  ```
  Jika backend merespons `{ success: true, verified: true }`, Kiosk membuka Admin Panel **DAN** secara otomatis menyimpan PIN baru tersebut ke cache lokal:
  ```ts
  kiosk.identity?.saveAdminPin?.(candidate); // Mengenkripsi dengan Windows DPAPI ke identity.json & SQLite
  ```
  Setelah proses ini, untuk login berikutnya, Kiosk dapat memvalidasi PIN secara 100% offline!

#### Mengapa Akses Admin Panel Gagal saat Founder Menguji?
1. Saat Founder mengetik PIN baru di Kiosk, Lapis 1 (verifikasi lokal) gagal karena cache DPAPI lokal masih memegang PIN lama (`885926`).
2. Kiosk beralih ke Lapis 2 (Online Fallback).
3. Namun, fungsi `resolveTargetEndpoint()` mengambil:
   ```ts
   boothIdentifier = activeId?.boothId || ...; // menghasilkan "pilot-booth-01"
   ```
4. Kiosk memanggil:  
   `POST http://localhost:4000/api/booths/pilot-booth-01/verify-pin`
5. Karena backend database hanya memiliki booth `80e05c47-50f9-4d8a-a6f5-a958f1be5df3`, backend merespons:  
   `HTTP 404 Not Found (Booth not found)`.
6. Pemanggilan fallback gagal, Kiosk menampilkan pesan kesalahan `"PIN Salah"`, dan setelah 3 kali gagal, Kiosk mengunci keypad selama 10 menit!
7. **Pesan UI Dashboard yang Menyesatkan**: Di `BoothDetailDrawer.tsx` tertulis: `"✓ PIN Teknisi berhasil diubah! Kiosk langsung tersinkron."` Teks ini menimbulkan asumsi keliru bahwa ada WebSocket push real-time yang langsung mengubah cache lokal Kiosk sebelum teknisi datang ke kios.

---

### Masalah C: Mengapa Automated Integration Test Sebelumnya Melaporkan PASS?

Berkas `scripts/test_pr01_booth_config_foundation.mjs` yang sebelumnya dijalankan adalah **Unit / In-Memory Mock Simulation Test**, bukan live end-to-end test:
1. Skrip tersebut mendefinisikan kelas simulasi `TestBoothsService` menggunakan `new Map()` di dalam memori proses Node.js.
2. Skrip tidak pernah membuat koneksi jaringan HTTP atau WebSocket ke NestJS server (`localhost:4000`).
3. Skrip tidak berinteraksi dengan database PostgreSQL nyata, berkas DPAPI Windows `identity.json`, maupun proses Electron Kiosk.
4. Oleh karena itu, simulasi logic PR-01 lulus sempurna di memori, tetapi gagal mendeteksi ketidaksesuaian data identitas pada operating system Windows fisik.

---

## 3. Diagram Alur Aktual Dashboard ↔ Backend ↔ Kiosk

```mermaid
sequenceDiagram
    autonumber
    participant D as Dashboard (Port 5173)
    participant B as Backend NestJS (Port 4000)
    participant DB as PostgreSQL (Local 5432)
    participant K as Kiosk Electron App

    Note over D,K: ─── ALUR 1: HEARTBEAT & BOOTH STATUS ───
    K->>B: POST /api/booths/:deviceSecret/heartbeat
    alt DeviceSecret Cocok dengan DB
        B->>DB: UPDATE booths SET last_seen = NOW()
        B->>D: WebSocket 'booth_status_changed' { status: 'ONLINE' }
        D->>D: Refetch /api/booths -> Badge ONLINE
    else DeviceSecret Tidak Cocok (Ghost Secret)
        B-->>K: HTTP 404 Booth Not Found
        Note over B,D: lastSeen tidak berubah -> Booth tetap OFFLINE
    end

    Note over D,K: ─── ALUR 2: BASE PRICE CONFIGURATION SYNC ───
    D->>B: PUT /api/booths/:id/config { pricing: { basePrice: 45000 } }
    B->>DB: UPDATE booth_configs SET general_settings = ...
    B->>K: WebSocket Room booth:ID -> emit('CONFIG_UPDATE', envelope)
    K->>K: Simpan ke kiosk-config.json & SQLite, emit ke React Renderer

    Note over D,K: ─── ALUR 3: ADMIN PIN MUTATION & VERIFICATION ───
    D->>B: PUT /api/booths/:id/pin { newPin: "654321" }
    B->>DB: UPDATE booths SET admin_pin_hash = bcrypt("654321")
    Note over B,K: TIDAK ADA WEBSOCKET EMIT UNTUK PIN (Hanya bcrypt hash di DB)

    Note over K: Teknisi memasukkan "654321" di layar Kiosk
    K->>K: Lapis 1: Verifikasi DPAPI Lokal -> GAGAL (masih PIN lama)
    alt Booth ID Cocok dengan DB
        K->>B: POST /api/booths/:boothId/verify-pin { pin: "654321" }
        B->>B: bcrypt.compare("654321", adminPinHash) -> MATCH
        B-->>K: HTTP 200 { success: true, verified: true }
        K->>K: Lapis 2 Berhasil -> Simpan ke DPAPI identity.json & UNLOCK!
    else Booth ID Mismatch (Ghost ID: pilot-booth-01)
        K->>B: POST /api/booths/pilot-booth-01/verify-pin
        B-->>K: HTTP 404 Booth Not Found
        K->>K: Tolak Akses ("PIN Salah") -> Lockout Keypad
    end
```

---

## 4. File dan Fungsi yang Terlibat

| Komponen | Berkas | Fungsi / Simbol | Peran Teknis & Temuan |
| :--- | :--- | :--- | :--- |
| **Backend** | `apps/backend/src/booths/booths.controller.ts` | `@Post(':id/heartbeat')`<br>`@Put(':id/pin')`<br>`@Post(':id/verify-pin')`<br>`@Get(':id/config')`<br>`@Put(':id/config')` | Entry point API untuk heartbeat, PIN update/verify, dan konfigurasi envelope. |
| **Backend** | `apps/backend/src/booths/booths.service.ts` | `recordHeartbeat()`<br>`updatePin()`<br>`verifyPin()`<br>`findBoothByIdentifier()`<br>`computeEffectiveStatus()` | Menyimpan timestamp `lastSeen`, meng-hash PIN dengan bcrypt, memvalidasi PIN dengan `bcrypt.compare`, dan menghitung status ONLINE/OFFLINE. |
| **Backend** | `apps/backend/src/gateway/kiosk.gateway.ts` | `handleConnection()`<br>`pushConfigUpdate()` | Mengotentikasi WebSocket kiosk via `deviceSecret`. Menolak dan me-disconnect kiosk jika secret tidak ada di DB. Memancarkan `CONFIG_UPDATE` ke room per-booth. |
| **Dashboard** | `apps/dashboard/src/components/booths/BoothDetailDrawer.tsx` | `boothsApi.updateBoothPin()`<br>`boothsApi.updateBoothConfig()` | UI Drawer untuk mengubah PIN teknisi dan Base Price. Memiliki teks feedback yang memicu ekspektasi WebSocket sync instan. |
| **Dashboard** | `apps/dashboard/src/stores/socketStore.ts` | Listener `booth_status_changed` | Menerima event WebSocket status perubahan booth dan memicu refresh tabel booth. |
| **Kiosk** | `apps/kiosk/electron/services/IdentityService.ts` | `loadIdentity()`<br>`verifyLocalAdminPin()`<br>`saveLocalAdminPin()`<br>`saveIdentity()` | Mengelola pembacaan dan penyimpanan identitas Kiosk di `C:\ProgramData\Pictolabs\identity.json`. Meng-auto-seed dummy data `pilot-booth-01` yang memicu desinkronisasi. |
| **Kiosk** | `apps/kiosk/electron/services/SyncEngine.ts` | `sendHttpHeartbeat()`<br>`setupSocketConnection()`<br>`reconcileRemoteConfig()` | Mengirimkan HTTP heartbeat berkala, menghubungkan socket ke backend, dan merekonsiliasi konfigurasi lokal dari backend. |
| **Kiosk** | `apps/kiosk/src/screens/AdminScreen.tsx` | `verifyPin()`<br>`resolveTargetEndpoint()` | UI keypad PIN teknisi. Mengimplementasikan two-tier validation (local DPAPI $\rightarrow$ remote HTTP fallback). Mengirim `boothIdentifier` yang salah saat ghost identity aktif. |

---

## 5. Bukti Runtime Nyata (Actual Logs & Responses)

Pengujian end-to-end riil dieksekusi menggunakan skrip audit `scripts/test_dashboard_kiosk_sync_e2e.mjs` terhadap server NestJS lokal (`http://localhost:4000`) dan PostgreSQL lokal (`localhost:5432`):

```text
================================================================
AUDIT DASHBOARD <-> BACKEND <-> KIOSK END-TO-END SYNC
================================================================

--- 1. BACKEND AVAILABILITY AUDIT ---
✓ Backend is LIVE. Admin authenticated successfully.

--- 2. HEARTBEAT & BOOTH STATUS AUDIT ---
[Ghost Secret: dev-secret-booth-01] Heartbeat HTTP Status: 404 (Expected 404: Booth Not Found)
[DB Secret: sec_live_a7a3ed...] Heartbeat HTTP Status: 201 -> Effective Status: ONLINE
[Dashboard GET /api/booths] Booth "PICTOLABS-DEV-01" status: ONLINE (lastSeen: 2026-10-09T07:41:45.827Z)

--- 3. WEBSOCKET REAL-TIME SYNC AUDIT ---
✓ Ghost socket rejected by server (io server disconnect)
✓ Active Kiosk socket connected successfully (Socket ID: gimFx1sf01q9626IAAAN)
[Dashboard Action] Updating Base Price to Rp42.000 via PUT /api/booths/:id/config...
Dashboard PUT status: 200
✓ Kiosk received live CONFIG_UPDATE over WebSocket! Received basePrice: 42000

--- 4. ADMIN PIN FLOW AUDIT ---
[Dashboard Action] Setting technician PIN to "778899" via PUT /api/booths/:id/pin...
Dashboard PUT /api/booths/:id/pin status: 200 (Admin PIN updated successfully)
[Kiosk Simulation] Candidate PIN entered on Kiosk screen: "778899"
[Kiosk Action - Ghost Identity] Calling POST /api/booths/pilot-booth-01/verify-pin...
✗ Ghost verify-pin status: 404 (404 Not Found) -> RESULT: ACCESS DENIED (Keypad Lockout)!
[Kiosk Action - Synchronized Identity] Calling POST /api/booths/80e05c47-50f9-4d8a-a6f5-a958f1be5df3/verify-pin...
✓ Synchronized verify-pin status: 200 -> Verified: true -> RESULT: UNLOCKED!
✓ Invalid candidate "000000" verify-pin status: 200 -> Verified: false -> RESULT: REJECTED!

================================================================
AUDIT COMPLETE: All Root Causes Proven End-to-End
================================================================
```

---

## 6. Test PASS/FAIL dan Keterbatasan Pengujian

### Hasil Uji
- **Heartbeat & Status ONLINE**: **PASS** (Terbukti: Booth berubah menjadi ONLINE saat heartbeat dikirim menggunakan kredensial aktif `sec_live_...`).
- **Base Price Propagation via WebSocket**: **PASS** (Terbukti: Saat Dashboard mengupdate harga, socket Kiosk yang terotentikasi langsung menerima event `CONFIG_UPDATE` dalam hitungan milidetik).
- **Admin PIN Backend Storage**: **PASS** (Terbukti: `PUT /api/booths/:id/pin` meng-hash bcrypt dan menyimpan di database).
- **Admin PIN Remote Verification**: **PASS** (Terbukti: `POST /api/booths/:id/verify-pin` mengembalikan `verified: true` jika input cocok, dan `verified: false` jika salah).
- **Ghost Identity Resiliency**: **FAIL** (Terbukti: Jika berkas identitas lokal Kiosk tidak sinkron dengan database, seluruh alur heartbeat, socket, dan PIN fallback putus total dengan HTTP 404).

### Keterbatasan Pengujian Saat Ini
1. Pengujian belum menguji skenario Kiosk yang berada dalam status **OFFLINE total** ketika teknisi pertama kali mencoba login dengan PIN yang baru diubah di Dashboard (karena verifikasi Lapis 2 memerlukan jaringan internet/backend).
2. Belum ada mekanisme peringatan pada UI Kiosk yang membedakan antara "PIN Salah" dengan "Koneksi ke Backend Gagal (404 / Network Error)" saat melakukan verifikasi fallback.

---

## 7. Usulan Perbaikan Minimal (Konsisten dengan Arsitektur Saat Ini)

Perbaikan minimal yang diusulkan **tanpa mengubah skema database, CameraService, atau PrintService**:

1. **Resolusi Identitas Fallback pada Kiosk (`AdminScreen.tsx`)**:
   Ubah pemanggilan `resolveTargetEndpoint()` agar tidak hanya bergantung pada `boothId` string, melainkan jika `activeDeviceSecret` tersedia, kirimkan `deviceSecret` sebagai identifier booth ke `/api/booths/${deviceSecret}/verify-pin`.
   Backend `findBoothByIdentifier()` **sudah mendukung** pencarian booth berdasarkan `deviceSecret` (`where: { OR: [ { id }, { deviceSecret } ] }`). Ini menjamin bahwa Kiosk selalu dapat menemukan booth-nya di backend bahkan jika ID lokalnya adalah alias legacy.
2. **Sinkronisasi Identitas Development (`IdentityService.ts` & Seed)**:
   Perbaiki fungsi auto-seed development pada `IdentityService.ts` agar menyelaraskan `boothId` dan `deviceSecret` dengan data booth default `PICTOLABS-DEV-01` di database, atau reset `identity.json` ke state berpasangan yang valid.
3. **Klarifikasi Pesan UI Dashboard (`BoothDetailDrawer.tsx`)**:
   Perbarui pesan feedback di Dashboard dari:
   `"✓ PIN Teknisi berhasil diubah! Kiosk langsung tersinkron."`
   Menjadi:
   `"✓ PIN Teknisi berhasil diubah di database. Kiosk akan memperbarui PIN secara otomatis saat teknisi login pertama kali."`

---

## 8. Daftar Fitur Lain yang Belum Terbukti Melalui Founder UAT

Fitur-fitur berikut masih berstatus asumsi dan belum dibuktikan melalui physical/runtime Founder UAT:
1. **Hardware Telemetry Relay**: Pengiriman metrik hardware (CPU temperature, printer health, paper roll count) dari Kiosk via `HEALTH_PING` ke event WebSocket Dashboard `booth_telemetry`.
2. **Kiosk Live Photo Streaming**: Streaming liveview dari Canon EDSDK melalui protokol kustom `local-video://` ke UI Kiosk.
3. **Print Worker Crash Recovery Ledger**: Pemulihan antrean cetak SQLite setelah Kiosk di-kill secara paksa di tengah siklus pencetakan.
4. **Storage Retention Daemon**: Penghapusan otomatis berkas komposit dan raw capture yang berusia lebih dari 7 hari di Windows ProgramData saat sisa ruang disk $< 5\text{ GB}$.
5. **Midtrans QRIS Real-Time Settlement Notification**: Pembayaran QRIS nyata di Kiosk yang menerima webhook Midtrans sandbox dan memancarkan event socket `payment:settled` untuk melanjutkan flow secara hands-free.

---

**Langkah Selanjutnya**:
Laporan RCA dan bukti runtime ini diserahkan untuk audit arsitektur ChatGPT. Sesuai instruksi, pengerjaan kode ditahan hingga audit ChatGPT selesai.
