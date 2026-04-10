"""
音视频处理组件 - 责任链模式
将下载、ASR 识别、FFMPEG 切割、OSS 上传等动作封装成独立组件
"""

import os
import shutil
import hashlib
import mimetypes
import json
import time
import traceback
from typing import Optional, Dict, Any, List
from abc import ABC, abstractmethod
from urllib.parse import urljoin, urlparse
import requests

from config import get_settings
from oss import upload_file_to_oss, download_file_from_oss, is_oss_key, copy_file_in_oss
from cut_transition import get_duration

settings = get_settings()


# ═══════════════════════════════════════════════
#  责任链基础类
# ═══════════════════════════════════════════════

class Component(ABC):
    """组件基类"""
    
    def __init__(self, name: str):
        self.name = name
        self._next: Optional['Component'] = None
    
    def set_next(self, component: 'Component') -> 'Component':
        """设置下一个组件"""
        self._next = component
        return component
    
    def handle(self, context: 'TaskContext') -> 'TaskContext':
        """处理请求并传递给下一个组件"""
        context = self.process(context)
        if self._next:
            return self._next.handle(context)
        return context
    
    @abstractmethod
    def process(self, context: 'TaskContext') -> 'TaskContext':
        """具体处理逻辑，由子类实现"""
        pass


class TaskContext:
    """任务上下文，在组件链中传递"""
    
    def __init__(self, task_id: str, payload: dict, merchant_id: str, task_dir: str):
        self.task_id = task_id
        self.payload = payload
        self.merchant_id = merchant_id
        self.task_dir = task_dir
        self.input_dir = os.path.join(task_dir, "input")
        self.output_dir = os.path.join(task_dir, "output")
        self.scene_dir = os.path.join(task_dir, "scenes")
        
        # 中间产物
        self.input_video_path: Optional[str] = None
        self.script_path: Optional[str] = None
        self.script_data: Optional[dict] = None
        self.corrections_path: Optional[str] = None
        self.corrections_data: Optional[list] = None
        self.font_path: Optional[str] = None
        self.bgm_path: Optional[str] = None
        self.timeline_path: Optional[str] = None
        self.final_output_path: Optional[str] = None
        
        # 结果数据
        self.result: Dict[str, Any] = {}
        self.error: Optional[str] = None
        
        # 确保目录存在
        for dir_path in [self.input_dir, self.output_dir, self.scene_dir]:
            os.makedirs(dir_path, exist_ok=True)


# ═══════════════════════════════════════════════
#  下载组件
# ═══════════════════════════════════════════════

class DownloadInputComponent(Component):
    """下载输入文件组件"""
    
    def __init__(self):
        super().__init__("download_input")
    
    def process(self, context: TaskContext) -> TaskContext:
        req = context.payload
        
        # 下载主视频
        video_url = req["input"]["video_url"]
        video_name = self._safe_name_from_url(video_url, "input.mp4")
        context.input_video_path = os.path.join(context.input_dir, video_name)
        
        print(f"📥 下载主视频：{video_url} -> {context.input_video_path}")
        self._download_input_file(video_url, context.input_video_path)
        
        # 验证视频时长
        try:
            vid_duration = get_duration(context.input_video_path)
            if vid_duration > 300:
                raise ValueError(f"视频时长 {vid_duration:.1f}s 超过最大限制 300s (5 分钟)，请切片后重试。")
        except Exception as e:
            if isinstance(e, ValueError):
                raise e
            pass  # 忽略 ffprobe 获取失败的异常
        
        return context
    
    def _safe_name_from_url(self, url: str, default_name: str) -> str:
        path = urlparse(url).path
        name = os.path.basename(path.strip("/"))
        return name or default_name
    
    def _download_input_file(self, url_or_key: str, output_path: str):
        if is_oss_key(url_or_key):
            return download_file_from_oss(url_or_key, output_path)
        return self._download_file(url_or_key, output_path)
    
    def _download_file(self, url: str, output_path: str, timeout: int = 300):
        r = requests.get(url, stream=True, timeout=timeout)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
        return output_path


class DownloadScriptComponent(Component):
    """下载脚本文件组件"""
    
    def __init__(self):
        super().__init__("download_script")
    
    def process(self, context: TaskContext) -> TaskContext:
        req = context.payload
        
        script_url = req["input"].get("script_url")
        if script_url:
            script_name = self._safe_name_from_url(script_url, "script.json")
            context.script_path = os.path.join(context.input_dir, script_name)
            print(f"📥 下载脚本：{script_url} -> {context.script_path}")
            self._download_input_file(script_url, context.script_path)
            
            with open(context.script_path, "r", encoding="utf-8") as f:
                context.script_data = json.load(f)
        
        return context
    
    def _safe_name_from_url(self, url: str, default_name: str) -> str:
        path = urlparse(url).path
        name = os.path.basename(path.strip("/"))
        return name or default_name
    
    def _download_input_file(self, url_or_key: str, output_path: str):
        if is_oss_key(url_or_key):
            return download_file_from_oss(url_or_key, output_path)
        return self._download_file(url_or_key, output_path)
    
    def _download_file(self, url: str, output_path: str, timeout: int = 300):
        r = requests.get(url, stream=True, timeout=timeout)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
        return output_path


class DownloadCorrectionsComponent(Component):
    """下载纠错字典组件"""
    
    def __init__(self):
        super().__init__("download_corrections")
    
    def process(self, context: TaskContext) -> TaskContext:
        req = context.payload
        
        corrections_url = req["input"].get("corrections_url")
        if corrections_url:
            corrections_name = self._safe_name_from_url(corrections_url, "corrections.json")
            context.corrections_path = os.path.join(context.input_dir, corrections_name)
            print(f"📥 下载纠错字典：{corrections_url} -> {context.corrections_path}")
            self._download_input_file(corrections_url, context.corrections_path)
            
            with open(context.corrections_path, "r", encoding="utf-8") as f:
                context.corrections_data = json.load(f)
        
        return context
    
    def _safe_name_from_url(self, url: str, default_name: str) -> str:
        path = urlparse(url).path
        name = os.path.basename(path.strip("/"))
        return name or default_name
    
    def _download_input_file(self, url_or_key: str, output_path: str):
        if is_oss_key(url_or_key):
            return download_file_from_oss(url_or_key, output_path)
        return self._download_file(url_or_key, output_path)
    
    def _download_file(self, url: str, output_path: str, timeout: int = 300):
        r = requests.get(url, stream=True, timeout=timeout)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
        return output_path


class DownloadFontComponent(Component):
    """下载字体文件组件"""
    
    def __init__(self):
        super().__init__("download_font")
    
    def process(self, context: TaskContext) -> TaskContext:
        req = context.payload
        
        font_url = req.get("subtitle", {}).get("font_url")
        if font_url:
            font_name = self._safe_name_from_url(font_url, "custom_font.ttf")
            context.font_path = os.path.join(context.input_dir, font_name)
            print(f"📥 下载字体：{font_url} -> {context.font_path}")
            self._download_input_file(font_url, context.font_path)
        
        return context
    
    def _safe_name_from_url(self, url: str, default_name: str) -> str:
        path = urlparse(url).path
        name = os.path.basename(path.strip("/"))
        return name or default_name
    
    def _download_input_file(self, url_or_key: str, output_path: str):
        if is_oss_key(url_or_key):
            return download_file_from_oss(url_or_key, output_path)
        return self._download_file(url_or_key, output_path)
    
    def _download_file(self, url: str, output_path: str, timeout: int = 300):
        r = requests.get(url, stream=True, timeout=timeout)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
        return output_path


class DownloadBgmComponent(Component):
    """下载背景音乐组件"""
    
    def __init__(self):
        super().__init__("download_bgm")
    
    def process(self, context: TaskContext) -> TaskContext:
        req = context.payload
        
        bgm_url = req.get("audio", {}).get("bgm_url")
        if bgm_url:
            bgm_filename = self._safe_name_from_url(bgm_url, "bgm.mp3")
            context.bgm_path = os.path.join(context.input_dir, bgm_filename)
            print(f"📥 下载背景音乐：{bgm_url} -> {context.bgm_path}")
            self._download_input_file(bgm_url, context.bgm_path)
        
        return context
    
    def _safe_name_from_url(self, url: str, default_name: str) -> str:
        path = urlparse(url).path
        name = os.path.basename(path.strip("/"))
        return name or default_name
    
    def _download_input_file(self, url_or_key: str, output_path: str):
        if is_oss_key(url_or_key):
            return download_file_from_oss(url_or_key, output_path)
        return self._download_file(url_or_key, output_path)
    
    def _download_file(self, url: str, output_path: str, timeout: int = 300):
        r = requests.get(url, stream=True, timeout=timeout)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
        return output_path


class DownloadScenesComponent(Component):
    """下载场景素材组件"""
    
    def __init__(self):
        super().__init__("download_scenes")
    
    def process(self, context: TaskContext) -> TaskContext:
        req = context.payload
        
        scene_base_url = req["input"].get("scene_base_url")
        if context.script_data and scene_base_url:
            print(f"📥 下载场景素材...")
            failed_scenes = []
            
            for seg in context.script_data.get("segments", []):
                if seg.get("flag") == "scene" and seg.get("scene_file"):
                    original_scene_file = seg["scene_file"]
                    basename = os.path.basename(original_scene_file)
                    local_scene_path = os.path.join(context.scene_dir, basename)

                    if os.path.isfile(local_scene_path):
                        seg["scene_file"] = basename
                        continue

                    try:
                        if is_oss_key(scene_base_url):
                            scene_key = scene_base_url.rstrip("/") + "/" + original_scene_file
                            print(f"  📥 从 OSS 下载：{scene_key}")
                            download_file_from_oss(scene_key, local_scene_path)
                        else:
                            scene_url = urljoin(scene_base_url.rstrip("/") + "/", original_scene_file)
                            print(f"  📥 下载：{scene_url}")
                            self._download_file(scene_url, local_scene_path)
                        
                        seg["scene_file"] = basename
                        print(f"  ✅ 下载成功：{basename}")
                        
                    except Exception as e:
                        print(f"  ⚠️  场景素材下载失败：{original_scene_file}")
                        print(f"    错误：{str(e)}")
                        seg["flag"] = "human"
                        seg["scene_file"] = None
                        failed_scenes.append(original_scene_file)
            
            if failed_scenes:
                print(f"⚠️  共有 {len(failed_scenes)} 个场景素材下载失败，已转为 human 类型")
            
            if context.script_path:
                with open(context.script_path, "w", encoding="utf-8") as f:
                    json.dump(context.script_data, f, ensure_ascii=False, indent=2)
        
        return context
    
    def _download_file(self, url: str, output_path: str, timeout: int = 300):
        r = requests.get(url, stream=True, timeout=timeout)
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
        return output_path


# ═══════════════════════════════════════════════
#  上传组件
# ═══════════════════════════════════════════════

class UploadFileComponent(Component):
    """上传文件到 OSS 组件"""
    
    def __init__(self):
        super().__init__("upload_file")
    
    def process(self, context: TaskContext) -> TaskContext:
        # 此组件通常作为责任链的最后一个节点
        # 具体上传逻辑在各个任务处理器中调用
        return context
    
    def build_oss_file_entry(self, task_id: str, file_key: str, local_path: str, merchant_id: str) -> dict:
        """构建 OSS 文件条目"""
        if not local_path or not os.path.isfile(local_path):
            return {
                "oss_key": None,
                "filename": None,
                "exists": False,
                "size": None,
                "mime_type": None,
                "download_url": None,
            }

        filename = os.path.basename(local_path)
        ext = os.path.splitext(filename)[1]
        oss_key = f"{merchant_id}/tasks/{task_id}/{file_key}{ext}"
        mime = mimetypes.guess_type(local_path)[0] or "application/octet-stream"

        max_retries = 3
        last_err = None

        for attempt in range(max_retries):
            try:
                upload_file_to_oss(local_path, oss_key, content_type=mime)
                last_err = None
                break
            except Exception as e:
                last_err = e
                print(f"⚠️  上传 OSS 失败 ({file_key})，第 {attempt + 1}/{max_retries} 次：{e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)

        if last_err:
            raise last_err

        return {
            "oss_key": oss_key,
            "filename": filename,
            "exists": True,
            "size": os.path.getsize(local_path),
            "mime_type": mime,
            "download_url": f"/v1/tasks/{task_id}/files/{file_key}",
        }


# ═══════════════════════════════════════════════
#  组件构建器
# ═══════════════════════════════════════════════

def build_download_chain() -> Component:
    """构建完整的下载责任链"""
    download_input = DownloadInputComponent()
    download_script = DownloadScriptComponent()
    download_corrections = DownloadCorrectionsComponent()
    download_font = DownloadFontComponent()
    download_bgm = DownloadBgmComponent()
    download_scenes = DownloadScenesComponent()
    
    # 按顺序连接
    download_input.set_next(download_script) \
                  .set_next(download_corrections) \
                  .set_next(download_font) \
                  .set_next(download_bgm) \
                  .set_next(download_scenes)
    
    return download_input
