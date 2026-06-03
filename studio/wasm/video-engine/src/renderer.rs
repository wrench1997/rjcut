use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{
    CanvasRenderingContext2d,
    HtmlCanvasElement,
    ImageData,
};

/// 渲染命令类型
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Add,
}

/// 单帧渲染上下文
#[wasm_bindgen]
pub struct FrameRenderer {
    width: u32,
    height: u32,
    /// 像素缓冲区（RGBA）
    pixel_buffer: Vec<u8>,
}

#[wasm_bindgen]
impl FrameRenderer {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32) -> Self {
        let size = (width * height * 4) as usize;
        Self {
            width,
            height,
            pixel_buffer: vec![0u8; size],
        }
    }

    #[wasm_bindgen(getter)]
    pub fn width(&self) -> u32 { self.width }

    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 { self.height }

    /// 清空缓冲区（黑色）
    #[wasm_bindgen]
    pub fn clear(&mut self) {
        self.pixel_buffer.fill(0);
        // Alpha 通道设为 255
        for i in (3..self.pixel_buffer.len()).step_by(4) {
            self.pixel_buffer[i] = 255;
        }
    }

    /// 将另一层像素数据混合到当前缓冲区
    #[wasm_bindgen]
    pub fn blend_layer(
        &mut self,
        source_data: &[u8],
        opacity: f64,
        blend_mode: BlendMode,
        src_x: i32,
        src_y: i32,
        src_width: u32,
        src_height: u32,
    ) -> Result<(), JsValue> {
        let opacity = opacity.clamp(0.0, 1.0) as f32;

        for row in 0..src_height as i32 {
            let dst_row = src_y + row;
            if dst_row < 0 || dst_row >= self.height as i32 { continue; }

            for col in 0..src_width as i32 {
                let dst_col = src_x + col;
                if dst_col < 0 || dst_col >= self.width as i32 { continue; }

                let src_idx = ((row * src_width as i32 + col) * 4) as usize;
                let dst_idx = ((dst_row * self.width as i32 + dst_col) * 4) as usize;

                if src_idx + 3 >= source_data.len()
                    || dst_idx + 3 >= self.pixel_buffer.len()
                {
                    continue;
                }

                let src_a = source_data[src_idx + 3] as f32 / 255.0 * opacity;
                let dst_a = self.pixel_buffer[dst_idx + 3] as f32 / 255.0;

                if src_a == 0.0 { continue; }

                for c in 0..3 {
                    let src_c = source_data[src_idx + c] as f32 / 255.0;
                    let dst_c = self.pixel_buffer[dst_idx + c] as f32 / 255.0;

                    let blended = match blend_mode {
                        BlendMode::Normal => src_c,
                        BlendMode::Multiply => src_c * dst_c,
                        BlendMode::Screen => 1.0 - (1.0 - src_c) * (1.0 - dst_c),
                        BlendMode::Overlay => {
                            if dst_c < 0.5 {
                                2.0 * src_c * dst_c
                            } else {
                                1.0 - 2.0 * (1.0 - src_c) * (1.0 - dst_c)
                            }
                        }
                        BlendMode::Add => (src_c + dst_c).min(1.0),
                    };

                    // Alpha 合成
                    let out_a = src_a + dst_a * (1.0 - src_a);
                    let out_c = if out_a > 0.0 {
                        (src_c * src_a + dst_c * dst_a * (1.0 - src_a)) / out_a
                    } else {
                        0.0
                    };

                    let final_c = blended * src_a + dst_c * (1.0 - src_a);
                    self.pixel_buffer[dst_idx + c] = (final_c * 255.0) as u8;
                }

                let out_a = src_a + dst_a * (1.0 - src_a);
                self.pixel_buffer[dst_idx + 3] = (out_a * 255.0) as u8;
            }
        }

        Ok(())
    }

    /// 应用亮度/对比度调整
    #[wasm_bindgen]
    pub fn apply_brightness_contrast(
        &mut self,
        brightness: f64, // -1.0 ~ 1.0
        contrast: f64,   // -1.0 ~ 1.0
    ) {
        let b = brightness as f32;
        let c = contrast as f32;
        let factor = (259.0 * (c * 255.0 + 255.0)) / (255.0 * (259.0 - c * 255.0));

        for i in (0..self.pixel_buffer.len()).step_by(4) {
            for j in 0..3 {
                let v = self.pixel_buffer[i + j] as f32 / 255.0;
                let v = v + b;                    // 亮度
                let v = factor * (v - 0.5) + 0.5; // 对比度
                self.pixel_buffer[i + j] = (v.clamp(0.0, 1.0) * 255.0) as u8;
            }
        }
    }

    /// 应用饱和度调整
    #[wasm_bindgen]
    pub fn apply_saturation(&mut self, saturation: f64) {
        let s = saturation as f32;
        for i in (0..self.pixel_buffer.len()).step_by(4) {
            let r = self.pixel_buffer[i] as f32 / 255.0;
            let g = self.pixel_buffer[i + 1] as f32 / 255.0;
            let b = self.pixel_buffer[i + 2] as f32 / 255.0;

            // 转换为灰度
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            self.pixel_buffer[i] = ((gray + s * (r - gray)).clamp(0.0, 1.0) * 255.0) as u8;
            self.pixel_buffer[i + 1] = ((gray + s * (g - gray)).clamp(0.0, 1.0) * 255.0) as u8;
            self.pixel_buffer[i + 2] = ((gray + s * (b - gray)).clamp(0.0, 1.0) * 255.0) as u8;
        }
    }

    /// 高斯模糊（近似实现）
    #[wasm_bindgen]
    pub fn apply_blur(&mut self, radius: u32) {
        if radius == 0 { return; }
        let r = radius as i32;
        let w = self.width as i32;
        let h = self.height as i32;
        let src = self.pixel_buffer.clone();

        for y in 0..h {
            for x in 0..w {
                let mut sum = [0f64; 4];
                let mut count = 0f64;

                for dy in -r..=r {
                    for dx in -r..=r {
                        let nx = x + dx;
                        let ny = y + dy;
                        if nx >= 0 && nx < w && ny >= 0 && ny < h {
                            let idx = ((ny * w + nx) * 4) as usize;
                            for c in 0..4 {
                                sum[c] += src[idx + c] as f64;
                            }
                            count += 1.0;
                        }
                    }
                }

                let dst_idx = ((y * w + x) * 4) as usize;
                for c in 0..4 {
                    self.pixel_buffer[dst_idx + c] = (sum[c] / count) as u8;
                }
            }
        }
    }

    /// 将像素缓冲区输出到 Canvas
    #[wasm_bindgen]
    pub fn flush_to_canvas(&self, canvas: &HtmlCanvasElement) -> Result<(), JsValue> {
        let ctx = canvas
            .get_context("2d")?
            .ok_or_else(|| JsValue::from_str("无法获取 2D Context"))?
            .dyn_into::<CanvasRenderingContext2d>()?;

        let clamped = wasm_bindgen::Clamped(self.pixel_buffer.as_slice());
        let image_data = ImageData::new_with_u8_clamped_array_and_sh(
            clamped,
            self.width,
            self.height,
        )?;

        ctx.put_image_data(&image_data, 0.0, 0.0)
    }

    /// 获取像素缓冲区的引用（供 JS 直接访问）
    #[wasm_bindgen]
    pub fn get_buffer(&self) -> Vec<u8> {
        self.pixel_buffer.clone()
    }

    /// 获取缓冲区指针（零拷贝访问）
    #[wasm_bindgen]
    pub fn buffer_ptr(&self) -> *const u8 {
        self.pixel_buffer.as_ptr()
    }

    #[wasm_bindgen]
    pub fn buffer_len(&self) -> usize {
        self.pixel_buffer.len()
    }
}

/// 时间轴波形数据生成器
#[wasm_bindgen]
pub struct WaveformGenerator;

#[wasm_bindgen]
impl WaveformGenerator {
    /// 从 PCM 音频数据生成波形峰值数组
    #[wasm_bindgen]
    pub fn generate_waveform(
        pcm_data: &[f32],
        samples_per_pixel: usize,
        canvas_height: u32,
    ) -> Vec<f32> {
        let num_pixels = pcm_data.len() / samples_per_pixel.max(1);
        let mut peaks = Vec::with_capacity(num_pixels);

        for i in 0..num_pixels {
            let start = i * samples_per_pixel;
            let end = (start + samples_per_pixel).min(pcm_data.len());

            let max = pcm_data[start..end]
                .iter()
                .map(|s| s.abs())
                .fold(0.0f32, f32::max);

            peaks.push(max * canvas_height as f32 / 2.0);
        }

        peaks
    }
}