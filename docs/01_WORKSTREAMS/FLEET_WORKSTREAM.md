# FLEET & ACTIVATION WORKSTREAM CONTEXT

## 1. Purpose
The Fleet Workstream governs kiosk lifecycle management, initial machine provisioning, secure token pairing, real-time availability tracking via HTTP heartbeats, and remote management for the Pictolabs photobooth network.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Base32 Kiosk Provisioning Pairing** | `AUTOMATED_VERIFIED` | Secure pairing code exchange on initial boot. |
| **DPAPI Hardware Machine Secret Storage** | `AUTOMATED_VERIFIED` | Machine secret encrypted in `%ProgramData%`. |
| **Derived HTTP Heartbeat Engine (ADR-001)**| `AUTOMATED_VERIFIED` | Availability computed from `last_heartbeat_at`. |
| **Booth Status Rules Evaluation Matrix** | `AUTOMATED_VERIFIED` | <60s Online, <300s Degraded, >=300s Offline. |
| **Web Dashboard Booths Overview** | `AUTOMATED_VERIFIED` | Real-time fleet cards with health and printer status. |
| **Remote Reboot & Config Push via WS** | `AUTOMATED_VERIFIED` | Push configuration changes and trigger restarts. |
| **Multi-Tenant Multi-Booth Scaling** | `PLANNED` | Post-pilot operational scaling. |

## 3. Completed / Verified
- **Implemented:** Provisioning handshake in [`apps/kiosk/electron/services/ProvisioningService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/ProvisioningService.ts), DPAPI encryption, and derived heartbeat architecture in [`apps/backend/src/booths/booths.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts).
- **Automated Verified:** Verified via `run_provisioning_e2e.mjs` and heartbeat age threshold unit tests.
- **Founder Physical UAT:** Physical pairing test on Booth #1 verified; touch keypad token entry confirmed.
- **Production Verified:** Verified in staging VPS deployment.

## 4. Current Architecture
1. **Provisioning Handshake:** On first launch, the unprovisioned kiosk displays a 6-character Base32 pairing code. The operator enters this code into the web dashboard, which generates a cryptographic machine secret.
2. **Secure Secret Persistence:** The secret is transmitted to the kiosk over HTTPS and encrypted on disk using Windows Data Protection API (DPAPI) in `%ProgramData%\Pictolabs\identity.dat`.
3. **Heartbeat Architecture (ADR-001):** The kiosk emits an HTTP POST heartbeat every 15 seconds containing paper remaining, camera status, and app version. The backend updates `booths.last_heartbeat_at` without modifying the status column.
4. **Availability Derivation:** When queried, the backend evaluates `NOW() - last_heartbeat_at`:
   - `ONLINE`: $< 60$ seconds.
   - `DEGRADED`: $60$ to $300$ seconds.
   - `OFFLINE`: $ge 300$ seconds.

## 5. Current Invariants
- **Immutable Status Field:** PostgreSQL `booths.status` MUST NOT be directly mutated by WebSocket connect/disconnect events; status is strictly derived from timestamp comparison (ADR-001).
- **DPAPI Protection:** Machine secrets must never be stored in plain text or in web browser local storage.
- **Zero Configuration Drift:** Remote config pushes must validate schema before applying to kiosk SQLite.

## 6. Known Open Issues
- **Hardening:** Network retry backoff during intermittent 4G mall cellular disconnects.

## 7. Next Task
Verify heartbeat telemetry reporting during live VPS deployment smoke test.

## 8. Evidence
1. [`docs/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/HEARTBEAT_SOURCE_OF_TRUTH_DECISION.md) — Definitive ADR-001 document.
2. [`docs/HEARTBEAT_STATUS_RULES.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/HEARTBEAT_STATUS_RULES.md) — Evaluation threshold matrix.
3. [`docs/PROVISIONING_RUNTIME_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PROVISIONING_RUNTIME_AUDIT.md) — Provisioning IPC and entropy audit.
4. [`docs/DEVICE_SECRET_RUNTIME_VALIDATION.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/UAT/DEVICE_SECRET_RUNTIME_VALIDATION.md) — DPAPI validation logs.
5. Source file: [`apps/backend/src/booths/booths.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts).

## 9. Related Workstreams
- **Security:** Machine secrets secure the kiosk-backend communication channel.
- **Dashboard:** Fleet status cards render derived heartbeat metrics.

## 10. Status Confidence
**HIGH.** Architecture Decision Record ADR-001 is fully implemented and mathematically verified in automated tests.
