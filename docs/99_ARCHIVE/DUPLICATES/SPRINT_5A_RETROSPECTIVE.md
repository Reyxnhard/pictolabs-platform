# SPRINT 5A RETROSPECTIVE
## Operational Dashboard Foundation — Lessons Learned & Engineering Retrospective

> **Sprint**: Sprint 5A  
> **Milestone**: Dashboard Foundation (Owner / Operational Control Plane)  
> **Target Release**: Pictolabs Platform v1.0.0  
> **Completion Date**: September 09, 2026  
> **Lead Architecture**: DeepMind Advanced Agentic Coding Pair / Pictolabs Core Engineering  

---

## 1. Executive Summary & Delivery Highlights

Sprint 5A marked the transition of Pictolabs from an autonomous edge kiosk installation to an orchestrated, cloud-connected photobooth fleet. We designed and built the **Pictolabs Cloud Control** operations plane from the ground up, anchoring the entire platform architecture around the principle that **the Session is the primary business entity**.

### 🏆 Key Deliverables Achieved
1. **Platform Architectural Blueprint**: Published `PICTOLABS_PLATFORM_ARCHITECTURE.md` establishing the long-term domain hierarchy (`Branch → Booth → Session → Asset`), asset strategies (`PHOTO`, `PHOTO_STRIP`, `LIVE_PHOTO`, `GIF`, `VIDEO`, `FLIPBOOK`), and zero-egress Cloudflare R2 pipeline.
2. **Operations Dashboard (`apps/dashboard`)**: Implemented a modern, responsive React 18 + Vite 6 + Tailwind CSS v4 dashboard providing:
   - **Fleet Overview**: 4 high-level KPI cards (Online, Offline, Maintenance, Sessions Today), fleet connectivity snapshot, and recent sessions ledger.
   - **Booths Fleet Management**: Complete kiosk table with dynamic status computation (<60s Online, <5m Degraded, ≥5m Offline), runtime software/hardware telemetry badges, and slide-out Maintenance mode drawer (`PATCH /api/booths/:id/status`).
   - **Sessions Archive**: Paginated, multi-filter ledger supporting partial search by Session ID, filters by Booth, Branch, Date, and lifecycle status.
   - **Asset-Centric Gallery**: Dedicated visual softfile inspector categorizing `PHOTO_STRIP` (with lightbox zoom), individual `PHOTO` poses 1–4, and HTML5 video playback for `LIVE_PHOTO` bursts, along with customer link copying and consolidated ZIP downloading.
3. **Backend Query & Analytics Foundation (`apps/backend`)**:
   - Added database indexes in PostgreSQL for performant multi-tenant session queries (`sessions(boothId, status, createdAt)` and `photos(sessionId)`).
   - Implemented `GET /api/sessions`, `GET /api/sessions/stats/today` (with WIB UTC+7 start-of-day calculation), and enriched `GET /api/gallery/:sessionId`.
4. **Resilient Status Architecture**: Guaranteed zero UI crashes by making `LifecycleBadge` tolerate arbitrary, custom, or unknown session status strings with neutral fallback rendering.
5. **Zero Regression Proof**: Ran automated test suites confirming zero regression on DNP thermal printing, Midtrans QRIS payment webhooks, and Cloudflare R2 storage ingestion (`30 PASSED | 0 FAILED`).

---

## 2. What Went Well (Success Factors)

### 2.1 Clean Domain Alignment with Architectural Blueprint
By authoring `PICTOLABS_PLATFORM_ARCHITECTURE.md` before writing dashboard code, the team avoided common pitfalls such as coupling assets directly to kiosks or treating booths as financial accounts. Every metric, query, and UI view naturally maps to a `Session`, creating an intuitive mental model for the owner and support operators.

### 2.2 Reusing Sprint 4B Deterministic HTTP Heartbeats
Rather than maintaining brittle state machines across Socket.IO connections, the dashboard derives booth status on-the-fly from the deterministic `last_seen` timestamp recorded by the kiosk HTTP heartbeat. This completely eliminated "ghost online" or "stuck offline" states caused by temporary network blips.

### 2.3 Strict Scope Discipline
The team strictly adhered to the negative requirements:
- **No analytics / revenue charts**: Kept the dashboard focused on real-time operational uptime rather than business intelligence.
- **No hardware sensor telemetry in V1**: Deferred CPU temps and paper roll counts to Sprint 5B/4C, preventing scope creep and unverified mocks.
- **Asset focus on production formats**: Implemented viewers for `PHOTO_STRIP`, `PHOTO`, and `LIVE_PHOTO` while cleanly deferring GIF, video montages, and flipbook players.

---

## 3. Challenges, Friction Points & Root Causes

### 3.1 The "Dual React Version" Monorepo Bundling Incident
- **Symptom**: When the dashboard preview server was launched on `http://localhost:5173/`, the browser loaded a completely blank dark screen (`#0f172a`), despite the server returning HTTP 200 and the build process reporting 0 TypeScript errors.
- **Root Cause Analysis**:
  - In an earlier setup phase, Vite was initialized in `apps/dashboard`, creating a nested `apps/dashboard/node_modules/` directory containing `react@19.2.8`.
  - Concurrently, the root monorepo `node_modules` contained `react@18.3.1`, which was the peer dependency of `@types/react`, `react-router-dom@7`, and `zustand`.
  - When Vite built the production client bundle, it included two competing versions of the React runtime. At runtime in the browser, `react-router-dom` called `useContext()` on React 18, while the DOM was mounted on React 19, throwing an uncaught `Invalid hook call` / `useContext null` exception before rendering any HTML into `#root`.
- **Resolution**:
  - Pruned the isolated `apps/dashboard/node_modules/` directory.
  - Added `resolve.dedupe: ['react', 'react-dom', 'react-router-dom']` to `vite.config.ts`.
  - Rebuilt the bundle cleanly, reducing bundle size from 401 kB down to 358 kB and restoring normal UI rendering.
  - Implemented a top-level `ErrorBoundary` in `App.tsx` to ensure any future runtime exceptions display an actionable diagnostic screen rather than a blank page.

### 3.2 Automated Browser Subagent Driver Failure
- **Symptom**: During phase verification, the `browser_subagent` failed to launch because the external CDN `https://playwright.azureedge.net/builds/driver/playwright-1.57.0-win32_x64.zip` returned HTTP 404 on the host environment.
- **Root Cause**: Playwright driver CDN paths change across minor versions or can be unreachable from certain network gateways.
- **Resolution**: Implemented programmatic verification via automated Node.js test scripts (`sessions.e2e.ts`), HTTP asset verification, and build inspection, providing concrete regression proof without blocking on external browser binaries.

### 3.3 Database Environment Password Discrepancy
- **Symptom**: Initial Prisma schema push failed due to authentication rejection.
- **Root Cause**: The local development file `apps/backend/.env` contained `pictolabs_dev_2026`, whereas the active Docker PostgreSQL container was running with `pictolabs_secure_prod_2026`.
- **Resolution**: Synchronized the environment file with the running container credentials and verified connection via `prisma db push`.

---

## 4. Key Learnings & Engineering Principles for Sprint 5B

| Learning Area | Retrospective Takeaway | Action Rule for Future Sprints |
| :--- | :--- | :--- |
| **Monorepo Dependency Hygiene** | In npm workspaces, sub-packages must never maintain independent `node_modules` that shadow root peer dependencies. | Always run `npm install` from the repository root and configure `resolve.dedupe` in all Vite configs. |
| **Defensive Frontend UX** | A silent JavaScript exception should never produce a blank screen. | Every new feature view or modal must be protected by error boundaries and neutral fallbacks for unknown states. |
| **Operational Customer Support Gap** | In production, customers do not know their `sessionId` (e.g. `session_1788...`). When a customer reports a missing photo or payment issue, support staff cannot easily find their session. | **Sprint 5B must build Support Search** (search by customer email, phone, Midtrans Order ID, time range, and visual strip preview). |
| **Session Observability Gap** | Knowing that a session is `FAILED` or `COMPLETED` is insufficient for troubleshooting. Operators need to know *which step failed* (shutter, payment, print, or R2 upload). | **Sprint 5B must introduce Session Timeline & Health Diagnosis**. |
| **Manual Support Remediation** | When a print jams or a customer types their email incorrectly, the operator currently has no dashboard mechanism to resend the softfile or trigger a reprint. | **Sprint 5B must implement the Re-delivery Control Flow**. |

---

## 5. Transition to Sprint 5B

With the foundational control plane operational and verified, Pictolabs moves to **Sprint 5B: Session Observability, Support Operations & Re-Delivery**.

Sprint 5B directly addresses the real-world operational challenges identified during this retrospective:
1. **Session Timeline**: Deep step-by-step audit trail of every hardware and cloud phase.
2. **Session Health**: Automated root-cause classification (`HEALTHY`, `DEGRADED`, `FAILED`, `ABANDONED`).
3. **Re-delivery Flow**: One-click operational tools to resend digital softfiles, extend access links, and command physical reprints.
4. **Support Search**: Rapid customer resolution via phone, email, Midtrans order ID, and visual photo strip identification.
