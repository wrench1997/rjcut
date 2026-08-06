import { cp, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const found = spawnSync('where.exe', ['ffmpeg.exe'], { encoding: 'utf8' })
const source = found.stdout.split(/\r?\n/).find(Boolean)
if (!source) throw new Error('未在 PATH 中找到 ffmpeg.exe，无法准备桌面版原生合成器')
const target = resolve('electron/bin/ffmpeg.exe')
await mkdir(resolve('electron/bin'), { recursive: true })
await cp(source.trim(), target)
console.log(`原生 FFmpeg 已同步：${target}`)
