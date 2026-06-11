/**
 * MCP 服务器 - 为 RJCut Studio 提供 MCP 协议支持
 * 基于 MCP 规范 2025-11-25 实现
 * 
 * 此服务器允许外部 AI agent 通过 MCP 协议连接到 Studio，
 * 并调用视频编辑相关的工具。
 */

// =====================================================
// MCP 服务器类
// =====================================================
export class MCPServer {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || null
    this.ws = null
    this.requestId = 0
    this.pendingRequests = new Map()
    
    // 服务器能力声明
    this.capabilities = {
      prompts: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      tools: { listChanged: true }
    }
    
    // 服务器信息
    this.serverInfo = {
      name: 'rjcut-studio-mcp-server',
      version: '1.0.0'
    }
    
    // 已注册的工具、资源、提示
    this.tools = new Map()
    this.resources = new Map()
    this.prompts = new Map()
    
    // 事件处理器
    this.eventHandlers = new Map()
    
    // 连接状态
    this.connected = false
    this.initialized = false
    
    // 上下文（由外部注入）
    this.context = {}
  }

  // =====================================================
  // 连接管理
  // =====================================================
  
/**
   * 作为服务器监听连接（通过 WebSocket 或 HTTP 长连接到 MCP Proxy）
   * 
   * 架构说明：
   * 外部 Codex/MCP Client -> WebSocket -> MCP Proxy (Node.js:8001) -> WebSocket/SSE -> 浏览器中的 MCP Server
   * 
   * @param {number} port - MCP Proxy 端口（默认 8001）
   * @param {string} proxyUrl - MCP Proxy URL（可选）
   * @param {boolean} useWebSocket - 是否使用 WebSocket 长连接（默认 true，推荐）
   */
  async listen(port = 8001, proxyUrl = null, useWebSocket = true) {
    return new Promise((resolve, reject) => {
      try {
        const proxy = proxyUrl || `http://localhost:${port}`
        this.proxyUrl = proxy
        // 使用固定 clientId 以便外部客户端（如 Codex）可以连接
        // 如果需要多个实例，可以改为随机：'studio_' + Math.random().toString(36).substring(2, 15)
        this.clientId = process.env.MCP_CLIENT_ID || 'studio'
        
        // 注册到 MCP Proxy
        this._registerToProxy(proxy).then(() => {
          this.connected = true
          console.log('[MCP Server] 已连接到 MCP Proxy:', proxy)
          console.log('[MCP Server] 客户端 ID:', this.clientId)
          
          // 优先使用 WebSocket 长连接（推荐，更稳定），备选 SSE 轮询
          if (useWebSocket) {
            this._connectWebSocket(proxy).then(resolve).catch(reject)
          } else {
            this._startPolling(proxy)
            resolve()
          }
        }).catch(reject)
      } catch (error) {
        reject(error)
      }
    })
  }

async _registerToProxy(proxyUrl) {
    const response = await fetch(`${proxyUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: this.clientId })
    })
    
    if (!response.ok) {
      throw new Error(`注册失败：${response.status}`)
    }
    
    const data = await response.json()
    console.log('[MCP Server] 注册成功:', data)
  }

_startPolling(proxyUrl) {
    const poll = async () => {
      if (!this.connected) return
      
      try {
        // 通过 EventSource 接收 SSE 消息
        const eventSource = new EventSource(`${proxyUrl}/events?clientId=${this.clientId}`)
        
        eventSource.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('[MCP Server] 收到 Proxy 转发消息:', message)
            this._handleMessage({ data: event.data })
          } catch (e) {
            console.error('[MCP Server] SSE 消息解析失败:', e)
          }
        }
        
        eventSource.onerror = () => {
          console.warn('[MCP Server] SSE 连接断开，尝试重连...')
          eventSource.close()
          setTimeout(poll, 1000)
        }
        
        this._eventSource = eventSource
      } catch (e) {
        console.error('[MCP Server] 轮询失败:', e)
        setTimeout(poll, 1000)
      }
    }
    
    poll()
  }

  /**
   * 通过 WebSocket 长连接到 MCP Proxy（推荐方式）
   */
  async _connectWebSocket(proxyUrl) {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${proxyUrl.replace('http://', 'ws://')}/ws?clientId=${this.clientId}&role=server`
        this.ws = new WebSocket(wsUrl)
        
        this.ws.onopen = () => {
          console.log('[MCP Server] WebSocket 长连接已建立')
          resolve()
        }
        
        this.ws.onclose = () => {
          console.warn('[MCP Server] WebSocket 连接断开，尝试重连...')
          this.connected = false
          setTimeout(() => {
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
              this._connectWebSocket(proxyUrl).catch(console.error)
            }
          }, 1000)
        }
        
        this.ws.onerror = (error) => {
          console.error('[MCP Server] WebSocket 错误:', error)
          reject(error)
        }
        
        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            console.log('[MCP Server] 收到 Proxy 转发消息 (WebSocket):', message)
            this._handleMessage({ data: event.data })
          } catch (e) {
            console.error('[MCP Server] WebSocket 消息解析失败:', e)
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 连接到 MCP 客户端（WebSocket 模式）
   */
  async connect(clientUrl) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(clientUrl)
        
        this.ws.onopen = () => {
          this.connected = true
          console.log('[MCP Server] 已连接到 MCP 客户端')
          resolve()
        }

        this.ws.onclose = () => {
          this.connected = false
          console.log('[MCP Server] 连接已关闭')
        }

        this.ws.onerror = (error) => {
          console.error('[MCP Server] 连接错误:', error)
          reject(error)
        }

        this.ws.onmessage = (event) => {
          this._handleMessage({ data: event.data })
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
    this.initialized = false
  }

  /**
   * 关闭服务器（disconnect 的别名，用于清理）
   */
  close() {
    this.disconnect()
  }

  // =====================================================
  // 消息处理
  // =====================================================
  
  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data)
      console.log('[MCP Server] 收到消息:', message)
      
      // 处理不同类型的消息
      switch (message.method) {
        case 'initialize':
          this._handleInitialize(message)
          break
        case 'tools/list':
          this._handleToolsList(message)
          break
        case 'tools/call':
          this._handleToolsCall(message)
          break
        case 'resources/list':
          this._handleResourcesList(message)
          break
        case 'resources/read':
          this._handleResourcesRead(message)
          break
        case 'prompts/list':
          this._handlePromptsList(message)
          break
        case 'prompts/get':
          this._handlePromptsGet(message)
          break
        default:
          this._sendError(message.id, -32601, `未知方法：${message.method}`)
      }
    } catch (error) {
      console.error('[MCP Server] 消息处理失败:', error)
    }
  }

  async _send(message) {
    if (!this.connected) {
      console.warn('[MCP Server] 未连接，无法发送消息')
      return
    }

    const messageStr = JSON.stringify(message)
    console.log('[MCP Server] 发送消息:', message)

    if (this.ws) {
      this.ws.send(messageStr)
    } else if (this.proxyUrl) {
      // 通过 HTTP POST 发送到 Proxy
      try {
        await fetch(`${this.proxyUrl}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: messageStr
        })
      } catch (e) {
        console.error('[MCP Server] 发送到 Proxy 失败:', e)
      }
    } else {
      // 通过 postMessage 发送（iframe/父窗口通信）
      window.postMessage({ type: 'mcp', data: message }, '*')
    }
  }

  _sendResponse(id, result) {
    this._send({
      jsonrpc: '2.0',
      id,
      result
    })
  }

  _sendError(id, code, message, data = null) {
    this._send({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data && { data })
      }
    })
  }

  _sendNotification(method, params = {}) {
    this._send({
      jsonrpc: '2.0',
      method,
      params
    })
  }

  // =====================================================
  // 初始化处理
  // =====================================================
  
  _handleInitialize(message) {
    const { params } = message
    
    // 保存客户端信息
    this.clientInfo = params?.clientInfo
    
    // 标记已初始化
    this.initialized = true
    
    // 发送初始化响应
    this._sendResponse(message.id, {
      protocolVersion: '2025-11-25',
      capabilities: this.capabilities,
      serverInfo: this.serverInfo
    })

    console.log('[MCP Server] 初始化完成，客户端:', this.clientInfo)
  }

  // =====================================================
  // 工具 (Tools) 处理
  // =====================================================

  /**
   * 注册工具
   */
  registerTool(tool) {
    if (!tool.name || !tool.handler) {
      throw new Error('工具必须有 name 和 handler')
    }
    
    this.tools.set(tool.name, {
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {
        type: 'object',
        properties: tool.parameters || {},
        required: tool.required || []
      },
      handler: tool.handler
    })

    // 通知客户端工具列表已变更
    if (this.initialized && this.capabilities.tools.listChanged) {
      this._sendNotification('notifications/tools/list_changed')
    }

    console.log('[MCP Server] 工具已注册:', tool.name)
    return () => this.unregisterTool(tool.name)
  }

  /**
   * 注销工具
   */
  unregisterTool(toolName) {
    if (this.tools.delete(toolName)) {
      console.log('[MCP Server] 工具已注销:', toolName)
      
      if (this.initialized && this.capabilities.tools.listChanged) {
        this._sendNotification('notifications/tools/list_changed')
      }
    }
  }

  _handleToolsList(message) {
    const { cursor, limit = 50 } = message.params || {}
    const startIndex = cursor ? parseInt(cursor) : 0
    const endIndex = startIndex + limit
    
    const toolsList = Array.from(this.tools.values())
    const tools = toolsList.slice(startIndex, endIndex).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))

    this._sendResponse(message.id, {
      tools,
      nextCursor: endIndex < toolsList.length ? String(endIndex) : undefined
    })
  }

  async _handleToolsCall(message) {
    const { name, arguments: args } = message.params || {}
    
    const tool = this.tools.get(name)
    if (!tool) {
      this._sendError(message.id, -32602, `未知工具：${name}`)
      return
    }

    try {
      const result = await tool.handler(args, this.context)
      this._sendResponse(message.id, {
        content: Array.isArray(result) ? result : [{ type: 'text', text: String(result) }],
        isError: false
      })
    } catch (error) {
      this._sendResponse(message.id, {
        content: [{ type: 'text', text: `执行失败：${error.message}` }],
        isError: true
      })
    }
  }

  // =====================================================
  // 资源 (Resources) 处理
  // =====================================================

  /**
   * 注册资源
   */
  registerResource(resource) {
    if (!resource.uri || !resource.handler) {
      throw new Error('资源必须有 uri 和 handler')
    }

    this.resources.set(resource.uri, {
      uri: resource.uri,
      name: resource.name || resource.uri,
      description: resource.description || '',
      mimeType: resource.mimeType || 'text/plain',
      handler: resource.handler
    })

    // 通知客户端资源列表已变更
    if (this.initialized && this.capabilities.resources.listChanged) {
      this._sendNotification('notifications/resources/list_changed')
    }

    console.log('[MCP Server] 资源已注册:', resource.uri)
    return () => this.unregisterResource(resource.uri)
  }

  /**
   * 注销资源
   */
  unregisterResource(uri) {
    if (this.resources.delete(uri)) {
      console.log('[MCP Server] 资源已注销:', uri)
      
      if (this.initialized && this.capabilities.resources.listChanged) {
        this._sendNotification('notifications/resources/list_changed')
      }
    }
  }

  _handleResourcesList(message) {
    const { cursor, limit = 50 } = message.params || {}
    const startIndex = cursor ? parseInt(cursor) : 0
    const endIndex = startIndex + limit
    
    const resourcesList = Array.from(this.resources.values())
    const resources = resourcesList.slice(startIndex, endIndex).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }))

    this._sendResponse(message.id, {
      resources,
      nextCursor: endIndex < resourcesList.length ? String(endIndex) : undefined
    })
  }

  async _handleResourcesRead(message) {
    const { uri } = message.params || {}
    
    const resource = this.resources.get(uri)
    if (!resource) {
      this._sendError(message.id, -32002, '资源未找到', { uri })
      return
    }

    try {
      const content = await resource.handler(this.context)
      this._sendResponse(message.id, {
        contents: [{
          uri,
          mimeType: resource.mimeType,
          ...content
        }]
      })
    } catch (error) {
      this._sendError(message.id, -32603, `读取资源失败：${error.message}`)
    }
  }

  // =====================================================
  // 提示 (Prompts) 处理
  // =====================================================

  /**
   * 注册提示
   */
  registerPrompt(prompt) {
    if (!prompt.name) {
      throw new Error('提示必须有 name')
    }

    this.prompts.set(prompt.name, {
      name: prompt.name,
      description: prompt.description || '',
      arguments: prompt.arguments || [],
      messages: prompt.messages || [],
      handler: prompt.handler
    })

    // 通知客户端提示列表已变更
    if (this.initialized && this.capabilities.prompts.listChanged) {
      this._sendNotification('notifications/prompts/list_changed')
    }

    console.log('[MCP Server] 提示已注册:', prompt.name)
    return () => this.unregisterPrompt(prompt.name)
  }

  /**
   * 注销提示
   */
  unregisterPrompt(name) {
    if (this.prompts.delete(name)) {
      console.log('[MCP Server] 提示已注销:', name)
      
      if (this.initialized && this.capabilities.prompts.listChanged) {
        this._sendNotification('notifications/prompts/list_changed')
      }
    }
  }

  _handlePromptsList(message) {
    const { cursor, limit = 50 } = message.params || {}
    const startIndex = cursor ? parseInt(cursor) : 0
    const endIndex = startIndex + limit
    
    const promptsList = Array.from(this.prompts.values())
    const prompts = promptsList.slice(startIndex, endIndex).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }))

    this._sendResponse(message.id, {
      prompts,
      nextCursor: endIndex < promptsList.length ? String(endIndex) : undefined
    })
  }

  async _handlePromptsGet(message) {
    const { name, arguments: args } = message.params || {}
    
    const prompt = this.prompts.get(name)
    if (!prompt) {
      this._sendError(message.id, -32602, `无效提示：${name}`)
      return
    }

    try {
      let result
      if (prompt.handler) {
        result = await prompt.handler(args, this.context)
      } else {
        result = {
          description: prompt.description,
          messages: prompt.messages
        }
      }
      
      this._sendResponse(message.id, result)
    } catch (error) {
      this._sendError(message.id, -32603, `获取提示失败：${error.message}`)
    }
  }

  // =====================================================
  // 通知
  // =====================================================

  notifyToolsListChanged() {
    if (this.capabilities.tools.listChanged) {
      this._sendNotification('notifications/tools/list_changed')
    }
  }

  notifyResourcesListChanged() {
    if (this.capabilities.resources.listChanged) {
      this._sendNotification('notifications/resources/list_changed')
    }
  }

  notifyPromptsListChanged() {
    if (this.capabilities.prompts.listChanged) {
      this._sendNotification('notifications/prompts/list_changed')
    }
  }

  notifyResourceUpdated(uri) {
    this._sendNotification('notifications/resources/updated', { uri })
  }

  // =====================================================
  // 设置上下文
  // =====================================================
  
  setContext(context) {
    this.context = { ...this.context, ...context }
  }

  // =====================================================
  // 注册 RJCut Studio 内置工具
  // =====================================================

  registerBuiltInTools(context = {}) {
    const { vfs, apiClient, onProjectSwitch, onFileCreated } = context

    // 1. 切换项目
    this.registerTool({
      name: 'switch_project',
      description: '切换到指定的视频项目目录',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: '项目路径，例如 /videos/my-project'
          }
        },
        required: ['projectPath']
      },
      handler: async ({ projectPath }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        vfs.cd(projectPath)
        const projectName = projectPath.split('/').pop()
        onProjectSwitch?.({ name: projectName, path: projectPath })
        return `✅ 已切换到项目：${projectName}\n路径：${projectPath}`
      }
    })

    // 2. 列出项目
    this.registerTool({
      name: 'list_projects',
      description: '列出所有可用的视频项目',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        if (!vfs) throw new Error('VFS 未初始化')
        const projects = await vfs.getVideoProjects()
        if (projects.length === 0) {
          return '📂 当前没有任何项目'
        }
        return projects.map((p, i) => `${i + 1}. **${p.name}** - ${p.path}`).join('\n')
      }
    })

    // 3. 列出目录文件
    this.registerTool({
      name: 'list_directory',
      description: '列出当前目录或指定目录的文件',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '目录路径（可选，默认为当前目录）'
          }
        },
        required: []
      },
      handler: async ({ path } = {}) => {
        if (!vfs) throw new Error('VFS 未初始化')
        if (path) vfs.cd(path)
        const items = vfs.listDirectory().slice(0, 20)
        if (items.length === 0) {
          return '📂 目录为空'
        }
        return items.map(item => 
          `${item.isDirectory ? '📁' : '📄'} ${item.name}${item.size ? ` (${(item.size / 1024).toFixed(1)} KB)` : ''}`
        ).join('\n')
      }
    })

    // 4. 读取文件内容
    this.registerTool({
      name: 'read_file',
      description: '读取文件内容',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件路径'
          }
        },
        required: ['filePath']
      },
      handler: async ({ filePath }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        const content = await vfs.readFile(filePath)
        if (typeof content === 'string') {
          return content
        }
        return `[二进制文件，大小：${content.byteLength} 字节]`
      }
    })

    // 5. 写入文件
    this.registerTool({
      name: 'write_file',
      description: '写入文件内容',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件路径'
          },
          content: {
            type: 'string',
            description: '文件内容'
          },
          contentType: {
            type: 'string',
            description: '内容类型 (可选)',
            default: 'text/plain'
          }
        },
        required: ['filePath', 'content']
      },
      handler: async ({ filePath, content, contentType = 'text/plain' }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        await vfs.writeFile(filePath, content, { type: contentType })
        onFileCreated?.(filePath)
        return `✅ 文件已写入：${filePath}`
      }
    })

    // 6. 搜索 JSON 脚本
    this.registerTool({
      name: 'search_scripts',
      description: '搜索项目中的 JSON 脚本文件',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: '项目路径（可选，默认为当前项目）'
          }
        },
        required: []
      },
      handler: async ({ projectPath } = {}) => {
        if (!vfs) throw new Error('VFS 未初始化')
        const jsonFiles = vfs.searchJSON()
        if (projectPath) {
          return jsonFiles.filter(f => f.path.startsWith(projectPath))
        }
        return jsonFiles.map(f => `📄 ${f.path}`).join('\n') || '未找到脚本文件'
      }
    })

    // 7. 获取 API 状态
    this.registerTool({
      name: 'get_api_status',
      description: '获取后端 API 服务状态',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        if (!apiClient) throw new Error('API 客户端未初始化')
        try {
          const response = await apiClient.get('/v1/merchant/info')
          return `✅ API 服务正常\n商户：${response.data?.merchant?.name || '未知'}`
        } catch (error) {
          return `❌ API 服务异常：${error.message}`
        }
      }
    })

    // 8. 创建草稿任务
    this.registerTool({
      name: 'create_draft_task',
      description: '创建视频草稿生成任务',
      inputSchema: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: '视频脚本内容 (JSON 格式)'
          },
          projectId: {
            type: 'string',
            description: '项目 ID'
          }
        },
        required: ['script']
      },
      handler: async ({ script, projectId }) => {
        if (!apiClient) throw new Error('API 客户端未初始化')
        const payload = {
          script: typeof script === 'string' ? JSON.parse(script) : script,
          project_id: projectId
        }
        const response = await apiClient.post('/v1/tasks/agent-draft', payload)
        return `✅ 草稿任务已创建\n任务 ID: ${response.data?.task_id}`
      }
    })

    // 9. 获取任务状态
    this.registerTool({
      name: 'get_task_status',
      description: '获取任务执行状态',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: '任务 ID'
          }
        },
        required: ['taskId']
      },
      handler: async ({ taskId }) => {
        if (!apiClient) throw new Error('API 客户端未初始化')
        const response = await apiClient.get(`/v1/tasks/${taskId}`)
        const data = response.data
        return `任务状态：${data.status}\n进度：${data.progress || 0}%\n${data.message || ''}`
      }
    })

    // 10. 获取数字人列表
    this.registerTool({
      name: 'list_digital_humans',
      description: '获取可用的数字人列表',
      inputSchema: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '数字人类型：common 或 custom',
            enum: ['common', 'custom', 'all'],
            default: 'all'
          }
        },
        required: []
      },
      handler: async ({ type = 'all' } = {}) => {
        if (!apiClient) throw new Error('API 客户端未初始化')
        const results = []
        if (type === 'all' || type === 'common') {
          const common = await apiClient.get('/v1/dh/persons/common')
          results.push(...(common.data?.persons || []))
        }
        if (type === 'all' || type === 'custom') {
          const custom = await apiClient.get('/v1/dh/persons/custom')
          results.push(...(custom.data?.persons || []))
        }
        return results.map((p, i) => `${i + 1}. **${p.name}** (ID: ${p.id})`).join('\n') || '暂无数字人'
      }
    })

    // 11. 移动/重命名文件
    this.registerTool({
      name: 'move_file',
      description: '移动或重命名文件/目录',
      inputSchema: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: '源路径'
          },
          to: {
            type: 'string',
            description: '目标路径'
          }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        await vfs.move(from, to)
        return `✅ 文件已移动：${from} -> ${to}`
      }
    })

    // 12. 删除文件
    this.registerTool({
      name: 'delete_file',
      description: '删除文件或目录',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件/目录路径'
          },
          recursive: {
            type: 'boolean',
            description: '是否递归删除目录（默认 false）',
            default: false
          }
        },
        required: ['filePath']
      },
      handler: async ({ filePath, recursive = false }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        await vfs.delete(filePath, recursive)
        return `✅ 文件已删除：${filePath}`
      }
    })

    // 13. 创建项目
    this.registerTool({
      name: 'create_project',
      description: '创建新的视频项目',
      inputSchema: {
        type: 'object',
        properties: {
          projectName: {
            type: 'string',
            description: '项目名称'
          },
          config: {
            type: 'object',
            description: '项目配置 (可选)',
            properties: {
              pipeline: {
                type: 'object',
                properties: {
                  remove_keyword: { type: 'string' },
                  margin: { type: 'number' },
                  min_segment_duration: { type: 'number' }
                }
              },
              subtitle: {
                type: 'object',
                properties: {
                  effect: { type: 'string' },
                  font_size: { type: 'number' }
                }
              }
            }
          }
        },
        required: ['projectName']
      },
      handler: async ({ projectName, config }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        const path = await vfs.createVideoProject(projectName, config || {})
        return `✅ 项目已创建：${projectName}\n路径：${path}`
      }
    })

    // 14. 复制文件
    this.registerTool({
      name: 'copy_file',
      description: '复制文件到另一位置',
      inputSchema: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: '源路径'
          },
          to: {
            type: 'string',
            description: '目标路径'
          }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        const content = await vfs.readFile(from)
        const file = vfs.getFile(from)
        await vfs.writeFile(to, content, { type: file?.type || 'application/octet-stream' })
        return `✅ 文件已复制：${from} -> ${to}`
      }
    })

    // 15. 获取文件信息
    this.registerTool({
      name: 'get_file_info',
      description: '获取文件的详细信息（大小、类型、创建时间等）',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件路径'
          }
        },
        required: ['filePath']
      },
      handler: async ({ filePath }) => {
        if (!vfs) throw new Error('VFS 未初始化')
        const file = vfs.getFile(filePath)
        if (!file) {
          throw new Error(`文件不存在：${filePath}`)
        }
        return `📄 **${file.name}**\n- 路径：${file.path}\n- 类型：${file.type}\n- 大小：${(file.size / 1024).toFixed(1)} KB\n- 创建：${file.createdAt}\n- 更新：${file.updatedAt}`
      }
    })

    // 16. 获取存储状态
    this.registerTool({
      name: 'get_storage_status',
      description: '获取虚拟文件系统的存储使用情况',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        if (!vfs) throw new Error('VFS 未初始化')
        const info = await vfs.getStorageInfo()
        const formatSize = (bytes) => {
          if (bytes === null) return '未知'
          if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
          if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
          if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
          return `${bytes} B`
        }
        return `💾 **存储状态**\n- 文件数：${info.fileCount}\n- 已用：${formatSize(info.totalSize)}\n- 可用：${formatSize(info.available)}`
      }
    })
  }

  /**
   * 注册内置资源
   */
  registerBuiltInResources(context = {}) {
    const { vfs, currentProject } = context

    // 1. 当前项目信息
    this.registerResource({
      uri: 'rjcut://current-project',
      name: '当前项目',
      description: '当前选中的视频项目信息',
      mimeType: 'application/json',
      handler: async () => ({
        text: JSON.stringify(currentProject, null, 2)
      })
    })

    // 2. 项目文件列表
    this.registerResource({
      uri: 'rjcut://project-files',
      name: '项目文件列表',
      description: '当前项目中的所有文件',
      mimeType: 'application/json',
      handler: async () => {
        if (!vfs) return { text: '[]' }
        const items = vfs.listDirectory()
        return { text: JSON.stringify(items, null, 2) }
      }
    })

    // 3. 脚本文件
    this.registerResource({
      uri: 'rjcut://scripts',
      name: '视频脚本',
      description: '项目中的所有脚本文件',
      mimeType: 'application/json',
      handler: async () => {
        if (!vfs) return { text: '[]' }
        const scripts = vfs.searchJSON()
        return { text: JSON.stringify(scripts, null, 2) }
      }
    })
  }

  /**
   * 注册内置提示
   */
  registerBuiltInPrompts() {
    // 1. 代码审查提示
    this.registerPrompt({
      name: 'code_review',
      description: '要求 AI 分析视频脚本并提出改进建议',
      arguments: [
        {
          name: 'script',
          description: '要审查的脚本内容',
          required: true
        }
      ],
      handler: async ({ script }) => ({
        description: '视频脚本审查',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `请审查这个视频脚本并提出改进建议：\n\n${script}`
            }
          }
        ]
      })
    })

    // 2. 项目初始化提示
    this.registerPrompt({
      name: 'project_init',
      description: '帮助初始化一个新的视频项目',
      arguments: [
        {
          name: 'projectName',
          description: '项目名称',
          required: true
        },
        {
          name: 'projectType',
          description: '项目类型',
          required: false
        }
      ],
      handler: async ({ projectName, projectType = 'general' }) => ({
        description: '项目初始化向导',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `请帮我初始化一个名为"${projectName}"的视频项目，类型是${projectType}。我需要知道应该准备哪些素材和配置文件。`
            }
          }
        ]
      })
    })

    // 3. 脚本生成提示
    this.registerPrompt({
      name: 'script_generate',
      description: '根据主题生成视频脚本',
      arguments: [
        {
          name: 'topic',
          description: '视频主题',
          required: true
        },
        {
          name: 'duration',
          description: '期望时长（秒）',
          required: false
        },
        {
          name: 'style',
          description: '视频风格',
          required: false
        }
      ],
      handler: async ({ topic, duration = 60, style = '专业' }) => ({
        description: '视频脚本生成',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `请为我生成一个关于"${topic}"的视频脚本，时长约${duration}秒，风格：${style}。请以 JSON 格式输出，包含场景、旁白、画面描述等字段。`
            }
          }
        ]
      })
    })
  }

  // =====================================================
  // 获取已注册的项目（用于 MCPManager 显示）
  // =====================================================
  
  /**
   * 获取所有已注册的工具
   */
  getRegisteredTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }

  /**
   * 获取所有已注册的资源
   */
  getRegisteredResources() {
    return Array.from(this.resources.values()).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }))
  }

  /**
   * 获取所有已注册的提示
   */
  getRegisteredPrompts() {
    return Array.from(this.prompts.values()).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }))
  }
}

// =====================================================
// 导出单例工厂（全局持久化，避免页面切换时断开）
// =====================================================
// 使用 window 对象存储全局实例，确保在组件卸载时不会被清理
let mcpServerInstance = null

export const getMCPServer = (options = {}) => {
  // 优先从 window 对象获取（如果存在），确保跨组件/页面共享
  if (window.__RJCutMCPServer__) {
    return window.__RJCutMCPServer__
  }
  if (!mcpServerInstance) {
    mcpServerInstance = new MCPServer(options)
    // 存储到 window 对象，防止组件卸载时被垃圾回收
    window.__RJCutMCPServer__ = mcpServerInstance
  }
  return mcpServerInstance
}

// 获取全局 MCP 服务器实例（不创建新实例）
export const getGlobalMCPServer = () => {
  return window.__RJCutMCPServer__ || mcpServerInstance
}

// 清理全局实例（仅在用户手动停止服务时调用）
export const clearGlobalMCPServer = () => {
  if (mcpServerInstance) {
    mcpServerInstance.close()
    mcpServerInstance = null
  }
  if (window.__RJCutMCPServer__) {
    window.__RJCutMCPServer__ = null
    delete window.__RJCutMCPServer__
  }
}

export default MCPServer