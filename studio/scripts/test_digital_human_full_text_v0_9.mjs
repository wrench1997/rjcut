import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(process.cwd())
const sourcePath = path.join(root, 'src/features/digital-human-project/digitalHumanIntegrity.js')
const source = await fs.readFile(sourcePath, 'utf8')
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const {
  requireFullSpokenText,
  summarizeTextContract,
  validateDigitalHumanResult,
} = await import(moduleUrl)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function expectThrow(fn, includes) {
  let error = null
  try { fn() } catch (caught) { error = caught }
  assert(error, `预期抛错：${includes}`)
  assert(String(error.message).includes(includes), `错误信息不包含“${includes}”：${error.message}`)
}

const text = '想买鹿茸血的家人们先别急着下单！这里展示鹿场来源。最后回到主播收尾。'
const plan = {
  spoken_text: text,
  segments: [
    { id: 's1', text: '想买鹿茸血的家人们先别急着下单！', visual_mode: 'human' },
    { id: 's2', text: '这里展示鹿场来源。', visual_mode: 'scene' },
    { id: 's3', text: '最后回到主播收尾。', visual_mode: 'human' },
  ],
}
assert(requireFullSpokenText(plan) === text, '没有锁定完整 spoken_text')
assert(summarizeTextContract(text).textLength === Array.from(text).length, '文本摘要长度错误')

const timings = Array.from(text).map((char, index) => ({
  index,
  char,
  start_ms: index * 100,
  end_ms: (index + 1) * 100,
}))
const good = validateDigitalHumanResult({
  video_url: '/video.mp4',
  duration_ms: timings.at(-1).end_ms,
  text,
  normalized_text: text,
  char_timings: timings,
}, text)
assert(good.verified && good.request_contract === 'full_spoken_text_once', '完整结果未通过')

expectThrow(() => validateDigitalHumanResult({
  video_url: '/estimated.mp4',
  duration_ms: timings.at(-1).end_ms,
  text,
  normalized_text: text,
  char_timings: timings,
  char_timing_estimated: true,
}, text), '只返回了估算时间')

expectThrow(() => validateDigitalHumanResult({
  video_url: '/short.mp4',
  duration_ms: 4700,
  text,
  char_timings: timings.slice(-8).map((item, index) => ({ ...item, index })),
}, text), '数字人生成不完整')

expectThrow(() => validateDigitalHumanResult({
  video_url: '/short.mp4',
  duration_ms: 4700,
  text,
  char_timings: timings.slice(0, 5),
}, text), '生成不完整')

expectThrow(() => requireFullSpokenText({
  spoken_text: text,
  segments: [{ id: 'bad', text: '不存在的段落' }],
}), '无法在 spoken_text 中按顺序找到')

console.log('DIGITAL_HUMAN_FULL_TEXT_V0_9=PASS')
