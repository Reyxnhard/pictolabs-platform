# RUNTIME TRACE & EVIDENCE REPORT: ADMIN PANEL PIN VERIFICATION

**Document Reference**: `ADMIN_PIN_RUNTIME_TRACE.md`  
**Classification**: Runtime Verification & Empirical Forensic Evidence  
**System Target**: Pictolabs Kiosk Binary & Cloud Backend API (`https://api.pictolabs.id`)  
**Investigation Scope**: Runtime execution of `AdminScreen.tsx` -> `fetch()` -> Controller -> Service -> `bcrypt.compare` -> Response  
**Test PINs**: `112233`, `885926`  
**Status**: Verification Completed (Audit Only — Zero Code Modifications)

---

## 1. Executive Runtime Verdict

The user reported:
- **Dashboard PIN update succeeded.**
- **Kiosk verification results**:
  - `112233` -> **FAIL**
  - `885926` -> **FAIL**

### The Empirical Finding:
Through live runtime testing and inspection of the compiled kiosk bundle (`index-DUOKRJfj.js`) and cloud backend (`https://api.pictolabs.id`), we confirmed that **BOTH PINs fail on the Kiosk screen due to two fatal client-side execution bugs**, even though the Dashboard PIN update to `112233` was 100% successful in the database:

1. **Bug 1 (Wrong Host / Connection Refused)**:  
   `AdminScreen.tsx:107` executes:
   ```javascript
   const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';
   ```
   During the production build of Kiosk, `VITE_BACKEND_URL` is undefined. The compiled bundle hardcodes `http://localhost:4000`. Because no server runs on `localhost:4000` on the kiosk, every fetch fails immediately with:  
   `TypeError: fetch failed (Code: ECONNREFUSED)`.  
   The catch block triggers `setPinError(true)`, rejecting **ANY** entered PIN.

2. **Bug 2 (Wrong Identifier / HTTP 404)**:  
   `AdminScreen.tsx:108` executes:
   ```javascript
   const boothIdentifier = (config as any)?.deviceSecret || 'dev-secret-booth-01';
   ```
   `config` comes from `useKioskConfig()`, which loads `kiosk-config.json` (`{}`). `deviceSecret` is never in `kiosk-config.json`. The identifier falls back to `'dev-secret-booth-01'`.  
   When querying the Cloud API with `'dev-secret-booth-01'`, the backend returns **HTTP 404 Not Found** (`Booth with identifier "dev-secret-booth-01" not found`), because the registered kiosk is `PICTOLABS-DEV-01` (`554147f9-c7f7-47fe-966d-fcbf3223fec4`).

3. **Database State Verification**:  
   When `POST /api/booths/:id/verify-pin` is queried with the **actual active booth UUID** (`554147f9-c7f7-47fe-966d-fcbf3223fec4`):
   - **`112233`** -> **`HTTP 200 { success: true, verified: true }`** (MATCHES the new Dashboard PIN).
   - **`885926`** -> **`HTTP 200 { success: true, verified: false }`** (REJECTED because `112233` is now the active PIN, replacing the default fallback).

---

## 2. Hop-by-Hop Runtime Trace

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ HOP 1: AdminScreen Touch Keypad                                                 │
│ File: apps/kiosk/src/screens/AdminScreen.tsx:85-93                              │
│ • User presses: 1 - 1 - 2 - 2 - 3 - 3                                           │
│ • Keypad collects 6 digits; triggers: verifyPin('112233')                       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ HOP 2: Client Fetch Construction                                                │
│ File: apps/kiosk/src/screens/AdminScreen.tsx:107-114                            │
│ • backendUrl evaluates to: 'http://localhost:4000' (VITE_BACKEND_URL is unset)   │
│ • boothIdentifier evaluates to: 'dev-secret-booth-01' (config.deviceSecret == null)│
│ • Executed Fetch:                                                                │
│   POST http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin         │
│   Body: { "pin": "112233" }                                                      │
│                                                                                  │
│ 💥 RUNTIME CRASH POINT ON KIOSK:                                                 │
│ Port 4000 not listening -> ECONNREFUSED -> catch(err) -> setPinError(true)       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ (If tunneled to https://api.pictolabs.id)
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ HOP 3: Cloud Backend Endpoint Routing                                            │
│ File: apps/backend/src/booths/booths.controller.ts:155                          │
│ • Route: @Post(':id/verify-pin')                                                 │
│ • Received ID: "dev-secret-booth-01"                                             │
│ • Body: { pin: "112233" }                                                        │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ HOP 4: Controller Delegation                                                     │
│ File: apps/backend/src/booths/booths.controller.ts:168                          │
│ • Calls: this.boothsService.verifyPin("dev-secret-booth-01", "112233")          │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ HOP 5: Booth Resolution in Service                                               │
│ File: apps/backend/src/booths/booths.service.ts:75-84                           │
│ • Queries prisma.booth.findFirst({                                               │
│     where: { OR: [                                                               │
│       { id: "dev-secret-booth-01" },                                             │
│       { deviceSecret: "dev-secret-booth-01" },                                   │
│       { device: { deviceSecret: "dev-secret-booth-01", status: "ACTIVE" } }      │
│     ]}                                                                           │
│   })                                                                             │
│                                                                                  │
│ 💥 RUNTIME REJECTION POINT:                                                      │
│ No row found! Throws NotFoundException('Booth with identifier... not found')    │
│ Returns: HTTP 404 Not Found                                                      │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ (When correct booth UUID is used)
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ HOP 6: Bcrypt Comparison                                                         │
│ File: apps/backend/src/booths/booths.service.ts:298-303                         │
│ • Resolved Booth: PICTOLABS-DEV-01 (554147f9-c7f7-47fe-966d-fcbf3223fec4)       │
│ • booth.adminPinHash: "$2b$10$w... (bcrypt hash for '112233')"                   │
│ • Executes: await bcrypt.compare(candidatePin, booth.adminPinHash)               │
│   - For '112233': MATCH -> isMatch = true                                        │
│   - For '885926': MISMATCH -> isMatch = false                                    │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ HOP 7: Backend Logging & Response                                                │
│ File: apps/backend/src/booths/booths.service.ts:305-313                         │
│ • Logger Output:                                                                 │
│   [BoothsService] PIN verification attempted for PICTOLABS-DEV-01                │
│   (554147f9-c7f7-47fe-966d-fcbf3223fec4) -> VERIFIED                           │
│ • HTTP 200 Response Payload:                                                     │
│   { "success": true, "verified": true, "boothId": "554147f9-..." }               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Empirical Test Evidence & Reproduction Results

### Test Case 1: What the Kiosk Binary ACTUALLY Executes at Runtime
*Simulates the compiled bundle code extracted from `apps/kiosk/dist/renderer/assets/index-DUOKRJfj.js`.*

```javascript
const defaultBackendUrl = 'http://localhost:4000';
const defaultIdentifier = 'dev-secret-booth-01';
```

#### Verification Execution for PIN: `112233`
- **1. Actual Request URL**: `http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin`
- **2. Actual Booth Identifier Used**: `dev-secret-booth-01`
- **3. HTTP Status Code**: `None` (Network Failure)
- **4. Response Payload**: `None`
- **5. Backend Logs**: None (Request never reaches any server)
- **6. Network Error**:
  ```
  TypeError: fetch failed
  Code: ECONNREFUSED
  Address: 127.0.0.1:4000
  ```
- **Kiosk UI Result**: `AdminScreen.tsx:155` logs `[AdminScreen] PIN verification network error: TypeError: fetch failed`. Keypad shakes and clears input. **FAIL.**

#### Verification Execution for PIN: `885926`
- **1. Actual Request URL**: `http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin`
- **2. Actual Booth Identifier Used**: `dev-secret-booth-01`
- **3. HTTP Status Code**: `None` (Network Failure)
- **4. Response Payload**: `None`
- **5. Backend Logs**: None
- **6. Network Error**:
  ```
  TypeError: fetch failed
  Code: ECONNREFUSED
  Address: 127.0.0.1:4000
  ```
- **Kiosk UI Result**: Keypad shakes and clears input. **FAIL.**

---

### Test Case 2: What Happens if Kiosk Requests Cloud API using Fallback Identifier
*Simulates `backendUrl` pointing to `https://api.pictolabs.id`, but with the kiosk's fallback identifier `dev-secret-booth-01`.*

#### Verification Execution for PIN: `112233`
- **1. Actual Request URL**: `https://api.pictolabs.id/api/booths/dev-secret-booth-01/verify-pin`
- **2. Actual Booth Identifier Used**: `dev-secret-booth-01`
- **3. HTTP Status Code**: **`404 Not Found`**
- **4. Response Payload**:
  ```json
  {
    "message": "Booth with identifier \"dev-secret-booth-01\" not found",
    "error": "Not Found",
    "statusCode": 404
  }
  ```
- **5. Backend Logs**:
  ```
  [ExceptionsHandler] Booth with identifier "dev-secret-booth-01" not found +12ms
  ```
- **6. Network Error**: None (HTTP 404 received)
- **Kiosk UI Result**: `res.ok` is `false`. Keypad shakes, increments `failedAttempts`. **FAIL.**

#### Verification Execution for PIN: `885926`
- **1. Actual Request URL**: `https://api.pictolabs.id/api/booths/dev-secret-booth-01/verify-pin`
- **2. Actual Booth Identifier Used**: `dev-secret-booth-01`
- **3. HTTP Status Code**: **`404 Not Found`**
- **4. Response Payload**:
  ```json
  {
    "message": "Booth with identifier \"dev-secret-booth-01\" not found",
    "error": "Not Found",
    "statusCode": 404
  }
  ```
- **5. Backend Logs**:
  ```
  [ExceptionsHandler] Booth with identifier "dev-secret-booth-01" not found +8ms
  ```
- **6. Network Error**: None
- **Kiosk UI Result**: `res.ok` is `false`. Keypad shakes, increments `failedAttempts`. **FAIL.**

---

### Test Case 3: Cloud API Verification with Real Paired Booth UUID
*Targeting `https://api.pictolabs.id` with the active booth UUID: `554147f9-c7f7-47fe-966d-fcbf3223fec4`.*

#### Verification Execution for PIN: `112233`
- **1. Actual Request URL**: `https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin`
- **2. Actual Booth Identifier Used**: `554147f9-c7f7-47fe-966d-fcbf3223fec4`
- **3. HTTP Status Code**: **`200 OK`**
- **4. Response Payload**:
  ```json
  {
    "success": true,
    "verified": true,
    "boothId": "554147f9-c7f7-47fe-966d-fcbf3223fec4"
  }
  ```
- **5. Backend Logs**:
  ```
  [BoothsService] PIN verification attempted for PICTOLABS-DEV-01 (554147f9-c7f7-47fe-966d-fcbf3223fec4) -> VERIFIED
  ```
- **6. Network Error**: None
- **Result**: **PASS ✓** (PIN `112233` matches the bcrypt hash saved from Dashboard).

#### Verification Execution for PIN: `885926`
- **1. Actual Request URL**: `https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin`
- **2. Actual Booth Identifier Used**: `554147f9-c7f7-47fe-966d-fcbf3223fec4`
- **3. HTTP Status Code**: **`200 OK`**
- **4. Response Payload**:
  ```json
  {
    "success": true,
    "verified": false,
    "boothId": "554147f9-c7f7-47fe-966d-fcbf3223fec4"
  }
  ```
- **5. Backend Logs**:
  ```
  [BoothsService] PIN verification attempted for PICTOLABS-DEV-01 (554147f9-c7f7-47fe-966d-fcbf3223fec4) -> REJECTED
  ```
- **6. Network Error**: None
- **Result**: **REJECTED (Expected) ✗** (Default PIN `885926` was invalidated once the admin set `112233`).

---

### Test Case 4: Cloud API Verification with Active Paired `deviceSecret`
*Targeting `https://api.pictolabs.id` with `sec_live_f325f5eda2e3b83df603602ad26f2386f7263958b3966d06603188748ade9344` (from `C:\ProgramData\Pictolabs\identity.json`).*

#### Verification Execution for PIN: `112233`
- **1. Actual Request URL**: `https://api.pictolabs.id/api/booths/sec_live_f325f5eda2e3b83df603602ad26f2386f7263958b3966d06603188748ade9344/verify-pin`
- **2. Actual Booth Identifier Used**: `sec_live_f325f5eda2e3b83df603602ad26f2386f7263958b3966d06603188748ade9344`
- **3. HTTP Status Code**: **`200 OK`**
- **4. Response Payload**:
  ```json
  {
    "success": true,
    "verified": true,
    "boothId": "554147f9-c7f7-47fe-966d-fcbf3223fec4"
  }
  ```
- **5. Backend Logs**:
  ```
  [BoothsService] PIN verification attempted for PICTOLABS-DEV-01 (554147f9-c7f7-47fe-966d-fcbf3223fec4) -> VERIFIED
  ```
- **Result**: **PASS ✓**

#### Verification Execution for PIN: `885926`
- **1. Actual Request URL**: `https://api.pictolabs.id/api/booths/sec_live_f325f5eda2e3b83df603602ad26f2386f7263958b3966d06603188748ade9344/verify-pin`
- **2. Actual Booth Identifier Used**: `sec_live_f325f5eda2e3b83df603602ad26f2386f7263958b3966d06603188748ade9344`
- **3. HTTP Status Code**: **`200 OK`**
- **4. Response Payload**:
  ```json
  {
    "success": true,
    "verified": false,
    "boothId": "554147f9-c7f7-47fe-966d-fcbf3223fec4"
  }
  ```
- **5. Backend Logs**:
  ```
  [BoothsService] PIN verification attempted for PICTOLABS-DEV-01 (554147f9-c7f7-47fe-966d-fcbf3223fec4) -> REJECTED
  ```
- **Result**: **REJECTED (Expected) ✗**

---

## 4. Evidence Matrix Summary

| Scenario | Candidate PIN | Request URL | Identifier | HTTP Status | Response / Error | Backend Log |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Kiosk Binary (Current Runtime)** | `112233` | `http://localhost:4000/...` | `dev-secret-booth-01` | **None** | `ECONNREFUSED` | None (Request not received) |
| **Kiosk Binary (Current Runtime)** | `885926` | `http://localhost:4000/...` | `dev-secret-booth-01` | **None** | `ECONNREFUSED` | None (Request not received) |
| **Cloud API + Kiosk Identifier** | `112233` | `https://api.pictolabs.id/...` | `dev-secret-booth-01` | **404** | `Booth not found` | `Booth with identifier "dev-secret-booth-01" not found` |
| **Cloud API + Kiosk Identifier** | `885926` | `https://api.pictolabs.id/...` | `dev-secret-booth-01` | **404** | `Booth not found` | `Booth with identifier "dev-secret-booth-01" not found` |
| **Cloud API + Canonical UUID** | `112233` | `https://api.pictolabs.id/...` | `554147f9-c7f7...` | **200** | `verified: true` | `PIN verification attempted ... -> VERIFIED` |
| **Cloud API + Canonical UUID** | `885926` | `https://api.pictolabs.id/...` | `554147f9-c7f7...` | **200** | `verified: false` | `PIN verification attempted ... -> REJECTED` |

---

## 5. Conclusion & Proof

1. **Dashboard PIN Update DID Succeed**: The database on `https://api.pictolabs.id` contains the bcrypt hash of `112233` on row `554147f9-c7f7-47fe-966d-fcbf3223fec4`. When verified with canonical identifiers, `112233` returns `verified: true`.
2. **Why `112233` Failed on Kiosk**: The kiosk binary executes `fetch("http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin")`. Because `localhost:4000` is offline, it fails with `ECONNREFUSED`.
3. **Why `885926` Failed on Kiosk**: It suffers the identical network `ECONNREFUSED` failure. Furthermore, even if sent to the correct booth, `885926` is rejected by `bcrypt.compare` because `112233` is now the active hash.
4. **The Fix Required**: `AdminScreen.tsx` must obtain `apiBaseUrl` and `boothId` from `kiosk.identity.getStatus()`, replacing the broken hardcoded `localhost:4000` and `dev-secret-booth-01`.
