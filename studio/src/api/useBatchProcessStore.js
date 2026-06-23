import { create } from 'zustand'
import { getVFS } from '../utils/vfsClient'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8001'

const useBatchProcessStore = create((set, get) => ({
  tasks: [],
  isRunning: false,
  isPaused: false,
  startTime: null,
  endTime: null,
  abortController: null,

  // 获取当前任务统计数据
  getTaskStats: () => {
    const tasks = get().tasks
    return {
      total: tasks.length,
      succeeded: tasks.filter(t => t.stage === 'succeeded').length,
      failed: tasks.filter(t => t.stage === 'failed').length,
      cancelled: tasks.filter(t => t.stage === 'cancelled').length,
      running: tasks.filter(t => ['uploading', 'drafting', 'composing', 'downloading'].includes(t.stage)).length,
    }
  },

  // 重置状态
  reset: () => set({ 
    tasks: [], 
    isRunning: false, 
    isPaused: false, 
    startTime: null, 
    endTime: null, 
    abortController: null 
  }),

  // 取消所有任务
  abortBatch: () => {
    const { abortController, tasks } = get()
    if (abortController) {
      abortController.abort()
    }
    set({
      isRunning: false,
      endTime: Date.now(),
      tasks: tasks.map(t =>
        ['idle', 'uploading', 'drafting', 'composing', 'downloading'].includes(t.stage)
          ? { ...t, stage: 'cancelled', error: '用户已取消' }
          : t
      )
    })
  },

  // 更新单个任务状态
  updateTask: (id, updates) => {
    set(state => ({
      tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t)
    }))
  },

  // 启动批量处理任务
  startBatch: async (taskItems, maxConcurrent = 3, globalParams = null) => {
    set({
      tasks: taskItems,
      isRunning: true,
      isPaused: false,
      startTime: Date.now(),
      endTime: null,
      abortController: new AbortController()
    })

    const vfs = getVFS()
await vfs.init()
    const apiKey = localStorage.getItem('rjcut_api_key')
    const abortSignal = get().abortController.signal

    let index = 0
    const tasksQueue = get().tasks

    // 定义并发 Worker
    const worker = async () => {
      while (index < tasksQueue.length && !abortSignal.aborted) {
        const currentIndex = index++
        const task = tasksQueue[currentIndex]
        await get().processTask(task, vfs, apiKey, abortSignal, globalParams)
      }
    }

    // 启动指定数量的并发 Worker
    const workers = []
    for (let i = 0; i < maxConcurrent; i++) {
      workers.push(worker())
    }

    await Promise.all(workers)

    if (!abortSignal.aborted) {
      set({ isRunning: false, endTime: Date.now() })
    }
  },

  // 处理单个任务流程
  processTask: async (task, vfs, apiKey, abortSignal, globalParams = null) => {
    const { updateTask } = get()
    const taskId = task.id

    try {
      updateTask(taskId, { stage: 'uploading', progress: 5 })

      // ==========================================
      // 内部助手函数：通用文件上传（基于后端预签名直传）
      // ==========================================
      const uploadVfsFile = async (path, purpose) => {
        if (!path) return null
        
        // 使用 VFS 提供的读取为 Blob 方法
        let blob
        try {
          blob = await vfs.readFileAsBlob(path)
        } catch (e) {
          throw new Error(`无法读取文件 ${path}: ${e.message}`)
        }

        const filename = path.split('/').pop()

        // 1. 请求预签名上传 URL
        const presignRes = await fetch(`${API_BASE_URL}/v1/uploads/presign`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            filename, 
            content_type: blob.type || 'application/octet-stream', 
            purpose 
          })
        })
        
        if (!presignRes.ok) throw new Error(`获取上传链接失败: ${filename}`)
        const presignData = await presignRes.json()
        const { upload_url, oss_key, upload_id } = presignData.data

        // 2. 将文件直接 PUT 到对象存储
        const uploadRes = await fetch(upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': blob.type || 'application/octet-stream' },
          body: blob
        })
        
        if (!uploadRes.ok) throw new Error(`文件上传失败: ${filename}`)

        // 3. 通知后端确认上传
        const confirmRes = await fetch(`${API_BASE_URL}/v1/uploads/confirm`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ upload_id })
        })
        
        if (!confirmRes.ok) throw new Error(`确认上传失败: ${filename}`)

        return oss_key
      }

      if (abortSignal.aborted) throw new Error('Aborted')

      // 获取商户 ID（用于场景 URL）
      const merchantRes = await fetch(`${API_BASE_URL}/v1/merchant/info`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!merchantRes.ok) throw new Error('获取商户信息失败')
      const merchantData = await merchantRes.json()
      const merchantId = merchantData.data.merchant_id

      // 上传必需的主视频文件
      const videoOssKey = await uploadVfsFile(task.vfsVideoPath, 'input')
      if (!videoOssKey) throw new Error('主视频文件未找到或上传失败')

      updateTask(taskId, { progress: 30 })

      // 上传可选文件
      const scriptOssKey = await uploadVfsFile(task.vfsScriptPath, 'script')
      const correctionsOssKey = await uploadVfsFile(task.vfsCorrectionsPath, 'corrections')
      const bgmOssKey = await uploadVfsFile(task.vfsBgmPath, 'bgm')

      if (abortSignal.aborted) throw new Error('Aborted')

      // ==========================================
      // 1. 发起 Draft (草稿) 任务
      // ==========================================
      updateTask(taskId, { stage: 'drafting', progress: 40 })
      
      const draftReq = {
        input: {
          video_url: videoOssKey,
          script_url: scriptOssKey,
          corrections_url: correctionsOssKey,
          scene_base_url: merchantId
        },
        draft: { need_transcription: true, need_timeline: true },
        timeout_seconds: 1800
      }

      const draftRes = await fetch(`${API_BASE_URL}/v1/tasks/agent-draft`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(draftReq)
      })
      
      if (!draftRes.ok) {
        const errorData = await draftRes.json()
        throw new Error(errorData.message || '发起草稿任务失败')
      }
      
      const draftData = await draftRes.json()
      const draftTaskId = draftData.data.task_id
      updateTask(taskId, { draftTaskId })

      // 轮询等待 Draft 任务完成 (40% - 70%)
      await get().pollTask(draftTaskId, apiKey, abortSignal, (prog) => {
        updateTask(taskId, { progress: 40 + (prog * 0.3) }) 
      })

      if (abortSignal.aborted) throw new Error('Aborted')

      // ==========================================
      // 2. 发起 Compose (合成) 任务
      // ==========================================
      updateTask(taskId, { stage: 'composing', progress: 70 })
      
      // 使用全局参数配置（如果提供），否则使用默认值
      const composeReq = {
        draft_task_id: draftTaskId,
        pipeline: globalParams?.pipeline || {
          use_transitions: false,
          transition_type: "fade",
          transition_duration: 0.8,
          resync_subtitle: true
        },
        subtitle: globalParams?.subtitle || {
          effect: "ad",
          font_size: 72,  // 🎨 与 GlobalParamsVisualEditor.jsx 默认值统一
          position: "bottom",
          x_offset: 0,
          y_offset: -80,
          color: "#FFFF00",
          stroke_color: "#000000",
          stroke_width: 3,
          background_color: "rgba(0, 0, 0, 0.4)",
          background_padding: 8,
          background_radius: 8,
          line_spacing: 1.3,
          max_width: 95
        },
        audio: globalParams?.audio || {
          bgm_url: bgmOssKey || null,
          bgm_volume: 0.3,
          original_volume: 1.0,
          bgm_start_time: 0.0,
          bgm_loop: true,
          fade_in_duration: 0.5,
          fade_out_duration: 0.5
        },
        output: globalParams?.output || { need_ass: true },
        timeout_seconds: 1800
      }
      
      // 如果全局参数中没有 bgm_url 但上传了 bgmOssKey，则使用上传的文件
      if (!composeReq.audio.bgm_url && bgmOssKey) {
        composeReq.audio.bgm_url = bgmOssKey
      }

      const composeRes = await fetch(`${API_BASE_URL}/v1/tasks/compose-from-draft`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(composeReq)
      })
      
      if (!composeRes.ok) {
        const errorData = await composeRes.json()
        throw new Error(errorData.message || '发起合成任务失败')
      }
      
      const composeData = await composeRes.json()
      const composeTaskId = composeData.data.task_id
      updateTask(taskId, { composeTaskId })

      // 轮询等待 Compose 任务完成 (70% - 100%)
      await get().pollTask(composeTaskId, apiKey, abortSignal, (prog) => {
        updateTask(taskId, { progress: 70 + (prog * 0.3) }) 
      })

      if (abortSignal.aborted) throw new Error('Aborted')

      updateTask(taskId, { stage: 'succeeded', progress: 100 })

    } catch (e) {
      if (e.message !== 'Aborted') {
        updateTask(taskId, { stage: 'failed', error: e.message })
      }
    }
  },

  // 轮询查询后端任务执行状态
  pollTask: async (taskId, apiKey, abortSignal, onProgress) => {
    while (!abortSignal.aborted) {
      const res = await fetch(`${API_BASE_URL}/v1/tasks/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      
      if (!res.ok) throw new Error('查询任务状态失败')
      
      const data = await res.json()
      const { status, progress, error } = data.data

      onProgress(progress || 0)

      if (status === 'succeeded') return data.data
      if (status === 'failed') throw new Error(error || '后端处理任务失败')
      if (status === 'cancelled') throw new Error('任务被取消')

      // 每 3 秒轮询一次
      await new Promise(r => setTimeout(r, 3000))
    }
  }
}))

export default useBatchProcessStore