param(
    [string]$InstallRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$root = if ($InstallRoot) {
    $InstallRoot
} else {
    Join-Path $env:LOCALAPPDATA "TallyBridge"
}

$manifestPath = Join-Path $root "install-manifest.json"
$agentDir = Join-Path $root "agent"
$agentConfigPath = Join-Path $agentDir "agent-config.json"
$logDir = Join-Path $agentDir "logs"
$agentLog = Join-Path $logDir "agent.log"
$stderrLog = Join-Path $logDir "agent.stderr.log"
$stdoutLog = Join-Path $logDir "agent.stdout.log"
$startupShortcutPath = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\TallyBridge.lnk"

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "== $Title =="
}

function Show-JsonFile {
    param([string]$Path)
    if (Test-Path $Path) {
        Get-Content $Path -Raw
    } else {
        Write-Host "Missing: $Path"
    }
}

function Show-Tail {
    param(
        [string]$Path,
        [int]$Lines = 30
    )
    if (Test-Path $Path) {
        Get-Content $Path -Tail $Lines
    } else {
        Write-Host "Missing: $Path"
    }
}

Write-Host "TallyBridge diagnostic report"
Write-Host "Install root: $root"

Write-Section "Files"
Write-Host "Manifest:        $(Test-Path $manifestPath) $manifestPath"
Write-Host "Agent config:    $(Test-Path $agentConfigPath) $agentConfigPath"
Write-Host "Startup shortcut: $(Test-Path $startupShortcutPath) $startupShortcutPath"
Write-Host "Agent log dir:   $(Test-Path $logDir) $logDir"

Write-Section "Manifest"
Show-JsonFile -Path $manifestPath

Write-Section "Agent config"
Show-JsonFile -Path $agentConfigPath

Write-Section "Node"
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Write-Host "Node path: $($node.Source)"
    & $node.Source --version
} else {
    Write-Host "Node is not available on PATH."
}

Write-Section "Agent processes"
try {
    $processes = Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -like "*tallybridge-agent*" } |
        Select-Object ProcessId, CommandLine
    if ($processes) {
        $processes | Format-List
    } else {
        Write-Host "No running tallybridge-agent process found."
    }
} catch {
    Write-Host "Could not inspect processes: $($_.Exception.Message)"
}

Write-Section "Agent log tail"
Show-Tail -Path $agentLog

Write-Section "Agent stderr tail"
Show-Tail -Path $stderrLog

Write-Section "Agent stdout tail"
Show-Tail -Path $stdoutLog

