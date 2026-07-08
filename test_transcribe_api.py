#!/usr/bin/env python3
"""
字幕识别 API 测试脚本
用于测试 /v1/dh/transcribe 接口的功能
"""

import requests
import json
import sys

# 配置
BASE_URL = "http://localhost:8000"
API_KEY = "test_api_key"  # 替换为真实的 API Key
VIDEO_URL = "http://localhost:8000/test_video.mp4"  # 替换为测试视频 URL

def test_transcribe_api():
    """测试字幕识别 API"""
    
    print("=" * 60)
    print("  字幕识别 API 测试")
    print("=" * 60)
    
    # 测试用例 1: 基本识别
    print("\n[测试 1] 基本识别 (medium 模型)")
    print("-" * 60)
    
    payload = {
        "video_url": VIDEO_URL,
        "model_size": "medium",
        "language": "zh",
        "device": "cuda"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/v1/dh/transcribe",
            headers={
                "Content-Type": "application/json",
                "X-API-Key": API_KEY
            },
            json=payload,
            timeout=300
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("code") == 0:
                data = result.get("data", {})
                print(f"✅ 识别成功!")
                print(f"   时长：{data.get('duration', 0):.2f} 秒")
                print(f"   语句段数：{len(data.get('segments', []))}")
                print(f"   语言：{data.get('language', 'unknown')}")
                
                # 显示前 3 个片段
                segments = data.get('segments', [])
                if segments:
                    print(f"\n   前 3 个片段预览:")
                    for i, seg in enumerate(segments[:3], 1):
                        text = seg.get('text', '').strip()[:50]
                        start = seg.get('start', 0)
                        end = seg.get('end', 0)
                        print(f"   {i}. [{start:.2f}s - {end:.2f}s] {text}")
                
                return True
            else:
                print(f"❌ API 返回错误：{result.get('message')}")
                return False
        else:
            print(f"❌ HTTP 错误：{response.status_code}")
            print(f"   响应：{response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ 请求超时 (300 秒)")
        return False
    except requests.exceptions.ConnectionError as e:
        print(f"❌ 连接错误：{e}")
        print(f"   请确保后端服务正在运行：{BASE_URL}")
        return False
    except Exception as e:
        print(f"❌ 未知错误：{e}")
        return False


def test_transcribe_models():
    """测试不同模型大小"""
    
    print("\n[测试 2] 不同模型大小对比")
    print("-" * 60)
    
    models = ["medium", "large-v3"]
    
    for model in models:
        print(f"\n  测试模型：{model}")
        payload = {
            "video_url": VIDEO_URL,
            "model_size": model,
            "language": "zh",
            "device": "cuda"
        }
        
        try:
            response = requests.post(
                f"{BASE_URL}/v1/dh/transcribe",
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": API_KEY
                },
                json=payload,
                timeout=300
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("code") == 0:
                    data = result.get("data", {})
                    seg_count = len(data.get('segments', []))
                    duration = data.get('duration', 0)
                    print(f"   ✅ {model}: {seg_count} 个片段，{duration:.2f} 秒")
                else:
                    print(f"   ❌ {model}: {result.get('message')}")
            else:
                print(f"   ❌ {model}: HTTP {response.status_code}")
                
        except Exception as e:
            print(f"   ❌ {model}: {e}")


def test_error_cases():
    """测试错误情况"""
    
    print("\n[测试 3] 错误情况处理")
    print("-" * 60)
    
    # 测试 1: 无效视频 URL
    print("\n  测试：无效视频 URL")
    payload = {
        "video_url": "http://invalid.url/nonexistent.mp4",
        "model_size": "medium"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/v1/dh/transcribe",
            headers={
                "Content-Type": "application/json",
                "X-API-Key": API_KEY
            },
            json=payload,
            timeout=60
        )
        
        if response.status_code in [400, 404, 500]:
            result = response.json()
            print(f"   ✅ 正确返回错误：{result.get('message', 'Unknown error')}")
        else:
            print(f"   ⚠️  意外响应：{response.status_code}")
            
    except Exception as e:
        print(f"   ⚠️  异常：{e}")
    
    # 测试 2: 缺少必要参数
    print("\n  测试：缺少 video_url 参数")
    payload = {
        "model_size": "medium"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/v1/dh/transcribe",
            headers={
                "Content-Type": "application/json",
                "X-API-Key": API_KEY
            },
            json=payload,
            timeout=10
        )
        
        print(f"   响应状态：{response.status_code}")
        if response.status_code in [400, 422]:
            print(f"   ✅ 正确返回参数校验错误")
        else:
            print(f"   ⚠️  意外响应：{response.status_code}")
            
    except Exception as e:
        print(f"   ⚠️  异常：{e}")


if __name__ == "__main__":
    print("\n🎬 字幕识别 API 测试脚本")
    print("使用说明:")
    print("  1. 确保后端服务正在运行 (python api_service.py)")
    print("  2. 修改脚本中的 BASE_URL 和 API_KEY")
    print("  3. 修改 VIDEO_URL 为有效的测试视频地址")
    print("  4. 运行：python test_transcribe_api.py\n")
    
    if len(sys.argv) > 1 and sys.argv[1] == "--quick":
        # 快速测试模式
        success = test_transcribe_api()
        sys.exit(0 if success else 1)
    else:
        # 完整测试模式
        test_transcribe_api()
        test_transcribe_models()
        test_error_cases()
        
        print("\n" + "=" * 60)
        print("  测试完成")
        print("=" * 60)