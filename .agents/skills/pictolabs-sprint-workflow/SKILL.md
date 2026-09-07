---
name: pictolabs-sprint-workflow
description: Standardized enterprise development and verification workflow for Pictolabs Photobooth. Use when planning, executing, auditing, testing, or closing any development sprint in the Pictolabs repository.
---

# Pictolabs Sprint Execution & Quality Assurance Workflow

Standard operating procedure for executing development milestones on the Pictolabs Enterprise Photobooth platform. This workflow guarantees zero regression across mission-critical hardware (Canon DSLR, thermal printers) and payment systems, accompanied by automated end-to-end verification.

---

## The 6-Phase Sprint Lifecycle

```
[Phase 1: Planning Audit & Revision]
  │
  ▼
[Phase 2: Scoped Implementation]
  │
  ▼
[Phase 3: Automated E2E Verification Suite]
  │
  ▼
[Phase 4: Full Workspace Build & Typecheck]
  │
  ▼
[Phase 5: Official Review Documentation]
  │
  ▼
[Phase 6: Blueprint Sync & Clean Git Commit]
```

---

### Phase 1: Planning Audit & Revision (`SPRINT_X_PLAN.md`)
1. Before writing implementation code, audit the active repository state.
2. Formulate explicit, numbered Acceptance Criteria (e.g. `AC-1.1` to `AC-5.4`).
3. Explicitly document:
   - In-scope features vs. Out-of-scope features.
   - Dual-tier edge cases (e.g., fallback behaviors, offline queues, retention limits).
4. Lock planning document in `docs/SPRINT_X_PLAN.md` and keep replica synchronized in `pictolabs-rebuild/SPRINT_X_PLAN.md`.
5. Obtain user approval before beginning implementation.

---

### Phase 2: Scoped Implementation (Zero-Regression Rule)
1. Implement features modularly without touching isolated hardware/payments code:
   - **DO NOT** modify `CameraService.ts` (Canon EDSDK C++ binding).
   - **DO NOT** modify `RenderEngine.ts` (Sharp 300 DPI layout compositor).
   - **DO NOT** modify `PaymentsService.ts` (Midtrans QRIS core) unless explicitly tasked.
2. Build graceful fallbacks for every cloud/external dependency (e.g. Cloudflare R2 falls back to `public/uploads`; cloud webhook falls back to polling).
3. Ensure offline resiliency: write all client transactions/uploads to local SQLite (`WAL` mode) first before communicating with external networks.

---

### Phase 3: Automated E2E Verification Suite (`*.e2e.ts`)
1. For every sprint, create an executable automated test script (e.g. `src/storage/storage.e2e.ts`, `src/payments/payments.e2e.ts`).
2. Map assertions directly 1-to-1 to each Acceptance Criterion:
   ```ts
   assert(condition === true, 'AC-1.1: Verification description');
   ```
3. Always run regression suites from previous sprints to prove **Zero Regression**:
   - `npm run test:storage` (Sprint 3)
   - `npx ts-node src/payments/payments.e2e.ts` (Sprint 2)
4. Success condition: **100% PASS (0 FAILED)**.

---

### Phase 4: Workspace Build Verification
1. Run static analysis and compilation across all workspaces:
   - `apps/backend`: `npm run typecheck` & `npm run build`
   - `apps/kiosk`: `npm run build` (Vite) & `npx tsc -p tsconfig.electron.json --noEmit`
2. Ensure 0 TypeScript errors and 0 build warnings.

---

### Phase 5: Official Review Documentation (`SPRINT_X_REVIEW.md`)
Generate the formal closing review document in `docs/SPRINT_X_REVIEW.md` (and replica in `pictolabs-rebuild/`):
1. **Objectives Completed Table**: Target vs. Status vs. Evidence.
2. **Features Implemented**: Architectural highlights and state machines.
3. **Acceptance Criteria Verification Matrix**: Complete audit table of all ACs with PASS/FAIL status.
4. **Test Execution Logs**: Raw console output of test suite runs.
5. **Codebase Modifications**: Table of all modified/created files.
6. **Definition of Done (DoD) Sign-off**: Verification checklist.

---

### Phase 6: Blueprint Sync & Clean Git Commit
1. Update `docs/MASTER_PROJECT_STATUS.md` to reflect completed sprint percentages.
2. Stage modified files and commit with conventional commits:
   `git commit -m "feat(sprint-X): summary of milestone features"`
