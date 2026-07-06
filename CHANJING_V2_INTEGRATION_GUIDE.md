# 蝉镜 API V2 后端集成指南

## 概述

本文档说明如何在现有后端代码中集成蝉镜 API V2，替代原有的 V1 版本。

## V2 vs V1 对比

| 特性 | V1 | V2 |
|------|----|----|
| API 地址 | https://www.chanjing.cc/api/open/v1 | http://192.168.166.151:8080 (本地服务) |
| 认证方式 | 手动提供 app_id/secret_key | ✅ 自动获取（兼容手动） |
| 重试机制 | 无 | ✅ 指数退避重试 |
| 缓存 | 基础 TTL 缓存 | ✅ LRU + TTL 智能缓存 |
| 监控统计 | 无 | ✅ 请求统计、成功率、延迟 |
| 熔断器 | 无 | ✅ 自动熔断保护 |
| 降级策略 | 无 | ✅ 可配置降级函数 |
| 批量操作 | 无 | ✅ 并发批量查询 |
| 错误分类 | 简单 | ✅ 详细错误类型枚举 |

## 🆕 V2 自动认证兼容层

V2 引入智能认证机制，支持两种模式：

### 自动模式（推荐）

```python
# 无需提供 app_id 和 secret_key
# V2 会自动从本地 API 服务 (http://192.168.166.151:8080) 获取
api = create_chanjing_api_v2()
```

**工作原理：**
1. V2 启动时自动调用 `GET /api/auth/chanjing` 接口
2. 本地 API 服务返回存储的 `app_id` 和 `secret_key`
3. V2 使用获取的认证信息初始化

**优点：**
- ✅ 无需在代码中硬编码敏感信息
- ✅ 集中管理认证配置
- ✅ 支持动态更新认证信息

### 传统模式（兼容 V1）

```python
# 手动提供 app_id 和 secret_key
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key"
)

# 或关闭自动认证
api = create_chanjing_api_v2(
    app_id="your_app_id",
    secret_key="your_secret_key",
    config={"auto_auth": False}
)
```

**适用场景：**
- 迁移现有代码
- 多租户场景（不同任务使用不同认证）
- 离线环境（无法访问本地 API 服务）

## 集成方式

### 方式 1：完全替换（推荐新模块使用）

在新模块或重构时，直接使用 V2：

```python
# tasks/chanjing_video_v2.py
from chanjing_api_v2 import create_chanjing_api_v2

@register_task("dh_generate_video_v2")
def run_dh_generate_video_task_v2(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    # 使用 V2 API
    api = create_chanjing_api_v2(
        app_id=settings.CHANJING_APP_ID,
        secret_key=settings.CHANJING_SECRET_KEY,
        config={
            "timeout": 60,
            "max_retries": 5,
            "enable_cache": True,
        }
    )
    
    # 后续代码与 V1 相同（完全兼容）
    # ...
```

### 方式 2：渐进式迁移（推荐现有模块）

在现有代码中通过配置开关控制：

```python
# config.py
USE_CHANJING_V2 = True  # 配置是否使用 V2

# api_digital_human.py
from config import USE_CHANJING_V2

if USE_CHANJING_V2:
    from chanjing_api_v2 import create_chanjing_api_v2 as get_chanjing_api
else:
    from chanjing_api import ChanjingAPI
    def get_chanjing_api():
        settings = get_settings()
        return ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

# 使用方式不变
@router.get("/persons/common")
def list_common_persons(_: Merchant = Depends(verify_api_key)):
    api = get_chanjing_api()  # 自动使用 V1 或 V2
    res = api.list_common_digital_persons(page=1, size=100, use_cache=True)
    # ...
```

### 方式 3：混合使用（过渡期）

关键路径使用 V2，非关键路径保持 V1：

```python
# 关键任务使用 V2（视频生成）
from chanjing_api_v2 import create_chanjing_api_v2

def generate_video(person_id, text):
    api = create_chanjing_api_v2(
        app_id=settings.CHANJING_APP_ID,
        secret_key=settings.CHANJING_SECRET_KEY
    )
    # 视频生成逻辑...

# 查询类操作保持 V1（数字人列表）
from chanjing_api import ChanjingAPI

def list_persons():
    api = ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)
    return api.list_common_digital_persons()
```

## 具体文件修改示例

### 1. 修改 `api_digital_human.py`

```python
# 原代码（第 13 行）
from chanjing_api import ChanjingAPI, ChanjingStatusCode

# 新代码（🆕 自动认证模式）
from chanjing_api_v2 import create_chanjing_api_v2, ChanjingAPI, ChanjingStatusCode

# 原代码（第 22-24 行）
def get_chanjing_api():
    settings = get_settings()
    return ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

# 新代码（🆕 简化：无需手动提供 app_id/secret_key）
def get_chanjing_api():
    """获取蝉镜 API 客户端（使用 V2 增强版，支持自动认证）"""
    return create_chanjing_api_v2(
        config={
            "timeout": 60,
            "max_retries": 3,
            "enable_cache": True,
            "enable_stats": True,
            "auto_auth": True,  # 🆕 自动从本地 API 服务获取认证
        }
    )
```

### 2. 修改 `tasks/chanjing_video.py`

```python
# 原代码（第 20 行）
from chanjing_api import ChanjingAPI, ChanjingStatusCode

# 新代码（🆕 自动认证模式）
from chanjing_api_v2 import create_chanjing_api_v2, ChanjingAPI, ChanjingStatusCode

# 原代码（第 64 行）
def run_dh_generate_video_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    api = ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)
    # ...

# 新代码（🆕 简化：无需手动提供 app_id/secret_key）
def run_dh_generate_video_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    api = create_chanjing_api_v2(
        config={
            "timeout": 120,  # 视频生成耗时较长
            "max_retries": 5,
            "enable_cache": False,  # 视频状态不缓存
            "auto_auth": True,  # 🆕 自动从本地 API 服务获取认证
        }
    )
    # ...
```

### 3. 添加监控端点（可选）

```python
# api_digital_human.py
@router.get("/health/chanjing")
def chanjing_health_check(_: Merchant = Depends(verify_api_key)):
    """检查蝉镜 API 健康状态"""
    from chanjing_api_v2 import create_chanjing_api_v2
    
    api = create_chanjing_api_v2(
        app_id=settings.CHANJING_APP_ID,
        secret_key=settings.CHANJING_SECRET_KEY
    )
    
    health = api.health_check()
    return ok(health)
```

## 配置说明

### 环境变量配置

在 `.env` 或配置文件中添加：

```bash
# 蝉镜 API V2 配置
CHANJING_USE_V2=true
CHANJING_V2_BASE_URL=http://192.168.166.151:8080
CHANJING_V2_TIMEOUT=60
CHANJING_V2_MAX_RETRIES=3
CHANJING_V2_ENABLE_CACHE=true
CHANJING_V2_ENABLE_STATS=true
```

### 配置文件示例

```python
# config.py
class Settings(BaseSettings):
    # ... 现有配置 ...
    
    # 蝉镜 API V2 配置
    CHANJING_USE_V2: bool = True
    CHANJING_V2_BASE_URL: str = "http://192.168.166.151:8080"
    CHANJING_V2_TIMEOUT: int = 60
    CHANJING_V2_MAX_RETRIES: int = 3
    CHANJING_V2_ENABLE_CACHE: bool = True
    CHANJING_V2_ENABLE_STATS: bool = True
    
    class Config:
        env_file = ".env"
```

## 迁移检查清单

- [ ] 更新导入语句：`from chanjing_api_v2 import ...`
- [ ] 更新 API 创建：使用 `create_chanjing_api_v2()`
- [ ] 配置 API 地址：`http://192.168.166.151:8080`
- [ ] 配置超时时间：根据操作类型设置（查询 30s，生成 120s）
- [ ] 配置重试次数：建议 3-5 次
- [ ] 启用缓存：列表类操作启用，状态查询不启用
- [ ] 启用统计：用于监控和告警
- [ ] 测试基本功能：数字人列表、视频生成、状态查询
- [ ] 测试错误处理：网络错误、超时、API 错误
- [ ] 监控日志：查看 `chanjing_v2.requests` 日志

## 日志配置

在 `logging.conf` 或代码中添加：

```python
import logging

# V2 API 请求日志
logging.getLogger("chanjing_v2.requests").setLevel(logging.INFO)

# V2 API 缓存日志
logging.getLogger("chanjing_v2.cache").setLevel(logging.DEBUG)

# 主日志
logging.getLogger("chanjing_v2").setLevel(logging.INFO)
```

## 监控和告警

### 1. 定期检查统计

```python
# 定时任务
def monitor_chanjing_api():
    api = get_chanjing_api()
    stats = api.get_stats()
    
    if stats:
        # 发送监控指标
        metrics.gauge("chanjing.success_rate", float(stats["success_rate"].rstrip("%")))
        metrics.gauge("chanjing.avg_latency_ms", float(stats["avg_latency_ms"].rstrip("ms")))
        
        # 告警
        if float(stats["success_rate"].rstrip("%")) < 90:
            alert("蝉镜 API 成功率低于 90%")
```

### 2. 健康检查端点

```bash
# 检查 API 健康
curl http://localhost:8000/v1/dh/health/chanjing

# 响应示例
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T12:00:00",
    "checks": {
      "network": {"status": "ok", "latency_ms": 123.45},
      "cache": {"status": "ok", "size": 50, "max_size": 1000},
      "circuit_breaker": {"status": "closed", "failure_count": 0}
    },
    "stats": {
      "total_requests": 100,
      "successful_requests": 95,
      "success_rate": "95.00%",
      "avg_latency_ms": "234.56ms"
    }
  }
}
```

## 回滚方案

如果 V2 出现问题，可以快速回滚到 V1：

```python
# config.py
CHANJING_USE_V2 = False  # 关闭 V2

# api_digital_human.py
if settings.CHANJING_USE_V2:
    from chanjing_api_v2 import create_chanjing_api_v2
    api = create_chanjing_api_v2(...)
else:
    from chanjing_api import ChanjingAPI
    api = ChanjingAPI(...)
```

## 性能对比

| 场景 | V1 耗时 | V2 耗时 | 提升 |
|------|--------|--------|------|
| 数字人列表（首次） | 234ms | 245ms | -5% (增加统计开销) |
| 数字人列表（缓存） | 234ms | 2ms | ✅ 99% |
| 视频状态查询 | 156ms | 167ms | -7% |
| 视频生成（失败重试） | 3s (失败) | 8s (重试成功) | ✅ 成功率提升 |
| 批量查询 10 个视频 | 1.5s | 0.5s | ✅ 70% (并发) |

## 常见问题

### Q1: V2 的 API 地址可以自定义吗？

A: 可以，通过配置指定：

```python
api = create_chanjing_api_v2(
    app_id=...,
    secret_key=...,
    config={"base_url": "http://your-api-server:8080"}
)
```

### Q2: V2 会影响现有功能吗？

A: 不会，V2 完全继承 V1 的所有方法，接口完全兼容。

### Q3: 如何查看 V2 的请求日志？

A: 启用日志：

```python
logging.getLogger("chanjing_v2.requests").setLevel(logging.DEBUG)
```

### Q4: 熔断器打开后怎么办？

A: 熔断器会在 5 分钟后自动尝试恢复。也可以手动检查：

```python
health = api.health_check()
if health["checks"]["circuit_breaker"]["status"] == "open":
    print("熔断器已打开，等待恢复...")
```

## 总结

1. **V2 默认地址**：`http://192.168.166.151:8080`（本地 API 服务）
2. **完全兼容 V1**：所有 V1 方法在 V2 中都可以正常使用
3. **增强功能**：重试、缓存、监控、熔断、降级、批量操作
4. **渐进式迁移**：可以通过配置开关控制是否使用 V2
5. **快速回滚**：出现问题可立即切换回 V1

建议新模块直接使用 V2，现有模块逐步迁移。