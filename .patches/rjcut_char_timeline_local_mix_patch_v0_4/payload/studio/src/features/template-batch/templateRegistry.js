/**
 * 模板混剪 - 模板注册表
 *
 * 新主线：模板描述“哪些语义段使用场景素材”，数字人 MP4 的切点来自
 * 同名 .rjdh.json 中的 char_timings，不再依赖口播中的任何关键字。
 */
import { DEFAULT_TEMPLATES } from './aiAssistant.js'

function cleanSlotTitle(note, fallback) {
  const text = String(note || fallback || '')
    .replace(/^转场\s*\d*\s*[-—:]?\s*/u, '')
    .replace(/\s*[-—]\s*(场景|素材)$/u, '')
    .trim()
  return text || fallback
}

function convertTemplateToSlots(template) {
  if (template.slots) {
    return {
      ...template,
      sourceVideoRequirement: {
        requiresTimelineProject: true,
        sidecarExtension: '.rjdh.json',
        hint: '请选择新版数字人视频；系统会自动加载同名 .rjdh.json 字级时间轴。',
        ...(template.sourceVideoRequirement || {}),
      },
    }
  }

  const slots = []
  let sceneIndex = 0
  const normalizedSegments = (template.segments || []).map((segment, index) => {
    const sourceFlag = String(segment.flag || '').toLowerCase()
    const flag = sourceFlag === 'transition' ? 'scene' : sourceFlag
    if (flag !== 'scene') return { ...segment, flag }

    sceneIndex += 1
    const slotId = segment.slot_id || `slot_${sceneIndex}`
    const title = cleanSlotTitle(segment.note, `场景素材 ${sceneIndex}`)
    slots.push({
      id: slotId,
      order: sceneIndex,
      title,
      required: true,
      minFiles: 1,
      maxFiles: 3,
      durationHint: '由数字人字级时间轴自动决定',
      prompt: `请上传与“${title}”语义匹配的视频素材`,
      acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
      templateSegmentKey: `scene_${sceneIndex}`,
      sourceSegmentIndex: index,
      sourceSegment: { ...segment, flag: 'scene', slot_id: slotId },
    })
    return { ...segment, flag: 'scene', slot_id: slotId }
  })

  return {
    ...template,
    segments: normalizedSegments,
    slots,
    version: template.version || 2,
    cover: template.cover || '/template-covers/default.jpg',
    durationHint: template.durationHint || '时长跟随数字人口播',
    aspectRatio: template.aspectRatio || '9:16',
    sourceVideoRequirement: {
      requiresTimelineProject: true,
      sidecarExtension: '.rjdh.json',
      expectedSceneCount: slots.length,
      hint: `请选择使用新版接口生成的数字人视频；系统会自动加载同名 .rjdh.json，并将 ${slots.length} 个语义场景段绑定到素材位。`,
    },
  }
}

function getFullTemplateCatalog() {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('rjcut_custom_templates') : null
    const customTemplates = stored ? JSON.parse(stored) : []
    return [...DEFAULT_TEMPLATES, ...customTemplates].map(convertTemplateToSlots)
  } catch (error) {
    console.error('[templateRegistry] 加载模板目录失败:', error)
    return DEFAULT_TEMPLATES.map(convertTemplateToSlots)
  }
}

export const TEMPLATE_CATALOG = getFullTemplateCatalog()

export function getTemplateById(templateId) {
  return TEMPLATE_CATALOG.find((item) => item.id === templateId) || null
}

export function getTemplatesByCategory(category) {
  if (!category) return TEMPLATE_CATALOG
  return TEMPLATE_CATALOG.filter((item) => item.category === category)
}

export function getAllCategories() {
  return Array.from(new Set(TEMPLATE_CATALOG.map((item) => item.category)))
}
