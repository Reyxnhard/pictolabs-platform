# PICTOLABS — DOCUMENTATION CANONICALIZATION & DRIFT RECONCILIATION MATRIX
## AUTHORITATIVE HIERARCHY, DRIFT RESOLUTION & ENGINEERING STATUS AUDIT

> **Audit Type:** Documentation Canonicalization, Drift Reconciliation & Status Alignment  
> **Target Scope:** Entire Pictolabs Platform Documentation Base (264 Markdown Files)  
> **Safety Rule:** AUDIT & RECONCILIATION ONLY — Zero File Deletions, Zero Renames, Zero Moves, Zero Code Changes  
> **Date:** October 6, 2026  
> **Status:** OFFICIAL RECONCILIATION AUDIT (Antigravity Core)  

---

## 1. Executive Summary & Purpose

Following the completion of the Documentation Inventory (264 files) and Forensic Duplication Audit, this document executes the **Canonicalization and Drift Reconciliation Phase**.

The objectives of this phase are:
1. Establish a single, unambiguous **Canonical Documentation Hierarchy** designating one authoritative document for every system role.
2. Formally reconcile all **16 Content Drift Sets (35 files)**, identifying the technical divergences, line deltas, and determining the canonical version vs duplicate/superseded copies.
3. Reconcile **Master Timeline Status Claims** against ground-truth repository evidence, commit logs, automated test suites, and hardware UAT logs.
4. Establish a strict **13-Term Status Vocabulary** eliminating misleading percentage estimates.
5. Provide the **Documentation Canonicalization Matrix** and the **Founder Decisions Required** list.

---

## 2. Canonical Document Hierarchy

Every functional documentation role is assigned exactly one canonical document and path. All other documents in that domain are designated as supporting evidence, historical logs, or non-authoritative superseded drafts.

| Documentation Role | Canonical Filename & Path | Authority Level | Primary Purpose & Scope | Non-Authoritative / Superseded Documents |
|:---|:---|:---:|:---|:---|
| **A. Master Timeline** | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | **TIER 1 (FOUNDER BASELINE)** | Governing macro timeline baseline created by Founder + ChatGPT for Booth #1 pilot readiness. | `2026-09-10_MASTER_TIMELINE.md`, `CURRENT_PROJECT_STATUS.md`, `PICTOLABS_PILOT_READINESS_TIMELINE.md` (v1), `MASTER_PROJECT_ROADMAP.md`. |
| **A.1 Reconciled Audit Timeline** | [`AG_TIMELINE_MAPPING_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/AG_TIMELINE_MAPPING_AUDIT.md) | **TIER 1 (TECHNICAL SSOT)** | Reconciles Timeline v3 discrepancies with actual code, test suites, and commit history across all 10 workstreams. | Older un-reconciled timeline drafts and phase checklists. |
| **B. Current Project State** | [`CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md) | **TIER 1 (CODEBASE AUDIT)** | Line-by-line source code inspection of `apps/backend`, `apps/kiosk`, and `packages/shared`. | `MASTER_PROJECT_STATUS.md`, `PROJECT_STATUS_AUDIT.md`, `PROJECT_STATUS_REPORT.md`, `PICTOLABS_DEVELOPMENT_STATUS_REPORT.md`. |
| **C. Product Scope** | [`docs/PICTOLABS_MASTER_BLUEPRINT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_MASTER_BLUEPRINT.md) | **TIER 2 (ARCHITECTURE BLUEPRINT)** | Macro product vision, component topology, domain boundaries, and hardware interface architecture. | Early unratified scope drafts and feature wishlists. |
| **D. Decision Log (ADRs)** | [`docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md) *(and Sprint Review ADRs)* | **TIER 2 (ARCHITECTURAL DECISIONS)** | Formal rationale for architectural bifurcations (e.g., HTTP derived heartbeat vs mutable WebSocket state). | Verbal agreements, scratch notes, unratified ADR proposals. |
| **E. Workstream Reviews** | [`docs/SPRINT_1_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_1_REVIEW.md) through [`docs/SPRINT_5E_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5E_IMPLEMENTATION_REPORT.md) | **TIER 2 (SPRINT EVIDENCE)** | Verifiable sprint completion evidence, code commits, schema migrations, and test runs. | Preliminary sprint plans (`SPRINT_X_PLAN.md`) which represent intent rather than verified reality. |
| **F. RCA Evidence** | [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md) *(and RCAs 2–6 in `docs/`)* | **TIER 1 (HARDWARE INCIDENT SSOT)** | Deep forensic incident diagnostics, physical hardware timing traces, kernel USB bus behaviors, and failure reproductions. | Root directory duplicates, truncated investigation drafts. |
| **G. Fix Reports** | [`docs/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) *(and subsystem fix reports in `docs/`)* | **TIER 1 (IMPLEMENTATION SSOT)** | Exact file-level modifications, unit/integration test results, invariant proofs, and performance benchmarks. | Superseded V1 fix reports, unverified patch proposals. |
| **H. UAT Evidence** | [`docs/FOUNDER_UAT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/FOUNDER_UAT/FOUNDER_UAT_CHECKLIST.md) & [`docs/FOUNDER_UAT_EXECUTION_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/FOUNDER_UAT/FOUNDER_UAT_EXECUTION_GUIDE.md) | **TIER 1 (ACCEPTANCE GATE)** | Physical hardware testing protocols, acceptance gates, step-by-step verification flows on Booth #1. | Informal testing logs, outdated manual test notes. |
| **I. Deployment & Runbooks** | [`docs/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/DEPLOYMENT/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md) & [`docs/OPERATOR_RUNBOOK_v2.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/OPERATOR/OPERATOR_RUNBOOK_v2.md) | **TIER 1 (OPERATIONAL RUNBOOKS)** | Production server provisioning, Docker Compose orchestration, kiosk lockdown scripts, daily technician procedures. | Local staging checklists, deprecated v1 operator runbooks. |
| **J. Historical Archives** | Preserved in [`docs/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs) *(Future target: `docs/archive/`)* | **TIER 3 (HISTORICAL EVIDENCE)** | Chronological engineering progression, intermediate sprint plans, superseded architecture explorations. | Must **NOT** be consulted for current operational specifications. |

---

## 3. Reconciliation of the 16 Content Drift Sets (35 Files)

Each of the 16 drift sets identified during the inventory has been analyzed line-by-line:

### Drift Set 1: `SKILL.md` (3 Files)
- **Instances:**
  - `./.agents/skills/no-ai-slop/SKILL.md` (10,856 B)
  - `./.agents/skills/pictolabs-sprint-workflow/SKILL.md` (3,982 B)
  - `./.agents/skills/ui-ux-pro-max/SKILL.md` (28,066 B)
- **Technical Analysis:** These 3 files share identical filenames only because of the agentic skill specification convention. Their contents are completely distinct skill instructions.
- **Classification:** **INDEPENDENT_CANONICAL** (Each file is canonical within its respective skill directory). Zero drift.

### Drift Set 2: `README.md` (2 Files)
- **Instances:**
  - `./pictolabs-rebuild/apps/dashboard/README.md` (1,278 B)
  - `./pictolabs-rebuild/README.md` (649 B)
- **Technical Analysis:** Distinct package-level READMEs. One serves the monorepo root, the other documents the React dashboard.
- **Classification:** **INDEPENDENT_CANONICAL** (Each file is canonical for its subproject). Zero drift.

### Drift Set 3: `DEPLOYMENT_AUDIT.md` (3 Files)
- **Instances:**
  - `./docs/DEPLOYMENT_AUDIT.md` (26,431 B, hash `e51e320a`)
  - `./DEPLOYMENT_AUDIT.md` (26,431 B, hash `d6cec282`)
  - `./pictolabs-rebuild/DEPLOYMENT_AUDIT.md` (26,431 B, hash `d6cec282`)
- **Technical Analysis:** Delta is exactly 1 line (Line 7 header path: `docs/DEPLOYMENT_AUDIT.md` vs `DEPLOYMENT_AUDIT.md`). All technical audit findings, VPS parameters, and port configurations are identical.
- **Classification:**
  - **CANONICAL:** [`docs/DEPLOYMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/DEPLOYMENT_AUDIT.md)
  - **DUPLICATE / MIRROR:** Root instance and `pictolabs-rebuild/` instance.

### Drift Set 4: `FOUNDER_UAT_CHECKLIST.md` (2 Files)
- **Instances:**
  - `./docs/FOUNDER_UAT_CHECKLIST.md` (21,468 B, hash `0f90fdbd`)
  - `./FOUNDER_UAT_CHECKLIST.md` (21,479 B, hash `cc7abb34`)
- **Technical Analysis:** Delta is 1 phrase on line 102 (`Inactivity Session Watchdog` vs `Session Watchdog`). The checklist matrix, scenarios, and checkboxes are identical.
- **Classification:**
  - **CANONICAL:** [`docs/FOUNDER_UAT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/FOUNDER_UAT/FOUNDER_UAT_CHECKLIST.md)
  - **DUPLICATE:** Root instance.

### Drift Set 5: `MASTER_PROJECT_STATUS.md` (2 Files)
- **Instances:**
  - `./docs/MASTER_PROJECT_STATUS.md` (33,878 B, mtime Sept 7, hash `8a1feb54`)
  - `./pictolabs-rebuild/MASTER_PROJECT_STATUS.md` (33,883 B, mtime Sept 6, hash `7982ce25`)
- **Technical Analysis:** 369 lines differ. The `pictolabs-rebuild/` version is an un-updated Sept 6 draft missing Sprint 2 completion records and final schema models. The `./docs/` version is the final Sept 7 architecture blueprint.
- **Classification:**
  - **CANONICAL (HISTORICAL EVIDENCE):** [`docs/MASTER_PROJECT_STATUS.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/MASTER_PROJECT_STATUS.md)
  - **SUPERSEDED:** `pictolabs-rebuild/MASTER_PROJECT_STATUS.md` (safe to archive).

### Drift Set 6: `OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md` (2 Files)
- **Instances:**
  - `./docs/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md` (8,853 B, hash `6f531385`)
  - `./OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md` (8,848 B, hash `25240899`)
- **Technical Analysis:** 1 line formatting delta on Line 7 (link target markdown syntax). All code snippets and test verifications match 100%.
- **Classification:**
  - **CANONICAL:** [`docs/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md)
  - **DUPLICATE:** Root instance.

### Drift Set 7: `PAYMENT_BLINK_FIX_VALIDATION.md` (2 Files)
- **Instances:**
  - `./docs/PAYMENT_BLINK_FIX_VALIDATION.md` (22,118 B, hash `fefffcfb`)
  - `./PAYMENT_BLINK_FIX_VALIDATION.md` (22,117 B, hash `475d4342`)
- **Technical Analysis:** 1 line delta on line 216 (`+` git diff marker prefix inside code block). Technical validation data is identical.
- **Classification:**
  - **CANONICAL:** [`docs/PAYMENT_BLINK_FIX_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/PAYMENT_BLINK_FIX_VALIDATION.md)
  - **DUPLICATE:** Root instance.

### Drift Set 8: `PAYMENT_BLINK_RCA.md` (2 Files) — *MAJOR CONTENT DRIFT*
- **Instances:**
  - `./docs/PAYMENT_BLINK_RCA.md` (21,411 B, 435 lines, hash `aace7097`)
  - `./PAYMENT_BLINK_RCA.md` (12,658 B, 215 lines, hash `9b68e269`)
- **Technical Analysis:** **315 lines delta.** The root file is an early, truncated investigation draft (*"INVESTIGATION ONLY — NO CODE IMPLEMENTATION"*). The `./docs/` file is the complete, comprehensive forensic RCA with deep audits of all 5 target subsystems, root cause confirmation, and fix specifications.
- **Classification:**
  - **CANONICAL:** [`docs/PAYMENT_BLINK_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_BLINK_RCA.md)
  - **SUPERSEDED_DRAFT:** Root instance (Must be archived, never used as reference).

### Drift Set 9: `PAYMENT_QR_SOURCE_AUDIT.md` (2 Files)
- **Instances:**
  - `./docs/PAYMENT_QR_SOURCE_AUDIT.md` (10,436 B, hash `7f3878db`)
  - `./PAYMENT_QR_SOURCE_AUDIT.md` (10,442 B, hash `c3540bea`)
- **Technical Analysis:** 1 line formatting delta on Line 146 (whitespace). EMVCo Tag 63 analysis and Midtrans QR audit are identical.
- **Classification:**
  - **CANONICAL:** [`docs/PAYMENT_QR_SOURCE_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_QR_SOURCE_AUDIT.md)
  - **DUPLICATE:** Root instance.

### Drift Set 10: `PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md` (2 Files)
- **Instances:**
  - `./docs/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md` (21,875 B, hash `aeab1b04`)
  - `./PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md` (21,807 B, hash `3542f147`)
- **Technical Analysis:** The `./docs/` version includes corrected code block formatting for lines 160–165. Technical fix details and test verifications match.
- **Classification:**
  - **CANONICAL:** [`docs/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md)
  - **DUPLICATE:** Root instance.

### Drift Set 11: `PRINTER_FAILURE_HANDLING_V2_RCA_5.md` (2 Files)
- **Instances:**
  - `./docs/PRINTER_FAILURE_HANDLING_V2_RCA_5.md` (26,025 B, hash `43df672e`)
  - `./PRINTER_FAILURE_HANDLING_V2_RCA_5.md` (26,026 B, hash `6e5879ee`)
- **Technical Analysis:** Typo correction on Line 283 (`Firmware` vs `Firmare`).
- **Classification:**
  - **CANONICAL:** [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_5.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_5.md)
  - **DUPLICATE:** Root instance.

### Drift Set 12: `SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md` (2 Files)
- **Instances:**
  - `./docs/SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md` (16,600 B, hash `bf78d207`)
  - `./SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md` (16,610 B, hash `e7851c3e`)
- **Technical Analysis:** 11 lines differ due to `+` diff markers in markdown code blocks. Technical implementation content is identical.
- **Classification:**
  - **CANONICAL:** [`docs/SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md)
  - **DUPLICATE:** Root instance.

### Drift Set 13: `SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md` (2 Files)
- **Instances:**
  - `./docs/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md` (15,452 B, hash `46b7e993`)
  - `./SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md` (15,447 B, hash `64bbf714`)
- **Technical Analysis:** 1 line header link delta. Content identical.
- **Classification:**
  - **CANONICAL:** [`docs/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md)
  - **DUPLICATE:** Root instance.

### Drift Set 14: `SESSION_HISTORY_CENTER_PRD.md` (2 Files)
- **Instances:**
  - `./docs/SESSION_HISTORY_CENTER_PRD.md` (39,667 B, hash `08008c00`)
  - `./SESSION_HISTORY_CENTER_PRD.md` (39,657 B, hash `3066d559`)
- **Technical Analysis:** 2 lines header and footer document identifier paths. Architectural PRD specifications are identical.
- **Classification:**
  - **CANONICAL:** [`docs/SESSION_HISTORY_CENTER_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PRD.md)
  - **DUPLICATE:** Root instance.

### Drift Set 15: `SPRINT_2_REVIEW.md` (2 Files)
- **Instances:**
  - `./docs/SPRINT_2_REVIEW.md` (20,436 B, hash `bfb6867a`)
  - `./pictolabs-rebuild/SPRINT_2_REVIEW.md` (20,442 B, hash `6ce97215`)
- **Technical Analysis:** 1 line markdown spacing delta. Midtrans and WebSocket review data are identical.
- **Classification:**
  - **CANONICAL:** [`docs/SPRINT_2_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_2_REVIEW.md)
  - **MIRRORED_COPY:** `pictolabs-rebuild/` instance.

### Drift Set 16: `SPRINT_3_PRODUCTION_CHECKLIST.md` (3 Files)
- **Instances:**
  - `./docs/SPRINT_3_PRODUCTION_CHECKLIST.md` (10,622 B, hash `0cace7e5`)
  - `./pictolabs-rebuild/SPRINT_3_PRODUCTION_CHECKLIST.md` (10,617 B, hash `13228613`)
  - `./SPRINT_3_PRODUCTION_CHECKLIST.md` (10,617 B, hash `13228613`)
- **Technical Analysis:** 1 line header delivery path delta. Checklist items match.
- **Classification:**
  - **CANONICAL:** [`docs/SPRINT_3_PRODUCTION_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_3_PRODUCTION_CHECKLIST.md)
  - **DUPLICATE / MIRROR:** Root instance and `pictolabs-rebuild/` instance.

---

## 4. Reconciled Master & Timeline Status

A forensic audit of repository commits, source code, and automated test runners establishes the ground truth across the 5 pivotal subsystems:

### 4.1 Subsystem A: Printer Execution Simplification (RCA-7)
- **Context & Evidence:**
  - Commit [`787b95d`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs) (*"fallback Printer Hardening, remove all overenginerr stuff"*):
    - Removed pre-dispatch `PhotolabDNP.exe` (2.25s), PowerShell WMI (1.2s), spooler snapshot (1.5s), and post-submission polling loops.
    - Decoupled GIF/MP4 transcode to background thread in [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx).
    - Reduced customer wait from ~43s down to ~3.5s.
    - Direct native GDI execution via `print.exe` with spooler acceptance semantics.
  - Automated Tests:
    - `rca7-simplification.spec.ts`: **6/6 SCENARIOS PASS (100%)**
    - `rca6-regression.spec.ts`: **36/36 SCENARIOS PASS (100%)**
    - `print-queue.spec.ts`: **9/9 SCENARIOS PASS (100%)**
    - `burn-in.spec.ts`: **34/34 ASSERTIONS PASS (100%)**
- **Disaggregated Status:**
  - **Implementation:** **`IMPLEMENTED`**
  - **Automated Verification:** **`AUTOMATED_VERIFIED`**
  - **Founder Physical UAT:**
    - On RCA-6 Anti-Duplication logic: **`FOUNDER_UAT_PASS`** (Founder confirmed zero duplicate prints on V7 hardware test).
    - On RCA-7 Simplification logic (Commit `787b95d` with direct GDI dispatch): **`FOUNDER_UAT_PENDING`** (Awaiting formal physical print test with `Pictolabs Kiosk Setup 1.0.0.exe` on DNP DS-RX1).
  - **Release Closure:** **`RELEASE_CLOSURE_PENDING`**

### 4.2 Subsystem B: Camera Failure Session Corruption & Data Leakage (P0)
- **Context & Evidence:**
  - Master Timeline v3 asserted: *"UNRESOLVED / NO EVIDENCE"*.
  - Ground Truth Commit [`c2ec517`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs) (*"camera session failure fix"*, Sep 24):
    - Added deterministic session teardown: `resetSession()` on `QRScreen` exit and `WelcomeScreen` touch.
    - Added IPC handler `kiosk.camera.resetSession()` to purge LiveView buffer in `CameraService.ts` on disconnect.
    - Isolated crash recovery: `initialPhotos` loaded only if `isRecovered === true`.
  - Automated Tests:
    - `scripts/run_camera_failure_session_isolation_verification.mjs`: **23/23 CHECKS PASS (100%)**.
- **Disaggregated Status:**
  - **Implementation:** **`IMPLEMENTED`**
  - **Automated Verification:** **`AUTOMATED_VERIFIED`**
  - **Founder Physical UAT:** **`FOUNDER_UAT_PENDING`** (Physical USB disconnect test on physical booth).
  - **Conclusion:** Timeline v3 claim of "Unresolved" was an outdated historical error.

### 4.3 Subsystem C: Dashboard Session History
- **Context & Evidence:**
  - Master Timeline v3 claimed: *"Phase 3 NOT STARTED"*.
  - Source Code Audit of `apps/dashboard`, `apps/backend`, and `apps/kiosk`:
    - Web Dashboard Archive & Table (`SessionsPage.tsx`): **`IMPLEMENTED` & `AUTOMATED_VERIFIED`**
    - Support Multi-parameter Search (`SupportSearchPage.tsx`): **`IMPLEMENTED` & `AUTOMATED_VERIFIED`**
    - Session Detail Modal (`SessionDetailModal.tsx`): **`IMPLEMENTED` & `AUTOMATED_VERIFIED`**
    - Local Kiosk Physical Reprint (`SessionHistorySection.tsx`): **`IMPLEMENTED` & `AUTOMATED_VERIFIED`**
    - Remote Edge Reprint (from Web Dashboard to Kiosk over live WebSocket): **`NOT_STARTED`** (Backend `SessionRedeliveryService.triggerReprint` creates DB logs only; edge WebSocket dispatch handler is not implemented).
- **Disaggregated Status:**
  - Kiosk Local Reprint: **`IMPLEMENTED`**
  - Dashboard Web Archive: **`IMPLEMENTED`**
  - Remote Edge Reprint: **`PLANNED` / `NOT_STARTED`**
  - **Conclusion:** The subsystem cannot be marked fully closed until Remote Edge Reprint is either implemented or formally descoped by the Founder.

### 4.4 Subsystem D: Camera Preview $leftrightarrow$ Capture Mismatch
- **Context & Evidence:**
  - Master Timeline v3 Section 16 classified this as *"Non-blocking / Deferred Backlog"*, while Section 3 classified it as *"Active Reliability Requirement"*.
  - Source Code Audit of [`apps/kiosk/src/screens/CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx) (lines 112–147 & 450–462):
    - If Canon LiveView frame does not arrive within 2000ms, the system engages WebRTC fallback (`startWebRTCFallback()`).
    - Customer poses looking at the webcam preview.
    - When countdown reaches 0, line 450 invokes native Canon shutter via IPC: `kiosk.camera.capturePhoto()`.
    - If Canon DSLR is physically attached, the photo is captured from the DSLR while customer posed for the webcam.
- **Disaggregated Status:**
  - Classification: **`ACTIVE_RELIABILITY_ISSUE`**
  - Status: **`PLANNED`** (Requires formal `CAMERA-01 RCA` to eliminate preview/capture desynchronization).

### 4.5 Subsystem E: Midtrans Payment Gateway
- **Context & Evidence:**
  - Sprint 2 Review claimed: *"100% complete, production ready"*.
  - Ground Truth Commit [`71d361d`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs) (*"qris done (tapi masih sandbox)"*) and [`docs/PAYMENT_ENVIRONMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_ENVIRONMENT_AUDIT.md):
    - Midtrans Core API and SHA-512 webhook integration are written.
    - System runs in **Sandbox Simulation Mode** (`SB-Mid-server-test-key`).
    - Real banking apps (BCA, Mandiri, GoPay) reject the simulated QRIS code with *"QR Tidak Valid"*.
- **Disaggregated Status:**
  - Sandbox Implementation: **`IMPLEMENTED`**
  - Sandbox Verification: **`AUTOMATED_VERIFIED`**
  - Production Merchant Onboarding: **`NOT_STARTED` / `PLANNED`**
  - Production Banking App Verification: **`NOT_STARTED`**
  - **Conclusion:** Production readiness claim was premature; live payment verification is pending merchant credential issuance.

---

## 5. Strict Status Vocabulary

To eliminate ambiguity across all documentation and audits, only the following **13 status terms** are authorized:

| Status Term | Definition & Mandatory Criteria | Prohibited Synonyms (Never Use) |
|:---|:---|:---|
| **`NOT_STARTED`** | Requirement identified in PRD/blueprint; zero lines of code written. | "Pending", "0%", "Backlog" |
| **`PLANNED`** | Architecture or sprint plan designed; implementation scheduled. | "Next up", "In pipeline" |
| **`IMPLEMENTED`** | Code written, committed, and compiled (zero TypeScript errors). | "Done", "Finished", "80% complete" |
| **`AUTOMATED_VERIFIED`** | Passed deterministic unit/integration test suites (100% pass). | "Tested", "Verified", "Works" |
| **`FOUNDER_UAT_PENDING`** | Automated tests pass; awaiting physical Founder test on hardware. | "Ready for UAT", "Almost done" |
| **`FOUNDER_UAT_PASS`** | Founder personally tested and certified physical hardware behavior. | "UAT done", "Signed off" |
| **`FOUNDER_UAT_FAIL`** | Physical hardware test revealed defect; requires RCA. | "Broken", "Buggy" |
| **`RELEASE_CLOSURE_PENDING`**| Hardware UAT passed; awaiting production installer/VPS deploy. | "Ready to ship" |
| **`PRODUCTION_VERIFIED`** | Deployed on live production VPS/hardware and verified in operation. | "Production ready", "Live" |
| **`BLOCKED`** | Cannot proceed due to an external dependency or hardware failure. | "Stuck", "Halted" |
| **`DEFERRED`** | Formally postponed by Founder to a post-pilot release. | "Dropped", "Ignored" |
| **`SUPERSEDED`** | Replaced by a newer document, specification, or fix report. | "Old", "Outdated" |
| **`HISTORICAL`** | Permanent diagnostic or sprint milestone evidence (never delete). | "Archived" |

---

## 6. Documentation Canonicalization Matrix

| Domain | Canonical Document | Authority Level | Supporting Evidence | Superseded Docs | Drift Resolution | Decision Needed |
|:---|:---|:---:|:---|:---|:---|:---:|
| **Master Timeline** | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | **TIER 1 (FOUNDER)** | [`AG_TIMELINE_MAPPING_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/AG_TIMELINE_MAPPING_AUDIT.md) | `2026-09-10_MASTER_TIMELINE.md`, `CURRENT_PROJECT_STATUS.md` | Resolved (Adopt Timeline v3 as Founder baseline) | **YES (P0)**: Ratify reconciled timeline |
| **Current State** | [`CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md) | **TIER 1 (CODE AUDIT)** | [`MASTER_PROJECT_STATUS.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/MASTER_PROJECT_STATUS.md) | `PROJECT_STATUS_AUDIT.md`, `PROJECT_STATUS_REPORT.md` | Resolved (Sept 14 audit is code SSOT) | NO |
| **Product Scope** | [`docs/PICTOLABS_MASTER_BLUEPRINT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_MASTER_BLUEPRINT.md) | **TIER 2 (ARCHITECTURE)** | [`docs/PICTOLABS_PLATFORM_ARCHITECTURE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PICTOLABS_PLATFORM_ARCHITECTURE.md) | Early unratified scope drafts | Resolved (Single macro architecture blueprint) | NO |
| **Printer Subsystem** | [`docs/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) | **TIER 1 (IMPLEMENTATION)** | [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md), RCAs 2–6 | `PRINTER_FAILURE_HANDLING_RCA.md` (V1), `PRINTER_FAILURE_HANDLING_FIX_REPORT.md` | Root exact duplicate flagged | **YES (P0)**: Schedule Founder Physical UAT on DNP |
| **Camera Subsystem** | [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md) | **TIER 1 (IMPLEMENTATION)** | [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md), Commit `c2ec517` | None (V1 was incomplete) | Root exact duplicate flagged | **YES (P0)**: Authorize `CAMERA-01 RCA` (preview bug) |
| **Payment (Midtrans)** | [`docs/PAYMENT_BLINK_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_BLINK_RCA.md) & [`docs/PAYMENT_ENVIRONMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_ENVIRONMENT_AUDIT.md) | **TIER 1 (RCA & AUDIT)** | [`docs/PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md), Commit `71d361d` | Root draft `PAYMENT_BLINK_RCA.md` (12.6 KB) | Major drift resolved (adopt 21.4 KB `docs/` copy) | **YES (P0)**: Clarify live Midtrans onboarding |
| **Cloud Storage (R2)** | [`docs/SPRINT_3_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_3_REVIEW.md) | **TIER 2 (SPRINT EVIDENCE)** | [`docs/R2_INTEGRATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/R2_INTEGRATION_REPORT.md), [`docs/SPRINT_3_PRODUCTION_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_3_PRODUCTION_CHECKLIST.md) | `SPRINT_3_PLAN.md` | Monorepo mirror copy flagged | NO |
| **Session History** | [`docs/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md) | **TIER 1 (OPERATIONAL SPEC)** | [`docs/SESSION_HISTORY_CENTER_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PRD.md), [`docs/SESSION_HISTORY_CENTER_PHASE1_2_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/SESSION_HISTORY_CENTER_PHASE1_2_RCA.md) | None | Minor header drifts resolved | **YES (P1)**: Decide Remote Edge Reprint scope |
| **Fleet / Activation** | [`docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md) | **TIER 2 (ADR & SPEC)** | [`docs/HEARTBEAT_STATUS_RULES.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/HEARTBEAT_STATUS_RULES.md), [`docs/PROVISIONING_RUNTIME_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PROVISIONING_RUNTIME_AUDIT.md) | `SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | Monorepo mirror copy flagged | NO |
| **Dashboard Ops** | [`docs/SPRINT_5A_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_IMPLEMENTATION_REPORT.md) & [`docs/SPRINT_5B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_IMPLEMENTATION_REPORT.md) | **TIER 2 (SPRINT EVIDENCE)** | [`docs/SPRINT_5C_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5C_IMPLEMENTATION_REPORT.md), `apps/dashboard/src` | `SPRINT_5A_IMPLEMENTATION_PLAN.md`, `SPRINT_5B_IMPLEMENTATION_PLAN.md` | Monorepo mirror copy flagged | NO |
| **Security / Admin PIN**| [`docs/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md) | **TIER 1 (IMPLEMENTATION)** | [`docs/ADMIN_PIN_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/ADMIN_PIN_RCA.md), [`docs/DEVICE_SECRET_RUNTIME_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/DEVICE_SECRET_RUNTIME_VALIDATION.md) | `ADMIN_PIN_FIX_REPORT.md` (Online-only) | Root exact duplicate flagged | NO |
| **Deployment** | [`docs/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/DEPLOYMENT/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md) | **TIER 1 (RUNBOOK)** | [`docs/DEPLOYMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/DEPLOYMENT_AUDIT.md), [`docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PRODUCTION_DEPLOYMENT_CHECKLIST.md) | Deprecated staging guides | Path header drift resolved | NO |
| **Kiosk Hardening** | [`docs/SPRINT_5E_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5E_IMPLEMENTATION_REPORT.md) | **TIER 1 (IMPLEMENTATION)** | `pictolabs-rebuild/scripts/lockdown-kiosk.ps1`, `watchdog-kiosk.ps1` | `SPRINT_5E_KIOSK_HARDENING_PLAN.md` | Root exact duplicate flagged | NO |
| **UAT & Acceptance** | [`docs/FOUNDER_UAT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/FOUNDER_UAT/FOUNDER_UAT_CHECKLIST.md) | **TIER 1 (ACCEPTANCE GATE)** | [`docs/FOUNDER_UAT_EXECUTION_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/FOUNDER_UAT/FOUNDER_UAT_EXECUTION_GUIDE.md), [`docs/PROVISIONING_UAT_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/PROVISIONING_UAT_REPORT.md) | Informal testing notes | 1-line wording drift resolved | NO |

---

## 7. Founder Decisions Required

The following explicit strategic and architectural decisions are submitted for Founder determination:

### Priority P0 Decisions (Critical Launch Blockers):

1. **Ratification of the Canonical SSOT Hierarchy:**
   - **Decision:** Formally ratify [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) reconciled with [`AG_TIMELINE_MAPPING_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/AG_TIMELINE_MAPPING_AUDIT.md) as the sole governing Master Timeline for the project, establishing that all technical specifications reside canonically in `./docs/`.

2. **Printer RCA-7 Formal Signoff & Physical UAT:**
   - **Decision:** Schedule Founder physical UAT on the physical DNP DS-RX1 printer using the new standalone installer build (`Pictolabs Kiosk Setup 1.0.0.exe`).
   - If Founder considers previous V7 hardware testing sufficient verification that duplicate printing is eliminated, formally authorize updating status to **`FOUNDER_UAT_PASS`** and **`RELEASE_CLOSURE_PENDING`**.

3. **Camera Reliability Mandate (`CAMERA-01 RCA`):**
   - **Decision:** Formally authorize **`CAMERA-01 RCA`** to resolve the preview $leftrightarrow$ capture synchronization defect in [`CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx), ensuring customer framing matches the shutter sensor before public pilot launch.

4. **Midtrans Production Verification Strategy:**
   - **Decision:** Authorize the timeline for obtaining live production Midtrans merchant credentials and determine whether Pilot Booth #1 launches initially in **Offline Cash / Voucher Bypass Mode** (using [`docs/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md)) or awaits live merchant bank activation.

---

### Priority P1 Decisions (Operational & Scope Management):

5. **Remote Edge Reprint Scope Decision:**
   - **Decision:** Determine whether Remote Edge Reprint (dispatching physical reprint commands from the Web Dashboard to the Kiosk over WebSocket) is a **Mandatory Pilot Requirement** or **Post-Pilot Phase 2 Enhancement**.
   - Note: Kiosk Local Reprint (via Admin Panel Session History) is fully implemented and operational today.

6. **Adoption of Canonical Versions for the 16 Drift Sets:**
   - **Decision:** Formally approve designating the `./docs/` versions as canonical for all 16 drift sets, specifically adopting the complete 21.4 KB [`docs/PAYMENT_BLINK_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_BLINK_RCA.md) and marking the truncated 12.6 KB root draft as superseded.

7. **Documentation Archive Strategy Approval:**
   - **Decision:** Approve the eventual execution of the phased documentation cleanup (as outlined in [`AG_DOCUMENTATION_CLEANUP_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/AG_DOCUMENTATION_CLEANUP_PLAN.md)), which will move 71 exact root duplicates, 24 monorepo mirror files, and 18 superseded planning documents into `docs/archive/` with zero technical information loss.

---
*Audit completed strictly under AUDIT ONLY rules. Zero files modified, renamed, moved, or deleted.*  
*Certified by Antigravity Core Engineering.*
