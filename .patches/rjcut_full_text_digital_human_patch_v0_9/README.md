# RJCut 完整文本数字人合同补丁 v0.9

适用：已经安装 v0.8 模板混剪时间线重构的 Studio。

## 固定主线

```text
AI 生成：spoken_text + semantic segments
       ↓
8080：只接收一次完整 spoken_text，生成一条完整数字人视频
       ↓
8080 返回：完整 MP4 + 完整 char_timings
       ↓
RJCut：segments + char_timings 转成毫秒区间
       ↓
模板混剪：本地替换 scene 段画面，保留原口播音频
```

8080 不接收 segments，不负责混剪，也不负责场景切换。

## 修复内容

- 强制数字人请求使用 `copywritingPlan.spoken_text`。
- 请求日志打印完整文本长度、头 40 字、尾 40 字。
- `segments` 仅保存于 RJCut；若 segment.text 无法在 spoken_text 中顺序找到，禁止提交。
- 视频下载和 `.rjdh.json` 保存之前校验：
  - `video_url`；
  - `duration_ms`；
  - `char_timings` 非空；
  - 字符与 `spoken_text[index]` 对齐；
  - index、时间严格递增；
  - 时间轴覆盖率和尾部位置；
  - 视频时长与文案长度的宽松合理性。
- 类似“487 字却只返回 21 个时间点、4.7 秒视频”的结果会直接失败，不再保存。
- 恢复页面刷新前的运行任务时也执行同一完整性校验。
- `.rjdh.json` 新增 `digital_human.generation_integrity`。

## 安装

```powershell
cd D:\workspace\rjcut

Expand-Archive `
  -Path "$env:USERPROFILE\Downloads\rjcut_full_text_digital_human_patch_v0_9.zip" `
  -DestinationPath ".\.patches\rjcut_full_text_digital_human_patch_v0_9" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\.patches\rjcut_full_text_digital_human_patch_v0_9\apply_rjcut_full_text_digital_human_v0_9.ps1" `
  -StudioRoot "D:\workspace\rjcut\studio"
```

## 验证

```powershell
cd D:\workspace\rjcut\studio

node .\scripts\test_digital_human_full_text_v0_9.mjs
node .\scripts\test_template_mix_timeline_v0_8.mjs
npm run build
```

应看到：

```text
DIGITAL_HUMAN_FULL_TEXT_V0_9=PASS
TEMPLATE_MIX_TIMELINE_V0_8=PASS
```

重新启动 Studio 后，用一条长文案生成。控制台应显示：

```text
提交数字人生成请求（完整文本，仅一次）
textLength: 487
textHead: 想买鹿茸血...
textTail: ...库存不多，手慢就没了！
```

若 8080 仍返回 4 秒局部视频，任务会显示失败，并指出时间轴覆盖率、字符错位或时长不足，不会污染模板混剪项目。
