import { useState, useEffect, useCallback } from 'react'
import useBatchStore from '../api/useBatchProcessStore'
import { setApiKey } from '../api/api'
import { PROJECT_FOLDERS, parseProjectNameFromVFS, buildVFSPath } from '../utils/project-structure'
import { Hourglass, Upload, FileText, Clapperboard, Download, CheckCircle, XCircle, Ban, Rocket, Folder, Music, X, Check, ArrowLeft, Info } from 'lucide-react'
import Tooltip from './Tooltip'
import GlobalParamsVisualEditor from './GlobalParamsVisualEditor'

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
function TaskCard({ task, vfs }) {
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)
  
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
    idle: Hourglass,
    uploading: Upload,
    drafting: FileText,
    composing: Clapperboard,
    downloading: Download,
    succeeded: CheckCircle,
    failed: XCircle,
    cancelled: Ban,
  }

  const handleDownload = async (saveToVFS = true) => {
    setIsDownloading(true)
    setDownloadProgress(0)
    
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
      const apiKey = localStorage.getItem('rjcut_api_key')
      
      const targetTaskId = task.composeTaskId || task.draftTaskId
      const targetFileKey = task.composeTaskId ? 'final_video' : 'cleaned_video'

      const res = await fetch(`${API_BASE_URL}/v1/tasks/${targetTaskId}/files/${targetFileKey}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      
      const data = await res.json()
      if (data.code !== 0 || !data.data?.download_url) {
        alert('获取下载链接失败：' + (data.message || '未知错误'))
        setIsDownloading(false)
        setDownloadProgress(null)
        return
      }

      const downloadUrl = data.data.download_url
      
      if (saveToVFS && vfs) {
        // 保存到 VFS 项目输出文件夹
        const videoFilename = `${task.id}_成片.mp4`
        // 使用统一的项目结构模块构建输出路径
        // 自动根据场景路径解析项目名，保存到对应项目的"输出"文件夹
        let outputDir
        if (task.vfsScenesPath) {
          // 从场景路径解析项目名（支持 /项目名/场景 X 或 /projects/项目名/场景 X 格式）
          const projectName = parseProjectNameFromVFS(task.vfsScenesPath)
          if (projectName) {
            // 使用统一的项目结构模块构建输出路径
            outputDir = buildVFSPath(projectName, PROJECT_FOLDERS.OUTPUT)
          } else {
            // 无法解析项目名，使用默认路径
            outputDir = '/输出'
          }
        } else {
          outputDir = '/输出'
        }
        const outputPath = `${outputDir}/${videoFilename}`
        
        // 确保输出目录存在
        try {
          const dirExists = await vfs.exists(outputDir)
          if (!dirExists) {
            await vfs.mkdir(outputDir, true)
          }
        } catch (e) {
          console.error('创建输出目录失败:', e)
        }
        
        // 下载文件并保存到 VFS（带进度）
        const downloadRes = await fetch(downloadUrl)
        if (!downloadRes.ok) throw new Error('下载文件失败')
        
        const contentLength = downloadRes.headers.get('content-length')
        const total = contentLength ? parseInt(contentLength) : 0
        
        const reader = downloadRes.body.getReader()
        const chunks = []
        let loaded = 0
        
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          chunks.push(value)
          loaded += value.length
          
          if (total > 0) {
            const percent = Math.round((loaded / total) * 100)
            setDownloadProgress(percent)
          }
        }
        
        setDownloadProgress(90)
        
        // 合并 chunks 为 ArrayBuffer
        const arrayBuffer = new Uint8Array(loaded)
        let position = 0
        for (const chunk of chunks) {
          arrayBuffer.set(chunk, position)
          position += chunk.length
        }
        
        // 写入 VFS
        await vfs.writeFile(outputPath, arrayBuffer)
        
        setDownloadProgress(100)
        setTimeout(() => {
          alert(`视频已保存到：${outputPath}`)
          setIsDownloading(false)
          setDownloadProgress(null)
        }, 300)
      } else {
        // 直接在浏览器中打开下载
        window.open(downloadUrl, '_blank')
        setIsDownloading(false)
        setDownloadProgress(null)
      }
    } catch (e) {
      alert('下载失败：' + e.message)
      setIsDownloading(false)
      setDownloadProgress(null)
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
          {(() => {
            const StageIcon = stageIcons[task.stage] || Hourglass
            return <StageIcon size={20} className="text-slate-500" strokeWidth={2} />
          })()}
          <div>
            <h3 className="font-bold text-slate-800 text-sm truncate max-w-[200px]" title={task.id}>{task.vfsVideoPath?.split('/').pop() || task.id}</h3>
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
          
          {task.stage === 'succeeded' && (
            <div className="space-y-2">
              {isDownloading ? (
                <div className="space-y-2">
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300 ease-out"
                      style={{ width: `${downloadProgress || 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-center text-slate-500">
                    下载中... {downloadProgress || 0}%
                  </p>
                </div>
              ) : (
                <>
                  <button
                    className="w-full py-2 bg-green-50 hover:bg-green-100 text-green-700 text-sm font-medium rounded-lg transition-colors border border-green-200 flex items-center justify-center gap-2"
                    onClick={() => handleDownload(true)}
                    title="保存到 VFS 项目输出文件夹"
                  >
                    <Folder size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> 保存到项目文件夹
                  </button>
                  <button
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-medium rounded-lg transition-colors border border-slate-200 flex items-center justify-center gap-2"
                    onClick={() => handleDownload(false)}
                    title="直接在浏览器中下载"
                  >
                    <Download size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> 浏览器下载
                  </button>
                </>
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

// 文件选择器标签提示
const getLabelTip = (label) => {
  const tips = {
    '数字人视频（单选）*': '选择已生成的数字人视频作为批量处理的源视频',
    '场景文件夹 *': '选择包含场景配置文件的文件夹，每个场景将生成一个独立视频',
    '脚本文件 (可选)': '选择 JSON 格式的脚本文件，用于指导视频剪辑',
    '背景音乐 (可选)': '选择背景音乐文件，将添加到生成的视频中',
    '全局修正文件 (可选)': '选择全局修正配置文件，用于批量修正所有任务的生成结果',
  }
  return tips[label] || ''
}
// --- 文件选择器组件（简化版）---
function FileSelector({ label, vfs, selectedFile, onSelect, accept, disabled, multiple = false, allowDirectorySelection = false }) {
  const [showBrowser, setShowBrowser] = useState(false)
  // 根据 label 类型设置默认路径：场景相关文件默认在根目录，其他在 /projects
  const getDefaultPath = () => {
    if (label.includes('场景文件夹')) return '/'
    if (label.includes('数字人视频')) return '/'
    if (label.includes('脚本文件')) return '/'
    if (label.includes('背景音乐')) return '/'
    if (label.includes('全局修正')) return '/'
    return '/projects'
  }
  const [browserPath, setBrowserPath] = useState(getDefaultPath())
  const [browserItems, setBrowserItems] = useState([])

  const loadDirectory = useCallback(async (path) => {
    if (!vfs) {
      setBrowserItems([])
      return
    }
    try {
      const items = await vfs.listDirectory(path)
      // 确保始终是数组
      setBrowserItems(Array.isArray(items) ? items : [])
    } catch (error) {
      console.error('[FileSelector] 加载目录失败:', error)
      setBrowserItems([])
    }
    setBrowserPath(path)
  }, [vfs])

  // 当浏览器打开时，自动加载目录
  useEffect(() => {
    if (showBrowser && vfs) {
      loadDirectory(browserPath)
    }
  }, [showBrowser, vfs, loadDirectory])

  const handleFileSelect = (item) => {
    if (!item.isDirectory) {
      // 文件：点击选择
      if (multiple) {
        const currentFiles = selectedFile || []
        if (!currentFiles.includes(item.path)) {
          onSelect([...currentFiles, item.path])
        }
      } else {
        onSelect(item.path)
        setShowBrowser(false)
      }
    }
    // 文件夹：点击不处理，需要双击进入或点击选择按钮
  }

  const handleDirectoryEnter = (item) => {
    if (item.isDirectory) {
      loadDirectory(item.path)
    }
  }

  const handleDirectorySelect = (item) => {
    if (item.isDirectory && allowDirectorySelection) {
      if (multiple) {
        const currentFiles = selectedFile || []
        if (!currentFiles.includes(item.path)) {
          onSelect([...currentFiles, item.path])
        }
      } else {
        onSelect(item.path)
        setShowBrowser(false)
      }
    }
  }

  return (
    <div>
      <Tooltip tip={getLabelTip(label)} delay={1000}>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      </Tooltip>
      {selectedFile && ((multiple && Array.isArray(selectedFile) && selectedFile.length > 0) || (!multiple && selectedFile)) ? (
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0">
            {multiple && Array.isArray(selectedFile) ? (
              <div className="space-y-1">
                {selectedFile.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <FileText size={14} className="text-blue-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700 truncate flex-1">{file.split('/').pop()}</span>
                    <Tooltip tip="移除此文件" delay={1000}>
                      <button
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        onClick={() => {
                          const newFiles = selectedFile.filter((_, i) => i !== idx)
                          onSelect(newFiles.length > 0 ? newFiles : null)
                        }}
                      >
                        <X size={14} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2 bg-blue-50 rounded-lg border border-blue-200 flex items-center gap-2">
                <FileText size={14} className="text-blue-500 flex-shrink-0" />
                <span className="text-sm text-slate-700">{typeof selectedFile === 'string' ? selectedFile.split('/').pop() : selectedFile}</span>
              </div>
            )}
          </div>
          <Tooltip tip="清空当前选择" delay={1000}>
            <button
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              onClick={() => onSelect(multiple ? [] : null)}
            >
              清除
            </button>
          </Tooltip>
        </div>
      ) : (
        <Tooltip tip="从虚拟文件系统中选择文件" delay={1000}>
          <button
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
            onClick={() => setShowBrowser(true)}
            disabled={disabled || !vfs}
          >
            <Folder size={16} />从 VFS 选择文件
          </button>
        </Tooltip>
      )}

      {showBrowser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowBrowser(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">
                {allowDirectorySelection ? '选择文件或文件夹' : '选择文件'}
                {multiple && ' (多选模式)'}
              </h3>
              <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors" onClick={() => setShowBrowser(false)}><X size={18} /></button>
            </div>
            
            <div className="p-4 border-b border-slate-100 flex justify-between items-center gap-2">
              <div className="flex items-center gap-2 flex-1">
                <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1" onClick={() => loadDirectory('/projects')}><Folder size={14} />项目</button>
                <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1" onClick={() => loadDirectory('/drafts')}><FileText size={14} />草稿</button>
                <button className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1" onClick={() => loadDirectory('/audio')}><Music size={14} />音频</button>
                <div className="w-px h-4 bg-slate-300" />
                <button 
                  className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                  onClick={() => {
                    const parentPath = browserPath.substring(0, browserPath.lastIndexOf('/')) || '/'
                    loadDirectory(parentPath)
                  }}
                  disabled={browserPath === '/' || browserPath === ''}
                >
                  <ArrowLeft size={14} />上一层
                </button>
              </div>
              <span className="text-xs text-slate-500 truncate max-w-[200px]">当前：{browserPath}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {browserItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400">空目录</div>
              ) : (
                <div className="space-y-1">
                  {browserItems.map(item => (
                    <div
                      key={item.path}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors"
                      onDoubleClick={() => handleDirectoryEnter(item)}
                    >
                      <span className="text-lg">
                        {item.isDirectory 
                          ? <Folder size={18} className="text-slate-500" /> 
                          : <FileText size={18} className="text-slate-500" />
                        }
                      </span>
                      <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                      {item.isDirectory ? (
                        <span className="text-xs text-slate-400 mr-2 flex items-center gap-1"><Folder size={12} />目录</span>
                      ) : (
                        item.size && <span className="text-xs text-slate-400 mr-2">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                      )}
                      {/* 文件夹：显示选择按钮 */}
                      {item.isDirectory && allowDirectorySelection && (
                        <button
                          className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDirectorySelect(item)
                          }}
                        >
                          <Check size={12} />选择
                        </button>
                      )}
                      {/* 文件：点击选择 */}
                      {!item.isDirectory && (
                        <button
                          className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleFileSelect(item)
                          }}
                        >
                          <Check size={12} />选择
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {allowDirectorySelection && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-start gap-2">
                  <Info size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-700">
                    双击文件夹进入，点击"选择"按钮选择当前文件夹
                  </p>
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
  const [digitalHumanVideo, setDigitalHumanVideo] = useState(null)
  const [sceneConfigs, setSceneConfigs] = useState([]) // [{ scenePath, scriptPath, bgmPath }]
  const [correctionsFile, setCorrectionsFile] = useState(null)
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  const [localError, setLocalError] = useState('')
  const [globalParams, setGlobalParams] = useState(null)

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

  const prepareTasks = useCallback(async () => {
    if (!digitalHumanVideo) return []
    if (!sceneConfigs || sceneConfigs.length === 0) return []
    
    // 一个数字人视频 + 多个场景（每个场景有自己的脚本和 BGM）= 多个任务
    const tasks = []
    
    for (const config of sceneConfigs) {
      let scriptPath = config.scriptPath
      let scenePath = config.scenePath
      
      // 如果选择了脚本文件和场景文件夹，自动处理脚本中的 scene_file 路径
      if (scriptPath && scenePath && vfs) {
        try {
          // 读取脚本文件内容
          const scriptContent = await vfs.readFile(scriptPath)
          const scriptText = scriptContent instanceof ArrayBuffer
            ? new TextDecoder('utf-8').decode(scriptContent)
            : String(scriptContent)
          
          const script = JSON.parse(scriptText)
          
          // 如果脚本中有 segments 数组，处理每个 segment 的 scene_file
          if (script.segments && Array.isArray(script.segments)) {
            let modified = false
            for (const segment of script.segments) {
              if (segment.scene_file && !segment.scene_file.startsWith('/')) {
                // scene_file 是相对路径，需要加上场景文件夹路径
                segment.scene_file = `${scenePath}/${segment.scene_file}`
                modified = true
              }
            }
            
            // 如果修改了脚本，保存回临时文件
            if (modified) {
              const tempScriptPath = `${scriptPath}.resolved.json`
              await vfs.writeFile(tempScriptPath, JSON.stringify(script, null, 2))
              scriptPath = tempScriptPath
              console.log('[BatchProcessor] 脚本 scene_file 已自动解析为完整路径:', tempScriptPath)
            }
          }
        } catch (e) {
          console.error('[BatchProcessor] 处理脚本文件失败:', e)
          // 如果处理失败，继续使用原始脚本路径
        }
      }
      
      tasks.push({
        id: `scene_${tasks.length + 1}_${scenePath?.split('/').pop() || 'unknown'}`,
        vfsVideoPath: digitalHumanVideo,
        vfsScriptPath: scriptPath,
        vfsCorrectionsPath: correctionsFile,
        vfsBgmPath: config.bgmPath,
        vfsScenesPath: scenePath,
        stage: 'idle',
        progress: 0,
      })
    }
    
    return tasks
  }, [digitalHumanVideo, sceneConfigs, correctionsFile, vfs])

  const handleStartBatch = async () => {
    setLocalError('')
    
    if (!digitalHumanVideo) {
      setLocalError('请选择一个数字人视频文件')
      return
    }

    if (!sceneConfigs || sceneConfigs.length === 0) {
      setLocalError('请至少添加一个场景配置')
      return
    }

    // 检查每个场景配置是否都有场景路径
    const incompleteConfigs = sceneConfigs.filter(c => !c.scenePath)
    if (incompleteConfigs.length > 0) {
      setLocalError('请为所有场景配置选择场景文件夹')
      return
    }

    const taskItems = await prepareTasks()
    if (taskItems.length === 0) {
      setLocalError('没有可处理的任务')
      return
    }
    
    // 将全局参数配置传递给后台
    startBatch(taskItems, maxConcurrent, globalParams)
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
          <Tooltip tip="批量上传视频或指定参数，并行处理多个生成任务" delay={1000}>
            <h2 className="text-2xl font-bold text-slate-800">批量视频处理</h2>
          </Tooltip>
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
              <TaskCard key={task.id} task={task} vfs={vfs} />
            ))}
          </div>

          {/* 控制按钮 */}
          <div className="flex justify-center gap-4 pt-4">
            {isRunning && (
              <Tooltip tip="立即停止所有正在处理的任务" delay={1000}>
                <button
                  className="px-6 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-medium rounded-lg transition-colors border border-red-200 flex items-center gap-2"
                  onClick={abortBatch}
                >
                  <XCircle size={20} strokeWidth={2} />
                  取消所有任务
                </button>
              </Tooltip>
            )}
            {!isRunning && (
              <Tooltip tip="清空所有任务记录，重新开始配置" delay={1000}>
                <button
                  className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
                  onClick={() => {
                    reset()
                    setDigitalHumanVideo(null)
                    setSceneConfigs([])
                    setCorrectionsFile(null)
                  }}
                >
                  重置
                </button>
              </Tooltip>
            )}
          </div>
        </div>
) : (
        <div className="space-y-6">
          {/* 上传处理源文件区 - 顶部 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">上传处理源文件</h3>
            
            <FileSelector
              label="数字人视频（单选）*"
              vfs={vfs}
              selectedFile={digitalHumanVideo}
              onSelect={(path) => setDigitalHumanVideo(path)}
              multiple={false}
            />

            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-bold text-slate-700">场景配置列表</h4>
                <div>
                  <Tooltip tip="添加一个新的场景配置，可设置场景文件夹、脚本和背景音乐" delay={1000}>
                    <button
                      className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                      onClick={() => setSceneConfigs([...sceneConfigs, { scenePath: null, scriptPath: null, bgmPath: null }])}
                    >
                      + 添加场景
                    </button>
                  </Tooltip>
                </div>
              </div>
              
              {sceneConfigs.length === 0 ? (
                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                  暂无场景配置，请点击"添加场景"按钮
                </div>
              ) : (
                <div className="space-y-4">
                  {sceneConfigs.map((config, index) => (
                    <div key={index} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-slate-700">场景 {index + 1}</span>
                        <button
                          className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          onClick={() => {
                            const newConfigs = sceneConfigs.filter((_, i) => i !== index)
                            setSceneConfigs(newConfigs)
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        <FileSelector
                          label="场景文件夹 *"
                          vfs={vfs}
                          selectedFile={config.scenePath}
                          onSelect={(path) => {
                            const newConfigs = [...sceneConfigs]
                            newConfigs[index] = { ...config, scenePath: path }
                            setSceneConfigs(newConfigs)
                          }}
                          multiple={false}
                          allowDirectorySelection={true}
                        />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <FileSelector
                            label="脚本文件 (可选)"
                            vfs={vfs}
                            selectedFile={config.scriptPath}
                            onSelect={(path) => {
                              const newConfigs = [...sceneConfigs]
                              newConfigs[index] = { ...config, scriptPath: path }
                              setSceneConfigs(newConfigs)
                            }}
                            accept=".json"
                            multiple={false}
                          />
                          
                          <FileSelector
                            label="背景音乐 (可选)"
                            vfs={vfs}
                            selectedFile={config.bgmPath}
                            onSelect={(path) => {
                              const newConfigs = [...sceneConfigs]
                              newConfigs[index] = { ...config, bgmPath: path }
                              setSceneConfigs(newConfigs)
                            }}
                            accept="audio/*"
                            multiple={false}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6">
              <FileSelector
                label="全局修正文件 (可选)"
                vfs={vfs}
                selectedFile={correctionsFile}
                onSelect={(path) => setCorrectionsFile(path)}
                accept=".json"
                multiple={false}
              />
            </div>
          </div>

          {/* 全局参数配置区 - 底部 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-base font-bold text-slate-800 mb-4">全局参数配置</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Tooltip tip="同时处理的任务数量，数量越大速度越快但可能导致 API 限流" delay={1000}>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">并发数量</label>
                </Tooltip>
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
              
              <div className="flex items-end">
                <button
                  className="w-full text-left text-sm font-medium text-blue-600 hover:text-blue-700 flex justify-between items-center"
                  onClick={() => setShowConfigEditor(!showConfigEditor)}
                >
                  <Tooltip tip="点击展开或收起高级可视化配置选项" delay={1000}>
                    <span>{showConfigEditor ? '收起高级配置' : '展开高级配置'}</span>
                  </Tooltip>
                  <span className="transform transition-transform">{showConfigEditor ? '▲' : '▼'}</span>
                </button>
              </div>
            </div>
            
            {showConfigEditor && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <GlobalParamsVisualEditor
                  value={globalParams}
                  onChange={setGlobalParams}
                />
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-slate-100">
              <div className="flex justify-center">
                <Tooltip tip="开始按照配置批量处理所有场景" delay={1000}>
                  <button 
                    onClick={handleStartBatch}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm shadow-blue-500/30 transition-all"
                  >
                    <Rocket size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} /> 开始批量处理
                  </button>
                </Tooltip>
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