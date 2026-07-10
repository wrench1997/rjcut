/**
 * 模板混剪 - 步骤 3：补充素材
 * 按模板素材位逐项填空
 */
import { useState, useCallback, useEffect } from 'react'
import { getTemplateById } from '../templateRegistry.js'
import { CirclePlus, X, Play, Trash2, Upload, FileVideo, Sparkles, Loader2, ArrowUp, WandSparkles, BadgeCheck, AlertTriangle, Layers, Film, FolderOpen } from 'lucide-react'
import { aiSuggestSlotFiles } from '../aiAssistant.js'

export default function FillTemplateSlotsStep({ draft, updateDraft, vfs }) {
  const template = getTemplateById(draft.templateId)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showFolderPicker, setShowFolderPicker] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState(null)

  if (!template) {
    return (
      <div className="text-center py-12 text-slate-400">
        请先选择模板
      </div>
    )
  }

  const sortedSlots = [...template.slots].sort((a, b) => a.order - b.order)

  // AI 智能分析文件夹，自动推荐素材
  const handleAiAutoFill = async () => {
    if (!vfs) {
      alert('素材库未初始化')
      return
    }

    // 打开文件夹选择器
    setShowFolderPicker(true)
  }

  // 确认选择文件夹并开始分析
  const handleFolderSelected = async (folderPath) => {
    if (!folderPath) {
      setShowFolderPicker(false)
      return
    }

    setSelectedFolder(folderPath)
    setShowFolderPicker(false)
    setIsAnalyzing(true)

    try {
      // 1. 获取选中文件夹下的所有视频文件
      const allFiles = await getAllVideoFiles(vfs, folderPath)
      console.log('[AI 素材助手] 找到视频文件:', allFiles.length, '个，文件夹:', folderPath)

      if (allFiles.length === 0) {
        alert('所选文件夹中没有找到视频文件')
        return
      }

      // 2. 调用 AI 推荐
      const suggestions = await aiSuggestSlotFiles(allFiles, sortedSlots, vfs)
      console.log('[AI 素材助手] 推荐结果:', suggestions)

      // 3. 自动填充素材位
      const newBindings = {}
      suggestions.forEach((suggestion) => {
        if (suggestion.files.length > 0) {
          newBindings[suggestion.slotId] = {
            order: suggestion.order,
            title: suggestion.slotTitle,
            files: suggestion.files.map((f) => ({
              path: f.path,
              name: f.name,
              durationSeconds: null,
            })),
          }
        }
      })

      // 4. 更新 draft
      updateDraft((d) => ({
        ...d,
        slotBindings: {
          ...d.slotBindings,
          ...newBindings,
        },
      }))

      alert(`AI 已自动填充 ${Object.keys(newBindings).length} 个素材位`)
    } catch (error) {
      console.error('[AI 素材助手] 分析失败:', error)
      alert('AI 分析失败，请稍后重试')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // 递归获取所有视频文件
  const getAllVideoFiles = async (vfs, path = '/') => {
    const videoExtensions = ['.mp4', '.mov', '.webm', '.mkv', '.avi']
    const files = []

    try {
      const items = await vfs.listDirectory(path)
      for (const item of items) {
        if (item.isDirectory) {
          // 递归遍历子目录
          const subFiles = await getAllVideoFiles(vfs, item.path)
          files.push(...subFiles)
        } else {
          // 检查是否为视频文件
          const isVideo = videoExtensions.some((ext) =>
            item.name.toLowerCase().endsWith(ext)
          )
          if (isVideo) {
            files.push(item)
          }
        }
      }
    } catch (e) {
      console.error('[getAllVideoFiles] 加载失败:', path, e)
    }

    return files
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">补充素材</h2>
        <p className="text-sm text-slate-500 mt-1">
          按模板要求为每个素材位选择视频
        </p>
      </div>

      {/* 模板信息摘要 + AI 助手按钮 */}
      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Layers size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">
                当前模板：{template.name}
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                {template.description}
              </p>
              {selectedFolder && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <FolderOpen size={12} />
                  {selectedFolder}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-blue-700 flex items-center gap-1 justify-end">
                <Film size={12} />
                已选口播：{draft.sourceVideo?.name || '未选择'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAiAutoFill}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-purple-300 disabled:to-indigo-300 text-white text-sm font-semibold rounded-lg transition-all shadow-sm hover:shadow-md flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <WandSparkles size={16} />
                  AI 智能填充
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 文件夹选择器弹窗 */}
      {showFolderPicker && (
        <VfsFolderPicker
          vfs={vfs}
          onSelect={handleFolderSelected}
          onCancel={() => setShowFolderPicker(false)}
        />
      )}

      {/* 素材位列表 */}
      <div className="space-y-6">
        {sortedSlots.map((slot) => (
          <TemplateSlotCard
            key={slot.id}
            slot={slot}
            binding={draft.slotBindings[slot.id]}
            vfs={vfs}
            onUpdate={(newBinding) => {
              updateDraft((d) => ({
                ...d,
                slotBindings: {
                  ...d.slotBindings,
                  [slot.id]: newBinding,
                },
              }))
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 单个素材位卡片
 */
function TemplateSlotCard({ slot, binding, vfs, onUpdate }) {
  const [showVfsBrowser, setShowVfsBrowser] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [showPreview, setShowPreview] = useState(false)

  const files = binding?.files || []
  const isComplete = files.length >= slot.minFiles
  const isOverLimit = slot.maxFiles && files.length > slot.maxFiles

  const handleAddFile = (fileItem) => {
    if (slot.maxFiles && files.length >= slot.maxFiles) {
      alert(`最多只能选择 ${slot.maxFiles} 个视频`)
      return
    }

    const newFile = {
      path: fileItem.path,
      name: fileItem.name,
      durationSeconds: null,
    }

    onUpdate({
      order: slot.order,
      title: slot.title,
      files: [...files, newFile],
    })
    setShowVfsBrowser(false)
  }

  const handleRemoveFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index)
    onUpdate({
      order: slot.order,
      title: slot.title,
      files: newFiles,
    })
  }

  const handlePreview = (file) => {
    setPreviewFile(file)
    setShowPreview(true)
  }

  return (
    <div
      className={[
        'rounded-xl border-2 p-5 transition-all',
        isComplete
          ? 'border-green-200 bg-green-50/30'
          : slot.required
          ? 'border-amber-200 bg-amber-50/30'
          : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div
              className={[
                'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm',
                isComplete
                  ? 'bg-gradient-to-br from-green-500 to-emerald-500 text-white'
                  : slot.required
                  ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white'
                  : 'bg-gradient-to-br from-slate-200 to-slate-300 text-slate-600',
              ].join(' ')}
            >
              {isComplete ? <BadgeCheck size={14} /> : slot.order}
            </div>
            <h3 className="font-bold text-slate-800">{slot.title}</h3>
          </div>
          <div className="flex items-center gap-2 mt-1 ml-8">
            {slot.required && (
              <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                必填
              </span>
            )}
            <span className="text-xs text-slate-500">
              建议时长：{slot.durationHint}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-slate-600">
            已选 {files.length} {slot.maxFiles ? `/ ${slot.maxFiles}` : ''} 个
          </p>
          {isComplete && (
            <p className="text-xs text-green-600 mt-1">✓ 已完成</p>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-600 mb-4 ml-8">{slot.prompt}</p>

      {/* 添加按钮 */}
      {(!slot.maxFiles || files.length < slot.maxFiles) && (
        <div className="flex gap-2 mb-4 ml-8">
          <button
            type="button"
            onClick={() => setShowVfsBrowser(true)}
            className="flex-1 py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 transition-all flex items-center justify-center gap-2 text-sm font-semibold"
          >
            <CirclePlus size={16} />
            从素材库选择
          </button>
        </div>
      )}

      {/* 已选文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2 ml-8">
          <p className="text-xs font-medium text-slate-500">已选择：</p>
          {files.map((file, index) => (
            <div
              key={`${file.path}-${index}`}
              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200"
            >
              <Film size={18} className="text-purple-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500">
                  {file.path}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handlePreview(file)}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="预览"
                >
                  <Play size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(index)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VFS 浏览器弹窗 */}
      {showVfsBrowser && vfs && (
        <VfsFileBrowser
          vfs={vfs}
          currentPath="/"
          onSelect={handleAddFile}
          onClose={() => setShowVfsBrowser(false)}
          acceptTypes={['.mp4', '.mov', '.webm']}
        />
      )}

      {/* 预览弹窗 */}
      {showPreview && previewFile && (
        <VideoPreviewModal
          videoPath={previewFile.path}
          vfs={vfs}
          onClose={() => {
            setShowPreview(false)
            setPreviewFile(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * VFS 文件浏览器
 */
function VfsFileBrowser({ vfs, currentPath, onSelect, onClose, acceptTypes }) {
  const [path, setPath] = useState(currentPath || '/')
  const [items, setItems] = useState([])

  const loadDirectory = useCallback(async (dirPath) => {
    if (!vfs) return
    try {
      const result = await vfs.listDirectory(dirPath)
      setItems(Array.isArray(result) ? result : [])
    } catch (e) {
      console.error('[VfsFileBrowser] 加载失败:', e)
      setItems([])
    }
    setPath(dirPath)
  }, [vfs])

  useEffect(() => {
    loadDirectory(path)
  }, [path, loadDirectory])

  const parentPath = path === '/' ? '/' : path.substring(0, path.lastIndexOf('/')) || '/'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">选择视频文件</h3>
          <button className="p-2 hover:bg-slate-100 rounded-lg" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
            onClick={() => loadDirectory('/')}
          >
            根目录
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
            onClick={() => loadDirectory(parentPath)}
            disabled={path === '/'}
          >
            上一层
          </button>
          <span className="text-xs text-slate-500 ml-auto">当前：{path}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="text-center py-8 text-slate-400">空目录</div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => {
                const isVideo = !item.isDirectory && acceptTypes?.some((ext) => item.name.toLowerCase().endsWith(ext))
                return (
                  <div
                    key={item.path}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg"
                    onDoubleClick={() => item.isDirectory && loadDirectory(item.path)}
                  >
                    <span className="text-lg">{item.isDirectory ? '📁' : '📄'}</span>
                    <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                    {!item.isDirectory && item.size && (
                      <span className="text-xs text-slate-400">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                    )}
                    {!item.isDirectory && isVideo && (
                      <button
                        className="px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect(item)
                        }}
                      >
                        选择
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 视频预览弹窗
 */
function VideoPreviewModal({ videoPath, vfs, onClose }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let blobUrl = null

    const loadVideo = async () => {
      if (!vfs || !videoPath) return
      try {
        const blob = await vfs.readFileAsBlob(videoPath)
        if (blob.size === 0) throw new Error('文件为空')
        blobUrl = URL.createObjectURL(blob)
        setVideoUrl(blobUrl)
      } catch (e) {
        console.error('[VideoPreview] 加载失败:', e)
      } finally {
        setLoading(false)
      }
    }

    loadVideo()

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [vfs, videoPath])

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      {/* 🎨 修改：针对 9:16 竖屏视频优化窗口尺寸 */}
      <div className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" 
           style={{ width: 'min(450px, 90vw)', height: 'min(800px, 90vh)' }}
           onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="flex justify-between items-center p-3 border-b border-slate-200 flex-shrink-0 bg-gradient-to-r from-slate-50 to-white">
          <h3 className="font-semibold text-base text-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            视频预览
          </h3>
          <button className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-500" onClick={onClose} title="关闭预览">
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        {/* 视频播放区域 - 黑色背景适配 9:16 竖屏 */}
        <div className="flex-1 min-h-0 bg-black flex items-center justify-center p-4">
          {loading ? (
            <div className="text-slate-400 flex items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              加载中...
            </div>
          ) : videoUrl ? (
            <video controls autoPlay className="max-h-full max-w-full rounded-lg shadow-2xl" style={{ aspectRatio: '9/16' }} src={videoUrl}>
              您的浏览器不支持视频
            </video>
          ) : (
            <div className="text-slate-400">加载失败</div>
          )}
        </div>
        {/* 底部路径信息 */}
        <div className="p-3 border-t border-slate-200 flex-shrink-0 bg-slate-50">
          <p className="text-xs text-slate-500 truncate">{videoPath}</p>
        </div>
      </div>
    </div>
  )
}/**
 * VFS 文件夹选择器弹窗（简化版文件浏览器）
 */
function VfsFolderPicker({ vfs, onSelect, onCancel }) {
  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [videoCount, setVideoCount] = useState(0)

  const loadDirectory = async (path) => {
    try {
      setLoading(true)
      const dirItems = await vfs.listDirectory(path)
      // 显示所有项目（文件夹 + 视频文件）
      const folders = (dirItems || []).filter(item => item.isDirectory)
      const videoFiles = (dirItems || []).filter(item => 
        !item.isDirectory && /\.(mp4|mov|webm|mkv|avi)$/i.test(item.name)
      )
      // 文件夹在前，视频文件在后
      setItems([...folders, ...videoFiles])
      setVideoCount(videoFiles.length)
      setCurrentPath(path)
    } catch (e) {
      console.error('[VfsFolderPicker] 加载目录失败:', e)
      setItems([])
      setVideoCount(0)
    } finally {
      setLoading(false)
    }
  }

  const navigateTo = async (path) => {
    try {
      vfs.cd(path)
      await loadDirectory(vfs.pwd())
    } catch (e) {
      console.error('[VfsFolderPicker] 导航失败:', e)
    }
  }

  const handleSelect = () => {
    onSelect(currentPath)
  }

  const goUp = () => {
    if (currentPath !== '/') {
      const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'
      navigateTo(parentPath)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg text-slate-800">选择素材文件夹</h3>
          <button className="p-2 hover:bg-slate-100 rounded-lg" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        {/* 路径导航栏 */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <button
              className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              onClick={() => navigateTo('/projects')}
            >
              📁 项目
            </button>
            <button
              className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              onClick={() => navigateTo('/drafts')}
            >
              📁 草稿
            </button>
            <button
              className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              onClick={() => navigateTo('/')}
            >
              🏠 根目录
            </button>
          </div>
          <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
            <button
              className="p-1 hover:bg-slate-200 rounded disabled:opacity-30"
              onClick={goUp}
              disabled={currentPath === '/'}
            >
              <ArrowUp size={16} />
            </button>
            <span className="flex-1 text-sm text-slate-600">{currentPath}</span>
          </div>
          {videoCount > 0 && (
            <p className="text-xs text-green-600 mt-2">
              ✓ 当前目录有 {videoCount} 个视频文件
            </p>
          )}
        </div>

        {/* 文件列表 */}
        <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg mb-4">
          {loading ? (
            <div className="p-8 text-center text-slate-400">加载中...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-slate-400">当前目录为空</p>
              {videoCount > 0 && (
                <p className="text-xs text-green-600 mt-2">
                  可以直接选择当前目录（有 {videoCount} 个视频文件）
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <div
                  key={item.path}
                  className={`flex items-center gap-3 p-3 transition-colors ${
                    item.isDirectory ? 'hover:bg-slate-50 cursor-pointer' : 'hover:bg-blue-50'
                  }`}
                  onClick={() => item.isDirectory && navigateTo(item.path)}
                >
                  {item.isDirectory ? <FolderOpen size={20} className="text-blue-500" /> : <Film size={20} className="text-purple-500" />}
                  <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                  {item.isDirectory ? (
                    <span className="text-xs text-slate-400">→</span>
                  ) : (
                    <span className="text-xs text-slate-400">{(item.size / 1024 / 1024).toFixed(1)} MB</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            onClick={handleSelect}
          >
            选择当前目录
          </button>
        </div>
      </div>
    </div>
  )
}
