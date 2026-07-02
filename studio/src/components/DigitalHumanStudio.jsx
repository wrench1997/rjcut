import { useState, useEffect, useCallback, useRef } from 'react'
import { getCommonPersons, getCustomPersons, getCommonPersonDetail, getCustomPersonDetail, getVoices, createDhGenerateTask, getDhTaskDetail, getDhVideoUrl } from '../api/api'
import { getVFS } from '../utils/vfsClient'
import { PROJECT_FOLDERS, buildVFSPath } from '../utils/project-structure'
import { User, Mic, Check, X, Film, Download, AlertCircle, Loader2, Book, Inbox, Folder, AlertTriangle, Rocket, Settings, Sliders, Volume2, Type, Image, ChevronDown, ChevronUp, Palette, Maximize, Sparkles, Wand2 } from 'lucide-react'
import Tooltip from './Tooltip'
import TemplateManager from './TemplateManager'
import { aiGenerateScript, DEFAULT_TEMPLATES } from '../features/template-batch/aiAssistant.js'

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
                selectedPerson?.id === person.id 
                  ? 'ring-2 ring-blue-500 shadow-lg scale-105' 
                  : 'shadow-md hover:shadow-lg hover:scale-105'
              }`}
            >
              {person.cover_url ? (
                <img 
                  src={person.cover_url} 
                  alt={person.name} 
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" 
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
              {selectedPerson?.id === person.id && (
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
  const handleAdd = () => setScripts([...scripts, { id: Date.now(), text: '' }])
  const handleRemove = (id) => setScripts(scripts.filter(s => s.id !== id))
  const handleChange = (id, text) => setScripts(scripts.map(s => s.id === id ? { ...s, text } : s))

  return (
    <>
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
        <Tooltip tip="为每个视频输入不同的播报文案" delay={1000}>
          <h2 className="text-sm font-bold text-slate-800">2. 输入批量文案 ({scripts.length} 条)</h2>
        </Tooltip>
        <p className="text-xs text-slate-500 mt-1">每条文案将生成一个独立的数字人视频</p>
        <div className="flex items-center gap-2">
          <Tooltip tip="使用 AI 根据模板自动生成文案" delay={1000}>
            <button onClick={onAIGenerate} className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md hover:bg-purple-200 flex items-center gap-1">
              <Sparkles size={12} />
              AI 生成文案
            </button>
          </Tooltip>
          <Tooltip tip="添加新的文案条目" delay={1000}>
            <button onClick={handleAdd} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200">
              + 新增文案
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {scripts.map((script, idx) => (
          <div key={script.id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-3 cursor-text" onClick={(e) => {
              if (e.target === e.currentTarget) {
                const textarea = e.currentTarget.querySelector('textarea')
                if (textarea) textarea.focus()
              }
            }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-400">视频 {idx + 1}</span>
              {scripts.length > 1 && (
                <button onClick={() => handleRemove(script.id)} className="text-red-400 hover:text-red-600">
                  <X size={16} strokeWidth={2} />
                </button>
              )}
            </div>
            <textarea
              className="w-full h-24 text-sm resize-none border-0 bg-transparent focus:outline-none focus:ring-0 focus:border-0 no-focus-style cursor-text"
              placeholder="输入该视频的播报文案..."
              value={script.text}
              onChange={(e) => handleChange(script.id, e.target.value)}
              onDoubleClick={(e) => {
                e.target.focus()
                e.target.select()
              }}
            />
          </div>
        ))}
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
                  <button
                    onClick={() => onPreviewVideo(video)}
                    className="mt-2 w-full py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors flex items-center justify-center gap-1"
                  >
                    <Film size={12} /> 预览视频
                  </button>
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
        
        // 从 VFS 读取视频文件为 ArrayBuffer
        const arrayBuffer = await vfs.readFile(video.path, 'binary')
        console.log('[VideoPreviewModal] 读取到的 ArrayBuffer 大小:', arrayBuffer?.byteLength || arrayBuffer?.length)
        
        // 转换为 Blob
        const blob = new Blob([arrayBuffer], { type: 'video/mp4' })
        console.log('[VideoPreviewModal] Blob 大小:', blob.size)
        
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Film size={18} className="text-blue-500" />
            预览：{video.fileName}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-sm px-3 py-1.5 rounded hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="aspect-[9/16] max-h-[70vh] bg-slate-100 rounded-lg flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-slate-500">加载视频中...</p>
              </div>
            </div>
          ) : error ? (
            <div className="aspect-[9/16] max-h-[70vh] bg-red-50 rounded-lg flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-red-500">
                <AlertCircle size={32} />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : (
            <video 
              src={videoUrl} 
              controls 
              autoPlay 
              className="w-full aspect-[9/16] max-h-[70vh] bg-black rounded-lg object-contain"
            />
          )}
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-xs text-slate-500">
              <span className="font-medium">文案：</span>{video.text}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              <span className="font-medium">路径：</span><code className="bg-slate-200 px-1 rounded">{video.path}</code>
            </p>
          </div>
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
// AI 文案生成表单弹窗
// =====================================================
function AIScriptForm({ template, productInfo, setProductInfo, onSubmit, onCancel, isGenerating }) {
  console.log('[AIScriptForm] template prop:', template)
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" />
            AI 文案生成
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            已选择模板：<span className="font-medium text-purple-600">{template?.name || '未选择'}</span>
            （{template?.segments?.length || 0} 段落，含{template?.segments?.filter(s => s.flag === 'transition').length || 0}个转场）
          </p>
        </div>

        {/* 表单内容 */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* 产品名称 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              产品名称 *
            </label>
            <input
              type="text"
              value={productInfo.productName}
              onChange={(e) => setProductInfo({ ...productInfo, productName: e.target.value })}
              placeholder="例如：鹿茸血口服液"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-purple-400"
              required
            />
          </div>

          {/* 产品卖点 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              产品卖点
            </label>
            <textarea
              value={productInfo.sellingPoints}
              onChange={(e) => setProductInfo({ ...productInfo, sellingPoints: e.target.value })}
              placeholder="例如：补血养颜、增强免疫力、改善睡眠（用逗号分隔）"
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-purple-400 resize-none"
            />
          </div>

          {/* 目标人群 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              目标人群
            </label>
            <input
              type="text"
              value={productInfo.targetAudience}
              onChange={(e) => setProductInfo({ ...productInfo, targetAudience: e.target.value })}
              placeholder="例如：气血不足的女性、经常熬夜的上班族"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-purple-400"
            />
          </div>

          {/* 文案风格 */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              文案风格
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProductInfo({ ...productInfo, tone: 'direct_sale' })}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  productInfo.tone === 'direct_sale'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                🔥 直接促销型
              </button>
              <button
                type="button"
                onClick={() => setProductInfo({ ...productInfo, tone: 'premium' })}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  productInfo.tone === 'premium'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                💎 高端品质型
              </button>
              <button
                type="button"
                onClick={() => setProductInfo({ ...productInfo, tone: 'social_review' })}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  productInfo.tone === 'social_review'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                📝 种草推荐型
              </button>
              <button
                type="button"
                onClick={() => setProductInfo({ ...productInfo, tone: 'explainer' })}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  productInfo.tone === 'explainer'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                }`}
              >
                📖 讲解说明型
              </button>
            </div>
          </div>

          {/* 生成预览 */}
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
            <p className="text-xs text-purple-700">
              <strong>生成预览：</strong>
            </p>
            <ul className="text-[10px] text-purple-600 space-y-1 mt-2">
              <li>• 模板：{template?.name}</li>
              <li>• 段落结构：
                {template?.segments?.map((s, i) => (
                  <span key={i}>
                    {i > 0 ? ' → ' : ''}
                    <span className={s.flag === 'transition' ? 'text-amber-600' : ''}>
                      {s.flag === 'transition' ? '🔄' : s.flag === 'hook' ? '🎬' : '🏁'}{s.note.split(' - ')[0]}
                    </span>
                  </span>
                ))}
              </li>
              <li>• AI 将根据模板段落数量生成对应文案和转场提示</li>
            </ul>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isGenerating}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isGenerating || !productInfo.productName}
            className="px-4 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isGenerating ? '生成中...' : '立即生成'}
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
  const [scripts, setScripts] = useState([{ id: Date.now(), text: '' }])
  
  // AI 文案生成相关状态
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [isGeneratingScript, setIsGeneratingScript] = useState(false)

  // AI 生成文案的产品信息
  const [productInfo, setProductInfo] = useState({
    productName: '',
    sellingPoints: '',
    targetAudience: '',
    tone: 'direct_sale',
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
    setShowTemplateManager(false)
    setShowScriptForm(true)
    console.log('[DigitalHumanStudio] 表单已打开，template:', template?.id, template?.name)
  }

  const handleSubmitScriptForm = () => {
    console.log('[handleSubmitScriptForm] tempSelectedTemplate:', tempSelectedTemplate)
    console.log('[handleSubmitScriptForm] productInfo:', productInfo)
    
    if (!productInfo.productName) {
      alert('请输入产品名称')
      return
    }
    
    if (!tempSelectedTemplate) {
      alert('请先选择一个模板')
      return
    }
    
    // 调用 AI 生成文案
    generateScriptFromTemplate(
      tempSelectedTemplate,
      productInfo.productName,
      productInfo.sellingPoints,
      productInfo.targetAudience || '大家',
      productInfo.tone || 'direct_sale'
    )
    
    setShowScriptForm(false)
    setTempSelectedTemplate(null)
  }

  const generateScriptFromTemplate = async (template, productName, sellingPoints, targetAudience, tone) => {
    setIsGeneratingScript(true)
    try {
      if (!template) {
        throw new Error('未选择模板，请先选择一个模板')
      }
      const segments = template.segments || []
      const generatedSegments = await aiGenerateScript({
        productName,
        sellingPoints,
        targetAudience,
        tone,
        templateId: template.id,
        segments,
      })

      // 将生成的文案合并成一条完整的视频脚本
      // hook、human、ending 段落有文案，transition 段落作为转场提示
      const validSegments = generatedSegments.filter(s => 
        s.flag === 'hook' || 
        s.flag === 'ending' || 
        s.flag === 'human' ||
        s.flag === 'transition'
      )

      if (validSegments.length > 0) {
        // 合并所有段落为一条完整文案，用【转场】标识分隔
        let fullScript = ''
        validSegments.forEach((segment, idx) => {
          if (segment.flag === 'transition') {
            // 转场段落：添加转场提示
            fullScript += `\n【转场：${segment.note || '场景切换'}】\n`
          } else {
            // 文案段落：添加实际文案
            fullScript += segment.text || ''
          }
        })

        // 创建一条完整的脚本
        const newScript = {
          id: Date.now(),
          text: fullScript.trim(),
          note: `AI 生成（${validSegments.length}段，含${generatedSegments.filter(s => s.flag === 'transition').length}个转场）`,
        }

        // 如果当前只有一个空脚本，替换它；否则追加
        if (scripts.length === 1 && !scripts[0].text) {
          setScripts([newScript])
        } else {
          setScripts([...scripts, newScript])
        }

        const transitionCount = generatedSegments.filter(s => s.flag === 'transition').length
        const textCount = generatedSegments.filter(s => s.text).length
        alert(`✅ AI 文案生成成功！已合并为 1 条完整脚本（${textCount}段文案 + ${transitionCount}个转场）`)
      } else {
        alert('⚠️ 模板中没有可生成文案的段落')
      }
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

  // 🔴 恢复轮询：当组件重新挂载时，如果有未完成的任务，继续轮询
  useEffect(() => {
    // 如果正在生成中，跳过（说明是正常流程，不需要恢复）
    if (isGenerating) {
      return
    }
    
    const resumePolling = async () => {
      if (pipelineTasks.length === 0) {
        return
      }
      
      // 查找所有正在运行中的任务（dh_generating 或 downloading 状态）
      const runningTasks = pipelineTasks.filter(t => 
        t.stage === 'dh_generating' || t.stage === 'downloading'
      )
      
      if (runningTasks.length === 0) {
        console.log('[DigitalHumanStudio] 没有需要恢复轮询的任务')
        return
      }
      
      console.log('[DigitalHumanStudio] 🔄 检测到未完成的任务，恢复轮询:', runningTasks.length, '个')
      
      // 等待项目列表加载完成
      if (loadingProjects) {
        console.log('[DigitalHumanStudio] 等待项目列表加载...')
        return
      }
      
      // 如果没有选择项目，使用默认路径
      const projectName = selectedProject?.name || selectedProject?.path?.replace('/projects/', '').split('/')[0] || 'default'
      const savePath = buildVFSPath(projectName, PROJECT_FOLDERS.EDITED_VIDEO)
      
      console.log('[DigitalHumanStudio] 保存路径:', savePath)
      
      // 为每个任务启动独立的轮询协程
      runningTasks.forEach((task) => {
        const dhTaskId = task.dhTaskId
        if (!dhTaskId) {
          console.warn('[DigitalHumanStudio] 任务缺少 dhTaskId，标记为失败:', task.id)
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'failed', error: '任务 ID 丢失' } : t
          ))
          return
        }
        
        console.log('[DigitalHumanStudio] 启动恢复协程:', task.id, ', stage:', task.stage, ', dhTaskId:', dhTaskId)
        
        // 启动独立的异步协程
        ;(async () => {
          try {
            const vfs = getVFS()
            
            // 🔴 先检查任务真实状态（蝉镜 API：30=完成，40=失败，10/20=进行中）
            console.log('[DigitalHumanStudio] 检查任务真实状态:', dhTaskId)
            const statusRes = await getDhTaskDetail(dhTaskId)
            const apiStatus = statusRes.data.data.status  // 数字：10,20,30,40
            const apiProgress = statusRes.data.data.progress
            
            console.log('[DigitalHumanStudio] 任务真实状态:', apiStatus, ', progress:', apiProgress)
            
            // 蝉镜 API 状态码：30=成功，40=失败
            if (apiStatus === 30) {
              console.log('[DigitalHumanStudio] 任务已完成 (status=30)，直接下载:', task.id)
              setPipelineTasks(prev => prev.map(t => 
                t.id === task.id ? { ...t, stage: 'downloading', progress: 60 } : t
              ))
            } else if (apiStatus === 40) {
              const errorMsg = statusRes.data.data?.error || statusRes.data.data?.msg || '数字人生成失败'
              console.log('[DigitalHumanStudio] 任务已失败 (status=40):', task.id, errorMsg)
              setPipelineTasks(prev => prev.map(t => 
                t.id === task.id ? { ...t, stage: 'failed', error: errorMsg } : t
              ))
              return
            }
            
            // 阶段 1: 轮询数字人生成状态（只有当任务还在进行中）
            if (task.stage === 'dh_generating' && apiStatus !== 30) {
              console.log('[DigitalHumanStudio] 开始轮询数字人状态:', dhTaskId)
              
              let dhCompleted = false
              let pollCount = 0
              const maxPolls = 600 // 最多轮询 600 次 (30 分钟)
              
              while (!dhCompleted && pollCount < maxPolls) {
                pollCount++
                await new Promise(r => setTimeout(r, 3000))
                
                try {
                  const sRes = await getDhTaskDetail(dhTaskId)
                  const st = sRes.data.data.status  // 数字状态码
                  const pr = sRes.data.data.progress
                  
                  console.log('[DigitalHumanStudio] 轮询中:', task.id, ', status:', st, ', progress:', pr)
                  
                  if (st === 30) {  // 蝉镜 API: 30 = 成功
                    dhCompleted = true
                    console.log('[DigitalHumanStudio] ✅ 数字人生成成功 (status=30):', task.id)
                  } else if (st === 40) {  // 蝉镜 API: 40 = 失败
                    const errMsg = sRes.data.data?.error || sRes.data.data?.msg || '数字人生成失败'
                    throw new Error(errMsg)
                  } else {
                    // 更新进度 (10,20 等 = 进行中)
                    setPipelineTasks(prev => prev.map(t => 
                      t.id === task.id ? { ...t, progress: Math.min(pr * 0.5, 50) } : t
                    ))
                  }
                } catch (err) {
                  console.error('[DigitalHumanStudio] 轮询出错:', err)
                  throw err
                }
              }
              
              if (!dhCompleted) {
                throw new Error('轮询超时')
              }
              
              // 进入下载阶段
              setPipelineTasks(prev => prev.map(t => 
                t.id === task.id ? { ...t, stage: 'downloading', progress: 60 } : t
              ))
            }
            
            // 阶段 2: 下载视频
            console.log('[DigitalHumanStudio] 开始下载视频:', dhTaskId)
            
            const urlRes = await getDhVideoUrl(dhTaskId)
            if (urlRes?.data?.code !== 0) {
              throw new Error('获取下载链接失败')
            }
            
            const downloadUrl = urlRes.data.data.download_url
            const videoBlob = await (await fetch(downloadUrl)).blob()
            
            const timestamp = Date.now()
            const fileName = `dh_${selectedPerson?.name || 'unknown'}_${timestamp}_${task.id.slice(-6)}.mp4`
            const vfsVideoPath = `${savePath}/${fileName}`
            
            await vfs.createDirectory(savePath, true)
            const arrayBuffer = await videoBlob.arrayBuffer()
            await vfs.writeFile(vfsVideoPath, arrayBuffer)
            
            // 完成任务
            setPipelineTasks(prev => prev.map(t => 
              t.id === task.id ? { ...t, stage: 'done', progress: 100 } : t
            ))
            setGeneratedVideos(prev => [...prev, { 
              id: task.id, 
              path: vfsVideoPath, 
              fileName,
              text: task.scriptText || task.text 
            }])
            console.log('[DigitalHumanStudio] ✅ 任务恢复完成:', task.id)
            
          } catch (err) {
            console.error('[DigitalHumanStudio] ❌ 恢复失败:', task.id, err.message)
            setPipelineTasks(prev => prev.map(t => 
              t.id === task.id ? { ...t, stage: 'failed', error: err.message } : t
            ))
          }
        })()
      })
    }
    
    // 延迟执行
    const timer = setTimeout(resumePolling, 1500)
    return () => clearTimeout(timer)
  }, []) // 每次组件挂载都检查是否有未完成的任务

  useEffect(() => {
    // 加载数字人、声音和项目列表
    const loadData = async () => {
      try {
        const vfs = getVFS()
        await vfs.init()
        
        // 加载数字人、声音列表，添加 token 过期错误处理
        let commonPersonsRes, customPersonsRes, voicesRes
        
        try {
          ;[commonPersonsRes, customPersonsRes, voicesRes] = await Promise.all([
            getCommonPersons(),
            getCustomPersons(),
            getVoices(),
          ])
        } catch (apiErr) {
          // 如果是 token 过期错误，不阻塞界面，仅警告
          if (apiErr.isTokenExpired) {
            console.warn('[DigitalHumanStudio] Token 已过期，数字人列表可能无法加载:', apiErr.message)
            setStatusMsg('⚠️ 登录已过期，请重新登录或刷新页面')
            // 返回空数组，避免崩溃
            commonPersonsRes = { data: { code: 0, data: [] } }
            customPersonsRes = { data: { code: 0, data: [] } }
            voicesRes = { data: { code: 0, data: [] } }
          } else {
            throw apiErr
          }
        }
        
        const [cRes, pRes, vRes] = [commonPersonsRes, customPersonsRes, voicesRes]
        
        let all = []
        if (cRes?.data?.code === 0) {
          // 给公共数字人添加 type 标记和唯一前缀 - 使用 id + cover_url 哈希作为唯一标识
          const commons = (cRes.data.data || []).map(p => {
            // 如果存在重复 ID，使用 id + cover_url 生成唯一标识
            const uniqueSuffix = p.cover_url ? p.cover_url.split('/').pop()?.substring(0, 8) : 'default'
            return { 
              ...p, 
              type: 'common', 
              uniqueId: `common_${p.id}_${uniqueSuffix}`,
              displayName: p.name // 保留原始名称用于显示
            }
          })
          all = [...all, ...commons]
          
          // 检查重复 ID
          const idCount = {}
          commons.forEach(p => {
            idCount[p.id] = (idCount[p.id] || 0) + 1
          })
          const duplicates = Object.entries(idCount).filter(([id, count]) => count > 1)
          if (duplicates.length > 0) {
            console.warn('[DigitalHumanStudio] 发现重复 ID 的数字人:', duplicates)
            console.log('[DigitalHumanStudio] 已为每个变体生成唯一 uniqueId:', commons.filter(p => idCount[p.id] > 1).map(p => ({
              id: p.id,
              name: p.name,
              uniqueId: p.uniqueId,
              cover_url: p.cover_url?.substring(0, 60)
            })))
          }
        }
        if (pRes?.data?.code === 0) {
          // 给自定义数字人添加 type 标记和唯一前缀
          const customs = (pRes.data.data || []).map(p => ({ ...p, type: 'custom', uniqueId: `custom_${p.id}` }))
          all = [...all, ...customs]
          console.log('[DigitalHumanStudio] 自定义数字人列表 (检查 actions 字段):', customs.map(p => ({ id: p.id, name: p.name, hasActions: !!p.actions, actions: p.actions })))
        }
        console.log('[DigitalHumanStudio] 合并后的数字人列表:', all.map(p => ({ id: p.id, uniqueId: p.uniqueId, name: p.name, type: p.type })))
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
          // 优先检查列表数据中是否已有 actions 字段
          if (person.actions && person.actions.length > 0) {
            console.log('[DigitalHumanStudio] 列表数据已包含 actions，直接使用:', person.actions)
            setSelectedPersonDetails(person)
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
              setSelectedPersonDetails(details)
            } else {
              console.warn('[DigitalHumanStudio] 数字人详情响应异常，但继续处理。response:', detailRes)
              // 即使 API 返回非 0，也尝试使用返回的数据
              if (detailRes?.data?.data) {
                setSelectedPersonDetails(detailRes.data.data)
              }
            }
          } catch (err) {
            console.error('[DigitalHumanStudio] 加载数字人详情失败:', err.message, ', status:', err.response?.status)
            // 404 时尝试使用基础数据
            if (err.response?.status === 404) {
              console.log('[DigitalHumanStudio] 详情接口返回 404，使用基础数字人数据')
              setSelectedPersonDetails({ id: person.id, name: person.name, actions: [] })
            }
          }
        }
        
        // 如果有预选数字人，自动选择（优先使用传入的 preselectedPerson）
        if (preselectedPerson) {
          console.log('[DigitalHumanStudio] 收到预选数字人:', preselectedPerson.name, preselectedPerson.id)
          // 先在所有数字人中查找
          const person = all.find(p => p.id === preselectedPerson.id)
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

    setIsGenerating(true)
    setShowProgress(true)
    setStatusMsg('正在生成数字人视频...')

    // 初始化任务状态（使用 crypto.randomUUID 确保唯一性）
    const initialTasks = validScripts.map((script, idx) => ({
      id: `dh_${Date.now()}_${idx}_${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`,
      text: script.text.substring(0, 20) + (script.text.length > 20 ? '...' : ''),
      stage: 'dh_generating',
      progress: 0,
      scriptText: script.text
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
      console.log('[DigitalHumanStudio] 开始并发处理', initialTasks.length, '个任务')
      await Promise.all(initialTasks.map(async (task, index) => {
        const script = validScripts[index]
        console.log('[DigitalHumanStudio] 处理任务', index + 1, '/', initialTasks.length)
        
        try {
          // [阶段 1] 提交蝉镜数字人任务（包含高级设置和动作）
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 提交数字人任务')
          
          // 构建动作参数：使用高级设置中同步的 action_id
          let actionParams = {}
          if (selectedPersonDetails?.actions && selectedPersonDetails.actions.length > 0) {
            // 优先使用高级设置中的 action_id（由组件自动同步）
            if (advancedSettings.action_id) {
              actionParams.action_id = advancedSettings.action_id
              console.log('[DigitalHumanStudio] 使用高级设置中的动作:', actionParams.action_id)
            } else if (advancedSettings.drive_mode === 'random') {
              // 如果没有设置 action_id 且是随机模式，则随机选择
              const randomIndex = Math.floor(Math.random() * selectedPersonDetails.actions.length)
              actionParams.action_id = selectedPersonDetails.actions[randomIndex].id
              console.log('[DigitalHumanStudio] 随机选择动作:', actionParams.action_id)
            } else {
              // 默认使用第一个动作
              actionParams.action_id = selectedPersonDetails.actions[0].id
              console.log('[DigitalHumanStudio] 使用默认动作:', actionParams.action_id)
            }
          } else {
            console.log('[DigitalHumanStudio] 该数字人没有可用动作列表')
          }
          
          // 构建请求参数
          const taskPayload = {
            text: script.text,
            person_id: selectedPerson.id,
            // 动作参数
            ...actionParams,
            // 高级设置参数
            speed: advancedSettings.speed,
            pitch: advancedSettings.pitch,
            volume: advancedSettings.volume,
            language: advancedSettings.language,
            bg_type: advancedSettings.bg_type,
            bg_color: advancedSettings.bg_color,
            figure_type: advancedSettings.figure_type,
            hide_subtitle: advancedSettings.hide_subtitle,
            drive_mode: advancedSettings.drive_mode,
            client_ref_id: `dh_${task.id}`,
            // 🎨 传递字幕配置到后端
            subtitle_config: advancedSettings.subtitle_config
          }
          
          // 处理 audio_man_id 字段：优先使用用户选择的声音，否则使用数字人自带的 audio_man_id
          console.log('[DigitalHumanStudio] 检查 audio_man_id 参数:', {
            selectedVoice,
            person_audio_man_id: selectedPersonDetails?.audio_man_id,
            person_details: selectedPersonDetails
          })
          
          if (selectedVoice) {
            taskPayload.audio_man_id = selectedVoice
            console.log('[DigitalHumanStudio] 使用用户选择的声音:', selectedVoice)
          } else if (selectedPersonDetails?.audio_man_id) {
            taskPayload.audio_man_id = selectedPersonDetails.audio_man_id
            console.log('[DigitalHumanStudio] 使用数字人自带的 audio_man_id:', selectedPersonDetails.audio_man_id)
          } else {
            // 即使没有声音 ID，也要传递空字符串，让后端使用默认 TTS 配置
            taskPayload.audio_man_id = ''
            console.log('[DigitalHumanStudio] 未设置声音 ID，将使用默认 TTS 配置')
          }
          
          console.log('[DigitalHumanStudio] 最终提交任务 payload:', taskPayload)
          
          const dhRes = await createDhGenerateTask(taskPayload)
          
          if (dhRes?.data?.code !== 0) {
            throw new Error('数字人任务创建失败')
          }
          
          const dhTaskId = dhRes.data.data.task_id
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 数字人任务 ID', dhTaskId)
          
          // 立即更新任务，保存 dhTaskId 以便恢复轮询
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, dhTaskId } : t
          ))
          
          // 轮询数字人状态
          let dhCompleted = false
          while (!dhCompleted) {
            await new Promise(r => setTimeout(r, 3000))
            
            const statusRes = await getDhTaskDetail(dhTaskId)
            const { status, progress } = statusRes.data.data
            
            if (status === 'succeeded') {
              dhCompleted = true
              console.log('[DigitalHumanStudio] 任务', index + 1, ': 数字人生成成功')
            } else if (status === 'failed') {
              // 获取详细错误信息（优先从 error 字段获取）
              const errorMsg = statusRes.data.data?.error || 
                               statusRes.data.data?.error_message || 
                               statusRes.data.data?.fail_reason || 
                               '未知错误'
              console.error('[DigitalHumanStudio] 蝉镜 API 返回错误详情:', statusRes.data.data)
              throw new Error(`数字人生成失败：${errorMsg}`)
            } else {
              // 更新进度 (0-50%)
              setPipelineTasks(prev => prev.map(t => 
                t.id === task.id ? { ...t, progress: Math.min(progress * 0.5, 50) } : t
              ))
            }
          }

          // [阶段 2] 下载视频到 VFS
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 开始下载视频')
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'downloading', progress: 60 } : t
          ))
          
          const urlRes = await getDhVideoUrl(dhTaskId)
          if (urlRes?.data?.code !== 0) {
            throw new Error('获取视频下载链接失败')
          }
          
          const downloadUrl = urlRes.data.data.download_url
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 下载链接', downloadUrl.substring(0, 50) + '...')
          const videoBlob = await (await fetch(downloadUrl)).blob()
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 视频 Blob 大小', videoBlob.size, 'bytes')
          
          // 生成保存文件名
          const timestamp = Date.now()
          const fileName = `dh_${selectedPerson.name}_${timestamp}_${index + 1}.mp4`
          const vfsVideoPath = `${savePath}/${fileName}`
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 保存路径', vfsVideoPath)
          
          // 将 Blob 转换为 ArrayBuffer 以确保兼容性
          const arrayBuffer = await videoBlob.arrayBuffer()
          await vfs.writeFile(vfsVideoPath, arrayBuffer)
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 写入 VFS 成功')

          // 任务完成
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'done', progress: 100 } : t
          ))
          // 添加到已生成视频列表
          setGeneratedVideos(prev => [...prev, { 
            id: task.id, 
            path: vfsVideoPath, 
            fileName,
            text: task.text 
          }])
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 完成')

        } catch (err) {
          console.error('[DigitalHumanStudio] 任务', index + 1, ': 失败', err)
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'failed', error: err.message } : t
          ))
        }
      }))

      // 检查是否有失败的任务
      const failedTasks = pipelineTasks.filter(t => t.stage === 'failed')
      if (failedTasks.length > 0) {
        setStatusMsg(`生成失败：${failedTasks.length} 个任务出错，请查看进度窗口详情`)
      } else {
        setStatusMsg(`生成完成！视频已保存到 ${savePath}，请前往【批量处理】进行后期合成`)
      }
      console.log('[DigitalHumanStudio] 所有任务完成，失败数:', failedTasks.length)
      
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
          // 加载数字人详情（获取可用动作）
          ;(async () => {
            try {
              const isCustom = person.type === 'custom'
              const detailRes = isCustom 
                ? await getCustomPersonDetail(person.id)
                : await getCommonPersonDetail(person.id)
              if (detailRes?.data?.code === 0) {
                const details = detailRes.data.data
                console.log('[DigitalHumanStudio] 数字人详情:', details)
                setSelectedPersonDetails(details)
              }
            } catch (err) {
              console.error('[DigitalHumanStudio] 加载数字人详情失败:', err)
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
            <p className="text-xs text-slate-400">根据模板结构智能生成带转场提示的文案</p>
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