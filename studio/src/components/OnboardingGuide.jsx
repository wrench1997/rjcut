import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FolderOpen, Sparkles, WandSparkles, X } from 'lucide-react'

const STEPS = [
  {
    number: '01',
    eyebrow: '先完成创作',
    title: '创建第一条数字人视频',
    description: '选择数字人形象、场景和文案，生成可以直接用于后续混剪的视频。',
    icon: Sparkles,
    accent: 'from-violet-500 to-indigo-500',
    target: 'digital-human-studio',
    action: '去创建数字人',
  },
  {
    number: '02',
    eyebrow: '再快速套版',
    title: '用模板混剪扩展内容',
    description: '选择刚生成的数字人视频，再补充场景素材和模板，一次生成多条成片。',
    icon: WandSparkles,
    accent: 'from-blue-500 to-cyan-500',
    target: 'campaign',
    action: '去模板混剪',
  },
  {
    number: '03',
    eyebrow: '最后统一管理',
    title: '项目、素材和文件各司其职',
    description: '项目用来管理创作进度，素材与文件用来查找具体文件；数字人形象和模板库负责复用资产。',
    icon: FolderOpen,
    accent: 'from-emerald-500 to-teal-500',
    target: 'projects',
    action: '查看项目管理',
  },
]

export default function OnboardingGuide({ onClose, onNavigate }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = STEPS[stepIndex]
  const Icon = step.icon

  const finish = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('rjcut_onboarding_completed', '1')
    }
    onClose?.()
  }

  const goToStep = () => {
    finish()
    onNavigate?.(step.target)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={finish}>
      <section
        className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`relative overflow-hidden bg-gradient-to-br ${step.accent} px-8 pb-9 pt-7 text-white sm:px-10`}>
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" />
          <div className="absolute -bottom-28 right-28 h-48 w-48 rounded-full bg-white/10" />
          <div className="relative flex items-start justify-between gap-6">
            <div>
              <div className="mb-5 flex items-center gap-2 text-sm font-medium text-white/80">
                <span className="rounded-full bg-white/15 px-3 py-1">RJCut Studio</span>
                <span>新手教程</span>
              </div>
              <p className="mb-2 text-sm font-semibold tracking-wide text-white/75">{step.eyebrow}</p>
              <h2 id="onboarding-title" className="max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">{step.title}</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/80 sm:text-base">{step.description}</p>
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label="跳过新手教程"
              className="rounded-full p-2 text-white/75 transition hover:bg-white/15 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="relative mt-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 shadow-inner">
              <Icon size={24} />
            </div>
            <div className="text-sm text-white/80">
              第 <span className="font-bold text-white">{stepIndex + 1}</span> / {STEPS.length} 步
            </div>
          </div>
        </div>

        <div className="px-8 py-7 sm:px-10">
          <div className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((item, index) => {
              const ItemIcon = item.icon
              const isActive = index === stepIndex
              const isDone = index < stepIndex
              return (
                <button
                  type="button"
                  key={item.number}
                  onClick={() => setStepIndex(index)}
                  className={`rounded-2xl border p-4 text-left transition ${isActive ? 'border-blue-200 bg-blue-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className={`text-xs font-bold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>{item.number}</span>
                    {isDone ? <Check size={16} className="text-emerald-500" /> : <ItemIcon size={16} className={isActive ? 'text-blue-600' : 'text-slate-400'} />}
                  </div>
                  <div className={`text-sm font-semibold ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>{item.title}</div>
                </button>
              )
            })}
          </div>

          <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={finish} className="text-sm font-medium text-slate-500 transition hover:text-slate-800">
              跳过教程，下次再看
            </button>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                disabled={stepIndex === 0}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={16} />
                上一步
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  下一步
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button type="button" onClick={goToStep} className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">
                  {step.action}
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
