/**
 * 第四步：批量方案配置
 * 用户选择生成方式、文案版本数、素材组合策略
 */

import { Info } from 'lucide-react'
import { estimateTaskCount } from '../campaignTaskAdapter'

export default function CampaignPlanStep({ draft, updateDraft, vfs, apiKey }) {
  const assetCount = draft.assets.length
  const copyVariants = draft.batchPlan.copyVariants
  const assetStrategy = draft.batchPlan.assetStrategy

  const estimatedTotal = estimateTaskCount({
    copyVariants,
    assetCount,
    assetStrategy,
    totalLimit: draft.batchPlan.totalLimit,
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">批量方案</h2>
        <p className="text-sm text-slate-500 mt-1">
          选择生成方式和组合策略
        </p>
      </div>

      {/* 生成方式 */}
      <div className="p-4 border border-slate-200 rounded-xl">
        <h3 className="text-base font-bold text-slate-800 mb-3">生成方式</h3>
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-blue-50 border-blue-300">
            <input
              type="radio"
              name="generationMode"
              checked={draft.batchPlan.generationMode === 'sample_first'}
              onChange={() =>
                updateDraft((prev) => ({
                  ...prev,
                  batchPlan: { ...prev.batchPlan, generationMode: 'sample_first' },
                }))
              }
              className="mt-1 w-4 h-4 text-blue-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                先生成 1 条样片，确认后再批量生成
              </p>
              <p className="text-xs text-slate-500 mt-1">
                推荐：先查看效果，满意后再生成全部，避免浪费配额
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-white border-slate-200 hover:border-blue-200">
            <input
              type="radio"
              name="generationMode"
              checked={draft.batchPlan.generationMode === 'direct'}
              onChange={() =>
                updateDraft((prev) => ({
                  ...prev,
                  batchPlan: { ...prev.batchPlan, generationMode: 'direct' },
                }))
              }
              className="mt-1 w-4 h-4 text-blue-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                直接批量生成
              </p>
              <p className="text-xs text-slate-500 mt-1">
                一次性生成所有视频，适合已有明确方案的场景
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* 文案版本数 */}
      <div className="p-4 border border-slate-200 rounded-xl">
        <h3 className="text-base font-bold text-slate-800 mb-3">文案版本数</h3>
        <div className="grid grid-cols-3 gap-2">
          {[1, 3, 5].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() =>
                updateDraft((prev) => ({
                  ...prev,
                  batchPlan: { ...prev.batchPlan, copyVariants: count },
                }))
              }
              className={[
                'py-3 rounded-xl border text-sm font-medium transition-all',
                copyVariants === count
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300',
              ].join(' ')}
            >
              {count} 个版本
            </button>
          ))}
        </div>
      </div>

      {/* 素材组合策略 */}
      <div className="p-4 border border-slate-200 rounded-xl">
        <h3 className="text-base font-bold text-slate-800 mb-3">环境视频组合</h3>
        <div className="space-y-2">
          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-blue-50 border-blue-300">
            <input
              type="radio"
              name="assetStrategy"
              checked={assetStrategy === 'rotate'}
              onChange={() =>
                updateDraft((prev) => ({
                  ...prev,
                  batchPlan: { ...prev.batchPlan, assetStrategy: 'rotate' },
                }))
              }
              className="mt-1 w-4 h-4 text-blue-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">依次轮换环境素材</p>
              <p className="text-xs text-slate-500 mt-1">
                每个文案版本依次使用不同的环境视频
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-white border-slate-200 hover:border-blue-200">
            <input
              type="radio"
              name="assetStrategy"
              checked={assetStrategy === 'random'}
              onChange={() =>
                updateDraft((prev) => ({
                  ...prev,
                  batchPlan: { ...prev.batchPlan, assetStrategy: 'random' },
                }))
              }
              className="mt-1 w-4 h-4 text-blue-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">随机搭配环境素材</p>
              <p className="text-xs text-slate-500 mt-1">
                每个文案版本随机选择一个环境视频
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all bg-white border-slate-200 hover:border-blue-200">
            <input
              type="radio"
              name="assetStrategy"
              checked={assetStrategy === 'all_combinations'}
              onChange={() =>
                updateDraft((prev) => ({
                  ...prev,
                  batchPlan: { ...prev.batchPlan, assetStrategy: 'all_combinations' },
                }))
              }
              className="mt-1 w-4 h-4 text-blue-600"
            />
            <div>
              <p className="text-sm font-semibold text-slate-800">每个环境视频都生成一条</p>
              <p className="text-xs text-slate-500 mt-1">
                所有文案版本 × 所有环境视频 = 全部组合
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* 最大生成数量 */}
      <div className="p-4 border border-slate-200 rounded-xl">
        <h3 className="text-base font-bold text-slate-800 mb-3">最大生成数量</h3>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="1"
            max="50"
            value={draft.batchPlan.totalLimit}
            onChange={(e) =>
              updateDraft((prev) => ({
                ...prev,
                batchPlan: { ...prev.batchPlan, totalLimit: parseInt(e.target.value) },
              }))
            }
            className="flex-1 accent-blue-500 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-lg font-bold text-blue-600 w-16 text-center">
            {draft.batchPlan.totalLimit}
          </span>
        </div>
      </div>

      {/* 实时计算 */}
      <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">预计生成</p>
            <p className="text-lg font-bold text-blue-600 mt-1">
              {copyVariants} 个文案版本 × {assetCount} 个环境视频 = {estimatedTotal} 条视频
            </p>
            {draft.batchPlan.generationMode === 'sample_first' && (
              <p className="text-xs text-blue-600 mt-2">
                当前将优先生成：1 条样片
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}