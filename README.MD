下面是一份可直接对外的 **README / API 文档草案**，按最小商用版来写。你可复制到 `README_API.md`。

---

# RJCut Video API

数字人口播视频自动切“转场”与时间线合成接口。

## 能力
- 自动识别并切除口播关键词（默认“转场”）
- 基于 `script.json` 进行 human / scene 时间线合成
- 重新识别逐字时间戳并烧录字幕
- 支持广告风 / 高亮 / 卡拉OK / 打字机字幕特效
- 支持错别字校正表
- 支持任务查询、结果下载、Webhook 回调

---

## 基础信息

### Base URL
```text
http://your-domain.com:8080
```

### 鉴权
所有接口需携带 API Key：

```http
Authorization: Bearer YOUR_API_KEY
```

### 响应格式
成功：
```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "trace_id": "trace_xxx"
}
```

失败：
```json
{
  "code": 40001,
  "message": "invalid parameter",
  "trace_id": "trace_xxx"
}
```

---

## 任务状态说明

| 状态 | 说明 |
|---|---|
| queued | 已入队 |
| processing | 处理中 |
| succeeded | 成功 |
| failed | 失败 |

常见阶段 `stage`：
- `queued`
- `downloading_input`
- `downloading_script`
- `downloading_corrections`
- `downloading_font`
- `downloading_scenes`
- `cut_transition`
- `compose_timeline`
- `packaging_result`
- `finished`
- `failed`

---

# 1. 健康检查

## 请求
```http
GET /health
```

## 响应
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "ok"
  }
}
```

---

# 2. 创建一站式成片任务

## 请求
```http
POST /v1/tasks/agent-compose
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

## 请求体

```json
{
  "input": {
    "video_url": "https://cdn.example.com/input/avatar.mp4",
    "script_url": "https://cdn.example.com/input/script.json",
    "corrections_url": "https://cdn.example.com/input/corrections.json",
    "scene_base_url": "https://cdn.example.com/input/"
  },
  "pipeline": {
    "remove_keyword": "转场",
    "margin": 0.15,
    "min_segment_duration": 0.1,
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
    "url": "https://client.example.com/webhook/video-task",
    "secret": "demo_secret"
  },
  "client_ref_id": "order_001"
}
```

---

## 参数说明

### input
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| video_url | string | 是 | 输入视频 URL |
| script_url | string | 否 | 脚本 JSON URL |
| corrections_url | string | 否 | 错别字校正表 URL |
| scene_base_url | string | 否 | 场景素材根 URL，配合 `script.json` 中 `scene_file` 使用 |

### pipeline
| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| remove_keyword | string | 否 | 转场 | 要切除的关键词 |
| margin | number | 否 | 0.15 | 关键词切点前后额外切除时长（秒） |
| min_segment_duration | number | 否 | 0.1 | 最短保留片段时长 |
| use_transitions | bool | 否 | false | 合并片段时是否使用转场 |
| transition_type | string | 否 | fade | 转场类型 |
| transition_duration | number | 否 | 0.8 | 转场时长（秒） |
| resync_subtitle | bool | 否 | true | 合成后是否重新识别并烧录字幕 |

### asr
| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| model | string | 否 | large-v3 | Whisper 模型 |
| device | string | 否 | cpu | 推理设备：`cpu` / `cuda` |
| language | string | 否 | zh | 语言代码 |

### subtitle
| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| effect | string | 否 | ad | 字幕特效：`ad` / `karaoke` / `highlight` / `typewriter` / `bounce` |
| highlight_color | string | 否 | gold | 高亮颜色 |
| font_url | string | 否 | null | 自定义字体 URL |
| font_size | int | 否 | 88 | 字号 |
| max_chars_per_line | int | 否 | 18 | 每行最大字符数 |
| position | string | 否 | bottom | 字幕位置：`bottom` / `top` / `middle` |
| margin_v | int | 否 | 50 | 垂直边距 |
| margin_l | int | 否 | 10 | 左边距 |
| margin_r | int | 否 | 10 | 右边距 |
| offset_x | int | 否 | 0 | 水平偏移 |
| offset_y | int | 否 | 0 | 垂直偏移 |
| **position_x** | **int** | **否** | **null** | **🆕 精确 X 坐标（像素），优先级高于 position/offset_x** |
| **position_y** | **int** | **否** | **null** | **🆕 精确 Y 坐标（像素），优先级高于 margin_v/offset_y** |
| **use_relative_pos** | **bool** | **否** | **false** | **🆕 是否使用相对坐标 (0-1)，如 0.5 表示 50% 位置** |

### callback
| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| url | string | 否 | 任务完成/失败后的回调地址 |
| secret | string | 否 | 回调签名密钥 |

---

## 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_8d7d1b2c3a4e5f67",
    "type": "agent_compose",
    "status": "queued",
    "trace_id": "trace_c1d2e3f4a5b6c7d8",
    "estimated_seconds": 180
  },
  "trace_id": "trace_c1d2e3f4a5b6c7d8"
}
```

---

## curl 示例

```bash
curl -X POST "http://your-domain.com:8080/v1/tasks/agent-compose" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @job.json
```

---

# 3. 查询单个任务

## 请求
```http
GET /v1/tasks/{task_id}
Authorization: Bearer YOUR_API_KEY
```

## 响应示例（处理中）
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_8d7d1b2c3a4e5f67",
    "type": "agent_compose",
    "status": "processing",
    "progress": 60,
    "stage": "compose_timeline",
    "created_at": "2026-04-02T12:00:00+00:00",
    "updated_at": "2026-04-02T12:03:20+00:00",
    "result": null,
    "error": null
  }
}
```

## 响应示例（成功）
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_8d7d1b2c3a4e5f67",
    "type": "agent_compose",
    "status": "succeeded",
    "progress": 100,
    "stage": "finished",
    "created_at": "2026-04-02T12:00:00+00:00",
    "updated_at": "2026-04-02T12:05:10+00:00",
    "result": {
      "task_dir": "/root/workspaces/rjcut/service_data/task_8d7d1b2c3a4e5f67",
      "files": {
        "final_video": {
          "path": "/root/workspaces/rjcut/service_data/task_8d7d1b2c3a4e5f67/output/avatar_final.mp4",
          "exists": true,
          "size": 99887766,
          "mime_type": "video/mp4",
          "download_url": "/v1/tasks/task_8d7d1b2c3a4e5f67/files/final_video"
        },
        "timeline_json": {
          "path": "/root/workspaces/rjcut/service_data/task_8d7d1b2c3a4e5f67/output/avatar_timeline.json",
          "exists": true,
          "size": 4567,
          "mime_type": "application/json",
          "download_url": "/v1/tasks/task_8d7d1b2c3a4e5f67/files/timeline_json"
        }
      }
    },
    "error": null
  }
}
```

---

# 4. 查询任务列表

## 请求
```http
GET /v1/tasks?limit=20
Authorization: Bearer YOUR_API_KEY
```

## 响应
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "task_id": "task_aaa",
        "type": "agent_compose",
        "status": "succeeded",
        "progress": 100,
        "stage": "finished",
        "created_at": "2026-04-02T12:00:00+00:00",
        "updated_at": "2026-04-02T12:05:10+00:00",
        "error": null
      },
      {
        "task_id": "task_bbb",
        "type": "agent_compose",
        "status": "failed",
        "progress": 25,
        "stage": "failed",
        "created_at": "2026-04-02T11:30:00+00:00",
        "updated_at": "2026-04-02T11:31:05+00:00",
        "error": "scene file not found"
      }
    ],
    "count": 2
  }
}
```

---

# 5. 下载结果文件

## 请求
```http
GET /v1/tasks/{task_id}/files/{file_key}
Authorization: Bearer YOUR_API_KEY
```

## 支持的 file_key
- `input_video`
- `cleaned_video`
- `timeline_json`
- `transcription_json`
- `final_video`
- `resync_json`
- `ass_file`

## 示例

### 下载最终视频
```bash
curl -L \
  -H "Authorization: Bearer YOUR_API_KEY" \
  "http://your-domain.com:8080/v1/tasks/task_8d7d1b2c3a4e5f67/files/final_video" \
  -o final.mp4
```

### 下载时间线 JSON
```bash
curl -L \
  -H "Authorization: Bearer YOUR_API_KEY" \
  "http://your-domain.com:8080/v1/tasks/task_8d7d1b2c3a4e5f67/files/timeline_json" \
  -o timeline.json
```

---

# 6. Webhook 回调

若创建任务时传入：

```json
"callback": {
  "url": "https://client.example.com/webhook/video-task",
  "secret": "demo_secret"
}
```

则任务完成或失败后，服务会回调该 URL。

---

## 成功回调示例
```json
{
  "event": "task.completed",
  "task_id": "task_8d7d1b2c3a4e5f67",
  "trace_id": "trace_c1d2e3f4a5b6c7d8",
  "status": "succeeded",
  "result": {
    "task_dir": "/root/workspaces/rjcut/service_data/task_8d7d1b2c3a4e5f67",
    "files": {
      "final_video": {
        "path": "/root/workspaces/rjcut/service_data/task_8d7d1b2c3a4e5f67/output/avatar_final.mp4",
        "exists": true,
        "size": 99887766,
        "mime_type": "video/mp4",
        "download_url": "/v1/tasks/task_8d7d1b2c3a4e5f67/files/final_video"
      }
    }
  }
}
```

## 失败回调示例
```json
{
  "event": "task.failed",
  "task_id": "task_8d7d1b2c3a4e5f67",
  "trace_id": "trace_c1d2e3f4a5b6c7d8",
  "status": "failed",
  "error": "ffmpeg failed"
}
```

---

## 回调签名
如果设置了 `callback.secret`，服务会在请求头中附带：

```http
X-Signature: SHA256(payload_json + secret)
```

客户端可据此校验回调来源。

---

# 7. script.json 格式说明

用于 scene / human 时间线合成。

## 示例
```json
{
  "description": "鹿茸血产品介绍 - 数字人带货视频脚本",
  "ad_keywords": [
    "鹿茸血",
    "鹿血",
    "地板价"
  ],
  "segments": [
    {
      "text": "想买鹿茸血的家人们，这条视频你必须看完。",
      "flag": "human"
    },
    {
      "text": "鹿茸血是梅花鹿身上的一个器官。",
      "flag": "scene",
      "scene_file": "scenes/割二杠鹿茸.mp4"
    }
  ]
}
```

## 字段说明
| 字段 | 类型 | 说明 |
|---|---|---|
| text | string | 该段文案 |
| flag | string | `human` 或 `scene` |
| scene_file | string | 当 `flag=scene` 时使用的素材文件相对路径 |

`scene_file` 会基于 `scene_base_url` 下载。

---

# 8. corrections.json 格式说明

用于错别字校正。

## 示例
```json
{
  "corrections": {
    "雪": "血",
    "路茸": "鹿茸",
    "路场": "鹿场",
    "地板架": "地板价"
  }
}
```

---

# 9. 🆕 字幕精确坐标控制

为了更精细地控制字幕在视频中的位置，系统支持**像素级精确坐标**和**相对坐标**两种模式。

## 9.7 API 调用示例

### 示例 1：使用绝对像素坐标（1080x1920 竖屏视频）

```bash
curl -X POST "http://your-domain.com:8080/v1/tasks/agent-compose" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "video_url": "https://cdn.example.com/input/video.mp4",
      "script_url": "https://cdn.example.com/input/script.json"
    },
    "subtitle": {
      "effect": "ad",
      "font_size": 88,
      "position_x": 540,
      "position_y": 1500,
      "use_relative_pos": false
    }
  }'
```

### 示例 2：使用相对坐标（推荐，适配不同分辨率）

```bash
curl -X POST "http://your-domain.com:8080/v1/tasks/agent-compose" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "video_url": "https://cdn.example.com/input/video.mp4",
      "script_url": "https://cdn.example.com/input/script.json"
    },
    "subtitle": {
      "effect": "highlight",
      "font_size": 72,
      "position_x": 0.5,
      "position_y": 0.7,
      "use_relative_pos": true
    }
  }'
```

### 示例 3：Python SDK 调用

```python
import requests

BASE_URL = "http://your-domain.com:8080"
API_KEY = "YOUR_API_KEY"

# 提交任务
response = requests.post(
    f"{BASE_URL}/v1/tasks/agent-compose",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "input": {
            "video_url": "https://cdn.example.com/input/video.mp4",
            "script_url": "https://cdn.example.com/input/script.json"
        },
        "subtitle": {
            "effect": "karaoke",
            "font_size": 64,
            # 相对坐标：水平居中，垂直 75% 位置
            "position_x": 0.5,
            "position_y": 0.75,
            "use_relative_pos": True
        }
    }
)

task_id = response.json()["data"]["task_id"]
print(f"任务已提交：{task_id}")
```

### 示例 4：Shell 脚本环境变量配置

```bash
#!/bin/bash

# 字幕位置配置
export SUBTITLE_POSITION_X=0.5      # 水平居中
export SUBTITLE_POSITION_Y=0.75     # 垂直 75% 位置
export SUBTITLE_USE_RELATIVE_POS=true

# 运行草稿任务
./run_draft_full.sh ./input_video.mp4
```

## 9.1 为什么需要精确坐标？

传统的 `alignment` + `margin` 定位方式存在以下限制：
- ❌ 无法精确指定字幕的像素位置
- ❌ 不同分辨率下位置不一致
- ❌ 无法实现特殊的排版效果（如弧形、波浪等）

新的精确坐标控制支持：
- ✅ **像素级定位** - 直接指定 `(x, y)` 坐标
- ✅ **相对坐标** - 使用 0-1 的小数，自动适配不同分辨率
- ✅ **优先级覆盖** - 精确坐标优先级高于传统参数

## 9.2 坐标系统说明

```
(0,0) ┌─────────────────────┐ (1080, 0)
      │                     │
      │                     │
      │                     │
      │     视频画面         │
      │    (竖屏 1080x1920)   │
      │                     │
      │                     │
      │                     │
(0,1920) └─────────────────────┘ (1080, 1920)

示例（1080x1920 竖屏分辨率）：
  - 左上角：x=0, y=0
  - 右上角：x=1080, y=0
  - 左下角：x=0, y=1920
  - 右下角：x=1080, y=1920
  - 正中心：x=540, y=960
```

## 9.3 使用方式

### 方式 1：绝对像素坐标

直接指定字幕的像素坐标位置：

```json
{
  "subtitle": {
    "effect": "ad",
    "font_size": 88,
    
    // 精确坐标控制（1080x1920 竖屏分辨率下）
    "position_x": 540,   // 水平居中
    "position_y": 1500,  // 垂直 1500px 位置（偏下，适合字幕）
    "use_relative_pos": false
  }
}
```

### 方式 2：相对坐标（推荐）

使用 0-1 之间的小数，自动适配不同分辨率：

```json
{
  "subtitle": {
    "effect": "ad",
    "font_size": 88,
    
    // 相对坐标模式
    "position_x": 0.5,   // 水平 50% 位置（居中）
    "position_y": 0.75,  // 垂直 75% 位置
    "use_relative_pos": true
  }
}
```

### 方式 3：常见位置预设（竖屏 1080x1920）

| 位置描述 | position_x | position_y | 绝对坐标示例 | 说明 |
|---------|-----------|-----------|-------------|------|
| 顶部居中 | 0.5 | 0.1 | (540, 192) | 适合标题、品牌名 |
| 中央居中 | 0.5 | 0.5 | (540, 960) | 适合强调文字 |
| 底部居中 | 0.5 | 0.75 | (540, 1440) | 适合字幕（推荐） |
| 底部居中 | 0.5 | 0.8 | (540, 1536) | 适合字幕（偏下） |
| 左下角 | 0.1 | 0.75 | (108, 1440) | 适合标注 |
| 右下角 | 0.9 | 0.75 | (972, 1440) | 适合水印 |

## 9.4 Shell 脚本使用示例

在 `run_draft_full.sh` 中配置：

```bash
# 绝对像素坐标
export SUBTITLE_POSITION_X=960
export SUBTITLE_POSITION_Y=800
export SUBTITLE_USE_RELATIVE_POS=false

# 或相对坐标
export SUBTITLE_POSITION_X=0.5
export SUBTITLE_POSITION_Y=0.75
export SUBTITLE_USE_RELATIVE_POS=true

./run_draft_full.sh
```

## 9.5 参数优先级

当同时设置多种定位参数时，优先级如下：

```
精确坐标 (position_x/y) > 传统参数 (alignment/margin/offset)
```

即：
- 如果设置了 `position_x` 和 `position_y`，则忽略 `alignment`、`margin_v`、`offset_x`、`offset_y`
- 如果未设置精确坐标，则使用传统参数定位

## 9.6 注意事项

1. **坐标原点**：视频左上角为 `(0, 0)`
2. **分辨率适配**：建议使用相对坐标，可自动适配不同分辨率
3. **字幕边界**：确保坐标不会导致字幕超出画面
4. **多行字幕**：当前坐标指字幕区域的基准位置

---

# 10. OpenCut 接入建议

---

# 9. OpenCut 接入建议

OpenCut 或其他平台建议按以下流程接入：

1. 调用 `POST /v1/tasks/agent-compose` 提交任务
2. 轮询 `GET /v1/tasks/{task_id}` 查询状态  
   或接收 webhook 回调
3. 从 `result.files.*.download_url` 下载结果文件

推荐重点下载：
- `final_video`
- `timeline_json`
- `transcription_json`
- `ass_file`

---

# 11. 常见错误码

| code | 含义 |
|---:|---|
| 0 | 成功 |
| 40000 | 参数错误 |
| 40001 | 缺少必要参数 |
| 40002 | 参数格式错误 |
| 40100 | 未授权 |
| 40101 | API Key 无效 |
| 40400 | 任务不存在 |
| 40401 | 文件 key 不存在 |
| 40402 | 文件未生成或不可下载 |
| 50000 | 服务内部错误 |
| 50001 | ffmpeg 执行失败 |
| 50002 | Whisper 识别失败 |
| 50003 | 素材下载失败 |

> 当前最小版接口内部异常可能先以 `error` 字段透出，后续可逐步细化错误码。

---


# 13. 部署说明

## 安装依赖
```bash
pip install fastapi uvicorn requests python-multipart
```

## 启动服务
```bash
API_KEYS=test_key_123 uvicorn api_service:app --host 0.0.0.0 --port 8080
```

## 可选环境变量
| 变量名 | 说明 |
|---|---|
| API_KEYS | 可用 API Key，多个逗号分隔 |
| PUBLIC_BASE_URL | 对外服务地址，用于拼接完整下载 URL（建议后续启用） |

---

# 14. 完整调用示例

## 1）提交任务
```bash
curl -X POST "http://127.0.0.1:8080/v1/tasks/agent-compose" \
  -H "Authorization: Bearer test_key_123" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "video_url": "https://cdn.example.com/input/avatar.mp4",
      "script_url": "https://cdn.example.com/input/script.json",
      "corrections_url": "https://cdn.example.com/input/corrections.json",
      "scene_base_url": "https://cdn.example.com/input/"
    },
    "pipeline": {
      "remove_keyword": "转场",
      "margin": 0.15,
      "min_segment_duration": 0.1,
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
      "font_size": 88,
      "max_chars_per_line": 18,
      "position": "bottom",
      "margin_v": 50,
      "margin_l": 10,
      "margin_r": 10,
      "offset_x": 0,
      "offset_y": 0
    }
  }'
```

## 2）查询状态
```bash
curl -H "Authorization: Bearer test_key_123" \
  "http://127.0.0.1:8080/v1/tasks/task_xxx"
```

## 3）下载最终视频
```bash
curl -L \
  -H "Authorization: Bearer test_key_123" \
  "http://127.0.0.1:8080/v1/tasks/task_xxx/files/final_video" \
  -o final.mp4
```

