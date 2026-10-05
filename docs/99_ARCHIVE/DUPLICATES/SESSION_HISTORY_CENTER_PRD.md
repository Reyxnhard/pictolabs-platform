# Product Requirements Document (PRD)
# V1 Session History Center

**Document Identifier**: `SESSION_HISTORY_CENTER_PRD.md`  
**Status**: APPROVED FOR REVIEW (Design Only — Zero Code Implementation)  
**Author**: Antigravity AI Systems Architect & Core Engineering  
**Target Release**: Pictolabs Enterprise Photobooth Platform v2.0  
**Target Environments**: 
- **Surface A (Edge Kiosk)**: Windows 11 x64, Electron v44.1.1, Touch-First UI (1080×1920 Portrait)
- **Surface B (Central Fleet)**: Web Dashboard (React, Tailwind CSS, PostgreSQL Backend)

---

## 1. Executive Summary & Problem Statement

### 1.1 Executive Summary
The **Pictolabs Photobooth Platform** currently captures, renders, prints, uploads, and synchronizes thousands of customer photo sessions across distributed physical kiosks. While deep backend infrastructure (PostgreSQL, Cloudflare R2, Midtrans QRIS) and robust edge subsystems (Electron Main, SQLite WAL, Sharp 300 DPI Render Engine, Windows Print Spooler) exist, **there is a severe observability and operational gap at the physical booth level**.

Currently, field operators and on-site technicians have **no local interface** on the kiosk to view past sessions, inspect session health, troubleshoot failed uploads, or initiate emergency on-demand physical reprints when hardware jams occur. In the cloud dashboard, while basic support search exists, it lacks a dedicated, unified Session History Center that bridges physical edge spooler states with cloud delivery channels.

The **V1 Session History Center** establishes a unified, dual-surface operational console that provides 100% visibility into the session lifecycle—both offline on the physical kiosk and online in the cloud dashboard.

### 1.2 Problem Statement
1. **Zero On-Device Operator Observability**: If a customer experiences a printer jam, paper exhaustion, or ribbon crease after payment, the field technician opening the Kiosk `AdminScreen` has no interface to browse past sessions or trigger a reprint. The variable `lastSession` in `AdminScreen.tsx` was declared as a stub and never implemented.
2. **Offline Vulnerability**: When internet connectivity is degraded or severed, cloud dashboard support tools are completely unreachable. Field operators cannot assist on-site customers without local kiosk session inspection.
3. **Data Asymmetry Between Edge & Cloud**: Kiosk SQLite tracks rich low-level state (`upload_queue`, `print_queue`, `paper_tracker`, `local_storage_state`), whereas Cloud PostgreSQL tracks financial and customer delivery state (`transactions`, `payments`, `photos`, `redelivery_logs`). There is no unified view correlating these two layers.
4. **Media Lifecycle Blindness**: Field personnel cannot determine whether a session's high-resolution composite is still stored locally on the SSD ("HOT") or has been cleaned by the 7-day retention daemon ("PRUNED"), leading to unpredictable reprint failures.

---

## 2. Technical Audit: Current Session Lifecycle State

A comprehensive code and schema audit was executed across `apps/kiosk`, `apps/backend`, and `apps/dashboard`. Below are the definitive findings for the six core areas requested.

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │               PICTOLABS SESSION LIFECYCLE                   │
                    └─────────────────────────────────────────────────────────────┘
                                                   │
     [Customer Interaction]                        │  [Physical Hardware]
     1. Welcome Screen                             │  • Canon DSLR (EDSDK C++)
     2. Product / Frame Select (2R/4R/6R)          │  • DNP Thermal Printer (Win32)
     3. Payment (Midtrans QRIS / Offline Bypass)   │  • Industrial Touchscreen
     4. Capture (Burst Photo + Live Video)         │
     5. Filter Selection (Sharp 300 DPI)           │
                                                   ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                EDGE KIOSK LAYER (Electron + SQLite)                           │
 ├──────────────────────────────────────────────┬────────────────────────────────────────────────┤
 │ 1. Local Storage:                            │ 2. Local SQLite Tables (kiosk.db - WAL):       │
 │    • captures/ (Raw DSLR captures)           │    • sessions (Session core & sync flags)      │
 │    • composites/ (Rendered 300 DPI JPEGs)    │    • upload_queue (R2 async worker)            │
 │    • videos/ (Live Photo WebM/MP4s)          │    • print_queue (Spooler worker & retries)    │
 │    • kiosk-config.json                       │    • paper_tracker (Roll & consumable counter) │
 │                                              │    • session_recovery_ledger (Crash ledger)    │
 └──────────────────────────────────────────────┴────────────────────────────────────────────────┘
                                │ Sync Engine Worker (30s)
                                │ Upload Worker (4s)
                                ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                CLOUD FLEET LAYER (NestJS + PostgreSQL)                        │
 ├──────────────────────────────────────────────┬────────────────────────────────────────────────┤
 │ 1. Cloud Storage:                            │ 2. PostgreSQL Tables (Prisma ORM):             │
 │    • Cloudflare R2 (S3 API, 30d Lifecycle)   │    • sessions, photos, prints                  │
 │    • Fallback: public/uploads/ (Local Disk)  │    • transactions, payments                    │
 │                                              │    • session_events, redelivery_logs           │
 │                                              │    • booths, devices, booth_health_logs        │
 └──────────────────────────────────────────────┴────────────────────────────────────────────────┘
                                │
                                ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                OPERATOR / SUPPORT INTERACTION SURFACES                        │
 ├──────────────────────────────────────────────┬────────────────────────────────────────────────┤
 │ Surface A: Kiosk Admin Screen (On-Device)    │ Surface B: Fleet Dashboard (Central Web)       │
 │ • Currently: Missing Session UI (STUB ONLY)  │ • Currently: /sessions & /support-search       │
 │ • TARGET V1: Embedded Session History Center │ • TARGET V1: Enhanced Session Observability    │
 └──────────────────────────────────────────────┴────────────────────────────────────────────────┘
```

---

### Audit 1: Existing Session Data Available

| Data Field | Edge SQLite (`sessions`) | Cloud PostgreSQL (`sessions`) | Data Format / Type | Description / Lifecycle Semantics |
| :--- | :---: | :---: | :---: | :--- |
| `id` | Yes (PK) | Yes (PK) | String (UUID / Prefixed) | Canonical identifier (e.g. `session_1788735042748_xyz` or UUIDv4). |
| `created_at` / `createdAt` | Yes | Yes | ISO 8601 UTC String | Exact timestamp when session was initialized. |
| `booth_id` / `boothId` | Indirect (Identity) | Yes (FK) | String (UUID) | Links session to the physical photobooth fleet entity. |
| `status` | Indirect (`print_status`) | Yes | String Enum | Cloud: `PENDING_PAYMENT`, `COMPLETED`, `FAILED`. Edge: `pending`, `printed`, `failed`. |
| `frame_id` / `frameId` | Yes | Yes (FK) | String ('2R', '4R', '6R') | Layout template selected by customer. |
| `filter` | Yes | Event Metadata | String ('none', 'bw', 'sepia', etc.) | Color preset applied to composite. |
| `photos` | Yes | Linked (`Photo[]`) | JSON Array of paths / URLs | Array of individual capture file paths or data URLs. |
| `composite_path` | Yes | Indirect (`Photo.finalUrl`) | Absolute Local Path | Local filesystem path to rendered 300 DPI composite JPEG. |
| `live_video_path(s)` | Yes | Linked (`Photo[]`) | JSON Array of paths | Local filesystem paths to raw and converted Live Photo clips. |
| `remote_url` / `live_video_url` | Yes | Yes (`Photo.rawUrl`) | HTTPS URL String | Cloudflare R2 / CDN public asset download links. |
| `customerEmail` / `customerPhone` | No (Privacy) | Yes | String (Optional) | Customer PII entered at QR screen for digital delivery. |
| `retentionExpiresAt` | Inferred (7 Days) | Yes (30 Days) | ISO Timestamp | Expiration cutoff for cloud and local asset availability. |
| `local_storage_state` | Yes | No | String ('HOT', 'PRUNED', 'EVICTED') | SSD media retention status managed by `StorageRetentionService`. |

---

### Audit 2: Existing Database Tables

#### A. Edge Kiosk SQLite Schema (`kiosk.db` with WAL Mode)
Located at: `%APPDATA%\pictolabs-data\kiosk.db`
1. **`sessions`**: Core edge session log.
   - Columns: `id` (TEXT PK), `created_at` (TEXT), `frame_id` (TEXT), `filter` (TEXT), `photos` (TEXT JSON), `composite_path` (TEXT), `live_video_path` (TEXT), `live_video_paths` (TEXT JSON), `live_video_url` (TEXT), `live_video_urls` (TEXT JSON), `print_status` (TEXT: 'pending'\|'printed'\|'failed'), `synced` (INTEGER: 0\|1), `uploaded` (INTEGER: 0\|1), `remote_url` (TEXT), `local_storage_state` (TEXT: 'HOT'\|'PRUNED'\|'EVICTED').
2. **`upload_queue`**: Asynchronous media uploader queue for Cloudflare R2.
   - Columns: `id` (TEXT PK), `session_id` (TEXT FK), `file_path` (TEXT), `file_type` ('composite'\|'raw'\|'video'), `status` ('PENDING'\|'UPLOADING'\|'COMPLETED'\|'FAILED'), `attempts` (INTEGER), `error_message` (TEXT), `remote_url` (TEXT), `created_at` (TEXT), `updated_at` (TEXT).
3. **`print_queue`**: Persistent Win32 print spooler queue.
   - Columns: `id` (TEXT PK), `session_id` (TEXT FK), `file_path` (TEXT), `printer_name` (TEXT), `copies` (INTEGER), `status` ('PENDING'\|'PRINTING'\|'COMPLETED'\|'FAILED'\|'DEAD_LETTER'\|'CANCELLED'), `attempts` (INTEGER), `max_attempts` (INTEGER default 5), `last_error` (TEXT), `next_retry_at` (TEXT), `created_at` (TEXT), `updated_at` (TEXT).
4. **`paper_tracker`**: Hardware media tracking table.
   - Columns: `id` (INTEGER PK), `roll_capacity` (INTEGER default 700), `prints_consumed` (INTEGER), `prints_remaining` (INTEGER), `warning_threshold` (10), `lockout_threshold` (2), `last_replaced_at` (TEXT), `updated_at` (TEXT).
5. **`session_recovery_ledger`**: Mid-flight crash and recovery state machine.
   - Columns: `id` (TEXT PK), `session_id` (TEXT UNIQUE), `status` ('ACTIVE'\|'RESOLVED'\|'ABANDONED'), `stage` (TEXT), `last_completed_step` (INTEGER), `payload` (TEXT JSON), `error_details` (TEXT), `recovery_attempts` (INTEGER), `expires_at` (TEXT), `created_at` (TEXT), `updated_at` (TEXT).
6. **`kiosk_system_events`**: Audit trail for system health and hardware diagnostics.
   - Columns: `id` (TEXT PK), `event_type` (TEXT), `severity` ('INFO'\|'WARN'\|'ERROR'\|'CRITICAL'), `component` (TEXT), `details` (TEXT), `created_at` (TEXT).

#### B. Cloud Central PostgreSQL Schema (Prisma ORM)
Located at: `apps/backend/prisma/schema.prisma`
1. **`sessions`**: Global session catalog with relations to booth, frame, photos, prints, transactions, and events.
2. **`photos`**: Individual photo assets per session (`sessionId`, `rawUrl`, `finalUrl`, `storageKey`, `sequenceNo`).
3. **`prints`**: Print audit records (`sessionId`, `copies`, `paperSize`, `isSuccess`, `printedAt`).
4. **`transactions`** & **`payments`**: Financial ledger mapping session to Midtrans order ID, amount, payment method (QRIS), payment status (`PENDING`, `SETTLED`, `EXPIRED`), and raw webhook payloads.
5. **`session_events`**: High-granularity lifecycle timeline events (`SESSION_INIT`, `PAYMENT_SETTLED`, `CAPTURE_POSE_1`, `PRINT_COMPLETED`, `R2_UPLOAD_COMPLETED`).
6. **`redelivery_logs`**: Formal audit trail for administrative interventions (`RESEND_EMAIL`, `EXTEND_LINK`, `CLOUD_RESYNC`, `PHYSICAL_REPRINT`).

---

### Audit 3: Existing Local Storage (Edge Kiosk Filesystem)

The kiosk manages local files under the OS user application directory:
- **Root Directory**: `DATA_DIR = path.join(app.getPath('userData'), 'pictolabs-data')`
  - On Windows: `C:\Users\<User>\AppData\Roaming\pictolabs-kiosk\pictolabs-data`
- **Subdirectories**:
  1. `captures/`: Holds raw DSLR/webcam photo captures (`photo_<sessionId>_pose_<N>.jpg`).
  2. `composites/`: Holds rendered 300 DPI composite JPEGs (`composite_<sessionId>_<timestamp>.jpg`).
  3. `videos/`: Holds Live Photo motion files (`live_<sessionId>_pose_<N>.mp4` and `.webm`).
  4. `frames/`: Production frame overlays and PNG transparency templates.
- **Local Browser Storage (LocalStorage in Chromium)**:
  - `pictolabs-bypass-printer`: Flag for virtual print bypass during technician testing.
  - `pictolabs-active-order-id`: Current session Midtrans order identifier.
  - `pictolabs-auto-bypass-payment`: Flag for offline payment simulator bypass.
  - `pictolabs_kiosk_identity`: Cached booth and device binding token.

---

### Audit 4: Existing Rendered Asset Storage

1. **Rendering Pipeline**:
   - Managed by `apps/kiosk/electron/services/RenderEngine.ts`.
   - Uses `sharp` (v0.33) native C++ libvips library.
   - Target format: Print-ready JPEG, 300 DPI, 1200×1800 px (4R ratio).
   - Canvas is composed with photo slots resized, filtered, and composited with transparent frame overlays.
2. **Local Asset Retention**:
   - Handled by `StorageRetentionService.ts`.
   - Normal TTL: **7 days** for raw photos and composites; **3 days** for videos.
   - **Three-Key Safety Lock**: A local asset is strictly protected and CANNOT be purged unless:
     - `Key 1 (TTL)`: File age >= 7 days (or >= 48 hours under emergency low disk).
     - `Key 2 (Cloud Sync)`: `upload_queue.status === 'COMPLETED'`.
     - `Key 3 (Print Settled)`: `print_queue.status === 'COMPLETED'` (no pending or active print jobs).
3. **Cloud Asset Storage (Cloudflare R2)**:
   - S3-compatible object storage configured via `@aws-sdk/client-s3`.
   - Structured Keys: `sessions/{sessionId}/composite.jpg`, `sessions/{sessionId}/pose_{N}.jpg`.
   - Automated 30-day lifecycle rule enforced via `PutBucketLifecycleConfigurationCommand`.
   - Fallback Storage: `apps/backend/public/uploads/` on local disk if R2 credentials are unset.

---

### Audit 5: Existing Upload Tracking

1. **Edge Enqueueing**:
   - Function `createSession()` and `updateSession()` in `SyncEngine.ts` automatically push composite, photos, and video paths to `upload_queue` with status `'PENDING'`.
2. **Background Upload Worker**:
   - `processUploadQueue()` runs periodically every **4,000 ms**.
   - Selects batches of up to 5 pending items (`status IN ('PENDING', 'FAILED') AND attempts < 5`).
3. **Upload Protocol**:
   - Step 1: Kiosk requests presigned URL via `POST /api/storage/presigned-url`.
   - Step 2: Kiosk streams binary buffer directly to R2 endpoint with MD5/SHA256 integrity check.
   - Step 3: Kiosk confirms upload via `POST /api/storage/confirm-upload` using `x-device-secret`.
4. **Completion Flagging**:
   - Once all queue items for a session reach `'COMPLETED'`, `sessions.uploaded` is updated to `1` in SQLite.
   - Cloud backend updates `Session.status = 'COMPLETED'` and inserts records into `photos` table.

---

### Audit 6: Existing Print Tracking

1. **Edge Print Spooler Queue**:
   - Managed by `apps/kiosk/electron/services/PrintQueueService.ts`.
   - Status state machine: `PENDING` -> `PRINTING` -> `COMPLETED` | `FAILED` -> `DEAD_LETTER` | `CANCELLED`.
   - Background worker `startPrintWorker()` polls queue every **3,000 ms**.
   - Exponential backoff retry delays: `[5s, 10s, 20s, 40s, 80s]` up to `max_attempts: 5`.
2. **Hardware Monitor Integration**:
   - `PrinterMonitorService.ts` executes WMI queries (`SELECT * FROM Win32_Printer`) every 5,000 ms.
   - Detects hardware states: `PAPER_OUT`, `LOW_PAPER`, `RIBBON_OUT`, `DOOR_OPEN`, `JAMMED`, `OFFLINE`, `OK`.
   - Updates `PaperTrackerService` to decrement `prints_remaining` and increment `prints_consumed`.
3. **Crash Recovery**:
   - `reconcileStartupPrintJobs()` runs on Electron boot. If an unexpected power failure occurred while a job was `PRINTING`, it safely resets the status to `PENDING` with audit notice `'Interrupted by application crash or restart (recovered)'`.
4. **Cloud Mirroring**:
   - When a print job completes on edge, `SyncEngine` logs a `PRINT_COMPLETED` event to PostgreSQL.

---

## 3. Architectural Gap Analysis: Why V1 Session History Center is Needed

| Operational Capability | Current State | Critical Operational Risk | V1 Session History Center Solution |
| :--- | :--- | :--- | :--- |
| **On-Site Physical Reprint** | Missing in Kiosk UI. (Only available via Cloud Dashboard API). | If printer jams during an internet outage, the operator cannot reprint. Customer demands refund. | **1-Tap Local Reprint Action** directly in Kiosk Admin Screen querying local SQLite spooler. |
| **Edge Storage Inspection** | Invisible. Operator cannot check if image files still exist on the local disk. | Operator attempts reprint on a purged/corrupted session; printer locks up silently. | **Asset Status Badge** (`HOT: Ready`, `PRUNED: Needs Rehydration`, `EVICTED`). |
| **Upload Blocker Resolution** | Automatic retry only. If stuck on network glitch, operator cannot force sync. | Sessions remain unsynced; customers at home cannot download photos from QR code. | **"Force Upload Retry" Button** allowing field technician to re-enqueue failed upload tasks. |
| **Offline Diagnostic Audit** | Kiosk Admin only displays basic hardware health, camera liveview, and PIN. | Technician cannot inspect transaction ID, payment bypass log, or error history for customer disputes. | **Session Diagnostic Drawer** showing full timeline, order ID, and failure points. |
| **Fleet Session Search** | Basic text search by Session ID in Cloud Dashboard. | Support agents cannot filter by booth, branch, date, print status, or payment status simultaneously. | **Unified Multi-Facet Search & Filter Grid** with real-time hardware status correlation. |

---

## 4. Product Goals & Scope (V1)

### 4.1 Product Goals
1. **Zero Customer Abandonment Due to Hardware Malfunction**: Empower on-site operators to inspect any recent session and issue a verified physical reprint within **< 15 seconds**, completely offline.
2. **Total Media Lifecycle Transparency**: Clearly distinguish between local SSD-resident assets and cloud-stored assets with deterministic safety indicators.
3. **Zero-Regression Operational Tooling**: Integrate seamlessly into existing kiosk security (PIN-protected Admin Screen) and dashboard RBAC without interfering with active photo capture workflows.
4. **Auditability & Fraud Prevention**: Ensure every administrative intervention (reprint, force sync, rehydration) creates an immutable diagnostic audit log both locally and in the cloud.

### 4.2 Non-Goals (Out of Scope for V1)
- In-place photo editing or frame modifications after rendering.
- Direct customer-facing self-service reprint kiosk screen (reprints remain strictly operator-authenticated).
- Exporting raw DSLR RAW/CR2 files to external USB drives (JPEG and MP4 assets only).

---

## 5. System Architecture: Dual-Surface Design

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                     V1 SESSION HISTORY CENTER                          │
   └────────────────────────────────────────────────────────────────────────┘
                       │                                │
                       ▼                                ▼
       ┌──────────────────────────────┐  ┌──────────────────────────────┐
       │   SURFACE A: KIOSK ON-DEVICE │  │   SURFACE B: CLOUD FLEET     │
       │   (Local Edge Administration)│  │   (Central Web Dashboard)    │
       ├──────────────────────────────┤  ├──────────────────────────────┤
       │ • Touchscreen Optimized     │  │ • Desktop Multi-Column Grid  │
       │ • 100% Offline Capable       │  │ • Multi-Booth Fleet Search   │
       │ • Queries Local SQLite       │  │ • Queries Central PostgreSQL │
       │ • Direct Spooler Injection   │  │ • Remote Reprint Dispatch    │
       │ • Local Asset Status View    │  │ • Financial & QR Audit Trail │
       └──────────────────────────────┘  └──────────────────────────────┘
```

---

## 6. Functional Specifications

### 6.1 Surface A: Kiosk On-Device Session History Center (`AdminScreen.tsx`)

#### A. Location & Navigation
Accessible via the hidden triple-tap trigger on the `WelcomeScreen`, authenticated by the 6-digit Technician/Admin PIN, as a dedicated primary tab: **"Session History"** alongside Hardware, Diagnostics, and Config.

#### B. Component Hierarchy
1. **Session History Header**:
   - Total sessions today, successful prints today, pending uploads indicator, and manual refresh button.
2. **Session Carousel / Scrollable Card Feed**:
   - Large touch targets (min 80px touch height) designed for 1080×1920 portrait touchscreen.
   - Shows latest 50 sessions ordered by `created_at DESC`.
   - Card Thumbnail: Rendered 300 DPI composite preview (rendered via Electron `file://` or custom protocol).
   - Primary Badges:
     - **Timestamp**: e.g., `14:32:05 WIB (12 mins ago)`.
     - **Print Status**: `[COMPLETED]` (Green), `[PRINTING]` (Blue), `[FAILED]` (Red), `[BYPASSED]` (Amber).
     - **Upload Status**: `[CLOUD SYNCED]` (Emerald), `[PENDING]` (Yellow), `[FAILED]` (Rose).
     - **Asset Storage State**: `[HOT: SSD]` (Cyan), `[PRUNED: Cloud Only]` (Slate).
3. **Session Action Drawer / Modal**:
   - Tapping any session card expands a full-screen or slide-up action sheet:
     - **Composite Preview**: Full aspect-ratio high-res preview.
     - **Print Actions**:
       - `[Reprint 1 Copy]`: Enqueues reprint to `print_queue`.
       - `[Reprint 2 Copies]`: For 2R photostrips.
       - Disabled if printer status is `PAPER_OUT`, `DOOR_OPEN`, or `JAMMED`.
     - **Sync Actions**:
       - `[Force Cloud Upload]`: Immediately marks failed items in `upload_queue` as `PENDING` and triggers `processUploadQueue()`.
     - **Diagnostic Ledger**:
       - Session ID (with touch copy button).
       - Order ID / Payment Mode (Midtrans QRIS vs Offline Bypass).
       - Raw captures count, video count, composite path verification.
       - Last error message (if print or upload failed).

---

### 6.2 Surface B: Cloud Fleet Session History Center (`apps/dashboard`)

#### A. Location & Navigation
Accessible at `/sessions` and integrated into `/support-search` in `apps/dashboard`.

#### B. Component Hierarchy
1. **Fleet Aggregate KPI Bar**:
   - Sessions Today (Fleet-wide), Print Success Rate (%), Upload Queue Health, Storage Consumption.
2. **Multi-Facet Filter Toolbar**:
   - `Search`: Session ID, Order ID, Customer Email, Customer Phone.
   - `Booth Selector`: Filter by specific booth (e.g., `PICTOLABS-DEV-01`).
   - `Branch Selector`: Filter by mall or franchise location.
   - `Status Filter`: `ALL`, `COMPLETED`, `PENDING_PAYMENT`, `FAILED`, `PRINT_FAILED`.
   - `Date Range Picker`: Single date or date range.
3. **Dense Data Table (`SessionsTable`)**:
   - Columns: Thumbnail, Session ID, Booth / Branch, Time (WIB), Customer, Payment Status, Print Status, Cloud Storage Status, Actions.
4. **Session Observability & Health Modal (`SessionDetailModal`)**:
   - Comprehensive multi-tab drawer containing:
     - **Overview**: Customer download URL, QR preview, composite image preview, raw capture thumbnails.
     - **Timeline**: Chronological events (`SESSION_INIT` -> `PAYMENT` -> `CAPTURE` -> `PRINT` -> `R2_UPLOAD`).
     - **Hardware Telemetry at Capture**: CPU temp, printer paper count, camera state during session.
     - **Audit Trail**: Redelivery logs, email dispatch logs, remote reprint requests.

---

## 7. Data Models & API Contracts

### 7.1 Kiosk IPC Contracts (`apps/kiosk/electron/preload.ts` & `bridge.ts`)

```typescript
// IPC Channel: 'session:history:list'
export interface KioskSessionHistoryQuery {
  limit?: number;        // default: 50, max: 100
  offset?: number;       // default: 0
  statusFilter?: 'ALL' | 'PRINT_FAILED' | 'UPLOAD_PENDING' | 'COMPLETED';
}

export interface KioskSessionHistoryItem {
  id: string;
  createdAt: string;
  frameId: string;
  filter: string;
  compositePath?: string;
  compositeExists: boolean;
  printStatus: 'pending' | 'printed' | 'failed';
  printAttempts: number;
  lastPrintError?: string | null;
  uploaded: boolean;
  uploadStatus: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'FAILED';
  uploadAttempts: number;
  lastUploadError?: string | null;
  remoteUrl?: string;
  localStorageState: 'HOT' | 'PRUNED' | 'EVICTED';
  photoCount: number;
  hasVideo: boolean;
}

// IPC Channel: 'session:history:reprint'
export interface KioskReprintRequest {
  sessionId: string;
  copies?: number;       // default: 1
  reason?: string;       // e.g. 'PAPER_JAM_RECOVERY', 'DEFECTIVE_CUT'
}

export interface KioskReprintResponse {
  success: boolean;
  printJobId?: string;
  error?: string;
  queueStatus: 'ENQUEUED' | 'REJECTED';
}

// IPC Channel: 'session:history:force-upload'
export interface KioskForceUploadRequest {
  sessionId: string;
}

export interface KioskForceUploadResponse {
  success: boolean;
  enqueuedCount: number;
  error?: string;
}
```

### 7.2 Backend REST Contracts (`apps/backend/src/sessions/`)

```typescript
// GET /api/sessions
// Query parameters:
// ?page=1&limit=20&search=...&boothId=...&branchId=...&status=...&date=YYYY-MM-DD

export interface SessionListResponse {
  data: Array<{
    id: string;
    boothId: string;
    boothName: string;
    branchId: string | null;
    branchName: string;
    status: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    photoCount: number;
    printCount: number;
    printSuccess: boolean;
    storageSynced: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// POST /api/sessions/:id/remote-reprint
export interface RemoteReprintDto {
  copies: number;
  reason: 'PAPER_JAM' | 'PRINT_DEFECT' | 'CUSTOMER_TYPO' | 'CUSTOMER_COURTESY';
  operatorEmail: string;
}
```

---

## 8. Touch-First UI/UX Specification (Kiosk Surface A)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        KIOSK ADMIN PANEL (1080 x 1920)                 │
├────────────────────────────────────────────────────────────────────────┤
│ [Hardware]  [Diagnostics]  [★ SESSION HISTORY ★]  [Config]   [Exit X] │
├────────────────────────────────────────────────────────────────────────┤
│  TODAY SESSIONS: 42   │   PRINTS: 41/42   │   UPLOAD QUEUE: 0 PENDING   │
├────────────────────────────────────────────────────────────────────────┤
│  [All Sessions]     [Print Issues (1)]     [Upload Pending (0)]        │
├────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ ┌─────────┐  SESSION #1788-9241               14:32 WIB (12m ago)  │ │
│ │ │ [PHOTO] │  Layout: 4R Grid | Filter: Warm                        │ │
│ │ │ PREVIEW │  Print: [ COMPLETED ]    Upload: [ CLOUD SYNCED ]      │ │
│ │ └─────────┘  Storage: [ HOT: SSD ]                                 │ │
│ │              [ View Details ]                [ 🖨️ Quick Reprint ]  │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ ┌─────────┐  SESSION #1788-9102               14:15 WIB (29m ago)  │ │
│ │ │ [PHOTO] │  Layout: 2R Strip | Filter: Black & White              │ │
│ │ │ PREVIEW │  Print: [ FAILED - PAPER JAM ]   Upload: [ COMPLETED ] │ │
│ │ └─────────┘  Storage: [ HOT: SSD ]                                 │ │
│ │              [ View Details ]                [ ⚠️ Resolve & Print ]│ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ ┌─────────┐  SESSION #1788-8834               13:40 WIB (1h ago)   │ │
│ │ │ [PHOTO] │  Layout: 6R Grid | Filter: None                        │ │
│ │ │ PREVIEW │  Print: [ COMPLETED ]    Upload: [ RETRYING (2/5) ]    │ │
│ │ └─────────┘  Storage: [ HOT: SSD ]                                 │ │
│ │              [ View Details ]                [ 🔄 Force Sync ]     │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│                          ▲ Scroll for More (42) ▲                      │
└────────────────────────────────────────────────────────────────────────┘
```

### UI Interaction Rules for Kiosk
1. **Minimum Touch Targets**: All interactive buttons and cards have a minimum touch area of **64×64 pixels** (conforming to ISO 9241-9 industrial touchscreen ergonomics).
2. **Contrast & Visibility**: High-contrast dark theme (`bg-slate-950` with `border-slate-800` and bright semantic status badges) to ensure clear readability under harsh retail mall lighting.
3. **Accidental Press Protection**: Destructive actions or multi-copy reprints require a secondary confirmation modal.
4. **Instant Visual Feedback**: Tapping "Quick Reprint" immediately renders a spinning state and transitions the card badge to `[ ENQUEUED ]` without blocking the GUI.

---

## 9. Edge Cases & Resilience Engineering

| Edge Case Scenario | Failure Mode / Risk | V1 Mitigation & Deterministic Handling |
| :--- | :--- | :--- |
| **Printer Paper Exhaustion During Reprint** | Job enqueued but hardware cannot feed paper. Spooler locks. | `PrintQueueService` checks `PaperTrackerService.prints_remaining`. If `< 1`, the UI disables reprint button and displays *"Insert Paper Roll First"*. |
| **Reprint Attempt on PRUNED Asset** | Local 7-day retention daemon has unlinked the composite JPEG (`local_storage_state === 'PRUNED'`). | Kiosk detects missing local file and triggers **Cloud Rehydration**: downloads composite from Cloudflare R2 back to `composites/` before enqueuing to printer. |
| **Offline Cloud Rehydration** | Kiosk is offline AND local file was pruned. | UI displays explicit warning: *"Asset archived to cloud and kiosk is currently offline. Connect internet to rehydrate."* Prevents silent crashes. |
| **Rapid Double-Tap Reprint** | Operator accidentally taps reprint button twice, wasting expensive DNP thermal media. | Kiosk enforces a **30-second debounce lock** per session ID in `print_queue` via unique index `idx_print_queue_active`. |
| **Database Lock During High-Frequency Writing** | SQLite `BUSY` error during burst capture session. | Kiosk SQLite operates in `WAL` mode (`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`) with a 5,000 ms busy timeout. Read queries for history never block writes. |
| **Corrupted Media File on Disk** | Composite file size is 0 bytes or header is corrupt. | Pre-flight validation checks `fs.statSync().size > 10240`. If corrupted, triggers regeneration via `RenderEngine` using raw photos before printing. |

---

## 10. Security, Privacy & Compliance (PII)

1. **Authentication Gate**:
   - Access to Kiosk Session History is strictly gated behind the 6-digit Technician/Admin PIN stored as salted SHA-256 hash in DPAPI-protected storage.
   - 5 consecutive invalid PIN attempts trigger an exponential **300-second lockout** with audit logging.
2. **On-Screen PII Redaction**:
   - Customer phone numbers and email addresses are masked on the Kiosk display (e.g., `e****h@gmail.com`, `+62 812-****-5541`) to prevent customer data exposure in busy public venues.
3. **Audit Trail**:
   - Every reprint is logged to SQLite `kiosk_system_events` with the operator session ID, timestamp, and hardware serial.
   - When synced to cloud, an immutable record is inserted into `redelivery_logs` (`actionType: 'PHYSICAL_REPRINT'`).

---

## 11. Acceptance Criteria & Definition of Done (DoD)

To consider V1 Session History Center complete when implementation begins, all criteria below must pass 100%:

- [ ] **AC-1.0 (Kiosk UI Integration)**: `AdminScreen.tsx` displays a responsive, touch-friendly "Session History" tab showing the latest 50 sessions queried from SQLite.
- [ ] **AC-1.1 (Offline Operation)**: With Wi-Fi / Ethernet disabled, session history renders completely, composites display cleanly, and local reprints execute to the printer without errors.
- [ ] **AC-1.2 (Hardware Integration)**: Reprinting a session correctly decrements `paper_tracker.prints_remaining` and increments `paper_tracker.prints_consumed`.
- [ ] **AC-1.3 (De-duplication & Debounce)**: Tapping reprint multiple times within 10 seconds generates exactly ONE physical print job.
- [ ] **AC-1.4 (Upload Queue Diagnostics)**: Any session with failed upload items displays an explicit red indicator and allows 1-tap retry that re-awakens `processUploadQueue()`.
- [ ] **AC-1.5 (Cloud Dashboard Correlation)**: Cloud Dashboard `/sessions` displays matching sessions with real-time print and upload status badges.
- [ ] **AC-1.6 (Audit Trail Logging)**: Triggering a reprint logs records in both local `kiosk_system_events` and cloud `redelivery_logs`.
- [ ] **AC-1.7 (Zero Regression)**: Main customer capture flow (`Welcome` -> `Capture` -> `Render` -> `Print`) operates with 0 ms added latency.

---

## 12. Implementation Roadmap (Phased Execution)

```
[Phase 1: Edge IPC & SQLite Query Optimization]
  ├── Expose session history query statements in SyncEngine.ts
  ├── Build IPC channels: 'session:history:list', 'session:history:reprint', 'session:history:force-upload'
  └── Add unit tests for history query indexing and debounce locks
       │
       ▼
[Phase 2: Kiosk Touch UI Implementation]
  ├── Build SessionHistorySection.tsx component inside AdminScreen.tsx
  ├── Implement touch-first session cards, status badges, and action drawer
  └── Integrate local image preview via secure protocol
       │
       ▼
[Phase 3: Cloud Dashboard Integration]
  ├── Enhance Dashboard SessionsPage.tsx with multi-facet filters
  └── Wire remote reprint & health diagnostics directly to fleet booth sockets
       │
       ▼
[Phase 4: Automated E2E Verification & Physical Testing]
  ├── Execute automated test suite (reprint flow, offline test, paper counter sync)
  └── Sign off on Definition of Done (DoD)
```

---
*End of PRD — `SESSION_HISTORY_CENTER_PRD.md` is ready for architecture sign-off.*
