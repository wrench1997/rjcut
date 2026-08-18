import time
import logging
from datetime import datetime, timezone, timedelta

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import refund_quota
from oss import get_minio_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger("rjcut.watchdog")
settings = get_settings()


def check_timeout_tasks():
    now = datetime.now(timezone.utc)
    with get_db_session() as db:
        tasks = (
            db.query(Task)
            .filter(Task.status == TaskStatus.processing, Task.started_at.isnot(None))
            .all()
        )
        for task in tasks:
            if now - task.started_at > timedelta(seconds=task.timeout_seconds):
                task.status = TaskStatus.timeout
                task.stage = "timeout"
                task.error = f"task exceeded timeout of {task.timeout_seconds} seconds"
                task.finished_at = now
                db.add(task)
                refund_quota(db, task, reason="timeout")
                logger.warning(f"task timeout: {task.id}")


def check_stale_queued_tasks():
    now = datetime.now(timezone.utc)
    with get_db_session() as db:
        tasks = (
            db.query(Task)
            .filter(
                Task.status == TaskStatus.queued,
                Task.created_at < now - timedelta(minutes=30),
            )
            .all()
        )
        for task in tasks:
            task.status = TaskStatus.failed
            task.stage = "failed"
            task.error = "task stale in queue"
            task.finished_at = now
            db.add(task)
            refund_quota(db, task, reason="stale queue")
            logger.warning(f"task stale: {task.id}")


def cleanup_expired_text_to_video_files():
    """清除服务器上的 H3 临时成片；EXE 已导入 VFS 的本地副本不受影响。"""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=settings.TEXT_TO_VIDEO_RETENTION_HOURS)
    with get_db_session() as db:
        tasks = (
            db.query(Task)
            .filter(
                Task.task_type == "text_to_video",
                Task.status == TaskStatus.succeeded,
                Task.finished_at.isnot(None),
                Task.finished_at < cutoff,
            )
            .limit(100)
            .all()
        )
        if not tasks:
            return
        client = get_minio_client()
        for task in tasks:
            result = dict(task.result or {})
            files = dict(result.get("files") or {})
            changed = False
            for file_key, original in files.items():
                file_info = dict(original or {})
                oss_key = file_info.get("oss_key")
                if not oss_key or file_info.get("server_expired"):
                    continue
                try:
                    client.remove_object(settings.MINIO_BUCKET, oss_key)
                    file_info["oss_key"] = None
                    file_info["download_url"] = None
                    file_info["server_expired"] = True
                    file_info["server_expired_at"] = now.isoformat()
                    files[file_key] = file_info
                    changed = True
                    logger.info("expired text-to-video file: task=%s key=%s", task.id, file_key)
                except Exception as exc:
                    logger.warning("failed to expire text-to-video file %s: %s", oss_key, exc)
            if changed:
                result["files"] = files
                result["server_files_expired"] = True
                task.result = result
                db.add(task)


def main():
    logger.info("task watchdog started")
    while True:
        try:
            check_timeout_tasks()
            check_stale_queued_tasks()
            cleanup_expired_text_to_video_files()
        except Exception as e:
            logger.exception("watchdog error: %s", e)
        time.sleep(settings.TASK_STALE_CHECK_INTERVAL)


if __name__ == "__main__":
    main()
