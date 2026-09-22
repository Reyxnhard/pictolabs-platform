# PROVISIONING RUNTIME FIX PLAN
**Document Reference**: `/docs/PROVISIONING_RUNTIME_FIX_PLAN.md`  
**Execution Date**: 2026-09-15  
**Source Audit**: `/docs/PROVISIONING_RUNTIME_AUDIT.md`  
**Standard**: Strict Zero-Architecture Redesign, Zero-Database Schema Migration, Minimal-Risk Targeted Remediation.

---

## Executive Summary

The audit in `/docs/PROVISIONING_RUNTIME_AUDIT.md` established that a fresh installation of `Pictolabs Kiosk Setup 1.0.0.exe` cannot undergo real-world provisioning because:
1. An environment detection logic flaw (`IdentityService.ts:318`) causes fresh kiosk binaries to auto-seed themselves as `Pilot Booth #1 (Grand Indonesia)` and bypass the activation screen completely.
2. An ES module export/import mismatch in `ActivationScreen.tsx` creates a fatal React white-screen crash if the activation screen is reached.
3. No API endpoint (`POST /api/booths`) or Dashboard UI interface exists to create a new booth entity in PostgreSQL, preventing the generation of pairing tokens for new physical locations without raw SQL inserts.

This plan details the surgical, minimal-risk fixes required to achieve the goal:
```text
Install EXE ──► Activation Screen ──► Enter Token ──► Activate ──► Appear In Dashboard ──► Welcome Screen
```

---

# 1. Root Cause Analysis

### A. Auto-Seed Trap (`IdentityService.ts:318`)
- **File**: `apps/kiosk/electron/services/IdentityService.ts` (lines 318–321)
- **Defective Code**:
  ```typescript
  const isDev = Boolean(app?.isPackaged === false || process.env.NODE_ENV !== 'production');
  const allowPilotAutoSeed = allowLegacyAutoSeed && (isDev || process.env.PICTOLABS_PILOT_MIGRATION === 'true');
  ```
- **Root Cause**:
  In a production Windows environment (installed via `.exe`), Windows does not set `process.env.NODE_ENV`. It is `undefined`. Because `undefined !== 'production'` evaluates to `true`, the OR condition (`app.isPackaged === false || process.env.NODE_ENV !== 'production'`) forces `isDev` to be `true` on fresh production installs.
- **Consequence**:
  On first boot without an identity file, `loadIdentity()` automatically calls `saveIdentity(...)` with `pilot-booth-01` and `dev-secret-booth-01`. The kiosk marks itself `isPaired: true`, bypasses `ActivationScreen`, and routes straight to `WelcomeScreen`.

---

### B. ActivationScreen Export Mismatch
- **File**: `apps/kiosk/src/screens/ActivationScreen.tsx` (line 8) vs `apps/kiosk/src/App.tsx` (line 12)
- **Defective Code**:
  - `ActivationScreen.tsx`: `export const ActivationScreen: React.FC<ActivationScreenProps> = ...` (Named export)
  - `App.tsx`: `import ActivationScreen from './screens/ActivationScreen';` (Default import)
- **Root Cause**:
  All other screens in `apps/kiosk/src/screens/` use `export default`. `ActivationScreen.tsx` was written with only a named export.
- **Consequence**:
  When React renders `screen === 'activation'`, `ActivationScreen` is `undefined`. React throws a fatal unhandled error: `Element type is invalid: expected a string or class/function but got: undefined`, resulting in a black/white crash screen.

---

### C. Missing Booth Creation Workflow
- **Files**: `apps/backend/src/booths/booths.controller.ts`, `apps/backend/src/booths/booths.service.ts`, `apps/dashboard/src/pages/BoothsPage.tsx`
- **Root Cause**:
  `ProvisioningService.generateToken()` requires an existing `boothId` in PostgreSQL (`where: { id: dto.boothId }`). However, there is no `POST /api/booths` endpoint and no "Create Booth" form in the Dashboard. The database schema already supports booths, but the operational entry point is missing.
- **Consequence**:
  A founder cannot provision a second booth or onboard a new venue from the Dashboard without connecting directly to PostgreSQL via terminal and running manual SQL inserts.

---

# 2. Impact Analysis

### Founder UAT Impact
- **Current Blocker**: The founder cannot test the real-world deployment flow of buying a new laptop, installing `Pictolabs Kiosk Setup.exe`, and pairing it to a new location. The laptop immediately runs as `pilot-booth-01`.
- **Post-Fix**: The founder can run `Pictolabs Kiosk Setup.exe` on any fresh laptop, see the branded activation screen, copy a code from the Dashboard, and complete pairing in under 30 seconds.

### Pilot Booth Impact
- **Protection**: Development environments must still be able to run `npm run electron:dev` without having to manually re-pair every single time.
- **Isolation**: Legacy auto-seeding will be strictly restricted to development mode (`!app.isPackaged && process.env.PICTOLABS_DEV_SEED === 'true'`). Packaged binaries will **NEVER** auto-seed under any circumstance.

### Fleet Management Impact
- **Integrity**: Every physical kiosk in the field will have its own genuine hardware GUID, cryptographic `deviceSecret`, and distinct row in the `devices` and `booths` PostgreSQL tables.
- **Visibility**: The Dashboard table will accurately reflect each physical kiosk's connectivity status (ONLINE / OFFLINE) based on individual heartbeat tokens.

---

# 3. Fix Strategy (Minimal-Risk, Zero-Redesign)

### Principle: Do NOT redesign architecture. Do NOT modify database schemas.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIX ARCHITECTURE MATRIX                         │
├──────────────────────────┬──────────────────────┬──────────────────────┤
│ Component                │ Action               │ Strategy             │
├──────────────────────────┼──────────────────────┼──────────────────────┤
│ IdentityService.ts       │ Strict isPackaged    │ If app.isPackaged,   │
│                          │ check                │ NEVER auto-seed.     │
├──────────────────────────┼──────────────────────┼──────────────────────┤
│ ActivationScreen.tsx     │ Add default export   │ export default       │
│                          │                      │ ActivationScreen;    │
├──────────────────────────┼──────────────────────┼──────────────────────┤
│ BoothsController & Serv. │ Add POST /api/booths │ Standard Prisma      │
│                          │                      │ booth.create call    │
├──────────────────────────┼──────────────────────┼──────────────────────┤
│ Dashboard BoothsPage     │ Add "New Booth" form │ Modal: Name + Branch │
│                          │ to PairDeviceModal   │ -> Pair immediately  │
└──────────────────────────┴──────────────────────┴──────────────────────┘
```

---

# 4. Exact Files To Modify

### 1. `apps/kiosk/electron/services/IdentityService.ts`
- **Changes**:
  - Update `isDev` logic:
    ```typescript
    const isPackaged = Boolean(app && app.isPackaged);
    const isDev = !isPackaged && process.env.NODE_ENV !== 'production';
    const allowPilotAutoSeed = !isPackaged && allowLegacyAutoSeed && process.env.PICTOLABS_PILOT_MIGRATION === 'true';
    ```
  - Guarantee that when `app.isPackaged === true`, `allowPilotAutoSeed` is **always `false`**.
  - If no `identity.json` exists on disk, `loadIdentity()` returns `null` cleanly without writing anything to disk.

### 2. `apps/kiosk/src/screens/ActivationScreen.tsx`
- **Changes**:
  - Add `export default ActivationScreen;` at the bottom of the file to fix the ES Module import in `App.tsx`.

### 3. `apps/backend/src/booths/booths.controller.ts` & `booths.service.ts`
- **Changes**:
  - Add `POST /api/booths` endpoint:
    ```typescript
    @Post()
    @ApiOperation({ summary: 'Create a new photobooth' })
    async createBooth(@Body() dto: CreateBoothDto) {
      return this.boothsService.create(dto);
    }
    ```
  - In `booths.service.ts`:
    ```typescript
    async create(dto: CreateBoothDto) {
      return this.prisma.booth.create({
        data: {
          name: dto.name,
          branchId: dto.branchId,
          status: 'OFFLINE',
          config: {
            create: {
              themeColor: '#3b82f6',
              countdownSeconds: 5,
              printCopiesDefault: 2,
            }
          }
        },
        include: { branch: true, config: true }
      });
    }
    ```

### 4. `apps/dashboard/src/services/boothsApi.ts`
- **Changes**:
  - Add `createBooth(data: { name: string; branchId: string })` method calling `POST /api/booths`.

### 5. `apps/dashboard/src/components/booths/PairDeviceModal.tsx`
- **Changes**:
  - Add a "Register New Booth" tab/mode in the modal:
    - User can either select an existing un-paired booth OR enter a new Booth Name (e.g. `Booth PIM 2`) and select a Branch.
    - Clicking "Generate Token" creates the booth record in backend and immediately generates the `ACT-XXXX-XXXX` token in a single smooth workflow.

---

# 5. Estimated Risk Per Change

| Change | Risk Level | Rationale & Mitigation |
| :--- | :---: | :--- |
| **`IdentityService.ts` packaging check** | **LOW** | Only changes the guard condition. Packaged kiosks become unprovisioned on fresh install as intended. Dev workstations can still use `PICTOLABS_PILOT_MIGRATION=true` if needed. |
| **`ActivationScreen.tsx` export fix** | **ZERO** | Adding `export default` resolves a syntax mismatch without altering any UI logic. |
| **`POST /api/booths` endpoint** | **LOW** | Uses existing Prisma schema and relations. Does not alter any existing database tables or constraints. |
| **Dashboard Booth Creation Form** | **LOW** | Extends `PairDeviceModal` without modifying existing booth monitoring or WebSocket state management. |

---

# 6. Founder Acceptance Criteria

The fix will be considered successful if and only if the following end-to-end user journey passes:

1. **Fresh Install Screen**:
   - Running `Pictolabs Kiosk.exe` on a machine where `%ProgramData%\Pictolabs\identity.json` does not exist **MUST** display `PICTOLABS FLEET PROVISIONING` (`ActivationScreen`), **NOT** the customer homepage.
2. **Dashboard Booth Creation**:
   - In the Dashboard (`/booths`), clicking `+ Activate New Kiosk` allows creating a new booth name (e.g., `UAT-BOOTH-02`) and displays an `ACT-XXXX-XXXX` token with a 15-minute countdown.
3. **Kiosk On-Screen Entry**:
   - Entering `ACT-XXXX-XXXX` on the kiosk virtual keypad and clicking "Aktivasi Kiosk Sekarang" successfully completes within 3 seconds.
4. **Local Hardware Persistence**:
   - `%ProgramData%\Pictolabs\identity.json` is created with DPAPI-encrypted `deviceSecret` and the new `boothId`.
5. **Dashboard Reflection**:
   - The Dashboard modal automatically shows "Hardware Berhasil Dipasangkan!", and the booth row in `/booths` displays status `ONLINE` with the machine's hostname.
6. **Homepage Transition**:
   - The kiosk automatically transitions from the activation screen to the `WelcomeScreen`, ready for customer photo sessions.

---

# 7. Validation Plan

### Phase 1: Unit & Component Validation
1. Verify `apps/kiosk` builds with `npm run build`: zero TypeScript errors on `ActivationScreen` import.
2. Verify backend endpoint `POST /api/booths` returns 201 Created and creates row in PostgreSQL.

### Phase 2: Runtime Unpaired State Probe
1. Ensure `%ProgramData%\Pictolabs\identity.json` is removed.
2. Launch packaged `Pictolabs Kiosk.exe`.
3. Capture process output and verify:
   - `[IdentityService] No identity found. Kiosk is UNPAIRED.`
   - `[App] 🔒 Kiosk unit is unpaired. Navigating to ActivationScreen.`
   - Screen renders `ActivationScreen` without any React render errors.

### Phase 3: End-to-End Handshake Probe
1. Call `POST /api/booths` to create `Test-Kiosk-UAT`.
2. Call `POST /api/provisioning/tokens/generate` to get `ACT-TEST-0001`.
3. Enter token on Kiosk via IPC `activate`.
4. Verify response: `{ success: true, boothName: 'Test-Kiosk-UAT' }`.
5. Verify Kiosk navigates to `welcome`.
6. Verify PostgreSQL `devices` table contains new paired device row with `ACTIVE` status.
7. Verify Dashboard lists booth as `ONLINE`.
