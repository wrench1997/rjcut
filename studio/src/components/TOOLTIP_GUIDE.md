# Tooltip 智能提示组件使用指南

## 概述

`Tooltip` 组件是一个智能提示工具，当用户鼠标悬停在元素上 **1 秒后**，会在光标下方显示提示信息。

## 功能特性

- ⏱️ **延迟显示**：默认 1 秒延迟，避免频繁闪烁
- 🎯 **跟随光标**：提示框跟随鼠标位置显示
- 📍 **多位置支持**：支持上、下、左、右四个方向
- 🎨 **美观设计**：现代化 UI 设计，带平滑动画
- ♿ **无干扰**：鼠标移开后自动隐藏

## 使用方法

### 基本用法

```jsx
import Tooltip from './Tooltip'

// 包裹按钮
<Tooltip tip="这是提示信息">
  <button>点击我</button>
</Tooltip>

// 包裹图标
<Tooltip tip="删除文件">
  <TrashIcon />
</Tooltip>

// 包裹文本
<Tooltip tip="API 密钥用于身份验证">
  <label>API Key</label>
</Tooltip>
```

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tip` | string | 必填 | 提示内容文本 |
| `children` | ReactNode | 必填 | 被包裹的元素 |
| `position` | string | `'bottom'` | 提示位置：`'top'` \| `'bottom'` \| `'left'` \| `'right'` |
| `delay` | number | `1000` | 延迟显示时间（毫秒） |

### 位置示例

```jsx
// 提示在下方（默认）
<Tooltip tip="下方提示" position="bottom">
  <button>按钮</button>
</Tooltip>

// 提示在上方
<Tooltip tip="上方提示" position="top">
  <button>按钮</button>
</Tooltip>

// 提示在左侧
<Tooltip tip="左侧提示" position="left">
  <button>按钮</button>
</Tooltip>

// 提示在右侧
<Tooltip tip="右侧提示" position="right">
  <button>按钮</button>
</Tooltip>
```

### 自定义延迟

```jsx
// 500ms 延迟
<Tooltip tip="快速提示" delay={500}>
  <button>按钮</button>
</Tooltip>

// 2 秒延迟
<Tooltip tip="长时间等待" delay={2000}>
  <button>按钮</button>
</Tooltip>
```

## 最佳实践

### ✅ 推荐用法

1. **重要操作按钮**：删除、保存、提交等关键操作
```jsx
<Tooltip tip="永久删除此文件，此操作不可恢复">
  <button>删除</button>
</Tooltip>
```

2. **专业术语解释**：用户可能不熟悉的配置项
```jsx
<Tooltip tip="并发数越高处理越快，但可能导致 API 限流">
  <label>并发数量</label>
</Tooltip>
```

3. **功能说明**：复杂功能的简要说明
```jsx
<Tooltip tip="批量上传视频或指定参数，并行处理多个生成任务">
  <h2>批量视频处理</h2>
</Tooltip>
```

4. **表单字段**：输入框的补充说明
```jsx
<Tooltip tip="您的 API 密钥，用于身份验证和配额管理">
  <label>API Key</label>
</Tooltip>
```

### ❌ 避免用法

1. **不要嵌套过多**：避免 Tooltip 包裹 Tooltip
```jsx
// ❌ 不推荐
<Tooltip tip="外层">
  <Tooltip tip="内层">
    <button>按钮</button>
  </Tooltip>
</Tooltip>
```

2. **提示文本不宜过长**：保持简洁明了
```jsx
// ❌ 不推荐 - 太长
<Tooltip tip="这是一个非常非常长的提示信息，包含了大量不必要的细节，用户可能没有耐心看完...">
  <button>按钮</button>
</Tooltip>

// ✅ 推荐 - 简洁
<Tooltip tip="简洁明了的提示">
  <button>按钮</button>
</Tooltip>
```

3. **不要用于装饰性元素**：只对有意义的元素添加提示
```jsx
// ❌ 不推荐
<Tooltip tip="这是一个分隔线">
  <hr />
</Tooltip>
```

## 已应用页面

### 1. 主页面 (`pages/index.js`)
- 侧边栏导航菜单项
- 帮助指南按钮
- 设置页面的 API 配置项

### 2. 批量处理器 (`src/components/BatchProcessor.jsx`)
- 页面标题
- 取消所有任务按钮
- 重置按钮

### 3. 数字人创作室 (`src/components/DigitalHumanStudio.jsx`)
- 数字人选择标题
- 配音选择标签
- 批量文案标题
- 新增文案按钮
- 生成视频按钮

### 4. 文件浏览器 (`src/components/FileBrowser.jsx`)
- 返回上一级按钮
- 刷新按钮
- 文件类型筛选器
- 搜索框
- 排序选择器
- 视图切换按钮

## 样式定制

Tooltip 使用 Tailwind CSS 样式，可以通过修改组件源码来自定义：

```jsx
// src/components/Tooltip.jsx 中的样式
<div className="bg-slate-800 text-white text-xs px-3 py-2 rounded-lg shadow-xl max-w-xs whitespace-pre-wrap">
  {tip}
</div>
```

修改建议：
- `bg-slate-800` → 背景颜色
- `text-xs` → 字体大小
- `px-3 py-2` → 内边距
- `max-w-xs` → 最大宽度

## 技术细节

- 使用 React Hooks (`useState`, `useEffect`, `useRef`) 实现
- 延迟显示使用 `setTimeout`
- 位置计算使用 `fixed` 定位和鼠标坐标
- 动画使用 CSS `transition`
- 无外部依赖

## 故障排除

### 提示不显示
- 检查 `tip` 属性是否已设置
- 确保子元素能接收鼠标事件

### 位置不正确
- 尝试调整 `position` 参数
- 检查是否有父元素的 `overflow: hidden` 限制

### 延迟时间不生效
- 确认 `delay` 参数是数字类型
- 检查是否有多个事件处理器冲突

## 未来扩展

可考虑添加的功能：
- [ ] 支持自定义样式 props
- [ ] 支持富文本提示
- [ ] 支持键盘导航（无障碍）
- [ ] 支持移动端触摸显示
- [ ] 添加主题支持（亮色/暗色）