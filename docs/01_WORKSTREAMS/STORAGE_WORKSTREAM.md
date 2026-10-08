# STORAGE & CLOUDFLARE R2 WORKSTREAM CONTEXT

## 1. Purpose
The Storage Workstream manages object storage for customer photostrip assets, animated GIFs, and raw photos. It integrates Cloudflare R2 via S3-compatible APIs, orchestrates direct presigned uploads from kiosks, generates public digital download QR links, and enforces local/cloud data retention lifecycles.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Cloudflare R2 Bucket & CORS Setup** | `PRODUCTION_VERIFIED` | Production bucket provisioned and validated. |
| **Backend Presigned Upload S3 Generator**| `PRODUCTION_VERIFIED` | Generates short-lived PUT URLs for kiosk direct upload. |
| **Kiosk Direct Upload Pipeline** | `PRODUCTION_VERIFIED` | Live physical Booth #1 verification: **PASS** (Scenarios S1-S6). |
| **Digital Delivery Softfile Landing Page**| `PRODUCTION_VERIFIED` | Customers scan QR code to download photos and GIF. |
| **7-Day Local Disk Retention Daemon** | `AUTOMATED_VERIFIED` | Retains local files for 7 days before pruning. |
| **30-Day Cloudflare R2 Auto-Lifecycle** | `PRODUCTION_VERIFIED` | Bucket lifecycle rule automatically deletes old assets. |
| **Upload Production Outage Gate** | `CLOSED` | Retail mall network loss and auto-recovery reliability gate: **Founder Physical UAT PASS (S1–S6)**. |

## 3. Completed / Verified
- **Implemented:** `storage.service.ts` in backend, `SyncEngine.ts` in kiosk (with two-tier store-and-forward and idempotent confirmation), and public web download landing page.
- **Automated Verified:** 100% PASS across 47 automated outage scenarios in `upload-outage-recovery.spec.ts`.
- **Founder Physical UAT:** **PASS.** Founder personally tested live retail internet outage and recovery (Scenarios S1 through S6) on Booth #1: offline queueing, automatic link resumption, zero duplicate photo records, and customer QR downloads.
- **Production Verified:** Cloudflare R2 bucket credentials, CORS policy, and backend S3 API verified with live assets. Standalone installer packaged (`Pictolabs Kiosk Setup 1.0.0.exe`).

## 4. Current Architecture
1. **Presigned Upload Flow:** Upon composite rendering, the kiosk requests presigned S3 URLs from backend `POST /api/storage/presigned-url`.
2. **Direct Edge Upload:** The kiosk streams the composite JPEG and animated GIF directly to Cloudflare R2 using standard HTTP PUT. The VPS never handles binary image data, preventing bandwidth bottlenecks.
3. **Public Landing Page:** A short alphanumeric code is generated and rendered as a QR code on [`QRScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/QRScreen.tsx) and printed on the photostrip border. Customers scan the QR to access the web download landing page.
4. **Lifecycle Management:** Local kiosk files are retained for 7 days in `%ProgramData%\Pictolabs\sessions` for offline reprint support, then purged by the retention daemon. Cloudflare R2 bucket rules expire files after 30 days.

## 5. Current Invariants
- **No VPS Proxying:** Media files must NEVER be uploaded through the VPS backend; uploads must always use direct presigned R2 URLs.
- **Pruning Protection:** Local assets must NOT be deleted by the retention daemon if `isUploaded === false` or file age is under 7 days.
- **Signed URL Expiry:** Presigned upload URLs must enforce a maximum 15-minute validity window.

## 6. Known Open Issues
- **Blockers:** None. Subsystem logic is closed and verified.
- **Closed Pilot Reliability Gate:** The full retail mall failure scenario (Internet OFF during capture $\rightarrow$ held safely in SQLite pending queue $\rightarrow$ Internet returns $\rightarrow$ auto retry $\rightarrow$ R2 upload $\rightarrow$ completed) has been verified and marked **CLOSED** via Founder Physical UAT (S1–S6 100% PASS).
- **Release Closure:** Final release pre-commit synchronization and VPS deployment.

## 7. Next Task
Execute the retail internet outage and reconnection recovery test scenario on Booth #1 following camera reliability hardening.

## 8. Evidence
1. [`docs/SPRINT_3_REVIEW.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/04_HISTORY/SPRINT_REVIEWS/SPRINT_3_REVIEW.md) — Comprehensive Sprint 3 review and architecture proof.
2. [`docs/R2_INTEGRATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/R2_INTEGRATION_REPORT.md) — S3 compatibility and presigned URL benchmarks.
3. [`docs/SPRINT_3_PRODUCTION_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_3_PRODUCTION_CHECKLIST.md) — Production sign-off checklist.
4. Source file: [`apps/backend/src/storage/storage.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts).

## 9. Related Workstreams
- **Session History:** Session records reference R2 asset URLs.
- **Printer:** Composite JPEG generation feeds both print dispatcher and storage uploader.

## 10. Status Confidence
**HIGH.** Storage pipeline is in production-verified status with zero known bugs or regressions.
