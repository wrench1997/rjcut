import React, { useState, useCallback, useEffect } from 'react'
import { ChevronLeft, Film, Folder, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useTimelineStore, mediaFileRegistry, timelineStore } from '../../stores/timelineStore'

const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v',
  'mp3', 'wav', 'aac', 'm4a',
  'png', 'jpg', 'jpeg', 'gif', 'webp',
])

function getExtension(name) {
  return String(name || '').split('.').pop()?.toLowerCase() || ''
}

function isDirectoryEntry(entry) {
  return Boolean(entry?.isDirectory || entry?.type?.includes?.('directory'))
}

function isMediaEntry(entry) {
  if (!entry || isDirectoryEntry(entry)) return false
  if (!entry.isFile && !(entry.type && entry.type.includes('file'))) return false
  return SUPPORTED_MEDIA_EXTENSIONS.has(getExtension(entry.name))
}

function mediaTypeFromEntry(entry) {
  const extension = getExtension(entry?.name)
  if (['mp3', 'wav', 'aac', 'm4a'].includes(extension)) return 'audio'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) return 'image'
  return 'video'
}

function mediaMimeType(entry, type) {
  const extension = getExtension(entry?.name)
  if (type === 'audio') return `audio/${extension === 'm4a' ? 'mp4' : extension}`
  if (type === 'image') return `image/${extension === 'jpg' ? 'jpeg' : extension}`
  return `video/${extension === 'mov' ? 'quicktime' : extension || 'mp4'}`
}

function parentVfsPath(path) {
  const normalized = String(path || '/').replace(/\\+/gu, '/')
  if (normalized === '/') return '/'
  return normalized.slice(0, normalized.lastIndexOf('/')) || '/'
}

/**
 * 媒体库组件 - 支持从 VFS 导入和本地上传
 */
export default function MediaLibraryVFS({ vfs }) {
  const { mediaFiles, clips } = useTimelineStore((snapshot) => ({
    mediaFiles: snapshot.mediaFiles,
    clips: snapshot.clips,
  }))
  const { addMediaFile, removeMediaFile, addClip, seek, play } = timelineStore
  const [showVfsBrowser, setShowVfsBrowser] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [vfsPath, setVfsPath] = useState('/')
  const [vfsEntries, setVfsEntries] = useState([])
  const [isVfsLoading, setIsVfsLoading] = useState(false)
  const [vfsError, setVfsError] = useState('')
  const [vfsRefreshKey, setVfsRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const loadVfsDirectory = async () => {
      if (!vfs?.listDirectory) {
        setVfsEntries([])
        return
      }
      setIsVfsLoading(true)
      setVfsError('')
      try {
        const entries = await vfs.listDirectory(vfsPath)
        if (!cancelled) setVfsEntries(Array.isArray(entries) ? entries : [])
      } catch (error) {
        if (!cancelled) {
          setVfsEntries([])
          setVfsError(error.message || 'VFS 目录读取失败')
        }
      } finally {
        if (!cancelled) setIsVfsLoading(false)
      }
    }
    loadVfsDirectory()
    return () => { cancelled = true }
  }, [vfs, vfsPath, vfsRefreshKey])

  const loadVfsMedia = useCallback(async (entry) => {
    if (!vfs || !entry?.path) throw new Error('VFS 尚未连接')
    const existing = Object.values(mediaFiles).find((media) => media.vfsPath === entry.path)
    if (existing) return existing

    const type = mediaTypeFromEntry(entry)
    const blob = await vfs.readFileAsBlob(entry.path)
    const file = new File([blob], entry.name, { type: mediaMimeType(entry, type) })
    const info = await extractMediaInfo(file, type, entry.path)
    const media = {
      id: `vfs_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name: entry.name,
      duration_ms: info.duration * 1000,
      type,
      thumbnail: info.thumbnail,
      width: info.width,
      height: info.height,
      size: blob.size,
      vfsPath: entry.path,
      source: 'vfs-direct-library',
    }
    addMediaFile(media, file)
    return media
  }, [addMediaFile, mediaFiles, vfs])

  const addVfsEntryToTimeline = async (entry) => {
    if (!isMediaEntry(entry)) return
    setIsProcessing(true)
    try {
      const media = await loadVfsMedia(entry)
      addToTimeline(media.id, media)
    } catch (error) {
      console.error('[MediaLibraryVFS] VFS 素材载入失败:', error)
      alert(`VFS 素材载入失败：${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  // 从 VFS 导入目录（批量导入媒体文件）
  const importFromVFS = async (dirPath) => {
    setIsProcessing(true)
    try {
      console.log('[MediaLibraryVFS] 开始导入目录:', dirPath)
      
      // 列出目录内容
      const entries = await vfs.listDirectory(dirPath)
      console.log('[MediaLibraryVFS] 目录内容:', entries)
      
      // 过滤媒体文件
      const mediaEntries = entries.filter(isMediaEntry)
      
      if (mediaEntries.length === 0) {
        alert('当前目录没有支持的媒体文件')
        return
      }
      
      console.log('[MediaLibraryVFS] 找到', mediaEntries.length, '个媒体文件')
      
      // 批量导入
      for (const entry of mediaEntries) {
        try {
          await loadVfsMedia(entry)
          console.log('[MediaLibraryVFS] 导入成功:', entry.name)
        } catch (e) {
          console.error('[MediaLibraryVFS] 单个文件导入失败:', entry.name, e)
        }
      }
      
      alert(`成功导入 ${mediaEntries.length} 个文件`)
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
  const addToTimeline = (mediaId, mediaOverride = null) => {
    const media = mediaOverride || mediaFiles[mediaId]
    if (!media) return

    addClip({
      mediaId,
      start_ms: 0,
      duration_ms: media.duration_ms,
      track: media.type === 'audio' ? 'audio_1' : 'video_1',
      type: media.type,
      offset_ms: 0,
    })
  }

  // 预览视频 - 直接添加到时间轴并在预览窗口播放
  const handlePreview = (media) => {
    console.log('[MediaLibraryVFS] 预览请求:', media)
    if (media.type !== 'video') {
      console.warn('[MediaLibraryVFS] 非视频类型，无法预览:', media.type)
      return
    }

    // 检查是否已经在时间轴上
    const existingClip = clips.find(c => c.mediaId === media.id)
    
    if (existingClip) {
      // 已存在，直接跳转到该片段
      console.log('[MediaLibraryVFS] 跳转到已有片段:', existingClip.id)
      seek(existingClip.start_ms)
      play()
    } else {
      // 不存在，添加到时间轴视频轨道开头
      console.log('[MediaLibraryVFS] 添加新片段到时间轴')
      addClip({
        mediaId: media.id,
        start_ms: 0,
        duration_ms: media.duration_ms,
        track: 'video_1',
        type: media.type,
        offset_ms: 0,
      })
      
      // 跳转到开头并播放
      setTimeout(() => {
        seek(0)
        play()
      }, 100)
    }
  }

  const vfsDirectories = vfsEntries.filter(isDirectoryEntry)
  const directMediaEntries = vfsEntries.filter(isMediaEntry)

  return (
    <div className="flex flex-col h-full min-h-0 text-sm">
      {/* 标题栏 */}
      <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-white">
        <span className="font-bold text-slate-700 flex items-center gap-2">
          <Film size={14} />
          素材库
        </span>
        <div className="flex gap-1">
          <label 
            className="flex items-center gap-1 bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-xs transition cursor-pointer"
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
            <span>目录导入</span>
          </button>
        </div>
      </div>

      {/* 素材列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-3 custom-scrollbar">
        {isProcessing && (
          <div className="flex items-center justify-center py-4 text-slate-400">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500 mr-2"></div>
            <span className="text-xs">处理中...</span>
          </div>
        )}

        {vfs && (
          <section className="rounded-lg border border-blue-100 bg-gradient-to-b from-blue-50/70 to-white overflow-hidden">
            <div className="px-2.5 py-2 border-b border-blue-100">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Folder size={13} className="text-blue-500" />
                  VFS 素材库
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 已直连
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  onClick={() => setVfsPath(parentVfsPath(vfsPath))}
                  disabled={vfsPath === '/'}
                  className="grid h-6 w-6 place-items-center rounded-md border border-blue-100 text-slate-500 hover:bg-white hover:text-blue-600 disabled:opacity-30"
                  title="返回上级目录"
                >
                  <ChevronLeft size={13} />
                </button>
                <span className="min-w-0 flex-1 truncate rounded-md bg-white/80 px-2 py-1 text-[10px] font-mono text-slate-500" title={vfsPath}>
                  {vfsPath}
                </span>
                <button
                  onClick={() => setVfsRefreshKey((value) => value + 1)}
                  className="grid h-6 w-6 place-items-center rounded-md border border-blue-100 text-slate-500 hover:bg-white hover:text-blue-600"
                  title="刷新 VFS 目录"
                >
                  <RefreshCw size={12} />
                </button>
              </div>
            </div>

            {isVfsLoading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-slate-400">
                <RefreshCw size={13} className="animate-spin" /> 正在读取目录…
              </div>
            ) : vfsError ? (
              <div className="px-3 py-5 text-center text-xs text-rose-500">{vfsError}</div>
            ) : vfsDirectories.length === 0 && directMediaEntries.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">当前 VFS 目录没有可用素材</div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-2">
                {vfsDirectories.map((entry) => (
                  <button
                    key={entry.path}
                    onDoubleClick={() => setVfsPath(entry.path)}
                    onClick={() => setVfsPath(entry.path)}
                    className="flex min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-2 text-left text-[11px] text-slate-600 transition hover:border-blue-300 hover:bg-blue-50"
                    title={`打开 ${entry.path}`}
                  >
                    <Folder size={15} className="flex-shrink-0 text-amber-400" />
                    <span className="truncate">{entry.name}</span>
                  </button>
                ))}
                {directMediaEntries.map((entry) => (
                  <div key={entry.path} className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white">
                    <div className="flex h-16 items-center justify-center bg-slate-50 text-blue-300">
                      <Film size={23} />
                    </div>
                    <div className="p-1.5">
                      <div className="truncate text-[10px] font-medium text-slate-600" title={entry.path}>{entry.name}</div>
                      <button
                        onClick={() => addVfsEntryToTimeline(entry)}
                        disabled={isProcessing}
                        className="mt-1 flex w-full items-center justify-center gap-1 rounded bg-blue-50 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                      >
                        <Plus size={11} /> 加入时间轴
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold tracking-wide text-slate-500">已加入工作区</span>
            <span className="text-[10px] text-slate-400">{Object.values(mediaFiles).length} 个</span>
          </div>
          {Object.values(mediaFiles).length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white py-8 text-slate-400">
              <Film size={28} className="mb-2 opacity-50" />
              <p className="px-4 text-center text-xs">从上方 VFS 素材库选择，或上传本地文件</p>
              <p className="mt-1 px-4 text-center text-[10px] text-slate-400">支持视频、音频、图片</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {Object.values(mediaFiles).map(m => (
                <MediaGridItem
                  key={m.id}
                  media={m}
                  onDelete={() => removeMediaFile(m.id)}
                  onAddToTimeline={() => addToTimeline(m.id)}
                  onPreview={handlePreview}
                />
              ))}
            </div>
          )}
        </section>
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
function MediaGridItem({ media, onDelete, onAddToTimeline, onPreview }) {
  const [thumbnail, setThumbnail] = useState(media.thumbnail || '')

  useEffect(() => {
    let cancelled = false
    if (media.thumbnail) {
      setThumbnail(media.thumbnail)
      return undefined
    }
    if (media.type !== 'video') return undefined
    const blob = mediaFileRegistry.get(media.id)
    if (!blob) return undefined
    extractMediaInfo(blob, 'video', media.vfsPath).then((info) => {
      if (!cancelled && info.thumbnail) setThumbnail(info.thumbnail)
    }).catch((error) => console.warn('[MediaGridItem] 首帧缩略图生成失败:', error))
    return () => { cancelled = true }
  }, [media.id, media.thumbnail, media.type, media.vfsPath])

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs.toFixed(1)}s`
  }

  const handleDoubleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    console.log('[MediaGridItem] 双击:', media.name, '类型:', media.type)
    if (onPreview && media.type === 'video') {
      console.log('[MediaGridItem] 调用预览')
      onPreview(media)
    }
  }

  // 根据类型设置不同的宽高比
  const aspectRatio = media.type === 'image' ? 'aspect-square' : 'aspect-[9/16]'

  return (
    <div 
      className="group bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer"
      onDoubleClick={handleDoubleClick}
    >
      {/* 缩略图 - 视频 9:16，图片正方形 */}
      <div className={`${aspectRatio} bg-slate-50 flex items-center justify-center relative`}>
        {thumbnail ? (
          <img src={thumbnail} className="w-full h-full object-contain" alt={media.name} />
        ) : (
          <Film size={20} className="text-slate-300" />
        )}
        
        {/* 时长标签 */}
        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">
          {formatDuration(media.duration_ms)}
        </div>

        {/* 类型标签 */}
          <div className="absolute top-1 left-1 bg-slate-700/80 text-white text-[9px] px-1 rounded uppercase">
          {media.type === 'video' ? '🎬' : media.type === 'audio' ? '🎵' : '🖼️'}
        </div>

        {media.vfsPath && (
          <div
            className="absolute top-1 right-1 rounded bg-blue-500/90 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white"
            title={media.vfsPath}
          >
            VFS
          </div>
        )}

        {/* 悬停操作 */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button 
            onClick={(e) => {
              e.stopPropagation()
              onAddToTimeline()
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded-full"
            title="添加到时间轴"
          >
            <Plus size={14} />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="bg-red-600 hover:bg-red-500 text-white p-1.5 rounded-full"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
          {media.type === 'video' && (
            <button 
              onClick={(e) => {
                e.stopPropagation()
                onPreview(media)
              }}
              className="bg-green-600 hover:bg-green-500 text-white p-1.5 rounded-full"
              title="预览"
            >
              <Film size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 文件名 */}
      <div className="p-1.5">
        <div className="text-xs text-slate-600 truncate" title={media.name}>
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
  const [pathHistory, setPathHistory] = useState([])

  React.useEffect(() => {
    loadDirectory(currentPath)
  }, [currentPath])

  const loadDirectory = async (path) => {
    try {
      // VFSProxy 使用 listDirectory API，返回格式：[{ name, path, isDirectory, isFile, ... }]
      // path 是完整的虚拟路径
      const result = await vfs.listDirectory(path)
      console.log('[VfsBrowserModal] 加载目录结果:', path, result)
      
      // 只返回目录项，不进入文件
      const dirs = result.filter(entry => entry.isDirectory || (entry.type && entry.type.includes('directory')))
        .map(entry => ({
          name: entry.name,
          path: entry.path,
          type: 'dir',
        }))
      
      setEntries(dirs)
    } catch (e) {
      console.error('[VfsBrowserModal] 加载目录失败:', e)
      setEntries([])
    }
  }

  const handleSelect = (entry) => {
    if (entry.type === 'dir') {
      // 进入目录，保存历史
      setPathHistory([...pathHistory, currentPath])
      setCurrentPath(entry.path)
    }
    // 文件不能进入，只能选择
  }

  const goUp = () => {
    if (pathHistory.length > 0) {
      const prevPath = pathHistory[pathHistory.length - 1]
      setPathHistory(pathHistory.slice(0, -1))
      setCurrentPath(prevPath)
    }
  }

  const selectCurrentDirectory = () => {
    // 选择当前目录作为素材目录
    if (currentPath) {
      onSelect(currentPath)
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
          <h3 className="font-bold text-slate-200">选择素材目录</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <Trash2 size={16} className="rotate-45" />
          </button>
        </div>

        {/* 路径导航 */}
        <div className="p-2 border-b border-slate-700 flex items-center gap-2 bg-slate-800/50">
          <button 
            onClick={goUp}
            disabled={pathHistory.length === 0}
            className="text-slate-400 hover:text-white disabled:opacity-30 text-xs px-2 py-1"
          >
            ⬅ 返回
          </button>
          <span className="text-xs text-slate-400 flex-1 truncate">{currentPath || '项目根目录'}</span>
        </div>

        {/* 目录列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              当前目录为空
            </div>
          ) : (
            <div className="space-y-1">
              {entries.map(entry => (
                <div
                  key={entry.path}
                  onClick={() => handleSelect(entry)}
                  className="flex items-center gap-2 p-2 rounded hover:bg-slate-700 text-slate-300 cursor-pointer transition"
                >
                  <Folder size={16} className="text-yellow-500" />
                  <span className="text-sm flex-1 truncate">{entry.name}</span>
                  <span className="text-xs text-slate-500">→</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-3 border-t border-slate-700 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm text-slate-300 hover:text-white transition"
          >
            取消
          </button>
          <button
            onClick={selectCurrentDirectory}
            disabled={!currentPath}
            className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition"
          >
            选择此目录
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 提取媒体信息（时长、缩略图等）
 */
async function extractMediaInfo(file, type, vfsPath = '') {
  const info = {
    duration: 0,
    thumbnail: null,
    width: 0,
    height: 0,
  }

  if (type === 'video') {
    try {
      return await extractVideoInfoFromBlob(file, info)
    } catch (error) {
      const nativePreview = typeof window !== 'undefined' && window.electronAPI?.previewTranscode
      if (!nativePreview || !vfsPath) {
        console.error('[extractMediaInfo] 视频信息提取失败:', error)
        return info
      }
      try {
        // iPhone HEVC/MOV 不能被 Chromium 解码时，借用预览兼容缓存抓取首帧。
        const compatibleData = await window.electronAPI.previewTranscode({ filePath: vfsPath, width: 540, height: 960 })
        return await extractVideoInfoFromBlob(new Blob([compatibleData], { type: 'video/mp4' }), info)
      } catch (fallbackError) {
        console.error('[extractMediaInfo] 兼容预览首帧提取失败:', fallbackError)
        return info
      }
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

async function extractVideoInfoFromBlob(file, info) {
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  const objectUrl = URL.createObjectURL(file)
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve
      video.onerror = () => reject(new Error('视频元数据无法读取'))
      video.src = objectUrl
    })

    info.duration = Number.isFinite(video.duration) ? video.duration : 0
    info.width = video.videoWidth || 0
    info.height = video.videoHeight || 0

    // 卡片统一展示真正的首帧，保持原始比例，不再使用中间帧或拉伸的 16:9 占位。
    await new Promise((resolve) => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        resolve()
      }
      video.addEventListener('loadeddata', finish, { once: true })
      video.addEventListener('seeked', finish, { once: true })
      video.currentTime = 0
      window.setTimeout(finish, 1200)
    })

    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 284
    const context = canvas.getContext('2d')
    if (context && video.videoWidth && video.videoHeight) {
      context.fillStyle = '#0f172a'
      context.fillRect(0, 0, canvas.width, canvas.height)
      const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
      const width = video.videoWidth * scale
      const height = video.videoHeight * scale
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
      info.thumbnail = canvas.toDataURL('image/jpeg', 0.78)
    }
    return info
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(objectUrl)
  }
}
