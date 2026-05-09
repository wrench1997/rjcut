import { useState, useEffect, useCallback } from 'react'

// =====================================================
// 验证级别标签组件
// =====================================================
function ValidationBadge({ level }) {
  const styles = {
    error: {
      backgroundColor: '#ffe5e5',
      color: '#dc3545',
      border: '1px solid #dc3545',
    },
    warning: {
      backgroundColor: '#fff3cd',
      color: '#856404',
      border: '1px solid #ffc107',
    },
    info: {
      backgroundColor: '#e7f3ff',
      color: '#0066cc',
      border: '1px solid #0066cc',
    },
  }
  
  const icons = {
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  }
  
  const labels = {
    error: '错误',
    warning: '警告',
    info: '提示',
  }
  
  return (
    <span 
      className="validation-badge"
      style={{
        ...styles[level],
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: '500',
      }}
    >
      <span>{icons[level]}</span>
      <span>{labels[level]}</span>
    </span>
  )
}

// =====================================================
// 单个任务验证结果卡片
// =====================================================
function TaskValidationCard({ result, onFix }) {
  const [expanded, setExpanded] = useState(false)
  
  const errorCount = result.issues.filter(i => i.level === 'error').length
  const warningCount = result.issues.filter(i => i.level === 'warning').length
  const infoCount = result.issues.filter(i => i.level === 'info').length
  
  const getStatusColor = () => {
    if (errorCount > 0) return '#dc3545'
    if (warningCount > 0) return '#ffc107'
    return '#28a745'
  }
  
  const getStatusIcon = () => {
    if (errorCount > 0) return '❌'
    if (warningCount > 0) return '⚠️'
    return '✅'
  }
  
  return (
    <div 
      className="task-validation-card"
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        backgroundColor: result.is_valid ? '#f8f9fa' : '#fff5f5',
      }}
    >
      <div 
        className="task-validation-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>{getStatusIcon()}</span>
          <div>
            <h4 className="caption-strong" style={{ margin: 0 }}>
              {result.task_name}
            </h4>
            <p className="caption" style={{ margin: '4px 0 0', color: '#666' }}>
              {errorCount} 个错误 · {warningCount} 个警告 · {infoCount} 个提示
            </p>
          </div>
        </div>
        
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      </div>
      
      {/* 文件状态概览 */}
      <div className="file-status-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '8px',
        marginBottom: '12px',
      }}>
        <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
          <span className="caption" style={{ color: '#666' }}>必需文件</span>
          <div style={{ marginTop: '4px' }}>
            {Object.entries(result.required_files).map(([field, present]) => (
              <div key={field} style={{ 
                fontSize: '12px', 
                color: present ? '#28a745' : '#dc3545',
                marginTop: '2px',
              }}>
                {present ? '✓' : '✗'} {field}
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ padding: '8px', backgroundColor: '#fff', borderRadius: '4px' }}>
          <span className="caption" style={{ color: '#666' }}>可选文件</span>
          <div style={{ marginTop: '4px' }}>
            {Object.entries(result.optional_files).map(([field, present]) => (
              <div key={field} style={{ 
                fontSize: '12px', 
                color: present ? '#28a745' : '#6c757d',
                marginTop: '2px',
              }}>
                {present ? '✓' : '○'} {field}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 问题列表 */}
      {expanded && result.issues.length > 0 && (
        <div className="issues-list">
          {result.issues.map((issue, idx) => (
            <div 
              key={idx}
              className="issue-item"
              style={{
                padding: '12px',
                backgroundColor: '#fff',
                borderRadius: '4px',
                marginBottom: '8px',
                borderLeft: `3px solid ${issue.level === 'error' ? '#dc3545' : issue.level === 'warning' ? '#ffc107' : '#0066cc'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <ValidationBadge level={issue.level} />
                <span className="caption" style={{ color: '#666' }}>{issue.field}</span>
              </div>
              
              <p className="body" style={{ margin: '0 0 8px', fontSize: '14px' }}>
                {issue.message}
              </p>
              
              {issue.suggestion && (
                <div style={{ 
                  backgroundColor: '#f8f9fa', 
                  padding: '8px', 
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#666',
                }}>
                  💡 {issue.suggestion}
                </div>
              )}
              
              {onFix && (
                <button
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '8px' }}
                  onClick={() => onFix(result.task_name, issue)}
                >
                  一键修复
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =====================================================
// JSON 编辑器组件
// =====================================================
function JSONEditor({ value, onChange, error, readOnly = false }) {
  const [localValue, setLocalValue] = useState(JSON.stringify(value, null, 2))
  const [parseError, setParseError] = useState(null)
  
  useEffect(() => {
    setLocalValue(JSON.stringify(value, null, 2))
  }, [value])
  
  const handleChange = (e) => {
    const newValue = e.target.value
    setLocalValue(newValue)
    
    try {
      const parsed = JSON.parse(newValue)
      setParseError(null)
      onChange?.(parsed)
    } catch (err) {
      setParseError(err.message)
    }
  }
  
  return (
    <div className="json-editor">
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <span className="caption-strong">JSON 配置</span>
        <span className="caption" style={{ color: '#666' }}>
          {localValue.split('\n').length} 行
        </span>
      </div>
      
      <textarea
        className="file-editor"
        value={localValue}
        onChange={handleChange}
        readOnly={readOnly}
        rows={16}
        style={{
          fontFamily: 'Monaco, Consolas, monospace',
          fontSize: '13px',
          lineHeight: '1.5',
          backgroundColor: parseError ? '#fff5f5' : '#fafbfc',
          border: parseError ? '1px solid #dc3545' : '1px solid #e0e0e0',
        }}
      />
      
      {(error || parseError) && (
        <div style={{ 
          marginTop: '8px', 
          padding: '8px', 
          backgroundColor: '#fff5f5', 
          borderRadius: '4px',
          color: '#dc3545',
          fontSize: '13px',
        }}>
          ❌ {parseError || error}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 任务配置编辑器
// =====================================================
function TaskConfigEditor({ task, index, onChange, onDelete, validator }) {
  const [expanded, setExpanded] = useState(false)
  
  const updateField = (field, value) => {
    onChange?.(index, { ...task, [field]: value })
  }
  
  const fields = [
    { key: 'name', label: '任务名称', required: true, type: 'text' },
    { key: 'video_file', label: '视频文件', required: true, type: 'text', placeholder: './videos/video.mp4' },
    { key: 'script_file', label: '脚本文件', required: false, type: 'text', placeholder: './scripts/script.json' },
    { key: 'corrections_file', label: '纠错字典', required: false, type: 'text', placeholder: './corrections.json' },
    { key: 'bgm_file', label: '背景音乐', required: false, type: 'text', placeholder: './bgm.mp3' },
    { key: 'scenes_dir', label: '场景素材目录', required: false, type: 'text', placeholder: './scenes' },
  ]
  
  return (
    <div className="task-config-editor" style={{
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
      backgroundColor: '#fff',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="caption-strong">任务 {index + 1}</span>
          <input
            type="text"
            value={task.name || ''}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="任务名称"
            style={{
              border: '1px solid #e0e0e0',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '14px',
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? '收起' : '展开'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onDelete?.(index)}
            style={{ color: '#dc3545' }}
          >
            🗑️
          </button>
        </div>
      </div>
      
      {expanded ? (
        <div className="task-fields" style={{ display: 'grid', gap: '12px' }}>
          {fields.map(field => (
            <div key={field.key}>
              <label className="caption-strong" style={{ display: 'block', marginBottom: '4px' }}>
                {field.label} {field.required && <span style={{ color: '#dc3545' }}>*</span>}
              </label>
              <input
                type="text"
                className="input"
                value={task[field.key] || ''}
                onChange={(e) => updateField(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="task-summary" style={{ fontSize: '13px', color: '#666' }}>
          <div>📹 视频：{task.video_file || '未设置'}</div>
          <div>📝 脚本：{task.script_file || '未设置'}</div>
          {task.bgm_file && <div>🎵 背景音乐：{task.bgm_file}</div>}
        </div>
      )}
    </div>
  )
}

// =====================================================
// 批量配置验证器主组件
// =====================================================
function BatchConfigValidator({ config, onChange, vfs, className, apiBaseUrl, apiKey }) {
  const [validationResult, setValidationResult] = useState(null)
  const [validating, setValidating] = useState(false)
  const [activeTab, setActiveTab] = useState('editor') // 'editor' | 'validation' | 'preview'
  
  // 验证配置 - 调用后端 API
  const validate = useCallback(async () => {
    setValidating(true)
    try {
      // 优先调用后端验证 API
      if (apiBaseUrl && apiKey) {
        try {
          const response = await fetch(`${apiBaseUrl}/v1/batch/validate`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
          })
          
          if (response.ok) {
            const data = await response.json()
            setValidationResult(data.data || data)
            setActiveTab('validation')
            return
          }
        } catch (apiError) {
          console.warn('后端验证 API 调用失败，使用前端验证:', apiError)
          // 降级到前端验证
        }
      }
      
      // 前端基础验证 (降级方案)
      const result = performBasicValidation(config, vfs)
      setValidationResult(result)
      setActiveTab('validation')
    } catch (e) {
      console.error('验证失败:', e)
      setValidationResult({
        is_valid: false,
        total_tasks: 0,
        valid_tasks: 0,
        invalid_tasks: 0,
        task_results: [],
        summary: {
          total_errors: 1,
          total_warnings: 0,
          recommendations: [`验证过程出错：${e.message}`],
        },
      })
      setActiveTab('validation')
    } finally {
      setValidating(false)
    }
  }, [config, vfs, apiBaseUrl, apiKey])
  
  // 添加任务
  const addTask = () => {
    const newTask = {
      name: `task_${(config.tasks?.length || 0) + 1}`,
      video_file: '',
      script_file: '',
    }
    onChange?.({
      ...config,
      tasks: [...(config.tasks || []), newTask],
    })
  }
  
  // 更新任务
  const updateTask = (index, updatedTask) => {
    const newTasks = [...config.tasks]
    newTasks[index] = updatedTask
    onChange?.({ ...config, tasks: newTasks })
  }
  
  // 删除任务
  const deleteTask = (index) => {
    const newTasks = config.tasks.filter((_, i) => i !== index)
    onChange?.({ ...config, tasks: newTasks })
  }
  
  // 一键修复
  const fixIssue = (taskName, issue) => {
    console.log('修复问题:', taskName, issue)
    // TODO: 实现智能修复逻辑
  }
  
  return (
    <div className={`batch-config-validator ${className || ''}`}>
      {/* 工具栏 */}
      <div className="validator-toolbar" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
            onClick={() => setActiveTab('editor')}
          >
            ✏️ 编辑配置
          </button>
          <button
            className={`tab ${activeTab === 'validation' ? 'active' : ''}`}
            onClick={() => setActiveTab('validation')}
          >
            🔍 验证结果
          </button>
          <button
            className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveTab('preview')}
          >
            👁️ 预览
          </button>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn btn-ghost"
            onClick={validate}
            disabled={validating}
          >
            {validating ? '验证中...' : '🔍 验证配置'}
          </button>
          <button
            className="btn btn-primary"
            onClick={addTask}
          >
            + 添加任务
          </button>
        </div>
      </div>
      
      {/* 编辑模式 */}
      {activeTab === 'editor' && (
        <div className="editor-mode">
          <div style={{ marginBottom: '16px' }}>
            <JSONEditor
              value={config}
              onChange={onChange}
            />
          </div>
          
          <h3 className="display-md mb-md">任务列表</h3>
          {(config.tasks || []).map((task, index) => (
            <TaskConfigEditor
              key={index}
              task={task}
              index={index}
              onChange={updateTask}
              onDelete={deleteTask}
            />
          ))}
          
          {(!config.tasks || config.tasks.length === 0) && (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <span className="empty-icon" style={{ fontSize: '48px' }}>📋</span>
              <p className="empty-text">暂无任务</p>
              <button className="btn btn-primary" onClick={addTask}>
                添加第一个任务
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* 验证模式 */}
      {activeTab === 'validation' && (
        <div className="validation-mode">
          {!validationResult ? (
            <div className="empty-state" style={{ padding: '40px', textAlign: 'center' }}>
              <span className="empty-icon" style={{ fontSize: '48px' }}>🔍</span>
              <p className="empty-text">点击"验证配置"开始检查</p>
              <button className="btn btn-primary" onClick={validate}>
                开始验证
              </button>
            </div>
          ) : (
            <>
              {/* 验证汇总 */}
              <div className="validation-summary" style={{
                padding: '16px',
                backgroundColor: validationResult.is_valid ? '#d4edda' : '#f8d7da',
                borderRadius: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 className="tagline mb-xs" style={{ margin: 0 }}>
                      {validationResult.is_valid ? '✅ 验证通过' : '❌ 验证失败'}
                    </h3>
                    <p className="body" style={{ margin: '8px 0 0' }}>
                      共 {validationResult.total_tasks} 个任务 · 
                      {validationResult.valid_tasks} 个有效 · 
                      {validationResult.invalid_tasks} 个无效
                    </p>
                  </div>
                  <button className="btn btn-primary" onClick={validate}>
                    重新验证
                  </button>
                </div>
                
                {validationResult.summary?.recommendations?.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <h4 className="caption-strong mb-sm">建议</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {validationResult.summary.recommendations.map((rec, idx) => (
                        <li key={idx} className="body" style={{ fontSize: '14px', marginBottom: '4px' }}>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              {/* 任务验证结果 */}
              <h3 className="display-md mb-md">任务详情</h3>
              {validationResult.task_results.map((result, idx) => (
                <TaskValidationCard
                  key={idx}
                  result={result}
                  onFix={fixIssue}
                />
              ))}
            </>
          )}
        </div>
      )}
      
      {/* 预览模式 */}
      {activeTab === 'preview' && (
        <div className="preview-mode">
          <pre className="file-preview" style={{
            backgroundColor: '#fafbfc',
            padding: '16px',
            borderRadius: '8px',
            overflow: 'auto',
            maxHeight: '600px',
          }}>
            <code>{JSON.stringify(config, null, 2)}</code>
          </pre>
        </div>
      )}
    </div>
  )
}

// =====================================================
// 基础验证函数 (前端版本 - 降级方案)
// =====================================================
function performBasicValidation(config, vfs = null) {
  const tasks = config.tasks || []
  const taskResults = []
  
  tasks.forEach((task, index) => {
    const issues = []
    const requiredFiles = {}
    const optionalFiles = {}
    
    // 验证必需字段
    if (!task.name) {
      issues.push({
        level: 'error',
        field: 'name',
        message: '任务名称不能为空',
        suggestion: '请为任务设置一个名称',
      })
    }
    
    // 验证视频文件
    if (!task.video_file) {
      issues.push({
        level: 'error',
        field: 'video_file',
        message: '缺少必需文件：主视频文件',
        suggestion: '请提供 video_file 字段',
      })
      requiredFiles.video_file = false
    } else {
      // 如果提供了 VFS，检查文件是否存在
      if (vfs) {
        try {
          const exists = vfs.exists(task.video_file)
          if (!exists) {
            issues.push({
              level: 'error',
              field: 'video_file',
              message: `视频文件不存在：${task.video_file}`,
              suggestion: '请检查文件路径是否正确',
            })
          }
        } catch (e) {
          // 忽略 VFS 检查错误
        }
      }
      requiredFiles.video_file = true
    }
    
    // 验证脚本文件 (条件性必需)
    const isSceneOnlyMode = task.custom_config?.pipeline?.mode === 'scene_only'
    if (!isSceneOnlyMode) {
      if (!task.script_file) {
        issues.push({
          level: 'error',
          field: 'script_file',
          message: '缺少必需文件：脚本文件',
          suggestion: '请提供 script_file 字段，或设置 pipeline.mode="scene_only"',
        })
        requiredFiles.script_file = false
      } else {
        // 如果提供了 VFS，检查脚本文件是否存在
        if (vfs) {
          try {
            const exists = vfs.exists(task.script_file)
            if (!exists) {
              issues.push({
                level: 'error',
                field: 'script_file',
                message: `脚本文件不存在：${task.script_file}`,
                suggestion: '请检查文件路径是否正确',
              })
            } else {
              // 尝试读取并验证脚本内容
              try {
                const scriptContent = vfs.readFile(task.script_file)
                if (scriptContent) {
                  const script = JSON.parse(scriptContent)
                  validateScriptContent(script, issues, task.name)
                }
              } catch (e) {
                issues.push({
                  level: 'error',
                  field: 'script_file',
                  message: `脚本 JSON 格式错误：${e.message}`,
                  suggestion: '请使用有效的 JSON 格式',
                })
              }
            }
          } catch (e) {
            // 忽略 VFS 检查错误
          }
        }
        requiredFiles.script_file = true
      }
    } else {
      requiredFiles.script_file = true // 场景模式不需要脚本
    }
    
    // 验证可选文件
    optionalFiles.bgm_file = !!task.bgm_file
    optionalFiles.corrections_file = !!task.corrections_file
    optionalFiles.scenes_dir = !!task.scenes_dir
    
    if (!task.bgm_file) {
      issues.push({
        level: 'warning',
        field: 'bgm_file',
        message: '缺少背景音乐',
        suggestion: '建议添加背景音乐以提升视频质量',
      })
    }
    
    if (!task.corrections_file) {
      issues.push({
        level: 'warning',
        field: 'corrections_file',
        message: '缺少纠错字典',
        suggestion: '建议添加纠错字典以提高字幕准确性',
      })
    }
    
    taskResults.push({
      task_name: task.name || `task_${index}`,
      is_valid: issues.filter(i => i.level === 'error').length === 0,
      issues,
      required_files: requiredFiles,
      optional_files: optionalFiles,
    })
  })
  
  const validCount = taskResults.filter(r => r.is_valid).length
  const invalidCount = taskResults.length - validCount
  
  return {
    is_valid: invalidCount === 0,
    total_tasks: taskResults.length,
    valid_tasks: validCount,
    invalid_tasks: invalidCount,
    task_results: taskResults,
    summary: {
      total_errors: taskResults.reduce((sum, r) => sum + r.issues.filter(i => i.level === 'error').length, 0),
      total_warnings: taskResults.reduce((sum, r) => sum + r.issues.filter(i => i.level === 'warning').length, 0),
      recommendations: [
        !tasks.every(t => t.bgm_file) && '部分任务缺少背景音乐，建议添加',
        !tasks.every(t => t.corrections_file) && '部分任务缺少纠错字典，建议添加',
      ].filter(Boolean),
    },
  }
}

// =====================================================
// 脚本内容验证 (前端版本)
// =====================================================
function validateScriptContent(script, issues, taskName) {
  // 验证必需字段
  if (!script.segments) {
    issues.push({
      level: 'error',
      field: 'script_file',
      message: '脚本缺少必需字段：segments',
      suggestion: '请在脚本中添加 segments 数组字段',
    })
    return
  }
  
  if (!Array.isArray(script.segments)) {
    issues.push({
      level: 'error',
      field: 'script_file',
      message: 'segments 必须是数组格式',
      suggestion: '请将 segments 字段修改为数组',
    })
    return
  }
  
  const validFlags = ['human', 'scene', 'transition']
  
  script.segments.forEach((seg, idx) => {
    // 验证 segment 必需字段
    if (!seg.flag) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 缺少必需字段：flag`,
        suggestion: '请添加 flag 字段 (human/scene/transition)',
      })
    }
    
    if (!seg.text) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 缺少必需字段：text`,
        suggestion: '请添加 text 字段',
      })
    }
    
    // 验证 flag 值
    if (seg.flag && !validFlags.includes(seg.flag)) {
      issues.push({
        level: 'warning',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 的 flag 值不常见：${seg.flag}`,
        suggestion: `建议使用以下值之一：${validFlags.join(', ')}`,
      })
    }
    
    // 验证 scene_file (scene 类型必需)
    if (seg.flag === 'scene' && !seg.scene_file) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 是 scene 类型但缺少 scene_file`,
        suggestion: '请提供 scene_file 字段指向场景素材',
      })
    }
  })
}

export default BatchConfigValidator
