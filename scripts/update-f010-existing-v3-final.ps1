# F010 — GUARDED existing Web App V3 report-code update for ONE Final UAT only.
# Do NOT run during development. Never creates a new project/deployment/Sheet.
# No ThaiPHC API call, no person-data request and no Script Property mutation.
[CmdletBinding()]
param([string]$RepoPath='.')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Invoke-Clasp {
 param([string[]]$ArgsList)
 $result=@(& npx.cmd --yes '@google/clasp@latest' @ArgsList)
 if ($LASTEXITCODE -ne 0) {throw ('clasp command failed: '+($ArgsList -join ' '))}
 return $result
}
function Git-One {
 param([string[]]$ArgsList)
 $result=@(& git -C $repo @ArgsList)
 if ($LASTEXITCODE -ne 0 -or $result.Count -ne 1) {
  throw 'Git returned no unique result. STOP.'
 }
 return $result[0].Trim()
}
foreach($name in @('git','node.exe','npx.cmd')){
 if (-not (Get-Command $name -ErrorAction SilentlyContinue)){
  throw ('Missing executable: '+$name)
 }
}
$repo=(Resolve-Path -LiteralPath $RepoPath).Path
$cfg=Join-Path $repo 'config\thaiphc-targets.json'
$code=Join-Path $repo 'apps-script\Code.gs'
$report=Join-Path $repo 'apps-script\ReportReceiver.gs'
$manifest=Join-Path $repo 'apps-script\appsscript.json'
foreach($path in @($cfg,$code,$report,$manifest)){
 if(-not(Test-Path -LiteralPath $path -PathType Leaf)){
  throw 'F010 reviewed source file missing.'
 }
}
$target=Get-Content -LiteralPath $cfg -Raw | ConvertFrom-Json
if($target.scriptId -notmatch '^[A-Za-z0-9_-]{30,120}$' -or
   $target.deploymentId -notmatch '^AKfycb[A-Za-z0-9_-]{40,120}$' -or
   $target.spreadsheetId -notmatch '^[A-Za-z0-9_-]{30,120}$'){
 throw 'Invalid pinned target IDs'
}
if((Git-One -ArgsList @('branch','--show-current')) -cne 'main'){
 throw 'F010 Final UAT must run on approved clean main.'
}
$dirty=@(& git -C $repo status --porcelain)
if ($LASTEXITCODE -ne 0 -or ($dirty -join '').Trim().Length -ne 0){
 throw 'Dirty worktree STOP; no remote action.'
}
# Only this exact F010-reviewed code is allowed. Change pins only after review.
$oldCodeBlob='f7d878389fe46cfde8619f75a1f9746f45b469a3'
$newCodeBlob='e542d585d4d4840836c9f1114ac350081ebe5952'
$newReportBlob='72e362054cd838ebe52ac3a4e593233ca69fab6f'
$manifestBlob='a8134a3237b2dce1f54ce16a943fbe3e232ce436'
if((Git-One -ArgsList @('hash-object','--',$code)) -cne $newCodeBlob -or
   (Git-One -ArgsList @('hash-object','--',$report)) -cne $newReportBlob -or
   (Git-One -ArgsList @('hash-object','--',$manifest)) -cne $manifestBlob){
 throw 'Current branch source differs from reviewed F010 pinned SHA blobs. STOP.'
}
$text=[IO.File]::ReadAllText($code)
$reportText=[IO.File]::ReadAllText($report)
if(-not $text.Contains("props.getProperty('THAIPHC_RECEIVER_ENABLED')!=='true'") -or
   -not $text.Contains("props.getProperty('THAIPHC_WRITE_ENABLED')!=='true'") -or
   -not $text.Contains("props.getProperty('THAIPHC_PERSON_DATA_WRITE_ENABLED')!=='true'") -or
   -not $reportText.Contains('THAIPHC_REPORT_SPREADSHEET_ID')){
 throw 'Critical three-way disable/private-target guards not present. STOP.'
}
Write-Host 'Review the existing Web App V3 deployment ID and original data target.'
Write-Host 'THAIPHC_RECEIVER_ENABLED=false'
Write-Host 'THAIPHC_WRITE_ENABLED=false'
Write-Host 'THAIPHC_PERSON_DATA_WRITE_ENABLED=false (or absent)'
Write-Host 'A separate RESTRICTED destination Sheet is required for person reports.'
$off=Read-Host 'After privately verifying all THREE flags OFF, type OFF'
if($off -cne 'OFF'){throw 'Cancelled before network mutation.'}
$stamp=(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$stage=Join-Path ([IO.Path]::GetTempPath()) ('thaiphc-F010-'+$stamp)
$backup=Join-Path ([Environment]::GetFolderPath('UserProfile')) ('thaiphc-F010-backup-'+$stamp)
New-Item -Path $stage -ItemType Directory -Force | Out-Null
New-Item -Path $backup -ItemType Directory -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $stage '.clasp.json'),
 (@{scriptId=$target.scriptId}|ConvertTo-Json -Compress),
 (New-Object Text.UTF8Encoding($false)))
Push-Location $stage
try {
 $before=@(Invoke-Clasp -ArgsList @('list-deployments'))
 if(-not (($before -join [Environment]::NewLine).Contains($target.deploymentId))){
  throw 'Existing V3 deployment not found. STOP.'
 }
 Invoke-Clasp -ArgsList @('pull') | Out-Host
 $pulled=@(Get-ChildItem -LiteralPath $stage -Recurse -File -Force |
  Where-Object { $_.Name -cne '.clasp.json' })
 foreach($f in $pulled){
  $rel=$f.FullName.Substring($stage.Length).TrimStart([char]'\',[char]'/')
  $dest=Join-Path $backup $rel
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
 }
 Write-Host ('Preserved remote source backup: '+$backup)
 $names=@($pulled | ForEach-Object {
  $_.FullName.Substring($stage.Length).TrimStart([char]'\',[char]'/')
 })
 if($names.Count -ne 2 -or
    -not($names -ccontains 'appsscript.json') -or
    (-not($names -ccontains 'Code.gs') -and -not($names -ccontains 'Code.js'))){
  throw 'Pulled remote project contains unexpected sources. No push.'
 }
 $codeName=if($names -ccontains 'Code.gs'){'Code.gs'}else{'Code.js'}
 $remoteCode=Join-Path $stage $codeName
 $remoteManifest=Join-Path $stage 'appsscript.json'
 if((Git-One -ArgsList @('hash-object','--',$remoteCode)) -cne $oldCodeBlob -or
    (Git-One -ArgsList @('hash-object','--',$remoteManifest)) -cne $manifestBlob){
  throw 'Remote V3 source is NOT the expected preimage. STOP; reconcile.'
 }
 if($codeName -cne 'Code.gs'){
  Remove-Item -LiteralPath $remoteCode -Force -ErrorAction Stop
 }
 Copy-Item -LiteralPath $code -Destination (Join-Path $stage 'Code.gs') -Force
 Copy-Item -LiteralPath $report -Destination (Join-Path $stage 'ReportReceiver.gs') -Force
 Copy-Item -LiteralPath $manifest -Destination $remoteManifest -Force
 $names=@(Get-ChildItem -LiteralPath $stage -Recurse -File -Force |
  Where-Object { $_.Name -cne '.clasp.json' } |
  ForEach-Object { $_.FullName.Substring($stage.Length).TrimStart([char]'\',[char]'/') })
 if($names.Count -ne 3 -or -not($names -ccontains 'Code.gs') -or
    -not($names -ccontains 'ReportReceiver.gs') -or
    -not($names -ccontains 'appsscript.json')){
  throw 'Unsafe remote stage; STOP.'
 }
 $push=Read-Host 'Backed up exact previous V3. Type PUSH to replace its source'
 if($push -cne 'PUSH'){throw 'Cancelled before source push.'}
 Invoke-Clasp -ArgsList @('push','--force') | Out-Host
 $update=Read-Host 'Type UPDATE to update ONLY the pinned existing Web App V3 deployment'
 if($update -cne 'UPDATE'){
  throw 'Source was pushed but versioned deployment not updated. STOP and reconcile.'
 }
 Invoke-Clasp -ArgsList @('update-deployment',$target.deploymentId,
  '--description','ThaiPHC F010 private report staged receiver; OFF by default') | Out-Host
 $after=@(Invoke-Clasp -ArgsList @('list-deployments'))
 if(-not (($after -join [Environment]::NewLine).Contains($target.deploymentId))){
  throw 'Cannot confirm original V3 deployment. STOP.'
 }
 Write-Host 'Existing V3 updated. Verify all THREE write-related flags remain OFF.'
 Write-Host 'No ThaiPHC GET/POST, source-row import, or property activation was performed.'
}
finally {
 Pop-Location
 Write-Host ('Source backup directory: '+$backup)
 Write-Host ('Staging/inspection directory: '+$stage)
}
