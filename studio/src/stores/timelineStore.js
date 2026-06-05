/**
 * 视频编辑器时间轴状态管理
 * 使用简单的发布订阅模式，不依赖外部库
 */
import { useState, useEffect } from 'react'

// 媒体文件注册表 - 存储原始 File/Blob 对象
export const mediaFileRegistry = new Map()

// 初始状态
const initialState = {
  // WASM 引擎状态
  isWasmReady: false,
  isWasmInitializing: false,
  
  // 媒体库
  mediaFiles: {}, // { id: { id, name, duration_ms, type, thumbnail, ... } }
  
  // 时间轴
  clips: [], // { id, mediaId, start_ms, duration_ms, track, type, offset_ms }
  fps: 30,
  width: 1920,
  height: 1080,
  
  // 播放状态
  isPlaying: false,
  currentTime_ms: 0,
  totalDuration_ms: 0,
  
  // 选中状态
  selectedClipId: null,
}

// 状态和监听器
let state = { ...initialState }
const listeners = new Set()

// 通知所有监听器
const notify = () => {
  listeners.forEach(listener => listener(state))
}

// 创建 store
export const timelineStore = {
  // 获取状态
  getState: () => state,
  
  // 订阅状态变化
  subscribe: (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  
  // 更新状态
  setState: (updates) => {
    state = { ...state, ...updates }
    notify()
  },
  
  // 重置状态
  reset: () => {
    mediaFileRegistry.clear()
    state = { ...initialState }
    notify()
  },
  
  // 初始化 WASM
  initWasm: async () => {
    if (state.isWasmReady || state.isWasmInitializing) return
    
    state.isWasmInitializing = true
    notify()
    
    try {
      const { videoEditorEngine } = await import('../utils/videoEditorEngine.js')
      await videoEditorEngine.initialize()
      state.isWasmReady = true
      console.log('[timelineStore] WASM 引擎初始化成功')
    } catch (err) {
      console.error('[timelineStore] WASM 初始化失败:', err)
      throw err
    } finally {
      state.isWasmInitializing = false
      notify()
    }
  },
  
  // 添加媒体文件
  addMediaFile: (mediaInfo, file) => {
    state.mediaFiles[mediaInfo.id] = mediaInfo
    if (file) {
      mediaFileRegistry.set(mediaInfo.id, file)
    }
    notify()
    return mediaInfo.id
  },
  
  // 移除媒体文件
  removeMediaFile: (id) => {
    delete state.mediaFiles[id]
    mediaFileRegistry.delete(id)
    // 同时移除相关的 clips
    state.clips = state.clips.filter(c => c.mediaId !== id)
    notify()
  },
  
  // 添加 Clip 到时间轴
  addClip: (clip) => {
    const newClip = {
      id: clip.id || `clip_${Date.now()}`,
      mediaId: clip.mediaId,
      start_ms: clip.start_ms || 0,
      duration_ms: clip.duration_ms || 1000,
      track: clip.track || 'video_1',
      type: clip.type || 'video',
      offset_ms: clip.offset_ms || 0,
    }
    state.clips.push(newClip)
    state.totalDuration_ms = Math.max(state.totalDuration_ms, newClip.start_ms + newClip.duration_ms)
    notify()
    return newClip.id
  },
  
  // 移除 Clip
  removeClip: (id) => {
    state.clips = state.clips.filter(c => c.id !== id)
    if (state.selectedClipId === id) {
      state.selectedClipId = null
    }
    // 重新计算总时长
    state.totalDuration_ms = state.clips.length > 0 
      ? Math.max(...state.clips.map(c => c.start_ms + c.duration_ms))
      : 0
    notify()
  },
  
  // 更新 Clip
  updateClip: (id, updates) => {
    const index = state.clips.findIndex(c => c.id === id)
    if (index !== -1) {
      state.clips[index] = { ...state.clips[index], ...updates }
      // 重新计算总时长
      state.totalDuration_ms = state.clips.length > 0 
        ? Math.max(...state.clips.map(c => c.start_ms + c.duration_ms))
        : 0
      notify()
    }
  },
  
  // 选中 Clip
  selectClip: (id) => {
    state.selectedClipId = id
    notify()
  },
  
  // 播放控制
  play: () => {
    state.isPlaying = true
    notify()
  },
  
  pause: () => {
    state.isPlaying = false
    notify()
  },
  
  seek: (time_ms) => {
    state.currentTime_ms = Math.max(0, Math.min(time_ms, state.totalDuration_ms))
    notify()
  },
  
  // 获取媒体文件
  getMediaFile: (id) => {
    return state.mediaFiles[id]
  },
  
  // 获取原始 File 对象
  getMediaBlob: async (id) => {
    return mediaFileRegistry.get(id)
  },
}

// React Hook 支持
export const useTimelineStore = () => {
  const [localState, setLocalState] = useState(state)
  
  useEffect(() => {
    const unsubscribe = timelineStore.subscribe((newState) => {
      setLocalState({ ...newState })
    })
    return unsubscribe
  }, [])
  
  return {
    ...localState,
    // 暴露方法
    initWasm: timelineStore.initWasm,
    addMediaFile: timelineStore.addMediaFile,
    removeMediaFile: timelineStore.removeMediaFile,
    addClip: timelineStore.addClip,
    removeClip: timelineStore.removeClip,
    updateClip: timelineStore.updateClip,
    selectClip: timelineStore.selectClip,
    play: timelineStore.play,
    pause: timelineStore.pause,
    seek: timelineStore.seek,
    getMediaFile: timelineStore.getMediaFile,
    getMediaBlob: timelineStore.getMediaBlob,
    reset: timelineStore.reset,
  }
}

// 用于非 React 环境的直接访问
export const {
  getState,
  setState,
  reset,
  initWasm,
  addMediaFile,
  removeMediaFile,
  addClip,
  removeClip,
  updateClip,
  selectClip,
  play,
  pause,
  seek,
  getMediaFile,
  getMediaBlob,
} = timelineStore

// 导出默认
export default timelineStore