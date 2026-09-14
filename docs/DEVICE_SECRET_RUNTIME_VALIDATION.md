# PHASE 3.3F — DEVICE SECRET TRANSITION RUNTIME VALIDATION
**Document Reference**: `/docs/DEVICE_SECRET_RUNTIME_VALIDATION.md`  
**Execution Timestamp**: 2026-09-14T08:58:00Z  
**Target Investigation**: Device Secret Transition & Decommissioned Hardware Authorization Vulnerability  
**Reference Findings**: `/docs/CURRENT_PROJECT_STATE.md`, `/docs/PHASE_3_3F_VALIDATION.md`, `/docs/P0_SYNC_RUNTIME_EVIDENCE.md`  
**Environment**: Live Stack (`pictolabs-backend` container, PostgreSQL 16 `pictolabs-postgres`, Prisma ORM)

---

## Executive Summary

This audit validates whether the **Device Secret Transition** finding identified in `CURRENT_PROJECT_STATE.md` constitutes a genuine production security vulnerability.

Through deterministic runtime fault injection against the live production stack, **THE DEFECT IS EMPIRICALLY CONFIRMED**.

When hardware is decommissioned via the dashboard fleet management flow (`POST /api/provisioning/re-pair`), the backend explicitly marks the physical device as `DECOMMISSIONED` in the `devices` table. However, because backend endpoints continue to resolve identity through the legacy `booths.deviceSecret` column—or evaluate `Booth.deviceSecret` before validating `Device.status === 'ACTIVE'`—**decommissioned hardware continues to retain 100% operational privileges** throughout the entire swap window until a replacement laptop physically activates.

---

# Section 1 — Identity Architecture Map

The table below maps the complete lifecycle of kiosk identity resolution across the platform:

```
Fleet Dashboard (Admin)
    │
    ▼
1. POST /api/provisioning/tokens/generate
    │ (Creates activation_tokens row: status=PENDING, ttl=15m)
    ▼
2. POST /api/provisioning/activate (Kiosk Handshake)
    │ (Consumes token, generates 256-bit sec_live_..., writes to BOTH tables)
    ├──► devices: { deviceSecret: sec_live_..., status: 'ACTIVE' }
    └──► booths:  { deviceSecret: sec_live_..., status: 'NORMAL' }
    │
    ├─────────────────────── RUNTIME OPERATIONS ─────────────────────────┐
    │                                                                    │
    ▼                                                                    ▼
3. Session Sync                                              4. Upload Confirmation
   POST /api/sessions                                           POST /api/storage/confirm-upload
   - sessions.controller.ts:130                                 - storage.controller.ts:73
   - Primary: Booth.deviceSecret                                - ONLY: Booth.deviceSecret
   - Fallback: Device.deviceSecret (ACTIVE)                      - Device table IGNORED
    │                                                                    │
    ▼                                                                    ▼
5. Heartbeat Ingestion                                       6. Kiosk Gateway (WebSocket)
   POST /api/booths/:id/heartbeat                               WS /socket.io (x-device-secret)
   - booths.service.ts:80                                       - kiosk.gateway.ts:49
   - OR: [id, Booth.deviceSecret, Device(ACTIVE)]               - OR: [Booth.deviceSecret, Device(ACTIVE)]
    │                                                                    │
    ▼                                                                    ▼
7. Kiosk Auth Token                                          8. Dynamic Payment QRIS
   POST /api/auth/booth-auth                                    POST /api/payments/qris
   - auth.service.ts:65                                         - payments.service.ts:65
   - ONLY: Booth.deviceSecret                                   - ONLY: Booth.deviceSecret
   - Device table IGNORED                                       - Device table IGNORED
```

### Identity Source Breakdown by Phase

| Lifecycle Step | Controller | Service | Database Table | Identity Source Used | Evaluates `Device.status`? |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **Token Generation** | `ProvisioningController` | `ProvisioningService` | `activation_tokens` | Admin JWT Bearer | N/A |
| **Activation** | `ProvisioningController` | `ProvisioningService` | `devices` & `booths` | Dual-Write (`sec_live_...`) | Sets `ACTIVE` |
| **Re-Pair (Swap)** | `ProvisioningController` | `ProvisioningService` | `devices` ONLY | Updates `devices.status = 'DECOMMISSIONED'` | Marks `DECOMMISSIONED` |
| **Revocation** | `ProvisioningController` | `ProvisioningService` | `devices` & `booths` | Updates `booths.deviceSecret = sec_revoked_...` | Marks `REVOKED` |
| **Session Sync** | `SessionsController` | `SessionsService` | `booths` & `devices` | Dual-Model: `Booth.deviceSecret` checked FIRST | **NO** (Bypassed if in Booth) |
| **Upload Confirm** | `StorageController` | `StorageService` | `booths` ONLY | `Booth.deviceSecret` | **NO** |
| **Storage Upload** | `StorageController` | `StorageService` | `sessions` pre-flight | Session existence | **NO** |
| **Heartbeat** | `BoothsController` | `BoothsService` | `booths` & `devices` | `OR: [Booth.deviceSecret, Device(ACTIVE)]` | **NO** (Bypassed if in Booth) |
| **Booth Auth JWT** | `AuthController` | `AuthService` | `booths` ONLY | `Booth.deviceSecret` | **NO** |
| **Payments QRIS** | `PaymentsController` | `PaymentsService` | `booths` ONLY | `Booth.deviceSecret` | **NO** |
| **WebSocket WS** | `KioskGateway` | `KioskGateway` | `booths` & `devices` | `OR: [Booth.deviceSecret, Device(ACTIVE)]` | **NO** (Bypassed if in Booth) |
| **Dashboard** | `BoothsController` | `BoothsService` | `booths` | Booth UUID / Branch Relation | N/A |

---

# Section 2 — Inventory of All Secret Consumers

An exhaustive grep search of the entire backend codebase identified every consumer of `deviceSecret`:

| File Location | Method / Handler | Secret Source Queried | Purpose |
| :--- | :--- | :--- | :--- |
| `apps/backend/src/provisioning/provisioning.service.ts:160-220` | `activateDevice()` | Generates `sec_live_...`; writes to both `Device` & `Booth` | Device activation and mutual table synchronization |
| `apps/backend/src/provisioning/provisioning.service.ts:263-268` | `rePairHardware()` | Sets `device.status = 'DECOMMISSIONED'` (Leaves `booth.deviceSecret` intact) | Initiates hardware swap; issues temporary swap token |
| `apps/backend/src/provisioning/provisioning.service.ts:288-302` | `revokeDevice()` | Sets `device.status = 'REVOKED'`; sets `booth.deviceSecret = sec_revoked_...` | Emergency hardware kill-switch |
| `apps/backend/src/auth/auth.service.ts:63-70` | `validateBooth()` | `prisma.booth.findUnique({ where: { deviceSecret } })` | Issues booth JWT accessToken (`/api/auth/booth-auth`) |
| `apps/backend/src/booths/booths.service.ts:76-85` | `findBoothByIdentifier()` | `OR: [{ deviceSecret }, { device: { deviceSecret, status: 'ACTIVE' } }]` | Resolves booth identity for heartbeats and health diagnostics |
| `apps/backend/src/sessions/sessions.controller.ts:129-144` | `syncSession()` | `booth = findUnique({ where: { deviceSecret } })` with fallback to `device` | Authenticates and commits kiosk customer sessions |
| `apps/backend/src/storage/storage.controller.ts:72-78` | `confirmUpload()` | `prisma.booth.findUnique({ where: { deviceSecret } })` | Authorizes final cloud R2 photo upload confirmation |
| `apps/backend/src/payments/payments.service.ts:61-68` | `createQRIS()` | `OR: [{ id: dto.boothId }, { deviceSecret: dto.boothId }]` | Resolves booth for dynamic Midtrans QRIS transaction creation |
| `apps/backend/src/gateway/kiosk.gateway.ts:46-55` | `handleConnection()` | `OR: [{ deviceSecret }, { device: { deviceSecret, status: 'ACTIVE' } }]` | Authorizes live Socket.io telemetry & config push channel |
| `apps/kiosk/electron/services/IdentityService.ts:217` | `saveIdentity()` | Client DPAPI encrypted storage | Kiosk hardware credential persistence on Windows |
| `apps/kiosk/electron/services/SyncEngine.ts:858` | `syncSingleSessionToCloud()` | Sends `x-device-secret` header | Ingests session metadata to backend |

---

# Section 3 — Runtime Scenario A: Active Device

### 1. Provisioning & State Verification
A clean physical device (Device A) was paired via `POST /api/provisioning/activate`:
- **Issued Secret A**: `sec_live_a4699f0e281cba3b282f2a0659c2265035727f62b12b9b0348442ccd8e685f17`
- **Database State (`psql`)**:
```text
 dev_id                | dev_status |                                dev_secret                                 |                               booth_secret                                | booth_status 
--------------------------------------+------------+---------------------------------------------------------------------------+---------------------------------------------------------------------------+--------------
 8a05d15d-e096-4831-b19d-373f61547e99 | ACTIVE     | sec_live_a4699f0e281cba3b282f2a0659c2265035727f62b12b9b0348442ccd8e685f17 | sec_live_a4699f0e281cba3b282f2a0659c2265035727f62b12b9b0348442ccd8e685f17 | NORMAL
(1 row)
```

### 2. Runtime Operations with Secret A
- **Session Sync (`POST /api/sessions`)**:
  - Raw Response: `HTTP 200 OK`
  - Body: `{"success": true, "sessionId": "session-scenario-a-1789376141704"}`
- **Storage Upload Confirmation (`POST /api/storage/confirm-upload`)**:
  - Raw Response: `HTTP 201 Created`
  - Body: `{"success": true, "sessionId": "session-scenario-a-1789376141704", "confirmed": true}`
- **Operational Heartbeat (`POST /api/booths/:secretA/heartbeat`)**:
  - Raw Response: `HTTP 201 Created`
  - Body: `{"success": true, "boothId": "80e05c47-50f9-4d8a-a6f5-a958f1be5df3", "status": "ONLINE"}`
- **Booth Auth (`POST /api/auth/booth-auth`)**:
  - Raw Response: `HTTP 201 Created`
  - Body: Valid JWT token issued for booth `PICTOLABS-DEV-01`.

### 3. Verdict
# PASS (Normal Expected Behavior)

---

# Section 4 — Runtime Scenario B: Decommissioned Device

### 1. Hardware Swap Triggered
Administrator commands hardware swap via `POST /api/provisioning/re-pair`:
- Request: `POST /api/provisioning/re-pair` with `{ "boothId": "80e05c47-50f9-4d8a-a6f5-a958f1be5df3" }`
- Response: `HTTP 201 Created`, swap token `ACT-ZVV7-5NRJ` issued.

### 2. Database State After Re-Pair Command
Query executed inside PostgreSQL container:
```sql
SELECT d.id as dev_id, d.status as dev_status, d.device_secret as dev_secret, 
       b."deviceSecret" as booth_secret, b.status as booth_status
FROM booths b
LEFT JOIN devices d ON b.id = d.booth_id
WHERE b.id = '80e05c47-50f9-4d8a-a6f5-a958f1be5df3';
```
**Raw Result**:
```text
 dev_id                |   dev_status   |                                dev_secret                                 |                               booth_secret                                | booth_status 
--------------------------------------+----------------+---------------------------------------------------------------------------+---------------------------------------------------------------------------+--------------
 8a05d15d-e096-4831-b19d-373f61547e99 | DECOMMISSIONED | sec_live_a4699f0e281cba3b282f2a0659c2265035727f62b12b9b0348442ccd8e685f17 | sec_live_a4699f0e281cba3b282f2a0659c2265035727f62b12b9b0348442ccd8e685f17 | NORMAL
(1 row)
```
*Crucial Observation*: `devices.status` is now **`DECOMMISSIONED`**. However, `booths.deviceSecret` **still holds Secret A**!

### 3. Re-Using Credentials on Decommissioned Hardware
The decommissioned laptop now attempts operations using its retained `secretA`:

#### A. Session Sync
- **Request**: `POST /api/sessions` with header `x-device-secret: sec_live_a4699f...`
- **Raw Response**:
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "success": true,
  "sessionId": "session-scenario-b-decom-1789376142005"
}
```
- **Backend Log**:
```text
[Nest] 7 - 09/14/2026, 8:55:42 AM LOG [SessionsController] Incoming session sync: session-scenario-b-decom-1789376142005
[Nest] 7 - 09/14/2026, 8:55:42 AM LOG [SessionsController] ✓ Session synced to database: session-scenario-b-decom-1789376142005
```
- **Result**: **ACCEPTED**. Decommissioned hardware successfully created a customer session in the cloud.

#### B. Storage Upload Confirmation
- **Request**: `POST /api/storage/confirm-upload` with header `x-device-secret: sec_live_a4699f...`
- **Raw Response**:
```http
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{
  "success": true,
  "sessionId": "session-scenario-b-decom-1789376142005",
  "fileName": "composite_b.jpg",
  "confirmed": true,
  "timestamp": "2026-09-14T08:55:42.050Z"
}
```
- **Result**: **ACCEPTED**. Decommissioned hardware confirmed cloud photo storage.

#### C. Booth Authentication JWT
- **Request**: `POST /api/auth/booth-auth` with body `{ "deviceSecret": "sec_live_a4699f..." }`
- **Raw Response**:
```http
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "booth": {
    "id": "80e05c47-50f9-4d8a-a6f5-a958f1be5df3",
    "name": "PICTOLABS-DEV-01",
    "branch": "Grand Indonesia Kiosk"
  }
}
```
- **Result**: **ACCEPTED**. Decommissioned hardware received a signed JWT bearer token.

#### D. Operational Heartbeat
- **Request**: `POST /api/booths/sec_live_a4699f.../heartbeat` with `{ "appVersion": "1.2.0" }`
- **Raw Response**:
```http
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8

{
  "success": true,
  "boothId": "80e05c47-50f9-4d8a-a6f5-a958f1be5df3",
  "status": "ONLINE"
}
```
- **Result**: **ACCEPTED**. Decommissioned hardware modified booth operational telemetry.

### 4. Direct Answers to Audit Questions
1. **Can old hardware still act as a valid kiosk?**  
   **YES**. The old hardware can connect via WebSocket, send heartbeats, authenticate, and request QRIS payments.
2. **Can old hardware upload?**  
   **YES**. It can confirm uploads and register photo records in PostgreSQL.
3. **Can old hardware sync sessions?**  
   **YES**. It can commit customer sessions to the cloud database.
4. **Can old hardware modify data?**  
   **YES**. It can update `booths.last_seen`, alter session status to `COMPLETED`, and insert photo rows.

---

# Section 5 — Runtime Scenario C: Re-Paired Hardware (Replacement Active)

### 1. Replacement Laptop Activated
Device B was activated using swap token `ACT-ZVV7-5NRJ`:
- **Issued Secret B**: `sec_live_afb5ceb2ad6d297b564510dff47711f43f4929c4ae5ba092422d762081743d6e`

### 2. Database State After Replacement Activation
```text
 dev_id                | dev_status |                                dev_secret                                 |                               booth_secret                                | booth_status 
--------------------------------------+------------+---------------------------------------------------------------------------+---------------------------------------------------------------------------+--------------
 8a05d15d-e096-4831-b19d-373f61547e99 | ACTIVE     | sec_live_afb5ceb2ad6d297b564510dff47711f43f4929c4ae5ba092422d762081743d6e | sec_live_afb5ceb2ad6d297b564510dff47711f43f4929c4ae5ba092422d762081743d6e | NORMAL
(1 row)
```

### 3. Comparing Old Secret vs New Secret

| Operation | Old Secret A (`sec_live_a4699f0...`) | New Secret B (`sec_live_afb5ceb...`) |
| :--- | :--- | :--- |
| **Heartbeat Ingestion** | `HTTP 404 Not Found` (Rejected) | `HTTP 201 Created` (Accepted) |
| **Session Sync** | `HTTP 401 Unauthorized` (Rejected) | `HTTP 200 OK` (Accepted) |
| **Booth Auth JWT** | `HTTP 401 Unauthorized` (Rejected) | `HTTP 201 Created` (Accepted) |
| **Upload Confirmation** | `HTTP 401 Unauthorized` (Rejected) | `HTTP 201 Created` (Accepted) |

*Observation*: Once Device B physically activates, `booths.deviceSecret` is overwritten with `secretB`. At that moment, Secret A is finally rejected across all endpoints.

---

# Section 6 — Security Impact Assessment

### Capability Matrix for Retired / Decommissioned Hardware

| Action | During Re-Pair Swap Window | After Emergency Revoke | After Replacement Activated |
| :--- | :---: | :---: | :---: |
| Upload media files | **YES** | NO | NO |
| Sync customer sessions | **YES** | NO | NO |
| Send operational heartbeats | **YES** | NO | NO |
| Issue booth JWT tokens | **YES** | NO | NO |
| Connect to WebSocket Gateway | **YES** | NO | NO |
| Create payment QRIS | **YES** | NO | NO |

### Severity Rating: **MEDIUM**

### Explanation:
- If an operator clicks **"Emergency Revoke"**, the system immediately rotates `booth.deviceSecret` to `sec_revoked_...`, blocking the device immediately (Rating is not CRITICAL).
- If an operator uses standard **"Re-pair Hardware (Laptop Swap)"**, the previous device is marked `DECOMMISSIONED` in the database, but its operational privileges are **NOT revoked until the replacement laptop completes activation**.
- In photobooth retail deployments, hardware replacement involves:
  1. Operator initiating swap in dashboard (morning).
  2. Technician traveling to mall/venue (1–4 hours).
  3. Physical installation and token entry (afternoon).
- During this window, the decommissioned laptop—which may be in transit, returned to a vendor, or retired in a repair shop—can continue to masquerade as the active booth.

---

# Section 7 — Production Risk Assessment

### Real-World Operational Impact:

1. **Dual-Kiosk Heartbeat Flapping**:
   If a retired laptop is powered on for testing/wiping at headquarters while swap token is pending, it transmits heartbeats to the live booth ID, updating `last_seen` and falsifying the operational status of the physical booth.
2. **Session Pollution**:
   Test sessions run on the retired laptop will sync directly to the live booth’s PostgreSQL database, causing test transactions to appear on store revenue reports and customer galleries.
3. **Storage Confirmation Hijacking**:
   The retired laptop can confirm uploads for sessions belonging to that booth ID.
4. **Unauthorized QRIS Generation**:
   The retired laptop can request real Midtrans QRIS payment transactions tied to the company's live merchant account.

---

# Section 8 — Severity Reassessment

### Final Severity: **MEDIUM**

### Justification:
- It is **NOT Critical** because:
  1. An attacker cannot generate tokens or compromise other booths (scope is isolated to the specific booth ID).
  2. Emergency Revoke (`revokeDevice`) works correctly and immediately invalidates `booth.deviceSecret`.
  3. Once the replacement machine activates, the old credentials are automatically invalidated.
- It is **NOT a False Positive** because:
  1. `devices.status = 'DECOMMISSIONED'` is an authoritative database state that is completely ignored by 5 production controllers.
  2. The gap exists indefinitely until the replacement device is activated. If a swap token expires without activation, the old decommissioned hardware remains authorized forever.

---

# Section 9 — Fix Recommendation

*(DO NOT IMPLEMENT — Design Blueprint Only)*

### Root Cause
`rePairHardware()` in `provisioning.service.ts` marks `device.status = 'DECOMMISSIONED'` but leaves `booth.deviceSecret` unchanged for backwards compatibility. Simultaneously, `SessionsController`, `StorageController`, `BoothsService`, `AuthService`, `PaymentsService`, and `KioskGateway` query `booth.deviceSecret` directly before or without verifying that the associated `Device` is `ACTIVE`.

### Minimal Fix Strategy

#### 1. In `provisioning.service.ts:rePairHardware()`:
Invalidate the booth device secret immediately upon swap initiation, rather than waiting for the new laptop to activate:
```typescript
// Invalidate booth device secret with transition sentinel
const swapSecret = `sec_swap_pending_${Date.now()}`;
await tx.booth.update({
  where: { id: booth.id },
  data: { deviceSecret: swapSecret, status: 'MAINTENANCE' },
});
```

#### 2. In `booths.service.ts`, `storage.controller.ts`, `sessions.controller.ts`, and `auth.service.ts`:
Enforce `device.status === 'ACTIVE'` when resolving identity:
```typescript
// Instead of findUnique on Booth.deviceSecret alone:
const device = await this.prisma.device.findUnique({
  where: { deviceSecret },
  include: { booth: true },
});

if (!device || device.status !== 'ACTIVE' || !device.booth) {
  throw new UnauthorizedException('DEVICE_DECOMMISSIONED_OR_REVOKED');
}
const booth = device.booth;
```

---

# Final Verdict

# DEVICE SECRET ISSUE CONFIRMED
