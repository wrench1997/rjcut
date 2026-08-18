/**
 * RJCut Studio - Electron 主进程
 * 
 * 功能：
 * 1. 创建浏览器窗口
 * 2. 提供 IPC 通信访问本地文件系统
 * 3. 完全脱离浏览器沙盒限制
 */

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')
const fsUtils = require('./fs-utils')
const { ElectronMCPServer } = require('./mcp-server')

// 1. 注册特权协议 (必须在 app ready 之前调用)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
])

// 保持 window 对象的全局引用
let mainWindow = null

// 允许的根目录（安全限制）
let allowedRoots = []

// MCP 服务器实例
let mcpServer = null

/**
 * 创建主窗口
 */
function createWindow() {
  // 是否为打包后的生产环境（exe）
  const isPackaged = app.isPackaged || process.env.NODE_ENV === 'production'

  // 调试开关：
  // - 开发模式默认开启开发者工具
  // - 生产模式默认关闭调试信息
  // - 如需在生产环境临时开启调试，可设置环境变量 RJSTUDIO_DEBUG=1 或 OPEN_DEVTOOLS=1
  const forceDebug = process.env.RJSTUDIO_DEBUG === '1' || process.env.OPEN_DEVTOOLS === '1'
  const enableDevTools = !isPackaged || forceDebug

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false, // 生产环境中加载本地 file:// 可能遇到跨域问题，建议关闭 webSecurity
      devTools: enableDevTools, // 生产环境默认关闭开发者工具
    },
    // 统一使用剪辑工作台图标，开发和打包后的窗口保持一致。
    icon: path.join(__dirname, '../public/icon.png'),
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true, // 隐藏菜单栏（File Edit View Window 等）
  })

  if (!isPackaged) {
    // 开发模式：加载 localhost
    mainWindow.loadURL('http://localhost:30099')
    mainWindow.webContents.openDevTools()
  } else {
    // 生产模式（exe）：使用我们自定义的 app:// 协议加载
    mainWindow.loadURL('app://localhost/index.html')
    // 生产模式默认不打开开发者工具；仅当显式设置调试环境变量时才开启
    if (forceDebug) {
      mainWindow.webContents.openDevTools()
    }
  }

  // 窗口准备好后再显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 关闭窗口
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 阻止新窗口打开（所有链接都在浏览器中打开）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function runFfmpeg(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    let error = ''
    child.stderr.on('data', (chunk) => { error += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error.slice(-1200) || `FFmpeg 退出码：${code}`)))
  })
}

function findFfmpeg() {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    : path.join(__dirname, 'bin', 'ffmpeg.exe')
  if (fs.existsSync(bundled)) return bundled
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

function findFfprobe() {
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe')
    : path.join(__dirname, 'bin', 'ffprobe.exe')
  if (fs.existsSync(bundled)) return bundled
  return process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
}

function runCommandCapture(executable, args, includeStderr = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0
      ? resolve(includeStderr ? `${stdout}\n${stderr}` : stdout.trim())
      : reject(new Error(stderr.slice(-1200) || `命令退出码：${code}`)))
  })
}

function resolveExistingVfsFile(vfsPath) {
  const direct = fsUtils.validatePath(vfsPath)
  if (fs.existsSync(direct)) return direct
  const wanted = path.basename(vfsPath || '')
  const root = fsUtils.validatePath('/')
  const queue = [root]
  let scanned = 0
  while (queue.length && scanned < 8000) {
    const dir = queue.shift()
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (_) { continue }
    for (const entry of entries) {
      scanned += 1
      const candidate = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === wanted) {
        console.warn(`[nativeCompose] 兼容旧素材路径：${vfsPath} -> ${candidate}`)
        return candidate
      }
      if (entry.isDirectory() && !entry.name.startsWith('.') && scanned < 8000) queue.push(candidate)
    }
  }
  throw new Error(`找不到素材文件：${vfsPath}（已检查 ${direct} 和本地素材库）`)
}

async function concatNativeVideoParts(ffmpeg, parts, output, profile, duration = 0) {
  const args = ['-y']
  parts.forEach((file) => args.push('-i', file))

  const filters = []
  for (let index = 0; index < parts.length; index += 1) {
    filters.push(`[${index}:v:0]setpts=PTS-STARTPTS[v${index}]`)
    filters.push(`[${index}:a:0]asetpts=PTS-STARTPTS[a${index}]`)
  }
  const concatInputs = parts.map((_, index) => `[v${index}][a${index}]`).join('')
  filters.push(`${concatInputs}concat=n=${parts.length}:v=1:a=1[outv][outa]`)

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', profile[0],
    '-crf', profile[1],
    '-pix_fmt', 'yuv420p',
    '-fps_mode', 'cfr',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
  )
  if (Number.isFinite(Number(duration)) && Number(duration) > 0) args.push('-t', String(duration))
  args.push(output)
  await runFfmpeg(ffmpeg, args)
}

async function concatNativeVisualPartsWithContinuousAudio(ffmpeg, parts, audioSource, output, profile, duration) {
  const safeDuration = Number(duration)
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) throw new Error('模板混剪总时长无效')

  const args = ['-y']
  parts.forEach((file) => args.push('-i', file))
  // 数字人口播必须作为一条连续音轨读取。不能随画面段逐段裁切并分别编码，
  // 否则 AAC priming/边界重采样会吃掉场景切换处的句首和句尾。
  args.push('-i', audioSource)

  const filters = []
  for (let index = 0; index < parts.length; index += 1) {
    filters.push(`[${index}:v:0]setpts=PTS-STARTPTS[v${index}]`)
  }
  const videoInputs = parts.map((_, index) => `[v${index}]`).join('')
  filters.push(`${videoInputs}concat=n=${parts.length}:v=1:a=0[outv]`)
  filters.push(`[${parts.length}:a:0]asetpts=PTS-STARTPTS,aresample=async=1:first_pts=0,apad=whole_dur=${safeDuration},atrim=start=0:duration=${safeDuration}[outa]`)

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[outv]',
    '-map', '[outa]',
    '-t', String(safeDuration),
    '-c:v', 'libx264',
    '-preset', profile[0],
    '-crf', profile[1],
    '-pix_fmt', 'yuv420p',
    '-fps_mode', 'cfr',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-avoid_negative_ts', 'make_zero',
    output,
  )
  await runFfmpeg(ffmpeg, args)
}

function assTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const secs = Math.floor(value % 60)
  const centis = Math.round((value - Math.floor(value)) * 100)
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`
}

function wrapSubtitleText(text, maxCharsPerLine) {
  const limit = Math.max(1, Math.round(Number(maxCharsPerLine) || 18))
  return String(text || '').replace(/\r/g, '').split('\n').flatMap((paragraph) => {
    const chars = Array.from(paragraph)
    if (!chars.length) return ['']
    const lines = []
    for (let index = 0; index < chars.length; index += limit) lines.push(chars.slice(index, index + limit).join(''))
    return lines
  }).join('\n')
}

function assText(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/[\r\n]+/g, '\\N').replace(/[{}]/g, '')
}

function getTimelineSubtitleGroups(timeline) {
  const groups = new Map()
  for (const [index, segment] of (timeline.segments || []).entries()) {
    const charStart = Number(segment.char_start)
    const charEnd = Number(segment.char_end)
    const hasCharRange = Number.isInteger(charStart) && Number.isInteger(charEnd) && charEnd >= charStart
    const key = hasCharRange ? `chars:${charStart}:${charEnd}` : `segment:${index}`
    const existing = groups.get(key)
    const start = Number(segment.start ?? segment.start_ms / 1000)
    const end = Number(segment.end ?? segment.end_ms / 1000)
    if (!existing) {
      groups.set(key, { segment, start, end, charStart, charEnd, hasCharRange })
    } else {
      // 场景素材被拆成多个文件时，字幕仍然只生成一份，并覆盖完整场景段。
      existing.start = Math.min(existing.start, start)
      existing.end = Math.max(existing.end, end)
    }
  }
  return Array.from(groups.values())
}

function buildCharacterSubtitleDialogues(group, timeline, anchor, maxCharsPerLine, baseColor, highlightColor) {
  const text = String(group.segment.text || group.segment.content || '').replace(/[\r\n]/g, '')
  const chars = Array.from(text)
  if (!chars.length || !Array.isArray(timeline.char_timings) || !timeline.char_timings.length) return []

  const timingsByIndex = new Map(timeline.char_timings.map((item) => [Number(item?.index), item]))
  const duration = Math.max(0.01, group.end - group.start)
  const charStart = group.hasCharRange ? group.charStart : 0
  const items = chars.map((char, index) => {
    const item = timingsByIndex.get(charStart + index) || (!group.hasCharRange ? timeline.char_timings[index] : null)
    const fallbackStart = group.start + (duration * index) / chars.length
    const fallbackEnd = group.start + (duration * (index + 1)) / chars.length
    const start = Number(item?.start_ms) / 1000
    const end = Number(item?.end_ms) / 1000
    return {
      char,
      start: Number.isFinite(start) ? Math.max(group.start, Math.min(group.end, start)) : fallbackStart,
      end: Number.isFinite(end) ? Math.max(group.start, Math.min(group.end, end)) : fallbackEnd,
    }
  })

  const lines = []
  for (let index = 0; index < chars.length; index += maxCharsPerLine) {
    lines.push({ start: index, end: Math.min(chars.length, index + maxCharsPerLine) })
  }

  const dialogues = []
  items.forEach((item, index) => {
    const start = Math.max(group.start, Math.min(group.end, item.start))
    const nextStart = index < items.length - 1 ? items[index + 1].start : item.end
    const end = Math.max(start + 0.01, Math.min(group.end, nextStart))
    const line = lines.find((candidate) => index >= candidate.start && index < candidate.end)
    if (!line || end <= start) return
    const lineText = items.slice(line.start, line.end).map((current, lineIndex) => {
      const active = line.start + lineIndex === index
      const color = active ? highlightColor : baseColor
      const scale = active ? '\\fscx115\\fscy115\\b1' : '\\fscx100\\fscy100\\b1'
      return `{\\c${color}&${scale}}${assText(current.char)}`
    }).join('')
    dialogues.push(
      `Dialogue: 1,${assTime(start)},${assTime(end)},Karaoke,,0,0,0,,{\\an5\\pos(${anchor.x},${anchor.y})}${lineText}`,
    )
  })
  return dialogues
}

function assColor(value, fallback) {
  const input = String(value || '').trim()
  const hex = input.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const rgb = hex[1]
    return `&H00${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`
  }
  const rgba = input.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (!rgba) return fallback
  const [, red, green, blue, opacity = '1'] = rgba
  const alpha = Math.round((1 - Math.min(1, Math.max(0, Number(opacity)))) * 255).toString(16).padStart(2, '0').toUpperCase()
  return `&H${alpha}${Number(blue).toString(16).padStart(2, '0')}${Number(green).toString(16).padStart(2, '0')}${Number(red).toString(16).padStart(2, '0')}`.toUpperCase()
}

// 与 GlobalParamsVisualEditor 的 getSubtitlePositionPercent 保持同一套坐标：
// 预览中元素中心位于 left/top，因此 ASS 也统一使用 \an5 + \pos(x,y)。
function getSubtitleAnchor(subtitle) {
  const position = subtitle.position || 'bottom'
  const baseYPercent = position === 'top' ? 25 : 50
  const xPercent = 50 + (Number(subtitle.x_offset) || 0) / 2
  const yPercent = baseYPercent - (Number(subtitle.y_offset) || 0) / 2
  return {
    x: Math.round(Math.min(100, Math.max(0, xPercent)) * 10.8),
    y: Math.round(Math.min(100, Math.max(0, yPercent)) * 19.2),
  }
}


/**
 * 注册 IPC 处理器
 */
function registerIPCHandlers() {
  ipcMain.handle('video:probeDuration', async (_event, filePath) => {
    if (!filePath) return null
    const resolved = resolveExistingVfsFile(filePath)
    let duration = 0
    try {
      const output = await runCommandCapture(findFfprobe(), [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        resolved,
      ])
      duration = Number(output)
    } catch (_) {
      // 打包包内通常只有 ffmpeg.exe，没有单独的 ffprobe.exe；用 ffmpeg
      // 的输入探测日志兜底，HEVC/MOV/PCM 也能读到容器 Duration。
      try {
        const probeLog = await runCommandCapture(findFfmpeg(), ['-hide_banner', '-i', resolved, '-f', 'null', 'NUL'], true)
        const match = probeLog.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i)
        if (match) duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
      } catch (error) {
        console.warn(`[nativeCompose] 读取素材时长失败：${filePath}`, error)
      }
    }
    return Number.isFinite(duration) && duration > 0 ? duration : null
  })

  // 浏览器/Electron 对 iPhone HEVC Main10/Dolby Vision MOV 的解码并不稳定。
  // 只在预览解码失败时调用，生成轻量 H.264 缓存，不改写 VFS 原片。
  ipcMain.handle('video:previewTranscode', async (_event, payload) => {
    const { filePath, width = 540, height = 960 } = payload || {}
    if (!filePath) throw new Error('预览转码缺少素材路径')
    const source = resolveExistingVfsFile(filePath)
    const stat = fs.statSync(source)
    const cacheRoot = path.join(app.getPath('temp'), 'rjcut-preview-cache')
    fs.mkdirSync(cacheRoot, { recursive: true })
    const cacheKey = crypto.createHash('sha1')
      .update(`${source}|${stat.size}|${stat.mtimeMs}|${width}x${height}`)
      .digest('hex')
    const output = path.join(cacheRoot, `${cacheKey}.mp4`)
    if (!fs.existsSync(output)) {
      const targetWidth = Math.max(240, Math.min(1080, Number(width) || 540))
      const targetHeight = Math.max(240, Math.min(1920, Number(height) || 960))
      await runFfmpeg(findFfmpeg(), [
        '-y',
        '-i', source,
        '-map', '0:v:0',
        '-an',
        '-vf', `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-movflags', '+faststart',
        output,
      ])
    }
    return fs.readFileSync(output)
  })

  ipcMain.handle('video:nativeCompose', async (_event, payload) => {
    const { videoPath, outputPath, timeline, quality = 'balanced', subtitle = {} } = payload || {}
    if (!videoPath || !outputPath || !Array.isArray(timeline?.segments)) throw new Error('原生合成参数不完整')
    const ffmpeg = findFfmpeg()
    const source = resolveExistingVfsFile(videoPath)
    const output = fsUtils.validatePath(outputPath)
    const tempDir = path.join(path.dirname(output), `.rjcut-${Date.now()}`)
    const profile = { performance: ['ultrafast', '28'], balanced: ['veryfast', '23'], quality: ['medium', '18'] }[quality] || ['veryfast', '23']
    fs.mkdirSync(tempDir, { recursive: true })
    try {
      const parts = []
      for (let index = 0; index < timeline.segments.length; index += 1) {
        const segment = timeline.segments[index]
        const start = Number(segment.start ?? segment.start_ms / 1000)
        const duration = Number(segment.duration ?? ((segment.end_ms - segment.start_ms) / 1000) ?? (segment.end - segment.start))
        if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) throw new Error(`第 ${index + 1} 段时间轴无效`)
        const part = path.join(tempDir, `part-${index}.mp4`)
        const scenePath = segment.type === 'scene' ? (segment.scene_vfs_path || segment.scene_file) : null
        if (scenePath) {
          await runFfmpeg(ffmpeg, ['-y', '-stream_loop', '-1', '-i', resolveExistingVfsFile(scenePath), '-map', '0:v:0', '-an', '-t', String(duration), '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setpts=N/(30*TB),format=yuv420p', '-c:v', 'libx264', '-preset', profile[0], '-crf', profile[1], '-avoid_negative_ts', 'make_zero', part])
        } else {
          // 人物段也循环输入，最后一段超过源视频尾部时不会截断。
          // 这里只切画面；口播音轨在所有画面合并后一次性挂载，避免边界吞字。
          await runFfmpeg(ffmpeg, ['-y', '-stream_loop', '-1', '-ss', String(start), '-i', source, '-map', '0:v:0', '-an', '-t', String(duration), '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setpts=N/(30*TB),format=yuv420p', '-c:v', 'libx264', '-preset', profile[0], '-crf', profile[1], '-avoid_negative_ts', 'make_zero', part])
        }
        parts.push(part)
      }
      const merged = path.join(tempDir, 'merged.mp4')
      const timelineDuration = timeline.segments.reduce((max, segment) => {
        const end = Number(segment.end ?? Number(segment.end_ms) / 1000)
        return Number.isFinite(end) ? Math.max(max, end) : max
      }, 0)
      await concatNativeVisualPartsWithContinuousAudio(ffmpeg, parts, source, merged, profile, timelineDuration)
      const anchor = getSubtitleAnchor(subtitle)
      const maxCharsPerLine = Math.max(8, Math.min(15, Number(subtitle.max_chars_per_line) || 15))
      const staticDialogues = timeline.segments.map((segment) => {
        const start = Number(segment.start ?? segment.start_ms / 1000)
        const end = Number(segment.end ?? segment.end_ms / 1000)
        const text = wrapSubtitleText(segment.text || segment.content || '', maxCharsPerLine)
        if (!text.trim() || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
        // \an5 is centre/centre, exactly like preview transform: translate(-50%, -50%).
        return `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,{\\an5\\pos(${anchor.x},${anchor.y})}${assText(text)}`
      }).filter(Boolean)
      const baseColor = assColor(subtitle.color, '&H00FFFFFF')
      const highlightColor = assColor(subtitle.highlight_color, '&H0000D4FF')
      const characterDialogues = getTimelineSubtitleGroups(timeline).flatMap((group) =>
        buildCharacterSubtitleDialogues(group, timeline, anchor, maxCharsPerLine, baseColor, highlightColor),
      )
      const dialogues = subtitle.word_by_word_highlight !== false && characterDialogues.length
        ? characterDialogues
        : staticDialogues
      if (dialogues.length) {
        const assPath = path.join(tempDir, 'subtitles.ass')
        const hasBox = subtitle.background_color && subtitle.background_color !== 'transparent'
        const fontSize = Number(subtitle.font_size) || 68
        const fontFamily = String(subtitle.font_family || 'Microsoft YaHei').replace(/[,\r\n]/g, ' ')
        const bold = subtitle.font_weight === 'normal' ? 0 : 1
        const outline = hasBox ? Math.max(1, Number(subtitle.background_padding) || 8) : Number(subtitle.stroke_width) || 0
        const borderStyle = hasBox ? 3 : 1
        const back = hasBox ? assColor(subtitle.background_color, '&H80000000') : '&H00000000'
        // ASS 的 Spacing 是字距而不是行距；保留标准字形比例，并由显式 \N 控制换行。
        const style = `Style: Default,${fontFamily},${fontSize},${baseColor},${baseColor},${assColor(subtitle.stroke_color, '&H00000000')},${back},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},0,5,0,0,0,1`
        const karaokeStyle = `Style: Karaoke,${fontFamily},${fontSize},${highlightColor},${baseColor},${assColor(subtitle.stroke_color, '&H00000000')},${back},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},0,5,0,0,0,1`
        // ASS 默认 PlayRes 是 384x288；不声明会把 72px 字号放大数倍。
        if (false) {
        fs.writeFileSync(assPath, `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n${style}\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${dialogues.join('\n')}\n`, 'utf8')
        }
        const filterPath = assPath.replace(/\\/g, '/').replace(':', '\\:').replace(/'/g, "\\'")
        fs.writeFileSync(assPath, `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n${style}\n${karaokeStyle}\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${dialogues.join('\n')}\n`, 'utf8')
        await runFfmpeg(ffmpeg, ['-y', '-i', merged, '-vf', `subtitles='${filterPath}'`, '-c:v', 'libx264', '-preset', profile[0], '-crf', profile[1], '-c:a', 'copy', output])
      } else {
        fs.renameSync(merged, output)
      }
      return { outputPath, engine: 'native' }
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }) }
  })

  // 高级剪辑通用导出：真正调用 EXE 内置 FFmpeg，不再返回占位 MP4。
  ipcMain.handle('video:nativeTimelineExport', async (_event, payload) => {
    const { outputPath, clips = [], quality = 'balanced', subtitle = {}, subtitleClips = [] } = payload || {}
    if (!outputPath || !Array.isArray(clips) || !clips.length) throw new Error('时间轴导出参数不完整')
    const ffmpeg = findFfmpeg()
    const output = fsUtils.validatePath(outputPath)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    const tempDir = path.join(path.dirname(output), `.rjcut-export-${Date.now()}`)
    const profile = { performance: ['ultrafast', '28'], balanced: ['veryfast', '23'], quality: ['medium', '18'] }[quality] || ['veryfast', '23']
    fs.mkdirSync(tempDir, { recursive: true })
    try {
      const parts = []
      for (let index = 0; index < clips.length; index += 1) {
        const clip = clips[index]
        const duration = Math.max(0.1, Number(clip.duration_ms) / 1000)
        const part = path.join(tempDir, `part-${index}.mp4`)
        if (clip.kind === 'gap') {
          await runFfmpeg(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(duration), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', profile[0], '-crf', profile[1], '-c:a', 'aac', '-shortest', part])
        } else {
          const source = resolveExistingVfsFile(clip.vfsPath)
          const offset = Math.max(0, Number(clip.offset_ms) / 1000)
          const probe = await runCommandCapture(ffmpeg, ['-hide_banner', '-i', source], true).catch((error) => String(error.message || error))
          const hasAudio = /Stream\s+#\S+(?:\([^)]*\))?:\s+Audio:/i.test(probe)
          const separateAudio = clip.audioVfsPath && clip.audioVfsPath !== clip.vfsPath
          const args = ['-y', '-ss', String(offset), '-i', source]
          if (separateAudio) args.push('-ss', String(Math.max(0, Number(clip.audioOffsetMs) / 1000)), '-i', resolveExistingVfsFile(clip.audioVfsPath))
          else if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo')
          const audioMap = separateAudio ? '1:a:0' : hasAudio ? '0:a:0' : '1:a:0'
          args.push('-t', String(duration), '-map', '0:v:0', '-map', audioMap, '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setpts=N/(30*TB),format=yuv420p', '-af', 'aresample=async=1:first_pts=0', '-c:v', 'libx264', '-preset', profile[0], '-crf', profile[1], '-c:a', 'aac', '-shortest', '-avoid_negative_ts', 'make_zero', part)
          await runFfmpeg(ffmpeg, args)
        }
        parts.push(part)
      }
      const merged = path.join(tempDir, 'merged.mp4')
      const duration = clips.reduce((sum, clip) => sum + Math.max(0, Number(clip.duration_ms) || 0), 0) / 1000
      await concatNativeVideoParts(ffmpeg, parts, merged, profile, duration)

      const subtitleTimeline = {
        segments: subtitleClips.map((clip) => ({
          start_ms: Number(clip.start_ms) || 0,
          end_ms: (Number(clip.start_ms) || 0) + (Number(clip.duration_ms) || 0),
          text: clip.content || '',
          char_start: clip.char_start,
          char_end: clip.char_end,
        })),
        char_timings: subtitleClips.flatMap((clip) => Array.isArray(clip.char_timings) ? clip.char_timings : []),
      }
      const anchor = getSubtitleAnchor(subtitle)
      const maxCharsPerLine = Math.max(8, Math.min(15, Number(subtitle.max_chars_per_line) || 15))
      const baseColor = assColor(subtitle.color, '&H00FFFFFF')
      const highlightColor = assColor(subtitle.highlight_color, '&H0000D4FF')
      const characterDialogues = getTimelineSubtitleGroups(subtitleTimeline).flatMap((group) =>
        buildCharacterSubtitleDialogues(group, subtitleTimeline, anchor, maxCharsPerLine, baseColor, highlightColor),
      )
      const staticDialogues = subtitleTimeline.segments.map((segment) => {
        const text = wrapSubtitleText(segment.text, maxCharsPerLine)
        return text.trim() ? `Dialogue: 0,${assTime(segment.start_ms / 1000)},${assTime(segment.end_ms / 1000)},Default,,0,0,0,,{\\an5\\pos(${anchor.x},${anchor.y})}${assText(text)}` : null
      }).filter(Boolean)
      const dialogues = subtitle.word_by_word_highlight !== false && characterDialogues.length ? characterDialogues : staticDialogues
      if (dialogues.length) {
        const assPath = path.join(tempDir, 'subtitles.ass')
        const fontSize = Number(subtitle.font_size) || 68
        const fontFamily = String(subtitle.font_family || 'Microsoft YaHei').replace(/[,\r\n]/g, ' ')
        const outline = Number(subtitle.stroke_width) || 2
        const style = `Style: Default,${fontFamily},${fontSize},${baseColor},${baseColor},${assColor(subtitle.stroke_color, '&H00000000')},&H00000000,1,0,0,0,100,100,0,0,1,${outline},0,5,0,0,0,1`
        const karaokeStyle = `Style: Karaoke,${fontFamily},${fontSize},${highlightColor},${baseColor},${assColor(subtitle.stroke_color, '&H00000000')},&H00000000,1,0,0,0,100,100,0,0,1,${outline},0,5,0,0,0,1`
        fs.writeFileSync(assPath, `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\n${style}\n${karaokeStyle}\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${dialogues.join('\n')}\n`, 'utf8')
        const filterPath = assPath.replace(/\\/g, '/').replace(':', '\\:').replace(/'/g, "\\'")
        await runFfmpeg(ffmpeg, ['-y', '-i', merged, '-vf', `subtitles='${filterPath}'`, '-c:v', 'libx264', '-preset', profile[0], '-crf', profile[1], '-c:a', 'copy', '-movflags', '+faststart', output])
      } else {
        fs.renameSync(merged, output)
      }
      return { outputPath, size: fs.statSync(output).size, engine: 'native-ffmpeg' }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
  // ==================== 文件系统操作 ====================
  
  // 列出目录（如果不存在则自动创建）
  ipcMain.handle('fs:listDirectory', async (event, dirPath) => {
    return fsUtils.listDirectory(dirPath)
  })

  // 创建目录
  ipcMain.handle('fs:mkdir', async (event, dirPath, recursive = false) => {
    return fsUtils.mkdir(dirPath, recursive)
  })

  // 读取文件
  ipcMain.handle('fs:readFile', async (event, filePath, encoding = 'utf-8') => {
    return fsUtils.readFile(filePath, encoding)
  })

  // 读取文件为 Buffer（用于视频/图片等二进制文件）
  ipcMain.handle('fs:readFileAsBuffer', async (event, filePath) => {
    const buffer = await fsUtils.readFileAsBuffer(filePath)
    console.log('[fs:readFileAsBuffer] 读取文件:', filePath, '大小:', buffer.length, 'bytes')
    // 直接返回 Buffer，Electron IPC 会自动序列化
    return buffer
  })

  // 获取文件的 file:// URL（用于视频直接播放）
  ipcMain.handle('fs:getFileUrl', async (event, filePath) => {
    const resolved = fsUtils.validatePath(filePath)
    // 将路径转换为 file:// URL
    const fileUrl = `file:///${resolved.replace(/\\/g, '/')}`
    console.log('[fs:getFileUrl] 文件 URL:', fileUrl)
    return fileUrl
  })

  // 读取 JSON
  ipcMain.handle('fs:readJSON', async (event, filePath) => {
    return fsUtils.readJSON(filePath)
  })

  // 写入文件
  ipcMain.handle('fs:writeFile', async (event, filePath, content, options = {}) => {
    return fsUtils.writeFile(filePath, content, options)
  })

  // 写入 JSON
  ipcMain.handle('fs:writeJSON', async (event, filePath, data, options = {}) => {
    return fsUtils.writeJSON(filePath, data, options)
  })

  // 删除文件/目录
  ipcMain.handle('fs:delete', async (event, targetPath, recursive = false) => {
    return fsUtils.deleteFile(targetPath, recursive)
  })

  // 移动/重命名
  ipcMain.handle('fs:move', async (event, fromPath, toPath) => {
    return fsUtils.moveFile(fromPath, toPath)
  })

  // 复制文件
  ipcMain.handle('fs:copy', async (event, fromPath, toPath) => {
    return fsUtils.copyFile(fromPath, toPath)
  })

  // 获取文件信息
  ipcMain.handle('fs:getFile', async (event, filePath) => {
    return fsUtils.getFile(filePath)
  })

  // 检查路径是否存在
  ipcMain.handle('fs:exists', async (event, targetPath) => {
    return fsUtils.exists(targetPath)
  })

  // 检查是否为目录
  ipcMain.handle('fs:isDirectory', async (event, dirPath) => {
    return fsUtils.isDirectory(dirPath)
  })

  // 检查是否为文件
  ipcMain.handle('fs:isFile', async (event, filePath) => {
    return fsUtils.isFile(filePath)
  })

  // 搜索文件
  ipcMain.handle('fs:search', async (event, pattern, options = {}) => {
    return fsUtils.search(pattern, options)
  })

  // 按类型搜索
  ipcMain.handle('fs:searchByType', async (event, type, options = {}) => {
    return fsUtils.searchByType(type, options)
  })

  // 搜索视频
  ipcMain.handle('fs:searchVideos', async (event, options = {}) => {
    return fsUtils.searchVideos(options)
  })

  // 搜索音频
  ipcMain.handle('fs:searchAudio', async (event, options = {}) => {
    return fsUtils.searchAudio(options)
  })

  // 搜索字幕
  ipcMain.handle('fs:searchSubtitles', async (event, options = {}) => {
    return fsUtils.searchSubtitles(options)
  })

  // 搜索 JSON
  ipcMain.handle('fs:searchJSON', async (event, options = {}) => {
    return fsUtils.searchJSON(options)
  })

  // 获取存储信息
  ipcMain.handle('fs:getStorageInfo', async () => {
    return fsUtils.getStorageInfo()
  })

  // ==================== 项目操作 ====================
  
  // 创建视频项目
  ipcMain.handle('fs:createVideoProject', async (event, projectName, config = {}) => {
    return fsUtils.createVideoProject(projectName, config)
  })

  // 获取视频项目列表
  ipcMain.handle('fs:getVideoProjects', async () => {
    return fsUtils.getVideoProjects()
  })

  // ==================== 外部文件导入 ====================
  
  // 分析外部文件夹
  ipcMain.handle('fs:analyzeExternalFolder', async (event, externalPath) => {
    return fsUtils.analyzeExternalFolder(externalPath)
  })

  // 导入外部文件夹到 VFS
  ipcMain.handle('fs:importExternalFolder', async (event, externalPath, vfsTargetPath, options = {}) => {
    return fsUtils.importExternalFolder(externalPath, vfsTargetPath, options)
  })

  // 智能组织外部文件到项目
  ipcMain.handle('fs:smartOrganizeToProject', async (event, externalPath, projectPath, options = {}) => {
    return fsUtils.smartOrganizeToProject(externalPath, projectPath, options)
  })

  // ==================== 对话框操作 ====================
  
  // 打开文件选择对话框
  ipcMain.handle('dialog:openFile', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [
        { name: '视频文件', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      ...options,
    })
    
    if (result.canceled) {
      return null
    }
    
    return result.filePaths[0]
  })

  // 打开目录选择对话框
  ipcMain.handle('dialog:openDirectory', async (event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      ...options,
    })
    
    if (result.canceled) {
      return null
    }
    
    return result.filePaths[0]
  })

  // 保存文件对话框
  ipcMain.handle('dialog:saveFile', async (event, options = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      filters: options.filters || [
        { name: '所有文件', extensions: ['*'] },
      ],
      ...options,
    })
    
    if (result.canceled) {
      return null
    }
    
    return result.filePath
  })

  // 显示消息对话框
  ipcMain.handle('dialog:showMessageBox', async (event, options = {}) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: options.type || 'info',
      title: options.title,
      message: options.message,
      detail: options.detail,
      buttons: options.buttons || ['确定'],
      ...options,
    })
    
    return result.response
  })

  // ==================== 系统操作 ====================
  
  // 获取允许根目录
  ipcMain.handle('system:getAllowedRoots', async () => {
    return allowedRoots
  })

  // 设置允许根目录
  ipcMain.handle('system:setAllowedRoots', async (event, roots) => {
    allowedRoots = roots.map(r => path.normalize(r))
    fsUtils.setAllowedRoots(allowedRoots)
    return allowedRoots
  })

  // ==================== MCP 服务器操作 ====================
  
  // 启动 MCP 服务器
  ipcMain.handle('mcp:start', async (event, port = 8001) => {
    try {
      if (mcpServer && mcpServer.running) {
        await mcpServer.stop()
      }
      
      mcpServer = new ElectronMCPServer()
      
      // 注册文件系统工具
      mcpServer.registerTool({
        name: 'fs_list',
        description: '列出目录内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径' }
          },
          required: ['path']
        },
        handler: async ({ path: dirPath }) => {
          const items = await ipcMain.handlers['fs:listDirectory'](null, dirPath)
          return items.map(item => `${item.isDirectory ? '📁' : '📄'} ${item.name}`).join('\n')
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_read',
        description: '读取文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' }
          },
          required: ['path']
        },
        handler: async ({ path: filePath }) => {
          return await ipcMain.handlers['fs:readFile'](null, filePath, 'utf-8')
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_write',
        description: '写入文件内容',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件路径' },
            content: { type: 'string', description: '文件内容' }
          },
          required: ['path', 'content']
        },
        handler: async ({ path: filePath, content }) => {
          await ipcMain.handlers['fs:writeFile'](null, filePath, content)
          return `✅ 文件已写入：${filePath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_delete',
        description: '删除文件或目录',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件/目录路径' },
            recursive: { type: 'boolean', description: '是否递归删除', default: false }
          },
          required: ['path']
        },
        handler: async ({ path: targetPath, recursive = false }) => {
          await ipcMain.handlers['fs:delete'](null, targetPath, recursive)
          return `✅ 已删除：${targetPath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_move',
        description: '移动/重命名文件',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '源路径' },
            to: { type: 'string', description: '目标路径' }
          },
          required: ['from', 'to']
        },
        handler: async ({ from: fromPath, to: toPath }) => {
          await ipcMain.handlers['fs:move'](null, fromPath, toPath)
          return `✅ 已移动：${fromPath} -> ${toPath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'fs_copy',
        description: '复制文件',
        inputSchema: {
          type: 'object',
          properties: {
            from: { type: 'string', description: '源路径' },
            to: { type: 'string', description: '目标路径' }
          },
          required: ['from', 'to']
        },
        handler: async ({ from: fromPath, to: toPath }) => {
          await ipcMain.handlers['fs:copy'](null, fromPath, toPath)
          return `✅ 已复制：${fromPath} -> ${toPath}`
        }
      })
      
      mcpServer.registerTool({
        name: 'project_list',
        description: '列出所有视频项目',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        handler: async () => {
          const projects = await ipcMain.handlers['fs:getVideoProjects'](null)
          if (projects.length === 0) return '📂 当前没有任何项目'
          return projects.map((p, i) => `${i + 1}. **${p.name}** - ${p.path}`).join('\n')
        }
      })
      
      mcpServer.registerTool({
        name: 'project_create',
        description: '创建新的视频项目',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '项目名称' },
            config: { type: 'object', description: '项目配置 (可选)' }
          },
          required: ['name']
        },
        handler: async ({ name: projectName, config }) => {
          const projectPath = await ipcMain.handlers['fs:createVideoProject'](null, projectName, config || {})
          return `✅ 项目已创建：${projectName}\n路径：${projectPath}`
        }
      })
      
      await mcpServer.start(port)
      
      return { success: true, port, status: mcpServer.getStatus() }
    } catch (error) {
      console.error('[IPC] mcp:start error:', error)
      throw error
    }
  })

  // 停止 MCP 服务器
  ipcMain.handle('mcp:stop', async () => {
    try {
      if (mcpServer) {
        await mcpServer.stop()
        mcpServer = null
        return { success: true }
      }
      return { success: false, message: 'MCP 服务器未运行' }
    } catch (error) {
      console.error('[IPC] mcp:stop error:', error)
      throw error
    }
  })

  // 获取 MCP 服务器状态
  ipcMain.handle('mcp:getStatus', async () => {
    if (mcpServer) {
      return {
        running: mcpServer.running,
        status: mcpServer.getStatus(),
        tools: mcpServer.getRegisteredTools(),
        resources: mcpServer.getRegisteredResources(),
        prompts: mcpServer.getRegisteredPrompts()
      }
    }
    return { running: false }
  })

  // 获取应用路径
  ipcMain.handle('system:getPath', async (event, name) => {
    return app.getPath(name)
  })

  // 在文件管理器中显示
  ipcMain.handle('system:showInFolder', async (event, filePath) => {
    try {
      const resolved = validatePath(filePath)
      shell.showItemInFolder(resolved)
      return true
    } catch (error) {
      console.error('[IPC] showInFolder error:', error)
      throw error
    }
  })

  // 用默认应用打开文件
  ipcMain.handle('system:openFile', async (event, filePath) => {
    try {
      const resolved = validatePath(filePath)
      shell.openPath(resolved)
      return true
    } catch (error) {
      console.error('[IPC] openFile error:', error)
      throw error
    }
  })
}


/**
 * 应用初始化
 */
app.whenReady().then(async () => {
  // 2. 拦截并处理 app:// 协议的请求
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let relativePath = url.pathname
    
    // 如果是根路径，指向 index.html
    if (relativePath === '/' || relativePath === '') {
      relativePath = '/index.html'
    }
    
    // 拼接出本地真实路径 (假设 Next.js 打包在 out 目录)
    let absolutePath = path.join(__dirname, '../out', relativePath)
    
    // SPA 路由 fallback：如果文件不存在，返回 index.html
    if (!fs.existsSync(absolutePath)) {
      absolutePath = path.join(__dirname, '../out/index.html')
    }
    
    // 转换为 file:// 协议供 net.fetch 读取
    const fileUrl = 'file:///' + absolutePath.replace(/\\/g, '/')
    return net.fetch(fileUrl)
  })

  // 设置允许的根目录 - 以 剪辑工作室 目录为主要根目录
  const documentsPath = app.getPath('documents')
  const videosPath = app.getPath('videos')
  const studioPath = path.join(documentsPath, '剪辑工作室')
  
  allowedRoots = [
    studioPath,      // 主要根目录：Documents/剪辑工作室
    documentsPath,   // 备用：Documents
    videosPath,      // 备用：Videos
  ]
  
  // 初始化 fs-utils 的允许根目录
  fsUtils.setAllowedRoots(allowedRoots)
  
  console.log('[Main] 允许的根目录:', allowedRoots)
  
  // 注册 IPC 处理器
  registerIPCHandlers()
  
  
  // 创建窗口
  createWindow()
  
  // 自动启动 MCP 服务器 - 注册完整的虚拟文件系统工具
  try {
    const { ElectronMCPServer } = require('./mcp-server')
    mcpServer = new ElectronMCPServer()
    
    // ==================== 基础文件系统操作 ====================
    
    // 使用 fsUtils 直接调用文件系统函数
    mcpServer.registerTool({
      name: 'vfs_list',
      description: '列出虚拟文件系统目录内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，例如 /projects', default: '/' }
        },
        required: []
      },
      handler: async ({ path = '/' }) => {
        const items = await fsUtils.listDirectory(path)
        if (!items || items.length === 0) return '📂 目录为空'
        return items.map(item => 
          `${item.isDirectory ? '📁' : '📄'} ${item.name}${item.size ? ` (${(item.size / 1024).toFixed(1)} KB)` : ''}`
        ).join('\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_read',
      description: '读取虚拟文件系统文件内容',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，例如 /我的项目/test.json' }
        },
        required: ['path']
      },
      handler: async ({ path }) => {
        return await fsUtils.readFile(path, 'utf-8')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_write',
      description: '写入文件到虚拟文件系统',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '文件内容' }
        },
        required: ['path', 'content']
      },
      handler: async ({ path, content }) => {
        await fsUtils.writeFile(path, content)
        return `✅ 文件已写入：${path}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_delete',
      description: '删除虚拟文件系统中的文件或目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件/目录路径' },
          recursive: { type: 'boolean', description: '是否递归删除目录', default: false }
        },
        required: ['path']
      },
      handler: async ({ path, recursive = false }) => {
        await fsUtils.deleteFile(path, recursive)
        return `✅ 已删除：${path}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_move',
      description: '移动/重命名虚拟文件系统中的文件或目录',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '源路径' },
          to: { type: 'string', description: '目标路径' }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        await fsUtils.moveFile(from, to)
        return `✅ 已移动：${from} -> ${to}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_copy',
      description: '复制虚拟文件系统中的文件',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '源路径' },
          to: { type: 'string', description: '目标路径' }
        },
        required: ['from', 'to']
      },
      handler: async ({ from, to }) => {
        await fsUtils.copyFile(from, to)
        return `✅ 已复制：${from} -> ${to}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_mkdir',
      description: '在虚拟文件系统中创建目录',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径' },
          recursive: { type: 'boolean', description: '是否递归创建', default: true }
        },
        required: ['path']
      },
      handler: async ({ path, recursive = true }) => {
        await fsUtils.mkdir(path, recursive)
        return `✅ 目录已创建：${path}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_exists',
      description: '检查虚拟文件系统中路径是否存在',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要检查的路径' }
        },
        required: ['path']
      },
      handler: async ({ path }) => {
        const exists = await fsUtils.exists(path)
        return exists ? `✅ 路径存在：${path}` : `❌ 路径不存在：${path}`
      }
    })
    
    // ==================== 文件搜索 ====================
    
    mcpServer.registerTool({
      name: 'vfs_search',
      description: '在虚拟文件系统中搜索文件',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '搜索模式（支持正则）' },
          maxResults: { type: 'number', description: '最大结果数', default: 50 }
        },
        required: ['pattern']
      },
      handler: async ({ pattern, maxResults = 50 }) => {
        const results = await fsUtils.search(pattern, { maxResults })
        if (!results || results.length === 0) return '🔍 未找到匹配的文件'
        return results.map(item => `${item.isDirectory ? '📁' : '📄'} ${item.path}`).join('\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_search_videos',
      description: '搜索虚拟文件系统中的视频文件',
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '最大结果数', default: 50 }
        },
        required: []
      },
      handler: async ({ maxResults = 50 }) => {
        const results = await fsUtils.searchVideos({ maxResults })
        if (!results || results.length === 0) return '🎬 未找到视频文件'
        return results.map(item => `📄 ${item.path}`).join('\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_search_json',
      description: '搜索虚拟文件系统中的 JSON 文件',
      inputSchema: {
        type: 'object',
        properties: {
          maxResults: { type: 'number', description: '最大结果数', default: 50 }
        },
        required: []
      },
      handler: async ({ maxResults = 50 }) => {
        const results = await fsUtils.searchJSON({ maxResults })
        if (!results || results.length === 0) return '📋 未找到 JSON 文件'
        return results.map(item => `📄 ${item.path}`).join('\n')
      }
    })
    
    // ==================== 项目管理 ====================
    
    mcpServer.registerTool({
      name: 'vfs_project_list',
      description: '列出所有视频项目',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const projects = await fsUtils.getVideoProjects()
        if (!projects || projects.length === 0) return '📂 当前没有任何项目'
        return projects.map((p, i) => 
          `${i + 1}. **${p.name}**\n   路径：${p.path}\n   更新：${p.updatedAt}`
        ).join('\n\n')
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_project_create',
      description: '创建新的视频项目',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '项目名称' },
          config: { type: 'object', description: '项目配置 (可选)' }
        },
        required: ['name']
      },
      handler: async ({ name, config }) => {
        const projectPath = await fsUtils.createVideoProject(name, config || {})
        return `✅ 项目已创建：${name}\n路径：${projectPath}`
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_project_read',
      description: '读取项目目录信息（项目由目录本身表示）',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: '项目路径' }
        },
        required: ['projectPath']
      },
      handler: async ({ projectPath }) => {
        const projects = await fsUtils.getVideoProjects()
        const project = projects.find(item => item.path === projectPath)
        if (!project) {
          throw new Error(`项目不存在：${projectPath}`)
        }
        return JSON.stringify({
          name: project.name,
          path: project.path,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }, null, 2)
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_project_update',
      description: '更新项目配置（已停用，项目不再生成 project.json）',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: '项目路径' },
          config: { type: 'object', description: '新的项目配置' }
        },
        required: ['projectPath', 'config']
      },
      handler: async ({ projectPath, config }) => {
        return `ℹ️ 项目由目录表示，不再写入 project.json：${projectPath}`
      }
    })
    
    // ==================== 存储信息 ====================
    
    mcpServer.registerTool({
      name: 'vfs_storage_info',
      description: '获取虚拟文件系统存储使用情况',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        const info = await fsUtils.getStorageInfo()
        return `📊 存储信息:\n- 根目录：${info.root}\n- 文件总数：${info.fileCount}\n- 总大小：${(info.totalSize / 1024 / 1024).toFixed(2)} MB`
      }
    })
    
    // ==================== 外部文件导入工具 ====================
    
    mcpServer.registerTool({
      name: 'vfs_analyze_external',
      description: '分析外部文件夹内容（视频、音频、图片、文档等），返回详细的文件分类和统计信息。💡 提示：分析后可配合 vfs_smart_organize 将文件智能组织到 /项目名 目录中',
      inputSchema: {
        type: 'object',
        properties: {
          externalPath: { 
            type: 'string', 
            description: '外部文件夹的绝对路径，例如 "C:\\Users\\admin\\Desktop\\MyFiles" 或 "C:/Users/admin/Desktop/MyFiles"' 
          }
        },
        required: ['externalPath']
      },
      handler: async ({ externalPath }) => {
        try {
          const analysis = await fsUtils.analyzeExternalFolder(externalPath)
          
          let report = `📂 外部文件夹分析报告\n`
          report += `━━━━━━━━━━━━━━━━━━━━━━\n`
          report += `📍 路径：${analysis.path}\n`
          report += `📊 文件总数：${analysis.summary.videoCount + analysis.summary.audioCount + analysis.summary.imageCount + analysis.summary.documentCount + analysis.summary.scriptCount + analysis.summary.subtitleCount + analysis.summary.otherCount}\n`
          report += `💾 总大小：${analysis.summary.totalSizeMB} MB\n\n`
          report += `📁 文件分类:\n`
          report += `  🎬 视频：${analysis.summary.videoCount} 个\n`
          report += `  🎵 音频：${analysis.summary.audioCount} 个\n`
          report += `  🖼️  图片：${analysis.summary.imageCount} 个\n`
          report += `  📄 文档：${analysis.summary.documentCount} 个\n`
          report += `  💻 脚本：${analysis.summary.scriptCount} 个\n`
          report += `  📝 字幕：${analysis.summary.subtitleCount} 个\n`
          report += `  📦 其他：${analysis.summary.otherCount} 个\n`
          
          if (analysis.filesByType.video.length > 0) {
            report += `\n🎬 视频文件:\n`
            analysis.filesByType.video.slice(0, 10).forEach(f => {
              report += `  - ${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)\n`
            })
            if (analysis.filesByType.video.length > 10) {
              report += `  ... 还有 ${analysis.filesByType.video.length - 10} 个视频文件\n`
            }
          }
          
          return report
        } catch (error) {
          return `❌ 分析失败：${error.message}`
        }
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_import_external',
      description: '将外部文件夹导入到项目 VFS，支持文件过滤、目录结构保持或扁平化。vfsTargetPath 必须指向 /项目名/文案 或 /项目名/场景素材。',
      inputSchema: {
        type: 'object',
        properties: {
          externalPath: { 
            type: 'string', 
            description: '外部文件夹的绝对路径' 
          },
          vfsTargetPath: { 
            type: 'string', 
            description: '必须指向 /项目名/文案 或 /项目名/场景素材，例如：/我的视频项目/场景素材。'
          },
          includePatterns: { 
            type: 'array', 
            items: { type: 'string' },
            description: '包含的文件正则模式（可选），例如 ["\\.mp4$", "\\.mov$"] 只导入视频',
            default: []
          },
          excludePatterns: { 
            type: 'array', 
            items: { type: 'string' },
            description: '排除的文件正则模式（可选），例如 ["\\.tmp$", "~$"]',
            default: []
          },
          flatten: { 
            type: 'boolean', 
            description: '是否扁平化目录结构（true=所有文件放到同一层，false=保持原目录结构）',
            default: false
          },
          maxFileSize: { 
            type: 'number', 
            description: '最大文件大小（字节），默认 500MB (524288000)',
            default: 524288000
          }
        },
        required: ['externalPath', 'vfsTargetPath']
      },
      handler: async ({ externalPath, vfsTargetPath, includePatterns = [], excludePatterns = [], flatten = false, maxFileSize = 524288000 }) => {
        try {
          const result = await fsUtils.importExternalFolder(externalPath, vfsTargetPath, {
            includePatterns,
            excludePatterns,
            flatten,
            maxFileSize,
          })
          
          let report = `✅ 导入完成\n`
          report += `━━━━━━━━━━━━━━━━━━━━━━\n`
          report += `📥 源路径：${result.sourcePath}\n`
          report += `📤 目标路径：${result.targetPath}\n`
          report += `📊 成功复制：${result.summary.totalCopied} 个文件\n`
          report += `💾 总大小：${result.summary.totalSizeMB} MB\n`
          
          if (result.summary.totalSkipped > 0) {
            report += `⚠️  跳过：${result.summary.totalSkipped} 个文件\n`
          }
          if (result.summary.totalErrors > 0) {
            report += `❌ 错误：${result.summary.totalErrors} 个\n`
          }
          
          return report
        } catch (error) {
          return `❌ 导入失败：${error.message}`
        }
      }
    })
    
    mcpServer.registerTool({
      name: 'vfs_smart_organize',
      description: '智能组织外部文件到项目结构中。如果检测到 script.json，会根据 flag 分类视频（human→文案，scene→场景素材），其他文件放项目根目录。projectPath 必须指向 /项目名。',
      inputSchema: {
        type: 'object',
        properties: {
          externalPath: { 
            type: 'string', 
            description: '外部文件夹的绝对路径' 
          },
          projectPath: { 
            type: 'string', 
            description: '⚠️ 必须指向 /项目名 目录！例如：/我的视频项目。不允许使用其他路径。' 
          },
          autoRename: { 
            type: 'boolean', 
            description: '是否自动重命名重复文件（添加时间戳）',
            default: true
          },
          createSubfolders: { 
            type: 'boolean', 
            description: '是否创建分类子文件夹',
            default: true
          },
          useScriptAnalysis: { 
            type: 'boolean', 
            description: '是否使用脚本文件分析（检测 script.json 并根据 flag 分类视频：human→文案，scene→场景素材）',
            default: true
          }
        },
        required: ['externalPath', 'projectPath']
      },
      handler: async ({ externalPath, projectPath, autoRename = true, createSubfolders = true, useScriptAnalysis = true }) => {
        try {
          const result = await fsUtils.smartOrganizeToProject(externalPath, projectPath, {
            autoRename,
            createSubfolders,
            useScriptAnalysis,
          })
          
          let report = `🎯 智能组织完成\n`
          report += `━━━━━━━━━━━━━━━━━━━━━━\n`
          report += `📥 源路径：${result.sourcePath}\n`
          report += `📤 项目路径：${result.projectPath}\n`
          
          if (result.scriptFound) {
            report += `✅ 检测到脚本文件：${result.scriptAnalysis.scriptPath}\n`
            report += `   - human 视频（数字人）：${result.scriptAnalysis.humanVideos.length} 个\n`
            report += `   - scene 视频（场景）：${result.scriptAnalysis.sceneVideos.length} 个\n\n`
          }
          
          report += `📊 总文件数：${result.summary.totalFiles}\n\n`
          report += `📁 分类结果:\n`
          report += `  🎬 文案目录视频 (human)：${result.summary.humanVideoCount} 个\n`
          report += `  🎬 场景素材目录视频 (scene)：${result.summary.sceneVideoCount} 个\n`
          report += `  🎵 音频素材：${result.summary.audioCount} 个\n`
          report += `  🖼️  图片素材：${result.summary.imageCount} 个\n`
          report += `  📄 文案文档：${result.summary.documentCount} 个\n`
          report += `  📝 字幕文件：${result.summary.subtitleCount} 个\n`
          report += `  💻 脚本代码：${result.summary.scriptCount} 个\n`
          report += `  📦 其他文件：${result.summary.otherCount} 个\n`
          
          if (result.summary.errorCount > 0) {
            report += `\n⚠️  处理错误：${result.summary.errorCount} 个\n`
            result.errors.slice(0, 5).forEach(e => {
              report += `  - ${e.path}: ${e.error}\n`
            })
          }
          
          return report
        } catch (error) {
          return `❌ 组织失败：${error.message}`
        }
      }
    })
    
    await mcpServer.start(8001)
    console.log('[Main] MCP 服务器已自动启动在端口 8001')
  } catch (error) {
    console.error('[Main] MCP 服务器启动失败:', error)
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 安全验证
app.on('web-contents-created', (event, contents) => {
  // 阻止导航到外部 URL
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    // 开发模式允许 localhost，生产模式允许 app:// 协议
    const isDev = !app.isPackaged
    if (isDev) {
      if (parsedUrl.origin !== 'http://localhost:30099') {
        event.preventDefault()
      }
    } else {
      // 生产模式只允许 app:// 协议
      if (parsedUrl.protocol !== 'app:') {
        event.preventDefault()
      }
    }
  })
})
