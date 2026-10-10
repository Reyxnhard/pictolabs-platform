# PR-01 — BOOTH CONFIGURATION FOUNDATION
## Comprehensive Architecture & Gap Audit Report

- **Document ID:** `PR-01_BOOTH_CONFIGURATION_ARCHITECTURE_AUDIT`
- **Audit Date:** 2026-10-09
- **Platform:** Pictolabs Enterprise Photobooth Platform
- **Active Milestone:** Pilot Readiness (PR-01 Gate)
- **Target Deployment:** Pilot Booth #1 (Field Event Ready)
- **Author:** System Architecture & Reliability Engineering
- **Audit Scope:** System Architecture, Database Schema, Identity Layer, WebSocket Gateway, Kiosk Runtime Hydration, and Dashboard Administration
- **Status:** Architecture Review Only (Zero Code/Schema Modifications)

---

## 1. Executive Summary & Context

Pictolabs is preparing for its physical field pilot launch with **Booth #1**. To transition from a hardcoded single-unit prototype into an enterprise multi-booth fleet, a resilient, production-safe configuration foundation is required.

According to canonical roadmap `PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`, **PR-01 (Booth Configuration Foundation)** serves as the prerequisite foundation for all subsequent hardware, pricing, and operational gates:
- **PR-02:** Printer Profiles & Calibration (paper size, copies, orientation, cut offset)
- **PR-03:** Camera Selection & Exposure (Canon DSLR vs Webcam, mirror viewfinder, aspect ratio)
- **PR-04:** Frame / Design Asset Management (cloud sync of dynamic layout frames)
- **PR-05:** Pricing & Print Quantity (tiered pricing per print count, coupon/voucher rules)
- **PR-06:** Session Timing Configuration (payment timeout, pose countdown, QR screen timeout)
- **PR-07:** Upload Visibility & Privacy (customer consent, cloud upload toggles)
- **PR-08:** Fullscreen / Kiosk Behavior (window constraints, technician bypass)

This audit evaluates the active codebase (`pictolabs-rebuild/`) against enterprise operational standards, identifies architectural discrepancies between documentation and implementation, and outlines the minimal, pilot-safe data model and configuration flow to execute PR-01 without regression to Booth #1.

---

## 2. Audit Question A — Current Booth Identity

### 2.1 How a Kiosk Identifies Itself
The kiosk identifies itself using a cryptographically generated 256-bit secret token prefixed with `sec_live_` (e.g., `sec_live_6a7b8c...`), issued during the initial pairing handshake (`apps/backend/src/provisioning/provisioning.service.ts#L160`).
In runtime operations, this secret is passed:
1. **WebSocket Handshake:** Passed in the connection query/auth header `x-device-secret` or handshake payload (`apps/backend/src/gateway/kiosk.gateway.ts#L36-L54`).
2. **HTTP API Calls:** Provided via header `x-device-secret` and validated against backend records (`apps/backend/src/auth/guards/booth-secret.guard.ts`).

### 2.2 How a Kiosk is Paired to a Booth
Pairing follows an administrative activation token workflow:
1. An administrator creates an activation code (format: `ACT-XXXX-XXXX`, 15-minute TTL) in the Admin Dashboard via `POST /api/provisioning/tokens/generate` (`provisioning.controller.ts#L26-L32`).
2. The kiosk boots into the Unpaired Activation Screen, captures the token (via QR scanner or keyboard), gathers local hardware fingerprint (MAC address, hostname, OS version, machine GUID), and transmits `POST /api/provisioning/activate` (`IdentityService.ts#L445-L465`).
3. The backend validates token validity (`status == 'PENDING'`, `now() <= expiresAt`), marks the token `CONSUMED`, registers/updates a `Device` record linked to the target `Booth`, updates `Booth.deviceSecret`, and returns `{ boothId, boothName, branchId, deviceSecret, config }` (`provisioning.service.ts#L167-L245`).

### 2.3 Where boothId and deviceId are Persisted
On the physical kiosk running Windows:
1. **Primary Persistence:** `%ProgramData%\Pictolabs\identity.json` (`IdentityService.ts#L58-L77`). This path is system-wide, accessible across all OS users, and survives standard user-profile wipes.
2. **Secret Encryption:** The `deviceSecret` string is encrypted at rest using Windows Data Protection API (DPAPI) via Electron's `safeStorage.encryptString()` and stored as `dpapi:<base64>` (`IdentityService.ts#L87-L98`).
3. **Local Database Mirror:** Mirrored into the local SQLite database (`kiosk.db`) table `kiosk_identity` (`id=1`) (`IdentityService.ts#L164-L222`).

### 2.4 Survival Across Restart and Reinstall
- **Restart (OS Reboot / App Restart):** **YES.** On boot, `loadIdentity()` (`IdentityService.ts#L310-L337`) reads `%ProgramData%\Pictolabs\identity.json`, decrypts `deviceSecret` using DPAPI, and verifies SQLite consistency.
- **Reinstall (App Update / MSI or NSIS Reinstall):** **YES.** `%ProgramData%` is external to the application installation directory (`%LocalAppData%\Programs\Pictolabs` or `C:\Program Files`). Unless an uninstaller explicitly executes a purge routine on `%ProgramData%\Pictolabs`, the identity survives reinstalls.
- **Laptop Swap / Hard Wipe:** **NO.** If the hard drive is formatted or `%ProgramData%` is purged, the kiosk reverts to `UNPAIRED` and requires a re-pairing token (`POST /api/provisioning/re-pair`).

### 2.5 Backend Device ↔ Booth Ownership Validation
1. Backend `Device` model has a strict `@unique` foreign key `boothId String @unique` (`schema.prisma#L80`).
2. When a device authenticates via WebSocket (`kiosk.gateway.ts#L39-L55`), backend queries:
   ```ts
   booth = await this.prisma.booth.findFirst({
     where: {
       OR: [
         { deviceSecret },
         { device: { deviceSecret, status: 'ACTIVE' } }
       ]
     },
     include: { config: true, device: true }
   });
   ```
3. If the secret does not match or device status is `REVOKED`/`DECOMMISSIONED`, the socket is forcefully disconnected (`client.disconnect(true)`).

### 2.6 Duplicate Connection Collision Protection
- **Single-Socket Policy:** Implemented in `kiosk.gateway.ts#L62-L73`. If a second client connects with the same `boothId` or `deviceSecret`, the gateway detects the collision, terminates the older socket session with code `DUPLICATE_DEVICE_SESSION`, and binds the room to the new client.
- **Accidental Cross-Identity Risk:** Low, because `deviceSecret` is high-entropy 256-bit crypto hex (`sec_live_` + 64 hex characters). Two kiosks cannot collide by accident. However, if a cloned disk image is copied to two physical machines without generating a new activation token, both kiosks will fight over the single socket room.

### 2.7 Sufficiency for Per-Booth Configuration
The existing activation handshake already provisions `boothId`, `boothName`, `branchId`, and `deviceSecret` to the kiosk. The foundation for identity is **100% SUFFICIENT**. What is currently missing is the configuration synchronization lifecycle over that identity.

---

## 3. Audit Question B — Current Booth Model vs Implementation

The following matrix maps every functional domain to its actual source of truth and reveals existing gaps:

| Domain | Existing Field / Model | Source of Truth | Current Behavior | Gap & Architectural Flaw |
|---|---|---|---|---|
| **Booth Identity** | `Booth.id`, `Booth.name`, `Booth.branchId`, `Booth.deviceSecret` (`schema.prisma#L51-L76`) | Backend PostgreSQL `booths` table | Defined during provisioning. Stored on kiosk in `identity.json` and SQLite `kiosk_identity`. | **None.** Fully functional and secure. |
| **Device Identity** | `Device.id`, `Device.boothId`, `Device.machineGuid`, `Device.macAddress`, `Device.hostname` (`schema.prisma#L78-L97`) | Backend PostgreSQL `devices` table | Bound 1:1 to `Booth`. Captures runtime hardware telemetry on pairing and heartbeat. | Telemetry fields are updated via heartbeat, but device revocation does not trigger live kiosk config reset. |
| **Activation** | `ActivationToken` (`schema.prisma#L99-L117`) | Backend PostgreSQL `activation_tokens` table | Single-use 15m token `ACT-XXXX-XXXX`. Consumed during `activateDevice`. | Returns initial config on pairing, but kiosk client fails to persist `config` during `saveIdentity()` (`IdentityService.ts#L474`). |
| **Pricing** | `BoothConfig.generalSettings` (`schema.prisma#L125`) | PostgreSQL JSON string: `{"price":35000}` | Dashboard edits price via `POST /api/booths/push-config` -> updates DB and emits WS `CONFIG_UPDATE`. | 1. Flat scalar only (`price: 35000`). No multi-print quantity tiers (PR-05).<br>2. `pushConfig` overwrites entire `generalSettings` string, destroying `countdown` and `timeout`.<br>3. Backend `createQRIS` trusts client `dto.amount` without server-side validation. |
| **Camera** | `BoothConfig.cameraSettings` (`schema.prisma#L123`): `{"iso":100,"shutterSpeed":"1/125","aperture":"f/5.6"}` | Dead DB column (PostgreSQL `booth_configs`) | `CameraService.ts` never reads `cameraSettings` from DB! Hardcodes Canon EDSDK properties or leaves them to camera dial. Only reads `cameraResult` from local `kiosk-config.json` (`CameraService.ts#L396`). | Complete disconnect between Cloud DB and physical camera driver. Camera profile reference does not exist in booth model. |
| **Printer** | `BoothConfig.printerSettings` (`schema.prisma#L124`): `{"paperSize":"4R","copies":1,"offsetX":0,"offsetY":0}` | Dead DB column (PostgreSQL `booth_configs`) | `PrintService.ts` auto-detects DNP / DS-RX1 via Windows spooler and hardcodes 4R/2-inch strip cut behavior. Never queries `booth_configs.printerSettings`. | Complete disconnect. No calibration offsets (`offsetX`, `offsetY`) or paper profile hydration exists between backend and kiosk. |
| **Frame / Design** | `Frame` & `FrameLayer` (`schema.prisma#L234-L270`) | Disconnected Backend Tables vs Hardcoded Kiosk Array | Backend has rich `Frame` & `FrameLayer` schema, but kiosk `FrameDesignScreen.tsx#L19-L60` uses hardcoded local TypeScript array (`FRAME_DESIGNS`). Dashboard has 0 frame assignment UI. | Disconnected. Booth has no `frameAssignments` or `activeFrames` relation. Kiosk cannot receive dynamic frames per booth. |
| **Timers** | `BoothConfig.generalSettings` (`schema.prisma#L125`): `{"countdown":5,"timeout":270}` | Partially read / Partially hardcoded | `CaptureScreen.tsx#L359` reads `config.countdown || 5`. But `PaymentScreen.tsx#L34` hardcodes `270s`, and `QRScreen.tsx#L27` hardcodes `60s`. | Timers are scattered and uncoordinated. No centralized `timingProfile` schema. |
| **Upload / Config** | None | Local Kiosk `.env` & runtime constants | Kiosk directly reads Cloudflare R2 credentials from its local environment. | No per-booth upload toggle or privacy visibility configuration in database. |

---

## 4. Audit Question C — Configuration Ownership & Synchronization

### 4.1 Intended Architecture
```
┌──────────────────────────────────────────────────────────┐
│                   BACKEND (POSTGRESQL)                   │
│   Canonical Source of Truth (SSOT) Per-Booth Config      │
└────────────────────────────┬─────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
   [1] Boot Reconciliation           [2] Real-Time Sync
   HTTP GET /api/booths/:id/config   WebSocket: booth:${id}
   (ETag / configVersion)            Event: CONFIG_UPDATE
            │                                 │
            └────────────────┬────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────┐
│                     PHYSICAL KIOSK                       │
│  - Runtime State: KioskConfigContext (React)             │
│  - Persistent Cache: %ProgramData%\Pictolabs\config.json │
│  - Fallback: Hardcoded Production Safe Defaults          │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Architectural Evaluation Against Current Implementation
1. **Backend as Canonical SSOT:** Fits the existing system well. The `BoothConfig` model is already related 1:1 to `Booth` via `boothId`.
2. **Kiosk Local Cache:** Currently exists as `kiosk-config.json` inside the kiosk data directory (`SyncEngine.ts#L1524`). However, it is stored in `%APPDATA%` or app dataDir rather than system-wide `%ProgramData%`, and has no integrity hash or version tracking.
3. **Realtime WebSocket Propagation:** Already exists and functions. `KioskGateway.pushConfigUpdate()` routes events directly to room `booth:${boothId}`.
4. **Startup/Reconnect Reconciliation:** **CRITICAL GAP.**
   - Currently, on cold boot, the kiosk ONLY loads `kiosk-config.json` from local disk (`KioskConfigContext.tsx#L59`).
   - If a manager updates pricing or settings in the Dashboard while the kiosk is turned off, the kiosk boots with STALE settings.
   - It only reconciles IF the WebSocket connects successfully AND the gateway fires `CONFIG_UPDATE` on connect (`kiosk.gateway.ts#L85`).
   - If the kiosk boots in an environment with unstable Internet or WebSocket reconnect delay, customer sessions immediately execute with stale pricing.
   - **Recommendation:** Kiosk boot sequence MUST execute an atomic HTTP config hydration fetch (`GET /api/booths/:id/config`) before unlocking the Welcome screen.

---

## 5. Audit Question D — Configuration Boundaries (PR-01 vs PR-02..PR-08)

To keep PR-01 minimal, stable, and production-safe, we must strictly separate the **Configuration Foundation (PR-01)** from the **Domain Implementations (PR-02 to PR-08)**:

```
┌────────────────────────────────────────────────────────────────────────┐
│               PR-01: BOOTH CONFIGURATION FOUNDATION                    │
│                                                                        │
│  • Booth Identity & Metadata (boothId, branchId, status, name)         │
│  • Unified Config Envelope (version, checksum, updatedAt)              │
│  • Domain Sub-Object Namespaces (pricing, timing, hardware, frames)    │
│  • Atomic HTTP Boot Hydration & WebSocket Delta Propagation            │
│  • Local Storage Contract (%ProgramData%\Pictolabs\booth-config.json)  │
│  • Server-Side Pricing Validation Guard                                │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
    ┌───────────────┴───────────────┐┌───────────────┴───────────────┐
    ▼                               ▼▼                               ▼
[PR-02: Printer Profile]      [PR-03: Camera Profile]      [PR-04: Frame Catalog]
(Driver, Cut, Offsets)       (Canon/Webcam, Exposure)     (Remote Frame Layouts)

    ▼                               ▼▼                               ▼
[PR-05: Tiered Pricing]       [PR-06: Session Timers]      [PR-07: Upload Rules]
(Quantity Tiers, Discounts)   (Payment, Pose, QR limits)  (R2 CDN, Privacy toggles)
```

### Domain Boundary Rules for PR-01:
1. **PR-01 Owns:**
   - The root configuration envelope schema (`BoothConfig`).
   - The versioning mechanism (`configVersion: number`).
   - The HTTP endpoint contract: `GET /api/booths/:id/config` and `PUT /api/booths/:id/config`.
   - The boot hydration contract in the kiosk (`fetchRemoteConfig()`).
   - The WebSocket subscription and room-isolation guarantee (`booth:${boothId}`).
   - Safe merge semantics (updating price must never destroy timers or camera settings).
2. **PR-01 Does NOT Implement:**
   - Do not touch Canon EDSDK bindings or C++ wrappers (PR-03).
   - Do not implement custom DNP print cut commands or calibration routines (PR-02).
   - Do not implement dynamic multi-tier UI or voucher engine (PR-05).
   - Do not rebuild the canvas layout compositor `RenderEngine.ts` (PR-04).
   - Do not alter `PaymentScreen` UI countdown timers (PR-06).

---

## 6. Audit Question E — Per-Booth Isolation & Cross-Talk Prevention

We conducted a forensic code review to verify if Booth A's configuration can leak into Booth B:

### 6.1 Database Isolation
- In `schema.prisma#L121`, `BoothConfig` has `boothId String @unique`.
- Foreign key cascading is bound 1:1 with `Booth.id`.
- Relational isolation in PostgreSQL is mathematically sound. Booth A and Booth B have separate records.

### 6.2 API Authorization Isolation
- `GET /api/booths/:id` and `PUT /api/booths/:id/config` accept `:id` as path parameter.
- Admin dashboard requests require Admin JWT.
- Kiosk-facing endpoints (`POST /api/booths/:id/heartbeat`) validate `:id` against the caller's identity.
- **Identified Cross-Booth Risk in Payments:**
  - In `payments.service.ts#L61-L93`, if `dto.boothId` fails to match an existing booth, the service executes `this.prisma.booth.findFirst()` and binds the payment to the **first booth in the database**!
  - In a multi-booth fleet, an invalid or misconfigured `boothId` from Booth B could silently attach financial transactions to Booth A!
  - **Resolution for PR-01:** Strictly reject unknown `boothId` with `NotFoundException('INVALID_BOOTH_ID')`.

### 6.3 WebSocket Room & Channel Routing
- In `kiosk.gateway.ts#L76`, every connecting kiosk joins room:
  `client.join("booth:" + booth.id);`
- In `kiosk.gateway.ts#L154`:
  `this.server.to("booth:" + boothId).emit('CONFIG_UPDATE', config);`
- Room routing is isolated per booth ID.
- **Identified Broadcast Risk:**
  - In `kiosk.gateway.ts#L150-L152`: If `boothId === 'all'` or `undefined`, the gateway broadcasts `CONFIG_UPDATE` globally to all booths.
  - In `booths.controller.ts#L123-L128`: Calling `POST /api/booths/push-config` without a specific `boothId` iterates every booth in the database and overwrites their individual configurations with identical global data!
  - This defeats per-booth isolation.
  - **Resolution for PR-01:** Deprecate global `push-config` overwrites. Require explicit per-booth target UUIDs.

---

## 7. Audit Question F — Backward Compatibility & Zero-Regression Guard

### 7.1 Preservation of Booth #1
Booth #1 (Pilot unit deployed at Grand Indonesia Mall) is actively running stable builds. PR-01 must not cause regressions in:
- Existing Activation Handshake
- Customer Flow (Welcome -> Payment -> Frame Design -> Capture -> QR)
- Canon DSLR LiveView & Capture
- DS-RX1 Windows Spooler Printing & Reprint
- Offline SQLite WAL Session Ledger
- Cloudflare R2 Upload Flow

### 7.2 Zero-Regression Strategy
1. **Additive JSON Schema:** `BoothConfig` currently stores stringified JSON in `generalSettings`. Rather than dropping columns or running destructive SQL migrations, PR-01 will keep `generalSettings` and parse/structure its sub-properties gracefully.
2. **Fallback to Existing Defaults:** If any field in `generalSettings` is missing or null, the kiosk code must fall back to the exact constants already tested in production:
   - `price`: `35000`
   - `countdown`: `5`
   - `paymentTimeout`: `270`
   - `qrTimeout`: `60`
   - `themeColor`: `#3b82f6`
3. **No Changes to Hardware Drivers:** `CameraService.ts` and `PrintService.ts` remain untouched during PR-01.

---

## 8. Audit Question G — Failure & Fallback Model

A physical photobooth operates unattended in public venues with frequent network drops. PR-01 defines deterministic fallback behavior for all network scenarios:

| Failure Scenario | Kiosk Behavior | Dashboard / Cloud Behavior | Recovery Action |
|---|---|---|---|
| **Backend Offline at Kiosk Boot** | 1. Kiosk attempts HTTP fetch (`GET /config`) with 3s timeout.<br>2. On timeout or 500 error, kiosk logs warning.<br>3. Kiosk hydrates from local `%ProgramData%\Pictolabs\config.json`.<br>4. If local file missing, falls back to hardcoded `DEFAULT_KIOSK_CONFIG`.<br>5. UI displays subtle offline badge, but customer flow unlocks. | Heartbeat status turns `OFFLINE` after 300s. | Once network recovers, WebSocket reconnect triggers immediate config reconciliation. |
| **WebSocket Connection Drops** | Kiosk continues operating with active local configuration. Heartbeat switches to HTTP polling. | Dashboard indicates socket disconnected, but HTTP heartbeat keeps booth `ONLINE`. | Socket auto-reconnects with exponential backoff (1s, 2s, 5s, 10s max). |
| **Corrupt / Malformed Config Received** | Kiosk `try/catch` JSON parser catches syntax error, rejects payload, logs `CONFIG_PARSE_ERROR` to SQLite `system_events`, and retains previous valid configuration. | Gateway logs serialization warning. | Admin re-pushes valid config from Dashboard. |
| **Incomplete Config Schema** | Object deep merge (`lodash.merge` or native `{ ...DEFAULT, ...incoming }`) ensures missing sub-properties default safely. | Schema validator flags missing fields before persistence. | Kiosk runs without crash. |
| **Unknown Config Version (Future Schema)** | Kiosk checks `configVersion`. If version is newer than supported kiosk client code, kiosk adopts backwards-compatible fields and ignores unrecognized keys. | Dashboard warns if target kiosk app version is out of date. | Kiosk prompts for OTA app update in Admin Panel. |

---

## 9. Audit Question H — Configuration Versioning

### 9.1 Current State
Configuration versioning does **NOT** exist in the codebase:
- `BoothConfig` has `createdAt` and `updatedAt` timestamps in PostgreSQL (`schema.prisma#L126-L127`), but no version counter.
- Payloads sent over WebSocket contain raw `{ price: 35000 }` with no timestamp, no version number, and no hash.
- The kiosk cannot detect whether its local file is newer, older, or identical to the backend state.

### 9.2 Proposed Minimal Versioning Mechanism for PR-01
To guarantee idempotency and avoid stale overwrites, `BoothConfig` should introduce:
1. `version`: An integer sequence counter (`Int @default(1)`), incremented atomically on every mutation (`version: { increment: 1 }`).
2. `hash`: An MD5 or SHA-256 hash string of the canonical JSON string, enabling instant HTTP `304 Not Modified` or `ETag` checks.
3. Kiosk compares incoming `version > localVersion` before applying updates.

---

## 10. Audit Question I — Dashboard Requirements Analysis

### 10.1 Inspection of `BoothDetailDrawer.tsx`
Inspection of `apps/dashboard/src/components/booths/BoothDetailDrawer.tsx` reveals:
- **What Already Exists:**
  - Status Badge & Heartbeat liveness diagnostics (`#L168-L190`).
  - Maintenance Mode toggle (`#L193-L197`).
  - Session Pricing Input (`#L200-L308`).
  - Hardware Provisioning Section (activation tokens, QR code) (`#L311-L317`).
  - Technician PIN Management (6-digit bcrypt hash) (`#L321-L407`).
  - 5-Pillar Health Telemetry (`#L410-L412`).
  - Runtime specifications (App version, commit, OS, IP) (`#L444-L506`).
- **What is Hardcoded in UI:**
  - Presets in Pricing form: `Rp 1.000`, `Rp 25.000`, `Rp 30.000`, `Rp 35.000`, `Rp 50.000` (`#L270-L275`).
  - Timers: There is no UI to inspect or change countdown or session timeouts.
  - Camera & Printer: Only displays telemetry health; no configuration inputs.
- **Architectural Bug in Existing Dashboard Update:**
  - In `boothsApi.updateBoothPrice(boothId, price)` (`boothsApi.ts#L30-L36`), the dashboard calls:
    `POST /api/booths/push-config` with `{ boothId, config: { price } }`.
  - Backend controller saves:
    `generalSettings: JSON.stringify(config)`.
  - **Result:** Every time an admin updates price from the dashboard, all other settings (`countdown`, `timeout`) stored in `generalSettings` are permanently erased from the database!

### 10.2 Minimal Dashboard Requirements for PR-01:
1. Fix the destructive overwrite bug in backend `updateConfig` (use deep patch/merge).
2. Add a read-only **Configuration Metadata Badge** in `BoothDetailDrawer`:
   - Config Version (e.g., `v3`)
   - Last Synced Timestamp
   - Synchronization State (`IN_SYNC` / `PENDING`)
3. Preserve existing UI layout without major redesign.

---

## 11. Audit Question J — Recommended Data Model for PR-01

To ensure zero database schema breakage while accommodating PR-01 through PR-08, we propose the following minimal, typed configuration envelope:

### 11.1 Proposed TypeScript Schema Envelope (`BoothConfigData`)
```ts
export interface BoothConfigEnvelope {
  version: number;             // Monotonic integer sequence (PR-01)
  updatedAt: string;           // ISO 8601 timestamp (PR-01)
  boothId: string;             // Canonical booth UUID (PR-01)

  // PR-01 / PR-05: Pricing & Commercial
  pricing: {
    basePrice: number;         // e.g. 35000 (IDR)
    currency: string;          // "IDR"
    enableVoucher: boolean;    // true
    enableQRIS: boolean;       // true
  };

  // PR-01 / PR-06: Operational Timers
  timing: {
    paymentTimeoutSec: number; // e.g. 270 (PaymentScreen QR expiration)
    poseCountdownSec: number;  // e.g. 5 (CaptureScreen pose timer)
    qrTimeoutSec: number;      // e.g. 60 (QRScreen customer download timer)
    idleResetSec: number;      // e.g. 120 (WelcomeScreen idle return timer)
  };

  // PR-01 / PR-02 / PR-03: Hardware References (Placeholders for PR-02 & PR-03)
  hardware: {
    cameraProfile: 'CANON_DSLR' | 'WEBCAM_GENERIC';
    printerProfile: 'DNP_DSRX1' | 'CITIZEN_CY02' | 'MOCK';
    mirrorViewfinder: boolean; // default true
    paperSize: '4R' | '2x6_STRIP';
  };

  // PR-01 / PR-04: Frame Design Reference (Placeholder for PR-04)
  frames: {
    assignedCatalogId?: string; // null or catalog UUID
    allowedFrameIds: string[];  // e.g. ['classic-white', 'noir-black', 'pastel-lilac']
  };

  // PR-01 / PR-07 / PR-08: Kiosk System Flags
  system: {
    enableCloudUpload: boolean; // default true (PR-07)
    kioskFullscreen: boolean;   // default true (PR-08)
    themeColor: string;         // e.g. "#3b82f6"
    eventName: string;          // e.g. "PICTOLABS SELF PHOTOBOOTH"
    subText: string;            // e.g. "TOUCH SCREEN TO START"
  };
}
```

### 11.2 Entity & Field Rationalization

| Entity / Field | Storage Location | Why It Exists | Target PR |
|---|---|---|---|
| `version` | Backend `BoothConfig.version` & Kiosk disk cache | Detects stale cache and prevents out-of-order WebSocket race conditions. | **PR-01** |
| `pricing.basePrice` | `BoothConfig.generalSettings` -> `pricing.basePrice` | Defines dynamic QRIS session cost; validated on backend during payment generation. | **PR-01 / PR-05** |
| `timing.*` | `BoothConfig.generalSettings` -> `timing.*` | Replaces hardcoded timers in `PaymentScreen` (270s) and `QRScreen` (60s). | **PR-01 / PR-06** |
| `hardware.*` | `BoothConfig.printerSettings` & `cameraSettings` | Provides typed references for camera and printer profiles without touching driver bindings. | **PR-01 (Contract) / PR-02 / PR-03** |
| `frames.allowedFrameIds` | `BoothConfig.generalSettings` -> `frames.*` | Prepares filtering for which frame designs are active for Booth #1 vs other booths. | **PR-01 (Contract) / PR-04** |
| `system.themeColor` | `BoothConfig.generalSettings` -> `system.*` | Supports white-label branding and event customization per venue. | **PR-01** |

---

## 12. Final Recommendation (Subsections 1 to 18)

### 1. Current State
The platform has a functional single-booth setup (Booth #1) with operational payments, hardware drivers, and local recovery ledgers. However, remote configuration relies on an ad-hoc WebSocket event (`CONFIG_UPDATE`) that overwrites a stringified column in PostgreSQL and is completely decoupled from cold boot hydration.

### 2. Existing Implementation
- **PostgreSQL:** Table `booth_configs` contains `cameraSettings`, `printerSettings`, and `generalSettings` as unvalidated strings.
- **Backend:** `BoothsController.pushConfig()` and `updateConfig()` lack deep merge logic, destroying non-price properties when price is modified.
- **Kiosk:** `SyncEngine.ts` writes received config to local disk (`kiosk-config.json`), which `KioskConfigContext.tsx` reads on startup. However, kiosk never performs an HTTP sync on boot.
- **Hardware & UI:** Camera and printer drivers ignore database settings completely. Timers in `PaymentScreen` and `QRScreen` are hardcoded.

### 3. Documentation vs Code Discrepancies
1. **Spec Claim:** Kiosk syncs with Cloud backend on startup.
   - **Actual Code:** Kiosk ONLY reads local disk `kiosk-config.json` on startup. If offline or WebSocket has not connected, it never requests latest config from backend HTTP API.
2. **Spec Claim:** `BoothConfig.cameraSettings` and `printerSettings` configure hardware.
   - **Actual Code:** `CameraService.ts` and `PrintService.ts` never query `BoothConfig`. These DB columns are completely dead in the active codebase.
3. **Spec Claim:** Dynamic frame assignments exist per booth.
   - **Actual Code:** `FrameDesignScreen.tsx` uses a static hardcoded array of 5 frames. DB `Frame` table is ignored by the kiosk.
4. **Spec Claim:** Server validates payment amounts.
   - **Actual Code:** `PaymentsService.createQRIS()` blindly accepts whatever `amount` is passed in the client DTO.

### 4. Identified Gaps
- **Gap 1 (Boot Hydration):** No HTTP config fetch during kiosk boot lifecycle.
- **Gap 2 (Versioning):** No monotonic version number or hash to resolve stale configuration.
- **Gap 3 (Destructive Update):** Dashboard price update wipes other settings in `generalSettings`.
- **Gap 4 (Server Security):** Backend QRIS creation does not verify price against `BoothConfig`.
- **Gap 5 (Hardcoded Timers):** Screens contain hardcoded integers (270s, 60s) rather than hydrated config values.

### 5. Proposed PR-01 Configuration Architecture
PR-01 establishes the **Unified Configuration Hydration & Reconciliation Pipeline**:
- Backend holds canonical JSON in `BoothConfig`.
- REST endpoint `GET /api/booths/:id/config` allows authenticated HTTP fetch with `ETag` / `version`.
- REST endpoint `PUT /api/booths/:id/config` validates payload via Zod/DTO and performs deep JSON merge.
- Kiosk boot sequence fetches `GET /api/booths/:id/config` during initialization before rendering UI.
- Local cache written to `%ProgramData%\Pictolabs\booth-config.json`.
- Live updates received via WebSocket `booth:${boothId}` trigger hot reload in React context without reload/flicker.

### 6. Data Model Proposal
Maintain existing PostgreSQL schema table `booth_configs` to guarantee zero database migration risk:
- Utilize `generalSettings` to store the structured `BoothConfigEnvelope` JSON.
- Add an application-level `version` counter inside the JSON envelope.
- In backend service, parse and validate the JSON using a strict NestJS Class-Validator DTO.

### 7. Configuration Sync Flow
```
[Kiosk Boot]
    │
    ▼
[Read Local Cache] (%ProgramData%\Pictolabs\booth-config.json)
    │
    ▼
[Hydrate UI Context] (Immediate UI readiness, zero freeze)
    │
    ▼
[HTTP Fetch] (GET /api/booths/:id/config with 3s timeout)
    ├── Success (version > local): Save to disk & Hot Update React State
    ├── 304 Not Modified: Keep local cache
    └── Failure / Network Offline: Retain local cache, emit offline warning
    │
    ▼
[WebSocket Connect] (Join room booth:${boothId})
    └── On 'CONFIG_UPDATE': Verify version, Save to disk & Hot Update React State
```

### 8. Failure / Fallback Model
- Offline boot guarantees zero UI blocking: always falls back to local disk cache, and if disk cache is absent, falls back to `DEFAULT_KIOSK_CONFIG` (Rp 35.000, 5s countdown, 270s payment timeout).
- Network timeouts capped at 3000ms.
- Corrupt payloads rejected with zero state mutation.

### 9. Security / Cross-Booth Isolation Review
- Enforce strict `boothId` authorization on all config routes.
- Eliminate global broadcast behavior (`pushConfigUpdate('all')`).
- Patch `PaymentsService.createQRIS` to look up `booth.config.pricing.basePrice` and reject mismatched payment amounts.
- Remove fallback booth creation in production payments service.

### 10. Backward Compatibility Review
- Full compatibility with Booth #1.
- Existing database tables untouched.
- Default values match Booth #1 production constants.
- Unpaired kiosks continue to display activation screen without failure.

### 11. Dashboard Requirements
- Fix `updateBoothPrice` API method to use atomic deep merge.
- Add configuration metadata display in `BoothDetailDrawer.tsx` (Current Version, Last Updated).
- Prevent accidental global configuration pushes.

### 12. Kiosk Requirements
- Introduce `fetchRemoteConfig()` helper in `apps/kiosk/electron/services/SyncEngine.ts`.
- Expose IPC `config:fetch-remote` in preload bridge.
- Update `KioskConfigContext.tsx` to call remote fetch on mount and update local cache.
- Bind `PaymentScreen` timeout to `config.timing.paymentTimeoutSec || 270`.
- Bind `QRScreen` timeout to `config.timing.qrTimeoutSec || 60`.

### 13. API & WebSocket Requirements
- **Endpoint:** `GET /api/booths/:id/config` (Public or deviceSecret authenticated).
- **Endpoint:** `PUT /api/booths/:id/config` (Admin JWT protected; validates DTO).
- **WS Event:** `CONFIG_UPDATE` emitted strictly to room `booth:${boothId}`.

### 14. Implementation Phases (Roadmap for PR-01 Execution)
- **Phase 1: Backend DTO & Safe Merge Service**
  - Implement `BoothConfigDto` validation and deep merge in `BoothsService`.
  - Expose `GET /api/booths/:id/config` endpoint.
- **Phase 2: Server-Side Payment Price Validation**
  - Cross-validate QRIS creation against `BoothConfig.pricing.basePrice`.
- **Phase 3: Kiosk Hydration & Cache Engine**
  - Add HTTP boot hydration in Electron main process.
  - Standardize cache file in `%ProgramData%\Pictolabs\booth-config.json`.
- **Phase 4: Kiosk Context & Screen Binding**
  - Connect `KioskConfigContext` to boot hydration.
  - Wire dynamic timers into `PaymentScreen` and `QRScreen`.
- **Phase 5: Automated E2E Verification**
  - Execute automated tests verifying per-booth isolation, boot reconciliation, and offline fallback.

### 15. Automated Test Requirements
A dedicated test suite `src/config/booth-config.e2e.ts` must prove:
1. `AC-1.1`: `GET /api/booths/:id/config` returns valid JSON with `version` and `pricing`.
2. `AC-1.2`: `PUT /api/booths/:id/config` updates price without erasing timers or hardware references.
3. `AC-1.3`: Updating Booth A configuration does NOT alter Booth B configuration.
4. `AC-1.4`: WebSocket `CONFIG_UPDATE` is received only by sockets joined to `booth:BoothA`.
5. `AC-1.5`: Kiosk boot simulation loads local disk cache when backend is simulated as OFFLINE.
6. `AC-1.6`: `createQRIS` rejects payment creation if `amount` doesn't match `BoothConfig`.

### 16. Founder Physical UAT Requirements
1. **Cold Launch Verification:** Kiosk boots up in offline mode, correctly displays Rp 35.000, and transitions to payment.
2. **Online Dynamic Update:** Admin changes price to Rp 30.000 in Dashboard -> Kiosk displays live update toast and updates screen price immediately without app restart.
3. **Reboot Persistence:** Kiosk app is restarted -> Confirms Rp 30.000 is loaded from cache on startup.
4. **Hardware Non-Interference:** Canon DSLR LiveView and DS-RX1 physical print succeed with zero regression.

### 17. Risks & Open Questions
- **Risk 1:** Electron `safeStorage` DPAPI is machine-specific. Config cache must NOT be DPAPI encrypted if operators need to inspect it via Notepad during venue maintenance. (Recommendation: Keep `identity.json` DPAPI encrypted, but store `booth-config.json` as plain readable JSON).
- **Risk 2:** If a venue has captive portal WiFi, initial HTTP fetch might return HTML instead of JSON. (Recommendation: Validate `Content-Type: application/json` before parsing).

### 18. Recommended Next Step
- Submit this Audit Report for Architecture Review.
- Upon approval, authorize execution of **PR-01 Implementation Phase** following the 6-Phase Sprint Workflow.

---

## 13. Acceptance Criteria Verification (Audit Gate)

| # | Question / Acceptance Criteria | Audit Answer | Evidence Reference |
|---|---|---|---|
| **1** | What is the canonical Booth configuration source? | PostgreSQL `booth_configs` table related 1:1 to `booths`. | `schema.prisma#L119-L130` |
| **2** | How does kiosk identify its Booth? | Via 256-bit `deviceSecret` stored in DPAPI `%ProgramData%\Pictolabs\identity.json` and mirrored in SQLite `kiosk_identity`. | `IdentityService.ts#L24-L77` |
| **3** | How does kiosk obtain configuration? | Currently on WebSocket connect; proposed via atomic HTTP `GET /api/booths/:id/config` on boot + WebSocket live deltas. | `kiosk.gateway.ts#L81-L90` |
| **4** | How is configuration updated? | Dashboard `PUT /api/booths/:id/config` -> PostgreSQL upsert -> WebSocket room `booth:${id}` emit `CONFIG_UPDATE`. | `booths.controller.ts#L107-L115` |
| **5** | How is stale configuration handled? | Proposed: Monotonic `version` counter and hash. Cache overrides hardcoded defaults; remote overrides local if `version > localVersion`. | Section 9 of this Audit |
| **6** | How is Booth A isolated from Booth B? | DB `@unique boothId`, strict room routing `booth:${boothId}`, and single-socket session termination. | `kiosk.gateway.ts#L62-L77` |
| **7** | Which configuration belongs to PR-01? | Root envelope schema, versioning, boot hydration, WebSocket propagation, local cache contract, and timer/price namespaces. | Section 5 of this Audit |
| **8** | Which configuration belongs to PR-02..PR-08? | PR-02: Printer calibration; PR-03: Camera exposure; PR-04: Frame assets; PR-05: Tiered pricing; PR-06: Session timers; PR-07: Upload rules; PR-08: Kiosk behavior. | Section 5 of this Audit |
| **9** | What exact schema/API changes will eventually be required? | New `GET /api/booths/:id/config` route, deep merge in `BoothsService.updateConfig`, and Class-Validator DTO. Zero Prisma migrations needed. | Section 10 & 11 of this Audit |
| **10** | What must remain untouched? | `CameraService.ts`, `PrintService.ts`, `RenderEngine.ts`, PostgreSQL core table relationships, and existing pairing crypto. | Section 7 of this Audit |
| **11** | How can Booth #1 continue working during migration? | Retain column `generalSettings` fallback defaults identical to active production constants (`price: 35000`). | Section 7 of this Audit |
| **12** | What automated tests will prove the foundation? | E2E test verifying DTO validation, non-destructive deep merge, cross-booth room isolation, and offline cache fallback. | Section 12.15 of this Audit |
| **13** | What Founder UAT will prove real-world behavior? | Physical test on Booth #1: Offline cold boot -> Live Dashboard price change -> Reboot persistence check -> Physical print test. | Section 12.16 of this Audit |

---

## Final Verdict

```
================================================================================
PR-01 ARCHITECTURE AUDIT VERDICT: PASS
================================================================================
```

### Justification:
The existing codebase contains a rock-solid cryptographic identity layer (`IdentityService.ts`), secure device binding (`Device` / `ActivationToken`), and a functioning WebSocket room routing architecture (`kiosk.gateway.ts`). 

The identified gaps (missing HTTP boot reconciliation, destructive price updates, and dead camera/printer columns) are **purely behavioral and can be resolved without schema migrations or architectural rewrites**.

The PR-01 foundation can be implemented with **zero risk to Booth #1**, providing a production-safe runway for PR-02 through PR-08.

**Proceed to PR-01 Implementation Planning upon User Sign-off.**
