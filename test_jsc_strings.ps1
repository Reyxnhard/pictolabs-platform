$bytes = [System.IO.File]::ReadAllBytes("c:\Users\ezarh\.gemini\antigravity-ide\scratch\Pictolabs\extracted-asar\out\main\index.jsc")
$chars = [System.Text.Encoding]::ASCII.GetString($bytes)
$matches = [regex]::Matches($chars, '[\x20-\x7E]{4,}') | ForEach-Object { $_.Value } | Where-Object { $chars.IndexOf($_) -ge 904000 -and $chars.IndexOf($_) -le 908000 }
$matches | Select-Object -Unique
