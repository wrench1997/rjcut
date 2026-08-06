/**
 * 共享的字幕配置加载与渲染样式计算工具。
 *
 * 高级剪辑（AdvancedVideoEditor / VideoPreview / ExportPanelVFS）和模板混剪
 * （GlobalParamsVisualEditor / useBatchProcessStore / electron nativeCompose）原本
 * 各自硬编码了不同的默认值，导致：
 *   1. 传统剪辑预览 ↔ 成片位置/字号不一致；
 *   2. 传统剪辑 ↔ 模板混剪字幕样式不一致；
 *   3. 用户在 GlobalParamsVisualEditor 调整后，传统剪辑完全不会跟随。
 *
 * 本工具对外只暴露一组数据：
 *   - DEFAULT_SUBTITLE_CONFIG：唯一权威默认值，与 GlobalParamsVisualEditor.DEFAULT_CONFIG.subtitle
 *     保持完全一致。任何地方调整时务必同时改这两个文件。
 *   - loadSubtitleConfig()：从 localStorage 读取用户上次保存的设置，与默认值合并，
 *     归一化后返回。与 BatchProcessor / GlobalParamsVisualEditor 的存储策略一致。
 *   - computeSubtitlePreviewStyle(subtitle, frameSize)：根据字幕配置和预览画布尺寸
 *     计算 React inline style。预览与 nativeCompose 使用的同一套坐标换算公式（\an5 +
 *     \pos 等价于 CSS translate(-50%,-50%) + top/left 百分比），保证预览 ↔ 成片一致。
 *
 * 注意：DEFAULT_SUBTITLE_CONFIG 与 GlobalParamsVisualEditor.DEFAULT_CONFIG.subtitle
 * 字段必须保持一一对应；新增字段时请同时在两处更新。
 */

const DEFAULT_SUBTITLE_CONFIG = {
  effect: 'ad',
  font_family: 'Microsoft YaHei',
  font_weight: 'bold',
  font_size: 68,
  position: 'bottom',
  x_offset: 0,
  y_offset: -80,
  color: '#FFFFFF',
  highlight_color: '#FFD400',
  stroke_color: '#000000',
  stroke_width: 3,
  background_color: 'rgba(0, 0, 0, 0.4)',
  background_padding: 8,
  background_radius: 8,
  line_spacing: 1.3,
  max_width: 95,
  max_chars_per_line: 15,
  word_by_word_highlight: true,
  background_border_width: 0,
  background_border_color: '#FFFFFF',
}

const STORAGE_KEY = 'rjcut_global_params_v1'

function normalizeSubtitle(value) {
  const merged = { ...DEFAULT_SUBTITLE_CONFIG, ...(value || {}) }
  return {
    ...merged,
    font_family: merged.font_family || 'Microsoft YaHei',
    font_weight: merged.font_weight || 'bold',
    highlight_color: merged.highlight_color || '#FFD400',
    max_chars_per_line: Math.max(8, Math.min(15, Number(merged.max_chars_per_line) || 15)),
  }
}

/**
 * 读取当前生效的字幕配置。
 * - 优先取 localStorage['rjcut_global_params_v1'].subtitle
 * - 缺字段时回退到 DEFAULT_SUBTITLE_CONFIG
 * - SSR / 测试环境下 localStorage 不存在时直接返回默认值
 */
export function loadSubtitleConfig() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_SUBTITLE_CONFIG }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SUBTITLE_CONFIG }
    const parsed = JSON.parse(raw)
    return normalizeSubtitle(parsed?.subtitle)
  } catch (error) {
    console.warn('[subtitleConfig] 读取 localStorage 失败，回退默认值:', error)
    return { ...DEFAULT_SUBTITLE_CONFIG }
  }
}

/**
 * 计算字幕在 CSS 坐标系中的位置百分比。
 * 与 electron/main.js 的 getSubtitleAnchor 保持同一公式：
 *   baseYPercent = position === 'top' ? 25 : 50
 *   xPercent    = 50 + x_offset / 2
 *   yPercent    = baseYPercent - y_offset / 2
 *
 * 配合 CSS translate(-50%, -50%)，效果等同于 ASS \an5 + \pos。
 */
function computeSubtitlePositionPercent(subtitle) {
  const { position, x_offset, y_offset } = subtitle
  const baseXPercent = 50
  let baseYPercent = 50
  if (position === 'top') baseYPercent = 25
  else if (position === 'center') baseYPercent = 50
  const leftPercent = baseXPercent + (Number(x_offset) || 0) / 2
  const topPercent = baseYPercent - (Number(y_offset) || 0) / 2
  return {
    left: `${Math.min(100, Math.max(0, leftPercent))}%`,
    top: `${Math.min(100, Math.max(0, topPercent))}%`,
  }
}

/**
 * 把"配置里的像素值"按当前预览画布尺寸缩放到屏幕像素。
 *
 * 默认值（font_size=68 等）是按 1080x1920（9:16 竖屏）成片坐标系写的。
 * 预览画布通常更小（CSS 像素），需要按比例缩放才能保持视觉一致。
 * 这里用 frame 高度作为基准，与 GlobalParamsVisualEditor 的 9/16 缩放策略一致。
 */
function scaleSubtitleMetrics(subtitle, frameSize) {
  const { height } = frameSize || {}
  if (!height || height <= 0) {
    return {
      fontSizePx: subtitle.font_size,
      strokeWidthPx: subtitle.stroke_width,
      paddingX: subtitle.background_padding,
      paddingY: subtitle.background_padding,
      radiusPx: subtitle.background_radius,
      borderWidthPx: subtitle.background_border_width || 0,
    }
  }
  const scale = height / 1920
  return {
    fontSizePx: Math.max(11, subtitle.font_size * scale),
    strokeWidthPx: Math.max(0, subtitle.stroke_width * scale * 1.5),
    paddingX: subtitle.background_padding * scale * 2.5,
    paddingY: subtitle.background_padding * scale * 1.2,
    radiusPx: subtitle.background_radius * scale * 1.2,
    borderWidthPx: (subtitle.background_border_width || 0) * scale * 1.5,
  }
}

function buildTextShadow(strokeColor, strokeWidthPx) {
  if (!strokeWidthPx || strokeColor === 'transparent' || strokeColor === '') return 'none'
  const w = strokeWidthPx
  return (
    `-${w}px -${w}px 0 ${strokeColor}, ` +
    `${w}px -${w}px 0 ${strokeColor}, ` +
    `-${w}px ${w}px 0 ${strokeColor}, ` +
    `${w}px ${w}px 0 ${strokeColor}, ` +
    `0 -${w}px 0 ${strokeColor}, ` +
    `0 ${w}px 0 ${strokeColor}, ` +
    `-${w}px 0 0 ${strokeColor}, ` +
    `${w}px 0 0 ${strokeColor}`
  )
}

/**
 * 返回 React inline style 对象。预览层只需把 style 套在字幕容器上即可。
 *
 * @param {object} subtitle 归一化后的字幕配置
 * @param {{width:number, height:number}} frameSize 预览画布的 CSS 像素尺寸
 */
export function computeSubtitlePreviewStyle(subtitle, frameSize) {
  const safe = subtitle || DEFAULT_SUBTITLE_CONFIG
  const position = computeSubtitlePositionPercent(safe)
  const metrics = scaleSubtitleMetrics(safe, frameSize)
  const hasBackground = safe.background_color && safe.background_color !== 'transparent'
  return {
    position: 'absolute',
    left: position.left,
    top: position.top,
    transform: 'translate(-50%, -50%)',
    color: safe.color,
    fontSize: `${metrics.fontSizePx}px`,
    fontFamily: safe.font_family,
    fontWeight: safe.font_weight,
    lineHeight: safe.line_spacing,
    letterSpacing: '0.02em',
    textAlign: 'center',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 4,
    maxWidth: `${Math.max(20, Math.min(100, Number(safe.max_width) || 95))}%`,
    backgroundColor: hasBackground ? safe.background_color : 'transparent',
    padding: hasBackground ? `${metrics.paddingY}px ${metrics.paddingX}px` : 0,
    borderRadius: hasBackground ? `${metrics.radiusPx}px` : 0,
    border: hasBackground && metrics.borderWidthPx > 0
      ? `${metrics.borderWidthPx}px solid ${safe.background_border_color || '#FFFFFF'}`
      : 'none',
    textShadow: buildTextShadow(safe.stroke_color, metrics.strokeWidthPx),
  }
}

/**
 * 高亮字（被 word_by_word_highlight 标记为 active 的字）的样式覆盖。
 * 预览层渲染时叠加到对应 <span> 上。
 */
export function getActiveSubtitleStyle(subtitle, frameSize) {
  const safe = subtitle || DEFAULT_SUBTITLE_CONFIG
  const metrics = scaleSubtitleMetrics(safe, frameSize)
  return {
    color: safe.highlight_color,
    textShadow: buildTextShadow(safe.stroke_color, metrics.strokeWidthPx),
  }
}

/**
 * 把一段字幕文本按 max_chars_per_line 切成多行。
 * 预览层在渲染时用本函数的结果切 <br/>。
 * 同样切分逻辑也会被 nativeCompose 通过 wrapSubtitleText 复用（见 electron/main.js）。
 */
export function splitSubtitleIntoLines(chars, maxCharsPerLine) {
  const limit = Math.max(8, Math.min(15, Number(maxCharsPerLine) || 15))
  const text = (chars || []).map((c) => c.char ?? c.text ?? '').join('')
  const lines = []
  for (let i = 0; i < text.length; i += limit) {
    lines.push({ start: i, end: Math.min(text.length, i + limit) })
  }
  return lines
}

/**
 * 读取当前生效的全部全局参数（localStorage['rjcut_global_params_v1']）。
 * 返回对象可能包含 pipeline / subtitle（模板混剪字体配置）/ audio / output 等字段。
 */
export function readGlobalParams() {
  if (typeof window === 'undefined' || !window.localStorage) return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch (error) {
    console.warn('[subtitleConfig] 读取全局参数失败:', error)
    return {}
  }
}

/**
 * 把（从成片旁车 JSON 还原的）全局参数整体写回 rjcut_global_params_v1。
 * 与 GlobalParamsVisualEditor 共用同一份存储：二次加工进入高级剪辑时整体还原，
 * 使预览与再导出沿用同一套全局参数（含模板混剪字体配置、音频、输出等）。
 *
 * @param {object} globalParams 旁车 JSON 里存的完整全局参数对象
 */
export function persistGlobalParams(globalParams) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const parsed = globalParams && typeof globalParams === 'object' ? { ...globalParams } : {}
    if (parsed.subtitle) parsed.subtitle = normalizeSubtitle(parsed.subtitle)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  } catch (error) {
    console.warn('[subtitleConfig] 写回全局参数失败:', error)
  }
}

export { DEFAULT_SUBTITLE_CONFIG, STORAGE_KEY }
