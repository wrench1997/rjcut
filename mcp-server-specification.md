# MCP 服务器功能格式规范研究

**协议版本**: 2025-11-25（草案）  
**来源**: https://mcpcn.com/specification/2025-11-25/server/

---

## 概述

服务器提供通过 MCP 为语言模型添加上下文的基本构建块。这些原语使客户端、服务器和语言模型之间能够进行丰富的交互：

| 原语 | 控制 | 描述 | 示例 |
|------|------|------|------|
| **提示** | 用户控制 | 由用户选择调用的交互式模板 | 斜杠命令、菜单选项 |
| **资源** | 应用程序控制 | 由客户端附加和管理的上下文数据 | 文件内容、git 历史 |
| **工具** | 模型控制 | 向 LLM 公开以采取行动的函数 | API POST 请求、文件写入 |

---

## 1. 提示 (Prompts)

### 1.1 概述

模型上下文协议 (MCP) 为服务器提供了向客户端公开提示模板的标准化方式。提示允许服务器提供结构化消息和与语言模型交互的指令。客户端可以发现可用的提示，检索其内容，并提供参数来自定义它们。

### 1.2 用户交互模型

提示被设计为 **用户控制**，意味着它们从服务器公开给客户端，目的是让用户能够明确选择它们使用。

通常，提示会通过用户界面中的用户发起命令触发，例如作为斜杠命令。

### 1.3 能力声明

支持提示的服务器 **必须** 在初始化期间声明 `prompts` 能力：

```json
{
  "capabilities": {
    "prompts": {
      "listChanged": true
    }
  }
}
```

`listChanged` 表示服务器是否会在可用提示列表变更时发出通知。

### 1.4 协议消息

#### 1.4.1 列出提示

要检索可用提示，客户端发送 `prompts/list` 请求。此操作支持分页。

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "prompts/list",
  "params": {
    "cursor": "可选的游标值"
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "prompts": [
      {
        "name": "code_review",
        "description": "要求 LLM 分析代码质量并提出改进建议",
        "arguments": [
          {
            "name": "code",
            "description": "要审查的代码",
            "required": true
          }
        ]
      }
    ],
    "nextCursor": "下一页游标"
  }
}
```

#### 1.4.2 获取提示

要检索特定提示，客户端发送 `prompts/get` 请求。参数可以通过补全 API 自动完成。

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "prompts/get",
  "params": {
    "name": "code_review",
    "arguments": {
      "code": "def hello():\n print('world')"
    }
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "description": "代码审查提示",
    "messages": [
      {
        "role": "user",
        "content": {
          "type": "text",
          "text": "请审查这段 Python 代码：\ndef hello():\n print('world')"
        }
      }
    ]
  }
}
```

#### 1.4.3 列表变更通知

当可用提示列表发生变化时，声明了 `listChanged` 能力的服务器 **应该** 发送通知：

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/prompts/list_changed"
}
```

### 1.5 消息流

```
Server → Client: prompts/list (提示列表)
Client → Server: prompts/get
Server → Client: 提示内容
[可选] Server → Client: notifications/prompts/list_changed
Client → Server: prompts/list (更新的提示)
```

### 1.6 数据类型

#### 1.6.1 提示定义

- `name`: 提示的唯一标识符
- `description`: 可选的人类可读描述
- `arguments`: 可选的自定义参数列表

#### 1.6.2 提示消息内容类型

**文本内容：**
```json
{
  "type": "text",
  "text": "消息的文本内容"
}
```

**图像内容：**
```json
{
  "type": "image",
  "data": "base64 编码的图像数据",
  "mimeType": "image/png"
}
```

**音频内容：**
```json
{
  "type": "audio",
  "data": "base64 编码的音频数据",
  "mimeType": "audio/wav"
}
```

**嵌入资源：**
```json
{
  "type": "resource",
  "resource": {
    "uri": "resource://example",
    "mimeType": "text/plain",
    "text": "资源内容"
  }
}
```

### 1.7 错误处理

| 错误类型 | 错误码 |
|----------|--------|
| 无效提示名称 | -32602 |
| 缺少必需参数 | -32602 |
| 内部错误 | -32603 |

### 1.8 安全考虑

实现 **必须** 仔细验证所有提示输入和输出，以防止注入攻击或未经授权访问资源。

---

## 2. 工具 (Tools)

### 2.1 概述

模型上下文协议 (MCP) 允许服务器公开可由语言模型调用的工具。工具使模型能够与外部系统交互，例如查询数据库、调用 API 或执行计算。每个工具由一个名称唯一标识，并包含描述其架构的元数据。

### 2.2 用户交互模型

MCP 中的工具设计为 **模型控制**，意味着语言模型可以基于其上下文理解和用户的提示自动发现和调用工具。

**安全建议：**
- 提供清晰表明哪些工具被公开给 AI 模型的 UI
- 在工具被调用时插入清晰的视觉指示器
- 向用户呈现操作确认提示，以确保人在循环中

### 2.3 能力声明

支持工具的服务器 **必须** 声明 `tools` 能力：

```json
{
  "capabilities": {
    "tools": {
      "listChanged": true
    }
  }
}
```

### 2.4 协议消息

#### 2.4.1 列出工具

要发现可用工具，客户端发送 `tools/list` 请求。此操作支持分页。

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {
    "cursor": "可选的游标值"
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "get_weather",
        "description": "获取某个位置的当前天气信息",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "城市名称或邮政编码"
            }
          },
          "required": ["location"]
        }
      }
    ],
    "nextCursor": "下一页游标"
  }
}
```

#### 2.4.2 调用工具

要调用工具，客户端发送 `tools/call` 请求：

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": {
      "location": "纽约"
    }
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "纽约当前天气：\n温度：72°F\n状况：局部多云"
      }
    ],
    "isError": false
  }
}
```

#### 2.4.3 列表变更通知

当可用工具列表发生变化时，声明了 `listChanged` 能力的服务器 **应该** 发送通知：

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed"
}
```

### 2.5 消息流

```
Server → Client: tools/list (工具列表)
Client → LLM: 工具选择
LLM → Client: tools/call
Client → Server: 调用工具
Server → Client: 工具结果
Client → LLM: 处理结果
[可选] Server → Client: notifications/tools/list_changed
```

### 2.6 数据类型

#### 2.6.1 工具定义

- `name`: 工具的唯一标识符
- `description`: 功能的人类可读描述
- `inputSchema`: 定义预期参数的 JSON Schema

#### 2.6.2 工具结果内容类型

**文本内容：**
```json
{
  "type": "text",
  "text": "工具结果文本"
}
```

**图像内容：**
```json
{
  "type": "image",
  "data": "base64 编码数据",
  "mimeType": "image/png"
}
```

**音频内容：**
```json
{
  "type": "audio",
  "data": "base64 编码的音频数据",
  "mimeType": "audio/wav"
}
```

**嵌入资源：**
```json
{
  "type": "resource",
  "resource": {
    "uri": "resource://example",
    "mimeType": "text/plain",
    "text": "资源内容"
  }
}
```

### 2.7 错误处理

工具使用两种错误报告机制：

**协议错误**（标准 JSON-RPC 错误）：
- 未知工具
- 无效参数
- 服务器错误

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

**工具执行错误**（在工具结果中报告）：
- API 失败
- 无效输入数据
- 业务逻辑错误

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "获取天气数据失败：API 速率限制已超出"
      }
    ],
    "isError": true
  }
}
```

### 2.8 安全考虑

**服务器必须：**
- 验证所有工具输入
- 实现适当的访问控制
- 限制工具调用频率
- 净化工具输出

**客户端应该：**
- 提示用户确认敏感操作
- 在调用服务器之前向用户显示工具输入，以避免恶意或意外的数据泄露
- 在传递给 LLM 之前验证工具结果
- 为工具调用实现超时
- 记录工具使用情况以便审计

---

## 3. 资源 (Resources)

### 3.1 概述

模型上下文协议 (MCP) 为服务器提供了向客户端公开资源的标准化方式。资源允许服务器共享为语言模型提供上下文的数据，如文件、数据库模式或应用程序特定信息。每个资源都由 URI 唯一标识。

### 3.2 用户交互模型

MCP 中的资源设计为 **应用程序驱动**，主机应用程序根据其需求决定如何整合上下文。

例如，应用程序可以：
- 通过 UI 元素在树形或列表视图中公开资源，供明确选择
- 允许用户搜索和过滤可用资源
- 基于启发式算法或 AI 模型的选择实现自动上下文包含

### 3.3 能力声明

支持资源的服务器 **必须** 声明 `resources` 能力：

```json
{
  "capabilities": {
    "resources": {
      "subscribe": true,
      "listChanged": true
    }
  }
}
```

该能力支持两个可选功能：
- `subscribe`: 客户端是否可以订阅以接收单个资源变更的通知
- `listChanged`: 服务器是否会在可用资源列表变更时发出通知

### 3.4 协议消息

#### 3.4.1 列出资源

要发现可用资源，客户端发送 `resources/list` 请求。此操作支持分页。

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "resources/list",
  "params": {
    "cursor": "可选的游标值"
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "resources": [
      {
        "uri": "file:///project/src/main.rs",
        "name": "main.rs",
        "description": "主应用程序入口点",
        "mimeType": "text/x-rust"
      }
    ],
    "nextCursor": "下一页游标"
  }
}
```

#### 3.4.2 读取资源

要检索资源内容，客户端发送 `resources/read` 请求：

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/read",
  "params": {
    "uri": "file:///project/src/main.rs"
  }
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "contents": [
      {
        "uri": "file:///project/src/main.rs",
        "mimeType": "text/x-rust",
        "text": "fn main() {\n println!(\"Hello world!\");\n}"
      }
    ]
  }
}
```

#### 3.4.3 资源模板

资源模板允许服务器使用 URI 模板公开参数化资源。

**请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/templates/list"
}
```

**响应：**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "resourceTemplates": [
      {
        "uriTemplate": "file:///{path}",
        "name": "项目文件",
        "description": "访问项目目录中的文件",
        "mimeType": "application/octet-stream"
      }
    ]
  }
}
```

#### 3.4.4 列表变更通知

当可用资源列表发生变化时，声明了 `listChanged` 能力的服务器 **应该** 发送通知：

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/list_changed"
}
```

#### 3.4.5 订阅

协议支持可选的资源变更订阅。

**订阅请求：**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/subscribe",
  "params": {
    "uri": "file:///project/src/main.rs"
  }
}
```

**更新通知：**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "file:///project/src/main.rs"
  }
}
```

### 3.5 消息流

```
Server → Client: resources/list (资源列表)
Client → Server: resources/read
Server → Client: 资源内容
Client → Server: resources/subscribe
Server → Client: 订阅确认
[当资源变更时] Server → Client: notifications/resources/updated
Client → Server: resources/read (更新后的内容)
```

### 3.6 数据类型

#### 3.6.1 资源定义

- `uri`: 资源的唯一标识符
- `name`: 人类可读的名称
- `description`: 可选的描述
- `mimeType`: 可选的 MIME 类型
- `size`: 可选的字节大小

#### 3.6.2 资源内容

**文本内容：**
```json
{
  "uri": "file:///example.txt",
  "mimeType": "text/plain",
  "text": "资源内容"
}
```

**二进制内容：**
```json
{
  "uri": "file:///example.png",
  "mimeType": "image/png",
  "blob": "base64 编码的数据"
}
```

### 3.7 常见 URI 方案

| 方案 | 用途 |
|------|------|
| `https://` | 用于表示网络上可用的资源 |
| `file://` | 用于标识行为类似文件系统的资源 |
| `git://` | Git 版本控制集成 |

### 3.8 错误处理

| 错误类型 | 错误码 |
|----------|--------|
| 资源未找到 | -32002 |
| 内部错误 | -32603 |

**错误示例：**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "error": {
    "code": -32002,
    "message": "资源未找到",
    "data": {
      "uri": "file:///nonexistent.txt"
    }
  }
}
```

### 3.9 安全考虑

- 服务器 **必须** 验证所有资源 URI
- **应该** 为敏感资源实现访问控制
- 二进制数据 **必须** 正确编码
- **应该** 在操作前检查资源权限

---

## 总结

MCP 服务器功能的三种原语各有特点：

| 特性 | 提示 | 资源 | 工具 |
|------|------|------|------|
| **控制方** | 用户 | 应用程序 | 模型 |
| **主要用途** | 预定义模板 | 上下文数据 | 执行动作 |
| **能力名称** | `prompts` | `resources` | `tools` |
| **列表方法** | `prompts/list` | `resources/list` | `tools/list` |
| **获取方法** | `prompts/get` | `resources/read` | `tools/call` |
| **变更通知** | `notifications/prompts/list_changed` | `notifications/resources/list_changed` | `notifications/tools/list_changed` |
| **订阅支持** | 否 | 是 (`resources/subscribe`) | 否 |

所有三种原语都支持：
- 分页（通过 `cursor` 和 `nextCursor`）
- 列表变更通知（可选）
- 多种内容类型（文本、图像、音频、嵌入资源）
- 标准 JSON-RPC 错误处理

---

*文档生成时间：2025 年*  
*基于 MCP 中文规范 2025-11-25 草案版本*