param(
    [string]$InstallRoot = "",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$defaultRoot = if ($InstallRoot) {
    $InstallRoot
} elseif ($env:LOCALAPPDATA -and (Test-Path (Join-Path $env:LOCALAPPDATA "TallyBridge"))) {
    Join-Path $env:LOCALAPPDATA "TallyBridge"
} else {
    Join-Path $env:ProgramData "TallyBridge"
}

$manifestPath = Join-Path $defaultRoot "install-manifest.json"
if (-not (Test-Path $manifestPath)) {
    throw "Could not find install manifest at $manifestPath"
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$actions = @(
    @{ step = "remove_manifest"; detail = $manifestPath },
    @{ step = "remove_install_root"; detail = $defaultRoot }
)

if ($manifest.tally_ini_path) {
    $actions += @{ step = "manual_tally_ini_cleanup"; detail = "Remove TDL entry from $($manifest.tally_ini_path) if desired" }
}

if ($DryRun) {
    Write-Host "TallyBridge uninstall dry-run"
    foreach ($action in $actions) {
        Write-Host "- $($action.step): $($action.detail)"
    }
    return
}

Remove-Item -LiteralPath $defaultRoot -Recurse -Force
Write-Host "TallyBridge uninstall complete."
