# SPRINT 5A IMPLEMENTATION PLAN: DASHBOARD FOUNDATION
## Enterprise Operational Control Plane for Pictolabs Photobooth Fleet
### (Approved with Minor Revisions)

> **Sprint Identifier**: Sprint 5A  
> **Target Applications**: `apps/dashboard` (React 18 + Vite 6 + Tailwind CSS v4) & `apps/backend` (NestJS 10 + Prisma 6 + PostgreSQL 16)  
> **Source Documents**: `docs/SPRINT_5A_DASHBOARD_PRD.md`, `docs/PICTOLABS_PLATFORM_ARCHITECTURE.md`, `docs/MASTER_PROJECT_STATUS.md`  
> **Approved Revisions**:
> 1. `Photo` remains the temporary source of truth for media storage in Sprint 5A.
> 2. The Dashboard must gracefully tolerate unknown/arbitrary session statuses without failing.
> 3. Gallery UI focuses strictly on `PHOTO`, `PHOTO_STRIP`, and `LIVE_PHOTO`.
> 4. `GIF`, `VIDEO`, and `FLIPBOOK` remain supported in the platform architecture and ZIP archive, but their dedicated UI viewers are deferred.

---

## 1. Executive Summary & Scope Boundaries

Sprint 5A establishes the operational control plane for the single **Owner / Superadmin** to monitor fleet connectivity, track physical kiosk health, search and audit customer sessions, and inspect/distribute customer digital media assets from a centralized web interface.

### Explicit Scope Inclusions
1. **Overview Page**: Real-time KPI summary (Online, Offline, Maintenance Booths, Sessions Today), fleet status snapshot, recent sessions list.
2. **Booths Page**: Comprehensive fleet listing, dynamic status calculation (<60s Online, <5m Degraded, $\ge$5m Offline), software/hardware runtime diagnostics, slide-out Maintenance mode drawer (`PATCH /api/booths/:id/status`).
3. **Sessions Page**: Searchable audit ledger of customer sessions with filters by Session ID, Booth, Branch, Date, and Session Lifecycle Status (with graceful handling of unknown statuses).
4. **Gallery Page (Asset-Centric Focus)**: Inspector supporting `PHOTO_STRIP`, `PHOTO`, and `LIVE_PHOTO`, public link copy (`https://pictolabs.id/d/:sessionId`), direct ZIP bundle download, and email delivery UI action stub.

### Explicit Scope Exclusions (Strictly Enforced)
- ❌ **No Analytics / Trend Charts**: No hourly throughput graphs, historical trends, or conversion funnels.
- ❌ **No Revenue / Finance Dashboard**: No GMV calculations, bank settlements, or cash vs QRIS revenue reports.
- ❌ **No Hardware Telemetry Dashboard**: No CPU temperatures, paper roll gauges, or camera shutter counts (deferred to Sprint 5B / Sprint 4C).
- ❌ **No WhatsApp Alerts**: No automated message dispatching or SMS triggers.
- ❌ **No Remote Configuration**: No remote modification of camera ISO, printer offsets, or pricing settings (remains local/kiosk-managed).
- ❌ **Deferred Gallery Viewers**: Dedicated UI viewers for `GIF`, `VIDEO`, and `FLIPBOOK` are deferred (supported in data and ZIP archive only).

---

## 2. Core Architecture Alignment

The implementation strictly honors the entity hierarchy established in `PICTOLABS_PLATFORM_ARCHITECTURE.md`:

```
Branch (Physical venue / Mall outlet)
└── Booth (Physical kiosk running Electron)
    └── Session (Primary business entity & customer engagement)
        ├── Transaction & Payment (QRIS settlement)
        ├── Prints (DNP thermal print output)
        └── Media / Assets (Asset-centric presentation)
            ├── PHOTO_STRIP (Composite 300 DPI sheet) -> Active Viewer
            ├── PHOTO (Individual DSLR stills)         -> Active Viewer
            ├── LIVE_PHOTO (Micro-video burst)         -> Active Viewer
            └── GIF / VIDEO / FLIPBOOK                 -> Architecture Ready (UI Deferred)
```

### 2.1 Temporary Source of Truth: `Photo` Model
In accordance with user revision #1, the existing `Photo` table remains the **temporary source of truth** for media records in Sprint 5A. This guarantees:
- **Zero Risk of Kiosk Ingestion Regression**: Existing kiosks sending session sync payloads to `POST /api/sessions` will continue to function without database constraint violations or schema mismatches.
- **Asset Abstraction in Service Layer**: The backend `GalleryController` and `SessionsService` will expose an asset-centric schema to the dashboard by reading from `Photo` records and deterministic R2 file prefixes (`composite_`, `photo_`, `live_`).

### 2.2 Resilient Session Status Handling
In accordance with user revision #2, the dashboard must tolerate unknown or arbitrary session statuses:
- **Canonical Lifecycle**:
  `CREATED`, `PAYMENT_PENDING`, `PAID`, `CAPTURING`, `PROCESSING`, `UPLOADING`, `READY`, `PRINTING`, `COMPLETED`, `FAILED`.
- **Legacy & Edge Statuses**:
  Statuses emitted by legacy sync scripts (e.g. `"printed"`, `"CAPTURED"`, `"PENDING_PAYMENT"`), or future statuses, are accepted seamlessly.
- **Defensive UI Rendering**:
  The `LifecycleBadge` component inspects the status string: if it matches a known canonical state, it displays the appropriate semantic color; otherwise, it renders an elegant neutral badge (Slate/Gray) displaying the raw status string. The application never throws runtime exceptions on unexpected status values.

---

## 3. Acceptance Criteria Matrix

| ID | Category | Requirement Description | Verification Method |
| :--- | :--- | :--- | :--- |
| **AC-1.1** | Overview | Renders 4 KPI cards: Online Booths (<60s), Offline Booths ($\ge$300s), Maintenance Booths, Sessions Today. | Automated E2E & UI Test |
| **AC-1.2** | Overview | Displays top 5 recent booths and recent sessions with live relative timestamps. | Component Test |
| **AC-2.1** | Booths | Lists all booths with Branch name, Dynamic Status badge, App Version, Git Commit, and Last Seen. | REST API Test |
| **AC-2.2** | Booths | Inspect drawer displays full runtime hardware/software telemetry and current threshold values. | UI Drawer Test |
| **AC-2.3** | Booths | Toggling Maintenance switch executes `PATCH /api/booths/:id/status` and updates status instantly without reload. | REST & WS Assertion |
| **AC-3.1** | Sessions | Lists sessions paginated (10/page) with Branch name, Booth name, WIB timestamp, and Lifecycle Status pill. | Backend & UI Test |
| **AC-3.2** | Sessions | Supports instant partial search by Session ID and filtering by Booth, Branch, Status, and Date. | API Query Test |
| **AC-3.3** | Sessions (Resilience) | Gracefully renders unknown/arbitrary session statuses in neutral badge without throwing or breaking filters. | Component Resilience Test |
| **AC-3.4** | Sessions | Provides direct `"Inspect Gallery"` action routing to `/gallery?sessionId=:id`. | Navigation Test |
| **AC-4.1** | Gallery | Asset-centric gallery loads assets with active UI viewers for `PHOTO_STRIP`, `PHOTO`, and `LIVE_PHOTO`. | Gallery Service Test |
| **AC-4.2** | Gallery | Photo Strip displays high-res composite preview with modal zoom; individual photos render with pose indices. | UI Component Test |
| **AC-4.3** | Gallery | Live Photos feature HTML5 video player with motion preview. | DOM / Video Test |
| **AC-4.4** | Gallery | "Copy Customer Link" copies `https://pictolabs.id/d/:sessionId` to clipboard with toast confirmation. | Clipboard Test |
| **AC-4.5** | Gallery | "Download ZIP" triggers direct download of session ZIP archive containing all session media. | HTTP Download Test |
| **AC-4.6** | Gallery | Email Delivery form displays user-facing notification indicating delivery stub is ready. | UI Form Test |
| **AC-5.1** | Real-time | WebSocket listener updates booth status pills in real time when `booth_status_changed` event fires. | Socket.IO Client Test |

---

## 4. Development Phases

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             PHASED IMPLEMENTATION PLAN                           │
├───────────────────┬───────────────────┬───────────────────┬──────────────────────┤
│ PHASE 1: DATA &   │ PHASE 2: REST API │ PHASE 3: FRONTEND │ PHASE 4: E2E TESTING │
│ BACKEND SERVICES  │ EXTENSIONS        │ PAGES & COMPONENTS│ & BUILD VALIDATION   │
├───────────────────┼───────────────────┼───────────────────┼──────────────────────┤
│ • Maintain Photo  │ • Sessions Query  │ • AppShell layout │ • sessions.e2e.ts    │
│   as source truth │   (search/filter) │ • Overview Page   │ • gallery.e2e.ts     │
│ • Update Session  │ • Today's Stats   │ • Booths & Drawer │ • Full Typecheck     │
│   indexes         │ • Asset-Centric   │ • Sessions Table  │ • Production build   │
│ • Extend sync     │   Gallery API     │ • Gallery Viewer  │ • Zero regression    │
│   compatibility   │ • Swagger update  │   (Strip, Photo,  │                      │
│                   │                   │    Live Photo)    │                      │
└───────────────────┴───────────────────┴───────────────────┴──────────────────────┘
```

---

## 5. Database Schema & Data Modeling Strategy

In alignment with Revision #1, the existing `Photo` model in PostgreSQL remains the active storage table for photo assets in Sprint 5A. We ensure indexes are optimized for session listing and search queries:

### 5.1 Prisma Schema Specification (`apps/backend/prisma/schema.prisma`)

```prisma
model Session {
  id          String        @id @default(uuid())
  boothId     String
  booth       Booth         @relation(fields: [boothId], references: [id])
  status      String        @default("CREATED") 
  // Supports canonical (CREATED..COMPLETED) and legacy/unknown statuses dynamically
  frameId     String?
  frame       Frame?        @relation(fields: [frameId], references: [id])
  photos      Photo[]       // Active source of truth for photo stills in Sprint 5A
  prints      Print[]
  transaction Transaction?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([boothId])
  @@index([status])
  @@index([createdAt])
  @@map("sessions")
}

model Photo {
  id         String   @id @default(uuid())
  sessionId  String
  session    Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  rawUrl     String?
  finalUrl   String?
  storageKey String?
  sequenceNo Int      @default(1)
  createdAt  DateTime @default(now())

  @@index([sessionId])
  @@map("photos")
}
```

---

## 6. Backend API Changes & Specifications

### 6.1 Reused Endpoints (Sprint 4B Monitoring)
- `GET /api/booths`: Returns all registered booths with dynamically evaluated `status`, `lastSeen`, `runtime`, and nested `branch`.
- `GET /api/booths/:id/status`: Detailed threshold breakdown and runtime telemetry.
- `PATCH /api/booths/:id/status`: Manual administrative `MAINTENANCE` toggle with broadcast to `KioskGateway`.
- `GET /api/booths/:id`: Single booth metadata.
- `GET /api/gallery/:sessionId/zip`: Streams consolidated ZIP archive from R2 storage.

### 6.2 New & Updated Backend Endpoints

#### 1. `GET /api/sessions` (New Search & Listing Endpoint)
- **Controller**: `SessionsController.findAll`
- **Query Parameters**:
  - `search` *(string, optional)*: Case-insensitive partial match on Session ID.
  - `boothId` *(string, optional)*: Filter by booth UUID.
  - `branchId` *(string, optional)*: Filter by branch UUID (joins `booth.branchId`).
  - `status` *(string, optional)*: Filter by status (accepts canonical or custom string).
  - `date` *(string, optional)*: Filter by capture date `YYYY-MM-DD`.
  - `page` *(number, default: 1)*: 1-indexed page.
  - `limit` *(number, default: 10, max: 100)*: Items per page.
- **Response Format**:
  ```json
  {
    "data": [
      {
        "id": "session_1788734918239",
        "boothId": "80e05c47-50f9-4d8a-a6f5-a958f1be5df3",
        "boothName": "PICTOLABS-DEV-01",
        "branchId": "b1a2c3d4-...",
        "branchName": "Grand Indonesia",
        "status": "COMPLETED",
        "photoCount": 4,
        "printCount": 2,
        "createdAt": "2026-09-09T03:15:22.000Z",
        "updatedAt": "2026-09-09T03:17:40.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 142,
      "totalPages": 15
    }
  }
  ```

#### 2. `GET /api/sessions/stats/today` (Operational Counter)
- **Controller**: `SessionsController.getTodayStats`
- **Logic**: Counts sessions created between `00:00:00.000` today and `now` (in `Asia/Jakarta` local time converted to UTC range).
- **Response Format**:
  ```json
  {
    "sessionsToday": 142,
    "completedToday": 138,
    "failedToday": 4,
    "activeBoothsToday": 5,
    "calculatedAt": "2026-09-09T05:30:00.000Z"
  }
  ```

#### 3. `GET /api/sessions/:id` (Session Detail)
- **Controller**: `SessionsController.findOne`
- **Returns**: Full session entity with nested `booth` (and `branch`), `transaction`, `payment`, `prints`, and `photos`.

#### 4. `GET /api/gallery/:sessionId` (Asset-Centric Structure)
- **Controller**: `GalleryController.getGalleryData`
- **Returns structured asset payload**:
  ```json
  {
    "sessionId": "session_1788734918239",
    "booth": {
      "id": "80e05c47-...",
      "name": "PICTOLABS-DEV-01",
      "branchName": "Grand Indonesia"
    },
    "status": "COMPLETED",
    "customerDownloadUrl": "https://pictolabs.id/d/session_1788734918239",
    "assets": {
      "photoStrip": {
        "filename": "composite_session_1788734918239.jpg",
        "url": "https://media.pictolabs.id/photos/composite_session_1788734918239.jpg",
        "sizeFormatted": "1.8 MB"
      },
      "photos": [
        { "pose": 1, "filename": "photo_pose_1.jpg", "url": "...", "sizeFormatted": "2.4 MB" },
        { "pose": 2, "filename": "photo_pose_2.jpg", "url": "...", "sizeFormatted": "2.3 MB" },
        { "pose": 3, "filename": "photo_pose_3.jpg", "url": "...", "sizeFormatted": "2.5 MB" },
        { "pose": 4, "filename": "photo_pose_4.jpg", "url": "...", "sizeFormatted": "2.2 MB" }
      ],
      "livePhotos": [
        { "pose": 1, "filename": "live_pose_1.mp4", "url": "...", "sizeFormatted": "4.1 MB" },
        { "pose": 2, "filename": "live_pose_2.mp4", "url": "...", "sizeFormatted": "3.9 MB" }
      ],
      "totalAssets": 7
    }
  }
  ```

---

## 7. Frontend Component Breakdown (`apps/dashboard/src/`)

```
apps/dashboard/src/
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx            # Main layout wrapper: Sidebar + Header + Page Canvas
│   │   ├── Sidebar.tsx             # Left navigation: Brand, NavLinks, Connection Pill
│   │   └── Header.tsx              # Sticky top bar: Breadcrumb, Gateway Pulse, Quick Refresh
│   ├── common/
│   │   ├── StatusBadge.tsx         # Booth status badge: ONLINE, DEGRADED, OFFLINE, MAINTENANCE
│   │   ├── LifecycleBadge.tsx      # Resilient badge: Canonical colors + neutral fallback for unknown
│   │   ├── MetricCard.tsx          # KPI counter card with icon and description
│   │   ├── SearchInput.tsx         # Debounced search box with clear button
│   │   ├── CopyButton.tsx          # One-tap clipboard copy with toast feedback
│   │   ├── Pagination.tsx          # Standard pagination controls (Prev, Next, Page Numbers)
│   │   └── Drawer.tsx              # Slide-out modal drawer container with accessible backdrop
│   ├── booths/
│   │   ├── BoothsTable.tsx         # Fleet table with live ticking relative times
│   │   ├── BoothDetailDrawer.tsx   # Detailed hardware/software runtime diagnostics
│   │   └── MaintenanceToggle.tsx   # Switch component with confirmation guard
│   ├── sessions/
│   │   ├── SessionsTable.tsx       # Paginated customer sessions table
│   │   ├── SessionFilterBar.tsx    # Filter bar: Search ID, Branch select, Booth select, Date picker
│   │   └── SessionDetailModal.tsx  # Session breakdown: prints, transaction, lifecycle timestamps
│   └── gallery/
│       ├── MediaAssetGrid.tsx      # Focused on PHOTO_STRIP, PHOTO, and LIVE_PHOTO
│       ├── MediaZoomModal.tsx      # Lightbox viewer for composite photostrip
│       └── EmailDeliveryStub.tsx   # Customer email dispatch action panel with UI feedback
├── pages/
│   ├── OverviewPage.tsx            # KPI Cards + Fleet Summary + Recent Sessions
│   ├── BoothsPage.tsx              # Fleet table + Search/Filter + Maintenance Drawer
│   ├── SessionsPage.tsx            # Filterable sessions audit table + pagination
│   └── GalleryPage.tsx             # Focused asset viewer + public link copy + ZIP download
├── services/
│   ├── api.ts                      # Axios instance with base URL, timeout, error interceptors
│   ├── boothsApi.ts                # Wrappers for /api/booths endpoints
│   ├── sessionsApi.ts              # Wrappers for /api/sessions query and stats endpoints
│   └── galleryApi.ts               # Wrappers for /api/gallery endpoints
├── stores/
│   └── socketStore.ts              # Zustand store for real-time WebSocket events
└── types/
    ├── booth.ts                    # Booth, BoothConfig, BoothStatus types
    ├── session.ts                  # Session, SessionLifecycle, SessionQuery types
    └── asset.ts                    # GalleryData, PhotoStrip, PhotoAsset, LivePhotoAsset types
```

---

## 8. Page Breakdown & Resilient UX

### 8.1 Overview Page (`/` or `/overview`)
- **4 KPI Metric Cards**:
  1. `Online Booths`: Emerald pill, count of booths with heartbeat $<60\text{s}$.
  2. `Offline Booths`: Rose pill, count of booths silent $\ge 300\text{s}$.
  3. `In Maintenance`: Orange pill, count of booths locked in maintenance mode.
  4. `Sessions Today`: Indigo pill, total sessions captured/printed today.
- **Fleet Snapshot Table**: Displays top 5 booths with dynamic status pills and live ticking last seen time.
- **Recent Sessions Table**: Displays top 5 recent customer sessions with resilient status badges and direct `"Inspect"` action linking to `/gallery?sessionId=:id`.

### 8.2 Booths Page (`/booths`)
- **Filter Tabs**: `All (N)`, `Online`, `Degraded`, `Offline`, `Maintenance`.
- **Booths Table**: Displays Booth & Branch, dynamic status badge, software version (`appVersion`, `gitCommit`), machine hostname, LAN IP, and ticking last seen timer.
- **Slide-Out Maintenance Drawer**:
  - Full diagnostic data (Device Secret, thresholds, exact heartbeat timestamps).
  - Maintenance Mode Form: Switch toggle between `NORMAL` and `MAINTENANCE`, reason input field, and `"Save Override"` button executing `PATCH /api/booths/:id/status`.

### 8.3 Sessions Page (`/sessions`)
- **Resilient Lifecycle Status Badge (`LifecycleBadge.tsx`)**:
  - `COMPLETED` / `printed` $\rightarrow$ Emerald
  - `PRINTING` $\rightarrow$ Sky Blue
  - `CAPTURING` / `CAPTURED` $\rightarrow$ Amber
  - `PAID` $\rightarrow$ Indigo
  - `PAYMENT_PENDING` / `PENDING_PAYMENT` $\rightarrow$ Yellow
  - `FAILED` $\rightarrow$ Rose
  - **Any Unknown Status** $\rightarrow$ Neutral Slate (`bg-slate-800 text-slate-300 border-slate-700`) displaying the exact raw text safely without crashing.
- **Filter Bar**: Search input for Session ID, Branch dropdown, Booth dropdown, Status dropdown, Date presets (`Today`, `Yesterday`, `Last 7 Days`, `All Time`).
- **Audit Table**: Monospaced Session ID with 1-tap clipboard copy, Branch & Booth origin, formatted Indonesia time (`WIB`), prints count, and direct `"Inspect Gallery"` action button.

### 8.4 Gallery Page (`/gallery`)
- **Focused Asset-Centric Grid (Revision #3 & #4)**:
  1. **Photostrip Composite (`PHOTO_STRIP`)**: High-res 300 DPI composite render with modal zoom button and 1-click download.
  2. **Individual Poses (`PHOTO`)**: Responsive 4-card grid displaying calibrated DSLR stills with pose badges (Pose 1 to 4).
  3. **Live Photos (`LIVE_PHOTO`)**: HTML5 video playback cards with motion preview and download buttons.
- **Delivery Actions**:
  - `"Copy Customer Link"`: Copies `https://pictolabs.id/d/:sessionId` with toast confirmation.
  - `"Download ZIP Archive"`: Downloads all media bundled from R2 via `/api/gallery/:sessionId/zip`.
  - `"Prepare Email Delivery (UI Stub)"`: Customer email input form triggering a confirmation toast stating the delivery provider stub is ready for future integration.

---

## 9. Risk Analysis & Mitigation Strategies

| Risk Description | Severity | Impact | Mitigation Strategy |
| :--- | :---: | :---: | :--- |
| **Kiosk Schema Regression**: Modifying media tables breaks physical kiosk sync loop. | **High** | Kiosks fail to sync. | **Mitigated by Revision #1**: `Photo` remains the active source of truth. No breaking database migrations applied. |
| **Unknown Session Statuses**: Kiosks or scripts send legacy or unexpected status values. | **Medium** | UI crashes or filters fail. | **Mitigated by Revision #2**: `LifecycleBadge` has a safe fallback renderer for any unknown string; filters accept any string. |
| **Asset Discovery Latency**: Scanning large directories or DB tables on session listing. | **Low** | Slow dashboard load. | Added composite indexes on `sessions(boothId, createdAt)` and `sessions(status, createdAt)`. |
| **Flaky WebSocket Sinks**: Socket disconnection on unstable networks. | **Low** | Stale status indicators. | Dual-channel resilience: Dashboard automatically polls `GET /api/booths` every 30 seconds while using WebSockets for instantaneous pushes. |

---

## 10. Estimated Implementation Order

1. **Step 1: Database Verification & Index Optimization**
   - Verify `schema.prisma` indexes on `Session` (`boothId`, `status`, `createdAt`).
   - Run `npx prisma generate` to confirm client readiness.
2. **Step 2: Backend Session Query Endpoints**
   - Implement `GET /api/sessions` with search, filtering, and pagination in `SessionsController`.
   - Implement `GET /api/sessions/stats/today`.
   - Implement `GET /api/sessions/:id`.
3. **Step 3: Asset-Centric Gallery API Refactor**
   - Update `GalleryController.getGalleryData` to return structured asset categories (`photoStrip`, `photos`, `livePhotos`).
4. **Step 4: Automated Backend Verification**
   - Create and run `apps/backend/src/sessions/sessions.e2e.ts` verifying all new and updated endpoints.
5. **Step 5: Frontend Layout & State Architecture**
   - Refactor `apps/dashboard/src` into modular component tree.
   - Implement `AppShell`, `Sidebar`, and `Header`.
   - Setup `socketStore.ts` and Axios API service clients (`boothsApi.ts`, `sessionsApi.ts`, `galleryApi.ts`).
6. **Step 6: Frontend Pages Implementation**
   - Build `OverviewPage.tsx` with 4 KPI cards and summary tables.
   - Build `BoothsPage.tsx` with dynamic status, versioning, and slide-out `BoothDetailDrawer`.
   - Build `SessionsPage.tsx` with search, branch/booth filter, and resilient `LifecycleBadge`.
   - Build `GalleryPage.tsx` with focused asset grid (`PHOTO_STRIP`, `PHOTO`, `LIVE_PHOTO`), zoom lightbox, link copy, ZIP download, and email delivery stub.
7. **Step 7: Verification & Sign-Off**
   - Run `npm run typecheck` and `npm run build` across all workspaces.
   - Generate `SPRINT_5A_IMPLEMENTATION_REPORT.md`.

---

## 11. Definition of Done (DoD)

Sprint 5A is formally complete when all of the following conditions are verified:

- [ ] **Data Integrity**: `Photo` remains the source of truth; zero regressions on existing kiosk session sync.
- [ ] **Backend Test Coverage**: `sessions.e2e.ts` passes with 100% assertions satisfied for session search, today's stats, and asset retrieval.
- [ ] **Overview Page Complete**: Renders 4 KPI cards (Online, Offline, Maintenance, Sessions Today) with accurate live counts.
- [ ] **Booths Page Complete**: Displays all registered booths with dynamic status badges, runtime software/hardware versions, and a working Maintenance mode toggle drawer.
- [ ] **Sessions Page Complete**: Displays paginated sessions with working search by Session ID, filter by Booth, filter by Branch, and filter by Date.
- [ ] **Resilient Status Rendering**: Any unknown or unexpected session status string is displayed in a neutral badge without crashing or breaking filters.
- [ ] **Gallery Page Complete**: Displays focused previews for `PHOTO_STRIP`, `PHOTO`, and `LIVE_PHOTO`; copies public link `https://pictolabs.id/d/:sessionId` to clipboard; triggers ZIP download; email form triggers toast stub.
- [ ] **Real-Time Responsiveness**: WebSocket status updates reflect in the UI without requiring page reloads when `booth_status_changed` is emitted.
- [ ] **Strict Scope Compliance**: 0 analytics charts, 0 revenue reports, 0 hardware telemetry gauges, 0 remote configs.
- [ ] **Zero Compilation Errors**: `npm run build` passes with 0 TypeScript errors and 0 build failures across both `apps/backend` and `apps/dashboard`.
- [ ] **Review Artifacts Generated**: `SPRINT_5A_IMPLEMENTATION_REPORT.md` generated documenting all executed changes and test results.
