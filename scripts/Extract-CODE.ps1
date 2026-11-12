# Runs only on Windows with Microsoft Excel desktop installed.
# The main Electron process passes a PRIVATE WORKING COPY of the xlsx workbook.
# This script does NOT touch the original ranking HTML or original workbook.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Workbook,
  [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$categories = @(
  @{ Key='kitchen'; Name='Kitchen'; Formula='J14'; Value='J15'; InputRow=4 },
  @{ Key='home'; Name='Home Living'; Formula='J30'; Value='J31'; InputRow=17 },
  @{ Key='travel'; Name='Travel'; Formula='J46'; Value='J47'; InputRow=30 },
  @{ Key='beauty'; Name='Beauty'; Formula='J62'; Value='J63'; InputRow=43 },
  @{ Key='sports'; Name='Sports'; Formula='J78'; Value='J79'; InputRow=56 },
  @{ Key='outdoor'; Name='Outdoor'; Formula='J94'; Value='J95'; InputRow=69 },
  @{ Key='bags'; Name='Bags & Accessories'; Formula='J110'; Value='J111'; InputRow=82 },
  @{ Key='fashion'; Name='Fashion'; Formula='J126'; Value='J127'; InputRow=95 },
  @{ Key='kids'; Name='Kids & Baby'; Formula='J142'; Value='J143'; InputRow=108 }
)

if (-not (Test-Path -LiteralPath $Workbook -PathType Leaf)) { throw "Working Excel file not found: $Workbook" }
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$app = $null; $book = $null; $sheet = $null; $update = $null
try {
  Write-Output 'Opening private workbook in Excel (VBA macros disabled)'
  try { $app = New-Object -ComObject Excel.Application }
  catch { throw 'Microsoft Excel Desktop is required. Excel COM could not be started.' }
  $app.Visible = $false
  $app.DisplayAlerts = $false
  $app.EnableEvents = $false
  $app.AskToUpdateLinks = $false
  $app.AutomationSecurity = 3 # msoAutomationSecurityForceDisable
  $book = $app.Workbooks.Open($Workbook, 0, $false)
  if ([bool]$book.ReadOnly) { throw 'Working copy opened read-only. Cannot refresh CODE values.' }
  $sheet = $book.Worksheets.Item('CODE')
  $update = $book.Worksheets.Item('0722update')
  $app.Calculation = -4105 # xlCalculationAutomatic
  $app.CalculateFullRebuild()
  $started = Get-Date
  while ([int]$app.CalculationState -ne 0) {
    if (((Get-Date) - $started).TotalSeconds -gt 90) { throw 'Excel formula calculation exceeded 90 seconds.' }
    Start-Sleep -Milliseconds 350
  }

  $manifest = @()
  foreach ($cat in $categories) {
    $from = $sheet.Range($cat.Formula)
    $to = $sheet.Range($cat.Value)
    if (-not [bool]$from.HasFormula) { throw "$($cat.Name): CODE!$($cat.Formula) no longer contains a formula." }
    $calculated = $from.Value2
    if (-not ($calculated -is [string]) -or $calculated.Length -lt 1000) {
      throw "$($cat.Name): CODE!$($cat.Formula) did not calculate into complete HTML."
    }
    $from.Copy() | Out-Null
    $to.PasteSpecial(12) | Out-Null  # xlPasteValuesAndNumberFormats = 12
    try { $app.CutCopyMode = $false } catch { }
    $staticHtml = $to.Value2
    if (-not ($staticHtml -is [string]) -or $staticHtml -cne $calculated) {
      throw "$($cat.Name): Paste Special values differed from formula result."
    }
    $rows = @()
    for ($i=0; $i -lt 10; $i++) {
      $r = [int]$cat.InputRow + $i
      $id = $update.Cells.Item($r, 2).Value2
      $brand = $update.Cells.Item($r, 3).Value2
      if ($null -eq $id -or $null -eq $brand) { throw "$($cat.Name): missing item ID or brand at row $r." }
      $rows += @{ id = ([string]$id).Trim(); brand = ([string]$brand).Trim() }
    }
    $manifest += @{
      key = $cat.Key; name = $cat.Name; formula = $cat.Formula;
      value = $cat.Value; inputRow = $cat.InputRow;
      html = $staticHtml; rows = $rows
    }
    Write-Output ("OK {0}: CODE!{1} => CODE!{2}, {3} chars" -f $cat.Name,$cat.Formula,$cat.Value,$staticHtml.Length)
  }
  $book.Save() # Only the working COPY is saved; Electron controls committing later.
  $outPath = Join-Path $OutputDirectory 'manifest.json'
  [IO.File]::WriteAllText($outPath, ($manifest | ConvertTo-Json -Depth 7), ([System.Text.UTF8Encoding]::new($false)))
  Write-Output ('SAVED ' + $outPath)
}
finally {
  if ($book) { try { $book.Close($false) } catch {} }
  if ($app) { try { $app.Quit() } catch {} }
  foreach ($obj in @($update, $sheet, $book, $app)) {
    if ($null -ne $obj) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj) } catch {} }
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
