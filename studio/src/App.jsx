import { useState, useEffect, useCallback, useRef } from 'react'
import { createDefaultFileSystem, getSharedFileSystem } from './utils/virtualFileSystem'
import { setApiKey, getMerchantInfo as apiGetMerchantInfo } from './api/api'
import { FolderOpen, Folder, Layers, Clapperboard, Settings, HelpCircle, Sparkles, Film, Scissors, FileText, Clock, RefreshCw, ScrollText, Download, User, Bot } from 'lucide-react'
import FileBrowser from './components/FileBrowser'
import VideoProjectManager from './components/VideoProjectManager'
import AIChat from './components/AIChat'
import BatchProcessor from './components/BatchProcessor'
import DigitalHumanStudio from './components/DigitalHumanStudio'
import DigitalHumanManager from './components/DigitalHumanManager'
import HelpGuide from './components/HelpGuide'
import AdvancedVideoEditor from './components/AdvancedVideoEditor'

// =====================================================
// API 客户端实例（用于 MCP 工具调用）
// =====================================================
const apiClient = {
  get: async (endpoint) => {
    const apiKey = localStorage.getItem('rjcut_api_key') || DEFAULT_API_KEY
    const baseUrl = localStorage.getItem('rjcut_api_base_url') || DEFAULT_API_BASE_URL
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || '请求失败')
    }
    return { data }
  },
  post: async (endpoint, payload) => {
    const apiKey = localStorage.getItem('rjcut_api_key') || DEFAULT_API_KEY
    const baseUrl = localStorage.getItem('rjcut_api_base_url') || DEFAULT_API_BASE_URL
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || '请求失败')
    }
    return { data }
  },
}

// =====================================================
// API 配置
// =====================================================
const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
const DEFAULT_API_KEY = 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC'

// =====================================================
// 工具函数
// =====================================================
const generateTraceId = () => 'trace_' + Math.random().toString(36).substring(2, 18)

const apiRequest = async (endpoint, options = {}, apiKey = DEFAULT_API_KEY, baseUrl = DEFAULT_API_BASE_URL) => {
  const url = `${baseUrl}${endpoint}`
  const config = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }
  
  const response = await fetch(url, config)
  const data = await response.json()
  
  if (!response.ok) {
    throw new Error(data.message || '请求失败')
  }
  
  return data
}

const formatTime = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatFileSize = (bytes) => {
  if (!bytes) return '-'
  const mb = bytes / 1024 / 1024
  if (mb >= 1000) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}

// =====================================================
// 状态徽章组件
// =====================================================
function StatusBadge({ status }) {
  const statusMap = {
    queued: { label: '排队中', class: 'status-queued' },
    processing: { label: '处理中', class: 'status-processing' },
    succeeded: { label: '成功', class: 'status-succeeded' },
    failed: { label: '失败', class: 'status-failed' },
    cancelled: { label: '已取消', class: 'status-cancelled' },
    draft_completed: { label: '草稿完成', class: 'status-succeeded' },
  }
  
  const { label, class: className } = statusMap[status] || { label: status, class: 'status-queued' }
  
  return (
    <span className={`status-badge ${className}`}>
      {label}
    </span>
  )
}

// =====================================================
// 进度条组件
// =====================================================
function ProgressBar({ progress }) {
  return (
    <div className="progress-bar">
      <div 
        className="progress-bar-fill" 
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  )
}

// =====================================================
// 上传文件组件
// =====================================================
function FileUploader({ onFileSelect, accept, label }) {
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    
    const file = e.dataTransfer.files[0]
    if (file) {
      setFileName(file.name)
      onFileSelect(file)
    }
  }, [onFileSelect])
  
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])
  
  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
  }, [])
  
  const handleChange = useCallback((e) => {
    const file = e.target.files[0]
    if (file) {
      setFileName(file.name)
      onFileSelect(file)
    }
  }, [onFileSelect])
  
  return (
    <div className="mb-md">
      <label className="caption-strong mb-sm" style={{ display: 'block' }}>
        {label}
      </label>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--hairline)'}`,
          borderRadius: 'var(--rounded-lg)',
          padding: 'var(--spacing-lg)',
          textAlign: 'center',
          backgroundColor: dragOver ? 'rgba(0, 102, 204, 0.05)' : 'var(--canvas)',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }}
      >
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          style={{ display: 'none' }}
          id={`file-${label}`}
        />
        <label htmlFor={`file-${label}`} style={{ cursor: 'pointer' }}>
          {fileName ? (
            <span className="body-strong text-primary">{fileName}</span>
          ) : (
            <>
              <span className="body" style={{ color: 'var(--ink-muted-48)' }}>
                拖拽文件到此处或点击上传
              </span>
            </>
          )}
        </label>
      </div>
    </div>
  )
}

// =====================================================
// 项目选择项组件
// =====================================================
function ProjectSelectorItem({ project, selected, onToggle }) {
  return (
    <div 
      className={`project-selector-item ${selected ? 'selected' : ''}`}
      onClick={() => onToggle(project)}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(project)}
        className="project-checkbox"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="project-selector-info">
        <div className="flex items-center gap-sm">
          <span className="project-selector-icon"><Clapperboard size={16} /></span>
          <h3 className="body-strong">{project.name}</h3>
        </div>
        <p className="caption text-muted">
          更新于 {formatTime(project.updatedAt)}
        </p>
        {project.config?.scenes?.length > 0 && (
          <p className="caption text-muted">
            {project.config.scenes.length} 个场景
          </p>
        )}
        {project.config?.pipeline && (
          <div className="project-selector-tags">
            {project.config.pipeline.remove_keyword && (
              <span className="tag">移除：{project.config.pipeline.remove_keyword}</span>
            )}
            {project.config.subtitle?.effect && (
              <span className="tag">字幕：{project.config.subtitle.effect}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// =====================================================
// 任务列表项 (修复了下载功能，支持下载所有产物)
// =====================================================
function TaskListItem({ task, onRefresh, onCancel, apiBaseUrl }) {
  const [loading, setLoading] = useState(false)
  const effectiveApiUrl = apiBaseUrl || 'http://localhost:8001'
  
  const handleRefresh = async () => {
    setLoading(true)
    try {
      await onRefresh(task.task_id)
    } finally {
      setLoading(false)
    }
  }
  
  const handleCancel = async () => {
    if (!confirm('确定要取消这个任务吗？')) return
    
    try {
      await onCancel(task.task_id)
    } catch (err) {
      alert(`取消失败：${err.message}`)
    }
  }

  // 请求安全的下载直链
  const handleDownload = async (fileKey) => {
    try {
      const apiKey = localStorage.getItem('rjcut_api_key');
      const res = await fetch(`${effectiveApiUrl}/v1/tasks/${task.task_id}/files/${fileKey}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const data = await res.json();
      
      if (data.code === 0 && data.data?.download_url) {
        // 在新窗口打开直链，浏览器会自动开始下载或播放
        window.open(data.data.download_url, '_blank');
      } else {
        alert('获取下载链接失败: ' + (data.message || '未知错误'));
      }
    } catch (e) {
      alert('请求失败: ' + e.message);
    }
  };
  
  // 美化产物名称
  const getFileLabel = (key) => {
    const iconStyle = { display: 'inline', verticalAlign: 'middle', marginRight: '4px' };
    const labels = {
      final_video: <><Film size={14} style={iconStyle} /> 下载最终成片</>,
      cleaned_video: <><Scissors size={14} style={iconStyle} /> 下载去转场草稿视频</>,
      ass_file: <><FileText size={14} style={iconStyle} /> 下载 ASS 字幕</>,
      timeline_json: <><Clock size={14} style={iconStyle} /> 下载时间线数据</>,
      resync_json: <><RefreshCw size={14} style={iconStyle} /> 下载对齐数据</>,
      transcription_json: <><ScrollText size={14} style={iconStyle} /> 下载识别文本</>
    };
    return labels[key] || <><Download size={14} style={iconStyle} /> 下载 {key}</>;
  };

  return (
    <div className="card mb-md">
      <div className="flex justify-between items-center mb-sm">
        <div>
          <h3 className="body-strong mb-xs">
            {task.client_ref_id || task.task_id}
          </h3>
          <p className="caption text-muted">
            类型：{task.task_type === 'compose_from_draft' ? <><Clapperboard size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> 视频合成</> : 
                   task.task_type === 'agent_draft' ? <><FileText size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> 草稿生成</> : task.task_type} 
            &nbsp;|&nbsp; 
            创建时间：{formatTime(task.created_at)}
          </p>
        </div>
        <StatusBadge status={task.status} />
      </div>
      
      {task.status === 'processing' && (
        <div className="mb-md">
          <div className="flex justify-between items-center mb-xs">
            <span className="caption text-muted">{task.stage}</span>
            <span className="caption-strong">{task.progress}%</span>
          </div>
          <ProgressBar progress={task.progress} />
        </div>
      )}
      
      {task.error && (
        <div className="mb-md" style={{ 
          padding: 'var(--spacing-sm)',
          backgroundColor: 'rgba(255, 59, 48, 0.1)',
          borderRadius: 'var(--rounded-sm)',
        }}>
          <p className="caption text-muted" style={{ color: '#ff3b30' }}>
            错误：{task.error}
          </p>
        </div>
      )}
      
      <div className="flex gap-sm flex-wrap items-center">
        <button 
          className="btn btn-pearl-capsule btn-sm"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? <><RefreshCw size={14} className="spin" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> 刷新中...</> : <><RefreshCw size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> 刷新状态</>}
        </button>
        
        {(task.status === 'queued' || task.status === 'processing') && (
          <button 
            className="btn btn-ghost btn-sm"
            style={{ color: '#ff3b30' }}
            onClick={handleCancel}
            disabled={loading}
          >
            🚫 取消任务
          </button>
        )}
      </div>

      {/* 动态展示所有可以下载的文件产物 */}
      {task.status === 'succeeded' && task.result?.files && (
        <div className="flex gap-sm mt-md flex-wrap" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
          {Object.keys(task.result.files).map(key => (
            <button
              key={key}
              className={`btn btn-sm ${key === 'final_video' ? 'btn-primary' : 'btn-pearl-capsule'}`}
              onClick={() => handleDownload(key)}
            >
              {getFileLabel(key)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 主应用
// =====================================================
function App() {
  // 文件系统
  const [vfs, setVfs] = useState(null)
  const [vfsLoading, setVfsLoading] = useState(true)
  const vfsRef = useRef(null)
  
  // 配置状态
  const [apiKey, setApiKey] = useState(() => 
    localStorage.getItem('rjcut_api_key') || DEFAULT_API_KEY
  )
  const [apiBaseUrl, setApiBaseUrl] = useState(() => 
    localStorage.getItem('rjcut_api_base_url') || DEFAULT_API_BASE_URL
  )
  const [tasks, setTasks] = useState([])
  
  // UI 状态
  const [activeTab, setActiveTab] = useState('batch') // 'batch' | 'projects' | 'files' | 'tasks' | 'ai' | 'digital-human-studio' | 'digital-human-manager' | 'advanced-editor' | 'settings'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [merchantInfo, setMerchantInfo] = useState(null)
  
  // AI 聊天相关状态
  const [currentProject, setCurrentProject] = useState(null)
  
  // 数字人创作平台预选数字人
  const [studioPreselectedPerson, setStudioPreselectedPerson] = useState(null)
  
  // 帮助指南状态
  const [showHelp, setShowHelp] = useState(false)
  
  // 初始化文件系统
  useEffect(() => {
    const initVFS = async () => {
      console.log('[App] 开始初始化 VFS...')
      try {
        setVfsLoading(true)
        const sharedVfs = await getSharedFileSystem()
        console.log('[App] VFS 初始化成功:', sharedVfs)
        setVfs(sharedVfs)
        vfsRef.current = sharedVfs
      } catch (e) {
        console.error('[App] 初始化文件系统失败:', e)
        setError(`文件系统初始化失败：${e.message}`)
      } finally {
        setVfsLoading(false)
        console.log('[App] VFS 初始化完成，vfsLoading 设置为 false')
      }
    }
    
    initVFS()
  }, [])
  
  // 保存 API Key
  useEffect(() => {
    localStorage.setItem('rjcut_api_key', apiKey)
  }, [apiKey])
  
  // 保存 API 地址
  useEffect(() => {
    localStorage.setItem('rjcut_api_base_url', apiBaseUrl)
  }, [apiBaseUrl])
  
  // 获取商户信息
  const fetchMerchantInfo = useCallback(async () => {
    try {
      const res = await apiRequest('/v1/merchant/info', {}, apiKey, apiBaseUrl)
      setMerchantInfo(res.data)
    } catch (err) {
      console.error('获取商户信息失败:', err)
    }
  }, [apiKey, apiBaseUrl])
  
  // 获取任务列表
  const fetchTasks = useCallback(async () => {
    try {
      const res = await apiRequest('/v1/tasks?limit=50', {}, apiKey, apiBaseUrl)
      setTasks(res.data.items || [])
    } catch (err) {
      console.error('获取任务列表失败:', err)
    }
  }, [apiKey, apiBaseUrl])
  
  // 刷新单个任务
  const refreshTask = useCallback(async (taskId) => {
    try {
      const res = await apiRequest(`/v1/tasks/${taskId}`, {}, apiKey, apiBaseUrl)
      setTasks(prev => prev.map(t => t.task_id === taskId ? res.data : t))
    } catch (err) {
      throw err
    }
  }, [apiKey, apiBaseUrl])
  
  // 取消任务
  const cancelTask = useCallback(async (taskId) => {
    await apiRequest(`/v1/tasks/${taskId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: '用户取消' }),
    }, apiKey, apiBaseUrl)
    await refreshTask(taskId)
  }, [apiKey, apiBaseUrl, refreshTask])
  
  // 初始化加载
  useEffect(() => {
    fetchMerchantInfo()
    fetchTasks()
  }, [])
  
  // 自动刷新任务
  useEffect(() => {
    const interval = setInterval(() => {
      const hasProcessingTasks = tasks.some(t => t.status === 'processing' || t.status === 'queued')
      if (hasProcessingTasks) {
        fetchTasks()
      }
    }, 10000)
    
    return () => clearInterval(interval)
  }, [tasks, fetchTasks])
  
  return (
    <div style={{ minHeight: '100vh' }}>
      {/* 顶部导航 */}
      <nav style={{
        position: 'sticky',
        top: 0,
        backgroundColor: 'var(--surface-black)',
        color: 'var(--body-on-dark)',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--spacing-lg)',
        zIndex: 1000,
      }}>
        <div className="flex items-center gap-lg" style={{ flex: 1 }}>
          {/* RJCut Studio Logo */}
          <div className="flex items-center gap-sm" style={{ marginRight: 'auto' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* 背景圆 */}
              <circle cx="16" cy="16" r="15" fill="url(#logoGradient)" />
              {/* 播放按钮形状 */}
              <path d="M12 10L22 16L12 22V10Z" fill="white" />
              {/* 装饰线条 - 表示剪辑 */}
              <path d="M20 6L20 10" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
              <path d="M24 8L24 12" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
              <defs>
                <linearGradient id="logoGradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#3B82F6" />
                  <stop offset="1" stopColor="#2563EB" />
                </linearGradient>
              </defs>
            </svg>
            <h1 className="tagline" style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px' }}>
              RJCut <span style={{ color: 'var(--primary)', fontWeight: '600' }}>Studio</span>
            </h1>
          </div>
          <div className="flex gap-sm" style={{ marginLeft: 'auto' }}>
            <button 
              className={`btn btn-utility ${activeTab === 'projects' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('projects')}
              title="项目管理"
            >
              <FolderOpen size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>项目管理</span>
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'files' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('files')}
              title="文件浏览"
            >
              <Folder size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>文件浏览</span>
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'batch' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('batch')}
              title="批量处理"
            >
              <Layers size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>批量处理</span>
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'tasks' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('tasks')}
              title="任务列表"
            >
              <Clapperboard size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>任务列表</span>
            </button>

            <button 
              className={`btn btn-utility ${activeTab === 'ai' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('ai')}
              title="AI 助手（MCP 支持）"
            >
              <Bot size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>AI 助手</span>
            </button>
            
            <button 
              className={`btn btn-utility ${activeTab === 'digital-human-studio' ? 'text-primary' : ''}`}
              onClick={() => {
                console.log('[App] 点击数字人创作台按钮，切换 activeTab 到 digital-human-studio')
                setActiveTab('digital-human-studio')
              }}
              title="数字人创作平台"
            >
              <Sparkles size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>数字人创作台</span>
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'digital-human-manager' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('digital-human-manager')}
              title="数字人管理"
            >
              <User size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>数字人管理</span>
            </button>
            
            {/* 高级视频剪辑台入口 */}
            <button 
              className={`btn btn-utility ${activeTab === 'advanced-editor' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('advanced-editor')}
              title="高级视频剪辑"
            >
              <Scissors size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>高级剪辑</span>
            </button>
            
            <button 
              className={`btn btn-utility ${activeTab === 'settings' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('settings')}
              title="系统设置"
            >
              <Settings size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>设置</span>
            </button>
            <button 
              className="btn btn-utility"
              onClick={() => setShowHelp(true)}
              title="使用帮助"
            >
              <HelpCircle size={18} strokeWidth={2} />
              <span style={{ marginLeft: '6px' }}>帮助</span>
            </button>
          </div>
        </div>
      </nav>

      {/* 帮助指南弹窗 */}
      {showHelp && <HelpGuide onClose={() => setShowHelp(false)} />}
      
      {/* 子导航 */}
      <div style={{
        position: 'sticky',
        top: '44px',
        backgroundColor: 'rgba(245, 245, 247, 0.8)',
        backdropFilter: 'blur(20px)',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--spacing-lg)',
        borderBottom: `1px solid var(--hairline)`,
        zIndex: 999,
      }}>
        <span className="tagline" style={{ flex: 1 }}>
          {activeTab === 'projects' && '视频项目管理'}
          {activeTab === 'files' && '文件浏览器'}
          {activeTab === 'batch' && '批量视频处理'}
          {activeTab === 'tasks' && '任务管理'}
          {activeTab === 'ai' && 'AI 智能助手（MCP 支持）'}
          {activeTab === 'digital-human-studio' && '数字人创作平台'}
          {activeTab === 'digital-human-manager' && '数字人资产管理'}
          {activeTab === 'advanced-editor' && '高级视频剪辑台'}
          {activeTab === 'settings' && '设置'}
        </span>
        
        {merchantInfo && (
          <span className="caption text-muted">
            配额：{merchantInfo.quota_available} / {merchantInfo.quota_total}
          </span>
        )}
      </div>
      
      {/* 主内容区 */}
      <main style={{ 
        padding: activeTab === 'advanced-editor' ? '0' : 'var(--spacing-section) var(--spacing-lg)', 
        maxWidth: activeTab === 'advanced-editor' ? 'none' : '1440px', 
        margin: '0 auto', 
        minHeight: 'calc(100vh - 200px)' 
      }}>
        {/* 成功提示 */}
        {successMsg && (
          <div className="card mb-lg" style={{
            backgroundColor: 'rgba(52, 199, 89, 0.1)',
            border: '1px solid rgba(52, 199, 89, 0.3)',
          }}>
            <p className="body-strong" style={{ color: '#34c759' }}>{successMsg}</p>
          </div>
        )}
        
        {/* 错误提示 */}
        {error && (
          <div className="card mb-lg" style={{
            backgroundColor: 'rgba(255, 59, 48, 0.1)',
            border: '1px solid rgba(255, 59, 48, 0.3)',
          }}>
            <p className="body-strong" style={{ color: '#ff3b30' }}>{error}</p>
          </div>
        )}
        
        {/* 文件系统加载中 */}
        {vfsLoading && (
          <div className="tile tile-light">
            <div className="empty-state" style={{ padding: 'var(--spacing-xxl)' }}>
              <span className="empty-icon">⏳</span>
              <p className="empty-text">正在初始化文件系统...</p>
            </div>
          </div>
        )}
        
        {/* 项目管理页面 */}
        {!vfsLoading && activeTab === 'projects' && vfs && (
          <VideoProjectManager
            vfs={vfs}
            onOpenProject={(project) => {
              setActiveTab('files')
            }}
            onNavigate={(path) => {
              if (vfs) {
                vfs.cd(path)
              }
              setActiveTab('files')
            }}
          />
        )}
        
        {/* 文件浏览器页面 */}
        {!vfsLoading && activeTab === 'files' && vfs && (
          <div style={{ height: 'calc(100vh - 200px)' }}>
            <FileBrowser
              vfs={vfs}
              onFileSelect={(file) => {
                console.log('选中文件:', file)
              }}
              onFileOpen={(file) => {
                console.log('打开文件:', file)
              }}
            />
          </div>
        )}
        
        {/* 批量处理页面 */}
        {!vfsLoading && activeTab === 'batch' && vfs && (
          <div className="tile tile-light">
            <BatchProcessor
              vfs={vfs}
              apiKey={apiKey}
            />
          </div>
        )}
        
        {/* AI 助手页面 */}
        {!vfsLoading && activeTab === 'ai' && vfs && (
          <div className="tile tile-light" style={{ height: 'calc(100vh - 200px)' }}>
            <AIChat 
              vfs={vfs} 
              currentProject={currentProject}
              onProjectSwitch={(project) => {
                setCurrentProject(project)
              }}
              onFileCreated={(filePath) => {
                console.log('[App] 文件已创建:', filePath)
              }}
              apiClient={apiClient}
            />
          </div>
        )}
        
        {/* 任务列表页面 */}
        {!vfsLoading && activeTab === 'tasks' && (
          <div className="tile tile-parchment">
            <div style={{ maxWidth: '980px', margin: '0 auto' }}>
              <div className="flex justify-between items-center mb-xxl">
                <div>
                  <h2 className="display-lg mb-sm">任务列表</h2>
                  <p className="lead">查看和管理所有处理任务</p>
                </div>
                <button 
                  className="btn btn-pearl-capsule"
                  onClick={fetchTasks}
                >
                  刷新
                </button>
              </div>
              
              {tasks.length === 0 ? (
                <div className="text-center" style={{ padding: 'var(--spacing-xxl) 0' }}>
                  <p className="body text-muted">暂无任务</p>
                </div>
              ) : (
                tasks.map(task => (
                  <TaskListItem
                    key={task.task_id}
                    task={task}
                    onRefresh={refreshTask}
                    onCancel={cancelTask}
                    apiBaseUrl={apiBaseUrl}
                  />
                ))
              )}
            </div>
          </div>
        )}
        
        
        
        {/* 数字人资产管理页面 */}
        {activeTab === 'digital-human-manager' && (
          <div className="tile tile-light">
            <DigitalHumanManager 
              apiKey={apiKey} 
              onCreateVideo={(person) => {
                console.log('[App.jsx] 收到 onCreateVideo 回调，数字人:', person.name, person.id)
                console.log('[App.jsx] 当前 activeTab:', activeTab)
                console.log('[App.jsx] 设置 preselectedPerson:', person)
                console.log('[App.jsx] 切换 activeTab 到 digital-human-studio')
                // 先设置预选数字人
                setStudioPreselectedPerson(person)
                // 使用 setTimeout 确保状态更新后再切换 tab
                setTimeout(() => {
                  setActiveTab('digital-human-studio')
                }, 0)
              }}
            />
          </div>
        )}
        
        {/* 设置页面 */}
        {!vfsLoading && activeTab === 'settings' && (
          <div className="tile tile-light">
            <div style={{ maxWidth: '980px', margin: '0 auto' }}>
              <h2 className="display-lg mb-sm">设置</h2>
              <p className="lead mb-xxl">配置 API 和系统参数</p>
              
              <div className="card mb-lg">
                <h3 className="tagline mb-md">API 配置</h3>
                <div className="mb-md">
                  <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                    API Key
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="输入你的 API Key"
                  />
                  <p className="caption text-muted mb-sm" style={{ marginTop: 'var(--spacing-xs)' }}>
                    API Key 将保存在本地浏览器中
                  </p>
                </div>
                
                <div className="mb-md">
                  <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                    API 地址
                  </label>
                  <input
                    type="text"
                    className="input"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder="http://localhost:8001"
                  />
                  <p className="caption text-muted mb-sm" style={{ marginTop: 'var(--spacing-xs)' }}>
                    API 地址将保存在本地浏览器中
                  </p>
                </div>
                
                <button 
                  className="btn btn-primary"
                  onClick={fetchMerchantInfo}
                >
                  测试连接
                </button>
              </div>
              
              {merchantInfo && (
                <div className="card mb-lg">
                  <h3 className="tagline mb-md">商户信息</h3>
                  <div className="flex gap-lg" style={{ flexWrap: 'wrap' }}>
                    <div>
                      <p className="caption text-muted">商户 ID</p>
                      <p className="body-strong">{merchantInfo.merchant_id}</p>
                    </div>
                    <div>
                      <p className="caption text-muted">名称</p>
                      <p className="body-strong">{merchantInfo.name}</p>
                    </div>
                    <div>
                      <p className="caption text-muted">总配额</p>
                      <p className="body-strong">{merchantInfo.quota_total}</p>
                    </div>
                    <div>
                      <p className="caption text-muted">可用配额</p>
                      <p className="body-strong">{merchantInfo.quota_available}</p>
                    </div>
                    <div>
                      <p className="caption text-muted">最大并发</p>
                      <p className="body-strong">{merchantInfo.max_concurrent_tasks}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ============================================
           全屏页面（放在 main 外面，避免样式干扰）
           ============================================ */}
      
      {/* 数字人视频创作工作台 */}
      {activeTab === 'digital-human-studio' && (
        <div style={{
          position: 'fixed',
          top: '96px',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#f5f5f7',
          overflow: 'hidden',
        }}>
            <DigitalHumanStudio apiKey={apiKey} apiBaseUrl={apiBaseUrl} preselectedPerson={studioPreselectedPerson} />
        </div>
      )}
      
      {/* 高级视频剪辑台 */}
      {activeTab === 'advanced-editor' && (
        <div style={{
          position: 'fixed',
          top: '96px',
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          backgroundColor: '#0a0a0f',
        }}>
          {!vfsLoading && vfs && <AdvancedVideoEditor vfs={vfs} />}
        </div>
      )}
      
      {/* 页脚 */}
      <footer style={{
        backgroundColor: 'var(--canvas-parchment)',
        padding: 'var(--spacing-xxl) var(--spacing-lg)',
        borderTop: `1px solid var(--hairline)`,
      }}>
        <div style={{ maxWidth: '980px', margin: '0 auto' }}>
          <p className="fine-print text-muted text-center">
            RJCut Studio v1.0.0 | 基于 Apple 设计系统
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
