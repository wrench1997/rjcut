import assert from 'node:assert/strict'
import {
  buildDigitalHumanAssetCandidates,
  extractDigitalHumanVideoReference,
} from '../src/features/digital-human-project/digitalHumanDownload.js'

const baseUrl = 'http://192.168.166.151:8080'
const taskId = 'dh_task_demo'

assert.equal(
  extractDigitalHumanVideoReference({
    files: { final_video: { download_url: '/files/api_tasks/dh_task_demo/digital_human.mp4' } },
  }),
  '/files/api_tasks/dh_task_demo/digital_human.mp4',
)

const urls = buildDigitalHumanAssetCandidates({
  assetRef: '/files/api_tasks/dh_task_demo/digital_human.mp4',
  baseUrl,
  taskId,
})
assert(urls.includes(`${baseUrl}/files/api_tasks/dh_task_demo/digital_human.mp4`))
assert(urls.includes(`${baseUrl}/files/tasks/dh_task_demo/digital_human.mp4`))

const rewritten = buildDigitalHumanAssetCandidates({
  assetRef: 'http://127.0.0.1:8080/files/tasks/dh_task_demo/digital_human.mp4',
  baseUrl,
  taskId,
})
assert.equal(rewritten[0], `${baseUrl}/files/tasks/dh_task_demo/digital_human.mp4`)

console.log('DIGITAL_HUMAN_DOWNLOAD_COMPAT_V1_1=PASS')
