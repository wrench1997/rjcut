# 蝉镜数字人 API 文档

## 概述

本文档介绍如何使用蝉镜开放平台 API 进行数字人视频合成、自定义数字人训练等操作。

**API 基础信息：**
- **Base URL**: `https://www.chanjing.cc/api/open/v1`
- **Host**: `open.chanjing.cc`
- **认证方式**: Access Token (通过 `access_token` 请求头传递)

---

## 目录

1. [认证](#认证)
2. [文件管理](#文件管理)
3. [公共资源](#公共资源)
4. [定制数字人](#定制数字人)
5. [定制声音](#定制声音)
6. [视频合成](#视频合成)
7. [对口型](#对口型)
8. [语音生成](#语音生成)
9. [用户信息](#用户信息)
10. [Python SDK 使用示例](#python-sdk-使用示例)

---

## 认证

### 获取 Access Token

所有 API 调用（除获取 Token 接口外）都需要在请求头中携带 `access_token`。

**接口**: `POST /access_token`

**请求参数**:
```json
{
  "app_id": "你的 app_id",
  "secret_key": "你的 secret_key"
}
```

**响应示例**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expire_in": 7200
  },
  "trace_id": "abc123..."
}
```

---

## 文件管理

### 获取文件上传链接

**接口**: `GET /common/create_upload_url`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| service | string | 是 | 服务类型：`customised_person`（定制数字人）、`background`（背景）、`audio`（音频）等 |
| name | string | 否 | 文件名 |

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "sign_url": "https://oss.example.com/upload?signature=xxx",
    "file_id": "file_abc123"
  }
}
```

### 上传文件

使用获取到的 `sign_url` 进行 PUT 上传：

```python
import requests

with open('video.mp4', 'rb') as f:
    response = requests.put(sign_url, data=f, headers={'Content-Type': 'video/mp4'})
```

### 获取文件列表

**接口**: `POST /common/file_list`

**请求参数**:
```json
{
  "page": 1,
  "page_size": 10,
  "service": "customised_person",
  "order": "desc"
}
```

### 获取文件详情

**接口**: `GET /common/file_detail?id={file_id}`

### 删除文件

**接口**: `POST /common/delete_file`

**请求参数**:
```json
{
  "id": "file_abc123"
}
```

---

## 公共资源

### 获取公共数字人列表

**接口**: `GET /list_common_dp`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码，默认 1 |
| size | integer | 否 | 每页数量，默认 20 |
| source | integer | 否 | 来源：0=API 定制，1=Web 定制 |

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "list": [
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
    ],
    "page_info": {
      "page": 1,
      "size": 20,
      "total_count": 50
    }
  }
}
```

### 获取公共声音人列表

**接口**: `GET /list_common_audio`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | integer | 否 | 页码 |
| size | integer | 否 | 每页数量 |

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "audio_001",
        "name": "知性女声",
        "gender": "female",
        "lang": "cn",
        "audition": "https://...",
        "desc": "温柔知性的女声",
        "speed": 1.0,
        "pitch": 1.0,
        "grade": 1
      }
    ]
  }
}
```

### 获取字体列表

**接口**: `GET /font_list`

---

## 定制数字人

### 创建定制数字人

**接口**: `POST /create_customised_person`

**请求参数**:
```json
{
  "name": "我的数字人",
  "file_id": "file_abc123",
  "train_type": "both",
  "language": "cn",
  "error_skip": false,
  "resolution_rate": 0,
  "version": "1.0",
  "denoise_flag": true,
  "callback": "https://your-callback.com/notify"
}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 数字人名称 |
| file_id | string | 是 | 素材视频文件 ID |
| train_type | string | 否 | 训练类型：`both`（声音 + 形象）、`voice`（仅声音）、`image`（仅形象） |
| language | string | 否 | 语言：`cn`（中文）、`en`（英文） |
| error_skip | boolean | 否 | 是否跳过声音克隆失败 |
| resolution_rate | integer | 否 | 分辨率：0=1080p，1=4k |
| version | string | 否 | 版本：默认 1.0，2.0 需要上传授权视频和文案 |
| denoise_flag | boolean | 否 | 是否降噪 |
| callback | string | 否 | 回调 URL |

**响应示例**:
```json
{
  "code": 0,
  "data": "person_abc123",
  "msg": "success"
}
```

### 获取定制数字人列表

**接口**: `POST /list_customised_person`

**请求参数**:
```json
{
  "page": 1,
  "page_size": 10,
  "source": 0
}
```

### 获取定制数字人详情

**接口**: `GET /customised_person?id={person_id}`

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "id": "person_abc123",
    "name": "我的数字人",
    "status": 1,
    "progress": 100,
    "pic_url": "https://...",
    "preview_url": "https://...",
    "audio_man_id": "audio_custom_001",
    "type": "person",
    "width": 1080,
    "height": 1920,
    "support_4k": true,
    "is_open": 1,
    "create_time": 1712345678
  }
}
```

**状态码说明**:
| 状态码 | 说明 |
|--------|------|
| 0 | 定制中 |
| 1 | 已完成 |
| 2 | 已完成（实际 API 返回，需配合 progress=100 判断） |
| 40 | 失败 |

### 删除定制数字人

**接口**: `POST /delete_customised_person`

**请求参数**:
```json
{
  "id": "person_abc123"
}
```

---

## 定制声音

### 创建定制声音

**接口**: `POST /create_customised_audio`

**请求参数**:
```json
{
  "name": "我的声音",
  "url": "https://example.com/audio.wav",
  "language": "cn",
  "denoise_flag": true,
  "model_type": "default",
  "callback": "https://your-callback.com/notify"
}
```

### 获取定制声音列表

**接口**: `POST /list_customised_audio`

### 获取定制声音详情

**接口**: `GET /customised_audio?id={audio_id}`

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "id": "audio_custom_001",
    "name": "我的声音",
    "status": 1,
    "progress": 100,
    "lang": "cn",
    "type": "custom",
    "audio_path": "https://..."
  }
}
```

### 删除定制声音

**接口**: `POST /delete_customised_audio`

---

## 视频合成

### 创建合成视频任务

**接口**: `POST /create_video`

**请求参数**:
```json
{
  "person": {
    "id": "person_abc123",
    "x": 0,
    "y": 0,
    "width": 1080,
    "height": 1920,
    "figure_type": "whole_body",
    "drive_mode": "random",
    "backway": 1,
    "is_rgba_mode": false
  },
  "audio": {
    "type": "tts",
    "tts": {
      "audio_man": "audio_001",
      "text": ["你好，欢迎观看我的视频。", "这是第二段文本。"],
      "speed": 1.0,
      "pitch": 1.0
    },
    "volume": 100,
    "language": "cn"
  },
  "bg_color": "#EDEDED",
  "screen_width": 1080,
  "screen_height": 1920,
  "model": 1,
  "resolution_rate": 0,
  "hide_subtitle": false,
  "add_compliance_watermark": true,
  "compliance_watermark_position": 0,
  "subtitle_config": {
    "show": true,
    "asr_type": 0,
    "font_size": 40,
    "color": "#FFFFFF",
    "stroke_color": "#000000",
    "stroke_width": 1.0,
    "x": 0,
    "y": 1700,
    "width": 1080,
    "height": 200
  },
  "callback": "https://your-callback.com/notify"
}
```

**参数说明**:

**person 对象**:
| 参数 | 类型 | 说明 |
|------|------|------|
| id | string | 数字人 ID（公共或定制） |
| x, y | integer | 数字人在画布中的位置 |
| width, height | integer | 数字人尺寸 |
| figure_type | string | 形象类型：`whole_body`（全身）、`half_body`（半身） |
| drive_mode | string | 驱动模式：`normal`（顺序驱动）、`random`（随机帧动作） |
| backway | integer | 正反播：1=正放，2=倒放 |
| is_rgba_mode | boolean | 是否驱动四通道 webm 视频 |

**audio 对象**:
| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | 音频类型：`tts`（文本生成）、`audio`（音频文件） |
| tts.audio_man | string | 声音 ID |
| tts.text | array | 文本数组 |
| tts.speed | number | 语速，默认 1.0 |
| tts.pitch | number | 语调，默认 1.0 |
| volume | integer | 音量，默认 100 |
| language | string | 语言 |

**背景设置**（二选一）:
- `bg_color`: 纯色背景，如 `"#EDEDED"`
- `bg`: 图片背景对象
  ```json
  {
    "file_id": "file_bg123",
    "x": 0,
    "y": 0,
    "width": 1080,
    "height": 1920
  }
  ```

**其他参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| screen_width | integer | 画布宽度，默认 1080 |
| screen_height | integer | 画布高度，默认 1920 |
| model | integer | 模型版本：0=基础版，1=高质版 |
| resolution_rate | integer | 分辨率：0=1080p，1=4k |
| hide_subtitle | boolean | 是否隐藏字幕 |
| add_compliance_watermark | boolean | 是否添加合规水印 |
| subtitle_config | object | 字幕配置（见下表） |

**subtitle_config 对象**:
| 参数 | 类型 | 说明 |
|------|------|------|
| show | boolean | 是否显示字幕 |
| asr_type | integer | 0=自动生成，1=用户上传 |
| font_id | string | 字体 ID |
| font_size | integer | 字体大小 |
| color | string | 字体颜色 |
| stroke_color | string | 描边颜色 |
| stroke_width | number | 描边宽度 |
| x, y | integer | 字幕位置 |
| width, height | integer | 字幕区域尺寸 |
| subtitles | array | 用户上传的 ASR 结果（当 asr_type=1 时） |

**响应示例**:
```json
{
  "code": 0,
  "data": "video_abc123",
  "msg": "success"
}
```

### 获取视频列表

**接口**: `POST /video_list`

**请求参数**:
```json
{
  "page": 1,
  "page_size": 10
}
```

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "video_abc123",
        "status": 1,
        "progress": 100,
        "duration": 30,
        "video_url": "https://...",
        "preview_url": "https://...",
        "audio_urls": ["https://..."],
        "subtitle_data_url": "https://...",
        "create_time": 1712345678,
        "msg": "success"
      }
    ],
    "pageInfo": {
      "page": 1,
      "size": 10,
      "total_count": 50
    }
  }
}
```

### 获取视频详情

**接口**: `GET /video?id={video_id}`

**状态码说明**:
| 状态码 | 说明 |
|--------|------|
| 1 | 已完成 |
| 2 | 处理中 |
| 40 | 失败 |

### 删除视频

**接口**: `POST /delete_video`

**请求参数**:
```json
{
  "id": "video_abc123"
}
```

---

## 对口型

### 创建对口型视频

**接口**: `POST /video_lip_sync/create`

**请求参数**:
```json
{
  "video_file_id": "file_video123",
  "audio_file_id": "file_audio123",
  "model": 1,
  "backway": 1,
  "drive_mode": "normal",
  "volume": 100,
  "screen_width": 1080,
  "screen_height": 1920,
  "tts_config": {
    "audio_man_id": "audio_001",
    "text": ["你好"],
    "speed": 1.0,
    "pitch": 1.0
  },
  "callback": "https://your-callback.com/notify"
}
```

### 获取对口型视频列表

**接口**: `POST /video_lip_sync/list`

### 获取对口型视频详情

**接口**: `GET /video_lip_sync/detail?id={video_id}`

---

## 语音生成

### 创建语音合成任务

**接口**: `POST /create_audio_task` 或 `POST /create_audio_task_v2`

**请求参数**:
```json
{
  "audio_man": "audio_001",
  "speed": 1.0,
  "pitch": 1.0,
  "text": {
    "text": "你好，欢迎观看。",
    "plain_text": "你好，欢迎观看。"
  },
  "language_boost": "cn",
  "aigc_watermark": true,
  "callback": "https://your-callback.com/notify"
}
```

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "task_id": "audio_task_123"
  }
}
```

### 获取语音合成任务状态

**接口**: `POST /audio_task_state`

**请求参数**:
```json
{
  "task_id": "audio_task_123"
}
```

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "id": "audio_task_123",
    "status": 1,
    "full": {
      "url": "https://...",
      "path": "https://...",
      "duration": 30,
      "watermark_url": "https://..."
    },
    "subtitles": [
      {
        "key": "sub_001",
        "subtitle": "你好，欢迎观看。",
        "start_time": 0.0,
        "end_time": 3.5,
        "words": [
          {"text": "你好", "startTime": 0.0, "endTime": 1.0},
          {"text": "欢迎观看", "startTime": 1.0, "endTime": 3.5}
        ]
      }
    ]
  }
}
```

---

## 用户信息

### 获取用户信息

**接口**: `GET /user_info`

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "id": "app_001",
    "name": "我的应用",
    "custom_person_limit": 10,
    "custom_person_nums": 3,
    "video_create_limit": 3600,
    "video_create_seconds": 1200
  }
}
```

### 获取用户蝉豆余额

**接口**: `GET /user_duration`

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "resi_total_bean": 5000,
    "bean_day30": 200
  }
}
```

---

## Python SDK 使用示例

### 初始化

```python
from chanjing_api import ChanjingAPI

# 初始化 API 客户端
api = ChanjingAPI(
    app_id="your_app_id",
    secret_key="your_secret_key"
)

# 启用调试模式（可选）
api.set_debug(True)
```

### 示例 1：使用公共数字人合成视频

```python
# 1. 创建视频合成任务
video_response = api.create_video(
    digital_person_id="dp_001",      # 公共数字人 ID
    text=["你好，欢迎观看我的视频。", "这是第二段文本。"],
    audio_man_id="audio_001",        # 声音 ID
    speed=1.0,
    pitch=1.0,
    volume=100,
    screen_width=1080,
    screen_height=1920,
    bg_color="#EDEDED",
    figure_type="whole_body",
    drive_mode="random",
    model=1,                          # 高质版
    resolution_rate=0                 # 1080p
)

if video_response.get('code') != 0:
    raise Exception(f"创建视频失败：{video_response}")

video_id = video_response['data']
print(f"视频任务已创建：{video_id}")

# 2. 轮询等待视频合成完成
import time
for i in range(180):  # 最多等待 30 分钟
    status_resp = api.get_video_status(video_id)
    data = status_resp.get('data', {})
    status = data.get('status')
    progress = data.get('progress', 0)
    
    print(f"进度：{progress}%, 状态：{status}")
    
    if status == 1:  # 已完成
        video_url = data.get('video_url')
        print(f"视频合成完成：{video_url}")
        break
    elif status == 40:  # 失败
        raise Exception(f"视频合成失败：{data.get('msg')}")
    
    time.sleep(10)

# 3. 下载视频
api.download_video(video_url, "./output/final.mp4")
```

### 示例 2：训练自定义数字人

```python
# 1. 上传素材视频
file_id = api.upload_file("./source_video.mp4", service="customised_person")
print(f"文件上传成功，ID: {file_id}")

# 2. 创建定制数字人任务
train_resp = api.create_customised_person(
    name="我的数字人",
    file_id=file_id,
    train_type="both",      # both=声音 + 形象，voice=仅声音，image=仅形象
    language="cn",
    error_skip=False,
    resolution_rate=0       # 1080p
)

if train_resp.get('code') != 0:
    raise Exception(f"创建训练任务失败：{train_resp}")

person_id = train_resp['data']
print(f"数字人训练任务已创建：{person_id}")

# 3. 轮询等待训练完成
import time
for i in range(480):  # 最多等待 4 小时
    status_resp = api.get_customised_person_status(person_id)
    data = status_resp.get('data', {})
    status = data.get('status')
    progress = data.get('progress', 0)
    
    print(f"训练进度：{progress}%, 状态：{status}")
    
    if status == 1 or (status == 2 and progress == 100):  # 已完成
        print("数字人训练完成！")
        break
    elif status == 40:  # 失败
        raise Exception(f"训练失败：{data.get('msg')}")
    
    time.sleep(30)

# 4. 获取训练完成的数字人详情
person_detail = api.get_customised_person_status(person_id)
print(f"数字人详情：{person_detail['data']}")
```

### 示例 3：使用自定义背景图片合成视频

```python
# 1. 上传背景图片
bg_file_id = api.upload_file("./background.jpg", service="background")

# 2. 创建带背景的视频
video_response = api.create_video(
    digital_person_id="person_abc123",
    text=["你好，这是使用自定义背景的视频。"],
    audio_man_id="audio_001",
    bg={
        "file_id": bg_file_id,
        "x": 0,
        "y": 0,
        "width": 1080,
        "height": 1920
    },
    person_x=0,
    person_y=0,
    person_width=1080,
    person_height=1920,
    figure_type="whole_body",
    drive_mode="random"
)

video_id = video_response['data']
```

### 示例 4：使用音频文件合成视频

```python
# 1. 上传音频文件
audio_file_id = api.upload_file("./audio.wav", service="audio")

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

### 示例 5：自定义字幕样式

```python
video_response = api.create_video(
    digital_person_id="person_abc123",
    text=["你好，这是自定义字幕的视频。"],
    audio_man_id="audio_001",
    hide_subtitle=False,
    subtitle_config={
        "show": True,
        "asr_type": 0,          # 0=自动生成
        "font_size": 40,
        "color": "#FFFFFF",
        "stroke_color": "#000000",
        "stroke_width": 1.0,
        "x": 0,
        "y": 1700,
        "width": 1080,
        "height": 200
    }
)
```

### 示例 6：错误处理与回调

```python
# 创建视频时添加回调
video_response = api.create_video(
    digital_person_id="person_abc123",
    text=["你好"],
    audio_man_id="audio_001",
    callback="https://your-server.com/callback"
)

# 在回调服务器接收通知
from flask import Flask, request, jsonify
import hashlib

app = Flask(__name__)

@app.route('/callback', methods=['POST'])
def callback():
    data = request.json
    signature = request.headers.get('X-Signature')
    
    # 验证签名（如果配置了 secret）
    # expected_sign = hashlib.sha256((json.dumps(data) + secret).encode()).hexdigest()
    
    event = data.get('event')
    if event == 'task.completed':
        print(f"任务完成：{data.get('task_id')}")
    elif event == 'task.failed':
        print(f"任务失败：{data.get('error')}")
    
    return jsonify({"status": "ok"})
```

### 示例 7：完整工作流（项目实战）

```python
import os
from chanjing_api import ChanjingAPI

def main():
    # 初始化
    api = ChanjingAPI(
        app_id=os.getenv("CHANJING_APP_ID"),
        secret_key=os.getenv("CHANJING_SECRET_KEY")
    )
    api.set_debug(True)
    
    # 步骤 1: 上传素材训练数字人（可选，如果已有数字人可跳过）
    # file_id = api.upload_file("./my_video.mp4", service="customised_person")
    # train_resp = api.create_customised_person(name="我的数字人", file_id=file_id)
    # person_id = train_resp['data']
    
    # 使用已有数字人
    person_id = "person_abc123"
    
    # 步骤 2: 创建视频
    video_response = api.create_video(
        digital_person_id=person_id,
        text=[
            "大家好，我是你的 AI 助手。",
            "今天我来为大家介绍我们的产品。"
        ],
        audio_man_id="audio_001",
        speed=1.0,
        pitch=1.0,
        bg_color="#F0F0F0",
        figure_type="whole_body",
        drive_mode="random",
        model=1,
        resolution_rate=0,
        subtitle_config={
            "show": True,
            "font_size": 36,
            "color": "#333333",
            "y": 1750
        }
    )
    
    video_id = video_response['data']
    print(f"视频任务 ID: {video_id}")
    
    # 步骤 3: 等待完成
    import time
    while True:
        status_resp = api.get_video_status(video_id)
        data = status_resp.get('data', {})
        status = data.get('status')
        progress = data.get('progress', 0)
        
        print(f"进度：{progress}%")
        
        if status == 1:
            video_url = data.get('video_url')
            print(f"视频完成：{video_url}")
            
            # 下载
            api.download_video(video_url, "./output/video.mp4")
            break
        elif status == 40:
            print(f"失败：{data.get('msg')}")
            break
        
        time.sleep(10)

if __name__ == "__main__":
    main()
```

---

## 错误码说明

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 参数错误 |
| 401 | 认证失败 |
| 50000 | 文件未完成上传 |
| 其他 | 参考具体接口返回的 msg 字段 |

---

## 最佳实践

1. **文件上传**: 大文件上传建议先获取上传 URL，然后使用 PUT 直传 OSS
2. **轮询间隔**: 视频合成建议 10 秒轮询一次，数字人训练建议 30 秒轮询一次
3. **超时处理**: 视频合成一般 5-15 分钟，数字人训练一般 30 分钟 -2 小时
4. **回调机制**: 生产环境建议使用 callback 回调，避免长时间轮询
5. **错误重试**: 对于网络错误和 50000 错误（文件未就绪），建议实现重试机制

---

## 常见问题

### 如何使用自定义数字人的原生声音？

当你训练完成一个自定义数字人后，蝉镜平台会为该数字人生成一个**专属的原生声音**（`audio_man_id`）。要使用这个原生声音而不是公共声音（如女声），有以下两种方法：

#### 方法 1：从数字人详情中获取原生声音 ID

```python
# 1. 获取数字人详情
person_detail = api.get_customised_person_status(person_id)

# 2. 提取原生声音 ID
if person_detail.get('code') == 0:
    native_audio_id = person_detail['data'].get('audio_man_id')
    print(f"原生声音 ID: {native_audio_id}")

# 3. 使用该声音 ID 创建视频
video_response = api.create_video(
    digital_person_id=person_id,
    text=["你好，这是使用原生声音的视频。"],
    audio_man_id=native_audio_id,  # 使用原生声音 ID
    speed=1.0,
    pitch=1.0
)
```

#### 方法 2：在创建视频时不指定 audio_man_id（推荐）

如果你的系统已经配置好自动使用数字人原生声音的逻辑，可以在创建视频时**不传 `audio_man_id` 参数**或**传空值**，系统会自动使用该数字人的原生声音：

```python
video_response = api.create_video(
    digital_person_id=person_id,
    text=["你好，这是使用原生声音的视频。"],
    audio_man_id=None,  # 不指定，使用数字人原生声音
    # 或者完全省略 audio_man_id 参数
)
```

> **注意**: 方法 2 需要后端系统支持自动获取数字人原生声音的功能。如果未配置，建议使用方法 1 手动获取。

#### 为什么我的 audio_man_id 是女声？

如果你在创建视频时传入的 `audio_man_id` 是一个公共声音 ID（如 `audio_001`），那么即使你使用了自定义数字人，声音也会是那个公共声音（可能是女声）。

**正确做法**：
- 训练完成后，通过 `get_customised_person_status` 接口获取数字人详情
- 从响应中提取 `data.audio_man_id` 字段
- 使用该 ID 作为 `audio_man_id` 参数

---

## 相关文档

---

## 相关文档

- [chanjing-openapi.yaml](./chanjing-openapi.yaml) - OpenAPI 规范文件
- [chanjing_api.py](./chanjing_api.py) - Python SDK 实现
- [chanjing_video.py](./tasks/chanjing_video.py) - 视频任务处理器实现

---

**文档版本**: 1.0  
**更新日期**: 2026-04-15
