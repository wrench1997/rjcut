# RJCut Studio - Electron MCP 服务器使用指南

## 概述

RJCut Studio 现已集成 **本地 MCP 服务器**，直接在 Electron 主进程中运行，提供稳定可靠的本地 AI 代理服务。

## 架构优势

### 之前的架构（浏览器模式）
```
外部 MCP Client → MCP Proxy (独立进程) → WebSocket → 浏览器中的 MCP Server
                                              ↑
                                      依赖浏览器运行状态
```

**问题：**
- 浏览器关闭后服务中断
- 需要额外的 MCP Proxy 进程
- 连接不稳定，容易断开
- 依赖浏览器 IndexedDB

### 现在的架构（Electron 模式）
```
外部 MCP Client (Codex/Claude) → WebSocket → Electron MCP Server (主进程)
                                              ↓
                                       直接访问本地文件系统
```

**优势：**
- ✅ **稳定运行**：Electron 主进程常驻，不依赖浏览器窗口状态
- ✅ **原生文件访问**：直接读写本地文件，无需 IndexedDB 中转
- ✅ **简化部署**：无需独立 MCP Proxy 进程
- ✅ **更好性能**：减少网络跳数，直接 IPC 通信

## 快速开始

### 1. 启动 MCP 服务器

在 RJCut Studio 应用中：

```javascript
// 通过 Electron API 启动
const status = await window.electronAPI.mcpStart(8001)
console.log('MCP 服务器状态:', status)
```

或在应用界面中点击 "启动 MCP 服务器" 按钮。

### 2. 配置外部 MCP Client

#### Claude Desktop 配置

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "rjcut-studio": {
      "url": "ws://localhost:8001/ws",
      "transport": "websocket"
    }
  }
}
```

#### Codex 配置

```json
{
  "mcp": {
    "servers": [
      {
        "name": "rjcut-studio",
        "url": "ws://localhost:8001/ws",
        "type": "websocket"
      }
    ]
  }
}
```

### 3. 测试连接

```bash
# 检查服务器状态
curl http://localhost:8001/health

# 预期输出：
# {"status":"ok","running":true,"clients":0}
```

## 可用工具 (Tools)

### 文件系统工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `fs_list` | 列出目录内容 | `path`: 目录路径 |
| `fs_read` | 读取文件内容 | `path`: 文件路径 |
| `fs_write` | 写入文件内容 | `path`, `content` |
| `fs_delete` | 删除文件/目录 | `path`, `recursive` |
| `fs_move` | 移动/重命名 | `from`, `to` |
| `fs_copy` | 复制文件 | `from`, `to` |

### 项目管理工具

| 工具名 | 描述 | 参数 |
|--------|------|------|
| `project_list` | 列出所有项目 | 无 |
| `project_create` | 创建新项目 | `name`, `config` |

## 使用示例

### 示例 1：列出项目

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "project_list"
  }
}
```

### 示例 2：读取文件

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "fs_read",
    "arguments": {
      "path": "/my-video/文案/script.json"
    }
  }
}
```

### 示例 3：创建项目

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "project_create",
    "arguments": {
      "name": "新视频项目",
      "config": {
        "pipeline": {
          "remove_keyword": "转场",
          "margin": 0.15
        }
      }
    }
  }
}
```

## API 参考

### Electron API (渲染进程调用)

```javascript
// 启动 MCP 服务器
await window.electronAPI.mcpStart(port = 8001)

// 停止 MCP 服务器
await window.electronAPI.mcpStop()

// 获取状态
const status = await window.electronAPI.mcpGetStatus()
// 返回：{ running: true, status: {...}, tools: [...], ... }
```

### MCP 协议端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/ws` | WebSocket | MCP 消息传输 |
| `/health` | GET | 健康检查 |
| `/register` | POST | 注册客户端 |
| `/message` | POST | HTTP 消息传输 |
| `/events` | GET | SSE 事件流 |

## 故障排除

### 问题 1：端口被占用

**错误：** `Error: listen EADDRINUSE: address already in use :::8001`

**解决：**
```javascript
// 使用不同端口
await window.electronAPI.mcpStart(8002)
```

### 问题 2：无法连接

**检查：**
1. 确认 MCP 服务器已启动
2. 检查防火墙设置
3. 验证 WebSocket URL 是否正确

### 问题 3：工具调用失败

**调试：**
```javascript
// 查看服务器状态
const status = await window.electronAPI.mcpGetStatus()
console.log('已注册工具:', status.tools)

// 检查工具是否存在
console.log('fs_list' in status.tools)
```

## 安全考虑

### 路径验证
所有文件操作都经过路径验证，确保在允许的根目录内：
- 用户文档目录
- 用户视频目录

### 访问控制
- 支持 CORS（开发模式）
- 可配置允许的客户端
- 操作日志记录

## 性能优化

### 建议配置
- 大文件操作使用流式传输
- 批量操作使用并发限制
- 定期清理操作日志

## 下一步计划

- [ ] 支持 MCP OAuth 认证
- [ ] 添加更多视频编辑工具
- [ ] 支持远程 MCP 客户端
- [ ] 添加工具调用统计
- [ ] 支持自定义工具注册

## 技术支持

如有问题，请查看：
- Electron 主进程日志
- 渲染进程控制台
- MCP 服务器状态

---

**RJCut Studio** - 专业的视频编辑工具
