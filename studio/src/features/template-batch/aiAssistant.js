/**
 * 模板混剪 - AI 辅助工具
 * 提供 AI 推荐模板、AI 生成文案、AI 素材建议等功能
 */

/**
 * AI 推荐模板 - 根据产品关键词匹配模板
 * @param {string} productKeyword - 产品关键词
 * @param {string} category - 类目（可选）
 * @returns {Promise<{ templateId: string, score: number, reason: string }[]>}
 */
export async function aiRecommendTemplates(productKeyword, category = '') {
  // TODO: 实际项目中调用后端 AI 接口
  // const response = await fetch('/v1/ai/recommend-template', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ productKeyword, category })
  // })
  // return response.json()

  // 模拟 AI 推荐逻辑（基于关键词匹配）
  const keyword = productKeyword.toLowerCase().trim()
  const recommendations = []

  // 简单的关键词匹配规则
  if (keyword.includes('鹿茸') || keyword.includes('鹿血') || keyword.includes('滋补')) {
    recommendations.push({
      templateId: 'deer_antler_blood_v1',
      score: 0.95,
      reason: '模板专为滋补保健产品设计，适合鹿茸血、营养液等产品',
    })
  }

  if (keyword.includes('保健') || keyword.includes('营养') || keyword.includes('健康')) {
    recommendations.push({
      templateId: 'health_product_v1',
      score: 0.9,
      reason: '模板适合保健品、营养补充剂的口播种草',
    })
  }

  // 如果没有匹配到，返回所有模板
  if (recommendations.length === 0) {
    return [
      { templateId: 'deer_antler_blood_v1', score: 0.7, reason: '通用口播带货模板' },
      { templateId: 'health_product_v1', score: 0.65, reason: '通用口播种草模板' },
    ]
  }

  return recommendations
}

/**
 * AI 生成口播文案 - 根据产品信息和模板结构生成文案
 * @param {Object} params - 参数
 * @param {string} params.productName - 产品名称
 * @param {string} params.sellingPoints - 卖点
 * @param {string} params.targetAudience - 目标人群
 * @param {string} params.tone - 风格
 * @param {string} params.templateId - 模板 ID
 * @param {Array} params.segments - 模板段落结构
 * @returns {Promise<{ text: string, flag: string, note: string }[]>}
 */
export async function aiGenerateScript({
  productName,
  sellingPoints,
  targetAudience,
  tone,
  templateId,
  segments,
}) {
  // TODO: 调用后端 AI 接口
  // const response = await fetch('/v1/copywriting/generate', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     productName,
  //     sellingPoints,
  //     targetAudience,
  //     tone,
  //     templateId,
  //     structure: segments
  //   })
  // })
  // return response.json()

  // 模拟 AI 生成（基于模板结构）
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // 根据风格生成不同的文案
  const toneStyles = {
    direct_sale: {
      hook: '家人们！今天必须给你们安利这个{product}！',
      ending: '点击评论区链接，现在下单还有优惠！',
    },
    premium: {
      hook: '在快节奏的生活中，你是否也在寻找一份品质？',
      ending: '{product}，为懂生活的你而来。',
    },
    social_review: {
      hook: '用了{product}一个月，来跟大家说说真实感受。',
      ending: '真心推荐给需要的姐妹们！',
    },
    explainer: {
      hook: '很多人问我{product}到底好不好，今天详细给大家讲讲。',
      ending: '有任何问题欢迎在评论区留言。',
    },
  }

  const style = toneStyles[tone] || toneStyles.direct_sale
  const product = productName || '这款产品'

  // 生成 human 段落的文案
  const generatedSegments = segments.map((segment) => {
    if (segment.flag !== 'human') {
      return segment
    }

    // 根据段落位置生成文案
    if (segment.note?.includes('开场') || segment.note?.includes('介绍')) {
      return {
        ...segment,
        text: style.hook.replace('{product}', product),
        note: segment.note + '（AI 生成）',
      }
    }

    if (segment.note?.includes('收尾') || segment.note?.includes('结尾')) {
      return {
        ...segment,
        text: style.ending.replace('{product}', product),
        note: segment.note + '（AI 生成）',
      }
    }

    // 中间的 human 段落，根据卖点生成
    const points = sellingPoints ? sellingPoints.split(/[,,]/).filter(Boolean) : []
    const pointText = points.length > 0
      ? `它{points}，非常适合{audience}。`
      : '这款产品真的很不错。'

    return {
      ...segment,
      text: pointText
        .replace('{points}', points.join('、'))
        .replace('{audience}', targetAudience || '大家'),
      note: segment.note + '（AI 生成）',
    }
  })

  return generatedSegments
}

/**
 * AI 素材建议 - 分析素材文件名，推荐到素材位
 * @param {Array} files - 素材文件列表
 * @param {Array} slots - 模板素材位定义
 * @returns {Promise<{ slotId: string, files: Array, confidence: number }[]>}
 */
export async function aiSuggestSlotFiles(files, slots) {
  // TODO: 调用后端 AI 接口分析视频内容
  // const response = await fetch('/v1/ai/analyze-videos', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ files })
  // })
  // return response.json()

  // 基于文件名的简单匹配逻辑
  await new Promise((resolve) => setTimeout(resolve, 800))

  const suggestions = slots.map((slot) => {
    const matchedFiles = []

    files.forEach((file) => {
      const fileName = file.name?.toLowerCase() || ''
      const slotTitle = slot.title?.toLowerCase() || ''
      const slotPrompt = slot.prompt?.toLowerCase() || ''

      // 关键词匹配
      const matchScore = calculateMatchScore(fileName, slotTitle, slotPrompt)

      if (matchScore > 0.3) {
        matchedFiles.push({
          ...file,
          matchScore,
        })
      }
    })

    // 按匹配度排序
    matchedFiles.sort((a, b) => b.matchScore - a.matchScore)

    return {
      slotId: slot.id,
      slotTitle: slot.title,
      files: matchedFiles.slice(0, slot.maxFiles || 3),
      confidence: matchedFiles.length > 0
        ? Math.max(...matchedFiles.map((f) => f.matchScore))
        : 0,
    }
  })

  return suggestions
}

/**
 * 计算文件名与素材位的匹配度
 */
function calculateMatchScore(fileName, slotTitle, slotPrompt) {
  // 提取关键词
  const keywords = extractKeywords(slotTitle, slotPrompt)

  let score = 0
  keywords.forEach((keyword) => {
    if (fileName.includes(keyword)) {
      score += 0.3
    }
  })

  // 特殊场景匹配
  const sceneMappings = {
    '瓶身': ['瓶', '包装', 'product', 'bottle'],
    '倒出': ['倒', '液体', 'pour', 'flow'],
    '饮用': ['喝', '饮', 'drink', 'cup'],
    '礼盒': ['礼盒', '包装', 'gift', 'box'],
    '定帧': ['定帧', '结尾', 'ending', 'final'],
    '展示': ['展示', 'show', 'display'],
    '特写': ['特写', 'closeup', 'detail'],
    '场景': ['场景', 'scene', 'usage'],
  }

  Object.entries(sceneMappings).forEach(([scene, words]) => {
    if (slotTitle.includes(scene) || slotPrompt.includes(scene)) {
      words.forEach((word) => {
        if (fileName.includes(word)) {
          score += 0.2
        }
      })
    }
  })

  return Math.min(score, 1.0)
}

/**
 * 从素材位定义中提取关键词
 */
function extractKeywords(title, prompt) {
  const text = `${title} ${prompt}`.toLowerCase()
  const words = text.split(/[\s,,.]/).filter((w) => w.length > 1)

  // 去除停用词
  const stopWords = ['的', '了', '和', '与', '或', '在', '是', 'a', 'an', 'the', 'for', 'to']
  return words.filter((w) => !stopWords.includes(w))
}

/**
 * 自动生成场景版本 - 基于 AI 推荐
 * @param {Object} template - 模板定义
 * @param {Array} availableFiles - 可用素材文件列表
 * @returns {Promise<{ name: string, bindings: Object }>}
 */
export async function aiAutoCreateScene(template, availableFiles) {
  const suggestions = await aiSuggestSlotFiles(availableFiles, template.slots)

  const bindings = {}
  let hasMatchedFiles = false

  suggestions.forEach((suggestion) => {
    const slot = template.slots.find((s) => s.id === suggestion.slotId)
    if (!slot) return

    bindings[suggestion.slotId] = {
      order: slot.order,
      title: slot.title,
      files: suggestion.files.map((f) => ({
        path: f.path,
        name: f.name,
        durationSeconds: null,
      })),
    }

    if (suggestion.files.length > 0) {
      hasMatchedFiles = true
    }
  })

  // 如果没有匹配到文件，返回空绑定
  if (!hasMatchedFiles) {
    return null
  }

  return {
    name: `AI 推荐场景 - ${new Date().toLocaleTimeString()}`,
    bindings,
  }
}