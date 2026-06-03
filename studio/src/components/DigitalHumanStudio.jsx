import { useState, useEffect, useCallback } from 'react'
import { getCommonPersons, getCustomPersons, getVoices, createDhGenerateTask, getDhTaskDetail, getDhVideoUrl } from '../api/api'
import { getSharedFileSystem } from '../utils/virtualFileSystem'

// =====================================================
// 左侧：资产选择 (数字人与声音)
// =====================================================
function AvatarPicker({ persons, voices, selectedPerson, onSelectPerson, selectedVoice, onSelectVoice }) {
  return (
    <div className="w-96 bg-white border-r border-slate-200 flex flex-col h-full z-10 flex-shrink-0">
      {/* 标题区 */}
      <div className="p-5 border-b border-slate-100 flex-shrink-0 bg-gradient-to-r from-blue-50 to-white">
        <h2 className="text-base font-bold text-slate-800">1. 选择出镜数字人</h2>
        <p className="text-xs text-slate-500 mt-1">点击选择一位数字人进行视频创作</p>
      </div>
      
      {/* 数字人列表 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
        {persons.map(person => (
          <div
            key={person.id}
            onClick={() => onSelectPerson(person)}
            className={`group relative w-full h-24 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 ${
              selectedPerson?.id === person.id 
                ? 'ring-2 ring-blue-500 shadow-lg scale-[1.02]' 
                : 'shadow-md hover:shadow-lg hover:scale-[1.01]'
            }`}
          >
            {person.cover_url ? (
              <img 
                src={person.cover_url} 
                alt={person.name} 
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" 
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-3xl">
                👤
              </div>
            )}
            {/* 遮罩层 */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
            {/* 名字标签 */}
            <div className="absolute inset-y-0 left-0 flex items-center pl-3">
              <p className="text-white text-sm font-bold truncate drop-shadow-lg pr-2">{person.name}</p>
            </div>
            {/* 选中标识 */}
            {selectedPerson?.id === person.id && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-lg">
                ✓
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* 配音选择区 */}
      <div className="p-5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
        <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
          <span>🎤</span> 配音角色 (可选)
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
// 中间：批量文案输入
// =====================================================
function BatchScriptInput({ scripts, setScripts }) {
  const handleAdd = () => setScripts([...scripts, { id: Date.now(), text: '' }])
  const handleRemove = (id) => setScripts(scripts.filter(s => s.id !== id))
  const handleChange = (id, text) => setScripts(scripts.map(s => s.id === id ? { ...s, text } : s))

  return (
    <div className="flex-1 bg-slate-50 border-r border-slate-200 flex flex-col h-full relative">
      <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center">
        <h2 className="text-sm font-bold text-slate-800">2. 输入批量文案 ({scripts.length} 条)</h2>
        <p className="text-xs text-slate-500 mt-1">每条文案将生成一个独立的数字人视频</p>
        <button onClick={handleAdd} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-200">
          + 新增文案
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {scripts.map((script, idx) => (
          <div key={script.id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-slate-400">视频 {idx + 1}</span>
              {scripts.length > 1 && (
                <button onClick={() => handleRemove(script.id)} className="text-red-400 hover:text-red-600">✕</button>
              )}
            </div>
            <textarea
              className="w-full h-24 text-sm resize-none focus:outline-none"
              placeholder="输入该视频的播报文案..."
              value={script.text}
              onChange={(e) => handleChange(script.id, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// =====================================================
// 右侧：保存路径配置
// =====================================================
function SavePathConfig({ savePath, setSavePath, onGenerate, isGenerating }) {
  return (
    <div className="w-80 bg-white flex flex-col h-full z-10">
      <div className="p-4 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-800">3. 保存路径配置</h2>
        <p className="text-[10px] text-slate-500 mt-1">选择数字人视频保存位置</p>
      </div>
      
      <div className="flex-1 p-4 space-y-6 overflow-y-auto custom-scrollbar">
        {/* 保存路径设置 */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">
            📁 VFS 保存路径
          </label>
          <input
            type="text"
            className="w-full text-xs p-2 rounded border border-slate-200 bg-white"
            placeholder="/digital_humans"
            value={savePath}
            onChange={e => setSavePath(e.target.value)}
          />
          <p className="text-[10px] text-slate-400 mt-1">
            生成的数字人视频将保存到此目录
          </p>
          <p className="text-[10px] text-slate-500 mt-2">
            💡 提示：生成完成后，可在【批量处理】中选择这些视频进行后期合成
          </p>
        </div>

        {/* 使用说明 */}
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <h4 className="text-xs font-bold text-blue-800 mb-2">📖 使用流程</h4>
          <ol className="text-[10px] text-blue-700 space-y-1 list-decimal list-inside">
            <li>选择数字人和声音</li>
            <li>输入批量文案</li>
            <li>设置保存路径</li>
            <li>点击生成，视频保存到 VFS</li>
            <li>前往【批量处理】进行后期合成</li>
          </ol>
        </div>
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 flex justify-center items-center gap-2 transition-all"
        >
          {isGenerating ? (
            <>
              <span className="animate-spin border-2 border-white border-t-transparent rounded-full w-4 h-4"></span>
              生成中...
            </>
          ) : (
            <>🚀 生成数字人视频</>
          )}
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-2">
          视频将保存到指定 VFS 目录
        </p>
      </div>
    </div>
  )
}

// =====================================================
// 流水线进度面板 (覆盖层)
// =====================================================
function PipelineProgress({ tasks, onClose }) {
  if (tasks.length === 0) return null

  return (
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-base font-bold text-slate-800">📥 生成进度</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
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
                  {task.stage === 'dh_generating' && '🎬 数字人生成中'}
                  {task.stage === 'downloading' && '⬇️ 下载视频中'}
                  {task.stage === 'done' && '✅ 完成'}
                  {task.stage === 'failed' && '❌ 失败'}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    task.stage === 'failed' ? 'bg-red-500' : 'bg-blue-500'
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
      </div>
    </div>
  )
}

// =====================================================
// 主组件
// =====================================================
export default function DigitalHumanStudio({ apiKey, apiBaseUrl }) {
  const [persons, setPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [selectedVoice, setSelectedVoice] = useState('')
  const [scripts, setScripts] = useState([{ id: Date.now(), text: '' }])
  
  // 保存路径配置
  const [savePath, setSavePath] = useState('/digital_humans')

  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [pipelineTasks, setPipelineTasks] = useState([])
  const [showProgress, setShowProgress] = useState(false)

  useEffect(() => {
    // 加载数据
    Promise.all([getCommonPersons(), getCustomPersons(), getVoices()])
      .then(([cRes, pRes, vRes]) => {
        let all = []
        if (cRes?.data?.code === 0) all = [...all, ...(cRes.data.data || [])]
        if (pRes?.data?.code === 0) all = [...all, ...(pRes.data.data || [])]
        setPersons(all)
        if (vRes?.data?.code === 0) setVoices(vRes.data.data || [])
      })
      .catch(err => {
        setStatusMsg('加载数据失败：' + err.message)
      })
  }, [])

  // 核心：生成数字人视频并保存到 VFS
  const startPipeline = async () => {
    const validScripts = scripts.filter(s => s.text.trim())
    if (!selectedPerson) return alert("请选择数字人")
    if (validScripts.length === 0) return alert("请输入至少一条文案")

    setIsGenerating(true)
    setShowProgress(true)
    setStatusMsg('正在生成数字人视频...')

    // 初始化任务状态
    const initialTasks = validScripts.map((script, idx) => ({
      id: `dh_${Date.now()}_${idx}`,
      text: script.text.substring(0, 20) + (script.text.length > 20 ? '...' : ''),
      stage: 'dh_generating',
      progress: 0,
      scriptText: script.text
    }))
    setPipelineTasks(initialTasks)

    try {
      const apiKey = localStorage.getItem('rjcut_api_key')
      const vfs = await getSharedFileSystem()
      
      // 创建 VFS 保存目录
      await vfs.createDirectory(savePath)

      // 并发处理所有任务
      await Promise.all(initialTasks.map(async (task, index) => {
        const script = validScripts[index]
        
        try {
          // [阶段 1] 提交蝉镜数字人任务
          const dhRes = await createDhGenerateTask({
            text: script.text,
            person_id: selectedPerson.id,
            audio_man_id: selectedVoice || undefined,
            hide_subtitle: false, // 保留原生字幕
            client_ref_id: `dh_${task.id}`
          })
          
          if (dhRes?.data?.code !== 0) {
            throw new Error('数字人任务创建失败')
          }
          
          const dhTaskId = dhRes.data.data.task_id
          
          // 轮询数字人状态
          let dhCompleted = false
          while (!dhCompleted) {
            await new Promise(r => setTimeout(r, 3000))
            
            const statusRes = await getDhTaskDetail(dhTaskId)
            const { status, progress } = statusRes.data.data
            
            if (status === 'succeeded') {
              dhCompleted = true
            } else if (status === 'failed') {
              throw new Error('数字人生成失败')
            } else {
              // 更新进度 (0-50%)
              setPipelineTasks(prev => prev.map(t => 
                t.id === task.id ? { ...t, progress: Math.min(progress * 0.5, 50) } : t
              ))
            }
          }

          // [阶段 2] 下载视频到 VFS
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'downloading', progress: 60 } : t
          ))
          
          const urlRes = await getDhVideoUrl(dhTaskId)
          if (urlRes?.data?.code !== 0) {
            throw new Error('获取视频下载链接失败')
          }
          
          const downloadUrl = urlRes.data.data.download_url
          const videoBlob = await (await fetch(downloadUrl)).blob()
          
          // 生成保存文件名
          const timestamp = Date.now()
          const fileName = `dh_${selectedPerson.name}_${timestamp}_${index + 1}.mp4`
          const vfsVideoPath = `${savePath}/${fileName}`
          
          await vfs.writeFile(vfsVideoPath, videoBlob)

          // 任务完成
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'done', progress: 100 } : t
          ))

        } catch (err) {
          setPipelineTasks(prev => prev.map(t => 
            t.id === task.id ? { ...t, stage: 'failed', error: err.message } : t
          ))
        }
      }))

      setStatusMsg(`生成完成！视频已保存到 ${savePath}，请前往【批量处理】进行后期合成`)
      
    } catch (err) {
      setStatusMsg('生成失败：' + err.message)
    } finally {
      setIsGenerating(false)
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
        onSelectPerson={setSelectedPerson}
        selectedVoice={selectedVoice} 
        onSelectVoice={setSelectedVoice}
      />
      
      <BatchScriptInput 
        scripts={scripts} 
        setScripts={setScripts} 
      />
      
      <SavePathConfig 
        savePath={savePath} 
        setSavePath={setSavePath} 
        onGenerate={startPipeline} 
        isGenerating={isGenerating} 
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
          onClose={() => setShowProgress(false)} 
        />
      )}
    </div>
  )
}