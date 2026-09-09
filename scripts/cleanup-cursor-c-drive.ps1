# Run with Cursor CLOSED for maximum cleanup.
# Usage:
#   powershell -ExecutionPolicy Bypass -File "...\cleanup-cursor-c-drive.ps1"
#   powershell -ExecutionPolicy Bypass -File "...\cleanup-cursor-c-drive.ps1" -ResetChatHistory

param(
    [switch]$ResetChatHistory
)

$ErrorActionPreference = 'SilentlyContinue'

Write-Host "=== Cursor + npm C: drive cleanup ===" -ForegroundColor Cyan

function Remove-DirIfExists([string]$Path, [string]$Label) {
    if (-not (Test-Path $Path)) { return 0 }
    $size = (Get-ChildItem $Path -Recurse -Force | Where-Object { -not $_.PSIsContainer } | Measure-Object Length -Sum).Sum
    Remove-Item $Path -Recurse -Force
    Write-Host ("Removed {0,6:N0} MB - {1}" -f ($size / 1MB), $Label)
    return $size
}

$total = 0
$total += Remove-DirIfExists "$env:LOCALAPPDATA\Temp\cursor-sandbox-cache" "Cursor sandbox temp"
$total += Remove-DirIfExists "$env:LOCALAPPDATA\npm-cache" "Old npm cache on C:"
$total += Remove-DirIfExists "$env:APPDATA\Cursor\Cache" "Cursor cache"
$total += Remove-DirIfExists "$env:APPDATA\Cursor\CachedData" "Cursor cached data"
$total += Remove-DirIfExists "$env:APPDATA\Cursor\Code Cache" "Cursor code cache"
$total += Remove-DirIfExists "$env:APPDATA\Cursor\GPUCache" "Cursor GPU cache"
$total += Remove-DirIfExists "$env:APPDATA\Cursor\logs" "Cursor logs"
$total += Remove-DirIfExists "$env:APPDATA\Cursor\User\History" "Local file history"

$backup = "$env:APPDATA\Cursor\User\globalStorage\state.vscdb.backup"
if (Test-Path $backup) {
    $size = (Get-Item $backup).Length
    Remove-Item $backup -Force
    $total += $size
    Write-Host ("Removed {0,6:N0} MB - Chat DB backup" -f ($size / 1MB))
}

# Keep only newest agent CLI version
$versionsDir = "$env:APPDATA\Cursor\User\globalStorage\anysphere.cursor-agent-worker\agent-cli\.local\share\cursor-agent\versions"
if (Test-Path $versionsDir) {
    $versions = Get-ChildItem $versionsDir -Directory | Sort-Object Name -Descending
    foreach ($old in ($versions | Select-Object -Skip 1)) {
        $total += Remove-DirIfExists $old.FullName "Old agent version $($old.Name)"
    }
}

# Reset chat/index DB (~1+ GB). Only when -ResetChatHistory is passed.
if ($ResetChatHistory) {
    foreach ($f in @('state.vscdb', 'state.vscdb-wal', 'state.vscdb-shm', 'state.vscdb.backup')) {
        $path = Join-Path "$env:APPDATA\Cursor\User\globalStorage" $f
        if (Test-Path $path) {
            $size = (Get-Item $path).Length
            Remove-Item $path -Force
            $total += $size
            Write-Host ("Removed {0,6:N0} MB - {1}" -f ($size / 1MB), $f)
        }
    }
}

Write-Host ""
Write-Host ("Total freed: {0:N2} GB" -f ($total / 1GB)) -ForegroundColor Green
Write-Host "npm cache is configured at E:\npm-cache (not C:)." -ForegroundColor Green
