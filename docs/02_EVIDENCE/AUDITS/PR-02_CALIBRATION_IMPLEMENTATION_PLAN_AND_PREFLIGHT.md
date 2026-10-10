# PR-02 — PRINTER PROFILES & CALIBRATION: TARGETED PREFLIGHT & IMPLEMENTATION PLAN
**Document ID:** `DOC-PR02-PLAN-001`  
**Execution Date:** 2026-10-10  
**Status:** PREFLIGHT COMPLETED / AWAITING FOUNDER & CHATGPT REVIEW  
**Workstream:** Printer Workstream / Pilot Readiness Feature Batch (Phase B — PR-02)  
**Parent Gate:** `Phase B: PR-02 Printer Profiles & Calibration Planning`  

---

## 1. Executive Summary

Laporan ini menyajikan hasil **Targeted Preflight Investigation** dan **Rencana Implementasi Terstruktur** untuk PR-02 (*Printer Profiles & Calibration*). Seluruh rencana disusun berdasarkan bukti empiris dari audit komparasi aplikasi referensi ([`PR-02_REFERENCE_FEATURE_COMPARISON_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PR-02_REFERENCE_FEATURE_COMPARISON_AUDIT.md)), dengan mempertahankan 100% arsitektur kanonis armada multi-booth PR-01 dan invarian stabilitas pencetakan RCA-7.

### Temuan Kunci Preflight:
1. **Antrean Printer Fisik di Mesin Saat Ini**:
   Pemeriksaan WMI lokal menunjukkan printer terpasang di sistem Windows saat ini bernama:  
   `"DS-RX1 (Copy 2)"` pada port `USB003` (bukan `"DS-RX1"` polos atau `"DS-RX1 2r"`).  
   Ini membuktikan secara empiris bahwa hardcoding nama antrean printer tidak aman di dunia nyata, dan pemilihan antrean per-booth/per-media mutlak diperlukan.
2. **Pola Kalibrasi Otentik**:
   Berkas referensi [`test.png`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/test.png) ($1203 \times 1804\text{ px}$) memuat penggaris milimeter dan penanda batas yang tepat, namun memuat logo pihak ketiga. Direkomendasikan menyalin dan menyematkan target kalibrasi berstandar Pictolabs ke dalam direktori aset resmi Kiosk.
3. **Pemberian Makan Parameter Dinamis**:
   Fungsi `PrintService.printImage` saat ini meng-hardcode `['99', '0', '3', activePrinter]`. Cukup dengan menginjeksikan pembacaan terhidrasi dari `readLocalKioskConfig().hardware`, parameter skala dan offset menjadi dinamis tanpa membuat titik spawn baru.
4. **Perlindungan Bus USB DNP pada Uji Kalibrasi**:
   Pencetakan kalibrasi operator dari `AdminScreen` wajib diapit oleh `setPrintDispatchActive(true)` dan `finally { setPrintDispatchActive(false) }` untuk mencegah tabrakan dengan polling telemetri USB DNP (`PhotolabDNP.exe`).

---

## 2. Hasil Targeted Preflight (Poin 1 s.d. 6)

### 2.1 Lokasi Kanonis Skema BoothConfig, DTO, Persistensi & Hidrasi
- **Skema Zod Bersama**: [`packages/shared/src/schemas.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/packages/shared/src/schemas.ts)
  - Namespace target: `HardwareConfigSchema`.
  - Field yang ditambahkan:
    - `printerCalibration`: Objek berisi `scalePercent` (number, 85..105, default 99), `offsetXUnits` (number, -25..+25, default 0), `offsetYUnits` (number, -25..+25, default 3).
    - `printerNames`: Record berisi pemetaan format media ke string nama antrean Windows (`{ '2R'?: string | null, '4R'?: string | null }`).
- **Backend DTO & Normalisasi**:
  - DTO: [`apps/backend/src/booths/dto/update-booth-config.dto.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/dto/update-booth-config.dto.ts) (tambahkan class validator `@IsOptional`, `@IsNumber`, `@Min`, `@Max`).
  - Normalisasi: [`apps/backend/src/booths/booths.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts) (`normalizeConfigEnvelope` memastikan nilai fallback default aman jika kolom di DB kosong).
- **Persistensi & Cache Lokal Kiosk**:
  - Cache: Disimpan di `%ProgramData%\Pictolabs\kiosk-config.json` (atau fallback user home) via `writeLocalKioskConfig` (penulisan atomik berkas `.tmp`).
  - Hidrasi Offline: `readLocalKioskConfig()` membaca berkas lokal secara sinkron (<1ms pada cold boot), menjamin Kiosk tetap mencetak dengan kalibrasi yang tepat saat offline.

### 2.2 Jalur Dispatch Tunggal `PrintService.printImage`
- **Lokasi Kode**: [`apps/kiosk/electron/services/PrintService.ts:677-760`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts#L677-L760)
- **Kontrak CLI `print.exe`**:
  ```text
  print.exe <imagePath> <copies> <scale%> <offsetX> <offsetY> <printerName>
  ```
- **Mekanisme Injeksi Parameter**:
  Mengganti baris 724-726 yang hardcoded:
  ```typescript
  const localConfig = readLocalKioskConfig();
  const calib = localConfig?.hardware?.printerCalibration;
  const scaleArg = String(typeof calib?.scalePercent === 'number' && calib.scalePercent >= 85 && calib.scalePercent <= 105 ? calib.scalePercent : 99);
  const offXArg = String(typeof calib?.offsetXUnits === 'number' && calib.offsetXUnits >= -25 && calib.offsetXUnits <= 25 ? calib.offsetXUnits : 0);
  const offYArg = String(typeof calib?.offsetYUnits === 'number' && calib.offsetYUnits >= -25 && calib.offsetYUnits <= 25 ? calib.offsetYUnits : 3);
  ```
- **Resolusi Antrean Media**:
  ```typescript
  const queueMap = localConfig?.hardware?.printerNames;
  const mappedPrinter = mediaFormat ? queueMap?.[mediaFormat] : null;
  const activePrinter = printerName || mappedPrinter || defaultPrinterName || 'DS-RX1';
  ```
- **Invarian**: Tetap mempertahankan **SATU** titik pemanggilan `child_process.execFile(printExe, printArgs)`.

### 2.3 Evaluasi Citra Target Kalibrasi (`test.png`)
- **Dimensi**: $1203 \times 1804\text{ px}$ (sesuai rasio 4x6 inci pada 300 DPI dengan tambahan batas bleed).
- **Evaluasi Kontrak**:
  - `print.exe` menggunakan .NET GDI+ `DrawImage` yang secara otomatis menyesuaikan citra apa pun ke area cetak kertas driver Windows.
  - Namun, citra `test.png` bawaan referensi memuat logo vendor Photolab.
- **Rekomendasi Preflight**:
  - Salin berkas target kalibrasi ke dalam Kiosk sebagai aset bawaan:  
    `apps/kiosk/resources/assets/calibration_target.png`.
  - Berkas ini memiliki garis ukur milimeter ($0, 5, 10, 15, 25, 30$ unit), penanda perataan silang diagonal, dan penanda garis potong $50.8\text{ mm}$ ($2\text{ inci}$) di bagian tengah.

### 2.4 Penanganan Cetak Kalibrasi di `AdminScreen.tsx`
- **Handler Saat Ini**: `handleCutTest` memanggil `kiosk.printer.cutTest()`.
- **Modifikasi Aman**:
  - Evolve IPC handler `printer:cut-test` atau tambahkan `printer:print-calibration`.
  - Alih-alih membuat kotak abu-abu polos $1200\times600$, fungsi ini memuat `calibration_target.png` dan mengirimkannya ke `printImage`.
  - **Kritikal RCA-7**: Wajib mengapit pemanggilan cetak dengan `setPrintDispatchActive(true)` dan `finally { setPrintDispatchActive(false) }` untuk melindungi bus USB dari probe status DNP.

### 2.5 Verifikasi Antrean Printer & Pengaturan Driver pada Booth #1
- **Fakta Empiris dari Sistem Operasi**:
  Hasil probe WMI menunjukkan nama printer yang terdeteksi adalah:  
  `DS-RX1 (Copy 2)` di port `USB003`.
- **Kebutuhan Konfigurasi Driver OS**:
  - Untuk 2R Photostrip: Windows membutuhkan antrean printer dengan setting driver *2-inch Cut: Enabled*.
  - Untuk 4R Postcard: Windows membutuhkan antrean printer dengan setting driver *2-inch Cut: Disabled*.
- **Tindakan**:
  - Jangan mengasumsikan nama antrean printer sudah ada.
  - Sediakan dropdown di Admin Panel yang membaca daftar printer terpasang secara dinamis via `kiosk.printer.listPrinters()` (yang sudah mengimplementasikan `webContents.getPrintersAsync()` dan PowerShell fallback).

### 2.6 Batas Aman, Nilai Bawaan, Validasi, dan Fallback Offline
| Parameter | Nilai Default | Batas Validasi (Bounds) | Perilaku Jika Nilai Rusak / Kosong |
| :--- | :---: | :---: | :--- |
| `scalePercent` | `99` | $85.0 \le x \le 105.0$ | Fallback ke `99` |
| `offsetXUnits` | `0` | $-25.0 \le x \le +25.0$ (satuan $1/100$ inci, $\approx \pm 6.35\text{ mm}$) | Fallback ke `0` |
| `offsetYUnits` | `3` | $-25.0 \le x \le +25.0$ (satuan $1/100$ inci, $\approx \pm 6.35\text{ mm}$) | Fallback ke `3` |
| `printerNames.2R`| `null` | String (nama antrean terpasang di OS) | Fallback ke `defaultPrinterName` (PnP auto-detected) |
| `printerNames.4R`| `null` | String (nama antrean terpasang di OS) | Fallback ke `defaultPrinterName` |

---

## 3. Daftar Berkas yang Terpengaruh (Target File List)

1. **Kontrak Skema Bersama**:
   - [`packages/shared/src/schemas.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/packages/shared/src/schemas.ts)
2. **Backend DTO & Normalisasi**:
   - [`apps/backend/src/booths/dto/update-booth-config.dto.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/dto/update-booth-config.dto.ts)
   - [`apps/backend/src/booths/booths.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts)
3. **Kiosk Electron Bridge & Services**:
   - [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) (penambahan default kalibrasi di `readLocalKioskConfig` & sanitasi `writeLocalKioskConfig`)
   - [`apps/kiosk/electron/services/PrintService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts) (injeksi parameter dinamis ke `printImage`, penyempurnaan `cutTest` / `printCalibration`)
   - [`apps/kiosk/electron/preload.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/preload.ts) & [`apps/kiosk/src/ipc/bridge.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/ipc/bridge.ts)
4. **Kiosk React Context & UI**:
   - [`apps/kiosk/src/context/KioskConfigContext.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/context/KioskConfigContext.tsx)
   - [`apps/kiosk/src/screens/AdminScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx) (penambahan kontrol slider kalibrasi, dropdown antrean printer per media, tombol cetak kalibrasi, tombol reset default)
5. **Aset & Dokumentasi Runbook**:
   - `apps/kiosk/resources/assets/calibration_target.png` (berkas target kalibrasi presisi)
   - [`docs/03_RUNBOOKS/OPERATOR/DNP_PRINTER_SETUP_RUNBOOK.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/OPERATOR/) (panduan singkat setup 2 antrean Windows)

---

## 4. Urutan Eksekusi Bertahap (Small Testable Sequence)

```text
[Langkah 1: Skema & DTO]
  ├── Update Zod schemas.ts & UpdateBoothConfigDto
  └── Test otomatis: Validasi skema & penolakan nilai di luar bounds.

[Langkah 2: Normalisasi Backend & SyncEngine]
  ├── Update booths.service.ts (default envelope)
  ├── Update SyncEngine.ts (read/writeLocalKioskConfig)
  └── Test otomatis: Hidrasi cold-boot offline & persistensi atomik.

[Langkah 3: Dynamic Dispatch di PrintService]
  ├── Inject scale, offX, offY, printerNames dari config aktif
  ├── Lindungi uji cetak dengan setPrintDispatchActive(true/false)
  └── Test otomatis: Eksekusi argumen print.exe & verifikasi invariant RCA-7.

[Langkah 4: Antarmuka Operator di AdminScreen]
  ├── Tambah tab/sub-panel "Kalibrasi Printer" di AdminScreen
  ├── Slider Scale (85..105%), OffsetX (-25..+25), OffsetY (-25..+25)
  ├── Dropdown pemilihan printer 2R & 4R dari kiosk.printer.listPrinters()
  └── Tombol "Uji Kalibrasi Cetak" & "Reset Default Pabrik"

[Langkah 5: Regresi & Validasi Menyeluruh]
  ├── Jalankan test suite PR-01 (test_pr01_booth_config_foundation.mjs)
  ├── Jalankan rca7-simplification.spec.ts & rca6-regression.spec.ts
  └── Buat skrip verifikasi khusus: test_pr02_printer_calibration.mjs
```

---

## 5. Strategi Verifikasi & Acceptance Criteria

### A. Pengujian Otomatis (Automated Tests)
1. **Validasi Skema**:
   - `scalePercent: 110` -> Ditolak / dinormalisasi ke `99`.
   - `offsetXUnits: -30` -> Ditolak / dinormalisasi ke `0`.
   - `printerNames` valid objek mapping -> Diterima.
2. **Isolasi Booth & Persistensi**:
   - Konfigurasi booth A tidak menimpa booth B.
   - Perubahan di Admin Panel tersimpan di cache lokal `%ProgramData%` dan bertahan setelah restart aplikasi.
3. **Konstruksi Argumen `print.exe`**:
   - Unit test memverifikasi array argumen yang diteruskan ke `execFile` memuat nilai dinamis dari config, bukan `'99', '0', '3'` kaku.
4. **Regresi Invarian RCA-7**:
   - Seluruh test di `rca7-simplification.spec.ts` dan `rca6-regression.spec.ts` tetap **100% PASS**.

### B. Pengujian Runtime Lokal (Local Runtime)
- Eksekusi Kiosk Electron dalam dev mode (`npm run dev`).
- Masuk ke Admin Panel via PIN `123456`.
- Buka panel kalibrasi, geser slider, klik Simpan.
- Matikan Kiosk dan nyalakan kembali dalam kondisi offline (simulasi jaringan putus).
- Verifikasi nilai slider tetap berada pada posisi yang disimpan.

### C. Founder Physical UAT (Hardware Gate)
- Melakukan cetak lembar kalibrasi pada hardware fisik DNP DS-RX1 Booth #1.
- Mengukur garis potong tengah dengan penggaris (harus pas di $50.8\text{ mm}$ tanpa sisa garis putih tepi).
- Menguji pengalihan format 2R (terpotong kembar) vs 4R (tidak terpotong).

---

## 6. Batasan Invarian Mutlak (Safety Guardrails)

1. **Preserve Single Spawn Point**: Dilarang membuat fungsi spawn proses baru untuk `print.exe`.
2. **Preserve SQLite Queue & Watchdog**: Antrean cetak pelanggan tetap dikelola secara persisten oleh `PrintQueueService` dengan watchdog 45 detik.
3. **USB Collision Guard**: Eksekusi uji kalibrasi wajib mematikan sementara polling USB DNP via `setPrintDispatchActive`.
4. **No Customer Flow Disruption**: Format 4R **TIDAK** diaktifkan di `ProductSelectScreen` untuk pelanggan pilot. Alur pelanggan tetap terkunci pada 2R Photostrip.
5. **Zero Hardware Mutation in Code**: Dilarang memanipulasi DEVMODE driver Windows secara dinamis di dalam Node.js.

---

> [!IMPORTANT]
> **Status Dokumen:** Preflight plan ini siap direview. Tidak ada kode produksi yang dimodifikasi selama fase investigasi ini.  
> **Langkah Selanjutnya:** Menunggu arahan Founder dan review ChatGPT terhadap rencana implementasi ini sebelum memulai eksekusi penulisan kode PR-02.
