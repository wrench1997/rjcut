import React, { useState, useCallback } from 'react'
import { Folder, Film, Upload, Trash2, Plus } from 'lucide-react'
import { useTimelineStore, mediaFileRegistry, timelineStore } from '../../stores/timelineStore'

/**
 * 媒体库组件 - 支持从 VFS 导入和本地上传
 */
export default function MediaLibraryVFS({ vfs }) {
  const { mediaFiles, addMediaFile, removeMediaFile } = useTimelineStore()
  const [showVfsBrowser, setShowVfsBrowser] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // 从 VFS 导入文件
  const importFromVFS = async (vfsPath) => {
    setIsProcessing(true)
    try {
      const blob = await vfs.readFileAsBlob(vfsPath)
      const filename = vfsPath.split('/').pop()
      const ext = filename.split('.').pop().toLowerCase()
      
      // 推断类型
      let type = 'video'
      if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) type = 'audio'
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) type = 'image'

      // 将 Blob 封装为 File 对象
      const file = new File([blob], filename, { type: `${type}/${ext}` })

      // 提取媒体信息
      const info = await extractMediaInfo(file, type)
      
      const id = `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      addMediaFile({
        id,
        name: filename,
        duration_ms: info.duration * 1000,
        type,
        thumbnail: info.thumbnail,
        width: info.width,
        height: info.height,
        vfsPath, // 记录原始 VFS 路径
      }, file)

      setShowVfsBrowser(false)
    } catch (e) {
      console.error('[MediaLibraryVFS] 导入失败:', e)
      alert(`导入失败：${e.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // 本地上传文件
  const handleLocalUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      let type = 'video'
      if (['mp3', 'wav', 'aac', 'm4a'].includes(ext)) type = 'audio'
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) type = 'image'

      const info = await extractMediaInfo(file, type)
      
      const id = `media_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      addMediaFile({
        id,
        name: file.name,
        duration_ms: info.duration * 1000,
        type,
        thumbnail: info.thumbnail,
        width: info.width,
        height: info.height,
      }, file)
    } catch (e) {
      console.error('[MediaLibraryVFS] 上传失败:', e)
      alert(`上传失败：${e.message}`)
    } finally {
      setIsProcessing(false)
      e.target.value = '' // 重置 input
    }
  }

  // 添加到时间轴
  const addToTimeline = (mediaId) => {
    const media = mediaFiles[mediaId]
    if (!media) return

    const { addClip } = timelineStore.getState()
    addClip({
      mediaId,
      start_ms: 0, // 默认添加到开头
      duration_ms: media.duration_ms,
      track: media.type === 'audio' ? 'audio_1' : 'video_1',
      type: media.type,
      offset_ms: 0,
    })
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* 标题栏 */}
      <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <span className="font-bold text-slate-200 flex items-center gap-2">
          <Film size={14} />
          项目素材库
        </span>
        <div className="flex gap-1">
          <label 
            className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded text-xs transition cursor-pointer"
            title="本地上传"
          >
            <Upload size={12} />
            <span>上传</span>
            <input 
              type="file" 
              accept="video/*,audio/*,image/*" 
              onChange={handleLocalUpload}
              className="hidden"
              disabled={isProcessing}
            />
          </label>
          <button 
            onClick={() => setShowVfsBrowser(true)}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded text-xs transition"
            disabled={isProcessing}
          >
            <Folder size={12} /> 
            <span>VFS 导入</span>
          </button>
        </div>
      </div>

      {/* 素材列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {isProcessing && (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-2"></div>
            <span className="text-xs">处理中...</span>
          </div>
        )}

        {!isProcessing && Object.values(mediaFiles).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-500">
            <Film size={32} className="mb-2 opacity-50" />
            <p className="text-xs text-center px-4">点击上方按钮导入素材</p>
            <p className="text-xs text-center px-4 mt-1 text-slate-600">支持视频、音频、图片</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Object.values(mediaFiles).map(m => (
              <MediaGridItem 
                key={m.id} 
                media={m} 
                onDelete={() => removeMediaFile(m.id)}
                onAddToTimeline={() => addToTimeline(m.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* VFS 浏览器弹窗 */}
      {showVfsBrowser && (
        <VfsBrowserModal 
          vfs={vfs} 
          onClose={() => setShowVfsBrowser(false)} 
          onSelect={importFromVFS} 
        />
      )}
    </div>
  )
}

/**
 * 素材网格项
 */
function MediaGridItem({ media, onDelete, onAddToTimeline }) {
  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs.toFixed(1)}s`
  }

  return (
    <div className="group bg-slate-800 border border-slate-700 rounded overflow-hidden hover:border-blue-500 transition-all">
      {/* 缩略图 */}
      <div className="aspect-video bg-black flex items-center justify-center relative">
        {media.thumbnail ? (
          <img src={media.thumbnail} className="w-full h-full object-cover" alt={media.name} />
        ) : (
          <Film size={20} className="text-slate-600" />
        )}
        
        {/* 时长标签 */}
        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
          {formatDuration(media.duration_ms)}
        </div>

        {/* 类型标签 */}
        <div className="absolute top-1 left-1 bg-slate-900/80 text-white text-[9px] px-1 rounded uppercase">
          {media.type === 'video' ? '🎬' : media.type === 'audio' ? '🎵' : '🖼️'}
        </div>

        {/* 悬停操作 */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button 
            onClick={onAddToTimeline}
            className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded-full"
            title="添加到时间轴"
          >
            <Plus size={14} />
          </button>
          <button 
            onClick={onDelete}
            className="bg-red-600 hover:bg-red-500 text-white p-1.5 rounded-full"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 文件名 */}
      <div className="p-1.5">
        <div className="text-xs text-slate-300 truncate" title={media.name}>
          {media.name}
        </div>
      </div>
    </div>
  )
}

/**
 * VFS 浏览器弹窗
 */
function VfsBrowserModal({ vfs, onClose, onSelect }) {
  const [currentPath, setCurrentPath] = useState('/')
  const [entries, setEntries] = useState([])

  React.useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath])

  const loadDirectory = async (path) => {
    try {
      const result = vfs.ls(path)
      const files = result.filter(entry => {
        const ext = entry.name.split('.').pop().toLowerCase()
        return ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'aac', 'png', 'jpg', 'jpeg'].includes(ext)
      })
      setEntries(files)
    } catch (e) {
      console.error('[VfsBrowserModal] 加载目录失败:', e)
      setEntries([])
    }
  }

  const handleSelect = (entry) => {
    if (entry.type === 'dir') {
      const newPath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`
      setCurrentPath(newPath)
    } else {
      const filePath = currentPath === '/' ? `/${entry.name}` : `${currentPath}/${entry.name}`
      onSelect(filePath)
    }
  }

  const goUp = () => {
    if (currentPath !== '/') {
      const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
      setCurrentPath(parent)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="p-3 border-b border-slate-700 flex justify-between items-center">
          <h3 className="font-bold text-slate-200">从 VFS 选择素材</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <Trash2 size={16} className="rotate-45" />
          </button>
        </div>

        {/* 路径导航 */}
        <div className="p-2 border-b border-slate-700 flex items-center gap-2 bg-slate-800/50">
          <button 
            onClick={goUp}
            disabled={currentPath === '/'}
            className="text-slate-400 hover:text-white disabled:opacity-30"
          >
            📁 上级
          </button>
          <span className="text-xs text-slate-400 flex-1 truncate">{currentPath}</span>
        </div>

        {/* 文件列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              当前目录没有支持的媒体文件
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map(entry => (
                <div
                  key={entry.path}
                  onClick={() => handleSelect(entry)}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition ${
                    entry.type === 'dir' 
                      ? 'hover:bg-slate-700 text-slate-300' 
                      : 'hover:bg-blue-600/20 text-slate-200'
                  }`}
                >
                  {entry.type === 'dir' ? (
                    <Folder size={16} className="text-yellow-500" />
                  ) : (
                    <Film size={16} className="text-blue-400" />
                  )}
                  <span className="text-sm flex-1 truncate">{entry.name}</span>
                  {entry.type === 'file' && (
                    <span className="text-xs text-slate-500">
                      {entry.size ? Math.round(entry.size / 1024) + ' KB' : ''}
                    </span>
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

/**
 * 提取媒体信息（时长、缩略图等）
 */
async function extractMediaInfo(file, type) {
  const info = {
    duration: 0,
    thumbnail: null,
    width: 0,
    height: 0,
  }

  if (type === 'video') {
    try {
      // 使用 video element 获取时长
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      
      const loaded = new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = reject
      })
      
      video.src = URL.createObjectURL(file)
      await loaded
      
      info.duration = video.duration
      info.width = video.videoWidth
      info.height = video.videoHeight
      
      // 生成缩略图（第 1 秒或中间帧）
      const thumbnailTime = Math.min(1, video.duration / 2)
      video.currentTime = thumbnailTime
      
      await new Promise(resolve => {
        video.onseeked = resolve
      })
      
      const canvas = document.createElement('canvas')
      canvas.width = 160
      canvas.height = 90
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, 160, 90)
      info.thumbnail = canvas.toDataURL('image/jpeg', 0.7)
      
      URL.revokeObjectURL(video.src)
    } catch (e) {
      console.error('[extractMediaInfo] 视频信息提取失败:', e)
    }
  } else if (type === 'audio') {
    try {
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      
      const loaded = new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => resolve()
        audio.onerror = reject
      })
      
      audio.src = URL.createObjectURL(file)
      await loaded
      
      info.duration = audio.duration
      URL.revokeObjectURL(audio.src)
    } catch (e) {
      console.error('[extractMediaInfo] 音频信息提取失败:', e)
    }
  } else if (type === 'image') {
    try {
      const img = new Image()
      const loaded = new Promise((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
      })
      
      img.src = URL.createObjectURL(file)
      await loaded
      
      info.width = img.width
      info.height = img.height
      info.thumbnail = img.src
      info.duration = 5 // 图片默认 5 秒
    } catch (e) {
      console.error('[extractMediaInfo] 图片信息提取失败:', e)
    }
  }

  return info
}