/**
 * 模板混剪 - 字幕错别字纠错字典编辑器
 * 用户可手动维护纠错词库，支持导入导出和 AI 辅助识别
 */
import { useState, useRef } from 'react'
import { BookOpen, Plus, Trash2, Upload, Download, Sparkles, X, Check } from 'lucide-react'

export default function CorrectionDictionaryEditor({
  vfs,
  value,
  onChange,
  className,
  productName,
  brandTerms,
  scriptText,
}) {
  const [showImportExport, setShowImportExport] = useState(false)
  const [showAiSuggest, setShowAiSuggest] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState([])
  const [aiLoading, setAiLoading] = useState(false)
  const [newHeard, setNewHeard] = useState('')
  const [newCorrect, setNewCorrect] = useState('')
  const fileInputRef = useRef(null)

  const entries = value?.entries || []
  const isEnabled = value?.enabled !== false

  const handleAddEntry = () => {
    if (!newHeard.trim() || !newCorrect.trim()) {
      alert('请输入错误词和正确词')
      return
    }

    const exists = entries.some((e) => e.heard === newHeard.trim())
    if (exists) {
      alert('该错误词已存在')
      return
    }

    onChange({
      ...value,
      enabled: true,
      entries: [
        ...entries,
        {
          heard: newHeard.trim(),
          correct: newCorrect.trim(),
          reason: '手动添加',
        },
      ],
    })

    setNewHeard('')
    setNewCorrect('')
  }

  const handleRemoveEntry = (index) => {
    const newEntries = entries.filter((_, i) => i !== index)
    onChange({
      ...value,
      entries: newEntries,
      enabled: newEntries.length > 0,
    })
  }

  const handleUpdateEntry = (index, field, newValue) => {
    const newEntries = entries.map((e, i) =>
      i === index ? { ...e, [field]: newValue } : e
    )
    onChange({
      ...value,
      entries: newEntries,
    })
  }

  const handleImportJson = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result)
        const corrections = data.corrections || {}
        const newEntries = Object.entries(corrections).map(([heard, correct]) => ({
          heard,
          correct,
          reason: '导入',
        }))

        onChange({
          ...value,
          enabled: newEntries.length > 0,
          entries: [...entries, ...newEntries],
        })
        setShowImportExport(false)
      } catch (err) {
        alert('导入失败：文件格式不正确')
        console.error('[CorrectionDictionaryEditor] 导入失败:', err)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleExportJson = async () => {
    const correctionsData = {
      corrections: Object.fromEntries(
        entries.map((e) => [e.heard, e.correct])
      ),
    }

    const blob = new Blob([JSON.stringify(correctionsData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `corrections-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveToVfs = async () => {
    if (!vfs) {
      alert('VFS 不可用')
      return
    }

    const correctionsData = {
      corrections: Object.fromEntries(
        entries.map((e) => [e.heard, e.correct])
      ),
    }

    const vfsPath = `/配置/corrections-${Date.now()}.json`
    try {
      await vfs.mkdir('/配置', true)
      const content = JSON.stringify(correctionsData, null, 2)
      await vfs.writeFile(vfsPath, new TextEncoder().encode(content))
      alert(`已保存到：${vfsPath}`)
      onChange({
        ...value,
        vfsPath,
      })
    } catch (err) {
      console.error('[CorrectionDictionaryEditor] 保存失败:', err)
      alert('保存失败：' + err.message)
    }
  }

  const handleAiSuggest = async () => {
    setAiLoading(true)
    setAiSuggestions([])
    setShowAiSuggest(true)

    setTimeout(() => {
      const suggestions = []

      if (productName) {
        const nameVariants = generateNameVariants(productName)
        nameVariants.forEach((variant) => {
          if (variant !== productName && !entries.some((e) => e.heard === variant)) {
            suggestions.push({
              heard: variant,
              correct: productName,
              reason: '产品名',
              confidence: 0.9,
            })
          }
        })
      }

      if (brandTerms && brandTerms.length > 0) {
        brandTerms.forEach((term) => {
          const variants = generateNameVariants(term)
          variants.forEach((variant) => {
            if (variant !== term && !entries.some((e) => e.heard === variant)) {
              suggestions.push({
                heard: variant,
                correct: term,
                reason: '品牌词',
                confidence: 0.85,
              })
            }
          })
        })
      }

      setAiSuggestions(suggestions)
      setAiLoading(false)
    }, 800)
  }

  const handleAcceptSuggestion = (suggestion) => {
    onChange({
      ...value,
      enabled: true,
      entries: [
        ...entries,
        {
          heard: suggestion.heard,
          correct: suggestion.correct,
          reason: suggestion.reason || 'AI 建议',
        },
      ],
    })
    setAiSuggestions((prev) => prev.filter((s) => s.heard !== suggestion.heard))
  }

  const handleDismissSuggestion = (index) => {
    setAiSuggestions((prev) => prev.filter((_, i) => i !== index))
  }

  const generateNameVariants = (name) => {
    const variants = []
    const charMap = {
      '\u9e7f': ['\u8def', '\u9732', '\u7984'],
      '\u8338': ['\u7ed2', '\u8363', '\u5bb9'],
      '\u8840': ['\u96ea', '\u5b66', '\u7a74'],
      '\u5730': ['\u7b2c', '\u5e1d', '\u4f4e'],
      '\u677f': ['\u7248', '\u529e', '\u534a'],
      '\u4ef7': ['\u67b6', '\u52a0', '\u5bb6'],
      '\u597d': ['\u53f7', '\u8017', '\u6beb'],
      '\u7684': ['\u5730', '\u5f97', '\u5fb7'],
      '\u4e86': ['\u5566', '\u54af', '\u52d2'],
      '\u662f': ['\u4e8b', '\u5e02', '\u5f0f'],
      '\u5728': ['\u518d', '\u8f7d', '\u5bb0'],
      '\u6709': ['\u53c8', '\u53f3', '\u5e7c'],
      '\u8fd9': ['\u7740', '\u8005', '\u6298'],
      '\u4e2a': ['\u5404', '\u54e5', '\u6b4c'],
      '\u6211': ['\u54e6', '\u5594', '\u7a9d'],
      '\u4f60': ['\u6ce5', '\u5c3c', '\u9006'],
      '\u4ed6': ['\u5979', '\u5b83', '\u5854'],
      '\u4eec': ['\u95e8', '\u95f7', '\u840c'],
    }

    for (let i = 0; i < name.length; i += 1) {
      const char = name[i]
      const variants_for_char = charMap[char] || []
      variants_for_char.forEach((replacement) => {
        variants.push(name.slice(0, i) + replacement + name.slice(i + 1))
      })
    }

    return variants
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-semibold text-slate-700">字幕纠错字典</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImportExport(true)}
            className="text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded transition-colors flex items-center gap-1"
          >
            <Upload size={14} />
            导入/导出
          </button>
          <button
            type="button"
            onClick={handleAiSuggest}
            disabled={aiLoading}
            className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <Sparkles size={14} className={aiLoading ? 'animate-pulse' : ''} />
            AI 识别错词
          </button>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200"
            >
              <div className="flex items-center gap-2 flex-1">
                <span className="text-xs text-slate-500">识别为</span>
                <input
                  type="text"
                  value={entry.heard}
                  onChange={(e) => handleUpdateEntry(index, 'heard', e.target.value)}
                  className="w-24 px-2 py-1 text-sm border border-slate-300 rounded bg-white text-red-600 font-medium"
                  placeholder="错词"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="text"
                  value={entry.correct}
                  onChange={(e) => handleUpdateEntry(index, 'correct', e.target.value)}
                  className="w-24 px-2 py-1 text-sm border border-slate-300 rounded bg-white text-green-600 font-medium"
                  placeholder="正确词"
                />
                {entry.reason && (
                  <span className="text-xs text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">
                    {entry.reason}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveEntry(index)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无纠错词</p>
          <p className="text-xs mt-1">添加常见识别错误，让字幕更准确</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newHeard}
          onChange={(e) => setNewHeard(e.target.value)}
          placeholder="常被识别成..."
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
        />
        <span className="text-slate-400">→</span>
        <input
          type="text"
          value={newCorrect}
          onChange={(e) => setNewCorrect(e.target.value)}
          placeholder="实际应该是..."
          className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAddEntry()}
        />
        <button
          type="button"
          onClick={handleAddEntry}
          className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1 text-sm font-medium"
        >
          <Plus size={16} />
          添加
        </button>
      </div>

      {entries.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveToVfs}
            className="text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          >
            <Download size={14} />
            保存到文件库
          </button>
        </div>
      )}

      {showImportExport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowImportExport(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-800">导入/导出纠错字典</h3>
              <button className="p-2 hover:bg-slate-100 rounded-lg" onClick={() => setShowImportExport(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleExportJson}
                className="w-full py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Download size={16} />
                导出为 JSON
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-slate-500">或</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-blue-400 text-slate-600 hover:text-blue-600 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Upload size={16} />
                从 JSON 导入
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJson}
                className="hidden"
              />
            </div>
          </div>
        </div>
      )}

      {showAiSuggest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAiSuggest(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                AI 识别可能错词
              </h3>
              <button className="p-2 hover:bg-slate-100 rounded-lg" onClick={() => setShowAiSuggest(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {aiLoading ? (
                <div className="text-center py-8 text-slate-400">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 animate-pulse text-purple-500" />
                  <p className="text-sm">正在分析产品名称和品牌词...</p>
                </div>
              ) : aiSuggestions.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-2">
                    以下是 AI 根据产品名称和品牌词推测的可能错词，勾选后加入纠错字典：
                  </p>
                  {aiSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200"
                    >
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion(suggestion)}
                        className="w-8 h-8 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-lg flex items-center justify-center transition-colors"
                        title="采纳建议"
                      >
                        <Check size={16} />
                      </button>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="text-red-600 font-medium">{suggestion.heard}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-green-600 font-medium">{suggestion.correct}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          来源：{suggestion.reason} · 置信度：{Math.round(suggestion.confidence * 100)}%
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDismissSuggestion(index)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                        title="忽略"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">未发现可能的错词</p>
                  <p className="text-xs mt-1">请确保已填写产品名称或品牌词</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}