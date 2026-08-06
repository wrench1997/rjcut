/**
 * 模板混剪 - 步骤 4：全局成片设置
 * 整合字幕外观、背景音乐、转场机制、输出与生成设置
 */
import { useEffect, useState } from 'react'
import { Type, Music, Film, Settings, Check } from 'lucide-react'
import GlobalParamsVisualEditor from '../../../components/GlobalParamsVisualEditor.jsx'
import BackgroundMusicPanel from '../BackgroundMusicPanel.jsx'
import CorrectionDictionaryEditor from '../CorrectionDictionaryEditor.jsx'
import { STORAGE_KEY as SUBTITLE_STORAGE_KEY } from '../../../utils/subtitleConfig.js'

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

  // 与 OutputSettingsDrawer 保持一致：把 draft 旧值一次性迁移到
  // rjcut_global_params_v1，避免用户切到 GlobalRenderSettingsStep 时仍看到老数据。
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      const stored = window.localStorage.getItem(SUBTITLE_STORAGE_KEY)
      const draftParams = draft?.outputConfig?.globalParams
      if (!stored && draftParams) {
        window.localStorage.setItem(SUBTITLE_STORAGE_KEY, JSON.stringify(draftParams))
        console.log('[GlobalRenderSettingsStep] 已把 draft.globalParams 迁移到 localStorage')
      }
    } catch (error) {
      console.warn('[GlobalRenderSettingsStep] 迁移 draft -> localStorage 失败：', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            value={null}
            defaultConfig={template?.defaultGlobalParams || null}
            persist={true}
            storageKey={SUBTITLE_STORAGE_KEY}
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
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">本地渲染质量</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ['performance', '性能优先', '最快，适合批量预览'],
                      ['balanced', '均衡', '速度和清晰度兼顾'],
                      ['quality', '高质量', '更清晰，但耗时更长'],
                    ].map(([value, label, hint]) => {
                      const selected = (draft.outputConfig?.globalParams?.pipeline?.render_quality || 'balanced') === value
                      return <button key={value} type="button" onClick={() => handleUpdateGlobalParams({ ...draft.outputConfig?.globalParams, pipeline: { ...draft.outputConfig?.globalParams?.pipeline, render_quality: value } })}
                        className={`p-2 rounded-lg border-2 text-left transition-all ${selected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>
                        <span className="block text-sm font-medium">{label}</span><span className="block text-xs opacity-70 mt-1">{hint}</span>
                      </button>
                    })}
                  </div>
                </div>
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
