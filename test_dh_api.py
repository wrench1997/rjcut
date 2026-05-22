"""
数字人 API 测试脚本
用于验证数字人 API 是否正常工作
"""
import requests

# 配置
API_BASE = "http://localhost:8000"
API_KEY = "rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

def test_api(endpoint, method="GET", json_data=None):
    """测试 API 端点"""
    url = f"{API_BASE}{endpoint}"
    print(f"\n{'='*60}")
    print(f"测试：{method} {endpoint}")
    print(f"{'='*60}")
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=json_data)
        else:
            raise ValueError(f"不支持的方法：{method}")
        
        print(f"状态码：{response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"响应：{data}")
            
            if data.get('code') == 0:
                print("✓ 成功")
                return data
            else:
                print(f"✗ 业务错误：{data.get('message')}")
                return None
        else:
            print(f"✗ HTTP 错误：{response.status_code}")
            print(f"响应内容：{response.text}")
            return None
            
    except Exception as e:
        print(f"✗ 请求失败：{e}")
        return None

def main():
    print("🎭 RJCut 数字人 API 测试")
    print(f"API 地址：{API_BASE}")
    
    # 测试 1: 获取商户信息
    print("\n\n📋 测试 1: 获取商户信息")
    test_api("/v1/merchant/info")
    
    # 测试 2: 获取公共数字人列表
    print("\n\n📋 测试 2: 获取公共数字人列表")
    result = test_api("/v1/dh/persons/common")
    if result and result.get('data'):
        print(f"公共数字人数量：{len(result.get('data', []))}")
    
    # 测试 3: 获取自定义数字人列表
    print("\n\n📋 测试 3: 获取自定义数字人列表")
    result = test_api("/v1/dh/persons/custom")
    if result and result.get('data'):
        print(f"自定义数字人数量：{len(result.get('data', []))}")
    
    # 测试 4: 获取声音列表
    print("\n\n📋 测试 4: 获取声音列表")
    result = test_api("/v1/dh/voices")
    if result and result.get('data'):
        print(f"声音数量：{len(result.get('data', []))}")
    
    # 测试 5: 同步自定义数字人
    print("\n\n📋 测试 5: 同步自定义数字人")
    test_api("/v1/dh/persons/custom/sync", method="POST")
    
    # 测试 6: 获取任务列表
    print("\n\n📋 测试 6: 获取任务列表")
    result = test_api("/v1/tasks?limit=10")
    if result and result.get('data'):
        items = result.get('data', {}).get('items', [])
        print(f"任务数量：{len(items)}")
    
    print("\n\n" + "="*60)
    print("测试完成")
    print("="*60)

if __name__ == "__main__":
    main()
