# FOUNDER ACCEPTANCE TEST (UAT) CHECKLIST

**Document Reference**: `FOUNDER_UAT_CHECKLIST.md`  
**Target Milestone**: Founder Acceptance Testing & Pilot Booth Onboarding  
**Platform**: Pictolabs Photobooth Kiosk Platform (Windows 11 x64 + Cloud VPS)  
**Starting Point**: Welcome Screen (`WelcomeScreen.tsx`)  
**Ending Point**: Print Complete + Digital QR Download Available (`QRScreen.tsx` & `/d/:sessionId`)  
**Status**: READINESS AUDIT COMPLETE — FROZEN ARCHITECTURE

---

## Executive Overview

Dokumen ini merupakan panduan audit dan verifikasi penerimaan menyeluruh (*Founder Acceptance Test*) untuk memastikan seluruh siklus pengalaman pelanggan (*customer journey*) berjalan mulus, stabil, dan bebas hambatan teknis dari awal hingga akhir.

```text
[1. Welcome Screen]
         │
         ▼
[2. Product Selection] (Photostrip 2R)
         │
         ▼
[3. Payment Screen] (Dynamic QRIS Midtrans)
         │
         ▼
[4. Payment Success] (Webhook / Polling Confirmation)
         │
         ▼
[5. Frame Selection] (Korean Studio Themes)
         │
         ▼
[6. Photo Capture Studio] (3 Poses + Live Photo Clips)
         │
         ▼
[7. Filter & Color Grading] (6 LUT Presets)
         │
         ▼
[8. Preview & 300 DPI Rendering] (Sharp C++ Compositor)
         │
         ▼
[9. Print Execution] (Dye-Sub Win32 Spooler)
         │
         ▼
[10. Digital QR Download & Web Gallery] (Cloudflare R2 + Mobile Landing Page)
```

---

## Step-by-Step Customer Flow Audit

---

### Step 1: Welcome Screen
*Titik awal interaksi pelanggan dengan bilik foto.*

- **Komponen**: `apps/kiosk/src/screens/WelcomeScreen.tsx`
- **Entry Condition**:
  - Kiosk telah selesai booting dan status armada terverifikasi (`identity.json` ada dan berstatus paired).
  - Tidak ada sesi transaksi aktif sebelumnya (kondisi idle).
- **Expected Behavior**:
  - Menampilkan branding acara/kiosk (*PICTOLABS SELF PHOTOBOOTH*) dan animasi floating logo kamera 📸.
  - Menampilkan prompt interaktif: `"TOUCH SCREEN TO START"`.
  - Tombol rahasia Operator/Staff di sudut kanan atas (`btn-kiosk-admin-entry`) berpenampilan semi-transparan (akses PIN: `1234`).
  - Latar belakang gradasi dinamis disesuaikan dengan `themeColor` dari Cloud Config.
  - Setiap 5 detik, memeriksa status kesehatan printer dan sisa kertas. Jika kertas $\le 2$ lembar atau offline, menampilkan banner peringatan merah dan memblokir klik (kecuali mode *Bypass* diaktifkan).
  - Sentuhan/klik pada layar membawa pelanggan ke layar pemilihan produk.
- **Required Backend Services**:
  - WebSocket / HTTP Heartbeat ke Cloud VPS (`https://api.pictolabs.id`) untuk sinkronisasi config (opsional, dapat berjalan offline dengan cache lokal).
- **Required Hardware**:
  - Monitor Touchscreen interaktif.
  - Win32 Photo Printer (DNP / Citizen) dalam status online dan kertas terisi.
- **Failure Scenarios**:
  - Printer kehabisan kertas atau kabel USB terputus.
  - Monitor touchscreen tidak merespons sentuhan (kursor macet).
- **Recovery Scenarios**:
  - Staf dapat menekan tombol `⚡ Bypass` atau membuka `Menu Staf` untuk bypass interlock saat testing/demo.
  - Inactivity Watchdog menjaga konsumsi CPU tetap rendah saat kiosk idle berjam-jam.

---

### Step 2: Product Selection (Pemilihan Format Foto)
*Pelanggan memilih jenis cetakan foto yang diinginkan.*

- **Komponen**: `apps/kiosk/src/screens/ProductSelectScreen.tsx`
- **Entry Condition**:
  - Pelanggan menyentuh layar Welcome Screen.
- **Expected Behavior**:
  - Menampilkan header: `Langkah 1 dari 4: PILIH PRODUK FOTO`.
  - Menampilkan kartu produk unggulan: **PHOTOSTRIP 2R (Dual Strip 5x15 cm, 3 Pose)**.
  - Menampilkan lencana harga resmi: `HARGA SESI: Rp 35.000` (atau sesuai konfigurasi cloud).
  - Visualisasi mockup 3D/animasi dua strip foto kembar bergaya studio Korea.
  - Grid fitur: 2 Lembar Strip 2R, 3 Pose Berbeda, Live Photo & GIF, QR Softfile Digital.
  - Tombol `← KEMBALI` mengembalikan pelanggan ke Welcome Screen.
  - Tombol `PILIH & LANJUT KE PEMBAYARAN →` menyimpan konfigurasi produk ke sesi dan berpindah ke Payment Screen.
- **Required Backend Services**:
  - Tidak ada (data katalog dan harga dibaca dari memori lokal/kiosk config).
- **Required Hardware**:
  - Monitor Touchscreen.
- **Failure Scenarios**:
  - Pelanggan meninggalkan layar tanpa memilih apapun (*abandoned*).
- **Recovery Scenarios**:
  - Inactivity Session Watchdog (`WatchdogService.ts`) mendeteksi ketiadaan input selama > 120 detik dan otomatis mereset kiosk ke Welcome Screen.

---

### Step 3: Payment (Pembayaran QRIS Dinamis)
*Pelanggan melakukan pembayaran menggunakan e-wallet atau mobile banking.*

- **Komponen**: `apps/kiosk/src/screens/PaymentScreen.tsx`
- **Entry Condition**:
  - Pelanggan menekan tombol "PILIH & LANJUT KE PEMBAYARAN".
- **Expected Behavior**:
  - Memeriksa interlock printer: Jika kertas habis, pembayaran dicegah agar pelanggan tidak rugi.
  - Menampilkan loading spinner: `"Membuat QRIS Dinamis... Menghubungkan ke server Midtrans..."`.
  - Meminta pembuatan QRIS melalui IPC `payment:create-qris` ke Cloud VPS.
  - Menampilkan barcode QRIS tajam resolusi tinggi di tengah layar.
  - Menampilkan detail transaksi: `TOTAL TAGIHAN: Rp 35.000`, `ID: TRX_...`, dan logo kompatibilitas bank/e-wallet (BCA, Mandiri, GoPay, OVO, ShopeePay).
  - Memulai countdown timer 270 detik (4 menit 30 detik).
  - Background listener: WebSocket mendengarkan event pembayaran lunas (`onPaymentSettled`) dan fallback polling memeriksa status ke server setiap 3 detik.
  - Tombol `Kembali / Batal` membatalkan transaksi dan kembali ke awal.
  - Tombol `⚡ Bypass Bayar` (khusus testing/founder) mensimulasikan pelunasan seketika.
- **Required Backend Services**:
  - Cloud VPS Gateway (`POST https://api.pictolabs.id/api/payments/qris`).
  - Midtrans Core API / Snap QRIS Engine.
  - Redis Pub/Sub untuk WebSocket push notifikasi.
- **Required Hardware**:
  - Koneksi Internet aktif (kiosk terhubung ke Cloud VPS).
- **Failure Scenarios**:
  - Koneksi internet bilik terputus saat request QRIS.
  - Midtrans API mengalami gangguan atau downtime.
  - Waktu pembayaran habis (timer mencapai 0:00).
- **Recovery Scenarios**:
  - Jika waktu habis: Kiosk otomatis memanggil pembatalan transaksi ke Midtrans dan menampilkan kartu `"WAKTU PEMBAYARAN HABIS"` dengan tombol `"Buat QR Baru"` dan `"Kembali"`.
  - Jika koneksi gagal: Menampilkan pesan error ramah dengan opsi `"Coba Lagi"`.
  - Operator/Founder dapat menekan `⚡ Bypass Bayar` untuk melewati pembayaran dalam pengujian internal.

---

### Step 4: Payment Success (Konfirmasi Pelunasan)
*Sistem mendeteksi pelunasan dan mengunci transaksi.*

- **Komponen**: `apps/kiosk/src/screens/PaymentScreen.tsx`
- **Entry Condition**:
  - Midtrans webhook mengirim callback pelunasan $\rightarrow$ WebSocket atau fallback poller mendeteksi status `paid: true`.
- **Expected Behavior**:
  - Tampilan berganti seketika ke kartu sukses hijau: `"PEMBAYARAN SUKSES! Terima kasih, pembayaran telah terverifikasi otomatis."`.
  - Menampilkan indikator berkedip: `"Membuka katalog frame foto..."`.
  - SQLite recovery ledger menyimpan checkpoint `PAYMENT_SETTLED`. Jika bilik restart tiba-tiba setelah titik ini, pelanggan berhak atas sesi gratis/pemulihan.
  - Jeda visual 1.5 detik sebelum layar otomatis berpindah ke pemilihan desain frame.
- **Required Backend Services**:
  - Webhook Endpoint Cloud VPS (`POST /api/payments/webhook`).
- **Required Hardware**:
  - Tidak ada.
- **Failure Scenarios**:
  - Webhook Midtrans terlambat tiba karena latensi jaringan.
- **Recovery Scenarios**:
  - Fallback Poller (setiap 3 detik) memeriksa status transaksi langsung ke database sehingga layar tetap terbuka maksimal 3 detik setelah bayar sekalipun WebSocket terputus.

---

### Step 5: Frame Design Selection (Pemilihan Desain & Tema Bingkai)
*Pelanggan menentukan nuansa visual bingkai foto.*

- **Komponen**: `apps/kiosk/src/screens/FrameDesignScreen.tsx`
- **Entry Condition**:
  - Pembayaran telah sukses terverifikasi.
- **Expected Behavior**:
  - Menampilkan 6 pilihan tema bingkai artistik:
    1. **Minimalist Studio** (Clean White Frame, Korean Aesthetic)
    2. **Cinematic Noir** (Midnight Black Frame, Kontras Tajam)
    3. **Pastel Dream** (Soft Lilac & Sky Gradient)
    4. **Retro Y2K** (Chrome Stars & Silver)
    5. **Sakura Blossom** (Floral Pink Aesthetic)
    6. **Cyberpunk Neon** (Glow Cyan & Violet)
  - Menampilkan mockup live preview strip di sisi kanan dengan tema yang dipilih.
  - Tombol `"MULAI SESI FOTO (3 POSE) →"` mengunci desain dan membuka studio kamera.
- **Required Backend Services**:
  - Tidak ada (desain lokal).
- **Required Hardware**:
  - Monitor Touchscreen.
- **Failure Scenarios**:
  - Pelanggan bingung memilih dan membiarkan layar terlalu lama.
- **Recovery Scenarios**:
  - Inactivity Watchdog akan menjaga sesi tetap aktif; jika batas waktu terlampaui, checkpoint recovery tersimpan aman di database.

---

### Step 6: Capture Studio (Pemotretan & Live Photo)
*Pelanggan berpose di depan kamera dengan countdown live.*

- **Komponen**: `apps/kiosk/src/screens/CaptureScreen.tsx`
- **Entry Condition**:
  - Pelanggan menekan tombol "MULAI SESI FOTO".
- **Expected Behavior**:
  - Studio kamera aktif seketika:
    - Prioritas 1: Canon EDSDK C++ native binding (DSLR resolusi tinggi, direct canvas rendering).
    - Prioritas 2 (Fallback): WebRTC USB High-Definition Camera.
  - Siklus 3 Pose (Pose 1 dari 3 $\rightarrow$ Pose 2 dari 3 $\rightarrow$ Pose 3 dari 3).
  - Countdown visual 5 detik per pose dengan angka besar di tengah layar.
  - Di latar belakang, Web Worker merekam klip video pendek (3 detik) untuk pembuatan Live Photo dan looping GIF.
  - Saat hitungan mencapai nol, simulasi flash putih fullscreen menyala dan rana kamera berbunyi/mengambil gambar resolusi tinggi.
  - Tinjauan instan (Preview): Menampilkan hasil jepretan dengan dua tombol:
    - `"Ulangi Pose Ini (Retake)"`: Mengambil ulang pose yang kurang memuaskan tanpa biaya.
    - `"Lanjut ke Pose Berikutnya"`: Melanjutkan ke pose selanjutnya.
  - Setelah pose ke-3 disetujui, kiosk otomatis berpindah ke layar filter.
- **Required Backend Services**:
  - Tidak ada (100% komputasi edge di laptop bilik).
- **Required Hardware**:
  - Kamera DSLR/Mirrorless Canon (EOS 1300D, 200D, R100) via USB, atau USB Webcam FHD (Logitech C920/Brio).
  - Lampu studio kontinu / ring light.
- **Failure Scenarios**:
  - Kabel USB kamera Canon terlepas saat sesi berlangsung.
  - Shutter kamera macet atau baterai kamera habis.
  - Disk penuh saat menyimpan file foto mentah.
- **Recovery Scenarios**:
  - Kamera otomatis beralih (*seamless fallback*) ke WebRTC camera jika Canon terputus.
  - Tombol retake memberikan kesempatan pelanggan mengulang pose jika hasil gelap/buram.
  - Jika terjadi kendala fatal, session ledger mencatat stage `CAPTURING`, memungkinkan pelanggan melanjutkan sesi atau mengklaim Rescue Voucher.

---

### Step 7: Filter & Color Grading
*Pelanggan memilih efek pewarnaan artistik untuk hasil fotonya.*

- **Komponen**: `apps/kiosk/src/screens/FilterScreen.tsx`
- **Entry Condition**:
  - Seluruh 3 pose foto telah selesai diambil.
- **Expected Behavior**:
  - Menampilkan frame pratinjau besar beresolusi tinggi dengan foto pose pertama pelanggan.
  - Menampilkan 6 preset filter profesional:
    1. **Original Studio** (Warna natural & jernih)
    2. **Black & White** (Kontras monokrom klasik)
    3. **Warm Retro** (Nuansa hangat lembut)
    4. **Vivid Pop** (Warna cerah ceria)
    5. **Cool Film** (Nuansa sinematik sejuk)
    6. **90s Nostalgia** (Karakter kamera film analog)
  - Sentuhan pada salah satu preset mengubah filter pada foto pratinjau secara instan (real-time GPU acceleration).
  - Tombol `"TERAPKAN & CETAK FOTO →"` menyimpan pilihan filter dan melangkah ke proses rendering komposit.
- **Required Backend Services**:
  - Tidak ada.
- **Required Hardware**:
  - Monitor Touchscreen.
- **Failure Scenarios**:
  - Render preview lambat jika kartu grafis laptop terbebani.
- **Recovery Scenarios**:
  - Filter diterapkan via hardware-accelerated CSS matriks untuk performa 60 FPS.

---

### Step 8: Preview & 300 DPI Rendering
*Mesin komposit Sharp menyusun layout cetak berkualitas studio lab.*

- **Komponen**: `apps/kiosk/src/screens/RenderScreen.tsx`
- **Entry Condition**:
  - Pelanggan mengonfirmasi pilihan filter.
- **Expected Behavior**:
  - Layar animasi progress bar modern dengan tahapan pipeline transparan:
    - *0%–30%*: `"Memproses foto resolusi tinggi..."`
    - *30%–60%*: `"Menyusun frame layout 300 DPI (Sharp C++ Engine)..."`
    - *60%–90%*: `"Menerapkan color grading & LUT filter..."`
  - Engine Sharp C++ (`RenderEngine.ts`):
    - Mengomposisikan 3 foto ke dalam layout Photostrip 2R resolusi 1200x1800 px (300 DPI murni).
    - Membakar border tema bingkai yang dipilih, logo tipografi Pictolabs, dan stempel tanggal.
  - Engine Live Photo & GIF (`LivePhotoEngine.ts`):
    - Menyatukan klip video mentah menjadi animated looping GIF dan video MP4.
  - SyncEngine (`SyncEngine.ts`):
    - Menyimpan rekaman sesi ke database lokal SQLite (`kiosk.db`) dalam mode WAL.
    - Menambahkan komposit, foto mentah, video, dan GIF ke antrean unggah cloud (`upload_queue`).
  - Spooler Cetak (`PrintQueueService.ts`):
    - Mendaftarkan tugas cetak ke antrean printer lokal.
  - Setelah render selesai (< 3 detik), otomatis berpindah ke QR Screen.
- **Required Backend Services**:
  - Tidak ada (100% offline edge processing).
- **Required Hardware**:
  - CPU multi-core & RAM laptop untuk kompilasi gambar Sharp dan muxing video.
  - Ruang penyimpanan NVMe/SSD lokal yang memadai.
- **Failure Scenarios**:
  - File foto mentah corrupt dari memori kamera.
  - Memory leak saat memproses gambar berukuran sangat besar.
- **Recovery Scenarios**:
  - Try-catch block melindungi engine: jika Sharp gagal, engine beralih ke komposit canvas darurat dan mencatat log recovery ke SQLite.

---

### Step 9: Print Execution (Pencetakan Fisik)
*Printer lab dye-sublimation mencetak dan memotong photostrip pelanggan.*

- **Komponen**: `apps/kiosk/electron/services/PrintQueueService.ts` & `apps/kiosk/src/screens/QRScreen.tsx`
- **Entry Condition**:
  - File komposit 300 DPI berhasil digenerasi dan di-spooling.
- **Expected Behavior**:
  - Win32 Print Spooler mengirim data raw bitmap ke driver printer foto DNP/Citizen.
  - Printer mencetak 1 lembar kertas 4x6" dan pisau internal otomatis membelahnya menjadi **2 lembar photostrip kembar berukuran 2x6" (5x15 cm)**.
  - Status cetak pada QR Screen menampilkan progress bar dan ikon printer berputar.
  - Saat selesai mencetak, confetti virtual meledak di layar sebagai perayaan 🎉.
  - Pelacak kertas internal mengurangi sisa kertas (`remainingPaper - 1`).
- **Required Backend Services**:
  - Tidak ada.
- **Required Hardware**:
  - Printer Foto Dye-Sublimation (DNP DS620 / QW410 / Citizen CY-02) terhubung via USB.
  - Roll kertas dan ribbon tinta dye-sub.
- **Failure Scenarios**:
  - Kertas macet (*paper jam*), ribbon tinta putus, atau penutup printer terbuka.
  - Windows print spooler macet atau error.
- **Recovery Scenarios**:
  - Print Queue Retry Engine mencoba ulang spooling otomatis hingga 3 kali dengan jeda eksponensial.
  - **Sistem Rescue Voucher**: Jika printer gagal total secara fisik, bilik otomatis menerbitkan voucher pengganti dengan kode QR di layar agar pelanggan dapat mengambil sesi ulang di bilik lain atau saat printer selesai diperbaiki.

---

### Step 10: QR Download & Mobile Gallery
*Pelanggan mengunduh softfile digital dan video kenangan ke smartphone.*

- **Komponen**: `apps/kiosk/src/screens/QRScreen.tsx` & `apps/backend/src/gallery/gallery.controller.ts`
- **Entry Condition**:
  - Komposit selesai diproses dan tugas cetak berjalan.
- **Expected Behavior**:
  - Layar Kiosk menampilkan kode QR download yang tajam di sisi kanan.
  - Menampilkan carousel interaktif 3 tab:
    - Tab 1: **Hasil Cetak Foto** (Pratinjau strip)
    - Tab 2: **Live Photo** (3 video klip bergerak bersamaan)
    - Tab 3: **Animated GIF** (Looping animasi 3 pose)
  - Timer countdown 60 detik memberikan waktu pelanggan untuk memindai QR code.
  - Tombol `"SELESAI & MULAI SESI BARU"` memungkinkan pelanggan segera mengakhiri sesi untuk antrean berikutnya.
  - **Di Smartphone Pelanggan**:
    - Pelanggan memindai QR dengan kamera HP $\rightarrow$ Terbuka landing page responsif: `https://pictolabs.id/d/:sessionId`.
    - Halaman menampilkan seluruh aset: Strip komposit, foto satuan resolusi penuh, video live, dan looping GIF.
    - Tombol `"Download All (ZIP)"`: Mengunduh seluruh aset dalam 1 file ZIP instan langsung dari Cloudflare R2 tanpa membebani server.
- **Required Backend Services**:
  - Worker sinkronisasi (`SyncEngine.ts`) mengunggah aset ke Cloudflare R2.
  - Backend API (`apps/backend`): Endpoint `/d/:sessionId` dan `/api/gallery/:sessionId/zip`.
- **Required Hardware**:
  - Smartphone pelanggan dengan kamera dan koneksi internet (atau terhubung ke Wi-Fi booth).
- **Failure Scenarios**:
  - Pelanggan memindai QR sebelum file selesai diunggah ke cloud (koneksi 4G booth lambat).
- **Recovery Scenarios**:
  - Halaman galeri web memiliki status *polling progres*: menampilkan pesan ramah *"Foto sedang disinkronkan dari bilik..."* hingga file siap diunduh.
  - Resolusi URL LAN (`http://<LAN_IP>:4000/d/:sessionId`) tersedia sebagai cadangan jika internet cloud mati total.

---

## Technical Audit: Status Fitur & Analisis Risiko

### A. Fitur Yang Masih Bersifat Simulasi / Mocked
1. **Printer Bypass (`pictolabs-bypass-printer`)**:
   - Status: Diaktifkan secara default di local storage agar pengujian antarmuka dan alur kamera dapat dilakukan pada laptop tanpa harus menghubungkan printer fisik DNP DS620.
   - Dampak UAT: Jika printer fisik terhubung, bypass harus dinonaktifkan di Menu Staf untuk memverifikasi pemotongan kertas asli.
2. **Midtrans Dev Simulation**:
   - Status: Tombol `⚡ Bypass Bayar` pada Payment Screen menembak endpoint simulasi `/api/payments/simulate/:orderId` untuk validasi alur cepat. Endpoint live Midtrans QRIS tetap aktif dan terhubung ke akun sandbox/production Midtrans.
3. **Webcam vs Canon EDSDK**:
   - Status: Kiosk memiliki modul ganda. Jika kamera Canon fisik tidak terdeteksi via USB, kiosk otomatis menggunakan WebRTC webcam bawaan laptop agar alur foto tetap dapat diuji.

---

### B. Fitur Yang Belum Lengkap (Incomplete / Post-Pilot Scope)
1. **Pengiriman Otomatis WhatsApp (WA Blast / SMS)**:
   - Status: Fitur sengaja ditunda (*out of scope* untuk Founder UAT). Pengunduhan digital softfile 100% menggunakan scan QR code langsung ke browser smartphone pelanggan.
2. **Pengiriman Email Softfile**:
   - Status: Ditunda ke sprint berikutnya.
3. **Perintah Remote Reboot dari Dashboard**:
   - Status: Dashboard memiliki antarmuka status armada, namun eksekusi restart unit kiosk masih dilakukan secara manual/lokal oleh operator.

---

### C. Known Blockers (Status Terkini)

| Blocker | Level | Status Sebelum UAT | Status Terkini |
| :--- | :---: | :--- | :--- |
| **Activation Screen Freeze (T+5s)** | **P0** | Main thread terkunci 233.8 detik akibat pembersihan storage synchronous. | **RESOLVED & VERIFIED**. Telah diubah ke asynchronous dengan event-loop yields. UAT 10 menit membuktikan 100% responsif (0.9 ms lag). |
| **Payment Screen Blinking Bug** | **P1** | Re-render loop antara `updateSession` dan `useEffect` #3 membuat QR ganda dan berkedip. | **RESOLVED & VERIFIED**. Guard `hasInitializedRef` dan dekopling ref meniadakan kedipan; QR digenerasi tepat 1 kali. |
| **Legacy Auto-Seed Kiosk** | **P1** | Binary terpaket otomatis men-seed `pilot-booth-01`. | **RESOLVED**. Packaged binary terbukti bersih dan deterministik memunculkan `ActivationScreen`. |

---

### D. Area Berisiko Tinggi (High-Risk Operational Areas)

1. **Stabilitas Koneksi USB Kamera Canon**:
   - *Risiko*: Driver C++ native Canon EDSDK sensitif terhadap gangguan kabel USB. Jika kabel longgar saat shutter menyala, proses Electron berisiko mengalami unhandled native exception.
   - *Tindakan Mitigasi*: Gunakan kabel USB dengan pengunci (*tether lock*) dan pastikan fallback WebRTC aktif.
2. **Kapasitas Kertas Printer Dye-Sub**:
   - *Risiko*: 1 roll kertas DNP DS620 memuat 400 lembar (800 strip 2R). Jika roll habis di tengah antrean ramai tanpa staf menyadari, pencetakan akan gagal.
   - *Tindakan Mitigasi*: Kiosk dilengkapi pelacak roll kertas otomatis (`remainingPaper`). Begitu tersisa $\le 2$ lembar, sistem otomatis mengunci pembayaran dan menampilkan layar pemeliharaan untuk isi ulang kertas.
3. **Latensi Jaringan 4G di Lokasi Mall/Bilik**:
   - *Risiko*: Jika modem 4G bilik mengalami penurunan sinyal, pengunggahan video Live Photo (berukuran 1–2 MB per pose) ke Cloudflare R2 dapat tertunda beberapa puluh detik.
   - *Tindakan Mitigasi*: Halaman galeri mobile `/d/:sessionId` telah dilengkapi indikator loading real-time, dan kiosk menyimpan antrean unggah di SQLite lokal sehingga file tidak akan pernah hilang sekalipun modem offline sementara.

---

## Kesimpulan & Rekomendasi Founder UAT

Alur pelanggan dari **Welcome Screen $\rightarrow$ Pemilihan Format $\rightarrow$ Pembayaran $\rightarrow$ Foto Studio $\rightarrow$ Filter $\rightarrow$ Render 300 DPI $\rightarrow$ Cetak $\rightarrow$ Unduh Softfile Digital QR** telah teraudit secara menyeluruh dan berada dalam status **siap untuk Founder Acceptance Testing**.
