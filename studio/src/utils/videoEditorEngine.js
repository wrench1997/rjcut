/**
 * 数字人 Studio 视频编辑引擎
 * 基于 ffmpeg-bridge 和 video-engine 两个 WASM 模块
 * 
 * - ffmpeg-bridge: FFmpeg 命令执行、转码、裁剪、合并等
 * - video-engine: 时间轴管理、帧渲染、音频混音、导出
 */

import initFfmpeg, * as Ffmpeg from '../../wasm/ffmpeg-bridge/pkg/ffmpeg_bridge.js'
import initVideoEngine, * as VideoEngine from '../../wasm/video-engine/pkg/video_engine.js'
import { videoEditor } from './videoEditor.js'

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
    const args = this._buildTrimArgs(
      'input.mp4',
      'output.mp4',
      startTime,
      duration,
      useStreamCopy,
    )
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
  async mergeVideos(videoFiles, width = 1920, height = 1080, fps = 30, duration = 0) {
    const task = new Ffmpeg.FfmpegTask('merge_' + Date.now(), 0)

    // 添加所有输入文件
    const fileNames = []
    for (let i = 0; i < videoFiles.length; i++) {
      const fileName = `segment_${i}.mp4`
      const fileData = await this._readFileAsUint8Array(videoFiles[i])
      task.add_input_file(fileName, fileData)
      fileNames.push(fileName)
    }

    // 不使用 concat demuxer：各段来自不同裁切/场景编码，原始 PTS 与
    // time_base 可能不同，直接拼接会把中间段跳过或错位。先把每路 PTS
    // 归零，再用 concat 滤镜按画面与音频一起拼接。
    const normalizedInputs = fileNames.map((_, index) =>
      `[${index}:v:0]setpts=PTS-STARTPTS[v${index}];[${index}:a:0]asetpts=PTS-STARTPTS[a${index}]`,
    ).join(';')
    const concatInputs = fileNames.map((_, index) => `[v${index}][a${index}]`).join('')
    const args = [
      ...fileNames.flatMap((fileName) => ['-i', fileName]),
      '-filter_complex', `${normalizedInputs};${concatInputs}concat=n=${fileNames.length}:v=1:a=1[outv][outa]`,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264', ...this._encodingArgs(),
      '-pix_fmt', 'yuv420p', '-r', String(fps),
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
      ...(Number.isFinite(Number(duration)) && Number(duration) > 0 ? ['-t', String(duration)] : []),
      '-y', 'output.mp4',
    ]
    task.set_args_json(JSON.stringify(args))
    task.set_output_file('output.mp4')

    const result = await this._runTask(task)
    return result
  }

  // =====================================================
  // 数字人视频分割与合成功能 (对应 cut_transition.py 和 lip_sync.py)
  // =====================================================

  /**
   * 切割视频片段（对应 cut_transition 的切割功能）
   * @param {File|Blob} videoFile - 输入视频
   * @param {Array<{start: number, end: number, label?: string}>} segments - 要保留的时间段（秒）
   * @param {number} width - 输出宽度
   * @param {number} height - 输出高度
   * @param {number} fps - 输出帧率
   * @returns {Promise<Array<Blob>>} - 切割后的视频片段数组
   */
  async cutVideoSegments(videoFile, segments, width = 1920, height = 1080, fps = 30) {
    const results = []
    const fileData = await this._readFileAsUint8Array(videoFile)

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const startTime = seg.start
      const duration = seg.end - seg.start
      
      const task = new Ffmpeg.FfmpegTask(`cut_${i}_${Date.now()}`, 0)
      task.add_input_file('input.mp4', fileData)

      const args = this._buildTrimArgs(
        'input.mp4',
        `output_${i}.mp4`,
        startTime,
        duration,
        false,
        true,
      )
      task.set_args_json(JSON.stringify(args))
      task.set_output_file(`output_${i}.mp4`)

      const result = await this._runTask(task)
      results.push({
        index: i,
        label: seg.label || `segment_${i}`,
        start: startTime,
        end: seg.end,
        duration: duration,
        blob: result
      })
    }

    return results
  }

  /**
   * 从 timeline.json 合成视频（对应 lip_sync.py 的 compose_from_timeline）
   * @param {Object} timeline - timeline.json 内容
   * @param {Array<File|Blob>} partFiles - 切割后的视频片段
   * @param {Object<string, File|Blob>} sceneFiles - 场景文件映射 {scene_file: File}
   * @param {Object} options - 选项
   * @returns {Promise<Blob>} - 合成后的视频
   */
  async composeFromTimeline(timeline, partFiles, sceneFiles = {}, options = {}) {
    const {
      useTransitions = false,
      transitionType = 'fade',
      transitionDuration = 0.5,
      resyncSubtitle = true,
      bgmFile = null,
      bgmVolume = 0.3,
      originalVolume = 1.0
    } = options
    this.renderQuality = options.renderQuality || 'balanced'

    const segments = timeline.segments || []
    const videoInfo = timeline.video_info || {}
    const width = videoInfo.width || 1920
    const height = videoInfo.height || 1080
    const fps = videoInfo.fps || 30

    console.log('[VideoEditorEngine] 开始从 timeline 合成视频', {
      segmentCount: segments.length,
      partFileCount: partFiles.length,
      sceneFileCount: Object.keys(sceneFiles).length
    })

    // 1. 准备每个 segment 的视频片段
    const renderClips = []
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const partFile = partFiles[i]
      
      if (!partFile) {
        throw new Error(`缺少第 ${i + 1} 个视频片段`)
      }

      if (seg.type === 'human') {
        // human 类型：直接使用 part 文件
        renderClips.push(partFile)
      } else if (seg.type === 'scene') {
        // scene 类型：用 scene_file 替换画面，保留 part 音频
        const sceneFile = sceneFiles[seg.scene_vfs_path] || sceneFiles[seg.scene_file]
        if (!sceneFile) {
          throw new Error(`缺少场景文件：${seg.scene_file}`)
        }
        
        // 将 scene 视频与 part 音频合成
        const sceneClip = await this._composeSceneWithAudio(
          sceneFile,
          partFile,
          seg.duration,
          width,
          height,
          fps
        )
        renderClips.push(sceneClip)
      } else {
        throw new Error(`不支持的 segment 类型：${seg.type}`)
      }
    }

    // 2. 合并所有片段
    let mergedVideo
    if (useTransitions && renderClips.length > 1) {
      mergedVideo = await this._mergeWithTransitions(
        renderClips,
        transitionType,
        transitionDuration,
        width,
        height,
        fps
      )
    } else {
      const timelineDuration = segments.reduce((max, segment) => {
        const end = Number(segment.end ?? Number(segment.end_ms) / 1000)
        return Number.isFinite(end) ? Math.max(max, end) : max
      }, 0)
      mergedVideo = await this.mergeVideos(renderClips, width, height, fps, timelineDuration)
    }

    // 3. 添加背景音乐（如果提供）
    if (bgmFile) {
      return await this._addBackgroundMusic(
        mergedVideo,
        bgmFile,
        bgmVolume,
        originalVolume
      )
    }

    return mergedVideo
  }

  /**
   * 将场景视频与音频合成（用于 scene 类型 segment）
   */
  async _composeSceneWithAudio(sceneFile, audioPartFile, duration, width, height, fps) {
    const task = new Ffmpeg.FfmpegTask('scene_compose_' + Date.now(), 0)
    
    const sceneData = await this._readFileAsUint8Array(sceneFile)
    const audioData = await this._readFileAsUint8Array(audioPartFile)
    
    task.add_input_file('scene.mp4', sceneData)
    task.add_input_file('audio.mp4', audioData)

    // 构建命令：循环场景视频，替换音频
    const args = [
      '-stream_loop', '-1',
      '-i', 'scene.mp4',
      '-i', 'audio.mp4',
      '-t', duration.toFixed(4),
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${fps},setpts=N/(${fps}*TB),format=yuv420p`,
      '-map', '0:v',
      '-map', '1:a',
      '-c:v', 'libx264', ...this._encodingArgs(),
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-ac', '2',
      '-shortest',
      '-movflags', '+faststart',
      'output.mp4'
    ]

    // ffmpeg-bridge 的 Rust 侧反序列化目标是 Vec<String>，必须传纯数组。
    // 传 { args } 会在执行场景替换时变成无效参数，最终报
    // "expected a string argument, found undefined"。
    task.set_args_json(JSON.stringify(args))
    task.set_output_file('output.mp4')

    return await this._runTask(task)
  }

  /**
   * 带转场效果合并视频
   */
  async _mergeWithTransitions(videoClips, transitionType, transitionDuration, width, height, fps) {
    const task = new Ffmpeg.FfmpegTask('merge_xfade_' + Date.now(), 0)
    
    // 添加所有输入文件
    for (let i = 0; i < videoClips.length; i++) {
      const fileData = await this._readFileAsUint8Array(videoClips[i])
      task.add_input_file(`clip_${i}.mp4`, fileData)
    }

    // 构建 xfades 命令
    const args = this._buildXfadeArgs(
      videoClips.length,
      transitionType,
      transitionDuration,
      width,
      height,
      fps
    )

    task.set_args_json(JSON.stringify(args))
    task.set_output_file('output.mp4')

    return await this._runTask(task)
  }

  /**
   * 构建 xfades 转场命令参数
   */
  _buildXfadeArgs(clipCount, transitionType, td, width, height, fps) {
    // 旧实现把 concat 固定写成 n=2，场景超过两个时后续片段会全部丢失。
    // 当前先使用稳定的全量 hard-cut concat；transitionType/td 保留给后续真正 xfade。
    const args = []
    for (let i = 0; i < clipCount; i += 1) {
      args.push('-i', `clip_${i}.mp4`)
    }

    const normalizedInputs = Array.from({ length: clipCount }, (_, index) =>
      `[${index}:v:0]setpts=PTS-STARTPTS[v${index}];[${index}:a:0]asetpts=PTS-STARTPTS[a${index}]`,
    ).join(';')
    const concatInputs = Array.from({ length: clipCount }, (_, index) => `[v${index}][a${index}]`).join('')
    args.push(
      '-filter_complex',
      `${normalizedInputs};${concatInputs}concat=n=${clipCount}:v=1:a=1[outv][outa]`,
      '-map', '[outv]',
      '-map', '[outa]',
      '-c:v', 'libx264', ...this._encodingArgs(),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      'output.mp4',
    )
    return args
  }

  /**
   * 添加背景音乐
   */
  async _addBackgroundMusic(videoFile, bgmFile, bgmVolume = 0.3, originalVolume = 1.0) {
    const task = new Ffmpeg.FfmpegTask('add_bgm_' + Date.now(), 0)
    
    const videoData = await this._readFileAsUint8Array(videoFile)
    const bgmData = await this._readFileAsUint8Array(bgmFile)
    
    task.add_input_file('video.mp4', videoData)
    task.add_input_file('bgm.mp3', bgmData)

    // 构建混音命令
    const args = [
      '-i', 'video.mp4',
      '-i', 'bgm.mp3',
      '-filter_complex', `[0:a]volume=${originalVolume}[orig];[1:a]volume=${bgmVolume}[bgm];[orig][bgm]amix=inputs=2:duration=first:dropout_transition=3[outa]`,
      '-map', '0:v',
      '-map', '[outa]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      'output.mp4'
    ]

    task.set_args_json(JSON.stringify(args))
    task.set_output_file('output.mp4')

    return await this._runTask(task)
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
   * 构建裁切参数。
   * build_trim_command 当前返回的是 FfmpegCommand 描述对象，和其他
   * build_*_command 返回的 { args } 包装格式不一致；直接读取 .args 会得到
   * undefined，并在 wasm-bindgen 边界报 "expected a string argument"。
   */
  _buildTrimArgs(inputName, outputName, startTime, duration, useStreamCopy = false, loopInput = false) {
    const start = Number(startTime)
    const length = Number(duration)
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(length) || length <= 0) {
      throw new Error(`无效的裁切范围：${startTime} - ${duration}`)
    }

    return [
      ...(loopInput ? ['-stream_loop', '-1'] : []),
      '-ss', start.toFixed(6),
      '-i', String(inputName),
      '-t', length.toFixed(6),
      '-c:v', useStreamCopy ? 'copy' : 'libx264',
      ...(useStreamCopy ? [] : this._encodingArgs()),
      '-c:a', useStreamCopy ? 'copy' : 'aac',
      '-movflags', '+faststart',
      '-avoid_negative_ts', 'make_zero',
      '-y', String(outputName),
    ]
  }

  _encodingArgs() {
    const profiles = {
      performance: ['-preset', 'ultrafast', '-crf', '28'],
      balanced: ['-preset', 'veryfast', '-crf', '23'],
      quality: ['-preset', 'medium', '-crf', '18'],
    }
    return profiles[this.renderQuality] || profiles.balanced
  }

  /**
   * 运行 FFmpeg 任务
   */
  async _runTask(task) {
    // FfmpegTask 只负责生成状态机消息；之前这里未实际派发消息给 Worker，
    // 导致任务永远停在 Initializing，最终误报 Task timeout。
    await videoEditor.load()
    let outputData = null
    let guard = 0

    while (task.state !== Ffmpeg.TaskState.Done) {
      if (task.state === Ffmpeg.TaskState.Failed) throw new Error(task.get_error() || 'FFmpeg 执行失败')
      if (task.state === Ffmpeg.TaskState.Cancelled) throw new Error('FFmpeg 任务已取消')
      if (++guard > 128) throw new Error('FFmpeg 状态机异常，未能完成任务')

      const rawMessage = task.next_message()
      if (!rawMessage) throw new Error('FFmpeg 状态机等待了未处理的响应')
      const message = JSON.parse(rawMessage)
      const payload = message.payload || {}

      if (message.type === 'init') {
        task.handle_message(JSON.stringify({ type: 'ready' }))
      } else if (message.type === 'write_file') {
        const data = task.get_input_file_data(payload.file_index)
        if (!(data instanceof Uint8Array)) throw new Error(`FFmpeg 输入文件读取失败：${payload.name}`)
        await videoEditor.writeFile(payload.name, data)
        task.handle_message(JSON.stringify({ type: 'file_written', payload: { name: payload.name } }))
      } else if (message.type === 'exec') {
        const exitCode = await videoEditor.exec(payload.args)
        task.handle_message(JSON.stringify({ type: 'exec_done', payload: { exit_code: exitCode } }))
      } else if (message.type === 'read_file') {
        outputData = await videoEditor.readFile(payload.name, 'uint8array')
        if (!(outputData instanceof Uint8Array) || outputData.length === 0) {
          throw new Error(`FFmpeg 未生成输出文件：${payload.name}`)
        }
        task.handle_message(JSON.stringify({ type: 'file_data', payload: { name: payload.name, size: outputData.length } }))
      } else if (message.type === 'delete_files') {
        await Promise.all((payload.names || []).map((name) => videoEditor.deleteFile(name)))
      } else {
        throw new Error(`不支持的 FFmpeg 状态机消息：${message.type}`)
      }

      if (this.onProgress) {
        const progress = JSON.parse(task.progress_json())
        this.onProgress(progress.percent ? progress.percent / 100 : 0)
      }
    }

    if (!(outputData instanceof Uint8Array) || outputData.length === 0) {
      throw new Error('FFmpeg 未返回输出数据')
    }
    return new Blob([outputData], { type: 'video/mp4' })
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

export default videoEditorEngine// =====================================================
// 后端 API 辅助函数（字幕识别等）
// =====================================================

import { getApiKey, getBaseUrl } from '../api/api'

/**
 * 调用后端字幕识别 API
 * @param {string} videoUrl - 视频 URL
 * @param {Object} options - 选项
 * @returns {Promise<Object>} - 识别结果 { segments, text, language, duration }
 */
export async function transcribeVideo(videoUrl, options = {}) {
  const {
    modelSize = 'medium',
    language = 'zh',
    device = 'cuda',
    apiKey = getApiKey(),
    baseUrl = getBaseUrl()
  } = options
  
  const response = await fetch(`${baseUrl}/v1/dh/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {})
    },
    body: JSON.stringify({
      video_url: videoUrl,
      model_size: modelSize,
      language: language,
      device: device
    })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '识别失败' }))
    throw new Error(error.message || error.detail || '字幕识别失败')
  }
  
  const result = await response.json()
  
  if (result.code !== 0) {
    throw new Error(result.message || '字幕识别失败')
  }
  
  return result.data
}
