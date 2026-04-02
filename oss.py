import os
import uuid
import mimetypes
from datetime import timedelta
from functools import lru_cache

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


def generate_oss_key(merchant_id: str, purpose: str, filename: str) -> str:
    ext = os.path.splitext(filename)[1]
    return f"{merchant_id}/{purpose}/{uuid.uuid4().hex[:12]}{ext}"


def presigned_put_url(oss_key: str, expires: int = 3600) -> str:
    settings = get_settings()
    client = get_minio_client()
    url = client.presigned_put_object(
        settings.MINIO_BUCKET,
        oss_key,
        expires=timedelta(seconds=expires),
    )
    internal = f"http://{settings.MINIO_ENDPOINT}"
    external = settings.MINIO_EXTERNAL_ENDPOINT.rstrip("/")
    return url.replace(internal, external, 1)


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