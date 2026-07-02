/**
 * 模板混剪 - 草稿本地存储
 * 使用 localStorage 自动保存草稿，页面刷新后恢复
 */

const STORAGE_PREFIX = 'rjcut_template_run_'
const LAST_RUN_KEY = 'rjcut_template_last_run_id'

export function saveTemplateRunDraft(draft) {
  if (!draft?.id) return

  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${draft.id}`,
      JSON.stringify(draft)
    )
    localStorage.setItem(LAST_RUN_KEY, draft.id)
  } catch (error) {
    console.error('[templateRunStorage] 保存草稿失败', error)
  }
}

export function loadTemplateRunDraft(id) {
  if (!id) return null

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    console.error('[templateRunStorage] 读取草稿失败', error)
    return null
  }
}

export function loadLastTemplateRunDraft() {
  const id = localStorage.getItem(LAST_RUN_KEY)
  return id ? loadTemplateRunDraft(id) : null
}

export function deleteTemplateRunDraft(id) {
  if (!id) return
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
    const lastId = localStorage.getItem(LAST_RUN_KEY)
    if (lastId === id) {
      localStorage.removeItem(LAST_RUN_KEY)
    }
  } catch (error) {
    console.error('[templateRunStorage] 删除草稿失败', error)
  }
}

export function listTemplateRunDrafts() {
  const drafts = []

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)

      if (!key?.startsWith(STORAGE_PREFIX)) continue

      const raw = localStorage.getItem(key)
      if (raw) drafts.push(JSON.parse(raw))
    }
  } catch (error) {
    console.warn('[templateRunStorage] 忽略损坏草稿', error)
  }

  return drafts.sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}