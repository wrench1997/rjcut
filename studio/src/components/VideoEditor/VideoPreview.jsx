import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTimelineStore, mediaFileRegistry } from '../../stores/timelineStore'
import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import {
  computeSubtitlePreviewStyle,
  getActiveSubtitleStyle,
  loadSubtitleConfig,
  splitSubtitleIntoLines,
} from '../../utils/subtitleConfig'

/**
 * 视频预览组件。
 * 视频源只在切换素材时重新加载，播放期间复用同一个解码器，避免每帧创建 Blob URL。
 */
export default function VideoPreview({ project = null }) {
  const canvasRef = useRef(null)
  const videoRef = useRef(null)
  const objectUrlRef = useRef(null)
  const sourceKeyRef = useRef('')
  const currentTimeRef = useRef(0)
  const playbackFrameRef = useRef(null)
  const previewRequestRef = useRef(0)
  const previewFallbackKeyRef = useRef('')
  const frameRef = useRef(null)
  const {
    isPlaying,
    currentTime_ms,
    clips,
    mediaFiles,
    play,
    pause,
    seek,
    totalDuration_ms,
  } = useTimelineStore()
  const [showingMedia, setShowingMedia] = useState(null)
  const [isPreparingPreview, setIsPreparingPreview] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [subtitleConfig, setSubtitleConfig] = useState(() => loadSubtitleConfig())
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })

  // 预览字幕跟 GlobalParamsVisualEditor 共享同一份配置（rjcut_global_params_v1）。
  // 用户在 GlobalParamsVisualEditor 里调整后，触发 storage 事件自动同步到预览层，
  // 不需要手动刷新页面。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const refresh = () => setSubtitleConfig(loadSubtitleConfig())
    refresh()
    window.addEventListener('storage', refresh)
    // 同窗口内 GlobalParamsVisualEditor 通过 onChange 把数据写回 localStorage 后不会
    // 自动派发 storage 事件，再补一个兜底：监听点击/输入事件后 200ms 同步一次。
    const timer = setInterval(refresh, 500)
    return () => {
      window.removeEventListener('storage', refresh)
      clearInterval(timer)
    }
  }, [])

  // 跟踪预览画布的实际尺寸，用于按比例缩放字号、描边、背景圆角等。
  useEffect(() => {
    const target = frameRef.current
    if (!target || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setFrameSize({ width: Math.round(width), height: Math.round(height) })
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [showingMedia])

  useEffect(() => {
    currentTimeRef.current = currentTime_ms
  }, [currentTime_ms])

  const getActiveClip = () => {
    const priority = { scene: 0, human: 1, video: 2 }
    return clips
      .filter((clip) => (
        ['video', 'human', 'scene'].includes(clip.type)
        && currentTime_ms >= clip.start_ms
        && currentTime_ms < clip.start_ms + clip.duration_ms
      ))
      .sort((a, b) => (priority[a.type] ?? 99) - (priority[b.type] ?? 99))[0]
  }

  const activeClip = getActiveClip()
  const activeMedia = activeClip ? mediaFiles[activeClip.mediaId] : null
  const activeMediaKey = activeMedia ? `${activeMedia.id}:${activeMedia.type}` : ''
  const subtitle = getActiveSubtitle(project, currentTime_ms, clips)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
  }

  // 只有素材改变时切换视频源；播放过程中不再反复 createObjectURL/load。
  useEffect(() => {
    const canvas = canvasRef.current
    if (!activeClip || !activeMedia) {
      setShowingMedia(null)
      setIsPreparingPreview(false)
      setPreviewError('')
      previewFallbackKeyRef.current = ''
      sourceKeyRef.current = ''
      if (videoRef.current) videoRef.current.pause()
      if (videoRef.current) {
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      clearCanvas()
      return undefined
    }

    const blob = mediaFileRegistry.get(activeClip.mediaId)
    if (!blob) return undefined
    setShowingMedia(activeMedia)
    setPreviewError('')
    setIsPreparingPreview(false)

    if (activeMedia.type === 'video') {
      const videoElement = videoRef.current
      if (!videoElement) return undefined
      const sourceChanged = sourceKeyRef.current !== activeMediaKey
      const requestId = ++previewRequestRef.current
      const handleReady = () => {
        if (previewRequestRef.current !== requestId) return
        setIsPreparingPreview(false)
        setPreviewError('')
      }
      const handleError = (event) => {
        console.error('[VideoPreview] 视频加载错误:', event)
        if (!sourceChanged || previewFallbackKeyRef.current === activeMediaKey) {
          setIsPreparingPreview(false)
          setPreviewError('该素材无法在当前预览解码，请使用导出结果查看。')
          return
        }

        previewFallbackKeyRef.current = activeMediaKey
        const nativePreview = typeof window !== 'undefined' && window.electronAPI?.previewTranscode
        if (!nativePreview || !activeMedia.vfsPath) {
          setIsPreparingPreview(false)
          setPreviewError('该素材是当前浏览器不支持的 HEVC/MOV 编码，请先转为 H.264 MP4。')
          return
        }

        setIsPreparingPreview(true)
        setPreviewError('')
        window.electronAPI.previewTranscode({
          filePath: activeMedia.vfsPath,
          width: 540,
          height: 960,
        }).then((previewData) => {
          if (previewRequestRef.current !== requestId) return
          const previewBlob = new Blob([previewData], { type: 'video/mp4' })
          if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = URL.createObjectURL(previewBlob)
          sourceKeyRef.current = activeMediaKey
          videoElement.src = objectUrlRef.current
          videoElement.load()
        }).catch((error) => {
          if (previewRequestRef.current !== requestId) return
          console.error('[VideoPreview] 生成兼容预览失败:', error)
          setIsPreparingPreview(false)
          setPreviewError(`素材预览转码失败：${error.message || '未知错误'}`)
        })
      }

      if (sourceChanged) {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = URL.createObjectURL(blob)
        sourceKeyRef.current = activeMediaKey
        videoElement.src = objectUrlRef.current
        videoElement.addEventListener('loadeddata', handleReady)
        videoElement.addEventListener('canplay', handleReady)
        videoElement.addEventListener('error', handleError)
        videoElement.load()
      }

      return () => {
        videoElement.removeEventListener('loadeddata', handleReady)
        videoElement.removeEventListener('canplay', handleReady)
        videoElement.removeEventListener('error', handleError)
      }
    }

    if (activeMedia.type === 'image') {
      sourceKeyRef.current = activeMediaKey
      if (videoRef.current) videoRef.current.pause()
      const imageUrl = URL.createObjectURL(blob)
      const image = new Image()
      image.onload = () => {
        const target = canvasRef.current
        const context = target?.getContext('2d')
        if (!target || !context) return
        context.clearRect(0, 0, target.width, target.height)
        const imageRatio = image.width / image.height
        const canvasRatio = target.width / target.height
        const drawWidth = imageRatio > canvasRatio ? target.width : target.height * imageRatio
        const drawHeight = imageRatio > canvasRatio ? target.width / imageRatio : target.height
        context.drawImage(image, (target.width - drawWidth) / 2, (target.height - drawHeight) / 2, drawWidth, drawHeight)
      }
      image.src = imageUrl
      return () => URL.revokeObjectURL(imageUrl)
    }

    return undefined
  }, [activeClip?.mediaId, activeMediaKey, activeMedia?.type])

  // 点击时间轴或拖动播放头时校准源视频；连续播放由原生 video 解码。
  useEffect(() => {
    const videoElement = videoRef.current
    if (!videoElement || !activeClip || activeMedia?.type !== 'video' || sourceKeyRef.current !== activeMediaKey) return undefined

    const desiredTime = Math.max(0, (currentTime_ms - activeClip.start_ms + (activeClip.offset_ms || 0)) / 1000)
    const drift = Math.abs((videoElement.currentTime || 0) - desiredTime)

    if (isPlaying) {
      if (drift > 0.45) videoElement.currentTime = desiredTime
      if (videoElement.paused) videoElement.play().catch(() => {})
      return undefined
    }

    videoElement.pause()
    if (drift > 0.03) {
      videoElement.currentTime = desiredTime
    }
    return undefined
  }, [activeClip?.id, activeClip?.start_ms, activeClip?.offset_ms, activeMediaKey, activeMedia?.type, currentTime_ms, isPlaying])

  // 时间轴播放头以约 30fps 推进，不再因每次 render 重建一个新的动画循环。
  useEffect(() => {
    if (!isPlaying) {
      if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current)
      playbackFrameRef.current = null
      return undefined
    }

    let lastTime = performance.now()
    let accumulated = 0
    const tick = (now) => {
      accumulated += Math.min(100, now - lastTime)
      lastTime = now
      // 原生 video 自己以解码时钟连续播放；时间轴只需低频同步，
      // 否则每 50ms 更新一次会让整条时间轴反复 React 重渲染并抢占解码。
      if (accumulated >= 80) {
        const nextTime = currentTimeRef.current + accumulated
        accumulated = 0
        if (nextTime >= totalDuration_ms) {
          seek(totalDuration_ms)
          pause()
          return
        }
        seek(nextTime)
      }
      playbackFrameRef.current = requestAnimationFrame(tick)
    }
    playbackFrameRef.current = requestAnimationFrame(tick)
    return () => {
      if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current)
      playbackFrameRef.current = null
    }
  }, [isPlaying, totalDuration_ms, pause, seek])

  useEffect(() => () => {
    if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current)
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    if (videoRef.current) videoRef.current.pause()
  }, [])

  const togglePlay = () => {
    if (isPlaying) pause()
    else play()
  }

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="advanced-preview-stage relative flex flex-1 items-center justify-center">
        <div ref={frameRef} className="advanced-preview-frame">
          <video ref={videoRef} muted playsInline preload="auto" className={`${showingMedia?.type === 'video' ? 'block' : 'hidden'} h-full w-full object-contain`} />
          <canvas ref={canvasRef} width={540} height={960} className={`${showingMedia?.type === 'video' ? 'hidden' : 'block'} h-full w-full object-contain`} />
          {subtitle && (
            <SubtitleLayer
              subtitle={subtitle}
              subtitleConfig={subtitleConfig}
              frameSize={frameSize}
            />
          )}
        </div>
        {isPreparingPreview && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-center text-slate-200">
            <div>
              <div className="mx-auto mb-2 h-6 w-6 animate-spin rounded-full border-2 border-slate-500 border-t-blue-400" />
              <p className="text-sm">正在生成兼容预览</p>
              <p className="mt-1 text-xs text-slate-400">原片是 HEVC/MOV，原文件不会被修改</p>
            </div>
          </div>
        )}
        {previewError && !isPreparingPreview && (
          <div className="absolute inset-x-4 bottom-4 rounded-lg bg-rose-950/85 px-3 py-2 text-center text-xs text-rose-100">
            {previewError}
          </div>
        )}
        {!showingMedia && clips.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-600">
            <div className="text-center">
              <p className="text-sm">预览窗口</p>
              <p className="mt-1 text-xs">添加素材到时间轴后预览</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-12 flex-shrink-0 items-center justify-between border-t border-slate-800 bg-slate-900 px-4">
        <div className="flex items-center gap-2">
          <button onClick={() => seek(0)} className="text-slate-400 transition hover:text-white" title="跳到开头"><SkipBack size={18} /></button>
          <button onClick={togglePlay} className="rounded-full bg-blue-600 p-2 text-white transition hover:bg-blue-500" title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button onClick={() => seek(totalDuration_ms)} className="text-slate-400 transition hover:text-white" title="跳到结尾"><SkipForward size={18} /></button>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-white">{formatTime(currentTime_ms)}</span>
          <span className="text-slate-500">/</span>
          <span className="text-slate-400">{formatTime(totalDuration_ms)}</span>
        </div>
        <Volume2 size={16} className="text-slate-400" />
      </div>
    </div>
  )
}

function getActiveSubtitle(project, currentTimeMs, timelineClips = []) {
  const subtitleClip = timelineClips.find((clip) => (
    clip.type === 'subtitle'
    && currentTimeMs >= clip.start_ms
    && currentTimeMs < clip.start_ms + clip.duration_ms
  ))
  if (subtitleClip) {
    const textCharacters = Array.from(String(subtitleClip.content || ''))
    const sourceTimings = Array.isArray(subtitleClip.char_timings) ? subtitleClip.char_timings : []
    const activeCharacterIndex = sourceTimings.findIndex((character) => {
      const sourceStart = Number(character.start_ms ?? Number(character.start || 0) * 1000)
      const sourceEnd = Number(character.end_ms ?? Number(character.end || 0) * 1000)
      const relocatedStart = subtitleClip.start_ms + sourceStart - (Number(sourceTimings[0]?.start_ms) || sourceStart)
      const relocatedEnd = relocatedStart + Math.max(1, sourceEnd - sourceStart)
      return currentTimeMs >= relocatedStart && currentTimeMs < relocatedEnd
    })
    return {
      chars: textCharacters.map((char, index) => ({
        ...(sourceTimings[index] || {}),
        char,
        index,
        active: index === activeCharacterIndex,
      })),
    }
  }
  const segments = Array.isArray(project?.segments)
    ? project.segments
    : Array.isArray(project?.timeline?.segments) ? project.timeline.segments : []
  const segment = segments.find((item) => {
    const start = Number(item.start_ms ?? Number(item.start || 0) * 1000)
    const end = Number(item.end_ms ?? Number(item.end || 0) * 1000)
    return currentTimeMs >= start && currentTimeMs < end
  })
  if (!segment) return null

  const allCharacters = Array.isArray(project?.char_timings) ? project.char_timings : []
  const charStart = Number.isFinite(Number(segment.char_start)) ? Number(segment.char_start) : null
  const charEnd = Number.isFinite(Number(segment.char_end)) ? Number(segment.char_end) : null
  const characters = allCharacters.length > 0
    ? allCharacters.filter((character) => {
        const index = Number(character.index)
        if (charStart !== null && index < charStart) return false
        if (charEnd !== null && index > charEnd) return false
        return true
      })
    : String(segment.text || segment.content || '').split('').map((char, index) => ({ char, index }))
  if (!characters.length) return null

  const activeCharacter = allCharacters.find((character) => {
    const start = Number(character.start_ms ?? Number(character.start || 0) * 1000)
    const end = Number(character.end_ms ?? Number(character.end || 0) * 1000)
    return currentTimeMs >= start && currentTimeMs < end
  })
  return {
    chars: characters.map((character) => ({
      ...character,
      char: character.char ?? character.text ?? '',
      active: activeCharacter ? Number(character.index) === Number(activeCharacter.index) : false,
    })),
  }
}

/**
 * 字幕预览层。位置/字号/颜色/背景/描边全部由共享的字幕配置驱动，
 * 与 GlobalParamsVisualEditor 预览、nativeCompose 成片共用同一套换算公式。
 */
function SubtitleLayer({ subtitle, subtitleConfig, frameSize }) {
  const baseStyle = useMemo(
    () => computeSubtitlePreviewStyle(subtitleConfig, frameSize),
    [subtitleConfig, frameSize],
  )
  const activeStyle = useMemo(
    () => getActiveSubtitleStyle(subtitleConfig, frameSize),
    [subtitleConfig, frameSize],
  )
  const lines = useMemo(
    () => splitSubtitleIntoLines(subtitle.chars, subtitleConfig.max_chars_per_line),
    [subtitle.chars, subtitleConfig.max_chars_per_line],
  )
  // 把全局索引转成"行号 + 行内位置"，渲染时按行输出 <br/> + <span>。
  const charIndexToLine = useMemo(() => {
    const map = new Map()
    lines.forEach((line, lineIndex) => {
      for (let i = line.start; i < line.end; i += 1) map.set(i, lineIndex)
    })
    return map
  }, [lines])

  return (
    <div className="advanced-preview-subtitle" style={baseStyle} aria-live="off">
      {subtitle.chars.map((character, index) => {
        const lineIndex = charIndexToLine.get(index) ?? 0
        const isFirstInLine = lineIndex > 0 && lines[lineIndex]?.start === index
        const isActive = character.active && subtitleConfig.word_by_word_highlight
        return (
          <React.Fragment key={`${character.index ?? index}-${index}`}>
            {isFirstInLine && <br />}
            <span style={isActive ? activeStyle : undefined}>{character.char}</span>
          </React.Fragment>
        )
      })}
    </div>
  )
}
