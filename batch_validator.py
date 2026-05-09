"""
批量处理任务验证器 - 验证任务配置中的必需和可选文件

功能:
1. 验证任务配置中必需文件是否存在
2. 检查可选文件并提供提示
3. 生成详细的验证报告
4. 支持 JSON 配置查看和修改
"""

import os
import json
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum


class ValidationLevel(Enum):
    """验证级别"""
    ERROR = "error"      # 错误 - 必须修复
    WARNING = "warning"  # 警告 - 建议修复
    INFO = "info"        # 信息 - 仅供参考


@dataclass
class ValidationIssue:
    """验证问题"""
    level: ValidationLevel
    field: str
    message: str
    suggestion: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            "level": self.level.value,
            "field": self.field,
            "message": self.message,
            "suggestion": self.suggestion,
        }


@dataclass
class TaskValidationResult:
    """单个任务的验证结果"""
    task_name: str
    is_valid: bool
    issues: List[ValidationIssue] = field(default_factory=list)
    required_files: Dict[str, bool] = field(default_factory=dict)
    optional_files: Dict[str, bool] = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return {
            "task_name": self.task_name,
            "is_valid": self.is_valid,
            "issues": [issue.to_dict() for issue in self.issues],
            "required_files": self.required_files,
            "optional_files": self.optional_files,
            "error_count": sum(1 for i in self.issues if i.level == ValidationLevel.ERROR),
            "warning_count": sum(1 for i in self.issues if i.level == ValidationLevel.WARNING),
        }


@dataclass
class BatchValidationResult:
    """批量验证结果"""
    is_valid: bool
    total_tasks: int
    valid_tasks: int
    invalid_tasks: int
    task_results: List[TaskValidationResult] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "total_tasks": self.total_tasks,
            "valid_tasks": self.valid_tasks,
            "invalid_tasks": self.invalid_tasks,
            "task_results": [r.to_dict() for r in self.task_results],
            "summary": self.summary,
        }


class BatchTaskValidator:
    """批量任务验证器"""
    
    # 必需文件配置
    REQUIRED_FILES = {
        "video_file": {
            "extensions": [".mp4", ".mov", ".avi", ".mkv"],
            "description": "主视频文件",
        },
        "script_file": {
            "extensions": [".json"],
            "description": "脚本文件 (必需，除非使用纯场景模式)",
            "conditional": True,
            "condition_field": "pipeline.mode",
            "condition_value": "scene_only",
            "condition_invert": True,  # 当 mode != scene_only 时必需
        },
    }
    
    # 可选文件配置
    OPTIONAL_FILES = {
        "corrections_file": {
            "extensions": [".json"],
            "description": "纠错字典",
            "recommendation": "建议提供纠错字典以提高字幕准确性",
        },
        "bgm_file": {
            "extensions": [".mp3", ".wav", ".m4a", ".aac"],
            "description": "背景音乐",
            "recommendation": "建议添加背景音乐以提升视频质量",
        },
        "scenes_dir": {
            "is_directory": True,
            "description": "场景素材目录",
            "recommendation": "如果有场景替换需求，请提供场景素材目录",
        },
    }
    
    # 脚本文件内容验证规则
    SCRIPT_VALIDATION_RULES = {
        "required_fields": ["segments"],
        "segment_required_fields": ["flag", "text"],
        "valid_flags": ["human", "scene", "transition"],
    }
    
    def __init__(self, base_dir: str = None):
        """
        初始化验证器
        
        Args:
            base_dir: 基础目录，用于解析相对路径
        """
        self.base_dir = base_dir or os.getcwd()
    
    def validate_batch_config(self, config: Dict[str, Any]) -> BatchValidationResult:
        """
        验证批量配置
        
        Args:
            config: 批量配置字典
            
        Returns:
            BatchValidationResult: 验证结果
        """
        tasks = config.get("tasks", [])
        task_results = []
        
        for i, task_config in enumerate(tasks):
            task_name = task_config.get("name", f"task_{i}")
            result = self.validate_single_task(task_config, task_name)
            task_results.append(result)
        
        valid_count = sum(1 for r in task_results if r.is_valid)
        invalid_count = len(task_results) - valid_count
        
        # 生成汇总信息
        summary = self._generate_summary(task_results)
        
        return BatchValidationResult(
            is_valid=invalid_count == 0,
            total_tasks=len(task_results),
            valid_tasks=valid_count,
            invalid_tasks=invalid_count,
            task_results=task_results,
            summary=summary,
        )
    
    def validate_single_task(self, task_config: Dict[str, Any], task_name: str = None) -> TaskValidationResult:
        """
        验证单个任务配置
        
        Args:
            task_config: 任务配置字典
            task_name: 任务名称
            
        Returns:
            TaskValidationResult: 验证结果
        """
        if not task_name:
            task_name = task_config.get("name", "unknown_task")
        
        issues = []
        required_files_status = {}
        optional_files_status = {}
        
        # 验证必需文件
        for field, file_config in self.REQUIRED_FILES.items():
            file_path = task_config.get(field)
            is_present, is_valid = self._validate_file_field(
                field, file_path, file_config, task_config
            )
            required_files_status[field] = is_present and is_valid
            
            if not is_present and file_config.get("conditional"):
                # 条件性必需文件，不满足条件时不报错
                continue
            elif not is_present:
                issues.append(ValidationIssue(
                    level=ValidationLevel.ERROR,
                    field=field,
                    message=f"缺少必需文件：{file_config['description']}",
                    suggestion=f"请提供 {field} 字段，指向有效的文件路径"
                ))
            elif not is_valid:
                issues.append(ValidationIssue(
                    level=ValidationLevel.ERROR,
                    field=field,
                    message=f"必需文件格式错误：{file_config['description']}",
                    suggestion=f"文件扩展名必须是以下之一：{', '.join(file_config['extensions'])}"
                ))
        
        # 验证可选文件
        for field, file_config in self.OPTIONAL_FILES.items():
            file_path = task_config.get(field)
            is_present, is_valid = self._validate_file_field(
                field, file_path, file_config, task_config
            )
            optional_files_status[field] = is_present and is_valid
            
            if is_present and not is_valid:
                issues.append(ValidationIssue(
                    level=ValidationLevel.WARNING,
                    field=field,
                    message=f"可选文件格式可能不正确：{file_config['description']}",
                    suggestion=file_config.get("recommendation")
                ))
            elif not is_present and file_config.get("recommendation"):
                # 仅记录信息，不作为警告
                pass
        
        # 验证脚本文件内容 (如果存在)
        script_file = task_config.get("script_file")
        if script_file and required_files_status.get("script_file", False):
            script_issues = self._validate_script_content(script_file)
            issues.extend(script_issues)
        
        # 验证数字人文件 (如果有脚本)
        if task_config.get("script_file"):
            dh_issues = self._validate_digital_human_requirements(task_config)
            issues.extend(dh_issues)
        
        # 验证转场配置
        transition_issues = self._validate_transition_requirements(task_config)
        issues.extend(transition_issues)
        
        return TaskValidationResult(
            task_name=task_name,
            is_valid=len([i for i in issues if i.level == ValidationLevel.ERROR]) == 0,
            issues=issues,
            required_files=required_files_status,
            optional_files=optional_files_status,
        )
    
    def _validate_file_field(
        self, 
        field: str, 
        file_path: Any, 
        file_config: Dict[str, Any],
        task_config: Dict[str, Any]
    ) -> Tuple[bool, bool]:
        """
        验证文件字段
        
        Returns:
            (is_present, is_valid): 文件是否存在，文件是否有效
        """
        # 检查条件性必需字段
        if file_config.get("conditional"):
            condition_field = file_config.get("condition_field")
            condition_value = file_config.get("condition_value")
            invert = file_config.get("condition_invert", False)
            
            # 获取实际值 (支持嵌套字段如 "pipeline.mode")
            actual_value = self._get_nested_field(task_config, condition_field)
            
            # 判断是否需要此文件
            should_require = (actual_value == condition_value)
            if invert:
                should_require = not should_require
            
            if not should_require:
                return True, True  # 不需要此文件，视为满足
        
        if not file_path:
            return False, True
        
        # 检查文件/目录是否存在
        full_path = self._resolve_path(file_path)
        is_dir = file_config.get("is_directory", False)
        
        if is_dir:
            is_present = os.path.isdir(full_path)
        else:
            is_present = os.path.isfile(full_path)
        
        if not is_present:
            return False, True
        
        # 检查扩展名
        if not is_dir:
            extensions = file_config.get("extensions", [])
            if extensions:
                file_ext = os.path.splitext(file_path)[1].lower()
                is_valid = file_ext in extensions
                return True, is_valid
        
        return True, True
    
    def _validate_script_content(self, script_path: str) -> List[ValidationIssue]:
        """验证脚本文件内容"""
        issues = []
        
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                script_data = json.load(f)
        except FileNotFoundError:
            return [ValidationIssue(
                level=ValidationLevel.ERROR,
                field="script_file",
                message="脚本文件不存在",
                suggestion="请检查文件路径是否正确"
            )]
        except json.JSONDecodeError as e:
            return [ValidationIssue(
                level=ValidationLevel.ERROR,
                field="script_file",
                message=f"脚本 JSON 格式错误：{str(e)}",
                suggestion="请使用有效的 JSON 格式"
            )]
        
        # 验证必需字段
        rules = self.SCRIPT_VALIDATION_RULES
        for req_field in rules.get("required_fields", []):
            if req_field not in script_data:
                issues.append(ValidationIssue(
                    level=ValidationLevel.ERROR,
                    field="script_file",
                    message=f"脚本缺少必需字段：{req_field}",
                    suggestion=f"请在脚本中添加 '{req_field}' 字段"
                ))
        
        # 验证 segments
        segments = script_data.get("segments", [])
        if not isinstance(segments, list):
            issues.append(ValidationIssue(
                level=ValidationLevel.ERROR,
                field="script_file",
                message="segments 必须是数组",
                suggestion="请将 segments 字段修改为数组格式"
            ))
        else:
            for i, seg in enumerate(segments):
                # 验证 segment 必需字段
                for req_field in rules.get("segment_required_fields", []):
                    if req_field not in seg:
                        issues.append(ValidationIssue(
                            level=ValidationLevel.ERROR,
                            field=f"script_file.segments[{i}]",
                            message=f"第 {i+1} 个 segment 缺少必需字段：{req_field}",
                            suggestion=f"请添加 '{req_field}' 字段"
                        ))
                
                # 验证 flag 值
                flag = seg.get("flag")
                valid_flags = rules.get("valid_flags", [])
                if flag and valid_flags and flag not in valid_flags:
                    issues.append(ValidationIssue(
                        level=ValidationLevel.WARNING,
                        field=f"script_file.segments[{i}]",
                        message=f"第 {i+1} 个 segment 的 flag 值不常见：{flag}",
                        suggestion=f"建议使用以下值之一：{', '.join(valid_flags)}"
                    ))
                
                # 验证 scene_file (如果是 scene 类型)
                if seg.get("flag") == "scene" and not seg.get("scene_file"):
                    issues.append(ValidationIssue(
                        level=ValidationLevel.ERROR,
                        field=f"script_file.segments[{i}]",
                        message=f"第 {i+1} 个 segment 是 scene 类型但缺少 scene_file",
                        suggestion="请提供 scene_file 字段指向场景素材"
                    ))
        
        return issues
    
    def _validate_digital_human_requirements(self, task_config: Dict[str, Any]) -> List[ValidationIssue]:
        """验证数字人文件要求"""
        issues = []
        script_path = task_config.get("script_file")
        
        if not script_path or not os.path.isfile(self._resolve_path(script_path)):
            return issues
        
        try:
            with open(self._resolve_path(script_path), 'r', encoding='utf-8') as f:
                script_data = json.load(f)
        except:
            return issues
        
        segments = script_data.get("segments", [])
        human_segments = [s for s in segments if s.get("flag") == "human"]
        
        if human_segments:
            # 检查是否有数字人相关配置
            # 这里可以扩展检查数字人模型文件、音频文件等
            pass
        
        return issues
    
    def _validate_transition_requirements(self, task_config: Dict[str, Any]) -> List[ValidationIssue]:
        """验证转场配置要求"""
        issues = []
        
        # 检查是否有转场配置
        custom_config = task_config.get("custom_config", {})
        pipeline = custom_config.get("pipeline", {})
        
        if pipeline.get("use_transitions"):
            # 如果使用转场，检查转场配置
            transition_duration = pipeline.get("transition_duration")
            if transition_duration is None:
                issues.append(ValidationIssue(
                    level=ValidationLevel.INFO,
                    field="custom_config.pipeline.transition_duration",
                    message="启用了转场但未指定转场时长",
                    suggestion="建议设置 transition_duration (推荐值：0.8-1.5 秒)"
                ))
        
        return issues
    
    def _get_nested_field(self, data: Dict[str, Any], field_path: str) -> Any:
        """获取嵌套字段值"""
        parts = field_path.split(".")
        current = data
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
        return current
    
    def _resolve_path(self, path: str) -> str:
        """解析路径 (支持相对路径)"""
        if os.path.isabs(path):
            return path
        return os.path.join(self.base_dir, path)
    
    def _generate_summary(self, task_results: List[TaskValidationResult]) -> Dict[str, Any]:
        """生成验证汇总"""
        total_errors = sum(
            sum(1 for i in r.issues if i.level == ValidationLevel.ERROR)
            for r in task_results
        )
        total_warnings = sum(
            sum(1 for i in r.issues if i.level == ValidationLevel.WARNING)
            for r in task_results
        )
        
        # 统计文件缺失情况
        missing_required = {}
        missing_optional = {}
        
        for r in task_results:
            for field, present in r.required_files.items():
                if not present:
                    missing_required[field] = missing_required.get(field, 0) + 1
            
            for field, present in r.optional_files.items():
                if not present:
                    missing_optional[field] = missing_optional.get(field, 0) + 1
        
        return {
            "total_errors": total_errors,
            "total_warnings": total_warnings,
            "missing_required_files": missing_required,
            "missing_optional_files": missing_optional,
            "recommendations": self._generate_recommendations(task_results),
        }
    
    def _generate_recommendations(self, task_results: List[TaskValidationResult]) -> List[str]:
        """生成建议"""
        recommendations = []
        
        # 统计常见问题
        all_issues = []
        for r in task_results:
            all_issues.extend(r.issues)
        
        # 如果没有背景音乐
        bgm_missing = sum(1 for r in task_results if not r.optional_files.get("bgm_file"))
        if bgm_missing > 0:
            recommendations.append(f"{bgm_missing} 个任务缺少背景音乐，建议添加以提升视频质量")
        
        # 如果没有纠错字典
        corrections_missing = sum(1 for r in task_results if not r.optional_files.get("corrections_file"))
        if corrections_missing > 0:
            recommendations.append(f"{corrections_missing} 个任务缺少纠错字典，建议添加以提高字幕准确性")
        
        # 如果有错误
        error_count = sum(1 for i in all_issues if i.level == ValidationLevel.ERROR)
        if error_count > 0:
            recommendations.append(f"发现 {error_count} 个错误，必须修复后才能执行批量处理")
        
        return recommendations


def validate_batch_config_file(config_path: str, base_dir: str = None) -> Dict[str, Any]:
    """
    验证批量配置文件
    
    Args:
        config_path: 配置文件路径
        base_dir: 基础目录
        
    Returns:
        验证结果字典
    """
    if not os.path.isfile(config_path):
        return {
            "is_valid": False,
            "error": f"配置文件不存在：{config_path}",
        }
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        return {
            "is_valid": False,
            "error": f"配置文件 JSON 格式错误：{str(e)}",
        }
    
    validator = BatchTaskValidator(base_dir=base_dir)
    result = validator.validate_batch_config(config)
    
    return result.to_dict()


if __name__ == "__main__":
    # 测试示例
    import sys
    
    if len(sys.argv) > 1:
        config_file = sys.argv[1]
        result = validate_batch_config_file(config_file)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        # 示例配置
        example_config = {
            "tasks": [
                {
                    "name": "test_video_001",
                    "video_file": "./videos/test.mp4",
                    "script_file": "./scripts/test.json",
                    "corrections_file": "./corrections.json",
                    "bgm_file": "./bgm.mp3",
                    "scenes_dir": "./scenes",
                }
            ]
        }
        
        validator = BatchTaskValidator()
        result = validator.validate_batch_config(example_config)
        print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
