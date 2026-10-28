# T009D final UAT only: conservative update of the EXISTING Apps Script V3.
# No development-time execution. Never store credentials in the repository.
# Stops if the pulled current remote source is not exactly the known T010 code.
# Do NOT run the original first-install-only deploy-existing-apps-script.ps1.
[CmdletBinding()]
param([string]$RepoPath = '.')

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Clasp {
    param([string[]]$ArgsList)
    $text = & npx.cmd --yes '@google/clasp@latest' @ArgsList
    if ($LASTEXITCODE -ne 0) {
        throw ('clasp failed (' + ($ArgsList -join ' ') + '). STOP; no automatic retry.')
    }
    return @($text)
}
function Git-One {
    param([string[]]$ArgsList)
    $out = @(& git -C $repo @ArgsList)
    if ($LASTEXITCODE -ne 0 -or $out.Count -ne 1) {
        throw ('Git command failed: ' + ($ArgsList -join ' '))
    }
    return $out[0].Trim()
}
foreach ($command in @('git','node.exe','npx.cmd')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw ('Missing required executable: ' + $command)
    }
}
$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$cfg = Join-Path $repo 'config\thaiphc-targets.json'
$codeFile = Join-Path $repo 'apps-script\Code.gs'
$manifestFile = Join-Path $repo 'apps-script\appsscript.json'
if (-not (Test-Path -LiteralPath $cfg -PathType Leaf) -or
    -not (Test-Path -LiteralPath $codeFile -PathType Leaf) -or
    -not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    throw 'Missing reviewed source or pinned target. STOP.'
}
$target = Get-Content -LiteralPath $cfg -Raw | ConvertFrom-Json
if ($target.scriptId -notmatch '^[A-Za-z0-9_-]{30,120}$' -or
    $target.deploymentId -notmatch '^AKfycb[A-Za-z0-9_-]{40,120}$' -or
    $target.spreadsheetId -notmatch '^[A-Za-z0-9_-]{30,120}$') {
    throw 'Invalid target identifiers. STOP.'
}
if ((Git-One -ArgsList @('branch','--show-current')) -cne 'main') {
    throw 'Use the exact approved release on clean main only. STOP.'
}
$dirty = @(& git -C $repo status --porcelain)
if ($LASTEXITCODE -ne 0 -or (($dirty -join '').Trim().Length -ne 0)) {
    throw 'Git working tree is not clean. STOP.'
}
# Immutable T010 currently deployed source, reviewed T009D replacement, and
# unchanged manifest. Both source pins are Git blob SHA-1 values, not secrets.
$oldCodeBlob = 'abc71275ab30dca1f57d1d0e33b8c2773452a194'
$reviewedNewCodeBlob = 'f7d878389fe46cfde8619f75a1f9746f45b469a3'
$reviewedManifestBlob = 'a8134a3237b2dce1f54ce16a943fbe3e232ce436'
if ((Git-One -ArgsList @('hash-object','--',$codeFile)) -cne $reviewedNewCodeBlob -or
    (Git-One -ArgsList @('hash-object','--',$manifestFile)) -cne $reviewedManifestBlob) {
    throw 'Release Code.gs or appsscript manifest differs from reviewed blobs. STOP.'
}
$sourceText = [IO.File]::ReadAllText($codeFile)
if (-not $sourceText.Contains("props.getProperty('THAIPHC_RECEIVER_ENABLED')!=='true'") -or
    -not $sourceText.Contains("props.getProperty('THAIPHC_WRITE_ENABLED')!=='true'") -or
    -not $sourceText.Contains('sheet.insertColumnsAfter(currentColumns,headers.length-currentColumns)')) {
    throw 'Expected security/28-column guards missing. STOP.'
}

Write-Host 'Final UAT: guarded update to the EXISTING ThaiPHC Web App V3.'
Write-Host 'Ensure project identity, destination spreadsheet and source/transfer rights are approved.'
Write-Host 'Verify BOTH existing Script Properties Receiver and Write are false.'
$off = Read-Host 'After checking the CORRECT Apps Script V3 project and BOTH flags OFF, type OFF'
if ($off -cne 'OFF') {throw 'Cancelled; no remote changes.'}

$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$stage = Join-Path ([IO.Path]::GetTempPath()) ('thaiphc-final-clasp-' + $stamp)
$backup = Join-Path ([Environment]::GetFolderPath('UserProfile')) ('thaiphc-final-backup-' + $stamp)
New-Item -ItemType Directory -Path $stage -Force | Out-Null
New-Item -ItemType Directory -Path $backup -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $stage '.clasp.json'),
    (@{scriptId=$target.scriptId} | ConvertTo-Json -Compress),
    (New-Object Text.UTF8Encoding($false)))
Push-Location $stage
try {
    $before = @(Invoke-Clasp -ArgsList @('list-deployments'))
    if (-not (($before -join [Environment]::NewLine).Contains($target.deploymentId))) {
        throw 'Pinned V3 deployment not found. STOP.'
    }
    Invoke-Clasp -ArgsList @('pull') | Out-Host
    $pulled = @(Get-ChildItem -LiteralPath $stage -Recurse -File -Force |
        Where-Object {$_.Name -cne '.clasp.json'})
    # Preserve ALL pulled material first, even when validation fails.
    foreach ($file in $pulled) {
        $relative = $file.FullName.Substring($stage.Length).TrimStart([char]'\',[char]'/')
        $dest = Join-Path $backup $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $dest) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $dest -Force
    }
    Write-Host ('Remote project backup: ' + $backup)
    $relativeFiles = @($pulled | ForEach-Object {
        $_.FullName.Substring($stage.Length).TrimStart([char]'\',[char]'/')
    })
    if ($relativeFiles.Count -ne 2 -or
        -not ($relativeFiles -ccontains 'appsscript.json') -or
        (-not ($relativeFiles -ccontains 'Code.gs') -and
         -not ($relativeFiles -ccontains 'Code.js'))) {
        throw 'Remote project contains other/unknown files. STOP before PUSH.'
    }
    $remoteCodeName = if($relativeFiles -ccontains 'Code.gs'){'Code.gs'}else{'Code.js'}
    $remoteCodeFile = Join-Path $stage $remoteCodeName
    $remoteManifestFile = Join-Path $stage 'appsscript.json'
    if ((Git-One -ArgsList @('hash-object','--',$remoteCodeFile)) -cne $oldCodeBlob -or
        (Git-One -ArgsList @('hash-object','--',$remoteManifestFile)) -cne $reviewedManifestBlob) {
        throw 'Remote source does not match the known T010 preimage. STOP: reconcile manually, never overwrite blindly.'
    }

    # Exact reviewed old source preserved; only two reviewed files are staged.
    if ($remoteCodeName -cne 'Code.gs') {
        Remove-Item -LiteralPath $remoteCodeFile -Force -ErrorAction Stop
    }
    Copy-Item -LiteralPath $codeFile -Destination (Join-Path $stage 'Code.gs') -Force
    Copy-Item -LiteralPath $manifestFile -Destination $remoteManifestFile -Force
    $staged = @(Get-ChildItem -LiteralPath $stage -Recurse -File -Force |
        Where-Object {$_.Name -cne '.clasp.json'} |
        ForEach-Object {$_.FullName.Substring($stage.Length).TrimStart([char]'\',[char]'/')})
    if ($staged.Count -ne 2 -or -not ($staged -ccontains 'Code.gs') -or
        -not ($staged -ccontains 'appsscript.json')) {
        throw 'Unexpected staged files. STOP.'
    }
    $push = Read-Host 'Backup and preimage verified. Type PUSH to update ONLY the existing project source'
    if ($push -cne 'PUSH') {throw 'Cancelled before PUSH.'}
    Invoke-Clasp -ArgsList @('push','--force') | Out-Host
    Write-Host 'HEAD source pushed. Existing V3 versioned deployment is NOT updated yet.'
    $update = Read-Host 'Type UPDATE to update ONLY the existing pinned Web App V3 deployment'
    if ($update -cne 'UPDATE') {
        throw 'Deployment not updated; STOP final UAT until state is reconciled.'
    }
    Invoke-Clasp -ArgsList @(
        'update-deployment',$target.deploymentId,
        '--description','ThaiPHC T009D final release: guarded 28-column Villages import'
    ) | Out-Host
    $after = @(Invoke-Clasp -ArgsList @('list-deployments'))
    if (-not (($after -join [Environment]::NewLine).Contains($target.deploymentId))) {
        throw 'Unable to confirm original V3 deployment still exists. STOP.'
    }
    Write-Host 'Existing V3 deployment ID retained. Review properties: BOTH flags must still be OFF.'
    Write-Host 'No real ThaiPHC GET, Apps Script test POST or Sheet write was performed by this updater.'
}
finally {
    Pop-Location
    Write-Host ('Original remote backup: ' + $backup)
    Write-Host ('Inspection/staging directory: ' + $stage)
}
