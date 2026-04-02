#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class InputConfig(BaseModel):
    video_url: str = Field(..., description="输入视频 URL")
    script_url: Optional[str] = Field(None, description="脚本 JSON URL")
    corrections_url: Optional[str] = Field(None, description="错别字校正表 URL")
    scene_base_url: Optional[str] = Field(None, description="场景素材根路径 URL，可为空")


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
    device: str = "cpu"
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


class ApiResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: Optional[Dict[str, Any]] = None
    trace_id: Optional[str] = None