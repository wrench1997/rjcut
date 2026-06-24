import os
from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://rjcut:rjcut_secret_2024@localhost:5433/rjcut"
    REDIS_URL: str = "redis://localhost:6380/0"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "rjcut"
    MINIO_USE_SSL: bool = False
    MINIO_EXTERNAL_ENDPOINT: str = "http://localhost:9003"

    TASK_TIMEOUT_SECONDS: int = 360
    TASK_STALE_CHECK_INTERVAL: int = 60
    SECRET_KEY: str = "change_me_in_production_2024"
    RQ_QUEUE_NAME: str = "rjcut_tasks"
    
    CHANJING_APP_ID: str = "26240785"
    CHANJING_SECRET_KEY: str = "a8acc6671b8446dc91f5a1c37d9f2bc0"
    
    # 文件存储策略配置
    FILE_STORAGE_DAYS: int = 30  # 文件默认保留天数
    FILE_MAX_SIZE_MB: int = 500  # 单文件最大大小 (MB)
    FILE_ENABLE_DEDUPLICATION: bool = True  # 是否启用 hash 去重
    

    BASE_TASK_DIR: str = os.path.abspath("./service_data")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()