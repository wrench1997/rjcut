import { useState, useEffect, useCallback } from 'react'
import useBatchStore from '../api/useBatchProcessStore'
import { setApiKey } from '../api/api'

// =====================================================
// 进度条组件
// =====================================================
function ProgressBar({ progress, status }) {
  const statusColors = {
    uploading: '#007aff',
    drafting: '#5856d6',
    composing: '#ff9500',
    downloading: '#34c759',
    succeeded: '#34c759',
    failed: '#ff3b30',
    cancelled: '#8e8e93',
  }

  const color = statusColors[status] || '#007aff'

  return (
    <div className="progress-bar" style={{ 
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      borderRadius: '4px',
      height: '8px',
      overflow: 'hidden',
    }}>
      <div 
        className="progress-bar-fill" 
        style={{ 
          width: `${Math.min(progress, 100)}%`,
          backgroundColor: color,
          height: '100%',
          transition: 'width 0.3s ease, background-color 0.3s ease',
        }}
      />
    </div>
  )
}

// =====================================================
// 任务卡片组件 (优化了下载功能)
// =====================================================
function TaskCard({ task }) {
  const stageLabels = {
    idle: '等待中',
    uploading: '上传中',
    drafting: '草稿生成中',
    composing: '视频合成中',
    downloading: '下载中',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
  }

  const stageIcons = {
    idle: '⏳',
    uploading: '⬆️',
    drafting: '📝',
    composing: '🎬',
    downloading: '⬇️',
    succeeded: '✅',
    failed: '❌',
    cancelled: '🚫',
  }

  // 新增：请求后端的预签名下载链接并打开
  const handleDownload = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';
      const apiKey = localStorage.getItem('rjcut_api_key');
      
      // 如果有合成任务，优先下载成片 final_video；如果只有草稿，下载 cleaned_video
      const targetTaskId = task.composeTaskId || task.draftTaskId;
      const targetFileKey = task.composeTaskId ? 'final_video' : 'cleaned_video';

      const res = await fetch(`${API_BASE_URL}/v1/tasks/${targetTaskId}/files/${targetFileKey}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const data = await res.json();
      if (data.code === 0 && data.data?.download_url) {
        // 在新标签页打开视频下载/预览链接
        window.open(data.data.download_url, '_blank');
      } else {
        alert('获取下载链接失败: ' + (data.message || '未知错误'));
      }
    } catch (e) {
      alert('请求下载失败: ' + e.message);
    }
  };

  return (
    <div className="card" style={{
      backgroundColor: task.stage === 'failed' ? 'rgba(255, 59, 48, 0.05)' : 
                     task.stage === 'cancelled' ? 'rgba(142, 142, 147, 0.05)' :
                     task.stage === 'succeeded' ? 'rgba(52, 199, 89, 0.05)' :
                     'var(--surface)',
      border: task.stage === 'failed' ? '1px solid rgba(255, 59, 48, 0.2)' :
              task.stage === 'cancelled' ? '1px solid rgba(142, 142, 147, 0.2)' :
              task.stage === 'succeeded' ? '1px solid rgba(52, 199, 89, 0.2)' :
              '1px solid var(--hairline)',
    }}>
      <div className="flex justify-between items-center mb-sm">
        <div className="flex items-center gap-sm">
          <span style={{ fontSize: '20px' }}>{stageIcons[task.stage]}</span>
          <div>
            <h3 className="body-strong">{task.id}</h3>
            <p className="caption text-muted">
              {stageLabels[task.stage] || task.stage}
            </p>
          </div>
        </div>
        <span className="caption-strong">{Math.round(task.progress)}%</span>
      </div>

      <ProgressBar progress={task.progress} status={task.stage} />

      {task.error && (
        <div className="mt-sm" style={{ 
          padding: '8px',
          backgroundColor: 'rgba(255, 59, 48, 0.1)',
          borderRadius: '4px',
        }}>
          <p className="caption" style={{ color: '#ff3b30' }}>
            {task.error}
          </p>
        </div>
      )}

      {/* 修改这里：增加右侧的下载按钮 */}
      {(task.draftTaskId || task.composeTaskId) && (
        <div className="mt-sm flex justify-between items-end" style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
          <div>
            {task.draftTaskId && <div>草稿任务：{task.draftTaskId.substring(0, 8)}...</div>}
            {task.composeTaskId && <div>合成任务：{task.composeTaskId.substring(0, 8)}...</div>}
          </div>
          
          {task.stage === 'succeeded' && (
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDownload}
              style={{ padding: '4px 12px', borderRadius: '20px' }}
            >
              ⬇️ 下载成片
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 批量统计组件
// =====================================================
function BatchStats({ stats }) {
  return (
    <div className="flex gap-md" style={{ flexWrap: 'wrap' }}>
      <div className="card" style={{ flex: 1, minWidth: '120px' }}>
        <p className="caption text-muted">总任务数</p>
        <p className="display-sm">{stats.total}</p>
      </div>
      <div className="card" style={{ flex: 1, minWidth: '120px' }}>
        <p className="caption text-muted">成功</p>
        <p className="display-sm" style={{ color: '#34c759' }}>{stats.succeeded}</p>
      </div>
      <div className="card" style={{ flex: 1, minWidth: '120px' }}>
        <p className="caption text-muted">失败</p>
        <p className="display-sm" style={{ color: '#ff3b30' }}>{stats.failed}</p>
      </div>
      <div className="card" style={{ flex: 1, minWidth: '120px' }}>
        <p className="caption text-muted">已取消</p>
        <p className="display-sm" style={{ color: '#8e8e93' }}>{stats.cancelled}</p>
      </div>
      <div className="card" style={{ flex: 1, minWidth: '120px' }}>
        <p className="caption text-muted">进行中</p>
        <p className="display-sm" style={{ color: '#007aff' }}>{stats.running}</p>
      </div>
    </div>
  )
}

// =====================================================
// 文件选择器组件
// =====================================================
function FileSelector({ label, vfs, selectedFile, onSelect, accept, disabled, initialPath = '/raw', selectDirectory = false }) {
  const [showBrowser, setShowBrowser] = useState(false)
  const [browserPath, setBrowserPath] = useState(initialPath)
  const [browserItems, setBrowserItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [recentFiles, setRecentFiles] = useState([])

  // 加载目录内容
  const loadDirectory = async (path) => {
    if (!vfs) return
    try {
      setLoading(true)
      const items = vfs.listDirectory(path)
      setBrowserItems(items)
      setBrowserPath(path)
    } catch (e) {
      console.error('加载目录失败:', e)
    } finally {
      setLoading(false)
    }
  }

  // 递归搜索指定类型的文件
  const searchFilesInDirectory = async (path, acceptType) => {
    if (!vfs) return []
    try {
      const items = vfs.listDirectory(path)
      let results = []
      for (const item of items) {
        if (item.isDirectory) {
          const subResults = await searchFilesInDirectory(item.path, acceptType)
          results = results.concat(subResults)
        } else {
          const ext = item.name.split('.').pop().toLowerCase()
          if (acceptType === 'video/*' && ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
            results.push(item)
          } else if (acceptType === 'audio/*' && ['mp3', 'wav', 'm4a'].includes(ext)) {
            results.push(item)
          } else if (acceptType === '.json' && ext === 'json') {
            results.push(item)
          }
        }
      }
      return results
    } catch (e) {
      console.error('搜索文件失败:', e)
      return []
    }
  }

  useEffect(() => {
    if (showBrowser && vfs) {
      loadDirectory(browserPath)
      searchFilesInDirectory('/raw', accept).then(files => {
        setRecentFiles(files.slice(0, 10))
      })
    }
  }, [showBrowser, vfs, accept])

  const handleFileSelect = (item) => {
    if (!item.isDirectory) {
      if (!selectDirectory) {
        onSelect(item.path)
        setShowBrowser(false)
      }
    } else {
      loadDirectory(item.path)
    }
  }

  const handleNavigateUp = () => {
    const parent = browserPath.substring(0, browserPath.lastIndexOf('/')) || '/'
    loadDirectory(parent)
  }

  return (
    <div className="mb-md">
      <label className="caption-strong mb-sm" style={{ display: 'block' }}>
        {label}
      </label>
      {selectedFile ? (
        <div className="flex gap-sm items-center" style={{ flexWrap: 'wrap' }}>
          <span className="body" style={{ 
            flex: 1, 
            minWidth: '200px',
            padding: '8px',
            backgroundColor: 'rgba(0, 122, 255, 0.05)',
            borderRadius: '4px',
            border: '1px solid var(--primary)',
          }}>
            📄 {selectedFile}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onSelect(null)}
            disabled={disabled}
          >
            清除
          </button>
        </div>
      ) : (
        <button
          className="btn btn-pearl"
          onClick={() => setShowBrowser(true)}
          disabled={disabled || !vfs}
          style={{ width: '100%' }}
        >
          📁 从 VFS 选择文件
        </button>
      )}

      {/* 文件浏览器弹窗 */}
      {showBrowser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }} onClick={() => setShowBrowser(false)}>
          <div 
            className="card" 
            style={{ 
              width: '90%', 
              maxWidth: '700px', 
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-md">
              <h3 className="tagline">选择文件</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBrowser(false)}>
                ✕
              </button>
            </div>

            {/* 路径导航 */}
            <div className="flex items-center gap-sm mb-md" style={{ padding: '8px', backgroundColor: 'rgba(0, 0, 0, 0.05)', borderRadius: '4px' }}>
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={handleNavigateUp}
                disabled={browserPath === '/'}
              >
                ⬆️ 上级
              </button>
              <span className="caption-strong" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📂 {browserPath}
              </span>
            </div>

            {/* 快捷标签 */}
            <div className="flex gap-xs mb-md" style={{ flexWrap: 'wrap' }}>
              <button 
                className="btn btn-pearl-capsule btn-sm"
                onClick={() => loadDirectory('/raw')}
              >
                📁 项目目录
              </button>
              <button 
                className="btn btn-pearl-capsule btn-sm"
                onClick={() => loadDirectory('/drafts')}
              >
                📝 草稿目录
              </button>
              <button 
                className="btn btn-pearl-capsule btn-sm"
                onClick={() => loadDirectory('/audio')}
              >
                🎵 音频目录
              </button>
              <button 
                className="btn btn-pearl-capsule btn-sm"
                onClick={() => loadDirectory('/')}
              >
                🏠 根目录
              </button>
            </div>

            {/* 文件列表 */}
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--hairline)', borderRadius: '4px' }}>
              {loading ? (
                <div className="empty-state">加载中...</div>
              ) : browserItems.length === 0 ? (
                <div className="empty-state">
                  <span>空目录</span>
                </div>
              ) : (
                browserItems.map(item => (
                  <div
                    key={item.path}
                    className="flex items-center gap-sm"
                    style={{
                      padding: '10px',
                      borderBottom: '1px solid var(--hairline)',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                    }}
                    onClick={() => handleFileSelect(item)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 122, 255, 0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <span style={{ fontSize: '18px' }}>
                      {item.isDirectory ? '📁' : '📄'}
                    </span>
                    <span className="body">{item.name}</span>
                    {item.size && (
                      <span className="caption text-muted" style={{ marginLeft: 'auto' }}>
                        {(item.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* 如果是选择目录模式，增加底部选择当前目录的按钮 */}
            {selectDirectory && (
              <div className="flex justify-end mt-md" style={{ borderTop: '1px solid var(--hairline)', paddingTop: '16px' }}>
                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    onSelect(browserPath)
                    setShowBrowser(false)
                  }}
                >
                  确定选择此目录：{browserPath}
                </button>
              </div>
            )}

            {/* 最近文件 */}
            {!selectDirectory && recentFiles.length > 0 && (
              <div className="mt-md">
                <p className="caption-strong mb-sm">最近的文件</p>
                <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--hairline)', borderRadius: '4px' }}>
                  {recentFiles.map(item => (
                    <div
                      key={item.path}
                      className="flex items-center gap-sm"
                      style={{
                        padding: '8px',
                        borderBottom: '1px solid var(--hairline)',
                        cursor: 'pointer',
                        backgroundColor: 'rgba(52, 199, 89, 0.05)',
                      }}
                      onClick={() => handleFileSelect(item)}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(52, 199, 89, 0.15)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(52, 199, 89, 0.05)'}
                    >
                      <span style={{ fontSize: '16px' }}>📄</span>
                      <span className="caption">{item.name}</span>
                      <span className="caption text-muted" style={{ marginLeft: 'auto' }}>
                        {item.path}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 批量处理器主组件
// =====================================================
function BatchProcessor({ vfs, apiKey, className }) {
  const [selectedProjects, setSelectedProjects] = useState([])
  const [showConfigEditor, setShowConfigEditor] = useState(false)
  const [batchConfig, setBatchConfig] = useState({
    customConfig: '',
  })
  // 文件指定选项（只保留自定义文件模式）
  const [projectCustomFiles, setProjectCustomFiles] = useState({
    video: null,
    script: null,
    corrections: null,
    bgm: null,
    scenes: null,
  })
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [autoCompose, setAutoCompose] = useState(true)
  const [localError, setLocalError] = useState('')

  const {
    tasks,
    isRunning,
    isPaused,
    startTime,
    endTime,
    startBatch,
    abortBatch,
    reset,
    getTaskStats,
  } = useBatchStore()

  useEffect(() => {
    setApiKey(apiKey)
  }, [apiKey])

  const stats = getTaskStats()

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true)
        const projectList = await vfs.getVideoProjects()
        setProjects(projectList)
      } catch (e) {
        console.error('加载项目列表失败:', e)
        setLocalError(`加载项目失败：${e.message}`)
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
      setSelectedProjects(selectedProjects.filter(p => p.path !== project.path))
    } else {
      setSelectedProjects([...selectedProjects, project])
    }
  }

  const handleSelectAll = () => {
    if (selectedProjects.length === projects.length) {
      setSelectedProjects([])
    } else {
      setSelectedProjects([...projects])
    }
  }

  const prepareProjectTasks = useCallback(() => {
    return selectedProjects.map(project => {
      const videoPath = projectCustomFiles.video
      const scriptPath = projectCustomFiles.script
      const correctionsPath = projectCustomFiles.corrections
      const bgmPath = projectCustomFiles.bgm
      const scenesPath = projectCustomFiles.scenes
      
      return {
        id: project.name,
        vfsVideoPath: videoPath,
        vfsScriptPath: scriptPath,
        vfsCorrectionsPath: correctionsPath,
        vfsBgmPath: bgmPath,
        vfsScenesPath: scenesPath,
        stage: 'idle',
        progress: 0,
      }
    })
  }, [selectedProjects, projectCustomFiles])

  const prepareTasks = useCallback(() => {
    return prepareProjectTasks()
  }, [prepareProjectTasks])

  const handleStartBatch = async () => {
    setLocalError('')
    
    if (selectedProjects.length === 0) {
      setLocalError('请至少选择一个项目')
      return
    }

    if (!projectCustomFiles.video) {
      setLocalError('请选择视频文件')
      return
    }

    const taskItems = prepareTasks()
    if (taskItems.length === 0) {
      setLocalError('没有可处理的任务')
      return
    }
    
    startBatch(taskItems, maxConcurrent)
  }

  const getRunningDuration = () => {
    if (!startTime) return '0:00'
    const start = new Date(startTime)
    const end = endTime ? new Date(endTime) : new Date()
    const diff = Math.floor((end - start) / 1000)
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className={`batch-processor ${className || ''}`}>
      {tasks.length > 0 && (
        <div className="mb-xxl">
          <BatchStats stats={stats} />
          {isRunning && (
            <div className="mt-md text-center">
              <p className="caption text-muted">
                运行时长：{getRunningDuration()}
              </p>
            </div>
          )}
        </div>
      )}

      {tasks.length > 0 ? (
        <>
          <div className="grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 'var(--spacing-md)',
          }}>
            {tasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>

          <div className="flex gap-md justify-center mt-xxl">
            {isRunning && (
              <button
                className="btn btn-ghost"
                onClick={abortBatch}
                style={{ color: '#ff3b30' }}
              >
                🛑 取消所有任务
              </button>
            )}
            {!isRunning && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  reset()
                  setSelectedProjects([])
                  setProjectCustomFiles({ video: null, script: null, corrections: null, bgm: null, scenes: null })
                }}
              >
                返回选择
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="card mb-xxl">
          <div className="flex justify-between items-center mb-md">
            <h3 className="tagline">选择项目</h3>
            <button 
              className="btn btn-pearl-capsule"
              onClick={handleSelectAll}
            >
              {selectedProjects.length === projects.length ? '取消全选' : '全选'}
            </button>
          </div>

          {loading ? (
            <div className="empty-state">
              <span>加载项目中...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🎬</span>
              <p className="empty-text">暂无项目</p>
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {projects.map(project => (
                <div
                  key={project.path}
                  className={`project-selector-item ${
                    selectedProjects.some(p => p.path === project.path) ? 'selected' : ''
                  }`}
                  onClick={() => handleToggleProject(project)}
                  style={{
                    padding: 'var(--spacing-md)',
                    borderRadius: 'var(--rounded-md)',
                    cursor: 'pointer',
                    backgroundColor: selectedProjects.some(p => p.path === project.path) 
                      ? 'rgba(0, 122, 255, 0.1)' 
                      : 'transparent',
                    border: selectedProjects.some(p => p.path === project.path)
                      ? '1px solid var(--primary)'
                      : '1px solid var(--hairline)',
                    marginBottom: 'var(--spacing-sm)',
                  }}
                >
                  <div className="flex items-center gap-sm">
                    <input
                      type="checkbox"
                      checked={selectedProjects.some(p => p.path === project.path)}
                      onChange={() => {}}
                      onClick={(e) => e.stopPropagation()}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span className="body-strong">{project.name}</span>
                  </div>
                  <p className="caption text-muted mt-xs">
                    更新于 {new Date(project.updatedAt).toLocaleString('zh-CN')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tasks.length === 0 && (
        <>
          <div className="card mb-xxl">
            <div className="mb-md">
                <FileSelector
                  label="视频文件 *"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.video}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, video: path })}
                  accept="video/*"
                  disabled={isRunning}
                />

                <FileSelector
                  label="脚本文件 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.script}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, script: path })}
                  accept=".json"
                  disabled={isRunning}
                />

                <FileSelector
                  label="场景文件目录 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.scenes}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, scenes: path })}
                  accept="directory"
                  selectDirectory={true}
                  disabled={isRunning}
                />

                <FileSelector
                  label="修正文件 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.corrections}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, corrections: path })}
                  accept=".json"
                  disabled={isRunning}
                />

                <FileSelector
                  label="背景音乐 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.bgm}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, bgm: path })}
                  accept="audio/*"
                  disabled={isRunning}
                />
              </div>
          </div>

          <div className="card mb-xxl">
            <div className="flex justify-between items-center mb-md">
              <h3 className="tagline">处理配置</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowConfigEditor(!showConfigEditor)}
              >
                {showConfigEditor ? '收起' : '展开'}
              </button>
            </div>

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
                  disabled={isRunning}
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
                    disabled={isRunning}
                  />
                  <label htmlFor="auto-compose" className="body">
                    {autoCompose ? '启用' : '禁用'}
                  </label>
                </div>
              </div>
            </div>

            {showConfigEditor && (
              <div className="mt-md">
                <div className="mb-md">
                  <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                    自定义配置 (JSON，可选)
                  </label>
                  <textarea
                    className="input"
                    value={batchConfig.customConfig}
                    onChange={(e) => setBatchConfig({ ...batchConfig, customConfig: e.target.value })}
                    placeholder='{"pipeline": {"remove_keyword": "转场"}, "subtitle": {"effect": "ad"}}'
                    rows={4}
                    disabled={isRunning}
                    style={{ 
                      fontFamily: 'monospace',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {localError && (
            <div className="card mb-xxl" style={{
              backgroundColor: 'rgba(255, 59, 48, 0.1)',
              border: '1px solid rgba(255, 59, 48, 0.3)',
            }}>
              <p className="body-strong" style={{ color: '#ff3b30' }}>{localError}</p>
            </div>
          )}

          <div className="text-center">
            <button
              className="btn btn-primary"
              onClick={handleStartBatch}
              disabled={
                selectedProjects.length === 0 || 
                isRunning ||
                !projectCustomFiles.video
              }
              style={{
                fontSize: '18px',
                padding: '14px 40px',
                fontWeight: 300,
              }}
            >
              {isRunning 
                ? `处理中 (${stats.running}/${stats.total})` 
                : `启动 ${selectedProjects.length} 个项目`}
            </button>
            {!projectCustomFiles.video && (
              <p className="caption text-muted mt-sm" style={{ color: '#ff3b30' }}>
                ⚠️ 请选择视频文件
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default BatchProcessor
