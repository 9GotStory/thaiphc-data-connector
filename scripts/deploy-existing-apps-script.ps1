# T011 / ThaiPHC - install verified T010 Apps Script source into the EXISTING project.
# Run only on the owner's Windows PC; needs locally authorized clasp OAuth.
# The non-secret Script, Deployment and Spreadsheet IDs live in config/thaiphc-targets.json.
# Never stages apps-script/dev-receiver.gs (duplicate doPost).
# Requires operator confirmation before EVERY remote mutation.
[CmdletBinding()]
param(
    [string]$RepoPath = '.',
    [switch]$PushOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Clasp {
    param([string[]]$ClaspArgs)
    $output = & npx.cmd --yes '@google/clasp@latest' @ClaspArgs
    if ($LASTEXITCODE -ne 0) {
        throw ('clasp failed: ' + ($ClaspArgs -join ' ') + '. Stop; inspect the local output.')
    }
    return @($output)
}
function Invoke-Git {
    param([string[]]$GitArgs)
    $output = & git -C $repo @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw ('git failed: ' + ($GitArgs -join ' '))
    }
    return @($output)
}
foreach ($name in @('git', 'node.exe', 'npm.cmd', 'npx.cmd')) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw ('Required command missing: ' + $name)
    }
}
$repo = (Resolve-Path -LiteralPath $RepoPath).Path
$configFile = Join-Path $repo 'config\thaiphc-targets.json'
$source = Join-Path $repo 'apps-script\Code.gs'
$manifest = Join-Path $repo 'apps-script\appsscript.json'
if (-not (Test-Path -LiteralPath $configFile -PathType Leaf) -or
    -not (Test-Path -LiteralPath $source -PathType Leaf) -or
    -not (Test-Path -LiteralPath $manifest -PathType Leaf)) {
    throw 'Required tracked files missing. Update your local main checkout.'
}
$target = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if ($null -eq $target.scriptId -or $null -eq $target.deploymentId -or
    $null -eq $target.spreadsheetId -or
    $target.scriptId -notmatch '^[A-Za-z0-9_-]{30,120}$' -or
    $target.deploymentId -notmatch '^AKfycb[A-Za-z0-9_-]{40,120}$' -or
    $target.spreadsheetId -notmatch '^[A-Za-z0-9_-]{30,120}$') {
    throw 'Missing or invalid target IDs in config/thaiphc-targets.json.'
}
$branchName = @(Invoke-Git -GitArgs @('branch','--show-current'))
if ($branchName.Count -ne 1 -or $branchName[0].Trim() -ne 'main') {
    throw 'Run from main only: git switch main; git pull origin main.'
}
$dirty = @(Invoke-Git -GitArgs @('status','--porcelain','--untracked-files=no'))
if (($dirty -join '').Trim().Length -gt 0) {
    throw 'Tracked files are dirty; no push is allowed.'
}
# Pin the T010-reviewed source files, not a brittle main HEAD (which will change on merge).
$reviewedCodeBlob = 'abc71275ab30dca1f57d1d0e33b8c2773452a194'
$reviewedManifestBlob = 'a8134a3237b2dce1f54ce16a943fbe3e232ce436'
$codeBlobs = @(Invoke-Git -GitArgs @('hash-object','--',$source))
$manifestBlobs = @(Invoke-Git -GitArgs @('hash-object','--',$manifest))
if ($codeBlobs.Count -ne 1 -or $manifestBlobs.Count -ne 1) {
    throw 'Could not compute exactly one Git object ID per source file.'
}
$currentCodeBlob = $codeBlobs[0].Trim()
$currentManifestBlob = $manifestBlobs[0].Trim()
if ($currentCodeBlob -ne $reviewedCodeBlob -or
    $currentManifestBlob -ne $reviewedManifestBlob) {
    throw 'Apps Script source differs from reviewed T010 blobs. STOP and review changes.'
}
$code = [IO.File]::ReadAllText($source)
if (-not $code.Contains("props.getProperty('THAIPHC_RECEIVER_ENABLED')!=='true'") -or
    -not $code.Contains("props.getProperty('THAIPHC_WRITE_ENABLED')!=='true'")) {
    throw 'Receiver/write default-deny source guard missing. STOP.'
}
$release = Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json
if ($release.runtimeVersion -ne 'V8') { throw 'Unexpected Apps Script runtime.' }
Write-Host 'ThaiPHC T011 - existing Apps Script deployment, safe defaults OFF.'
Write-Host ('Repository: ' + $repo)
Write-Host 'Deployment target IDs loaded from versioned config (no credentials).'
Write-Host 'Running Node.js synthetic regression tests before any remote action...'
& npm.cmd --prefix $repo test
if ($LASTEXITCODE -ne 0) { throw 'npm test failed; no remote action.' }

Write-Host ''
Write-Host 'BEFORE PUSH: check existing project Settings > Script properties.'
Write-Host 'THAIPHC_RECEIVER_ENABLED must be false (or absent).'
Write-Host 'THAIPHC_WRITE_ENABLED must be false (or absent).'
Write-Host 'The target Spreadsheet ID is in config/thaiphc-targets.json;'
Write-Host 'set THAIPHC_SPREADSHEET_ID privately in Apps Script settings if needed.'
Write-Host 'Do NOT paste ThaiPHC Bearer, Google OAuth or HMAC secrets into this repo.'
$guardAck = Read-Host 'After verifying BOTH switches are OFF, type OFF'
if ($guardAck -cne 'OFF') { throw 'Cancelled. No remote action.' }

# Use a NEW throwaway directory outside the repo so the mock .gs is never pushed.
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$staging = Join-Path ([IO.Path]::GetTempPath()) ('thaiphc-clasp-' + $stamp)
$backup = Join-Path ([Environment]::GetFolderPath('UserProfile')) ('thaiphc-clasp-backup-' + $stamp)
New-Item -ItemType Directory -Path $staging -Force | Out-Null
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$claspConfig = @{scriptId=$target.scriptId} | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $staging '.clasp.json'),
    $claspConfig, (New-Object Text.UTF8Encoding($false)))

Push-Location $staging
try {
    Write-Host 'Read-only deployment identity check...'
    $deployedBefore = @(Invoke-Clasp -ClaspArgs @('list-deployments'))
    if (-not (($deployedBefore -join [Environment]::NewLine).Contains($target.deploymentId))) {
        throw 'Existing Deployment ID not found in target project. STOP before push.'
    }
    Write-Host 'Backing up remote source via clasp pull...'
    Invoke-Clasp -ClaspArgs @('pull') | Out-Host
    $remoteFiles = @(Get-ChildItem -LiteralPath $staging -Recurse -File -Force |
        Where-Object { $_.Name -ne '.clasp.json' })
    foreach ($file in $remoteFiles) {
        $relative = $file.FullName.Substring($staging.Length).TrimStart([char]'\',[char]'/')
        $destination = Join-Path $backup $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
    }
    # Inspect only already-backed-up pull results. Allow the verified 29-byte
    # default Thai Apps Script starter, but no executable/non-default source.
    # The classifier is independently tested with synthetic local fixtures.
    $auditTool = Join-Path $repo 'scripts\verify-pulled-apps-script.mjs'
    if (-not (Test-Path -LiteralPath $auditTool -PathType Leaf)) {
        throw 'Pulled project guard missing. STOP before push.'
    }
    $auditOutput = @(& node.exe $auditTool $staging)
    if ($LASTEXITCODE -ne 0) {
        Write-Host ('Backup of remote files: ' + $backup)
        throw 'Existing remote code detected. STOP: do not overwrite unknown source.'
    }
    $audit = ($auditOutput -join '').Trim()
    if ($audit -ceq 'DEFAULT_STARTER') {
        # The UTF-8 Node verifier has already checked the exact filename and
        # empty function body. Use the path obtained from the filesystem: a
        # Unicode filename literal in UTF-8-without-BOM .ps1 is misread by
        # Windows PowerShell 5.1 as the active ANSI code page.
        # Only the verified EMPTY starter is removed from temporary staging.
        $starterFiles = @($remoteFiles | Where-Object { $_.Name -cne 'appsscript.json' })
        if ($starterFiles.Count -ne 1 -or
            -not (Test-Path -LiteralPath $starterFiles[0].FullName -PathType Leaf)) {
            throw 'Verified empty starter path mismatch. STOP before push.'
        }
        Remove-Item -LiteralPath $starterFiles[0].FullName -Force -ErrorAction Stop
        Write-Host 'Verified empty Thai myFunction() starter removed from temporary staging only.'
    } elseif ($audit -cne 'EMPTY') {
        Write-Host ('Backup of remote files: ' + $backup)
        throw 'Existing remote code detected. STOP: unrecognized audit classification.'
    }
    Copy-Item -LiteralPath $source -Destination (Join-Path $staging 'Code.gs') -Force
    Copy-Item -LiteralPath $manifest -Destination (Join-Path $staging 'appsscript.json') -Force
    $stagedFiles = @(Get-ChildItem -LiteralPath $staging -Recurse -File -Force |
        Where-Object { $_.Name -ne '.clasp.json' } |
        ForEach-Object { $_.FullName.Substring($staging.Length).TrimStart([char]'\',[char]'/') } |
        Sort-Object)
    # Order-independent, case-sensitive allowlist; sort order varies by locale.
    if ($stagedFiles.Count -ne 2 -or
        -not ($stagedFiles -ccontains 'Code.gs') -or
        -not ($stagedFiles -ccontains 'appsscript.json')) {
        throw ('Unsafe staged files: ' + ($stagedFiles -join ', '))
    }
    Write-Host 'Only Code.gs + appsscript.json will be pushed. Not dev-receiver.gs.'
    Invoke-Clasp -ClaspArgs @('show-file-status') | Out-Host
    $pushAck = Read-Host 'Type PUSH to replace the current HEAD source in the existing project'
    if ($pushAck -cne 'PUSH') { throw 'Cancelled before push.' }
    Invoke-Clasp -ClaspArgs @('push','--force') | Out-Host
    Write-Host 'PUSH completed; no versioned deployment updated yet.'
    Write-Host ('Remote source backup: ' + $backup)
    if ($PushOnly) {
        Write-Host 'PushOnly selected. Existing versioned deployment was NOT changed.'
        return
    }
    $deployAck = Read-Host 'Type UPDATE to update ONLY the existing Deployment ID (no new ID)'
    if ($deployAck -cne 'UPDATE') {
        Write-Host 'Deployment update cancelled. HEAD source was pushed; deployment unchanged.'
        return
    }
    Invoke-Clasp -ClaspArgs @(
      'update-deployment',$target.deploymentId,
      '--description','T010 guarded ThaiPHC receiver; default deny'
    ) | Out-Host
    $deployedAfter = @(Invoke-Clasp -ClaspArgs @('list-deployments'))
    if (-not (($deployedAfter -join [Environment]::NewLine).Contains($target.deploymentId))) {
        throw 'Cannot verify same Deployment ID after update. Inspect Apps Script manually.'
    }
    Write-Host 'DEPLOYMENT UPDATE VERIFIED: original Deployment ID still present.'
    Write-Host 'Check receiver flags remain OFF. No live data or Sheets writes were attempted.'
}
finally {
    Pop-Location
    Write-Host ('Remote source backup directory: ' + $backup)
    Write-Host ('Local clasp staging directory: ' + $staging)
}
