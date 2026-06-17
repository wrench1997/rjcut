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
  Film
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// 测试音源数据
const TEST_BGM_TRACKS = [
  {
    id: 'lofi',
    name: '温馨 Lofi',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    genre: 'Lofi / Chill',
  },
  {
    id: 'tech',
    name: '科技电子',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    genre: 'Synthwave',
  },
  {
    id: 'epic',
    name: '史诗交响',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    genre: 'Orchestral',
  },
  {
    id: 'ambient',
    name: '空灵极简',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    genre: 'Ambient',
  },
  {
    id: 'jazz',
    name: '休闲爵士',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
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
 */

/**
 * @param {GlobalParamsVisualEditorProps} props
 */
export default function GlobalParamsVisualEditor({ 
  value, 
  onChange, 
  className 
}) {
  const [config, setConfig] = useState({
    pipeline: { ...DEFAULT_CONFIG.pipeline, ...(value?.pipeline || {}) },
    subtitle: { ...DEFAULT_CONFIG.subtitle, ...(value?.subtitle || {}) },
    audio: { ...DEFAULT_CONFIG.audio, ...(value?.audio || {}) },
    output: { ...DEFAULT_CONFIG.output, ...(value?.output || {}) }
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
    if (playingTrackUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(playingTrackUrl);
      } else if (audioRef.current.src !== playingTrackUrl) {
        audioRef.current.src = playingTrackUrl;
      }
      
      audioRef.current.volume = config.audio.bgm_volume;
      audioRef.current.loop = config.audio.bgm_loop;
      
      const handleEnded = () => {
        if (!config.audio.bgm_loop) {
          setIsPlayingBgm(false);
        }
      };
      
      audioRef.current.addEventListener('ended', handleEnded);
      
      if (isPlayingBgm) {
        audioRef.current.play().catch(err => {
          console.warn('音频播放失败:', err);
          setIsPlayingBgm(false);
        });
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
  }, [playingTrackUrl, isPlayingBgm]);

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
      setTimeout(() => {
        onChange?.(newConfig);
      }, 0);
      return newConfig;
    });
  }, [onChange]);

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

  // Subtitle transition simulation animation configurations
  const getTransitionAnimation = () => {
    const { transition_type, transition_duration } = config.pipeline;
    const duration = transition_duration;

    switch (transition_type) {
      case 'slide':
        return {
          initial: { opacity: 0, y: 15 },
          animate: { opacity: 1, y: 0 },
          transition: { duration, ease: "easeOut" }
        };
      case 'zoom':
        return {
          initial: { opacity: 0, scale: 0.8 },
          animate: { opacity: 1, scale: 1 },
          transition: { duration, ease: "easeOut" }
        };
      case 'blur':
        return {
          initial: { opacity: 0, filter: "blur(10px)" },
          animate: { opacity: 1, filter: "blur(0px)" },
          transition: { duration }
        };
      case 'fade':
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: { duration }
        };
    }
  };

  // Copy JSON payload utility
  const copyJsonPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
                  
                  {/* Checkerboard backgrounds / visuals matching the style states */}
                  {bgStyle === 'checker' && (
                    <div className="absolute inset-0 z-0 bg-[#161b22]" style={{
                      backgroundImage: `
                        linear-gradient(45deg, #0d1117 25%, transparent 25%),
                        linear-gradient(-45deg, #0d1117 25%, transparent 25%),
                        linear-gradient(45deg, transparent 75%, #0d1117 75%),
                        linear-gradient(-45deg, transparent 75%, #0d1117 75%)
                      `,
                      backgroundSize: '24px 24px',
                      backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0px'
                    }} />
                  )}

                  {bgStyle === 'cyber' && (
                    <div className="absolute inset-0 z-0 bg-[#070b19] overflow-hidden">
                      {/* Grid overlay */}
                      <div className="absolute inset-0 opacity-15 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:30px_30px]" />
                      {/* Dynamic color waves */}
                      <div className="absolute -top-1/2 -left-1/4 w-[150%] h-[150%] opacity-30 bg-[radial-gradient(ellipse_at_top_right,var(--color-indigo-600),transparent_55%)] blur-[80px]" />
                      <div className="absolute -bottom-1/3 -right-1/4 w-[120%] h-[120%] opacity-20 bg-[radial-gradient(circle_at_bottom_left,var(--color-fuchsia-600),transparent_50%5)] blur-[100px]" />
                      <div className="absolute top-1/4 left-1/3 w-[150px] h-[150px] rounded-full border border-indigo-500/10 animate-ping duration-10000" />
                    </div>
                  )}

                  {bgStyle === 'relaxing' && (
                    <div className="absolute inset-0 z-0 bg-gradient-to-tr from-teal-900/40 via-emerald-950/30 to-slate-900" />
                  )}

                  {bgStyle === 'midnight' && (
                    <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#121829] to-[#040815]" />
                  )}

                  {/* Aesthetic visual content preview mockup */}
                  <div className="absolute top-4 right-4 z-10 px-2 py-1 bg-slate-950/60 backdrop-blur-md border border-slate-800/40 text-[9px] font-mono text-indigo-400 rounded-md">
                    23.976 fps • 10-bit H.265
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

                  {/* Drag Handle Indicator */}
                  <div 
                    className="absolute z-30 transition-transform duration-100 ease-out flex justify-center pointer-events-none"
                    style={{
                      left: subtitlePosPercent.left,
                      top: subtitlePosPercent.top,
                      transform: 'translate(-50%, -50%)',
                      width: '100%',
                    }}
                  >
                    {/* Simulated Text Subtitle Layer */}
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`subtitle-${transitionTrigger}`}
                        initial={getTransitionAnimation().initial}
                        animate={getTransitionAnimation().animate}
                        exit={{ opacity: 0 }}
                        transition={getTransitionAnimation().transition}
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