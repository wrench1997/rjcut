import { useState, useEffect, useCallback } from 'react'
import { getSharedFileSystem } from '../src/utils/virtualFileSystem'
import { getBaseUrl, getUpstreamKeys, setUpstreamKeys as persistUpstreamKeys } from '../src/api/api'
import { FolderOpen, Folder, Sparkles, Settings, HelpCircle, Gem, Users, WandSparkles, Book, Scissors, Clapperboard, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Tooltip from '../src/components/Tooltip'

// 导入你的各个组件
import FileBrowser from '../src/components/FileBrowser'
import VideoProjectManager from '../src/components/VideoProjectManager'
import BatchProcessor from '../src/components/BatchProcessor'
import DigitalHumanStudio from '../src/components/DigitalHumanStudio'
import DigitalHumanManager from '../src/components/DigitalHumanManager'
import HelpGuide from '../src/components/HelpGuide'
import AdvancedVideoEditor from '../src/components/AdvancedVideoEditor'
import TextToVideoStudio from '../src/components/TextToVideoStudio'
import OnboardingGuide from '../src/components/OnboardingGuide'
import TemplateBatchPage from '../src/features/template-batch/TemplateBatchPage'
import TemplateManager from '../src/components/TemplateManager'
import useBatchStore from '../src/api/useBatchProcessStore'
import { GlobalTaskProgress } from '../src/components/BatchProgress.jsx'


const DEFAULT_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://112.111.7.91:8801'
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
  const text = await response.text()
  if (!text) {
    throw new Error(`[${response.status}] ${url} 返回空响应，请检查 API 基础地址和端口`)
  }
  let data
  try {
    data = JSON.parse(text)
  } catch (parseErr) {
    throw new Error(`[${response.status}] ${url} 返回非 JSON: ${text.slice(0, 120)}`)
  }
  if (!response.ok) throw new Error(data.message || data.detail || `请求失败 (${response.status})`)
  return data
}

// 导航按“先创作、再管理、后设置”的用户任务分组，避免把不同层级的功能混在一起。
const NAV_SECTIONS = [
  {
    label: '创作工作流',
    items: [
      { id: 'digital-human-studio', label: '数字人创作', icon: Sparkles, tip: '选择数字人和场景，创作专属数字人视频', description: '从数字人、场景和文案开始' },
      { id: 'text-to-video', label: 'AI 视频生成', icon: Clapperboard, tip: '支持文生视频与图片+文字生成视频', description: '生成后自动导入当前项目素材库' },
      { id: 'campaign', label: '模板混剪', icon: WandSparkles, tip: '选择已生成的数字人视频，按模板补充素材自动混剪', description: '将一条视频扩展为多条成片' },
      { id: 'advanced-editor', label: '高级剪辑', icon: Scissors, tip: '像传统剪辑软件一样二次加工视频，并同步保留 JSON 信息', description: '切割、修剪和校准数字人时间轴' },
    ],
  },
  {
    label: '内容管理',
    items: [
      { id: 'projects', label: '项目', icon: FolderOpen, tip: '管理视频项目的进度、配置和输出', description: '按项目查看创作进度' },
      { id: 'files', label: '素材与文件', icon: Folder, tip: '浏览和管理虚拟文件系统中的素材与输出文件', description: '查找具体素材和导出文件' },
      { id: 'digital-human', label: '数字人形象', icon: Users, tip: '管理可复用的数字人形象和身份信息', description: '维护可复用的数字人资产' },
      { id: 'template-manager', label: '模板库', icon: Book, tip: '管理文案模板，支持 AI 自动生成模板和文案', description: '维护可复用的模板和文案' },
    ],
  },
  {
    label: '系统',
    items: [
      { id: 'settings', label: '系统设置', icon: Settings, tip: '配置 API 连接参数和系统偏好设置', description: '连接服务和调整偏好设置' },
    ],
  },
]

const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items)

export default function Home() {
  const [vfs, setVfs] = useState(null)
  const [vfsLoading, setVfsLoading] = useState(true)
  
  const [apiKey, setApiKeyState] = useState(() => 
    typeof window !== 'undefined' ? localStorage.getItem('rjcut_api_key') || DEFAULT_API_KEY : DEFAULT_API_KEY
  )
  const [apiBaseUrl, setApiBaseUrlState] = useState(() => 
    typeof window !== 'undefined' ? getBaseUrl() : DEFAULT_API_BASE_URL
  )
  
  const [activeTab, setActiveTab] = useState('digital-human-studio')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [preselectedPerson, setPreselectedPerson] = useState(null)
  const [advancedEditorRequest, setAdvancedEditorRequest] = useState(null)
  const [fileBrowserPath, setFileBrowserPath] = useState('/') // 文件浏览器目标路径
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [hideGlobalTaskProgress, setHideGlobalTaskProgress] = useState(false)
  const batchTasks = useBatchStore((state) => state.tasks)
  const hasRunningBatch = batchTasks.some((task) => !['succeeded', 'failed', 'cancelled'].includes(task.stage))
  const isFullHeightTab = activeTab === 'digital-human-studio' || activeTab === 'files' || activeTab === 'advanced-editor'
  
  // 从数字人形象管理直接进入创作流程，并带入当前形象。
  const handleCreateVideoFromManager = useCallback((person) => {
    setPreselectedPerson(person)
    setActiveTab('digital-human-studio')
  }, [])

  const handleAdvancedEdit = useCallback((item) => {
    if (!item?.path || item.isDirectory) return
    setAdvancedEditorRequest({ path: item.path, name: item.name, requestedAt: Date.now() })
    setActiveTab('advanced-editor')
  }, [])

  const handleNavigateToFiles = useCallback((target) => {
    const targetPath = typeof target === 'string' ? target : target?.path
    setFileBrowserPath(targetPath || '/')
    setActiveTab('files')
  }, [])

  useEffect(() => {
    // 高级剪辑默认收起外层导航，用户仍可点击左上角按钮恢复。
    setSidebarCollapsed(activeTab === 'advanced-editor')
  }, [activeTab])

  useEffect(() => {
    // 新任务启动后自动恢复全局进度条；用户切换页面时不丢失反馈。
    if (hasRunningBatch) setHideGlobalTaskProgress(false)
  }, [hasRunningBatch])
  const [merchantInfo, setMerchantInfo] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' })
  const [upstreamKeys, setUpstreamKeysState] = useState(() =>
    typeof window !== 'undefined'
      ? getUpstreamKeys()
      : { genvideos: '', chanjing_app_id: '', chanjing_secret: '' }
  )

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShowOnboarding(window.localStorage.getItem('rjcut_onboarding_completed') !== '1')
    }
  }, [])

  const openOnboarding = useCallback(() => {
    setShowHelp(false)
    setShowOnboarding(true)
  }, [])

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
    <aside className={`${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-slate-200 flex flex-col h-screen fixed left-0 top-0 z-40 transition-all duration-200`}>
      <div className={`${sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-5'} h-16 flex items-center border-b border-slate-100`}>
        {sidebarCollapsed ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
            <Scissors size={17} />
          </div>
        ) : (
          <div>
            <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">RJCut Studio</h1>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">视频创作工作台</p>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? '展开导航' : '收起导航'}
          className={`${sidebarCollapsed ? 'hidden' : ''} rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700`}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          title="展开导航"
          className="mx-auto mt-3 rounded-lg p-2 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}
      <nav className={`${sidebarCollapsed ? 'px-2' : 'px-3'} flex-1 overflow-y-auto py-5 custom-scrollbar`}>
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-6 last:mb-0">
            {!sidebarCollapsed && <div className="mb-2 px-3 text-[11px] font-bold tracking-wider text-slate-400">{section.label}</div>}
            <div className="space-y-1">
              {section.items.map(item => {
                const IconComponent = item.icon
                const isActive = activeTab === item.id
                return (
                  <Tooltip key={item.id} tip={item.tip} delay={1000}>
                    <button
                      onClick={() => setActiveTab(item.id)}
                      className={`group w-full rounded-xl py-2.5 text-left transition-all ${sidebarCollapsed ? 'justify-center px-2' : 'px-3'} ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
                        <IconComponent size={18} strokeWidth={isActive ? 2.25 : 2} />
                        {!sidebarCollapsed && <span className="text-sm font-semibold">{item.label}</span>}
                        {!sidebarCollapsed && item.id === 'digital-human-studio' && (
                          <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>开始</span>
                        )}
                      </span>
                      {!sidebarCollapsed && <span className={`mt-1 block pl-[30px] text-[11px] leading-4 ${isActive ? 'text-blue-600/70' : 'text-slate-400 group-hover:text-slate-500'}`}>{item.description}</span>}
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} border-t border-slate-100`}>
        <div className={`${sidebarCollapsed ? 'grid grid-cols-1' : 'grid grid-cols-2'} gap-2`}>
          <button
            onClick={openOnboarding}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-2 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            <Sparkles size={15} />
            {!sidebarCollapsed && '新手教程'}
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-2 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            <HelpCircle size={15} />
            {!sidebarCollapsed && '使用指南'}
          </button>
        </div>
      </div>
    </aside>
  )

  // --- 顶部信息栏 ---
  const Topbar = () => (
    <header style={{ left: sidebarCollapsed ? 64 : 256 }} className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200 fixed top-0 right-0 z-30 flex items-center justify-between px-8 transition-all duration-200">
      <div>
        <h2 className="text-lg font-bold text-slate-800">
          {NAV_ITEMS.find(n => n.id === activeTab)?.label || '控制台'}
        </h2>
        <p className="text-xs text-slate-400">
          {NAV_ITEMS.find(n => n.id === activeTab)?.tip || '开始你的视频创作'}
        </p>
      </div>
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
    <div className={`${isFullHeightTab ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-slate-50 flex`}>
      {activeTab !== 'advanced-editor' && <Sidebar />}
      {activeTab !== 'advanced-editor' && <Topbar />}

      {/* 全局 Toast */}
      {toast.show && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium animate-in slide-in-from-top-4 duration-300 ${
          toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-slate-800 text-white'
        }`}>
          <span>{toast.type === 'error' ? '✕' : '✓'}</span> {toast.msg}
        </div>
      )}

      {showHelp && <HelpGuide onClose={() => setShowHelp(false)} onOpenTutorial={openOnboarding} />}
      {showOnboarding && (
        <OnboardingGuide
          onClose={() => setShowOnboarding(false)}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab !== 'campaign' && !hideGlobalTaskProgress && batchTasks.length > 0 && (
        <GlobalTaskProgress
          tasks={batchTasks}
          onOpen={() => {
            setHideGlobalTaskProgress(false)
            setActiveTab('campaign')
          }}
          onClose={() => setHideGlobalTaskProgress(true)}
        />
      )}

      {/* 主内容区，数字人创作台全屏显示，其他留白 */}
      <main className={`flex-1 transition-all ${activeTab === 'advanced-editor' ? 'ml-0 pt-0' : 'pt-16'} ${activeTab === 'advanced-editor' ? 'p-0 h-screen min-h-0 overflow-hidden' : `${sidebarCollapsed ? 'ml-16' : 'ml-64'} ${isFullHeightTab ? 'p-0 h-screen min-h-0 overflow-hidden' : 'p-8 min-h-screen'}`}`}
      >
        
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
    focusProgress={batchTasks.length > 0}
    onOpenBatchCenter={() => setActiveTab('batch')}
    onStartBatch={async (taskItems) => {
      // 直接调用 BatchProcessor 的 startBatch 逻辑
      // 这里通过事件或 ref 触发，简化起见先存到 localStorage
      localStorage.setItem('rjcut_pending_batch_tasks', JSON.stringify(taskItems))
    }}
  />
)}
{activeTab === 'batch' && <BatchProcessor vfs={vfs} apiKey={apiKey} />}
            {activeTab === 'projects' && (
              <VideoProjectManager
                vfs={vfs}
                onOpenProject={handleNavigateToFiles}
                onNavigate={handleNavigateToFiles}
              />
            )}
            {activeTab === 'files' && (
  <FileBrowser 
    vfs={vfs} 
    initialPath={fileBrowserPath} 
    key={fileBrowserPath} // 路径变化时强制重新渲染组件
    onAdvancedEdit={handleAdvancedEdit}
  />
)}
            
            {activeTab === 'digital-human-studio' && (
  <DigitalHumanStudio 
    apiKey={apiKey} 
    apiBaseUrl={apiBaseUrl} 
    preselectedPerson={preselectedPerson}
    onPreselectedPersonUsed={() => setPreselectedPerson(null)}
    vfs={vfs}
    onNavigateToFiles={handleNavigateToFiles}
  />
)}
            {activeTab === 'text-to-video' && !vfsLoading && vfs && (
              <TextToVideoStudio
                vfs={vfs}
                onNavigateToFiles={handleNavigateToFiles}
              />
            )}
            {activeTab === 'digital-human' && <DigitalHumanManager apiKey={apiKey} apiBaseUrl={apiBaseUrl} vfs={vfs} onCreateVideo={handleCreateVideoFromManager} />}
            {activeTab === 'template-manager' && <TemplateManager />}
            {activeTab === 'advanced-editor' && !vfsLoading && vfs && (
              <AdvancedVideoEditor
                vfs={vfs}
                initialMediaRequest={advancedEditorRequest}
                onExitFocusMode={() => {
                  setActiveTab('digital-human-studio')
                }}
              />
            )}
            
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
                    <div className="border-t border-slate-200 pt-5 mt-5">
                      <h4 className="text-sm font-bold text-slate-800 mb-3">上游服务 Key</h4>
                      <p className="text-xs text-slate-500 mb-4">各上游尚未统一管控，在此填写各自的 Key，保存后随请求透传给后端；未填则后端回退服务器环境变量。</p>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">GenVideos API Key（视频 + 文案共用）</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={upstreamKeys.genvideos}
                            onChange={(e) => setUpstreamKeysState({ ...upstreamKeys, genvideos: e.target.value })}
                            placeholder="在上游管控台 112.111.7.91:7980/admin 获取"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">蝉镜 App ID（数字人）</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={upstreamKeys.chanjing_app_id}
                            onChange={(e) => setUpstreamKeysState({ ...upstreamKeys, chanjing_app_id: e.target.value })}
                            placeholder="itop"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">蝉镜 Secret Key（数字人）</label>
                          <input
                            type="text"
                            className="w-full bg-white border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            value={upstreamKeys.chanjing_secret}
                            onChange={(e) => setUpstreamKeysState({ ...upstreamKeys, chanjing_secret: e.target.value })}
                            placeholder=""
                          />
                        </div>
                      </div>
                    </div>
                    <Tooltip tip="保存 API 配置并测试连接是否成功" delay={1000}>
                      <button 
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        onClick={() => {
                          persistUpstreamKeys(upstreamKeys);
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
