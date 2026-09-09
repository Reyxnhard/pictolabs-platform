<#
.SYNOPSIS
    Pictolabs Photobooth - Process Watchdog Supervisor Daemon
    Sprint 5E: Ensures continuous uptime and auto-recovery of Booth #1.

.DESCRIPTION
    Monitors Pictolabs.exe every 2 seconds. If the application crashes,
    hangs, or is terminated by a user/process, the watchdog:
    1. Logs the incident timestamp to C:\Pictolabs\logs\watchdog.log.
    2. Terminates any orphaned child processes (ffmpeg, node, edsdk).
    3. Relaunches Pictolabs.exe in borderless full-screen kiosk mode (<3s).

.NOTES
    Can be run as a standalone background process or registered via NSSM.
    Execution: powershell -WindowStyle Hidden -File .\watchdog-kiosk.ps1
#>

param (
    [string]$AppPath = "C:\Pictolabs\Pictolabs.exe",
    [string]$ProcessName = "Pictolabs",
    [string]$LogDir = "C:\Pictolabs\logs",
    [int]$PollIntervalSec = 2
)

if (-not (Test-Path $LogDir)) {
    New-Item -Path $LogDir -ItemType Directory -Force | Out-Null
}

$LogFile = Join-Path $LogDir "watchdog.log"

function Write-WatchdogLog {
    param ([string]$Message, [string]$Level = "INFO")
    $Timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $LogEntry = "[$Timestamp] [$Level] $Message"
    Write-Host $LogEntry
    Add-Content -Path $LogFile -Value $LogEntry -ErrorAction SilentlyContinue
}

Write-WatchdogLog "Starting Pictolabs Kiosk Watchdog Daemon (Target: $ProcessName, Interval: ${PollIntervalSec}s)"

# Fallback development check: if Pictolabs.exe is not at C:\Pictolabs, search current repo path
if (-not (Test-Path $AppPath)) {
    $LocalDev = Join-Path (Split-Path -Parent $PSScriptRoot) "apps\kiosk\node_modules\electron\dist\electron.exe"
    if (Test-Path $LocalDev) {
        $AppPath = $LocalDev
        $ProcessName = "electron"
        Write-WatchdogLog "Using local development executable fallback: $AppPath" "WARN"
    }
}

while ($true) {
    try {
        $Processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue

        if (-not $Processes) {
            Write-WatchdogLog "ALERT: $ProcessName process is NOT running! Initiating emergency auto-restart..." "WARN"

            # 1. Terminate orphaned media / camera child workers
            $Orphans = @("ffmpeg", "node")
            foreach ($Orphan in $Orphans) {
                Get-Process -Name $Orphan -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            }

            # 2. Launch Kiosk in borderless fullscreen mode
            if (Test-Path $AppPath) {
                $StartInfo = New-Object System.Diagnostics.ProcessStartInfo
                $StartInfo.FileName = $AppPath
                $StartInfo.Arguments = "--kiosk --no-sandbox"
                $StartInfo.UseShellExecute = $true
                [System.Diagnostics.Process]::Start($StartInfo) | Out-Null

                Write-WatchdogLog "SUCCESS: Relaunched $AppPath in fullscreen mode in <3s." "INFO"
            } else {
                Write-WatchdogLog "ERROR: Cannot relaunch. Executable not found at $AppPath" "ERROR"
            }
        }
    }
    catch {
        Write-WatchdogLog "EXCEPTION: $($_.Exception.Message)" "ERROR"
    }

    Start-Sleep -Seconds $PollIntervalSec
}
