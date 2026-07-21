param(
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

$target = Join-Path $StudioRoot "src\features\digital-human-project\digitalHumanDownload.js"

if (-not (Test-Path $target)) {
    throw "文件不存在: $target"
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backup = "$target.dh_download_hotfix_v1_1_1_backup_$timestamp"
Copy-Item $target $backup -Force

$content = [System.IO.File]::ReadAllText($target)

# 修复：
# const id = encodeURIComponent(String(taskId))
# [
#   ...
# ].forEach(...)
#
# 因为下一行以 [ 开头，JavaScript 会把它继续解析成上一行表达式的一部分。
$pattern = '(const\s+id\s*=\s*encodeURIComponent\(String\(taskId\)\))(\r?\n\s*)\['

if (-not [System.Text.RegularExpressions.Regex]::IsMatch($content, $pattern)) {
    # 兼容变量名为 encodedTaskId 的版本
    $pattern = '(const\s+encodedTaskId\s*=\s*encodeURIComponent\(String\(taskId\)\))(\r?\n\s*)\['
}

if (-not [System.Text.RegularExpressions.Regex]::IsMatch($content, $pattern)) {
    throw "没有找到需要修复的“任务 ID 后紧跟数组”代码。请不要重复应用，或确认文件版本。"
}

$content = [System.Text.RegularExpressions.Regex]::Replace(
    $content,
    $pattern,
    '$1;$2[',
    1
)

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($target, $content, $encoding)

Write-Host "[BACKUP] $backup"
Write-Host "[PATCH]  $target"

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    & $node.Source --check $target
    if ($LASTEXITCODE -ne 0) {
        throw "node --check 仍然失败，已保留备份: $backup"
    }
    Write-Host "[PASS] node --check"
} else {
    Write-Host "[WARN] 未找到 node，跳过语法检查"
}

Write-Host ""
Write-Host "RJCut 数字人下载兼容热修复 v1.1.1 已应用。"
Write-Host "请重新执行:"
Write-Host "  cd `"$StudioRoot`""
Write-Host "  npm run build"
