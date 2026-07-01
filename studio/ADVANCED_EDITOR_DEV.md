# 高级剪辑功能开发文档

## 概述
本文档记录了 RJCut Studio 高级视频剪辑功能的开发进展和已实现的功能。

---

## ✅ Phase 1: 增强时间轴编辑能力（已完成）

### 1.1 片段分割 (Split Clip)
- **功能**: 在播放头位置将选中的片段分割成两个独立片段
- **操作**: 选中片段 → 点击播放头定位 → 点击"分割"按钮
- **实现**: `timelineStore.splitClip(id, splitTime_ms)`

### 1.2 修剪时长 (Resize Clip)
- **功能**: 拖动片段左右边缘调整时长
- **操作**: 
  - 右侧拖动：调整结束位置（改变时长）
  - 左侧拖动：调整开始位置和 offset（保持内容）
- **实现**: `timelineStore.resizeClip(id, newDuration_ms)`

### 1.3 修剪开始位置 (Trim Clip Start)
- **功能**: 精细调整片段的入点和出点
- **实现**: `timelineStore.trimClipStart(id, newStart_ms, newOffset_ms)`

---

## ✅ Phase 2: 高级编辑功能（已完成）

### 2.1 多轨道管理
- **自动轨道创建**: 添加片段时自动创建新轨道（video_1, video_2, audio_1...）
- **轨道显示**: 轨道标签显示片段数量
- **实现**: `timelineStore.addTrack(trackType)`

### 2.2 吸附功能 (Snapping)
- **功能**: 拖动片段时自动对齐到附近的时间点
- **吸附点**: 
  - 时间轴起点 (0ms)
  - 播放头位置
  - 所有片段的开始和结束位置
- **阈值**: 200ms 范围内自动吸附
- **开关**: 工具栏可切换 吸附 ON/OFF
- **实现**: `timelineStore.snapToNearest(time_ms, threshold_ms)`

### 2.3 波纹编辑 (Ripple Edit)
- **波纹删除**: 删除片段后，后续片段自动前移填补空隙
  - 操作：选中片段 → 点击"波纹删"按钮
  - 实现：`timelineStore.rippleRemove(id)`
  
- **波纹插入**: 在指定位置插入间隙，后续片段后移
  - 实现：`timelineStore.rippleInsertGap(position_ms, gapDuration_ms)`

### 2.4 淡入淡出效果 (Fade In/Out)
- **功能**: 为视频/音频片段添加渐显渐隐效果
- **预设时长**: 0.25s, 0.5s, 1s, 2s, 3s
- **可视化**: 在导出面板显示淡入淡出效果预览
- **组件**: `FadeControl.jsx`
- **实现**: `timelineStore.setClipFade(id, fadeType, duration_ms)`

---

## 技术实现细节

### 时间轴 Store 扩展
文件：`studio/src/stores/timelineStore.js`

```javascript
// 新增方法
- splitClip(id, splitTime_ms)      // 分割片段
- resizeClip(id, newDuration_ms)   // 调整时长
- trimClipStart(id, start, offset) // 修剪开始
- rippleRemove(id)                 // 波纹删除
- rippleInsertGap(pos, duration)   // 波纹插入
- setClipFade(id, type, duration)  // 淡入淡出
- addTrack(type)                   // 添加轨道
- getSnapPoints()                  // 获取吸附点
- snapToNearest(time, threshold)   // 吸附计算
```

### 时间轴组件增强
文件：`studio/src/components/VideoEditor/Timeline.jsx`

**新增状态**:
```javascript
const [isResizing, setIsResizing] = useState(false)
const [resizingClip, setResizingClip] = useState(null)
const [resizeHandle, setResizeHandle] = useState(null) // 'left' or 'right'
const [snapEnabled, setSnapEnabled] = useState(true)
```

**新增 UI**:
- 吸附开关按钮
- 波纹删除按钮
- 片段左右调整手柄（hover 显示）
- 轨道片段计数显示

### 淡入淡出控制组件
文件：`studio/src/components/VideoEditor/FadeControl.jsx`

**功能**:
- 选择淡入淡出时长
- 一键开启/关闭淡入效果
- 一键开启/关闭淡出效果
- 可视化效果预览

---

## 使用指南

### 基本剪辑流程
1. **导入素材**: 从 VFS 或本地上传视频/音频/图片
2. **添加到时间轴**: 点击素材的 "+" 按钮
3. **调整位置**: 拖动片段到目标位置（支持吸附）
4. **分割片段**: 移动播放头 → 选中片段 → 点击"分割"
5. **修剪边缘**: 拖动片段左右边缘调整时长
6. **设置淡入淡出**: 选中片段 → 右侧面板设置
7. **波纹删除**: 选中不需要的片段 → 点击"波纹删"
8. **导出视频**: 设置参数 → 点击"开始导出"

### 快捷键建议（待实现）
- `Space`: 播放/暂停
- `S`: 分割片段
- `Delete`: 删除片段
- `Backspace`: 波纹删除
- `Ctrl+Z`: 撤销（待实现）
- `Ctrl+Shift+Z`: 重做（待实现）

---

## 待开发功能 (Phase 3+)

### 3.1 轨道管理
- [ ] 手动添加/删除轨道
- [ ] 轨道重命名
- [ ] 轨道锁定/隐藏
- [ ] 轨道音量调节
- [ ] 轨道独奏/静音

### 3.2 高级时间轴
- [ ] 撤销/重做历史
- [ ] 片段复制/粘贴
- [ ] 片段替换（保留时长和效果）
- [ ] 速度调整（快放/慢放）
- [ ] 关键帧动画

### 3.3 转场效果
- [ ] 交叉溶解
- [ ] 淡入淡出转场
- [ ] 滑动转场
- [ ] 缩放转场

### 3.4 字幕和文本
- [ ] 添加文本轨道
- [ ] 字幕样式编辑
- [ ] 字幕时间轴同步
- [ ] 导入 SRT 字幕文件

### 3.5 音频处理
- [ ] 音频波形显示
- [ ] 音频音量包络
- [ ] 音频降噪
- [ ] 背景音乐自动闪避

### 3.6 性能优化
- [ ] 代理剪辑（低分辨率预览）
- [ ] 后台渲染
- [ ] 增量导出
- [ ] 片段缓存

---

## 已知问题

1. **WASM 加载**: 首次加载 FFmpeg WASM 可能需要几秒钟
2. **大文件处理**: 超过 500MB 的视频文件可能导致浏览器内存不足
3. **导出占位符**: ExportWorker 目前使用模拟进度，需要完整 FFmpeg 集成
4. **多轨道预览**: 预览组件目前只显示最上层视频轨道

---

## 测试建议

1. **分割功能**: 测试在片段不同位置分割
2. **吸附功能**: 测试拖动时是否正确吸附到各时间点
3. **波纹删除**: 测试删除后间隙是否正确闭合
4. **淡入淡出**: 测试不同时长设置的效果
5. **多轨道**: 测试多个视频/音频轨道的混合编辑

---

## 更新日志

### v0.2.0 (当前版本)
- ✅ 新增片段分割功能
- ✅ 新增片段修剪（调整时长）
- ✅ 新增吸附功能（可开关）
- ✅ 新增波纹删除
- ✅ 新增淡入淡出效果
- ✅ 优化轨道显示（显示片段数）
- ✅ 优化调整手柄 UI

### v0.1.0
- 基础时间轴编辑
- 多轨道支持
- 播放控制
- 素材管理
- 导出功能（基础）

---

## 贡献者
- 开发团队：RJCut Studio