use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use crate::clip::{Clip, ClipType};

/// 轨道类型
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum TrackType {
    Video,
    Audio,
    Overlay,
    Text,
}

/// 时间轴轨道
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub name: String,
    pub track_type: TrackType,
    pub clip_ids: Vec<String>,
    pub muted: bool,
    pub locked: bool,
    pub height: f64,
    pub order: usize,
}

impl Track {
    pub fn new(id: String, name: String, track_type: TrackType, order: usize) -> Self {
        Self {
            id,
            name,
            track_type,
            clip_ids: Vec::new(),
            muted: false,
            locked: false,
            height: 60.0,
            order,
        }
    }
}

/// 时间轴历史记录条目（用于撤销/重做）
#[derive(Clone, Serialize, Deserialize)]
struct HistoryEntry {
    description: String,
    clips_snapshot: HashMap<String, String>, // clip_id -> clip_json
    tracks_snapshot: Vec<String>,            // track_json list
}

/// 核心时间轴引擎
#[wasm_bindgen]
pub struct Timeline {
    /// 所有 Clip 的存储（id -> Clip）
    clips: HashMap<String, Clip>,
    /// 轨道列表（有序）
    tracks: Vec<Track>,
    /// 总时长缓存（毫秒）
    total_duration_ms: f64,
    /// 帧率
    fps: f64,
    /// 画布分辨率
    canvas_width: u32,
    canvas_height: u32,
    /// 撤销栈
    undo_stack: Vec<HistoryEntry>,
    /// 重做栈
    redo_stack: Vec<HistoryEntry>,
    /// 最大历史记录数
    max_history: usize,
}

#[wasm_bindgen]
impl Timeline {
    #[wasm_bindgen(constructor)]
    pub fn new(fps: f64, canvas_width: u32, canvas_height: u32) -> Self {
        log::info!("创建时间轴：{}fps, {}x{}", fps, canvas_width, canvas_height);
        Self {
            clips: HashMap::new(),
            tracks: Vec::new(),
            total_duration_ms: 0.0,
            fps,
            canvas_width,
            canvas_height,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_history: 50,
        }
    }

    // ============ 基础属性 ============

    #[wasm_bindgen(getter)]
    pub fn fps(&self) -> f64 { self.fps }

    #[wasm_bindgen(getter)]
    pub fn canvas_width(&self) -> u32 { self.canvas_width }

    #[wasm_bindgen(getter)]
    pub fn canvas_height(&self) -> u32 { self.canvas_height }

    #[wasm_bindgen(getter)]
    pub fn total_duration_ms(&self) -> f64 { self.total_duration_ms }

    #[wasm_bindgen(getter)]
    pub fn clip_count(&self) -> usize { self.clips.len() }

    #[wasm_bindgen(getter)]
    pub fn track_count(&self) -> usize { self.tracks.len() }

    // ============ 轨道管理 ============

    /// 添加新轨道
    #[wasm_bindgen]
    pub fn add_track(
        &mut self,
        id: String,
        name: String,
        track_type: TrackType,
    ) -> Result<(), JsValue> {
        if self.tracks.iter().any(|t| t.id == id) {
            return Err(JsValue::from_str(&format!("轨道 ID {} 已存在", id)));
        }
        let order = self.tracks.len();
        self.tracks.push(Track::new(id, name, track_type, order));
        log::debug!("添加轨道，当前共 {} 条轨道", self.tracks.len());
        Ok(())
    }

    /// 删除轨道及其所有 Clip
    #[wasm_bindgen]
    pub fn remove_track(&mut self, track_id: &str) -> Result<(), JsValue> {
        self.save_history("删除轨道");

        let track = self.tracks.iter()
            .find(|t| t.id == track_id)
            .ok_or_else(|| JsValue::from_str("轨道不存在"))?;

        // 删除轨道上的所有 Clip
        let clip_ids: Vec<String> = track.clip_ids.clone();
        for clip_id in clip_ids {
            self.clips.remove(&clip_id);
        }

        self.tracks.retain(|t| t.id != track_id);
        self.recalculate_duration();
        Ok(())
    }

    /// 获取所有轨道的 JSON 列表
    #[wasm_bindgen]
    pub fn get_tracks_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(&self.tracks)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    // ============ Clip 管理 ============

    /// 添加 Clip 到时间轴
    #[wasm_bindgen]
    pub fn add_clip(&mut self, clip: Clip) -> Result<(), JsValue> {
        self.save_history("添加片段");

        let track_id = clip.track_id();
        let clip_id = clip.id();

        // 先检查碰撞（需要不可变借用）
        self.check_collision_internal(&clip)?;

        // 验证轨道存在并添加（需要可变借用）
        let track = self.tracks.iter_mut()
            .find(|t| t.id == track_id)
            .ok_or_else(|| JsValue::from_str("目标轨道不存在"))?;

        track.clip_ids.push(clip_id.clone());
        self.clips.insert(clip_id, clip);
        self.recalculate_duration();

        Ok(())
    }

    /// 删除 Clip
    #[wasm_bindgen]
    pub fn remove_clip(&mut self, clip_id: &str) -> Result<(), JsValue> {
        self.save_history("删除片段");

        let clip = self.clips.remove(clip_id)
            .ok_or_else(|| JsValue::from_str("Clip 不存在"))?;

        // 从轨道中移除引用
        if let Some(track) = self.tracks.iter_mut()
            .find(|t| t.id == clip.track_id())
        {
            track.clip_ids.retain(|id| id != clip_id);
        }

        self.recalculate_duration();
        Ok(())
    }

    /// 移动 Clip 到新的时间轴位置
    #[wasm_bindgen]
    pub fn move_clip(
        &mut self,
        clip_id: &str,
        new_start_ms: f64,
        new_track_id: Option<String>,
    ) -> Result<(), JsValue> {
        self.save_history("移动片段");

        let clip = self.clips.get_mut(clip_id)
            .ok_or_else(|| JsValue::from_str("Clip 不存在"))?;

        let old_track_id = clip.track_id();
        let old_start = clip.timeline_start_ms();
        clip.set_timeline_start_ms(new_start_ms);

        if let Some(ref new_tid) = new_track_id {
            if *new_tid != old_track_id {
                // 跨轨道移动：更新 track_id
                // 注意：此处需要重建 Clip 因为 track_id 不可直接设置
                // 实际项目中可以让 Clip 暴露 set_track_id
                let _new_track = self.tracks.iter()
                    .find(|t| &t.id == new_tid)
                    .ok_or_else(|| JsValue::from_str("目标轨道不存在"))?;

                // 从旧轨道移除
                if let Some(old_track) = self.tracks.iter_mut()
                    .find(|t| t.id == old_track_id)
                {
                    old_track.clip_ids.retain(|id| id != clip_id);
                }

                // 添加到新轨道
                if let Some(new_track) = self.tracks.iter_mut()
                    .find(|t| &t.id == new_tid)
                {
                    new_track.clip_ids.push(clip_id.to_string());
                }
            }
        }

        self.recalculate_duration();
        Ok(())
    }

    /// 分割 Clip
    #[wasm_bindgen]
    pub fn split_clip(
        &mut self,
        clip_id: &str,
        split_time_ms: f64,
    ) -> Result<String, JsValue> {
        self.save_history("分割片段");

        let clip = self.clips.get(clip_id)
            .ok_or_else(|| JsValue::from_str("Clip 不存在"))?;

        // 生成右半部分
        let right_json = clip.split_at(split_time_ms)?;
        let mut right_clip: Clip = serde_json::from_str(&right_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        // 生成新 ID
        let new_id = format!("clip_{}", js_sys::Date::now() as u64);
        let right_id = new_id.clone();

        // 截断左半部分
        let left_duration = split_time_ms - clip.timeline_start_ms();
        let clip = self.clips.get_mut(clip_id).unwrap();
        clip.set_duration_ms(left_duration);

        // 添加右半部分到同一轨道
        let track_id = right_clip.track_id();
        if let Some(track) = self.tracks.iter_mut()
            .find(|t| t.id == track_id)
        {
            track.clip_ids.push(right_id.clone());
        }
        self.clips.insert(right_id.clone(), right_clip);

        self.recalculate_duration();
        Ok(right_id)
    }

    /// 获取指定时间点所有激活的 Clip（JSON 数组）
    #[wasm_bindgen]
    pub fn get_active_clips_at(&self, timeline_time_ms: f64) -> Result<String, JsValue> {
        let active: Vec<&Clip> = self.clips.values()
            .filter(|c| c.contains_time(timeline_time_ms))
            .collect();

        let jsons: Vec<String> = active.iter()
            .filter_map(|c| c.to_json().ok())
            .collect();

        Ok(format!("[{}]", jsons.join(",")))
    }

    /// 获取指定 Clip 的 JSON
    #[wasm_bindgen]
    pub fn get_clip_json(&self, clip_id: &str) -> Result<String, JsValue> {
        self.clips.get(clip_id)
            .ok_or_else(|| JsValue::from_str("Clip 不存在"))
            .and_then(|c| c.to_json())
    }

    /// 获取所有 Clip 的 JSON 数组
    #[wasm_bindgen]
    pub fn get_all_clips_json(&self) -> Result<String, JsValue> {
        let jsons: Vec<String> = self.clips.values()
            .filter_map(|c| c.to_json().ok())
            .collect();
        Ok(format!("[{}]", jsons.join(",")))
    }

    // ============ 碰撞检测 ============

    /// 检查 Clip 是否会与轨道上现有 Clip 碰撞
    #[wasm_bindgen]
    pub fn check_collision(&self, clip_json: &str) -> Result<bool, JsValue> {
        let clip: Clip = serde_json::from_str(clip_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.check_collision_internal(&clip).map(|_| false)
            .or(Ok(true))
    }

    fn check_collision_internal(&self, new_clip: &Clip) -> Result<(), JsValue> {
        let track = self.tracks.iter()
            .find(|t| t.id == new_clip.track_id())
            .ok_or_else(|| JsValue::from_str("轨道不存在"))?;

        for existing_id in &track.clip_ids {
            // 跳过自身
            if existing_id == &new_clip.id() { continue; }

            if let Some(existing) = self.clips.get(existing_id) {
                let overlaps = crate::clip::clips_overlap(
                    new_clip.timeline_start_ms(),
                    new_clip.duration_ms(),
                    existing.timeline_start_ms(),
                    existing.duration_ms(),
                );
                if overlaps {
                    return Err(JsValue::from_str(&format!(
                        "片段与 {} 在时间轴上重叠",
                        existing.file_name()
                    )));
                }
            }
        }
        Ok(())
    }

    // ============ 撤销/重做 ============

    fn save_history(&mut self, description: &str) {
        let clips_snapshot: HashMap<String, String> = self.clips.iter()
            .filter_map(|(id, clip)| {
                clip.to_json().ok().map(|json| (id.clone(), json))
            })
            .collect();

        let tracks_snapshot: Vec<String> = self.tracks.iter()
            .filter_map(|t| serde_json::to_string(t).ok())
            .collect();

        let entry = HistoryEntry {
            description: description.to_string(),
            clips_snapshot,
            tracks_snapshot,
        };

        self.undo_stack.push(entry);
        if self.undo_stack.len() > self.max_history {
            self.undo_stack.remove(0);
        }

        // 新操作清空重做栈
        self.redo_stack.clear();
    }

    fn restore_from_entry(&mut self, entry: HistoryEntry) -> Result<(), JsValue> {
        // 恢复 clips
        self.clips.clear();
        for (id, json) in entry.clips_snapshot {
            let clip: Clip = serde_json::from_str(&json)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;
            self.clips.insert(id, clip);
        }

        // 恢复 tracks
        self.tracks.clear();
        for json in entry.tracks_snapshot {
            let track: Track = serde_json::from_str(&json)
                .map_err(|e| JsValue::from_str(&e.to_string()))?;
            self.tracks.push(track);
        }

        self.recalculate_duration();
        Ok(())
    }

    /// 撤销
    #[wasm_bindgen]
    pub fn undo(&mut self) -> Result<bool, JsValue> {
        if self.undo_stack.is_empty() {
            return Ok(false);
        }

        // 保存当前状态到重做栈
        let current_clips: HashMap<String, String> = self.clips.iter()
            .filter_map(|(id, c)| c.to_json().ok().map(|j| (id.clone(), j)))
            .collect();
        let current_tracks: Vec<String> = self.tracks.iter()
            .filter_map(|t| serde_json::to_string(t).ok())
            .collect();

        self.redo_stack.push(HistoryEntry {
            description: "redo_state".to_string(),
            clips_snapshot: current_clips,
            tracks_snapshot: current_tracks,
        });

        let entry = self.undo_stack.pop().unwrap();
        log::debug!("撤销操作：{}", entry.description);
        self.restore_from_entry(entry)?;
        Ok(true)
    }

    /// 重做
    #[wasm_bindgen]
    pub fn redo(&mut self) -> Result<bool, JsValue> {
        if self.redo_stack.is_empty() {
            return Ok(false);
        }

        let current_clips: HashMap<String, String> = self.clips.iter()
            .filter_map(|(id, c)| c.to_json().ok().map(|j| (id.clone(), j)))
            .collect();
        let current_tracks: Vec<String> = self.tracks.iter()
            .filter_map(|t| serde_json::to_string(t).ok())
            .collect();

        self.undo_stack.push(HistoryEntry {
            description: "undo_state".to_string(),
            clips_snapshot: current_clips,
            tracks_snapshot: current_tracks,
        });

        let entry = self.redo_stack.pop().unwrap();
        self.restore_from_entry(entry)?;
        Ok(true)
    }

    #[wasm_bindgen]
    pub fn undo_stack_size(&self) -> usize { self.undo_stack.len() }

    #[wasm_bindgen]
    pub fn redo_stack_size(&self) -> usize { self.redo_stack.len() }

    // ============ 工具方法 ============

    /// 将时间（ms）转换为帧号
    #[wasm_bindgen]
    pub fn ms_to_frame(&self, ms: f64) -> u64 {
        (ms * self.fps / 1000.0) as u64
    }

    /// 将帧号转换为时间（ms）
    #[wasm_bindgen]
    pub fn frame_to_ms(&self, frame: u64) -> f64 {
        frame as f64 * 1000.0 / self.fps
    }

    /// 吸附到帧边界
    #[wasm_bindgen]
    pub fn snap_to_frame(&self, ms: f64) -> f64 {
        let frame = self.ms_to_frame(ms);
        self.frame_to_ms(frame)
    }

    /// 重新计算总时长
    fn recalculate_duration(&mut self) {
        self.total_duration_ms = self.clips.values()
            .map(|c| c.timeline_end_ms())
            .fold(0.0_f64, f64::max);
    }

    /// 序列化整个时间轴为 JSON（用于保存项目）
    #[wasm_bindgen]
    pub fn serialize_project(&self) -> Result<String, JsValue> {
        let project = serde_json::json!({
            "version": "1.0",
            "fps": self.fps,
            "canvas_width": self.canvas_width,
            "canvas_height": self.canvas_height,
            "total_duration_ms": self.total_duration_ms,
            "tracks": self.tracks,
            "clips": self.clips.values()
                .filter_map(|c| c.to_json().ok()
                    .and_then(|j| serde_json::from_str::<serde_json::Value>(&j).ok()))
                .collect::<Vec<_>>(),
        });

        serde_json::to_string_pretty(&project)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}