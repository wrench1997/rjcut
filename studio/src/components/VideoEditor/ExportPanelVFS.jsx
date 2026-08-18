import React, { useState, useRef, useCallback } from 'react'
import { useTimelineStore, mediaFileRegistry } from '../../stores/timelineStore'
import { Rocket, CheckCircle, AlertCircle, Settings, Download, Layers } from 'lucide-react'
import { videoEditorEngine } from '../../utils/videoEditorEngine'
import { PROJECT_FOLDERS, buildVFSPath } from '../../utils/project-structure'
import { loadSubtitleConfig, readGlobalParams } from '../../utils/subtitleConfig'
import FadeControl from './FadeControl'
import { getApiKey, getBaseUrl } from '../../api/api'

function buildComposePlan(clips, mediaFiles, sceneFilesMap) {
  const sourceClips = clips
    .filter((clip) => ['human', 'video'].includes(clip.type))
    .sort((a, b) => a.start_ms - b.start_ms)
  const sceneClips = clips
    .filter((clip) => clip.type === 'scene')
    .sort((a, b) => a.start_ms - b.start_ms)

  const segments = []
  const partFiles = []
  sourceClips.forEach((clip, index) => {
    const startMs = Math.max(0, Number(clip.start_ms) || 0)
    const durationMs = Math.max(1, Number(clip.duration_ms) || 1)
    const endMs = startMs + durationMs
    const sceneClip = sceneClips.find((candidate) => (
      candidate.start_ms <= startMs
      && candidate.start_ms + candidate.duration_ms >= endMs
    ))
    const sourceBlob = mediaFileRegistry.get(clip.mediaId)
    if (!sourceBlob) return

    const sceneMedia = sceneClip ? mediaFiles[sceneClip.mediaId] : null
    const sceneBlob = sceneClip ? mediaFileRegistry.get(sceneClip.mediaId) : null
    const scenePath = sceneMedia?.vfsPath || sceneMedia?.name || sceneClip?.scene_vfs_path || sceneClip?.scene_file || ''
    if (sceneClip && sceneBlob && scenePath && sceneFilesMap) {
      sceneFilesMap[scenePath] = sceneBlob
      if (sceneMedia?.name) sceneFilesMap[sceneMedia.name] = sceneBlob
    }

    segments.push({
      id: clip.id || `compose_segment_${index + 1}`,
      type: sceneClip && sceneBlob ? 'scene' : 'human',
      start_ms: startMs,
      end_ms: endMs,
      duration_ms: durationMs,
      start: startMs / 1000,
      end: endMs / 1000,
      duration: durationMs / 1000,
      scene_vfs_path: sceneClip && sceneBlob ? scenePath : null,
      scene_file: sceneClip && sceneBlob ? (sceneMedia?.name || scenePath) : null,
      source_segment_id: clip.source_segment_id || null,
      char_start: clip.char_start,
      char_end: clip.char_end,
    })
    partFiles.push(sourceBlob)
  })

  return {
    timeline: {
      schema: 'rjcut.advanced-compose/v1',
      duration_ms: segments.reduce((max, segment) => Math.max(max, segment.end_ms), 0),
      video_info: { width: 1080, height: 1920, fps: 30 },
      segments,
    },
    partFiles,
  }
}

function buildNativeTimelinePlan(clips, mediaFiles, totalDurationMs) {
  const visualClips = clips.filter((clip) => ['scene', 'video', 'human'].includes(clip.type))
  const audioClips = clips.filter((clip) => clip.type === 'audio')
  const boundaries = [...new Set([
    0,
    totalDurationMs,
    ...visualClips.flatMap((clip) => [clip.start_ms, clip.start_ms + clip.duration_ms]),
  ])].filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b)
  const priority = { scene: 0, video: 1, human: 2 }
  const plan = []
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    if (end <= start) continue
    const visual = visualClips
      .filter((clip) => clip.start_ms <= start && clip.start_ms + clip.duration_ms >= end)
      .sort((a, b) => (priority[a.type] ?? 99) - (priority[b.type] ?? 99))[0]
    if (!visual) {
      plan.push({ kind: 'gap', start_ms: start, duration_ms: end - start })
      continue
    }
    const media = mediaFiles[visual.mediaId]
    const audio = audioClips.find((clip) => clip.start_ms <= start && clip.start_ms + clip.duration_ms >= end)
      || visualClips.find((clip) => clip.type === 'human' && clip.start_ms <= start && clip.start_ms + clip.duration_ms >= end)
    const audioMedia = audio ? mediaFiles[audio.mediaId] : null
    plan.push({
      kind: 'media',
      id: visual.id,
      type: visual.type,
      start_ms: start,
      duration_ms: end - start,
      offset_ms: (Number(visual.offset_ms) || 0) + start - visual.start_ms,
      vfsPath: media?.vfsPath || visual.source_vfs_path || visual.scene_vfs_path,
      audioVfsPath: audioMedia?.vfsPath || audio?.source_vfs_path || '',
      audioOffsetMs: audio ? (Number(audio.offset_ms) || 0) + start - audio.start_ms : 0,
    })
  }
  return plan.filter((clip) => clip.kind === 'gap' || clip.vfsPath)
}

/**
 * 导出面板 - 将剪辑完成的视频导出并保存到 VFS
 */
/**
 * 导出面板 - 将剪辑完成的视频导出并保存到 VFS
 * 
 * @param {Object} vfs - VFS 客户端实例
 * @param {Object} props.sceneFilesMap - 场景文件映射 { scene_file_name: Blob }
 * @param {Function} props.onTranscribeRequest - 请求后端字幕识别的回调
 */
export default function ExportPanelVFS({ 
  vfs, 
  sceneFilesMap = {},
  onTranscribeRequest = null,
  onExportComplete = null
}) {
  const { clips, mediaFiles, totalDuration_ms, fps, width, height } = useTimelineStore((snapshot) => ({
    clips: snapshot.clips,
    mediaFiles: snapshot.mediaFiles,
    totalDuration_ms: snapshot.totalDuration_ms,
    fps: snapshot.fps,
    width: snapshot.width,
    height: snapshot.height,
  }))
  const [status, setStatus] = useState('idle') // idle, processing, complete, error
  const [progress, setProgress] = useState(0)
  const [exportSettings, setExportSettings] = useState({
    format: 'mp4',
    quality: 'high',
    fps: 30,
  })
  const [errorMessage, setErrorMessage] = useState('')
  const workerRef = useRef(null)
  
  // 🚨 大视频检测：超过 100MB 建议降级到后端处理
  const MAX_WASM_VIDEO_SIZE_MB = 100
  const totalVideoSizeMB = Object.values(mediaFiles).reduce((sum, f) => sum + (f.size || 0), 0) / 1024 / 1024
  const isLargeVideo = totalVideoSizeMB > MAX_WASM_VIDEO_SIZE_MB

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
      // 🎨 成片全局参数：读取当前生效的全部全局参数（含模板混剪字体配置等），
      // 稍后整体落盘到旁车 JSON，供二次加工进入高级剪辑时整体还原。
      const subtitleConfig = loadSubtitleConfig()
      const globalParams = readGlobalParams()
      const sourceVideoVfsPaths = [...new Set(
        clips
          .filter((c) => ['human', 'video'].includes(c.type))
          .map((c) => mediaFiles[c.mediaId]?.vfsPath)
          .filter(Boolean)
      )]
      const primarySourceVideoVfsPath = sourceVideoVfsPaths[0] || ''

      // EXE 主路径使用打包内置 FFmpeg，普通视频和数字人视频统一走真实导出。
      // 旧 Web Worker 的普通视频分支只会生成占位文本，不能作为产品导出链路。
      if (typeof window !== 'undefined' && window.electronAPI?.nativeTimelineExport) {
        const projectRoot = primarySourceVideoVfsPath
          ? `/${primarySourceVideoVfsPath.split('/').filter(Boolean)[0]}`
          : '/默认项目'
        const outputDir = `${projectRoot}/${PROJECT_FOLDERS.OUTPUT}`
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        const savePath = `${outputDir}/高级剪辑_${timestamp}.mp4`
        const nativeClips = buildNativeTimelinePlan(clips, mediaFiles, totalDuration_ms)
        if (!nativeClips.some((clip) => clip.kind === 'media')) throw new Error('时间轴没有可导出的视频画面')
        await vfs.mkdir(outputDir, true)
        setProgress(8)
        const result = await window.electronAPI.nativeTimelineExport({
          outputPath: savePath,
          clips: nativeClips,
          quality: exportSettings.quality === 'ultra' ? 'quality' : exportSettings.quality === 'low' ? 'performance' : 'balanced',
          subtitle: subtitleConfig,
          subtitleClips: clips.filter((clip) => clip.type === 'subtitle').map((clip) => {
            const sourceTimings = Array.isArray(clip.char_timings) ? clip.char_timings : []
            const sourceAnchor = Number(sourceTimings[0]?.start_ms ?? Number(sourceTimings[0]?.start || 0) * 1000) || 0
            return {
              ...clip,
              char_timings: sourceTimings.map((character, index) => {
                const sourceStart = Number(character.start_ms ?? Number(character.start || 0) * 1000)
                const sourceEnd = Number(character.end_ms ?? Number(character.end || 0) * 1000)
                const relocatedStart = clip.start_ms + Math.max(0, sourceStart - sourceAnchor)
                return {
                  ...character,
                  index: index + (Number.isFinite(Number(clip.char_start)) ? Number(clip.char_start) : 0),
                  start_ms: relocatedStart,
                  end_ms: Math.min(clip.start_ms + clip.duration_ms, relocatedStart + Math.max(1, sourceEnd - sourceStart)),
                }
              }),
            }
          }),
        })
        if (!result?.size || result.size < 1024) throw new Error('导出文件为空或过小')

        const projectJson = {
          schema: 'rjcut.editor-project/v1',
          saved_at: new Date().toISOString(),
          output_video_vfs_path: savePath,
          source_video_vfs_path: primarySourceVideoVfsPath,
          canvas: { width, height, fps: exportSettings.fps },
          duration_ms: totalDuration_ms,
          clips: clips.map((clip) => ({
            ...clip,
            media_vfs_path: mediaFiles[clip.mediaId]?.vfsPath || clip.source_vfs_path || clip.scene_vfs_path || '',
            media_name: mediaFiles[clip.mediaId]?.name || '',
          })),
          subtitle: subtitleConfig,
          global_params: globalParams,
        }
        const stem = savePath.replace(/\.[^./\\]+$/u, '')
        await vfs.writeFile(`${stem}.timeline.json`, new TextEncoder().encode(JSON.stringify(projectJson, null, 2)))
        await vfs.writeFile(`${stem}.rjcut-global.json`, new TextEncoder().encode(JSON.stringify({
          schema: 'rjcut.export-global/v1',
          generated_at: new Date().toISOString(),
          global_params: globalParams,
          source_video_vfs_path: primarySourceVideoVfsPath,
        }, null, 2)))
        if (onExportComplete) await onExportComplete({ savePath, primarySourceVideoVfsPath, projectJson })
        setStatus('complete')
        setProgress(100)
        alert(`视频和可继续编辑的工程 JSON 已保存：\n${savePath}\n${stem}.timeline.json`)
        return
      }

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

          // 🎨 把本成片使用的全部全局参数落盘到旁车 JSON（<成片名>.rjcut-global.json），
          // 供二次加工进入高级剪辑时整体还原同一套全局参数（含模板混剪字体配置等）。
          try {
            const stem = savePath.replace(/\.[^./\\]+$/u, '')
            const globalConfigPath = `${stem}.rjcut-global.json`
            const globalConfig = {
              schema: 'rjcut.export-global/v1',
              generated_at: new Date().toISOString(),
              global_params: globalParams,
              source_video_vfs_path: primarySourceVideoVfsPath,
            }
            await vfs.writeFile(globalConfigPath, new TextEncoder().encode(JSON.stringify(globalConfig, null, 2)))
          } catch (globalErr) {
            console.warn('[ExportPanelVFS] 全局参数 JSON 写入失败（不影响成片）:', globalErr)
          }

          // 🎨 通知父组件（高级剪辑）随导出一起把"加工后的项目数据"也落盘到 JSON，
          // 使点一次"导出视频"即同时完成：重新生成视频 + 保存加工后数据，便于下一轮二次加工。
          if (onExportComplete) {
            try {
              await onExportComplete({ savePath, primarySourceVideoVfsPath })
            } catch (cbErr) {
              console.warn('[ExportPanelVFS] onExportComplete 回调异常（不影响成片）:', cbErr)
            }
          }

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

      // 🚀 核心改造：使用 composeFromTimeline 模式进行数字人视频合成
      // 检测是否包含 human/scene 类型的 clips（数字人模式）
      const hasHumanOrSceneClips = clips.some(c => c.type === 'human' || c.type === 'scene')
      
      // 🚨 大视频检测：如果视频太大，建议降级到后端处理
      if (isLargeVideo) {
        const confirmBackend = window.confirm(
          `⚠️ 警告：视频文件较大 (${totalVideoSizeMB.toFixed(1)}MB)，可能超出浏览器处理能力。\n\n` +
          `建议：使用后端进行处理（需要服务器支持）\n\n` +
          `点击"确定"继续尝试前端处理，点击"取消"中止导出。`
        )
        
        if (!confirmBackend) {
          setStatus('error')
          setErrorMessage('用户取消导出 - 视频文件过大')
          return
        }
      }
      
      if (hasHumanOrSceneClips) {
        // 数字人视频合成模式（对应 lip_sync.py）
        const composePlan = buildComposePlan(clips, mediaFiles, sceneFilesMap)
        if (!composePlan.timeline.segments.length || composePlan.partFiles.length !== composePlan.timeline.segments.length) {
          throw new Error('没有找到可连续合成的源视频片段')
        }
        console.log('[ExportPanelVFS] 使用 composeFromTimeline 模式', {
          segmentCount: composePlan.timeline.segments.length,
          sceneFilesCount: Object.keys(sceneFilesMap).length
        })

        // 🎨 字幕配置：复用上面已读取的 subtitleConfig（与模板混剪共用同一份
        // DEFAULT_SUBTITLE_CONFIG，保证传统剪辑导出与模板混剪成片完全一致）。

        worker.postMessage({
          type: 'composeFromTimeline',
          timeline: composePlan.timeline,
          partFiles: composePlan.partFiles,
          sceneFiles: sceneFilesMap, // 🎬 使用父组件传入的场景文件
          options: {
            useTransitions: false,
            transitionType: 'fade',
            transitionDuration: 0.5,
            resyncSubtitle: true,
            subtitle: subtitleConfig, // 🎨 传递完整字幕配置
          }
        })
      } else {
        // 标准导出模式
        worker.postMessage({
          type: 'export',
          timeline: timeline,
          exportConfig: exportConfig,
          mediaBlobs: mediaBlobs,
          ffmpegArgs: ffmpegArgs,
        })
      }

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
