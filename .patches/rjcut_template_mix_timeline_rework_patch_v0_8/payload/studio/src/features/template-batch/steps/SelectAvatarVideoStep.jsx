/**
 * 模板混剪 - 步骤 2：选择数字人视频
 * 用户从 VFS 中选择一个数字人视频作为批次共用素材
 */
import { useState, useEffect } from 'react'
import { Film, Search, AlertCircle, FolderOpen, ChevronRight, Home, FileJson } from 'lucide-react'
import { loadSidecarForVideo } from '../../digital-human-project/digitalHumanProject.js'

export default function SelectAvatarVideoStep({ draft, updateDraft, vfs, apiKey }) {
  const [currentPath, setCurrentPath] = useState('/')
  const [directoryStack, setDirectoryStack] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [metadataError, setMetadataError] = useState('')
  const [loadingMetadata, setLoadingMetadata] = useState(false)

  // 加载当前目录内容
  useEffect(() => {
    const loadDirectory = async () => {
      if (!vfs) return

      try {
        setLoading(true)
        const items = await vfs.listDirectory(currentPath)
        
        // 分离文件夹和视频文件
        const folders = items.filter((item) => item.isDirectory)
        const videos = items.filter((item) => !item.isDirectory && item.name.toLowerCase().endsWith('.mp4'))
        
        setFiles([...folders, ...videos])
      } catch (e) {
        console.error('[SelectAvatarVideo] 加载目录失败:', e)
        setFiles([])
      } finally {
        setLoading(false)
      }
    }

    loadDirectory()
  }, [vfs, currentPath])

  const handleSelectVideo = async (video) => {
    setLoadingMetadata(true)
    setMetadataError('')
    try {
      const { projectPath, project } = await loadSidecarForVideo(vfs, video.path)
      if (!project) {
        setMetadataError(`未找到 ${projectPath}。旧数字人视频没有字级时间轴，不能自动混剪。`)
      }
      updateDraft((d) => ({
        ...d,
        avatarVideo: {
          path: video.path,
          name: video.name,
          taskId: project?.digital_human?.task_id || '',
          source: 'vfs',
          durationSeconds: project?.digital_human?.duration_ms
            ? project.digital_human.duration_ms / 1000
            : null,
          linkedTemplateId: project?.copywriting?.meta?.template_id || null,
          projectPath,
          project,
        },
      }))
    } catch (error) {
      console.error('[SelectAvatarVideo] 加载项目 JSON 失败:', error)
      setMetadataError(error.message)
      updateDraft((d) => ({
        ...d,
        avatarVideo: { path: video.path, name: video.name, source: 'vfs', projectPath: '', project: null },
      }))
    } finally {
      setLoadingMetadata(false)
    }
  }

  const handleNavigateTo = (path) => {
    setCurrentPath(path)
  }

  const handleNavigateUp = () => {
    if (directoryStack.length > 0) {
      const parentPath = directoryStack[directoryStack.length - 1]
      setDirectoryStack(directoryStack.slice(0, -1))
      setCurrentPath(parentPath)
    } else if (currentPath !== '/') {
      setCurrentPath('/')
    }
  }

  const handleEnterFolder = (folder) => {
    setDirectoryStack([...directoryStack, currentPath])
    setCurrentPath(folder.path)
  }

  const filteredFiles = files.filter((file) =>
    file.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedPath = draft.avatarVideo?.path
  const isRoot = currentPath === '/'
  const transitionClips = draft.avatarVideo?.project?.timeline?.transition_clips
    || draft.avatarVideo?.project?.transition_segments
    || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">选择数字人视频</h2>
        <p className="text-sm text-slate-500 mt-1">
          从文件系统中选择一个数字人视频，将用于所有场景版本
        </p>
      </div>

      {/* 路径导航栏 */}
      <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3 border border-slate-200">
        <button
          type="button"
          onClick={() => {
            setCurrentPath('/')
            setDirectoryStack([])
          }}
          disabled={isRoot}
          className="p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
          title="返回根目录"
        >
          <Home className="w-4 h-4 text-slate-600" />
        </button>
        
        {!isRoot && (
          <button
            type="button"
            onClick={handleNavigateUp}
            className="p-1.5 rounded hover:bg-slate-200"
            title="返回上级"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 rotate-180" />
          </button>
        )}
        
        <div className="flex-1 flex items-center gap-1 text-sm text-slate-600 overflow-x-auto">
          <span
            className="px-2 py-1 rounded hover:bg-slate-200 cursor-pointer flex-shrink-0"
            onClick={() => {
              setCurrentPath('/')
              setDirectoryStack([])
            }}
          >
            根目录
          </span>
          {directoryStack.map((path, idx) => {
            const folderName = path.split('/').filter(Boolean)[idx]
            return (
              <span key={path} className="flex items-center gap-1 flex-shrink-0">
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <span
                  className="px-2 py-1 rounded hover:bg-slate-200 cursor-pointer"
                  onClick={() => handleNavigateTo(directoryStack[idx])}
                >
                  {folderName}
                </span>
              </span>
            )
          })}
          {!isRoot && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="px-2 py-1 bg-white rounded font-medium">
                {currentPath.split('/').pop()}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索视频或文件夹..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* 文件列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-2 text-slate-500">
            <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
            加载中...
          </div>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <FolderOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {searchQuery ? '没有找到匹配的内容' : '此目录为空'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {searchQuery ? '尝试其他搜索关键词' : '请导航到其他目录选择视频文件'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => {
            const isSelected = selectedPath === file.path
            const isFolder = file.isDirectory
            
            if (isFolder) {
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => handleEnterFolder(file)}
                  className="relative p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-amber-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <FolderOpen className="w-5 h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">文件夹</p>
                    </div>
                  </div>
                </button>
              )
            }

            return (
              <button
                key={file.path}
                type="button"
                onClick={() => handleSelectVideo(file)}
                disabled={loadingMetadata}
                className={[
                  'relative p-4 rounded-xl border-2 transition-all text-left',
                  isSelected
                    ? 'border-blue-600 bg-blue-50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm',
                ].join(' ')}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <div
                    className={[
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      isSelected ? 'bg-blue-600' : 'bg-slate-100',
                    ].join(' ')}
                  >
                    <Film
                      className={[
                        'w-5 h-5',
                        isSelected ? 'text-white' : 'text-slate-400',
                      ].join(' ')}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-sm font-semibold truncate',
                        isSelected ? 'text-blue-900' : 'text-slate-700',
                      ].join(' ')}
                    >
                      {file.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                      {file.path}
                    </p>
                    {file.size && (
                      <p className="text-xs text-slate-400 mt-1">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* 已选提示 */}
      {draft.avatarVideo?.path && (
        <div className="p-4 bg-green-50 rounded-xl border border-green-200">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">
                已选择：{draft.avatarVideo.name}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {draft.avatarVideo.project
                  ? `已加载字级时间轴：${draft.avatarVideo.project.char_timings?.length || 0} 个字符；将用于所有场景版本。`
                  : '已选择视频，但尚未加载字级时间轴。'}
              </p>
              {draft.avatarVideo.projectPath && (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <FileJson className="w-3 h-3" /> {draft.avatarVideo.projectPath}
                </p>
              )}
              {transitionClips.length > 0 && (
                <div className="mt-3 rounded-lg border border-green-200 bg-white/70 p-3">
                  <p className="text-xs font-semibold text-green-800 mb-2">
                    自动剪辑位置：{transitionClips.length} 段
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {transitionClips.map((clip, index) => (
                      <div key={clip.segment_id || clip.id || index} className="text-[11px] text-green-700 flex items-start gap-2">
                        <span className="font-mono shrink-0">
                          {Number.isFinite(Number(clip.start_ms)) && Number.isFinite(Number(clip.end_ms))
                            ? `${(Number(clip.start_ms) / 1000).toFixed(2)}s-${(Number(clip.end_ms) / 1000).toFixed(2)}s`
                            : '待映射'}
                        </span>
                        <span className="min-w-0">
                          <strong>{clip.slot_id || `场景 ${index + 1}`}</strong>
                          {clip.text ? `：${clip.text}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {metadataError && (
        <div className="p-4 bg-red-50 rounded-xl border border-red-200 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">无法自动加载字级时间轴</p>
            <p className="text-xs text-red-600 mt-1">{metadataError}</p>
          </div>
        </div>
      )}

      {/* 使用提示 */}
      {!draft.avatarVideo?.path && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                请选择一个数字人视频
              </p>
              <p className="text-xs text-amber-600 mt-1">
                请从文件系统中选择一个 MP4 格式的数字人视频文件
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}