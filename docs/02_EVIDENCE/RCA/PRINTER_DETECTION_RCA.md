# ROOT CAUSE ANALYSIS: PRINTER DETECTION SUBSYSTEM & `NO_PRINTER` STATE
**Document ID:** `PRINTER_DETECTION_RCA.md`  
**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystem:** Printer Hardware Detection & Health Monitoring (`PrintService.ts` & `PrinterMonitorService.ts`)  
**Target Device:** DNP DS-RX1 Thermal Photo Printer (Port: `USB001`, Driver: `DS-RX1`)  
**Date:** September 23, 2026  
**Status:** COMPLETE (Zero Implementation — Strictly Empirical Runtime & Code Evidence)

---

## 1. Executive Summary

During validation of the Photobooth kiosk, the following physical and software states were observed:
- **Windows Spooler**: Detects `DS-RX1` on port `USB001` with driver `DS-RX1`. Status: `Normal`.
- **Physical Cut Test**: When pressing "Uji Potong (Cut Test)" in the Admin Panel, paper physically feeds, cuts, and ejects correctly.
- **Admin Panel UI**: The Thermal Printer card displays badge `⚠️ NO_PRINTER`, Status: `"Printer tidak terhubung ke Windows"`, Detection Code: `NO_PRINTER`.

### The Core Finding
There is a fundamental architectural split between the **printing path** and the **detection path**:

1. **The Printing Path Works**:
   - "Cut Test" and customer photo printing invoke `rundll32 shimgvw.dll,ImageView_PrintTo /pt "${escapedPath}" "DS-RX1"` directly through the Windows Print Spooler.
   - The Spooler receives the command, maps it to driver `DS-RX1` on `USB001`, and the hardware reacts immediately.

2. **The Detection Path Fails Due to a PowerShell Command Corruption Bug**:
   - `PrintService.ts:queryPrinterHealth()` attempts to query detailed hardware health via PowerShell CIM (`Get-CimInstance Win32_Printer`).
   - The code flattens the multi-line PowerShell script using `.replace(/\n/g, ' ')` **without inserting statement semicolons (`;`)**, while embedding nested unescaped double quotes (`-Filter "Name = 'DS-RX1'"`) inside `-Command "..."`.
   - Windows `cmd.exe` and PowerShell fail to parse the command, raising a fatal syntax error:  
     `ParameterAlreadyBound: Cannot bind parameter because parameter 'ErrorAction' is specified more than once.`
   - `exec()` catches the error and resolves an empty string (`stdout = ""`).
   - In `PrintService.ts:160`, `if (!stdout || stdout === 'NOT_FOUND')` triggers, unconditionally setting:  
     `code = 'NO_PRINTER'`  
     `message = 'Printer tidak terhubung ke Windows'`
   - A companion service, `PrinterMonitorService.ts`, suffers the exact same flaw (`The hash literal was incomplete. Unexpected token 'Name'`) and constantly resolves to `{ connected: false, status: 'OFFLINE' }`.

---

## 2. Empirical Runtime Evidence

### 2.1 Windows Native Printer Status (`Get-Printer`)
Executed directly on the kiosk Windows host:
```powershell
Get-Printer | Select-Object Name, DriverName, PortName, PrinterStatus | Format-List
```
**Output:**
```text
Name          : DS-RX1
DriverName    : DS-RX1
PortName      : USB001
PrinterStatus : Normal

Name          : Microsoft Print to PDF
DriverName    : Microsoft Print To PDF
PortName      : PORTPROMPT:
PrinterStatus : Normal
```
**Evidence:** The physical printer is recognized by Windows OS, bound to port `USB001`, with driver `DS-RX1`, and reporting status `Normal`.

---

### 2.2 WMI / CIM Object State (`Win32_Printer`)
Querying the raw WMI printer class via PowerShell:
```powershell
Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq 'DS-RX1' } | Select-Object Name, DriverName, PortName, PrinterStatus, PrinterState, DetectedErrorState, ExtendedPrinterStatus, WorkOffline | Format-List
```
**Output:**
```text
Name                  : DS-RX1
DriverName            : DS-RX1
PortName              : USB001
PrinterStatus         : 3
PrinterState          : 0
DetectedErrorState    : 0
ExtendedPrinterStatus : 2
WorkOffline           : False
```

**Interpretation of CIM Values:**
- `PrinterStatus = 3`: **Normal / Idle** (Ready to accept jobs).
- `PrinterState = 0`: **Ready** (No pending error states).
- `DetectedErrorState = 0`: **No Error** (Paper OK, ribbon OK, door closed, no jam).
- `WorkOffline = False`: **Online** (Connected to USB).

---

### 2.3 Exact Failure Reproduction of `PrintService.ts:131-158`
When executing the exact script constructed by `PrintService.ts:131-158` in Node `child_process.exec()`:
```javascript
const psCmd = `
  $p = Get-CimInstance Win32_Printer -Filter "Name = '${escaped}'" -ErrorAction SilentlyContinue
  if (-not $p) {
    Write-Output "NOT_FOUND"
    exit
  }
  $jobs = Get-PrintJob -PrinterName '${escaped}' -ErrorAction SilentlyContinue
  $hasJobError = ($jobs | Where-Object { $_.JobStatus -match 'Error|PaperOut|Blocked|UserIntervention' }).Count -gt 0
  $jobStatuses = @($jobs | ForEach-Object { $_.JobStatus })
  
  [PSCustomObject]@{
    Name = $p.Name
    WorkOffline = [bool]$p.WorkOffline
    PrinterStatus = [int]$p.PrinterStatus
    PrinterState = [int]$p.PrinterState
    DetectedErrorState = [int]$p.DetectedErrorState
    ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus
    HasJobError = [bool]$hasJobError
    JobStatuses = $jobStatuses
  } | ConvertTo-Json -Compress
`.replace(/\n/g, ' ');

exec(`powershell -NoProfile -Command "${psCmd}"`, ...);
```

**Runtime Output from `exec()`:**
```text
err: Command failed: powershell -NoProfile -Command "   $p = Get-CimInstance Win32_Printer -Filter "Name = 'DS-RX1'" -ErrorAction SilentlyContinue   if (-not $p) {     Write-Output "NOT_FOUND"     exit   } ... "
Get-CimInstance : Cannot bind parameter because parameter 'ErrorAction' is specified more than once. To provide 
multiple values to parameters that can accept multiple values, use the array syntax. For example, "-parameter 
value1,value2,value3".
At line:1 char:195
+ ...   }   $jobs = Get-PrintJob -PrinterName 'DS-RX1' -ErrorAction Silentl ...
+                                                      ~~~~~~~~~~~~
    + CategoryInfo          : InvalidArgument: (:) [Get-CimInstance], ParameterBindingException
    + FullyQualifiedErrorId : ParameterAlreadyBound,Microsoft.Management.Infrastructure.CimCmdlets.GetCimInstanceCommand

stdout: ""
```

**Consequence in `PrintService.ts:160`:**
Because `err` occurred, `stdout` is empty `""`.  
The condition `if (!stdout || stdout === 'NOT_FOUND')` evaluates to `true`, directly producing:
```json
{
  "ready": false,
  "name": "DS-RX1",
  "code": "NO_PRINTER",
  "message": "Printer tidak terhubung ke Windows"
}
```

---

### 2.4 Exact Failure Reproduction of `PrinterMonitorService.ts:50-73`
When executing the script constructed by `PrinterMonitorService.ts:50-73`:
```javascript
const script = `
  $p = Get-CimInstance -ClassName Win32_Printer -Filter "Name = '${escapedName}'" -ErrorAction SilentlyContinue
  if (-not $p) {
    $p = Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default -eq $true }
  }
  if ($p) {
    [PSCustomObject]@{
      Found = $true
      Name = $p.Name
      WorkOffline = [bool]$p.WorkOffline
      DetectedErrorState = [int]$p.DetectedErrorState
      ExtendedPrinterStatus = [int]$p.ExtendedPrinterStatus
      PrinterStatus = [int]$p.PrinterStatus
      PrinterState = [int]$p.PrinterState
    } | ConvertTo-Json -Compress
  } else {
    [PSCustomObject]@{ Found = $false } | ConvertTo-Json -Compress
  }
`;

exec(`powershell -NoProfile -NonInteractive -Command "${script.replace(/\n/g, ' ')}"`, ...);
```

**Runtime Output from `exec()`:**
```text
err: Command failed: powershell -NoProfile -NonInteractive -Command " ... [PSCustomObject]@{ Found = $true Name = $p.Name ... "
At line:1 char:276
+ ...  ($p) {     [PSCustomObject]@{       Found = $true       Name = $p.Na ...
+                                                              ~~~~
Unexpected token 'Name' in expression or statement.
At line:1 char:269
+ ...  }   }   if ($p) {     [PSCustomObject]@{       Found = $true       N ...
+                                                                  ~
The hash literal was incomplete.
    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : UnexpectedToken

stdout: ""
```

**Consequence in `PrinterMonitorService.ts:74`:**
`err` is present and `stdout` is `""`.  
It resolves `{ connected: false, detectedErrorState: 0, extendedPrinterStatus: 0, workOffline: true }`.  
After 2 failed cycles (`DEBOUNCE_THRESHOLD = 2`), line 126 sets:
```json
{
  "connected": false,
  "ready": false,
  "status": "OFFLINE",
  "name": "DS-RX1",
  "message": "Printer tidak terhubung atau kabel USB terputus",
  "errorCode": "PRINTER_OFFLINE"
}
```

---

## 3. End-to-End Call Chain: From Hardware to UI Badge

```
[ Physical Printer: DNP DS-RX1 ]
               │ (USB 2.0 cable on port USB001)
               ▼
[ Windows 11 Spooler & WMI Subsystem ]
  • Get-Printer: Name="DS-RX1", Driver="DS-RX1", Status="Normal"
  • Win32_Printer: PrinterStatus=3, PrinterState=0, WorkOffline=False
               │
               ├──────────────────────────────────────────────┐
               │ PRINTING PATH (WORKING)                      │ DETECTION PATH (FAILING)
               ▼                                              ▼
[ PrintService.ts: printImage() ]              [ PrintService.ts: queryPrinterHealth() ]
  • Invokes: rundll32 shimgvw.dll,              • Constructs multi-line PowerShell string
    ImageView_PrintTo /pt                         $p = Get-CimInstance ... [PSCustomObject]@{...}
  • Direct Windows Spooler API call             • Calls .replace(/\n/g, ' ') (strips newlines)
               │                                • Invokes: powershell -Command "${psCmd}"
               │                                              │
               │                                              ▼
               │                               [ Windows cmd.exe / PowerShell CLI Parser ]
               │                                 • Strips nested double quotes
               │                                 • Run-on commands without semicolons
               │                                 • Throws: ParameterAlreadyBound / UnexpectedToken
               │                                 • Process exit code = 1; stdout = ""
               │                                              │
               │                                              ▼
               │                               [ PrintService.ts: lines 160-169 ]
               │                                 • Evaluates if (!stdout) -> TRUE
               │                                 • Sets cachedHealth:
               │                                   code: "NO_PRINTER"
               │                                   message: "Printer tidak terhubung ke Windows"
               │                                              │
               │                                              ▼
               │                               [ Electron IPC Channel: 'printer:health' ]
               │                                              │
               │                                              ▼
               │                               [ Preload Bridge: kiosk.printer.getHealth() ]
               │                                              │
               │                                              ▼
               │                               [ React Renderer: AdminScreen.tsx:233 ]
               │                                 • refreshDiagnostics() receives cachedHealth
               │                                 • setPrinterHealth(health)
               │                                              │
               │                                              ▼
               ▼                               [ Operator Control Panel UI Badge ]
[ Cut Test Ejects Paper Successfully ]           • Header: "Thermal Printer"
                                                 • Subtitle: "DS-RX1"
                                                 • Badge: "⚠️ NO_PRINTER" (Red pulse pill)
                                                 • Pesan Status: "Printer tidak terhubung ke Windows"
                                                 • Kode Deteksi: "NO_PRINTER"
```

---

## 4. Investigation of Focus Areas

### 4.1 `PrinterMonitorService.ts`
- **Location**: [`apps/kiosk/electron/services/PrinterMonitorService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrinterMonitorService.ts)
- **Role**: 5000ms background polling loop intended to update hardware metrics (`cpuTemp`, `paperCount`, `printerState`).
- **Defect**: Lines 50–71 format a multi-line PSCustomObject script and execute `.replace(/\n/g, ' ')`. In PowerShell, a hashtable or PSCustomObject (`[PSCustomObject]@{ Key1 = Val1 \n Key2 = Val2 }`) **requires newlines or semicolons** between members. Replacing `\n` with a space creates invalid syntax (`[PSCustomObject]@{ Key1 = Val1 Key2 = Val2 }`), throwing `UnexpectedToken` every single time it runs.

### 4.2 Printer Detection Query
- **Initial Discovery**:
  In [`PrintService.ts:85-99`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts#L85-L99), `listPrintersSync()` executes:
  ```powershell
  Get-Printer | Select-Object -ExpandProperty Name
  ```
  This command runs cleanly on a single line and successfully discovers `['DS-RX1', 'Microsoft Print to PDF']`.
- **Heuristic Selection**:
  In [`PrintService.ts:105-114`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts#L105-L114), `autoDetectPrinter()` iterates:
  `['DNP', 'Citizen', 'Photo', 'Mitsubishi', 'HiTi', 'RX1', 'DS620', 'CX-02']`.
  `'DS-RX1'` contains `'RX1'`, so `autoDetectPrinter()` **correctly selects `'DS-RX1'`**.
- **Hardware Health Query**:
  In `PrintService.ts:119-158`, `queryPrinterHealth('DS-RX1')` constructs the multi-line PowerShell command that fails due to string flattening and nested quotes.

### 4.3 WMI / PowerShell Commands
The WMI query:
```powershell
Get-CimInstance Win32_Printer -Filter "Name = 'DS-RX1'"
```
works 100% when executed natively in PowerShell.  
However, when wrapped in Node's `child_process.exec(`powershell -NoProfile -Command "${psCmd}"`)`:
1. `cmd.exe` strips the inner double quotes around `-Filter "Name = 'DS-RX1'"`, leaving `-Filter Name = 'DS-RX1'`.
2. The missing statement separators cause PowerShell to treat subsequent tokens as parameters to `Get-CimInstance`, resulting in `ParameterAlreadyBound: ErrorAction`.

### 4.4 Name Matching Logic
- The detected printer name is `'DS-RX1'`.
- In `PrintService.ts`, `defaultPrinterName` is set to `'DS-RX1'`.
- In `PrinterMonitorService.ts:120`:
  ```typescript
  const targetPrinter = getDefaultPrinterName() || 'DNP DS-RX1';
  ```
  If `PrinterMonitorService` runs an initial check before `PrintService` initializes `defaultPrinterName`, it falls back to `'DNP DS-RX1'`. Since the Windows printer name is `'DS-RX1'`, WMI query `Name = 'DNP DS-RX1'` would fail to match even if PowerShell syntax were valid.

### 4.5 Driver Matching Logic
- Neither `PrintService.ts` nor `PrinterMonitorService.ts` checks the `DriverName` property. They only match on the printer `Name`.
- If a kiosk operator or technician renames the printer in Windows to e.g. `Photobooth Printer` or `DS-RX1 (Copy 1)`, strict equality matching on `Name` breaks detection even if the driver is `DS-RX1`.

### 4.6 Health State Mapping
In `PrintService.ts:178-220`:
- `WorkOffline: true` → `'OFFLINE'`
- `DetectedErrorState: 4` or `6` → `'PAPER_OUT'`
- `DetectedErrorState: 8` → `'JAMMED'`
- `DetectedErrorState: 7` → `'DOOR_OPEN'`
- `PrinterStatus: 3` and `PrinterState: 0` → `'OK'`
This mapping logic is well-designed, but it is **never reached** because execution aborts at line 160 due to `!stdout`.

### 4.7 `NO_PRINTER` Assignment Path
The exact line of code assigning `NO_PRINTER` is [`PrintService.ts:164`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/PrintService.ts#L164):
```typescript
160: if (!stdout || stdout === 'NOT_FOUND') {
161:   cachedHealth = {
162:     ready: false,
163:     name: printerName,
164:     code: 'NO_PRINTER',
165:     message: 'Printer tidak terhubung ke Windows',
166:     checkedAt: now,
167:   };
168:   return cachedHealth;
169: }
```
Because the PowerShell command throws an unhandled syntax exception, `stdout` is empty (`""`). `!stdout` evaluates to `true`, and the system assigns `NO_PRINTER`.

---

## 5. Verification of the Fix: EncodedCommand Proof

To confirm that the hardware and WMI queries function perfectly once the PowerShell syntax flaw is removed, a test script was executed using PowerShell's native `-EncodedCommand` (UTF-16LE Base64):

```javascript
const b64 = Buffer.from(fullScript, 'utf16le').toString('base64');
exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${b64}`, ...);
```

### Result:
```json
{
  "Name": "DS-RX1",
  "WorkOffline": false,
  "PrinterStatus": 3,
  "PrinterState": 0,
  "DetectedErrorState": 0,
  "ExtendedPrinterStatus": 2,
  "HasJobError": false,
  "JobStatuses": []
}
```
**Computed Health from Live Hardware:**
```javascript
{
  ready: true,
  name: 'DS-RX1',
  code: 'OK',
  message: 'Printer siap'
}
```
When queried without syntax corruption, the DNP DS-RX1 returns `ready: true`, `code: 'OK'`, and `message: 'Printer siap'`.

---

## 6. Proposed Fix (No Implementation Done Yet)

To resolve the printer detection failure without altering the physical setup:

### Step 1: Fix PowerShell Invocation via Base64 `-EncodedCommand`
In both `PrintService.ts:queryPrinterHealth()` and `PrinterMonitorService.ts:queryWin32PrinterState()`:
- Replace `psCmd.replace(/\n/g, ' ')` with standard UTF-16LE Base64 encoding passed to `powershell.exe -NoProfile -NonInteractive -EncodedCommand <base64>`.
- Alternatively, use semicolons (`;`) between every statement and replace double quotes around the `-Filter` parameter with single quotes (`-Filter "Name = '${escaped}'"` → `-Filter 'Name = ''${escaped}'''`).
- Base64 `-EncodedCommand` is 100% immune to Windows command-line quote stripping, newline flattening, and shell argument injection.

### Step 2: Add Resilient Driver Matching Fallback
Update `queryPrinterHealth` and `queryWin32PrinterState` to query by both `Name` and `DriverName`:
```powershell
$p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq '${escaped}' -or $_.DriverName -like '*DS-RX1*' -or $_.DriverName -like '*RX1*' } | Select-Object -First 1
```
This ensures detection succeeds even if Windows names the device `DS-RX1 (Copy 1)` or `DNP DS-RX1`.

### Step 3: Add Semicolons to `[PSCustomObject]` in `PrinterMonitorService.ts`
Format the hashtable properties with explicit semicolons so that even unencoded single-line strings parse cleanly:
```powershell
[PSCustomObject]@{ Found = $true; Name = $p.Name; WorkOffline = [bool]$p.WorkOffline; ... }
```

### Step 4: Validate on Kiosk
Run the verification script, re-check `kiosk.printer.getHealth()`, and confirm that the Operator Control Panel reflects:
- Badge: `✓ SIAP`
- Pesan Status: `Printer siap`
- Kode Deteksi: `OK`
