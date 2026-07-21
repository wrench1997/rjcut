# RJCut 模板混剪 + 字级时间轴重构补丁 v0.8

适用目录：

```text
D:\workspace\rjcut\studio
```

## 修复的问题

### 1. 第五步误用上一次成片

旧逻辑使用草稿 `draft.id` 生成固定任务 ID，并把输出写到：

```text
/输出/<task.id>_成片.mp4
```

再次生成时，页面发现这个文件已经存在，就把旧文件当成本次结果。

v0.8 改为：

```text
/<项目>/输出/模板混剪/<唯一 runId>/<模板>_<场景版本>.mp4
```

每次点击生成都会创建全新的 `runId`、timeline、render report 和 MP4。

### 2. 第五步组件承担了真正合成

旧版先把任务标记为 `succeeded`，再依赖第五步组件的 `useEffect` 偷偷合成视频，导致状态和真实文件不同步。

v0.8 中：

```text
TemplateBatchPage
  -> convertToBatchTasks
  -> useBatchProcessStore
  -> localTemplateRenderer
  -> VFS 独立输出
  -> TaskProgressStep 只展示结果
```

第五步不再触发渲染副作用。

### 3. `.rjdh.json` 没有直观的转场毫秒段

新版保存：

```json
{
  "schema": "rjcut.digital-human-project/v2",
  "copywriting": {
    "spoken_text": "纯口播",
    "segments": [],
    "transition_segments": [
      {
        "segment_id": "s2",
        "slot_id": "slot_1"
      }
    ]
  },
  "transition_segments": [
    {
      "segment_id": "s2",
      "text": "这里展示鹿场。",
      "start_ms": 2150,
      "end_ms": 4860,
      "duration_ms": 2710,
      "slot_id": "slot_1",
      "action": "replace_visual",
      "keep_original_audio": true
    }
  ],
  "timeline": {
    "segments": [],
    "clips": [],
    "transition_clips": []
  }
}
```

区别：

- `copywriting.transition_segments`：AI 生成阶段的语义意图，还没有毫秒时间。
- 顶层 `transition_segments`：数字人返回 `char_timings` 后计算出的精确时间。
- `timeline.transition_clips`：模板混剪直接消费的剪辑片段。

### 4. AI 文案页面看不到场景段

AI 文案生成后，每段会显示：

```text
数字人
场景替换
slot_id
素材标签
段落原文
```

用户可以在生成数字人前手动把某段切换为“数字人”或“场景”。

数字人生成完成后，进度窗口会显示写入 JSON 的精确场景时间范围。

### 5. 多段视频合并丢片段

旧 `_buildXfadeArgs` 固定：

```text
concat=n=2
```

场景超过两个时后续片段可能被丢弃。v0.8 改为按实际 `clipCount` 合并全部片段。

## 输出文件

每次模板混剪批次：

```text
/12344/输出/模板混剪/mix_.../
  run.json
  <模板>_<场景>.timeline.json
  <模板>_<场景>.render.json
  <模板>_<场景>.mp4
```

## 验证

```powershell
cd D:\workspace\rjcut\studio

node .\scripts\test_template_mix_timeline_v0_8.mjs
npm run build
```

测试通过：

```text
TEMPLATE_MIX_TIMELINE_V0_8=PASS
```

## 注意

旧的数字人 `.rjdh.json` v1 仍可加载。新生成文件使用 v2。

补丁不修改 Python 后端，也不会恢复旧的 `agent-draft` 或 `agent-compose` 模板混剪路径。
