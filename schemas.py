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
    # 支持前端字段名 x_offset/y_offset（使用 alias 兼容两种命名）
    offset_x: int = Field(0, alias="x_offset")
    offset_y: int = Field(0, alias="y_offset")
    
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


class PresignedUploadRequest(BaseModel):
    filename: str
    content_type: Optional[str] = None
    purpose: str = "input"
    file_hash: Optional[str] = Field(None, max_length=64, description="文件 SHA256 hash，用于去重")


class UploadConfirmRequest(BaseModel):
    upload_id: str


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
    timeout_seconds: Optional[int] = 3600  # 超时时间（秒）

class DhCreateCustomPersonRequest(BaseModel):
    name: str
    source_video_oss_key: str
    train_type: str = "both"
    language: str = "cn"
    error_skip: bool = False
    resolution_rate: int = 0
    client_ref_id: Optional[str] = None


