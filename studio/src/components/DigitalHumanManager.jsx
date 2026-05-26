import { useState, useEffect, useCallback } from 'react'
import {
  getCommonPersons,
  getCustomPersons,
  getCustomPersonDetail,
  syncCustomPersons,
  deleteCustomPerson,
  getVoices,
  deleteVoice,
  createDhGenerateTask,
  createDhPersonTask,
  deleteDhTask,
  presignUpload,
  confirmUpload,
  getTaskStatus,
  getDhTaskList,
  getDhTaskDetail,
  deleteDhVideoTask,
  getDhVideoUrl
} from '../api/api'


// =====================================================
// 状态徽章组件
// =====================================================
function StatusBadge({ status }) {
  // 状态码说明：
  // 蝉镜 API: 0=定制中，1=制作中，2=成功，4=失败
  // 本地映射：10=训练中，30=成功，40=失败
  const statusMap = {
    // 本地状态码
    10: { label: '训练中', class: 'status-processing' },
    30: { label: '成功', class: 'status-succeeded' },
    40: { label: '失败', class: 'status-failed' },
    // 蝉镜 API 原始状态码（用于直接显示 API 返回的状态）
    0: { label: '定制中', class: 'status-processing' },
    1: { label: '制作中', class: 'status-processing' },
    2: { label: '已完成', class: 'status-succeeded' },
    4: { label: '失败', class: 'status-failed' },
  }
  
  const { label, class: className } = statusMap[status] || { label: '未知', class: 'status-queued' }
  
  return (
    <span className={`status-badge ${className}`}>
      {label}
    </span>
  )
}

// =====================================================
// 进度条组件
// =====================================================
function ProgressBar({ progress }) {
  return (
    <div className="progress-bar">
      <div 
        className="progress-bar-fill" 
        style={{ width: `${Math.min(progress, 100)}%` }}
      />
    </div>
  )
}

// =====================================================
// 数字人卡片组件
// =====================================================
function DigitalPersonCard({ person, isCustom, onSelect, onDelete, onRefresh }) {
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState(null)

  const handleRefresh = async () => {
    if (!isCustom) return
    setLoading(true)
    try {
      const res = await getCustomPersonDetail(person.id)
      if (res.data.code === 0) {
        setDetail(res.data.data)
        onRefresh && onRefresh(person.id)
      }
    } catch (err) {
      console.error('获取详情失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`确定要删除数字人"${person.name}"吗？此操作不可恢复。`)) return
    
    try {
      await deleteCustomPerson(person.id)
      onDelete && onDelete(person.id)
    } catch (err) {
      alert(`删除失败：${err.message}`)
    }
  }

  const displayDetail = detail || person
  const hasCover = displayDetail.cover_url || person.cover_url

  return (
    <div className="card mb-md" style={{ maxWidth: '400px' }}>
      {hasCover ? (
        <img 
          src={displayDetail.cover_url || person.cover_url} 
          alt={person.name}
          style={{ 
            width: '100%', 
            height: '200px', 
            objectFit: 'cover',
            borderRadius: 'var(--rounded-lg)',
            marginBottom: 'var(--spacing-md)'
          }}
        />
      ) : (
        <div 
          style={{ 
            width: '100%', 
            height: '200px', 
            backgroundColor: 'var(--surface-pearl)',
            borderRadius: 'var(--rounded-lg)',
            marginBottom: 'var(--spacing-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <span className="text-muted" style={{ fontSize: '48px' }}>👤</span>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-sm">
        <h3 className="body-strong">{person.name}</h3>
        {isCustom && <StatusBadge status={displayDetail.status || person.status} />}
      </div>
      
      {isCustom && displayDetail.progress !== undefined && (
        <div className="mb-sm">
          <div className="flex justify-between items-center mb-xs">
            <span className="caption text-muted">训练进度</span>
            <span className="caption-strong">{displayDetail.progress}%</span>
          </div>
          <ProgressBar progress={displayDetail.progress} />
        </div>
      )}
      
      {displayDetail.video_url && (
        <div className="mb-sm">
          <a 
            href={displayDetail.video_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="caption text-primary"
          >
            🎬 查看示例视频
          </a>
        </div>
      )}
      
      {person.preview_video_url && (
        <div className="mb-sm">
          <a 
            href={person.preview_video_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="caption text-primary"
          >
            ▶️ 查看预览视频
          </a>
        </div>
      )}
      
      <div className="caption text-muted mb-sm">
        <div>ID: {person.id}</div>
        {person.figure_type && (
          <div>🎭 形象：{person.figure_type}</div>
        )}
        {displayDetail.audio_man_id && (
          <div>🎤 声音 ID: {displayDetail.audio_man_id}</div>
        )}
        {person.created_at && (
          <div>📅 {new Date(person.created_at).toLocaleString('zh-CN')}</div>
        )}
      </div>
      
      <div className="flex gap-sm flex-wrap">
        <button 
          className="btn btn-primary btn-sm"
          onClick={() => onSelect && onSelect(person)}
        >
          使用此数字人
        </button>
        
        {isCustom && (
          <>
            <button 
              className="btn btn-pearl-capsule btn-sm"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? '🔄 刷新中' : '🔄 刷新'}
            </button>
            <button 
              className="btn btn-ghost btn-sm"
              style={{ color: '#ff3b30' }}
              onClick={handleDelete}
            >
              🗑️ 删除
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// =====================================================
// 创建视频任务表单
// =====================================================
function CreateVideoForm({ person, voices, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    text: '',
    person_id: person?.id || '',
    audio_man_id: '',
    figure_type: person?.figure_type || 'whole_body',
    drive_mode: 'random',
    bg_type: 'color',
    bg_color: '#EDEDED',
    hide_subtitle: true,
    client_ref_id: '',
    timeout_seconds: 3600
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.text.trim()) {
      setError('请输入文本内容')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const payload = {
        ...formData,
        audio_man_id: formData.audio_man_id || undefined
      }
      
      const res = await createDhGenerateTask(payload)
      if (res.data.code === 0) {
        onSubmit && onSubmit(res.data.data)
      } else {
        setError(res.data.message || '创建任务失败')
      }
    } catch (err) {
      setError(err.message || '创建任务失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h3 className="tagline mb-md">创建视频生成任务</h3>
      
      {error && (
        <div className="mb-md" style={{ 
          padding: 'var(--spacing-sm)',
          backgroundColor: 'rgba(255, 59, 48, 0.1)',
          borderRadius: 'var(--rounded-sm)',
        }}>
          <p className="caption" style={{ color: '#ff3b30' }}>{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            数字人
          </label>
          <input
            type="text"
            className="input"
            value={person?.name || ''}
            disabled
            style={{ backgroundColor: 'var(--surface-pearl)' }}
          />
          {person?.figure_type && (
            <p className="caption text-muted mt-xs">
              形象：{person.figure_type}（已自动选择）
            </p>
          )}
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            文本内容 *
          </label>
          <textarea
            className="input"
            rows={4}
            value={formData.text}
            onChange={(e) => setFormData({ ...formData, text: e.target.value })}
            placeholder="输入要合成的文本内容..."
          />
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            声音模型（可选，不选则使用数字人原生声音）
          </label>
          <select
            className="input"
            value={formData.audio_man_id}
            onChange={(e) => setFormData({ ...formData, audio_man_id: e.target.value })}
          >
            <option value="">使用数字人原生声音</option>
            {voices.map(voice => (
              <option key={voice.id} value={voice.id}>
                {voice.name} ({voice.gender === 'female' ? '女' : '男'})
              </option>
            ))}
          </select>
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            形象类型
          </label>
          <select
            className="input"
            value={formData.figure_type}
            onChange={(e) => setFormData({ ...formData, figure_type: e.target.value })}
          >
            <option value="whole_body">whole_body</option>
            <option value="head_shot">head_shot</option>
            <option value="half_body">half_body</option>
          </select>
          {person?.figure_type && (
            <p className="caption text-muted mt-xs">
              💡 当前数字人默认形象：{person.figure_type}
            </p>
          )}
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            驱动模式
          </label>
          <select
            className="input"
            value={formData.drive_mode}
            onChange={(e) => setFormData({ ...formData, drive_mode: e.target.value })}
          >
            <option value="random">随机</option>
            <option value="normal">顺序</option>
          </select>
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            背景类型
          </label>
          <div className="flex gap-sm mb-sm">
            <label className="flex items-center gap-xs">
              <input
                type="radio"
                name="bg_type"
                value="color"
                checked={formData.bg_type === 'color'}
                onChange={(e) => setFormData({ ...formData, bg_type: e.target.value })}
              />
              <span className="body">纯色</span>
            </label>
            <label className="flex items-center gap-xs">
              <input
                type="radio"
                name="bg_type"
                value="image"
                checked={formData.bg_type === 'image'}
                onChange={(e) => setFormData({ ...formData, bg_type: e.target.value })}
              />
              <span className="body">图片</span>
            </label>
          </div>
          
          {formData.bg_type === 'color' && (
            <div className="flex items-center gap-sm">
              <input
                type="color"
                value={formData.bg_color}
                onChange={(e) => setFormData({ ...formData, bg_color: e.target.value })}
                style={{ width: '50px', height: '40px', border: 'none', cursor: 'pointer' }}
              />
              <span className="caption">{formData.bg_color}</span>
            </div>
          )}
        </div>
        
        <div className="mb-md">
          <label className="flex items-center gap-xs">
            <input
              type="checkbox"
              checked={formData.hide_subtitle}
              onChange={(e) => setFormData({ ...formData, hide_subtitle: e.target.checked })}
            />
            <span className="body">隐藏字幕</span>
          </label>
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            参考 ID（可选）
          </label>
          <input
            type="text"
            className="input"
            value={formData.client_ref_id}
            onChange={(e) => setFormData({ ...formData, client_ref_id: e.target.value })}
            placeholder="自定义任务参考 ID"
          />
        </div>
        
        <div className="flex gap-sm">
          <button 
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? '🔄 创建中...' : '🎬 创建视频任务'}
          </button>
          <button 
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

// =====================================================
// 训练自定义数字人表单
// =====================================================
function TrainPersonForm({ onSubmit, onCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    source_video_oss_key: '',
    train_type: 'both',
    language: 'cn',
    error_skip: false,
    resolution_rate: 0,
    client_ref_id: ''
  })
  const [uploadingFile, setUploadingFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleFileUpload = async (file) => {
    if (!file) return
    
    setUploadingFile(file)
    setUploadProgress(0)
    setError('')
    
    try {
      // 1. 获取预签名 URL
      const presignRes = await presignUpload(
        file.name,
        file.type,
        'digital_person'
      )
      
      if (presignRes.data.code !== 0) {
        throw new Error('获取上传 URL 失败')
      }
      
      const { upload_url, oss_key } = presignRes.data.data
      
      // 2. 上传文件
      const uploadRes = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      })
      
      if (!uploadRes.ok) {
        throw new Error('上传文件失败')
      }
      
      setUploadProgress(100)
      
      // 3. 确认上传
      const confirmRes = await confirmUpload(presignRes.data.data.upload_id)
      if (confirmRes.data.code !== 0) {
        throw new Error('确认上传失败')
      }
      
      // 4. 设置 OSS 路径
      setFormData({ ...formData, source_video_oss_key: oss_key })
      
    } catch (err) {
      setError(`上传失败：${err.message}`)
    } finally {
      setUploadingFile(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      setError('请输入数字人名称')
      return
    }
    
    if (!formData.source_video_oss_key) {
      setError('请上传素材视频')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const res = await createDhPersonTask(formData)
      if (res.data.code === 0) {
        onSubmit && onSubmit(res.data.data)
      } else {
        setError(res.data.message || '创建训练任务失败')
      }
    } catch (err) {
      setError(err.message || '创建训练任务失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h3 className="tagline mb-md">训练自定义数字人</h3>
      
      {error && (
        <div className="mb-md" style={{ 
          padding: 'var(--spacing-sm)',
          backgroundColor: 'rgba(255, 59, 48, 0.1)',
          borderRadius: 'var(--rounded-sm)',
        }}>
          <p className="caption" style={{ color: '#ff3b30' }}>{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            数字人名称 *
          </label>
          <input
            type="text"
            className="input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="给你的数字人起个名字"
          />
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            素材视频 *
          </label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => handleFileUpload(e.target.files[0])}
            disabled={uploadingFile}
            className="input"
          />
          
          {uploadingFile && (
            <div className="mt-sm">
              <div className="flex justify-between items-center mb-xs">
                <span className="caption text-muted">上传中：{uploadingFile.name}</span>
                <span className="caption-strong">{uploadProgress}%</span>
              </div>
              <ProgressBar progress={uploadProgress} />
            </div>
          )}
          
          {formData.source_video_oss_key && (
            <p className="caption text-muted mt-sm" style={{ color: '#34c759' }}>
              ✓ 视频已上传
            </p>
          )}
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            训练类型
          </label>
          <select
            className="input"
            value={formData.train_type}
            onChange={(e) => setFormData({ ...formData, train_type: e.target.value })}
          >
            <option value="both">声音 + 形象</option>
            <option value="voice">仅声音</option>
            <option value="image">仅形象</option>
          </select>
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            语言
          </label>
          <select
            className="input"
            value={formData.language}
            onChange={(e) => setFormData({ ...formData, language: e.target.value })}
          >
            <option value="cn">中文</option>
            <option value="en">英文</option>
          </select>
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            分辨率
          </label>
          <select
            className="input"
            value={formData.resolution_rate}
            onChange={(e) => setFormData({ ...formData, resolution_rate: parseInt(e.target.value) })}
          >
            <option value={0}>1080p</option>
            <option value={1}>4K</option>
          </select>
        </div>
        
        <div className="mb-md">
          <label className="flex items-center gap-xs">
            <input
              type="checkbox"
              checked={formData.error_skip}
              onChange={(e) => setFormData({ ...formData, error_skip: e.target.checked })}
            />
            <span className="body">跳过声音克隆失败</span>
          </label>
        </div>
        
        <div className="mb-md">
          <label className="caption-strong mb-sm" style={{ display: 'block' }}>
            参考 ID（可选）
          </label>
          <input
            type="text"
            className="input"
            value={formData.client_ref_id}
            onChange={(e) => setFormData({ ...formData, client_ref_id: e.target.value })}
            placeholder="自定义任务参考 ID"
          />
        </div>
        
        <div className="flex gap-sm">
          <button 
            type="submit"
            className="btn btn-primary"
            disabled={loading || !formData.source_video_oss_key}
          >
            {loading ? '🔄 创建中...' : '🎭 开始训练'}
          </button>
          <button 
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            取消
          </button>
        </div>
        
        <p className="caption text-muted mt-md">
          💡 提示：训练通常需要 30 分钟到 2 小时，请耐心等待。训练完成后会在自定义数字人列表中显示。
        </p>
      </form>
    </div>
  )
}

// =====================================================
// 视频任务状态徽章
// =====================================================
function VideoTaskStatusBadge({ status }) {
  const statusMap = {
    queued: { label: '等待中', class: 'status-queued' },
    processing: { label: '处理中', class: 'status-processing' },
    succeeded: { label: '成功', class: 'status-succeeded' },
    failed: { label: '失败', class: 'status-failed' },
    cancelled: { label: '已取消', class: 'status-cancelled' },
    timeout: { label: '超时', class: 'status-failed' },
  }
  
  const { label, class: className } = statusMap[status] || { label: '未知', class: 'status-queued' }
  
  return (
    <span className={`status-badge ${className}`}>
      {label}
    </span>
  )
}

// =====================================================
// 视频任务列表组件
// =====================================================
function VideoTaskList({ onBack }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [downloadingTaskId, setDownloadingTaskId] = useState(null)

  const loadTasks = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getDhTaskList(filterStatus || null, 50, 0)
      if (res.data.code === 0) {
        // 筛选 dh_generate 类型的任务
        const dhTasks = (res.data.data.items || []).filter(t => t.task_type === 'dh_generate')
        setTasks(dhTasks)
      }
    } catch (err) {
      setError(`加载任务列表失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [filterStatus])

  const handleDownload = async (task) => {
    setDownloadingTaskId(task.task_id)
    try {
      const res = await getDhVideoUrl(task.task_id)
      if (res.data.code === 0) {
        const { download_url } = res.data.data
        // 在新窗口打开下载链接
        window.open(download_url, '_blank')
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
    if (!confirm(`确定要删除视频任务"${task.task_id}"吗？此操作不可恢复，配额将退还。`)) return
    
    try {
      const res = await deleteDhVideoTask(task.task_id)
      if (res.data.code === 0) {
        alert('任务已删除，配额已退还')
        loadTasks()
      } else {
        alert(`删除失败：${res.data.message}`)
      }
    } catch (err) {
      alert(`删除失败：${err.message}`)
    }
  }

  const handleRefresh = async (task) => {
    try {
      const res = await getDhTaskDetail(task.task_id)
      if (res.data.code === 0) {
        const updatedTask = res.data.data
        setTasks(prev => prev.map(t => t.task_id === task.task_id ? updatedTask : t))
      }
    } catch (err) {
      console.error('刷新任务状态失败:', err)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-lg">
        <div>
          <h2 className="display-lg mb-sm">视频任务列表</h2>
          <p className="lead mb-lg">查看和管理已生成的数字人视频任务</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← 返回
        </button>
      </div>

      {/* 筛选器 */}
      <div className="flex gap-sm items-center mb-lg">
        <span className="caption-strong">状态筛选:</span>
        <select
          className="input"
          style={{ width: '150px' }}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">全部</option>
          <option value="queued">等待中</option>
          <option value="processing">处理中</option>
          <option value="succeeded">成功</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
        </select>
        <button className="btn btn-pearl-capsule btn-sm" onClick={loadTasks} disabled={loading}>
          {loading ? '🔄 刷新中' : '🔄 刷新'}
        </button>
      </div>

      {error && (
        <div className="card mb-lg" style={{
          backgroundColor: 'rgba(255, 59, 48, 0.1)',
          border: '1px solid rgba(255, 59, 48, 0.3)',
        }}>
          <p className="caption" style={{ color: '#ff3b30' }}>{error}</p>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center" style={{ padding: 'var(--spacing-xxl) 0' }}>
          <p className="body text-muted">暂无视频任务</p>
          <p className="caption text-muted mt-sm">去创建一个数字人视频吧！</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>任务 ID</th>
                <th>状态</th>
                <th>进度</th>
                <th>参考 ID</th>
                <th>创建时间</th>
                <th>完成时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.task_id}>
                  <td className="caption" style={{ fontFamily: 'monospace' }}>
                    {task.task_id}
                    {task.client_ref_id && (
                      <div className="text-muted" style={{ fontSize: '11px' }}>
                        参考：{task.client_ref_id}
                      </div>
                    )}
                  </td>
                  <td>
                    <VideoTaskStatusBadge status={task.status} />
                  </td>
                  <td>
                    {task.status === 'processing' || task.status === 'queued' ? (
                      <div className="flex items-center gap-xs">
                        <ProgressBar progress={task.progress || 0} />
                        <span className="caption">{task.progress || 0}%</span>
                      </div>
                    ) : (
                      <span className="caption text-muted">-</span>
                    )}
                  </td>
                  <td className="caption">{task.cost || '-'}</td>
                  <td className="caption">
                    {task.created_at ? new Date(task.created_at).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td className="caption">
                    {task.finished_at ? new Date(task.finished_at).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td>
                    <div className="flex gap-xs flex-wrap">
                      {task.status === 'succeeded' && (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleDownload(task)}
                          disabled={downloadingTaskId === task.task_id}
                        >
                          {downloadingTaskId === task.task_id ? '⏳ 下载中' : '⬇️ 下载'}
                        </button>
                      )}
                      {(task.status === 'queued' || task.status === 'processing') && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleRefresh(task)}
                        >
                          🔄 刷新
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#ff3b30' }}
                        onClick={() => handleDelete(task)}
                      >
                        🗑️ 删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 主组件：数字人管理器
// =====================================================
function DigitalHumanManager({ apiKey }) {
  const [activeTab, setActiveTab] = useState('common') // 'common' | 'custom' | 'train' | 'create-video' | 'video-tasks'
  const [commonPersons, setCommonPersons] = useState([])
  const [customPersons, setCustomPersons] = useState([])
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedPerson, setSelectedPerson] = useState(null)

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    
    try {
      // 加载公共数字人
      const commonRes = await getCommonPersons()
      if (commonRes.data.code === 0) {
        setCommonPersons(commonRes.data.data || [])
      }
      
      // 加载自定义数字人
      const customRes = await getCustomPersons()
      if (customRes.data.code === 0) {
        setCustomPersons(customRes.data.data || [])
      }
      
      // 加载声音列表
      const voicesRes = await getVoices()
      if (voicesRes.data.code === 0) {
        setVoices(voicesRes.data.data || [])
      }
    } catch (err) {
      setError(`加载数据失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  // 同步自定义数字人
  const handleSync = async () => {
    setLoading(true)
    try {
      const res = await syncCustomPersons()
      if (res.data.code === 0) {
        setSuccessMsg(`已同步 ${res.data.data.synced_count} 个数字人`)
        loadData()
      }
    } catch (err) {
      setError(`同步失败：${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 删除数字人
  const handleDeletePerson = useCallback((personId) => {
    setCustomPersons(prev => prev.filter(p => p.id !== personId))
    setSuccessMsg('数字人已删除')
    setTimeout(() => setSuccessMsg(''), 3000)
  }, [])

  // 选择数字人
  const handleSelectPerson = useCallback((person) => {
    setSelectedPerson(person)
    setActiveTab('create-video')
  }, [])

  // 创建视频任务成功
  const handleVideoTaskCreated = useCallback((taskData) => {
    setSuccessMsg(`视频任务已创建：${taskData.task_id}`)
    setActiveTab('custom')
    setSelectedPerson(null)
    setTimeout(() => setSuccessMsg(''), 5000)
  }, [])

  // 训练任务创建成功
  const handleTrainTaskCreated = useCallback((taskData) => {
    setSuccessMsg(`训练任务已创建：${taskData.task_id}，请耐心等待训练完成`)
    setActiveTab('custom')
    setTimeout(() => setSuccessMsg(''), 5000)
    loadData()
  }, [])

  return (
    <div>
      {/* 成功提示 */}
      {successMsg && (
        <div className="card mb-lg" style={{
          backgroundColor: 'rgba(52, 199, 89, 0.1)',
          border: '1px solid rgba(52, 199, 89, 0.3)',
        }}>
          <p className="body-strong" style={{ color: '#34c759' }}>{successMsg}</p>
        </div>
      )}
      
      {/* 错误提示 */}
      {error && (
        <div className="card mb-lg" style={{
          backgroundColor: 'rgba(255, 59, 48, 0.1)',
          border: '1px solid rgba(255, 59, 48, 0.3)',
        }}>
          <p className="body-strong" style={{ color: '#ff3b30' }}>{error}</p>
        </div>
      )}
      
      {/* 顶部操作栏 */}
      <div className="flex justify-between items-center mb-lg">
        <div className="flex gap-sm">
          <button 
            className={`btn btn-sm ${activeTab === 'common' ? 'btn-primary' : 'btn-pearl-capsule'}`}
            onClick={() => setActiveTab('common')}
          >
            公共数字人
          </button>
          <button 
            className={`btn btn-sm ${activeTab === 'custom' ? 'btn-primary' : 'btn-pearl-capsule'}`}
            onClick={() => setActiveTab('custom')}
          >
            自定义数字人
          </button>
          <button 
            className={`btn btn-sm ${activeTab === 'train' ? 'btn-primary' : 'btn-pearl-capsule'}`}
            onClick={() => setActiveTab('train')}
          >
            训练新数字人
          </button>
          <button 
            className={`btn btn-sm ${activeTab === 'video-tasks' ? 'btn-primary' : 'btn-pearl-capsule'}`}
            onClick={() => setActiveTab('video-tasks')}
          >
            🎬 视频任务
          </button>
        </div>
        
        {activeTab === 'custom' && (
          <button 
            className="btn btn-pearl-capsule btn-sm"
            onClick={handleSync}
            disabled={loading}
          >
            {loading ? '🔄 同步中' : '🔄 同步'}
          </button>
        )}
      </div>
      
      {/* 加载中 */}
      {loading && !activeTab && (
        <div className="text-center" style={{ padding: 'var(--spacing-xxl) 0' }}>
          <p className="body text-muted">加载中...</p>
        </div>
      )}
      
      {/* 公共数字人列表 */}
      {activeTab === 'common' && (
        <div>
          <h2 className="display-lg mb-sm">公共数字人</h2>
          <p className="lead mb-lg">平台提供的共享数字人模型</p>
          
          {commonPersons.length === 0 ? (
            <div className="text-center" style={{ padding: 'var(--spacing-xxl) 0' }}>
              <p className="body text-muted">暂无公共数字人</p>
            </div>
          ) : (
            <div 
              className="flex gap-lg flex-wrap"
              style={{ 
                maxHeight: 'calc(100vh - 250px)',
                overflowY: 'auto',
                paddingRight: 'var(--spacing-sm)',
                padding: 'var(--spacing-md)'
              }}
            >
              {commonPersons.map(person => (
                <DigitalPersonCard
                  key={person.id}
                  person={person}
                  isCustom={false}
                  onSelect={handleSelectPerson}
                />
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* 自定义数字人列表 */}
      {activeTab === 'custom' && (
        <div>
          <h2 className="display-lg mb-sm">自定义数字人</h2>
          <p className="lead mb-lg">您训练的私有数字人模型</p>
          
          {customPersons.length === 0 ? (
            <div className="text-center" style={{ padding: 'var(--spacing-xxl) 0' }}>
              <p className="body text-muted">暂无自定义数字人</p>
              <button 
                className="btn btn-primary mt-md"
                onClick={() => setActiveTab('train')}
              >
                训练第一个数字人
              </button>
            </div>
          ) : (
            <div 
              className="flex gap-lg flex-wrap"
              style={{ 
                maxHeight: 'calc(100vh - 250px)',
                overflowY: 'auto',
                paddingRight: 'var(--spacing-sm)',
                padding: 'var(--spacing-md)'
              }}
            >
              {customPersons.map(person => (
                <DigitalPersonCard
                  key={person.id}
                  person={person}
                  isCustom={true}
                  onSelect={handleSelectPerson}
                  onDelete={handleDeletePerson}
                  onRefresh={loadData}
                />
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* 训练新数字人 */}
      {activeTab === 'train' && (
        <div style={{ maxWidth: '600px' }}>
          <TrainPersonForm
            onSubmit={handleTrainTaskCreated}
            onCancel={() => setActiveTab('custom')}
          />
        </div>
      )}
      
      {/* 创建视频任务 */}
      {activeTab === 'create-video' && selectedPerson && (
        <div style={{ maxWidth: '600px' }}>
          <CreateVideoForm
            person={selectedPerson}
            voices={voices}
            onSubmit={handleVideoTaskCreated}
            onCancel={() => {
              setSelectedPerson(null)
              setActiveTab('custom')
            }}
          />
        </div>
      )}
      
      {/* 视频任务列表 */}
      {activeTab === 'video-tasks' && (
        <VideoTaskList onBack={() => setActiveTab('common')} />
      )}
    </div>
  )
}

export default DigitalHumanManager
