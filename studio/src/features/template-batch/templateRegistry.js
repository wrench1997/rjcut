/**
 * 模板混剪 - 模板注册表
 * 定义所有可用的行业模板及其素材位要求
 */

/**
 * 创建鹿茸血口播带货模板的脚本工厂
 * 根据素材位绑定生成兼容后端的 script.json
 */
export function createDeerAntlerBloodScript(sourceVideoName, slotBindings) {
  // 按 slot 的 order 排序，确保顺序正确
  const sortedSlots = Object.entries(slotBindings)
    .sort(([, a], [, b]) => a.order - b.order)

  const segments = []

  // 第一段：数字人开场（human flag）
  segments.push({
    text: '想买鹿茸血的家人们，这条鹿茸血和鹿血区别的视频你必须看完，否则你可就要上当啦！',
    flag: 'human',
    note: '开场介绍 - 数字人出镜',
  })

  // 根据素材位插入 scene segments
  // 模板约定：第 1 个素材位对应第 1 个转场，以此类推
  sortedSlots.forEach(([slotId, slotData]) => {
    // 每个素材位可以有多个候选视频，这里取第一个（轮换逻辑在 adapter 中处理）
    const files = slotData.files || []
    
    files.forEach((file, index) => {
      segments.push({
        text: '',
        flag: 'scene',
        scene_file: file.path,
        note: `${slotData.title} - 素材 ${index + 1}`,
        templateSlotId: slotId,
      })
    })
  })

  // 最后一段：数字人收尾（human flag）
  segments.push({
    text: '老妹家自家鹿场养了 1000 头梅花鹿，无论是鹿茸血还是鹿血，我们家都有。只要是我们的粉丝来，全部是地板价哦！',
    flag: 'human',
    note: '总结推荐 - 数字人出镜收尾',
  })

  return {
    description: `鹿茸血产品介绍 - 数字人带货视频脚本（模板：鹿茸血·口播带货）`,
    templateId: 'deer_antler_blood_v1',
    sourceVideo: sourceVideoName,
    segments,
  }
}

/**
 * 创建保健品口播模板的脚本工厂
 */
export function createHealthProductScript(sourceVideoName, slotBindings) {
  const sortedSlots = Object.entries(slotBindings)
    .sort(([, a], [, b]) => a.order - b.order)

  const segments = []

  // 开场
  segments.push({
    text: '家人们，今天给大家揭秘这款保健品的真相！',
    flag: 'human',
    note: '开场吸引',
  })

  sortedSlots.forEach(([slotId, slotData]) => {
    const files = slotData.files || []
    files.forEach((file, index) => {
      segments.push({
        text: '',
        flag: 'scene',
        scene_file: file.path,
        note: `${slotData.title} - 素材 ${index + 1}`,
        templateSlotId: slotId,
      })
    })
  })

  // 收尾
  segments.push({
    text: '想要了解更多，点击评论区链接！',
    flag: 'human',
    note: '结尾引导',
  })

  return {
    description: `保健品口播脚本（模板：${slotBindings[0]?.templateName || '保健品口播'}）`,
    templateId: 'health_product_v1',
    sourceVideo: sourceVideoName,
    segments,
  }
}

export const TEMPLATE_CATALOG = [
  {
    id: 'deer_antler_blood_v1',
    version: 1,
    category: '滋补保健',
    name: '鹿茸血 · 口播带货',
    description: '适合鹿茸血、营养液、滋补饮品等口播带货视频。',
    cover: '/template-covers/deer-antler-blood.jpg',
    durationHint: '约 25～35 秒',
    aspectRatio: '9:16',

    sourceVideoRequirement: {
      expectedTransitionCount: 5,
      transitionKeyword: '转场',
      hint: '请选择使用本模板口播稿生成的数字人视频；视频中应包含 5 次"转场"标记。',
    },

    slots: [
      {
        id: 'bottle_hero',
        order: 1,
        title: '产品瓶身展示',
        required: true,
        minFiles: 1,
        maxFiles: 3,
        durationHint: '3～5 秒',
        prompt: '放入瓶身正面、包装、标签清晰可见的视频。不要有其他品牌和明显水印。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_bottle_hero',
      },
      {
        id: 'pouring_closeup',
        order: 2,
        title: '倒出液体特写',
        required: true,
        minFiles: 1,
        maxFiles: 3,
        durationHint: '2～4 秒',
        prompt: '放入倒出鹿茸血、液体流动、杯中颜色展示的视频。画面要稳定。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_pouring_closeup',
      },
      {
        id: 'drinking_scene',
        order: 3,
        title: '饮用或冲泡场景',
        required: true,
        minFiles: 1,
        maxFiles: 3,
        durationHint: '3～5 秒',
        prompt: '放入饮用、冲泡、家庭滋补氛围的视频。优先干净桌面和暖色生活场景。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_drinking_scene',
      },
      {
        id: 'gift_box_detail',
        order: 4,
        title: '礼盒与包装细节',
        required: false,
        minFiles: 0,
        maxFiles: 3,
        durationHint: '2～4 秒',
        prompt: '放入礼盒、瓶盖、包装细节、送礼场景或成分展示视频。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_gift_box_detail',
      },
      {
        id: 'ending_packshot',
        order: 5,
        title: '结尾产品定帧',
        required: true,
        minFiles: 1,
        maxFiles: 2,
        durationHint: '2～3 秒',
        prompt: '放入产品正面定帧或优惠信息背景。画面要干净，主体居中。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_ending_packshot',
      },
    ],

    scriptFactory: createDeerAntlerBloodScript,
  },
  {
    id: 'health_product_v1',
    version: 1,
    category: '滋补保健',
    name: '保健品 · 口播种草',
    description: '适合保健品、营养补充剂、健康食品的口播种草视频。',
    cover: '/template-covers/health-product.jpg',
    durationHint: '约 20～30 秒',
    aspectRatio: '9:16',

    sourceVideoRequirement: {
      expectedTransitionCount: 4,
      transitionKeyword: '转场',
      hint: '请选择包含 4 次"转场"标记的数字人视频。',
    },

    slots: [
      {
        id: 'product_intro',
        order: 1,
        title: '产品介绍',
        required: true,
        minFiles: 1,
        maxFiles: 2,
        durationHint: '3～5 秒',
        prompt: '产品正面展示、包装细节、品牌 Logo 清晰可见。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_product_intro',
      },
      {
        id: 'ingredient_show',
        order: 2,
        title: '成分展示',
        required: true,
        minFiles: 1,
        maxFiles: 3,
        durationHint: '2～4 秒',
        prompt: '成分特写、原料展示、实验室或生产环境。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_ingredient_show',
      },
      {
        id: 'usage_demo',
        order: 3,
        title: '使用演示',
        required: true,
        minFiles: 1,
        maxFiles: 3,
        durationHint: '3～5 秒',
        prompt: '服用方法、使用场景、日常生活融入。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_usage_demo',
      },
      {
        id: 'effect_feedback',
        order: 4,
        title: '效果反馈',
        required: false,
        minFiles: 0,
        maxFiles: 2,
        durationHint: '2～4 秒',
        prompt: '用户反馈、对比效果、好评截图等。',
        acceptedTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        templateSegmentKey: 'scene_effect_feedback',
      },
    ],

    scriptFactory: createHealthProductScript,
  },
]

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