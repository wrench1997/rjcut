import { useState, useEffect, useCallback } from 'react'
import {
  getCommonPersons,
  getCustomPersons,
  getVoices,
  createDhGenerateTask
} from '../api/api'

// =====================================================
// 状态徽章组件
// =====================================================
function StatusBadge({ status }) {
  const statusMap = {
    queued: { label: '等待中', class: 'status-queued' },
    processing: { label: '处理中', class: 'status-processing' },
    succeeded: { label: '成功', class: 'status-succeeded' },
    failed: { label: '失败', class: 'status-failed' },
    cancelled: { label: '已取消', class: 'status-cancelled' },
  }

  const { label, class: className } = statusMap[status] || {
    label: '未知',
    class: 'status-queued'
  }

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
// 左侧边栏导航图标
// =====================================================
const NAV_ITEMS = [
  { id: 'template', icon: '🎨', label: '模板' },
  { id: 'avatar', icon: '👤', label: '数字人' },
  { id: 'music', icon: '🎵', label: '音乐' },
  { id: 'bg', icon: '🖼️', label: '背景' },
  { id: 'text', icon: '📝', label: '文本' },
  { id: 'element', icon: '✨', label: '元素' },
  { id: 'material', icon: '📁', label: '素材' },
]

// =====================================================
// 左侧极简导航栏
// =====================================================
function LeftSidebar({ activeNav, onNavChange }) {
  return (
    <div className="panel-sidebar">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onNavChange(item.id)}
          className={`nav-btn ${activeNav === item.id ? 'active' : ''}`}
          title={item.label}
        >
          <span style={{ fontSize: '20px' }}>{item.icon}</span>
          <span
            className="caption"
            style={{
              fontSize: '10px',
              color: activeNav === item.id ? 'var(--primary)' : 'var(--ink-muted-48)'
            }}
          >
            {item.label}
          </span>
        </button>
      ))}
    </div>
  )
}

// =====================================================
// 左侧资源面板 - 数字人选择
// =====================================================
function AvatarPicker({
  persons = [],
  selectedPerson,
  onSelect,
  filterType,
  onFilterChange
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [groupByPerson, setGroupByPerson] = useState(false)

  const filterTabs = [
    { id: 'recommended', label: '推荐' },
    { id: 'hot', label: '最热' },
    { id: 'new', label: '最新' },
    { id: 'favorite', label: '收藏' },
  ]

  const filteredPersons = persons.filter(p => {
    const name = (p?.name || '').toLowerCase()
    return name.includes(searchQuery.toLowerCase())
  })

  return (
    <div className="avatar-picker">
      {/* 顶部 Tabs */}
      <div style={{ padding: 'var(--spacing-md)', borderBottom: '1px solid var(--hairline)' }}>
        <div className="flex gap-sm mb-md">
          {['公共', '我的', '团队'].map((tab, idx) => (
            <button
              key={tab}
              className={`btn btn-sm ${idx === 0 ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <input
          type="text"
          className="input"
          placeholder="搜索数字人..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {/* 快捷筛选项 */}
      <div className="filter-tabs">
        {filterTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onFilterChange(tab.id)}
            className={`filter-tab ${filterType === tab.id ? 'active' : 'inactive'}`}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 过滤工具栏 */}
      <div
        style={{
          padding: 'var(--spacing-sm)',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <label className="flex items-center gap-xs caption">
          <input
            type="checkbox"
            checked={groupByPerson}
            onChange={(e) => setGroupByPerson(e.target.checked)}
          />
          按人聚合
        </label>
        <button className="btn btn-ghost btn-sm" title="筛选" type="button">
          🔍
        </button>
      </div>

      {/* 资产网格 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--spacing-md)',
        }}
      >
        <div className="asset-grid">
          {filteredPersons.map(person => (
            <div
              key={person.id}
              onClick={() => onSelect(person)}
              className={`asset-card ${selectedPerson?.id === person.id ? 'selected' : ''}`}
            >
              {person.cover_url ? (
                <img
                  src={person.cover_url}
                  alt={person.name}
                  className="asset-card-image"
                />
              ) : (
                <div className="asset-card-placeholder">👤</div>
              )}
              <div className="asset-card-label">
                {person.name}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 中间预览区
// =====================================================
function MainCanvas({ selectedPerson, aspectRatio, onAspectRatioChange }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration] = useState(600) // 10 分钟示例

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getFrameClass = () => {
    switch (aspectRatio) {
      case '9:16': return 'canvas-frame-9-16'
      case '16:9': return 'canvas-frame-16-9'
      case '1:1': return 'canvas-frame-1-1'
      case '4:5': return 'canvas-frame-4-5'
      default: return 'canvas-frame-9-16'
    }
  }

  return (
    <div className="main-canvas">
      {/* 顶部工具条 */}
      <div className="canvas-toolbar">
        <div className="flex items-center gap-sm">
          <select
            className="input"
            value={aspectRatio}
            onChange={(e) => onAspectRatioChange(e.target.value)}
            style={{ width: '100px' }}
          >
            <option value="9:16">9:16 竖屏</option>
            <option value="16:9">16:9 横屏</option>
            <option value="1:1">1:1 正方</option>
            <option value="4:5">4:5 短视频</option>
          </select>
        </div>

        <div className="flex items-center gap-sm">
          <button className="btn btn-ghost btn-sm" title="撤销" type="button">↩️</button>
          <button className="btn btn-ghost btn-sm" title="重做" type="button">↪️</button>
          <button className="btn btn-ghost btn-sm" title="辅助线" type="button">📐</button>
        </div>
      </div>

      {/* 核心画布 */}
      <div className="canvas-preview">
        <div className={`canvas-frame ${getFrameClass()}`}>
          {selectedPerson ? (
            <>
              {selectedPerson.cover_url && (
                <img
                  src={selectedPerson.cover_url}
                  alt={selectedPerson.name}
                  className="asset-card-image"
                />
              )}
              <div
                style={{
                  position: 'absolute',
                  bottom: '20%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  color: '#fff',
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  borderRadius: 'var(--rounded-sm)',
                  fontSize: '14px',
                  textAlign: 'center',
                  maxWidth: '80%',
                }}
              >
                在右侧区域编辑文本字幕
              </div>
            </>
          ) : (
            <div className="canvas-empty-state">
              <span className="canvas-empty-icon">🎬</span>
              <p className="body">请从左侧选择数字人</p>
            </div>
          )}
        </div>
      </div>

      {/* 底部播放控制 */}
      <div className="playback-controls">
        <button
          className="btn btn-primary btn-sm playback-btn"
          onClick={() => setIsPlaying(!isPlaying)}
          type="button"
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <span className="caption" style={{ minWidth: '80px', textAlign: 'center' }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          min="0"
          max={duration}
          value={currentTime}
          onChange={(e) => setCurrentTime(Number(e.target.value))}
          style={{ flex: 1, maxWidth: '400px' }}
        />
      </div>
    </div>
  )
}

// =====================================================
// =====================================================
// 右侧文案与批量生成面板 (已重构布局)
// =====================================================
function RightPanel({ selectedPerson, voices = [], onBatchGenerate }) {
  const [mode, setMode] = useState('batch') // 'single' | 'batch'
  const [language, setLanguage] = useState('zh-CN')
  const [scripts, setScripts] = useState([{ id: Date.now(), text: '', charCount: 0 }])
  const [voiceId, setVoiceId] = useState('')
  const [subtitleEnabled, setSubtitleEnabled] = useState(true)
  const [draggedIndex, setDraggedIndex] = useState(null)

  const handleAddScript = () => {
    setScripts(prev => [...prev, { id: Date.now(), text: '', charCount: 0 }])
  }

  const handleImportText = () => {
    const text = prompt('请输入多行文本（每行将自动生成一个文案）：')
    if (!text) return
    const lines = text.split('\n').filter(line => line.trim())
    const newScripts = lines.map((line, idx) => ({
      id: Date.now() + idx,
      text: line.trim(),
      charCount: line.trim().length,
    }))
    setScripts(prev => [...prev, ...newScripts])
  }

  const handleScriptChange = (id, newText) => {
    setScripts(prev =>
      prev.map(s =>
        s.id === id ? { ...s, text: newText, charCount: newText.length } : s
      )
    )
  }

  const handleDeleteScript = (id) => {
    if (scripts.length === 1) {
      alert('至少保留一个文案')
      return
    }
    setScripts(prev => prev.filter(s => s.id !== id))
  }

  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    setScripts(prev => {
      const newScripts = [...prev]
      const draggedItem = newScripts[draggedIndex]
      if (!draggedItem) return prev

      newScripts.splice(draggedIndex, 1)
      newScripts.splice(index, 0, draggedItem)
      return newScripts
    })
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleBatchGenerate = () => {
    const validScripts = scripts.filter(s => s.text.trim())
    if (validScripts.length === 0) {
      alert('请至少输入一个有效文案')
      return
    }
    if (!selectedPerson) {
      alert('请先选择数字人')
      return
    }
    onBatchGenerate(validScripts, voiceId, subtitleEnabled)
  }

  return (
    <div className="right-panel modern-right-panel">
      {/* 1. 顶部工具栏 */}
      <div className="right-panel-header">
        <select
          className="select-minimal text-primary"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="zh-CN">中文</option>
          <option value="zh-TW">繁体</option>
          <option value="en-US">English</option>
          <option value="ja-JP">日本語</option>
        </select>

        <div className="flex gap-xs">
          <button className="btn btn-ghost btn-sm" type="button">翻译</button>
          <button className="btn btn-ghost btn-sm" type="button">更多 ⌄</button>
        </div>
      </div>

      {/* 2. 模式切换 */}
      <div className="right-panel-tabs">
        <div className="mode-switcher w-full">
          <button
            onClick={() => setMode('single')}
            className={`mode-switcher-btn ${mode === 'single' ? 'active' : ''}`}
            type="button"
          >
            单条
          </button>
          <button
            onClick={() => setMode('batch')}
            className={`mode-switcher-btn ${mode === 'batch' ? 'active' : ''}`}
            type="button"
          >
            批量
          </button>
        </div>
      </div>

      {/* 3. 文本编辑器区域 (修复了边框变形问题) */}
      <div className="right-panel-editor flex-1">
        {mode === 'single' ? (
          <div className="single-editor-wrapper">
            <textarea
              className="custom-textarea"
              value={scripts[0]?.text || ''}
              onChange={(e) => handleScriptChange(scripts[0].id, e.target.value)}
              placeholder="请输入要在视频中播报的文案内容..."
            />
            <div className="editor-footer">
              <span className="caption text-muted">{scripts[0]?.charCount || 0}/4000</span>
            </div>
          </div>
        ) : (
          <div className="batch-editor-wrapper">
            <div className="flex gap-sm mb-md">
              <button className="btn btn-pearl-capsule btn-sm flex-1" onClick={handleAddScript} type="button">
                + 新增卡片
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleImportText} type="button">
                📥 导入文本
              </button>
            </div>
            
            <div className="scripts-list">
              {scripts.map((script, index) => (
                <div
                  key={script.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`script-card ${draggedIndex === index ? 'dragging' : ''}`}
                >
                  <div className="flex justify-between items-center mb-xs">
                    <span className="caption-strong text-primary">段落 {index + 1}</span>
                    <button
                      className="btn btn-ghost btn-sm text-danger"
                      onClick={() => handleDeleteScript(script.id)}
                      type="button"
                      style={{ padding: '2px 6px' }}
                    >✕</button>
                  </div>
                  <textarea
                    className="custom-textarea small"
                    value={script.text}
                    onChange={(e) => handleScriptChange(script.id, e.target.value)}
                    placeholder={`请输入第 ${index + 1} 条文案...`}
                  />
                  <div className="flex justify-between items-center mt-xs">
                    <span className="caption text-muted">{script.charCount}/4000</span>
                    {draggedIndex !== index && <span className="caption text-muted" style={{cursor: 'grab'}}>⋮⋮ 排序</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. 语音与字幕 (卡片化设计，更美观) */}
      <div className="right-panel-config">
        <div className="config-card">
          <div className="flex items-center gap-xs mb-md">
            <span style={{ fontSize: '16px' }}>⚙️</span>
            <h4 className="body-strong">语音与字幕</h4>
          </div>

          <div className="config-group">
            <label className="caption text-muted block mb-xs">人声选择</label>
            <select
              className="input custom-select w-full"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
            >
              <option value="">使用数字人原生声音</option>
              {voices.map(voice => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.gender === 'female' ? '女' : '男'})
                </option>
              ))}
            </select>
          </div>

          <div className="config-group flex justify-between items-center mt-md">
            <label className="caption text-muted">开启视频字幕</label>
            <button
              onClick={() => setSubtitleEnabled(!subtitleEnabled)}
              className={`toggle-switch ${subtitleEnabled ? 'active' : ''}`}
              type="button"
            >
              <div className="toggle-switch-knob" />
            </button>
          </div>

          {subtitleEnabled && (
            <div className="subtitle-styles flex gap-xs mt-sm">
              {['样式 A', '样式 B', '样式 C'].map((style, idx) => (
                <button
                  key={style}
                  className={`btn btn-sm ${idx === 0 ? 'btn-primary' : 'btn-pearl-capsule'}`}
                  style={{ flex: 1 }}
                  type="button"
                >
                  {style}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. 底部操作区 */}
      <div className="right-panel-footer">
        <button
          className="btn btn-primary w-full"
          onClick={handleBatchGenerate}
          disabled={!selectedPerson}
          type="button"
        >
          🚀 {mode === 'batch' ? `批量生成 (${scripts.filter(s => s.text.trim()).length} 条)` : '生成视频'}
        </button>
        <button className="btn btn-utility w-full" type="button">
          📝 预览字幕效果
        </button>
      </div>
    </div>
  )
}

// =====================================================
// 底部时间轴
// =====================================================
function Timeline({
  currentTime = 0,
  duration = 600,
  onTimeChange = () => {}
}) {
  const [zoom, setZoom] = useState(1)
  const [height, setHeight] = useState(220)
  const [isResizing, setIsResizing] = useState(false)

  const handleResizeStart = (e) => {
    e.preventDefault()
    setIsResizing(true)
    const startY = e.clientY
    const startHeight = height

    const handleMouseMove = (moveEvent) => {
      const deltaY = startY - moveEvent.clientY
      const newHeight = Math.max(120, Math.min(400, startHeight + deltaY))
      setHeight(newHeight)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <>
      <div className="timeline" style={{ height: `${height}px` }}>
        {/* 时间轴工具条 */}
        <div
          className="timeline-toolbar"
          onMouseDown={handleResizeStart}
          style={{ cursor: 'ns-resize' }}
        >
          <div className="flex items-center gap-sm">
          <button className="btn btn-ghost btn-sm timeline-toolbar-btn" type="button">
            ➕ 音乐
          </button>
          <button className="btn btn-ghost btn-sm timeline-toolbar-btn" type="button">
            ➕ 视频
          </button>
          <div className="timeline-toolbar-divider" />
          <button className="btn btn-ghost btn-sm timeline-toolbar-btn" type="button">
            ✂️ 分割
          </button>
          <button className="btn btn-ghost btn-sm timeline-toolbar-btn" type="button">
            🗑️ 删除
          </button>
        </div>

        <div className="flex items-center gap-sm">
          <span
            className="caption"
            style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}
          >
            ⏱️ {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="timeline-toolbar-divider" />
          <button
            className="btn btn-ghost btn-sm timeline-toolbar-btn"
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            type="button"
          >
            －
          </button>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.25"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: '80px', accentColor: 'var(--primary)' }}
          />
          <button
            className="btn btn-ghost btn-sm timeline-toolbar-btn"
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
            type="button"
          >
            ＋
          </button>
        </div>
      </div>

      {/* 时间刻度尺 */}
      <div className="timeline-ruler">
        <div className="timeline-playhead-line" />
        <div className="timeline-playhead-arrow" />

        <div className="timeline-ruler-marks">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="timeline-ruler-mark">
              <div className={`timeline-ruler-tick ${i % 5 === 0 ? 'major' : 'minor'}`} />
              {i % 5 === 0 && (
                <span className="timeline-ruler-label">
                  {String(i).padStart(2, '0')}"
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 轨道区域容器 */}
      <div className="timeline-tracks-container">
        {/* 轨道标签列 */}
        <div className="timeline-track-labels">
          <div className="timeline-track-label">
            <span className="timeline-track-label-text">🎬 视频</span>
          </div>
          <div className="timeline-track-label">
            <span className="timeline-track-label-text">🎵 音频</span>
          </div>
        </div>

        {/* 轨道内容区 */}
        <div className="timeline-track-content">
          <div className="timeline-track">
            <div className="timeline-clip timeline-clip-video">
              <span className="timeline-clip-label">🎬</span>
              数字人片段 01
              <div className="timeline-clip-handle timeline-clip-handle-left" />
              <div className="timeline-clip-handle timeline-clip-handle-right" />
            </div>
          </div>

          <div className="timeline-track">
            <button className="timeline-add-audio-btn" type="button">
              ➕ 添加背景音乐
            </button>
          </div>
        </div>
      </div>
    </div>
    {/* 时间轴高度调整手柄 */}
    <div
      className="timeline-resize-handle"
      onMouseDown={handleResizeStart}
    />
  </>
  )
}

// =====================================================
// 批量生成任务弹窗
// =====================================================
function BatchGenerateModal({
  visible,
  scripts = [],
  selectedPerson,
  voiceId,
  subtitleEnabled,
  onConfirm,
  onCancel,
  loading
}) {
  if (!visible) return null

  return (
    <div className="batch-generate-modal-overlay">
      <div className="batch-generate-modal">
        <h3 className="display-sm mb-md">确认批量生成</h3>

        <div className="mb-md">
          <p className="caption-strong mb-sm">数字人</p>
          <p className="body">{selectedPerson?.name}</p>
        </div>

        <div className="mb-md">
          <p className="caption-strong mb-sm">文案列表 (共 {scripts.length} 条)</p>
          <div className="script-preview-list">
            {scripts.map((s, i) => (
              <div key={i} className="script-preview-item">
                <span className="caption-strong">#{i + 1}</span>{' '}
                {s.text.substring(0, 50)}
                {s.text.length > 50 ? '...' : ''}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-md">
          <p className="caption-strong mb-sm">设置</p>
          <p className="caption">声音：{voiceId || '使用数字人原生声音'}</p>
          <p className="caption">字幕：{subtitleEnabled ? '开启' : '关闭'}</p>
        </div>

        <div className="flex gap-sm mt-lg">
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1 }}
            type="button"
          >
            {loading ? '🔄 生成中...' : `确认生成 (${scripts.length} 条视频)`}
          </button>
          <button
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={loading}
            type="button"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 主组件：数字人视频创作工作台
// =====================================================
function DigitalHumanStudio({ apiKey, apiBaseUrl }) {
  const [activeNav, setActiveNav] = useState('avatar')
  const [persons, setPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [aspectRatio, setAspectRatio] = useState('9:16')
  const [filterType, setFilterType] = useState('recommended')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // 批量生成弹窗状态
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [pendingScripts, setPendingScripts] = useState([])
  const [pendingVoiceId, setPendingVoiceId] = useState('')
  const [pendingSubtitleEnabled, setPendingSubtitleEnabled] = useState(true)
  const [generating, setGenerating] = useState(false)

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [commonRes, customRes, voicesRes] = await Promise.all([
        getCommonPersons(),
        getCustomPersons(),
        getVoices()
      ])

      if (commonRes?.data?.code === 0) {
        setPersons(commonRes.data.data || [])
      }

      if (customRes?.data?.code === 0) {
        setPersons(prev => [...prev, ...(customRes.data.data || [])])
      }

      if (voicesRes?.data?.code === 0) {
        setVoices(voicesRes.data.data || [])
      }
    } catch (err) {
      setError(`加载数据失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 处理批量生成
  const handleBatchGenerate = async (scripts, voiceId, subtitleEnabled) => {
    setPendingScripts(scripts)
    setPendingVoiceId(voiceId)
    setPendingSubtitleEnabled(subtitleEnabled)
    setShowBatchModal(true)
  }

  const confirmBatchGenerate = async () => {
    if (!selectedPerson) return

    setGenerating(true)

    try {
      let successCount = 0
      let failCount = 0

      for (const script of pendingScripts) {
        try {
          const payload = {
            text: script.text,
            person_id: selectedPerson.id,
            audio_man_id: pendingVoiceId || undefined,
            figure_type: selectedPerson.figure_type || 'whole_body',
            drive_mode: 'random',
            bg_type: 'color',
            bg_color: '#EDEDED',
            hide_subtitle: !pendingSubtitleEnabled,
            client_ref_id: `studio_batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            timeout_seconds: 3600,
          }

          const res = await createDhGenerateTask(payload)
          if (res?.data?.code === 0) {
            successCount++
          } else {
            failCount++
          }
        } catch (err) {
          console.error('创建任务失败:', err)
          failCount++
        }
      }

      setSuccessMsg(`批量生成完成：成功 ${successCount} 条，失败 ${failCount} 条`)
      setShowBatchModal(false)
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch (err) {
      setError(`批量生成失败：${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="studio-container">
      {/* 成功提示 */}
      {successMsg && (
        <div className="studio-toast studio-toast-success">
          {successMsg}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="studio-toast studio-toast-error">
          {error}
        </div>
      )}

      {/* 主体区域：左侧边栏 + 资源面板 + 预览区 + 右侧面板 */}
      <div className="studio-body">
        {/* 最左侧边栏 */}
        <LeftSidebar activeNav={activeNav} onNavChange={setActiveNav} />

        {/* 左侧资源面板 - 仅数字人标签页显示 */}
        {activeNav === 'avatar' && (
          <AvatarPicker
            persons={persons}
            selectedPerson={selectedPerson}
            onSelect={setSelectedPerson}
            filterType={filterType}
            onFilterChange={setFilterType}
          />
        )}

        {/* 中间预览区 */}
        <MainCanvas
          selectedPerson={selectedPerson}
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
        />

        {/* 右侧配置面板 */}
        <RightPanel
          selectedPerson={selectedPerson}
          voices={voices}
          onBatchGenerate={handleBatchGenerate}
        />
      </div>

      {/* 底部时间轴 */}
      <Timeline />

      {/* 批量生成确认弹窗 */}
      <BatchGenerateModal
        visible={showBatchModal}
        scripts={pendingScripts}
        selectedPerson={selectedPerson}
        voiceId={pendingVoiceId}
        subtitleEnabled={pendingSubtitleEnabled}
        onConfirm={confirmBatchGenerate}
        onCancel={() => setShowBatchModal(false)}
        loading={generating}
      />
    </div>
  )
}

export default DigitalHumanStudio