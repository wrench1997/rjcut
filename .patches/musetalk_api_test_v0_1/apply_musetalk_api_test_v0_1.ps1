param(
    [string]$ProjectRoot = "D:\workspace\rjcut"
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourceDir = Join-Path $PackageRoot "payload\scripts\musetalk_api_test"
$TargetDir = Join-Path $ProjectRoot "scripts\musetalk_api_test"

if (-not (Test-Path $ProjectRoot)) { throw "项目目录不存在: $ProjectRoot" }
if (-not (Test-Path $SourceDir)) { throw "补丁 payload 不完整: $SourceDir" }

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

Get-ChildItem $SourceDir -File | ForEach-Object {
    $target = Join-Path $TargetDir $_.Name
    if (Test-Path $target) {
        $backup = "$target.musetalk_api_test_backup_$timestamp"
        Copy-Item $target $backup -Force
        Write-Host "[BACKUP] $target -> $backup"
    }
    Copy-Item $_.FullName $target -Force
    Write-Host "[WRITE]  $target"
}

Write-Host ""
Write-Host "========================================"
Write-Host " MuseTalk API Test v0.1 已安装"
Write-Host "========================================"
Write-Host "执行:"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$TargetDir\run_musetalk_api_test.ps1`""
