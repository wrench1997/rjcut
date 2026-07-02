import { useState, useEffect, useCallback, useRef } from 'react'
import { getSharedFileSystem } from '../src/utils/virtualFileSystem'
import { setApiKey } from '../src/api/api'
import { FolderOpen, Folder, Layers, Sparkles, Settings, HelpCircle, Gem, Users, Scissors, WandSparkles, Book } from 'lucide-react'
import Tooltip from '../src/components/Tooltip'

// 导入你的各个组件
import FileBrowser from '../src/components/FileBrowser'
import VideoProjectManager from '../src/components/VideoProjectManager'
import BatchProcessor from '../src/components/BatchProcessor'
import DigitalHumanStudio from '../src/components/DigitalHumanStudio'
import DigitalHumanManager from '../src/components/DigitalHumanManager'
import HelpGuide from '../src/components/HelpGuide'
import AdvancedVideoEditor from '../src/components/AdvancedVideoEditor'
import TemplateBatchPage from '../src/features/template-batch/TemplateBatchPage'
import TemplateManager from '../src/components/TemplateManager'


const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'
const DEFAULT_API_KEY = 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC'

const apiRequest = async (endpoint, options = {}, apiKey = DEFAULT_API_KEY, baseUrl = DEFAULT_API_BASE_URL) => {
  const url = `${baseUrl}${endpoint}`
  const config = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  }
  const response = await fetch(url, config)
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '请求失败')
  return data
}

// 导航菜单配置
const NAV_ITEMS = [
  // { id: 'campaign', label: '模板混剪', icon: WandSparkles, tip: '选择已生成的数字人视频，按模板补充素材自动混剪' }, // 老模板，已屏蔽
  // { id: 'batch', label: '任务执行中心', icon: Layers, tip: '批量上传视频或指定参数，并行处理多个生成任务' }, // 老模板，已屏蔽
  { id: 'projects', label: '项目管理', icon: FolderOpen, tip: '管理您的视频项目，创建、编辑和删除项目' },
  { id: 'files', label: '文件浏览', icon: Folder, tip: '浏览和管理虚拟文件系统中的所有文件' },
  
  { id: 'digital-human-studio', label: '数字人创作平台', icon: Sparkles, tip: '选择数字人和场景，创作专属数字人视频' },
  { id: 'digital-human', label: '数字人管理', icon: Users, tip: '管理数字人形象，查看已创建的 digital human' },
  { id: 'template-manager', label: '模板管理', icon: Book, tip: '管理文案模板，支持 AI 自动生成模板和文案' },
  // { id: 'advanced-editor', label: '高级剪辑', icon: Scissors, tip: '专业视频剪辑功能：多轨道编辑、分割、修剪、淡入淡出' }, // 未完成，已屏蔽
  { id: 'settings', label: '系统设置', icon: Settings, tip: '配置 API 连接参数和系统偏好设置' },
]

export default function Home() {
  const [vfs, setVfs] = useState(null)
  const [vfsLoading, setVfsLoading] = useState(true)
  
  const [apiKey, setApiKeyState] = useState(() => 
    typeof window !== 'undefined' ? localStorage.getItem('rjcut_api_key') || DEFAULT_API_KEY : DEFAULT_API_KEY
  )
  const [apiBaseUrl, setApiBaseUrlState] = useState(() => 
    typeof window !== 'undefined' ? localStorage.getItem('rjcut_api_base_url') || DEFAULT_API_BASE_URL : DEFAULT_API_BASE_URL
  )
  
  const [activeTab, setActiveTab] = useState('batch')
  const [preselectedPerson, setPreselectedPerson] = useState(null)
  const [fileBrowserPath, setFileBrowserPath] = useState('/') // 文件浏览器目标路径
  
  // 🔴 处理数字人管理平台的创作视频回调
  const handleCreateVideoFromManager = useCallback((person) => {
    console.log('========================================')
    console.log('[index.js] ✅ 收到 onCreateVideo 回调，数字人:', person.name, person.id)
    console.log('[index.js] 🚀 设置预选数字人:', person.id)
    setPreselectedPerson(person)
    console.log('[index.js] 🚀 切换到 digital-human-studio')
    setActiveTab('digital-human-studio')
    console.log('[index.js] ✅ 已切换到 digital-human-studio')
    console.log('========================================')
  }, [])
  const [merchantInfo, setMerchantInfo] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' })

  const showToast = (msg, type = 'success') => {
    setToast({ show: true, msg, type })
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 3000)
  }

  useEffect(() => {
    const initVFS = async () => {
      try {
        const sharedVfs = await getSharedFileSystem()
        setVfs(sharedVfs)
      } catch (e) {
        showToast(`文件系统初始化失败：${e.message}`, 'error')
      } finally {
        setVfsLoading(false)
      }
    }
    initVFS()
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rjcut_api_key', apiKey)
      localStorage.setItem('rjcut_api_base_url', apiBaseUrl)
    }
  }, [apiKey, apiBaseUrl])

  const fetchMerchantInfo = useCallback(async () => {
    try {
      const res = await apiRequest('/v1/merchant/info', {}, apiKey, apiBaseUrl)
      setMerchantInfo(res.data)
    } catch (err) {
      console.error('获取商户信息失败:', err)
    }
  }, [apiKey, apiBaseUrl])

  useEffect(() => {
    // 只在 API 服务可用时获取商户信息
    fetchMerchantInfo().catch(err => {
      console.warn('API 服务未启动，跳过商户信息获取:', err.message)
    })
  }, [fetchMerchantInfo])

  // --- 侧边栏 ---
  const Sidebar = () => (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-40">
      <div className="h-16 flex items-center px-6 border-b border-slate-100">
        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
          RJCut Studio
        </h1>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
        {NAV_ITEMS.map(item => {
          const IconComponent = item.icon
          return (
            <Tooltip key={item.id} tip={item.tip} delay={1000}>
              <button
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all ${
                  activeTab === item.id 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <IconComponent size={18} strokeWidth={2} />
                <span className="text-sm">{item.label}</span>
              </button>
            </Tooltip>
          )
        })}
      </nav>
      <div className="p-4 border-t border-slate-100">
        <Tooltip tip="查看系统使用帮助和快捷键说明" delay={1000}>
          <button 
            onClick={() => setShowHelp(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <HelpCircle size={18} strokeWidth={2} />
            <span>帮助指南</span>
          </button>
        </Tooltip>
      </div>
    </aside>
  )

  // --- 顶部信息栏 ---
  const Topbar = () => (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 fixed top-0 right-0 left-64 z-30 flex items-center justify-between px-8">
      <h2 className="text-lg font-bold text-slate-800">
        {NAV_ITEMS.find(n => n.id === activeTab)?.label || '控制台'}
      </h2>
      <div className="flex items-center gap-4">
        {merchantInfo && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
            <Gem size={14} className="text-blue-500" />
            <span className="text-xs font-semibold text-blue-700">配额：{merchantInfo.quota_available} / {merchantInfo.quota_total}</span>
          </div>
        )}
      </div>
    </header>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <Topbar />

      {/* 全局 Toast */}
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top-4 duration-300 ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-slate-800 text-white'
        }`}>
          <span>{toast.type === 'error' ? '✕' : '✓'}</span> {toast.msg}
        </div>
      )}

      {showHelp && <HelpGuide onClose={() => setShowHelp(false)} />}

      {/* 主内容区，数字人创作台全屏显示，其他留白 */}
      <main className={`flex-1 transition-all pt-16 ml-64 ${activeTab === 'digital-human-studio' || activeTab === 'files' ? 'p-0 h-[calc(100vh-64px)]' : 'p-8 min-h-screen'}`}>
        
        {vfsLoading && activeTab !== 'settings' && activeTab !== 'digital-human-studio' ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            正在初始化文件系统...
          </div>
        ) : (
          <>
            {activeTab === 'campaign' && (
  <TemplateBatchPage
    vfs={vfs}
    apiKey={apiKey}
    onOpenBatchCenter={() => setActiveTab('batch')}
    onStartBatch={async (taskItems) => {
      // 直接调用 BatchProcessor 的 startBatch 逻辑
      // 这里通过事件或 ref 触发，简化起见先存到 localStorage
      localStorage.setItem('rjcut_pending_batch_tasks', JSON.stringify(taskItems))
    }}
  />
)}
{activeTab === 'batch' && <BatchProcessor vfs={vfs} apiKey={apiKey} />}
            {activeTab === 'projects' && <VideoProjectManager vfs={vfs} onOpenProject={() => setActiveTab('files')} onNavigate={() => setActiveTab('files')} />}
            {activeTab === 'files' && (
  <FileBrowser 
    vfs={vfs} 
    initialPath={fileBrowserPath} 
    key={fileBrowserPath} // 路径变化时强制重新渲染组件
  />
)}
            
            {activeTab === 'digital-human-studio' && (
  <DigitalHumanStudio 
    apiKey={apiKey} 
    apiBaseUrl={apiBaseUrl} 
    preselectedPerson={preselectedPerson}
    onPreselectedPersonUsed={() => setPreselectedPerson(null)}
    vfs={vfs}
    onNavigateToFiles={(targetPath) => {
      setFileBrowserPath(targetPath)
      setActiveTab('files')
    }}
  />
)}
            {activeTab === 'digital-human' && <DigitalHumanManager apiKey={apiKey} apiBaseUrl={apiBaseUrl} onCreateVideo={handleCreateVideoFromManager} />}
            {activeTab === 'template-manager' && <TemplateManager />}
            {activeTab === 'advanced-editor' && !vfsLoading && vfs && <AdvancedVideoEditor vfs={vfs} />}
            
            {activeTab === 'settings' && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-800">API 连接设置</h3>
                  </div>
                  <div className="p-6 space-y-5">
                    <div>
                      <Tooltip tip="您的 API 密钥，用于身份验证和配额管理" delay={1000}>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">API Key</label>
                      </Tooltip>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        value={apiKey}
                        onChange={(e) => setApiKeyState(e.target.value)}
                        placeholder="输入您的 API Key"
                      />
                    </div>
                    <div>
                      <Tooltip tip="API 服务器的基础 URL 地址" delay={1000}>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">API 基础地址</label>
                      </Tooltip>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                        value={apiBaseUrl}
                        onChange={(e) => setApiBaseUrlState(e.target.value)}
                      />
                    </div>
                    <Tooltip tip="保存 API 配置并测试连接是否成功" delay={1000}>
                      <button 
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        onClick={() => {
                          fetchMerchantInfo();
                          showToast('已保存并尝试连接');
                        }}
                      >
                        保存并测试连接
                      </button>
                    </Tooltip>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}