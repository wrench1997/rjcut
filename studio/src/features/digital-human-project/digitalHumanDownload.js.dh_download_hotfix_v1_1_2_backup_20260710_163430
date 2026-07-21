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
          addUnique(urls, parsed.toString())
        }
      } catch {}
      addUnique(urls, raw)
    } else {
      addUnique(urls, `${base}/${raw.replace(/^\/+/, '')}`)
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
    ].forEach((path) => addUnique(urls, `${base}/${path.replace(/^\/+/, '')}`))
  }

  if (taskId) {
    const id = encodeURIComponent(String(taskId))
    [
      `/files/api_tasks/${id}/digital_human.mp4`,
      `/files/tasks/${id}/digital_human.mp4`,
      `/files/${id}/digital_human.mp4`,
      `/v1/digital-human/tasks/${id}/files/final_video`,
      `/v1/digital-human/tasks/${id}/files/video`,
    ].forEach((path) => addUnique(urls, `${base}${path}`))
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
  for (const url of candidates) {
    try {
      console.log('[DigitalHumanDownload] 尝试:', url)
      const response = await fetchImpl(url, {
        cache: 'no-store',
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
        continue
      }

      return { blob, url, attempts, originalVideoUrl }
    } catch (error) {
      attempts.push({ url, status: 0, reason: error?.message || String(error) })
    }
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
