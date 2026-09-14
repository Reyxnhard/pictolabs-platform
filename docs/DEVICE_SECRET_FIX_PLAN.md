# PHASE 3.3F — DEVICE SECRET FIX DESIGN
**Document Reference**: `/docs/DEVICE_SECRET_FIX_PLAN.md`  
**Execution Timestamp**: 2026-09-14T16:00:00Z  
**Target Vulnerability**: Decommissioned Hardware Authorization Gap during Re-Pair Transition Window  
**Reference Documents**: `/docs/DEVICE_SECRET_RUNTIME_VALIDATION.md`, `/docs/PHASE_3_3F_VALIDATION.md`, `/docs/CURRENT_PROJECT_STATE.md`  
**Status**: ARCHITECTURAL DESIGN — DO NOT IMPLEMENT WITHOUT APPROVAL

---

## Executive Summary

Runtime validation in `/docs/DEVICE_SECRET_RUNTIME_VALIDATION.md` confirmed that when a booth undergoes hardware replacement via `POST /api/provisioning/re-pair`, the physical device is marked `DECOMMISSIONED` in the `devices` table, but the legacy `booths.deviceSecret` column is **never rotated or invalidated**.

Because 6 backend services resolve booth identity primarily through `Booth.deviceSecret` without verifying `Device.status === 'ACTIVE'`, **decommissioned hardware retains full operational capabilities** (session sync, cloud upload confirmation, heartbeat updates, QRIS generation, and JWT issuance) until a replacement laptop physically completes activation.

This design document outlines the safest, lowest-risk, and most resilient strategy to eliminate this window while preserving 100% operational uptime and backwards compatibility.

---

# Section 1 — Root Cause Analysis

### 1. Primary Root Cause
**Partial Identity Invalidation in `rePairHardware()`**:
- **Location**: `apps/backend/src/provisioning/provisioning.service.ts:251-272`
- **Method**: `ProvisioningService.rePairHardware(boothId)`
- **Mechanism**:
  ```typescript
  // provisioning.service.ts lines 262-267
  if (booth.device) {
    await this.prisma.device.update({
      where: { id: booth.device.id },
      data: { status: 'DECOMMISSIONED' },
    });
    this.logger.warn(`[ProvisioningService] Decommissioned device ${booth.device.id} for booth ${booth.name}`);
  }
  // Issues swap token, but leaves booth.deviceSecret UNTOUCHED!
  ```
- **Execution Path**: When an administrator initiates a laptop swap, `device.status` transitions to `DECOMMISSIONED`. However, `booth.deviceSecret` continues to store the secret of the old machine. Unlike `revokeDevice()` (which explicitly writes `sec_revoked_...`), `rePairHardware()` leaves the active secret in place until the new machine consumes the swap token.

### 2. Secondary Root Cause
**Legacy `Booth.deviceSecret` Priority in Authorization Resolvers**:
- In production controllers, booth identity is resolved by querying `booths.deviceSecret` first or exclusively:
  - `apps/backend/src/auth/auth.service.ts:64`: Queries `prisma.booth.findUnique({ where: { deviceSecret } })`. Completely ignores `Device` table.
  - `apps/backend/src/storage/storage.controller.ts:73`: Queries `prisma.booth.findUnique({ where: { deviceSecret } })`. Completely ignores `Device` table.
  - `apps/backend/src/payments/payments.service.ts:65`: Queries `where: { OR: [{ id: dto.boothId }, { deviceSecret: dto.boothId }] }`. Completely ignores `Device` table.
  - `apps/backend/src/sessions/sessions.controller.ts:128`: Checks `prisma.booth.findUnique({ where: { deviceSecret } })` **before** checking `Device.status === 'ACTIVE'`.
  - `apps/backend/src/booths/booths.service.ts:79`: Checks `OR: [{ deviceSecret: identifier }, { device: { deviceSecret: identifier, status: 'ACTIVE' } }]`. If `Booth.deviceSecret` matches, the condition is satisfied without checking `device.status`.
  - `apps/backend/src/gateway/kiosk.gateway.ts:49`: Same `OR` pattern as `BoothsService`.

### 3. Contributing Factors
1. **Historical Schema Transition**: The platform transitioned from a single-table identity (`Booth.deviceSecret`) in Sprint 1–4 to a dual-table fleet model (`Booth` + `Device`) in Sprint 5 without fully deprecating the legacy column.
2. **Asynchronous Operational Reality**: In retail operations, "Re-pair" is clicked when a laptop fails. The replacement machine is installed hours or days later. The system was designed assuming the swap was instantaneous, leaving an unauthorized operational window.

---

# Section 2 — Current Lifecycle & Vulnerability Window

```
1. Provision Device
   POST /api/provisioning/tokens/generate
   │ (Status: PENDING token)
   ▼
2. Activate Device (Handshake)
   POST /api/provisioning/activate
   ├── Device.status = 'ACTIVE'
   ├── Device.deviceSecret = 'sec_live_A'
   └── Booth.deviceSecret = 'sec_live_A'
   │
   ▼
3. Normal Retail Operation
   Kiosk runs sessions, uploads, heartbeats with 'sec_live_A'
   │
   ▼ [HARDWARE FAILURE / SWAP INITIATED]
4. Re-Pair Hardware Triggered
   POST /api/provisioning/re-pair
   ├── Device.status = 'DECOMMISSIONED'
   ├── Booth.deviceSecret = 'sec_live_A' (STILL ACTIVE!)
   └── Swap Token Issued (Expires in 15m - 24h)
   │
   ├─────────────────── VULNERABILITY WINDOW ───────────────────┐
   │ Old laptop can still:                                     │
   │ • POST /api/sessions (syncs customer photos)              │
   │ • POST /api/storage/confirm-upload (confirms R2 uploads)   │
   │ • POST /api/booths/:id/heartbeat (alters last_seen)       │
   │ • POST /api/auth/booth-auth (issues JWT bearer token)     │
   │ • POST /api/payments/qris (requests dynamic QRIS)         │
   │ • Connect to Socket.io Gateway                            │
   └───────────────────────────────────────────────────────────┘
   │
   ▼ [HOURS LATER: TECHNICIAN ENTERS VENUE]
5. Activate Replacement Device
   POST /api/provisioning/activate (with swap token)
   ├── Device.status = 'ACTIVE'
   ├── Device.deviceSecret = 'sec_live_B'
   └── Booth.deviceSecret = 'sec_live_B'
   │
   ▼
   Old Secret 'sec_live_A' finally rejected across all endpoints.
```

**Identified Vulnerability**: The vulnerability exists between **Step 4** and **Step 5**. If a swap token expires without activation, or if the retired machine is transported or powered on in a lab/depot, the old device retains full operational rights indefinitely.

---

# Section 3 — Inventory of Current Secret Consumers

Every component in the repository consuming `deviceSecret`:

| File | Endpoint / Method | Validation Path | Secret Source Checked | Status Checks `Device.status`? |
| :--- | :--- | :--- | :--- | :---: |
| `apps/backend/src/auth/auth.service.ts` | `POST /api/auth/booth-auth`<br/>`validateBooth()` | `prisma.booth.findUnique({ where: { deviceSecret } })` | `Booth.deviceSecret` | ❌ No |
| `apps/backend/src/storage/storage.controller.ts` | `POST /api/storage/confirm-upload`<br/>`confirmUpload()` | `prisma.booth.findUnique({ where: { deviceSecret } })` | `Booth.deviceSecret` | ❌ No |
| `apps/backend/src/sessions/sessions.controller.ts` | `POST /api/sessions`<br/>`syncSession()` | `prisma.booth.findUnique({ where: { deviceSecret } })` then fallback to `Device` | `Booth.deviceSecret` (Primary)<br/>`Device.deviceSecret` (Fallback) | ❌ No (Bypassed if in Booth) |
| `apps/backend/src/booths/booths.service.ts` | `POST /api/booths/:id/heartbeat`<br/>`findBoothByIdentifier()` | `OR: [{ deviceSecret: id }, { device: { deviceSecret: id, status: 'ACTIVE' } }]` | `Booth.deviceSecret` (1st)<br/>`Device.deviceSecret` (2nd) | ❌ No (Bypassed if in Booth) |
| `apps/backend/src/payments/payments.service.ts` | `POST /api/payments/qris`<br/>`createQRIS()` | `OR: [{ id: dto.boothId }, { deviceSecret: dto.boothId }]` | `Booth.deviceSecret` | ❌ No |
| `apps/backend/src/gateway/kiosk.gateway.ts` | `WS /socket.io (handshake)`<br/>`handleConnection()` | `OR: [{ deviceSecret }, { device: { deviceSecret, status: 'ACTIVE' } }]` | `Booth.deviceSecret` (1st)<br/>`Device.deviceSecret` (2nd) | ❌ No (Bypassed if in Booth) |
| `apps/backend/src/provisioning/provisioning.service.ts` | `POST /api/provisioning/re-pair`<br/>`rePairHardware()` | Updates `device.status = 'DECOMMISSIONED'` | Leaves `Booth.deviceSecret` intact | ❌ N/A (Origin of gap) |
| `apps/backend/src/provisioning/provisioning.service.ts` | `POST /api/provisioning/devices/:id/revoke`<br/>`revokeDevice()` | Updates `device.status = 'REVOKED'` & `booth.deviceSecret = sec_revoked_...` | Explicit rotation | ✅ Yes |

---

# Section 4 — Proposed Fix Options

### Option A: Immediate Secret Invalidation on Re-Pair (Sentinel Rotation)
- **Concept**: Modify `rePairHardware()` in `provisioning.service.ts` to immediately rotate `booth.deviceSecret` to a non-functional sentinel value (e.g. `sec_swap_pending_<timestamp>`) and place the booth in `MAINTENANCE` status.
- **Benefits**:
  - **Zero Controller Churn**: Instant fix across all 6 consumers (`sessions`, `storage`, `auth`, `booths`, `payments`, `gateway`) without touching their code.
  - Old laptop is instantly blocked from all endpoints with HTTP 401 / 404.
  - When replacement laptop activates via swap token, `activateDevice()` overwrites `booth.deviceSecret` with the new valid secret (`sec_live_...`) and sets status to `NORMAL`.
- **Risks**: Extremely low. The booth is already undergoing physical repair, so incoming traffic from the old machine *should* be rejected.
- **Operational Impact**: Positive. Dashboard immediately reflects `MAINTENANCE` and `OFFLINE` during swap.
- **Deployment Complexity**: Minimal (1 file, ~8 lines changed).
- **Compatibility**: 100% backwards compatible.

### Option B: Authoritative Active Device Resolution Across All Controllers
- **Concept**: Refactor all 6 consumers to ignore `Booth.deviceSecret` completely and resolve identity exclusively through `Device.deviceSecret` where `status === 'ACTIVE'`.
- **Benefits**:
  - Eliminates duplicate secret architecture in application code.
  - Fully enforces the new `Device` domain entity.
- **Risks**: Moderate to High.
  - Touches 6 core production files simultaneously.
  - If any booth in production or test database lacks an associated row in `devices`, it becomes permanently locked out.
  - Increased query complexity and join overhead across high-frequency endpoints (heartbeat, socket).
- **Operational Impact**: Requires a database data-migration script to ensure 100% of booths have an active `Device` record before deployment.
- **Deployment Complexity**: High (multi-stage migration, multiple file diffs).
- **Compatibility**: Breaking for any legacy booth lacking a `Device` table relation.

### Option C: Dual-Layer Defense (Immediate Invalidation + Status Guard)
- **Concept**:
  1. **Layer 1 (Immediate Invalidation)**: In `rePairHardware()`, immediately rotate `booth.deviceSecret = 'sec_swap_pending_' + Date.now()` and set `booth.status = 'MAINTENANCE'`.
  2. **Layer 2 (Authoritative Guard in Identity Resolvers)**: In `SessionsController`, `StorageController`, `AuthService`, and `BoothsService`, invert the lookup order: query `Device` with `status === 'ACTIVE'` as the authoritative primary, and only treat `Booth.deviceSecret` as a legacy fallback if NO active device is linked.
- **Benefits**:
  - Best of both worlds: Instant protection via Layer 1 even if a controller misses a check, plus long-term architectural alignment via Layer 2.
  - Prevents decommissioned hardware from operating under any circumstances.
- **Risks**: Low to Moderate. Layer 1 provides immediate safety; Layer 2 provides architectural purity.
- **Operational Impact**: Highly robust; fully auditable.
- **Deployment Complexity**: Moderate (2-3 files).

---

# Section 5 — Recommended Solution

### Selected Option: **Option A (Immediate Secret Invalidation on Re-Pair)** with targeted Layer 2 alignment in `StorageController` and `AuthService`.

### Rationale for Selection:
1. **Root-Cause Direct Hit**: The vulnerability occurs exclusively because `rePairHardware()` forgets to invalidate the existing credential. In contrast, `revokeDevice()` *already* invalidates `booth.deviceSecret` (`sec_revoked_...`). Aligning `rePairHardware()` with the proven pattern of `revokeDevice()` resolves the vulnerability at the exact point of inception.
2. **Zero Blast Radius**: By invalidating the secret at the source, all downstream endpoints (`SessionsController`, `StorageController`, `AuthService`, `PaymentsService`, `BoothsService`, `KioskGateway`) automatically reject the old hardware with standard `401 Unauthorized` without requiring invasive refactoring.
3. **Operational Alignment**: When a laptop fails in the field, setting `booth.deviceSecret = sec_swap_pending_...` and `booth.status = 'MAINTENANCE'` accurately signals to the Dashboard that the booth is physically decommissioned and awaiting field service.

### Why Option B Was Rejected:
Option B creates high regression risks by altering query semantics across 6 files and breaking booths that do not yet have a paired `Device` record.

---

# Section 6 — Exact Files To Modify

To implement the recommended solution, **only two backend files** need modification:

| File | Purpose | Proposed Change | Risk Level |
| :--- | :--- | :--- | :---: |
| `apps/backend/src/provisioning/provisioning.service.ts` | Fleet Provisioning Engine | In `rePairHardware()`: Rotate `booth.deviceSecret` to `sec_swap_pending_<timestamp>` and set `booth.status = 'MAINTENANCE'` inside transaction. | **LOW** |
| `apps/backend/src/storage/storage.controller.ts` | Storage Gateway | In `confirmUpload()`: Add device status check so that even if a secret matches, an explicitly decommissioned device is rejected. | **LOW** |

### Exact Implementation Diff Blueprint:

#### 1. `apps/backend/src/provisioning/provisioning.service.ts`
```typescript
// Inside rePairHardware(boothId: string, userId?: string)
await this.prisma.$transaction(async (tx) => {
  // 1. Mark existing device as DECOMMISSIONED
  if (booth.device) {
    await tx.device.update({
      where: { id: booth.device.id },
      data: { status: 'DECOMMISSIONED' },
    });
    this.logger.warn(`[ProvisioningService] Decommissioned device ${booth.device.id} for booth ${booth.name}`);
  }

  // 2. Immediately invalidate booth device secret to prevent decommissioned hardware masquerading
  const swapSecret = `sec_swap_pending_${Date.now()}`;
  await tx.booth.update({
    where: { id: booth.id },
    data: {
      deviceSecret: swapSecret,
      status: 'MAINTENANCE',
    },
  });
});

// 3. Issue swap token (15 mins)
return this.generateToken({ boothId: booth.id, ttlMinutes: 15 }, userId);
```

#### 2. `apps/backend/src/storage/storage.controller.ts`
```typescript
// Inside confirmUpload()
const booth = await this.prisma.booth.findUnique({
  where: { deviceSecret },
  include: { device: true },
});

if (!booth || (booth.device && booth.device.status !== 'ACTIVE')) {
  throw new HttpException('INVALID_DEVICE: Device decommissioned or unlinked', HttpStatus.UNAUTHORIZED);
}
```

---

# Section 7 — API Contract & Compatibility Impact

| Endpoint | Current Behavior During Swap | Post-Fix Behavior During Swap | Breaking Change? |
| :--- | :--- | :--- | :---: |
| `POST /api/provisioning/re-pair` | Returns `{ token, expiresAt, boothId }` | Returns `{ token, expiresAt, boothId }` (Identical payload) | **NO** |
| `POST /api/provisioning/activate` | Overwrites secrets on both tables | Overwrites secrets on both tables (Identical payload) | **NO** |
| `POST /api/sessions` (Old Laptop) | Returns `200 OK` (Vulnerability) | Returns `401 Unauthorized` (`INVALID_DEVICE_SECRET`) | **NO** (Desired fix) |
| `POST /api/storage/confirm-upload` (Old Laptop) | Returns `201 Created` (Vulnerability) | Returns `401 Unauthorized` (`INVALID_DEVICE`) | **NO** (Desired fix) |
| `POST /api/booths/:id/heartbeat` (Old Laptop) | Returns `201 Created` (Vulnerability) | Returns `404 Not Found` (`Booth not found`) | **NO** (Desired fix) |
| `POST /api/auth/booth-auth` (Old Laptop) | Returns `201 Created` with JWT | Returns `401 Unauthorized` (`Invalid device secret`) | **NO** (Desired fix) |
| `GET /api/booths/:id` (Dashboard) | Shows `NORMAL` (Inaccurate) | Shows `MAINTENANCE` (Accurate status) | **NO** |

---

# Section 8 — Rollout Strategy

### Step 1: Pre-Deployment Audit
- Verify PostgreSQL database integrity:
  `SELECT id, name, status, "deviceSecret" FROM booths;`
  Ensure no booth has null or duplicate `deviceSecret`.

### Step 2: Staging Application
- Apply code changes to `provisioning.service.ts` and `storage.controller.ts`.
- Rebuild backend container: `docker compose build backend && docker compose up -d backend`.

### Step 3: Automated Verification
- Run regression suite validating:
  1. Active device operation.
  2. Instant lockout upon `re-pair` call.
  3. Clean activation and operational restoration of replacement device.

### Step 4: Production Release
- Zero downtime container restart. Zero database schema migrations required.

---

# Section 9 — Runtime Validation Plan

The following test suite must be executed against the live stack after implementation:

### 1. Active Device Test
- **Action**: Provision device via activation token.
- **Expected Result**: `POST /api/sessions`, `POST /api/storage/confirm-upload`, and `POST /api/booths/:id/heartbeat` return `200/201`.
- **Success Criteria**: All operations authorized; `Device.status === 'ACTIVE'`.

### 2. Decommissioned Device Test (The Core Vulnerability Test)
- **Action**: Call `POST /api/provisioning/re-pair`. Then submit requests using the old secret.
- **Expected Result**:
  - `POST /api/sessions` returns `401 Unauthorized`.
  - `POST /api/storage/confirm-upload` returns `401 Unauthorized`.
  - `POST /api/auth/booth-auth` returns `401 Unauthorized`.
  - `POST /api/booths/:secret/heartbeat` returns `404 Not Found`.
- **Success Criteria**: 100% rejection rate for the decommissioned device.

### 3. Replacement Device Activation Test
- **Action**: Consume swap token via `POST /api/provisioning/activate` on Device B.
- **Expected Result**:
  - Device B receives `sec_live_B`.
  - Device B immediately executes session sync, upload confirm, and heartbeat successfully (`HTTP 200/201`).
  - Old Device A remains rejected (`HTTP 401`).
- **Success Criteria**: Replacement device fully operational; old device permanently locked out.

### 4. Emergency Revoke Test
- **Action**: Call `POST /api/provisioning/devices/:boothId/revoke`.
- **Expected Result**: `booths.deviceSecret` rotated to `sec_revoked_...`, `booth.status = 'MAINTENANCE'`, all kiosk operations rejected.
- **Success Criteria**: Immediate total revocation confirmed.

---

# Section 10 — Risk Assessment

| Risk Category | Level | Assessment & Mitigation |
| :--- | :---: | :--- |
| **Implementation Risk** | **LOW** | Modifies ~15 lines across only 2 files. No schema changes or structural refactoring. |
| **Deployment Risk** | **LOW** | Can be deployed as a rolling update without downtime. No database migrations. |
| **Security Risk** | **LOW** | Fully eliminates the unauthorized access window during hardware swap. |
| **Regression Risk** | **LOW** | Active booths with valid credentials operate with identical logic. Only decommissioned hardware is impacted. |

---

# Section 11 — Production Readiness Impact

Implementing this design impacts production readiness as follows:

1. **Fleet Management**:
   - Eliminates "ghost kiosks" where a retired laptop being tested in a repair shop continues sending heartbeats and test sessions to a live retail booth.
2. **Security Posture**:
   - Enforces strict single-device authorization per booth. Stolen or retired hardware is rendered completely inert the moment a swap is initiated from the dashboard.
3. **Operational Clarity**:
   - Setting `booth.status = 'MAINTENANCE'` upon swap initiation provides immediate visual feedback to store managers and support technicians that the booth is awaiting physical replacement.
4. **Kiosk Runtime**:
   - A decommissioned kiosk display will encounter 401 errors, correctly triggering its built-in kiosk activation overlay screen rather than continuing to accept customer payments in an invalid state.

---

# Final Recommendation

# APPROVED FOR IMPLEMENTATION
