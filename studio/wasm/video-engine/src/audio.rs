use wasm_bindgen::prelude::*;

/// 音频混音器（在 WASM 中处理 PCM 数据）
#[wasm_bindgen]
pub struct AudioMixer {
    sample_rate: u32,
    channels: u32,
    /// 混音缓冲区
    mix_buffer: Vec<f32>,
    buffer_frames: usize,
}

#[wasm_bindgen]
impl AudioMixer {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32, channels: u32, buffer_frames: usize) -> Self {
        Self {
            sample_rate,
            channels,
            mix_buffer: vec![0.0f32; buffer_frames * channels as usize],
            buffer_frames,
        }
    }

    /// 清空混音缓冲区
    #[wasm_bindgen]
    pub fn clear_buffer(&mut self) {
        self.mix_buffer.fill(0.0);
    }

    /// 将音轨数据混入缓冲区
    #[wasm_bindgen]
    pub fn mix_track(
        &mut self,
        pcm_data: &[f32],
        volume: f64,
        pan: f64,        // -1.0 (左) ~ 1.0 (右)
        offset_frames: usize,
    ) {
        let volume = volume as f32;
        let pan = pan as f32;

        // 计算左右声道增益
        let left_gain = (1.0 - pan).clamp(0.0, 1.0) * volume;
        let right_gain = (1.0 + pan).clamp(0.0, 1.0) * volume;

        let frames_to_mix = (pcm_data.len() / self.channels as usize)
            .min(self.buffer_frames - offset_frames.min(self.buffer_frames));

        for frame in 0..frames_to_mix {
            let src_frame = frame;
            let dst_frame = frame + offset_frames;

            if dst_frame >= self.buffer_frames { break; }

            for ch in 0..self.channels as usize {
                let src_idx = src_frame * self.channels as usize + ch;
                let dst_idx = dst_frame * self.channels as usize + ch;

                if src_idx >= pcm_data.len()
                    || dst_idx >= self.mix_buffer.len()
                {
                    break;
                }

                let gain = if self.channels == 2 {
                    if ch == 0 { left_gain } else { right_gain }
                } else {
                    volume
                };

                // 混合（累加）并限幅
                self.mix_buffer[dst_idx] += pcm_data[src_idx] * gain;
            }
        }
    }

    /// 对缓冲区应用限幅器（防止削波）
    #[wasm_bindgen]
    pub fn apply_limiter(&mut self, threshold: f64) {
        let threshold = threshold as f32;
        for sample in self.mix_buffer.iter_mut() {
            if *sample > threshold {
                *sample = threshold;
            } else if *sample < -threshold {
                *sample = -threshold;
            }
        }
    }

    /// 获取混音结果
    #[wasm_bindgen]
    pub fn get_mix_buffer(&self) -> Vec<f32> {
        self.mix_buffer.clone()
    }

    /// 计算 RMS 音量（用于音量可视化）
    #[wasm_bindgen]
    pub fn calculate_rms(&self) -> f64 {
        if self.mix_buffer.is_empty() { return 0.0; }

        let sum_sq: f32 = self.mix_buffer.iter()
            .map(|s| s * s)
            .sum();

        (sum_sq / self.mix_buffer.len() as f32).sqrt() as f64
    }

    #[wasm_bindgen(getter)]
    pub fn sample_rate(&self) -> u32 { self.sample_rate }

    #[wasm_bindgen(getter)]
    pub fn channels(&self) -> u32 { self.channels }
}

/// 音频效果处理器
#[wasm_bindgen]
pub struct AudioEffects;

#[wasm_bindgen]
impl AudioEffects {
    /// 淡入效果
    #[wasm_bindgen]
    pub fn fade_in(pcm_data: &mut [f32], fade_frames: usize) {
        for i in 0..fade_frames.min(pcm_data.len()) {
            let gain = i as f32 / fade_frames as f32;
            pcm_data[i] *= gain;
        }
    }

    /// 淡出效果
    #[wasm_bindgen]
    pub fn fade_out(pcm_data: &mut [f32], fade_frames: usize) {
        let len = pcm_data.len();
        let start = len.saturating_sub(fade_frames);
        for i in start..len {
            let gain = (len - i) as f32 / fade_frames as f32;
            pcm_data[i] *= gain;
        }
    }

    /// 简单的高通滤波器（去除低频噪音）
    #[wasm_bindgen]
    pub fn high_pass_filter(pcm_data: &mut [f32], cutoff_normalized: f64) {
        let alpha = 1.0 - cutoff_normalized as f32;
        let mut prev_out = 0.0f32;
        let mut prev_in = 0.0f32;

        for sample in pcm_data.iter_mut() {
            let out = alpha * (prev_out + *sample - prev_in);
            prev_in = *sample;
            prev_out = out;
            *sample = out;
        }
    }
}