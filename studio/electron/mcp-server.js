/**
 * RJCut Studio - Electron MCP 服务器
 * 
 * 直接在 Electron 主进程中运行 MCP 服务器，提供稳定的本地服务
 * 支持 WebSocket 和 SSE 两种传输方式
 * 
 * 架构：
 * External MCP Client (Codex/Claude) <-> WebSocket/SSE <-> MCP Server (electron/mcp-server.js)
 *                                              |
 *                                              v
 *                                       IPC <-> Renderer (Next.js App)
 */

const { app, ipcMain } = require('electron')
const WebSocket = require('ws')
const http = require('http')
const path = require('path')
const fs = require('fs').promises

// =====================================================
// MCP 服务器类
// =====================================================
class ElectronMCPServer {
  constructor(options = {}) {
    this.port = options.port || 8001
    this.wsServer = null
    this.httpServer = null
    this.clients = new Map() // clientId -> { ws, role }
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
    this.running = false
    this.initialized = false
    
    // 上下文（由外部注入）
    this.context = {}
    
    // 操作日志
    this.operationLog = []
  }

  // =====================================================
  // 服务器管理
  // =====================================================
  
  /**
   * 启动 MCP 服务器
   */
  async start(port = 8001) {
    return new Promise((resolve, reject) => {
      try {
        this.port = port
        
        // 创建 HTTP 服务器（用于 SSE 和健康检查）
        this.httpServer = http.createServer((req, res) => {
          this._handleHTTPRequest(req, res)
        })
        
        // 创建 WebSocket 服务器
        this.wsServer = new WebSocket.Server({ server: this.httpServer, path: '/ws' })
        
        this.wsServer.on('connection', (ws, req) => {
          this._handleWebSocketConnection(ws, req)
        })
        
        // 监听端口
        this.httpServer.listen(this.port, () => {
          this.running = true
          console.log(`[MCP Server] 已启动在端口 ${this.port}`)
          console.log(`[MCP Server] WebSocket: ws://localhost:${this.port}/ws`)
          console.log(`[MCP Server] HTTP: http://localhost:${this.port}`)
          resolve()
        })
        
        this.httpServer.on('error', (error) => {
          console.error('[MCP Server] 服务器错误:', error)
          reject(error)
        })
        
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 停止 MCP 服务器
   */
  async stop() {
    return new Promise((resolve, reject) => {
      try {
        // 关闭所有客户端连接
        for (const [clientId, client] of this.clients.entries()) {
          if (client.ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.close()
          }
        }
        this.clients.clear()
        
        // 关闭 WebSocket 服务器
        if (this.wsServer) {
          this.wsServer.close(() => {
            console.log('[MCP Server] WebSocket 服务器已关闭')
          })
        }
        
        // 关闭 HTTP 服务器
        if (this.httpServer) {
          this.httpServer.close(() => {
            console.log('[MCP Server] HTTP 服务器已关闭')
            this.running = false
            this.initialized = false
            resolve()
          })
        } else {
          this.running = false
          this.initialized = false
          resolve()
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  // =====================================================
  // HTTP 请求处理
  // =====================================================
  
  _handleHTTPRequest(req, res) {
    const url = new URL(req.url, `http://localhost:${this.port}`)
    
    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    
    // 健康检查
    if (url.pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        running: this.running,
        clients: this.clients.size
      }))
      return
    }
    
    // SSE 事件流
    if (url.pathname === '/events' && req.method === 'GET') {
      const clientId = url.searchParams.get('clientId') || 'anonymous'
      this._handleSSEConnection(req, res, clientId)
      return
    }
    
    // 注册客户端
    if (url.pathname === '/register' && req.method === 'POST') {
      this._handleRegister(req, res)
      return
    }
    
    // 发送消息
    if (url.pathname === '/message' && req.method === 'POST') {
      this._handleHTTPMessage(req, res)
      return
    }
    
    // 404
    res.writeHead(404)
    res.end('Not Found')
  }

  /**
   * 处理 SSE 连接
   */
  _handleSSEConnection(req, res, clientId) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })
    
    // 发送初始连接事件
    res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`)
    
    // 定期发送心跳
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n')
    }, 30000)
    
    // 清理
    req.on('close', () => {
      clearInterval(heartbeat)
    })
  }

  /**
   * 处理客户端注册
   */
  async _handleRegister(req, res) {
    try {
      const body = await this._readBody(req)
      const { clientId } = JSON.parse(body)
      
      if (!clientId) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: 'clientId is required' }))
        return
      }
      
      this.clients.set(clientId, { role: 'client', registeredAt: new Date() })
      
      console.log(`[MCP Server] 客户端已注册：${clientId}`)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        success: true,
        clientId,
        message: '注册成功'
      }))
    } catch (error) {
      console.error('[MCP Server] 注册失败:', error)
      res.writeHead(500)
      res.end(JSON.stringify({ error: error.message }))
    }
  }

  /**
   * 处理 HTTP 消息
   */
  async _handleHTTPMessage(req, res) {
    try {
      const body = await this._readBody(req)
      const message = JSON.parse(body)
      
      console.log('[MCP Server] 收到 HTTP 消息:', message)
      
      // 处理消息
      const response = await this._processMessage(message)
      
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    } catch (error) {
      console.error('[MCP Server] 消息处理失败:', error)
      res.writeHead(500)
      res.end(JSON.stringify({ error: error.message }))
    }
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => body += chunk)
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }

  // =====================================================
  // WebSocket 连接处理
  // =====================================================
  
  _handleWebSocketConnection(ws, req) {
    const url = new URL(req.url, `ws://localhost:${this.port}`)
    const clientId = url.searchParams.get('clientId') || `client_${Date.now()}`
    const role = url.searchParams.get('role') || 'client'
    
    // 存储客户端
    this.clients.set(clientId, {
      ws,
      role,
      connectedAt: new Date()
    })
    
    console.log(`[MCP Server] WebSocket 客户端已连接：${clientId} (${role})`)
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data)
        console.log(`[MCP Server] 收到消息 (${clientId}):`, message)
        this._handleMessage(message, clientId)
      } catch (error) {
        console.error('[MCP Server] 消息解析失败:', error)
      }
    })
    
    ws.on('close', () => {
      console.log(`[MCP Server] WebSocket 客户端已断开：${clientId}`)
      this.clients.delete(clientId)
    })
    
    ws.on('error', (error) => {
      console.error(`[MCP Server] WebSocket 错误 (${clientId}):`, error)
    })
    
    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'welcome',
      clientId,
      serverInfo: this.serverInfo
    }))
  }

  // =====================================================
  // 消息处理
  // =====================================================
  
  async _handleMessage(message, clientId) {
    try {
      // 处理不同类型的消息
      switch (message.method) {
        case 'initialize':
          await this._handleInitialize(message, clientId)
          break
        case 'tools/list':
          await this._handleToolsList(message, clientId)
          break
        case 'tools/call':
          await this._handleToolsCall(message, clientId)
          break
        case 'resources/list':
          await this._handleResourcesList(message, clientId)
          break
        case 'resources/read':
          await this._handleResourcesRead(message, clientId)
          break
        case 'prompts/list':
          await this._handlePromptsList(message, clientId)
          break
        case 'prompts/get':
          await this._handlePromptsGet(message, clientId)
          break
        default:
          this._sendError(clientId, message.id, -32601, `未知方法：${message.method}`)
      }
    } catch (error) {
      console.error('[MCP Server] 消息处理失败:', error)
      this._sendError(clientId, message.id, -32603, error.message)
    }
  }

  async _processMessage(message) {
    return new Promise((resolve, reject) => {
      // 创建临时客户端来处理消息
      const tempClientId = `http_${Date.now()}`
      
      // 重写发送方法以返回结果
      const originalSend = this._send.bind(this)
      this._send = function(clientId, msg) {
        if (clientId === tempClientId) {
          resolve(msg)
        } else {
          originalSend(clientId, msg)
        }
      }
      
      this._handleMessage(message, tempClientId).catch(reject)
      
      // 恢复原发送方法
      setTimeout(() => {
        this._send = originalSend
      }, 1000)
    })
  }

  async _send(clientId, message) {
    const messageStr = JSON.stringify(message)
    console.log(`[MCP Server] 发送给 ${clientId}:`, message)
    
    const client = this.clients.get(clientId)
    if (client && client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr)
    } else {
      console.warn(`[MCP Server] 客户端 ${clientId} 不可用`)
    }
  }

  _sendResponse(clientId, id, result) {
    this._send(clientId, {
      jsonrpc: '2.0',
      id,
      result
    })
  }

  _sendError(clientId, id, code, message, data = null) {
    this._send(clientId, {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data && { data })
      }
    })
  }

  _sendNotification(clientId, method, params = {}) {
    this._send(clientId, {
      jsonrpc: '2.0',
      method,
      params
    })
  }

  // =====================================================
  // 初始化处理
  // =====================================================
  
  async _handleInitialize(message, clientId) {
    const { params } = message
    
    // 保存客户端信息
    const client = this.clients.get(clientId)
    if (client) {
      client.clientInfo = params?.clientInfo
    }
    
    // 标记已初始化
    this.initialized = true
    
    // 发送初始化响应
    this._sendResponse(clientId, message.id, {
      protocolVersion: '2025-11-25',
      capabilities: this.capabilities,
      serverInfo: this.serverInfo
    })

    console.log('[MCP Server] 初始化完成，客户端:', client?.clientInfo)
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
      this._notifyAll('notifications/tools/list_changed')
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
        this._notifyAll('notifications/tools/list_changed')
      }
    }
  }

  async _handleToolsList(message, clientId) {
    const { cursor, limit = 50 } = message.params || {}
    const startIndex = cursor ? parseInt(cursor) : 0
    const endIndex = startIndex + limit
    
    const toolsList = Array.from(this.tools.values())
    const tools = toolsList.slice(startIndex, endIndex).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))

    this._sendResponse(clientId, message.id, {
      tools,
      nextCursor: endIndex < toolsList.length ? String(endIndex) : undefined
    })
  }

  async _handleToolsCall(message, clientId) {
    const { name, arguments: args } = message.params || {}
    
    const tool = this.tools.get(name)
    if (!tool) {
      this._sendError(clientId, message.id, -32602, `未知工具：${name}`)
      return
    }

    try {
      const result = await tool.handler(args, this.context)
      this._sendResponse(clientId, message.id, {
        content: Array.isArray(result) ? result : [{ type: 'text', text: String(result) }],
        isError: false
      })
    } catch (error) {
      this._sendResponse(clientId, message.id, {
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
      this._notifyAll('notifications/resources/list_changed')
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
        this._notifyAll('notifications/resources/list_changed')
      }
    }
  }

  async _handleResourcesList(message, clientId) {
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

    this._sendResponse(clientId, message.id, {
      resources,
      nextCursor: endIndex < resourcesList.length ? String(endIndex) : undefined
    })
  }

  async _handleResourcesRead(message, clientId) {
    const { uri } = message.params || {}
    
    const resource = this.resources.get(uri)
    if (!resource) {
      this._sendError(clientId, message.id, -32002, '资源未找到', { uri })
      return
    }

    try {
      const content = await resource.handler(this.context)
      this._sendResponse(clientId, message.id, {
        contents: [{
          uri,
          mimeType: resource.mimeType,
          ...content
        }]
      })
    } catch (error) {
      this._sendError(clientId, message.id, -32603, `读取资源失败：${error.message}`)
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
      this._notifyAll('notifications/prompts/list_changed')
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
        this._notifyAll('notifications/prompts/list_changed')
      }
    }
  }

  async _handlePromptsList(message, clientId) {
    const { cursor, limit = 50 } = message.params || {}
    const startIndex = cursor ? parseInt(cursor) : 0
    const endIndex = startIndex + limit
    
    const promptsList = Array.from(this.prompts.values())
    const prompts = promptsList.slice(startIndex, endIndex).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }))

    this._sendResponse(clientId, message.id, {
      prompts,
      nextCursor: endIndex < promptsList.length ? String(endIndex) : undefined
    })
  }

  async _handlePromptsGet(message, clientId) {
    const { name, arguments: args } = message.params || {}
    
    const prompt = this.prompts.get(name)
    if (!prompt) {
      this._sendError(clientId, message.id, -32602, `无效提示：${name}`)
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
      
      this._sendResponse(clientId, message.id, result)
    } catch (error) {
      this._sendError(clientId, message.id, -32603, `获取提示失败：${error.message}`)
    }
  }

  // =====================================================
  // 通知所有客户端
  // =====================================================
  
  _notifyAll(method, params = {}) {
    for (const clientId of this.clients.keys()) {
      this._sendNotification(clientId, method, params)
    }
  }

  notifyToolsListChanged() {
    if (this.capabilities.tools.listChanged) {
      this._notifyAll('notifications/tools/list_changed')
    }
  }

  notifyResourcesListChanged() {
    if (this.capabilities.resources.listChanged) {
      this._notifyAll('notifications/resources/list_changed')
    }
  }

  notifyPromptsListChanged() {
    if (this.capabilities.prompts.listChanged) {
      this._notifyAll('notifications/prompts/list_changed')
    }
  }

  // =====================================================
  // 设置上下文
  // =====================================================
  
  setContext(context) {
    this.context = { ...this.context, ...context }
  }

  // =====================================================
  // 获取状态
  // =====================================================
  
  getStatus() {
    return {
      running: this.running,
      initialized: this.initialized,
      port: this.port,
      clients: this.clients.size,
      tools: this.tools.size,
      resources: this.resources.size,
      prompts: this.prompts.size
    }
  }

  getRegisteredTools() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  }

  getRegisteredResources() {
    return Array.from(this.resources.values()).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType
    }))
  }

  getRegisteredPrompts() {
    return Array.from(this.prompts.values()).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }))
  }
}

// =====================================================
// 导出
// =====================================================
module.exports = { ElectronMCPServer }