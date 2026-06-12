import { useState, useEffect, useCallback } from 'react'
import { getCommonPersons, getCustomPersons, getCommonPersonDetail, getCustomPersonDetail, getVoices, createDhGenerateTask, getDhTaskDetail, getDhVideoUrl } from '../api/api'
import { getVFS } from '../utils/vfsClient'
import { PROJECT_FOLDERS, buildVFSPath } from '../utils/project-structure'
import { User, Mic, Check, X, Film, Download, AlertCircle, Loader2, Book, Inbox, Folder, AlertTriangle, Rocket, Settings, Sliders, Volume2, Type, Image, ChevronDown, ChevronUp, Palette, Maximize } from 'lucide-react'

// =====================================================
// 左侧：资产选择 (数字人与声音) - 9 宫格布局
// =====================================================
function AvatarPicker({ persons, voices, selectedPerson, onSelectPerson, selectedVoice, onSelectVoice }) {
  return (
    <div className="w-[420px] bg-white border-r border-slate-200 flex flex-col h-full z-10 flex-shrink-0">
      {/* 标题区 */}
      <div className="p-4 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-blue-50 to-white">
        <h2 className="text-base font-bold text-slate-800">1. 选择出镜数字人</h2>
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
        <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
          <Mic size={14} strokeWidth={2} />
          <span>配音角色 (可选)</span>
        </label>
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

  // 当数字人变化时，同步更新动作选择
  useEffect(() => {
    if (personDetails?.actions && personDetails.actions.length > 0) {
      // 如果当前选择的 action_id 不在可用动作列表中，重置为第一个动作
      const currentActionId = settings.action_id
      const availableIds = personDetails.actions.map(a => a.id)
      if (!currentActionId || !availableIds.includes(currentActionId)) {
        setSettings(prev => ({ ...prev, action_id: personDetails.actions[0].id }))
      }
    } else {
      // 没有可用动作时，清空 action_id
      setSettings(prev => ({ ...prev, action_id: null }))
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
        <div className="p-4 pt-0 space-y-4">
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
              </label>
              <select
                value={settings.figure_type}
                onChange={(e) => handleChange('figure_type', e.target.value)}
                className="w-full text-xs p-2 rounded border border-slate-200 bg-white"
              >
                <option value="whole_body">全身 (1080x1920)</option>
                <option value="waist_shot">半身像</option>
                <option value="head_shot">头像</option>
              </select>
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
            </label>
            {personDetails?.actions && personDetails.actions.length > 0 ? (
              <select
                value={settings.action_id || ''}
                onChange={(e) => handleChange('action_id', e.target.value)}
                className="w-full text-xs p-2 rounded border border-slate-200 bg-white"
              >
                <option value="">自动（根据驱动模式）</option>
                {personDetails.actions.map((action, idx) => (
                  <option key={action.id} value={action.id}>
                    {action.name || `动作 ${idx + 1}`} (ID: {action.id.substring(0, 8)}...)
                  </option>
                ))}
              </select>
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
function BatchScriptInput({ scripts, setScripts }) {
  const handleAdd = () => setScripts([...scripts, { id: Date.now(), text: '' }])
  const handleRemove = (id) => setScripts(scripts.filter(s => s.id !== id))
  const handleChange = (id, text) => setScripts(scripts.map(s => s.id === id ? { ...s, text } : s))

  return (
    <>
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-800">2. 输入批量文案 ({scripts.length} 条)</h2>
        <p className="text-xs text-slate-500 mt-1">每条文案将生成一个独立的数字人视频</p>
        <button onClick={handleAdd} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200">
          + 新增文案
        </button>
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
function SavePathConfig({ selectedProject, setSelectedProject, projects, onGenerate, isGenerating, loadingProjects }) {
  return (
    <div className="w-80 bg-white flex flex-col h-full z-10">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800">3. 选择保存项目</h2>
        <p className="text-[10px] text-slate-500 mt-1">选择要保存数字人视频的项目</p>
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
              📂 视频将保存到：<code className="bg-slate-100 px-1 rounded">{selectedProject.path}/{PROJECT_FOLDERS.OUTPUT}</code>
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
            <li>点击生成，视频保存到项目 输出 目录</li>
            <li>前往【批量处理】进行后期合成</li>
          </ol>
        </div>
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50">
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
        <p className="text-[10px] text-slate-400 text-center mt-2">
          视频将保存到所选项目的 输出 目录
        </p>
      </div>
    </div>
  )
}

// =====================================================
// 流水线进度面板 (覆盖层)
// =====================================================
function PipelineProgress({ tasks, onClose, onMinimize }) {
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
          {tasks.map((task, idx) => (
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
            </div>
          ))}
        </div>
        {allDone && (
          <div className="p-4 border-t border-slate-100 bg-green-50">
            <p className="text-sm text-green-700 text-center">
              ✓ 所有视频已生成完成，已保存到项目的 <strong>输出</strong> 目录
            </p>
          </div>
        )}
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
// 主组件
// =====================================================
export default function DigitalHumanStudio({ apiKey, apiBaseUrl, preselectedPerson }) {
  const [persons, setPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [selectedPersonDetails, setSelectedPersonDetails] = useState(null) // 数字人详情（包含可用动作）
  const [selectedVoice, setSelectedVoice] = useState('')
  const [scripts, setScripts] = useState([{ id: Date.now(), text: '' }])
  
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
    action_id: null    // 动作 ID（由数字人详情自动同步）
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

  useEffect(() => {
    // 加载数字人、声音和项目列表
    const loadData = async () => {
      try {
        const vfs = getVFS()
        await vfs.init()
        const [cRes, pRes, vRes] = await Promise.all([
          getCommonPersons(),
          getCustomPersons(),
          getVoices(),
        ])
        
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
        }
      } catch (err) {
        console.error('[DigitalHumanStudio] 加载数据失败:', err)
        setStatusMsg('加载数据失败：' + err.message)
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
      
      // 使用所选项目的 输出 目录作为保存路径
      const projectName = selectedProject.name || selectedProject.path.replace('/projects/', '').split('/')[0]
      const savePath = buildVFSPath(projectName, PROJECT_FOLDERS.OUTPUT)
      
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
            client_ref_id: `dh_${task.id}`
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
          console.log('[DigitalHumanStudio] 任务', index + 1, ': 完成')

        } catch (err) {
          console.error('[DigitalHumanStudio] 任务', index + 1, ': 失败', err)
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'failed', error: err.message } : t
          ))
        }
      }))

      setStatusMsg(`生成完成！视频已保存到 ${savePath}，请前往【批量处理】进行后期合成`)
      console.log('[DigitalHumanStudio] 所有任务完成')
      
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
        />
      </div>
      
      <SavePathConfig 
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        projects={projects}
        onGenerate={startPipeline}
        isGenerating={isGenerating}
        loadingProjects={loadingProjects}
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
          onClose={() => { setShowProgress(false); setMinimizedProgress(false) }} 
          onMinimize={() => { setShowProgress(false); setMinimizedProgress(true) }}
        />
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