# apps/digital_human/chanjing_api_v2.py
# 蝉镜 API V2 客户端 - 增强稳定性版本（独立实现，无 V1 依赖）
# 支持：指数退避重试、智能缓存、请求统计、熔断器、降级策略

import requests
import json
import time
import os
import logging
import hashlib
import random
from typing import Dict, Any, List, Union, Optional, Callable
from functools import wraps
import threading
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from enum import Enum
import urllib.parse
import ipaddress

import requests as requests_lib


def _require_public_url(url: str | None, name: str, allow_private: bool = False) -> str:
    """只允许可配置的公网 URL，拒绝空值和明显内网地址。"""
    raw_url = (url or "").strip()
    if not raw_url:
        raise ValueError(f"{name} 未配置（请设置可公网访问的 URL）")

    parsed = urllib.parse.urlparse(raw_url if "://" in raw_url else f"//{raw_url}")
    host = (parsed.hostname or "").strip().lower()
    if not host:
        raise ValueError(f"{name} 地址格式无效：{raw_url}")

    try:
        host_ip = ipaddress.ip_address(host)
    except ValueError:
        host_ip = None

    if (
        host in {"localhost", "127.0.0.1"}
        or (host_ip is not None and (host_ip.is_private or host_ip.is_loopback))
    ):
        if allow_private:
            return raw_url.rstrip("/")
        raise ValueError(f"{name} 当前为内网/回环地址，不允许用于公网访问：{raw_url}")

    return raw_url.rstrip("/")


def _allow_private_address() -> bool:
    return os.getenv("ALLOW_PRIVATE_CHANJING", "").lower() in {"1", "true", "yes", "on", "y"}


# ============================================================
# 错误处理
# ============================================================

class ChanjingStatusCode:
    """
    蝉镜 API 状态码（兼容层）
    
    保持与旧版本的兼容性，提供状态码判断和消息获取方法
    """
    SUCCESS = 0
    SYSTEM_ERROR = 500
    PARAM_ERROR = 400
    AUTH_ERROR = 401
    ACCESS_TOKEN_ERROR = 10001
    QUOTA_ERROR = 402
    RATE_LIMIT_ERROR = 429
    
    # 状态码消息映射
    _MSG_MAP = {
        0: "成功",
        400: "参数错误",
        401: "认证失败",
        10001: "授权凭证无效或已过期",
        402: "配额不足",
        429: "请求过于频繁",
        500: "系统错误",
    }
    
    @classmethod
    def is_success(cls, code: Optional[int]) -> bool:
        """判断是否成功"""
        return code == cls.SUCCESS or code is None
    
    @classmethod
    def get_msg(cls, code: Optional[int], default: str = "未知错误") -> str:
        """获取状态码对应的消息"""
        if code is None:
            return "成功"
        return cls._MSG_MAP.get(code, default)


class APIErrorType(Enum):
    """API 错误类型枚举"""
    NETWORK_ERROR = "network_error"           # 网络错误
    TIMEOUT_ERROR = "timeout_error"           # 超时错误
    RATE_LIMIT_ERROR = "rate_limit_error"     # 频率限制
    AUTH_ERROR = "auth_error"                 # 认证错误
    PARAM_ERROR = "param_error"               # 参数错误
    SERVER_ERROR = "server_error"             # 服务器错误
    UNKNOWN_ERROR = "unknown_error"           # 未知错误


@dataclass
class APIError(Exception):
    """增强的 API 错误信息"""
    code: int
    message: str
    error_type: APIErrorType
    endpoint: str
    retry_after: Optional[int] = None  # 建议重试时间（秒）
    original_response: Optional[Dict] = None

    def __str__(self) -> str:
        """让日志和上层接口能看到真正的错误，而不是空字符串。"""
        details = self.message or "未知错误"
        return f"{details} (code={self.code}, endpoint={self.endpoint})"
    
    def is_retryable(self) -> bool:
        """判断是否可重试"""
        return self.error_type in [
            APIErrorType.NETWORK_ERROR,
            APIErrorType.TIMEOUT_ERROR,
            APIErrorType.SERVER_ERROR,
            APIErrorType.RATE_LIMIT_ERROR
        ]


# ============================================================
# 指数退避重试装饰器
# ============================================================

def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retryable_errors: Optional[List[APIErrorType]] = None
):
    """
    指数退避重试装饰器
    
    Args:
        max_retries: 最大重试次数
        base_delay: 基础延迟时间（秒）
        max_delay: 最大延迟时间（秒）
        exponential_base: 指数基数
        jitter: 是否添加随机抖动
        retryable_errors: 可重试的错误类型列表
    """
    if retryable_errors is None:
        retryable_errors = [
            APIErrorType.NETWORK_ERROR,
            APIErrorType.TIMEOUT_ERROR,
            APIErrorType.SERVER_ERROR
        ]
    
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except APIError as e:
                    last_error = e
                    
                    # 检查是否可重试
                    if attempt < max_retries and e.is_retryable() and e.error_type in retryable_errors:
                        # 计算延迟时间（指数退避 + 随机抖动）
                        delay = min(base_delay * (exponential_base ** attempt), max_delay)
                        if jitter:
                            delay = delay * (0.5 + random.random())
                        
                        # 如果 API 返回了 retry_after，优先使用
                        if e.retry_after:
                            delay = max(delay, e.retry_after)
                        
                        logging.getLogger("chanjing_v2").info(
                            f"API 调用失败，{delay:.1f}秒后重试 ({attempt + 1}/{max_retries}): {e.message}"
                        )
                        time.sleep(delay)
                    else:
                        raise
                except requests.exceptions.RequestException as e:
                    last_error = APIError(
                        code=-1,
                        message=str(e),
                        error_type=APIErrorType.NETWORK_ERROR,
                        endpoint=func.__name__
                    )
                    
                    if attempt < max_retries:
                        delay = min(base_delay * (exponential_base ** attempt), max_delay)
                        if jitter:
                            delay = delay * (0.5 + random.random())
                        
                        logging.getLogger("chanjing_v2").info(
                            f"网络错误，{delay:.1f}秒后重试 ({attempt + 1}/{max_retries}): {e}"
                        )
                        time.sleep(delay)
                    else:
                        raise last_error
            
            # 所有重试都失败
            if last_error:
                raise last_error
            raise APIError(
                code=-1,
                message="未知错误",
                error_type=APIErrorType.UNKNOWN_ERROR,
                endpoint=func.__name__
            )
        
        return wrapper
    return decorator


# ============================================================
# 请求统计和监控
# ============================================================

@dataclass
class RequestStats:
    """请求统计信息"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    retried_requests: int = 0
    total_latency: float = 0.0
    last_request_time: Optional[datetime] = None
    
    def avg_latency(self) -> float:
        """计算平均延迟"""
        if self.successful_requests == 0:
            return 0.0
        return self.total_latency / self.successful_requests
    
    def success_rate(self) -> float:
        """计算成功率"""
        if self.total_requests == 0:
            return 0.0
        return self.successful_requests / self.total_requests * 100


# ============================================================
# 智能缓存（支持 TTL 和 LRU）
# ============================================================

@dataclass
class CacheEntry:
    """缓存条目"""
    data: Any
    created_at: float
    ttl: int  # 生存时间（秒）
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)
    
    def is_expired(self) -> bool:
        """检查是否过期"""
        return time.time() > self.created_at + self.ttl
    
    def access(self):
        """记录访问"""
        self.access_count += 1
        self.last_accessed = time.time()


class SmartCache:
    """智能缓存类，支持 TTL 和 LRU 淘汰"""
    
    def __init__(self, max_size: int = 1000):
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = threading.Lock()
        self._max_size = max_size
        self._logger = logging.getLogger("chanjing_v2.cache")
    
    def get(self, key: str) -> Optional[Any]:
        """获取缓存数据"""
        with self._lock:
            if key not in self._cache:
                return None
            
            entry = self._cache[key]
            if entry.is_expired():
                del self._cache[key]
                self._logger.debug(f"缓存过期：{key}")
                return None
            
            entry.access()
            self._logger.debug(f"缓存命中：{key} (访问次数：{entry.access_count})")
            return entry.data
    
    def set(self, key: str, data: Any, ttl: int = 300):
        """设置缓存数据"""
        with self._lock:
            # 如果缓存已满，淘汰最少使用的条目
            if len(self._cache) >= self._max_size:
                self._evict_lru()
            
            self._cache[key] = CacheEntry(
                data=data,
                created_at=time.time(),
                ttl=ttl
            )
            self._logger.debug(f"缓存设置：{key}, TTL={ttl}s")
    
    def delete(self, key: str):
        """删除缓存"""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                self._logger.debug(f"缓存删除：{key}")
    
    def clear(self, prefix: Optional[str] = None):
        """清除缓存，支持按前缀清除"""
        with self._lock:
            if prefix:
                keys_to_delete = [k for k in self._cache.keys() if k.startswith(prefix)]
                for k in keys_to_delete:
                    del self._cache[k]
                self._logger.info(f"清除缓存：{prefix}*, 共 {len(keys_to_delete)} 个")
            else:
                count = len(self._cache)
                self._cache.clear()
                self._logger.info(f"清除所有缓存，共 {count} 个")
    
    def _evict_lru(self):
        """淘汰最少使用的条目"""
        if not self._cache:
            return
        
        # 找到最少使用的条目
        lru_key = min(self._cache.keys(), key=lambda k: self._cache[k].last_accessed)
        del self._cache[lru_key]
        self._logger.debug(f"LRU 淘汰：{lru_key}")


# ============================================================
# 蝉镜 API V2 客户端（独立实现）
# ============================================================

class ChanjingAPIV2:
    """
    蝉镜 API V2 客户端 - 增强稳定性版本（独立实现，无 V1 依赖）
    
    功能特性：
    1. 指数退避重试机制
    2. 智能缓存（LRU + TTL）
    3. 请求统计和监控
    4. 更详细的错误分类
    5. 请求日志记录
    6. 降级策略支持
    7. 自动 Token 管理
    """
    
    # API 端点常量
    ENDPOINT_ACCESS_TOKEN = "/access_token"
    ENDPOINT_COMMON_PERSONS = "/list_common_dp"                    # ✅ 公共数字人列表
    ENDPOINT_COMMON_AUDIO = "/list_common_audio"                   # ✅ 公共声音列表
    ENDPOINT_CUSTOM_PERSONS = "/list_customised_person_v2"         # 自定义数字人列表（磁盘持久化兼容）
    ENDPOINT_CUSTOM_PERSON_STATUS = "/customised_person/detail"    # ✅ 自定义数字人详情
    ENDPOINT_VIDEO_STATUS = "/video"                               # ✅ 视频状态
    ENDPOINT_CREATE_VIDEO = "/create_video"
    ENDPOINT_DELETE_VIDEO = "/delete_video"
    ENDPOINT_DELETE_FILE = "/common/delete_file"
    ENDPOINT_FILE_DETAIL = "/common/file_detail"
    ENDPOINT_CREATE_CUSTOMISED_AUDIO = "/create_customised_audio"
    ENDPOINT_CUSTOMISED_AUDIO_DETAIL = "/customised_audio"
    ENDPOINT_DELETE_CUSTOMISED_AUDIO = "/delete_customised_audio"
    
    def __init__(
        self,
        app_id: Optional[str] = None,
        secret_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: int = 30,
        max_retries: int = 3,
        enable_cache: bool = True,
        cache_max_size: int = 1000,
        enable_stats: bool = True,
        fallback_enabled: bool = False,
        fallback_func: Optional[Callable] = None,
        auto_auth: bool = True  # 🆕 自动获取 token 和 app_id
    ):
        """
        初始化 V2 API 客户端
        
        Args:
            app_id: 应用 ID（可选，如果为 None 则自动获取）
            secret_key: 密钥（可选，如果为 None 则自动获取）
            base_url: API 基础 URL（建议使用公网地址）
            timeout: 请求超时时间（秒）
            max_retries: 最大重试次数
            enable_cache: 是否启用缓存
            cache_max_size: 缓存最大条目数
            enable_stats: 是否启用统计
            fallback_enabled: 是否启用降级
            fallback_func: 降级函数
            auto_auth: 是否自动获取认证信息（兼容层，默认 True）
        
        🆕 兼容层说明：
            - 如果提供 app_id 和 secret_key：使用传统模式
            - 如果不提供：自动从环境变量或配置文件获取
        """
        # 🆕 先初始化基础配置（在自动认证之前）
        # 优先使用传入的 base_url，其次从环境变量读取
        self.base_url = _require_public_url(
            base_url if base_url else os.getenv("CHANJING_BASE_URL", ""),
            "CHANJING_BASE_URL",
            allow_private=_allow_private_address(),
        )
        self.timeout = timeout
        self.auto_auth = auto_auth
        
        # 🆕 先初始化 logger（在自动认证之前使用）
        self._request_logger = logging.getLogger("chanjing_v2.requests")
        
        # 🆕 兼容层：自动获取认证信息（优先从 Docker 环境变量读取）
        if auto_auth and (not app_id or not secret_key):
            # 1️⃣ 优先从 Docker 环境变量读取（推荐方式）
            app_id = app_id or os.getenv("CHANJING_APP_ID")
            secret_key = secret_key or os.getenv("CHANJING_SECRET_KEY")
            
            if app_id and secret_key:
                self._request_logger.info("✅ 从 Docker 环境变量获取蝉镜认证信息")
            else:
                # 2️⃣ 如果环境变量没有，尝试从本地 API 服务获取
                app_id, secret_key = self._auto_get_auth_info(self.base_url, timeout)
                
                if app_id and secret_key:
                    self._request_logger.info("✅ 从本地 API 服务获取蝉镜认证信息")
                else:
                    # 3️⃣ 最后尝试从配置文件读取
                    try:
                        from config import get_settings
                        settings = get_settings()
                        app_id = app_id or settings.CHANJING_APP_ID
                        secret_key = secret_key or settings.CHANJING_SECRET_KEY
                        
                        if app_id and secret_key:
                            self._request_logger.info("✅ 从配置文件获取蝉镜认证信息")
                    except Exception as e:
                        self._request_logger.warning(f"⚠️ 无法从配置文件获取认证信息：{e}")
        
        # 确保有 app_id 和 secret_key
        if not app_id or not secret_key:
            raise ValueError(
                "必须提供 app_id 和 secret_key，可通过以下方式之一：\n"
                "1. 设置 Docker 环境变量：CHANJING_APP_ID 和 CHANJING_SECRET_KEY（推荐）\n"
                "2. 启用 auto_auth 并确保本地 API 服务提供 /api/auth/chanjing 接口\n"
                "3. 在配置文件 (.env) 中设置 CHANJING_APP_ID 和 CHANJING_SECRET_KEY\n"
                "4. 直接在代码中传入 app_id 和 secret_key 参数"
            )
        
        # 保存认证信息
        self.app_id = app_id
        self.secret_key = secret_key
        self._request_logger.info(f"✅ 认证信息已设置：app_id={app_id}")
        
        # V2 新增配置
        self.max_retries = max_retries
        self.enable_stats = enable_stats
        self.fallback_enabled = fallback_enabled
        self.fallback_func = fallback_func
        
        # V2 新增：智能缓存
        self._cache_v2 = SmartCache(max_size=cache_max_size) if enable_cache else None
        
        # V2 新增：请求统计
        self._stats = RequestStats() if enable_stats else None
        
        # V2 新增：降级开关
        self._circuit_breaker_open = False
        self._circuit_breaker_failures = 0
        self._circuit_breaker_threshold = 5
        self._circuit_breaker_reset_time = timedelta(minutes=5)
        self._last_failure_time: Optional[datetime] = None
        
        # Token 缓存
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[datetime] = None
        
        # 🔵 初始化时记录网络配置信息
        self._request_logger.info(f"🔵 [网络诊断] ChanjingAPIV2 初始化完成")
        self._request_logger.info(f"🔵 [网络诊断] base_url={self.base_url}")
        self._request_logger.info(f"🔵 [网络诊断] app_id={self.app_id}")
        self._request_logger.info(f"🔵 [网络诊断] timeout={self.timeout}s, max_retries={self.max_retries}")
        self._request_logger.info(f"🔵 [网络诊断] 使用已配置的蝉镜服务地址: {self.base_url}")
    
    # ============================================================
    # 🆕 V2 新增：自动认证兼容层
    # ============================================================
    
    def _auto_get_auth_info(self, base_url: Optional[str], timeout: int) -> tuple:
        """
        🆕 自动从本地 API 服务获取 app_id 和 secret_key
        
        兼容层设计：
        - 如果本地 API 服务可用，自动获取认证信息
        - 如果不可用，返回 (None, None)，由调用方处理
        
        Args:
            base_url: API 服务地址
            timeout: 超时时间
        
        Returns:
            (app_id, secret_key) 元组，如果获取失败则返回 (None, None)
        """
        try:
            url = _require_public_url(
                base_url,
                "base_url",
                allow_private=_allow_private_address(),
            )
            
            # 尝试从本地 API 服务获取认证信息
            # 假设本地服务提供 /api/auth/chanjing 接口返回认证信息
            response = requests_lib.get(
                f"{url}/api/auth/chanjing",
                timeout=min(timeout, 5)  # 认证请求使用较短超时
            )
            
            if response.status_code == 200:
                data = response.json()
                app_id = data.get("app_id")
                secret_key = data.get("secret_key")
                
                if app_id and secret_key:
                    self._request_logger.info("✅ 自动获取蝉镜认证信息成功")
                    return app_id, secret_key
            
            self._request_logger.warning("⚠️ 本地 API 服务未返回认证信息，将使用传统模式")
            return None, None
            
        except Exception as e:
            self._request_logger.warning(f"⚠️ 自动获取认证信息失败：{e}，将使用传统模式")
            return None, None
    
    # ============================================================
    # Token 管理
    # ============================================================
    
    def _get_access_token(self) -> str:
        """
        获取访问令牌（带缓存）
        
        Returns:
            访问令牌字符串
        """
        # 检查缓存的 token 是否有效
        if self._access_token and self._token_expires_at:
            if datetime.now() < self._token_expires_at:
                self._request_logger.debug("使用缓存的 access_token")
                return self._access_token
        
        # 获取新的 token
        self._request_logger.info(f"🔵 正在获取新的 access_token，base_url={self.base_url}")
        self._request_logger.info(f"🔵 网络诊断：尝试连接 {self.base_url}{self.ENDPOINT_ACCESS_TOKEN}")
        try:
            self._request_logger.info(f"🔵 请求详情：POST {self.base_url}{self.ENDPOINT_ACCESS_TOKEN} app_id={self.app_id}")
            response = requests_lib.post(
                f"{self.base_url}{self.ENDPOINT_ACCESS_TOKEN}",
                json={
                    "app_id": self.app_id,
                    "secret_key": self.secret_key
                },
                timeout=min(self.timeout, 10)
            )
            self._request_logger.info(f"🔵 响应状态码：{response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                if data.get("code") == 0 or data.get("code") is None:
                    self._access_token = data.get("data", {}).get("access_token")
                    if not self._access_token:
                        raise APIError(
                            code=502,
                            message="蝉镜 access_token 响应缺少 token",
                            error_type=APIErrorType.AUTH_ERROR,
                            endpoint=self.ENDPOINT_ACCESS_TOKEN,
                            original_response=data,
                        )
                    expires_in = data.get("data", {}).get("expires_in", 7200)
                    try:
                        expires_in = max(int(expires_in), 60)
                    except (TypeError, ValueError):
                        expires_in = 7200
                    self._token_expires_at = datetime.now() + timedelta(seconds=expires_in - 60)
                    self._request_logger.info("✅ 获取 access_token 成功")
                    return self._access_token
                else:
                    raise APIError(
                        code=data.get("code", -1),
                        message=data.get("msg", "获取 token 失败"),
                        error_type=APIErrorType.AUTH_ERROR,
                        endpoint=self.ENDPOINT_ACCESS_TOKEN,
                        original_response=data
                    )
            else:
                raise APIError(
                    code=response.status_code,
                    message=f"获取 token 失败：{response.text}",
                    error_type=APIErrorType.AUTH_ERROR,
                    endpoint=self.ENDPOINT_ACCESS_TOKEN
                )
        except requests.exceptions.RequestException as e:
            self._request_logger.error(f"🔴 网络错误详情：type={type(e).__name__}, error={e}")
            self._request_logger.error(f"🔴 网络诊断：无法连接到 {self.base_url}")
            self._request_logger.error(f"🔴 可能原因：1.Docker 容器无法访问宿主机 2.防火墙阻止 3.服务未启动")
            raise APIError(
                code=-1,
                message=f"网络错误：{e}",
                error_type=APIErrorType.NETWORK_ERROR,
                endpoint=self.ENDPOINT_ACCESS_TOKEN
            )

    def _invalidate_access_token(self):
        """清理可能已失效的 token，下一次请求会重新认证。"""
        self._access_token = None
        self._token_expires_at = None
        self._request_logger.warning("⚠️ 已清理缓存的蝉镜 access_token，将重新获取")

    def get_access_token(self) -> str:
        """公开返回 access_token，用于任务层重试刷新。"""
        return self._get_access_token()

    @staticmethod
    def _is_auth_failure_response(result: Any) -> bool:
        """识别蝉镜返回的 token/授权失败（有些版本仍使用 HTTP 200）。"""
        if not isinstance(result, dict):
            return False

        code = result.get("code")
        if code in {401, 403, 40100, 40101, 40300, 40301}:
            return True

        message = str(result.get("msg") or result.get("message") or "").lower()
        auth_markers = (
            "token",
            "access_token",
            "unauthorized",
            "unauthorised",
            "认证",
            "授权",
            "鉴权",
            "过期",
        )
        return any(marker in message for marker in auth_markers)
    
    # ============================================================
    # 统计方法
    # ============================================================
    
    def get_stats(self) -> Optional[Dict[str, Any]]:
        """获取请求统计信息"""
        if not self._stats:
            return None
        
        return {
            "total_requests": self._stats.total_requests,
            "successful_requests": self._stats.successful_requests,
            "failed_requests": self._stats.failed_requests,
            "retried_requests": self._stats.retried_requests,
            "success_rate": f"{self._stats.success_rate():.2f}%",
            "avg_latency_ms": f"{self._stats.avg_latency() * 1000:.2f}ms",
            "last_request_time": self._stats.last_request_time.isoformat() if self._stats.last_request_time else None
        }
    
    def reset_stats(self):
        """重置统计信息"""
        if self._stats:
            self._stats = RequestStats()
    
    # ============================================================
    # 熔断器逻辑
    # ============================================================
    
    def _check_circuit_breaker(self) -> bool:
        """检查熔断器状态，返回 True 表示可以请求"""
        if not self._circuit_breaker_open:
            return True
        
        # 熔断器已打开，检查是否可以重置
        if self._last_failure_time:
            time_since_failure = datetime.now() - self._last_failure_time
            if time_since_failure >= self._circuit_breaker_reset_time:
                self._circuit_breaker_open = False
                self._circuit_breaker_failures = 0
                self._request_logger.info("熔断器已重置")
                return True
        
        return False
    
    def _record_success(self):
        """记录成功请求"""
        self._circuit_breaker_failures = max(0, self._circuit_breaker_failures - 1)
        if self._circuit_breaker_failures == 0:
            self._circuit_breaker_open = False
    
    def _record_failure(self):
        """记录失败请求"""
        self._circuit_breaker_failures += 1
        self._last_failure_time = datetime.now()
        
        if self._circuit_breaker_failures >= self._circuit_breaker_threshold:
            self._circuit_breaker_open = True
            self._request_logger.warning(
                f"熔断器已打开，连续失败 {self._circuit_breaker_failures} 次"
            )
    
    # ============================================================
    # 核心请求方法
    # ============================================================
    
    @retry_with_backoff(max_retries=3, base_delay=1.0, max_delay=30.0)
    def _request(self, method: str, endpoint: str, params: Optional[Dict] = None, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None, 
                 retry: bool = True) -> Dict[str, Any]:
        """
        增强的请求方法，支持：
        1. 指数退避重试
        2. 请求统计
        3. 熔断器
        4. 详细日志
        5. 自动 Token 管理
        
        Args:
            method: HTTP 方法 (GET/POST)
            endpoint: API 端点
            params: URL 参数
            data: 请求体数据
            headers: 请求头
            retry: 是否启用重试
        
        Returns:
            API 响应数据字典
        """
        start_time = time.time()
        
        # 检查熔断器
        if not self._check_circuit_breaker():
            if self.fallback_enabled and self.fallback_func:
                self._request_logger.warning("熔断器打开，使用降级策略")
                return self.fallback_func(method, endpoint, params, data)
            raise APIError(
                code=-1,
                message="熔断器已打开，服务暂时不可用",
                error_type=APIErrorType.SERVER_ERROR,
                endpoint=endpoint
            )
        
        # 更新统计
        if self._stats:
            self._stats.total_requests += 1
            self._stats.last_request_time = datetime.now()
        
        try:
            # 构建请求 URL
            url = f"{self.base_url}{endpoint}"
            
            # 🔵 网络诊断日志
            self._request_logger.info(f"🔵 [网络诊断] 准备请求：{method} {url}")
            self._request_logger.info(f"🔵 [网络诊断] base_url={self.base_url}, endpoint={endpoint}, timeout={self.timeout}s")
            
            # 获取访问令牌
            access_token = self._get_access_token()
            
            # 🐛 蝉镜 API 需要将 access_token 作为 query parameter 传递，而不是 header
            # 将 token 添加到 params 中
            if params is None:
                params = {}
            params["access_token"] = access_token
            
            # 构建请求头
            request_headers = {
                "Content-Type": "application/json",
            }
            if headers:
                request_headers.update(headers)
            
            # 发送请求
            self._request_logger.debug(f"{method} {url} params={params} data={data}")
            
            if method.upper() == "GET":
                response = requests_lib.get(
                    url,
                    params=params,
                    headers=request_headers,
                    timeout=self.timeout
                )
            elif method.upper() == "POST":
                response = requests_lib.post(
                    url,
                    params=params,
                    json=data,
                    headers=request_headers,
                    timeout=self.timeout
                )
            else:
                raise ValueError(f"不支持的 HTTP 方法：{method}")
            
            # 解析响应
            if response.status_code == 200:
                result = response.json()

                # 部分蝉镜版本在 token 失效时仍返回 HTTP 200，必须清理旧 token
                # 并只自动重试一次，否则前端会一直看到一个笼统的空列表。
                if self._is_auth_failure_response(result):
                    auth_code = result.get("code", 401) if isinstance(result, dict) else 401
                    auth_message = (
                        result.get("msg") or result.get("message") or "蝉镜授权失败"
                        if isinstance(result, dict)
                        else "蝉镜授权失败"
                    )
                    self._invalidate_access_token()
                    if retry:
                        self._request_logger.warning(
                            f"⚠️ 蝉镜接口返回授权失败，刷新 token 后重试：{endpoint}"
                        )
                        retry_params = dict(params or {})
                        retry_params.pop("access_token", None)
                        return self._request(
                            method,
                            endpoint,
                            params=retry_params,
                            data=data,
                            headers=headers,
                            retry=False,
                        )
                    raise APIError(
                        code=auth_code,
                        message=str(auth_message),
                        error_type=APIErrorType.AUTH_ERROR,
                        endpoint=endpoint,
                        original_response=result if isinstance(result, dict) else None,
                    )
                
                # 🔴 添加详细日志，诊断返回结果
                self._request_logger.info(
                    f"API 调用结果：{method} {endpoint} - code={result.get('code') if isinstance(result, dict) else 'N/A'}, msg={result.get('msg') if isinstance(result, dict) else 'N/A'}"
                )
                
                # 记录成功
                latency = time.time() - start_time
                if self._stats:
                    self._stats.successful_requests += 1
                    self._stats.total_latency += latency
                
                self._record_success()
                
                # 记录请求日志
                self._request_logger.debug(
                    f"✓ {method} {endpoint} - {latency:.3f}s"
                )
                
                return result
            else:
                # HTTP 错误
                error_msg = f"HTTP {response.status_code}: {response.text}"
                error_type = (
                    APIErrorType.AUTH_ERROR
                    if response.status_code in (401, 403)
                    else APIErrorType.SERVER_ERROR
                )
                if response.status_code in (401, 403) and retry:
                    self._invalidate_access_token()
                    self._request_logger.warning(
                        f"⚠️ 蝉镜接口 HTTP {response.status_code} 授权失败，刷新 token 后重试：{endpoint}"
                    )
                    retry_params = dict(params or {})
                    retry_params.pop("access_token", None)
                    return self._request(
                        method,
                        endpoint,
                        params=retry_params,
                        data=data,
                        headers=headers,
                        retry=False,
                    )
                raise APIError(
                    code=response.status_code,
                    message=error_msg,
                    error_type=error_type,
                    endpoint=endpoint
                )
                
        except APIError:
            # 记录失败
            if self._stats:
                self._stats.failed_requests += 1
            
            self._record_failure()
            
            # 尝试降级
            if self.fallback_enabled and self.fallback_func:
                self._request_logger.warning(f"API 失败，使用降级策略")
                return self.fallback_func(method, endpoint, params, data)
            
            raise
        except requests.exceptions.RequestException as e:
            # 网络错误
            if self._stats:
                self._stats.failed_requests += 1
            
            self._record_failure()
            
            api_error = APIError(
                code=-1,
                message=str(e),
                error_type=APIErrorType.NETWORK_ERROR,
                endpoint=endpoint
            )
            
            if self.fallback_enabled and self.fallback_func:
                self._request_logger.warning(f"网络错误，使用降级策略：{e}")
                return self.fallback_func(method, endpoint, params, data)
            
            raise api_error
        except Exception as e:
            # 其他异常
            if self._stats:
                self._stats.failed_requests += 1
            
            self._record_failure()
            raise
    
    # ============================================================
    # 缓存增强方法
    # ============================================================
    
    def _cache_get_v2(self, key: str) -> Optional[Any]:
        """V2 缓存获取"""
        if not self._cache_v2:
            return None
        return self._cache_v2.get(key)
    
    def _cache_set_v2(self, key: str, data: Any, ttl: int = 300):
        """V2 缓存设置"""
        if not self._cache_v2:
            return
        self._cache_v2.set(key, data, ttl)
    
    def _cache_delete_v2(self, key: str):
        """V2 缓存删除"""
        if not self._cache_v2:
            return
        self._cache_v2.delete(key)
    
    # ============================================================
    # 公共 API 方法
    # ============================================================

    def upload_file(self, file_path: str, service: str = "customised_person") -> str:
        """通过 V2 服务的 multipart 接口上传文件，返回 file_id。"""
        file_name = os.path.basename(file_path)
        suffix = os.path.splitext(file_name)[1].lower()
        content_type = {
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".webm": "video/webm",
            ".mp3": "audio/mpeg",
            ".wav": "audio/wav",
            ".m4a": "audio/mp4",
            ".aac": "audio/aac",
            ".flac": "audio/flac",
            ".ogg": "audio/ogg",
            ".wma": "audio/x-ms-wma",
        }.get(suffix, "application/octet-stream")
        for attempt in range(2):
            access_token = self._get_access_token()
            with open(file_path, "rb") as file_handle:
                upload_response = requests_lib.post(
                    f"{self.base_url}/upload_file",
                    params={"access_token": access_token},
                    files={"file": (file_name, file_handle, content_type)},
                    data={"service": service},
                    timeout=self.timeout,
                )
            if upload_response.status_code in (401, 403) and attempt == 0:
                self._invalidate_access_token()
                continue
            if upload_response.status_code != 200:
                raise Exception(f"上传素材到蝉镜失败：HTTP {upload_response.status_code} {upload_response.text[:500]}")
            response = upload_response.json()
            if not ChanjingStatusCode.is_success(response.get("code")):
                raise Exception(f"上传素材到蝉镜失败：{response}")
            file_id = (response.get("data") or {}).get("file_id")
            if not file_id:
                raise Exception(f"蝉镜上传响应缺少 file_id：{response}")
            break
        else:
            raise Exception("上传素材到蝉镜失败：授权重试后仍未成功")
        self._request_logger.info(f"蝉镜素材上传成功：{file_name} -> {file_id}")
        return file_id

    def create_customised_person(
        self,
        name: str,
        file_id: str,
        audio_source: str = "video",
        audio_file_id: str = "",
        clone_preset_audio_id: str = "",
        train_type: str = "both",
        language: str = "cn",
        error_skip: bool = False,
        resolution_rate: int = 0,
        callback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """提交自定义数字人训练任务。"""
        data = {
            "name": name,
            "video_file_id": file_id,
            "audio_source": audio_source,
            "audio_file_id": audio_file_id,
            "clone_preset_audio_id": clone_preset_audio_id,
            "train_type": train_type,
            "language": language,
            "error_skip": error_skip,
            "resolution_rate": resolution_rate,
        }
        if callback:
            data["callback"] = callback
        return self._request("POST", "/create_customised_person", data=data)

    def delete_customised_person(self, person_id: str) -> Dict[str, Any]:
        """删除自定义数字人。"""
        return self._request("POST", "/delete_customised_person", data={"id": person_id})

    def get_file_detail(self, file_id: str) -> Dict[str, Any]:
        """获取蝉镜上传文件详情，主要用于拿到可提交给业务接口的文件地址。"""
        return self._request("GET", self.ENDPOINT_FILE_DETAIL, params={"id": file_id})

    def create_customised_audio(
        self,
        name: str,
        url: str,
        language: str = "cn",
        text: str = "",
        denoise_flag: bool = True,
        callback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """提交定制声音任务，返回蝉镜生成的声音 ID。"""
        data = {
            "name": name,
            "url": url,
            "language": language,
            "text": text,
            "denoise_flag": denoise_flag,
        }
        if callback:
            data["callback"] = callback
        return self._request("POST", self.ENDPOINT_CREATE_CUSTOMISED_AUDIO, data=data)

    def get_customised_audio(self, audio_id: str) -> Dict[str, Any]:
        """获取定制声音详情和处理状态。"""
        return self._request("GET", self.ENDPOINT_CUSTOMISED_AUDIO_DETAIL, params={"id": audio_id})
    
    def list_common_digital_persons(self, page: int = 1, size: int = 20, use_cache: bool = True) -> Dict[str, Any]:
        """
        获取公共数字人列表（增强版）
        
        Args:
            page: 页码（从 1 开始）
            size: 每页数量
            use_cache: 是否使用缓存
        
        Returns:
            数字人列表响应
        """
        cache_key = f"v2:list_common_persons:{page}:{size}"
        
        if use_cache:
            cached = self._cache_get_v2(cache_key)
            if cached is not None:
                if self._stats:
                    self._stats.total_requests += 1
                    self._stats.successful_requests += 1
                return cached
        
        params = {
            "page": page,
            "size": size
        }
        
        response = self._request("GET", self.ENDPOINT_COMMON_PERSONS, params=params)
        
        # 🐌 兼容 code=None 的情况（旧版 API 可能不返回 code）
        api_code = response.get('code')
        if use_cache and (api_code is None or api_code == 0):
            self._cache_set_v2(cache_key, response, ttl=300)
        
        return response
    
    def list_common_audio_mans(self, page: int = 1, size: int = 20, use_cache: bool = True) -> Dict[str, Any]:
        """
        获取公共声音模型列表（增强版）
        
        Args:
            page: 页码（从 1 开始）
            size: 每页数量
            use_cache: 是否使用缓存
        
        Returns:
            声音模型列表响应
        """
        cache_key = f"v2:list_common_audio:{page}:{size}"
        
        if use_cache:
            cached = self._cache_get_v2(cache_key)
            if cached is not None:
                if self._stats:
                    self._stats.total_requests += 1
                    self._stats.successful_requests += 1
                return cached
        
        params = {
            "page": page,
            "size": size
        }
        
        response = self._request("GET", self.ENDPOINT_COMMON_AUDIO, params=params)
        
        # 🐌 兼容 code=None 的情况（旧版 API 可能不返回 code）
        api_code = response.get('code')
        if use_cache and (api_code is None or api_code == 0):
            self._cache_set_v2(cache_key, response, ttl=300)
        
        return response

    def list_customised_persons(
        self,
        page: int = 1,
        page_size: int = 20,
        source: Optional[int] = None,
        use_cache: bool = True,
    ) -> Dict[str, Any]:
        """获取自定义数字人列表，兼容同步接口使用的 page_size/source 参数。"""
        cache_key = f"v2:list_customised_persons:{page}:{page_size}:{source}"

        if use_cache:
            cached = self._cache_get_v2(cache_key)
            if cached is not None:
                if self._stats:
                    self._stats.total_requests += 1
                    self._stats.successful_requests += 1
                return cached

        params = {
            "page": page,
            "size": page_size,
        }
        if source is not None:
            params["source"] = source

        response = self._request("GET", self.ENDPOINT_CUSTOM_PERSONS, params=params)
        api_code = response.get("code")
        if use_cache and (api_code is None or api_code == 0):
            self._cache_set_v2(cache_key, response, ttl=60)
        return response
    
    def get_customised_person_status(self, person_id: str, use_cache: bool = True) -> Dict[str, Any]:
        """
        获取自定义数字人状态（增强版）
        
        Args:
            person_id: 数字人 ID
            use_cache: 是否使用缓存
        
        Returns:
            数字人状态响应
        """
        cache_key = f"v2:customised_person_status:{person_id}"
        
        if use_cache:
            cached = self._cache_get_v2(cache_key)
            if cached is not None:
                if self._stats:
                    self._stats.total_requests += 1
                    self._stats.successful_requests += 1
                return cached
        
        params = {"id": person_id}
        
        response = self._request("GET", self.ENDPOINT_CUSTOM_PERSON_STATUS, params=params)
        
        # 🐌 兼容 code=None 的情况（旧版 API 可能不返回 code）
        api_code = response.get('code')
        if use_cache and (api_code is None or api_code == 0):
            self._cache_set_v2(cache_key, response, ttl=60)
        
        return response

    def create_video(self, **video_params: Any) -> Dict[str, Any]:
        """创建合成视频任务（兼容扁平参数和标准请求体）。"""
        request_data = video_params
        if "request" in request_data and isinstance(request_data.get("request"), dict):
            merged = dict(request_data["request"])
            merged.update({k: v for k, v in request_data.items() if k != "request"})
            request_data = merged

        payload: Dict[str, Any] = {}

        # ---------- audio ----------
        audio = request_data.get("audio")
        if not isinstance(audio, dict):
            audio = {}
        else:
            audio = dict(audio)

        audio_type = audio.get("type") or request_data.get("audio_type")
        if not audio_type:
            if request_data.get("audio_file_id") or request_data.get("wav_url"):
                audio_type = "audio"
            elif request_data.get("text") is not None or request_data.get("audio_man_id") is not None:
                audio_type = "tts"

        if audio_type:
            audio["type"] = audio_type

        if request_data.get("language") is not None:
            audio["language"] = request_data.get("language")
        if request_data.get("language_boost") is not None:
            audio["language_boost"] = request_data.get("language_boost")
        if request_data.get("volume") is not None:
            audio["volume"] = request_data.get("volume")

        if audio_type == "audio":
            if request_data.get("audio_file_id"):
                audio["file_id"] = request_data.get("audio_file_id")
            if request_data.get("wav_url"):
                audio["wav_url"] = request_data.get("wav_url")
        else:
            tts_payload = dict(audio.get("tts") or {})
            text_value = audio.get("tts", {}).get("text") if isinstance(audio.get("tts"), dict) else request_data.get("text")
            if text_value is not None:
                tts_payload["text"] = text_value if isinstance(text_value, list) else [text_value]
            audio_man_id = request_data.get("audio_man_id")
            if audio_man_id:
                tts_payload["audio_man"] = audio_man_id
            if request_data.get("speed") is not None:
                tts_payload["speed"] = request_data.get("speed")
            if request_data.get("pitch") is not None:
                tts_payload["pitch"] = request_data.get("pitch")
            audio["tts"] = tts_payload

        if audio.get("type") == "tts" and not audio.get("tts"):
            audio["tts"] = {"text": []}

        payload["audio"] = {k: v for k, v in audio.items() if v is not None}

        # ---------- person ----------
        person = request_data.get("person")
        if not isinstance(person, dict):
            person = {}
        else:
            person = dict(person)

        person.setdefault("id", request_data.get("digital_person_id") or request_data.get("person_id"))
        if not person.get("id"):
            raise ValueError("create_video 需要 digital_person_id / person_id")

        for key, value in {
            "figure_type": request_data.get("figure_type"),
            "drive_mode": request_data.get("drive_mode"),
            "backway": request_data.get("backway"),
            "is_rgba_mode": request_data.get("is_rgba_mode"),
            "x": request_data.get("person_x"),
            "y": request_data.get("person_y"),
            "width": request_data.get("person_width"),
            "height": request_data.get("person_height"),
            "source": request_data.get("source"),
        }.items():
            if value is not None:
                person[key] = value
        payload["person"] = {k: v for k, v in person.items() if v is not None}

        # ---------- optional top-level ----------
        for key, value in {
            "bg_color": request_data.get("bg_color", "#EDEDED"),
            "hide_subtitle": request_data.get("hide_subtitle"),
            "subtitle_config": request_data.get("subtitle_config"),
            "add_compliance_watermark": request_data.get("add_compliance_watermark"),
            "compliance_watermark_position": request_data.get("compliance_watermark_position"),
            "model": request_data.get("model"),
            "resolution_rate": request_data.get("resolution_rate"),
            "screen_width": request_data.get("screen_width"),
            "screen_height": request_data.get("screen_height"),
            "duration": request_data.get("duration"),
            "callback": request_data.get("callback") or request_data.get("callback_url"),
        }.items():
            if value is not None:
                payload[key] = value

        bg_payload = request_data.get("bg")
        if not isinstance(bg_payload, dict):
            bg_payload = request_data.get("bg_params")
        if isinstance(bg_payload, dict) and bg_payload:
            payload["bg"] = {k: v for k, v in bg_payload.items() if v is not None}

        return self._request("POST", self.ENDPOINT_CREATE_VIDEO, data=payload)

    def get_video_status(self, video_id: str) -> Dict[str, Any]:
        """
        获取视频制作状态
        
        Args:
            video_id: 视频 ID
        
        Returns:
            视频状态响应
        """
        params = {
            "id": video_id
        }
        
        return self._request("GET", self.ENDPOINT_VIDEO_STATUS, params=params)

    def delete_video(self, video_id: str) -> Dict[str, Any]:
        """删除数字人视频任务。"""
        return self._request("POST", self.ENDPOINT_DELETE_VIDEO, data={"id": video_id})

    def delete_customised_audio(self, audio_id: str) -> Dict[str, Any]:
        """删除定制声音。"""
        return self._request("POST", self.ENDPOINT_DELETE_CUSTOMISED_AUDIO, data={"id": audio_id})

    def delete_file(self, file_id: str) -> Dict[str, Any]:
        """删除已上传文件。"""
        return self._request("POST", self.ENDPOINT_DELETE_FILE, data={"id": file_id})

    def download_video(self, video_url: str, output_path: str, timeout: Optional[int] = None) -> str:
        """下载数字人视频文件到本地。"""
        if not video_url:
            raise ValueError("download_video 缺少 video_url")
        if not output_path:
            raise ValueError("download_video 缺少 output_path")

        request_url = video_url
        if video_url.startswith("/"):
            request_url = f"{self.base_url.rstrip('/')}{video_url}"
        elif not video_url.startswith(("http://", "https://")):
            request_url = f"{self.base_url.rstrip('/')}/{video_url.lstrip('/')}"

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with requests_lib.get(request_url, stream=True, timeout=timeout or self.timeout) as response:
            if response.status_code != 200:
                raise Exception(f"下载数字人视频失败：HTTP {response.status_code} {response.text[:200]}")
            with open(output_path, "wb") as file_obj:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        file_obj.write(chunk)
        return output_path

    def set_debug(self, enabled: bool = True):
        """兼容旧版客户端，调整请求日志级别。"""
        self._request_logger.setLevel(logging.DEBUG if enabled else logging.INFO)
        return self

    # ============================================================
    # 健康检查方法
    # ============================================================
    
    def health_check(self) -> Dict[str, Any]:
        """
        健康检查
        
        Returns:
            包含健康状态的字典
        """
        result = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "checks": {}
        }
        
        # 检查网络连接
        try:
            start = time.time()
            resp = requests_lib.get(f"{self.base_url}/access_token", timeout=5)
            latency = time.time() - start
            result["checks"]["network"] = {
                "status": "ok",
                "latency_ms": round(latency * 1000, 2)
            }
        except Exception as e:
            result["checks"]["network"] = {
                "status": "error",
                "message": str(e)
            }
            result["status"] = "unhealthy"
        
        # 检查缓存
        if self._cache_v2:
            result["checks"]["cache"] = {
                "status": "ok",
                "size": len(self._cache_v2._cache),
                "max_size": self._cache_v2._max_size
            }
        
        # 检查熔断器
        result["checks"]["circuit_breaker"] = {
            "status": "open" if self._circuit_breaker_open else "closed",
            "failure_count": self._circuit_breaker_failures
        }
        
        # 添加统计信息
        if self._stats:
            result["stats"] = self.get_stats()
        
        return result
    
    # ============================================================
    # 批量操作方法
    # ============================================================
    
    def batch_get_video_status(
        self,
        video_ids: List[str],
        concurrency: int = 5
    ) -> Dict[str, Dict[str, Any]]:
        """
        批量获取视频状态
        
        Args:
            video_ids: 视频 ID 列表
            concurrency: 并发数
        
        Returns:
            {video_id: status_response}
        """
        import concurrent.futures
        
        results = {}
        
        def fetch_status(video_id: str):
            try:
                return video_id, self.get_video_status(video_id)
            except Exception as e:
                return video_id, {
                    "code": -1,
                    "msg": str(e),
                    "data": None
                }
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [executor.submit(fetch_status, vid) for vid in video_ids]
            
            for future in concurrent.futures.as_completed(futures):
                video_id, result = future.result()
                results[video_id] = result
        
        return results


# ============================================================
# 工厂函数
# ============================================================

def create_chanjing_api_v2(
    app_id: Optional[str] = None,
    secret_key: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None
) -> ChanjingAPIV2:
    """
    创建 V2 API 客户端的工厂函数
    
    🆕 兼容层设计：
        - 传统模式：提供 app_id 和 secret_key
        - 自动模式：不提供，自动从环境变量获取
    
    Args:
        app_id: 应用 ID（可选，不提供则自动获取）
        secret_key: 密钥（可选，不提供则自动获取）
        config: 配置字典，可包含：
            - base_url: API 地址（建议配置 CHANJING_BASE_URL）
            - timeout: 超时时间（默认：30）
            - max_retries: 最大重试次数（默认：3）
            - enable_cache: 是否启用缓存（默认：True）
            - cache_max_size: 缓存大小（默认：1000）
            - enable_stats: 是否启用统计（默认：True）
            - fallback_enabled: 是否启用降级（默认：False）
            - auto_auth: 是否自动获取认证信息（默认：True）
    
    Returns:
        ChanjingAPIV2 实例
    
    使用示例：
        # 传统模式
        api = create_chanjing_api_v2("app_id", "secret_key")
        
        # 自动模式（推荐）
        api = create_chanjing_api_v2()
        
        # 自定义配置
        api = create_chanjing_api_v2(config={"timeout": 60, "max_retries": 5})
    """
    default_config = {
        "base_url": os.getenv("CHANJING_BASE_URL", ""),
        "timeout": 30,
        "max_retries": 3,
        "enable_cache": True,
        "cache_max_size": 1000,
        "enable_stats": True,
        "fallback_enabled": False,
        "auto_auth": True,  # 🆕 默认开启自动认证，优先从 Docker 环境变量读取
    }
    
    if config:
        default_config.update(config)
    
    return ChanjingAPIV2(
        app_id=app_id,
        secret_key=secret_key,
        base_url=default_config["base_url"],
        timeout=default_config["timeout"],
        max_retries=default_config["max_retries"],
        enable_cache=default_config["enable_cache"],
        cache_max_size=default_config["cache_max_size"],
        enable_stats=default_config["enable_stats"],
        fallback_enabled=default_config["fallback_enabled"],
        auto_auth=default_config["auto_auth"]
    )


# ============================================================
# 导出
# ============================================================

__all__ = [
    'ChanjingAPIV2',
    'create_chanjing_api_v2',
    'ChanjingStatusCode',  # 兼容层
    'APIError',
    'APIErrorType',
]
