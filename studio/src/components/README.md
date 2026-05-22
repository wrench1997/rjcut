# RJCut Studio 组件说明

## 组件列表

### DigitalHumanManager.jsx
**数字人管理器** - 提供完整的数字人管理功能

**功能特性：**
- 查看公共数字人列表
- 查看和管理自定义数字人
- 训练新的自定义数字人
- 创建视频生成任务
- 同步数字人状态
- 删除数字人

**使用方式：**
```jsx
import DigitalHumanManager from './components/DigitalHumanManager'

<DigitalHumanManager apiKey={apiKey} />
```

**子组件：**
- `StatusBadge` - 状态徽章组件
- `ProgressBar` - 进度条组件
- `DigitalPersonCard` - 数字人卡片组件
- `CreateVideoForm` - 创建视频任务表单
- `TrainPersonForm` - 训练数字人表单

---

### FileBrowser.jsx
**文件浏览器** - 浏览和管理虚拟文件系统中的文件

---

### VideoProjectManager.jsx
**视频项目管理** - 创建和管理视频项目

---

### BatchProcessor.jsx
**批量处理器** - 批量处理视频任务

---

### AIChat.jsx
**AI 聊天助手** - 智能助手功能

---

### BatchConfigEditor.jsx
**批量配置编辑器** - 编辑批量处理配置

