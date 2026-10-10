# PR-02 — RENDER & PRINT PIPELINE ARCHITECTURAL AUDIT
**Document ID:** `DOC-PR02-AUDIT-001`  
**Execution Date:** 2026-10-10  
**Status:** AUDIT COMPLETED / PENDING FOUNDER REVIEW  
**Workstream:** Pilot Readiness Feature Batch (Phase B — PR-02)  
**Parent Gate:** `Phase B: PR-02 Printer Profiles & Calibration Planning`  
**Source Baseline:** PR-01 Closed with Exception (Commit `353f79b` + Local PR-01 Working Tree)  

---

## 1. Executive Summary & Objective

Tahap PR-01 (*Booth Configuration Foundation*) telah resmi ditutup dengan status `CLOSED_WITH_EXCEPTION` (pengecualian Dynamic QRIS Sandbox didecoupling ke Pilot-Wide Release Gate). Status Pilot Booth #1 saat ini tetap **NOT READY / BLOCKED**.

Audit ini adalah investigasi **READ-ONLY** komprehensif terhadap subsistem rendering citra dan pencetakan Windows GDI (`RenderEngine.ts`, `PrintService.ts`, `PrintQueueService.ts`, `PrinterHardwareAdapter.ts`, dan utilitas native `print.exe`).

### Tujuan Audit:
1. Memetakan alur citra, ukuran media, orientasi canvas, DPI, pemotongan/skala, area cetak, bleed, offset X/Y, dan dispatch ke printer fisik DNP DS-RX1.
2. Mengidentifikasi dukungan aktual dan kesenjangan (gap) antara format strip ganda 2R (*photostrip*) versus kartu pos 4R (*postcard*).
3. Merancang arsitektur profil printer dan kalibrasi yang kompatibel dengan skema kanonis `BoothConfig.hardware`, cache lokal terenkripsi, serta isolasi per-booth.
4. Memetakan risiko regresi terhadap penyederhanaan pipeline cetak RCA-7 yang telah terbukti lulus **10/10 Founder Physical UAT**.
5. Mengelompokkan secara ketat: fakta kode (*code facts*), bukti pengujian (*test evidence*), asumsi (*assumptions*), dan parameter yang memerlukan pengukuran fisik (*physical measurements*).

> [!IMPORTANT]
> **Batasan Audit Ketat Dipatuhi:**
> - Zero code modification (tidak ada kode diubah).
> - Zero config mutation (konfigurasi `.env` dan json tidak disentuh).
> - Zero physical print execution (tidak ada perintah cetak dikirim ke printer fisik).
> - Zero roadmap manipulation (status timeline tetap Phase B Planning).
> - Zero Git commit, push, atau deploy.

---

## 2. End-to-End Pipeline Architecture & Flow Diagram

### 2.1 Diagram Alur Pipeline Cetak Saat Ini

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            CUSTOMER KIOSK JOURNEY                                │
│                                                                                  │
│  [ProductSelectScreen]        [CaptureScreen]              [FilterScreen]        │
│   • Hardcoded '2R'             • 3 Poses Captured           • Presets: original, │
│   • 2x6 strip format           • Native Canon / Webcam        bw, sepia, vivid,  │
│   • Session metadata           • Local JPEG on disk           cool, vintage      │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│             RENDERING SUBSYSTEM: RenderScreen.tsx ──► RenderEngine.ts            │
│                                                                                  │
│  1. IPC Invoke: 'render:composite' (photos, frameId: '2R', filter)              │
│  2. Sharp Base Canvas: 1200 x 1800 px (4x6 inch @ 300 DPI, RGBA 4-channel)       │
│  3. Theme Background: hex fill (white #ffffff, noir #090d16, pastel, etc.)       │
│  4. Dual Strip Duplication (2R Slot Mapping):                                    │
│     • Left Strip:   x=50..550,  y=60..1275  (3 poses, width=500, height=375)     │
│     • Right Strip:  x=650..1150, y=60..1275 (duplicated 3 poses via i % len)    │
│     • Center Cut:   x=600 px (SVG dashed line guide)                             │
│     • Branding:     x=300 & x=900, y=1450 & 1490 ("PICTOLABS STUDIO")            │
│  5. Custom Frame Overlay (optional): framesDir/${frameId}.png                    │
│  6. Sharp Output Encoding:                                                       │
│     • JPEG quality: 95, chromaSubsampling: '4:4:4', density: 300 DPI            │
│     • Saved to disk: composite_${Date.now()}.jpg                                 │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│              PERSISTENCE & ASYNC GIF: RenderScreen.tsx ──► SyncEngine            │
│                                                                                  │
│  1. SQLite Session Creation: (compositePath, filter, frameId, printStatus: 'pending')│
│  2. Asynchronous Decoupled GIF Transcode: non-blocking, detached from print path │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│            PRINT ENQUEUEING SUBSYSTEM: QRScreen.tsx ──► PrintQueueService        │
│                                                                                  │
│  1. Sole Enqueue Owner: QRScreen.tsx invokes kiosk.printer.enqueue(cleanPath, 1) │
│  2. SQLite Print Queue: INSERT INTO print_queue (status='PENDING', copies=1)     │
│  3. Event-Driven Dispatch: Worker picks job, checks cached hardware status       │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│            PRINT EXECUTION SUBSYSTEM: PrintService.ts ──► print.exe              │
│                                                                                  │
│  1. Lock Mutex: setPrintDispatchActive(true) -> pauses PhotolabDNP USB polling   │
│  2. Target Resolution: activePrinter = 'DS-RX1' (default exact match)            │
│  3. Native CLI Dispatch (child_process.execFile):                                │
│     print.exe <targetPath> <copies: '1'> <scale: '99'> <offX: '0'> <offY: '3'> <printer> │
│     ▲                                       ▲              ▲           ▲         │
│     │                                       │              │           │         │
│     └──────────── HARDCODED PARAMETERS IN TYPESCRIPT ──────┴───────────┘         │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│            WINDOWS SPOOLER & HARDWARE LAYER: print.exe ──► DNP DS-RX1            │
│                                                                                  │
│  1. print.exe (.NET System.Drawing.Printing.PrintDocument):                      │
│     • GDI+ DrawImage with 99% scale, offset (0, 3) in 1/100 inch units           │
│     • Windows Print Spooler (spoolsv.exe) accepts EMF spool job                  │
│  2. Exit Code 0: Print job committed to Windows Spooler                          │
│     • PrintQueueService transitions job status directly to 'COMPLETED' (RCA-7)   │
│  3. DNP Driver & Firmware Execution:                                             │
│     • Physical dye-sublimation thermal transfer (YMC + Overcoat)                 │
│     • Mechanical 2-inch cut: Cutter engages at x=600 if driver setting enabled   │
│     • Ejection: 2 lembar photostrip 2x6 inci atau 1 lembar kartu pos 4x6 inci    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Matriks Parameter dan Sumber Kebenarannya

Berikut adalah audit seluruh parameter ukuran media, orientasi, canvas, DPI, crop, printable area, bleed, dan koordinat X/Y:

| Parameter | Nilai Aktual Saat Ini | Sumber Kebenaran Kode (Source of Truth) | Tipe Konfigurasi | Status Evaluasi |
| :--- | :--- | :--- | :--- | :--- |
| **Canvas Width** | `1200 px` | `RenderEngine.ts:41` (`DEFAULT_FRAMES['2R'].width`) | Hardcoded Constant | **Kaku**: Tepat 4.0 inci pada 300 DPI. |
| **Canvas Height** | `1800 px` | `RenderEngine.ts:42` (`DEFAULT_FRAMES['2R'].height`) | Hardcoded Constant | **Kaku**: Tepat 6.0 inci pada 300 DPI. |
| **Canvas Density / DPI** | `300 DPI` | `RenderEngine.ts:237` (`.withMetadata({ density: 300 })`) | Hardcoded Constant | Standar industri cetak foto lab DNP. |
| **Color Channels** | `RGBA (4 channels)` | `RenderEngine.ts:147` (`channels: 4`) | Hardcoded Constant | Mendukung transparansi overlay PNG. |
| **JPEG Encoding Quality** | `95`, Chroma `4:4:4` | `RenderEngine.ts:234-235` | Hardcoded Constant | Kualitas grafis optimal tanpa subsampling. |
| **2R Slot Count** | `6 slots` (Dual 3-Pose) | `RenderEngine.ts:43-52` | Hardcoded Constant | 3 pose kiri, 3 pose kanan duplikasi. |
| **2R Left Strip X-Range** | `x = 50 s.d. 550` | `RenderEngine.ts:45-47` (`x: 50, width: 500`) | Hardcoded Constant | Margin luar kiri = 50px (4.23 mm). |
| **2R Right Strip X-Range** | `x = 650 s.d. 1150` | `RenderEngine.ts:49-51` (`x: 650, width: 500`) | Hardcoded Constant | Margin luar kanan = 50px (4.23 mm). |
| **2R Center Gutter Margin** | `100 px` (`550 s.d. 650`) | `RenderEngine.ts:45,49` (selisih slot kiri & kanan) | Hardcoded Constant | Jarak aman 50px di tiap sisi garis potong. |
| **2R Center Cut Position** | `x = 600 px` | `RenderEngine.ts:194` (`line x1="600" x2="600"`) | Hardcoded Constant | Garis potong tengah mekanik pisau DNP. |
| **Photo Crop / Resize** | `fit: 'cover', center` | `RenderEngine.ts:178` (`sharp.resize(..., { fit: 'cover' })`) | Hardcoded Logic | Aspect ratio foto dipotong tengah sesuai slot. |
| **Print Scale %** | `99%` | `PrintService.ts:724` (`printArgs[2] = '99'`) | **Hardcoded String** | **Defek Desain**: Tidak dapat disesuaikan per-booth. |
| **Print Offset X** | `0` (1/100 inci) | `PrintService.ts:725` (`printArgs[3] = '0'`) | **Hardcoded String** | **Defek Desain**: 0 offset mengabaikan toleransi roll. |
| **Print Offset Y** | `3` (1/100 inci = 0.76mm) | `PrintService.ts:726` (`printArgs[4] = '3'`) | **Hardcoded String** | **Defek Desain**: Nilai statis kompensasi vertical feed. |
| **Active Printer Target** | `'DS-RX1'` | `PrintService.ts:710` (`activePrinter`) | Fallback string | Terdeteksi via PnP EnumPrinters. |
| **2-Inch Cut Setting** | Driver Dependent | DNP Windows Driver Setting (DEVMODE) | Eksternal Driver | **Tidak Dikontrol Software Kiosk**. |
| **Paper Size di DB** | `'4R'` | `update-booth-config.dto.ts:156` | Schema Field | Hanya label string, tidak mengubah pipeline cetak. |
| **Printer Profile di DB** | `null` | `update-booth-config.dto.ts:154` | Schema Field | Belum dipetakan ke koordinat/offset/skala. |

---

## 4. Bedah Arsitektur `print.exe` (Disassembly & String Audit)

Berdasarkan ekstraksi string PE binary pada `apps/kiosk/resources/bin/dnp/print.exe`:

### 4.1 CLI Argument Vector
Utilitas `print.exe` adalah aplikasi console berbasis .NET (`System.Drawing.Printing.PrintDocument`) dengan spesifikasi sintaks command line:
```text
Usage: PrintApp.exe <image path> [copies] [scale%] [offsetX] [offsetY] [printer name] [second image path]
```
Slot parameter yang diterima oleh binary:
- `image`: Path absolut berkas citra (JPEG/PNG/BMP).
- `copies`: Jumlah salinan cetak (integer positif).
- `scale%`: Faktor skala gambar (persentase, misal `99` atau `100`).
- `offsetX`: Offset horizontal dalam satuan **1/100 inci** (hundredths of an inch).
- `offsetY`: Offset vertikal dalam satuan **1/100 inci** (hundredths of an inch).
- `printer`: Nama antrean printer Windows (misal `'DS-RX1'`).
- `second image path`: Path gambar kedua opsional.

### 4.2 Mode Khusus yang Didukung `print.exe`
Binary membaca penamaan printer untuk mode khusus:
1. **Custom Paper Detection**: Jika nama printer mengandung substring `'custom paper'` (case-insensitive), ukuran kertas user-defined pada driver dideteksi secara otomatis dan dipaksa via DEVMODE (`CUSTOM PAPER: forced mm -> (1/100in)`).
2. **Receipt Mode**: Jika nama printer mengandung substring `'receipt'`, beralih ke mode `StretchDIBits` di mana driver menangani halftoning.
3. **CD Label Mode**: Jika nama printer mengandung substring `'CD'`, menerapkan hardcoded offset untuk media cakram 120x120mm.
4. **Normal Mode (Standar Pictolabs)**: Menggunakan engine `GDI+ DrawImage` dengan target `PrintDocument` default.

### 4.3 Keterbatasan Satuan `print.exe`
- Satuan offset pada `print.exe` adalah **1/100 inci** (1 unit = 0.254 mm = 3 pixel pada 300 DPI).
- Contoh: Argumen `offsetY = '3'` berarti pergeseran sebesar $3 \times 0.254\text{ mm} = 0.762\text{ mm}$ (setara 9 pixel pada 300 DPI).
- Nilai `scale% = '99'` berarti gambar 1200x1800 diskalakan menjadi $1188 \times 1782\text{ px}$, menyisakan ruang margin kosong sekitar 6px di tiap sisi untuk mencegah pemotongan paksa oleh margin hardware driver.

---

## 5. Dukungan Aktual: 2R Photostrip vs 4R Postcard

Secara fisik, printer DNP DS-RX1 menggunakan **roll kertas 4x6 inci yang sama** (DNP RX1HS media roll berkapasitas 700 cetakan per roll) baik untuk 2R maupun 4R. Perbedaan esensial terletak pada pemetaan layout digital dan pemotongan mekanis:

| Dimensi Perbandingan | Format 2R Photostrip (Dual Strip) | Format 4R Postcard (Single Card) | Kesenjangan (Gap) |
| :--- | :--- | :--- | :--- |
| **Dimensi Canvas Digital** | 1200 x 1800 px (300 DPI) | 1200 x 1800 px (300 DPI) | Identik (4x6 inci). |
| **Jumlah Hasil Fisik** | **2 lembar strip 2x6 inci** (5x15 cm) | **1 lembar kartu pos 4x6 inci** (10x15 cm) | Memerlukan aksi potong mekanik berbeda. |
| **Jumlah Pose Foto** | 3 pose kamera (diduplikasi kiri & kanan) | 4 pose kamera (grid 2x2 unik) | Jumlah siklus capture kamera berbeda (3 vs 4). |
| **Garis Potong Tengah (Center Cut)** | **Wajib di-cut mekanis** pada $x = 600\text{ px}$ | **Dilarang di-cut** (harus utuh 4x6) | Kontrol pemotong pisau (cutter) printer. |
| **Ketersediaan di RenderEngine** | Tersedia (`DEFAULT_FRAMES['2R']`) | Tersedia (`DEFAULT_FRAMES['4R']`) | Keduanya sudah ada di `RenderEngine.ts`. |
| **Ketersediaan di UI Kiosk** | **Aktif & Dipaksa** di `ProductSelectScreen` | **Tidak Dapat Dipilih Pelanggan** | UI terkunci hanya pada produk `photostrip-2r`. |
| **Sensitivitas Terhadap Bleed & Cut** | **SANGAT TINGGI**: Jika roll geser 1mm, garis potong memakan foto atau meninggalkan garis putih. | **SEDANG**: Hanya mempengaruhi margin luar tepi kertas 4x6. | 2R membutuhkan kalibrasi offset ganda (tepi dan tengah). |
| **Uji Potong di Admin Panel** | Mengirim kotak polos 1200x600 px tanpa skala penggaris | Tidak ada opsi uji cetak 4R | Teknisi tidak bisa mengukur deviasi fisik. |

---

## 6. Pemetaan Desain Profil Printer dan Kalibrasi (PR-02)

Agar kompatibel dengan fondasi multi-booth PR-01, konfigurasi profil printer dan kalibrasi harus dirancang tanpa mengubah struktur database dasar, melainkan memanfaatkan envelope `BoothConfig.generalSettings` pada namespace `hardware`:

### 6.1 Usulan Skema Konfigurasi `hardware` (PR-02 Extension)

```typescript
export interface PrinterCalibrationProfile {
  // Profil Media Aktif
  mediaProfileId: '2R_DUAL_STRIP' | '4R_POSTCARD';
  
  // Parameter Kalibrasi Engine Dispatch (print.exe)
  scalePercent: number;     // Range: 95.0 s.d. 105.0 (Default: 99.0)
  offsetXUnits: number;     // Range: -50 s.d. +50 dalam 1/100 inci (Default: 0)
  offsetYUnits: number;     // Range: -50 s.d. +50 dalam 1/100 inci (Default: 3)
  
  // Parameter Margin & Bleed Canvas Render (RenderEngine)
  bleedTopPx: number;       // Default: 0
  bleedBottomPx: number;    // Default: 0
  bleedLeftPx: number;      // Default: 0
  bleedRightPx: number;     // Default: 0
  centerCutOffsetPx: number;// Pergeseran garis potong tengah dari 600px (-30 s.d. +30px)
  
  // Kontrol Hardware Driver
  enable2InchCut: boolean;  // true untuk 2R, false untuk 4R
}

// Integrasi ke dalam Canonical BoothConfigEnvelope:
export interface HardwareConfigEnvelope {
  cameraProfileId: string | null;
  printerProfileId: string | null; // e.g. 'DNP_DS_RX1'
  mirrorViewfinder: boolean;
  paperSize: '2R' | '4R';
  printerCalibration: PrinterCalibrationProfile;
}
```

### 6.2 Alur Persistensi dan Isolasi Per-Booth
1. **Server-Side PostgreSQL**:
   Tersimpan di kolom JSON `BoothConfig.generalSettings` milik masing-masing `boothId`. Setiap perubahan kalibrasi menaikkan `configVersion` secara monotonik.
2. **WebSocket & REST Delivery**:
   Backend menyiarkan `CONFIG_UPDATE` hanya ke room booth terkait (`booth:${boothId}`).
3. **Kiosk Local Storage & DPAPI**:
   Kiosk menyimpan nilai kalibrasi ke `%ProgramData%\Pictolabs\kiosk-config.json` via write atomik (tmp + rename).
4. **Zero-Latency Hydration**:
   Saat booting cold launch, `SyncEngine` membaca cache lokal secara instan (<1ms), menjamin printer langsung menggunakan parameter kalibrasi booth fisik tersebut tanpa menunggu koneksi cloud.

---

## 7. Analisis Risiko Regresi Terhadap Pipeline RCA-7

Pipeline cetak Pictolabs saat ini memiliki stabilitas tinggi setelah penyederhanaan RCA-7 dan telah lulus pengujian fisik 10 skenario perangkat keras oleh Founder. Setiap modifikasi pada PR-02 membawa risiko berikut:

| Area Risiko | Deskripsi Risiko | Dampak Potensial | Mitigasi Wajib (RCA-7 Invariant) |
| :--- | :--- | :--- | :--- |
| **Spawning Multipoint `print.exe`** | Menambahkan pemanggilan `print.exe` baru di luar `PrintService.printImage` untuk kalibrasi. | Merusak invariant arsitektur: Exactly ONE spawn point. Risiko tumpang tindih proses. | **Wajib**: Semua pencetakan pola kalibrasi harus tetap melalui antrean tunggal `PrintService.printImage`. |
| **USB Bus Collision** | Menjalankan probe `PhotolabDNP.exe` saat cetak kalibrasi berlangsung. | Driver DNP Windows USB terkunci, `print.exe` return error 0x01. | **Wajib**: Menjaga lifecycle lock `setPrintDispatchActive(true)` selama pencetakan kalibrasi. |
| **Watchdog Hang Timeout** | Waktu pemrosesan citra kalibrasi melebihi batas watchdog. | Watchdog menandai job `DEAD_LETTER` dan membunuh proses cetak. | **Wajib**: Image pattern kalibrasi harus digenerate sebelum masuk antrean cetak; timeout `print.exe` tetap 30s. |
| **Kerusakan Pemotongan Pisau Mekanik (Cutter Jam)** | Perintah 2-inch cut dikirim saat memuat media non-cut atau orientasi salah. | Pisau pemotong DNP macet atau merusak roll ribbon. | **Wajib**: Validasi profil media dan sinkronisasi driver DNP sebelum mengeksekusi cut. |
| **White Edge Artifacts** | Nilai scale/offset yang salah menyebabkan batas tepi putih melebar atau foto terpotong. | Kualitas cetak pelanggan menurun drastis. | **Wajib**: Menyediakan tombol "Reset to Factory Defaults" (`scale: 99, offX: 0, offY: 3`). |

---

## 8. Klasifikasi Fakta, Pengujian, Asumsi, dan Pengukuran Fisik

Untuk memastikan integritas teknis tanpa rekayasa data (*zero fabrication*):

### A. Fakta Kode (Code Facts - 100% Terverifikasi di Source Code)
1. `RenderEngine.ts` menghasilkan canvas berukuran tepat **1200 x 1800 px** pada **300 DPI** untuk semua frame (`2R`, `4R`, `6R`).
2. `RenderEngine.ts` menempatkan garis potong tengah untuk frame 2R tepat di koordinat horizontal **$x = 600\text{ px}$**.
3. `PrintService.ts` mengirimkan argumen hardcoded statis: `scale = '99'`, `offsetX = '0'`, `offsetY = '3'` ke `print.exe`.
4. `print.exe` adalah executable .NET yang menerima satuan offset dalam **1/100 inci** (hundredths of an inch).
5. `AdminScreen.tsx` hanya memiliki satu tombol uji potong (`printer:cut-test`) yang mencetak kotak abu-abu polos 1200x600 px tanpa penanda koordinat/skala.
6. `BoothConfigEnvelope.hardware` pada backend saat ini hanya memiliki field `paperSize` dan `printerProfileId` tanpa parameter kalibrasi offset/scale.

### B. Bukti Pengujian (Test Evidence - Terverifikasi Melalui Eksekusi Tes)
1. `test_pr01_booth_config_foundation.mjs`: 22/22 PASS (isolasi konfigurasi per-booth dan hidrasi lokal).
2. `rca7-simplification.spec.ts`: Invariant tunggal pemanggilan `print.exe` dan deteksi status spooler terbukti lulus 100%.
3. `printer-failure-hardening.spec.ts`: Profil hardware discovery `DS-RX1`, `Citizen CX-02`, dan `HiTi P525L` terbukti dikenali via PnP string matcher.

### C. Asumsi (Working Hypotheses - Belum Terbukti Mutlak Secara Kode)
1. **Asumsi Pengendalian Cutter**: Diasumsikan bahwa opsi pemotongan 2-inci (*2-inch cut*) pada DNP DS-RX1 dikendalikan melalui konfigurasi driver printer Windows (DEVMODE / Print Preferences) atau nama antrean khusus, bukan melalui argumen baris perintah `print.exe` langsung.
2. **Asumsi Konsumsi Kertas**: Diasumsikan bahwa format 4R dapat langsung dicetak pada roll media DNP RX1HS 4x6 inci yang sama tanpa perlu mengganti roll fisik, hanya dengan mematikan fitur pemotongan 2-inci pada driver.

### D. Parameter yang Memerlukan Pengukuran Fisik Lapangan (Physical Measurements on Booth #1)
Nilai-nilai berikut **TIDAK BOLEH DIASUMSIKAN ATAU DIKARANG**, melainkan wajib diukur secara fisik oleh Founder/Teknisi pada Booth #1:
1. **Deviasi Fisik Pemotongan Pisau Tengah**: Jarak pergeseran aktual (dalam milimeter) antara pisau pemotong DNP fisik terhadap titik tengah teoritis kertas ($50.8\text{ mm}$ atau $600\text{ px}$).
2. **Margin Tepi Mekanis Rol Kertas**: Lebar batas putih (*white edge sliver*) yang muncul di tepi kiri/kanan saat menggunakan roll baru atau setelah penggantian roll ribbon.
3. **Offset Mekanis Feed Vertikal**: Pergeseran feed kertas vertikal saat awal cetak yang mendasari pemilihan nilai default historis `offsetY = 3` ($0.76\text{ mm}$).
4. **Metode Pengalihan 2R/4R pada Driver DNP**: Apakah driver DNP di Windows Kiosk dikonfigurasi sebagai 2 antrean terpisah (misal: `"DS-RX1 (2-inch Cut)"` dan `"DS-RX1 (Standard 4x6)"`), atau menggunakan satu antrean dengan manipulasi DEVMODE.

---

## 9. Pertanyaan yang Membutuhkan Keputusan Founder

Sebelum implementasi teknis PR-02 dibuka, terdapat 4 keputusan arsitektural yang membutuhkan arahan Founder:

1. **Strategi Pengalihan Driver 2R vs 4R di Windows**:
   - *Opsi A (Recommended)*: Menggunakan dua antrean printer Windows terpisah pada Kiosk OS, misal: `DS-RX1-Strip` (driver diset 2-inch cut Enabled) dan `DS-RX1-Postcard` (driver diset 2-inch cut Disabled). Software Kiosk hanya mengarahkan argumen `printerName` pada `print.exe` sesuai produk yang dipilih.
   - *Opsi B*: Menggunakan satu antrean printer dan mengubah setting DEVMODE Windows Spooler secara dinamis via Win32 API / PowerShell sebelum setiap pencetakan (berisiko race condition dan lambat).
   - **Keputusan Founder Dibutuhkan:** Opsi A atau Opsi B?

2. **Dukungan Produk 4R Postcard pada Customer Journey**:
   - Apakah Kiosk UI (`ProductSelectScreen.tsx`) akan diaktifkan untuk mengizinkan pelanggan memilih antara 2R Photostrip dan 4R Postcard pada peluncuran Pilot Booth #1, ataukah 4R hanya disiapkan di level engine/kalibrasi sementara UI tetap 2R-only untuk Pilot Booth #1?
   - **Keputusan Founder Dibutuhkan:** Aktifkan 2R & 4R di UI pelanggan, atau 2R-only untuk Pilot Booth #1?

3. **Satuan Kalibrasi pada Antarmuka Operator (Admin Panel)**:
   - Apakah slider/input kalibrasi di Admin Panel ditampilkan dalam satuan **Milimeter (mm)** (lebih ramah teknisi/penggaris), atau dalam satuan asli `print.exe` (**1/100 inci**), atau **Pixel (px)**?
   - *(Rekomendasi teknis: Tampilkan Milimeter di UI Operator dengan konversi otomatis $1\text{ mm} \approx 3.94\text{ units}$ ke 1/100 inci untuk `print.exe`)*.
   - **Keputusan Founder Dibutuhkan:** Setuju dengan konversi mm di UI?

4. **Desain Uji Kalibrasi Cetak (Calibration Sheet)**:
   - Apakah setuju mengganti fungsi kotak abu-abu polos pada `printer:cut-test` menjadi **Pola Uji Kalibrasi Presisi** (menampilkan penggaris milimeter di 4 sisi tepi, penanda garis tengah $600\text{ px}$, dan kotak acuan potong) agar teknisi dapat mengukur pergeseran fisik secara akurat?
   - **Keputusan Founder Dibutuhkan:** Setuju pembuatan pola kalibrasi presisi?

---

## 10. Rekomendasi Urutan Implementasi & Acceptance Criteria

Jika Founder menyetujui hasil audit ini, implementasi PR-02 direkomendasikan berjalan dalam 5 langkah berurutan:

```text
[Langkah 1: Skema & DTO] ──► [Langkah 2: Engine Generator Pola] ──► [Langkah 3: Service Dispatch Dinamis]
                                                                               │
[Langkah 5: Founder Physical UAT] ◄── [Langkah 4: UI Admin Panel Kalibrasi] ◄──┘
```

1. **Langkah 1 (Backend & Shared DTO)**: Perluas `HardwareConfigDto` dan `BoothConfigEnvelope` dengan `printerCalibration` (scale, offsetX, offsetY, bleed, mediaProfile). Tambahkan validasi batas numerik aman.
2. **Langkah 2 (Pola Cetak Presisi di RenderEngine)**: Implementasikan generator citra pola kalibrasi (`generateCalibrationPattern(width, height)`) dengan kisi grid milimeter dan tanda garis potong tengah.
3. **Langkah 3 (Parameter Dinamis di PrintService)**: Hubungkan `printImage()` ke konfigurasi kalibrasi booth aktif yang terhidrasi di `SyncEngine` / `kiosk-config.json`, menggantikan nilai hardcoded `'99'`, `'0'`, `'3'`. Pertahankan invariant tunggal spawn point RCA-7.
4. **Langkah 4 (UI Operator di AdminScreen)**: Bangun panel interaktif di Admin Panel Kiosk:
   - Tombol "Cetak Lembar Kalibrasi".
   - Kontrol geser Offset X, Offset Y, dan Skala %.
   - Tombol "Simpan Kalibrasi ke Booth" (mengupdate cache lokal & sinkronisasi ke backend).
   - Tombol "Reset Default Pabrik".
5. **Langkah 5 (Founder Physical UAT pada Booth #1)**:
   - Cetak lembar kalibrasi pada DNP DS-RX1 fisik.
   - Ukur hasil dengan penggaris.
   - Lakukan penyesuaian offset X/Y untuk menghilangkan garis putih tepi dan memastikan pisau memotong tepat di tengah $50.8\text{ mm}$.
   - Uji restart kiosk untuk membuktikan persistensi nilai kalibrasi.

### Acceptance Criteria Kanonis PR-02 (Sebagai Acuan Penutupan Nanti):
- [ ] Operator dapat memilih profil media 2R atau 4R.
- [ ] Lembar cetak uji kalibrasi mencetak pola kisi acuan perataan (alignment grid) dan skala ukur.
- [ ] Penyesuaian offset X/Y dan skala berhasil mengeliminasi cacat garis putih (*white edges*) pada hasil cetak fisik.
- [ ] Nilai kalibrasi tersimpan secara persisten per-booth dan bertahan melintasi restart/reboot Kiosk.
- [ ] Seluruh pengujian regresi RCA-7 (10/10) tetap PASS tanpa menimbulkan duplikasi cetak atau tabrakan USB.

---
**Status Audit:** READ-ONLY AUDIT SELESAI. Menunggu review dan arahan keputusan dari Founder sebelum memulai coding.
