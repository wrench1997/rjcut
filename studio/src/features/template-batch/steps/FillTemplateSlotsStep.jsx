/**
 * 模板混剪 - 步骤 3：补充素材
 * 按模板素材位逐项填空
 */
import { useState, useCallback, useEffect } from 'react'
import { getTemplateById } from '../templateRegistry.js'
import { Plus, X, Play, Trash2, Upload, FileVideo, Sparkles, Loader2 } from 'lucide-react'
import { aiSuggestSlotFiles } from '../aiAssistant.js'

export default function FillTemplateSlotsStep({ draft, updateDraft, vfs }) {
  const template = getTemplateById(draft.templateId)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

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

    setIsAnalyzing(true)
    try {
      // 1. 获取所有视频文件
      const allFiles = await getAllVideoFiles(vfs)
      console.log('[AI 素材助手] 找到视频文件:', allFiles.length, '个')

      if (allFiles.length === 0) {
        alert('素材库中没有找到视频文件')
        return
      }

      // 2. 调用 AI 推荐
      const suggestions = await aiSuggestSlotFiles(allFiles, sortedSlots)
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
      <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900">
              当前模板：{template.name}
            </p>
            <p className="text-xs text-blue-700 mt-1">
              {template.description}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-blue-700">
                已选口播：{draft.sourceVideo?.name || '未选择'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAiAutoFill}
              disabled={isAnalyzing}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  AI 智能填充
                </>
              )}
            </button>
          </div>
        </div>
      </div>

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
            <span
              className={[
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                isComplete
                  ? 'bg-green-500 text-white'
                  : slot.required
                  ? 'bg-amber-500 text-white'
                  : 'bg-slate-200 text-slate-600',
              ].join(' ')}
            >
              {slot.order}
            </span>
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
            className="flex-1 py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus size={16} />
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
              <FileVideo size={18} className="text-blue-500 flex-shrink-0" />
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
      <div className="bg-white rounded-xl p-4 max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-lg">视频预览</h3>
          <button className="p-2 hover:bg-slate-100 rounded-lg" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {loading ? (
          <div className="aspect-[9/16] max-h-[60vh] bg-slate-100 rounded-lg flex items-center justify-center">
            <div className="text-slate-400">加载中...</div>
          </div>
        ) : videoUrl ? (
          <video controls autoPlay className="w-full aspect-[9/16] max-h-[60vh] bg-black rounded-lg" src={videoUrl}>
            您的浏览器不支持视频
          </video>
        ) : (
          <div className="aspect-[9/16] max-h-[60vh] bg-slate-100 rounded-lg flex items-center justify-center">
            <div className="text-slate-400">加载失败</div>
          </div>
        )}
        <p className="text-xs text-slate-500 mt-2 truncate">{videoPath}</p>
      </div>
    </div>
  )
}