/**
 * AI 文案生成页面
 * 支持多种文案风格选择和自定义提示词
 */
import { useState } from 'react'
import { Sparkles, Copy, Check, Download, Save, RefreshCw } from 'lucide-react'
import { aiGenerateScript } from '../../api/api.js'
import AIScriptGenerator, { TONE_STYLES, PRESET_PROMPTS, buildPrompt } from '../../components/AIScriptGenerator.jsx'

export default function AIScriptGeneratorPage() {
  const [loading, setLoading] = useState(false)
  const [generatedSegments, setGeneratedSegments] = useState(null)
  const [error, setError] = useState('')
  const [copiedIndex, setCopiedIndex] = useState(null)

  const handleGenerate = async (params) => {
    setLoading(true)
    setError('')
    setGeneratedSegments(null)

    try {
      console.log('[AIScriptGeneratorPage] 发起 AI 文案生成请求:', params)
      
      const response = await aiGenerateScript({
        product_name: params.product_name,
        selling_points: params.selling_points,
        target_audience: params.target_audience,
        tone: params.tone,
        custom_prompt: params.custom_prompt,
        template_structure: [
          { flag: 'hook', note: '开场吸引' },
          { flag: 'scene', note: '场景 1' },
          { flag: 'scene', note: '场景 2' },
          { flag: 'scene', note: '场景 3' },
          { flag: 'scene', note: '场景 4' },
          { flag: 'ending', note: '结尾引导' },
        ],
      })

      console.log('[AIScriptGeneratorPage] AI 返回结果:', response.data)

      if (response.data && response.data.code === 0) {
        setGeneratedSegments(response.data.data.segments)
      } else {
        setError('生成失败：' + (response.data?.message || '未知错误'))
      }
    } catch (err) {
      console.error('[AIScriptGeneratorPage] 生成失败:', err)
      setError(err.message || '生成失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (text, index) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    } catch (err) {
      console.error('复制失败:', err)
    }
  }

  const handleExport = () => {
    if (!generatedSegments) return
    
    const text = generatedSegments
      .map((seg, i) => `[${seg.flag}] ${seg.text}`)
      .join('\n\n')
    
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `文案-${new Date().getTime()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">AI 文案生成器</h1>
              <p className="text-xs text-slate-500">智能创作带货口播文案</p>
            </div>
          </div>
          
          {generatedSegments && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setGeneratedSegments(null)}
                className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2"
              >
                <RefreshCw size={14} />
                重新生成
              </button>
              <button
                onClick={handleExport}
                className="px-3 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center gap-2"
              >
                <Download size={14} />
                导出文案
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：输入区 */}
          <div className="space-y-6">
            <AIScriptGenerator
              onGenerate={handleGenerate}
              loading={loading}
            />

            {/* 风格说明 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="text-sm font-bold text-slate-800 mb-3">💡 文案风格说明</h3>
              <div className="grid grid-cols-2 gap-2">
                {TONE_STYLES.slice(0, 6).map((style) => (
                  <div key={style.value} className="text-xs text-slate-600">
                    <span className="font-medium">{style.label}</span>
                    <p className="text-slate-500 mt-1">{style.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：结果预览区 */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
                <h3 className="text-sm font-bold text-slate-800">📝 文案预览</h3>
              </div>

              <div className="p-4">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Sparkles size={40} className="text-purple-500 animate-pulse mb-4" />
                    <p className="text-slate-600">AI 正在创作文案...</p>
                    <p className="text-xs text-slate-400 mt-2">通常需要 10-30 秒</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="p-3 bg-red-100 rounded-full mb-4">
                      <span className="text-red-500 text-2xl">⚠️</span>
                    </div>
                    <p className="text-red-600 font-medium">{error}</p>
                  </div>
                ) : generatedSegments ? (
                  <div className="space-y-3">
                    {generatedSegments.map((segment, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded-lg border transition-all ${
                          segment.flag === 'scene'
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              segment.flag === 'hook' ? 'bg-green-100 text-green-700' :
                              segment.flag === 'ending' ? 'bg-blue-100 text-blue-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {segment.flag === 'hook' ? '🎬 开场' :
                               segment.flag === 'ending' ? '🏁 结尾' :
                               '🎞️ 转场'}
                            </span>
                            <span className="text-xs text-slate-500">{segment.note}</span>
                          </div>
                          
                          <button
                            onClick={() => handleCopy(segment.text, index)}
                            className="text-slate-400 hover:text-blue-600 p-1"
                            title="复制文案"
                          >
                            {copiedIndex === index ? (
                              <Check size={14} className="text-green-600" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                        
                        <p className="text-sm text-slate-800 leading-relaxed">
                          {segment.text || '（无文案）'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="p-3 bg-slate-100 rounded-full mb-4">
                      <Sparkles size={24} className="text-slate-400" />
                    </div>
                    <p className="text-slate-500">填写左侧表单，点击"生成文案"</p>
                    <p className="text-xs text-slate-400 mt-2">AI 将自动生成匹配的口播文案</p>
                  </div>
                )}
              </div>
            </div>

            {/* 快速提示 */}
            {generatedSegments && (
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-4">
                <h4 className="text-sm font-bold text-purple-800 mb-2">✨ 下一步建议</h4>
                <ul className="text-xs text-purple-700 space-y-1">
                  <li>• 可以复制文案到剪辑软件中使用</li>
                  <li>• 可以导出为 TXT 文件保存</li>
                  <li>• 可以重新生成获取不同版本</li>
                  <li>• 可以调整风格或自定义提示词</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}