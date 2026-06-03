use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// 视频轨道片段类型
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum ClipType {
    Video,
    Audio,
    Image,
    Text,
}

/// 裁剪效果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CropRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 变换属性
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transform {
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,  // 弧度
    pub position_x: f64,
    pub position_y: f64,
    pub opacity: f64,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            position_x: 0.0,
            position_y: 0.0,
            opacity: 1.0,
        }
    }
}

/// 关键帧数据点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Keyframe {
    /// 时间轴时间（毫秒）
    pub timeline_time_ms: f64,
    /// 属性值
    pub value: f64,
    /// 插值类型
    pub easing: EasingType,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum EasingType {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
}

/// 核心 Clip 数据结构
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Clip {
    /// 唯一标识符
    id: String,
    /// 在时间轴上的起始时间（毫秒）
    timeline_start_ms: f64,
    /// 片段时长（毫秒）
    duration_ms: f64,
    /// 源文件在媒体中的起始偏移（毫秒）
    source_start_ms: f64,
    /// 源文件总时长（毫秒）
    source_duration_ms: f64,
    /// 片段类型
    clip_type: ClipType,
    /// 所在轨道 ID
    track_id: String,
    /// 文件名称
    file_name: String,
    /// 播放速度倍率
    speed: f64,
    /// 音量（0.0 ~ 1.0）
    volume: f64,
    /// 是否静音
    muted: bool,
    /// 变换属性（序列化存储）
    transform_json: String,
}

#[wasm_bindgen]
impl Clip {
    #[wasm_bindgen(constructor)]
    pub fn new(
        id: String,
        timeline_start_ms: f64,
        duration_ms: f64,
        source_start_ms: f64,
        source_duration_ms: f64,
        clip_type: ClipType,
        track_id: String,
        file_name: String,
    ) -> Self {
        let transform = Transform::default();
        let transform_json = serde_json::to_string(&transform)
            .unwrap_or_default();

        Self {
            id,
            timeline_start_ms,
            duration_ms,
            source_start_ms,
            source_duration_ms,
            clip_type,
            track_id,
            file_name,
            speed: 1.0,
            volume: 1.0,
            muted: false,
            transform_json,
        }
    }

    // ============ Getters ============

    #[wasm_bindgen(getter)]
    pub fn id(&self) -> String { self.id.clone() }

    #[wasm_bindgen(getter)]
    pub fn timeline_start_ms(&self) -> f64 { self.timeline_start_ms }

    #[wasm_bindgen(getter)]
    pub fn duration_ms(&self) -> f64 { self.duration_ms }

    #[wasm_bindgen(getter)]
    pub fn source_start_ms(&self) -> f64 { self.source_start_ms }

    #[wasm_bindgen(getter)]
    pub fn source_duration_ms(&self) -> f64 { self.source_duration_ms }

    #[wasm_bindgen(getter)]
    pub fn clip_type(&self) -> ClipType { self.clip_type }

    #[wasm_bindgen(getter)]
    pub fn track_id(&self) -> String { self.track_id.clone() }

    #[wasm_bindgen(getter)]
    pub fn file_name(&self) -> String { self.file_name.clone() }

    #[wasm_bindgen(getter)]
    pub fn speed(&self) -> f64 { self.speed }

    #[wasm_bindgen(getter)]
    pub fn volume(&self) -> f64 { self.volume }

    #[wasm_bindgen(getter)]
    pub fn muted(&self) -> bool { self.muted }

    // ============ Setters ============

    #[wasm_bindgen(setter)]
    pub fn set_timeline_start_ms(&mut self, v: f64) {
        self.timeline_start_ms = v.max(0.0);
    }

    #[wasm_bindgen(setter)]
    pub fn set_duration_ms(&mut self, v: f64) {
        self.duration_ms = v.max(0.0);
    }

    #[wasm_bindgen(setter)]
    pub fn set_speed(&mut self, v: f64) {
        self.speed = v.max(0.1).min(10.0);
    }

    #[wasm_bindgen(setter)]
    pub fn set_volume(&mut self, v: f64) {
        self.volume = v.clamp(0.0, 2.0);
    }

    #[wasm_bindgen(setter)]
    pub fn set_muted(&mut self, v: bool) {
        self.muted = v;
    }

    // ============ 计算方法 ============

    /// 计算时间轴上的结束时间
    #[wasm_bindgen]
    pub fn timeline_end_ms(&self) -> f64 {
        self.timeline_start_ms + self.duration_ms
    }

    /// 给定时间轴时间，计算对应的源文件时间（考虑速度）
    #[wasm_bindgen]
    pub fn get_source_time_ms(&self, timeline_time_ms: f64) -> f64 {
        let relative = timeline_time_ms - self.timeline_start_ms;
        self.source_start_ms + relative * self.speed
    }

    /// 判断时间轴时间是否在此 Clip 范围内
    #[wasm_bindgen]
    pub fn contains_time(&self, timeline_time_ms: f64) -> bool {
        timeline_time_ms >= self.timeline_start_ms
            && timeline_time_ms < self.timeline_end_ms()
    }

    /// 从时间点分割 Clip，返回右半部分的 Clip（JSON 格式）
    #[wasm_bindgen]
    pub fn split_at(&self, split_time_ms: f64) -> Result<String, JsValue> {
        if !self.contains_time(split_time_ms) {
            return Err(JsValue::from_str("分割时间点不在 Clip 范围内"));
        }

        let left_duration = split_time_ms - self.timeline_start_ms;
        let right_source_start = self.source_start_ms + left_duration * self.speed;
        let right_duration = self.duration_ms - left_duration;

        let right_clip = Clip::new(
            format!("{}_right", self.id),
            split_time_ms,
            right_duration,
            right_source_start,
            self.source_duration_ms,
            self.clip_type,
            self.track_id.clone(),
            self.file_name.clone(),
        );

        serde_json::to_string(&right_clip)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 序列化为 JSON
    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 从 JSON 反序列化
    #[wasm_bindgen]
    pub fn from_json(json: &str) -> Result<Clip, JsValue> {
        serde_json::from_str(json)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// 获取变换属性 JSON
    #[wasm_bindgen]
    pub fn get_transform_json(&self) -> String {
        self.transform_json.clone()
    }

    /// 设置变换属性
    #[wasm_bindgen]
    pub fn set_transform(
        &mut self,
        scale_x: f64,
        scale_y: f64,
        rotation: f64,
        position_x: f64,
        position_y: f64,
        opacity: f64,
    ) {
        let transform = Transform {
            scale_x,
            scale_y,
            rotation,
            position_x,
            position_y,
            opacity: opacity.clamp(0.0, 1.0),
        };
        self.transform_json = serde_json::to_string(&transform)
            .unwrap_or_default();
    }
}

/// 片段碰撞检测：检查两个 Clip 是否在同一轨道上重叠
#[wasm_bindgen]
pub fn clips_overlap(
    start_a: f64, duration_a: f64,
    start_b: f64, duration_b: f64,
) -> bool {
    let end_a = start_a + duration_a;
    let end_b = start_b + duration_b;
    start_a < end_b && end_a > start_b
}