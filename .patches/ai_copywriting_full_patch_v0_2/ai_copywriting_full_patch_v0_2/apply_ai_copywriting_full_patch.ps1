param(
    [string]$BackendRoot = "D:\workspace\rjcut",
    [string]$StudioRoot = "D:\workspace\rjcut\studio",
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"

function Write-Info($msg) { Write-Host "[INFO] $msg" }
function Write-Ok($msg) { Write-Host "[OK]   $msg" }
function Write-Warn($msg) { Write-Host "[WARN] $msg" }

function Copy-PayloadTreeWithBackup {
    param(
        [string]$PayloadDir,
        [string]$TargetRoot,
        [string]$Label
    )

    if (-not (Test-Path $PayloadDir)) {
        Write-Warn "$Label payload not found: $PayloadDir"
        return
    }

    if (-not (Test-Path $TargetRoot)) {
        Write-Warn "$Label target root not found, creating: $TargetRoot"
        New-Item -ItemType Directory -Path $TargetRoot -Force | Out-Null
    }

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $files = Get-ChildItem $PayloadDir -Recurse -File

    foreach ($file in $files) {
        $relative = $file.FullName.Substring($PayloadDir.Length).TrimStart('\','/')
        $dest = Join-Path $TargetRoot $relative
        $destDir = Split-Path $dest -Parent

        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        if (Test-Path $dest) {
            $backup = "$dest.ai_copywriting_full_v0_2_backup_$timestamp"
            Copy-Item $dest $backup -Force
            Write-Info "backup $relative -> $backup"
        }

        Copy-Item $file.FullName $dest -Force
        Write-Ok "$Label write $relative"
    }
}

$PatchRoot = $PSScriptRoot
$PayloadRoot = Join-Path $PatchRoot "payload"

Write-Host "========================================"
Write-Host " AI Copywriting Full Patch v0.2"
Write-Host " BackendRoot: $BackendRoot"
Write-Host " StudioRoot : $StudioRoot"
Write-Host "========================================"

if (-not $SkipBackend) {
    Copy-PayloadTreeWithBackup `
        -PayloadDir (Join-Path $PayloadRoot "backend") `
        -TargetRoot $BackendRoot `
        -Label "backend"
} else {
    Write-Warn "Skip backend by user flag."
}

if (-not $SkipFrontend) {
    Copy-PayloadTreeWithBackup `
        -PayloadDir (Join-Path $PayloadRoot "frontend") `
        -TargetRoot $StudioRoot `
        -Label "studio"
} else {
    Write-Warn "Skip frontend by user flag."
}

$docTarget = Join-Path $BackendRoot "docs\AI_COPYWRITING_FULL_PATCH_V0_2.md"
$docSource = Join-Path $PatchRoot "docs\AI_COPYWRITING_FULL_PATCH_V0_2.md"
if (Test-Path $docSource) {
    $docDir = Split-Path $docTarget -Parent
    if (-not (Test-Path $docDir)) { New-Item -ItemType Directory -Path $docDir -Force | Out-Null }
    Copy-Item $docSource $docTarget -Force
    Write-Ok "doc write docs\AI_COPYWRITING_FULL_PATCH_V0_2.md"
}

Write-Host ""
Write-Host "========================================"
Write-Host " Applied v0.2"
Write-Host "========================================"
Write-Host "后端新增: $BackendRoot\src\modules\ai_copywriting"
Write-Host "后端示例: $BackendRoot\examples\ai_copywriting_express_routes.js"
Write-Host "前端新增: $StudioRoot\src\features\ai-copywriting"
Write-Host "文档:     $BackendRoot\docs\AI_COPYWRITING_FULL_PATCH_V0_2.md"
Write-Host ""
Write-Host "下一步："
Write-Host "1. 后端把 examples\ai_copywriting_express_routes.js 里的路由接到你的 server。"
Write-Host "2. 前端在需要的位置 import AiCopywritingPanel。"
Write-Host "3. 旧文案里的'转场'不要再读，转场看 timeline.clips。"
