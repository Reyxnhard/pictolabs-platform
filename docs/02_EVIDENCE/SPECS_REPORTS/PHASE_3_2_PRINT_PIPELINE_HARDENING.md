# PHASE 3.2: PRINT PIPELINE HARDENING BLUEPRINT
## Architecture Design & Execution Blueprint for Resilient Kiosk Printing
**Target System:** Pictolabs Unattended Autonomous Photobooth (Edge Kiosk Electron Runtime)  
**Document Ref:** `/docs/PHASE_3_2_PRINT_PIPELINE_HARDENING.md`  
**Parent Blueprint:** `/docs/PHASE_3_2_PRODUCTION_HARDENING.md`  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION (PRE-IMPLEMENTATION)  

---

## 1. Current Architecture Audit

Berdasarkan audit langsung terhadap kode sumber aktual di repositori (`apps/kiosk/electron/services/PrintService.ts`, `apps/kiosk/electron/services/SyncEngine.ts`, `apps/kiosk/src/screens/QRScreen.tsx`, dan `apps/kiosk/src/screens/PrintScreen.tsx`):

### 1.1 Alur Print Saat Ini
```
RenderScreen (processComposite)
   │
   ├── Generates composite JPEG (1200x1800 @ 300 DPI) via Sharp
   ├── Saves record to SQLite: kiosk.session.create({ id, printStatus: 'pending', ... })
   └── Navigates to 'qr' screen (setTimeout 600ms)
         │
         ▼
QRScreen (Mount Lifecycle)
   │
   ├── Reads session.compositePath / session.compositeUrl
   ├── Directly calls IPC: kiosk.printer.print(cleanPath, 1)
   │     │
   │     ▼
   │  PrintService (Electron Main Process)
   │     ├── If isBypassMode: Returns { success: true } (Simulation)
   │     └── If hardware: Executes synchronous PowerShell:
   │           rundll32 shimgvw.dll,ImageView_PrintTo /pt "${escapedPath}" "${escapedPrinter}"
   │
   └── Awaits Promise:
         ├── If success: kiosk.session.update(sessionId, { printStatus: 'printed' })
         └── If failure: kiosk.session.update(sessionId, { printStatus: 'failed' })
```

### 1.2 Jawaban Audit Spesifik
1. **Apakah sudah ada `print_queue`?**
   - **TIDAK ADA**. SQLite hanya memiliki tabel `sessions` dan `upload_queue`. Tidak ada tabel `print_queue` di database lokal kiosk.
2. **Apakah print masih fire-and-forget?**
   - **YA**. Pemanggilan `kiosk.printer.print()` adalah pemanggilan langsung satu kali (*one-shot*). Jika perintah PowerShell gagal, atau printer sedang sibuk/macet, tidak ada antrean di memori maupun disk untuk mengulang kembali pekerjaan cetak tersebut.
3. **Apakah status print tersimpan di SQLite?**
   - **TERBATAS**. Kolom `print_status` di tabel `sessions` hanya mencatat string statis (`'pending'`, `'printed'`, atau `'failed'`). Tidak ada riwayat percobaan (*attempt counter*), tidak ada pencatatan error spooler detail, dan tidak ada pemisahan antara entitas sesi dan pekerjaan cetak.
4. **Apakah app bisa resume print setelah restart?**
   - **TIDAK BISA**. Karena tidak ada worker antrean cetak yang berjalan di background, sesi yang memiliki `print_status = 'failed'` atau tertahan di `'pending'` saat aplikasi ditutup tidak akan pernah diproses ulang secara otomatis setelah aplikasi dibuka kembali.
5. **Apa yang terjadi pada kondisi ekstrem?**
   - **Printer Mati / Power Putus**: Perintah `ImageView_PrintTo` gagal atau timeout. Layar `QRScreen` menangkap error, memperbarui `printStatus = 'failed'`, lalu sesi berakhir. Customer kehilangan hasil cetak fisik tanpa ada retry otomatis.
   - **Kabel USB Printer Dicabut**: Jika dicabut saat pemotretan, `printImage` gagal mengeksekusi spooling. Job hilang seketika.
   - **Printer Jam (Kertas Macet)**: Spooler Windows mendeteksi error `PRINTER_STATUS_PAPER_JAM`. Kiosk menganggap job gagal dan tidak pernah mencoba mencetak ulang setelah operator mengeluarkan kertas yang macet.
   - **Kertas Habis**: Status `PRINTER_STATUS_PAPER_OUT` menggagalkan print. Customer tidak mendapatkan foto fisik dan tidak ada antrean yang menunggu kertas diisi ulang.
   - **Windows Restart / Listrik Padam**: Seluruh in-flight job di memori lenyap. Kiosk boot ke Welcome Screen dan sesi yang belum tercetak diabaikan begitu saja.

---

## 2. Failure Scenarios Matrix

| Skenario Kegagalan | Perilaku Saat Ini (Lama) | Dampak Bisnis | Solusi Arsitektur Baru (Hardened) |
|:---|:---|:---|:---|
| **Kabel USB Tercabut / Goyang** | Print gagal seketika; job dibuang | Customer bayar tapi foto tidak keluar | Job masuk `print_queue` status `PENDING`, worker pause, retry otomatis saat USB tersambung kembali. |
| **Kertas Habis di Tengah Cetak** | Job error, UI update `failed`, selesai | Kerugian finansial customer | Job berstatus `FAILED` di queue; saat teknisi mengisi kertas & klik "Reset Roll", worker langsung memproses sisa antrean. |
| **Kertas Macet (Paper Jam)** | Spooler lock, job dibuang oleh kiosk | Cetakan rusak, foto tidak dicetak ulang | Job ditandai `FAILED` dengan `last_error = 'PAPER_JAM'`. Operator dapat memicu `Retry` satu-tombol dari Admin Panel. |
| **Windows Restart / Listrik Padam** | Job di memori hilang total | Foto hilang permanen | Startup boot sequence memindai `print_queue`; semua job `PRINTING` dialihkan ke `PENDING`/`FAILED` dan dieksekusi ulang. |
| **Spooler Windows Hang (`spoolsv.exe`)** | Job menggantung tanpa batas | Bilik foto macet, antrean pengunjung terhenti | Worker mendeteksi timeout 30s, me-restart service Windows Spooler otomatis, dan me-retry job. |

---

## 3. New Architecture Overview

Arsitektur baru memisahkan **UI Thread (Customer Journey)** sepenuhnya dari **Print Execution Thread (Persistent Worker)** menggunakan pola *Transactional Outbox* di SQLite:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           HARDENED PRINT ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [UI Layer: RenderScreen / QRScreen]                                            │
│        │                                                                        │
│        ▼                                                                        │
│  enqueuePrintJob(sessionId, compositePath, copies)                              │
│        │ (Atomic SQLite Insert)                                                 │
│        ▼                                                                        │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ TABLE print_queue (SQLite WAL Mode)                                       │  │
│  │ [id | session_id | file_path | status: PENDING | attempts: 0 | error: null]│  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│        │                                                                        │
│        ▼                                                                        │
│  [Print Worker Loop (Runs every 3 seconds in Electron Background)]              │
│        │                                                                        │
│        ├── 1. Check Hardware Health (Win32 Spooler via Get-CimInstance)         │
│        │      ├── Offline / Paper Out / Jam? ──► Pause Queue, Alert Telemetry   │
│        │      └── Ready? ──────────────────────► Pick oldest PENDING job        │
│        │                                                                        │
│        ├── 2. Atomically update status: 'PRINTING', updated_at: NOW             │
│        │                                                                        │
│        ├── 3. Execute Spooler Command (with 30s Hard Timeout)                   │
│        │      ├── Success? ──► Status: 'SUCCESS'                                │
│        │      │                Decrement Paper Roll Counter                     │
│        │      │                Emit IPC event: 'print:job-success'              │
│        │      │                                                                 │
│        │      └── Failed?  ──► Status: 'FAILED'                                 │
│        │                       Increment attempts                               │
│        │                       Record last_error                                │
│        │                       Schedule retry with Exponential Backoff          │
│        │                                                                        │
│        └── 4. Reached Max Attempts (5x)? ──► Halt Auto-retry                    │
│                                              Keep in SQLite for Operator Action │
│                                              Dispatch Critical Fleet Alert      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema Specification

### 4.1 SQLite Migration (`kiosk.db`)

Tabel baru `print_queue` dibuat berdampingan dengan `upload_queue`:

```sql
CREATE TABLE IF NOT EXISTS print_queue (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  copies INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  next_retry_at DATETIME,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
CREATE INDEX IF NOT EXISTS idx_print_queue_session ON print_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_print_queue_retry ON print_queue(status, next_retry_at);
```

### 4.2 State Machine Definition

```
                ┌──────────────┐
                │   PENDING    │◄──────────────┐
                └──────┬───────┘               │
                       │ (Worker picks job)    │ (Retry with Backoff)
                       ▼                       │
                ┌──────────────┐               │
                │   PRINTING   │               │
                └──────┬───────┘               │
                       │                       │
         ┌─────────────┴─────────────┐         │
         │                           │         │
(Spooler Success)             (Spooler Error)  │
         ▼                           ▼         │
  ┌─────────────┐             ┌─────────────┐  │
  │   SUCCESS   │             │   FAILED    ├──┘ (attempts < 5)
  └─────────────┘             └──────┬──────┘
                                     │ (attempts >= 5)
                                     ▼
                              ┌─────────────┐
                              │ DEAD_LETTER │ (Requires Operator / Admin Action)
                              └─────────────┘
```

* **`PENDING`**: Pekerjaan cetak baru didaftarkan atau sedang menunggu jadwal giliran/retry.
* **`PRINTING`**: Berkas sedang dialirkan ke spooler printer Windows.
* **`SUCCESS`**: Spooler Windows menerima berkas tanpa error dan buffer telah dialirkan ke printer.
* **`FAILED`**: Terjadi kegagalan spooling/hardware; dijadwalkan untuk retry otomatis jika `attempts < max_attempts`.
* **`CANCELLED`**: Pekerjaan dibatalkan secara manual oleh operator melalui Admin Screen.

---

## 5. Queue & Worker Design

### 5.1 Print Queue Service (`PrintQueueService.ts`)

Layanan baru di Electron main process yang bertanggung jawab atas pengelolaan antrean dan pemrosesan latar belakang:

#### A. Polling Loop Lifecycle
1. Worker berjalan setiap **3 detik** menggunakan interval non-blocking.
2. Memeriksa status kesehatan printer terlebih dahulu melalui `queryPrinterHealth()`:
   - Jika printer `OFFLINE`, `PAPER_OUT`, `JAMMED`, atau `DOOR_OPEN`: worker **menunda eksekusi**, mencatat status di telemetry, dan tidak memaksakan cetak.
   - Jika printer `READY` atau `BUSY`: worker melanjutkan pemeriksaan antrean.
3. Query pekerjaan tertua yang siap diproses:
   ```sql
   SELECT * FROM print_queue 
   WHERE status = 'PENDING' 
      OR (status = 'FAILED' AND attempts < max_attempts AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')))
   ORDER BY created_at ASC 
   LIMIT 1;
   ```

#### B. Exponential Backoff Formula
Jika terjadi kegagalan, jadwal retry berikutnya dihitung secara deterministik:
$$\text{delaySeconds} = \min(5 \times 2^{\text{attempts}}, 120)$$
- Percobaan 1: Jeda 10 detik
- Percobaan 2: Jeda 20 detik
- Percobaan 3: Jeda 40 detik
- Percobaan 4: Jeda 80 detik
- Percobaan 5: Jeda 120 detik (Percobaan terakhir sebelum memerlukan intervensi teknisi)

#### C. Spooler Deadlock Watchdog (30s Timeout)
Perintah cetak dibungkus dengan batas waktu maksimum 30 detik. Jika proses PowerShell `rundll32` tidak merespons dalam 30 detik:
1. Worker membunuh (*kill*) child process tersebut.
2. Mencatat error: `"Spooler command timed out after 30s"`.
3. Menandai pekerjaan sebagai `FAILED` dan menjadwalkan ulang.

---

## 6. Startup Recovery Design

Saat kiosk dinyalakan ulang (setelah mati lampu, restart Windows, atau crash aplikasi), inisialisasi Electron menjalankan **Print Recovery Protocol**:

```
[KIOSK REBOOT]
      │
      ▼
STAGE 1: Reconcile Hanging Jobs
      │ Execute:
      │ UPDATE print_queue 
      │ SET status = 'FAILED', 
      │     last_error = 'Session interrupted by system restart',
      │     updated_at = datetime('now')
      │ WHERE status = 'PRINTING';
      ▼
STAGE 2: Scan Unprinted Sessions
      │ Execute:
      │ Periksa tabel `sessions` yang berstatus `print_status = 'pending'`
      │ tetapi belum memiliki record di `print_queue`.
      │ Jika ada composite_path yang valid di disk, buatkan print job baru berstatus PENDING.
      ▼
STAGE 3: Verify Physical Printer & Paper
      │ Query hardware status via Win32 CIM / WMI.
      │ Pastikan paper tray terpasang dan kertas tersedia.
      ▼
STAGE 4: Start Background Worker
      │ Worker mulai memproses antrean PENDING dan FAILED secara berurutan.
```

Dengan desain ini, **tidak ada foto yang hilang akibat mati lampu**. Begitu listrik kembali menyala, foto yang belum sempat tercetak akan otomatis keluar dari printer.

---

## 7. Operator Admin UI Design (Print Queue Monitor)

Halaman **AdminScreen (`apps/kiosk/src/screens/AdminScreen.tsx`)** diperkaya dengan modul khusus: **Print Queue Monitor**.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ OPERATOR PANEL: PRINT QUEUE MONITOR                                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Status Printer: [✓ SIAP] | Kertas Tersisa: [ 582 / 700 ] | Antrean Aktif: [ 2 ] │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Filter: [ SEMUA ]  [ PENDING (1) ]  [ GAGAL (1) ]  [ SUKSES (48) ]              │
├─────────────────────────────────────────────────────────────────────────────────┤
│ WAKTU    │ SESSION ID     │ SALINAN │ STATUS   │ PERCOBAAN │ AKSI               │
├──────────┼────────────────┼─────────┼──────────┼───────────┼────────────────────┤
│ 14:32:01 │ session_8a92f1 │ 2 strip │ PENDING  │ 0 / 5     │ [Batal] [Cetak Skrg│
│ 14:28:15 │ session_7b19d4 │ 1 strip │ FAILED   │ 5 / 5     │ [Coba Lagi] [Batal]│
│          │ Error: Kertas macet di dalam printer (JAMMED)                       │
│ 14:15:22 │ session_6c88a0 │ 2 strip │ SUCCESS  │ 1 / 5     │ [Cetak Ulang]      │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Tombol Aksi Massal:                                                             │
│ [ 🔄 Proses Ulang Semua yang Gagal ]      [ ✂️ Uji Potong Kertas (Test Cut) ]   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Kemampuan Operator:
1. **Filter Status**: Memfilter daftar antrean berdasarkan `ALL`, `PENDING`, `FAILED`, dan `SUCCESS`.
2. **Action Per Item**:
   - **Retry Now**: Memaksa antrean yang berstatus `FAILED` untuk langsung dicetak tanpa menunggu backoff timer.
   - **Cancel Job**: Menandai antrean sebagai `CANCELLED` jika customer menolak menunggu dan memilih softfile.
   - **Reprint**: Menambahkan antrean cetak baru untuk sesi yang sudah pernah sukses (*complimentary reprint*).
3. **Retry All Failed**: Tombol satu sentuhan untuk memproses ulang seluruh antrean yang sempat tertahan setelah teknisi selesai membersihkan paper jam atau mengisi ulang gulungan kertas.

---

## 8. Implementation Plan (Step-by-Step)

Pengerjaan dibagi ke dalam 4 langkah terstruktur:

### Langkah 1: Skema Database & Persiapan Service
- Tambahkan pembuatan tabel `print_queue` di `apps/kiosk/electron/services/SyncEngine.ts`.
- Tambahkan prepared statements: `stmtEnqueuePrint`, `stmtGetPendingPrints`, `stmtUpdatePrintStatus`, `stmtListPrintQueue`.

### Langkah 2: Pembuatan `PrintQueueService.ts`
- Buat file baru: `apps/kiosk/electron/services/PrintQueueService.ts`.
- Implementasikan fungsi:
  - `enqueuePrint(sessionId, filePath, copies)`
  - `startPrintWorker()` & `stopPrintWorker()`
  - `reconcileStartupPrintJobs()`
  - `retryPrintJob(id)`
  - `cancelPrintJob(id)`
  - `getPrintQueueList(filter)`

### Langkah 3: Integrasi Kiosk Frontend & IPC Bridge
- Daftarkan IPC handlers di `apps/kiosk/electron/main.ts`:
  - `printer:queue-enqueue`
  - `printer:queue-list`
  - `printer:queue-retry`
  - `printer:queue-cancel`
- Perbarui `apps/kiosk/src/screens/RenderScreen.tsx` / `QRScreen.tsx` untuk memanggil `enqueuePrintJob` alih-alih pemanggilan langsung fire-and-forget.
- Dengarkan status cetak real-time melalui IPC event: `onPrintProgress`, `onPrintSuccess`, `onPrintFailed`.

### Langkah 4: Pembaruan Admin Screen
- Perbarui `apps/kiosk/src/screens/AdminScreen.tsx` dengan tab / panel **Print Queue Monitor**.
- Hubungkan tombol aksi operator (*Retry*, *Cancel*, *Reprint*) ke IPC bridge.

---

## 9. Git Diff Plan

Rencana perubahan file yang akan terjadi saat implementasi dimulai:

```text
[NEW]    apps/kiosk/electron/services/PrintQueueService.ts
         -> Logika worker antrean cetak, rekonsiliasi boot, dan integrasi spooler.

[MODIFY] apps/kiosk/electron/services/SyncEngine.ts
         -> Penambahan tabel print_queue dan query database SQLite.

[MODIFY] apps/kiosk/electron/services/PrintService.ts
         -> Refaktor fungsi printImage agar dapat dipanggil secara terkontrol oleh PrintQueueService.

[MODIFY] apps/kiosk/electron/main.ts
         -> Pendaftaran IPC handlers untuk antrean cetak dan inisialisasi worker saat startup.

[MODIFY] apps/kiosk/src/ipc/bridge.ts
         -> Penambahan tipe data PrintQueueItem dan interface IPC antrean cetak.

[MODIFY] apps/kiosk/src/screens/QRScreen.tsx
         -> Migrasi dari kiosk.printer.print() langsung ke polling status print_queue.

[MODIFY] apps/kiosk/src/screens/AdminScreen.tsx
         -> Penambahan antarmuka Print Queue Monitor untuk teknisi/operator.
```

---

## 10. Risk Assessment & Mitigation

| Risiko Teknis | Dampak | Probabilitas | Mitigasi Arsitektur |
|:---|:---|:---:|:---|
| **Spooler Windows Lockup** | Antrean macet total | Sedang | Worker memiliki batas timeout 30s; me-restart `spoolsv.exe` jika terdeteksi deadlock. |
| **Double Printing Saat Crash** | Kertas terbuang (cetak ganda) | Rendah | Menggunakan status transaksional atomik (`PRINTING`); verifikasi status pekerjaan spooler sebelum retry. |
| **Kapasitas Disk Penuh Akibat File Temp Spooler** | Spooler Windows crash | Rendah | File gambar komposit disimpan di path permanen sesi `/captures/composite/`; tidak membuat duplikat file temp. |
| **Bypass Mode pada Dev Environment** | Developer tanpa printer fisik terhalang | Tinggi | `PrintQueueService` tetap menghormati flag `isBypassMode`; langsung menandai `SUCCESS` seketika dalam mode simulasi. |

---
*Dokumen ini merupakan spesifikasi arsitektur resmi untuk implementasi Phase 3.2: Print Pipeline Hardening. Siap dieksekusi ke tahap pengkodean saat disetujui.*
