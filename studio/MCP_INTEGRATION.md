# MCP 协议集成文档

## 概述

RJCut Studio 现已集成 **MCP (Model Context Protocol)** 协议支持，使 AI 助手能够通过标准化工具调用接口执行实际操作。

## 架构

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI 模型       │────▶│  MCP 客户端      │────▶│  工具处理器     │
│   (OpenClaw)    │◀────│  (mcpClient.js)  │◀────│  (vfs/apiClient)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## 核心组件

### 1. MCP 客户端 (`studio/src/api/mcpClient.js`)

实现了完整的 MCP 规范三种原语：

| 原语 | 控制方 | 用途 | 示例 |
|------|--------|------|------|
| **工具 (Tools)** | 模型控制 | 向 AI 公开可执行的函数 | 切换项目、读取文件、创建任务 |
| **资源 (Resources)** | 应用程序控制 | 提供上下文数据 | 当前项目信息、文件列表 |
| **提示 (Prompts)** | 用户控制 | 预定义的交互模板 | 代码审查、脚本生成 |

### 2. 已注册工具列表

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

### 3. 已注册资源

| 资源 URI | 名称 | 描述 |
|----------|------|------|
| `rjcut://current-project` | 当前项目 | 当前选中的视频项目信息 |
| `rjcut://project-files` | 项目文件列表 | 当前项目中的所有文件 |
| `rjcut://scripts` | 视频脚本 | 项目中的所有脚本文件 |

### 4. 已注册提示

| 提示名称 | 描述 | 参数 |
|----------|------|------|
| `code_review` | 要求 AI 分析视频脚本并提出改进建议 | `script` |
| `project_init` | 帮助初始化一个新的视频项目 | `projectName`, `projectType` |
| `script_generate` | 根据主题生成视频脚本 | `topic`, `duration`, `style` |

## 工具调用协议

AI 模型通过以下格式触发工具调用：

```
[TOOL_CALL: tool_name] {"param1": "value1", "param2": "value2"}
```

### 示例

**切换项目：**
```
[TOOL_CALL: switch_project] {"projectPath": "/videos/my-project"}
```

**列出目录：**
```
[TOOL_CALL: list_directory] {"path": "/videos/my-project"}
```

**读取文件：**
```
[TOOL_CALL: read_file] {"filePath": "/videos/my-project/script.json"}
```

**创建草稿任务：**
```
[TOOL_CALL: create_draft_task] {"script": "{\"scenes\":[...]}", "projectId": "proj_123"}
```

## 使用指南

### 1. 启用 MCP

MCP 客户端在 AI Chat 组件加载时自动初始化：

```javascript
// AIChat.jsx 中的初始化代码
useEffect(() => {
  const initMCP = async () => {
    const mcpClient = getMCPClient({ serverUrl: 'ws://localhost:8001/mcp' })
    
    // 注册内置工具
    mcpClient.registerBuiltInTools({ vfs, onProjectSwitch, onFileCreated, apiClient })
    mcpClient.registerBuiltInResources({ vfs, currentProject })
    mcpClient.registerBuiltInPrompts()
    
    setMcpConnected(true)
  }
  initMCP()
}, [])
```

### 2. 查看 MCP 状态

AI Chat 界面顶部显示 MCP 连接状态和可用工具：

- ✅ **MCP 已连接** - 绿色状态，显示可用工具数量
- 🔌 **MCP 未连接** - 灰色状态（后端服务未启动）

### 3. 自定义工具

可以通过 `registerTool` 方法注册自定义工具：

```javascript
mcpClient.registerTool({
  name: 'my_custom_tool',
  description: '我的自定义工具描述',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '参数 1 描述' }
    },
    required: ['param1']
  },
  handler: async ({ param1 }) => {
    // 执行逻辑
    return `执行结果：${param1}`
  }
})
```

## 错误处理

### 工具执行错误

工具执行失败时返回：
```json
{
  "content": [{ "type": "text", "text": "执行失败：错误详情" }],
  "isError": true
}
```

### 协议错误

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32602,
    "message": "未知工具：invalid_tool_name"
  }
}
```

## 安全考虑

1. **输入验证** - 所有工具输入在执行前都经过验证
2. **访问控制** - 工具只能访问授权的资源
3. **错误隔离** - 工具执行错误不会影响主应用
4. **用户确认** - 敏感操作（如删除）需要用户确认

## 调试

在浏览器控制台中查看 MCP 日志：

```javascript
// 启用详细日志
console.log('[MCP] 发送消息:', message)
console.log('[MCP] 收到消息:', message)
console.log('[AIChat] MCP 初始化完成，已注册工具:', tools)
```

## 未来扩展

1. **WebSocket 服务端** - 实现完整的 MCP 服务器端，支持远程 AI 连接
2. **更多工具** - 添加视频编辑、音频处理等专业工具
3. **资源订阅** - 实现资源变更的实时通知
4. **提示模板市场** - 允许用户分享和导入提示模板

## 参考

- [MCP 规范文档](../mcp-server-specification.md)
- [MCP 客户端源码](./src/api/mcpClient.js)
- [AI Chat 组件](./src/components/AIChat.jsx)