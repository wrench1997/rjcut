# AI Copywriting Timeline Patch v0.1

执行方式：

```powershell
cd D:\你的项目目录
Expand-Archive `
  -Path "$env:USERPROFILE\Downloads\ai_copywriting_timeline_patch_v0_1.zip" `
  -DestinationPath ".\.patches\ai_copywriting_timeline_patch_v0_1" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\.patches\ai_copywriting_timeline_patch_v0_1\apply_ai_copywriting_timeline_patch.ps1" `
  -ProjectRoot "D:\你的项目目录"
```

也可以在项目根目录直接：

```powershell
powershell -ExecutionPolicy Bypass `
  -File ".\.patches\ai_copywriting_timeline_patch_v0_1\apply_ai_copywriting_timeline_patch.ps1" `
  -ProjectRoot "."
```

作用：新增 `src\modules\ai_copywriting`，包含广告提示词预设、用户提示词过滤、结构化文案解析、字级时间轴映射、素材匹配、自动转场 timeline。
