import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const studio = path.basename(root).toLowerCase() === 'studio'
  ? root
  : path.join(root, 'studio')

function read(...parts) {
  return fs.readFileSync(path.join(studio, ...parts), 'utf8')
}

async function importSource(source) {
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

const projectSource = read(
  'src',
  'features',
  'digital-human-project',
  'digitalHumanProject.js',
)
const projectModule = await importSource(projectSource)
const {
  buildDigitalHumanProject,
  buildBoundLocalTimeline,
  normalizeCopywritingPlan,
} = projectModule

const plan = normalizeCopywritingPlan({
  spoken_text: '数字人开场。这里展示鹿场来源。数字人收尾。',
  segments: [
    { id: 's1', text: '数字人开场。', visual_mode: 'human' },
    { id: 's2', text: '这里展示鹿场来源。', visual_mode: 'scene', slot_id: 'slot_1' },
    { id: 's3', text: '数字人收尾。', visual_mode: 'human' },
  ],
})
const charTimings = [...plan.spoken_text].map((char, index) => ({
  index,
  char,
  start_ms: index * 100,
  end_ms: (index + 1) * 100,
}))
const project = buildDigitalHumanProject({
  taskId: 'v08_test',
  result: {
    video_url: '/test.mp4',
    duration_ms: charTimings.at(-1).end_ms + 200,
    text: plan.spoken_text,
    char_timings: charTimings,
  },
  copywritingPlan: plan,
  videoPath: '/12344/剪辑视频/test.mp4',
})

if (project.schema !== 'rjcut.digital-human-project/v2') {
  throw new Error(`project schema mismatch: ${project.schema}`)
}
if (project.transition_segments.length !== 1) {
  throw new Error('timed transition segment missing')
}
const timed = project.transition_segments[0]
if (!Number.isInteger(timed.start_ms) || !Number.isInteger(timed.end_ms) || timed.end_ms <= timed.start_ms) {
  throw new Error('transition segment does not contain valid millisecond range')
}
if (project.timeline.transition_clips?.[0]?.segment_id !== 's2') {
  throw new Error('timeline.transition_clips missing scene segment')
}

const bound = buildBoundLocalTimeline(
  project,
  { slots: [{ id: 'slot_1', title: '鹿场' }] },
  { bindings: { slot_1: { files: [{ name: 'farm.mp4', path: '/12344/素材/farm.mp4' }] } } },
)
if (bound.transition_clips?.[0]?.scene_vfs_path !== '/12344/素材/farm.mp4') {
  throw new Error('bound transition clip missing scene path')
}

let pathSource = read('src', 'features', 'template-batch', 'templateRunPaths.js')
pathSource = pathSource.replace(
  /^import .*$/m,
  `const PROJECT_FOLDERS={OUTPUT:'输出'};
   function buildVFSPath(projectName, subPath=''){return '/' + projectName + (subPath ? '/' + subPath : '')}
   function parseProjectNameFromVFS(value){return String(value||'').split('/').filter(Boolean)[0] || null}`,
)
const pathModule = await importSource(pathSource)
const runA = pathModule.createTemplateRunId(1000)
const runB = pathModule.createTemplateRunId(1000)
if (runA === runB) throw new Error('runId must be unique')
const taskPaths = pathModule.buildTemplateTaskPaths({
  avatarVideoPath: '/12344/剪辑视频/avatar.mp4',
  templateId: 'deer',
  runId: runA,
  sceneId: 'scene_1',
  sceneName: '版本一',
})
if (!taskPaths.outputPath.startsWith(`/12344/输出/模板混剪/${runA}/`)) {
  throw new Error(`output path is not isolated by runId: ${taskPaths.outputPath}`)
}

const pageSource = read('src', 'features', 'template-batch', 'TemplateBatchPage.jsx')
if (!pageSource.includes('reset()')) throw new Error('new batch must reset previous task state')
if (!pageSource.includes('const converted = await convertToBatchTasks')) {
  throw new Error('TemplateBatchPage must use run-isolated adapter result')
}

const progressSource = read('src', 'features', 'template-batch', 'steps', 'TaskProgressStep.jsx')
if (progressSource.includes('composeVideo = async')) {
  throw new Error('TaskProgressStep must not perform rendering as a UI side effect')
}
if (!progressSource.includes('task.outputPath')) {
  throw new Error('TaskProgressStep must use the output path recorded on the current task')
}
if (progressSource.includes("`/输出/${task.id}_成片.mp4`")) {
  throw new Error('TaskProgressStep still uses stale global output path')
}

const storeSource = read('src', 'api', 'useBatchProcessStore.js')
if (!storeSource.includes('renderLocalTemplateTask')) {
  throw new Error('local renderer is not connected to batch store')
}

const editorSource = read('src', 'utils', 'videoEditorEngine.js')
if (editorSource.includes('concat=n=2')) {
  throw new Error('video merge still drops clips after the second segment')
}
if (!editorSource.includes('concat=n=${clipCount}')) {
  throw new Error('video merge does not include all timeline clips')
}

const studioSource = read('src', 'components', 'DigitalHumanStudio.jsx')
if (!studioSource.includes('已写入 JSON 的场景替换时间')) {
  throw new Error('DigitalHumanStudio does not display timed transition ranges')
}
if (!studioSource.includes('生成数字人后按 char_timings 写入精确毫秒时间')) {
  throw new Error('AI copywriting UI does not explain semantic-to-time mapping')
}

console.log('TEMPLATE_MIX_TIMELINE_V0_8=PASS')
