import { cp, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

// Linux 生产镜像只提供 Web 静态文件，不需要 Electron 的 Windows 原生 FFmpeg。
// 保留 Windows 桌面打包流程，同时允许 Docker/CI 在 Linux 上正常构建。
if (process.platform !== 'win32') {
  console.log('非 Windows 环境，跳过 Electron 原生 FFmpeg 准备')
  process.exit(0)
}

const found = spawnSync('where.exe', ['ffmpeg.exe'], { encoding: 'utf8' })
const source = found.stdout.split(/\r?\n/).find(Boolean)
if (!source) throw new Error('未在 PATH 中找到 ffmpeg.exe，无法准备桌面版原生合成器')
const target = resolve('electron/bin/ffmpeg.exe')
await mkdir(resolve('electron/bin'), { recursive: true })
await cp(source.trim(), target)
console.log(`原生 FFmpeg 已同步：${target}`)
