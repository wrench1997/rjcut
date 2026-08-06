/**
 * 模板混剪任务适配器 v0.8
 *
 * 每次点击“生成”都会创建唯一 runId、唯一 timeline 路径和唯一输出路径。
 * 不再复用草稿 id，也不会因为旧输出已存在而跳过本次渲染。
 */
import { getTemplateById } from './templateRegistry.js'
import { analyzeMaterialCoverage, buildBoundLocalTimeline } from '../digital-human-project/digitalHumanProject.js'
import { buildTemplateTaskPaths, buildTemplateRunDirectory, createTemplateRunId } from './templateRunPaths.js'
import { clampTemplateTimelineToSpeechEnd, getTemplateSpeechEndMs } from './templateTimeline.js'
import { hydrateSceneMaterialDurations } from './templateMediaDuration.js'

export function createTemplateRunDraft() {
  return {
    id: `template_draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    templateId: '',
    templateVersion: 3,
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
    execution: { concurrency: 1 },
    lastRun: null,
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
    } else {
      const clips = draft.avatarVideo.project.timeline?.transition_clips
        || draft.avatarVideo.project.transition_segments
        || []
      if (!clips.length) errors.push('数字人项目 JSON 没有标记任何场景替换段。请先在 AI 文案中设置场景段。')
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

  const boundTimeline = buildBoundLocalTimeline(draft.avatarVideo.project, template, scene)
  const timeline = clampTemplateTimelineToSpeechEnd(
    boundTimeline,
    getTemplateSpeechEndMs(boundTimeline, draft.avatarVideo.project),
  )
  return {
    ...timeline,
    description: `${template.name} - ${scene.name || '场景版本'}`,
    template_id: template.id,
    source_video: draft.avatarVideo.name,
    source_video_vfs_path: draft.avatarVideo.path,
    source_project_vfs_path: draft.avatarVideo.projectPath,
  }
}

export async function analyzeTemplateRunDraft(draft, vfs) {
  const template = getTemplateById(draft.templateId)
  if (!template) throw new Error(`模板未找到：${draft.templateId}`)
  if (!draft.avatarVideo?.project) throw new Error('缺少数字人项目 JSON')

  const scenes = await hydrateSceneMaterialDurations(draft.scenes || [], vfs)
  const hydratedDraft = { ...draft, scenes }
  const sceneReports = scenes.map((scene) => {
    const boundTimeline = buildBoundLocalTimeline(draft.avatarVideo.project, template, scene)
    const timeline = clampTemplateTimelineToSpeechEnd(
      boundTimeline,
      getTemplateSpeechEndMs(boundTimeline, draft.avatarVideo.project),
    )
    return {
      sceneId: scene.id,
      sceneName: scene.name || '未命名场景',
      coverage: analyzeMaterialCoverage(timeline),
    }
  })
  return {
    draft: hydratedDraft,
    sceneReports,
    warnings: sceneReports.flatMap((report) => report.coverage.warnings.map((warning) => ({
      ...warning,
      sceneId: report.sceneId,
      sceneName: report.sceneName,
    }))),
  }
}

async function ensureDir(vfs, path) {
  try {
    if (await vfs.exists(path)) return
  } catch (_) {}
  if (typeof vfs.mkdir === 'function') return vfs.mkdir(path, true)
  if (typeof vfs.createDirectory === 'function') return vfs.createDirectory(path, true)
  throw new Error(`VFS 不支持创建目录：${path}`)
}

export async function convertToBatchTasks(draft, vfs, options = {}) {
  const template = getTemplateById(draft.templateId)
  if (!template) throw new Error(`模板未找到：${draft.templateId}`)
  if (!draft.scenes?.length) throw new Error('没有场景版本')
  if (!draft.avatarVideo?.project) throw new Error('数字人视频没有字级时间轴项目 JSON')

  const preflight = options.preflight || await analyzeTemplateRunDraft(draft, vfs)
  const workingDraft = preflight.draft || draft
  const runId = options.runId || createTemplateRunId()
  const runInfo = buildTemplateRunDirectory({
    avatarVideoPath: draft.avatarVideo.path,
    runId,
  })
  await ensureDir(vfs, runInfo.runDir)

  const tasks = []
  for (let sceneIndex = 0; sceneIndex < draft.scenes.length; sceneIndex += 1) {
    const scene = workingDraft.scenes[sceneIndex]
    const sceneId = scene.id || `scene_${String(sceneIndex + 1).padStart(3, '0')}`
    const sceneName = scene.name || `场景版本 ${sceneIndex + 1}`
    const timeline = await generateSceneScript(workingDraft, scene)
    const paths = buildTemplateTaskPaths({
      avatarVideoPath: draft.avatarVideo.path,
      templateId: draft.templateId,
      runId,
      sceneId,
      sceneName,
    })
    await ensureDir(vfs, paths.runDir)

    const timelineDocument = {
      ...timeline,
      run_id: runId,
      scene_id: sceneId,
      scene_name: sceneName,
      output_path: paths.outputPath,
      generated_at: new Date().toISOString(),
    }
    await vfs.writeFile(
      paths.timelinePath,
      new TextEncoder().encode(JSON.stringify(timelineDocument, null, 2)),
      { type: 'application/json' },
    )

    tasks.push({
      id: `${runId}_${sceneId}`,
      runId,
      sceneId,
      sceneName,
      displayName: `${template.name} · ${sceneName}`,
      vfsVideoPath: workingDraft.avatarVideo.path,
      vfsProjectPath: workingDraft.avatarVideo.projectPath,
      vfsTimelinePath: paths.timelinePath,
      vfsScriptPath: paths.timelinePath,
      vfsCorrectionsPath: null,
      vfsBgmPath: workingDraft.outputConfig?.audio?.enabled ? workingDraft.outputConfig.audio.bgmPath : null,
      vfsFontPath: workingDraft.outputConfig?.subtitleFont?.enabled
        ? workingDraft.outputConfig.subtitleFont.vfsFontPath
        : null,
      outputPath: paths.outputPath,
      outputDir: paths.runDir,
      renderReportPath: paths.renderReportPath,
      runManifestPath: paths.runManifestPath,
      stage: 'idle',
      stageLabel: '等待本地渲染',
      progress: 0,
      localOnly: true,
      templateMeta: {
        templateId: draft.templateId,
        templateVersion: draft.templateVersion || 3,
        templateName: template.name,
        sceneIndex,
        sceneName,
        avatarVideoName: draft.avatarVideo.name,
        timelineSchema: timeline.schema,
        transitionCount: timeline.transition_clips?.length || 0,
      },
      globalParams: mergeRenderParams(workingDraft.outputConfig?.globalParams, scene.overrideRenderParams),
      audioConfig: workingDraft.outputConfig?.audio?.enabled
        ? {
            bgmVolume: workingDraft.outputConfig.audio.bgmVolume,
            originalVolume: workingDraft.outputConfig.audio.originalVolume,
            startTime: workingDraft.outputConfig.audio.startTime,
            loop: workingDraft.outputConfig.audio.loop,
            fadeInDuration: workingDraft.outputConfig.audio.fadeInDuration,
            fadeOutDuration: workingDraft.outputConfig.audio.fadeOutDuration,
          }
        : null,
    })
  }

  const manifest = {
    schema: 'rjcut.template-batch-run/v1',
    run_id: runId,
    created_at: new Date().toISOString(),
    draft_id: workingDraft.id,
    template_id: workingDraft.templateId,
    template_name: template.name,
    source_video: draft.avatarVideo.path,
    source_project: draft.avatarVideo.projectPath,
    output_directory: runInfo.runDir,
    tasks: tasks.map((task) => ({
      task_id: task.id,
      scene_id: task.sceneId,
      scene_name: task.sceneName,
      timeline_path: task.vfsTimelinePath,
      output_path: task.outputPath,
      transition_count: task.templateMeta.transitionCount,
    })),
  }
  await vfs.writeFile(
    `${runInfo.runDir}/run.json`,
    new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    { type: 'application/json' },
  )

  return { runId, runDir: runInfo.runDir, manifest, tasks, warnings: preflight.warnings || [] }
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
