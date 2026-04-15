"""
蝉镜数字人视频任务处理器
"""

import os
import shutil
import json
import hashlib
import traceback
import time
from datetime import datetime, timezone
from typing import Dict, Any

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus, DhCustomPerson
from quota import confirm_quota, refund_quota
from oss import download_file_from_oss, is_oss_key
from chanjing_api import ChanjingAPI
from tasks import register_task
from tasks.components import TaskContext, FileManagerComponent

settings = get_settings()


@register_task("dh_generate_video")
def run_dh_generate_video_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    api = ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    os.makedirs(task_dir, exist_ok=True)

    try:
        _update_task(task_id, status=TaskStatus.processing, progress=5, stage="submitting_to_chanjing", started_at=datetime.now(timezone.utc))
        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled")

        bg_oss_key = payload.get("bg_file_oss_key")
        bg_params = None
        if payload.get("bg_type") == "image" and bg_oss_key:
            local_bg = os.path.join(task_dir, "bg_image.jpg")
            _download_input_file(bg_oss_key, local_bg)
            chanjing_file_id = api.upload_file(local_bg, service="background")
            bg_params = {"file_id": chanjing_file_id, "x": 0, "y": 0, "width": 1080, "height": 1920}

        video_params = {
            "digital_person_id": payload.get("person_id"),
            "text": payload.get("text"),
            "audio_man_id": payload.get("audio_man_id"),
            "figure_type": payload.get("figure_type"),
            "drive_mode": payload.get("drive_mode"),
            "person_x": 0, "person_y": 0, "person_width": 1080, "person_height": 1920
        }
        if bg_params:
            video_params["bg"] = bg_params
        else:
            video_params["bg_color"] = payload.get("bg_color")

        video_response = api.create_video(**video_params)
        if video_response.get('code') != 0:
            raise Exception(f"蝉镜接口报错：{video_response}")

        chanjing_video_id = video_response['data']
        _update_task(task_id, progress=10, stage="waiting_chanjing_render")

        chanjing_video_url = None
        for _ in range(180):
            if _is_task_cancelled(task_id):
                raise InterruptedError("task cancelled")

            status_resp = api.get_video_status(chanjing_video_id)
            if status_resp.get('code') == 0:
                data = status_resp.get('data', {})
                status = data.get('status')
                progress = data.get('progress', 0)

                mapped_progress = 10 + int(progress * 0.8)
                _update_task(task_id, progress=mapped_progress)

                if status in (1, 30):
                    chanjing_video_url = data.get('video_url')
                    break
                elif status in (2, 40, -1):
                    raise Exception(f"蝉镜渲染失败：{data.get('msg', '未知错误')}")
            time.sleep(10)

        if not chanjing_video_url:
            raise Exception("等待蝉镜渲染超时 (30 分钟)")

        _update_task(task_id, progress=90, stage="uploading_results")
        local_result = os.path.join(task_dir, "final.mp4")
        api.download_video(chanjing_video_url, local_result)

        # 使用统一的文件管理组件上传
        file_manager = FileManagerComponent()
        output_paths = {"final_video": local_result}
        uploaded_files = file_manager.upload_task_outputs(task_id, merchant_id, output_paths)
        
        result = {
            "files": uploaded_files
        }

        with get_db_session() as db:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                task.status = TaskStatus.succeeded
                task.progress = 100
                task.stage = "finished"
                task.result = result
                task.finished_at = datetime.now(timezone.utc)
                db.add(task)
                confirm_quota(db, task)

        callback = payload.get("callback") or {}
        if callback.get("url"):
            _post_callback(callback["url"], {"event": "task.completed", "task_id": task_id, "trace_id": trace_id, "status": "succeeded", "result": result}, callback.get("secret"))

    except InterruptedError as e:
        _handle_cancelled_task(task_id, str(e))

    except Exception as e:
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        _handle_failed_task(task_id, error_msg, payload, trace_id)
    
    finally:
        # 使用统一的文件清理方法
        file_manager = FileManagerComponent()
        file_manager.cleanup_task_dir(task_dir, ignore_errors=True)


@register_task("dh_create_person")
def run_dh_create_person_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    api = ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    os.makedirs(task_dir, exist_ok=True)

    try:
        _update_task(task_id, status=TaskStatus.processing, progress=5, stage="downloading_source", started_at=datetime.now(timezone.utc))
        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled")

        source_key = payload.get("source_video_oss_key")
        local_source = os.path.join(task_dir, "source.mp4")
        _download_input_file(source_key, local_source)

        _update_task(task_id, progress=15, stage="uploading_to_chanjing")
        chanjing_file_id = api.upload_file(local_source, service="customised_person")

        _update_task(task_id, progress=25, stage="submitting_train_task")
        # 添加重试机制，等待文件在蝉镜服务端处理就绪
        # 对于大文件（12MB+），服务端需要更长时间处理，增加重试次数和间隔
        train_resp = None
        max_retries = 60  # 最多重试 60 次
        retry_delay = 5   # 每次等待 5 秒
        max_wait_time = max_retries * retry_delay  # 最多等待 300 秒（5 分钟）
        
        for attempt in range(max_retries):
            train_resp = api.create_customised_person(
                name=payload.get("name"),
                file_id=chanjing_file_id,
                train_type=payload.get("train_type", "both"),
                language=payload.get("language", "cn"),
                error_skip=payload.get("error_skip", False),
                resolution_rate=payload.get("resolution_rate", 0)
            )
            
            # 确保 train_resp 是字典
            if not isinstance(train_resp, dict):
                api.logger.warning(f"蝉镜训练接口返回格式异常，等待重试：{train_resp}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
                else:
                    raise Exception(f"蝉镜训练接口返回格式异常：{train_resp}")
            
            # 如果是"文件未完成上传"错误，等待后重试
            if train_resp.get('code') == 50000 and '文件还未完成上传' in str(train_resp.get('msg', '')):
                if attempt < max_retries - 1:
                    api.logger.warning(f"文件未就绪，等待 {retry_delay}s 后重试 ({attempt + 1}/{max_retries})")
                    time.sleep(retry_delay)
                    continue
                else:
                    raise Exception(f"蝉镜训练接口报错：文件处理超时（已等待 {max_wait_time} 秒），请稍后重试。{train_resp}")
            elif train_resp.get('code') != 0:
                raise Exception(f"蝉镜训练接口报错：{train_resp}")
            else:
                # 成功
                break

        # 安全获取 person_id
        # 注意：蝉镜 API 的 create_customised_person 接口返回的 data 字段直接就是 person_id 字符串
        person_id = None
        if isinstance(train_resp, dict) and isinstance(train_resp.get('data'), str):
            person_id = train_resp['data']
        
        if not person_id:
            raise Exception(f"未能获取到生成的 person_id，API 返回：{train_resp}")

        _update_task(task_id, progress=30, stage="training")
        is_success = False

        # 启用调试模式以获取详细日志
        api.set_debug(True)
        api.logger.info(f"开始监控数字人训练状态，person_id: {person_id}")

        for i in range(480):
            if _is_task_cancelled(task_id):
                raise InterruptedError("task cancelled")

            status_resp = api.get_customised_person_status(person_id)
            api.logger.info(f"第 {i+1} 次轮询 - 完整响应：{json.dumps(status_resp, ensure_ascii=False, indent=2)}")
            
            if status_resp.get('code') == 0:
                data = status_resp.get('data', {})
                status = data.get('status')
                progress = data.get('progress', 0)
                
                api.logger.info(f"当前状态码：{status}, 进度：{progress}")

                # status: 0=定制中，1=已完成 (API 文档定义)，2=已完成 (实际返回)
                # 当 status=2 且 progress=100 时，表示训练成功
                if status in (1, 2, 30) or (status == 2 and progress == 100):
                    is_success = True
                    _update_task(task_id, progress=99)
                    break
                elif status in (40, -1):
                    # 明确的失败状态码
                    # 收集所有可能的错误信息字段（根据 openapi 定义）
                    api.logger.error(f"=== 数字人训练失败详细信息 ===")
                    api.logger.error(f"person_id: {person_id}")
                    api.logger.error(f"status: {status}")
                    api.logger.error(f"progress: {data.get('progress')}")
                    api.logger.error(f"msg: {data.get('msg')}")
                    api.logger.error(f"err_reason: {data.get('err_reason')}")
                    api.logger.error(f"reason: {data.get('reason')}")
                    api.logger.error(f"trace_id: {status_resp.get('trace_id')}")
                    api.logger.error(f"完整响应：{json.dumps(status_resp, ensure_ascii=False, indent=2)}")
                    
                    # 构建详细的错误消息
                    error_msg_parts = []
                    if data.get('msg'):
                        error_msg_parts.append(f"错误：{data.get('msg')}")
                    if data.get('err_reason'):
                        error_msg_parts.append(f"原因：{data.get('err_reason')}")
                    if data.get('reason'):
                        error_msg_parts.append(f"说明：{data.get('reason')}")
                    if status_resp.get('trace_id'):
                        error_msg_parts.append(f"追踪 ID: {status_resp.get('trace_id')}")
                    
                    detailed_error = " | ".join(error_msg_parts) if error_msg_parts else "模型不符合要求或未知错误"
                    raise Exception(f"数字人训练失败：{detailed_error} [trace_id: {status_resp.get('trace_id', 'N/A')}]")

                _update_task(task_id, progress=min(90, 30 + (i // 8)))
            else:
                api.logger.warning(f"状态查询接口返回异常：{json.dumps(status_resp, ensure_ascii=False)}")
            time.sleep(30)

        if not is_success:
            raise Exception("等待数字人训练超时 (4 小时)")

        result = {
            "person_id": person_id,
            "name": payload.get("name")
        }

        with get_db_session() as db:
            task = db.query(Task).filter(Task.id == task_id).first()
            if task:
                task.status = TaskStatus.succeeded
                task.progress = 100
                task.stage = "finished"
                task.result = result
                task.finished_at = datetime.now(timezone.utc)
                db.add(task)

                new_person = DhCustomPerson(
                    merchant_id=merchant_id,
                    chanjing_person_id=person_id,
                    name=payload.get("name"),
                    status=30,
                    source_task_id=task_id
                )
                db.add(new_person)

                confirm_quota(db, task)

        callback = payload.get("callback") or {}
        if callback.get("url"):
            _post_callback(callback["url"], {"event": "task.completed", "task_id": task_id, "trace_id": trace_id, "status": "succeeded", "result": result}, callback.get("secret"))

    except InterruptedError as e:
        _handle_cancelled_task(task_id, str(e))

    except Exception as e:
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        _handle_failed_task(task_id, error_msg, payload, trace_id)
    
    finally:
        # 使用统一的文件清理方法
        file_manager = FileManagerComponent()
        file_manager.cleanup_task_dir(task_dir, ignore_errors=True)


def _update_task(task_id: str, **kwargs):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            return
        for k, v in kwargs.items():
            setattr(task, k, v)
        task.updated_at = datetime.now(timezone.utc)
        db.add(task)


def _is_task_cancelled(task_id: str) -> bool:
    from redis import Redis
    try:
        redis_conn = Redis.from_url(settings.REDIS_URL)
        return redis_conn.exists(f"task:cancel:{task_id}") > 0
    except Exception:
        return False


def _download_input_file(url_or_key: str, output_path: str):
    import requests
    from urllib.parse import urlparse
    if is_oss_key(url_or_key):
        return download_file_from_oss(url_or_key, output_path)
    
    # HTTP URL
    r = requests.get(url_or_key, stream=True, timeout=300)
    r.raise_for_status()
    with open(output_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
    return output_path


# 注意：_get_uploader 函数已废弃，使用 FileManagerComponent 替代
# def _get_uploader():
#     from tasks.components import UploadFileComponent
#     return UploadFileComponent()


def _handle_cancelled_task(task_id: str, error_msg: str):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status != TaskStatus.cancelled:
            task.status = TaskStatus.cancelled
            task.stage = "cancelled"
            task.error = error_msg
            task.finished_at = datetime.now(timezone.utc)
            db.add(task)
            refund_quota(db, task, reason="cancelled")


def _handle_failed_task(task_id: str, error_msg: str, payload: dict, trace_id: str):
    with get_db_session() as db:
        task = db.query(Task).filter(Task.id == task_id).first()
        if task and task.status not in [TaskStatus.failed, TaskStatus.cancelled, TaskStatus.timeout]:
            task.status = TaskStatus.failed
            task.stage = "failed"
            task.error = error_msg[:4000]
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


def _post_callback(callback_url: str, payload: dict, secret: str = None):
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
