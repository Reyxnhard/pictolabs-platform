# SPRINT 5B IMPLEMENTATION PLAN
## Session Observability, Support Operations & Re-Delivery

> **Sprint**: Sprint 5B  
> **Milestone**: Operations & Customer Support Power-Tools  
> **Document Status**: Ready for Review & Execution  
> **Date**: September 10, 2026  
> **Primary Sources of Truth**: `PICTOLABS_PLATFORM_ARCHITECTURE.md`, `SPRINT_5B_PRD.md`, `SPRINT_5A_RETROSPECTIVE.md`

---

## 1. Goal & Architectural Scope

The goal of Sprint 5B is to equip the Pictolabs Owner and Customer Support Operations team with deep session observability and rapid remediation capabilities. 

### Core Architectural Principles
1. **The Session is the Primary Entity**: All events, health metrics, financial transactions, and re-delivery operations anchor directly to `sessionId`.
2. **Zero-Regression Safeguard**:
   - **DO NOT** modify `CameraService.ts` (Canon EDSDK C++ binding).
   - **DO NOT** modify `RenderEngine.ts` (Sharp 300 DPI compositor).
   - **DO NOT** modify `PaymentsService.ts` (Midtrans QRIS core).
3. **Data Source Continuity**: `Photo` remains the source of truth for media storage; no breaking changes to kiosk sync ingestion (`POST /api/sessions`).
4. **Audit Immutability**: All support actions (email resend, link extensions, reprint dispatches) create permanent records in `redelivery_logs`.

---

## 2. Acceptance Criteria Matrix

| ID | Category | Requirement Description | Verification Method |
| :--- | :--- | :--- | :--- |
| **AC-1.1** | Timeline | `GET /api/sessions/:id/timeline` returns chronological events ordered by timestamp with event type, stage, status, latency (`durationMs`), and payload. | Backend E2E Test |
| **AC-1.2** | Timeline UI | Interactive vertical timeline renders step-by-step milestones (`PAYMENT`, `CAPTURE`, `COMPOSITING`, `PRINTING`, `STORAGE`, `DELIVERY`) with duration badges. | UI Component |
| **AC-1.3** | Timeline UI | Expandable JSON inspector displays raw event payload, error stack trace, and hardware response codes. | UI Component |
| **AC-2.1** | Health Engine | `GET /api/sessions/:id/health` calculates discrete health state (`HEALTHY`, `DEGRADED`, `FAILED`, `ABANDONED`) and root-cause diagnostic metadata. | Backend Unit & E2E |
| **AC-2.2** | Health UI | Prominent Health Card displays health badge, failure category (`HARDWARE`, `PAYMENT`, `NETWORK_STORAGE`), error code, and actionable remediation directive. | UI Component |
| **AC-3.1** | Re-Delivery | `POST /api/sessions/:id/redelivery/email` dispatches customer delivery email and records entry in `redelivery_logs`. | Backend E2E Test |
| **AC-3.2** | Re-Delivery | `POST /api/sessions/:id/redelivery/extend-link` extends `retentionExpiresAt` by 7 or 30 days and generates an authenticated customer link. | Backend E2E Test |
| **AC-3.3** | Re-Delivery | `POST /api/sessions/:id/reprint` validates reprint reason (`PAPER_JAM`, `PRINT_DEFECT`, `CUSTOMER_COURTESY`), rate limits to max 3 copies, and dispatches reprint command. | Backend E2E Test |
| **AC-3.4** | Re-Delivery | `GET /api/sessions/:id/redelivery/history` returns complete audit trail of operator interventions. | Backend E2E Test |
| **AC-4.1** | Support Search | `GET /api/support/search` allows multi-channel lookup: customer email, customer phone, Midtrans `orderId`, and payment reference. | Backend E2E Test |
| **AC-4.2** | Support Search | Supports venue and time window filter (`branchId`, `boothId`, `date`, `startTime`, `endTime`). | Backend E2E Test |
| **AC-4.3** | Support Search UI | Search result cards display visual composite photostrip thumbnails, customer contact, booth name, WIB timestamp, and health badge. | UI Component |
| **AC-4.4** | Support Search UI | Clicking a search result card navigates directly into the Session Timeline and Re-delivery workspace. | UI Component |
| **AC-5.1** | Regression | Full storage regression suite (`test:storage`) passes with 30 PASSED / 0 FAILED. | Automated Test |
| **AC-5.2** | Build Integrity | Full monorepo typecheck and build (`apps/backend` and `apps/dashboard`) succeeds with 0 TypeScript errors. | Automated Build |

---

## 3. Database Schema Changes (`prisma/schema.prisma`)

```prisma
// Add new models to prisma/schema.prisma

model SessionEvent {
  id           String   @id @default(uuid())
  sessionId    String
  session      Session  @relation(fields: [sessionId], references: [id])
  eventType    String   // SESSION_INIT, PAYMENT_PENDING, PAYMENT_SETTLED, CAPTURE_POSE_1, PRINT_COMPLETED, R2_UPLOAD_COMPLETED, etc.
  stage        String   // PAYMENT, CAPTURE, PROCESSING, PRINTING, STORAGE, DELIVERY
  status       String   // SUCCESS, FAILED, WARNING, SKIPPED
  durationMs   Int?     // Elapsed time in milliseconds
  errorCode    String?  // e.g. ERR_PRINTER_PAPER_JAM
  errorMessage String?  // Human-readable diagnostic message
  payload      String?  // JSON stringified metadata
  createdAt    DateTime @default(now())

  @@index([sessionId])
  @@index([eventType])
  @@map("session_events")
}

model RedeliveryLog {
  id              String   @id @default(uuid())
  sessionId       String
  session         Session  @relation(fields: [sessionId], references: [id])
  actionType      String   // RESEND_EMAIL, EXTEND_LINK, CLOUD_RESYNC, PHYSICAL_REPRINT
  operatorEmail   String
  recipient       String?  // Target email or target kiosk identifier
  reason          String   // PAPER_JAM, PRINT_DEFECT, CUSTOMER_TYPO, CUSTOMER_COURTESY
  status          String   // SUCCESS, FAILED
  responsePayload String?  // JSON string
  createdAt       DateTime @default(now())

  @@index([sessionId])
  @@map("redelivery_logs")
}
```

### Updates to `Session` Model
```prisma
model Session {
  id                 String          @id @default(uuid())
  boothId            String
  booth              Booth           @relation(fields: [boothId], references: [id])
  status             String          @default("PENDING_PAYMENT")
  frameId            String?
  frame              Frame?          @relation(fields: [frameId], references: [id])
  customerEmail      String?
  customerPhone      String?
  retentionExpiresAt DateTime?
  photos             Photo[]
  prints             Print[]
  transaction        Transaction?
  events             SessionEvent[]
  redeliveries       RedeliveryLog[]
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  @@index([boothId])
  @@index([status])
  @@index([createdAt])
  @@index([customerEmail])
  @@index([customerPhone])
  @@map("sessions")
}
```

---

## 4. Backend Engineering Plan (`apps/backend`)

### 4.1 New DTOs & Services
- **`src/sessions/dto/session-timeline.dto.ts`**: Types for event ingestion and queries.
- **`src/sessions/dto/redelivery.dto.ts`**: Validation for email resend, link extension, and reprint requests.
- **`src/support/dto/support-search.dto.ts`**: Query parameters for omni-channel search (`email`, `phone`, `orderId`, `branchId`, `boothId`, `date`, `startTime`, `endTime`, `page`, `limit`).
- **`src/sessions/session-health.service.ts`**:
  - Deterministic health rule engine:
    - Calculates `HEALTHY`, `DEGRADED`, `FAILED`, `ABANDONED`.
    - Evaluates error codes (`ERR_PRINTER_PAPER_JAM`, `ERR_PAYMENT_TIMEOUT`, `ERR_CAMERA_OFFLINE`, `ERR_R2_UPLOAD_PENDING`).
    - Formulates plain-language diagnostic descriptions and recommended support actions.
- **`src/sessions/session-redelivery.service.ts`**:
  - `resendEmail(sessionId, dto)`: Sends transactional email via configured provider (with mock/fallback mode) and writes to `redelivery_logs`.
  - `extendLink(sessionId, dto)`: Extends `retentionExpiresAt` and produces authenticated signed customer URL.
  - `triggerReprint(sessionId, dto)`: Enforces rate limits (max 3 reprints), dispatches reprint directive, and audits to `redelivery_logs`.
  - `getRedeliveryHistory(sessionId)`: Retrieves past actions.
- **`src/support/support.service.ts` & `src/support/support.controller.ts`**:
  - Multi-index search engine querying across `sessions`, `transactions`, and `payments`.
  - Injects composite photostrip thumbnail URL from `Photo` records and attaches calculated health status.

### 4.2 Automated E2E Test Suite (`src/sessions/sprint5b.e2e.ts`)
- Creates test session with simulated hardware and payment steps.
- Asserts timeline generation (`GET /api/sessions/:id/timeline`).
- Asserts health evaluation for healthy and failed states (`GET /api/sessions/:id/health`).
- Asserts email resend, link extension, and emergency reprint operations.
- Asserts support search by email, phone, and order ID.
- Asserts zero regression on existing session listing and storage endpoints.

---

## 5. Frontend Engineering Plan (`apps/dashboard`)

### 5.1 New Types & API Services
- **`src/types/support.ts`**: Interfaces for `SessionEvent`, `SessionHealth`, `RedeliveryLog`, `SupportSearchResult`.
- **`src/services/supportApi.ts`**: REST client wrappers for all Sprint 5B endpoints.

### 5.2 UI Component Specifications
1. **Session Timeline Component (`src/components/timeline/SessionTimeline.tsx`)**:
   - Vertical timeline visualization with distinct status badges (Success, Warning, Error, Pending).
   - Milestone duration badges (`+0.8s`, `+38.2s`).
   - Collapsible raw event JSON inspector for engineering diagnostics.
2. **Session Health Card (`src/components/health/SessionHealthCard.tsx`)**:
   - Color-coded health status banner (`HEALTHY` = Emerald, `DEGRADED` = Amber, `FAILED` = Rose, `ABANDONED` = Slate).
   - Failure category tag (`HARDWARE`, `PAYMENT`, `NETWORK_STORAGE`, `CUSTOMER_TIMEOUT`).
   - Machine-readable error code and human-readable diagnostic message.
   - Quick action button navigating to the appropriate remediation tool.
3. **Re-Delivery Control Center (`src/components/redelivery/`)**:
   - **`EmailRedeliveryModal.tsx`**: Recipient email input with validation, reason dropdown, and dispatch confirmation.
   - **`ExtendLinkModal.tsx`**: 7-day / 30-day selector with instant "Copy Support Link" button.
   - **`ReprintModal.tsx`**: Copy count selector (1 or 2), mandatory reason selection (`PAPER_JAM`, `PRINT_DEFECT`, `CUSTOMER_COURTESY`), and safety confirmation.
   - **`RedeliveryHistoryTable.tsx`**: Embedded audit log showing previous interventions for this session.
4. **Omni-Channel Support Search Page (`src/pages/SupportSearchPage.tsx`)**:
   - High-speed search bar supporting email, phone, and Midtrans Order ID.
   - Filter bar for Branch, Booth, Date, and Time Window (e.g. 14:00 - 15:00 WIB).
   - Responsive card grid displaying:
     - 80x120px composite photostrip preview thumbnail.
     - Customer identifier (email/phone).
     - Booth and Branch name.
     - Exact timestamp.
     - Health status badge.
     - Action button: **"Inspect Timeline & Remediate"**.
5. **App Shell Navigation Updates**:
   - Add **"Support Search"** item to [Sidebar.tsx](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/components/layout/Sidebar.tsx) with a lifebuoy/headset icon.
   - Register route `/support` in [App.tsx](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/App.tsx).

---

## 6. Verification & Quality Assurance Strategy

### Automated Verification
1. **Backend E2E Verification**:
   ```bash
   npx ts-node src/sessions/sprint5b.e2e.ts
   ```
   Must exit with code 0 and 100% assertions passed.
2. **Regression Verification**:
   ```bash
   npm run test:storage
   ```
   Must maintain 30 PASSED / 0 FAILED.
3. **Frontend Build Verification**:
   ```bash
   cd apps/dashboard && npm run build
   ```
   Must complete with 0 TypeScript errors and clean bundle output.

### Manual Sanity Checks
1. Search by customer email on `/support` and verify instant card rendering with photostrip preview.
2. Open a session detail and verify chronological timeline stepping and duration calculations.
3. Trigger an email resend and link extension, confirming that entries appear in the Re-delivery Audit History.
4. Trigger an emergency reprint and verify that rate limiting prevents duplicate clicks.

---

## 7. Deliverables Summary

1. `SPRINT_5A_RETROSPECTIVE.md` (Delivered)
2. `SPRINT_5B_PRD.md` (Delivered)
3. `SPRINT_5B_IMPLEMENTATION_PLAN.md` (Delivered)
4. Implementation code (deferred until user approval of plan).
5. `SPRINT_5B_IMPLEMENTATION_REPORT.md` (generated upon completion of implementation).
