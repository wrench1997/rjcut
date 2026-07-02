/**
 * 模板混剪 - 步骤 2：选择数字人视频
 * 用户从 VFS 中选择一个数字人视频作为批次共用素材
 */
import { useState, useEffect } from 'react'
import { Film, Search, AlertCircle, FolderOpen, ChevronRight, Home } from 'lucide-react'

export default function SelectAvatarVideoStep({ draft, updateDraft, vfs, apiKey }) {
  const [currentPath, setCurrentPath] = useState('/')
  const [directoryStack, setDirectoryStack] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

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

  const handleSelectVideo = (video) => {
    updateDraft((d) => ({
      ...d,
      avatarVideo: {
        path: video.path,
        name: video.name,
        taskId: '',
        source: 'vfs',
        durationSeconds: null,
        linkedTemplateId: null,
      },
    }))
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
                此视频将用于所有场景版本的生成
              </p>
            </div>
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