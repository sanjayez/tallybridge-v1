param(
    [string]$ServerUrl = "http://127.0.0.1:8000",
    [string]$PairingCode = "",
    [string]$TallyIniPath = "",
    [string]$BridgeSource = "",
    [switch]$DryRun
)

$installerPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path "installer\windows\install-bridge.ps1"
& $installerPath `
    -ServerUrl $ServerUrl `
    -PairingCode $PairingCode `
    -TallyIniPath $TallyIniPath `
    -BridgeSource $BridgeSource `
    -DryRun:$DryRun
