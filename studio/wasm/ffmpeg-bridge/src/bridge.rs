//! JS ↔ Rust 桥接层
//! 封装与 JS FFmpeg Worker 的完整通信协议

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use crate::progress::ProgressParser;

// ─── 消息协议 ────────────────────────────────────────────────────

/// Rust → JS Worker 发送的消息类型
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum OutboundMessage {
    /// 初始化 FFmpeg
    Init,
    /// 写入文件到 WASM 虚拟文件系统
    WriteFile {
        name: String,
        #[serde(skip)]
        data: Vec<u8>,
    },
    /// 执行 FFmpeg 命令
    Exec {
        args: Vec<String>,
    },
    /// 读取输出文件
    ReadFile {
        name: String,
    },
    /// 删除虚拟文件系统中的文件
    DeleteFile {
        name: String,
    },
    /// 取消当前任务
    Cancel,
}

/// JS Worker → Rust 接收的消息类型
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum InboundMessage {
    /// FFmpeg 初始化完成
    Ready,
    /// 文件写入完成
    FileWritten { name: String },
    /// 命令执行完成（exit code）
    ExecDone { exit_code: i32 },
    /// 文件读取完成
    FileData { name: String, size: usize },
    /// 文件删除完成
    FileDeleted { name: String },
    /// 进度信息（来自 stderr）
    Log { message: String },
    /// 进度百分比
    Progress { progress: f64, time: f64 },
    /// 错误
    Error { message: String },
}

// ─── 任务状态机 ──────────────────────────────────────────────────

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TaskState {
    Idle,
    Initializing,
    WritingFiles,
    Executing,
    ReadingOutput,
    Cleanup,
    Done,
    Failed,
    Cancelled,
}

/// FFmpeg 任务执行器
/// 管理一次完整的 FFmpeg 操作的生命周期
#[wasm_bindgen]
pub struct FfmpegTask {
    state: TaskState,
    /// 任务唯一 ID
    task_id: String,
    /// 需要写入的输入文件列表
    input_files: Vec<(String, Vec<u8>)>,
    /// FFmpeg 参数
    args: Vec<String>,
    /// 输出文件名
    output_file_name: String,
    /// 进度解析器
    progress_parser: ProgressParser,
    /// 错误信息
    error: Option<String>,
    /// 已写入文件计数
    files_written: usize,
}

#[wasm_bindgen]
impl FfmpegTask {
    #[wasm_bindgen(constructor)]
    pub fn new(task_id: String, total_duration_sec: f64) -> Self {
        Self {
            state: TaskState::Idle,
            task_id,
            input_files: Vec::new(),
            args: Vec::new(),
            output_file_name: String::new(),
            progress_parser: ProgressParser::new(total_duration_sec),
            error: None,
            files_written: 0,
        }
    }

    // ── 构建阶段 ──

    /// 添加需要写入虚拟文件系统的输入文件
    #[wasm_bindgen]
    pub fn add_input_file(&mut self, name: String, data: Vec<u8>) {
        self.input_files.push((name, data));
    }

    /// 设置 FFmpeg 参数（JSON 数组字符串）
    #[wasm_bindgen]
    pub fn set_args_json(&mut self, args_json: &str) -> Result<(), JsValue> {
        self.args = serde_json::from_str(args_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(())
    }

    /// 设置输出文件名
    #[wasm_bindgen]
    pub fn set_output_file(&mut self, name: String) {
        self.output_file_name = name;
    }

    // ── 状态查询 ──

    #[wasm_bindgen(getter)]
    pub fn state(&self) -> TaskState { self.state }

    #[wasm_bindgen(getter)]
    pub fn task_id(&self) -> String { self.task_id.clone() }

    #[wasm_bindgen(getter)]
    pub fn output_file_name(&self) -> String { self.output_file_name.clone() }

    #[wasm_bindgen]
    pub fn total_input_files(&self) -> usize { self.input_files.len() }

    #[wasm_bindgen]
    pub fn files_written(&self) -> usize { self.files_written }

    #[wasm_bindgen]
    pub fn has_error(&self) -> bool { self.error.is_some() }

    #[wasm_bindgen]
    pub fn get_error(&self) -> Option<String> { self.error.clone() }

    // ── 状态驱动：生成下一条发送给 Worker 的消息 ──

    /// 获取下一步要发给 JS Worker 的消息（JSON）
    /// 返回 None 表示等待 Worker 回包
    #[wasm_bindgen]
    pub fn next_message(&mut self) -> Option<String> {
        match self.state {
            TaskState::Idle => {
                self.state = TaskState::Initializing;
                let msg = serde_json::json!({ "type": "init" });
                Some(msg.to_string())
            }

            TaskState::WritingFiles => {
                if self.files_written < self.input_files.len() {
                    let (name, _data) = &self.input_files[self.files_written];
                    // 注意：实际数据通过 Transferable 传递，这里只发元信息
                    let msg = serde_json::json!({
                        "type": "write_file",
                        "payload": {
                            "name": name,
                            "file_index": self.files_written,
                        }
                    });
                    Some(msg.to_string())
                } else {
                    // 所有文件写完，开始执行
                    self.state = TaskState::Executing;
                    self.next_message()
                }
            }

            TaskState::Executing => {
                let msg = serde_json::json!({
                    "type": "exec",
                    "payload": { "args": self.args }
                });
                Some(msg.to_string())
            }

            TaskState::ReadingOutput => {
                let msg = serde_json::json!({
                    "type": "read_file",
                    "payload": { "name": self.output_file_name }
                });
                Some(msg.to_string())
            }

            TaskState::Cleanup => {
                // 生成清理命令（删除所有临时文件）
                let files: Vec<&str> = self.input_files
                    .iter()
                    .map(|(n, _)| n.as_str())
                    .chain(std::iter::once(self.output_file_name.as_str()))
                    .collect();

                self.state = TaskState::Done;
                let msg = serde_json::json!({
                    "type": "delete_files",
                    "payload": { "names": files }
                });
                Some(msg.to_string())
            }

            _ => None,
        }
    }

    /// 处理从 Worker 收到的消息，推进状态机
    #[wasm_bindgen]
    pub fn handle_message(&mut self, message_json: &str) -> Result<(), JsValue> {
        let msg: serde_json::Value = serde_json::from_str(message_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let msg_type = msg["type"].as_str().unwrap_or("");

        match (self.state, msg_type) {
            (TaskState::Initializing, "ready") => {
                log::debug!("FFmpeg 初始化完成，开始写文件");
                self.state = TaskState::WritingFiles;
            }

            (TaskState::WritingFiles, "file_written") => {
                self.files_written += 1;
                log::debug!("文件已写入 {}/{}", self.files_written, self.input_files.len());
                // next_message() 会自动推进
            }

            (TaskState::Executing, "exec_done") => {
                let exit_code = msg["payload"]["exit_code"].as_i64().unwrap_or(-1);
                if exit_code != 0 {
                    self.state = TaskState::Failed;
                    self.error = Some(format!("FFmpeg 退出码：{}", exit_code));
                } else {
                    log::debug!("FFmpeg 执行成功");
                    self.state = TaskState::ReadingOutput;
                }
            }

            (TaskState::ReadingOutput, "file_data") => {
                log::debug!("输出文件读取完成");
                self.state = TaskState::Cleanup;
            }

            (_, "log") => {
                if let Some(msg_str) = msg["payload"]["message"].as_str() {
                    // 尝试解析进度信息
                    let _ = self.progress_parser.parse_line(msg_str);
                }
            }

            (_, "progress") => {
                // Worker 直接发来进度百分比
                let progress = msg["payload"]["progress"].as_f64().unwrap_or(0.0);
                let time = msg["payload"]["time"].as_f64().unwrap_or(0.0);
                self.progress_parser.set_total_duration(
                    if time > 0.0 { time / progress * 100.0 } else { 0.0 }
                );
            }

            (_, "error") => {
                self.state = TaskState::Failed;
                self.error = msg["payload"]["message"]
                    .as_str()
                    .map(String::from);
            }

            _ => {
                log::warn!("未处理的消息：type={}, state={:?}", msg_type, self.state);
            }
        }

        Ok(())
    }

    /// 获取当前进度 JSON
    #[wasm_bindgen]
    pub fn progress_json(&self) -> String {
        self.progress_parser.last_progress_json()
    }

    /// 获取指定索引的输入文件数据（用于 Transferable 传输）
    #[wasm_bindgen]
    pub fn get_input_file_data(&self, index: usize) -> Option<Vec<u8>> {
        self.input_files.get(index).map(|(_, data)| data.clone())
    }

    /// 取消任务
    #[wasm_bindgen]
    pub fn cancel(&mut self) {
        self.state = TaskState::Cancelled;
    }
}

// ─── concat 列表生成器 ────────────────────────────────────────────

/// 生成 FFmpeg concat demuxer 所需的文件列表内容
/// 格式：
/// ```
/// file 'segment_0.mp4'
/// file 'segment_1.mp4'
/// ```
#[wasm_bindgen]
pub fn generate_concat_list(file_names_json: &str) -> Result<String, JsValue> {
    let names: Vec<String> = serde_json::from_str(file_names_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let content = names
        .iter()
        .map(|name| format!("file '{}'", name))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(content)
}

/// 生成带时间偏移的 concat 列表（用于精确拼接）
#[wasm_bindgen]
pub fn generate_concat_list_with_offsets(
    segments_json: &str,
) -> Result<String, JsValue> {
    #[derive(Deserialize)]
    struct Segment {
        file: String,
        start_sec: f64,
        duration_sec: f64,
    }

    let segments: Vec<Segment> = serde_json::from_str(segments_json)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    let mut lines = Vec::new();
    for seg in &segments {
        lines.push(format!("file '{}'", seg.file));
        if seg.start_sec > 0.0 {
            lines.push(format!("inpoint {:.6}", seg.start_sec));
        }
        if seg.duration_sec > 0.0 {
            lines.push(format!("outpoint {:.6}", seg.start_sec + seg.duration_sec));
        }
    }

    Ok(lines.join("\n"))
}

// ─── 单元测试 ────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_state_machine() {
        let mut task = FfmpegTask::new("test_task".to_string(), 60.0);
        task.add_input_file("input.mp4".to_string(), vec![1, 2, 3]);
        task.set_output_file("output.mp4".to_string());
        task.args = vec!["-i".to_string(), "input.mp4".to_string(),
                        "-c".to_string(), "copy".to_string(),
                        "-y".to_string(), "output.mp4".to_string()];

        // Idle → Initializing
        let msg = task.next_message().unwrap();
        assert!(msg.contains("init"));
        assert_eq!(task.state, TaskState::Initializing);

        // 处理 ready
        task.handle_message(r#"{"type":"ready"}"#).unwrap();
        assert_eq!(task.state, TaskState::WritingFiles);

        // WritingFiles → 发送写文件消息
        let msg = task.next_message().unwrap();
        assert!(msg.contains("write_file"));

        // 处理 file_written
        task.handle_message(r#"{"type":"file_written","payload":{"name":"input.mp4"}}"#).unwrap();
        assert_eq!(task.files_written, 1);

        // 所有文件写完 → Executing
        let msg = task.next_message().unwrap();
        assert!(msg.contains("exec"));
        assert_eq!(task.state, TaskState::Executing);
    }

    #[test]
    fn test_concat_list_generation() {
        let names = r#"["seg_0.mp4","seg_1.mp4","seg_2.mp4"]"#;
        let list = generate_concat_list(names).unwrap();
        assert_eq!(list, "file 'seg_0.mp4'\nfile 'seg_1.mp4'\nfile 'seg_2.mp4'");
    }
}