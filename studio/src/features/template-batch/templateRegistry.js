/**
 * 模板混剪 - 模板注册表
 * 定义所有可用的行业模板及其素材位要求
 * 
 * 注意：模板数据来源于 aiAssistant.js 的 DEFAULT_TEMPLATES + 用户自定义模板
 * 本文件负责将文案模板（segments 结构）转换为混剪模板（slots 结构）
 */
import { DEFAULT_TEMPLATES } from './aiAssistant.js'

/**
 * 为模板生成通用的 scriptFactory
 * 根据模板的 segments 结构和素材位绑定生成脚本
 */
function createGenericScriptFactory(template) {
  return function generateScript(sourceVideoName, slotBindings) {
    // 按 slot 的 order 排序
    const sortedSlots = Object.entries(slotBindings)
      .sort(([, a], [, b]) => a.order - b.order)

    const segments = []

    // 遍历模板的 segments，生成对应的脚本
    template.segments.forEach((segment) => {
      if (segment.flag === 'hook' || segment.flag === 'human') {
        // 开场段落：使用模板的 style.hook 或默认文案
        const text = template.style?.hook || segment.note || ''
        segments.push({
          text,
          flag: 'human',
          note: segment.note,
        })
      } else if (segment.flag === 'transition' || segment.flag === 'scene') {
        // 转场段落：从 slotBindings 中查找对应的素材
        const slotEntry = sortedSlots.find(([, slotData]) => 
          slotData.title === segment.note.split('-')[1]?.trim() ||
          slotData.sourceSegment === segment
        )

        if (slotEntry) {
          const [, slotData] = slotEntry
          const files = slotData.files || []
          
          files.forEach((file, index) => {
            segments.push({
              text: '',
              flag: 'scene',
              scene_file: file.path,
              note: `${slotData.title} - 素材 ${index + 1}`,
              templateSlotId: slotEntry[0],
            })
          })
        }
      } else if (segment.flag === 'ending') {
        // 结尾段落：使用模板的 style.ending 或默认文案
        const text = template.style?.ending || segment.note || ''
        segments.push({
          text,
          flag: 'human',
          note: segment.note,
        })
      }
    })

    return {
      description: `${template.name} - 视频脚本`,
      templateId: template.id,
      sourceVideo: sourceVideoName,
      segments,
    }
  }
}

/**
 * 将文案模板（segments 结构）转换为混剪模板（slots 结构）
 * segments: [{ flag, note }] - 用于文案生成
 * slots: [{ id, order, title, required, minFiles, maxFiles, ... }] - 用于素材位管理
 */
function convertTemplateToSlots(template) {
  // 如果模板已经有 slots 定义，直接返回（说明是原生混剪模板）
  if (template.slots) {
    return template
  }

  // 从 segments 生成 slots
  // 规则：
  // - flag='hook' 或 flag='human' 的段落不需要素材位（由数字人视频填充）
  // - flag='transition' 或 flag='scene' 的段落需要素材位
  // - flag='ending' 的段落不需要素材位（由数字人视频填充）
  const slots = []
  let slotIndex = 0

  template.segments.forEach((segment, index) => {
    if (segment.flag === 'transition' || segment.flag === 'scene') {
      slotIndex++
      // 从 note 中提取素材位标题
      // 例如："转场 1 - 产品瓶身展示" -> "产品瓶身展示"
      const titleParts = segment.note.split('-')
      const title = titleParts.length > 1 ? titleParts[1].trim() : segment.note

      slots.push({
        id: `slot_${slotIndex}`,
        order: slotIndex,
        title: title,
        required: true,
        minFiles: 1,
        maxFiles: 3,
        durationHint: '3～5 秒',
        prompt: `请上传与"${title}"相关的视频素材`,
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: `scene_${slotIndex}`,
        sourceSegment: segment,
      })
    }
  })

  return {
    ...template,
    slots,
    version: template.version || 1,
    cover: template.cover || '/template-covers/default.jpg',
    durationHint: template.durationHint || `约 ${template.segments.length * 3}～${template.segments.length * 5}秒`,
    aspectRatio: template.aspectRatio || '9:16',
    sourceVideoRequirement: {
      expectedTransitionCount: slots.length,
      transitionKeyword: '转场',
      hint: `请选择使用本模板口播稿生成的数字人视频；视频中应包含 ${slots.length} 次"转场"标记。`,
    },
    scriptFactory: createGenericScriptFactory(template),
  }
}

/**
 * 获取完整的模板目录（包含默认模板和用户自定义模板）
 */
function getFullTemplateCatalog() {
  try {
    // 从 localStorage 加载用户自定义模板
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('rjcut_custom_templates') : null
    const customTemplates = stored ? JSON.parse(stored) : []

    // 合并默认模板和自定义模板
    const allTemplates = [...DEFAULT_TEMPLATES, ...customTemplates]

    // 转换为 slots 结构
    return allTemplates.map(convertTemplateToSlots)
  } catch (e) {
    console.error('[templateRegistry] 加载模板目录失败:', e)
    return DEFAULT_TEMPLATES.map(convertTemplateToSlots)
  }
}

/**
 * 模板目录（动态生成，包含用户自定义模板）
 */
export const TEMPLATE_CATALOG = getFullTemplateCatalog()



export function getTemplateById(templateId) {
  return TEMPLATE_CATALOG.find((item) => item.id === templateId) || null
}

export function getTemplatesByCategory(category) {
  if (!category) return TEMPLATE_CATALOG
  return TEMPLATE_CATALOG.filter((item) => item.category === category)
}

export function getAllCategories() {
  const categories = new Set(TEMPLATE_CATALOG.map((item) => item.category))
  return Array.from(categories)
}