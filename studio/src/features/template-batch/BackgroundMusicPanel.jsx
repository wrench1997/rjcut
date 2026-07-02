/**
 * 模板混剪 - 背景音乐选择面板
 * 支持从 VFS 音频库选择或导入本地音频文件
 */
import { useState, useRef, useEffect } from 'react'
import { Music, Upload, Play, Pause, Trash2, Volume2, FileAudio } from 'lucide-react'

const ACCEPTED_AUDIO_TYPES = [
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
]

const ACCEPTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac']

export default function BackgroundMusicPanel({
  vfs,
  value,
  onChange,
  className,
}) {
  const [showVfsBrowser, setShowVfsBrowser] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioCurrentTime, setAudioCurrentTime] = useState(0)
  const audioRef = useRef(null)
  const fileInputRef = useRef(null)

  const hasMusic = value?.enabled && value?.bgmPath

  // 清理音频
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  // 当选择的音频变化时，重新加载
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
    setAudioDuration(0)
    setAudioCurrentTime(0)
  }, [value?.bgmPath])

  const handlePlayToggle = async () => {
    if (!value?.bgmPath || !vfs) return

    if (!audioRef.current) {
      try {
        const blob = await vfs.readFileAsBlob(value.bgmPath)
        const url = URL.createObjectURL(blob)
        audioRef.current = new Audio(url)
        
        audioRef.current.addEventListener('loadedmetadata', () => {
          setAudioDuration(audioRef.current.duration)
        })
        
        audioRef.current.addEventListener('timeupdate', () => {
          setAudioCurrentTime(audioRef.current.currentTime)
        })
        
        audioRef.current.addEventListener('ended', () => {
          setIsPlaying(false)
          setAudioCurrentTime(0)
        })
      } catch (e) {
        console.error('[BackgroundMusicPanel] 加载音频失败:', e)
        return
      }
    }

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.volume = value.bgmVolume || 0.28
      audioRef.current.play().catch((e) => {
        console.error('[BackgroundMusicPanel] 播放失败:', e)
        setIsPlaying(false)
      })
      setIsPlaying(true)
    }
  }

  const handleVolumeChange = (newVolume) => {
    onChange({
      ...value,
      enabled: true,
      bgmVolume: newVolume,
    })
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const handleSelectFromVfs = (file) => {
    onChange({
      enabled: true,
      bgmPath: file.path,
      bgmName: file.name,
      bgmVolume: 0.28,
      originalVolume: 1.0,
      startTime: 0,
      loop: true,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.8,
    })
    setShowVfsBrowser(false)
  }

  const handleImportLocal = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isValidType = ACCEPTED_AUDIO_TYPES.includes(file.type) ||
      ACCEPTED_AUDIO_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!isValidType) {
      alert('不支持的音频格式，请选择 MP3、WAV、M4A 或 AAC 文件')
      return
    }

    // 将本地文件保存到 VFS
    const reader = new FileReader()
    reader.onload = async (event) => {
      const arrayBuffer = event.target.result
      const uint8Array = new Uint8Array(arrayBuffer)
      
      const vfsPath = `/音频/${file.name}`
      try {
        await vfs.mkdir('/音频', true)
        await vfs.writeFile(vfsPath, uint8Array)
        
        onChange({
          enabled: true,
          bgmPath: vfsPath,
          bgmName: file.name,
          bgmVolume: 0.28,
          originalVolume: 1.0,
          startTime: 0,
          loop: true,
          fadeInDuration: 0.5,
          fadeOutDuration: 0.8,
        })
      } catch (err) {
        console.error('[BackgroundMusicPanel] 保存音频到 VFS 失败:', err)
        alert('保存音频失败：' + err.message)
      }
    }
    reader.onerror = () => {
      alert('读取文件失败')
    }
    reader.readAsArrayBuffer(file)
    
    // 重置 input
    e.target.value = ''
  }

  const handleRemove = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
    onChange({
      enabled: false,
      bgmPath: '',
      bgmName: '',
      bgmVolume: 0.28,
      originalVolume: 1.0,
      startTime: 0,
      loop: true,
      fadeInDuration: 0.5,
      fadeOutDuration: 0.8,
    })
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-semibold text-slate-700">背景音乐</span>
        </div>
        {hasMusic && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            移除
          </button>
        )}
      </div>

      {!hasMusic ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowVfsBrowser(true)}
            className="flex-1 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <FileAudio size={16} />
            从素材库选择
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Upload size={16} />
            导入本地音频
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_AUDIO_EXTENSIONS.join(',')}
            onChange={handleImportLocal}
            className="hidden"
          />
        </div>
      ) : (
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 space-y-4">
          {/* 音频信息 */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Music className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {value.bgmName || '未命名'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {value.bgmPath}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePlayToggle}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isPlaying
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
              }`}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
          </div>

          {/* 播放进度 */}
          {audioDuration > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-10">
                {formatTime(audioCurrentTime)}
              </span>
              <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(audioCurrentTime / audioDuration) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-10 text-right">
                {formatTime(audioDuration)}
              </span>
            </div>
          )}

          {/* 音量控制 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                背景音乐音量
              </label>
              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {Math.round((value.bgmVolume || 0.28) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={value.bgmVolume || 0.28}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* 原声音量 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700">
                原声音量
              </label>
              <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {Math.round((value.originalVolume || 1.0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={value.originalVolume || 1.0}
              onChange={(e) => onChange({ ...value, originalVolume: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* 高级选项 */}
          <details className="mt-3">
            <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800">
              高级音频设置
            </summary>
            <div className="mt-3 space-y-3 pl-2 border-l-2 border-slate-200">
              {/* 开始时间 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    开始时间
                  </label>
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    {value.startTime || 0}s
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="0.5"
                  value={value.startTime || 0}
                  onChange={(e) => onChange({ ...value, startTime: parseFloat(e.target.value) })}
                  className="w-full accent-slate-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* 淡入时长 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    淡入时长
                  </label>
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    {value.fadeInDuration || 0.5}s
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.1"
                  value={value.fadeInDuration || 0.5}
                  onChange={(e) => onChange({ ...value, fadeInDuration: parseFloat(e.target.value) })}
                  className="w-full accent-slate-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* 淡出时长 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-700">
                    淡出时长
                  </label>
                  <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    {value.fadeOutDuration || 0.8}s
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="0.1"
                  value={value.fadeOutDuration || 0.8}
                  onChange={(e) => onChange({ ...value, fadeOutDuration: parseFloat(e.target.value) })}
                  className="w-full accent-slate-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* 循环开关 */}
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-700">
                  循环播放
                </label>
                <input
                  type="checkbox"
                  checked={value.loop !== false}
                  onChange={(e) => onChange({ ...value, loop: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          </details>
        </div>
      )}

      {/* VFS 浏览器弹窗 */}
      {showVfsBrowser && vfs && (
        <AudioVfsBrowser
          vfs={vfs}
          onSelect={handleSelectFromVfs}
          onClose={() => setShowVfsBrowser(false)}
        />
      )}
    </div>
  )
}

/**
 * VFS 音频文件浏览器
 */
function AudioVfsBrowser({ vfs, onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState('/音频')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const loadDirectory = async (dirPath) => {
    if (!vfs) return
    setLoading(true)
    try {
      const result = await vfs.listDirectory(dirPath)
      setItems(Array.isArray(result) ? result : [])
    } catch (e) {
      console.error('[AudioVfsBrowser] 加载失败:', e)
      setItems([])
    } finally {
      setLoading(false)
    }
    setCurrentPath(dirPath)
  }

  useEffect(() => {
    loadDirectory(currentPath)
  }, [])

  const parentPath = currentPath === '/' ? '/' : currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'

  const isAudioFile = (item) => {
    if (item.isDirectory) return false
    return ACCEPTED_AUDIO_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">选择音频文件</h3>
          <button className="p-2 hover:bg-slate-100 rounded-lg" onClick={onClose}>
            <Trash2 size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
            onClick={() => loadDirectory('/音频')}
          >
            音频库
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
            onClick={() => loadDirectory(parentPath)}
            disabled={currentPath === '/'}
          >
            上一层
          </button>
          <span className="text-xs text-slate-500 ml-auto">当前：{currentPath}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-slate-400">加载中...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              {currentPath === '/音频' ? '暂无音频文件' : '空目录'}
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.path}
                  className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg"
                  onDoubleClick={() => item.isDirectory && loadDirectory(item.path)}
                >
                  <span className="text-lg">{item.isDirectory ? '📁' : '🎵'}</span>
                  <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                  {!item.isDirectory && item.size && (
                    <span className="text-xs text-slate-400">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                  )}
                  {!item.isDirectory && isAudioFile(item) && (
                    <button
                      className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(item)
                      }}
                    >
                      选择
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}