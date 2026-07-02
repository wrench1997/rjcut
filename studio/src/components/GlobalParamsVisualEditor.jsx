import React, { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { 
  Type, 
  Move, 
  Maximize, 
  Palette, 
  RotateCcw, 
  Eye, 
  EyeOff, 
  Grid, 
  Plus, 
  Minus, 
  Music, 
  Sliders, 
  Copy, 
  Check, 
  Volume2, 
  Sparkles, 
  Play, 
  Pause,
  RefreshCw,
  Film,
  Zap,
  Cpu,
  AlignLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// 测试音源数据（本地文件，无需联网）
const TEST_BGM_TRACKS = [
  {
    id: 'lofi',
    name: '温馨 Lofi',
    url: '/audio/lofi.mp3',
    genre: 'Lofi / Chill',
  },
  {
    id: 'tech',
    name: '科技电子',
    url: '/audio/tech.mp3',
    genre: 'Synthwave',
  },
  {
    id: 'epic',
    name: '史诗交响',
    url: '/audio/epic.mp3',
    genre: 'Orchestral',
  },
  {
    id: 'ambient',
    name: '空灵极简',
    url: '/audio/ambient.mp3',
    genre: 'Ambient',
  },
  {
    id: 'jazz',
    name: '休闲爵士',
    url: '/audio/jazz.mp3',
    genre: 'Jazz-funk',
  },
];

// Configuration shape documentation (for reference only - JS doesn't use interfaces)
/**
 * @typedef {Object} SubtitleConfig
 * @property {string} effect
 * @property {number} font_size
 * @property {'top' | 'center' | 'bottom' | 'custom'} position
 * @property {number} x_offset - Scale: -100 to 100
 * @property {number} y_offset - Scale: -100 to 100 (positive is upwards, negative is downwards)
 * @property {string} color
 * @property {string} stroke_color
 * @property {number} stroke_width
 * @property {string} background_color
 * @property {number} background_padding
 * @property {number} background_radius
 * @property {number} line_spacing
 * @property {number} max_width - Percentage
* @property {number} max_chars_per_line - 每行最大字符数（自动换行）
  * @property {boolean} word_by_word_highlight - 逐字高亮显示开关
 * @property {number} [background_border_width] - Background box border width
 * @property {string} [background_border_color] - Background box border color
 */

/**
 * @typedef {Object} AudioConfig
 * @property {number} bgm_volume
 * @property {number} original_volume
 * @property {number} bgm_start_time
 * @property {boolean} bgm_loop
 * @property {number} fade_in_duration
 * @property {number} fade_out_duration
 */

/**
 * @typedef {Object} PipelineConfig
 * @property {boolean} use_transitions
 * @property {'fade' | 'slide' | 'zoom' | 'blur'} transition_type
 * @property {number} transition_duration
 * @property {boolean} resync_subtitle
 */

/**
 * @typedef {Object} OutputConfig
 * @property {boolean} need_ass
 */

/**
 * @typedef {Object} GlobalConfig
 * @property {PipelineConfig} pipeline
 * @property {SubtitleConfig} subtitle
 * @property {AudioConfig} audio
 * @property {OutputConfig} output
 */

/**
 * Default parameters config
 */
export const DEFAULT_CONFIG = {
  pipeline: {
    use_transitions: true,
    transition_type: 'fade',
    transition_duration: 0.6,
    resync_subtitle: true,
  },
  subtitle: {
    effect: 'ad',
    font_size: 72,
    position: 'bottom',
    x_offset: 0,
    y_offset: -80,
    color: '#FFFF00',
    stroke_color: '#000000',
    stroke_width: 3,
    background_color: 'rgba(0, 0, 0, 0.4)',
    background_padding: 8,
    background_radius: 8,
    line_spacing: 1.3,
    max_width: 95,
    max_chars_per_line: 18,  // 🎨 与后端统一的每行最大字符数
    word_by_word_highlight: true,  // 🎨 逐字高亮显示开关
    background_border_width: 0,
    background_border_color: '#FFFFFF',
  },
  audio: {
    bgm_volume: 0.4,
    original_volume: 1.0,
    bgm_start_time: 0.0,
    bgm_loop: true,
    fade_in_duration: 0.8,
    fade_out_duration: 0.8,
  },
  output: {
    need_ass: true,
  },
};

/**
 * Premium Preset Styles definition
 * @typedef {Object} PresetStyle
 * @property {string} name
 * @property {string} description
 * @property {Partial<SubtitleConfig>} subtitle
 */

export const PRESET_STYLES = [
  {
    name: '综艺黄暴',
    description: '高对比度黄色描边，充满活力',
    subtitle: {
      color: '#FFE600',
      stroke_color: '#000000',
      stroke_width: 4,
      background_color: 'transparent',
      font_size: 80,
      max_chars_per_line: 18,
    }
  },
  {
    name: '黑盒电影',
    description: '半透明黑框背景，优雅易读',
    subtitle: {
      color: '#FFFFFF',
      stroke_color: 'transparent',
      stroke_width: 0,
      background_color: 'rgba(0, 0, 0, 0.75)',
      background_padding: 12,
      background_radius: 6,
      font_size: 64,
      max_chars_per_line: 18,
    }
  },
  {
    name: '纯真极简',
    description: '无背景深色投影，通透干净',
    subtitle: {
      color: '#FFFFFF',
      stroke_color: 'rgba(0, 0, 0, 0.8)',
      stroke_width: 2,
      background_color: 'transparent',
      font_size: 72,
      max_chars_per_line: 18,
    }
  },
  {
    name: '科幻量子',
    description: '荧光青配深蓝微醺背景',
    subtitle: {
      color: '#00F5FF',
      stroke_color: '#050B1A',
      stroke_width: 3,
      background_color: 'rgba(5, 11, 26, 0.5)',
      background_padding: 10,
      background_radius: 12,
      font_size: 76,
    }
  },
  {
    name: '落日余晖',
    description: '温馨珊瑚粉橙，优雅柔和',
    subtitle: {
      color: '#FF9F43',
      stroke_color: '#2F3640',
      stroke_width: 2,
      background_color: 'rgba(47, 54, 64, 0.4)',
      background_radius: 8,
      font_size: 70,
    }
  },
];

/**
 * @typedef {Object} PositionPreset
 * @property {string} name
 * @property {'top' | 'center' | 'bottom' | 'custom'} position
 * @property {number} y_offset
 */

export const POSITION_PRESETS = [
  { name: '顶部排列', position: 'top', y_offset: 65 },
  { name: '中上挂载', position: 'custom', y_offset: 30 },
  { name: '绝对居中', position: 'center', y_offset: 0 },
  { name: '中下排列', position: 'custom', y_offset: -30 },
  { name: '底部排版', position: 'bottom', y_offset: -80 },
];

// Helper Tooltip Component that is absolutely reliable, stylish, and doesn't load external dependencies
/**
 * @param {{ children: ReactNode; tip: string }} props
 */
function CustomTooltip({ children, tip }) {
  const [show, setShow] = useState(false);
  return (
    <div 
      className="relative flex items-center inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-2.5 py-1 text-xs text-white bg-slate-950/90 [backdrop-filter:blur(8px)] border border-slate-800 rounded-md shadow-xl whitespace-nowrap pointer-events-none"
          >
            {tip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * @typedef {Object} GlobalParamsVisualEditorProps
 * @property {GlobalConfig} [value]
 * @property {(val: GlobalConfig) => void} [onChange]
 * @property {string} [className]
 * @property {string | null} [storageKey] - localStorage key, null means no persistence
 * @property {boolean} [persist] - whether to save to localStorage
 * @property {GlobalConfig} [defaultConfig] - default config to use instead of DEFAULT_CONFIG
 */

/**
 * @param {GlobalParamsVisualEditorProps} props
 */
// Default LocalStorage key for persisting global params (used by BatchProcessor)
const DEFAULT_STORAGE_KEY = 'rjcut_global_params_v1';

export default function GlobalParamsVisualEditor({ 
  value, 
  onChange, 
  className,
  storageKey = null,
  persist = false,
  defaultConfig = null,
}) {
  // Use provided defaultConfig or fall back to DEFAULT_CONFIG
  const effectiveDefaultConfig = defaultConfig || DEFAULT_CONFIG;

  // Load from localStorage on mount only if persist is enabled
  const loadFromStorage = () => {
    if (!persist || !storageKey) {
      return null;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('[GlobalParams] Loaded from localStorage:', parsed);
        return parsed;
      }
    } catch (e) {
      console.warn('[GlobalParams] Failed to load from localStorage:', e);
    }
    return null;
  };

  const storedConfig = loadFromStorage();
  
  const [config, setConfig] = useState(() => {
    // Priority: value > defaultConfig > localStorage > DEFAULT_CONFIG
    if (value) {
      // Merge with effective defaults to ensure all fields exist
      return {
        pipeline: { ...effectiveDefaultConfig.pipeline, ...value.pipeline },
        subtitle: { ...effectiveDefaultConfig.subtitle, ...value.subtitle },
        audio: { ...effectiveDefaultConfig.audio, ...value.audio },
        output: { ...effectiveDefaultConfig.output, ...value.output }
      };
    }
    if (storedConfig) {
      // Merge stored config with defaults to ensure all fields exist
      return {
        pipeline: { ...effectiveDefaultConfig.pipeline, ...storedConfig.pipeline },
        subtitle: { ...effectiveDefaultConfig.subtitle, ...storedConfig.subtitle },
        audio: { ...effectiveDefaultConfig.audio, ...storedConfig.audio },
        output: { ...effectiveDefaultConfig.output, ...storedConfig.output }
      };
    }
    // Fall back to effective default config
    return { ...effectiveDefaultConfig };
  });

  const [activeTab, setActiveTab] = useState('subtitle');
  const [showPreview, setShowPreview] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('9/16');
  const [previewSize, setPreviewSize] = useState({ width: 360, height: 640 });
  const [bgStyle, setBgStyle] = useState('cyber');

  // 音频试听状态
  const [playingTrackUrl, setPlayingTrackUrl] = useState(null);
  const [isPlayingBgm, setIsPlayingBgm] = useState(false);
  const audioRef = useRef(null);

  // 音频播放核心逻辑
  useEffect(() => {
    // 清理函数：移除旧的事件监听器
    const cleanupAudio = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };

    if (playingTrackUrl) {
      // 如果切换音源，先完全清理旧的音频对象
      if (audioRef.current && audioRef.current.src !== playingTrackUrl) {
        cleanupAudio();
      }

      if (!audioRef.current) {
        audioRef.current = new Audio(playingTrackUrl);
      }
      
      audioRef.current.volume = config.audio.bgm_volume;
      audioRef.current.loop = config.audio.bgm_loop;
      
      const handleEnded = () => {
        if (!config.audio.bgm_loop) {
          setIsPlayingBgm(false);
        }
      };
      
      // 移除旧的事件监听器（如果有）
      audioRef.current.removeEventListener('ended', handleEnded);
      audioRef.current.addEventListener('ended', handleEnded);
      
      if (isPlayingBgm) {
        // 使用 Promise 链式调用，避免中断问题
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // 播放成功
            })
            .catch(err => {
              // 忽略 AbortError，只记录其他错误
              if (err.name !== 'AbortError') {
                console.warn('音频播放失败:', err);
              }
              setIsPlayingBgm(false);
            });
        }
      } else {
        audioRef.current.pause();
      }
      
      return () => {
        if (audioRef.current) {
          audioRef.current.removeEventListener('ended', handleEnded);
        }
      };
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  }, [playingTrackUrl, isPlayingBgm, config.audio.bgm_volume, config.audio.bgm_loop]);

  // 音量同步
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = config.audio.bgm_volume;
    }
  }, [config.audio.bgm_volume]);

  // 循环同步
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = !!config.audio.bgm_loop;
    }
  }, [config.audio.bgm_loop]);

  // Save to localStorage whenever config changes (only if persist is enabled)
  useEffect(() => {
    if (!persist || !storageKey) {
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
      console.log('[GlobalParams] Saved to localStorage:', config);
    } catch (e) {
      console.warn('[GlobalParams] Failed to save to localStorage:', e);
    }
  }, [config, persist, storageKey]);

  // 组件卸载清理
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Synchronize aspect choices to standard coordinate boxes
  useEffect(() => {
    if (aspectRatio === '9/16') {
      setPreviewSize({ width: 360, height: 640 });
    } else {
      setPreviewSize({ width: 640, height: 360 });
    }
  }, [aspectRatio]);
  
  // Animation state for simulated subtitle playback
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [transitionTrigger, setTransitionTrigger] = useState(0);

  const canvasRef = useRef(null);

  const sampleSubtitles = [
    { zh: "高能转场！瞬间拉满", en: "Epic Beat Drop" },
    { zh: "拖拽文字，精确对齐", en: "Drag to Align" },
    { zh: "极限制霸，渲染就绪", en: "Render Ready" },
    { zh: "电影画质，声画完美", en: "Cinematic Sync" }
  ];

  // 自定义字幕文字输入
  const [customSubtitleText, setCustomSubtitleText] = useState('高能转场！瞬间拉满');

  // 获取当前显示的字幕内容（优先使用自定义文字）
  const getCurrentSubtitle = () => {
    return customSubtitleText || sampleSubtitles[currentSubtitleIndex].zh;
  };
// 自动播放场景切换逻辑 - 让转场效果动起来
  useEffect(() => {
    if (!isPlaying) return;
    
    const interval = setInterval(() => {
      setCurrentSubtitleIndex(prev => (prev + 1) % sampleSubtitles.length);
      setTransitionTrigger(prev => prev + 1); // 触发字幕转场动画
    }, 3000); // 每 3 秒切换一个场景

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Synchronize external value overrides
  useEffect(() => {
    if (value) {
      setConfig(prev => {
        const newConfig = {
          pipeline: { ...DEFAULT_CONFIG.pipeline, ...value.pipeline },
          subtitle: { ...DEFAULT_CONFIG.subtitle, ...value.subtitle },
          audio: { ...DEFAULT_CONFIG.audio, ...value.audio },
          output: { ...DEFAULT_CONFIG.output, ...value.output },
        };
        // Only update if values actually changed to prevent infinite loop
        if (JSON.stringify(prev) === JSON.stringify(newConfig)) {
          return prev;
        }
        return newConfig;
      });
    }
  }, [value]);

  // Update a single field inside a config section
  const updateConfig = useCallback((section, field, newValue) => {
    setConfig(prev => {
      const updatedSection = {
        ...prev[section],
        [field]: newValue
      };
      const newConfig = {
        ...prev,
        [section]: updatedSection
      };
      // 🎨 保存到 localStorage (only if persist is enabled)
      if (persist && storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(newConfig))
        } catch (e) {
          console.error('[GlobalParamsVisualEditor] 保存配置失败:', e)
        }
      }
      setTimeout(() => {
        onChange?.(newConfig);
      }, 0);
      return newConfig;
    });
  }, [onChange, persist, storageKey]);

  // Apply a styling design preset
  const applyPreset = (preset) => {
    setConfig(prev => {
      const newConfig = {
        ...prev,
        subtitle: {
          ...prev.subtitle,
          ...preset.subtitle,
        }
      };
      setTimeout(() => {
        onChange?.(newConfig);
      }, 0);
      return newConfig;
    });
  };

  // Apply quick positioning presets
  const applyPositionPreset = (preset) => {
    setConfig(prev => {
      const newConfig = {
        ...prev,
        subtitle: {
          ...prev.subtitle,
          position: preset.position,
          y_offset: preset.y_offset,
        }
      };
      setTimeout(() => {
        onChange?.(newConfig);
      }, 0);
      return newConfig;
    });
  };

  // Reset to initial factory defaults
  const resetToDefault = () => {
    setConfig(DEFAULT_CONFIG);
    onChange?.(DEFAULT_CONFIG);
  };

  // Dragging event handlers supporting absolute 1:1 mouse movement mapping
  const handleDragPosition = (clientX, clientY) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Center in coordinates is width / 2 and height / 2.
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate percentage offset from center. Scale behaves -100 to +100
    // x_offset increases rightwards (so standard x offset)
    // y_offset increases UPWARDS, which means at top (y near 0), y_offset is positive (+100).
    const relX = Math.round(((x - centerX) / (rect.width / 2)) * 100);
    const relY = Math.round(((centerY - y) / (rect.height / 2)) * 100);

    // Limit position in range
    const finalX = Math.max(-100, Math.min(100, relX));
    const finalY = Math.max(-100, Math.min(100, relY));

    // When dragging manually, automatically toggle state to custom layout
    setConfig(prev => {
      const newConfig = {
        ...prev,
        subtitle: {
          ...prev.subtitle,
          position: 'custom',
          x_offset: finalX,
          y_offset: finalY
        }
      };
      setTimeout(() => {
        onChange?.(newConfig);
      }, 0);
      return newConfig;
    });
  };

  const handleMouseDown = (e) => {
    // Only drag when clicking the canvas directly or preview text. Do not block handles
    setDragging(true);
    handleDragPosition(e.clientX, e.clientY);
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    handleDragPosition(e.clientX, e.clientY);
  };

  const handleMouseUpOrLeave = () => {
    setDragging(false);
  };

  // Touch screen dragging bindings for perfect mobile responsive viewports
  const handleTouchStart = (e) => {
    setDragging(true);
    if (e.touches[0]) {
      handleDragPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (!dragging) return;
    if (e.touches[0]) {
      handleDragPosition(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Calculates percent-based location inside the responsive preview container (100% bug-free across 16:9 / 9:16!)
  const getSubtitlePositionPercent = () => {
    const { position, x_offset, y_offset } = config.subtitle;
    let baseYPercent = 50; // default represents center
    const baseXPercent = 50;

    // position 预设位置的基础百分比（针对 9:16 竖屏优化）
    // 注意：transform: translate(-50%, -50%) 会让元素中心对准计算点
    if (position === 'top') {
      baseYPercent = 25;
    } else if (position === 'bottom') {
      baseYPercent = 50;  // 基准位置与 custom 一致，y_offset=-80 时：50-(-80/2)=90%（底部可见区域）
    } else if (position === 'center') {
      baseYPercent = 50;
    }

    // Offset 是 -100 到 100，映射到 -50% 到 +50% 范围
    const leftPercent = baseXPercent + (x_offset / 2);
    // y_offset: 正值向上（top 减小），负值向下（top 增加）
    const topPercent = baseYPercent - (y_offset / 2);

    return {
      left: `${leftPercent}%`,
      top: `${topPercent}%`,
    };
  };

  const subtitlePosPercent = getSubtitlePositionPercent();

  // Computes precise inline subtitle styles mimicking ASS high fidelity subtitle layers
  const getSubtitleStyle = () => {
    const { 
      font_size, color, stroke_color, stroke_width, 
      background_color, background_padding, background_radius,
      line_spacing, max_width
    } = config.subtitle;
    
    const background_border_width = config.subtitle.background_border_width !== undefined ? config.subtitle.background_border_width : 0;
    const background_border_color = config.subtitle.background_border_color || '#FFFFFF';
    
    // Virtual calculation scale relative to standard landscape width of 1920px or portrait width of 1080px
    const scale = aspectRatio === '9/16' 
      ? 300 / 1080  // 300px preview width relative to 1080px portrait width
      : 640 / 1920; // 640px preview width relative to 1920px landscape width
      
    const scaledFontSize = Math.max(11, font_size * scale); // Exact proportional size
    const scaledPaddingY = background_padding * scale * 1.2;
    const scaledPaddingX = background_padding * scale * 2.5;
    const scaledRadius = background_radius * scale * 1.2;
    const scaledStrokeWidth = stroke_width * scale * 1.5;
    const scaledBackgroundBorderWidth = background_border_width * scale * 1.5;

    const hasStroke = stroke_width > 0 && stroke_color !== 'transparent' && stroke_color !== '';
    
    return {
      fontSize: `${scaledFontSize}px`,
      color: color,
      fontFamily: '"Outfit", "Space Grotesk", "Inter", "system-ui", sans-serif',
      letterSpacing: '0.08em',
      fontWeight: 'bold',
      textShadow: hasStroke 
        ? `
          -${scaledStrokeWidth}px -${scaledStrokeWidth}px 0 ${stroke_color}, 
           ${scaledStrokeWidth}px -${scaledStrokeWidth}px 0 ${stroke_color}, 
          -${scaledStrokeWidth}px  ${scaledStrokeWidth}px 0 ${stroke_color}, 
           ${scaledStrokeWidth}px  ${scaledStrokeWidth}px 0 ${stroke_color},
           0px -${scaledStrokeWidth}px 0 ${stroke_color},
           0px  ${scaledStrokeWidth}px 0 ${stroke_color},
          -${scaledStrokeWidth}px 0px 0 ${stroke_color},
           ${scaledStrokeWidth}px 0px 0 ${stroke_color}
        `
        : 'none',
      backgroundColor: background_color || 'transparent',
      padding: background_color !== 'transparent' ? `${scaledPaddingY}px ${scaledPaddingX}px` : '0',
      borderRadius: `${scaledRadius}px`,
      border: background_color !== 'transparent' && background_border_width > 0 
        ? `${scaledBackgroundBorderWidth}px solid ${background_border_color}` 
        : 'none',
      textAlign: 'center',
      display: 'inline-block',
      maxWidth: `${max_width}%`,
      lineHeight: line_spacing,
      pointerEvents: 'none',
      userSelect: 'none',
      transition: dragging ? 'none' : 'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
    };
  };

  // 转场动画配置生成器 - 支持 9:16 纵向滑动与 16:9 横向滑动自适应
  const getSceneTransitionAnimation = () => {
    const { transition_type, transition_duration } = config.pipeline;
    const duration = transition_duration;

    switch (transition_type) {
      case 'slide':
        // 💡 黄金优化细节：
        // - 针对 9:16 短视频，使用符合抖音/小红书滑动习惯的「上下纵向推移」(Vertical Slide)
        // - 针对 16:9 宽屏，使用具备电影感与空间展开感的「左右横向推移」(Horizontal Slide)
        return aspectRatio === '9/16'
          ? {
              initial: { opacity: 0, y: "100%", x: 0 },
              animate: { opacity: 1, y: 0, x: 0 },
              exit: { opacity: 0, y: "-100%", x: 0 },
              transition: { duration, ease: [0.16, 1, 0.3, 1] } // 超平滑三次贝塞尔曲线
            }
          : {
              initial: { opacity: 0, x: "100%", y: 0 },
              animate: { opacity: 1, x: 0, y: 0 },
              exit: { opacity: 0, x: "-100%", y: 0 },
              transition: { duration, ease: [0.16, 1, 0.3, 1] }
            };

      case 'zoom':
        // 电影感中心缩放与拉伸
        return {
          initial: { opacity: 0, scale: 0.8 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 1.15 },
          transition: { duration, ease: [0.25, 1, 0.5, 1] }
        };

      case 'blur':
        // 高斯模糊浪漫淡入淡出 (适合唯美、情感或 Lofi 风格)
        return {
          initial: { opacity: 0, filter: "blur(20px)" },
          animate: { opacity: 1, filter: "blur(0px)" },
          exit: { opacity: 0, filter: "blur(20px)" },
          transition: { duration, ease: "easeInOut" }
        };

      case 'fade':
      default:
        // 经典交叉淡化
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration, ease: "easeInOut" }
        };
    }
  };

  // Copy JSON payload utility
  const copyJsonPayload = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // 降级方案：使用传统方法
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(config, null, 2);
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        alert('复制失败，请手动复制');
      }
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className={`w-full bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ${className || ''}`} id="params-visual-editor-root">
      
      {/* Visual Header */}
      <div className="flex md:flex-row flex-col items-start md:items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">全局渲染参数编辑器</h2>
            <p className="text-xs text-slate-500 mt-0.5">可视调节字幕外观、音频及转场效果</p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2 self-stretch md:self-auto justify-between md:justify-end">
          <div className="flex items-center bg-white border border-slate-200 p-0.5 rounded-lg">
            <button
              onClick={() => setShowPreview(true)}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${showPreview ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>显示预览</span>
            </button>
            <button
              onClick={() => setShowPreview(false)}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${!showPreview ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>隐藏预览</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <CustomTooltip tip="重置全部配置">
              <button 
                onClick={resetToDefault}
                className="p-2 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 hover:text-red-700 rounded-lg transition-colors"
                id="reset-config-button"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </CustomTooltip>
          </div>
        </div>
      </div>

      {/* Main Workspace Frame */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
        
        {/* Left Side Settings Sidebar */}
        <div className="col-span-1 lg:col-span-5 border-r border-slate-100 flex flex-col h-[600px] overflow-hidden bg-white">
          
          {/* Navigation Tabs bar */}
          <div className="flex border-b border-slate-100 bg-slate-50 p-1">
            {[
              { id: 'subtitle', label: '字幕视觉', icon: Type },
              { id: 'audio', label: '声学增益', icon: Music },
              { id: 'pipeline', label: '转场机制', icon: Sliders },
            ].map(tab => {
              const IconComponent = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-1 text-xs font-medium transition-all duration-200 ${
                    isSelected 
                      ? 'text-blue-600 bg-white shadow-sm rounded-lg' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg'
                  }`}
                  id={`tab-button-${tab.id}`}
                >
                  <IconComponent className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content Panel (Scrollable content) */}
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            
            {/* SUBTITLES TAB */}
            {activeTab === 'subtitle' && (
              <div className="space-y-5" id="subtitle-config-group">
                
                {/* 自定义字幕文字输入 */}
                <div className="p-3.5 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Type className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs font-semibold text-slate-700">预览字幕文字</span>
                    <span className="text-[9px] text-slate-500 ml-auto">修改后即时刷新</span>
                  </div>
                  
                  <div>
                    <input
                      type="text"
                      value={customSubtitleText}
                      onChange={(e) => setCustomSubtitleText(e.target.value)}
                      placeholder="输入预览字幕内容，修改后即时刷新..."
                      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all"
                    />
                  </div>
                </div>

                {/* Style Presets */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-blue-500" />
                      设计预设
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRESET_STYLES.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className="group flex flex-col items-start p-2.5 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg transition-all duration-200 text-left cursor-pointer"
                      >
                        <span className="text-xs font-semibold text-slate-700 group-hover:text-blue-700 transition-colors">{preset.name}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5 line-clamp-1 leading-snug">{preset.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtitle Positioning Layout Nodes */}
                <div className="pt-3 border-t border-slate-100">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-3">
                    <Move className="w-3.5 h-3.5 text-blue-500" />
                    位置预设
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {POSITION_PRESETS.map((preset) => {
                      const isActive = config.subtitle.position === preset.position && config.subtitle.y_offset === preset.y_offset;
                      return (
                        <button
                          key={preset.name}
                          onClick={() => applyPositionPreset(preset)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all border ${
                            isActive 
                              ? 'bg-blue-600 border-blue-600 text-white shadow-sm font-semibold' 
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Size & Box Controls */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  
                  {/* Slider: Font Size */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-slate-400" />
                        字体字号
                      </label>
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        {config.subtitle.font_size}px
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => updateConfig('subtitle', 'font_size', Math.max(40, config.subtitle.font_size - 4))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min="30"
                        max="140"
                        value={config.subtitle.font_size}
                        onChange={(e) => updateConfig('subtitle', 'font_size', parseInt(e.target.value))}
                        className="flex-1 accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => updateConfig('subtitle', 'font_size', Math.min(140, config.subtitle.font_size + 4))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Slider: Max Width (Auto-wrap) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <Move className="w-3.5 h-3.5 text-slate-400" />
                        单行最大宽度
                      </label>
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        {config.subtitle.max_width}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => updateConfig('subtitle', 'max_width', Math.max(20, config.subtitle.max_width - 5))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        step="5"
                        value={config.subtitle.max_width}
                        onChange={(e) => updateConfig('subtitle', 'max_width', parseInt(e.target.value))}
                        className="flex-1 accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => updateConfig('subtitle', 'max_width', Math.min(100, config.subtitle.max_width + 5))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Slider: Line Spacing */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-slate-400" />
                        行间距
                      </label>
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        {config.subtitle.line_spacing}x
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => updateConfig('subtitle', 'line_spacing', parseFloat(Math.max(1.0, config.subtitle.line_spacing - 0.1).toFixed(1)))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min="1.0"
                        max="2.5"
                        step="0.1"
                        value={config.subtitle.line_spacing}
                        onChange={(e) => updateConfig('subtitle', 'line_spacing', parseFloat(e.target.value))}
                        className="flex-1 accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => updateConfig('subtitle', 'line_spacing', parseFloat(Math.min(2.5, config.subtitle.line_spacing + 0.1).toFixed(1)))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Input: Max Chars Per Line (Auto-wrap) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <AlignLeft className="w-3.5 h-3.5 text-slate-400" />
                        每行最大字符数
                      </label>
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        {config.subtitle.max_chars_per_line}字
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => updateConfig('subtitle', 'max_chars_per_line', Math.max(8, config.subtitle.max_chars_per_line - 2))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min="8"
                        max="40"
                        step="1"
                        value={config.subtitle.max_chars_per_line}
                        onChange={(e) => updateConfig('subtitle', 'max_chars_per_line', parseInt(e.target.value))}
                        className="flex-1 accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => updateConfig('subtitle', 'max_chars_per_line', Math.min(40, config.subtitle.max_chars_per_line + 2))}
                        className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-600 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5">
                      超过此字符数将自动换行，影响字幕切分密度
                    </p>
                  </div>

                  {/* Toggle: Word by Word Highlight */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-slate-400" />
                        逐字高亮显示
                      </label>
                      <button
                        onClick={() => updateConfig('subtitle', 'word_by_word_highlight', !config.subtitle.word_by_word_highlight)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          config.subtitle.word_by_word_highlight ? 'bg-blue-600' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            config.subtitle.word_by_word_highlight ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      开启后每个字单独显示并高亮，念到哪个字哪个字变大
                    </p>
                  </div>

                  {/* Dual Color Picker Blocks */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Color: Subtitle text */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <label className="text-[10px] font-semibold text-slate-600 block mb-2">文字颜色</label>
                      <div className="flex items-center gap-2">
                        <div className="relative w-7 h-7 rounded-md overflow-hidden border border-slate-300 flex-shrink-0 cursor-pointer shadow-sm">
                          <input
                            type="color"
                            value={config.subtitle.color.startsWith('rgba') ? '#FFFFFF' : config.subtitle.color}
                            onChange={(e) => updateConfig('subtitle', 'color', e.target.value)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          />
                          <div 
                            className="w-full h-full border border-black/5 rounded-md"
                            style={{ backgroundColor: config.subtitle.color }}
                          />
                        </div>
                        <input
                          type="text"
                          value={config.subtitle.color}
                          onChange={(e) => updateConfig('subtitle', 'color', e.target.value)}
                          className="w-full min-w-0 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Color: Stroke color */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                      <label className="text-[10px] font-semibold text-slate-600 block mb-2">描边颜色</label>
                      <div className="flex items-center gap-2">
                        <div className="relative w-7 h-7 rounded-md overflow-hidden border border-slate-300 flex-shrink-0 cursor-pointer shadow-sm">
                          <input
                            type="color"
                            value={config.subtitle.stroke_color === 'transparent' || config.subtitle.stroke_color === '' ? '#000000' : config.subtitle.stroke_color}
                            onChange={(e) => updateConfig('subtitle', 'stroke_color', e.target.value)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          />
                          <div 
                            className="w-full h-full border border-black/5 rounded-md"
                            style={{ backgroundColor: config.subtitle.stroke_color === 'transparent' ? '#e5e7eb' : config.subtitle.stroke_color }}
                          />
                        </div>
                        <div className="relative flex-1 min-w-0">
                          <input
                            type="text"
                            value={config.subtitle.stroke_color}
                            onChange={(e) => updateConfig('subtitle', 'stroke_color', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stroke Width Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700">
                        描边宽度
                      </label>
                      <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {config.subtitle.stroke_width}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={config.subtitle.stroke_width}
                      onChange={(e) => updateConfig('subtitle', 'stroke_width', parseInt(e.target.value))}
                      className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Background Mask Color Setting */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-700">背景遮罩</label>
                      <button 
                        onClick={() => updateConfig('subtitle', 'background_color', config.subtitle.background_color === 'transparent' ? 'rgba(0,0,0,0.6)' : 'transparent')}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          config.subtitle.background_color !== 'transparent' 
                            ? 'bg-emerald-100 border-emerald-300 text-emerald-700' 
                            : 'bg-slate-200 border-slate-300 text-slate-600'
                        }`}
                      >
                        {config.subtitle.background_color !== 'transparent' ? '已启用' : '已禁用'}
                      </button>
                    </div>

                    {config.subtitle.background_color !== 'transparent' && (
                      <div className="space-y-4 pt-2">
                        <div>
                          <label className="text-[10px] font-medium text-slate-600 block mb-1.5">遮罩颜色</label>
                          <div className="flex items-center gap-2">
                            <div className="relative w-7 h-7 rounded-md overflow-hidden border border-slate-300 flex-shrink-0 cursor-pointer shadow-sm">
                              <input
                                type="color"
                                value="#000000"
                                onChange={(e) => {
                                  updateConfig('subtitle', 'background_color', `rgba(0, 0, 0, 0.65)`);
                                }}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                              />
                              <div 
                                className="w-full h-full border border-black/5 rounded-md"
                                style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
                              />
                            </div>
                            <input
                              type="text"
                              value={config.subtitle.background_color}
                              onChange={(e) => updateConfig('subtitle', 'background_color', e.target.value)}
                              placeholder="rgba 或 hex 颜色值"
                              className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        {/* Background radius & padding */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                              <span>遮罩圆角</span>
                              <span>{config.subtitle.background_radius}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="24"
                              value={config.subtitle.background_radius}
                              onChange={(e) => updateConfig('subtitle', 'background_radius', parseInt(e.target.value))}
                              className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                              <span>遮罩内边距</span>
                              <span>{config.subtitle.background_padding}px</span>
                            </div>
                            <input
                              type="range"
                              min="4"
                              max="20"
                              value={config.subtitle.background_padding}
                              onChange={(e) => updateConfig('subtitle', 'background_padding', parseInt(e.target.value))}
                              className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none"
                            />
                          </div>
                        </div>

                        {/* Background Border settings */}
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                              <span>边框线宽</span>
                              <span>{config.subtitle.background_border_width || 0}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="8"
                              step="1"
                              value={config.subtitle.background_border_width || 0}
                              onChange={(e) => updateConfig('subtitle', 'background_border_width', parseInt(e.target.value))}
                              className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-600 mb-1">
                              <span>边框颜色</span>
                              <span className="font-mono text-[9px] text-slate-500">{(config.subtitle.background_border_color || '#FFFFFF').toUpperCase()}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="relative w-5 h-5 rounded-md overflow-hidden border border-slate-300 cursor-pointer flex-shrink-0 shadow-sm">
                                <input
                                  type="color"
                                  value={config.subtitle.background_border_color || '#FFFFFF'}
                                  onChange={(e) => updateConfig('subtitle', 'background_border_color', e.target.value)}
                                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer animate-none"
                                />
                                <div 
                                  className="w-full h-full border border-black/5 rounded-md"
                                  style={{ backgroundColor: config.subtitle.background_border_color || '#FFFFFF' }}
                                />
                              </div>
                              <input
                                type="text"
                                value={config.subtitle.background_border_color || '#FFFFFF'}
                                onChange={(e) => updateConfig('subtitle', 'background_border_color', e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-700 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manual Coordinates Offsets Ranges */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                        <span className="flex items-center gap-1">水平偏移 (X)</span>
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{config.subtitle.x_offset}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={config.subtitle.x_offset}
                        onChange={(e) => updateConfig('subtitle', 'x_offset', parseInt(e.target.value))}
                        className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                        <span className="flex items-center gap-1">垂直偏移 (Y)</span>
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{config.subtitle.y_offset}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={config.subtitle.y_offset}
                        onChange={(e) => updateConfig('subtitle', 'y_offset', parseInt(e.target.value))}
                        className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* AUDIO CONFIG TAB */}
            {activeTab === 'audio' && (
              <div className="space-y-5" id="audio-config-group">
                <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                  <Volume2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-800">音频配置</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">调节视频原声、背景音乐的音量及淡入淡出效果。支持实时试听测试音源。</p>
                  </div>
                </div>

                {/* 测试音源试听区域 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-blue-500" />
                      测试音源试听
                    </span>
                    <span className="text-[10px] text-slate-500">点击卡片应用并试听</span>
                  </div>

                  <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                    {TEST_BGM_TRACKS.map((track) => {
                      const isSelected = config.audio.bgm_url === track.url;
                      const isThisPlaying = playingTrackUrl === track.url && isPlayingBgm;
                      
                      return (
                        <div 
                          key={track.id}
                          onClick={() => {
                            updateConfig('audio', 'bgm_url', track.url);
                            setPlayingTrackUrl(track.url);
                            setIsPlayingBgm(true);
                          }}
                          className={`p-2.5 rounded-lg border transition-all text-left cursor-pointer group ${
                            isSelected 
                              ? 'bg-blue-50 border-blue-300 shadow-sm' 
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-semibold ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}>
                                  {track.name}
                                </span>
                                <span className="bg-white/80 text-slate-500 border border-slate-200 text-[9px] px-1.5 py-0.5 rounded font-medium">
                                  {track.genre}
                                </span>
                              </div>
                            </div>
                            
                            {/* 播放按钮 */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (playingTrackUrl !== track.url) {
                                  setPlayingTrackUrl(track.url);
                                  setIsPlayingBgm(true);
                                  updateConfig('audio', 'bgm_url', track.url);
                                } else {
                                  setIsPlayingBgm(!isPlayingBgm);
                                }
                              }}
                              className={`w-7 h-7 rounded-md flex items-center justify-center transition-all border select-none ${
                                isThisPlaying
                                  ? 'bg-amber-100 border-amber-300 text-amber-600'
                                  : isSelected
                                    ? 'bg-blue-100 border-blue-300 text-blue-600'
                                    : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                              }`}
                            >
                              {isThisPlaying ? (
                                <div className="flex items-center gap-0.5 h-3">
                                  <span className="w-0.5 h-3 bg-current rounded-full animate-bounce" />
                                  <span className="w-0.5 h-2 bg-current rounded-full animate-[bounce_1s_infinite_200ms]" />
                                  <span className="w-0.5 h-2.5 bg-current rounded-full animate-[bounce_1s_infinite_400ms]" />
                                </div>
                              ) : (
                                <Play className="w-3 h-3 fill-current" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Slider: original sound */}
                <div className="space-y-4 pt-2">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700">
                        原声音量
                      </label>
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {Math.round(config.audio.original_volume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1.5"
                      step="0.05"
                      value={config.audio.original_volume}
                      onChange={(e) => updateConfig('audio', 'original_volume', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Slider: BGM sound */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-700">
                        BGM 音量
                      </label>
                      <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                        {Math.round(config.audio.bgm_volume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1.0"
                      step="0.05"
                      value={config.audio.bgm_volume}
                      onChange={(e) => updateConfig('audio', 'bgm_volume', parseFloat(e.target.value))}
                      className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Loop Switch Toggle */}
                  <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                    <div className="space-y-0.5">
                      <label htmlFor="bgm_loop" className="text-xs font-semibold text-slate-700 cursor-pointer">BGM 循环播放</label>
                      <p className="text-[10px] text-slate-500">背景音乐短于视频时自动循环</p>
                    </div>
                    <input
                      type="checkbox"
                      id="bgm_loop"
                      checked={config.audio.bgm_loop}
                      onChange={(e) => updateConfig('audio', 'bgm_loop', e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                    />
                  </div>

                  {/* Fading Time Envelopes */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                        <span>淡入时长</span>
                        <span className="font-mono font-semibold text-blue-600">{config.audio.fade_in_duration}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.1"
                        value={config.audio.fade_in_duration}
                        onChange={(e) => updateConfig('audio', 'fade_in_duration', parseFloat(e.target.value))}
                        className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                        <span>淡出时长</span>
                        <span className="font-mono font-semibold text-blue-600">{config.audio.fade_out_duration}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.1"
                        value={config.audio.fade_out_duration}
                        onChange={(e) => updateConfig('audio', 'fade_out_duration', parseFloat(e.target.value))}
                        className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg"
                      />
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* PIPELINE & TRANSITIONS TAB */}
            {activeTab === 'pipeline' && (
              <div className="space-y-5" id="pipeline-config-group">
                
                {/* Switch: Use transition rendering */}
                <div className="flex items-center justify-between p-3.5 bg-purple-50 border border-purple-100 rounded-lg">
                  <div className="space-y-0.5">
                    <label htmlFor="use_transitions" className="text-xs font-semibold text-slate-800 cursor-pointer flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      转场效果
                    </label>
                    <p className="text-[10px] text-slate-600">视频片段间自动添加动画过渡</p>
                  </div>
                  <input
                    type="checkbox"
                    id="use_transitions"
                    checked={config.pipeline.use_transitions}
                    onChange={(e) => updateConfig('pipeline', 'use_transitions', e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 accent-purple-600 cursor-pointer"
                  />
                </div>

                {config.pipeline.use_transitions && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-4"
                  >
                    
                    {/* Select: Transition type */}
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-2">转场类型</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['fade', 'slide', 'zoom', 'blur']).map(type => (
                          <button
                            key={type}
                            onClick={() => updateConfig('pipeline', 'transition_type', type)}
                            className={`p-2.5 text-xs text-center border rounded-lg capitalize transition-all ${
                              config.pipeline.transition_type === type
                                ? 'bg-purple-600 border-purple-600 text-white font-semibold shadow-sm'
                                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                            }`}
                          >
                            {type === 'fade' && '淡入淡出'}
                            {type === 'slide' && '滑动'}
                            {type === 'zoom' && '缩放'}
                            {type === 'blur' && '模糊'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transition Duration slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-slate-700">
                          转场时长
                        </label>
                        <span className="font-mono text-xs font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                          {config.pipeline.transition_duration}秒
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.2"
                        max="2.0"
                        step="0.1"
                        value={config.pipeline.transition_duration}
                        onChange={(e) => updateConfig('pipeline', 'transition_duration', parseFloat(e.target.value))}
                        className="w-full accent-purple-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                        <span>0.2s</span>
                        <span>2.0s</span>
                      </div>
                    </div>

                  </motion.div>
                )}

                {/* Subtitle Alignment / Resync setting */}
                <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-lg">
                  <div className="space-y-0.5">
                    <label htmlFor="resync_subtitle" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      字幕音频自动对齐
                    </label>
                    <p className="text-[10px] text-slate-500">视频帧率波动时强制对齐字幕与音频</p>
                  </div>
                  <input
                    type="checkbox"
                    id="resync_subtitle"
                    checked={config.pipeline.resync_subtitle}
                    onChange={(e) => updateConfig('pipeline', 'resync_subtitle', e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Subtitle ASS script generation toggle */}
                <div className="flex items-center justify-between p-3.5 bg-white border border-slate-200 rounded-lg">
                  <div className="space-y-0.5">
                    <label htmlFor="need_ass" className="text-xs font-semibold text-slate-700 cursor-pointer">
                      输出 ASS 字幕文件
                    </label>
                    <p className="text-[10px] text-slate-500">渲染时同时生成外置 ASS 字幕</p>
                  </div>
                  <input
                    type="checkbox"
                    id="need_ass"
                    checked={config.output.need_ass}
                    onChange={(e) => updateConfig('output', 'need_ass', e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Right Side Video Layout Live Preview Screen */}
        <div className="col-span-1 lg:col-span-7 flex flex-col p-4 space-y-4">
          
          {/* Preview Panel Box Wrapper */}
          <div className="flex flex-col flex-1">
            
            {/* Header info bar of the preview */}
            <div className="flex sm:flex-row flex-col items-start sm:items-center justify-between mb-3 text-xs text-slate-600 font-medium gap-2">
              <span className="flex items-center gap-1.5">
                <Film className="w-4 h-4 text-blue-500" />
                实时预览
              </span>
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
                {/* Aspect ratio toggler */}
                <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-lg">
                  <button
                    onClick={() => setAspectRatio('9/16')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-all ${aspectRatio === '9/16' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    9:16
                  </button>
                  <button
                    onClick={() => setAspectRatio('16/9')}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-all ${aspectRatio === '16/9' ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    16:9
                  </button>
                </div>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 transition-all ${isPlaying ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'}`}
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlaying ? '暂停' : '播放'}</span>
                </button>
              </div>
            </div>

            {/* Simulated Live canvas container */}
            {showPreview ? (
              <div className="flex flex-col items-center">
                
                {/* The Video Sandbox */}
                <div
                  ref={canvasRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUpOrLeave}
                  onMouseLeave={handleMouseUpOrLeave}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleMouseUpOrLeave}
                  className="w-full relative overflow-hidden rounded-2xl shadow-2xl border border-slate-800/80 cursor-grab select-none active:cursor-grabbing group"
                  style={{
                    aspectRatio: aspectRatio,
                    maxWidth: aspectRatio === '9/16' ? '300px' : '640px',
                    width: '100%',
                    height: 'auto',
                  }}
                  id="preview-canvas-sandbox"
                >
                  {/* 🎬 视频场景转场核心层 - 使用 AnimatePresence 实现平滑场景切换 */}
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={`scene-clip-${currentSubtitleIndex}`}
                      {...getSceneTransitionAnimation()}
                      className="absolute inset-0 z-0 overflow-hidden w-full h-full"
                    >
                      {/* 动态流光多轨视效渲染器 */}
                      {(() => {
                        const sceneSchemes = {
                          cyber: [
                            {
                              bg: 'bg-[#070b19]',
                              radial1: 'bg-[radial-gradient(ellipse_at_top_right,#4f46e5,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_bottom_left,#db2777,transparent_50%)]',
                              pattern: (
                                <div className="absolute inset-0 opacity-15 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:30px_30px]" />
                              ),
                              icon: <Zap className="w-12 h-12 text-indigo-400 absolute top-12 left-12 animate-pulse pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#05162a]',
                              radial1: 'bg-[radial-gradient(ellipse_at_top_left,#06b6d4,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_bottom_right,#9333ea,transparent_50%)]',
                              pattern: (
                                <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(to_top,#0e7490_1px,transparent_1px)] bg-[size:100%_15px] opacity-25 pointer-events-none" style={{ transform: 'perspective(100px) rotateX(45deg)' }} />
                              ),
                              icon: <Cpu className="w-12 h-12 text-cyan-400 absolute top-12 right-12 animate-bounce pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#1e0a2d]',
                              radial1: 'bg-[radial-gradient(ellipse_at_bottom_left,#d946ef,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_top_right,#ea580c,transparent_50%)]',
                              pattern: (
                                 <div className="absolute inset-0 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:20px_20px] opacity-10 pointer-events-none" />
                              ),
                              icon: <Sparkles className="w-12 h-12 text-fuchsia-400 absolute bottom-16 right-16 animate-pulse pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#0a1e12]',
                              radial1: 'bg-[radial-gradient(ellipse_at_center,#10b981,transparent_60%)]',
                              radial2: 'bg-[radial-gradient(circle_at_bottom_left,#0284c7,transparent_50%)]',
                              pattern: (
                                 <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_bottom,#10b981,transparent_70%)] pointer-events-none" />
                              ),
                              icon: <Film className="w-12 h-12 text-emerald-400 absolute bottom-16 left-16 pointer-events-none animate-pulse" />
                            }
                          ],
                          relaxing: [
                            {
                              bg: 'bg-[#0b1c1e]',
                              radial1: 'bg-[radial-gradient(ellipse_at_top_right,#0d9488,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_bottom_left,#0f766e,transparent_50%)]',
                              pattern: <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/40 via-teal-950/20 to-slate-950 pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#061f18]',
                              radial1: 'bg-[radial-gradient(ellipse_at_bottom_left,#059669,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_top_right,#15803d,transparent_50%)]',
                              pattern: <div className="absolute inset-0 bg-[radial-gradient(#ffffff_0.5px,transparent_0.5px)] [background-size:16px_16px] opacity-10 pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#1a1c14]',
                              radial1: 'bg-[radial-gradient(ellipse_at_top_left,#84cc16,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_bottom_right,#4d7c0f,transparent_50%)]',
                              pattern: <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-[#111827] to-transparent opacity-60 pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#151b14]',
                              radial1: 'bg-[radial-gradient(ellipse_at_center,#14532d,transparent_65%)]',
                              radial2: 'bg-[radial-gradient(circle_at_top_right,#15803d,transparent_45%)]',
                              pattern: <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,#22c55e_1px,transparent_4px)] pointer-events-none" />
                            }
                          ],
                          midnight: [
                            {
                              bg: 'bg-[#020617]',
                              radial1: 'bg-[radial-gradient(ellipse_at_right,#1e1b4b,transparent_60%)]',
                              radial2: 'bg-[radial-gradient(circle_at_left,#0f172a,transparent_50%)]',
                              pattern: <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,#ffffff_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#11061e]',
                              radial1: 'bg-[radial-gradient(ellipse_at_top_left,#581c87,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_bottom_right,#2e1065,transparent_50%)]',
                              pattern: <div className="absolute inset-0 opacity-35 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15)_1.5px,transparent_1.5px)] [background-size:40px_40px] pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#041225]',
                              radial1: 'bg-[radial-gradient(ellipse_at_bottom_right,#0369a1,transparent_55%)]',
                              radial2: 'bg-[radial-gradient(circle_at_top_left,#172554,transparent_50%)]',
                              pattern: <div className="absolute inset-0 bg-gradient-to-b from-[#121829] to-[#040815] opacity-50 pointer-events-none" />
                            },
                            {
                              bg: 'bg-[#000a12]',
                              radial1: 'bg-[radial-gradient(ellipse_at_center,#0c4a6e,transparent_60%)]',
                              radial2: 'bg-[radial-gradient(circle_at_bottom_right,#075985,transparent_50%)]',
                              pattern: <div className="absolute bottom-6 left-6 font-mono text-[9px] text-[#075985]/30 pointer-events-none select-none">COSMIC AUDIO ENGINE</div>
                            }
                          ],
                          checker: [
                            {
                              bg: 'bg-[#0d1117]',
                              radial1: 'bg-[radial-gradient(circle_at_center,#1f2937,transparent_60%)]',
                              radial2: 'bg-transparent',
                              pattern: (
                                <div className="absolute inset-0 z-0 bg-[#0d1117] pointer-events-none" style={{
                                  backgroundImage: 'linear-gradient(45deg, #161b22 25%, transparent 25%), linear-gradient(-45deg, #161b22 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #161b22 75%), linear-gradient(-45deg, transparent 75%, #161b22 75%)',
                                  backgroundSize: '24px 24px',
                                  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
                                }} />
                              )
                            },
                            {
                              bg: 'bg-[#161b22]',
                              radial1: 'bg-[radial-gradient(circle_at_center,#111827,transparent_60%)]',
                              radial2: 'bg-transparent',
                              pattern: (
                                <div className="absolute inset-0 z-0 bg-[#161b22] pointer-events-none" style={{
                                  backgroundImage: 'linear-gradient(45deg, #0d1117 25%, transparent 25%), linear-gradient(-45deg, #0d1117 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #0d1117 75%), linear-gradient(-45deg, transparent 75%, #0d1117 75%)',
                                  backgroundSize: '24px 24px',
                                  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
                                }} />
                              )
                            },
                            {
                              bg: 'bg-[#0b0f19]',
                              radial1: 'bg-[radial-gradient(circle_at_center,#1e293b,transparent_60%)]',
                              radial2: 'bg-transparent',
                              pattern: (
                                <div className="absolute inset-0 z-0 bg-[#0b0f19] pointer-events-none" style={{
                                  backgroundImage: 'linear-gradient(45deg, #111827 25%, transparent 25%), linear-gradient(-45deg, #111827 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #111827 75%), linear-gradient(-45deg, transparent 75%, #111827 75%)',
                                  backgroundSize: '24px 24px',
                                  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
                                }} />
                              )
                            },
                            {
                              bg: 'bg-[#1e1e2e]',
                              radial1: 'bg-[radial-gradient(circle_at_center,#313244,transparent_60%)]',
                              radial2: 'bg-transparent',
                              pattern: (
                                <div className="absolute inset-0 z-0 bg-[#1e1e2e] pointer-events-none" style={{
                                  backgroundImage: 'linear-gradient(45deg, #11111b 25%, transparent 25%), linear-gradient(-45deg, #11111b 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #11111b 75%), linear-gradient(-45deg, transparent 75%, #11111b 75%)',
                                  backgroundSize: '24px 24px',
                                  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
                                }} />
                              )
                            }
                          ]
                        };

                        const schemeStyle = bgStyle in sceneSchemes ? bgStyle : 'cyber';
                        const activeSchemeList = sceneSchemes[schemeStyle];
                        const activeScheme = activeSchemeList[currentSubtitleIndex % activeSchemeList.length];

                        return (
                          <div className={`absolute inset-0 ${activeScheme.bg} overflow-hidden w-full h-full`}>
                            {/* 1. 图案/背景网格 (Pattern/Grid) */}
                            {activeScheme.pattern}
                            
                            {/* 2. 动态氛围流光 (Dynamic Ambient Light Layer - GPU 硬件渲染) */}
                            <div className={`absolute -top-1/2 -left-1/4 w-[150%] h-[150%] opacity-35 ${activeScheme.radial1} blur-[80px] pointer-events-none`} />
                            {activeScheme.radial2 && (
                              <div className={`absolute -bottom-1/3 -right-1/4 w-[120%] h-[120%] opacity-20 ${activeScheme.radial2} blur-[100px] pointer-events-none`} />
                            )}

                            {/* 3. 动态光点缀线 (Decorative vector lights) */}
                            {currentSubtitleIndex === 0 && <div className="absolute top-[30%] left-[10%] w-40 h-[1.5px] bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent pointer-events-none animate-pulse" />}
                            {currentSubtitleIndex === 1 && <div className="absolute top-[40%] right-[15%] w-32 h-[1px] bg-gradient-to-r from-cyan-500/20 to-transparent pointer-events-none rotate-45" />}
                            {currentSubtitleIndex === 2 && <div className="absolute bottom-[35%] left-[20%] w-48 h-[1px] bg-gradient-to-r from-transparent via-amber-500/20 to-transparent pointer-events-none -rotate-12" />}
                            {currentSubtitleIndex === 3 && <div className="absolute top-[20%] right-[25%] w-48 h-[1px] bg-gradient-to-r from-emerald-500/20 to-transparent pointer-events-none" />}

                            {/* 4. 仅在赛博模式下挂载漂浮微标 */}
                            {bgStyle === 'cyber' && 'icon' in activeScheme && activeScheme.icon}

                            {/* 5. 巨大中置场景水印：针对 9:16 自适应防止字体溢出或拉伸变形 */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none p-4">
                              <span className={`text-white font-bold tracking-widest font-sans opacity-[0.04] uppercase select-none whitespace-nowrap text-center block leading-none transition-all ${
                                aspectRatio === '9/16' ? 'text-3xl tracking-wide' : 'text-[64px]'
                              }`}>
                                SCENE {currentSubtitleIndex + 1}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </motion.div>
                  </AnimatePresence>

                  {/* Aesthetic visual content preview mockup - 顶层 UI 覆盖层 */}
                  <div className="absolute top-4 right-4 z-10 px-2 py-1 bg-slate-950/60 backdrop-blur-md border border-slate-800/40 text-[9px] font-mono text-indigo-400 rounded-md pointer-events-none select-none">
                    {aspectRatio === '9/16' ? '1080x1920 (9:16)' : '1920x1080 (16:9)'} • 23.976 fps
                  </div>

                  {/* Alignment guide grids (Shown during manual dragging) */}
                  <AnimatePresence>
                    {dragging && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.4 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 pointer-events-none z-10"
                      >
                        {/* Horizontal Alignment Guides */}
                        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 border-l border-dashed border-indigo-400" />
                        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 border-t border-dashed border-indigo-400" />
                        
                        {/* Horizontal limits boundaries guides */}
                        <div className="absolute left-0 right-0 top-[16%] h-[0.5px] border-t border-red-500/20" />
                        <div className="absolute left-0 right-0 bottom-[16%] h-[0.5px] border-t border-red-500/20" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Drag Handle Indicator - 字幕拖拽层 */}
                  <div 
                    className="absolute z-30 transition-transform duration-100 ease-out flex justify-center pointer-events-none"
                    style={{
                      left: subtitlePosPercent.left,
                      top: subtitlePosPercent.top,
                      transform: 'translate(-50%, -50%)',
                      width: '100%',
                    }}
                  >
                    {/* Simulated Text Subtitle Layer - 字幕独立于背景转场 */}
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={`subtitle-${transitionTrigger}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        style={{
                          ...getSubtitleStyle(),
                        }}
                        className="shadow-2xl"
                      >
                        {getCurrentSubtitle()}
                      </motion.div>
                    </AnimatePresence>

                    {/* Miniature anchor locator handle showing when hovering on video or dragging */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-indigo-500/40 bg-indigo-500/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                    </div>
                  </div>

                  {/* Active absolute Coordinates Overlay */}
                  <div className="absolute bottom-4 left-4 z-15 px-3 py-1.5 bg-slate-950/80 backdrop-blur border border-slate-800 text-[10px] font-mono text-slate-300 rounded-lg flex items-center gap-2">
                    <span className="text-slate-500">坐标基准:</span>
                    <span className="text-indigo-400 font-bold">{config.subtitle.position.toUpperCase()}</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-slate-500">X:</span>
                    <span className={`${config.subtitle.x_offset !== 0 ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}>
                      {config.subtitle.x_offset > 0 ? `+${config.subtitle.x_offset}` : config.subtitle.x_offset}
                    </span>
                    <span className="text-slate-500">Y:</span>
                    <span className={`${config.subtitle.y_offset !== 0 ? 'text-amber-400 font-semibold' : 'text-slate-300'}`}>
                      {config.subtitle.y_offset > 0 ? `+${config.subtitle.y_offset}` : config.subtitle.y_offset}
                    </span>
                  </div>
                </div>
                {/* 关闭 canvas sandbox div (preview-canvas-sandbox) */}

                {/* Subtitle Playback Control Info message */}
                <p className="text-xs text-slate-400 mt-3 text-center leading-relaxed">
                  💡 <span className="text-indigo-400 font-medium">交互提示：</span>在画布上直接按住随意拖拽调整字幕垂直、水平排版坐标位置。
                </p>

                {/* Preset backdrop switch keys */}
                <div className="flex items-center gap-3 mt-4 text-xs font-medium">
                  <span className="text-slate-600 text-[11px]">预览背景:</span>
                  <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-lg">
                    {[
                      { key: 'cyber', label: '量子波形' },
                      { key: 'relaxing', label: '森林翠色' },
                      { key: 'midnight', label: '星河璀璨' },
                      { key: 'checker', label: '透明网格' },
                    ].map(style => (
                      <button
                        key={style.key}
                        onClick={() => setBgStyle(style.key)}
                        className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${bgStyle === style.key ? 'bg-white border border-slate-200 text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900 border border-transparent'}`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-900/20 border border-dashed border-slate-800/80 rounded-2xl min-h-[300px]">
                <EyeOff className="w-10 h-10 text-slate-600 mb-2" />
                <span className="text-sm font-semibold text-slate-400">实时预览已隐藏</span>
                <span className="text-xs text-slate-550 mt-1">请在顶部控制栏点击 “显示预览”</span>
              </div>
            )}


          </div>

        </div>

      </div>
    </div>
  );
}