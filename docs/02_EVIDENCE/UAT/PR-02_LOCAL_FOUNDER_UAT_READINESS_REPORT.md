# PR-02 — LOCAL FOUNDER UAT READINESS REPORT

**Document ID:** `DOC-PR02-UAT-READY-001`  
**Date:** 2026-10-11  
**Author:** Antigravity Core Engineering  
**Branch:** `feature/pr02-printer-profiles-calibration`  
**Verified Commits:** [`7e763b2`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild) & [`c87c629`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild)  
**Target Hardware:** Pictolabs Pilot Booth #1 (DNP DS-RX1 Dye-Sublimation Photo Printer)  
**Status:** READY FOR FOUNDER PHYSICAL UAT RETEST (DO NOT MARK CLOSED)  

---

## 1. Executive Summary & Retest Scope

Menindaklanjuti Founder Physical UAT awal pada PR-02 di mana terjadi kegagalan persistensi konfigurasi (Task A) dan perutean format produk (Task B), perbaikan terarah telah diimplementasikan, dikompilasi, dan diverifikasi dengan tes regresi otomatis.

Dokumen ini merupakan panduan kesiapan operasional bagi Founder untuk melakukan pengujian ulang (retest) pada Booth #1 secara fisik dan aman.

### Cakupan UAT Retest:
1. **Retest Kasus 1 (Task A — Persistensi Konfigurasi)**: Memastikan pengaturan kalibrasi (Scale, Offset X, Offset Y) dan mapping nama antrean printer Windows (2R & 4R) tidak hilang atau kembali ke default setelah aplikasi ditutup dan dibuka kembali.
2. **Retest Kasus 2 (Task B — Format Routing 2R Photostrip)**: Memastikan sesi customer dengan produk 2R photostrip diarahkan secara ketat ke antrean printer 2R dengan pisau potong 2-inch aktif (menghasilkan 2 strip foto fisik).
3. **Retest Kasus 3 (Task B — Format Routing 4R Postcard)**: Memastikan sesi customer dengan produk 4R postcard diarahkan ke antrean printer 4R standar tanpa pemotongan 2-inch (menghasilkan 1 lembar foto 4x6 utuh).
4. **Retest Kasus 4 (Proteksi Antrean & Fail-Fast)**: Memastikan tidak terjadi pengalihan diam-diam (silent fallback) jika antrean 2R tidak terkonfigurasi.
5. **Retest Kasus 5 (Kalibrasi Cetak)**: Memastikan cetak target kalibrasi tetap masuk ke antrean cetak dengan aman tanpa memblokir sistem.

---

## 2. Identifikasi Commit & Lokasi Artefak Build

### 2.1 Git Branch & Commit
- **Branch**: `feature/pr02-printer-profiles-calibration`
- **HEAD Commit**: `c87c629` (`fix(pr02): correct recordSystemEvent signature in PrintQueueService`)
- **Fix Commit**: `7e763b2` (`fix(pr02): configuration persistence across restart and product format routing to print queue`)
- **Status Working Tree**: Bersih pada seluruh berkas yang dilacak git.

### 2.2 Lokasi Artefak Packaged Terbaru
Seluruh kode terbaru telah dikompilasi ke dalam paket *unpacked* siap jalan:

- **Executable Aplikasi**:
  [`pictolabs-rebuild/apps/kiosk/release/win-unpacked/Pictolabs Kiosk.exe`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/win-unpacked/Pictolabs%20Kiosk.exe)  
  *(Ukuran: 245,289,472 bytes — Waktu Build: 11 Oktober 2026 19:38 WIB)*
- **Aset Target Kalibrasi Resmi**:
  [`pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/assets/calibration_target.png`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/assets/calibration_target.png)  
  *(Ukuran: 123,101 bytes — Format: PNG 1200x1800 300 DPI)*
- **Binary Eksekusi Cetak GDI**:
  [`pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/bin/dnp/print.exe`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/bin/dnp/print.exe)  
  *(Ukuran: 670,168 bytes)*
- **Binary Telemetri USB Printer**:
  [`pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/bin/dnp/PhotolabDNP.exe`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/bin/dnp/PhotolabDNP.exe)  
  *(Ukuran: 17,162,840 bytes)*
- **Transcoder Media**:
  [`pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/ffmpeg.exe`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/ffmpeg.exe)  
  *(Ukuran: 82,797,568 bytes)*

---

## 3. Prosedur Verifikasi di Komputer Booth #1

### Langkah 1: Pemeriksaan Pra-Uji (Pre-Flight)
1. Tutup seluruh instance aplikasi Kiosk sebelumnya (periksa melalui Windows Task Manager jika perlu).
2. Pastikan printer fisik **DNP DS-RX1** terhubung melalui USB dan menyala.
3. Buka *Printers & Scanners* di Windows Settings. Catat nama antrean printer yang terpasang:
   - Antrean pemotong 2-inci (misal: `DS-RX1 (Copy 1)` atau antrean dengan setting 2-inch cut aktif).
   - Antrean cetak standar 4x6 (misal: `DS-RX1 (Copy 2)` atau printer default tanpa potong).

### Langkah 2: Menjalankan Aplikasi
Jalankan aplikasi packaged dari terminal PowerShell atau shortcut:
```powershell
& "C:\Users\ezarh\.gemini\antigravity-ide\scratch\Pictolabs\pictolabs-rebuild\apps\kiosk\release\win-unpacked\Pictolabs Kiosk.exe"
```
*(Catatan: Aplikasi akan langsung terbuka dalam layar penuh).*

---

### Langkah 3: Verifikasi Persistensi Konfigurasi (Task A)
1. Di layar utama Kiosk, buka Admin Panel menggunakan pintasan operator (`Ctrl+Shift+A` atau ketuk logo 5 kali).
2. Masukkan PIN Admin/Teknisi.
3. Buka tab **Printer & Calibration**.
4. Masukkan nilai kalibrasi uji yang mudah dikenali:
   - **Scale**: `96%`
   - **Offset X**: `+2`
   - **Offset Y**: `+4`
5. Pada bagian **Printer Queues**, pilih:
   - Antrean 2R (strip 2x6): Pilih antrean pemotong 2-inch yang sesuai.
   - Antrean 4R (photo 4x6): Pilih antrean 4R standar.
6. Klik tombol **Simpan Pengaturan**. Pastikan muncul konfirmasi penyimpanan berhasil.
7. Tutup aplikasi Kiosk secara paksa menggunakan `Alt+F4` atau `Taskkill`.
8. Tunggu 5 detik, lalu buka kembali aplikasi Kiosk.
9. Buka kembali Admin Panel $\rightarrow$ tab **Printer & Calibration**.
10. **Kriteria Evaluasi**:
    - **PASS**: Nilai Scale tetap `96%`, Offset X tetap `+2`, Offset Y tetap `+4`, serta antrean 2R dan 4R tetap terisi dengan printer yang dipilih.
    - **FAIL**: Nilai kembali ke default (`99%`, `0`, `+3`) atau antrean kembali kosong (`null`).

---

### Langkah 4: Verifikasi Format Routing 2R Photostrip (Task B)
1. Dari Admin Panel, kembali ke layar customer (`WelcomeScreen`).
2. Masuk ke alur customer dan pada layar pemilihan produk, pilih **2R Photostrip**.
3. Ambil foto hingga selesai (atau gunakan tombol bypass foto/pembayaran jika tersedia untuk testing).
4. Sampai di layar `QRScreen`, perhatikan antrean pencetakan.
5. **Kriteria Evaluasi**:
    - **PASS**: Printer fisik menerima pekerjaan dari antrean 2R, mencetak, dan pisau pemotong memotong media menjadi dua strip 2x6 inci.
    - **FAIL**: Pekerjaan tercetak sebagai 4R utuh tanpa potongan 2-inch, atau dialihkan ke default printer 4R secara salah.

---

### Langkah 5: Verifikasi Format Routing 4R Postcard (Task B)
1. Mulai sesi customer baru dari `WelcomeScreen`.
2. Pilih produk **4R Postcard**.
3. Lanjutkan sesi foto hingga `QRScreen`.
4. **Kriteria Evaluasi**:
    - **PASS**: Printer mencetak satu lembar 4x6 utuh tanpa pemotongan 2-inci di bagian tengah.
    - **FAIL**: Lembaran terpotong menjadi dua, atau ukuran cetak menyusut tidak proporsional.

---

### Langkah 6: Verifikasi Cetak Kalibrasi (UAT Item 3)
1. Buka kembali Admin Panel $\rightarrow$ tab **Printer & Calibration**.
2. Klik tombol **Print Calibration Target**.
3. **Kriteria Evaluasi**:
    - **PASS**: Target kalibrasi tercetak dengan retikel tengah dan grid milimeter pada media 4R uncut, dan antrean cetak tidak terganggu.

---

## 4. Acceptance Criteria Matrix

| Kriteria | Kondisi Lulus (PASS) | Kondisi Gagal (FAIL) |
| :--- | :--- | :--- |
| **Persistensi Nilai Kalibrasi** | Nilai Scale, Offset X, Offset Y tersimpan di SQLite & disk, bertahan setelah restart. | Kembali ke baseline 99, 0, 3 setelah restart. |
| **Persistensi Mapping Antrean** | Nama antrean 2R & 4R bertahan setelah restart aplikasi offline maupun online. | Mapping antrean kembali menjadi null / tidak terpilih. |
| **Isolasi Multi-Booth** | Konfigurasi lokal terisolasi per-booth; tidak bocor ke identitas booth lain. | Konfigurasi tertukar antar booth. |
| **Routing Produk 2R** | Menghasilkan print job format 2R $\rightarrow$ antrean 2R $\rightarrow$ 2-inch cut fisik aktif. | Dicetak melalui antrean 4R atau tidak terpotong. |
| **Routing Produk 4R** | Menghasilkan print job format 4R $\rightarrow$ antrean 4R $\rightarrow$ uncut 4x6 utuh. | Dicetak melalui antrean 2R atau terpotong 2 strip. |
| **Fail-Fast Error Handling** | Jika antrean 2R belum diset, job menolak dengan error jelas; **tidak ada silent fallback**. | Diam-diam mencetak ke default printer yang salah. |
| **Integritas Queue & Watchdog** | Deduplikasi SQLite aktif; tidak ada multiple print untuk 1 sesi; watchdog stabil. | Terjadi print berulang atau antrean macet. |

---

## 5. Matriks Risiko: Status Saat Ini

Sesuai standar verifikasi empiris Pictolabs:

```text
┌──────────────────────────────────────────────┬─────────────┬─────────────────────────────────────────────────────────┐
│ Area Pengujian                               │ Status      │ Catatan Pembuktian                                      │
├──────────────────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────┤
│ Automated Persistence Regression (Test A1-A5)│ PASS        │ 5/5 skenario automated restart lulus 100%               │
│ Automated Format Routing Regression (B1-B9)  │ PASS        │ 9/9 skenario SQLite queue & routing lulus 100%          │
│ Monorepo Compilation & Typecheck             │ PASS        │ turbo run build 4/4 packages clean                      │
│ Electron Packaging & Asset Placement         │ VERIFIED    │ calibration_target.png & binaries verified di build     │
│ Runtime Offline Local Cache Hydration        │ VERIFIED    │ readLocalKioskConfig() memverifikasi deep-merge aman    │
│ Founder Physical UAT Retest (Hardware Fisik) │ UNVERIFIED  │ Memerlukan eksekusi fisik langsung oleh Founder         │
└──────────────────────────────────────────────┴─────────────┴─────────────────────────────────────────────────────────┘
```

> [!CAUTION]
> **Definisi Status**:
> - **PASS / VERIFIED**: Telah dibuktikan dengan eksekusi kode, pengujian otomatis, dan inspeksi biner.
> - **UNVERIFIED**: Belum diverifikasi langsung oleh Founder pada perangkat keras fisik (kertas & pisau potong printer).
> - **PR-02 TETAP BERSTATUS `READY_FOR_FOUNDER_PHYSICAL_UAT_RETEST`** dan **DILARANG DINYATAKAN CLOSED** sebelum pengujian fisik di atas diselesaikan.

---

## 6. Batasan Governansi & Larangan

1. **Dilarang Menutup PR-02 Secara Mandiri**: PR-02 hanya dapat ditutup (CLOSED) setelah Founder menyelesaikan retest fisik pada Booth #1 dan menyatakan lulus.
2. **Dilarang Push / Merge / Deploy**: Tidak ada commit yang di-push ke remote GitHub atau di-merge ke branch `main`.
3. **Dilarang Melakukan Physical Print Tanpa Otorisasi**: Agent tidak menjalankan eksekusi print fisik otomatis; seluruh pengujian fisik dilakukan langsung oleh Founder melalui antarmuka Kiosk.
4. **Dilarang Mengubah Target Kalibrasi**: Perbaikan desain grafis target kalibrasi berstatus **DEFERRED** menunggu referensi Founder.
