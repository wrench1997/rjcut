# RJCut Studio - Electron 重构指南

## 概述

本项目已从基于浏览器 IndexedDB 的虚拟文件系统重构为 **Electron 桌面应用**，直接访问本地文件系统，完全脱离浏览器沙盒限制。

## 架构变更

### 之前（IndexedDB 虚拟文件系统）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  VirtualFileSystem│────▶│  IndexedDB      │
│   (Browser)     │     │  (JavaScript)     │     │  (Browser Only) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │
         └─────> 限制：无法访问真实文件系统，大文件支持差
```

### 现在（Electron 本地文件系统）

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  Electron IPC    │────▶│  Local File     │
│   (Renderer)    │     │  (main.js)        │     │  System         │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              │ Node.js fs module
                              │
                       ┌──────────────────┐
                       │  Native File     │
                       │  Access           │
                       └──────────────────┘
```

## 核心组件

### 1. Electron 主进程 (`electron/main.js`)

- 创建浏览器窗口
- 提供 IPC 通信接口
- 直接访问本地文件系统
- 安全路径验证（防止目录穿越）

### 2. Preload 脚本 (`electron/preload.js`)

- 使用 `contextBridge` 暴露安全的 API
- 渲染进程通过 `window.electronAPI` 访问文件系统

### 3. Electron 文件系统适配器 (`src/utils/electronFileSystem.js`)

- 与原有 `VirtualFileSystem` 接口完全兼容
- 自动检测 Electron 环境
- 无需修改现有组件代码

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 同时启动 Next.js 和 Electron
npm run dev

# 或分别启动
npm run dev:next    # 只启动 Next.js（端口 3000）
npm run dev:electron  # 启动 Electron（需要 Next.js 先运行）
```

### 构建应用

```bash
# 1. 构建 Next.js
npm run build

# 2. 打包 Electron 应用
npm run build:electron

# 或直接打包（会自动构建 Next.js）
npm run dist
```

### 运行打包后的应用

```bash
npm run start:electron
```

## IPC 通信配置

### 主进程注册处理器 (`electron/main.js`)

```javascript
// 列出目录
ipcMain.handle('fs:listDirectory', async (event, dirPath) => {
  const resolved = validatePath(dirPath)
  const items = await fs.readdir(resolved, { withFileTypes: true })
  return items.map(item => ({
    name: item.name,
    path: path.join(resolved, item.name),
    isDirectory: item.isDirectory(),
    isFile: item.isFile(),
    size: item.isFile() ? fsSync.statSync(...).size : undefined,
  }))
})

// 读取文件
ipcMain.handle('fs:readFile', async (event, filePath, encoding = 'utf-8') => {
  const resolved = validatePath(filePath)
  return await fs.readFile(resolved, encoding)
})

// 写入文件
ipcMain.handle('fs:writeFile', async (event, filePath, content, options = {}) => {
  const resolved = validatePath(filePath)
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, content)
  return { path: resolved, size: content.length }
})

// ... 更多处理器见 electron/main.js
```

### Preload 暴露 API (`electron/preload.js`)

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统操作
  listDirectory: (dirPath) => ipcRenderer.invoke('fs:listDirectory', dirPath),
  readFile: (filePath, encoding) => ipcRenderer.invoke('fs:readFile', filePath, encoding),
  writeFile: (filePath, content, options) => ipcRenderer.invoke('fs:writeFile', filePath, content, options),
  mkdir: (dirPath, recursive) => ipcRenderer.invoke('fs:mkdir', dirPath, recursive),
  delete: (path, recursive) => ipcRenderer.invoke('fs:delete', path, recursive),
  
  // 对话框
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openDirectory: (options) => ipcRenderer.invoke('dialog:openDirectory', options),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  
  // 系统
  showInFolder: (filePath) => ipcRenderer.invoke('system:showInFolder', filePath),
  openFile: (filePath) => ipcRenderer.invoke('system:openFile', filePath),
})
```

### 渲染进程使用 (`src/components/FileBrowser.jsx`)

```javascript
// 使用 ElectronFileSystem 适配器（与 VirtualFileSystem 接口相同）
import { getSharedFileSystem } from '../utils/electronFileSystem'

const vfs = await getSharedFileSystem()
await vfs.init()

// 列出目录
const files = await vfs.listDirectory('/projects')

// 读取文件
const content = await vfs.readFile('/config.json')

// 写入文件
await vfs.writeFile('/output/result.txt', 'Hello World')

// 上传文件（使用系统对话框）
const filePath = await window.electronAPI.openFile({
  filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'avi'] }]
})
if (filePath) {
  // 直接复制到项目目录
  const destPath = `/projects/my-project/${path.basename(filePath)}`
  await window.electronAPI.copy(filePath, destPath)
}
```

## 安全考虑

### 路径验证

主进程中的 `validatePath()` 函数确保所有文件访问都在允许的根目录内：

```javascript
function validatePath(requestedPath) {
  const normalized = path.normalize(requestedPath)
  const absolute = path.isAbsolute(normalized) 
    ? normalized 
    : path.join(allowedRoots[0], normalized)
  
  // 检查是否在允许的根目录内
  const isAllowed = allowedRoots.some(root => 
    absolute === root || absolute.startsWith(root + path.sep)
  )
  
  if (!isAllowed) {
    throw new Error('访问被拒绝：路径不在允许的根目录内')
  }
  
  return absolute
}
```

### 允许的根目录

默认允许访问：
- 用户文档目录 (`app.getPath('documents')`)
- 用户视频目录 (`app.getPath('videos')`)

可以在设置中自定义允许的根目录。

### 文件大小限制

- 普通文件：100MB
- 视频文件：500MB

## 迁移指南

### 从 VirtualFileSystem 迁移

由于 `ElectronFileSystem` 与 `VirtualFileSystem` 接口完全相同，只需修改导入：

```javascript
// 之前
import { getSharedFileSystem } from '../utils/virtualFileSystem'

// 现在
import { getSharedFileSystem } from '../utils/electronFileSystem'
```

### 从 Local VFS Server 迁移

Electron 模式不再需要独立的 VFS 服务器进程，所有功能都集成在 Electron 主进程中。

## 构建配置

### package.json 配置

```json
{
  "build": {
    "appId": "com.rjcut.studio",
    "productName": "RJCut Studio",
    "files": [
      "electron/**/*",
      ".next/**/*",
      "public/**/*"
    ],
    "mac": {
      "target": "dmg",
      "category": "public.app-category.video"
    },
    "win": {
      "target": "nsis",
      "icon": "public/icon.ico"
    },
    "linux": {
      "target": "AppImage",
      "category": "Video"
    }
  }
}
```

## 故障排除

### Electron 窗口空白

1. 检查 Next.js 是否在运行（开发模式）
2. 检查控制台错误
3. 确认 preload.js 正确加载

### 文件系统访问被拒绝

1. 检查路径是否在允许的根目录内
2. 确认操作系统文件权限
3. 查看主进程日志

### 打包后无法运行

1. 确保 `.next` 目录已构建
2. 检查 `electron/main.js` 中的路径是否正确
3. 查看应用日志

## 开发技巧

### 调试主进程

```bash
# 在 electron/main.js 中添加
console.log('[Main] 调试信息')

# 查看日志
# macOS: ~/Library/Logs/RJCut Studio/main.log
# Windows: %APPDATA%\RJCut Studio\logs\main.log
# Linux: ~/.config/RJCut Studio/logs/main.log
```

### 调试渲染进程

开发模式下自动打开 DevTools：
```javascript
mainWindow.webContents.openDevTools()
```

### 热重载

开发模式下，Next.js 支持热重载，但 Electron 需要重启：
```bash
# 使用 nodemon 自动重启 Electron
npm install --save-dev nodemon

# 修改 package.json
"dev:electron": "nodemon --watch electron --exec electron ."
```

## 下一步计划

- [ ] 自动更新功能
- [ ] 系统托盘集成
- [ ] 原生菜单栏
- [ ] 键盘快捷键
- [ ] 最近文件列表
- [ ] 文件关联（双击视频文件打开）

## 许可证

MIT