import { normalizeTemplateTimeline } from './templateTimeline.js'
import { loadSubtitleConfig } from '../../utils/subtitleConfig.js'

function decodeJsonBytes(raw) {
  if (typeof raw === 'string') return JSON.parse(raw)
  return JSON.parse(new TextDecoder().decode(raw))
}

async function ensureDirectory(vfs, path) {
  if (!path) return
  try {
    if (await vfs.exists(path)) return
  } catch (_) {}
  if (typeof vfs.mkdir === 'function') {
    await vfs.mkdir(path, true)
    return
  }
  if (typeof vfs.createDirectory === 'function') {
    await vfs.createDirectory(path, true)
    return
  }
  throw new Error(`VFS 不支持创建目录：${path}`)
}

function dirname(path) {
  const parts = String(path || '').split('/')
  parts.pop()
  return parts.join('/') || '/'
}

export async function renderLocalTemplateTask(task, vfs, onProgress = () => {}) {
  if (!task?.vfsVideoPath) throw new Error('任务缺少数字人视频路径')
  if (!task?.vfsTimelinePath && !task?.vfsScriptPath) throw new Error('任务缺少 timeline.json 路径')
  if (!task?.outputPath) throw new Error('任务缺少唯一 outputPath')

  const timelinePath = task.vfsTimelinePath || task.vfsScriptPath
  const timeline = normalizeTemplateTimeline(decodeJsonBytes(await vfs.readFile(timelinePath)))
  await ensureDirectory(vfs, dirname(task.outputPath))
  const quality = task.globalParams?.pipeline?.render_quality || 'balanced'
  if (typeof window !== 'undefined' && window.electronAPI?.nativeCompose) {
    onProgress(10, '原生 FFmpeg 后台合成')
    // 字幕样式以 rjcut_global_params_v1 为唯一来源（与高级剪辑预览、模板混剪
    // 抽屉里 GlobalParamsVisualEditor 看到的值保持一致）。draft 里的 subtitle
    // 字段仅作为兜底，作用是兼容老任务（task 仍带旧 draft 的 globalParams，
    // 且 localStorage 可能还没迁移）。如果两个源都有值，localStorage 优先。
    const subtitleFromStorage = loadSubtitleConfig()
    const draftSubtitle = task.globalParams?.subtitle
    const hasDraftSubtitle = draftSubtitle && Object.keys(draftSubtitle).length > 0
    const mergedSubtitle = hasDraftSubtitle
      ? { ...draftSubtitle, ...subtitleFromStorage }
      : subtitleFromStorage
    await window.electronAPI.nativeCompose({ videoPath: task.vfsVideoPath, outputPath: task.outputPath, timeline, quality, subtitle: mergedSubtitle })
    onProgress(100, '原生合成完成')
    return { outputPath: task.outputPath, renderReportPath: '', outputBytes: 0, transitionCount: timeline.segments.filter((item) => item.type === 'scene').length }
  }
  onProgress(5, '读取数字人视频')

  const digitalHumanBlob = await vfs.readFileAsBlob(task.vfsVideoPath)
  if (!(digitalHumanBlob instanceof Blob) || digitalHumanBlob.size <= 0) {
    throw new Error(`数字人视频读取失败：${task.vfsVideoPath}`)
  }

  const { videoEditorEngine } = await import('../../utils/videoEditorEngine.js')
  await videoEditorEngine.initialize()
  videoEditorEngine.setProgressCallback((value) => {
    const normalized = Math.max(0, Math.min(1, Number(value) || 0))
    onProgress(10 + Math.round(normalized * 70), '本地 FFmpeg 合成')
  })

  onProgress(10, '按字级时间轴裁切')
  const ranges = timeline.segments.map((segment, index) => ({
    start: segment.start,
    end: segment.end,
    label: segment.id || `segment_${index + 1}`,
  }))
  const videoInfo = timeline.video_info || {}
  const cutParts = await videoEditorEngine.cutVideoSegments(
    digitalHumanBlob,
    ranges,
    videoInfo.width || 1080,
    videoInfo.height || 1920,
    videoInfo.fps || 30,
  )
  const partFiles = cutParts.map((item) => item.blob)

  onProgress(45, '读取场景素材')
  const sceneFiles = {}
  for (const segment of timeline.segments) {
    if (segment.type !== 'scene') continue
    const path = segment.scene_vfs_path || segment.scene_file
    if (!path) throw new Error(`场景段 ${segment.id || ''} 没有绑定素材`)
    if (!sceneFiles[path]) {
      sceneFiles[path] = await vfs.readFileAsBlob(path)
    }
    if (segment.scene_file) sceneFiles[segment.scene_file] = sceneFiles[path]
  }

  let bgmFile = null
  if (task.vfsBgmPath) {
    try {
      bgmFile = await vfs.readFileAsBlob(task.vfsBgmPath)
    } catch (error) {
      console.warn('[localTemplateRenderer] BGM 读取失败，将忽略:', error)
    }
  }

  onProgress(60, '合并画面和原音频')
  const pipeline = task.globalParams?.pipeline || {}
  const resultBlob = await videoEditorEngine.composeFromTimeline(
    timeline,
    partFiles,
    sceneFiles,
    {
      useTransitions: pipeline.use_transitions ?? false,
      transitionType: pipeline.transition_type || 'fade',
      transitionDuration: pipeline.transition_duration ?? 0.5,
      renderQuality: pipeline.render_quality || 'balanced',
      bgmFile,
      bgmVolume: task.audioConfig?.bgmVolume ?? 0.3,
      originalVolume: task.audioConfig?.originalVolume ?? 1.0,
    },
  )

  if (!(resultBlob instanceof Blob) || resultBlob.size <= 0) {
    throw new Error('本地合成返回了空视频')
  }

  onProgress(92, '保存本次独立输出')
  await vfs.writeFile(
    task.outputPath,
    new Uint8Array(await resultBlob.arrayBuffer()),
    { type: resultBlob.type || 'video/mp4' },
  )

  const report = {
    schema: 'rjcut.template-render-report/v1',
    run_id: task.runId,
    task_id: task.id,
    rendered_at: new Date().toISOString(),
    source_video: task.vfsVideoPath,
    source_project: task.vfsProjectPath || '',
    timeline_path: timelinePath,
    output_path: task.outputPath,
    output_bytes: resultBlob.size,
    transition_clips: timeline.transition_clips || timeline.clips?.filter((clip) => clip.type === 'scene') || [],
  }
  if (task.renderReportPath) {
    await vfs.writeFile(
      task.renderReportPath,
      new TextEncoder().encode(JSON.stringify(report, null, 2)),
      { type: 'application/json' },
    )
  }

  onProgress(100, '完成')
  return {
    outputPath: task.outputPath,
    renderReportPath: task.renderReportPath || '',
    outputBytes: resultBlob.size,
    transitionCount: report.transition_clips.length,
  }
}
