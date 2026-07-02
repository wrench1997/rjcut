/**
 * 模板混剪 - 步骤 4：确认生成
 * 显示摘要并启动批量任务
 */
import { useState } from 'react'
import { getTemplateById } from '../templateRegistry.js'
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function ConfirmGenerateStep({ draft, updateDraft, onConfirm, isGenerating }) {
  const template = getTemplateById(draft.templateId)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await onConfirm()
    } finally {
      setGenerating(false)
    }
  }

  if (!template) {
    return (
      <div className="text-center py-12 text-slate-400">
        请先选择模板
      </div>
    )
  }

  const totalSlots = template.slots.length
  const completedSlots = Object.keys(draft.slotBindings).filter(
    (slotId) => draft.slotBindings[slotId]?.files?.length > 0
  ).length

  const variantCount = draft.generation?.variantCount || 1

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">确认生成</h2>
        <p className="text-sm text-slate-500 mt-1">
          确认配置无误后，系统将自动生成视频任务
        </p>
      </div>

      {/* 生成摘要 */}
      <div className="bg-slate-50 rounded-xl p-6 space-y-4">
        <h3 className="font-bold text-slate-800 mb-4">生成摘要</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500 mb-1">模板</p>
            <p className="font-semibold text-slate-800">{template.name}</p>
          </div>

          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500 mb-1">口播视频</p>
            <p className="font-semibold text-slate-800 truncate">
              {draft.sourceVideo?.name || '未选择'}
            </p>
          </div>

          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500 mb-1">素材位完成度</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${(completedSlots / totalSlots) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium text-slate-700">
                {completedSlots}/{totalSlots}
              </span>
            </div>
          </div>

          <div className="p-4 bg-white rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500 mb-1">生成版本数</p>
            <p className="font-semibold text-slate-800">{variantCount} 条</p>
          </div>
        </div>
      </div>

      {/* 素材位详情 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-4">素材位详情</h3>
        <div className="space-y-3">
          {template.slots.map((slot) => {
            const binding = draft.slotBindings[slot.id]
            const fileCount = binding?.files?.length || 0
            const isComplete = fileCount >= slot.minFiles

            return (
              <div
                key={slot.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
              >
                <div className="flex items-center gap-3">
                  {isComplete ? (
                    <CheckCircle size={18} className="text-green-500" />
                  ) : slot.required ? (
                    <AlertCircle size={18} className="text-amber-500" />
                  ) : (
                    <div className="w-[18px] h-[18px] rounded-full bg-slate-200" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {slot.order}. {slot.title}
                      {slot.required && (
                        <span className="ml-2 text-xs text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          必填
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      已选 {fileCount} 个{slot.maxFiles ? `（最多${slot.maxFiles}个）` : ''}
                    </p>
                  </div>
                </div>
                {isComplete && (
                  <span className="text-xs text-green-600 font-medium">完成</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 版本数量选择 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-4">生成几个版本？</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 3, 5].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() =>
                updateDraft((d) => ({
                  ...d,
                  generation: { ...d.generation, variantCount: count },
                }))
              }
              className={[
                'py-3 rounded-lg border-2 font-medium transition-all',
                variantCount === count
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300',
              ].join(' ')}
            >
              生成 {count} 条
            </button>
          ))}
        </div>
        <div className="mt-4">
          <label className="flex items-center gap-2">
            <span className="text-sm text-slate-600">自定义数量：</span>
            <input
              type="number"
              min="1"
              max="20"
              value={variantCount}
              onChange={(e) =>
                updateDraft((d) => ({
                  ...d,
                  generation: {
                    ...d.generation,
                    variantCount: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
                  },
                }))
              }
              className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <span className="text-xs text-slate-500">（最多 20 条）</span>
          </label>
        </div>
      </div>

      {/* 生成按钮 */}
      <div className="flex justify-center pt-4">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || isGenerating}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium rounded-lg shadow-sm shadow-blue-500/30 transition-all flex items-center gap-2"
        >
          {generating || isGenerating ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <CheckCircle size={18} />
              开始生成
            </>
          )}
        </button>
      </div>

      <p className="text-center text-xs text-slate-500">
        生成任务将在后台执行，您可以随时查看进度
      </p>
    </div>
  )
}