param(
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = Join-Path $PatchRoot "payload\studio"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not (Test-Path $StudioRoot)) {
    throw "Studio 目录不存在: $StudioRoot"
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
            $backupPath = "$targetPath.template_mix_v0_8_backup_$Timestamp"
            Copy-Item -Path $targetPath -Destination $backupPath -Force
            Write-Host "[BACKUP] $targetPath -> $backupPath"
        }

        Copy-Item -Path $_.FullName -Destination $targetPath -Force
        Write-Host "[WRITE]  $targetPath"
    }
}

Write-Host "========================================"
Write-Host " RJCut Template Mix Timeline Rework v0.8"
Write-Host " StudioRoot: $StudioRoot"
Write-Host "========================================"

Install-PayloadTree -SourceRoot $PayloadRoot -TargetRoot $StudioRoot

Write-Host ""
Write-Host "========================================"
Write-Host " 补丁已应用"
Write-Host "========================================"
Write-Host "主要变化:"
Write-Host "  1. 每次模板混剪生成使用唯一 runId/输出目录，不复用旧成片。"
Write-Host "  2. 本地渲染从第五步 UI useEffect 移到 Batch Store 正式任务流程。"
Write-Host "  3. .rjdh.json v2 明确保存带 start_ms/end_ms 的 transition_segments。"
Write-Host "  4. AI 文案前端显示并可切换“数字人/场景替换”段落。"
Write-Host "  5. 修复超过两个片段时合并只保留前两个的问题。"
Write-Host ""
Write-Host "验证:"
Write-Host "  cd $StudioRoot"
Write-Host "  node .\scripts\test_template_mix_timeline_v0_8.mjs"
Write-Host "  npm run build"
Write-Host ""
Write-Host "请完全退出并重新启动 Studio，旧页面中的 JS 不会自动替换。"
