# RJCut 数字人 API 文档

## 概述

本文档介绍 RJCut 平台提供的数字人视频合成 API。本 API 基于蝉镜开放平台构建，但提供了独立的商户管理、配额控制、任务调度等功能。

**API 基础信息：**
- **Base URL**: `http://your-server:8000`
- **认证方式**: API Key (通过 `X-API-Key` 请求头传递)
- **数据隔离**: 每个商户的数字人资源独立管理，互不可见

**主要功能：**
- 🎭 公共/自定义数字人管理
- 🎬 异步视频合成任务
- 🎤 声音模型选择
- 📊 任务状态查询与回调
- 💰 配额与并发控制

---

## 目录

1. [认证](#认证)
2. [数字人资源](#数字人资源)
3. [声音资源](#声音资源)
4. [视频生成任务](#视频生成任务)
5. [自定义数字人训练](#自定义数字人训练)
6. [删除操作](#删除操作)
7. [任务查询](#任务查询)
8. [错误码说明](#错误码说明)
9. [使用示例](#使用示例)

---

## 认证

所有 API 调用都需要在请求头中携带商户的 API Key。

**请求头格式**:
```
X-API-Key: your_api_key_here
```

**获取 API Key**: 联系管理员创建商户账户并获取 API Key。

---

## 数字人资源

### 获取公共数字人列表

获取平台提供的公共数字人模型列表（所有商户共享）。

**接口**: `GET /v1/dh/persons/common`

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "dp_001",
      "name": "知性女主播",
      "gender": "female",
      "audio_lang": "cn",
      "audio_man_id": "audio_001",
      "audio_name": "知性女声",
      "audio_preview": "https://...",
      "figures": [
        {
          "type": "whole_body",
          "width": 1080,
          "height": 1920,
          "preview_video_url": "https://...",
          "bg_replace": true
        }
      ]
    }
  ]
}
```

---

### 获取自定义数字人列表

获取当前商户自己训练的私有数字人列表（数据隔离，其他商户不可见）。

**接口**: `GET /v1/dh/persons/custom`

**响应参数说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 数字人 ID（用于创建视频任务） |
| name | string | 数字人名称 |
| status | integer | 训练状态 |
| cover_url | string | 数字人封面图 URL |
| created_at | string | 创建时间（ISO 8601 格式） |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "person_abc123",
      "name": "我的数字人",
      "status": 30,
      "cover_url": "https://...",
      "created_at": "2026-04-15T10:30:00Z"
    },
    {
      "id": "person_def456",
      "name": "客服数字人",
      "status": 10,
      "cover_url": "https://...",
      "created_at": "2026-04-14T15:20:00Z"
    }
  ]
}
```

**状态码说明**:
| 状态码 | 说明 |
|--------|------|
| 10 | 训练中 |
| 30 | 成功 |
| 40 | 失败 |

**注意事项**:
- 列表接口从本地数据库读取，返回基本信息
- 如需获取详细信息（如声音 ID、示例视频等），请使用详情接口
- 建议定期调用同步接口保持本地数据最新

---

### 获取自定义数字人详情

从蝉镜 API 拉取单个自定义数字人的详细信息，并同步到本地数据库。

**接口**: `GET /v1/dh/persons/custom/{person_id}`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| person_id | string | 数字人 ID |

**响应参数说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 数字人 ID |
| name | string | 数字人名称 |
| status | integer | 状态码（0=定制中，1=已完成，40=失败） |
| status_text | string | 状态文本描述 |
| progress | integer | 训练进度百分比（0-100） |
| cover_url | string | 数字人封面图 URL |
| video_url | string | 训练完成的示例视频 URL（训练完成后可用） |
| audio_man_id | string | 关联的声音模型 ID（如果训练了声音） |
| created_at | string | 本地创建时间（ISO 8601 格式） |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "id": "person_abc123",
    "name": "我的数字人",
    "status": 1,
    "status_text": "已完成",
    "progress": 100,
    "cover_url": "https://...",
    "video_url": "https://...",
    "audio_man_id": "audio_custom_001",
    "created_at": "2026-04-15T10:30:00Z"
  }
}
```

**使用场景**:
- 查看数字人训练进度
- 获取关联的声音模型 ID（用于视频生成时指定 `audio_man_id`）
- 查看训练完成的示例视频

**注意事项**:
- 此接口会实时调用蝉镜 API 获取最新状态
- 每次调用都会同步更新本地数据库记录
- 训练中的数字人 `video_url` 可能为空

---

### 同步自定义数字人

从蝉镜平台同步所有自定义数字人信息到本地数据库。

**接口**: `POST /v1/dh/persons/custom/sync`

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "synced_count": 5,
    "total": 5
  }
}
```

---

### 删除自定义数字人

删除当前商户的自定义数字人（同时删除蝉镜平台和本地记录）。

**接口**: `POST /v1/dh/persons/custom/{person_id}/delete`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| person_id | string | 数字人 ID |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "person_id": "person_abc123"
  }
}
```

**注意事项**:
- 删除后无法恢复，请谨慎操作
- 如果该数字人正在被使用，建议先停止相关任务
- 删除操作会同时删除蝉镜平台和本地数据库的记录

---

## 声音资源

### 获取声音列表

获取公共声音模型列表。

**接口**: `GET /v1/dh/voices`

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "audio_001",
      "name": "知性女声",
      "gender": "female",
      "lang": "cn",
      "audition": "https://...",
      "desc": "温柔知性的女声",
      "speed": 1.0,
      "pitch": 1.0
    }
  ]
}
```

---

### 删除定制声音

删除定制声音（调用蝉镜 API）。

**接口**: `POST /v1/dh/voices/{audio_id}/delete`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| audio_id | string | 声音 ID |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "audio_id": "audio_custom_001"
  }
}
```

---

## 视频生成任务

### 创建视频生成任务

创建异步视频合成任务。

**接口**: `POST /v1/dh/tasks/generate`

**请求参数**:
```json
{
  "text": "你好，欢迎观看我的视频。",
  "person_id": "person_abc123",
  "audio_man_id": "audio_001",
  "figure_type": "sit_body",
  "drive_mode": "random",
  "bg_type": "color",
  "bg_color": "#EDEDED",
  "bg_file_oss_key": null,
  "client_ref_id": "client_ref_001",
  "timeout_seconds": 3600,
  "hide_subtitle": true
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| text | string | 是 | - | 要合成的文本内容 |
| person_id | string | 否 | null | 数字人 ID（公共或自定义） |
| audio_man_id | string | 否 | null | 声音 ID。**重要**：当不传此参数时，系统会自动从数字人详情中获取其原生的 `audio_man_id`；如果数字人没有关联声音 ID，则使用默认音色 |
| figure_type | string | 否 | sit_body | 形象类型：`sit_body`（坐姿）、`whole_body`（全身）等 |
| drive_mode | string | 否 | random | 驱动模式：`normal`（顺序）、`random`（随机） |
| bg_type | string | 否 | color | 背景类型：`color`（纯色）、`image`（图片） |
| bg_color | string | 否 | #EDEDED | 纯色背景颜色（HEX 格式） |
| bg_file_oss_key | string | 否 | null | 背景图片的 OSS 路径（当 bg_type=image 时） |
| client_ref_id | string | 否 | null | 客户端自定义参考 ID |
| timeout_seconds | integer | 否 | 3600 | 任务超时时间（秒） |
| hide_subtitle | boolean | 否 | true | 是否隐藏字幕 |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_abc123",
    "status": "queued"
  }
}
```

---

## 自定义数字人训练

### 创建自定义数字人训练任务

上传素材视频并训练自定义数字人。

**接口**: `POST /v1/dh/tasks/create-person`

**请求参数**:
```json
{
  "name": "我的数字人",
  "source_video_oss_key": "merchant_001/videos/source.mp4",
  "train_type": "both",
  "language": "cn",
  "error_skip": false,
  "resolution_rate": 0,
  "client_ref_id": "client_ref_002"
}
```

**参数说明**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | 是 | - | 数字人名称 |
| source_video_oss_key | string | 是 | - | 素材视频的 OSS 路径 |
| train_type | string | 否 | both | 训练类型：`both`（声音 + 形象）、`voice`（仅声音）、`image`（仅形象） |
| language | string | 否 | cn | 语言：`cn`（中文）、`en`（英文） |
| error_skip | boolean | 否 | false | 是否跳过声音克隆失败 |
| resolution_rate | integer | 否 | 0 | 分辨率：0=1080p，1=4k |
| client_ref_id | string | 否 | null | 客户端自定义参考 ID |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dhc_abc123",
    "status": "queued"
  }
}
```

---

## 删除操作

### 删除视频任务

删除已创建的数字人视频任务，同时退还配额。

**接口**: `POST /v1/dh/tasks/{task_id}/delete`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| task_id | string | 视频任务 ID |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_abc123"
  }
}
```

**注意事项**:
- 仅支持删除 `dh_generate` 类型的任务
- 删除后会退还已扣除的配额
- 本地任务状态会更新为 `cancelled`，stage 为 `deleted`

---

### 删除自定义数字人

删除当前商户的自定义数字人（同时删除蝉镜平台和本地记录）。

**接口**: `POST /v1/dh/persons/custom/{person_id}/delete`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| person_id | string | 数字人 ID |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "person_id": "person_abc123"
  }
}
```

**注意事项**:
- 删除后无法恢复，请谨慎操作
- 如果该数字人正在被使用，建议先停止相关任务
- 删除操作会同时删除蝉镜平台和本地数据库的记录

---

### 删除定制声音

删除定制声音（调用蝉镜 API）。

**接口**: `POST /v1/dh/voices/{audio_id}/delete`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| audio_id | string | 声音 ID |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "audio_id": "audio_custom_001"
  }
}
```

---

### 删除文件

删除已上传的文件（调用蝉镜 API）。

**接口**: `POST /v1/dh/files/{file_id}/delete`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| file_id | string | 文件 ID（蝉镜平台的文件 ID） |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "file_id": "file_abc123"
  }
}
```

**注意事项**:
- 此接口删除的是蝉镜平台的文件，不是本地 OSS 存储
- 本地 OSS 文件请使用 `/v1/uploads/` 相关接口管理

---

## 任务查询

### 查询任务状态

查询任意任务的当前状态和结果。

**接口**: `GET /v1/tasks/{task_id}`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| task_id | string | 任务 ID |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_abc123",
    "task_type": "dh_generate",
    "status": "succeeded",
    "progress": 100,
    "stage": "finished",
    "client_ref_id": "client_ref_001",
    "cost": 1,
    "trace_id": "trace_abc123",
    "result": {
      "files": {
        "final_video": {
          "oss_key": "merchant_001/results/final.mp4",
          "filename": "final.mp4",
          "size_bytes": 12345678
        }
      }
    },
    "error": null,
    "created_at": "2026-04-15T10:30:00Z",
    "finished_at": "2026-04-15T10:35:00Z"
  }
}
```

**任务状态说明**:
| 状态 | 说明 |
|------|------|
| queued | 等待中 |
| processing | 处理中 |
| succeeded | 成功 |
| failed | 失败 |
| cancelled | 已取消 |
| timeout | 超时 |

---

### 查询任务列表

查询当前商户的任务列表。

**接口**: `GET /v1/tasks`

**查询参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| status | string | 否 | null | 按状态筛选 |
| limit | integer | 否 | 20 | 每页数量 (1-100) |
| offset | integer | 否 | 0 | 偏移量 |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [
      {
        "task_id": "task_dh_abc123",
        "task_type": "dh_generate",
        "status": "succeeded",
        "progress": 100,
        "stage": "finished",
        "client_ref_id": "client_ref_001",
        "cost": 1,
        "created_at": "2026-04-15T10:30:00Z",
        "error": null
      }
    ],
    "count": 1,
    "total": 50
  }
}
```

---

### 取消任务

取消正在执行的任务。

**接口**: `POST /v1/tasks/{task_id}/cancel`

**请求参数**:
```json
{
  "reason": "用户主动取消"
}
```

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_abc123",
    "status": "cancelled"
  }
}
```

---

### 获取任务文件下载 URL

获取任务结果文件的预签名下载 URL。

**接口**: `GET /v1/tasks/{task_id}/files/{file_key}`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| task_id | string | 任务 ID |
| file_key | string | 文件键（如 `final_video`） |

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "download_url": "https://oss.example.com/download?signature=xxx",
    "expires_in": 3600
  }
}
```

---

## 错误码说明

### 通用错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 40001 | 请求体编码错误 |
| 40002 | 无效的 JSON 格式 |
| 40003 | 参数校验失败 |
| 40004 | 任务类型不匹配 |
| 40201 | 配额不足 |
| 40300 | 权限不足 |
| 40400 | 资源不存在 |
| 40900 | 资源冲突 |
| 41300 | 文件过大 |
| 42901 | 并发任务数超限 |

### 蝉镜 API 错误码（透传）

| 错误码 | 说明 |
|--------|------|
| 10400 | AccessToken 验证失败 |
| 40000 | 参数错误 |
| 50000 | 系统内部错误 |
| 51000 | 系统错误 |

---

## 使用示例

### Python 示例：创建视频生成任务

```python
import requests

API_BASE = "http://your-server:8000"
API_KEY = "your_api_key"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 创建视频生成任务
response = requests.post(
    f"{API_BASE}/v1/dh/tasks/generate",
    headers=headers,
    json={
        "text": "你好，欢迎观看我的视频。",
        "person_id": "person_abc123",
        "audio_man_id": "audio_001",
        "figure_type": "sit_body",
        "drive_mode": "random",
        "bg_type": "color",
        "bg_color": "#EDEDED",
        "hide_subtitle": True
    }
)

result = response.json()
task_id = result['data']['task_id']
print(f"任务已创建：{task_id}")

# 轮询任务状态
import time
for i in range(180):  # 最多等待 30 分钟
    status_resp = requests.get(
        f"{API_BASE}/v1/tasks/{task_id}",
        headers=headers
    )
    task_data = status_resp.json()['data']
    status = task_data['status']
    progress = task_data['progress']
    
    print(f"进度：{progress}%, 状态：{status}")
    
    if status == 'succeeded':
        # 获取下载 URL
        file_key = 'final_video'
        download_resp = requests.get(
            f"{API_BASE}/v1/tasks/{task_id}/files/{file_key}",
            headers=headers
        )
        download_url = download_resp.json()['data']['download_url']
        print(f"视频完成，下载 URL: {download_url}")
        break
    elif status == 'failed':
        print(f"任务失败：{task_data.get('error')}")
        break
    
    time.sleep(10)
```

---

### Python 示例：训练自定义数字人

```python
import requests

API_BASE = "http://your-server:8000"
API_KEY = "your_api_key"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 1. 上传素材视频（先获取预签名 URL）
upload_response = requests.post(
    f"{API_BASE}/v1/uploads/presign",
    headers=headers,
    json={
        "filename": "source_video.mp4",
        "purpose": "digital_person",
        "content_type": "video/mp4"
    }
)

upload_data = upload_response.json()['data']
upload_url = upload_data['upload_url']
oss_key = upload_data['oss_key']

# 2. 使用 PUT 上传文件
with open('source_video.mp4', 'rb') as f:
    requests.put(upload_url, data=f, headers={'Content-Type': 'video/mp4'})

# 3. 确认上传
confirm_response = requests.post(
    f"{API_BASE}/v1/uploads/confirm",
    headers=headers,
    json={"upload_id": upload_data['upload_id']}
)

# 4. 创建训练任务
train_response = requests.post(
    f"{API_BASE}/v1/dh/tasks/create-person",
    headers=headers,
    json={
        "name": "我的数字人",
        "source_video_oss_key": oss_key,
        "train_type": "both",
        "language": "cn"
    }
)

task_id = train_response.json()['data']['task_id']
print(f"训练任务已创建：{task_id}")

# 5. 轮询等待训练完成
import time
for i in range(480):  # 最多等待 4 小时
    status_resp = requests.get(
        f"{API_BASE}/v1/tasks/{task_id}",
        headers=headers
    )
    task_data = status_resp.json()['data']
    status = task_data['status']
    
    if status == 'succeeded':
        person_id = task_data['result']['person_id']
        print(f"数字人训练完成！ID: {person_id}")
        break
    elif status == 'failed':
        print(f"训练失败：{task_data.get('error')}")
        break
    
    time.sleep(30)
```

---

### Python 示例：使用自定义背景图片

```python
import requests

API_BASE = "http://your-server:8000"
API_KEY = "your_api_key"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 上传背景图片
bg_upload = requests.post(
    f"{API_BASE}/v1/uploads/presign",
    headers=headers,
    json={
        "filename": "background.jpg",
        "purpose": "background",
        "content_type": "image/jpeg"
    }
)
bg_oss_key = bg_upload.json()['data']['oss_key']

# 上传背景图片文件...
# (省略上传步骤，参考上一个示例)

# 2. 使用音频文件（非 TTS）创建视频
video_response = api.create_video(
    digital_person_id="person_abc123",
    text=[],  # 使用音频时不需要文本
    audio_man_id="",  # 使用音频文件时不需要声音 ID
    audio={
        "type": "audio",
        "wav_url": "https://oss-url-to-audio.wav",  # 或使用 file_id
        "file_id": audio_file_id
    },
    person_x=0,
    person_y=0,
    person_width=1080,
    person_height=1920
)
```

---

### Python 示例：使用数字人原生声音

当使用自定义数字人时，可以不指定 `audio_man_id`，系统会自动从蝉镜 API 获取该数字人的原生声音 ID。

**工作流程**：
1. 如果请求中提供了 `audio_man_id`，直接使用
2. 如果未提供 `audio_man_id` 但提供了 `person_id`：
   - 系统会调用蝉镜 API 获取数字人详情
   - 提取数字人的 `audio_man_id` 字段
   - 如果数字人有关联声音，使用该声音
   - 如果数字人没有关联声音，使用默认音色（ID: "0"）

```python
# 方式 1：不指定 audio_man_id，自动使用数字人原生声音
response = requests.post(
    f"{API_BASE}/v1/dh/tasks/generate",
    headers=headers,
    json={
        "text": "你好，这是使用原生声音的视频。",
        "person_id": "person_custom_123",
        # 不指定 audio_man_id，系统会自动获取
        "hide_subtitle": True
    }
)

# 方式 2：手动指定 audio_man_id（可选公共音色或定制音色）
response = requests.post(
    f"{API_BASE}/v1/dh/tasks/generate",
    headers=headers,
    json={
        "text": "你好，这是使用指定音色的视频。",
        "person_id": "person_custom_123",
        "audio_man_id": "audio_001",  # 明确指定声音 ID
        "hide_subtitle": True
    }
)
```

**注意事项**：
- 定制数字人训练完成后，蝉镜 API 会返回 `audio_man_id`（如果选择了训练声音）
- 可以通过 `GET /v1/dh/persons/custom/{person_id}` 接口查看数字人的 `audio_man_id`
- 如果数字人没有关联声音（例如只训练了形象），系统会使用默认音色

---

### Python 示例：删除视频任务

```python
import requests

API_BASE = "http://your-server:8000"
API_KEY = "your_api_key"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 删除视频任务
task_id = "task_dh_abc123"
response = requests.post(
    f"{API_BASE}/v1/dh/tasks/{task_id}/delete",
    headers=headers
)

result = response.json()
if result['code'] == 0:
    print(f"视频任务已删除：{task_id}")
else:
    print(f"删除失败：{result['message']}")
```

---

### Python 示例：删除自定义数字人

```python
import requests

API_BASE = "http://your-server:8000"
API_KEY = "your_api_key"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 删除自定义数字人
person_id = "person_abc123"
response = requests.post(
    f"{API_BASE}/v1/dh/persons/custom/{person_id}/delete",
    headers=headers
)

result = response.json()
if result['code'] == 0:
    print(f"数字人已删除：{person_id}")
else:
    print(f"删除失败：{result['message']}")
```

---

### Python 示例：删除定制声音

```python
import requests

API_BASE = "http://your-server:8000"
API_KEY = "your_api_key"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# 删除定制声音
audio_id = "audio_custom_001"
response = requests.post(
    f"{API_BASE}/v1/dh/voices/{audio_id}/delete",
    headers=headers
)

result = response.json()
if result['code'] == 0:
    print(f"声音已删除：{audio_id}")
else:
    print(f"删除失败：{result['message']}")
```

---

### Python 示例：完整的删除流程（清理资源）

```python
import requests

API_BASE = "http://your-server:8000"
API_KEY = "your_api_key"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

def cleanup_digital_person_resources(person_id, task_ids=None):
    """清理数字人相关的所有资源"""
    
    # 1. 先删除相关的视频任务
    if task_ids:
        for task_id in task_ids:
            response = requests.post(
                f"{API_BASE}/v1/dh/tasks/{task_id}/delete",
                headers=headers
            )
            if response.json()['code'] == 0:
                print(f"✓ 视频任务已删除：{task_id}")
            else:
                print(f"✗ 删除视频任务失败 {task_id}: {response.json()['message']}")
    
    # 2. 删除数字人
    response = requests.post(
        f"{API_BASE}/v1/dh/persons/custom/{person_id}/delete",
        headers=headers
    )
    if response.json()['code'] == 0:
        print(f"✓ 数字人已删除：{person_id}")
    else:
        print(f"✗ 删除数字人失败：{response.json()['message']}")

# 使用示例
cleanup_digital_person_resources(
    person_id="person_abc123",
    task_ids=["task_dh_001", "task_dh_002"]
)
```

---

## 配额与并发控制

### 配额说明

- 每个商户有固定的配额（`quota_total`）
- 创建任务时会预扣配额
- 任务完成后确认扣费
- 任务取消或失败时退还配额

### 并发限制

- 每个商户有最大并发任务数限制（`max_concurrent_tasks`）
- 超出限制时返回错误码 `42901`

### 查询商户信息

**接口**: `GET /v1/merchant/info`

**响应示例**:
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "merchant_id": "merchant_001",
    "name": "测试商户",
    "quota_total": 1000,
    "quota_used": 100,
    "quota_reserved": 50,
    "quota_available": 850,
    "cost_per_task": 1,
    "max_concurrent_tasks": 10
  }
}
```

---

## 回调通知

创建任务时可以配置回调 URL，任务完成或失败时会自动通知。

**配置方式**: 在任务请求中添加 `callback` 字段：

```json
{
  "text": "你好",
  "person_id": "person_abc123",
  "callback": {
    "url": "https://your-server.com/callback",
    "secret": "your_secret"
  }
}
```

**回调 payload**:
```json
{
  "event": "task.completed",
  "task_id": "task_dh_abc123",
  "trace_id": "trace_abc123",
  "status": "succeeded",
  "result": {
    "files": {
      "final_video": {
        "oss_key": "merchant_001/results/final.mp4",
        "filename": "final.mp4"
      }
    }
  }
}
```

**签名验证**: 如果配置了 `secret`，回调请求会携带 `X-Signature` 头，值为 `SHA256(JSON payload + secret)`。

---

## 最佳实践

1. **异步处理**: 所有视频生成和数字人训练都是异步任务，创建后立即返回任务 ID，需要轮询或等待回调
2. **轮询间隔**: 视频生成建议 10 秒轮询一次，数字人训练建议 30 秒轮询一次
3. **超时处理**: 视频生成默认超时 1 小时，数字人训练默认超时 4 小时
4. **错误重试**: 对于网络错误，建议实现重试机制
5. **文件管理**: 使用预签名 URL 上传文件，支持断点续传

---

## 相关文档

- [api_digital_human.py](./api_digital_human.py) - 数字人 API 路由实现
- [chanjing_video.py](./tasks/chanjing_video.py) - 任务处理器实现
- [chanjing_api.py](./chanjing_api.py) - 蝉镜 API 客户端
- [schemas.py](./schemas.py) - 请求/响应模型定义

---

**文档版本**: 2.2  
**更新日期**: 2026-04-15  
**适用系统**: RJCut Commercial API

**更新日志**:
- v2.2: 修复 `audio_man_id` 缺失问题 - 当不传 `audio_man_id` 时，系统会自动从数字人详情中获取原生声音 ID
- v2.1: 新增删除操作 API（删除视频任务、删除自定义数字人、删除定制声音、删除文件）
