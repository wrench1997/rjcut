/**
 * 内容创作向导 - 默认配置和数据模型
 * 普通用户模型，不直接暴露技术字段
 */

export const CAMPAIGN_STEPS = [
  { id: 'basics', label: '创建栏目', shortLabel: '栏目' },
  { id: 'assets', label: '添加环境视频', shortLabel: '素材' },
  { id: 'plan', label: '批量方案', shortLabel: '方案' },
  { id: 'review', label: '确认生成', shortLabel: '确认' },
]

export const ASSET_ROLES = [
  {
    id: 'hook',
    title: '开场环境',
    description: '用于第一秒吸引用户，例如街头、办公室、通勤画面。',
    maxRecommended: 3,
  },
  {
    id: 'product',
    title: '产品展示',
    description: '展示产品外观、细节、功能和卖点。',
    maxRecommended: 8,
  },
  {
    id: 'usage',
    title: '使用场景',
    description: '展示真实使用过程，例如通勤、收纳、上身、办公。',
    maxRecommended: 6,
  },
  {
    id: 'ending',
    title: '结尾素材',
    description: '用于产品定帧、品牌 Logo、优惠信息或行动引导。',
    maxRecommended: 3,
  },
]

export const PLATFORM_OPTIONS = [
  { id: 'douyin', label: '抖音', aspectRatio: '9:16' },
  { id: 'xiaohongshu', label: '小红书', aspectRatio: '9:16' },
  { id: 'video_account', label: '视频号', aspectRatio: '9:16' },
  { id: 'bilibili', label: '哔哩哔哩', aspectRatio: '16:9' },
  { id: 'custom', label: '自定义', aspectRatio: '9:16' },
]

export const STYLE_OPTIONS = [
  { id: 'direct_sale', label: '直接促销', description: '节奏快，强调痛点、卖点和行动号召。' },
  { id: 'premium', label: '高级质感', description: '克制、简洁、强调氛围和产品价值。' },
  { id: 'social_review', label: '种草分享', description: '像真实用户分享体验，适合小红书。' },
  { id: 'explainer', label: '口播讲解', description: '清楚解释产品功能、使用方法和适用人群。' },
]

export function createCampaignDraft() {
  return {
    version: 1,
    id: `campaign_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    platform: 'douyin',
    aspectRatio: '9:16',
    productBrief: {
      productName: '',
      sellingPoints: '',
      targetAudience: '',
      tone: 'direct_sale',
      prohibitedWords: '',
      callToAction: '',
    },
    digitalHuman: {
      personId: '',
      personName: '',
      voiceId: '',
      voiceName: '',
    },
    assets: [],
    batchPlan: {
      generationMode: 'sample_first',
      copyVariants: 1,
      assetStrategy: 'rotate',
      sampleCount: 1,
      totalLimit: 20,
    },
    advanced: {
      enabled: false,
      globalParams: null,
      maxConcurrent: null,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function updateDraftTimestamp(draft) {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  }
}

export function validateCampaignDraft(draft, stepId) {
  const errors = []

  if (stepId === 'basics') {
    if (!draft.name.trim()) errors.push('请填写栏目名称。')
    if (!draft.productBrief.productName.trim()) errors.push('请填写产品或内容主题。')
    if (!draft.digitalHuman.personId) errors.push('请选择数字人。')
  }

  if (stepId === 'assets') {
    if (!draft.assets.length) errors.push('请至少添加一个环境视频。')
  }

  

  return errors
}