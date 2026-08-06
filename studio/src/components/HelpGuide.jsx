import React, { useState } from 'react';
import { Layers, Folder, Sparkles, FileText, Settings, HelpCircle, Clapperboard, Clipboard, Search, Lightbulb, Video, Image, RefreshCw, Book } from 'lucide-react';

/**
 * HelpGuide - 前端使用说明和脚本格式帮助指南
 * 采用 Apple 设计风格的模态弹窗组件
 */
function HelpGuide({ onClose, onOpenTutorial }) {
  const [activeTab, setActiveTab] = useState('quickstart');

  const tabs = [
    { id: 'quickstart', label: '快速开始', icon: <Video size={16} /> },
    { id: 'batch', label: '批量处理', icon: <Layers size={16} /> },
    { id: 'files', label: '文件浏览', icon: <Folder size={16} /> },
    { id: 'digital-human', label: '数字人创作', icon: <Sparkles size={16} /> },
    { id: 'script', label: '脚本格式', icon: <FileText size={16} /> },
    { id: 'config', label: '高级配置', icon: <Settings size={16} /> },
    { id: 'faq', label: '常见问题', icon: <HelpCircle size={16} /> },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '12px',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f9f9f9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Book size={20} /> RJCut Studio 使用指南
            </h2>
            {onOpenTutorial && (
              <button
                onClick={onOpenTutorial}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563eb', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                <Sparkles size={14} /> 新手教程
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="关闭使用指南"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#86868b',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#e5e5e5')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            ✕
          </button>
        </div>

        {/* 标签页导航 */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #e5e5e5',
            backgroundColor: '#fafafa',
            padding: '0 24px',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? '#0071e3' : '#86868b',
                borderBottom: activeTab === tab.id ? '2px solid #0071e3' : '2px solid transparent',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseOver={(e) => {
                if (activeTab !== tab.id) e.target.style.backgroundColor = '#f0f0f0';
              }}
              onMouseOut={(e) => {
                if (activeTab !== tab.id) e.target.style.backgroundColor = 'transparent';
              }}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 内容区域 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
          }}
        >
          {activeTab === 'quickstart' && <QuickStartContent onOpenTutorial={onOpenTutorial} />}
          {activeTab === 'batch' && <BatchModuleContent />}
          {activeTab === 'files' && <FileBrowserModuleContent />}
          {activeTab === 'digital-human' && <DigitalHumanModuleContent />}
          {activeTab === 'script' && <ScriptFormatContent />}
          {activeTab === 'config' && <CustomConfigContent />}
          {activeTab === 'faq' && <FAQContent />}
        </div>
      </div>
    </div>
  );
}

function QuickStartContent({ onOpenTutorial }) {
  const steps = [
    ['1', '数字人创作', '先选择数字人形象、场景和文案，生成一条基础视频。'],
    ['2', '模板混剪', '用基础视频搭配模板和场景素材，批量扩展成片。'],
    ['3', '项目与文件', '项目看进度和配置，素材与文件查找具体文件和导出结果。'],
  ]

  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Video size={18} /> 用 3 步完成第一条视频
      </h3>
      <p style={{ marginBottom: '20px', color: '#3a3a3c' }}>
        不确定从哪里开始时，按下面的顺序操作即可。熟悉后也可以直接跳过教程，从左侧导航进入任意模块。
      </p>

      <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
        {steps.map(([number, title, description]) => (
          <div key={number} style={{ display: 'flex', gap: '12px', padding: '14px 16px', border: '1px solid #e5e5e5', borderRadius: '10px', backgroundColor: '#fff' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', flexShrink: 0, borderRadius: '50%', backgroundColor: '#eff6ff', color: '#2563eb', fontWeight: 700, fontSize: '13px' }}>{number}</span>
            <div>
              <h4 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600 }}>{title}</h4>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '13px' }}>{description}</p>
            </div>
          </div>
        ))}
      </div>

      {onOpenTutorial && (
        <button
          type="button"
          onClick={onOpenTutorial}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: 'none', borderRadius: '8px', padding: '10px 14px', backgroundColor: '#2563eb', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          <Sparkles size={15} /> 打开交互式新手教程
        </button>
      )}
    </div>
  )
}

/**
 * 批量处理模块内容
 */
function BatchModuleContent() {
  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Layers size={18} /> 批量处理模块
      </h3>
      <p style={{ marginBottom: '16px', color: '#3a3a3c' }}>
        批量处理模块用于同时处理多个视频剪辑任务，支持数字人视频与场景素材的自动合成。
      </p>

      <div
        style={{
          backgroundColor: '#f5f5f7',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>核心功能</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c' }}>
          <li><strong>数字人视频选择</strong> - 从文件管理中选择已生成的数字人视频</li>
          <li><strong>场景配置</strong> - 为每个场景配置脚本文件和背景音乐</li>
          <li><strong>批量处理</strong> - 一个数字人视频可对应多个场景，批量生成</li>
          <li><strong>并发控制</strong> - 可配置同时处理的任务数量（1-10）</li>
          <li><strong>进度查看</strong> - 实时查看每个任务的处理进度和状态</li>
        </ul>
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clipboard size={18} /> 使用步骤
      </h3>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          1. 选择数字人视频
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          从文件管理中选择已生成的数字人视频。如果没有数字人视频，请先前往 <strong>数字人创作台</strong> 生成。
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          2. 添加场景配置
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          点击 <strong>+ 添加场景</strong> 按钮，为每个场景配置：
        </p>
        <ul style={{ margin: '8px 0 0 20px', color: '#3a3a3c' }}>
          <li><strong>场景文件夹</strong>（必填）- 包含场景素材的目录</li>
          <li><strong>脚本文件</strong>（可选）- JSON 格式脚本，定义每个片段的内容</li>
          <li><strong>背景音乐</strong>（可选）- MP3/WAV 等音频文件</li>
        </ul>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          3. 全局配置（可选）
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          可设置全局的纠错字典文件，用于修正 ASR 识别错误。
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          4. 开始处理
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          点击 <strong>开始批量处理</strong> 按钮，系统会自动处理所有场景配置。处理完成后可在任务列表中查看结果。
        </p>
      </div>
    </div>
  );
}

/**
 * 文件浏览模块内容
 */
function FileBrowserModuleContent() {
  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Folder size={18} /> 文件浏览模块
      </h3>
      <p style={{ marginBottom: '16px', color: '#3a3a3c' }}>
        文件浏览模块用于管理所有项目文件和素材，支持视频、音频、图片、脚本等文件类型。
      </p>

      <div
        style={{
          backgroundColor: '#f5f5f7',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>核心功能</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c' }}>
          <li><strong>项目管理</strong> - 按项目组织文件，每个项目包含独立的素材和输出</li>
          <li><strong>文件预览</strong> - 支持视频、音频、图片、文本文件的在线预览</li>
          <li><strong>文件操作</strong> - 支持上传、删除、重命名、复制、移动等操作</li>
          <li><strong>多种视图</strong> - 支持列表视图和网格视图切换</li>
          <li><strong>文件筛选</strong> - 可按文件类型筛选（视频/音频/图片/文档）</li>
        </ul>
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clipboard size={18} /> 项目结构
      </h3>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          标准项目目录
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c' }}>
          <li><strong>文案</strong> - 存放文案和数字人生成视频</li>
          <li><strong>场景素材</strong> - 存放模板混剪使用的场景素材</li>
          <li><strong>成片</strong> - 存放最终生成的视频文件</li>
        </ul>
      </div>

      <div
        style={{
          backgroundColor: '#e7f3ff',
          border: '1px solid #0071e3',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#0071e3', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Lightbulb size={14} /> 使用提示
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#0071e3', fontSize: '13px' }}>
          <li>双击文件夹可进入，双击文件可预览</li>
          <li>右键点击文件可进行复制、剪切、删除等操作</li>
          <li>使用顶部工具栏可快速导航和搜索文件</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * 数字人创作模块内容
 */
function DigitalHumanModuleContent() {
  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Sparkles size={18} /> 数字人创作模块
      </h3>
      <p style={{ marginBottom: '16px', color: '#3a3a3c' }}>
        数字人创作模块用于生成数字人播报视频，支持批量文案和多种高级设置。
      </p>

      <div
        style={{
          backgroundColor: '#f5f5f7',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 600 }}>核心功能</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c' }}>
          <li><strong>数字人选择</strong> - 从公共或自定义数字人库中选择出镜形象</li>
          <li><strong>批量文案</strong> - 一次输入多条文案，批量生成多个视频</li>
          <li><strong>声音选择</strong> - 可选择不同的配音角色</li>
          <li><strong>高级设置</strong> - 支持语速、语调、音量、背景等精细调节</li>
          <li><strong>项目保存</strong> - 生成的视频自动保存到指定项目的场景素材目录</li>
        </ul>
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clipboard size={18} /> 使用步骤
      </h3>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          1. 选择数字人
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          在左侧 9 宫格中选择一位数字人。支持公共数字人和自定义数字人。
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          2. 输入文案
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          在中间区域输入播报文案，可添加多条文案批量生成。
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          3. 高级设置（可选）
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          展开高级设置面板，可调节：
        </p>
        <ul style={{ margin: '8px 0 0 20px', color: '#3a3a3c' }}>
          <li><strong>语速/语调/音量</strong> - 调节播报效果</li>
          <li><strong>背景类型</strong> - 选择纯色、图片或视频背景</li>
          <li><strong>形象类型</strong> - 全身、坐姿、半身像等</li>
          <li><strong>动作选择</strong> - 选择数字人的动作姿态</li>
          <li><strong>驱动模式</strong> - 正常驱动或随机自然驱动</li>
        </ul>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          4. 选择保存项目并生成
        </h4>
        <p style={{ margin: 0, color: '#3a3a3c' }}>
          在右侧选择要保存到的项目，点击 <strong>生成数字人视频</strong> 按钮。生成完成后，视频会自动保存到项目的 <strong>场景素材</strong> 目录。
        </p>
      </div>

      <div
        style={{
          backgroundColor: '#e7f3ff',
          border: '1px solid #0071e3',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#0071e3', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Lightbulb size={14} /> 使用提示
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#0071e3', fontSize: '13px' }}>
          <li>生成的数字人视频可直接在 <strong>批量处理</strong> 模块中使用</li>
          <li>建议先创建项目，再生成数字人视频，方便文件管理</li>
          <li>可在数字人管理模块中创建自定义数字人</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * 脚本格式内容
 */
function ScriptFormatContent() {
  const codeBlockStyle = {
    backgroundColor: '#1d1d1f',
    color: '#f5f5f7',
    padding: '16px',
    borderRadius: '8px',
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: '12px',
    overflowX: 'auto',
    margin: '12px 0',
    lineHeight: 1.5,
  };

  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileText size={18} /> 脚本格式说明
      </h3>
      <p style={{ marginBottom: '16px', color: '#3a3a3c' }}>
        脚本文件采用 JSON 格式，用于定义视频中每个片段的内容和类型。
      </p>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        基础结构
      </h4>
      <pre style={codeBlockStyle}>
{`{
  "segments": [
    {
      "flag": "human",
      "text": "大家好，今天我们来介绍...",
      "start_time": 0.0,
      "end_time": 5.5
    },
    {
      "flag": "scene",
      "text": "产品展示画面",
      "scene_file": "product_demo.mp4",
      "start_time": 5.5,
      "end_time": 12.0
    }
  ]
}`}
      </pre>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', marginTop: '24px', color: '#1d1d1f' }}>
        Segment 字段详解
      </h4>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          marginBottom: '20px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f7' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>字段</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>类型</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>必填</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>flag</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}><strong>是</strong></td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>片段类型：human/scene/transition</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>text</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}><strong>是</strong></td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>该片段对应的字幕文本</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>start_time</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>否</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>片段开始时间（秒）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>end_time</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>否</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>片段结束时间（秒）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>scene_file</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>条件</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>scene 类型必需，场景素材文件名</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>note</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>否</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>备注说明，用于辅助理解</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        Flag 类型说明
      </h4>

      <div style={{ marginBottom: '20px' }}>
        <h5 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Video size={14} /> human（人物出镜）
        </h5>
        <p style={{ margin: '0 0 8px 0', color: '#3a3a3c', fontSize: '13px' }}>
          人物出现在画面中，通常配合口播内容。
        </p>
        <pre style={codeBlockStyle}>
{`{
  "flag": "human",
  "text": "欢迎来到我们的直播间",
  "start_time": 0.0,
  "end_time": 3.5
}`}
        </pre>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h5 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Image size={14} /> scene（场景素材）
        </h5>
        <p style={{ margin: '0 0 8px 0', color: '#3a3a3c', fontSize: '13px' }}>
          展示产品、演示画面等场景素材。
        </p>
        <pre style={codeBlockStyle}>
{`{
  "flag": "scene",
  "text": "这是我们的产品外观",
  "scene_file": "product_show.mp4",
  "start_time": 3.5,
  "end_time": 10.0
}`}
        </pre>
        <div
          style={{
            backgroundColor: '#e7f3ff',
            border: '1px solid #0071e3',
            borderRadius: '6px',
            padding: '10px 14px',
            marginTop: '8px',
            fontSize: '12px',
            color: '#0071e3',
          }}
        >
          <strong>注意：</strong> scene_file 指向场景素材目录中的文件，支持视频（.mp4/.mov）和图片（.jpg/.png），文件名区分大小写。
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h5 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> transition（转场）
        </h5>
        <p style={{ margin: '0 0 8px 0', color: '#3a3a3c', fontSize: '13px' }}>
          用于片段之间的过渡效果。
        </p>
        <pre style={codeBlockStyle}>
{`{
  "flag": "transition",
  "text": "",
  "start_time": 10.0,
  "end_time": 11.0
}`}
        </pre>
      </div>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', marginTop: '24px', color: '#1d1d1f' }}>
        完整脚本示例
      </h4>
      <pre style={codeBlockStyle}>
{`{
  "description": "产品介绍视频脚本",
  "segments": [
    {
      "flag": "human",
      "text": "大家好，今天我们来介绍一款新产品",
      "start_time": 0.0,
      "end_time": 4.0
    },
    {
      "flag": "scene",
      "text": "产品外观设计简洁大方",
      "scene_file": "product_exterior.mp4",
      "start_time": 4.0,
      "end_time": 8.0,
      "note": "展示产品外观特写"
    },
    {
      "flag": "scene",
      "text": "内部结构采用先进工艺",
      "scene_file": "product_interior.jpg",
      "start_time": 8.0,
      "end_time": 12.0
    },
    {
      "flag": "human",
      "text": "总结一下，这款产品非常适合日常使用",
      "start_time": 12.0,
      "end_time": 16.0
    }
  ]
}`}
      </pre>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', marginTop: '24px', color: '#1d1d1f' }}>
        纯场景模式
      </h4>
      <p style={{ marginBottom: '8px', color: '#3a3a3c', fontSize: '13px' }}>
        如果只需要场景素材剪辑，不需要人物出镜，可设置 mode 为 scene_only：
      </p>
      <pre style={codeBlockStyle}>
{`{
  "custom_config": {
    "pipeline": {
      "mode": "scene_only"
    }
  },
  "segments": [
    {
      "flag": "scene",
      "text": "场景一",
      "scene_file": "scene1.mp4"
    },
    {
      "flag": "scene",
      "text": "场景二",
      "scene_file": "scene2.mp4"
    }
  ]
}`}
      </pre>
    </div>
  );
}

/**
 * 纠错字典内容
 */
function CorrectionsContent() {
  const codeBlockStyle = {
    backgroundColor: '#1d1d1f',
    color: '#f5f5f7',
    padding: '16px',
    borderRadius: '8px',
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: '12px',
    overflowX: 'auto',
    margin: '12px 0',
    lineHeight: 1.5,
  };

  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Book size={18} /> 纠错字典格式说明
      </h3>
      <p style={{ marginBottom: '16px', color: '#3a3a3c' }}>
        纠错字典用于 ASR 识别后的文本校正，帮助修正专有名词、人名、产品名等易错词。
      </p>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        基础结构
      </h4>
      <pre style={codeBlockStyle}>
{`{
  "corrections": {
    "雪": "血",
    "路茸": "鹿茸",
    "路场": "鹿场",
    "地板架": "地板价"
  }
}`}
      </pre>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', marginTop: '24px', color: '#1d1d1f' }}>
        字段说明
      </h4>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          marginBottom: '20px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f7' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>字段</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>类型</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>必填</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>corrections</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>对象</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}><strong>是</strong></td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>包含所有纠错映射的字典对象</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', marginTop: '24px', color: '#1d1d1f' }}>
        纠错映射规则
      </h4>
      <div
        style={{
          backgroundColor: '#f5f5f7',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
        }}
      >
        <p style={{ margin: '0 0 12px 0', color: '#3a3a3c', fontSize: '13px' }}>
          <strong>格式：</strong> <code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>"错误词": "正确词"</code>
        </p>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c', fontSize: '13px' }}>
          <li><strong>Key（错误词）：</strong> ASR 可能识别错误的词</li>
          <li><strong>Value（正确词）：</strong> 应该替换成的正确词汇</li>
        </ul>
      </div>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', marginTop: '24px', color: '#1d1d1f' }}>
        完整示例
      </h4>
      <pre style={codeBlockStyle}>
{`{
  "corrections": {
    "雪": "血",
    "路茸": "鹿茸",
    "路场": "鹿场",
    "地板架": "地板价",
    "梅花鹿": "梅花鹿",
    "营养价植": "营养价值",
    "干播": "干播"
  }
}`}
      </pre>

      <div
        style={{
          backgroundColor: '#e7f3ff',
          border: '1px solid #0071e3',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#0071e3', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Lightbulb size={14} /> 使用建议
        </h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#0071e3', fontSize: '13px' }}>
          <li>针对视频中的专有名词、人名、产品名等添加纠错规则</li>
          <li>可以根据 ASR 识别结果不断优化纠错字典</li>
          <li>纠错字典可以复用到多个相似主题的视频中</li>
          <li>系统会在 ASR 识别后自动进行文本替换，无需手动修改</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * 自定义配置内容
 */
function CustomConfigContent() {
  const codeBlockStyle = {
    backgroundColor: '#1d1d1f',
    color: '#f5f5f7',
    padding: '16px',
    borderRadius: '8px',
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: '12px',
    overflowX: 'auto',
    margin: '12px 0',
    lineHeight: 1.5,
  };

  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Settings size={18} /> 自定义配置
      </h3>
      <p style={{ marginBottom: '16px', color: '#3a3a3c' }}>
        通过自定义配置 JSON，可以精细控制视频处理的各个环节。
      </p>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        完整配置示例
      </h4>
      <pre style={codeBlockStyle}>
{`{
  "pipeline": {
    "remove_keyword": "转场",
    "margin": 0.15,
    "min_segment_duration": 0.1
  },
  "asr": {
    "model": "large-v3",
    "device": "cuda",
    "language": "zh"
  },
  "compose_pipeline": {
    "use_transitions": false,
    "transition_type": "fade",
    "transition_duration": 0.8,
    "resync_subtitle": true
  },
  "subtitle": {
    "effect": "ad",
    "font_size": 88
  },
  "audio": {
    "bgm_volume": 0.3,
    "original_volume": 1.0,
    "bgm_start_time": 0.0,
    "bgm_loop": true,
    "fade_in_duration": 0.5,
    "fade_out_duration": 0.5
  }
}`}
      </pre>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', marginTop: '24px', color: '#1d1d1f' }}>
        Pipeline 配置
      </h4>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          marginBottom: '20px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f7' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>参数</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>类型</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>默认值</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>remove_keyword</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>"转场"</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>需要移除的关键词</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>margin</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>0.15</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>片段边缘余量（秒）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>min_segment_duration</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>0.1</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>最小片段时长（秒）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>mode</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>-</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>处理模式：scene_only（纯场景）</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        ASR 配置
      </h4>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          marginBottom: '20px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f7' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>参数</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>类型</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>默认值</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>model</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>"large-v3"</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>ASR 模型</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>device</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>"cuda"</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>运行设备：cuda/cpu</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>language</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>"zh"</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>识别语言</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        合成配置
      </h4>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          marginBottom: '20px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f7' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>参数</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>类型</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>默认值</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>use_transitions</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>布尔</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>false</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>是否使用转场效果</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>transition_type</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>"fade"</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>转场类型</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>transition_duration</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>0.8</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>转场时长（秒）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>resync_subtitle</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>布尔</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>true</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>是否重新同步字幕</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        字幕配置
      </h4>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          marginBottom: '20px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f7' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>参数</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>类型</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>默认值</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>effect</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字符串</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>"ad"</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字幕效果样式</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>font_size</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>88</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>字体大小</td>
          </tr>
        </tbody>
      </table>

      <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: '#1d1d1f' }}>
        音频配置
      </h4>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          backgroundColor: '#fff',
          border: '1px solid #e5e5e5',
          marginBottom: '20px',
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f7' }}>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>参数</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>类型</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>默认值</th>
            <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #e5e5e5' }}>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>bgm_volume</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>0.3</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>背景音乐音量（0-1）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>original_volume</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>1.0</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>原声音量（0-1）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>bgm_start_time</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>0.0</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>背景音乐开始时间（秒）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>bgm_loop</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>布尔</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>true</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>是否循环播放</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>fade_in_duration</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>0.5</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>淡入时长（秒）</td>
          </tr>
          <tr>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5', fontFamily: 'monospace' }}>fade_out_duration</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>数字</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>0.5</td>
            <td style={{ padding: '10px', borderBottom: '1px solid #e5e5e5' }}>淡出时长（秒）</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * 常见问题内容
 */
function FAQContent() {
  const codeBlockStyle = {
    backgroundColor: '#1d1d1f',
    color: '#f5f5f7',
    padding: '16px',
    borderRadius: '8px',
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: '12px',
    overflowX: 'auto',
    margin: '12px 0',
    lineHeight: 1.5,
  };

  return (
    <div style={{ lineHeight: 1.6, color: '#1d1d1f' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', color: '#1d1d1f', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <HelpCircle size={18} /> 常见问题
      </h3>

      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          Q1: 脚本文件验证失败怎么办？
        </h4>
        <div
          style={{
            backgroundColor: '#f5f5f7',
            borderRadius: '8px',
            padding: '12px 16px',
          }}
        >
          <p style={{ margin: '0 0 8px 0', color: '#3a3a3c', fontSize: '13px' }}><strong>检查以下几点：</strong></p>
          <ol style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c', fontSize: '13px' }}>
            <li>确保 JSON 格式正确（可使用 JSON 验证工具）</li>
            <li>检查 <code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>segments</code> 数组是否存在</li>
            <li>每个 segment 必须有 <code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>flag</code> 和 <code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>text</code> 字段</li>
            <li><code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>scene</code> 类型的 segment 必须有 <code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>scene_file</code> 字段</li>
          </ol>
          <p style={{ margin: '8px 0 0 0', color: '#3a3a3c', fontSize: '13px' }}>
            <strong>使用一键修复：</strong> 如果验证提示缺少 <code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>text</code> 字段，可点击"一键修复"自动添加。
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          Q2: 场景素材找不到？
        </h4>
        <div
          style={{
            backgroundColor: '#f5f5f7',
            borderRadius: '8px',
            padding: '12px 16px',
          }}
        >
          <p style={{ margin: '0 0 8px 0', color: '#3a3a3c', fontSize: '13px' }}><strong>解决方法：</strong></p>
          <ol style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c', fontSize: '13px' }}>
            <li>确认场景素材目录路径正确</li>
            <li>检查 <code style={{ backgroundColor: '#e5e5e5', padding: '2px 4px', borderRadius: '3px' }}>scene_file</code> 文件名与实际文件一致（区分大小写）</li>
            <li>确保素材文件在场景目录中</li>
            <li>支持的文件格式：.mp4, .mov, .jpg, .png</li>
          </ol>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          Q3: 任务提交后一直排队？
        </h4>
        <div
          style={{
            backgroundColor: '#f5f5f7',
            borderRadius: '8px',
            padding: '12px 16px',
          }}
        >
          <p style={{ margin: '0 0 8px 0', color: '#3a3a3c', fontSize: '13px' }}><strong>可能原因：</strong></p>
          <ul style={{ margin: '0 0 8px 0', paddingLeft: '20px', color: '#3a3a3c', fontSize: '13px' }}>
            <li>并发数设置过高，超出系统限制</li>
            <li>服务器资源紧张</li>
            <li>前序任务未完成</li>
          </ul>
          <p style={{ margin: 0, color: '#3a3a3c', fontSize: '13px' }}>
            <strong>建议：</strong> 将并发数调整为 3-5，等待一段时间后刷新状态。
          </p>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          Q4: 如何批量处理多个视频？
        </h4>
        <div
          style={{
            backgroundColor: '#f5f5f7',
            borderRadius: '8px',
            padding: '12px 16px',
          }}
        >
          <ol style={{ margin: 0, paddingLeft: '20px', color: '#3a3a3c', fontSize: '13px' }}>
            <li>点击 <strong>+ 添加空白任务</strong> 多次</li>
            <li>或使用 <strong>📁 从项目添加</strong> 快速填充</li>
            <li>为每个任务配置不同的视频和脚本</li>
            <li>一次性提交所有任务</li>
          </ol>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: '#1d1d1f' }}>
          Q5: API Key 保存在哪里？
        </h4>
        <div
          style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            padding: '12px 16px',
          }}
        >
          <p style={{ margin: 0, color: '#856404', fontSize: '13px' }}>
            API Key 仅保存在您的浏览器本地存储中，不会上传到服务器。清除浏览器缓存会导致 Key 丢失，请妥善保管。
          </p>
        </div>
      </div>

      <div
        style={{
          backgroundColor: '#e7f3ff',
          border: '1px solid #0071e3',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '24px',
        }}
      >
        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: '#0071e3', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Lightbulb size={14} /> 需要更多帮助？
        </h4>
        <p style={{ margin: 0, color: '#0071e3', fontSize: '13px' }}>
          如有问题，请联系技术支持团队或查阅 API 文档。
        </p>
      </div>
    </div>
  );
}

export default HelpGuide;
