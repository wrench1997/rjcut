# RJCut AI 文案 JSON、转场段与视频预览修复 v0.7

适用：

```text
后端：D:\workspace\rjcut
前端：D:\workspace\rjcut\studio
```

## 文案返回合同

`POST /v1/ai/generate-script` 返回：

```json
{
  "code": 0,
  "data": {
    "script": {
      "schema": "rjcut.copywriting-plan/v2",
      "spoken_text": "只给数字人朗读的完整自然文案",
      "segments": [
        {
          "id": "s1",
          "text": "数字人出镜开场。",
          "visual_mode": "human",
          "edit_action": "keep_digital_human",
          "is_transition_segment": false,
          "transition": {
            "enabled": false,
            "action": "keep_digital_human",
            "slot_id": null,
            "keep_original_audio": true,
            "entry": "cut",
            "exit": "cut"
          }
        },
        {
          "id": "s2",
          "text": "这里继续讲鹿场来源和采集过程。",
          "visual_mode": "scene",
          "slot_id": "slot_1",
          "visual_tags": ["鹿场来源", "采集实拍"],
          "edit_action": "replace_visual",
          "is_transition_segment": true,
          "transition": {
            "enabled": true,
            "action": "replace_visual",
            "slot_id": "slot_1",
            "keep_original_audio": true,
            "entry": "cut",
            "exit": "cut"
          }
        }
      ],
      "transition_segments": [
        {
          "segment_id": "s2",
          "slot_id": "slot_1",
          "action": "replace_visual",
          "visual_tags": ["鹿场来源", "采集实拍"],
          "keep_original_audio": true
        }
      ]
    }
  }
}
```

`spoken_text` 和 `segments.text` 中不会出现“转场”。转场只存在于结构化字段。

## 数字人 sidecar

视频生成后保存：

```text
xxx.mp4
xxx.rjdh.json
```

`.rjdh.json` 保存：

```text
copywriting.spoken_text
copywriting.segments
copywriting.transition_segments
transition_segments
char_timings
timeline.segments
timeline.clips
```

每个 `timeline.clips` 都保留：

```text
start_ms/end_ms
is_transition_segment
edit_action
transition
slot_id
keep_original_audio
```

模板混剪可直接读取 JSON，不需要识别“转场”口令。

## 视频预览修复

旧代码把 Electron IPC 返回的 Buffer/base64 对象直接执行：

```js
new Blob([arrayBuffer])
```

这会生成损坏的 MP4。新版统一调用：

```js
await vfs.readFileAsBlob(video.path)
```

并为下载视频保存 `video/mp4` MIME 元数据。
