import os
import uuid
import hashlib
import mimetypes
from datetime import timedelta, datetime, timezone
from functools import lru_cache
from typing import List, Dict, Any

from minio import Minio
from minio.error import S3Error

from config import get_settings


@lru_cache()
def get_minio_client():
    settings = get_settings()
    return Minio(
        endpoint=settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_USE_SSL,
    )


def ensure_bucket():
    settings = get_settings()
    client = get_minio_client()
    if not client.bucket_exists(settings.MINIO_BUCKET):
        client.make_bucket(settings.MINIO_BUCKET)


def generate_oss_key(merchant_id: str, purpose: str, filename: str, file_hash: str = None) -> str:
    """
    生成 OSS 存储路径
    
    Args:
        merchant_id: 商户 ID
        purpose: 用途 (如 video, audio, image 等)
        filename: 原始文件名
        file_hash: 文件 hash，如果提供则用于去重命名
    
    Returns:
        OSS 存储路径
    """
    ext = os.path.splitext(filename)[1]
    if file_hash and get_settings().FILE_ENABLE_DEDUPLICATION:
        # 使用 hash 的前 16 位作为文件名，实现去重
        return f"{merchant_id}/{purpose}/{file_hash[:16]}{ext}"
    else:
        # 使用 UUID，不启用去重
        return f"{merchant_id}/{purpose}/{uuid.uuid4().hex[:12]}{ext}"


def calculate_file_hash(file_path: str, algorithm: str = "sha256") -> str:
    """
    计算文件的 hash 值
    
    Args:
        file_path: 文件路径
        algorithm: hash 算法，默认 sha256
    
    Returns:
        文件的 hex hash 字符串
    """
    hash_obj = hashlib.new(algorithm)
    with open(file_path, "rb") as f:
        # 分块读取，避免大文件内存溢出
        for chunk in iter(lambda: f.read(8192), b""):
            hash_obj.update(chunk)
    return hash_obj.hexdigest()


def presigned_get_url(oss_key: str, expires: int = 3600, filename: str = None) -> str:
    settings = get_settings()
    client = get_minio_client()
    params = None
    if filename:
        params = {"response-content-disposition": f'attachment; filename="{filename}"'}
    url = client.presigned_get_object(
        settings.MINIO_BUCKET,
        oss_key,
        expires=timedelta(seconds=expires),
        extra_query_params=params,
    )
    internal = f"http://{settings.MINIO_ENDPOINT}"
    external = settings.MINIO_EXTERNAL_ENDPOINT.rstrip("/")
    return url.replace(internal, external, 1)


def upload_file_to_oss(local_path: str, oss_key: str, content_type: str = None):
    settings = get_settings()
    client = get_minio_client()

    if content_type is None:
        content_type = mimetypes.guess_type(local_path)[0] or "application/octet-stream"

    file_size = os.path.getsize(local_path)
    with open(local_path, "rb") as f:
        client.put_object(
            settings.MINIO_BUCKET,
            oss_key,
            data=f,
            length=file_size,
            content_type=content_type,
        )
    return oss_key


def download_file_from_oss(oss_key: str, local_path: str):
    settings = get_settings()
    client = get_minio_client()
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    client.fget_object(settings.MINIO_BUCKET, oss_key, local_path)
    return local_path


def get_object_info(oss_key: str):
    settings = get_settings()
    client = get_minio_client()
    try:
        obj = client.stat_object(settings.MINIO_BUCKET, oss_key)
        return {
            "size": obj.size,
            "content_type": obj.content_type,
            "etag": obj.etag,
            "last_modified": obj.last_modified,
        }
    except S3Error:
        return None


def is_oss_key(value: str) -> bool:
    return not (value.startswith("http://") or value.startswith("https://"))


def find_existing_file_by_hash(db_session, merchant_id: str, file_hash: str):
    """
    查找商户下是否已存在相同 hash 的文件
    
    Args:
        db_session: 数据库会话
        merchant_id: 商户 ID
        file_hash: 文件 hash
    
    Returns:
        已存在的 UploadRecord 或 None
    """
    from models import UploadRecord
    
    record = (
        db_session.query(UploadRecord)
        .filter(
            UploadRecord.merchant_id == merchant_id,
            UploadRecord.file_hash == file_hash,
            UploadRecord.is_confirmed == True,
        )
        .order_by(UploadRecord.created_at.desc())
        .first()
    )
    return record


def delete_expired_files(db_session, batch_size: int = 100) -> dict:
    """
    清理过期的文件（需要配合定时任务使用）
    
    Args:
        db_session: 数据库会话
        batch_size: 每批处理的记录数
    
    Returns:
        统计信息 {"deleted_count": int, "freed_bytes": int}
    """
    from models import UploadRecord
    
    now = datetime.now(timezone.utc)
    expired_records = (
        db_session.query(UploadRecord)
        .filter(
            UploadRecord.expires_at < now,
            UploadRecord.is_confirmed == True,
        )
        .limit(batch_size)
        .all()
    )
    
    deleted_count = 0
    freed_bytes = 0
    client = get_minio_client()
    settings = get_settings()
    
    for record in expired_records:
        try:
            # 从 MinIO 删除文件
            client.remove_object(settings.MINIO_BUCKET, record.oss_key)
            freed_bytes += record.size_bytes or 0
            
            # 从数据库删除记录
            db_session.delete(record)
            deleted_count += 1
        except Exception as e:
            # 记录错误但继续处理
            print(f"Error deleting file {record.oss_key}: {e}")
    
    db_session.commit()
    
    return {
        "deleted_count": deleted_count,
        "freed_bytes": freed_bytes,
    }


def get_storage_stats(db_session, merchant_id: str = None) -> dict:
    """
    获取存储统计信息
    
    Args:
        db_session: 数据库会话
        merchant_id: 可选，商户 ID，不提供则统计全部
    
    Returns:
        统计信息 {"total_files": int, "total_bytes": int, "oldest_file": datetime, "newest_file": datetime}
    """
    from models import UploadRecord
    from sqlalchemy import func
    
    query = db_session.query(
        func.count(UploadRecord.id).label("total_files"),
        func.sum(UploadRecord.size_bytes).label("total_bytes"),
        func.min(UploadRecord.created_at).label("oldest_file"),
        func.max(UploadRecord.created_at).label("newest_file"),
    ).filter(UploadRecord.is_confirmed == True)
    
    if merchant_id:
        query = query.filter(UploadRecord.merchant_id == merchant_id)
    
    result = query.first()
    
    return {
        "total_files": result.total_files or 0,
        "total_bytes": result.total_bytes or 0,
        "oldest_file": result.oldest_file.isoformat() if result.oldest_file else None,
        "newest_file": result.newest_file.isoformat() if result.newest_file else None,
    }




def copy_file_in_oss(src_oss_key: str, dst_oss_key: str):
    """
    在 MinIO 内部复制文件（不经过本地下载上传）
    
    Args:
        src_oss_key: 源文件的 OSS key
        dst_oss_key: 目标文件的 OSS key
    """
    from minio.commonconfig import CopySource
    
    settings = get_settings()
    client = get_minio_client()
    
    client.copy_object(
        bucket_name=settings.MINIO_BUCKET,
        object_name=dst_oss_key,
        source=CopySource(settings.MINIO_BUCKET, src_oss_key),
    )


def batch_delete_files(oss_keys: List[str]) -> Dict[str, Any]:
    """
    批量删除 OSS 文件
    
    Args:
        oss_keys: OSS key 列表
    
    Returns:
        删除结果统计
    """
    settings = get_settings()
    client = get_minio_client()
    
    success_count = 0
    failed_count = 0
    errors = []
    
    for oss_key in oss_keys:
        try:
            client.remove_object(settings.MINIO_BUCKET, oss_key)
            success_count += 1
        except Exception as e:
            failed_count += 1
            errors.append({"oss_key": oss_key, "error": str(e)})
    
    return {
        "success_count": success_count,
        "failed_count": failed_count,
        "errors": errors,
    }


def get_file_list(
    db_session, 
    merchant_id: str = None, 
    limit: int = 100, 
    offset: int = 0
) -> Dict[str, Any]:
    """
    获取文件列表（支持分页）
    
    Args:
        db_session: 数据库会话
        merchant_id: 可选，商户 ID
        limit: 每页数量
        offset: 偏移量
    
    Returns:
        文件列表和分页信息
    """
    from models import UploadRecord
    from sqlalchemy import func
    
    query = db_session.query(UploadRecord).filter(UploadRecord.is_confirmed == True)
    
    if merchant_id:
        query = query.filter(UploadRecord.merchant_id == merchant_id)
    
    total = query.count()
    files = query.order_by(UploadRecord.created_at.desc()).limit(limit).offset(offset).all()
    
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total,
        "files": [
            {
                "id": f.id,
                "merchant_id": f.merchant_id,
                "oss_key": f.oss_key,
                "filename": f.filename,
                "size_bytes": f.size_bytes,
                "mime_type": f.mime_type,
                "created_at": f.created_at.isoformat(),
                "expires_at": f.expires_at.isoformat() if f.expires_at else None,
            }
            for f in files
        ],
    }


def get_merchant_storage_usage(db_session, merchant_id: str) -> Dict[str, Any]:
    """
    获取商户存储使用情况
    
    Args:
        db_session: 数据库会话
        merchant_id: 商户 ID
    
    Returns:
        存储使用统计
    """
    from models import UploadRecord
    from sqlalchemy import func
    
    result = db_session.query(
        func.count(UploadRecord.id).label("total_files"),
        func.sum(UploadRecord.size_bytes).label("total_bytes"),
    ).filter(
        UploadRecord.merchant_id == merchant_id,
        UploadRecord.is_confirmed == True,
    ).first()
    
    return {
        "total_files": result.total_files or 0,
        "total_bytes": result.total_bytes or 0,
        "total_mb": (result.total_bytes or 0) / 1024 / 1024,
        "total_gb": (result.total_bytes or 0) / 1024 / 1024 / 1024,
    }