/**
 * 模板混剪 - 任务适配器
 * 将模板运行草稿转换为 BatchProcessor 可处理的任务格式
 */

import { getTemplateById } from './templateRegistry.js'
import { getVFS } from '../../utils/vfsClient.js'
import { buildVFSPath, PROJECT_FOLDERS } from '../../utils/project-structure.js'

/**
 * 创建模板运行草稿的默认结构
 * 新结构支持：1 个模板 + 1 个数字人视频 + N 个场景版本 = N 条视频
 */
export function createTemplateRunDraft() {
  return {
    id: `template_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    templateId: '',
    templateVersion: 1,

    // 数字人视频（批次级别共用）
    avatarVideo: {
      path: '',
      name: '',
      taskId: '',
      source: 'vfs', // 'vfs' | 'dh_task'
      durationSeconds: null,
      linkedTemplateId: null,
    },

    // 场景版本列表 - 每个版本对应一条最终视频
    scenes: [],
    // 场景版本模板：{
    //   id: 'scene_xxx',
    //   name: '鹿场环境版',
    //   bindings: {
    //     bottle_hero: { files: [...] },
    //     pouring_closeup: { files: [...] }
    //   },
    //   overrideRenderParams: null  // 可选的场景级参数覆盖
    // }

    // 全局成片参数
    globalRenderParams: null,

    // 输出配置（兼容旧结构，逐步迁移）
    outputConfig: {
      globalParams: null,

      audio: {
        enabled: false,
        bgmPath: '',
        bgmName: '',
        bgmVolume: 0.28,
        originalVolume: 1.0,
        startTime: 0,
        loop: true,
        fadeInDuration: 0.5,
        fadeOutDuration: 0.8,
      },

      subtitleFont: {
        enabled: false,
        vfsFontPath: '',
        fontName: '',
      },

      corrections: {
        enabled: false,
        mode: 'manual',
        vfsPath: '',
        entries: [],
      },
    },

    // 执行配置
    execution: {
      concurrency: 3, // 同时生成几条视频
    },

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 更新草稿时间戳
 */
export function updateDraftTimestamp(draft) {
  return {
    ...draft,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * 验证模板运行草稿
 * 支持新的场景版本结构
 */
export function validateTemplateRunDraft(draft, stepId) {
  const errors = []
  const template = getTemplateById(draft.templateId)

  if (stepId === 'select_template') {
    if (!draft.templateId) {
      errors.push('请选择一个模板。')
    }
  }

  if (stepId === 'select_avatar_video') {
    if (!draft.avatarVideo?.path) {
      errors.push('请选择数字人口播视频。')
    }

    // 如果模板有转场数量要求，给出警告（不阻止）
    if (template?.sourceVideoRequirement?.expectedTransitionCount) {
      console.log(
        `[模板提示] 此模板建议使用含有 ${template.sourceVideoRequirement.expectedTransitionCount} 段转场的口播视频。`
      )
    }
  }

  if (stepId === 'add_scenes') {
    if (!template) {
      errors.push('模板未找到。')
    } else if (!draft.scenes || draft.scenes.length === 0) {
      errors.push('请添加至少一个场景版本。')
    } else {
      // 检查每个场景版本的素材完整性
      draft.scenes.forEach((scene, index) => {
        const sceneName = scene.name || `场景版本 ${index + 1}`
        const missingSlots = []

        template.slots.forEach((slot) => {
          if (!slot.required) return

          const binding = scene.bindings?.[slot.id]
          const fileCount = binding?.files?.length || 0

          if (fileCount < slot.minFiles) {
            missingSlots.push(slot.title)
          }
        })

        if (missingSlots.length > 0) {
          errors.push(`${sceneName} 缺少素材：${missingSlots.join('、')}`)
        }
      })
    }
  }

  return errors
}

/**
 * 为单个场景版本生成 script.json
 * 使用该场景的 bindings 直接生成
 */
export async function generateSceneScript(draft, scene) {
  const template = getTemplateById(draft.templateId)
  if (!template) {
    throw new Error(`模板未找到：${draft.templateId}`)
  }

  // 构建 slotBindings 格式（兼容模板的 scriptFactory）
  const selectedBindings = {}

  Object.entries(scene.bindings || {}).forEach(([slotId, slotData]) => {
    selectedBindings[slotId] = {
      order: slotData.order || 0,
      title: slotData.title || '',
      files: slotData.files || [],
    }
  })

  // 调用模板的 scriptFactory
  const script = template.scriptFactory(draft.avatarVideo.name, selectedBindings)

  console.log('[templateRunAdapter] 生成的 script.json:', JSON.stringify(script, null, 2))

  return script
}

/**
 * 将模板运行草稿转换为批次任务（新结构：每个场景版本一个任务）
 * 支持直接提交到后端的 /v1/template-batches 接口
 * 支持 AI 生成的文案
 */
export async function convertToBatchTasks(draft, vfs) {
  const template = getTemplateById(draft.templateId)
  if (!template) {
    throw new Error(`模板未找到：${draft.templateId}`)
  }

  if (!draft.scenes || draft.scenes.length === 0) {
    throw new Error('没有场景版本')
  }

  const tasks = []

  // 为每个场景版本生成任务
  for (let sceneIndex = 0; sceneIndex < draft.scenes.length; sceneIndex += 1) {
    const scene = draft.scenes[sceneIndex]
    const sceneId = scene.id || `scene_${String(sceneIndex + 1).padStart(3, '0')}`
    const sceneName = scene.name || `场景版本 ${sceneIndex + 1}`
    
// 生成该场景的 script.json
    const script = await generateSceneScript(draft, scene, false)
    
    // 创建项目目录结构
    const projectName = `template_${draft.templateId}_${draft.id.slice(-8)}`
    const sceneDir = buildVFSPath(projectName, sceneId)
    
    // 确保目录存在
    try {
      await vfs.mkdir(sceneDir, true)
    } catch (e) {
      console.error('[templateRunAdapter] 创建目录失败:', e)
    }

    // 写入 script.json
    const scriptPath = `${sceneDir}/script.json`
    const scriptContent = JSON.stringify(script, null, 2)
    await vfs.writeFile(scriptPath, new TextEncoder().encode(scriptContent))

    // 处理纠错字典（全局参数）
    let correctionsPath = null
    const correctionsConfig = draft.outputConfig?.corrections
    if (correctionsConfig?.enabled && correctionsConfig.entries?.length > 0) {
      const correctionsData = {
        corrections: Object.fromEntries(
          correctionsConfig.entries.map((entry) => [entry.heard, entry.correct])
        ),
      }
      const correctionsFileName = `corrections-${sceneId}.json`
      const correctionsPathInScene = `${sceneDir}/${correctionsFileName}`
      const correctionsContent = JSON.stringify(correctionsData, null, 2)
      await vfs.writeFile(correctionsPathInScene, new TextEncoder().encode(correctionsContent))
      correctionsPath = correctionsPathInScene
    }

    // 创建任务项（兼容旧 BatchProcessor 格式，但使用新结构）
    const taskItem = {
      id: `${draft.id}_${sceneId}`,
      sceneId,
      sceneName,
      vfsVideoPath: draft.avatarVideo.path,
      vfsScriptPath: scriptPath,
      vfsCorrectionsPath: correctionsPath,
      vfsBgmPath: draft.outputConfig?.audio?.enabled
        ? draft.outputConfig.audio.bgmPath
        : null,
      vfsFontPath: draft.outputConfig?.subtitleFont?.enabled
        ? draft.outputConfig.subtitleFont.vfsFontPath
        : null,
      stage: 'idle',
      progress: 0,
      templateMeta: {
        templateId: draft.templateId,
        templateVersion: draft.templateVersion || 1,
        templateName: template.name,
        sceneIndex,
        sceneName,
        avatarVideoName: draft.avatarVideo.name,
      },
      // 合并全局参数和场景级覆盖参数
      globalParams: mergeRenderParams(
        draft.outputConfig?.globalParams,
        scene.overrideRenderParams
      ),
      audioConfig: draft.outputConfig?.audio?.enabled
        ? {
            bgmVolume: draft.outputConfig.audio.bgmVolume,
            originalVolume: draft.outputConfig.audio.originalVolume,
            startTime: draft.outputConfig.audio.startTime,
            loop: draft.outputConfig.audio.loop,
            fadeInDuration: draft.outputConfig.audio.fadeInDuration,
            fadeOutDuration: draft.outputConfig.audio.fadeOutDuration,
          }
        : null,
    }

    tasks.push(taskItem)
  }

  return tasks
}

/**
 * 合并全局参数和场景级覆盖参数
 * 优先级：场景覆盖 > 全局参数 > 默认值
 */
function mergeRenderParams(globalParams, overrideParams) {
  if (!globalParams && !overrideParams) return null
  if (!overrideParams) return globalParams
  if (!globalParams) return overrideParams

  return {
    pipeline: { ...globalParams.pipeline, ...overrideParams.pipeline },
    subtitle: { ...globalParams.subtitle, ...overrideParams.subtitle },
    audio: { ...globalParams.audio, ...overrideParams.audio },
    output: { ...globalParams.output, ...overrideParams.output },
  }
}

/**
 * 验证素材文件是否存在于 VFS 中（新结构：按场景版本验证）
 */
export async function validateSlotFiles(draft, vfs) {
  const missingFiles = []

  for (const scene of draft.scenes || []) {
    const sceneName = scene.name || `场景版本`
    for (const [slotId, slotData] of Object.entries(scene.bindings || {})) {
      const files = slotData.files || []
      for (const file of files) {
        try {
          const exists = await vfs.exists(file.path)
          if (!exists) {
            missingFiles.push({
              sceneId: scene.id,
              sceneName,
              slotId,
              slotTitle: slotData.title,
              filePath: file.path,
            })
          }
        } catch (e) {
          missingFiles.push({
            sceneId: scene.id,
            sceneName,
            slotId,
            slotTitle: slotData.title,
            filePath: file.path,
            error: e.message,
          })
        }
      }
    }
  }

  return missingFiles
}

/**
 * 计算完成度（新结构：按场景版本计算）
 */
export function calculateCompletion(draft) {
  const template = getTemplateById(draft.templateId)
  if (!template) return 0

  if (!draft.scenes || draft.scenes.length === 0) return 0

  const requiredSlots = template.slots.filter((s) => s.required)
  
  // 计算所有场景的平均完成度
  const sceneCompletions = draft.scenes.map((scene) => {
    const completedRequired = requiredSlots.filter((slot) => {
      const binding = scene.bindings?.[slot.id]
      return binding?.files?.length >= slot.minFiles
    })
    return completedRequired.length / requiredSlots.length
  })

  const avgCompletion = sceneCompletions.reduce((a, b) => a + b, 0) / sceneCompletions.length
  return Math.round(avgCompletion * 100)
}