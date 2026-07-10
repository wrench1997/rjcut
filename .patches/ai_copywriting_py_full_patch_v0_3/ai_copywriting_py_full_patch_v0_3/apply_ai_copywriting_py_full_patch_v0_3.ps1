param(
    [string]$BackendRoot = "D:\workspace\rjcut",
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Ok([string]$Message) {
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Backup-File([string]$Path) {
    if (Test-Path $Path) {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $backup = "$Path.ai_copywriting_v0_3_backup_$timestamp"
        Copy-Item $Path $backup -Force
        Write-Info "Backup: $Path -> $backup"
    }
}

function Write-Utf8NoBomFile([string]$Path, [string]$Content) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    Backup-File $Path
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
    Write-Ok "Write: $Path"
}

function Read-Text([string]$Path) {
    return [System.IO.File]::ReadAllText($Path)
}

function Write-Text([string]$Path, [string]$Text) {
    Backup-File $Path
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
    Write-Ok "Patch: $Path"
}

function Replace-Literal([string]$Path, [string]$Old, [string]$New) {
    if (-not (Test-Path $Path)) {
        Write-Warn "Skip missing file: $Path"
        return
    }
    $text = Read-Text $Path
    if ($text.Contains($Old)) {
        $text = $text.Replace($Old, $New)
        Write-Text $Path $text
    } else {
        Write-Warn "Text not found, skip literal replace in $Path"
    }
}

function Ensure-ApiServiceRouter([string]$ApiServicePath) {
    if (-not (Test-Path $ApiServicePath)) {
        Write-Warn "api_service.py not found: $ApiServicePath"
        return
    }
    $text = Read-Text $ApiServicePath
    $changed = $false

    if ($text -notmatch "api_ai_copywriting") {
        $needle = "from api_digital_human import router as dh_router"
        if ($text.Contains($needle)) {
            $text = $text.Replace($needle, "$needle`r`nfrom api_ai_copywriting import router as ai_copywriting_router")
            $changed = $true
        } else {
            Write-Warn "Cannot find dh_router import marker in api_service.py"
        }
    }

    if ($text -notmatch "app\.include_router\(ai_copywriting_router\)") {
        $needle2 = "app.include_router(dh_router)"
        if ($text.Contains($needle2)) {
            $text = $text.Replace($needle2, "$needle2`r`napp.include_router(ai_copywriting_router)")
            $changed = $true
        } else {
            Write-Warn "Cannot find dh_router include marker in api_service.py"
        }
    }

    $oldBlock = @'
        # 🔧 硬替换：将所有 scene 段落的 text 替换为"转场"
        template = result["template"]
        if template and "segments" in template:
            for seg in template["segments"]:
                if seg.get("flag") == "scene":
                    seg["text"] = "转场"
'@
    $newBlock = @'
        # v0.3：不再把 scene 段落硬替换成“转场”。
        # scene 现在只表示素材位 / 画面切换意图，数字人口播不应朗读“转场”。
        template = result["template"]
        if template and "segments" in template:
            for seg in template["segments"]:
                if seg.get("flag") == "scene":
                    seg["transition_after"] = True
                    seg.setdefault("visual_tags", [seg.get("note", "")])
'@
    if ($text.Contains($oldBlock)) {
        $text = $text.Replace($oldBlock, $newBlock)
        $changed = $true
    }

    if ($changed) {
        Write-Text $ApiServicePath $text
    } else {
        Write-Info "api_service.py already patched or no matching block found."
    }
}

function Patch-DraftUtils([string]$Path) {
    if (-not (Test-Path $Path)) {
        Write-Warn "draft_utils.py not found: $Path"
        return
    }
    $text = Read-Text $Path
    $original = $text

    $text = $text.Replace('每一段之间都用"转场"两个字隔开。', '不要在口播文案中输出"转场"两个字；画面切换由后端 timeline 自动处理。')
    $text = $text.Replace('scene 段落的文案必须以"转场"开头，但要优雅自然，用意境烘托氛围，不要直白描述画面（如"转场，深山里的梅花鹿自由生长..."、"转场，每一滴都是自然的馈赠..."等）。', 'scene 段落不要以"转场"开头；scene 只代表素材位和画面意图，文案要自然衔接。')
    $text = $text.Replace('- scene 段落必须以"转场"开头，但要优雅自然，用意境烘托氛围', '- scene 段落不要以"转场"开头；需要切画面的信息交给 visual_tags / timeline')
    $text = $text.Replace('-- scene 段落：必须以"转场"开头，优雅自然地烘托氛围', '-- scene 段落：不要以"转场"开头；需要切画面的信息交给 visual_tags / timeline')
    $text = $text.Replace('- scene 段落：必须以"转场"开头，优雅自然地烘托氛围', '- scene 段落：不要以"转场"开头；需要切画面的信息交给 visual_tags / timeline')

    $old = @'
                        # 【移除 "Line X: " 前缀】AI 可能输出 "Line 1: xxx" 格式
                        cleaned_line = re.sub(r'^Line\s*\d+\s*:\s*', '', line_stripped, flags=re.IGNORECASE)
                        cleaned_lines.append(cleaned_line)
'@
    $new = @'
                        # 【移除 "Line X: " 前缀】AI 可能输出 "Line 1: xxx" 格式
                        cleaned_line = re.sub(r'^Line\s*\d+\s*:\s*', '', line_stripped, flags=re.IGNORECASE)
                        # v0.3：不再允许“转场”进入数字人口播。
                        cleaned_line = re.sub(r'^\s*[【\[]?转场[^】\]]*[】\]]?\s*', '', cleaned_line).strip()
                        cleaned_line = cleaned_line.replace("转场", "").strip()
                        if cleaned_line:
                            cleaned_lines.append(cleaned_line)
'@
    if ($text.Contains($old)) {
        $text = $text.Replace($old, $new)
    }

    if ($text -ne $original) {
        Write-Text $Path $text
    } else {
        Write-Info "draft_utils.py already patched or no matching text found."
    }
}

function Patch-AiAssistant([string]$Path) {
    if (-not (Test-Path $Path)) {
        Write-Warn "aiAssistant.js not found: $Path"
        return
    }
    $text = Read-Text $Path
    $changed = $false

    if ($text -notmatch "aiCopywritingClient") {
        $text = "import { aiGenerateStructuredScript, structuredScriptToLegacySegments } from './aiCopywritingClient.js'`r`n" + $text
        $changed = $true
    }

    $start = $text.IndexOf("export async function aiGenerateScript({")
    if ($start -lt 0) {
        Write-Warn "Cannot find aiGenerateScript function in $Path"
    } else {
        $end = $text.IndexOf("/**`r`n * AI 自动生成模板", $start)
        if ($end -lt 0) { $end = $text.IndexOf("/**`n * AI 自动生成模板", $start) }
        if ($end -lt 0) {
            Write-Warn "Cannot find end marker after aiGenerateScript in $Path"
        } else {
            $newFn = @'
export async function aiGenerateScript({
  customPrompt,
  templateId,
  segments,
  productName = '',
  sellingPoints = '',
  targetAudience = '',
  tone = 'direct_sale',
  comparisonProduct = '普通产品/假冒产品',
  farmScale = '自家鹿场养殖',
  identificationPoints = '颜色、状态、溯源信息',
  callToAction = '点击下方链接/评论区留言',
}) {
  // v0.3：调用 Python/FastAPI 后端的新结构化文案接口。
  // 返回给旧 UI 的仍然是 segments 数组，但不会再包含 flag=transition，避免插入【转场】给数字人朗读。
  const requestBody = {
    template_id: templateId,
    template_structure: segments,
    preset_id: tone,
    tone,
    user_style_prompt: customPrompt || '',
    custom_prompt: customPrompt || '',
    product_name: productName,
    selling_points: sellingPoints,
    target_audience: targetAudience,
    comparison_product: comparisonProduct,
    farm_scale: farmScale,
    identification_points: identificationPoints,
    call_to_action: callToAction,
    material_tags: (segments || []).map((s) => s.note).filter(Boolean),
  }

  console.log('[AI 生成文案 v0.3] 请求体:', requestBody)
  const result = await aiGenerateStructuredScript(requestBody)
  console.log('[AI 生成文案 v0.3] 成功响应:', result)

  return structuredScriptToLegacySegments(result, segments)
}

'@
            $text = $text.Substring(0, $start) + $newFn + $text.Substring($end)
            $changed = $true
        }
    }

    if ($changed) {
        Write-Text $Path $text
    } else {
        Write-Info "aiAssistant.js already patched or unchanged."
    }
}

function Patch-StudioText([string]$StudioRoot) {
    $aiScriptPath = Join-Path $StudioRoot "src\components\AIScriptGenerator.jsx"
    if (Test-Path $aiScriptPath) {
        $text = Read-Text $aiScriptPath
        $original = $text
        $text = $text.Replace('每一段之间都用"转场"两个字隔开。', '不要在口播文案中输出"转场"两个字；画面切换由后端 timeline 自动处理。')
        $text = $text.Replace('请直接输出完整口播文案，每一段之间用"转场"隔开', '请直接输出完整口播文案，不要输出"转场"字样')
        $text = $text.Replace('- scene 段落必须以"转场"开头，优雅自然地烘托氛围', '- scene 段落不要以"转场"开头；需要切画面的信息交给 visual_tags/timeline')
        $text = $text.Replace('scene 段落必须以"转场"开头，优雅自然地烘托氛围', 'scene 段落不要以"转场"开头；需要切画面的信息交给 visual_tags/timeline')
        if ($text -ne $original) { Write-Text $aiScriptPath $text }
    }

    $dhPath = Join-Path $StudioRoot "src\components\DigitalHumanStudio.jsx"
    if (Test-Path $dhPath) {
        $text = Read-Text $dhPath
        $original = $text
        $text = $text.Replace('每一段之间都用"转场"两个字隔开。', '不要在口播文案中输出"转场"两个字；新版转场由后端 timeline 自动处理。')
        $text = $text.Replace('根据模板结构智能生成带转场提示的文案', '根据模板结构智能生成口播文案；转场由 timeline 自动处理')
        $text = $text.Replace('// hook、human、ending 段落有文案，transition 段落作为转场提示', '// v0.3：只保留数字人要朗读的文案，转场不再混入口播')
        $text = $text.Replace('// 合并所有段落为一条完整文案，用【转场】标识分隔', '// 合并所有段落为一条完整口播文案，不再插入【转场】')
        $text = $text.Replace('fullScript += `\n【转场：${segment.note || ''场景切换''}】\n`', 'fullScript += ``')
        $text = $text.Replace('const transitionCount = generatedSegments.filter(s => s.flag === ''transition'').length', 'const transitionCount = generatedSegments.filter(s => s.transition_after).length')
        $text = $text.Replace('alert(`✅ AI 文案生成成功！已合并为 1 条完整脚本（${textCount}段文案 + ${transitionCount}个转场）`)', 'alert(`✅ AI 文案生成成功！已合并为 1 条完整口播脚本（${textCount}段文案，${transitionCount}个自动转场点不会被朗读）`)')
        if ($text -ne $original) { Write-Text $dhPath $text }
    }

    $registryPath = Join-Path $StudioRoot "src\features\template-batch\templateRegistry.js"
    if (Test-Path $registryPath) {
        $text = Read-Text $registryPath
        $original = $text
        $text = $text.Replace("transitionKeyword: '转场',", "transitionKeyword: '',`r`n      mode: 'char_timing_timeline',")
        $text = $text.Replace('hint: `请选择使用本模板口播稿生成的数字人视频；视频中应包含 ${slots.length} 次"转场"标记。`,', 'hint: `新版数字人不需要朗读"转场"。请选择使用本模板口播稿生成的视频；后续会根据字级时间轴自动生成 ${slots.length} 个转场点。`,')
        if ($text -ne $original) { Write-Text $registryPath $text }
    }

    $adapterPath = Join-Path $StudioRoot "src\features\template-batch\templateRunAdapter.js"
    if (Test-Path $adapterPath) {
        $text = Read-Text $adapterPath
        $original = $text
        $text = $text.Replace('`[模板提示] 此模板建议使用含有 ${template.sourceVideoRequirement.expectedTransitionCount} 段转场的口播视频。`', '`[模板提示] 新版不要求口播视频朗读“转场”；系统会根据字级时间轴生成 ${template.sourceVideoRequirement.expectedTransitionCount} 个自动转场点。`')
        if ($text -ne $original) { Write-Text $adapterPath $text }
    }

    $apiPath = Join-Path $StudioRoot "src\api\api.js"
    if (Test-Path $apiPath) {
        $text = Read-Text $apiPath
        if ($text -notmatch "aiCopywritingGeneratePlan") {
            $insert = @'

// AI 结构化文案 v0.3：Python 后端版，不再让数字人朗读“转场”
export const aiCopywritingPresets = () => apiClient.get('/v1/ai-copywriting/presets');
export const aiCopywritingValidatePrompt = (data) => apiClient.post('/v1/ai-copywriting/validate-prompt', data);
export const aiCopywritingGeneratePlan = (data) => apiClient.post('/v1/ai-copywriting/generate-plan', data);
export const aiCopywritingBuildTimeline = (data) => apiClient.post('/v1/ai-copywriting/build-timeline', data);
'@
            $text = $text + $insert
            Write-Text $apiPath $text
        }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AI Copywriting Python Full Patch v0.3" -ForegroundColor Cyan
Write-Host " BackendRoot: $BackendRoot" -ForegroundColor Cyan
Write-Host " StudioRoot : $StudioRoot" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if (-not (Test-Path $BackendRoot)) { throw "BackendRoot not found: $BackendRoot" }
if (-not (Test-Path $StudioRoot)) { throw "StudioRoot not found: $StudioRoot" }

$patchDir = Split-Path $MyInvocation.MyCommand.Path -Parent

Write-Utf8NoBomFile (Join-Path $BackendRoot "ai_copywriting_timeline.py") (Read-Text (Join-Path $patchDir "ai_copywriting_timeline.py"))
Write-Utf8NoBomFile (Join-Path $BackendRoot "api_ai_copywriting.py") (Read-Text (Join-Path $patchDir "api_ai_copywriting.py"))
Write-Utf8NoBomFile (Join-Path $StudioRoot "src\features\template-batch\aiCopywritingClient.js") (Read-Text (Join-Path $patchDir "aiCopywritingClient.js"))
Write-Utf8NoBomFile (Join-Path $BackendRoot "docs\AI_COPYWRITING_PY_FULL_PATCH_V0_3.md") (Read-Text (Join-Path $patchDir "AI_COPYWRITING_PY_FULL_PATCH_V0_3.md"))

Ensure-ApiServiceRouter (Join-Path $BackendRoot "api_service.py")
Patch-DraftUtils (Join-Path $BackendRoot "draft_utils.py")
Patch-AiAssistant (Join-Path $StudioRoot "src\features\template-batch\aiAssistant.js")
Patch-StudioText $StudioRoot

# 之前错误的 JS 后端示例保留备份并标记为 unused，避免继续误接 Express 路由。
$wrongJsRoute = Join-Path $BackendRoot "examples\ai_copywriting_express_routes.js"
if (Test-Path $wrongJsRoute) {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $disabled = "$wrongJsRoute.unused_js_backend_$timestamp"
    Move-Item $wrongJsRoute $disabled -Force
    Write-Warn "Moved wrong JS backend example to: $disabled"
}

Write-Host "" 
Write-Host "========================================" -ForegroundColor Green
Write-Host " AI Copywriting Python Full Patch v0.3 Applied" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "后端新增:" -ForegroundColor Green
Write-Host "  $BackendRoot\ai_copywriting_timeline.py"
Write-Host "  $BackendRoot\api_ai_copywriting.py"
Write-Host "前端新增:" -ForegroundColor Green
Write-Host "  $StudioRoot\src\features\template-batch\aiCopywritingClient.js"
Write-Host "已接入 FastAPI:" -ForegroundColor Green
Write-Host "  /v1/ai-copywriting/presets"
Write-Host "  /v1/ai-copywriting/generate-plan"
Write-Host "  /v1/ai-copywriting/build-timeline"
Write-Host ""
Write-Host "建议测试:" -ForegroundColor Yellow
Write-Host "  1. 重启后端 FastAPI。"
Write-Host "  2. 重启 studio 前端。"
Write-Host "  3. 模板混剪里生成文案，检查数字人口播文本里不再出现“转场”。"
