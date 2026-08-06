import {
  buildBoundLocalTimeline,
  buildDigitalHumanProject,
  normalizeCopywritingPlan,
} from '../src/features/digital-human-project/digitalHumanProject.js'

const plan = normalizeCopywritingPlan({
  spoken_text: '开场提醒。这里讲产品来源。最后引导下单。',
  segments: [
    { id: 's1', text: '开场提醒。', visual_mode: 'human' },
    { id: 's2', text: '这里讲产品来源。', visual_mode: 'scene', slot_id: 'slot_1' },
    { id: 's3', text: '最后引导下单。', visual_mode: 'human' },
  ],
})

const charTimings = [...plan.spoken_text].map((char, index) => ({
  index,
  char,
  start_ms: index * 100,
  end_ms: (index + 1) * 100,
}))

const project = buildDigitalHumanProject({
  taskId: 'test_task',
  result: {
    video_url: '/files/test.mp4',
    duration_ms: charTimings.at(-1).end_ms + 200,
    text: plan.spoken_text,
    char_timings: charTimings,
  },
  copywritingPlan: plan,
  videoPath: '/test/场景素材/test.mp4',
})

const timeline = buildBoundLocalTimeline(
  project,
  { slots: [{ id: 'slot_1', title: '产品来源' }] },
  {
    bindings: {
      slot_1: {
        files: [{ name: 'source.mp4', path: '/test/场景素材/source.mp4' }],
      },
    },
  }
)

if (project.schema !== 'rjcut.digital-human-project/v1') throw new Error('project schema mismatch')
if (project.char_timings.length !== charTimings.length) throw new Error('char_timings lost')
if (timeline.segments.length !== 3) throw new Error('timeline segment count mismatch')
if (timeline.segments[1].type !== 'scene') throw new Error('scene segment not bound')
if (timeline.segments[1].scene_vfs_path !== '/test/场景素材/source.mp4') throw new Error('scene path mismatch')
if (timeline.segments[0].start_ms !== 0) throw new Error('leading silence not preserved')
if (timeline.segments.at(-1).end_ms !== project.digital_human.duration_ms) throw new Error('trailing duration not preserved')
console.log('DIGITAL_HUMAN_PROJECT=PASS')
