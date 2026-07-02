/**
 * 第三步：AI 文案工作台
 * 支持手动编写、AI 生成、外部 AI 粘贴
 */

import { useState } from 'react'
import { Sparkles, Copy, ClipboardCheck, RefreshCw, Wand2 } from 'lucide-react'

export default function CampaignScriptStep({
  draft,
  updateDraft,
  vfs,
  apiKey,
  isGenerating,
  setIsGenerating,
}) {
  const [selectedSceneId, setSelectedSceneId] = useState(draft.script.scenes[0]?.id)
  const [showExternalPrompt, setShowExternalPrompt] = useState(false)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pastedText, setPastedText] = useState('')

  const selectedScene = draft.script.scenes.find((s) => s.id === selectedSceneId)

  const handleUpdateScene = (sceneId, updates) => {
    updateDraft((prev) => ({
      ...prev,
      script: {
        ...prev.script,
        scenes: prev.script.scenes.map((s) =>
          s.id === sceneId ? { ...s, ...updates } : s
        ),
      },
    }))
  }

  const handleToggleScene = (sceneId, enabled) => {
    handleUpdateScene(sceneId, { enabled })
  }

  // 生成外部 AI Prompt
  const generateExternalPrompt = () => {
    const prompt = `请为我写一条${draft.platform === 'douyin' ? '抖音' : '短视频'}口播视频文案。

产品：${draft.productBrief.productName}
人群：${draft.productBrief.targetAudience || '未指定'}
卖点：
${draft.productBrief.sellingPoints || '未提供'}
风格：${draft.productBrief.tone}
避免词汇：${draft.productBrief.prohibitedWords || '无'}
行动引导：${draft.productBrief.callToAction || '未指定'}

段落顺序：
${draft.script.scenes
  .filter((s) => s.enabled)
  .map((s, i) => `${i + 1}. ${s.title}，${s.durationSeconds}秒`)
  .join('\n')}

请按段落输出，每段单独一行。
不要解释，不要写标题，不要写 JSON。`

    navigator.clipboard.writeText(prompt)
    setShowExternalPrompt(true)
    setTimeout(() => setShowExternalPrompt(false), 3000)
  }

  // 解析粘贴的文案
  const handlePasteText = () => {
    if (!pastedText.trim()) return

    const lines = pastedText.trim().split('\n').filter((l) => l.trim())
    const enabledScenes = draft.script.scenes.filter((s) => s.enabled)

    enabledScenes.forEach((scene, index) => {
      if (lines[index]) {
        handleUpdateScene(scene.id, { narration: lines[index].trim() })
      }
    })

    setShowPasteModal(false)
    setPastedText('')
  }

  // AI 生成（占位，实际需调用后端 API）
  const handleAIGenerate = async () => {
    setIsGenerating(true)
    try {
      // TODO: 调用后端 /v1/copywriting/generate 接口
      // 这里先模拟延迟
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // 模拟 AI 返回
      const mockNarrations = {
        scene_hook: '每天通勤带一堆东西，包太大嫌累，太小又装不下？',
        scene_product: '这个斜挎包把收纳分得很清楚，平板、充电宝和随身小物都能各放各的。',
        scene_usage: '不管是挤地铁还是骑自行车，它都能稳稳当当跟着你。',
        scene_ending: '点击左下角，看看今天有什么优惠！',
      }

      updateDraft((prev) => ({
        ...prev,
        script: {
          ...prev.script,
          scenes: prev.script.scenes.map((s) => ({
            ...s,
            narration: mockNarrations[s.id] || s.narration,
          })),
        },
      }))
    } catch (error) {
      console.error('AI 生成失败:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const getWordCount = (text) => {
    return text.trim().length
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">生成脚本</h2>
          <p className="text-sm text-slate-500 mt-1">
            为每个段落编写口播文案，支持 AI 辅助
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAIGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Sparkles size={16} />
            {isGenerating ? '生成中...' : 'AI 生成完整脚本'}
          </button>

          <button
            type="button"
            onClick={generateExternalPrompt}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            <Copy size={16} />
            复制外部 AI 提示
          </button>

          <button
            type="button"
            onClick={() => setShowPasteModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            <ClipboardCheck size={16} />
            粘贴 AI 文案
          </button>
        </div>
      </div>

      {/* 段落列表 + 编辑区 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 左侧：段落列表 */}
        <div className="space-y-2">
          {draft.script.scenes.map((scene, index) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => setSelectedSceneId(scene.id)}
              className={[
                'w-full p-3 rounded-xl border text-left transition-all',
                selectedSceneId === scene.id
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-white border-slate-200 hover:border-blue-200',
              ].join(' ')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {index + 1}. {scene.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {scene.durationSeconds}秒 · {scene.assetRole}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={scene.enabled}
                  onChange={(e) => handleToggleScene(scene.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded text-blue-600"
                />
              </div>
              {scene.narration && (
                <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                  {scene.narration}
                </p>
              )}
            </button>
          ))}
        </div>

        {/* 中间：文案编辑 */}
        <div className="lg:col-span-2">
          {selectedScene ? (
            <div className="p-4 border border-slate-200 rounded-xl bg-white">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-slate-800">
                  {selectedScene.title}
                </h3>
                <span className="text-xs text-slate-500">
                  {getWordCount(selectedScene.narration)} 字 · {selectedScene.durationSeconds}秒
                </span>
              </div>

              <textarea
                value={selectedScene.narration}
                onChange={(e) =>
                  handleUpdateScene(selectedScene.id, {
                    narration: e.target.value,
                  })
                }
                placeholder={`为"${selectedScene.title}"段落编写口播文案...`}
                className="w-full h-40 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 resize-none"
              />

              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateScene(selectedScene.id, {
                      narration: '',
                    })
                  }
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  清空
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // TODO: AI 重写当前段
                  }}
                  className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700"
                >
                  <Wand2 size={12} />
                  AI 重写这一段
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 border border-slate-200 rounded-xl">
              请选择一个段落进行编辑
            </div>
          )}
        </div>
      </div>

      {/* 粘贴 AI 文案弹窗 */}
      {showPasteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPasteModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 mb-4">粘贴 AI 生成的文案</h3>
            <textarea
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="粘贴 AI 生成的文案，按行分段..."
              className="w-full h-48 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-50 resize-none"
            />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handlePasteText}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg"
              >
                确认粘贴
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 外部 AI Prompt 复制成功提示 */}
      {showExternalPrompt && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full text-sm font-medium shadow-lg">
          ✓ 提示词已复制到剪贴板
        </div>
      )}
    </div>
  )
}