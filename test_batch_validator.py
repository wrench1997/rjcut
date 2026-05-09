"""
批量处理验证器测试脚本

使用方法:
    python test_batch_validator.py

功能:
1. 测试示例配置的验证
2. 展示验证结果格式
3. 演示常见错误场景
"""

import json
import os
import sys

from batch_validator import (
    BatchTaskValidator,
    ValidationLevel,
    validate_batch_config_file,
)


def print_section(title):
    """打印分节标题"""
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


def print_validation_result(result):
    """打印验证结果"""
    print(f"\n验证结果：{'✅ 通过' if result['is_valid'] else '❌ 失败'}")
    print(f"总任务数：{result['total_tasks']}")
    print(f"有效任务：{result['valid_tasks']}")
    print(f"无效任务：{result['invalid_tasks']}")
    
    if result.get('summary'):
        summary = result['summary']
        print(f"\n汇总:")
        print(f"  错误数：{summary.get('total_errors', 0)}")
        print(f"  警告数：{summary.get('total_warnings', 0)}")
        
        if summary.get('recommendations'):
            print(f"\n建议:")
            for rec in summary['recommendations']:
                print(f"  • {rec}")
    
    if result.get('task_results'):
        print(f"\n任务详情:")
        for task_result in result['task_results']:
            status = '✅' if task_result['is_valid'] else '❌'
            print(f"\n  {status} 任务：{task_result['task_name']}")
            
            if task_result['issues']:
                print(f"    问题 ({len(task_result['issues'])} 个):")
                for issue in task_result['issues']:
                    level_icon = '❌' if issue['level'] == 'error' else '⚠️' if issue['level'] == 'warning' else 'ℹ️'
                    print(f"      {level_icon} [{issue['level'].upper()}] {issue['field']}")
                    print(f"         {issue['message']}")
                    if issue.get('suggestion'):
                        print(f"         💡 {issue['suggestion']}")


def test_example_config():
    """测试示例配置文件"""
    print_section("测试 1: 示例配置文件")
    
    config_path = os.path.join(os.path.dirname(__file__), 'examples', 'batch_config_example.json')
    
    if not os.path.exists(config_path):
        print(f"❌ 配置文件不存在：{config_path}")
        return
    
    result = validate_batch_config_file(config_path)
    print_validation_result(result)


def test_basic_config():
    """测试基础配置"""
    print_section("测试 2: 基础配置（应有错误）")
    
    config = {
        "tasks": [
            {
                "name": "test_video",
                "video_file": "./videos/test.mp4",
                # 缺少 script_file - 应该有错误
            }
        ]
    }
    
    validator = BatchTaskValidator()
    result = validator.validate_batch_config(config)
    print_validation_result(result.to_dict())


def test_scene_only_mode():
    """测试纯场景模式"""
    print_section("测试 3: 纯场景模式（不需要脚本）")
    
    config = {
        "tasks": [
            {
                "name": "scene_only_video",
                "video_file": "./videos/scenes.mp4",
                "scenes_dir": "./scenes",
                "custom_config": {
                    "pipeline": {
                        "mode": "scene_only"
                    }
                }
                # 纯场景模式不需要 script_file
            }
        ]
    }
    
    validator = BatchTaskValidator(base_dir=os.getcwd())
    result = validator.validate_batch_config(config)
    print_validation_result(result.to_dict())


def test_complete_config():
    """测试完整配置"""
    print_section("测试 4: 完整配置（应该通过）")
    
    config = {
        "tasks": [
            {
                "name": "complete_video",
                "video_file": "./videos/complete.mp4",
                "script_file": "./scripts/complete.json",
                "corrections_file": "./corrections.json",
                "bgm_file": "./bgm/music.mp3",
                "scenes_dir": "./scenes",
                "custom_config": {
                    "pipeline": {
                        "use_transitions": True,
                        "transition_duration": 1.0
                    },
                    "subtitle": {
                        "font_size": 88,
                        "effect": "ad"
                    },
                    "audio": {
                        "bgm_volume": 0.3,
                        "original_volume": 1.0
                    }
                }
            }
        ]
    }
    
    validator = BatchTaskValidator(base_dir=os.getcwd())
    result = validator.validate_batch_config(config)
    print_validation_result(result.to_dict())


def test_script_content_validation():
    """测试脚本内容验证"""
    print_section("测试 5: 脚本内容验证")
    
    # 创建一个临时脚本文件
    import tempfile
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        script_path = f.name
        # 写入错误的脚本格式
        json.dump({
            "segments": [
                {
                    # 缺少 flag 和 text 字段
                    "scene_file": "test.mp4"
                },
                {
                    "flag": "invalid_flag",  # 无效的 flag
                    "text": "test"
                },
                {
                    "flag": "scene",
                    "text": "scene text",
                    # 缺少 scene_file
                }
            ]
        }, f, ensure_ascii=False, indent=2)
    
    try:
        config = {
            "tasks": [
                {
                    "name": "bad_script_test",
                    "video_file": "./videos/test.mp4",
                    "script_file": script_path,
                }
            ]
        }
        
        validator = BatchTaskValidator()
        result = validator.validate_batch_config(config)
        print_validation_result(result.to_dict())
    finally:
        # 清理临时文件
        os.unlink(script_path)


def test_multiple_tasks():
    """测试多任务场景"""
    print_section("测试 6: 多任务混合场景")
    
    config = {
        "tasks": [
            {
                "name": "task_001_good",
                "video_file": "./videos/good.mp4",
                "script_file": "./scripts/good.json",
                "bgm_file": "./bgm/music.mp3",
            },
            {
                "name": "task_002_no_script",
                "video_file": "./videos/no_script.mp4",
                # 缺少 script_file
            },
            {
                "name": "task_003_no_video",
                # 缺少 video_file - 严重错误
                "script_file": "./scripts/no_video.json",
            },
            {
                "name": "task_004_minimal",
                "video_file": "./videos/minimal.mp4",
                "script_file": "./scripts/minimal.json",
                # 缺少可选文件
            }
        ]
    }
    
    validator = BatchTaskValidator(base_dir=os.getcwd())
    result = validator.validate_batch_config(config)
    print_validation_result(result.to_dict())


def main():
    """运行所有测试"""
    print("\n" + "🧪 " * 20)
    print("批量处理验证器测试套件")
    print("🧪 " * 20)
    
    test_example_config()
    test_basic_config()
    test_scene_only_mode()
    test_complete_config()
    test_script_content_validation()
    test_multiple_tasks()
    
    print_section("测试完成")
    print("\n所有测试已执行完毕。")
    print("\n提示:")
    print("  • 使用 'python batch_validator.py <config_path>' 验证具体配置文件")
    print("  • 使用 'curl POST /v1/batch/validate' API 进行在线验证")
    print("  • 在 Studio 中使用 BatchConfigEditor 组件进行可视化验证")
    print()


if __name__ == "__main__":
    main()
