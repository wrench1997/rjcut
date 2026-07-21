import { buildVFSPath, parseProjectNameFromVFS, PROJECT_FOLDERS } from '../../utils/project-structure.js'

export function safeRunPart(value, fallback = 'item') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || fallback
}

export function createTemplateRunId(now = Date.now()) {
  return `mix_${now}_${Math.random().toString(36).slice(2, 8)}`
}

export function resolveTemplateProjectName(avatarVideoPath) {
  return parseProjectNameFromVFS(avatarVideoPath) || 'RJCut'
}

export function buildTemplateRunDirectory({ avatarVideoPath, runId }) {
  const projectName = resolveTemplateProjectName(avatarVideoPath)
  const outputRoot = buildVFSPath(projectName, PROJECT_FOLDERS.OUTPUT)
  return {
    projectName,
    outputRoot,
    runDir: `${outputRoot}/模板混剪/${safeRunPart(runId, 'run')}`,
  }
}

export function buildTemplateTaskPaths({
  avatarVideoPath,
  templateId,
  runId,
  sceneId,
  sceneName,
}) {
  const base = buildTemplateRunDirectory({ avatarVideoPath, runId })
  const stem = [
    safeRunPart(templateId, 'template'),
    safeRunPart(sceneName || sceneId, 'scene'),
  ].join('_')
  return {
    ...base,
    timelinePath: `${base.runDir}/${stem}.timeline.json`,
    outputPath: `${base.runDir}/${stem}.mp4`,
    renderReportPath: `${base.runDir}/${stem}.render.json`,
    runManifestPath: `${base.runDir}/run.json`,
  }
}
