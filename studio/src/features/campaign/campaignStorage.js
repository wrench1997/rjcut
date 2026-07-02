/**
 * 内容创作向导 - 草稿本地存储
 * 使用 localStorage 自动保存草稿，页面刷新后恢复
 */

const STORAGE_PREFIX = 'rjcut_campaign_draft_'
const LAST_DRAFT_KEY = 'rjcut_campaign_last_draft_id'

export function saveCampaignDraft(draft) {
  if (!draft?.id) return

  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${draft.id}`,
      JSON.stringify(draft)
    )
    localStorage.setItem(LAST_DRAFT_KEY, draft.id)
  } catch (error) {
    console.error('[campaignStorage] 保存草稿失败', error)
  }
}

export function loadCampaignDraft(id) {
  if (!id) return null

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    console.error('[campaignStorage] 读取草稿失败', error)
    return null
  }
}

export function loadLastCampaignDraft() {
  const id = localStorage.getItem(LAST_DRAFT_KEY)
  return id ? loadCampaignDraft(id) : null
}

export function deleteCampaignDraft(id) {
  if (!id) return
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
    const lastId = localStorage.getItem(LAST_DRAFT_KEY)
    if (lastId === id) {
      localStorage.removeItem(LAST_DRAFT_KEY)
    }
  } catch (error) {
    console.error('[campaignStorage] 删除草稿失败', error)
  }
}

export function listCampaignDrafts() {
  const drafts = []

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)

      if (!key?.startsWith(STORAGE_PREFIX)) continue

      const raw = localStorage.getItem(key)
      if (raw) drafts.push(JSON.parse(raw))
    }
  } catch (error) {
    console.warn('[campaignStorage] 忽略损坏草稿', error)
  }

  return drafts.sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}