param(
    [string]$BackendRoot = "D:\workspace\rjcut",
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = Join-Path $PatchRoot "payload"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Install-FileWithBackup {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Target,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path $Source)) {
        throw "补丁文件不存在: $Source"
    }

    $targetDir = Split-Path -Parent $Target
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    if (Test-Path $Target) {
        $backup = "$Target.ai_timeline_preview_v0_7_backup_$Timestamp"
        Copy-Item $Target $backup -Force
        Write-Host "[BACKUP][$Label] $Target -> $backup"
    }

    Copy-Item $Source $Target -Force
    Write-Host "[WRITE][$Label]  $Target"
}

if (-not (Test-Path $BackendRoot)) {
    throw "后端目录不存在: $BackendRoot"
}
if (-not (Test-Path $StudioRoot)) {
    throw "前端目录不存在: $StudioRoot"
}

$Files = @(
    @{ S = "backend\draft_utils.py"; T = "draft_utils.py"; Root = $BackendRoot; L = "PY" },
    @{ S = "backend\api_service.py"; T = "api_service.py"; Root = $BackendRoot; L = "PY" },
    @{ S = "backend\scripts\test_ai_copywriting_contract.py"; T = "scripts\test_ai_copywriting_contract.py"; Root = $BackendRoot; L = "TEST" },
    @{ S = "studio\src\components\AIScriptGenerator.jsx"; T = "src\components\AIScriptGenerator.jsx"; Root = $StudioRoot; L = "STUDIO" },
    @{ S = "studio\src\components\DigitalHumanStudio.jsx"; T = "src\components\DigitalHumanStudio.jsx"; Root = $StudioRoot; L = "STUDIO" },
    @{ S = "studio\src\features\template-batch\aiAssistant.js"; T = "src\features\template-batch\aiAssistant.js"; Root = $StudioRoot; L = "STUDIO" },
    @{ S = "studio\src\features\digital-human-project\digitalHumanProject.js"; T = "src\features\digital-human-project\digitalHumanProject.js"; Root = $StudioRoot; L = "STUDIO" },
    @{ S = "studio\src\features\digital-human-project\digitalHumanApi.js"; T = "src\features\digital-human-project\digitalHumanApi.js"; Root = $StudioRoot; L = "STUDIO" },
    @{ S = "studio\src\features\digital-human-project\personIdentity.js"; T = "src\features\digital-human-project\personIdentity.js"; Root = $StudioRoot; L = "STUDIO" },
    @{ S = "studio\scripts\test_ai_timeline_preview_v0_7.mjs"; T = "scripts\test_ai_timeline_preview_v0_7.mjs"; Root = $StudioRoot; L = "TEST" },
    @{ S = "studio\scripts\test_digital_human_person_identity.mjs"; T = "scripts\test_digital_human_person_identity.mjs"; Root = $StudioRoot; L = "TEST" }
)

Write-Host "========================================"
Write-Host " RJCut AI Timeline + Preview v0.7"
Write-Host " BackendRoot: $BackendRoot"
Write-Host " StudioRoot : $StudioRoot"
Write-Host "========================================"

foreach ($File in $Files) {
    Install-FileWithBackup `
        -Source (Join-Path $PayloadRoot $File.S) `
        -Target (Join-Path $File.Root $File.T) `
        -Label $File.L
}

Write-Host ""
Write-Host "========================================"
Write-Host " 补丁已应用"
Write-Host "========================================"
Write-Host "主要变化:"
Write-Host "  1. AI 文案强制返回 copywriting-plan/v2 JSON。"
Write-Host "  2. scene 段明确写入 is_transition_segment/edit_action/transition。"
Write-Host "  3. 同名 .rjdh.json 保存全文、段落、转场摘要、字级时间和 clips。"
Write-Host "  4. 模板混剪可直接按 transition_segments/timeline.clips 绑定素材。"
Write-Host "  5. 视频预览改用 VFS readFileAsBlob，修复 Buffer/base64 被错误转 Blob。"
Write-Host "  6. 选择文案模板时自动填入推荐提示词。"
Write-Host ""
Write-Host "验证命令:"
Write-Host "  cd $BackendRoot"
Write-Host "  python -m py_compile .\draft_utils.py .\api_service.py"
Write-Host "  python .\scripts\test_ai_copywriting_contract.py"
Write-Host ""
Write-Host "  cd $StudioRoot"
Write-Host "  node .\scripts\test_ai_timeline_preview_v0_7.mjs"
Write-Host "  node .\scripts\test_digital_human_person_identity.mjs"
Write-Host "  npm run build"
