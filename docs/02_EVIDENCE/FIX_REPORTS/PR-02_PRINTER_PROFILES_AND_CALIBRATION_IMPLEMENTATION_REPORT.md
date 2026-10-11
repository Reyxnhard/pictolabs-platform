# PR-02 — PRINTER PROFILES & CALIBRATION: FINAL IMPLEMENTATION & VERIFICATION REPORT
**Document ID:** `DOC-PR02-IMPL-001`  
**Execution Date:** 2026-10-11  
**Author:** Antigravity Core Engineering  
**Branch:** `feature/pr02-printer-profiles-calibration`  
**Latest Local Commit:** `426bd8a` (`426bd8a43657fcb593635a90d9a7d3a04cf7b6d1`)  
**Parent Workstream:** Printer Workstream / Pilot Readiness Feature Batch (Phase B — PR-02)  
**Parent Gate:** `Phase B: PR-02 Printer Profiles & Calibration Planning`  
**Current Gate Status:** `READY_FOR_FOUNDER_PHYSICAL_UAT` (Awaiting explicit Founder physical printing authorization)

---

## 1. Executive Summary & Verification Matrix

Fitur **PR-02 (Printer Profiles & Calibration)** telah diimplementasikan secara menyeluruh dan diverifikasi pada level kode, database, IPC, antrean pencetakan, skrip otomatis, typecheck, dan packaging Electron aktual. Seluruh modifikasi mempertahankan arsitektur PR-01 (isolasi per-booth) dan invarian stabilitas pencetakan RCA-7 (tanpa polling USB DNP selama penulisan spooler).

Sesuai protokol governansi Pictolabs, status verifikasi dipetakan secara ketat:

```text
┌──────────────────────────────────────────┬──────────┬────────────────────────────────────────────────────────┐
│ Verification Level                       │ Status   │ Empirical Evidence                                     │
├──────────────────────────────────────────┼──────────┼────────────────────────────────────────────────────────┤
│ 1. Code Implementation                   │ COMPLETE │ Commits cc8cb38, 35edd1f, d6104a3, 426bd8a             │
│ 2. Automated Tests                       │ PASSED   │ 100% PASS (17/17 Blocker, 25/25 PR-02, 36/36 RCA-6)   │
│ 3. Build & Typecheck (Vite, TSC, Nest)   │ PASSED   │ Exit Code 0 across kiosk renderer, electron, & backend │
│ 4. Packaged Runtime Artifact Inspection  │ VERIFIED │ Fresh unpacked build: 123,101 B valid 1200x1800 PNG     │
│ 5. Founder Physical Hardware UAT         │ PENDING  │ Physical printing blocked awaiting Founder sign-off    │
│ 6. Release & Production Deployment       │ HELD     │ No push, merge, or deployment prior to Physical UAT   │
└──────────────────────────────────────────┴──────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Technical Decisions & Scope Alignment

Berdasarkan keputusan Founder dan hasil reverse-engineering terhadap aplikasi referensi:
1. **Model Kalibrasi Reference-Parity**:
   - **Skala Cetak (Scale)**: $85\% \dots 100\%$ (integer, baseline default: $99\%$).
   - **Offset Horizontal (X)**: $-15 \dots +15$ unit native (baseline default: $0$).
   - **Offset Vertikal (Y)**: $-15 \dots +15$ unit native (baseline default: $+3$).
   - **Satuan Native**: $1/100\text{ inch}$ per unit ($\approx 0.254\text{ mm}$). Rentang pergeseran fisik: $-3.81\text{ mm} \dots +3.81\text{ mm}$.
   - **Penajaman Citra (Sharpness)**: Ditangguhkan karena driver DNP dan utilitas CLI `print.exe` tidak mendukung flag ketajaman saat runtime. UI Admin menyertakan callout informatif transparan.
2. **Kontrak Antrean Printer Per-Media**:
   - Skema dan DTO mendukung pemetaan eksplisit:
     - `strip2x6` (format 2R photostrip) $\rightarrow$ antrean dengan pemotong 2-inci aktif.
     - `photo4x6` (format 4R postcard) $\rightarrow$ antrean standar tanpa potong (uncut).
     - `photo6x8` (format 6R cetak besar) $\rightarrow$ antrean opsional.
   - Nilai default adalah `null` (bukan antrean fiktif `CITIZEN CY-02`). Jika `null`, sistem melakukan resolusi fail-safe ke printer default Windows yang terverifikasi terpasang.
3. **Target Kalibrasi Resmi Pictolabs**:
   - Menggunakan aset otentik beresolusi $1200 \times 1800\text{ px}$ (300 DPI, rasio 2:3) dengan skala milimeter per milimeter, retikel perataan tengah $(600, 900)\text{ px}$, dan garis potong tengah $50.8\text{ mm}$ ($2\text{ inci}$).

---

## 3. Detail Implementasi & Perbaikan Blocker

### 3.1 Blocker 1 — Packaging Asset Kalibrasi
- **Masalah Semula**: Berkas `calibration_target.png` berada di `apps/kiosk/resources/assets/`, namun konfigurasi `apps/kiosk/electron-builder.json` tidak menyertakan `resources/assets` dalam `extraResources`. Akibatnya, pada instalasi produksi/packaged, Kiosk akan jatuh ke citra fallback abu-abu polos.
- **Koreksi**:
  - Menambahkan entri pada `extraResources` di [`apps/kiosk/electron-builder.json`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron-builder.json):
    ```json
    {
      "from": "resources/assets",
      "to": "assets"
    }
    ```
  - Destination `assets` cocok persis dengan Candidate 1 pada [`findCalibrationTargetPath()`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterHardwareAdapter.ts): `path.join(process.resourcesPath, 'assets', 'calibration_target.png')`.
- **Bukti Empiris Packaging**:
  - Dijalankan build unpacked nyata: `npx electron-builder --win --dir` di `apps/kiosk`.
  - Berkas terverifikasi ada di: [`apps/kiosk/release/win-unpacked/resources/assets/calibration_target.png`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/release/win-unpacked/resources/assets/calibration_target.png).
  - Ukuran: 123,101 byte; Header: PNG (`89 50 4E 47`); Dimensi: $1200 \times 1800\text{ px}$.

### 3.2 Blocker 2 — Mutual Exclusion & Pencegahan Konkurensi Pencetakan
- **Masalah Semula**: Operator dapat memicu `cut-test` (atau reprint manual) bersamaan dengan job pencetakan pelanggan dari antrean, yang berisiko memicu tabrakan proses `print.exe`, handle spooler lock, atau tabrakan bus USB DNP.
- **Koreksi**:
  - Di [`PrinterMonitorService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterMonitorService.ts), diimplementasikan state machine kunci atomik sinkron:
    `acquirePrintDispatchLock(owner: PrintDispatchOwner)`, `releasePrintDispatchLock(owner)`, `forceReleasePrintDispatchLock()`.
    Ownership didokumentasikan secara ketat: `'QUEUE_WORKER'`, `'CALIBRATION'`, `'MANUAL'`.
  - Pada Node.js single-threaded event loop, operasi check-and-set ini beroperasi secara atomik sinkron (zero async race window).
  - Di [`PrintQueueService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintQueueService.ts), sebelum transisi job ke `PRINTING`, worker meminta kunci `'QUEUE_WORKER'`. Jika sedang dipegang kalibrasi, job tetap aman `PENDING` di SQLite, status worker kembali `IDLE`, dan retry dijadwalkan 1000ms kemudian.
  - Di [`PrintService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts), handler `printer:cut-test` dan `printer:reprint-last` meminta kunci masing-masing. Jika sibuk, langsung mengembalikan pesan operator: `"Printer sedang memproses pencetakan lain. Harap tunggu hingga selesai."`.
  - Pelepasan kunci dijamin di blok `finally` pada seluruh alur (sukses, eksepsi, timeout 30s, maupun pembatalan).
  - Telemetri USB DNP diblokir selama kunci aktif dan selama jeda stabilisasi bus 4,000ms pasca-selesai (`Date.now() - lastDispatchEndTime < 4000`).

### 3.3 Koreksi Keamanan Stale-Lock Recovery (Audit Area 1)
- **Masalah Semula**: Mekanisme pemecah kunci usang (`>60s`) melepaskan kunci semata-mata berdasarkan waktu dinding yang berlalu, tanpa memeriksa apakah `print.exe` masih berjalan di OS.
- **Koreksi**:
  - Menambahkan pelacakan PID anak proses aktif (`registerActivePrintPid`) pada `PrintService.ts` saat `execFile` dijalankan.
  - Di [`PrinterMonitorService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterMonitorService.ts), ditambahkan pemeriksaan kelangsungan hidup proses (`isPrintProcessAlive`) yang memverifikasi PID aktif via `process.kill(pid, 0)` dan tabel proses Windows via `tasklist /FI "IMAGENAME eq print.exe"`.
  - Jika kunci usang diperebutkan saat proses masih hidup: sistem mencoba terminasi paksa (`SIGTERM` + `taskkill /F /FI "IMAGENAME eq print.exe" /T`) dan mengonfirmasi kematian proses.
  - **Invarian Kunci**: Jika terminasi gagal atau proses tidak dapat dipastikan mati, **pemulihan kunci ditolak secara mutlak** (`return false`). Sistem tidak pernah mengizinkan pemanggilan `print.exe` kedua saat proses pertama masih aktif.

### 3.4 Penjaga Antrean 4x6 Uncut untuk Target Kalibrasi (Audit Area 3)
- **Masalah Semula**: `printer:cut-test` memanggil `printImage(..., '2R')`. Jika antrean `strip2x6` (atau default printer) diatur dengan opsi *2-inch Cut: Enabled* pada driver DNP di Windows, pisau mekanik akan memotong target kalibrasi $4 \times 6\text{ inci}$ menjadi dua bilah $2 \times 6\text{ inci}$ terpisah di tengah garis perataan silang.
- **Koreksi**:
  - Dibuat fungsi validator [`resolveCalibrationPrinterQueue()`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts).
  - Target kalibrasi mewajibkan antrean 4R yang terkonfigurasi secara eksplisit di `config.hardware.printerNames.photo4x6`.
  - Antrean dengan indikator pemotongan 2-inci (sama dengan `strip2x6` atau memuat kata `2x6`, `strip`, `2-inch`, `cut`, `potong` kecuali `uncut`) ditolak keras.
  - Jika antrean 4R belum disetel di Admin Panel, pemanggilan gagal cepat dengan pesan:
    `"Antrean printer 4R (4x6 uncut) belum dikonfigurasi di Admin Panel. Harap tentukan antrean printer 4R yang valid agar target kalibrasi tidak terpotong."` (tidak ada silent fallback).

---

## 4. Hasil Pengujian Otomatis

Seluruh pengujian dijalankan dan lulus 100%:

```text
1. test_pr02_blocker_fixes_verification.mjs:
   - Packaging Configuration & Asset Resolution: 3/3 PASS
   - Atomic Dispatch Lock & Mutual Exclusion: 6/6 PASS
   - Safe Stale Lock Recovery & Process Liveness: 3/3 PASS
   - Calibration Media Semantics & Safe Uncut Queue: 5/5 PASS
   Total: 17 / 17 PASSED (100%)

2. PR-02 Checkpoint Suites:
   - test_pr02_checkpoint1_normalization.mjs: 9 / 9 PASSED (100%)
   - test_pr02_checkpoint2_kiosk_hydration.mjs: 5 / 5 PASSED (100%)
   - test_pr02_checkpoint3_dispatch.mjs: 11 / 11 PASSED (100%)

3. Foundation & Regression Specs:
   - test_pr01_booth_config_foundation.mjs: 22 / 22 PASSED (100%)
   - config-hydration.spec.ts: 10 / 10 PASSED (100%)
   - rca7-simplification.spec.ts: 10 / 10 PASSED (100%)
   - rca6-regression.spec.ts: 36 / 36 PASSED (100%)

4. Production Builds & Typechecks:
   - apps/kiosk (Vite + TS): Exit Code 0
   - apps/kiosk (TSC Electron): Exit Code 0
   - apps/backend (NestJS Build): Exit Code 0
```

---

## 5. Riwayat Commit Lokal

Semua perubahan berada di branch `feature/pr02-printer-profiles-calibration`:
- [`cc8cb38`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild): `feat(kiosk): add operator printer calibration controls, queue selection and USB bus guard (PR-02 Checkpoint 4)`
- [`35edd1f`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild): `feat(pr02): lock reference-parity calibration [85-100%, +/-15], visual preview, and measurable test target`
- [`d6104a3`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild): `fix(pr02): package calibration target asset and enforce atomic print dispatch lock`
- [`426bd8a`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild): `fix(pr02): safe stale-lock recovery with process liveness check and uncut 4x6 calibration queue enforcement`

---

## 6. Sisa Blocker & Gate Berikutnya

1. **Sisa Blocker Teknis / Kode**: **NIHIL (0 Blocker).** Semua blocker kode, packaging, penguncian proses, dan pencegahan pemotongan media telah selesai.
2. **Gate Berikutnya**:
   - **Founder Physical Hardware UAT Authorization**: Menunggu otorisasi Founder untuk pengujian cetak fisik kalibrasi pada mesin Booth #1 menggunakan printer DNP DS-RX1 fisik.
   - Pencetakan fisik dilarang hingga Founder memberikan izin tertulis.
   - Setelah UAT fisik berhasil, PR-02 dapat masuk ke tahap merge, git push, deployment VPS, dan penutupan gerbang.
