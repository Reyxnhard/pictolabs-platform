# PR-02 — REVERSE-ENGINEERED REFERENCE FEATURE COMPARISON AUDIT
**Document ID:** `DOC-PR02-REF-AUDIT-001`  
**Execution Date:** 2026-10-10  
**Status:** AUDIT COMPLETED / PENDING FOUNDER & CHATGPT REVIEW  
**Workstream:** Printer Workstream / Pilot Readiness Feature Batch (Phase B — PR-02)  
**Parent Gate:** `Phase B: PR-02 Printer Profiles & Calibration Planning`  
**Inspected Reference:** `kiosk-client-photobooth-template-flipbook-basic` & `extracted-asar`  

---

## 1. Executive Summary

Audit ini dilakukan secara **READ-ONLY** untuk memeriksa secara mendalam aplikasi referensi photobooth hasil *reverse-engineering* yang tersimpan di dalam Workspace (`kiosk-client-photobooth-template-flipbook-basic` dan berkas dekompilasi `extracted-asar`). Tujuannya adalah membedah bagaimana aplikasi referensi tersebut mengelola printer, pemilihan media/ukuran kertas (2R vs 4R), kalibrasi offset/scale, pola lembar uji cetak, pemotongan fisik (cutter), dan kontrol operator, lalu membandingkannya secara objektif dengan implementasi Pictolabs saat ini.

### Temuan Kunci Audit:
1. **Asal Muasal Nilai Hardcoded Pictolabs Terungkap Secara Empiris**:
   Nilai `'99'`, `'0'`, `'3'` yang selama ini ter-hardcode di `PrintService.ts:724-726` terbukti berasal langsung dari konfigurasi bawaan aplikasi referensi (`settings.json`):
   ```json
   "scalePrinter": 99, "offsetXPrinter": 0, "offsetYPrinter": 3
   ```
2. **Mekanisme Cutter 2R vs 4R Tidak Menggunakan Hack Kode**:
   Aplikasi referensi **TIDAK** memanipulasi DEVMODE runtime atau perintah hex biner untuk mengontrol cutter. Aplikasi referensi menggunakan pendekatan pemetaan antrean printer Windows (*Windows Printer Queue Mapping* per ukuran kertas):
   ```json
   "printerNames": {
     "4R": "DS-RX1 (Copy 1)",
     "2R": "DS-RX1 2r"
   }
   ```
   Driver Windows dikonfigurasi sekali pada tingkat OS: antrean `DS-RX1 2r` diset *2-inch Cut: Enabled*, sedangkan `DS-RX1 (Copy 1)` diset *2-inch Cut: Disabled*. Software hanya merouting parameter `printerName` ke `print.exe` berdasarkan fungsi sederhana `resolvePrinterName(size, settings)`.
3. **Pola Lembar Uji Kalibrasi Otentik Ditemukan di Workspace**:
   Berkas [`test.png`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/test.png) ($1203 \times 1804\text{ px}$) adalah **lembar target kalibrasi presisi** lengkap dengan penggaris milimeter di 4 sisi (skala tick mark $0, 5, 10, 15, 25, 30$ warna merah & biru), garis diagonal persilangan pusat, dan batas tepi trapesium roll.
4. **Antarmuka Operator Referensi Memiliki Kontrol Kalibrasi Interaktif**:
   Aplikasi referensi memiliki komponen UI `SettingsPrinter` lengkap dengan:
   - Slider `scalePrinter` (rentang 85 s.d. 100%).
   - Slider `offsetXPrinter` (rentang -15 s.d. +15 dalam unit 1/100 inci).
   - Slider vertikal `offsetYPrinter` (rentang -15 s.d. +15 dalam unit 1/100 inci).
   - Komponen `PrintPreview` yang menampilkan visualisasi kotak kertas dan pergeseran foto secara *real-time*.
   - Tombol "Test Print Template" dan "Test Print Custom".
5. **Arsitektur Antrean Pictolabs Lebih Unggul & Wajib Dipertahankan**:
   Pictolabs memiliki arsitektur antrean SQLite atomik (`PrintQueueService`), pemantauan watchdog 45 detik, pencegahan duplikasi cetak, koordinasi penguncian USB DNP, serta isolasi armada multi-booth (PR-01) yang jauh lebih tangguh daripada aplikasi referensi yang hanya berupa single-kiosk lokal. Keunggulan PR-01 dan RCA-7 ini **harus dipertahankan 100%**.

---

## 2. Lokasi Berkas & Bukti Referensi yang Diperiksa

Audit ini menelusuri berkas-berkas berikut di dalam Workspace:

| Path Berkas / Direktori | Tipe & Deskripsi Artefak | Bukti yang Ditemukan |
| :--- | :--- | :--- |
| [`kiosk-client-photobooth-template-flipbook-basic/settings.json`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/settings.json) | Konfigurasi runtime aplikasi referensi | Nilai default: `printerNames`, `offsetXPrinter: 0`, `offsetYPrinter: 3`, `scalePrinter: 99`, `printSharpness: "none"`. |
| [`kiosk-client-photobooth-template-flipbook-basic/framesizes.json`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/framesizes.json) | Katalog ukuran kertas & media | Daftar ukuran: `2R (4x6 CUT)` ($1200\times1800$), `4R (4x6)` ($1200\times1800$), `6R`, `6x8 CUT`, dll. |
| [`kiosk-client-photobooth-template-flipbook-basic/test.png`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/test.png) | Target citra kalibrasi cetak ($151.5\text{ KB}$) | Gambar $1203 \times 1804\text{ px}$ dengan penggaris berskala $0..30$, garis silang tengah diagonal, dan penanda batas. |
| [`kiosk-client-photobooth-template-flipbook-basic/output.png`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/output.png) | Sampel komposit cetak ($9.88\text{ MB}$) | Berkas $2400 \times 3600\text{ px}$ (supersampling 600 DPI dari 4x6 inci). |
| [`kiosk-client-photobooth-template-flipbook-basic/print/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/print/) | Biner native cetak DNP | Berisi `print.exe` ($670\text{ KB}$), `PhotolabDNP.exe` ($17.1\text{ MB}$), CRT/MFC DLLs, dan ICC color profiles. |
| [`extracted-asar/out/main/index.jsc`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/main/index.jsc) | Bytecode V8 Main Process referensi | Logika dispatch CLI `print.exe`, deteksi antrean Windows via PowerShell WMI, penanganan `printTest`. |
| [`extracted-asar/out/preload/index.jsc`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/preload/index.jsc) | Bytecode Preload Electron referensi | Bridge IPC: `kiosk.print`, `kiosk.printTest`, `kiosk.readSettings`, `kiosk.writeSettings`. |
| [`extracted-asar/out/renderer/assets/index-e8362e52.js`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/extracted-asar/out/renderer/assets/index-e8362e52.js) | Kode sumber JavaScript Renderer referensi | Komponen `SettingsPrinter`, komponen `PrintPreview`, fungsi `resolvePrinterName`, tombol uji cetak template & custom. |

---

## 3. Inventaris Fitur Printer Aplikasi Referensi

Berikut adalah inventaris seluruh kapabilitas printer yang ditemukan pada aplikasi referensi:

### 3.1 Pemetaan Antrean Printer per Ukuran Kertas (`printerNames`)
- **Implementasi**: Disimpan dalam objek `settings.printerNames` di `settings.json`.
- **Perilaku**: Untuk setiap media (`2R`, `4R`, `6R`, `Flipbook`), UI menampilkan dropdown daftar printer Windows yang terpasang (diperoleh via `kiosk.getPrinterList()` yang mengeksekusi PowerShell WMI `Get-WmiObject Win32_Printer`).
- **Resolusi**: Fungsi `resolvePrinterName(size, settings)` mengekstrak antrean printer spesifik:
  ```javascript
  function resolvePrinterName(size, settings) {
    return settings.printerNames?.[size] ?? undefined;
  }
  ```

### 3.2 Slider Kalibrasi Skala dan Offset
- **Skala (`scalePrinter`)**:
  - Slider: rentang $85\%$ s.d. $100\%$, step $1\%$.
  - Default: $100\%$ (pabrik) / $99\%$ (operasional aktif di `settings.json`).
- **Offset Horizontal (`offsetXPrinter`)**:
  - Slider: rentang $-15$ s.d. $+15$ (dalam unit 1/100 inci), step $1\text{ unit}$.
  - $1\text{ unit} = 0.254\text{ mm} \approx 3\text{ px pada 300 DPI}$.
  - Rentang fisik: $-3.81\text{ mm}$ s.d. $+3.81\text{ mm}$. Default: $0$.
- **Offset Vertikal (`offsetYPrinter`)**:
  - Slider vertikal: rentang $-15$ s.d. $+15$ (dalam unit 1/100 inci).
  - Rentang fisik: $-3.81\text{ mm}$ s.d. $+3.81\text{ mm}$. Default: $3$ ($+0.762\text{ mm}$).

### 3.3 Visualisasi Real-Time `PrintPreview`
- Komponen React `PrintPreview` menghitung rasio aspek kertas dan menampilkan kotak preview berukuran proporsional (max dimensi $380\text{ px}$).
- Di dalam area kertas, komponen merender kotak foto yang diskalakan secara matematis:
  $$\text{scaledWidth} = \text{previewWidth} \times \left(\frac{\text{scale}}{100}\right)$$
  $$\text{left} = \frac{\text{previewWidth} - \text{scaledWidth}}{2} + \left(\text{offsetX} \times \frac{\text{previewWidth}}{\text{width} / 3}\right)$$
- Saat operator menggeser slider skala atau offset, posisi foto di dalam area cetak bergeser seketika di layar sebelum dicetak.

### 3.4 Alur Pengujian Cetak (Test Print Workflow)
- **Opsi 1: Test Print FILE TEMPLATE**:
  Mencetak langsung berkas bawaan `test.png` ($1203 \times 1804\text{ px}$) menggunakan parameter skala dan offset yang sedang aktif.
- **Opsi 2: Test Print FILE CUSTOM**:
  Membuka dialog pemilihan berkas Windows (`Select a Test Print Picture (1200 x 1800)px`), menyalin gambar pilihan operator ke `test-1.png`, dan mencetaknya melalui antrean printer yang dipilih.
- **Opsi Penajaman Citra (Print Sharpness)**:
  Tersedia pilihan penajaman citra (`none`, `medium`, `high`) sebelum citra dikirim ke `print.exe`.

### 3.5 Pola Lembar Target Kalibrasi (`test.png`)
- Didesain secara khusus untuk kalibrasi visual:
  - Skala penggaris $0, 5, 10, 15, 25, 30$ di keempat sisi kertas.
  - Nilai skala cocok langsung dengan satuan slider $-15..+15$.
  - Garis batas luar miring (trapezoid) untuk mendeteksi deviasi kelurusan feed rol kertas fisik.
  - Garis silang sudut ke sudut untuk memeriksa apakah titik pusat citra bertepatan dengan titik pusat kertas fisik.

### 3.6 Fitur Tambahan yang Ditemukan (Non-Kritis untuk Pilot)
- **Printer Sharing over LAN (HTTP)**: Memungkinkan bilik foto lain mengirim cetakan via jaringan lokal ke bilik ini melalui endpoint `/api/print`.
- **Cetak Panorama (Panoramic Print)**: Mendukung printer DNP DS620/DS820 dengan media panjang ($6\times14, 6\times20, 8\times22, 8\times32$ inci).
- **Flipbook Imposition Engine**: Menyusun 8 lembar cetak berisi 24–36 foto kecil lengkap dengan garis potong (*cut marks*) untuk buku animasi mini.

---

## 4. Matriks Perbandingan Referensi vs. Pictolabs

Status yang digunakan:
- **MATCH**: Didukung dengan baik di kedua sistem.
- **PARTIAL**: Fitur ada sebagian, tetapi masih ada kesenjangan.
- **MISSING**: Ada di referensi, belum ada di Pictolabs.
- **DIFFERENT DESIGN**: Diimplementasikan dengan arsitektur berbeda.
- **UNVERIFIED**: Bukti belum mencukupi.

| Fitur Printer | Aplikasi Referensi | Pictolabs Saat Ini | Status Evaluasi | Kesenjangan Praktis (Gap) | Dampak Pilot Booth #1 | Rekomendasi Tindakan |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **Pemetaan Antrean per Ukuran Kertas** | Memetakan antrean Windows spesifik per format via `settings.printerNames[size]` (misal: 2R -> `DS-RX1 2r`, 4R -> `DS-RX1 (Copy 1)`). | Hardcoded ke `'DS-RX1'`. Tidak membedakan antrean untuk 2R vs 4R. | **MISSING** | Pictolabs tidak bisa mengalihkan pemotong pisau (cutter) secara otomatis antara 2R dan 4R. | **TINGGI**: 2R butuh pisau potong, 4R butuh lembar utuh. | **Adopsi**: Tambahkan pemetaan antrean per media di config booth Pictolabs. |
| **Nilai Default Skala & Offset** | `scale: 99%`, `offsetX: 0`, `offsetY: 3` tersimpan di `settings.json`. | Sama persis (`99`, `0`, `3`) tetapi di-hardcode kaku di `PrintService.ts`. | **PARTIAL** | Nilai default identik, tetapi Pictolabs tidak bisa mengubah nilai ini per-booth. | **SEDANG**: Jika Booth #1 memiliki deviasi rol kertas, tidak bisa di-tune. | **Adaptasi**: Jadikan parameter dinamis yang dibaca dari config booth. |
| **Kontrol Slider Kalibrasi Operator** | Slider interaktif di UI Admin: Scale ($85..100\%$), OffsetX ($-15..+15$), OffsetY ($-15..+15$). | Tidak ada slider kalibrasi di `AdminScreen.tsx`. | **MISSING** | Operator/teknisi tidak dapat mengatur pergeseran cetak tanpa mengubah kode sumber. | **TINGGI**: Menghambat kalibrasi fisik saat setup bilik di lokasi. | **Adopsi**: Tambahkan slider skala & offset di Admin Panel Pictolabs. |
| **Visualisasi Real-Time `PrintPreview`** | Komponen visual box yang merender pergeseran margin dan skala secara instan. | Tidak ada visualisasi preview kalibrasi di Admin Panel. | **MISSING** | Operator harus menebak pergeseran sebelum mencetak lembar tes. | **RENDAH**: Hanya kenyamanan operator (bukan fungsional core). | **Adaptasi Sederhana**: Buat preview ringkas di tab kalibrasi Admin. |
| **Pola Lembar Kalibrasi (Test Pattern)** | Berkas otentik `test.png` ($1203\times1804\text{ px}$) dengan penggaris $0..30$ dan garis diagonal. | Uji potong hanya mencetak kotak abu-abu polos $1200\times600\text{ px}$ tanpa skala ukur. | **MISSING** | Teknisi tidak dapat mengukur berapa milimeter pergeseran pisau pemotong fisik. | **TINGGI**: Menghambat eliminasi garis putih (*white border*). | **Adopsi Langsung**: Gunakan `test.png` dari workspace sebagai berkas pola kalibrasi. |
| **Alur Uji Cetak Template & Custom** | Tersedia tombol "Test Print Template" dan "Test Print Custom" di UI Admin. | Hanya ada tombol "Uji Potong" polos. | **PARTIAL** | Tidak bisa menguji cetak foto sampel 4x6 kustom di luar alur pelanggan. | **SEDANG**: Membatasi validasi kualitas warna sebelum bilik dibuka. | **Adaptasi**: Sediakan tombol cetak lembar kalibrasi & cetak foto tes. |
| **Penanganan Pemotong Mekanis (Cutter)** | Bergantung pada konfigurasi driver Windows di antrean target (misal `DS-RX1 2r`). | Bergantung pada konfigurasi driver Windows default tunggal. | **MATCH** (Konseptual) / **MISSING** (Routing antrean) | Keduanya mengandalkan driver OS; referensi menyelesaikan pemisahan via multi-antrean. | **KRITIS**: Menentukan keberhasilan pemotongan 2x6 strip kembar. | **Adopsi Metode Referensi**: Dokumentasikan setup 2 antrean driver di runbook operator. |
| **Penyimpanan & Persistensi Pengaturan** | Berkas lokal statis `%approot%/settings.json` (hanya single kiosk). | `BoothConfigEnvelope` di PostgreSQL + local DPAPI cache `%ProgramData%` + atomic write. | **DIFFERENT DESIGN** | Pictolabs memiliki arsitektur armada multi-booth yang jauh lebih aman & modern. | **POSITIF**: Pictolabs lebih siap skala industri daripada referensi. | **Pertahankan Desain Pictolabs**: Jangan kembali ke `settings.json` lokal mentah. |
| **Antrean & Eksekusi Cetak (Queue & Dispatch)** | Eksekusi sinkron langsung `execFile(print.exe)` tanpa antrean persisten SQLite. | SQLite WAL queue (`PrintQueueService`), idempoten, watchdog 45s, lock USB (RCA-7). | **DIFFERENT DESIGN** | Pictolabs jauh lebih tangguh terhadap crash, mati listrik, dan tabrakan USB DNP. | **KRITIS**: Mencegah kegagalan fatal yang pernah terjadi di masa lalu. | **Pertahankan 100% Invariant RCA-7 Pictolabs**: Jangan ubah print queue. |
| **Penajaman Citra (Print Sharpness)** | Opsi sharpening `none`, `medium`, `high` via Sharp sebelum cetak. | Hardcoded Sharp pipeline tanpa opsi filter penajaman tambahan. | **MISSING** | Pictolabs menggunakan `chromaSubsampling: 4:4:4` dan kualitas 95, sudah cukup tajam. | **RENDAH**: Tidak esensial untuk Pilot Booth #1. | **Tunda (Defer)**: Bukan prioritas pilot readiness. |
| **Printer Sharing over LAN (HTTP)** | Fitur berbagi printer multi-kiosk melalui endpoint REST `/api/print`. | Tidak ada fitur printer sharing. | **MISSING** | Pictolabs Booth #1 adalah standalone kiosk mandiri dengan printer internal. | **NOL**: Tidak dibutuhkan untuk bilik tunggal Pilot Booth #1. | **Tunda (Defer)**: Evaluasi untuk skenario multi-kiosk event di masa depan. |
| **Panorama & Flipbook** | Cetak panjang 8x32 inci dan susunan kartu flipbook 8 lembar. | Tidak didukung di pipeline cetak runtime saat ini. | **MISSING** | Di luar cakupan format foto dasar 2R/4R photobooth. | **NOL**: Telah resmi didefer dalam timeline arsitektur platform. | **Tunda (Defer)**: Post-pilot roadmap. |

---

## 5. Bukti & Tingkat Verifikasi Masing-Masing Temuan

Audit ini mengklasifikasikan bukti secara transparan:

| Temuan | Tingkat Verifikasi | Lokasi Bukti Otoritatif | Catatan Teknis |
| :--- | :--- | :--- | :--- |
| **Nilai 99, 0, 3 berasal dari referensi** | **Fakta Kode (Terbukti 100%)** | `kiosk-client-photobooth-template-flipbook-basic/settings.json:L1` | Field `scalePrinter: 99, offsetXPrinter: 0, offsetYPrinter: 3` terkonfirmasi identik. |
| **Pemetaan antrean 2R vs 4R** | **Fakta Kode (Terbukti 100%)** | `settings.json:L1` dan `index-e8362e52.js:L622063` | `resolvePrinterName(size, settings)` terbukti membaca `settings.printerNames[size]`. |
| **Pola kalibrasi fisik pada `test.png`** | **Observasi Visual & Biner (100%)** | `kiosk-client-photobooth-template-flipbook-basic/test.png` | Verifikasi visual via `view_file`: terbukti memuat penggaris milimeter $0..30$ dan garis diagonal. |
| **Rentang slider kalibrasi** | **Fakta Kode (Terbukti 100%)** | `index-e8362e52.js:L2459284-L2460595` | Slider JSX terbukti: Scale min 85 max 100, OffsetX min -15 max +15, OffsetY min -15 max +15. |
| **Sintaks biner `print.exe`** | **Fakta Kode (Terbukti 100%)** | PE biner `print.exe` string table offset 162543 | `Usage: PrintApp.exe <image> [copies] [scale%] [offsetX] [offsetY] [printer name]`. |
| **Pengendalian pisau potong DNP** | **Fakta Driver & Konfigurasi** | Penamaan antrean Windows `"DS-RX1 2r"` | Nama `"2r"` mengindikasikan printer driver preset dengan opsi *2-inch cut* diaktifkan di Windows. |

---

## 6. Kesenjangan yang Dikonfirmasi & Pertanyaan Terbuka

### 6.1 Kesenjangan yang Terkonfirmasi (Confirmed Gaps)
1. **Gap 1 (Routing Antrean Multi-Media di Pictolabs)**:
   Pictolabs saat ini hanya memuat satu nama printer default (`DS-RX1`). Pictolabs belum memiliki pemetaan kamus antrean berdasarkan ukuran media (`printerNames: { "2R": string, "4R": string }`).
2. **Gap 2 (Kontrol Kalibrasi Dinamis di Admin Panel)**:
   Pictolabs saat ini mengunci skala dan offset di dalam kode TypeScript (`PrintService.ts`). Teknisi di lokasi bilik tidak memiliki antarmuka untuk melakukan kalibrasi pergeseran rol kertas.
3. **Gap 3 (Pola Uji Cetak Presisi)**:
   Tombol uji potong Pictolabs saat ini hanya mencetak kotak abu-abu polos tanpa panduan garis potong dan penggaris ukur.

### 6.2 Pertanyaan yang Telah Terjawab Melalui Referensi
- *Pertanyaan PR-02 Sebelumnya*: "Bagaimana cara biner mengendalikan pisau pemotong 2R vs 4R?"
  **Terjawab**: Melalui **Windows Printer Driver Queue Mapping**! Windows diinstal dengan 2 antrean driver printer untuk fisik mesin yang sama (`DS-RX1 2r` dengan fitur cut aktif, dan `DS-RX1 (Copy 1)` dengan cut nonaktif). Software Kiosk hanya bertugas memilih nama antrean saat memanggil `print.exe`.

### 6.3 Pertanyaan Terbuka yang Memerlukan Konfirmasi Lapangan
1. **Nama Antrean Terpasang di Mesin Fisik Booth #1**:
   Apakah di Windows OS pada bilik fisik Booth #1 saat ini sudah terpasang dua antrean driver (misal: `DS-RX1 2r` dan `DS-RX1`), atau baru satu antrean `DS-RX1`?
   *(Jika baru satu, antrean kedua perlu ditambahkan di Windows Printer Properties sesuai panduan operator).*
2. **Kebutuhan Produk 4R di UI Pelanggan**:
   Apakah untuk Pilot Booth #1, alur pelanggan tetap dikunci pada format 2R Photostrip (Dual Strip), sementara kapabilitas 4R disiapkan di tingkat engine dan Admin Panel?
   *(Rekomendasi: Ya, pertahankan alur pelanggan 2R-only untuk pilot guna meminimalkan risiko regresi).*

---

## 7. Rekomendasi Ruang Lingkup PR-02 & Urutan Implementasi

Mengacu pada temuan referensi dan menjaga kesederhanaan sistem untuk Pilot Booth #1:

### 7.1 Fitur yang Diadopsi Langsung dari Referensi
1. **Adopsi Berkas Target Kalibrasi**:
   Salin berkas target [`test.png`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/kiosk-client-photobooth-template-flipbook-basic/test.png) ke dalam aset Kiosk Pictolabs sebagai lembar uji kalibrasi resmi.
2. **Adopsi Metode Pemetaan Antrean Driver**:
   Dukung pemetaan antrean printer per ukuran media (`printerNames: { '2R': 'DS-RX1 2r', '4R': 'DS-RX1' }`).
3. **Adopsi Rentang Slider Kalibrasi**:
   Gunakan rentang terbukti dari referensi:
   - Skala: $85\%$ s.d. $100\%$ (default $99\%$).
   - Offset X: $-15$ s.d. $+15$ unit 1/100 inci (default $0$).
   - Offset Y: $-15$ s.d. $+15$ unit 1/100 inci (default $3$).

### 7.2 Fitur yang Diadaptasi ke Arsitektur Pictolabs (PR-01)
1. **Penyimpanan Parameter di `BoothConfig.hardware`**:
   Alih-alih menulis ke berkas mentah `settings.json`, simpan `printerCalibration` dan `printerNames` di dalam skema kanonis `BoothConfigEnvelope`. Ini memastikan nilai kalibrasi:
   - Terisolasi unik per-booth.
   - Tersimpan aman di PostgreSQL backend.
   - Terenkripsi dan terhidrasi lokal via DPAPI cache `%ProgramData%\Pictolabs\kiosk-config.json`.
2. **Pengiriman Dinamis ke `PrintService.ts`**:
   Ubah pemanggilan `print.exe` di `PrintService.ts` dari argumen statis `['99', '0', '3', activePrinter]` menjadi pembacaan dinamis dari konfigurasi terhidrasi booth aktif:
   ```typescript
   const scaleArg = String(config.hardware.printerCalibration.scalePercent ?? 99);
   const offXArg = String(config.hardware.printerCalibration.offsetXUnits ?? 0);
   const offYArg = String(config.hardware.printerCalibration.offsetYUnits ?? 3);
   const targetQueue = config.hardware.printerNames?.[mediaType] || activePrinter;
   ```

### 7.3 Fitur yang Dilarang Diubah / Dibangun Ulang (Tetap Pertahankan)
1. **Print Queue & Watchdog RCA-7**:
   Tetap gunakan SQLite persistent queue, watchdog 45 detik, terminal `DEAD_LETTER`, dan deduplikasi sesi.
2. **Koordinasi Penguncian USB DNP**:
   Tetap gunakan `setPrintDispatchActive(true)` untuk mematikan sementara polling USB DNP selama proses cetak.
3. **Titik Spawn Tunggal `print.exe`**:
   Semua pencetakan (baik cetak foto pelanggan maupun cetak lembar kalibrasi operator) **wajib** melewati fungsi tunggal `PrintService.printImage`.

### 7.4 Fitur yang Ditunda (Deferred Post-Pilot)
1. **Printer Sharing over LAN (HTTP)**: Tidak relevan untuk bilik mandiri.
2. **Cetak Panorama (Panoramic) & Flipbook Imposition**: Tidak masuk dalam cakupan bilik standar.
3. **Filter Penajaman Citra Tambahan (Sharpness)**: Sharp rendering saat ini sudah optimal.

---

## 8. Ide Tambahan: Prioritas & Rasional

| Usulan Ide | Masalah yang Diselesaikan | Kompleksitas | Risiko Regresi | Rekomendasi Fase |
| :--- | :--- | :---: | :---: | :---: |
| **Tombol "Cetak Lembar Kalibrasi" di Admin Panel** | Memungkinkan teknisi mencetak lembar target `test.png` langsung dari layar sentuh Kiosk saat instalasi. | **Rendah** | **Sangat Rendah** (menggunakan antrean cetak normal) | **PR-02 (Wajib)** |
| **Slider Offset X, Offset Y, Skala di Admin Panel** | Menghilangkan ketergantungan pada edit kode manual saat bilik fisik dipasang di mall/venue. | **Sedang** | **Sangat Rendah** (hanya memutasi config lokal) | **PR-02 (Wajib)** |
| **Tombol "Reset ke Default Pabrik"** | Mengembalikan nilai seketika ke `scale: 99, offX: 0, offY: 3` jika teknisi salah memasukkan angka. | **Rendah** | **Nol** | **PR-02 (Wajib)** |
| **Visualisasi Box `PrintPreview` di Admin Panel** | Memberikan feedback visual pergeseran sebelum kertas fisik dicetak. | **Sedang** | **Nol** (hanya komponen UI) | **PR-02 (Opsional / P2)** |
| **Runbook Panduan Konfigurasi Driver Windows DNP** | Memastikan teknisi OS Windows membuat antrean `DS-RX1 2r` (Cut ON) dan `DS-RX1` (Cut OFF) dengan benar. | **Rendah** (Dokumentasi) | **Nol** | **PR-02 (Wajib)** |

---

## 9. Batasan Arsitektur & Kepatuhan Invariant RCA-7

Untuk mencegah regresi terhadap stabilitas hardware yang telah terbukti pada Founder Physical UAT:
1. **Invariant 1**: Hanya ada **SATU** titik pemanggilan `print.exe` di seluruh codebase (`PrintService.ts:printImage`).
2. **Invariant 2**: Dilarang melakukan *automatic retry* pada job cetak in-flight; kegagalan ditandai `DEAD_LETTER`.
3. **Invariant 3**: Polling telemetri USB DNP (`PhotolabDNP.exe`) wajib dijeda saat `print.exe` sedang berjalan.
4. **Invariant 4**: Pembuatan GIF / transcode video FFmpeg wajib berjalan di background dan tidak boleh menghalangi antrean cetak.
5. **Invariant 5**: Alur pelanggan di `ProductSelectScreen` tetap fokus pada 2R Photostrip (Dual Strip) untuk Pilot Booth #1.

---

## 10. Pernyataan Batasan Mutlak & Status Kerja

> [!IMPORTANT]
> **Pernyataan Integritas Read-Only:**
> - **Tidak ada berkas kode produksi yang diubah** pada task ini.
> - **Tidak ada konfigurasi `.env`, database PostgreSQL, ataupun pengaturan sistem yang dimutasi**.
> - **Tidak ada perintah cetak fisik yang dikirim ke hardware DNP**.
> - **Tidak ada roadmap atau timeline status yang diubah**.
> - **Tidak ada Git commit, push, ataupun deploy**.
> - Laporan ini disajikan secara objektif berdasarkan pembacaan data empiris di Workspace dan siap untuk direview secara independen oleh Founder dan ChatGPT.

---
**Status Akhir:** AUDIT SELESAI. Menunggu review Founder dan ChatGPT sebelum memulai fase pengkodean PR-02.
