param(
    [string]$StudioRoot = "D:\workspace\rjcut\studio"
)

$ErrorActionPreference = "Stop"

$Target = Join-Path $StudioRoot "src\features\digital-human-project\digitalHumanDownload.js"

if (-not (Test-Path -LiteralPath $Target)) {
    throw "Target file not found: $Target"
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Backup = "$Target.dh_download_hotfix_v1_1_2_backup_$Timestamp"
Copy-Item -LiteralPath $Target -Destination $Backup -Force

$Content = [System.IO.File]::ReadAllText($Target)

$Patterns = @(
    '(const\s+id\s*=\s*encodeURIComponent\(String\(taskId\)\))(\r?\n\s*)\[',
    '(const\s+encodedTaskId\s*=\s*encodeURIComponent\(String\(taskId\)\))(\r?\n\s*)\['
)

$Matched = $false

foreach ($Pattern in $Patterns) {
    $Regex = New-Object System.Text.RegularExpressions.Regex($Pattern)

    if ($Regex.IsMatch($Content)) {
        $Content = $Regex.Replace($Content, '$1;$2[', 1)
        $Matched = $true
        break
    }
}

if (-not $Matched) {
    if (
        $Content -match 'const\s+(id|encodedTaskId)\s*=\s*encodeURIComponent\(String\(taskId\)\);'
    ) {
        Write-Host "[INFO] The semicolon fix is already present."
    }
    else {
        throw "Patch location was not found. Restore the previous file or inspect digitalHumanDownload.js near taskId."
    }
}

$Utf8Bom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($Target, $Content, $Utf8Bom)

Write-Host "[BACKUP] $Backup"
Write-Host "[PATCH]  $Target"

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($NodeCommand) {
    & $NodeCommand.Source --check $Target

    if ($LASTEXITCODE -ne 0) {
        throw "node --check failed. Backup: $Backup"
    }

    Write-Host "[PASS] node --check"
}
else {
    Write-Host "[WARN] node was not found. Syntax check skipped."
}

Write-Host ""
Write-Host "RJCut digital-human download hotfix v1.1.2 applied."
Write-Host "Next:"
Write-Host "  cd `"$StudioRoot`""
Write-Host "  npm run build"
