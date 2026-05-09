# RJCut Studio 使用示例

## 快速开始

### 1. 启动开发服务器

```bash
cd studio
npm install
npm run dev
```

### 2. 访问应用

打开浏览器访问 `http://localhost:5173`

## 功能示例

### 创建视频项目

1. 点击导航栏的 **"项目管理"**
2. 点击 **"+ 新建项目"** 按钮
3. 输入项目名称，例如 "产品宣传视频 01"
4. 选择模板（可选）
5. 点击 **"创建"**

### 上传视频文件

1. 点击导航栏的 **"文件浏览"**
2. 导航到 `/videos/你的项目名/raw` 目录
3. 点击 **"上传"** 按钮
4. 选择视频文件（支持 MP4、MOV、AVI 等格式）
5. 等待上传完成

### 预览视频

1. 在文件列表中点击上传的视频文件
2. 右侧会显示视频详情和播放器
3. 可以播放、暂停、拖动进度条

### 创建配置文件

1. 导航到 `/configs` 目录
2. 点击 **"📄"** 按钮创建新文件
3. 输入文件名，例如 `my-config.json`
4. 双击文件打开详情
5. 点击 **"编辑"** 按钮
6. 输入 JSON 配置：

```json
{
  "pipeline": {
    "remove_keyword": "转场",
    "margin": 0.15,
    "min_segment_duration": 0.1
  },
  "asr": {
    "model": "large-v3",
    "device": "cuda",
    "language": "zh"
  },
  "subtitle": {
    "effect": "ad",
    "font_size": 88
  },
  "audio": {
    "bgm_volume": 0.3,
    "original_volume": 1.0,
    "bgm_start_time": 0.0,
    "bgm_loop": true,
    "fade_in_duration": 0.5,
    "fade_out_duration": 0.5
  }
}
```

7. 点击 **"保存"**

### 搜索文件

1. 在文件浏览器顶部使用搜索框
2. 输入关键词搜索文件名
3. 使用类型过滤器筛选：
   - 全部
   - 视频
   - 音频
   - 图片
   - 文档

### 管理项目配置

1. 在项目管理页面选择一个项目
2. 点击 **"设置"** 标签
3. 修改管道配置、ASR 配置等
4. 点击 **"保存配置"**

### 复制项目

1. 在项目列表中悬停在项目卡片上
2. 点击右上角的 **"📋"** 按钮
3. 系统会创建一个副本，名称为 "原项目名 (副本)"

### 删除项目

1. 在项目列表中悬停在项目卡片上
2. 点击右上角的 **"🗑️"** 按钮
3. 确认删除

## 代码示例

### 在代码中使用文件系统

```javascript
import { getSharedFileSystem } from './utils/virtualFileSystem'

// 获取文件系统实例
const vfs = await getSharedFileSystem()

// 创建项目目录
await vfs.mkdir('/videos/my-project', true)

// 上传视频
const videoFile = document.querySelector('input[type="file"]').files[0]
const arrayBuffer = await videoFile.arrayBuffer()
await vfs.writeFile(`/videos/my-project/raw/${videoFile.name}`, arrayBuffer, {
  type: videoFile.type,
  metadata: {
    originalName: videoFile.name,
    uploadedAt: new Date().toISOString()
  }
})

// 创建项目配置
await vfs.writeJSON('/videos/my-project/project.json', {
  name: 'my-project',
  createdAt: new Date().toISOString(),
  config: {
    pipeline: {
      remove_keyword: '转场',
      margin: 0.15
    }
  }
})

// 获取所有视频文件
const videos = vfs.searchVideos()
console.log('视频文件:', videos)

// 获取存储信息
const storageInfo = await vfs.getStorageInfo()
console.log('存储使用:', storageInfo)
```

### 使用 FileBrowser 组件

```jsx
import { useState, useEffect } from 'react'
import { getSharedFileSystem } from './utils/virtualFileSystem'
import FileBrowser from './components/FileBrowser'

function MyComponent() {
  const [vfs, setVfs] = useState(null)
  
  useEffect(() => {
    getSharedFileSystem().then(setVfs)
  }, [])
  
  const handleFileSelect = (file) => {
    console.log('选中文件:', file)
    
    // 如果是视频文件，可以创建 URL 用于播放
    if (file.type?.startsWith('video/')) {
      vfs.readFileAsBlob(file.path).then(blob => {
        const url = URL.createObjectURL(blob)
        console.log('视频 URL:', url)
      })
    }
  }
  
  return (
    <div style={{ height: '600px' }}>
      {vfs && (
        <FileBrowser
          vfs={vfs}
          onFileSelect={handleFileSelect}
          onFileOpen={(file) => console.log('打开:', file)}
        />
      )}
    </div>
  )
}
```

### 使用 VideoProjectManager 组件

```jsx
import { useState, useEffect } from 'react'
import { getSharedFileSystem } from './utils/virtualFileSystem'
import VideoProjectManager from './components/VideoProjectManager'

function App() {
  const [vfs, setVfs] = useState(null)
  
  useEffect(() => {
    getSharedFileSystem().then(setVfs)
  }, [])
  
  const handleOpenProject = async (project) => {
    console.log('打开项目:', project.name)
    
    // 加载项目配置
    const config = await vfs.readJSON(`${project.path}/project.json`)
    console.log('项目配置:', config)
  }
  
  const handleNavigate = (path) => {
    console.log('导航到:', path)
    // 可以在这里切换到文件浏览器标签
  }
  
  return (
    <div style={{ height: '600px' }}>
      {vfs && (
        <VideoProjectManager
          vfs={vfs}
          onOpenProject={handleOpenProject}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  )
}
```

### 批量上传文件

```javascript
async function batchUploadFiles(vfs, targetPath, files) {
  const results = []
  
  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const fullPath = `${targetPath}/${file.name}`
      
      await vfs.writeFile(fullPath, arrayBuffer, {
        type: file.type,
        metadata: {
          originalName: file.name,
          size: file.size,
          uploadedAt: new Date().toISOString()
        }
      })
      
      results.push({ success: true, name: file.name, path: fullPath })
    } catch (error) {
      results.push({ success: false, name: file.name, error: error.message })
    }
  }
  
  return results
}

// 使用示例
const fileInput = document.querySelector('input[type="file"]')
const files = Array.from(fileInput.files)
const results = await batchUploadFiles(vfs, '/videos/my-project/raw', files)

console.log('上传结果:', results)
```

### 导出项目数据

```javascript
async function exportProject(vfs, projectPath) {
  // 获取项目配置
  const config = await vfs.readJSON(`${projectPath}/project.json`)
  
  // 获取项目文件列表
  const projectFiles = []
  const collectFiles = async (path) => {
    const items = vfs.listDirectory(path)
    for (const item of items) {
      if (item.isDirectory) {
        await collectFiles(item.path)
      } else {
        projectFiles.push({
          ...item,
          content: await vfs.readFileAsDataURL(item.path)
        })
      }
    }
  }
  
  await collectFiles(projectPath)
  
  // 创建导出文件
  const exportData = {
    project: config,
    files: projectFiles,
    exportedAt: new Date().toISOString()
  }
  
  // 保存导出文件
  await vfs.writeJSON(
    `/exports/${config.name}_export.json`,
    exportData,
    { createParent: true }
  )
  
  return exportData
}
```

## 最佳实践

### 1. 组织项目结构

```
/videos/
  ├── 产品宣传视频 01/
  │   ├── project.json      # 项目配置
  │   ├── raw/              # 原始素材
  │   │   ├── intro.mp4
  │   │   └── main.mp4
  │   ├── audio/            # 音频文件
  │   │   └── bgm.mp3
  │   ├── subtitles/        # 字幕文件
  │   │   └── subtitles.srt
  │   └── output/           # 输出文件
  │       └── final.mp4
  └── 产品宣传视频 02/
      └── ...
```

### 2. 使用配置文件

为不同类型的项目创建配置模板：

```javascript
// 标准视频配置
const standardConfig = {
  pipeline: {
    remove_keyword: '转场',
    margin: 0.15,
    min_segment_duration: 0.1
  },
  subtitle: {
    effect: 'ad',
    font_size: 88
  }
}

// 高质量视频配置
const highQualityConfig = {
  ...standardConfig,
  asr: {
    model: 'large-v3',
    device: 'cuda',
    language: 'zh'
  },
  subtitle: {
    ...standardConfig.subtitle,
    font_size: 96
  }
}

// 快速处理配置
const fastConfig = {
  ...standardConfig,
  asr: {
    model: 'base',
    device: 'cpu',
    language: 'zh'
  }
}
```

### 3. 定期清理

```javascript
// 清理过期的临时文件
async function cleanupTempFiles(vfs) {
  const now = Date.now()
  const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 天
  
  const tempFiles = vfs.search(/^temp_/)
  for (const file of tempFiles) {
    const fileTime = new Date(file.updatedAt).getTime()
    if (now - fileTime > maxAge) {
      await vfs.delete(file.path)
      console.log('清理过期文件:', file.path)
    }
  }
}
```

### 4. 错误处理

```javascript
async function safeFileOperation(vfs, operation) {
  try {
    return await operation()
  } catch (error) {
    console.error('文件操作失败:', error)
    
    // 友好的错误提示
    if (error.message.includes('不存在')) {
      alert('文件不存在，请刷新后重试')
    } else if (error.message.includes('空间')) {
      alert('存储空间不足，请清理一些文件')
    } else {
      alert(`操作失败：${error.message}`)
    }
    
    throw error
  }
}
```

## 故障排除

### 问题：文件上传失败

**原因**: 文件太大或浏览器存储空间不足

**解决方案**:
1. 检查浏览器存储空间：`vfs.getStorageInfo()`
2. 清理不需要的文件
3. 使用更小的文件或分块上传

### 问题：视频无法播放

**原因**: 浏览器不支持该视频格式

**解决方案**:
1. 使用标准格式（MP4 H.264 编码）
2. 检查文件是否完整上传
3. 尝试在其他浏览器中打开

### 问题：数据丢失

**原因**: 清除了浏览器数据

**解决方案**:
1. 定期导出重要数据
2. 使用云同步功能（如果可用）
3. 不要清除浏览器数据

## 更多资源

- [虚拟文件系统 API 文档](./VFS_README.md)
- [组件文档](./README.md)
- [项目设计文档](../DESIGN.md)
