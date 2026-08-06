const durationCache = new Map()

function toPositiveSeconds(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

export function getKnownMediaDurationSeconds(file) {
  if (!file || typeof file !== 'object') return null
  const candidates = [
    file.durationSeconds,
    file.duration,
    file.duration_seconds,
    Number.isFinite(Number(file.duration_ms)) ? Number(file.duration_ms) / 1000 : null,
    Number.isFinite(Number(file.metadata?.duration_ms)) ? Number(file.metadata.duration_ms) / 1000 : null,
    file.metadata?.durationSeconds,
    file.metadata?.duration,
  ]
  for (const candidate of candidates) {
    const seconds = toPositiveSeconds(candidate)
    if (seconds !== null) return seconds
  }
  return null
}

/**
 * 从 VFS 读取视频元数据。选材时把真实时长写回草稿，生成前再复核一次，
 * 这样模板段和素材段可以使用同一套毫秒边界进行提示与合成。
 */
export async function getVideoDurationSeconds(file, vfs) {
  const known = getKnownMediaDurationSeconds(file)
  if (known !== null) return known
  if (!file?.path || !vfs?.readFileAsBlob || typeof document === 'undefined') return null

  const key = String(file.path)
  if (durationCache.has(key)) return durationCache.get(key)

  const pending = (async () => {
    // Electron 下优先用本机 ffprobe：HEVC、MOV/PCM 音频等浏览器不一定能
    // 解码 metadata，但 FFmpeg 能稳定读出真实时长。Web 端仍保留 video
    // 元数据读取作为回退。
    if (typeof window !== 'undefined' && typeof window.electronAPI?.probeMediaDuration === 'function') {
      try {
        const nativeDuration = toPositiveSeconds(await window.electronAPI.probeMediaDuration(key))
        if (nativeDuration !== null) return nativeDuration
      } catch (error) {
        console.warn('[templateMediaDuration] 本机 ffprobe 读取失败，回退浏览器 metadata:', key, error)
      }
    }
    try {
      const blob = await vfs.readFileAsBlob(key)
      if (!(blob instanceof Blob) || blob.size <= 0) return null
      const url = URL.createObjectURL(blob)
      try {
        return await new Promise((resolve) => {
          const video = document.createElement('video')
          video.preload = 'metadata'
          video.onloadedmetadata = () => {
            const duration = toPositiveSeconds(video.duration)
            resolve(duration)
          }
          video.onerror = () => resolve(null)
          video.src = url
        })
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.warn('[templateMediaDuration] 读取素材时长失败:', key, error)
      return null
    }
  })()

  durationCache.set(key, pending)
  const duration = await pending
  durationCache.set(key, duration)
  return duration
}

export async function hydrateSceneMaterialDurations(scenes, vfs) {
  return Promise.all((scenes || []).map(async (scene) => {
    const bindings = {}
    for (const [slotId, binding] of Object.entries(scene?.bindings || {})) {
      const files = await Promise.all((binding?.files || []).map(async (file) => ({
        ...file,
        durationSeconds: await getVideoDurationSeconds(file, vfs),
      })))
      bindings[slotId] = { ...binding, files }
    }
    return { ...scene, bindings }
  }))
}

export function formatDurationSeconds(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return '未知'
  return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} 秒`
}
