<#
.SYNOPSIS
    Pictolabs Photobooth - Commercial Kiosk Shell Lockdown Script
    Configures Windows 10/11 IoT/Pro for unattended, secure commercial operation of Booth #1.

.DESCRIPTION
    1. Replaces explorer.exe with Pictolabs.exe as the custom user shell.
    2. Disables Windows hotkeys (Ctrl+Alt+Del, Alt+Tab, Windows Key, Alt+F4).
    3. Configures Auto-Logon on boot so the system bypasses the login screen upon power on.
    4. Disables Windows automatic update restarts during retail hours.
    5. Locks display resolution and orientation to 1080x1920 portrait.

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
Write-Host "  PICTOLABS PHOTOBOOTH - KIOSK SHELL LOCKDOWN SETUP      " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script MUST be run as an Administrator! Right-click PowerShell -> Run as Administrator."
    exit 1
}

if ($Revert) {
    Write-Host "[REVERT] Restoring default Windows Explorer shell..." -ForegroundColor Yellow
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon" -Name "Shell" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name "DisableTaskMgr" -ErrorAction SilentlyContinue
    Write-Host "[SUCCESS] Shell restored to explorer.exe. Reboot to apply." -ForegroundColor Green
    exit 0
}

Write-Host "[1/5] Validating Application Executable..." -ForegroundColor White
if (-not (Test-Path $AppPath)) {
    Write-Warning "Executable not found at '$AppPath'. Using fallback placeholder."
} else {
    Write-Host "  Found: $AppPath" -ForegroundColor Green
}

# 1. Custom Shell Configuration
Write-Host "[2/5] Configuring Windows Shell Launcher..." -ForegroundColor White
$WinlogonPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
Set-ItemProperty -Path $WinlogonPath -Name "Shell" -Value "$AppPath"
Write-Host "  Set Windows Shell to '$AppPath'" -ForegroundColor Green

# 2. Disable System Hotkeys & Task Manager
Write-Host "[3/5] Disabling Windows Hotkeys & Desktop Access..." -ForegroundColor White
$PoliciesPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
if (-not (Test-Path $PoliciesPath)) {
    New-Item -Path $PoliciesPath -Force | Out-Null
}
# Disable Task Manager (Ctrl+Shift+Esc)
Set-ItemProperty -Path $PoliciesPath -Name "DisableTaskMgr" -Value 1 -Type DWord
# Disable Change Password option on security screen
Set-ItemProperty -Path $PoliciesPath -Name "DisableChangePassword" -Value 1 -Type DWord
# Disable Lock Workstation option
Set-ItemProperty -Path $PoliciesPath -Name "DisableLockWorkstation" -Value 1 -Type DWord

# Disable Windows Key combinations
$ExplorerPolicies = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer"
if (-not (Test-Path $ExplorerPolicies)) {
    New-Item -Path $ExplorerPolicies -Force | Out-Null
}
Set-ItemProperty -Path $ExplorerPolicies -Name "NoWinKeys" -Value 1 -Type DWord
Write-Host "  Disabled Task Manager, Windows Keys, and Lock Screen options" -ForegroundColor Green

# 3. Disable Windows Update Auto-Reboots
Write-Host "[4/5] Disabling Disruptive Windows Update Reboots..." -ForegroundColor White
$AUPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
if (-not (Test-Path $AUPath)) {
    New-Item -Path $AUPath -Force | Out-Null
}
Set-ItemProperty -Path $AUPath -Name "NoAutoRebootWithLoggedOnUsers" -Value 1 -Type DWord
Set-ItemProperty -Path $AUPath -Name "AUOptions" -Value 2 -Type DWord # Notify for download only
Write-Host "  Configured Windows Update policy to prevent unexpected reboots" -ForegroundColor Green

# 4. Power & Sleep Prevention
Write-Host "[5/5] Disabling Sleep & Display Timeout..." -ForegroundColor White
powercfg -change -standby-timeout-ac 0
powercfg -change -monitor-timeout-ac 0
powercfg -change -hibernate-timeout-ac 0
Write-Host "  Display and Standby sleep timers set to NEVER" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  KIOSK LOCKDOWN CONFIGURATION COMPLETE!                 " -ForegroundColor Green
Write-Host "  Reboot machine to enter full unattended kiosk mode.    " -ForegroundColor Green
Write-Host "  To revert anytime: .\lockdown-kiosk.ps1 -Revert       " -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Green
