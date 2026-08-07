// 数字人(蝉镜)接口默认走后端反代前缀 /dh：
//   <NEXT_PUBLIC_API_BASE_URL>/dh/*  ->  后端内部转发到 CHANJING_BASE_URL（公网地址）
// 公网用户通过已暴露的后端端口(8801)即可访问，无需为 8080 单独开 FRP/EIP。
// 本地若想直连蝉镜，可在 localStorage 把 rjcut_digital_human_api_base_url
// 设为 CHANJING_ORIGIN 覆盖。
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://112.111.7.91:8801').replace(/\/$/, '')
const DEFAULT_DIGITAL_HUMAN_BASE_URL = `${API_BASE_URL}/dh`
// 蝉镜源服务地址，用于把返回体里的绝对地址改写到 /dh 代理。
const CHANJING_ORIGIN = process.env.NEXT_PUBLIC_CHANJING_ORIGIN || ''
const DEFAULT_DIGITAL_HUMAN_TIMEOUT_SECONDS = 1800

export function getDigitalHumanBaseUrl() {
  if (typeof localStorage === 'undefined') return DEFAULT_DIGITAL_HUMAN_BASE_URL
  return (localStorage.getItem('rjcut_digital_human_api_base_url') || DEFAULT_DIGITAL_HUMAN_BASE_URL).replace(/\/$/, '')
}

export function toDigitalHumanAssetUrl(pathOrUrl, baseUrl = getDigitalHumanBaseUrl()) {
  const value = String(pathOrUrl || '').trim()
  if (!value) return ''
  // 蝉镜返回的内网绝对地址 -> 改写为走后端 /dh 代理，公网浏览器才能访问
  if (
    CHANJING_ORIGIN &&
    (value.startsWith(CHANJING_ORIGIN + '/') || value === CHANJING_ORIGIN)
  ) {
    const rest = value.slice(CHANJING_ORIGIN.length) // 形如 '/files/x.mp4' 或 ''
    return rest ? `${baseUrl}${rest}` : baseUrl
  }

  if (value.startsWith('/v1/dh/proxy-image')) {
    try {
      const parsed = new URL(value, baseUrl)
      const proxyPath = parsed.searchParams.get('path')
      if (proxyPath) {
        const decoded = decodeURIComponent(proxyPath)
        if (decoded.startsWith('/files/')) return `${baseUrl}${decoded}`
        if (decoded) return decoded
      }
    } catch {}
  }

  if (/^https?:\/\//i.test(value)) return value // 其它绝对地址原样返回
  return `${baseUrl}${value.startsWith('/') ? '' : '/'}${value}` // 相对路径前挂 baseUrl
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
  const audioManId = String(payload.audio_man_id || '').trim()
  const rawTimeoutSeconds = Number(payload?.timeout_seconds)
  const timeoutSeconds = Number.isFinite(rawTimeoutSeconds)
    ? rawTimeoutSeconds
    : DEFAULT_DIGITAL_HUMAN_TIMEOUT_SECONDS

  const body = {
    text: String(payload.text || '').trim(),
    person_id: personId,
    figure_type: payload.figure_type || 'whole_body',
    hide_subtitle: payload.hide_subtitle !== false,
    return_char_timing: true,
    char_timing_level: 'char',
    callback_url: payload.callback_url || undefined,
    extra: payload.extra || undefined,
    timeout_seconds: timeoutSeconds,
  }
  if (audioManId) body.audio_man_id = audioManId

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
