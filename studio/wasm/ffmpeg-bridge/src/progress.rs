//! FFmpeg 输出日志解析器
//! 从 FFmpeg stderr 文本中提取进度信息

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

// ─── 进度数据 ────────────────────────────────────────────────────
#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressInfo {
    /// 已处理的视频帧数
    pub frame: u64,
    /// 当前处理速度（fps）
    pub fps: f64,
    /// 当前输出码率（kbps）
    pub bitrate_kbps: f64,
    /// 已处理时间（秒）
    pub time_sec: f64,
    /// 输出文件大小（KB）
    pub size_kb: f64,
    /// 处理速度比（2.0x 表示比实时快 2 倍）
    pub speed: f64,
    /// 完成百分比（需要知道总时长才能计算）
    pub percent: Option<f64>,
}

impl Default for ProgressInfo {
    fn default() -> Self {
        Self {
            frame: 0,
            fps: 0.0,
            bitrate_kbps: 0.0,
            time_sec: 0.0,
            size_kb: 0.0,
            speed: 0.0,
            percent: None,
        }
    }
}

// ─── 日志解析器 ──────────────────────────────────────────────────
#[wasm_bindgen]
pub struct ProgressParser {
    /// 总时长（秒），用于计算百分比
    total_duration_sec: f64,
    /// 最近一次解析结果
    last_progress: ProgressInfo,
}

#[wasm_bindgen]
impl ProgressParser {
    #[wasm_bindgen(constructor)]
    pub fn new(total_duration_sec: f64) -> Self {
        Self {
            total_duration_sec,
            last_progress: ProgressInfo::default(),
        }
    }

    /// 解析一行 FFmpeg 日志，返回进度 JSON（如果该行含进度信息）
    ///
    /// FFmpeg 进度行格式示例：
    /// `frame=  120 fps= 60 q=28.0 size=    512kB time=00:00:04.00 bitrate=1048.6kbits/s speed=2.00x`
    #[wasm_bindgen]
    pub fn parse_line(&mut self, line: &str) -> Option<String> {
        // 只处理包含 time= 的进度行
        if !line.contains("time=") {
            return None;
        }

        let mut info = ProgressInfo::default();
        info.percent = None;

        // ── 解析 frame ──
        if let Some(v) = extract_value(line, "frame=") {
            info.frame = v.trim().parse().unwrap_or(0);
        }

        // ── 解析 fps ──
        if let Some(v) = extract_value(line, "fps=") {
            info.fps = v.trim().parse().unwrap_or(0.0);
        }

        // ── 解析 bitrate ──
        // 格式：bitrate=1048.6kbits/s
        if let Some(v) = extract_value(line, "bitrate=") {
            let cleaned = v.trim()
                .replace("kbits/s", "")
                .replace("bits/s", "");
            if v.contains("kbits") {
                info.bitrate_kbps = cleaned.parse().unwrap_or(0.0);
            } else {
                info.bitrate_kbps = cleaned.parse::<f64>().unwrap_or(0.0) / 1000.0;
            }
        }

        // ── 解析 time ──
        // 格式：time=00:01:23.45
        if let Some(v) = extract_value(line, "time=") {
            info.time_sec = parse_time_str(v.trim());
        }

        // ── 解析 size ──
        // 格式：size=    512kB
        if let Some(v) = extract_value(line, "size=") {
            let cleaned = v.trim().replace("kB", "").replace("KB", "");
            info.size_kb = cleaned.parse().unwrap_or(0.0);
        }

        // ── 解析 speed ──
        // 格式：speed=2.00x
        if let Some(v) = extract_value(line, "speed=") {
            let cleaned = v.trim().replace('x', "");
            info.speed = cleaned.parse().unwrap_or(0.0);
        }

        // ── 计算百分比 ──
        if self.total_duration_sec > 0.0 && info.time_sec > 0.0 {
            let pct = (info.time_sec / self.total_duration_sec * 100.0)
                .min(99.9); // 不显示 100%，等待 complete 事件
            info.percent = Some(pct);
        }

        // ── 估算剩余时间 ──
        // 通过 speed 计算：remaining_real = remaining_video / speed
        let remaining_video = self.total_duration_sec - info.time_sec;
        let _eta_sec = if info.speed > 0.0 {
            remaining_video / info.speed
        } else {
            f64::INFINITY
        };

        self.last_progress = info.clone();

        serde_json::to_string(&info).ok()
    }

    /// 获取最近一次解析的进度
    #[wasm_bindgen]
    pub fn last_progress_json(&self) -> String {
        serde_json::to_string(&self.last_progress)
            .unwrap_or_else(|_| "{}".to_string())
    }

    /// 更新总时长（当从视频元数据获取后调用）
    #[wasm_bindgen]
    pub fn set_total_duration(&mut self, sec: f64) {
        self.total_duration_sec = sec;
    }
}

// ─── 工具函数 ────────────────────────────────────────────────────

/// 从日志行中提取 `key=value` 的 value 部分
/// 支持空格填充：`frame=  120 fps=...`
fn extract_value<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let start = line.find(key)? + key.len();
    let rest = &line[start..];

    // value 到下一个空格或字符串结尾
    let end = rest.find(|c: char| c == ' ' && !rest.starts_with(' '))
        .or_else(|| rest.find('\n'))
        .unwrap_or(rest.len());

    // 跳过前导空格
    let value = rest[..end].trim();
    if value.is_empty() { None } else { Some(&rest[..end]) }
}

/// 解析 HH:MM:SS.ss 格式为秒数
fn parse_time_str(s: &str) -> f64 {
    // 处理负数时间（FFmpeg 处理某些格式时可能出现）
    if s.starts_with('-') { return 0.0; }

    let parts: Vec<&str> = s.split(':').collect();
    match parts.as_slice() {
        [h, m, s] => {
            let hours:   f64 = h.parse().unwrap_or(0.0);
            let minutes: f64 = m.parse().unwrap_or(0.0);
            let seconds: f64 = s.parse().unwrap_or(0.0);
            hours * 3600.0 + minutes * 60.0 + seconds
        }
        [m, s] => {
            let minutes: f64 = m.parse().unwrap_or(0.0);
            let seconds: f64 = s.parse().unwrap_or(0.0);
            minutes * 60.0 + seconds
        }
        [s] => s.parse().unwrap_or(0.0),
        _ => 0.0,
    }
}

// ─── 媒体信息解析器 ──────────────────────────────────────────────

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct MediaInfo {
    pub duration_sec: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub video_codec: String,
    pub audio_codec: String,
    pub audio_sample_rate: u32,
    pub audio_channels: u32,
    pub bitrate_kbps: u64,
    pub file_size_bytes: u64,
}

#[wasm_bindgen]
pub struct MediaInfoWrapper {
    inner: MediaInfo,
}

#[wasm_bindgen]
impl MediaInfoWrapper {
    #[wasm_bindgen(getter)]
    pub fn duration_sec(&self) -> f64 { self.inner.duration_sec }
    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 { self.inner.width }
    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 { self.inner.height }
    #[wasm_bindgen(getter)]
    pub fn fps(&self) -> f64 { self.inner.fps }
    #[wasm_bindgen(getter)]
    pub fn video_codec(&self) -> String { self.inner.video_codec.clone() }
    #[wasm_bindgen(getter)]
    pub fn audio_codec(&self) -> String { self.inner.audio_codec.clone() }
    #[wasm_bindgen(getter)]
    pub fn audio_sample_rate(&self) -> u32 { self.inner.audio_sample_rate }
    #[wasm_bindgen(getter)]
    pub fn audio_channels(&self) -> u32 { self.inner.audio_channels }
    #[wasm_bindgen(getter)]
    pub fn bitrate_kbps(&self) -> u64 { self.inner.bitrate_kbps }
    #[wasm_bindgen(getter)]
    pub fn file_size_bytes(&self) -> u64 { self.inner.file_size_bytes }
    
    #[wasm_bindgen]
    pub fn to_json(&self) -> String {
        serde_json::to_string(&self.inner).unwrap_or_default()
    }
}

#[wasm_bindgen]
pub struct MediaInfoParser {
    buffer: String,
}

#[wasm_bindgen]
impl MediaInfoParser {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { buffer: String::new() }
    }

    /// 追加 FFmpeg 日志行
    #[wasm_bindgen]
    pub fn feed(&mut self, line: &str) {
        self.buffer.push_str(line);
        self.buffer.push('\n');
    }

    /// 解析已收集的日志，提取媒体信息
    ///
    /// FFmpeg ffprobe/stderr 输出格式（简化）：
    /// `  Duration: 00:01:23.45, start: 0.000000, bitrate: 2048 kb/s`
    /// `    Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps`
    /// `    Stream #0:1: Audio: aac, 44100 Hz, stereo`
    #[wasm_bindgen]
    pub fn parse(&self) -> MediaInfoWrapper {
        let mut info = MediaInfo::default();

        for line in self.buffer.lines() {
            let line = line.trim();

            // ── Duration ──
            // `Duration: 00:01:23.45, start: ...`
            if line.starts_with("Duration:") {
                if let Some(dur_str) = line
                    .split(',')
                    .next()
                    .and_then(|s| s.strip_prefix("Duration:"))
                {
                    info.duration_sec = parse_time_str(dur_str.trim());
                }

                // bitrate
                if let Some(br_part) = line.split("bitrate:").nth(1) {
                    let br_str = br_part.trim().split_whitespace().next().unwrap_or("0");
                    info.bitrate_kbps = br_str.parse().unwrap_or(0);
                }
            }

            // ── Video Stream ──
            // `Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps`
            if line.contains("Video:") {
                // 编解码器名
                if let Some(codec_part) = line.split("Video:").nth(1) {
                    let codec = codec_part.trim()
                        .split(|c: char| c == ',' || c == ' ')
                        .next()
                        .unwrap_or("unknown");
                    info.video_codec = codec.to_string();
                }

                // 分辨率：匹配 NNNNxNNNN 模式
                for part in line.split_whitespace() {
                    let part = part.trim_end_matches(',');
                    if let Some(idx) = part.find('x') {
                        let w_str = &part[..idx];
                        let h_str = &part[idx+1..];
                        if let (Ok(w), Ok(h)) = (w_str.parse::<u32>(), h_str.parse::<u32>()) {
                            if w > 0 && w < 8192 && h > 0 && h < 8192 {
                                info.width = w;
                                info.height = h;
                            }
                        }
                    }
                }

                // fps：`29.97 fps` 或 `30 tbr`
                let parts: Vec<&str> = line.split_whitespace().collect();
                for (i, part) in parts.iter().enumerate() {
                    if (*part == "fps" || *part == "fps,") && i > 0 {
                        info.fps = parts[i-1].parse().unwrap_or(0.0);
                        break;
                    }
                    if (*part == "tbr" || *part == "tbr,") && i > 0 {
                        if info.fps == 0.0 {
                            info.fps = parts[i-1].parse().unwrap_or(0.0);
                        }
                    }
                }
            }

            // ── Audio Stream ──
            // `Stream #0:1: Audio: aac, 44100 Hz, stereo, ...`
            if line.contains("Audio:") {
                if let Some(audio_part) = line.split("Audio:").nth(1) {
                    let parts: Vec<&str> = audio_part.split(',').collect();

                    // 编解码器
                    if let Some(codec) = parts.first() {
                        info.audio_codec = codec.trim().to_string();
                    }

                    // 采样率
                    for part in &parts {
                        let part = part.trim();
                        if part.ends_with("Hz") {
                            let rate_str = part.trim_end_matches("Hz").trim();
                            info.audio_sample_rate = rate_str.parse().unwrap_or(0);
                        }
                    }

                    // 声道数
                    for part in &parts {
                        let part = part.trim();
                        match part {
                            "mono"   => { info.audio_channels = 1; }
                            "stereo" => { info.audio_channels = 2; }
                            s if s.contains("channels") => {
                                let n = s.split_whitespace().next().unwrap_or("0");
                                info.audio_channels = n.parse().unwrap_or(0);
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        MediaInfoWrapper { inner: info }
    }

    #[wasm_bindgen]
    pub fn clear(&mut self) {
        self.buffer.clear();
    }
}

// ─── 单元测试 ────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_time_str() {
        assert_eq!(parse_time_str("00:01:23.45"), 83.45);
        assert_eq!(parse_time_str("01:00:00.00"), 3600.0);
        assert_eq!(parse_time_str("00:00:05.50"), 5.5);
    }

    #[test]
    fn test_progress_parser() {
        let mut parser = ProgressParser::new(60.0);
        let line = "frame=  120 fps= 60 q=28.0 size=  512kB time=00:00:04.00 bitrate=1048.6kbits/s speed=2.00x";
        let result = parser.parse_line(line);
        assert!(result.is_some());

        let info: ProgressInfo = serde_json::from_str(&result.unwrap()).unwrap();
        assert_eq!(info.frame, 120);
        assert!((info.fps - 60.0).abs() < 0.1);
        assert!((info.time_sec - 4.0).abs() < 0.1);
        assert!((info.speed - 2.0).abs() < 0.1);
        assert!(info.percent.is_some());
        assert!((info.percent.unwrap() - 6.67).abs() < 0.1);
    }

    #[test]
    fn test_media_info_parser() {
        let mut parser = MediaInfoParser::new();
        parser.feed("  Duration: 00:01:30.00, start: 0.000000, bitrate: 2048 kb/s");
        parser.feed("    Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps, 29.97 tbr");
        parser.feed("    Stream #0:1: Audio: aac, 44100 Hz, stereo, fltp, 192 kb/s");

        let info = parser.parse();

        assert!((info.duration_sec() - 90.0).abs() < 0.1);
        assert_eq!(info.width(), 1920);
        assert_eq!(info.height(), 1080);
        assert!((info.fps() - 29.97).abs() < 0.1);
        assert_eq!(info.audio_sample_rate(), 44100);
        assert_eq!(info.audio_channels(), 2);
       }
}