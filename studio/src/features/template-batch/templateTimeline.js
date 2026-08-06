/**
 * 模板混剪的统一时间边界。
 *
 * 数字人生成接口的 duration_ms 可能包含口播结束后的尾帧/静音，
 * 模板混剪必须以最后一个 char_timing.end_ms 作为成片终点，避免空镜
 * 在人物说完后继续播放。
 */

function toPositiveMs(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function maxCharTimingEndMs(value) {
  if (!Array.isArray(value)) return 0
  return value.reduce((max, item) => Math.max(max, toPositiveMs(item?.end_ms ?? item?.end)), 0)
}

export function getTemplateSpeechEndMs(timeline, source = null) {
  const candidates = [
    source?.speech_end_ms,
    source?.timeline?.speech_end_ms,
    timeline?.speech_end_ms,
  ]
  for (const value of candidates) {
    const explicit = toPositiveMs(value)
    if (explicit) return explicit
  }

  const timingEnd = Math.max(
    maxCharTimingEndMs(source?.char_timings),
    maxCharTimingEndMs(source?.timeline?.char_timings),
    maxCharTimingEndMs(timeline?.char_timings),
  )
  if (timingEnd) return timingEnd

  return toPositiveMs(
    timeline?.duration_ms
      ?? timeline?.video_info?.duration_ms
      ?? source?.digital_human?.duration_ms,
  )
}

function normalizeSegment(segment, index) {
  const startMs = Math.round(Number(segment?.start_ms ?? Number(segment?.start || 0) * 1000))
  const endMs = Math.round(Number(segment?.end_ms ?? Number(segment?.end || 0) * 1000))
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
  const requestedScene = segment?.type === 'scene' || segment?.visual_mode === 'scene'
  const hasSceneMaterial = Boolean(segment?.scene_vfs_path || segment?.scene_file)
  const type = requestedScene && hasSceneMaterial ? 'scene' : 'human'
  const fallbackToHuman = requestedScene && !hasSceneMaterial
  return {
    ...segment,
    id: segment?.id || `segment_${index + 1}`,
    start_ms: startMs,
    end_ms: endMs,
    start: startMs / 1000,
    end: endMs / 1000,
    duration_ms: endMs - startMs,
    duration: (endMs - startMs) / 1000,
    type,
    visual_mode: type,
    ...(fallbackToHuman
      ? {
          scene_file: null,
          scene_vfs_path: null,
          edit_action: 'keep_digital_human',
          is_transition_segment: false,
          transition: {
            ...(segment?.transition || {}),
            enabled: false,
            action: 'keep_digital_human',
          },
        }
      : {}),
  }
}

/**
 * 返回相邻片段在源时间轴上的空档，便于渲染前诊断旧 JSON。
 * 这里的空档不是成片应有的空白，而是上一段裁切边界没有覆盖到下一段起点。
 */
export function getTimelineGaps(segments, thresholdMs = 1) {
  if (!Array.isArray(segments)) return []
  const normalized = segments
    .map(normalizeSegment)
    .filter(Boolean)
  const gaps = []
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const current = normalized[index]
    const next = normalized[index + 1]
    const gapMs = next.start_ms - current.end_ms
    if (gapMs >= Math.max(1, Number(thresholdMs) || 1)) {
      gaps.push({
        before_segment_id: current.id,
        after_segment_id: next.id,
        start_ms: current.end_ms,
        end_ms: next.start_ms,
        duration_ms: gapMs,
      })
    }
  }
  return gaps
}

/**
 * 将同一源视频上的相邻片段封闭为连续区间。
 * 片段的真正源起点不变，只把前一段延长到后一段起点，避免裁切后丢失
 * 两段之间原本存在的画面/声音。最后一段保持原边界，由调用方决定是否截断。
 */
export function closeTimelineSegmentGaps(segments) {
  if (!Array.isArray(segments)) return []
  return segments.map((segment, index) => {
    const nextStartMs = Number(segments[index + 1]?.start_ms)
    const currentEndMs = Number(segment.end_ms)
    if (!Number.isFinite(currentEndMs) || !Number.isFinite(nextStartMs) || nextStartMs <= currentEndMs) {
      return segment
    }
    return {
      ...segment,
      end_ms: nextStartMs,
      end: nextStartMs / 1000,
      duration_ms: nextStartMs - segment.start_ms,
      duration: (nextStartMs - segment.start_ms) / 1000,
    }
  })
}

function toTransitionClip(segment) {
  return {
    segment_id: segment.id,
    text: segment.text,
    start_ms: segment.start_ms,
    end_ms: segment.end_ms,
    duration_ms: segment.duration_ms,
    slot_id: segment.slot_id || null,
    scene_vfs_path: segment.scene_vfs_path || null,
    visual_tags: segment.visual_tags || [],
    action: segment.edit_action || 'replace_visual',
    keep_original_audio: segment.transition?.keep_original_audio !== false,
  }
}

export function clampTemplateTimelineToSpeechEnd(timeline, speechEndMs) {
  if (!timeline || !Array.isArray(timeline.segments)) return timeline
  const endMs = toPositiveMs(speechEndMs) || getTemplateSpeechEndMs(timeline)
  if (!endMs) return timeline

  const normalized = timeline.segments
    .map(normalizeSegment)
    .filter(Boolean)
  const segments = normalized
    .filter((segment) => segment.start_ms < endMs)
    .map((segment) => {
      const clippedEndMs = Math.min(segment.end_ms, endMs)
      return clippedEndMs > segment.start_ms
        ? {
            ...segment,
            end_ms: clippedEndMs,
            end: clippedEndMs / 1000,
            duration_ms: clippedEndMs - segment.start_ms,
            duration: (clippedEndMs - segment.start_ms) / 1000,
          }
        : null
    })
    .filter(Boolean)

  // 旧项目可能只保存了每段口播字词的精确范围，例如上一段到 7 秒、
  // 下一段从 13 秒开始。渲染器会按 segments 单独裁切，若不封闭区间，
  // 7-13 秒的原生画面/声音就会被直接丢掉，成片会出现真空。
  // 仅向前延长到下一段起点，不改变每段真正的源起点，也不延长最后一段。
  const closedSegments = closeTimelineSegmentGaps(segments).map((segment) => {
    const end = Math.min(segment.end_ms, endMs)
    return end > segment.start_ms
      ? {
          ...segment,
          end_ms: end,
          end: end / 1000,
          duration_ms: end - segment.start_ms,
          duration: (end - segment.start_ms) / 1000,
        }
      : null
  }).filter(Boolean)

  // 字级时间轴是权威边界；如果旧数据最后一段提前结束，补齐到口播结束，
  // 但绝不把任何片段延长到口播结束之后。
  const last = closedSegments.at(-1)
  if (last && last.end_ms < endMs) {
    last.end_ms = endMs
    last.end = endMs / 1000
    last.duration_ms = endMs - last.start_ms
    last.duration = (endMs - last.start_ms) / 1000
  }

  const clipById = Array.isArray(timeline.clips)
    ? new Map(timeline.clips.map((clip) => [clip.id, clip]))
    : null
  const clips = Array.isArray(timeline.clips)
    ? closedSegments.map((segment, index) => ({
        ...(clipById.get(segment.id) || timeline.clips[index] || {}),
        id: segment.id,
        type: segment.type,
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        duration_ms: segment.duration_ms,
        slot_id: segment.slot_id || null,
        scene_vfs_path: segment.scene_vfs_path || null,
      }))
    : timeline.clips
  const transitionClips = closedSegments
    .filter((segment) => segment.type === 'scene' || segment.is_transition_segment)
    .map(toTransitionClip)

  return {
    ...timeline,
    speech_end_ms: endMs,
    duration_ms: endMs,
    video_info: { ...(timeline.video_info || {}), duration_ms: endMs },
    segments: closedSegments,
    ...(Array.isArray(timeline.clips) ? { clips } : {}),
    transition_clips: transitionClips,
  }
}

export function normalizeTemplateTimeline(timeline, source = null) {
  if (!timeline || typeof timeline !== 'object') throw new Error('timeline.json 无效')
  if (!Array.isArray(timeline.segments) || timeline.segments.length === 0) {
    throw new Error('timeline.json 中没有 segments')
  }
  const normalized = {
    ...timeline,
    segments: timeline.segments.map(normalizeSegment).filter(Boolean),
  }
  if (!normalized.segments.length) throw new Error('timeline.json 中没有有效 segments')
  return clampTemplateTimelineToSpeechEnd(
    normalized,
    getTemplateSpeechEndMs(normalized, source),
  )
}
