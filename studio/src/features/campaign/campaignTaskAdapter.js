/**
 * 内容创作向导 - 任务适配层
 * 将普通用户的 campaignDraft 转换为 BatchProcessor / useBatchProcessStore 所需的任务格式
 * 
 * 这是本次改造最重要的部分 - 复用现有任务构造逻辑，不重新发明后端协议
 */

import { DEFAULT_CONFIG } from '../../components/GlobalParamsVisualEditor'

/**
 * 按角色分组素材
 */
export function groupAssetsByRole(assets) {
  return assets.reduce((result, asset) => {
    const role = asset.role || 'product'
    if (!result[role]) result[role] = []
    result[role].push(asset)
    return result
  }, {})
}

/**
 * 根据策略选择素材组合
 */
export function selectAssetsForPlan({ assetsByRole, enabledScenes, strategy, copyVariants }) {
  const selectedBackgroundAssets = []
  
  // 获取所有可用素材
  const allAssets = Object.values(assetsByRole).flat()
  
  if (allAssets.length === 0) {
    return selectedBackgroundAssets
  }

  if (strategy === 'all_combinations') {
    // 每个素材都生成一条
    allAssets.forEach((asset, index) => {
      selectedBackgroundAssets.push({
        ...asset,
        variantIndex: 0,
        taskIndex: index,
      })
    })
  } else if (strategy === 'random') {
    // 随机搭配
    for (let i = 0; i < copyVariants; i += 1) {
      const randomAsset = allAssets[Math.floor(Math.random() * allAssets.length)]
      selectedBackgroundAssets.push({
        ...randomAsset,
        variantIndex: i,
        taskIndex: i,
      })
    }
  } else {
    // rotate（默认）：依次轮换
    enabledScenes.forEach((scene, sceneIndex) => {
      const roleAssets = assetsByRole[scene.assetRole] || allAssets
      if (roleAssets.length === 0) return

      for (let i = 0; i < copyVariants; i += 1) {
        const assetIndex = (sceneIndex + i) % roleAssets.length
        selectedBackgroundAssets.push({
          ...roleAssets[assetIndex],
          variantIndex: i,
          taskIndex: selectedBackgroundAssets.length,
          sceneRole: scene.assetRole,
        })
      }
    })
  }

  return selectedBackgroundAssets
}

/**
 * 构建批量执行计划
 * 将 campaignDraft 转换为可执行的任务列表
 */
export function buildCampaignExecutionPlan({ draft, existingGlobalParams, availableAssets }) {
  const enabledScenes = draft.script.scenes.filter((scene) => scene.enabled)

  if (!enabledScenes.length) {
    throw new Error('至少需要一个启用的脚本段落。')
  }

  const assetsByRole = groupAssetsByRole(draft.assets)

  // 合并所有段落的文案
  const scriptText = enabledScenes
    .map((scene) => scene.narration.trim())
    .filter(Boolean)
    .join('\n')

  // 选择素材
  const selectedBackgroundAssets = selectAssetsForPlan({
    assetsByRole,
    enabledScenes,
    strategy: draft.batchPlan.assetStrategy,
    copyVariants: draft.batchPlan.copyVariants,
  })

  if (selectedBackgroundAssets.length === 0) {
    throw new Error('没有可用的环境视频素材。')
  }

  // 构建执行项
  const executionItems = selectedBackgroundAssets.map((asset, index) => {
    return {
      id: `campaign_task_${draft.id}_${index}`,
      campaignId: draft.id,
      campaignName: draft.name,
      displayName: `${draft.name} - ${index + 1}`,
      narration: scriptText,
      sourceAsset: asset,

      digitalHuman: {
        personId: draft.digitalHuman.personId,
        voiceId: draft.digitalHuman.voiceId,
      },

      // 使用现有 GlobalParamsVisualEditor 的默认配置或用户自定义配置
      globalParams: existingGlobalParams || DEFAULT_CONFIG,

      // 仅给 UI 展示使用
      userFacingMeta: {
        platform: draft.platform,
        aspectRatio: draft.aspectRatio,
        sceneCount: enabledScenes.length,
        assetName: asset.name,
        variantIndex: asset.variantIndex,
      },
    }
  })

  return {
    campaignId: draft.id,
    campaignName: draft.name,
    mode: draft.batchPlan.generationMode,
    sampleCount: draft.batchPlan.sampleCount,
    totalLimit: draft.batchPlan.totalLimit,
    executionItems,
  }
}

/**
 * 将执行计划转换为 BatchProcessor 可接受的任务格式
 * 复用现有 prepareTasks 逻辑
 */
export function convertToBatchProcessorTasks(executionPlan, vfs) {
  const { executionItems, mode, sampleCount } = executionPlan

  // 如果是样片优先模式，只返回第一个任务
  let tasksToCreate = executionItems
  if (mode === 'sample_first' && sampleCount > 0) {
    tasksToCreate = executionItems.slice(0, Math.min(sampleCount, executionItems.length))
  }

  // 转换为 BatchProcessor 的任务格式
  // 注意：这里需要创建一个临时的脚本文件来存储文案
  return tasksToCreate.map((item, index) => {
    // 构建任务对象，复用 BatchProcessor 的字段结构
    return {
      id: item.id,
      campaignId: item.campaignId,
      campaignName: item.campaignName,
      displayName: item.displayName,
      
      // 复用 BatchProcessor 的字段
      vfsVideoPath: item.sourceAsset.path, // 环境视频路径
      vfsScriptPath: null, // 脚本路径（由系统自动生成）
      vfsCorrectionsPath: null,
      vfsBgmPath: null,
      vfsScenesPath: item.sourceAsset.path?.substring(0, item.sourceAsset.path.lastIndexOf('/')) || '/',
      
      // 额外信息
      narration: item.narration,
      digitalHuman: item.digitalHuman,
      globalParams: item.globalParams,
      userFacingMeta: item.userFacingMeta,
      
      // 状态
      stage: 'idle',
      progress: 0,
    }
  })
}

/**
 * 计算预计生成的任务数量
 */
export function estimateTaskCount({ copyVariants, assetCount, assetStrategy, totalLimit }) {
  const variants = Math.max(1, Number(copyVariants) || 1)
  const assets = Math.max(1, Number(assetCount) || 1)

  let total = variants

  if (assetStrategy === 'all_combinations') {
    total = variants * assets
  }

  if (assetStrategy === 'rotate' || assetStrategy === 'random') {
    total = variants
  }

  return Math.min(total, Math.max(1, Number(totalLimit) || 1))
}