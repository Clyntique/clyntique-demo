# Runs the Clyntique Production smoke test on GT.
#   Read-only (default, changes nothing):   powershell -ExecutionPolicy Bypass -File .\run-smoke.ps1
#   With the approved [SMOKE TEST] records: powershell -ExecutionPolicy Bypass -File .\run-smoke.ps1 -Fixtures
#   Same, uploading a labelled creative as V1: ... -Fixtures -Creative D:\clyntique-demo\test-assets\smoke\smoke-test-creative.png
# Passwords are typed at hidden prompts, passed only to this one test run, and
# removed afterwards. Nothing is written to disk except the report and screenshots.
param([switch]$Fixtures, [string]$Base = "https://clyntique-demo.vercel.app", [int]$ExpectProjects = 4, [string]$Creative = "")
$ErrorActionPreference = "Stop"

function Read-Secret([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}
function Read-Email([string]$Prompt, [string]$Default) {
  $value = Read-Host "$Prompt [$Default]"
  if ([string]::IsNullOrWhiteSpace($value)) { $Default } else { $value.Trim() }
}

$names = "SMOKE_TEAM_EMAIL","SMOKE_TEAM_PASSWORD","SMOKE_CLIENT_EMAIL","SMOKE_CLIENT_PASSWORD","SMOKE_CLIENT2_EMAIL","SMOKE_CLIENT2_PASSWORD","SMOKE_FIXTURES_APPROVED"
try {
  $env:SMOKE_TEAM_EMAIL = Read-Email "Team email" "team@clyntique.demo"
  $env:SMOKE_TEAM_PASSWORD = Read-Secret "Team password (hidden)"
  $env:SMOKE_CLIENT_EMAIL = Read-Email "Client 1 email" "client@clyntique.demo"
  $env:SMOKE_CLIENT_PASSWORD = Read-Secret "Client 1 password (hidden)"
  $env:SMOKE_CLIENT2_EMAIL = Read-Email "Client 2 email" "client2@clyntique.demo"
  $env:SMOKE_CLIENT2_PASSWORD = Read-Secret "Client 2 password (hidden; Enter to skip client 2)"
  if ([string]::IsNullOrEmpty($env:SMOKE_CLIENT2_PASSWORD)) { Remove-Item Env:SMOKE_CLIENT2_EMAIL -ErrorAction SilentlyContinue }

  $nodeArgs = @("prod-smoke.mjs", "--base", $Base, "--expect-projects", "$ExpectProjects")
  if ($Fixtures) {
    Write-Host "This creates one [SMOKE TEST] project and one [SMOKE TEST] submission in Production for Client 1 (they cannot be deleted from the app)."
    $confirm = Read-Host "Type CREATE SMOKE TEST RECORDS to continue"
    if ($confirm -ne "CREATE SMOKE TEST RECORDS") { Write-Host "Not confirmed. Nothing was run."; exit 1 }
    $env:SMOKE_FIXTURES_APPROVED = "yes"
    $nodeArgs += "--fixtures"
    if ($Creative) {
      if (-not (Test-Path $Creative)) { Write-Host "Creative file not found: $Creative. Nothing was run."; exit 1 }
      $nodeArgs += @("--creative", (Resolve-Path $Creative).Path)
    }
  }
  node @nodeArgs
  $code = $LASTEXITCODE
  if ($code -eq 3) { Write-Host "CRITICAL: a security or isolation check failed. Testing stopped. Send report.md to Claude before anything else." -ForegroundColor Red }
  exit $code
} finally {
  foreach ($n in $names) { Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
}
