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
  const { tasks, updateTask } = useBatchStore()
  const [downloadingTaskId, setDownloadingTaskId] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [previewTaskId, setPreviewTaskId] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [savedPaths, setSavedPaths] = useState({})
  const [composingTaskId, setComposingTaskId] = useState(null)
  const [composeProgress, setComposeProgress] = useState(null)

  const stageLabels = {
    idle: '等待中',
    uploading: '上传中',
    drafting: '时间线准备中',
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

  // 监听本地模板任务，timeline 就绪后自动触发前端视频合成
  useEffect(() => {
    const composeVideo = async (task) => {
      const taskId = task.id
      const isTemplateBatch = !!task.templateMeta?.templateId
      
      if (!isTemplateBatch) return
      if (task.stage !== 'succeeded') return
      if (composingTaskId === taskId) return // 已经在合成中
      
      const vfsPath = `/输出/${taskId}_成片.mp4`
      const alreadyExists = await vfs.exists(vfsPath)
      if (alreadyExists) return // 已经合成过了
      
      try {
        console.log('[TaskProgressStep] 开始前端合成视频:', taskId)
        setComposingTaskId(taskId)
        setComposeProgress(0)
        updateTask(taskId, { stage: 'composing', progress: 0 })
        
        // 1. 读取由 .rjdh.json + 模板素材绑定生成的 timeline.json
        const timelinePath = task.vfsTimelinePath || task.vfsScriptPath
        if (!timelinePath) throw new Error('缺少 timeline.json 路径')

        const timelineContent = await vfs.readFile(timelinePath)
        const timeline = JSON.parse(new TextDecoder().decode(timelineContent))
        if (!Array.isArray(timeline.segments) || timeline.segments.length === 0) {
          throw new Error('timeline.json 中没有可渲染片段')
        }

        // 2. 读取完整数字人视频
        const videoBlob = await vfs.readFileAsBlob(task.vfsVideoPath)

        // 3. 初始化本地视频引擎，并按字级时间轴裁出每个语义片段。
        const { videoEditorEngine } = await import('../../../utils/videoEditorEngine.js')
        await videoEditorEngine.initialize()
        videoEditorEngine.setProgressCallback((progress) => {
          const percent = Math.round(progress * 100)
          setComposeProgress(percent)
          updateTask(taskId, { progress: percent })
        })

        const cutRanges = timeline.segments.map((segment, index) => ({
          start: Number(segment.start ?? segment.start_ms / 1000),
          end: Number(segment.end ?? segment.end_ms / 1000),
          label: segment.id || `segment_${index + 1}`,
        }))
        const videoInfo = timeline.video_info || {}
        const cutParts = await videoEditorEngine.cutVideoSegments(
          videoBlob,
          cutRanges,
          videoInfo.width || 1080,
          videoInfo.height || 1920,
          videoInfo.fps || 30
        )
        const partFiles = cutParts.map((item) => item.blob)

        // 4. 读取每个 scene 片段绑定的 VFS 素材。相同文件只读取一次。
        const sceneFiles = {}
        for (const segment of timeline.segments) {
          if (segment.type !== 'scene' || !segment.scene_file) continue
          if (sceneFiles[segment.scene_file]) continue
          const scenePath = segment.scene_vfs_path || segment.scene_file
          try {
            sceneFiles[segment.scene_file] = await vfs.readFileAsBlob(scenePath)
            console.log('[TaskProgressStep] 读取场景文件:', scenePath)
          } catch (error) {
            throw new Error(`读取场景素材失败：${scenePath}；${error.message}`)
          }
        }

        // 5. 读取 BGM（如果有）并在本地完成最终合成。
        let bgmFile = null
        if (task.vfsBgmPath) {
          try {
            bgmFile = await vfs.readFileAsBlob(task.vfsBgmPath)
          } catch (error) {
            console.warn('[TaskProgressStep] 读取 BGM 失败:', error)
          }
        }

        const pipelineOptions = task.globalParams?.pipeline || {}
        const resultBlob = await videoEditorEngine.composeFromTimeline(
          timeline,
          partFiles,
          sceneFiles,
          {
            useTransitions: pipelineOptions.use_transitions ?? false,
            transitionType: pipelineOptions.transition_type || 'fade',
            transitionDuration: pipelineOptions.transition_duration ?? 0.5,
            bgmFile,
            bgmVolume: task.audioConfig?.bgmVolume ?? 0.3,
            originalVolume: task.audioConfig?.originalVolume ?? 1.0,
          }
        )

        // 6. 保存合成后的视频到 VFS
        console.log('[TaskProgressStep] 保存合成视频到:', vfsPath)
        const arrayBuffer = await resultBlob.arrayBuffer()
        await vfs.writeFile(vfsPath, new Uint8Array(arrayBuffer))
        
        setSavedPaths(prev => ({ ...prev, [taskId]: vfsPath }))
        updateTask(taskId, { stage: 'succeeded', progress: 100 })
        
        console.log('[TaskProgressStep] 视频合成完成:', taskId)
        alert(`视频合成完成：${taskId}`)
        
      } catch (e) {
        console.error('[TaskProgressStep] 视频合成失败:', e)
        updateTask(taskId, { 
          stage: 'failed', 
          error: '前端合成失败：' + e.message 
        })
        alert('视频合成失败：' + e.message)
      } finally {
        setComposingTaskId(null)
        setComposeProgress(null)
      }
    }
    
    // WASM/FFmpeg 实例按队列逐条合成，避免多个批次同时争用同一虚拟文件系统。
    if (!composingTaskId) {
      const nextTask = tasks.find((task) =>
        task.stage === 'succeeded' &&
        task.templateMeta?.templateId &&
        !savedPaths[task.id]
      )
      if (nextTask) composeVideo(nextTask)
    }
  }, [tasks, vfs, savedPaths, composingTaskId, updateTask])

  const handleDownload = async (taskId, saveToVFS = true) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    
    setDownloadingTaskId(taskId)
    setDownloadProgress(0)
    
    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
      
      // 🎨 模板混剪任务：视频由前端合成，从 VFS 读取
      // 普通批量任务：从后端下载合成后的视频
      const isTemplateBatch = !!task.templateMeta?.templateId
      
      if (isTemplateBatch) {
        // 模板混剪：从 VFS 读取前端合成的视频
        const vfsPath = `/输出/${task.id}_成片.mp4`
        const exists = await vfs.exists(vfsPath)
        
        if (!exists) {
          throw new Error('视频尚未合成或保存，请稍后再试')
        }
        
        if (saveToVFS) {
          // 已经在 VFS 中，直接提示路径
          alert(`视频已存在于：${vfsPath}`)
          setSavedPaths(prev => ({ ...prev, [taskId]: vfsPath }))
        } else {
          // 下载 VFS 中的文件到本地
          const blob = await vfs.readFileAsBlob(vfsPath)
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${task.id}_成片.mp4`
          a.click()
          URL.revokeObjectURL(url)
        }
        
        setDownloadingTaskId(null)
        setDownloadProgress(null)
        return
      }
      
      // 普通批量处理：从后端下载
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
    
    // 🎨 模板混剪任务：从 VFS 读取前端合成的视频
    const isTemplateBatch = !!task.templateMeta?.templateId
    let savedPath = savedPaths[taskId]
    
    if (isTemplateBatch && !savedPath) {
      // 尝试从默认路径加载
      const defaultPath = `/输出/${task.id}_成片.mp4`
      const exists = await vfs.exists(defaultPath)
      if (exists) {
        savedPath = defaultPath
      }
    }
    
    if (!savedPath) {
      alert('视频尚未保存，请先下载或合成')
      return
    }
    
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
              
              // 🎨 模板混剪任务：draft 完成后需要前端合成视频
              const isTemplateBatch = !!task.templateMeta?.templateId
              const needsFrontendCompose = isTemplateBatch && task.stage === 'succeeded' && !hasSaved
              
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
                          {needsFrontendCompose && '（等待前端合成）'}
                        </p>
                      </div>
                    </div>
                    
                    {task.stage === 'succeeded' && (
                      <div className="flex items-center gap-2">
                        {hasSaved ? (
                          <>
                            <button
                              onClick={() => handlePreview(task.id)}
                              className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors flex items-center gap-1"
                            >
                              <Play size={12} />
                              预览
                            </button>
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
                          </>
                        ) : isTemplateBatch ? (
                          <div className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded border border-amber-200">
                            ⏳ 字级时间线已就绪，等待本地合成视频
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  
                  <TailwindProgressBar progress={task.progress} status={task.stage} />
                  
                  {isDownloading && downloadProgress !== null && (
                    <div className="mt-2 text-xs text-blue-600">
                      下载中... {downloadProgress}%
                    </div>
                  )}
                  
                  {composingTaskId === task.id && composeProgress !== null && (
                    <div className="mt-2 text-xs text-purple-600">
                      🎬 前端合成中... {composeProgress}%
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closePreview}>
          {/* 🎨 修改：针对 9:16 竖屏视频优化窗口尺寸，使用 aspect-[9/16] 保持比例 */}
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" 
               style={{ width: 'min(450px, 90vw)', height: 'min(800px, 90vh)' }}
               onClick={(e) => e.stopPropagation()}>
            {/* 标题栏 */}
            <div className="flex items-center justify-between p-3 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
              <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                视频预览
              </h3>
              <button
                onClick={closePreview}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-700"
                title="关闭预览"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>
            {/* 视频播放区域 - 使用 aspect-[9/16] 容器确保竖屏视频最佳显示 */}
            <div className="flex-1 min-h-0 bg-black flex items-center justify-center p-4">
              <video
                src={previewUrl}
                controls
                autoPlay
                className="max-h-full max-w-full rounded-lg shadow-2xl"
                style={{ aspectRatio: '9/16' }}
                onPlay={() => console.log('[TaskProgressStep] 视频开始播放')}
                onError={(e) => console.error('[TaskProgressStep] 视频播放失败:', e)}
              />
            </div>
            {/* 底部信息栏 */}
            <div className="p-3 border-t border-slate-200 flex-shrink-0 bg-slate-50">
              <p className="text-xs text-slate-500 truncate">
                <span className="font-medium text-slate-600">任务 ID:</span> {previewTaskId}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}