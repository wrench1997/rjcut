/**
 * 模板混剪 - 成片设置抽屉
 * 整合字幕样式、背景音乐、字幕纠错、输出与转场设置
 */
import { useState } from 'react'
import { X, Type, Music, BookOpen, Film, Settings } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import GlobalParamsVisualEditor from '../../components/GlobalParamsVisualEditor.jsx'
import BackgroundMusicPanel from './BackgroundMusicPanel.jsx'
import CorrectionDictionaryEditor from './CorrectionDictionaryEditor.jsx'
import FontSelector from './FontSelector.jsx'

const TABS = [
  { id: 'subtitle', label: '字幕样式', icon: Type },
  { id: 'audio', label: '背景音乐', icon: Music },
  { id: 'correction', label: '字幕纠错', icon: BookOpen },
  { id: 'output', label: '输出与转场', icon: Film },
]

export default function OutputSettingsDrawer({
  isOpen,
  onClose,
  vfs,
  apiKey,
  draft,
  updateDraft,
  template,
}) {
  const [activeTab, setActiveTab] = useState('subtitle')

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

  const handleUpdateFont = (newFont) => {
    updateDraft((d) => ({
      ...d,
      outputConfig: {
        ...d.outputConfig,
        subtitleFont: newFont,
      },
    }))
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'subtitle':
        return (
          <div className="space-y-6">
            {/* 字体选择 */}
            <FontSelector
              vfs={vfs}
              value={draft.outputConfig?.subtitleFont || {}}
              onChange={handleUpdateFont}
            />

            {/* 字幕样式编辑器 */}
            <GlobalParamsVisualEditor
              value={draft.outputConfig?.globalParams || null}
              defaultConfig={template?.defaultGlobalParams || null}
              persist={false}
              storageKey={null}
              onChange={handleUpdateGlobalParams}
              className="border-0 shadow-none"
            />
          </div>
        )

      case 'audio':
        return (
          <BackgroundMusicPanel
            vfs={vfs}
            value={draft.outputConfig?.audio || {}}
            onChange={handleUpdateAudio}
          />
        )

      case 'correction':
        return (
          <CorrectionDictionaryEditor
            vfs={vfs}
            value={draft.outputConfig?.corrections || {}}
            onChange={handleUpdateCorrections}
            productName={template?.productName}
            brandTerms={template?.brandTerms}
          />
        )

      case 'output':
        return (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                输出设置
              </h4>
              
              <div className="space-y-4">
                {/* 生成版本数 */}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-2">
                    生成版本数
                  </label>
                  <div className="flex gap-2">
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
                          'flex-1 py-2 rounded-lg border-2 font-medium transition-all text-sm',
                          draft.generation?.variantCount === count
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300',
                        ].join(' ')}
                      >
                        {count}条
                      </button>
                    ))}
                  </div>
                </div>

                {/* 转场设置提示 */}
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-700">
                    <strong>转场设置：</strong>
                    转场类型和时长在"字幕样式"标签页中配置。
                    模板建议转场次数：{template?.sourceVideoRequirement?.expectedTransitionCount || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* 高级开发者选项 */}
            <details className="mt-4">
              <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                开发者选项（JSON 导入/导出）
              </summary>
              <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs text-slate-500 mb-2">
                  高级用户可在此导入/导出完整的 globalParams JSON 配置
                </p>
                <textarea
                  className="w-full h-40 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  value={JSON.stringify(draft.outputConfig?.globalParams || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value)
                      handleUpdateGlobalParams(parsed)
                    } catch (err) {
                      // 忽略解析错误
                    }
                  }}
                  readOnly
                />
              </div>
            </details>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* 抽屉面板 */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* 抽屉头部 */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-800">成片设置</h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 标签页导航 */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              {TABS.map((tab) => {
                const IconComponent = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={[
                      'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all',
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

            {/* 抽屉内容 */}
            <div className="flex-1 overflow-y-auto p-4">
              {renderTabContent()}
            </div>

            {/* 抽屉底部摘要 */}
            <div className="p-4 border-t border-slate-200 bg-slate-50">
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">已选模板：</span>
                  <span className="font-medium text-slate-700">{template?.name || '未选择'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">口播视频：</span>
                  <span className="font-medium text-slate-700 truncate max-w-[200px]">
                    {draft.sourceVideo?.name || '未选择'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">背景音乐：</span>
                  <span className="font-medium text-slate-700">
                    {draft.outputConfig?.audio?.enabled ? '已选择' : '未选择'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">字幕纠错：</span>
                  <span className="font-medium text-slate-700">
                    {draft.outputConfig?.corrections?.entries?.length || 0} 条
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">预计生成：</span>
                  <span className="font-medium text-blue-600">
                    {draft.generation?.variantCount || 1} 条
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}