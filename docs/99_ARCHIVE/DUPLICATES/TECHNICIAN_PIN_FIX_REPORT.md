# TECHNICIAN PIN FIX REPORT
**Document ID:** `TECHNICIAN_PIN_FIX_REPORT.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Flow:** Technician Admin PIN Authentication on Kiosk  
**Date:** September 23, 2026  
**Status:** VERIFIED & PASS (Pilot-Ready Fix Implemented)

---

## 1. Executive Summary

The Root Cause identified in [`TECHNICIAN_PIN_SYNC_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/TECHNICIAN_PIN_SYNC_RCA.md) has been resolved. The Kiosk Operator Access keypad now dynamically discovers the paired booth credentials, completely eliminates `localhost:4000` fallback in production runtime, and directs verification calls to the production Cloud API.

### Test Results Summary

| Test Case | Candidate PIN | Target Endpoint | HTTP Status | Verification Result | UI State |
| :--- | :---: | :--- | :---: | :---: | :--- |
| **Wrong / Old PIN** | `885926` | `https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin` | **200 OK** | `{ verified: false }` | Keypad shakes red; panel remains locked |
| **Active Dashboard PIN** | `112233` | `https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin` | **200 OK** | `{ verified: true }` | **PASS — Instant unlock to Operator Control Panel** |

---

## 2. Root Cause Fixed

### The Core Problem
1. In the legacy kiosk bundle installed at `C:\Program Files\Pictolabs Kiosk\resources\app.asar` (compiled on `2026-09-22 02:19 UTC`):
   - The target endpoint fell back unconditionally to `http://localhost:4000/api/booths/dev-secret-booth-01/verify-pin`.
   - On a standalone kiosk without a local NestJS dev server running on port 4000, all requests threw `ECONNREFUSED` / Network Error.
   - The error catch block caught the exception and set `pinError: true`, causing the keypad to shake and reject the PIN, regardless of whether the entered PIN was correct.
2. Even after restarting the kiosk (Test C), the desktop/start menu shortcut re-executed the identical stale binary in `C:\Program Files\Pictolabs Kiosk\`, repeating the failure.

### Code Fix Applied
In [`apps/kiosk/src/screens/AdminScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx):
1. **Authoritative Endpoint Discovery**:
   Integrated `resolveTargetEndpoint()` which dynamically reads the paired booth credentials directly from Electron's IPC bridge `kiosk.identity.getStatus()` (backed by `kiosk.db` and `C:\ProgramData\Pictolabs\identity.json`).
   - Resolves `boothId`: `"554147f9-c7f7-47fe-966d-fcbf3223fec4"`
   - Resolves `apiBaseUrl`: `"https://api.pictolabs.id"`
2. **Strict Removal of Localhost in Production**:
   Line 120 was modified so that in production runtime (`!isDev`), the backend URL strictly defaults to `'https://api.pictolabs.id'`:
   ```typescript
   const isDev = Boolean((import.meta as any).env?.DEV);
   const backendUrl =
     activeId?.apiBaseUrl ||
     (config as any)?.apiBaseUrl ||
     ((import.meta as any).env?.VITE_BACKEND_URL as string) ||
     (isDev ? 'http://localhost:4000' : 'https://api.pictolabs.id');

   const boothIdentifier =
     activeId?.boothId ||
     (config as any)?.boothId ||
     (config as any)?.deviceSecret ||
     (isDev ? 'dev-secret-booth-01' : '');
   ```
3. **Safety Guard**:
   If `backendUrl` or `boothIdentifier` is missing in production runtime, verification halts immediately with a clear diagnostic console error, preventing any invalid network requests.

---

## 3. Installed Binary & Build Artifact Evidence

### Binary Status & Distribution

| Location | Component | Timestamp (UTC) | Status / Role |
| :--- | :--- | :--- | :--- |
| `release/win-unpacked/Pictolabs Kiosk.exe` | Standalone Packaged Executable | `2026-09-22 18:31:52` | **ACTIVE & VERIFIED**: Contains patched `app.asar` with `resolveTargetEndpoint()`. |
| `release/Pictolabs Kiosk Setup 1.0.0.exe` | One-Click NSIS Installer | `2026-09-22 18:31:52` | **FRESH BUILD**: Packaged with latest release, ready to update `C:\Program Files`. |
| `C:\Users\ezarh\Desktop\Pictolabs Kiosk.lnk` | User Desktop Shortcut | `2026-09-22 18:29:38` | **UPDATED**: Direct link on founder desktop pointing to `release\win-unpacked\Pictolabs Kiosk.exe`. |
| `C:\Program Files\Pictolabs Kiosk\resources\app.asar` | Protected Installed App | `2026-09-22 02:19:42` | Legacy build. In Windows, updating `C:\Program Files` requires UAC elevation via running the setup installer. |

---

## 4. End-to-End Runtime Verification Evidence

The updated application was launched and exercised end-to-end via Chrome DevTools Protocol (CDP):

### CDP Network & Execution Log (Captured Live)
```log
[18:33:00.084] ====================================================
[18:33:00.084]   ADMIN PIN RUNTIME VERIFICATION ON PAIRED KIOSK
[18:33:00.084] ====================================================
[18:33:00.241] 2. Launching packaged Kiosk binary with remote debugging port 9222...
[18:33:04.362] 3. Connecting to Kiosk Chromium renderer via CDP...
[18:33:04.431] Connected to target: "Pictolabs Kiosk" (file:///.../release/win-unpacked/resources/app.asar/dist/renderer/index.html)
[18:33:04.455] 4. Verifying window.kiosk.identity.getStatus() in renderer...
[18:33:04.457] ✓ Kiosk Identity: isPaired=true, boothId="554147f9-c7f7-47fe-966d-fcbf3223fec4", apiBaseUrl="https://api.pictolabs.id"
[18:33:04.457] 5. Clicking Staff button (#btn-kiosk-admin-entry) on WelcomeScreen...
[18:33:05.471] 6. Capturing screenshot of AdminScreen PIN pad...
[18:33:05.553] ✓ Saved screenshot to uat_admin_pin_pad.png
[18:33:05.553] 7. Testing Wrong PIN: 885926...
[18:33:06.076] 🌐 [CDP NETWORK REQUEST] POST https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin -> Body: {"pin":"885926"}
[18:33:06.474] 🌐 [CDP NETWORK RESPONSE] 200 OK for https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin
[18:33:08.191] ✓ Wrong PIN rejected, AdminScreen remains locked: true
[18:33:08.191] 8. Testing Correct Dashboard PIN: 112233...
[18:33:08.713] 🌐 [CDP NETWORK REQUEST] POST https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin -> Body: {"pin":"112233"}
[18:33:08.838] 🌐 [CDP NETWORK RESPONSE] 200 OK for https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin
[18:33:11.335] 🎯 Login with PIN 112233 Result: AUTHENTICATED SUCCESSFUL ✓
[18:33:11.335] 9. Capturing screenshot of Authenticated Admin Panel...
[18:33:11.432] ✓ Saved screenshot to uat_admin_panel_authenticated.png
[18:33:11.432] ====================================================
[18:33:11.432]   VERIFICATION SUMMARY
[18:33:11.432] ====================================================
[18:33:11.432] 1. Correct API URL Used: PASS ✓
[18:33:11.432] 2. Localhost Fallback Eliminated: PASS ✓
[18:33:11.432] 3. Wrong PIN (885926) Rejected: PASS ✓
[18:33:11.432] 4. Correct PIN (112233) Authenticated: PASS ✓
[18:33:11.432] ====================================================
```

---

## 5. Visual Proof

### 5.1 Operator Access Keypad
![Operator Access Keypad](file:///C:/Users/ezarh/.gemini/antigravity-ide/brain/13fa350d-ea7f-4ff5-b3ec-85f5a90a0625/uat_admin_pin_pad.png)

### 5.2 Authenticated Operator Control Panel
![Authenticated Operator Control Panel](file:///C:/Users/ezarh/.gemini/antigravity-ide/brain/13fa350d-ea7f-4ff5-b3ec-85f5a90a0625/uat_admin_panel_authenticated.png)

---

## 6. Founder Validation Steps (How to Test on Kiosk)

Follow these simple steps on the kiosk machine:

### Option 1: Direct Test via Desktop Shortcut (Immediate — Recommended)
1. Close any running Pictolabs Kiosk window.
2. Double-click **`Pictolabs Kiosk`** (or `Pictolabs Kiosk (Updated)`) on your Windows Desktop.  
   *(The shortcut points directly to `release\win-unpacked\Pictolabs Kiosk.exe`).*
3. On the Welcome Screen, tap the top-left **Staff / Lock Icon** (`#btn-kiosk-admin-entry`).
4. **Negative Test**:
   - Enter old PIN `885926`.
   - **Expected Result**: Keypad shakes red; inputs reset; panel remains locked.
5. **Positive Test**:
   - Enter active Dashboard PIN `112233`.
   - **Expected Result**: Keypad instantly unlocks and transitions to the **Operator Control Panel** (`V1.0 ENTERPRISE`).

### Option 2: Updating the Program Files Installation
If you prefer the Start Menu shortcut (`C:\Program Files\Pictolabs Kiosk`) to also use the updated build:
1. Open Windows File Explorer and navigate to:  
   `c:\Users\ezarh\.gemini\antigravity-ide\scratch\Pictolabs\pictolabs-rebuild\apps\kiosk\release\`
2. Double-click **`Pictolabs Kiosk Setup 1.0.0.exe`**.
3. When prompted by Windows User Account Control (UAC), click **"Yes"**.
4. The installer will overwrite `C:\Program Files\Pictolabs Kiosk` with the verified build and automatically launch the updated application.
