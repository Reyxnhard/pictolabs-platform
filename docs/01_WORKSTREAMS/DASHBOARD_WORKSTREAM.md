# DASHBOARD WORKSTREAM CONTEXT

## 1. Purpose
The Dashboard Workstream provides the web-based operational control tower for Pictolabs. It enables operations managers, customer support agents, and technicians to monitor booth health, adjust pricing dynamically, search historical customer sessions, and execute customer redeliveries.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Operator JWT Auth & Role Gates** | `AUTOMATED_VERIFIED` | Role-based access control (Admin, Operator, Support). |
| **Fleet Monitoring Grid & Health Drawer**| `AUTOMATED_VERIFIED` | Live telemetry display with hardware health indicators. |
| **Remote Pricing Control** | `AUTOMATED_VERIFIED` | Set active photostrip price per booth in real time. |
| **Historical Sessions Archive & Modal** | `AUTOMATED_VERIFIED` | Browse customer sessions with image previews. |
| **Customer Support Search Console** | `AUTOMATED_VERIFIED` | Multi-parameter search by phone, email, or order ID. |
| **Customer Redelivery (Email / Link)** | `AUTOMATED_VERIFIED` | Resend softfiles via Resend email service. |
| **WhatsApp Notifications Integration** | `IMPLEMENTED` | Webhook integration for customer delivery alerts. |
| **Remote Edge Physical Reprint Dispatch** | `NOT_STARTED` | **PLANNED** — Edge live WebSocket trigger not implemented. |

## 3. Completed / Verified
- **Implemented:** React dashboard application in [`apps/dashboard/src`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src), REST APIs in backend, and PostgreSQL schemas (Sprints 5A, 5B, 5C).
- **Automated Verified:** Unit and component tests pass; pricing control verified via `verify_dashboard_pricing_control.mjs`.
- **Founder Physical UAT:** Verified in local browser and remote staging server; UI drawer and support search tested.
- **Production Verified:** Production build verified with Vite (`npm run build` exits 0).

## 4. Current Architecture
1. **Frontend Stack:** React 18, TypeScript, Tailwind CSS, Lucide icons, Vite bundler.
2. **API Communication:** Axios client with JWT bearer token authentication communicating with NestJS backend.
3. **State Management:** Zustand stores for authentication (`useAuthStore.ts`) and WebSocket events (`socketStore.ts`).
4. **Key Views:**
   - [`OverviewPage.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/pages/OverviewPage.tsx): Fleet macro metrics, revenue counters, and active alerts.
   - [`BoothsPage.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/pages/BoothsPage.tsx): Fleet cards and drawer for price editing.
   - [`SessionsPage.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/pages/SessionsPage.tsx): Session table and image inspector.
   - [`SupportSearchPage.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/pages/SupportSearchPage.tsx): Customer support inquiry resolution.

## 5. Current Invariants
- **Foundation ≠ Total Product:** Dashboard foundation completion must NOT be equated with total product completion; remote edge reprint remains open.
- **PII Protection:** Customer contact details must only be visible to authenticated support roles.
- **Graceful Offline UI:** Dashboard must display clear visual indicators when a booth enters degraded or offline states.

## 6. Known Open Issues
- **Scope Item:** Remote Edge Reprint button in Support modal creates database log but does not dispatch live WebSocket command to Kiosk.

## 7. Next Task
Configure Nginx reverse proxy on the production VPS to serve the built dashboard bundle under SSL.

## 8. Evidence
1. [`docs/SPRINT_5A_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_IMPLEMENTATION_REPORT.md) — Dashboard PRD and implementation report.
2. [`docs/SPRINT_5B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_IMPLEMENTATION_REPORT.md) — Customer support multi-parameter search report.
3. [`docs/SPRINT_5C_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5C_IMPLEMENTATION_REPORT.md) — Pre-production operational dashboard gates.
4. [`docs/DASHBOARD_PRICING_CONTROL_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/DASHBOARD_PRICING_CONTROL_REPORT.md) — Remote pricing verification.
5. Source directory: [`apps/dashboard/src`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src).

## 9. Related Workstreams
- **Fleet:** Dashboard visualizes booth heartbeat and hardware status.
- **Session History:** Dashboard provides the web interface for session queries.
- **Deployment:** Dashboard is served via Nginx on the production VPS.

## 10. Status Confidence
**HIGH.** Code complete, typechecked, automated tests pass, and operational UI verified in browser.
