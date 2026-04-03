# apps/digital_human/chanjing_api.py

import requests
import json
import time
import os
import logging
from typing import Dict, Any, List, Union, Optional

from urllib3 import response

class ChanjingAPI:
    """蝉镜API客户端，用于数字人视频生成、管理和下载"""
    
    def __init__(self, app_id: str, secret_key: str):
        """初始化API客户端"""
        self.app_id = app_id
        self.secret_key = secret_key
        self.base_url = "https://www.chanjing.cc/api/open/v1"
        self.logger = self._setup_logger()
        self.debug = False
        self.access_token = self.get_access_token()
    
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
    
    def _request(self, method, endpoint, params=None, data=None, headers=None):
        """发送请求到API"""
        url = f"{self.base_url}{endpoint}"
        
        if headers is None:
            headers = {}
        
        if self.access_token and 'access_token' not in headers and endpoint != '/access_token':
            headers['access_token'] = self.access_token
        
        json_data = None
        request_data = data
        
        if data is not None and isinstance(data, dict):
            headers['Content-Type'] = 'application/json'
            json_data = data
            request_data = None
        
        # 调试模式下打印curl命令
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
        
        return response.json()
    
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
        
        self.logger.debug(f"Curl命令:\n{' \\\n  '.join(curl)}")
    
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
    def list_common_digital_persons(self, page: int = 1, size: int = 20) -> Dict[str, Any]:
        """获取平台提供的公共数字人列表"""
        endpoint = "/list_common_dp"
        params = {"page": page, "size": size}
        
        self.logger.info("正在获取公共数字人列表...")
        response = self._request("GET", endpoint, params=params)
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
    
    def get_customised_person_status(self, person_id: str) -> Dict[str, Any]:
        """获取自定义数字人的创建状态"""
        endpoint = "/customised_person"
        params = {"id": person_id}
        
        self.logger.info(f"正在获取数字人 {person_id} 的状态...")
        return self._request("GET", endpoint, params=params)
    
    
    def list_customised_persons(self, page: int = 1, page_size: int = 10, source: int = 0) -> Dict[str, Any]:
        endpoint = "/list_customised_person"
        data = {
            "page": page,
            "page_size": page_size,
            "source": source
        }
        return self._request("POST", endpoint, data=data)

    # 音频相关方法
    def list_common_audio_mans(self, page: int = 1, size: int = 20) -> Dict[str, Any]:
        """获取平台提供的公共声音模型列表"""
        endpoint = "/list_common_audio"
        params = {"page": page, "size": size}
        
        self.logger.info("正在获取公共声音模型列表...")
        return self._request("GET", endpoint, params=params)
    
    def create_video(
        self,
        digital_person_id: str,
        text: Union[str, List[str]],
        audio_man_id: str,
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
        person_y: int = 0,          # 修改这一行
        person_width: int = 1080,
        person_height: int = 1920,    # 修改这一行
        model: int = 1,
        resolution_rate: int = 0,
    ) -> Dict[str, Any]:
        """创建数字人视频

        默认按竖屏 9:16 输出：
        - screen_width: 1080
        - screen_height: 1920

        person_* 用于控制数字人在画布中的位置和尺寸。
        """
        endpoint = "/create_video"

        if isinstance(text, str):
            text = [text]

        data = {
            "person": {
                "id": digital_person_id,
                "x": person_x,
                "y": person_y,
                "width": person_width,
                "height": person_height,
                "figure_type": figure_type,
                "drive_mode": drive_mode
            },
            "audio": {
                "type": "tts",
                "tts": {
                    "audio_man": audio_man_id,
                    "text": text,
                    "speed": speed,
                    "pitch": pitch
                },
                "volume": volume,
                "language": "cn"
            },
            "screen_width": screen_width,
            "screen_height": screen_height,
            "model": model,
            "resolution_rate": resolution_rate
        }

        # 背景：优先图片，否则用纯色
        if bg and (bg.get("src_url") or bg.get("file_id")):
            data["bg"] = bg
        else:
            data["bg_color"] = bg_color

        self.logger.info("正在创建数字人视频...")
        if self.debug:
            self.logger.debug(f"create_video request body: {json.dumps(data, ensure_ascii=False)}")

        return self._request("POST", endpoint, data=data)




# ================ 在 apps/digital_human/chanjing_api.py 中添加 ================
# 找到 get_video_detail 方法下方，添加以下代码：

    def delete_video(self, video_id: str) -> Dict[str, Any]:
        """删除视频合成任务"""
        endpoint = "/delete_video"
        data = {"id": video_id}
        
        self.logger.info(f"正在删除视频 {video_id}...")
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