param(
    [string]$BackendRoot = "D:\workspace\rjcut",
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPayload = Join-Path $PatchRoot "payload\backend"
$StudioPayload = Join-Path $PatchRoot "payload\studio"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not (Test-Path $BackendRoot)) {
    throw "后端目录不存在: $BackendRoot"
}
if (-not (Test-Path $StudioRoot)) {
    throw "前端目录不存在: $StudioRoot"
}
if (-not (Test-Path $BackendPayload)) {
    throw "补丁缺少后端 payload: $BackendPayload"
}
if (-not (Test-Path $StudioPayload)) {
    throw "补丁缺少前端 payload: $StudioPayload"
}

function Install-PayloadTree {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$TargetRoot,
        [Parameter(Mandatory = $true)][string]$Label
    )

    Get-ChildItem -Path $SourceRoot -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($SourceRoot.Length).TrimStart('\', '/')
        $targetPath = Join-Path $TargetRoot $relativePath
        $targetDir = Split-Path -Parent $targetPath

        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        if (Test-Path $targetPath) {
            $backupPath = "$targetPath.rjcut_timeline_v0_4_backup_$Timestamp"
            Copy-Item -Path $targetPath -Destination $backupPath -Force
            Write-Host "[BACKUP][$Label] $targetPath -> $backupPath"
        }

        Copy-Item -Path $_.FullName -Destination $targetPath -Force
        Write-Host "[WRITE][$Label]  $targetPath"
    }
}

Write-Host "========================================"
Write-Host " RJCut Char Timeline Local Mix v0.4"
Write-Host " BackendRoot: $BackendRoot"
Write-Host " StudioRoot : $StudioRoot"
Write-Host "========================================"

Install-PayloadTree -SourceRoot $BackendPayload -TargetRoot $BackendRoot -Label "PY"
Install-PayloadTree -SourceRoot $StudioPayload -TargetRoot $StudioRoot -Label "STUDIO"

Write-Host ""
Write-Host "========================================"
Write-Host " 补丁已应用"
Write-Host "========================================"
Write-Host "数字人 API: http://192.168.166.151:8080"
Write-Host ""
Write-Host "验证命令:"
Write-Host "  cd $BackendRoot"
Write-Host "  python -m py_compile .\draft_utils.py .\api_service.py"
Write-Host "  python .\scripts\test_ai_copywriting_contract.py"
Write-Host ""
Write-Host "  cd $StudioRoot"
Write-Host "  node .\scripts\test_digital_human_project.mjs"
Write-Host "  npm run build"
Write-Host ""
Write-Host "新版产物: xxx.mp4 + xxx.rjdh.json"
Write-Host "模板混剪将自动加载 JSON，并在本地完成裁切与合成。"
