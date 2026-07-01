import React, { useState } from 'react'
import { useTimelineStore } from '../../stores/timelineStore'
import { Volume2, Sun } from 'lucide-react'

/**
 * 淡入淡出控制组件
 * 用于设置选中片段的音频/视频淡入淡出效果
 */
export default function FadeControl() {
  const { selectedClipId, clips, setClipFade } = useTimelineStore()
  const [fadeDuration, setFadeDuration] = useState(500) // 默认 500ms
  
  const selectedClip = clips.find(c => c.id === selectedClipId)
  
  if (!selectedClip) {
    return (
      <div className="p-3 text-xs text-slate-500 text-center">
        选择片段以设置淡入淡出
      </div>
    )
  }
  
  const fade = selectedClip.fade || {}
  const fadeInDuration = fade.fadeIn || 0
  const fadeOutDuration = fade.fadeOut || 0
  
  const handleSetFadeIn = () => {
    if (fadeInDuration > 0) {
      setClipFade(selectedClipId, 'fadeIn', 0)
    } else {
      setClipFade(selectedClipId, 'fadeIn', fadeDuration)
    }
  }
  
  const handleSetFadeOut = () => {
    if (fadeOutDuration > 0) {
      setClipFade(selectedClipId, 'fadeOut', 0)
    } else {
      setClipFade(selectedClipId, 'fadeOut', fadeDuration)
    }
  }
  
  return (
    <div className="p-3 space-y-3">
      <h4 className="text-xs font-bold text-slate-300 border-b border-slate-700 pb-2">
        淡入淡出
      </h4>
      
      {/* 淡入时长选择 */}
      <div className="space-y-2">
        <label className="text-xs text-slate-400 block">
          淡入时长
        </label>
        <select
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
          value={fadeDuration}
          onChange={(e) => setFadeDuration(Number(e.target.value))}
        >
          <option value={250}>0.25 秒</option>
          <option value={500}>0.5 秒</option>
          <option value={1000}>1 秒</option>
          <option value={2000}>2 秒</option>
          <option value={3000}>3 秒</option>
        </select>
      </div>
      
      {/* 淡入控制 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Sun size={14} className="text-blue-400" />
          <span>淡入</span>
        </div>
        <button
          onClick={handleSetFadeIn}
          className={`px-3 py-1 rounded text-xs transition ${
            fadeInDuration > 0
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
        >
          {fadeInDuration > 0 ? `${(fadeInDuration / 1000).toFixed(1)}s` : '关闭'}
        </button>
      </div>
      
      {/* 淡出控制 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Volume2 size={14} className="text-green-400" />
          <span>淡出</span>
        </div>
        <button
          onClick={handleSetFadeOut}
          className={`px-3 py-1 rounded text-xs transition ${
            fadeOutDuration > 0
              ? 'bg-green-600 text-white'
              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
          }`}
        >
          {fadeOutDuration > 0 ? `${(fadeOutDuration / 1000).toFixed(1)}s` : '关闭'}
        </button>
      </div>
      
      {/* 可视化预览 */}
      {(fadeInDuration > 0 || fadeOutDuration > 0) && (
        <div className="mt-3 p-2 bg-slate-800 rounded">
          <div className="h-8 relative flex items-end">
            {/* 淡入区域 */}
            {fadeInDuration > 0 && (
              <div 
                className="h-full bg-gradient-to-r from-transparent to-blue-500/50"
                style={{ width: `${Math.min(50, (fadeInDuration / selectedClip.duration_ms) * 100)}%` }}
              />
            )}
            
            {/* 中间区域 */}
            <div className="flex-1 h-full bg-blue-500/20" />
            
            {/* 淡出区域 */}
            {fadeOutDuration > 0 && (
              <div 
                className="h-full bg-gradient-to-l from-transparent to-green-500/50"
                style={{ width: `${Math.min(50, (fadeOutDuration / selectedClip.duration_ms) * 100)}%` }}
              />
            )}
          </div>
          <div className="text-[9px] text-slate-500 mt-1 text-center">
            淡入：{(fadeInDuration / 1000).toFixed(1)}s | 淡出：{(fadeOutDuration / 1000).toFixed(1)}s
          </div>
        </div>
      )}
    </div>
  )
}