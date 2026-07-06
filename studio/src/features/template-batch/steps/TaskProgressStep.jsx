/**
 * 模板混剪 - 步骤 5：任务进度与下载
 * 显示所有任务的进度状态，支持下载和预览
 */
import { useState, useEffect } from 'react'
import { Download, CheckCircle, XCircle, Ban, Hourglass, Upload, FileText, Clapperboard, Folder, Play, X } from 'lucide-react'
import { TailwindProgressBar } from '../../../components/BatchProgress.jsx'
import useBatchStore from '../../../api/useBatchProcessStore'

// 从 BatchProcessor.jsx 复制的工具函数
function parseProjectNameFromVFS(vfsPath) {
  if (!vfsPath) return null
  const parts = vfsPath.split('/').filter(Boolean)
  if (parts.length === 0) return null
  
  // 支持 /项目名/场景 X 或 /projects/项目名/场景 X 格式
  if (parts[0] === 'projects' && parts.length >= 2) {
    return parts[1]
  }
  return parts[0]
}

function buildVFSPath(projectName, folderName) {
  return `/${projectName}/${folderName}`
}

const PROJECT_FOLDERS = {
  OUTPUT: '输出'
}

export default function TaskProgressStep({ draft, vfs, apiKey }) {
  const { tasks } = useBatchStore()
  const [downloadingTaskId, setDownloadingTaskId] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [previewTaskId, setPreviewTaskId] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [savedPaths, setSavedPaths] = useState({})

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

  // 清理预览 URL
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  // 加载已保存的视频路径
  useEffect(() => {
    const loadSavedPaths = async () => {
      if (!vfs) return
      
      const paths = {}
      const completedTasks = tasks.filter(t => t.stage === 'succeeded')
      
      for (const task of completedTasks) {
        const defaultPath = `/输出/${task.id}_成片.mp4`
        const exists = await vfs.exists(defaultPath)
        if (exists) {
          paths[task.id] = defaultPath
        }
      }
      
      setSavedPaths(paths)
    }
    
    loadSavedPaths()
  }, [tasks, vfs])

  const handleDownload = async (taskId, saveToVFS = true) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    
    setDownloadingTaskId(taskId)
    setDownloadProgress(0)
    
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
      const targetTaskId = task.composeTaskId || task.draftTaskId
      const targetFileKey = task.composeTaskId ? 'final_video' : 'cleaned_video'

      const res = await fetch(`${API_BASE_URL}/v1/tasks/${targetTaskId}/files/${targetFileKey}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      
      const data = await res.json()
      if (data.code !== 0 || !data.data?.download_url) {
        throw new Error('获取下载链接失败：' + (data.message || '未知错误'))
      }

      const downloadUrl = data.data.download_url
      
      if (saveToVFS && vfs) {
        // 保存到 VFS 项目输出文件夹
        const videoFilename = `${task.id}_成片.mp4`
        let outputDir
        
        if (task.vfsScenesPath) {
          const projectName = parseProjectNameFromVFS(task.vfsScenesPath)
          if (projectName) {
            outputDir = buildVFSPath(projectName, PROJECT_FOLDERS.OUTPUT)
          } else {
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
          setSavedPaths(prev => ({ ...prev, [taskId]: outputPath }))
          alert(`视频已保存到：${outputPath}`)
          setDownloadingTaskId(null)
          setDownloadProgress(null)
        }, 300)
      } else {
        // 直接在浏览器中打开下载
        window.open(downloadUrl, '_blank')
        setDownloadingTaskId(null)
        setDownloadProgress(null)
      }
    } catch (e) {
      alert('下载失败：' + e.message)
      setDownloadingTaskId(null)
      setDownloadProgress(null)
    }
  }

  const handlePreview = async (taskId) => {
    if (!vfs) return
    
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    
    const savedPath = savedPaths[taskId]
    if (!savedPath) return
    
    try {
      const blob = await vfs.readFileAsBlob(savedPath)
      if (blob.size === 0) {
        alert('视频文件为空')
        return
      }
      
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      setPreviewTaskId(taskId)
    } catch (e) {
      console.error('[TaskProgressStep] 加载预览视频失败:', e)
      alert('加载预览失败：' + e.message)
    }
  }

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    setPreviewTaskId(null)
  }

  const stats = {
    total: tasks.length,
    running: tasks.filter(t => t.stage !== 'done' && t.stage !== 'failed' && t.stage !== 'cancelled').length,
    succeeded: tasks.filter(t => t.stage === 'done' || t.stage === 'succeeded').length,
    failed: tasks.filter(t => t.stage === 'failed').length,
    cancelled: tasks.filter(t => t.stage === 'cancelled').length,
  }

  const allDone = stats.running === 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">任务进度与下载</h2>
        <p className="text-sm text-slate-500 mt-1">
          查看所有任务的生成进度，完成后可下载或预览视频
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">总任务</p>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">处理中</p>
          <p className="text-2xl font-bold text-blue-600">{stats.running}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">成功</p>
          <p className="text-2xl font-bold text-green-600">{stats.succeeded}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">失败</p>
          <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-xs text-slate-500 mb-1">取消</p>
          <p className="text-2xl font-bold text-slate-400">{stats.cancelled}</p>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">任务列表</h3>
        </div>
        
        <div className="divide-y divide-slate-100">
          {tasks.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Hourglass className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无任务</p>
            </div>
          ) : (
            tasks.map(task => {
              const StageIcon = stageIcons[task.stage] || Hourglass
              const isDownloading = downloadingTaskId === task.id
              const isPreviewing = previewTaskId === task.id
              const hasSaved = savedPaths[task.id]
              
              return (
                <div key={task.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <StageIcon 
                        size={20} 
                        className={
                          task.stage === 'succeeded' || task.stage === 'done' ? 'text-green-500' :
                          task.stage === 'failed' ? 'text-red-500' :
                          task.stage === 'cancelled' ? 'text-slate-400' :
                          'text-blue-500 animate-pulse'
                        } 
                      />
                      <div>
                        <h4 className="font-semibold text-slate-800 text-sm">
                          {task.displayName || task.id}
                        </h4>
                        <p className="text-xs text-slate-500">
                          {stageLabels[task.stage]}
                          {task.sceneName && ` · ${task.sceneName}`}
                        </p>
                      </div>
                    </div>
                    
                    {task.stage === 'succeeded' && (
                      <div className="flex items-center gap-2">
                        {hasSaved && (
                          <button
                            onClick={() => handlePreview(task.id)}
                            className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors flex items-center gap-1"
                          >
                            <Play size={12} />
                            预览
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(task.id, true)}
                          disabled={isDownloading}
                          className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <Download size={12} />
                          保存到项目
                        </button>
                        <button
                          onClick={() => handleDownload(task.id, false)}
                          disabled={isDownloading}
                          className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <Folder size={12} />
                          直接下载
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <TailwindProgressBar progress={task.progress} status={task.stage} />
                  
                  {isDownloading && downloadProgress !== null && (
                    <div className="mt-2 text-xs text-blue-600">
                      下载中... {downloadProgress}%
                    </div>
                  )}
                  
                  {task.stage === 'failed' && task.error && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      {task.error}
                    </div>
                  )}
                  
                  {hasSaved && (
                    <div className="mt-2 text-xs text-slate-500">
                      已保存：{savedPaths[task.id]}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* 完成提示 */}
      {allDone && tasks.length > 0 && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                全部任务已完成！
              </p>
              <p className="text-xs text-green-700 mt-1">
                共 {stats.succeeded} 个成功，{stats.failed} 个失败，{stats.cancelled} 个取消
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 视频预览弹窗 */}
      {previewUrl && previewTaskId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800">视频预览</h3>
              <button
                onClick={closePreview}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>
            <div className="p-4">
              <video
                src={previewUrl}
                controls
                autoPlay
                className="w-full rounded-lg bg-slate-100"
                onPlay={() => console.log('[TaskProgressStep] 视频开始播放')}
                onError={(e) => console.error('[TaskProgressStep] 视频播放失败:', e)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}