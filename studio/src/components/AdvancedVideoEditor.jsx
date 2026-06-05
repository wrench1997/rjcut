import React, { useEffect, useState } from 'react'
import { useTimelineStore } from '../stores/timelineStore'
import { Film, Zap } from 'lucide-react'

// 导入子组件
import MediaLibraryVFS from './VideoEditor/MediaLibraryVFS'
import ExportPanelVFS from './VideoEditor/ExportPanelVFS'
import VideoPreview from './VideoEditor/VideoPreview'
import Timeline from './VideoEditor/Timeline'



/**
 * 高级视频剪辑台主容器
 * 将 video-editor 作为独立 Tab 嵌入 rjcut
 * 使用局部暗黑模式主题隔离
 */
export default function AdvancedVideoEditor({ vfs }) {
  const { isWasmReady, initWasm } = useTimelineStore()
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    // 初始化 WASM 引擎
    const init = async () => {
      try {
        await initWasm()
      } catch (err) {
        console.error('[AdvancedVideoEditor] WASM 初始化失败:', err)
      } finally {
        setIsBooting(false)
      }
    }
    init()
  }, [initWasm])

  if (isBooting) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-slate-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-lg font-semibold">正在加载视频处理引擎...</p>
          <p className="text-sm text-slate-400 mt-2">首次加载可能需要几秒钟</p>
        </div>
      </div>
    )
  }

  return (
    // 使用 video-editor-theme 隔离暗色工业风主题
    <div className="video-editor-theme flex flex-col overflow-hidden no-select w-full h-full text-slate-200" style={{ background: '#0a0a0f' }}>
      
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Film size={16} className="text-white" />
          </div>
          <span className="font-bold text-sm text-slate-100">WASM 高级剪辑</span>
          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isWasmReady ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
          }`}>
            <Zap size={10} /> 
            {isWasmReady ? '引擎就绪' : '初始化中'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">1920x1080 @ 30fps</span>
        </div>
      </header>

      {/* 核心工作区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左：VFS 媒体库 */}
        <aside className="w-[280px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-[#13131f]">
          <MediaLibraryVFS vfs={vfs} />
        </aside>

        {/* 中：预览 + 时间轴 */}
        <main className="flex flex-col flex-1 overflow-hidden">
          {/* 预览区 */}
          <div className="border-b border-slate-800 bg-black flex items-center justify-center relative" style={{ height: '45%', minHeight: 240 }}>
            <VideoPreview />
          </div>
          
          {/* 时间轴区 */}
          <div className="flex-1 overflow-hidden bg-[#07070a]">
            <Timeline />
          </div>
        </main>

        {/* 右：导出与属性面板 */}
        <aside className="w-[280px] flex-shrink-0 flex flex-col border-l border-slate-800 bg-[#13131f]">
          <ExportPanelVFS vfs={vfs} />
        </aside>
      </div>
    </div>
  )
}