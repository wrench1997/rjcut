import { cleanSpokenText, normalizeCopywritingPlan } from './digitalHumanProject.js'

export const MANUAL_COPYWRITING_SOURCE = 'manual-structured-editor'

export function makeManualSegment(index = 0, text = '', overrides = {}) {
  const visualMode = overrides.visual_mode === 'scene' ? 'scene' : 'human'
  const slotId = visualMode === 'scene'
    ? String(overrides.slot_id || `slot_${index + 1}`)
    : null

  return {
    id: String(overrides.id || `s${index + 1}`),
    text: String(text ?? overrides.text ?? ''),
    purpose: String(overrides.purpose || (index === 0 ? 'hook' : 'explain')),
    visual_mode: visualMode,
    visual_tags: Array.isArray(overrides.visual_tags)
      ? overrides.visual_tags.map(String).filter(Boolean)
      : [],
    slot_id: slotId,
    edit_action: visualMode === 'scene' ? 'replace_visual' : 'keep_digital_human',
    is_transition_segment: visualMode === 'scene',
    transition: {
      enabled: visualMode === 'scene',
      action: visualMode === 'scene' ? 'replace_visual' : 'keep_digital_human',
      slot_id: slotId,
      keep_original_audio: overrides.transition?.keep_original_audio !== false,
      entry: String(overrides.transition?.entry || 'cut'),
      exit: String(overrides.transition?.exit || 'cut'),
    },
    note: String(overrides.note || ''),
  }
}

function rawEmptyPlan(segments = [makeManualSegment(0)]) {
  return {
    schema: 'rjcut.copywriting-plan/v2',
    spoken_text: '',
    segments,
    transition_segments: [],
    meta: {
      editor_source: MANUAL_COPYWRITING_SOURCE,
      transition_segment_count: 0,
      transition_segment_ids: [],
    },
  }
}

export function splitManualTextIntoSegments(text) {
  const cleaned = cleanSpokenText(text)
  if (!cleaned) return [makeManualSegment(0)]

  const parts = cleaned
    .split(/(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean)

  const values = parts.length ? parts : [cleaned]
  return values.map((part, index) => makeManualSegment(index, part, {
    purpose: index === 0 ? 'hook' : index === values.length - 1 ? 'close' : 'explain',
  }))
}

export function rebuildManualCopywritingPlan(sourcePlan, inputSegments) {
  const source = sourcePlan && typeof sourcePlan === 'object' ? sourcePlan : {}
  const rawSegments = Array.isArray(inputSegments) && inputSegments.length
    ? inputSegments
    : [makeManualSegment(0)]

  let sceneIndex = 0
  const segments = rawSegments.map((segment, index) => {
    const visualMode = segment?.visual_mode === 'scene' ? 'scene' : 'human'
    if (visualMode === 'scene') sceneIndex += 1
    const slotId = visualMode === 'scene'
      ? String(segment?.slot_id || `slot_${sceneIndex}`)
      : null

    return makeManualSegment(index, segment?.text || '', {
      ...segment,
      id: `s${index + 1}`,
      visual_mode: visualMode,
      slot_id: slotId,
      purpose: segment?.purpose || (index === 0 ? 'hook' : index === rawSegments.length - 1 ? 'close' : 'explain'),
    })
  })

  const spokenText = cleanSpokenText(segments.map((item) => item.text).join(''))
  if (!spokenText) {
    return {
      ...rawEmptyPlan(segments),
      meta: {
        ...(source.meta && typeof source.meta === 'object' ? source.meta : {}),
        editor_source: MANUAL_COPYWRITING_SOURCE,
        transition_segment_count: segments.filter((item) => item.visual_mode === 'scene').length,
        transition_segment_ids: segments.filter((item) => item.visual_mode === 'scene').map((item) => item.id),
      },
    }
  }

  return normalizeCopywritingPlan({
    ...source,
    schema: 'rjcut.copywriting-plan/v2',
    spoken_text: spokenText,
    segments,
    meta: {
      ...(source.meta && typeof source.meta === 'object' ? source.meta : {}),
      editor_source: source.meta?.editor_source || MANUAL_COPYWRITING_SOURCE,
      manually_edited: true,
    },
  }, spokenText)
}

export function createManualCopywritingPlan(text = '') {
  return rebuildManualCopywritingPlan(
    { meta: { editor_source: MANUAL_COPYWRITING_SOURCE } },
    splitManualTextIntoSegments(text),
  )
}

export function createManualScriptEntry(id = Date.now(), text = '') {
  const copywritingPlan = createManualCopywritingPlan(text)
  return {
    id,
    text: copywritingPlan.spoken_text,
    copywritingPlan,
    note: '手动结构化文案',
  }
}

export function updateManualSegment(plan, segmentId, patch) {
  const source = plan && typeof plan === 'object' ? plan : createManualCopywritingPlan('')
  const segments = (Array.isArray(source.segments) ? source.segments : [])
    .map((segment) => segment.id === segmentId ? { ...segment, ...patch } : segment)
  return rebuildManualCopywritingPlan(source, segments)
}

export function insertManualSegment(plan, afterIndex = -1) {
  const source = plan && typeof plan === 'object' ? plan : createManualCopywritingPlan('')
  const segments = [...(Array.isArray(source.segments) ? source.segments : [])]
  const insertAt = Math.max(0, Math.min(segments.length, afterIndex + 1))
  segments.splice(insertAt, 0, makeManualSegment(insertAt))
  return rebuildManualCopywritingPlan(source, segments)
}

export function removeManualSegment(plan, segmentId) {
  const source = plan && typeof plan === 'object' ? plan : createManualCopywritingPlan('')
  const segments = (Array.isArray(source.segments) ? source.segments : [])
    .filter((segment) => segment.id !== segmentId)
  return rebuildManualCopywritingPlan(source, segments.length ? segments : [makeManualSegment(0)])
}

export function moveManualSegment(plan, segmentId, direction) {
  const source = plan && typeof plan === 'object' ? plan : createManualCopywritingPlan('')
  const segments = [...(Array.isArray(source.segments) ? source.segments : [])]
  const index = segments.findIndex((segment) => segment.id === segmentId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= segments.length) return source
  const [item] = segments.splice(index, 1)
  segments.splice(target, 0, item)
  return rebuildManualCopywritingPlan(source, segments)
}

export function parseManualCopywritingPlanJson(value, fallbackText = '') {
  let parsed
  try {
    parsed = JSON.parse(String(value || ''))
  } catch (error) {
    throw new Error(`JSON 解析失败：${error.message}`)
  }

  const candidate = parsed?.copywritingPlan || parsed?.copywriting || parsed?.script || parsed
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('JSON 中没有找到文案对象')
  }

  const normalized = normalizeCopywritingPlan(candidate, fallbackText)
  if (!normalized.spoken_text) throw new Error('JSON 缺少 spoken_text 或有效 segments.text')
  if (!normalized.segments.length) throw new Error('JSON 缺少有效 segments')

  const joined = normalized.segments.map((item) => item.text).join('')
  if (cleanSpokenText(joined) !== cleanSpokenText(normalized.spoken_text)) {
    throw new Error('segments.text 拼接后与 spoken_text 不一致，请修正后再应用')
  }

  return normalized
}
