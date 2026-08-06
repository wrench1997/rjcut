import {
  clampTemplateTimelineToSpeechEnd,
  normalizeTemplateTimeline,
} from '../src/features/template-batch/templateTimeline.js'
import { generateSceneScript } from '../src/features/template-batch/templateRunAdapter.js'
import { renderLocalTemplateTask } from '../src/features/template-batch/localTemplateRenderer.js'
import {
  buildDigitalHumanProject,
  normalizeCopywritingPlan,
} from '../src/features/digital-human-project/digitalHumanProject.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const sourceTimeline = {
  duration_ms: 7000,
  video_info: { width: 1080, height: 1920, fps: 30, duration_ms: 7000 },
  char_timings: [{ start_ms: 0, end_ms: 1000 }, { start_ms: 1000, end_ms: 3000 }],
  segments: [
    { id: 'human_1', type: 'human', start_ms: 0, end_ms: 1500 },
    { id: 'scene_1', type: 'scene', start_ms: 1500, end_ms: 7000, scene_vfs_path: '/素材/scene.mp4' },
  ],
  clips: [
    { id: 'human_1', type: 'human', start_ms: 0, end_ms: 1500 },
    { id: 'scene_1', type: 'scene', start_ms: 1500, end_ms: 7000 },
  ],
  transition_clips: [{ segment_id: 'scene_1', start_ms: 1500, end_ms: 7000 }],
}

const normalized = normalizeTemplateTimeline(sourceTimeline)
assert(normalized.duration_ms === 3000, `输出时长未锁定到口播结束：${normalized.duration_ms}`)
assert(normalized.video_info.duration_ms === 3000, 'video_info.duration_ms 未同步')
assert(normalized.segments.length === 2, '有效口播段被错误删除')
assert(normalized.segments[1].end_ms === 3000, '空镜段未在最后一个字结束处截断')
assert(normalized.segments[1].duration_ms === 1500, '空镜段 duration_ms 未同步')
assert(normalized.clips[1].end_ms === 3000, 'clips 边界未同步')
assert(normalized.transition_clips[0].end_ms === 3000, 'transition_clips 边界未同步')

const gapped = normalizeTemplateTimeline({
  speech_end_ms: 16000,
  duration_ms: 16000,
  segments: [
    { id: 'before_gap', type: 'human', start_ms: 0, end_ms: 7000 },
    { id: 'after_gap', type: 'scene', start_ms: 13000, end_ms: 16000 },
  ],
})
assert(gapped.segments[0].end_ms === 13000, '7-13 秒源视频空档未被封闭')
assert(gapped.segments[0].duration_ms === 13000, '封闭空档后上一段时长未同步')

const oldTimelineWithPostSpeechSegment = clampTemplateTimelineToSpeechEnd({
  char_timings: [{ end_ms: 3000 }],
  segments: [
    { id: 'human', type: 'human', start_ms: 0, end_ms: 3000 },
    { id: 'stale', type: 'scene', start_ms: 3000, end_ms: 7000 },
  ],
})
assert(oldTimelineWithPostSpeechSegment.segments.length === 1, '口播结束后的旧空镜段未移除')
assert(oldTimelineWithPostSpeechSegment.segments[0].end_ms === 3000, '旧时间轴尾部未封闭')

const plan = normalizeCopywritingPlan({
  spoken_text: '开场介绍。展示产品。',
  segments: [
    { id: 's1', text: '开场介绍。', visual_mode: 'human' },
    { id: 's2', text: '展示产品。', visual_mode: 'scene', slot_id: 'slot_1' },
  ],
})
const charTimings = [...plan.spoken_text].map((char, index) => ({
  index,
  char,
  start_ms: index * 200,
  end_ms: (index + 1) * 200,
}))
const project = buildDigitalHumanProject({
  taskId: 'template_boundary_test',
  result: {
    duration_ms: 7000,
    text: plan.spoken_text,
    char_timings: charTimings,
  },
  copywritingPlan: plan,
  videoPath: '/项目/场景素材/avatar.mp4',
})
const generated = await generateSceneScript(
  {
    templateId: 'direct_sale_v1',
    avatarVideo: { name: 'avatar.mp4', project },
  },
  { name: '场景一', bindings: { slot_1: { files: [{ name: 'scene.mp4', path: '/项目/场景素材/scene.mp4' }] } } },
)
const speechEndMs = charTimings.at(-1).end_ms
assert(generated.duration_ms === speechEndMs, '模板适配器未截断源视频尾部时长')
assert(generated.segments.at(-1).type === 'scene', '集成场景未绑定为空镜')
assert(generated.segments.at(-1).end_ms === speechEndMs, '模板适配器空镜未在口播结束处完成')

let nativeTimeline = null
const previousWindow = globalThis.window
globalThis.window = {
  electronAPI: {
    nativeCompose: async ({ timeline }) => {
      nativeTimeline = timeline
    },
  },
}
try {
  await renderLocalTemplateTask(
    {
    vfsVideoPath: '/项目/场景素材/avatar.mp4',
      vfsTimelinePath: '/项目/成片/legacy.timeline.json',
      outputPath: '/项目/成片/legacy.mp4',
    },
    {
      exists: async () => true,
      readFile: async () => new TextEncoder().encode(JSON.stringify(sourceTimeline)),
    },
  )
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}
assert(nativeTimeline?.duration_ms === 3000, '渲染入口未向原生合成传递截断后的总时长')
assert(nativeTimeline?.segments.at(-1)?.end_ms === 3000, '渲染入口仍向原生合成传递尾部空镜')

console.log('TEMPLATE_BATCH_TIMING_BOUNDARIES=PASS')
