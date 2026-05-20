// ================ FILE: D:\workspace\rjcut\studio/src/components\BatchConfigEditor.jsx ================

import { useState, useEffect, useCallback, useRef } from 'react'

// =====================================================
// 验证级别标签组件
// =====================================================
function ValidationBadge({ level }) {
  const styles = {
    error: {
      backgroundColor: '#ffe5e5',
      color: '#dc3545',
      border: '1px solid #dc3545',
    },
    warning: {
      backgroundColor: '#fff3cd',
      color: '#856404',
      border: '1px solid #ffc107',
    },
    info: {
      backgroundColor: '#e7f3ff',
      color: '#0066cc',
      border: '1px solid #0066cc',
    },
  }
  
  const icons = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }
  
  const labels = {
    error: '错误',
    warning: '警告',
    info: '提示',
  }
  
  return (
    <span 
      className="validation-badge"
      style={{
        ...styles[level],
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
      }}
    >
      <span>{icons[level]}</span>
      <span>{labels[level]}</span>
    </span>
  )
}

// =====================================================
// 单个任务验证结果卡片
// =====================================================
function TaskValidationCard({ result, onFix }) {
  const [expanded, setExpanded] = useState(false)
  
  const errorCount = result.issues.filter(i => i.level === 'error').length
  const warningCount = result.issues.filter(i => i.level === 'warning').length
  const infoCount = result.issues.filter(i => i.level === 'info').length
  
  const getStatusColor = () => {
    if (errorCount > 0) return '#dc3545'
    if (warningCount > 0) return '#ffc107'
    return '#28a745'
  }
  
  const getStatusIcon = () => {
    if (errorCount > 0) return '❌'
    if (warningCount > 0) return '⚠️'
    return '✅'
  }
  
  return (
    <div 
      className="task-validation-card"
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        backgroundColor: result.is_valid ? '#f8f9fa' : '#fff5f5',
      }}
    >
      <div 
        className="task-validation-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>{getStatusIcon()}</span>
          <div>
            <h4 className="caption-strong" style={{ margin: 0 }}>
              {result.task_name}
            </h4>
            <p className="caption" style={{ margin: '4px 0 0', color: '#666' }}>
              {errorCount} 个错误 · {warningCount} 个警告 · {infoCount} 个提示
            </p>
          </div>
        </div>
        
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      
      {/* 文件状态概览 */}
      <div className="file-status-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '8px',
        marginBottom: '12px',
      }}>
        <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
          <span className="caption" style={{ color: '#666' }}>必需文件</span>
          <div style={{ marginTop: '4px' }}>
            {Object.entries(result.required_files).map(([field, present]) => (
              <div key={field} style={{ 
                fontSize: '12px', 
                color: present ? '#28a745' : '#dc3545',
                marginTop: '2px',
              }}>
                {present ? '✓' : '✗'} {field}
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
          <span className="caption" style={{ color: '#666' }}>可选文件</span>
          <div style={{ marginTop: '4px' }}>
            {Object.entries(result.optional_files).map(([field, present]) => (
              <div key={field} style={{ 
                fontSize: '12px', 
                color: present ? '#28a745' : '#6c757d',
                marginTop: '2px',
              }}>
                {present ? '✓' : '○'} {field}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 问题列表 */}
      {expanded && result.issues.length > 0 && (
        <div className="issues-list">
          {result.issues.map((issue, idx) => (
            <div 
              key={idx}
              className="issue-item"
              style={{
                padding: '12px',
                backgroundColor: '#fff',
                borderRadius: '4px',
                marginBottom: '8px',
                borderLeft: `3px solid ${issue.level === 'error' ? '#dc3545' : issue.level === 'warning' ? '#ffc107' : '#0066cc'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <ValidationBadge level={issue.level} />
                <span className="caption" style={{ color: '#666' }}>{issue.field}</span>
              </div>
              
              <p className="body" style={{ margin: '0 0 8px', fontSize: '14px' }}>
                {issue.message}
              </p>
              
              {issue.suggestion && (
                <div style={{ 
                  backgroundColor: '#f8f9fa', 
                  padding: '8px', 
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#666',
                }}>
                  💡 {issue.suggestion}
                </div>
              )}
              
              {onFix && (
                <button
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '8px' }}
                  onClick={() => onFix(result.task_name, issue)}
                >
                  一键修复
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// JSON 编辑器组件
// =====================================================
function JSONEditor({ value, onChange, error, readOnly = false }) {
  const [localValue, setLocalValue] = useState(JSON.stringify(value, null, 2))
  const [parseError, setParseError] = useState(null)
  
  useEffect(() => {
    setLocalValue(JSON.stringify(value, null, 2))
  }, [value])
  
  const handleChange = (e) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    
    try {
      const parsed = JSON.parse(newValue)
      setParseError(null)
      onChange?.(parsed)
    } catch (err) {
      setParseError(err.message)
    }
  }
  
  return (
    <div className="json-editor">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <span className="caption-strong">JSON 配置</span>
        <span className="caption" style={{ color: '#666' }}>
          {localValue.split('\n').length} 行
        </span>
      </div>
      
      <textarea
        className="file-editor"
        value={localValue}
        onChange={handleChange}
        readOnly={readOnly}
        rows={16}
        style={{
          fontFamily: 'Monaco, Consolas, monospace',
          fontSize: '13px',
          lineHeight: '1.5',
          backgroundColor: parseError ? '#fff5f5' : '#fafbfc',
          border: parseError ? '1px solid #dc3545' : '1px solid #e0e0e0',
        }}
      />
      
      {(error || parseError) && (
        <div style={{ 
          marginTop: '8px', 
          padding: '8px', 
          backgroundColor: '#fff5f5', 
          borderRadius: '4px',
          color: '#dc3545',
          fontSize: '13px',
        }}>
          ❌ {parseError || error}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 文件选择器组件
// =====================================================
function FileSelector({ value, onChange, vfs, fileType = 'any', label, placeholder }) {
  const [showPicker, setShowPicker] = useState(false)
  const [currentPath, setCurrentPath] = useState('/')
  const [files, setFiles] = useState([])
  
  // 获取文件类型过滤器
  const getFileFilter = () => {
    switch (fileType) {
      case 'video':
        return (item) => !item.isDirectory && item.type?.startsWith('video/')
      case 'audio':
        return (item) => !item.isDirectory && item.type?.startsWith('audio/')
      case 'json':
        return (item) => !item.isDirectory && item.name.endsWith('.json')
      case 'directory':
        return (item) => item.isDirectory
      default:
        return (item) => !item.isDirectory
    }
  }
  
  // 加载当前目录的文件
  useEffect(() => {
    if (vfs && showPicker) {
      try {
        const items = vfs.listDirectory(currentPath)
        setFiles(items.filter(getFileFilter()))
      } catch (e) {
        console.error('加载目录失败:', e)
        setFiles([])
      }
    }
  }, [vfs, currentPath, showPicker, fileType])
  
  const handleSelectFile = (file) => {
    onChange?.(file.path)
    setShowPicker(false)
  }
  
  const handleNavigateUp = () => {
    if (currentPath !== '/') {
      const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/'
      setCurrentPath(parentPath)
    }
  }
  
  const handleNavigateTo = (path) => {
    setCurrentPath(path)
  }
  
  return (
    <div className="file-selector">
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          type="text"
          className="input"
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowPicker(true)}
          title="选择文件"
        >
          📁 选择
        </button>
      </div>
      
      {/* 文件选择器弹窗 */}
      {showPicker && (
        <div 
          className="file-picker-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowPicker(false)}
        >
          <div 
            className="file-picker-dialog"
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '20px',
              minWidth: '500px',
              maxWidth: '80%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="tagline">选择{label || '文件'}</h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowPicker(false)}
              >
                ✕
              </button>
            </div>
            
            {/* 导航栏 */}
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              marginBottom: '12px',
              padding: '8px',
              backgroundColor: '#f5f5f7',
              borderRadius: '8px',
            }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleNavigateUp}
                disabled={currentPath === '/'}
              >
                ⬆️ 上一级
              </button>
              <span className="caption" style={{ 
                flex: 1, 
                display: 'flex', 
                alignItems: 'center',
                fontFamily: 'monospace',
              }}>
                📂 {currentPath}
              </span>
            </div>
            
            {/* 文件列表 */}
            <div style={{ 
              flex: 1, 
              overflow: 'auto', 
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
            }}>
              {files.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                  暂无文件
                </div>
              ) : (
                files.map((file, idx) => (
                  <div
                    key={idx}
                    className="file-picker-item"
                    onClick={() => file.isDirectory ? handleNavigateTo(file.path) : handleSelectFile(file)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      borderBottom: idx < files.length - 1 ? '1px solid #f0f0f0' : 'none',
                      backgroundColor: value === file.path ? '#e3f2fd' : 'transparent',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = value === file.path ? '#e3f2fd' : '#f5f5f7'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = value === file.path ? '#e3f2fd' : 'transparent'}
                  >
                    <span style={{ fontSize: '20px' }}>
                      {file.isDirectory ? '📁' : fileType === 'video' ? '🎬' : fileType === 'audio' ? '🎵' : '📄'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="body-strong">{file.name}</div>
                      {file.type && (
                        <div className="caption" style={{ color: '#999' }}>{file.type}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* 底部按钮 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '8px' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowPicker(false)}
              >
                取消
              </button>
              {value && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowPicker(false)}
                >
                  确定
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 任务配置编辑器
// =====================================================
function TaskConfigEditor({ task, index, onChange, onDelete, vfs }) {
  const [expanded, setExpanded] = useState(false)
  
  const updateField = (field, value) => {
    onChange?.(index, { ...task, [field]: value })
  }
  
  const fields = [
    { key: 'name', label: '任务名称', required: true, type: 'text' },
    { key: 'video_file', label: '视频文件', required: true, type: 'file', fileType: 'video', placeholder: './videos/video.mp4' },
    { key: 'script_file', label: '脚本文件', required: false, type: 'file', fileType: 'json', placeholder: './scripts/script.json' },
    { key: 'corrections_file', label: '纠错字典', required: false, type: 'file', fileType: 'json', placeholder: './corrections.json' },
    { key: 'bgm_file', label: '背景音乐', required: false, type: 'file', fileType: 'audio', placeholder: './bgm.mp3' },
    { key: 'scenes_dir', label: '场景素材目录', required: false, type: 'file', fileType: 'directory', placeholder: './scenes' },
  ]
  
  return (
    <div className="task-config-editor" style={{
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
      backgroundColor: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="caption-strong">任务 {index + 1}</span>
          <input
            type="text"
            value={task.name || ''}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="任务名称"
            style={{
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '14px',
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '收起' : '展开'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onDelete?.(index)}
            style={{ color: '#dc3545' }}
          >
            🗑️
          </button>
        </div>
      </div>
      
      {expanded ? (
        <div className="task-fields" style={{ display: 'grid', gap: '12px' }}>
          {fields.map(field => (
            <div key={field.key}>
              <label className="caption-strong" style={{ display: 'block', marginBottom: '4px' }}>
                {field.label} {field.required && <span style={{ color: '#dc3545' }}>*</span>}
              </label>
              {field.type === 'file' ? (
                <FileSelector
                  value={task[field.key] || ''}
                  onChange={(value) => updateField(field.key, value)}
                  vfs={vfs}
                  fileType={field.fileType}
                  label={field.label}
                  placeholder={field.placeholder}
                />
              ) : (
                <input
                  type="text"
                  className="input"
                  value={task[field.key] || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="task-summary" style={{ fontSize: '13px', color: '#666' }}>
          <div>📹 视频：{task.video_file || '未设置'}</div>
          <div>📝 脚本：{task.script_file || '未设置'}</div>
          {task.bgm_file && <div>🎵 背景音乐：{task.bgm_file}</div>}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 项目文件快速填充组件
// =====================================================
function ProjectFileQuickFill({ vfs, onFill, currentPath = '/' }) {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [taskConfig, setTaskConfig] = useState({
    name: '',
    video_file: '',
    script_file: '',
    bgm_file: '',
    corrections_file: '',
    scenes_dir: '',
  })
  const taskConfigRef = useRef({
    name: '',
    video_file: '',
    script_file: '',
    bgm_file: '',
    corrections_file: '',
    scenes_dir: '',
  })
  const [loading, setLoading] = useState(false)
  const [showFileBrowser, setShowFileBrowser] = useState(false)
  const [browserForField, setBrowserForField] = useState(null)
  const [browserPath, setBrowserPath] = useState('/')
  const [browserFiles, setBrowserFiles] = useState([])
  const [useProjectMode, setUseProjectMode] = useState(false)
  
  useEffect(() => {
    const loadProjects = async () => {
      if (vfs) {
        try {
          setLoading(true)
          const projectList = await vfs.getVideoProjects?.() || []
          setProjects(Array.isArray(projectList) ? projectList : [])
        } catch (e) {
          console.error('加载项目列表失败:', e)
          setProjects([])
        } finally {
          setLoading(false)
        }
      }
    }
    
    loadProjects()
  }, [vfs])
  
  const handleSelectProject = (project) => {
    const newConfig = {
      name: project?.name || '',
      video_file: '',
      script_file: '',
      bgm_file: '',
      corrections_file: '',
      scenes_dir: '',
    }
    setSelectedProject(project)
    setTaskConfig(newConfig)
    taskConfigRef.current = newConfig
    setBrowserPath(project?.path || '/')
  }
  
  const updateTaskConfig = (field, value) => {
    const newConfig = { ...taskConfigRef.current, [field]: value }
    taskConfigRef.current = newConfig
    setTaskConfig(newConfig)
  }
  
  const handleFill = () => {
    onFill?.(taskConfigRef.current)
  }
  
  const openFileBrowser = (field, fileType = 'any', initialPath) => {
    setBrowserForField({ field, fileType })
    setBrowserPath(initialPath || browserPath || '/')
    setShowFileBrowser(true)
  }
  
  useEffect(() => {
    if (vfs && showFileBrowser && browserForField) {
      try {
        const items = vfs.listDirectory(browserPath) || []
        const { fileType } = browserForField
        
        const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv']
        const audioExts = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']
        
        let filtered = items
        if (fileType === 'video') {
          filtered = items.filter(item => 
            !item.isDirectory && 
            (item.type?.startsWith('video/') || videoExts.some(ext => item.name.toLowerCase().endsWith(ext)))
          )
        } else if (fileType === 'audio') {
          filtered = items.filter(item => 
            !item.isDirectory && 
            (item.type?.startsWith('audio/') || audioExts.some(ext => item.name.toLowerCase().endsWith(ext)))
          )
        } else if (fileType === 'json') {
          filtered = items.filter(item => !item.isDirectory && item.name.endsWith('.json'))
        } else if (fileType === 'directory') {
          filtered = items.filter(item => item.isDirectory)
        } else {
          filtered = items.filter(item => !item.isDirectory)
        }
        
        setBrowserFiles(filtered)
      } catch (e) {
        console.error('加载目录失败:', e)
        setBrowserFiles([])
      }
    }
  }, [vfs, showFileBrowser, browserPath, browserForField])
  
  const handleBrowserSelect = (file) => {
    if (browserForField) {
      updateTaskConfig(browserForField.field, file.path)
    }
    setShowFileBrowser(false)
    setBrowserForField(null)
  }
  
  const handleNavigateUp = () => {
    if (browserPath !== '/') {
      const parentPath = browserPath.split('/').slice(0, -1).join('/') || '/'
      setBrowserPath(parentPath)
    }
  }
  
  const getFieldTypeLabel = (field) => {
    const labels = {
      video_file: '视频文件',
      script_file: '脚本文件',
      bgm_file: '背景音乐',
      corrections_file: '纠错字典',
      scenes_dir: '场景目录',
    }
    return labels[field] || '文件'
  }
  
  const getFieldType = (field) => {
    const types = {
      video_file: 'video',
      script_file: 'json',
      bgm_file: 'audio',
      corrections_file: 'json',
      scenes_dir: 'directory',
    }
    return types[field] || 'any'
  }
  
  const isInProject = selectedProject && browserPath.startsWith(selectedProject.path)
  const projectSubdirs = ['raw', 'edited', 'audio', 'subtitles', 'output', 'scenes']
  
  const isLikelyScenesDir = (path) => {
    if (!vfs || !path) return false
    try {
      const items = vfs.listDirectory(path) || []
      const jsonFiles = items.filter(item => !item.isDirectory && item.name.endsWith('.json'))
      const imageFiles = items.filter(item => !item.isDirectory && item.type?.startsWith('image/'))
      const videoFiles = items.filter(item => !item.isDirectory && item.type?.startsWith('video/'))
      return jsonFiles.length > 0 || (imageFiles.length + videoFiles.length) >= 3
    } catch {
      return false
    }
  }
  
  const currentIsScenesDir = isLikelyScenesDir(browserPath)
  
  return (
    <>
      <div className="project-file-quick-fill" style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        backgroundColor: '#f8f9fa',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 className="caption-strong">📁 选择文件填充任务</h4>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleFill}
          >
            填充到当前任务
          </button>
        </div>
        
        {/* 模式切换 */}
        <div style={{ marginBottom: '12px' }}>
          <label className="caption" style={{ display: 'block', marginBottom: '4px' }}>
            选择模式
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`btn btn-sm ${!useProjectMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setUseProjectMode(false)}
            >
              🗂️ 自由浏览模式
            </button>
            <button
              className={`btn btn-sm ${useProjectMode ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setUseProjectMode(true)}
              disabled={projects.length === 0}
            >
              🎬 项目模式 ({projects.length} 个项目)
            </button>
          </div>
        </div>
        
        {/* 项目选择（仅项目模式） */}
        {useProjectMode && (
          <div style={{ marginBottom: '16px' }}>
            <label className="caption" style={{ display: 'block', marginBottom: '4px' }}>
              选择项目
            </label>
            {loading ? (
              <div className="caption" style={{ color: '#999' }}>加载中...</div>
            ) : (
              <select
                className="input"
                value={selectedProject?.path || ''}
                onChange={(e) => {
                  const project = projects.find(p => p.path === e.target.value)
                  handleSelectProject(project)
                }}
                style={{ width: '100%' }}
              >
                <option value="">-- 选择项目 --</option>
                {Array.isArray(projects) && projects.map(project => (
                  <option key={project.path} value={project.path}>
                    {project.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        
        {/* 文件选择区域 */}
        <div style={{ display: 'grid', gap: '12px' }}>
          {[
            { field: 'video_file', icon: '🎬', placeholder: '选择视频文件' },
            { field: 'script_file', icon: '📝', placeholder: '选择脚本文件' },
            { field: 'bgm_file', icon: '🎵', placeholder: '选择背景音乐' },
            { field: 'corrections_file', icon: '📋', placeholder: '选择纠错字典' },
            { field: 'scenes_dir', icon: '🎭', placeholder: '选择场景目录' },
          ].map(item => (
            <div key={item.field}>
              <label className="caption-strong" style={{ display: 'block', marginBottom: '4px' }}>
                {item.icon} {getFieldTypeLabel(item.field)}
              </label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="input"
                  value={taskConfig[item.field] || ''}
                  onChange={(e) => updateTaskConfig(item.field, e.target.value)}
                  placeholder={item.placeholder}
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px' }}
                  readOnly
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => openFileBrowser(item.field, getFieldType(item.field), selectedProject?.path || '/')}
                >
                  📁 浏览
                </button>
                {taskConfig[item.field] && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateTaskConfig(item.field, '')}
                    title="清除"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <p className="caption" style={{ color: '#999', marginTop: '12px' }}>
          💡 提示：点击"浏览"按钮可以在文件系统中选择任意位置的文件。
          {useProjectMode && selectedProject && ` 当前在项目 "${selectedProject.name}" 中。`}
        </p>
      </div>
      
      {/* 文件浏览器弹窗 */}
      {showFileBrowser && browserForField && (
        <div 
          className="file-picker-modal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowFileBrowser(false)}
        >
          <div 
            className="file-picker-dialog"
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '20px',
              minWidth: '500px',
              maxWidth: '80%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className="tagline">
                选择{getFieldTypeLabel(browserForField.field)}
              </h3>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowFileBrowser(false)}
              >
                ✕
              </button>
            </div>
            
            {/* 导航栏 */}
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              marginBottom: '12px',
              padding: '8px',
              backgroundColor: '#f5f5f7',
              borderRadius: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleNavigateUp}
                disabled={browserPath === '/'}
              >
                ⬆️ 上一级
              </button>
              <span className="caption" style={{ 
                display: 'flex', 
                alignItems: 'center',
                fontFamily: 'monospace',
                minWidth: '150px',
              }}>
                📂 {browserPath}
              </span>
              {/* 快速导航到项目子目录 */}
              {isInProject && (
                <>
                  {projectSubdirs.map(subdir => (
                    <button
                      key={subdir}
                      className="btn btn-ghost btn-sm"
                      onClick={() => setBrowserPath(`${selectedProject.path}/${subdir}`)}
                      title={`${subdir} 目录`}
                    >
                      {subdir === 'raw' ? '🎬' : subdir === 'audio' ? '🎵' : subdir === 'subtitles' ? '📝' : subdir === 'output' ? '📤' : subdir === 'scenes' ? '🎭' : '📁'} {subdir}
                    </button>
                  ))}
                </>
              )}
              {/* 快速导航到常用目录 */}
              {!isInProject && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBrowserPath('/videos')}
                    title="视频目录"
                  >
                    🎬 videos
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBrowserPath('/audio')}
                    title="音频目录"
                  >
                    🎵 audio
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setBrowserPath('/drafts')}
                    title="草稿目录"
                  >
                    📝 drafts
                  </button>
                </>
              )}
            </div>
            
            {/* 场景目录提示 */}
            {browserForField?.field === 'scenes_dir' && (
              <div style={{ 
                padding: '8px 12px',
                marginBottom: '12px',
                borderRadius: '8px',
                backgroundColor: currentIsScenesDir ? '#d4edda' : '#fff3cd',
                border: `1px solid ${currentIsScenesDir ? '#28a745' : '#ffc107'}`,
                fontSize: '13px',
              }}>
                {currentIsScenesDir ? (
                  <span style={{ color: '#28a745' }}>
                    ✅ 当前目录看起来是一个有效的场景目录（包含场景素材文件）
                  </span>
                ) : (
                  <span style={{ color: '#856404' }}>
                    ⚠️ 当前目录可能不是场景目录。场景目录应该包含 JSON 脚本文件或场景素材（图片/视频）。
                    {isInProject && ` 建议尝试 "${selectedProject.path}/scenes" 目录。`}
                  </span>
                )}
              </div>
            )}
            
            {/* 文件列表 */}
            <div style={{ 
              flex: 1, 
              overflow: 'auto', 
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
            }}>
              {browserFiles.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                  暂无文件
                </div>
              ) : (
                browserFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="file-picker-item"
                    onClick={() => file.isDirectory && browserForField.fileType === 'directory' 
                      ? setBrowserPath(file.path) 
                      : handleBrowserSelect(file)}
                    style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      borderBottom: idx < browserFiles.length - 1 ? '1px solid #f0f0f0' : 'none',
                      backgroundColor: taskConfig[browserForField.field] === file.path ? '#e3f2fd' : 'transparent',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = taskConfig[browserForField.field] === file.path ? '#e3f2fd' : '#f5f5f7'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = taskConfig[browserForField.field] === file.path ? '#e3f2fd' : 'transparent'}
                  >
                    <span style={{ fontSize: '20px' }}>
                      {file.isDirectory ? '📁' : browserForField.fileType === 'video' ? '🎬' : browserForField.fileType === 'audio' ? '🎵' : '📄'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="body-strong">{file.name}</div>
                      {file.type && (
                        <div className="caption" style={{ color: '#999' }}>{file.type}</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {/* 底部按钮 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '8px' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowFileBrowser(false)}
              >
                取消
              </button>
              {browserForField?.fileType === 'directory' && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleBrowserSelect({ path: browserPath, name: browserPath.split('/').pop(), isDirectory: true })}
                >
                  确定选择此目录
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// =====================================================
// 批量配置验证器主组件
// =====================================================
function BatchConfigValidator({ config, onChange, vfs, className, apiBaseUrl, apiKey }) {
  const [validationResult, setValidationResult] = useState(null)
  const [validating, setValidating] = useState(false)
  const [activeTab, setActiveTab] = useState('editor') // 'editor' | 'validation' | 'preview'
  const [submitting, setSubmitting] = useState(false)
  const [submitResults, setSubmitResults] = useState(null)
  
  // 验证配置 - 使用前端验证
  const validate = useCallback(async () => {
    setValidating(true)
    try {
      const result = await performBasicValidation(config, vfs)
      setValidationResult(result)
      setActiveTab('validation')
    } catch (e) {
      console.error('验证失败:', e)
      setValidationResult({
        is_valid: false,
        total_tasks: 0,
        valid_tasks: 0,
        invalid_tasks: 0,
        task_results: [],
        summary: {
          total_errors: 1,
          total_warnings: 0,
          recommendations: [`验证过程出错：${e.message}`],
        },
      })
      setActiveTab('validation')
    } finally {
      setValidating(false)
    }
  }, [config, vfs])
  
  // 添加任务
  const addTask = (presetConfig = {}) => {
    const newTask = {
      name: `task_${(config.tasks?.length || 0) + 1}`,
      video_file: '',
      script_file: '',
      corrections_file: '',
      bgm_file: '',
      scenes_dir: '',
      ...presetConfig,
    }
    onChange?.({
      ...config,
      tasks: [...(config.tasks || []), newTask],
    })
  }
  
  // 更新任务
  const updateTask = (index, updatedTask) => {
    const newTasks = [...config.tasks]
    newTasks[index] = updatedTask
    onChange?.({ ...config, tasks: newTasks })
  }
  
  // 删除任务
  const deleteTask = (index) => {
    const newTasks = config.tasks.filter((_, i) => i !== index)
    onChange?.({ ...config, tasks: newTasks })
  }
  
  // 一键修复
  const fixIssue = async (taskName, issue) => {
    try {
      const fieldPath = issue.field
      const segmentMatch = fieldPath.match(/script_file\.segments\[(\d+)\]/)
      
      if (segmentMatch && issue.message.includes('缺少必需字段：text')) {
        const segmentIndex = parseInt(segmentMatch[1])
        
        let taskIndex = -1
        taskIndex = config.tasks?.findIndex(t => t.name === taskName)
        
        if (taskIndex === -1) {
          const indexMatch = taskName.match(/task_(\d+)/)
          if (indexMatch) {
            const idx = parseInt(indexMatch[1])
            if (idx >= 0 && idx < config.tasks.length) {
              taskIndex = idx
            }
          }
        }
        
        if (taskIndex === -1 && config.tasks && config.tasks.length > 0) {
          taskIndex = config.tasks.findIndex(t => t.script_file)
        }
        
        if (taskIndex === -1 || !config.tasks[taskIndex]?.script_file) {
          alert('找不到对应的任务或脚本文件')
          return
        }
        
        const task = config.tasks[taskIndex]
        
        if (!vfs) {
          alert('文件系统未初始化')
          return
        }
        
        try {
          let scriptContent = await vfs.readFile(task.script_file)
          
          if (scriptContent instanceof ArrayBuffer) {
            scriptContent = new TextDecoder('utf-8').decode(scriptContent)
          } else if (scriptContent instanceof Blob) {
            scriptContent = await scriptContent.text()
          } else if (typeof scriptContent !== 'string') {
            scriptContent = String(scriptContent)
          }
          
          const script = JSON.parse(scriptContent)
          
          if (script.segments && script.segments[segmentIndex]) {
            script.segments[segmentIndex].text = script.segments[segmentIndex].text || ''
            
            await vfs.writeJSON(task.script_file, script)
            
            const newTasks = [...config.tasks]
            newTasks[taskIndex] = { ...task }
            onChange?.({ ...config, tasks: newTasks })
            
            alert(`✅ 已修复第 ${segmentIndex + 1} 个 segment 的 text 字段`)
            
            setTimeout(() => validate(), 500)
          } else {
            alert(`无法找到对应的 segment`)
          }
        } catch (e) {
          console.error('修复失败:', e)
          alert(`修复失败：${e.message}`)
        }
      } else {
        alert('暂不支持自动修复此类问题')
      }
    } catch (e) {
      console.error('修复过程出错:', e)
      alert(`修复出错：${e.message}`)
    }
  }
  
  // 上传文件到 OSS
  const uploadFile = async (fileBlob, filename, purpose = 'input') => {
    // 1. 获取预签名 URL
    const presignRes = await fetch(`${apiBaseUrl}/v1/uploads/presign`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: filename,
        content_type: fileBlob.type || 'application/octet-stream',
        purpose: purpose,
      }),
    })
    
    if (!presignRes.ok) {
      throw new Error('获取上传 URL 失败')
    }
    
    const presignData = await presignRes.json()
    const { upload_url, oss_key, upload_id } = presignData.data
    
    // 2. 上传文件到 OSS
    const uploadRes = await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': fileBlob.type || 'application/octet-stream' },
      body: fileBlob,
    })
    
    if (!uploadRes.ok) {
      throw new Error('文件上传失败')
    }
    
    // 3. 确认上传
    const confirmRes = await fetch(`${apiBaseUrl}/v1/uploads/confirm`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ upload_id }),
    })
    
    if (!confirmRes.ok) {
      throw new Error('确认上传失败')
    }
    
    const confirmData = await confirmRes.json()
    return confirmData.data.oss_key
  }
  
  // ✅ 核心修复：正确地将虚拟文件系统文件读取为 Blob
  const readVfsFileAsBlob = async (filePath) => {
    if (!vfs) {
      throw new Error('文件系统未初始化')
    }
    
    // 获取文件信息 (使用 getFile 而不是未定义的 stat)
    const fileInfo = vfs.getFile(filePath)
    if (!fileInfo) {
      throw new Error(`文件不存在：${filePath}`)
    }
    
    // 等待并正确获取 Blob 内容
    const blob = await vfs.readFileAsBlob(filePath)
    const fileName = fileInfo.name || filePath.split('/').pop()
    
    return { blob, filename: fileName }
  }
  
  // 提交单个任务
  const submitTask = async (task, merchantId) => {
    const traceId = 'trace_' + Math.random().toString(36).substring(2, 18)
    
    // 0. 上传场景素材并建立映射
    let sceneMapping = {}
    if (task.scenes_dir && vfs) {
      try {
        const items = vfs.listDirectory(task.scenes_dir)
        for (const item of items) {
          if (!item.isDirectory) {
            // ✅ 使用修复后的 readVfsFileAsBlob
            const { blob, filename } = await readVfsFileAsBlob(item.path)
            const sceneOssKey = await uploadFile(blob, filename, 'scenes')
            const finalName = sceneOssKey.split('/').pop()
            // ✅ 关键修复 1：将键值统一转为小写，防止 .MP4 和 .mp4 匹配失败
            sceneMapping[filename.toLowerCase()] = finalName
            console.log(`上传场景素材：${filename} -> ${finalName}`)
          }
        }
      } catch (e) {
        console.warn(`未能读取/上传场景素材目录 ${task.scenes_dir}:`, e)
      }
    }

    // 1. 上传视频文件
    let videoOssKey = null
    if (task.video_file) {
      const { blob, filename } = await readVfsFileAsBlob(task.video_file)
      videoOssKey = await uploadFile(blob, filename, 'input')
    }
    
    // 2. 上传脚本文件（如果有）
    let scriptOssKey = null
    if (task.script_file) {
      let scriptContent = await vfs.readFile(task.script_file)
      
      if (scriptContent instanceof ArrayBuffer) {
        scriptContent = new TextDecoder('utf-8').decode(scriptContent)
      } else if (scriptContent instanceof Blob) {
        scriptContent = await scriptContent.text()
      } else if (typeof scriptContent !== 'string') {
        scriptContent = String(scriptContent)
      }
      
      let scriptJson = null
      try {
        scriptJson = JSON.parse(scriptContent)
      } catch (e) {
        throw new Error(`脚本文件 ${task.script_file} 不是合法的 JSON：${e.message}`)
      }
      
      // ★ 替换脚本中的 scene_file 引用为上传成功的文件名 ★
      // ✅ 关键修复 2：无论场景目录是否成功读取，都要遍历清理脚本中的素材
      if (scriptJson.segments) {
        scriptJson.segments.forEach((seg, idx) => {
          if (seg.flag === 'scene' && seg.scene_file) {
            // 获取原始文件名并转为小写
            const basename = seg.scene_file.split('/').pop().toLowerCase()
            
            if (sceneMapping[basename]) {
              // 如果匹配成功，替换为真实的 OSS 路径
              seg.scene_file = `scenes/${sceneMapping[basename]}`
            } else {
              // 如果匹配失败（没上传成功或找不到），强制降级为 human 出镜，防止后端报错
              console.warn(`⚠️ 场景素材 ${seg.scene_file} 未能匹配，将降级为 human 出镜`)
              seg.flag = 'human'
              seg.scene_file = null
            }
          }
        })
      }
      
      const newScriptBlob = new Blob([JSON.stringify(scriptJson, null, 2)], { type: 'application/json' })
      const scriptFilename = task.script_file.split('/').pop()
      scriptOssKey = await uploadFile(newScriptBlob, scriptFilename, 'input')
    }
    
    // 3. 上传背景音乐（如果有）
    let bgmOssKey = null
    if (task.bgm_file) {
      const { blob, filename } = await readVfsFileAsBlob(task.bgm_file)
      bgmOssKey = await uploadFile(blob, filename, 'bgm')
    }
    
    // 4. 上传纠错字典（如果有）
    let correctionsOssKey = null
    if (task.corrections_file) {
      const { blob, filename } = await readVfsFileAsBlob(task.corrections_file)
      correctionsOssKey = await uploadFile(blob, filename, 'corrections')
    }
    
    // 5. 构建草稿任务请求
    const draftRequest = {
      input: {
        video_url: videoOssKey,
        scene_base_url: merchantId,
        script_url: scriptOssKey,
        corrections_url: correctionsOssKey,
      },
      pipeline: task.custom_config?.pipeline || {
        remove_keyword: '转场',
        margin: 0.15,
        min_segment_duration: 0.1,
      },
      asr: task.custom_config?.asr || {
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
    
    // 6. 提交草稿任务
    const draftRes = await fetch(`${apiBaseUrl}/v1/tasks/agent-draft`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(draftRequest),
    })
    
    if (!draftRes.ok) {
      const errorData = await draftRes.json()
      throw new Error(errorData.message || '提交草稿任务失败')
    }
    
    const draftData = await draftRes.json()
    const draftTaskId = draftData.data.task_id
    
    // 7. 如果需要自动合成
    const shouldCompose = bgmOssKey || task.custom_config?.compose_pipeline
    if (shouldCompose) {
      const composeRequest = {
        draft_task_id: draftTaskId,
        pipeline: task.custom_config?.compose_pipeline || {
          use_transitions: false,
          transition_type: 'fade',
          transition_duration: 0.8,
          resync_subtitle: true,
        },
        asr: task.custom_config?.asr || {
          model: 'large-v3',
          device: 'cuda',
          language: 'zh',
        },
        subtitle: task.custom_config?.subtitle || {
          effect: 'ad',
          font_size: 88,
        },
        audio: {
          bgm_url: bgmOssKey,
          bgm_volume: task.custom_config?.audio?.bgm_volume || 0.3,
          original_volume: task.custom_config?.audio?.original_volume || 1.0,
          bgm_start_time: task.custom_config?.audio?.bgm_start_time || 0.0,
          bgm_loop: task.custom_config?.audio?.bgm_loop ?? true,
          fade_in_duration: task.custom_config?.audio?.fade_in_duration || 0.5,
          fade_out_duration: task.custom_config?.audio?.fade_out_duration || 0.5,
        },
        output: {
          need_ass: true,
        },
        timeout_seconds: 1800,
      }
      
      const composeRes = await fetch(`${apiBaseUrl}/v1/tasks/compose-from-draft`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(composeRequest),
      })
      
      if (!composeRes.ok) {
        const errorData = await composeRes.json()
        console.warn(`任务 ${task.name} 合成任务提交失败:`, errorData.message)
      }
    }
    
    return {
      taskName: task.name,
      draftTaskId,
      status: 'submitted',
    }
  }
  
  // 批量提交任务
  const submitBatchTasks = async () => {
    if (!validationResult || !validationResult.is_valid) {
      alert('请先验证配置，确保所有任务都通过验证')
      return
    }
    
    if (!config.tasks || config.tasks.length === 0) {
      alert('没有可提交的任务')
      return
    }
    
    setSubmitting(true)
    setSubmitResults(null)
    
    try {
      const merchantRes = await fetch(`${apiBaseUrl}/v1/merchant/info`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })
      
      if (!merchantRes.ok) {
        throw new Error('获取商户信息失败')
      }
      
      const merchantData = await merchantRes.json()
      const merchantId = merchantData.data.merchant_id
      
      const results = []
      for (let i = 0; i < config.tasks.length; i++) {
        const task = config.tasks[i]
        try {
          const result = await submitTask(task, merchantId)
          results.push({
            ...result,
            success: true,
          })
        } catch (err) {
          results.push({
            taskName: task.name,
            success: false,
            error: err.message,
          })
        }
      }
      
      setSubmitResults({
        total: results.length,
        successCount: results.filter(r => r.success).length,
        failCount: results.filter(r => !r.success).length,
        results,
      })
      
    } catch (err) {
      console.error('批量提交失败:', err)
      alert(`批量提交失败：${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }
  
  return (
    <div className={`batch-config-validator ${className || ''}`}>
      {/* 工具栏 */}
      <div className="validator-toolbar" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            ✏️ 编辑配置
          </button>
          <button
            className={`tab ${activeTab === 'validation' ? 'active' : ''}`}
            onClick={() => setActiveTab('validation')}
          >
            🔍 验证结果
          </button>
          <button
            className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            👁️ 预览
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-ghost"
            onClick={validate}
            disabled={validating}
          >
            {validating ? '验证中...' : '🔍 验证配置'}
          </button>
          <button
            className="btn btn-primary"
            onClick={submitBatchTasks}
            disabled={submitting || !validationResult?.is_valid}
            title={!validationResult?.is_valid ? '请先验证配置' : '提交所有任务到服务器'}
          >
            {submitting ? '🚀 提交中...' : '🚀 提交任务'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => addTask()}
          >
            + 添加空白任务
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => addTask({ name: `task_${(config.tasks?.length || 0) + 1}` })}
            title="从项目填充"
          >
            📁 从项目添加
          </button>
        </div>
      </div>
      
      {/* 编辑模式 */}
      {activeTab === 'editor' && (
        <div className="editor-mode">
          <div style={{ marginBottom: '16px' }}>
            <JSONEditor
              value={config}
              onChange={onChange}
            />
          </div>
          
          {/* 快速填充区域 */}
          {vfs && (
            <ProjectFileQuickFill
              vfs={vfs}
              onFill={(taskConfig) => addTask(taskConfig)}
            />
          )}
          
          <h3 className="display-md mb-md">任务列表</h3>
          {(config.tasks || []).map((task, index) => (
            <TaskConfigEditor
              key={index}
              task={task}
              index={index}
              onChange={updateTask}
              onDelete={deleteTask}
              vfs={vfs}
            />
          ))}
          
          {(!config.tasks || config.tasks.length === 0) && (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <span className="empty-icon" style={{ fontSize: '48px' }}>📋</span>
              <p className="empty-text">暂无任务</p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
                <button className="btn btn-primary" onClick={() => addTask()}>
                  添加空白任务
                </button>
                {vfs && (
                  <button className="btn btn-ghost" onClick={() => addTask({ name: `task_1` })}>
                    📁 从项目添加
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 验证模式 */}
      {activeTab === 'validation' && (
        <div className="validation-mode">
          {!validationResult ? (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <span className="empty-icon" style={{ fontSize: '48px' }}>🔍</span>
              <p className="empty-text">点击"验证配置"开始检查</p>
              <button className="btn btn-primary" onClick={validate}>
                开始验证
              </button>
            </div>
          ) : (
            <>
              {/* 验证汇总 */}
              <div className="validation-summary" style={{
                padding: '16px',
                backgroundColor: validationResult.is_valid ? '#d4edda' : '#f8d7da',
                borderRadius: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="tagline mb-xs" style={{ margin: 0 }}>
                      {validationResult.is_valid ? '✅ 验证通过' : '❌ 验证失败'}
                    </h3>
                    <p className="body" style={{ margin: '8px 0 0' }}>
                      共 {validationResult.total_tasks} 个任务 · 
                      {validationResult.valid_tasks} 个有效 · 
                      {validationResult.invalid_tasks} 个无效
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-primary" onClick={validate}>
                      重新验证
                    </button>
                    <button 
                      className="btn btn-primary" 
                      onClick={submitBatchTasks}
                      disabled={submitting || !validationResult.is_valid}
                    >
                      {submitting ? '🚀 提交中...' : '🚀 提交所有任务'}
                    </button>
                  </div>
                </div>
                
                {validationResult.summary?.recommendations?.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <h4 className="caption-strong mb-sm">建议</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {validationResult.summary.recommendations.map((rec, idx) => (
                        <li key={idx} className="body" style={{ fontSize: '14px', marginBottom: '4px' }}>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              {/* 提交结果 */}
              {submitResults && (
                <div className="submit-results" style={{
                  padding: '16px',
                  backgroundColor: submitResults.failCount === 0 ? '#d4edda' : '#fff3cd',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}>
                  <h4 className="tagline mb-sm" style={{ margin: 0 }}>
                    {submitResults.failCount === 0 ? '✅ 提交成功' : '⚠️ 部分提交成功'}
                  </h4>
                  <p className="body" style={{ margin: '8px 0 0' }}>
                    共 {submitResults.total} 个任务 · 
                    成功 {submitResults.successCount} 个 · 
                    失败 {submitResults.failCount} 个
                  </p>
                  
                  <div style={{ marginTop: '12px', maxHeight: '300px', overflow: 'auto' }}>
                    {submitResults.results.map((result, idx) => (
                      <div 
                        key={idx}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: result.success ? '#fff' : '#ffe5e5',
                          borderRadius: '4px',
                          marginBottom: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <span className="body-strong">
                            {result.success ? '✅' : '❌'} {result.taskName}
                          </span>
                          {result.success && result.draftTaskId && (
                            <div className="caption" style={{ color: '#666', marginTop: '4px' }}>
                              任务 ID: {result.draftTaskId}
                            </div>
                          )}
                          {!result.success && result.error && (
                            <div className="caption" style={{ color: '#dc3545', marginTop: '4px' }}>
                              错误：{result.error}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 任务验证结果 */}
              <h3 className="display-md mb-md">任务详情</h3>
              {validationResult.task_results.map((result, idx) => (
                <TaskValidationCard
                  key={idx}
                  result={result}
                  onFix={fixIssue}
                />
              ))}
            </>
          )}
        </div>
      )}
      
      {/* 预览模式 */}
      {activeTab === 'preview' && (
        <div className="preview-mode">
          <pre className="file-preview" style={{
            backgroundColor: '#fafbfc',
            padding: '16px',
            borderRadius: '8px',
            overflow: 'auto',
            maxHeight: '600px',
          }}>
            <code>{JSON.stringify(config, null, 2)}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 基础验证函数 (前端版本 - 降级方案)
// =====================================================
async function performBasicValidation(config, vfs = null) {
  const tasks = config.tasks || []
  const taskResults = []
  
  for (const task of tasks) {
    const index = tasks.indexOf(task)
    const issues = []
    const requiredFiles = {}
    const optionalFiles = {}
    
    // 验证必需字段
    if (!task.name) {
      issues.push({
        level: 'error',
        field: 'name',
        message: '任务名称不能为空',
        suggestion: '请为任务设置一个名称',
      })
    }
    
    // 验证视频文件
    if (!task.video_file) {
      issues.push({
        level: 'error',
        field: 'video_file',
        message: '缺少必需文件：主视频文件',
        suggestion: '请提供 video_file 字段',
      })
      requiredFiles.video_file = false
    } else {
      if (vfs) {
        try {
          const exists = vfs.exists(task.video_file)
          if (!exists) {
            issues.push({
              level: 'error',
              field: 'video_file',
              message: `视频文件不存在：${task.video_file}`,
              suggestion: '请检查文件路径是否正确',
            })
          }
        } catch (e) {}
      }
      requiredFiles.video_file = true
    }
    
    // 验证脚本文件 (条件性必需)
    const isSceneOnlyMode = task.custom_config?.pipeline?.mode === 'scene_only'
    if (!isSceneOnlyMode) {
      if (!task.script_file) {
        issues.push({
          level: 'error',
          field: 'script_file',
          message: '缺少必需文件：脚本文件',
          suggestion: '请提供 script_file 字段，或设置 pipeline.mode="scene_only"',
        })
        requiredFiles.script_file = false
      } else {
        if (vfs) {
          try {
            const exists = vfs.exists(task.script_file)
            if (!exists) {
              issues.push({
                level: 'error',
                field: 'script_file',
                message: `脚本文件不存在：${task.script_file}`,
                suggestion: '请检查文件路径是否正确',
              })
            } else {
              try {
                const scriptContent = await vfs.readFile(task.script_file)
                if (scriptContent) {
                  let contentStr = scriptContent
                  if (scriptContent instanceof ArrayBuffer) {
                    contentStr = new TextDecoder('utf-8').decode(scriptContent)
                  } else if (scriptContent instanceof Blob) {
                    contentStr = await scriptContent.text()
                  } else if (typeof scriptContent !== 'string') {
                    contentStr = String(scriptContent)
                  }
                  
                  const script = JSON.parse(contentStr)
                  validateScriptContent(script, issues, task.name)
                }
              } catch (e) {
                issues.push({
                  level: 'error',
                  field: 'script_file',
                  message: `脚本 JSON 格式错误：${e.message}`,
                  suggestion: '请使用有效的 JSON 格式',
                })
              }
            }
          } catch (e) {}
        }
        requiredFiles.script_file = true
      }
    } else {
      requiredFiles.script_file = true
    }
    
    optionalFiles.bgm_file = !!task.bgm_file
    optionalFiles.corrections_file = !!task.corrections_file
    optionalFiles.scenes_dir = !!task.scenes_dir
    
    if (!task.bgm_file) {
      issues.push({
        level: 'warning',
        field: 'bgm_file',
        message: '缺少背景音乐',
        suggestion: '建议添加背景音乐以提升视频质量',
      })
    }
    
    if (!task.corrections_file) {
      issues.push({
        level: 'warning',
        field: 'corrections_file',
        message: '缺少纠错字典',
        suggestion: '建议添加纠错字典以提高字幕准确性',
      })
    }
    
    taskResults.push({
      task_name: task.name || `task_${index}`,
      is_valid: issues.filter(i => i.level === 'error').length === 0,
      issues,
      required_files: requiredFiles,
      optional_files: optionalFiles,
    })
  }
  
  const validCount = taskResults.filter(r => r.is_valid).length
  const invalidCount = taskResults.length - validCount
  
  return {
    is_valid: invalidCount === 0,
    total_tasks: taskResults.length,
    valid_tasks: validCount,
    invalid_tasks: invalidCount,
    task_results: taskResults,
    summary: {
      total_errors: taskResults.reduce((sum, r) => sum + r.issues.filter(i => i.level === 'error').length, 0),
      total_warnings: taskResults.reduce((sum, r) => sum + r.issues.filter(i => i.level === 'warning').length, 0),
      recommendations: [
        !tasks.every(t => t.bgm_file) && '部分任务缺少背景音乐，建议添加',
        !tasks.every(t => t.corrections_file) && '部分任务缺少纠错字典，建议添加',
      ].filter(Boolean),
    },
  }
}

// =====================================================
// 脚本内容验证 (前端版本)
// =====================================================
function validateScriptContent(script, issues, taskName) {
  if (!script.segments) {
    issues.push({
      level: 'error',
      field: 'script_file',
      message: '脚本缺少必需字段：segments',
      suggestion: '请在脚本中添加 segments 数组字段',
    })
    return
  }
  
  if (!Array.isArray(script.segments)) {
    issues.push({
      level: 'error',
      field: 'script_file',
      message: 'segments 必须是数组格式',
      suggestion: '请将 segments 字段修改为数组',
    })
    return
  }
  
  const validFlags = ['human', 'scene', 'transition']
  
  script.segments.forEach((seg, idx) => {
    if (!seg.flag) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 缺少必需字段：flag`,
        suggestion: '请添加 flag 字段 (human/scene/transition)',
      })
    }
    
    if (!seg.text) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 缺少必需字段：text`,
        suggestion: '请添加 text 字段',
      })
    }
    
    if (seg.flag && !validFlags.includes(seg.flag)) {
      issues.push({
        level: 'warning',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 的 flag 值不常见：${seg.flag}`,
        suggestion: `建议使用以下值之一：${validFlags.join(', ')}`,
      })
    }
    
    if (seg.flag === 'scene' && !seg.scene_file) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 是 scene 类型但缺少 scene_file`,
        suggestion: '请提供 scene_file 字段指向场景素材',
      })
    }
  })
}

export default BatchConfigValidator