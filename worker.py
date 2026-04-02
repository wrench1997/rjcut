import logging
from redis import Redis
from rq import Worker, Queue

from config import get_settings
from oss import ensure_bucket

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger("rjcut.worker")


def main():
    settings = get_settings()
    ensure_bucket()

    redis_conn = Redis.from_url(settings.REDIS_URL)
    queue = Queue(settings.RQ_QUEUE_NAME, connection=redis_conn)

    logger.info("Starting worker...")
    worker = Worker([queue], connection=redis_conn)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()