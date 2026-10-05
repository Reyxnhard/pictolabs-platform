# ROOT CAUSE ANALYSIS: DEVICE VISIBILITY FAILURE IN DASHBOARD

**Document Reference**: `DEVICE_VISIBILITY_RCA.md`  
**Target Milestone**: Founder UAT Stabilization & Fleet Observability  
**Investigation Date**: 2026-09-22  
**Investigation Status**: COMPLETED (ZERO CODE MODIFICATIONS — AUDIT ONLY)  
**Severity**: **P0 BLOCKER** (Fleet Telemetry Rejection & Dashboard Invisibility)  

---

## Executive Summary

During Founder Acceptance Testing (UAT), the photobooth customer journey (Welcome $\rightarrow$ Product Selection $\rightarrow$ Frame Selection $\rightarrow$ Capture $\rightarrow$ Filter $\rightarrow$ Render 300 DPI $\rightarrow$ QR Download) passed all core software stages. However, **the activated kiosk failed to appear as an online, healthy device on the Admin Dashboard**, causing the hardware terminal to remain flagged as **`OFFLINE`**, which blocked physical printer flow validation.

A full runtime audit of the Electron Kiosk client, NestJS Cloud Backend (`https://api.pictolabs.id`), and React Admin Dashboard revealed the **definitive root cause**:

> **Root Cause**:  
> The Kiosk's HTTP Heartbeat transmitter (`SyncEngine.ts:1047`) transmits a payload containing `paperRemaining: number`. However, the Cloud Backend enforces a strict NestJS `ValidationPipe` with `{ whitelist: true, forbidNonWhitelisted: true }`, while `BoothHeartbeatDto` (`booth-heartbeat.dto.ts`) **omits `paperRemaining`**.  
> Every single periodic heartbeat sent by the kiosk is rejected with **`HTTP 400 Bad Request: "property paperRemaining should not exist"`**. As a result, `last_seen` in PostgreSQL is **never updated** after initial activation, causing the backend's dynamic status engine to permanently evaluate the booth as **`OFFLINE`** (`ageSeconds > 300s`). When the Admin Dashboard loads or filters by Online Booths, the kiosk is filtered out or displayed as dead/offline.

---

## 1. Expected Architecture Flow

```text
[Kiosk Client]                     [Cloud Backend]                     [Admin Dashboard]
      │                                   │                                    │
      │ 1. Activate via Token             │                                    │
      ├──────────────────────────────────►│                                    │
      │    POST /api/provisioning/activate│                                    │
      │                                   ├─ Upsert Device (status: ACTIVE)    │
      │◄──────────────────────────────────┤  Update Booth (last_seen: NOW)     │
      │    Returns deviceSecret           │                                    │
      │                                   │                                    │
      │ 2. Save Identity (DPAPI)          │                                    │
      │    Start Periodic Heartbeat (30s) │                                    │
      │                                   │                                    │
      │ 3. HTTP Heartbeat (Every 30s)     │                                    │
      ├──────────────────────────────────►│                                    │
      │    POST /api/booths/:sec/heartbeat│                                    │
      │                                   ├─ Update booth.last_seen = NOW      │
      │                                   ├─ Update device.last_seen_at = NOW  │
      │◄──────────────────────────────────┤  Compute effectiveStatus = ONLINE  │
      │    200 OK (ONLINE)                │                                    │
      │                                   │                                    │
      │                                   │ 4. WebSocket Broadcast             │
      │                                   ├───────────────────────────────────►│
      │                                   │    emit('booth_status_changed')    │
      │                                   │                                    │
      │                                   │ 5. Dashboard Polls Fleet           │
      │                                   │◄───────────────────────────────────┤
      │                                   │    GET /api/booths                 │
      │                                   ├───────────────────────────────────►│
      │                                   │    Returns: [                      │
      │                                   │      { id, name, status: 'ONLINE', │
      │                                   │        device: { status: 'ACTIVE'} }│
      │                                   │    ]                               │
      │                                   │                                    │
      │                                   │ 6. Dashboard Renders:              │
      │                                   │    - Online Booths KPI: 1          │
      │                                   │    - Status Badge: ONLINE (Green)  │
      │                                   │    - Host Runtime: PAIRED (Green)  │
```

---

## 2. Actual Runtime Flow & Defect Mechanism

```text
[Kiosk Client]                               [Cloud Backend]                     [Admin Dashboard]
      │                                             │                                    │
      │ 1. Activation Succeeded (00:45 UTC)         │                                    │
      ├────────────────────────────────────────────►│                                    │
      │    POST /api/provisioning/activate          │                                    │
      │◄────────────────────────────────────────────┤                                    │
      │    Token CONSUMED, deviceSecret issued      │                                    │
      │    booth.last_seen = 2026-09-22 00:45:15    │                                    │
      │                                             │                                    │
      │ 2. Kiosk Starts Heartbeat Loop (30s)        │                                    │
      │    Payload: { ..., paperRemaining: 700 }     │                                    │
      │                                             │                                    │
      │ 3. Periodic Heartbeat Transmitted           │                                    │
      ├────────────────────────────────────────────►│                                    │
      │    POST /api/booths/:sec/heartbeat          │                                    │
      │                                             ├─ NestJS ValidationPipe:            │
      │                                             │  forbidNonWhitelisted = true       │
      │                                             │  paperRemaining is NOT in DTO!     │
      │◄────────────────────────────────────────────┤                                    │
      │    HTTP 400 Bad Request                     │                                    │
      │    "property paperRemaining should not exist"│                                   │
      │                                             │                                    │
      │ 4. Consequence:                             │                                    │
      │    - booth.last_seen NEVER updated!         │                                    │
      │    - device.last_seen_at NEVER updated!     │                                    │
      │    - Elapsed time grows > 300s              │                                    │
      │    - Computed status = OFFLINE              │                                    │
      │                                             │                                    │
      │                                             │ 5. Dashboard Loads (01:30+ UTC)    │
      │                                             │◄───────────────────────────────────┤
      │                                             │    GET /api/booths                 │
      │                                             ├───────────────────────────────────►│
      │                                             │    status: 'OFFLINE'               │
      │                                             │    secondsSinceLastHeartbeat: 4830 │
      │                                             │                                    │
      │                                             │ 6. Dashboard State:                │
      │                                             │    - Overview: Online Booths = 0   │
      │                                             │    - Clicking "Online": 0 items    │
      │                                             │    - Screen says "No booths found" │
      │                                             │    - Hardware marked OFFLINE!      │
```

---

## 3. Database Tables Involved

| Table Name | Schema Mapping | Role in Fleet Visibility | Actual Runtime State |
| :--- | :--- | :--- | :--- |
| **`booths`** | `apps/backend/prisma/schema.prisma:51` | Master table for photobooths. Holds `last_seen`, `status`, and runtime hardware metadata. | `status` is `'NORMAL'`, but `last_seen` remained frozen at `2026-09-22T00:45:15.411Z` because all subsequent heartbeats failed HTTP validation. |
| **`devices`** | `apps/backend/prisma/schema.prisma:78` | Relational 1-to-1 table storing physical laptop bindings (`deviceSecret`, `macAddress`, `machineGuid`, `status: 'ACTIVE'`, `lastSeenAt`). | Record exists with `status: 'ACTIVE'`, `hostname: 'Blondd'`, but `lastSeenAt` is stale (`00:45:15Z`). |
| **`activation_tokens`** | `apps/backend/prisma/schema.prisma:99` | Ephemeral OTP tokens for laptop pairing. | Token `ACT-U6PR-8RD8` transitioned correctly to `CONSUMED` at `00:45:15Z`. |
| **`booth_configs`** | `apps/backend/prisma/schema.prisma:119` | Remote pricing, countdown, and hardware preferences. | Linked to booth `554147f9-c7f7-47fe-966d-fcbf3223fec4`. |
| **`kiosk_identity`** | Local SQLite (`kiosk.db`) | Local mirror of cloud credentials. | Accurately stores `booth_id`, `branch_id`, `api_base_url`. |

---

## 4. API Endpoints Involved

| Method & Path | Caller | Purpose | Status in Audit |
| :--- | :--- | :--- | :--- |
| `POST /api/provisioning/activate` | Kiosk (`IdentityService.ts`) | Consumes OTP token and binds physical device. | **200 OK** (Handshake succeeded, issued `sec_live_f325f5...`). |
| `POST /api/booths/:id/heartbeat` | Kiosk (`SyncEngine.ts:1030`) | Authoritative 30s liveness & telemetry update. | **400 Bad Request** (`paperRemaining should not exist`). |
| `GET /api/booths` | Dashboard (`boothsApi.ts:6`) | Fetches all booths with computed dynamic status. | **200 OK** (Returned 1 booth, but evaluated as `OFFLINE`). |
| `GET /api/provisioning/devices` | Dashboard (`provisioningApi.ts:67`)| Queries raw `Device` table list. | **200 OK** (Returns 1 device, `status: 'ACTIVE'`). |
| `WS /socket.io` | Kiosk & Dashboard | Real-time events (`CONFIG_UPDATE`, `booth_status_changed`). | **Connected**, but kiosk connection was duplicated and reset. |

---

## 5. Runtime Evidence

### Evidence A: Heartbeat Rejection HTTP 400 (Empirical Proof)

Executing a direct HTTP request using the exact payload sent by `SyncEngine.ts` against production `https://api.pictolabs.id/api/booths/:deviceSecret/heartbeat`:

```javascript
// Test Payload sent by Kiosk Electron Client:
const payload = {
  appVersion: '1.2.5',
  gitCommit: '1457ae6',
  machineName: 'Blondd',
  localIp: '172.16.0.2',
  osVersion: 'Windows_NT 10.0.26200',
  electronVersion: '28.2.0',
  releaseChannel: 'stable',
  paperRemaining: 700 // <--- Transmitted by SyncEngine.ts:1047
};
```

**Server Response**:
```json
HTTP/1.1 400 Bad Request
Content-Type: application/json; charset=utf-8

{
  "message": [
    "property paperRemaining should not exist"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

### Evidence B: Kiosk Client Runtime Log Output

Captured directly from running `Pictolabs Kiosk.exe` (`kiosk_runtime_log.txt:142-150`):
```text
[IdentityService] ✓ Loaded identity from C:\ProgramData\Pictolabs\identity.json: PICTOLABS-DEV-01 (554147f9-c7f7-47fe-966d-fcbf3223fec4)
[SyncEngine] 🔑 Sync credentials updated for booth 554147f9-c7f7-47fe-966d-fcbf3223fec4. Reconnecting gateway...
[SyncEngine] Initializing SQLite database at: C:\Users\ezarh\AppData\Roaming\@pictolabs\kiosk\pictolabs-data\kiosk.db
[STDERR] [SyncEngine] HTTP Heartbeat returned status 400
[STDERR] [SyncEngine] HTTP Heartbeat returned status 400
✓ [SyncEngine] Real-time WebSocket connected to cloud backend: https://api.pictolabs.id
✓ [SyncEngine] Real-time WebSocket connected to cloud backend: https://api.pictolabs.id
✗ [SyncEngine] WebSocket disconnected: io server disconnect
```

### Evidence C: Production Database Stale Timestamp & Computed Status

Queried from `https://api.pictolabs.id/api/booths` as authenticated Admin:
```json
{
  "id": "554147f9-c7f7-47fe-966d-fcbf3223fec4",
  "name": "PICTOLABS-DEV-01",
  "device": {
    "id": "b8876754-5034-401e-b772-960e8e0a6655",
    "boothId": "554147f9-c7f7-47fe-966d-fcbf3223fec4",
    "status": "ACTIVE",
    "hostname": "Blondd",
    "lastSeenAt": "2026-09-22T00:45:15.411Z"
  },
  "status": "OFFLINE",
  "isMaintenance": false,
  "lastSeen": "2026-09-22T00:45:15.411Z",
  "secondsSinceLastHeartbeat": 4830,
  "appVersion": "1.0.0",
  "machineName": "Blondd"
}
```
*Note*: `secondsSinceLastHeartbeat` reached 4830 seconds (> 80 minutes) because every 30-second heartbeat since 00:45 UTC was dropped with `HTTP 400`.

### Evidence D: Clean Heartbeat Test Without `paperRemaining`

When the heartbeat is sent with only the fields defined in `BoothHeartbeatDto`:
```json
HTTP/1.1 201 Created
{
  "success": true,
  "boothId": "554147f9-c7f7-47fe-966d-fcbf3223fec4",
  "status": "ONLINE",
  "isMaintenance": false,
  "lastSeen": "2026-09-22T02:06:20.085Z",
  "secondsSinceLastHeartbeat": 0,
  "appVersion": "1.0.0",
  "machineName": "Blondd",
  "localIp": "172.16.0.2",
  "acknowledged": true
}
```
*Proof*: Once the forbidden property is eliminated, the backend immediately responds with `201 Created`, updates `last_seen`, and flips the booth status to **`ONLINE`**.

---

## 6. Why Dashboard Does Not Show Device

The user reported: *"Device does not appear in Dashboard"*. The technical audit of `apps/dashboard` explains exactly why:

1. **Dashboard Filtering Behavior (`BoothsPage.tsx:49-56`)**:
   ```typescript
   const filteredByTab = booths.filter((b) => {
     if (statusParam === 'ALL') return true;
     if (statusParam === 'ONLINE') return b.status === 'ONLINE' && !b.isMaintenance;
     if (statusParam === 'OFFLINE') return b.status === 'OFFLINE' && !b.isMaintenance;
     return true;
   });
   ```
2. **Overview Page KPI Redirection (`OverviewPage.tsx:64-71`)**:
   - On the Overview page, `Online Booths` card displays `0`.
   - When the user clicks the "Online Booths" KPI card, the app navigates to `/booths?status=ONLINE`.
   - Because `PICTOLABS-DEV-01` is computed as `OFFLINE`, `filteredByTab` evaluates to `[]`.
   - The UI renders `BoothsTable.tsx:50-56`:
     > **"No booths found: No photobooths match the selected filters or search criteria."**
   - The user interprets this empty state as: *"The activated device never appeared in the dashboard."*

3. **No Dedicated "Devices" Navigation Item**:
   - `Sidebar.tsx` only offers links to `/` (Overview), `/booths`, `/sessions`, `/gallery`, `/support`.
   - The raw devices table is only visible inside `ProvisioningTestPage.tsx` (a development test page not in the main sidebar).
   - In `BoothsTable.tsx`, device status is represented as a sub-column badge: `PAIRED` / `UNPAIRED`. When the booth row itself is filtered out, the device is completely invisible.

---

## 7. Secondary Findings

### Finding 1: Duplicate WebSocket Connection on Startup
- In `apps/kiosk/electron/main.ts`:
  - Line 194: `loadIdentity()` calls `updateSyncCredentials()` $\rightarrow$ calls `setupSocketConnection()`.
  - Line 197: `registerSyncHandlers()` $\rightarrow$ ALSO calls `setupSocketConnection()`.
- Result: Two concurrent WebSocket connections open from the same client PID. The NestJS `KioskGateway` enforces a single-socket policy, terminating the first connection with `io server disconnect` (`kiosk_runtime_log.txt:149`).

### Finding 2: WebSocket Event Route Parameter Bug
- In `apps/backend/src/booths/booths.controller.ts:97`:
  ```typescript
  this.kioskGateway.server.to('dashboards').emit('booth_status_changed', {
    boothId: id, // <--- Route parameter! If kiosk calls /api/booths/:deviceSecret/heartbeat, 'id' is the 64-char deviceSecret, NOT the booth UUID!
    status: result.status,
    isMaintenance: result.isMaintenance,
    lastSeen: result.lastSeen,
  });
  ```
- Dashboard expects `boothId` to be the UUID to locate and update the booth in state. Emitting `id` instead of `result.boothId` causes real-time updates to fail to match.

---

## 8. Root Cause Summary

| Defect Layer | Location | Mechanism | Consequence |
| :--- | :--- | :--- | :--- |
| **Primary Root Cause** | `apps/kiosk/electron/services/SyncEngine.ts:1047` vs `apps/backend/src/booths/dto/booth-heartbeat.dto.ts` | Kiosk transmits `paperRemaining` in heartbeat payload; Backend has `forbidNonWhitelisted: true` and rejects with HTTP 400. | Heartbeats fail 100% of the time. `last_seen` remains stale. Device appears permanently `OFFLINE`. Dashboard filters it out. |
| **Secondary Defect** | `apps/kiosk/electron/main.ts:194-203` | `loadIdentity` and `registerSyncHandlers` both invoke socket setup. | Kiosk connects twice; first socket forcefully terminated by server single-socket policy. |
| **Tertiary Defect** | `apps/backend/src/booths/booths.controller.ts:97` | Emits route param `id` instead of `result.boothId`. | WebSocket update payload contains `deviceSecret` string instead of booth UUID. |

---

## 9. Proposed Fix Strategy (For Subsequent Implementation)

> [!IMPORTANT]
> Per user instruction: **NO CODE HAS BEEN MODIFIED. THIS SECTION REPRESENTS THE AUDITED FIX PLAN ONLY.**

### Fix Step 1: Whitelist `paperRemaining` in Backend DTO
In `apps/backend/src/booths/dto/booth-heartbeat.dto.ts`:
```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsNumber } from 'class-validator';

export class BoothHeartbeatDto {
  // ... existing fields ...

  @ApiPropertyOptional({
    example: 650,
    description: 'Remaining physical dye-sub paper prints in printer roll',
  })
  @IsOptional()
  @IsNumber()
  paperRemaining?: number;
}
```
*(And optionally, update `SyncEngine.ts` to omit `paperRemaining` if backend is unmigrated, ensuring mutual robustness).*

### Fix Step 2: Prevent Duplicate WebSocket Connection on Kiosk Boot
In `apps/kiosk/electron/main.ts`:
Decouple `updateSyncCredentials` during `loadIdentity` on boot so that `registerSyncHandlers` remains the single, authoritative initializer of the socket and timer loops.

### Fix Step 3: Fix Controller WebSocket Emit Identifier
In `apps/backend/src/booths/booths.controller.ts:97`:
Change `boothId: id` to `boothId: result.boothId` so the dashboard receives the canonical UUID.

---

## 10. Audit Conclusion

The device visibility failure is **not an architectural breakdown or network partition**. The activation handshake, identity encryption, and database relations function as designed. The entire failure is caused by a **DTO payload validation mismatch (`paperRemaining` rejected by NestJS ValidationPipe)**, which systematically dropped every heartbeat, froze `last_seen`, and forced the system to classify the device as `OFFLINE`.
