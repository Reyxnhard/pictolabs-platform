# DEPLOYMENT WORKSTREAM CONTEXT

## 1. Purpose
The Deployment Workstream coordinates release management, cloud infrastructure provisioning, Docker container orchestration, and physical kiosk installation. It maintains production runbooks, environment variable manifests, and pre-launch deployment sign-off checklists.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Local Monorepo Dev Environment** | `PRODUCTION_VERIFIED` | Turbo monorepo runs via `pnpm dev`. |
| **Backend & PostgreSQL Docker Compose** | `AUTOMATED_VERIFIED` | Containerized multi-service deployment spec. |
| **Nginx Reverse Proxy & Let's Encrypt SSL**| `AUTOMATED_VERIFIED` | SSL termination and proxy configuration verified. |
| **Kiosk Standalone Windows Installer** | `AUTOMATED_VERIFIED` | `electron-builder` builds `Pictolabs Kiosk Setup 1.0.0.exe`. |
| **Manual Server Deployment (`deploy.sh`)** | `IMPLEMENTED` | Manual SSH script execution for VPS orchestration. |
| **Automated GitHub Actions CI/CD** | `PLANNED` | Automated push-to-deploy pipeline (not yet implemented). |
| **Production VPS Provisioning** | `RELEASE_CLOSURE_PENDING` | Awaiting live server deployment execution. |
| **Booth #1 Physical Machine Setup** | `RELEASE_CLOSURE_PENDING` | Awaiting physical on-site installation in mall. |
| **Deployment Runbooks & Checklists** | `CURRENT` | Authoritative runbooks ready for execution. |

## 3. Completed / Verified
- **Implemented:** Docker Compose configuration, `deploy.sh` deployment script, Nginx configuration, and electron-builder build pipeline.
- **Automated Verified:** Container healthchecks, database migrations, and clean build tests (`npm run build` across all apps).
- **Founder Physical UAT:** Local kiosk setup executable tested on development hardware.
- **Production Verified:** Staging container stack verified on cloud VPS.

## 4. Current Architecture
1. **Cloud Architecture (Single VPS):**
   - **Host:** Ubuntu 22.04 LTS / 24.04 LTS VPS (2 vCPU, 4GB RAM minimum).
   - **Container Orchestration:** Docker Compose running NestJS backend, PostgreSQL 16, and Redis cache.
   - **Edge Proxy:** Nginx host reverse proxy handling SSL certificates via Certbot, routing `api.pictolabs.id` to backend and `app.pictolabs.id` to built React dashboard static files.
2. **Kiosk Host Architecture:**
   - **OS:** Windows 10/11 IoT Enterprise.
   - **Application Package:** Single executable installer (`Pictolabs Kiosk Setup 1.0.0.exe`) deploying to `%LocalAppData%\Programs\pictolabs-kiosk` with persistent data in `%ProgramData%\Pictolabs`.

## 5. Current Invariants
- **Database Persistence:** Production PostgreSQL MUST use an external named Docker volume; data must never be stored inside transient container layers.
- **Environment Separation:** Production VPS must never use development default secret keys or sandbox Midtrans credentials in live operation.
- **Installer Self-Sufficiency:** The kiosk installer must bundle all necessary native binaries (`print.exe`, `PhotolabDNP.exe`, Canon EDSDK DLLs) with zero external manual prerequisite downloads.

## 6. Known Open Issues
- **Execution Gate:** Live execution of cloud VPS setup according to [`docs/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/DEPLOYMENT/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md).

## 7. Next Task
Execute production VPS provisioning and Docker Compose deployment on the target host.

## 8. Evidence
1. [`docs/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/DEPLOYMENT/FINAL_PRODUCTION_DEPLOYMENT_GUIDE.md) — Authoritative step-by-step VPS runbook.
2. [`docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PRODUCTION_DEPLOYMENT_CHECKLIST.md) — Pre-launch verification checklist.
3. [`docs/DEPLOYMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/DEPLOYMENT_AUDIT.md) — VPS port and architecture audit.
4. [`docs/OPERATOR_RUNBOOK_v2.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/OPERATOR/OPERATOR_RUNBOOK_v2.md) — Daily store technician operational guide.
5. Source file: [`docker-compose.yml`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/docker-compose.yml).

## 9. Related Workstreams
- **Kiosk Hardening:** Deploys lockdown and watchdog scripts to host machine.
- **Dashboard:** Deploys static React bundle to production web server.
- **Fleet:** Configures initial database records for Booth #1.

## 10. Status Confidence
**HIGH.** Scripts and deployment configuration files are tested and reproducible; execution pending cloud server access.
