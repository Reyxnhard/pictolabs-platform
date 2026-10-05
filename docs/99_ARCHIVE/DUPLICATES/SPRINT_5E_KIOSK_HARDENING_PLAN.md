# SPRINT 5E: KIOSK HARDENING & PHYSICAL SECURITY PLAN
## Operating System Lockdown & Escape Mitigation for Commercial Booth #1

> **Document Version:** 1.0 (Approved for Sprint 5E Planning)  
> **Status:** PLANNING DOCUMENT ONLY — NO CODE IMPLEMENTED YET  
> **Target Device:** Windows 10/11 IoT / Pro Mini-PC (Physical Booth #1 Enclosure)  
> **Objective:** Make Booth #1 completely safe, tamper-proof, and self-healing for unattended public operation in retail shopping malls.

---

## 1. Executive Summary & Problem Statement

In an unattended retail photobooth, the physical touchscreen is the sole customer interface. Without low-level operating system hardening, standard Windows 10/11 multi-touch gestures, edge swiping, keyboard interrupts, and visible technician shortcuts allow curious or malicious users to escape the kiosk application, access the Windows desktop, inspect private session photos, browse the internet, or terminate the software.

Sprint 5E delivers an exhaustive OS-level lockdown, hardware watchdog, power-recovery protocol, and physical penetration testing regime to guarantee zero customer escape routes.

---

## 2. Core Lockdown Specifications

---

### 1. Disable Windows Touch Gestures
- **Objective:** Deactivate all standard Windows multi-touch gesture processing (two-finger pinch, three-finger swipe down to desktop, three-finger swipe up to Task View, four-finger virtual desktop switching).
- **Risk Mitigated:** Customers using natural tablet gestures to minimize `Pictolabs.exe` or reveal background Windows processes.
- **Implementation Strategy:**
  - Configure Registry: `HKCU\Software\Microsoft\Wisp\Touch` -> `TouchGate = 0` and `BmaPinch = 0`.
  - Disable Windows Touch multi-finger gestures via Group Policy: `User Configuration -> Administrative Templates -> Windows Components -> Tablet PC -> Touch -> Turn off multi-finger gestures = Enabled`.
- **Acceptance Criteria:**
  - Multi-finger touches (2, 3, or 4 simultaneous contact points) do not trigger any OS-level animations, window minimize events, or task switching.
  - Multi-touch inputs within the photobooth app (e.g. sticker pinch-to-zoom on the photo frame) remain functional via Chromium pointer events.

---

### 2. Disable Action Center & Notification Flyout
- **Objective:** Completely remove the Windows Action Center, notification tray, and quick settings menu.
- **Risk Mitigated:** Customers pulling down or clicking into Action Center to access Windows Settings, toggle Wi-Fi/Bluetooth, inspect saved network passwords, or mute system audio.
- **Implementation Strategy:**
  - Configure Registry: `HKCU\Software\Policies\Microsoft\Windows\Explorer` -> `DisableNotificationCenter = 1`.
  - Disable Action Center hotkey shortcut: block `Win + A` and `Win + N`.
  - Suppress system tray balloon notifications: `EnableBalloonTips = 0`.
- **Acceptance Criteria:**
  - Swiping or tapping the notification area does not summon any UI.
  - System notifications (USB connected, update available, low battery) are completely suppressed and never appear over the kiosk window.

---

### 3. Disable Windows Widgets & News Feed
- **Objective:** Deactivate the Windows 11 Widgets board and MSN news feed integration.
- **Risk Mitigated:** Left-edge swipes summoning the MSN news board, which allows customers to click news articles and open full Microsoft Edge browser windows.
- **Implementation Strategy:**
  - Configure Group Policy / Registry: `HKLM\SOFTWARE\Policies\Microsoft\Dsh` -> `AllowNewsAndInterests = 0`.
  - Disable Windows shortcut: block `Win + W`.
  - Uninstall or disable Windows Web Experience Pack service.
- **Acceptance Criteria:**
  - The Widgets panel cannot be invoked via touch, keyboard shortcut, or background task.
  - No background network bandwidth is consumed by MSN news or weather feeds.

---

### 4. Disable Edge Swipe (Bezel-to-Screen Gestures)
- **Objective:** Block all four border-inward swipe gestures at the OS level (left edge for Widgets, right edge for Action Center, top edge for Window Snap, bottom edge for Taskbar).
- **Risk Mitigated:** Edge-swiping is the #1 vulnerability on Windows 11 touchscreen displays, allowing users to summon the desktop or taskbar within 1 second.
- **Implementation Strategy:**
  - Configure Group Policy: `Computer Configuration -> Administrative Templates -> Windows Components -> Edge UI -> Allow edge swipe = Disabled` (`AllowEdgeSwipe = 0`).
  - Set registry value: `HKLM\SOFTWARE\Policies\Microsoft\Windows\EdgeUI` -> `AllowEdgeSwipe = 0`.
- **Acceptance Criteria:**
  - Swiping inward from the left, right, top, or bottom bezels of the physical touchscreen does not reveal any Windows controls, taskbars, or window decorations.

---

### 5. Replace Default Admin PIN & Conceal Operator Entry
- **Objective:** Invalidate the default PIN (`1234`), implement a confidential 6-digit PIN, and remove the visible "Operator Admin Panel" button from the customer-facing Welcome Screen.
- **Risk Mitigated:** Curious mall visitors spotting the visible button on the top-left, entering `1234`, and accessing hardware controls or clicking "Keluar ke Windows".
- **Implementation Strategy:**
  - **Secret Gesture Trigger:** Remove the visible button from `WelcomeScreen.tsx`. Require a hidden operator gesture: tapping the Pictolabs brand logo 5 times in rapid succession (within 2.5 seconds) to open the PIN pad.
  - **PIN Hardening:** Upgrade from 4-digit plaintext `1234` to a 6-digit PIN stored as a salted bcrypt hash in local encrypted storage.
  - **Brute-Force Lockout:** 3 consecutive incorrect PIN entries locks the keypad for 10 minutes and dispatches an automatic `WARNING` alert to WhatsApp.
- **Acceptance Criteria:**
  - No visible admin or operator button exists on any customer screen.
  - Entering `1234` fails with an invalid PIN error.
  - Rapid 5-tap gesture on the logo opens the 6-digit PIN keypad.
  - 3 failed attempts triggers the 10-minute lockout screen and logs the incident.

---

### 6. Watchdog Auto-Restart Strategy (Process Supervision)
- **Objective:** Ensure `Pictolabs.exe` is monitored by an external, independent Windows service that automatically restarts the app in under 3 seconds if it ever crashes, segfaults, or is terminated.
- **Risk Mitigated:** The booth sitting on a frozen black screen or empty Windows shell if an unexpected camera driver exception or memory leak crashes Electron.
- **Implementation Strategy:**
  - Deploy **NSSM (Non-Sucking Service Manager)** or a lightweight native Windows Service: `PictolabsWatchdogService`.
  - Watchdog checks process heartbeat every 2 seconds via PID and window handle.
  - If process status is non-responsive or terminated:
    1. Force-kills any hung child processes (`node.exe`, `ffmpeg.exe`, Canon EDSDK background tasks).
    2. Relaunches `C:\Pictolabs\Pictolabs.exe` in borderless fullscreen kiosk mode.
    3. Logs the crash timestamp and error code to local SQLite and server telemetry.
- **Acceptance Criteria:**
  - Terminating `Pictolabs.exe` via Task Manager or `taskkill /F` causes the application to automatically reappear in full screen within 3 seconds.
  - Application crash does not leave the user on an unhandled desktop screen.

---

### 7. BIOS & Hardware Power Recovery Protocol
- **Objective:** Automate boot-up so that when shopping mall power circuits are switched on at 10:00 AM WIB, the kiosk PC powers on, initializes peripherals, and opens the photobooth app without requiring physical staff interaction.
- **Risk Mitigated:** Booth remaining unpowered until a field technician travels to the mall to manually press the PC's power button.
- **BIOS Configuration Checklist:**
  1. **Restore AC Power Loss / State After G3:** Set to `Always On` (or `Power On`).
  2. **Fast Boot:** Set to `Disabled` (ensures clean USB driver enumeration for Canon DSLR and DNP printer).
  3. **Auto Power On by RTC (Wake-on-Alarm):** Configured as backup for 09:30 AM daily.
  4. **Quiet Boot / OEM Splash:** Set to `Enabled` (hides BIOS POST text from external view).
  5. **Windows Fast Startup:** Disabled in Windows Control Panel (prevents corrupted hybrid-sleep hardware states).
- **Acceptance Criteria:**
  - Cutting mall breaker power and restoring it results in the PC powering on automatically, booting Windows, logging into `PictolabsKiosk`, and displaying the Welcome Screen in <45 seconds without touching the power button.

---

### 8. Physical Escape Testing Plan (Red-Teaming Protocol)
- **Objective:** A structured 10-step penetration test executed on the physical booth enclosure to certify zero escape vectors before public retail opening.
- **Risk Mitigated:** Unforeseen touch hardware quirks, USB accessibility leaks, or window manager bypasses discovered by the public.

#### Test Execution Matrix:

| Test # | Vector Under Test | Test Procedure | Expected Result | Pass/Fail |
| :---: | :--- | :--- | :--- | :---: |
| **ET-01** | **Right Edge Swipe** | Swipe finger firmly inward from right glass bezel 10 times across different heights. | No Action Center, notifications, or settings flyout appears. | [ ] |
| **ET-02** | **Left Edge Swipe** | Swipe finger firmly inward from left glass bezel 10 times. | No Widgets, MSN news, or Edge browser window appears. | [ ] |
| **ET-03** | **Bottom Edge Swipe** | Swipe finger upward from bottom bezel 10 times. | No Windows Taskbar, Start Menu, or system tray appears. | [ ] |
| **ET-04** | **Top Edge Drag** | Drag finger downward from the top border. | Window does not minimize, tile, un-maximize, or reveal title bar. | [ ] |
| **ET-05** | **Multi-Touch Swipes** | Perform 3-finger swipe down, 3-finger swipe up, and 4-finger pinch. | No desktop reveal, no Task View, no virtual desktop switch. | [ ] |
| **ET-06** | **Touch Keyboard Escape** | Tap customer email input, summon Touch Keyboard, click Settings gear -> "Help". | Help link is disabled; no external browser window is spawned. | [ ] |
| **ET-07** | **Hidden Admin Gesture** | Tap Welcome Screen random locations vs tapping logo 5x rapidly. | Random taps do nothing; exactly 5 rapid taps on logo summons PIN pad. | [ ] |
| **ET-08** | **PIN Brute-Force** | Enter `1234`, `0000`, `9999` consecutively. | Keypad enters 10-minute lockout; WhatsApp alert dispatched to admin. | [ ] |
| **ET-09** | **Physical Power Cut** | Pull main AC power plug from wall socket during active session, wait 10s, reconnect. | PC powers on automatically; boots to Welcome Screen in <45s; zero DB corruption. | [ ] |
| **ET-10** | **Process Force-Kill** | Kill `Pictolabs.exe` via remote SSH / script. | Watchdog service respawns fullscreen kiosk in <3 seconds. | [ ] |

---

## 3. Sprint 5E Work Breakdown & Complexity

- **Phase 1: Windows OS Lockdown Automation** (Complexity: `MEDIUM`)
  - Update `scripts/lockdown-kiosk.ps1` with EdgeUI, TouchGate, and NotificationCenter registry keys.
  - Package GPO export script (`LocalGPO` / `LGPO.exe`) for automated policy application.
- **Phase 2: Secret Admin Gesture & PIN Hardening** (Complexity: `LOW`)
  - Refactor `WelcomeScreen.tsx` to remove visible button and require 5-tap logo sequence.
  - Upgrade PIN logic to 6-digit hashed storage with 3-attempt lockout in `AdminScreen.tsx`.
- **Phase 3: Watchdog Supervisor Daemon** (Complexity: `MEDIUM`)
  - Build and install `PictolabsWatchdog` via NSSM.
- **Phase 4: Physical Hardware Staging & ET-01–10 Execution** (Complexity: `HIGH`)
  - On-site BIOS configuration and execution of the 10-step Escape Testing Protocol on Commercial Booth #1.

---
*End of Sprint 5E Kiosk Hardening Plan.*
