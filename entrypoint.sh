#!/bin/bash
# FILE: /root/workspaces/rjcut/entrypoint.sh

set -e

echo "[entrypoint] APP_ROLE=${APP_ROLE}"

case "${APP_ROLE}" in
  api)
    echo "[entrypoint] Starting API server..."
    exec uvicorn api_service:app --host 0.0.0.0 --port 8000 --workers 4 --log-level info
    ;;
  worker)
    echo "[entrypoint] Starting Celery worker..."
    exec celery -A celery_app worker \
      --loglevel=info \
      --concurrency="${WORKER_CONCURRENCY:-2}" \
      --max-tasks-per-child=50 \
      -Q default,compose \
      -n "worker@%h"
    ;;
  beat)
    echo "[entrypoint] Starting Celery beat..."
    exec celery -A celery_app beat \
      --loglevel=info \
      --schedule=/tmp/celerybeat-schedule
    ;;
  *)
    echo "[entrypoint] Unknown APP_ROLE: ${APP_ROLE}"
    exit 1
    ;;
esac