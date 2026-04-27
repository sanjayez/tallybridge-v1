param(
    [string]$ServerUrl = "http://127.0.0.1:8000",
    [string]$PairingCode = "",
    [string]$TallyIniPath = "",
    [string]$TallyInstallPath = "",
    [string]$BridgeSource = "",
    [string]$InstallRoot = "",
    [switch]$DryRun,
    [switch]$EmitPlanJson,
    [switch]$NoStart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Resolve-BridgeSource {
    param([string]$ProvidedPath)

    if ($ProvidedPath) {
        return (Resolve-Path $ProvidedPath).Path
    }

    $repoRoot = Resolve-RepoRoot
    return (Resolve-Path (Join-Path $repoRoot "tdl\BR_Bridge.tdl")).Path
}

function Find-TallyIni {
    param([string]$ProvidedPath)

    if ($ProvidedPath) {
        return (Resolve-Path $ProvidedPath).Path
    }

    $candidates = @(@(
        "$env:ProgramData\TallyPrime\tally.ini",
        "$env:ProgramFiles\TallyPrime\tally.ini",
        "${env:ProgramFiles(x86)}\TallyPrime\tally.ini",
        "$env:ProgramFiles\Tally.ERP9\tally.ini",
        "${env:ProgramFiles(x86)}\Tally.ERP9\tally.ini"
    ) | Where-Object { $_ -and (Test-Path $_) })

    if ($candidates.Count -gt 0) {
        return $candidates[0]
    }

    return ""
}

function Set-OrAppendIniValue {
    param(
        [string]$Content,
        [string]$Key,
        [string]$Value
    )

    $escapedKey = [regex]::Escape($Key)
    $replacement = "$Key=$Value"
    $pattern = "(?m)^\s*$escapedKey\s*=.*$"

    if ([regex]::IsMatch($Content, $pattern)) {
        return [regex]::Replace($Content, $pattern, $replacement, 1)
    }

    $trimmed = $Content.TrimEnd("`r", "`n")
    return $trimmed + "`r`n" + $replacement + "`r`n"
}

function New-Shortcut {
    param(
        [string]$ShortcutPath,
        [string]$TargetPath,
        [string]$Arguments,
        [string]$WorkingDirectory
    )

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.Arguments = $Arguments
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.WindowStyle = 7
    $shortcut.Description = "TallyBridge background bridge"
    $shortcut.Save()
}

$repoRoot = Resolve-RepoRoot
$isAdmin = Test-IsAdmin
$installMode = "user"
$watcherMode = "startup_shortcut"
$defaultRoot = if ($InstallRoot) {
    $InstallRoot
} else {
    Join-Path $env:LOCALAPPDATA "TallyBridge"
}

$resolvedBridgeSource = Resolve-BridgeSource -ProvidedPath $BridgeSource
$resolvedTallyIniPath = Find-TallyIni -ProvidedPath $TallyIniPath
$bridgeInstallDir = Join-Path $defaultRoot "bridge"
$agentInstallDir = Join-Path $defaultRoot "agent"
$bridgeTargetPath = Join-Path $bridgeInstallDir "BR_EventBridge.installed.tdl"
$agentConfigPath = Join-Path $agentInstallDir "agent-config.json"
$manifestPath = Join-Path $defaultRoot "install-manifest.json"
$repoAgentEntry = Join-Path $repoRoot "agent\cmd\tallybridge-agent\index.js"
$startupFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupShortcutPath = Join-Path $startupFolder "TallyBridge.lnk"
$existingManifest = $null
if (Test-Path $manifestPath) {
    try {
        $existingManifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    } catch {
        $existingManifest = $null
    }
}
$installId = if ($existingManifest -and $existingManifest.install_id) {
    $existingManifest.install_id
} else {
    [Guid]::NewGuid().ToString()
}

$agentArgs = "`"$repoAgentEntry`" --control-plane-url `"$ServerUrl`" --state-dir `"$agentInstallDir`" --wait-for-tally"
if ($PairingCode) {
    $agentArgs += " --pairing-code `"$PairingCode`""
}
$agentLaunchCommand = "node $agentArgs"

$actions = @(
    @{ step = "detect_privilege"; detail = "No-admin user-mode install. Elevated=$isAdmin but default remains current-user." },
    @{ step = "repair_detection"; detail = if ($existingManifest) { "Existing install found. Reusing install_id $installId." } else { "No existing install found. Creating install_id $installId." } },
    @{ step = "prepare_dirs"; detail = "Create $bridgeInstallDir and $agentInstallDir" },
    @{ step = "copy_bridge"; detail = "Copy $resolvedBridgeSource to $bridgeTargetPath" },
    @{ step = "write_agent_config"; detail = "Write agent config to $agentConfigPath" },
    @{ step = "write_manifest"; detail = "Write install manifest to $manifestPath" },
    @{ step = "register_startup"; detail = "Create current-user Startup shortcut at $startupShortcutPath" }
)

if ($resolvedTallyIniPath) {
    $actions += @{ step = "patch_tally_ini_best_effort"; detail = "Try to patch $resolvedTallyIniPath to load $bridgeTargetPath; continue in XML-only mode if not writable" }
} else {
    $actions += @{ step = "skip_tally_ini"; detail = "No tally.ini found. Bridge can still run in XML-only mode." }
}

$actions += @{ step = "watcher_plan"; detail = "Watcher mode planned: $watcherMode" }
if (-not $NoStart) {
    $actions += @{ step = "start_background_bridge"; detail = "Start hidden bridge process immediately after setup" }
}
$actions += @{ step = "agent_launch_plan"; detail = $agentLaunchCommand }

$manifest = @{
    schema_version = "v1"
    install_id = $installId
    install_mode = $installMode
    installed_at = (Get-Date).ToString("o")
    agent_path = $repoAgentEntry
    tcp_path = $bridgeTargetPath
    tally_ini_path = if ($resolvedTallyIniPath) { $resolvedTallyIniPath } else { $null }
    tally_install_path = if ($TallyInstallPath) { $TallyInstallPath } else { $null }
    watcher_mode = $watcherMode
    startup_shortcut_path = $startupShortcutPath
    connection_seed = @{
        pairing_code = if ($PairingCode) { $PairingCode } else { $null }
        connection_id = $null
    }
    meta = @{
        control_plane_url = $ServerUrl
        repo_root = $repoRoot
        dry_run = [bool]$DryRun
        no_start = [bool]$NoStart
        repair = [bool]$existingManifest
        planned_agent_launch = $agentLaunchCommand
        health_model = @{
            active = "bridge heartbeat fresh and Tally reachable"
            inactive = "bridge heartbeat fresh and Tally unavailable"
            unreachable = "bridge heartbeat stale or missing"
        }
    }
}

$agentConfig = @{
    controlPlaneUrl = $ServerUrl
    pairingCode = if ($PairingCode) { $PairingCode } else { $null }
    mode = "xml_only"
    stateDir = $agentInstallDir
    waitForTally = $true
}

$plan = @{
    installMode = $installMode
    watcherMode = $watcherMode
    bridgeSource = $resolvedBridgeSource
    bridgeTargetPath = $bridgeTargetPath
    agentConfigPath = $agentConfigPath
    manifestPath = $manifestPath
    startupShortcutPath = $startupShortcutPath
    tallyIniPath = if ($resolvedTallyIniPath) { $resolvedTallyIniPath } else { $null }
    actions = $actions
}

if ($EmitPlanJson) {
    $plan | ConvertTo-Json -Depth 6
}

if ($DryRun) {
    Write-Host "TallyBridge install dry-run"
    Write-Host "Mode:         $installMode"
    Write-Host "Watcher:      $watcherMode"
    Write-Host "Bridge src:   $resolvedBridgeSource"
    Write-Host "Bridge dst:   $bridgeTargetPath"
    Write-Host "Agent config: $agentConfigPath"
    Write-Host "Manifest:     $manifestPath"
    Write-Host "Autostart:    $startupShortcutPath"
    if ($resolvedTallyIniPath) {
        Write-Host "Tally.ini:    $resolvedTallyIniPath"
    } else {
        Write-Host "Tally.ini:    not found"
    }
    Write-Host ""
    Write-Host "Planned actions:"
    foreach ($action in $actions) {
        Write-Host "- $($action.step): $($action.detail)"
    }
    return
}

New-Item -ItemType Directory -Force -Path $bridgeInstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $agentInstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $startupFolder | Out-Null
Copy-Item -Path $resolvedBridgeSource -Destination $bridgeTargetPath -Force
Set-Content -Path $agentConfigPath -Value ($agentConfig | ConvertTo-Json -Depth 4) -Encoding ASCII
Set-Content -Path $manifestPath -Value ($manifest | ConvertTo-Json -Depth 6) -Encoding ASCII
New-Shortcut -ShortcutPath $startupShortcutPath -TargetPath "node" -Arguments $agentArgs -WorkingDirectory $repoRoot

if ($resolvedTallyIniPath) {
    try {
        $iniContent = Get-Content $resolvedTallyIniPath -Raw
        $iniContent = Set-OrAppendIniValue -Content $iniContent -Key "User TDL" -Value "Yes"
        $iniContent = Set-OrAppendIniValue -Content $iniContent -Key "TDL" -Value $bridgeTargetPath
        Set-Content -Path $resolvedTallyIniPath -Value $iniContent -Encoding ASCII
    } catch {
        Write-Warning "Could not patch tally.ini. Bridge will continue in XML-only mode until TDL can be loaded. $($_.Exception.Message)"
    }
}

if (-not $NoStart) {
    Start-Process -FilePath "node" -ArgumentList $agentArgs -WorkingDirectory $repoRoot -WindowStyle Hidden
}

Write-Host "TallyBridge install complete."
Write-Host "Manifest: $manifestPath"
Write-Host "Startup shortcut: $startupShortcutPath"
Write-Host "Agent launch:"
Write-Host $agentLaunchCommand
