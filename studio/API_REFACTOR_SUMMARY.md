# API 重构总结 - 支持大文件分片上传与任务取消

## 🎯 重构目标

为了解决原有代码中存在的问题，我们进行了深度重构，实现了以下核心功能：

1. **大文件分片上传** - 支持超过 5MB 的文件自动分片上传
2. **AbortController 取消任务** - 支持用户随时取消任务，并通知后端释放资源

## 📦 新增文件

### 1. `src/api/api.js` - API 客户端封装

封装了所有与后端的交互接口，包括：

- ✅ 商户信息查询
- ✅ 小文件直传（< 5MB）
- ✅ 大文件分片上传（≥ 5MB）
- ✅ 任务创建与管理
- ✅ 任务取消接口

**关键代码**:
```javascript
// 分片上传初始化
export const initMultipartUpload = (filename, content_type, purpose, parts_count) =>
  apiClient.post('/v1/uploads/multipart/start', { filename, content_type, purpose, parts_count });

// 取消任务
export const cancelTask = (task_id, reason = '用户取消') => 
  apiClient.post(`/v1/tasks/${task_id}/cancel`, { reason });
```

### 2. `src/api/BatchTaskRunner.js` - 批量任务运行器

核心编排器，负责任务的全生命周期管理：

- ✅ 自动判断文件大小，选择上传策略
- ✅ 分片并发控制（每个文件最多 3 个分片同时上传）
- ✅ 所有异步操作注入 `AbortSignal`
- ✅ 轮询机制支持中断
- ✅ 取消时通知后端释放 GPU 资源

**关键特性**:
```javascript
// 5MB 分片阈值
const CHUNK_SIZE = 5 * 1024 * 1024;

// 每个文件分片并发数
const CHUNK_CONCURRENCY = 3;

// 检查取消状态
checkAborted(signal) {
  if (signal.aborted) throw new DOMException('Task cancelled by user', 'AbortError');
}

// 外部触发取消
abort() {
  this.abortController.abort();
}
```

### 3. `src/api/useBatchProcessStore.js` - Zustand 状态管理

使用 Zustand 管理批量处理状态：

- ✅ 任务状态追踪
- ✅ 启动/取消/重置控制
- ✅ 任务统计信息
- ✅ 简洁的 API

**使用示例**:
```javascript
import useBatchStore from './api/useBatchProcessStore'

const { 
  tasks, 
  isRunning, 
  startBatch, 
  abortBatch,
  getTaskStats 
} = useBatchStore()

// 启动任务
startBatch(taskItems, 3)

// 取消所有任务
abortBatch()

// 获取统计
const stats = getTaskStats()
// { total, succeeded, failed, cancelled, running }
```

### 4. `src/components/BatchProcessor.jsx` - 批量处理 UI 组件

全新的批量处理界面组件：

- ✅ 项目选择器
- ✅ 实时进度显示
- ✅ 任务状态卡片
- ✅ 统计面板
- ✅ 取消按钮
- ✅ 配置选项（并发数、BGM、自定义配置）

**任务阶段可视化**:
```
idle ⏳ → uploading ⬆️ → drafting 📝 → composing 🎬 → downloading ⬇️ → succeeded ✅
                                                               ↓
                                                          failed ❌ / cancelled 🚫
```

### 5. `src/api/README.md` - API 模块文档

详细的使用说明文档，包括：
- 文件结构
- 核心特性说明
- 使用示例
- API 接口列表
- 配置项说明
- 注意事项

## 🔧 修改的文件

### `src/App.jsx`

- ✅ 简化了状态管理（删除了旧的批量处理相关状态）
- ✅ 使用新的 `BatchProcessor` 组件替代原有逻辑
- ✅ 删除了冗余的代码（`submitBatchTasks`, `uploadFile`, `submitProjectTask` 等）
- ✅ 删除了 `BatchProjectSelector` 组件（已集成到 `BatchProcessor`）

## 🎨 架构设计

### 数据流

```
┌─────────────────┐
│  BatchProcessor │ ← 用户交互
│    Component    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  useBatchStore  │ ← Zustand 状态管理
│    (Zustand)    │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│ BatchTaskRunner │ ← 任务编排
└────────┬────────┘
         │
         ├──────────────┐
         ↓              ↓
┌────────────────┐ ┌──────────────┐
│   api.js       │ │  VirtualFile │
│  (HTTP 请求)    │ │   System     │
└────────────────┘ └──────────────┘
```

### 任务处理流程

```
1. 用户选择项目 → 2. 准备任务数据
       ↓
3. 启动 BatchTaskRunner
       ↓
4. 并发控制 (pLimit)
       ↓
5. 单个任务处理流程:
   ├── 上传文件 (0-20%)
   │   ├── < 5MB: 直传
   │   └── ≥ 5MB: 分片上传
   ├── 创建草稿任务 (20-50%)
   │   └── 轮询状态 (支持中断)
   ├── 创建合成任务 (50-90%)
   │   └── 轮询状态 (支持中断)
   └── 下载产物 (90-100%)
       ↓
6. 更新 UI 状态
```

## 💡 核心技术点

### 1. 分片上传策略

```javascript
// 文件大小判断
if (fileSize <= CHUNK_SIZE) {
  // 小文件直传
  await presignUpload(...)
  await fetch(upload_url, { method: 'PUT', body: blob })
  await confirmUpload(...)
} else {
  // 大文件分片上传
  await initMultipartUpload(...)
  const parts = await Promise.all(
    partUrls.map(url => 
      fetch(url, { method: 'PUT', body: chunkBlob })
    )
  )
  await completeMultipartUpload(upload_id, parts)
}
```

### 2. AbortController 中断机制

```javascript
// 创建控制器
this.abortController = new AbortController()

// 注入 signal 到所有 fetch
fetch(url, { signal })

// axios 也支持 signal
apiClient.get(url, { signal })

// 外部触发取消
abort() {
  this.abortController.abort()
}

// 轮询器检测取消
if (signal.aborted) {
  await api.cancelTask(taskId) // 通知后端
  throw new DOMException('Cancelled', 'AbortError')
}
```

### 3. 并发控制

```javascript
import pLimit from 'p-limit'

// 任务并发控制
this.limit = pLimit(maxConcurrent)

// 分片并发控制
const chunkLimit = pLimit(CHUNK_CONCURRENCY)

// 使用
await this.limit(() => processTask(task, signal))
await chunkLimit(async () => uploadPart(...))
```

## 📊 性能优化

| 优化点 | 说明 | 效果 |
|--------|------|------|
| 分片上传 | 5MB 以上文件自动分片 | 支持 GB 级文件 |
| 分片并发 | 每个文件 3 个分片并发 | 充分利用带宽 |
| 任务并发 | 可配置最大并发数 | 避免浏览器连接数限制 |
| Blob.slice | 使用原生 API 切割文件 | 内存高效，不会 OOM |
| AbortSignal | 所有请求支持取消 | 立即释放资源 |

## ⚠️ 注意事项

1. **后端接口要求**: 需要后端支持以下新接口：
   - `POST /v1/uploads/multipart/start`
   - `POST /v1/uploads/multipart/presign-parts`
   - `POST /v1/uploads/multipart/complete`
   - `POST /v1/tasks/{task_id}/cancel`

2. **浏览器兼容性**: 
   - `AbortController` - 现代浏览器均支持
   - `Blob.slice()` - 现代浏览器均支持
   - `fetch` - 现代浏览器均支持

3. **配额保护**: 取消任务时会通知后端，保护商户 Quota 不被浪费

4. **错误处理**: 所有错误都会在 UI 中显示，用户可以看到具体的失败原因

## 🚀 使用方法

### 安装依赖

```bash
cd studio
npm install axios zustand p-limit
```

### 配置 API Key

在 `.env` 文件中配置：
```env
VITE_API_BASE_URL=http://your-api-server:8001
```

### 使用新组件

在 `App.jsx` 中：
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

## 📝 后续优化建议

1. **断点续传**: 记录已上传的分片，支持中断后继续上传
2. **进度优化**: 上传进度可以更精确（基于已上传字节数）
3. **重试机制**: 失败的分片自动重试
4. **任务优先级**: 支持调整任务执行顺序
5. **本地缓存**: 使用 IndexedDB 缓存任务状态，刷新后不丢失

## 🎉 总结

通过这次重构，我们实现了：

✅ **大文件支持** - 5MB 阈值自动分片，支持 GB 级文件  
✅ **任务取消** - 前后端联动的取消机制，保护配额  
✅ **状态管理** - Zustand 统一管理，代码更清晰  
✅ **用户体验** - 实时进度、可视化状态、一键取消  
✅ **代码质量** - 模块化设计、类型注释、完整文档  

新的架构更加健壮、易用，为后续功能扩展打下了良好基础。
