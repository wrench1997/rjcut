/**
 * 模板混剪 - 步骤 1：选择模板
 */
import { useMemo, useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { TEMPLATE_CATALOG, getAllCategories } from '../templateRegistry.js'
import { aiRecommendTemplates } from '../aiAssistant.js'

export default function SelectTemplateStep({ draft, updateDraft }) {
  const categories = useMemo(() => getAllCategories(), [])
  const selectedCategory = draft.selectedCategory || 'all'
  const [isRecommending, setIsRecommending] = useState(false)
  const [recommendations, setRecommendations] = useState(null)
  const [productKeyword, setProductKeyword] = useState('')

  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') return TEMPLATE_CATALOG
    return TEMPLATE_CATALOG.filter((t) => t.category === selectedCategory)
  }, [selectedCategory])

  const handleAIRecommend = async () => {
    if (!productKeyword.trim()) {
      alert('请输入产品关键词')
      return
    }

    setIsRecommending(true)
    try {
      // 将当前模板库传给后端，让 AI 基于实际可用的模板进行推荐
      const result = await aiRecommendTemplates(
        productKeyword,
        selectedCategory === 'all' ? '' : selectedCategory,
        TEMPLATE_CATALOG.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
        }))
      )
      setRecommendations(result)
    } catch (error) {
      console.error('AI 推荐失败:', error)
      alert('AI 推荐失败，请稍后重试')
    } finally {
      setIsRecommending(false)
    }
  }

  const handleSelectRecommended = (templateId) => {
    // 先更新选中的模板 ID
    updateDraft((d) => ({
      ...d,
      templateId,
      templateVersion: 1,
    }))
    
    // 等待 React 渲染完成后再滚动（使用 requestAnimationFrame 确保 DOM 已更新）
    requestAnimationFrame(() => {
      setTimeout(() => {
        const templateElement = document.getElementById(`template-card-${templateId}`)
        if (templateElement) {
          templateElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          // 添加一个闪烁动画强调选中
          templateElement.classList.add('ring-4', 'ring-blue-400', 'ring-opacity-50', 'animate-pulse')
          setTimeout(() => {
            templateElement.classList.remove('ring-4', 'ring-blue-400', 'ring-opacity-50', 'animate-pulse')
          }, 2000)
        } else {
          // 如果是 AI 生成的自定义模板（不在模板库中），提示用户
          console.log('[AI 推荐] 模板', templateId, '不在本地模板库中，可能是 AI 生成的自定义模板')
        }
      }, 100)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">选择模板</h2>
          <p className="text-sm text-slate-500 mt-1">
            选择一个行业模板，系统会按模板要求指导你补充素材
          </p>
        </div>
        <button
          type="button"
          onClick={() => document.getElementById('ai-recommend-panel')?.scrollIntoView({ behavior: 'smooth' })}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm font-medium transition-colors"
        >
          <Sparkles size={16} />
          AI 推荐
        </button>
      </div>

      {/* AI 推荐面板 */}
      <div id="ai-recommend-panel" className="p-5 bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles size={20} className="text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-purple-900">AI 智能推荐模板</h3>
            <p className="text-xs text-purple-700 mt-1">
              输入产品关键词，AI 会为你匹配最合适的模板
            </p>
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={productKeyword}
                onChange={(e) => setProductKeyword(e.target.value)}
                placeholder="例如：鹿茸血、保健品、营养液..."
                className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-lg outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                onKeyDown={(e) => e.key === 'Enter' && handleAIRecommend()}
              />
              <button
                type="button"
                onClick={handleAIRecommend}
                disabled={isRecommending || !productKeyword.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {isRecommending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    分析中...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    开始推荐
                  </>
                )}
              </button>
            </div>

            {/* 推荐结果 */}
            {recommendations && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-purple-800">推荐结果：</p>
                {recommendations.map((rec, index) => {
                  const template = TEMPLATE_CATALOG.find((t) => t.id === rec.templateId)
                  const templateInCatalog = !!template
                  return (
                    <div
                      key={`${rec.templateId}-${index}`}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-100 hover:border-purple-200 transition-all"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-purple-600">
                            {index + 1}. {template?.name || rec.templateId}
                          </span>
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            匹配度 {(rec.score * 100).toFixed(0)}%
                          </span>
                          {!templateInCatalog && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                              AI 生成
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{rec.reason}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectRecommended(rec.templateId)}
                        className="ml-3 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        选择此模板
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => updateDraft((d) => ({ ...d, selectedCategory: 'all' }))}
          className={[
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
          ].join(' ')}
        >
          全部
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => updateDraft((d) => ({ ...d, selectedCategory: cat }))}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              selectedCategory === cat
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            ].join(' ')}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 模板卡片网格 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredTemplates.map((template) => {
          const isSelected = draft.templateId === template.id
          return (
            <button
              key={template.id}
              id={`template-card-${template.id}`}
              type="button"
              onClick={() => {
                updateDraft((d) => ({
                  ...d,
                  templateId: template.id,
                  templateVersion: template.version,
                  slotBindings: {},
                }))
              }}
              className={[
                'text-left rounded-xl border-2 p-5 transition-all hover:shadow-md',
                isSelected
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-blue-300',
              ].join(' ')}
            >
              <div className="flex items-start justify-between mb-3">
                <span className="inline-block px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded">
                  {template.category}
                </span>
                {isSelected && (
                  <span className="text-blue-600 font-bold text-sm">已选择</span>
                )}
              </div>

              <h3 className="text-lg font-bold text-slate-800 mb-2">
                {template.name}
              </h3>

              <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                {template.description}
              </p>

              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>时长：{template.durationHint}</span>
                <span>比例：{template.aspectRatio}</span>
              </div>

              {template.sourceVideoRequirement && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-xs text-amber-700">
                    <span className="font-semibold">口播要求：</span>
                    {template.sourceVideoRequirement.hint}
                  </p>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">素材位：</p>
                <div className="flex flex-wrap gap-1">
                  {template.slots.map((slot) => (
                    <span
                      key={slot.id}
                      className={[
                        'px-2 py-1 text-xs rounded',
                        slot.required
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600',
                      ].join(' ')}
                    >
                      {slot.required ? '★' : '○'} {slot.title}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          暂无模板
        </div>
      )}
    </div>
  )
}