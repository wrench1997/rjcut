/**
 * 模板混剪 - 步骤 3：添加场景版本
 * 支持添加多个场景版本，每个版本对应一条最终视频
 */
import { useState } from 'react'
import { Plus, Copy, Trash2, AlertCircle, CheckCircle2, Sparkles, Loader2, Wand2 } from 'lucide-react'
import { getTemplateById } from '../templateRegistry.js'
import { aiSuggestSlotFiles, aiAutoCreateScene, aiGenerateScript } from '../aiAssistant.js'

export default function AddSceneVariantsStep({ draft, updateDraft, vfs, apiKey }) {
  const template = getTemplateById(draft.templateId)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isAutoCreating, setIsAutoCreating] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState(null)

  if (!template) {
    return (
      <div className="text-center py-12 text-slate-400">
        请先选择模板
      </div>
    )
  }

  // AI 素材分析 - 扫描 VFS 中的视频文件并推荐
  const handleAISuggest = async () => {
    if (!vfs) {
      alert('VFS 未初始化')
      return
    }

    setIsAnalyzing(true)
    try {
      // 扫描根目录下的视频文件
      const rootFiles = await vfs.listDirectory('/')
      const videoFiles = rootFiles.filter((f) =>
        !f.isDirectory && /\.(mp4|mov|webm)$/i.test(f.name)
      )

      if (videoFiles.length === 0) {
        alert('未在素材库中找到视频文件，请先上传素材')
        return
      }

      const suggestions = await aiSuggestSlotFiles(videoFiles, template.slots)
      setAiSuggestion(suggestions)
    } catch (error) {
      console.error('AI 素材分析失败:', error)
      alert('AI 分析失败，请稍后重试')
    } finally {
      setIsAnalyzing(false)
    }
  }

  // AI 自动生成场景版本
  const handleAIAutoCreate = async () => {
    if (!vfs) {
      alert('VFS 未初始化')
      return
    }

    setIsAutoCreating(true)
    try {
      // 扫描根目录下的视频文件
      const rootFiles = await vfs.listDirectory('/')
      const videoFiles = rootFiles.filter((f) =>
        !f.isDirectory && /\.(mp4|mov|webm)$/i.test(f.name)
      )

      if (videoFiles.length === 0) {
        alert('未在素材库中找到视频文件，请先上传素材')
        return
      }

      const newScene = await aiAutoCreateScene(template, videoFiles)
      if (!newScene) {
        alert('未能自动匹配到合适的素材，请手动添加')
        return
      }

      updateDraft((d) => ({
        ...d,
        scenes: [...(d.scenes || []), { ...newScene, id: `scene_ai_${Date.now()}` }],
      }))

      setAiSuggestion(null)
    } catch (error) {
      console.error('AI 自动生成失败:', error)
      alert('AI 生成失败，请稍后重试')
    } finally {
      setIsAutoCreating(false)
    }
  }

  // 应用 AI 推荐到当前场景
  const handleApplySuggestion = (slotId, files) => {
    const sceneIndex = (draft.scenes || []).length - 1
    if (sceneIndex < 0) {
      alert('请先添加一个场景版本')
      return
    }

    const currentScene = draft.scenes[sceneIndex]
    const currentBinding = currentScene.bindings?.[slotId] || {
      order: template.slots.find((s) => s.id === slotId)?.order || 0,
      title: template.slots.find((s) => s.id === slotId)?.title || '',
      files: [],
    }

    const updatedBinding = {
      ...currentBinding,
      files: [
        ...(currentBinding.files || []),
        ...files.map((f) => ({
          path: f.path,
          name: f.name,
          durationSeconds: null,
        })),
      ],
    }

    updateDraft((d) => {
      const newScenes = [...d.scenes]
      newScenes[sceneIndex] = {
        ...newScenes[sceneIndex],
        bindings: {
          ...newScenes[sceneIndex].bindings,
          [slotId]: updatedBinding,
        },
      }
      return { ...d, scenes: newScenes }
    })
  }

  const handleAddScene = () => {
    const newScene = {
      id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `场景版本 ${(draft.scenes || []).length + 1}`,
      bindings: {},
      overrideRenderParams: null,
    }

    // 为每个素材位初始化空白的 binding
    template.slots.forEach((slot) => {
      newScene.bindings[slot.id] = {
        order: slot.order,
        title: slot.title,
        files: [],
      }
    })

    updateDraft((d) => ({
      ...d,
      scenes: [...(d.scenes || []), newScene],
    }))
  }

  const handleDuplicateScene = (sceneIndex) => {
    const sourceScene = (draft.scenes || [])[sceneIndex]
    if (!sourceScene) return
    
    const newScene = {
      ...sourceScene,
      id: `scene_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${sourceScene.name} (副本)`,
      bindings: JSON.parse(JSON.stringify(sourceScene.bindings || {})),
    }

    updateDraft((d) => {
      const newScenes = [...(d.scenes || [])]
      newScenes.splice(sceneIndex + 1, 0, newScene)
      return { ...d, scenes: newScenes }
    })
  }

  const handleDeleteScene = (sceneIndex) => {
    updateDraft((d) => ({
      ...d,
      scenes: (d.scenes || []).filter((_, i) => i !== sceneIndex),
    }))
  }

  const handleUpdateScene = (sceneIndex, updater) => {
    updateDraft((d) => {
      const newScenes = [...(d.scenes || [])]
      newScenes[sceneIndex] = typeof updater === 'function'
        ? updater(newScenes[sceneIndex])
        : { ...newScenes[sceneIndex], ...updater }
      return { ...d, scenes: newScenes }
    })
  }

  const handleUpdateSceneBindings = (sceneIndex, slotId, newBinding) => {
    updateDraft((d) => {
      const newScenes = [...(d.scenes || [])]
      const scene = { ...newScenes[sceneIndex] }
      scene.bindings = {
        ...scene.bindings,
        [slotId]: newBinding,
      }
      newScenes[sceneIndex] = scene
      return { ...d, scenes: newScenes }
    })
  }

  // 检查场景是否完整
  const isSceneComplete = (scene) => {
    if (!template) return false
    
    for (const slot of template.slots) {
      if (!slot.required) continue
      const binding = scene.bindings?.[slot.id]
      const fileCount = binding?.files?.length || 0
      if (fileCount < slot.minFiles) return false
    }
    return true
  }

  const incompleteScenes = (draft.scenes || []).filter((scene) => !isSceneComplete(scene))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">添加场景版本</h2>
        <p className="text-sm text-slate-500 mt-1">
          每个场景版本将生成一条独立视频，可针对不同素材或文案进行批量创作
        </p>
      </div>

      {/* 模板和数字人摘要 */}
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
          <div className="text-right">
            <p className="text-xs text-blue-700">
              数字人：{draft.avatarVideo?.name || '未选择'}
            </p>
            <p className="text-xs text-blue-600 font-semibold mt-1">
              已添加 {(draft.scenes || []).length} 个场景版本
            </p>
          </div>
        </div>
      </div>

      {/* AI 素材助手 */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-200">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles size={20} className="text-purple-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-purple-900">AI 素材助手</h3>
                <p className="text-xs text-purple-700 mt-1">
                  智能分析素材文件名，自动推荐到合适的素材位
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAISuggest}
                  disabled={isAnalyzing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} />
                      分析素材
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleAIAutoCreate}
                  disabled={isAutoCreating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-300 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  {isAutoCreating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      自动生成场景
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* AI 推荐结果 */}
            {aiSuggestion && (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-semibold text-purple-800">素材推荐：</p>
                <div className="grid gap-2">
                  {aiSuggestion.map((slotSuggestion) => (
                    <div
                      key={slotSuggestion.slotId}
                      className="p-2 bg-white rounded-lg border border-purple-100"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-purple-700">
                          {slotSuggestion.slotTitle}
                        </span>
                        {slotSuggestion.files.length > 0 && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                            匹配度 {(slotSuggestion.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      {slotSuggestion.files.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {slotSuggestion.files.map((file) => (
                            <div
                              key={file.path}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                            >
                              <span className="text-slate-600 truncate max-w-[150px]">
                                {file.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleApplySuggestion(slotSuggestion.slotId, [file])}
                                className="text-purple-600 hover:text-purple-800 font-medium"
                              >
                                + 添加
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">未找到匹配的素材</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 场景版本列表 */}
      <div className="space-y-4">
        {(draft.scenes || []).map((scene, index) => (
          <SceneVariantCard
            key={scene.id}
            scene={scene}
            index={index}
            template={template}
            isComplete={isSceneComplete(scene)}
            vfs={vfs}
            apiKey={apiKey}
            onUpdate={(updater) => handleUpdateScene(index, updater)}
            onUpdateBindings={(slotId, newBinding) =>
              handleUpdateSceneBindings(index, slotId, newBinding)
            }
            onDuplicate={() => handleDuplicateScene(index)}
            onDelete={() => handleDeleteScene(index)}
          />
        ))}

        {(draft.scenes || []).length === 0 && (
          <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
            <p className="text-slate-500 mb-4">暂无场景版本</p>
            <button
              type="button"
              onClick={handleAddScene}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              添加第一个场景版本
            </button>
          </div>
        )}
      </div>

      {/* 添加按钮 */}
      {(draft.scenes || []).length > 0 && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleAddScene}
            className="flex-1 py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 font-medium"
          >
            <Plus size={18} />
            添加一个场景版本
          </button>
          {(draft.scenes || []).length > 0 && (
            <button
              type="button"
              onClick={() => handleDuplicateScene((draft.scenes || []).length - 1)}
              className="px-4 py-3 border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2 font-medium"
            >
              <Copy size={18} />
              复制最后一个
            </button>
          )}
        </div>
      )}

      {/* 缺失素材提示 */}
      {incompleteScenes.length > 0 && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                有 {incompleteScenes.length} 个场景版本缺少必填素材
              </p>
              <ul className="text-xs text-amber-700 mt-1 space-y-1">
                {incompleteScenes.map((scene) => (
                  <li key={scene.id}>
                    • {scene.name || '未命名场景'}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 mt-2">
                请补全所有必填素材后再点击生成
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 单个场景版本卡片
 */
function SceneVariantCard({
  scene,
  index,
  template,
  isComplete,
  vfs,
  apiKey,
  onUpdate,
  onUpdateBindings,
  onDuplicate,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className={[
        'rounded-xl border-2 transition-all overflow-hidden',
        isComplete
          ? 'border-green-200 bg-green-50/30'
          : 'border-amber-200 bg-amber-50/30',
      ].join(' ')}
    >
      {/* 卡片头部 */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200/50">
        <div className="flex items-center gap-3 flex-1">
          <div
            className={[
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
              isComplete
                ? 'bg-green-500 text-white'
                : 'bg-amber-500 text-white',
            ].join(' ')}
          >
            {isComplete ? <CheckCircle2 size={18} /> : index + 1}
          </div>
          <input
            type="text"
            value={scene.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className="flex-1 bg-transparent border-none outline-none text-sm font-semibold text-slate-800 placeholder-slate-400"
            placeholder="场景版本名称"
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title={expanded ? '收起' : '展开'}
          >
            {expanded ? '▲' : '▼'}
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="复制此场景"
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="删除此场景"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* 卡片内容 - 素材位列表 */}
      {expanded && (
        <div className="p-4 space-y-4">
          {[...template.slots]
            .sort((a, b) => a.order - b.order)
            .map((slot) => (
              <SlotFilePicker
                key={slot.id}
                slot={slot}
                binding={scene.bindings?.[slot.id]}
                vfs={vfs}
                onChange={(newBinding) => onUpdateBindings(slot.id, newBinding)}
              />
            ))}
        </div>
      )}
    </div>
  )
}

/**
 * 单个素材位的文件选择器
 */
function SlotFilePicker({ slot, binding, vfs, onChange }) {
  const [showBrowser, setShowBrowser] = useState(false)

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

    onChange({
      order: slot.order,
      title: slot.title,
      files: [...files, newFile],
    })
    setShowBrowser(false)
  }

  const handleRemoveFile = (index) => {
    const newFiles = files.filter((_, i) => i !== index)
    onChange({
      order: slot.order,
      title: slot.title,
      files: newFiles,
    })
  }

  return (
    <div
      className={[
        'rounded-lg border p-3 transition-colors',
        isComplete
          ? 'border-green-200 bg-white'
          : slot.required
          ? 'border-amber-200 bg-amber-50/50'
          : 'border-slate-200 bg-white',
      ].join(' ')}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">
              {slot.title}
            </span>
            {slot.required && (
              <span className="text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                必填
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{slot.prompt}</p>
        </div>
        <div className="text-right">
          <span className="text-xs font-medium text-slate-600">
            {files.length} {slot.maxFiles ? `/ ${slot.maxFiles}` : ''} 个
          </span>
        </div>
      </div>

      {/* 添加按钮 */}
      {(!slot.maxFiles || files.length < slot.maxFiles) && (
        <button
          type="button"
          onClick={() => setShowBrowser(true)}
          className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm font-medium mb-3"
        >
          <Plus size={16} />
          从素材库选择
        </button>
      )}

      {/* 已选文件列表 */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, index) => (
            <div
              key={`${file.path}-${index}`}
              className="flex items-center gap-3 p-2 bg-white rounded border border-slate-200"
            >
              <span className="text-lg">📄</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-slate-500 truncate">{file.path}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveFile(index)}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* VFS 浏览器弹窗 */}
      {showBrowser && vfs && (
        <VfsFileBrowser
          vfs={vfs}
          currentPath="/"
          onSelect={handleAddFile}
          onClose={() => setShowBrowser(false)}
          acceptTypes={['.mp4', '.mov', '.webm']}
        />
      )}
    </div>
  )
}

/**
 * VFS 文件浏览器（复用现有逻辑）
 */
function VfsFileBrowser({ vfs, currentPath, onSelect, onClose, acceptTypes }) {
  const [path, setPath] = useState(currentPath || '/')

  const loadDirectory = async (dirPath) => {
    if (!vfs) return
    try {
      const result = await vfs.listDirectory(dirPath)
      setPath(dirPath)
      return Array.isArray(result) ? result : []
    } catch (e) {
      console.error('[VfsFileBrowser] 加载失败:', e)
      return []
    }
  }

  const [items, setItems] = useState([])

  // 使用正确的 useEffect 方式
  if (typeof window !== 'undefined' && items.length === 0 && path === '/') {
    loadDirectory('/').then(setItems)
  }

  const parentPath = path === '/' ? '/' : path.substring(0, path.lastIndexOf('/')) || '/'

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">选择视频文件</h3>
          <button
            className="p-2 hover:bg-slate-100 rounded-lg"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
            onClick={() => loadDirectory('/').then(setItems)}
          >
            根目录
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
            onClick={() => loadDirectory(parentPath).then(setItems)}
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
                const isVideo =
                  !item.isDirectory &&
                  acceptTypes?.some((ext) =>
                    item.name.toLowerCase().endsWith(ext)
                  )
                return (
                  <div
                    key={item.path}
                    className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg"
                    onDoubleClick={() => {
                      if (item.isDirectory) {
                        loadDirectory(item.path).then(setItems)
                      }
                    }}
                  >
                    <span className="text-lg">
                      {item.isDirectory ? '📁' : '📄'}
                    </span>
                    <span className="flex-1 text-sm text-slate-700">
                      {item.name}
                    </span>
                    {!item.isDirectory && item.size && (
                      <span className="text-xs text-slate-400">
                        {(item.size / 1024 / 1024).toFixed(1)} MB
                      </span>
                    )}
                    {!item.isDirectory && isVideo && (
                      <button
                        className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded"
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