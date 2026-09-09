# SPRINT 5B FOUNDER UAT PACKAGE
## Session Observability, Support Operations & Re-Delivery — User Acceptance Testing Guide

> **Document**: Sprint 5B Founder UAT & Operational Verification Package  
> **Date**: September 10, 2026  
> **Target Audience**: Founder (Han) & Customer Support Operations Team  
> **Repository**: Pictolabs Self-Service Photobooth Platform  
> **Dashboard Preview URL**: `http://localhost:5173/`  
> **Support Center Direct URL**: `http://localhost:5173/support`  

---

## 1. How to Access Every Sprint 5B Feature

The operations plane provides a unified **Support & Remediation Center** accessible through both the main navigation and the session archives.

### 1.1 Accessing the Omni-Channel Support Search
1. Open the dashboard in your web browser: **`http://localhost:5173/`**.
2. In the left-hand navigation sidebar, click on **Support & Search** (icon: LifeBuoy 🛟) or navigate directly to **`http://localhost:5173/support`**.
3. You will see the **Omni-Channel Customer Support Search** workspace with multi-parameter filter inputs:
   - **Customer Email**: Search by partial or full email address.
   - **Customer Phone / WhatsApp**: Search by Indonesian phone number (e.g. `0812...`).
   - **Midtrans Order ID / Ref**: Search by transaction order ID (e.g. `PICTO-ORDER-...`) or Midtrans UUID.
   - **Photobooth Dropdown**: Filter by physical kiosk unit (e.g. `Grand Indonesia Kiosk`).
   - **Date & Narrow Time Window**: Filter by exact date and start/end time in Western Indonesia Time (WIB) (e.g. `14:00` to `15:00`).

### 1.2 Accessing Session Observability, Health & Timeline
1. On **Support Search** (`/support`) or **Sessions Archive** (`/sessions`), find any customer session card or row.
2. Click the **"Timeline & Support"** button on the result card (or click any session row in the Sessions ledger).
3. The **Session Observability & Support Center** modal will open displaying:
   - **Session Health Card**: Diagnostic classification (`HEALTHY`, `DEGRADED`, `FAILED`, `ABANDONED`), error code, plain-language explanation, and recommended remediation.
   - **Lifecycle Timeline Stepper**: Step-by-step milestones (`PAYMENT`, `CAPTURE`, `PROCESSING`, `PRINTING`, `STORAGE`, `DELIVERY`) with duration latencies (`+1.2s`, `+18.0s`) and expandable raw JSON event inspector.

### 1.3 Accessing the Re-Delivery Remediation Panel
Inside the **Session Observability modal**:
- **Resend Delivery Email**: Click the **"Resend Email"** button in the top Quick Actions or bottom toolbar. An edit modal opens pre-filled with the customer's email, allowing instant correction and resend.
- **Extend Retention Link**: Click the **"Extend Link"** button. Choose `7 Days` or `30 Days` extension and click **"Extend & Copy Signed Link"** for instant sharing over WhatsApp.
- **Command Physical Strip Reprint**: Click the **"Reprint Strip"** button. Select copy count (1 or 2 copies), select mandatory justification (`PAPER_JAM`, `PRINT_DEFECT`, `CUSTOMER_COURTESY`), check safety confirmation, and click **"Dispatch Reprint"**.
- **Audit History**: Click the **"Remediation Audit"** tab inside the modal to inspect an immutable history of every operator action, timestamp, parameters, and result status.

---

## 2. Live UAT Screenshots

All screenshots below were captured directly from the live operational dashboard running on `http://localhost:5173/`.

### 2.1 Omni-Channel Support Search Page
![Omni-Channel Customer Support Search](C:\Users\ezarh\.gemini\antigravity-ide\brain\10e01a7c-7814-4528-a960-e7a16155d42a\uat_support_search.png)

*Key elements visible:*
- Multi-channel filter toolbar: Email, Phone/WhatsApp, Midtrans Order ID, Booth selector, Date, Start/End time.
- Search result cards showing visual composite photostrip thumbnails, customer email/phone, booth name, WIB timestamp, and prominent `HEALTHY` or `FAILED` status badges.
- Direct action triggers: **"Timeline & Support"** and quick link to gallery assets.

---

### 2.2 Session Health Diagnostic Card & Lifecycle Timeline
![Session Health & Lifecycle Timeline](C:\Users\ezarh\.gemini\antigravity-ide\brain\10e01a7c-7814-4528-a960-e7a16155d42a\uat_session_timeline.png)

*Key elements visible:*
- **Root-Cause Health Card**: Highlighted in red for `FAILED` state with category `HARDWARE`, error code `ERR_PRINTER_PAPER_JAM`.
- **Diagnostic Analysis**: Plain-language description (*"DNP thermal printer cutter motor stalled during dual-cut cycle"*).
- **Recommended Remediation**: Directive (*"Inspect physical printer tray at kiosk and trigger Emergency Strip Reprint"*).
- **Lifecycle Timeline Stepper**: Chronological step audit with duration latencies and failure callouts.

---

### 2.3 Re-Delivery Panel & Immutable Remediation Audit
![Re-Delivery Panel & Audit History](C:\Users\ezarh\.gemini\antigravity-ide\brain\10e01a7c-7814-4528-a960-e7a16155d42a\uat_redelivery_panel.png)

*Key elements visible:*
- Quick-action buttons: `Emergency Reprint`, `Resend Delivery Email`, `Extend Retention Link`.
- Tab switcher: `LIFECYCLE TIMELINE` vs `REMEDIATION AUDIT`.
- Audit history ledger logging all operator interventions.

---

### 2.4 Emergency Physical Strip Reprint Confirmation Modal
![Emergency Physical Strip Reprint Modal](C:\Users\ezarh\.gemini\antigravity-ide\brain\10e01a7c-7814-4528-a960-e7a16155d42a\uat_reprint_modal.png)

*Key elements visible:*
- Target kiosk display (`PICTOLABS-DEV-01`).
- Copy count selector (`1 Copy` / `2 Copies`).
- Mandatory justification dropdown (`PAPER_JAM — Cutter jammed or paper stalled`, `PRINT_DEFECT`, `CUSTOMER_COURTESY`).
- Safety confirmation checkbox: *"I confirm printer is physically clear and ready to print."*
- Rate-limiting safeguards (max 3 reprints per session).

---

## 3. Example Support Workflow

### Scenario: Customer Contact
> **Customer via WhatsApp**: *"Hi Pictolabs, I took photos at Grand Indonesia booth about 20 minutes ago, but I didn't receive my photos on my phone and the QR link on the screen disappeared!"*

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               5-STEP CUSTOMER SUPPORT RESOLUTION FLOW                            │
├─────────────────┬─────────────────┬──────────────────┬───────────────────┬───────────────────────┤
│ 1. SEARCH       │ 2. IDENTIFY     │ 3. DIAGNOSE      │ 4. REMEDIATE      │ 5. VERIFY & AUDIT     │
│ Search by phone │ Confirm strip   │ Check Health Card│ Resend email or   │ Audit log updated     │
│ or booth/time   │ with customer   │ & Timeline step  │ copy support link │ with operator action  │
└─────────────────┴─────────────────┴──────────────────┴───────────────────┴───────────────────────┘
```

### Step 1: Search
1. The operator opens **`http://localhost:5173/support`**.
2. In the **Customer Phone / WhatsApp** field, the operator enters the customer's phone number (e.g. `081299887766`).
3. *(Alternative if customer didn't enter phone)*: The operator selects `Grand Indonesia Kiosk` from the Booth dropdown and sets the time filter to `14:00` – `15:00`.
4. Click **Search**. The matching session card appears instantly.

### Step 2: Open Session & Visual Confirmation
1. The operator views the search result card. The visual composite photostrip thumbnail allows the operator to verify: *"Did you wear a white jacket with a blue hat?"*
2. Once the customer confirms, the operator clicks **"Timeline & Support"**.

### Step 3: Diagnose Root Cause
The operator looks at the **Session Health Card** at the top of the modal:
- **Scenario A (Customer Email Typo)**:
  - Health Status: **`HEALTHY`** (All capture and print steps succeeded).
  - The operator checks the displayed email: `customer@gmaill.com` (typo: two 'l's).
  - *Diagnosis*: Softfile delivery email bounced due to incorrect email input.
- **Scenario B (Expired Gallery Link)**:
  - Health Status: **`DEGRADED`** (Link retention period expired).
  - *Diagnosis*: Customer waited longer than the retention window.
- **Scenario C (Physical Printer Jam)**:
  - Health Status: **`FAILED`** with code `ERR_PRINTER_PAPER_JAM`.
  - *Diagnosis*: Kiosk cutter motor jammed during the print phase.

### Step 4: Execute Remediation
- **If Email Typo**:
  1. Click **"Resend Delivery Email"**.
  2. Modal opens. Correct the email to `customer@gmail.com`.
  3. Click **"Dispatch Delivery Email"**. Softfile email is re-sent immediately.
- **If Expired Link**:
  1. Click **"Extend Retention Link"**.
  2. Select **`30 Days`**.
  3. Click **"Extend & Copy Signed Link"**.
  4. Paste the link directly into the WhatsApp chat with the customer:
     `https://pictolabs.id/d/session_1788...?token=...`
- **If Printer Jam**:
  1. Check with store staff that the jam is cleared.
  2. Click **"Reprint Strip"**.
  3. Select **`2 Copies`**, choose **`PAPER_JAM`**, check confirmation, click **"Dispatch Reprint"**.
  4. Kiosk reprints the 300 DPI composite from local SSD cache.

### Step 5: Verification & Audit
1. The customer confirms receipt on WhatsApp.
2. The operator clicks the **"Remediation Audit"** tab to verify that the action was permanently recorded in `redelivery_logs` with timestamp, operator email, and parameters.
3. Total resolution time: **under 60 seconds**.

---

## 4. List of Known Limitations

1. **Authentication Gates Pending**:
   The dashboard and backend API endpoints are currently unprotected by `JwtAuthGuard`. In this development state, any user who can reach `http://localhost:5173` has access to support tools. (Scheduled for hardening in the next security sprint).
2. **Transactional Email Mock Fallback**:
   The email re-delivery service falls back to mock console logging because production SMTP/SendGrid/Resend API keys have not yet been configured in backend environment variables.
3. **Emergency Reprint Rate Limit**:
   Physical reprints are hard-capped at **3 copies per session** to prevent paper waste and fraud. Any reprint beyond 3 requires database intervention.
4. **Offline Kiosk Window**:
   Remote emergency reprint commands require the physical kiosk to be **ONLINE** and the session to be within the **7-day local SSD reprint cache window**. If the kiosk has been offline for >7 days, local high-res print files are purged per the dual-tier retention policy.
5. **Photostrip Thumbnails Require Cloud Sync**:
   Search result cards display visual composite thumbnails from Cloudflare R2. If a kiosk loses internet connectivity mid-session and has not completed its background upload queue, a placeholder icon is displayed until sync completes.

---

## 5. Dashboard Localization Review

### 5.1 Current Language Audit
- **Is the dashboard currently English-only?**
  **Yes, 98% English.** The user interface, labels, table headers, descriptions, diagnostic messages, and error codes are authored in English.
  The only Indonesian elements currently in the dashboard are:
  - Date and time formatting using `id-ID` locale with Western Indonesia Time (`WIB`).
  - Raw session error strings passed up from the kiosk edge client.

### 5.2 Effort Analysis
| Target Strategy | Estimated Effort | Scope of Work |
| :--- | :---: | :--- |
| **Bahasa Indonesia Only** | **1 day** | Replace all hardcoded English strings in ~15 components and pages with Indonesian equivalents. |
| **Bilingual (Indonesian + English)** | **1.5 – 2 days** | Introduce an i18n abstraction library, extract ~150 translation keys into JSON dictionaries, add language switcher in header, and persist language preference in `localStorage`. |

### 5.3 Architectural Findings
- **Is there already a centralized text layer?**
  **No.** All button labels, modal titles, placeholder text, and status descriptions are hardcoded directly inside JSX elements (e.g. `<button>Timeline & Support</button>`, `<p>Omni-Channel Customer Support Search</p>`).
- **What would need refactoring?**
  1. **Dashboard UI Components**: ~15 files across `apps/dashboard/src/pages/` and `src/components/`.
  2. **Backend Diagnostic Engine**: `session-health.service.ts` currently returns plain English strings (`"DNP thermal printer cutter motor stalled during dual-cut cycle"`). This should either return machine-readable translation keys (e.g. `ERR_PRINTER_PAPER_JAM_DESC`) or be localized in the frontend.
  3. **Table & Badge Labels**: Status labels (`ONLINE`, `OFFLINE`, `HEALTHY`, `FAILED`) should have localized display mappings.

---

### 5.4 Proposed Lightweight i18n Architecture Recommendation

> [!NOTE]
> **Recommendation**: Do NOT implement immediately. Keep this as a dedicated fast-follow sprint or include it in Sprint 5C/6.

#### Recommended Stack:
- **`i18next`** + **`react-i18next`**: Industry-standard, tree-shakeable, zero-runtime bloat.
- **Zustand Store** (`useLanguageStore`): Lightweight state store managing current locale (`id` vs `en`) synced with `localStorage`.

#### Proposed Directory Structure:
```
apps/dashboard/src/
├── locales/
│   ├── id/
│   │   ├── common.json         # Buttons, badges, dates, actions
│   │   ├── support.json        # Support search, health diagnostics, re-delivery
│   │   ├── fleet.json          # Booths, overview, status
│   │   └── gallery.json        # Gallery asset viewer, downloads
│   └── en/
│       ├── common.json
│       ├── support.json
│       ├── fleet.json
│       └── gallery.json
├── i18n.ts                     # i18next initialization
└── stores/
    └── languageStore.ts        # Zustand language switcher
```

#### Proposed Key Configuration:
- **Default Locale**: **`id` (Bahasa Indonesia)** — tailored for Indonesian store operators and venue staff.
- **Fallback Locale**: **`en` (English)** — for technical diagnostics and international franchise readiness.
- **Header Language Toggle**: A discrete pill switch in `Header.tsx` (`🇮🇩 ID` | `🇬🇧 EN`).

---
*End of Founder UAT Package.*
