import { useState, useEffect, useCallback, useRef } from 'react'
import { User, Trash2, RefreshCw, Sparkles, AlertCircle, History, X, Upload, CheckCircle, Folder, Film, Play, HardDrive, ArrowUpToLine, FileText, ChevronRight, ArrowUp } from 'lucide-react'
import FileBrowser from './FileBrowser'
import useStudioStore from '../store/studioStore'
import {
  getCommonPersons,
  getCustomPersons,
  getCustomPersonDetail,
  syncCustomPersons,
  deleteCustomPerson,
  getVoices,
  presignUpload,
  confirmUpload,
  createDhPersonTask,
  getTaskStatus,
  getDhTaskList,
  getDhVideoUrl
} from '../api/api'

// =====================================================
// 数字人预览组件 - 显示该数字人生成的示例视频
// =====================================================
function PersonPreview({ person, apiKey }) {
  const [sampleVideos, setSampleVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playingVideo, setPlayingVideo] = useState(null)
  const [videoUrl, setVideoUrl] = useState('')

  useEffect(() => {
    const loadSamples = async () => {
      try {
        setLoading(true)
        setError('')
        
        // 获取该数字人的视频任务列表
        const res = await getDhTaskList(null, 10, 0, person.id)
        if (res.data.code === 0) {
          const tasks = res.data.data?.items || res.data.data || []
          // 只保留成功的任务
          const successTasks = tasks.filter(t => t.status === 'success' && t.final_video_oss_key)
          setSampleVideos(successTasks.slice(0, 6)) // 最多显示 6 个
        } else {
          setError('加载示例视频失败')
        }
      } catch (err) {
        console.error('[PersonPreview] 加载示例视频失败:', err)
        setError('加载失败：' + err.message)
      } finally {
        setLoading(false)
      }
    }

    loadSamples()
  }, [person.id])

  const handlePlayVideo = async (task) => {
    try {
      setPlayingVideo(task)
      const res = await getDhVideoUrl(task.id)
      if (res.data.code === 0) {
        setVideoUrl(res.data.data?.download_url || res.data.data?.url)
      }
    } catch (err) {
      console.error('[PersonPreview] 获取视频 URL 失败:', err)
      setError('无法播放视频')
    }
  }

  const handleClosePreview = () => {
    setPlayingVideo(null)
    setVideoUrl('')
  }

  return (
    <div className="space-y-4">
      {/* 数字人信息卡片 */}
      <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
          {person.cover_url ? (
            <img src={person.cover_url} alt={person.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
              <User size={32} />
            </div>
          )}
        </div>
        <div className="flex-1">
          <h4 className="font-bold text-slate-800 text-lg">{person.name}</h4>
          <p className="text-sm text-slate-500 mt-1">ID: {person.id}</p>
          {person.figure_type && (
            <p className="text-xs text-slate-400 mt-1">形象类型：{person.figure_type}</p>
          )}
        </div>
      </div>

      {/* 视频播放器 */}
      {playingVideo && videoUrl && (
        <div className="bg-black rounded-xl overflow-hidden">
          <video 
            src={videoUrl} 
            controls 
            autoPlay 
            className="w-full max-h-[400px]"
          />
          <div className="p-3 bg-slate-800 text-white text-xs">
            <p className="truncate">{playingVideo.text || '示例视频'}</p>
          </div>
        </div>
      )}

      {/* 示例视频列表 */}
      <div>
        <h5 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Film size={16} className="text-blue-500" />
          示例视频 {sampleVideos.length > 0 && <span className="text-xs text-slate-400">（点击播放）</span>}
        </h5>
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-slate-500">加载中...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            <AlertCircle size={16} className="inline mr-2" />
            {error}
          </div>
        ) : sampleVideos.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Film size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无示例视频</p>
            <p className="text-xs mt-1">该数字人还没有生成过视频</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sampleVideos.map((task) => (
              <div 
                key={task.id}
                className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden cursor-pointer group hover:ring-2 hover:ring-blue-500 transition-all"
                onClick={() => handlePlayVideo(task)}
              >
                {/* 这里可以尝试显示视频封面，如果有的话 */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                  <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Play size={18} className="text-blue-600 ml-0.5" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
                  <p className="text-white text-xs truncate">{task.text || '示例视频'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 使用提示 */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-700">
          <Sparkles size={12} className="inline mr-1" />
          点击"创作视频"按钮，使用此数字人创建您的专属视频
        </p>
      </div>
    </div>
  )
}

// =====================================================
// 训练数字人弹窗组件
// =====================================================
function TrainPersonDialog({ onClose, onTrainingComplete, apiKey, vfs }) {
  const [step, setStep] = useState('upload') // upload, training, done
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [personName, setPersonName] = useState('')
  const [trainType, setTrainType] = useState('both')
  const [language, setLanguage] = useState('cn')
  const [taskId, setTaskId] = useState(null)
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [trainingStage, setTrainingStage] = useState('')
  const [error, setError] = useState('')
  const [sourceType, setSourceType] = useState('vfs') // 'vfs' = 从文件管理选择，'upload' = 上传文件
  const [selectedVfsPath, setSelectedVfsPath] = useState('')
  const [showFileBrowser, setShowFileBrowser] = useState(false)
  
  // VFS 简化文件浏览器状态
  const [vfsBrowserPath, setVfsBrowserPath] = useState('/projects')
  const [vfsBrowserItems, setVfsBrowserItems] = useState([])
  const [vfsBrowserLoading, setVfsBrowserLoading] = useState(false)
  
  const fileInputRef = useRef(null)
  
  // 加载 VFS 目录（简化版）
  const loadVfsBrowserDirectory = useCallback(async (path) => {
    if (!vfs) {
      setVfsBrowserItems([])
      return
    }
    try {
      setVfsBrowserLoading(true)
      const items = await vfs.listDirectory(path)
      setVfsBrowserItems(Array.isArray(items) ? items : [])
    } catch (err) {
      console.error('[TrainPersonDialog] 加载目录失败:', err)
      setVfsBrowserItems([])
    } finally {
      setVfsBrowserLoading(false)
    }
    setVfsBrowserPath(path)
  }, [vfs])
  
  // 当路径变化时加载目录
  useEffect(() => {
    if (vfs && sourceType === 'vfs') {
      loadVfsBrowserDirectory(vfsBrowserPath)
    }
  }, [vfs, vfsBrowserPath, sourceType])

  // 上传文件到 OSS
  const uploadFile = async (file) => {
    const apiBaseUrl = localStorage.getItem('rjcut_api_base_url') || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
    
    try {
      setUploading(true)
      setUploadProgress(10)
      
      // 1. 获取预签名 URL
      const presignRes = await fetch(`${apiBaseUrl}/v1/uploads/presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || 'video/mp4',
          purpose: 'dh_person_source',
        }),
      })
      
      if (!presignRes.ok) throw new Error('获取上传 URL 失败')
      const presignData = await presignRes.json()
      const { upload_url, upload_id } = presignData.data
      setUploadProgress(30)
      
      // 2. 上传文件
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'video/mp4' },
        body: file,
      })
      
      if (!uploadRes.ok) throw new Error('文件上传失败')
      setUploadProgress(80)
      
      // 3. 确认上传
      const confirmRes = await fetch(`${apiBaseUrl}/v1/uploads/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ upload_id }),
      })
      
      if (!confirmRes.ok) throw new Error('确认上传失败')
      const confirmData = await confirmRes.json()
      setUploadProgress(100)
      
      return confirmData.data.oss_key
    } catch (err) {
      console.error('上传失败:', err)
      throw err
    } finally {
      setUploading(false)
    }
  }

  // 处理文件选择
  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0]
    if (!selectedFile) return
    
    // 验证文件类型
    if (!selectedFile.type.startsWith('video/')) {
      setError('请选择视频文件')
      return
    }
    
    // 验证文件大小（最大 500MB）
    if (selectedFile.size > 500 * 1024 * 1024) {
      setError('文件大小不能超过 500MB')
      return
    }
    
    setFile(selectedFile)
    setError('')
  }

  // 提交训练任务
  const handleSubmit = async () => {
    if (!file && !selectedVfsPath) {
      setError('请选择视频文件')
      return
    }
    if (!personName.trim()) {
      setError('请输入数字人名称')
      return
    }

    try {
      setError('')
      
      let ossKey = ''
      
      // 1. 根据来源类型处理文件
      if (sourceType === 'upload' && file) {
        // 上传本地文件
        const uploadedKey = await uploadFile(file)
        ossKey = uploadedKey
      } else if (sourceType === 'vfs' && selectedVfsPath) {
        // 从 VFS 选择文件 - 需要转换为 OSS key
        // 这里假设 VFS 路径可以直接作为 OSS key 使用，或者需要调用 API 转换
        const apiBaseUrl = localStorage.getItem('rjcut_api_base_url') || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
        
        // 调用 API 将 VFS 路径转换为可访问的 OSS key
        const convertRes = await fetch(`${apiBaseUrl}/v1/vfs/to-oss`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            vfs_path: selectedVfsPath,
            purpose: 'dh_person_source',
          }),
        })
        
        if (convertRes.ok) {
          const convertData = await convertRes.json()
          if (convertData.data?.oss_key) {
            ossKey = convertData.data.oss_key
          } else {
            // 如果 API 不支持转换，直接使用 VFS 路径作为标识
            ossKey = `vfs:${selectedVfsPath}`
          }
        } else {
          // 降级方案：直接使用 VFS 路径
          ossKey = `vfs:${selectedVfsPath}`
        }
      }
      
      // 2. 创建训练任务
      const taskRes = await createDhPersonTask({
        name: personName.trim(),
        source_video_oss_key: ossKey,
        train_type: trainType,
        language: language,
        error_skip: false,
        resolution_rate: 0,
      })
      
      if (taskRes.data.code !== 0) {
        throw new Error(taskRes.data.message || '创建训练任务失败')
      }
      
      const newTaskId = taskRes.data.data.task_id
      setTaskId(newTaskId)
      setStep('training')
      
      // 3. 开始轮询任务状态
      pollTaskStatus(newTaskId)
    } catch (err) {
      setError(err.message || '训练任务创建失败')
    }
  }

  // 轮询任务状态
  const pollTaskStatus = async (taskId) => {
    const poll = async () => {
      try {
        const res = await getTaskStatus(taskId)
        const task = res.data.data
        
        setTrainingProgress(task.progress || 0)
        setTrainingStage(task.stage || '训练中')
        
        if (task.status === 'success') {
          setStep('done')
          onTrainingComplete?.(task)
        } else if (task.status === 'failed') {
          setError(task.error || '训练失败')
        } else {
          setTimeout(poll, 3000)
        }
      } catch (err) {
        console.error('轮询状态失败:', err)
        setTimeout(poll, 3000)
      }
    }
    poll()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="modal-title text-xl font-bold text-slate-800">训练新数字人</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* 步骤指示器 */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-blue-600' : 'text-slate-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step === 'upload' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>
              {step === 'done' ? <CheckCircle size={16} /> : '1'}
            </div>
            <span className="text-sm font-medium">上传素材</span>
          </div>
          <div className="flex-1 h-px bg-slate-200"></div>
          <div className={`flex items-center gap-2 ${step === 'training' ? 'text-blue-600' : 'text-slate-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step === 'training' ? 'bg-blue-600 text-white' : 'bg-slate-200'}`}>
              2
            </div>
            <span className="text-sm font-medium">训练中</span>
          </div>
          <div className="flex-1 h-px bg-slate-200"></div>
          <div className={`flex items-center gap-2 ${step === 'done' ? 'text-green-600' : 'text-slate-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step === 'done' ? 'bg-green-600 text-white' : 'bg-slate-200'}`}>
              <CheckCircle size={16} />
            </div>
            <span className="text-sm font-medium">完成</span>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle size={18} className="text-red-600 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 步骤 1: 上传素材 */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* 选择方式 */}
            <div className="flex gap-3 mb-6">
              <button
                className={`flex-1 py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                  sourceType === 'vfs'
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 border-blue-500 text-white shadow-md shadow-blue-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => setSourceType('vfs')}
              >
                <HardDrive size={18} />
                <span>从文件管理选择</span>
              </button>
              <button
                className={`flex-1 py-3 rounded-xl border-2 font-medium transition-all flex items-center justify-center gap-2 ${
                  sourceType === 'upload'
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 border-indigo-500 text-white shadow-md shadow-indigo-200'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => setSourceType('upload')}
              >
                <ArrowUpToLine size={18} />
                <span>上传本地文件</span>
              </button>
            </div>

{/* 从 VFS 选择 - 简化版文件选择器 */}
              {sourceType === 'vfs' && (
                <div className="space-y-3">
                  {/* 已选择文件显示 */}
                  {selectedVfsPath && (
                    <div className="border-2 border-green-300 bg-green-50 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl flex items-center justify-center">
                            <Film size={24} className="text-green-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{selectedVfsPath.split('/').pop()}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{selectedVfsPath}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedVfsPath('')}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="清除选择"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* 简化的 VFS 文件选择器 */}
                  <div className="border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b">
                      <div className="flex items-center gap-2">
                        <HardDrive size={16} className="text-blue-500" />
                        <span className="text-sm font-medium text-slate-700">从 VFS 选择视频文件</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                          onClick={() => setVfsBrowserPath('/projects')}
                        >
                          项目
                        </button>
                        <button 
                          className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                          onClick={() => setVfsBrowserPath('/drafts')}
                        >
                          草稿
                        </button>
                        <div className="w-px h-4 bg-slate-300" />
                        <button 
                          className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded transition-colors disabled:opacity-50"
                          onClick={() => {
                            const parentPath = vfsBrowserPath.substring(0, vfsBrowserPath.lastIndexOf('/')) || '/'
                            setVfsBrowserPath(parentPath)
                          }}
                          disabled={vfsBrowserPath === '/'}
                        >
                          <ArrowUp size={14} />
                        </button>
                      </div>
                    </div>
                    
                    {/* 文件列表 */}
                    <div className="max-h-64 overflow-y-auto">
                      {vfsBrowserLoading ? (
                        <div className="flex items-center justify-center h-32 text-slate-400 text-sm">加载中...</div>
                      ) : vfsBrowserItems.length === 0 ? (
                        <div className="flex items-center justify-center h-32 text-slate-400 text-sm">此目录为空</div>
                      ) : (
                        <div className="divide-y">
                          {vfsBrowserItems.map(item => (
                            <div
                              key={item.path}
                              className={`flex items-center gap-3 p-3 transition-colors ${
                                item.isDirectory ? 'hover:bg-slate-50 cursor-pointer' : 
                                item.type?.startsWith('video/') ? 'hover:bg-blue-50 cursor-pointer' : 'opacity-50'
                              }`}
                              onClick={() => {
                                if (item.isDirectory) {
                                  loadVfsBrowserDirectory(item.path)
                                } else if (item.type?.startsWith('video/')) {
                                  setSelectedVfsPath(item.path)
                                }
                              }}
                              onDoubleClick={() => {
                                if (!item.isDirectory && item.type?.startsWith('video/')) {
                                  setSelectedVfsPath(item.path)
                                }
                              }}
                            >
                              <span className="text-lg">
                                {item.isDirectory 
                                  ? <Folder size={18} className="text-slate-500" /> 
                                  : item.type?.startsWith('video/') 
                                    ? <Film size={18} className="text-purple-500" />
                                    : <FileText size={18} className="text-slate-400" />
                                }
                              </span>
                              <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                              {item.isDirectory ? (
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                  <Folder size={12} /> 目录
                                </span>
                              ) : (
                                <>
                                  {item.size && <span className="text-xs text-slate-400">{(item.size / 1024 / 1024).toFixed(1)} MB</span>}
                                  {item.type?.startsWith('video/') && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                      <CheckCircle size={10} /> 可选
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* 当前路径 */}
                    <div className="px-4 py-2 bg-slate-50 border-t text-xs text-slate-500 flex items-center gap-2">
                      <Folder size={12} />
                      <span className="font-mono">{vfsBrowserPath}</span>
                    </div>
                  </div>
                </div>
              )}

            {/* 上传本地文件 */}
            {sourceType === 'upload' && (
              <div 
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <ArrowUpToLine size={32} className="text-indigo-600" />
                </div>
                {file ? (
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                      <CheckCircle size={12} />
                      已选择
                    </span>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-semibold text-slate-700">上传本地文件</p>
                    <p className="text-xs text-slate-500 mt-1">支持 MP4、MOV 等格式，最大 500MB</p>
                  </div>
                )}
              </div>
            )}

            {/* 表单 */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">数字人名称</label>
                <input
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder="例如：我的专属数字人"
                  className="input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">训练类型</label>
                  <select
                    value={trainType}
                    onChange={(e) => setTrainType(e.target.value)}
                    className="input w-full"
                  >
                    <option value="both">声音 + 形象</option>
                    <option value="voice">仅声音</option>
                    <option value="image">仅形象</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">语言</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="input w-full"
                  >
                    <option value="cn">中文</option>
                    <option value="en">英文</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 上传进度 */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>上传中...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                取消
              </button>
              <button 
                onClick={handleSubmit} 
                disabled={uploading || (!file && !selectedVfsPath) || !personName.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {uploading ? '上传中...' : '开始训练'}
              </button>
            </div>
          </div>
        )}

        {/* 步骤 2: 训练中 */}
        {step === 'training' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
            <h4 className="text-lg font-semibold text-slate-800 mb-2">{trainingStage}</h4>
            <p className="text-sm text-slate-500 mb-4">任务 ID: {taskId}</p>
            <div className="max-w-md mx-auto">
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>训练进度</span>
                <span>{trainingProgress}%</span>
              </div>
              <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all" style={{ width: `${trainingProgress}%` }}></div>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-4">训练可能需要 10-30 分钟，请耐心等待</p>
          </div>
        )}

        {/* 步骤 3: 完成 */}
        {step === 'done' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={40} className="text-green-600" />
            </div>
            <h4 className="text-lg font-semibold text-slate-800 mb-2">训练完成！</h4>
            <p className="text-sm text-slate-500 mb-6">数字人 "{personName}" 已创建成功</p>
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// --- 现代化的 Badge 组件 ---
function StatusBadge({ status }) {
  const statusMap = {
    10: { label: '训练中', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    30: { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200' },
    40: { label: '失败', color: 'bg-red-100 text-red-700 border-red-200' },
    0: { label: '定制中', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    1: { label: '制作中', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    2: { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200' },
    4: { label: '失败', color: 'bg-red-100 text-red-700 border-red-200' },
  }
  const { label, color } = statusMap[status] || { label: '未知', color: 'bg-slate-100 text-slate-600 border-slate-200' }
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${color}`}>{label}</span>
}

// --- 现代化的数字人卡片 ---
function DigitalPersonCard({ person, isCustom, onSelect, onCreateVideo, onDelete, onRefresh, onPreview }) {
  const [loading, setLoading] = useState(false)
  const detail = person
  const [showPreview, setShowPreview] = useState(false)
  
  // 调试：检查 onCreateVideo prop
  useEffect(() => {
    console.log('[DigitalPersonCard] onCreateVideo prop:', typeof onCreateVideo, onCreateVideo ? '有值' : '无')
  }, [onCreateVideo])

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!confirm(`确定要删除 "${person.name}" 吗？`)) return
    try { 
      await deleteCustomPerson(person.id)
      onDelete && onDelete(person.id) 
    } catch (err) { 
      alert(`删除失败：${err.message}`) 
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-300 group flex flex-col">
        {/* 卡片图片区域 - 点击跳转到创作平台 */}
        <div 
          className="relative aspect-[4/5] bg-slate-100 overflow-hidden cursor-pointer" 
          onClick={() => {
            console.log('[DigitalPersonCard] 点击卡片，触发 onCreateVideo')
            onCreateVideo && onCreateVideo(person)
          }}
          title="点击使用此数字人创作视频"
        >
          {person.cover_url ? (
            <img src={person.cover_url} alt={person.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <User size={64} strokeWidth={1.5} />
            </div>
          )}
          
          {/* 悬停时显示操作按钮 - 上下分布 */}
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                console.log('[DigitalPersonCard] 点击创作视频按钮')
                if (onCreateVideo) {
                  onCreateVideo(person)
                }
              }}
              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 shadow-lg"
              title="使用此数字人创作"
            >
              <Sparkles size={12} />
              创作视频
            </button>
            {onPreview && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  console.log('[DigitalPersonCard] 点击预览按钮')
                  setShowPreview(true)
                }}
                className="bg-white/95 hover:bg-white text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 shadow-lg"
                title="预览数字人效果"
              >
                <Play size={12} />
                预览
              </button>
            )}
          </div>
        </div>
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-slate-800 line-clamp-1">{person.name}</h3>
            {isCustom && <StatusBadge status={person.status} />}
          </div>
          <div className="space-y-1 text-xs text-slate-500 mb-4 flex-1">
            <p>ID: {person.id}</p>
            {person.figure_type && <p>形象：{person.figure_type}</p>}
          </div>
          
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            {isCustom && (
              <button onClick={handleDelete} className="flex-1 py-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors border border-slate-200 hover:border-red-100 flex items-center justify-center gap-1" title="删除">
                <Trash2 size={16} strokeWidth={2} />
                删除
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 预览弹窗 */}
      {showPreview && onPreview && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="modal-title text-xl font-bold text-slate-800 flex items-center gap-2">
                <Film size={20} className="text-blue-500" />
                预览：{person.name}
              </h3>
              <button onClick={() => setShowPreview(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            {onPreview(person)}
          </div>
        </div>
      )}
    </>
  )
}



// 主组件
export default function DigitalHumanManager({ apiKey, vfs, onCreateVideo }) {
  const [activeTab, setActiveTab] = useState('common')
  const [commonPersons, setCommonPersons] = useState([])
  const [customPersons, setCustomPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [showTrainDialog, setShowTrainDialog] = useState(false)
  
  // 使用 props 回调
  const handleCreateVideo = (person) => {
    console.log('✅ [DigitalHumanManager] handleCreateVideo 被调用！person:', person)
    // 调用父组件传入的回调
    if (onCreateVideo) {
      console.log('✅ [DigitalHumanManager] 调用 onCreateVideo prop')
      onCreateVideo(person)
    } else {
      console.error('❌ [DigitalHumanManager] onCreateVideo prop 未定义')
    }
  }
  
  // 调试：打印
  console.log('[DigitalHumanManager] 组件渲染')
  
  const isMountedRef = useRef(true)
  const hasLoadedDataRef = useRef(false)

  const loadData = useCallback(async () => {
    if (hasLoadedDataRef.current) return
    hasLoadedDataRef.current = true
    
    setLoading(true)
    try {
      const commonRes = await getCommonPersons()
      if (commonRes.data.code === 0 && isMountedRef.current) {
        const commonData = commonRes.data.data || []
        // 去重：确保每个 id 只出现一次
        const uniqueCommon = Array.from(new Map(commonData.map(p => [p.id, p])).values())
        setCommonPersons(uniqueCommon)
      }
      
      const customRes = await getCustomPersons()
      if (customRes.data.code === 0 && isMountedRef.current) {
        const customData = customRes.data.data || []
        // 去重：确保每个 id 只出现一次
        const uniqueCustom = Array.from(new Map(customData.map(p => [p.id, p])).values())
        setCustomPersons(uniqueCustom)
      }
      
      const voicesRes = await getVoices()
      if (voicesRes.data.code === 0 && isMountedRef.current) {
        setVoices(voicesRes.data.data || [])
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  const handleSync = async () => {
    setLoading(true)
    try {
      const res = await syncCustomPersons()
      if (res.data.code === 0) {
        alert(`已同步 ${res.data.data.synced_count} 个数字人`)
        loadData()
      }
    } catch (err) {
      alert(`同步失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePerson = useCallback((personId) => {
    setCustomPersons(prev => prev.filter(p => p.id !== personId))
  }, [])

  const handleTrainingComplete = useCallback(() => {
    // 训练完成后重新加载自定义数字人列表
    hasLoadedDataRef.current = false
    loadData()
  }, [loadData])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">数字人资产库</h2>
          <p className="text-sm text-slate-500 mt-1">管理、训练和使用您的数字人模型</p>
        </div>
      </div>

      {/* 现代化 Tab 切换 */}
      <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 w-fit">
        {[
          { id: 'common', label: '平台数字人' },
          { id: 'custom', label: '我的定制' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id 
                ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {activeTab === 'custom' && (
          <button
            className="ml-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            onClick={handleSync}
            disabled={loading}
          >
            {loading ? (
            <span className="flex items-center gap-2">
              <RefreshCw size={16} strokeWidth={2} className="animate-spin" />
              刷新中
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <RefreshCw size={16} strokeWidth={2} />
              刷新列表
            </span>
          )}
          </button>
        )}
      </div>

      {/* 列表渲染区 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
        {activeTab === 'common' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {commonPersons.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
                <span className="text-4xl mb-4">📭</span>
                <p>暂无公共数字人</p>
              </div>
            ) : (
              commonPersons.map(p => (
                <DigitalPersonCard 
                  key={p.id} 
                  person={p} 
                  isCustom={false} 
                  onSelect={() => {}}
                  onCreateVideo={handleCreateVideo}
                  onPreview={(person) => <PersonPreview person={person} apiKey={apiKey} />}
                />
              ))
            )}
          </div>
        )}
        
        {activeTab === 'custom' && (
          <div className="space-y-6">
            {/* 新建数字人操作区 - 独立于卡片列表 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  <Sparkles size={24} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-800">训练新数字人</h3>
                  <p className="text-sm text-slate-500 mt-0.5">上传视频素材，创建您的专属数字人形象</p>
                </div>
                <button 
                  onClick={() => setShowTrainDialog(true)}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                >
                  开始训练
                </button>
              </div>
            </div>
            
            {/* 数字人卡片列表 */}
            <div>
              <h4 className="text-sm font-semibold text-slate-600 mb-4 flex items-center gap-2">
                <User size={16} />
                我的数字人
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded-full">{customPersons.length}</span>
              </h4>
              {customPersons.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <span className="text-4xl mb-4">📭</span>
                  <p>暂无自定义数字人</p>
                  <p className="text-xs text-slate-400 mt-1">点击上方"开始训练"创建您的第一个数字人</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {customPersons.map(p => (
                    <DigitalPersonCard 
                      key={p.id} 
                      person={p} 
                      isCustom={true} 
                      onSelect={() => {}}
                      onCreateVideo={handleCreateVideo}
                      onDelete={handleDeletePerson}
                      onPreview={(person) => <PersonPreview person={person} apiKey={apiKey} />}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 训练数字人弹窗 */}
      {showTrainDialog && (
        <TrainPersonDialog 
          onClose={() => setShowTrainDialog(false)}
          onTrainingComplete={handleTrainingComplete}
          apiKey={apiKey}
          vfs={vfs}
        />
      )}
    </div>
  )
}