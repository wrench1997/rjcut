# 蝉镜 API V2 使用文档

## 概述

蝉镜 API V2 是在 V1 基础上的增强版本，提供了更好的稳定性、容错能力和可观测性。V2 完全向后兼容 V1，可以无缝替换。

## V2 新增特性

### 1. 指数退避重试机制

自动处理网络波动和临时故障，使用指数退避算法：

```python
from chanjing_api_v2 import create_chanjing_api_v2

api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    max_retries=3  # 最多重试 3 次
)

# 调用 API 时自动重试
persons = api.list_common_digital_persons()
```

**重试策略：**
- 基础延迟：1 秒
- 最大延迟：30 秒
- 指数基数：2（每次重试延迟翻倍）
- 随机抖动：±50%（避免并发请求同时重试）

### 2. 智能缓存（LRU + TTL）

内置智能缓存系统，减少 API 调用频率：

```python
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    enable_cache=True,
    cache_max_size=1000  # 最多缓存 1000 条数据
)

# 自动缓存数字人列表（5 分钟）
persons1 = api.list_common_digital_persons()  # 调用 API
persons2 = api.list_common_digital_persons()  # 使用缓存

# 手动控制缓存
api._cache_delete_v2("v2:list_common_persons:1:20")
```

**缓存 TTL 配置：**
- 公共数字人列表：5 分钟
- 公共声音列表：5 分钟
- 自定义数字人状态：1 分钟

### 3. 请求统计和监控

实时监控 API 调用情况：

```python
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    enable_stats=True
)

# 获取统计信息
stats = api.get_stats()
print(stats)
# 输出：
# {
#   "total_requests": 100,
#   "successful_requests": 95,
#   "failed_requests": 5,
#   "retried_requests": 10,
#   "success_rate": "95.00%",
#   "avg_latency_ms": "234.56ms",
#   "last_request_time": "2024-01-01T12:00:00"
# }

# 重置统计
api.reset_stats()
```

### 4. 熔断器保护

防止连续失败拖垮系统：

```python
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key"
)

# 熔断器自动工作：
# - 连续失败 5 次后打开熔断器
# - 熔断器打开后拒绝请求 5 分钟
# - 5 分钟后自动尝试恢复

# 健康检查
health = api.health_check()
print(health)
# 输出：
# {
#   "status": "healthy",
#   "timestamp": "2024-01-01T12:00:00",
#   "checks": {
#     "network": {"status": "ok", "latency_ms": 123.45},
#     "cache": {"status": "ok", "size": 50, "max_size": 1000},
#     "circuit_breaker": {"status": "closed", "failure_count": 0}
#   },
#   "stats": {...}
# }
```

### 5. 降级策略

当 API 不可用时使用备用方案：

```python
# 定义降级函数
def fallback_func(method, endpoint, params, data):
    """当 API 不可用时的降级处理"""
    logging.warning(f"API 降级：{method} {endpoint}")
    
    # 返回模拟数据或从本地缓存读取
    if endpoint == "/list_common_dp":
        return {
            "code": 0,
            "msg": "降级模式",
            "data": {
                "list": [...],  # 本地缓存的数字人列表
                "page_info": {...}
            }
        }
    
    return {"code": -1, "msg": "服务暂时不可用", "data": None}

api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    fallback_enabled=True,
    fallback_func=fallback_func
)
```

### 6. 批量操作

高效批量获取数据：

```python
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key"
)

# 批量获取视频状态（并发 5 个请求）
video_ids = ["vid_001", "vid_002", "vid_003", ...]
results = api.batch_get_video_status(video_ids, concurrency=5)

for video_id, status in results.items():
    print(f"{video_id}: {status['data']['status']}")
```

## 快速开始

### 1. 基础使用（三种模式）

#### 模式 1：自动认证（🆕 推荐 - 优先从 Docker 环境变量读取）

```python
from chanjing_api_v2 import create_chanjing_api_v2

# 自动获取认证信息，优先级：
# 1. Docker 环境变量：CHANJING_APP_ID 和 CHANJING_SECRET_KEY（推荐）
# 2. 本地 API 服务：/api/auth/chanjing 接口
# 3. 配置文件：.env 中的 CHANJING_APP_ID 和 CHANJING_SECRET_KEY
api = create_chanjing_api_v2()

# 自定义配置
api = create_chanjing_api_v2(
    config={
        "base_url": "http://192.168.166.151:8080",
        "timeout": 60,
        "max_retries": 5,
    }
)
```

**Docker 环境变量设置：**
```bash
# 在 Docker 容器或宿主机环境变量中设置
export CHANJING_APP_ID="your_app_id"
export CHANJING_SECRET_KEY="your_secret_key"

# 或在 docker-compose.yml 中
environment:
  - CHANJING_APP_ID=your_app_id
  - CHANJING_SECRET_KEY=your_secret_key
```

#### 模式 2：传统模式（兼容 V1）

```python
# 手动提供 app_id 和 secret_key（与 V1 完全兼容）
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key"
)

# 或自定义 API 地址
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    config={
        "base_url": "http://192.168.166.151:8080"  # 本地 API 服务
    }
)
```

#### 模式 3：混合模式

```python
# 提供 app_id 和 secret_key，但关闭自动认证
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    config={
        "auto_auth": False,  # 不自动获取认证
    }
)
```

# 获取数字人列表
persons_resp = api.list_common_digital_persons(page=1, size=10)
persons = persons_resp["data"]["list"]

# 创建视频
video_resp = api.create_video(
    digital_person_id="dp_001",
    text="你好，世界！"
)
video_id = video_resp["data"]["id"]

# 查询状态
status_resp = api.get_video_status(video_id)
print(f"进度：{status_resp['data']['progress']}%")
```

### 2. 高级配置

```python
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    
    # 网络配置
    timeout=60,          # 请求超时 60 秒
    max_retries=5,       # 最多重试 5 次
    
    # 缓存配置
    enable_cache=True,
    cache_max_size=2000, # 缓存 2000 条数据
    
    # 监控配置
    enable_stats=True,
    
    # 降级配置
    fallback_enabled=False,
)
```

### 3. 错误处理

```python
from chanjing_api_v2 import APIError, APIErrorType

try:
    resp = api.create_video(
        digital_person_id="dp_001",
        text="你好"
    )
except APIError as e:
    if e.error_type == APIErrorType.RATE_LIMIT_ERROR:
        print(f"频率限制，{e.retry_after}秒后重试")
    elif e.error_type == APIErrorType.AUTH_ERROR:
        print("认证失败，请检查 app_id 和 secret_key")
    elif e.is_retryable():
        print(f"临时错误，可重试：{e.message}")
    else:
        print(f"不可恢复错误：{e.message}")
except Exception as e:
    print(f"未知错误：{e}")
```

## 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `app_id` | str | - | 蝉镜应用 ID |
| `secret_key` | str | - | 蝉镜密钥 |
| `base_url` | str | 默认 URL | API 基础 URL |
| `timeout` | int | 30 | 请求超时时间（秒） |
| `max_retries` | int | 3 | 最大重试次数 |
| `enable_cache` | bool | True | 是否启用缓存 |
| `cache_max_size` | int | 1000 | 缓存最大条目数 |
| `enable_stats` | bool | True | 是否启用统计 |
| `fallback_enabled` | bool | False | 是否启用降级 |
| `fallback_func` | Callable | None | 降级函数 |

## 性能优化建议

### 1. 合理使用缓存

```python
# ✅ 好的做法：频繁读取的数据使用缓存
persons = api.list_common_digital_persons(use_cache=True)

# ✅ 好的做法：实时性要求高的数据不使用缓存
status = api.get_video_status(video_id)  # 不缓存

# ❌ 不好的做法：频繁调用不使用缓存
for i in range(10):
    persons = api.list_common_digital_persons(use_cache=False)  # 浪费
```

### 2. 批量操作

```python
# ✅ 好的做法：批量获取
video_ids = ["vid_001", "vid_002", ...]
results = api.batch_get_video_status(video_ids, concurrency=5)

# ❌ 不好的做法：逐个获取
for video_id in video_ids:
    status = api.get_video_status(video_id)  # 慢
```

### 3. 监控和告警

```python
# 定期检查健康状态
def check_api_health():
    health = api.health_check()
    
    if health["status"] != "healthy":
        send_alert("API 不健康")
    
    stats = health.get("stats", {})
    if stats.get("success_rate", 100) < 90:
        send_alert("API 成功率低于 90%")
    
    if health["checks"]["circuit_breaker"]["status"] == "open":
        send_alert("API 熔断器已打开")
```

## 从 V1 迁移到 V2

### 方式 1：直接替换导入

```python
# V1
from chanjing_api import ChanjingAPI
api = ChanjingAPI(app_id, secret_key)

# V2（完全兼容）
from chanjing_api_v2 import ChanjingAPIV2
api = ChanjingAPIV2(app_id, secret_key)
```

### 方式 2：使用工厂函数（推荐）

```python
# V2
from chanjing_api_v2 import create_chanjing_api_v2
api = create_chanjing_api_v2(app_id, secret_key)
```

### 方式 3：渐进式迁移

```python
# 在配置中控制是否使用 V2
USE_V2 = True

if USE_V2:
    from chanjing_api_v2 import create_chanjing_api_v2
    api = create_chanjing_api_v2(app_id, secret_key)
else:
    from chanjing_api import ChanjingAPI
    api = ChanjingAPI(app_id, secret_key)
```

## 故障排查

### 1. 查看请求日志

```python
import logging

# 启用调试日志
logging.getLogger("chanjing_v2.requests").setLevel(logging.DEBUG)

# 查看缓存日志
logging.getLogger("chanjing_v2.cache").setLevel(logging.DEBUG)
```

### 2. 检查统计信息

```python
stats = api.get_stats()
print(f"成功率：{stats['success_rate']}")
print(f"平均延迟：{stats['avg_latency_ms']}")
print(f"失败次数：{stats['failed_requests']}")
```

### 3. 健康检查

```python
health = api.health_check()
if health["status"] != "healthy":
    print("API 不健康:")
    for check_name, check_result in health["checks"].items():
        if check_result["status"] != "ok":
            print(f"  - {check_name}: {check_result}")
```

## 最佳实践

### 1. 单例模式

```python
# 在应用启动时创建全局 API 实例
_api_instance = None

def get_api():
    global _api_instance
    if _api_instance is None:
        _api_instance = create_chanjing_api_v2(
            app_id=settings.CHANJING_APP_ID,
            secret_key=settings.CHANJING_SECRET_KEY,
            enable_cache=True,
            enable_stats=True
        )
    return _api_instance
```

### 2. 优雅降级

```python
def create_video_with_fallback(person_id, text):
    api = get_api()
    
    try:
        resp = api.create_video(digital_person_id=person_id, text=text)
        return resp["data"]["id"]
    except APIError as e:
        if not e.is_retryable():
            raise
        
        # 降级：记录任务，稍后重试
        log_pending_task(person_id, text)
        return None  # 或返回排队 ID
```

### 3. 监控告警

```python
# 在定时任务中检查 API 健康
def api_health_monitor():
    api = get_api()
    health = api.health_check()
    
    # 发送监控指标
    metrics.send("api.success_rate", health["stats"]["success_rate"])
    metrics.send("api.avg_latency", health["stats"]["avg_latency_ms"])
    metrics.send("api.circuit_breaker", 1 if health["checks"]["circuit_breaker"]["status"] == "open" else 0)
    
    # 告警
    if float(health["stats"]["success_rate"].rstrip("%")) < 90:
        alert.send("API 成功率低于 90%")
```

## 许可证

- V1: MIT License
- V2: MIT License（完全兼容 V1）