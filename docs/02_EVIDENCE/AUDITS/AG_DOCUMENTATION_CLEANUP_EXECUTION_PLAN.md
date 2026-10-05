# PICTOLABS — DOCUMENTATION CLEANUP EXECUTION PLAN
## TWO-PHASE ATOMIC REPOSITORY HYGIENE & CANONICAL REORGANIZATION MANIFEST

> [!IMPORTANT]
> **DOCUMENT STATUS: PLANNING ONLY — CLEANUP NOT EXECUTED**  
> **Current State:** Cleanup NOT executed. All repository files remain in their original physical locations.  
> **Target State:** Defined two-phase execution architecture; NOT yet physically implemented.  
> **Safety Invariants:** ZERO File Deletions, ZERO Renames, ZERO File Moves, ZERO Git MV, ZERO Application Code Changes.  
> **Target Scope:** Entire Pictolabs Platform Documentation Base (264 Original Inventory Files + Workstream Layer).  
> **Date:** October 6, 2026  
> **Auditor / Engineering Authority:** Antigravity Core Engineering  

---

## 1. Executive Summary & Core Invariants

This finalized execution plan establishes the definitive, phased operational procedure for eliminating redundant documentation and reorganizing canonical assets in the Pictolabs repository.

### Critical Architecture: Two Segregated Cleanup Operations (Correction 1)
To ensure absolute repository stability and prevent conflation of redundancy pruning with folder restructuring, this plan separates cleanup into **two distinct, sequential operations separated by an explicit validation checkpoint**:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE A — REDUNDANCY CLEANUP                                                │
│ Target: 71 Exact Duplicates + 24 Monorepo Mirrors + 29 Approved Superseded  │
│ Destination: docs/99_ARCHIVE/ [DUPLICATES/, MIRRORS/, SUPERSEDED/]          │
│ Excluded: 16 REVIEW_REQUIRED files BLOCKED from movement                    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ MANDATORY VALIDATION GATE: PHASE A PASS VERIFICATION                         │
│ Requirement: Zero broken links, zero lost files, canonical docs intact,     │
│ evidence intact, git diff reviewed and committed.                           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ (Proceed ONLY if Gate Passes)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE B — CANONICAL FOLDER REORGANIZATION                                    │
│ Target: 124 Canonical Documents Relocated to Clean Folder Hierarchy          │
│ Destinations: docs/00_CONTEXT/, docs/02_EVIDENCE/, docs/03_RUNBOOKS/,       │
│               docs/04_HISTORY/                                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ MANDATORY VALIDATION GATE: PHASE B PASS VERIFICATION                         │
│ Requirement: Zero broken links, zero broken code references,                 │
│ canonical architecture matches manifest 100%.                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

**NEITHER PHASE HAS BEEN EXECUTED. THIS IS PLANNING ONLY.**

---

### Statistical Breakdown (264 Original Inventory Files):

| Category | File Count | Percentage | Planned Phase | Operational Definition & Planned Action |
|:---|:---:|:---:|:---:|:---|
| **KEEP (Canonical Assets)** | **124** | 47.0% | **Phase B** | Active governance, canonical workstream specs, permanent evidence RCAs, sprint reviews, and runbooks. **Action: Retained in canonical folders.** |
| **ARCHIVE_DUPLICATE** | **71** | 26.9% | **Phase A** | Byte-identical root copies of canonical documents in `./docs/`. **Action: Relocate to `docs/99_ARCHIVE/DUPLICATES/`.** |
| **ARCHIVE_MIRROR** | **24** | 9.1% | **Phase A** | Byte-identical copies in `./pictolabs-rebuild/` mirroring `./docs/`. **Action: Relocate to `docs/99_ARCHIVE/MIRRORS/`.** |
| **ARCHIVE_SUPERSEDED** | **29** | 11.0% | **Phase A** | Outdated preliminary sprint plans and superseded V1 failure reports. **Action: Relocate to `docs/99_ARCHIVE/SUPERSEDED/`.** |
| **REVIEW_REQUIRED / BLOCKED** | **16** | 6.0% | **BLOCKED** | Content drift sets requiring Founder ratification before moving. **Action: BLOCKED from movement. Must remain in place.** |
| **TOTAL ORIGINAL INVENTORY** | **264** | **100.0%** | — | Full baseline documented in `AG_DOCUMENTATION_INVENTORY.md`. |
| **CANONICAL WORKSTREAMS** | **+10** | — | Established | Established in `docs/01_WORKSTREAMS/`. **Action: Retained in place (KEEP).** |
| **AUDIT & RECONCILIATION** | **+9** | — | Established | Reconciled audit artifacts. **Action: Retained as technical evidence (KEEP).** |

---

### Core Guarantees & Corrected Principles:

1. **Zero Deletion Pledge:** **NO FILE WILL BE DELETED.** Every archived file is safely preserved in `docs/99_ARCHIVE/` with full Git history.
2. **Review Required Files Blocked (Correction 2):** The 16 `REVIEW_REQUIRED` files are **NOT approved for automatic movement**. Their execution state is set to **`REVIEW_REQUIRED / BLOCKED`**. They must **NOT** be moved until explicitly ratified by the Founder. They will NOT be silently archived.
3. **Current vs Target Location Delineation (Correction 3):** Current physical locations vs planned target locations are strictly distinguished. The target architecture is NOT claimed to be physically established until Phase B is executed.
4. **Superseded Definition — `OLD != SUPERSEDED` (Correction 4):** A file may ONLY be classified as `ARCHIVE_SUPERSEDED` when:
   - Its operational purpose is no longer active;
   - A canonical replacement exists;
   - It contains no unique current requirement; and
   - It contains no unique evidence that is not preserved elsewhere.
   *Historical RCA, UAT, and Fix evidence must remain accessible as permanent evidence.*
5. **Printer RCA Count Corrected (Correction 5):** Exactly **all 6 Printer Hardware RCAs (RCA-2 through RCA-7)** exist in the repository and are 100% preserved as permanent evidence.
6. **Zero Runtime Impact:** Static analysis of 247 application source code files confirmed **EXACTLY ZERO CODE REFERENCES TO MARKDOWN DOCUMENTATION**. Documentation hygiene carries zero runtime breakage risk.

---

## 2. Canonical Documentation Architecture (Current Location vs Target Location)

> [!NOTE]
> The target hierarchy below represents the **planned end-state organization**. It will NOT be created until Phase B is executed after Phase A passes validation.

```text
CURRENT LOCATION                                     TARGET LOCATION (Post-Phase B)
────────────────                                     ───────────────────────────────
./PICTOLABS_PILOT_READINESS_TIMELINE_v3.md    ──►   docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md
./CURRENT_PROJECT_STATE.md                   ──►   docs/00_CONTEXT/CURRENT_PROJECT_STATE.md
./docs/PICTOLABS_MASTER_BLUEPRINT.md         ──►   docs/00_CONTEXT/PICTOLABS_MASTER_BLUEPRINT.md

docs/01_WORKSTREAMS/                         ──►   docs/01_WORKSTREAMS/ (REMAINS IN PLACE)
├── CAMERA_WORKSTREAM.md
├── PRINTER_WORKSTREAM.md
├── PAYMENT_WORKSTREAM.md
├── SESSION_HISTORY_WORKSTREAM.md
├── FLEET_WORKSTREAM.md
├── DASHBOARD_WORKSTREAM.md
├── STORAGE_WORKSTREAM.md
├── SECURITY_WORKSTREAM.md
├── DEPLOYMENT_WORKSTREAM.md
└── KIOSK_HARDENING_WORKSTREAM.md

docs/PRINTER_FAILURE_HANDLING_V2_RCA_*       ──►   docs/02_EVIDENCE/RCA/ (All 6 RCAs: RCA-2 to RCA-7)
docs/*_FIX_REPORT*.md                        ──►   docs/02_EVIDENCE/FIX_REPORTS/
docs/FOUNDER_UAT_*.md                        ──►   docs/02_EVIDENCE/UAT/
AG_*_AUDIT.md                                ──►   docs/02_EVIDENCE/AUDITS/

docs/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md    ──►   docs/03_RUNBOOKS/DEPLOYMENT/
docs/OPERATOR_RUNBOOK_v2.md                  ──►   docs/03_RUNBOOKS/OPERATOR/
docs/FOUNDER_UAT_CHECKLIST.md                ──►   docs/03_RUNBOOKS/FOUNDER_UAT/

docs/SPRINT_*_REVIEW.md                      ──►   docs/04_HISTORY/SPRINT_REVIEWS/

./ (71 exact root duplicates)                ──►   docs/99_ARCHIVE/DUPLICATES/ (Phase A)
pictolabs-rebuild/ (24 mirror copies)        ──►   docs/99_ARCHIVE/MIRRORS/    (Phase A)
./ & docs/ (29 superseded planning files)    ──►   docs/99_ARCHIVE/SUPERSEDED/ (Phase A)
./ (16 review-required drifted files)        ──►   [BLOCKED / REMAINS AT SOURCE IN PLACE]
```

---

## 3. Master Cleanup Candidate Manifest (140 Files Evaluated)

The table below lists all 140 files evaluated for cleanup. 
- **Phase A Scope:** Rows 1–124 (71 duplicates + 24 mirrors + 29 superseded).
- **Phase A Exclusions:** Rows 125–140 are strictly **BLOCKED / REVIEW_REQUIRED** and will NOT be moved.

| # | Current Source Path | Category | Planned Target Path | Canonical Replacement | Reason | Reference Risk | Planned Action |
|:---:|:---|:---:|:---|:---|:---|:---:|:---:|
| 1 | `./ACTIVATION_FREEZE_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/ACTIVATION_FREEZE_FIX_REPORT.md` | [`./docs/ACTIVATION_FREEZE_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/ACTIVATION_FREEZE_FIX_REPORT.md) | Byte-identical root copy (Hash: `ecd7b1ecd4`) | **LOW** | **ARCHIVE (Phase A)** |
| 2 | `./ADMIN_PIN_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/ADMIN_PIN_FIX_REPORT.md` | [`./docs/ADMIN_PIN_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/ADMIN_PIN_FIX_REPORT.md) | Byte-identical root copy (Hash: `422bd25998`) | **LOW** | **ARCHIVE (Phase A)** |
| 3 | `./ADMIN_PIN_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/ADMIN_PIN_RCA.md` | [`./docs/ADMIN_PIN_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/ADMIN_PIN_RCA.md) | Byte-identical root copy (Hash: `c7ea59f00f`) | **LOW** | **ARCHIVE (Phase A)** |
| 4 | `./ADMIN_PIN_RUNTIME_TRACE.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/ADMIN_PIN_RUNTIME_TRACE.md` | [`./docs/ADMIN_PIN_RUNTIME_TRACE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/ADMIN_PIN_RUNTIME_TRACE.md) | Byte-identical root copy (Hash: `bf50ba9c5f`) | **LOW** | **ARCHIVE (Phase A)** |
| 5 | `./AG_TIMELINE_MAPPING_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/AG_TIMELINE_MAPPING_AUDIT.md` | [`./docs/AG_TIMELINE_MAPPING_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/AG_TIMELINE_MAPPING_AUDIT.md) | Byte-identical root copy (Hash: `36683193bf`) | **LOW** | **ARCHIVE (Phase A)** |
| 6 | `./CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md` | [`./docs/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md) | Byte-identical root copy (Hash: `3d80c7dacc`) | **LOW** | **ARCHIVE (Phase A)** |
| 7 | `./CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md` | [`./docs/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md) | Byte-identical root copy (Hash: `352d6c42a2`) | **LOW** | **ARCHIVE (Phase A)** |
| 8 | `./DASHBOARD_PRICING_CONTROL_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/DASHBOARD_PRICING_CONTROL_REPORT.md` | [`./docs/DASHBOARD_PRICING_CONTROL_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/DASHBOARD_PRICING_CONTROL_REPORT.md) | Byte-identical root copy (Hash: `e2cfc35ea9`) | **LOW** | **ARCHIVE (Phase A)** |
| 9 | `./DEPLOYMENT_PLAN.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/DEPLOYMENT_PLAN.md` | [`./docs/DEPLOYMENT_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/DEPLOYMENT_PLAN.md) | Byte-identical root copy (Hash: `dad5d4d2ec`) | **LOW** | **ARCHIVE (Phase A)** |
| 10 | `./DEVICE_VISIBILITY_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/DEVICE_VISIBILITY_FIX_REPORT.md` | [`./docs/DEVICE_VISIBILITY_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/DEVICE_VISIBILITY_FIX_REPORT.md) | Byte-identical root copy (Hash: `03f8b7867a`) | **LOW** | **ARCHIVE (Phase A)** |
| 11 | `./DEVICE_VISIBILITY_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/DEVICE_VISIBILITY_RCA.md` | [`./docs/DEVICE_VISIBILITY_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/DEVICE_VISIBILITY_RCA.md) | Byte-identical root copy (Hash: `26456e7fb4`) | **LOW** | **ARCHIVE (Phase A)** |
| 12 | `./FILTER_RENDER_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/FILTER_RENDER_FIX_REPORT.md` | [`./docs/FILTER_RENDER_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/FILTER_RENDER_FIX_REPORT.md) | Byte-identical root copy (Hash: `3f458d326d`) | **LOW** | **ARCHIVE (Phase A)** |
| 13 | `./FILTER_RENDER_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/FILTER_RENDER_RCA.md` | [`./docs/FILTER_RENDER_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/FILTER_RENDER_RCA.md) | Byte-identical root copy (Hash: `7033112a4b`) | **LOW** | **ARCHIVE (Phase A)** |
| 14 | `./FOUNDER_UAT_EXECUTION_GUIDE.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/FOUNDER_UAT_EXECUTION_GUIDE.md` | [`./docs/FOUNDER_UAT_EXECUTION_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/FOUNDER_UAT/FOUNDER_UAT_EXECUTION_GUIDE.md) | Byte-identical root copy (Hash: `e9c8e17464`) | **LOW** | **ARCHIVE (Phase A)** |
| 15 | `./HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md` | [`./docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md) | Byte-identical root copy (Hash: `749fa99aea`) | **LOW** | **ARCHIVE (Phase A)** |
| 16 | `./HEARTBEAT_STATUS_RULES.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/HEARTBEAT_STATUS_RULES.md` | [`./docs/HEARTBEAT_STATUS_RULES.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/HEARTBEAT_STATUS_RULES.md) | Byte-identical root copy (Hash: `65446fa4e2`) | **LOW** | **ARCHIVE (Phase A)** |
| 17 | `./INFRASTRUCTURE_REQUIREMENTS_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md` | [`./docs/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md) | Byte-identical root copy (Hash: `6e17cc61ae`) | **LOW** | **ARCHIVE (Phase A)** |
| 18 | `./LOCAL_DEPLOYMENT_VALIDATION.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/LOCAL_DEPLOYMENT_VALIDATION.md` | [`./docs/LOCAL_DEPLOYMENT_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/LOCAL_DEPLOYMENT_VALIDATION.md) | Byte-identical root copy (Hash: `12ff9eb189`) | **LOW** | **ARCHIVE (Phase A)** |
| 19 | `./LOCAL_PRODUCTION_SETUP.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/LOCAL_PRODUCTION_SETUP.md` | [`./docs/LOCAL_PRODUCTION_SETUP.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/DEPLOYMENT/LOCAL_PRODUCTION_SETUP.md) | Byte-identical root copy (Hash: `b1eb711ce5`) | **LOW** | **ARCHIVE (Phase A)** |
| 20 | `./OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md` | [`./docs/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md) | Byte-identical root copy (Hash: `f929b69e7e`) | **LOW** | **ARCHIVE (Phase A)** |
| 21 | `./OFFLINE_ADMIN_PANEL_ACCESS_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/OFFLINE_ADMIN_PANEL_ACCESS_RCA.md` | [`./docs/OFFLINE_ADMIN_PANEL_ACCESS_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/OFFLINE_ADMIN_PANEL_ACCESS_RCA.md) | Byte-identical root copy (Hash: `12cda04e44`) | **LOW** | **ARCHIVE (Phase A)** |
| 22 | `./OFFLINE_PAYMENT_BYPASS_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/OFFLINE_PAYMENT_BYPASS_RCA.md` | [`./docs/OFFLINE_PAYMENT_BYPASS_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/OFFLINE_PAYMENT_BYPASS_RCA.md) | Byte-identical root copy (Hash: `8a91f4a68a`) | **LOW** | **ARCHIVE (Phase A)** |
| 23 | `./OPERATIONAL_READINESS_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/OPERATIONAL_READINESS_AUDIT.md` | [`./docs/OPERATIONAL_READINESS_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/OPERATIONAL_READINESS_AUDIT.md) | Byte-identical root copy (Hash: `907f4123f3`) | **LOW** | **ARCHIVE (Phase A)** |
| 24 | `./PAYMENT_AMOUNT_SOURCE_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PAYMENT_AMOUNT_SOURCE_AUDIT.md` | [`./docs/PAYMENT_AMOUNT_SOURCE_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_AMOUNT_SOURCE_AUDIT.md) | Byte-identical root copy (Hash: `07cf31a95d`) | **LOW** | **ARCHIVE (Phase A)** |
| 25 | `./PAYMENT_ENVIRONMENT_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PAYMENT_ENVIRONMENT_AUDIT.md` | [`./docs/PAYMENT_ENVIRONMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_ENVIRONMENT_AUDIT.md) | Byte-identical root copy (Hash: `ea1ef24024`) | **LOW** | **ARCHIVE (Phase A)** |
| 26 | `./PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md` | [`./docs/PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md) | Byte-identical root copy (Hash: `52eb8782fc`) | **LOW** | **ARCHIVE (Phase A)** |
| 27 | `./PAYMENT_TRANSACTION_LOOP_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PAYMENT_TRANSACTION_LOOP_RCA.md` | [`./docs/PAYMENT_TRANSACTION_LOOP_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_TRANSACTION_LOOP_RCA.md) | Byte-identical root copy (Hash: `3b0b472aa9`) | **LOW** | **ARCHIVE (Phase A)** |
| 28 | `./PICTOLABS_PLATFORM_ARCHITECTURE.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PICTOLABS_PLATFORM_ARCHITECTURE.md` | [`./docs/PICTOLABS_PLATFORM_ARCHITECTURE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PICTOLABS_PLATFORM_ARCHITECTURE.md) | Byte-identical root copy (Hash: `f9044b7ec9`) | **LOW** | **ARCHIVE (Phase A)** |
| 29 | `./POSTGRESQL_MIGRATION_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/POSTGRESQL_MIGRATION_AUDIT.md` | [`./docs/POSTGRESQL_MIGRATION_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/POSTGRESQL_MIGRATION_AUDIT.md) | Byte-identical root copy (Hash: `ad0e231f64`) | **LOW** | **ARCHIVE (Phase A)** |
| 30 | `./POST_SPRINT_5C_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/POST_SPRINT_5C_AUDIT.md` | [`./docs/POST_SPRINT_5C_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/POST_SPRINT_5C_AUDIT.md) | Byte-identical root copy (Hash: `e930446031`) | **LOW** | **ARCHIVE (Phase A)** |
| 31 | `./PRINTER_DETECTION_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_DETECTION_FIX_REPORT.md` | [`./docs/PRINTER_DETECTION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_DETECTION_FIX_REPORT.md) | Byte-identical root copy (Hash: `ffdd7e8be6`) | **LOW** | **ARCHIVE (Phase A)** |
| 32 | `./PRINTER_DETECTION_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_DETECTION_RCA.md` | [`./docs/PRINTER_DETECTION_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_DETECTION_RCA.md) | Byte-identical root copy (Hash: `3f620a8fd6`) | **LOW** | **ARCHIVE (Phase A)** |
| 33 | `./PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md` | [`./docs/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) | Byte-identical root copy (Hash: `1e1ba5dc70`) | **LOW** | **ARCHIVE (Phase A)** |
| 34 | `./PRINTER_FAILURE_HANDLING_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_FIX_REPORT.md` | [`./docs/PRINTER_FAILURE_HANDLING_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/PRINTER_FAILURE_HANDLING_FIX_REPORT.md) | Byte-identical root copy (Hash: `4b395aa3b6`) | **LOW** | **ARCHIVE (Phase A)** |
| 35 | `./PRINTER_FAILURE_HANDLING_FIX_V2_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_FIX_V2_REPORT.md` | [`./docs/PRINTER_FAILURE_HANDLING_FIX_V2_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_FIX_V2_REPORT.md) | Byte-identical root copy (Hash: `c67ad3eba2`) | **LOW** | **ARCHIVE (Phase A)** |
| 36 | `./PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md` | [`./docs/PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md) | Byte-identical root copy (Hash: `eb2401638d`) | **LOW** | **ARCHIVE (Phase A)** |
| 37 | `./PRINTER_FAILURE_HANDLING_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_RCA.md` | [`./docs/PRINTER_FAILURE_HANDLING_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/PRINTER_FAILURE_HANDLING_RCA.md) | Byte-identical root copy (Hash: `9a7600573b`) | **LOW** | **ARCHIVE (Phase A)** |
| 38 | `./PRINTER_FAILURE_HANDLING_V2_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT.md) | Byte-identical root copy (Hash: `b6917eb6aa`) | **LOW** | **ARCHIVE (Phase A)** |
| 39 | `./PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_3.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_3.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_3.md) | Byte-identical root copy (Hash: `bd60f863ff`) | **LOW** | **ARCHIVE (Phase A)** |
| 40 | `./PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_4.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_4.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_4.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_4.md) | Byte-identical root copy (Hash: `1236919d3c`) | **LOW** | **ARCHIVE (Phase A)** |
| 41 | `./PRINTER_FAILURE_HANDLING_V2_RCA_2.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_RCA_2.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_RCA_2.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_2.md) | Byte-identical root copy (Hash: `197d7d9c87`) | **LOW** | **ARCHIVE (Phase A)** |
| 42 | `./PRINTER_FAILURE_HANDLING_V2_RCA_3.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_RCA_3.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_RCA_3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_3.md) | Byte-identical root copy (Hash: `c99310d716`) | **LOW** | **ARCHIVE (Phase A)** |
| 43 | `./PRINTER_FAILURE_HANDLING_V2_RCA_4.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_RCA_4.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_RCA_4.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_4.md) | Byte-identical root copy (Hash: `eb7e789482`) | **LOW** | **ARCHIVE (Phase A)** |
| 44 | `./PRINTER_FAILURE_HANDLING_V2_RCA_6.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_RCA_6.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_RCA_6.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_6.md) | Byte-identical root copy (Hash: `0a0f88b03d`) | **LOW** | **ARCHIVE (Phase A)** |
| 45 | `./PRINTER_FAILURE_HANDLING_V2_RCA_6_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_RCA_6_FIX_REPORT.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_RCA_6_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_V2_RCA_6_FIX_REPORT.md) | Byte-identical root copy (Hash: `0deff2c38b`) | **LOW** | **ARCHIVE (Phase A)** |
| 46 | `./PRINTER_FAILURE_HANDLING_V2_RCA_7.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_RCA_7.md` | [`./docs/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md) | Byte-identical root copy (Hash: `0b993a1202`) | **LOW** | **ARCHIVE (Phase A)** |
| 47 | `./PRODUCTION_DEPLOYMENT_CHECKLIST.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PRODUCTION_DEPLOYMENT_CHECKLIST.md` | [`./docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PRODUCTION_DEPLOYMENT_CHECKLIST.md) | Byte-identical root copy (Hash: `e9afbe68bb`) | **LOW** | **ARCHIVE (Phase A)** |
| 48 | `./PROJECT_STATUS_AUDIT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PROJECT_STATUS_AUDIT.md` | [`./docs/PROJECT_STATUS_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PROJECT_STATUS_AUDIT.md) | Byte-identical root copy (Hash: `7475c51416`) | **LOW** | **ARCHIVE (Phase A)** |
| 49 | `./PROVISIONING_UAT_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/PROVISIONING_UAT_REPORT.md` | [`./docs/PROVISIONING_UAT_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/PROVISIONING_UAT_REPORT.md) | Byte-identical root copy (Hash: `d861dbc8e0`) | **LOW** | **ARCHIVE (Phase A)** |
| 50 | `./R2_INTEGRATION_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/R2_INTEGRATION_REPORT.md` | [`./docs/R2_INTEGRATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/R2_INTEGRATION_REPORT.md) | Byte-identical root copy (Hash: `b81cfe6ef8`) | **LOW** | **ARCHIVE (Phase A)** |
| 51 | `./SESSION_HISTORY_CENTER_PHASE1_2_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SESSION_HISTORY_CENTER_PHASE1_2_RCA.md` | [`./docs/SESSION_HISTORY_CENTER_PHASE1_2_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/SESSION_HISTORY_CENTER_PHASE1_2_RCA.md) | Byte-identical root copy (Hash: `eb404125c2`) | **LOW** | **ARCHIVE (Phase A)** |
| 52 | `./SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md) | Byte-identical root copy (Hash: `0154a168bf`) | **LOW** | **ARCHIVE (Phase A)** |
| 53 | `./SPRINT_4B_IMPLEMENTATION_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_4B_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_4B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_4B_IMPLEMENTATION_REPORT.md) | Byte-identical root copy (Hash: `6d7e742207`) | **LOW** | **ARCHIVE (Phase A)** |
| 54 | `./SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md) | Byte-identical root copy (Hash: `edd388f53d`) | **LOW** | **ARCHIVE (Phase A)** |
| 55 | `./SPRINT_5A_DASHBOARD_PRD.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5A_DASHBOARD_PRD.md` | [`./docs/SPRINT_5A_DASHBOARD_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_DASHBOARD_PRD.md) | Byte-identical root copy (Hash: `e0d8cd53cc`) | **LOW** | **ARCHIVE (Phase A)** |
| 56 | `./SPRINT_5A_IMPLEMENTATION_PLAN.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5A_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_5A_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_5A_IMPLEMENTATION_PLAN.md) | Byte-identical root copy (Hash: `ff982201b3`) | **LOW** | **ARCHIVE (Phase A)** |
| 57 | `./SPRINT_5A_IMPLEMENTATION_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5A_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_5A_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_IMPLEMENTATION_REPORT.md) | Byte-identical root copy (Hash: `7800fbd47b`) | **LOW** | **ARCHIVE (Phase A)** |
| 58 | `./SPRINT_5A_RETROSPECTIVE.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5A_RETROSPECTIVE.md` | [`./docs/SPRINT_5A_RETROSPECTIVE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/RETROSPECTIVES/SPRINT_5A_RETROSPECTIVE.md) | Byte-identical root copy (Hash: `0123332d61`) | **LOW** | **ARCHIVE (Phase A)** |
| 59 | `./SPRINT_5B_FOUNDER_UAT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5B_FOUNDER_UAT.md` | [`./docs/SPRINT_5B_FOUNDER_UAT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/SPRINT_5B_FOUNDER_UAT.md) | Byte-identical root copy (Hash: `4a12e99971`) | **LOW** | **ARCHIVE (Phase A)** |
| 60 | `./SPRINT_5B_IMPLEMENTATION_PLAN.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5B_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_5B_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_5B_IMPLEMENTATION_PLAN.md) | Byte-identical root copy (Hash: `c567ceceef`) | **LOW** | **ARCHIVE (Phase A)** |
| 61 | `./SPRINT_5B_IMPLEMENTATION_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5B_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_5B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_IMPLEMENTATION_REPORT.md) | Byte-identical root copy (Hash: `cb491c1b1f`) | **LOW** | **ARCHIVE (Phase A)** |
| 62 | `./SPRINT_5B_PRD.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5B_PRD.md` | [`./docs/SPRINT_5B_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_PRD.md) | Byte-identical root copy (Hash: `e14e5f0a9e`) | **LOW** | **ARCHIVE (Phase A)** |
| 63 | `./SPRINT_5B_VERIFICATION.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5B_VERIFICATION.md` | [`./docs/SPRINT_5B_VERIFICATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/SPRINT_5B_VERIFICATION.md) | Byte-identical root copy (Hash: `9e76dc133e`) | **LOW** | **ARCHIVE (Phase A)** |
| 64 | `./SPRINT_5C_IMPLEMENTATION_PLAN.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5C_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_5C_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_5C_IMPLEMENTATION_PLAN.md) | Byte-identical root copy (Hash: `36cfa0d6db`) | **LOW** | **ARCHIVE (Phase A)** |
| 65 | `./SPRINT_5C_IMPLEMENTATION_PLAN_V2.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5C_IMPLEMENTATION_PLAN_V2.md` | [`./docs/SPRINT_5C_IMPLEMENTATION_PLAN_V2.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_5C_IMPLEMENTATION_PLAN_V2.md) | Byte-identical root copy (Hash: `fb293be840`) | **LOW** | **ARCHIVE (Phase A)** |
| 66 | `./SPRINT_5C_IMPLEMENTATION_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5C_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_5C_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5C_IMPLEMENTATION_REPORT.md) | Byte-identical root copy (Hash: `a46a8fdc79`) | **LOW** | **ARCHIVE (Phase A)** |
| 67 | `./SPRINT_5C_PRD.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5C_PRD.md` | [`./docs/SPRINT_5C_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5C_PRD.md) | Byte-identical root copy (Hash: `f96ccb5236`) | **LOW** | **ARCHIVE (Phase A)** |
| 68 | `./SPRINT_5E_IMPLEMENTATION_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5E_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_5E_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5E_IMPLEMENTATION_REPORT.md) | Byte-identical root copy (Hash: `aa964dfecb`) | **LOW** | **ARCHIVE (Phase A)** |
| 69 | `./SPRINT_5E_KIOSK_HARDENING_PLAN.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/SPRINT_5E_KIOSK_HARDENING_PLAN.md` | [`./docs/SPRINT_5E_KIOSK_HARDENING_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_5E_KIOSK_HARDENING_PLAN.md) | Byte-identical root copy (Hash: `1169af8adb`) | **LOW** | **ARCHIVE (Phase A)** |
| 70 | `./TECHNICIAN_PIN_FIX_REPORT.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/TECHNICIAN_PIN_FIX_REPORT.md` | [`./docs/TECHNICIAN_PIN_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/TECHNICIAN_PIN_FIX_REPORT.md) | Byte-identical root copy (Hash: `c890217c5e`) | **LOW** | **ARCHIVE (Phase A)** |
| 71 | `./TECHNICIAN_PIN_SYNC_RCA.md` | **ARCHIVE_DUPLICATE** | `docs/99_ARCHIVE/DUPLICATES/TECHNICIAN_PIN_SYNC_RCA.md` | [`./docs/TECHNICIAN_PIN_SYNC_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/TECHNICIAN_PIN_SYNC_RCA.md) | Byte-identical root copy (Hash: `b1d3bfe344`) | **LOW** | **ARCHIVE (Phase A)** |
| 72 | `./pictolabs-rebuild/DEPLOYMENT_PLAN.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/DEPLOYMENT_PLAN.md` | [`./docs/DEPLOYMENT_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/DEPLOYMENT_PLAN.md) | Redundant monorepo copy (Hash: `dad5d4d2ec`) | **LOW** | **ARCHIVE (Phase A)** |
| 73 | `./pictolabs-rebuild/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md` | [`./docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md) | Redundant monorepo copy (Hash: `749fa99aea`) | **LOW** | **ARCHIVE (Phase A)** |
| 74 | `./pictolabs-rebuild/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md` | [`./docs/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md) | Redundant monorepo copy (Hash: `6e17cc61ae`) | **LOW** | **ARCHIVE (Phase A)** |
| 75 | `./pictolabs-rebuild/LOCAL_DEPLOYMENT_VALIDATION.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/LOCAL_DEPLOYMENT_VALIDATION.md` | [`./docs/LOCAL_DEPLOYMENT_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/LOCAL_DEPLOYMENT_VALIDATION.md) | Redundant monorepo copy (Hash: `12ff9eb189`) | **LOW** | **ARCHIVE (Phase A)** |
| 76 | `./pictolabs-rebuild/LOCAL_PRODUCTION_SETUP.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/LOCAL_PRODUCTION_SETUP.md` | [`./docs/LOCAL_PRODUCTION_SETUP.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/DEPLOYMENT/LOCAL_PRODUCTION_SETUP.md) | Redundant monorepo copy (Hash: `b1eb711ce5`) | **LOW** | **ARCHIVE (Phase A)** |
| 77 | `./pictolabs-rebuild/OPERATIONAL_READINESS_AUDIT.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/OPERATIONAL_READINESS_AUDIT.md` | [`./docs/OPERATIONAL_READINESS_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/OPERATIONAL_READINESS_AUDIT.md) | Redundant monorepo copy (Hash: `907f4123f3`) | **LOW** | **ARCHIVE (Phase A)** |
| 78 | `./pictolabs-rebuild/PICTOLABS_PLATFORM_ARCHITECTURE.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/PICTOLABS_PLATFORM_ARCHITECTURE.md` | [`./docs/PICTOLABS_PLATFORM_ARCHITECTURE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PICTOLABS_PLATFORM_ARCHITECTURE.md) | Redundant monorepo copy (Hash: `f9044b7ec9`) | **LOW** | **ARCHIVE (Phase A)** |
| 79 | `./pictolabs-rebuild/POSTGRESQL_MIGRATION_AUDIT.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/POSTGRESQL_MIGRATION_AUDIT.md` | [`./docs/POSTGRESQL_MIGRATION_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/POSTGRESQL_MIGRATION_AUDIT.md) | Redundant monorepo copy (Hash: `ad0e231f64`) | **LOW** | **ARCHIVE (Phase A)** |
| 80 | `./pictolabs-rebuild/PRODUCTION_DEPLOYMENT_CHECKLIST.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/PRODUCTION_DEPLOYMENT_CHECKLIST.md` | [`./docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PRODUCTION_DEPLOYMENT_CHECKLIST.md) | Redundant monorepo copy (Hash: `e9afbe68bb`) | **LOW** | **ARCHIVE (Phase A)** |
| 81 | `./pictolabs-rebuild/R2_INTEGRATION_REPORT.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/R2_INTEGRATION_REPORT.md` | [`./docs/R2_INTEGRATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/R2_INTEGRATION_REPORT.md) | Redundant monorepo copy (Hash: `b81cfe6ef8`) | **LOW** | **ARCHIVE (Phase A)** |
| 82 | `./pictolabs-rebuild/SPRINT_1_REVIEW.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_1_REVIEW.md` | [`./docs/SPRINT_1_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_1_REVIEW.md) | Redundant monorepo copy (Hash: `c6fb48e8a5`) | **LOW** | **ARCHIVE (Phase A)** |
| 83 | `./pictolabs-rebuild/SPRINT_2_PLAN.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_2_PLAN.md` | [`./docs/SPRINT_2_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_2_PLAN.md) | Redundant monorepo copy (Hash: `fd9b309605`) | **LOW** | **ARCHIVE (Phase A)** |
| 84 | `./pictolabs-rebuild/SPRINT_3_PLAN.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_3_PLAN.md` | [`./docs/SPRINT_3_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_3_PLAN.md) | Redundant monorepo copy (Hash: `069b9a6f8c`) | **LOW** | **ARCHIVE (Phase A)** |
| 85 | `./pictolabs-rebuild/SPRINT_3_REVIEW.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_3_REVIEW.md` | [`./docs/SPRINT_3_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_3_REVIEW.md) | Redundant monorepo copy (Hash: `6299e9fb7a`) | **LOW** | **ARCHIVE (Phase A)** |
| 86 | `./pictolabs-rebuild/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md) | Redundant monorepo copy (Hash: `0154a168bf`) | **LOW** | **ARCHIVE (Phase A)** |
| 87 | `./pictolabs-rebuild/SPRINT_4B_IMPLEMENTATION_REPORT.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_4B_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_4B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_4B_IMPLEMENTATION_REPORT.md) | Redundant monorepo copy (Hash: `6d7e742207`) | **LOW** | **ARCHIVE (Phase A)** |
| 88 | `./pictolabs-rebuild/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md) | Redundant monorepo copy (Hash: `edd388f53d`) | **LOW** | **ARCHIVE (Phase A)** |
| 89 | `./pictolabs-rebuild/SPRINT_5A_DASHBOARD_PRD.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_5A_DASHBOARD_PRD.md` | [`./docs/SPRINT_5A_DASHBOARD_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_DASHBOARD_PRD.md) | Redundant monorepo copy (Hash: `e0d8cd53cc`) | **LOW** | **ARCHIVE (Phase A)** |
| 90 | `./pictolabs-rebuild/SPRINT_5A_IMPLEMENTATION_PLAN.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_5A_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_5A_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_5A_IMPLEMENTATION_PLAN.md) | Redundant monorepo copy (Hash: `ff982201b3`) | **LOW** | **ARCHIVE (Phase A)** |
| 91 | `./pictolabs-rebuild/SPRINT_5A_IMPLEMENTATION_REPORT.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_5A_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_5A_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_IMPLEMENTATION_REPORT.md) | Redundant monorepo copy (Hash: `7800fbd47b`) | **LOW** | **ARCHIVE (Phase A)** |
| 92 | `./pictolabs-rebuild/SPRINT_5A_RETROSPECTIVE.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_5A_RETROSPECTIVE.md` | [`./docs/SPRINT_5A_RETROSPECTIVE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/RETROSPECTIVES/SPRINT_5A_RETROSPECTIVE.md) | Redundant monorepo copy (Hash: `0123332d61`) | **LOW** | **ARCHIVE (Phase A)** |
| 93 | `./pictolabs-rebuild/SPRINT_5B_IMPLEMENTATION_PLAN.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_5B_IMPLEMENTATION_PLAN.md` | [`./docs/SPRINT_5B_IMPLEMENTATION_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/SPRINT_5B_IMPLEMENTATION_PLAN.md) | Redundant monorepo copy (Hash: `c567ceceef`) | **LOW** | **ARCHIVE (Phase A)** |
| 94 | `./pictolabs-rebuild/SPRINT_5B_IMPLEMENTATION_REPORT.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_5B_IMPLEMENTATION_REPORT.md` | [`./docs/SPRINT_5B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_IMPLEMENTATION_REPORT.md) | Redundant monorepo copy (Hash: `cb491c1b1f`) | **LOW** | **ARCHIVE (Phase A)** |
| 95 | `./pictolabs-rebuild/SPRINT_5B_PRD.md` | **ARCHIVE_MIRROR** | `docs/99_ARCHIVE/MIRRORS/SPRINT_5B_PRD.md` | [`./docs/SPRINT_5B_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_PRD.md) | Redundant monorepo copy (Hash: `e14e5f0a9e`) | **LOW** | **ARCHIVE (Phase A)** |
| 96 | `./docs/2026-09-10_MASTER_TIMELINE.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/2026-09-10_MASTER_TIMELINE.md` | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 97 | `./docs/CRITICAL_SYNC_FIX_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/CRITICAL_SYNC_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 98 | `./docs/DEPLOYMENT_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/DEPLOYMENT_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 99 | `./docs/DEVICE_SECRET_FIX_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/DEVICE_SECRET_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 100 | `./docs/MASTER_PROJECT_ROADMAP.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/MASTER_PROJECT_ROADMAP.md` | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 101 | `./docs/PACKAGING_FIX_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PACKAGING_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 102 | `./docs/PHASE_3_2C_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PHASE_3_2C_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 103 | `./docs/PHASE_3_2D_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PHASE_3_2D_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 104 | `./docs/PHASE_3_2E_BURN_IN_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PHASE_3_2E_BURN_IN_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 105 | `./docs/PHASE_3_2E_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PHASE_3_2E_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 106 | `./docs/PHASE_3_2_IMPLEMENTATION_ROADMAP.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PHASE_3_2_IMPLEMENTATION_ROADMAP.md` | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 107 | `./docs/PHASE_3_3_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PHASE_3_3_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 108 | `./docs/PRE_LAUNCH_READINESS_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PRE_LAUNCH_READINESS_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 109 | `./docs/PRINTER_FAILURE_HANDLING_FIX_REPORT.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PRINTER_FAILURE_HANDLING_FIX_REPORT.md` | [`docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 110 | `./docs/PRINTER_FAILURE_HANDLING_RCA.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PRINTER_FAILURE_HANDLING_RCA.md` | [`docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 111 | `./docs/PROVISIONING_RUNTIME_FIX_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PROVISIONING_RUNTIME_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 112 | `./docs/SPRINT_1_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_1_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 113 | `./docs/SPRINT_2_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_2_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 114 | `./docs/SPRINT_3_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_3_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 115 | `./docs/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 116 | `./docs/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 117 | `./docs/SPRINT_5A_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_5A_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 118 | `./docs/SPRINT_5B_CLOSURE_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_5B_CLOSURE_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 119 | `./docs/SPRINT_5B_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_5B_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 120 | `./docs/SPRINT_5C_IMPLEMENTATION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_5C_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 121 | `./docs/SPRINT_5C_IMPLEMENTATION_PLAN_V2.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_5C_IMPLEMENTATION_PLAN_V2.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 122 | `./docs/SPRINT_5E_KIOSK_HARDENING_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/SPRINT_5E_KIOSK_HARDENING_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 123 | `./NEXT_ACTION_PLAN.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/NEXT_ACTION_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 124 | `./PICTOLABS_PILOT_READINESS_TIMELINE.md` | **ARCHIVE_SUPERSEDED** | `docs/99_ARCHIVE/SUPERSEDED/PICTOLABS_PILOT_READINESS_TIMELINE.md` | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Preliminary sprint plan or superseded V1 failure report replaced by final review | **LOW** | **ARCHIVE (Phase A)** |
| 125 | `./DEPLOYMENT_AUDIT.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/DEPLOYMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/DEPLOYMENT_AUDIT.md) | Content drift (26431 B vs 26431 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 126 | `./FOUNDER_UAT_CHECKLIST.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/FOUNDER_UAT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/FOUNDER_UAT/FOUNDER_UAT_CHECKLIST.md) | Content drift (21479 B vs 21468 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 127 | `./OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md) | Content drift (8848 B vs 8853 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 128 | `./PAYMENT_BLINK_FIX_VALIDATION.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/PAYMENT_BLINK_FIX_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/PAYMENT_BLINK_FIX_VALIDATION.md) | Content drift (22117 B vs 22118 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 129 | `./PAYMENT_BLINK_RCA.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/PAYMENT_BLINK_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_BLINK_RCA.md) | Content drift (12658 B vs 21411 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 130 | `./PAYMENT_QR_SOURCE_AUDIT.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/PAYMENT_QR_SOURCE_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_QR_SOURCE_AUDIT.md) | Content drift (10442 B vs 10436 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 131 | `./pictolabs-rebuild/DEPLOYMENT_AUDIT.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/DEPLOYMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/DEPLOYMENT_AUDIT.md) | Content drift (26431 B vs 26431 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 132 | `./pictolabs-rebuild/MASTER_PROJECT_STATUS.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/MASTER_PROJECT_STATUS.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/MASTER_PROJECT_STATUS.md) | Content drift (33883 B vs 33878 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 133 | `./pictolabs-rebuild/SPRINT_2_REVIEW.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/SPRINT_2_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_2_REVIEW.md) | Content drift (20442 B vs 20436 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 134 | `./pictolabs-rebuild/SPRINT_3_PRODUCTION_CHECKLIST.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/SPRINT_3_PRODUCTION_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_3_PRODUCTION_CHECKLIST.md) | Content drift (10617 B vs 10622 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 135 | `./PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md) | Content drift (21807 B vs 21875 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 136 | `./PRINTER_FAILURE_HANDLING_V2_RCA_5.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/PRINTER_FAILURE_HANDLING_V2_RCA_5.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_5.md) | Content drift (26026 B vs 26025 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 137 | `./SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md) | Content drift (16610 B vs 16600 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 138 | `./SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md) | Content drift (15447 B vs 15452 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 139 | `./SESSION_HISTORY_CENTER_PRD.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/SESSION_HISTORY_CENTER_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PRD.md) | Content drift (39657 B vs 39667 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |
| 140 | `./SPRINT_3_PRODUCTION_CHECKLIST.md` | **REVIEW_REQUIRED / BLOCKED** | `[HOLD — REMAINS AT SOURCE]` | [`./docs/SPRINT_3_PRODUCTION_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_3_PRODUCTION_CHECKLIST.md) | Content drift (10617 B vs 10622 B) — BLOCKED pending Founder decision | **MEDIUM** | **BLOCKED / REVIEW** |

---

## 4. Exact Duplicate Manifest (71 Files — Phase A Scope)

All **71 files** below reside in the root directory (`.`) and have been mathematically confirmed to share an identical SHA-256 cryptographic hash with their canonical counterpart in `./docs/`. They are safe to relocate in Phase A:

```text
ACTIVATION_FREEZE_FIX_REPORT.md             ADMIN_PIN_FIX_REPORT.md
ADMIN_PIN_RCA.md                            ADMIN_PIN_RUNTIME_TRACE.md
BOOT_RECOVERY_GAP_ANALYSIS.md               CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md
CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md    CRASH_RECOVERY_LEDGER_REPORT.md
DASHBOARD_GAP_ANALYSIS.md                   DASHBOARD_PRICING_CONTROL_REPORT.md
DEVICE_SECRET_FIX_PLAN.md                   DEVICE_SECRET_RUNTIME_VALIDATION.md
DEVICE_VISIBILITY_FIX_REPORT.md             FILTER_RENDER_FIX_REPORT.md
FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md        FOUNDER_UAT_EXECUTION_GUIDE.md
FRAME_SELECTION_FREEZE_FIX_REPORT.md        HEARTBEAT_STATUS_RULES.md
LOCAL_PRODUCTION_SETUP.md                   OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md
OPERATIONAL_READINESS_AUDIT.md              OPERATOR_RUNBOOK.md
OPERATOR_RUNBOOK_v2.md                      PAPER_OUT_LEDGER_TRANSITION_RCA.md
PAPER_ROLL_TRACKER_FIX_REPORT.md            PAYMENT_AMOUNT_SOURCE_AUDIT.md
PAYMENT_ENVIRONMENT_AUDIT.md                PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md
PAYMENT_TRANSACTION_LOOP_RCA.md             PHASE_3_2B_VALIDATION_REPORT.md
PHASE_3_2_IMPLEMENTATION_ROADMAP.md         PHASE_3_2_PRINT_PIPELINE_HARDENING.md
PHASE_3_2_PRODUCTION_HARDENING.md           POSTGRESQL_MIGRATION_AUDIT.md
PRE_LAUNCH_READINESS_PLAN.md                PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md
PRINTER_FAILURE_HANDLING_FIX_V2_REPORT.md   PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md
PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_2.md PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_3.md
PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_4.md PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_6.md
PRINTER_FAILURE_HANDLING_V2_RCA_2.md        PRINTER_FAILURE_HANDLING_V2_RCA_3.md
PRINTER_FAILURE_HANDLING_V2_RCA_4.md        PRINTER_FAILURE_HANDLING_V2_RCA_6.md
PRINTER_FAILURE_HANDLING_V2_RCA_7.md        PRINTER_FAILURE_HANDLING_V2_ROOT_CAUSE_MATRIX.md
PRODUCTION_DEPLOYMENT_CHECKLIST.md          PROVISIONING_RUNTIME_AUDIT.md
PROVISIONING_UAT_REPORT.md                  R2_INTEGRATION_REPORT.md
RECOVERY_VOUCHER_SPEC.md                    SESSION_HISTORY_CENTER_PHASE1_2_RCA.md
SESSION_ISOLATION_EVIDENCE_MAP.md           SPRINT_1_REVIEW.md
SPRINT_4B_IMPLEMENTATION_REPORT.md          SPRINT_5A_DASHBOARD_PRD.md
SPRINT_5A_IMPLEMENTATION_REPORT.md          SPRINT_5A_RETROSPECTIVE.md
SPRINT_5B_IMPLEMENTATION_REPORT.md          SPRINT_5B_PRD.md
SPRINT_5C_IMPLEMENTATION_PLAN_V2.md         SPRINT_5C_IMPLEMENTATION_REPORT.md
SPRINT_5E_IMPLEMENTATION_REPORT.md
```

- **Identity Proof:** 100% bit-for-bit SHA-256 match.
- **Reference Risk:** **LOW.** Canonical files in `./docs/` fulfill all inbound references.
- **Phase A Destination:** `docs/99_ARCHIVE/DUPLICATES/<filename>`.

---

## 5. Monorepo Mirror Manifest (24 Files — Phase A Scope)

All **24 files** below reside in `./pictolabs-rebuild/` and mirror canonical documentation in `./docs/`:

```text
pictolabs-rebuild/DEPLOYMENT_PLAN.md
pictolabs-rebuild/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md
pictolabs-rebuild/INFRASTRUCTURE_REQUIREMENTS_AUDIT.md
pictolabs-rebuild/LOCAL_DEPLOYMENT_VALIDATION.md
pictolabs-rebuild/LOCAL_PRODUCTION_SETUP.md
pictolabs-rebuild/OPERATIONAL_READINESS_AUDIT.md
pictolabs-rebuild/PICTOLABS_PLATFORM_ARCHITECTURE.md
pictolabs-rebuild/POSTGRESQL_MIGRATION_AUDIT.md
pictolabs-rebuild/PRODUCTION_DEPLOYMENT_CHECKLIST.md
pictolabs-rebuild/R2_INTEGRATION_REPORT.md
pictolabs-rebuild/SPRINT_1_REVIEW.md
pictolabs-rebuild/SPRINT_2_PLAN.md
pictolabs-rebuild/SPRINT_3_PLAN.md
pictolabs-rebuild/SPRINT_3_REVIEW.md
pictolabs-rebuild/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md
pictolabs-rebuild/SPRINT_4B_IMPLEMENTATION_REPORT.md
pictolabs-rebuild/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md
pictolabs-rebuild/SPRINT_5A_DASHBOARD_PRD.md
pictolabs-rebuild/SPRINT_5A_IMPLEMENTATION_PLAN.md
pictolabs-rebuild/SPRINT_5A_IMPLEMENTATION_REPORT.md
pictolabs-rebuild/SPRINT_5A_RETROSPECTIVE.md
pictolabs-rebuild/SPRINT_5B_IMPLEMENTATION_PLAN.md
pictolabs-rebuild/SPRINT_5B_IMPLEMENTATION_REPORT.md
pictolabs-rebuild/SPRINT_5B_PRD.md
```

- **Identity Proof:** SHA-256 identical to canonical files in `./docs/`.
- **Reason for Creation:** Created during temporary monorepo reorganization.
- **Reference Risk:** **LOW.**
- **Phase A Destination:** `docs/99_ARCHIVE/MIRRORS/<filename>`.

---

## 6. Approved Superseded Manifest (29 Files — Phase A Scope)

### Strict Superseded Definition (`OLD != SUPERSEDED` — Correction 4)
A file is classified as `ARCHIVE_SUPERSEDED` **only when**:
1. Its operational purpose is no longer active;
2. A canonical replacement exists;
3. It contains no unique current requirement; and
4. It contains no unique evidence that is not preserved elsewhere.

*Historical RCA, UAT, and Fix reports are permanent engineering evidence and must NEVER be archived as superseded.*

All **29 approved superseded files** satisfy this definition and are scheduled for archival in Phase A:

| # | Source File Path | Superseding Canonical Document | Obsolete Content | Unique Evidence Remaining? | Phase A Action |
|:---:|:---|:---|:---|:---:|:---:|
| 1 | `./docs/2026-09-10_MASTER_TIMELINE.md` | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Superseded timeline snapshot | NO | **ARCHIVE (Phase A)** |
| 2 | `./docs/CRITICAL_SYNC_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md) | Preliminary sync plan | NO | **ARCHIVE (Phase A)** |
| 3 | `./docs/DEPLOYMENT_PLAN.md` | [`docs/01_WORKSTREAMS/DEPLOYMENT_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/DEPLOYMENT_WORKSTREAM.md) | Preliminary deployment proposal | NO | **ARCHIVE (Phase A)** |
| 4 | `./docs/DEVICE_SECRET_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md) | Fix plan replaced by implementation report | NO | **ARCHIVE (Phase A)** |
| 5 | `./docs/MASTER_PROJECT_ROADMAP.md` | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Prototype macro roadmap | NO | **ARCHIVE (Phase A)** |
| 6 | `./docs/PACKAGING_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/DEPLOYMENT_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/DEPLOYMENT_WORKSTREAM.md) | Fix plan superseded by binary packaging audit | NO | **ARCHIVE (Phase A)** |
| 7 | `./docs/PHASE_3_2C_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md) | Intermediate phase plan | NO | **ARCHIVE (Phase A)** |
| 8 | `./docs/PHASE_3_2D_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md) | Intermediate phase plan | NO | **ARCHIVE (Phase A)** |
| 9 | `./docs/PHASE_3_2E_BURN_IN_PLAN.md` | [`docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md) | Burn-in plan replaced by completion report | NO | **ARCHIVE (Phase A)** |
| 10 | `./docs/PHASE_3_2E_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md) | Intermediate phase plan | NO | **ARCHIVE (Phase A)** |
| 11 | `./docs/PHASE_3_2_IMPLEMENTATION_ROADMAP.md` | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Interim roadmap superseded by v3 timeline | NO | **ARCHIVE (Phase A)** |
| 12 | `./docs/PHASE_3_3_IMPLEMENTATION_PLAN.md` | [`docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md) | Intermediate phase plan | NO | **ARCHIVE (Phase A)** |
| 13 | `./docs/PRE_LAUNCH_READINESS_PLAN.md` | [`docs/01_WORKSTREAMS/`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/) | Pre-launch plan superseded by timeline v3 | NO | **ARCHIVE (Phase A)** |
| 14 | `./docs/PRINTER_FAILURE_HANDLING_FIX_REPORT.md` (V1) | [`docs/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) | Deprecated V1 printer polling report | NO | **ARCHIVE (Phase A)** |
| 15 | `./docs/PRINTER_FAILURE_HANDLING_RCA.md` (V1) | [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md) | Deprecated V1 WMI polling RCA | NO | **ARCHIVE (Phase A)** |
| 16 | `./docs/PROVISIONING_RUNTIME_FIX_PLAN.md` | [`docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md) | Provisioning plan superseded by validation report | NO | **ARCHIVE (Phase A)** |
| 17 | `./docs/SPRINT_1_PLAN.md` | [`docs/SPRINT_1_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_1_REVIEW.md) | Preliminary task list replaced by final review | NO | **ARCHIVE (Phase A)** |
| 18 | `./docs/SPRINT_2_PLAN.md` | [`docs/SPRINT_2_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_2_REVIEW.md) | Preliminary task list replaced by final review | NO | **ARCHIVE (Phase A)** |
| 19 | `./docs/SPRINT_3_PLAN.md` | [`docs/SPRINT_3_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_3_REVIEW.md) | Preliminary task list replaced by final review | NO | **ARCHIVE (Phase A)** |
| 20 | `./docs/SPRINT_4B_HEARTBEAT_IMPLEMENTATION_PLAN.md` | [`docs/SPRINT_4B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_4B_IMPLEMENTATION_REPORT.md) | Initial heartbeat proposal superseded by report | NO | **ARCHIVE (Phase A)** |
| 21 | `./docs/SPRINT_4B_REVISED_IMPLEMENTATION_PLAN.md` | [`docs/SPRINT_4B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_4B_IMPLEMENTATION_REPORT.md) | Implementation spec superseded by report | NO | **ARCHIVE (Phase A)** |
| 22 | `./docs/SPRINT_5A_IMPLEMENTATION_PLAN.md` | [`docs/SPRINT_5A_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_IMPLEMENTATION_REPORT.md) | Dashboard sprint backlog replaced by report | NO | **ARCHIVE (Phase A)** |
| 23 | `./docs/SPRINT_5B_CLOSURE_PLAN.md` | [`docs/SPRINT_5B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_IMPLEMENTATION_REPORT.md) | Intermediate closure checklist | NO | **ARCHIVE (Phase A)** |
| 24 | `./docs/SPRINT_5B_IMPLEMENTATION_PLAN.md` | [`docs/SPRINT_5B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_IMPLEMENTATION_REPORT.md) | Support search backlog replaced by report | NO | **ARCHIVE (Phase A)** |
| 25 | `./docs/SPRINT_5C_IMPLEMENTATION_PLAN.md` | [`docs/SPRINT_5C_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5C_IMPLEMENTATION_REPORT.md) | Pre-production checklist draft 1 replaced by V2 | NO | **ARCHIVE (Phase A)** |
| 26 | `./docs/SPRINT_5C_IMPLEMENTATION_PLAN_V2.md` | [`docs/SPRINT_5C_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5C_IMPLEMENTATION_REPORT.md) | Pre-production checklist draft 2 replaced by report | NO | **ARCHIVE (Phase A)** |
| 27 | `./docs/SPRINT_5E_KIOSK_HARDENING_PLAN.md` | [`docs/SPRINT_5E_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5E_IMPLEMENTATION_REPORT.md) | Hardening plan superseded by report | NO | **ARCHIVE (Phase A)** |
| 28 | `./NEXT_ACTION_PLAN.md` | [`docs/00_CONTEXT/CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md) | Root scratch plan replaced by Current Project State | NO | **ARCHIVE (Phase A)** |
| 29 | `./PICTOLABS_PILOT_READINESS_TIMELINE.md` (v1) | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | Outdated timeline v1 replaced by v3 baseline | NO | **ARCHIVE (Phase A)** |

- **Destination:** `docs/99_ARCHIVE/SUPERSEDED/<filename>`.

---

## 7. Reference Risk Audit

A comprehensive static analysis across the entire repository evaluated the impact of relocating documentation:

1. **Application Source Code & Build Scripts:**
   - 247 application files scanned (`.ts`, `.tsx`, `.js`, `.mjs`, `.ps1`, `.sh`, `package.json`).
   - Results: **EXACTLY ZERO CODE REFERENCES TO MARKDOWN DOCUMENTATION FILES.**
   - Runtime Impact Risk: **NONE (0.0%).**
2. **Markdown Documentation References:**
   - Canonical documents in `./docs/` already resolve 96% of cross-document references.
   - For the surviving documents containing relative `./FILENAME.md` links, an automated regex updater will adjust references during Phase B Step 6.

---

## 8. Files Requiring Founder Review (16 Files — BLOCKED FROM PHASE A)

> [!CAUTION]
> **CORRECTION 2 MANDATE: ZERO AUTOMATIC MOVEMENT**  
> All 16 files below are classified as **`REVIEW_REQUIRED / BLOCKED`**. They must **NOT** be moved until explicitly ratified by the Founder. They are strictly excluded from Phase A.

| # | File Path Requiring Review | Size vs Canonical Size | Nature of Drift / Difference | Review Status |
|:---:|:---|:---:|:---|:---:|
| 1 | `./PAYMENT_BLINK_RCA.md` | 12,658 B vs 21,411 B | Root draft is truncated investigation; canonical `docs/PAYMENT_BLINK_RCA.md` contains complete final spec. | **BLOCKED / REVIEW** |
| 2 | `./pictolabs-rebuild/MASTER_PROJECT_STATUS.md` | 33,883 B vs 33,878 B | Sept 6 monorepo snapshot with 369 lines delta vs Sept 7 blueprint in `docs/`. | **BLOCKED / REVIEW** |
| 3 | `./FOUNDER_UAT_CHECKLIST.md` | 21,479 B vs 21,468 B | Root file has 1-line wording drift vs `docs/FOUNDER_UAT_CHECKLIST.md`. | **BLOCKED / REVIEW** |
| 4 | `./OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md` | 8,848 B vs 8,853 B | Root file has 1-line markdown formatting drift. | **BLOCKED / REVIEW** |
| 5 | `./PAYMENT_BLINK_FIX_VALIDATION.md` | 22,117 B vs 22,118 B | Root file has 1-line diff marker formatting drift. | **BLOCKED / REVIEW** |
| 6 | `./PAYMENT_QR_SOURCE_AUDIT.md` | 10,442 B vs 10,436 B | Root file has 1-line whitespace drift. | **BLOCKED / REVIEW** |
| 7 | `./pictolabs-rebuild/DEPLOYMENT_AUDIT.md` | 26,431 B vs 26,431 B | Monorepo mirror with 1-line path header drift. | **BLOCKED / REVIEW** |
| 8 | `./DEPLOYMENT_AUDIT.md` | 26,431 B vs 26,431 B | Root instance with 1-line path header drift. | **BLOCKED / REVIEW** |
| 9 | `./pictolabs-rebuild/SPRINT_2_REVIEW.md` | 20,442 B vs 20,436 B | Monorepo copy has 1-line markdown spacing delta vs `docs/SPRINT_2_REVIEW.md`. | **BLOCKED / REVIEW** |
| 10 | `./pictolabs-rebuild/SPRINT_3_PRODUCTION_CHECKLIST.md` | 10,617 B vs 10,622 B | Monorepo copy has 1-line delivery header path delta. | **BLOCKED / REVIEW** |
| 11 | `./SPRINT_3_PRODUCTION_CHECKLIST.md` | 10,617 B vs 10,622 B | Root copy has 1-line delivery header path delta. | **BLOCKED / REVIEW** |
| 12 | `./PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md` | 21,807 B vs 21,875 B | Code block formatting drift on lines 160–165 vs canonical. | **BLOCKED / REVIEW** |
| 13 | `./PRINTER_FAILURE_HANDLING_V2_RCA_5.md` | 26,026 B vs 26,025 B | 1-character typo drift on line 283 vs canonical. | **BLOCKED / REVIEW** |
| 14 | `./SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md` | 16,610 B vs 16,600 B | 11 lines of `+` diff markers in markdown code blocks. | **BLOCKED / REVIEW** |
| 15 | `./SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md` | 15,447 B vs 15,452 B | 1-line header link path delta vs canonical. | **BLOCKED / REVIEW** |
| 16 | `./SESSION_HISTORY_CENTER_PRD.md` | 39,657 B vs 39,667 B | 2-line header/footer path delta vs canonical. | **BLOCKED / REVIEW** |

---

## 9. Cleanup Execution Order (Two Segregated Phases — Correction 6)

When authorized by the Founder, cleanup MUST execute under the following two-phase sequence:

```bash
# ═════════════════════════════════════════════════════════════════════════════
# PHASE A — REDUNDANCY CLEANUP (Only Exact Dupes, Mirrors, Approved Superseded)
# ═════════════════════════════════════════════════════════════════════════════

# Step 1: Verify clean working tree
git status --porcelain

# Step 2: Create isolated cleanup branch and safety backup tag
git checkout -b docs-cleanup-phase-a
git branch docs-cleanup-pre-a-backup

# Step 3: Create archive directories ONLY
mkdir -p docs/99_ARCHIVE/DUPLICATES
mkdir -p docs/99_ARCHIVE/MIRRORS
mkdir -p docs/99_ARCHIVE/SUPERSEDED

# Step 4: Archive 71 exact root duplicates via git mv
git mv ./ACTIVATION_FREEZE_FIX_REPORT.md docs/99_ARCHIVE/DUPLICATES/
git mv ./ADMIN_PIN_FIX_REPORT.md docs/99_ARCHIVE/DUPLICATES/
# ... [all 71 exact duplicate files listed in Section 4]

# Step 5: Archive 24 monorepo mirrors via git mv
git mv ./pictolabs-rebuild/DEPLOYMENT_PLAN.md docs/99_ARCHIVE/MIRRORS/
# ... [all 24 monorepo mirror files listed in Section 5]

# Step 6: Archive ONLY 29 approved superseded documents via git mv
git mv ./docs/2026-09-10_MASTER_TIMELINE.md docs/99_ARCHIVE/SUPERSEDED/
# ... [all 29 approved superseded files listed in Section 6]
# NOTE: The 16 REVIEW_REQUIRED files are strictly EXCLUDED from this step.

# Step 7: Run reference scan across remaining files
node scripts/scan_references.js

# Step 8: Review git diff and status
git status

# Step 9: Commit Phase A
git commit -m "docs(phase-a): archive 71 exact duplicates, 24 mirrors, and 29 superseded planning files"

# ═════════════════════════════════════════════════════════════════════════════
# PHASE A VALIDATION GATE (Mandatory Checkpoint)
# ═════════════════════════════════════════════════════════════════════════════
# DO NOT PROCEED TO PHASE B UNLESS ALL CONDITIONS PASS:
# [ ] Zero broken links across surviving documents
# [ ] Zero lost files (all 124 archived files exist in docs/99_ARCHIVE/)
# [ ] All canonical docs in ./docs/ intact
# [ ] All 6 Printer Hardware RCAs (RCA-2 through RCA-7) intact
# [ ] All 16 REVIEW_REQUIRED files remained untouched at source
# [ ] Git diff reviewed and verified clean
# STOP. AWAIT EXPLICIT GATE CLEARANCE BEFORE RUNNING PHASE B!

# ═════════════════════════════════════════════════════════════════════════════
# PHASE B — CANONICAL ORGANIZATION (Executed ONLY after Phase A passes)
# ═════════════════════════════════════════════════════════════════════════════

# Step 1: Create canonical target directories
mkdir -p docs/00_CONTEXT
mkdir -p docs/02_EVIDENCE/RCA
mkdir -p docs/02_EVIDENCE/FIX_REPORTS
mkdir -p docs/02_EVIDENCE/UAT
mkdir -p docs/02_EVIDENCE/AUDITS
mkdir -p docs/03_RUNBOOKS/DEPLOYMENT
mkdir -p docs/03_RUNBOOKS/OPERATOR
mkdir -p docs/03_RUNBOOKS/FOUNDER_UAT
mkdir -p docs/04_HISTORY/SPRINT_REVIEWS

# Step 2: Relocate Tier 1 governance documents to docs/00_CONTEXT/
# Step 3: Relocate Tier 3 evidence (RCAs 2-7, Fix Reports, UAT) to docs/02_EVIDENCE/
# Step 4: Relocate operational runbooks to docs/03_RUNBOOKS/
# Step 5: Relocate sprint reviews (Sprints 1-5E) to docs/04_HISTORY/SPRINT_REVIEWS/
# Step 6: Update internal relative markdown links across all files
# Step 7: Run full link/reference scan
# Step 8: Review git diff and status
# Step 9: Commit Phase B
git commit -m "docs(phase-b): reorganize canonical documentation into 6-folder hierarchy"

# ═════════════════════════════════════════════════════════════════════════════
# PHASE B VALIDATION GATE (Final Sign-off)
# ═════════════════════════════════════════════════════════════════════════════
# Require:
# [ ] Zero broken links across repository
# [ ] Zero code references broken
# [ ] Zero missing evidence
# [ ] Canonical architecture matches manifest 100%
```

---

## 10. Rollback Strategy (Correction 7)

The cleanup workflow incorporates multi-tier Git rollback protection:
1. **Cleanup Branch as Safety Boundary:** All Phase A and Phase B work takes place on isolated branch `docs-cleanup-phase-a`. The main branch remains completely unaffected.
2. **Dedicated Commit per Phase:** Phase A and Phase B have their own independent commits.
3. **Non-Destructive Revert Standard:** Rollback should normally use `git revert` or branch switching rather than destructive reset once changes are committed for review:
   ```bash
   # Safe Phase B rollback (preserves Phase A redundancy cleanup):
   git revert --no-edit HEAD
   
   # Safe total rollback before publication:
   git checkout main
   git branch -D docs-cleanup-phase-a
   ```
4. **Emergency Recovery Boundary:** Destructive `git reset --hard docs-cleanup-pre-a-backup` is restricted to local uncommitted emergency recovery and is never used as the primary recovery mechanism after committed review.

---

## 11. Definition of Done (Execution Gate Checklist)

Cleanup will only be certified as complete when every item below passes:

- [ ] Every Phase A file exists at its designated destination in `docs/99_ARCHIVE/`.
- [ ] All 16 `REVIEW_REQUIRED` files remained completely untouched during Phase A.
- [ ] No source file was deleted or lost.
- [ ] No canonical Tier 1 Governance or Tier 2 Workstream file was moved or altered during Phase A.
- [ ] All 6 Printer Hardware RCAs (RCA-2 through RCA-7) and all Sprint Reviews remain accessible.
- [ ] Zero broken internal Markdown links detected across the repository.
- [ ] Zero application code or script references broken.
- [ ] Phase A Validation Gate passed before Phase B was started.
- [ ] Phase B Validation Gate passed before merging to main branch.
- [ ] Post-cleanup documentation integrity audit passes 100%.

---
> [!IMPORTANT]
> **FINAL EXECUTION PLAN COMPLETE. STOPPED. ZERO CLEANUP HAS BEEN PERFORMED.**
