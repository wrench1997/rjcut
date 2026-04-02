from typing import Optional, Dict, Any, List
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
    offset_x: int = 0
    offset_y: int = 0


class OutputConfig(BaseModel):
    need_cleaned_video: bool = True
    need_timeline_json: bool = True
    need_transcription_json: bool = True
    need_ass: bool = True


class CallbackConfig(BaseModel):
    url: Optional[str] = None
    secret: Optional[str] = None


class AgentComposeRequest(BaseModel):
    input: InputConfig
    pipeline: PipelineConfig = PipelineConfig()
    asr: AsrConfig = AsrConfig()
    subtitle: SubtitleConfig = SubtitleConfig()
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