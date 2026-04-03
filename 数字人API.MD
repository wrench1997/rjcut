# RJCut 数字人模块 API 文档 (v1.0.0)

## 鉴权方式
所有接口均需在 Header 中携带 API Key：
```http
Authorization: Bearer rjk_xxxxxxxxxxxxxxxxxx
```

---

## 1. 基础资源接口

### 1.1 获取公共数字人列表
获取平台系统内置的可用数字人形象。

**GET** `/v1/dh/persons/common`

**Response:**
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "dp_xxxxxx",
      "name": "职业西装女",
      "cover_url": "https://...",
      "figure_type": "half_body"
    }
  ]
}
```

### 1.2 获取我的定制数字人列表
获取当前商家克隆/训练完成的私有数字人模型。

**GET** `/v1/dh/persons/custom`

**Response:**
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "id": "person_12345",
      "name": "老板本人",
      "status": 30,  // 30为训练成功
      "cover_url": "https://..."
    }
  ]
}
```

### 1.3 获取可用声音模型列表
获取可用于文字转语音 (TTS) 的配音员列表。

**GET** `/v1/dh/voices`

**Response:**
```json
{
  "code": 0,
  "message": "ok",
  "data": [
    {
      "audio_man": "voice_boy_1",
      "name": "阳光青年",
      "language": "cn"
    }
  ]
}
```

---

## 2. 异步任务：生成数字人播报视频

生成数字人讲话视频，支持使用背景图片或者纯色背景。这是一个**异步任务**，调用后返回 `task_id`。

**POST** `/v1/dh/tasks/generate`

**Request Body:**
```json
{
  "text": "大家好，欢迎使用RJCut数字人合成系统。今天我们来介绍一下新产品。",
  "person_id": "dp_xxxxxx",          // 来源于数字人列表
  "audio_man_id": "voice_boy_1",     // 来源于声音列表
  "figure_type": "half_body",        // full_body / half_body / sit_body 等
  "drive_mode": "random",            // random: 随机动作
  "bg_type": "image",                // color 或 image
  "bg_color": "#EDEDED",             // 若 bg_type 为 color，则填HEX颜色
  "bg_file_oss_key": "merchant_x/input/bg.jpg",  // 若 bg_type 为 image，先调用预签名URL上传背景图到MinIO，传返回的 oss_key
  "callback": {
    "url": "https://your-server.com/webhook",
    "secret": "your_signature_secret"
  }
}
```

**Response:**
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_1a2b3c4d",
    "status": "queued"
  }
}
```

---

## 3. 异步任务：定制个人数字人 (模型训练)

上传一段带有清晰人脸和语音的视频，训练专属的数字人形象。**由于训练可能需要数小时，务必使用 Webhook 或定期查询任务状态。**

**POST** `/v1/dh/tasks/create-person`

**Request Body:**
```json
{
  "name": "张总演示模型",
  "source_video_oss_key": "merchant_x/input/source_video.mp4", // 通过预签名URL上传的原视频
  "train_type": "both",    // both(音视频同训) / video(仅视频)
  "language": "cn",        // 语言
  "callback": {
    "url": "https://your-server.com/webhook"
  }
}
```

**Response:**
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dhc_9x8y7z",
    "status": "queued"
  }
}
```

---

## 4. 任务状态与结果查询

通过主应用的通用任务查询接口查询上述异步任务的进度。

**GET** `/v1/tasks/{task_id}`

**Response (数字人视频生成完成的情况):**
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dh_1a2b3c4d",
    "task_type": "dh_generate",
    "status": "succeeded",
    "progress": 100,
    "stage": "finished",
    "result": {
      "files": {
        "final_video": {
          "oss_key": "merchant_id/tasks/task_id/final_video.mp4",
          "download_url": "/v1/tasks/task_dh_1a2b3c4d/files/final_video"
        }
      }
    }
  }
}
```

**Response (数字人克隆训练完成的情况):**
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_dhc_9x8y7z",
    "task_type": "dh_custom_person",
    "status": "succeeded",
    "progress": 100,
    "stage": "finished",
    "result": {
      "person_id": "person_abc123",  // 记录此ID，未来用于生成视频时的 person_id 传参
      "name": "张总演示模型"
    }
  }
}
```

### 获取成品下载链接
当 `task_type=dh_generate` 且状态为 `succeeded` 时，使用系统统一的文件下载接口：

**GET** `/v1/tasks/{task_id}/files/final_video`

即可获取 3600秒 有效期的直链下载地址。