# F010 — GUARDED existing Web App V3 report-code update for ONE Final UAT only.
# Do NOT run during development. Never creates a new project/deployment/Sheet.
# No ThaiPHC API call, no person-data request and no Script Property mutation.
[CmdletBinding()]
param(
 [string]$RepoPath='.',
 [ValidateSet('F009_REVIEWED','EXISTING_V3_20261117','F010_V4_20261117','F010_V5_20261119','F010_V6_20261119')]
 [string]$RemoteBaseline='F009_REVIEWED'
)
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
$newReportBlob='bf7003fb1628b336188b2eebde3668c5d8d92f77'
$manifestBlob='a8134a3237b2dce1f54ce16a943fbe3e232ce436'
# Independently inspected existing project on 2026-11-17. This exact pair has
# the older receiver and the existing V3 webapp settings; never drop those.
$observedCodeBlob='abc71275ab30dca1f57d1d0e33b8c2773452a194'
$observedManifestBlob='e686fbcd6e758a24247f41ec3dac455abfe30ffc'
# Verified report sources from the previous deployments.
$observedReportBlob=switch -CaseSensitive ($RemoteBaseline){
 'F010_V4_20261117' {'16915ad2164a3dc9d78f5820a1b042c2150cc663'}
 'F010_V5_20261119' {'1ae3b44d4c676242e43886324a6757c01e87b981'}
 'F010_V6_20261119' {'550cc3852decbfdb5bd5115498c20ab65863d47c'}
}
$isReportBaseline=$null -ne $observedReportBlob
$expectedRemoteCodeBlob=if($isReportBaseline){
 $newCodeBlob
}elseif($RemoteBaseline -ceq 'EXISTING_V3_20261117'){
 $observedCodeBlob
}else{$oldCodeBlob}
$expectedRemoteManifestBlob=if($isReportBaseline -or $RemoteBaseline -ceq 'EXISTING_V3_20261117'){
 $observedManifestBlob
}else{$manifestBlob}
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
Write-Host 'Reports require a RESTRICTED destination Sheet.'
Write-Host 'Default: separate workbook. Same workbook: owner-only sharing verified,'
Write-Host 'plus THAIPHC_SAME_WORKBOOK_APPROVAL=OWNER_ONLY_5406_APPROVED.'
Write-Host 'This updater does not set approval, destination IDs, or write switches.'
Write-Host ('Exact remote baseline: '+$RemoteBaseline)
Write-Host 'The existing reviewed Web App manifest settings are preserved.'
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
 $expectedFileCount=if($isReportBaseline){3}else{2}
 $reportName=if($names -ccontains 'ReportReceiver.gs'){'ReportReceiver.gs'}
  elseif($names -ccontains 'ReportReceiver.js'){'ReportReceiver.js'}else{$null}
 if($names.Count -ne $expectedFileCount -or
    -not($names -ccontains 'appsscript.json') -or
    (-not($names -ccontains 'Code.gs') -and -not($names -ccontains 'Code.js')) -or
    ($isReportBaseline -and $null -eq $reportName)){
  throw 'Pulled remote project contains unexpected sources. No push.'
 }
 $codeName=if($names -ccontains 'Code.gs'){'Code.gs'}else{'Code.js'}
 $remoteCode=Join-Path $stage $codeName
 $remoteManifest=Join-Path $stage 'appsscript.json'
 if((Git-One -ArgsList @('hash-object','--',$remoteCode)) -cne $expectedRemoteCodeBlob -or
    (Git-One -ArgsList @('hash-object','--',$remoteManifest)) -cne $expectedRemoteManifestBlob){
  throw 'Remote V3 source is NOT the expected preimage. STOP; reconcile.'
 }
 if($isReportBaseline -and
    (Git-One -ArgsList @('hash-object','--',(Join-Path $stage $reportName))) -cne $observedReportBlob){
  throw 'Remote report source is NOT the expected preimage. STOP; reconcile.'
 }
 if($codeName -cne 'Code.gs'){
  Remove-Item -LiteralPath $remoteCode -Force -ErrorAction Stop
 }
 if($isReportBaseline -and $reportName -cne 'ReportReceiver.gs'){
  Remove-Item -LiteralPath (Join-Path $stage $reportName) -Force -ErrorAction Stop
 }
 Copy-Item -LiteralPath $code -Destination (Join-Path $stage 'Code.gs') -Force
 Copy-Item -LiteralPath $report -Destination (Join-Path $stage 'ReportReceiver.gs') -Force
 # Every allowed baseline pins an exact manifest. Keep its original bytes so
 # executeAs/access are not silently reset during the versioned V3 update.
 if((Git-One -ArgsList @('hash-object','--',(Join-Path $stage 'Code.gs'))) -cne $newCodeBlob -or
    (Git-One -ArgsList @('hash-object','--',(Join-Path $stage 'ReportReceiver.gs'))) -cne $newReportBlob -or
    (Git-One -ArgsList @('hash-object','--',$remoteManifest)) -cne $expectedRemoteManifestBlob){
  throw 'Staged source or preserved manifest differs from reviewed pins. STOP.'
 }
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
