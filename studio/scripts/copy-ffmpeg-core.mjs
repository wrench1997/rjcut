import { cp, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const sourceDir = resolve('node_modules/@ffmpeg/core/dist/umd')
const targetDir = resolve('public/wasm/ffmpeg-core')

await mkdir(targetDir, { recursive: true })
for (const fileName of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await cp(resolve(sourceDir, fileName), resolve(targetDir, fileName))
}

console.log('FFmpeg 离线核心已同步到 public/wasm/ffmpeg-core')
