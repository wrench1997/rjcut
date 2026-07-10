param(
    [string]$BaseUrl = "http://127.0.0.1:8080",
    [string]$Text = "你好，欢迎使用数字人服务。这是一段字级时间轴接口测试文案，用于检查每个字符的开始时间和结束时间。",
    [string]$PersonId = "human",
    [string]$AudioManId = "audio_human",
    [ValidateSet("whole_body", "portrait")]
    [string]$FigureType = "whole_body",
    [int]$TimeoutSeconds = 900,
    [double]$PollInterval = 3,
    [switch]$HealthOnly,
    [switch]$SkipMediaCheck,
    [switch]$AllowMissingPunctuation
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TestScript = Join-Path $ScriptDir "test_musetalk_api.py"

if (-not (Test-Path $TestScript)) {
    throw "测试脚本不存在: $TestScript"
}

$pythonExe = $null
$pythonPrefix = @()
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCommand) {
    $pythonExe = $pythonCommand.Source
} else {
    $pyCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCommand) {
        $pythonExe = $pyCommand.Source
        $pythonPrefix = @("-3")
    }
}
if (-not $pythonExe) {
    throw "没有找到 Python。请确认 python 或 py -3 可以运行。"
}

$argsList = @(
    $TestScript,
    "--base-url", $BaseUrl,
    "--text", $Text,
    "--person-id", $PersonId,
    "--figure-type", $FigureType,
    "--timeout-seconds", "$TimeoutSeconds",
    "--poll-interval", "$PollInterval"
)
if ($AudioManId) { $argsList += @("--audio-man-id", $AudioManId) }
if ($HealthOnly) { $argsList += "--health-only" }
if ($SkipMediaCheck) { $argsList += "--skip-media-check" }
if ($AllowMissingPunctuation) { $argsList += "--allow-missing-punctuation" }

Write-Host "========================================"
Write-Host " MuseTalk API Test"
Write-Host " BaseUrl: $BaseUrl"
Write-Host "========================================"

& $pythonExe @pythonPrefix @argsList
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    Write-Host "测试失败，退出码: $exitCode" -ForegroundColor Red
    exit $exitCode
}
Write-Host "测试通过。" -ForegroundColor Green
