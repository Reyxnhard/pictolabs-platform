# ROOT CAUSE ANALYSIS (RCA): CAMERA RELIABILITY & SENSOR SYNCHRONIZATION (CAMERA-01)

**Document ID:** `DOC-RCA-CAMERA-001`  
**Canonical Filename:** `docs/02_EVIDENCE/RCA/CAMERA_RELIABILITY_RCA.md`  
**Investigation Date:** 2026-10-11  
**Author:** Antigravity Core Engineering  
**Branch:** `feature/camera-01-reliability`  
**Current HEAD:** [`b9a6b26`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts) (`fix(camera01): correct camera status transitions and reconnect handling`)  
**Target Hardware:** Pictolabs Pilot Booth #1 (Canon EOS 60D DSLR via USB 2.0 / EDSDK v13.x, ACK-E10 AC Coupler, Integrated USB Webcam)  
**Severity:** **P1 (HIGH USER EXPERIENCE & RELIABILITY DEFECT)** with **P0 DATA INTEGRITY RISK** in edge cases  
**Status:** **REMEDIATION & VERIFICATION COMPLETE — CHECKPOINTS 1 & 2 VERIFIED (FOUNDER PHYSICAL UAT PASS)**  

---

## 1. Executive Summary & Verdict

### 1.1 Executive Verdict (Historical Pre-Implementation)
**HISTORICAL VERDICT:** **`FAIL_PREFLIGHT_FOR_PILOT` (ACTIVE RELIABILITY BLOCKER — RESOLVED)**  
Kiosk camera subsystem pada cabang saat investigasi awal **tidak layak diterjunkan ke produksi pilot (Booth #1)** tanpa remediasi terstruktur. Terdapat 5 cacat arsitektural dan konkurensi konkret yang diinvestigasi di bawah.

### 1.2 Remediation & Closure Status (2026-10-12)
**CURRENT VERDICT:** **`READY_FOR_CHECKPOINT_2_CLOSURE` (PRE-PILOT BLOCKER RESOLVED)**  
- **Checkpoint 1 (IPC Contract & Status Synchronization):** Terimplementasi & ter-commit pada [`b9a6b26`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts). Status IPC ortogonal (`isCanonConnected`, `isLiveView`, `activeSensor`) memisahkan routing intent dari kesiapan sensor nyata.
- **Checkpoint 2 (Capture Pipeline, Sensor Parity, Real-Image Only & SD Freshness):** Terimplementasi penuh pada [`CameraService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts), [`CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx), [`preload.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/preload.ts), dan [`bridge.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/ipc/bridge.ts).
- **Hasil Verifikasi Otomatis (89/89 Checks PASS, 100%):**
  - `test_camera01_checkpoint2_capture_pipeline.mjs`: 27 / 27 PASS
  - `test_camera01_checkpoint1_ipc_status.mjs`: 21 / 21 PASS
  - `run_camera_failure_session_isolation_verification.mjs`: 23 / 23 PASS
  - `run_camera01_checkpoint2_runtime_verification.mjs`: 18 / 18 PASS
  - `npx tsc --noEmit` & `npx tsc -p tsconfig.electron.json --noEmit`: 0 Errors
  - `npm run build` (apps/kiosk): Production bundle sukses (4.10s)
- **Founder Physical UAT di Booth #1:** Seluruh 5 skenario fisik dinyatakan **PASS** oleh Founder.
- **Batasan Terdokumentasi:** Validasi ekstensi `.JPG` dan `candidate.size > 0` pada perangkat lunak adalah pelindung metadata, bukan bukti fisik bahwa siklus penulisan DIGIC 4 telah selesai secara tuntas pada kartu memori fisik. Validasi fisik hardware Booth #1 tetap menjadi gerbang pembuktian definitif.

---

## 2. Arsitektur Subsistem Kamera Saat Ini

Subsistem kamera Pictolabs beroperasi melalui arsitektur hibrida dua tingkat:

```mermaid
sequenceDiagram
    autonumber
    participant React as CaptureScreen.tsx (Renderer)
    participant IPC as Electron IPC Bridge
    participant CamSvc as CameraService.ts (Main Process)
    participant EDSDK as @photolab/canon (Native C++)
    participant DSLR as Canon EOS DSLR Hardware
    participant Webcam as WebRTC getUserMedia

    Note over React,CamSvc: === 1. Inisialisasi Layar (Mount) ===
    React->>IPC: kiosk.camera.startLiveView()
    IPC->>CamSvc: ipcMain.handle('camera:start-live-view')
    CamSvc->>EDSDK: activeCamera.startLiveView()
    CamSvc->>CamSvc: startLiveViewInterval() (~30 FPS setInterval)
    CamSvc-->>React: { success: true, mode: 'canon' }

    Note over React,DSLR: === 2. LiveView Stream Loop (33ms) ===
    loop Every 33ms (~30 FPS)
        CamSvc->>EDSDK: activeCamera.getLiveViewImage()
        CamSvc->>React: mainWindow.webContents.send('camera:live-view-frame', base64Jpeg)
        React->>React: Draw base64 JPEG to HTML5 canvas (liveCanvasRef)
    end

    Note over React,Webcam: === 3. Timeout Fallback (Jika Frame Canon > 2000ms) ===
    opt Canon Frame Terlambat > 2000ms
        React->>Webcam: navigator.mediaDevices.getUserMedia()
        Webcam-->>React: MediaStream -> <video ref={videoRef}>
        React->>React: setCameraSource('webcam')
    end

    Note over React,DSLR: === 4. Shutter Execution (Countdown Selesai) ===
    React->>IPC: kiosk.camera.capturePhoto({ mirrorResult })
    IPC->>CamSvc: ipcMain.handle('camera:capture')
    CamSvc->>CamSvc: clearInterval(liveViewInterval) [Pause LiveView]
    CamSvc->>EDSDK: activeCamera.takePicture()
    
    alt Mode A: Event DownloadRequest
        EDSDK-->>CamSvc: file.downloadToFile(outputPath) [Timeout 2000ms]
    else Mode B: Scan Volume SD Card
        CamSvc->>EDSDK: camera.getVolumes() -> targetFile.downloadToFile()
    else Mode C: Frame LiveView Terakhir
        CamSvc->>CamSvc: Fallback lastLiveViewDataUrl
    else Mode D: Citra Pengujian Darurat
        CamSvc->>CamSvc: generateTestImage() [Solid Blue JPEG via Sharp]
    end

    CamSvc->>CamSvc: startLiveViewInterval() [Resume LiveView]
    CamSvc-->>React: Return data:image/jpeg;base64,...
```

---

## 3. Investigasi Mendalam: Analisis Per Cacat (Issues 1–5)

### Issue 1: Desinkronisasi Sensor Preview vs Final Capture (The Primary Known Defect)
- **Status:** **TERKONFIRMASI SECARA KODE (CONFIRMED DEFECT)**
- **Rujukan Berkas & Kode:**
  - [`apps/kiosk/src/screens/CaptureScreen.tsx:112-147`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L112-L147): Timeout 2000ms memicu `startWebRTCFallback()`, mengaktifkan `<video ref={videoRef}>` dan menyetel `setCameraSource('webcam')`.
  - [`apps/kiosk/src/screens/CaptureScreen.tsx:614-630`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L614-L630): Viewfinder menampilkan elemen `<video>` webcam, menyembunyikan canvas Canon, dan memasang lencana `WEBCAM BACKUP`.
  - [`apps/kiosk/src/screens/CaptureScreen.tsx:218-305`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L218-L305): Perekam video Live Photo WebCodecs mendeteksi `cameraSourceRef.current === 'webcam'` dan merekam klip dari video webcam.
  - [`apps/kiosk/src/screens/CaptureScreen.tsx:450-462`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L450-L462):
    ```typescript
    // In Electron: ALWAYS trigger native Canon shutter via IPC!
    if (isElectron()) {
      try {
        const result = await kiosk.camera.capturePhoto({
          mirrorResult: shouldMirror,
        });
        if (result && typeof result === 'string' && result.length > 50) {
          photoData = result;
        }
      } catch (err) {
        console.error('Capture failed via IPC:', err);
      }
    }
    ```
- **Akar Masalah (Root Cause):**
  Fungsi `takePhoto()` di renderer mengeksekusi `kiosk.camera.capturePhoto()` tanpa memeriksa nilai `cameraSource`. Jika kamera Canon terhubung (atau pulih dari jeda LiveView), `CameraService.ts` memicu rana Canon DSLR (`activeCamera.takePicture()`). Pelanggan berpose melihat lensa webcam (di atas monitor), tetapi foto diambil oleh lensa DSLR Canon (di tengah booth).
- **Dampak Pengguna & Risiko Pilot:**
  - Arah pandangan mata (*eye gaze*) pelanggan melenceng drastis ke arah yang salah.
  - Sudut pengambilan (*framing/crop*) antara viewfinder countdown dan hasil cetak tidak sesuai.
  - Video Live Photo merekam wajah dari webcam, namun foto cetak berasal dari DSLR.

---

### Issue 2: Snapshot WebRTC Mati & Citra Biru pada Electron
- **Status:** **TERKONFIRMASI SECARA KODE (CONFIRMED DEFECT)**
- **Rujukan Berkas & Kode:**
  - [`apps/kiosk/src/screens/CaptureScreen.tsx:464-479`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L464-L479):
    ```typescript
    // WebRTC Fallback Mode (only if outside Electron or IPC had no result): Capture from video element
    if (!photoData && videoRef.current && canvasRef.current) { ... }
    ```
  - [`apps/kiosk/electron/services/CameraService.ts:514-526`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L514-L526):
    ```typescript
    // Absolute fallback if no Canon DSLR is connected
    console.log('[CameraService] Generating simulated fallback capture');
    await generateTestImage(outputPath);
    let fileBuffer = fs.readFileSync(outputPath);
    ...
    return `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;
    ```
- **Akar Masalah (Root Cause):**
  Pada lingkungan Electron, `kiosk.camera.capturePhoto()` **tidak pernah mengembalikan null atau error** saat kamera Canon mati; ia selalu mengembalikan citra biru pekat (`generateTestImage()` Sharp background `rgb(59, 130, 246)`). Akibatnya, kondisi `!photoData` pada baris 465 selalu bernilai `false`, menjadikan kode pengambilan frame `<video>` webcam sebagai **dead code**.
- **Dampak Pengguna & Risiko Pilot:**
  Jika kamera Canon terlepas sebelum sesi foto dan booth beralih ke webcam, pelanggan berpose di depan webcam tetapi cetakan fisik dan softfile QR yang dihasilkan adalah **persegi panjang biru polos**.

---

### Issue 3: Kondisi Balapan Asinkron (*Race Condition*) pada Frame Canon Terlambat
- **Status:** **TERKONFIRMASI SECARA KODE (CONFIRMED DEFECT)**
- **Rujukan Berkas & Kode:**
  - [`apps/kiosk/src/screens/CaptureScreen.tsx:82-88`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L82-L88) vs [`CaptureScreen.tsx:130-141`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L130-L141).
- **Akar Masalah (Root Cause):**
  1. Pada saat mount, `fallbackTimer` disetel 2000ms.
  2. Inisialisasi LiveView Canon pada model DSLR (seperti 60D) membutuhkan pengangkatan cermin (*mirror lock-up*) yang memakan waktu 1500–2200ms.
  3. Jika frame pertama Canon tiba pada 2100ms, timer telah memanggil `startWebRTCFallback()` pada 2000ms.
  4. Pemanggilan `navigator.mediaDevices.getUserMedia()` berlangsung secara asinkron.
  5. Ketika frame Canon tiba di baris 86, `setCameraSource('canon')` dipanggil.
  6. Namun beberapa milidetik kemudian, Promise `getUserMedia()` selesai dan baris 138 mengeksekusi `setCameraSource('webcam')` tanpa memeriksa apakah frame Canon sudah diterima!
- **Dampak Pengguna & Risiko Pilot:**
  Kamera Canon sudah berhasil streaming, tetapi tampilan terpaksa beralih kembali ke webcam, dan kedua stream berjalan bersamaan membebani CPU dan memori.

---

### Issue 4: Viewfinder Membeku Tanpa Notifikasi saat Kabel USB Terlepas (*Silent Disconnect*)
- **Status:** **TERKONFIRMASI SECARA KODE (CONFIRMED DEFECT)**
- **Rujukan Berkas & Kode:**
  - [`apps/kiosk/electron/services/CameraService.ts:209-220`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L209-L220):
    ```typescript
    function onCameraDisconnected(): void {
      console.log('[CameraService] ✗ Canon camera disconnected');
      stopKeepAliveHeartbeat();
      activeCamera = null;
      cameraStatus.isCanonConnected = false;
      cameraStatus.cameraModel = null;
      lastLiveViewDataUrl = null;
      if (liveViewInterval) {
        clearInterval(liveViewInterval);
        liveViewInterval = null;
      }
    }
    ```
- **Akar Masalah (Root Cause):**
  Fungsi `onCameraDisconnected()` membersihkan variabel di main process, tetapi **sama sekali tidak mengirimkan sinyal IPC (seperti `mainWindow.webContents.send('camera:disconnected')`) ke renderer**. Elemen canvas di `CaptureScreen.tsx` tetap mempertahankan frame terakhir yang digambar, memberikan ilusi bahwa kamera masih aktif padahal telah terputus.
- **Dampak Pengguna & Risiko Pilot:**
  Pelanggan berpose di depan viewfinder yang membeku; countdown tetap berjalan; saat shutter berbunyi, aplikasi menghasilkan foto biru atau gagal total.

---

### Issue 5: Risiko Foto Basi pada Mode B SD Card Volume (*Stale File Ingestion*)
- **Status:** **TERKONFIRMASI SECARA KODE DENGAN RISIKO PRIVASI TINGGI**
- **Rujukan Berkas & Kode:**
  - [`apps/kiosk/electron/services/CameraService.ts:83-125`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L83-L125) (`fetchLatestPhotoFromCard`):
    ```typescript
    const files = folder.getEntries();
    if (files && files.length > 0) {
      const last = files[files.length - 1];
      if (last && typeof last.downloadToFile === 'function') {
        targetFile = last;
      }
    }
    ```
- **Akar Masalah (Root Cause):**
  Jika pemotretan `activeCamera.takePicture()` gagal dieksekusi oleh kamera fisik (misalnya karena lensa gagal mengunci fokus pada pencahayaan remang-remang, menghasilkan error SDK `EDS_ERR_TAKE_PICTURE_AF_NG`), Mode A akan timeout dalam 2 detik. Mode B kemudian memindai kartu SD dan mengunduh `files[files.length - 1]`. Karena tidak ada verifikasi timestamp berkas atau pembandingan nama file terhadap *baseline snapshot* sebelum rana ditekan, Mode B akan mengunduh **foto pose sebelumnya atau foto pelanggan sebelumnya** yang tersimpan di kartu SD!
- **Dampak Pengguna & Risiko Pilot:**
  Pelanggan menerima foto orang lain atau foto lama pada lembar cetak fisik, melanggar prinsip isolasi data pelanggan (*data leakage*).

---

## 4. Matriks Perbandingan: Perilaku Terkonfirmasi vs Hipotesis

| Kategori | Deskripsi Fenomena | Basis Bukti | Status Kepastian |
| :--- | :--- | :--- | :---: |
| **Defect 1** | Countdown menggunakan preview webcam, tetapi rana memicu shutter Canon DSLR. | Kode [`CaptureScreen.tsx:450-462`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L450-L462) | **TERKONFIRMASI (CONFIRMED)** |
| **Defect 2** | Fallback capture webcam di Electron mati, digantikan citra biru `generateTestImage()`. | Kode [`CameraService.ts:514-526`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L514-L526) | **TERKONFIRMASI (CONFIRMED)** |
| **Defect 3** | Race condition `getUserMedia` menimpa status frame Canon yang terlambat tiba. | Kode [`CaptureScreen.tsx:82, 138`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L82) | **TERKONFIRMASI (CONFIRMED)** |
| **Defect 4** | Pemutusan USB tidak mengabari renderer, canvas live view membeku diam (*frozen*). | Kode [`CameraService.ts:209-220`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L209-L220) | **TERKONFIRMASI (CONFIRMED)** |
| **Defect 5** | Mode B SD card scan mengunduh foto lama jika kamera gagal memotret akibat AF failure. | Kode [`CameraService.ts:101-125`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L101-L125) | **TERKONFIRMASI (CONFIRMED)** |
| **Hipotesis H-1** | Latensi mirror-up Canon EOS 60D pada suhu dingin/standby melampaui 2000ms. | Observasi hardware Canon 60D; butuh uji fisik Booth #1 | *HIPOTESIS (UNVERIFIED)* |
| **Hipotesis H-2** | Bus USB 2.0 berbagi bandwidth dengan printer DNP DS-RX1 memicu stutter pada LiveView. | Arsitektur controller USB motherboard Booth #1 | *HIPOTESIS (UNVERIFIED)* |
| **Hipotesis H-3** | Serialisasi 30 base64 frames/detik via IPC memicu lonjakan GC pada RAM 8GB. | Analisis proses Node.js; butuh profil memori riil | *HIPOTESIS (UNVERIFIED)* |
| **Hipotesis H-4** | Microswitch pintu baterai coupler DR-E10 sensitif terhadap getaran printer di booth. | Spesifikasi mekanikal bodi Canon 60D | *HIPOTESIS (UNVERIFIED)* |

---

## 5. Dependensi & Aturan Invarian Arsitektur

1. **Invarian Sinkronisasi Sensor (Sensor Parity Rule):**
   > *Sensor yang ditampilkan pada layar countdown (viewfinder) dan direkam oleh klip Live Photo HARUS 100% SAMA dengan sensor fisik yang menangkap foto final.*
2. **Invarian Ketiadaan Citra Sintetis (No Fake Blue Images Rule):**
   > *Kiosk dilarang menghasilkan atau mencetak citra biru statis buatan (`generateTestImage`) dalam sesi pelanggan normal. Jika kamera gagal, sistem harus menangkap frame fallback webcam nyata atau menghentikan alur dengan dialog teknisi yang ramah.*
3. **Invarian Integritas Kartu SD (Fresh File Invariant):**
   > *Mode B tidak boleh mengunduh file dari kartu SD kecuali waktu pembuatan berkas tersebut terbukti tercipta setelah waktu pemicuan rana (`shutterTriggerTimestamp`).*
4. **Invarian Catu Daya AC Coupler (ACK-E10 Coupler Rule):**
   > *Pengoperasian Booth #1 wajib menggunakan DC coupler ACK-E10 / DR-E10 dengan pintu baterai tertutup rapat. Baterai internal LP-E10 dilarang untuk operasional komersial karena memicu sleep otomatis setelah 30 menit.*
5. **Invarian Isolasi Lintas Sesi (Zero Cross-Session Leakage):**
   > *Semua buffer citra, handle resolver, dan frame LiveView wajib dimusnahkan saat sesi berakhir atau terputus (`resetSession()`).*

---

## 6. Rencana Implementasi Bertahap (Minimal Remediation Plan)

Remediasi harus dieksekusi secara bertahap dalam **4 Checkpoint Verifikasi** tanpa merombak total arsitektur yang sudah stabil:

```text
[Checkpoint 1: IPC Contract & Event Synchronization]
  ├── Kirim event 'camera:status-changed' (disconnected, connected) dari main ke renderer
  └── Tambahkan field { activeSensor, error } pada payload CameraStatus
  │
  ▼
[Checkpoint 2: CaptureScreen Sensor Alignment & Fallback Guard]
  ├── Dalam takePhoto(): jika cameraSource === 'webcam', tangkap langsung dari video element!
  ├── Batalkan startWebRTCFallback() jika frame Canon sudah tiba (eliminasi race condition)
  └── Dengarkan event disconnect: tampilkan warning banner & switch ke webcam secara mulus
  │
  ▼
[Checkpoint 3: CameraService Robustness & Mode B Timestamp Gate]
  ├── Hentikan return citra biru pada camera:capture; kembalikan null / status terstruktur
  ├── Catat timestamp sebelum activeCamera.takePicture()
  └── Validasi berkas SD card pada Mode B: hanya unduh jika timestamp > pre-capture baseline
  │
  ▼
[Checkpoint 4: Admin Panel Diagnostics & Foundation for PR-03]
  ├── Sediakan dropdown preferensi kamera di Kiosk Config: 'auto' | 'dslr' | 'webcam'
  ├── Sediakan tombol 'Uji Jepret Foto (Test Shutter)' di Admin Panel
  └── Pastikan pemilihan sensor konsisten sebelum masuk ke PR-03 (Camera Selection UI)
```

---

## 7. Rencana Pengujian Regresi & Checklist UAT Fisik Founder

### 7.1 Rencana Tes Otomatis (Automated Regression Suite)
Perlu dibuat skrip verifikasi otomatis `scripts/run_camera_reliability_verification.mjs`:
- **TC-CAM-01:** Verifikasi bahwa saat `cameraSource === 'webcam'`, fungsi `takePhoto()` mengeksekusi canvas snapshot dari video element dan tidak memicu IPC DSLR.
- **TC-CAM-02:** Verifikasi bahwa `generateTestImage` tidak disajikan ke renderer saat fallback webcam tersedia.
- **TC-CAM-03:** Simulasi late Canon frame (arrived at 2100ms): verifikasi `cameraSource` tetap `'canon'` dan stream webcam dibatalkan dengan benar.
- **TC-CAM-04:** Simulasi disconnect USB saat countdown: verifikasi event disconnect diterima renderer dan viewfinder beralih ke webcam secara anggun.
- **TC-CAM-05:** Simulasi Mode B dengan file SD card bertanggal masa lalu: verifikasi sistem menolak file lama dan tidak mengunduhnya.
- **TC-CAM-06:** Regresi isolasi sesi (`scripts/run_camera_failure_session_isolation_verification.mjs`) tetap lulus 23/23 (100%).

### 7.2 Checklist UAT Fisik Founder di Booth #1
1. **Skenario Normal DSLR:** Ambil 3 pose dengan Canon EOS 60D. Pastikan preview tajam, Live Photo sinkron, dan foto cetak tajam 300 DPI.
2. **Skenario Cabut USB saat Live Countdown:** Cabut kabel USB Canon saat countdown pose 2 sedang berjalan. Pastikan layar langsung beralih ke webcam cadangan tanpa membeku, dan foto pose 2 diambil dari webcam tanpa menghasilkan foto biru.
3. **Skenario Tancap Ulang USB:** Hubungkan kembali kabel USB. Pastikan sistem mendeteksi Canon kembali dan pose berikutnya otomatis kembali menggunakan DSLR.
4. **Skenario Uji Kegagalan Autofokus (Tutup Lensa):** Tutup lensa kamera dengan penutup lensa (memicu AF hunt error). Pastikan sistem tidak mencetak foto lama dari kartu memori SD.
5. **Skenario Kios Standby 30 Menit:** Biarkan kios menyala selama 35 menit tanpa transaksi. Pastikan heartbeat `ExtendShutDownTimer` menjaga kamera tetap terjaga (tidak masuk mode sleep APO).

---

## 9. Rekonsiliasi Implementasi & Verifikasi Akhir (Checkpoints 1 & 2)

### 9.1 Matriks Audit Kode Implementasi Checkpoint 2
| Area Audit | Rujukan Berkas & Baris | Mekanisme & Verifikasi | Status Audit |
| :--- | :--- | :--- | :---: |
| **Sensor Parity** | [`CaptureScreen.tsx:541-605`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L541-L605)<br>[`CameraService.ts:301-310`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L301-L310) | Shutter pada mode webcam langsung melakukan snapshot elemen `<video>` ke canvas di renderer; dilarang memicu IPC rana Canon. Main process menolak pemicuan rana fisik jika diminta sensor webcam (`ERR_WEBCAM_CAPTURE_RENDERER_MANAGED`). | **VERIFIED** |
| **Real-Image Only** | [`CameraService.ts:340-370`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L340-L370)<br>[`CaptureScreen.tsx:609-616`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L609-L616) | `generateTestImage()` dihapus sepenuhnya dari alur pelanggan. Kegagalan pemicuan menghasilkan error terstruktur. Citra kosong (`<50` bytes) ditolak tanpa memajukan pose atau menyimpan foto kosong. | **VERIFIED** |
| **Failure Isolation** | [`CaptureScreen.tsx:609-616`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L609-L616) | Gagal jepret tidak menambah `photos[]`, tidak memajukan `currentPose`, menampilkan error informatif ke pelanggan, dan tombol retake menghapus foto pose terkait secara bersih. | **VERIFIED** |
| **Webcam Lifecycle** | [`CaptureScreen.tsx:80-160`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx#L80-L160)<br>[`preload.ts:25`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/preload.ts#L25) | `stopWebcamStream()` mematikan semua track saat teardown/unmount; late Canon frame membatalkan track webcam yang terlambat datang; sinkronisasi kesiapan melalui `notifyWebcamReady`. | **VERIFIED** |
| **SD-Card Baseline & Freshness** | [`CameraService.ts:123-231`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/CameraService.ts#L123-L231) | Mengambil baseline pra-shutter `getCardFileIndex()`. Pada Mode B, hanya menerima `.jpg` / `.jpeg` (case-insensitive), mewajibkan `size > 0`, menolak file pada baseline, dan menolak fallback ke file lama jika tidak ada file baru. | **VERIFIED** |

### 9.2 Bukti Hasil Eksekusi Suite Verifikasi
1. **Pipeline & Freshness Suite:** `node scripts/test_camera01_checkpoint2_capture_pipeline.mjs` → **27 / 27 PASS (100%)**
2. **IPC Contract & Status Suite:** `node scripts/test_camera01_checkpoint1_ipc_status.mjs` → **21 / 21 PASS (100%)**
3. **Session Data Isolation Suite:** `node scripts/run_camera_failure_session_isolation_verification.mjs` → **23 / 23 PASS (100%)**
4. **Real Electron Runtime Suite:** `node scripts/run_camera01_checkpoint2_runtime_verification.mjs` → **18 / 18 PASS (100%)**
5. **Static Typecheck:** `npx tsc --noEmit` & `npx tsc -p tsconfig.electron.json --noEmit` → **0 Errors**
6. **Production Bundle:** `npm run build` (apps/kiosk) → **Built successfully in 4.10s**

### 9.3 Hasil UAT Fisik Founder (Booth #1 Hardware Gate)
- **Skenario 1 (DSLR Normal Capture):** **PASS** — Shutter Canon EOS 60D merespons normal, foto terunduh via Mode A/B, preview & cetak konsisten.
- **Skenario 2 (Cabut USB saat Live Countdown):** **PASS** — Viewfinder beralih ke webcam cadangan tanpa crash/hang, foto diambil dari webcam tanpa foto biru sintetis.
- **Skenario 3 (Tancap Ulang USB Reconnect):** **PASS** — Kamera Canon terdeteksi kembali otomatis, LiveView menyala ulang tanpa interval ganda, pose berikutnya kembali menggunakan DSLR.
- **Skenario 4 (Uji Tutup Lensa / AF Failure):** **PASS** — Penolakan autofokus tidak menyebabkan pengunduhan foto lama dari kartu memori SD; sistem gagal aman.
- **Skenario 5 (Kios Standby 30 Menit):** **PASS** — Heartbeat `ExtendShutDownTimer` menjaga Canon 60D aktif tanpa masuk mode sleep APO.

### 9.4 Batasan Perangkat Lunak Terdokumentasi
Validasi ekstensi file regex dan ukuran `candidate.size > 0` pada kartu SD adalah pelindung tingkat metadata perangkat lunak. Pemeriksaan ini tidak menjamin penulisan blok sektor fisik flash oleh prosesor DIGIC 4 telah tuntas 100% sebelum pembacaan bus USB dimulai. Oleh karena itu, integritas penulisan hardware fisik tetap diverifikasi definitif melalui UAT fisik Booth #1.

### 9.5 Rekomendasi Penutupan
Seluruh kriteria penerimaan Checkpoint 1 dan Checkpoint 2 telah terpenuhi secara teknis, terverifikasi otomatis, dan dinyatakan PASS pada pengujian fisik hardware. Disarankan untuk memformalkan penutupan CAMERA-01 Checkpoint 2 dan melanjutkan ke PR-03 (Admin Panel Camera Selection UI & Settings).
