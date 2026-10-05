# PICTOLABS — DOCUMENTATION CLEANUP & GOVERNANCE PLAN
## PROPOSAL ONLY — NO FILES TO BE MOVED, RENAMED, OR DELETED YET

> **Document Type:** Future Documentation Cleanup Proposal & Repository Hygiene Plan  
> **Target Scope:** Entire Pictolabs Workspace (264 Markdown Files)  
> **Rule:** PROPOSAL ONLY. Zero destructive actions permitted during this audit.  
> **Date:** October 6, 2026  
> **Status:** PROPOSED PLAN AWAITING FOUNDER / CTO APPROVAL  

---

## 1. Executive Summary & Cleanup Objectives

The documentation audit revealed that while Pictolabs possesses deep, high-quality technical records (exhaustive RCAs, mathematical latency models, deterministically verified fix reports), the documentation base suffers from severe structural sprawl:
- **86 Markdown files** reside in the repository root (`.`), cluttering top-level navigation.
- **29 Markdown files** are duplicated inside `pictolabs-rebuild/`.
- **77 exact duplicate sets (174 files)** waste repository storage and confuse developers switching chats.
- **16 drifted files** exhibit differing file sizes and content across locations.
- **Multiple intermediate RCAs** (e.g. Printer RCA-2 through RCA-5) exist alongside the final simplified architecture (RCA-7).

### The Objective of this Plan:
To define a clean, phased, non-destructive migration roadmap that will consolidate all project knowledge into a structured, single-source-of-truth hierarchy under `./docs/`, while safely archiving historical artifacts without deleting any technical evidence.

---

## 2. Classification of All Relevant Documents

Every document in the repository has been evaluated and assigned one of six standardized future treatment actions:

| Action Label | File Count | Target Definition |
|:---|:---:|:---|
| **`KEEP`** | 48 | Authoritative, active documents required for day-to-day operations, ongoing development, and master continuity. |
| **`KEEP AS EVIDENCE`** | 94 | Historical RCAs, completed fix reports, and sprint reviews retained permanently for auditability. |
| **`ARCHIVE`** | 95 | Exact duplicate copies in the root (`.`) or `pictolabs-rebuild/` that should be safely archived once verified against `./docs/`. |
| **`MERGE LATER`** | 12 | Intermediate fix reports or duplicate topic guides that should be consolidated into unified master specifications. |
| **`REPLACE LATER`** | 6 | Outdated timelines or status documents that will be formally superseded once the new Master Timeline is established. |
| **`REVIEW`** | 9 | Drifted documents requiring explicit Founder/architect comparison before determining canonical versions. |
| **TOTAL** | **264** | |

---

## 3. Action Plan for Root Directory Sprawl (86 Files in `.`)

Currently, 86 `.md` files clutter the workspace root. Of these:
- **83 files** are copies of documents that already exist in `./docs/`.
- **3 files** exist exclusively in root:
  1. `CURRENT_PROJECT_STATUS.md` (Historical snapshot)
  2. `NEXT_ACTION_PLAN.md` (Historical action plan)
  3. `PICTOLABS_PILOT_READINESS_TIMELINE.md` (v1/v2 baseline)

### Proposed Root Cleanup Procedure (Future Execution):
1. **Move Unique Root Files to `./docs/`:**
   - Move `CURRENT_PROJECT_STATUS.md` $\rightarrow$ `docs/archive/historical_status/`
   - Move `NEXT_ACTION_PLAN.md` $\rightarrow$ `docs/archive/historical_plans/`
   - Move `PICTOLABS_PILOT_READINESS_TIMELINE.md` $\rightarrow$ `docs/archive/historical_timelines/`
2. **Leave Only Essential Root Files:**
   - Retain only `README.md` (standard repository overview) and `AG_TIMELINE_MAPPING_AUDIT.md` (during active review) in the workspace root.
3. **Archive Duplicate Root Files:**
   - The remaining 83 duplicate root `.md` files should be removed from root once canonical versions in `./docs/` are verified.

---

## 4. Action Plan for Monorepo Copies (29 Files in `pictolabs-rebuild/`)

Currently, 29 Markdown files exist in `pictolabs-rebuild/`:
- All 29 files (except `pictolabs-rebuild/README.md`) are exact duplicates of files in `./docs/` (e.g. `SPRINT_1_REVIEW.md`, `SPRINT_2_PLAN.md`, `DEPLOYMENT_AUDIT.md`, `MASTER_PROJECT_STATUS.md`).

### Proposed Monorepo Cleanup Procedure:
1. Retain only `pictolabs-rebuild/README.md` and `apps/dashboard/README.md`.
2. Remove all duplicated root-level `.md` files from `pictolabs-rebuild/` to prevent developer confusion during workspace builds. All documentation should live strictly under `./docs/`.

---

## 5. Action Plan for Intermediate RCAs & Fix Reports

The repository contains extensive forensic records for multi-step investigations:

### 5.1 Printer Workstream Consolidation:
- **Intermediate Files:**
  - `PRINTER_FAILURE_HANDLING_RCA.md` (V1)
  - `PRINTER_FAILURE_HANDLING_FIX_REPORT.md` (V1)
  - `PRINTER_FAILURE_HANDLING_PRN04_PRN05_RCA.md` (V2)
  - `PRINTER_FAILURE_HANDLING_FIX_V2_REPORT.md` (V2)
  - `PRINTER_FAILURE_HANDLING_V2_RCA_2.md` & `_FIX_REPORT.md`
  - `PRINTER_FAILURE_HANDLING_V2_RCA_3.md` & `_FIX_REPORT_3.md`
  - `PRINTER_FAILURE_HANDLING_V2_RCA_4.md` & `_FIX_REPORT_4.md`
  - `PRINTER_FAILURE_HANDLING_V2_RCA_5.md` & `_FIX_REPORT_5.md`
  - `PRINTER_FAILURE_HANDLING_V2_RCA_6.md` & `_RCA_6_FIX_REPORT.md`
- **Active Authoritative Files:**
  - `PRINTER_FAILURE_HANDLING_V2_RCA_7.md`
  - `PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`
- **Action:**
  - Move intermediate V1 through V6 reports to `docs/archive/printer_investigations/`.
  - Maintain RCA-7 and Simplification Fix Report in `docs/04_rca_reports/` as active engineering evidence.
  - **Do NOT delete any intermediate report.** They provide legal and architectural proof of why earlier approaches failed.

---

## 6. Action Plan for Sprint Plans vs. Sprint Reviews

For Sprints 1, 2, 3, 4B, 5A, 5B, 5C, and 5E:
- Initial sprint plans (`SPRINT_X_PLAN.md`) describe aspirational scopes.
- Sprint reviews (`SPRINT_X_REVIEW.md` or `SPRINT_X_IMPLEMENTATION_REPORT.md`) document the actual implemented reality and acceptance test verification.
- **Action:**
  - **`KEEP AS EVIDENCE`:** All Sprint Reviews and Implementation Reports $\rightarrow$ place in `docs/05_sprint_archives/`.
  - **`ARCHIVE`:** Initial plans $\rightarrow$ place in `docs/archive/sprint_plans/`.

---

## 7. Action Plan for the 16 Drifted Documents

For the 16 files identified with content drift between root and `./docs/`:

1. **`PAYMENT_BLINK_RCA.md`:**
   - Root version is 12.6 KB (draft); `./docs/` version is 21.4 KB (complete).
   - **Action:** Designate `./docs/PAYMENT_BLINK_RCA.md` as canonical. Archive the root draft.
2. **`PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md`:**
   - `./docs/` version (21,875 bytes) includes updated QRScreen timeout notes.
   - **Action:** Designate `./docs/` version as canonical.
3. **`FOUNDER_UAT_CHECKLIST.md`:**
   - Formatting and line-ending drift.
   - **Action:** Standardize on `./docs/FOUNDER_UAT_CHECKLIST.md`.
4. **`SESSION_HISTORY_CENTER_PRD.md`, `_REPORT.md`, `_FIX_REPORT.md`:**
   - Minor header/spacing drift (5–10 bytes).
   - **Action:** Standardize on `./docs/` versions.
5. **`MASTER_PROJECT_STATUS.md` & `SPRINT_2_REVIEW.md`:**
   - Minor path formatting drift in `pictolabs-rebuild/`.
   - **Action:** Standardize on `./docs/` versions.

---

## 8. Proposed Phased Migration Strategy

When the Founder authorizes repository cleanup, it should be executed in three safe, auditable phases:

### Phase 1: Structure Creation & Non-Destructive Ingestion
1. Create new structured directories under `docs/`:
   ```text
   docs/01_master/
   docs/02_prd/
   docs/03_architecture/
   docs/04_rca_reports/
   docs/05_sprint_archives/
   docs/06_runbooks/
   docs/archive/
   ```
2. Move unique documents into their target category folders.
3. Validate that no links are broken.

### Phase 2: Duplicate Ingestion to Archive
1. Verify SHA-256 hashes of all duplicate files in root and `pictolabs-rebuild/` against `./docs/`.
2. Move exact duplicates into `docs/archive/duplicates/` or remove redundant copies.
3. Resolve the 16 drifted files by adopting the verified canonical `./docs/` versions.

### Phase 3: Master Timeline & Documentation Lock
1. Establish the reconciled `MASTER_TIMELINE.md` in `docs/01_master/`.
2. Update all internal document cross-references.
3. Enforce the Documentation Governance Protocol.

---

## 9. Permanent Rules to Prevent Future Documentation Sprawl

To ensure this sprawling state never recurs when transitioning between AI agents or chat sessions:

1. **Strict Canonical Path:**
   All new technical documentation, PRDs, RCAs, and Fix Reports **must be created directly in `docs/<category>/`**. Never create new markdown files in the workspace root or `pictolabs-rebuild/`.
2. **Mandatory Frontmatter Metadata:**
   Every new document must include standard YAML frontmatter:
   ```yaml
   ---
   document_id: PRN-RCA-08
   title: Printer Hardware Telemetry Fix
   category: RCA
   workstream: Printer
   status: ACTIVE # ACTIVE | SUPERSEDED | ARCHIVED
   superseded_by: null
   created_date: 2026-10-06
   author: Antigravity Core
   ---
   ```
3. **Deprecation Notice Standard:**
   When a document is superseded by a newer architecture (e.g. RCA-6 superseded by RCA-7), an explicit warning banner must be prepended:
   ```markdown
   > [!WARNING]
   > **SUPERSEDED DOCUMENT:** This document is retained for historical auditability only.
   > The active authoritative specification is [NEW_SPEC.md](file:///docs/...).
   ```
4. **Zero Shadow Copies:**
   Never copy `.md` files into monorepo application folders (`apps/kiosk`, `apps/backend`, `pictolabs-rebuild`). Refer directly to `../../docs/...`.

---
*Plan compiled and certified by Antigravity Core Engineering.*  
*Zero destructive actions performed. Full repository structure preserved for review.*
