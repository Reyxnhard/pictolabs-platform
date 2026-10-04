[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null
$p = New-Object System.Drawing.Printing.PrinterSettings
$p.PrinterName = 'DS-RX1 (Copy 1)'
Write-Output "Printer: $($p.PrinterName)"
Write-Output "IsValid: $($p.IsValid)"
Write-Output "Copies: $($p.Copies)"
Write-Output "PaperSize: $($p.DefaultPageSettings.PaperSize.PaperName)"
Write-Output "Collate: $($p.Collate)"
