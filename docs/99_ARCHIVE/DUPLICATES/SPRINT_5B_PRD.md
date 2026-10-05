# SPRINT 5B PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Session Observability, Support Operations & Re-Delivery

> **Sprint**: Sprint 5B  
> **Milestone**: Operations & Customer Support Power-Tools  
> **Target Audience**: Pictolabs Owner & Customer Support Operations Team  
> **Document Status**: Complete PRD Specification  
> **Date**: September 10, 2026  
> **Primary Business Concept**: **The Session is the Primary Entity** — Support tools must trace, diagnose, and remediate customer journeys from inception to fulfillment.

---

## 1. Executive Summary & Problem Statement

In physical retail photobooth operations, customer disputes and hardware hiccups are inevitable:
- *"I paid via QRIS but the booth didn't start!"*
- *"The printer jammed after 1 copy came out."*
- *"I entered the wrong email address on the kiosk touchscreen."*
- *"My 30-day gallery link expired before I downloaded my high-res photos."*
- *"I don't know my Session ID, but I was at Grand Indonesia booth yesterday around 3 PM."*

In Sprint 5A, we delivered the baseline listing and archive view. However, support staff cannot diagnose **why** a session failed, cannot look up customers without an exact internal UUID, and have no platform mechanisms to execute **remedial actions** (re-sending emails, extending expired links, or commanding reprints).

**Sprint 5B bridges this operational gap.** It introduces deep **Session Timeline Observability**, automated **Health Diagnosis**, comprehensive **Re-delivery Tools**, and an omni-channel **Support Search Engine**.

---

## 2. Sprint 5B Core Pillars

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  SPRINT 5B FEATURE PILLARS                                       │
├──────────────────────────────┬─────────────────────────────┬─────────────────────────────────────┤
│ 1. SESSION TIMELINE          │ 2. SESSION HEALTH           │ 3. RE-DELIVERY FLOW                 │
│ • Chronological step audit   │ • Automated classification  │ • Resend email delivery             │
│ • Hardware & cloud telemetry │ • Failure category diagnosis│ • Regenerate expired access links   │
│ • Latency & duration tracking│ • Root-cause error codes    │ • Remote emergency reprint command  │
│ • JSON payload inspector     │ • Actionable remediation    │ • Immutable audit trail             │
├──────────────────────────────┴─────────────────────────────┴─────────────────────────────────────┤
│ 4. SUPPORT SEARCH ENGINE                                                                         │
│ • Omni-channel lookup: Email, Phone, Midtrans Order ID, Transaction Ref                          │
│ • Multi-parameter filter: Branch + Booth + Narrow Time Window (e.g. 14:00 - 15:00 WIB)           │
│ • Visual Composite Strip Preview for rapid customer visual confirmation                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Functional Requirements

### 3.1 Pillar 1: Session Timeline (Lifecycle Audit Trail)

Every session undergoes a strict multi-step edge-to-cloud journey. Sprint 5B captures and visualizes every state transition with microsecond timestamps and duration tracking.

#### Timeline Event Milestones
1. `SESSION_INIT`: Kiosk touched; frame selected; session workspace initialized.
2. `PAYMENT_PENDING`: Midtrans QRIS dynamic QR generated and displayed on screen.
3. `PAYMENT_SETTLED`: Webhook received, verified, and broadcasted; kiosk unlocked.
4. `CAPTURE_STARTED`: Customer entered booth; countdown initiated.
5. `CAPTURE_POSE_1` to `CAPTURE_POSE_4`: Individual DSLR shutter actuations and focus locks.
6. `LIVE_BURST_ACQUIRED`: Secondary camera video burst synchronized and encoded.
7. `COMPOSITE_RENDERED`: Sharp 300 DPI composite layout compiled with frame graphics.
8. `PRINT_SPOOLED`: Spool file sent to Windows print spooler for DNP DS620/RX1HS.
9. `PRINT_COMPLETED`: Thermal printer finished feeding and cutting photo strips.
10. `R2_UPLOAD_COMPLETED`: Assets uploaded to Cloudflare R2 bucket (`pictolabs-media-prod`).
11. `DELIVERY_ISSUED`: Customer QR scanned, email notification queued, customer accessed gallery.

#### Timeline UI Component Requirements
- **Vertical Stepper Component**: Visual step indicators with state icons:
  - 🟢 Green Check: Step completed successfully.
  - 🟡 Amber Warning: Step completed with non-fatal delay or retry.
  - 🔴 Red Cross: Step failed with error.
  - ⚪ Slate Dot: Step skipped or pending.
- **Latency / Duration Badges**: Shows elapsed time between milestones (e.g. `+1.8s`, `+42.5s`).
- **Raw Event Inspector**: Expandable drawer showing the raw event payload, error stack trace, and hardware response codes.

---

### 3.2 Pillar 2: Session Health & Root-Cause Diagnosis

The system automatically computes a health state and diagnostic profile for every session to eliminate guesswork for operators.

#### Health Classifications
| Health Status | Definition | Typical Root Cause |
| :--- | :--- | :--- |
| **`HEALTHY`** | All steps completed within expected operational SLAs. | Normal operation. |
| **`DEGRADED`** | Customer received primary output (print), but a non-critical background step encountered an anomaly. | Venue internet down (assets queued in local SQLite); customer email bounced; DNP ribbon low warning. |
| **`FAILED`** | Critical failure preventing experience fulfillment. | Camera USB disconnect mid-capture; DNP paper jam; R2 upload exhausted retries; power loss. |
| **`ABANDONED`** | Customer touched screen but left before paying. | Payment QR expired after 5 minutes without scan. |

#### Root-Cause Diagnostic Card
Displayed at the top of the Session Detail view:
- **Health Badge**: Large, prominent badge (`HEALTHY`, `DEGRADED`, `FAILED`, `ABANDONED`).
- **Failure Category**: `HARDWARE` | `PAYMENT` | `NETWORK_STORAGE` | `CUSTOMER_TIMEOUT`.
- **Error Code**: Machine-readable identifier (e.g. `ERR_PRINTER_PAPER_JAM`, `ERR_CAMERA_TIMEOUT`, `ERR_PAYMENT_EXPIRED`, `ERR_R2_UPLOAD_FAILED`).
- **Diagnostic Message**: Plain-language explanation for non-technical support staff.
- **Recommended Action**: Clear directive (e.g. *"Check physical printer tray at Grand Indonesia booth"*, *"Execute reprint command below"*, *"Resend digital link to customer email"*).

---

### 3.3 Pillar 3: Re-Delivery & Support Flow

Empowers support agents to resolve customer issues directly from the dashboard without technical engineering intervention.

#### Remediation Action 1: Resend Digital Delivery via Email
- **Use Case**: Customer entered a typo in their email or did not receive the delivery email.
- **Workflow**:
  1. Operator opens Session Detail and clicks **"Resend Email"**.
  2. Modal opens pre-filled with existing `customerEmail` (if any).
  3. Operator updates/verifies the recipient email address.
  4. Backend dispatches transactional delivery email containing gallery link and download access.
  5. Audit log records operator ID, timestamp, and target email.

#### Remediation Action 2: Regenerate & Extend Customer Access Link
- **Use Case**: Customer tries to access their gallery after the 30-day retention period or lost their token.
- **Workflow**:
  1. Operator clicks **"Extend Link Access"**.
  2. Selects extension duration: `7 Days` or `30 Days`.
  3. Backend updates `retentionExpiresAt` and generates an authenticated signed customer URL (`https://pictolabs.id/d/:sessionId?token=...`).
  4. Instant **"Copy Support Link"** button copies the URL to clipboard for sharing via WhatsApp/Email.

#### Remediation Action 3: Edge Cloud Re-Sync (Upload Recovery)
- **Use Case**: Session shows missing digital assets because kiosk internet was disrupted during session.
- **Workflow**:
  1. Operator clicks **"Trigger Cloud Sync"**.
  2. Cloud backend sends sync instruction to kiosk edge client via WebSocket/Queue.
  3. Kiosk reads from local 7-day SSD `reprint-cache` (`C:\pictolabs-data\reprint-cache\{sessionId}\`) and re-uploads assets to Cloudflare R2.
  4. Session timeline updates to `R2_UPLOAD_COMPLETED`.

#### Remediation Action 4: Physical Strip Reprint (Emergency Command)
- **Use Case**: Thermal printer jammed, paper tore, or print had ink smudges.
- **Workflow**:
  1. Operator clicks **"Command Physical Reprint"**.
  2. Safety confirmation modal requires selecting a valid reason:
     - `PAPER_JAM`: Printer malfunctioned during cut.
     - `PRINT_DEFECT`: Ink smudge, discoloration, or paper wrinkle.
     - `CUSTOMER_COURTESY`: Replacement granted by store manager.
  3. Operator selects copy count (1 or 2 copies).
  4. Backend dispatches authenticated reprint directive to kiosk:
     `POST /api/sessions/:id/reprint` with payload `{ copies, reason, operatorEmail }`.
  5. Kiosk pulls local 300 DPI composite and feeds to DNP printer spooler.
  6. Action logged in `RedeliveryLog` table.

#### Remediation Audit History
- Every session maintains an immutable audit log table displaying:
  - Date & Time (WIB)
  - Action (`RESEND_EMAIL`, `EXTEND_LINK`, `CLOUD_RESYNC`, `PHYSICAL_REPRINT`)
  - Operator
  - Target / Parameters
  - Result Status (`SUCCESS` / `FAILED`)

---

### 3.4 Pillar 4: Omni-Channel Support Search

In customer support scenarios, customers rarely have their UUID Session ID. They provide emails, phone numbers, bank transfer IDs, or approximate times.

#### Multi-Channel Search Inputs
1. **Customer Email**: Partial or exact match on customer email.
2. **Customer Phone / WhatsApp**: Digits match (e.g. `0812...` or `+62812...`).
3. **Payment Reference**: Midtrans `orderId` (e.g. `PICTO-ORDER-...`) or Midtrans `paymentRef` transaction ID.
4. **Time Window + Location**:
   - Branch selector (e.g. `Grand Indonesia`).
   - Booth selector (e.g. `PICTOLABS-GI-01`).
   - Date picker + Time Range slider (e.g. `2026-09-08` between `14:00` and `15:00` WIB).

#### Search Result Cards with Visual Composite Preview
- Each search result card prominently features:
  - **Visual Thumbnail (80x120px)**: Composite photostrip thumbnail. Support agents can immediately ask: *"Did your group take photos with pink sunglasses?"*
  - **Customer Identifier**: Email / Phone / Order ID.
  - **Booth & Branch**: Physical location.
  - **Exact WIB Timestamp**: Human-readable time.
  - **Session Health Badge**: Immediate visibility into whether the session was Healthy or Failed.
  - **One-Click Deep Link**: Takes operator directly to the Session Timeline and Re-delivery controls.

---

## 4. API Endpoints Specification

### 4.1 Session Observability Endpoints
```http
GET /api/sessions/:id/timeline
```
- **Response**: Array of chronological lifecycle events with timestamps, latencies, statuses, and payload metadata.

```http
GET /api/sessions/:id/health
```
- **Response**: Health summary object:
  ```json
  {
    "healthStatus": "FAILED",
    "failureCategory": "HARDWARE",
    "failureStep": "PRINTING",
    "errorCode": "ERR_PRINTER_PAPER_JAM",
    "diagnosticMessage": "DNP thermal printer reported paper jam error code 0x12 during cut phase.",
    "recommendedAction": "Clear physical cutter tray at Grand Indonesia Booth 1 and execute emergency reprint."
  }
  ```

### 4.2 Support Remediation Endpoints
```http
POST /api/sessions/:id/redelivery/email
Content-Type: application/json

{
  "recipientEmail": "customer@gmail.com",
  "reason": "Customer typo on kiosk touchscreen"
}
```

```http
POST /api/sessions/:id/redelivery/extend-link
Content-Type: application/json

{
  "extensionDays": 30,
  "reason": "Customer support ticket #481"
}
```

```http
POST /api/sessions/:id/reprint
Content-Type: application/json

{
  "copies": 2,
  "reason": "PAPER_JAM",
  "notes": "Re-printing after physical paper jam cleared"
}
```

```http
GET /api/sessions/:id/redelivery/history
```
- **Response**: List of all historical re-delivery and reprint operations performed on this session.

### 4.3 Omni-Channel Support Search Endpoint
```http
GET /api/support/search?email=&phone=&orderId=&branchId=&boothId=&date=&startTime=&endTime=&page=1&limit=10
```
- **Response**: Paginated results with customer contact, order IDs, visual thumbnail URLs, and health statuses.

---

## 5. Non-Functional & Zero-Regression Constraints

1. **Zero Regression on Kiosk Core**:
   - **DO NOT** modify `CameraService.ts` (Canon EDSDK C++ binding).
   - **DO NOT** modify `RenderEngine.ts` (Sharp 300 DPI layout compositor).
   - **DO NOT** modify `PaymentsService.ts` (Midtrans QRIS core).
2. **Offline-First Safeguard**:
   - Timeline events and reprint requests must gracefully buffer in local SQLite if the kiosk is temporarily offline.
3. **Data Protection & Rate Limiting**:
   - Support reprint endpoints must be authenticated and rate-limited (max 3 reprints per session) to prevent operator paper/ribbon abuse.
4. **Resilient UI**:
   - Incomplete sessions (e.g. abandoned before payment) must render gracefully in timeline views without throwing null reference errors.

---

## 6. Definition of Done (DoD) for Sprint 5B

- [ ] Database schema updated with `SessionEvent` and `RedeliveryLog` tables.
- [ ] Backend endpoints implemented, validated, and documented in Swagger.
- [ ] Automated E2E verification test suite (`sprint5b.e2e.ts`) passes with 100% success.
- [ ] Full regression suite (`test:storage` and payments) passes with 0 failures.
- [ ] UI components delivered:
  - Interactive Session Timeline with step latencies and raw inspector.
  - Session Health Diagnostic Card with error codes and suggested resolutions.
  - Re-delivery Control Center (Email resend, link extension, emergency reprint).
  - Support Search page with omni-channel filters and visual composite thumbnails.
- [ ] Frontend build succeeds with 0 TypeScript errors.
- [ ] Closing review report `SPRINT_5B_IMPLEMENTATION_REPORT.md` delivered.
