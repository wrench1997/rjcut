# MuseTalk 字级时间轴 API 测试模块 v0.1

默认测试地址：

```text
http://192.168.166.151:8080
```

测试接口：

```text
GET  /health
POST /v1/digital-human/generate
GET  /v1/digital-human/tasks/{task_id}
GET  /v1/digital-human/tasks/{task_id}/char-timings
```

## 执行完整测试

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\musetalk_api_test\run_musetalk_api_test.ps1
```

## 只测试健康检查

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\musetalk_api_test\run_musetalk_api_test.ps1 `
  -HealthOnly
```

## 自定义文案

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\musetalk_api_test\run_musetalk_api_test.ps1 `
  -Text "想买鹿茸血的家人们，这条视频你一定要看完。"
```

## 暂时允许服务省略标点时间点

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\musetalk_api_test\run_musetalk_api_test.ps1 `
  -AllowMissingPunctuation
```

测试报告输出到：

```text
scripts\musetalk_api_test\reports\
```

包含 JSON 与 HTML 报告。退出码 `0` 表示全部通过，`1` 表示接口或数据校验失败。
