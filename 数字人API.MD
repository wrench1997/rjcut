# 数字人 API 文档

## 概述

本 API 提供基于**蝉镜平台**的数字人视频生成和自定义数字人训练功能。支持异步任务模式，包含完整的配额管理、并发控制和任务状态追踪。

**基础路径**: `/v1/dh`

**认证方式**: API Key (通过 `X-API-Key` 请求头传递)

---

## 目录

1. [基础资源接口](#1-基础资源接口)
2. [视频生成任务](#2-视频生成任务)
3. [自定义数字人训练](#3-自定义数字人训练)
4. [数据模型](#4-数据模型)
5. [错误码说明](#5-错误码说明)
6. [使用示例](#6-使用示例)

---

## 1. 基础资源接口

### 1.1 获取公共数字人列表

获取蝉镜平台提供的公共数字人模型。

**请求**

```
GET /v1/dh/persons/common
```

**响应**

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "dp_xxxxx",
      "name": "数字人名称",
      "cover_url": "https://...",
      "figure_type": "sit_body"
    }
  ]
}
```

---

### 1.2 获取自定义数字人列表

获取当前商户训练的私有数字人列表（数据隔离）。

**请求**

```
GET /v1/dh/persons/custom
```

**响应**

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "person_xxxxx",
      "name": "我的数字人",
      "status": 30,
      "cover_url": "https://...",
      "created_at": "2026-04-14T10:00:00Z"
    }
  ]
}
```

**字段说明**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 蝉镜平台的数字人 ID（生成视频时需使用） |
| name | string | 数字人名称 |
| status | integer | 状态：10-训练中，30-成功，40-失败 |
| cover_url | string | 封面图片 URL |
| created_at | string | 创建时间 (ISO 8601) |

---

### 1.3 获取声音模型列表

获取蝉镜平台提供的公共声音模型。

**请求**

```
GET /v1/dh/voices
```

**响应**

```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "audio_xxxxx",
      "name": "声音名称",
      "gender": "female",
      "sample_url": "https://..."
    }
  ]
}
```

---

## 2. 视频生成任务

### 2.1 创建视频生成任务

创建异步任务，生成数字人播报视频。

**请求**

```
POST /v1/dh/tasks/generate
```

**请求体**

```json
{
  "text": "欢迎使用数字人视频生成服务",
  "person_id": "dp_xxxxx",
  "audio_man_id": "audio_xxxxx",
  "figure_type": "sit_body",
  "drive_mode": "random",
  "bg_type": "color",
  "bg_color": "#EDEDED",
  "bg_file_oss_key": null,
  "client_ref_id": "my_order_001",
  "timeout_seconds": 3600
}
```

**请求参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| text | string | ✅ | - | 播报文本内容 |
| person_id | string | ❌ | null | 数字人 ID（公共或自定义） |
| audio_man_id | string | ✅ | - | 声音模型 ID |
| figure_type | string | ❌ | "sit_body" | 人物类型：sit_body/whole_body |
| drive_mode | string | ❌ | "random" | 驱动模式：random/natural |
| bg_type | string | ❌ | "color" | 背景类型：color/image |
| bg_color | string | ❌ | "#EDEDED" | 背景颜色（HEX） |
| bg_file_oss_key | string | ❌ | null | 背景图片 OSS 路径（bg_type=image 时使用） |
| client_ref_id | string | ❌ | null | 客户端自定义订单 ID |
| timeout_seconds | integer | ❌ | 3600 | 任务超时时间（秒） |

**响应**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_xxxxx",
    "status": "queued"
  }
}
```

---

### 2.2 任务状态查询

通过通用任务查询接口获取任务状态（与主 API 共享）。

**请求**

```
GET /v1/tasks/{task_id}
```

**响应**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_xxxxx",
    "task_type": "dh_generate",
    "status": "succeeded",
    "progress": 100,
    "stage": "finished",
    "result": {
      "files": {
        "final_video": {
          "oss_key": "output/2026/04/14/xxxxx.mp4",
          "url": "https://..."
        }
      }
    },
    "created_at": "2026-04-14T10:00:00Z",
    "finished_at": "2026-04-14T10:05:00Z"
  }
}
```

**任务状态流转**

```
queued → processing → succeeded/failed/cancelled/timeout
```

**处理阶段 (stage)**

| 阶段 | 说明 |
|------|------|
| queued | 等待处理 |
| submitting_to_chanjing | 提交到蝉镜平台 |
| waiting_chanjing_render | 等待蝉镜渲染 |
| uploading_results | 上传结果到 OSS |
| finished | 完成 |
| failed | 失败 |

---

## 3. 自定义数字人训练

### 3.1 创建自定义数字人训练任务

上传视频素材，训练商户专属的数字人模型。

**请求**

```
POST /v1/dh/tasks/create-person
```

**请求体**

```json
{
  "name": "我的专属数字人",
  "source_video_oss_key": "input/2026/04/14/xxxxx.mp4",
  "train_type": "both",
  "language": "cn",
  "error_skip": false,
  "resolution_rate": 0,
  "client_ref_id": "person_train_001"
}
```

**请求参数说明**

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | ✅ | - | 数字人名称 |
| source_video_oss_key | string | ✅ | - | 训练视频 OSS 路径 |
| train_type | string | ❌ | "both" | 训练类型：both/audio/video |
| language | string | ❌ | "cn" | 语言：cn/en |
| error_skip | boolean | ❌ | false | 是否跳过错误检查 |
| resolution_rate | integer | ❌ | 0 | 分辨率倍率 |
| client_ref_id | string | ❌ | null | 客户端自定义订单 ID |

**响应**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dhc_xxxxx",
    "status": "queued"
  }
}
```

---

### 3.2 训练任务状态

训练任务完成后，可通过 `GET /v1/dh/persons/custom` 查询已训练成功的数字人。

**训练状态说明**

| 状态码 | 说明 |
|--------|------|
| 10 | 训练中 |
| 30 | 训练成功 |
| 40 | 训练失败 |

**训练时长**: 通常需要 30 分钟 ~ 4 小时

---

## 4. 数据模型

### 4.1 任务类型

| 任务类型 | 说明 |
|----------|------|
| dh_generate | 数字人视频生成 |
| dh_custom_person | 自定义数字人训练 |

### 4.2 数字人类型 (figure_type)

| 类型 | 说明 |
|------|------|
| sit_body | 坐姿半身像 |
| whole_body | 全身像 |
| stand_body | 站姿半身像 |

### 4.3 驱动模式 (drive_mode)

| 模式 | 说明 |
|------|------|
| random | 随机动作 |
| natural | 自然动作 |

### 4.4 训练类型 (train_type)

| 类型 | 说明 |
|------|------|
| both | 同时训练声音和形象 |
| audio | 仅训练声音 |
| video | 仅训练形象 |

---

## 5. 错误码说明

### 5.1 业务错误码

| 错误码 | 说明 |
|--------|------|
| 40201 | 配额不足 (insufficient quota) |
| 42901 | 并发限制 (limit reached) |

### 5.2 HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

---

## 6. 使用示例

### 6.1 完整工作流示例

#### Step 1: 获取可用数字人

```bash
curl -X GET "http://localhost:8000/v1/dh/persons/common" \
  -H "X-API-Key: your_api_key"
```

#### Step 2: 获取可用声音

```bash
curl -X GET "http://localhost:8000/v1/dh/voices" \
  -H "X-API-Key: your_api_key"
```

#### Step 3: 创建视频生成任务

```bash
curl -X POST "http://localhost:8000/v1/dh/tasks/generate" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "欢迎使用我们的服务",
    "person_id": "dp_xxxxx",
    "audio_man_id": "audio_xxxxx",
    "figure_type": "sit_body",
    "bg_color": "#EDEDED"
  }'
```

#### Step 4: 轮询任务状态

```bash
curl -X GET "http://localhost:8000/v1/tasks/task_dh_xxxxx" \
  -H "X-API-Key: your_api_key"
```

#### Step 5: 获取生成结果

任务成功后，从 `result.files.final_video.url` 获取视频下载地址。

---

### 6.2 训练自定义数字人示例

#### Step 1: 上传训练视频

通过文件上传接口上传视频，获取 `oss_key`。

#### Step 2: 创建训练任务

```bash
curl -X POST "http://localhost:8000/v1/dh/tasks/create-person" \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "品牌代言人",
    "source_video_oss_key": "input/2026/04/14/train_video.mp4",
    "train_type": "both",
    "language": "cn"
  }'
```

#### Step 3: 等待训练完成

训练通常需要较长时间，建议通过回调通知或定时轮询获取结果。

#### Step 4: 使用自定义数字人生成视频

训练成功后，在 `GET /v1/dh/persons/custom` 中获取 `person_id`，然后在生成视频时使用。

---

### 6.3 Python SDK 示例

```python
import requests

BASE_URL = "http://localhost:8000"
API_KEY = "your_api_key"
HEADERS = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

# 获取公共数字人
resp = requests.get(f"{BASE_URL}/v1/dh/persons/common", headers=HEADERS)
persons = resp.json()["data"]
person_id = persons[0]["id"]

# 获取声音列表
resp = requests.get(f"{BASE_URL}/v1/dh/voices", headers=HEADERS)
voices = resp.json()["data"]
audio_man_id = voices[0]["id"]

# 创建视频生成任务
payload = {
    "text": "欢迎使用数字人服务",
    "person_id": person_id,
    "audio_man_id": audio_man_id,
    "figure_type": "sit_body",
    "bg_color": "#EDEDED"
}
resp = requests.post(f"{BASE_URL}/v1/dh/tasks/generate", json=payload, headers=HEADERS)
task_id = resp.json()["data"]["task_id"]

# 轮询任务状态
import time
while True:
    resp = requests.get(f"{BASE_URL}/v1/tasks/{task_id}", headers=HEADERS)
    task = resp.json()["data"]
    
    if task["status"] in ["succeeded", "failed", "cancelled", "timeout"]:
        break
    
    print(f"进度：{task['progress']}%, 阶段：{task['stage']}")
    time.sleep(5)

# 获取结果
if task["status"] == "succeeded":
    video_url = task["result"]["files"]["final_video"]["url"]
    print(f"视频生成成功：{video_url}")
else:
    print(f"任务失败：{task['error']}")
```

---

## 附录

### A. 蝉镜平台状态码对照

| 蝉镜状态码 | 说明 |
|------------|------|
| 1 | 等待处理 |
| 2 | 处理中 |
| 30 | 成功 |
| 40 | 失败 |
| -1 | 未知错误 |

### B. 配额与并发限制

- **配额检查**: 提交任务前检查商户可用配额
- **并发限制**: 根据商户等级限制同时运行的任务数
- **预扣费**: 任务提交时预扣配额，完成后确认扣费，失败时退还

### C. 回调通知

支持通过 `callback` 参数配置任务完成回调：

```json
{
  "callback": {
    "url": "https://your-server.com/callback",
    "secret": "your_secret_key"
  }
}
```

回调 payload 示例：

```json
{
  "event": "task.completed",
  "task_id": "task_dh_xxxxx",
  "trace_id": "trace_xxxxx",
  "status": "succeeded",
  "result": {
    "files": {
      "final_video": {
        "oss_key": "output/xxxxx.mp4",
        "url": "https://..."
      }
    }
  }
}
```

### D. 文件存储

- 输入文件：通过 OSS 上传，使用 `oss_key` 引用
- 输出文件：自动生成并上传到 OSS，返回下载 URL
- 临时文件：任务完成后自动清理

---

**文档版本**: v1.0  
**最后更新**: 2026-04-14
