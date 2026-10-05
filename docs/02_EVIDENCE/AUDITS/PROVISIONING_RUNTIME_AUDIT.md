# AUDIT RUNTIME PROVISIONING & FLEET REGISTRATION
**Document Reference**: `/docs/PROVISIONING_RUNTIME_AUDIT.md`  
**Execution Timestamp**: 2026-09-15T04:16:00Z  
**Target Investigation**: Kiosk Provisioning Lifecycle, Activation Screen Trigger, Device Secret Handshake, and Dashboard Fleet Visibility  
**Audit Standard**: Static Code Trace + Database State Inspection + Runtime Logic Verification. Zero Assumptions.

---

## Executive Summary

This audit evaluated how a newly installed Pictolabs Kiosk binary (`Pictolabs Kiosk Setup 1.0.0.exe`) transitions from an unprovisioned machine into an active, registered device visible in the Admin Dashboard.

### Primary Audit Findings:
1. **The Provisioning Screen is Blocked by an Auto-Seed Bug**:
   On a fresh installation, the kiosk software **never displays the Activation Screen**. Instead, it automatically executes a legacy auto-seed migration, pretending to be `Pilot Booth #1 (Grand Indonesia)` with `dev-secret-booth-01`, saves this identity to `%ProgramData%\Pictolabs\identity.json`, and navigates straight to the customer `WelcomeScreen`.
2. **Missing Booth Creation Infrastructure**:
   Neither the NestJS Backend API nor the Dashboard React UI contains any endpoint or interface to create a new `Booth` entity (`POST /api/booths` does not exist). The activation flow assumes a booth already exists in PostgreSQL before a token can be generated.
3. **Activation Screen Export Mismatch Crash Hazard**:
   In `ActivationScreen.tsx`, the component is exported as a named export (`export const ActivationScreen`), but in `App.tsx:12`, it is imported as a default import (`import ActivationScreen from './screens/ActivationScreen'`). If an unprovisioned state were reached, React would crash with an `Element type is invalid: got undefined` fatal error.

---

# Question 1: What is the intended provisioning flow?

The intended architecture follows an out-of-band paired handshake:

```
Admin Dashboard (Web)                         Physical Kiosk Unit (Windows Laptop)
       │                                                      │
       │ 1. Admin clicks "Pair Device" on a Booth             │
       │    POST /api/provisioning/tokens/generate            │
       │ ───► Generates ACT-XXXX-XXXX (15-min TTL)            │
       │                                                      │
       │                                                      │ 2. Fresh kiosk powers on
       │                                                      │    kiosk.identity.getStatus() -> isPaired: false
       │                                                      │    Displays fullscreen ActivationScreen
       │                                                      │
       │                                                      │ 3. Operator enters token ACT-XXXX-XXXX
       │                                                      │    and Backend URL (https://api.pictolabs.id)
       │                                                      │    Clicks "Aktivasi Kiosk Sekarang"
       │                                                      │
       │                                                      │ 4. Kiosk calls Backend:
       │                                                      │    POST /api/provisioning/activate
       │                                                      │    Payload: { token, deviceFingerprint }
       │                                                      │
       │ 5. Backend validates token:                          │
       │    - Marks token as CONSUMED                         │
       │    - Creates Device record in PostgreSQL             │
       │    - Generates high-entropy deviceSecret             │
       │    - Returns { success: true, boothId, deviceSecret }│
       │                                                      │
       │                                                      │ 6. Kiosk persists identity:
       │                                                      │    - Encrypts deviceSecret with Windows DPAPI
       │                                                      │    - Writes %ProgramData%\Pictolabs\identity.json
       │                                                      │    - Mirrors to SQLite (kiosk.db: kiosk_identity)
       │                                                      │    - Updates SyncEngine credentials
       │                                                      │    - Navigates to WelcomeScreen (homepage)
       │                                                      │
       │ 7. Dashboard polls / receives token consumed:        │
       │    - Modal shows "Hardware Berhasil Dipasangkan"     │
       │    - Booth status transitions to ONLINE              │
```

---

# Question 2: What screen should appear on a fresh install?

### Expected Screen:
**`ActivationScreen` (`PICTOLABS FLEET PROVISIONING`)**
- **File**: `apps/kiosk/src/screens/ActivationScreen.tsx`
- **UI Elements**:
  - Fullscreen dark backdrop (`#0F172A`)
  - Subtitle: *"Kiosk ini belum terhubung ke sistem cloud Pictolabs. Masukkan kode aktivasi 8-karakter dari Dashboard Booth Management."*
  - Formatted input box for `ACT-XXXX-XXXX`
  - On-screen touch keypad (`2-9`, `A-Z`) eliminating physical keyboard requirement
  - Backend API Base URL configuration field
  - Action button: *"Aktivasi Kiosk Sekarang"*

---

# Question 3: What condition causes the provisioning screen to appear?

In `apps/kiosk/src/App.tsx:98-108`:
```typescript
// Check booth pairing & provisioning status on mount (Phase 3.3)
useEffect(() => {
  kiosk.identity?.getStatus?.().then((status) => {
    if (status && !status.isPaired) {
      console.log('[App] 🔒 Kiosk unit is unpaired. Navigating to ActivationScreen.');
      setScreen('activation');
    }
  }).catch((err) => {
    console.warn('[App] Identity status check warning:', err);
  });
}, []);
```

### Necessary Conditions for ActivationScreen to Appear:
1. `kiosk.identity.getStatus()` must return a DTO where `isPaired === false`.
2. In `apps/kiosk/electron/services/IdentityService.ts:368-402`:
   `isPaired` is evaluated as `Boolean(activeIdentity?.boothId && activeDeviceSecret)`.
3. Therefore, `ActivationScreen` only renders if:
   - `%ProgramData%\Pictolabs\identity.json` does **NOT** exist.
   - The local SQLite table `kiosk_identity` does **NOT** have a valid row with `id = 1`.
   - `loadIdentity()` fails to load any active identity.

---

# Question 4: Why does a fresh install go directly to the homepage?

**This is the core defect.** Trace of `apps/kiosk/electron/services/IdentityService.ts:317-334`:

```typescript
// Backward compatibility migration for Pilot Booth #1
const isDev = Boolean(app?.isPackaged === false || process.env.NODE_ENV !== 'production');
const allowPilotAutoSeed = allowLegacyAutoSeed && (isDev || process.env.PICTOLABS_PILOT_MIGRATION === 'true');
if (allowPilotAutoSeed) {
  console.log('[IdentityService] ℹ️ Auto-migrating legacy Pilot Booth #1 (dev-secret-booth-01)');
  return saveIdentity(
    {
      boothId: 'pilot-booth-01',
      boothName: 'Pilot Booth #1 (Grand Indonesia)',
      branchId: 'branch-gi-01',
      branchName: 'Grand Indonesia Mall',
      companyId: 'comp-default',
      location: 'West Mall Fl. 3',
      apiBaseUrl: defaultApiUrl,
    },
    'dev-secret-booth-01'
  );
}
```

### The Exact Failure Chain:
1. When a user runs `Pictolabs Kiosk Setup 1.0.0.exe` on a fresh retail Windows machine, `app.isPackaged` is `true`.
2. However, Windows does **NOT** set `process.env.NODE_ENV`. It is `undefined`.
3. The expression `process.env.NODE_ENV !== 'production'` evaluates to **`true`**!
4. Due to the OR operator (`app?.isPackaged === false || process.env.NODE_ENV !== 'production'`), `isDev` evaluates to **`true`**.
5. Consequently, `allowPilotAutoSeed` evaluates to **`true`**.
6. On the first launch, `loadIdentity()` detects that no file exists, but instead of returning `null`, it immediately calls `saveIdentity(...)`.
7. `saveIdentity(...)` generates `%ProgramData%\Pictolabs\identity.json`, encrypts `dev-secret-booth-01` via DPAPI, and marks `isPaired: true`.
8. When the React renderer mounts `App.tsx`, `kiosk.identity.getStatus()` returns `isPaired: true`.
9. The check `if (status && !status.isPaired)` evaluates to `false`.
10. `screen` remains in its initial `useState` value: `'welcome'`!
11. The customer homepage is displayed immediately, completely bypassing registration.

---

# Question 5: Is provisioning optional or mandatory?

| Perspective | Status | Description |
| :--- | :---: | :--- |
| **Architectural Intent** | **MANDATORY** | Every physical unit must authenticate with an immutable, cryptographically generated `deviceSecret` tied to a specific `Booth` and `Branch`. |
| **Current Code Reality** | **OPTIONAL / BYPASSED** | Because of the auto-seed trap in `IdentityService.ts`, every unprovisioned machine automatically impersonates `pilot-booth-01` with `dev-secret-booth-01`. Furthermore, `sessions.controller.ts` does not reject unauthenticated uploads (error swallowing). |

---

# Question 6: How does a booth become visible in Dashboard?

In `apps/backend/src/booths/booths.service.ts:226-262`:
```typescript
async findAllWithStatus() {
  const booths = await this.prisma.booth.findMany({
    include: {
      branch: true,
      config: true,
      device: true,
    },
    orderBy: { updatedAt: 'desc' },
  });
...
```

A booth becomes visible in the Dashboard table (`/booths`) **ONLY IF A RECORD ALREADY EXISTS IN THE `booths` TABLE IN POSTGRESQL**.

### Current Database State:
Querying `docker exec pictolabs-postgres psql -U pictolabs -d pictolabs -c "SELECT id, name, status FROM booths;"`:
```text
                  id                  |       name       |   status    
--------------------------------------+------------------+-------------
 80e05c47-50f9-4d8a-a6f5-a958f1be5df3 | PICTOLABS-DEV-01 | MAINTENANCE
(1 row)
```

**CRITICAL FINDING**: There is **NO `POST /api/booths` API ENDPOINT** and **NO "Create Booth" UI FORM** anywhere in the codebase.
- The Dashboard only allows pairing a physical laptop to a booth that is *already registered* in PostgreSQL.
- If a founder wants to add a 2nd booth (e.g., "Grand Indonesia 02"), there is no mechanism in the Dashboard to create it. It can only be inserted via raw SQL or database seed scripts.

---

# Question 7: What exact founder UAT steps are required to register a new booth?

Under the current implementation, the exact workflow required is:

### Step 1: Manual Database Creation (Workaround for Missing API)
Because there is no "Create Booth" UI button, the founder must execute an SQL insert:
```sql
INSERT INTO booths (id, name, "branchId", status, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Pictolabs Booth GI-02',
  'branch-gi-01',
  'OFFLINE',
  NOW(),
  NOW()
);
```

### Step 2: Generate Activation Token in Dashboard
1. Open Admin Dashboard at `http://localhost:5173/booths`.
2. Locate the new booth (`Pictolabs Booth GI-02`).
3. Click the **"Pair Device"** button on the booth row (or click **"+ Activate New Kiosk"** in the top toolbar and select `Pictolabs Booth GI-02`).
4. Dashboard calls `POST /api/provisioning/tokens/generate`.
5. Dashboard renders modal showing:
   - Activation Code: `ACT-XXXX-XXXX`
   - Expiration Countdown: `14:59`
   - Status: `Menunggu Aktivasi Hardware...`

### Step 3: Launch Fresh Kiosk (Requires Clearing Auto-Seeded Identity)
1. On the kiosk laptop, delete any existing auto-seeded identity:
   `Remove-Item -Force C:\ProgramData\Pictolabs\identity.json`
2. Launch `Pictolabs Kiosk.exe`.
3. Kiosk mounts, detects `isPaired: false`, and renders `ActivationScreen`.

### Step 4: Enter Token on Kiosk
1. On the touchscreen keypad, the technician types `ACT-XXXX-XXXX`.
2. Ensures the Backend URL points to the server (e.g., `https://api.pictolabs.id`).
3. Clicks **"Aktivasi Kiosk Sekarang"**.

### Step 5: Backend Handshake & Confirmation
1. Kiosk sends `POST /api/provisioning/activate` with hardware fingerprint.
2. Backend matches token, saves `Device` in PostgreSQL, issues `deviceSecret`.
3. Kiosk saves identity via DPAPI and switches to `WelcomeScreen`.
4. Dashboard polling detects `TOKEN_CONSUMED` and transitions the booth to **ONLINE**.

---

# Question 8: Is there currently any broken runtime path preventing registration?

### **YES. Three critical broken runtime paths exist:**

### 1. The Auto-Seed Hijack (`apps/kiosk/electron/services/IdentityService.ts:318`)
- **Bug**: `Boolean(app?.isPackaged === false || process.env.NODE_ENV !== 'production')`
- **Impact**: Evaluates to `true` on clean retail machines because `process.env.NODE_ENV` is undefined. It seeds `pilot-booth-01` into `%ProgramData%\Pictolabs\identity.json` before the UI can even check pairing status.
- **Consequence**: The kiosk **never shows the Activation Screen**. It boots directly to the customer homepage.

### 2. The Missing Booth Creation Endpoint (`apps/backend/src/booths/booths.controller.ts`)
- **Bug**: No `POST /api/booths` endpoint exists.
- **Impact**: An administrator in the Dashboard cannot create a new booth entity.
- **Consequence**: A founder cannot register a new physical photobooth location from the web UI.

### 3. Named vs Default Export Crash in `ActivationScreen`
- **Bug**: `apps/kiosk/src/screens/ActivationScreen.tsx:8` defines `export const ActivationScreen: React.FC<...>`, but `apps/kiosk/src/App.tsx:12` imports it via `import ActivationScreen from './screens/ActivationScreen'`.
- **Impact**: In ES Modules / Vite, default importing a module without a default export resolves to `undefined`.
- **Consequence**: If a machine actually enters the unpaired state (`screen = 'activation'`), **React crashes with a white-screen fatal error** (`Element type is invalid: expected a component but got undefined`).

---

# Final Summary Table

| Audit Question | Audit Result | Severity |
| :--- | :--- | :---: |
| **Intended Flow** | Dashboard Generates Token $\rightarrow$ Kiosk Inputs Token $\rightarrow$ Backend Binds Hardware $\rightarrow$ Kiosk Encrypts Secret via DPAPI. | Defined |
| **Screen on Fresh Install** | Should be `ActivationScreen`, but currently renders `WelcomeScreen`. | **CRITICAL** |
| **Trigger Condition** | `kiosk.identity.getStatus().isPaired === false`. | Designed |
| **Why Fresh Goes to Home** | `IdentityService.ts:318` falsely evaluates `isDev=true` and auto-creates `pilot-booth-01`. | **CRITICAL** |
| **Provisioning Mode** | Designed as Mandatory, but effectively Bypassed. | **HIGH** |
| **Dashboard Visibility** | Requires a row in PostgreSQL `booths` table. | Verified |
| **Founder UAT Steps** | Requires manual SQL insert due to missing `POST /api/booths`. | **HIGH** |
| **Broken Paths** | 1) Auto-seed hijack, 2) Missing `POST /api/booths`, 3) Export mismatch crash. | **CRITICAL** |
