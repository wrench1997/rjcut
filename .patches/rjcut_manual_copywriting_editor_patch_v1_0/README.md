# RJCut 手动结构化文案编辑器 v1.0

适用目录：

```text
D:\workspace\rjcut\studio
```

## 解决的问题

旧的“新增文案”仅创建：

```js
{ id, text }
```

因此手动文案没有：

```text
copywritingPlan
segments
transition_segments
visual_mode
slot_id
visual_tags
```

数字人虽然可以朗读全文，但 `.rjdh.json` 无法记录哪些语义段需要替换场景。

## 新编辑方式

每条文案提供三种模式：

### 全文

适合快速输入一整段纯口播。

单段文案可以直接修改。已有多段结构时，全文只读，避免修改全文后段落仍指向旧文字。

### 段落

可手动：

- 添加、删除和调整段落顺序；
- 修改每段实际朗读文字；
- 设置开场、痛点、讲解、信任、收尾；
- 选择“数字人画面”或“场景替换”；
- 填写 `slot_id`；
- 填写素材标签；
- 填写剪辑备注；
- 按标点自动分段。

### JSON

可以直接粘贴或编辑：

```json
{
  "schema": "rjcut.copywriting-plan/v2",
  "spoken_text": "完整纯口播",
  "segments": [
    {
      "id": "s1",
      "text": "第一段口播。",
      "purpose": "hook",
      "visual_mode": "human",
      "visual_tags": [],
      "slot_id": null
    },
    {
      "id": "s2",
      "text": "第二段口播。",
      "purpose": "explain",
      "visual_mode": "scene",
      "visual_tags": ["鹿场全景"],
      "slot_id": "slot_1"
    }
  ]
}
```

应用 JSON 时会校验：

- JSON 是否能解析；
- 是否有 `spoken_text`；
- 是否有有效 `segments`；
- 所有 `segments.text` 拼接后是否与 `spoken_text` 一致。

## 数据主线

```text
AI 文案或手动结构化文案
→ spoken_text + segments
→ 8080 使用完整 spoken_text 生成数字人
→ 返回完整 char_timings
→ RJCut 将 scene 段映射为毫秒区间
→ 保存同名 .rjdh.json
→ 模板混剪按 slot_id 替换画面
```

## 安装

```powershell
cd D:\workspace\rjcut

Expand-Archive `
  -Path "$env:USERPROFILE\Downloads\rjcut_manual_copywriting_editor_patch_v1_0.zip" `
  -DestinationPath ".\.patches\rjcut_manual_copywriting_editor_patch_v1_0" `
  -Force

powershell -ExecutionPolicy Bypass `
  -File ".\.patches\rjcut_manual_copywriting_editor_patch_v1_0\apply_rjcut_manual_copywriting_editor_v1_0.ps1" `
  -StudioRoot "D:\workspace\rjcut\studio"
```

## 验证

```powershell
cd D:\workspace\rjcut\studio

node .\scripts\test_manual_copywriting_editor_v1_0.mjs
npm run build
```

正确测试结果：

```text
MANUAL_COPYWRITING_EDITOR_V1_0=PASS
```
