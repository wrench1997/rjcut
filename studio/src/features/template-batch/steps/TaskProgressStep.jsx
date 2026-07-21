/**
 * 模板混剪 - 步骤 5：本地渲染进度与结果
 *
 * 这里只负责展示、预览和下载。真正的渲染由 useBatchProcessStore 调用
 * localTemplateRenderer 完成，避免 UI useEffect 重复渲染或误用旧输出。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  CheckCircle,
  Clapperboard,
  Download,
  FileJson,
  Hourglass,
  Play,
  X,
  XCircle,
} from 'lucide-react'
import { TailwindProgressBar } from '../../../components/BatchProgress.jsx'
import useBatchStore from '../../../api/useBatchProcessStore'

function formatMs(value) {
  const ms = Math.max(0, Number(value) || 0)
  const seconds = ms / 1000
  return `${seconds.toFixed(2)}s`
}

export default function TaskProgressStep({ vfs, runInfo }) {
  const { tasks } = useBatchStore()
  const [previewTaskId, setPreviewTaskId] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [downloadingTaskId, setDownloadingTaskId] = useState(null)

  const stageLabels = {
    idle: '等待中',
    preparing: '准备时间线',
    uploading: '上传中',
    drafting: '时间线准备中',
    composing: '本地合成中',
    downloading: '下载中',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
  }

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const stats = useMemo(() => ({
    total: tasks.length,
    running: tasks.filter((task) => ['idle', 'preparing', 'uploading', 'drafting', 'composing', 'downloading'].includes(task.stage)).length,
    succeeded: tasks.filter((task) => task.stage === 'succeeded').length,
    failed: tasks.filter((task) => task.stage === 'failed').length,
    cancelled: tasks.filter((task) => task.stage === 'cancelled').length,
  }), [tasks])

  const handlePreview = async (task) => {
    if (!vfs || !task?.outputPath) return
    setPreviewError('')
    try {
      if (!(await vfs.exists(task.outputPath))) {
        throw new Error(`本次输出不存在：${task.outputPath}`)
      }
      const blob = await vfs.readFileAsBlob(task.outputPath)
      if (!(blob instanceof Blob) || blob.size <= 0) throw new Error('输出视频为空')
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(
        blob.type?.startsWith('video/')
          ? blob
          : new Blob([await blob.arrayBuffer()], { type: 'video/mp4' }),
      ))
      setPreviewTaskId(task.id)
    } catch (error) {
      setPreviewError(error.message)
    }
  }

  const handleDirectDownload = async (task) => {
    if (!vfs || !task?.outputPath) return
    setDownloadingTaskId(task.id)
    try {
      if (!(await vfs.exists(task.outputPath))) {
        throw new Error(`本次输出不存在：${task.outputPath}`)
      }
      const blob = await vfs.readFileAsBlob(task.outputPath)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = task.outputPath.split('/').pop() || `${task.id}.mp4`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      alert('下载失败：' + error.message)
    } finally {
      setDownloadingTaskId(null)
    }
  }

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPreviewTaskId(null)
    setPreviewError('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">本地渲染进度与结果</h2>
        <p className="text-sm text-slate-500 mt-1">
          每次生成使用独立 runId 和独立输出目录，不会复用上一个批次的视频。
        </p>
        {(runInfo?.runDir || tasks[0]?.outputDir) && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <div><strong>本次批次：</strong>{runInfo?.runId || tasks[0]?.runId}</div>
            <div className="mt-1 break-all"><strong>输出目录：</strong>{runInfo?.runDir || tasks[0]?.outputDir}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          ['总任务', stats.total, 'text-slate-800'],
          ['处理中', stats.running, 'text-blue-600'],
          ['成功', stats.succeeded, 'text-green-600'],
          ['失败', stats.failed, 'text-red-600'],
          ['取消', stats.cancelled, 'text-slate-400'],
        ].map(([label, value, color]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">任务列表</h3>
        </div>

        <div className="divide-y divide-slate-100">
          {tasks.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Hourglass className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无本次任务，请返回设置后重新生成。</p>
            </div>
          ) : tasks.map((task) => {
            const StageIcon = task.stage === 'succeeded'
              ? CheckCircle
              : task.stage === 'failed'
                ? XCircle
                : task.stage === 'cancelled'
                  ? Ban
                  : Clapperboard
            return (
              <div key={task.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <StageIcon
                      size={20}
                      className={
                        task.stage === 'succeeded'
                          ? 'text-green-500'
                          : task.stage === 'failed'
                            ? 'text-red-500'
                            : task.stage === 'cancelled'
                              ? 'text-slate-400'
                              : 'text-blue-500 animate-pulse'
                      }
                    />
                    <div className="min-w-0">
                      <h4 className="font-semibold text-slate-800 text-sm truncate">
                        {task.displayName || task.id}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {task.stageLabel || stageLabels[task.stage] || task.stage}
                        {Number.isFinite(task.transitionCount ?? task.templateMeta?.transitionCount)
                          ? ` · ${task.transitionCount ?? task.templateMeta.transitionCount} 个场景替换段`
                          : ''}
                      </p>
                    </div>
                  </div>

                  {task.stage === 'succeeded' && task.outputPath && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handlePreview(task)}
                        className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded flex items-center gap-1"
                      >
                        <Play size={12} /> 预览
                      </button>
                      <button
                        onClick={() => handleDirectDownload(task)}
                        disabled={downloadingTaskId === task.id}
                        className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded flex items-center gap-1 disabled:opacity-50"
                      >
                        <Download size={12} /> 直接下载
                      </button>
                    </div>
                  )}
                </div>

                <TailwindProgressBar progress={task.progress || 0} status={task.stage} />

                {task.outputPath && (
                  <div className="mt-2 text-xs text-slate-500 break-all">
                    已保存本次输出：{task.outputPath}
                  </div>
                )}
                {task.vfsTimelinePath && (
                  <div className="mt-1 text-xs text-slate-400 break-all flex items-start gap-1">
                    <FileJson size={12} className="mt-0.5 shrink-0" />
                    {task.vfsTimelinePath}
                  </div>
                )}
                {task.stage === 'failed' && task.error && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {task.error}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {stats.running === 0 && tasks.length > 0 && (
        <div className={`p-4 rounded-xl border ${stats.failed ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
          <p className={`text-sm font-semibold ${stats.failed ? 'text-amber-800' : 'text-green-800'}`}>
            本次批次已结束：{stats.succeeded} 个成功，{stats.failed} 个失败。
          </p>
        </div>
      )}

      {(previewUrl || previewError) && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closePreview}>
          <div
            className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            style={{ width: 'min(450px, 90vw)', height: 'min(800px, 90vh)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between p-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">本次成片预览</h3>
              <button onClick={closePreview} className="p-1.5 rounded hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 bg-black flex items-center justify-center p-4">
              {previewError ? (
                <div className="text-red-300 text-sm px-4">{previewError}</div>
              ) : (
                <video
                  key={previewTaskId}
                  src={previewUrl}
                  controls
                  autoPlay
                  preload="metadata"
                  className="max-h-full max-w-full rounded-lg"
                  onError={(event) => {
                    const code = event.currentTarget?.error?.code
                    setPreviewError(`视频解码失败（MediaError ${code || 'unknown'}）`)
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
