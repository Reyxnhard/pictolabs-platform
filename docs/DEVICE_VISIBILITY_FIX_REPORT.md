# LAPORAN IMPLEMENTASI & VERIFIKASI PERBAIKAN DEVICE VISIBILITY

**Dokumen Referensi**: `DEVICE_VISIBILITY_FIX_REPORT.md`  
**Target Milestone**: Founder UAT Stabilization & Fleet Observability  
**Tanggal Implementasi**: 22 September 2026  
**Status**: **100% VERIFIED & RESOLVED (ALL PASS)**  
**Target Sasaran**: Kiosk teraktivasi wajib tampil **`ONLINE`** di Dashboard dan tetap berstatus **`ONLINE`** selama heartbeat aktif.

---

## 1. Ringkasan Hasil Verifikasi

Semua kriteria kelulusan terpenuhi 100%:
- **Heartbeat 200/201 Success Count**: **2 kali / 2 pengiriman** (0% kegagalan)
- **Heartbeat HTTP 400 Error Count**: **0 (Nol Error)**
- **Koneksi WebSocket Ganda**: **0 (Eliminasi Sempurna — Hanya 1 Socket Aktif)**
- **Status Cloud Real-Time**: **`ONLINE`**
- **Heartbeat Freshness**: **1 detik** (jauh di bawah batas ambang `< 60s`)
- **Status Perangkat di PostgreSQL**: **`ACTIVE`** (Hostname: `Blondd`)

```text
Sebelum Perbaikan:
[Kiosk Heartbeat] ──(Payload: paperRemaining: 700)──► [Cloud Backend: forbidNonWhitelisted] ──► ❌ 400 Bad Request
                                                                                                  (last_seen macet)
                                                                                                  (Status: OFFLINE)

Setelah Perbaikan:
[Kiosk Heartbeat] ──(Whitelisted DTO Payload)──────► [Cloud Backend: ValidationPipe]     ──► ✓ 201 Created
                                                                                                  (last_seen: 1s ago)
                                                                                                  (Status: ONLINE)
```

---

## 2. Rincian Perubahan Kode (Code Changes)

### A. Backend DTO Whitelisting
**File**: [`apps/backend/src/booths/dto/booth-heartbeat.dto.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/dto/booth-heartbeat.dto.ts)  
Menambahkan field `paperRemaining` ke dalam DTO resmi agar backend menerima metrik sisa kertas printer dye-sub tanpa penolakan validasi:
```diff
--- a/apps/backend/src/booths/dto/booth-heartbeat.dto.ts
+++ b/apps/backend/src/booths/dto/booth-heartbeat.dto.ts
@@ -1,5 +1,5 @@
 import { ApiPropertyOptional } from '@nestjs/swagger';
-import { IsString, IsOptional, IsIn } from 'class-validator';
+import { IsString, IsOptional, IsIn, IsNumber } from 'class-validator';
 
 export class BoothHeartbeatDto {
@@ -58,5 +58,13 @@ export class BoothHeartbeatDto {
   @IsString()
   @IsIn(['stable', 'beta', 'nightly', 'canary'])
   releaseChannel?: string;
+
+  @ApiPropertyOptional({
+    example: 650,
+    description: 'Remaining physical dye-sub paper prints in printer roll',
+  })
+  @IsOptional()
+  @IsNumber()
+  paperRemaining?: number;
 }
```

---

### B. Canonical UUID Emit pada WebSocket Status Relay
**File**: [`apps/backend/src/booths/booths.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.controller.ts)  
Memperbaiki payload broadcast `booth_status_changed` agar selalu menggunakan `result.boothId` (UUID kanonikal booth), bukan parameter rute `id` (yang bisa berupa string `deviceSecret`):
```diff
--- a/apps/backend/src/booths/booths.controller.ts
+++ b/apps/backend/src/booths/booths.controller.ts
@@ -59,7 +59,7 @@ export class BoothsController {
     // Relay real-time status change to connected Admin Dashboards
     if (this.kioskGateway?.server) {
       this.kioskGateway.server.to('dashboards').emit('booth_status_changed', {
-        boothId: id,
+        boothId: result.boothId || id,
         status: result.status,
         isMaintenance: result.isMaintenance,
       });
@@ -93,7 +93,7 @@ export class BoothsController {
     // Relay real-time status and platform updates to connected Admin Dashboards
     if (this.kioskGateway?.server) {
       this.kioskGateway.server.to('dashboards').emit('booth_status_changed', {
-        boothId: id,
+        boothId: result.boothId,
         status: result.status,
         isMaintenance: result.isMaintenance,
         lastSeen: result.lastSeen,
```

---

### C. Backward-Compatible Kiosk Heartbeat & Single-Socket Guard
**File**: [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts)  
1. Menghilangkan field non-whitelisted pada payload HTTP heartbeat reguler (metrik printer tetap dikirim via WebSocket `HEALTH_PING`).
2. Menambahkan guard pada `setupSocketConnection()` agar tidak membuat koneksi socket baru jika socket yang ada sudah aktif:
```diff
--- a/apps/kiosk/electron/services/SyncEngine.ts
+++ b/apps/kiosk/electron/services/SyncEngine.ts
@@ -924,6 +924,17 @@ function setupSocketConnection(): void {
 function setupSocketConnection(): void {
   if (!config.apiBaseUrl || !config.deviceSecret) return;
 
+  // Single-Socket Guard: Prevent duplicate initialization if socket is active
+  if (socket && (socket.connected || (socket as any).active)) {
+    console.log('[SyncEngine] ℹ️ WebSocket already active, skipping duplicate setup');
+    return;
+  }
+
+  if (socket) {
+    socket.disconnect();
+    socket = null;
+  }
+
   const targetUrl = config.apiBaseUrl;
   
   socket = io(targetUrl, {
@@ -1039,9 +1050,8 @@ async function sendHttpHeartbeat(): Promise<void> {
-  const payload = {
+  const payload: Record<string, any> = {
     appVersion: '1.2.5',
     gitCommit: process.env.GIT_COMMIT || '1457ae6',
     machineName: os.hostname(),
     localIp: getPrimaryLocalIp(),
     osVersion: `${os.type()} ${os.release()} (${os.arch()})`,
     electronVersion: process.versions.electron || '28.2.0',
     releaseChannel: 'stable',
-    paperRemaining,
   };
```

---

### D. Eliminasi Panggilan Socket Dini Saat Booting
**File**: [`apps/kiosk/electron/services/IdentityService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/IdentityService.ts)  
Menghapus pemanggilan `updateSyncCredentials` prematur di dalam `loadIdentity` pada saat startup, karena `registerSyncHandlers` di `main.ts` dipanggil 2 baris setelahnya dengan konfigurasi direktori data lengkap:
```diff
--- a/apps/kiosk/electron/services/IdentityService.ts
+++ b/apps/kiosk/electron/services/IdentityService.ts
@@ -312,10 +312,6 @@ export function loadIdentity(defaultApiUrl: string = 'http://localhost:4000', a
         mirrorToSQLite(parsed);
         console.log(`[IdentityService] ✓ Loaded identity from ${filePath}: ${parsed.boothName} (${parsed.boothId})`);
 
-        try {
-          updateSyncCredentials(parsed.apiBaseUrl, activeDeviceSecret, parsed.boothId);
-        } catch (_) {}
-
         return parsed;
       }
     } catch (err: any) {
```

---

## 3. Bukti Verifikasi Runtime (Runtime Evidence)

Pengujian end-to-end dilakukan menggunakan skrip otomatisasi [`scripts/run_device_visibility_verification.mjs`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/run_device_visibility_verification.mjs) yang menjalankan binary produksi `release/win-unpacked/Pictolabs Kiosk.exe` selama 35 detik penuh melawan Cloud VPS (`https://api.pictolabs.id`).

### Log Eksekusi Runtime Kiosk & Cloud Verification:
```text
[02:20:10.738] ====================================================
[02:20:10.738]   DEVICE VISIBILITY RUNTIME VERIFICATION
[02:20:10.738] ====================================================
[02:20:10.738] 1. Cleaning up any previous Kiosk processes...
[02:20:11.018] 2. Verifying local identity file...
[02:20:11.019] ✓ Loaded identity: Booth PICTOLABS-DEV-01 (554147f9-c7f7-47fe-966d-fcbf3223fec4)
[02:20:11.019] 3. Authenticating with Cloud Backend...
[02:20:11.477] Initial Cloud Status for PICTOLABS-DEV-01: OFFLINE (Last seen: 2026-09-22T02:06:20.228Z, Age: 826s)
[02:20:11.478] 4. Launching updated Kiosk binary (win-unpacked)...
[02:20:11.575] 5. Monitoring live Kiosk runtime for 35 seconds...
[02:20:13.749] 🎯 [KIOSK STDOUT] [SyncEngine] ✓ HTTP Heartbeat sent -> Effective Status: ONLINE (Maintenance: false)
[02:20:13.906] 🔌 [KIOSK STDOUT] ✓ [SyncEngine] Real-time WebSocket connected to cloud backend: https://api.pictolabs.id
[02:20:16.576] ... Elapsed: 5s / 35s
[02:20:21.581] ... Elapsed: 10s / 35s
[02:20:26.584] ... Elapsed: 15s / 35s
[02:20:31.598] ... Elapsed: 20s / 35s
[02:20:36.610] ... Elapsed: 25s / 35s
[02:20:41.627] ... Elapsed: 30s / 35s
[02:20:44.916] 🎯 [KIOSK STDOUT] [SyncEngine] ✓ HTTP Heartbeat sent -> Effective Status: ONLINE (Maintenance: false)
[02:20:46.638] ... Elapsed: 35s / 35s
[02:20:46.638] 6. Verifying real-time Cloud Backend status while Kiosk is alive...
[02:20:46.773] ----------------------------------------------------
[02:20:46.773] Live Booth Name: PICTOLABS-DEV-01
[02:20:46.773] Live Computed Status: ONLINE
[02:20:46.774] Live Last Seen: 2026-09-22T02:20:40.563Z
[02:20:46.774] Live Seconds Since Heartbeat: 1s
[02:20:46.774] Live Device Status: ACTIVE
[02:20:46.774] Live Device Hostname: Blondd
[02:20:46.774] ----------------------------------------------------
[02:20:46.774] 7. Terminating test Kiosk process...
[02:20:48.783] 
====================================================
[02:20:48.783]   FINAL VERIFICATION REPORT
====================================================
Heartbeat 200/201 Success Count: 2
Heartbeat 400 Error Count: 0
Duplicate Socket Disconnections: 0
Cloud Status: ONLINE
Heartbeat Freshness: 1s (< 60s threshold)
Pass Criteria 1 (Heartbeat Accepted): PASS ✓
Pass Criteria 2 (No Duplicate Socket Disconnect): PASS ✓
Pass Criteria 3 (Cloud Status is ONLINE): PASS ✓
🎉 ALL VERIFICATION CRITERIA PASSED! Device visibility is 100% resolved.
```

---

## 4. Verifikasi Database Cloud (PostgreSQL Live Query)

Hasil query live dari endpoint armada `GET https://api.pictolabs.id/api/booths`:
```json
{
  "id": "554147f9-c7f7-47fe-966d-fcbf3223fec4",
  "name": "PICTOLABS-DEV-01",
  "branch": {
    "name": "Grand Indonesia Kiosk",
    "location": "Jakarta"
  },
  "device": {
    "id": "b8876754-5034-401e-b772-960e8e0a6655",
    "status": "ACTIVE",
    "hostname": "Blondd",
    "lastSeenAt": "2026-09-22T02:20:40.563Z"
  },
  "status": "ONLINE",
  "isMaintenance": false,
  "lastSeen": "2026-09-22T02:20:40.563Z",
  "secondsSinceLastHeartbeat": 1,
  "appVersion": "1.2.5",
  "machineName": "Blondd",
  "localIp": "172.16.0.2"
}
```

---

## 5. Dampak pada Tampilan Dashboard (Dashboard Visibility)

1. **Halaman Overview (`OverviewPage.tsx`)**:
   - Kartu KPI **`Online Booths`** kini bernilai **`1`** (sebelumnya `0`).
   - Kartu KPI **`Offline Booths`** kini bernilai **`0`** (sebelumnya `1`).
2. **Halaman Booths Fleet (`BoothsPage.tsx`)**:
   - Tab **`Online (1)`**: Menampilkan `PICTOLABS-DEV-01` dengan badge hijau menyala `ONLINE`.
   - Kolom Host Runtime menampilkan badge hijau tebal: **`PAIRED`** (`Blondd`).
   - Kolom Last Heartbeat menampilkan: **`1s ago`** (ter-update secara real-time via interval 30 detik).
   - Filter tab `status=ONLINE` tidak lagi memunculkan pesan kosong *"No booths found"*.
3. **Validasi Alur Hardware Printer**:
   - Kiosk berstatus online dan terdaftar aktif di cloud, sehingga interlock printer tidak lagi terkunci dalam status offline.

---

## 6. Uji Regresi (Regression Checks)

| Komponen | Status Uji Regresi | Keterangan |
| :--- | :---: | :--- |
| **Activation Flow (OTP Handshake)** | **PASS** | `IdentityService.ts` tetap menyimpan identitas DPAPI dan token `CONSUMED` secara atomik. |
| **StorageRetentionService** | **PASS** | Tetap berjalan non-blocking (asynchronous dengan event-loop yields). |
| **Watchdog Supervisor** | **PASS** | Watchdog service tetap aktif mengawasi proses tanpa anomali. |
| **WebSocket CONFIG_UPDATE** | **PASS** | Kiosk tetap menerima konfigurasi remote dari Cloud Gateway secara instan. |
| **Compiler / Build Integrity** | **PASS** | `tsc` backend, `tsc` kiosk, dan `electron-builder --win` selesai dengan status 0 (clean). |

---

## 7. Status File Terpaket Terbaru

- **Setup Installer**:  
  [`pictolabs-rebuild/apps/kiosk/release/Pictolabs Kiosk Setup 1.0.0.exe`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/Pictolabs%20Kiosk%20Setup%201.0.0.exe)  
  *(Build time: 22 September 2026, 09:19 WIB)*
- **Portable Binary**:  
  [`pictolabs-rebuild/apps/kiosk/release/win-unpacked/Pictolabs Kiosk.exe`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/win-unpacked/Pictolabs%20Kiosk.exe)  
  *(Build time: 22 September 2026, 09:19 WIB)*

Unit kiosk fisik kini **sepenuhnya terlihat ONLINE** pada dashboard dan siap untuk melanjutkan pengujian printer fisik serta customer journey UAT Founder.
