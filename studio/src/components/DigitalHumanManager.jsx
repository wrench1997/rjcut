import { useState, useEffect, useCallback, useRef } from 'react'
import { User, Video, Trash2, Download, RefreshCw, Sparkles, History, AlertCircle } from 'lucide-react'
import {
  getCommonPersons,
  getCustomPersons,
  getCustomPersonDetail,
  syncCustomPersons,
  deleteCustomPerson,
  getVoices,
  createDhGenerateTask,
  createDhPersonTask,
  getDhTaskList,
  deleteDhVideoTask,
  getDhVideoUrl
} from '../api/api'

// --- 现代化的 Badge 组件 ---
function StatusBadge({ status }) {
  const statusMap = {
    10: { label: '训练中', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    30: { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200' },
    40: { label: '失败', color: 'bg-red-100 text-red-700 border-red-200' },
    0: { label: '定制中', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    1: { label: '制作中', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    2: { label: '已完成', color: 'bg-green-100 text-green-700 border-green-200' },
    4: { label: '失败', color: 'bg-red-100 text-red-700 border-red-200' },
  }
  const { label, color } = statusMap[status] || { label: '未知', color: 'bg-slate-100 text-slate-600 border-slate-200' }
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${color}`}>{label}</span>
}

// --- 现代化的数字人卡片 ---
function DigitalPersonCard({ person, isCustom, onSelect, onCreateVideo, onDelete, onRefresh }) {
  const [loading, setLoading] = useState(false)
  const detail = person

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!confirm(`确定要删除 "${person.name}" 吗？`)) return
    try { 
      await deleteCustomPerson(person.id)
      onDelete && onDelete(person.id) 
    } catch (err) { 
      alert(`删除失败：${err.message}`) 
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all duration-300 group flex flex-col">
      <div className="relative aspect-[4/5] bg-slate-100 overflow-hidden cursor-pointer" onClick={() => onCreateVideo(person)}>
        {person.cover_url ? (
          <img src={person.cover_url} alt={person.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <User size={64} strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
          <button className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
            <Sparkles size={16} strokeWidth={2} />
            创作视频
          </button>
        </div>
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-bold text-slate-800 line-clamp-1">{person.name}</h3>
          {isCustom && <StatusBadge status={person.status} />}
        </div>
        <div className="space-y-1 text-xs text-slate-500 mb-4 flex-1">
          <p>ID: {person.id}</p>
          {person.figure_type && <p>形象：{person.figure_type}</p>}
        </div>
        
        <div className="flex gap-2 pt-3 border-t border-slate-100">
          <button onClick={() => onSelect(person)} className="flex-1 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-md transition-colors border border-slate-200 flex items-center justify-center gap-1">
            <History size={14} strokeWidth={2} />
            历史视频
          </button>
          {isCustom && (
            <button onClick={handleDelete} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors border border-transparent hover:border-red-100" title="删除">
              <Trash2 size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// --- 视频任务状态徽章 ---
function VideoTaskStatusBadge({ status }) {
  const statusMap = {
    queued: { label: '等待中', color: 'bg-slate-100 text-slate-600' },
    processing: { label: '处理中', color: 'bg-blue-100 text-blue-700' },
    succeeded: { label: '成功', color: 'bg-green-100 text-green-700' },
    failed: { label: '失败', color: 'bg-red-100 text-red-700' },
    cancelled: { label: '已取消', color: 'bg-slate-200 text-slate-500' },
    timeout: { label: '超时', color: 'bg-red-100 text-red-700' },
  }
  const { label, color } = statusMap[status] || { label: '未知', color: 'bg-slate-100 text-slate-600' }
  return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${color}`}>{label}</span>
}

// --- 视频任务列表组件 ---
function VideoTaskList({ onBack, selectedPersonId = null, personName = '', onCreateNew }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [downloadingTaskId, setDownloadingTaskId] = useState(null)

  const loadTasks = async () => {
    setLoading(true)
    try {
      const res = await getDhTaskList(null, 100, 0, selectedPersonId)
      if (res.data.code === 0) {
        const dhTasks = (res.data.data.items || []).filter(t => t.task_type === 'dh_generate')
        setTasks(dhTasks)
      }
    } catch (err) {
      console.error('加载任务列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const handleDownload = async (task) => {
    setDownloadingTaskId(task.task_id)
    try {
      const res = await getDhVideoUrl(task.task_id)
      if (res.data.code === 0) {
        window.open(res.data.data.download_url, '_blank')
      } else {
        alert(`获取下载链接失败：${res.data.message}`)
      }
    } catch (err) {
      alert(`获取下载链接失败：${err.message}`)
    } finally {
      setDownloadingTaskId(null)
    }
  }

  const handleDelete = async (task) => {
    if (!confirm(`确定要删除视频任务 "${task.task_id}" 吗？`)) return
    try {
      await deleteDhVideoTask(task.task_id)
      alert('任务已删除，配额已退还')
      loadTasks()
    } catch (err) {
      alert(`删除失败：${err.message}`)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {personName ? `${personName} - 批量视频` : '视频任务列表'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {personName ? '查看该数字人生成的所有视频' : '查看和管理已生成的数字人视频任务'}
          </p>
        </div>
        <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-colors" onClick={onBack}>
          ← 返回
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">任务 ID</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">状态</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">进度</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">创建时间</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    暂无视频任务
                  </td>
                </tr>
              ) : (
                tasks.map(task => (
                  <tr key={task.task_id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-mono text-slate-700">
                      {task.task_id.substring(0, 16)}...
                      {task.client_ref_id && <div className="text-xs text-slate-400">参考：{task.client_ref_id}</div>}
                    </td>
                    <td className="px-6 py-4">
                      <VideoTaskStatusBadge status={task.status} />
                    </td>
                    <td className="px-6 py-4">
                      {(task.status === 'processing' || task.status === 'queued') ? (
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${task.progress || 0}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{task.progress || 0}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {task.created_at ? new Date(task.created_at).toLocaleString('zh-CN') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {task.status === 'succeeded' && (
                          <button
                            className="px-3 py-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-md transition-colors border border-green-200"
                            onClick={() => handleDownload(task)}
                            disabled={downloadingTaskId === task.task_id}
                          >
                            {downloadingTaskId === task.task_id ? (
                            <span className="flex items-center gap-1">
                              <RefreshCw size={14} strokeWidth={2} className="animate-spin" />
                              下载中
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Download size={14} strokeWidth={2} />
                              下载
                            </span>
                          )}
                          </button>
                        )}
                        <button
                          className="px-3 py-1 text-red-600 hover:bg-red-50 text-xs font-medium rounded-md transition-colors flex items-center gap-1"
                          onClick={() => handleDelete(task)}
                        >
                          <Trash2 size={14} strokeWidth={2} />
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// 主组件
export default function DigitalHumanManager({ apiKey }) {
  const [activeTab, setActiveTab] = useState('common')
  const [commonPersons, setCommonPersons] = useState([])
  const [customPersons, setCustomPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState(null)
  
  const isMountedRef = useRef(true)
  const hasLoadedDataRef = useRef(false)

  const loadData = useCallback(async () => {
    if (hasLoadedDataRef.current) return
    hasLoadedDataRef.current = true
    
    setLoading(true)
    try {
      const commonRes = await getCommonPersons()
      if (commonRes.data.code === 0 && isMountedRef.current) {
        setCommonPersons(commonRes.data.data || [])
      }
      
      const customRes = await getCustomPersons()
      if (customRes.data.code === 0 && isMountedRef.current) {
        setCustomPersons(customRes.data.data || [])
      }
      
      const voicesRes = await getVoices()
      if (voicesRes.data.code === 0 && isMountedRef.current) {
        setVoices(voicesRes.data.data || [])
      }
    } catch (err) {
      console.error('加载数据失败:', err)
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  const handleSync = async () => {
    setLoading(true)
    try {
      const res = await syncCustomPersons()
      if (res.data.code === 0) {
        alert(`已同步 ${res.data.data.synced_count} 个数字人`)
        loadData()
      }
    } catch (err) {
      alert(`同步失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePerson = useCallback((personId) => {
    setCustomPersons(prev => prev.filter(p => p.id !== personId))
  }, [])

  const handleSelectPerson = useCallback((person) => {
    setSelectedPerson(person)
    setActiveTab('video-tasks')
  }, [])

  const handleVideoTaskCreated = useCallback((taskData) => {
    if (taskData.count) {
      alert(`成功创建 ${taskData.count} 个视频任务`)
    } else {
      alert(`视频任务已创建：${taskData.task_id}`)
    }
    setActiveTab('video-tasks')
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">数字人资产库</h2>
          <p className="text-sm text-slate-500 mt-1">管理、训练和使用您的数字人模型</p>
        </div>
      </div>

      {/* 现代化 Tab 切换 */}
      <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200 w-fit">
        {[
          { id: 'common', label: '平台数字人' },
          { id: 'custom', label: '我的定制' },
          { id: 'video-tasks', label: '视频产物' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === tab.id 
                ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {activeTab === 'custom' && (
          <button
            className="ml-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            onClick={handleSync}
            disabled={loading}
          >
            {loading ? (
            <span className="flex items-center gap-2">
              <RefreshCw size={16} strokeWidth={2} className="animate-spin" />
              同步中
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <RefreshCw size={16} strokeWidth={2} />
              同步
            </span>
          )}
          </button>
        )}
      </div>

      {/* 列表渲染区 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
        {activeTab === 'common' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {commonPersons.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
                <span className="text-4xl mb-4">📭</span>
                <p>暂无公共数字人</p>
              </div>
            ) : (
              commonPersons.map(p => (
                <DigitalPersonCard 
                  key={p.id} 
                  person={p} 
                  isCustom={false} 
                  onSelect={handleSelectPerson}
                  onCreateVideo={(person) => {
                    setSelectedPerson(person)
                    // TODO: 打开创作表单
                  }}
                />
              ))
            )}
          </div>
        )}
        
        {activeTab === 'custom' && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {/* 新建卡片 */}
            <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-all aspect-[4/5] min-h-[300px]">
              <span className="text-4xl mb-2">+</span>
              <span className="text-sm font-medium">训练新数字人</span>
            </div>
            {customPersons.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-slate-500">
                <span className="text-4xl mb-4">📭</span>
                <p>暂无自定义数字人</p>
              </div>
            ) : (
              customPersons.map(p => (
                <DigitalPersonCard 
                  key={p.id} 
                  person={p} 
                  isCustom={true} 
                  onSelect={handleSelectPerson}
                  onCreateVideo={(person) => {
                    setSelectedPerson(person)
                    // TODO: 打开创作表单
                  }}
                  onDelete={handleDeletePerson}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'video-tasks' && (
          <VideoTaskList 
            onBack={() => {
              setActiveTab('common')
              setSelectedPerson(null)
            }}
            selectedPersonId={selectedPerson?.id}
            personName={selectedPerson?.name}
          />
        )}
      </div>
    </div>
  )
}