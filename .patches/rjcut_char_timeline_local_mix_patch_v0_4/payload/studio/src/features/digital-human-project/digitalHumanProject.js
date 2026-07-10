export const DIGITAL_HUMAN_PROJECT_SCHEMA = 'rjcut.digital-human-project/v1'
export const LOCAL_TIMELINE_SCHEMA = 'rjcut.local-timeline/v1'

const DIRECTOR_WORD_RE = /(转场|切镜|镜头切到|画面切到|画面给到|这里放素材|插入素材)/gi

export function cleanSpokenText(value) {
  return String(value || '')
    .replace(DIRECTOR_WORD_RE, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sentenceSegments(text) {
  const parts = cleanSpokenText(text)
    .split(/(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean)

  return parts.map((part, index) => ({
    id: `s${index + 1}`,
    text: part,
    purpose: index === 0 ? 'hook' : index === parts.length - 1 ? 'close' : 'explain',
    visual_mode: index === 0 || index === parts.length - 1 ? 'human' : 'auto',
    visual_tags: [],
    slot_id: null,
  }))
}

export function normalizeCopywritingPlan(raw, fallbackText = '') {
  const source = raw && typeof raw === 'object' ? raw : {}
  const spokenText = cleanSpokenText(source.spoken_text || source.text || fallbackText)
  const rawSegments = Array.isArray(source.segments) && source.segments.length
    ? source.segments
    : sentenceSegments(spokenText)

  let sceneIndex = 0
  const segments = rawSegments
    .map((segment, index) => {
      const text = cleanSpokenText(segment?.text || '')
      if (!text) return null
      const originalFlag = String(segment?.flag || segment?.visual_mode || '').toLowerCase()
      const visualMode = ['scene', 'transition'].includes(originalFlag)
        ? 'scene'
        : ['hook', 'human', 'ending'].includes(originalFlag)
          ? 'human'
          : ['human', 'scene', 'auto'].includes(originalFlag)
            ? originalFlag
            : 'auto'
      if (visualMode === 'scene') sceneIndex += 1
      return {
        id: String(segment?.id || `s${index + 1}`),
        text,
        purpose: String(segment?.purpose || (index === 0 ? 'hook' : index === rawSegments.length - 1 ? 'close' : 'explain')),
        visual_mode: visualMode,
        visual_tags: Array.isArray(segment?.visual_tags) ? segment.visual_tags.map(String).filter(Boolean) : [],
        slot_id: segment?.slot_id || (visualMode === 'scene' ? `slot_${sceneIndex}` : null),
        note: String(segment?.note || ''),
      }
    })
    .filter(Boolean)

  return {
    schema: 'rjcut.copywriting-plan/v1',
    spoken_text: spokenText || segments.map((item) => item.text).join(''),
    segments,
    meta: source.meta && typeof source.meta === 'object' ? source.meta : {},
  }
}

function normalizeTimingItem(item, fallbackIndex) {
  return {
    index: Number.isInteger(item?.index) ? item.index : fallbackIndex,
    char: String(item?.char ?? item?.text ?? ''),
    start_ms: Math.round(Number(item?.start_ms ?? item?.start ?? 0)),
    end_ms: Math.round(Number(item?.end_ms ?? item?.end ?? item?.start_ms ?? item?.start ?? 0)),
  }
}

export function normalizeCharTimings(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeTimingItem).filter((item) => Number.isFinite(item.start_ms) && Number.isFinite(item.end_ms))
}

function compactTextWithMap(value) {
  const chars = Array.from(String(value || ''))
  const compact = []
  const map = []
  chars.forEach((char, index) => {
    if (/\s/u.test(char)) return
    compact.push(char)
    map.push(index)
  })
  return { text: compact.join(''), map }
}

function findSegmentRange(spokenText, segmentText, searchFrom = 0) {
  const full = Array.from(spokenText).join('')
  const target = Array.from(segmentText).join('')
  let start = full.indexOf(target, searchFrom)

  if (start < 0) {
    const compactFull = compactTextWithMap(full)
    const compactTarget = compactTextWithMap(target)
    let compactStart = compactFull.text.indexOf(compactTarget.text)
    while (compactStart >= 0) {
      const originalStart = compactFull.map[compactStart]
      if (originalStart >= searchFrom) {
        start = originalStart
        break
      }
      compactStart = compactFull.text.indexOf(compactTarget.text, compactStart + 1)
    }
  }

  if (start < 0) return null
  return { start, end: start + Array.from(target).length - 1 }
}

function nearestTiming(timingMap, timings, index, direction) {
  if (timingMap.has(index)) return timingMap.get(index)
  if (direction === 'right') {
    for (let i = index; i <= index + 100; i += 1) if (timingMap.has(i)) return timingMap.get(i)
  } else {
    for (let i = index; i >= 0; i -= 1) if (timingMap.has(i)) return timingMap.get(i)
  }
  return timings[Math.max(0, Math.min(index, timings.length - 1))] || null
}

export function mapPlanToTimeline(planInput, charTimingsInput) {
  const plan = normalizeCopywritingPlan(planInput)
  const charTimings = normalizeCharTimings(charTimingsInput)
  if (!plan.spoken_text) throw new Error('项目 JSON 缺少 spoken_text')
  if (!charTimings.length) throw new Error('项目 JSON 缺少 char_timings')

  const timingMap = new Map(charTimings.map((item) => [item.index, item]))
  let cursor = 0
  const segments = []

  plan.segments.forEach((segment, index) => {
    const charRange = findSegmentRange(plan.spoken_text, segment.text, cursor)
    if (!charRange) throw new Error(`文案段落无法映射到原文：${segment.text.slice(0, 30)}`)
    cursor = charRange.end + 1
    const startTiming = nearestTiming(timingMap, charTimings, charRange.start, 'right')
    const endTiming = nearestTiming(timingMap, charTimings, charRange.end, 'left')
    if (!startTiming || !endTiming) throw new Error(`文案段落缺少字级时间：${segment.id}`)

    const startMs = startTiming.start_ms
    const speechEndMs = Math.max(startMs + 1, endTiming.end_ms)
    segments.push({
      id: segment.id || `s${index + 1}`,
      type: segment.visual_mode === 'scene' ? 'scene' : 'human',
      visual_mode: segment.visual_mode,
      purpose: segment.purpose,
      text: segment.text,
      start_ms: startMs,
      end_ms: speechEndMs,
      speech_end_ms: speechEndMs,
      start: startMs / 1000,
      end: speechEndMs / 1000,
      duration_ms: speechEndMs - startMs,
      duration: (speechEndMs - startMs) / 1000,
      char_start: charRange.start,
      char_end: charRange.end,
      slot_id: segment.slot_id || null,
      visual_tags: segment.visual_tags || [],
      note: segment.note || '',
    })
  })

  // 按相邻段落起点重新封闭区间，保留句间停顿，避免本地裁切后语速变快。
  const totalEndMs = Math.max(...charTimings.map((item) => item.end_ms || 0))
  segments.forEach((segment, index) => {
    const startMs = index === 0 ? 0 : segment.start_ms
    const endMs = index < segments.length - 1
      ? Math.max(startMs + 1, segments[index + 1].start_ms)
      : Math.max(startMs + 1, totalEndMs, segment.speech_end_ms)
    segment.start_ms = startMs
    segment.end_ms = endMs
    segment.start = startMs / 1000
    segment.end = endMs / 1000
    segment.duration_ms = endMs - startMs
    segment.duration = (endMs - startMs) / 1000
  })

  return segments
}

export function buildDigitalHumanProject({
  taskId,
  result,
  copywritingPlan,
  personId,
  audioManId,
  apiBaseUrl,
  videoPath,
  audioPath = '',
  source = 'digital-human-api',
}) {
  const plan = normalizeCopywritingPlan(copywritingPlan, result?.text || '')
  const charTimings = normalizeCharTimings(result?.char_timings)
  const timelineSegments = mapPlanToTimeline(plan, charTimings)
  const durationMs = Number(result?.duration_ms || timelineSegments.at(-1)?.end_ms || 0)
  const lastSegment = timelineSegments.at(-1)
  if (lastSegment && durationMs > lastSegment.end_ms) {
    lastSegment.end_ms = durationMs
    lastSegment.end = durationMs / 1000
    lastSegment.duration_ms = durationMs - lastSegment.start_ms
    lastSegment.duration = lastSegment.duration_ms / 1000
  }

  return {
    schema: DIGITAL_HUMAN_PROJECT_SCHEMA,
    version: 1,
    created_at: new Date().toISOString(),
    source,
    digital_human: {
      api_base_url: apiBaseUrl,
      task_id: taskId,
      person_id: personId || '',
      audio_man_id: audioManId || '',
      video_url: result?.video_url || '',
      audio_url: result?.audio_url || '',
      video_vfs_path: videoPath || '',
      audio_vfs_path: audioPath || '',
      duration_ms: durationMs,
    },
    copywriting: plan,
    text: plan.spoken_text,
    normalized_text: result?.normalized_text || result?.text || plan.spoken_text,
    char_timings: charTimings,
    timeline: {
      schema: LOCAL_TIMELINE_SCHEMA,
      duration_ms: durationMs,
      video_info: { width: 1080, height: 1920, fps: 30, duration_ms: durationMs },
      segments: timelineSegments,
      clips: timelineSegments.map((segment) => ({
        id: segment.id,
        type: segment.type,
        start_ms: segment.start_ms,
        end_ms: segment.end_ms,
        slot_id: segment.slot_id,
        visual_tags: segment.visual_tags,
      })),
    },
  }
}

export function sidecarPathForVideo(videoPath) {
  const value = String(videoPath || '')
  return value.replace(/\.[^.\/]+$/u, '') + '.rjdh.json'
}

export async function writeDigitalHumanProject(vfs, projectPath, project) {
  const bytes = new TextEncoder().encode(JSON.stringify(project, null, 2))
  await vfs.writeFile(projectPath, bytes)
  return projectPath
}

export async function readDigitalHumanProject(vfs, projectPath) {
  const raw = await vfs.readFile(projectPath)
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
  const project = JSON.parse(text)
  if (project?.schema !== DIGITAL_HUMAN_PROJECT_SCHEMA) {
    throw new Error(`不是受支持的数字人项目 JSON：${project?.schema || 'missing schema'}`)
  }
  return project
}

export async function loadSidecarForVideo(vfs, videoPath) {
  const projectPath = sidecarPathForVideo(videoPath)
  const exists = await vfs.exists(projectPath)
  if (!exists) return { projectPath, project: null }
  return { projectPath, project: await readDigitalHumanProject(vfs, projectPath) }
}

function splitSceneSegment(segment, files) {
  const validFiles = (files || []).filter((file) => file?.path)
  if (!validFiles.length) return [{ ...segment, type: 'human', scene_file: null, scene_vfs_path: null }]
  const total = segment.end_ms - segment.start_ms
  return validFiles.map((file, index) => {
    const startMs = Math.round(segment.start_ms + (total * index) / validFiles.length)
    const endMs = index === validFiles.length - 1
      ? segment.end_ms
      : Math.round(segment.start_ms + (total * (index + 1)) / validFiles.length)
    return {
      ...segment,
      id: validFiles.length === 1 ? segment.id : `${segment.id}_${index + 1}`,
      type: 'scene',
      start_ms: startMs,
      end_ms: endMs,
      start: startMs / 1000,
      end: endMs / 1000,
      duration_ms: endMs - startMs,
      duration: (endMs - startMs) / 1000,
      scene_file: file.name || String(file.path).split('/').pop(),
      scene_vfs_path: file.path,
    }
  })
}

export function buildBoundLocalTimeline(project, template, scene) {
  if (project?.schema !== DIGITAL_HUMAN_PROJECT_SCHEMA) throw new Error('数字人项目 JSON 无效')
  const baseSegments = project.timeline?.segments || mapPlanToTimeline(project.copywriting, project.char_timings)
  const sceneSlots = template?.slots || []
  let sequentialSceneIndex = 0
  const outputSegments = []

  baseSegments.forEach((base) => {
    const wantsScene = base.visual_mode === 'scene' || base.type === 'scene'
    if (!wantsScene) {
      outputSegments.push({ ...base, type: 'human', scene_file: null, scene_vfs_path: null })
      return
    }

    const fallbackSlot = sceneSlots[sequentialSceneIndex]
    const slotId = base.slot_id || fallbackSlot?.id
    sequentialSceneIndex += 1
    const binding = scene?.bindings?.[slotId]
    outputSegments.push(...splitSceneSegment(base, binding?.files || []))
  })

  return {
    schema: LOCAL_TIMELINE_SCHEMA,
    source_project_schema: project.schema,
    source_task_id: project.digital_human?.task_id || '',
    video_info: project.timeline?.video_info || { width: 1080, height: 1920, fps: 30 },
    duration_ms: project.digital_human?.duration_ms || project.timeline?.duration_ms || 0,
    char_timings: project.char_timings,
    spoken_text: project.copywriting?.spoken_text || project.text || '',
    segments: outputSegments,
  }
}
