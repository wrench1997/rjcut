import { sidecarPathForVideo } from '../digital-human-project/digitalHumanProject.js'

export const ADVANCED_EDIT_SCHEMA = 'rjcut.advanced-edit/v1'

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'])

function toMs(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number) : fallback
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function getFileExtension(path) {
  return String(path || '').split('.').pop()?.toLowerCase() || ''
}

export function metadataPathForVideo(videoPath) {
  const value = String(videoPath || '')
  if (!value) return ''
  return VIDEO_EXTENSIONS.has(getFileExtension(value))
    ? sidecarPathForVideo(value)
    : `${value}.rjcut.json`
}

export function getProjectSourceTimings(project) {
  const advanced = project?.advanced_edit
  return Array.isArray(advanced?.source_char_timings)
    ? advanced.source_char_timings
    : Array.isArray(project?.char_timings)
      ? project.char_timings
      : []
}

function sourceRangeForClip(clip) {
  const start = Math.max(0, toMs(clip?.offset_ms))
  const duration = Math.max(1, toMs(clip?.duration_ms, 1))
  return { start, end: start + duration }
}

function clipToJson(clip, media) {
  return {
    id: clip.id,
    media_id: clip.mediaId,
    media_name: media?.name || '',
    media_vfs_path: media?.vfsPath || '',
    type: clip.type || 'video',
    track: clip.track || 'video_1',
    start_ms: toMs(clip.start_ms),
    duration_ms: toMs(clip.duration_ms),
    offset_ms: toMs(clip.offset_ms),
    end_ms: toMs(clip.start_ms) + toMs(clip.duration_ms),
    fade: clone(clip.fade || null),
    transitions: clone(clip.transitions || null),
  }
}

function deriveCharTimings(sourceTimings, clips) {
  const result = []
  clips.forEach((clip) => {
    const range = sourceRangeForClip(clip)
    const clipStart = toMs(clip.start_ms)
    sourceTimings.forEach((timing, sourcePosition) => {
      const sourceStart = toMs(timing.start_ms ?? timing.start)
      const sourceEnd = Math.max(sourceStart + 1, toMs(timing.end_ms ?? timing.end, sourceStart + 1))
      const overlapStart = Math.max(sourceStart, range.start)
      const overlapEnd = Math.min(sourceEnd, range.end)
      if (overlapEnd <= overlapStart) return

      result.push({
        ...clone(timing),
        index: Number.isInteger(timing.index) ? timing.index : sourcePosition,
        source_index: Number.isInteger(timing.index) ? timing.index : sourcePosition,
        edit_clip_id: clip.id,
        start_ms: clipStart + overlapStart - range.start,
        end_ms: clipStart + overlapEnd - range.start,
      })
    })
  })

  return result.sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms)
}

function deriveSegments(sourceSegments, clips) {
  const result = []
  clips.forEach((clip) => {
    const range = sourceRangeForClip(clip)
    const clipStart = toMs(clip.start_ms)
    sourceSegments.forEach((segment, sourcePosition) => {
      const segmentStart = toMs(segment.start_ms ?? segment.start)
      const segmentEnd = Math.max(segmentStart + 1, toMs(segment.end_ms ?? segment.end, segmentStart + 1))
      const overlapStart = Math.max(segmentStart, range.start)
      const overlapEnd = Math.min(segmentEnd, range.end)
      if (overlapEnd <= overlapStart) return

      const nextStart = clipStart + overlapStart - range.start
      const nextEnd = clipStart + overlapEnd - range.start
      result.push({
        ...clone(segment),
        id: `${segment.id || `segment_${sourcePosition + 1}`}__${clip.id}`,
        source_segment_id: segment.id || `segment_${sourcePosition + 1}`,
        edit_clip_id: clip.id,
        start_ms: nextStart,
        end_ms: nextEnd,
        speech_end_ms: Math.min(toMs(segment.speech_end_ms, nextEnd), nextEnd),
        start: nextStart / 1000,
        end: nextEnd / 1000,
        duration_ms: nextEnd - nextStart,
        duration: (nextEnd - nextStart) / 1000,
      })
    })
  })

  return result.sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms)
}

function buildTimelineClips(segments) {
  return segments.map((segment) => ({
    id: segment.id,
    type: segment.type,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    slot_id: segment.slot_id || null,
    scene_file: segment.scene_file || null,
    scene_vfs_path: segment.scene_vfs_path || null,
    source_segment_id: segment.source_segment_id || null,
    edit_clip_id: segment.edit_clip_id || null,
    visual_tags: segment.visual_tags || [],
    edit_action: segment.edit_action,
    is_transition_segment: Boolean(segment.is_transition_segment || segment.type === 'scene'),
    transition: clone(segment.transition || null),
    keep_original_audio: segment.transition?.keep_original_audio !== false,
  }))
}

/**
 * 将时间轴上的非破坏性剪辑映射回数字人项目 JSON。
 * 原始 char_timings 保存在 advanced_edit.source_char_timings，当前时间轴使用
 * 重定位后的 char_timings，保证后续字幕/场景合成仍然拿到编辑后的时间。
 */
export function buildAdvancedEditedProject(project, clips, mediaFiles, sourceMediaId) {
  if (!project || typeof project !== 'object') return null

  const sourceClips = (clips || [])
    .filter((clip) => clip.mediaId === sourceMediaId && ['video', 'human', 'scene'].includes(clip.type || 'video'))
    .sort((a, b) => toMs(a.start_ms) - toMs(b.start_ms))
  if (!sourceClips.length) return clone(project)

  const sourceTimings = getProjectSourceTimings(project)
  const sourceSegments = Array.isArray(project.timeline?.segments) ? project.timeline.segments : []
  const derivedTimings = deriveCharTimings(sourceTimings, sourceClips)
  const derivedSegments = deriveSegments(sourceSegments, sourceClips)
  const durationMs = sourceClips.reduce(
    (max, clip) => Math.max(max, toMs(clip.start_ms) + toMs(clip.duration_ms)),
    0,
  )
  const sourceDurationMs = toMs(
    project.digital_human?.duration_ms || project.timeline?.duration_ms,
    sourceClips.reduce((max, clip) => Math.max(max, toMs(clip.offset_ms) + toMs(clip.duration_ms)), 0),
  )
  const editClips = sourceClips.map((clip) => clipToJson(clip, mediaFiles?.[clip.mediaId]))
  const timeline = {
    ...(clone(project.timeline) || {}),
    duration_ms: durationMs,
    video_info: {
      ...(clone(project.timeline?.video_info) || {}),
      duration_ms: durationMs,
    },
    char_timings: derivedTimings,
    segments: derivedSegments,
    clips: buildTimelineClips(derivedSegments),
    transition_clips: derivedSegments
      .filter((segment) => segment.type === 'scene' || segment.is_transition_segment)
      .map((segment) => ({
        ...clone(segment),
        segment_id: segment.id,
      })),
  }

  return {
    ...clone(project),
    char_timings: derivedTimings,
    timeline,
    digital_human: {
      ...(clone(project.digital_human) || {}),
      duration_ms: durationMs,
    },
    advanced_edit: {
      ...(clone(project.advanced_edit) || {}),
      schema: ADVANCED_EDIT_SCHEMA,
      edited_at: new Date().toISOString(),
      source_video_vfs_path: mediaFiles?.[sourceMediaId]?.vfsPath || project.digital_human?.video_vfs_path || '',
      source_duration_ms: sourceDurationMs,
      source_char_timings: clone(sourceTimings),
      clips: editClips,
      derived_char_timings: derivedTimings,
    },
  }
}

export function getAdvancedProjectStats(project) {
  const segments = Array.isArray(project?.timeline?.segments) ? project.timeline.segments : []
  const timings = Array.isArray(project?.char_timings) ? project.char_timings : []
  return {
    durationMs: toMs(project?.timeline?.duration_ms || project?.digital_human?.duration_ms),
    charTimingCount: timings.length,
    segmentCount: segments.length,
    sceneCount: segments.filter((segment) => segment.type === 'scene' || segment.is_transition_segment).length,
    hasAdvancedEdit: project?.advanced_edit?.schema === ADVANCED_EDIT_SCHEMA,
  }
}

export function validateAdvancedProject(value) {
  if (!value || typeof value !== 'object') throw new Error('JSON 必须是对象')
  if (!value.schema) throw new Error('缺少 schema 字段')
  if (!Array.isArray(value.char_timings)) throw new Error('char_timings 必须是数组')
  if (value.timeline && !Array.isArray(value.timeline.segments)) {
    throw new Error('timeline.segments 必须是数组')
  }
  return value
}
