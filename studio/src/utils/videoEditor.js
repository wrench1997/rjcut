/**
 * 基于 FFmpeg.wasm 的视频编辑工具
 * 使用 @ffmpeg/ffmpeg 和 @ffmpeg/util 进行客户端视频处理
 */

class VideoEditor {
  constructor() {
    this.worker = null
    this.pending = new Map()
    this.nextId = 1
    this.loaded = false
    this.onProgress = null
  }

  /**
   * 加载 FFmpeg WASM
   */
  async load() {
    if (this.loaded) return

    // 核心文件随应用放在 public/wasm 中；禁止在运行时依赖 CDN。
    const assetPath = '/wasm/ffmpeg-core'
    // Electron 的 module Worker 会把以 / 开头的动态 import 当作 Node 路径。
    // 传完整 HTTP URL 才能稳定加载 Next 提供的本地静态文件。
    const baseURL = typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}${assetPath}`
      : assetPath

    this.worker = new Worker(`${baseURL}/ffmpeg-worker.js`)
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { this.onProgress?.(data.data.progress, data.data.time); return }
      if (data.type === 'log') { console.log('[FFmpeg]', data.data.message); return }
      const pending = this.pending.get(data.id)
      if (!pending) return
      this.pending.delete(data.id)
      data.type === 'error' ? pending.reject(new Error(data.data.message)) : pending.resolve(data.data)
    }

    // 加载核心
    try {
      await this._send('load', { coreURL: `${baseURL}/ffmpeg-core.js`, wasmURL: `${baseURL}/ffmpeg-core.wasm` })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`离线 FFmpeg 核心加载失败（${baseURL}）：${detail}`)
    }

    this.loaded = true
    console.log('[VideoEditor] FFmpeg loaded')
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback) {
    this.onProgress = callback
  }

  /**
   * 写入文件到虚拟文件系统
   */
  async writeFile(name, data) {
    if (!this.loaded) await this.load()
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer())
    await this._send('write', { path: name, file: bytes }, [bytes.buffer])
  }

  /**
   * 从虚拟文件系统读取文件
   */
  async readFile(name, type = 'blob') {
    if (!this.loaded) await this.load()
    const data = await this._send('read', { path: name })
    if (type === 'blob') {
      return new Blob([data.buffer], { type: 'video/mp4' })
    }
    return data
  }

  /**
   * 删除虚拟文件系统中的文件
   */
  async deleteFile(name) {
    if (!this.loaded) await this.load()
    try {
      await this._send('delete', { path: name })
    } catch (e) {
      console.warn('[VideoEditor] deleteFile error:', e)
    }
  }

  /** 执行一条原始 FFmpeg 参数数组命令。 */
  async exec(args) {
    if (!this.loaded) await this.load()
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
      throw new Error('FFmpeg 命令参数必须是字符串数组')
    }
    return this._send('exec', { args })
  }

  /**
   * 裁剪视频
   * @param {string} inputFile - 输入文件名
   * @param {string} outputFile - 输出文件名
   * @param {number} startTime - 开始时间（秒）
   * @param {number} duration - 持续时间（秒）
   */
  async trimVideo(inputFile, outputFile, startTime, duration) {
    if (!this.loaded) await this.load()

    await this.ffmpeg.exec([
      '-i', inputFile,
      '-ss', String(startTime),
      '-t', String(duration),
      '-c:v', 'libx264',
      '-c:a', 'aac',
      outputFile
    ])

    return await this.readFile(outputFile)
  }

  /**
   * 合并多个视频
   * @param {string[]} inputFiles - 输入文件列表
   * @param {string} outputFile - 输出文件名
   */
  async mergeVideos(inputFiles, outputFile) {
    if (!this.loaded) await this.load()

    // 创建合并列表文件
    const listContent = inputFiles.map(f => `file '${f}'`).join('\n')
    await this.writeFile('merge_list.txt', new Blob([listContent], { type: 'text/plain' }))

    await this.ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'merge_list.txt',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      outputFile
    ])

    return await this.readFile(outputFile)
  }

  /**
   * 添加背景音乐
   * @param {string} videoFile - 视频文件
   * @param {string} audioFile - 音频文件
   * @param {string} outputFile - 输出文件
   * @param {number} volume - 背景音乐音量 (0-1)
   */
  async addBackgroundMusic(videoFile, audioFile, outputFile, volume = 0.3) {
    if (!this.loaded) await this.load()

    await this.ffmpeg.exec([
      '-i', videoFile,
      '-i', audioFile,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-filter_complex', `[1:a]volume=${volume}[bg];[0:a][bg]amix=inputs=2:duration=first`,
      '-map', '0:v',
      '-map', '[bg]',
      '-shortest',
      outputFile
    ])

    return await this.readFile(outputFile)
  }

  /**
   * 添加字幕
   * @param {string} videoFile - 视频文件
   * @param {string} subtitleFile - 字幕文件 (.srt)
   * @param {string} outputFile - 输出文件
   */
  async addSubtitle(videoFile, subtitleFile, outputFile) {
    if (!this.loaded) await this.load()

    await this.ffmpeg.exec([
      '-i', videoFile,
      '-vf', `subtitles=${subtitleFile}`,
      '-c:a', 'copy',
      outputFile
    ])

    return await this.readFile(outputFile)
  }

  /**
   * 转换视频格式
   * @param {string} inputFile - 输入文件
   * @param {string} outputFile - 输出文件
   * @param {string} format - 目标格式 (mp4, webm, etc)
   */
  async convertFormat(inputFile, outputFile, format = 'mp4') {
    if (!this.loaded) await this.load()

    const codecs = {
      mp4: { video: 'libx264', audio: 'aac' },
      webm: { video: 'libvpx-vp9', audio: 'libopus' },
    }

    const codec = codecs[format] || codecs.mp4

    await this.ffmpeg.exec([
      '-i', inputFile,
      '-c:v', codec.video,
      '-c:a', codec.audio,
      outputFile
    ])

    return await this.readFile(outputFile)
  }

  /**
   * 调整视频分辨率
   * @param {string} inputFile - 输入文件
   * @param {string} outputFile - 输出文件
   * @param {string} resolution - 分辨率 (如 '1920x1080', '1280x720')
   */
  async resizeVideo(inputFile, outputFile, resolution = '1920x1080') {
    if (!this.loaded) await this.load()

    await this.ffmpeg.exec([
      '-i', inputFile,
      '-vf', `scale=${resolution}`,
      '-c:a', 'copy',
      outputFile
    ])

    return await this.readFile(outputFile)
  }

  /**
   * 提取音频
   * @param {string} inputFile - 输入视频文件
   * @param {string} outputFile - 输出音频文件
   */
  async extractAudio(inputFile, outputFile) {
    if (!this.loaded) await this.load()

    await this.ffmpeg.exec([
      '-i', inputFile,
      '-vn',
      '-acodec', 'libmp3lame',
      '-ab', '192k',
      outputFile
    ])

    return await this.readFile(outputFile, 'blob')
  }

  /**
   * 生成缩略图
   * @param {string} inputFile - 输入视频文件
   * @param {string} outputFile - 输出图片文件
   * @param {number} time - 时间点（秒）
   */
  async generateThumbnail(inputFile, outputFile, time = 1) {
    if (!this.loaded) await this.load()

    await this.ffmpeg.exec([
      '-i', inputFile,
      '-ss', String(time),
      '-vframes', '1',
      '-vf', 'scale=320:-1',
      outputFile
    ])

    return await this.readFile(outputFile, 'blob')
  }

  /**
   * 清理资源
   */
  async cleanup() {
    if (this.worker) {
      try {
        this.worker.terminate()
      } catch (e) {
        console.warn('[VideoEditor] cleanup error:', e)
      }
      this.worker = null
      this.loaded = false
    }
  }

  _send(type, data, transfer = []) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, type, data }, transfer)
    })
  }
}

// 导出单例
export const videoEditor = new VideoEditor()

// 导出类供直接使用
export { VideoEditor }
