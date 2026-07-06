# 婵镜 API 适配器使用文档

## 概述

本项目为 [MuseTalk](https://github.com/TMElyralab/MuseTalk) 开源项目提供了**婵镜数字人 API 兼容层**，使您能够使用婵镜 API 的接口规范来调用 MuseTalk 的视频合成功能，无需修改现有后端代码。

## 特性

- ✅ **完全兼容婵镜 API 接口规范** - 使用相同的请求/响应格式
- ✅ **零代码迁移** - 现有婵镜 API 调用代码无需修改
- ✅ **异步任务处理** - 支持任务提交、查询、列表等完整流程
- ✅ **Mock 数据支持** - 提供模拟的数字人和声音数据用于测试
- ✅ **高性能推理** - 支持 Float16 加速，30+ FPS 实时合成

## 快速开始

### 1. 环境准备

```bash
# 进入 MuseTalk 目录
cd /root/MuseTalk

# 激活 Python 环境 (如果已安装)
# conda activate MuseTalk
# 或
source ./muse_env/bin/activate
```

### 2. 安装依赖

```bash
# 安装 FastAPI 和相关依赖
pip install fastapi uvicorn[standard] pydantic python-multipart
```

### 3. 启动 API 服务

```bash
# 方式 1: 使用启动脚本 (推荐)
chmod +x start_chanjing_api.sh
./start_chanjing_api.sh

# 方式 2: 直接运行
python3 -m chanjing_api_adapter --host 0.0.0.0 --port 8080

# 方式 3: 开发模式 (自动重载)
./start_chanjing_api.sh --reload
```

### 4. 访问 API 文档

启动后访问：http://your-server-ip:8080/docs

## API 接口列表

### 认证接口

#### POST /access_token
获取访问令牌

**请求:**
```json
{
  "app_id": "your_app_id",
  "secret_key": "your_secret_key"
}
```

**响应:**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "access_token": "tok_xxx",
    "expire_in": 7200
  }
}
```

### 公共资源接口

#### GET /list_common_dp
获取公共数字人列表

**请求参数:**
- `page`: 页码 (默认 1)
- `size`: 每页数量 (默认 10)
- `source`: 来源 (0=API, 1=Web)

**响应:**
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": "dp_001",
        "name": "小婵",
        "audio_man_id": "audio_001",
        "figures": [...]
      }
    ],
    "page_info": {...}
  }
}
```

#### GET /list_common_audio
获取公共声音人列表

### 视频合成接口

#### POST /create_video
创建合成视频任务

**请求:**
```json
{
  "audio": {
    "type": "audio",
    "wav_url": "/path/to/audio.wav"
  },
  "person": {
    "id": "dp_001"
  },
  "model": 0,
  "resolution_rate": 0
}
```

**响应:**
```json
{
  "code": 0,
  "data": {
    "id": "vid_xxx"
  }
}
```

#### GET /video
获取视频任务详情

**请求参数:**
- `id`: 视频任务 ID

**响应:**
```json
{
  "code": 0,
  "data": {
    "id": "vid_xxx",
    "status": 1,
    "progress": 100,
    "msg": "视频合成完成",
    "video_url": "/path/to/output.mp4"
  }
}
```

**状态码:**
- `0`: 处理中
- `1`: 已完成
- `2`: 失败

#### POST /video_list
获取视频任务列表

#### POST /delete_video
删除视频任务

### 对口型接口

#### POST /video_lip_sync/create
创建对口型视频

#### GET /video_lip_sync/detail
获取对口型视频详情

#### POST /video_lip_sync/list
获取对口型视频列表

### 用户信息接口

#### GET /user_info
获取用户信息

#### GET /user_duration
获取用户蝉豆余额

#### GET /font_list
获取字体列表

## 使用示例

### Python 示例

```python
import requests

# API 基础 URL
BASE_URL = "http://localhost:8080"

# 1. 获取 Access Token
token_resp = requests.post(f"{BASE_URL}/access_token", json={
    "app_id": "test_app",
    "secret_key": "test_secret"
})
access_token = token_resp.json()["data"]["access_token"]

headers = {"access_token": access_token}

# 2. 获取数字人列表
persons_resp = requests.get(
    f"{BASE_URL}/list_common_dp",
    params={"page": 1, "size": 10},
    headers=headers
)
persons = persons_resp.json()["data"]["list"]
print(f"可用数字人：{[p['name'] for p in persons]}")

# 3. 创建视频合成任务
create_resp = requests.post(
    f"{BASE_URL}/create_video",
    json={
        "audio": {
            "type": "audio",
            "wav_url": "/path/to/your/audio.wav"
        },
        "person": {
            "id": "dp_001"
        },
        "model": 0,
        "resolution_rate": 0
    },
    headers=headers
)
task_id = create_resp.json()["data"]["id"]
print(f"任务 ID: {task_id}")

# 4. 轮询任务状态
import time
while True:
    status_resp = requests.get(
        f"{BASE_URL}/video",
        params={"id": task_id},
        headers=headers
    )
    task_info = status_resp.json()["data"]
    
    print(f"进度：{task_info['progress']}%, 状态：{task_info['msg']}")
    
    if task_info["status"] == 1:  # 已完成
        print(f"视频完成：{task_info['video_url']}")
        break
    elif task_info["status"] == 2:  # 失败
        print(f"任务失败：{task_info['msg']}")
        break
    
    time.sleep(2)
```

### cURL 示例

```bash
# 获取 Token
curl -X POST http://localhost:8080/access_token \
  -H "Content-Type: application/json" \
  -d '{"app_id":"test","secret_key":"test"}'

# 获取数字人列表
curl -X GET "http://localhost:8080/list_common_dp?page=1&size=10" \
  -H "access_token: YOUR_TOKEN"

# 创建视频任务
curl -X POST http://localhost:8080/create_video \
  -H "Content-Type: application/json" \
  -H "access_token: YOUR_TOKEN" \
  -d '{
    "audio": {"type": "audio", "wav_url": "/path/to/audio.wav"},
    "person": {"id": "dp_001"}
  }'

# 查询任务状态
curl -X GET "http://localhost:8080/video?id=vid_xxx" \
  -H "access_token: YOUR_TOKEN"
```

## 配置文件说明

配置文件位于 `configs/chanjing_config.yaml`

### 主要配置项

```yaml
# 服务器配置
server:
  host: "0.0.0.0"
  port: 8080

# MuseTalk 模型配置
musetalk:
  use_float16: true  # 启用半精度加速
  device: "cuda"     # cuda 或 cpu

# 推理参数
inference:
  bbox_shift: 0      # 嘴唇区域偏移
  extra_margin: 10   # 额外边距
  batch_size: 8      # 批处理大小
  fps: 25           # 输出帧率

# 数字人素材
digital_persons:
  - id: "dp_001"
    name: "小婵"
    video_path: "./data/video/xiaochan.mp4"
```

## 参数映射说明

### 婵镜 API 参数 → MuseTalk 参数

| 婵镜 API 参数 | MuseTalk 参数 | 说明 |
|-------------|--------------|------|
| `person.id` | 数字人视频路径 | 通过配置文件映射 |
| `audio.wav_url` | `audio_path` | 音频文件路径 |
| `model` | `use_float16` | 0=基础版 (fp32), 1=高质版 (fp16) |
| `resolution_rate` | 输出分辨率 | 0=1080p, 1=4K |
| `bbox_shift` | `bbox_shift` | 嘴唇区域垂直偏移 |

## 性能优化建议

1. **启用 GPU 加速**: 确保 CUDA 正确安装
2. **使用 Float16**: 在配置文件中设置 `use_float16: true`
3. **调整 batch_size**: 根据显存大小调整 (推荐 8-16)
4. **缓存人脸坐标**: 设置 `cache_coords: true` 避免重复计算

## 故障排查

### 常见问题

**1. 模型文件缺失**
```bash
# 运行下载脚本
./download_weights.sh
```

**2. FFmpeg 未安装**
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# CentOS
sudo yum install ffmpeg
```

**3. 显存不足**
- 减小 `batch_size`
- 使用 `use_float16: true`
- 降低输出分辨率

**4. API 启动失败**
```bash
# 检查依赖
pip install -r requirements.txt
pip install fastapi uvicorn

# 查看日志
tail -f ./logs/chanjing_api.log
```

## 扩展开发

### 添加新的数字人

在 `configs/chanjing_config.yaml` 中添加:

```yaml
digital_persons:
  - id: "dp_003"
    name: "您的数字人名称"
    video_path: "./data/video/your_video.mp4"
    # ... 其他配置
```

### 自定义认证逻辑

修改 `chanjing_api_adapter.py` 中的 `verify_token` 函数:

```python
def verify_token(token: Optional[str] = Security(api_key_header)) -> Dict[str, Any]:
    # 在这里实现您的认证逻辑
    # 例如：查询数据库验证 token
    pass
```

## 许可证

- MuseTalk: MIT License
- 本适配器：MIT License

## 技术支持

如有问题，请提交 Issue 或联系开发团队。