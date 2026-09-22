# PANDUAN EKSEKUSI FOUNDER ACCEPTANCE TEST (UAT)
**Document Reference**: `FOUNDER_UAT_EXECUTION_GUIDE.md`  
**Target User**: Founder, Lead QA, Product Owner, Booth Operator  
**Platform**: Windows 11 x64 / Kiosk Hardware Terminal  
**Production Binary**: `release/win-unpacked/Pictolabs Kiosk.exe`  
**Status**: OPERATIONAL MANUAL — ZERO CODE CHANGES  

---

## Ringkasan Eksekutif

Panduan ini disusun khusus bagi Founder untuk melakukan validasi fisik menyeluruh (*hands-on end-to-end verification*) terhadap seluruh siklus interaksi pelanggan (*customer journey*), dari layar awal (*Welcome Screen*) hingga hasil cetak fisik keluar dan file digital dapat diunduh di smartphone melalui kode QR.

Setiap langkah dilengkapi dengan:
- **Cara Pengujian**: Instruksi aksi nyata yang dilakukan penguji.
- **Hasil yang Diharapkan**: Tampilan dan respon sistem saat bekerja normal.
- **Kriteria Lulus (Pass Criteria)**: Syarat objektif kelayakan.
- **Kriteria Gagal (Fail Criteria)**: Indikator anomali yang menggagalkan pengujian.
- **Hardware yang Dibutuhkan**: Perangkat fisik yang terlibat.
- **Metode Bypass**: Prosedur pengujian jika hardware fisik belum tersedia di lokasi tes (misal: pengujian di laptop tanpa printer DNP).

---

## Alur 10 Langkah Pengujian Founder UAT

```text
[Langkah 1: Welcome Screen]
       │
       ▼
[Langkah 2: Pemilihan Produk] (Photostrip 2R)
       │
       ▼
[Langkah 3: Pembayaran QRIS] (Scan BCA/GoPay atau Bypass)
       │
       ▼
[Langkah 4: Konfirmasi Pelunasan] (Payment Settled)
       │
       ▼
[Langkah 5: Pemilihan Desain Frame] (Minimalist, Noir, dll)
       │
       ▼
[Langkah 6: Studio Foto] (Countdown 3 Pose & Live Photo)
       │
       ▼
[Langkah 7: Filter & Color Grading] (Pratinjau Real-Time)
       │
       ▼
[Langkah 8: Render Komposit 300 DPI] (Engine Sharp C++)
       │
       ▼
[Langkah 9: Pencetakan Photostrip] (Dye-Sub Win32 Spooler)
       │
       ▼
[Langkah 10: Unduh Softfile Digital QR & Galeri Web]
```

---

### Langkah 1: Welcome Screen (Layar Pembuka & Status Kiosk)

#### A. Cara Pengujian
1. Pastikan kiosk telah terpasang (*paired*). Buka aplikasi `Pictolabs Kiosk.exe`.
2. Amati tampilan layar pertama kali yang muncul.
3. Diamkan selama 10–15 detik tanpa disentuh untuk memastikan animasi gradasi latar belakang dan logo kamera 📸 mengambang (*floating animation*) berjalan mulus.
4. Periksa sudut kanan atas untuk melihat tombol semi-transparan `Staff`.
5. Sentuh area mana saja di layar (atau klik kiri mouse).

#### B. Hasil yang Diharapkan
- Muncul layar bertuliskan *"PICTOLABS SELF PHOTOBOOTH"* dan tombol prompt *"TOUCH SCREEN TO START"*.
- Latar belakang gradasi warna beranimasi halus (60 FPS).
- Tidak ada kursor Windows berputar (*hourglass/spinning circle*) dan tidak ada notifikasi *"Not Responding"*.
- Begitu layar disentuh, antarmuka langsung berganti ke layar pemilihan produk tanpa jeda (*lag*).

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Layar tampil dalam waktu $< 2$ detik setelah aplikasi dibuka.
- [ ] Tulisan jelas, font tajam, dan layout simetris.
- [ ] Sentuhan layar langsung memicu transisi ke Langkah 2.

#### D. Kriteria Gagal (Fail Criteria)
- Layar freeze atau sistem operasi Windows menampilkan dialog *"Pictolabs Kiosk is not responding"*.
- Layar memunculkan keypad aktivasi padahal booth sudah di-pairing.
- Sentuhan layar tidak merespons sama sekali.

#### E. Hardware yang Dibutuhkan
- Monitor Touchscreen atau laptop pengujian.
- Printer Win32 (DNP / Citizen) online dengan kertas terisi.

#### F. Metode Bypass (Jika Printer Fisik Belum Tersedia)
- Kiosk secara otomatis mengaktifkan `pictolabs-bypass-printer = true` pada localStorage.
- Jika muncul banner merah *"PEMELIHARAAN PRINTER"* di bagian atas, cukup klik tombol kuning **`⚡ Bypass`** langsung pada banner untuk melanjutkan sesi tanpa menghubungkan printer fisik.

---

### Langkah 2: Product Selection (Pemilihan Format Foto)

#### A. Cara Pengujian
1. Periksa judul layar: `Langkah 1 dari 4: PILIH PRODUK FOTO`.
2. Klik kartu produk utama **PHOTOSTRIP 2R**.
3. Amati mockup visual strip foto kembar berputar halus di sisi kanan.
4. Klik tombol `← KEMBALI` sekali untuk menguji navigasi mundur, lalu klik layar Welcome lagi untuk kembali ke pemilihan produk.
5. Klik tombol biru besar di kanan bawah: **`PILIH & LANJUT KE PEMBAYARAN →`**.

#### B. Hasil yang Diharapkan
- Kartu produk Photostrip 2R terpilih dengan outline biru terang dan ikon centang hijau.
- Lencana harga menampilkan: `Rp 35.000` (atau sesuai harga event cloud).
- Grid fitur menampilkan 4 item: 2 Lembar Strip 2R, 3 Pose Berbeda, Live Photo & GIF, QR Softfile Digital.
- Menekan tombol pembayaran membawa sistem langsung ke layar pembayaran.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Tombol `← KEMBALI` berfungsi kembali ke Welcome Screen.
- [ ] Format Photostrip 2R terpilih secara default.
- [ ] Tombol `PILIH & LANJUT KE PEMBAYARAN` memicu perpindahan ke layar QRIS.

#### D. Kriteria Gagal (Fail Criteria)
- Mockup gambar pecah atau tidak muncul (*broken image icon*).
- Tombol lanjut tidak dapat ditekan.
- Harga tidak muncul atau menampilkan `NaN`.

#### E. Hardware yang Dibutuhkan
- Monitor Touchscreen.

#### F. Metode Bypass
- Tidak memerlukan hardware khusus; dapat diuji penuh dengan klik mouse pada laptop.

---

### Langkah 3: Payment Screen (Pembayaran QRIS Dinamis)

#### A. Cara Pengujian
1. Begitu masuk ke layar pembayaran, amati proses generasi QRIS.
2. Periksa apakah barcode QRIS muncul dengan tajam di tengah layar.
3. Periksa keberadaan countdown timer di sudut kanan atas (`⏱ Sisa Waktu: 4:xx`).
4. **Uji Anti-Blink**: Amati layar selama 10–15 detik tanpa menyentuh apapun. Pastikan barcode QRIS **tidak pernah hilang/berkedip** dan spinner loading **tidak pernah muncul kembali**.
5. Amati countdown timer: pastikan angka detik berkurang stabil (misal: 4:27 $\rightarrow$ 4:26 $\rightarrow$ 4:25 ...).
6. Untuk menyelesaikan pembayaran, pilih salah satu opsi:
   - **Opsi Nyata**: Scan QR code menggunakan aplikasi mobile banking (BCA Mobile, Livin, GoPay, OVO, ShopeePay) dengan nominal Rp 35.000 (jika menggunakan Midtrans Production/Sandbox live).
   - **Opsi Bypass Founder**: Klik tombol kuning **`⚡ Bypass Bayar`** di bar navigasi atas atau tombol kecil **`⚡ Bypass`** di samping ID transaksi.

#### B. Hasil yang Diharapkan
- Spinner *"Membuat QRIS Dinamis..."* muncul sesaat (< 1 detik) lalu berganti ke kartu pembayaran putih.
- QRIS barcode beresolusi tajam tampil persis 1 kali tanpa kedip.
- ID transaksi Midtrans tercantum di bagian bawah (contoh: `ID: TRX_554147_...`).
- Timer 270 detik berjalan mundur dengan lancar tanpa melompat-lompat.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] QRIS barcode ter-render tepat satu kali.
- [ ] **NOL KEDIPAN (Zero Blinking)**: Barcode tidak pernah hilang setelah pertama kali muncul.
- [ ] Countdown timer berkurang normal setiap 1 detik.
- [ ] Menekan `⚡ Bypass Bayar` langsung melunasi transaksi.

#### D. Kriteria Gagal (Fail Criteria)
- QR code berkedip/menghilang setelah 1 detik dan memunculkan spinner kembali.
- Menghasilkan dua ID transaksi berbeda dalam 1 sesi.
- Timer macet atau berhenti berjalan.

#### E. Hardware yang Dibutuhkan
- Koneksi Internet aktif (Wi-Fi/LAN/Modem 4G).
- Smartphone dengan aplikasi perbankan (jika menguji pembayaran riil).

#### F. Metode Bypass (Jika Menguji Offline / Tanpa Saldo)
- Tekan tombol **`⚡ Bypass Bayar`** di kanan atas. Sistem akan mensimulasikan pelunasan pembayaran secara lokal dan langsung beralih ke Langkah 4.

---

### Langkah 4: Payment Success (Konfirmasi Pelunasan)

#### A. Cara Pengujian
1. Setelah pembayaran diselesaikan (via scan QR riil atau klik tombol bypass), amati reaksi antarmuka.
2. Jangan menekan tombol apapun selama 2 detik.

#### B. Hasil yang Diharapkan
- Kartu pembayaran seketika berganti menjadi kartu hijau beranimasi:
  - Ikon centang hijau besar `CheckCircle2`.
  - Judul: **`PEMBAYARAN SUKSES!`**.
  - Pesan: *"Terima kasih, pembayaran telah terverifikasi otomatis."*.
  - Lencana: *"Membuka katalog frame foto..."*.
- Setelah jeda 1.5 detik, layar otomatis berpindah sendiri ke `FrameDesignScreen`.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Layar sukses hijau muncul otomatis setelah transaksi lunas.
- [ ] Perpindahan ke layar frame terjadi otomatis dalam waktu 1.5 detik.
- [ ] Checkpoint `PAYMENT_SETTLED` tersimpan di database lokal.

#### D. Kriteria Gagal (Fail Criteria)
- Pembayaran berhasil di HP tetapi layar kiosk tetap macet menunggu pembayaran.
- Layar tertahan di kartu hijau tanpa pernah berpindah ke pemilihan frame.

#### E. Hardware & Backend yang Dibutuhkan
- Cloud VPS Webhook Gateway / Fallback 3s Poller.

#### F. Metode Bypass
- Menggunakan tombol `⚡ Bypass Bayar` otomatis memicu event pelunasan ini.

---

### Langkah 5: Frame Design Selection (Pemilihan Desain Frame)

#### A. Cara Pengujian
1. Amati 6 kartu pilihan tema bingkai yang tersedia.
2. Klik beberapa tema berbeda secara bergantian:
   - *Minimalist Studio* (Putih Bersih)
   - *Cinematic Noir* (Hitam Pekat)
   - *Pastel Dream* (Ungu-Biru Pastel)
   - *Retro Y2K* (Metalik Bintang)
   - *Sakura Blossom* (Floral Pink)
   - *Cyberpunk Neon* (Glow Cyan & Violet)
3. Perhatikan mockup pratinjau di sebelah kanan: pastikan warna bingkai mockup strip berubah secara instan mengikuti kartu yang diklik.
4. Pilih tema favorit, lalu klik tombol biru di kanan bawah: **`MULAI SESI FOTO (3 POSE) →`**.

#### B. Hasil yang Diharapkan
- Setiap tema memiliki styling border dan palet warna yang kontras dan artistik.
- Mockup di sebelah kanan merespons klik seketika tanpa lag rendering.
- Menekan tombol mulai sesi foto langsung mengaktifkan kamera studio.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Ke-6 tema bingkai dapat dipilih dan mengubah pratinjau strip.
- [ ] Tombol `MULAI SESI FOTO (3 POSE)` mengunci pilihan tema dan membuka studio foto.

#### D. Kriteria Gagal (Fail Criteria)
- Mockup frame di sebelah kanan tidak berubah warnanya.
- Klik tombol mulai foto tidak merespons atau crash.

#### E. Hardware yang Dibutuhkan
- Monitor Touchscreen.

#### F. Metode Bypass
- Tidak ada ketergantungan hardware khusus; berjalan 100% pada laptop pengujian.

---

### Langkah 6: Capture Studio (Pemotretan & Live Photo)

#### A. Cara Pengujian
1. Perhatikan tampilan live view kamera di layar.
2. Amati hitungan mundur: `5... 4... 3... 2... 1...`.
3. Pada hitungan nol:
   - Perhatikan kilatan flash putih fullscreen.
   - Amati jendela pratinjau instan foto yang baru saja dijepret.
4. **Uji Fitur Retake (Pose 1)**: Klik tombol **`Ulangi Pose Ini (Retake)`**. Pastikan kamera kembali menghitung mundur 5 detik dan mengambil ulang pose 1 tanpa mengurangi jatah pose.
5. Klik **`Lanjut ke Pose Berikutnya`** (atau tunggu countdown auto-advance).
6. Lanjutkan untuk **Pose 2** dan **Pose 3**.
7. Amati indikator perekaman: selama countdown, klip video 3 detik direkam otomatis di latar belakang untuk Live Photo.

#### B. Hasil yang Diharapkan
- Live view kamera berjalan mulus tanpa patah-patah (30 FPS).
- Hitungan mundur 5 detik presisi dan angka terlihat kontras di tengah layar.
- Efek flash putih fullscreen menyala saat shutter mengambil gambar.
- Pratinjau instan menampilkan foto beresolusi tinggi dengan opsi retake yang berfungsi normal.
- Setelah pose ke-3 selesai, layar otomatis melangkah ke pemilihan filter.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Live view kamera menyala (Canon EDSDK atau WebRTC webcam).
- [ ] 3 foto berhasil diambil secara berurutan.
- [ ] Tombol retake berfungsi mengulang pengambilan foto.
- [ ] File klip WebM tersimpan untuk setiap pose.

#### D. Kriteria Gagal (Fail Criteria)
- Layar kamera hitam pekat atau live view macet.
- Shutter tidak mengambil gambar pada hitungan nol.
- Aplikasi crash saat kabel kamera goyang.

#### E. Hardware yang Dibutuhkan
- Kamera DSLR/Mirrorless Canon (USB) ATAU Webcam USB HD.
- Lampu studio / lighting pencahayaan.

#### F. Metode Bypass (Jika Kamera Canon Fisik Belum Terhubung)
- Kiosk memiliki fitur **Auto-Fallback WebRTC**: Jika kamera Canon tidak terdeteksi di port USB, kiosk secara otomatis mengaktifkan webcam bawaan laptop/PC (`navigator.mediaDevices.getUserMedia`) sehingga pengujian pemotretan 3 pose tetap dapat diselesaikan 100%.

---

### Langkah 7: Filter & Color Grading (Efek Pewarnaan)

#### A. Cara Pengujian
1. Amati frame pratinjau besar di tengah layar yang memuat foto pose pelanggan.
2. Klik satu per satu preset filter yang tersedia:
   - **Original Studio**
   - **Black & White**
   - **Warm Retro**
   - **Vivid Pop**
   - **Cool Film**
   - **90s Nostalgia**
3. Periksa apakah efek pewarnaan pada foto pratinjau berubah seketika mengikuti tombol yang disentuh.
4. Pilih filter yang disukai (misal: *Black & White*), lalu klik tombol: **`TERAPKAN & CETAK FOTO →`**.

#### B. Hasil yang Diharapkan
- Filter diaplikasikan secara instan berkat akselerasi CSS GPU matriks.
- Foto terlihat tajam dan tidak mengalami distorsi rasio aspek.
- Menekan tombol cetak langsung memicu proses komposit resolusi tinggi.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Seluruh 6 filter dapat diaplikasikan dan mengubah warna foto.
- [ ] Filter yang dipilih tersimpan di session state.
- [ ] Transisi mulus ke layar rendering komposit.

#### D. Kriteria Gagal (Fail Criteria)
- Foto pratinjau hilang (*blank box*).
- Filter tidak mengubah warna gambar saat diklik.

#### E. Hardware yang Dibutuhkan
- Monitor Touchscreen / Layar Laptop.

#### F. Metode Bypass
- 100% komputasi CSS edge; tidak membutuhkan hardware eksternal.

---

### Langkah 8: Preview & 300 DPI Rendering

#### A. Cara Pengujian
1. Amati layar progress bar rendering:
   - *0%–30%*: *"Memproses foto resolusi tinggi..."*
   - *30%–60%*: *"Menyusun frame layout 300 DPI (Sharp C++ Engine)..."*
   - *60%–90%*: *"Menerapkan color grading & LUT filter..."*
2. Jangan sentuh layar selama proses ini berlangsung (memakan waktu 1.5–3 detik).

#### B. Hasil yang Diharapkan
- Progress bar bergerak dinamis dari 0% hingga 100%.
- Engine Sharp C++ (`RenderEngine.ts`) menghasilkan file komposit 1200x1800 px (300 DPI murni) di folder penyimpanan lokal.
- Engine Live Photo (`LivePhotoEngine.ts`) menghasilkan animated GIF loop dan video MP4 dari pose foto.
- Sesi transaksi tersimpan permanen di database SQLite `kiosk.db`.
- Antarmuka otomatis berpindah ke `QRScreen` begitu render selesai.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Render selesai dalam waktu $< 3.5$ detik.
- [ ] File komposit JPEG 300 DPI terbentuk di disk lokal (`%APPDATA%/.../composites/`).
- [ ] Tugas cetak berhasil didaftarkan ke spooler antrean printer.

#### D. Kriteria Gagal (Fail Criteria)
- Progress bar macet di 0% atau memunculkan pesan error merah *"Gagal memproses render"*.
- Aplikasi crash atau kehabisan memori (*out of memory*).

#### E. Hardware yang Dibutuhkan
- Multi-core CPU & RAM laptop pengujian.

#### F. Metode Bypass
- Engine komposit berjalan mandiri di dalam binary; tidak memerlukan bypass.

---

### Langkah 9: Print Execution (Pencetakan Fisik Photostrip)

#### A. Cara Pengujian
1. Saat berada di `QRScreen`, perhatikan indikator status printer di sudut kiri atas:
   - Ikon printer berputar dengan progress spooling: `15%` $\rightarrow$ `50%` $\rightarrow$ `90%` $\rightarrow$ `100%`.
2. Saat spooling selesai:
   - Amati semburan animasi confetti virtual 🎉 di layar kiosk.
   - Perhatikan printer fisik DNP DS620 / Citizen: printer mulai menarik kertas, melakukan transfer ribbon dye-sublimation (lapisan Yellow, Magenta, Cyan, Overcoat), dan pisau internal memotong kertas menjadi 2 lembar strip 2x6".
3. Ambil hasil cetak fisik dari baki printer dan periksa kualitas cetakan.

#### B. Hasil yang Diharapkan
- Kertas foto 4x6" dicetak dan otomatis terpotong presisi menjadi dua strip 2x6" kembar.
- Hasil cetakan tajam (300 DPI), warna akurat mengikuti filter yang dipilih, dan teks tanggal/nama booth tercetak jelas di bagian bawah strip.
- Pelacak sisa kertas di database internal kiosk berkurang 1 lembar.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] Win32 printer spooler mengirim tugas cetak tanpa error.
- [ ] Printer fisik memotong kertas menjadi 2 lembar photostrip kembar berukuran 5x15 cm.
- [ ] Cetakan kering seketika (teknologi thermal dye-sublimation) dan siap diambil.

#### D. Kriteria Gagal (Fail Criteria)
- Kertas macet (*paper jam*) atau ribbon robek.
- Printer mencetak 1 lembar 4x6" penuh tanpa membelahnya menjadi 2 strip (pengaturan cut driver salah).
- Hasil cetak bergaris atau pudar.

#### E. Hardware yang Dibutuhkan
- Printer Foto Dye-Sublimation (DNP DS620 / QW410 / Citizen CY-02).
- Kertas dan Ribbon Roll 4x6" (Cut 2x6 mode enabled pada driver printer).

#### F. Metode Bypass (Jika Menguji Tanpa Printer Fisik)
- Kiosk telah dilengkapi **Print Spooler Virtual Simulator**: Jika printer fisik tidak tersambung, kiosk tetap menyimulasikan progress spooling hingga 100%, meledakkan confetti virtual 🎉, dan melanjutkan ke alur digital QR tanpa menghentikan sesi.

---

### Langkah 10: QR Download & Mobile Web Gallery

#### A. Cara Pengujian
1. Pada `QRScreen`, amati kode QR download yang tampil besar di sisi kanan.
2. Buka aplikasi kamera pada smartphone (iPhone Camera atau Android Google Lens).
3. Arahkan kamera smartphone ke kode QR di layar kiosk, lalu klik link URL yang muncul (format: `https://pictolabs.id/d/:sessionId`).
4. **Di Layar Kiosk**:
   - Klik tab **Hasil Cetak Foto** (menampilkan strip 2R).
   - Klik tab **Live Photo** (3 video bergerak berputar bersamaan).
   - Klik tab **Animated GIF** (animasi looping 3 pose bergantian).
   - Perhatikan timer countdown 60 detik di kanan atas.
5. **Di Smartphone Pelanggan**:
   - Periksa halaman galeri web yang terbuka di browser HP.
   - Pastikan strip foto, foto satuan, video live, dan looping GIF tampil rapi.
   - Klik tombol **`Download All (ZIP)`** di smartphone untuk mengunduh seluruh file kenangan dalam 1 file ZIP instan.
6. Pada layar kiosk, klik tombol **`SELESAI & MULAI SESI BARU`** (atau tunggu timer 60s habis).

#### B. Hasil yang Diharapkan
- Smartphone langsung membuka galeri web responsif tanpa perlu login.
- Seluruh aset digital (foto komposit, pose satuan, klip live photo, dan animated GIF) tersedia untuk diunduh.
- Mengklik tombol selesai pada kiosk langsung mengakhiri sesi dan mengembalikan bilik foto ke `WelcomeScreen` dalam status bersih (*clean state*), siap untuk pelanggan berikutnya.

#### C. Kriteria Lulus (Pass Criteria)
- [ ] QR code dapat dipindai oleh kamera smartphone dalam waktu $< 2$ detik.
- [ ] Halaman galeri mobile menampilkan seluruh aset sesi dengan benar.
- [ ] Tombol download ZIP mengunduh paket foto lengkap ke smartphone.
- [ ] Kiosk kembali ke `WelcomeScreen` tanpa sisa data sesi pelanggan sebelumnya.

#### D. Kriteria Gagal (Fail Criteria)
- QR code buram atau link mengarah ke halaman 404 Not Found.
- Galeri web di smartphone kosong atau gambar gagal dimuat.
- Kiosk tidak kembali ke layar awal saat sesi selesai.

#### E. Hardware & Cloud Services yang Dibutuhkan
- Smartphone pelanggan dengan kamera dan internet.
- Worker sinkronisasi Cloudflare R2 (`SyncEngine.ts`).
- Production Cloud VPS API (`apps/backend`).

#### F. Metode Bypass (Jika Bilik Mengalami Gangguan Internet Cloud)
- Kiosk dilengkapi **Local LAN Resolver**: Jika koneksi cloud terputus, kiosk otomatis men-generate URL lokal bilik (`http://<LAN_IP>:4000/d/:sessionId`) sehingga pelanggan yang terhubung ke Wi-Fi booth tetap dapat mengunduh foto langsung dari memori laptop.

---

## Lembar Evaluasi & Checklist Kelulusan Founder UAT

Founder dapat menggunakan tabel ringkasan ini saat melakukan uji coba di bilik:

| No | Tahap Pengujian | Status Kelulusan | Catatan Evaluasi Founder |
|:---:|:---|:---:|:---|
| **1** | **Welcome Screen** | [ ] PASS &nbsp; [ ] FAIL | |
| **2** | **Pemilihan Produk (Photostrip 2R)** | [ ] PASS &nbsp; [ ] FAIL | |
| **3** | **Pembayaran QRIS (Anti-Blink)** | [ ] PASS &nbsp; [ ] FAIL | |
| **4** | **Konfirmasi Pelunasan (Payment Success)** | [ ] PASS &nbsp; [ ] FAIL | |
| **5** | **Pemilihan Desain Frame (6 Tema)** | [ ] PASS &nbsp; [ ] FAIL | |
| **6** | **Capture Studio (3 Pose & Retake)** | [ ] PASS &nbsp; [ ] FAIL | |
| **7** | **Filter & Color Grading (6 Preset)** | [ ] PASS &nbsp; [ ] FAIL | |
| **8** | **Preview & Render Komposit 300 DPI** | [ ] PASS &nbsp; [ ] FAIL | |
| **9** | **Pencetakan Fisik (Potong Ganda 2R)** | [ ] PASS &nbsp; [ ] FAIL | |
| **10** | **Unduh Softfile Digital QR & Galeri HP** | [ ] PASS &nbsp; [ ] FAIL | |

---

## Kesimpulan

Jika seluruh **10 kriteria lulus** di atas tercentang dengan status **PASS**, maka platform bilik foto Pictolabs dinyatakan **SECARA RESMI LULUS FOUNDER ACCEPTANCE TESTING** dan siap untuk peluncuran operasional perdana (*Pilot Commercial Launch*).
