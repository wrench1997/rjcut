/**
 * 前端字幕烧录模块
 * 使用 Canvas 2D API 在视频帧上渲染字幕，实现前端字幕烧录
 * 
 * 功能：
 * - 逐字高亮（卡拉 OK 效果）
 * - 多种字幕样式（描边、背景、阴影）
 * - 支持 ASS 风格定位
 * - 与后端 burn_whisper_subtitle 兼容的参数格式
 */

/**
 * 字幕渲染器配置
 */
export class SubtitleRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    
    // 默认配置
    this.config = {
      fontSize: options.fontSize || 72,
      fontFamily: options.fontFamily || 'Arial, sans-serif',
      color: options.color || '#FFFF00',
      strokeColor: options.strokeColor || '#000000',
      strokeWidth: options.strokeWidth || 3,
      backgroundColor: options.backgroundColor || null,
      backgroundPadding: options.backgroundPadding || 8,
      backgroundRadius: options.backgroundRadius || 8,
      alignment: options.alignment || 2, // 1=左下，2=中下，3=右下，4=左中，5=正中，6=右中，7=左上，8=中上，9=右上
      marginV: options.marginV || 50,    // 垂直边距（从底部/顶部的距离）
      marginL: options.marginL || 10,    // 左边距
      marginR: options.marginR || 10,    // 右边距
      maxCharsPerLine: options.maxCharsPerLine || 18,
      wordByWordHighlight: options.wordByWordHighlight || true,
    }
    
    this.canvas.width = options.width || 1920
    this.canvas.height = options.height || 1080
  }
  
  /**
   * 渲染字幕帧
   * @param {number} currentTime - 当前时间（秒）
   * @param {Array} segments - 字幕片段数组（whisper 格式）
   */
  renderFrame(currentTime, segments) {
    const ctx = this.ctx
    const { width, height } = this.canvas
    
    // 清空画布
    ctx.clearRect(0, 0, width, height)
    
    // 查找当前时间对应的字幕片段
    const activeSegment = segments.find(seg => 
      currentTime >= seg.start && currentTime <= seg.end
    )
    
    if (!activeSegment) {
      return // 没有活跃字幕，不渲染
    }
    
    // 计算文字位置
    const position = this.calculatePosition(activeSegment)
    
    // 渲染字幕
    this.renderSubtitleText(activeSegment, currentTime, position)
  }
  
  /**
   * 计算字幕位置
   */
  calculatePosition(segment) {
    const { width, height } = this.canvas
    const { alignment, marginV, marginL, marginR } = this.config
    
    // 根据 alignment 计算基准位置
    let x, y
    
    // 水平位置
    if (alignment === 1 || alignment === 4 || alignment === 7) {
      x = marginL // 左对齐
    } else if (alignment === 2 || alignment === 5 || alignment === 8) {
      x = width / 2 // 居中
    } else {
      x = width - marginR // 右对齐
    }
    
    // 垂直位置
    if (alignment === 1 || alignment === 2 || alignment === 3) {
      y = height - marginV // 底部
    } else if (alignment === 4 || alignment === 5 || alignment === 6) {
      y = height / 2 // 中间
    } else {
      y = marginV // 顶部
    }
    
    return { x, y, align: this.getAlignFromAlignment(alignment) }
  }
  
  /**
   * 从 alignment 获取 canvas textAlign
   */
  getAlignFromAlignment(alignment) {
    if (alignment === 1 || alignment === 4 || alignment === 7) return 'left'
    if (alignment === 3 || alignment === 6 || alignment === 9) return 'right'
    return 'center'
  }
  
  /**
   * 渲染字幕文本
   */
  renderSubtitleText(segment, currentTime, position) {
    const ctx = this.ctx
    const { wordByWordHighlight } = this.config
    const { x, y, align } = position
    
    ctx.textAlign = align
    ctx.textBaseline = 'bottom'
    
    if (wordByWordHighlight && segment.words && segment.words.length > 0) {
      // 逐字高亮模式
      this.renderWordByWord(segment, currentTime, x, y)
    } else {
      // 整句渲染
      this.renderFullText(segment.text, x, y)
    }
  }
  
  /**
   * 逐字高亮渲染
   */
  renderWordByWord(segment, currentTime, baseX, baseY) {
    const words = segment.words || []
    const { fontSize, color, strokeColor, strokeWidth, backgroundColor } = this.config
    
    // 找到当前活跃的字
    let activeWordIndex = -1
    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      if (currentTime >= word.start && currentTime <= word.end) {
        activeWordIndex = i
        break
      }
    }
    
    // 计算每行文字
    const lines = this.wrapText(words.map(w => w.text).join(''))
    
    let currentY = baseY - (lines.length - 1) * (fontSize * 1.2)
    
    lines.forEach((line, lineIndex) => {
      const wordsInLine = line.split(' ')
      let currentX = baseX
      
      // 如果是 center 对齐，需要计算偏移
      if (this.config.textAlign === 'center') {
        const lineWidth = this.measureText(line)
        currentX = baseX - lineWidth / 2
      } else if (this.config.textAlign === 'right') {
        const lineWidth = this.measureText(line)
        currentX = baseX - lineWidth
      }
      
      wordsInLine.forEach((wordText, wordIndex) => {
        const globalWordIndex = words.findIndex(w => w.text === wordText)
        const isActive = globalWordIndex === activeWordIndex
        
        // 绘制背景（如果需要）
        if (backgroundColor && isActive) {
          const textWidth = this.measureText(wordText)
          this.drawBackground(
            currentX - this.config.backgroundPadding,
            currentY - fontSize,
            textWidth + this.config.backgroundPadding * 2,
            fontSize + this.config.backgroundPadding * 2
          )
        }
        
        // 绘制文字
        ctx.font = `${fontSize}px ${this.config.fontFamily}`
        
        if (isActive) {
          // 高亮颜色
          ctx.fillStyle = '#00FFFF' // 青色高亮
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = strokeWidth
          ctx.strokeText(wordText, currentX, currentY)
          ctx.fillText(wordText, currentX, currentY)
        } else {
          // 普通颜色
          ctx.fillStyle = color
          ctx.strokeStyle = strokeColor
          ctx.lineWidth = strokeWidth
          ctx.strokeText(wordText, currentX, currentY)
          ctx.fillText(wordText, currentX, currentY)
        }
        
        // 更新 X 位置
        currentX += this.measureText(wordText + ' ')
      })
      
      currentY += fontSize * 1.2
    })
  }
  
  /**
   * 整句渲染
   */
  renderFullText(text, x, y) {
    const ctx = this.ctx
    const { fontSize, color, strokeColor, strokeWidth, backgroundColor } = this.config
    
    const lines = this.wrapText(text)
    
    let currentY = y - (lines.length - 1) * (fontSize * 1.2)
    
    lines.forEach(line => {
      // 绘制背景（如果需要）
      if (backgroundColor) {
        const textWidth = this.measureText(line)
        this.drawBackground(
          x - textWidth / 2 - this.config.backgroundPadding,
          currentY - fontSize,
          textWidth + this.config.backgroundPadding * 2,
          fontSize + this.config.backgroundPadding * 2
        )
      }
      
      // 绘制文字
      ctx.font = `${fontSize}px ${this.config.fontFamily}`
      ctx.fillStyle = color
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeWidth
      
      ctx.strokeText(line, x, currentY)
      ctx.fillText(line, x, currentY)
      
      currentY += fontSize * 1.2
    })
  }
  
  /**
   * 绘制背景
   */
  drawBackground(x, y, width, height) {
    const ctx = this.ctx
    const { backgroundColor, backgroundRadius } = this.config
    
    ctx.fillStyle = backgroundColor
    ctx.beginPath()
    
    if (backgroundRadius > 0) {
      // 圆角矩形
      ctx.roundRect(x, y, width, height, backgroundRadius)
    } else {
      ctx.rect(x, y, width, height)
    }
    
    ctx.fill()
  }
  
  /**
   * 测量文本宽度
   */
  measureText(text) {
    return this.ctx.measureText(text).width
  }
  
  /**
   * 文本换行
   */
  wrapText(text) {
    const { maxCharsPerLine } = this.config
    const lines = []
    
    // 简单按字符数换行（可以优化为按单词换行）
    for (let i = 0; i < text.length; i += maxCharsPerLine) {
      lines.push(text.slice(i, i + maxCharsPerLine))
    }
    
    return lines
  }
}

/**
 * 视频字幕烧录器
 * 将字幕渲染到视频的每一帧
 */
export class VideoSubtitleBurner {
  constructor(videoElement, canvasElement, options = {}) {
    this.video = videoElement
    this.canvas = canvasElement
    this.renderer = new SubtitleRenderer(canvasElement, options)
    this.animationId = null
    this.isBurning = false
  }
  
  /**
   * 开始烧录
   * @param {Array} segments - 字幕片段数组
   */
  start(segments) {
    if (this.isBurning) return
    
    this.isBurning = true
    this.burnLoop(segments)
  }
  
  /**
   * 停止烧录
   */
  stop() {
    this.isBurning = false
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
  
  /**
   * 烧录循环
   */
  burnLoop(segments) {
    if (!this.isBurning) return
    
    const currentTime = this.video.currentTime
    this.renderer.renderFrame(currentTime, segments)
    
    this.animationId = requestAnimationFrame(() => this.burnLoop(segments))
  }
  
  /**
   * 捕获当前帧（用于导出）
   */
  captureFrame() {
    return this.canvas.toDataURL('image/png')
  }
}

/**
 * 使用 Canvas 和 MediaRecorder 录制带字幕的视频
 * 
 * @param {HTMLVideoElement} videoElement - 视频元素
 * @param {HTMLCanvasElement} canvasElement - 画布元素
 * @param {Array} segments - 字幕片段
 * @param {Object} options - 烧录配置
 * @returns {Promise<Blob>} - 录制的视频 Blob
 */
export async function burnSubtitlesToVideo(
  videoElement,
  canvasElement,
  segments,
  options = {}
) {
  return new Promise((resolve, reject) => {
    const burner = new VideoSubtitleBurner(videoElement, canvasElement, options)
    
    // 创建 Canvas 流
    const canvasStream = canvasElement.captureStream(30) // 30 FPS
    
    // 合并视频和 Canvas 流
    const videoTrack = canvasStream.getVideoTracks()[0]
    const audioTrack = videoElement.captureStream().getAudioTracks()[0]
    
    const combinedStream = new MediaStream([videoTrack, audioTrack].filter(Boolean))
    
    // 使用 MediaRecorder 录制
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=h264') 
      ? 'video/webm;codecs=h264' 
      : 'video/webm'
    
    const recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: options.videoBitsPerSecond || 5000000, // 5 Mbps
    })
    
    const chunks = []
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }
    
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })
      burner.stop()
      resolve(blob)
    }
    
    recorder.onerror = (e) => {
      burner.stop()
      reject(e.error)
    }
    
    // 开始播放和录制
    videoElement.onplay = () => {
      recorder.start()
    }
    
    videoElement.onended = () => {
      recorder.stop()
    }
    
    // 启动烧录
    burner.start(segments)
    
    // 播放视频
    videoElement.play().catch(reject)
  })
}