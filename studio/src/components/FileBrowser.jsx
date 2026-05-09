import { useState, useEffect, useCallback } from 'react'

// =====================================================
// 文件图标
// =====================================================
const FileIcon = ({ isDirectory, fileName, type }) => {
  if (isDirectory) return '📁'
  
  // 根据 MIME 类型判断
  if (type?.startsWith('video/')) return '🎬'
  if (type?.startsWith('audio/')) return '🎵'
  if (type?.startsWith('image/')) return '🖼️'
  
  const ext = fileName?.split('.').pop()?.toLowerCase()
  const iconMap = {
    json: '📋',
    js: '📜',
    jsx: '⚛️',
    ts: '📘',
    tsx: '⚛️',
    css: '🎨',
    html: '🌐',
    md: '📝',
    txt: '📄',
    mp4: '🎬',
    mov: '🎬',
    avi: '🎬',
    mkv: '🎬',
    webm: '🎬',
    mp3: '🎵',
    wav: '🎵',
    m4a: '🎵',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    webp: '🖼️',
    srt: '📝',
    vtt: '📝',
    ass: '📝',
  }
  
  return iconMap[ext] || '📄'
}

// =====================================================
// 视频预览组件
// =====================================================
function VideoPreview({ file, vfs }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  useEffect(() => {
    let blobUrl = null
    
    const loadVideo = async () => {
      try {
        setLoading(true)
        const blob = await vfs.readFileAsBlob(file.path)
        blobUrl = URL.createObjectURL(blob)
        setVideoUrl(blobUrl)
        setError('')
      } catch (e) {
        setError(`无法加载视频：${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    
    if (file) {
      loadVideo()
    }
    
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [file, vfs])
  
  if (loading) {
    return (
      <div className="video-preview-loading">
        <span>加载视频中...</span>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="video-preview-error">
        <span>❌ {error}</span>
      </div>
    )
  }
  
  return (
    <div className="video-preview">
      <video
        src={videoUrl}
        controls
        style={{ width: '100%', maxHeight: '400px', borderRadius: '8px' }}
      />
    </div>
  )
}

// =====================================================
// 音频预览组件
// =====================================================
function AudioPreview({ file, vfs }) {
  const [audioUrl, setAudioUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    let blobUrl = null
    
    const loadAudio = async () => {
      try {
        setLoading(true)
        const blob = await vfs.readFileAsBlob(file.path)
        blobUrl = URL.createObjectURL(blob)
        setAudioUrl(blobUrl)
      } catch (e) {
        console.error('加载音频失败:', e)
      } finally {
        setLoading(false)
      }
    }
    
    if (file) {
      loadAudio()
    }
    
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [file, vfs])
  
  if (loading) {
    return <span>加载音频中...</span>
  }
  
  return (
    <audio
      src={audioUrl}
      controls
      style={{ width: '100%' }}
    />
  )
}

// =====================================================
// 图片预览组件
// =====================================================
function ImagePreview({ file, vfs }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    let blobUrl = null
    
    const loadImage = async () => {
      try {
        setLoading(true)
        const dataUrl = await vfs.readFileAsDataURL(file.path)
        setImageUrl(dataUrl)
      } catch (e) {
        console.error('加载图片失败:', e)
      } finally {
        setLoading(false)
      }
    }
    
    if (file) {
      loadImage()
    }
    
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [file, vfs])
  
  if (loading) {
    return <span>加载中...</span>
  }
  
  return (
    <img
      src={imageUrl}
      alt={file.name}
      style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '8px' }}
    />
  )
}

// =====================================================
// 文件项组件
// =====================================================
function FileItem({ item, onSelect, onOpen, selected }) {
  return (
    <div
      className={`file-item ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(item)}
      onDoubleClick={() => onOpen(item)}
    >
      <span className="file-item-icon">
        <FileIcon isDirectory={item.isDirectory} fileName={item.name} type={item.type} />
      </span>
      <span className="file-item-name">{item.name}</span>
      {item.size !== undefined && (
        <span className="file-item-size">
          {item.size < 1024 ? `${item.size} B` : 
           item.size < 1024 * 1024 ? `${(item.size / 1024).toFixed(1)} KB` :
           `${(item.size / 1024 / 1024).toFixed(1)} MB`}
        </span>
      )}
      {item.updatedAt && (
        <span className="file-item-time">
          {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
        </span>
      )}
      {item.type?.startsWith('video/') && (
        <span className="file-item-badge" title="视频文件">🎬</span>
      )}
    </div>
  )
}

// =====================================================
// 面包屑导航
// =====================================================
function Breadcrumb({ path, onNavigate }) {
  const parts = path.split('/').filter(Boolean)
  
  return (
    <div className="breadcrumb">
      <button 
        className="breadcrumb-item"
        onClick={() => onNavigate('/')}
      >
        🏠
      </button>
      {parts.map((part, index) => {
        const fullPath = '/' + parts.slice(0, index + 1).join('/')
        return (
          <span key={fullPath} className="breadcrumb-separator">
            <span>/</span>
            <button 
              className="breadcrumb-item"
              onClick={() => onNavigate(fullPath)}
            >
              {part}
            </button>
          </span>
        )
      })}
    </div>
  )
}

// =====================================================
// 文件详情面板
// =====================================================
function FileDetail({ file, vfs, onClose, onEdit }) {
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isJson, setIsJson] = useState(false)
  const [loading, setLoading] = useState(false)
  
  useEffect(() => {
    const loadFile = async () => {
      if (file && !file.isDirectory) {
        try {
          setLoading(true)
          const fileContent = await vfs.readFile(file.path)
          setContent(fileContent)
          
          // 检查是否为 JSON
          if (file.path.endsWith('.json')) {
            try {
              const parsed = JSON.parse(fileContent)
              setIsJson(true)
              setContent(JSON.stringify(parsed, null, 2))
            } catch (e) {
              setIsJson(false)
            }
          }
        } catch (e) {
          setContent(`❌ 无法读取文件：${e.message}`)
        } finally {
          setLoading(false)
        }
      }
    }
    
    loadFile()
  }, [file, vfs])
  
  const handleSave = async () => {
    try {
      setLoading(true)
      await vfs.writeFile(file.path, content)
      setIsEditing(false)
      onEdit?.(file.path)
    } catch (e) {
      alert(`保存失败：${e.message}`)
    } finally {
      setLoading(false)
    }
  }
  
  if (!file) {
    return (
      <div className="file-detail file-detail-empty">
        <div className="empty-state">
          <span className="empty-icon">📄</span>
          <p className="empty-text">选择文件查看详情</p>
        </div>
      </div>
    )
  }
  
  // 视频文件预览
  if (file.type?.startsWith('video/')) {
    return (
      <div className="file-detail">
        <div className="file-detail-header">
          <div className="file-detail-title">
            <FileIcon isDirectory={file.isDirectory} fileName={file.name} type={file.type} />
            <span>{file.name}</span>
          </div>
          <div className="file-detail-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="file-detail-info">
          <div className="info-row">
            <span className="info-label">路径:</span>
            <span className="info-value">{file.path}</span>
          </div>
          <div className="info-row">
            <span className="info-label">大小:</span>
            <span className="info-value">
              {file.size < 1024 ? `${file.size} B` : 
               file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` :
               `${(file.size / 1024 / 1024).toFixed(1)} MB`}
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">类型:</span>
            <span className="info-value">{file.type}</span>
          </div>
        </div>
        
        <VideoPreview file={file} vfs={vfs} />
      </div>
    )
  }
  
  // 音频文件预览
  if (file.type?.startsWith('audio/')) {
    return (
      <div className="file-detail">
        <div className="file-detail-header">
          <div className="file-detail-title">
            <FileIcon isDirectory={file.isDirectory} fileName={file.name} type={file.type} />
            <span>{file.name}</span>
          </div>
          <div className="file-detail-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="file-detail-info">
          <div className="info-row">
            <span className="info-label">路径:</span>
            <span className="info-value">{file.path}</span>
          </div>
          <div className="info-row">
            <span className="info-label">大小:</span>
            <span className="info-value">
              {file.size < 1024 ? `${file.size} B` : 
               file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` :
               `${(file.size / 1024 / 1024).toFixed(1)} MB`}
            </span>
          </div>
        </div>
        
        <AudioPreview file={file} vfs={vfs} />
      </div>
    )
  }
  
  // 图片文件预览
  if (file.type?.startsWith('image/')) {
    return (
      <div className="file-detail">
        <div className="file-detail-header">
          <div className="file-detail-title">
            <FileIcon isDirectory={file.isDirectory} fileName={file.name} type={file.type} />
            <span>{file.name}</span>
          </div>
          <div className="file-detail-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="file-detail-info">
          <div className="info-row">
            <span className="info-label">路径:</span>
            <span className="info-value">{file.path}</span>
          </div>
          <div className="info-row">
            <span className="info-label">大小:</span>
            <span className="info-value">
              {file.size < 1024 ? `${file.size} B` : 
               file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` :
               `${(file.size / 1024 / 1024).toFixed(1)} MB`}
            </span>
          </div>
        </div>
        
        <ImagePreview file={file} vfs={vfs} />
      </div>
    )
  }
  
  // 文本/JSON 文件
  return (
    <div className="file-detail">
      <div className="file-detail-header">
        <div className="file-detail-title">
          <FileIcon isDirectory={file.isDirectory} fileName={file.name} type={file.type} />
          <span>{file.name}</span>
        </div>
        <div className="file-detail-actions">
          {!file.isDirectory && (
            <>
              <button
                className="btn btn-sm"
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
            </>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
      </div>
      
      <div className="file-detail-info">
        <div className="info-row">
          <span className="info-label">路径:</span>
          <span className="info-value">{file.path}</span>
        </div>
        {!file.isDirectory && (
          <>
            <div className="info-row">
              <span className="info-label">大小:</span>
              <span className="info-value">
                {file.size < 1024 ? `${file.size} B` : 
                 file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` :
                 `${(file.size / 1024 / 1024).toFixed(1)} MB`}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">类型:</span>
              <span className="info-value">{file.type || '未知'}</span>
            </div>
          </>
        )}
      </div>
      
      {!file.isDirectory && (
        <div className="file-detail-content">
          {loading && !isEditing ? (
            <span>加载中...</span>
          ) : isEditing ? (
            <textarea
              className="file-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ fontFamily: isJson ? 'monospace' : 'inherit' }}
              disabled={loading}
            />
          ) : (
            <pre className="file-preview">
              <code>{content}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 新建文件/文件夹对话框
// =====================================================
function CreateDialog({ vfs, currentPath, onClose, onCreated, type = 'file' }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('请输入名称')
      return
    }
    
    try {
      setLoading(true)
      const fullPath = currentPath === '/' 
        ? `/${name}` 
        : `${currentPath}/${name}`
      
      if (type === 'folder') {
        await vfs.mkdir(fullPath, true)
      } else {
        await vfs.writeFile(fullPath, '', { createParent: true })
      }
      
      onCreated?.(fullPath)
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
        <h3 className="modal-title">
          新建{type === 'folder' ? '文件夹' : '文件'}
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-md">
            <label className="caption-strong mb-sm" style={{ display: 'block' }}>
              名称
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder={type === 'folder' ? '文件夹名称' : '文件名'}
              autoFocus
            />
            {error && (
              <p className="caption text-muted" style={{ color: '#ff3b30', marginTop: '4px' }}>
                {error}
              </p>
            )}
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
// 上传文件对话框
// =====================================================
function UploadDialog({ vfs, currentPath, onClose, onUploaded }) {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState({})
  const [error, setError] = useState('')
  
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(selectedFiles)
  }
  
  const handleUpload = async () => {
    if (files.length === 0) return
    
    try {
      setUploading(true)
      const newProgress = {}
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fullPath = currentPath === '/' 
          ? `/${file.name}` 
          : `${currentPath}/${file.name}`
        
        newProgress[file.name] = 0
        setProgress({ ...newProgress })
        
        // 读取文件内容
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('读取文件失败'))
          reader.readAsArrayBuffer(file)
        })
        
        // 写入虚拟文件系统
        await vfs.writeFile(fullPath, content, {
          type: file.type,
          metadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        })
        
        newProgress[file.name] = 100
        setProgress({ ...newProgress })
      }
      
      onUploaded?.(files.map(f => ({
        name: f.name,
        path: currentPath === '/' ? `/${f.name}` : `${currentPath}/${f.name}`,
      })))
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">上传文件</h3>
        
        <div className="mb-md">
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{ marginBottom: 'var(--spacing-md)' }}
          />
          
          {files.length > 0 && (
            <div className="upload-list">
              {files.map((file, index) => (
                <div key={index} className="upload-item">
                  <span className="upload-item-name">{file.name}</span>
                  <span className="upload-item-size">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                  {uploading && (
                    <span className="upload-item-progress">
                      {progress[file.name] || 0}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {error && (
            <p className="caption text-muted" style={{ color: '#ff3b30' }}>
              {error}
            </p>
          )}
        </div>
        
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={uploading}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
          >
            {uploading ? '上传中...' : `上传 ${files.length} 个文件`}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 存储信息组件
// =====================================================
function StorageInfo({ vfs }) {
  const [info, setInfo] = useState(null)
  
  useEffect(() => {
    const loadInfo = async () => {
      const storageInfo = await vfs.getStorageInfo()
      setInfo(storageInfo)
    }
    
    loadInfo()
  }, [vfs])
  
  if (!info) return null
  
  return (
    <div className="storage-info">
      <span className="caption text-muted">
        {info.fileCount} 个文件 · {info.totalSize < 1024 * 1024 
          ? `${(info.totalSize / 1024).toFixed(1)} KB` 
          : `${(info.totalSize / 1024 / 1024).toFixed(1)} MB`}
      </span>
      {info.available !== null && (
        <span className="caption text-muted">
          · 可用 {(info.available / 1024 / 1024 / 1024).toFixed(1)} GB
        </span>
      )}
    </div>
  )
}

// =====================================================
// 项目快速导航组件
// =====================================================
function ProjectQuickNav({ vfs, currentPath, onNavigate }) {
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectList = await vfs.getVideoProjects()
        setProjects(projectList)
        
        // 检查当前路径是否在某个项目中
        const matchingProject = projectList.find(p => 
          currentPath.startsWith(p.path)
        )
        setCurrentProject(matchingProject || null)
      } catch (e) {
        console.error('加载项目列表失败:', e)
      }
    }
    
    loadProjects()
  }, [vfs, currentPath])
  
  if (projects.length === 0) return null
  
  return (
    <div className="project-quick-nav">
      <div className="project-nav-header">
        <span className="caption-strong">📁 项目导航</span>
        {currentProject && (
          <span className="caption text-muted">
            当前：{currentProject.name}
          </span>
        )}
      </div>
      <div className="project-nav-list">
        {projects.map(project => (
          <button
            key={project.path}
            className={`project-nav-item ${currentProject?.path === project.path ? 'active' : ''}`}
            onClick={() => onNavigate(`${project.path}/raw`)}
            title={project.path}
          >
            <span className="project-nav-icon">🎬</span>
            <span className="project-nav-name">{project.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// 项目文件快捷方式
// =====================================================
function ProjectShortcuts({ vfs, currentPath, onNavigate }) {
  const shortcuts = [
    { name: '原始视频', path: '/raw', icon: '🎬', type: 'video' },
    { name: '编辑视频', path: '/edited', icon: '✂️', type: 'video' },
    { name: '音频', path: '/audio', icon: '🎵', type: 'audio' },
    { name: '字幕', path: '/subtitles', icon: '📝', type: 'document' },
    { name: '输出', path: '/output', icon: '📤', type: 'video' },
    { name: '项目配置', path: '/project.json', icon: '⚙️', type: 'json' },
  ]
  
  // 检查是否在项目目录中
  const isInProject = currentPath.startsWith('/videos/')
  
  if (!isInProject) return null
  
  return (
    <div className="project-shortcuts">
      {shortcuts.map(shortcut => (
        <button
          key={shortcut.path}
          className="project-shortcut-btn"
          onClick={() => {
            if (shortcut.path === '/project.json') {
              // 导航到项目根目录的 project.json
              const projectRoot = currentPath.match(/^\/videos\/[^\/]+/)[0]
              onNavigate(`${projectRoot}${shortcut.path}`)
            } else {
              onNavigate(`${currentPath}${shortcut.path}`)
            }
          }}
          title={`${shortcut.name} (${shortcut.path})`}
        >
          <span className="shortcut-icon">{shortcut.icon}</span>
          <span className="shortcut-name">{shortcut.name}</span>
        </button>
      ))}
    </div>
  )
}

// =====================================================
// 主文件浏览器组件
// =====================================================
function FileBrowser({ vfs, onFileSelect, onFileOpen, className, initialPath = '/' }) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [items, setItems] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('list') // 'list' | 'grid'
  const [sortBy, setSortBy] = useState('name') // 'name' | 'size' | 'time'
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' | 'desc'
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createType, setCreateType] = useState('file')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('all') // 'all' | 'video' | 'audio' | 'image' | 'document'
  const [showProjectNav, setShowProjectNav] = useState(true)
  
  // 初始化路径
  useEffect(() => {
    if (initialPath && initialPath !== currentPath) {
      setCurrentPath(initialPath)
    }
  }, [initialPath])
  
  // 加载目录内容
  const loadDirectory = useCallback(async () => {
    try {
      setLoading(true)
      let dirItems = vfs.listDirectory(currentPath)
      
      // 按类型过滤
      if (filterType !== 'all') {
        dirItems = dirItems.filter(item => {
          if (item.isDirectory) return true
          if (!item.type) return false
          switch (filterType) {
            case 'video':
              return item.type.startsWith('video/')
            case 'audio':
              return item.type.startsWith('audio/')
            case 'image':
              return item.type.startsWith('image/')
            case 'document':
              return item.type.startsWith('text/') || item.type === 'application/json'
            case 'json':
              return item.type === 'application/json' || item.name.endsWith('.json')
            default:
              return true
          }
        })
      }
      
      // 过滤搜索结果
      let filtered = dirItems
      if (searchQuery) {
        filtered = dirItems.filter(item => 
          item.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }
      
      // 排序
      filtered.sort((a, b) => {
        // 目录始终排在前面
        if (a.isDirectory && !b.isDirectory) return -1
        if (!a.isDirectory && b.isDirectory) return 1
        
        let comparison = 0
        switch (sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name)
            break
          case 'size':
            comparison = (a.size || 0) - (b.size || 0)
            break
          case 'time':
            comparison = new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0)
            break
          default:
            comparison = 0
        }
        
        return sortOrder === 'asc' ? comparison : -comparison
      })
      
      setItems(filtered)
    } catch (e) {
      console.error('加载目录失败:', e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [currentPath, searchQuery, sortBy, sortOrder, vfs, filterType])
  
  useEffect(() => {
    loadDirectory()
  }, [loadDirectory])
  
  // 导航到目录
  const navigateTo = async (path) => {
    try {
      vfs.cd(path)
      setCurrentPath(vfs.pwd())
      setSelectedFile(null)
    } catch (e) {
      console.error('导航失败:', e)
    }
  }
  
  // 打开文件或目录
  const handleOpen = async (item) => {
    if (item.isDirectory) {
      await navigateTo(item.path)
    } else {
      setSelectedFile(item)
      onFileOpen?.(item)
    }
  }
  
  // 选择文件
  const handleSelect = (item) => {
    setSelectedFile(item)
    onFileSelect?.(item)
  }
  
  // 向上一级
  const goUp = () => {
    if (currentPath !== '/') {
      const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
      navigateTo(parentPath)
    }
  }
  
  // 刷新
  const refresh = () => {
    loadDirectory()
  }
  
  // 创建新文件/文件夹
  const handleCreate = (type) => {
    setCreateType(type)
    setShowCreateDialog(true)
  }
  
  // 上传文件
  const handleUpload = () => {
    setShowUploadDialog(true)
  }
  
  return (
    <div className={`file-browser ${className || ''}`}>
      {/* 项目导航 */}
      {showProjectNav && (
        <div className="file-browser-sidebar">
          <ProjectQuickNav 
            vfs={vfs} 
            currentPath={currentPath}
            onNavigate={navigateTo}
          />
          
          <div className="sidebar-divider" />
          
          <ProjectShortcuts
            vfs={vfs}
            currentPath={currentPath}
            onNavigate={navigateTo}
          />
          
          <div className="sidebar-divider" />
          
          <button
            className="btn btn-ghost btn-sm sidebar-toggle"
            onClick={() => setShowProjectNav(false)}
            title="隐藏侧边栏"
          >
            隐藏侧边栏
          </button>
        </div>
      )}
      
      <div className="file-browser-main">
        {/* 工具栏 */}
        <div className="file-browser-toolbar">
          {!showProjectNav && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowProjectNav(true)}
              title="显示项目导航"
            >
              📁
            </button>
          )}
          
          <Breadcrumb path={currentPath} onNavigate={navigateTo} />
          
          <div className="toolbar-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={goUp}
            disabled={currentPath === '/'}
            title="上一级"
          >
            ⬆️
          </button>
          
          <button
            className="btn btn-ghost btn-sm"
            onClick={refresh}
            title="刷新"
          >
            🔄
          </button>
          
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleCreate('folder')}
            title="新建文件夹"
          >
            📁
          </button>
          
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => handleCreate('file')}
            title="新建文件"
          >
            📄
          </button>
          
          <button
            className="btn btn-primary btn-sm"
            onClick={handleUpload}
            title="上传文件"
          >
            ⬆️ 上传
          </button>
          
          <select
            className="filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ marginLeft: '8px' }}
          >
            <option value="all">全部</option>
            <option value="video">视频</option>
            <option value="audio">音频</option>
            <option value="image">图片</option>
            <option value="document">文档</option>
          </select>
          
          <input
            type="text"
            className="search-input"
            placeholder="搜索文件..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          <select
            className="sort-select"
            value={`${sortBy}-${sortOrder}`}
            onChange={(e) => {
              const [newSortBy, newSortOrder] = e.target.value.split('-')
              setSortBy(newSortBy)
              setSortOrder(newSortOrder)
            }}
          >
            <option value="name-asc">名称 (A-Z)</option>
            <option value="name-desc">名称 (Z-A)</option>
            <option value="time-desc">时间 (新→旧)</option>
            <option value="time-asc">时间 (旧→新)</option>
            <option value="size-desc">大小 (大→小)</option>
            <option value="size-asc">大小 (小→大)</option>
          </select>
          
          <div className="view-mode-toggle">
            <button
              className={`btn btn-sm ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="列表视图"
            >
              📋
            </button>
            <button
              className={`btn btn-sm ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="网格视图"
            >
              ▦
            </button>
          </div>
        </div>
      </div>
      
      {/* 存储信息 */}
      <div className="file-browser-status">
        <StorageInfo vfs={vfs} />
      </div>
      
      {/* 文件列表 */}
      <div className={`file-browser-content view-${viewMode}`}>
        {loading ? (
          <div className="empty-state">
            <span>加载中...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📂</span>
            <p className="empty-text">
              {searchQuery ? '没有找到匹配的文件' : '此目录为空'}
            </p>
            {!searchQuery && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleUpload}
              >
                上传文件
              </button>
            )}
          </div>
        ) : (
          items.map((item) => (
            <FileItem
              key={item.path}
              item={item}
              onSelect={handleSelect}
              onOpen={handleOpen}
              selected={selectedFile?.path === item.path}
            />
          ))
        )}
      </div>
      
      {/* 文件详情 */}
      {selectedFile && (
        <FileDetail
          file={selectedFile}
          vfs={vfs}
          onClose={() => setSelectedFile(null)}
          onEdit={onFileOpen}
        />
      )}
    </div>
    
      {/* 侧边栏遮罩 */}
      {showProjectNav && (
        <div 
          className="sidebar-overlay"
          onClick={() => setShowProjectNav(false)}
        />
      )}
      
      {/* 创建对话框 */}
      {showCreateDialog && (
        <CreateDialog
          vfs={vfs}
          currentPath={currentPath}
          type={createType}
          onClose={() => setShowCreateDialog(false)}
          onCreated={refresh}
        />
      )}
      
      {/* 上传对话框 */}
      {showUploadDialog && (
        <UploadDialog
          vfs={vfs}
          currentPath={currentPath}
          onClose={() => setShowUploadDialog(false)}
          onUploaded={refresh}
        />
      )}
    </div>
  )
}

export default FileBrowser

// 导出预览组件供其他组件使用
export { VideoPreview, AudioPreview, ImagePreview }
