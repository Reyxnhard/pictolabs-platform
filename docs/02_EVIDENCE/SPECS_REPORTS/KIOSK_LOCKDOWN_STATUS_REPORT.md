# KIOSK LOCKDOWN STATUS REPORT
## Operating System Security & Enclosure Hardening for Commercial Booth #1

> **Generated:** September 10, 2026  
> **Audience:** Founder / Product Owner  
> **Target:** Windows 10/11 IoT OS Environment & Kiosk Shell Lockdown  
> **Script Reference:** [`scripts/lockdown-kiosk.ps1`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/lockdown-kiosk.ps1)  
> **Classification Standard:** `COMPLETED` | `PARTIAL` | `MOCK` | `NOT STARTED`  

---

## 1. Executive Summary Status Matrix

| # | Security Component | Classification | Current Status |
| :-: | :--- | :---: | :--- |
| **1** | **Auto Login Status** | **PARTIAL** | Script configures registry `AutoAdminLogon`; not yet run on physical booth PC. |
| **2** | **Auto Launch Status** | **PARTIAL** | Script configures startup shell; physical execution pending hardware staging. |
| **3** | **Shell Replacement Status** | **PARTIAL** | Configures `Winlogon\Shell = Pictolabs.exe`; default desktop still active today. |
| **4** | **Windows Key Blocking** | **PARTIAL** | Registry policy `NoWinKeys` defined; touch gestures still bypass it. |
| **5** | **Alt+Tab Blocking** | **PARTIAL** | Script defines explorer hotkey restrictions; kernel-level filter not yet installed. |
| **6** | **Ctrl+Alt+Del Handling** | **PARTIAL** | Disables Task Manager & Lock options; Windows security screen still renders. |
| **7** | **Task Manager Access** | **PARTIAL** | Registry policy `DisableTaskMgr = 1` drafted; requires elevated script execution. |
| **8** | **Explorer Access** | **PARTIAL** | Replacing Winlogon shell prevents desktop; physical verification pending. |
| **9** | **Power Loss Recovery** | **PARTIAL** | Software database (SQLite WAL) is crash-resilient; BIOS AC-Restore setting pending. |
| **10** | **Application Crash Recovery** | **PARTIAL** | In-app restart handlers exist; external watchdog daemon (NSSM/PM2) is missing. |
| **11** | **Multi Monitor Handling** | **NOT STARTED** | Single primary display only; no dual-screen or overhead crowd projector window. |
| **12** | **Windows Update Strategy** | **PARTIAL** | Registry active hours defined (08:00–23:00); Group Policy freeze pending. |

---

## 2. Component Analysis

### 1. Auto Login Status — `PARTIAL`
- The script `lockdown-kiosk.ps1` configures `Winlogon\AutoAdminLogon = 1` with a dedicated kiosk account (`PictolabsKiosk`).
- **Gap:** Has not been run on the physical mini-PC designated for Booth #1. Currently boots to standard Windows user login.

### 2. Auto Launch Status — `PARTIAL`
- Direct shell assignment bypasses the startup folder and launches `Pictolabs.exe` immediately upon Windows initialization.
- **Gap:** Dependent on the physical executable build path (`C:\Pictolabs\Pictolabs.exe`) being placed on the target machine.

### 3. Shell Replacement Status — `PARTIAL`
- Configures `HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon` setting `Shell` to the kiosk application instead of `explorer.exe`. This prevents the Windows desktop, taskbar, and start menu from ever loading.
- **Gap:** Until executed on the machine, Windows Explorer remains the active shell.

### 4. Windows Key Blocking — `PARTIAL`
- Disables Windows hotkey combinations via `HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\NoWinKeys`.
- **Gap:** Standard registry keys do not block touchscreen swipe gestures (Action Center, Widgets) on Windows 11 without Group Policy touch disabling.

### 5. Alt+Tab Blocking — `PARTIAL`
- When Windows Explorer is replaced as shell, Alt+Tab has no window manager to switch between.
- **Gap:** On physical hardware with physical keyboards, low-level hardware keyboard filters (Windows IoT Keyboard Filter driver) have not been enabled.

### 6. Ctrl+Alt+Del Handling — `PARTIAL`
- In Windows NT architecture, Ctrl+Alt+Del is hardwired to the Secure Attention Sequence (SAS) and cannot be blocked in user mode.
- The script disables:
  - `DisableTaskMgr = 1` (Task Manager removed from screen)
  - `DisableLockWorkstation = 1` (Lock option removed)
  - `DisableChangePassword = 1` (Password change removed)
- **Gap:** A black security screen with "Sign Out" or "Cancel" will still appear if Ctrl+Alt+Del is pressed.

### 7. Task Manager Access — `PARTIAL`
- `DisableTaskMgr = 1` blocks `Ctrl+Shift+Esc` and disables Task Manager launching.
- **Gap:** Not yet applied to the physical OS.

### 8. Explorer Access — `PARTIAL`
- By eliminating `explorer.exe` as the shell, users have no access to File Explorer, desktop folders, or the recycle bin.
- **Gap:** File picker dialogs inside Electron must be strictly locked to prevent opening explorer file windows.

### 9. Power Loss Recovery — `PARTIAL`
- **Software Layer (Done):** SQLite database runs in WAL mode (`kiosk.db`), ensuring zero data corruption if the mall cuts booth power abruptly.
- **Hardware Layer (Pending):** The mini-PC BIOS must be configured manually to `"State After G3: Always Power On"` (AC Power Loss recovery) so the PC powers on automatically when mall electricity is switched on at 10:00 AM.

### 10. Application Crash Recovery — `PARTIAL`
- The kiosk app has in-memory error boundaries and an operator restart button.
- **Gap:** If `Pictolabs.exe` crashes or encounters a kernel segfault, there is currently no background watchdog service (e.g. NSSM or Windows Task Scheduler Watchdog) to automatically respawn the application.

### 11. Multi Monitor Handling — `NOT STARTED`
- Currently configured strictly for a single portrait touchscreen (1080x1920).
- No secondary display output (e.g. an overhead marketing screen or secondary liveview monitor) is supported in code.

### 12. Windows Update Strategy — `PARTIAL`
- Script defines retail active hours (08:00 to 23:00) during which automatic reboots are prevented.
- **Gap:** Windows 11 Home/Pro can still override active hours after several days. Must configure Windows Group Policy (`NoAutoUpdate = 1`) or use Windows 10/11 IoT Enterprise LTSC to freeze updates completely.

---

## 3. Top 10 Ways a Customer Can Escape the Kiosk App Today

Because the lockdown script has not yet been executed on the physical booth machine, here is the unvarnished reality of how an unattended user can break out of the kiosk right now:

1. **Right-Edge Swipe (Action Center / Settings)**  
   Swiping inward from the right edge of the touchscreen opens the Windows 11 Action Center. From here, a customer can tap the gear icon to enter full Windows Settings, access Wi-Fi passwords, or open Edge.

2. **Left-Edge Swipe (Windows Widgets & Browser)**  
   Swiping from the left edge summons the Windows 11 Widgets board, immediately launching MSN news stories and opening full Microsoft Edge browser windows.

3. **Bottom-Edge Swipe (Windows Taskbar & Start Menu)**  
   Swiping upward from the bottom of the screen unhides the Windows Taskbar, giving access to the Start Menu, all installed software, and the search bar.

4. **Operator Admin Button on Welcome Screen (PIN: 1234)**  
   The Welcome Screen has an "Operator Admin Panel" button visible at the top-left. Any customer who guesses or spots the default PIN (`1234`) can open the Admin Screen, click **"Keluar ke Windows"**, and close the photobooth app immediately.

5. **Multi-Touch Gestures (Three-Finger Swipe)**  
   Windows 11 multi-finger touch gestures are enabled by default. Swiping down with three fingers minimizes the photobooth and reveals the desktop; swiping up summons Task View.

6. **Windows Touch Keyboard Settings Link**  
   Tapping an email or phone text input summons the Windows Touch Keyboard. The keyboard's top-left settings gear contains a "Help & Feedback" link that launches a browser window over the kiosk.

7. **Physical Keyboard Shortcuts (Alt+F4 / Alt+Tab / Win+D)**  
   If a customer or curious passerby plugs in a wireless or USB keyboard, standard Windows hotkeys (`Alt+F4`, `Win+D`, `Win+R` to open Run dialog) are completely unblocked today.

8. **Ctrl+Alt+Del / Ctrl+Shift+Esc Access**  
   Pressing standard Windows interrupt keys allows opening Task Manager, terminating the kiosk process, and accessing the command prompt.

9. **Top-Bar Window Snapping & Dragging**  
   If the Electron kiosk window is not locked in borderless hardware fullscreen, touching and dragging downward from the top edge can tile or minimize the window.

10. **Windows Update & System Reboot Prompts**  
    Scheduled Windows Update popups, antivirus notifications, or low-disk alerts can steal focus, push the kiosk window to the background, or reboot the booth while a customer is posing.

---

## 4. Recommended Hardening Protocol Before Mall Go-Live

1. **Run `scripts/lockdown-kiosk.ps1` as Administrator** on the physical Booth #1 PC.
2. **Disable Windows 11 Touch Gestures** via Local Group Policy Editor (`gpedit.msc`):  
   `Computer Configuration -> Administrative Templates -> Windows Components -> Edge UI -> Allow edge swipe = Disabled`.
3. **Change Default Admin PIN** from `1234` to a confidential 6-digit PIN in `kiosk.config`.
4. **Configure BIOS "Restore AC Power Loss"** to `Always On`.
5. **Install NSSM (Non-Sucking Service Manager)** to automatically respawn `Pictolabs.exe` if it ever terminates unexpectedly.
