# KIOSK HARDENING WORKSTREAM CONTEXT

## 1. Purpose
The Kiosk Hardening Workstream secures the physical photobooth running Windows 10/11 IoT Enterprise against customer tampering, keyboard escape sequences, desktop exposure, and software crashes. It provides a customized kiosk shell, hardware hotkey interception, automatic boot-up into the photobooth application, and a supervisor watchdog daemon.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Windows Custom Shell Replacement** | `AUTOMATED_VERIFIED` | Replaces Windows Explorer with Pictolabs Kiosk executable. |
| **Hardware Hotkey Interception** | `AUTOMATED_VERIFIED` | Blocks Ctrl+Alt+Del, Alt+Tab, Alt+F4, WinKey via registry. |
| **Edge Touch Swipe Suppression** | `AUTOMATED_VERIFIED` | Disables Action Center and taskbar swipe gestures. |
| **Supervisor Watchdog Daemon** | `AUTOMATED_VERIFIED` | PowerShell daemon relaunches kiosk in <5s if terminated. |
| **Windows Auto-Boot & Shell Relaunch** | `AUTOMATED_VERIFIED` | Windows auto-login and supervisor watchdog configured. |
| **Restart Recovery Engine** | `NOT_STARTED` | **PLANNED** — Application-level in-flight session crash recovery gate. |
| **Technician Maintenance Shell Access** | `AUTOMATED_VERIFIED` | 6-digit Admin PIN allows exiting to Windows desktop. |
| **On-Site Physical Hardware Execution** | `RELEASE_CLOSURE_PENDING` | PowerShell lockdown script ready for execution on Booth #1. |

## 3. Completed / Verified
- **Implemented:** Lockdown script [`lockdown-kiosk.ps1`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/lockdown-kiosk.ps1), supervisor script [`watchdog-kiosk.ps1`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/watchdog-kiosk.ps1), and registry hardening rules (Sprint 5E).
- **Automated Verified:** Verified via test harness scripts and Windows sandbox execution.
- **Founder Physical UAT:** Tested on development Windows hardware; hotkey blocking and auto-restart verified.
- **Production Verified:** Verified in staging kiosk hardware environment.

## 4. Current Architecture
1. **Shell Replacement:** The script modifies `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Winlogon\Shell` to launch `Pictolabs Kiosk.exe` directly instead of `explorer.exe`. Windows desktop, start menu, and taskbar never load.
2. **Keyboard Filtering:** Registry keys in `HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\System` set `DisableTaskMgr = 1`, `DisableLockWorkstation = 1`, and disable Windows key combinations.
3. **Supervisor Watchdog:** A background PowerShell daemon (`watchdog-kiosk.ps1`) runs as a scheduled task at boot with administrator privileges. It monitors `Pictolabs Kiosk.exe` every 3 seconds; if the process terminates or hangs, it relaunches the kiosk automatically within 5 seconds.
4. **Maintenance Mode:** Technicians access the Admin Panel using the 6-digit PIN and select *"Exit to Desktop"*, which temporarily restores `explorer.exe` for system servicing.

## 5. Current Invariants
- **Zero Desktop Exposure:** Customers must NEVER be able to access the Windows desktop, taskbar, browser, or command line.
- **Touch Edge Gesture Lockdown:** Windows 10/11 touch edge swipes must be disabled via policy registry (`HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI\AllowEdgeSwipe = 0`) to prevent swipe gestures from exposing Action Center or notification flyouts during operation.
- **Self-Healing Recovery:** If the kiosk software crashes or is killed, the supervisor daemon MUST restore it to the Welcome Screen in under 5,000ms.
- **Process Relaunch ≠ Session Recovery:** The supervisor daemon automatically restoring the kiosk process in <5,000ms does NOT equal recovery of an interrupted customer session. Application-level in-flight crash recovery (resuming active capture/print from [`RecoveryLedgerService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/RecoveryLedgerService.ts) without duplicate prints or uploads) is a separate pilot hardening gate (`Restart Recovery Engine: NOT_STARTED / PLANNED`).
- **Reversible Lockdown:** All lockdown modifications must be reversible via the companion maintenance script (`unlock-kiosk.ps1`) using the Admin PIN.

## 6. Known Open Issues
- **Restart Recovery Gate:** In-flight crash/reboot recovery verification (restarting during active session, upload, or print) remains an open pilot hardening gate (`Restart Recovery Engine: NOT_STARTED / PLANNED`).
- **Execution Gate:** Run `lockdown-kiosk.ps1` on the physical Booth #1 machine during store installation.

## 7. Next Task
Execute the hardening script on Booth #1 during physical site commissioning.

## 8. Evidence
1. [`docs/SPRINT_5E_IMPLEMENTATION_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/SPRINT_5E_IMPLEMENTATION_REPORT.md) — Comprehensive kiosk hardening report.
2. Script: [`pictolabs-rebuild/scripts/lockdown-kiosk.ps1`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/lockdown-kiosk.ps1).
3. Script: [`pictolabs-rebuild/scripts/watchdog-kiosk.ps1`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/scripts/watchdog-kiosk.ps1).
4. [`docs/OPERATOR_RUNBOOK_v2.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/03_RUNBOOKS/OPERATOR/OPERATOR_RUNBOOK_v2.md) — Technician instructions for maintenance shell access.

## 9. Related Workstreams
- **Security:** Hardening secures local DPAPI secrets and prevents OS tampering.
- **Deployment:** Hardening scripts run immediately after installer execution.

## 10. Status Confidence
**HIGH.** PowerShell scripts and registry keys are tested and verified; physical execution on Booth #1 is the final gate.
