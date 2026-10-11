# PR-02 — FOUNDER UAT FAILURE: ROOT CAUSE ANALYSIS & TARGETED FIX REPORT

**Document ID:** `DOC-PR02-UAT-RCA-001`  
**Execution Date:** 2026-10-11  
**Author:** Antigravity Core Engineering  
**Branch:** `feature/pr02-printer-profiles-calibration`  
**Latest Commits:** [`7e763b2`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild) & [`c87c629`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild)  
**Parent Workstream:** Printer Workstream / Pilot Readiness Feature Batch (Phase B — PR-02)  
**Status:** COMPLETE — LOCAL VERIFICATION PASSED (READY FOR FOUNDER RETEST)  

---

## 1. Executive Summary & Verification Matrix

Fitur **PR-02 (Printer Profiles & Calibration)** telah menjalani Founder Physical UAT awal pada perangkat keras lokal Booth #1 dengan hasil:
1. **FAIL — Task A (Configuration Persistence)**: Konfigurasi printer 2R/4R dan kalibrasi tidak bertahan setelah aplikasi ditutup dan dijalankan kembali. Pengaturan kembali ke default.
2. **FAIL — Task B (Product-to-Print Format Routing)**: Pada sesi customer, printer tidak memilih format berdasarkan produk. Output selalu menggunakan default 4R.
3. **PASS — Calibration Queue Integration**: Pekerjaan kalibrasi masuk ke print queue dan tidak mengganggu alur aplikasi *(dipertahankan)*.
4. **DEFERRED — Target Calibration Design**: Desain target kalibrasi ditangguhkan sampai Founder memberikan referensi *(tidak diubah)*.

Kedua kegagalan (Task A & Task B) telah ditelusuri secara mendalam hingga ke akar masalah (Root Cause), diperbaiki dengan intervensi kode minimal dan terarah, diverifikasi dengan **14 automated regression tests baru (14/14 PASS)**, dan dikonfirmasi lulus pada seluruh suite regresi PR-02, RCA-6, RCA-7, serta build monorepo.

```text
┌──────────────────────────────────────────┬──────────┬────────────────────────────────────────────────────────┐
│ Verification Level                       │ Status   │ Empirical Evidence                                     │
├──────────────────────────────────────────┼──────────┼────────────────────────────────────────────────────────┤
│ 1. Code Implementation & Commits         │ COMPLETE │ Commits 7e763b2 & c87c629                              │
│ 2. Automated Regression Tests            │ PASSED   │ 14/14 Task A & B PASS; 17/17 Blocker PASS; 25/25 Check │
│ 3. Build & Typecheck (Turbo Monorepo)    │ PASSED   │ turbo run build: 4/4 packages successful (11.69s)      │
│ 4. Packaged Runtime Artifact Inspection  │ VERIFIED │ Fresh unpacked build: release/win-unpacked updated     │
│ 5. Founder Physical Hardware UAT Retest  │ PENDING  │ Physical paper cut verification awaiting Founder UAT   │
│ 6. Release & Production Deployment       │ HELD     │ No push, merge, or deployment prior to Physical UAT   │
└──────────────────────────────────────────┴──────────┴────────────────────────────────────────────────────────┘
```

---

## 2. Root Cause Analysis (RCA)

### 2.1 Task A — Configuration Persistence Failure (Reset to Default on Restart)

#### Alur End-to-End:
1. **Admin UI Save**: Pengguna mengubah kalibrasi dan mapping antrean printer 2R/4R di [`AdminScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx#L858) lalu menekan tombol Simpan.
2. **IPC Call**: UI memanggil `kiosk.config.set({ hardware: { printerCalibration, printerNames } })`.
3. **IPC Handler**: [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) menangani `config:set`.
4. **Startup Hydration**: Saat aplikasi ditutup dan dibuka kembali, [`SyncEngine.ts:reconcileRemoteConfig(force=true)`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1940) dipanggil untuk menyelaraskan konfigurasi lokal dengan backend cloud (`GET /api/booths/:id/config`).

#### Akar Masalah Teknis:
1. **`configVersion` Tidak Diinkremen & Tidak Ada Cloud Push**:
   Pada `config:set`, handler hanya melakukan shallow merge `{ ...current, ...partial }` dan menulis ke disk. Nilai `configVersion` tidak pernah diinkremen (tetap `1`), dan perubahan lokal ini **tidak pernah di-push ke cloud backend** (`PUT /api/booths/:id/config`).
2. **Penimpaan Agresif pada Startup Reconcile**:
   Saat aplikasi dibuka kembali, `reconcileRemoteConfig(force=true)` memanggil backend. Backend mengembalikan default envelope dengan `configVersion: 1` dan `hardware: { printerCalibration: { scale: 99, offsetX: 0, offsetY: 3 }, printerNames: null }`.
   Karena kondisi evaluasi semula adalah:
   ```typescript
   if (remoteVersion >= localVersion || force) {
     const merged = { ...localConfig, ...remoteConfig }; // <-- Shallow merge!
   ```
   Ekspresi `1 >= 1` bernilai `true`, dan `force=true` juga memaksa merge. Shallow merge `{ ...localConfig, ...remoteConfig }` menimpa seluruh objek `hardware` lokal dengan remote factory defaults, menghapus seluruh kalibrasi custom dan mapping antrean printer 2R/4R yang telah disimpan.
3. **Pembersihan pada Normalisasi KioskContext**:
   Di [`KioskConfigContext.tsx:178`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/context/KioskConfigContext.tsx#L178), `normalizeConfigPayload` merekonstruksi `printerNames: { ...defaultNames, ...(rawNames || {}) }`, yang jika menerima `rawNames` bernilai `null` dari envelope remote, langsung mengembalikan default `{ strip2x6: null, photo4x6: null, photo6x8: null }`.

---

### 2.2 Task B — Product-to-Print Format Routing Failure (Selalu Menggunakan Default 4R)

#### Alur End-to-End:
1. **Pemilihan Produk**: Customer memilih produk (misal: *2R Photostrip* dengan `frameId = '2R'`).
2. **Sesi Selesai**: Customer mencapai [`QRScreen.tsx:109`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx#L109).
3. **Enqueue**: `QRScreen` memanggil `kiosk.printer.enqueue(cleanPath, 1, sId)`.
4. **Queue Worker**: [`PrintQueueService.ts:executePrintJob`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintQueueService.ts#L640) mengambil pekerjaan dari SQLite `print_queue` dan memanggil `printImage()`.
5. **Print Dispatch**: [`PrintService.ts:resolvePrinterQueue`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts#L710) menentukan antrean printer Windows.

#### Akar Masalah Teknis:
1. **Informasi Format Hilang pada IPC Bridge & Enqueue**:
   Di `QRScreen.tsx:109`, pemanggilan `kiosk.printer.enqueue(cleanPath, 1, sId)` **tidak menyertakan format produk**. Signature IPC di `preload.ts` dan `bridge.ts` tidak menerima parameter format.
2. **Kolom Format Tidak Ada di SQLite `print_queue`**:
   Skema tabel `print_queue` tidak memiliki kolom `format`. Saat job di-enqueue, `printer_name` langsung di-resolve menjadi `getDefaultPrinterName() || 'AUTO'`, yang langsung mengikat pekerjaan ke default printer Windows 4R.
3. **Argumen `mediaFormat` Tidak Diteruskan ke PrintService**:
   Di `PrintQueueService.ts:680`, worker memanggil:
   ```typescript
   await printImage(cleanPath, targetPrinter, item.copies, undefined, onPhaseChange); // parameter ke-6 mediaFormat KOSONG!
   ```
4. **Fallback Tanpa Guard di `PrintService.ts`**:
   Di `PrintService.ts:resolvePrinterQueue`, karena `mediaFormat` adalah `undefined`, sistem tidak mendeteksi kebutuhan 2R cut queue, dan langsung mengarahkan job ke default printer 4R.

---

## 3. Detail Perubahan Kode & Alasan Teknis

### 3.1 Task A — Configuration Persistence

| File | Baris / Fungsi | Perubahan & Rationale |
| :--- | :--- | :--- |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1878) | `pushConfigToRemote()` *(Baru)* | Mengirim payload konfigurasi ke backend via `PUT ${baseUrl}/api/booths/${boothId}/config` dengan timeout non-blocking (4s). Menjaga keselarasan cloud saat online dan aman saat offline. |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L2004) | `reconcileRemoteConfig()` | **Deep Merge Defensif**: Menjaga nilai kalibrasi custom dan antrean printer lokal agar tidak ditimpa oleh remote default `v1` yang kosong/null. Mengubah kondisi evaluasi agar remote lama (`remoteVersion < localVersion`) dilarang menimpa konfigurasi lokal yang lebih baru. |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L2140) | IPC `config:set` | Menambahkan inkremen versi monontonik (`configVersion + 1`), deep merge untuk objek `hardware`, penulisan atomik ke disk, dan trigger background sync ke cloud. |
| [`KioskConfigContext.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/context/KioskConfigContext.tsx#L180) | `normalizeConfigPayload()` | Mempertahankan konfigurasi `printerNames` dan `printerCalibration` sebelumnya jika payload yang diterima tidak menyertakan konfigurasi hardware valid. |

### 3.2 Task B — Product-to-Print Format Routing

| File | Baris / Fungsi | Perubahan & Rationale |
| :--- | :--- | :--- |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L107) | `initDatabase()` | Menambahkan kolom `format TEXT NOT NULL DEFAULT '4R'` pada tabel `print_queue` dengan migrasi otomatis `ALTER TABLE`. |
| [`bridge.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/ipc/bridge.ts#L128) & [`preload.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/preload.ts#L42) | `kiosk.printer.enqueue` | Memperluas signature agar menerima argumen opsional `format?: string`. |
| [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx#L106) | Customer print enqueue | Mendeteksi format produk dari `session.frameId` / `session.productId` (`'2R'` vs `'4R'` vs `'6R'`) dan meneruskannya ke `kiosk.printer.enqueue(cleanPath, 1, sId, productFormat)`. |
| [`PrintQueueService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintQueueService.ts#L240) | `enqueuePrintJob()` | Menerima parameter `format`. Jika tidak disediakan, otomatis me-resolve format dari tabel `sessions` berdasarkan `frame_id`. Menyimpan `format` ke SQLite `print_queue`. |
| [`PrintQueueService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintQueueService.ts#L640) | `executePrintJob()` | Me-resolve antrean printer sesuai `item.format` via `resolvePrinterQueue(candidatePrinter, jobFormat)` (dalam blok non-bypass) dan meneruskan `jobFormat` sebagai argumen ke-6 ke `printImage()`. Menyelaraskan signature `recordSystemEvent` untuk typecheck strict. |
| [`PrintQueueService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintQueueService.ts#L900) | `reprintSession()` | Mempertahankan format media sesi asli (`2R` vs `4R`) saat operator/customer melakukan manual reprint. |
| [`PrintService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts#L717) | `resolvePrinterQueue()` | **Strict Format Routing**: Jika format `'2R'` atau `'strip2x6'`, strictly route ke mapping `strip2x6`. Jika belum dikonfigurasi atau tidak terpasang di Windows, **fail-fast dengan error jelas** (dilarang keras diam-diam mengalihkan ke default 4R). Fallback ke default printer hanya diizinkan untuk 4R dan memastikan antrean bukan antrean potong 2-inch. |

---

## 4. Hasil Automated Test Aktual

### 4.1 UAT Regression Test Baru (`scripts/test_pr02_founder_uat_fixes.mjs`)
Perintah: `npx tsx scripts/test_pr02_founder_uat_fixes.mjs`  
Hasil: **14/14 PASS (100%)**

```text
=== Task A: Configuration Persistence Across Restart ===
✔ A1: Custom calibration and 2R/4R queue names written atomically to disk (PASS)
✔ A2: Offline restart hydrates exact custom configuration without defaulting (PASS)
✔ A3: Online restart with older remote defaults (v1) NEVER overwrites local custom settings (PASS)
✔ A4: Cloud push transmits calibration and printer names to backend PUT /api/booths/:id/config (PASS)
✔ A5: Multi-booth isolation: Booth A config does not leak into Booth B (PASS)

=== Task B: Product-to-Print Format Routing ===
✔ B1: Enqueueing 2R product explicitly stores format = "2R" in SQLite queue (PASS)
✔ B2: Enqueueing 4R product explicitly stores format = "4R" in SQLite queue (PASS)
✔ B3: Implicit enqueue resolves format from sessions table (frame_id "2R") (PASS)
✔ B4: 2R product routes strictly to configured 2R queue ("DS-RX1 (Copy 1)") (PASS)
✔ B5: 4R product routes strictly to configured 4R queue ("DS-RX1 (Copy 2)") (PASS)
✔ B6: Unconfigured 2R queue fails fast with actionable error (NO silent default fallback) (PASS)
✔ B7: Missing Windows printer for configured 2R queue fails fast with clear error (PASS)
✔ B8: Manual reprint of 2R session preserves format = "2R" and creates distinct job (PASS)
✔ B9: Idempotency & deduplication: Duplicate 2R enqueue returns existing job without double printing (PASS)

RESULTS: 14 PASSED / 0 FAILED (100%)
```

### 4.2 Comprehensive Regression Suites
- `test_pr02_blocker_fixes_verification.mjs`: **17/17 PASS**
- `test_pr02_checkpoint1_normalization.mjs`: **9/9 PASS**
- `test_pr02_checkpoint2_kiosk_hydration.mjs`: **5/5 PASS**
- `test_pr02_checkpoint3_dispatch.mjs`: **11/11 PASS**
- `config-hydration.spec.ts`: **10/10 PASS**
- `rca6-regression.spec.ts`: **PASS**
- `rca7-simplification.spec.ts`: **PASS**

---

## 5. Hasil Build Monorepo & Packaging Runtime

1. **Turborepo Monorepo**: `npx turbo run build` $\rightarrow$ **4/4 packages SUCCESS (11.69s)**
   - `@pictolabs/shared`: build clean (0 errors)
   - `@pictolabs/backend`: build clean (0 errors)
   - `@pictolabs/dashboard`: Vite build clean (0 errors)
   - `@pictolabs/kiosk`: Vite bundle & TypeScript compilation clean (0 errors)
2. **Kiosk TypeScript Compilation**: `npx tsc -p apps/kiosk/tsconfig.electron.json` $\rightarrow$ **Exit Code 0**.
3. **Electron Unpacked Package Build**: `npx electron-builder --win --dir` (di `apps/kiosk`) $\rightarrow$ **Exit Code 0**.
4. **Verifikasi Aset Packaged**:
   - `Pictolabs Kiosk.exe`: 245,289,472 bytes (updated: 10/11/2026 7:38 PM)
   - `resources/assets/calibration_target.png`: 123,101 bytes
   - `resources/bin/dnp/print.exe`: 670,168 bytes
   - `resources/bin/dnp/PhotolabDNP.exe`: 17,162,840 bytes
   - `resources/ffmpeg.exe`: 82,797,568 bytes

---

## 6. Status Git & Commit Hash

- **Branch**: `feature/pr02-printer-profiles-calibration`
- **Primary Fix Commit**: [`7e763b2`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild) (`fix(pr02): configuration persistence across restart and product format routing to print queue`)
- **Strict Typing Fix Commit**: [`c87c629`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild) (`fix(pr02): correct recordSystemEvent signature in PrintQueueService`)
- **Git Status**: Clean pada seluruh tracked files.
