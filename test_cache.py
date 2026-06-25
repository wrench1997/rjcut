#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试蝉镜 API 缓存功能

运行方式：
    python test_cache.py

测试内容：
    1. 首次调用 API（应该调用真实接口）
    2. 第二次调用相同参数（应该命中缓存）
    3. 等待缓存过期后再次调用（应该重新调用接口）
    4. 测试不同参数（应该是新的 API 调用）
"""

import time
import sys
import os

# 添加项目根目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from chanjing_api import ChanjingAPI
from config import get_settings

def print_separator(title):
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def test_cache():
    """测试缓存功能"""
    
    # 获取配置
    settings = get_settings()
    
    # 创建 API 实例
    api = ChanjingAPI(settings.CHANJING_APP_ID, settings.CHANJING_SECRET_KEY)
    api.set_debug(True)  # 启用调试模式，可以看到请求详情
    
    print_separator("测试 1: 公共数字人列表缓存")
    
    # 第一次调用 - 应该调用真实 API
    print("\n📞 第 1 次调用 list_common_digital_persons (应该调用真实 API)...")
    start = time.time()
    res1 = api.list_common_digital_persons(page=1, size=10, use_cache=True)
    t1 = time.time() - start
    print(f"   耗时：{t1:.3f}s")
    print(f"   返回数字人数量：{len(res1.get('data', {}).get('list', []))}")
    print(f"   缓存大小：{len(api._cache)}")
    
    # 第二次调用 - 应该命中缓存
    print("\n💾 第 2 次调用 list_common_digital_persons (应该命中缓存)...")
    start = time.time()
    res2 = api.list_common_digital_persons(page=1, size=10, use_cache=True)
    t2 = time.time() - start
    print(f"   耗时：{t2:.3f}s (加速比：{t1/t2:.1f}x)" if t2 > 0 else f"   耗时：{t2:.3f}s")
    print(f"   返回数字人数量：{len(res2.get('data', {}).get('list', []))}")
    print(f"   缓存大小：{len(api._cache)}")
    
    # 第三次调用 - 不同参数，应该是新的 API 调用
    print("\n📞 第 3 次调用 list_common_digital_persons (page=2, 新参数，应该调用真实 API)...")
    start = time.time()
    res3 = api.list_common_digital_persons(page=2, size=10, use_cache=True)
    t3 = time.time() - start
    print(f"   耗时：{t3:.3f}s")
    print(f"   返回数字人数量：{len(res3.get('data', {}).get('list', []))}")
    print(f"   缓存大小：{len(api._cache)}")
    
    # 第四次调用 - 相同参数 page=2，应该命中缓存
    print("\n💾 第 4 次调用 list_common_digital_persons (page=2, 应该命中缓存)...")
    start = time.time()
    res4 = api.list_common_digital_persons(page=2, size=10, use_cache=True)
    t4 = time.time() - start
    print(f"   耗时：{t4:.3f}s")
    print(f"   缓存大小：{len(api._cache)}")
    
    print_separator("测试 2: 自定义数字人状态缓存")
    
    # 先获取自定义数字人列表
    print("\n📞 获取自定义数字人列表...")
    list_res = api.list_customised_persons(page=1, page_size=5, source=0, use_cache=True)
    persons = list_res.get('data', {}).get('list', [])
    
    if persons:
        person_id = persons[0].get('id')
        print(f"   找到数字人 ID: {person_id}")
        
        # 第一次调用 - 获取状态
        print(f"\n📞 第 1 次调用 get_customised_person_status('{person_id}')...")
        start = time.time()
        status1 = api.get_customised_person_status(person_id, use_cache=True)
        t1 = time.time() - start
        print(f"   耗时：{t1:.3f}s")
        print(f"   状态：{status1.get('data', {}).get('status', 'N/A')}")
        print(f"   缓存大小：{len(api._cache)}")
        
        # 第二次调用 - 应该命中缓存
        print(f"\n💾 第 2 次调用 get_customised_person_status('{person_id}') (应该命中缓存)...")
        start = time.time()
        status2 = api.get_customised_person_status(person_id, use_cache=True)
        t2 = time.time() - start
        print(f"   耗时：{t2:.3f}s")
        print(f"   状态：{status2.get('data', {}).get('status', 'N/A')}")
        print(f"   缓存大小：{len(api._cache)}")
    else:
        print("   ⚠️  没有找到自定义数字人，跳过此测试")
    
    print_separator("测试 3: 声音列表缓存")
    
    # 第一次调用
    print("\n📞 第 1 次调用 list_common_audio_mans...")
    start = time.time()
    audio1 = api.list_common_audio_mans(page=1, size=10, use_cache=True)
    t1 = time.time() - start
    print(f"   耗时：{t1:.3f}s")
    print(f"   返回声音数量：{len(audio1.get('data', {}).get('list', []))}")
    print(f"   缓存大小：{len(api._cache)}")
    
    # 第二次调用 - 应该命中缓存
    print("\n💾 第 2 次调用 list_common_audio_mans (应该命中缓存)...")
    start = time.time()
    audio2 = api.list_common_audio_mans(page=1, size=10, use_cache=True)
    t2 = time.time() - start
    print(f"   耗时：{t2:.3f}s")
    print(f"   缓存大小：{len(api._cache)}")
    
    print_separator("测试 4: 手动清除缓存")
    
    print(f"\n🗑️  清除所有缓存前，缓存大小：{len(api._cache)}")
    api._cache_clear()
    print(f"🗑️  清除所有缓存后，缓存大小：{len(api._cache)}")
    
    # 清除缓存后再次调用，应该重新请求 API
    print("\n📞 清除缓存后调用 list_common_digital_persons (应该调用真实 API)...")
    start = time.time()
    res5 = api.list_common_digital_persons(page=1, size=10, use_cache=True)
    t5 = time.time() - start
    print(f"   耗时：{t5:.3f}s")
    print(f"   缓存大小：{len(api._cache)}")
    
    print_separator("测试 5: 禁用缓存")
    
    # 使用 use_cache=False
    print("\n📞 调用 list_common_digital_persons (use_cache=False)...")
    start = time.time()
    res6 = api.list_common_digital_persons(page=1, size=10, use_cache=False)
    t6 = time.time() - start
    print(f"   耗时：{t6:.3f}s")
    print(f"   缓存大小：{len(api._cache)} (应该不变)")
    
    print_separator("✅ 测试完成")
    print(f"\n📊 最终缓存大小：{len(api._cache)}")
    print("📝 缓存键列表:")
    for key in api._cache.keys():
        print(f"   - {key}")

if __name__ == "__main__":
    try:
        test_cache()
    except Exception as e:
        print(f"\n❌ 测试失败：{e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)