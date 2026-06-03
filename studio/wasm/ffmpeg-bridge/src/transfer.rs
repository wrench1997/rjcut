//! 文件传输辅助模块
//! 负责在 Rust WASM 和 JS 之间高效传递二进制数据
//! 核心目标：零拷贝或最小拷贝

use wasm_bindgen::prelude::*;
use js_sys::Uint8Array;
use serde::{Serialize, Deserialize};

// ─── 分片传输（大文件分块处理）──────────────────────────────────

/// 文件分片信息
#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkInfo {
    /// 分片索引（从 0 开始）
    pub index: usize,
    /// 总分片数
    pub total: usize,
    /// 该分片的字节偏移
    pub offset: usize,
    /// 该分片的字节长度
    pub length: usize,
    /// 文件总大小
    pub file_size: usize,
    /// 文件名
    pub file_name: String,
}

/// 分片传输管理器
/// 将大文件切分成小块传递给 JS，避免一次性分配大量内存
#[wasm_bindgen]
pub struct ChunkTransfer {
    data: Vec<u8>,
    chunk_size: usize,
    file_name: String,
    current_chunk: usize,
}

#[wasm_bindgen]
impl ChunkTransfer {
    #[wasm_bindgen(constructor)]
    pub fn new(data: Vec<u8>, chunk_size: usize, file_name: String) -> Self {
        Self {
            data,
            chunk_size: chunk_size.max(4096),  // 最小 4KB
            file_name,
            current_chunk: 0,
        }
    }

    /// 总分片数
    #[wasm_bindgen]
    pub fn total_chunks(&self) -> usize {
        (self.data.len() + self.chunk_size - 1) / self.chunk_size
    }

    /// 文件总大小
    #[wasm_bindgen]
    pub fn file_size(&self) -> usize {
        self.data.len()
    }

    /// 是否还有下一块
    #[wasm_bindgen]
    pub fn has_next(&self) -> bool {
        self.current_chunk < self.total_chunks()
    }

    /// 获取下一块数据（Uint8Array，零拷贝视图）
    #[wasm_bindgen]
    pub fn next_chunk(&mut self) -> Result<Uint8Array, JsValue> {
        if !self.has_next() {
            return Err(JsValue::from_str("没有更多分片"));
        }

        let start = self.current_chunk * self.chunk_size;
        let end = (start + self.chunk_size).min(self.data.len());
        let chunk = &self.data[start..end];

        self.current_chunk += 1;

        // 创建 Uint8Array 视图（这里会复制数据到 JS heap）
        Ok(Uint8Array::from(chunk))
    }

    /// 获取当前分片的元信息 JSON
    #[wasm_bindgen]
    pub fn current_chunk_info(&self) -> String {
        let idx = self.current_chunk.saturating_sub(1);
        let start = idx * self.chunk_size;
        let end = (start + self.chunk_size).min(self.data.len());

        let info = ChunkInfo {
            index: idx,
            total: self.total_chunks(),
            offset: start,
            length: end - start,
            file_size: self.data.len(),
            file_name: self.file_name.clone(),
        };

        serde_json::to_string(&info).unwrap_or_default()
    }

    /// 重置到第一块
    #[wasm_bindgen]
    pub fn reset(&mut self) {
        self.current_chunk = 0;
    }
}

// ─── 共享内存缓冲区（零拷贝核心）───────────────────────────────
/// 在 WASM 线性内存中分配缓冲区，暴露指针给 JS 直接写入
/// 避免 JS→WASM 的数据拷贝
#[wasm_bindgen]
pub struct SharedBuffer {
    data: Vec<u8>,
}

#[wasm_bindgen]
impl SharedBuffer {
    /// 分配指定大小的缓冲区
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize) -> Self {
        Self { data: vec![0u8; size] }
    }

    /// 返回缓冲区在 WASM 线性内存中的指针
    /// JS 可通过 `new Uint8Array(wasm.memory.buffer, ptr, len)` 直接访问
    #[wasm_bindgen]
    pub fn ptr(&self) -> *const u8 {
        self.data.as_ptr()
    }

    /// 缓冲区长度
    #[wasm_bindgen]
    pub fn len(&self) -> usize {
        self.data.len()
    }

    /// 是否为空
    #[wasm_bindgen]
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    /// 从 JS 写入数据后，取出内部 Vec（消耗 self）
    /// 使用场景：JS 通过指针填充数据后，Rust 取出处理
    #[wasm_bindgen]
    pub fn take_data(self) -> Vec<u8> {
        self.data
    }

    /// 获取数据副本（不消耗 self）
    #[wasm_bindgen]
    pub fn get_data(&self) -> Vec<u8> {
        self.data.clone()
    }

    /// 从指定偏移读取数据
    #[wasm_bindgen]
    pub fn read_at(&self, offset: usize, length: usize) -> Result<Vec<u8>, JsValue> {
        let end = offset.checked_add(length)
            .ok_or_else(|| JsValue::from_str("整数溢出"))?;

        if end > self.data.len() {
            return Err(JsValue::from_str("读取越界"));
        }

        Ok(self.data[offset..end].to_vec())
    }

    /// 调整缓冲区大小（保留已有数据）
    #[wasm_bindgen]
    pub fn resize(&mut self, new_size: usize) {
        self.data.resize(new_size, 0);
    }

    /// 填充为 0
    #[wasm_bindgen]
    pub fn clear(&mut self) {
        self.data.fill(0);
    }
}

// ─── 文件队列（批量处理多个文件）───────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub size: usize,
    pub mime_type: String,
}

/// 待处理文件队列
#[wasm_bindgen]
pub struct FileQueue {
    entries: Vec<(FileEntry, Vec<u8>)>,
    cursor: usize,
}

#[wasm_bindgen]
impl FileQueue {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self { entries: Vec::new(), cursor: 0 }
    }

    /// 添加文件到队列
    #[wasm_bindgen]
    pub fn push(&mut self, name: String, data: Vec<u8>, mime_type: String) {
        let entry = FileEntry {
            name,
            size: data.len(),
            mime_type,
        };
        self.entries.push((entry, data));
    }

    /// 队列长度
    #[wasm_bindgen]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// 是否为空
    #[wasm_bindgen]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// 剩余未处理数量
    #[wasm_bindgen]
    pub fn remaining(&self) -> usize {
        self.entries.len().saturating_sub(self.cursor)
    }

    /// 查看当前文件元信息（不弹出）
    #[wasm_bindgen]
    pub fn peek_info(&self) -> Option<String> {
        self.entries.get(self.cursor)
            .map(|(e, _)| serde_json::to_string(e).unwrap_or_default())
    }

    /// 弹出当前文件的数据
    #[wasm_bindgen]
    pub fn pop_data(&mut self) -> Option<Vec<u8>> {
        if self.cursor >= self.entries.len() {
            return None;
        }
        // 用空 Vec 替换，避免克隆大数据
        let data = std::mem::replace(&mut self.entries[self.cursor].1, Vec::new());
        self.cursor += 1;
        Some(data)
    }

    /// 重置游标
    #[wasm_bindgen]
    pub fn reset_cursor(&mut self) {
        self.cursor = 0;
    }

    /// 清空队列
    #[wasm_bindgen]
    pub fn clear(&mut self) {
        self.entries.clear();
        self.cursor = 0;
    }
}

// ─── 数据校验工具 ────────────────────────────────────────────────

/// 计算数据的 Adler-32 校验和（轻量，适合 WASM）
#[wasm_bindgen]
pub fn adler32(data: &[u8]) -> u32 {
    const MOD: u32 = 65521;
    let mut a: u32 = 1;
    let mut b: u32 = 0;

    for &byte in data {
        a = (a + byte as u32) % MOD;
        b = (b + a) % MOD;
    }

    (b << 16) | a
}

/// 简单的文件魔数检测，判断文件类型
#[wasm_bindgen]
pub fn detect_mime_type(data: &[u8]) -> String {
    if data.len() < 12 {
        return "application/octet-stream".to_string();
    }

    // MP4 / MOV: ftyp box
    if data.len() >= 8 && &data[4..8] == b"ftyp" {
        return "video/mp4".to_string();
    }

    // WebM / MKV: EBML header
    if data.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        return "video/webm".to_string();
    }

    // AVI: RIFF....AVI
    if data.starts_with(b"RIFF") && data.len() >= 12 && &data[8..12] == b"AVI " {
        return "video/avi".to_string();
    }

    // MP3: ID3 tag 或 sync word
    if data.starts_with(b"ID3") ||
       (data[0] == 0xFF && (data[1] & 0xE0) == 0xE0)
    {
        return "audio/mpeg".to_string();
    }

    // WAV: RIFF....WAVE
    if data.starts_with(b"RIFF") && data.len() >= 12 && &data[8..12] == b"WAVE" {
        return "audio/wav".to_string();
    }

    // FLAC
    if data.starts_with(b"fLaC") {
        return "audio/flac".to_string();
    }

    // JPEG
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "image/jpeg".to_string();
    }

    // PNG
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return "image/png".to_string();
    }

    // GIF
    if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        return "image/gif".to_string();
    }

    "application/octet-stream".to_string()
}