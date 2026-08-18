import { getDigitalHumanMediaUrl } from '../../api/api.js';

function trimSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function addUnique(list, value) {
  const text = String(value || '').trim()
  if (text && !list.includes(text)) list.push(text)
}

function isLoopback(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(
    String(hostname || '').toLowerCase(),
  )
}

function objectUrl(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.download_url || value.url || value.href || value.path || ''
}

function addDigitalHumanMediaCandidate(urls, value, baseUrl) {
  const resolved = getDigitalHumanMediaUrl(value, baseUrl)
  if (resolved) {
    addUnique(urls, resolved)
    return
  }
  if (value) {
    addUnique(urls, value)
  }
}

export function extractDigitalHumanVideoReference(result = {}) {
  const files = result.files || {}
  const media = result.media || {}
  const candidates = [
    result.video_url,
    result.videoUrl,
    result.video_download_url,
    result.download_url,
    media.video_url,
    media.download_url,
    files.final_video,
    files.video,
    files.digital_human,
    files.output_video,
  ]
  for (const candidate of candidates) {
    const found = objectUrl(candidate)
    if (found) return found
  }
  return ''
}

export function buildDigitalHumanAssetCandidates({
  result,
  assetRef,
  baseUrl,
  taskId,
} = {}) {
  const base = trimSlash(baseUrl)
  if (!base) throw new Error('数字人下载缺少 baseUrl')

  const raw = String(
    assetRef || extractDigitalHumanVideoReference(result) || '',
  ).trim()
  const urls = []

  if (raw) {
    if (/^https?:\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw)
        const baseParsed = new URL(base)
        if (isLoopback(parsed.hostname)) {
          parsed.protocol = baseParsed.protocol
          parsed.hostname = baseParsed.hostname
          parsed.port = baseParsed.port
          addDigitalHumanMediaCandidate(urls, parsed.toString(), base)
        }
      } catch {}
      addDigitalHumanMediaCandidate(urls, raw, base)
    } else {
      addDigitalHumanMediaCandidate(urls, `${base}/${raw.replace(/^\/+/, '')}`, base)
    }

    let pathname = raw
    try {
      pathname = new URL(raw, `${base}/`).pathname
    } catch {
      pathname = raw.startsWith('/') ? raw : `/${raw}`
    }

    [
      pathname,
      pathname.replace('/files/api_tasks/', '/files/tasks/'),
      pathname.replace('/files/tasks/', '/files/api_tasks/'),
      pathname.replace('/files/api-tasks/', '/files/api_tasks/'),
    ].forEach((path) => {
      addDigitalHumanMediaCandidate(
        urls,
        `${base}/${path.replace(/^\/+/, '')}`,
        base,
      )
    })
  }

  if (taskId) {
    const id = encodeURIComponent(String(taskId));
    [
      `/files/api_tasks/${id}/digital_human.mp4`,
      `/files/tasks/${id}/digital_human.mp4`,
      `/files/${id}/digital_human.mp4`,
      `/v1/digital-human/tasks/${id}/files/final_video`,
      `/v1/digital-human/tasks/${id}/files/video`,
    ].forEach((path) => {
      addDigitalHumanMediaCandidate(urls, `${base}${path}`, base)
    })
  }

  return urls
}

async function readErrorBody(response) {
  const contentType = String(response.headers.get('content-type') || '')
  if (!contentType.includes('json') && !contentType.includes('text')) return ''
  const text = await response.text().catch(() => '')
  return text.length > 500 ? `${text.slice(0, 500)}…` : text
}

export async function downloadDigitalHumanVideo({
  result,
  baseUrl,
  taskId,
  fetchImpl = globalThis.fetch,
  readinessTimeoutMs = 60 * 1000,
  requestTimeoutMs = 120 * 1000,
  sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
} = {}) {
  const originalVideoUrl = extractDigitalHumanVideoReference(result)
  const candidates = buildDigitalHumanAssetCandidates({
    result,
    assetRef: originalVideoUrl,
    baseUrl,
    taskId,
  })

  if (!candidates.length) {
    throw new Error('数字人任务成功，但结果中没有可识别的视频地址')
  }

  const attempts = []
  const readinessDeadline = Date.now() + readinessTimeoutMs
  let round = 0

  while (true) {
    let shouldRetry = false
    for (const url of candidates) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
      try {
        console.log('[DigitalHumanDownload] 尝试:', url)
        const response = await fetchImpl(url, {
          cache: 'no-store',
          signal: controller.signal,
          headers: {
            Accept: 'video/mp4,video/*;q=0.9,application/octet-stream;q=0.8,*/*;q=0.5',
          },
        })
        const contentType = String(response.headers.get('content-type') || '')

        if (!response.ok) {
          attempts.push({
            url,
            status: response.status,
            body: await readErrorBody(response),
          })
          if ([404, 409, 425, 503].includes(response.status)) shouldRetry = true
          continue
        }

        if (contentType.includes('json') || contentType.includes('text/html')) {
          attempts.push({
            url,
            status: response.status,
            body: await readErrorBody(response),
            reason: '返回的不是视频',
          })
          continue
        }

        const blob = await response.blob()
        if (blob.size < 1024) {
          attempts.push({
            url,
            status: response.status,
            size: blob.size,
            reason: '文件过小',
          })
          shouldRetry = true
          continue
        }

        return { blob, url, attempts, originalVideoUrl }
      } catch (error) {
        attempts.push({
          url,
          status: 0,
          reason: error?.name === 'AbortError'
            ? `下载请求超时（${Math.round(requestTimeoutMs / 1000)} 秒）`
            : (error?.message || String(error)),
        })
        shouldRetry = true
      } finally {
        clearTimeout(timer)
      }
    }

    if (!shouldRetry || Date.now() >= readinessDeadline) break
    const delayMs = Math.min(1000 * (2 ** round), 8000)
    round += 1
    await sleepImpl(delayMs)
  }

  const lines = attempts.map((item) => {
    const extra = item.body || item.reason || ''
    return `${item.status || 'ERR'} ${item.url}${extra ? ` -> ${extra}` : ''}`
  })

  const error = new Error([
    '数字人视频下载失败：8080 返回的视频地址不可用。',
    `原始 video_url：${originalVideoUrl || '(空)'}`,
    `task_id：${taskId || '(空)'}`,
    '尝试记录：',
    ...lines,
  ].join('\n'))
  error.code = 'DIGITAL_HUMAN_VIDEO_DOWNLOAD_FAILED'
  error.attempts = attempts
  throw error
}
