"""
任务注册表模式 - 将不同类型的任务处理逻辑拆分到独立文件
"""

from typing import Dict, Callable, Any

# 任务类型注册表
TASK_HANDLERS: Dict[str, Callable] = {}


def register_task(task_type: str):
    """装饰器：注册任务处理器"""
    def decorator(func: Callable):
        TASK_HANDLERS[task_type] = func
        return func
    return decorator


def get_task_handler(task_type: str) -> Callable:
    """获取任务处理器"""
    handler = TASK_HANDLERS.get(task_type)
    if not handler:
        raise ValueError(f"未知的任务类型：{task_type}")
    return handler


# 导入所有任务处理器以完成注册
from . import agent_draft, agent_compose, chanjing_video, compose_from_draft, visual_script_editor
