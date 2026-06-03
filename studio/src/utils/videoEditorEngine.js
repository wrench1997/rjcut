/**
 * 数字人 Studio 视频编辑引擎
 * 基于 ffmpeg-bridge 和 video-engine 两个 WASM 模块
 * 
 * - ffmpeg-bridge: FFmpeg 命令执行、转码、裁剪、合并等
 * - video-engine: 时间轴管理、帧渲染、音频混音、导出
 */

import initFfmpeg, * as Ffmpeg from '../../wasm/ffmpeg-bridge/pkg/ffmpeg_bridge.js'
import initVideoEngine, * as VideoEngine from '../../wasm/video-engine/pkg/video_engine.js'

class VideoEditorEngine {
  constructor() {
    this.ffmpegInitialized = false
    this.videoEngineInitialized = false
    this.onProgress = null
    this.onLog = null
  }

  /**
   * 初始化所有 WASM 模块
   */
  async initialize() {
    try {
      // 初始化 ffmpeg-bridge
      await initFfmpeg()
      this.ffmpegInitialized = true
      console.log('[VideoEditorEngine] FFmpeg Bridge initialized')

      // 初始化 video-engine
      await initVideoEngine()
      this.videoEngineInitialized = true
      console.log('[VideoEditorEngine] Video Engine initialized')

      return true
    } catch (err) {
      console.error('[VideoEditorEngine] Initialization failed:', err)
      throw err
    }
  }

  /**
   * 设置进度回调
   */
  setProgressCallback(callback) {
    this.onProgress = callback
  }

  /**
   * 设置日志回调
   */
  setLogCallback(callback) {
    this.onLog = callback
  }

  // =====================================================
  // FFmpeg Bridge 功能
  // =====================================================

  /**
   * 裁剪视频
   * @param {File|Blob} videoFile - 视频文件
   * @param {number} startTime - 开始时间（秒）
   * @param {number} duration - 持续时间（秒）
   * @param {boolean} useStreamCopy - 是否使用流复制（不重新编码）
   * @returns {Promise<Blob>} - 处理后的视频
   */
  async trimVideo(videoFile, startTime, duration, useStreamCopy = false) {
    const task = new Ffmpeg.FfmpegTask('trim_' + Date.now(), duration)

    // 读取文件
    const fileData = await this._readFileAsUint8Array(videoFile)
    task.add_input_file('input.mp4', fileData)

    // 构建命令
    const cmd = Ffmpeg.build_trim_command(
      'input.mp4',
      'output.mp4',
      startTime,
      duration,
      useStreamCopy
    )
    const args = JSON.parse(cmd).args
    task.set_args_json(JSON.stringify(args))
    task.set_output_file('output.mp4')

    // 执行任务
    const result = await this._runTask(task)

    return result
  }

  /**
   * 合并多个视频
   * @param {Array<File|Blob>} videoFiles - 视频文件列表
   * @returns {Promise<Blob>} - 合并后的视频
   */
  async mergeVideos(videoFiles) {
    const task = new Ffmpeg.FfmpegTask('merge_' + Date.now(), 0)

    // 添加所有输入文件
    const fileNames = []
    for (let i = 0; i < videoFiles.length; i++) {
      const fileName = `segment_${i}.mp4`
      const fileData = await this._readFileAsUint8Array(videoFiles[i])
      task.add_input_file(fileName, fileData)
      fileNames.push(fileName)
    }

    // 生成 concat 列表
    const concatList = Ffmpeg.generate_concat_list(JSON.stringify(fileNames))
    const concatFileName = 'concat_list.txt'
    task.add_input_file(concatFileName, new TextEncoder().encode(concatList))

    // 构建合并命令（假设 1080p 30fps）
    const cmd = Ffmpeg.build_concat_command(
      concatFileName,
      'output.mp4',
      1920, 1080, 30, 5000, 192
    )
    const args = JSON.parse(cmd).args
    task.set_args_json(JSON.stringify(args))
    task.set_output_file('output.mp4')

    const result = await this._runTask(task)
    return result
  }

  /**
   * 转换视频格式
   * @param {File|Blob} videoFile - 输入文件
   * @param {string} format - 目标格式 (mp4, webm, etc)
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @param {number} fps - 帧率
   * @param {number} videoBitrate - 视频码率 (kbps)
   * @param {number} audioBitrate - 音频码率 (kbps)
   * @returns {Promise<Blob>}
   */
  async transcodeVideo(
    videoFile,
    format = 'mp4',
    width = 1920,
    height = 1080,
    fps = 30,
    videoBitrate = 5000,
    audioBitrate = 192
  ) {
    const task = new Ffmpeg.FfmpegTask('transcode_' + Date.now(), 0)

    const fileData = await this._readFileAsUint8Array(videoFile)
    task.add_input_file('input.mp4', fileData)

    const cmd = Ffmpeg.build_transcode_command(
      'input.mp4',
      `output.${format}`,
      format,
      videoBitrate,
      audioBitrate,
      width,
      height,
      fps
    )
    const args = JSON.parse(cmd).args
    task.set_args_json(JSON.stringify(args))
    task.set_output_file(`output.${format}`)

    const result = await this._runTask(task)
    return result
  }

  /**
   * 提取音频
   * @param {File|Blob} videoFile - 视频文件
   * @param {string} format - 音频格式 (mp3, wav, etc)
   * @param {number} bitrate - 码率 (kbps)
   * @returns {Promise<Blob>}
   */
  async extractAudio(videoFile, format = 'mp3', bitrate = 192) {
    const task = new Ffmpeg.FfmpegTask('extract_audio_' + Date.now(), 0)

    const fileData = await this._readFileAsUint8Array(videoFile)
    task.add_input_file('input.mp4', fileData)

    const cmd = Ffmpeg.build_extract_audio_command(
      'input.mp4',
      `output.${format}`,
      format,
      bitrate
    )
    const args = JSON.parse(cmd).args
    task.set_args_json(JSON.stringify(args))
    task.set_output_file(`output.${format}`)

    const result = await this._runTask(task)
    return result
  }

  /**
   * 生成缩略图
   * @param {File|Blob} videoFile - 视频文件
   * @param {number} timeSec - 时间点（秒）
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {Promise<Blob>}
   */
  async generateThumbnail(videoFile, timeSec = 1, width = 320, height = 180) {
    const task = new Ffmpeg.FfmpegTask('thumbnail_' + Date.now(), 0)

    const fileData = await this._readFileAsUint8Array(videoFile)
    task.add_input_file('input.mp4', fileData)

    const cmd = Ffmpeg.build_thumbnail_command(
      'input.mp4',
      'thumbnail.jpg',
      timeSec,
      width,
      height
    )
    const args = JSON.parse(cmd).args
    task.set_args_json(JSON.stringify(args))
    task.set_output_file('thumbnail.jpg')

    const result = await this._runTask(task)
    return result
  }

  /**
   * 解析媒体文件信息
   * @param {File|Blob} mediaFile - 媒体文件
   * @returns {Promise<Object>} - 媒体信息
   */
  async parseMediaInfo(mediaFile) {
    const fileData = await this._readFileAsUint8Array(mediaFile)
    const parser = new Ffmpeg.MediaInfoParser()

    // 这里需要根据实际的 ffprobe 输出格式来 feed
    // 简化处理，返回基本信息
    return {
      duration_sec: 0,
      width: 0,
      height: 0,
      fps: 0,
      bitrate_kbps: 0n,
      video_codec: '',
      audio_codec: '',
      audio_sample_rate: 0,
      audio_channels: 0
    }
  }

  // =====================================================
  // Video Engine 功能
  // =====================================================

  /**
   * 创建时间轴
   * @param {number} fps - 帧率
   * @param {number} width - 画布宽度
   * @param {number} height - 画布高度
   * @returns {VideoEngine.Timeline}
   */
  createTimeline(fps = 30, width = 1920, height = 1080) {
    return new VideoEngine.Timeline(fps, width, height)
  }

  /**
   * 创建 Clip
   * @param {string} id - Clip ID
   * @param {number} timelineStartMs - 时间轴开始时间（毫秒）
   * @param {number} durationMs - 持续时间（毫秒）
   * @param {number} sourceStartMs - 源文件开始时间（毫秒）
   * @param {number} sourceDurationMs - 源文件持续时间（毫秒）
   * @param {string} clipType - Clip 类型 ('video', 'audio', 'image', 'text')
   * @param {string} trackId - 轨道 ID
   * @param {string} fileName - 文件名
   * @returns {VideoEngine.Clip}
   */
  createClip(
    id,
    timelineStartMs,
    durationMs,
    sourceStartMs,
    sourceDurationMs,
    clipType,
    trackId,
    fileName
  ) {
    const typeMap = {
      'video': VideoEngine.ClipType.Video,
      'audio': VideoEngine.ClipType.Audio,
      'image': VideoEngine.ClipType.Image,
      'text': VideoEngine.ClipType.Text
    }

    return new VideoEngine.Clip(
      id,
      timelineStartMs,
      durationMs,
      sourceStartMs,
      sourceDurationMs,
      typeMap[clipType] || VideoEngine.ClipType.Video,
      trackId,
      fileName
    )
  }

  /**
   * 创建帧渲染器
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {VideoEngine.FrameRenderer}
   */
  createFrameRenderer(width, height) {
    return new VideoEngine.FrameRenderer(width, height)
  }

  /**
   * 创建音频混音器
   * @param {number} sampleRate - 采样率
   * @param {number} channels - 声道数
   * @param {number} bufferFrames - 缓冲区帧数
   * @returns {VideoEngine.AudioMixer}
   */
  createAudioMixer(sampleRate = 44100, channels = 2, bufferFrames = 4096) {
    return new VideoEngine.AudioMixer(sampleRate, channels, bufferFrames)
  }

  /**
   * 创建导出配置
   * @param {string} format - 导出格式 ('mp4', 'webm', 'gif', 'mp3', 'wav')
   * @param {string} quality - 质量 ('low', 'medium', 'high', 'ultra')
   * @param {number} fps - 帧率
   * @param {number} startMs - 开始时间（毫秒）
   * @param {number} endMs - 结束时间（毫秒）
   * @returns {VideoEngine.ExportConfig}
   */
  createExportConfig(format, quality, fps, startMs, endMs) {
    const formatMap = {
      'mp4': VideoEngine.ExportFormat.Mp4,
      'webm': VideoEngine.ExportFormat.WebM,
      'gif': VideoEngine.ExportFormat.Gif,
      'mp3': VideoEngine.ExportFormat.Mp3,
      'wav': VideoEngine.ExportFormat.Wav
    }

    const qualityMap = {
      'low': VideoEngine.ExportQuality.Low,
      'medium': VideoEngine.ExportQuality.Medium,
      'high': VideoEngine.ExportQuality.High,
      'ultra': VideoEngine.ExportQuality.Ultra
    }

    return new VideoEngine.ExportConfig(
      formatMap[format] || VideoEngine.ExportFormat.Mp4,
      qualityMap[quality] || VideoEngine.ExportQuality.High,
      fps,
      startMs,
      endMs
    )
  }

  /**
   * 生成波形数据
   * @param {Float32Array} pcmData - PCM 音频数据
   * @param {number} samplesPerPixel - 每像素采样数
   * @param {number} canvasHeight - 画布高度
   * @returns {Float32Array}
   */
  generateWaveform(pcmData, samplesPerPixel, canvasHeight) {
    return VideoEngine.WaveformGenerator.generate_waveform(
      pcmData,
      samplesPerPixel,
      canvasHeight
    )
  }

  /**
   * 应用音频淡入效果
   * @param {Float32Array} pcmData - PCM 数据
   * @param {number} fadeFrames - 淡入帧数
   */
  applyAudioFadeIn(pcmData, fadeFrames) {
    VideoEngine.AudioEffects.fade_in(pcmData, fadeFrames)
  }

  /**
   * 应用音频淡出效果
   * @param {Float32Array} pcmData - PCM 数据
   * @param {number} fadeFrames - 淡出帧数
   */
  applyAudioFadeOut(pcmData, fadeFrames) {
    VideoEngine.AudioEffects.fade_out(pcmData, fadeFrames)
  }

  // =====================================================
  // 内部方法
  // =====================================================

  /**
   * 读取 File/Blob 为 Uint8Array
   */
  async _readFileAsUint8Array(file) {
    const arrayBuffer = await file.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }

  /**
   * 运行 FFmpeg 任务
   */
  async _runTask(task) {
    return new Promise((resolve, reject) => {
      const maxIterations = 10000
      let iterations = 0

      const runLoop = () => {
        iterations++
        if (iterations > maxIterations) {
          reject(new Error('Task timeout'))
          return
        }

        try {
          // 获取下一步消息
          const message = task.next_message()
          
          if (task.state === Ffmpeg.TaskState.Done) {
            // 任务完成，获取输出
            const outputData = task.get_input_file_data(0)
            if (outputData) {
              const blob = new Blob([outputData], { type: 'video/mp4' })
              resolve(blob)
            } else {
              reject(new Error('No output data'))
            }
            return
          }

          if (task.state === Ffmpeg.TaskState.Failed) {
            reject(new Error(task.get_error() || 'Task failed'))
            return
          }

          if (task.state === Ffmpeg.TaskState.Cancelled) {
            reject(new Error('Task cancelled'))
            return
          }

          // 获取进度
          if (this.onProgress) {
            const progressJson = task.progress_json()
            const progress = JSON.parse(progressJson)
            this.onProgress(progress)
          }

          // 模拟异步执行
          setTimeout(runLoop, 10)
        } catch (err) {
          reject(err)
        }
      }

      runLoop()
    })
  }

  /**
   * 清理资源
   */
  cleanup() {
    // WASM 资源清理由 JS 垃圾回收处理
    console.log('[VideoEditorEngine] Cleanup completed')
  }
}

// 导出单例
export const videoEditorEngine = new VideoEditorEngine()

// 导出 FFmpeg 和 VideoEngine 命名空间供高级使用
export { Ffmpeg, VideoEngine }

export default videoEditorEngine