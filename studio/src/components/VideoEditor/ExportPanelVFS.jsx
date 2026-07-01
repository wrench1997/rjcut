import React, { useState, useRef, useCallback } from 'react'
import { useTimelineStore, mediaFileRegistry } from '../../stores/timelineStore'
import { Rocket, CheckCircle, AlertCircle, Settings, Download, Layers } from 'lucide-react'
import { videoEditorEngine } from '../../utils/videoEditorEngine'
import { PROJECT_FOLDERS, buildVFSPath } from '../../utils/project-structure'
import FadeControl from './FadeControl'

/**
 * 导出面板 - 将剪辑完成的视频导出并保存到 VFS
 */
export default function ExportPanelVFS({ vfs }) {
  const { clips, mediaFiles, totalDuration_ms, fps, width, height } = useTimelineStore()
  const [status, setStatus] = useState('idle') // idle, processing, complete, error
  const [progress, setProgress] = useState(0)
  const [exportSettings, setExportSettings] = useState({
    format: 'mp4',
    quality: 'high',
    fps: 30,
  })
  const [errorMessage, setErrorMessage] = useState('')
  const workerRef = useRef(null)

  // 预估文件大小
  const estimateFileSize = useCallback(() => {
    const durationSec = totalDuration_ms / 1000
    const bitrates = {
      low: 2000,
      medium: 5000,
      high: 8000,
      ultra: 15000,
    }
    const bitrate = bitrates[exportSettings.quality] || 5000
    const sizeBits = durationSec * bitrate * 1000
    const sizeMB = sizeBits / 8 / 1024 / 1024
    return sizeMB.toFixed(1)
  }, [totalDuration_ms, exportSettings.quality])

  // 导出处理
  const handleExport = async () => {
    if (clips.length === 0) {
      setErrorMessage('时间轴为空，无法导出')
      return
    }

    setStatus('processing')
    setProgress(0)
    setErrorMessage('')

    try {
      // 获取所有需要的媒体文件
      const requiredMediaIds = [...new Set(clips.map(c => c.mediaId))]
      const mediaBlobs = {}
      
      for (const id of requiredMediaIds) {
        const blob = mediaFileRegistry.get(id)
        if (!blob) {
          throw new Error(`媒体文件丢失：${id}`)
        }
        mediaBlobs[id] = blob
      }

      // 创建时间轴
      const timeline = videoEditorEngine.createTimeline(fps, width, height)
      
      // 添加轨道
      const videoTracks = [...new Set(clips.filter(c => c.type === 'video').map(c => c.track))]
      const audioTracks = [...new Set(clips.filter(c => c.type === 'audio').map(c => c.track))]
      
      videoTracks.forEach(trackId => {
        timeline.add_track(trackId, '视频轨道', videoEditorEngine.VideoEngine.TrackType.Video)
      })
      audioTracks.forEach(trackId => {
        timeline.add_track(trackId, '音频轨道', videoEditorEngine.VideoEngine.TrackType.Audio)
      })

      // 添加 Clips
      clips.forEach(clip => {
        const media = mediaFiles[clip.mediaId]
        if (!media) return

        const clipObj = videoEditorEngine.createClip(
          clip.id,
          clip.start_ms,
          clip.duration_ms,
          clip.offset_ms,
          clip.duration_ms,
          clip.type,
          clip.track,
          media.name
        )
        timeline.add_clip(clipObj)
      })

      // 创建导出配置
      const exportConfig = videoEditorEngine.createExportConfig(
        exportSettings.format,
        exportSettings.quality,
        exportSettings.fps,
        0,
        totalDuration_ms
      )

      // 构建 FFmpeg 命令
      const ffmpegArgsJson = exportConfig.build_ffmpeg_args('input.mp4', 'output.mp4')
      const ffmpegArgs = JSON.parse(ffmpegArgsJson)

      // 使用 Web Worker 处理（避免阻塞 UI）
      if (!workerRef.current) {
        workerRef.current = new Worker(new URL('../../workers/exportWorker.js', import.meta.url), { type: 'module' })
      }

      const worker = workerRef.current
      
      worker.onmessage = async (e) => {
        const { type, payload } = e.data
        
        if (type === 'progress') {
          setProgress(Math.round(payload.percent || 0))
        } else if (type === 'complete') {
          // 🚀 核心改造：获取导出的 Blob 数据
          const blob = new Blob([payload.data], { type: 'video/mp4' })
          
          // 生成保存路径 - 使用统一的项目结构模块
          // 注意：导出面板需要知道当前项目路径，这里使用默认的项目输出目录
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
          // TODO: 应该从父组件获取当前项目路径，这里暂时使用默认路径
          const projectName = '默认项目' // 需要从父组件传入
          const savePath = buildVFSPath(projectName, `${PROJECT_FOLDERS.OUTPUT}/export_${timestamp}.mp4`)
          
          // 写入 rjcut 的 VFS
          await vfs.writeFile(savePath, blob)
          
          setStatus('complete')
          setProgress(100)
          
          // 通知用户
          alert(`🎉 视频已成功导出到项目目录:\n${savePath}\n\n您可以前往"文件浏览"查看或使用。`)
        } else if (type === 'error') {
          setStatus('error')
          setErrorMessage(payload.message || '导出失败')
        }
      }

      worker.onerror = (e) => {
        console.error('[ExportPanelVFS] Worker error:', e)
        setStatus('error')
        setErrorMessage(`Worker 错误：${e.message}`)
      }

      // 发送数据到 Worker
      worker.postMessage({
        type: 'export',
        timeline: timeline,
        exportConfig: exportConfig,
        mediaBlobs: mediaBlobs,
        ffmpegArgs: ffmpegArgs,
      })

    } catch (err) {
      console.error('[ExportPanelVFS] 导出失败:', err)
      setStatus('error')
      setErrorMessage(err.message || '导出过程中发生错误')
    }
  }

  // 清理 Worker
  React.useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate()
      }
    }
  }, [])

  return (
    <div className="flex flex-col h-full p-0 bg-slate-900/50 overflow-hidden">
      {/* 可滚动内容区 */}
      <div className="flex-1 overflow-y-auto">
        {/* 淡入淡出控制 */}
        <FadeControl />
        
        <div className="p-4 border-t border-slate-800">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
            <Settings size={14} />
            输出设置
          </h3>
      
      {/* 格式选择 */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">格式</label>
          <select 
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            value={exportSettings.format}
            onChange={(e) => setExportSettings({ ...exportSettings, format: e.target.value })}
            disabled={status === 'processing'}
          >
            <option value="mp4">MP4 (H.264)</option>
            <option value="webm">WebM (VP9)</option>
            <option value="gif">GIF (动图)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">质量</label>
          <select 
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            value={exportSettings.quality}
            onChange={(e) => setExportSettings({ ...exportSettings, quality: e.target.value })}
            disabled={status === 'processing'}
          >
            <option value="low">低 (2 Mbps)</option>
            <option value="medium">中 (5 Mbps)</option>
            <option value="high">高 (8 Mbps)</option>
            <option value="ultra">超高 (15 Mbps)</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-1">帧率</label>
          <select 
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            value={exportSettings.fps}
            onChange={(e) => setExportSettings({ ...exportSettings, fps: parseInt(e.target.value) })}
            disabled={status === 'processing'}
          >
            <option value={24}>24 FPS (电影)</option>
            <option value={30}>30 FPS (电视)</option>
            <option value={60}>60 FPS (高帧率)</option>
          </select>
        </div>
      </div>

      {/* 预估信息 */}
      <div className="bg-slate-800/50 p-3 rounded text-xs space-y-2 mb-4">
        <div className="flex justify-between">
          <span className="text-slate-400">片段数量</span> 
          <span className="text-slate-200">{clips.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">预估时长</span> 
          <span className="text-slate-200">{(totalDuration_ms / 1000).toFixed(1)} 秒</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">分辨率</span> 
          <span className="text-slate-200">{width}x{height}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">预估大小</span> 
          <span className="text-blue-400">{estimateFileSize()} MB</span>
        </div>
        <div className="flex justify-between border-t border-slate-700 pt-2">
          <span className="text-slate-400">保存路径</span> 
          <span className="text-green-400">VFS /output/</span>
        </div>
      </div>

      {/* 进度显示 */}
      {status === 'processing' && (
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-2">
            <span className="text-slate-400">合成中...</span> 
            <span className="text-blue-400">{progress}%</span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-gradient-to-r from-blue-600 to-blue-400 h-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {status === 'error' && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded flex items-start gap-2">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{errorMessage}</p>
        </div>
      )}

      {/* 成功信息 */}
      {status === 'complete' && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded flex items-center gap-2">
          <CheckCircle size={16} className="text-green-400" />
          <p className="text-xs text-green-300">导出完成！</p>
        </div>
      )}

      {/* 导出按钮 */}
          <button 
            onClick={handleExport}
            disabled={status === 'processing' || totalDuration_ms <= 0 || clips.length === 0}
            className={`w-full py-3 rounded font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              status === 'complete'
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : status === 'processing'
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : totalDuration_ms <= 0 || clips.length === 0
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {status === 'complete' ? (
              <>
                <CheckCircle size={16} />
                再次导出
              </>
            ) : status === 'processing' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                处理中...
              </>
            ) : (
              <>
                <Rocket size={16} />
                开始导出到项目
              </>
            )}
          </button>

          {/* 禁用提示 */}
          {(totalDuration_ms <= 0 || clips.length === 0) && status !== 'processing' && (
            <p className="text-xs text-slate-500 text-center mt-2">
              请在时间轴中添加素材后导出
            </p>
          )}
        </div>
      </div>
    </div>
  )
}