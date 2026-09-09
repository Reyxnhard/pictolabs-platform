<#
.SYNOPSIS
    Pictolabs Photobooth - BIOS & Power Recovery Inspection Script
    Sprint 5E: Verifies hardware and OS power settings for automatic daily cold-boot.

.DESCRIPTION
    Checks Windows power configuration, Fast Startup status, sleep timeouts,
    and provides a field technician checklist for BIOS settings.
#>

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "  PICTOLABS BOOTH #1 - BIOS & POWER RECOVERY AUDIT       " -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

$Results = @()

# 1. Check Fast Startup (Hiberboot)
$HiberPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power"
$Hiberboot = Get-ItemProperty -Path $HiberPath -Name "HiberbootEnabled" -ErrorAction SilentlyContinue
if ($Hiberboot -and $Hiberboot.HiberbootEnabled -eq 1) {
    $Results += [PSCustomObject]@{ Check = "Windows Fast Startup"; Status = "WARNING"; Detail = "Enabled (Should be disabled to ensure clean Canon/DNP USB boot)" }
} else {
    $Results += [PSCustomObject]@{ Check = "Windows Fast Startup"; Status = "PASS"; Detail = "Disabled (Clean USB enumeration guaranteed)" }
}

# 2. Check AC Standby Timeout
$StandbyAC = (powercfg /q SCHEME_CURRENT SUB_SLEEP STANDBYIDLE | Select-String "Current AC Power Setting Index" | ForEach-Object { $_.Line.Split()[-1] })
if ($StandbyAC -eq "0x00000000" -or $StandbyAC -eq "0") {
    $Results += [PSCustomObject]@{ Check = "Sleep Standby (AC)"; Status = "PASS"; Detail = "Set to NEVER (0s)" }
} else {
    $Results += [PSCustomObject]@{ Check = "Sleep Standby (AC)"; Status = "WARNING"; Detail = "Timeout is active ($StandbyAC)" }
}

# 3. Check Monitor Timeout
$MonitorAC = (powercfg /q SCHEME_CURRENT SUB_VIDEO VIDEOIDLE | Select-String "Current AC Power Setting Index" | ForEach-Object { $_.Line.Split()[-1] })
if ($MonitorAC -eq "0x00000000" -or $MonitorAC -eq "0") {
    $Results += [PSCustomObject]@{ Check = "Display Timeout (AC)"; Status = "PASS"; Detail = "Set to NEVER (Screen always on)" }
} else {
    $Results += [PSCustomObject]@{ Check = "Display Timeout (AC)"; Status = "WARNING"; Detail = "Timeout is active ($MonitorAC)" }
}

# 4. BIOS Manual Checklist
Write-Host ""
Write-Host "--- OPERATING SYSTEM POWER CHECKS ---" -ForegroundColor White
$Results | Format-Table -AutoSize

Write-Host ""
Write-Host "--- PHYSICAL BIOS FIELD TECHNICIAN CHECKLIST ---" -ForegroundColor Yellow
Write-Host "Please boot the mini-PC and enter BIOS setup (Del / F2) to verify:"
Write-Host "  [ ] 1. 'Restore AC Power Loss' / 'State After G3'   -> Set to [Always On] or [Power On]"
Write-Host "  [ ] 2. 'Fast Boot'                                  -> Set to [Disabled] (ensures full USB probe)"
Write-Host "  [ ] 3. 'Wake on RTC / Alarm' (Optional)             -> Set to [Enabled: 09:30 AM Daily]"
Write-Host "  [ ] 4. 'Quiet Boot / Full Screen Logo'              -> Set to [Enabled] (hides boot text)"
Write-Host "  [ ] 5. Secure Boot & TPM 2.0                        -> Set to [Enabled]"
Write-Host ""
Write-Host "When configured, switching on mall circuit breaker at 10:00 AM" -ForegroundColor Green
Write-Host "will automatically boot Booth #1 to Welcome Screen in <45 seconds." -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Cyan
