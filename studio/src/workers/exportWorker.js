/**
 * 视频导出 Worker
 * 在后台线程处理 FFmpeg 导出任务，避免阻塞 UI
 * 
 * 支持两种模式：
 * 1. export: 标准导出模式，使用时间轴和媒体 Blob
 * 2. composeFromTimeline: 数字人视频合成模式（对应 lip_sync.py）
 * 3. cutSegments: 视频分割模式（对应 cut_transition.py）
 */

import { videoEditorEngine } from '../utils/videoEditorEngine.js'

let workerInitialized = false

// 监听主线程消息
self.onmessage = async (e) => {
  const { type } = e.data
  
  try {
    if (type === 'init') {
      // 初始化 WASM（如果需要）
      if (!workerInitialized) {
        await videoEditorEngine.initialize()
        workerInitialized = true
      }
      self.postMessage({ type: 'ready' })
    }
    
    else if (type === 'export') {
      await handleExport(e.data)
    }
    
    else if (type === 'composeFromTimeline') {
      await handleComposeFromTimeline(e.data)
    }
    
    else if (type === 'cutSegments') {
      await handleCutSegments(e.data)
    }
  } catch (err) {
    console.error('[ExportWorker] Error:', err)
    self.postMessage({ 
      type: 'error', 
      payload: { message: err.message, stack: err.stack } 
    })
  }
}

/**
 * 处理标准导出任务
 */
async function handleExport(data) {
  const { timeline, exportConfig, mediaBlobs, ffmpegArgs } = data
  
  // 设置进度回调
  videoEditorEngine.setProgressCallback((progress) => {
    self.postMessage({ 
      type: 'progress', 
      payload: { 
        percent: progress.percent || 0,
        time_sec: progress.time_sec,
        fps: progress.fps,
        bitrate_kbps: progress.bitrate_kbps
      } 
    })
  })
  
  // 注意：由于 Worker 中无法直接访问 DOM 和某些浏览器 API
  // 实际的 FFmpeg 处理需要在主线程进行
  // 这里我们只是模拟一个导出流程
  
  // 模拟处理进度
  const totalSteps = 100
  for (let i = 0; i <= totalSteps; i++) {
    await sleep(50) // 模拟处理时间
    
    self.postMessage({ 
      type: 'progress', 
      payload: { percent: i } 
    })
  }
  
  // 创建一个空的输出 Blob（实际应用中应该由 FFmpeg 生成）
  // 这里返回一个提示，说明需要完整的 FFmpeg WASM 集成
  const placeholderBlob = new Blob(
    ['Placeholder: Full FFmpeg WASM integration required for actual video export'], 
    { type: 'video/mp4' }
  )
  
  self.postMessage({ 
    type: 'complete', 
    payload: { 
      data: await placeholderBlob.arrayBuffer(),
      message: '导出完成（占位符 - 需要完整 FFmpeg WASM 集成）'
    } 
  })
}

/**
 * 处理数字人视频合成任务（对应 lip_sync.py 的 compose_from_timeline）
 */
async function handleComposeFromTimeline(data) {
  const { timeline, partFiles, sceneFiles, options } = data
  
  console.log('[ExportWorker] 开始处理 timeline 合成', {
    segmentCount: timeline.segments?.length || 0,
    partFileCount: partFiles?.length || 0,
    sceneFileCount: Object.keys(sceneFiles || {}).length
  })
  
  // 设置进度回调
  videoEditorEngine.setProgressCallback((progress) => {
    self.postMessage({ 
      type: 'progress', 
      payload: { 
        percent: progress.percent || 0,
        time_sec: progress.time_sec,
        fps: progress.fps,
        bitrate_kbps: progress.bitrate_kbps
      } 
    })
  })
  
  // 调用视频引擎的合成方法
  const resultBlob = await videoEditorEngine.composeFromTimeline(
    timeline,
    partFiles,
    sceneFiles || {},
    options || {}
  )
  
  self.postMessage({ 
    type: 'complete', 
    payload: { 
      data: await resultBlob.arrayBuffer(),
      message: '视频合成完成',
      duration: resultBlob.size / 1024 / 1024 // 文件大小（MB）
    } 
  })
}

/**
 * 处理视频分割任务（对应 cut_transition.py 的切割功能）
 */
async function handleCutSegments(data) {
  const { videoFile, segments, width, height, fps } = data
  
  console.log('[ExportWorker] 开始处理视频分割', {
    segmentCount: segments?.length || 0,
    videoSize: videoFile?.size || 0
  })
  
  // 设置进度回调
  videoEditorEngine.setProgressCallback((progress) => {
    self.postMessage({ 
      type: 'progress', 
      payload: { 
        percent: progress.percent || 0,
        time_sec: progress.time_sec,
        fps: progress.fps,
        bitrate_kbps: progress.bitrate_kbps
      } 
    })
  })
  
  // 调用视频引擎的分割方法
  const results = await videoEditorEngine.cutVideoSegments(
    videoFile,
    segments,
    width || 1920,
    height || 1080,
    fps || 30
  )
  
  // 将所有片段打包发送回主线程
  const packedResults = []
  for (const result of results) {
    packedResults.push({
      index: result.index,
      label: result.label,
      start: result.start,
      end: result.end,
      duration: result.duration,
      data: await result.blob.arrayBuffer()
    })
  }
  
  self.postMessage({ 
    type: 'complete', 
    payload: { 
      segments: packedResults,
      message: `视频分割完成，共 ${results.length} 个片段`
    } 
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}