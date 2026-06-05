import React, { useRef, useEffect, useState } from 'react'
import { useTimelineStore, timelineStore } from '../../stores/timelineStore'
import { Trash2, Move, Scissors, Copy } from 'lucide-react'

/**
 * 时间轴组件
 * 显示和管理视频剪辑片段
 */
export default function Timeline() {
  const { 
    clips, 
    mediaFiles, 
    selectedClipId, 
    selectClip, 
    updateClip, 
    removeClip,
    totalDuration_ms,
    fps 
  } = useTimelineStore()
  
  const timelineRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedClip, setDraggedClip] = useState(null)
  const [dragOffset, setDragOffset] = useState(0)
  
  // 时间轴配置
  const PIXELS_PER_SECOND = 50
  const TRACK_HEIGHT = 80
  const HEADER_HEIGHT = 40
  
  // 将毫秒转换为像素
  const msToPixels = (ms) => (ms / 1000) * PIXELS_PER_SECOND
  const pixelsToMs = (px) => (px / PIXELS_PER_SECOND) * 1000

  // 获取所有轨道
  const getTracks = () => {
    const trackIds = [...new Set(clips.map(c => c.track))]
    return trackIds.sort()
  }

  // 处理鼠标按下
  const handleMouseDown = (e, clip) => {
    e.stopPropagation()
    selectClip(clip.id)
    setIsDragging(true)
    setDraggedClip(clip)
    
    const rect = timelineRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left - msToPixels(clip.start_ms)
    setDragOffset(mouseX)
  }

  // 处理鼠标移动
  const handleMouseMove = (e) => {
    if (!isDragging || !draggedClip) return
    
    const rect = timelineRef.current.getBoundingClientRect()
    const newX = e.clientX - rect.left - dragOffset
    const newStartMs = Math.max(0, pixelsToMs(Math.max(0, newX)))
    
    updateClip(draggedClip.id, { start_ms: newStartMs })
  }

  // 处理鼠标释放
  const handleMouseUp = () => {
    setIsDragging(false)
    setDraggedClip(null)
  }

  // 处理时间轴点击（定位播放头）
  const handleTimelineClick = (e) => {
    if (e.target === timelineRef.current || e.target.classList.contains('timeline-tracks')) {
      const rect = timelineRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const timeMs = pixelsToMs(x)
      timelineStore.seek(Math.max(0, timeMs))
    }
  }

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

  // 格式化时间
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 生成时间刻度
  const renderTimeRuler = () => {
    const duration = Math.max(totalDuration_ms, 10000) // 至少显示 10 秒
    const width = msToPixels(duration)
    const markers = []
    
    for (let s = 0; s <= duration / 1000; s++) {
      const x = msToPixels(s * 1000)
      const isMajor = s % 5 === 0
      
      markers.push(
        <div 
          key={s} 
          className="absolute top-0"
          style={{ left: x }}
        >
          <div className={`h-${isMajor ? '3' : '2'} w-px bg-slate-600`} />
          {isMajor && (
            <div className="text-[10px] text-slate-500 mt-1 -ml-3">
              {formatTime(s * 1000)}
            </div>
          )}
        </div>
      )
    }
    
    return markers
  }

  const tracks = getTracks()
  const duration = Math.max(totalDuration_ms, 10000)
  const timelineWidth = msToPixels(duration)

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0a0a0f]">
      {/* 工具栏 */}
      <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-300">时间轴</span>
          <span className="text-xs text-slate-500">({clips.length} 个片段)</span>
        </div>
        
        {selectedClipId && (
          <div className="flex items-center gap-1">
            <button 
              onClick={() => removeClip(selectedClipId)}
              className="p-1 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition"
              title="删除片段"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* 时间轴主体 */}
      <div 
        ref={timelineRef}
        className="flex-1 overflow-auto relative"
        onClick={handleTimelineClick}
      >
        <div 
          className="relative"
          style={{ 
            width: timelineWidth, 
            minHeight: '100%',
            paddingBottom: 100 
          }}
        >
          {/* 时间刻度 */}
          <div 
            className="h-10 bg-slate-900/50 border-b border-slate-800 sticky top-0 z-10"
            style={{ position: 'sticky', top: 0 }}
          >
            {renderTimeRuler()}
          </div>

          {/* 轨道区域 */}
          <div className="timeline-tracks relative">
            {tracks.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-600">
                <p className="text-sm">暂无轨道，从素材库添加素材</p>
              </div>
            ) : (
              tracks.map((trackId, index) => (
                <TimelineTrack
                  key={trackId}
                  trackId={trackId}
                  trackIndex={index}
                  clips={clips.filter(c => c.track === trackId)}
                  mediaFiles={mediaFiles}
                  selectedClipId={selectedClipId}
                  onClipMouseDown={handleMouseDown}
                  msToPixels={msToPixels}
                  trackHeight={TRACK_HEIGHT}
                />
              ))
            )}
          </div>

          {/* 播放头 */}
          <Playhead 
            currentTime_ms={timelineStore.getState().currentTime_ms}
            msToPixels={msToPixels}
            trackHeight={TRACK_HEIGHT}
            headerHeight={HEADER_HEIGHT}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * 轨道组件
 */
function TimelineTrack({ trackId, trackIndex, clips, mediaFiles, selectedClipId, onClipMouseDown, msToPixels, trackHeight }) {
  return (
    <div 
      className="relative border-b border-slate-800/50"
      style={{ height: trackHeight }}
    >
      {/* 轨道标签 */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-24 bg-slate-900/80 border-r border-slate-800 flex items-center px-2 z-10"
        style={{ height: trackHeight }}
      >
        <span className="text-xs text-slate-400 truncate">
          {trackId.replace('_', ' ')}
        </span>
      </div>

      {/* 轨道内容 */}
      <div 
        className="absolute left-24 right-0"
        style={{ height: trackHeight }}
      >
        {/* 背景网格 */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(20)].map((_, i) => (
            <div 
              key={i}
              className="absolute h-full w-px bg-slate-500"
              style={{ left: i * 100 }}
            />
          ))}
        </div>

        {/* 片段 */}
        {clips.map(clip => {
          const media = mediaFiles[clip.mediaId]
          const left = msToPixels(clip.start_ms)
          const width = msToPixels(clip.duration_ms)
          const isSelected = selectedClipId === clip.id

          return (
            <div
              key={clip.id}
              className={`absolute top-1 bottom-1 rounded overflow-hidden cursor-move group ${
                isSelected 
                  ? 'ring-2 ring-blue-500 z-10' 
                  : 'hover:ring-2 hover:ring-blue-400/50'
              }`}
              style={{ 
                left, 
                width: Math.max(width, 20),
                backgroundColor: getClipColor(media?.type || 'video')
              }}
              onMouseDown={(e) => onClipMouseDown(e, clip)}
            >
              {/* 片段内容 */}
              <div className="h-full w-full p-1 overflow-hidden">
                {media?.thumbnail ? (
                  <div className="flex h-full gap-0.5">
                    {[...Array(Math.min(5, Math.floor(width / 30)))].map((_, i) => (
                      <img 
                        key={i}
                        src={media.thumbnail}
                        className="h-full w-8 object-cover rounded-sm opacity-80"
                        alt=""
                      />
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <span className="text-[10px] text-white/80 truncate">
                      {media?.name || clip.id}
                    </span>
                  </div>
                )}
              </div>

              {/* 时长标签 */}
              <div className="absolute bottom-0.5 right-1 text-[9px] text-white/70 bg-black/30 px-1 rounded">
                {(clip.duration_ms / 1000).toFixed(1)}s
              </div>

              {/* 悬停操作 */}
              <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-0.5 bg-black/50 rounded hover:bg-black/70 text-white">
                  <Move size={8} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 播放头组件
 */
function Playhead({ currentTime_ms, msToPixels, trackHeight, headerHeight }) {
  const x = msToPixels(currentTime_ms)
  
  return (
    <div 
      className="absolute top-0 z-20 pointer-events-none"
      style={{ left: x - 1 }}
    >
      {/* 播放头顶部三角形 */}
      <div 
        className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500"
        style={{ position: 'absolute', top: -2 }}
      />
      {/* 播放头线条 */}
      <div 
        className="w-0.5 bg-red-500"
        style={{ height: 'calc(100vh - 200px)' }}
      />
    </div>
  )
}

/**
 * 根据类型获取片段颜色
 */
function getClipColor(type) {
  switch (type) {
    case 'video': return 'rgba(59, 130, 246, 0.7)' // blue
    case 'audio': return 'rgba(34, 197, 94, 0.7)' // green
    case 'image': return 'rgba(168, 85, 247, 0.7)' // purple
    case 'text': return 'rgba(236, 72, 153, 0.7)' // pink
    default: return 'rgba(107, 114, 128, 0.7)' // gray
  }
}