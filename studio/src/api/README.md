# API 模块说明

本模块实现了与后端 API 的完整交互，支持通过系统 API 地址中转文件上传和任务取消。

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

### 1. 文件上传

所有文件统一提交到系统配置的 API 地址，由后端中转到对象存储。前端不再获取预签名上传地址，也不再直接请求对象存储。

```javascript
relayUpload(file, filename, purpose)
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
    vfsVideoPath: '/project1/video.mp4',
    vfsScriptPath: '/project1/scenes.json',
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
- `relayUpload(file, filename, purpose)` - 通过系统 API 地址上传文件并返回对象存储 key

### 任务管理
- `createDraftTask(payload)` - 创建草稿任务
- `createComposeTask(payload)` - 创建合成任务
- `getTaskStatus(task_id)` - 获取任务状态
- `getDraftDetail(task_id)` - 获取草稿详情
- `getTaskFileUrl(task_id, file_key)` - 获取产物下载 URL
- `cancelTask(task_id, reason)` - 取消任务
- `getTaskList(limit)` - 获取任务列表

## 🔧 配置项

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
3. **内存管理**: 上传请求使用浏览器的 `File`/`Blob` 流程，不在前端构造对象存储上传地址
4. **配额保护**: 取消任务时会通知后端，保护商户 Quota

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
