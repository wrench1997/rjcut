import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  Clapperboard,
  FolderOpen,
  ImagePlus,
  LoaderCircle,
  Play,
  RefreshCw,
  Sparkles,
  WandSparkles,
} from 'lucide-react'

import {
  createTextToVideoTask,
  downloadTaskFileContent,
  getTaskStatus,
  getTextToVideoHealth,
  relayUpload,
} from '../api/api'
import { PROJECT_FOLDERS } from '../utils/project-structure'

const ACTIVE_TASK_KEY = 'rjcut_h3_active_task_v1'
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'timeout'])
const RATIOS = [
  { value: '9:16', label: '竖屏 9:16', hint: '768 × 1344', width: 18, height: 32 },
  { value: '16:9', label: '横屏 16:9', hint: '1344 × 768', width: 32, height: 18 },
  { value: '1:1', label: '方形 1:1', hint: '768 × 768', width: 24, height: 24 },
]
const SUPPORTED_RATIOS = new Set(RATIOS.map((ratio) => ratio.value))
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_FRAME_BYTES = 20 * 1024 * 1024
const POLL_INTERVAL_MS = 3000
const MAX_POLL_BACKOFF_MS = 30000

function readActiveTaskSnapshot() {
  if (typeof window === 'undefined') return null
  try {
    const value = JSON.parse(window.localStorage.getItem(ACTIVE_TASK_KEY) || 'null')
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function unwrap(response) {
  return response?.data?.data ?? response?.data ?? response
}

function safeProjectPath(project) {
  return String(project?.path || '').replace(/\/$/, '')
}

function taskLabel(task) {
  const labels = {
    queued: '等待生成资源',
    submitting: '正在提交任务',
    queued_upstream: '生成任务已排队',
    generating: '正在生成视频',
    downloading: '正在接收成片',
    uploading: '正在保存到系统',
    finished: '生成完成',
    failed: '生成失败',
    cancelled: '任务已取消',
    timeout: '任务超时',
  }
  return labels[task?.stage] || labels[task?.status] || '准备生成'
}

export default function TextToVideoStudio({ vfs, onNavigateToFiles }) {
  const restoredSnapshotRef = useRef(null)
  if (restoredSnapshotRef.current === null) {
    restoredSnapshotRef.current = readActiveTaskSnapshot() || {}
  }
  const restoredSnapshot = restoredSnapshotRef.current
  const restoredRatio = SUPPORTED_RATIOS.has(restoredSnapshot.aspectRatio)
    ? restoredSnapshot.aspectRatio
    : '9:16'
  const [generationMode, setGenerationMode] = useState(restoredSnapshot.generationMode || 'text_to_video')
  const [imagePromptMode, setImagePromptMode] = useState(restoredSnapshot.imagePromptMode || 'image_with_text')
  const [prompt, setPrompt] = useState(() => String(restoredSnapshot.prompt || ''))
  const [aspectRatio, setAspectRatio] = useState(restoredRatio)
  const [seconds, setSeconds] = useState(() => Number(restoredSnapshot.seconds) || 6)
  const [steps, setSteps] = useState(() => Number(restoredSnapshot.steps) || 50)
  const [seed, setSeed] = useState(42)
  const [projects, setProjects] = useState([])
  const [selectedProjectPath, setSelectedProjectPath] = useState('')
  const [task, setTask] = useState(() => restoredSnapshot.taskId
    ? { task_id: restoredSnapshot.taskId, status: 'queued', stage: 'queued', progress: 0 }
    : null)
  const [health, setHealth] = useState('checking')
  const [error, setError] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [savedPath, setSavedPath] = useState(() => String(restoredSnapshot.savedPath || ''))
  const [firstFrame, setFirstFrame] = useState(null)
  const [lastFrame, setLastFrame] = useState(null)
  const [firstFrameUrl, setFirstFrameUrl] = useState('')
  const [lastFrameUrl, setLastFrameUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pollWarning, setPollWarning] = useState('')
  const importingRef = useRef(new Set())
  const pollFailuresRef = useRef(0)
  const promptDirtyRef = useRef(false)
  const promptComposingRef = useRef(false)

  const selectedProject = useMemo(
    () => projects.find((item) => safeProjectPath(item) === selectedProjectPath) || null,
    [projects, selectedProjectPath],
  )
  const destination = selectedProjectPath
    ? `${selectedProjectPath}/${PROJECT_FOLDERS.EDITED_VIDEO}`
    : '请先选择项目'

  useEffect(() => {
    let disposed = false
    const loadProjects = async () => {
      try {
        const nextProjects = await vfs?.getVideoProjects?.() || []
        if (disposed) return
        setProjects(nextProjects)
        const restoredPath = String(restoredSnapshot.projectPath || '')
        setSelectedProjectPath(
          nextProjects.some((item) => safeProjectPath(item) === restoredPath)
            ? restoredPath
            : safeProjectPath(nextProjects[0]),
        )
      } catch {
        if (!disposed) setProjects([])
      }
    }
    const checkHealth = async () => {
      try {
        await getTextToVideoHealth({ timeout: 8000 })
        if (!disposed) setHealth('online')
      } catch {
        if (!disposed) setHealth('offline')
      }
    }
    loadProjects()
    checkHealth()
    return () => { disposed = true }
  }, [restoredSnapshot, vfs])

  const updatePrompt = (value) => {
    promptDirtyRef.current = true
    setPrompt(promptComposingRef.current ? value : value.slice(0, 4000))
  }

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => () => {
    if (firstFrameUrl) URL.revokeObjectURL(firstFrameUrl)
    if (lastFrameUrl) URL.revokeObjectURL(lastFrameUrl)
  }, [firstFrameUrl, lastFrameUrl])

  const selectFrame = (file, position) => {
    if (!file) return
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      setError('首尾帧仅支持 JPEG、PNG 或 WebP 图片')
      return
    }
    if (file.size > MAX_FRAME_BYTES) {
      setError('单张首尾帧图片不能超过 20MB')
      return
    }
    setError('')
    const nextUrl = URL.createObjectURL(file)
    if (position === 'first') {
      if (firstFrameUrl) URL.revokeObjectURL(firstFrameUrl)
      setFirstFrame(file)
      setFirstFrameUrl(nextUrl)
    } else {
      if (lastFrameUrl) URL.revokeObjectURL(lastFrameUrl)
      setLastFrame(file)
      setLastFrameUrl(nextUrl)
    }
  }

  const switchMode = (mode) => {
    setGenerationMode(mode)
    if (mode === 'image_to_video') setImagePromptMode('image_with_text')
    setAspectRatio((current) => SUPPORTED_RATIOS.has(current) ? current : '9:16')
    setError('')
  }

  const downloadAndImport = useCallback(async (completedTask) => {
    const taskId = completedTask?.task_id
    if (!taskId || importingRef.current.has(taskId)) return
    importingRef.current.add(taskId)
    try {
      const stored = JSON.parse(localStorage.getItem(ACTIVE_TASK_KEY) || 'null')
      if (stored?.taskId === taskId && stored?.savedPath) {
        setSavedPath(stored.savedPath)
        return
      }
      const projectPath = stored?.taskId === taskId ? stored?.projectPath : selectedProjectPath
      if (!projectPath) throw new Error('任务已完成，但没有可导入的项目路径')
      const response = await downloadTaskFileContent(taskId, 'final_video')
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'video/mp4' })
      if (blob.size < 1024) throw new Error('下载的视频文件为空或过小')
      const objectUrl = URL.createObjectURL(blob)
      setPreviewUrl((oldUrl) => {
        if (oldUrl) URL.revokeObjectURL(oldUrl)
        return objectUrl
      })
      const outputDir = `${projectPath}/${PROJECT_FOLDERS.EDITED_VIDEO}`
      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
      const storedMode = stored?.taskId === taskId ? stored?.generationMode : generationMode
      const storedImagePromptMode = stored?.taskId === taskId ? stored?.imagePromptMode : imagePromptMode
      const modeLabel = storedMode === 'image_to_video'
        ? (storedImagePromptMode === 'image_with_text' ? '图片加文字生成' : '图片生成')
        : '文生视频'
      const outputPath = `${outputDir}/AI_${modeLabel}_${stamp}_${taskId.slice(-6)}.mp4`
      await vfs.mkdir(outputDir, true)
      await vfs.writeFile(outputPath, await blob.arrayBuffer(), {
        type: blob.type || 'video/mp4',
        metadata: {
          source: storedMode === 'image_to_video' ? 'h3_image_to_video' : 'h3_text_to_video',
          generation_mode: storedMode,
          image_prompt_mode: storedImagePromptMode,
          task_id: taskId,
          prompt: stored?.prompt || prompt,
          aspect_ratio: stored?.aspectRatio || aspectRatio,
          seconds: stored?.seconds || seconds,
          num_inference_steps: stored?.steps || steps,
        },
      })
      setSavedPath(outputPath)
      localStorage.setItem(ACTIVE_TASK_KEY, JSON.stringify({
        ...(stored || {}),
        taskId,
        projectPath,
        savedPath: outputPath,
        generationMode: storedMode,
        imagePromptMode: storedImagePromptMode,
      }))
    } catch (importError) {
      setError(`视频已生成，但导入 VFS 失败：${importError.message}`)
      importingRef.current.delete(taskId)
    }
  }, [aspectRatio, generationMode, imagePromptMode, prompt, seconds, selectedProjectPath, steps, vfs])

  useEffect(() => {
    if (!task?.task_id || TERMINAL_STATUSES.has(task.status)) {
      if (task?.status === 'succeeded' && !savedPath) downloadAndImport(task)
      return undefined
    }
    let disposed = false
    let timer = null
    const poll = async () => {
      try {
        const detail = unwrap(await getTaskStatus(task.task_id))
        if (disposed) return
        pollFailuresRef.current = 0
        setPollWarning('')
        setTask(detail)
        if (detail.status === 'succeeded') await downloadAndImport(detail)
        if (detail.status === 'failed' || detail.status === 'timeout') {
          setError(detail.error || '视频生成失败')
        }
        if (!TERMINAL_STATUSES.has(detail.status)) timer = window.setTimeout(poll, POLL_INTERVAL_MS)
      } catch (pollError) {
        if (!disposed) {
          pollFailuresRef.current += 1
          const retryCount = pollFailuresRef.current
          const retryDelay = Math.min(
            MAX_POLL_BACKOFF_MS,
            POLL_INTERVAL_MS * (2 ** Math.min(retryCount - 1, 3)),
          )
          setPollWarning(`公网连接短暂波动，正在自动重连（第 ${retryCount} 次）`)
          timer = window.setTimeout(poll, retryDelay)
        }
      }
    }
    poll()
    return () => {
      disposed = true
      if (timer) window.clearTimeout(timer)
    }
  }, [downloadAndImport, savedPath, task?.status, task?.task_id])

  const startGenerate = async () => {
    const cleanPrompt = prompt.trim()
    if (!cleanPrompt) return setError(generationMode === 'image_to_video' ? '请描述图片中希望发生的动作' : '请先描述你想生成的视频画面')
    if (generationMode === 'image_to_video' && !firstFrame) return setError('图生视频必须选择首帧图片')
    if (!selectedProject) return setError('请先选择成片要导入的项目')
    setError('')
    setPollWarning('')
    pollFailuresRef.current = 0
    setSavedPath('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setSubmitting(true)
    try {
      let firstFrameOssKey = null
      let lastFrameOssKey = null
      if (generationMode === 'image_to_video') {
        const firstUpload = unwrap(await relayUpload(firstFrame, firstFrame.name, 'h3_first_frame'))
        firstFrameOssKey = firstUpload?.oss_key
        if (!firstFrameOssKey) throw new Error('首帧上传后未返回文件标识')
        if (lastFrame) {
          const lastUpload = unwrap(await relayUpload(lastFrame, lastFrame.name, 'h3_last_frame'))
          lastFrameOssKey = lastUpload?.oss_key
          if (!lastFrameOssKey) throw new Error('尾帧上传后未返回文件标识')
        }
      }
      const response = await createTextToVideoTask({
        prompt: cleanPrompt,
        generation_mode: generationMode,
        first_frame_oss_key: firstFrameOssKey,
        last_frame_oss_key: lastFrameOssKey,
        aspect_ratio: aspectRatio,
        seconds: Number(seconds),
        num_inference_steps: Number(steps),
        seed: Number(seed),
        client_ref_id: `exe_${generationMode === 'image_to_video' ? 'i2v' : 't2v'}_${Date.now()}`,
      })
      const created = unwrap(response)
      const nextTask = { ...created, progress: 0, stage: 'queued' }
      setTask(nextTask)
      localStorage.setItem(ACTIVE_TASK_KEY, JSON.stringify({
        taskId: created.task_id,
        projectPath: selectedProjectPath,
        savedPath: '',
        generationMode,
        imagePromptMode,
        prompt: cleanPrompt,
        userPrompt: cleanPrompt,
        aspectRatio,
        seconds: Number(seconds),
        steps: Number(steps),
      }))
    } catch (submitError) {
      setError(submitError.message || '提交 AI 视频生成任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  const running = task && !TERMINAL_STATUSES.has(task.status)
  const visibleRatios = RATIOS
  const progress = Math.max(0, Math.min(100, Number(task?.progress || 0)))
  const taskResult = task?.result || {}
  const totalTaskSteps = Math.max(1, Number(taskResult.total_steps || steps || 50))
  const currentTaskStep = Math.max(0, Math.min(totalTaskSteps, Number(taskResult.current_step || 0)))
  const stepPrefix = taskResult.step_is_estimated ? '约 ' : ''

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50/80 p-5 xl:p-7">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-violet-600">
              <Sparkles className="h-4 w-4" /> AI 视频生成
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">文字或图片，一站生成可剪辑视频素材</h1>
            <p className="mt-1 text-sm text-slate-500">每天最多生成 10GB；成片自动存入所选项目“场景素材”，服务器临时文件次日清理，本地素材不受影响。</p>
          </div>
          <div className={`rounded-full px-3 py-1.5 text-xs font-bold ${health === 'online' ? 'bg-emerald-50 text-emerald-700' : health === 'offline' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
            {health === 'online' ? '● 视频服务在线' : health === 'offline' ? '● 视频服务不可用' : '正在检查服务…'}
          </div>
        </div>

        <div className="mb-5 inline-flex flex-wrap rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          <button type="button" onClick={() => switchMode('text_to_video')} className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${generationMode === 'text_to_video' ? 'bg-violet-600 text-white shadow-md shadow-violet-200' : 'text-slate-500 hover:bg-slate-50'}`}>文本 → 视频</button>
          <button type="button" onClick={() => switchMode('image_to_video')} className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${generationMode === 'image_to_video' ? 'bg-violet-600 text-white shadow-md shadow-violet-200' : 'text-slate-500 hover:bg-slate-50'}`}>图片 + 文字 → 视频</button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,.92fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:p-6">
            {generationMode === 'image_to_video' && (
              <div className="mb-6">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900">首尾帧</div>
                    <div className="mt-1 text-xs text-slate-400">首帧必选，尾帧可选；建议两张图片比例一致</div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">JPEG / PNG / WebP</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`group relative flex aspect-video cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition ${firstFrameUrl ? 'border-violet-400 bg-slate-950' : 'border-violet-200 bg-violet-50/50 hover:border-violet-400'}`}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => selectFrame(event.target.files?.[0], 'first')} />
                    {firstFrameUrl ? <img src={firstFrameUrl} alt="首帧预览" className="h-full w-full object-contain" /> : <span className="m-auto flex flex-col items-center gap-2 text-sm font-bold text-violet-600"><ImagePlus className="h-7 w-7" />选择首帧<span className="text-[11px] font-medium text-violet-400">必选</span></span>}
                    {firstFrameUrl && <span className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white">首帧 · 点击替换</span>}
                  </label>
                  <label className={`group relative flex aspect-video cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition ${lastFrameUrl ? 'border-blue-400 bg-slate-950' : 'border-slate-200 bg-slate-50 hover:border-blue-400'}`}>
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => selectFrame(event.target.files?.[0], 'last')} />
                    {lastFrameUrl ? <img src={lastFrameUrl} alt="尾帧预览" className="h-full w-full object-contain" /> : <span className="m-auto flex flex-col items-center gap-2 text-sm font-bold text-slate-500"><ImagePlus className="h-7 w-7" />选择尾帧<span className="text-[11px] font-medium text-slate-400">可选</span></span>}
                    {lastFrameUrl && <span className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-xs font-bold text-white">尾帧 · 点击替换</span>}
                  </label>
                </div>
              </div>
            )}
            <>
              <div className="mb-3 flex items-center justify-between">
                <label className="font-bold text-slate-900">{generationMode === 'image_to_video' ? '动作与运镜描述' : '画面描述'}</label>
                <span className="text-xs text-slate-400">{prompt.length} / 4000</span>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => updatePrompt(event.target.value)}
                onCompositionStart={() => { promptComposingRef.current = true }}
                onCompositionEnd={(event) => {
                  promptComposingRef.current = false
                  promptDirtyRef.current = true
                  setPrompt(event.currentTarget.value.slice(0, 4000))
                }}
                placeholder={generationMode === 'image_to_video' ? '例如：人物自然抬手展示商品，镜头缓慢推进，动作连贯，保持主体外观一致……' : '例如：清晨的鹿场，薄雾和柔和逆光，一只梅花鹿缓慢走近镜头，竖屏电商短视频，真实摄影质感，镜头稳定……'}
                className="h-44 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              />
            </>

            <div className="mt-6">
              <div className="mb-3 font-bold text-slate-900">画面比例</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {visibleRatios.map((ratio) => (
                  <button
                    key={ratio.value}
                    type="button"
                    onClick={() => setAspectRatio(ratio.value)}
                    className={`rounded-2xl border p-3 text-left transition ${aspectRatio === ratio.value ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="mb-3 flex h-10 items-center justify-center">
                      <span className={`block rounded border-2 ${aspectRatio === ratio.value ? 'border-violet-500 bg-violet-100' : 'border-slate-300 bg-slate-100'}`} style={{ width: ratio.width, height: ratio.height }} />
                    </div>
                    <div className="text-sm font-bold text-slate-800">{ratio.label}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{ratio.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <label className="rounded-2xl border border-slate-200 p-4">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">视频时长</span>
                <span className="mt-1 block text-lg font-black text-slate-900">{seconds} 秒</span>
                <input className="mt-3 w-full accent-violet-600" type="range" min="4" max="15" value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} />
              </label>
              <label className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                <span className="block text-xs font-bold uppercase tracking-wide text-violet-500">生成步数</span>
                <span className="mt-1 block text-lg font-black text-slate-900">{steps} steps</span>
                <input className="mt-3 w-full accent-violet-600" type="range" min="2" max="50" value={steps} onChange={(event) => setSteps(Number(event.target.value))} />
                <span className="mt-1 block text-[11px] text-violet-600">默认 50，质量优先</span>
              </label>
              <label className="rounded-2xl border border-slate-200 p-4">
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-400">随机种子</span>
                <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-violet-400" type="number" min="0" value={seed} onChange={(event) => setSeed(Math.max(0, Number(event.target.value) || 0))} />
                <button type="button" className="mt-2 text-xs font-semibold text-violet-600" onClick={() => setSeed(Math.floor(Math.random() * 2147483647))}>换一个随机种子</button>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><FolderOpen className="h-4 w-4 text-blue-500" /> 导入项目</div>
              <select value={selectedProjectPath} onChange={(event) => setSelectedProjectPath(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-400">
                {projects.length === 0 && <option value="">没有可用项目，请先创建项目</option>}
                {projects.map((project) => <option key={safeProjectPath(project)} value={safeProjectPath(project)}>{project.name}</option>)}
              </select>
              <div className="mt-2 truncate text-xs text-slate-400">保存位置：{destination}</div>
            </div>

            {running && (
              <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-bold text-slate-700">
                    <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" />
                    {taskLabel(task)}
                  </span>
                  <span className="text-right font-mono font-bold text-violet-700">
                    {progress}% · {stepPrefix}{currentTaskStep} / {totalTaskSteps} steps
                  </span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white shadow-inner">
                  <div className="h-full rounded-full bg-gradient-to-r from-violet-600 via-blue-500 to-cyan-400 transition-all duration-700" style={{ width: `${Math.max(2, progress)}%` }} />
                </div>
                <div className="mt-2 text-xs text-slate-500">任务在服务端持续运行，可以切换到其他栏目，返回后会自动恢复。</div>
              </div>
            )}
            {pollWarning && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">{pollWarning}，任务不会中断。</div>}
            {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">{error}</div>}
            <button
              type="button"
              disabled={running || submitting || health === 'offline' || !selectedProjectPath}
              onClick={startGenerate}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {(running || submitting) ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <WandSparkles className="h-5 w-5" />}
              {submitting ? (generationMode === 'image_to_video' ? '正在上传首尾帧…' : '正在提交…') : running ? taskLabel(task) : '生成并导入素材库'}
            </button>
          </section>

          <section className="flex min-h-[640px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-sm">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white">
              <div className="flex items-center gap-2 font-bold"><Clapperboard className="h-5 w-5 text-violet-400" /> 成片预览</div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{generationMode === 'image_to_video' ? '图片+文字' : '文本'} · {aspectRatio} · {seconds}s · {steps} steps</span>
            </div>
            <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_center,_#1e293b_0,_#020617_65%)] p-6">
              {previewUrl ? (
                <video src={previewUrl} controls playsInline className={`max-h-[610px] rounded-2xl bg-black shadow-2xl ${aspectRatio === '9:16' ? 'aspect-[9/16] w-auto' : 'max-w-full'}`} />
              ) : (
                <div className="max-w-sm text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-violet-300"><Play className="h-9 w-9" /></div>
                  <div className="mt-5 text-lg font-bold text-white">{task ? taskLabel(task) : '等待你的第一个画面'}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">生成时可以切换到其他栏目，任务会在后台继续；回来后自动恢复进度。</p>
                </div>
              )}
            </div>
            <div className="border-t border-white/10 bg-slate-900 px-5 py-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300">{taskLabel(task)}</span>
                <span className="font-mono text-violet-300">{progress}% · {stepPrefix}{currentTaskStep}/{totalTaskSteps} steps</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} /></div>
              {savedPath && (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-300">
                  <span className="flex min-w-0 items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" /><span className="truncate">已导入：{savedPath}</span></span>
                  <button type="button" className="shrink-0 rounded-lg bg-emerald-400/15 px-3 py-1.5 font-bold hover:bg-emerald-400/25" onClick={() => onNavigateToFiles?.(destination)}>打开素材</button>
                </div>
              )}
              {task?.status === 'failed' && <button type="button" className="mt-3 flex items-center gap-2 text-xs font-bold text-rose-300" onClick={() => setTask(null)}><RefreshCw className="h-3.5 w-3.5" />重新生成</button>}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
