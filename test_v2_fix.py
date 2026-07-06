# 测试 chanjing_api_v2 修复
import os
import sys

# 手动加载环境变量
os.environ['CHANJING_APP_ID'] = 'itop'
os.environ['CHANJING_SECRET_KEY'] = 'rj-itop+0591'

print("=" * 60)
print("测试 chanjing_api_v2 修复")
print("=" * 60)

# 测试 1: 检查 V2 初始化后的 base_url
print("\n【测试 1】V2 API 初始化...")
from chanjing_api_v2 import create_chanjing_api_v2

api = create_chanjing_api_v2(
    app_id='itop',
    secret_key='rj-itop+0591',
    config={
        "timeout": 60,
        "max_retries": 3,
        "enable_cache": True,
        "enable_stats": True,
        "auto_auth": False,
    }
)

print(f"  app_id: {api.app_id}")
print(f"  secret_key: {api.secret_key}")
print(f"  base_url: {api.base_url}")
print(f"  预期 base_url: http://192.168.166.151:8080")

if api.base_url == "http://192.168.166.151:8080":
    print("  ✅ base_url 正确！")
else:
    print("  ❌ base_url 被 V1 覆盖了！")

# 测试 2: 检查 V1 的 base_url
print("\n【测试 2】V1 API 初始化对比...")
from chanjing_api import ChanjingAPI

api_v1 = ChanjingAPI(app_id='itop', secret_key='rj-itop+0591')
print(f"  V1 base_url: {api_v1.base_url}")
print(f"  预期 base_url: https://www.chanjing.cc/api/open/v1")

if api_v1.base_url == "https://www.chanjing.cc/api/open/v1":
    print("  ✅ V1 base_url 正确（蝉镜官方地址）")
else:
    print(f"  ⚠️ V1 base_url 异常：{api_v1.base_url}")

print("\n" + "=" * 60)
print("结论：")
print("  - V1 使用蝉镜官方 API 地址：https://www.chanjing.cc/api/open/v1")
print("  - V2 应该使用本地 API 服务地址：http://192.168.166.151:8080")
print("  - 修复后，V2 的 base_url 应该不会被 V1 覆盖")
print("=" * 60)