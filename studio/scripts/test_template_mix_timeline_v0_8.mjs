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
  validateExclusiveSlotBindings,
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
  videoPath: '/12344/场景素材/test.mp4',
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

// 素材位是合成时的权威顺序：即使旧项目的 scene segment 重复了
// slot_id，也必须消费全部已填素材位，且每个文件只出现一次。
const legacyRepeatedSlotProject = {
  ...project,
  digital_human: { ...project.digital_human, duration_ms: 6000 },
  timeline: {
    ...project.timeline,
    duration_ms: 6000,
    segments: [
      { id: 'h1', type: 'human', visual_mode: 'human', start_ms: 0, end_ms: 600 },
      { id: 'old1', type: 'scene', visual_mode: 'scene', slot_id: 'slot_2', start_ms: 600, end_ms: 2200 },
      { id: 'old2', type: 'scene', visual_mode: 'scene', slot_id: 'slot_2', start_ms: 2200, end_ms: 4000 },
      { id: 'old3', type: 'scene', visual_mode: 'scene', slot_id: 'slot_1', start_ms: 4000, end_ms: 5400 },
      { id: 'h2', type: 'human', visual_mode: 'human', start_ms: 5400, end_ms: 6000 },
    ],
  },
}
const strictSlots = Array.from({ length: 6 }, (_, index) => ({
  id: `slot_${index + 1}`,
  order: index + 1,
  title: `素材位 ${index + 1}`,
}))
const strictBindings = Object.fromEntries(strictSlots.map((slot, index) => [
  slot.id,
  {
    files: [
      { name: `slot-${index + 1}-a.mp4`, path: `/materials/slot-${index + 1}-a.mp4` },
      { name: `slot-${index + 1}-b.mp4`, path: `/materials/slot-${index + 1}-b.mp4` },
    ],
  },
]))
const strictBound = buildBoundLocalTimeline(
  legacyRepeatedSlotProject,
  { slots: strictSlots },
  { bindings: strictBindings },
)
const strictClips = strictBound.transition_clips || []
const strictPaths = strictClips.map((clip) => clip.scene_vfs_path)
const expectedPaths = strictSlots.flatMap((slot, index) => [
  `/materials/slot-${index + 1}-a.mp4`,
  `/materials/slot-${index + 1}-b.mp4`,
])
if (JSON.stringify(strictPaths) !== JSON.stringify(expectedPaths)) {
  throw new Error(`slot material order mismatch: ${JSON.stringify(strictPaths)}`)
}
if (new Set(strictPaths).size !== strictPaths.length) {
  throw new Error('a material file was reused by another slot')
}
strictClips.forEach((clip, index) => {
  const expectedSlotId = strictSlots[Math.floor(index / 2)].id
  if (clip.slot_id !== expectedSlotId) {
    throw new Error(`clip escaped its material slot: ${clip.scene_vfs_path} -> ${clip.slot_id}`)
  }
})

const duplicateBindings = structuredClone(strictBindings)
duplicateBindings.slot_2.files[0] = { ...duplicateBindings.slot_1.files[0] }
if (validateExclusiveSlotBindings({ slots: strictSlots }, { bindings: duplicateBindings }).length !== 1) {
  throw new Error('cross-slot duplicate material was not rejected')
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
  avatarVideoPath: '/12344/场景素材/avatar.mp4',
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
const aiAssistantSource = read('src', 'features', 'template-batch', 'aiAssistant.js')
if (!aiAssistantSource.includes('if (isTransitionSegment) sceneIndex += 1')) {
  throw new Error('copywriting template slot ids are not based on scene order')
}
if (aiAssistantSource.includes('isTransitionSegment ? `slot_${index + 1}`')) {
  throw new Error('copywriting template still counts human segments as material slots')
}

console.log('TEMPLATE_MIX_TIMELINE_V0_8=PASS')
