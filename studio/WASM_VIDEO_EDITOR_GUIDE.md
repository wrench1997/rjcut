# 数字人 Studio WASM 视频编辑集成指南

本文档介绍如何在数字人 Studio 中使用 **ffmpeg-bridge** 和 **video-engine** 两个自研 WASM 模块进行客户端视频编辑。

## 📦 架构概述

```
┌─────────────────────────────────────────────────────────┐
│                    DigitalHumanStudio                    │
│                         Component                        │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              videoEditorEngine (utils 模块)              │
├─────────────────────────────────────────────────────────┤
│  - 统一初始化 WASM 模块                                   │
│  - 提供高级视频编辑 API                                  │
│  - 进度回调管理                                          │
└─────────────────────────────────────────────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│    ffmpeg-bridge WASM   │   │    video-engine WASM    │
├─────────────────────────┤   ├─────────────────────────┤
│ FFmpeg 命令执行          │   │ 时间轴管理              │
│ - 裁剪/合并/转码        │   │ - Clip 管理              │
│ - 提取音频/缩略图       │   │ - 帧渲染                │
│ - 进度解析              │   │ - 音频混音              │
│ - 媒体信息解析          │   │ - 波形生成              │
└─────────────────────────┘   └─────────────────────────┘
```

## 🚀 快速开始

### 1. 导入视频编辑引擎

```javascript
// 从 utils 导入
import { videoEditorEngine, Ffmpeg, VideoEngine } from '../utils/videoEditorEngine'

// 或从组件直接导入
import { videoEditorEngine } from '../components/DigitalHumanStudio'
```

### 2. 初始化引擎

```javascript
import { useState, useEffect } from 'react'
import { videoEditorEngine } from '../utils/videoEditorEngine'

function MyComponent() {
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const init = async () => {
      try {
        // 初始化所有 WASM 模块
        await videoEditorEngine.initialize()
        
        // 设置进度回调
        videoEditorEngine.setProgressCallback((progress) => {
          setProgress(Math.round(progress.percent || 0))
        })
        
        setLoaded(true)
        console.log('✅ 视频编辑引擎已就绪')
      } catch (err) {
        console.error('❌ 初始化失败:', err)
      }
    }
    init()
    
    return () => videoEditorEngine.cleanup()
  }, [])

  if (!loaded) {
    return <div>加载视频编辑引擎... {progress}%</div>
  }

  return <div>引擎就绪！</div>
}
```

## 🎬 使用 ffmpeg-bridge 功能

### 裁剪视频

```javascript
const trimmedVideo = await videoEditorEngine.trimVideo(
  videoFile,      // File 或 Blob
  5.0,            // 开始时间（秒）
  10.0,           // 持续时间（秒）
  false           // 是否使用流复制（不重新编码）
)

// 下载结果
const url = URL.createObjectURL(trimmedVideo)
const a = document.createElement('a')
a.href = url
a.download = 'trimmed.mp4'
a.click()
```

### 合并视频

```javascript
const videoFiles = [file1, file2, file3]  // File/Blob 数组
const mergedVideo = await videoEditorEngine.mergeVideos(videoFiles)
```

### 转换视频格式

```javascript
const transcoded = await videoEditorEngine.transcodeVideo(
  videoFile,
  'webm',     // 目标格式
  1920,       // 宽度
  1080,       // 高度
  30,         // 帧率
  5000,       // 视频码率 (kbps)
  192         // 音频码率 (kbps)
)
```

### 提取音频

```javascript
const audioFile = await videoEditorEngine.extractAudio(
  videoFile,
  'mp3',      // 格式
  192         // 码率 (kbps)
)
```

### 生成缩略图

```javascript
const thumbnail = await videoEditorEngine.generateThumbnail(
  videoFile,
  3,          // 第 3 秒
  320,        // 宽度
  180         // 高度
)
```

## 🎬 使用 video-engine 功能

### 创建时间轴

```javascript
// 创建 30fps, 1920x1080 的时间轴
const timeline = videoEditorEngine.createTimeline(30, 1920, 1080)

// 添加轨道
timeline.add_track('video_1', '视频轨道 1', VideoEngine.TrackType.Video)
timeline.add_track('audio_1', '音频轨道 1', VideoEngine.TrackType.Audio)
```

### 创建和管理 Clip

```javascript
// 创建视频片段
const clip = videoEditorEngine.createClip(
  'clip_001',           // Clip ID
  0,                    // 时间轴开始时间 (ms)
  5000,                 // 持续时间 (ms)
  0,                    // 源文件开始时间 (ms)
  5000,                 // 源文件持续时间 (ms)
  'video',              // 类型：'video', 'audio', 'image', 'text'
  'video_1',            // 轨道 ID
  'my_video.mp4'        // 文件名
)

// 添加到时间轴
timeline.add_clip(clip)

// 移动 Clip
timeline.move_clip('clip_001', 1000, 'video_1')  // 移动到 1 秒位置

// 分割 Clip
const rightPartJson = timeline.split_clip('clip_001', 2500)  // 在 2.5 秒处分割

// 删除 Clip
timeline.remove_clip('clip_001')
```

### 获取时间点激活的 Clips

```javascript
// 获取 3 秒时所有激活的片段
const activeClipsJson = timeline.get_active_clips_at(3000)
const activeClips = JSON.parse(activeClipsJson)
```

### 帧渲染

```javascript
// 创建帧渲染器
const renderer = videoEditorEngine.createFrameRenderer(1920, 1080)

// 清空缓冲区
renderer.clear()

// 混合图层
const sourceData = new Uint8Array(width * height * 4)  // RGBA 数据
renderer.blend_layer(
  sourceData,
  1.0,              // 不透明度
  VideoEngine.BlendMode.Normal,
  0, 0,             // 源 x, y
  1920, 1080        // 源宽度，高度
)

// 应用到 Canvas
const canvas = document.getElementById('preview')
renderer.flush_to_canvas(canvas)
```

### 音频混音

```javascript
// 创建混音器
const mixer = videoEditorEngine.createAudioMixer(44100, 2, 4096)

// 准备 PCM 数据
const pcmData = new Float32Array(44100 * 2)  // 1 秒，立体声

// 混入音轨
mixer.mix_track(
  pcmData,
  0.8,    // 音量 (0-1)
  0.0,    // 声像 (-1 左，0 中，1 右)
  0       // 偏移帧数
)

// 获取混音结果
const mixedBuffer = mixer.get_mix_buffer()

// 应用限幅器防止削波
mixer.apply_limiter(0.95)

// 计算 RMS 音量
const rms = mixer.calculate_rms()
```

### 生成音频波形

```javascript
// 从 PCM 数据生成波形
const pcmData = new Float32Array(/* 音频采样数据 */)
const waveform = videoEditorEngine.generateWaveform(
  pcmData,
  100,    // 每像素采样数
  200     // 画布高度
)

// waveform 是 Float32Array，包含峰值数据，可用于绘制波形图
```

### 音频效果

```javascript
// 淡入
const pcmData = new Float32Array(/* ... */)
videoEditorEngine.applyAudioFadeIn(pcmData, 44100)  // 1 秒淡入

// 淡出
videoEditorEngine.applyAudioFadeOut(pcmData, 44100)  // 1 秒淡出

// 高通滤波（去除低频噪音）
VideoEngine.AudioEffects.high_pass_filter(pcmData, 0.05)  // 截止频率归一化
```

### 导出配置

```javascript
const exportConfig = videoEditorEngine.createExportConfig(
  'mp4',       // 格式
  'high',      // 质量：'low', 'medium', 'high', 'ultra'
  30,          // 帧率
  0,           // 开始时间 (ms)
  60000        // 结束时间 (ms)
)

// 生成 FFmpeg 命令
const ffmpegArgs = exportConfig.build_ffmpeg_args('input.mp4', 'output.mp4')
console.log(JSON.parse(ffmpegArgs))

// 估算文件大小
const estimatedSize = exportConfig.estimate_file_size_bytes()
console.log(`预计大小：${(estimatedSize / 1024 / 1024).toFixed(2)} MB`)
```

## 📝 在 DigitalHumanStudio 中使用

`DigitalHumanStudio` 组件已经集成了所有视频编辑功能：

```javascript
import DigitalHumanStudio, { 
  videoEditorEngine, 
  Ffmpeg, 
  VideoEngine 
} from './components/DigitalHumanStudio'

// 组件内部已自动初始化引擎
// 可通过 props 或 ref 访问编辑功能
```

### 可用方法

```javascript
// FFmpeg 功能
const trimmed = await trimVideo(file, 0, 10)
const merged = await mergeVideos([file1, file2])
const transcoded = await transcodeVideo(file, { format: 'webm' })
const audio = await extractAudio(file, 'mp3')
const thumb = await generateThumbnail(file, 3)

// Video Engine 功能
const timeline = createTimeline(30, 1920, 1080)
const clip = createClip(...)
const waveform = generateWaveform(pcmData, 100, 200)
```

## 🔄 进度监听

```javascript
videoEditorEngine.setProgressCallback((progress) => {
  const percent = Math.round(progress.percent || 0)
  const timeSec = progress.time_sec || 0
  const fps = progress.fps || 0
  const bitrate = progress.bitrate_kbps || 0
  
  console.log(`进度：${percent}%`)
  console.log(`时间：${timeSec.toFixed(2)}s`)
  console.log(`速度：${fps} fps`)
  console.log(`码率：${bitrate} kbps`)
  
  // 更新 UI
  setProgress(percent)
})
```

## ⚠️ 注意事项

### 1. WASM 加载时间

首次加载 WASM 模块需要几秒钟，请显示加载状态：

```javascript
if (!videoEditorLoaded) {
  return (
    <div className="loading-overlay">
      <div>🔄 正在加载视频编辑引擎...</div>
      <div>{videoEditorProgress}%</div>
    </div>
  )
}
```

### 2. 内存限制

浏览器环境有内存限制：

- 避免同时处理多个大文件
- 处理完成后及时清理
- 对于超大文件，考虑分片处理

### 3. 文件传输

使用 `transferable` 优化大文件传输：

```javascript
// 优化：使用 transferable 传输 ArrayBuffer
const arrayBuffer = await file.arrayBuffer()
const uint8Array = new Uint8Array(arrayBuffer)

// 传递给 Worker 时标记为 transferable
worker.postMessage(
  { type: 'file', data: uint8Array.buffer },
  [uint8Array.buffer]  // transfer list
)
```

### 4. 跨域隔离

某些高级功能需要 `SharedArrayBuffer`，需要设置 HTTP 头：

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 5. 错误处理

```javascript
try {
  const result = await videoEditorEngine.trimVideo(file, 0, 10)
} catch (err) {
  if (err.message.includes('timeout')) {
    alert('处理超时，请尝试更短的视频')
  } else if (err.message.includes('memory')) {
    alert('内存不足，请刷新页面后重试')
  } else {
    alert(`处理失败：${err.message}`)
  }
}
```

## 🛠️ 完整示例：视频编辑器

```javascript
import { useState, useEffect, useRef } from 'react'
import { videoEditorEngine, VideoEngine } from '../utils/videoEditorEngine'

function VideoEditor() {
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [timeline, setTimeline] = useState(null)
  const canvasRef = useRef(null)

  // 初始化
  useEffect(() => {
    const init = async () => {
      await videoEditorEngine.initialize()
      videoEditorEngine.setProgressCallback((p) => {
        setProgress(Math.round(p.percent || 0))
      })
      setLoaded(true)
      
      // 创建时间轴
      const tl = videoEditorEngine.createTimeline(30, 1920, 1080)
      tl.add_track('v1', '视频', VideoEngine.TrackType.Video)
      setTimeline(tl)
    }
    init()
    return () => videoEditorEngine.cleanup()
  }, [])

  // 处理视频文件
  const handleVideoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !loaded) return

    setIsProcessing(true)
    try {
      // 裁剪前 10 秒
      const trimmed = await videoEditorEngine.trimVideo(file, 0, 10)
      
      // 生成缩略图
      const thumb = await videoEditorEngine.generateThumbnail(file, 1, 320, 180)
      
      // 显示缩略图
      const thumbUrl = URL.createObjectURL(thumb)
      document.getElementById('thumbnail').src = thumbUrl
      
      // 创建 Clip
      const clip = videoEditorEngine.createClip(
        'clip_1', 0, 10000, 0, 10000,
        'video', 'v1', 'trimmed.mp4'
      )
      timeline.add_clip(clip)
      
      // 下载结果
      const url = URL.createObjectURL(trimmed)
      const a = document.createElement('a')
      a.href = url
      a.download = 'edited.mp4'
      a.click()
      
    } catch (err) {
      console.error(err)
      alert('处理失败')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!loaded) {
    return (
      <div className="editor-loading">
        <div>🔄 加载视频编辑引擎...</div>
        <div>{progress}%</div>
      </div>
    )
  }

  return (
    <div className="video-editor">
      <input
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        disabled={isProcessing}
      />
      
      {isProcessing && (
        <div className="progress">
          <div>处理中... {progress}%</div>
        </div>
      )}
      
      <img id="thumbnail" alt="预览" />
      
      <canvas
        ref={canvasRef}
        width={1920}
        height={1080}
        style={{ maxWidth: '100%' }}
      />
    </div>
  )
}
```

## 📚 API 参考

### videoEditorEngine

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `initialize()` | 无 | `Promise<boolean>` | 初始化所有 WASM 模块 |
| `setProgressCallback(cb)` | `cb: (progress) => void` | 无 | 设置进度回调 |
| `trimVideo(file, start, duration, streamCopy)` | File, number, number, boolean | `Promise<Blob>` | 裁剪视频 |
| `mergeVideos(files)` | File[] | `Promise<Blob>` | 合并视频 |
| `transcodeVideo(file, format, w, h, fps, vbr, abr)` | File, string, ... | `Promise<Blob>` | 转码视频 |
| `extractAudio(file, format, bitrate)` | File, string, number | `Promise<Blob>` | 提取音频 |
| `generateThumbnail(file, time, w, h)` | File, number, number, number | `Promise<Blob>` | 生成缩略图 |
| `createTimeline(fps, w, h)` | number, number, number | `Timeline` | 创建时间轴 |
| `createClip(...)` | 见上文 | `Clip` | 创建片段 |
| `createFrameRenderer(w, h)` | number, number | `FrameRenderer` | 创建渲染器 |
| `createAudioMixer(sr, ch, buf)` | number, number, number | `AudioMixer` | 创建混音器 |
| `generateWaveform(pcm, spp, h)` | Float32Array, number, number | Float32Array | 生成波形 |
| `cleanup()` | 无 | 无 | 清理资源 |

### Ffmpeg 命名空间

- `FfmpegTask` - FFmpeg 任务执行器
- `ProgressParser` - 进度解析器
- `MediaInfoParser` - 媒体信息解析器
- `ChunkTransfer` - 分片传输
- `SharedBuffer` - 共享内存缓冲区
- `build_*_command()` - 命令构建函数

### VideoEngine 命名空间

- `Timeline` - 时间轴
- `Clip` - 视频片段
- `FrameRenderer` - 帧渲染器
- `AudioMixer` - 音频混音器
- `AudioEffects` - 音频效果
- `WaveformGenerator` - 波形生成器
- `ExportConfig` - 导出配置

## 🔗 相关资源

- [ffmpeg-bridge README](./wasm/ffmpeg-bridge/README.md)
- [Rust + WASM 指南](https://rustwasm.github.io/docs/book/)
- [FFmpeg 文档](https://ffmpeg.org/ffmpeg.html)