/**
 * 内容创作向导 - 主组件
 * 普通用户通过 5 步流程创建批量视频任务
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  WandSparkles,
} from 'lucide-react'

import {
  CAMPAIGN_STEPS,
  createCampaignDraft,
  updateDraftTimestamp,
  validateCampaignDraft,
} from './campaignDefaults'

import {
  loadLastCampaignDraft,
  saveCampaignDraft,
} from './campaignStorage'

import CampaignBasicsStep from './steps/CampaignBasicsStep'
import CampaignAssetsStep from './steps/CampaignAssetsStep'
import CampaignScriptStep from './steps/CampaignScriptStep'
import CampaignPlanStep from './steps/CampaignPlanStep'
import CampaignReviewStep from './steps/CampaignReviewStep'

export default function CampaignWizard({
  vfs,
  apiKey,
  onOpenBatchCenter,
  onOpenDigitalHumanSelector,
}) {
  const [draft, setDraft] = useState(() => {
    if (typeof window === 'undefined') return createCampaignDraft()
    return loadLastCampaignDraft() || createCampaignDraft()
  })

  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  const saveTimerRef = useRef(null)
  const activeStep = CAMPAIGN_STEPS[activeStepIndex]

  // 自动保存草稿
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(() => {
      setSaving(true)

      try {
        saveCampaignDraft(updateDraftTimestamp(draft))
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
    const errors = validateCampaignDraft(draft, activeStep.id)

    if (errors.length) {
      setError(errors[0])
      return
    }

    setError('')
    setActiveStepIndex((value) => Math.min(value + 1, CAMPAIGN_STEPS.length - 1))
  }

  const goPrevious = () => {
    setError('')
    setActiveStepIndex((value) => Math.max(value - 1, 0))
  }

  const renderStep = () => {
    const commonProps = {
      draft,
      updateDraft,
      vfs,
      apiKey,
    }

    switch (activeStep.id) {
      case 'basics':
        return (
          <CampaignBasicsStep
            {...commonProps}
            onOpenDigitalHumanSelector={onOpenDigitalHumanSelector}
          />
        )

      case 'assets':
        return <CampaignAssetsStep {...commonProps} />

      case 'script':
        return (
          <CampaignScriptStep
            {...commonProps}
            isGenerating={isGenerating}
            setIsGenerating={setIsGenerating}
          />
        )

      case 'plan':
        return <CampaignPlanStep {...commonProps} />

      case 'review':
        return (
          <CampaignReviewStep
            {...commonProps}
            onCreated={() => onOpenBatchCenter?.()}
          />
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-blue-600">
              内容创作向导
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              {draft.name || '新建一组口播视频'}
            </h1>
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
        </header>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4">
            <nav className="space-y-2">
              {CAMPAIGN_STEPS.map((step, index) => {
                const active = index === activeStepIndex
                const completed = index < activeStepIndex

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      if (index <= activeStepIndex) {
                        setError('')
                        setActiveStepIndex(index)
                      }
                    }}
                    className={[
                      'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition',
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        active
                          ? 'bg-blue-600 text-white'
                          : completed
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-500',
                      ].join(' ')}
                    >
                      {completed ? <Check size={15} /> : index + 1}
                    </span>

                    <span>
                      <span className="block text-sm font-semibold">
                        {step.shortLabel}
                      </span>
                      <span className="block text-xs opacity-70">
                        {step.label}
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>
          </aside>

          <main className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {renderStep()}

            {error ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

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

              {activeStepIndex < CAMPAIGN_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  下一步
                  <ArrowRight size={16} />
                </button>
              ) : null}
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}