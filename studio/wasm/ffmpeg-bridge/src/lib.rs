use wasm_bindgen::prelude::*;

pub mod bridge;
pub mod command;
pub mod progress;
pub mod transfer;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Debug)
        .expect("日志初始化失败");
    log::info!("🔧 ffmpeg-bridge WASM 模块初始化完成");
}