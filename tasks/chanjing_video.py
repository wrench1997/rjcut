"""
蝉镜数字人视频任务处理器
"""

import os
import shutil
import json
import hashlib
import subprocess
import traceback
import time
from datetime import datetime, timezone
from typing import Dict, Any

from config import get_settings
from database import get_db_session
from models import Task, TaskStatus, DhCustomPerson
from quota import confirm_quota, refund_quota
from oss import download_file_from_oss, is_oss_key, upload_file_to_oss
from chanjing_api_v2 import create_chanjing_api_v2, ChanjingStatusCode
from tasks import register_task
from tasks.components import TaskContext, FileManagerComponent

settings = get_settings()


# ============================================================
# 蝉镜 API 状态码常量定义 (基于 chanjing-openapi.yaml)
# ============================================================

# 数字人训练状态 (dto.DpOpenCustomisedPersonItemRspData.status)
# 文档定义：0=定制中，1=已完成
PERSON_STATUS_TRAINING = 0      # 定制中
PERSON_STATUS_COMPLETED = 1     # 已完成
PERSON_STATUS_COMPLETED_ALT = 2 # 已完成 (实际 API 返回，需配合 progress=100 判断)
PERSON_STATUS_FAILED = 40       # 失败
PERSON_STATUS_ERROR = -1        # 错误

# 视频合成状态 (dto.DpOpenVideoListInfo.status)
# 注意：OpenAPI 文档未明确定义视频状态码，以下为常见值
# 根据实际 API 返回调整：
VIDEO_STATUS_PROCESSING = 2     # 处理中
VIDEO_STATUS_COMPLETED = 1      # 已完成
VIDEO_STATUS_COMPLETED_ALT = 30 # 已完成 (实际 API 返回)
VIDEO_STATUS_FAILED = 40        # 失败
VIDEO_STATUS_ERROR = -1         # 错误
# 其他可能的状态码（根据实际 API 返回添加）：
VIDEO_STATUS_PENDING = 0        # 等待中（可能）
VIDEO_STATUS_TRANSCODING = 3    # 转码中（可能）

# 文件上传状态 (dto.DpOpenFileItemRspData.status)
FILE_STATUS_UPLOADING = 0       # 上传中
FILE_STATUS_COMPLETED = 1       # 已完成
FILE_STATUS_FAILED = 2          # 失败

# 语音合成状态 (dto.OpenAudioTaskStateRsp.status)
AUDIO_STATUS_COMPLETED = 1      # 已完成
AUDIO_STATUS_PROCESSING = 2     # 处理中
AUDIO_STATUS_FAILED = 40        # 失败


@register_task("dh_generate_video")
def run_dh_generate_video_task(task_id: str, payload: dict, trace_id: str, merchant_id: str):
    # 使用 V2 API 客户端，增强稳定性和重试机制（🆕 传统模式）
    api = create_chanjing_api_v2(
        config={
            "timeout": 120,  # 视频生成耗时较长
            "max_retries": 5,
            "enable_cache": False,  # 视频状态不缓存，保证实时性
            "enable_stats": True,
            "auto_auth": False,  # 🆕 从环境变量读取认证信息（更稳定）
        }
    )

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

        # 🆕 获取 audio_man_id：如果 payload 中未提供，则从数字人详情中获取原生声音 ID
        # 前端发送的字段名是 audio_man_id
        audio_man_id = payload.get("audio_man_id")
        api.logger.info(f"[DEBUG] payload keys: {list(payload.keys())}")
        api.logger.info(f"[DEBUG] audio_man_id from payload: {audio_man_id}")
        digital_person_id = payload.get("person_id")
        
        if not audio_man_id and digital_person_id:
            api.logger.info(f"audio_man 未提供，正在从数字人 {digital_person_id} 详情中获取原生声音 ID...")
            person_detail_resp = api.get_customised_person_status(digital_person_id)
            if ChanjingStatusCode.is_success(person_detail_resp.get('code')):
                person_data = person_detail_resp.get('data', {})
                audio_man_id = person_data.get('audio_man_id')
                if audio_man_id:
                    api.logger.info(f"获取到数字人原生声音 ID: {audio_man_id}")
                else:
                    # 如果定制数字人没有 audio_man_id，返回错误，提示用户选择公共数字人
                    api.logger.warning(f"数字人 {digital_person_id} 未关联声音 ID，将使用默认 TTS 配置")
                    # 不抛出异常，允许继续执行（蝉镜 API 会处理）
        
        # 🎭 获取 figure_type：优先使用 payload 中传递的值（前端已根据数字人类型正确设置）
        figure_type = payload.get("figure_type")
        if not figure_type:
            figure_type = "whole_body"
            api.logger.warning(f"payload 中未提供 figure_type，使用默认值：{figure_type}")

        # 🎬 构建完整的视频参数（支持蝉镜 API 所有参数）
        video_params = {
            "digital_person_id": digital_person_id,
            "text": payload.get("text"),
            
            # 数字人形象设置
            "figure_type": figure_type,
            "drive_mode": payload.get("drive_mode", "random"),
            "person_x": payload.get("person_x", 0),
            "person_y": payload.get("person_y", 0),
            "person_width": payload.get("person_width", 1080),
            "person_height": payload.get("person_height", 1920),
            "backway": payload.get("backway", 1),
            "is_rgba_mode": payload.get("is_rgba_mode", False),
            
            # 音频设置
            "speed": payload.get("speed", 1.0),
            "pitch": payload.get("pitch", 1.0),
            "volume": payload.get("volume", 100),
            "language": payload.get("language", "cn"),
            "language_boost": payload.get("language_boost"),
            
            # 背景设置
            "bg_color": payload.get("bg_color", "#EDEDED"),
            
            # 画质设置
            "resolution_rate": payload.get("resolution_rate", 0),
            "model": payload.get("model", 1),
            "screen_width": payload.get("screen_width", 1080),
            "screen_height": payload.get("screen_height", 1920),
            
            # 字幕设置
            "hide_subtitle": payload.get("hide_subtitle", True),
            "subtitle_config": payload.get("subtitle_config"),
            
            # 水印设置
            "add_compliance_watermark": payload.get("add_compliance_watermark", True),
            "compliance_watermark_position": payload.get("compliance_watermark_position", 0),
            
            # 回调
            "callback": payload.get("callback_url"),
        }
        
        # 始终传递 audio_man_id 字段，蝉镜 API 需要该字段（空字符串表示使用默认 TTS）
        video_params["audio_man_id"] = audio_man_id or ""
        
        api.logger.info(f"调用蝉镜 create_video，参数：{json.dumps(video_params, ensure_ascii=False, default=str)}")
        
        video_response = api.create_video(**video_params)
        if not ChanjingStatusCode.is_success(video_response.get('code')):
            error_msg = ChanjingStatusCode.get_msg(video_response.get('code'))
            raise Exception(f"蝉镜接口报错：{error_msg} - {video_response}")

        chanjing_video_id = video_response['data']
        _update_task(task_id, progress=10, stage="waiting_chanjing_render")

        chanjing_video_url = None
        api.set_debug(True)  # 启用调试模式
        poll_count = 0
        last_status = None
        for _ in range(180):
            poll_count += 1
            if _is_task_cancelled(task_id):
                raise InterruptedError("task cancelled")

            status_resp = api.get_video_status(chanjing_video_id)
            
            if ChanjingStatusCode.is_success(status_resp.get('code')):
                data = status_resp.get('data', {})
                status = data.get('status')
                progress = data.get('progress', 0)
                video_url = data.get('video_url')
                msg = data.get('msg', '')

                # 只在状态变化时打印完整日志，避免日志过多
                if status != last_status:
                    api.logger.info(f"第 {poll_count} 次轮询 - 状态变化：{json.dumps(status_resp, ensure_ascii=False, indent=2)}")
                    last_status = status
                else:
                    api.logger.info(f"第 {poll_count} 次轮询 - status={status}, progress={progress}, video_url={video_url}, msg={msg}")

                mapped_progress = 10 + int(progress * 0.8) if progress else 10
                _update_task(task_id, progress=mapped_progress)

                # 判断完成：status=1 或 status=30 (实际 API 返回) 且 progress=100 且有 video_url
                # 注意：OpenAPI 文档未明确定义状态码，需要根据实际返回调整
                if status in (VIDEO_STATUS_COMPLETED, VIDEO_STATUS_COMPLETED_ALT):
                    if video_url:
                        chanjing_video_url = video_url
                        api.logger.info(f"✅ 视频渲染完成 (status={status})，URL: {chanjing_video_url}")
                        break
                    else:
                        api.logger.warning(f"状态={status} 已完成，但 video_url 为空，继续等待...")
                elif status == VIDEO_STATUS_PROCESSING:
                    api.logger.info(f"⏳ 视频处理中 (status=2), 进度：{progress}%")
                elif status in (VIDEO_STATUS_FAILED, VIDEO_STATUS_ERROR, 40):
                    error_msg = msg or data.get('err_reason') or data.get('reason') or f'未知错误 (status={status})'
                    api.logger.error(f"❌ 蝉镜渲染失败：{error_msg}")
                    raise Exception(f"蝉镜渲染失败：{error_msg}")
                elif status == VIDEO_STATUS_PENDING:
                    api.logger.info(f"⏳ 视频等待中 (status=0)")
                elif status == VIDEO_STATUS_TRANSCODING:
                    api.logger.info(f"⏳ 视频转码中 (status=3), 进度：{progress}%")
                else:
                    api.logger.warning(f"⚠️ 未知状态码：status={status}, progress={progress}, msg={msg}")
            else:
                api.logger.warning(f"❌ 状态查询接口返回异常：code={status_resp.get('code')}, msg={status_resp.get('msg')}")
                # 如果是 token 过期等错误，尝试重新获取
                if status_resp.get('code') in [ChanjingStatusCode.ACCESS_TOKEN_ERROR, 10001]:
                    api.access_token = api.get_access_token()
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
    # 使用 V2 API 客户端，增强稳定性和重试机制（🆕 传统模式）
    api = create_chanjing_api_v2(
        config={
            "timeout": 300,  # 数字人训练耗时很长（5-10 分钟）
            "max_retries": 5,
            "enable_cache": False,  # 数字人状态不缓存
            "enable_stats": True,
            "auto_auth": False,  # 🆕 从环境变量读取认证信息（更稳定）
        }
    )

    task_dir = os.path.join(settings.BASE_TASK_DIR, task_id)
    os.makedirs(task_dir, exist_ok=True)

    try:
        _update_task(task_id, status=TaskStatus.processing, progress=5, stage="downloading_source", started_at=datetime.now(timezone.utc))
        if _is_task_cancelled(task_id):
            raise InterruptedError("task cancelled")
        source_key = payload.get("source_video_oss_key")
        local_source = os.path.join(task_dir, "source.mp4")
        _download_input_file(source_key, local_source)

        # 🎬 从源视频提取第一帧作为封面图
        cover_image_path = os.path.join(task_dir, "cover.jpg")
        try:
            subprocess.run(
                ["ffmpeg", "-nostdin", "-y", "-ss", "00:00:00.000", "-i", local_source, "-vframes", "1", "-q:v", "2", cover_image_path],
                check=True,
                capture_output=True,
                timeout=30
            )
            api.logger.info(f"成功提取视频第一帧：{cover_image_path}")
        except Exception as e:
            api.logger.warning(f"提取视频封面失败：{e}，将使用蝉镜 API 返回的封面")
            cover_image_path = None

        _update_task(task_id, progress=15, stage="uploading_to_chanjing")
        chanjing_file_id = api.upload_file(local_source, service="customised_person")
        
        # 📸 上传封面图到 OSS
        cover_oss_key = None
        if cover_image_path and os.path.exists(cover_image_path):
            try:
                from oss import generate_oss_key
                cover_oss_key = generate_oss_key(merchant_id, "covers", f"{task_id}_cover.jpg")
                upload_file_to_oss(cover_image_path, cover_oss_key, "image/jpeg")
                api.logger.info(f"封面图已上传至 OSS: {cover_oss_key}")
            except Exception as e:
                api.logger.warning(f"上传封面图到 OSS 失败：{e}")
                cover_oss_key = None

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
            if train_resp.get('code') == ChanjingStatusCode.SYSTEM_ERROR and '文件还未完成上传' in str(train_resp.get('msg', '')):
                if attempt < max_retries - 1:
                    api.logger.warning(f"文件未就绪，等待 {retry_delay}s 后重试 ({attempt + 1}/{max_retries})")
                    time.sleep(retry_delay)
                    continue
                else:
                    raise Exception(f"蝉镜训练接口报错：文件处理超时（已等待 {max_wait_time} 秒），请稍后重试。{train_resp}")
            elif not ChanjingStatusCode.is_success(train_resp.get('code')):
                error_msg = ChanjingStatusCode.get_msg(train_resp.get('code'))
                raise Exception(f"蝉镜训练接口报错：{error_msg} - {train_resp}")
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
            
            if ChanjingStatusCode.is_success(status_resp.get('code')):
                data = status_resp.get('data', {})
                status = data.get('status')
                progress = data.get('progress', 0)
                
                api.logger.info(f"当前状态码：{status}, 进度：{progress}")

                # 根据蝉镜 OpenAPI 文档 (dto.DpOpenCustomisedPersonItemRspData):
                # PERSON_STATUS_COMPLETED=已完成，PERSON_STATUS_COMPLETED_ALT=已完成 (实际 API 返回)
                if status == PERSON_STATUS_COMPLETED or (status == PERSON_STATUS_COMPLETED_ALT and progress == 100):
                    is_success = True
                    _update_task(task_id, progress=99)
                    
                    # 🆕 获取数字人详情，提取原生 audio_man_id
                    person_detail = api.get_customised_person_status(person_id)
                    audio_man_id = None
                    if ChanjingStatusCode.is_success(person_detail.get('code')):
                        audio_man_id = person_detail.get('data', {}).get('audio_man_id')
                        api.logger.info(f"获取到原生声音 ID: {audio_man_id}")
                    break
                elif status in (PERSON_STATUS_FAILED, PERSON_STATUS_ERROR):
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

# 获取数字人详情，提取 figure_type、cover_url 和 audio_man_id
                person_detail = api.get_customised_person_status(person_id)
                figure_type = None
                cover_url = None
                audio_man_id = None
                if ChanjingStatusCode.is_success(person_detail.get('code')):
                    person_data = person_detail.get('data', {})
                    figure_type = person_data.get('figure_type')
                    # 🎬 优先使用从源视频提取的封面图，其次使用蝉镜 API 返回的封面
                    cover_url = cover_oss_key  # 使用本地上传的封面图
                    audio_man_id = person_data.get('audio_man_id')  # 🆕 获取原生声音 ID
                    api.logger.info(f"获取到形象类型：{figure_type}, 封面：{cover_url}, 声音 ID: {audio_man_id}")
                
                new_person = DhCustomPerson(
                    merchant_id=merchant_id,
                    chanjing_person_id=person_id,
                    name=payload.get("name"),
                    status=30,
                    figure_type=figure_type,  # 形象类型
                    cover_url=cover_url,  # 🎬 使用源视频第一帧作为封面
                    audio_man_id=audio_man_id,  # 🆕 原生声音 ID
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
