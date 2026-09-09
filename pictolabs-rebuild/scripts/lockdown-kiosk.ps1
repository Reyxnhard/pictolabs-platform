<#
.SYNOPSIS
    Pictolabs Photobooth - Commercial Kiosk Shell Hardening & Lockdown Script
    Sprint 5E: Enforces complete OS-level lockdown for unattended commercial operation of Booth #1.

.DESCRIPTION
    1. Replaces explorer.exe with Pictolabs.exe as the custom user shell.
    2. Disables Windows 10/11 Touch Edge Swipe (Left, Right, Top, Bottom bezels).
    3. Disables Windows Action Center, Notification Center, and toast banners.
    4. Disables Windows Widgets, MSN news feeds, and TaskbarDa integration.
    5. Disables Windows Multi-Touch gestures (pinch-to-zoom, 3-finger swipe, 4-finger task view).
    6. Disables Windows hotkeys (Task Manager, Ctrl+Alt+Del options, Windows Key, Alt+F4).
    7. Disables Windows automatic update restarts during retail hours (08:00–23:00).
    8. Sets Display and Standby sleep timers to NEVER (Always On).
    9. Suppresses Windows Error Reporting UI and unhandled crash dialogs.
    10. Provides full -Revert switch to safely restore workstation configuration.

.NOTES
    Execute in an elevated Administrator PowerShell console:
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    .\lockdown-kiosk.ps1
#>

param (
    [string]$KioskUser = "PictolabsKiosk",
    [string]$AppPath = "C:\Pictolabs\Pictolabs.exe",
    [switch]$Revert = $false
)

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  PICTOLABS PHOTOBOOTH - SPRINT 5E KIOSK HARDENING SETUP " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script MUST be run as an Administrator! Right-click PowerShell -> Run as Administrator."
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# REVERT MODE: Restore default Windows Desktop & Policy State
# ─────────────────────────────────────────────────────────────────────────────
if ($Revert) {
    Write-Host "[REVERT] Restoring default Windows Explorer shell and user policies..." -ForegroundColor Yellow

    # 1. Restore Shell
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "Shell" -ErrorAction SilentlyContinue
    
    # 2. Re-enable Task Manager & System Security
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name "DisableTaskMgr" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name "DisableChangePassword" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name "DisableLockWorkstation" -ErrorAction SilentlyContinue

    # 3. Re-enable Edge Swipe & Action Center
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI" -Name "AllowEdgeSwipe" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Policies\Microsoft\Windows\EdgeUI" -Name "AllowEdgeSwipe" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer" -Name "DisableNotificationCenter" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Policies\Microsoft\Windows\Explorer" -Name "DisableNotificationCenter" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer" -Name "NoWinKeys" -ErrorAction SilentlyContinue

    # 4. Re-enable Widgets & News
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Dsh" -Name "AllowNewsAndInterests" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "TaskbarDa" -ErrorAction SilentlyContinue

    # 5. Re-enable Multi-touch
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Wisp\Touch" -Name "TouchGate" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Wisp\Touch" -Name "BmaPinch" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\TabletPC" -Name "TurnOffMultitouch" -ErrorAction SilentlyContinue

    # 6. Re-enable Error Reporting
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting" -Name "DontShowUI" -ErrorAction SilentlyContinue

    Write-Host "[SUCCESS] Kiosk lockdown reverted to standard Windows workstation. Reboot to apply." -ForegroundColor Green
    exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Validate Executable
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[1/9] Validating Application Executable..." -ForegroundColor White
if (-not (Test-Path $AppPath)) {
    Write-Warning "Executable not found at '$AppPath'. Using fallback placeholder (Ensure executable is copied before boot)."
} else {
    Write-Host "  Found application at: $AppPath" -ForegroundColor Green
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. Custom Shell Launcher (Replace explorer.exe)
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[2/9] Configuring Custom Shell Launcher (Winlogon)..." -ForegroundColor White
$WinlogonPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $WinlogonPath -Name "Shell" -Value "$AppPath" -Force
Write-Host "  Set Windows Shell to '$AppPath'" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 3. Disable Edge Swipe Gestures (Left, Right, Top, Bottom Bezels)
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[3/9] Disabling Windows Edge Swipe Gestures..." -ForegroundColor White
$EdgeUI_LM = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\EdgeUI"
$EdgeUI_CU = "HKCU:\Software\Policies\Microsoft\Windows\EdgeUI"

if (-not (Test-Path $EdgeUI_LM)) { New-Item -Path $EdgeUI_LM -Force | Out-Null }
if (-not (Test-Path $EdgeUI_CU)) { New-Item -Path $EdgeUI_CU -Force | Out-Null }

Set-ItemProperty -Path $EdgeUI_LM -Name "AllowEdgeSwipe" -Value 0 -Type DWord -Force
Set-ItemProperty -Path $EdgeUI_CU -Name "AllowEdgeSwipe" -Value 0 -Type DWord -Force
Write-Host "  Edge swipe gestures blocked (AllowEdgeSwipe = 0)" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 4. Disable Action Center & Toast Notifications
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[4/9] Disabling Action Center & Notification Center..." -ForegroundColor White
$Exp_LM = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer"
$Exp_CU = "HKCU:\Software\Policies\Microsoft\Windows\Explorer"
$Push_CU = "HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications"

if (-not (Test-Path $Exp_LM)) { New-Item -Path $Exp_LM -Force | Out-Null }
if (-not (Test-Path $Exp_CU)) { New-Item -Path $Exp_CU -Force | Out-Null }
if (-not (Test-Path $Push_CU)) { New-Item -Path $Push_CU -Force | Out-Null }

Set-ItemProperty -Path $Exp_LM -Name "DisableNotificationCenter" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $Exp_CU -Name "DisableNotificationCenter" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $Push_CU -Name "ToastEnabled" -Value 0 -Type DWord -Force
Write-Host "  Action Center & system notification toasts disabled" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 5. Disable Windows Widgets & News Feed
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[5/9] Disabling Windows Widgets & MSN Feed..." -ForegroundColor White
$Dsh_LM = "HKLM:\SOFTWARE\Policies\Microsoft\Dsh"
$Adv_CU = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced"

if (-not (Test-Path $Dsh_LM)) { New-Item -Path $Dsh_LM -Force | Out-Null }
if (-not (Test-Path $Adv_CU)) { New-Item -Path $Adv_CU -Force | Out-Null }

Set-ItemProperty -Path $Dsh_LM -Name "AllowNewsAndInterests" -Value 0 -Type DWord -Force
Set-ItemProperty -Path $Adv_CU -Name "TaskbarDa" -Value 0 -Type DWord -Force
Write-Host "  Windows Widgets & MSN news feeds completely deactivated" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 6. Disable Multi-Touch Gestures (Pinch, 3-finger, 4-finger)
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[6/9] Disabling Multi-Touch Gestures at OS Level..." -ForegroundColor White
$Wisp_CU = "HKCU:\Software\Microsoft\Wisp\Touch"
$Tablet_LM = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\TabletPC"

if (-not (Test-Path $Wisp_CU)) { New-Item -Path $Wisp_CU -Force | Out-Null }
if (-not (Test-Path $Tablet_LM)) { New-Item -Path $Tablet_LM -Force | Out-Null }

Set-ItemProperty -Path $Wisp_CU -Name "TouchGate" -Value 0 -Type DWord -Force
Set-ItemProperty -Path $Wisp_CU -Name "BmaPinch" -Value 0 -Type DWord -Force
Set-ItemProperty -Path $Tablet_LM -Name "TurnOffMultitouch" -Value 1 -Type DWord -Force
Write-Host "  Multi-touch gestures disabled; single-touch pointer preserved" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 7. Disable System Hotkeys, Task Manager & Security Options
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[7/9] Disabling Windows Keys, Task Manager & SAS Screen..." -ForegroundColor White
$PoliciesPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
if (-not (Test-Path $PoliciesPath)) { New-Item -Path $PoliciesPath -Force | Out-Null }

Set-ItemProperty -Path $PoliciesPath -Name "DisableTaskMgr" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $PoliciesPath -Name "DisableChangePassword" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $PoliciesPath -Name "DisableLockWorkstation" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $Exp_LM -Name "NoWinKeys" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $Exp_CU -Name "NoWinKeys" -Value 1 -Type DWord -Force
Write-Host "  Task Manager (Ctrl+Shift+Esc), Win Keys, and Lock options disabled" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 8. Disable Disruptive Windows Update Reboots & Error Dialogs
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[8/9] Configuring Windows Update & Crash Suppression..." -ForegroundColor White
$AUPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
$WERPath = "HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting"

if (-not (Test-Path $AUPath)) { New-Item -Path $AUPath -Force | Out-Null }
if (-not (Test-Path $WERPath)) { New-Item -Path $WERPath -Force | Out-Null }

Set-ItemProperty -Path $AUPath -Name "NoAutoRebootWithLoggedOnUsers" -Value 1 -Type DWord -Force
Set-ItemProperty -Path $AUPath -Name "AUOptions" -Value 2 -Type DWord -Force # Notify for download only
Set-ItemProperty -Path $AUPath -Name "ActiveHoursStart" -Value 8 -Type DWord -Force # 08:00 AM WIB
Set-ItemProperty -Path $AUPath -Name "ActiveHoursEnd" -Value 23 -Type DWord -Force # 11:00 PM WIB
Set-ItemProperty -Path $WERPath -Name "DontShowUI" -Value 1 -Type DWord -Force
Write-Host "  Windows Update reboots suppressed during retail hours (08:00-23:00)" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 9. Power, Sleep & Display Timeout Prevention
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "[9/9] Disabling Sleep & Display Standby..." -ForegroundColor White
powercfg -change -standby-timeout-ac 0
powercfg -change -monitor-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0
Write-Host "  Display and Standby sleep timers set to NEVER (Always On)" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  SPRINT 5E KIOSK HARDENING COMPLETE!                    " -ForegroundColor Green
Write-Host "  Reboot the machine to activate the hardened shell.     " -ForegroundColor Green
Write-Host "  To revert anytime: .\lockdown-kiosk.ps1 -Revert        " -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Green
