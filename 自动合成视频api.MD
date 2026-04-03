# RJCut 草稿模式 + 视频合成 API 文档

版本：v1.0.0  
适用范围：RJCut 商业 API / 多商户环境  
协议：HTTP JSON API  
鉴权方式：API Key（Bearer Token）

---

# 一、设计目标

为了解决原始 `/v1/tasks/agent-compose` 接口过重、工作颗粒度过粗的问题，RJCut 提供了新的两阶段工作流：

1. **草稿模式（Draft Mode）**
   - 对输入视频进行语音识别
   - 检测并切除“转场”等口播标记
   - 生成 `transcription.json`、`timeline.json`
   - 自动整理出可人工编辑的 `editable_script`
   - 客户可以在此阶段人工修订识别文本，或使用外部 AI 生成纠错结果

2. **视频合成模式（Compose Mode）**
   - 基于草稿任务产物和修订后的 `editable_script`
   - 进行场景替换、重新识别字幕、字幕烧录、最终视频合成
   - 输出最终成片及相关文件

> 注意：  
> 本文档中的“纠错”仅指**文本修正/字幕修正**，并不改变原始语音内容。  
> 如果修订文本与原视频音频差异过大，最终字幕可能与音频语义不完全一致。

---

# 二、鉴权方式

所有接口均需在 Header 中携带 API Key：

```http
Authorization: Bearer rjk_xxxxxxxxxxxxxxxxxx
```

示例：

```bash
-H "Authorization: Bearer $API_KEY"
```

---

# 三、统一返回格式

## 成功返回

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "trace_id": "trace_xxx"
}
```

## 失败返回

```json
{
  "code": 40400,
  "message": "draft task not found",
  "trace_id": "trace_xxx"
}
```

---

# 四、工作流总览

推荐标准工作流如下：

## Step 1：上传素材
使用预签名上传接口上传视频、脚本、纠错文件、背景素材等。

## Step 2：创建草稿任务
调用：

```http
POST /v1/tasks/agent-draft
```

得到 `draft_task_id`

## Step 3：查询草稿内容
调用：

```http
GET /v1/drafts/{task_id}
```

获取：
- `editable_script`
- `timeline_json`
- `transcription_json`
- `cleaned_video`

## Step 4：人工修订 / 应用纠错
调用：

```http
POST /v1/drafts/{task_id}/update
```

支持：
- 直接提交完整 `editable_script`
- 或提交 `corrections` 列表批量修正错别字

## Step 5：发起最终视频合成
调用：

```http
POST /v1/tasks/compose-from-draft
```

## Step 6：查询合成结果并下载视频
调用：

```http
GET /v1/tasks/{task_id}
GET /v1/tasks/{task_id}/files/final_video
```

---

# 五、基础上传接口

---

## 5.1 创建预签名上传地址

**POST** `/v1/uploads/presign`

### 请求体

```json
{
  "filename": "input.mp4",
  "content_type": "video/mp4",
  "purpose": "input"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| filename | string | 是 | 原始文件名 |
| content_type | string | 否 | 文件 MIME 类型 |
| purpose | string | 否 | 上传用途，默认 `input` |

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "upload_id": "up_xxx",
    "upload_url": "http://localhost:9003/...",
    "oss_key": "merchant_x/input/xxx.mp4",
    "method": "PUT",
    "expires_in": 3600
  },
  "trace_id": null
}
```

---

## 5.2 确认上传完成

**POST** `/v1/uploads/confirm`

### 请求体

```json
{
  "upload_id": "up_xxx"
}
```

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "upload_id": "up_xxx",
    "oss_key": "merchant_x/input/xxx.mp4",
    "size": 12345678,
    "confirmed": true
  },
  "trace_id": null
}
```

---

# 六、草稿模式 API

---

## 6.1 创建草稿任务

**POST** `/v1/tasks/agent-draft`

### 功能说明

创建一个“草稿任务”，用于：

- 下载输入视频
- 识别语音
- 检测并切掉“转场”等关键词片段
- 生成草稿阶段产物：
  - `cleaned_video`
  - `timeline_json`
  - `transcription_json`
  - `editable_script`

如果同时提供 `corrections_url`，系统会在草稿生成后自动应用纠错规则。

---

### 请求体

```json
{
  "input": {
    "video_url": "<oss_key_or_url>",
    "script_url": "<optional oss_key_or_url>",
    "scene_base_url": "<optional oss_key_or_url>",
    "corrections_url": "<optional oss_key_or_url>"
  },
  "pipeline": {
    "remove_keyword": "转场",
    "margin": 0.15,
    "min_segment_duration": 0.1
  },
  "asr": {
    "model": "large-v3",
    "device": "cuda",
    "language": "zh"
  },
  "draft": {
    "need_transcription": true,
    "need_timeline": true,
    "need_ai_correction": false,
    "ai_prompt": null
  },
  "callback": {
    "url": "https://your-server.com/webhook",
    "secret": "your_secret"
  },
  "client_ref_id": "biz_123",
  "timeout_seconds": 1800
}
```

---

### 字段说明

#### input

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| video_url | string | 是 | 输入视频 URL 或 OSS key |
| script_url | string | 否 | 预置脚本 JSON 地址 |
| scene_base_url | string | 否 | 场景素材目录 URL 或 OSS 前缀 |
| corrections_url | string | 否 | 纠错 JSON 地址 |

#### pipeline

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| remove_keyword | string | 否 | 要切除的关键词，默认 `转场` |
| margin | number | 否 | 关键词切除前后扩展秒数，默认 `0.15` |
| min_segment_duration | number | 否 | 保留片段的最短时长，默认 `0.1` |

#### asr

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| model | string | 否 | Whisper 模型名，如 `large-v3` |
| device | string | 否 | `cpu` / `cuda` |
| language | string | 否 | 语言代码，默认 `zh` |

#### draft

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| need_transcription | boolean | 否 | 是否保留转写结果，默认 `true` |
| need_timeline | boolean | 否 | 是否生成时间线，默认 `true` |
| need_ai_correction | boolean | 否 | 预留字段，默认 `false` |
| ai_prompt | string/null | 否 | 预留字段 |

#### callback

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| url | string | 否 | Webhook 地址 |
| secret | string | 否 | 回调签名密钥 |

---

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_a1b2c3d4",
    "task_type": "agent_draft",
    "status": "queued",
    "trace_id": "trace_1234567890abcdef",
    "estimated_seconds": 60
  },
  "trace_id": "trace_1234567890abcdef"
}
```

---

## 6.2 查询草稿详情

**GET** `/v1/drafts/{task_id}`

### 功能说明

获取草稿任务当前状态，以及草稿核心内容，包括：

- `editable_script`
- 已应用的 `corrections`
- 草稿文件下载入口

---

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_a1b2c3d4",
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
        },
        {
          "id": 2,
          "text": "它支持快速充电",
          "type": "human",
          "scene_file": null,
          "start": 4.2,
          "end": 7.1,
          "duration": 2.9
        }
      ]
    },
    "corrections": [
      {
        "src": "蓝牙耳际",
        "dst": "蓝牙耳机",
        "reason": "typo"
      }
    ],
    "files": {
      "cleaned_video": {
        "oss_key": "merchant_x/tasks/task_a1b2c3d4/cleaned_video.mp4",
        "filename": "input_cleaned.mp4",
        "exists": true,
        "size": 22334455,
        "mime_type": "video/mp4",
        "download_url": "/v1/tasks/task_a1b2c3d4/files/cleaned_video"
      },
      "timeline_json": {
        "oss_key": "merchant_x/tasks/task_a1b2c3d4/timeline_json.json",
        "filename": "input_timeline.json",
        "exists": true,
        "size": 4567,
        "mime_type": "application/json",
        "download_url": "/v1/tasks/task_a1b2c3d4/files/timeline_json"
      },
      "transcription_json": {
        "oss_key": "merchant_x/tasks/task_a1b2c3d4/transcription_json.json",
        "filename": "input_transcription.json",
        "exists": true,
        "size": 9876,
        "mime_type": "application/json",
        "download_url": "/v1/tasks/task_a1b2c3d4/files/transcription_json"
      }
    },
    "created_at": "2025-04-03T10:00:00+00:00",
    "updated_at": "2025-04-03T10:05:00+00:00"
  },
  "trace_id": "trace_1234567890abcdef"
}
```

---

### editable_script 结构说明

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

字段说明：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int | 段落 ID |
| text | string | 当前段落文本，可人工修改 |
| type | string | 段落类型，通常为 `human` 或 `scene` |
| scene_file | string/null | 若为场景段，表示关联场景文件名 |
| start | number | 原视频中的起始时间 |
| end | number | 原视频中的结束时间 |
| duration | number | 段落时长 |

---

## 6.3 更新草稿内容

**POST** `/v1/drafts/{task_id}/update`

### 功能说明

更新草稿任务中的 `editable_script`。支持两种用法：

### 用法 A：直接上传修改后的 `editable_script`
适合前端可视化编辑器或人工逐段修改文本后回写。

### 用法 B：上传 `corrections`
适合外部 AI 或人工工具先生成纠错对列表，再批量替换文本。

---

### 请求体方式 A：直接更新 editable_script

```json
{
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
      },
      {
        "id": 2,
        "text": "它支持快速充电",
        "type": "human",
        "scene_file": null,
        "start": 4.2,
        "end": 7.1,
        "duration": 2.9
      }
    ]
  }
}
```

---

### 请求体方式 B：应用 corrections

```json
{
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

### corrections 格式说明

推荐标准格式如下：

```json
[
  { "src": "蓝牙耳际", "dst": "蓝牙耳机" },
  { "src": "冲电", "dst": "充电" }
]
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| src | string | 是 | 原错误文本 |
| dst | string | 是 | 目标替换文本 |
| reason | string | 否 | 原因说明 |

---

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_a1b2c3d4",
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
    "corrections": [
      {
        "src": "蓝牙耳际",
        "dst": "蓝牙耳机",
        "reason": "typo"
      }
    ]
  },
  "trace_id": "trace_1234567890abcdef"
}
```

---

## 6.4 草稿自动文本修正（可选接口）

**POST** `/v1/drafts/{task_id}/ai-correct`

> 说明：  
> 此接口为平台内置规则型占位实现，仅适用于简单错别字替换。  
> 如果你已经有自己的大模型或人工系统，推荐直接使用 `/v1/drafts/{task_id}/update` 提交 `corrections`，而不是依赖此接口。

### 请求体

```json
{
  "mode": "rewrite",
  "prompt": null,
  "scope": "all_segments"
}
```

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_a1b2c3d4",
    "editable_script": {
      "segments": [
        {
          "id": 1,
          "text": "大家好，今天给大家介绍一款蓝牙耳机"
        }
      ]
    },
    "corrections": [
      {
        "src": "蓝牙耳际",
        "dst": "蓝牙耳机",
        "reason": "rule_based_ai_correction"
      }
    ]
  },
  "trace_id": "trace_1234567890abcdef"
}
```

---

# 七、视频合成模式 API

---

## 7.1 从草稿创建视频合成任务

**POST** `/v1/tasks/compose-from-draft`

### 功能说明

从一个已完成的草稿任务创建最终视频合成任务。  
系统会基于该草稿的：

- `timeline`
- `editable_script`
- `scene_assets`
- `corrections`

进行：

- 场景素材恢复
- 时间线渲染
- 字幕重新识别与烧录
- 输出最终视频

---

### 请求体

```json
{
  "draft_task_id": "task_a1b2c3d4",
  "editable_script": {
    "segments": [
      {
        "id": 1,
        "text": "大家好，今天给大家介绍一款蓝牙耳机",
        "type": "human"
      }
    ]
  },
  "corrections": [
    {
      "src": "冲电",
      "dst": "充电"
    }
  ],
  "pipeline": {
    "use_transitions": false,
    "transition_type": "fade",
    "transition_duration": 0.8,
    "resync_subtitle": true
  },
  "asr": {
    "model": "large-v3",
    "device": "cuda",
    "language": "zh"
  },
  "subtitle": {
    "effect": "ad",
    "highlight_color": "gold",
    "font_url": null,
    "font_size": 88,
    "max_chars_per_line": 18,
    "position": "bottom",
    "margin_v": 50,
    "margin_l": 10,
    "margin_r": 10,
    "offset_x": 0,
    "offset_y": 0
  },
  "output": {
    "need_cleaned_video": true,
    "need_timeline_json": true,
    "need_transcription_json": true,
    "need_ass": true
  },
  "callback": {
    "url": "https://your-server.com/webhook",
    "secret": "your_secret"
  },
  "client_ref_id": "biz_compose_001",
  "timeout_seconds": 1800
}
```

---

### 参数优先级说明

在最终合成时，文本内容按以下优先级决定：

1. 请求体中的 `editable_script`
2. 请求体中的 `corrections`（对当前 script 再做替换）
3. 草稿任务中已保存的 `editable_script`
4. 草稿任务中已保存的 `corrections`

如果你不传 `editable_script` 和 `corrections`，系统将直接使用草稿任务当前保存的内容。

---

### 字段说明

#### draft_task_id

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| draft_task_id | string | 是 | 已完成的草稿任务 ID |

#### subtitle

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| effect | string | 否 | 字幕效果，如 `ad` |
| highlight_color | string | 否 | 高亮颜色 |
| font_url | string/null | 否 | 自定义字体 URL 或 OSS key |
| font_size | int | 否 | 字号 |
| max_chars_per_line | int | 否 | 每行最大字符数 |
| position | string | 否 | `bottom` / `top` / `middle` |
| margin_v | int | 否 | 垂直边距 |
| margin_l | int | 否 | 左边距 |
| margin_r | int | 否 | 右边距 |
| offset_x | int | 否 | 水平偏移 |
| offset_y | int | 否 | 垂直偏移 |

#### pipeline

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| use_transitions | boolean | 否 | 是否启用转场 |
| transition_type | string | 否 | 转场类型 |
| transition_duration | number | 否 | 转场时长 |
| resync_subtitle | boolean | 否 | 是否重新识别字幕并烧录 |

#### output

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| need_cleaned_video | boolean | 否 | 预留字段 |
| need_timeline_json | boolean | 否 | 预留字段 |
| need_transcription_json | boolean | 否 | 预留字段 |
| need_ass | boolean | 否 | 是否保留 ASS 字幕文件 |

---

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_compose_001",
    "task_type": "compose_from_draft",
    "status": "queued",
    "trace_id": "trace_compose_xxx",
    "draft_task_id": "task_a1b2c3d4",
    "estimated_seconds": 180
  },
  "trace_id": "trace_compose_xxx"
}
```

---

# 八、通用任务查询接口

---

## 8.1 查询任务详情

**GET** `/v1/tasks/{task_id}`

适用于：
- 草稿任务
- 视频合成任务
- 其他异步任务

---

### 草稿任务成功返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_a1b2c3d4",
    "task_type": "agent_draft",
    "status": "succeeded",
    "progress": 100,
    "stage": "finished",
    "client_ref_id": "biz_123",
    "cost": 1,
    "trace_id": "trace_1234567890abcdef",
    "result": {
      "draft": {
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
        "timeline": {},
        "transcription": {},
        "corrections": [],
        "scene_assets": {}
      },
      "files": {
        "cleaned_video": {
          "download_url": "/v1/tasks/task_a1b2c3d4/files/cleaned_video"
        },
        "timeline_json": {
          "download_url": "/v1/tasks/task_a1b2c3d4/files/timeline_json"
        },
        "transcription_json": {
          "download_url": "/v1/tasks/task_a1b2c3d4/files/transcription_json"
        }
      }
    },
    "error": null,
    "started_at": "2025-04-03T10:00:00+00:00",
    "finished_at": "2025-04-03T10:05:00+00:00",
    "created_at": "2025-04-03T10:00:00+00:00",
    "updated_at": "2025-04-03T10:05:00+00:00"
  },
  "trace_id": null
}
```

---

### 合成任务成功返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_compose_001",
    "task_type": "compose_from_draft",
    "status": "succeeded",
    "progress": 100,
    "stage": "finished",
    "client_ref_id": "biz_compose_001",
    "cost": 1,
    "trace_id": "trace_compose_xxx",
    "result": {
      "files": {
        "final_video": {
          "oss_key": "merchant_x/tasks/task_compose_001/final_video.mp4",
          "filename": "final.mp4",
          "exists": true,
          "size": 33445566,
          "mime_type": "video/mp4",
          "download_url": "/v1/tasks/task_compose_001/files/final_video"
        },
        "ass_file": {
          "oss_key": "merchant_x/tasks/task_compose_001/ass_file.ass",
          "filename": "final.ass",
          "exists": true,
          "size": 12345,
          "mime_type": "text/plain",
          "download_url": "/v1/tasks/task_compose_001/files/ass_file"
        },
        "resync_json": {
          "oss_key": "merchant_x/tasks/task_compose_001/resync_json.json",
          "filename": "final_resync.json",
          "exists": true,
          "size": 56789,
          "mime_type": "application/json",
          "download_url": "/v1/tasks/task_compose_001/files/resync_json"
        }
      },
      "source_draft_task_id": "task_a1b2c3d4"
    },
    "error": null,
    "started_at": "2025-04-03T10:10:00+00:00",
    "finished_at": "2025-04-03T10:20:00+00:00",
    "created_at": "2025-04-03T10:10:00+00:00",
    "updated_at": "2025-04-03T10:20:00+00:00"
  },
  "trace_id": null
}
```

---

## 8.2 查询任务列表

**GET** `/v1/tasks?limit=20&offset=0&status=succeeded`

### 参数说明

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| status | string | 否 | 任务状态过滤 |
| limit | int | 否 | 默认 20，最大 100 |
| offset | int | 否 | 默认 0 |

---

## 8.3 取消任务

**POST** `/v1/tasks/{task_id}/cancel`

### 请求体

```json
{
  "reason": "no longer needed"
}
```

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_compose_001",
    "status": "cancelled"
  },
  "trace_id": null
}
```

---

# 九、文件下载接口

---

## 9.1 获取任务文件下载链接

**GET** `/v1/tasks/{task_id}/files/{file_key}`

### 功能说明

根据任务产物中的 `file_key` 获取一个临时有效的下载直链。

---

### 草稿任务可用 file_key

| file_key | 说明 |
|---|---|
| cleaned_video | 去掉“转场”等片段后的视频 |
| timeline_json | 草稿时间线 JSON |
| transcription_json | 语音识别 JSON |

### 合成任务可用 file_key

| file_key | 说明 |
|---|---|
| final_video | 最终成片视频 |
| ass_file | ASS 字幕文件 |
| resync_json | 重新识别后的字幕时间戳 JSON |

---

### 返回示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "download_url": "http://localhost:9003/....",
    "expires_in": 3600
  },
  "trace_id": null
}
```

---

# 十、典型接入示例

---

## 示例 1：标准草稿 → 人工改稿 → 合成

### 1）创建草稿任务

```bash
curl -s -X POST "$BASE_URL/v1/tasks/agent-draft" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "video_url": "<oss_key_or_url>",
      "script_url": "<oss_key_or_url>",
      "scene_base_url": "<oss_key_or_url>"
    },
    "pipeline": {
      "remove_keyword": "转场",
      "margin": 0.15,
      "min_segment_duration": 0.1
    },
    "asr": {
      "model": "large-v3",
      "device": "cuda",
      "language": "zh"
    },
    "timeout_seconds": 1800
  }' | jq .
```

### 2）查询草稿

```bash
curl -s "$BASE_URL/v1/drafts/<draft_task_id>" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

### 3）人工修改脚本后回写

```bash
curl -s -X POST "$BASE_URL/v1/drafts/<draft_task_id>/update" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "editable_script": {
      "segments": [
        {
          "id": 1,
          "text": "大家好，今天给大家介绍一款蓝牙耳机",
          "type": "human"
        },
        {
          "id": 2,
          "text": "它支持快速充电",
          "type": "human"
        }
      ]
    }
  }' | jq .
```

### 4）发起合成

```bash
curl -s -X POST "$BASE_URL/v1/tasks/compose-from-draft" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "draft_task_id": "<draft_task_id>",
    "pipeline": {
      "use_transitions": false,
      "transition_type": "fade",
      "transition_duration": 0.8,
      "resync_subtitle": true
    },
    "asr": {
      "model": "large-v3",
      "device": "cuda",
      "language": "zh"
    },
    "subtitle": {
      "effect": "ad",
      "font_size": 88
    },
    "output": {
      "need_ass": true
    },
    "timeout_seconds": 1800
  }' | jq .
```

### 5）获取成片下载链接

```bash
curl -s "$BASE_URL/v1/tasks/<compose_task_id>/files/final_video" \
  -H "Authorization: Bearer $API_KEY" | jq .
```

---

## 示例 2：外部 AI 生成 corrections 后再合成

### 1）创建草稿
同上

### 2）提交 corrections

```bash
curl -s -X POST "$BASE_URL/v1/drafts/<draft_task_id>/update" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "corrections": [
      {"src": "蓝牙耳际", "dst": "蓝牙耳机"},
      {"src": "冲电", "dst": "充电"}
    ]
  }' | jq .
```

### 3）发起合成
同上

---

## 示例 3：跳过 update，直接在合成时带入 corrections

```bash
curl -s -X POST "$BASE_URL/v1/tasks/compose-from-draft" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "draft_task_id": "<draft_task_id>",
    "corrections": [
      {"src": "蓝牙耳际", "dst": "蓝牙耳机"},
      {"src": "冲电", "dst": "充电"}
    ],
    "subtitle": {
      "effect": "ad",
      "font_size": 88
    }
  }' | jq .
```

---

# 十一、推荐前端交互方式

建议前端按以下模型接入：

## 草稿页
展示：
- 草稿任务状态
- `editable_script.segments`
- 原文 / 修正后文本
- 片段开始结束时间
- 段落类型（human / scene）
- 场景文件绑定信息

操作：
- 逐段编辑文本
- 批量导入 `corrections`
- 保存草稿
- 预览 cleaned video
- 提交合成任务

## 合成页
展示：
- 合成任务状态
- 最终视频下载按钮
- ASS 下载按钮
- resync JSON 下载按钮

---

# 十二、错误码说明

| code | HTTP 状态码 | 说明 |
|---|---:|---|
| 0 | 200 | 成功 |
| 40001 | 400 | 请求体编码错误，仅支持 UTF-8 |
| 40002 | 400 | JSON 格式错误 |
| 40003 | 400 | 参数校验失败 |
| 40201 | 402 | 配额不足 |
| 40400 | 404 | 任务或草稿不存在 |
| 40401 | 404 | 文件不存在 |
| 40402 | 404 | 文件未就绪 |
| 40900 | 409 | 当前状态不允许该操作 |
| 42901 | 429 | 并发任务数超限 |

---

# 十三、兼容说明

平台仍保留原有一键式接口：

```http
POST /v1/tasks/agent-compose
```

适用于不需要草稿编辑的快速直出场景。

但对于以下场景，推荐使用新工作流：

- 需要人工校正识别文本
- 需要外部 AI 生成错别字修正结果
- 需要前端逐段编辑口播文案
- 需要在最终合成前人工确认 timeline/script

---

# 十四、注意事项

1. `editable_script.text` 的修改只影响**字幕与文本层**，不会改变原视频音频内容
2. 如果文本改动过大，字幕与语音可能不完全一致
3. `scene_file` 应与上传的场景素材目录一致
4. 若草稿任务使用了场景素材，系统会自动保存并在合成时恢复
5. 建议将 `corrections.json` 保持为标准数组格式，避免多种结构混用

---

# 十五、附录：数据结构汇总

---

## 15.1 EditableScript

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

## 15.2 Corrections

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

## 15.3 回调示例：任务成功

```json
{
  "event": "task.completed",
  "task_id": "task_compose_001",
  "trace_id": "trace_compose_xxx",
  "status": "succeeded",
  "result": {
    "files": {
      "final_video": {
        "download_url": "/v1/tasks/task_compose_001/files/final_video"
      }
    }
  }
}
```

---

## 15.4 回调示例：任务失败

```json
{
  "event": "task.failed",
  "task_id": "task_compose_001",
  "trace_id": "trace_compose_xxx",
  "status": "failed",
  "error": "具体失败原因"
}
```

---

# 十六、建议接入策略

对于企业客户，推荐采用以下接入策略：

## 轻量接入
- 上传视频
- 创建草稿
- 导出 `editable_script`
- 人工修订后直接回写
- 发起合成

## AI 协同接入
- 上传视频
- 创建草稿
- 将 `editable_script` 发给外部 AI / 文案系统
- 外部系统只返回 `corrections.json`
- 调用 `/v1/drafts/{task_id}/update`
- 发起合成

## 平台化接入
- 前端做“草稿工作台”
- 后端只负责转发和状态轮询
- 用户在工作台中完成审核、修订、提交合成

---

如需扩展：
- 草稿版本管理
- 草稿多次编辑历史
- 段落级审核状态
- 局部重渲染
- 文本与时间戳强绑定回写

可在现有 Draft / Compose 两阶段结构上继续演进。
