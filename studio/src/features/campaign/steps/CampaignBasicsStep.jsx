/**
 * 第一步：栏目基本信息与数字人选择
 */

import { User, Target, Megaphone, ShieldAlert, Sparkles } from 'lucide-react'
import { PLATFORM_OPTIONS, STYLE_OPTIONS } from '../campaignDefaults'

export default function CampaignBasicsStep({
  draft,
  updateDraft,
  vfs,
  apiKey,
  onOpenDigitalHumanSelector,
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-800">栏目基本信息</h2>
        <p className="text-sm text-slate-500 mt-1">填写栏目名称、发布平台和产品/主题信息</p>
      </div>

      {/* 栏目名称 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          栏目名称 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          placeholder="例如：每日好物推荐、产品测评日记"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
        />
      </div>

      {/* 发布平台 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          发布平台
        </label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {PLATFORM_OPTIONS.map((platform) => (
            <button
              key={platform.id}
              type="button"
              onClick={() =>
                updateDraft({
                  platform: platform.id,
                  aspectRatio: platform.aspectRatio,
                })
              }
              className={[
                'px-3 py-2.5 rounded-xl border text-sm font-medium transition-all',
                draft.platform === platform.id
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300',
              ].join(' ')}
            >
              {platform.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          当前视频比例：{draft.aspectRatio}
        </p>
      </div>

      {/* 产品信息 */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            产品/主题名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={draft.productBrief.productName}
            onChange={(e) =>
              updateDraft((prev) => ({
                ...prev,
                productBrief: { ...prev.productBrief, productName: e.target.value },
              }))
            }
            placeholder="例如：都市机能斜挎包、无线降噪耳机"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            目标人群
          </label>
          <input
            type="text"
            value={draft.productBrief.targetAudience}
            onChange={(e) =>
              updateDraft((prev) => ({
                ...prev,
                productBrief: { ...prev.productBrief, targetAudience: e.target.value },
              }))
            }
            placeholder="例如：25-35 岁男性通勤族、追求品质生活的都市白领"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            产品卖点
          </label>
          <textarea
            value={draft.productBrief.sellingPoints}
            onChange={(e) =>
              updateDraft((prev) => ({
                ...prev,
                productBrief: { ...prev.productBrief, sellingPoints: e.target.value },
              }))
            }
            placeholder={'例如：\n- 多分区收纳\n- 可放平板和充电宝\n- 防泼水面料\n- 通勤骑行都适合'}
            className="min-h-32 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            视频风格
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {STYLE_OPTIONS.map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() =>
                  updateDraft((prev) => ({
                    ...prev,
                    productBrief: { ...prev.productBrief, tone: style.id },
                  }))
                }
                className={[
                  'p-3 rounded-xl border text-left transition-all',
                  draft.productBrief.tone === style.id
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white border-slate-200 hover:border-blue-200',
                ].join(' ')}
              >
                <p className="text-sm font-semibold text-slate-800">{style.label}</p>
                <p className="text-xs text-slate-500 mt-1">{style.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            避免出现的词
          </label>
          <input
            type="text"
            value={draft.productBrief.prohibitedWords}
            onChange={(e) =>
              updateDraft((prev) => ({
                ...prev,
                productBrief: { ...prev.productBrief, prohibitedWords: e.target.value },
              }))
            }
            placeholder="例如：最、第一、绝对、百分百"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            结尾行动引导
          </label>
          <input
            type="text"
            value={draft.productBrief.callToAction}
            onChange={(e) =>
              updateDraft((prev) => ({
                ...prev,
                productBrief: { ...prev.productBrief, callToAction: e.target.value },
              }))
            }
            placeholder="例如：点击左下角了解更多、评论区告诉我你的想法"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
          />
        </div>
      </div>

      {/* 数字人选择 */}
      <div className="border-t border-slate-100 pt-6">
        <h3 className="text-base font-bold text-slate-800 mb-4">数字人形象</h3>
        
        {draft.digitalHuman.personId ? (
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  {draft.digitalHuman.personName || '已选数字人'}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  声音：{draft.digitalHuman.voiceName || '默认声音'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateDraft((prev) => ({
                    ...prev,
                    digitalHuman: { personId: '', personName: '', voiceId: '', voiceName: '' },
                  }))
                }
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                重新选择
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenDigitalHumanSelector}
            className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
          >
            <User size={20} />
            选择数字人形象
          </button>
        )}
      </div>
    </div>
  )
}