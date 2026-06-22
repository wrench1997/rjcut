import { useState, useEffect, useCallback } from 'react'
import { Folder, FileVideo, FileAudio, FileImage, FileJson, FileCode, FileBox, FileText, File, Film, Music, Image, ArrowUp, RefreshCw, FolderPlus, FilePlus, Trash2, Eye, Download, Clapperboard, Home, List, Grid3x3, FolderOpen, Copy, Clipboard, Scissors, Move, FileInput } from 'lucide-react'
import Tooltip from './Tooltip'

// =====================================================
// 文件图标
// =====================================================
const FileIcon = ({ isDirectory, fileName, type }) => {
  if (isDirectory) return <Folder size={18} strokeWidth={2} className="text-blue-500" />
  
  // 根据 MIME 类型判断
  if (type?.startsWith('video/')) return <Film size={18} strokeWidth={2} className="text-purple-500" />
  if (type?.startsWith('audio/')) return <Music size={18} strokeWidth={2} className="text-green-500" />
  if (type?.startsWith('image/')) return <Image size={18} strokeWidth={2} className="text-pink-500" />
  
  const ext = fileName?.split('.').pop()?.toLowerCase()
  const iconMap = {
    json: <FileJson size={18} strokeWidth={2} className="text-amber-500" />,
    js: <FileCode size={18} strokeWidth={2} className="text-yellow-500" />,
    jsx: <FileCode size={18} strokeWidth={2} className="text-cyan-500" />,
    ts: <FileCode size={18} strokeWidth={2} className="text-blue-600" />,
    tsx: <FileCode size={18} strokeWidth={2} className="text-blue-500" />,
    css: <FileCode size={18} strokeWidth={2} className="text-blue-400" />,
    html: <FileCode size={18} strokeWidth={2} className="text-orange-500" />,
    md: <FileText size={18} strokeWidth={2} className="text-slate-500" />,
    txt: <FileText size={18} strokeWidth={2} className="text-slate-400" />,
    mp4: <FileVideo size={18} strokeWidth={2} className="text-purple-500" />,
    mov: <FileVideo size={18} strokeWidth={2} className="text-purple-500" />,
    avi: <FileVideo size={18} strokeWidth={2} className="text-purple-500" />,
    mkv: <FileVideo size={18} strokeWidth={2} className="text-purple-500" />,
    webm: <FileVideo size={18} strokeWidth={2} className="text-purple-500" />,
    mp3: <FileAudio size={18} strokeWidth={2} className="text-green-500" />,
    wav: <FileAudio size={18} strokeWidth={2} className="text-green-500" />,
    m4a: <FileAudio size={18} strokeWidth={2} className="text-green-500" />,
    png: <FileImage size={18} strokeWidth={2} className="text-pink-500" />,
    jpg: <FileImage size={18} strokeWidth={2} className="text-pink-500" />,
    jpeg: <FileImage size={18} strokeWidth={2} className="text-pink-500" />,
    gif: <FileImage size={18} strokeWidth={2} className="text-pink-500" />,
    webp: <FileImage size={18} strokeWidth={2} className="text-pink-500" />,
    srt: <FileText size={18} strokeWidth={2} className="text-slate-500" />,
    vtt: <FileText size={18} strokeWidth={2} className="text-slate-500" />,
    ass: <FileText size={18} strokeWidth={2} className="text-slate-500" />,
  }
  
  return iconMap[ext] || <File size={18} strokeWidth={2} className="text-slate-400" />
}

// 支持的视频格式
const SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'webm', 'ogg']

// 检查视频格式是否支持
function isVideoFormatSupported(fileName) {
  const ext = fileName?.split('.').pop()?.toLowerCase()
  return SUPPORTED_VIDEO_FORMATS.includes(ext)
}

// =====================================================
// 视频预览组件
// =====================================================
function VideoPreview({ file, vfs }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [unsupportedFormat, setUnsupportedFormat] = useState(false)
  
  useEffect(() => {
    let blobUrl = null
    
    const loadVideo = async () => {
      try {
        setLoading(true)
        
        if (!isVideoFormatSupported(file.name)) {
          const ext = file.name?.split('.').pop()?.toLowerCase()
          setUnsupportedFormat(true)
          setError(`不支持的视频格式：.${ext}`)
          setLoading(false)
          return
        }
        
        const blob = await vfs.readFileAsBlob(file.path)
        blobUrl = URL.createObjectURL(blob)
        setVideoUrl(blobUrl)
        setError('')
        setUnsupportedFormat(false)
      } catch (e) {
        setError(`无法加载视频：${e.message}`)
        setUnsupportedFormat(false)
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
      <div className="preview-loading">
        <span>加载视频中...</span>
      </div>
    )
  }
  
  if (unsupportedFormat) {
    return (
      <div className="preview-error">
        <span>❌ {error}</span>
        <p style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>
          支持的视频格式：{SUPPORTED_VIDEO_FORMATS.join(', ')}
        </p>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="preview-error">
        <span>❌ {error}</span>
      </div>
    )
  }
  
  return (
    <div className="video-preview-container">
      <video
        src={videoUrl}
        controls
        className="video-preview"
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
    return <span className="caption text-muted">加载音频中...</span>
  }
  
  return (
    <div className="audio-preview-container">
      <audio src={audioUrl} controls className="audio-preview" />
    </div>
  )
}

// =====================================================
// 图片预览组件
// =====================================================
function ImagePreview({ file, vfs }) {
  const [imageUrl, setImageUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
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
  }, [file, vfs])
  
  if (loading) {
    return <span className="caption text-muted">加载中...</span>
  }
  
  return (
    <div className="image-preview-container">
      <img src={imageUrl} alt={file.name} className="image-preview" />
    </div>
  )
}

// =====================================================
// 文本预览组件
// =====================================================
function TextPreview({ file, vfs }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  useEffect(() => {
    const loadText = async () => {
      try {
        setLoading(true)
        const data = await vfs.readFile(file.path)
        const text = data instanceof ArrayBuffer
          ? new TextDecoder('utf-8').decode(data)
          : String(data)
        setContent(text)
        setError('')
      } catch (e) {
        setError(`无法读取文件：${e.message}`)
      } finally {
        setLoading(false)
      }
    }
    
    if (file) {
      loadText()
    }
  }, [file, vfs])
  
  if (loading) {
    return <span className="caption text-muted">加载中...</span>
  }
  
  if (error) {
    return <div className="preview-error">❌ {error}</div>
  }
  
  return (
    <pre className="text-preview">
      <code>{content}</code>
    </pre>
  )
}

// =====================================================
// 文件项组件 - 列表视图
// =====================================================
function FileListItem({ item, onSelect, onOpen, selected, onDelete, onContextMenu }) {
  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm(`确定要删除 "${item.name}" ${item.isDirectory ? '文件夹' : '文件'} 吗？`)) {
      onDelete?.(item)
    }
  }
  
  const handleClick = (e) => {
    e.stopPropagation()
    onSelect(item)
  }
  
  const handleDoubleClick = (e) => {
    e.stopPropagation()
    onOpen(e, item)
  }
  
  const handleItemContextMenu = (e) => {
    e.stopPropagation()
    onContextMenu?.(e, item)
  }
  
  return (
    <div
      className={`file-list-item ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleItemContextMenu}
    >
      <span className="file-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FileIcon isDirectory={item.isDirectory} fileName={item.name} type={item.type} />
      </span>
      <span className="file-name">{item.name}</span>
      <span className="file-meta">
        {item.size !== undefined && (
          <span className="file-size">
            {item.size < 1024 ? `${item.size} B` : 
             item.size < 1024 * 1024 ? `${(item.size / 1024).toFixed(1)} KB` :
             `${(item.size / 1024 / 1024).toFixed(1)} MB`}
          </span>
        )}
      </span>
      <span className="file-meta">
        {item.updatedAt && (
          <span className="file-time">
            {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
          </span>
        )}
      </span>
      <span className="file-actions">
        {item.type?.startsWith('video/') && (
          <span className="file-badge" title="视频文件" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Film size={12} strokeWidth={2} /> 视频
          </span>
        )}
      </span>
    </div>
  )
}

// =====================================================
// 文件项组件 - 网格视图
// =====================================================
function FileGridItem({ item, onSelect, onOpen, selected, onDelete, onContextMenu }) {
  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm(`确定要删除 "${item.name}" ${item.isDirectory ? '文件夹' : '文件'} 吗？`)) {
      onDelete?.(item)
    }
  }
  
  const handleClick = (e) => {
    e.stopPropagation()
    onSelect(item)
  }
  
  const handleDoubleClick = (e) => {
    e.stopPropagation()
    onOpen(e, item)
  }
  
  const handleItemContextMenu = (e) => {
    e.stopPropagation()
    onContextMenu?.(e, item)
  }
  
  return (
    <div
      className={`file-grid-item ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleItemContextMenu}
    >
      <div className="file-grid-icon">
        <FileIcon isDirectory={item.isDirectory} fileName={item.name} type={item.type} />
      </div>
      <div className="file-grid-name">{item.name}</div>
      <div className="file-grid-meta">
        {item.size !== undefined && (
          <span className="file-grid-size">
            {item.size < 1024 ? `${item.size} B` : 
             item.size < 1024 * 1024 ? `${(item.size / 1024).toFixed(0)} KB` :
             `${(item.size / 1024 / 1024).toFixed(1)} MB`}
          </span>
        )}
      </div>
      <div className="file-grid-actions">
        {/* 删除功能已移至右键菜单 */}
      </div>
    </div>
  )
}
// =====================================================
// 右键菜单组件
// =====================================================
function ContextMenu({ x, y, item, onClose, onCopy, onCut, onPaste, canPaste, onDelete, onRename, onDownload, onUpload }) {
  useEffect(() => {
    const handleClick = () => onClose()
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [onClose])

  const menuStyle = {
    position: 'fixed',
    left: x,
    top: y,
    zIndex: 9999,
  }

  return (
    <div className="context-menu" style={menuStyle}>
      {item && (
        <>
          <Tooltip tip="复制文件到剪贴板" delay={1000} position="right">
            <div className="context-menu-item" onClick={() => { onCopy?.(item); onClose(); }}>
              <Copy size={14} /> 复制
            </div>
          </Tooltip>
          <Tooltip tip="剪切文件，可粘贴到其他位置" delay={1000} position="right">
            <div className="context-menu-item" onClick={() => { onCut?.(item); onClose(); }}>
              <Scissors size={14} /> 剪切
            </div>
          </Tooltip>
          <Tooltip tip="重命名文件或文件夹" delay={1000} position="right">
            <div className="context-menu-item" onClick={() => { onRename?.(item); onClose(); }}>
              <FileInput size={14} /> 重命名
            </div>
          </Tooltip>
          <Tooltip tip="下载文件到本地" delay={1000} position="right">
            <div className="context-menu-item" onClick={() => { onDownload?.(item); onClose(); }}>
              <Download size={14} /> 下载
            </div>
          </Tooltip>
          <div className="context-menu-divider" />
          <Tooltip tip="永久删除此项目" delay={1000} position="right">
            <div className="context-menu-item danger" onClick={() => { onDelete?.(item); onClose(); }}>
              <Trash2 size={14} /> 删除
            </div>
          </Tooltip>
        </>
      )}
      {!item && (
        <>
          <Tooltip tip="上传文件到当前目录" delay={1000} position="right">
            <div className="context-menu-item" onClick={() => { onUpload?.(); onClose(); }}>
              <ArrowUp size={14} /> 上传文件
            </div>
          </Tooltip>
          {canPaste && (
            <Tooltip tip="粘贴剪贴板中的内容到当前位置" delay={1000} position="right">
              <div className="context-menu-item" onClick={() => { onPaste?.(); onClose(); }}>
                <Clipboard size={14} /> 粘贴
              </div>
            </Tooltip>
          )}
        </>
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
      <Tooltip tip="返回根目录" delay={1000}>
        <button 
          className="breadcrumb-btn"
          onClick={() => onNavigate('/')}
          title="根目录"
        >
          <Home size={16} />
        </button>
      </Tooltip>
      {parts.map((part, index) => {
        const fullPath = '/' + parts.slice(0, index + 1).join('/')
        return (
          <span key={fullPath} className="breadcrumb-sep">
            <span>/</span>
            <Tooltip tip={`导航到：${fullPath}`} delay={1000}>
              <button 
                className="breadcrumb-btn"
                onClick={() => onNavigate(fullPath)}
              >
                {part}
              </button>
            </Tooltip>
          </span>
        )
      })}
    </div>
  )
}

// =====================================================
// 项目导航侧边栏
// =====================================================
function ProjectSidebar({ vfs, currentPath, onNavigate }) {
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectList = await vfs.getVideoProjects()
        setProjects(projectList)
        
        const matchingProject = projectList.find(p => 
          currentPath === p.path || currentPath.startsWith(p.path + '/')
        )
        setCurrentProject(matchingProject || null)
      } catch (e) {
        console.error('加载项目列表失败:', e)
      } finally {
        setLoading(false)
      }
    }
    
    loadProjects()
  }, [vfs, currentPath])
  
  return (
    <div className="project-sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Folder size={16} /> 项目</span>
      </div>
      
      {loading ? (
        <div className="sidebar-loading caption text-muted">加载中...</div>
      ) : projects.length === 0 ? (
        <div className="sidebar-empty caption text-muted">
          暂无项目，请上传文件创建
        </div>
      ) : (
        <div className="project-list">
          {projects.map(project => (
            <button
              key={project.path}
              className={`project-item ${currentProject?.path === project.path ? 'active' : ''}`}
              onClick={() => onNavigate(project.path)}
            >
              <span className="project-icon"><Clapperboard size={14} /></span>
              <span className="project-name">{project.name}</span>
              <span className="project-date">
                {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
              </span>
            </button>
          ))}
        </div>
      )}
      
      <div className="sidebar-divider" />
      
      <div className="sidebar-section">
        <span className="sidebar-section-title">快速访问</span>
        <button 
          className="quick-nav-item"
          onClick={() => onNavigate('/projects')}
        >
          <FolderOpen size={14} /> 全部项目
        </button>
      </div>
    </div>
  )
}

// =====================================================
// 文件详情面板
// =====================================================
function FileDetailPanel({ file, vfs, onClose, onEdit, onDelete }) {
  const [content, setContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isJson, setIsJson] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const handleDelete = async () => {
    if (window.confirm(`确定要删除 "${file.name}" ${file.isDirectory ? '文件夹' : '文件'} 吗？`)) {
      try {
        await vfs.delete(file.path, true)
        onDelete?.(file)
      } catch (e) {
        alert(`删除失败：${e.message}`)
      }
    }
  }
  
  useEffect(() => {
    const loadFile = async () => {
      if (file && !file.isDirectory) {
        try {
          setLoading(true)
          const fileContent = await vfs.readFile(file.path)
          const textContent = fileContent instanceof ArrayBuffer
            ? new TextDecoder('utf-8').decode(fileContent)
            : String(fileContent)
          setContent(textContent)
          
          if (file.path.endsWith('.json')) {
            try {
              const parsed = JSON.parse(textContent)
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
  
  const ext = file?.name?.split('.').pop()?.toLowerCase()
  const isTextFile = file?.type?.startsWith('text/') || 
                     ['txt', 'md', 'srt', 'vtt', 'ass', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'json'].includes(ext)
  const editableExtensions = ['txt', 'json', 'md', 'js', 'jsx', 'ts', 'tsx', 'css', 'html']
  const isEditableFile = file && editableExtensions.includes(ext)
  
  useEffect(() => {
    if (isEditableFile && !isEditing && !loading) {
      setIsEditing(true)
    }
  }, [isEditableFile, isEditing, loading])
  
  if (!file) {
    return (
      <div className="detail-panel">
        <div className="detail-empty">
          <span className="detail-empty-icon">📄</span>
          <p className="detail-empty-text">选择文件查看详情</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="detail-panel">
      <div className="detail-header">
        <div className="detail-title">
          <span className="detail-icon">
            <FileIcon isDirectory={file.isDirectory} fileName={file.name} type={file.type} />
          </span>
          <span className="detail-name">{file.name}</span>
        </div>
        <div className="detail-actions">
          {!file.isDirectory && isTextFile && (
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
            className="btn btn-danger btn-sm"
            onClick={handleDelete}
            title="删除"
          >
            删除
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            title="关闭"
          >
            ✕
          </button>
        </div>
      </div>
      
      <div className="detail-info">
        <div className="info-row">
          <span className="info-label">路径</span>
          <span className="info-value">{file.path}</span>
        </div>
        {!file.isDirectory && (
          <>
            <div className="info-row">
              <span className="info-label">大小</span>
              <span className="info-value">
                {file.size < 1024 ? `${file.size} B` : 
                 file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` :
                 `${(file.size / 1024 / 1024).toFixed(1)} MB`}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">类型</span>
              <span className="info-value">{file.type || '未知'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">修改时间</span>
              <span className="info-value">
                {new Date(file.updatedAt).toLocaleString('zh-CN')}
              </span>
            </div>
          </>
        )}
      </div>
      
      <div className="detail-content">
        {file.type?.startsWith('video/') && <VideoPreview file={file} vfs={vfs} />}
        {file.type?.startsWith('audio/') && <AudioPreview file={file} vfs={vfs} />}
        {file.type?.startsWith('image/') && <ImagePreview file={file} vfs={vfs} />}
        {isTextFile && !file.isDirectory && (
          isEditing ? (
            <textarea
              className="file-editor"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ fontFamily: isJson ? 'monospace' : 'inherit' }}
              disabled={loading}
            />
          ) : (
            <TextPreview file={file} vfs={vfs} />
          )
        )}
        {!isTextFile && !file.isDirectory && !file.type?.startsWith('video/') && 
         !file.type?.startsWith('audio/') && !file.type?.startsWith('image/') && (
          <div className="preview-unsupported">
            <span className="preview-unsupported-icon">📄</span>
            <p>不支持预览此文件类型</p>
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================
// 重命名对话框
// =====================================================
function RenameDialog({ item, onClose, onRename }) {
  const [name, setName] = useState(item?.name || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!name.trim()) {
      setError('请输入名称')
      return
    }
    
    if (name === item.name) {
      onClose()
      return
    }
    
    try {
      setLoading(true)
      await onRename(item, name.trim())
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
        <h3 className="modal-title">重命名</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">名称</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              placeholder="输入新名称"
              autoFocus
            />
            {error && <p className="form-error">{error}</p>}
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
              {loading ? '重命名中...' : '确定'}
            </button>
          </div>
        </form>
      </div>
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
      const fullPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
      
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
          <div className="form-group">
            <label className="form-label">名称</label>
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
            {error && <p className="form-error">{error}</p>}
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
  const [projectName, setProjectName] = useState('')
  const [selectedProject, setSelectedProject] = useState('')
  const [projects, setProjects] = useState([])
  const [useExistingProject, setUseExistingProject] = useState(true)
  
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const projectList = await vfs.getVideoProjects()
        setProjects(projectList)
        if (projectList.length > 0) {
          setSelectedProject(projectList[0].path)
        }
      } catch (e) {
        console.error('加载项目列表失败:', e)
      }
    }
    
    loadProjects()
  }, [vfs])
  
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files)
    setFiles(selectedFiles)
  }
  
  const handleUpload = async () => {
    if (files.length === 0) return
    
    let targetProjectPath = ''
    if (useExistingProject) {
      if (!selectedProject) {
        setError('❌ 必须选择一个项目')
        return
      }
      targetProjectPath = selectedProject
    } else {
      if (!projectName.trim()) {
        setError('❌ 必须输入项目名称')
        return
      }
      const existingProjects = await vfs.getVideoProjects()
      const existingProject = existingProjects.find(p => p.name === projectName.trim())
      if (existingProject) {
        setError(`❌ 项目 "${projectName.trim()}" 已存在`)
        return
      }
      try {
        targetProjectPath = await vfs.createVideoProject(projectName.trim())
      } catch (e) {
        setError(`❌ 创建项目失败：${e.message}`)
        return
      }
    }
    
    try {
      setUploading(true)
      const newProgress = {}
      
      const uploadDir = currentPath.startsWith(targetProjectPath) 
        ? currentPath 
        : targetProjectPath
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fullPath = `${uploadDir}/${file.name}`
        
        newProgress[file.name] = 0
        setProgress({ ...newProgress })
        
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('读取文件失败'))
          reader.readAsArrayBuffer(file)
        })
        
        await vfs.writeFile(fullPath, content, {
          type: file.type,
          metadata: {
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
            project: targetProjectPath,
          },
        })
        
        newProgress[file.name] = 100
        setProgress({ ...newProgress })
      }
      
      onUploaded?.(files.map(f => ({
        name: f.name,
        path: `${uploadDir}/${f.name}`,
        project: targetProjectPath,
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
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">上传文件</h3>
        
        <div className="form-group">
          <label className="form-label">
            <span className="required">*</span> 选择或创建项目
          </label>
          
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                checked={useExistingProject}
                onChange={() => setUseExistingProject(true)}
                disabled={projects.length === 0}
              />
              选择现有项目
            </label>
            <label className="radio-label">
              <input
                type="radio"
                checked={!useExistingProject}
                onChange={() => setUseExistingProject(false)}
              />
              创建新项目
            </label>
          </div>
          
          {useExistingProject ? (
            <select
              className="input"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              disabled={projects.length === 0}
            >
              {projects.length === 0 ? (
                <option value="">暂无项目</option>
              ) : (
                projects.map(project => (
                  <option key={project.path} value={project.path}>
                    {project.name} - {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                  </option>
                ))
              )}
            </select>
          ) : (
            <input
              type="text"
              className="input"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value)
                setError('')
              }}
              placeholder="输入新项目名称"
            />
          )}
        </div>
        
        <div className="form-group">
          <label className="form-label">选择文件</label>
          <input
            type="file"
            multiple
            onChange={handleFileSelect}
            className="file-input"
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
          
          {error && <p className="form-error">{error}</p>}
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
// 存储信息
// =====================================================
function StorageInfo({ vfs }) {
  const [info, setInfo] = useState(null)
  const [mode, setMode] = useState(null)
  
  useEffect(() => {
    const loadInfo = async () => {
      try {
        const storageInfo = await vfs.getStorageInfo()
        setInfo(storageInfo)
        // 检测 VFS 模式
        if (vfs.getMode) {
          setMode(vfs.getMode())
        } else if (typeof window !== 'undefined' && window.electronAPI) {
          setMode('electron')
        } else {
          setMode('indexeddb')
        }
      } catch (e) {
        console.error('加载存储信息失败:', e)
      }
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
      {mode && (
        <span className="caption text-muted" title={`当前使用：${mode === 'electron' ? 'Electron 本地文件系统' : 'IndexedDB 虚拟文件系统'}`}>
          · {mode === 'electron' ? '🖥️ Electron' : '🌐 IndexedDB'}
        </span>
      )}
    </div>
  )
}

// =====================================================
// 主文件浏览器组件
// =====================================================
function FileBrowser({ vfs, onFileSelect, onFileOpen, className, initialPath = '/projects' }) {
  const [currentPath, setCurrentPath] = useState(initialPath)
  const [items, setItems] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createType, setCreateType] = useState('file')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('all')
  
  // 右键菜单相关状态
  const [contextMenu, setContextMenu] = useState(null) // { x, y, item }
  const [clipboard, setClipboard] = useState(null) // { item, action: 'copy' | 'cut' }
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameItem, setRenameItem] = useState(null)
  
  useEffect(() => {
    const initPath = async () => {
      // 尝试使用传入的 initialPath，如果没有则使用 VFS 保存的当前路径
      let targetPath = initialPath
      
      // 如果没有指定 initialPath，尝试从 VFS 获取保存的路径
      if (!targetPath) {
        targetPath = vfs.currentPath || '/projects'
      }
      
      // 确保目标路径存在
      if (targetPath && !vfs.exists(targetPath)) {
        try {
          // 尝试创建路径，如果失败则回退到 /projects
          await vfs.mkdir(targetPath, true)
        } catch (e) {
          console.error('创建初始路径失败:', e)
          targetPath = '/projects'
        }
      }
      
      if (targetPath && targetPath !== currentPath) {
        try {
          vfs.cd(targetPath)
          setCurrentPath(vfs.pwd())
        } catch (e) {
          console.error('初始化路径失败:', e)
          setCurrentPath('/projects')
        }
      }
    }
    
    initPath()
  }, [])
  
  const loadDirectory = useCallback(async () => {
    if (!vfs) {
      setItems([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      let dirItems
      try {
        dirItems = await vfs.listDirectory(currentPath)
        // 确保返回的是数组
        if (!Array.isArray(dirItems)) {
          console.warn('vfs.listDirectory 返回非数组:', dirItems)
          dirItems = []
        }
      } catch (e) {
        console.error('vfs.listDirectory 调用失败:', e)
        dirItems = []
      }
      
      if (filterType !== 'all') {
        dirItems = dirItems.filter(item => {
          if (item.isDirectory) return true
          if (!item.type) return false
          switch (filterType) {
            case 'video': return item.type.startsWith('video/')
            case 'audio': return item.type.startsWith('audio/')
            case 'image': return item.type.startsWith('image/')
            case 'document': return item.type.startsWith('text/') || item.type === 'application/json'
            default: return true
          }
        })
      }
      
      let filtered = dirItems
      if (searchQuery) {
        filtered = dirItems.filter(item => 
          item.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      }
      
      // 确保 filtered 是数组后再排序
      if (Array.isArray(filtered)) {
        filtered.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          
          let comparison = 0
          switch (sortBy) {
            case 'name': comparison = a.name.localeCompare(b.name); break
            case 'size': comparison = (a.size || 0) - (b.size || 0); break
            case 'time': comparison = new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0); break
            default: comparison = 0
          }
          
          return sortOrder === 'asc' ? comparison : -comparison
        })
      }
      
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
  
  const navigateTo = async (path) => {
    try {
      // 移除焦点，防止进入新目录时选中所有项目
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur()
      }
      vfs.cd(path)
      setCurrentPath(vfs.pwd())
      setSelectedFile(null)
    } catch (e) {
      console.error('导航失败:', e)
    }
  }
  
  const handleOpen = async (e, item) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (item.isDirectory) {
      await navigateTo(item.path)
    } else {
      setSelectedFile(item)
      setShowDetail(true)
      onFileOpen?.(item)
    }
  }
  
  const handleSelect = (item) => {
    if (item.isDirectory) {
      setSelectedFile(null)
    } else {
      setSelectedFile(item)
    }
    onFileSelect?.(item)
  }
  
  const handleFileClick = (item) => {
    if (!item.isDirectory) {
      setSelectedFile(item)
      onFileSelect?.(item)
    }
  }
  
  const goUp = () => {
    if (currentPath !== '/') {
      const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
      navigateTo(parentPath)
    }
  }
  
  const refresh = () => {
    loadDirectory()
  }
  
  const handleCreate = (type) => {
    setCreateType(type)
    setShowCreateDialog(true)
  }
  
  const handleUpload = () => {
    setShowUploadDialog(true)
  }
  
  const handleUploadComplete = (uploadedFiles) => {
    refresh()
    onFileSelect?.(null)
  }
  
  const handleDeleteFile = async (deletedItem) => {
    try {
      await vfs.delete(deletedItem.path, true)
      refresh()
      if (selectedFile?.path === deletedItem.path) {
        setSelectedFile(null)
      }
    } catch (e) {
      alert(`删除失败：${e.message}`)
    }
  }
  
  // 右键菜单处理函数
  const handleContextMenu = (e, item) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - 300),
      item,
    })
  }
  
  // 复制文件/文件夹
  const handleCopy = async (item) => {
    try {
      setClipboard({ item, action: 'copy' })
    } catch (e) {
      alert(`复制失败：${e.message}`)
    }
  }
  
  // 剪切文件/文件夹
  const handleCut = async (item) => {
    try {
      setClipboard({ item, action: 'cut' })
    } catch (e) {
      alert(`剪切失败：${e.message}`)
    }
  }
  
  // 粘贴文件/文件夹
  const handlePaste = async () => {
    if (!clipboard) return
    
    try {
      const { item, action } = clipboard
      const targetPath = `${currentPath === '/' ? '' : currentPath + '/'}${item.name}`
      
      if (action === 'copy') {
        // 复制操作 - 使用 vfs.copy 方法
        await vfs.copy(item.path, targetPath)
      } else if (action === 'cut') {
        // 移动操作
        await vfs.move(item.path, targetPath)
      }
      
      setClipboard(null)
      refresh()
    } catch (e) {
      alert(`粘贴失败：${e.message}`)
    }
  }
  
  // 重命名文件/文件夹
  const handleRename = async (item, newName) => {
    if (!newName || newName === item.name) return
    
    try {
      const newPath = `${item.path.substring(0, item.path.lastIndexOf('/') + 1)}${newName}`
      await vfs.move(item.path, newPath)
      setRenameItem(null)
      setShowRenameDialog(false)
      refresh()
    } catch (e) {
      alert(`重命名失败：${e.message}`)
    }
  }
  
  // 下载文件
  const handleDownload = async (item) => {
    if (item.isDirectory) {
      alert('暂不支持下载文件夹')
      return
    }
    
    try {
      const blob = await vfs.readFileAsBlob(item.path)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`下载失败：${e.message}`)
    }
  }
  
  // 处理文件列表区域的右键（空白处）
  const handleContentContextMenu = (e) => {
    e.preventDefault()
    // 如果点击的是空白处，只显示粘贴选项
    if (e.target.classList.contains('file-list-container') || 
        e.target.classList.contains('file-list') || 
        e.target.classList.contains('file-grid') ||
        e.target.classList.contains('empty-state')) {
      setContextMenu({
        x: Math.min(e.clientX, window.innerWidth - 200),
        y: Math.min(e.clientY, window.innerHeight - 300),
        item: null,
      })
    }
  }
  
  return (
    <div className={`file-browser ${showDetail ? 'show-detail' : ''} ${className || ''}`}>
      {/* 左侧项目导航 */}
      <aside className="file-browser-sidebar">
        <ProjectSidebar 
          vfs={vfs} 
          currentPath={currentPath}
          onNavigate={navigateTo}
        />
      </aside>
      
      {/* 中间文件列表区 */}
      <main className="file-browser-content">
        {/* 工具栏 */}
        <div className="file-browser-toolbar">
          <div className="toolbar-left">
            <Breadcrumb path={currentPath} onNavigate={navigateTo} />
          </div>
          
          <div className="toolbar-right">
            <Tooltip tip="返回上一级目录" delay={1000}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={goUp}
                disabled={currentPath === '/'}
                title="上一级"
              >
                <ArrowUp size={16} strokeWidth={2} />
              </button>
            </Tooltip>
            
            <Tooltip tip="刷新当前目录文件列表" delay={1000}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={refresh}
                title="刷新"
              >
                <RefreshCw size={16} strokeWidth={2} />
              </button>
            </Tooltip>
            
            <Tooltip tip="按文件类型筛选显示" delay={1000}>
              <select
                className="filter-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="all">全部</option>
                <option value="video">视频</option>
                <option value="audio">音频</option>
                <option value="image">图片</option>
                <option value="document">文档</option>
              </select>
            </Tooltip>
            
            <Tooltip tip="搜索文件名" delay={1000}>
              <input
                type="text"
                className="search-input"
                placeholder="搜索文件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </Tooltip>
            
            <Tooltip tip="选择文件排序方式" delay={1000}>
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
            </Tooltip>
            
            <div className="view-toggle">
              <Tooltip tip="切换到列表视图" delay={1000}>
                <button
                  className={`btn-toggle ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="列表视图"
                >
                  <List size={16} />
                </button>
              </Tooltip>
              <Tooltip tip="切换到网格视图" delay={1000}>
                <button
                  className={`btn-toggle ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="网格视图"
                >
                  <Grid3x3 size={16} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
        
        {/* 文件列表 */}
        <div 
          className={`file-list-container view-${viewMode}`}
          onContextMenu={handleContentContextMenu}
        >
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
                  className="btn btn-primary"
                  onClick={handleUpload}
                >
                  上传文件
                </button>
              )}
            </div>
          ) : (
            viewMode === 'list' ? (
              <div className="file-list">
                {items.map((item) => (
                  <FileListItem
                    key={item.path}
                    item={item}
                    onSelect={handleSelect}
                    onOpen={handleOpen}
                    selected={selectedFile?.path === item.path}
                    onDelete={handleDeleteFile}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            ) : (
              <div className="file-grid">
                {items.map((item) => (
                  <FileGridItem
                    key={item.path}
                    item={item}
                    onSelect={handleSelect}
                    onOpen={handleOpen}
                    selected={selectedFile?.path === item.path}
                    onDelete={handleDeleteFile}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            )
          )}
        </div>
        
        {/* 底部状态栏 */}
        <div className="file-browser-status">
          <StorageInfo vfs={vfs} />
          <span className="caption text-muted">
            {items.length} 个项目
          </span>
        </div>
      </main>
      
      {/* 右侧详情面板 */}
      {showDetail && (
        <aside className="file-browser-detail">
          <FileDetailPanel
            file={selectedFile}
            vfs={vfs}
            onClose={() => {
              setSelectedFile(null)
              setShowDetail(false)
            }}
            onEdit={onFileOpen}
            onDelete={() => {
              setSelectedFile(null)
              setShowDetail(false)
              refresh()
            }}
          />
        </aside>
      )}
      
      {/* 对话框 */}
      {showCreateDialog && (
        <CreateDialog
          vfs={vfs}
          currentPath={currentPath}
          type={createType}
          onClose={() => setShowCreateDialog(false)}
          onCreated={refresh}
        />
      )}
      
      {showUploadDialog && (
        <UploadDialog
          vfs={vfs}
          currentPath={currentPath}
          onClose={() => setShowUploadDialog(false)}
          onUploaded={handleUploadComplete}
        />
      )}
      
      {showRenameDialog && renameItem && (
        <RenameDialog
          item={renameItem}
          onClose={() => {
            setShowRenameDialog(false)
            setRenameItem(null)
          }}
          onRename={handleRename}
        />
      )}
      
      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          canPaste={clipboard !== null}
          onDelete={handleDeleteFile}
          onRename={(item) => {
            setRenameItem(item)
            setShowRenameDialog(true)
          }}
          onDownload={handleDownload}
          onUpload={handleUpload}
        />
      )}
    </div>
  )
}

export default FileBrowser
export { VideoPreview, AudioPreview, ImagePreview, TextPreview }