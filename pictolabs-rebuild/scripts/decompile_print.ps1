$path = "C:\Users\ezarh\.gemini\antigravity-ide\scratch\Pictolabs\pictolabs-rebuild\scripts\extracted_24e00.dll"
$bytes = [System.IO.File]::ReadAllBytes($path)
$asm = [System.Reflection.Assembly]::Load($bytes)
Write-Output "Assembly: $($asm.FullName)"
$types = @()
try {
  $types = $asm.GetTypes()
} catch [System.Reflection.ReflectionTypeLoadException] {
  $types = $_.Exception.Types | Where-Object { $_ -ne $null }
  Write-Output "Caught LoaderExceptions: $($_.Exception.LoaderExceptions.Count)"
  foreach ($le in $_.Exception.LoaderExceptions) {
    Write-Output "  LoaderError: $($le.Message)"
  }
}

foreach ($t in $types) {
  Write-Output "Type: $($t.FullName)"
  foreach ($m in $t.GetMethods([System.Reflection.BindingFlags]'Public,NonPublic,Static,Instance')) {
    if ($m.DeclaringType -eq $t) {
      $params = ($m.GetParameters() | ForEach-Object { "$($_.ParameterType.Name) $($_.Name)" }) -join ", "
      Write-Output "  Method: $($m.Name)($params)"
    }
  }
}
