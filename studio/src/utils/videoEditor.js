/**
 * 基于 FFmpeg.wasm 的视频编辑工具
 * 使用 @ffmpeg/ffmpeg 和 @ffmpeg/util 进行客户端视频处理
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

class VideoEditor {
  constructor() {
    this.ffmpeg = null
    this.loaded = false
    this.onProgress = null
  }

  /**
   * 加载 FFmpeg WASM
   */
  async load() {
    if (this.loaded) return

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'

    this.ffmpeg = new FFmpeg()

    // 监听日志
    this.ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message)
    })

    // 监听进度
    this.ffmpeg.on('progress', ({ progress, time }) => {
      console.log('[FFmpeg Progress]', progress, time)
      if (this.onProgress) {
        this.onProgress(progress, time)
      }
    })

    // 加载核心
    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

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
    await this.ffmpeg.writeFile(name, await fetchFile(data))
  }

  /**
   * 从虚拟文件系统读取文件
   */
  async readFile(name, type = 'blob') {
    if (!this.loaded) await this.load()
    const data = await this.ffmpeg.readFile(name)
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
      await this.ffmpeg.deleteFile(name)
    } catch (e) {
      console.warn('[VideoEditor] deleteFile error:', e)
    }
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
    if (this.ffmpeg) {
      try {
        await this.ffmpeg.terminate()
      } catch (e) {
        console.warn('[VideoEditor] cleanup error:', e)
      }
      this.ffmpeg = null
      this.loaded = false
    }
  }
}

// 导出单例
export const videoEditor = new VideoEditor()

// 导出类供直接使用
export { VideoEditor }