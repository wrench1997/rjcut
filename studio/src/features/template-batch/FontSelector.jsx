/**
 * 模板混剪 - 字幕字体选择器
 * 支持从 VFS 选择或导入本地字体文件（.ttf, .otf, .ttc）
 */
import { useState, useRef } from 'react'
import { Type, Upload, X, FileText, Trash2 } from 'lucide-react'

const ACCEPTED_FONT_EXTENSIONS = ['.ttf', '.otf', '.ttc']
const ACCEPTED_FONT_TYPES = [
  'font/ttf',
  'font/otf',
  'font/collection',
  'application/x-font-ttf',
  'application/x-font-otf',
]

export default function FontSelector({
  vfs,
  value,
  onChange,
  className,
}) {
  const [showVfsBrowser, setShowVfsBrowser] = useState(false)
  const fileInputRef = useRef(null)

  const hasFont = value?.enabled && value?.vfsFontPath

  const handleSelectFromVfs = (file) => {
    onChange({
      enabled: true,
      vfsFontPath: file.path,
      fontName: file.name,
    })
    setShowVfsBrowser(false)
  }

  const handleImportLocal = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isValidType = ACCEPTED_FONT_TYPES.includes(file.type) ||
      ACCEPTED_FONT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!isValidType) {
      alert('不支持的字体格式，请选择 TTF、OTF 或 TTC 文件')
      return
    }

    // 将本地字体保存到 VFS
    const reader = new FileReader()
    reader.onload = async (event) => {
      const arrayBuffer = event.target.result
      const uint8Array = new Uint8Array(arrayBuffer)
      
      const vfsPath = `/字体/${file.name}`
      try {
        await vfs.mkdir('/字体', true)
        await vfs.writeFile(vfsPath, uint8Array)
        
        onChange({
          enabled: true,
          vfsFontPath: vfsPath,
          fontName: file.name,
        })
      } catch (err) {
        console.error('[FontSelector] 保存字体到 VFS 失败:', err)
        alert('保存字体失败：' + err.message)
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
    onChange({
      enabled: false,
      vfsFontPath: '',
      fontName: '',
    })
  }

  return (
    <div className={`space-y-4 ${className || ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Type className="w-5 h-5 text-blue-500" />
          <span className="text-sm font-semibold text-slate-700">字幕字体</span>
        </div>
        {hasFont && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
          >
            移除
          </button>
        )}
      </div>

      {!hasFont ? (
        <div className="space-y-3">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-sm text-slate-600 mb-3">
              选择自定义字体文件，让字幕更具品牌特色
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowVfsBrowser(true)}
                className="flex-1 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <FileText size={16} />
                从文件库选择
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-green-400 hover:text-green-600 hover:bg-green-50 transition-all flex items-center justify-center gap-2 text-sm font-medium"
              >
                <Upload size={16} />
                导入字体
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FONT_EXTENSIONS.join(',')}
                onChange={handleImportLocal}
                className="hidden"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            支持的格式：TTF、OTF、TTC
          </p>
        </div>
      ) : (
        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Type className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {value.fontName || '自定义字体'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {value.vfsFontPath}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="移除字体"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}

      {/* VFS 浏览器弹窗 */}
      {showVfsBrowser && vfs && (
        <FontVfsBrowser
          vfs={vfs}
          onSelect={handleSelectFromVfs}
          onClose={() => setShowVfsBrowser(false)}
        />
      )}
    </div>
  )
}

/**
 * VFS 字体文件浏览器
 */
function FontVfsBrowser({ vfs, onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState('/字体')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const loadDirectory = async (dirPath) => {
    if (!vfs) return
    setLoading(true)
    try {
      const result = await vfs.listDirectory(dirPath)
      setItems(Array.isArray(result) ? result : [])
    } catch (e) {
      console.error('[FontVfsBrowser] 加载失败:', e)
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

  const isFontFile = (item) => {
    if (item.isDirectory) return false
    return ACCEPTED_FONT_EXTENSIONS.some(ext => item.name.toLowerCase().endsWith(ext))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">选择字体文件</h3>
          <button className="p-2 hover:bg-slate-100 rounded-lg" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg"
            onClick={() => loadDirectory('/字体')}
          >
            字体库
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
              {currentPath === '/字体' ? '暂无字体文件' : '空目录'}
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => (
                <div
                  key={item.path}
                  className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg"
                  onDoubleClick={() => item.isDirectory && loadDirectory(item.path)}
                >
                  <span className="text-lg">{item.isDirectory ? '📁' : '🔤'}</span>
                  <span className="flex-1 text-sm text-slate-700">{item.name}</span>
                  {!item.isDirectory && item.size && (
                    <span className="text-xs text-slate-400">{(item.size / 1024).toFixed(1)} KB</span>
                  )}
                  {!item.isDirectory && isFontFile(item) && (
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