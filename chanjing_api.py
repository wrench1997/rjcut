# apps/digital_human/chanjing_api.py

import requests
import json
import time
import os
import logging
from typing import Dict, Any, List, Union, Optional
from functools import lru_cache
import threading

from urllib3 import response

# 蝉镜 API 响应状态码
class ChanjingStatusCode:
    """蝉镜 API 响应状态码常量"""
    SUCCESS = 0                           # 响应成功
    PARAM_FORMAT_ERROR = 400              # 传入参数格式错误
    ACCESS_TOKEN_ERROR = 10400            # AccessToken 验证失败 / APP 状态有误
    PARAM_ERROR = 40000                   # 参数错误
    SYSTEM_ERROR = 50000                  # 系统内部错误
    SYSTEM_ERROR_51000 = 51000            # 系统错误
    QPS_LIMIT_EXCEEDED = 40001            # 超出 QPS 限制
    PERSON_LIMIT_EXCEEDED = 40002         # 定制数字人数量到达上限
    
    # 状态码说明
    STATUS_MSG = {
        0: "响应成功",
        400: "传入参数格式错误",
        10400: "AccessToken 验证失败或 APP 状态有误",
        40000: "参数错误",
        40001: "超出 QPS 限制",
        40002: "定制数字人数量到达上限",
        50000: "系统内部错误",
        51000: "系统错误",
    }
    
    @classmethod
    def get_msg(cls, code: int) -> str:
        """获取状态码对应的说明"""
        return cls.STATUS_MSG.get(code, f"未知状态码：{code}")
    
    @classmethod
    def is_success(cls, code: Optional[int]) -> bool:
        """判断状态码是否表示成功"""
        # 兼容 code 为 None 的情况（旧版 API 可能不返回 code）
        if code is None:
            return True  # 假设没有错误码表示成功
        return code == 0


class ChanjingAPI:
    """蝉镜 API 客户端，用于数字人视频生成、管理和下载"""
    
    # 数字人状态常量
    PERSON_STATUS_MAKING = 1      # 制作中
    PERSON_STATUS_SUCCESS = 2     # 成功
    PERSON_STATUS_FAILED = 4      # 失败
    PERSON_STATUS_SYSTEM_ERROR = 5  # 系统错误
    
    def __init__(self, app_id: str, secret_key: str):
        """初始化API客户端"""
        self.app_id = app_id
        self.secret_key = secret_key
        self.base_url = "https://www.chanjing.cc/api/open/v1"
        self.logger = self._setup_logger()
        self.debug = False
        self.access_token = None  # 延迟获取 token
        self._token_expired = False  # token 是否已失效标记
# 🐌 添加缓存机制降低 API 并发量
        self._cache = {}  # 简单内存缓存：{key: {'data': xxx, 'expire_at': timestamp}}
        self._cache_lock = threading.Lock()
        self._cache_ttl = {
            'list_common_persons': 300,  # 公共数字人列表缓存 5 分钟
            'list_common_audio': 300,    # 声音列表缓存 5 分钟
            'customised_person_status': 60,  # 数字人状态缓存 1 分钟
        }
    
    def _setup_logger(self):
        """设置日志记录器"""
        logger = logging.getLogger("chanjing")
        logger.setLevel(logging.INFO)
        
        ch = logging.StreamHandler()
        ch.setLevel(logging.INFO)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        ch.setFormatter(formatter)
        logger.addHandler(ch)
        
        return logger
    
    def _cache_get(self, key: str):
        """从缓存获取数据，如果过期则返回 None"""
        with self._cache_lock:
            if key in self._cache:
                entry = self._cache[key]
                if time.time() < entry['expire_at']:
                    self.logger.debug(f"缓存命中：{key}")
                    return entry['data']
                else:
                    # 过期了，删除
                    del self._cache[key]
                    self.logger.debug(f"缓存过期：{key}")
        return None
    
    def _cache_set(self, key: str, data: Any, ttl: int = 60):
        """设置缓存数据"""
        with self._cache_lock:
            self._cache[key] = {
                'data': data,
                'expire_at': time.time() + ttl
            }
            self.logger.debug(f"缓存设置：{key}, TTL={ttl}s")
    
    def _cache_clear(self, key_pattern: str = None):
        """清除缓存，支持按前缀清除"""
        with self._cache_lock:
            if key_pattern:
                keys_to_delete = [k for k in self._cache.keys() if k.startswith(key_pattern)]
                for k in keys_to_delete:
                    del self._cache[k]
                self.logger.info(f"清除缓存：{key_pattern}*, 共 {len(keys_to_delete)} 个")
            else:
                count = len(self._cache)
                self._cache.clear()
                self.logger.info(f"清除所有缓存，共 {count} 个")
    
    def set_debug(self, debug: bool = True):
        """启用或禁用调试模式"""
        self.debug = debug
        self.logger.setLevel(logging.DEBUG if debug else logging.INFO)
        return self
    
    def get_access_token(self) -> str:
        """获取API访问令牌"""
        endpoint = "/access_token"
        data = {
            "app_id": self.app_id,
            "secret_key": self.secret_key
        }
        
        self.logger.info("正在获取访问令牌...")
        
        response = requests.post(
            f"{self.base_url}{endpoint}",
            json=data,
            headers={'Content-Type': 'application/json'}
        ).json()
        
        if response.get('code') == 0:
            self.logger.info("成功获取访问令牌")
            return response['data']['access_token']
        else:
            self.logger.error(f"获取访问令牌失败: {response}")
            raise Exception(f"获取访问令牌错误: {response}")
    
    def _ensure_access_token(self):
        """确保 access_token 有效，如果失效则重新获取"""
        if not self.access_token or self._token_expired:
            try:
                self.access_token = self.get_access_token()
                self._token_expired = False
                self.logger.info("Access token 已刷新")
            except Exception as e:
                self.logger.error(f"刷新 access_token 失败：{e}")
                raise
    
    def _request(self, method, endpoint, params=None, data=None, headers=None, retry=True):
        """发送请求到 API
        
        Args:
            retry: 是否允许在 token 失效时自动重试
        """
        # 确保 token 有效（但 /access_token 接口本身不需要 token）
        if endpoint != '/access_token':
            self._ensure_access_token()
        
        url = f"{self.base_url}{endpoint}"
        
        if headers is None:
            headers = {}
        
        # 🔴 同时支持 header 和 query parameter 传递 access_token（兼容 8080 端口代理）
        if self.access_token and endpoint != '/access_token':
            if 'access_token' not in headers:
                headers['access_token'] = self.access_token
            # 8080 端口代理需要 query parameter 方式
            if params is None:
                params = {}
            params['access_token'] = self.access_token
        
        json_data = None
        request_data = data
        
        if data is not None and isinstance(data, dict):
            headers['Content-Type'] = 'application/json'
            json_data = data
            request_data = None
        
        # 调试模式下打印 curl 命令
        if self.debug:
            self._print_curl_command(method, url, headers, params, json_data or request_data)
        
        response = requests.request(
            method=method, 
            url=url, 
            headers=headers,
            params=params,
            data=request_data,
            json=json_data
        )
        
        try:
            result = response.json()
            # 确保返回的是字典，如果不是则包装成字典
            if not isinstance(result, dict):
                self.logger.warning(f"API 返回非字典格式：{result}")
                return {"code": -1, "msg": str(result), "data": None}
            
            # 🔴 检查 token 是否失效 (code 10400)
            if result.get('code') == 10400 and retry:
                self.logger.warning("Access token 已失效，尝试刷新后重试...")
                # 强制刷新 token
                try:
                    self.access_token = self.get_access_token()
                    self._token_expired = False
                    self.logger.info("Access token 已刷新，重试请求...")
                except Exception as e:
                    self.logger.error(f"刷新 token 失败：{e}")
                    return result  # 返回原错误结果
                # 用新 token 重试（设置 retry=False 防止无限循环）
                headers['access_token'] = self.access_token
                response = requests.request(
                    method=method, 
                    url=url, 
                    headers=headers,
                    params=params,
                    data=request_data,
                    json=json_data
                )
                try:
                    return response.json()
                except json.JSONDecodeError:
                    return {"code": -1, "msg": "JSON 解析失败", "data": None}
            
            return result
        except json.JSONDecodeError as e:
            self.logger.error(f"JSON 解析失败：{response.text}")
            return {"code": -1, "msg": f"JSON 解析失败：{str(e)}", "data": None}
    
    def _print_curl_command(self, method, url, headers, params=None, data=None):
        """将请求转换为curl命令格式，便于调试"""
        curl = ['curl']
        
        # 添加请求方法
        if method.upper() != 'GET':
            curl.append(f'-X {method.upper()}')
        
        # 添加URL和参数
        if params:
            param_str = '&'.join([f'{k}={v}' for k, v in params.items()])
            if '?' in url:
                url = f'{url}&{param_str}'
            else:
                url = f'{url}?{param_str}'
        
        curl.append(f"'{url}'")
        
        # 添加请求头
        for key, value in headers.items():
            curl.append(f"-H '{key}: {value}'")
        
        # 添加数据
        if data:
            if isinstance(data, dict):
                data_str = json.dumps(data, ensure_ascii=False)
                curl.append(f"-d '{data_str}'")
            elif isinstance(data, str):
                curl.append(f"-d '{data}'")
        
        curl_str = ' \\\n '.join(curl)
        self.logger.debug(f"Curl命令:\n{curl_str}")
    
    # 文件上传相关方法
    def upload_file(self, file_path: str, service: str = "customised_person") -> str:
        """上传文件并获取文件ID"""
        endpoint = "/common/create_upload_url"
        file_name = os.path.basename(file_path)
        params = {"service": service, "name": file_name}
        
        self.logger.info(f"获取上传URL，文件: {file_name}...")
        response = self._request("GET", endpoint, params=params)
        
        if response.get('code') != 0:
            self.logger.error(f"获取上传URL失败: {response}")
            raise Exception(f"获取上传URL失败: {response}")
        
        sign_url = response['data']['sign_url']
        file_id = response['data']['file_id']
        
        file_size = os.path.getsize(file_path)
        self.logger.info(f"正在上传文件 ({file_size} 字节)...")
        
        with open(file_path, 'rb') as file:
            content_type = "video/mp4"
            headers = {"Content-Type": content_type}
            upload_response = requests.put(sign_url, headers=headers, data=file)
            if upload_response.status_code != 200:
                self.logger.error(f"文件上传失败: {upload_response.text}")
                raise Exception(f"文件上传失败: {upload_response.text}")
        
        self.logger.info(f"文件上传成功，ID: {file_id}")
        return file_id
    
    # 数字人相关方法
    def list_common_digital_persons(self, page: int = 1, size: int = 20, use_cache: bool = True) -> Dict[str, Any]:
        """获取平台提供的公共数字人列表
        
        Args:
            page: 页码
            size: 每页数量
            use_cache: 是否使用缓存（默认 True）
        """
        # 🐌 使用缓存降低 API 调用频率
        cache_key = f"list_common_persons:{page}:{size}"
        if use_cache:
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached
        
        endpoint = "/list_common_dp"
        params = {"page": page, "size": size}
        
        self.logger.info("正在获取公共数字人列表...")
        response = self._request("GET", endpoint, params=params)
        
        # 🔍 调试：打印返回数据结构
        # self.logger.info(f"API 返回原始数据：{response}")
        if response.get('data', {}).get('list'):
            for p in response['data']['list'][:3]:  # 只打印前 3 个
                pass
                #self.logger.info(f"  - 数字人：{p.get('name')}, figures={p.get('figures')}, cover_url={p.get('cover_url')}")
        
        # 🐌 缓存结果
        if use_cache and response.get('code') == 0:
            ttl = self._cache_ttl.get('list_common_persons', 300)
            self._cache_set(cache_key, response, ttl)
        
        return response
    
    def create_customised_person(
        self,
        name: str,
        file_id: str,
        train_type: str = "both",
        language: str = "cn",
        error_skip: bool = False,
        resolution_rate: int = 0,
        callback: Optional[str] = None
    ) -> Dict[str, Any]:
        endpoint = "/create_customised_person"
        data = {
            "name": name,
            "file_id": file_id,
            "train_type": train_type,
            "language": language,
            "error_skip": error_skip,
            "resolution_rate": resolution_rate,
        }
        if callback:
            data["callback"] = callback

        self.logger.info(f"正在创建自定义数字人: {name}...")
        return self._request("POST", endpoint, data=data)
    
    def get_customised_person_status(self, person_id: str, use_cache: bool = True) -> Dict[str, Any]:
        """获取自定义数字人的创建状态
        
        Args:
            person_id: 数字人 ID
            use_cache: 是否使用缓存（默认 True）
        """
        # 🐌 使用缓存降低 API 调用频率
        cache_key = f"customised_person_status:{person_id}"
        if use_cache:
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached
        
        endpoint = "/customised_person"
        params = {"id": person_id}
        
        self.logger.info(f"正在获取数字人 {person_id} 的状态...")
        response = self._request("GET", endpoint, params=params)
        
        # 🐌 缓存结果（状态变更不频繁，缓存 1 分钟）
        if use_cache and response.get('code') == 0:
            ttl = self._cache_ttl.get('customised_person_status', 60)
            self._cache_set(cache_key, response, ttl)
        
        return response
    
    
    def list_customised_persons(self, page: int = 1, page_size: int = 10, source: int = 0, use_cache: bool = True) -> Dict[str, Any]:
        """获取自定义数字人列表
        
        Args:
            page: 页码
            page_size: 每页数量
            source: 来源类型
            use_cache: 是否使用缓存（默认 True）
        """
        # 🐌 使用缓存降低 API 调用频率
        cache_key = f"list_customised_persons:{page}:{page_size}:{source}"
        if use_cache:
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached
        
        endpoint = "/list_customised_person"
        data = {
            "page": page,
            "page_size": page_size,
            "source": source
        }
        response = self._request("POST", endpoint, data=data)
        
        # 🐌 缓存结果
        if use_cache and response.get('code') == 0:
            ttl = 60  # 列表数据缓存 1 分钟
            self._cache_set(cache_key, response, ttl)
        
        return response

    # 音频相关方法
    def list_common_audio_mans(self, page: int = 1, size: int = 20, use_cache: bool = True) -> Dict[str, Any]:
        """获取平台提供的公共声音模型列表
        
        Args:
            page: 页码
            size: 每页数量
            use_cache: 是否使用缓存（默认 True）
        """
        # 🐌 使用缓存降低 API 调用频率
        cache_key = f"list_common_audio:{page}:{size}"
        if use_cache:
            cached = self._cache_get(cache_key)
            if cached is not None:
                return cached
        
        endpoint = "/list_common_audio"
        params = {"page": page, "size": size}
        
        self.logger.info("正在获取公共声音模型列表...")
        response = self._request("GET", endpoint, params=params)
        
        # 🐌 缓存结果
        if use_cache and response.get('code') == 0:
            ttl = self._cache_ttl.get('list_common_audio', 300)
            self._cache_set(cache_key, response, ttl)
        
        return response
    
    def create_video(
        self,
        digital_person_id: str,
        text: Union[str, List[str]],
        audio_man_id: Optional[str] = None,
        speed: float = 1.0,
        pitch: float = 1.0,
        volume: int = 100,
        screen_width: int = 1080,
        screen_height: int = 1920,
        bg_color: str = "#EDEDED",
        figure_type: str = "whole_body",
        drive_mode: str = "random",
        bg: Optional[Dict[str, Any]] = None,
        person_x: int = 0,
        person_y: int = 0,
        person_width: int = 1080,
        person_height: int = 1920,
        model: int = 1,
        resolution_rate: int = 0,
        hide_subtitle: bool = True,  # 默认不添加字幕
        # 🆕 新增参数支持
        backway: int = 1,  # 正反播：1 正放，2 倒放
        is_rgba_mode: bool = False,  # 是否四通道视频
        language: str = "cn",
        language_boost: Optional[str] = None,
        subtitle_config: Optional[Dict[str, Any]] = None,
        add_compliance_watermark: bool = True,
        compliance_watermark_position: int = 0,
        callback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """创建数字人视频 - 支持蝉镜 API 完整参数

        默认按竖屏 9:16 输出：
        - screen_width: 1080
        - screen_height: 1920

        Args:
            digital_person_id: 数字人 ID
            text: 播报文本（字符串或字符串列表）
            audio_man_id: 声音 ID（可选，为空则使用数字人原生声音）
            speed: 语速 (0.5-2.0)
            pitch: 语调 (0.5-2.0)
            volume: 音量 (0-100)
            screen_width: 画布宽度
            screen_height: 画布高度
            bg_color: 背景颜色
            figure_type: 形象类型（whole_body, head_shot, waist_shot 等）
            drive_mode: 驱动模式（normal, random）
            bg: 背景设置（支持 file_id, src_url, width, height, x, y）
            person_x: 数字人 X 位置
            person_y: 数字人 Y 位置
            person_width: 数字人宽度
            person_height: 数字人高度
            model: 模型版本（0 基础版，1 高质版）
            resolution_rate: 分辨率（0=1080p, 1=4k）
            hide_subtitle: 是否隐藏字幕
            backway: 正反播（1 正放，2 倒放）
            is_rgba_mode: 是否四通道视频（需要定制数字人支持）
            language: 语言（cn, en, ja, ko 等）
            language_boost: 语言增强
            subtitle_config: 高级字幕配置
            add_compliance_watermark: 是否添加合规水印
            compliance_watermark_position: 水印位置
            callback: 回调 URL
        """
        endpoint = "/create_video"

        if isinstance(text, str):
            text = [text]

        # 构建 person 对象
        person_data = {
            "id": digital_person_id,
            "x": person_x,
            "y": person_y,
            "width": person_width,
            "height": person_height,
            "figure_type": figure_type,
            "drive_mode": drive_mode,
            "backway": backway,
            "is_rgba_mode": is_rgba_mode,
        }

        # 构建 audio 对象
        audio_data = {
            "type": "tts",
            "volume": volume,
            "language": language,
        }
        
        # 如果有 audio_man_id，添加 tts 配置
        if audio_man_id:
            audio_data["tts"] = {
                "audio_man": audio_man_id,
                "text": text,
                "speed": speed,
                "pitch": pitch
            }
        else:
            # 没有 audio_man_id 时，使用数字人原生声音
            # 此时 text 需要通过其他方式传递，或者使用默认的 audio
            audio_data["tts"] = {
                "text": text,
                "speed": speed,
                "pitch": pitch
            }
        
        if language_boost:
            audio_data["language_boost"] = language_boost

        # 构建请求体
        data = {
            "person": person_data,
            "audio": audio_data,
            "screen_width": screen_width,
            "screen_height": screen_height,
            "model": model,
            "resolution_rate": resolution_rate,
            "hide_subtitle": hide_subtitle,
            "add_compliance_watermark": add_compliance_watermark,
        }

        # 背景设置：优先使用 bg 对象，否则使用 bg_color
        if bg and (bg.get("src_url") or bg.get("file_id")):
            data["bg"] = bg
        else:
            data["bg_color"] = bg_color

        # 字幕配置（高级选项）
        if subtitle_config:
            data["subtitle_config"] = subtitle_config

        # 合规水印位置
        if compliance_watermark_position:
            data["compliance_watermark_position"] = compliance_watermark_position

        # 回调 URL
        if callback:
            data["callback"] = callback

        self.logger.info("正在创建数字人视频...")
        if self.debug:
            self.logger.debug(f"create_video request body: {json.dumps(data, ensure_ascii=False, indent=2)}")

        return self._request("POST", endpoint, data=data)





    def delete_video(self, video_id: str) -> Dict[str, Any]:
        endpoint = "/delete_video"
        data = {"id": video_id}
        
        self.logger.info(f"正在删除视频 {video_id}...")
        return self._request("POST", endpoint, data=data)
    
    def delete_customised_person(self, person_id: str) -> Dict[str, Any]:
        """删除定制数字人"""
        endpoint = "/delete_customised_person"
        data = {"id": person_id}
        
        self.logger.info(f"正在删除定制数字人 {person_id}...")
        return self._request("POST", endpoint, data=data)
    
    def delete_customised_audio(self, audio_id: str) -> Dict[str, Any]:
        """删除定制声音"""
        endpoint = "/delete_customised_audio"
        data = {"id": audio_id}
        
        self.logger.info(f"正在删除定制声音 {audio_id}...")
        return self._request("POST", endpoint, data=data)
    
    def delete_file(self, file_id: str) -> Dict[str, Any]:
        """删除文件"""
        endpoint = "/common/delete_file"
        data = {"id": file_id}
        
        self.logger.info(f"正在删除文件 {file_id}...")
        return self._request("POST", endpoint, data=data)
    

    def get_video_status(self, video_id: str) -> Dict[str, Any]:
        """获取视频创建任务的状态"""
        endpoint = "/video"
        params = {"id": video_id}
        
        self.logger.info(f"正在获取视频 {video_id} 的状态...")
        return self._request("GET", endpoint, params=params)
    
    # 视频列表相关方法
    def get_video_list(self, page: int = 1, page_size: int = 10) -> Dict[str, Any]:
        """获取视频列表"""
        endpoint = "/video_list"
        data = {
            "page": page,
            "page_size": page_size
        }
        
        self.logger.info(f"正在获取视频列表 (页码: {page}, 每页数量: {page_size})...")
        
        headers = {
            'Content-Type': 'application/json'
        }
        
        return self._request("POST", endpoint, data=data, headers=headers)
    
    def get_video_detail(self, video_id: str) -> Dict[str, Any]:
        """获取单个视频详情"""
        endpoint = "/video"
        params = {"id": video_id}
        
        self.logger.info(f"正在获取视频 {video_id} 的详情...")
        return self._request("GET", endpoint, params=params)
    
    # 视频下载方法
    def download_video(self, video_url: str, output_path: str) -> str:
        """下载视频到指定路径"""
        self.logger.info(f"正在下载视频: {video_url}")
        
        response = requests.get(video_url, stream=True)
        total_size = int(response.headers.get('content-length', 0))
        
        # 确保输出目录存在
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        
        # 下载文件
        with open(output_path, 'wb') as f:
            downloaded = 0
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    # 打印下载进度
                    if total_size > 0:
                        progress = int(50 * downloaded / total_size)
                        print(f"\r下载进度: [{'#' * progress}{'.' * (50 - progress)}] {downloaded}/{total_size} 字节", end='')
            print()  # 换行
        
        self.logger.info(f"视频已下载到: {output_path}")
        return output_path