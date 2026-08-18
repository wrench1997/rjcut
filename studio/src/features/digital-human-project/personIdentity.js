const VIDEO_EXT_RE = /\.(mp4|mov|m4v|avi|webm|mkv)$/iu
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|bmp|gif)$/iu
const GENERIC_MEDIA_STEMS = new Set([
  'preview',
  'cover',
  'avatar',
  'image',
  'video',
  'default',
  'digital_human',
  'digital-human',
])

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function decodeRepeated(value) {
  let current = asText(value)
  for (let index = 0; index < 3; index += 1) {
    try {
      const decoded = decodeURIComponent(current)
      if (decoded === current) break
      current = decoded
    } catch {
      break
    }
  }
  return current
}

function unwrapProxyPath(value) {
  const input = decodeRepeated(value)
  if (!input) return ''

  try {
    const url = new URL(input, 'http://rjcut.local')
    const proxyPath = url.searchParams.get('path') || url.searchParams.get('url')
    if (proxyPath) return decodeRepeated(proxyPath)
    return decodeRepeated(url.pathname)
  } catch {
    const match = input.match(/[?&](?:path|url)=([^&]+)/iu)
    return match?.[1] ? decodeRepeated(match[1]) : input.split(/[?#]/u)[0]
  }
}

function basenameStem(value, allowedExtRe) {
  const unwrapped = unwrapProxyPath(value).replace(/\\/gu, '/')
  if (!unwrapped) return ''

  const basename = unwrapped.split('/').filter(Boolean).at(-1) || ''
  const decoded = decodeRepeated(basename)
  if (!allowedExtRe.test(decoded)) return ''

  const stem = decoded.replace(allowedExtRe, '').trim()
  if (!stem || GENERIC_MEDIA_STEMS.has(stem.toLowerCase())) return ''
  return stem
}

function firstNonEmpty(values) {
  return values.map(asText).find(Boolean) || ''
}

function normalizeGenerationId(value) {
  let normalized = decodeRepeated(value)
    .replace(/^['"]|['"]$/gu, '')
    .trim()

  // 新版 8080 接口示例使用 human，而旧列表常返回 dp_human。
  if (/^dp_/iu.test(normalized)) normalized = normalized.slice(3)
  return normalized
}

export function isCustomTrainingPerson(person) {
  const ids = [person?.id, person?.person_id, person?.generation_person_id]
    .map(normalizeGenerationId)
  if (ids.some((value) => value.startsWith('custom_'))) return true

  const figures = collectFigures(person)
  const mediaPaths = [
    person?.cover_url,
    person?.preview_video_url,
    person?.video_url,
    ...figures.flatMap((figure) => [figure?.cover, figure?.preview_video_url, figure?.video_url]),
  ]
  return mediaPaths.some((value) => decodeRepeated(value).replace(/\\/gu, '/').includes('/api_tasks/training/custom_'))
}

function normalizedComparable(value) {
  return normalizeGenerationId(value)
    .replace(/\.(mp4|mov|m4v|avi|webm|mkv|png|jpe?g|webp)$/iu, '')
    .replace(/[\s-]+/gu, '_')
    .toLowerCase()
}

function collectFigures(person) {
  return Array.isArray(person?.figures) ? person.figures.filter(Boolean) : []
}

function videoIdentityFromPerson(person) {
  const figures = collectFigures(person)
  const values = [
    person?.generation_video_url,
    person?.source_video,
    person?.preview_video_url,
    person?.preview_url,
    person?.video_url,
    person?.video_path,
    ...figures.flatMap((figure) => [
      figure?.generation_video_url,
      figure?.source_video,
      figure?.preview_video_url,
      figure?.preview_url,
      figure?.video_url,
      figure?.video_path,
    ]),
  ]

  for (const value of values) {
    const stem = basenameStem(value, VIDEO_EXT_RE)
    if (stem) return stem
  }
  return ''
}

function imageIdentityFromPerson(person) {
  const figures = collectFigures(person)
  const values = [
    person?.pic_path,
    person?.cover_url,
    person?.cover,
    person?.image_url,
    ...figures.flatMap((figure) => [
      figure?.pic_path,
      figure?.cover_url,
      figure?.cover,
      figure?.image_url,
    ]),
  ]

  for (const value of values) {
    const stem = basenameStem(value, IMAGE_EXT_RE)
    if (stem) return stem
  }
  return ''
}

function explicitGenerationId(person) {
  return firstNonEmpty([
    person?.generation_person_id,
    person?.generationPersonId,
    person?.generate_person_id,
    person?.generatePersonId,
    person?.model_person_id,
    person?.modelPersonId,
    person?.avatar_model_id,
    person?.avatarModelId,
  ])
}

export function resolvePersonIdentity(person, options = {}) {
  const type = asText(person?.type) || 'common'
  const explicit = normalizeGenerationId(explicitGenerationId(person))
  const videoStem = normalizeGenerationId(videoIdentityFromPerson(person))
  const imageStem = normalizeGenerationId(imageIdentityFromPerson(person))
  const legacy = normalizeGenerationId(firstNonEmpty([
    person?.person_id,
    person?.digital_person_id,
    person?.digitalPersonId,
    person?.id,
  ]))
  const name = normalizeGenerationId(person?.name)
  const preferMedia = options.preferMediaIdentity === true || type === 'common'

  const ordered = type === 'custom'
    ? [
        ['explicit', explicit],
        ['legacy_id', legacy],
        ['video_filename', videoStem],
        ['image_filename', imageStem],
        ['name', name],
      ]
    : preferMedia
      ? [
          ['explicit', explicit],
          ['video_filename', videoStem],
          ['image_filename', imageStem],
          ['legacy_id', legacy],
          ['name', name],
        ]
      : [
          ['explicit', explicit],
          ['legacy_id', legacy],
          ['video_filename', videoStem],
          ['image_filename', imageStem],
          ['name', name],
        ]

  const selected = ordered.find(([, value]) => Boolean(value)) || ['', '']
  const generationPersonId = selected[1]
  const candidates = Array.from(new Set(
    [explicit, videoStem, imageStem, legacy, name].filter(Boolean)
  ))

  return {
    generationPersonId,
    source: selected[0] || 'missing',
    legacyPersonId: firstNonEmpty([person?.person_id, person?.id]),
    videoStem,
    imageStem,
    candidates,
    valid: Boolean(generationPersonId),
  }
}

function rawMediaFingerprint(person) {
  const figures = collectFigures(person)
  return firstNonEmpty([
    person?.preview_video_url,
    person?.preview_url,
    person?.video_path,
    person?.cover_url,
    person?.pic_path,
    ...figures.flatMap((figure) => [
      figure?.preview_video_url,
      figure?.preview_url,
      figure?.video_path,
      figure?.cover,
      figure?.pic_path,
    ]),
  ])
}

export function personSelectionKey(person) {
  if (!person) return ''
  if (person.selectionKey) return String(person.selectionKey)
  if (person.uniqueId) return String(person.uniqueId)

  const identity = resolvePersonIdentity(person)
  return [
    person.type || 'common',
    identity.generationPersonId || person.id || 'missing',
    rawMediaFingerprint(person) || person.name || '',
  ].join('::')
}

export function decoratePersonsForGeneration(rawPersons, type = 'common') {
  const input = Array.isArray(rawPersons) ? rawPersons : []
  const legacyCounts = new Map()

  input.forEach((person) => {
    const legacy = asText(person?.person_id || person?.id)
    legacyCounts.set(legacy, (legacyCounts.get(legacy) || 0) + 1)
  })

  const decorated = input.map((person, index) => {
    const legacy = asText(person?.person_id || person?.id)
    const hasDuplicateLegacyId = Boolean(legacy) && (legacyCounts.get(legacy) || 0) > 1
    const base = { ...person, type }
    const identity = resolvePersonIdentity(base, {
      preferMediaIdentity: type === 'common' || hasDuplicateLegacyId,
    })
    const mediaFingerprint = rawMediaFingerprint(base)
    const selectionKey = [
      type,
      identity.generationPersonId || legacy || 'missing',
      mediaFingerprint || base.name || index,
    ].join('::')

    return {
      ...base,
      displayName: base.displayName || base.name,
      legacyPersonId: legacy,
      generation_person_id: identity.generationPersonId,
      generationIdentitySource: identity.source,
      generationIdentityCandidates: identity.candidates,
      hasDuplicateLegacyId,
      selectionKey,
      uniqueId: selectionKey,
    }
  })

  const generationCounts = new Map()
  decorated.forEach((person) => {
    const key = normalizedComparable(person.generation_person_id)
    if (key) generationCounts.set(key, (generationCounts.get(key) || 0) + 1)
  })

  return decorated.map((person) => {
    const generationKey = normalizedComparable(person.generation_person_id)
    return {
      ...person,
      identityConflict: Boolean(generationKey) && (generationCounts.get(generationKey) || 0) > 1,
    }
  })
}

export function dedupePersonsForDisplay(rawPersons, type = 'common') {
  const decorated = rawPersons?.every?.((person) => person?.selectionKey)
    ? rawPersons.filter(Boolean)
    : decoratePersonsForGeneration(rawPersons, type)
  const seen = new Map()

  for (const person of decorated) {
    const identity = resolvePersonIdentity(person, {
      preferMediaIdentity: type === 'common' || person.hasDuplicateLegacyId,
    })
    const normalizedIdentity = normalizedComparable(identity.generationPersonId)
    const normalizedMedia = normalizedComparable(
      videoIdentityFromPerson(person) || imageIdentityFromPerson(person),
    )
    const selectionKey = personSelectionKey(person)
    const canonicalCustomId = [
      person?.generation_person_id,
      person?.generationPersonId,
      person?.person_id,
      person?.digital_person_id,
      person?.id,
      identity.generationPersonId,
    ]
      .map(normalizeGenerationId)
      .find((value) => /^custom_/iu.test(value)) || ''

    // 同一个 custom_* 模型可能同时出现在 MuseTalk 公共列表与商户私有列表中，
    // 两边封面地址不同（/files/... 与 MinIO），但模型 ID 才是稳定身份。
    // 公共数字人的旧 ID 可能天然重复，只有 custom_* 才能安全地按 ID 折叠。
    const key = canonicalCustomId
      ? `custom-model::${normalizedComparable(canonicalCustomId)}`
      : (type === 'all' || type === 'custom') && normalizedMedia
      ? `media::${normalizedMedia}`
      : type === 'custom' && normalizedIdentity
        ? `custom::${normalizedIdentity}`
        : selectionKey

    const existing = seen.get(key)
    if (!existing || (existing.type !== 'custom' && person.type === 'custom')) {
      seen.set(key, person)
    }
  }

  return Array.from(seen.values())
}

export function mergePersonDetails(selectedPerson, details) {
  const selected = selectedPerson || {}
  const detail = details && typeof details === 'object' ? details : {}
  const merged = {
    ...detail,
    ...selected,
    actions: Array.isArray(detail.actions) && detail.actions.length
      ? detail.actions
      : (selected.actions || []),
    audio_man_id: selected.audio_man_id || detail.audio_man_id || '',
    available_figure_types: selected.available_figure_types || detail.available_figure_types || [],
    figures: selected.figures?.length ? selected.figures : (detail.figures || []),
  }

  const identity = resolvePersonIdentity(merged, {
    preferMediaIdentity: merged.type === 'common' || merged.hasDuplicateLegacyId,
  })

  return {
    ...merged,
    generation_person_id: selected.generation_person_id || identity.generationPersonId,
    generationIdentitySource: selected.generationIdentitySource || identity.source,
    selectionKey: selected.selectionKey || personSelectionKey(merged),
    uniqueId: selected.uniqueId || selected.selectionKey || personSelectionKey(merged),
  }
}

export function findMatchingPerson(persons, target) {
  const list = Array.isArray(persons) ? persons : []
  if (!target) return null

  const targetSelectionKey = personSelectionKey(target)
  const bySelection = list.find((person) => personSelectionKey(person) === targetSelectionKey)
  if (bySelection) return bySelection

  const targetIdentity = normalizedComparable(resolvePersonIdentity(target).generationPersonId)
  if (targetIdentity) {
    const matches = list.filter((person) => (
      normalizedComparable(resolvePersonIdentity(person).generationPersonId) === targetIdentity
    ))
    if (matches.length === 1) return matches[0]
  }

  const targetId = asText(target.id)
  const targetName = asText(target.name)
  const strictLegacy = list.find((person) => (
    asText(person.id) === targetId && asText(person.name) === targetName
  ))
  if (strictLegacy) return strictLegacy

  const legacyMatches = list.filter((person) => asText(person.id) === targetId)
  return legacyMatches.length === 1 ? legacyMatches[0] : null
}

export function verifyGeneratedPersonIdentity(result, requestedPersonId) {
  const requested = normalizeGenerationId(requestedPersonId)
  const resolvedRaw = firstNonEmpty([
    result?.resolved_person_id,
    result?.actual_person_id,
    result?.used_person_id,
    result?.generation_person_id,
    result?.person_id,
    result?.digital_person_id,
  ])
  const resolved = normalizeGenerationId(resolvedRaw)

  if (!requested) {
    throw new Error('前端没有解析出可用于生成的 person_id')
  }
  if (!resolved) {
    return {
      verified: false,
      requestedPersonId: requested,
      resolvedPersonId: '',
      reason: 'backend_did_not_return_resolved_person_id',
    }
  }

  if (normalizedComparable(requested) !== normalizedComparable(resolved)) {
    throw new Error(`数字人不匹配：请求 ${requested}，后端实际使用 ${resolved}`)
  }

  return {
    verified: true,
    requestedPersonId: requested,
    resolvedPersonId: resolved,
    reason: 'matched',
  }
}

export function safeFilePart(value, fallback = 'human') {
  const cleaned = String(value || '')
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_')
    .replace(/\s+/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_+|_+$/gu, '')
  return cleaned.slice(0, 72) || fallback
}
