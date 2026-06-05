/**
 * MCP 客户端 - 用于连接到 MCP 服务器并调用工具
 * 基于 MCP 规范 2025-11-25 实现
 * 
 * 此客户端允许前端应用连接到 MCP 服务器，
 * 并调用视频编辑相关的工具。
 */

// =====================================================
// MCP 客户端类
// =====================================================
export class MCPClient {
  constructor(options = {}) {
    this.serverUrl = options.serverUrl || null
    this.ws = null
    this.requestId = 0
    this.pendingRequests = new Map()
    
    // 客户端能力声明
    this.capabilities = {}
    
    // 客户端信息
    this.clientInfo = {
      name: 'rjcut-studio-mcp-client',
      version: '1.0.0'
    }
    
    // 已发现的工具、资源、提示
    this.tools = []
    this.resources = []
    this.prompts = []
    
    // 连接状态
    this.connected = false
    this.initialized = false
    
    // 上下文（由外部注入）
    this.context = {}
    
    // 事件监听器
    this.eventListeners = new Map()
  }

  // =====================================================
  // 连接管理
  // =====================================================
  
  /**
   * 连接到 MCP 服务器
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl)
        
        this.ws.onopen = () => {
          this.connected = true
          console.log('[MCP Client] 已连接到 MCP 服务器')
          // 发送初始化请求
          this._initialize().then(resolve).catch(reject)
        }

        this.ws.onclose = () => {
          this.connected = false
          this.initialized = false
          console.log('[MCP Client] 连接已关闭')
        }

        this.ws.onerror = (error) => {
          console.error('[MCP Client] 连接错误:', error)
          reject(error)
        }

        this.ws.onmessage = (event) => {
          this._handleMessage(event)
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
    this.pendingRequests.clear()
  }

  // =====================================================
  // 初始化
  // =====================================================
  
  async _initialize() {
    const result = await this._sendRequest('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: this.capabilities,
      clientInfo: this.clientInfo
    })
    
    this.initialized = true
    this.serverCapabilities = result.capabilities
    this.serverInfo = result.serverInfo
    
    console.log('[MCP Client] 初始化完成，服务器:', this.serverInfo)
    
    // 发送 initialized 通知
    this._sendNotification('notifications/initialized')
    
    return result
  }

  // =====================================================
  // 消息处理
  // =====================================================
  
  _handleMessage(event) {
    try {
      const message = JSON.parse(event.data)
      console.log('[MCP Client] 收到消息:', message)
      
      // 处理响应
      if (message.id) {
        const pending = this.pendingRequests.get(message.id)
        if (pending) {
          this.pendingRequests.delete(message.id)
          if (message.error) {
            pending.reject(new Error(message.error.message))
          } else {
            pending.resolve(message.result)
          }
        }
      }
      
      // 处理通知
      if (message.method) {
        this._handleNotification(message.method, message.params)
      }
    } catch (error) {
      console.error('[MCP Client] 消息处理失败:', error)
    }
  }

  _handleNotification(method, params) {
    const listeners = this.eventListeners.get(method) || []
    listeners.forEach(listener => {
      try {
        listener(params)
      } catch (error) {
        console.error('[MCP Client] 通知处理器错误:', error)
      }
    })
  }

  _sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params
      }
      
      this.pendingRequests.set(id, { resolve, reject })
      
      console.log('[MCP Client] 发送请求:', message)
      this.ws.send(JSON.stringify(message))
      
      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`请求超时：${method}`))
        }
      }, 30000)
    })
  }

  _sendNotification(method, params = {}) {
    const message = {
      jsonrpc: '2.0',
      method,
      params
    }
    
    console.log('[MCP Client] 发送通知:', message)
    this.ws.send(JSON.stringify(message))
  }

  // =====================================================
  // 工具 (Tools) 操作
  // =====================================================
  
  async listTools() {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化')
    }
    
    const result = await this._sendRequest('tools/list', {})
    this.tools = result.tools || []
    return result
  }

  async callTool(name, args = {}) {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化')
    }
    
    const result = await this._sendRequest('tools/call', {
      name,
      arguments: args
    })
    
    return result
  }

  onToolsListChanged(listener) {
    this._addEventListener('notifications/tools/list_changed', listener)
  }

  // =====================================================
  // 资源 (Resources) 操作
  // =====================================================
  
  async listResources() {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化')
    }
    
    const result = await this._sendRequest('resources/list', {})
    this.resources = result.resources || []
    return result
  }

  async readResource(uri) {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化')
    }
    
    const result = await this._sendRequest('resources/read', { uri })
    return result
  }

  onResourcesListChanged(listener) {
    this._addEventListener('notifications/resources/list_changed', listener)
  }

  onResourceUpdated(listener) {
    this._addEventListener('notifications/resources/updated', listener)
  }

  // =====================================================
  // 提示 (Prompts) 操作
  // =====================================================
  
  async listPrompts() {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化')
    }
    
    const result = await this._sendRequest('prompts/list', {})
    this.prompts = result.prompts || []
    return result
  }

  async getPrompt(name, args = {}) {
    if (!this.initialized) {
      throw new Error('MCP 客户端未初始化')
    }
    
    const result = await this._sendRequest('prompts/get', {
      name,
      arguments: args
    })
    
    return result
  }

  onPromptsListChanged(listener) {
    this._addEventListener('notifications/prompts/list_changed', listener)
  }

  // =====================================================
  // 事件监听
  // =====================================================
  
  _addEventListener(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event).push(listener)
  }

  // =====================================================
  // 设置上下文
  // =====================================================
  
  setContext(context) {
    this.context = { ...this.context, ...context }
  }

  // =====================================================
  // 注册 RJCut Studio 内置工具（客户端代理）
  // =====================================================

  registerBuiltInTools(context = {}) {
    this.context = { ...this.context, ...context }
    console.log('[MCP Client] 已设置内置工具上下文')
  }

  registerBuiltInResources(context = {}) {
    this.context = { ...this.context, ...context }
    console.log('[MCP Client] 已设置内置资源上下文')
  }

  registerBuiltInPrompts() {
    console.log('[MCP Client] 已注册内置提示')
  }

  // 兼容层：注册工具（实际上是通过服务器调用）
  registerTool(tool) {
    console.log('[MCP Client] 注册工具（代理）:', tool.name)
    // 在客户端模式下，工具注册实际上是通知服务器
    // 这里只是记录，实际工具在服务器端实现
  }
}

// =====================================================
// 导出单例工厂
// =====================================================
let mcpClientInstance = null

export const getMCPClient = (options = {}) => {
  if (!mcpClientInstance) {
    mcpClientInstance = new MCPClient(options)
  }
  return mcpClientInstance
}

export default MCPClient