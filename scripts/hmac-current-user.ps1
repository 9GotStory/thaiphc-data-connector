# Local-only Windows CurrentUser DPAPI storage for the ThaiPHC Web App HMAC key.
# NO key enters command-line args, environment, repository, or process logs.
# Ciphertext in %LOCALAPPDATA%\ThaiPHC\DataConnector\hmac.dpapi is
# decryptable by processes running as the SAME Windows user. Protect account.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('set','get')]
  [string]$Action
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
  throw 'WINDOWS_ONLY'
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
  throw 'LOCALAPPDATA_MISSING'
}
$directory = Join-Path $env:LOCALAPPDATA 'ThaiPHC\DataConnector'
$filePath = Join-Path $directory 'hmac.dpapi'
if ($Action -eq 'set') {
  # One-time initialization via Read-Host secure input. Never print key.
  $secret = Read-Host 'Paste Web App HMAC key ONCE (input hidden; Windows DPAPI CurrentUser)' -AsSecureString
  $ptr = [IntPtr]::Zero
  try {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ($plaintext -cnotmatch '^[A-Za-z0-9+/]{43}=$') {
      throw 'HMAC_FORMAT_REJECTED'
    }
  } finally {
    $plaintext = $null
    if ($ptr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  }
  $encrypted = ConvertFrom-SecureString -SecureString $secret
  [System.IO.Directory]::CreateDirectory($directory) | Out-Null
  [System.IO.File]::WriteAllText($filePath, $encrypted, [Text.Encoding]::ASCII)
  Write-Output 'HMAC_STORED_CURRENT_USER_DPAPI'
  exit 0
}
if (-not [System.IO.File]::Exists($filePath)) {
  throw 'HMAC_NOT_CONFIGURED_RUN_SETUP'
}
$encrypted = [System.IO.File]::ReadAllText($filePath, [Text.Encoding]::ASCII)
$secret = ConvertTo-SecureString -String $encrypted
$ptr = [IntPtr]::Zero
try {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $plaintext = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if ($plaintext -cnotmatch '^[A-Za-z0-9+/]{43}=$') {
    throw 'HMAC_FORMAT_REJECTED'
  }
  [Console]::Out.Write($plaintext)
} finally {
  $plaintext = $null
  if ($ptr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}
