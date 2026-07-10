/**
 * 模板混剪 - 本地时间线任务适配器
 *
 * 模板任务不再上传数字人视频到后端，也不再请求 agent-draft/agent-compose。
 * 每条任务直接携带由 .rjdh.json 生成的本地 timeline.json。
 */
import { getTemplateById } from './templateRegistry.js'
import { buildVFSPath } from '../../utils/project-structure.js'
import { buildBoundLocalTimeline } from '../digital-human-project/digitalHumanProject.js'

export function createTemplateRunDraft() {
  return {
    id: `template_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    templateId: '',
    templateVersion: 2,
    avatarVideo: {
      path: '',
      name: '',
      taskId: '',
      source: 'vfs',
      durationSeconds: null,
      linkedTemplateId: null,
      projectPath: '',
      project: null,
    },
    scenes: [],
    globalRenderParams: null,
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
      subtitleFont: { enabled: false, vfsFontPath: '', fontName: '' },
      corrections: { enabled: false, mode: 'manual', vfsPath: '', entries: [] },
    },
    execution: { concurrency: 3 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function updateDraftTimestamp(draft) {
  return { ...draft, updatedAt: new Date().toISOString() }
}

export function validateTemplateRunDraft(draft, stepId) {
  const errors = []
  const template = getTemplateById(draft.templateId)

  if (stepId === 'select_template' && !draft.templateId) errors.push('请选择一个模板。')

  if (stepId === 'select_avatar_video') {
    if (!draft.avatarVideo?.path) errors.push('请选择数字人口播视频。')
    if (!draft.avatarVideo?.project) {
      errors.push('该视频缺少同名 .rjdh.json，无法获得字级时间轴。请使用新版数字人接口重新生成。')
    } else if (!Array.isArray(draft.avatarVideo.project.char_timings) || !draft.avatarVideo.project.char_timings.length) {
      errors.push('数字人项目 JSON 中没有 char_timings。')
    }
  }

  if (stepId === 'add_scenes') {
    if (!template) {
      errors.push('模板未找到。')
    } else if (!draft.scenes?.length) {
      errors.push('请添加至少一个场景版本。')
    } else {
      draft.scenes.forEach((scene, index) => {
        const missing = template.slots
          .filter((slot) => slot.required)
          .filter((slot) => (scene.bindings?.[slot.id]?.files?.length || 0) < slot.minFiles)
          .map((slot) => slot.title)
        if (missing.length) errors.push(`${scene.name || `场景版本 ${index + 1}`} 缺少素材：${missing.join('、')}`)
      })
    }
  }

  return errors
}

export async function generateSceneScript(draft, scene) {
  const template = getTemplateById(draft.templateId)
  if (!template) throw new Error(`模板未找到：${draft.templateId}`)
  if (!draft.avatarVideo?.project) throw new Error('缺少数字人项目 JSON')

  const timeline = buildBoundLocalTimeline(draft.avatarVideo.project, template, scene)
  return {
    ...timeline,
    description: `${template.name} - ${scene.name || '场景版本'}`,
    template_id: template.id,
    source_video: draft.avatarVideo.name,
    source_video_vfs_path: draft.avatarVideo.path,
    source_project_vfs_path: draft.avatarVideo.projectPath,
  }
}

export async function convertToBatchTasks(draft, vfs) {
  const template = getTemplateById(draft.templateId)
  if (!template) throw new Error(`模板未找到：${draft.templateId}`)
  if (!draft.scenes?.length) throw new Error('没有场景版本')
  if (!draft.avatarVideo?.project) throw new Error('数字人视频没有字级时间轴项目 JSON')

  const tasks = []
  for (let sceneIndex = 0; sceneIndex < draft.scenes.length; sceneIndex += 1) {
    const scene = draft.scenes[sceneIndex]
    const sceneId = scene.id || `scene_${String(sceneIndex + 1).padStart(3, '0')}`
    const sceneName = scene.name || `场景版本 ${sceneIndex + 1}`
    const timeline = await generateSceneScript(draft, scene)
    const projectName = `template_${draft.templateId}_${draft.id.slice(-8)}`
    const sceneDir = buildVFSPath(projectName, sceneId)

    try {
      await vfs.mkdir(sceneDir, true)
    } catch (error) {
      await vfs.createDirectory?.(sceneDir, true)
    }

    const timelinePath = `${sceneDir}/timeline.json`
    await vfs.writeFile(timelinePath, new TextEncoder().encode(JSON.stringify(timeline, null, 2)))

    tasks.push({
      id: `${draft.id}_${sceneId}`,
      sceneId,
      sceneName,
      vfsVideoPath: draft.avatarVideo.path,
      vfsProjectPath: draft.avatarVideo.projectPath,
      vfsTimelinePath: timelinePath,
      // Compatibility: old UI still reads vfsScriptPath in a few places.
      vfsScriptPath: timelinePath,
      vfsCorrectionsPath: null,
      vfsBgmPath: draft.outputConfig?.audio?.enabled ? draft.outputConfig.audio.bgmPath : null,
      vfsFontPath: draft.outputConfig?.subtitleFont?.enabled
        ? draft.outputConfig.subtitleFont.vfsFontPath
        : null,
      stage: 'idle',
      progress: 0,
      localOnly: true,
      templateMeta: {
        templateId: draft.templateId,
        templateVersion: draft.templateVersion || 2,
        templateName: template.name,
        sceneIndex,
        sceneName,
        avatarVideoName: draft.avatarVideo.name,
        timelineSchema: timeline.schema,
      },
      globalParams: mergeRenderParams(draft.outputConfig?.globalParams, scene.overrideRenderParams),
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
    })
  }
  return tasks
}

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

export async function validateSlotFiles(draft, vfs) {
  const missingFiles = []
  for (const scene of draft.scenes || []) {
    for (const [slotId, slotData] of Object.entries(scene.bindings || {})) {
      for (const file of slotData.files || []) {
        try {
          if (!(await vfs.exists(file.path))) {
            missingFiles.push({ sceneId: scene.id, sceneName: scene.name, slotId, slotTitle: slotData.title, filePath: file.path })
          }
        } catch (error) {
          missingFiles.push({ sceneId: scene.id, sceneName: scene.name, slotId, slotTitle: slotData.title, filePath: file.path, error: error.message })
        }
      }
    }
  }
  return missingFiles
}

export function calculateCompletion(draft) {
  const template = getTemplateById(draft.templateId)
  if (!template || !draft.scenes?.length) return 0
  const required = template.slots.filter((slot) => slot.required)
  if (!required.length) return 100
  const values = draft.scenes.map((scene) => {
    const completed = required.filter((slot) => (scene.bindings?.[slot.id]?.files?.length || 0) >= slot.minFiles)
    return completed.length / required.length
  })
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100)
}
