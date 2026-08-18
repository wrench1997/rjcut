import { useState, useEffect, useCallback, useRef } from 'react'
import { User, Users, UserPlus, Trash2, RefreshCw, Sparkles, AlertCircle, History, X, Upload, CheckCircle, Folder, Film, Play, HardDrive, ArrowUpToLine, FileText, ChevronRight, ArrowUp, Minus, Maximize2, Volume2, Mic2 } from 'lucide-react'
import FileBrowser from './FileBrowser'
import useStudioStore from '../store/studioStore'
import {
  getCommonPersons,
  getCustomPersons,
  getCustomPersonDetail,
  syncCustomPersons,
  deleteCustomPerson,
  getVoices,
  createDhPersonTask,
  getTaskStatus,
  getDhTaskList,
  getDhVideoUrl,
  getDigitalHumanImageUrl,
  getBaseUrl,
  relayUpload,
  createCustomVoice,
  getCustomVoiceStatus,
} from '../api/api'
import { dedupePersonsForDisplay, isCustomTrainingPerson } from '../features/digital-human-project/personIdentity.js'

function PersonCover({ person, iconSize = 32, alt }) {
  const [failed, setFailed] = useState(false)
  const imageUrl = getDigitalHumanImageUrl(person?.cover_url)

  useEffect(() => {
    setFailed(false)
  }, [imageUrl])

  if (imageUrl && !failed) {
    return (
      <img
        src={imageUrl}
        alt={alt || person?.name || '数字人'}
        className="w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-slate-300" aria-label="暂无数字人封面">
      <User size={iconSize} strokeWidth={1.5} />
    </div>
  )
}

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
          <PersonCover person={person} iconSize={32} />
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
function TrainPersonDialog({ onClose, onTrainingComplete, apiKey, apiBaseUrl, vfs, voices = [] }) {
  const [step, setStep] = useState('upload') // upload, training, done
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [personName, setPersonName] = useState('')
  const [trainType, setTrainType] = useState('both')
  const [language, setLanguage] = useState('cn')
  const [audioSource, setAudioSource] = useState('video')
  const [presetAudioId, setPresetAudioId] = useState('')
  const [uploadedAudioId, setUploadedAudioId] = useState('')
  const [audioFile, setAudioFile] = useState(null)
  const [audioUploading, setAudioUploading] = useState(false)
  const [audioUploadProgress, setAudioUploadProgress] = useState(0)
  const [audioVoiceStatus, setAudioVoiceStatus] = useState('idle')
  const [audioVoiceMessage, setAudioVoiceMessage] = useState('')
  const [taskId, setTaskId] = useState(null)
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [trainingStage, setTrainingStage] = useState('')
  const [error, setError] = useState('')
  const [sourceType, setSourceType] = useState('vfs') // 'vfs' = 从文件管理选择，'upload' = 上传文件
  const [selectedVfsPath, setSelectedVfsPath] = useState('')
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('')
  const [videoPreviewLoading, setVideoPreviewLoading] = useState(false)
  const [videoPreviewError, setVideoPreviewError] = useState('')
  const [showFileBrowser, setShowFileBrowser] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  
  // VFS 简化文件浏览器状态
  const [vfsBrowserPath, setVfsBrowserPath] = useState('/')
  const [vfsBrowserItems, setVfsBrowserItems] = useState([])
  const [vfsBrowserLoading, setVfsBrowserLoading] = useState(false)
  
  const fileInputRef = useRef(null)
  const audioInputRef = useRef(null)
  const pollTimerRef = useRef(null)
  const voicePollTimerRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      if (voicePollTimerRef.current) clearTimeout(voicePollTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let disposed = false
    let objectUrl = ''

    const loadPreview = async () => {
      setVideoPreviewUrl('')
      setVideoPreviewError('')

      try {
        if (sourceType === 'upload' && file) {
          objectUrl = URL.createObjectURL(file)
        } else if (sourceType === 'vfs' && selectedVfsPath) {
          if (!vfs?.readFileAsBlob) throw new Error('当前文件系统不支持视频预览')
          setVideoPreviewLoading(true)
          const blob = await vfs.readFileAsBlob(selectedVfsPath)
          objectUrl = URL.createObjectURL(blob)
        }

        if (!disposed) setVideoPreviewUrl(objectUrl)
      } catch (err) {
        if (!disposed) setVideoPreviewError(err.message || '视频预览加载失败')
      } finally {
        if (!disposed) setVideoPreviewLoading(false)
      }
    }

    loadPreview()
    return () => {
      disposed = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, selectedVfsPath, sourceType, vfs])
  
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
    const configuredApiBaseUrl = (apiBaseUrl || getBaseUrl()).replace(/\/$/, '')
    
    try {
      setUploading(true)
      setUploadProgress(10)
      
      // 直接走系统设置中的 API 地址，由后端转存 MinIO。
      const formData = new FormData()
      formData.append('file', file, file.name)
      formData.append('purpose', 'dh_person_source')

      const uploadRes = await fetch(`${configuredApiBaseUrl}/v1/uploads/relay`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      })
      
      const uploadData = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok || uploadData.code !== 0 || !uploadData.data?.oss_key) {
        throw new Error(uploadData.message || `文件上传失败（HTTP ${uploadRes.status}）`)
      }
      setUploadProgress(100)
      
      return uploadData.data.oss_key
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

  // 选择声音样本。声音会由后台上传到蝉镜并创建定制声音，不在浏览器暴露蝉镜密钥。
  const handleAudioFileSelect = (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    const extension = selectedFile.name.split('.').pop()?.toLowerCase()
    const allowedExtensions = new Set(['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'wma'])
    if (!selectedFile.type.startsWith('audio/') && !allowedExtensions.has(extension)) {
      setError('请选择 MP3、WAV、M4A、AAC、FLAC、OGG 或 WMA 音频')
      e.target.value = ''
      return
    }
    if (selectedFile.size > 500 * 1024 * 1024) {
      setError('声音文件大小不能超过 500MB')
      e.target.value = ''
      return
    }

    setAudioFile(selectedFile)
    setUploadedAudioId('')
    setAudioVoiceStatus('selected')
    setAudioVoiceMessage('等待上传并检测')
    setAudioUploadProgress(0)
    setError('')
  }

  const waitForCustomVoiceReady = async (audioId) => {
    const normalizedId = String(audioId || '').trim()
    if (!normalizedId) throw new Error('缺少声音 ID')

    setAudioVoiceStatus('processing')
    setAudioVoiceMessage('声音处理中，请稍候…')

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await getCustomVoiceStatus(normalizedId)
      const payload = response?.data?.data?.data || response?.data?.data || {}
      const rawStatus = payload?.status
      const status = String(rawStatus ?? '').toLowerCase()
      const statusCode = Number(rawStatus)
      const progress = Number(payload?.progress)

      if (Number.isFinite(progress)) {
        setAudioUploadProgress(Math.max(60, Math.min(99, progress)))
      }

      const failed = ['failed', 'failure', 'error', 'cancelled'].includes(status) || [40, -1].includes(statusCode)
      if (failed) {
        throw new Error(payload?.err_msg || payload?.message || '声音训练失败')
      }

      const ready =
        progress >= 100 ||
        ['success', 'succeeded', 'completed', 'complete', 'done', 'ready'].includes(status) ||
        [1, 30].includes(statusCode)
      if (ready) {
        setAudioVoiceStatus('ready')
        setAudioVoiceMessage('声音已就绪，可以开始训练')
        setAudioUploadProgress(100)
        return normalizedId
      }

      await new Promise((resolve) => {
        voicePollTimerRef.current = setTimeout(resolve, 3000)
      })
    }

    throw new Error('声音处理超时，请稍后在“我的声音”中重试')
  }

  const createUploadedVoice = async () => {
    if (!audioFile) throw new Error('请先选择声音文件')
    if (audioUploading) throw new Error('声音正在处理中，请稍候')

    try {
      setAudioUploading(true)
      setAudioUploadProgress(10)
      setAudioVoiceStatus('uploading')
      setAudioVoiceMessage('正在上传声音样本…')

      const response = await createCustomVoice({
        file: audioFile,
        name: `${personName.trim() || audioFile.name.replace(/\.[^.]+$/, '')} 的声音`,
        language,
        apiBaseUrl,
        apiKey,
      })
      const audioId = response?.data?.audio_file_id || response?.data?.audio_id
      if (!audioId) throw new Error('后台未返回 audio_file_id')

      setUploadedAudioId(String(audioId))
      setAudioUploadProgress(60)
      return await waitForCustomVoiceReady(String(audioId))
    } catch (err) {
      setAudioVoiceStatus('error')
      setAudioVoiceMessage(err.message || '声音处理失败')
      throw err
    } finally {
      setAudioUploading(false)
    }
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
    if (audioSource === 'preset' && !presetAudioId) {
      setError('请选择公共配音')
      return
    }
    if (audioSource === 'my' && !uploadedAudioId.trim() && !audioFile) {
      setError('请选择声音文件，或填写已有声音 ID')
      return
    }

    try {
      setError('')

      let resolvedAudioId = uploadedAudioId.trim()
      if (audioSource === 'my') {
        if (audioFile && audioVoiceStatus !== 'ready') {
          resolvedAudioId = await createUploadedVoice()
        } else if (resolvedAudioId && audioVoiceStatus !== 'ready') {
          resolvedAudioId = await waitForCustomVoiceReady(resolvedAudioId)
        }
        if (!resolvedAudioId) throw new Error('声音尚未就绪，请先上传并检测')
      }
      
      let ossKey = ''
      
      // 1. 根据来源类型处理文件
      if (sourceType === 'upload' && file) {
        // 上传本地文件
        const uploadedKey = await uploadFile(file)
        ossKey = uploadedKey
      } else if (sourceType === 'vfs' && selectedVfsPath) {
        // VFS 文件先读成 Blob，再与本地文件使用同一条系统 API 上传链路。
        if (!vfs?.readFileAsBlob) throw new Error('当前文件系统不支持读取视频文件')
        const fileBlob = await vfs.readFileAsBlob(selectedVfsPath)
        const filename = selectedVfsPath.split('/').pop() || 'digital-human-source.mp4'
        const uploadPayload = await relayUpload(fileBlob, filename, 'dh_person_source', {
          apiBaseUrl,
          apiKey,
        })
        ossKey = uploadPayload.data.oss_key
      }
      
      // 2. 创建训练任务
      const taskRes = await createDhPersonTask({
        name: personName.trim(),
        source_video_oss_key: ossKey,
        audio_source: audioSource,
        audio_file_id: audioSource === 'my' ? resolvedAudioId : '',
        clone_preset_audio_id: audioSource === 'preset' ? presetAudioId : '',
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
      setIsMinimized(false)
      
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
        if (!mountedRef.current) return
        const task = res.data.data
        const status = String(task.status || '').toLowerCase()
        const progress = Number(task.progress)
        setTrainingProgress(Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0)
        setTrainingStage(task.stage || '训练中')
        
        if (['success', 'succeeded', 'completed', 'done'].includes(status)) {
          setIsMinimized(false)
          setStep('done')
          onTrainingComplete?.(task)
        } else if (['failed', 'cancelled', 'timeout'].includes(status)) {
          setIsMinimized(false)
          setError(task.error || (status === 'cancelled' ? '训练已取消' : '训练失败'))
        } else {
          pollTimerRef.current = setTimeout(poll, 3000)
        }
      } catch (err) {
        console.error('轮询状态失败:', err)
        if (mountedRef.current) pollTimerRef.current = setTimeout(poll, 3000)
      }
    }
    poll()
  }

  if (isMinimized && step === 'training') {
    return (
      <div className="fixed right-6 bottom-6 z-[120] w-80 rounded-xl border border-blue-200 bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800">
              <span className="truncate">数字人训练中</span>
              <span className="shrink-0 text-blue-600">{trainingProgress}%</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{trainingStage || '排队中'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => setIsMinimized(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600" title="展开进度">
              <Maximize2 size={16} />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" title="关闭窗口（任务继续运行）">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${trainingProgress}%` }} />
        </div>
        <p className="mt-2 truncate text-[11px] text-slate-400">任务 ID：{taskId}</p>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="modal-title text-xl font-bold text-slate-800">训练新数字人</h3>
          <div className="flex items-center gap-1">
            {step === 'training' && (
              <button onClick={() => setIsMinimized(true)} className="rounded-lg p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="最小化进度">
                <Minus size={20} />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" title="关闭">
              <X size={20} />
            </button>
          </div>
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
                          onClick={() => loadVfsBrowserDirectory('/')}
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

            {(videoPreviewUrl || videoPreviewLoading || videoPreviewError) && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">视频预览</h4>
                    <p className="mt-0.5 text-xs text-slate-500">可播放画面和视频原声，确认素材无误后再提交训练。</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">可替换</span>
                </div>
                {videoPreviewLoading ? (
                  <div className="flex h-52 items-center justify-center rounded-xl bg-slate-900 text-sm text-slate-300">正在加载视频预览...</div>
                ) : videoPreviewError ? (
                  <div className="flex h-32 items-center justify-center rounded-xl bg-red-50 px-4 text-sm text-red-600">{videoPreviewError}</div>
                ) : (
                  <video
                    key={videoPreviewUrl}
                    src={videoPreviewUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="mx-auto max-h-80 w-full rounded-xl bg-black object-contain shadow-lg"
                  >
                    当前环境不支持视频播放。
                  </video>
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

              <div>
                <div className="mb-2">
                  <label className="block text-sm font-semibold text-slate-800">声音设置</label>
                  <p className="mt-0.5 text-xs text-slate-500">选择训练口音；数字人原声默认使用视频中的完整声音。</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {[
                    { value: 'video', label: '完整视频声音', detail: '默认，保留数字人原声', icon: Film },
                    { value: 'preset', label: '公共声音', detail: '选择并试听公共音色', icon: Volume2 },
                    { value: 'my', label: '我的声音', detail: '使用已上传声音 ID', icon: Mic2 },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setAudioSource(option.value)
                        setError('')
                      }}
                      className={`relative min-h-24 rounded-xl border p-3 text-left transition-all ${
                        audioSource === option.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <span className={`absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full border ${audioSource === option.value ? 'border-blue-500' : 'border-slate-300'}`}>
                        {audioSource === option.value && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                      </span>
                      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm">
                        <option.icon size={18} />
                      </span>
                      <span className="block pr-5 text-sm font-medium">{option.label}</span>
                      <span className="mt-0.5 block text-xs opacity-75">{option.detail}</span>
                    </button>
                  ))}
                </div>
              </div>

              {audioSource === 'preset' && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">公共声音试听</label>
                  <select
                    value={presetAudioId}
                    onChange={(e) => setPresetAudioId(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">请选择公共声音</option>
                    {voices.map((voice) => (
                      <option key={voice.id} value={voice.id}>{voice.name || voice.id}</option>
                    ))}
                  </select>
                  {presetAudioId && (() => {
                    const selectedVoice = voices.find((voice) => String(voice.id) === String(presetAudioId))
                    const auditionUrl = selectedVoice?.audition || selectedVoice?.audio_url || selectedVoice?.preview_url || selectedVoice?.url
                    return (
                      <div className="mt-3 rounded-xl bg-white p-3 shadow-sm">
                        <div className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600"><Play size={15} fill="currentColor" /></span>
                          <span className="font-medium">{selectedVoice?.name || presetAudioId}</span>
                        </div>
                        {auditionUrl ? (
                          <audio key={auditionUrl} src={auditionUrl} controls preload="none" className="h-10 w-full">
                            当前环境不支持声音播放。
                          </audio>
                        ) : (
                          <p className="text-xs text-amber-600">该声音没有返回可试听地址。</p>
                        )}
                      </div>
                    )
                  })()}
                  {voices.length === 0 && <p className="mt-1 text-xs text-amber-600">公共声音列表暂不可用，请稍后重试。</p>}
                </div>
              )}

              {audioSource === 'my' && (
                <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">上传我的声音</label>
                      <p className="mt-0.5 text-xs text-slate-500">支持 MP3、WAV、M4A 等，后台会自动创建并检测声音。</p>
                    </div>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.wma"
                      onChange={handleAudioFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      disabled={audioUploading}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      <Upload size={15} />
                      {audioFile ? '重新选择' : '选择声音文件'}
                    </button>
                  </div>

                  {audioFile && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white bg-white px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-slate-700">{audioFile.name}</span>
                      <button
                        type="button"
                        onClick={() => createUploadedVoice().catch((err) => setError(err.message || '声音处理失败'))}
                        disabled={audioUploading || audioVoiceStatus === 'ready'}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        <Mic2 size={13} />
                        {audioVoiceStatus === 'ready' ? '声音已就绪' : audioUploading ? '处理中…' : '上传并检测'}
                      </button>
                    </div>
                  )}

                  {audioVoiceMessage && (
                    <p className={`mt-2 text-xs ${audioVoiceStatus === 'error' ? 'text-red-600' : audioVoiceStatus === 'ready' ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {audioVoiceMessage}
                    </p>
                  )}

                  <div className="mt-3 border-t border-blue-100 pt-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">已有声音 ID（兼容旧流程）</label>
                    <input
                      type="text"
                      value={uploadedAudioId}
                      onChange={(e) => {
                        setUploadedAudioId(e.target.value)
                        setAudioVoiceStatus(e.target.value.trim() ? 'manual' : 'idle')
                        setAudioVoiceMessage(e.target.value.trim() ? '提交前会自动校验声音是否就绪' : '')
                      }}
                      placeholder="上传后自动回填，也可填写已有 audio_file_id"
                      className="input w-full"
                    />
                  </div>
                </div>
              )}
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
            {audioUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>声音处理中...</span>
                  <span>{audioUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-violet-600 transition-all" style={{ width: `${audioUploadProgress}%` }} />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                取消
              </button>
              <button 
                onClick={handleSubmit} 
                disabled={uploading || audioUploading || (!file && !selectedVfsPath) || !personName.trim() || (audioSource === 'my' && !uploadedAudioId.trim() && !audioFile)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                {audioUploading ? '处理声音...' : uploading ? '上传中...' : '开始训练'}
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
          <div className="w-full h-full transition-transform duration-500 group-hover:scale-105">
            <PersonCover person={person} iconSize={64} />
          </div>
          
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
const getPersonList = (response) => {
  const payload = response?.data?.data
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.list)) return payload.list
  if (Array.isArray(payload?.items)) return payload.items
  if (Array.isArray(payload?.persons)) return payload.persons
  return []
}

const getListErrorMessage = (reason, fallback) => {
  const message =
    reason?.responseData?.detail?.message ||
    reason?.responseData?.detail ||
    reason?.responseData?.message ||
    reason?.message
  const code = reason?.code ? `（错误码：${reason.code}）` : ''
  return `${message || fallback}${code}`
}

export default function DigitalHumanManager({ apiKey, apiBaseUrl, vfs, onCreateVideo }) {
  const [activeTab, setActiveTab] = useState('common')
  const [commonPersons, setCommonPersons] = useState([])
  const [customPersons, setCustomPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadErrors, setLoadErrors] = useState({ common: '', custom: '', voices: '' })
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
    setLoadErrors({ common: '', custom: '', voices: '' })

    const results = await Promise.allSettled([
      getCommonPersons(),
      getCustomPersons(),
      getVoices(),
    ])

    if (!isMountedRef.current) return

    const nextErrors = { common: '', custom: '', voices: '' }
    const [commonResult, customResult, voicesResult] = results

    if (commonResult.status === 'fulfilled' && commonResult.value?.data?.code === 0) {
      setCommonPersons(dedupePersonsForDisplay(
        getPersonList(commonResult.value).filter((person) => !isCustomTrainingPerson(person)),
        'common',
      ))
    } else {
      const reason = commonResult.status === 'rejected' ? commonResult.reason : commonResult.value?.data
      nextErrors.common = getListErrorMessage(reason, '公共数字人加载失败')
      console.error('[DigitalHumanManager] 公共数字人加载失败:', reason)
    }

    if (customResult.status === 'fulfilled' && customResult.value?.data?.code === 0) {
      setCustomPersons(dedupePersonsForDisplay(getPersonList(customResult.value), 'custom'))
    } else {
      const reason = customResult.status === 'rejected' ? customResult.reason : customResult.value?.data
      nextErrors.custom = getListErrorMessage(reason, '自定义数字人加载失败')
      console.error('[DigitalHumanManager] 自定义数字人加载失败:', reason)
    }

    if (voicesResult.status === 'fulfilled' && voicesResult.value?.data?.code === 0) {
      setVoices(getPersonList(voicesResult.value))
    } else {
      const reason = voicesResult.status === 'rejected' ? voicesResult.reason : voicesResult.value?.data
      nextErrors.voices = getListErrorMessage(reason, '声音列表加载失败')
      console.error('[DigitalHumanManager] 声音列表加载失败:', reason)
    }

    setLoadErrors(nextErrors)
    setLoading(false)
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    loadData()
    return () => {
      isMountedRef.current = false
    }
  }, [loadData])

  const reloadData = useCallback(() => {
    hasLoadedDataRef.current = false
    return loadData()
  }, [loadData])

  const handleSync = async () => {
    setLoading(true)
    try {
      const res = await syncCustomPersons()
      if (res.data.code === 0) {
        alert(`已同步 ${res.data.data.synced_count} 个数字人`)
        await reloadData()
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
    reloadData()
  }, [reloadData])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">数字人资产库</h2>
          <p className="text-sm text-slate-500 mt-1">管理、训练和使用您的数字人模型</p>
        </div>
      </div>

      {loadErrors.voices && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={18} />
          <span>声音列表暂时不可用：{loadErrors.voices}</span>
          <button
            className="ml-auto rounded-md px-3 py-1 font-medium text-amber-900 hover:bg-amber-100"
            onClick={reloadData}
            disabled={loading}
          >
            重试
          </button>
        </div>
      )}

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
            {loadErrors.common ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-red-600">
                <AlertCircle size={36} className="mb-4" />
                <p className="font-medium">公共数字人加载失败</p>
                <p className="mt-2 max-w-xl text-center text-sm text-slate-500">{loadErrors.common}</p>
                <button
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={reloadData}
                  disabled={loading}
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  {loading ? '重试中' : '重新加载'}
                </button>
              </div>
            ) : commonPersons.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
                <Users size={42} strokeWidth={1.5} className="mb-4 text-slate-300" aria-hidden="true" />
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
              {loadErrors.custom ? (
                <div className="flex flex-col items-center justify-center py-12 text-red-600 bg-red-50 rounded-xl border border-red-100">
                  <AlertCircle size={32} className="mb-3" />
                  <p className="font-medium">自定义数字人加载失败</p>
                  <p className="mt-2 max-w-xl text-center text-sm text-slate-500">{loadErrors.custom}</p>
                  <button
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    onClick={reloadData}
                    disabled={loading}
                  >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    {loading ? '重试中' : '重新加载'}
                  </button>
                </div>
              ) : customPersons.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <UserPlus size={42} strokeWidth={1.5} className="mb-4 text-slate-300" aria-hidden="true" />
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
          apiBaseUrl={apiBaseUrl}
          vfs={vfs}
          voices={voices}
        />
      )}
    </div>
  )
}
