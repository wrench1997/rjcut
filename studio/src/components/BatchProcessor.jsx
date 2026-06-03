import { useState, useEffect, useCallback } from 'react'
import useBatchStore from '../api/useBatchProcessStore'
import { setApiKey } from '../api/api'

// --- 现代化进度条 ---
function TailwindProgressBar({ progress, status }) {
  const colors = {
    uploading: 'bg-blue-500',
    drafting: 'bg-indigo-500',
    composing: 'bg-amber-500',
    downloading: 'bg-green-500',
    succeeded: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-slate-400',
    idle: 'bg-slate-300'
  }
  return (
    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
      <div 
        className={`h-full transition-all duration-300 ease-out ${colors[status] || 'bg-blue-500'}`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  )
}

// --- 任务卡片组件 ---
function TaskCard({ task }) {
  const stageLabels = {
    idle: '等待中',
    uploading: '上传中',
    drafting: '草稿生成中',
    composing: '视频合成中',
    downloading: '下载中',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
  }

  const stageIcons = {
    idle: '⏳',
    uploading: '⬆️',
    drafting: '📝',
    composing: '🎬',
    downloading: '⬇️',
    succeeded: '✅',
    failed: '❌',
    cancelled: '🚫',
  }

  const handleDownload = async () => {
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
      const apiKey = localStorage.getItem('rjcut_api_key')
      
      const targetTaskId = task.composeTaskId || task.draftTaskId
      const targetFileKey = task.composeTaskId ? 'final_video' : 'cleaned_video'

      const res = await fetch(`${API_BASE_URL}/v1/tasks/${targetTaskId}/files/${targetFileKey}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      
      const data = await res.json()
      if (data.code === 0 && data.data?.download_url) {
        window.open(data.data.download_url, '_blank')
      } else {
        alert('获取下载链接失败：' + (data.message || '未知错误'))
      }
    } catch (e) {
      alert('请求下载失败：' + e.message)
    }
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 ${
      task.stage === 'failed' ? 'border-red-200 bg-red-50/30' :
      task.stage === 'cancelled' ? 'border-slate-200 bg-slate-50/30' :
      task.stage === 'succeeded' ? 'border-green-200 bg-green-50/30' :
      'border-slate-200'
    }`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{stageIcons[task.stage]}</span>
          <div>
            <h3 className="font-bold text-slate-800 text-sm truncate max-w-[200px]" title={task.id}>{task.id}</h3>
            <p className="text-xs text-slate-500">{stageLabels[task.stage] || task.stage}</p>
          </div>
        </div>
        <span className="text-xs font-bold text-slate-600">{Math.round(task.progress)}%</span>
      </div>

      <TailwindProgressBar progress={task.progress} status={task.stage} />

      {task.error && (
        <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-100">
          <p className="text-xs text-red-600">{task.error}</p>
        </div>
      )}

      {(task.draftTaskId || task.composeTaskId) && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-400 space-y-1 mb-3">
            {task.draftTaskId && <div>草稿：{task.draftTaskId.substring(0, 12)}...</div>}
            {task.composeTaskId && <div>合成：{task.composeTaskId.substring(0, 12)}...</div>}
          </div>
          
          {task.stage === 'succeeded' && (
            <button
              className="w-full py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded-lg transition-colors border border-green-200"
              onClick={handleDownload}
            >
              ⬇️ 下载成片
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// --- 统计卡片组件 ---
function StatCard({ label, value, colorClass }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-black mt-1 ${colorClass}`}>{value}</p>
    </div>
  )
}

// --- 文件选择器组件（简化版）---
function FileSelector({ label, vfs, selectedFile, onSelect, accept, disabled, multiple = false }) {
  const [showBrowser, setShowBrowser] = useState(false)
  const [browserPath, setBrowserPath] = useState('/raw')
  const [browserItems, setBrowserItems] = useState([])

  const loadDirectory = useCallback((path) => {
    if (!vfs) return
    const items = vfs.listDirectory(path)
    setBrowserItems(items)
    setBrowserPath(path)
  }, [vfs])

  const handleFileSelect = (item) => {
    if (!item.isDirectory) {
      if (multiple) {
        const currentFiles = selectedFile || []
        if (!currentFiles.includes(item.path)) {
          onSelect([...currentFiles, item.path])
        }
      } else {
        onSelect(item.path)
        setShowBrowser(false)
      }
    } else {
      loadDirectory(item.path)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      {selectedFile && ((multiple && Array.isArray(selectedFile) && selectedFile.length > 0) || (!multiple && selectedFile)) ? (
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            {multiple && Array.isArray(selectedFile) ? (
              <div className="space-y-1">
                {selectedFile.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-sm text-slate-700 truncate flex-1">📄 {file.split('/').pop()}</span>
                    <button
                      className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      onClick={() => {
                        const newFiles = selectedFile.filter((_, i) => i !== idx)
                        onSelect(newFiles.length > 0 ? newFiles : null)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm text-slate-700">📄 {typeof selectedFile === 'string' ? selectedFile.split('/').pop() : selectedFile}</span>
              </div>
            )}
          </div>
          <button
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            onClick={() => onSelect(multiple ? [] : null)}
          >
            清除
          </button>
        </div>
      ) : (
        <button
          className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
          onClick={() => setShowBrowser(true)}
          disabled={disabled || !vfs}
        >
          📁 从 VFS 选择文件
        </button>
      )}

      {showBrowser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBrowser(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">选择文件 {multiple && '(多选模式)'}</h3>
              <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" onClick={() => setShowBrowser(false)}>✕</button>
            </div>
            
            <div className="p-4 border-b border-slate-100 flex gap-2">
              <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors" onClick={() => loadDirectory('/raw')}>📁 项目</button>
              <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors" onClick={() => loadDirectory('/drafts')}>📝 草稿</button>
              <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors" onClick={() => loadDirectory('/audio')}>🎵 音频</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {browserItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400">空目录</div>
              ) : (
                <div className="space-y-1">
                  {browserItems.map(item => (
                    <div
                      key={item.path}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                      onClick={() => handleFileSelect(item)}
                    >
                      <span className="text-lg">{item.isDirectory ? '📁' : '📄'}</span>
                      <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                      {item.size && <span className="text-xs text-slate-400">{(item.size / 1024 / 1024).toFixed(1)} MB</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 主组件
export default function BatchProcessor({ vfs, apiKey }) {
  const [showConfigEditor, setShowConfigEditor] = useState(false)
  const [projectCustomFiles, setProjectCustomFiles] = useState({
    videos: [],
    script: null,
    corrections: null,
    bgm: null,
    scenes: null,
  })
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [localError, setLocalError] = useState('')

  const {
    tasks,
    isRunning,
    startTime,
    endTime,
    startBatch,
    abortBatch,
    reset,
    getTaskStats,
  } = useBatchStore()

  useEffect(() => {
    setApiKey(apiKey)
  }, [apiKey])

  const stats = getTaskStats()

  const prepareTasks = useCallback(() => {
    const { videos, script, corrections, bgm, scenes } = projectCustomFiles
    if (!videos || videos.length === 0) return []
    
    return videos.map((videoPath, index) => ({
      id: `video_${index + 1}_${videoPath.split('/').pop()}`,
      vfsVideoPath: videoPath,
      vfsScriptPath: script,
      vfsCorrectionsPath: corrections,
      vfsBgmPath: bgm,
      vfsScenesPath: scenes,
      stage: 'idle',
      progress: 0,
    }))
  }, [projectCustomFiles])

  const handleStartBatch = async () => {
    setLocalError('')
    
    if (!projectCustomFiles.videos || projectCustomFiles.videos.length === 0) {
      setLocalError('请至少选择一个视频文件')
      return
    }

    const taskItems = prepareTasks()
    if (taskItems.length === 0) {
      setLocalError('没有可处理的任务')
      return
    }
    
    startBatch(taskItems, maxConcurrent)
  }

  const getRunningDuration = () => {
    if (!startTime) return '0:00'
    const start = new Date(startTime)
    const end = endTime ? new Date(endTime) : new Date()
    const diff = Math.floor((end - start) / 1000)
    const minutes = Math.floor(diff / 60)
    const seconds = diff % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">批量视频处理</h2>
          <p className="text-sm text-slate-500 mt-1">上传视频或指定参数，并行处理多个生成任务</p>
        </div>
      </div>

      {tasks.length > 0 ? (
        <div className="space-y-6">
          {/* 数据看板 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="总任务" value={stats.total} colorClass="text-slate-800" />
            <StatCard label="处理中" value={stats.running} colorClass="text-blue-600" />
            <StatCard label="成功" value={stats.succeeded} colorClass="text-green-600" />
            <StatCard label="失败" value={stats.failed} colorClass="text-red-600" />
            <StatCard label="取消" value={stats.cancelled} colorClass="text-slate-400" />
          </div>

          {/* 任务卡片网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tasks.map(task => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>

          {/* 控制按钮 */}
          <div className="flex justify-center gap-4 pt-4">
            {isRunning && (
              <button
                className="px-6 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg transition-colors border border-red-200"
                onClick={abortBatch}
              >
                🛑 取消所有任务
              </button>
            )}
            {!isRunning && (
              <button
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
                onClick={() => {
                  reset()
                  setProjectCustomFiles({ videos: [], script: null, corrections: null, bgm: null, scenes: null })
                }}
              >
                重置
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左侧上传区 */}
          <div className="col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-base font-bold text-slate-800 mb-4">上传处理源文件</h3>
              
              <FileSelector
                label="视频文件（支持多选）*"
                vfs={vfs}
                selectedFile={projectCustomFiles.videos}
                onSelect={(paths) => setProjectCustomFiles({ ...projectCustomFiles, videos: paths })}
                multiple={true}
              />

              <div className="grid grid-cols-2 gap-4 mt-4">
                <FileSelector
                  label="脚本文件 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.script}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, script: path })}
                  accept=".json"
                />

                <FileSelector
                  label="修正文件 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.corrections}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, corrections: path })}
                  accept=".json"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <FileSelector
                  label="背景音乐 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.bgm}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, bgm: path })}
                  accept="audio/*"
                />

                <FileSelector
                  label="场景目录 (可选)"
                  vfs={vfs}
                  selectedFile={projectCustomFiles.scenes}
                  onSelect={(path) => setProjectCustomFiles({ ...projectCustomFiles, scenes: path })}
                  accept="directory"
                />
              </div>
            </div>
          </div>

          {/* 右侧配置区 */}
          <div className="col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-base font-bold text-slate-800 mb-4">全局参数配置</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">并发数量</label>
                  <select 
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={maxConcurrent}
                    onChange={(e) => setMaxConcurrent(Number(e.target.value))}
                  >
                    <option value={1}>1 (最稳定)</option>
                    <option value={2}>2</option>
                    <option value={3}>3 (推荐)</option>
                    <option value={5}>5 (快速)</option>
                    <option value={10}>10</option>
                  </select>
                </div>
                
                <div className="pt-4 border-t border-slate-100">
                  <button
                    className="w-full text-left text-sm font-medium text-slate-700 flex justify-between items-center"
                    onClick={() => setShowConfigEditor(!showConfigEditor)}
                  >
                    {showConfigEditor ? '收起高级配置' : '展开高级配置'}
                    <span className="transform transition-transform">{showConfigEditor ? '▲' : '▼'}</span>
                  </button>
                  
                  {showConfigEditor && (
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-slate-600 mb-1">自定义配置 (JSON)</label>
                      <textarea
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                        rows={4}
                        placeholder='{"pipeline": {"remove_keyword": "转场"}}'
                      />
                    </div>
                  )}
                </div>

                <hr className="border-slate-100" />
                
                <button 
                  onClick={handleStartBatch}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm shadow-blue-500/30 transition-all"
                >
                  🚀 开始批量处理
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {localError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-600">{localError}</p>
        </div>
      )}
    </div>
  )
}