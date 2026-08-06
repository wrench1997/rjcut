/**
 * 视频编辑器时间轴状态管理
 * 使用简单的发布订阅模式，不依赖外部库
 */
import { useState, useEffect, useRef } from 'react'

// 媒体文件注册表 - 存储原始 File/Blob 对象
export const mediaFileRegistry = new Map()

// 初始状态
const initialState = {
  // WASM 引擎状态
  isWasmReady: false,
  isWasmInitializing: false,
  
  // 媒体库
  mediaFiles: {}, // { id: { id, name, duration_ms, type, thumbnail, waveform, ... } }
  
  // 时间轴
  clips: [], // { id, mediaId, start_ms, duration_ms, track, type, offset_ms, fade, transition }
  tracks: {}, // { trackId: { id, name, type, locked, hidden, volume, muted, solo } }
  fps: 30,
  width: 1920,
  height: 1080,
  
  // 播放状态
  isPlaying: false,
  currentTime_ms: 0,
  totalDuration_ms: 0,
  
  // 选中状态
  selectedClipId: null,
  
  // 转场效果
  transitions: {}, // { id: { id, type, duration_ms, clipId, position: 'start'|'end' } }
}

// 状态和监听器
let state = { ...initialState }
const listeners = new Set()

// 撤销/重做历史系统
const MAX_HISTORY_SIZE = 50
let historyStack = []
let redoStack = []
let isRecordingHistory = true // 允许关闭历史记录（批量操作时）

// 保存当前状态到历史
const saveToHistory = (actionType) => {
  if (!isRecordingHistory) return
  
  // 深拷贝当前状态（只保存关键数据）
  const snapshot = {
    clips: JSON.parse(JSON.stringify(state.clips)),
    currentTime_ms: state.currentTime_ms,
    totalDuration_ms: state.totalDuration_ms,
    actionType,
    timestamp: Date.now(),
  }
  
  historyStack.push(snapshot)
  
  // 限制历史记录大小
  if (historyStack.length > MAX_HISTORY_SIZE) {
    historyStack.shift()
  }
  
  // 清空 redo 栈（新操作后不能重做旧操作）
  redoStack = []
  
  console.log(`[History] 保存状态: ${actionType}, 历史栈大小: ${historyStack.length}`)
}

// 通知所有监听器。播放头更新不复制大对象，避免每个播放 tick 触发整页重渲染；
// 素材/片段发生结构变化时复制容器，让 selector 订阅能正确感知变化。
const notify = (structural = true) => {
  if (structural) {
    state = {
      ...state,
      clips: [...state.clips],
      mediaFiles: { ...state.mediaFiles },
      tracks: { ...state.tracks },
      transitions: { ...state.transitions },
    }
  }
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
    historyStack = []
    redoStack = []
    notify()
  },
  
  // 撤销
  undo: () => {
    if (historyStack.length === 0) {
      console.warn('[History] 没有可撤销的操作')
      return false
    }
    
    // 保存当前状态到 redo 栈
    const currentSnapshot = {
      clips: JSON.parse(JSON.stringify(state.clips)),
      currentTime_ms: state.currentTime_ms,
      totalDuration_ms: state.totalDuration_ms,
    }
    redoStack.push(currentSnapshot)
    
    // 恢复上一个状态
    const previousState = historyStack.pop()
    state.clips = previousState.clips
    state.currentTime_ms = previousState.currentTime_ms
    state.totalDuration_ms = previousState.totalDuration_ms
    
    console.log(`[History] 撤销操作：${previousState.actionType}`)
    notify()
    return true
  },
  
  // 重做
  redo: () => {
    if (redoStack.length === 0) {
      console.warn('[History] 没有可重做的操作')
      return false
    }
    
    // 保存当前状态到 history 栈
    const currentSnapshot = {
      clips: JSON.parse(JSON.stringify(state.clips)),
      currentTime_ms: state.currentTime_ms,
      totalDuration_ms: state.totalDuration_ms,
      actionType: 'REDO',
    }
    historyStack.push(currentSnapshot)
    
    // 恢复下一个状态
    const nextState = redoStack.pop()
    state.clips = nextState.clips
    state.currentTime_ms = nextState.currentTime_ms
    state.totalDuration_ms = nextState.totalDuration_ms
    
    console.log(`[History] 重做操作`)
    notify()
    return true
  },
  
  // 获取历史状态信息
  getHistoryInfo: () => ({
    canUndo: historyStack.length > 0,
    canRedo: redoStack.length > 0,
    historySize: historyStack.length,
    redoSize: redoStack.length,
  }),
  
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
    saveToHistory('ADD_CLIP')
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
    saveToHistory('REMOVE_CLIP')
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
    saveToHistory('UPDATE_CLIP')
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
  
  // 添加新轨道
  addTrack: (trackType = 'video', options = {}) => {
    const existingTracks = [...new Set(state.clips.map(c => c.track))]
    const sameTypeTracks = existingTracks.filter(t => t.startsWith(trackType))
    const nextIndex = sameTypeTracks.length + 1
    const newTrackId = `${trackType}_${nextIndex}`
    
    // 初始化轨道配置
    state.tracks[newTrackId] = {
      id: newTrackId,
      name: options.name || `${trackType.toUpperCase()} ${nextIndex}`,
      type: trackType,
      locked: options.locked || false,
      hidden: options.hidden || false,
      volume: options.volume !== undefined ? options.volume : 1.0,
      muted: options.muted || false,
      solo: options.solo || false,
    }
    
    console.log('[timelineStore] 添加轨道:', newTrackId, state.tracks[newTrackId])
    notify()
    return newTrackId
  },
  
  // 移除轨道
  removeTrack: (trackId) => {
    const hasClips = state.clips.some(c => c.track === trackId)
    if (hasClips) {
      console.warn('[Track] 无法删除轨道，上面还有片段')
      return false
    }
    
    delete state.tracks[trackId]
    notify()
    return true
  },
  
  // 更新轨道属性
  updateTrack: (trackId, updates) => {
    if (!state.tracks[trackId]) {
      console.warn('[Track] 轨道不存在:', trackId)
      return false
    }
    
    state.tracks[trackId] = {
      ...state.tracks[trackId],
      ...updates,
    }
    notify()
    return true
  },
  
  // 锁定/解锁轨道
  toggleTrackLock: (trackId) => {
    if (state.tracks[trackId]) {
      state.tracks[trackId].locked = !state.tracks[trackId].locked
      notify()
    }
  },
  
  // 隐藏/显示轨道
  toggleTrackVisibility: (trackId) => {
    if (state.tracks[trackId]) {
      state.tracks[trackId].hidden = !state.tracks[trackId].hidden
      notify()
    }
  },
  
  // 设置轨道音量
  setTrackVolume: (trackId, volume) => {
    if (state.tracks[trackId]) {
      state.tracks[trackId].volume = Math.max(0, Math.min(1, volume))
      notify()
    }
  },
  
  // 静音/取消静音轨道
  toggleTrackMute: (trackId) => {
    if (state.tracks[trackId]) {
      state.tracks[trackId].muted = !state.tracks[trackId].muted
      notify()
    }
  },
  
  // 独奏轨道
  toggleTrackSolo: (trackId) => {
    if (state.tracks[trackId]) {
      // 如果已经是独奏，取消独奏
      if (state.tracks[trackId].solo) {
        state.tracks[trackId].solo = false
      } else {
        // 取消其他轨道的独奏
        Object.keys(state.tracks).forEach(tid => {
          state.tracks[tid].solo = false
        })
        state.tracks[trackId].solo = true
      }
      notify()
    }
  },
  
  // 获取轨道信息
  getTrack: (trackId) => {
    return state.tracks[trackId] || null
  },
  
  // 获取所有轨道
  getAllTracks: () => {
    return { ...state.tracks }
  },
  
  // ============ 转场效果支持 ============
  
  // 添加转场效果
  addTransition: (clipId, type = 'crossfade', duration_ms = 500, position = 'end') => {
    const transitionId = `trans_${Date.now()}`
    
    state.transitions[transitionId] = {
      id: transitionId,
      type, // 'crossfade', 'fadein', 'fadeout', 'wipe', 'dissolve'
      duration_ms,
      clipId,
      position, // 'start' 或 'end'
    }
    
    // 更新片段的转场信息
    const clip = state.clips.find(c => c.id === clipId)
    if (clip) {
      if (!clip.transitions) {
        clip.transitions = {}
      }
      clip.transitions[position] = transitionId
    }
    
    notify()
    return transitionId
  },
  
  // 移除转场效果
  removeTransition: (transitionId) => {
    const transition = state.transitions[transitionId]
    if (!transition) return false
    
    // 清除片段上的转场引用
    const clip = state.clips.find(c => c.id === transition.clipId)
    if (clip && clip.transitions) {
      delete clip.transitions[transition.position]
    }
    
    delete state.transitions[transitionId]
    notify()
    return true
  },
  
  // 更新转场效果
  updateTransition: (transitionId, updates) => {
    if (!state.transitions[transitionId]) return false
    
    state.transitions[transitionId] = {
      ...state.transitions[transitionId],
      ...updates,
    }
    notify()
    return true
  },
  
  // 获取片段的转场
  getClipTransitions: (clipId) => {
    const clip = state.clips.find(c => c.id === clipId)
    if (!clip || !clip.transitions) return {}
    
    const result = {}
    Object.entries(clip.transitions).forEach(([pos, transId]) => {
      if (state.transitions[transId]) {
        result[pos] = state.transitions[transId]
      }
    })
    return result
  },
  
  // ============ 字幕轨道支持 ============
  
  // 添加字幕片段
  addSubtitleClip: (subtitleData) => {
    const newClip = {
      id: subtitleData.id || `subtitle_${Date.now()}`,
      mediaId: subtitleData.mediaId,
      start_ms: subtitleData.start_ms || 0,
      duration_ms: subtitleData.duration_ms || 1000,
      track: subtitleData.track || 'subtitle_1',
      type: 'subtitle',
      offset_ms: 0,
      content: subtitleData.content || '', // 字幕文本
      style: subtitleData.style || { // 字幕样式
        fontSize: 24,
        fontFamily: 'Arial',
        color: '#FFFFFF',
        backgroundColor: 'rgba(0,0,0,0.5)',
        position: 'bottom', // 'top', 'middle', 'bottom'
      },
    }
    
    state.clips.push(newClip)
    state.totalDuration_ms = Math.max(state.totalDuration_ms, newClip.start_ms + newClip.duration_ms)
    notify()
    return newClip.id
  },
  
  // 更新字幕内容
  updateSubtitleContent: (clipId, content) => {
    const clip = state.clips.find(c => c.id === clipId)
    if (clip && clip.type === 'subtitle') {
      clip.content = content
      notify()
      return true
    }
    return false
  },
  
  // 更新字幕样式
  updateSubtitleStyle: (clipId, style) => {
    const clip = state.clips.find(c => c.id === clipId)
    if (clip && clip.type === 'subtitle') {
      clip.style = { ...clip.style, ...style }
      notify()
      return true
    }
    return false
  },
  
  // ============ 音频波形支持 ============
  
  // 设置音频波形数据
  setWaveformData: (mediaId, waveform) => {
    if (state.mediaFiles[mediaId]) {
      state.mediaFiles[mediaId].waveform = waveform
      notify()
      return true
    }
    return false
  },
  
  // 获取音频波形数据
  getWaveformData: (mediaId) => {
    return state.mediaFiles[mediaId]?.waveform || null
  },
  
  // 移除空轨道
  removeEmptyTrack: (trackId) => {
    const hasClips = state.clips.some(c => c.track === trackId)
    if (hasClips) {
      return false // 轨道上有片段，不能删除
    }
    delete state.tracks[trackId]
    notify()
    return true
  },
  
  // 吸附辅助：获取所有吸附点
  getSnapPoints: () => {
    const points = [0] // 时间轴起点
    
    // 添加播放头位置
    points.push(state.currentTime_ms)
    
    // 添加所有片段的开始和结束位置
    state.clips.forEach(clip => {
      points.push(clip.start_ms)
      points.push(clip.start_ms + clip.duration_ms)
    })
    
    return [...new Set(points)].sort((a, b) => a - b)
  },
  
  // 吸附到最近的点
  snapToNearest: (time_ms, threshold_ms = 200) => {
    const snapPoints = timelineStore.getSnapPoints()
    let nearestPoint = time_ms
    let minDistance = threshold_ms
    
    snapPoints.forEach(point => {
      const distance = Math.abs(point - time_ms)
      if (distance < minDistance) {
        minDistance = distance
        nearestPoint = point
      }
    })
    
    return { snappedTime: nearestPoint, snapped: minDistance < threshold_ms }
  },
  
  // 分割 Clip（在指定时间位置）
  splitClip: (id, splitTime_ms) => {
    const index = state.clips.findIndex(c => c.id === id)
    if (index === -1) return null
    
    const clip = state.clips[index]
    const clipEnd_ms = clip.start_ms + clip.duration_ms
    
    // 检查分割点是否在片段内部
    if (splitTime_ms <= clip.start_ms || splitTime_ms >= clipEnd_ms) {
      return null
    }
    
    saveToHistory('SPLIT_CLIP')
    
    // 计算分割点相对于片段开始的位置
    const splitOffset_ms = splitTime_ms - clip.start_ms
    
    // 创建新片段（后半部分）
    const newClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      mediaId: clip.mediaId,
      start_ms: splitTime_ms,
      duration_ms: clip.duration_ms - splitOffset_ms,
      track: clip.track,
      type: clip.type,
      offset_ms: clip.offset_ms + splitOffset_ms,
    }
    
    // 修改原片段（保留前半部分）
    state.clips[index].duration_ms = splitOffset_ms
    
    // 插入新片段
    state.clips.splice(index + 1, 0, newClip)
    
    notify()
    return newClip
  },
  
  // 调整 Clip 时长（从右侧拖动）
  resizeClip: (id, newDuration_ms) => {
    const index = state.clips.findIndex(c => c.id === id)
    if (index !== -1) {
      const clip = state.clips[index]
      const media = state.mediaFiles[clip.mediaId]
      
      // 计算最大可用时长（媒体文件剩余部分）
      const mediaDuration_ms = media?.duration_ms || clip.duration_ms
      const maxDuration_ms = mediaDuration_ms - clip.offset_ms
      
      // 限制最小和最大时长
      const minDuration = 100 // 最小 100ms
      const clampedDuration = Math.max(minDuration, Math.min(newDuration_ms, maxDuration_ms))
      
      state.clips[index].duration_ms = clampedDuration
      state.totalDuration_ms = state.clips.length > 0 
        ? Math.max(...state.clips.map(c => c.start_ms + c.duration_ms))
        : 0
      notify()
    }
  },
  
  // 修剪 Clip 开始位置（从左侧拖动）
  trimClipStart: (id, newStart_ms, newOffset_ms) => {
    const index = state.clips.findIndex(c => c.id === id)
    if (index !== -1) {
      const clip = state.clips[index]
      const media = state.mediaFiles[clip.mediaId]
      
      // 计算时长变化
      const offsetDelta_ms = newOffset_ms - clip.offset_ms
      const newDuration_ms = clip.duration_ms - offsetDelta_ms
      
      // 限制最小和最大时长
      const mediaDuration_ms = media?.duration_ms || clip.duration_ms
      const minDuration = 100
      const clampedDuration = Math.max(minDuration, Math.min(newDuration_ms, mediaDuration_ms - newOffset_ms))
      
      state.clips[index] = {
        ...clip,
        start_ms: newStart_ms,
        offset_ms: newOffset_ms,
        duration_ms: clampedDuration,
      }
      state.totalDuration_ms = state.clips.length > 0 
        ? Math.max(...state.clips.map(c => c.start_ms + c.duration_ms))
        : 0
      notify()
    }
  },
  
  // 剪贴板（用于复制/粘贴）
  clipboard: null,
  
  // 复制片段
  copyClip: (id) => {
    const clip = state.clips.find(c => c.id === id)
    if (!clip) return false
    
    // 深拷贝片段
    timelineStore.clipboard = {
      ...clip,
      copiedAt: Date.now(),
    }
    console.log('[History] 已复制片段:', id)
    return true
  },
  
  // 粘贴片段
  pasteClip: (position_ms, trackId) => {
    if (!timelineStore.clipboard) return null
    
    const original = timelineStore.clipboard
    
    saveToHistory('PASTE_CLIP')
    
    // 创建新片段（粘贴）
    const newClip = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      mediaId: original.mediaId,
      start_ms: position_ms !== undefined ? position_ms : original.start_ms,
      duration_ms: original.duration_ms,
      track: trackId || original.track,
      type: original.type,
      offset_ms: original.offset_ms,
      fade: original.fade,
    }
    
    state.clips.push(newClip)
    state.totalDuration_ms = Math.max(state.totalDuration_ms, newClip.start_ms + newClip.duration_ms)
    notify()
    return newClip
  },
  
  // 波纹删除（删除片段并闭合间隙）
  rippleRemove: (id) => {
    const index = state.clips.findIndex(c => c.id === id)
    if (index === -1) return
    
    const removedClip = state.clips[index]
    const gapDuration = removedClip.duration_ms
    const gapStart = removedClip.start_ms
    
    saveToHistory('RIPPLE_REMOVE')
    
    // 删除片段
    state.clips.splice(index, 1)
    
    // 将右侧所有片段向左移动
    state.clips.forEach(clip => {
      if (clip.start_ms >= gapStart) {
        clip.start_ms = Math.max(0, clip.start_ms - gapDuration)
      }
    })
    
    // 重新计算总时长
    state.totalDuration_ms = state.clips.length > 0 
      ? Math.max(...state.clips.map(c => c.start_ms + c.duration_ms))
      : 0
    
    if (state.selectedClipId === id) {
      state.selectedClipId = null
    }
    
    notify()
  },
  
  // 波纹插入（插入间隙并移动后续片段）
  rippleInsertGap: (position_ms, gapDuration_ms) => {
    // 将位置右侧的所有片段向右移动
    state.clips.forEach(clip => {
      if (clip.start_ms >= position_ms) {
        clip.start_ms += gapDuration_ms
      }
    })
    
    state.totalDuration_ms = state.clips.length > 0 
      ? Math.max(...state.clips.map(c => c.start_ms + c.duration_ms))
      : 0
    
    notify()
  },
  
  // 设置片段淡入淡出
  setClipFade: (id, fadeType, duration_ms) => {
    const index = state.clips.findIndex(c => c.id === id)
    if (index !== -1) {
      const clip = state.clips[index]
      state.clips[index] = {
        ...clip,
        fade: {
          ...clip.fade,
          [fadeType]: duration_ms,
        },
      }
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
    notify(false)
  },
  
  pause: () => {
    state.isPlaying = false
    notify(false)
  },
  
  seek: (time_ms) => {
    state.currentTime_ms = Math.max(0, Math.min(time_ms, state.totalDuration_ms))
    notify(false)
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
function shallowEqual(left, right) {
  if (Object.is(left, right)) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  return leftKeys.every((key) => Object.is(left[key], right[key]))
}

/**
 * 支持按字段订阅，避免播放头每次 seek 都让整个编辑器重渲染。
 * 不传 selector 时保持旧的完整状态接口；传 selector 时只在选中字段变化时更新。
 */
export const useTimelineStore = (selector = null) => {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const [localState, setLocalState] = useState(() => (
    selector ? selector(state) : state
  ))

  useEffect(() => {
    const unsubscribe = timelineStore.subscribe((newState) => {
      setLocalState((previous) => {
        const next = selectorRef.current
          ? selectorRef.current(newState)
          : { ...newState }
        return selectorRef.current && shallowEqual(previous, next) ? previous : next
      })
    })
    return unsubscribe
  }, [])

  if (selector) return localState

  return {
    ...localState,
    // 暴露方法
    initWasm: timelineStore.initWasm,
    addMediaFile: timelineStore.addMediaFile,
    removeMediaFile: timelineStore.removeMediaFile,
    addClip: timelineStore.addClip,
    removeClip: timelineStore.removeClip,
    rippleRemove: timelineStore.rippleRemove,
    updateClip: timelineStore.updateClip,
    splitClip: timelineStore.splitClip,
    resizeClip: timelineStore.resizeClip,
    trimClipStart: timelineStore.trimClipStart,
    addTrack: timelineStore.addTrack,
    removeTrack: timelineStore.removeTrack,
    removeEmptyTrack: timelineStore.removeEmptyTrack,
    updateTrack: timelineStore.updateTrack,
    toggleTrackLock: timelineStore.toggleTrackLock,
    toggleTrackVisibility: timelineStore.toggleTrackVisibility,
    setTrackVolume: timelineStore.setTrackVolume,
    toggleTrackMute: timelineStore.toggleTrackMute,
    toggleTrackSolo: timelineStore.toggleTrackSolo,
    getTrack: timelineStore.getTrack,
    getAllTracks: timelineStore.getAllTracks,
    // 转场效果
    addTransition: timelineStore.addTransition,
    removeTransition: timelineStore.removeTransition,
    updateTransition: timelineStore.updateTransition,
    getClipTransitions: timelineStore.getClipTransitions,
    // 字幕
    addSubtitleClip: timelineStore.addSubtitleClip,
    updateSubtitleContent: timelineStore.updateSubtitleContent,
    updateSubtitleStyle: timelineStore.updateSubtitleStyle,
    // 音频波形
    setWaveformData: timelineStore.setWaveformData,
    getWaveformData: timelineStore.getWaveformData,
    getSnapPoints: timelineStore.getSnapPoints,
    snapToNearest: timelineStore.snapToNearest,
    setClipFade: timelineStore.setClipFade,
    selectClip: timelineStore.selectClip,
    play: timelineStore.play,
    pause: timelineStore.pause,
    seek: timelineStore.seek,
    getMediaFile: timelineStore.getMediaFile,
    getMediaBlob: timelineStore.getMediaBlob,
    reset: timelineStore.reset,
    // 撤销/重做
    undo: timelineStore.undo,
    redo: timelineStore.redo,
    getHistoryInfo: timelineStore.getHistoryInfo,
    // 复制/粘贴
    copyClip: timelineStore.copyClip,
    pasteClip: timelineStore.pasteClip,
    clipboard: timelineStore.clipboard,
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
  splitClip,
  resizeClip,
  trimClipStart,
  selectClip,
  play,
  pause,
  seek,
  getMediaFile,
  getMediaBlob,
} = timelineStore

// 导出默认
export default timelineStore
