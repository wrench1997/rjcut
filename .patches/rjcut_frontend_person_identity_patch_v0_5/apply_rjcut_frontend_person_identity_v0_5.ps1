param(
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = Join-Path $PatchRoot "payload\studio"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not (Test-Path $StudioRoot)) {
    throw "Studio 前端目录不存在: $StudioRoot"
}
if (-not (Test-Path (Join-Path $StudioRoot "src\components\DigitalHumanStudio.jsx"))) {
    throw "找不到 DigitalHumanStudio.jsx，请确认 StudioRoot: $StudioRoot"
}
if (-not (Test-Path $PayloadRoot)) {
    throw "补丁 payload 不完整: $PayloadRoot"
}

function Install-PayloadTree {
    param(
        [Parameter(Mandatory = $true)][string]$SourceRoot,
        [Parameter(Mandatory = $true)][string]$TargetRoot
    )

    Get-ChildItem -Path $SourceRoot -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($SourceRoot.Length).TrimStart('\', '/')
        $targetPath = Join-Path $TargetRoot $relativePath
        $targetDir = Split-Path -Parent $targetPath

        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        if (Test-Path $targetPath) {
            $backupPath = "$targetPath.person_identity_v0_5_backup_$Timestamp"
            Copy-Item -Path $targetPath -Destination $backupPath -Force
            Write-Host "[BACKUP] $targetPath -> $backupPath"
        }

        Copy-Item -Path $_.FullName -Destination $targetPath -Force
        Write-Host "[WRITE]  $targetPath"
    }
}

Write-Host "========================================"
Write-Host " RJCut Frontend Person Identity v0.5"
Write-Host " StudioRoot: $StudioRoot"
Write-Host "========================================"

Install-PayloadTree -SourceRoot $PayloadRoot -TargetRoot $StudioRoot

Write-Host ""
Write-Host "========================================"
Write-Host " 前端数字人身份补丁已应用"
Write-Host "========================================"
Write-Host "修复内容:"
Write-Host "  1. 选中状态按 selectionKey，不再按重复的 person.id。"
Write-Host "  2. 公共数字人优先从 preview_video_url / cover 路径解析真正生成 ID。"
Write-Host "  3. /generate 必须显式传 person_id，禁止静默回退 human。"
Write-Host "  4. 重复旧 ID 时跳过歧义详情接口，避免所选卡片被第一条详情覆盖。"
Write-Host "  5. 后端若返回 resolved_person_id，前端强制核对请求人与实际生成人。"
Write-Host ""
Write-Host "验证命令:"
Write-Host "  cd $StudioRoot"
Write-Host "  node .\scripts\test_digital_human_person_identity.mjs"
Write-Host "  node .\scripts\test_digital_human_project.mjs"
Write-Host "  npm run build"
Write-Host ""
Write-Host "重新启动 Studio 后再创建新任务。补丁前已经提交到 8080 的旧任务不会被重新选人。"
