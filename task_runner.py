"""
任务运行器 - 使用注册表模式分发任务到不同的处理器
"""

import os
import shutil
from datetime import datetime, timezone
from typing import Dict, Any

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus
from quota import confirm_quota, refund_quota
from tasks import get_task_handler, TASK_HANDLERS

settings = get_settings()


def run_task(task_id: str, task_type: str, payload: dict, trace_id: str, merchant_id: str):
    """
    根据任务类型分发到对应的处理器
    
    Args:
        task_id: 任务 ID
        task_type: 任务类型 (agent_draft, agent_compose, compose_from_draft, dh_generate_video, dh_create_person)
        payload: 任务参数
        trace_id: 追踪 ID
        merchant_id: 商户 ID
    """
    try:
        handler = get_task_handler(task_type)
        handler(task_id, payload, trace_id, merchant_id)
    except ValueError as e:
        # 未知的任务类型
        error_msg = f"{str(e)}\n支持的任务类型：{list(TASK_HANDLERS.keys())}"
        _handle_unknown_task_type(task_id, task_type, error_msg, payload, trace_id)
    except Exception as e:
        # 其他异常由各个处理器自行处理
        raise e


def _handle_unknown_task_type(task_id: str, task_type: str, error_msg: str, payload: dict, trace_id: str):
    """处理未知任务类型错误"""
    import traceback
    error_detail = f"{error_msg}\n{traceback.format_exc()}"
    
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status not in [TaskStatus.failed, TaskStatus.cancelled, TaskStatus.timeout]:
            task.status = TaskStatus.failed
            task.stage = "failed"
            task.error = error_detail[:4000]
            task.finished_at = datetime.now(timezone.utc)
            db.add(task)
            refund_quota(db, task, reason=error_msg[:200])

    callback = payload.get("callback") or {}
    if callback.get("url"):
        _post_callback(
            callback["url"],
            {
                "event": "task.failed",
                "task_id": task_id,
                "trace_id": trace_id,
                "status": "failed",
                "error": error_msg,
            },
            callback.get("secret"),
        )
    
    # 清理任务目录
    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    try:
        shutil.rmtree(task_dir, ignore_errors=True)
    except Exception:
        pass


def _post_callback(callback_url: str, payload: dict, secret: str = None):
    """发送回调通知"""
    import hashlib
    import requests
    
    headers = {"Content-Type": "application/json"}
    if secret:
        sign = hashlib.sha256(
            (json.dumps(payload, ensure_ascii=False) + secret).encode("utf-8")
        ).hexdigest()
        headers["X-Signature"] = sign
    try:
        requests.post(callback_url, json=payload, headers=headers, timeout=30)
    except Exception:
        pass


# 保持向后兼容：导出旧的函数名，但内部使用新的处理器
def run_agent_compose_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    """兼容旧代码：调用 agent_compose 处理器"""
    from tasks.agent_compose import run_agent_compose_task as handler
    handler(task_id, payload, trace_id, merchant_id)


def run_agent_draft_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    """兼容旧代码：调用 agent_draft 处理器"""
    from tasks.agent_draft import run_agent_draft_task as handler
    handler(task_id, payload, trace_id, merchant_id)


def run_compose_from_draft_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    """兼容旧代码：调用 compose_from_draft 处理器"""
    from tasks.compose_from_draft import run_compose_from_draft_task as handler
    handler(task_id, payload, trace_id, merchant_id)


def run_dh_generate_video_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    """兼容旧代码：调用 dh_generate_video 处理器"""
    from tasks.chanjing_video import run_dh_generate_video_task as handler
    handler(task_id, payload, trace_id, merchant_id)


def run_dh_create_person_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    """兼容旧代码：调用 dh_create_person 处理器"""
    from tasks.chanjing_video import run_dh_create_person_task as handler
    handler(task_id, payload, trace_id, merchant_id)
