param(
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $directory = Split-Path -Parent $Path
    if ($directory -and -not (Test-Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Backup-File {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Timestamp
    )

    if (Test-Path $Path) {
        $backup = "$Path.manual_copywriting_v1_0_backup_$Timestamp"
        Copy-Item $Path $backup -Force
        Write-Host "[BACKUP] $Path"
        Write-Host "         -> $backup"
    }
}

if (-not (Test-Path $StudioRoot)) {
    throw "StudioRoot 不存在: $StudioRoot"
}

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadRoot = Join-Path $packageRoot "payload\studio"

$sourceHelper = Join-Path $payloadRoot "src\features\digital-human-project\manualCopywritingPlan.js"
$sourceFragment = Join-Path $payloadRoot "fragments\BatchScriptInput.jsx.fragment"
$sourceTest = Join-Path $payloadRoot "scripts\test_manual_copywriting_editor_v1_0.mjs"

$targetComponent = Join-Path $StudioRoot "src\components\DigitalHumanStudio.jsx"
$targetHelper = Join-Path $StudioRoot "src\features\digital-human-project\manualCopywritingPlan.js"
$targetTest = Join-Path $StudioRoot "scripts\test_manual_copywriting_editor_v1_0.mjs"

foreach ($required in @($sourceHelper, $sourceFragment, $sourceTest, $targetComponent)) {
    if (-not (Test-Path $required)) {
        throw "缺少必需文件: $required"
    }
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

Backup-File -Path $targetComponent -Timestamp $timestamp
Backup-File -Path $targetHelper -Timestamp $timestamp
Backup-File -Path $targetTest -Timestamp $timestamp

$helperContent = [System.IO.File]::ReadAllText($sourceHelper)
$fragmentContent = [System.IO.File]::ReadAllText($sourceFragment)
$componentContent = [System.IO.File]::ReadAllText($targetComponent)

$projectImport = "import { buildDigitalHumanProject, normalizeCopywritingPlan, sidecarPathForVideo, writeDigitalHumanProject } from '../features/digital-human-project/digitalHumanProject.js'"
$manualImport = "import { createManualCopywritingPlan, createManualScriptEntry, insertManualSegment, makeManualSegment, moveManualSegment, parseManualCopywritingPlanJson, rebuildManualCopywritingPlan, removeManualSegment, splitManualTextIntoSegments, updateManualSegment } from '../features/digital-human-project/manualCopywritingPlan.js'"

if (-not $componentContent.Contains($manualImport)) {
    if (-not $componentContent.Contains($projectImport)) {
        throw "没有找到 digitalHumanProject.js import，无法安全插入手动文案编辑器 import。"
    }

    $componentContent = $componentContent.Replace(
        $projectImport,
        "$projectImport`r`n$manualImport"
    )
}

$batchPattern = '(?s)// =====================================================\r?\n// 中间：批量文案输入\r?\n// =====================================================\r?\nfunction BatchScriptInput.*?(?=// =====================================================\r?\n// 右侧：保存路径配置（选择项目）\r?\n// =====================================================)'
$batchMatch = [System.Text.RegularExpressions.Regex]::Match($componentContent, $batchPattern)

if (-not $batchMatch.Success) {
    throw "没有找到 BatchScriptInput 完整代码块。项目版本可能已经变化，已停止修改。"
}

$componentContent = (
    $componentContent.Substring(0, $batchMatch.Index) +
    $fragmentContent.TrimEnd() +
    "`r`n`r`n" +
    $componentContent.Substring($batchMatch.Index + $batchMatch.Length)
)

$oldInitialState = "const [scripts, setScripts] = useState([{ id: Date.now(), text: '' }])"
$newInitialState = "const [scripts, setScripts] = useState([createManualScriptEntry()])"

if ($componentContent.Contains($oldInitialState)) {
    $componentContent = $componentContent.Replace($oldInitialState, $newInitialState)
} elseif (-not $componentContent.Contains($newInitialState)) {
    throw "没有找到 scripts 初始状态，无法确保初始手动文案使用结构化 JSON。"
}

Write-Utf8NoBom -Path $targetComponent -Content $componentContent
Write-Utf8NoBom -Path $targetHelper -Content $helperContent
Write-Utf8NoBom -Path $targetTest -Content ([System.IO.File]::ReadAllText($sourceTest))

Write-Host ""
Write-Host "===================================================="
Write-Host " RJCut 手动结构化文案编辑器 v1.0 已应用"
Write-Host "===================================================="
Write-Host "修改:"
Write-Host "  $targetComponent"
Write-Host "新增:"
Write-Host "  $targetHelper"
Write-Host "  $targetTest"
Write-Host ""
Write-Host "现在每条文案支持:"
Write-Host "  - 全文编辑"
Write-Host "  - 可视化段落编辑"
Write-Host "  - human / scene 场景标记"
Write-Host "  - slot_id / 素材标签 / 剪辑备注"
Write-Host "  - JSON 直接粘贴、修改、校验与应用"
Write-Host "  - 按标点自动分段"
Write-Host ""
Write-Host "验证命令:"
Write-Host "  cd `"$StudioRoot`""
Write-Host "  node .\scripts\test_manual_copywriting_editor_v1_0.mjs"
Write-Host "  npm run build"
