
import { useState, useEffect, useCallback, useRef } from 'react'
import { getCommonPersons, getCustomPersons, getCommonPersonDetail, getCustomPersonDetail, getVoices, getImageProxyUrl, getBaseUrl } from '../api/api'
import { getVFS } from '../utils/vfsClient'
import { PROJECT_FOLDERS, buildVFSPath } from '../utils/project-structure'
import { User, Mic, Check, X, Film, Download, AlertCircle, Loader2, Book, Inbox, Folder, AlertTriangle, Rocket, Settings, Sliders, Volume2, Type, Image, ChevronDown, ChevronUp, Maximize, Sparkles, Wand2, Store, FileText, Lightbulb, Package } from 'lucide-react'
import Tooltip from './Tooltip'
import TemplateManager from './TemplateManager'
import { aiGenerateScript, DEFAULT_TEMPLATES } from '../features/template-batch/aiAssistant.js'
import { createTimelineDigitalHumanTask, getDigitalHumanBaseUrl, getTimelineCharTimings, getTimelineDigitalHumanTask, toDigitalHumanAssetUrl, waitForTimelineDigitalHumanTask } from '../features/digital-human-project/digitalHumanApi.js'
import { buildDigitalHumanProject, normalizeCopywritingPlan, sidecarPathForVideo, writeDigitalHumanProject } from '../features/digital-human-project/digitalHumanProject.js'
import { downloadDigitalHumanVideo } from '../features/digital-human-project/digitalHumanDownload.js'
import { createManualCopywritingPlan, createManualScriptEntry, insertManualSegment, makeManualSegment, moveManualSegment, parseManualCopywritingPlanJson, rebuildManualCopywritingPlan, removeManualSegment, splitManualTextIntoSegments, updateManualSegment } from '../features/digital-human-project/manualCopywritingPlan.js'
import { requireFullSpokenText, summarizeTextContract, validateDigitalHumanResult } from '../features/digital-human-project/digitalHumanIntegrity.js'
import { decoratePersonsForGeneration, findMatchingPerson, mergePersonDetails, personSelectionKey, resolvePersonIdentity, safeFilePart, verifyGeneratedPersonIdentity } from '../features/digital-human-project/personIdentity.js'

// =====================================================
// 左侧：资产选择 (数字人与声音) - 9 宫格布局
// =====================================================
function AvatarPicker({ persons, voices, selectedPerson, onSelectPerson, selectedVoice, onSelectVoice }) {
  return (
    <div className="w-[420px] bg-white border-r border-slate-200 flex flex-col h-full z-10 flex-shrink-0">
      {/* 标题区 */}
      <div className="p-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-blue-50 to-white">
        <Tooltip tip="从库中选择一位数字人作为视频出镜角色" delay={1000}>
          <h2 className="text-base font-bold text-slate-800">1. 选择出镜数字人</h2>
        </Tooltip>
        <p className="text-xs text-slate-500 mt-1">点击选择一位数字人进行视频创作</p>
      </div>
      
      {/* 数字人 9 宫格 */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-3 gap-3">
          {persons.map((person, index) => (
            <div
              key={`${person.uniqueId || person.id}_${index}`}
              onClick={() => onSelectPerson(person)}
              className={`group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
                personSelectionKey(selectedPerson) === personSelectionKey(person) 
                  ? 'ring-2 ring-blue-500 shadow-lg scale-105' 
                  : 'shadow-md hover:shadow-lg hover:scale-105'
              }`}
            >
              {person.cover_url ? (
                <img 
                  src={person.cover_url.startsWith('/v1/dh/proxy-image') ? `${getBaseUrl()}${person.cover_url}` : (getImageProxyUrl(person.cover_url) || person.cover_url)} 
                  alt={person.name} 
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" 
                  onError={(e) => {
                    // 如果代理失败，尝试使用原始 URL 作为远程 HTTP 地址（如果有）
                    if (person.cover_url.startsWith('http://') || person.cover_url.startsWith('https://')) {
                      e.target.src = person.cover_url;
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-slate-400">
                  <User size={32} strokeWidth={1.5} />
                </div>
              )}
              {/* 遮罩层 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              {/* 名字标签 */}
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <p className="text-white text-xs font-bold truncate drop-shadow-lg">{person.name}</p>
              </div>
              {/* 选中标识 */}
              {personSelectionKey(selectedPerson) === personSelectionKey(person) && (
                <div className="absolute top-1.5 right-1.5 bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                  <Check size={12} strokeWidth={3} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* 配音选择区 */}
      <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
        <Tooltip tip="为数字人视频选择配音角色，留空则使用数字人原声" delay={1000}>
          <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
            <Mic size={14} strokeWidth={2} />
            <span>配音角色 (可选)</span>
          </label>
        </Tooltip>
        <select 
          className="w-full text-sm p-2.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
          value={selectedVoice}
          onChange={(e) => onSelectVoice(e.target.value)}
        >
          <option value="">使用数字人原声</option>
          {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
    </div>
  )
}
// =====================================================
// 高级设置面板（折叠式）
// =====================================================
function AdvancedSettings({ settings, setSettings, isOpen, onToggle, personDetails }) {
  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  // 当数字人变化时，同步更新动作选择和形象类型
  useEffect(() => {
    if (personDetails) {
      // 同步动作选择
      if (personDetails.actions && personDetails.actions.length > 0) {
        const currentActionId = settings.action_id
        const availableIds = personDetails.actions.map(a => a.id)
        if (!currentActionId || !availableIds.includes(currentActionId)) {
          setSettings(prev => ({ ...prev, action_id: personDetails.actions[0].id }))
        }
      } else {
        setSettings(prev => ({ ...prev, action_id: null }))
      }
      
      // 同步形象类型：如果数字人有 figure_type，则使用它
      if (personDetails.figure_type) {
        setSettings(prev => ({ ...prev, figure_type: personDetails.figure_type }))
      }
    }
  }, [personDetails, settings.action_id])

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      {/* 折叠标题 */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-700">高级设置</span>
          <span className="text-xs text-slate-400">（语速/语调/背景/字幕）</span>
        </div>
        {isOpen ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {/* 展开内容 */}
      {isOpen && (
        <div className="p-4 pt-0 space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
          {/* 第一行：语速和语调 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 语速 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                <Sliders size={12} /> 语速：{settings.speed.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={settings.speed}
                onChange={(e) => handleChange('speed', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>慢 (0.5x)</span>
                <span>正常 (1.0x)</span>
                <span>快 (2.0x)</span>
              </div>
            </div>

            {/* 语调 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                <Volume2 size={12} /> 语调：{settings.pitch.toFixed(1)}x
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={settings.pitch}
                onChange={(e) => handleChange('pitch', parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>低沉 (0.5x)</span>
                <span>正常 (1.0x)</span>
                <span>高亢 (2.0x)</span>
              </div>
            </div>
          </div>

          {/* 第二行：音量和语言 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 音量 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                <Volume2 size={12} /> 音量：{settings.volume}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={settings.volume}
                onChange={(e) => handleChange('volume', parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* 语言 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                <Type size={12} /> 语言
              </label>
              <select
                value={settings.language}
                onChange={(e) => handleChange('language', e.target.value)}
                className="w-full text-xs p-2 rounded border border-slate-200 bg-white"
              >
                <option value="cn">中文</option>
                <option value="en">英语</option>
                <option value="ja">日语</option>
                <option value="ko">韩语</option>
              </select>
            </div>
          </div>

          {/* 第三行：背景设置 */}
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
              <Palette size={12} /> 背景类型
            </label>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => handleChange('bg_type', 'color')}
                className={`flex-1 text-xs py-2 px-3 rounded border transition-all ${
                  settings.bg_type === 'color'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                纯色
              </button>
              <button
                onClick={() => handleChange('bg_type', 'image')}
                className={`flex-1 text-xs py-2 px-3 rounded border transition-all ${
                  settings.bg_type === 'image'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                图片
              </button>
              <button
                onClick={() => handleChange('bg_type', 'video')}
                className={`flex-1 text-xs py-2 px-3 rounded border transition-all ${
                  settings.bg_type === 'video'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                视频
              </button>
            </div>

            {settings.bg_type === 'color' && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={settings.bg_color}
                  onChange={(e) => handleChange('bg_color', e.target.value)}
                  className="w-8 h-8 rounded border border-slate-200 cursor-pointer"
                />
                <span className="text-xs text-slate-500">{settings.bg_color}</span>
              </div>
            )}

            {settings.bg_type === 'image' && (
              <div className="text-xs text-slate-500 p-2 bg-slate-50 rounded">
                📷 图片背景功能开发中...（需上传背景图片）
              </div>
            )}

            {settings.bg_type === 'video' && (
              <div className="text-xs text-slate-500 p-2 bg-slate-50 rounded">
                🎬 视频背景功能开发中...（需上传背景视频）
              </div>
            )}
          </div>

          {/* 第四行：形象类型和字幕开关 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 形象类型 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
                <Maximize size={12} /> 形象类型
                {personDetails?.figure_type && <span className="text-[10px] text-slate-400 ml-auto">当前数字人：{personDetails.figure_type}</span>}
              </label>
              <select
                value={settings.figure_type}
                onChange={(e) => handleChange('figure_type', e.target.value)}
                className="w-full text-xs p-2 rounded border border-slate-200 bg-white"
              >
                {/* 优先显示当前数字人的 figure_type */}
                {personDetails?.figure_type && (
                  <option value={personDetails.figure_type}>{personDetails.figure_type}</option>
                )}
                {/* 通用选项 */}
                <option value="whole_body">全身 (1080x1920)</option>
                <option value="sit_body">坐姿</option>
                <option value="waist_shot">半身像</option>
                <option value="head_shot">头像</option>
                <option value="circle_view">环视</option>
              </select>
              {personDetails?.figure_type && settings.figure_type !== personDetails.figure_type && (
                <p className="text-[10px] text-amber-600 mt-1">⚠️ 当前选择与数字人默认形象类型不一致，可能导致 API 报错</p>
              )}
            </div>

            {/* 字幕开关 */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col justify-center">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                  <Type size={12} /> 隐藏字幕
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.hide_subtitle}
                    onChange={(e) => handleChange('hide_subtitle', e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-10 h-5 rounded-full transition-colors ${
                    settings.hide_subtitle ? 'bg-blue-500' : 'bg-slate-300'
                  }`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.hide_subtitle ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </div>
                </div>
              </label>
              <p className="text-[10px] text-slate-400 mt-1">
                {settings.hide_subtitle ? '不显示字幕' : '显示蝉镜原生字幕'}
              </p>
            </div>
          </div>

          {/* 动作选择 */}
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
              <Film size={12} /> 动作选择
              {personDetails?.actions && personDetails.actions.length > 0 && (
                <span className="text-[10px] text-slate-400 ml-auto">
                  当前：{settings.action_id ? '手动选定' : '自动（数字人默认动作）'}
                </span>
              )}
            </label>
            {personDetails?.actions && personDetails.actions.length > 0 ? (
              <>
                <select
                  value={settings.action_id || ''}
                  onChange={(e) => handleChange('action_id', e.target.value)}
                  className="w-full text-xs p-2 rounded border border-slate-200 bg-white"
                >
                  <option value="">自动（使用数字人默认动作）</option>
                  {personDetails.actions.map((action, idx) => (
                    <option key={action.id} value={action.id}>
                      {action.name || `动作 ${idx + 1}`} (ID: {action.id.substring(0, 8)}...)
                    </option>
                  ))}
                </select>
                {settings.action_id === personDetails.actions[0]?.id && (
                  <p className="text-[10px] text-green-600 mt-1">✅ 当前使用数字人默认动作：{personDetails.actions[0].name || '动作 1'}</p>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-500 p-2 bg-slate-50 rounded">
                ℹ️ 该数字人没有可用动作，将使用默认驱动
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              {settings.action_id ? '✅ 使用选定的动作' : '🔄 根据驱动模式自动选择'}
            </p>
          </div>

          {/* 驱动模式 */}
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <label className="block text-xs font-bold text-slate-600 mb-2">驱动模式</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleChange('drive_mode', 'normal')}
                className={`flex-1 text-xs py-2 px-3 rounded border transition-all ${
                  settings.drive_mode === 'normal'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                正常驱动
              </button>
              <button
                onClick={() => handleChange('drive_mode', 'random')}
                className={`flex-1 text-xs py-2 px-3 rounded border transition-all ${
                  settings.drive_mode === 'random'
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}
              >
                随机驱动（自然）
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {settings.drive_mode === 'random' ? '✨ 添加自然微动作，使数字人更生动' : '标准动作驱动'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 中间：批量文案输入
// =====================================================
function BatchScriptInput({ scripts, setScripts, onAIGenerate }) {
  const [editorModeById, setEditorModeById] = useState({})
  const [jsonDraftById, setJsonDraftById] = useState({})
  const [jsonErrorById, setJsonErrorById] = useState({})

  const getPlan = (script) => script.copywritingPlan || createManualCopywritingPlan(script.text || '')

  const replaceScriptPlan = (scriptId, nextPlan, note = '手动结构化文案') => {
    setScripts((current) => current.map((script) => script.id === scriptId
      ? {
          ...script,
          text: nextPlan.spoken_text,
          copywritingPlan: nextPlan,
          note,
        }
      : script))
  }

  const handleAdd = () => {
    const id = Date.now() + scripts.length
    setScripts((current) => [...current, createManualScriptEntry(id)])
    setEditorModeById((current) => ({ ...current, [id]: 'segments' }))
  }

  const handleRemove = (id) => {
    setScripts((current) => current.filter((script) => script.id !== id))
    setEditorModeById((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setJsonDraftById((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const handlePlainTextChange = (scriptId, text) => {
    setScripts((current) => current.map((script) => {
      if (script.id !== scriptId) return script
      const plan = getPlan(script)
      const segments = Array.isArray(plan.segments) ? plan.segments : []

      // 单段手写文案可以直接编辑全文；多段结构必须在“段落”或“JSON”中修改，
      // 避免 spoken_text 已变化而 segments 仍指向旧文字。
      if (segments.length > 1) return script

      const base = segments[0] || makeManualSegment(0)
      const nextPlan = rebuildManualCopywritingPlan(plan, [{ ...base, text }])
      return {
        ...script,
        text: nextPlan.spoken_text,
        copywritingPlan: nextPlan,
        note: '手动结构化文案（单段）',
      }
    }))
  }

  const setEditorMode = (script, mode) => {
    const plan = getPlan(script)
    setEditorModeById((current) => ({ ...current, [script.id]: mode }))
    setJsonErrorById((current) => ({ ...current, [script.id]: '' }))
    if (mode === 'json') {
      setJsonDraftById((current) => ({
        ...current,
        [script.id]: JSON.stringify(plan, null, 2),
      }))
    }
  }

  const handleSegmentPatch = (script, segmentId, patch) => {
    const nextPlan = updateManualSegment(getPlan(script), segmentId, patch)
    replaceScriptPlan(
      script.id,
      nextPlan,
      `结构化文案（${nextPlan.segments.length} 个语义段，${nextPlan.transition_segments.length} 个场景替换段）`,
    )
  }

  const handleAddSegment = (script, afterIndex) => {
    const nextPlan = insertManualSegment(getPlan(script), afterIndex)
    replaceScriptPlan(script.id, nextPlan)
  }

  const handleRemoveSegment = (script, segmentId) => {
    const nextPlan = removeManualSegment(getPlan(script), segmentId)
    replaceScriptPlan(script.id, nextPlan)
  }

  const handleMoveSegment = (script, segmentId, direction) => {
    const nextPlan = moveManualSegment(getPlan(script), segmentId, direction)
    replaceScriptPlan(script.id, nextPlan)
  }

  const handleAutoSplit = (script) => {
    const plan = getPlan(script)
    if (plan.segments?.length > 1 && !window.confirm('自动分段会重新建立段落，并把所有段落先设为“数字人”。确定继续吗？')) {
      return
    }
    const segments = splitManualTextIntoSegments(plan.spoken_text || script.text)
    const nextPlan = rebuildManualCopywritingPlan({
      ...plan,
      meta: { ...(plan.meta || {}), auto_split_at: new Date().toISOString() },
    }, segments)
    replaceScriptPlan(script.id, nextPlan, `手动自动分段（${nextPlan.segments.length} 段）`)
    setEditorModeById((current) => ({ ...current, [script.id]: 'segments' }))
  }

  const handleApplyJson = (script) => {
    try {
      const nextPlan = parseManualCopywritingPlanJson(
        jsonDraftById[script.id] || '',
        script.text,
      )
      replaceScriptPlan(
        script.id,
        nextPlan,
        `JSON 结构化文案（${nextPlan.segments.length} 个语义段，${nextPlan.transition_segments.length} 个场景替换段）`,
      )
      setJsonDraftById((current) => ({
        ...current,
        [script.id]: JSON.stringify(nextPlan, null, 2),
      }))
      setJsonErrorById((current) => ({ ...current, [script.id]: '' }))
    } catch (error) {
      setJsonErrorById((current) => ({
        ...current,
        [script.id]: error?.message || String(error),
      }))
    }
  }

  const handleCopyJson = async (script) => {
    const value = JSON.stringify(getPlan(script), null, 2)
    setJsonDraftById((current) => ({ ...current, [script.id]: value }))
    try {
      await navigator.clipboard.writeText(value)
    } catch (error) {
      console.warn('[BatchScriptInput] 复制 JSON 失败:', error)
    }
  }

  return (
    <>
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
        <div>
          <Tooltip tip="为每个视频输入不同的播报文案" delay={1000}>
            <h2 className="text-sm font-bold text-slate-800">2. 输入批量文案 ({scripts.length} 条)</h2>
          </Tooltip>
          <p className="text-xs text-slate-500 mt-1">AI 与手动文案都保存纯口播、语义段落和场景替换标记</p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip tip="使用 AI 根据模板生成纯口播和结构化剪辑段落" delay={1000}>
            <button onClick={onAIGenerate} className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md hover:bg-purple-200 flex items-center gap-1">
              <Sparkles size={12} />
              AI 生成文案
            </button>
          </Tooltip>
          <Tooltip tip="添加一条可手动编辑段落和 JSON 的结构化文案" delay={1000}>
            <button onClick={handleAdd} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200">
              + 新增文案
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {scripts.map((script, idx) => {
          const plan = getPlan(script)
          const transitionCount = plan?.segments?.filter((segment) => segment.visual_mode === 'scene').length || 0
          const mode = editorModeById[script.id] || (script.copywritingPlan ? 'segments' : 'plain')
          const multiSegment = (plan?.segments?.length || 0) > 1

          return (
            <div key={script.id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
              <div className="flex justify-between items-start gap-3 mb-3">
                <div>
                  <span className="text-xs font-bold text-slate-500">视频 {idx + 1}</span>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {plan.segments.length} 个语义段 · {transitionCount} 个场景替换段 · {plan.spoken_text.length} 字
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {['plain', 'segments', 'json'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setEditorMode(script, item)}
                      className={`px-2 py-1 text-[10px] rounded ${mode === item ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {item === 'plain' ? '全文' : item === 'segments' ? '段落' : 'JSON'}
                    </button>
                  ))}
                  {scripts.length > 1 && (
                    <button onClick={() => handleRemove(script.id)} className="ml-1 text-red-400 hover:text-red-600">
                      <X size={16} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>

              {mode === 'plain' && (
                <div>
                  <textarea
                    className={`w-full h-32 text-sm resize-y rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-blue-200 ${multiSegment ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white border-slate-200'}`}
                    placeholder="输入该视频的完整播报文案..."
                    value={plan.spoken_text || script.text || ''}
                    readOnly={multiSegment}
                    onChange={(event) => handlePlainTextChange(script.id, event.target.value)}
                  />
                  {multiSegment && (
                    <p className="text-[10px] text-amber-600 mt-1">
                      当前是多段结构。为了避免全文与段落错位，请切换到“段落”修改文字，或在“JSON”中整体修改。
                    </p>
                  )}
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleAutoSplit(script)}
                      className="text-[10px] px-2.5 py-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      按标点自动建立段落
                    </button>
                  </div>
                </div>
              )}

              {mode === 'segments' && (
                <div>
                  <div className="flex items-center justify-between mb-2 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">可视化剪辑段落</p>
                      <p className="text-[10px] text-slate-400">选择“场景”后，该段会在生成后的 .rjdh.json 中换算成精确毫秒区间</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAutoSplit(script)}
                        className="text-[10px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                      >
                        自动分段
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddSegment(script, plan.segments.length - 1)}
                        className="text-[10px] px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                      >
                        + 添加段落
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                    {plan.segments.map((segment, segmentIndex) => {
                      const isScene = segment.visual_mode === 'scene'
                      return (
                        <div
                          key={segment.id || segmentIndex}
                          className={`rounded-lg border p-2.5 ${isScene ? 'border-purple-200 bg-purple-50' : 'border-slate-200 bg-white'}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono text-slate-400">{segment.id || `s${segmentIndex + 1}`}</span>
                              <select
                                value={segment.purpose || 'explain'}
                                onChange={(event) => handleSegmentPatch(script, segment.id, { purpose: event.target.value })}
                                className="text-[10px] rounded border border-slate-200 bg-white px-1.5 py-1"
                              >
                                <option value="hook">开场钩子</option>
                                <option value="pain_point">痛点</option>
                                <option value="explain">讲解</option>
                                <option value="trust">信任</option>
                                <option value="close">收尾</option>
                              </select>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={segmentIndex === 0}
                                onClick={() => handleMoveSegment(script, segment.id, -1)}
                                className="px-1.5 py-1 text-[10px] rounded bg-white border border-slate-200 disabled:opacity-30"
                              >↑</button>
                              <button
                                type="button"
                                disabled={segmentIndex === plan.segments.length - 1}
                                onClick={() => handleMoveSegment(script, segment.id, 1)}
                                className="px-1.5 py-1 text-[10px] rounded bg-white border border-slate-200 disabled:opacity-30"
                              >↓</button>
                              <button
                                type="button"
                                onClick={() => handleRemoveSegment(script, segment.id)}
                                className="px-1.5 py-1 text-[10px] rounded bg-red-50 text-red-600"
                              >删除</button>
                            </div>
                          </div>

                          <textarea
                            value={segment.text || ''}
                            onChange={(event) => handleSegmentPatch(script, segment.id, { text: event.target.value })}
                            placeholder="输入这一段实际要朗读的文字"
                            className="w-full min-h-20 resize-y rounded border border-slate-200 bg-white px-2.5 py-2 text-xs leading-5 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />

                          <div className="mt-2 flex items-center justify-between gap-2">
                            <div className="flex rounded border border-slate-200 overflow-hidden shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSegmentPatch(script, segment.id, { visual_mode: 'human', slot_id: null })}
                                className={`px-2.5 py-1.5 text-[10px] ${!isScene ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}
                              >数字人画面</button>
                              <button
                                type="button"
                                onClick={() => handleSegmentPatch(script, segment.id, { visual_mode: 'scene' })}
                                className={`px-2.5 py-1.5 text-[10px] ${isScene ? 'bg-purple-600 text-white' : 'bg-white text-slate-500'}`}
                              >场景替换</button>
                            </div>
                            {isScene && (
                              <input
                                value={segment.slot_id || ''}
                                onChange={(event) => handleSegmentPatch(script, segment.id, { slot_id: event.target.value })}
                                placeholder="slot_id，例如 slot_2"
                                className="min-w-0 flex-1 rounded border border-purple-200 bg-white px-2 py-1.5 text-[10px]"
                              />
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-1 gap-2">
                            <input
                              value={(segment.visual_tags || []).join('、')}
                              onChange={(event) => handleSegmentPatch(script, segment.id, {
                                visual_tags: event.target.value.split(/[、,，]/u).map((item) => item.trim()).filter(Boolean),
                              })}
                              placeholder="素材标签，例如：鹿场全景、梅花鹿群"
                              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px]"
                            />
                            <input
                              value={segment.note || ''}
                              onChange={(event) => handleSegmentPatch(script, segment.id, { note: event.target.value })}
                              placeholder="剪辑备注（可选）"
                              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[10px]"
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {mode === 'json' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold text-slate-700">结构化 JSON</p>
                      <p className="text-[10px] text-slate-400">可直接粘贴 AI JSON 或手动修改；应用时会校验 spoken_text 与 segments.text 是否一致</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setJsonDraftById((current) => ({ ...current, [script.id]: JSON.stringify(getPlan(script), null, 2) }))}
                        className="text-[10px] px-2 py-1 rounded bg-slate-100 text-slate-600"
                      >重新载入</button>
                      <button
                        type="button"
                        onClick={() => handleCopyJson(script)}
                        className="text-[10px] px-2 py-1 rounded bg-blue-50 text-blue-700"
                      >复制 JSON</button>
                      <button
                        type="button"
                        onClick={() => handleApplyJson(script)}
                        className="text-[10px] px-2 py-1 rounded bg-purple-600 text-white"
                      >应用 JSON</button>
                    </div>
                  </div>
                  <textarea
                    value={jsonDraftById[script.id] ?? JSON.stringify(plan, null, 2)}
                    onChange={(event) => setJsonDraftById((current) => ({ ...current, [script.id]: event.target.value }))}
                    spellCheck={false}
                    className="w-full h-80 resize-y rounded-lg border border-slate-300 bg-slate-950 text-emerald-300 p-3 font-mono text-[11px] leading-5 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                  {jsonErrorById[script.id] && (
                    <p className="mt-2 rounded bg-red-50 border border-red-200 px-2.5 py-2 text-[10px] text-red-600">
                      {jsonErrorById[script.id]}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

// =====================================================
// 右侧：保存路径配置（选择项目）
// =====================================================
function SavePathConfig({ selectedProject, setSelectedProject, projects, onGenerate, isGenerating, loadingProjects, onNavigateToFiles }) {
  return (
    <div className="w-80 bg-white flex flex-col h-full z-10">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-slate-800">3. 选择保存项目</h2>
          <p className="text-[10px] text-slate-500 mt-1">选择要保存数字人视频的项目</p>
        </div>
        {onNavigateToFiles && selectedProject && (
          <Tooltip tip={`跳转到文件浏览器查看：${selectedProject.path}/剪辑视频`} delay={1000}>
            <button
              onClick={() => onNavigateToFiles(`${selectedProject.path}/${PROJECT_FOLDERS.EDITED_VIDEO}`)}
              className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-md hover:bg-blue-200 transition-colors flex items-center gap-1"
            >
              <Folder size={12} />
              查看：{selectedProject.path}/剪辑视频
            </button>
          </Tooltip>
        )}
      </div>
      
      <div className="flex-1 p-4 space-y-6 overflow-y-auto custom-scrollbar">
        {/* 项目选择 */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Folder size={12} /> 选择 VFS 项目
          </label>
          {loadingProjects ? (
            <div className="text-xs text-slate-500 p-2">加载中...</div>
          ) : projects.length === 0 ? (
            <div className="text-xs text-amber-600 p-2 bg-amber-50 rounded border border-amber-200" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={12} /> 暂无项目，请先在文件浏览器中创建视频项目
            </div>
          ) : (
            <select
              className="w-full text-xs p-2 rounded border border-slate-200 bg-white"
              value={selectedProject?.path || ''}
              onChange={e => {
                const project = projects.find(p => p.path === e.target.value)
                setSelectedProject(project)
              }}
            >
              <option value="">-- 请选择项目 --</option>
              {projects.map(project => (
                <option key={project.path} value={project.path}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
          {selectedProject && (
            <p className="text-[10px] text-slate-500 mt-2">
              📂 视频将保存到：<code className="bg-slate-100 px-1 rounded">{selectedProject.path}/{PROJECT_FOLDERS.EDITED_VIDEO}</code>
            </p>
          )}
        </div>

        {/* 使用说明 */}
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <h4 className="text-xs font-bold text-blue-800 mb-2" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Book size={12} /> 使用流程</h4>
          <ol className="text-[10px] text-blue-700 space-y-1 list-decimal list-inside">
            <li>选择数字人和声音</li>
            <li>输入批量文案</li>
            <li>选择要保存到的项目</li>
            <li>点击生成，视频保存到项目 剪辑视频 目录</li>
            <li>前往【批量处理】进行后期合成</li>
          </ol>
        </div>
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <Tooltip tip="开始生成数字人视频，视频将保存到所选项目的剪辑视频目录" delay={1000}>
          <button
            onClick={onGenerate}
            disabled={isGenerating || !selectedProject}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 flex justify-center items-center gap-2 transition-all"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4"></span>
                生成中...
              </>
            ) : (
              <><Rocket size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} /> 生成数字人视频</>
            )}
          </button>
        </Tooltip>
        <p className="text-[10px] text-slate-400 text-center mt-2">
          视频将保存到所选项目的 剪辑视频 目录
        </p>
      </div>
    </div>
  )
}

// =====================================================
// 流水线进度面板 (覆盖层)
// =====================================================
function PipelineProgress({ tasks, generatedVideos, onClose, onMinimize, onPreviewVideo }) {
  if (tasks.length === 0) return null

  const runningCount = tasks.filter(t => t.stage !== 'done' && t.stage !== 'failed').length
  const successCount = tasks.filter(t => t.stage === 'done').length
  const failedCount = tasks.filter(t => t.stage === 'failed').length
  const allDone = runningCount === 0 && failedCount === 0

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-base font-bold text-slate-800" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Inbox size={16} /> 生成进度
            {allDone && <span className="ml-2 text-xs text-green-600 font-bold">✓ 全部完成</span>}
          </h3>
          <div className="flex items-center gap-2">
            {!allDone && (
              <button onClick={onMinimize} className="text-slate-400 hover:text-slate-600 text-sm px-2 py-1 rounded hover:bg-slate-100" title="最小化到右下角">
                − 最小化
              </button>
            )}
            <button 
              onClick={onClose} 
              className={`${allDone ? 'bg-green-500 hover:bg-green-600 text-white' : 'text-slate-400 hover:text-slate-600'} text-sm px-4 py-1.5 rounded transition-colors`}
            >
              {allDone ? '✓ 完成' : '×'}
            </button>
          </div>
        </div>
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
          {tasks.map((task, idx) => {
            const video = generatedVideos?.find(v => v.id === task.id)
            return (
              <div key={task.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-600">
                    视频 {idx + 1}: {task.text}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    task.stage === 'done' ? 'bg-green-100 text-green-700' :
                    task.stage === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {task.stage === 'dh_generating' && <><Film size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> 数字人生成中</>}
                    {task.stage === 'downloading' && <><Download size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> 下载视频中</>}
                    {task.stage === 'done' && <><Check size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> 完成</>}
                    {task.stage === 'failed' && <><X size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} /> 失败</>}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${
                      task.stage === 'failed' ? 'bg-red-500' : 
                      task.stage === 'done' ? 'bg-green-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                {task.error && (
                  <p className="text-[10px] text-red-500 mt-1">{task.error}</p>
                )}
                {task.stage === 'done' && video && (
                  <div className="mt-2 space-y-2">
                    <button
                      onClick={() => onPreviewVideo(video)}
                      className="w-full py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-1"
                    >
                      <Film size={12} /> 预览视频
                    </button>
                    {video.project?.transition_segments?.length > 0 && (
                      <div className="rounded border border-purple-200 bg-purple-50 p-2">
                        <p className="text-[10px] font-semibold text-purple-800 mb-1">
                          已写入 JSON 的场景替换时间：{video.project.transition_segments.length} 段
                        </p>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {video.project.transition_segments.map((clip, clipIndex) => (
                            <div key={clip.segment_id || clipIndex} className="text-[10px] text-purple-700 flex gap-2">
                              <span className="font-mono shrink-0">
                                {(Number(clip.start_ms || 0) / 1000).toFixed(2)}s-
                                {(Number(clip.end_ms || 0) / 1000).toFixed(2)}s
                              </span>
                              <span className="truncate">{clip.slot_id || clip.segment_id}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {allDone && (
          <div className="p-4 border-t border-slate-100 bg-green-50">
            <p className="text-sm text-green-700 text-center">
              ✓ 所有视频已生成完成，已保存到项目的 <strong>剪辑视频</strong> 目录
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// =====================================================
// 视频预览弹窗
// =====================================================
function VideoPreviewModal({ video, onClose, vfs }) {
  const [videoUrl, setVideoUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let blobUrl = null
    
    const loadVideo = async () => {
      try {
        console.log('[VideoPreviewModal] 开始加载视频:', video.path)
        
        if (!vfs) {
          setError('VFS 未初始化')
          setLoading(false)
          return
        }
        
        // 必须走 VFS 的二进制解码器。readFile(..., 'binary') 在 Electron IPC 下
        // 可能返回 {type:'Buffer', data:'base64...'}，直接 new Blob([object]) 会损坏 MP4。
        const sourceBlob = await vfs.readFileAsBlob(video.path)
        if (!(sourceBlob instanceof Blob) || sourceBlob.size <= 0) {
          throw new Error('VFS 返回的不是有效视频 Blob')
        }
        const mimeType = sourceBlob.type && sourceBlob.type.startsWith('video/')
          ? sourceBlob.type
          : 'video/mp4'
        const blob = sourceBlob.type === mimeType
          ? sourceBlob
          : new Blob([await sourceBlob.arrayBuffer()], { type: mimeType })
        console.log('[VideoPreviewModal] 正确解码后的 Blob:', {
          size: blob.size,
          type: blob.type,
          path: video.path,
        })
        
        blobUrl = URL.createObjectURL(blob)
        console.log('[VideoPreviewModal] Blob URL:', blobUrl.substring(0, 50) + '...')
        
        setVideoUrl(blobUrl)
        setLoading(false)
      } catch (err) {
        console.error('[VideoPreviewModal] 加载视频失败:', err)
        setError('加载视频失败：' + err.message)
        setLoading(false)
      }
    }
    
    loadVideo()
    
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
      setVideoUrl('')
    }
  }, [video.path, vfs])

  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* 🎨 修改：针对 9:16 竖屏视频优化窗口尺寸 */}
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" 
           style={{ width: 'min(450px, 90vw)', height: 'min(800px, 90vh)' }}
           onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="flex justify-between items-center p-3 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
          <h3 className="font-semibold text-base text-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
            预览：{video.fileName}
          </h3>
          <button className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500" onClick={onClose} title="关闭预览">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        {/* 视频播放区域 - 黑色背景适配 9:16 竖屏 */}
        <div className="flex-1 min-h-0 bg-black flex items-center justify-center p-4">
          {loading ? (
            <div className="text-slate-400 flex items-center gap-2">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              加载中...
            </div>
          ) : error ? (
            <div className="text-red-400 flex items-center gap-2">
              <AlertCircle size={24} />
              {error}
            </div>
          ) : (
            <video
              controls
              autoPlay
              preload="metadata"
              className="max-h-full max-w-full rounded-lg shadow-2xl"
              style={{ aspectRatio: '9/16' }}
              src={videoUrl}
              onLoadedMetadata={(event) => {
                console.log('[VideoPreviewModal] 视频元数据加载成功', {
                  duration: event.currentTarget.duration,
                  videoWidth: event.currentTarget.videoWidth,
                  videoHeight: event.currentTarget.videoHeight,
                })
              }}
              onError={(event) => {
                const mediaError = event.currentTarget?.error
                const detail = mediaError?.message || `MediaError code=${mediaError?.code || 'unknown'}`
                console.error('[VideoPreviewModal] 浏览器无法解码视频:', detail)
                setError(`视频文件已读取，但播放器无法解码：${detail}`)
              }}
            >
              您的浏览器不支持视频
            </video>
          )}
        </div>
        {/* 底部文案信息 */}
        <div className="p-3 border-t border-slate-200 flex-shrink-0 bg-slate-50">
          <p className="text-xs text-slate-500 truncate">
            <span className="font-medium text-slate-600">文案：</span>{video.text}
          </p>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 最小化进度悬浮窗 (右下角)
// =====================================================
function MinimizedProgress({ tasks, onExpand, onClose }) {
  if (tasks.length === 0) return null

  const runningCount = tasks.filter(t => t.stage !== 'done' && t.stage !== 'failed').length
  const successCount = tasks.filter(t => t.stage === 'done').length
  const failedCount = tasks.filter(t => t.stage === 'failed').length
  const allDone = runningCount === 0

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-2">
      {/* 关闭按钮 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-full p-1.5 transition-colors shadow-lg"
        title="关闭进度查看"
      >
        <X size={16} />
      </button>
      {/* 进度悬浮球 */}
      <div 
        className={`bg-white rounded-full shadow-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-105 ${
          allDone ? 'border-green-500' : 'border-blue-500 animate-pulse'
        }`}
        onClick={onExpand}
        style={{ width: '64px', height: '64px' }}
      >
        <div className="w-full h-full flex flex-col items-center justify-center">
          <Inbox size={20} className={allDone ? 'text-green-500' : 'text-blue-500'} />
          <span className={`text-xs font-bold ${allDone ? 'text-green-600' : 'text-blue-600'}`}>
            {runningCount > 0 ? runningCount : (failedCount > 0 ? '!' : '✓')}
          </span>
        </div>
      </div>
      {/* 简单状态提示 */}
      <div className="absolute bottom-full right-0 mb-2 bg-slate-800 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap shadow-lg">
        {allDone ? (
          <span>✓ 全部完成 ({successCount}/{tasks.length})，点击展开查看详情</span>
        ) : (
          <span>⟳ 进行中：{runningCount} 个任务，点击展开查看详情</span>
        )}
        <div className="absolute top-full right-4 mt-1 border-4 border-transparent border-t-slate-800"></div>
      </div>
    </div>
  )
}
// =====================================================
// AI 文案生成表单弹窗（鹿场直销专用版）
// =====================================================
function AIScriptForm({ template, productInfo, setProductInfo, onSubmit, onCancel, isGenerating }) {
  // 鹿场直销风格提示词模板
  const FARM_DIRECT_PROMPT = `你是一名抖音/快手农产品口播带货脚本专家。

请围绕【产品名称】生成一条"知识科普型 + 强对比 + 防踩坑 + 鹿场老板直销"的口播带货文案。

整体风格必须像真实东北鹿场老板/老妹在镜头前讲话：直接、接地气、有节奏、有情绪起伏，不要写成品牌广告，不要写得文绉绉，也不要出现"尊贵、臻选、匠心、品质生活"这类空话。

## 核心写法

文案必须严格按照下面的成交逻辑：

1. **开场制造焦虑和反差**
   - 用"想买 XX 的家人们，这条视频你必须看完，不然很容易买错/上当"开头。
   - 第一秒就点出消费者最关心的区别。
   - 要有明显的"一个字不同，东西差很多"的反差感。

2. **解释产品来源**
   - 用通俗、口语化方式讲清楚产品到底从哪里来。
   - 不要像百科解释，要像老板在现场给顾客讲。
   - 加入"每年什么时候""哪个环节""为什么难得"等信息，强化稀缺感。

3. **对比另一种容易混淆的产品**
   - 必须明确讲出两者来源、颜色、状态、工艺、价格或市场乱象的差别。
   - 对比要强，让观众自然觉得"懂行的人会选前者"。
   - 不要出现医疗、治病等违规功效承诺。

4. **加入市场造假提醒**
   - 必须有一段"市面上很多人拿 XX 冒充 XX"的提醒。
   - 语气要像提醒自家人，不要像恶意攻击同行。

5. **给出简单辨别方法**
   - 至少给 2 个观众能听懂的辨别点。
   - 可从颜色、摇晃状态、沉淀、挂杯、包装标签、批次信息等角度写。
   - 语气要像："你记住这两点，基本就不容易买错。"

6. **鹿场实力背书**
   - 加入"自家鹿场""养了多少头梅花鹿""从养殖到灌装自己做"等信息。
   - 让观众感觉是源头老板在卖，不是中间商。

7. **结尾成交引导**
   - 用"粉丝价""地板价""库存有限""想要的点链接"等方式收口。
   - 结尾要带一点人情味。

## 输出格式要求

请直接输出完整口播文案。
请按自然语义分段；禁止把导演口令写进口播。
剪辑意图由结构化 segments 表达；不要在 spoken_text 中写镜头说明。
全文控制在 450～650 字。
语言必须口语化，像真人一镜到底口播，节奏要快，句子不要太长。

## 产品信息
产品名称：【填写产品名称】
核心对比对象：【填写容易混淆的产品】
鹿场规模：【例如：自家鹿场养了 1000 头梅花鹿】
主要卖点：【例如：源头养殖、原料可追溯、规范灌装、粉丝价】
想强调的辨别点：【例如：颜色、摇晃状态、批次信息、鹿场溯源】
成交方式：【例如：点击下方链接、评论区扣"鹿"、直播间领取福利】
目标人群：【例如：送礼、爱喝酒的中年男性、东北特产爱好者】

请生成一条具有"鹿茸血和鹿血区别"这种强反差、强科普、强防坑、强成交风格的口播文案。`

// 获取当前选中的风格信息
  const currentStyle = { label: '鹿场直销', icon: Store }

  const buildRecommendedPrompt = (info) => FARM_DIRECT_PROMPT
    .replace('【填写产品名称】', info.product_name || '鹿茸血口服液')
    .replace('【填写容易混淆的产品】', info.comparison_product || '普通鹿血/假冒产品')
    .replace('【例如：自家鹿场养了 1000 头梅花鹿】', info.farm_scale || '自家鹿场养殖')
    .replace('【例如：源头养殖、原料可追溯、规范灌装、粉丝价】', info.selling_points || '源头养殖、原料可追溯、规范灌装、粉丝价')
    .replace('【例如：颜色、摇晃状态、批次信息、鹿场溯源】', info.identification_points || '颜色、摇晃状态、批次信息、鹿场溯源')
    .replace('【例如：点击下方链接、评论区扣"鹿"、直播间领取福利】', info.call_to_action || '点击下方链接、评论区留言')
    .replace('【例如：送礼、爱喝酒的中年男性、东北特产爱好者】', info.target_audience || '送礼、爱喝酒的中年男性、东北特产爱好者')

  // 选中模板打开表单时，自动填入平台推荐提示词，不再要求用户手动点“重置”。
  useEffect(() => {
    setProductInfo((previous) => {
      if (previous.customPrompt && previous.customPrompt.trim()) return previous
      return {
        ...previous,
        customPrompt: buildRecommendedPrompt(previous),
      }
    })
  }, [template?.id, setProductInfo])
  
  // 应用模板到自定义提示词（动态填充产品信息）
  const applyTemplate = () => {
    setProductInfo((previous) => ({
      ...previous,
      customPrompt: buildRecommendedPrompt(previous),
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* 头部 - 展示选中的模板 */}
        <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-violet-50 via-purple-50 to-fuchsia-50">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl shadow-lg">
                <Sparkles size={22} className="text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">AI 文案生成</h3>
                <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/70 rounded-full">
                    <FileText size={11} className="text-violet-600" />
                    <span className="font-medium text-violet-700">{template?.name || '未选择模板'}</span>
                  </span>
                  <span className="text-slate-400">•</span>
                  <span>{template?.segments?.length || 0} 个段落</span>
                </p>
              </div>
            </div>
            <button 
              onClick={onCancel} 
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

{/* 表单内容 */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* 产品信息输入区 */}
          <div className="mb-6 p-4 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl border border-violet-100">
            <div className="flex items-center gap-2 mb-3">
              <Package size={15} className="text-violet-600" />
              <p className="text-xs font-semibold text-violet-800">产品信息</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">产品名称 *</label>
                <input
                  type="text"
                  value={productInfo.product_name || ''}
                  onChange={(e) => setProductInfo({ ...productInfo, product_name: e.target.value })}
                  placeholder="例如：鹿茸血口服液"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">核心对比对象</label>
                <input
                  type="text"
                  value={productInfo.comparison_product || ''}
                  onChange={(e) => setProductInfo({ ...productInfo, comparison_product: e.target.value })}
                  placeholder="例如：普通鹿血/假冒产品"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">鹿场规模</label>
                <input
                  type="text"
                  value={productInfo.farm_scale || ''}
                  onChange={(e) => setProductInfo({ ...productInfo, farm_scale: e.target.value })}
                  placeholder="例如：自家鹿场养了 1000 头梅花鹿"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 block mb-1">目标人群</label>
                <input
                  type="text"
                  value={productInfo.target_audience || ''}
                  onChange={(e) => setProductInfo({ ...productInfo, target_audience: e.target.value })}
                  placeholder="例如：送礼、中年男性"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-slate-600 block mb-1">主要卖点</label>
                <input
                  type="text"
                  value={productInfo.selling_points || ''}
                  onChange={(e) => setProductInfo({ ...productInfo, selling_points: e.target.value })}
                  placeholder="例如：源头养殖、原料可追溯、规范灌装、粉丝价"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-slate-600 block mb-1">想强调的辨别点</label>
                <input
                  type="text"
                  value={productInfo.identification_points || ''}
                  onChange={(e) => setProductInfo({ ...productInfo, identification_points: e.target.value })}
                  placeholder="例如：颜色、摇晃状态、批次信息、鹿场溯源"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11px] font-medium text-slate-600 block mb-1">成交方式</label>
                <input
                  type="text"
                  value={productInfo.call_to_action || ''}
                  onChange={(e) => setProductInfo({ ...productInfo, call_to_action: e.target.value })}
                  placeholder="例如：点击下方链接、评论区留言"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
            </div>
          </div>

          {/* 提示词编辑区 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Store size={18} className="text-amber-600" />
                <label className="text-sm font-semibold text-slate-700">鹿场直销文案提示词</label>
              </div>
              <button
                onClick={applyTemplate}
                className="text-xs text-amber-600 hover:text-amber-800 flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 rounded-lg transition-all"
                title="重新填充默认提示词模板"
              >
                <Wand2 size={12} />
                重置提示词模板
              </button>
            </div>
            <div className="relative">
              <textarea
                value={productInfo.customPrompt || ''}
                onChange={(e) => setProductInfo({ ...productInfo, customPrompt: e.target.value })}
                rows={12}
                className="w-full px-4 py-3 text-sm border-2 border-amber-200 rounded-xl outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100 transition-all resize-none font-mono text-slate-700 placeholder:text-slate-400 leading-relaxed"
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Lightbulb size={10} />
                  AI 将严格按照提示词要求创作文案
                </span>
              </div>
            </div>
            <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-800 font-medium mb-1">💡 使用说明</p>
              <ul className="text-[11px] text-amber-700 space-y-1 list-disc list-inside">
                <li>提示词已预设为"鹿场直销型"文案模板，适合鹿茸血、鹿血等农产品带货</li>
                <li>你可以直接编辑提示词，定制你的专属文案要求</li>
                <li>点击"重置提示词模板"可恢复默认模板</li>
                <li>文案会自动按照模板要求的结构生成（开场反差 → 产品来源 → 对比 → 防坑 → 辨别 → 背书 → 成交）</li>
              </ul>
            </div>
          </div>

          {/* 生成预览卡片 */}
          <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-4 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={15} className="text-amber-600" />
              <p className="text-xs font-semibold text-amber-800">生成配置</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-amber-700">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>模板：<span className="font-medium">{template?.name || '-'}</span></span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-amber-700">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>段落结构：<span className="font-medium">{template?.segments?.length || 0} 段</span></span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-amber-700">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>文案类型：<span className="font-medium">鹿场直销型（知识科普 + 强对比 + 防踩坑）</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isGenerating}
            className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isGenerating}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 rounded-xl disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-violet-200 transition-all"
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>生成中...</span>
              </>
            ) : (
              <>
                <Sparkles size={16} />
                <span>立即生成</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 主组件
// =====================================================
export default function DigitalHumanStudio({ apiKey, apiBaseUrl, preselectedPerson, vfs, onPreselectedPersonUsed, onNavigateToFiles }) {
  const [persons, setPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [selectedPersonDetails, setSelectedPersonDetails] = useState(null) // 数字人详情（包含可用动作）
  const [selectedVoice, setSelectedVoice] = useState('')
  const [scripts, setScripts] = useState([createManualScriptEntry()])
  
  // AI 文案生成相关状态
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)

  // AI 生成文案的产品信息（鹿场直销专用）
  const [productInfo, setProductInfo] = useState({
    customPrompt: '',
    product_name: '',
    comparison_product: '普通鹿血/假冒产品',
    farm_scale: '自家鹿场养殖',
    selling_points: '源头养殖、原料可追溯、规范灌装、粉丝价',
    identification_points: '颜色、摇晃状态、批次信息、鹿场溯源',
    call_to_action: '点击下方链接/评论区留言',
    target_audience: '送礼、爱喝酒的中年男性、东北特产爱好者',
  })
  
  // AI 文案生成表单弹窗状态
  const [showScriptForm, setShowScriptForm] = useState(false)
  const [tempSelectedTemplate, setTempSelectedTemplate] = useState(null)

  // 高级设置
  const [advancedSettings, setAdvancedSettings] = useState({
    speed: 1.0,        // 语速
    pitch: 1.0,        // 语调
    volume: 100,       // 音量
    language: 'cn',    // 语言
    bg_type: 'color',  // 背景类型
    bg_color: '#EDEDED', // 背景颜色
    figure_type: 'whole_body', // 形象类型
    hide_subtitle: false, // 隐藏字幕
    drive_mode: 'random', // 驱动模式
    action_id: null,   // 动作 ID（由数字人详情自动同步）
    // 🎨 字幕配置（与 GlobalParamsVisualEditor.jsx 统一）
    subtitle_config: {
      position: 'bottom',
      font_size: 72,
      x_offset: 0,
      y_offset: -80,
      color: '#FFFF00',
      stroke_color: '#000000',
      stroke_width: 3,
      background_color: 'rgba(0, 0, 0, 0.4)',
      background_padding: 8,
      background_radius: 8,
      effect: 'ad',
    }
  })
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  // 项目选择
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [loadingProjects, setLoadingProjects] = useState(true)

  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [pipelineTasks, setPipelineTasks] = useState([])
  const resumedTaskIdsRef = useRef(new Set())
  const [showProgress, setShowProgress] = useState(false)
  const [minimizedProgress, setMinimizedProgress] = useState(false)
  const [generatedVideos, setGeneratedVideos] = useState([]) // 存储已生成的视频路径
  const [previewVideo, setPreviewVideo] = useState(null) // 当前预览的视频
  
  // AI 生成文案处理函数
  const handleAIGenerateScript = async () => {
    // 打开模板选择器
    setShowTemplateManager(true)
  }

  const handleSelectTemplate = (template) => {
    console.log('[DigitalHumanStudio] 选择模板:', template?.id, template?.name)
    // 直接设置所有状态，React 会批量更新
    setTempSelectedTemplate(template)
    setProductInfo((previous) => ({ ...previous, customPrompt: '' }))
    setShowTemplateManager(false)
    setShowScriptForm(true)
    console.log('[DigitalHumanStudio] 表单已打开，template:', template?.id, template?.name)
  }

  const handleSubmitScriptForm = () => {
    console.log('[handleSubmitScriptForm] tempSelectedTemplate:', tempSelectedTemplate)
    console.log('[handleSubmitScriptForm] productInfo:', productInfo)
    
    if (!tempSelectedTemplate) {
      alert('请先选择一个模板')
      return
    }
    
    // 调用 AI 生成文案（鹿场直销专用）
    generateScriptFromTemplate(
      tempSelectedTemplate,
      productInfo.customPrompt || ''
    )
    
    setShowScriptForm(false)
    setTempSelectedTemplate(null)
  }

  const generateScriptFromTemplate = async (template, customPrompt) => {
    setIsGeneratingScript(true)
    try {
      if (!template) throw new Error('未选择模板，请先选择一个模板')
      const copywritingPlan = normalizeCopywritingPlan(await aiGenerateScript({
        customPrompt,
        templateId: template.id,
        segments: template.segments || [],
        productName: productInfo.product_name,
        sellingPoints: productInfo.selling_points,
        targetAudience: productInfo.target_audience,
        tone: 'farm_direct',
        comparisonProduct: productInfo.comparison_product,
        farmScale: productInfo.farm_scale,
        identificationPoints: productInfo.identification_points,
        callToAction: productInfo.call_to_action,
      }))

      if (!copywritingPlan.spoken_text) throw new Error('AI 没有返回可朗读的 spoken_text')
      const sceneCount = copywritingPlan.segments.filter((item) => item.visual_mode === 'scene').length
      const newScript = {
        id: Date.now(),
        text: copywritingPlan.spoken_text,
        copywritingPlan: {
          ...copywritingPlan,
          meta: { ...(copywritingPlan.meta || {}), template_id: template.id, template_name: template.name },
        },
        note: `AI 结构化文案（${copywritingPlan.segments.length} 个语义段，${sceneCount} 个场景素材段）`,
      }

      if (scripts.length === 1 && !scripts[0].text) setScripts([newScript])
      else setScripts([...scripts, newScript])

      alert(`✅ AI 文案生成成功：纯口播 ${copywritingPlan.spoken_text.length} 字，${sceneCount} 个场景素材段。`)
    } catch (err) {
      console.error('[DigitalHumanStudio] AI 文案生成失败:', err)
      alert('AI 文案生成失败：' + err.message)
    } finally {
      setIsGeneratingScript(false)
      setSelectedTemplate(null)
    }
  }

  // 从 localStorage 恢复之前的任务状态
  useEffect(() => {
    try {
      const savedTasks = localStorage.getItem('dh_pipeline_tasks')
      const savedVideos = localStorage.getItem('dh_generated_videos')
      const savedMinimized = localStorage.getItem('dh_minimized_progress')
      
      if (savedTasks) {
        const parsedTasks = JSON.parse(savedTasks)
        // 只恢复未完成的任务
        const hasRunningTasks = parsedTasks.some(t => t.stage !== 'done' && t.stage !== 'failed')
        if (hasRunningTasks) {
          setPipelineTasks(parsedTasks)
          // 🔴 不自动显示进度窗口，让用户自己决定何时查看
          // setShowProgress(true)
          
          // 如果之前是最小化状态，恢复最小化悬浮窗
          if (savedMinimized === 'true') {
            setMinimizedProgress(true)
          }
        }
      }
      
      if (savedVideos) {
        setGeneratedVideos(JSON.parse(savedVideos))
      }
    } catch (err) {
      console.error('[DigitalHumanStudio] 恢复任务状态失败:', err)
    }
  }, [])
  
  // 保存任务状态到 localStorage
  useEffect(() => {
    if (pipelineTasks.length > 0) {
      localStorage.setItem('dh_pipeline_tasks', JSON.stringify(pipelineTasks))
    } else {
      localStorage.removeItem('dh_pipeline_tasks')
    }
  }, [pipelineTasks])
  
  // 保存已生成视频列表到 localStorage
  useEffect(() => {
    if (generatedVideos.length > 0) {
      localStorage.setItem('dh_generated_videos', JSON.stringify(generatedVideos))
    } else {
      localStorage.removeItem('dh_generated_videos')
    }
  }, [generatedVideos])
  
  // 保存最小化状态到 localStorage
  useEffect(() => {
    localStorage.setItem('dh_minimized_progress', minimizedProgress.toString())
  }, [minimizedProgress])

  // 恢复新版字级时间轴任务。任务自身保存 savePath/copywritingPlan，页面刷新后仍可完成落盘。
  useEffect(() => {
    if (isGenerating) return

    const timer = setTimeout(() => {
      const runningTasks = pipelineTasks.filter((task) =>
        task.apiVersion === 'timeline_v1' &&
        task.dhTaskId &&
        ['dh_generating', 'downloading'].includes(task.stage) &&
        !resumedTaskIdsRef.current.has(task.id)
      )

      runningTasks.forEach((task) => {
        resumedTaskIdsRef.current.add(task.id)
        ;(async () => {
          try {
            const vfs = getVFS()
            await vfs.init()
            const baseUrl = task.apiBaseUrl || getDigitalHumanBaseUrl()
            let status = await getTimelineDigitalHumanTask(task.dhTaskId, baseUrl)
            if (['queued', 'running'].includes(status.status)) {
              status = await waitForTimelineDigitalHumanTask(task.dhTaskId, {
                baseUrl,
                onProgress: (progress) => setPipelineTasks((prev) => prev.map((item) =>
                  item.id === task.id ? { ...item, progress: Math.min(55, Math.round(progress * 0.55)) } : item
                )),
              })
            }
            if (!status?.ok || status.status !== 'success' || !status.result) {
              throw new Error(status?.error?.message || '数字人任务未成功完成')
            }
            if (!Array.isArray(status.result.char_timings) || !status.result.char_timings.length) {
              const timingResult = await getTimelineCharTimings(task.dhTaskId, baseUrl)
              status.result.char_timings = timingResult?.char_timings || []
            }

            const resumedFullText = requireFullSpokenText(
              task.copywritingPlan || { spoken_text: task.scriptText },
              task.scriptText
            )
            const resumedIntegrity = validateDigitalHumanResult(status.result, resumedFullText)
            status.result.generation_integrity = resumedIntegrity
            console.log('[DigitalHumanStudio] 恢复任务完整性校验通过:', resumedIntegrity)

            const identityVerification = verifyGeneratedPersonIdentity(status.result, task.personId)
            if (!identityVerification.verified) {
              console.warn('[DigitalHumanStudio] 恢复任务时后端未返回 resolved_person_id:', identityVerification)
            }

            const savePath = task.savePath
            if (!savePath) throw new Error('恢复任务缺少 VFS 保存目录')
            await vfs.createDirectory(savePath, true)
            setPipelineTasks((prev) => prev.map((item) =>
              item.id === task.id ? { ...item, stage: 'downloading', progress: 65 } : item
            ))

            const fileName = task.fileName || `dh_${safeFilePart(task.personName, task.personId || 'human')}_${Date.now()}_${task.id.slice(-6)}.mp4`
            const videoPath = task.videoPath || `${savePath}/${fileName}`
            const originalVideoUrl = status.result.video_url
            const { blob: videoBlob, url: resolvedVideoUrl, attempts: videoDownloadAttempts } =
              await downloadDigitalHumanVideo({
                result: status.result,
                baseUrl,
                taskId: task.dhTaskId,
              })
            status.result.video_url = resolvedVideoUrl
            console.log('[DigitalHumanStudio] 恢复任务视频地址:', {
              originalVideoUrl,
              resolvedVideoUrl,
              attempts: videoDownloadAttempts,
            })
            await vfs.writeFile(videoPath, await videoBlob.arrayBuffer(), { type: videoBlob.type || 'video/mp4' })

            const project = buildDigitalHumanProject({
              taskId: task.dhTaskId,
              result: status.result,
              copywritingPlan: task.copywritingPlan || { spoken_text: task.scriptText },
              personId: task.personId,
              personName: task.personName,
              legacyPersonId: task.legacyPersonId,
              selectionKey: task.personSelectionKey,
              identitySource: task.personIdentitySource,
              identityVerification,
              audioManId: task.audioManId,
              apiBaseUrl: baseUrl,
              videoPath,
            })
            const projectPath = sidecarPathForVideo(videoPath)
            await writeDigitalHumanProject(vfs, projectPath, project)

            setPipelineTasks((prev) => prev.map((item) =>
              item.id === task.id ? { ...item, stage: 'done', progress: 100, videoPath, projectPath } : item
            ))
            setGeneratedVideos((prev) => {
              if (prev.some((item) => item.projectPath === projectPath)) return prev
              return [...prev, {
                id: task.id,
                path: videoPath,
                fileName,
                projectPath,
                text: project.copywriting.spoken_text,
                project,
              }]
            })
          } catch (error) {
            console.error('[DigitalHumanStudio] 恢复字级时间轴任务失败:', error)
            setPipelineTasks((prev) => prev.map((item) =>
              item.id === task.id ? { ...item, stage: 'failed', error: error.message } : item
            ))
          }
        })()
      })
    }, 1500)

    return () => clearTimeout(timer)
  }, [pipelineTasks, isGenerating])

  useEffect(() => {
    // 加载数字人、声音和项目列表
    const loadData = async () => {
      try {
        const vfs = getVFS()
        await vfs.init()
        
        // 加载数字人、声音列表，添加 token 过期错误处理
        let commonPersonsRes, customPersonsRes, voicesRes

        const listResults = await Promise.allSettled([
          getCommonPersons(),
          getCustomPersons(),
          getVoices(),
        ])
        const listNames = ['公共数字人', '自定义数字人', '声音列表']
        const listFallback = () => ({ data: { code: 0, data: [] } })

        ;[commonPersonsRes, customPersonsRes, voicesRes] = listResults.map((settled, index) => {
          if (settled.status === 'fulfilled') return settled.value

          const apiErr = settled.reason
          const detail =
            apiErr?.responseData?.detail?.message ||
            apiErr?.responseData?.detail ||
            apiErr?.responseData?.message ||
            apiErr?.data?.message ||
            apiErr?.message ||
            '未知错误'

          console.error(`[DigitalHumanStudio] ${listNames[index]}加载失败:`, {
            message: apiErr?.message,
            code: apiErr?.code,
            data: apiErr?.data,
            responseData: apiErr?.responseData,
          })
          setStatusMsg(`${listNames[index]}加载失败，其他数据继续加载：${detail}`)
          return listFallback()
        })

const [cRes, pRes, vRes] = [commonPersonsRes, customPersonsRes, voicesRes]
        
        let all = []
        if (cRes?.data?.code === 0) {
          const commons = decoratePersonsForGeneration(cRes.data.data || [], 'common')
          all = [...all, ...commons]

          const duplicateLegacy = commons.filter((person) => person.hasDuplicateLegacyId)
          if (duplicateLegacy.length > 0) {
            console.warn('[DigitalHumanStudio] 公共数字人存在重复旧 ID，已改用预览媒体文件解析生成 ID:', duplicateLegacy.map((person) => ({
              legacyId: person.legacyPersonId,
              name: person.name,
              generationPersonId: person.generation_person_id,
              identitySource: person.generationIdentitySource,
              selectionKey: person.selectionKey,
            })))
          }

          const conflicts = commons.filter((person) => person.identityConflict)
          if (conflicts.length > 0) {
            console.error('[DigitalHumanStudio] 仍存在生成 ID 冲突，冲突卡片将禁止生成:', conflicts.map((person) => ({
              name: person.name,
              generationPersonId: person.generation_person_id,
              selectionKey: person.selectionKey,
            })))
          }
        }
        if (pRes?.data?.code === 0) {
          const customs = decoratePersonsForGeneration(pRes.data.data || [], 'custom')
          all = [...all, ...customs]
          console.log('[DigitalHumanStudio] 自定义数字人列表:', customs.map((person) => ({
            id: person.id,
            name: person.name,
            generationPersonId: person.generation_person_id,
            hasActions: Boolean(person.actions?.length),
          })))
        }
        console.log('[DigitalHumanStudio] 合并后的数字人列表:', all.map((person) => ({
          id: person.id,
          legacyId: person.legacyPersonId,
          generationPersonId: person.generation_person_id,
          identitySource: person.generationIdentitySource,
          selectionKey: person.selectionKey,
          name: person.name,
          type: person.type,
        })))
        setPersons(all)
        if (vRes?.data?.code === 0) setVoices(vRes.data.data || [])
        
        // 加载项目列表 - 使用 VFS API
        console.log('[DigitalHumanStudio] 开始加载项目列表')
        const projects = await vfs.getVideoProjects()
        console.log('[DigitalHumanStudio] 项目列表:', projects)
        setProjects(projects || [])
        // 默认选择第一个项目
        if (projects && projects.length > 0) {
          setSelectedProject(projects[0])
        }
        
        // 加载数字人详情（获取可用动作）
        const loadPersonDetails = async (person) => {
          // 公共列表若旧 ID 重复，详情接口只按旧 ID 查询，会错误返回第一位数字人。
          // 此时必须保留用户点击的卡片数据，不能再让详情响应覆盖人物身份。
          if (person.hasDuplicateLegacyId) {
            console.warn('[DigitalHumanStudio] 当前卡片旧 ID 重复，跳过歧义详情接口:', {
              name: person.name,
              legacyId: person.legacyPersonId,
              generationPersonId: person.generation_person_id,
            })
            setSelectedPersonDetails(mergePersonDetails(person, {}))
            return
          }

          // 优先检查列表数据中是否已有 actions 字段
          if (person.actions && person.actions.length > 0) {
            console.log('[DigitalHumanStudio] 列表数据已包含 actions，直接使用:', person.actions)
            setSelectedPersonDetails(mergePersonDetails(person, person))
            return
          }
          
          try {
            const isCustom = person.type === 'custom'
            const apiPath = isCustom 
              ? `/v1/dh/persons/custom/${person.id}` 
              : `/v1/dh/persons/common/${person.id}`
            console.log('[DigitalHumanStudio] 加载数字人详情，type:', isCustom ? 'custom' : 'common', ', id:', person.id, ', path:', apiPath)
            const detailRes = isCustom 
              ? await getCustomPersonDetail(person.id)
              : await getCommonPersonDetail(person.id)
            console.log('[DigitalHumanStudio] 数字人详情响应 status:', detailRes?.status, ', code:', detailRes?.data?.code)
            if (detailRes?.data?.code === 0) {
              const details = detailRes.data.data
              console.log('[DigitalHumanStudio] 数字人详情:', details)
              console.log('[DigitalHumanStudio] 数字人 actions:', details?.actions)
              console.log('[DigitalHumanStudio] 数字人 audio_man_id:', details?.audio_man_id)
              // 保存可用动作列表
              setSelectedPersonDetails(mergePersonDetails(person, details))
            } else {
              console.warn('[DigitalHumanStudio] 数字人详情响应异常，但继续处理。response:', detailRes)
              // 即使 API 返回非 0，也尝试使用返回的数据
              if (detailRes?.data?.data) {
                setSelectedPersonDetails(mergePersonDetails(person, detailRes.data.data))
              }
            }
          } catch (err) {
            console.error('[DigitalHumanStudio] 加载数字人详情失败:', err.message, ', status:', err.response?.status)
            // 404 时尝试使用基础数据
            if (err.response?.status === 404) {
              console.log('[DigitalHumanStudio] 详情接口返回 404，使用基础数字人数据')
              setSelectedPersonDetails(mergePersonDetails(person, { actions: [] }))
            }
          }
        }
        
        // 如果有预选数字人，自动选择（优先使用传入的 preselectedPerson）
        if (preselectedPerson) {
          console.log('[DigitalHumanStudio] 收到预选数字人:', preselectedPerson.name, preselectedPerson.id)
          // 优先按 selectionKey / generation_person_id 匹配，避免重复旧 ID 选中错误卡片。
          const person = findMatchingPerson(all, preselectedPerson)
          if (person) {
            console.log('[DigitalHumanStudio] 找到匹配的数字人，自动选择:', person.name)
            setSelectedPerson(person)
            loadPersonDetails(person)
          } else {
            // 如果没找到，直接使用 preselectedPerson 数据
            console.log('[DigitalHumanStudio] 未在列表中找到，直接使用 preselectedPerson')
            setSelectedPerson(preselectedPerson)
          }
// 通知父组件预选数字人已被使用
          if (onPreselectedPersonUsed) {
            onPreselectedPersonUsed()
          }
        }
      } catch (err) {
        console.error('[DigitalHumanStudio] 加载数据失败:', err)
        // 优先显示后端返回的详细错误信息
        const backendMsg = err.responseData?.message || err.message || '未知错误'
        const errorCode = err.code ? ` (错误码：${err.code})` : ''
        setStatusMsg('加载数据失败：' + backendMsg + errorCode)
      } finally {
        setLoadingProjects(false)
      }
    }
    
    loadData()
  }, [preselectedPerson])

  // 核心：生成数字人视频并保存到 VFS
  const startPipeline = async () => {
    const validScripts = scripts.filter(s => s.text.trim())
    if (!selectedPerson) return alert("请选择数字人")
    if (validScripts.length === 0) return alert("请输入至少一条文案")
    if (!selectedProject) return alert("请选择要保存到的项目")

    const selectedIdentity = resolvePersonIdentity(selectedPerson, {
      preferMediaIdentity: selectedPerson.type === 'common' || selectedPerson.hasDuplicateLegacyId,
    })
    if (!selectedIdentity.valid) {
      return alert(`当前数字人“${selectedPerson.name || '未命名'}”缺少可用于生成的唯一 ID`)
    }
    if (selectedPerson.identityConflict) {
      return alert(`当前数字人“${selectedPerson.name || '未命名'}”的生成 ID 与其他卡片冲突：${selectedIdentity.generationPersonId}。请刷新列表或检查数字人素材。`)
    }
    const selectedGenerationPersonId = selectedIdentity.generationPersonId
    const selectedPersonKey = personSelectionKey(selectedPerson)

    console.log('[DigitalHumanStudio] 已锁定数字人生成身份:', {
      selectedName: selectedPerson.name,
      legacyPersonId: selectedPerson.id,
      generationPersonId: selectedGenerationPersonId,
      identitySource: selectedIdentity.source,
      selectionKey: selectedPersonKey,
      previewVideoUrl: selectedPerson.preview_video_url || selectedPerson.preview_url || '',
    })

    setIsGenerating(true)
    setShowProgress(true)
    setStatusMsg('正在生成数字人视频...')

    // 初始化任务状态（使用 crypto.randomUUID 确保唯一性）
    const initialTasks = validScripts.map((script, idx) => ({
      id: `dh_${Date.now()}_${idx}_${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`,
      text: script.text.substring(0, 20) + (script.text.length > 20 ? '...' : ''),
      stage: 'dh_generating',
      progress: 0,
      scriptText: script.text,
      copywritingPlan: normalizeCopywritingPlan(script.copywritingPlan, script.text),
      apiVersion: 'timeline_v1'
    }))
    setPipelineTasks(initialTasks)

    try {
      const apiKey = localStorage.getItem('rjcut_api_key')
      const vfs = getVFS()
      
      // 使用所选项目的 剪辑视频 目录作为保存路径
      const projectName = selectedProject.name || selectedProject.path.replace('/projects/', '').split('/')[0]
      const savePath = buildVFSPath(projectName, PROJECT_FOLDERS.EDITED_VIDEO)
      
      console.log('[DigitalHumanStudio] 开始生成流程，保存路径:', savePath)
      
      // 创建 VFS 保存目录
      console.log('[DigitalHumanStudio] 创建目录:', savePath)
      await vfs.createDirectory(savePath, true)
      console.log('[DigitalHumanStudio] 目录创建成功')

      // 并发处理所有任务
      let failedCount = 0
      console.log('[DigitalHumanStudio] 开始并发处理', initialTasks.length, '个任务')
      await Promise.all(initialTasks.map(async (task, index) => {
        const script = validScripts[index]
        console.log('[DigitalHumanStudio] 处理任务', index + 1, '/', initialTasks.length)
        
        try {
          // [阶段 1] 直接调用 8080 新版数字人 API。只发送纯口播，要求返回字级时间轴。
          const apiBaseUrl = getDigitalHumanBaseUrl()
          const copywritingPlan = normalizeCopywritingPlan(script.copywritingPlan, script.text)
          // 8080 只接收一次完整口播。segments 只保存在 RJCut，用于后续模板混剪。
          const fullSpokenText = requireFullSpokenText(copywritingPlan, script.text)
          copywritingPlan.spoken_text = fullSpokenText
          const audioManId = selectedVoice || selectedPersonDetails?.audio_man_id || ''
          const taskPayload = {
            text: fullSpokenText,
            // 不能再发送 selectedPerson.id：旧列表可能让多张卡片共用同一个 ID。
            person_id: selectedGenerationPersonId,
            audio_man_id: audioManId || undefined,
            figure_type: selectedPerson.figure_type || selectedPersonDetails?.figure_type || advancedSettings.figure_type || 'whole_body',
            hide_subtitle: advancedSettings.hide_subtitle !== false,
            extra: {
              business_task_id: task.id,
              source: 'rjcut-studio',
              copywriting_schema: copywritingPlan.schema,
              request_contract: 'full_spoken_text_once',
              requested_text_length: Array.from(fullSpokenText).length,
              semantic_segment_count: copywritingPlan.segments.length,
              selected_person_name: selectedPerson.name || '',
              selected_person_ui_id: selectedPerson.id || '',
              selected_person_legacy_id: selectedPerson.legacyPersonId || selectedPerson.id || '',
              selected_person_selection_key: selectedPersonKey,
              generation_person_id: selectedGenerationPersonId,
              generation_identity_source: selectedIdentity.source,
              selected_preview_video_url: selectedPerson.preview_video_url || selectedPerson.preview_url || '',
              requested_settings: {
                speed: advancedSettings.speed,
                pitch: advancedSettings.pitch,
                volume: advancedSettings.volume,
                language: advancedSettings.language,
                action_id: advancedSettings.action_id || null,
              },
            },
          }

          const textContract = summarizeTextContract(fullSpokenText)
          console.log('[DigitalHumanStudio] 提交数字人生成请求（完整文本，仅一次）:', {
            personId: selectedGenerationPersonId,
            personName: selectedPerson.name,
            selectionKey: selectedPersonKey,
            identitySource: selectedIdentity.source,
            figureType: taskPayload.figure_type,
            audioManId,
            ...textContract,
            semanticSegmentCount: copywritingPlan.segments.length,
            sentKeys: Object.keys(taskPayload),
          })
          const created = await createTimelineDigitalHumanTask(taskPayload, apiBaseUrl)
          const dhTaskId = created.task_id
          const fileName = `dh_${safeFilePart(selectedPerson.name, selectedGenerationPersonId)}_${Date.now()}_${index + 1}.mp4`
          const vfsVideoPath = `${savePath}/${fileName}`

          setPipelineTasks((prev) => prev.map((item) => item.id === task.id ? {
            ...item,
            dhTaskId,
            apiBaseUrl,
            savePath,
            fileName,
            videoPath: vfsVideoPath,
            personId: selectedGenerationPersonId,
            legacyPersonId: selectedPerson.legacyPersonId || selectedPerson.id || '',
            personSelectionKey: selectedPersonKey,
            personIdentitySource: selectedIdentity.source,
            personName: selectedPerson.name,
            audioManId,
            copywritingPlan,
          } : item))

          const completed = await waitForTimelineDigitalHumanTask(dhTaskId, {
            baseUrl: apiBaseUrl,
            onProgress: (progress) => setPipelineTasks((prev) => prev.map((item) =>
              item.id === task.id ? { ...item, progress: Math.min(55, Math.round(progress * 0.55)) } : item
            )),
          })
          const result = { ...(completed.result || {}) }
          if (!Array.isArray(result.char_timings) || !result.char_timings.length) {
            const timingResult = await getTimelineCharTimings(dhTaskId, apiBaseUrl)
            result.char_timings = timingResult?.char_timings || []
          }
          const integrity = validateDigitalHumanResult(result, fullSpokenText)
          result.generation_integrity = integrity
          console.log('[DigitalHumanStudio] 数字人完整文本结果校验通过:', {
            ...integrity,
            returnedTextLength: Array.from(String(result.normalized_text || result.text || '')).length,
          })

          const identityVerification = verifyGeneratedPersonIdentity(result, selectedGenerationPersonId)
          if (!identityVerification.verified) {
            console.warn('[DigitalHumanStudio] 后端未返回 resolved_person_id，已保存请求身份供排查:', identityVerification)
          } else {
            console.log('[DigitalHumanStudio] 后端实际数字人身份校验通过:', identityVerification)
          }

          // [阶段 2] 视频与项目 JSON 一起保存到 VFS。
          setPipelineTasks((prev) => prev.map((item) =>
            item.id === task.id ? { ...item, stage: 'downloading', progress: 65 } : item
          ))
          const originalVideoUrl = result.video_url
          const { blob: videoBlob, url: resolvedVideoUrl, attempts: videoDownloadAttempts } =
            await downloadDigitalHumanVideo({
              result,
              baseUrl: apiBaseUrl,
              taskId: dhTaskId,
            })
          result.video_url = resolvedVideoUrl
          console.log('[DigitalHumanStudio] 视频下载地址:', {
            originalVideoUrl,
            resolvedVideoUrl,
            attempts: videoDownloadAttempts,
          })
          await vfs.writeFile(vfsVideoPath, await videoBlob.arrayBuffer(), { type: videoBlob.type || 'video/mp4' })

          const project = buildDigitalHumanProject({
            taskId: dhTaskId,
            result,
            copywritingPlan,
            personId: selectedGenerationPersonId,
            personName: selectedPerson.name,
            legacyPersonId: selectedPerson.legacyPersonId || selectedPerson.id || '',
            selectionKey: selectedPersonKey,
            identitySource: selectedIdentity.source,
            identityVerification,
            audioManId,
            apiBaseUrl,
            videoPath: vfsVideoPath,
          })
          const projectPath = sidecarPathForVideo(vfsVideoPath)
          await writeDigitalHumanProject(vfs, projectPath, project)

          setPipelineTasks((prev) => prev.map((item) =>
            item.id === task.id ? { ...item, stage: 'done', progress: 100, projectPath } : item
          ))
          setGeneratedVideos((prev) => [...prev, {
            id: task.id,
            path: vfsVideoPath,
            fileName,
            projectPath,
            text: copywritingPlan.spoken_text,
            project,
          }])
          console.log('[DigitalHumanStudio] 数字人视频与字级时间轴项目已保存:', vfsVideoPath, projectPath)

        } catch (err) {
          failedCount += 1
          console.error('[DigitalHumanStudio] 任务', index + 1, ': 失败', err)
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'failed', error: err.message } : t
          ))
        }
      }))

      if (failedCount > 0) {
        setStatusMsg(`生成结束：${failedCount} 个任务失败，请查看进度窗口详情`)
      } else {
        setStatusMsg(`生成完成！MP4 与同名 .rjdh.json 已保存到 ${savePath}，模板混剪可直接加载`)
      }
      console.log('[DigitalHumanStudio] 所有任务完成，失败数:', failedCount)
      
    } catch (err) {
      console.error('[DigitalHumanStudio] 生成流程失败:', err)
      setStatusMsg('生成失败：' + err.message)
    } finally {
      setIsGenerating(false)
      // 所有任务完成后，自动最小化进度窗口
      setMinimizedProgress(true)
    }
  }

  return (
    <div className="w-full h-full flex bg-slate-100 overflow-hidden font-sans text-slate-800">
      {/* 自定义滚动条样式 */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>

      <AvatarPicker 
        persons={persons} 
        voices={voices}
        selectedPerson={selectedPerson} 
        onSelectPerson={(person) => {
          setSelectedPerson(person)
          setSelectedPersonDetails(mergePersonDetails(person, {}))
          console.log('[DigitalHumanStudio] 用户选择数字人:', {
            name: person.name,
            legacyId: person.id,
            generationPersonId: person.generation_person_id,
            identitySource: person.generationIdentitySource,
            selectionKey: person.selectionKey,
          })

          // 重复旧 ID 的公共人物无法通过 /common/{id} 唯一查询，跳过歧义详情请求。
          if (person.hasDuplicateLegacyId) return

          // 加载数字人详情（仅补充动作、声音等能力，不允许覆盖所选卡片身份）
          ;(async () => {
            try {
              const isCustom = person.type === 'custom'
              const detailRes = isCustom 
                ? await getCustomPersonDetail(person.id)
                : await getCommonPersonDetail(person.id)
              if (detailRes?.data?.code === 0) {
                const details = detailRes.data.data
                console.log('[DigitalHumanStudio] 数字人详情:', details)
                setSelectedPersonDetails(mergePersonDetails(person, details))
              }
            } catch (err) {
              console.error('[DigitalHumanStudio] 加载数字人详情失败:', err)
              setSelectedPersonDetails(mergePersonDetails(person, {}))
            }
          })()
        }}
        selectedVoice={selectedVoice} 
        onSelectVoice={setSelectedVoice}
      />
      
      <div className="flex-1 bg-slate-50 border-r border-slate-200 flex flex-col h-full relative">
        {/* 高级设置面板 */}
        <AdvancedSettings 
          settings={advancedSettings}
          setSettings={setAdvancedSettings}
          isOpen={showAdvancedSettings}
          onToggle={() => setShowAdvancedSettings(!showAdvancedSettings)}
          personDetails={selectedPersonDetails}
        />
        
        <BatchScriptInput 
          scripts={scripts} 
          setScripts={setScripts} 
          onAIGenerate={handleAIGenerateScript}
        />
      </div>
      
      <SavePathConfig 
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        projects={projects}
        onGenerate={startPipeline}
        isGenerating={isGenerating}
        loadingProjects={loadingProjects}
        onNavigateToFiles={onNavigateToFiles}
      />
      
      {/* 居中轻提示 */}
      {statusMsg && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full shadow-lg text-sm z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          {statusMsg}
        </div>
      )}

      {/* 进度面板 */}
      {showProgress && (
        <PipelineProgress 
          tasks={pipelineTasks} 
          generatedVideos={generatedVideos}
          onClose={() => { setShowProgress(false); setMinimizedProgress(false) }} 
          onMinimize={() => { setShowProgress(false); setMinimizedProgress(true) }}
          onPreviewVideo={(video) => setPreviewVideo(video)}
        />
      )}

      {/* 视频预览弹窗 */}
      {previewVideo && (
        <VideoPreviewModal 
          video={previewVideo} 
          onClose={() => setPreviewVideo(null)}
          vfs={vfs}
        />
      )}

      {/* 模板选择器弹窗（用于 AI 文案生成） */}
      {showTemplateManager && (
        <TemplateManager
          onSelectTemplate={handleSelectTemplate}
          selectedTemplateId={tempSelectedTemplate?.id}
          onClose={() => {
            setShowTemplateManager(false)
            // 注意：不要在这里清空 tempSelectedTemplate，否则选择的模板会丢失
            // setTempSelectedTemplate(null)
          }}
        />
      )}

      {/* AI 文案生成表单弹窗 */}
      {showScriptForm && (
        <AIScriptForm
          template={tempSelectedTemplate}
          productInfo={productInfo}
          setProductInfo={setProductInfo}
          onSubmit={handleSubmitScriptForm}
          onCancel={() => {
            setShowScriptForm(false)
            setTempSelectedTemplate(null)
          }}
          isGenerating={isGeneratingScript}
        />
      )}

      {/* AI 文案生成中提示 */}
      {isGeneratingScript && (
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-purple-600" />
            <p className="text-sm font-medium text-slate-700">AI 正在生成文案...</p>
            <p className="text-xs text-slate-400">生成纯口播与语义场景段，不插入口令</p>
          </div>
        </div>
      )}

      {/* 最小化进度悬浮窗 */}
      {minimizedProgress && pipelineTasks.length > 0 && (
        <MinimizedProgress 
          tasks={pipelineTasks} 
          onExpand={() => { setMinimizedProgress(false); setShowProgress(true) }}
          onClose={() => setMinimizedProgress(false)}
        />
      )}
    </div>
  )
}


