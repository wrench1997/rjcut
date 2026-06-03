# 数字人批量流水线工作室 - 重构说明

## 📋 重构概述

将原有的"时间轴编辑器"模式改造为**"批量流水线配置向导"**，实现：
**【批量文案】+【选定数字人】👉 蝉镜生成 N 个原始视频 👉 自动 RJCut 后期加工 👉 批量产出成片**

---

## 🎯 核心改造点

### 1. UI 布局改造（三栏式工作流）

| 区域 | 功能 | 说明 |
|------|------|------|
| **左侧栏** (288px) | 数字人与声音选择 | 网格展示数字人头像，支持选择配音角色 |
| **中间栏** (弹性) | 批量文案输入 | 类似 Excel 的列表式文案输入，支持增删 |
| **右侧栏** (320px) | 后期包装配置 | 配置 BGM、字幕风格、智能去空隙等 RJCut 管线参数 |

### 2. 废弃的功能模块

- ❌ 左侧导航栏（模板/数字人/音频/文本/素材）
- ❌ 中间预览画布（模拟播放器）
- ❌ 底部时间轴编辑器（轨道、拖拽、刻度尺）
- ❌ 批量生成确认弹窗

### 3. 新增的功能模块

- ✅ **流水线进度面板**：实时显示每个视频的 4 阶段进度
  - 🎬 数字人生成中 (0-40%)
  - ⬇️ 下载视频中 (40-50%)
  - ✂️ 后期加工中 (50-100%)
  - ✅ 完成 / ❌ 失败

---

## 🔄 流水线执行流程

```
用户点击"一键生成" 
    ↓
[阶段 1] 并发提交 N 个蝉镜 dh_generate 任务
    ↓ 轮询 (每 3 秒)
    ↓ 进度 0-40%
    ↓
[阶段 2] 获取 download_url 并下载为 Blob
    ↓ 写入 VFS /dh_raw/raw_{taskId}.mp4
    ↓ 进度 45%
    ↓
[阶段 3] 调用 RJCut 管线
    ├─ 上传视频到 OSS (预签名直传)
    ├─ 上传 BGM (如果配置了)
    ├─ 发起 agent-draft 任务 (字幕识别)
    ↓ 轮询 (进度 50-75%)
    ├─ 发起 compose-from-draft 任务 (合成)
    ↓ 轮询 (进度 75-100%)
    ↓
[阶段 4] 任务完成，可在【任务列表】查看最终产物
```

---

## 🛠️ 技术实现细节

### 关键代码片段

#### 1. VFS 临时存储
```javascript
const vfs = await getSharedFileSystem()
await vfs.createDirectory('/dh_raw')
const vfsVideoPath = `/dh_raw/raw_${dhTaskId}.mp4`
await vfs.writeFile(vfsVideoPath, videoBlob)
```

#### 2. 文件上传到 OSS（复用 BatchProcessor 逻辑）
```javascript
const uploadVfsFile = async (path, purpose) => {
  let blob = await vfs.readFileAsBlob(path)
  // 1. 请求预签名 URL
  const presignRes = await fetch(`${apiBaseUrl}/v1/uploads/presign`, {...})
  const { upload_url, oss_key, upload_id } = presignData.data
  // 2. PUT 到对象存储
  await fetch(upload_url, { method: 'PUT', body: blob })
  // 3. 确认上传
  await fetch(`${apiBaseUrl}/v1/uploads/confirm`, {...})
  return oss_key
}
```

#### 3. 并发任务处理
```javascript
await Promise.all(initialTasks.map(async (task, index) => {
  // 每个任务独立执行 4 阶段流程
  ...
}))
```

---

## 📦 后期配置参数映射

| 前端配置 | 后端 API 参数 | 说明 |
|----------|--------------|------|
| 🎵 叠加背景音乐 | `audio.bgm_url` | 从 VFS 上传到 OSS 后的路径 |
| 📝 字幕风格 | `subtitle.effect` | `ad` (抖音爆款) / `default` (经典) |
| ✂️ 智能去空隙 | `pipeline.auto_cut_silence` | 自动删除静音片段 |
| 📐 画面比例 | (暂未实现) | 可在 compose 阶段添加 crop 参数 |

---

## 🚀 使用指南

### 第一步：选择数字人
1. 在左侧网格中点击选择数字人头像
2. （可选）在底部选择配音角色（默认使用数字人原声）

### 第二步：输入批量文案
1. 在中间区域输入第一条文案
2. 点击"+ 新增文案"添加更多视频文案
3. 可删除不需要的文案（至少保留 1 条）

### 第三步：配置后期包装
1. **背景音乐**：勾选后输入 VFS 路径（如 `/bgm/music.mp3`）
2. **字幕风格**：选择"抖音爆款"或"经典居中"
3. **智能去空隙**：勾选自动删除静音片段
4. **画面比例**：选择输出尺寸（9:16 / 16:9 / 1:1 / 4:5）

### 第四步：启动流水线
1. 点击"🚀 一键生成批量矩阵视频"
2. 弹出进度面板，实时查看每个视频的处理进度
3. 可关闭面板继续在后台运行
4. 完成后在【任务列表】查看最终产物

---

## 💡 架构优势

1. **逻辑自洽**：数字人平台与 RJCut 剪辑平台**串联**而非混用
2. **降低门槛**：运营人员像写 Excel 一样简单操作
3. **架构解耦**：后端无需写聚合 API，前端 VFS 作为中转站
4. **可追溯**：每个阶段都有明确进度和错误提示

---

## 🔧 后续优化建议

1. **断点续传**：如果数字人下载失败，支持重试而不重新生成
2. **VFS 清理**：任务完成后自动清理 `/dh_raw/` 临时文件
3. **进度持久化**：刷新页面后仍能查看任务进度
4. **批量导出**：一键下载所有完成视频到本地
5. **配额提示**：在启动前显示预计消耗的蝉镜配额

---

## 📝 相关文件

- `studio/src/components/DigitalHumanStudio.jsx` - 主组件（已重构）
- `studio/src/api/api.js` - API 客户端（新增 `getDhTaskDetail`, `getDhVideoUrl`）
- `studio/src/utils/virtualFileSystem.js` - VFS 工具（提供 `readFileAsBlob`, `writeFile`）
- `studio/src/api/useBatchProcessStore.js` - 批量处理 Store（逻辑参考）

---

## 🎉 重构完成

现在 `DigitalHumanStudio` 已完全符合"批量、高效生成"的初衷，实现了从文案到成片的**全自动流水线**！