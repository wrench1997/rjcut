import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const studioRoot = process.cwd()
const componentPath = path.join(studioRoot, 'src', 'components', 'DigitalHumanStudio.jsx')
const helperPath = path.join(
  studioRoot,
  'src',
  'features',
  'digital-human-project',
  'manualCopywritingPlan.js',
)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(fs.existsSync(componentPath), `缺少文件: ${componentPath}`)
assert(fs.existsSync(helperPath), `缺少文件: ${helperPath}`)

const component = fs.readFileSync(componentPath, 'utf8')
const helper = fs.readFileSync(helperPath, 'utf8')

assert(
  component.includes("from '../features/digital-human-project/manualCopywritingPlan.js'"),
  'DigitalHumanStudio 未接入 manualCopywritingPlan.js',
)
assert(
  component.includes('useState([createManualScriptEntry()])'),
  '初始文案仍不是结构化手动文案',
)
assert(component.includes("item === 'plain' ? '全文'"), '缺少全文编辑模式')
assert(component.includes("item === 'segments' ? '段落'"), '缺少段落编辑模式')
assert(component.includes("item === 'json' ?"), '缺少 JSON 编辑模式')
assert(component.includes('应用 JSON'), '缺少应用 JSON 操作')
assert(component.includes('场景替换'), '缺少场景替换标记')
assert(component.includes('按标点自动建立段落'), '缺少自动分段操作')

for (const token of [
  'createManualScriptEntry',
  'rebuildManualCopywritingPlan',
  'parseManualCopywritingPlanJson',
  'splitManualTextIntoSegments',
  'updateManualSegment',
]) {
  assert(helper.includes(`function ${token}`) || helper.includes(`function ${token}(`), `helper 缺少 ${token}`)
}

console.log('MANUAL_COPYWRITING_EDITOR_V1_0=PASS')
