import { create } from 'zustand'
import { getVFS } from '../utils/vfsClient'
import { getBaseUrl, relayUpload } from './api'

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
      running: tasks.filter(t => ['preparing', 'uploading', 'drafting', 'composing', 'downloading'].includes(t.stage)).length,
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
        ['idle', 'preparing', 'uploading', 'drafting', 'composing', 'downloading'].includes(t.stage)
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
    const apiBaseUrl = getBaseUrl()
    const abortSignal = get().abortController.signal

    let index = 0
    const tasksQueue = get().tasks

    // 定义并发 Worker
    const worker = async () => {
      while (index < tasksQueue.length && !abortSignal.aborted) {
        const currentIndex = index++
        const task = tasksQueue[currentIndex]
        await get().processTask(task, vfs, apiKey, abortSignal, globalParams, apiBaseUrl)
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
  processTask: async (task, vfs, apiKey, abortSignal, globalParams = null, apiBaseUrl = getBaseUrl()) => {
    const { updateTask } = get()
    const taskId = task.id

    try {
      // 模板混剪在这里真正执行本地渲染。
      // 旧实现只是提前标记 succeeded，再依赖第五步组件的 useEffect 做合成，
      // 会造成“任务已成功但仍未渲染”、旧输出被误认为本次结果等问题。
      if (task.localOnly || task.templateMeta?.timelineSchema) {
        updateTask(taskId, {
          stage: 'preparing',
          stageLabel: '读取字级时间轴',
          progress: 2,
          draftTaskId: null,
          composeTaskId: null,
        })
        const { renderLocalTemplateTask } = await import('../features/template-batch/localTemplateRenderer.js')
        const result = await renderLocalTemplateTask(task, vfs, (progress, stageLabel) => {
          updateTask(taskId, {
            stage: progress >= 10 ? 'composing' : 'preparing',
            stageLabel,
            progress,
          })
        })
        updateTask(taskId, {
          stage: 'succeeded',
          stageLabel: '本地渲染完成',
          progress: 100,
          localReady: true,
          outputPath: result.outputPath,
          renderReportPath: result.renderReportPath,
          outputBytes: result.outputBytes,
          transitionCount: result.transitionCount,
          result,
        })
        return
      }

      updateTask(taskId, { stage: 'uploading', progress: 5 })

      // ==========================================
      // 内部助手函数：通用文件上传（通过系统配置的 API relay）
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

        const payload = await relayUpload(blob, filename, purpose, {
          signal: abortSignal,
          apiBaseUrl,
          apiKey,
        })
        return payload.data.oss_key
      }

      if (abortSignal.aborted) throw new Error('Aborted')

      // 获取商户 ID（用于场景 URL）
      const merchantRes = await fetch(`${apiBaseUrl}/v1/merchant/info`, {
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
      const fontOssKey = await uploadVfsFile(task.vfsFontPath, 'font')

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

      const draftRes = await fetch(`${apiBaseUrl}/v1/tasks/agent-draft`, {
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
      }, apiBaseUrl)

      if (abortSignal.aborted) throw new Error('Aborted')

      // ==========================================
      // 2. 判断是否需要后端合成
      // ==========================================
      // 🎨 模板混剪任务：只使用后端的字幕识别（draft），视频合成由前端处理
      // 普通批量处理：使用后端合成（compose）
      const isTemplateBatch = !!task.templateMeta?.templateId
      console.log('[BatchProcess] 任务类型:', isTemplateBatch ? '模板混剪（前端合成）' : '普通批量（后端合成）')

      if (isTemplateBatch) {
        // 模板混剪：draft 完成后即视为完成，前端会自行处理视频合成
        console.log('[BatchProcess] 模板混剪任务，跳过 compose 阶段，等待前端合成')
        updateTask(taskId, { 
          stage: 'succeeded', 
          progress: 100,
          draftTaskId // 保留 draftTaskId 供前端使用
        })
      } else {
        // ==========================================
        // 普通批量处理：发起 Compose (合成) 任务
        // ==========================================
        updateTask(taskId, { stage: 'composing', progress: 70 })
        
        // 🎨 关键：优先使用任务自己的 globalParams（模板混剪场景），否则使用传入的全局参数
        // 模板混剪的每个任务有自己的 globalParams（存储在 task.globalParams 中）
        // 普通批量处理使用传入的 globalParams 参数（来自 localStorage）
        const taskGlobalParams = task.globalParams || globalParams
        console.log('[BatchProcess] 使用 globalParams:', JSON.stringify(taskGlobalParams, null, 2))
        
        const composeReq = {
          draft_task_id: draftTaskId,
          pipeline: taskGlobalParams?.pipeline || {
            use_transitions: false,
            transition_type: "fade",
            transition_duration: 0.8,
            resync_subtitle: true
          },
          subtitle: {
            // 🎨 使用用户在 GlobalParamsVisualEditor 中配置的实际参数
            effect: taskGlobalParams?.subtitle?.effect || "ad",
            font_family: taskGlobalParams?.subtitle?.font_family || "Microsoft YaHei",
            font_weight: taskGlobalParams?.subtitle?.font_weight || "bold",
            font_size: taskGlobalParams?.subtitle?.font_size || 68,
            position: taskGlobalParams?.subtitle?.position || "bottom",
            x_offset: taskGlobalParams?.subtitle?.x_offset || 0,
            y_offset: taskGlobalParams?.subtitle?.y_offset || -80,
            position_x: taskGlobalParams?.subtitle?.position_x ?? null,
            position_y: taskGlobalParams?.subtitle?.position_y ?? null,
            use_relative_pos: taskGlobalParams?.subtitle?.use_relative_pos ?? false,
            color: taskGlobalParams?.subtitle?.color || "#FFFFFF",
            highlight_color: taskGlobalParams?.subtitle?.highlight_color || "#FFD400",
            stroke_color: taskGlobalParams?.subtitle?.stroke_color || "#000000",
            stroke_width: taskGlobalParams?.subtitle?.stroke_width || 3,
            background_color: taskGlobalParams?.subtitle?.background_color || "rgba(0, 0, 0, 0.4)",
            background_padding: taskGlobalParams?.subtitle?.background_padding || 8,
            background_radius: taskGlobalParams?.subtitle?.background_radius || 8,
            line_spacing: taskGlobalParams?.subtitle?.line_spacing || 1.3,
            max_width: taskGlobalParams?.subtitle?.max_width || 95,
            max_chars_per_line: taskGlobalParams?.subtitle?.max_chars_per_line || 15,  // 🎨 每行最大字符数（自动换行）
            word_by_word_highlight: taskGlobalParams?.subtitle?.word_by_word_highlight ?? true,  // 🎨 逐字高亮显示开关
            font_url: fontOssKey || taskGlobalParams?.subtitle?.font_url || null,  // 🎨 自定义字体文件上传
          },
          audio: {
            bgm_url: bgmOssKey || taskGlobalParams?.audio?.bgm_url || null,
            bgm_volume: taskGlobalParams?.audio?.bgm_volume ?? 0.3,
            original_volume: taskGlobalParams?.audio?.original_volume ?? 1.0,
            bgm_start_time: taskGlobalParams?.audio?.bgm_start_time ?? 0.0,
            bgm_loop: taskGlobalParams?.audio?.bgm_loop ?? true,
            fade_in_duration: taskGlobalParams?.audio?.fade_in_duration ?? 0.5,
            fade_out_duration: taskGlobalParams?.audio?.fade_out_duration ?? 0.5,
          },
          output: taskGlobalParams?.output || { need_ass: true },
          timeout_seconds: 1800
        }
        
        // 如果全局参数中没有 bgm_url 但上传了 bgmOssKey，则使用上传的文件
        if (!composeReq.audio.bgm_url && bgmOssKey) {
          composeReq.audio.bgm_url = bgmOssKey
        }

        const composeRes = await fetch(`${apiBaseUrl}/v1/tasks/compose-from-draft`, {
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
        }, apiBaseUrl)

        if (abortSignal.aborted) throw new Error('Aborted')

        updateTask(taskId, { stage: 'succeeded', progress: 100 })
      }

    } catch (e) {
      const errorMessage = e instanceof Error
        ? e.message
        : (typeof e === 'string' ? e : JSON.stringify(e) || '本地渲染发生未知错误')
      console.error('[BatchProcess] 任务失败', { taskId, error: e, errorMessage })
      if (errorMessage !== 'Aborted') {
        updateTask(taskId, {
          stage: 'failed',
          stageLabel: '本地渲染失败',
          error: errorMessage,
        })
      }
    }
  },

  // 轮询查询后端任务执行状态
  pollTask: async (taskId, apiKey, abortSignal, onProgress, apiBaseUrl = getBaseUrl()) => {
    while (!abortSignal.aborted) {
      const res = await fetch(`${apiBaseUrl}/v1/tasks/${taskId}`, {
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
