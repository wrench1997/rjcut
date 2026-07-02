/**
 * 模板混剪 - 步骤 4：全局成片设置
 * 整合字幕外观、背景音乐、转场机制、输出与生成设置
 */
import { useState } from 'react'
import { Type, Music, Film, Settings, Check, Sparkles, Wand2 } from 'lucide-react'
import GlobalParamsVisualEditor from '../../../components/GlobalParamsVisualEditor.jsx'
import BackgroundMusicPanel from '../BackgroundMusicPanel.jsx'
import CorrectionDictionaryEditor from '../CorrectionDictionaryEditor.jsx'

const TABS = [
  { id: 'subtitle', label: '字幕外观', icon: Type },
  { id: 'audio', label: '背景音乐', icon: Music },
  { id: 'correction', label: '字幕纠错', icon: Settings },
  { id: 'output', label: '输出与转场', icon: Film },
]

export default function GlobalRenderSettingsStep({
  draft,
  updateDraft,
  vfs,
  apiKey,
  template,
  onConfirm,
  isGenerating,
}) {
  const [activeTab, setActiveTab] = useState('subtitle')
  const [showAIScriptPanel, setShowAIScriptPanel] = useState(false)
  const [aiParams, setAiParams] = useState({
    productName: '',
    sellingPoints: '',
    targetAudience: '',
    tone: 'direct_sale',
  })
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)

  const handleToggleAIScript = (enabled) => {
    updateDraft((d) => ({
      ...d,
      aiScriptEnabled: enabled,
      aiScriptParams: enabled ? aiParams : undefined,
    }))
  }

  const handleUpdateAIParams = (params) => {
    const newParams = { ...aiParams, ...params }
    setAiParams(newParams)
    updateDraft((d) => ({
      ...d,
      aiScriptParams: newParams,
    }))
  }

  const handleUpdateGlobalParams = (newParams) => {
    updateDraft((d) => ({
      ...d,
      outputConfig: {
        ...d.outputConfig,
        globalParams: newParams,
      },
    }))
  }

  const handleUpdateAudio = (newAudio) => {
    updateDraft((d) => ({
      ...d,
      outputConfig: {
        ...d.outputConfig,
        audio: newAudio,
      },
    }))
  }

  const handleUpdateCorrections = (newCorrections) => {
    updateDraft((d) => ({
      ...d,
      outputConfig: {
        ...d.outputConfig,
        corrections: newCorrections,
      },
    }))
  }

  const handleUpdateConcurrency = (value) => {
    updateDraft((d) => ({
      ...d,
      execution: {
        ...d.execution,
        concurrency: value,
      },
    }))
  }

  const sceneCount = draft.scenes?.length || 0
  const canGenerate = sceneCount > 0 && !isGenerating

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">全局成片设置</h2>
        <p className="text-sm text-slate-500 mt-1">
          统一设置所有场景版本的字幕、音频、转场和输出参数
        </p>
      </div>

      {/* 批次摘要 */}
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">
              当前模板：{template?.name || '未选择'}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              数字人：{draft.avatarVideo?.name || '未选择'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-blue-900">
              场景版本：{sceneCount} 个
            </p>
            <p className="text-xs text-blue-600 mt-1">
              预计生成：{sceneCount} 条视频
            </p>
          </div>
        </div>
      </div>

      {/* AI 文案生成面板 */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles size={20} className="text-purple-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-purple-900">AI 文案生成</h3>
                <p className="text-xs text-purple-700 mt-1">
                  为数字人口播段落自动生成文案，支持多种风格
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAIScriptPanel(!showAIScriptPanel)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Wand2 size={14} />
                {showAIScriptPanel ? '收起' : '展开'}
              </button>
            </div>

            {showAIScriptPanel && (
              <div className="mt-4 space-y-3">
                {/* 启用开关 */}
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-100">
                  <div>
                    <p className="text-sm font-medium text-slate-700">启用 AI 文案</p>
                    <p className="text-xs text-slate-500">生成时使用 AI 替换默认口播文案</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleAIScript(!draft.aiScriptEnabled)}
                    className={[
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      draft.aiScriptEnabled ? 'bg-purple-600' : 'bg-slate-200',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                        draft.aiScriptEnabled ? 'translate-x-6' : 'translate-x-1',
                      ].join(' ')}
                    />
                  </button>
                </div>

                {draft.aiScriptEnabled && (
                  <>
                    {/* 产品名称 */}
                    <div>
                      <label className="text-xs font-medium text-purple-800 block mb-1">
                        产品名称
                      </label>
                      <input
                        type="text"
                        value={aiParams.productName}
                        onChange={(e) => handleUpdateAIParams({ productName: e.target.value })}
                        placeholder="例如：鹿茸血口服液"
                        className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                      />
                    </div>

                    {/* 卖点 */}
                    <div>
                      <label className="text-xs font-medium text-purple-800 block mb-1">
                        核心卖点
                      </label>
                      <textarea
                        value={aiParams.sellingPoints}
                        onChange={(e) => handleUpdateAIParams({ sellingPoints: e.target.value })}
                        placeholder="例如：滋补养生、提高免疫力、纯天然无添加"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 resize-none"
                      />
                    </div>

                    {/* 目标人群 */}
                    <div>
                      <label className="text-xs font-medium text-purple-800 block mb-1">
                        目标人群
                      </label>
                      <input
                        type="text"
                        value={aiParams.targetAudience}
                        onChange={(e) => handleUpdateAIParams({ targetAudience: e.target.value })}
                        placeholder="例如：中老年人、亚健康人群"
                        className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                      />
                    </div>

                    {/* 风格选择 */}
                    <div>
                      <label className="text-xs font-medium text-purple-800 block mb-1">
                        文案风格
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'direct_sale', label: '直接促销', desc: '节奏快，强调痛点' },
                          { id: 'premium', label: '高级质感', desc: '克制、简洁' },
                          { id: 'social_review', label: '种草分享', desc: '像真实用户' },
                          { id: 'explainer', label: '口播讲解', desc: '清楚解释' },
                        ].map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => handleUpdateAIParams({ tone: style.id })}
                            className={[
                              'p-2 rounded-lg border-2 text-left transition-all',
                              aiParams.tone === style.id
                                ? 'border-purple-600 bg-purple-50'
                                : 'border-purple-100 bg-white hover:border-purple-300',
                            ].join(' ')}
                          >
                            <p className="text-xs font-semibold text-slate-700">{style.label}</p>
                            <p className="text-xs text-slate-500">{style.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 标签页导航 */}
      <div className="flex border-b border-slate-200 bg-slate-50 rounded-t-xl overflow-hidden">
        {TABS.map((tab) => {
          const IconComponent = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all',
                isActive
                  ? 'text-blue-600 bg-white border-b-2 border-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
              ].join(' ')}
            >
              <IconComponent className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* 标签页内容 */}
      <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl p-4 min-h-[400px]">
        {activeTab === 'subtitle' && (
          <GlobalParamsVisualEditor
            value={draft.outputConfig?.globalParams || null}
            defaultConfig={template?.defaultGlobalParams || null}
            persist={false}
            storageKey={null}
            onChange={handleUpdateGlobalParams}
            className="border-0 shadow-none"
          />
        )}

        {activeTab === 'audio' && (
          <BackgroundMusicPanel
            vfs={vfs}
            value={draft.outputConfig?.audio || {}}
            onChange={handleUpdateAudio}
          />
        )}

        {activeTab === 'correction' && (
          <CorrectionDictionaryEditor
            vfs={vfs}
            value={draft.outputConfig?.corrections || {}}
            onChange={handleUpdateCorrections}
            productName={template?.productName}
            brandTerms={template?.brandTerms}
          />
        )}

        {activeTab === 'output' && (
          <div className="space-y-6">
            {/* 转场设置 */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Film className="w-4 h-4" />
                转场机制
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">
                    转场类型
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['fade', 'slide', 'zoom', 'blur'].map((type) => {
                      const currentType =
                        draft.outputConfig?.globalParams?.pipeline
                          ?.transition_type || 'fade'
                      const isSelected = currentType === type
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            handleUpdateGlobalParams({
                              ...draft.outputConfig?.globalParams,
                              pipeline: {
                                ...draft.outputConfig?.globalParams?.pipeline,
                                transition_type: type,
                              },
                            })
                          }
                          className={[
                            'py-2 rounded-lg border-2 font-medium transition-all text-sm capitalize',
                            isSelected
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                          ].join(' ')}
                        >
                          {type === 'fade' && '淡入淡出'}
                          {type === 'slide' && '滑动'}
                          {type === 'zoom' && '缩放'}
                          {type === 'blur' && '模糊'}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">
                    转场时长
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.2"
                      max="2.0"
                      step="0.1"
                      value={
                        draft.outputConfig?.globalParams?.pipeline
                          ?.transition_duration || 0.6
                      }
                      onChange={(e) =>
                        handleUpdateGlobalParams({
                          ...draft.outputConfig?.globalParams,
                          pipeline: {
                            ...draft.outputConfig?.globalParams?.pipeline,
                            transition_duration: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="flex-1 accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm font-mono text-slate-700 w-16 text-right">
                      {draft.outputConfig?.globalParams?.pipeline
                        ?.transition_duration || 0.6}
                      s
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 输出设置 */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                输出与生成设置
              </h4>

              <div className="space-y-4">
                {/* 同时生成数量 */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">
                    同时生成几条视频
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5].map((count) => {
                      const current = draft.execution?.concurrency || 3
                      const isSelected = current === count
                      return (
                        <button
                          key={count}
                          type="button"
                          onClick={() => handleUpdateConcurrency(count)}
                          className={[
                            'flex-1 py-2 rounded-lg border-2 font-medium transition-all text-sm',
                            isSelected
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                          ].join(' ')}
                        >
                          {count}
                          {count === 3 && (
                            <span className="ml-1 text-xs opacity-70">
                              (推荐)
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    同时生成数量越大，速度越快，但对系统资源要求越高
                  </p>
                </div>

                {/* 输出比例 */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">
                    输出比例
                  </label>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-700">
                      跟随模板：{template?.aspectRatio || '9:16'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      当前版本不支持修改，与模板保持一致
                    </p>
                  </div>
                </div>

                {/* 清晰度 */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">
                    清晰度
                  </label>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <p className="text-sm text-slate-700">1080P</p>
                    <p className="text-xs text-slate-500 mt-1">
                      当前版本固定为 1080P 输出
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 生成按钮 */}
      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div>
          <p className="text-sm font-semibold text-slate-700">
            准备生成 {sceneCount} 条视频
          </p>
          <p className="text-xs text-slate-500 mt-1">
            将使用 {sceneCount} 次生成额度，预计并行 {draft.execution?.concurrency || 3} 条
          </p>
        </div>
        <button
          type="button"
          onClick={onConfirm}
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
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Check size={16} />
              生成 {sceneCount} 条视频
            </>
          )}
        </button>
      </div>
    </div>
  )
}