# Phase 3.3: Fleet Provisioning Architecture & Identity Design

**Document Version:** 1.0.0  
**Date:** September 13, 2026  
**Status:** Architecture Design Document (Approved for Implementation Planning)  
**Target Milestone:** Multi-Booth Scalable Production Deployment  

---

## 1. Current State Audit (Actual Source Code Evidence)

An exhaustive audit of the actual codebase reveals that kiosk identity is currently tightly coupled to a single hardcoded string, lacking device provisioning, hardware binding, and multi-tenant isolation.

### 1.1 How is the booth currently recognized?
- **Backend Recognition**: 
  - Defined in [`apps/backend/prisma/schema.prisma`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/prisma/schema.prisma#L50-L73): `model Booth` has an `id` (UUID) and `deviceSecret` (`String @unique`).
  - Lookup helper in [`apps/backend/src/booths/booths.service.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts#L75-L91):
    ```typescript
    private async findBoothByIdentifier(identifier: string, include?: any) {
      const booth = await this.prisma.booth.findFirst({
        where: {
          OR: [{ id: identifier }, { deviceSecret: identifier }],
        },
        include,
      });
      if (!booth) throw new NotFoundException(`Booth with identifier "${identifier}" not found`);
      return booth;
    }
    ```
  - Incoming HTTP requests inspect the `x-device-secret` header (e.g. [`storage.controller.ts:62`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts#L62), [`sessions.controller.ts:109`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sessions/sessions.controller.ts#L109)).
  - WebSocket gateway inspects `handshake.auth.deviceSecret` or `handshake.headers['x-device-secret']` ([`kiosk.gateway.ts:32-36`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gateway/kiosk.gateway.ts#L32-L36)).

### 1.2 How is `deviceSecret` created?
- **No Automatic Creation**: There is no API or service to generate a secure `deviceSecret`.
- **Manual Database Seeding**: Created via seed script in [`apps/backend/seed.js:16`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/seed.js#L16):
  ```javascript
  deviceSecret: 'dev-secret-booth-01'
  ```
- **Fallback Ingestion**: Hardcoded in fallback DB generation in [`apps/backend/src/payments/payments.service.ts:87`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L87):
  ```typescript
  deviceSecret: dto.boothId || 'dev-secret-booth-01'
  ```

### 1.3 How does heartbeat identify the booth?
- The kiosk runs a 30-second interval in [`apps/kiosk/electron/services/SyncEngine.ts:1000-1035`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1000-L1035):
  ```typescript
  const targetUrl = `${config.apiBaseUrl}/api/booths/${config.deviceSecret}/heartbeat`;
  ```
- The backend matches `config.deviceSecret` against `Booth.deviceSecret` or `Booth.id`, updating `last_seen`, `local_ip`, `machine_name`, and `os_version` in [`booths.service.ts:98-115`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/booths/booths.service.ts#L98-L115).

### 1.4 How is a session linked to a booth?
- **Payment Stage**: In [`SyncEngine.ts:1172`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1172), `boothId` defaults to `config.deviceSecret || 'dev-secret-booth-01'`.
- **Dangerous Payment Fallback**: In [`payments.service.ts:70-73`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/payments/payments.service.ts#L70-L73):
  ```typescript
  if (!booth) {
    booth = await this.prisma.booth.findFirst(); // Silently links to ANY first booth in database!
  }
  ```
- **Session Sync Stage**: In [`sessions.controller.ts:114-116`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/sessions/sessions.controller.ts#L114-L116):
  ```typescript
  const booth = await this.prisma.booth.findUnique({
    where: { deviceSecret: deviceSecret || 'dev-secret-booth-01' },
  });
  ```

### 1.5 Is it currently using a default booth?
- **YES, 100% hardcoded default booth.**
  - Electron main process: [`apps/kiosk/electron/main.ts:193`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/main.ts#L193):
    ```typescript
    deviceSecret: 'dev-secret-booth-01', // Should be injected via env/license in prod
    ```
  - Kiosk Admin PIN Screen: [`apps/kiosk/src/screens/AdminScreen.tsx:108`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx#L108):
    ```typescript
    const boothIdentifier = (config as any)?.deviceSecret || 'dev-secret-booth-01';
    ```

### 1.6 Can 2 kiosks use the same identity?
- **YES, with catastrophic consequences (Identity Collision & Race Conditions)**:
  1. **WebSocket Room Cross-Talk**: Both kiosks connect to Socket.io and join `booth:${booth.id}` ([`kiosk.gateway.ts:58`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/gateway/kiosk.gateway.ts#L58)). When customer pays on Kiosk 1, the `payment:settled` event fires in the shared room, potentially unblocking or disrupting Kiosk 2.
  2. **Heartbeat Flapping**: Both kiosks report heartbeats under the same `deviceSecret`. If Kiosk 1 is at Mall A (IP 192.168.1.50) and Kiosk 2 is at Mall B (IP 10.0.0.12), the database record continuously overwrites `local_ip`, `machine_name`, and hardware telemetry every 15 seconds.
  3. **Financial & Session Entanglement**: Transactions and customer photos from two different locations become associated with the same `boothId`, corrupting accounting and customer reprint workflows.

---

## 2. Multi-Tenant Fleet Domain Architecture

To support scaling from 1 to 100+ booths across multiple cities, we decouple the physical hardware machine from the logical booth entity.

```
Company (HQ Tenant)
  │
  └── Branch (Physical Store / Mall Location)
        │
        └── Booth (Logical Revenue & Session Entity, e.g., "Grand Indonesia - Booth 01")
              │
              └── Device (Physical Hardware Terminal, bound via Hardware Fingerprint)
```

### 2.1 Domain Separation: Booth vs Device

| Attribute | **Booth** (Logical Entity) | **Device** (Physical Hardware) |
|---|---|---|
| **Nature** | Business entity, commercial point of sale. | Physical laptop, mini PC, motherboard. |
| **Lifecycle** | Permanent across years of operation. | Replaced upon hardware failure or upgrade. |
| **Identifiers** | Human-readable name (`PICTO-GI-01`), UUID. | MachineGUID, MAC address, Hardware Serial. |
| **Owns** | Sales history, QRIS revenue, pricing config, sessions, vouchers. | Diagnostic CPU thermals, local IP, OS version, peripheral USB bindings. |
| **Mobility** | Fixed to a Branch location. | Can be retired, swapped, or re-paired. |

### 2.2 Core Identity Definitions

1. **Company Identity**: Top-level tenant (e.g. Pictolabs Corporate HQ). Manages enterprise billing and fleet-wide admin roles.
2. **Branch Identity**: Physical operational branch (e.g. "Grand Indonesia Mall, Jakarta"). Defines regional pricing, operating hours, and local tax rates.
3. **Booth Identity**: Self-contained photo booth unit within a branch. Holds transactional state, active paper roll count, and configuration profiles.
4. **Device Identity**: Hardware terminal registered to a booth. Holds the persistent `deviceSecret` and physical hardware fingerprint.
5. **Activation Token**: Ephemeral, single-use, cryptographically generated code (e.g. `ACT-8K2M-9P4W`) generated by an administrator to bind a fresh kiosk installation to a Booth.
6. **Device Secret**: A 256-bit cryptographically secure token (`sec_live_` + 64 hex characters) generated exclusively upon successful activation and known only to that physical machine and backend.

---

## 3. Database Schema Evolution (PostgreSQL Prisma)

### 3.1 New Entities

```prisma
model Device {
  id              String         @id @default(uuid())
  boothId         String         @unique @map("booth_id")
  booth           Booth          @relation(fields: [boothId], references: [id])
  deviceSecret    String         @unique @map("device_secret")
  machineGuid     String?        @map("machine_guid")
  macAddress      String?        @map("mac_address")
  hostname        String?        @map("hostname")
  osVersion       String?        @map("os_version")
  appVersion      String?        @map("app_version")
  status          String         @default("ACTIVE") // ACTIVE, REVOKED, DECOMMISSIONED
  pairedAt        DateTime       @default(now()) @map("paired_at")
  lastSeenAt      DateTime?      @map("last_seen_at")
  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt @map("updated_at")

  @@index([boothId])
  @@index([deviceSecret])
  @@map("devices")
}

model ActivationToken {
  id              String         @id @default(uuid())
  token           String         @unique // Format: ACT-XXXX-XXXX (Base32, 8-10 chars)
  boothId         String         @map("booth_id")
  booth           Booth          @relation(fields: [boothId], references: [id])
  createdByUserId String         @map("created_by_user_id")
  user            User           @relation(fields: [createdByUserId], references: [id])
  expiresAt       DateTime       @map("expires_at")
  usedAt          DateTime?      @map("used_at")
  usedByDeviceGuid String?       @map("used_by_device_guid")
  ipAddress       String?        @map("ip_address")
  status          String         @default("PENDING") // PENDING, CONSUMED, EXPIRED, REVOKED
  createdAt       DateTime       @default(now()) @map("created_at")

  @@index([token])
  @@index([boothId])
  @@index([status, expiresAt])
  @@map("activation_tokens")
}
```

### 3.2 Backward-Compatible `Booth` Model Refinement
- Maintain `booth.deviceSecret` as an alias mapped to `booth.device.deviceSecret` during the transition phase.
- Deprecate direct string storage of `deviceSecret` on `booths` table in favor of 1:1 relation with `devices`.

---

## 4. Local Configuration Design: SQLite vs config.json

A critical design choice for kiosk field stability is how credentials and booth identity are stored on the kiosk filesystem.

| Metric | Option 1: Plain `config.json` | Option 2: Pure `SQLite` | **Option 3: Hybrid DPAPI + SQLite WAL (Recommended)** |
|---|---|---|---|
| **Power-Cut Safety** | ❌ Prone to 0-byte corrupt writes if AC power fails mid-flush. | ✅ ACID WAL journal prevents corruption. | ✅ **Atomic WAL + OS-level file swap.** |
| **Security** | ❌ Plaintext token easily copied by unauthorized USB insertion. | ⚠️ Accessible via SQLite browser if unencrypted. | ✅ **Encrypted via Windows DPAPI (`safeStorage`).** |
| **Persistence Across Reinstall** | ⚠️ Can be wiped if `%APPDATA%` is deleted. | ❌ Wiped if `kiosk.db` is rebuilt or vacuumed. | ✅ **Stored in `%ProgramData%\Pictolabs\` with system ACL.** |
| **Field Tech Inspectability** | ✅ Easy to read JSON. | ❌ Requires SQLite CLI or DB browser. | ✅ **Metadata is readable JSON; secret is encrypted string.** |

### 4.1 Recommended Hybrid Storage Structure

1. **System Identity File**: Located at `%ProgramData%\Pictolabs\identity.json` (Windows system-wide directory, persists across Electron reinstalls and user profile wipes).
   ```json
   {
     "version": 1,
     "boothId": "bth_9a8b1c2d-3e4f-5a6b-7c8d-9e0f1a2b3c4d",
     "boothName": "Grand Indonesia - Booth 01",
     "branchId": "brn_5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b",
     "branchName": "Grand Indonesia",
     "companyId": "cmp_11223344-5566-7788-99aa-bbccddeeff00",
     "apiBaseUrl": "https://api.pictolabs.id",
     "pairedAt": "2026-09-13T10:15:30.000Z",
     "deviceSecretEncrypted": "1f8a7e4b... (DPAPI encrypted ciphertext)"
   }
   ```
2. **SQLite Runtime Mirror**: Mirrored into SQLite `kiosk_identity` table on boot for ultra-fast, in-memory atomic queries by `SyncEngine` without disk I/O latency.
3. **Electron `safeStorage` Integration**:
   - In production on Windows, `safeStorage.encryptString(deviceSecret)` binds the credential to the Windows DPAPI master key of the local machine account.
   - Even if an attacker clones the SSD or copies `identity.json` to another laptop, the `deviceSecret` cannot be decrypted on foreign hardware.

---

## 5. Security Architecture & Threat Matrix

| Threat Vector | Severity | Vulnerability Mechanism | Phase 3.3 Mitigations |
|---|---|---|---|
| **Activation Code Leakage** | HIGH | Code observed over technician's shoulder or intercepted in chat. | • 15-minute strict TTL.<br>• Single-use consumption (atomic DB transaction).<br>• Rate limited: 5 failed attempts locks IP for 15 mins.<br>• Base32 character set (excludes ambiguous 0/O, 1/I/L). |
| **Booth Impersonation** | CRITICAL | Malicious kiosk using another booth's `deviceSecret`. | • Hardware binding: MachineGUID and MAC checked on heartbeat.<br>• WebSocket Single-Connection Policy: Connecting a duplicate `deviceSecret` kicks existing socket and triggers high-severity security alert. |
| **Device Secret Theft via Disk Theft** | HIGH | Physical theft of hard drive or rogue technician copying files. | • Windows DPAPI (`safeStorage`) hardware-tied encryption.<br>• Remote Revocation API immediately blacklists token in backend. |
| **Replay & MitM Attacks** | HIGH | Intercepting sync traffic or replaying payment webhooks. | • Mandatory TLS 1.3 / HTTPS / WSS.<br>• Header timestamps verified ($\Delta t < 60$s).<br>• HMAC signature on sensitive commands. |

---

## 6. Verification & Acceptance Criteria
1. **Zero Hardcoded Identity**: No default string (`dev-secret-booth-01`) exists in kiosk or backend source code.
2. **Unpaired Boot Detection**: Fresh kiosk boots into Provisioning Wizard if no local identity is detected.
3. **One-Time Handshake**: Activation token expires immediately upon first pairing and cannot be reused.
4. **Multi-Booth Isolation**: Two booths running concurrently have separate WebSocket rooms, distinct heartbeats, and zero cross-talk.
