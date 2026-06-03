//! FFmpeg 命令构建器
//! 负责将高层操作描述转换为 FFmpeg CLI 参数列表

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ─── 视频编解码器 ────────────────────────────────────────────────
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum VideoCodec {
    /// H.264，兼容性最佳
    H264,
    /// H.265，压缩率更高
    H265,
    /// VP9，WebM 容器
    Vp9,
    /// 流复制（不重新编码，速度极快）
    Copy,
}

impl VideoCodec {
    pub fn to_ffmpeg_str(&self) -> &'static str {
        match self {
            VideoCodec::H264 => "libx264",
            VideoCodec::H265 => "libx265",
            VideoCodec::Vp9  => "libvpx-vp9",
            VideoCodec::Copy => "copy",
        }
    }
}

// ─── 音频编解码器 ────────────────────────────────────────────────
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum AudioCodec {
    Aac,
    Mp3,
    Opus,
    Pcm,
    Copy,
    /// 不包含音频轨道
    None,
}

impl AudioCodec {
    pub fn to_ffmpeg_str(&self) -> &'static str {
        match self {
            AudioCodec::Aac  => "aac",
            AudioCodec::Mp3  => "libmp3lame",
            AudioCodec::Opus => "libopus",
            AudioCodec::Pcm  => "pcm_s16le",
            AudioCodec::Copy => "copy",
            AudioCodec::None => "none",
        }
    }
}

// ─── 输出容器格式 ────────────────────────────────────────────────
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum Container {
    Mp4,
    WebM,
    Mkv,
    Mp3,
    Wav,
    Gif,
}

impl Container {
    pub fn extension(&self) -> &'static str {
        match self {
            Container::Mp4  => "mp4",
            Container::WebM => "webm",
            Container::Mkv  => "mkv",
            Container::Mp3  => "mp3",
            Container::Wav  => "wav",
            Container::Gif  => "gif",
        }
    }

    /// 根据容器格式推荐默认编解码器
    pub fn default_codecs(&self) -> (VideoCodec, AudioCodec) {
        match self {
            Container::Mp4  => (VideoCodec::H264, AudioCodec::Aac),
            Container::WebM => (VideoCodec::Vp9,  AudioCodec::Opus),
            Container::Mkv  => (VideoCodec::H264, AudioCodec::Aac),
            Container::Mp3  => (VideoCodec::Copy, AudioCodec::Mp3),
            Container::Wav  => (VideoCodec::Copy, AudioCodec::Pcm),
            Container::Gif  => (VideoCodec::Copy, AudioCodec::None),
        }
    }
}

// ─── 视频滤镜 ────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VideoFilter {
    /// 缩放到指定分辨率
    Scale { width: i32, height: i32 },
    /// 裁剪
    Crop { x: i32, y: i32, w: i32, h: i32 },
    /// 旋转（顺时针 90 度的倍数）
    Rotate(u32),
    /// 翻转
    HFlip,
    VFlip,
    /// 亮度/对比度
    Eq { brightness: f32, contrast: f32, saturation: f32 },
    /// 调整帧率
    Fps(f64),
    /// 自定义滤镜字符串
    Custom(String),
}

impl VideoFilter {
    pub fn to_filter_str(&self) -> String {
        match self {
            VideoFilter::Scale { width, height } => {
                // -2 表示保持宽高比并对齐到偶数
                let w = if *width  == -1 { "-2".to_string() } else { width.to_string() };
                let h = if *height == -1 { "-2".to_string() } else { height.to_string() };
                format!("scale={}:{}", w, h)
            }
            VideoFilter::Crop { x, y, w, h } => {
                format!("crop={}:{}:{}:{}", w, h, x, y)
            }
            VideoFilter::Rotate(deg) => {
                match deg % 360 {
                    90  => "transpose=1".to_string(),
                    180 => "transpose=1,transpose=1".to_string(),
                    270 => "transpose=2".to_string(),
                    _   => String::new(),
                }
            }
            VideoFilter::HFlip => "hflip".to_string(),
            VideoFilter::VFlip => "vflip".to_string(),
            VideoFilter::Eq { brightness, contrast, saturation } => {
                format!(
                    "eq=brightness={:.3}:contrast={:.3}:saturation={:.3}",
                    brightness, contrast, saturation
                )
            }
            VideoFilter::Fps(fps) => format!("fps={}", fps),
            VideoFilter::Custom(s) => s.clone(),
        }
    }
}

// ─── FFmpeg 命令描述结构 ─────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfmpegInput {
    /// 输入文件名（在 WASM 虚拟文件系统中的路径）
    pub file_name: String,
    /// 从此时间开始读取（秒）
    pub seek_to: Option<f64>,
    /// 读取时长（秒）
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfmpegOutput {
    pub file_name: String,
    pub container: Container,
    pub video_codec: VideoCodec,
    pub audio_codec: AudioCodec,
    pub video_bitrate_kbps: Option<u32>,
    pub audio_bitrate_kbps: Option<u32>,
    pub fps: Option<f64>,
    pub filters: Vec<VideoFilter>,
    /// 追加额外的任意参数
    pub extra_args: Vec<String>,
}

/// 完整的 FFmpeg 任务描述
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfmpegCommand {
    pub inputs: Vec<FfmpegInput>,
    pub output: FfmpegOutput,
}

impl FfmpegCommand {
    /// 将结构体展开为 FFmpeg 参数数组
    pub fn build_args(&self) -> Vec<String> {
        let mut args: Vec<String> = Vec::new();

        // ── 输入段 ──
        for input in &self.inputs {
            // 输入前的 -ss（精确 seek，放在 -i 前面速度更快）
            if let Some(seek) = input.seek_to {
                args.push("-ss".into());
                args.push(format!("{:.6}", seek));
            }

            args.push("-i".into());
            args.push(input.file_name.clone());

            // 输入后的 -t（持续时长）
            if let Some(dur) = input.duration {
                args.push("-t".into());
                args.push(format!("{:.6}", dur));
            }
        }

        // ── 视频编解码器 ──
        args.push("-c:v".into());
        args.push(self.output.video_codec.to_ffmpeg_str().into());

        // ── 视频码率 ──
        if let Some(vbr) = self.output.video_bitrate_kbps {
            if self.output.video_codec != VideoCodec::Copy {
                args.push("-b:v".into());
                args.push(format!("{}k", vbr));
            }
        }

        // ── 视频滤镜链 ──
        if !self.output.filters.is_empty()
            && self.output.video_codec != VideoCodec::Copy
        {
            let filter_str = self.output.filters
                .iter()
                .map(|f| f.to_filter_str())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(",");

            if !filter_str.is_empty() {
                args.push("-vf".into());
                args.push(filter_str);
            }
        }

        // ── 帧率 ──
        if let Some(fps) = self.output.fps {
            if self.output.video_codec != VideoCodec::Copy {
                args.push("-r".into());
                args.push(format!("{}", fps));
            }
        }

        // ── 音频编解码器 ──
        match self.output.audio_codec {
            AudioCodec::None => {
                args.push("-an".into());
            }
            codec => {
                args.push("-c:a".into());
                args.push(codec.to_ffmpeg_str().into());

                if let Some(abr) = self.output.audio_bitrate_kbps {
                    if codec != AudioCodec::Copy && codec != AudioCodec::Pcm {
                        args.push("-b:a".into());
                        args.push(format!("{}k", abr));
                    }
                }
            }
        }

        // ── MP4 快速启动（moov atom 前移）──
        if self.output.container == Container::Mp4 {
            args.push("-movflags".into());
            args.push("+faststart".into());
        }

        // ── 额外参数 ──
        for extra in &self.output.extra_args {
            args.push(extra.clone());
        }

        // ── 覆盖输出文件 + 输出路径 ──
        args.push("-y".into());
        args.push(self.output.file_name.clone());

        args
    }

    /// 序列化为 JSON（传递给 JS Worker）
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

// ─── WASM 暴露的命令构建器 ──────────────────────────────────────

/// 构建「单文件裁剪」命令
#[wasm_bindgen]
pub fn build_trim_command(
    input_name: &str,
    output_name: &str,
    start_sec: f64,
    duration_sec: f64,
    use_stream_copy: bool,
) -> Result<String, JsValue> {
    let (video_codec, audio_codec) = if use_stream_copy {
        (VideoCodec::Copy, AudioCodec::Copy)
    } else {
        (VideoCodec::H264, AudioCodec::Aac)
    };

    let cmd = FfmpegCommand {
        inputs: vec![FfmpegInput {
            file_name: input_name.to_string(),
            seek_to: Some(start_sec),
            duration: Some(duration_sec),
        }],
        output: FfmpegOutput {
            file_name: output_name.to_string(),
            container: Container::Mp4,
            video_codec,
            audio_codec,
            video_bitrate_kbps: None,
            audio_bitrate_kbps: None,
            fps: None,
            filters: vec![],
            extra_args: vec![
                "-avoid_negative_ts".into(),
                "make_zero".into(),
            ],
        },
    };

    cmd.to_json()
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// 构建「多片段合并」命令（concat demuxer 方式）
#[wasm_bindgen]
pub fn build_concat_command(
    concat_list_name: &str,
    output_name: &str,
    width: u32,
    height: u32,
    fps: f64,
    video_bitrate_kbps: u32,
    audio_bitrate_kbps: u32,
) -> Result<String, JsValue> {
    // concat demuxer 的 -f 和 -safe 需要在 -i 之前，特殊处理
    let args = vec![
        "-f".to_string(), "concat".to_string(),
        "-safe".to_string(), "0".to_string(),
        "-i".to_string(), concat_list_name.to_string(),
        "-c:v".to_string(), VideoCodec::H264.to_ffmpeg_str().to_string(),
        "-b:v".to_string(), format!("{}k", video_bitrate_kbps),
        "-vf".to_string(), format!("scale={}:{}", width, height),
        "-r".to_string(), fps.to_string(),
        "-c:a".to_string(), AudioCodec::Aac.to_ffmpeg_str().to_string(),
        "-b:a".to_string(), format!("{}k", audio_bitrate_kbps),
        "-movflags".to_string(), "+faststart".to_string(),
        "-y".to_string(), output_name.to_string(),
    ];

    // 包装为通用格式传给 JS
    let result = serde_json::json!({
        "args": args,
        "input_files": [concat_list_name],
        "output_file": output_name,
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// 构建「格式转换」命令
#[wasm_bindgen]
pub fn build_transcode_command(
    input_name: &str,
    output_name: &str,
    container_str: &str,
    video_bitrate_kbps: u32,
    audio_bitrate_kbps: u32,
    width: i32,
    height: i32,
    fps: f64,
) -> Result<String, JsValue> {
    let container = match container_str {
        "mp4"  => Container::Mp4,
        "webm" => Container::WebM,
        "mkv"  => Container::Mkv,
        "mp3"  => Container::Mp3,
        "wav"  => Container::Wav,
        "gif"  => Container::Gif,
        other  => return Err(JsValue::from_str(
            &format!("不支持的容器格式：{}", other)
        )),
    };

    let (video_codec, audio_codec) = container.default_codecs();

    let mut filters = Vec::new();
    if width > 0 && height > 0 {
        filters.push(VideoFilter::Scale { width, height });
    }

    let cmd = FfmpegCommand {
        inputs: vec![FfmpegInput {
            file_name: input_name.to_string(),
            seek_to: None,
            duration: None,
        }],
        output: FfmpegOutput {
            file_name: output_name.to_string(),
            container,
            video_codec,
            audio_codec,
            video_bitrate_kbps: Some(video_bitrate_kbps),
            audio_bitrate_kbps: Some(audio_bitrate_kbps),
            fps: if fps > 0.0 { Some(fps) } else { None },
            filters,
            extra_args: vec![],
        },
    };

    let args = cmd.build_args();
    let result = serde_json::json!({
        "args": args,
        "input_files": [input_name],
        "output_file": output_name,
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// 构建「提取音频」命令
#[wasm_bindgen]
pub fn build_extract_audio_command(
    input_name: &str,
    output_name: &str,
    format_str: &str,
    bitrate_kbps: u32,
) -> Result<String, JsValue> {
    let (container, audio_codec) = match format_str {
        "mp3" => (Container::Mp3, AudioCodec::Mp3),
        "wav" => (Container::Wav, AudioCodec::Pcm),
        other => return Err(JsValue::from_str(
            &format!("不支持的音频格式：{}", other)
        )),
    };

    let cmd = FfmpegCommand {
        inputs: vec![FfmpegInput {
            file_name: input_name.to_string(),
            seek_to: None,
            duration: None,
        }],
        output: FfmpegOutput {
            file_name: output_name.to_string(),
            container,
            video_codec: VideoCodec::Copy,
            audio_codec,
            video_bitrate_kbps: None,
            audio_bitrate_kbps: Some(bitrate_kbps),
            fps: None,
            filters: vec![],
            extra_args: vec!["-vn".into()],  // 不包含视频
        },
    };

    let args = cmd.build_args();
    let result = serde_json::json!({
        "args": args,
        "input_files": [input_name],
        "output_file": output_name,
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// 构建「生成缩略图」命令
#[wasm_bindgen]
pub fn build_thumbnail_command(
    input_name: &str,
    output_name: &str,
    time_sec: f64,
    width: u32,
    height: u32,
) -> Result<String, JsValue> {
    let args = vec![
        "-ss".to_string(), format!("{:.3}", time_sec),
        "-i".to_string(), input_name.to_string(),
        "-vframes".to_string(), "1".to_string(),
        "-vf".to_string(), format!("scale={}:{}", width, height),
        "-f".to_string(), "image2".to_string(),
        "-y".to_string(), output_name.to_string(),
    ];

    let result = serde_json::json!({
        "args": args,
        "input_files": [input_name],
        "output_file": output_name,
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

/// 构建「生成波形图数据」命令（提取 PCM 用于 JS 绘制）
#[wasm_bindgen]
pub fn build_waveform_command(
    input_name: &str,
    output_name: &str,
    sample_rate: u32,
) -> Result<String, JsValue> {
    let args = vec![
        "-i".to_string(), input_name.to_string(),
        "-vn".to_string(),
        "-ar".to_string(), sample_rate.to_string(),
        "-ac".to_string(), "1".to_string(),       // 单声道
        "-f".to_string(), "f32le".to_string(),    // 32 位浮点 PCM
        "-y".to_string(), output_name.to_string(),
    ];

    let result = serde_json::json!({
        "args": args,
        "input_files": [input_name],
        "output_file": output_name,
    });

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}