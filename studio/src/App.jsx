import { useState, useEffect, useCallback, useRef } from 'react'
import { createDefaultFileSystem, getSharedFileSystem } from './utils/virtualFileSystem'
import FileBrowser from './components/FileBrowser'
import VideoProjectManager from './components/VideoProjectManager'
import AIChat from './components/AIChat'
import BatchConfigEditor from './components/BatchConfigEditor'

// =====================================================
// API 配置
// =====================================================
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001'
const DEFAULT_API_KEY = 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC'

// =====================================================
// 工具函数
// =====================================================
const generateTraceId = () => 'trace_' + Math.random().toString(36).substring(2, 18)

const apiRequest = async (endpoint, options = {}, apiKey = DEFAULT_API_KEY) => {
  const url = `${API_BASE_URL}${endpoint}`
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
          <span className="project-selector-icon">🎬</span>
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
// 批量处理项目选择器
// =====================================================
function BatchProjectSelector({ vfs, selectedProjects, onSelectionChange }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // 'all' | 'has_video' | 'has_config'
  const [searchQuery, setSearchQuery] = useState('')
  
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true)
        const projectList = await vfs.getVideoProjects()
        setProjects(projectList)
      } catch (e) {
        console.error('加载项目列表失败:', e)
      } finally {
        setLoading(false)
      }
    }
    
    if (vfs) {
      loadProjects()
    }
  }, [vfs])
  
  const handleToggleProject = (project) => {
    const isSelected = selectedProjects.some(p => p.path === project.path)
    if (isSelected) {
      onSelectionChange(selectedProjects.filter(p => p.path !== project.path))
    } else {
      onSelectionChange([...selectedProjects, project])
    }
  }
  
  const handleSelectAll = () => {
    if (selectedProjects.length === filteredProjects.length) {
      onSelectionChange([])
    } else {
      onSelectionChange([...filteredProjects])
    }
  }
  
  // 过滤项目
  const filteredProjects = projects.filter(project => {
    // 搜索过滤
    if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    
    // 状态过滤
    if (filter === 'has_video') {
      try {
        const rawItems = vfs.listDirectory(`${project.path}/raw`)
        return rawItems.some(item => !item.isDirectory && item.type?.startsWith('video/'))
      } catch {
        return false
      }
    } else if (filter === 'has_config') {
      return project.config?.scenes?.length > 0
    }
    
    return true
  })
  
  const allSelected = filteredProjects.length > 0 && selectedProjects.length === filteredProjects.length
  
  return (
    <div className="batch-project-selector">
      <div className="selector-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="搜索项目..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部项目</option>
          <option value="has_video">含视频文件</option>
          <option value="has_config">含场景配置</option>
        </select>
        
        <button 
          className="btn btn-pearl-capsule"
          onClick={handleSelectAll}
        >
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>
      
      <div className="selector-content">
        {loading ? (
          <div className="empty-state">
            <span>加载项目中...</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🎬</span>
            <p className="empty-text">暂无项目</p>
          </div>
        ) : (
          filteredProjects.map(project => (
            <ProjectSelectorItem
              key={project.path}
              project={project}
              selected={selectedProjects.some(p => p.path === project.path)}
              onToggle={handleToggleProject}
            />
          ))
        )}
      </div>
      
      <div className="selector-footer">
        <span className="caption text-muted">
          已选择 {selectedProjects.length} 个项目
        </span>
      </div>
    </div>
  )
}

// =====================================================
// 任务列表项
// =====================================================
function TaskListItem({ task, onRefresh, onCancel }) {
  const [loading, setLoading] = useState(false)
  
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
  
  return (
    <div className="card mb-md">
      <div className="flex justify-between items-center mb-sm">
        <div>
          <h3 className="body-strong mb-xs">
            {task.client_ref_id || task.task_id}
          </h3>
          <p className="caption text-muted">
            类型：{task.task_type} | 创建时间：{formatTime(task.created_at)}
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
      
      <div className="flex gap-sm">
        <button 
          className="btn btn-pearl-capsule"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? '刷新中...' : '刷新'}
        </button>
        
        {(task.status === 'queued' || task.status === 'processing') && (
          <button 
            className="btn btn-pearl-capsule"
            onClick={handleCancel}
            disabled={loading}
          >
            取消
          </button>
        )}
        
        {task.status === 'succeeded' && task.result?.files && (
          <a
            href={`${API_BASE_URL}/v1/tasks/${task.task_id}/files/final_video`}
            className="btn btn-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            下载视频
          </a>
        )}
      </div>
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
  const [tasks, setTasks] = useState([])
  const [selectedProjects, setSelectedProjects] = useState([])
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [autoCompose, setAutoCompose] = useState(true)
  
  // 批量处理配置
  const [batchConfig, setBatchConfig] = useState({
    tasks: [],
    bgmFile: null,
    customConfig: '',
  })
  const [showConfigEditor, setShowConfigEditor] = useState(false)
  
  // UI 状态
  const [activeTab, setActiveTab] = useState('batch') // 'batch' | 'projects' | 'files' | 'tasks' | 'settings' | 'ai'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [merchantInfo, setMerchantInfo] = useState(null)
  
  // AI 聊天相关状态
  const [currentProject, setCurrentProject] = useState(null)
  
  // 初始化文件系统
  useEffect(() => {
    const initVFS = async () => {
      try {
        setVfsLoading(true)
        const sharedVfs = await getSharedFileSystem()
        setVfs(sharedVfs)
        vfsRef.current = sharedVfs
      } catch (e) {
        console.error('初始化文件系统失败:', e)
        setError(`文件系统初始化失败：${e.message}`)
      } finally {
        setVfsLoading(false)
      }
    }
    
    initVFS()
  }, [])
  
  // 保存 API Key
  useEffect(() => {
    localStorage.setItem('rjcut_api_key', apiKey)
  }, [apiKey])
  
  // 获取商户信息
  const fetchMerchantInfo = useCallback(async () => {
    try {
      const res = await apiRequest('/v1/merchant/info', {}, apiKey)
      setMerchantInfo(res.data)
    } catch (err) {
      console.error('获取商户信息失败:', err)
    }
  }, [apiKey])
  
  // 获取任务列表
  const fetchTasks = useCallback(async () => {
    try {
      const res = await apiRequest('/v1/tasks?limit=50', {}, apiKey)
      setTasks(res.data.items || [])
    } catch (err) {
      console.error('获取任务列表失败:', err)
    }
  }, [apiKey])
  
  // 刷新单个任务
  const refreshTask = useCallback(async (taskId) => {
    try {
      const res = await apiRequest(`/v1/tasks/${taskId}`, {}, apiKey)
      setTasks(prev => prev.map(t => t.task_id === taskId ? res.data : t))
    } catch (err) {
      throw err
    }
  }, [apiKey])
  
  // 取消任务
  const cancelTask = useCallback(async (taskId) => {
    await apiRequest(`/v1/tasks/${taskId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: '用户取消' }),
    }, apiKey)
    await refreshTask(taskId)
  }, [apiKey, refreshTask])
  
  // 上传文件
  const uploadFile = useCallback(async (file, filename, purpose) => {
    const traceId = generateTraceId()
    
    // 处理 Blob 对象（来自虚拟文件系统）
    let fileToUpload = file
    let uploadFilename = filename
    let contentType = file.type
    
    // 如果传入的是 Blob 而不是 File，需要创建 File 对象
    if (file instanceof Blob && !(file instanceof File)) {
      fileToUpload = new File([file], filename, { type: filename.endsWith('.mp4') ? 'video/mp4' : filename.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream' })
      uploadFilename = filename
      contentType = fileToUpload.type
    } else if (file instanceof File) {
      uploadFilename = file.name
      contentType = file.type
    }
    
    // 1. 获取预签名 URL
    const presignRes = await apiRequest('/v1/uploads/presign', {
      method: 'POST',
      body: JSON.stringify({
        filename: uploadFilename,
        content_type: contentType,
        purpose: purpose,
      }),
    }, apiKey)
    
    const { upload_url, oss_key, upload_id } = presignRes.data
    
    // 2. 上传文件到 OSS
    const uploadRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: fileToUpload,
    })
    
    if (!uploadRes.ok) {
      throw new Error('文件上传失败')
    }
    
    // 3. 确认上传
    const confirmRes = await apiRequest('/v1/uploads/confirm', {
      method: 'POST',
      body: JSON.stringify({ upload_id }),
    }, apiKey)
    
    return confirmRes.data.oss_key
  }, [apiKey])
  
  // 提交单个项目任务
  const submitProjectTask = useCallback(async (project, globalConfig) => {
    const traceId = generateTraceId()
    
    // 获取项目中的视频文件
    let videoOssKey = null
    try {
      const rawItems = vfs.listDirectory(`${project.path}/raw`)
      const videoFiles = rawItems.filter(item => !item.isDirectory && item.type?.startsWith('video/'))
      if (videoFiles.length === 0) {
        throw new Error(`项目 "${project.name}" 中没有视频文件`)
      }
      // 使用第一个视频文件
      const videoFile = videoFiles[0]
      const videoBlob = await vfs.readFileAsBlob(videoFile.path)
      videoOssKey = await uploadFile(videoBlob, videoFile.name, 'input')
    } catch (e) {
      throw new Error(`获取项目视频失败：${e.message}`)
    }
    
    // 获取商户 ID
    const merchantRes = await apiRequest('/v1/merchant/info', {}, apiKey)
    const merchantId = merchantRes.data.merchant_id
    
    // 使用项目配置或全局配置
    const projectConfig = project.config || {}
    const customConfig = globalConfig.customConfig ? JSON.parse(globalConfig.customConfig) : {}
    
    // 构建草稿任务请求
    const draftRequest = {
      input: {
        video_url: videoOssKey,
        scene_base_url: merchantId,
      },
      pipeline: customConfig.pipeline || projectConfig.pipeline || {
        remove_keyword: '转场',
        margin: 0.15,
        min_segment_duration: 0.1,
      },
      asr: customConfig.asr || projectConfig.asr || {
        model: 'large-v3',
        device: 'cuda',
        language: 'zh',
      },
      draft: {
        need_transcription: true,
        need_timeline: true,
      },
      timeout_seconds: 1800,
    }
    
    // 提交草稿任务
    const draftRes = await apiRequest('/v1/tasks/agent-draft', {
      method: 'POST',
      body: JSON.stringify(draftRequest),
    }, apiKey)
    
    const draftTaskId = draftRes.data.task_id
    
    // 如果需要自动合成
    if (autoCompose) {
      // 上传背景音乐（如果有）
      let bgmOssKey = null
      if (globalConfig.bgmFile) {
        bgmOssKey = await uploadFile(globalConfig.bgmFile, globalConfig.bgmFile.name, 'input')
      }
      
      const composeRequest = {
        draft_task_id: draftTaskId,
        pipeline: customConfig.compose_pipeline || projectConfig.compose_pipeline || {
          use_transitions: false,
          transition_type: 'fade',
          transition_duration: 0.8,
          resync_subtitle: true,
        },
        asr: customConfig.asr || projectConfig.asr || {
          model: 'large-v3',
          device: 'cuda',
          language: 'zh',
        },
        subtitle: customConfig.subtitle || projectConfig.subtitle || {
          effect: 'ad',
          font_size: 88,
        },
        audio: {
          bgm_url: bgmOssKey,
          bgm_volume: customConfig.audio?.bgm_volume || projectConfig.audio?.bgm_volume || 0.3,
          original_volume: customConfig.audio?.original_volume || projectConfig.audio?.original_volume || 1.0,
          bgm_start_time: customConfig.audio?.bgm_start_time || 0.0,
          bgm_loop: customConfig.audio?.bgm_loop ?? true,
          fade_in_duration: customConfig.audio?.fade_in_duration || 0.5,
          fade_out_duration: customConfig.audio?.fade_out_duration || 0.5,
        },
        output: {
          need_ass: true,
        },
        timeout_seconds: 1800,
      }
      
      await apiRequest('/v1/tasks/compose-from-draft', {
        method: 'POST',
        body: JSON.stringify(composeRequest),
      }, apiKey)
    }
    
    return draftTaskId
  }, [apiKey, autoCompose, uploadFile, vfs])
  
  // 提交批量任务
  const submitBatchTasks = useCallback(async () => {
    if (!vfs) {
      setError('文件系统未初始化')
      return
    }
    
    if (selectedProjects.length === 0) {
      setError('请至少选择一个项目')
      return
    }
    
    setLoading(true)
    setError('')
    setSuccessMsg('')
    
    try {
      // 并发控制
      const results = []
      for (let i = 0; i < selectedProjects.length; i += maxConcurrent) {
        const batch = selectedProjects.slice(i, i + maxConcurrent)
        const batchPromises = batch.map(project => 
          submitProjectTask(project, batchConfig)
            .then(taskId => ({ success: true, taskId, name: project.name }))
            .catch(err => ({ success: false, error: err.message, name: project.name }))
        )
        
        const batchResults = await Promise.all(batchPromises)
        results.push(...batchResults)
      }
      
      const successCount = results.filter(r => r.success).length
      const failCount = results.filter(r => !r.success).length
      
      if (successCount > 0) {
        setSuccessMsg(`成功提交 ${successCount} 个项目`)
        await fetchTasks()
        setActiveTab('tasks')
      }
      
      if (failCount > 0) {
        setError(`失败 ${failCount} 个项目：${results.filter(r => !r.success).map(r => r.name).join(', ')}`)
      }
      
      // 清除选择
      setSelectedProjects([])
      
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [selectedProjects, maxConcurrent, batchConfig, submitProjectTask, fetchTasks, vfs])
  
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
          <h1 className="tagline">RJCut Studio</h1>
          <div className="flex gap-sm" style={{ marginLeft: 'auto' }}>
            <button 
              className={`btn btn-utility ${activeTab === 'projects' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('projects')}
            >
              项目管理
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'files' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('files')}
            >
              文件浏览
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'batch' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('batch')}
            >
              批量处理
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'tasks' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('tasks')}
            >
              任务列表
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'ai' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              🤖 AI 助手
            </button>
            <button 
              className={`btn btn-utility ${activeTab === 'settings' ? 'text-primary' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              设置
            </button>
          </div>
        </div>
      </nav>
      
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
          {activeTab === 'ai' && 'AI 智能助手'}
          {activeTab === 'settings' && '设置'}
        </span>
        
        {merchantInfo && (
          <span className="caption text-muted">
            配额：{merchantInfo.quota_available} / {merchantInfo.quota_total}
          </span>
        )}
      </div>
      
      {/* 主内容区 */}
      <main style={{ padding: 'var(--spacing-section) var(--spacing-lg)', maxWidth: '1440px', margin: '0 auto', minHeight: 'calc(100vh - 200px)' }}>
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
            <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
              <div className="flex justify-between items-center mb-lg">
                <div>
                  <h2 className="display-lg mb-sm">批量视频处理</h2>
                  <p className="lead">
                    选择项目进行批量处理，支持并发处理和自动合成
                  </p>
                </div>
                <button
                  className="btn btn-pearl-capsule"
                  onClick={() => setShowConfigEditor(!showConfigEditor)}
                >
                  {showConfigEditor ? '隐藏配置编辑器' : '显示配置编辑器'}
                </button>
              </div>
              
              {/* 配置编辑器 */}
              {showConfigEditor && (
                <div className="card mb-xxl">
                  <BatchConfigEditor
                    config={batchConfig}
                    onChange={setBatchConfig}
                    vfs={vfs}
                    apiBaseUrl={API_BASE_URL}
                    apiKey={apiKey}
                  />
                </div>
              )}
              
              {/* 全局配置 */}
              <div className="card mb-xxl">
                <h3 className="tagline mb-md">处理配置</h3>
                <div className="flex gap-lg items-center" style={{ flexWrap: 'wrap' }}>
                  <div>
                    <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                      最大并发数
                    </label>
                    <select 
                      className="input" 
                      value={maxConcurrent}
                      onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                      style={{ width: 'auto', minWidth: '120px' }}
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                      自动合成
                    </label>
                    <div className="flex items-center gap-xs">
                      <input
                        type="checkbox"
                        id="auto-compose"
                        checked={autoCompose}
                        onChange={(e) => setAutoCompose(e.target.checked)}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <label htmlFor="auto-compose" className="body">
                        {autoCompose ? '启用' : '禁用'}
                      </label>
                    </div>
                  </div>
                  
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                      自定义配置 (JSON，可选)
                    </label>
                    <textarea
                      className="input"
                      value={batchConfig.customConfig}
                      onChange={(e) => setBatchConfig({ ...batchConfig, customConfig: e.target.value })}
                      placeholder='{"pipeline": {"remove_keyword": "转场"}, "subtitle": {"effect": "ad"}}'
                      rows={3}
                      style={{ 
                        borderRadius: 'var(--rounded-md)',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        width: '100%',
                      }}
                    />
                  </div>
                </div>
              </div>
              
              {/* 项目选择器 */}
              <div className="mb-xxl">
                <div className="flex justify-between items-center mb-lg">
                  <h3 className="tagline">选择项目</h3>
                  {selectedProjects.length > 0 && (
                    <span className="caption-strong text-primary">
                      已选择 {selectedProjects.length} 个项目
                    </span>
                  )}
                </div>
                
                <BatchProjectSelector
                  vfs={vfs}
                  selectedProjects={selectedProjects}
                  onSelectionChange={setSelectedProjects}
                />
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-md justify-center">
                <button 
                  className="btn btn-ghost"
                  onClick={() => setShowConfigEditor(true)}
                  disabled={selectedProjects.length === 0}
                >
                  🔍 验证配置
                </button>
                
                <button 
                  className="btn btn-primary"
                  onClick={submitBatchTasks}
                  disabled={loading || selectedProjects.length === 0}
                  style={{ 
                    fontSize: '18px', 
                    padding: '14px 28px',
                    fontWeight: 300,
                  }}
                >
                  {loading 
                    ? '提交中...' 
                    : `提交 ${selectedProjects.length} 个项目`}
                </button>
              </div>
            </div>
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
                  />
                ))
              )}
            </div>
          </div>
        )}
        
        {/* AI 聊天页面 */}
        {!vfsLoading && activeTab === 'ai' && vfs && (
          <div style={{ height: 'calc(100vh - 200px)' }}>
            <AIChat
              vfs={vfs}
              currentProject={currentProject}
              onProjectSwitch={(project) => {
                setCurrentProject(project)
              }}
              onFileCreated={(filePath) => {
                console.log('AI 创建的文件:', filePath)
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
                    value={API_BASE_URL}
                    disabled
                    style={{ backgroundColor: 'var(--surface-pearl)', cursor: 'not-allowed' }}
                  />
                  <p className="caption text-muted mb-sm" style={{ marginTop: 'var(--spacing-xs)' }}>
                    如需修改，请编辑 .env 文件或 vite.config.js
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
