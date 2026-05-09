import { useState, useRef, useEffect } from 'react'

// =====================================================
// API 配置
// =====================================================
const OPENCLAW_API_URL = 'http://127.0.0.1:18789/v1/chat/completions'
const DEFAULT_MODEL = 'claude-4-opus'

// =====================================================
// 系统提示词
// =====================================================
const SYSTEM_PROMPT = `你是一个专业的视频编辑助手，帮助用户管理视频项目、生成脚本和处理文件。

你的主要功能：
1. 帮助用户切换到指定的项目目录
2. 协助上传文件到项目
3. 生成和检查视频脚本
4. 提供视频编辑建议

当前可用命令：
- /switch [项目名] - 切换到指定项目
- /list - 列出当前项目文件
- /generate [主题] - 生成视频脚本
- /check - 检查脚本格式
- /help - 显示帮助

请以简洁、专业的方式回答，使用中文。`

// =====================================================
// 消息组件
// =====================================================
function ChatMessage({ message, isUser }) {
  return (
    <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-ai'}`}>
      <div className="chat-message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="chat-message-content">
        <div className="chat-message-text">{message}</div>
        <div className="chat-message-time">
          {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 快捷命令按钮
// =====================================================
function QuickCommand({ label, command, onClick }) {
  return (
    <button
      className="btn btn-pearl-capsule chat-quick-command"
      onClick={() => onClick(command)}
    >
      {label}
    </button>
  )
}

// =====================================================
// 项目切换建议
// =====================================================
function ProjectSuggestion({ project, onSwitch }) {
  return (
    <div className="project-suggestion">
      <div className="project-suggestion-info">
        <span className="body-strong">{project.name}</span>
        <span className="caption text-muted">{project.path}</span>
      </div>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => onSwitch(project.path)}
      >
        切换到此项目
      </button>
    </div>
  )
}

// =====================================================
// 脚本预览卡片
// =====================================================
function ScriptPreview({ script, onConfirm, onCancel }) {
  return (
    <div className="card script-preview-card">
      <h4 className="tagline mb-sm">生成的脚本预览</h4>
      <div className="script-preview-content">
        <pre className="script-preview-code">
          {JSON.stringify(script, null, 2)}
        </pre>
      </div>
      <div className="flex gap-sm mt-md">
        <button
          className="btn btn-primary"
          onClick={() => onConfirm(script)}
        >
          确认保存
        </button>
        <button
          className="btn btn-ghost"
          onClick={onCancel}
        >
          重新生成
        </button>
      </div>
    </div>
  )
}

// =====================================================
// 文件上传建议
// =====================================================
function FileUploadSuggestion({ fileType, targetPath, onUpload }) {
  return (
    <div className="card file-upload-suggestion">
      <div className="flex justify-between items-center mb-sm">
        <span className="body-strong">
          上传{fileType}到 {targetPath}
        </span>
      </div>
      <p className="caption text-muted mb-md">
        请选择要上传的文件
      </p>
      <input
        type="file"
        onChange={(e) => onUpload(e.target.files[0])}
        style={{ marginBottom: 'var(--spacing-md)' }}
      />
    </div>
  )
}

// =====================================================
// 主 AI 聊天组件
// =====================================================
function AIChat({ vfs, currentProject, onProjectSwitch, onFileCreated }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `你好！我是你的视频编辑助手。我可以帮助你：

• 切换到指定的项目目录
• 生成和检查视频脚本
• 上传文件到项目
• 提供编辑建议

你可以直接输入命令，或者使用下方的快捷按钮。`,
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'upload' | 'script_confirm'
  const [pendingData, setPendingData] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 发送消息到 AI
  const sendMessage = async (content) => {
    if (!content.trim()) return

    // 先检查是否是特殊命令
    const commandHandled = await handleSpecialCommand(content)
    if (commandHandled !== false) return

    // 添加用户消息
    const userMessage = { role: 'user', content }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      // 构建上下文
      const contextMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        userMessage,
      ]

      // 添加当前项目信息
      const projectInfo = currentProject 
        ? `\n当前项目：${currentProject.name}\n项目路径：${currentProject.path}`
        : '\n当前未选择项目'
      
      contextMessages[0].content += projectInfo

      // 调用 OpenClaw API
      const response = await fetch(OPENCLAW_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: contextMessages,
          stream: false,
          temperature: 0.7,
          max_tokens: 1000,
        }),
      })

      if (!response.ok) {
        throw new Error(`API 请求失败：${response.status}`)
      }

      const data = await response.json()
      const aiResponse = data.choices?.[0]?.message?.content || '抱歉，我无法理解你的请求。'

      // 添加 AI 响应
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }])

      // 处理 AI 响应中的特殊指令
      await handleAIResponse(aiResponse, content)

    } catch (error) {
      console.error('AI 请求失败:', error)
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `抱歉，连接 AI 服务失败：${error.message}\n\n请确保 OpenClaw 服务正在运行（端口 18789）。` 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  // 处理 AI 响应
  const handleAIResponse = async (aiResponse, userCommand) => {
    const lowerResponse = aiResponse.toLowerCase()
    const lowerCommand = userCommand.toLowerCase()

    // 检测是否需要切换项目
    if (lowerResponse.includes('切换到') || lowerResponse.includes('已切换到')) {
      const pathMatch = aiResponse.match(/\/[\w/\-]+/)
      if (pathMatch && vfs) {
        try {
          vfs.cd(pathMatch[0])
          const projectName = pathMatch[0].split('/').pop()
          onProjectSwitch?.({ name: projectName, path: pathMatch[0] })
        } catch (e) {
          console.error('切换项目失败:', e)
        }
      }
    }

    // 检测是否需要生成脚本
    if (lowerResponse.includes('生成的脚本') || lowerResponse.includes('脚本预览')) {
      try {
        const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          const script = JSON.parse(jsonMatch[1])
          setPendingAction('script_confirm')
          setPendingData(script)
        }
      } catch (e) {
        // 忽略解析失败
      }
    }

    // 检测是否需要上传文件
    if (lowerResponse.includes('上传文件') || lowerResponse.includes('请选择文件')) {
      const pathMatch = aiResponse.match(/\/[\w/\-]+/)
      if (pathMatch) {
        setPendingAction('upload')
        setPendingData({ targetPath: pathMatch[0], fileType: '文件' })
      }
    }
  }

  // 处理快捷命令
  const handleQuickCommand = (command) => {
    setInput(command)
    inputRef.current?.focus()
  }

  // 处理表单提交
  const handleSubmit = (e) => {
    e.preventDefault()
    if (input.trim() && !isLoading) {
      sendMessage(input)
    }
  }

  // 处理项目切换
  const handleProjectSwitch = async (projectPath) => {
    if (!vfs) return

    try {
      vfs.cd(projectPath)
      const projectName = projectPath.split('/').pop()
      onProjectSwitch?.({ name: projectName, path: projectPath })
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ 已切换到项目：**${projectName}**\n路径：${projectPath}\n\n现在你可以上传文件或生成脚本到此项目。`,
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 切换项目失败：${e.message}`,
      }])
    }
  }

  // 处理文件上传
  const handleFileUpload = async (file) => {
    if (!vfs || !file) return

    try {
      const targetPath = pendingData?.targetPath || `${currentProject?.path || '/'}/${file.name}`
      
      // 读取文件内容
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.readAsArrayBuffer(file)
      })

      // 写入虚拟文件系统
      await vfs.writeFile(targetPath, content, {
        type: file.type,
        metadata: {
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      })

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ 文件上传成功！\n\n**文件名**: ${file.name}\n**路径**: ${targetPath}\n**大小**: ${(file.size / 1024 / 1024).toFixed(2)} MB`,
      }])

      onFileCreated?.(targetPath)
      setPendingAction(null)
      setPendingData(null)

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 上传失败：${e.message}`,
      }])
    }
  }

  // 处理脚本确认
  const handleScriptConfirm = async (script) => {
    if (!vfs) return

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const scriptPath = `${currentProject?.path || '/scripts'}/script_${timestamp}.json`
      
      await vfs.writeJSON(scriptPath, script)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ 脚本已保存！\n\n**路径**: ${scriptPath}\n\n你可以在文件浏览器中查看和编辑这个脚本。`,
      }])

      onFileCreated?.(scriptPath)
      setPendingAction(null)
      setPendingData(null)

    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 保存脚本失败：${e.message}`,
      }])
    }
  }

  // 获取项目列表并显示
  const showProjectList = async () => {
    if (!vfs) return

    try {
      const projects = await vfs.getVideoProjects()
      
      if (projects.length === 0) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '📂 当前没有任何项目。你可以在"项目管理"页面创建一个新项目。\n\n💡 提示：点击顶部导航栏的"项目管理"来创建第一个项目。',
        }])
        return
      }

      let projectListText = `📁 **找到 ${projects.length} 个项目**:\n\n`
      
      projects.forEach((p, i) => {
        const isActive = currentProject?.path === p.path
        const activeFlag = isActive ? ' ✅ (当前)' : ''
        projectListText += `${i + 1}. **${p.name}**${activeFlag}\n`
      })
      
      projectListText += `\n💡 提示：使用 \`/switch 项目名\` 切换到指定项目`

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: projectListText,
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `获取项目列表失败：${e.message}`,
      }])
    }
  }

  // 列出当前目录文件
  const listCurrentFiles = () => {
    if (!vfs) return []
    
    try {
      const items = vfs.listDirectory()
      return items.slice(0, 10) // 只显示前 10 个
    } catch (e) {
      return []
    }
  }

  // 处理特殊命令
  const handleSpecialCommand = async (command) => {
    const trimmed = command.trim()
    
    // /switch 命令
    if (trimmed.startsWith('/switch') || trimmed.startsWith('/cd')) {
      const projectName = trimmed.replace(/\/(switch|cd)\s*/, '').trim()
      if (!projectName) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '❌ 请指定项目名称，例如：`/switch 我的项目`',
        }])
        return
      }
      
      // 尝试切换到项目
      const projectPath = `/videos/${projectName}`
      await handleProjectSwitch(projectPath)
      return
    }

    // /list 命令
    if (trimmed === '/list' || trimmed === '/ls') {
      if (!currentProject) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '📂 当前未选择项目。请先使用 `/switch 项目名` 切换到项目，或者输入 `/projects` 查看所有项目。',
        }])
        return
      }

      try {
        const items = vfs.listDirectory()
        if (items.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `📂 项目 **${currentProject.name}** 当前为空。`,
          }])
        } else {
          const fileList = items.map(item => 
            `${item.isDirectory ? '📁' : '📄'} ${item.name}${item.size ? ` (${(item.size / 1024).toFixed(1)} KB)` : ''}`
          ).join('\n')
          
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `📂 **${currentProject.name}** 的文件:\n\n${fileList}`,
          }])
        }
      } catch (e) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `列出文件失败：${e.message}`,
        }])
      }
      return
    }

    // /projects 命令
    if (trimmed === '/projects') {
      await showProjectList()
      return
    }

    // /generate 命令
    if (trimmed.startsWith('/generate')) {
      const topic = trimmed.replace('/generate', '').trim() || '产品介绍视频'
      sendMessage(`请为我生成一个关于"${topic}"的视频脚本`)
      return
    }

    // /check 命令
    if (trimmed === '/check') {
      if (!currentProject) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '❌ 请先切换到项目目录，然后我才能检查脚本。',
        }])
        return
      }

      try {
        // 查找项目中的 JSON 文件
        const jsonFiles = vfs.searchJSON()
        const projectJsonFiles = jsonFiles.filter(f => f.path.startsWith(currentProject.path))
        
        if (projectJsonFiles.length === 0) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `📂 在 **${currentProject.name}** 中没有找到 JSON 脚本文件。`,
          }])
          return
        }

        const fileList = projectJsonFiles.map(f => `📄 ${f.path}`).join('\n')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ 找到 ${projectJsonFiles.length} 个脚本文件:\n\n${fileList}\n\n请选择要检查的脚本文件。`,
        }])
      } catch (e) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `检查脚本失败：${e.message}`,
        }])
      }
      return
    }

    // /upload 命令
    if (trimmed === '/upload') {
      if (!currentProject) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '❌ 请先切换到项目目录，然后再上传文件。',
        }])
        return
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `📤 准备上传文件到 **${currentProject.name}**\n\n请选择要上传的文件类型:\n• 视频文件 (MP4, MOV 等)\n• 音频文件 (MP3, WAV 等)\n• 脚本文件 (JSON)\n\n或者直接将文件拖拽到对话框中。`,
      }])
      
      setPendingAction('upload')
      setPendingData({ targetPath: currentProject.path, fileType: '文件' })
      return
    }

    // /help 命令
    if (trimmed === '/help') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `📖 **AI 助手使用指南**\n\n` +
          `**命令列表**:\n` +
          `• \`/switch 项目名\` - 切换到指定项目\n` +
          `• \`/list\` - 列出当前项目文件\n` +
          `• \`/projects\` - 查看所有项目\n` +
          `• \`/generate 主题\` - 生成视频脚本\n` +
          `• \`/check\` - 检查脚本格式\n` +
          `• \`/upload\` - 上传文件\n` +
          `• \`/help\` - 显示帮助\n\n` +
          `你也可以直接用自然语言和我交流，我会尽力帮助你！`,
      }])
      return
    }

    // 未知命令
    return false
  }

  return (
    <div className="ai-chat">
      {/* 聊天消息区域 */}
      <div className="chat-messages">
        {messages.map((message, index) => (
          <ChatMessage
            key={index}
            message={message.content}
            isUser={message.role === 'user'}
          />
        ))}
        
        {/* 待处理的操作 */}
        {pendingAction === 'script_confirm' && pendingData && (
          <ScriptPreview
            script={pendingData}
            onConfirm={handleScriptConfirm}
            onCancel={() => {
              setPendingAction(null)
              setPendingData(null)
              sendMessage('请重新生成脚本')
            }}
          />
        )}
        
        {pendingAction === 'upload' && pendingData && (
          <FileUploadSuggestion
            fileType={pendingData.fileType}
            targetPath={pendingData.targetPath}
            onUpload={handleFileUpload}
          />
        )}

        {/* 项目建议（当用户询问项目时） */}
        {messages[messages.length - 1]?.content.toLowerCase().includes('项目') && (
          <div className="card mb-md">
            <h4 className="tagline mb-sm">可用项目</h4>
            <div id="project-list-container">
              {/* 项目列表将通过 ref 动态插入 */}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 快捷命令 */}
      <div className="chat-quick-commands">
        <QuickCommand 
          label="📁 切换项目" 
          command="/switch " 
          onClick={handleQuickCommand} 
        />
        <QuickCommand 
          label="📝 生成脚本" 
          command="/generate 产品介绍视频" 
          onClick={handleQuickCommand} 
        />
        <QuickCommand 
          label="✅ 检查脚本" 
          command="/check" 
          onClick={handleQuickCommand} 
        />
        <QuickCommand 
          label="📂 列出文件" 
          command="/list" 
          onClick={handleQuickCommand} 
        />
        <QuickCommand 
          label="⬆️ 上传文件" 
          command="/upload" 
          onClick={handleQuickCommand} 
        />
      </div>

      {/* 输入区域 */}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="input chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息或命令..."
          disabled={isLoading}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '发送中...' : '发送'}
        </button>
      </form>

      {/* 加载状态 */}
      {isLoading && (
        <div className="chat-loading">
          <span className="loading-dots">
            <span></span>
            <span></span>
            <span></span>
          </span>
          <span className="caption text-muted">AI 正在思考...</span>
        </div>
      )}
    </div>
  )
}

export default AIChat
