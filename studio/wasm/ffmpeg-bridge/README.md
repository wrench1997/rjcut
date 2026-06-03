# 🔧 FFmpeg Bridge WASM 库

FFmpeg WASM 桥接库，用于在浏览器端通过 WebAssembly 调用 FFmpeg 功能。

## ✨ 特性

- **FFmpeg 任务管理** - 完整的 FFmpeg 命令执行生命周期管理
- **进度解析** - 实时解析 FFmpeg 输出日志，提取进度信息
- **媒体信息解析** - 从 FFmpeg 输出中提取视频元数据
- **文件传输优化** - 支持分片传输、共享内存零拷贝
- **命令构建器** - 内置常用 FFmpeg 命令模板（裁剪、合并、转码等）

## 📦 构建

### 前置要求

- Rust 工具链 (1.70+)
- `wasm-pack`

```bash
# 安装 wasm-pack
cargo install wasm-pack
```

### PowerShell 构建命令

```powershell
# 开发版本（带调试符号，构建快）
cd crates\ffmpeg-bridge
wasm-pack build --target web --dev

# 复制 pkg 绑定文件到 crates\ffmpeg-bridge\pkg\
Copy-Item "..\..\web\src\wasm\ffmpeg-bridge\ffmpeg_bridge.js" "pkg\" -Force
Copy-Item "..\..\web\src\wasm\ffmpeg-bridge\ffmpeg_bridge.d.ts" "pkg\" -Force
Copy-Item "..\..\web\src\wasm\ffmpeg-bridge\ffmpeg_bridge_bg.wasm" "pkg\" -Force
Copy-Item "..\..\web\src\wasm\ffmpeg-bridge\ffmpeg_bridge_bg.wasm.d.ts" "pkg\" -Force

# 发布版本（优化后，构建慢）
wasm-pack build --target web --release
# 同样需要复制 pkg 文件
```

### Makefile 构建命令 (Linux/macOS)

```bash
# 开发版本
cd crates/ffmpeg-bridge
wasm-pack build --target web --dev
cp ../../web/src/wasm/ffmpeg-bridge/*.js pkg/
cp ../../web/src/wasm/ffmpeg-bridge/*.d.ts pkg/
cp ../../web/src/wasm/ffmpeg-bridge/*.wasm pkg/

# 发布版本
wasm-pack build --target web --release
```

### 使用项目构建脚本

项目根目录提供了统一的构建脚本：

**PowerShell (Windows):**
```powershell
# 构建所有 WASM 模块（包括 ffmpeg-bridge）
.\build.ps1 build-wasm

# 开发模式构建
.\build.ps1 build-wasm-dev

# 全量构建
.\build.ps1 all
```

**Make (Linux/macOS):**
```bash
# 构建所有 WASM 模块
make build-wasm

# 开发模式构建
make build-wasm-dev

# 全量构建
make all
```

## 📁 pkg 目录结构

构建完成后，`pkg/` 目录包含：

```
pkg/
├── package.json              # npm 包配置
├── ffmpeg_bridge.js          # JS 绑定代码
├── ffmpeg_bridge.d.ts        # TypeScript 类型定义
├── ffmpeg_bridge_bg.wasm     # WebAssembly 二进制
└── ffmpeg_bridge_bg.wasm.d.ts # WASM 类型定义
```

## 🚀 快速开始

### 1. 初始化

```typescript
import initFfmpeg, * as Ffmpeg from './wasm/ffmpeg-bridge/ffmpeg_bridge.js';

async function setup() {
  await initFfmpeg();
  console.log('✅ FFmpeg Bridge 已加载');
}
```

### 2. 构建 FFmpeg 命令

```typescript
// 裁剪视频
const trimCmd = Ffmpeg.build_trim_command(
  'input.mp4',    // 输入文件
  'output.mp4',   // 输出文件
  5.0,            // 开始时间（秒）
  10.0,           // 时长（秒）
  true            // 使用流复制（不重新编码）
);
console.log('FFmpeg 命令:', JSON.parse(trimCmd));

// 格式转换
const transcodeCmd = Ffmpeg.build_transcode_command(
  'input.mov',
  'output.mp4',
  'mp4',          // 目标格式
  5000,           // 视频码率 (kbps)
  192,            // 音频码率 (kbps)
  1920,           // 宽度
  1080,           // 高度
  30.0            // 帧率
);

// 提取音频
const audioCmd = Ffmpeg.build_extract_audio_command(
  'video.mp4',
  'audio.mp3',
  'mp3',          // 音频格式
  192             // 码率
);

// 生成缩略图
const thumbCmd = Ffmpeg.build_thumbnail_command(
  'video.mp4',
  'thumb.jpg',
  5.0,            // 时间点（秒）
  320,            // 宽度
  180             // 高度
);
```

### 3. 使用 FfmpegTask 执行任务

```typescript
// 创建任务
const task = new Ffmpeg.FfmpegTask('task_001', 60.0); // 任务 ID, 总时长（秒）

// 添加输入文件
const inputData = await fetch('input.mp4').then(r => r.arrayBuffer());
task.add_input_file('input.mp4', new Uint8Array(inputData));

// 设置 FFmpeg 参数
const cmd = Ffmpeg.build_trim_command('input.mp4', 'output.mp4', 0, 10, true);
const parsed = JSON.parse(cmd);
task.set_args_json(JSON.stringify(parsed.args));
task.set_output_file('output.mp4');

// 状态机循环
while (task.state !== Ffmpeg.TaskState.Done) {
  const msg = task.next_message();
  if (msg) {
    // 发送消息给 JS Worker
    worker.postMessage(JSON.parse(msg));
  }
  
  // 等待 Worker 响应...
  const response = await waitForWorkerResponse();
  task.handle_message(JSON.stringify(response));
  
  // 获取进度
  const progress = JSON.parse(task.progress_json());
  console.log(`进度：${progress.percent?.toFixed(1)}%`);
}

// 获取输出
const outputData = task.get_input_file_data(0);
```

### 4. 进度解析

```typescript
const parser = new Ffmpeg.ProgressParser(60.0); // 总时长 60 秒

// 解析 FFmpeg 日志行
const logLine = 'frame=  120 fps= 60 q=28.0 size=  512kB time=00:00:04.00 bitrate=1048.6kbits/s';
const progress = parser.parse_line(logLine);
if (progress) {
  const info = JSON.parse(progress);
  console.log(`帧：${info.frame}, 时间：${info.time_sec}s, 进度：${info.percent}%`);
}
```

### 5. 媒体信息解析

```typescript
const parser = new Ffmpeg.MediaInfoParser();

// 输入 FFmpeg 探视器输出
parser.feed('  Duration: 00:01:30.00, start: 0.000000, bitrate: 2048 kb/s');
parser.feed('    Stream #0:0: Video: h264, yuv420p, 1920x1080, 29.97 fps');
parser.feed('    Stream #0:1: Audio: aac, 44100 Hz, stereo');

const info = parser.parse();
console.log('媒体信息:', JSON.parse(info.to_json()));
// { duration_sec: 90, width: 1920, height: 1080, fps: 29.97, ... }
```

### 6. 文件传输工具

```typescript
// 分片传输（大文件）
const data = new Uint8Array(largeFileSize);
const chunker = new Ffmpeg.ChunkTransfer(data, 1024 * 1024, 'large.mp4'); // 1MB 分片

while (chunker.has_next()) {
  const chunk = chunker.next_chunk();
  const meta = JSON.parse(chunker.current_chunk_info());
  // 发送 chunk 到 Worker...
}

// 共享内存（零拷贝）
const buffer = new Ffmpeg.SharedBuffer(1024 * 1024); // 1MB 缓冲区
const ptr = buffer.ptr();
// JS 可以直接通过 wasm.memory.buffer 访问 ptr 位置的内存

// 文件队列
const queue = new Ffmpeg.FileQueue();
queue.push('file1.mp4', data1, 'video/mp4');
queue.push('file2.mp4', data2, 'video/mp4');

while (!queue.is_empty()) {
  const info = JSON.parse(queue.peek_info());
  const data = queue.pop_data();
  // 处理文件...
}
```

## 📚 API 参考

### FfmpegTask

| 方法 | 描述 |
|------|------|
| `new(taskId, totalDurationSec)` | 创建任务 |
| `add_input_file(name, data)` | 添加输入文件 |
| `set_args_json(argsJson)` | 设置 FFmpeg 参数 |
| `set_output_file(name)` | 设置输出文件名 |
| `next_message()` | 获取下一条 Worker 消息 |
| `handle_message(msgJson)` | 处理 Worker 响应 |
| `progress_json()` | 获取进度 JSON |
| `state` | 当前任务状态 |

### 命令构建器

| 函数 | 描述 |
|------|------|
| `build_trim_command(...)` | 裁剪视频 |
| `build_concat_command(...)` | 合并多个片段 |
| `build_transcode_command(...)` | 格式转换 |
| `build_extract_audio_command(...)` | 提取音频 |
| `build_thumbnail_command(...)` | 生成缩略图 |
| `build_waveform_command(...)` | 生成波形数据 |

### 工具类

| 类 | 描述 |
|------|------|
| `ProgressParser` | FFmpeg 进度日志解析 |
| `MediaInfoParser` | 媒体元数据解析 |
| `ChunkTransfer` | 文件分片传输 |
| `SharedBuffer` | 共享内存缓冲区 |
| `FileQueue` | 文件队列管理 |

## 🔧 开发

```bash
# 开发模式构建
wasm-pack build --target web --dev

# 发布模式构建
wasm-pack build --target web --release

# 运行测试
cargo test

# 清理
cargo clean
rm -rf pkg/
```

## 📝 许可证

MIT License