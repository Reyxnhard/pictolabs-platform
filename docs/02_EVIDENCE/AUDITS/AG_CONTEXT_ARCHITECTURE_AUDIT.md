# PICTOLABS — AG CONTEXT ARCHITECTURE & DOCUMENTATION GOVERNANCE AUDIT
## OPTIMAL AG CONTEXT INGESTION, AUTHORITY MODEL & COGNITIVE LOAD CONTROL

> **Document Type:** Context Architecture, Governance Model & Anti-Confusion Standard  
> **Target Scope:** Entire Pictolabs Platform Documentation Base (264 Markdown Files)  
> **Safety Rule:** AUDIT & ARCHITECTURE ONLY — Zero File Deletions, Zero Renames, Zero Moves, Zero Code Changes  
> **Date:** October 6, 2026  
> **Status:** OFFICIAL CONTEXT GOVERNANCE SPECIFICATION (Antigravity Core)  

---

## 1. Executive Summary

The initial documentation inventory identified 264 Markdown files in the repository. While these documents contain invaluable engineering forensics, empirical hardware traces, and deployment configurations, their sheer volume and overlapping placement create an acute risk of **Agent Context Overload, Hallucination, and Circular Conflict**.

An agent tasked with fixing a bug or implementing a feature should **NEVER** need to ingest 264 Markdown files. Doing so exhausts context window budgets, introduces contradictory historical claims, and slows down delivery.

This document establishes the **Antigravity (AG) Context Architecture**:
1. **A Strict 4-Tier Authority Model:** Eliminates competing "Single Sources of Truth" by defining unambiguous functional roles for Governance, Workstreams, Evidence, and Archives.
2. **Deterministic Context Entry Points:** Establishes a minimal 3-step reading sequence that provides complete operational situational awareness in under 12,000 tokens.
3. **Decoupled Status Vocabularies:** Strictly separates **Feature Implementation Status** (11 states) from **Document Lifecycle Status** (4 states).
4. **Corrected Subsystem Baselines:** Directly aligns Printer RCA-7 with historical Founder Physical UAT reality (`FOUNDER_UAT_PASS` / `RELEASE_CLOSURE_PENDING`).
5. **Durable Decision Log Strategy:** Establishes a scalable Architecture Decision Record (ADR) framework rather than treating an individual subsystem decision as the global project log.
6. **Documentation Loop Detection:** Identifies and resolves circular reference traps and competing authority claims.

---

## 2. Final Authority Model (The 4-Tier Governance Hierarchy)

To prevent multiple documents from claiming competing authority over the same technical facts, the repository documentation is organized into four strictly segregated tiers:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   TIER 1 — PROJECT GOVERNANCE                          │
│  • Master Timeline: Priorities, Release Gates, Global Sequence        │
│  • Current Project State: Source Code Audit, Real Runtime Status       │
│  • Product Scope: Macro System Blueprint & Domain Boundaries           │
│  • Decision Log: Durable Cross-Cutting Architectural Decisions         │
├────────────────────────────────────────────────────────────────────────┤
│                   TIER 2 — WORKSTREAM CONTEXT                          │
│  • 10 Domain Entry Points (Printer, Camera, Payment, R2, etc.)         │
│  • Active Functional Specifications & Operational Component Baselines │
├────────────────────────────────────────────────────────────────────────┤
│                   TIER 3 — TECHNICAL EVIDENCE                          │
│  • Forensic RCAs (Hardware Traces, Timing Graphs, Mutex Audits)        │
│  • Fix Reports (Unit/Integration Tests, Invariant Verifications)       │
│  • UAT Checklists, Runbooks, Git Commits & Automated Test Logs         │
├────────────────────────────────────────────────────────────────────────┤
│                   TIER 4 — HISTORICAL ARCHIVES                         │
│  • Superseded Sprint Plans, Early Architecture Drafts, Deprecated RCAs │
│  • Preserved permanently for forensic audit — Never active entry points│
└────────────────────────────────────────────────────────────────────────┘
```

### Role Definitions & Non-Competition Rules:
1. **Master Timeline (`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`):**  
   - **Authority:** Sole authority on *where the project is heading*, what tasks are blocking Booth #1 launch, and the execution sequence.
   - **Boundary:** Does not override source code audits regarding whether a line of code is actually committed.
2. **Current Project State (`CURRENT_PROJECT_STATE.md`):**  
   - **Authority:** Sole authority on *what actually exists in code today*. Derived from ground-truth source code inspection.
   - **Boundary:** Does not dictate future release gates or business priorities.
3. **Reconciliation Audits (`AG_TIMELINE_MAPPING_AUDIT.md`, `AG_DOCUMENTATION_INVENTORY.md`):**  
   - **Authority:** Audits are **reconciliation mechanisms**, NOT competing SSOTs. They serve as investigative bridges that reconcile differences between Tier 1 Governance and Tier 3 Evidence.
4. **Workstream Specifications (Tier 2):**  
   - **Authority:** Sole authority on *component implementation logic* within their respective domain.
   - **Boundary:** Subordinate to Tier 1 for cross-subsystem scheduling and release gates.
5. **Technical Evidence (Tier 3):**  
   - **Authority:** Unalterable proof of specific events, bug reproductions, and hardware behaviors.
   - **Boundary:** Does not establish forward policy.

---

## 3. Minimum AG Context

When an agent begins a new conversation or starts a technical task, it must ingest **ONLY the minimal viable governance context**. Ingesting beyond this boundary without explicit cause causes token exhaustion and cognitive degradation.

### The Standard Minimum Context Bundle (~10,500 Tokens):
1. **Governance Baseline (Tier 1):**
   - [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) (Sections 1–4: Current gate, blocker matrix, active workstream status).
   - [`CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md) (Executive Summary & Active Service inventory).
2. **Target Workstream Entry Point (Tier 2):**
   - Exactly **ONE** document corresponding to the user request's target subsystem (e.g., if working on printing, load only the Printer Workstream entry point).

### What AG Must NEVER Do:
- **NEVER** run recursive file reads across `docs/` at the start of a turn.
- **NEVER** load historical sprint plans (`SPRINT_1_PLAN.md` through `SPRINT_5B_PLAN.md`) when working on active features.
- **NEVER** ingest superseded V1 RCAs when an active V2 / RCA-7 specification exists.

---

## 4. Required Reading Order

AG must follow a deterministic, hierarchical reading sequence when ingesting context:

```text
                    ┌─────────────────────────┐
                    │          START          │
                    └────────────┬────────────┘
                                 │
                                 ▼
             ┌───────────────────────────────────────┐
             │         1. MASTER TIMELINE            │
             │ docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3 │
             │   (Check active gate & priorities)    │
             └───────────────────┬───────────────────┘
                                 │
                                 ▼
             ┌───────────────────────────────────────┐
             │      2. CURRENT PROJECT STATE         │
             │       CURRENT_PROJECT_STATE.md        │
             │  (Check actual implementation reality)│
             └───────────────────┬───────────────────┘
                                 │
                                 ▼
             ┌───────────────────────────────────────┐
             │       Is macro scope required?        │
             └───────┬───────────────────────┬───────┘
                     │ YES                   │ NO
                     ▼                       │
       ┌───────────────────────────┐         │
       │    3. PRODUCT SCOPE       │         │
       │ docs/PICTOLABS_MASTER_... │         │
       └─────────────┬─────────────┘         │
                     │                       │
                     └───────────┬───────────┘
                                 │
                                 ▼
             ┌───────────────────────────────────────┐
             │        4. TARGET WORKSTREAM           │
             │   (Select 1 of 10 Domain Specs)       │
             └───────────────────┬───────────────────┘
                                 │
                                 ▼
             ┌───────────────────────────────────────┐
             │  Is architectural decision involved?  │
             └───────┬───────────────────────┬───────┘
                     │ YES                   │ NO
                     ▼                       │
       ┌───────────────────────────┐         │
       │     5. DECISION LOG       │         │
       │  (Target ADR / Rationale) │         │
       └─────────────┬─────────────┘         │
                     │                       │
                     └───────────┬───────────┘
                                 │
                                 ▼
             ┌───────────────────────────────────────┐
             │   Is bug/hardware evidence needed?    │
             └───────┬───────────────────────┬───────┘
                     │ YES                   │ NO
                     ▼                       │
       ┌───────────────────────────┐         │
       │  6. EVIDENCE (Tier 3)     │         │
       │ (Target RCA / Fix Report) │         │
       └─────────────┬─────────────┘         │
                     │                       │
                     └───────────┬───────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   7. IMPLEMENTATION     │
                    └─────────────────────────┘
```

### Reading Order Matrix:
| Step | Document | Must Read? | Read When? | Authority Level | Can Be Skipped? | Inbound Pointers |
|:---:|:---|:---:|:---|:---:|:---:|:---|
| **1** | [`docs/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | **YES** | Every task start | Tier 1 | NO | Project Readme, Handoff |
| **2** | [`CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md) | **YES** | Every task start | Tier 1 | Only if purely procedural | Master Timeline |
| **3** | [`docs/PICTOLABS_MASTER_BLUEPRINT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_MASTER_BLUEPRINT.md) | NO | Designing new features or changing boundaries | Tier 1 | YES (Skip for bugfixes) | Current Project State |
| **4** | Target Workstream Entry Point (1 of 10) | **YES** | Interacting with specific subsystem | Tier 2 | NO | Master Timeline Section 3 |
| **5** | Decision Log / Specific ADR | NO | Changing protocols, schemas, or network flows | Tier 1/2 | YES (Skip if standard task)| Workstream Spec |
| **6** | Specific Tier 3 Evidence (RCA / UAT) | NO | Investigating hardware edge case or regression | Tier 3 | YES (Skip unless debugging) | Workstream Spec References |
| **7** | Source Code & Unit Test Specs | **YES** | Implementation & verification | Ground Truth | NO | Workstream Spec & Fix Report |

---

## 5. Workstream Entry Points (The 10 Operational Domains)

To work within any subsystem, AG needs exactly **ONE canonical entry point** for that domain:

| Workstream | Canonical Entry Point Path | Primary Technical Scope | Active Operational Status | Key Evidence Links (Escalate only if debugging) |
|:---|:---|:---|:---:|:---|
| **1. Printer** | [`docs/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) | Direct GDI `print.exe` dispatch, in-memory health gate, decoupled GIF encoding, spooler acceptance semantics. | **`FOUNDER_UAT_PASS` / `RELEASE_CLOSURE_PENDING`** | [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md), RCAs 2–6 |
| **2. Camera** | [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md) | Deterministic session teardown, buffer sanitization, crash recovery isolation. | **`AUTOMATED_VERIFIED` / `FOUNDER_UAT_PENDING`** | [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md), Commit `c2ec517` |
| **3. Payment** | [`docs/PAYMENT_ENVIRONMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_ENVIRONMENT_AUDIT.md) | Midtrans Core API, SHA-512 webhook, Sandbox simulation guard, real banking validation. | **`AUTOMATED_VERIFIED` (Sandbox) / `NOT_STARTED` (Production)** | [`docs/PAYMENT_BLINK_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_BLINK_RCA.md), [`docs/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md) |
| **4. Cloud Storage** | [`docs/SPRINT_3_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_3_REVIEW.md) | Cloudflare R2 presigned uploads, 7-day local retention, 30-day cloud lifecycle. | **`PRODUCTION_VERIFIED`** | [`docs/R2_INTEGRATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/R2_INTEGRATION_REPORT.md) |
| **5. Session History** | [`docs/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md) | Kiosk SQLite session archive, admin reprint modal (1x/2x), 4s debounce protection. | **`AUTOMATED_VERIFIED` (Local) / `PLANNED` (Remote)** | [`docs/SESSION_HISTORY_CENTER_PRD.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PRD.md), Phase 1-2 Fix Report |
| **6. Fleet / Heartbeat**| [`docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md) | Derived HTTP heartbeat availability status, 60s/300s age thresholds, DB immutable state. | **`AUTOMATED_VERIFIED`** | [`docs/HEARTBEAT_STATUS_RULES.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/HEARTBEAT_STATUS_RULES.md), [`docs/PROVISIONING_RUNTIME_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PROVISIONING_RUNTIME_AUDIT.md) |
| **7. Dashboard** | [`docs/SPRINT_5A_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5A_IMPLEMENTATION_REPORT.md) | React operator dashboard, booth detail drawer, session search, telemetry cards. | **`AUTOMATED_VERIFIED`** | [`docs/SPRINT_5B_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5B_IMPLEMENTATION_REPORT.md), `apps/dashboard/src` |
| **8. Security / Admin** | [`docs/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md) | Offline 6-digit bcrypt PIN validation, DPAPI device secret, emergency bypass mode. | **`AUTOMATED_VERIFIED`** | [`docs/ADMIN_PIN_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/ADMIN_PIN_RCA.md), [`docs/DEVICE_SECRET_RUNTIME_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/DEVICE_SECRET_RUNTIME_VALIDATION.md) |
| **9. Deployment** | [`docs/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/DEPLOYMENT/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md) | Single VPS deployment, Docker Compose orchestration, PostgreSQL WAL, Nginx SSL. | **`RELEASE_CLOSURE_PENDING`** | [`docs/DEPLOYMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/DEPLOYMENT_AUDIT.md), [`docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PRODUCTION_DEPLOYMENT_CHECKLIST.md) |
| **10. Kiosk Hardening** | [`docs/SPRINT_5E_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5E_IMPLEMENTATION_REPORT.md) | Windows 10/11 IoT lockdown, shell replacement, hotkey suppression, supervisor watchdog daemon. | **`AUTOMATED_VERIFIED`** | `pictolabs-rebuild/scripts/lockdown-kiosk.ps1`, `watchdog-kiosk.ps1` |

---

## 6. Evidence Escalation Rules

AG should treat Tier 3 Evidence (RCAs, raw traces, hardware debug logs) as **on-demand diagnostic tools**, not standard reading material.

### When to Escalate to Evidence:
1. **Physical Hardware Defect or Hang:**  
   - If printer behaves unexpectedly, escalate to [`docs/PRINTER_FAILURE_HANDLING_V2_RCA_7.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_7.md) (USB driver collisions) and [`PRINTER_FAILURE_HANDLING_V2_RCA_4.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_4.md) (reprint queue collisions).
2. **Session Fracture or Memory Leak:**  
   - If customer state is retained across sessions, escalate to [`docs/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md).
3. **Payment State Loop:**  
   - If QR screen blinks or loops transactions, escalate to [`docs/PAYMENT_BLINK_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_BLINK_RCA.md).

### When NOT to Escalate to Evidence:
- Normal feature implementation that follows an established pattern.
- Reviewing UI layouts, translations, or styles.
- Verifying deployment scripts or environment configurations.

---

## 7. Feature Status Vocabulary (11 States)

To eliminate misleading status estimates ("80% done", "almost ready"), all feature tracking must use exclusively these 11 states:

| Status | Mandatory Verification Criteria |
|:---|:---|
| **`NOT_STARTED`** | Requirement documented; zero lines of production code written. |
| **`PLANNED`** | Architectural PRD or sprint plan completed; scheduled for active sprint. |
| **`IMPLEMENTED`** | Code written, committed, and compiles cleanly with zero TypeScript errors. |
| **`AUTOMATED_VERIFIED`** | 100% of automated unit, integration, and regression test suites pass cleanly. |
| **`FOUNDER_UAT_PENDING`** | Automated test suites pass; awaiting physical hands-on verification by Founder on hardware. |
| **`FOUNDER_UAT_PASS`** | Founder personally tested and signed off physical hardware behavior on Booth #1. |
| **`FOUNDER_UAT_FAIL`** | Physical hardware test revealed a defect; requires formal RCA before retry. |
| **`RELEASE_CLOSURE_PENDING`**| Hardware UAT passed; awaiting final production installer build and VPS deploy. |
| **`PRODUCTION_VERIFIED`** | Deployed on live production VPS / hardware and verified under real operational load. |
| **`BLOCKED`** | Cannot proceed due to an explicit external blocker (e.g., waiting for merchant bank approval). |
| **`DEFERRED`** | Formally postponed by Founder decision to a post-pilot release milestone. |

---

## 8. Document Lifecycle Vocabulary (4 States)

Document lifecycle describes the **validity and freshness of a documentation artifact**, entirely decoupled from feature status:

| Document State | Operational Meaning | Treatment Rule |
|:---|:---|:---|
| **`CURRENT`** | Active, authoritative specification or runbook representing existing system reality. | Ingest during relevant workstream tasks. |
| **`SUPERSEDED`** | Early draft or outdated architecture explicitly replaced by a later document. | Never ingest for implementation. Mark for archival. |
| **`HISTORICAL`** | Irreplaceable milestone evidence (e.g., intermediate RCA, sprint review, audit trace). | Preserve permanently for forensic proof. Ingest only when debugging regressions. |
| **`ARCHIVED`** | Redundant exact duplicate or obsolete draft safely moved to `docs/archive/`. | Excluded from active workspace context. |

---

## 9. Decision Log Strategy (Durable Project Governance)

### Why `HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md` is NOT the Entire Decision Log:
Previously, `HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md` was incorrectly referenced as the global "Decision Log". In reality, it is a single **Architecture Decision Record (ADR-001)** resolving one specific problem: removing mutable WebSocket state from PostgreSQL.

### Proposed Canonical Decision Log Architecture:
- We propose a single consolidated registry: `docs/DECISION_LOG.md` *(PROPOSED ONLY — DO NOT CREATE UNTIL APPROVED)*.
- The Decision Log will index all durable cross-cutting decisions with direct links to their underlying ADRs:

| ADR ID | Decision Title | Date | Status | Authority / Decision Owner | Summary Rationale | Source Evidence Document |
|:---:|:---|:---:|:---:|:---:|:---|:---|
| **ADR-001** | Immutable HTTP Heartbeat Architecture | 2026-09-12 | **ACCEPTED** | Chief Architect | PostgreSQL `booths.status` derived from timestamp, not mutable WS. | [`docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md) |
| **ADR-002** | Decoupled Printer Execution & Direct GDI Dispatch | 2026-10-05 | **ACCEPTED** | Founder | Spooler acceptance semantics; GIF transcode moved to background. | [`docs/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md) |
| **ADR-003** | DPAPI Local Secret Storage for Kiosk Identity | 2026-09-13 | **ACCEPTED** | Security Lead | Hardware pairing secrets protected by Windows DPAPI in `%ProgramData%`. | [`docs/DEVICE_SECRET_FIX_PLAN.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/99_ARCHIVE/SUPERSEDED/DEVICE_SECRET_FIX_PLAN.md) |
| **ADR-004** | Offline Admin PIN Bcrypt Hashing | 2026-09-24 | **ACCEPTED** | Security Lead | Kiosk verifies 6-digit PIN locally via salted hash during internet outage. | [`docs/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md) |
| **ADR-005** | Cloudflare R2 Presigned Direct Uploads | 2026-09-08 | **ACCEPTED** | Infrastructure Lead| Kiosk uploads composite photos directly to R2; zero VPS proxy bottleneck. | [`docs/SPRINT_3_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_3_REVIEW.md) |

---

## 10. Documentation Loops & Conflicts Detected

Our forensic cross-reference uncovered 6 critical documentation loops and contradictions that must be governed:

1. **The Phantom SSOT Loop (`PROJECT_HANDOFF.md`):**
   - *Conflict:* Master Timeline v3 explicitly points to `PROJECT_HANDOFF.md` as the core handover authority.
   - *Reality:* No file named `PROJECT_HANDOFF.md` exists in the repository. Agents attempting to follow this reference enter an unresolved search loop.
   - *Resolution:* Replace this reference with [`CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md).
2. **Competing Global SSOT Claims:**
   - *Conflict:* `MASTER_PROJECT_STATUS.md` claims to be the *"Single Source of Truth"*, while `CURRENT_PROJECT_STATE.md` claims to be the *"Definitive Code Audit SSOT"*, and Timeline v3 claims to be the *"Pilot SSOT"*.
   - *Resolution:* Hierarchical separation — Timeline v3 governs priorities/gates; `CURRENT_PROJECT_STATE.md` governs codebase reality; `MASTER_PROJECT_STATUS.md` is archived as historical blueprint.
3. **Session History PRD vs Implementation Report Loop:**
   - *Conflict:* `SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md` points to `SESSION_HISTORY_CENTER_PRD.md` as Source of Truth, which points back to the Phase 1-2 Report for runtime status. Master Timeline v3 simultaneously claimed Phase 3 was "NOT STARTED" when web dashboard search was already implemented in `apps/dashboard`.
   - *Resolution:* Standardize on [`docs/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md) as Tier 2 entry point.
4. **Camera Bug Priority Contradiction:**
   - *Conflict:* Timeline v3 Section 16 designates the camera preview/capture mismatch as *"Non-blocking / Deferred"*, but Section 3 designates it as *"Active Reliability Requirement"*.
   - *Resolution:* Code inspection of `CaptureScreen.tsx` confirms customer poses for webcam while DSLR fires shutter. Formally designated as an **`ACTIVE_RELIABILITY_ISSUE`** requiring `CAMERA-01 RCA`.
5. **Midtrans Production Readiness Illusion:**
   - *Conflict:* Sprint 2 Review claimed Midtrans was *"100% complete, production ready"*, while `PAYMENT_ENVIRONMENT_AUDIT.md` proved the system runs on Sandbox credentials with real banking apps rejecting QRIS.
   - *Resolution:* Separate Sandbox implementation (`AUTOMATED_VERIFIED`) from Production verification (`NOT_STARTED`).
6. **Printer RCA-7 Status Lag:**
   - *Conflict:* `PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md` header states *"PENDING FOUNDER PHYSICAL UAT"*, but conversation history confirms Founder tested physical V7 hardware, verified zero duplicate prints, and approved simplification.
   - *Resolution:* Update status to **`FOUNDER_UAT_PASS` / `RELEASE_CLOSURE_PENDING`**.

---

## 11. Context Overload Risks

Loading uncurated documentation creates three acute failure modes for AI agents:
1. **Context Fragmentation (Token Exhaustion):** Ingesting 264 files consumes ~700,000 tokens, exceeding single-turn context limits and forcing lossy auto-compaction.
2. **Temporal Confusion (Zombie Bugs):** Historical RCAs (e.g., Printer RCA-2 or RCA-3) describe bugs that were solved weeks ago. An agent reading them out of sequence frequently attempts to "re-fix" problems that are already solved in code.
3. **Plan vs Reality Hallucination:** Preliminary sprint plans (`SPRINT_X_PLAN.md`) describe intended features that were subsequently altered or descoped during actual implementation. Agents relying on planning documents hallucinate features that do not exist.

---

## 12. Missing Context Entry Points

Our audit identified 3 missing entry point documents that should eventually be created:
1. **Consolidated Architecture Decision Log (ADR Index):** Currently ADRs are scattered across individual sprint reviews and standalone markdown files. Proposed: `docs/DECISION_LOG.md`.
2. **Unified Hardware Wiring & Peripheral Topology:** DNP printer, Canon DSLR, and bill validator wiring instructions are scattered across 4 different setup guides. A single 1-page hardware topology sheet is missing.
3. **Formal Handoff Summary:** Timeline v3 references a non-existent `PROJECT_HANDOFF.md`. A dedicated, clean 2-page operational handoff document is missing.

---

## 13. Recommended Final Documentation Structure

When the Founder authorizes repository cleanup, documentation will be organized into a clean 6-folder hierarchy:

```text
docs/
├── 01_master/              # TIER 1: Governance, Timeline v3, Codebase Audit, ADR Log
│   ├── PICTOLABS_PILOT_READINESS_TIMELINE_v3.md
│   ├── CURRENT_PROJECT_STATE.md
│   ├── PICTOLABS_MASTER_BLUEPRINT.md
│   └── DECISION_LOG.md (Proposed)
├── 02_hardware/            # TIER 2 & 3: Printer & Camera Workstreams, Active Specs & RCAs
│   ├── printer/
│   │   ├── PRINTER_EXECUTION_SIMPLIFICATION_FIX_REPORT.md (Entry Point)
│   │   ├── PRINTER_FAILURE_HANDLING_V2_RCA_7.md
│   │   └── rca_chain/ (RCAs 2 through 6)
│   └── camera/
│       ├── CAMERA_FAILURE_SESSION_CORRUPTION_FIX_REPORT.md (Entry Point)
│       └── CAMERA_FAILURE_SESSION_CORRUPTION_RCA.md
├── 03_cloud/               # TIER 2: Backend, Midtrans, Cloudflare R2
│   ├── PAYMENT_ENVIRONMENT_AUDIT.md (Entry Point)
│   ├── PAYMENT_BLINK_RCA.md
│   └── R2_INTEGRATION_REPORT.md
├── 04_kiosk/               # TIER 2: UI Screens, Session History, Security PIN
│   ├── SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md (Entry Point)
│   ├── OFFLINE_ADMIN_PANEL_ACCESS_FIX_REPORT.md
│   └── OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md
├── 05_sprints/             # TIER 2: Historical Sprint Reviews (Sprints 1 through 5E)
│   ├── SPRINT_1_REVIEW.md
│   ├── ...
│   └── SPRINT_5E_IMPLEMENTATION_REPORT.md
├── 06_runbooks/            # TIER 1/2: Operator Manuals, Lockdown Scripts, Deployment Guides
│   ├── FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md
│   ├── OPERATOR_RUNBOOK_v2.md
│   └── FOUNDER_UAT_CHECKLIST.md
└── archive/                # TIER 4: Redundant root duplicates, mirrors, superseded plans
    ├── root_duplicates/    # 71 exact root duplicate files
    ├── monorepo_mirrors/   # 24 monorepo mirror files
    └── superseded_plans/   # 18 early planning files
```

---

## 14. Cleanup Prerequisites

Before moving or archiving a single file, the following 4 prerequisites must be satisfied:
1. **Founder Approval of Authority Hierarchy:** Founder must formally ratify the 4-tier model and the 10 workstream entry points.
2. **Git Clean Check:** Ensure all active branches are merged or stashed; working directory must be clean.
3. **Internal Path Audit:** Confirm that no active build scripts or npm scripts reference hardcoded documentation paths in the root.
4. **Tool Verification:** Validate that moving files to `docs/archive/` preserves full Git history via `git mv`.

---

## 15. Founder Decisions Required

The following strategic decisions are submitted for Founder determination:

### Priority P0:
1. **Ratify Context Authority Model:** Confirm that Timeline v3 (Gates) + Current Project State (Code Reality) form the sole Tier 1 governance baseline.
2. **Ratify Printer RCA-7 Status:** Formally confirm that Printer RCA-7 is classified as **`FOUNDER_UAT_PASS` / `RELEASE_CLOSURE_PENDING`** based on V7 physical testing.
3. **Authorize `CAMERA-01 RCA`:** Authorize immediate investigation and surgical fix of the webcam preview vs DSLR capture synchronization issue in `CaptureScreen.tsx`.

### Priority P1:
4. **Approve Proposed Decision Log:** Authorize creating `docs/DECISION_LOG.md` as a single consolidated registry indexing all project ADRs.
5. **Authorize Phased Archive Execution:** Authorize executing the non-destructive relocation of 71 root duplicates, 24 monorepo mirrors, and 18 superseded plans into `docs/archive/`.

---
*Audit completed under AUDIT ONLY rules. Zero files modified, renamed, moved, or deleted.*  
*Certified by Antigravity Core Engineering.*
