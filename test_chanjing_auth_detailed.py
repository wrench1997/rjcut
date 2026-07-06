#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
蝉镜 API V2 认证问题诊断脚本

问题分析：
从日志看，错误是 "无效 APPID 和 SecretKey"，code=50000
这说明 app_id 和 secret_key 可能传递不正确

诊断步骤：
1. 检查环境变量是否正确加载
2. 检查 V2 API 初始化时获取的值
3. 检查 V1 和 V2 的差异
4. 直接测试 access_token 接口
"""

import os
import sys
import json

# 手动加载 .env 文件（因为可能不是在 Docker 环境中）
def load_env_file(path='.env'):
    """手动加载 .env 文件到环境变量"""
    if not os.path.exists(path):
        print(f"⚠️  .env 文件不存在：{path}")
        return
    
    print(f"📄 加载 .env 文件：{os.path.abspath(path)}")
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                # 只设置还没有的环境变量
                if key not in os.environ:
                    os.environ[key] = value
                    print(f"  ✅ 设置环境变量：{key}={value[:20]}{'...' if len(value) > 20 else ''}")

print("=" * 70)
print("蝉镜 API V2 认证诊断脚本")
print("=" * 70)

# 步骤 1: 加载环境变量
print("\n【步骤 1】加载环境变量...")
load_env_file('.env')

print("\n【步骤 2】当前环境变量值...")
app_id_env = os.environ.get('CHANJING_APP_ID', '❌ 未设置')
secret_key_env = os.environ.get('CHANJING_SECRET_KEY', '❌ 未设置')
print(f"  CHANJING_APP_ID     = {app_id_env}")
print(f"  CHANJING_SECRET_KEY = {secret_key_env}")

# 步骤 3: 检查 config.py 能获取到什么
print("\n【步骤 3】测试 config.get_settings()...")
try:
    # 清除已导入的模块，确保重新加载
    if 'config' in sys.modules:
        del sys.modules['config']
    if 'chanjing_api' in sys.modules:
        del sys.modules['chanjing_api']
    if 'chanjing_api_v2' in sys.modules:
        del sys.modules['chanjing_api_v2']
    
    from config import get_settings
    settings = get_settings()
    print(f"  settings.CHANJING_APP_ID     = {settings.CHANJING_APP_ID}")
    print(f"  settings.CHANJING_SECRET_KEY = {settings.CHANJING_SECRET_KEY}")
except Exception as e:
    print(f"  ❌ 失败：{e}")
    import traceback
    traceback.print_exc()

# 步骤 4: 测试 V1 API
print("\n【步骤 4】测试 V1 API (chanjing_api.ChanjingAPI)...")
try:
    from chanjing_api import ChanjingAPI
    
    # 使用环境变量
    api_v1 = ChanjingAPI(app_id=app_id_env, secret_key=secret_key_env)
    print(f"  ✅ V1 实例创建成功")
    print(f"     api_v1.app_id     = {api_v1.app_id}")
    print(f"     api_v1.secret_key = {api_v1.secret_key}")
    print(f"     api_v1.base_url   = {api_v1.base_url}")
    
    # 尝试获取 token
    print("\n  【步骤 4.1】V1 尝试获取 access_token...")
    try:
        token = api_v1.get_access_token()
        print(f"  ✅ V1 获取成功！token = {token[:30]}...")
    except Exception as e:
        print(f"  ❌ V1 获取失败：{e}")
        
        # 详细诊断
        print("\n  【诊断】直接调用 HTTP 接口...")
        try:
            import requests
            resp = requests.post(
                f"{api_v1.base_url}/access_token",
                json={"app_id": api_v1.app_id, "secret_key": api_v1.secret_key},
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            print(f"    请求 URL: {api_v1.base_url}/access_token")
            print(f"    请求 JSON: app_id='{api_v1.app_id}', secret_key='{api_v1.secret_key}'")
            print(f"    响应状态码：{resp.status_code}")
            print(f"    响应内容：{resp.text}")
            
            # 检查值是否有问题
            print("\n  【诊断】检查认证信息格式...")
            print(f"    app_id 原始值：'{api_v1.app_id}'")
            print(f"    app_id 长度：{len(api_v1.app_id)}")
            print(f"    app_id 去除空格后：'{api_v1.app_id.strip()}'")
            print(f"    secret_key 原始值：'{api_v1.secret_key}'")
            print(f"    secret_key 长度：{len(api_v1.secret_key)}")
            print(f"    secret_key 去除空格后：'{api_v1.secret_key.strip()}'")
            
        except Exception as req_err:
            print(f"    ❌ HTTP 请求失败：{req_err}")
            
except Exception as e:
    print(f"  ❌ V1 测试失败：{e}")
    import traceback
    traceback.print_exc()

# 步骤 5: 测试 V2 API
print("\n【步骤 5】测试 V2 API (chanjing_api_v2.ChanjingAPIV2)...")
try:
    from chanjing_api_v2 import ChanjingAPIV2
    
    # 测试 5.1: 显式传入参数（传统模式）
    print("\n  【步骤 5.1】V2 显式传入参数（传统模式）...")
    api_v2_explicit = ChanjingAPIV2(
        app_id=app_id_env,
        secret_key=secret_key_env,
        auto_auth=False  # 关闭自动认证
    )
    print(f"  ✅ V2 实例创建成功（显式参数）")
    print(f"     api_v2.app_id     = {api_v2_explicit.app_id}")
    print(f"     api_v2.secret_key = {api_v2_explicit.secret_key}")
    print(f"     api_v2.base_url   = {api_v2_explicit.base_url}")
    
    # 尝试获取 token
    print("\n  【步骤 5.1.1】V2（显式）尝试获取 access_token...")
    try:
        token = api_v2_explicit.get_access_token()
        print(f"  ✅ V2（显式）获取成功！token = {token[:30]}...")
    except Exception as e:
        print(f"  ❌ V2（显式）获取失败：{e}")
    
    # 测试 5.2: 使用 create_chanjing_api_v2（与 api_digital_human.py 相同）
    print("\n  【步骤 5.2】使用 create_chanjing_api_v2 工厂函数...")
    from chanjing_api_v2 import create_chanjing_api_v2
    
    api_v2_factory = create_chanjing_api_v2(
        app_id=settings.CHANJING_APP_ID,
        secret_key=settings.CHANJING_SECRET_KEY,
        config={
            "timeout": 60,
            "max_retries": 3,
            "enable_cache": True,
            "enable_stats": True,
            "auto_auth": False,  # 传统模式
        }
    )
    print(f"  ✅ V2 实例创建成功（工厂函数）")
    print(f"     api_v2.app_id     = {api_v2_factory.app_id}")
    print(f"     api_v2.secret_key = {api_v2_factory.secret_key}")
    print(f"     api_v2.base_url   = {api_v2_factory.base_url}")
    
    # 尝试获取 token
    print("\n  【步骤 5.2.1】V2（工厂）尝试获取 access_token...")
    try:
        token = api_v2_factory.get_access_token()
        print(f"  ✅ V2（工厂）获取成功！token = {token[:30]}...")
    except Exception as e:
        print(f"  ❌ V2（工厂）获取失败：{e}")
        
except Exception as e:
    print(f"  ❌ V2 测试失败：{e}")
    import traceback
    traceback.print_exc()

# 步骤 6: 对比 V1 和 V2 的 get_access_token 实现
print("\n【步骤 6】对比 V1 和 V2 的 get_access_token 实现...")
print("  V1 和 V2 都继承自同一个 get_access_token 方法")
print("  问题可能在于 V2 初始化时 app_id/secret_key 的值被修改了")

print("\n" + "=" * 70)
print("诊断完成")
print("=" * 70)
print("\n💡 建议：")
print("  1. 检查 app_id 和 secret_key 是否有空格或特殊字符")
print("  2. 检查 Docker 容器内的环境变量是否与主机一致")
print("  3. 检查蝉镜 API 服务端是否接受了这些凭证")
print("  4. 如果 V1 能工作但 V2 不能，检查 V2 初始化逻辑")