# 数字人视频导入 VFS 项目指南

本文档详细说明如何在前端 Studio 中，将数字人生成的视频导入到 VFS（虚拟文件系统）的项目中进行后续编辑和管理。

## 📋 目录

- [流程概述](#流程概述)
- [架构设计](#架构设计)
- [实现步骤](#实现步骤)
- [代码示例](#代码示例)
- [最佳实践](#最佳实践)

---

## 流程概述

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  数字人生成视频  │ ──► │  下载视频文件   │ ──► │  导入 VFS 项目   │
│  (蝉镜 API)     │     │  (Blob/URL)     │     │  (/raw/项目名/)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │  后续编辑处理   │
                                               │  (剪辑/字幕等)  │
                                               └─────────────────┘
```

### 完整流程

1. **创建/选择 VFS 项目** - 在文件浏览器中创建视频项目
2. **生成数字人视频** - 使用数字人管理器创建视频生成任务
3. **轮询任务状态** - 等待视频生成完成
4. **下载视频文件** - 获取视频 Blob 或下载 URL
5. **导入 VFS** - 将视频写入项目的 `/raw` 目录
6. **更新项目配置** - 记录视频元数据到项目配置

---

## 架构设计

### 目录结构

```
VFS 项目结构:
/raw/
  └── {projectName}/
      ├── project.json          # 项目配置
      ├── raw/                  # 原始视频（包含数字人视频）
      ├── edited/               # 编辑后的视频
      ├── output/               # 最终输出
      ├── audio/                # 音频文件
      ├── subtitles/            # 字幕文件
      └── scenes/               # 场景脚本
```

### 数据流

```javascript
// 数字人视频元数据
{
  task_id: "task_dh_xxx",
  video_url: "https://oss...",
  person_name: "主播小明",
  person_id: "person_xxx",
  text: "视频口播内容",
  duration: 30.5,
  created_at: "2024-01-01T10:00:00Z"
}
```

---

## 实现步骤

### 步骤 1: 创建 VFS 视频项目

```javascript
import { getSharedFileSystem } from './utils/virtualFileSystem'

async function createProjectForDigitalHuman(projectName) {
  const vfs = await getSharedFileSystem()
  
  // 创建项目（会自动创建 raw/, edited/, output/ 等目录）
  const projectPath = await vfs.createVideoProject(projectName, {
    digital_human_enabled: true,  // 标记为数字人项目
  })
  
  return { vfs, projectPath }
}
```

### 步骤 2: 生成数字人视频并监听状态

```javascript
import { createDhGenerateTask, getTaskStatus } from '../api/api'

async function generateDigitalHumanVideo(params, onProgress) {
  // 创建任务
  const taskRes = await createDhGenerateTask({
    text: params.text,
    person_id: params.personId,
    audio_man_id: params.audioManId,
    figure_type: params.figureType,
    bg_type: 'color',
    bg_color: '#EDEDED',
    hide_subtitle: true,
    timeout_seconds: 3600,
  })
  
  const taskId = taskRes.data.data.task_id
  
  // 轮询任务状态
  return new Promise((resolve, reject) => {
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await getTaskStatus(taskId)
        const task = statusRes.data.data
        
        onProgress?.({
          stage: task.stage,
          status: task.status,
          progress: task.progress,
        })
        
        if (task.status === 'success') {
          clearInterval(pollInterval)
          resolve(task)
        } else if (task.status === 'failed') {
          clearInterval(pollInterval)
          reject(new Error(task.error || '视频生成失败'))
        }
      } catch (err) {
        clearInterval(pollInterval)
        reject(err)
      }
    }, 3000) // 每 3 秒轮询一次
  })
}
```

### 步骤 3: 下载视频并导入 VFS

```javascript
async function importVideoToVFS(vfs, projectPath, task, filename) {
  // 从任务结果获取视频 URL
  const videoUrl = task.result?.video_url
  if (!videoUrl) {
    throw new Error('未找到视频 URL')
  }
  
  // 下载视频为 Blob
  const response = await fetch(videoUrl)
  const blob = await response.blob()
  
  // 确定保存路径
  const savePath = `${projectPath}/raw/${filename || `dh_${task.id}.mp4`}`
  
  // 写入 VFS
  const fileInfo = await vfs.writeFile(savePath, blob, {
    type: 'video/mp4',
    metadata: {
      source: 'digital_human',
      task_id: task.id,
      person_id: task.payload?.person_id,
      person_name: task.payload?.person_name,
      text: task.payload?.text,
      duration: task.result?.duration,
      created_at: task.completed_at,
    },
  })
  
  return fileInfo
}
```

### 步骤 4: 更新项目配置

```javascript
async function updateProjectWithVideo(vfs, projectPath, videoInfo) {
  // 读取项目配置
  const config = await vfs.readJSON(`${projectPath}/project.json`)
  
  // 添加视频记录到 scenes
  if (!config.scenes) {
    config.scenes = []
  }
  
  config.scenes.push({
    id: `scene_${Date.now()}`,
    type: 'digital_human',
    video_path: videoInfo.path,
    text: videoInfo.metadata?.text,
    duration: videoInfo.metadata?.duration,
    created_at: new Date().toISOString(),
  })
  
  config.updatedAt = new Date().toISOString()
  
  // 保存配置
  await vfs.writeJSON(`${projectPath}/project.json`, config)
  
  return config
}
```

---

## 代码示例

### 完整集成组件示例

```jsx
// DigitalHumanVFSImporter.jsx
import { useState } from 'react'
import { getSharedFileSystem } from '../utils/virtualFileSystem'
import { 
  createDhGenerateTask, 
  getTaskStatus,
  getCommonPersons,
  getCustomPersons 
} from '../api/api'

export function DigitalHumanVFSImporter({ projectPath, onImportComplete }) {
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [text, setText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ stage: '', percent: 0 })
  const [error, setError] = useState('')

  const handleGenerateAndImport = async () => {
    if (!selectedPerson || !text.trim()) {
      setError('请选择数字人并输入文本')
      return
    }

    setGenerating(true)
    setError('')

    try {
      const vfs = await getSharedFileSystem()

      // 1. 创建视频生成任务
      setProgress({ stage: '创建任务...', percent: 10 })
      const taskRes = await createDhGenerateTask({
        text,
        person_id: selectedPerson.id,
        figure_type: selectedPerson.figure_type,
        timeout_seconds: 3600,
      })

      const taskId = taskRes.data.data.task_id

      // 2. 轮询等待完成
      setProgress({ stage: '生成视频中...', percent: 30 })
      const task = await waitForTaskCompletion(taskId, setProgress)

      // 3. 下载并导入 VFS
      setProgress({ stage: '导入到项目...', percent: 90 })
      const filename = `dh_${selectedPerson.name}_${Date.now()}.mp4`
      const videoInfo = await importVideoToVFS(vfs, projectPath, task, filename)

      // 4. 更新项目配置
      await updateProjectWithVideo(vfs, projectPath, videoInfo)

      setProgress({ stage: '完成!', percent: 100 })
      onImportComplete?.(videoInfo)

    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="digital-human-importer">
      {/* 选择数字人 */}
      <PersonSelector 
        selected={selectedPerson} 
        onSelect={setSelectedPerson} 
      />
      
      {/* 输入文本 */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入要合成的文本内容..."
        rows={4}
      />
      
      {/* 进度显示 */}
      {generating && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress.percent}%` }} />
          <span>{progress.stage}</span>
        </div>
      )}
      
      {/* 错误信息 */}
      {error && <div className="error">{error}</div>}
      
      {/* 操作按钮 */}
      <button 
        onClick={handleGenerateAndImport}
        disabled={generating || !selectedPerson || !text.trim()}
      >
        {generating ? '生成中...' : '生成并导入视频'}
      </button>
    </div>
  )
}

// 辅助函数
async function waitForTaskCompletion(taskId, onProgress) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const res = await getTaskStatus(taskId)
        const task = res.data.data
        
        const percent = task.status === 'success' ? 80 : 
                       task.status === 'failed' ? 0 :
                       30 + (task.progress || 0) * 0.5
        
        onProgress?.({ stage: task.stage, percent })
        
        if (task.status === 'success') {
          resolve(task)
        } else if (task.status === 'failed') {
          reject(new Error(task.error || '生成失败'))
        } else {
          setTimeout(poll, 3000)
        }
      } catch (err) {
        reject(err)
      }
    }
    poll()
  })
}

async function importVideoToVFS(vfs, projectPath, task, filename) {
  const videoUrl = task.result?.video_url
  const response = await fetch(videoUrl)
  const blob = await response.blob()
  
  return await vfs.writeFile(`${projectPath}/raw/${filename}`, blob, {
    type: 'video/mp4',
    metadata: {
      source: 'digital_human',
      task_id: task.id,
      person_id: task.payload?.person_id,
      text: task.payload?.text,
    },
  })
}

async function updateProjectWithVideo(vfs, projectPath, videoInfo) {
  const config = await vfs.readJSON(`${projectPath}/project.json`)
  
  if (!config.scenes) config.scenes = []
  
  config.scenes.push({
    id: `scene_${Date.now()}`,
    type: 'digital_human',
    video_path: videoInfo.path,
    text: videoInfo.metadata?.text,
    duration: videoInfo.metadata?.duration,
    created_at: new Date().toISOString(),
  })
  
  config.updatedAt = new Date().toISOString()
  await vfs.writeJSON(`${projectPath}/project.json`, config)
  return config
}
```

### 在 VideoProjectManager 中集成

```jsx
// 在 VideoProjectManager.jsx 中添加数字人视频导入功能

function ProjectDetail({ project, vfs, onBack, onOpen, onNavigate }) {
  const [showDHImporter, setShowDHImporter] = useState(false)
  
  return (
    <div className="project-detail">
      {/* ... 现有代码 ... */}
      
      <div className="project-detail-actions">
        <button
          className="btn btn-primary"
          onClick={() => setShowDHImporter(true)}
        >
          🎭 导入数字人视频
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => onOpen(project)}
        >
          打开项目
        </button>
      </div>
      
      {/* 数字人视频导入模态框 */}
      {showDHImporter && (
        <DigitalHumanVFSImporter
          projectPath={project.path}
          onImportComplete={(videoInfo) => {
            alert(`视频已导入：${videoInfo.name}`)
            setShowDHImporter(false)
          }}
          onClose={() => setShowDHImporter(false)}
        />
      )}
    </div>
  )
}
```

---

## 最佳实践

### 1. 大文件处理

对于较大的视频文件，建议使用流式下载和分片存储：

```javascript
async function downloadLargeVideo(url, onProgress) {
  const response = await fetch(url)
  const contentLength = response.headers.get('content-length')
  const reader = response.body.getReader()
  
  const chunks = []
  let loaded = 0
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    
    chunks.push(value)
    loaded += value.length
    
    onProgress?.({
      loaded,
      total: parseInt(contentLength),
      percent: (loaded / contentLength) * 100,
    })
  }
  
  return new Blob(chunks, { type: 'video/mp4' })
}
```

### 2. 错误处理与重试

```javascript
async function robustImport(vfs, projectPath, task, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await importVideoToVFS(vfs, projectPath, task)
    } catch (err) {
      if (i === maxRetries - 1) throw err
      console.warn(`导入失败，重试 ${i + 1}/${maxRetries}`)
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
}
```

### 3. 批量导入

```javascript
async function batchImportVideos(vfs, projectPath, tasks) {
  const results = []
  
  for (const task of tasks) {
    try {
      const videoInfo = await importVideoToVFS(vfs, projectPath, task)
      results.push({ success: true, task, videoInfo })
    } catch (err) {
      results.push({ success: false, task, error: err.message })
    }
  }
  
  return results
}
```

### 4. 元数据管理

建议在项目配置中维护数字人视频的索引：

```javascript
// project.json 扩展结构
{
  "name": "项目名",
  "digital_human_videos": [
    {
      "id": "dh_video_001",
      "path": "/raw/project/dh_video_001.mp4",
      "person_id": "person_xxx",
      "person_name": "主播小明",
      "text": "口播内容",
      "duration": 30.5,
      "task_id": "task_dh_xxx",
      "created_at": "2024-01-01T10:00:00Z"
    }
  ],
  "scenes": [...]
}
```

---

## 快速开始

### 1. 在 VideoProjectManager 中使用（已集成）

组件已经集成到 `VideoProjectManager.jsx` 中，用户只需：

1. 打开或创建一个视频项目
2. 点击项目详情页的 **"🎭 导入数字人视频"** 按钮
3. 选择数字人和输入文本
4. 等待生成和导入完成

### 2. 在其他组件中使用

```jsx
import { DigitalHumanVFSImporter } from './components/DigitalHumanVFSImporter'

function MyComponent() {
  return (
    <DigitalHumanVFSImporter
      projectPath="/raw/my-project"
      onImportComplete={(videoInfo) => {
        console.log('导入成功:', videoInfo)
      }}
      onClose={() => console.log('关闭')}
    />
  )
}
```

---

## 相关文档

- [虚拟文件系统 API](./src/utils/virtualFileSystem.js)
- [数字人管理器组件](./src/components/DigitalHumanManager.jsx)
- [视频项目管理器](./src/components/VideoProjectManager.jsx)
- [数字人快速开始](./DIGITAL_HUMAN_QUICKSTART.md)
- [数字人导入器组件](./src/components/DigitalHumanVFSImporter.jsx)

---

## 常见问题

### Q: 视频文件太大无法导入怎么办？

A: VFS 使用 IndexedDB 存储，Chrome 默认限制约为存储设备的 60%。对于超大文件：
1. 考虑压缩视频后再导入
2. 使用外部 URL 引用而非直接存储 Blob
3. 清理不需要的旧视频释放空间

### Q: 如何删除已导入的数字人视频？

```javascript
// 从 VFS 删除文件
await vfs.delete(`${projectPath}/raw/dh_video_001.mp4`)

// 同时更新项目配置
const config = await vfs.readJSON(`${projectPath}/project.json`)
config.digital_human_videos = config.digital_human_videos.filter(
  v => v.path !== `${projectPath}/raw/dh_video_001.mp4`
)
await vfs.writeJSON(`${projectPath}/project.json`, config)
```

### Q: 如何预览导入的视频？

```jsx
import { VideoPreview } from './components/FileBrowser'

function VideoList({ videos, vfs }) {
  const [selected, setSelected] = useState(null)
  
  return (
    <div>
      {videos.map(video => (
        <div key={video.path} onClick={() => setSelected(video)}>
          {video.name}
        </div>
      ))}
      {selected && <VideoPreview file={selected} vfs={vfs} />}
    </div>
  )
}
```