import React, { useRef, useEffect, useState, useCallback } from 'react'
import { useTimelineStore, timelineStore } from '../../stores/timelineStore'
import { 
  Trash2, 
  Scissors, 
  Undo2, 
  Redo2, 
  Copy as ClipboardCopy, 
  ClipboardPaste, 
  GripHorizontal,
  Lock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Headphones,
  Film,
  Magnet,
  Plus,
  MoreVertical
} from 'lucide-react'

/**
 * 专业视频编辑器时间轴组件
 * 现代化设计，支持多轨道、撤销重做、复制粘贴等功能
 */
export default function Timeline() {
  const { 
    clips, 
    mediaFiles, 
    tracks,
    selectedClipId, 
    selectClip, 
    updateClip, 
    removeClip,
    rippleRemove,
    splitClip,
    resizeClip,
    trimClipStart,
    snapToNearest,
    addTrack,
    setClipFade,
    totalDuration_ms,
    fps,
    // 轨道管理
    toggleTrackLock,
    toggleTrackVisibility,
    setTrackVolume,
    toggleTrackMute,
    toggleTrackSolo,
    removeTrack,
    // 撤销/重做
    undo,
    redo,
    getHistoryInfo,
    // 复制/粘贴
    copyClip,
    pasteClip,
    clipboard,
  } = useTimelineStore()
  
  // 状态
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [historyInfo, setHistoryInfo] = useState(getHistoryInfo())
  const [zoom, setZoom] = useState(50) // 像素/秒
  
  const timelineRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedClip, setDraggedClip] = useState(null)
  const [dragOffset, setDragOffset] = useState(0)
  
  // 调整大小状态
  const [isResizing, setIsResizing] = useState(false)
  const [resizingClip, setResizingClip] = useState(null)
  const [resizeHandle, setResizeHandle] = useState(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  
  // 配置
  const TRACK_HEIGHT = 96
  const HEADER_HEIGHT = 40
  const TRACK_HEADER_WIDTH = 168
  const SNAP_THRESHOLD_MS = 200
  
  // 转换函数
  const msToPixels = (ms) => (ms / 1000) * zoom
  const pixelsToMs = (px) => (px / zoom) * 1000

  // 更新历史状态
  useEffect(() => {
    setHistoryInfo(getHistoryInfo())
  }, [clips, getHistoryInfo])

  // 获取轨道列表
  const getTrackIds = () => {
    const ids = [...new Set([...Object.keys(tracks || {}), ...clips.map(c => c.track)])]
    const trackOrder = { human: 0, scene: 1, video: 2, audio: 3, subtitle: 4, image: 5 }
    return ids.sort((a, b) => {
      const aType = a.split('_')[0]
      const bType = b.split('_')[0]
      return (trackOrder[aType] ?? 99) - (trackOrder[bType] ?? 99) || a.localeCompare(b)
    })
  }

  const trackIds = getTrackIds()
  // 没有轨道时，时间标尺和播放头必须从最左侧 0 秒开始；有轨道时再为轨道控制栏预留宽度。
  const timelineHeaderWidth = trackIds.length > 0 ? TRACK_HEADER_WIDTH : 0

  // ========== 事件处理 ==========

  const handleMouseDown = (e, clip) => {
    e.preventDefault()
    e.stopPropagation()
    
    // 检查轨道是否锁定
    const trackInfo = tracks?.[clip.track]
    if (trackInfo?.locked) {
      console.log('[Timeline] 轨道已锁定，无法拖动:', clip.track)
      return
    }
    
    selectClip(clip.id)
    setIsDragging(true)
    setDraggedClip(clip)
    
    const rect = timelineRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left - TRACK_HEADER_WIDTH - msToPixels(clip.start_ms)
    setDragOffset(mouseX)
    
    console.log('[Timeline] 开始拖动片段:', clip.id, '轨道:', clip.track)
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !draggedClip) return
    
    const rect = timelineRef.current.getBoundingClientRect()
    const newX = e.clientX - rect.left - TRACK_HEADER_WIDTH - dragOffset
    let newStartMs = Math.max(0, pixelsToMs(Math.max(0, newX)))
    
    if (snapEnabled) {
      const { snappedTime, snapped } = snapToNearest(newStartMs, SNAP_THRESHOLD_MS)
      if (snapped) newStartMs = snappedTime
    }
    
    updateClip(draggedClip.id, { start_ms: newStartMs })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDraggedClip(null)
  }

  const handleTimelineClick = (e) => {
    // 只在时间轴内容区域点击时生效（排除轨道头部和片段）
    if (e.target.closest('.clip-item') || e.target.closest('.track-header')) {
      return
    }
    
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - timelineHeaderWidth
    const timeMs = pixelsToMs(Math.max(0, x))
    timelineStore.seek(Math.max(0, timeMs))
  }

  const handleResizeStart = useCallback((e, clip, handle) => {
    e.stopPropagation()
    selectClip(clip.id)
    setIsResizing(true)
    setResizingClip(clip)
    setResizeHandle(handle)
    setResizeStartX(e.clientX)
  }, [selectClip])
  
  const handleResizeMove = useCallback((e) => {
    if (!isResizing || !resizingClip) return
    
    const deltaX = e.clientX - resizeStartX
    const deltaMs = pixelsToMs(deltaX)
    
    if (resizeHandle === 'right') {
      const newDuration = Math.max(100, resizingClip.duration_ms + deltaMs)
      resizeClip(resizingClip.id, newDuration)
      setResizeStartX(e.clientX)
    } else if (resizeHandle === 'left') {
      const newStart = resizingClip.start_ms + deltaMs
      const newOffset = Math.max(0, resizingClip.offset_ms - deltaMs)
      if (newOffset >= 0 && newStart >= 0) {
        trimClipStart(resizingClip.id, Math.max(0, newStart), newOffset)
        setResizeStartX(e.clientX)
      }
    }
  }, [isResizing, resizingClip, resizeHandle, resizeStartX, resizeClip, trimClipStart])
  
  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
    setResizingClip(null)
    setResizeHandle(null)
  }, [])

  const handleSplitClip = useCallback(() => {
    if (!selectedClipId) return
    const currentTime = timelineStore.getState().currentTime_ms
    splitClip(selectedClipId, currentTime)
  }, [selectedClipId, splitClip])

  // ========== 撤销/重做/复制/粘贴 ==========

  const handleUndo = useCallback(() => undo(), [undo])
  const handleRedo = useCallback(() => redo(), [redo])
  
  const handleCopy = useCallback(() => {
    if (!selectedClipId) return
    copyClip(selectedClipId)
  }, [selectedClipId, copyClip])
  
  const handlePaste = useCallback(() => {
    if (!clipboard) return
    const currentTime = timelineStore.getState().currentTime_ms
    pasteClip(currentTime)
  }, [clipboard, pasteClip])

  // ========== 键盘快捷键 ==========

  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || target?.isContentEditable) return
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        handleCopy()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        handlePaste()
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault()
          removeClip(selectedClipId)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, handleCopy, handlePaste, selectedClipId, removeClip])

  // 全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, draggedClip, dragOffset])
  
  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove)
      window.addEventListener('mouseup', handleResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleResizeMove)
        window.removeEventListener('mouseup', handleResizeEnd)
      }
    }
  }, [isResizing, handleResizeMove, handleResizeEnd])

  // ========== 渲染辅助函数 ==========

  const formatTime = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    return hours > 0
      ? `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const renderTimeRuler = () => {
    const duration = Math.max(totalDuration_ms, 30000)
    const markers = []
    const interval = zoom >= 100 ? 1 : zoom >= 50 ? 2 : 5 // 秒间隔
    
    for (let s = 0; s <= duration / 1000; s += interval) {
      const x = msToPixels(s * 1000)
      const isMajor = s % (interval * 5) === 0
      
      markers.push(
        <div key={s} className="absolute top-0" style={{ left: x }}>
          <div className={`w-px ${isMajor ? 'h-3 bg-slate-500' : 'h-2 bg-slate-600'}`} />
          {isMajor && (
            <div className="text-[10px] text-slate-400 mt-1 -ml-3 font-mono">
              {formatTime(s * 1000)}
            </div>
          )}
        </div>
      )
    }
    return markers
  }

  // 空时间轴也保留一段可操作空间，避免刚打开时只有 10 秒的“玩具尺子”。
  // 有真实内容时再由成片时长自动撑开，并继续允许横向滚动。
  const duration = Math.max(totalDuration_ms, 30000)
  const timelineWidth = msToPixels(duration)
  const rulerIntervalMs = (zoom >= 100 ? 1 : zoom >= 50 ? 2 : 5) * 1000

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0d1117]">
      {/* ========== 工具栏 ========== */}
      <div className="h-11 bg-[#161b22] border-b border-slate-700/50 flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          {/* 标题 */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">时间轴</span>
            <span className="text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
              {clips.length} 片段
            </span>
          </div>
          
          <div className="w-px h-4 bg-slate-700" />
          
          {/* 吸附 */}
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition ${
              snapEnabled 
                ? 'bg-blue-600/20 text-blue-400' 
                : 'text-slate-400 hover:bg-slate-800'
            }`}
          >
            <Magnet size={14} />
            <span>吸附</span>
          </button>
          
          {/* 撤销/重做 */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={!historyInfo.canUndo}
              className={`p-1.5 rounded transition ${
                historyInfo.canUndo
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="撤销 (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={handleRedo}
              disabled={!historyInfo.canRedo}
              className={`p-1.5 rounded transition ${
                historyInfo.canRedo
                  ? 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 cursor-not-allowed'
              }`}
              title="重做 (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
          </div>
          
          <div className="w-px h-4 bg-slate-700" />
          
          {/* 缩放 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">缩放</span>
            <input
              type="range"
              min="20"
              max="200"
              value={zoom}
              onChange={(e) => setZoom(parseInt(e.target.value))}
              className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          
          <div className="w-px h-4 bg-slate-700" />
          
          {/* 添加轨道按钮 */}
          <button
            onClick={() => addTrack('video')}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white transition"
          >
            <Plus size={14} />
            <span>添加轨道</span>
          </button>
        </div>
        
        {/* 右侧工具 */}
        {selectedClipId && (
          <div className="flex items-center gap-1">
            <ToolButton icon={ClipboardCopy} onClick={handleCopy} label="复制" active={!!clipboard} />
            <ToolButton 
              icon={ClipboardPaste} 
              onClick={handlePaste} 
              label="粘贴" 
              disabled={!clipboard}
            />
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <ToolButton icon={Scissors} onClick={handleSplitClip} label="分割" />
            <ToolButton 
              icon={GripHorizontal} 
              onClick={() => rippleRemove(selectedClipId)} 
              label="波纹删"
              className="text-orange-400 hover:bg-orange-500/20"
            />
            <ToolButton 
              icon={Trash2} 
              onClick={() => removeClip(selectedClipId)} 
              label="删除"
              className="text-red-400 hover:bg-red-500/20"
            />
          </div>
        )}
      </div>

      {/* ========== 时间轴主体 ========== */}
      <div 
        ref={timelineRef}
        className="flex-1 overflow-auto relative"
        onClick={handleTimelineClick}
      >
        <div className="relative min-h-full" style={{ width: timelineWidth + timelineHeaderWidth }}>
          {/* 时间刻度 */}
          <div 
            className="h-8 bg-[#161b22] border-b border-slate-700/50 sticky top-0 z-20"
            style={{ position: 'sticky', top: 0, left: 0, right: 0 }}
          >
            <div className="absolute right-0 h-full" style={{ left: timelineHeaderWidth }}>
              {renderTimeRuler()}
            </div>
          </div>

          {/* 轨道区域 */}
          <div className="timeline-tracks relative pt-2">
            {trackIds.length === 0 ? (
              <EmptyState onAddTrack={() => addTrack('video')} />
            ) : (
              trackIds.map((trackId, index) => (
                <TimelineTrack
                  key={trackId}
                  trackId={trackId}
                  trackIndex={index}
                  clips={clips.filter(c => c.track === trackId)}
                  tracks={tracks}
                  mediaFiles={mediaFiles}
                  selectedClipId={selectedClipId}
                  onClipMouseDown={handleMouseDown}
                  onResizeStart={handleResizeStart}
                  msToPixels={msToPixels}
                  pixelsToMs={pixelsToMs}
                  gridIntervalMs={rulerIntervalMs}
                  timelineDurationMs={duration}
                  trackHeight={TRACK_HEIGHT}
                  headerWidth={TRACK_HEADER_WIDTH}
                  toggleTrackLock={toggleTrackLock}
                  toggleTrackVisibility={toggleTrackVisibility}
                  setTrackVolume={setTrackVolume}
                  toggleTrackMute={toggleTrackMute}
                  toggleTrackSolo={toggleTrackSolo}
                  removeTrack={removeTrack}
                />
              ))
            )}
          </div>

          {/* 播放头 */}
          <Playhead 
            currentTime_ms={timelineStore.getState().currentTime_ms}
            msToPixels={msToPixels}
            pixelsToMs={pixelsToMs}
            headerWidth={timelineHeaderWidth}
            onSeek={(time) => timelineStore.seek(time)}
            timelineRef={timelineRef}
          />
        </div>
      </div>
    </div>
  )
}

// ========== 工具按钮组件 ==========

function ToolButton({ icon: Icon, onClick, label, disabled, active, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs transition ${
        disabled 
          ? 'text-slate-600 cursor-not-allowed' 
          : active
            ? 'bg-blue-600/20 text-blue-400'
            : `text-slate-400 hover:bg-slate-800 hover:text-white ${className}`
      }`}
      title={label}
    >
      <Icon size={14} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}

// ========== 空状态组件 ==========

function EmptyState({ onAddTrack }) {
  return (
    <div className="timeline-empty-state flex items-center h-28 text-slate-500">
      <div className="timeline-empty-icon"><Film size={22} /></div>
      <div className="timeline-empty-copy-wrap">
        <p className="text-sm mb-1">时间轴还是空的</p>
        <span className="timeline-empty-copy">从素材库添加视频，开始你的二次剪辑</span>
      </div>
      <button
        onClick={onAddTrack}
        className="timeline-empty-button flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs transition"
      >
        <Plus size={16} />
        <span>创建视频轨道</span>
      </button>
    </div>
  )
}

// ========== 轨道组件 ==========

function TimelineTrack({ 
  trackId, 
  trackIndex, 
  clips, 
  tracks,
  mediaFiles, 
  selectedClipId, 
  onClipMouseDown, 
  msToPixels,
  pixelsToMs,
  gridIntervalMs,
  timelineDurationMs,
  trackHeight, 
  headerWidth,
  onResizeStart,
  toggleTrackLock,
  toggleTrackVisibility,
  setTrackVolume,
  toggleTrackMute,
  toggleTrackSolo,
  removeTrack,
}) {
  const trackType = trackId.split('_')[0]
  const trackNumber = trackId.match(/_(\d+)$/u)?.[1] || ''
  // 从 tracks 获取轨道状态
  const trackInfo = tracks?.[trackId] || {}
  const isLocked = trackInfo.locked || false
  const isHidden = trackInfo.hidden || false
  const isMuted = trackInfo.muted || false
  const isSolo = trackInfo.solo || false
  const volume = trackInfo.volume ?? 1.0
  const trackLabels = {
    human: '原生视频',
    scene: '素材视频',
    video: '视频',
    audio: '配音',
    subtitle: '字幕',
    image: '图片',
  }
  const trackLabel = `${trackLabels[trackType] || trackInfo.name || trackId}${trackNumber ? ` ${trackNumber}` : ''}`
  
  return (
    <div 
      className="relative border-b border-slate-800/30 group track-header"
      style={{ height: trackHeight }}
    >
      {/* 轨道头部 */}
      <div 
        className="absolute left-0 top-0 bottom-0 bg-[#161b22] border-r border-slate-700/50 z-10 flex flex-col"
        style={{ width: headerWidth }}
      >
        {/* 轨道信息行 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-xs font-medium truncate ${
              trackType === 'human' ? 'text-amber-400' :
              trackType === 'scene' ? 'text-cyan-400' :
              trackType === 'video' ? 'text-blue-400' :
              trackType === 'audio' ? 'text-green-400' :
              trackType === 'subtitle' ? 'text-purple-400' :
              'text-slate-300'
            }`}>
              {trackLabel}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
            {clips.length}
          </span>
        </div>
        
        {/* 控制按钮行 */}
        <div className="flex items-center gap-1 px-2 py-1.5">
          <TrackControlBtn
            icon={Lock}
            active={isLocked}
            onClick={(e) => {
              e.stopPropagation()
              console.log('[Track] toggleLock', trackId)
              toggleTrackLock(trackId)
            }}
            title="锁定轨道"
            className={isLocked ? 'text-yellow-400' : 'text-slate-500'}
          />
          <TrackControlBtn
            icon={isHidden ? EyeOff : Eye}
            active={isHidden}
            onClick={(e) => {
              e.stopPropagation()
              console.log('[Track] toggleVisibility', trackId)
              toggleTrackVisibility(trackId)
            }}
            title={isHidden ? '显示轨道' : '隐藏轨道'}
            className={isHidden ? 'text-slate-600' : 'text-slate-500'}
          />
          <TrackControlBtn
            icon={isMuted ? VolumeX : Volume2}
            active={isMuted}
            onClick={(e) => {
              e.stopPropagation()
              console.log('[Track] toggleMute', trackId)
              toggleTrackMute(trackId)
            }}
            title={isMuted ? '取消静音' : '静音'}
            className={isMuted ? 'text-red-400' : 'text-slate-500'}
          />
          <TrackControlBtn
            icon={Headphones}
            active={isSolo}
            onClick={(e) => {
              e.stopPropagation()
              console.log('[Track] toggleSolo', trackId)
              toggleTrackSolo(trackId)
            }}
            title="独奏"
            className={isSolo ? 'text-blue-400' : 'text-slate-500'}
          />
        </div>
        
        {/* 音量控制 */}
        <div className="px-3 pb-2 flex items-center gap-2">
          <Volume2 size={12} className="text-slate-500" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setTrackVolume(trackId, parseFloat(e.target.value))}
            className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>

      {/* 轨道内容区域 */}
      <div 
        className="absolute top-0 bottom-0 bg-[#0d1117] timeline-content"
        style={{ left: headerWidth, right: 0 }}
        onClick={(e) => {
          // 点击轨道内容区域时移动播放头（排除片段点击）
          if (e.target.closest('.clip-item')) return
          
          const rect = e.currentTarget.getBoundingClientRect()
          const x = e.clientX - rect.left
          const timeMs = pixelsToMs(Math.max(0, x))
          timelineStore.seek(Math.max(0, timeMs))
        }}
      >
        {/* 网格背景 */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(Math.ceil(timelineDurationMs / gridIntervalMs) + 1)].map((_, i) => (
            <div 
              key={i}
              className="absolute h-full w-px bg-slate-800/30"
              style={{ left: msToPixels(i * gridIntervalMs) }}
            />
          ))}
        </div>

        {/* 片段 */}
        {clips.map(clip => {
          const media = mediaFiles[clip.mediaId]
          const left = msToPixels(clip.start_ms)
          const width = msToPixels(clip.duration_ms)
          const isSelected = selectedClipId === clip.id
          const minWidth = 30

          return (
            <ClipItem
              key={clip.id}
              clip={clip}
              media={media}
              left={left}
              width={width}
              minWidth={minWidth}
              isSelected={isSelected}
              trackHeight={trackHeight}
              onMouseDown={onClipMouseDown}
              onResizeStart={onResizeStart}
            />
          )
        })}
      </div>
    </div>
  )
}

// ========== 轨道控制按钮 ==========

function TrackControlBtn({ icon: Icon, active, onClick, title, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`p-1 rounded hover:bg-slate-700/50 transition ${className}`}
      title={title}
    >
      <Icon size={14} />
    </button>
  )
}

// ========== 片段组件 ==========

function ClipItem({ 
  clip, 
  media, 
  left, 
  width, 
  minWidth, 
  isSelected, 
  trackHeight,
  onMouseDown,
  onResizeStart 
}) {
  const clipColor = getClipColor(media?.type || 'video')
  
  return (
    <div
      className={`absolute top-2 bottom-2 rounded-md overflow-hidden cursor-move group transition-all clip-item ${
        isSelected 
          ? 'ring-2 ring-blue-500 shadow-lg shadow-blue-500/20 z-10' 
          : 'hover:ring-2 hover:ring-blue-400/50 hover:shadow-md'
      }`}
      style={{ 
        left,
        width: Math.max(width, minWidth),
        background: clipColor,
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        onMouseDown(e, clip)
      }}
    >
      {/* 左侧调整手柄 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100 hover:bg-blue-500/30 transition-all z-20 flex items-center justify-center"
        onMouseDown={(e) => onResizeStart(e, clip, 'left')}
      >
        <div className="w-0.5 h-4 bg-white/30 rounded" />
      </div>
      
      {/* 片段内容 */}
      <div className="h-full w-full p-2 overflow-hidden">
        {media?.thumbnail ? (
          <div className="flex h-full gap-0.5">
            {[...Array(Math.min(8, Math.floor(width / 40)))].map((_, i) => (
              <img 
                key={i}
                src={media.thumbnail}
                className="h-full aspect-video object-cover rounded-sm opacity-70"
                alt=""
              />
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1">
            <span className="text-xs text-white/90 font-medium truncate max-w-full">
              {media?.name || clip.id}
            </span>
            <span className="text-[10px] text-white/60 font-mono">
              {(clip.duration_ms / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </div>

      {/* 右侧调整手柄 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100 hover:bg-blue-500/30 transition-all z-20 flex items-center justify-center"
        onMouseDown={(e) => onResizeStart(e, clip, 'right')}
      >
        <div className="w-0.5 h-4 bg-white/30 rounded" />
      </div>
    </div>
  )
}

// ========== 播放头组件 ==========

function Playhead({ currentTime_ms, msToPixels, pixelsToMs, headerWidth, onSeek, timelineRef }) {
  const x = msToPixels(currentTime_ms) + headerWidth
  const [isDragging, setIsDragging] = useState(false)
  
  const handleMouseDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }
  
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !onSeek || !timelineRef?.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left - headerWidth
    const timeMs = pixelsToMs(Math.max(0, x))
    onSeek(Math.max(0, timeMs))
  }, [isDragging, onSeek, headerWidth, timelineRef, pixelsToMs])
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])
  
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])
  
  return (
    <div 
      className="absolute top-0 z-30"
      style={{ left: x - 1 }}
    >
      {/* 播放头三角形 - 可点击拖动 */}
      <div 
        className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      />
      {/* 播放头线条 */}
      <div 
        className="w-0.5 bg-red-500 shadow-lg shadow-red-500/50 cursor-grab active:cursor-grabbing" 
        style={{ height: 'calc(100vh - 150px)' }}
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}

// ========== 颜色函数 ==========

function getClipColor(type) {
  const colors = {
    video: 'linear-gradient(135deg, rgba(59, 130, 246, 0.85) 0%, rgba(37, 99, 235, 0.9) 100%)',
    human: 'linear-gradient(135deg, rgba(245, 158, 11, 0.9) 0%, rgba(217, 119, 6, 0.92) 100%)',
    scene: 'linear-gradient(135deg, rgba(6, 182, 212, 0.9) 0%, rgba(8, 145, 178, 0.92) 100%)',
    audio: 'linear-gradient(135deg, rgba(34, 197, 94, 0.85) 0%, rgba(22, 163, 74, 0.9) 100%)',
    image: 'linear-gradient(135deg, rgba(168, 85, 247, 0.85) 0%, rgba(147, 51, 234, 0.9) 100%)',
    subtitle: 'linear-gradient(135deg, rgba(236, 72, 153, 0.85) 0%, rgba(219, 39, 119, 0.9) 100%)',
  }
  return colors[type] || 'linear-gradient(135deg, rgba(107, 114, 128, 0.85) 0%, rgba(75, 85, 99, 0.9) 100%)'
}
