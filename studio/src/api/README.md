# API 模块说明

本模块实现了与后端 API 的完整交互，支持**大文件分片上传**和**任务取消**功能。

## 📁 文件结构

```
src/api/
├── api.js                  # API 客户端封装
├── BatchTaskRunner.js      # 批量任务运行器
├── useBatchProcessStore.js # Zustand 状态管理
├── index.js                # 模块导出
└── README.md               # 本文档
```

## ✨ 核心特性

### 1. 大文件分片上传

- **阈值**: 5MB
- **分片大小**: 5MB
- **并发控制**: 每个文件最多 3 个分片同时上传
- **自动合并**: 上传完成后自动调用后端接口合并分片

**工作原理**:

```javascript
// 小文件 (< 5MB) - 直接上传
presignUpload → PUT → confirmUpload

// 大文件 (>= 5MB) - 分片上传
initMultipartUpload → getMultipartPresignedUrls → 
  [PUT part1, PUT part2, ...] → completeMultipartUpload
```

### 2. AbortController 取消任务

- **前端中断**: 使用 `AbortController` 立即停止所有进行中的请求
- **后端通知**: 取消时调用 `/v1/tasks/{task_id}/cancel` 通知后端释放 GPU 资源
- **状态追踪**: 任务状态自动更新为 `cancelled`

**取消流程**:

```javascript
// 1. 触发取消
runner.abort()

// 2. 所有 fetch 请求收到 signal.aborted 信号
// 3. 抛出 AbortError

// 4. 轮询器检测到取消，调用后端取消接口
await api.cancelTask(taskId, '用户主动取消')

// 5. 任务状态更新为 cancelled
```

## 🚀 使用示例

### 基本使用

```javascript
import BatchProcessor from './components/BatchProcessor'

function App() {
  return (
    <BatchProcessor 
      vfs={vfs}
      apiKey={apiKey}
    />
  )
}
```

### 直接使用 Runner

```javascript
import { BatchTaskRunner } from './api/BatchTaskRunner'
import useBatchStore from './api/useBatchProcessStore'

// 准备任务数据
const tasks = [
  {
    id: 'task1',
    vfsVideoPath: '/raw/project1/video.mp4',
    vfsScriptPath: '/raw/project1/scenes.json',
    vfsBgmPath: '/audio/bgm.mp3',
    stage: 'idle',
    progress: 0,
  }
]

// 创建运行器
const runner = new BatchTaskRunner(
  tasks, 
  3, // 最大并发数
  (updatedTasks) => {
    // 更新 UI
    setTasks(updatedTasks)
  }
)

// 启动任务
await runner.run()

// 取消所有任务
runner.abort()
```

### 使用 Zustand Store

```javascript
import useBatchStore from './api/useBatchProcessStore'

function MyComponent() {
  const { 
    tasks, 
    isRunning, 
    startBatch, 
    abortBatch,
    getTaskStats 
  } = useBatchStore()

  const stats = getTaskStats()
  // stats: { total, succeeded, failed, cancelled, running }

  return (
    <div>
      {isRunning ? (
        <button onClick={abortBatch}>🛑 取消所有</button>
      ) : (
        <button onClick={() => startBatch(tasks, 3)}>
          启动 {tasks.length} 个任务
        </button>
      )}
      
      <div>
        成功：{stats.succeeded} | 失败：{stats.failed} | 
        取消：{stats.cancelled} | 进行中：{stats.running}
      </div>
    </div>
  )
}
```

## 📡 API 接口

### 商户信息
- `getMerchantInfo()` - 获取商户信息和配额

### 文件上传
- `presignUpload(filename, content_type, purpose)` - 获取小文件预签名 URL
- `confirmUpload(upload_id)` - 确认小文件上传完成
- `initMultipartUpload(filename, content_type, purpose, parts_count)` - 初始化分片上传
- `getMultipartPresignedUrls(upload_id, part_numbers)` - 获取分片上传 URLs
- `completeMultipartUpload(upload_id, parts)` - 完成分片上传

### 任务管理
- `createDraftTask(payload)` - 创建草稿任务
- `createComposeTask(payload)` - 创建合成任务
- `getTaskStatus(task_id)` - 获取任务状态
- `getDraftDetail(task_id)` - 获取草稿详情
- `getTaskFileUrl(task_id, file_key)` - 获取产物下载 URL
- `cancelTask(task_id, reason)` - 取消任务
- `getTaskList(limit)` - 获取任务列表

## 🔧 配置项

### CHUNK_SIZE (BatchTaskRunner.js)
分片大小，默认 5MB
```javascript
const CHUNK_SIZE = 5 * 1024 * 1024;
```

### CHUNK_CONCURRENCY (BatchTaskRunner.js)
单个文件分片并发数，默认 3
```javascript
const CHUNK_CONCURRENCY = 3;
```

### 轮询间隔 (BatchTaskRunner.js)
任务状态轮询间隔，默认 3000ms
```javascript
const interval = setInterval(async () => {
  // ...
}, 3000);
```

## 📊 任务阶段

| 阶段 | 说明 | 进度范围 |
|------|------|----------|
| `idle` | 等待中 | 0% |
| `uploading` | 上传文件 | 0% - 20% |
| `drafting` | 草稿生成 | 20% - 50% |
| `composing` | 视频合成 | 50% - 90% |
| `downloading` | 下载产物 | 90% - 100% |
| `succeeded` | 成功 | 100% |
| `failed` | 失败 | - |
| `cancelled` | 已取消 | - |

## ⚠️ 注意事项

1. **API Key 管理**: 使用 `setApiKey(apiKey)` 设置 API Key，不要硬编码在代码中
2. **错误处理**: 所有错误都会在任务卡片中显示
3. **内存管理**: 大文件使用 `Blob.slice()` 切割，不会导致 OOM
4. **浏览器限制**: Chrome 同一域名最多 6 个 HTTP 连接，已通过 `pLimit` 控制并发
5. **配额保护**: 取消任务时会通知后端，保护商户 Quota

## 🛠️ 依赖

```json
{
  "axios": "^1.x",
  "zustand": "^4.x",
  "p-limit": "^5.x"
}
```

安装依赖:
```bash
npm install axios zustand p-limit
```
