# FFmpeg.wasm 视频编辑集成指南

本文档介绍如何在数字人 Studio 中使用 FFmpeg.wasm 进行客户端视频编辑。

## 📦 已安装的依赖

```json
{
  "@ffmpeg/ffmpeg": "^0.12.10",
  "@ffmpeg/util": "^0.12.1"
}
```

## 🚀 快速开始

### 1. 导入视频编辑工具

```javascript
import { videoEditor } from '../utils/videoEditor'
// 或者从组件直接导入
import { videoEditor } from '../components/DigitalHumanStudio'
```

### 2. 初始化编辑器

```javascript
// 在组件中初始化
useEffect(() => {
  const init = async () => {
    await videoEditor.load()
    videoEditor.setProgressCallback((progress) => {
      console.log('处理进度:', Math.round(progress * 100) + '%')
    })
  }
  init()
  
  return () => videoEditor.cleanup()
}, [])
```

## 🎬 可用的视频编辑功能

### 裁剪视频

```javascript
const trimmedVideo = await videoEditor.trimVideo(
  'input.mp4',      // 输入文件名
  'output.mp4',     // 输出文件名
  5,                // 开始时间（秒）
  10                // 持续时间（秒）
)
```

### 合并视频

```javascript
const mergedVideo = await videoEditor.mergeVideos(
  ['video1.mp4', 'video2.mp4', 'video3.mp4'],
  'merged.mp4'
)
```

### 添加背景音乐

```javascript
const videoWithMusic = await videoEditor.addBackgroundMusic(
  'video.mp4',      // 视频文件
  'music.mp3',      // 音频文件
  'output.mp4',     // 输出文件
  0.3               // 背景音乐音量 (0-1)
)
```

### 添加字幕

```javascript
const videoWithSubs = await videoEditor.addSubtitle(
  'video.mp4',          // 视频文件
  'subtitles.srt',      // SRT 字幕文件
  'output.mp4'          // 输出文件
)
```

### 转换视频格式

```javascript
const webmVideo = await videoEditor.convertFormat(
  'input.mp4',
  'output.webm',
  'webm'
)
```

### 调整视频分辨率

```javascript
const hdVideo = await videoEditor.resizeVideo(
  'input.mp4',
  'output.mp4',
  '1920x1080'  // 目标分辨率
)
```

### 提取音频

```javascript
const audio = await videoEditor.extractAudio(
  'video.mp4',
  'audio.mp3'
)
```

### 生成缩略图

```javascript
const thumbnail = await videoEditor.generateThumbnail(
  'video.mp4',
  'thumb.jpg',
  3  // 第 3 秒的帧
)
```

## 📝 在 DigitalHumanStudio 中使用

`DigitalHumanStudio` 组件已经集成了以下便捷方法：

```javascript
// 裁剪视频
const result = await trimVideo(videoFile, startTime, duration)

// 合并视频
const result = await mergeVideos([videoFile1, videoFile2])

// 添加背景音乐
const result = await addBackgroundMusic(videoFile, audioFile, volume)

// 生成缩略图
const result = await generateThumbnail(videoFile, time)

// 转换格式
const result = await convertVideoFormat(videoFile, 'webm')
```

## 🔄 进度监听

```javascript
videoEditor.setProgressCallback((progress, time) => {
  console.log(`进度：${Math.round(progress * 100)}%`)
  // 更新 UI 进度条
  setProgress(Math.round(progress * 100))
})
```

## ⚠️ 注意事项

1. **WASM 加载时间**: 首次加载 FFmpeg.wasm 核心需要几秒钟，请显示加载状态
2. **内存限制**: 浏览器环境有内存限制，处理大文件时需注意
3. **跨域问题**: FFmpeg.wasm 核心从 CDN 加载，确保网络可达
4. **线程支持**: 某些功能需要 `SharedArrayBuffer` 支持，需要正确的 HTTP 头：
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```

## 🛠️ 完整示例

```javascript
import { useState, useEffect } from 'react'
import { videoEditor } from '../utils/videoEditor'

function VideoEditorExample() {
  const [loaded, setLoaded] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const init = async () => {
      await videoEditor.load()
      videoEditor.setProgressCallback((p) => setProgress(Math.round(p * 100)))
      setLoaded(true)
    }
    init()
    return () => videoEditor.cleanup()
  }, [])

  const handleTrimVideo = async (file, startTime, duration) => {
    if (!loaded) return alert('编辑器未就绪')
    
    setIsProcessing(true)
    try {
      await videoEditor.writeFile('input.mp4', file)
      const result = await videoEditor.trimVideo('input.mp4', 'output.mp4', startTime, duration)
      
      // 下载结果
      const url = URL.createObjectURL(result)
      const a = document.createElement('a')
      a.href = url
      a.download = 'trimmed.mp4'
      a.click()
      
      await videoEditor.deleteFile('input.mp4')
      await videoEditor.deleteFile('output.mp4')
    } catch (err) {
      console.error(err)
      alert('处理失败')
    } finally {
      setIsProcessing(false)
    }
  }

  if (!loaded) return <div>加载中... {progress}%</div>

  return (
    <div>
      <input 
        type="file" 
        accept="video/*"
        onChange={(e) => handleTrimVideo(e.target.files[0], 0, 10)}
      />
      {isProcessing && <div>处理中... {progress}%</div>}
    </div>
  )
}
```

## 📚 API 参考

### VideoEditor 类

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `load()` | 无 | Promise | 加载 FFmpeg WASM |
| `setProgressCallback(cb)` | `cb: (progress, time) => void` | 无 | 设置进度回调 |
| `writeFile(name, data)` | `name: string`, `data: File\|Blob` | Promise | 写入文件到虚拟文件系统 |
| `readFile(name, type)` | `name: string`, `type: 'blob'\|'uint8array'` | Promise | 读取文件 |
| `deleteFile(name)` | `name: string` | Promise | 删除文件 |
| `trimVideo(...)` | 见上文 | Promise<Blob> | 裁剪视频 |
| `mergeVideos(...)` | 见上文 | Promise<Blob> | 合并视频 |
| `addBackgroundMusic(...)` | 见上文 | Promise<Blob> | 添加背景音乐 |
| `addSubtitle(...)` | 见上文 | Promise<Blob> | 添加字幕 |
| `convertFormat(...)` | 见上文 | Promise<Blob> | 转换格式 |
| `resizeVideo(...)` | 见上文 | Promise<Blob> | 调整分辨率 |
| `extractAudio(...)` | 见上文 | Promise<Blob> | 提取音频 |
| `generateThumbnail(...)` | 见上文 | Promise<Blob> | 生成缩略图 |
| `cleanup()` | 无 | Promise | 清理资源 |

## 🔗 相关资源

- [@ffmpeg/ffmpeg 文档](https://github.com/ffmpegwasm/ffmpeg.wasm)
- [FFmpeg 命令行文档](https://ffmpeg.org/ffmpeg.html)