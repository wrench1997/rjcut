#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试蝉镜 API V2 认证问题
用于诊断为什么获取 access_token 时提示"无效 APPID 和 SecretKey"
"""

import os
import sys
import json
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

print("=" * 60)
print("蝉镜 API V2 认证诊断测试")
print("=" * 60)

# 1. 检查环境变量
print("\n【1】检查环境变量...")
print(f"  CHANJING_APP_ID: {os.getenv('CHANJING_APP_ID', '❌ 未设置')}")
print(f"  CHANJING_SECRET_KEY: {os.getenv('CHANJING_SECRET_KEY', '❌ 未设置')}")
print(f"  CHANJING_BASE_URL: {os.getenv('CHANJING_BASE_URL', '❌ 未设置')}")

# 2. 检查 .env 文件
print("\n【2】检查 .env 文件...")
env_file = '.env'
if os.path.exists(env_file):
    print(f"  ✅ .env 文件存在：{os.path.abspath(env_file)}")
    with open(env_file, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'CHANJING_APP_ID' in content:
            for line in content.split('\n'):
                if 'CHANJING_APP_ID' in line and not line.strip().startswith('#'):
                    print(f"  📝 CHANJING_APP_ID 配置：{line.strip()}")
        if 'CHANJING_SECRET_KEY' in content:
            for line in content.split('\n'):
                if 'CHANJING_SECRET_KEY' in line and not line.strip().startswith('#'):
                    print(f"  📝 CHANJING_SECRET_KEY 配置：{line.strip()}")
else:
    print(f"  ❌ .env 文件不存在")

# 3. 尝试导入 V2 API
print("\n【3】测试 V2 API 初始化...")
try:
    from chanjing_api_v2 import create_chanjing_api_v2
    
    # 测试 1: 不提供参数，让 V2 自动获取
    print("\n  【测试 1】不提供参数，自动获取认证信息...")
    try:
        api1 = create_chanjing_api_v2()
        print(f"  ✅ API 实例创建成功")
        print(f"     app_id: {api1.app_id[:10]}... (隐藏部分)")
        print(f"     secret_key: {api1.secret_key[:10]}... (隐藏部分)")
        print(f"     base_url: {api1.base_url}")
    except Exception as e:
        print(f"  ❌ 创建失败：{e}")
    
    # 测试 2: 显式提供环境变量
    print("\n  【测试 2】显式提供环境变量...")
    app_id = os.getenv('CHANJING_APP_ID')
    secret_key = os.getenv('CHANJING_SECRET_KEY')
    if app_id and secret_key:
        try:
            api2 = create_chanjing_api_v2(app_id=app_id, secret_key=secret_key)
            print(f"  ✅ API 实例创建成功")
            print(f"     app_id: {app_id[:10]}... (隐藏部分)")
            print(f"     secret_key: {secret_key[:10]}... (隐藏部分)")
            
            # 测试获取 access_token
            print("\n  【测试 3】尝试获取 access_token...")
            try:
                token = api2.get_access_token()
                print(f"  ✅ 获取成功！access_token: {token[:20]}...")
            except Exception as e:
                print(f"  ❌ 获取失败：{e}")
                
                # 详细诊断：直接调用 API
                print("\n  【诊断】直接调用 access_token 接口...")
                import requests
                try:
                    response = requests.post(
                        f"{api2.base_url}/access_token",
                        json={"app_id": app_id, "secret_key": secret_key},
                        headers={'Content-Type': 'application/json'},
                        timeout=10
                    )
                    print(f"  请求 URL: {api2.base_url}/access_token")
                    print(f"  请求数据：app_id={app_id[:10]}..., secret_key={secret_key[:10]}...")
                    print(f"  响应状态码：{response.status_code}")
                    print(f"  响应内容：{response.text}")
                    
                    # 检查是否是格式问题
                    print("\n  【诊断】检查 app_id 和 secret_key 格式...")
                    print(f"     app_id 长度：{len(app_id)}")
                    print(f"     secret_key 长度：{len(secret_key)}")
                    print(f"     app_id 是否有空格：{' ' in app_id}")
                    print(f"     secret_key 是否有空格：{' ' in secret_key}")
                    print(f"     app_id 首尾空格：'{app_id}' vs '{app_id.strip()}'")
                    print(f"     secret_key 首尾空格：'{secret_key}' vs '{secret_key.strip()}'")
                    
                except Exception as req_err:
                    print(f"  ❌ 请求失败：{req_err}")
                    
        except Exception as e:
            print(f"  ❌ 创建失败：{e}")
    else:
        print(f"  ⚠️ 环境变量未设置，跳过此测试")
    
    # 测试 3: 使用 V1 API 对比
    print("\n  【测试 4】使用 V1 API 对比测试...")
    from chanjing_api import ChanjingAPI
    if app_id and secret_key:
        try:
            api_v1 = ChanjingAPI(app_id=app_id, secret_key=secret_key)
            print(f"  ✅ V1 API 实例创建成功")
            token_v1 = api_v1.get_access_token()
            print(f"  ✅ V1 获取 access_token 成功：{token_v1[:20]}...")
        except Exception as e:
            print(f"  ❌ V1 也失败：{e}")
    
except ImportError as e:
    print(f"  ❌ 导入失败：{e}")
except Exception as e:
    print(f"  ❌ 测试异常：{e}")

print("\n" + "=" * 60)
print("诊断完成")
print("=" * 60)