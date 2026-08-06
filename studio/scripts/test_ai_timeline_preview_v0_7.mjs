import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const studio = path.basename(root).toLowerCase() === 'studio'
  ? root
  : path.join(root, 'studio')

const projectModulePath = path.join(
  studio,
  'src',
  'features',
  'digital-human-project',
  'digitalHumanProject.js',
)
const projectSource = fs.readFileSync(projectModulePath, 'utf8')
const projectModule = await import(
  `data:text/javascript;base64,${Buffer.from(projectSource).toString('base64')}`
)

const {
  buildDigitalHumanProject,
  buildBoundLocalTimeline,
  normalizeCopywritingPlan,
} = projectModule

const plan = normalizeCopywritingPlan({
  spoken_text: '开场提醒。这里展示鹿场来源。最后引导下单。',
  segments: [
    { id: 's1', text: '开场提醒。', visual_mode: 'human' },
    {
      id: 's2',
      text: '这里展示鹿场来源。',
      visual_mode: 'scene',
      slot_id: 'slot_1',
      visual_tags: ['鹿场来源'],
    },
    { id: 's3', text: '最后引导下单。', visual_mode: 'human' },
  ],
})

if (plan.schema !== 'rjcut.copywriting-plan/v2') {
  throw new Error(`copywriting schema mismatch: ${plan.schema}`)
}
if (!plan.segments[1].is_transition_segment) {
  throw new Error('scene segment should be explicitly marked as transition segment')
}
if (plan.segments[1].edit_action !== 'replace_visual') {
  throw new Error('scene segment edit_action mismatch')
}
if (plan.segments[1].transition?.slot_id !== 'slot_1') {
  throw new Error('scene segment transition slot mismatch')
}
if (plan.segments[0].is_transition_segment) {
  throw new Error('human segment must not be marked as transition segment')
}
if (plan.transition_segments.length !== 1 || plan.transition_segments[0].segment_id !== 's2') {
  throw new Error('transition_segments summary mismatch')
}

const charTimings = [...plan.spoken_text].map((char, index) => ({
  index,
  char,
  start_ms: index * 100,
  end_ms: (index + 1) * 100,
}))

const project = buildDigitalHumanProject({
  taskId: 'test_task_v07',
  result: {
    video_url: '/files/test.mp4',
    duration_ms: charTimings.at(-1).end_ms + 200,
    text: plan.spoken_text,
    char_timings: charTimings,
  },
  copywritingPlan: plan,
  videoPath: '/12344/场景素材/test.mp4',
})

if (project.transition_segments?.[0]?.segment_id !== 's2') {
  throw new Error('sidecar did not preserve transition segment summary')
}
if (!project.timeline.clips[1].is_transition_segment) {
  throw new Error('timeline clip did not preserve transition marker')
}
if (project.timeline.clips[1].keep_original_audio !== true) {
  throw new Error('scene clip must keep digital-human audio')
}

const timeline = buildBoundLocalTimeline(
  project,
  { slots: [{ id: 'slot_1', title: '鹿场来源' }] },
  {
    bindings: {
      slot_1: {
        files: [{ name: 'farm.mp4', path: '/12344/素材/farm.mp4' }],
      },
    },
  },
)
if (timeline.clips[1].scene_vfs_path !== '/12344/素材/farm.mp4') {
  throw new Error('bound scene clip path mismatch')
}

const studioSource = fs.readFileSync(
  path.join(studio, 'src', 'components', 'DigitalHumanStudio.jsx'),
  'utf8',
)
if (!studioSource.includes('await vfs.readFileAsBlob(video.path)')) {
  throw new Error('video preview must use readFileAsBlob')
}
if (studioSource.includes("await vfs.readFile(video.path, 'binary')")) {
  throw new Error('video preview still uses unsafe binary object -> Blob conversion')
}
if (!studioSource.includes("{ type: videoBlob.type || 'video/mp4' }")) {
  throw new Error('downloaded video should be saved with video/mp4 MIME metadata')
}

const assistantSource = fs.readFileSync(
  path.join(studio, 'src', 'features', 'template-batch', 'aiAssistant.js'),
  'utf8',
)
if (!assistantSource.includes('is_transition_segment: isTransitionSegment')) {
  throw new Error('template request must preserve explicit transition intent')
}

console.log('AI_TIMELINE_PREVIEW_V0_7=PASS')
