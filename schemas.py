from typing import Optional, Dict, Any, List, Literal
from pydantic import BaseModel, Field
from datetime import datetime


class ApiResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: Optional[Any] = None
    trace_id: Optional[str] = None


class InputConfig(BaseModel):
    video_url: str = Field(..., description="输入视频 URL 或 OSS key")
    script_url: Optional[str] = Field(None)
    corrections_url: Optional[str] = Field(None)
    scene_base_url: Optional[str] = Field(None)


class PipelineConfig(BaseModel):
    remove_keyword: str = "转场"
    margin: float = 0.15
    min_segment_duration: float = 0.1
    use_transitions: bool = False
    transition_type: str = "fade"
    transition_duration: float = 0.8
    resync_subtitle: bool = True


class AsrConfig(BaseModel):
    model: str = "large-v3"
    device: str = "cuda"
    language: str = "zh"


class SubtitleConfig(BaseModel):
    effect: str = "ad"
    highlight_color: str = "gold"
    font_url: Optional[str] = None
    font_size: int = 88
    max_chars_per_line: int = 18
    position: str = "bottom"
    margin_v: int = 50
    margin_l: int = 10
    margin_r: int = 10
    # 使用前端字段名 x_offset/y_offset（使用 alias 兼容旧的 offset_x/offset_y）
    x_offset: int = Field(0, alias="offset_x")
    y_offset: int = Field(0, alias="offset_y")
    
    class Config:
        populate_by_name = True  # 允许使用字段名或别名

# 在 SubtitleConfig 类后面添加 AudioConfig 类
class AudioConfig(BaseModel):
    bgm_url: Optional[str] = Field(None, description="背景音乐 URL 或 OSS key")
    bgm_volume: float = Field(0.3, ge=0.0, le=1.0, description="背景音乐音量 (0.0-1.0)")
    original_volume: float = Field(1.0, ge=0.0, le=1.0, description="原始视频音量 (0.0-1.0)")
    bgm_start_time: float = Field(0.0, ge=0.0, description="背景音乐开始时间 (秒)")
    bgm_loop: bool = Field(True, description="是否循环背景音乐")
    fade_in_duration: float = Field(0.5, ge=0.0, description="淡入时长 (秒)")
    fade_out_duration: float = Field(0.5, ge=0.0, description="淡出时长 (秒)")
    

class OutputConfig(BaseModel):
    need_cleaned_video: bool = True
    need_timeline_json: bool = True
    need_transcription_json: bool = True
    need_ass: bool = True


class CallbackConfig(BaseModel):
    url: Optional[str] = None
    secret: Optional[str] = None


class DraftOptions(BaseModel):
    need_transcription: bool = True
    need_timeline: bool = True
    need_ai_correction: bool = False
    ai_prompt: Optional[str] = None


class AgentDraftRequest(BaseModel):
    input: InputConfig
    pipeline: PipelineConfig = PipelineConfig()
    asr: AsrConfig = AsrConfig()
    draft: DraftOptions = DraftOptions()
    callback: Optional[CallbackConfig] = None
    client_ref_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(None, ge=60, le=7200)


class EditableScriptSegment(BaseModel):
    id: int
    text: str
    type: str = "human"
    scene_file: Optional[str] = None
    part_file: Optional[str] = None
    start: Optional[float] = None
    end: Optional[float] = None
    duration: Optional[float] = None


class EditableScript(BaseModel):
    segments: List[EditableScriptSegment]


class TextCorrectionItem(BaseModel):
    src: str
    dst: str
    reason: Optional[str] = None


class DraftUpdateRequest(BaseModel):
    editable_script: Optional[EditableScript] = None
    corrections: Optional[List[TextCorrectionItem]] = None
    replace_mode: Literal["merge", "replace"] = "merge"


class DraftAiCorrectRequest(BaseModel):
    mode: str = "rewrite"
    prompt: Optional[str] = None
    scope: str = "all_segments"


class ComposeFromDraftRequest(BaseModel):
    draft_task_id: str
    editable_script: Optional[EditableScript] = None
    corrections: Optional[List[TextCorrectionItem]] = None
    pipeline: PipelineConfig = PipelineConfig()
    asr: AsrConfig = AsrConfig()
    subtitle: SubtitleConfig = SubtitleConfig()
    audio: AudioConfig = AudioConfig()  # 🆕 添加这一行
    output: OutputConfig = OutputConfig()
    callback: Optional[CallbackConfig] = None
    client_ref_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(None, ge=60, le=7200)


class AgentComposeRequest(BaseModel):
    input: InputConfig
    pipeline: PipelineConfig = PipelineConfig()
    asr: AsrConfig = AsrConfig()
    subtitle: SubtitleConfig = SubtitleConfig()
    audio: AudioConfig = AudioConfig()  # 🆕 添加这一行
    output: OutputConfig = OutputConfig()
    callback: Optional[CallbackConfig] = None
    client_ref_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(None, ge=60, le=7200)


class TaskBrief(BaseModel):
    task_id: str
    task_type: str
    status: str
    progress: int
    stage: Optional[str]
    client_ref_id: Optional[str]
    cost: int
    created_at: datetime
    updated_at: datetime
    error: Optional[str]


class TaskDetail(TaskBrief):
    trace_id: Optional[str]
    result: Optional[Dict[str, Any]]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class TaskCancelRequest(BaseModel):
    reason: Optional[str] = None


class CreateMerchantRequest(BaseModel):
    name: str
    email: Optional[str] = None
    quota_total: int = 100
    cost_per_task: int = 1
    rate_limit_per_minute: int = 60
    max_concurrent_tasks: int = 5


class AdjustQuotaRequest(BaseModel):
    amount: int
    description: str = "admin adjustment"


class CreateApiKeyRequest(BaseModel):
    name: str = "default"


# schemas.py - DhGenerateVideoRequest 类
class DhGenerateVideoRequest(BaseModel):
    """数字人视频生成请求 - 支持蝉镜 API 完整参数"""
    text: str
    person_id: Optional[str] = None
    audio_man_id: Optional[str] = None  # 为空时自动使用数字人原生声音
    
    # 🎭 数字人形象设置
    figure_type: str = "whole_body"  # 形象类型：whole_body, head_shot, waist_shot 等
    drive_mode: str = "random"  # 驱动模式：normal, random
    person_x: Optional[int] = 0  # 数字人 X 位置
    person_y: Optional[int] = 0  # 数字人 Y 位置
    person_width: Optional[int] = 1080  # 数字人宽度
    person_height: Optional[int] = 1920  # 数字人高度
    backway: Optional[int] = 1  # 正反播：1 正放，2 倒放
    is_rgba_mode: Optional[bool] = False  # 是否四通道视频（需要定制数字人支持）
    
    # 🎵 音频设置
    speed: Optional[float] = 1.0  # 语速 (0.5-2.0)
    pitch: Optional[float] = 1.0  # 语调 (0.5-2.0)
    volume: Optional[int] = 100  # 音量 (0-100)
    language: Optional[str] = "cn"  # 语言：cn, en, ja, ko 等
    language_boost: Optional[str] = None  # 语言增强
    
    # 🎨 背景设置
    bg_type: str = "color"  # background: color, image, video
    bg_color: str = "#EDEDED"  # 背景颜色
    bg_file_oss_key: Optional[str] = None  # 背景文件（图片或视频）
    bg_file_id: Optional[str] = None  # 蝉镜文件 ID
    
    # 📺 画质设置
    resolution_rate: int = 0  # 分辨率：0=1080p, 1=4k
    model: int = 1  # 模型：0 基础版，1 高质版
    screen_width: Optional[int] = 1080  # 画布宽度
    screen_height: Optional[int] = 1920  # 画布高度
    
    # 📝 字幕设置
    hide_subtitle: bool = True  # 是否隐藏字幕
    subtitle_config: Optional[Dict[str, Any]] = None  # 高级字幕配置
    # subtitle_config 支持：
    # - show: bool 是否显示字幕
    # - color: str 字幕颜色
    # - font_size: int 字体大小
    # - font_id: str 字体 ID
    # - x, y: int 字幕位置
    # - stroke_color: str 描边颜色
    # - stroke_width: float 描边宽度
    # - asr_type: int 0 自动生成，1 用户上传
    # - subtitles: list 用户上传的 ASR 结果
    
    # 💧 水印设置
    add_compliance_watermark: Optional[bool] = True  # 是否添加合规水印
    compliance_watermark_position: Optional[int] = 0  # 水印位置
    
    # 🔗 回调与引用
    callback_url: Optional[str] = None  # 回调 URL
    client_ref_id: Optional[str] = None  # 客户端引用 ID
    timeout_seconds: Optional[int] = 1800  # 超时时间（秒，默认 30 分钟）

class DhCreateCustomPersonRequest(BaseModel):
    name: str
    source_video_oss_key: str
    train_type: str = "both"
    language: str = "cn"
    error_skip: bool = False
    resolution_rate: int = 0
    client_ref_id: Optional[str] = None

# ==========================================
# Visual Script Editor (AI 自动剪辑) 相关 Schema
# ==========================================

class VisualScriptSource(BaseModel):
    """视频源配置"""
    source_id: Optional[str] = None  # 可选，系统会自动生成
    label: Optional[str] = None  # 可选，系统会使用文件名
    oss_key: Optional[str] = None  # OSS 文件路径
    local_path: Optional[str] = None  # 本地文件路径（仅当后端可访问本地文件时）
    url: Optional[str] = None  # 公开直链 URL


class VisualScriptCandidateShotDefinition(BaseModel):
    """候选镜头定义（可选自定义，否则使用默认）"""
    id: str = "usable_editorial_shots"
    description: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = None


class VisualScriptEditorOptions(BaseModel):
    """视觉脚本编辑器选项"""
    # Pegasus 分析参数
    min_shot_seconds: float = Field(2.0, ge=2.0, description="最小镜头时长（Pegasus 要求至少 2 秒）")
    max_shot_seconds: float = Field(10.0, ge=2.0, description="最大镜头时长")
    max_candidates_per_video: int = Field(30, ge=1, description="每个视频的最大候选镜头数")
    
    # Gemini 导演参数
    target_seconds: float = Field(45.0, gt=0.0, description="目标总时长（秒）")
    thinking_level: str = Field("low", description="Gemini 思考级别：minimal/low/medium/high")
    gemini_model: str = Field("gemini-3-flash-preview", description="Gemini 模型")
    
    # 渲染参数（可选）
    render: bool = Field(False, description="是否渲染 rough cut MP4")
    canvas: str = Field("9:16", description="渲染画布比例：9:16/16:9/1:1")
    fit: str = Field("contain", description="填充模式：contain/cover")
    
    # 复用已有 catalog（避免重复分析）
    reuse_catalog_oss_key: Optional[str] = Field(None, description="复用已有 shot_catalog.json 的 OSS 路径")


class VisualScriptEditorRequest(BaseModel):
    """视觉脚本编辑器请求"""
    # 视觉脚本（必填）
    script_lines: List[str] = Field(..., min_length=1, description="视觉脚本行，每行一个视觉 beat")
    style: str = Field(..., description="整体视觉风格，如'高级时尚广告；冷感、克制、留白；竖屏 9:16'")
    
    # 视频源（至少一个）
    sources: List[VisualScriptSource] = Field(..., min_length=1, description="视频源列表")
    
    # 可选配置
    options: VisualScriptEditorOptions = Field(default_factory=VisualScriptEditorOptions)
    
    # 回调与引用
    callback_url: Optional[str] = None
    client_ref_id: Optional[str] = None
    timeout_seconds: Optional[int] = Field(3600, ge=60, le=7200)


class VisualScriptEditorResponse(BaseModel):
    """视觉脚本编辑器响应（任务提交成功）"""
    task_id: str
    task_type: str = "visual_script_editor"
    status: str
    trace_id: str
    estimated_seconds: int


class VisualScriptShotCatalog(BaseModel):
    """镜头目录项"""
    candidate_id: str
    source_id: str
    source_label: str
    source_locator: str
    start_time: float
    end_time: float
    duration: float
    selection_score: float
    metadata: Dict[str, Any]


class VisualScriptEditShot(BaseModel):
    """编辑决策中的镜头"""
    candidate_id: str
    source_id: str
    source_label: str
    source_locator: str
    start_time: float
    end_time: float
    duration: float
    script_index: int
    script_line: str
    why_this_shot: str
    transition: str
    on_screen_text: str
    edit_intent: str
    confidence: float


class VisualScriptTimelineEntry(BaseModel):
    """时间线索引项"""
    script_index: int
    script_line: str
    shots: List[VisualScriptEditShot]
    on_screen_text: str
    transition: str
    edit_intent: str
    confidence: float


class VisualScriptEditPlan(BaseModel):
    """编辑计划"""
    project_title: str
    creative_rationale: str
    timeline: List[VisualScriptTimelineEntry]
    uncovered_script_lines: List[str]
    review_flags: List[str]


class VisualScriptTaskResult(BaseModel):
    """视觉脚本任务结果"""
    shot_catalog_oss_key: Optional[str] = None  # 镜头目录 OSS 路径
    edit_plan_oss_key: Optional[str] = None  # 编辑计划 OSS 路径
    edl_oss_key: Optional[str] = None  # EDL OSS 路径
    srt_oss_key: Optional[str] = None  # 字幕 SRT OSS 路径
    ffmpeg_commands_oss_key: Optional[str] = None  # FFmpeg 命令 OSS 路径
    rough_cut_oss_key: Optional[str] = None  # 渲染成品 OSS 路径（如果启用渲染）
    
    # 简要统计
    total_candidates: int = 0  # 候选镜头总数
    selected_clips: int = 0  # 选中镜头数
    uncovered_beats: int = 0  # 未覆盖的脚本行数
    total_duration: float = 0.0  # 总时长（秒）
