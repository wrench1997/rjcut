import time
import logging
from datetime import datetime, timezone, timedelta

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import refund_quota

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


def main():
    logger.info("task watchdog started")
    while True:
        try:
            check_timeout_tasks()
            check_stale_queued_tasks()
        except Exception as e:
            logger.exception("watchdog error: %s", e)
        time.sleep(settings.TASK_STALE_CHECK_INTERVAL)


if __name__ == "__main__":
    main()