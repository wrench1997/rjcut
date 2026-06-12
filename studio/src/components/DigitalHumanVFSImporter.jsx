import { useState, useEffect } from 'react'
import { getVFS } from '../utils/vfsClient'
import { PROJECT_FOLDERS, buildVFSPath, parseProjectNameFromVFS } from '../utils/project-structure'
import { 
  createDhGenerateTask, 
  getTaskStatus,
  getCommonPersons,
  getCustomPersons,
  getVoices
} from '../api/api'

// =====================================================
// 状态徽章组件
// =====================================================
function StatusBadge({ status }) {
  const statusMap = {
    queued: { label: '排队中', class: 'status-queued' },
    processing: { label: '处理中', class: 'status-processing' },
    success: { label: '成功', class: 'status-succeeded' },
    failed: { label: '失败', class: 'status-failed' },
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
function ProgressBar({ progress, label }) {
  return (
    <div className="mb-sm">
      {label && (
        <div className="flex justify-between items-center mb-xs">
          <span className="caption text-muted">{label}</span>
          <span className="caption-strong">{Math.round(progress)}%</span>
        </div>
      )}
      <div className="progress-bar">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
    </div>
  )
}

// =====================================================
// 数字人选择器组件
// =====================================================
function PersonSelector({ selectedPerson, onSelect, apiKey }) {
  const [activeTab, setActiveTab] = useState('common')
  const [commonPersons, setCommonPersons] = useState([])
  const [customPersons, setCustomPersons] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadPersons()
  }, [])

  const loadPersons = async () => {
    setLoading(true)
    try {
      const [commonRes, customRes] = await Promise.all([
        getCommonPersons(),
        getCustomPersons()
      ])
      
      if (commonRes.data.code === 0) {
        setCommonPersons(commonRes.data.data || [])
      }
      if (customRes.data.code === 0) {
        setCustomPersons(customRes.data.data || [])
      }
    } catch (err) {
      console.error('加载数字人列表失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const persons = activeTab === 'common' ? commonPersons : customPersons

  return (
    <div className="card mb-md">
      <div className="flex gap-sm mb-md">
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
      </div>

      {loading ? (
        <div className="text-center" style={{ padding: 'var(--spacing-md) 0' }}>
          <p className="body text-muted">加载中...</p>
        </div>
      ) : persons.length === 0 ? (
        <div className="text-center" style={{ padding: 'var(--spacing-md) 0' }}>
          <p className="body text-muted">暂无数字人</p>
        </div>
      ) : (
        <div className="person-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          gap: 'var(--spacing-sm)',
          maxHeight: '300px',
          overflowY: 'auto',
        }}>
          {persons.map(person => (
            <div
              key={person.id}
              className={`person-card ${selectedPerson?.id === person.id ? 'selected' : ''}`}
              onClick={() => onSelect(person)}
              style={{
                padding: 'var(--spacing-sm)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--rounded-md)',
                cursor: 'pointer',
                textAlign: 'center',
                backgroundColor: selectedPerson?.id === person.id 
                  ? 'var(--surface-selected)' 
                  : 'var(--surface-default)',
              }}
            >
              {person.cover_url && (
                <img
                  src={person.cover_url}
                  alt={person.name}
                  style={{
                    width: '100%',
                    aspectRatio: '3/4',
                    objectFit: 'cover',
                    borderRadius: 'var(--rounded-sm)',
                    marginBottom: 'var(--spacing-xs)',
                  }}
                />
              )}
              <p className="caption-strong" style={{ 
                fontSize: '12px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {person.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 主组件：数字人视频导入器
// =====================================================

/**
 * 数字人视频导入器 - 将数字人生成的视频导入到 VFS 项目
 * 
 * @param {string} projectPath - VFS 项目路径
 * @param {function} onImportComplete - 导入完成回调
 * @param {function} onClose - 关闭回调
 * @param {function} onError - 错误回调
 */
export function DigitalHumanVFSImporter({ 
  projectPath, 
  onImportComplete, 
  onClose,
  onError
}) {
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [text, setText] = useState('')
  const [figureType, setFigureType] = useState('whole_body')
  const [generating, setGenerating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ 
    stage: '', 
    percent: 0,
    taskStatus: null,
  })
  const [error, setError] = useState('')
  const [taskId, setTaskId] = useState(null)

  // 重置状态
  const resetState = () => {
    setSelectedPerson(null)
    setText('')
    setFigureType('whole_body')
    setGenerating(false)
    setImporting(false)
    setProgress({ stage: '', percent: 0, taskStatus: null })
    setError('')
    setTaskId(null)
  }

  // 关闭处理
  const handleClose = () => {
    if (generating || importing) {
      if (!confirm('任务正在进行中，确定要关闭吗？')) {
        return
      }
    }
    resetState()
    onClose?.()
  }

  // 生成并导入视频
  const handleGenerateAndImport = async () => {
    if (!selectedPerson) {
      setError('请选择数字人')
      return
    }
    if (!text.trim()) {
      setError('请输入文本内容')
      return
    }

    setGenerating(true)
    setError('')

    try {
      const vfs = getVFS()
      await vfs.init()

      // 步骤 1: 创建视频生成任务 (10%)
      setProgress({ 
        stage: '创建任务...', 
        percent: 10,
        taskStatus: null,
      })
      
      const taskRes = await createDhGenerateTask({
        text,
        person_id: selectedPerson.id,
        figure_type: figureType,
        bg_type: 'color',
        bg_color: '#EDEDED',
        hide_subtitle: true,
        timeout_seconds: 3600,
      })

      if (taskRes.data.code !== 0) {
        throw new Error(taskRes.data.message || '创建任务失败')
      }

      const taskId = taskRes.data.data.task_id
      setTaskId(taskId)

      // 步骤 2: 轮询等待任务完成 (10% -> 80%)
      setProgress({ 
        stage: '生成视频中...', 
        percent: 20,
        taskStatus: 'processing',
      })
      
      const task = await waitForTaskCompletion(taskId, (status) => {
        setProgress(prev => ({
          stage: status.stage || '生成视频中...',
          percent: 20 + (status.progress || 0) * 0.6,
          taskStatus: status.status,
        }))
      })

      // 步骤 3: 下载并导入 VFS (80% -> 95%)
      setProgress({ 
        stage: '下载视频...', 
        percent: 80,
        taskStatus: 'downloading',
      })
      
      const filename = `dh_${selectedPerson.name.replace(/\s+/g, '_')}_${Date.now()}.mp4`
      const videoInfo = await importVideoToVFS(vfs, projectPath, task, filename)

      // 步骤 4: 更新项目配置 (95% -> 100%)
      setProgress({ 
        stage: '更新项目配置...', 
        percent: 95,
        taskStatus: 'updating',
      })
      
      await updateProjectWithVideo(vfs, projectPath, videoInfo, {
        person_name: selectedPerson.name,
        person_id: selectedPerson.id,
        figure_type: figureType,
        text,
      })

      // 完成
      setProgress({ 
        stage: '完成!', 
        percent: 100,
        taskStatus: 'success',
      })
      
      onImportComplete?.(videoInfo)

    } catch (err) {
      console.error('导入失败:', err)
      setError(err.message || '导入失败')
      setProgress(prev => ({
        ...prev,
        stage: '失败',
        taskStatus: 'failed',
      }))
      onError?.(err)
    } finally {
      setGenerating(false)
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div 
        className="modal" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '700px' }}
      >
        <h3 className="modal-title">🎭 导入数字人视频到项目</h3>
        
        {/* 进度显示 */}
        {(generating || importing) && (
          <div className="mb-md">
            <ProgressBar 
              progress={progress.percent} 
              label={progress.stage}
            />
            {progress.taskStatus && (
              <div className="text-center">
                <StatusBadge status={progress.taskStatus} />
              </div>
            )}
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="mb-md" style={{ 
            padding: 'var(--spacing-sm)',
            backgroundColor: 'rgba(255, 59, 48, 0.1)',
            borderRadius: 'var(--rounded-sm)',
          }}>
            <p className="caption" style={{ color: '#ff3b30' }}>{error}</p>
          </div>
        )}

        {/* 表单内容 - 在生成过程中禁用 */}
        {!generating && !importing && (
          <>
            {/* 选择数字人 */}
            <PersonSelector
              selectedPerson={selectedPerson}
              onSelect={setSelectedPerson}
            />

            {/* 形象类型 */}
            <div className="mb-md">
              <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                形象类型
              </label>
              <select
                className="input"
                value={figureType}
                onChange={(e) => setFigureType(e.target.value)}
              >
                <option value="whole_body">全身 (whole_body)</option>
                <option value="half_body">半身 (half_body)</option>
                <option value="head_shot">头像 (head_shot)</option>
              </select>
            </div>

            {/* 输入文本 */}
            <div className="mb-md">
              <label className="caption-strong mb-sm" style={{ display: 'block' }}>
                口播文本 *
              </label>
              <textarea
                className="input"
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="输入数字人要说的内容..."
              />
              <p className="caption text-muted mt-xs">
                💡 提示：建议控制在 200 字以内，生成时间约 1-3 分钟
              </p>
            </div>
          </>
        )}

        {/* 操作按钮 */}
        <div className="modal-actions">
          {generating || importing ? (
            <>
              <button
                className="btn btn-ghost"
                onClick={handleClose}
                disabled={progress.percent < 100}
              >
                关闭
              </button>
              <button
                className="btn btn-primary"
                disabled
              >
                🔄 处理中...
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-ghost"
                onClick={handleClose}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleGenerateAndImport}
                disabled={!selectedPerson || !text.trim()}
              >
                🎬 生成并导入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 辅助函数
// =====================================================

/**
 * 轮询等待任务完成
 */
async function waitForTaskCompletion(taskId, onProgress) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const res = await getTaskStatus(taskId)
        const task = res.data.data
        
        onProgress?.({
          stage: task.stage,
          status: task.status,
          progress: task.progress || 0,
        })
        
        if (task.status === 'success') {
          resolve(task)
        } else if (task.status === 'failed') {
          reject(new Error(task.error || '视频生成失败'))
        } else {
          setTimeout(poll, 3000) // 每 3 秒轮询一次
        }
      } catch (err) {
        reject(err)
      }
    }
    poll()
  })
}

/**
 * 下载视频并导入到 VFS
 */
async function importVideoToVFS(vfs, projectPath, task, filename) {
  const videoUrl = task.result?.video_url
  if (!videoUrl) {
    throw new Error('未找到视频 URL')
  }

  // 下载视频为 Blob
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error('下载视频失败')
  }
  const blob = await response.blob()

  // 确定保存路径 - 直接保存到项目根目录的 输出 子目录
  // 使用统一的项目结构模块构建路径
  const projectName = parseProjectNameFromVFS(projectPath)
  const outputDir = buildVFSPath(projectName, PROJECT_FOLDERS.OUTPUT)
  const savePath = `${outputDir}/${filename}`

  // 写入 VFS
  const fileInfo = await vfs.writeFile(savePath, blob, {
    type: 'video/mp4',
    metadata: {
      source: 'digital_human',
      task_id: task.id,
      person_id: task.payload?.person_id,
      person_name: task.payload?.person_name,
      text: task.payload?.text,
      duration: task.result?.duration,
      created_at: task.completed_at,
    },
  })

  return fileInfo
}

/**
 * 更新项目配置，添加视频记录
 */
async function updateProjectWithVideo(vfs, projectPath, videoInfo, dhMetadata) {
  // 读取项目配置
  const config = await vfs.readJSON(`${projectPath}/project.json`)

  // 初始化数字人视频列表
  if (!config.digital_human_videos) {
    config.digital_human_videos = []
  }

  // 添加视频记录
  config.digital_human_videos.push({
    id: `dh_${Date.now()}`,
    path: videoInfo.path,
    person_id: dhMetadata.person_id,
    person_name: dhMetadata.person_name,
    figure_type: dhMetadata.figure_type,
    text: dhMetadata.text,
    duration: videoInfo.metadata?.duration,
    task_id: videoInfo.metadata?.task_id,
    created_at: new Date().toISOString(),
  })

  // 添加到 scenes（如果不存在）
  if (!config.scenes) {
    config.scenes = []
  }

  config.scenes.push({
    id: `scene_${Date.now()}`,
    type: 'digital_human',
    video_path: videoInfo.path,
    text: dhMetadata.text,
    duration: videoInfo.metadata?.duration,
    created_at: new Date().toISOString(),
  })

  config.updatedAt = new Date().toISOString()

  // 保存配置
  await vfs.writeJSON(`${projectPath}/project.json`, config)

  return config
}

export default DigitalHumanVFSImporter