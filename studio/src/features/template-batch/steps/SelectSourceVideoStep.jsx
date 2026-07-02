/**
 * 模板混剪 - 步骤 2：选择口播视频
 * 用户选择已经生成好的数字人视频或从 VFS 选择视频
 */
import { useState, useEffect, useCallback } from 'react'
import { Play, Upload, FileVideo, Check, X, ExternalLink } from 'lucide-react'

// 模拟获取数字人任务列表（实际应从 API 或 store 获取）
function useDhTaskList() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: 实际应从 API 获取数字人任务列表
    // 这里使用模拟数据
    const timer = setTimeout(() => {
      setTasks([
        {
          id: 'dh_task_001',
          name: '鹿茸血口播 - 版本 1.mp4',
          status: 'succeeded',
          createdAt: '2024-01-15T10:30:00Z',
          duration: 45,
          thumbnail: null,
        },
        {
          id: 'dh_task_002',
          name: '保健品介绍 - 版本 2.mp4',
          status: 'succeeded',
          createdAt: '2024-01-14T15:20:00Z',
          duration: 38,
          thumbnail: null,
        },
      ])
      setLoading(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  return { tasks, loading }
}

export default function SelectSourceVideoStep({ draft, updateDraft, vfs }) {
  const [activeTab, setActiveTab] = useState('dh_task') // 'dh_task' | 'vfs'
  const [showPreview, setShowPreview] = useState(false)
  const [previewVideo, setPreviewVideo] = useState(null)
  const { tasks: dhTasks, loading: dhLoading } = useDhTaskList()

  const [vfsPath, setVfsPath] = useState('/')
  const [vfsItems, setVfsItems] = useState([])
  const [showVfsBrowser, setShowVfsBrowser] = useState(false)

  const loadVfsDirectory = useCallback(async (path) => {
    if (!vfs) return
    try {
      const items = await vfs.listDirectory(path)
      setVfsItems(Array.isArray(items) ? items : [])
    } catch (error) {
      console.error('[SelectSourceVideo] 加载 VFS 目录失败:', error)
      setVfsItems([])
    }
    setVfsPath(path)
  }, [vfs])

  useEffect(() => {
    if (showVfsBrowser && vfs) {
      loadVfsDirectory(vfsPath)
    }
  }, [showVfsBrowser, vfs, vfsPath, loadVfsDirectory])

  const handleVfsFileSelect = (item) => {
    if (!item.isDirectory && item.name.match(/\.(mp4|mov|webm)$/i)) {
      updateDraft((d) => ({
        ...d,
        sourceVideo: {
          path: item.path,
          name: item.name,
          taskId: '',
          source: 'vfs',
          durationSeconds: null,
          linkedTemplateId: draft.templateId,
        },
      }))
      setShowVfsBrowser(false)
    }
  }

  const handleDhTaskSelect = (task) => {
    // TODO: 实际应获取任务的真实视频路径
    updateDraft((d) => ({
      ...d,
      sourceVideo: {
        path: `/digital-human/${task.name}`,
        name: task.name,
        taskId: task.id,
        source: 'dh_task',
        durationSeconds: task.duration,
        linkedTemplateId: draft.templateId,
      },
    }))
  }

  const handlePreview = (videoPath) => {
    setPreviewVideo(videoPath)
    setShowPreview(true)
  }

  const selectedVideo = draft.sourceVideo

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">选择口播视频</h2>
        <p className="text-sm text-slate-500 mt-1">
          选择已经生成好的数字人口播视频，或从文件库中选择视频
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('dh_task')}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'dh_task'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700',
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <FileVideo size={16} />
            已生成数字人视频
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('vfs')}
          className={[
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'vfs'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700',
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <Upload size={16} />
            从文件库选择
          </div>
        </button>
      </div>

      {/* 数字人视频列表 */}
      {activeTab === 'dh_task' && (
        <div className="space-y-4">
          {dhLoading ? (
            <div className="text-center py-12 text-slate-400">加载中...</div>
          ) : dhTasks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-4">暂无已生成的数字人视频</p>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <ExternalLink size={16} />
                去生成数字人视频
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {dhTasks.map((task) => {
                const isSelected = selectedVideo?.taskId === task.id
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleDhTaskSelect(task)}
                    className={[
                      'text-left rounded-xl border-2 p-4 transition-all hover:shadow-md',
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-blue-300',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        已完成
                      </span>
                      {isSelected && (
                        <Check size={18} className="text-blue-600" />
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-800 mb-2 truncate">
                      {task.name}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>时长：{task.duration}秒</span>
                      <span>
                        {new Date(task.createdAt).toLocaleDateString('zh-CN')}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePreview(task.name)
                        }}
                        className="flex-1 px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <Play size={12} />
                        预览
                      </button>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* VFS 文件选择 */}
      {activeTab === 'vfs' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowVfsBrowser(true)}
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
          >
            <Folder size={18} />
            {selectedVideo?.source === 'vfs' ? '更改选择' : '从 VFS 选择视频'}
          </button>

          {selectedVideo?.source === 'vfs' && (
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check size={18} className="text-blue-600" />
                  <span className="text-sm font-medium text-slate-700">
                    {selectedVideo.name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handlePreview(selectedVideo.path)}
                  className="px-3 py-1.5 text-xs bg-white hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Play size={12} />
                  预览
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VFS 浏览器弹窗 */}
      {showVfsBrowser && vfs && (
        <VfsFileBrowser
          vfs={vfs}
          currentPath={vfsPath}
          onNavigate={loadVfsDirectory}
          onSelect={handleVfsFileSelect}
          onClose={() => setShowVfsBrowser(false)}
          acceptTypes={['.mp4', '.mov', '.webm']}
        />
      )}

      {/* 视频预览弹窗 */}
      {showPreview && previewVideo && (
        <VideoPreviewModal
          videoPath={previewVideo}
          vfs={vfs}
          onClose={() => {
            setShowPreview(false)
            setPreviewVideo(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * VFS 文件浏览器组件
 */
function VfsFileBrowser({ vfs, currentPath, onNavigate, onSelect, onClose, acceptTypes }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    const load = async () => {
      try {
        const result = await vfs.listDirectory(currentPath)
        setItems(Array.isArray(result) ? result : [])
      } catch (e) {
        console.error('[VfsFileBrowser] 加载失败:', e)
        setItems([])
      }
    }
    load()
  }, [vfs, currentPath])

  const parentPath = currentPath === '/' ? '/' : currentPath.substring(0, currentPath.lastIndexOf('/')) || '/'

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
            onClick={() => onNavigate('/')}
          >
            根目录
          </button>
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
            onClick={() => onNavigate(parentPath)}
            disabled={currentPath === '/'}
          >
            上一层
          </button>
          <span className="text-xs text-slate-500 ml-auto">当前：{currentPath}</span>
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
                    onDoubleClick={() => item.isDirectory && onNavigate(item.path)}
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

function Folder({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}