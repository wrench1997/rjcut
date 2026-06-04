# api_digital_human.py
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from rq import Queue

from database import get_db
from models import Merchant, Task, TaskStatus
from auth import verify_api_key
from quota import check_quota, check_concurrent_limit, reserve_quota
from config import get_settings
from chanjing_api import ChanjingAPI, ChanjingStatusCode
from schemas import DhGenerateVideoRequest
from schemas import DhCreateCustomPersonRequest
from models import DhCustomPerson # 引入模型
from oss import get_minio_client, get_settings as get_oss_settings


router = APIRouter(prefix="/v1/dh", tags=["Digital Human"])

def get_chanjing_api():
    settings = get_settings()
    return ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)

def ok(data=None): return {"code": 0, "message": "ok", "data": data}
def fail(code, msg, status_code=400): return {"code": code, "message": msg}

# ----- 1. 获取基础资源接口 (透传蝉镜API) -----

@router.get("/persons/common")
def list_common_persons(_: Merchant = Depends(verify_api_key)):
    """获取公共数字人列表（包含所有可选形象类型）"""
    api = get_chanjing_api()
    res = api.list_common_digital_persons(page=1, size=100)
    
    persons = res.get("data", {}).get("list", [])
    
    # 返回完整的数字人信息，包含所有可选的 figures
    result_list = []
    for person in persons:
        person_id = person.get("id", "")
        person_name = person.get("name", "")
        audio_man_id = person.get("audio_man_id", "")
        figures = person.get("figures", [])
        
        # 🔍 调试日志
        import logging
        logger = logging.getLogger("uvicorn.error")
        # logger.info(f"数字人：{person_name}, figures 数量：{len(figures)}")
        if figures:
            pass
            #logger.info(f"  第一个 figure: {figures[0]}")
        
        # 提取所有可选的 figure_type 列表
        available_figure_types = [fig.get("type", "") for fig in figures if fig.get("type")]
        
        # 🎭 从 figures 中获取第一个有 cover 的 figure
        cover_url = ""
        preview_video_url = ""
        figure_type = "whole_body"
        
        if figures and len(figures) > 0:
            # 找第一个有 cover 的 figure
            for fig in figures:
                if fig.get("cover"):
                    cover_url = fig.get("cover", "")
                    preview_video_url = fig.get("preview_video_url", "")
                    figure_type = fig.get("type", "whole_body")
                    break
            # 如果都没有 cover，使用第一个 figure
            if not cover_url and figures[0]:
                cover_url = figures[0].get("cover", "")
                preview_video_url = figures[0].get("preview_video_url", "")
                figure_type = figures[0].get("type", "whole_body")
        
        # 如果 figures 为空，尝试从 person 直接获取封面（兼容旧数据）
        if not cover_url:
            cover_url = person.get("cover_url", "")
            preview_video_url = person.get("preview_video_url", "")
        
        result_list.append({
            "id": person_id,
            "name": person_name,
            "person_id": person_id,
            "figure_type": figure_type,
            "available_figure_types": available_figure_types,
            "cover_url": cover_url,
            "preview_video_url": preview_video_url,
            "audio_man_id": audio_man_id,
            "gender": person.get("gender", ""),
            "figures": figures,
        })
    
    return ok(result_list)





# @router.get("/persons/custom")
# def list_custom_persons(_: Merchant = Depends(verify_api_key)):
#     api = get_chanjing_api()
#     res = api.list_customised_persons()
#     return ok(res.get("data", {}).get("list", []))



@router.get("/persons/custom")
def list_custom_persons(
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """获取商户自己训练的私有数字人列表（数据隔离）"""
    import logging
    logger = logging.getLogger("uvicorn.error")
    
    persons = (
        db.query(DhCustomPerson)
        .filter(DhCustomPerson.merchant_id == merchant.id)
        .order_by(DhCustomPerson.created_at.desc())
        .all()
    )
    
    # 🔍 打印自定义数字人详细信息
    logger.info(f"===== 自定义数字人列表 (商户：{merchant.id}) =====")
    logger.info(f"查询到 {len(persons)} 个自定义数字人")
    
    # 获取 MinIO 配置用于生成封面图 URL
    oss_settings = get_oss_settings()
    minio_client = get_minio_client()
    bucket = oss_settings.MINIO_BUCKET
    
    result_list = []
    for i, p in enumerate(persons):
        cover_url = p.cover_url
        logger.info(f"\n--- 数字人 [{i+1}/{len(persons)}] ---")
        logger.info(f"  ID: {p.chanjing_person_id}")
        logger.info(f"  名字：{p.name}")
        logger.info(f"  状态：{p.status}")
        logger.info(f"  原始 cover_url: {p.cover_url}")
        logger.info(f"  figure_type: {p.figure_type}")
        logger.info(f"  audio_man_id: {p.audio_man_id}")
        
        # 🎬 如果数据库中没有封面，尝试从蝉镜 API 动态获取
        if not cover_url:
            logger.info(f"  *** 数据库无封面，尝试从蝉镜 API 获取详情...")
            try:
                detail_resp = api.get_customised_person_status(p.chanjing_person_id)
                logger.info(f"  *** 蝉镜 API 返回：code={detail_resp.get('code')}, data={detail_resp.get('data', {})}")
                if ChanjingStatusCode.is_success(detail_resp.get('code')):
                    detail_data = detail_resp.get('data', {})
                    cover_url = detail_data.get('pic_url', '') or detail_data.get('preview_url', '') or detail_data.get('cover_url', '')
                    logger.info(f"  *** cover_url 提取结果：{cover_url[:80] if cover_url else 'None'}...")
                    if cover_url:
                        logger.info(f"  *** ✅ 从蝉镜 API 获取到封面！")
                        # 异步更新数据库（不阻塞响应）
                        try:
                            p.cover_url = cover_url
                            p.figure_type = detail_data.get('type', '') or p.figure_type
                            db.add(p)
                            db.commit()
                        except Exception as update_err:
                            logger.warning(f"  *** ⚠️ 更新数据库失败：{update_err}")
                            db.rollback()
                    else:
                        logger.error(f"  *** ❌ 蝉镜 API 也无封面字段，data keys={list(detail_data.keys())}")
            except Exception as e:
                 logger.error(f"  *** ❌ 调用蝉镜 API 失败：{e}")
        
        if p.cover_url and not p.cover_url.startswith("http"):
            # 🎬 为私有 MinIO 文件生成预签名 URL（有效期 7 天）
            try:
                from minio.error import S3Error
                cover_url = minio_client.presigned_get_object(
                    bucket_name=bucket,
                    object_name=p.cover_url,
                    expires=timedelta(days=7)
                )
                logger.info(f"  ✅ 生成预签名 URL: {cover_url[:100]}...")
            except S3Error as e:
                logger.warning(f"  ❌ 生成封面图预签名 URL 失败：{p.cover_url}, 错误：{e}")
                # 如果生成失败，尝试使用公开 URL
                minio_external = oss_settings.MINIO_EXTERNAL_ENDPOINT.rstrip("/")
                cover_url = f"{minio_external}/{bucket}/{p.cover_url}"
                logger.info(f"  🔄 使用公开 URL: {cover_url}")
        elif p.cover_url:
            logger.info(f"  ✅ 使用外部 URL: {p.cover_url[:100]}...")
        else:
            logger.warning(f"  ⚠️ 无封面图 (cover_url 为空)")
        
        result_list.append({
            "id": p.chanjing_person_id,
            "name": p.name,
            "status": p.status,
            "cover_url": cover_url,
            "figure_type": p.figure_type,  # 形象类型
            "audio_man_id": p.audio_man_id,  # 声音 ID
            "created_at": p.created_at.isoformat() if p.created_at else None
        })
    
    logger.info(f"\n===== 返回 {len(result_list)} 个自定义数字人 =====")
    
    return ok(result_list)


@router.get("/persons/custom/{person_id}")
def get_custom_person_detail(
    person_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """从蝉镜 API 拉取单个自定义数字人的详细信息"""
    api = get_chanjing_api()
    
    # 先从蝉镜 API 获取最新状态
    status_resp = api.get_customised_person_status(person_id)
    
    if not ChanjingStatusCode.is_success(status_resp.get('code')):
        return fail(ChanjingStatusCode.get_msg(status_resp.get('code')), status_code=400)
    
    data = status_resp.get('data', {})
    
    # 更新本地数据库记录（如果存在）
    local_person = (
        db.query(DhCustomPerson)
        .filter(
            DhCustomPerson.merchant_id == merchant.id,
            DhCustomPerson.chanjing_person_id == person_id
        )
        .first()
    )
    
    # 在更新本地数据库记录时，添加 audio_man_id 的同步
    if local_person:
        chanjing_status = data.get('status', 0)
        # 根据 chanjing_api.py 定义：1=制作中，2=成功，4=失败
        local_status = 30 if chanjing_status == 2 else (40 if chanjing_status in (4, 40, -1) else 10)
        
        local_person.status = local_status
        # 🎬 不要覆盖本地封面！本地存储的是从源视频第一帧提取的封面，比蝉镜的默认头像更有意义
        # local_person.cover_url = data.get('cover_url')
        local_person.audio_man_id = data.get('audio_man_id')  # 🆕 同步声音 ID
        local_person.updated_at = datetime.now(timezone.utc)
        db.add(local_person)
        db.commit()
        
    # 🎬 蝉镜 API 返回的是 pic_url / preview_url，不是 cover_url
    cover_url = data.get('pic_url') or data.get('preview_url') or data.get('cover_url')
    
    # 返回详细信息
    result = {
        "id": person_id,
        "name": data.get('name', ''),
        "status": data.get('status', 0),
        "status_text": _get_person_status_text(data.get('status', 0)),
        "progress": data.get('progress', 0),
        "cover_url": cover_url,
        "video_url": data.get('video_url'),  # 训练完成的示例视频
        "created_at": local_person.created_at.isoformat() if local_person and local_person.created_at else None
    }
    
    return ok(result)




@router.post("/persons/custom/sync")
def sync_custom_persons(
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """从蝉镜平台同步所有自定义数字人信息到本地数据库"""
    api = get_chanjing_api()
    
    # 从蝉镜 API 获取所有自定义数字人
    page = 1
    page_size = 50
    all_persons = []
    
    while True:
        resp = api.list_customised_persons(page=page, page_size=page_size, source=0)
        if not ChanjingStatusCode.is_success(resp.get('code')):
            break
        
        data_list = resp.get('data', {}).get('list', [])
        if not data_list:
            break
        
        all_persons.extend(data_list)
        
        # 如果返回数量少于页大小，说明已经是最后一页
        if len(data_list) < page_size:
            break
        page += 1
    
    synced_count = 0
    for person_data in all_persons:
        person_id = person_data.get('id')
        name = person_data.get('name', '')
        chanjing_status = person_data.get('status', 0)
        
        # 🎬 从 figures 数组中提取封面图（蝉镜 API 的实际数据结构）
        cover_url = ""
        figure_type = ""
        figures = person_data.get('figures', [])
        if figures and len(figures) > 0:
            for fig in figures:
                if fig.get('cover'):
                    cover_url = fig.get('cover', '')
                    figure_type = fig.get('type', '')
                    break
            # 如果都没有 cover，使用第一个 figure
            if not cover_url and figures[0]:
                cover_url = figures[0].get('cover', '')
                figure_type = figures[0].get('type', '')
        
        # 🎬 如果 figures 为空或没有 cover，需要调用单个数字人详情接口获取封面
        # 蝉镜的列表接口不返回封面图，只有详情接口才返回 pic_url / preview_url
        preview_video_url = ""
        if not cover_url:
            logger.info(f"  ⚠️ 列表接口无封面，尝试从详情接口获取：{person_id}")
            try:
                detail_resp = api.get_customised_person_status(person_id)
                logger.info(f"  🔍 详情接口返回完整 data: {detail_resp.get('data', {})}")
                if ChanjingStatusCode.is_success(detail_resp.get('code')):
                    detail_data = detail_resp.get('data', {})
                    # 蝉镜 API 返回的是 pic_url 和 preview_url，不是 cover_url
                    cover_url = detail_data.get('pic_url', '') or detail_data.get('preview_url', '') or detail_data.get('cover_url', '')
                    preview_video_url = detail_data.get('preview_url', '')  # 保存预览视频 URL
                    figure_type = detail_data.get('type', '') or detail_data.get('figure_type', '')
                    if cover_url:
                        logger.info(f"  ✅ 从详情接口获取到封面：{cover_url[:80]}...")
                    else:
                        logger.warning(f"  ❌ 详情接口也无封面图字段，data keys={list(detail_data.keys())}")
            except Exception as e:
                logger.warning(f"  ❌ 获取详情失败：{e}")
        
        # 🎬 降级方案：如果只有预览视频没有封面图，下载视频并提取第一帧
        if not cover_url and preview_video_url:
            logger.info(f"  🎥 无封面图，但有预览视频，尝试提取第一帧：{preview_video_url[:80]}...")
            try:
                import tempfile
                import subprocess
                from oss import upload_file_to_oss
                
                # 下载预览视频
                with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp_video:
                    tmp_video_path = tmp_video.name
                    import requests
                    video_resp = requests.get(preview_video_url, timeout=30)
                    if video_resp.status_code == 200:
                        tmp_video.write(video_resp.content)
                        tmp_video.flush()
                        
                        # 提取第一帧
                        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_img:
                            tmp_img_path = tmp_img.name
                        
                        subprocess.run(
                            ["ffmpeg", "-nostdin", "-y", "-ss", "00:00:00.000", "-i", tmp_video_path, "-vframes", "1", "-q:v", "2", tmp_img_path],
                            check=True,
                            capture_output=True,
                            timeout=30
                        )
                        
                        # 上传到 MinIO
                        object_key = f"dh_custom_persons/{person_id}_cover.jpg"
                        cover_url = upload_file_to_oss(tmp_img_path, object_key)
                        logger.info(f"  ✅ 从预览视频提取封面成功：{cover_url[:80]}...")
                        
                        # 清理临时文件
                        import os
                        os.unlink(tmp_video_path)
                        os.unlink(tmp_img_path)
                    else:
                        logger.warning(f"  ❌ 下载预览视频失败：{video_resp.status_code}")
            except Exception as e:
                logger.warning(f"  ❌ 从预览视频提取封面失败：{e}")
        
        # 兼容旧数据：如果仍然没有封面，尝试直接从 person_data 获取
        if not cover_url:
            cover_url = person_data.get('cover_url', '')
            figure_type = person_data.get('figure_type', '')
        
        audio_man_id = person_data.get('audio_man_id')  # 🆕 获取声音 ID
        
        # 映射蝉镜状态到本地状态 (根据 chanjing_api.py：1=制作中，2=成功，4=失败)
        local_status = 30 if chanjing_status == 2 else (40 if chanjing_status in (4, 40, -1) else 10)
        
        # 检查是否已存在
        existing = (
            db.query(DhCustomPerson)
            .filter(
                DhCustomPerson.merchant_id == merchant.id,
                DhCustomPerson.chanjing_person_id == person_id
            )
            .first()
        )
        
        if existing:
            # 更新现有记录
            existing.status = local_status
            # 🎬 保留本地封面！如果本地已有从源视频第一帧提取的封面，不要覆盖
            if not existing.cover_url:
                existing.cover_url = cover_url
            existing.audio_man_id = audio_man_id  # 🆕 同步声音 ID
            existing.figure_type = figure_type  # 🆕 同步形象类型
            existing.updated_at = datetime.now(timezone.utc)
            db.add(existing)
        else:
            # 创建新记录
            new_person = DhCustomPerson(
                merchant_id=merchant.id,
                chanjing_person_id=person_id,
                name=name,
                status=local_status,
                cover_url=cover_url,
                audio_man_id=audio_man_id,  # 🆕 保存声音 ID
                figure_type=figure_type  # 🆕 保存形象类型
            )
            db.add(new_person)
        
        synced_count += 1
    
    db.commit()
    
    return ok({"synced_count": synced_count, "total": len(all_persons)})


def _get_person_status_text(status: int) -> str:
    """获取数字人状态文本说明"""
    status_map = {
        0: "定制中",
        1: "已完成",
        2: "已完成",  # 实际 API 返回的已完成状态
        10: "训练中",
        30: "成功",
        40: "失败",
        -1: "错误"
    }
    return status_map.get(status, f"未知状态 ({status})")

@router.get("/voices")
def list_voices(_: Merchant = Depends(verify_api_key)):
    api = get_chanjing_api()
    res = api.list_common_audio_mans(page=1, size=100)
    return ok(res.get("data", {}).get("list", []))

# ----- 2. 创建异步生成任务 -----

@router.post("/tasks/generate")
def create_dh_generate_task(
    req: DhGenerateVideoRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    # 此逻辑与 api_service.py 极度相似
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_dh_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant): return fail(40201, "insufficient quota")
    if not check_concurrent_limit(db, merchant): return fail(42901, "limit reached")

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="dh_generate",  # 新任务类型
        status=TaskStatus.queued,
        payload=req.model_dump(),
        timeout_seconds=req.timeout_seconds,
        stage="queued",
    )

    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)  # 预扣费

    from api_service import get_queue
    queue = get_queue()
    job = queue.enqueue(
        "task_runner.run_dh_generate_video_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_timeout=req.timeout_seconds + 60,
    )
    task.rq_job_id = job.id
    db.commit()

    return ok({"task_id": task_id, "status": "queued"})



@router.post("/tasks/create-person")
def create_dh_custom_person_task(
    req: DhCreateCustomPersonRequest,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db),
):
    trace_id = "trace_" + uuid.uuid4().hex[:16]
    task_id = "task_dhc_" + uuid.uuid4().hex[:16]

    if not check_quota(merchant): return fail(40201, "insufficient quota")
    if not check_concurrent_limit(db, merchant): return fail(42901, "limit reached")

    task = Task(
        id=task_id,
        merchant_id=merchant.id,
        trace_id=trace_id,
        client_ref_id=req.client_ref_id,
        task_type="dh_custom_person", 
        status=TaskStatus.queued,
        payload=req.model_dump(),
        timeout_seconds=14400, # 训练时间可能较长，设为 4 小时超时
        stage="queued",
    )

    db.add(task)
    db.flush()
    reserve_quota(db, merchant, task)  # 预扣费

    from api_service import get_queue
    queue = get_queue()
    job = queue.enqueue(
        "task_runner.run_dh_create_person_task",
        task_id=task_id,
        payload=req.model_dump(),
        trace_id=trace_id,
        merchant_id=merchant.id,
        job_timeout=14400 + 60,
    )
    task.rq_job_id = job.id
    db.commit()

    return ok({"task_id": task_id, "status": "queued"})


# ----- 3. 删除接口 -----

@router.post("/tasks/{task_id}/delete")
def delete_dh_video_task(
    task_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """删除数字人视频任务
    
    调用蝉镜 API 删除视频，同时更新本地数据库状态
    """
    api = get_chanjing_api()
    
    # 先查询本地任务是否存在
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.merchant_id == merchant.id,
        Task.task_type == "dh_generate"
    ).first()
    
    if not task:
        return fail(40400, "task not found", status_code=404)
    
    # 调用蝉镜 API 删除视频
    resp = api.delete_video(task_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    # 更新本地任务状态为已删除
    task.status = TaskStatus.cancelled
    task.stage = "deleted"
    task.error = "deleted by user"
    db.add(task)
    db.commit()
    
    # 退还配额
    from quota import refund_quota
    refund_quota(db, task, reason="deleted by user")
    
    return ok({"task_id": task_id})


@router.post("/persons/custom/{person_id}/delete")
def delete_custom_person(
    person_id: str,
    merchant: Merchant = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """删除定制数字人
    
    调用蝉镜 API 删除数字人，同时删除本地数据库记录
    """
    api = get_chanjing_api()
    
    # 先检查本地是否存在该数字人
    local_person = (
        db.query(DhCustomPerson)
        .filter(
            DhCustomPerson.merchant_id == merchant.id,
            DhCustomPerson.chanjing_person_id == person_id
        )
        .first()
    )
    
    if not local_person:
        return fail(40400, "person not found", status_code=404)
    
    # 调用蝉镜 API 删除数字人
    resp = api.delete_customised_person(person_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    # 删除本地数据库记录
    db.delete(local_person)
    db.commit()
    
    return ok({"person_id": person_id})


@router.post("/voices/{audio_id}/delete")
def delete_custom_audio(
    audio_id: str,
    merchant: Merchant = Depends(verify_api_key)
):
    """删除定制声音
    
    调用蝉镜 API 删除定制声音
    """
    api = get_chanjing_api()
    
    resp = api.delete_customised_audio(audio_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    return ok({"audio_id": audio_id})


@router.post("/files/{file_id}/delete")
def delete_file(
    file_id: str,
    merchant: Merchant = Depends(verify_api_key)
):
    """删除文件
    
    调用蝉镜 API 删除已上传的文件
    """
    api = get_chanjing_api()
    
    resp = api.delete_file(file_id)
    
    if not ChanjingStatusCode.is_success(resp.get('code')):
        return fail(
            ChanjingStatusCode.get_msg(resp.get('code')), 
            status_code=400
        )
    
    return ok({"file_id": file_id})
