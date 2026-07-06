/**
 * 批量任务进度显示组件
 * 从 BatchProcessor.jsx 提取，供 TemplateBatchPage 等复用
 */
import { useState, useEffect } from 'react'
import { Hourglass, Upload, FileText, Clapperboard, Download, CheckCircle, XCircle, Ban, Inbox, X, Folder, FileText as FileTextIcon } from 'lucide-react'

import Tooltip from './Tooltip'

// --- 现代化进度条 ---
export function TailwindProgressBar({ progress, status }) {
  const colors = {
    uploading: 'bg-blue-500',
    drafting: 'bg-indigo-500',
    composing: 'bg-amber-500',
    downloading: 'bg-green-500',
    succeeded: 'bg-green-500',
    failed: 'bg-red-500',
    cancelled: 'bg-slate-400',
    idle: 'bg-slate-300'
  }
  return (
    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-3">
      <div 
        className={`h-full transition-all duration-300 ease-out ${colors[status] || 'bg-blue-500'}`}
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  )
}

// =====================================================
// 最小化进度悬浮窗 (右下角)
// =====================================================
export function MinimizedProgress({ tasks, onExpand, onClose }) {
  if (tasks.length === 0) return null

  const runningCount = tasks.filter(t => t.stage !== 'done' && t.stage !== 'failed' && t.stage !== 'cancelled').length
  const successCount = tasks.filter(t => t.stage === 'done').length
  const failedCount = tasks.filter(t => t.stage === 'failed').length
  const allDone = runningCount === 0

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-2">
      {/* 关闭按钮 */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="bg-slate-200 hover:bg-slate-300 text-slate-600 rounded-full p-1.5 transition-colors shadow-lg"
        title="关闭进度查看"
      >
        <X size={16} />
      </button>
      {/* 进度悬浮球 */}
      <div 
        className={`bg-white rounded-full shadow-2xl border-2 cursor-pointer transition-all duration-300 hover:scale-105 ${
          allDone ? 'border-green-500' : 'border-blue-500 animate-pulse'
        }`}
        onClick={onExpand}
        style={{ width: '64px', height: '64px' }}
      >
        <div className="w-full h-full flex flex-col items-center justify-center">
          <Inbox size={20} className={allDone ? 'text-green-500' : 'text-blue-500'} />
          <span className={`text-xs font-bold ${allDone ? 'text-green-600' : 'text-blue-600'}`}>
            {runningCount > 0 ? runningCount : (failedCount > 0 ? '!' : '✓')}
          </span>
        </div>
      </div>
      {/* 简单状态提示 */}
      <div className="absolute bottom-full right-0 mb-2 bg-slate-800 text-white px-3 py-2 rounded-lg text-xs whitespace-nowrap shadow-lg">
        {allDone ? (
          <span>✓ 全部完成 ({successCount}/{tasks.length})，点击展开查看详情</span>
        ) : (
          <span>⟳ 进行中：{runningCount} 个任务，点击展开查看详情</span>
        )}
        <div className="absolute top-full right-4 mt-1 border-4 border-transparent border-t-slate-800"></div>
      </div>
    </div>
  )
}

// --- 任务卡片组件 ---
export function TaskCard({ task, vfs }) {
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [savedVideoPath, setSavedVideoPath] = useState(null)
  const [showPlayer, setShowPlayer] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  
  // 加载视频并创建 URL
  useEffect(() => {
    let blobUrl = null
    
    const loadVideo = async () => {
      if (!savedVideoPath || !vfs || !showPlayer) {
        setVideoUrl(null)
        return
      }
      
      try {
        const blob = await vfs.readFileAsBlob(savedVideoPath)
        
        if (blob.size === 0) {
          setVideoUrl(null)
          return
        }
        
        blobUrl = URL.createObjectURL(blob)
        setVideoUrl(blobUrl)
      } catch (error) {
        console.error('[TaskCard] 加载视频失败:', error)
        setVideoUrl(null)
      }
    }
    
    loadVideo()
    
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
      setVideoUrl(null)
    }
  }, [savedVideoPath, vfs, showPlayer])
  
  const stageLabels = {
    idle: '等待中',
    uploading: '上传中',
    drafting: '草稿生成中',
    composing: '视频合成中',
    downloading: '下载中',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
  }

  const stageIcons = {
    idle: Hourglass,
    uploading: Upload,
    drafting: FileText,
    composing: Clapperboard,
    downloading: Download,
    succeeded: CheckCircle,
    failed: XCircle,
    cancelled: Ban,
  }

  const handleDownload = async (saveToVFS = true) => {
    // 简化版本：仅显示提示
    alert('下载功能：请前往批量处理页面下载')
  }

  const StageIcon = stageIcons[task.stage] || Hourglass

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
      {/* 任务头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <StageIcon size={18} className={
            task.stage === 'succeeded' ? 'text-green-500' :
            task.stage === 'failed' ? 'text-red-500' :
            task.stage === 'cancelled' ? 'text-slate-400' :
            'text-blue-500 animate-pulse'
          } />
          <div>
            <h4 className="font-semibold text-slate-800 text-sm">{task.displayName || task.id}</h4>
            <p className="text-xs text-slate-500">{stageLabels[task.stage]}</p>
          </div>
        </div>
        {task.stage === 'succeeded' && savedVideoPath && (
          <button
            onClick={() => setShowPlayer(!showPlayer)}
            className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 rounded transition-colors"
          >
            {showPlayer ? '隐藏' : '预览'}
          </button>
        )}
      </div>

      {/* 进度条 */}
      <TailwindProgressBar progress={task.progress} status={task.stage} />

      {/* 错误信息 */}
      {task.stage === 'failed' && task.error && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          {task.error}
        </div>
      )}

      {/* 视频预览 */}
      {showPlayer && videoUrl && (
        <div className="mt-3">
          <video 
            src={videoUrl} 
            controls 
            className="w-full rounded-lg bg-slate-100"
            onPlay={() => console.log('[TaskCard] 视频开始播放')}
            onError={(e) => console.error('[TaskCard] 视频播放失败:', e)}
          />
        </div>
      )}

      {/* 操作按钮 */}
      {task.stage === 'succeeded' && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => handleDownload(true)}
            className="flex-1 px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors flex items-center justify-center gap-1"
          >
            <Download size={12} />
            保存到项目
          </button>
        </div>
      )}
    </div>
  )
}

// --- 统计卡片组件 ---
export function StatCard({ label, value, colorClass }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 text-center hover:shadow-sm transition-shadow">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
    </div>
  )
}