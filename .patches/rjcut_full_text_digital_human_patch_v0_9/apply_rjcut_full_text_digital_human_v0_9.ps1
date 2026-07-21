param(
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"
$PatchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = Join-Path $PatchRoot "payload\studio"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $StudioRoot)) {
    throw "前端目录不存在: $StudioRoot"
}
if (-not (Test-Path $PayloadRoot)) {
    throw "补丁 payload 不完整: $PayloadRoot"
}

function Read-NormalizedText([string]$Path) {
    return [System.IO.File]::ReadAllText($Path).Replace("`r`n", "`n").Replace("`r", "`n")
}

function Write-Utf8([string]$Path, [string]$Content) {
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Backup-File([string]$Path) {
    if (Test-Path $Path) {
        $backup = "$Path.full_text_v0_9_backup_$Timestamp"
        Copy-Item $Path $backup -Force
        Write-Host "[BACKUP] $Path -> $backup"
    }
}

function Replace-Required([string]$Text, [string]$Old, [string]$New, [string]$Label) {
    if ($Text.Contains($New)) {
        Write-Host "[SKIP] $Label 已应用"
        return $Text
    }
    if (-not $Text.Contains($Old)) {
        throw "无法定位替换范围: $Label。请确认已安装 v0.8，或把当前文件重新打包给 AI。"
    }
    Write-Host "[PATCH] $Label"
    return $Text.Replace($Old, $New)
}

# 1. 安装新增模块与测试。
Get-ChildItem $PayloadRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($PayloadRoot.Length).TrimStart('\', '/')
    $target = Join-Path $StudioRoot $relative
    Backup-File $target
    $content = Read-NormalizedText $_.FullName
    Write-Utf8 $target $content
    Write-Host "[WRITE] $target"
}

# 2. 修改数字人控制平台：始终只发送完整 spoken_text，并在下载前做强校验。
$StudioFile = Join-Path $StudioRoot "src\components\DigitalHumanStudio.jsx"
if (-not (Test-Path $StudioFile)) { throw "文件不存在: $StudioFile" }
Backup-File $StudioFile
$text = Read-NormalizedText $StudioFile

$oldImport = @'
import { buildDigitalHumanProject, normalizeCopywritingPlan, sidecarPathForVideo, writeDigitalHumanProject } from '../features/digital-human-project/digitalHumanProject.js'
'@
$newImport = @'
import { buildDigitalHumanProject, normalizeCopywritingPlan, sidecarPathForVideo, writeDigitalHumanProject } from '../features/digital-human-project/digitalHumanProject.js'
import { requireFullSpokenText, summarizeTextContract, validateDigitalHumanResult } from '../features/digital-human-project/digitalHumanIntegrity.js'
'@
$text = Replace-Required $text $oldImport $newImport "导入完整文本合同模块"

$oldResume = @'
            if (!Array.isArray(status.result.char_timings) || !status.result.char_timings.length) {
              const timingResult = await getTimelineCharTimings(task.dhTaskId, baseUrl)
              status.result.char_timings = timingResult?.char_timings || []
            }

            const identityVerification = verifyGeneratedPersonIdentity(status.result, task.personId)
'@
$newResume = @'
            if (!Array.isArray(status.result.char_timings) || !status.result.char_timings.length) {
              const timingResult = await getTimelineCharTimings(task.dhTaskId, baseUrl)
              status.result.char_timings = timingResult?.char_timings || []
            }

            const resumedFullText = requireFullSpokenText(
              task.copywritingPlan || { spoken_text: task.scriptText },
              task.scriptText
            )
            const resumedIntegrity = validateDigitalHumanResult(status.result, resumedFullText)
            status.result.generation_integrity = resumedIntegrity
            console.log('[DigitalHumanStudio] 恢复任务完整性校验通过:', resumedIntegrity)

            const identityVerification = verifyGeneratedPersonIdentity(status.result, task.personId)
'@
$text = Replace-Required $text $oldResume $newResume "恢复任务时先校验完整视频"

$oldPayload = @'
          const apiBaseUrl = getDigitalHumanBaseUrl()
          const copywritingPlan = normalizeCopywritingPlan(script.copywritingPlan, script.text)
          const audioManId = selectedVoice || selectedPersonDetails?.audio_man_id || ''
          const taskPayload = {
            text: copywritingPlan.spoken_text,
'@
$newPayload = @'
          const apiBaseUrl = getDigitalHumanBaseUrl()
          const copywritingPlan = normalizeCopywritingPlan(script.copywritingPlan, script.text)
          // 8080 只接收一次完整口播。segments 只保存在 RJCut，用于后续模板混剪。
          const fullSpokenText = requireFullSpokenText(copywritingPlan, script.text)
          copywritingPlan.spoken_text = fullSpokenText
          const audioManId = selectedVoice || selectedPersonDetails?.audio_man_id || ''
          const taskPayload = {
            text: fullSpokenText,
'@
$text = Replace-Required $text $oldPayload $newPayload "锁定完整 spoken_text 请求"

$oldExtra = @'
              copywriting_schema: copywritingPlan.schema,
              selected_person_name: selectedPerson.name || '',
'@
$newExtra = @'
              copywriting_schema: copywritingPlan.schema,
              request_contract: 'full_spoken_text_once',
              requested_text_length: Array.from(fullSpokenText).length,
              semantic_segment_count: copywritingPlan.segments.length,
              selected_person_name: selectedPerson.name || '',
'@
$text = Replace-Required $text $oldExtra $newExtra "记录完整文本请求合同"

$oldLog = @'
          console.log('[DigitalHumanStudio] 提交数字人生成请求:', {
            personId: selectedGenerationPersonId,
            personName: selectedPerson.name,
            selectionKey: selectedPersonKey,
            identitySource: selectedIdentity.source,
            figureType: taskPayload.figure_type,
            audioManId,
          })
'@
$newLog = @'
          const textContract = summarizeTextContract(fullSpokenText)
          console.log('[DigitalHumanStudio] 提交数字人生成请求（完整文本，仅一次）:', {
            personId: selectedGenerationPersonId,
            personName: selectedPerson.name,
            selectionKey: selectedPersonKey,
            identitySource: selectedIdentity.source,
            figureType: taskPayload.figure_type,
            audioManId,
            ...textContract,
            semanticSegmentCount: copywritingPlan.segments.length,
            sentKeys: Object.keys(taskPayload),
          })
'@
$text = Replace-Required $text $oldLog $newLog "输出完整文本首尾日志"

$oldResultCheck = @'
          if (!result.video_url || !result.char_timings.length) {
            throw new Error('数字人接口成功响应缺少 video_url 或 char_timings')
          }

          const identityVerification = verifyGeneratedPersonIdentity(result, selectedGenerationPersonId)
'@
$newResultCheck = @'
          const integrity = validateDigitalHumanResult(result, fullSpokenText)
          result.generation_integrity = integrity
          console.log('[DigitalHumanStudio] 数字人完整文本结果校验通过:', {
            ...integrity,
            returnedTextLength: Array.from(String(result.normalized_text || result.text || '')).length,
          })

          const identityVerification = verifyGeneratedPersonIdentity(result, selectedGenerationPersonId)
'@
$text = Replace-Required $text $oldResultCheck $newResultCheck "下载前拒绝局部视频与残缺时间轴"

Write-Utf8 $StudioFile $text
Write-Host "[WRITE] $StudioFile"

# 3. 把完整性校验结果写进同名 .rjdh.json。
$ProjectFile = Join-Path $StudioRoot "src\features\digital-human-project\digitalHumanProject.js"
if (-not (Test-Path $ProjectFile)) { throw "文件不存在: $ProjectFile" }
Backup-File $ProjectFile
$projectText = Read-NormalizedText $ProjectFile
$oldIntegrity = @'
      identity_verification: identityVerification || null,
      audio_man_id: audioManId || '',
'@
$newIntegrity = @'
      identity_verification: identityVerification || null,
      generation_integrity: result?.generation_integrity || null,
      request_contract: result?.generation_integrity?.request_contract || 'full_spoken_text_once',
      audio_man_id: audioManId || '',
'@
$projectText = Replace-Required $projectText $oldIntegrity $newIntegrity "保存 generation_integrity 到 .rjdh.json"
Write-Utf8 $ProjectFile $projectText
Write-Host "[WRITE] $ProjectFile"

Write-Host ""
Write-Host "========================================"
Write-Host " RJCut Full Text Digital Human v0.9 已应用"
Write-Host "========================================"
Write-Host "主线: AI segments 只决定剪辑；8080 只收到一次完整 spoken_text。"
Write-Host "残缺视频、错位字符、过短时长会在下载保存前直接失败。"
Write-Host ""
Write-Host "验证:"
Write-Host "  cd $StudioRoot"
Write-Host "  node .\scripts\test_digital_human_full_text_v0_9.mjs"
Write-Host "  node .\scripts\test_template_mix_timeline_v0_8.mjs"
Write-Host "  npm run build"
