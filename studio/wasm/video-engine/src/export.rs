use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// 导出格式
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ExportFormat {
    Mp4,
    WebM,
    Gif,
    Mp3,
    Wav,
}

/// 导出质量预设
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum ExportQuality {
    Low,      // 720p, CRF 28
    Medium,   // 1080p, CRF 23
    High,     // 1080p, CRF 18
    Ultra,    // 4K, CRF 15
}

/// 导出配置
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConfig {
    format: ExportFormat,
    quality: ExportQuality,
    width: u32,
    height: u32,
    fps: f64,
    start_ms: f64,
    end_ms: f64,
    include_audio: bool,
    audio_bitrate_kbps: u32,
    video_bitrate_kbps: u32,
}

#[wasm_bindgen]
impl ExportConfig {
    #[wasm_bindgen(constructor)]
    pub fn new(
        format: ExportFormat,
        quality: ExportQuality,
        fps: f64,
        start_ms: f64,
        end_ms: f64,
    ) -> Self {
        let (width, height, vbitrate, _crf_hint) = match quality {
            ExportQuality::Low => (1280, 720, 2500, 28),
            ExportQuality::Medium => (1920, 1080, 5000, 23),
            ExportQuality::High => (1920, 1080, 8000, 18),
            ExportQuality::Ultra => (3840, 2160, 20000, 15),
        };

        Self {
            format,
            quality,
            width,
            height,
            fps,
            start_ms,
            end_ms,
            include_audio: true,
            audio_bitrate_kbps: 192,
            video_bitrate_kbps: vbitrate,
        }
    }

    /// 生成 FFmpeg 命令参数
    #[wasm_bindgen]
    pub fn build_ffmpeg_args(&self, input_file: &str, output_file: &str) -> String {
        let duration_sec = (self.end_ms - self.start_ms) / 1000.0;
        let start_sec = self.start_ms / 1000.0;

        let video_codec = match self.format {
            ExportFormat::Mp4 => "libx264",
            ExportFormat::WebM => "libvpx-vp9",
            ExportFormat::Gif => "gif",
            ExportFormat::Mp3 | ExportFormat::Wav => "copy",
        };

        let audio_codec = match self.format {
            ExportFormat::Mp4 => "aac",
            ExportFormat::WebM => "libopus",
            ExportFormat::Mp3 => "libmp3lame",
            ExportFormat::Wav => "pcm_s16le",
            ExportFormat::Gif => "none",
        };

        let mut args = format!(
            "-ss {:.3} -i {} -t {:.3} \
             -vf scale={}:{} \
             -r {} \
             -c:v {} \
             -b:v {}k",
            start_sec, input_file, duration_sec,
            self.width, self.height,
            self.fps,
            video_codec,
            self.video_bitrate_kbps
        );

        if self.include_audio && !matches!(self.format, ExportFormat::Gif) {
            args.push_str(&format!(
                " -c:a {} -b:a {}k",
                audio_codec, self.audio_bitrate_kbps
            ));
        } else {
            args.push_str(" -an");
        }

        args.push_str(&format!(" -y {}", output_file));
        args
    }

    /// 估算导出文件大小（字节）
    #[wasm_bindgen]
    pub fn estimate_file_size_bytes(&self) -> f64 {
        let duration_sec = (self.end_ms - self.start_ms) / 1000.0;
        let total_bitrate = self.video_bitrate_kbps + self.audio_bitrate_kbps;
        (total_bitrate as f64 * 1000.0 / 8.0) * duration_sec
    }

    #[wasm_bindgen]
    pub fn to_json(&self) -> Result<String, JsValue> {
        serde_json::to_string(self)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }
}

/// 导出进度跟踪器
#[wasm_bindgen]
pub struct ExportProgress {
    total_frames: u64,
    current_frame: u64,
    started_at_ms: f64,
}

#[wasm_bindgen]
impl ExportProgress {
    #[wasm_bindgen(constructor)]
    pub fn new(total_frames: u64, started_at_ms: f64) -> Self {
        Self { total_frames, current_frame: 0, started_at_ms }
    }

    #[wasm_bindgen]
    pub fn update(&mut self, frame: u64) {
        self.current_frame = frame;
    }

    #[wasm_bindgen]
    pub fn percent(&self) -> f64 {
        if self.total_frames == 0 { return 0.0; }
        self.current_frame as f64 / self.total_frames as f64 * 100.0
    }

    /// 估算剩余时间（毫秒）
    #[wasm_bindgen]
    pub fn eta_ms(&self, current_time_ms: f64) -> f64 {
        let elapsed = current_time_ms - self.started_at_ms;
        if self.current_frame == 0 { return f64::INFINITY; }

        let rate = self.current_frame as f64 / elapsed;
        let remaining = self.total_frames - self.current_frame;
        remaining as f64 / rate
    }
}