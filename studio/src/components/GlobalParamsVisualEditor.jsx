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
    y_offset: -60,
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
  { name: '底部排版', position: 'bottom', y_offset: -65 },
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

  // Auto alternation of subtitles
  useEffect(() => {
    let interval = null;
    if (isPlaying) {
      interval = setInterval(() => {
        setTransitionTrigger(prev => prev + 1);
        setTimeout(() => {
          setCurrentSubtitleIndex(prev => (prev + 1) % sampleSubtitles.length);
        }, (config.pipeline.transition_duration * 1000) / 2);
      }, 4500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, config.pipeline.transition_duration]);

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

    if (position === 'top') {
      baseYPercent = 16;
    } else if (position === 'bottom') {
      baseYPercent = 84;
    } else if (position === 'center') {
      baseYPercent = 50;
    }

    // Offset is -100 to 100, mapping to -50% to +50% range limit
    const leftPercent = baseXPercent + (x_offset / 2);
    // y_offset is positive upwards, so subtract it in HTML coordinate spaces
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
    <div className={`w-full bg-[#0d1321] border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden ${className || ''}`} id="params-visual-editor-root">
      
      {/* Visual Header */}
      <div className="flex md:flex-row flex-col items-start md:items-center justify-between border-b border-slate-800/70 bg-slate-900/40 px-6 py-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
            <Film className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white tracking-wide">全局渲染参数编辑器</h2>
            <p className="text-xs text-slate-400 mt-0.5">可视调节字幕外观、音频通道淡入淡出及转场效果</p>
          </div>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2 self-stretch md:self-auto justify-between md:justify-end">
          <div className="flex items-center bg-slate-950/70 border border-slate-800/80 p-0.5 rounded-lg">
            <button
              onClick={() => setShowPreview(true)}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${showPreview ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>显示预览</span>
            </button>
            <button
              onClick={() => setShowPreview(false)}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${!showPreview ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>隐藏预览</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <CustomTooltip tip="重置全部配置">
              <button 
                onClick={resetToDefault}
                className="p-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 text-rose-400 hover:text-rose-300 rounded-lg transition-colors"
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
        <div className="col-span-1 lg:col-span-5 border-r border-slate-800/40 flex flex-col h-[650px] overflow-hidden bg-slate-950/20">
          
          {/* Navigation Tabs bar */}
          <div className="flex border-b border-slate-800/60 bg-slate-950/40 p-1">
            {[
              { id: 'subtitle', label: '字幕视觉', icon: Type, hue: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/10' },
              { id: 'audio', label: '声学增益', icon: Music, hue: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/10' },
              { id: 'pipeline', label: '转场机制', icon: Sliders, hue: 'text-amber-400 bg-amber-500/10 border-amber-500/10' },
            ].map(tab => {
              const IconComponent = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-1 text-xs font-medium transition-all duration-200 border-b-2 ${
                    isSelected 
                      ? 'border-indigo-500 text-white bg-slate-900/50' 
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
                  }`}
                  id={`tab-button-${tab.id}`}
                >
                  <IconComponent className={`w-4 h-4 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content Panel (Scrollable content) */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* SUBTITLES TAB */}
            {activeTab === 'subtitle' && (
              <div className="space-y-6" id="subtitle-config-group">
                
                {/* Style Presets */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-indigo-400" />
                      艺术化设计预设
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PRESET_STYLES.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className="group flex flex-col items-start p-3 bg-slate-900/40 hover:bg-indigo-950/10 border border-slate-800/60 hover:border-indigo-900/40 rounded-xl transition-all duration-200 text-left cursor-pointer"
                      >
                        <span className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">{preset.name}</span>
                        <span className="text-[10px] text-slate-400 mt-1 line-clamp-1 leading-snug">{preset.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subtitle Positioning Layout Nodes */}
                <div className="pt-2 border-t border-slate-850">
                  <span className="text-xs font-semibold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5 mb-3">
                    <Move className="w-3.5 h-3.5 text-indigo-400" />
                    位置排版预设
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
                              ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 shadow-sm shadow-indigo-950/20 font-semibold' 
                              : 'bg-slate-900/40 hover:bg-slate-900/80 border-slate-800/80 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Font Size & Box Controls */}
                <div className="space-y-4 pt-4 border-t border-slate-850">
                  
                  {/* Slider: Font Size */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-slate-400" />
                        字体字号 (Standard Scale)
                      </label>
                      <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/30 border border-indigo-900/30 px-1.5 py-0.5 rounded">
                        {config.subtitle.font_size}px
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => updateConfig('subtitle', 'font_size', Math.max(40, config.subtitle.font_size - 4))}
                        className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="range"
                        min="30"
                        max="140"
                        value={config.subtitle.font_size}
                        onChange={(e) => updateConfig('subtitle', 'font_size', parseInt(e.target.value))}
                        className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => updateConfig('subtitle', 'font_size', Math.min(140, config.subtitle.font_size + 4))}
                        className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Slider: Max Width (Auto-wrap) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                        <Move className="w-3.5 h-3.5 text-slate-400" />
                        单行文字最大宽度占比 (满足此长度自动换行/回车)
                      </label>
                      <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/30 border border-indigo-900/30 px-1.5 py-0.5 rounded">
                        {config.subtitle.max_width}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => updateConfig('subtitle', 'max_width', Math.max(20, config.subtitle.max_width - 5))}
                        className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
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
                        className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => updateConfig('subtitle', 'max_width', Math.min(100, config.subtitle.max_width + 5))}
                        className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Slider: Line Spacing */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-slate-400" />
                        多行文字行间距
                      </label>
                      <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-950/30 border border-indigo-900/30 px-1.5 py-0.5 rounded">
                        {config.subtitle.line_spacing}x
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => updateConfig('subtitle', 'line_spacing', parseFloat(Math.max(1.0, config.subtitle.line_spacing - 0.1).toFixed(1)))}
                        className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
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
                        className="flex-1 accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <button 
                        onClick={() => updateConfig('subtitle', 'line_spacing', parseFloat(Math.min(2.5, config.subtitle.line_spacing + 0.1).toFixed(1)))}
                        className="p-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Dual Color Picker Blocks */}
                  <div className="grid grid-cols-2 gap-3.5">
                    {/* Color: Subtitle text */}
                    <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-3">
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">文字基色</label>
                      <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-800 flex-shrink-0 cursor-pointer">
                          <input
                            type="color"
                            value={config.subtitle.color.startsWith('rgba') ? '#FFFFFF' : config.subtitle.color}
                            onChange={(e) => updateConfig('subtitle', 'color', e.target.value)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          />
                          <div 
                            className="w-full h-full border border-black/10 rounded-lg"
                            style={{ backgroundColor: config.subtitle.color }}
                          />
                        </div>
                        <input
                          type="text"
                          value={config.subtitle.color}
                          onChange={(e) => updateConfig('subtitle', 'color', e.target.value)}
                          className="w-full min-w-0 bg-slate-950 border border-slate-800/60 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Color: Stroke color */}
                    <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-3">
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">描边外廓</label>
                      <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-800 flex-shrink-0 cursor-pointer">
                          <input
                            type="color"
                            value={config.subtitle.stroke_color === 'transparent' || config.subtitle.stroke_color === '' ? '#000000' : config.subtitle.stroke_color}
                            onChange={(e) => updateConfig('subtitle', 'stroke_color', e.target.value)}
                            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                          />
                          <div 
                            className="w-full h-full border border-black/10 rounded-lg"
                            style={{ backgroundColor: config.subtitle.stroke_color === 'transparent' ? '#111827' : config.subtitle.stroke_color }}
                          />
                        </div>
                        <div className="relative flex-1 min-w-0">
                          <input
                            type="text"
                            value={config.subtitle.stroke_color}
                            onChange={(e) => updateConfig('subtitle', 'stroke_color', e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800/60 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stroke Width Slider */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
                        <span>文字描边宽度 (文字外边框)</span>
                      </label>
                      <span className="font-mono text-xs font-bold text-slate-400">
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
                      className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Background Mask Color Setting */}
                  <div className="bg-slate-900/30 border border-slate-800/40 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-300">背景遮罩面板</label>
                      <button 
                        onClick={() => updateConfig('subtitle', 'background_color', config.subtitle.background_color === 'transparent' ? 'rgba(0,0,0,0.6)' : 'transparent')}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          config.subtitle.background_color !== 'transparent' 
                            ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-300' 
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {config.subtitle.background_color !== 'transparent' ? '已启用' : '已禁用'}
                      </button>
                    </div>

                    {config.subtitle.background_color !== 'transparent' && (
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value="#000000"
                            onChange={(e) => {
                              // Re-construct opacity of .6 for standard background ease
                              updateConfig('subtitle', 'background_color', `rgba(0, 0, 0, 0.65)`);
                            }}
                            className="w-7 h-7 rounded border border-slate-800 cursor-pointer overflow-hidden bg-transparent"
                            disabled
                          />
                          <input
                            type="text"
                            value={config.subtitle.background_color}
                            onChange={(e) => updateConfig('subtitle', 'background_color', e.target.value)}
                            placeholder="bg color hex or rgba"
                            className="w-full bg-slate-950 border border-slate-850 rounded px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none"
                          />
                        </div>

                        {/* Background radius & padding */}
                        <div className="grid grid-cols-2 gap-3.5">
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                              <span>遮罩圆角</span>
                              <span>{config.subtitle.background_radius}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="24"
                              value={config.subtitle.background_radius}
                              onChange={(e) => updateConfig('subtitle', 'background_radius', parseInt(e.target.value))}
                              className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-none appearance-none"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                              <span>遮罩内边距</span>
                              <span>{config.subtitle.background_padding}px</span>
                            </div>
                            <input
                              type="range"
                              min="4"
                              max="20"
                              value={config.subtitle.background_padding}
                              onChange={(e) => updateConfig('subtitle', 'background_padding', parseInt(e.target.value))}
                              className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-none appearance-none"
                            />
                          </div>
                        </div>

                        {/* Background Border settings */}
                        <div className="grid grid-cols-2 gap-3.5 pt-1 border-t border-slate-800/40">
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                              <span>遮罩外框线宽</span>
                              <span>{config.subtitle.background_border_width || 0}px</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="8"
                              step="1"
                              value={config.subtitle.background_border_width || 0}
                              onChange={(e) => updateConfig('subtitle', 'background_border_width', parseInt(e.target.value))}
                              className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-none appearance-none cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                              <span>遮罩边边框色</span>
                              <span className="font-mono text-[9px] text-slate-500">{(config.subtitle.background_border_color || '#FFFFFF').toUpperCase()}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="relative w-5 h-5 rounded overflow-hidden border border-slate-850 cursor-pointer flex-shrink-0">
                                <input
                                  type="color"
                                  value={config.subtitle.background_border_color || '#FFFFFF'}
                                  onChange={(e) => updateConfig('subtitle', 'background_border_color', e.target.value)}
                                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer animate-none"
                                />
                                <div 
                                  className="w-full h-full border border-black/10 rounded"
                                  style={{ backgroundColor: config.subtitle.background_border_color || '#FFFFFF' }}
                                />
                              </div>
                              <input
                                type="text"
                                value={config.subtitle.background_border_color || '#FFFFFF'}
                                onChange={(e) => updateConfig('subtitle', 'background_border_color', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-850 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-350 focus:outline-none"
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
                      <div className="flex justify-between text-xs text-slate-350 mb-1.5">
                        <span className="flex items-center gap-1">水平偏调 (X)</span>
                        <span className="font-mono font-bold text-slate-400">{config.subtitle.x_offset}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={config.subtitle.x_offset}
                        onChange={(e) => updateConfig('subtitle', 'x_offset', parseInt(e.target.value))}
                        className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-350 mb-1.5">
                        <span className="flex items-center gap-1">垂直偏调 (Y)</span>
                        <span className="font-mono font-bold text-slate-400">{config.subtitle.y_offset}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={config.subtitle.y_offset}
                        onChange={(e) => updateConfig('subtitle', 'y_offset', parseInt(e.target.value))}
                        className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* AUDIO CONFIG TAB */}
            {activeTab === 'audio' && (
              <div className="space-y-6" id="audio-config-group">
                <div className="p-4 bg-slate-900/30 border border-slate-800/50 rounded-2xl flex items-start gap-3">
                  <Volume2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-xs font-semibold text-slate-200">音频层与音量均衡</h4>
                    <p className="text-[11px] text-slate-450 mt-1 leading-relaxed">融合多轨音频资源。调节背景音乐、原生人声的默认输出功率及淡入淡出包络器曲线。</p>
                  </div>
                </div>

                {/* Slider: original sound */}
                <div className="space-y-4 pt-2">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-350">
                        视频原声音轨音量系数
                      </label>
                      <span className="font-mono text-xs font-bold text-emerald-400">
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
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Slider: BGM sound */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-350">
                        BGM 背景音乐音量系数
                      </label>
                      <span className="font-mono text-xs font-bold text-emerald-400">
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
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Loop Switch Toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800/85 rounded-xl">
                    <div className="space-y-0.5">
                      <label htmlFor="bgm_loop" className="text-xs font-semibold text-slate-200 cursor-pointer">BGM 无缝循环播放</label>
                      <p className="text-[10px] text-slate-450">当背景音乐短于视频时间时自动从头循环</p>
                    </div>
                    <input
                      type="checkbox"
                      id="bgm_loop"
                      checked={config.audio.bgm_loop}
                      onChange={(e) => updateConfig('audio', 'bgm_loop', e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer"
                    />
                  </div>

                  {/* Fading Time Envelopes */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="flex justify-between text-xs text-slate-350 mb-1.5">
                        <span>淡入包络时长</span>
                        <span className="font-mono font-semibold text-emerald-400">{config.audio.fade_in_duration}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.1"
                        value={config.audio.fade_in_duration}
                        onChange={(e) => updateConfig('audio', 'fade_in_duration', parseFloat(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-350 mb-1.5">
                        <span>淡出包络时长</span>
                        <span className="font-mono font-semibold text-emerald-400">{config.audio.fade_out_duration}s</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="4"
                        step="0.1"
                        value={config.audio.fade_out_duration}
                        onChange={(e) => updateConfig('audio', 'fade_out_duration', parseFloat(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* PIPELINE & TRANSITIONS TAB */}
            {activeTab === 'pipeline' && (
              <div className="space-y-6" id="pipeline-config-group">
                
                {/* Switch: Use transition rendering */}
                <div className="flex items-center justify-between p-4 bg-slate-900/30 border border-slate-800/80 rounded-xl">
                  <div className="space-y-0.5">
                    <label htmlFor="use_transitions" className="text-xs font-semibold text-slate-200 cursor-pointer flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      渲染片段间转场效果
                    </label>
                    <p className="text-[10px] text-slate-450">开启后各视频片段重合区将自动插值渲染动画</p>
                  </div>
                  <input
                    type="checkbox"
                    id="use_transitions"
                    checked={config.pipeline.use_transitions}
                    onChange={(e) => updateConfig('pipeline', 'use_transitions', e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer"
                  />
                </div>

                {config.pipeline.use_transitions && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-5"
                  >
                    
                    {/* Select: Transition type */}
                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-2">转场特效类型</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['fade', 'slide', 'zoom', 'blur']).map(type => (
                          <button
                            key={type}
                            onClick={() => updateConfig('pipeline', 'transition_type', type)}
                            className={`p-2.5 text-xs text-center border rounded-xl capitalize transition-all ${
                              config.pipeline.transition_type === type
                                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold'
                                : 'bg-slate-900/40 hover:bg-slate-900/80 border-slate-800/60 text-slate-400'
                            }`}
                          >
                            {type === 'fade' && '淡入淡出 (Fade)'}
                            {type === 'slide' && '滑动切片 (Slide)'}
                            {type === 'zoom' && '呼吸缩放 (Zoom)'}
                            {type === 'blur' && '高斯模糊 (Blur)'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Transition Duration slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-slate-300">
                          转场特效插值时长
                        </label>
                        <span className="font-mono text-xs font-bold text-amber-400">
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
                        className="w-full accent-amber-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-450 mt-1">
                        <span>极速 (0.2s)</span>
                        <span>平缓 (2.0s)</span>
                      </div>
                    </div>

                  </motion.div>
                )}

                {/* Subtitle Alignment / Resync setting */}
                <div className="flex items-center justify-between p-4 bg-slate-900/30 border border-slate-800/80 rounded-xl">
                  <div className="space-y-0.5">
                    <label htmlFor="resync_subtitle" className="text-xs font-semibold text-slate-200 cursor-pointer">
                      自动修正声轨与字幕对齐 (Resync)
                    </label>
                    <p className="text-[10px] text-slate-450">当视频帧率波动或变速时强制对齐 ASS 与音频戳</p>
                  </div>
                  <input
                    type="checkbox"
                    id="resync_subtitle"
                    checked={config.pipeline.resync_subtitle}
                    onChange={(e) => updateConfig('pipeline', 'resync_subtitle', e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 accent-amber-500 cursor-pointer"
                  />
                </div>

                {/* Subtitle ASS script generation toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-900/30 border border-slate-800/80 rounded-xl">
                  <div className="space-y-0.5">
                    <label htmlFor="need_ass" className="text-xs font-semibold text-slate-200 cursor-pointer">
                      同时输出 ASS 原始字幕文件
                    </label>
                    <p className="text-[10px] text-slate-450">渲染的同时生成外置字幕包输出</p>
                  </div>
                  <input
                    type="checkbox"
                    id="need_ass"
                    checked={config.output.need_ass}
                    onChange={(e) => updateConfig('output', 'need_ass', e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-500 accent-indigo-500 cursor-pointer"
                  />
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Right Side Video Layout Live Preview Screen */}
        <div className="col-span-1 lg:col-span-7 flex flex-col p-6 space-y-6">
          
          {/* Preview Panel Box Wrapper */}
          <div className="flex flex-col flex-1">
            
            {/* Header info bar of the preview */}
            <div className="flex sm:flex-row flex-col items-start sm:items-center justify-between mb-4 text-xs text-slate-300 font-medium gap-2">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Film className="w-4 h-4 text-indigo-400" />
                超清多轨渲染实时预览
              </span>
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
                {/* Aspect ratio toggler */}
                <div className="flex bg-slate-950 border border-slate-800/80 p-0.5 rounded-lg">
                  <button
                    onClick={() => setAspectRatio('9/16')}
                    className={`px-2 py-1 rounded text-[10.5px] font-semibold transition-all ${aspectRatio === '9/16' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-450 hover:text-white hover:bg-slate-900'}`}
                  >
                    9:16 竖屏 (短视频)
                  </button>
                  <button
                    onClick={() => setAspectRatio('16/9')}
                    className={`px-2 py-1 rounded text-[10.5px] font-semibold transition-all ${aspectRatio === '16/9' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-450 hover:text-white hover:bg-slate-900'}`}
                  >
                    16:9 横屏
                  </button>
                </div>

                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`px-2 py-1 rounded text-[10.5px] font-semibold flex items-center gap-1 transition-all ${isPlaying ? 'bg-indigo-650/30 text-indigo-300 border border-indigo-500/30' : 'bg-slate-900 text-slate-450 hover:text-white border border-slate-800/60'}`}
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
                        key={`${currentSubtitleIndex}-${transitionTrigger}`}
                        initial={getTransitionAnimation().initial}
                        animate={getTransitionAnimation().animate}
                        exit={{ opacity: 0 }}
                        transition={getTransitionAnimation().transition}
                        style={{
                          ...getSubtitleStyle(),
                        }}
                        className="shadow-2xl"
                      >
                        {sampleSubtitles[currentSubtitleIndex].zh}
                        <div className="opacity-75 font-normal text-[0.8em] font-sans mt-1">
                          {sampleSubtitles[currentSubtitleIndex].en}
                        </div>
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
                  <span className="text-slate-400 text-[11px]">切换视频背景:</span>
                  <div className="flex bg-slate-900 border border-slate-800 p-0.5 rounded-lg">
                    {[
                      { key: 'cyber', label: '量子波形' },
                      { key: 'relaxing', label: '森林翠色' },
                      { key: 'midnight', label: '星河璀璨' },
                      { key: 'checker', label: '透明网格' },
                    ].map(style => (
                      <button
                        key={style.key}
                        onClick={() => setBgStyle(style.key)}
                        className={`px-3 py-1 text-[11px] font-medium rounded-md transition-all ${bgStyle === style.key ? 'bg-slate-850 border border-slate-700 text-white' : 'text-slate-400 hover:text-white border border-transparent'}`}
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

            {/* Config JSON Payload Inspector */}
            <div className="mt-auto pt-6 border-t border-slate-800/40">
              <div className="flex items-center justify-between mb-3 text-xs font-semibold uppercase text-indigo-400 tracking-wider">
                <span>实时渲染参数 JSON 数据流</span>
                <button 
                  onClick={copyJsonPayload}
                  className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-300 font-semibold bg-slate-900 hover:bg-slate-850 px-2 py-1 rounded border border-slate-850 hover:border-slate-700 transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? '已复制' : '复制数据'}</span>
                </button>
              </div>

              <div className="relative rounded-xl border border-slate-800/80 bg-slate-950/80 p-4 max-h-[160px] overflow-y-auto">
                <pre className="font-mono text-[11px] text-slate-350 leading-relaxed whitespace-pre-wrap">
                  {JSON.stringify(config, null, 2)}
                </pre>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}