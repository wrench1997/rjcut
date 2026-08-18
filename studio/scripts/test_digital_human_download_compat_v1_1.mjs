import assert from 'node:assert/strict'
import {
  buildDigitalHumanAssetCandidates,
  downloadDigitalHumanVideo,
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
assert(urls.includes(`${baseUrl}/dh/files/api_tasks/dh_task_demo/digital_human.mp4`))
assert(urls.includes(`${baseUrl}/dh/files/tasks/dh_task_demo/digital_human.mp4`))

const rewritten = buildDigitalHumanAssetCandidates({
  assetRef: 'http://127.0.0.1:8080/files/tasks/dh_task_demo/digital_human.mp4',
  baseUrl,
  taskId,
})
assert.equal(rewritten[0], `${baseUrl}/dh/files/tasks/dh_task_demo/digital_human.mp4`)

let fetchCount = 0
const retriedDownload = await downloadDigitalHumanVideo({
  result: { video_url: '/files/api_tasks/dh_task_demo/digital_human.mp4' },
  baseUrl,
  taskId,
  readinessTimeoutMs: 1000,
  requestTimeoutMs: 1000,
  sleepImpl: async () => {},
  fetchImpl: async () => {
    fetchCount += 1
    if (fetchCount <= urls.length) {
      return new Response(JSON.stringify({ detail: 'Not Found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(new Uint8Array(2048), {
      status: 200,
      headers: { 'content-type': 'video/mp4' },
    })
  },
})
assert(fetchCount > urls.length, '404 后应进入下一轮下载重试')
assert.equal(retriedDownload.blob.size, 2048)
assert(retriedDownload.attempts.some((attempt) => attempt.status === 404))

console.log('DIGITAL_HUMAN_DOWNLOAD_COMPAT_V1_1=PASS')
