# 高级视频剪辑台集成文档

## 概述

本文档描述如何将基于 Rust + WebAssembly 的 `video-editor` 核心组件无缝融入 `rjcut` 的 React 架构中。

## 架构融合思路

### 1. UI 布局融合

- 保留 `rjcut` 顶部的导航栏
- 将 `video-editor` 作为独立 Tab（"高级剪辑台"）嵌入
- `video-editor` 内部保持经典剪辑软件的暗色工业风（Dark Mode 局部作用域）
- 不污染 `rjcut` 其他页面的亮色主题

### 2. 数据流打通 (VFS Bridge)

#### 导入流程
```
VFS 文件 → vfs.readFileAsBlob() → Blob → new File() → mediaFileRegistry → WebAssembly 引擎
```

#### 导出流程
```
WebAssembly 引擎 → Blob → vfs.writeFile('/output/export.mp4') → VFS 文件系统
```

## 文件结构

```
studio/src/
├── App.jsx                          # 主应用入口，添加"高级剪辑"Tab
├── components/
│   ├── AdvancedVideoEditor.jsx      # 剪辑台主容器
│   └── VideoEditor/
│       ├── MediaLibraryVFS.jsx      # 媒体库（支持 VFS 导入）
│       ├── ExportPanelVFS.jsx       # 导出面板（写入 VFS）
│       ├── VideoPreview.jsx         # 视频预览组件
│       ├── Timeline.jsx             # 时间轴组件
│       └── editor-globals.css       # 局部暗色主题样式
├── stores/
│   └── timelineStore.js             # 时间轴状态管理
└── workers/
    └── exportWorker.js              # 导出后台 Worker
```

## 核心组件说明

### 1. timelineStore.js

**功能**: 统一管理视频编辑器的所有状态

**核心 API**:
```javascript
// 状态
isWasmReady          // WASM 引擎是否就绪
mediaFiles           // 媒体文件元数据 { id, name, duration_ms, type, thumbnail }
clips                // 时间轴片段 [{ id, mediaId, start_ms, duration_ms, track, type }]
totalDuration_ms     // 总时长
fps, width, height   // 时间轴配置

// 方法
initWasm()           // 初始化 WASM 引擎
addMediaFile(info, file)  // 添加媒体文件（同时存入 registry）
addClip(clip)        // 添加片段到时间轴
removeClip(id)       // 移除片段
selectClip(id)       // 选中片段
play()/pause()/seek() // 播放控制
```

**媒体文件注册表**:
```javascript
export const mediaFileRegistry = new Map()
// key: mediaId, value: File/Blob 对象
```

### 2. MediaLibraryVFS.jsx

**功能**: 媒体素材管理，支持从 VFS 导入和本地上传

**核心特性**:
- 从 VFS 读取文件：`vfs.readFileAsBlob(path)`
- 将 Blob 封装为 File 对象，满足 WebCodecs 要求
- 自动提取媒体信息（时长、缩略图、分辨率）
- 网格化展示素材卡片
- 一键添加到时间轴

**支持格式**:
- 视频：mp4, mov, avi, mkv, webm
- 音频：mp3, wav, aac, m4a
- 图片：png, jpg, jpeg, gif, webp

### 3. ExportPanelVFS.jsx

**功能**: 视频导出设置与执行

**导出流程**:
1. 从 `timelineStore` 获取所有 clips 和 mediaFiles
2. 从 `mediaFileRegistry` 获取原始 Blob 数据
3. 创建 `VideoEngine.Timeline` 并添加所有 clips
4. 创建 `ExportConfig` 配置导出参数
5. 通过 Web Worker 执行 FFmpeg 导出
6. 导出完成后调用 `vfs.writeFile()` 写入 `/output/` 目录

**导出设置**:
- 格式：MP4 (H.264), WebM (VP9), GIF
- 质量：低 (2Mbps), 中 (5Mbps), 高 (8Mbps), 超高 (15Mbps)
- 帧率：24/30/60 FPS

### 4. VideoPreview.jsx

**功能**: 实时预览时间轴合成画面

**实现原理**:
- 根据 `currentTime_ms` 找到当前激活的视频片段
- 从 `mediaFileRegistry` 获取 Blob 并创建 ObjectURL
- 使用隐藏的 `<video>` 元素 seek 到对应时间点
- 将视频帧绘制到 `<canvas>` 上显示
- 支持图片类型的静态预览

**播放控制**:
- 播放/暂停
- 跳到开头/结尾
- 时间显示（当前时间 / 总时长）

### 5. Timeline.jsx

**功能**: 可视化时间轴，支持拖拽编辑

**特性**:
- 多轨道显示（视频轨、音频轨自动分离）
- 拖拽移动片段位置
- 选中/删除片段
- 播放头指示当前位置
- 时间刻度标尺
- 片段颜色编码（视频=蓝，音频=绿，图片=紫）

## 样式隔离

通过 `.video-editor-theme` 作用域实现暗色主题隔离：

```css
.video-editor-theme {
  --ve-bg-primary: #0a0a0f;
  --ve-text-primary: #f1f5f9;
  /* ... 暗色主题变量 */
}
```

所有视频编辑器组件都包裹在 `<div className="video-editor-theme">` 内，确保样式不影响 rjcut 其他部分。

## 使用流程

### 1. 进入高级剪辑台

点击顶部导航栏的 **"高级剪辑"** 按钮（剪刀图标）。

### 2. 导入素材

**方式 A - 从 VFS 导入**:
1. 点击媒体库右上角 "VFS 导入" 按钮
2. 在弹出的文件浏览器中浏览项目目录
3. 选择视频/音频/图片文件
4. 自动提取信息并添加到素材库

**方式 B - 本地上传**:
1. 点击媒体库右上角 "上传" 按钮
2. 选择本地文件
3. 自动提取信息并添加到素材库

### 3. 编辑时间轴

1. 点击素材卡片上的 **"+"** 按钮添加到时间轴
2. 在时间轴上拖拽片段调整位置
3. 点击片段选中，按删除键或点击垃圾桶图标删除
4. 点击时间轴空白处定位播放头

### 4. 预览播放

1. 点击播放按钮预览合成效果
2. 使用进度条跳转时间点
3. 时间轴播放头同步移动

### 5. 导出视频

1. 在右侧面板设置导出参数（格式、质量、帧率）
2. 点击 "开始导出到项目" 按钮
3. 等待处理完成（显示进度条）
4. 导出文件自动保存到 `/output/export_时间戳.mp4`
5. 前往 "文件浏览" 查看或使用导出的视频

## 技术细节

### WASM 引擎初始化

```javascript
// 在 AdvancedVideoEditor.jsx 中
useEffect(() => {
  const init = async () => {
    await initWasm()  // 加载 ffmpeg-bridge 和 video-engine
    setIsBooting(false)
  }
  init()
}, [])
```

### VFS 文件读取

```javascript
// MediaLibraryVFS.jsx
const blob = await vfs.readFileAsBlob(vfsPath)
const file = new File([blob], filename, { type: 'video/mp4' })
addMediaFile(mediaInfo, file)  // file 存入 mediaFileRegistry
```

### 导出到 VFS

```javascript
// ExportPanelVFS.jsx
const blob = new Blob([payload.data], { type: 'video/mp4' })
const savePath = `/output/export_${Date.now()}.mp4`
await vfs.writeFile(savePath, blob)
```

## 扩展建议

### 短期优化
1. 实现真实的 FFmpeg WASM 导出（当前为占位符）
2. 添加片段裁剪功能（调整入点/出点）
3. 添加转场效果支持
4. 添加字幕轨道

### 长期规划
1. 多轨道音频混音
2. 关键帧动画
3. 滤镜效果（调色、模糊等）
4. 画中画功能
5. 导出预设管理

## 注意事项

1. **内存限制**: 浏览器环境有内存限制，避免同时处理超大文件
2. **WASM 加载**: 首次加载需要几秒钟，显示加载状态
3. **跨域隔离**: 某些高级功能需要 `SharedArrayBuffer`，需设置 COOP/COEP 响应头
4. **文件清理**: 使用 `URL.revokeObjectURL()` 及时清理 ObjectURL 避免内存泄漏

## 相关文档

- [WASM_VIDEO_EDITOR_GUIDE.md](./WASM_VIDEO_EDITOR_GUIDE.md) - WASM 视频编辑详细 API
- [ffmpeg-bridge README](./wasm/ffmpeg-bridge/README.md) - FFmpeg WASM 模块
- [video-engine README](./wasm/video-engine/README.md) - 时间轴引擎模块