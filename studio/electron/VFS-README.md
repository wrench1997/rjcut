# Electron MCP 虚拟文件服务器

基于 `mcp-proxy-extension/virtualFileSystem.js` 的逻辑，创建的本地虚拟文件服务器。

## 特点

1. **虚拟路径系统** - 所有操作在虚拟路径上进行（如 `/projects`, `/素材`, `/配置`），避免真实路径失败
2. **持久化存储** - 数据自动保存到本地 JSON 文件（每 30 秒自动保存）
3. **清晰的目录结构** - 预定义中文目录模板，看得见摸得着
4. **MCP 协议支持** - 兼容外部 MCP 客户端（Codex/Claude 等）
5. **HTTP + WebSocket 双协议** - 支持 REST API 和 MCP over WebSocket

## 虚拟目录结构

```
/
├── projects/        # 视频项目目录
├── 素材/            # 原始素材
├── 草稿/            # 草稿文件
├── 配置/            # 配置文件
│   └── default.json
├── 脚本/            # 脚本文件
├── 模板/            # 模板文件
│   ├── speaking_video.json
│   └── documentary.json
├── 输出/            # 输出文件
├── 音频/            # 音频文件
├── 字幕/            # 字幕文件
└── 转录/            # 转录文件
```

## 快速启动

### 方式 1：独立运行

```bash
cd electron
npm install
npm start
```

### 方式 2：在 Electron 主进程中集成

在 `main.js` 中引入：

```javascript
const { VirtualFileServer } = require('./virtual-file-server')

// 在 app.whenReady() 中启动
const vfsServer = new VirtualFileServer()
await vfsServer.init()
vfsServer.start()
```

## 连接方式

启动后，服务器提供以下端点：

- **WebSocket (MCP)**: `ws://localhost:8766/ws`
- **HTTP (REST API)**: `http://localhost:8766/api/vfs`
- **健康检查**: `http://localhost:8766/health`

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `VFS_PORT` | 服务器端口 | `8766` |
| `VFS_STORAGE` | 存储文件路径 | `userData/vfs-storage.json` |

示例：
```bash
VFS_PORT=9000 VFS_STORAGE=./my-vfs.json npm start
```

## API 使用示例

### 1. HTTP REST API

#### 列出目录
```bash
curl -X POST http://localhost:8766/api/vfs \
  -H "Content-Type: application/json" \
  -d '{"operation": "listDirectory", "args": ["/projects"]}'
```

#### 创建目录
```bash
curl -X POST http://localhost:8766/api/vfs \
  -H "Content-Type: application/json" \
  -d '{"operation": "mkdir", "args": ["/projects/我的项目", true]}'
```

#### 写入文件
```bash
curl -X POST http://localhost:8766/api/vfs \
  -H "Content-Type: application/json" \
  -d '{"operation": "writeFile", "args": ["/测试.txt", "Hello World"]}'
```

#### 读取文件
```bash
curl -X POST http://localhost:8766/api/vfs \
  -H "Content-Type: application/json" \
  -d '{"operation": "readFile", "args": ["/测试.txt"]}'
```

### 2. MCP WebSocket API

使用 MCP 客户端连接 `ws://localhost:8766/ws`，支持以下工具：

| 工具名 | 说明 |
|--------|------|
| `vfs_list_directory` | 列出目录内容 |
| `vfs_read_file` | 读取文件 |
| `vfs_write_file` | 写入文件 |
| `vfs_read_json` | 读取 JSON |
| `vfs_write_json` | 写入 JSON |
| `vfs_delete` | 删除文件/目录 |
| `vfs_move` | 移动/重命名 |
| `vfs_copy` | 复制文件 |
| `vfs_mkdir` | 创建目录 |
| `vfs_get_file_info` | 获取文件信息 |
| `vfs_search` | 搜索文件 |
| `vfs_search_by_type` | 按类型搜索 |
| `vfs_get_storage_info` | 获取存储信息 |
| `vfs_cd` | 切换目录 |
| `vfs_pwd` | 获取当前目录 |
| `vfs_exists` | 检查路径是否存在 |
| `vfs_create_project` | 创建视频项目 |
| `vfs_list_projects` | 列出所有项目 |

### 3. MCP 调用示例

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "vfs_list_directory",
    "arguments": {
      "path": "/projects"
    }
  }
}
```

响应：
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "[\n  {\n    \"name\": \"项目 1\",\n    \"path\": \"/projects/项目 1\",\n    \"isDirectory\": true,\n    \"isFile\": false\n  }\n]"
      }
    ]
  }
}
```

## 创建视频项目

使用 `vfs_create_project` 工具：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "vfs_create_project",
    "arguments": {
      "name": "我的纪录片",
      "config": {
        "pipeline": {
          "remove_keyword": "转场，然后",
          "margin": 0.2
        }
      }
    }
  }
}
```

这将创建：
```
/projects/我的纪录片/
├── 原始视频/
├── 剪辑视频/
├── 输出/
└── project.json
```

## 持久化说明

- 服务器每 30 秒自动保存虚拟文件系统到 JSON 文件
- 大文件（>1MB）或二进制文件（视频/音频）只保存元数据，不保存内容
- 重启服务器时会自动加载之前的状态
- 存储文件位置可通过 `VFS_STORAGE` 环境变量配置

## 优势

1. **避免路径问题** - 虚拟路径不受操作系统限制，Windows/macOS/Linux 通用
2. **结构清晰** - 预定义的中文目录结构，符合视频剪辑工作流
3. **安全可靠** - 不直接操作真实文件系统，避免误删重要文件
4. **易于测试** - 可以方便地创建测试数据，不影响真实环境
5. **MCP 兼容** - 标准 MCP 协议，可被任何 MCP 客户端调用

## 架构

```
┌─────────────────┐
│  MCP Client     │
│  (Codex/Claude) │
└────────┬────────┘
         │ WebSocket/HTTP
         v
┌─────────────────────────────────────┐
│  Virtual File Server                │
│  ┌───────────────┐  ┌─────────────┐ │
│  │  MCP Handler  │  │ HTTP Handler│ │
│  └───────┬───────┘  └──────┬──────┘ │
│          └──────────┬───────┘        │
│                     v                 │
│          ┌──────────────────┐        │
│          │ VirtualFileSystem│        │
│          │  (内存 +持久化)   │        │
│          └──────────────────┘        │
└─────────────────────────────────────┘
```

## 许可证

MIT