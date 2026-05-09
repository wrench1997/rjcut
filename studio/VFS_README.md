# RJCut Studio 虚拟文件系统

## 概述

RJCut Studio 使用基于 IndexedDB 的虚拟文件系统 (VFS)，完全避免了 Chrome 受限的本地文件系统 API (File System Access API)。这使得应用可以在任何现代浏览器中运行，无需用户授权即可访问本地文件。

## 主要特性

### 1. IndexedDB 存储
- **大容量存储**: 利用 IndexedDB 存储大文件（视频、音频等），不受 localStorage 大小限制
- **持久化**: 数据在浏览器关闭后仍然保留
- **异步操作**: 所有文件操作都是异步的，不会阻塞 UI

### 2. 视频文件管理
- **视频预览**: 直接在浏览器中播放视频文件
- **音频预览**: 支持音频文件播放
- **图片预览**: 支持图片文件显示
- **项目结构**: 自动创建标准的视频项目目录结构

### 3. 文件操作
- **CRUD 操作**: 完整的创建、读取、更新、删除功能
- **目录管理**: 支持递归创建和删除目录
- **文件搜索**: 按名称、类型搜索文件
- **撤销/重做**: 支持操作历史记录

### 4. 项目管理
- **视频项目**: 创建和管理视频编辑项目
- **项目模板**: 支持从模板创建项目
- **项目配置**: 每个项目有独立的配置文件
- **快速访问**: 快速访问项目的各个子目录

## 目录结构

```
/
├── drafts/          # 草稿文件
├── configs/         # 配置文件
│   └── default.json # 默认配置
├── scripts/         # 脚本文件
├── templates/       # 项目模板
│   └── script_template.json
├── outputs/         # 输出文件
├── videos/          # 视频项目
│   └── [project-name]/
│       ├── project.json  # 项目配置
│       ├── raw/          # 原始视频
│       ├── edited/       # 编辑后的视频
│       ├── audio/        # 音频文件
│       ├── subtitles/    # 字幕文件
│       └── output/       # 最终输出
├── audio/           # 音频文件
├── subtitles/       # 字幕文件
└── transcriptions/  # 转录文件
```

## API 使用示例

### 初始化文件系统

```javascript
import { getSharedFileSystem } from './utils/virtualFileSystem'

// 获取共享的文件系统实例
const vfs = await getSharedFileSystem()
```

### 创建目录

```javascript
// 创建单个目录
await vfs.mkdir('/my-folder')

// 递归创建目录
await vfs.mkdir('/videos/project1/raw', true)
```

### 写入文件

```javascript
// 写入文本文件
await vfs.writeFile('/configs/test.json', '{"key": "value"}')

// 写入 JSON 文件
await vfs.writeJSON('/configs/settings.json', {
  pipeline: { remove_keyword: '转场' },
  audio: { bgm_volume: 0.3 }
})

// 写入二进制文件（如视频）
const fileInput = document.querySelector('input[type="file"]')
const file = fileInput.files[0]
const arrayBuffer = await file.arrayBuffer()
await vfs.writeFile(`/videos/${file.name}`, arrayBuffer, {
  type: file.type,
  metadata: { originalName: file.name }
})
```

### 读取文件

```javascript
// 读取文本文件
const content = await vfs.readFile('/configs/test.json')

// 读取 JSON 文件
const config = await vfs.readJSON('/configs/settings.json')

// 读取为 Blob（用于视频播放）
const blob = await vfs.readFileAsBlob('/videos/my-video.mp4')
const videoUrl = URL.createObjectURL(blob)

// 读取为 DataURL（用于图片显示）
const dataUrl = await vfs.readFileAsDataURL('/images/thumbnail.png')
```

### 删除文件/目录

```javascript
// 删除文件
await vfs.delete('/configs/test.json')

// 递归删除目录
await vfs.delete('/videos/old-project', true)
```

### 移动/重命名

```javascript
// 重命名文件
await vfs.move('/videos/old-name.mp4', '/videos/new-name.mp4')

// 移动文件到另一个目录
await vfs.move('/videos/video.mp4', '/outputs/video.mp4')
```

### 搜索文件

```javascript
// 按名称搜索
const results = vfs.search('report')

// 搜索视频文件
const videos = vfs.searchVideos()

// 搜索音频文件
const audioFiles = vfs.searchAudio()

// 搜索字幕文件
const subtitles = vfs.searchSubtitles()

// 搜索 JSON 文件
const jsonFiles = vfs.searchJSON()
```

### 创建视频项目

```javascript
// 创建新项目
const projectPath = await vfs.createVideoProject('产品宣传视频', {
  pipeline: {
    remove_keyword: '转场',
    margin: 0.15,
  },
  audio: {
    bgm_volume: 0.3,
    original_volume: 1.0,
  }
})

// 获取所有项目
const projects = await vfs.getVideoProjects()

// 获取项目配置
const project = projects[0]
const config = await vfs.readJSON(`${project.path}/project.json`)
```

### 获取存储信息

```javascript
const storageInfo = await vfs.getStorageInfo()
console.log(`总文件数：${storageInfo.fileCount}`)
console.log(`总大小：${storageInfo.totalSize} bytes`)
console.log(`可用空间：${storageInfo.available} bytes`)
```

## 组件使用

### FileBrowser 组件

```jsx
import FileBrowser from './components/FileBrowser'

function App() {
  const [vfs, setVfs] = useState(null)
  
  useEffect(() => {
    getSharedFileSystem().then(setVfs)
  }, [])
  
  return (
    <div style={{ height: '600px' }}>
      {vfs && (
        <FileBrowser
          vfs={vfs}
          onFileSelect={(file) => console.log('选中:', file)}
          onFileOpen={(file) => console.log('打开:', file)}
        />
      )}
    </div>
  )
}
```

### VideoProjectManager 组件

```jsx
import VideoProjectManager from './components/VideoProjectManager'

function App() {
  const [vfs, setVfs] = useState(null)
  
  useEffect(() => {
    getSharedFileSystem().then(setVfs)
  }, [])
  
  return (
    <div style={{ height: '600px' }}>
      {vfs && (
        <VideoProjectManager
          vfs={vfs}
          onOpenProject={(project) => console.log('打开项目:', project)}
          onNavigate={(path) => console.log('导航到:', path)}
        />
      )}
    </div>
  )
}
```

## 浏览器兼容性

| 浏览器 | 版本 | 支持 |
|--------|------|------|
| Chrome | 57+  | ✅ |
| Firefox | 52+  | ✅ |
| Safari | 10+  | ✅ |
| Edge | 79+  | ✅ |
| Opera | 44+  | ✅ |

## 存储限制

- **Chrome**: 通常为磁盘空间的 60%，最大可达可用空间的全部
- **Firefox**: 通常为磁盘空间的 10%，用户可手动授权更多
- **Safari**: 通常为 1GB，用户可手动授权更多

## 数据持久化

文件系统数据会自动持久化到 IndexedDB，但用户清除浏览器数据时会丢失。建议：

1. **定期导出**: 使用 `vfs.export()` 导出重要数据
2. **云同步**: 将重要文件同步到云端存储
3. **本地备份**: 定期下载重要文件到本地

## 性能优化

1. **大文件处理**: 使用 ArrayBuffer 而不是 Base64 存储二进制文件
2. **懒加载**: 只在需要时加载文件内容
3. **索引优化**: 使用 IndexedDB 的索引功能加速搜索
4. **批量操作**: 合并多个小操作为批量操作

## 常见问题

### Q: 文件最大能有多大？
A: 取决于浏览器和可用磁盘空间。Chrome 通常支持数 GB 的文件。

### Q: 数据会丢失吗？
A: 如果用户清除浏览器数据或卸载浏览器，数据会丢失。建议定期备份。

### Q: 可以在多个标签页共享数据吗？
A: 可以，使用 `getSharedFileSystem()` 获取单例实例。

### Q: 支持离线使用吗？
A: 支持，IndexedDB 数据完全存储在本地。

## 技术实现

- **存储引擎**: IndexedDB
- **数据结构**: Map + 关系型目录树
- **异步模式**: Promise/async-await
- **状态管理**: 内存缓存 + IndexedDB 持久化
- **历史记录**: 基于 JSON 快照的撤销/重做

## 未来计划

- [ ] 文件版本控制
- [ ] 协作编辑支持
- [ ] 云同步集成
- [ ] 文件压缩
- [ ] 增量备份
- [ ] 文件标签系统
