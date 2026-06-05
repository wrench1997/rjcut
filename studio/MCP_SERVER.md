# RJCut Studio MCP 服务器文档

## 概述

RJCut Studio 现已实现 **MCP (Model Context Protocol) 服务器**，允许外部 AI agent 通过标准 MCP 协议连接到 Studio，并调用视频编辑相关的工具。

## 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  外部 AI Agent  │────▶│  MCP 客户端      │────▶│  RJCut Studio   │
│  (Claude/其他)  │◀────│  (Agent 侧)      │◀────│  MCP 服务器     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              WebSocket
```

**RJCut Studio 作为 MCP 服务器**，提供以下能力：
- **工具 (Tools)** - 暴露视频编辑相关的可执行函数
- **资源 (Resources)** - 提供项目、文件等上下文数据
- **提示 (Prompts)** - 预定义的交互模板

## 快速开始

### 1. 在 Studio 中启用 MCP 服务器

```javascript
// 在 App.jsx 或主入口文件中
import { getMCPServer } from './api/mcpServer'

// 创建服务器实例
const mcpServer = getMCPServer()

// 设置上下文（注入依赖）
mcpServer.setContext({
  vfs: yourFileSystem,
  apiClient: yourApiClient,
  onProjectSwitch: (project) => { ... },
  onFileCreated: (path) => { ... }
})

// 注册内置工具、资源、提示
mcpServer.registerBuiltInTools({
  vfs: yourFileSystem,
  apiClient: yourApiClient,
  onProjectSwitch,
  onFileCreated
})
mcpServer.registerBuiltInResources({ vfs: yourFileSystem, currentProject })
mcpServer.registerBuiltInPrompts()

// 启动服务器（WebSocket 模式）
await mcpServer.listen(8001)

// 或者连接到外部 MCP 客户端
await mcpServer.connect('ws://localhost:3000/mcp')
```

### 2. 外部 Agent 连接示例

#### Claude Desktop 配置

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "rjcut-studio": {
      "url": "ws://localhost:8001/mcp"
    }
  }
}
```

#### 使用 MCP SDK 连接

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async with stdio_client(server_parameters) as (read, write):
    async with ClientSession(read, write) as session:
        # 初始化
        await session.initialize()
        
        # 列出工具
        tools = await session.list_tools()
        
        # 调用工具
        result = await session.call_tool("switch_project", {
            "projectPath": "/videos/my-project"
        })
```

## 可用工具

| 工具名称 | 描述 | 参数 |
|----------|------|------|
| `switch_project` | 切换到指定的视频项目目录 | `projectPath` (string) |
| `list_projects` | 列出所有可用的视频项目 | 无 |
| `list_directory` | 列出当前目录或指定目录的文件 | `path` (string, 可选) |
| `read_file` | 读取文件内容 | `filePath` (string) |
| `write_file` | 写入文件内容 | `filePath`, `content`, `contentType` |
| `search_scripts` | 搜索项目中的 JSON 脚本文件 | `projectPath` (string, 可选) |
| `get_api_status` | 获取后端 API 服务状态 | 无 |
| `create_draft_task` | 创建视频草稿生成任务 | `script`, `projectId` |
| `get_task_status` | 获取任务执行状态 | `taskId` |
| `list_digital_humans` | 获取可用的数字人列表 | `type` (common/custom/all) |

## MCP 协议消息格式

### 初始化

**客户端 → 服务器：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": {},
      "resources": {},
      "prompts": {}
    },
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  }
}
```

**服务器 → 客户端：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "prompts": { "listChanged": true },
      "resources": { "subscribe": true, "listChanged": true },
      "tools": { "listChanged": true }
    },
    "serverInfo": {
      "name": "rjcut-studio-mcp-server",
      "version": "1.0.0"
    }
  }
}
```

### 列出工具

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {
    "cursor": "可选的游标"
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "switch_project",
        "description": "切换到指定的视频项目目录",
        "inputSchema": {
          "type": "object",
          "properties": {
            "projectPath": {
              "type": "string",
              "description": "项目路径，例如 /videos/my-project"
            }
          },
          "required": ["projectPath"]
        }
      }
    ],
    "nextCursor": "下一页游标"
  }
}
```

### 调用工具

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "switch_project",
    "arguments": {
      "projectPath": "/videos/my-project"
    }
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "✅ 已切换到项目：my-project\n路径：/videos/my-project"
      }
    ],
    "isError": false
  }
}
```

## 自定义工具

可以通过 `registerTool` 方法注册自定义工具：

```javascript
mcpServer.registerTool({
  name: 'my_custom_tool',
  description: '我的自定义工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '参数 1 描述' }
    },
    required: ['param1']
  },
  handler: async ({ param1 }, context) => {
    // context 包含 vfs, apiClient 等注入的依赖
    const result = await context.vfs.someOperation(param1)
    return `执行结果：${result}`
  }
})
```

## 错误处理

### 工具执行错误

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "执行失败：VFS 未初始化"
      }
    ],
    "isError": true
  }
}
```

### 协议错误

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "error": {
    "code": -32602,
    "message": "未知工具：invalid_tool_name"
  }
}
```

## 连接模式

### 1. WebSocket 服务器模式

Studio 作为 WebSocket 服务器监听连接：

```javascript
await mcpServer.listen(8001)
// MCP 客户端连接到 ws://localhost:8001/mcp
```

### 2. WebSocket 客户端模式

Studio 主动连接到外部 MCP 客户端：

```javascript
await mcpServer.connect('ws://localhost:3000/mcp')
```

### 3. postMessage 模式（浏览器内嵌）

通过 `window.postMessage` 与父窗口/iframe 通信：

```javascript
// 父窗口发送
iframe.contentWindow.postMessage({
  type: 'mcp',
  data: { jsonrpc: '2.0', method: 'tools/list', id: 1 }
}, '*')

// Studio 接收并响应
window.addEventListener('message', (event) => {
  if (event.data.type === 'mcp') {
    // 处理 MCP 消息
  }
})
```

## 安全考虑

1. **连接验证** - 验证 WebSocket 连接来源
2. **输入验证** - 所有工具输入在执行前都经过验证
3. **访问控制** - 工具只能访问授权的资源
4. **审计日志** - 记录所有工具调用以便审计

## 调试

在浏览器控制台中查看 MCP 日志：

```javascript
// MCP 服务器日志
console.log('[MCP Server] 收到消息:', message)
console.log('[MCP Server] 发送消息:', message)
console.log('[MCP Server] 工具已注册:', tool.name)
```

## 参考

- [MCP 规范文档](../mcp-server-specification.md)
- [MCP 服务器源码](./src/api/mcpServer.js)
- [MCP 官方文档](https://modelcontextprotocol.io/)