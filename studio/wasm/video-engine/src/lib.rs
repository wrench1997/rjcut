use wasm_bindgen::prelude::*;

pub mod audio;
pub mod clip;
pub mod export;
pub mod renderer;
pub mod timeline;

// 全局内存分配器优化
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// 初始化引擎，设置 panic hook 和日志
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    console_log::init_with_level(log::Level::Debug)
        .expect("无法初始化日志系统");

    log::info!("🎬 VideoEngine WASM 引擎初始化完成");
}

/// 引擎版本信息
#[wasm_bindgen]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// JavaScript 可调用的工具函数：获取性能时间戳
#[wasm_bindgen]
pub fn get_performance_now() -> f64 {
    web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now())
        .unwrap_or(0.0)
}