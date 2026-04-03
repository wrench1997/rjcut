
# RJCut 草稿模式 / 视频合成 工作流 Skill 文档

版本：v1.0.0  
适用对象：
- AI Agent
- Workflow Orchestrator
- 自动化平台
- 工具编排引擎
- 低代码工作流系统

---

# 一、Skill 目标

将原本一次性的大型视频合成任务拆解为两个可编排、可人工介入、可被外部 AI 协同处理的阶段：

1. **Draft Skill（草稿生成）**
   - 从原视频生成草稿资产
   - 输出可编辑的逐段脚本 `editable_script`
   - 输出 `timeline_json` / `transcription_json`
   - 支持后续人工或第三方 AI 对识别文本进行修订

2. **Compose Skill（从草稿生成成片）**
   - 从草稿资产和修订结果出发
   - 恢复场景资产
   - 合成最终视频
   - 输出视频、字幕文件、重识别时间戳文件

---

# 二、总体理念

本 Skill 不负责“对话式改稿”，也不负责“生成纠错建议”。

本 Skill 的职责是：

- 把视频加工流程拆成多个可控节点
- 提供适合人工复核的中间产物
- 接受外部 AI / 人工生成的结构化修正结果
- 执行最终合成

也就是说：

- **外部 AI 决定改什么**
- **RJCut Skill 负责把改动应用到工作流里**

---

# 三、适用场景

---

## 场景 1：人工审核驱动
工作流：

1. 上传视频
2. 生成草稿
3. 人工查看 `editable_script`
4. 手工修改识别文本
5. 触发合成
6. 获取成片

---

## 场景 2：外部大模型驱动纠错
工作流：

1. 上传视频
2. 生成草稿
3. 将 `editable_script` 发给外部大模型
4. 外部大模型返回 `corrections`
5. 写回草稿
6. 触发合成

---

## 场景 3：平台型内容生产链路
工作流：

1. 前端提交视频素材
2. 后端创建草稿
3. 草稿进入审核台
4. 文案/运营修改草稿
5. 提交成片
6. 回调业务系统

---

# 四、Skill 列表总览

本工作流建议拆为以下 Skill：

1. `rjcut.create_draft_task`
2. `rjcut.get_draft`
3. `rjcut.update_draft`
4. `rjcut.compose_from_draft`
5. `rjcut.get_task`
6. `rjcut.get_task_file_url`

可选扩展 Skill：

7. `rjcut.apply_rule_correction`
8. `rjcut.wait_task_until_done`

---

# 五、Skill 定义

---

## Skill 1：创建草稿任务

### Skill Name
`rjcut.create_draft_task`

### 作用
创建视频草稿任务，生成：

- cleaned_video
- timeline_json
- transcription_json
- editable_script

### 对应 API
`POST /v1/tasks/agent-draft`

---

### 输入参数

```json
{
  "video_url": "string",
  "script_url": "string|null",
  "scene_base_url": "string|null",
  "corrections_url": "string|null",
  "remove_keyword": "转场",
  "margin": 0.15,
  "min_segment_duration": 0.1,
  "asr_model": "large-v3",
  "asr_device": "cuda",
  "language": "zh",
  "callback_url": null,
  "callback_secret": null,
  "client_ref_id": null,
  "timeout_seconds": 1800
}
```

---

### 输入字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| video_url | string | 是 | 输入视频 URL 或 OSS key |
| script_url | string/null | 否 | 预置脚本 JSON |
| scene_base_url | string/null | 否 | 场景素材目录 |
| corrections_url | string/null | 否 | 纠错 JSON 文件地址 |
| remove_keyword | string | 否 | 待切除关键词，默认 `转场` |
| margin | number | 否 | 关键词切除前后扩展秒数 |
| min_segment_duration | number | 否 | 保留片段最短时长 |
| asr_model | string | 否 | ASR 模型 |
| asr_device | string | 否 | `cpu` / `cuda` |
| language | string | 否 | 语言代码 |
| callback_url | string/null | 否 | 回调地址 |
| callback_secret | string/null | 否 | 回调签名密钥 |
| client_ref_id | string/null | 否 | 业务侧引用 ID |
| timeout_seconds | int | 否 | 超时时间 |

---

### 输出结果

```json
{
  "task_id": "task_xxx",
  "task_type": "agent_draft",
  "status": "queued",
  "trace_id": "trace_xxx",
  "estimated_seconds": 60
}
```

---

### 成功判定
- `code == 0`

### 失败处理建议
- 若 `40201`：提示配额不足
- 若 `42901`：延迟重试
- 若 `40003`：参数错误，流程终止

---

### 编排建议
创建后不要立即认为完成，应进入轮询或等待回调阶段。

---

## Skill 2：获取草稿详情

### Skill Name
`rjcut.get_draft`

### 作用
读取草稿任务详情，获取：

- 草稿状态
- editable_script
- corrections
- 草稿文件入口

### 对应 API
`GET /v1/drafts/{task_id}`

---

### 输入参数

```json
{
  "task_id": "task_xxx"
}
```

---

### 输出结果

```json
{
  "task_id": "task_xxx",
  "status": "succeeded",
  "progress": 100,
  "stage": "finished",
  "editable_script": {
    "segments": [
      {
        "id": 1,
        "text": "大家好，今天给大家介绍一款蓝牙耳机",
        "type": "human",
        "scene_file": null,
        "start": 0.0,
        "end": 4.2,
        "duration": 4.2
      }
    ]
  },
  "corrections": [],
  "files": {
    "cleaned_video": {
      "download_url": "/v1/tasks/task_xxx/files/cleaned_video"
    },
    "timeline_json": {
      "download_url": "/v1/tasks/task_xxx/files/timeline_json"
    },
    "transcription_json": {
      "download_url": "/v1/tasks/task_xxx/files/transcription_json"
    }
  }
}
```

---

### 常见状态

| status | 说明 |
|---|---|
| queued | 排队中 |
| processing | 处理中 |
| succeeded | 成功 |
| failed | 失败 |
| cancelled | 已取消 |
| timeout | 超时 |

---

### 编排建议

当 `status == succeeded` 时，进入下一步：
- 人工审核
- 外部 AI 纠错
- 直接发起合成

当 `status == failed/cancelled/timeout` 时，应终止流程并记录失败原因。

---

## Skill 3：更新草稿

### Skill Name
`rjcut.update_draft`

### 作用
对已完成的草稿进行更新。支持两类输入：

1. 直接写入完整 `editable_script`
2. 提交 `corrections` 批量替换文本

### 对应 API
`POST /v1/drafts/{task_id}/update`

---

### 输入模式 A：直接写入 editable_script

```json
{
  "task_id": "task_xxx",
  "editable_script": {
    "segments": [
      {
        "id": 1,
        "text": "大家好，今天给大家介绍一款蓝牙耳机",
        "type": "human",
        "scene_file": null
      }
    ]
  }
}
```

---

### 输入模式 B：应用 corrections

```json
{
  "task_id": "task_xxx",
  "corrections": [
    {
      "src": "蓝牙耳际",
      "dst": "蓝牙耳机",
      "reason": "typo"
    },
    {
      "src": "冲电",
      "dst": "充电",
      "reason": "typo"
    }
  ]
}
```

---

### 输出结果

```json
{
  "task_id": "task_xxx",
  "editable_script": {
    "segments": [
      {
        "id": 1,
        "text": "大家好，今天给大家介绍一款蓝牙耳机",
        "type": "human",
        "scene_file": null
      }
    ]
  },
  "corrections": [
    {
      "src": "蓝牙耳际",
      "dst": "蓝牙耳机",
      "reason": "typo"
    }
  ]
}
```

---

### 适配建议

#### 当外部系统直接输出最终文本
用 `editable_script`

#### 当外部系统输出“替换规则”
用 `corrections`

---

### 编排建议
此 Skill 可以执行多次，直到文案确认完成。

---

## Skill 4：从草稿发起合成

### Skill Name
`rjcut.compose_from_draft`

### 作用
基于草稿和修订后的文本，发起最终成片合成任务。

### 对应 API
`POST /v1/tasks/compose-from-draft`

---

### 输入参数

```json
{
  "draft_task_id": "task_xxx",
  "editable_script": null,
  "corrections": null,
  "use_transitions": false,
  "transition_type": "fade",
  "transition_duration": 0.8,
  "resync_subtitle": true,
  "asr_model": "large-v3",
  "asr_device": "cuda",
  "language": "zh",
  "subtitle_effect": "ad",
  "highlight_color": "gold",
  "font_url": null,
  "font_size": 88,
  "max_chars_per_line": 18,
  "position": "bottom",
  "margin_v": 50,
  "margin_l": 10,
  "margin_r": 10,
  "offset_x": 0,
  "offset_y": 0,
  "need_ass": true,
  "callback_url": null,
  "callback_secret": null,
  "client_ref_id": null,
  "timeout_seconds": 1800
}
```

---

### 输入字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| draft_task_id | string | 是 | 草稿任务 ID |
| editable_script | object/null | 否 | 本次合成时覆盖草稿脚本 |
| corrections | array/null | 否 | 本次合成时附加纠错 |
| use_transitions | boolean | 否 | 是否启用转场 |
| transition_type | string | 否 | 转场类型 |
| transition_duration | number | 否 | 转场时长 |
| resync_subtitle | boolean | 否 | 是否重新识别字幕 |
| asr_model | string | 否 | ASR 模型 |
| asr_device | string | 否 | 推理设备 |
| language | string | 否 | 语言代码 |
| subtitle_effect | string | 否 | 字幕效果 |
| highlight_color | string | 否 | 高亮颜色 |
| font_url | string/null | 否 | 自定义字体地址 |
| font_size | int | 否 | 字号 |
| max_chars_per_line | int | 否 | 每行最大字符数 |
| position | string | 否 | 字幕位置 |
| margin_v | int | 否 | 垂直边距 |
| margin_l | int | 否 | 左边距 |
| margin_r | int | 否 | 右边距 |
| offset_x | int | 否 | X 偏移 |
| offset_y | int | 否 | Y 偏移 |
| need_ass | boolean | 否 | 是否保留 ASS 文件 |
| callback_url | string/null | 否 | 回调地址 |
| callback_secret | string/null | 否 | 回调签名 |
| client_ref_id | string/null | 否 | 业务引用 ID |
| timeout_seconds | int | 否 | 超时时间 |

---

### 输出结果

```json
{
  "task_id": "task_compose_xxx",
  "task_type": "compose_from_draft",
  "status": "queued",
  "trace_id": "trace_compose_xxx",
  "draft_task_id": "task_xxx",
  "estimated_seconds": 180
}
```

---

### 参数优先级
合成时文本来源优先级如下：

1. 本次请求里的 `editable_script`
2. 本次请求里的 `corrections`
3. 草稿任务中的 `editable_script`
4. 草稿任务中的 `corrections`

---

### 编排建议
创建合成任务后，应进入：
- 轮询状态
- 或等待回调

---

## Skill 5：查询任务详情

### Skill Name
`rjcut.get_task`

### 作用
查询任意异步任务状态，包括：
- 草稿任务
- 合成任务
- 其他任务

### 对应 API
`GET /v1/tasks/{task_id}`

---

### 输入参数

```json
{
  "task_id": "task_xxx"
}
```

---

### 输出结果（通用）

```json
{
  "task_id": "task_xxx",
  "task_type": "compose_from_draft",
  "status": "succeeded",
  "progress": 100,
  "stage": "finished",
  "client_ref_id": "biz_001",
  "cost": 1,
  "trace_id": "trace_xxx",
  "result": {
    "files": {
      "final_video": {
        "download_url": "/v1/tasks/task_xxx/files/final_video"
      }
    }
  },
  "error": null,
  "started_at": "2025-04-03T10:00:00+00:00",
  "finished_at": "2025-04-03T10:05:00+00:00"
}
```

---

### 编排建议

#### 若状态为 succeeded
进入下载或回传业务系统阶段

#### 若状态为 failed
记录 `error`，进入人工排查或重试

#### 若状态为 queued/processing
继续等待

---

## Skill 6：获取任务文件下载地址

### Skill Name
`rjcut.get_task_file_url`

### 作用
获取某个任务产物文件的临时下载链接。

### 对应 API
`GET /v1/tasks/{task_id}/files/{file_key}`

---

### 输入参数

```json
{
  "task_id": "task_xxx",
  "file_key": "final_video"
}
```

---

### 可用 file_key

#### 草稿任务
- `cleaned_video`
- `timeline_json`
- `transcription_json`

#### 合成任务
- `final_video`
- `ass_file`
- `resync_json`

---

### 输出结果

```json
{
  "download_url": "http://localhost:9003/...",
  "expires_in": 3600
}
```

---

### 编排建议
拿到下载 URL 后，应尽快下载或转存，因为链接有过期时间。

---

# 六、可选 Skill

---

## Skill 7：规则型纠错（可选）

### Skill Name
`rjcut.apply_rule_correction`

### 作用
对草稿文本执行平台内置规则纠错。

> 说明：  
> 这是一个可选辅助 Skill，不是推荐主路径。  
> 推荐主路径仍然是外部系统输出 `corrections` 后调用 `rjcut.update_draft`。

### 对应 API
`POST /v1/drafts/{task_id}/ai-correct`

---

### 输入参数

```json
{
  "task_id": "task_xxx",
  "mode": "rewrite",
  "prompt": null,
  "scope": "all_segments"
}
```

---

### 输出结果

```json
{
  "task_id": "task_xxx",
  "editable_script": {
    "segments": []
  },
  "corrections": []
}
```

---

## Skill 8：等待任务完成（编排辅助）

### Skill Name
`rjcut.wait_task_until_done`

### 作用
这是一个编排器内部能力，不直接对应平台 API。  
其职责是循环调用 `rjcut.get_task`，直到任务进入终态。

---

### 输入参数

```json
{
  "task_id": "task_xxx",
  "poll_interval_seconds": 10,
  "timeout_seconds": 3600
}
```

---

### 终态定义

以下状态视为终态：

- `succeeded`
- `failed`
- `cancelled`
- `timeout`

---

### 推荐伪代码

```text
loop:
  task = get_task(task_id)
  if task.status in [succeeded, failed, cancelled, timeout]:
      return task
  sleep(poll_interval_seconds)
  if elapsed > timeout_seconds:
      raise workflow timeout
```

---

# 七、推荐工作流模板

---

## 模板 A：标准草稿-审核-合成流程

### 名称
`draft_review_compose_pipeline`

### 流程步骤

1. `rjcut.create_draft_task`
2. `rjcut.wait_task_until_done`
3. `rjcut.get_draft`
4. 人工审核或外部系统审核
5. `rjcut.update_draft`
6. `rjcut.compose_from_draft`
7. `rjcut.wait_task_until_done`
8. `rjcut.get_task_file_url(final_video)`

---

### 适用场景
- 人工审稿
- 运营审核
- 客户确认稿件后再合成

---

## 模板 B：外部 AI 协同纠错流程

### 名称
`draft_external_ai_correction_pipeline`

### 流程步骤

1. `rjcut.create_draft_task`
2. `rjcut.wait_task_until_done`
3. `rjcut.get_draft`
4. 将 `editable_script` 发送给外部 AI
5. 外部 AI 返回 `corrections`
6. `rjcut.update_draft`
7. `rjcut.compose_from_draft`
8. `rjcut.wait_task_until_done`
9. `rjcut.get_task_file_url(final_video)`

---

### 适用场景
- 大模型纠错
- 文本规范化
- 品牌词统一
- SKU 词汇修正

---

## 模板 C：快速直出流程

### 名称
`draft_compose_fast_pipeline`

### 流程步骤

1. `rjcut.create_draft_task`
2. `rjcut.wait_task_until_done`
3. 直接 `rjcut.compose_from_draft`
4. `rjcut.wait_task_until_done`
5. `rjcut.get_task_file_url(final_video)`

---

### 适用场景
- 不需要人工改稿
- 仅需要拆分任务颗粒度
- 后续保留审核扩展能力

---

# 八、Agent 使用约束

---

## 1. 不要把草稿文本改写理解为 TTS 重配音
该工作流当前只影响：
- 文本层
- 字幕层
- 场景绑定层

不会改变原始音频。

---

## 2. 当文本大幅偏离原音频时，应提示风险
建议 Agent 在以下情况给出风险提示：

- 修改比例过大
- 新文本长度与原文本差异明显
- 文案语义已改变

提示语示例：

> 当前修订仅影响字幕文本，不会修改原始音频内容。  
> 若文本与原视频口播差异过大，最终字幕与语音可能不完全一致。

---

## 3. corrections 应尽量使用结构化替换规则
推荐：

```json
[
  {"src": "蓝牙耳际", "dst": "蓝牙耳机"},
  {"src": "冲电", "dst": "充电"}
]
```

不推荐：
- 自由文本说明
- 非结构化纠错意见
- 模糊指令

---

## 4. 在工作流里保留人工确认点
以下节点建议提供人工确认：

- 草稿生成完成后
- 合成前
- 成片输出后

---

# 九、标准数据契约

---

## 1. EditableScript

```json
{
  "segments": [
    {
      "id": 1,
      "text": "大家好，今天给大家介绍一款蓝牙耳机",
      "type": "human",
      "scene_file": null,
      "start": 0.0,
      "end": 4.2,
      "duration": 4.2
    }
  ]
}
```

---

## 2. Corrections

```json
[
  {
    "src": "蓝牙耳际",
    "dst": "蓝牙耳机",
    "reason": "typo"
  },
  {
    "src": "冲电",
    "dst": "充电",
    "reason": "typo"
  }
]
```

---

## 3. Compose Result Files

```json
{
  "files": {
    "final_video": {
      "download_url": "/v1/tasks/task_xxx/files/final_video"
    },
    "ass_file": {
      "download_url": "/v1/tasks/task_xxx/files/ass_file"
    },
    "resync_json": {
      "download_url": "/v1/tasks/task_xxx/files/resync_json"
    }
  }
}
```

---

# 十、Skill 错误处理建议

---

## 草稿创建失败
- 参数错误：终止流程
- 并发超限：延迟重试
- 配额不足：告警并等待人工处理

## 草稿处理失败
- 保存错误详情
- 通知业务系统
- 允许人工重新提交

## 合成失败
- 获取 `error`
- 标记为“待人工排查”
- 可基于同一草稿重新发起合成

---

# 十一、回调驱动建议

如果编排系统支持 webhook 驱动，可以采用事件推进模式，而不是纯轮询。

---

## 成功事件

```json
{
  "event": "task.completed",
  "task_id": "task_xxx",
  "trace_id": "trace_xxx",
  "status": "succeeded",
  "result": {}
}
```

## 失败事件

```json
{
  "event": "task.failed",
  "task_id": "task_xxx",
  "trace_id": "trace_xxx",
  "status": "failed",
  "error": "具体错误"
}
```

---

## 推荐事件路由

### 草稿任务完成
触发：
- 获取草稿
- 进入审核节点
- 或触发外部 AI 纠错

### 合成任务完成
触发：
- 获取 final_video 下载地址
- 同步业务系统
- 入库媒资平台

---

# 十二、建议的 Skill 元信息

如果你的 Agent 平台支持注册工具元数据，建议使用如下抽象：

---

## Tool Group
`rjcut.video_workflow`

## Tools
- `create_draft_task`
- `get_draft`
- `update_draft`
- `compose_from_draft`
- `get_task`
- `get_task_file_url`

## Capability Tags
- `video-processing`
- `draft-workflow`
- `subtitle-correction`
- `async-task`
- `media-compose`

## Human-in-the-loop
`true`

## Supports External AI Collaboration
`true`

---

# 十三、给 Agent 的决策建议

当 Agent 调用本 Skill 时，可按以下策略行动：

---

## 如果用户说“先让我看识别结果再决定”
走：
- create_draft_task
- wait
- get_draft

---

## 如果用户说“我已经有错别字替换规则”
走：
- create_draft_task
- wait
- update_draft(corrections)
- compose_from_draft

---

## 如果用户说“我要手工改每一段文案”
走：
- create_draft_task
- wait
- get_draft
- 人工编辑 editable_script
- update_draft(editable_script)
- compose_from_draft

---

## 如果用户说“直接出片，不需要我参与”
走：
- create_draft_task
- wait
- compose_from_draft

---

# 十四、总结

RJCut Draft / Compose Workflow Skill 的核心价值在于：

- 把重型视频生成任务拆分成可控的工作节点
- 允许外部 AI 或人工介入“文本修订”
- 保留中间资产，便于审查、追踪、复用
- 适合企业内容生产流程、审核流程、自动化流程编排

其本质不是“AI 改稿聊天接口”，而是：

> 一个适合视频生产流水线的、支持人工与外部智能系统协同的异步工作流能力集。

---
