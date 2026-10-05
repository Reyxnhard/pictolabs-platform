# SESSION HISTORY WORKSTREAM CONTEXT

## 1. Purpose
The Session History Workstream manages persistence, retrieval, administrative reprinting, and cloud synchronization for all photobooth sessions. It maintains a secure local SQLite WAL repository on the kiosk, provides an on-device gallery for store operators, and exposes an administrative search and redelivery console on the web dashboard.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Local SQLite WAL Session Store** | `AUTOMATED_VERIFIED` | Stores session metadata, photo paths, and print status. |
| **Admin Panel Session History Gallery** | `AUTOMATED_VERIFIED` | Grid view of past sessions with filter and photo modal. |
| **Local Kiosk Physical Reprint (1x / 2x)**| `AUTOMATED_VERIFIED` | 4s debounced reprint execution via `SyncEngine`. |
| **Automatic Cloud Sync & Force Upload** | `AUTOMATED_VERIFIED` | Background daemon syncs sessions and assets to cloud. |
| **Web Dashboard Sessions Archive** | `AUTOMATED_VERIFIED` | Full table view with pagination and detail drawer. |
| **Customer Support Multi-Param Search** | `AUTOMATED_VERIFIED` | Search by phone, email, orderId, or payment ref. |
| **Customer Redelivery (Resend Email)** | `AUTOMATED_VERIFIED` | Resends digital download links to customer email. |
| **Remote Edge Physical Reprint Dispatch** | `NOT_STARTED` | **PLANNED** — Dashboard logs to DB; WebSocket dispatch not wired. |

## 3. Completed / Verified
- **Implemented:** Phase 1 and Phase 2 completed. [`SessionHistorySection.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/SessionHistorySection.tsx) on kiosk, `SyncEngine.ts` reprint handlers, and [`SessionsPage.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/pages/SessionsPage.tsx) on web dashboard.
- **Automated Verified:** `run_session_history_center_e2e.mjs` verifies SQLite insertion, local reprint dispatch, and upload queue processing.
- **Founder Physical UAT:** Local reprint flow verified by Founder on physical booth; thermal cut toggling confirmed.
- **Production Verified:** Local retention and sync engines verified in continuous burn-in testing.

## 4. Current Architecture
1. **On-Kiosk Storage:** Session records are created in [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx) upon composite JPEG generation and stored in local SQLite (`kiosk.db`).
2. **Local Reprint Flow:** Store technician enters Admin Panel, selects a session in [`SessionHistorySection.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/SessionHistorySection.tsx), and taps *"Cetak Ulang (1x)"*. IPC triggers `SyncEngine.reprintSessionWithDebounce`, which validates the composite image path, debounces for 4,000ms, and enqueues a print job in `PrintQueueService.ts`.
3. **Cloud Archive:** `SyncEngine` streams completed session records to backend PostgreSQL and uploads media to Cloudflare R2.
4. **Web Dashboard:** Operators query historical sessions via [`SupportSearchPage.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/dashboard/src/pages/SupportSearchPage.tsx) to resend digital download emails or extend link expiry.

## 5. Current Invariants
- **Data Retention Rule:** Local session composites and raw photo frames must NEVER be deleted prior to 7-day retention expiry and verified cloud upload.
- **Reprint Debounce:** Admin reprint triggers must enforce a minimum 4,000ms debounce to prevent physical print queue flooding.
- **Rate Limiting:** Emergency reprint rate limit mandates a maximum of 3 physical reprints per customer session.
- **Scope Boundary:** Session History Center must NOT be classified as fully closed until Remote Edge Reprint is either implemented or formally deferred by the Founder.

## 6. Known Open Issues
- **Planned / Scope Decision:** Remote Edge Reprint (dispatching physical reprint commands from the Web Dashboard to the Kiosk over live WebSocket) is currently unstarted.

## 7. Next Task
Founder decision on whether Remote Edge Reprint is required for Booth #1 Pilot or deferred to Post-Pilot.

## 8. Evidence
1. [`docs/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md) — Operational report for Phase 1 and 2.
2. [`docs/SESSION_HISTORY_CENTER_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PRD.md) — Architectural PRD.
3. [`docs/SESSION_HISTORY_CENTER_PHASE1_2_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/SESSION_HISTORY_CENTER_PHASE1_2_RCA.md) — Fix report for session history edge cases.
4. Commit `ca0d092` (*"session history before UAT"*).
5. Source file: [`apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts).

## 9. Related Workstreams
- **Printer:** Admin reprints enqueue directly into `PrintQueueService`.
- **Storage:** Composite JPEGs and animated GIFs are linked to session records.
- **Dashboard:** Web dashboard queries PostgreSQL session replicas.

## 10. Status Confidence
**HIGH.** Local history and web search are fully implemented and verified; remote reprint boundary is clearly delineated.
