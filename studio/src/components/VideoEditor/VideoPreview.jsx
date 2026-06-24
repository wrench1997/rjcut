import React, { useRef, useEffect, useState } from 'react'
import { useTimelineStore, mediaFileRegistry } from '../../stores/timelineStore'
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react'

/**
 * 视频预览组件
 * 显示当前时间轴的合成画面
 */
export default function VideoPreview() {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const { 
    isPlaying, 
    currentTime_ms, 
    clips, 
    mediaFiles,
    play, 
    pause, 
    seek,
    totalDuration_ms 
  } = useTimelineStore()
  
  const [showingMedia, setShowingMedia] = useState(null)

  // 获取当前时间激活的视频片段
  const getActiveClip = () => {
    return clips.find(clip => {
      if (clip.type !== 'video') return false
      return currentTime_ms >= clip.start_ms && currentTime_ms < clip.start_ms + clip.duration_ms
    })
  }

  // 渲染当前帧
  useEffect(() => {
    const activeClip = getActiveClip()
    
    if (!activeClip) {
      setShowingMedia(null)
      return
    }

    const media = mediaFiles[activeClip.mediaId]
    if (!media) return

    const blob = mediaFileRegistry.get(activeClip.mediaId)
    if (!blob) return

    // 如果是视频，更新 video 元素
    if (media.type === 'video') {
      const videoUrl = URL.createObjectURL(blob)
      
      if (!videoRef.current) {
        videoRef.current = document.createElement('video')
        videoRef.current.muted = true
        videoRef.current.playsInline = true
        videoRef.current.style.display = 'none'
        document.body.appendChild(videoRef.current)
      }

      const videoEl = videoRef.current
      
      // 定义绘制函数
      const drawFrame = () => {
        const canvas = canvasRef.current
        if (!canvas || !videoEl.videoWidth) return
        
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        // 保持宽高比缩放
        const videoRatio = videoEl.videoWidth / videoEl.videoHeight
        const canvasRatio = canvas.width / canvas.height
        
        let drawWidth, drawHeight, drawX, drawY
        
        if (videoRatio > canvasRatio) {
          drawWidth = canvas.width
          drawHeight = canvas.width / videoRatio
          drawX = 0
          drawY = (canvas.height - drawHeight) / 2
        } else {
          drawHeight = canvas.height
          drawWidth = canvas.height * videoRatio
          drawX = (canvas.width - drawWidth) / 2
          drawY = 0
        }
        
        ctx.drawImage(videoEl, drawX, drawY, drawWidth, drawHeight)
      }

      // 如果源改变了，重新加载
      if (videoEl.src !== videoUrl) {
        // 移除旧的事件监听器
        videoEl.removeEventListener('seeked', drawFrame)
        videoEl.removeEventListener('loadeddata', drawFrame)
        videoEl.removeEventListener('error', handleError)
        
        videoEl.src = videoUrl
        videoEl.load()
      }

      // 添加事件监听器
      videoEl.addEventListener('seeked', drawFrame, { once: true })
      videoEl.addEventListener('loadeddata', drawFrame, { once: true })
      
      const handleError = (e) => {
        console.error('[VideoPreview] 视频加载错误:', e)
      }
      videoEl.addEventListener('error', handleError)

      // 计算视频内的时间位置
      const clipOffset = currentTime_ms - activeClip.start_ms + activeClip.offset_ms
      videoEl.currentTime = Math.max(0, clipOffset / 1000)

      setShowingMedia(media)
      
      return () => {
        videoEl.removeEventListener('seeked', drawFrame)
        videoEl.removeEventListener('loadeddata', drawFrame)
        videoEl.removeEventListener('error', handleError)
        URL.revokeObjectURL(videoUrl)
      }
    }
    
    // 如果是图片
    if (media.type === 'image') {
      const imgUrl = URL.createObjectURL(blob)
      const img = new Image()
      img.src = imgUrl
      
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        
        // 保持宽高比缩放
        const imgRatio = img.width / img.height
        const canvasRatio = canvas.width / canvas.height
        
        let drawWidth, drawHeight, drawX, drawY
        
        if (imgRatio > canvasRatio) {
          drawWidth = canvas.width
          drawHeight = canvas.width / imgRatio
          drawX = 0
          drawY = (canvas.height - drawHeight) / 2
        } else {
          drawHeight = canvas.height
          drawWidth = canvas.height * imgRatio
          drawX = (canvas.width - drawWidth) / 2
          drawY = 0
        }
        
        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
      }
      
      setShowingMedia(media)
      
      return () => {
        URL.revokeObjectURL(imgUrl)
      }
    }
  }, [currentTime_ms, clips, mediaFiles])

  // 播放控制
  useEffect(() => {
    let animationFrame
    
    const tick = () => {
      if (isPlaying && currentTime_ms < totalDuration_ms) {
        seek(currentTime_ms + 33) // ~30fps
        animationFrame = requestAnimationFrame(tick)
      } else if (currentTime_ms >= totalDuration_ms) {
        pause()
      }
    }
    
    if (isPlaying) {
      tick()
    }
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [isPlaying, currentTime_ms, totalDuration_ms])

  const togglePlay = () => {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 画布区域 */}
      <div className="flex-1 flex items-center justify-center bg-black relative">
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="max-w-full max-h-full object-contain"
          style={{ aspectRatio: '16/9' }}
        />
        
        {/* 无内容提示 */}
        {!showingMedia && clips.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-600">
            <div className="text-center">
              <p className="text-sm">预览窗口</p>
              <p className="text-xs mt-1">添加素材到时间轴后预览</p>
            </div>
          </div>
        )}
      </div>

      {/* 播放控制栏 */}
      <div className="h-12 bg-slate-900 border-t border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => seek(0)}
            className="text-slate-400 hover:text-white transition"
            title="跳到开头"
          >
            <SkipBack size={18} />
          </button>
          
          <button 
            onClick={togglePlay}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-full p-2 transition"
            title={isPlaying ? '暂停' : '播放'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          
          <button 
            onClick={() => seek(totalDuration_ms)}
            className="text-slate-400 hover:text-white transition"
            title="跳到结尾"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {/* 时间显示 */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-white">{formatTime(currentTime_ms)}</span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-400">{formatTime(totalDuration_ms)}</span>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 size={16} className="text-slate-400" />
        </div>
      </div>
    </div>
  )
}