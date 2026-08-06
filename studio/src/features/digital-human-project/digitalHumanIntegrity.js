const DEFAULT_MIN_COVERAGE_RATIO = 0.82
const DEFAULT_MIN_TAIL_RATIO = 0.82
const DEFAULT_MIN_DURATION_PER_REQUIRED_CHAR_MS = 45

function normalizeLineEndings(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function trimOuterWhitespace(value) {
  return normalizeLineEndings(value).trim()
}

function codePoints(value) {
  return Array.from(String(value || ''))
}

function isRequiredCharacter(char) {
  return Boolean(char) && !/\s/u.test(char)
}

function isIntegerNumber(value) {
  return Number.isInteger(Number(value))
}

function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function summarizeTextContract(text) {
  const value = trimOuterWhitespace(text)
  const chars = codePoints(value)
  return {
    textLength: chars.length,
    textHead: chars.slice(0, 40).join(''),
    textTail: chars.slice(-40).join(''),
  }
}

export function validateSegmentsAgainstSpokenText(copywritingPlan, spokenText) {
  const text = trimOuterWhitespace(spokenText)
  const segments = Array.isArray(copywritingPlan?.segments)
    ? copywritingPlan.segments
    : []

  let cursor = 0
  const mapped = []

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index] || {}
    const segmentText = trimOuterWhitespace(segment.text)
    if (!segmentText) {
      throw new Error(`AI 文案段落 ${segment.id || index + 1} 缺少 text，不能建立剪辑时间线`)
    }

    const foundAt = text.indexOf(segmentText, cursor)
    if (foundAt < 0) {
      throw new Error(
        `AI 文案段落 ${segment.id || index + 1} 无法在 spoken_text 中按顺序找到，` +
        '请重新生成结构化文案后再创建数字人'
      )
    }

    mapped.push({
      id: segment.id || `s${index + 1}`,
      char_start: codePoints(text.slice(0, foundAt)).length,
      char_end: codePoints(text.slice(0, foundAt + segmentText.length)).length - 1,
    })
    cursor = foundAt + segmentText.length
  }

  return mapped
}

export function requireFullSpokenText(copywritingPlan, fallbackText = '') {
  const spokenText = trimOuterWhitespace(copywritingPlan?.spoken_text || fallbackText)
  if (!spokenText) {
    throw new Error('数字人生成缺少完整 spoken_text')
  }

  // segments 只用于后续剪辑，但必须能够在完整口播里顺序定位。
  if (Array.isArray(copywritingPlan?.segments) && copywritingPlan.segments.length > 0) {
    validateSegmentsAgainstSpokenText(copywritingPlan, spokenText)
  }

  return spokenText
}

export function validateDigitalHumanResult(result, requestedText, options = {}) {
  const requested = trimOuterWhitespace(requestedText)
  const requestedChars = codePoints(requested)
  if (!requestedChars.length) throw new Error('完整性校验缺少请求文案')

  if (!result?.video_url) {
    throw new Error('数字人结果缺少 video_url')
  }

  const durationMs = safeNumber(result?.duration_ms)
  if (durationMs <= 0) {
    throw new Error('数字人结果 duration_ms 无效')
  }

  const returnedOriginal = result?.text == null ? '' : trimOuterWhitespace(result.text)
  const returnedNormalized = result?.normalized_text == null
    ? ''
    : trimOuterWhitespace(result.normalized_text)

  if (returnedOriginal && returnedOriginal !== requested) {
    throw new Error(
      `数字人返回原文与请求不一致：请求 ${requestedChars.length} 字，` +
      `返回 ${codePoints(returnedOriginal).length} 字`
    )
  }

  // 当前 RJCut 时间线按 AI spoken_text 直接映射。若 8080 改写文本，暂时拒绝保存，
  // 避免 segments 与 char_timings 错位。以后实现 original_text_mapping 后再放开。
  if (returnedNormalized && returnedNormalized !== requested) {
    throw new Error(
      '数字人服务修改了口播文本，当前模板混剪无法安全映射。' +
      '请让 8080 保持 normalized_text 与请求 text 一致'
    )
  }

  const timings = Array.isArray(result?.char_timings) ? result.char_timings : []
  if (!timings.length) {
    throw new Error('数字人结果缺少 char_timings')
  }

  const requiredIndices = []
  requestedChars.forEach((char, index) => {
    if (isRequiredCharacter(char)) requiredIndices.push(index)
  })

  const validIndices = new Set()
  let previousIndex = -1
  let previousStart = -1
  let previousEnd = -1

  for (let position = 0; position < timings.length; position += 1) {
    const item = timings[position] || {}
    let index = Number(item.index)
    const startMs = Number(item.start_ms)
    const endMs = Number(item.end_ms)

    if (!isIntegerNumber(item.index) || index < 0 || index >= requestedChars.length) {
      throw new Error(`数字人时间轴索引越界：position=${position}, index=${String(item.index)}`)
    }
    if (!Number.isInteger(startMs) || !Number.isInteger(endMs) || startMs < 0 || endMs < startMs) {
      throw new Error(`数字人时间轴时间无效：index=${index}, start=${item.start_ms}, end=${item.end_ms}`)
    }
    if (startMs < previousStart || endMs < previousEnd) {
      throw new Error(`数字人时间轴发生倒退：index=${index}`)
    }
    if (endMs > durationMs + 2000) {
      throw new Error(`数字人时间轴超过视频总时长：index=${index}, end=${endMs}, duration=${durationMs}`)
    }

    const actualChar = String(item.char ?? item.text ?? item.token ?? '')

    // 部分数字人服务会从 char_timings 中省略逗号、句号等标点，导致它返回的
    // index 从第一个标点开始整体左移。按已确认的字符顺序重新定位，可保留原文
    // 坐标给后续时间线使用，同时仍能发现真正的文字错乱。
    const expectedStart = Math.max(previousIndex + 1, 0)
    if (actualChar !== requestedChars[index] || index <= previousIndex) {
      const alignedIndex = requestedChars.indexOf(actualChar, expectedStart)
      if (alignedIndex < 0) {
        // TTS/数字人服务可能会同音替换、漏读或合并字符。不能因为单个字符
        // 无法映射就丢弃已经成功生成的视频；保留其顺序时间轴并交给后续流程。
        index = Math.max(expectedStart, Math.min(index, requestedChars.length - 1))
        item.index = index
        console.warn(
          `[数字人时间轴] 字符无法精确对齐，继续使用服务索引：` +
          `index=${index}，返回“${actualChar}”`
        )
      } else {
        index = alignedIndex
        item.index = alignedIndex
      }
    }

    validIndices.add(index)
    previousIndex = index
    previousStart = startMs
    previousEnd = endMs
  }

  const requiredCovered = requiredIndices.filter((index) => validIndices.has(index)).length
  const coverageRatio = requiredCovered / Math.max(1, requiredIndices.length)
  const tailRatio = (previousIndex + 1) / Math.max(1, requestedChars.length)
  const minCoverageRatio = Number(options.minCoverageRatio ?? DEFAULT_MIN_COVERAGE_RATIO)
  const minTailRatio = Number(options.minTailRatio ?? DEFAULT_MIN_TAIL_RATIO)

  if (coverageRatio < minCoverageRatio) {
    throw new Error(
      `数字人生成不完整：完整文案 ${requestedChars.length} 字，` +
      `时间轴覆盖 ${requiredCovered}/${requiredIndices.length}，` +
      `覆盖率 ${(coverageRatio * 100).toFixed(1)}%`
    )
  }

  if (tailRatio < minTailRatio) {
    throw new Error(
      `数字人时间轴提前结束：最后索引 ${previousIndex}，` +
      `完整文案长度 ${requestedChars.length}`
    )
  }

  const minDurationPerCharMs = Number(
    options.minDurationPerRequiredCharMs ?? DEFAULT_MIN_DURATION_PER_REQUIRED_CHAR_MS
  )
  const minimumPlausibleDurationMs = Math.round(requiredIndices.length * minDurationPerCharMs)
  if (durationMs < minimumPlausibleDurationMs) {
    throw new Error(
      `数字人视频疑似只生成了局部文案：${requiredIndices.length} 个有效字符，` +
      `视频仅 ${(durationMs / 1000).toFixed(2)} 秒，` +
      `低于宽松下限 ${(minimumPlausibleDurationMs / 1000).toFixed(2)} 秒`
    )
  }

  return {
    schema: 'rjcut.digital-human-integrity/v1',
    verified: true,
    request_contract: 'full_spoken_text_once',
    requested_text_length: requestedChars.length,
    required_character_count: requiredIndices.length,
    timing_count: timings.length,
    covered_required_characters: requiredCovered,
    coverage_ratio: Number(coverageRatio.toFixed(6)),
    last_timing_index: previousIndex,
    tail_ratio: Number(tailRatio.toFixed(6)),
    duration_ms: durationMs,
    minimum_plausible_duration_ms: minimumPlausibleDurationMs,
    checked_at: new Date().toISOString(),
  }
}
