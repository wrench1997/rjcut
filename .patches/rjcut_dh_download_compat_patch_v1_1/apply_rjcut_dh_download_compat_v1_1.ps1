param(
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

function Write-Utf8NoBom {
    param([string]$Path, [string]$Content)
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Backup-Target {
    param([string]$Path, [string]$Stamp)
    if (Test-Path $Path) {
        $backup = "$Path.dh_download_v1_1_backup_$Stamp"
        Copy-Item $Path $backup -Force
        Write-Host "[BACKUP] $backup"
    }
}

if (-not (Test-Path $StudioRoot)) {
    throw "StudioRoot 不存在: $StudioRoot"
}

$PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PayloadRoot = Join-Path $PackageRoot "payload\studio"
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"

$ComponentPath = Join-Path $StudioRoot "src\components\DigitalHumanStudio.jsx"
$ApiPath = Join-Path $StudioRoot "src\api\api.js"
$HelperPath = Join-Path $StudioRoot "src\features\digital-human-project\digitalHumanDownload.js"
$TestPath = Join-Path $StudioRoot "scripts\test_digital_human_download_compat_v1_1.mjs"

foreach ($path in @($ComponentPath, $ApiPath)) {
    if (-not (Test-Path $path)) { throw "缺少文件: $path" }
}

Backup-Target $ComponentPath $Stamp
Backup-Target $ApiPath $Stamp
Backup-Target $HelperPath $Stamp
Backup-Target $TestPath $Stamp

Copy-Item (Join-Path $PayloadRoot "src\features\digital-human-project\digitalHumanDownload.js") $HelperPath -Force
Copy-Item (Join-Path $PayloadRoot "scripts\test_digital_human_download_compat_v1_1.mjs") $TestPath -Force
Write-Host "[WRITE] $HelperPath"
Write-Host "[WRITE] $TestPath"

$component = [System.IO.File]::ReadAllText($ComponentPath)

$downloadImport = "import { downloadDigitalHumanVideo } from '../features/digital-human-project/digitalHumanDownload.js'"
if (-not $component.Contains($downloadImport)) {
    $importAnchor = "(import \{[^\r\n]*\} from '\.\./features/digital-human-project/digitalHumanProject\.js')"
    $importRegex = New-Object System.Text.RegularExpressions.Regex($importAnchor)
    if (-not $importRegex.IsMatch($component)) {
        throw "找不到 digitalHumanProject.js import"
    }
    $component = $importRegex.Replace($component, "`$1`r`n$downloadImport", 1)
}

$resumeOld = @'
const videoResponse = await fetch(toDigitalHumanAssetUrl(status.result.video_url, baseUrl))
            if (!videoResponse.ok) throw new Error(`下载数字人视频失败：HTTP ${videoResponse.status}`)
            const videoBlob = await videoResponse.blob()
'@
$resumeNew = @'
const originalVideoUrl = status.result.video_url
            const { blob: videoBlob, url: resolvedVideoUrl, attempts: videoDownloadAttempts } =
              await downloadDigitalHumanVideo({
                result: status.result,
                baseUrl,
                taskId: task.dhTaskId,
              })
            status.result.video_url = resolvedVideoUrl
            console.log('[DigitalHumanStudio] 恢复任务视频地址:', {
              originalVideoUrl,
              resolvedVideoUrl,
              attempts: videoDownloadAttempts,
            })
'@
if ($component.Contains($resumeOld)) {
    $component = $component.Replace($resumeOld, $resumeNew)
} elseif (-not $component.Contains("taskId: task.dhTaskId")) {
    throw "找不到恢复任务下载代码块"
}

$mainOld = @'
const videoResponse = await fetch(toDigitalHumanAssetUrl(result.video_url, apiBaseUrl))
          if (!videoResponse.ok) throw new Error(`下载数字人视频失败：HTTP ${videoResponse.status}`)
          const videoBlob = await videoResponse.blob()
'@
$mainNew = @'
const originalVideoUrl = result.video_url
          const { blob: videoBlob, url: resolvedVideoUrl, attempts: videoDownloadAttempts } =
            await downloadDigitalHumanVideo({
              result,
              baseUrl: apiBaseUrl,
              taskId: dhTaskId,
            })
          result.video_url = resolvedVideoUrl
          console.log('[DigitalHumanStudio] 视频下载地址:', {
            originalVideoUrl,
            resolvedVideoUrl,
            attempts: videoDownloadAttempts,
          })
'@
if ($component.Contains($mainOld)) {
    $component = $component.Replace($mainOld, $mainNew)
} elseif (-not $component.Contains("taskId: dhTaskId")) {
    throw "找不到主流程下载代码块"
}

$listPattern = '(?s)let commonPersonsRes, customPersonsRes, voicesRes\s+try \{\s*;\[commonPersonsRes, customPersonsRes, voicesRes\] = await Promise\.all\(\[\s*getCommonPersons\(\),\s*getCustomPersons\(\),\s*getVoices\(\),?\s*\]\)\s*\} catch \(apiErr\) \{.*?\}\s*(?=const \[cRes, pRes, vRes\])'
$listReplacement = @'
let commonPersonsRes, customPersonsRes, voicesRes

        const listResults = await Promise.allSettled([
          getCommonPersons(),
          getCustomPersons(),
          getVoices(),
        ])
        const listNames = ['公共数字人', '自定义数字人', '声音列表']
        const listFallback = () => ({ data: { code: 0, data: [] } })

        ;[commonPersonsRes, customPersonsRes, voicesRes] = listResults.map((settled, index) => {
          if (settled.status === 'fulfilled') return settled.value

          const apiErr = settled.reason
          const detail =
            apiErr?.responseData?.detail?.message ||
            apiErr?.responseData?.detail ||
            apiErr?.responseData?.message ||
            apiErr?.data?.message ||
            apiErr?.message ||
            '未知错误'

          console.error(`[DigitalHumanStudio] ${listNames[index]}加载失败:`, {
            message: apiErr?.message,
            code: apiErr?.code,
            data: apiErr?.data,
            responseData: apiErr?.responseData,
          })
          setStatusMsg(`${listNames[index]}加载失败，其他数据继续加载：${detail}`)
          return listFallback()
        })


'@
$listRegex = New-Object System.Text.RegularExpressions.Regex(
    $listPattern,
    [System.Text.RegularExpressions.RegexOptions]::Singleline
)
if ($listRegex.IsMatch($component)) {
    $component = $listRegex.Replace($component, $listReplacement, 1)
} elseif (-not $component.Contains("Promise.allSettled([")) {
    throw "找不到列表 Promise.all 代码块"
}

Write-Utf8NoBom $ComponentPath $component
Write-Host "[PATCH] $ComponentPath"

$apiText = [System.IO.File]::ReadAllText($ApiPath)
$oldBusiness = @'
if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
        const error = new Error(data.message || '请求失败');
        error.code = data.code;
        error.data = data.data;
        // 标记 token 过期错误，便于前端特殊处理
        error.isTokenExpired = data.message?.includes('Token') || data.message?.includes('token') || data.code === 401;
        throw error;
      }
'@
$newBusiness = @'
if (data.code !== undefined && data.code !== 0 && data.code !== 200) {
        const detailMessage =
          (typeof data.detail === 'string' ? data.detail : data.detail?.message) ||
          data.error?.message ||
          data.msg ||
          data.message ||
          `请求失败（业务码 ${data.code}）`;
        const error = new Error(detailMessage);
        error.code = data.code;
        error.data = data.data;
        error.responseData = data;
        error.isBusinessError = true;
        error.isTokenExpired =
          detailMessage.includes('Token') ||
          detailMessage.includes('token') ||
          data.code === 401;
        throw error;
      }
'@
if ($apiText.Contains($oldBusiness)) {
    $apiText = $apiText.Replace($oldBusiness, $newBusiness)
} elseif (-not $apiText.Contains("error.isBusinessError = true")) {
    throw "找不到 api.js 业务错误代码块"
}
Write-Utf8NoBom $ApiPath $apiText
Write-Host "[PATCH] $ApiPath"

Write-Host ""
Write-Host "RJCut 数字人下载兼容补丁 v1.1 已应用。"
Write-Host "验证:"
Write-Host "  cd `"$StudioRoot`""
Write-Host "  node .\scripts\test_digital_human_download_compat_v1_1.mjs"
Write-Host "  npm run build"
