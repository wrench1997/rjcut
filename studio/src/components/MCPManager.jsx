import { useState, useEffect, useRef } from 'react'
import { Plug, PlugZap, Server, Database, FileText, Folder, Settings, RefreshCw, Trash2, CheckCircle, XCircle, Activity, HardDrive } from 'lucide-react'
import { getMCPServer, clearGlobalMCPServer } from '../api/mcpServer'
import { IndexedDBVFSMCP } from '../api/indexedDBVFSMCP'
import { getVFS } from '../utils/vfsClient'

// =====================================================
// MCP 服务器管理组件
// =====================================================
function MCPManager({ 
  vfs = null, 
  mcpServerUrl = 'ws://localhost:8001/mcp',
  onMcpServerUrlChange 
}) {
  const [mcpServer, setMcpServer] = useState(null)
  const [vfsMCP, setVfsMCP] = useState(null)
  const [isRunning, setIsRunning] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [tools, setTools] = useState([])
  const [resources, setResources] = useState([])
  const [prompts, setPrompts] = useState([])
  const [connectionStatus, setConnectionStatus] = useState('disconnected') // 'disconnected' | 'connecting' | 'connected' | 'error'
  const [errorMessage, setErrorMessage] = useState('')
  const [storageInfo, setStorageInfo] = useState(null)
  const [operationLog, setOperationLog] = useState([])
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  
  // MCP 配置
  const [mcpConfig, setMcpConfig] = useState({
    port: 8001,
    allowDelete: true,
    allowWrite: true,
    maxFileSize: 100 * 1024 * 1024, // 100MB
    logOperations: true,
    useWebSocket: true, // 使用 WebSocket 长连接（推荐，更稳定）
  })

  const mcpServerRef = useRef(null)
  const vfsMCPRef = useRef(null)

  // 获取存储信息
  const fetchStorageInfo = async () => {
    if (!vfs) return
    try {
      const info = await vfs.getStorageInfo()
      setStorageInfo(info)
    } catch (e) {
      console.error('获取存储信息失败:', e)
    }
  }

  // 获取操作日志
  const fetchOperationLog = async () => {
    if (!vfsMCPRef.current) return
    try {
      const log = vfsMCPRef.current.getOperationLog(20)
      setOperationLog(log)
    } catch (e) {
      console.error('获取操作日志失败:', e)
    }
  }

  // 启动 MCP 服务器
  const startMCPServer = async () => {
    setIsInitializing(true)
    setConnectionStatus('connecting')
    setErrorMessage('')

    try {
      // 1. 获取或创建 VFS 实例
      const activeVfs = vfs || getVFS()
      
      // 2. 获取全局 MCP 服务器实例（单例模式，避免重复创建）
      const server = getMCPServer()
      mcpServerRef.current = server
      console.log('[MCPManager] 使用全局 MCP 服务器实例')

      // 3. 创建 IndexedDB VFS MCP
      const vfsMCPInstance = new IndexedDBVFSMCP(activeVfs, {
        allowDelete: mcpConfig.allowDelete,
        allowWrite: mcpConfig.allowWrite,
        maxFileSize: mcpConfig.maxFileSize,
        logOperations: mcpConfig.logOperations,
      })
      vfsMCPRef.current = vfsMCPInstance

      // 4. 注册到 MCP 服务器
      await vfsMCPInstance.register(server)
      setVfsMCP(vfsMCPInstance)

      // 5. 启动 MCP 服务器（连接到 MCP Proxy）
      // 从 WebSocket URL 提取 HTTP URL
      const httpProxyUrl = mcpServerUrl.replace('ws://', 'http://')
      const proxyBaseUrl = httpProxyUrl.substring(0, httpProxyUrl.lastIndexOf('/'))
      await server.listen(mcpConfig.port, proxyBaseUrl, mcpConfig.useWebSocket)
      
      // 6. 获取工具、资源、提示列表
      const toolsList = server.getRegisteredTools()
      const resourcesList = server.getRegisteredResources()
      const promptsList = server.getRegisteredPrompts()
      
      setTools(toolsList)
      setResources(resourcesList)
      setPrompts(promptsList)

      // 7. 获取存储信息
      await fetchStorageInfo()
      await fetchOperationLog()

      setIsRunning(true)
      setConnectionStatus('connected')
      console.log('[MCPManager] MCP 服务器已启动，端口:', mcpConfig.port)
    } catch (error) {
      console.error('[MCPManager] 启动失败:', error)
      setErrorMessage(error.message)
      setConnectionStatus('error')
    } finally {
      setIsInitializing(false)
    }
  }

  // 停止 MCP 服务器
  const stopMCPServer = () => {
    // 使用全局清理函数，确保完全断开并清理
    clearGlobalMCPServer()
    mcpServerRef.current = null
    if (vfsMCPRef.current) {
      vfsMCPRef.current.clearOperationLog()
      vfsMCPRef.current = null
    }
    setIsRunning(false)
    setConnectionStatus('disconnected')
    setTools([])
    setResources([])
    setPrompts([])
    setVfsMCP(null)
    console.log('[MCPManager] MCP 服务器已停止')
  }

  // 刷新状态
  const refreshStatus = async () => {
    await fetchStorageInfo()
    await fetchOperationLog()
  }

  // 清空操作日志
  const clearOperationLog = () => {
    if (vfsMCPRef.current) {
      vfsMCPRef.current.clearOperationLog()
      setOperationLog([])
    }
  }

  // 组件卸载时不断开服务器，保持长连接
  // 只在用户手动点击"停止服务"按钮时才关闭
  useEffect(() => {
    return () => {
      // 不清理 MCP 服务器，保持跨页面连接
      // MCP 服务器实例已存储到 window 对象，组件卸载不会导致断开
      console.log('[MCPManager] 组件卸载，保持 MCP 服务器连接')
    }
  }, [])

  // 初始化时尝试连接
  useEffect(() => {
    // 不自动启动，由用户手动控制
  }, [])

  const formatSize = (bytes) => {
    if (bytes === null || bytes === undefined) return '未知'
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${bytes} B`
  }

  return (
    <div className="mcp-manager">
      {/* 头部状态栏 */}
      <div className="card mb-lg">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="display-lg mb-sm">MCP 服务器管理</h2>
            <p className="lead">管理 Model Context Protocol 服务器，为 AI 助手提供文件系统访问能力</p>
          </div>
          <div className="flex items-center gap-md">
            {isRunning ? (
              <>
                <PlugZap size={24} className="text-success" />
                <span className="body-strong text-success">运行中</span>
              </>
            ) : (
              <>
                <Plug size={24} className="text-muted" />
                <span className="body-strong text-muted">已停止</span>
              </>
            )}
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex gap-sm mt-md">
          {!isRunning ? (
            <button
              className="btn btn-primary"
              onClick={startMCPServer}
              disabled={isInitializing}
            >
              {isInitializing ? (
                <><RefreshCw size={16} className="spin" style={{ display: 'inline', marginRight: '6px' }} /> 启动中...</>
              ) : (
                <><Server size={16} style={{ display: 'inline', marginRight: '6px' }} /> 启动 MCP 服务器</>
              )}
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ color: '#ff3b30' }}
              onClick={stopMCPServer}
            >
              <XCircle size={16} style={{ display: 'inline', marginRight: '6px' }} /> 停止服务
            </button>
          )}
          
          {isRunning && (
            <button
              className="btn btn-pearl-capsule"
              onClick={refreshStatus}
            >
              <RefreshCw size={16} style={{ display: 'inline', marginRight: '6px' }} /> 刷新状态
            </button>
          )}
        </div>

        {/* 错误信息 */}
        {errorMessage && (
          <div className="alert alert-error mt-md" role="alert">
            <XCircle size={16} style={{ display: 'inline', marginRight: '6px' }} />
            {errorMessage}
          </div>
        )}
      </div>

      {/* 连接配置 */}
      <div className="card mb-lg">
        <h3 className="tagline mb-md">连接配置</h3>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            MCP WebSocket 地址
          </label>
          <input
            type="text"
            className="input"
            value={mcpServerUrl}
            onChange={(e) => onMcpServerUrlChange?.(e.target.value)}
            placeholder="ws://localhost:8001/mcp"
            disabled={isRunning}
          />
          <p className="caption text-muted mb-sm" style={{ marginTop: 'var(--spacing-xs)' }}>
            AI 客户端将通过此地址连接到 MCP 服务器
          </p>
        </div>

        <div className="flex items-center gap-sm">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
          >
            <Settings size={14} style={{ display: 'inline', marginRight: '4px' }} />
            {showAdvancedSettings ? '隐藏' : '显示'} 高级设置
          </button>
        </div>

        {showAdvancedSettings && (
          <div className="mt-md" style={{ 
            padding: 'var(--spacing-md)', 
            backgroundColor: 'var(--bg-muted)', 
            borderRadius: 'var(--rounded-md)' 
          }}>
            <div className="mb-md">
              <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                服务端口
              </label>
              <input
                type="number"
                className="input"
                value={mcpConfig.port}
                onChange={(e) => setMcpConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 8001 }))}
                disabled={isRunning}
              />
            </div>

            <div className="mb-md">
              <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                最大文件大小
              </label>
              <select
                className="select"
                value={mcpConfig.maxFileSize}
                onChange={(e) => setMcpConfig(prev => ({ ...prev, maxFileSize: parseInt(e.target.value) }))}
                disabled={isRunning}
              >
                <option value={10 * 1024 * 1024}>10 MB</option>
                <option value={50 * 1024 * 1024}>50 MB</option>
                <option value={100 * 1024 * 1024}>100 MB</option>
                <option value={500 * 1024 * 1024}>500 MB</option>
              </select>
            </div>

            <div className="flex gap-md">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={mcpConfig.allowDelete}
                  onChange={(e) => setMcpConfig(prev => ({ ...prev, allowDelete: e.target.checked }))}
                  disabled={isRunning}
                />
                <span className="caption">允许删除操作</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={mcpConfig.allowWrite}
                  onChange={(e) => setMcpConfig(prev => ({ ...prev, allowWrite: e.target.checked }))}
                  disabled={isRunning}
                />
                <span className="caption">允许写入操作</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={mcpConfig.logOperations}
                  onChange={(e) => setMcpConfig(prev => ({ ...prev, logOperations: e.target.checked }))}
                  disabled={isRunning}
                />
                <span className="caption">记录操作日志</span>
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={mcpConfig.useWebSocket}
                  onChange={(e) => setMcpConfig(prev => ({ ...prev, useWebSocket: e.target.checked }))}
                  disabled={isRunning}
                />
                <span className="caption">使用 WebSocket 长连接（推荐）</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* 存储状态 */}
      {isRunning && storageInfo && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">
            <HardDrive size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            存储状态
          </h3>
          <div className="flex gap-lg" style={{ flexWrap: 'wrap' }}>
            <div>
              <p className="caption text-muted">文件数</p>
              <p className="body-strong">{storageInfo.fileCount}</p>
            </div>
            <div>
              <p className="caption text-muted">已用空间</p>
              <p className="body-strong">{formatSize(storageInfo.totalSize)}</p>
            </div>
            <div>
              <p className="caption text-muted">配额</p>
              <p className="body-strong">{formatSize(storageInfo.quota)}</p>
            </div>
            <div>
              <p className="caption text-muted">可用空间</p>
              <p className="body-strong">{formatSize(storageInfo.available)}</p>
            </div>
          </div>
        </div>
      )}

      {/* 已注册的工具 */}
      {isRunning && tools.length > 0 && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">
            <Activity size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            已注册工具 ({tools.length})
          </h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-sm)' }}>
            {tools.map((tool, index) => (
              <div 
                key={index} 
                className="card card-sm"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                <div className="flex items-center gap-xs mb-xs">
                  <CheckCircle size={14} className="text-success" />
                  <span className="body-strong">{tool.name}</span>
                </div>
                <p className="caption text-muted">{tool.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 已注册的资源 */}
      {isRunning && resources.length > 0 && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">
            <Database size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            已注册资源 ({resources.length})
          </h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-sm)' }}>
            {resources.map((resource, index) => (
              <div 
                key={index} 
                className="card card-sm"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                <div className="flex items-center gap-xs mb-xs">
                  <FileText size={14} className="text-primary" />
                  <span className="body-strong">{resource.name}</span>
                </div>
                <p className="caption text-muted">{resource.uri}</p>
                <p className="caption text-muted" style={{ marginTop: '4px' }}>{resource.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 已注册的提示 */}
      {isRunning && prompts.length > 0 && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">
            <FileText size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            已注册提示 ({prompts.length})
          </h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-sm)' }}>
            {prompts.map((prompt, index) => (
              <div 
                key={index} 
                className="card card-sm"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                <div className="flex items-center gap-xs mb-xs">
                  <FileText size={14} className="text-pearl" />
                  <span className="body-strong">{prompt.name}</span>
                </div>
                <p className="caption text-muted">{prompt.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作日志 */}
      {isRunning && mcpConfig.logOperations && (
        <div className="card mb-lg">
          <div className="flex justify-between items-center mb-md">
            <h3 className="tagline">
              <Activity size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              操作日志
            </h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={clearOperationLog}
            >
              <Trash2 size={14} style={{ display: 'inline', marginRight: '4px' }} />
              清空日志
            </button>
          </div>
          
          {operationLog.length === 0 ? (
            <p className="caption text-muted">暂无操作记录</p>
          ) : (
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto', 
              backgroundColor: 'var(--bg-muted)', 
              borderRadius: 'var(--rounded-sm)',
              padding: 'var(--spacing-sm)'
            }}>
              {operationLog.map((log, index) => (
                <div 
                  key={index}
                  className="caption"
                  style={{ 
                    padding: 'var(--spacing-xs)',
                    borderBottom: '1px solid var(--hairline)',
                    fontFamily: 'monospace'
                  }}
                >
                  <span className="text-muted">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                  {' '}
                  <span className="body-strong" style={{ color: 'var(--text-primary)' }}>
                    {log.operation.toUpperCase()}
                  </span>
                  {' '}
                  <span>{log.path}</span>
                  {log.to && <span className="text-muted"> → {log.to}</span>}
                  {log.size && <span className="text-muted"> ({formatSize(log.size)})</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MCPManager