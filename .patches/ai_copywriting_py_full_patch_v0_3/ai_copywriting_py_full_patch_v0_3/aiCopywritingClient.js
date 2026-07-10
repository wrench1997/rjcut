/**
 * Python 后端版 AI 文案客户端。
 * 接口对应：/v1/ai-copywriting/*
 */
function getApiBaseUrl() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('rjcut_api_base_url') || 'http://192.168.166.151:8000'
  }
  return 'http://192.168.166.151:8000'
}

function getApiKey() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('rjcut_api_key') || 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC'
  }
  return 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC'
}

async function postJson(path, body) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok || (result.code !== undefined && result.code !== 0 && result.code !== 200)) {
    const message = result.message || `HTTP ${response.status}`
    const error = new Error(message)
    error.data = result.data
    throw error
  }
  return result.data || result
}

export async function getAiCopywritingPresets() {
  const response = await fetch(`${getApiBaseUrl()}/v1/ai-copywriting/presets`, {
    headers: { 'Authorization': `Bearer ${getApiKey()}` },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || (result.code !== undefined && result.code !== 0 && result.code !== 200)) {
    throw new Error(result.message || `HTTP ${response.status}`)
  }
  return result.data?.presets || []
}

export async function aiGenerateStructuredScript(params) {
  return postJson('/v1/ai-copywriting/generate-plan', params)
}

export async function aiBuildTimelineFromCharTiming(params) {
  return postJson('/v1/ai-copywriting/build-timeline', params)
}

export function structuredScriptToLegacySegments(result, templateSegments = []) {
  const script = result?.script || result || {}
  const segments = Array.isArray(script.segments) ? script.segments : []

  return segments
    .map((segment, index) => {
      const purpose = segment.purpose || 'human'
      const base = templateSegments[index] || {}
      return {
        flag: purpose === 'hook' ? 'hook' : purpose === 'close' ? 'ending' : 'human',
        text: String(segment.text || '').replaceAll('转场', '').trim(),
        note: base.note || purpose,
        visual_tags: segment.visual_tags || [],
        transition_after: !!segment.transition_after,
        ai_segment_id: segment.id || `s${index + 1}`,
      }
    })
    .filter((segment) => segment.text)
}
