const DEFAULT_DIGITAL_HUMAN_BASE_URL = 'http://192.168.166.151:8080'

export function getDigitalHumanBaseUrl() {
  if (typeof localStorage === 'undefined') return DEFAULT_DIGITAL_HUMAN_BASE_URL
  return (localStorage.getItem('rjcut_digital_human_api_base_url') || DEFAULT_DIGITAL_HUMAN_BASE_URL).replace(/\/$/, '')
}

export function toDigitalHumanAssetUrl(pathOrUrl, baseUrl = getDigitalHumanBaseUrl()) {
  const value = String(pathOrUrl || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}`
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`数字人接口返回的不是合法 JSON：HTTP ${response.status}`)
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || data?.msg || `HTTP ${response.status}`)
  }
  return data
}

export async function createTimelineDigitalHumanTask(payload, baseUrl = getDigitalHumanBaseUrl()) {
  const personId = String(payload.person_id || '').trim()
  if (!personId) {
    throw new Error('数字人生成请求缺少 person_id，前端禁止静默回退到默认 human')
  }

  const body = {
    text: String(payload.text || '').trim(),
    person_id: personId,
    audio_man_id: payload.audio_man_id || undefined,
    figure_type: payload.figure_type || 'whole_body',
    hide_subtitle: payload.hide_subtitle !== false,
    return_char_timing: true,
    char_timing_level: 'char',
    callback_url: payload.callback_url || undefined,
    extra: payload.extra || undefined,
  }

  if (!body.text) throw new Error('数字人口播文本不能为空')

  const result = await requestJson(`${baseUrl}/v1/digital-human/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!result?.ok || !result?.task_id) {
    throw new Error(result?.error?.message || '数字人任务创建失败')
  }
  return result
}

export async function getTimelineDigitalHumanTask(taskId, baseUrl = getDigitalHumanBaseUrl()) {
  return requestJson(`${baseUrl}/v1/digital-human/tasks/${encodeURIComponent(taskId)}`)
}

export async function getTimelineCharTimings(taskId, baseUrl = getDigitalHumanBaseUrl()) {
  return requestJson(`${baseUrl}/v1/digital-human/tasks/${encodeURIComponent(taskId)}/char-timings`)
}

export async function waitForTimelineDigitalHumanTask(
  taskId,
  { baseUrl = getDigitalHumanBaseUrl(), intervalMs = 3000, timeoutMs = 30 * 60 * 1000, onProgress } = {}
) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const status = await getTimelineDigitalHumanTask(taskId, baseUrl)
    onProgress?.(Number(status?.progress || 0), status)

    if (status?.ok && status?.status === 'success') return status
    if (status?.status === 'failed' || status?.ok === false) {
      throw new Error(status?.error?.message || '数字人生成失败')
    }
    if (!['queued', 'running'].includes(status?.status)) {
      throw new Error(`数字人接口返回未知状态：${String(status?.status)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('数字人生成超时')
}
