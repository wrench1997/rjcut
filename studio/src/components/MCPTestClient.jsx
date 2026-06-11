import { useState, useRef } from 'react'
import { Play, Square, RefreshCw, CheckCircle, XCircle, Activity, Terminal, FileText, Folder, Database, Zap } from 'lucide-react'
import { MCPClient } from '../api/mcpClient'

/**
 * MCP 测试客户端组件
 * 用于测试 MCP 服务器连接和工具调用
 */
function MCPTestClient({ mcpServerUrl = 'ws://localhost:8001/mcp' }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResults, setTestResults] = useState([])
  const [consoleOutput, setConsoleOutput] = useState([])
  const [selectedTool, setSelectedTool] = useState(null)
  const [toolArgs, setToolArgs] = useState('{}')
  const [availableTools, setAvailableTools] = useState([])
  const [availableResources, setAvailableResources] = useState([])
  
  const clientRef = useRef(null)
  const consoleEndRef = useRef(null)

  // 滚动到控制台底部
  const scrollToBottom = () => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // 添加控制台输出
  const addConsoleOutput = (type, message) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN')
    setConsoleOutput(prev => [...prev, { type, message, timestamp }])
    setTimeout(scrollToBottom, 50)
  }

  // 添加测试结果
  const addTestResult = (testName, success, message = '') => {
    setTestResults(prev => [...prev, { testName, success, message, timestamp: new Date().toLocaleTimeString('zh-CN') }])
  }

  // 连接 MCP 服务器
  const connect = async () => {
    setIsConnecting(true)
    setConsoleOutput([])
    setTestResults([])
    
    try {
      clientRef.current = new MCPClient({ serverUrl: mcpServerUrl })
      
      addConsoleOutput('info', `正在连接到 ${mcpServerUrl}...`)
      
      await clientRef.current.connect()
      
      addConsoleOutput('success', '✅ 已连接到 MCP 服务器')
      
      // 获取工具列表
      addConsoleOutput('info', '正在获取工具列表...')
      const toolsResult = await clientRef.current.listTools()
      setAvailableTools(toolsResult.tools || [])
      addConsoleOutput('success', `✅ 获取到 ${toolsResult.tools?.length || 0} 个工具`)
      
      // 获取资源列表
      addConsoleOutput('info', '正在获取资源列表...')
      const resourcesResult = await clientRef.current.listResources()
      setAvailableResources(resourcesResult.resources || [])
      addConsoleOutput('success', `✅ 获取到 ${resourcesResult.resources?.length || 0} 个资源`)
      
      setIsConnected(true)
    } catch (error) {
      addConsoleOutput('error', `❌ 连接失败：${error.message}`)
      setIsConnected(false)
    } finally {
      setIsConnecting(false)
    }
  }

  // 断开连接
  const disconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect()
      clientRef.current = null
    }
    setIsConnected(false)
    setAvailableTools([])
    setAvailableResources([])
    addConsoleOutput('info', '🔌 已断开连接')
  }

  // 运行全部测试
  const runAllTests = async () => {
    if (!isConnected) {
      await connect()
      if (!isConnected) return
    }
    
    setIsTesting(true)
    setTestResults([])
    addConsoleOutput('info', '🧪 开始运行 MCP 连接测试...')
    
    try {
      // 测试 1: 获取工具列表
      try {
        const tools = await clientRef.current.listTools()
        addTestResult('工具列表', true, `获取到 ${tools.tools?.length || 0} 个工具`)
        addConsoleOutput('success', `✅ 测试通过：工具列表 (${tools.tools?.length || 0} 个)`)
      } catch (error) {
        addTestResult('工具列表', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：工具列表 - ${error.message}`)
      }

      // 测试 2: 获取资源列表
      try {
        const resources = await clientRef.current.listResources()
        addTestResult('资源列表', true, `获取到 ${resources.resources?.length || 0} 个资源`)
        addConsoleOutput('success', `✅ 测试通过：资源列表 (${resources.resources?.length || 0} 个)`)
      } catch (error) {
        addTestResult('资源列表', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：资源列表 - ${error.message}`)
      }

      // 测试 3: 获取提示列表
      try {
        const prompts = await clientRef.current.listPrompts()
        addTestResult('提示列表', true, `获取到 ${prompts.prompts?.length || 0} 个提示`)
        addConsoleOutput('success', `✅ 测试通过：提示列表 (${prompts.prompts?.length || 0} 个)`)
      } catch (error) {
        addTestResult('提示列表', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：提示列表 - ${error.message}`)
      }

      // 测试 4: 文件操作工具测试 - vfs_pwd
      try {
        const pwdResult = await clientRef.current.callTool('vfs_pwd', {})
        addTestResult('文件操作：vfs_pwd', true, pwdResult.content?.[0]?.text || '成功')
        addConsoleOutput('success', `✅ 测试通过：vfs_pwd`)
      } catch (error) {
        addTestResult('文件操作：vfs_pwd', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：vfs_pwd - ${error.message}`)
      }

      // 测试 5: 文件操作工具测试 - vfs_list_directory
      try {
        const listResult = await clientRef.current.callTool('vfs_list_directory', { path: '/' })
        addTestResult('文件操作：vfs_list_directory', true, '目录列表成功')
        addConsoleOutput('success', `✅ 测试通过：vfs_list_directory`)
      } catch (error) {
        addTestResult('文件操作：vfs_list_directory', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：vfs_list_directory - ${error.message}`)
      }

      // 测试 6: 文件操作工具测试 - vfs_get_storage_info
      try {
        const storageResult = await clientRef.current.callTool('vfs_get_storage_info', {})
        addTestResult('文件操作：vfs_get_storage_info', true, '存储信息获取成功')
        addConsoleOutput('success', `✅ 测试通过：vfs_get_storage_info`)
      } catch (error) {
        addTestResult('文件操作：vfs_get_storage_info', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：vfs_get_storage_info - ${error.message}`)
      }

      // 测试 7: 项目管理工具测试 - list_projects
      try {
        const projectsResult = await clientRef.current.callTool('list_projects', {})
        addTestResult('项目管理：list_projects', true, '项目列表获取成功')
        addConsoleOutput('success', `✅ 测试通过：list_projects`)
      } catch (error) {
        addTestResult('项目管理：list_projects', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：list_projects - ${error.message}`)
      }

      // 测试 8: 项目管理工具测试 - get_storage_status
      try {
        const statusResult = await clientRef.current.callTool('get_storage_status', {})
        addTestResult('项目管理：get_storage_status', true, '存储状态获取成功')
        addConsoleOutput('success', `✅ 测试通过：get_storage_status`)
      } catch (error) {
        addTestResult('项目管理：get_storage_status', false, error.message)
        addConsoleOutput('error', `❌ 测试失败：get_storage_status - ${error.message}`)
      }

      addConsoleOutput('success', '🎉 所有测试完成！')
    } catch (error) {
      addConsoleOutput('error', `测试过程中出错：${error.message}`)
    } finally {
      setIsTesting(false)
    }
  }

  // 调用选定工具
  const callSelectedTool = async () => {
    if (!selectedTool || !clientRef.current) return
    
    try {
      let args = {}
      if (toolArgs.trim()) {
        args = JSON.parse(toolArgs)
      }
      
      addConsoleOutput('info', `📤 调用工具：${selectedTool.name}`)
      addConsoleOutput('info', `参数：${JSON.stringify(args)}`)
      
      const result = await clientRef.current.callTool(selectedTool.name, args)
      
      addConsoleOutput('success', `✅ 工具调用成功`)
      addConsoleOutput('result', JSON.stringify(result, null, 2))
    } catch (error) {
      addConsoleOutput('error', `❌ 工具调用失败：${error.message}`)
    }
  }

  // 清空控制台
  const clearConsole = () => {
    setConsoleOutput([])
    setTestResults([])
  }

  // 计算测试结果统计
  const passedTests = testResults.filter(r => r.success).length
  const failedTests = testResults.filter(r => !r.success).length

  return (
    <div className="mcp-test-client">
      {/* 头部状态栏 */}
      <div className="card mb-lg">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="display-lg mb-sm">MCP 测试客户端</h2>
            <p className="lead">测试 MCP 服务器连接和工具调用功能</p>
          </div>
          <div className="flex items-center gap-md">
            {isConnected ? (
              <>
                <Zap size={24} className="text-success" />
                <span className="body-strong text-success">已连接</span>
              </>
            ) : (
              <>
                <Activity size={24} className="text-muted" />
                <span className="body-strong text-muted">未连接</span>
              </>
            )}
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex gap-sm mt-md">
          {!isConnected ? (
            <button
              className="btn btn-primary"
              onClick={connect}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <><RefreshCw size={16} className="spin" style={{ display: 'inline', marginRight: '6px' }} /> 连接中...</>
              ) : (
                <><Play size={16} style={{ display: 'inline', marginRight: '6px' }} /> 连接 MCP 服务器</>
              )}
            </button>
          ) : (
            <button
              className="btn btn-ghost"
              style={{ color: '#ff3b30' }}
              onClick={disconnect}
            >
              <Square size={16} style={{ display: 'inline', marginRight: '6px' }} /> 断开连接
            </button>
          )}
          
          {isConnected && (
            <>
              <button
                className="btn btn-pearl-capsule"
                onClick={runAllTests}
                disabled={isTesting}
              >
                {isTesting ? (
                  <><RefreshCw size={16} className="spin" style={{ display: 'inline', marginRight: '6px' }} /> 测试中...</>
                ) : (
                  <><CheckCircle size={16} style={{ display: 'inline', marginRight: '6px' }} /> 运行全部测试</>
                )}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={clearConsole}
              >
                清空控制台
              </button>
            </>
          )}
        </div>

        {/* 服务器地址 */}
        <div className="mt-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            MCP WebSocket 地址
          </label>
          <input
            type="text"
            className="input"
            value={mcpServerUrl}
            readOnly
            style={{ fontFamily: 'monospace', backgroundColor: 'var(--bg-muted)' }}
          />
        </div>
      </div>

      {/* 测试结果摘要 */}
      {testResults.length > 0 && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">测试结果摘要</h3>
          <div className="flex gap-lg">
            <div className="flex items-center gap-sm">
              <CheckCircle size={20} className="text-success" />
              <div>
                <p className="caption text-muted">通过</p>
                <p className="body-strong text-success">{passedTests}</p>
              </div>
            </div>
            <div className="flex items-center gap-sm">
              <XCircle size={20} className="text-error" />
              <div>
                <p className="caption text-muted">失败</p>
                <p className="body-strong text-error">{failedTests}</p>
              </div>
            </div>
            <div className="flex items-center gap-sm">
              <Activity size={20} className="text-primary" />
              <div>
                <p className="caption text-muted">总计</p>
                <p className="body-strong">{testResults.length}</p>
              </div>
            </div>
          </div>
          
          <div className="mt-md" style={{ 
            maxHeight: '300px', 
            overflowY: 'auto',
            backgroundColor: 'var(--bg-muted)',
            borderRadius: 'var(--rounded-sm)',
            padding: 'var(--spacing-sm)'
          }}>
            {testResults.map((result, index) => (
              <div 
                key={index}
                className="caption"
                style={{ 
                  padding: 'var(--spacing-xs)',
                  borderBottom: '1px solid var(--hairline)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {result.success ? (
                  <CheckCircle size={14} className="text-success" style={{ flexShrink: 0 }} />
                ) : (
                  <XCircle size={14} className="text-error" style={{ flexShrink: 0 }} />
                )}
                <span style={{ flex: 1 }}>
                  <span className="body-strong">{result.testName}</span>
                  {result.message && <span className="text-muted"> - {result.message}</span>}
                </span>
                <span className="text-muted" style={{ fontSize: '12px' }}>{result.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 可用工具列表 */}
      {isConnected && availableTools.length > 0 && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">
            <Terminal size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            可用工具 ({availableTools.length})
          </h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 'var(--spacing-sm)' }}>
            {availableTools.map((tool, index) => (
              <div 
                key={index} 
                className={`card card-sm ${selectedTool?.name === tool.name ? 'selected' : ''}`}
                style={{ 
                  backgroundColor: selectedTool?.name === tool.name ? 'var(--primary-alpha)' : 'var(--bg-muted)',
                  cursor: 'pointer',
                  border: selectedTool?.name === tool.name ? '1px solid var(--primary)' : '1px solid transparent'
                }}
                onClick={() => {
                  setSelectedTool(tool)
                  setToolArgs('{}')
                }}
              >
                <div className="flex items-center gap-xs mb-xs">
                  <FileText size={14} className="text-primary" />
                  <span className="body-strong">{tool.name}</span>
                </div>
                <p className="caption text-muted" style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical'
                }}>
                  {tool.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 工具调用面板 */}
      {isConnected && selectedTool && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">
            <Zap size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            工具调用：{selectedTool.name}
          </h3>
          
          <div className="mb-md">
            <label className="caption-strong mb-sm" style={{ display: 'block' }}>
              工具描述
            </label>
            <p className="body text-muted">{selectedTool.description}</p>
          </div>
          
          <div className="mb-md">
            <label className="caption-strong mb-sm" style={{ display: 'block' }}>
              参数 (JSON 格式)
            </label>
            <textarea
              className="input"
              value={toolArgs}
              onChange={(e) => setToolArgs(e.target.value)}
              style={{ 
                fontFamily: 'monospace', 
                minHeight: '100px',
                resize: 'vertical'
              }}
              placeholder='{"param1": "value1", "param2": "value2"}'
            />
          </div>
          
          <button
            className="btn btn-primary"
            onClick={callSelectedTool}
          >
            <Play size={16} style={{ display: 'inline', marginRight: '6px' }} />
            调用工具
          </button>
        </div>
      )}

      {/* 可用资源列表 */}
      {isConnected && availableResources.length > 0 && (
        <div className="card mb-lg">
          <h3 className="tagline mb-md">
            <Database size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            可用资源 ({availableResources.length})
          </h3>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--spacing-sm)' }}>
            {availableResources.map((resource, index) => (
              <div 
                key={index} 
                className="card card-sm"
                style={{ backgroundColor: 'var(--bg-muted)' }}
              >
                <div className="flex items-center gap-xs mb-xs">
                  <Folder size={14} className="text-pearl" />
                  <span className="body-strong">{resource.name}</span>
                </div>
                <p className="caption text-muted" style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {resource.uri}
                </p>
                {resource.description && (
                  <p className="caption text-muted" style={{ marginTop: '4px' }}>
                    {resource.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 控制台输出 */}
      <div className="card">
        <div className="flex justify-between items-center mb-md">
          <h3 className="tagline">
            <Terminal size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
            控制台输出
          </h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={clearConsole}
          >
            清空
          </button>
        </div>
        
        <div style={{ 
          maxHeight: '500px', 
          overflowY: 'auto', 
          backgroundColor: '#1e1e1e', 
          borderRadius: 'var(--rounded-sm)',
          padding: 'var(--spacing-sm)',
          fontFamily: 'monospace',
          fontSize: '13px',
          lineHeight: '1.5'
        }}>
          {consoleOutput.length === 0 ? (
            <p className="caption text-muted" style={{ color: '#666' }}>暂无输出</p>
          ) : (
            consoleOutput.map((log, index) => (
              <div 
                key={index}
                style={{ 
                  padding: '4px 0',
                  borderBottom: '1px solid #333',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}
              >
                <span style={{ color: '#666' }}>[{log.timestamp}]</span>
                {' '}
                {log.type === 'success' && <span style={{ color: '#4ade80' }}>{log.message}</span>}
                {log.type === 'error' && <span style={{ color: '#f87171' }}>{log.message}</span>}
                {log.type === 'info' && <span style={{ color: '#60a5fa' }}>{log.message}</span>}
                {log.type === 'result' && <pre style={{ 
                  color: '#e5e5e5', 
                  margin: '8px 0', 
                  padding: '8px', 
                  backgroundColor: '#2d2d2d',
                  borderRadius: '4px',
                  overflow: 'auto'
                }}>{log.message}</pre>}
              </div>
            ))
          )}
          <div ref={consoleEndRef} />
        </div>
      </div>
    </div>
  )
}

export default MCPTestClient