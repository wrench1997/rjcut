/**
 * 模板混剪 - AI 辅助工具
 * 提供 AI 推荐模板、AI 生成文案、AI 素材建议等功能
 */

/**
 * 默认模板定义
 */
export const DEFAULT_TEMPLATES = [
  {
    id: 'deer_antler_blood_v1',
    name: '鹿茸血·口播带货',
    description: '适合鹿茸血、营养液、滋补饮品等口播带货视频',
    category: '滋补保健',
    segments: [
      { flag: 'hook', note: '开场吸引 - 数字人出镜' },
      { flag: 'transition', note: '转场 1 - 产品瓶身展示' },
      { flag: 'transition', note: '转场 2 - 倒出液体特写' },
      { flag: 'transition', note: '转场 3 - 饮用或冲泡场景' },
      { flag: 'transition', note: '转场 4 - 礼盒与包装细节' },
      { flag: 'transition', note: '转场 5 - 结尾产品定帧' },
      { flag: 'ending', note: '结尾引导 - 数字人出镜收尾' },
    ],
    style: {
      hook: '想买鹿茸血的家人们，这条鹿茸血和鹿血区别的视频你必须看完！',
      ending: '老妹家自家鹿场养了 1000 头梅花鹿，全部是地板价哦！',
    },
  },
  {
    id: 'health_product_v1',
    name: '保健品·口播种草',
    description: '适合保健品、营养补充剂、健康食品的口播种草视频',
    category: '滋补保健',
    segments: [
      { flag: 'hook', note: '开场吸引 - 数字人出镜' },
      { flag: 'transition', note: '转场 1 - 产品介绍' },
      { flag: 'transition', note: '转场 2 - 成分展示' },
      { flag: 'transition', note: '转场 3 - 使用演示' },
      { flag: 'transition', note: '转场 4 - 效果反馈' },
      { flag: 'ending', note: '结尾引导 - 数字人出镜收尾' },
    ],
    style: {
      hook: '家人们，今天给大家揭秘这款保健品的真相！',
      ending: '想要了解更多，点击评论区链接！',
    },
  },
  {
    id: 'direct_sale_v1',
    name: '直接促销型',
    description: '适合快速促销、限时优惠类产品',
    category: '促销',
    segments: [
      { flag: 'hook', note: '开场吸引 - 数字人出镜' },
      { flag: 'transition', note: '转场 1 - 产品展示' },
      { flag: 'transition', note: '转场 2 - 优惠信息' },
      { flag: 'ending', note: '结尾引导 - 数字人出镜收尾' },
    ],
    style: {
      hook: '家人们！今天必须给你们安利这个{product}！',
      ending: '点击评论区链接，现在下单还有优惠！',
    },
  },
  {
    id: 'premium_v1',
    name: '高端品质型',
    description: '适合高端产品、品质生活类产品',
    category: '品牌',
    segments: [
      { flag: 'hook', note: '开场吸引 - 数字人出镜' },
      { flag: 'transition', note: '转场 1 - 品质展示' },
      { flag: 'transition', note: '转场 2 - 使用场景' },
      { flag: 'ending', note: '结尾引导 - 数字人出镜收尾' },
    ],
    style: {
      hook: '在快节奏的生活中，你是否也在寻找一份品质？',
      ending: '{product}，为懂生活的你而来。',
    },
  },
]

/**
 * 获取模板分类列表
 */
export function getTemplateCategories() {
  const categories = new Set(DEFAULT_TEMPLATES.map((t) => t.category))
  return Array.from(categories)
}

/**
 * 获取模板配置
 */
export function getTemplateConfig(templateId) {
  return DEFAULT_TEMPLATES.find((t) => t.id === templateId) || null
}

/**
 * AI 推荐模板 - 根据产品关键词匹配模板
 * @param {string} productKeyword - 产品关键词
 * @param {string} category - 类目（可选）
 * @param {Array} templates - 模板库（可选，不传则使用后端默认库）
 * @returns {Promise<{ templateId: string, score: number, reason: string }[]>}
 */
export async function aiRecommendTemplates(productKeyword, category = '', templates = null) {
  // 使用 api 客户端调用后端 AI 推荐接口（自动携带 Authorization header）
  const apiBaseUrl = typeof localStorage !== 'undefined' 
    ? localStorage.getItem('rjcut_api_base_url') || 'http://192.168.166.151:8000'
    : 'http://192.168.166.151:8000'
  
  const apiKey = typeof localStorage !== 'undefined'
    ? localStorage.getItem('rjcut_api_key') || 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC'
    : 'rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC'
  
  const requestBody = {
    product_keyword: productKeyword,
    category: category || '',
  }
  
  // 如果传入了模板库，一起发给后端
  if (templates && templates.length > 0) {
    requestBody.templates = templates
  }
  
  console.log('[AI 推荐模板] 请求 URL:', `${apiBaseUrl}/v1/ai/recommend-templates`)
  console.log('[AI 推荐模板] 请求体:', requestBody)
  
  const response = await fetch(`${apiBaseUrl}/v1/ai/recommend-templates`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  })

  console.log('[AI 推荐模板] 响应状态:', response.status)
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('[AI 推荐模板] 错误响应:', errorData)
    throw new Error(errorData.message || `HTTP ${response.status}`)
  }

  const result = await response.json()
  console.log('[AI 推荐模板] 成功响应:', result)
  
  // 后端返回格式：{ code: 0, message: "ok", data: { recommendations: [...], usage: {...} } }
  if (result.code === 0 && result.data?.recommendations) {
    return result.data.recommendations
  } else if (result.code === 200 && result.data?.recommendations) {
    return result.data.recommendations
  } else {
    throw new Error(result.message || result.msg || 'AI 推荐模板失败')
  }
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
  // 调用后端 AI 文案生成接口
  const baseUrl = typeof localStorage !== 'undefined' 
    ? localStorage.getItem('rjcut_api_base_url') || 'http://192.168.166.151:8000'
    : 'http://192.168.166.151:8000'
  
  // 验证必填参数
  if (!productName || !productName.trim()) {
    throw new Error('产品名称不能为空')
  }
  
  try {
    const requestBody = {
      product_name: productName,
      selling_points: sellingPoints || '',
      target_audience: targetAudience || '',
      tone: tone,
      template_structure: segments,
    }
    
    console.log('[AI 生成文案] 请求 URL:', `${baseUrl}/v1/ai/generate-script`)
    console.log('[AI 生成文案] 请求体:', requestBody)
    
    const response = await fetch(`${baseUrl}/v1/ai/generate-script`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC',
      },
      body: JSON.stringify(requestBody),
    })

    console.log('[AI 生成文案] 响应状态:', response.status)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[AI 生成文案] 错误响应:', errorData)
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    const result = await response.json()
    console.log('[AI 生成文案] 成功响应:', result)
    
    // 后端返回格式：{ code: 0, message: "ok", data: { segments: [...] } }
    if (result.code === 0 && result.data?.segments) {
      return result.data.segments
    } else if (result.code === 200 && result.data?.segments) {
      return result.data.segments
    } else {
      throw new Error(result.message || result.msg || 'AI 生成文案失败')
    }
  } catch (error) {
    console.error('AI 生成文案错误:', error)
    throw error
  }
}

/**
 * AI 自动生成模板 - 根据产品信息和风格生成模板结构
 * @param {Object} params - 参数
 * @param {string} params.productName - 产品名称
 * @param {string} params.productType - 产品类型（如：滋补品、电子产品、服装等）
 * @param {string} params.sellingPoints - 核心卖点
 * @param {string} params.targetAudience - 目标人群
 * @param {string} params.style - 风格（如：direct_sale、premium、social_review）
 * @param {number} params.transitionCount - 转场数量（默认 3-5 个）
 * @returns {Promise<{ id: string, name: string, description: string, category: string, segments: Array, style: Object }>}
 */
export async function aiGenerateTemplate({
  productName,
  productType = '通用产品',
  sellingPoints = '',
  targetAudience = '',
  style = 'direct_sale',
  transitionCount = 4,
}) {
  // 调用后端 AI 接口
  const baseUrl = typeof localStorage !== 'undefined' 
    ? localStorage.getItem('rjcut_api_base_url') || 'http://192.168.166.151:8000'
    : 'http://192.168.166.151:8000'
  
  // 验证必填参数
  if (!productName || !productName.trim()) {
    throw new Error('产品名称不能为空')
  }
  
  try {
    const requestBody = {
      product_name: productName,
      product_type: productType,
      selling_points: sellingPoints || '',
      target_audience: targetAudience || '',
      style: style,
      transition_count: transitionCount,
    }
    
    console.log('[AI 生成模板] 请求 URL:', `${baseUrl}/v1/ai/generate-template`)
    console.log('[AI 生成模板] 请求体:', requestBody)
    
    const response = await fetch(`${baseUrl}/v1/ai/generate-template`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer rjk_oG3u1bRu10myprstb5o2AYVW6v9HipNT33ALuJTmFxaqemUC',
      },
      body: JSON.stringify(requestBody),
    })

    console.log('[AI 生成模板] 响应状态:', response.status)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[AI 生成模板] 错误响应:', errorData)
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    const result = await response.json()
    console.log('[AI 生成模板] 成功响应:', result)
    
    // 后端返回格式：{ code: 0, message: "ok", data: { template: {...} } }
    if (result.code === 0 && result.data?.template) {
      return result.data.template
    } else if (result.code === 200 && result.data?.template) {
      return result.data.template
    } else {
      throw new Error(result.message || result.msg || 'AI 生成模板失败')
    }
  } catch (error) {
    console.error('AI 生成模板错误:', error)
    throw error
  }
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