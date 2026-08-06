/**
 * 模板混剪 - 主页面
 * 5 步流程：选模板 → 选数字人视频 → 添加场景版本 → 全局成片设置 → 任务进度与下载
 */
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2, Settings, Film, Inbox, X } from 'lucide-react'

import {
  createTemplateRunDraft,
  updateDraftTimestamp,
  validateTemplateRunDraft,
  convertToBatchTasks,
  analyzeTemplateRunDraft,
} from './templateRunAdapter.js'

import {
  loadLastTemplateRunDraft,
  saveTemplateRunDraft,
} from './templateRunStorage.js'

import SelectTemplateStep from './steps/SelectTemplateStep.jsx'
import SelectAvatarVideoStep from './steps/SelectAvatarVideoStep.jsx'
import AddSceneVariantsStep from './steps/AddSceneVariantsStep.jsx'
import GlobalRenderSettingsStep from './steps/GlobalRenderSettingsStep.jsx'
import TaskProgressStep from './steps/TaskProgressStep.jsx'
import { getTemplateById } from './templateRegistry.js'
import useBatchStore from '../../api/useBatchProcessStore'
import { TaskCard, StatCard, MinimizedProgress } from '../../components/BatchProgress.jsx'

const STEPS = [
  { id: 'select_template', label: '选择模板', shortLabel: '模板' },
  { id: 'select_avatar_video', label: '选择数字人视频', shortLabel: '数字人' },
  { id: 'add_scenes', label: '添加场景版本', shortLabel: '场景' },
  { id: 'global_settings', label: '全局成片设置', shortLabel: '设置' },
  { id: 'task_progress', label: '任务进度与下载', shortLabel: '进度' },
]

export default function TemplateBatchPage({
  vfs,
  apiKey,
  onOpenBatchCenter,
  onStartBatch,
  focusProgress = false,
}) {
  const [draft, setDraft] = useState(() => {
    if (typeof window === 'undefined') return createTemplateRunDraft()
    return loadLastTemplateRunDraft() || createTemplateRunDraft()
  })

  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showMinimizedProgress, setShowMinimizedProgress] = useState(false)
  const [lastRunInfo, setLastRunInfo] = useState(null)

  // 获取批量任务状态
  const { tasks, getTaskStats, reset, startBatch } = useBatchStore()
  const stats = getTaskStats()

  const saveTimerRef = useRef(null)
  const activeStep = STEPS[activeStepIndex]
  const template = getTemplateById(draft.templateId)

  useEffect(() => {
    if (focusProgress && tasks.length > 0) {
      setActiveStepIndex(STEPS.length - 1)
    }
  }, [focusProgress, tasks.length])

  // 自动保存草稿
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      setSaving(true)

      try {
        saveTemplateRunDraft(updateDraftTimestamp(draft))
      } finally {
        setSaving(false)
      }
    }, 500)

    return () => clearTimeout(saveTimerRef.current)
  }, [draft])

  const updateDraft = (updater) => {
    setDraft((previous) => {
      const next = typeof updater === 'function'
        ? updater(previous)
        : { ...previous, ...updater }

      return updateDraftTimestamp(next)
    })
  }

  const goNext = () => {
    const errors = validateTemplateRunDraft(draft, activeStep.id)

    if (errors.length) {
      setError(errors[0])
      return
    }

    setError('')
    setActiveStepIndex((value) => Math.min(value + 1, STEPS.length - 1))
  }

  const goPrevious = () => {
    setError('')
    setActiveStepIndex((value) => Math.max(value - 1, 0))
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError('')

    try {
      const finalErrors = [
        ...validateTemplateRunDraft(draft, 'select_template'),
        ...validateTemplateRunDraft(draft, 'select_avatar_video'),
        ...validateTemplateRunDraft(draft, 'add_scenes'),
      ]
      if (finalErrors.length) throw new Error(finalErrors[0])

      const preflight = await analyzeTemplateRunDraft(draft, vfs)
      if (preflight.warnings.length > 0 && typeof window !== 'undefined') {
        const preview = preflight.warnings
          .slice(0, 8)
          .map((warning) => `• ${warning.sceneName}：${warning.message}`)
          .join('\n')
        const more = preflight.warnings.length > 8
          ? `\n• 另有 ${preflight.warnings.length - 8} 个素材段需要确认`
          : ''
        const confirmed = window.confirm(
          `检测到模板段与素材时长不匹配：\n${preview}${more}\n\n继续生成后，短素材会循环播放以填满模板时间。是否继续？`,
        )
        if (!confirmed) return
      }

      // 新的一次点击必须创建全新 runId 和输出目录，不能复用上次 task.id/outputPath。
      reset()
      const converted = await convertToBatchTasks(draft, vfs, { preflight })
      const taskItems = converted.tasks

      if (taskItems.length === 0) {
        throw new Error('没有可生成的任务')
      }

      setLastRunInfo({
        runId: converted.runId,
        runDir: converted.runDir,
        startedAt: new Date().toISOString(),
      })
      updateDraft((previous) => ({
        ...previous,
        lastRun: {
          runId: converted.runId,
          runDir: converted.runDir,
          startedAt: new Date().toISOString(),
        },
      }))

      let globalParams = null
      try {
        const saved = localStorage.getItem('rjcut_global_params_v1')
        globalParams = saved ? JSON.parse(saved) : null
      } catch (e) {
        console.error('[TemplateBatchPage] 加载全局参数失败:', e)
      }

      const concurrency = 1 // 本地 FFmpeg/WASM 单实例，按队列串行最稳定
      const startPromise = startBatch(taskItems, concurrency, globalParams)

      console.log('[TemplateBatchPage] 新批次已启动', {
        runId: converted.runId,
        runDir: converted.runDir,
        taskCount: taskItems.length,
      })
      setActiveStepIndex(STEPS.length - 1)

      startPromise.catch((err) => {
        console.error('[TemplateBatchPage] 本地批量渲染错误:', err)
      })
    } catch (e) {
      console.error('[TemplateBatchPage] 生成任务失败:', e)
      setError('生成任务失败：' + e.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const renderStep = () => {
    const commonProps = {
      draft,
      updateDraft,
      vfs,
      apiKey,
    }

    switch (activeStep.id) {
      case 'select_template':
        return <SelectTemplateStep {...commonProps} />

      case 'select_avatar_video':
        return <SelectAvatarVideoStep {...commonProps} />

      case 'add_scenes':
        return <AddSceneVariantsStep {...commonProps} />

      case 'global_settings':
        return (
          <GlobalRenderSettingsStep
            {...commonProps}
            template={template}
            onConfirm={handleGenerate}
            isGenerating={isGenerating}
          />
        )

      case 'task_progress':
        return <TaskProgressStep {...commonProps} runInfo={lastRunInfo} />

      default:
        return null
    }
  }

  const sceneCount = draft.scenes?.length || 0
  const canGenerate = sceneCount > 0 && !isGenerating

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Film className="w-5 h-5 text-blue-600" />
                <p className="text-sm font-medium text-blue-600">
                  模板混剪
                </p>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">
                批量创作
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                1 个模板 + 1 个数字人 + N 个场景 = N 条视频
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-500">
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  保存中
                </>
              ) : (
                <>
                  <Check size={16} className="text-emerald-500" />
                  草稿已保存
                </>
              )}
            </div>
          </div>

          {/* 横向步骤条 */}
          <div className="mt-6 flex items-center gap-2">
            {STEPS.map((step, index) => {
              const active = index === activeStepIndex
              const completed = index < activeStepIndex

              return (
                <div key={step.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (index <= activeStepIndex) {
                        setError('')
                        setActiveStepIndex(index)
                      }
                    }}
                    disabled={index > activeStepIndex}
                    className={[
                      'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                      active
                        ? 'bg-blue-600 text-white'
                        : completed
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-500 disabled:cursor-not-allowed',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        active
                          ? 'bg-white text-blue-600'
                          : completed
                          ? 'bg-white text-emerald-600'
                          : 'bg-slate-200 text-slate-500',
                      ].join(' ')}
                    >
                      {completed ? <Check size={14} /> : index + 1}
                    </span>
                    <span className="text-sm font-medium">{step.shortLabel}</span>
                  </button>

                  {index < STEPS.length - 1 && activeStepIndex !== STEPS.length - 1 && (
                    <div className="w-8 h-[2px] bg-slate-200 mx-1" />
                  )}
                </div>
              )
            })}
          </div>
        </header>

        {/* 进度显示区域（只在第五步显示，由 TaskProgressStep 组件内部渲染） */}
        {/* 前四步不显示进度，保持界面简洁 */}

        <main className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {renderStep()}

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {activeStepIndex < STEPS.length - 2 && (
            <footer className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={goPrevious}
                disabled={activeStepIndex === 0}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft size={16} />
                上一步
              </button>

              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                下一步
                <ArrowRight size={16} />
              </button>
            </footer>
          )}

          {/* 第四步：全局设置 + 生成按钮 */}
          {activeStepIndex === STEPS.length - 2 && (
            <footer className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={goPrevious}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft size={16} />
                上一步
              </button>

              <div className="flex items-center gap-4">
                {/* 生成数量提示 */}
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-700">
                    预计生成：{sceneCount} 条视频
                  </p>
                  <p className="text-xs text-slate-500">
                    将使用 {sceneCount} 次生成额度
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={[
                    'inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition-colors',
                    canGenerate
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed',
                  ].join(' ')}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Film size={16} />
                      生成 {sceneCount} 条视频
                    </>
                  )}
                </button>
              </div>
            </footer>
          )}

          {/* 第五步：任务进度（无底部按钮） */}
          {activeStepIndex === STEPS.length - 1 && (
            <footer className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={goPrevious}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft size={16} />
                返回设置
              </button>

              <div className="text-sm text-slate-500">
                本次批次使用独立输出目录；关闭页面前建议等待本地渲染完成
              </div>
            </footer>
          )}
        </main>
      </div>

      {/* 最小化进度悬浮窗 */}
      {showMinimizedProgress && (
        <MinimizedProgress
          tasks={tasks}
          onExpand={() => setShowMinimizedProgress(false)}
          onClose={() => setShowMinimizedProgress(false)}
        />
      )}
    </div>
  )
}
