import { useState, useEffect, useCallback } from 'react'
import { VideoPreview } from './FileBrowser'
import { DigitalHumanVFSImporter } from './DigitalHumanVFSImporter'
import { Film, Trash2, Copy, Upload, FileText, Video, AlertTriangle, Check, X, FolderOpen, Scissors, Clapperboard, Send, Folder, Music, Download } from 'lucide-react'
import { PROJECT_FOLDERS } from '../utils/project-structure'

// =====================================================
// 项目卡片组件
// =====================================================
function ProjectCard({ project, onSelect, onDelete, onDuplicate }) {
  const [showActions, setShowActions] = useState(false)
  
  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  
  return (
    <div 
      className="project-card"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onSelect(project)}
    >
      <div className="project-card-icon">
        <Film size={32} strokeWidth={1.5} className="text-blue-500" />
      </div>
      <h3 className="project-card-title">{project.name}</h3>
      <p className="project-card-meta">
        更新于 {formatDate(project.updatedAt)}
      </p>
      {showActions && (
        <div className="project-card-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              onDuplicate(project)
            }}
            title="复制项目"
          >
            <Copy size={16} strokeWidth={2} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(project)
            }}
            title="删除项目"
            style={{ color: '#ff3b30' }}
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 新建项目对话框
// =====================================================
function NewProjectDialog({ vfs, onClose, onCreated }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('请输入项目名称')
      return
    }
    
    try {
      setLoading(true)
      
      // 项目只创建根目录，素材目录在首次使用时按需生成。
      const projectPath = await vfs.createVideoProject(name)
      
      onCreated?.(projectPath)
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">新建视频项目</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-md">
            <label className="caption-strong mb-sm" style={{ display: 'block' }}>
              项目名称
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="例如：产品宣传视频 01"
              autoFocus
            />
            {error && (
              <p className="caption text-muted" style={{ color: '#ff3b30', marginTop: '4px' }}>
                {error}
              </p>
            )}
          </div>
          
          <div className="mb-md rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
            <p className="caption text-blue-700" style={{ fontSize: '12px' }}>
              创建后只保留项目目录。文案、场景素材和成片目录会在真正使用时自动生成，避免空目录堆积。
            </p>
          </div>
          
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// =====================================================
// 创作脚本查看器组件（不包含项目元数据）
// =====================================================
function JSONScriptViewer({ project, vfs }) {
  const [scriptContent, setScriptContent] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeScript, setActiveScript] = useState('scenes.json')
  
  const scriptFiles = [
    { name: 'scenes.json', label: '场景脚本', icon: <FileText size={14} /> },
    { name: 'timeline.json', label: '时间线', icon: <Clapperboard size={14} /> },
  ]
  
  useEffect(() => {
    const loadScript = async () => {
      try {
        setLoading(true)
        const scriptPath = `${project.path}/${activeScript}`
        const content = await vfs.readFile(scriptPath)
        const parsed = JSON.parse(content)
        setScriptContent(parsed)
      } catch (e) {
        if (e.message.includes('文件不存在')) {
          setScriptContent({ error: '文件不存在', message: `尚未创建 ${activeScript}` })
        } else {
          setScriptContent({ error: true, message: e.message })
        }
      } finally {
        setLoading(false)
      }
    }
    
    if (project && activeScript) {
      loadScript()
    }
  }, [project, vfs, activeScript])
  
  const handleSave = async () => {
    try {
      setLoading(true)
      await vfs.writeJSON(`${project.path}/${activeScript}`, scriptContent)
      setIsEditing(false)
    } catch (e) {
      alert(`保存失败：${e.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="json-script-viewer">
      <div className="script-tabs">
        {scriptFiles.map(script => (
          <button
            key={script.name}
            className={`script-tab ${activeScript === script.name ? 'active' : ''}`}
            onClick={() => setActiveScript(script.name)}
          >
            <span className="script-tab-icon">{script.icon}</span>
            <span className="script-tab-label">{script.label}</span>
          </button>
        ))}
      </div>
      
      <div className="script-content">
        {loading ? (
          <div className="empty-state">
            <span>加载中...</span>
          </div>
        ) : scriptContent?.error ? (
          <div className="empty-state">
            <span className="empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={48} strokeWidth={1.5} className="text-amber-400" />
          </span>
            <p className="empty-text">{scriptContent.message}</p>
          </div>
        ) : (
          <>
            <div className="script-header">
              <h4 className="caption-strong">{activeScript}</h4>
              <div className="script-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIsEditing(!isEditing)}
                  disabled={loading}
                >
                  {isEditing ? '取消' : '编辑'}
                </button>
                {isEditing && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSave}
                    disabled={loading}
                  >
                    {loading ? '保存中...' : '保存'}
                  </button>
                )}
              </div>
            </div>
            
            {isEditing ? (
              <textarea
                className="file-editor script-editor"
                value={JSON.stringify(scriptContent, null, 2)}
                onChange={(e) => {
                  try {
                    const newContent = JSON.parse(e.target.value)
                    setScriptContent(newContent)
                  } catch (err) {
                    // 忽略 JSON 解析错误
                  }
                }}
                rows={16}
                disabled={loading}
              />
            ) : (
              <pre className="file-preview script-preview">
                <code>{JSON.stringify(scriptContent, null, 2)}</code>
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// =====================================================
// 项目视频内容查看器
// =====================================================
function ProjectVideoViewer({ project, vfs, onNavigate, refreshKey = 0 }) {
  const [videos, setVideos] = useState([])
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [videoCategory, setVideoCategory] = useState(PROJECT_FOLDERS.RAW_VIDEO)
  
  const categories = [
    { id: PROJECT_FOLDERS.RAW_VIDEO, label: '文案素材', icon: <Clapperboard size={14} />, path: `/${PROJECT_FOLDERS.RAW_VIDEO}` },
    { id: PROJECT_FOLDERS.EDITED_VIDEO, label: '场景素材', icon: <Scissors size={14} />, path: `/${PROJECT_FOLDERS.EDITED_VIDEO}` },
    { id: PROJECT_FOLDERS.OUTPUT, label: '成片输出', icon: <Send size={14} />, path: `/${PROJECT_FOLDERS.OUTPUT}` },
  ]
  
  useEffect(() => {
    const loadVideos = async () => {
      try {
        const categoryPath = `${project.path}/${videoCategory}`
        const items = await vfs.listDirectory(categoryPath)
        const videoItems = items.filter(item => 
          !item.isDirectory && item.type?.startsWith('video/')
        )
        setVideos(videoItems)
        if (videoItems.length > 0 && !selectedVideo) {
          setSelectedVideo(videoItems[0])
        }
      } catch (e) {
        console.error('加载视频失败:', e)
        setVideos([])
      }
    }
    
    if (project) {
      loadVideos()
    }
  }, [project, vfs, videoCategory, refreshKey])
  
  return (
    <div className="project-video-viewer">
      <div className="video-category-tabs">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`video-category-tab ${videoCategory === cat.id ? 'active' : ''}`}
            onClick={() => {
              setVideoCategory(cat.id)
              setSelectedVideo(null)
            }}
          >
            <span className="category-tab-icon">{cat.icon}</span>
            <span className="category-tab-label">{cat.label}</span>
          </button>
        ))}
      </div>
      
      <div className="video-viewer-content">
        <div className="video-list-panel">
          <div className="video-list-header">
            <h4 className="caption-strong">视频文件</h4>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onNavigate({ path: `${project.path}/${videoCategory}` })}
            >
              在文件浏览器中打开
            </button>
          </div>
          
          <div className="video-list">
            {videos.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Film size={48} strokeWidth={1.5} className="text-slate-300" />
          </span>
                <p className="empty-text">暂无视频</p>
              </div>
            ) : (
              videos.map(video => (
                <div
                  key={video.path}
                  className={`video-list-item ${selectedVideo?.path === video.path ? 'selected' : ''}`}
                  onClick={() => setSelectedVideo(video)}
                >
                  <span className="video-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Film size={18} strokeWidth={2} className="text-purple-500" />
          </span>
                  <span className="video-name">{video.name}</span>
                  <span className="video-size">
                    {(video.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="video-preview-panel">
          {selectedVideo ? (
            <VideoPreview file={selectedVideo} vfs={vfs} />
          ) : (
            <div className="empty-state">
              <span className="empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Film size={48} strokeWidth={1.5} className="text-slate-300" />
          </span>
              <p className="empty-text">选择视频进行预览</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 项目详情面板
// =====================================================
function ProjectDetail({ project, vfs, onBack, onOpen, onNavigate }) {
  const config = {
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'scripts' | 'videos' | 'files'
  const [showDHImporter, setShowDHImporter] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const [videoRefreshKey, setVideoRefreshKey] = useState(0)
  
  return (
    <div className="project-detail">
      <div className="project-detail-header">
        <div className="flex items-center gap-md">
          <button
            className="btn btn-ghost"
            onClick={onBack}
          >
            ← 返回
          </button>
          <div>
            <h2 className="tagline mb-xs">{project.name}</h2>
            <p className="caption text-muted">
              创建于 {new Date(project.createdAt).toLocaleDateString('zh-CN')}
            </p>
          </div>
        </div>
        
        <div className="project-detail-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setShowDHImporter(true)}
            title="导入数字人视频"
          >
            🎭 导入数字人视频
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onOpen(project)}
          >
            打开项目
          </button>
        </div>
      </div>
      
      <div className="project-detail-tabs">
        <button
          className={`project-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 概览
        </button>
        <button
          className={`project-tab ${activeTab === 'scripts' ? 'active' : ''}`}
          onClick={() => setActiveTab('scripts')}
        >
          <FileText size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> JSON 脚本
        </button>
        <button
          className={`project-tab ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => setActiveTab('videos')}
        >
          <Clapperboard size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> 视频内容
        </button>
        <button
          className={`project-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <Folder size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> 文件
        </button>
      </div>
      
      <div className="project-detail-content">
        {activeTab === 'overview' && (
          <div className="project-overview">
            {config?.error ? (
              <div className="empty-state">
                <span className="empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={48} strokeWidth={1.5} className="text-amber-400" />
          </span>
                <p className="empty-text">加载项目配置失败：{config.message}</p>
              </div>
            ) : config ? (
              <>
                <div className="overview-section">
                  <h3 className="caption-strong mb-sm">项目信息</h3>
                  <div className="config-grid">
                    <div className="config-item">
                      <span className="config-label">项目名称:</span>
                      <span className="config-value">{config.name || project.name}</span>
                    </div>
                    <div className="config-item">
                      <span className="config-label">创建时间:</span>
                      <span className="config-value">
                        {new Date(config.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className="config-item">
                      <span className="config-label">更新时间:</span>
                      <span className="config-value">
                        {new Date(config.updatedAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="overview-section">
                  <h3 className="caption-strong mb-sm">项目目录</h3>
                  <p className="caption text-muted mb-md">
                    目录本身就是项目，不再生成 project.json。文案、场景素材和成片目录会在真正使用时按需创建。
                  </p>
                  <div className="config-grid">
                    <div className="config-item">
                      <span className="config-label">项目路径:</span>
                      <span className="config-value">{project.path}</span>
                    </div>
                    <div className="config-item">
                      <span className="config-label">配置方式:</span>
                      <span className="config-value">按功能生成</span>
                    </div>
                  </div>
                </div>
                
                {config.scenes && config.scenes.length > 0 && (
                  <div className="overview-section">
                    <h3 className="caption-strong mb-sm">场景列表 ({config.scenes.length} 个)</h3>
                    <div className="scenes-list">
                      {config.scenes.map((scene, index) => (
                        <div key={index} className="scene-item">
                          <span className="scene-number">{index + 1}</span>
                          <div className="scene-info">
                            <p className="scene-text">{scene.text}</p>
                            {scene.keywords && scene.keywords.length > 0 && (
                              <div className="scene-keywords">
                                {scene.keywords.map((kw, i) => (
                                  <span key={i} className="keyword-tag">{kw}</span>
                                ))}
                              </div>
                            )}
                            <p className="scene-meta">
                              {scene.start_time !== undefined ? `${scene.start_time.toFixed(2)}s` : '-'} 
                              {' → '} 
                              {scene.end_time !== undefined ? `${scene.end_time.toFixed(2)}s` : '-'}
                              {scene.duration && (
                                <span className="scene-duration">
                                  (时长：{scene.duration.toFixed(2)}s)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <span>加载项目配置中...</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scripts' && (
          <JSONScriptViewer 
            project={project} 
            vfs={vfs} 
          />
        )}
        
        {activeTab === 'videos' && (
          <ProjectVideoViewer
            project={project}
            vfs={vfs}
            onNavigate={onNavigate}
            refreshKey={videoRefreshKey}
          />
        )}
        
        {activeTab === 'files' && (
          <div className="project-files">
            <p className="caption text-muted mb-md">
              项目文件存储在：{project.path}
            </p>
            <div className="file-quick-access">
              <div 
                className="quick-folder" 
                onClick={() => onNavigate({ path: `${project.path}/${PROJECT_FOLDERS.RAW_VIDEO}` })}
              >
                <span className="folder-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Film size={20} strokeWidth={2} className="text-purple-500" />
                </span>
                <span className="folder-name">文案素材</span>
              </div>
              <div 
                className="quick-folder" 
                onClick={() => onNavigate({ path: `${project.path}/${PROJECT_FOLDERS.EDITED_VIDEO}` })}
              >
                <span className="folder-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Scissors size={20} strokeWidth={2} className="text-pink-500" />
                </span>
                <span className="folder-name">场景素材</span>
              </div>
              <div 
                className="quick-folder" 
                onClick={() => onNavigate({ path: `${project.path}/${PROJECT_FOLDERS.OUTPUT}` })}
              >
                <span className="folder-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Download size={20} strokeWidth={2} className="text-emerald-500" />
                </span>
                <span className="folder-name">成片输出</span>
              </div>
            </div>
          </div>
        )}

        {showDHImporter && (
          <DigitalHumanVFSImporter
            projectPath={project.path}
            onImportComplete={(videoInfo) => {
              setImportStatus({
                success: true,
                message: `视频已导入：${videoInfo.name}`,
              })
              setVideoRefreshKey(value => value + 1)
              setActiveTab('videos')
              setShowDHImporter(false)
            }}
            onClose={() => setShowDHImporter(false)}
            onError={(err) => {
              setImportStatus({ success: false, message: err.message })
              setShowDHImporter(false)
            }}
          />
        )}

        {importStatus && (
          <div
            className={`toast ${importStatus.success ? 'toast-success' : 'toast-error'}`}
            onClick={() => setImportStatus(null)}
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              padding: 'var(--spacing-md)',
              borderRadius: 'var(--rounded-md)',
              backgroundColor: importStatus.success
                ? 'rgba(52, 199, 89, 0.9)'
                : 'rgba(255, 59, 48, 0.9)',
              color: 'white',
              cursor: 'pointer',
              zIndex: 10000,
            }}
          >
            {importStatus.success ? '✓' : '✗'} {importStatus.message}
          </div>
        )}

      </div>
    </div>
  )
}

// =====================================================
// 主项目管理组件
// =====================================================
function VideoProjectManager({ vfs, onOpenProject, onNavigate: onNavigateToPath, className }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState(null)
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('updated') // 'updated' | 'created' | 'name'
  
  // 加载项目列表
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const projectList = await vfs.getVideoProjects()
      setProjects(projectList)
      return projectList
    } catch (e) {
      console.error('加载项目列表失败:', e)
      return []
    } finally {
      setLoading(false)
    }
  }, [vfs])
  
  useEffect(() => {
    loadProjects()
  }, [loadProjects])
  
  // 创建新项目
  const handleCreateProject = async (projectPath) => {
    const projectList = await loadProjects()
    // 自动选中新创建的项目
    const newProject = projectList.find(p => p.path === projectPath)
    if (newProject) {
      setSelectedProject(newProject)
    }
  }
  
  // 删除项目
  const handleDeleteProject = async (project) => {
    if (!confirm(`确定要删除项目 "${project.name}" 吗？此操作不可恢复。`)) {
      return
    }
    
    try {
      await vfs.delete(project.path, true)
      await loadProjects()
      if (selectedProject?.path === project.path) {
        setSelectedProject(null)
      }
    } catch (e) {
      alert(`删除失败：${e.message}`)
    }
  }
  
  // 复制项目
  const handleDuplicateProject = async (project) => {
    const newName = `${project.name} (副本)`
    
    try {
      // 创建新项目
      const newProjectPath = await vfs.createVideoProject(newName)
      
      // 复制所有文件
      const copyFiles = async (fromPath, toPath) => {
        const items = await vfs.listDirectory(fromPath)
        for (const item of items) {
          // 不把旧项目遗留的 project.json 复制到新项目。
          if (!item.isDirectory && item.name === 'project.json') continue
          const newFromPath = `${fromPath}/${item.name}`
          const newToPath = `${toPath}/${item.name}`
          
          if (item.isDirectory) {
            await vfs.mkdir(newToPath, true)
            await copyFiles(newFromPath, newToPath)
          } else {
            const content = await vfs.readFile(newFromPath)
            await vfs.writeFile(newToPath, content, {
              type: item.type,
              metadata: item.metadata,
            })
          }
        }
      }
      
      await copyFiles(project.path, newProjectPath)
      await loadProjects()
    } catch (e) {
      alert(`复制失败：${e.message}`)
    }
  }
  
  // 打开项目
  const handleOpenProject = (project) => {
    setSelectedProject(project)
    onOpenProject?.(project)
  }
  
  // 导航到项目目录
  const handleNavigate = (item) => {
    if (typeof item === 'string') {
      onNavigateToPath?.(item)
    } else if (item?.path) {
      onNavigateToPath?.(item.path)
    }
  }
  
  // 过滤和排序项目
  const filteredProjects = projects
    .filter(project => 
      !searchQuery || project.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return new Date(b.createdAt) - new Date(a.createdAt)
        case 'updated':
        default:
          return new Date(b.updatedAt) - new Date(a.updatedAt)
      }
    })
  
  return (
    <div className={`video-project-manager ${className || ''}`}>
      {!selectedProject ? (
        <>
          {/* 项目列表头部 */}
          <div className="project-manager-header">
            <div>
              <h2 className="display-md mb-sm">视频项目</h2>
              <p className="lead">管理和编辑你的视频项目</p>
            </div>
            
            <button
              className="btn btn-primary"
              onClick={() => setShowNewProjectDialog(true)}
            >
              + 新建项目
            </button>
          </div>
          
          {/* 工具栏 */}
          <div className="project-manager-toolbar">
            <input
              type="text"
              className="search-input"
              placeholder="搜索项目..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="updated">最近更新</option>
              <option value="created">创建时间</option>
              <option value="name">名称</option>
            </select>
          </div>
          
          {/* 项目列表 */}
          <div className="project-list">
            {loading ? (
              <div className="empty-state">
                <span>加载项目中...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Film size={48} strokeWidth={1.5} className="text-slate-300" />
          </span>
                <p className="empty-text">
                  {searchQuery ? '没有找到匹配的项目' : '暂无项目'}
                </p>
                {!searchQuery && (
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowNewProjectDialog(true)}
                  >
                    创建第一个项目
                  </button>
                )}
              </div>
            ) : (
              filteredProjects.map((project) => (
                <ProjectCard
                  key={project.path}
                  project={project}
                  onSelect={handleOpenProject}
                  onDelete={handleDeleteProject}
                  onDuplicate={handleDuplicateProject}
                />
              ))
            )}
          </div>
          
          {/* 新建项目对话框 */}
          {showNewProjectDialog && (
            <NewProjectDialog
              vfs={vfs}
              onClose={() => setShowNewProjectDialog(false)}
              onCreated={handleCreateProject}
            />
          )}
        </>
      ) : (
        <ProjectDetail
          project={selectedProject}
          vfs={vfs}
          onBack={() => setSelectedProject(null)}
          onOpen={handleNavigate}
        />
      )}
    </div>
  )
}

export default VideoProjectManager
