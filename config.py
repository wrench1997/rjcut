import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://rjcut:rjcut_secret_2024@localhost:5433/rjcut"
    REDIS_URL: str = "redis://localhost:6380/0"

    MINIO_ENDPOINT: str = "192.168.166.151:9003"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "rjcut"
    MINIO_USE_SSL: bool = False
    MINIO_EXTERNAL_ENDPOINT: str = "http://192.168.166.151:9003"

    TASK_TIMEOUT_SECONDS: int = 360
    TASK_STALE_CHECK_INTERVAL: int = 60
    SECRET_KEY: str = "change_me_in_production_2024"
    RQ_QUEUE_NAME: str = "rjcut_tasks"
    
    CHANJING_APP_ID: str = ""
    CHANJING_SECRET_KEY: str = ""
    # 蝉镜服务与文件服务必须配置为公网可达地址（禁止回退到内网 192.168 网段）
    CHANJING_BASE_URL: str = ""
    CHANJING_FILES_URL: str = ""
    # 调试环境可设置为 true，允许使用局域网地址；生产默认 false，禁止内网地址穿透
    ALLOW_PRIVATE_CHANJING: bool = True
    
    # 文件存储策略配置
    FILE_STORAGE_DAYS: int = 30  # 文件默认保留天数
    FILE_MAX_SIZE_MB: int = 500  # 单文件最大大小 (MB)
    FILE_ENABLE_DEDUPLICATION: bool = True  # 是否启用 hash 去重
    
    # AI Gateway 配置
    GATEWAY_BASE_URL: str = "http://gateway:8888"  # Docker 容器内默认地址

    # MiniMax H3 文生视频服务。仅后端访问，桌面客户端不直连上游。
    H3_BASE_URL: str = "http://112.111.7.91:7980/h3"
    # 上游 GenVideos 网关统一 API Key（H3 文生视频 / DeepSeek 共用一把 Key）。
    # 在上游管控台 http://112.111.7.91:7980/admin 获取后填入 .env 的 GENVIDEOS_API_KEY。
    GENVIDEOS_API_KEY: str = ""
    TEXT_TO_VIDEO_DAILY_BYTES_LIMIT: int = 10 * 1024 * 1024 * 1024
    TEXT_TO_VIDEO_RETENTION_HOURS: int = 24

    BASE_TASK_DIR: str = os.path.abspath("./service_data")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
