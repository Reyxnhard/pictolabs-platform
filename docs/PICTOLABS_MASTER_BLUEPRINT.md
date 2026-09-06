# PICTOLABS MASTER BLUEPRINT & REBUILD SPECIFICATION

> **Version**: 1.0  
> **Product Name**: Pictolabs  
> **Product Type**: Enterprise Photobooth Platform & Operating System  
> **Target Platform**: Windows 10/11 Kiosk (Client) & Web Cloud (Dashboard & Backend)  

---

## 1. PROJECT BACKGROUND & OBJECTIVE

Pictolabs adalah platform photobooth enterprise yang dirancang berdasarkan hasil *reverse-engineering* mendalam terhadap sistem **Photolab Flipbook Kiosk BASIC**.

### Tujuan Utama
1. **Zero Vendor Lock**: Menghapus seluruh verifikasi lisensi hardware (`node-machine-id`), aktivasi vendor, dan proteksi pihak ketiga (`bytenode`).
2. **Production-Grade Architecture**: Membangun arsitektur terisolasi, modular, *scalable*, dan mudah dipelihara.
3. **Multi-Branch Support**: Mendukung pengelolaan banyak cabang (*branch*) dan banyak booth secara terpusat dari satu Cloud Dashboard.

---

## 2. LINGKUP FITUR (FEATURE SCOPE)

### Fokus Versi 1 (V1)
- **Self Photo Booth**: Alur foto mandiri tanpa operator.
- **Camera Capture**: Kontrol kamera DSLR Canon (via EDSDK C++ native binding) dengan fallback Webcam (WebRTC).
- **Frame & Canvas System**: Pengolahan gambar resolusi tinggi (1200x1800 @ 300 DPI) menumpuk foto di bawah template PNG transparan.
- **Thermal Printing**: Pencetakan otomatis ke printer sublimasi foto (DNP DS-RX1, DS620, DS820, dll.) dengan kalibrasi offset dan pemotongan strip 2R.
- **Digital Delivery**: Galeri foto digital publik diakses melalui QR Code dengan enkripsi link sementara.
- **Dashboard Management**: Pemantauan kesehatan booth, manajemen cabang, dan pengaturan konfigurasi dari jarak jauh (*Remote Configuration*).
- **Offline Resilience**: Booth tetap beroperasi memotret dan mencetak foto saat koneksi internet mati, lalu menyinkronkan data saat online.

### Fitur Ditunda (Fase 5 / Masa Depan)
- Mode Flipbook Imposition
- Pembuatan GIF Animasi
- Processing Video Boomerang
- AI Image Enhancement

---

## 3. ARSITEKTUR TEKNOLOGI (TECH STACK)

### System Topology

```text
┌─────────────────────────────────────────────────────────────┐
│                      PICTOLABS CLOUD                        │
├─────────────────────────────────────────────────────────────┤
│  Next.js 14 Dashboard  ──► NestJS API (Modular Monolith)    │
│  (Tailwind + shadcn/ui)         │                           │
│                                 ▼                           │
│                         PostgreSQL + Prisma                 │
│                                 │                           │
│                     ┌───────────┴───────────┐               │
│                     ▼                       ▼               │
│                Redis + BullMQ         Cloudflare R2         │
│               (Async Upload Queue)   (Private Photo Bucket) │
└─────────────────────────────▲───────────────────────────────┘
                              │
                    WebSocket & REST API
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                      PICTOLABS KIOSK                        │
├─────────────────────────────────────────────────────────────┤
│  Electron + React + TypeScript + Vite                       │
│  ├── UI Layer          ──► React 18 + Tailwind CSS         │
│  └── Service Layer     ──► Decoupled Hardware Engines       │
│      ├── CameraService ──► Canon EDSDK / WebRTC Fallback    │
│      ├── PrintService  ──► DNP Photo Printer / Win Spooler  │
│      ├── RenderEngine  ──► Sharp / Canvas 300 DPI Rendering │
│      └── SyncEngine    ──► Local SQLite/JSON + Sync Queue   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. DATABASE INITIAL SCHEMA (Prisma ORM)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  SUPERADMIN
  COMPANY_ADMIN
  BRANCH_MANAGER
  OPERATOR
}

enum BoothStatus {
  ONLINE
  OFFLINE
  MAINTENANCE
  CAPTURING
  PRINTING
}

enum SessionStatus {
  PENDING_PAYMENT
  CAPTURING
  PROCESSING
  PRINTING
  COMPLETED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  PAID
  EXPIRED
  FAILED
}

enum PaymentMethod {
  QRIS
  VOUCHER
  CASH
  CREDIT_CARD
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(OPERATOR)
  companyId String?
  company   Company? @relation(fields: [companyId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

model Company {
  id        String   @id @default(uuid())
  name      String
  users     User[]
  branches  Branch[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("companies")
}

model Branch {
  id        String   @id @default(uuid())
  name      String
  location  String?
  companyId String
  company   Company  @relation(fields: [companyId], references: [id])
  booths    Booth[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("branches")
}

model Booth {
  id           String           @id @default(uuid())
  name         String
  deviceSecret String           @unique
  branchId     String
  branch       Branch           @relation(fields: [branchId], references: [id])
  status       BoothStatus      @default(OFFLINE)
  config       BoothConfig?
  healthLogs   BoothHealthLog[]
  sessions     Session[]
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@map("booths")
}

model BoothConfig {
  id             String   @id @default(uuid())
  boothId        String   @unique
  booth          Booth    @relation(fields: [boothId], references: [id])
  cameraSettings Json     @default("{\"iso\":100,\"shutterSpeed\":\"1/125\",\"aperture\":\"f/5.6\"}")
  printerSettings Json    @default("{\"paperSize\":\"4R\",\"copies\":1,\"offsetX\":0,\"offsetY\":0}")
  generalSettings Json    @default("{\"price\":35000,\"countdown\":5,\"timeout\":270}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@map("booth_configs")
}

model BoothHealthLog {
  id           String   @id @default(uuid())
  boothId      String
  booth        Booth    @relation(fields: [boothId], references: [id])
  cpuTemp      Float?
  paperCount   Int?
  cameraState  String?
  printerState String?
  rawPayload   Json?
  createdAt    DateTime @default(now())

  @@map("booth_health_logs")
}

model Session {
  id          String        @id @default(uuid())
  boothId     String
  booth       Booth         @relation(fields: [boothId], references: [id])
  status      SessionStatus @default(PENDING_PAYMENT)
  frameId     String?
  frame       Frame?        @relation(fields: [frameId], references: [id])
  photos      Photo[]
  prints      Print[]
  transaction Transaction?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@map("sessions")
}

model Photo {
  id         String   @id @default(uuid())
  sessionId  String
  session    Session  @relation(fields: [sessionId], references: [id])
  rawUrl     String?
  finalUrl   String?
  storageKey String?
  sequenceNo Int      @default(1)
  createdAt  DateTime @default(now())

  @@map("photos")
}

model Print {
  id        String    @id @default(uuid())
  sessionId String
  session   Session   @relation(fields: [sessionId], references: [id])
  copies    Int       @default(1)
  paperSize String    @default("4R")
  isSuccess Boolean   @default(false)
  printedAt DateTime?
  createdAt DateTime  @default(now())

  @@map("prints")
}

model Frame {
  id         String       @id @default(uuid())
  name       String
  category   String       @default("4R")
  previewUrl String
  layers     FrameLayer[]
  assets     FrameAsset[]
  sessions   Session[]
  isActive   Boolean      @default(true)
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  @@map("frames")
}

model FrameLayer {
  id        String   @id @default(uuid())
  frameId   String
  frame     Frame    @relation(fields: [frameId], references: [id])
  layerType String   // BACKGROUND, PHOTO_SLOT, STICKER, TEXT, OVERLAY
  zIndex    Int      @default(0)
  config    Json     
  createdAt DateTime @default(now())

  @@map("frame_layers")
}

model FrameAsset {
  id        String   @id @default(uuid())
  frameId   String
  frame     Frame    @relation(fields: [frameId], references: [id])
  assetUrl  String
  assetType String
  createdAt DateTime @default(now())

  @@map("frame_assets")
}

model Transaction {
  id        String   @id @default(uuid())
  sessionId String   @unique
  session   Session  @relation(fields: [sessionId], references: [id])
  amount    Float
  payment   Payment?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("transactions")
}

model Payment {
  id            String        @id @default(uuid())
  transactionId String        @unique
  transaction   Transaction   @relation(fields: [transactionId], references: [id])
  method        PaymentMethod @default(QRIS)
  status        PaymentStatus @default(PENDING)
  paymentRef    String?
  amount        Float
  paidAt        DateTime?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@map("payments")
}

model Voucher {
  id         String   @id @default(uuid())
  code       String   @unique
  discount   Float
  usageLimit Int      @default(1)
  usedCount  Int      @default(0)
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  @@map("vouchers")
}

model QueueJob {
  id        String   @id @default(uuid())
  queueName String   
  payload   Json
  status    String   @default("PENDING")
  attempts  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("queues")
}

model AppUpdate {
  id           String   @id @default(uuid())
  version      String   @unique
  releaseUrl   String
  notes        String?
  targetBooths Json?
  createdAt    DateTime @default(now())

  @@map("updates")
}

model SystemLog {
  id        String   @id @default(uuid())
  level     String   @default("INFO")
  source    String   
  message   String
  meta      Json?
  createdAt DateTime @default(now())

  @@map("logs")
}
```

---

## 5. ALUR KERJA KIOSK (KIOSK OPERATIONAL WORKFLOW)

```text
[WELCOME SCREEN] ──► [SELECT FRAME/LAYOUT] ──► [PAYMENT (QRIS / VOUCHER)]
                                                           │
[PRINT & DIGITAL QR] ◄── [COMPOSITE CANVAS] ◄── [PHOTO CAPTURE (1..N)] ◄┘
```

1. **Idle State**: Menampilkan welcome screen & iklan.
2. **Pilih Layout**: Pilihan 2R (strip) atau 4R (single/multi-pose).
3. **Pembayaran**: Integrasi QRIS (Midtrans) / Bakong KHQR / Kode Voucher. Polling status per 2 detik.
4. **Sesi Memotret**:
   - Stream Live View 30 FPS dari kamera Canon DSLR / Webcam.
   - Hitung mundur audio 5 detik.
   - Trigger shutter hardware & unduh file resolusi penuh ke folder `pictures/`.
5. **Editing & Filter**: Aplikasi filter warna (Original, Black & White, Sepia) dan stiker.
6. **Canvas Rendering**: Sharp / Konva memadukan foto di bawah template frame (1200x1800 @ 300 DPI).
7. **Pencetakan**: Perintah kirim cetak ke printer DNP via Spooler Windows dengan margin offset $(x, y)$.
8. **Digital Delivery**: File diunggah ke Cloudflare R2, QR Code ditampilkan untuk akses galeri temporer.

---

## 6. LINGKUP TAHAPAN PENGEMBANGAN (DEVELOPMENT PHASES)

### Phase 1 — Foundation (Selesai Baseline)
- Struktur Monorepo (`apps/backend`, `apps/dashboard`, `apps/kiosk`, `packages/shared`).
- Skema database 18 tabel di Prisma ORM + PostgreSQL + Docker Compose.
- Backend API NestJS (Auth, Booths, Heartbeat telemetry).
- Dashboard Next.js (Sidebar, Overview, Booth Monitor, Remote Config).
- Kiosk Electron + React (Service Layer Abstraksi).

### Phase 2 — Core Photobooth Kiosk Engine
- Modul Kamera (Canon EDSDK C++ wrapper & WebRTC fallback).
- Engine Rendering Frame Canvas (Sharp 300 DPI).
- Modul Printer Sublimasi (DNP DS-RX1 / DS620 Windows Spooler integration).
- Complete UI flow (Welcome $\rightarrow$ Frame $\rightarrow$ Pay $\rightarrow$ Capture $\rightarrow$ Render $\rightarrow$ Print $\rightarrow$ QR).

### Phase 3 — Cloud Management & Security
- Manajemen Cabang & Unit Booth.
- Pengaturan Remote Config real-time (ISO, Shutter, Aperture, Harga).
- Galeri Digital Publik & Cloudflare R2 Signed URLs (akses sementara).
- Kebijakan Pengunci Kiosk Windows (Script Registry untuk mematikan swipe edge & charms bar).

### Phase 4 — Design Studio Platform
- Web Frame Editor (Upload gambar frame, tentukan koordinat slot foto & z-index).
- Asset Library Manager.

### Phase 5 — Advanced Features
- Flipbook card imposition generator.
- Animasi GIF & video boomerang MP4.
- AI photo enhancement.

---

## 7. CARA SETUP & MEMULAI DARI NOL (PETUNJUK REBUILD)

Buka terminal di lokasi proyek baru:

```bash
# 1. Inisialisasi Monorepo
mkdir pictolabs && cd pictolabs
npm init -y

# 2. Setup Workspaces
# Tambahkan "workspaces": ["apps/*", "packages/*"] di package.json

# 3. Buat Aplikasi
# - Backend: NestJS + Prisma
# - Dashboard: Next.js + Tailwind
# - Kiosk: Electron + React + Vite
# - Shared: Package tipe TypeScript

# 4. Jalankan PostgreSQL & Redis
docker-compose up -d

# 5. Push Skema Prisma
cd apps/backend && npx prisma db push && npx prisma generate

# 6. Build & Dev
npm run build
npm run dev
```

---

Dokumen master ini adalah **landasan tunggal (Single Source of Truth)** untuk pengembangan sistem **Pictolabs**.
