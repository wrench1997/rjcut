# 批量处理验证功能实现总结

## 📋 实现概述

根据用户需求 **"studio 执行批量处理的时候要求检查脚本"**，我们完成了以下改进:

### 核心改进

1. ✅ **集成后端验证 API** - `BatchConfigEditor` 现在调用 `/v1/batch/validate` 进行深度验证
2. ✅ **前端降级验证** - API 不可用时自动切换到前端验证
3. ✅ **VFS 文件检查** - 验证虚拟文件系统中的文件存在性
4. ✅ **脚本内容验证** - 检查 segments 数组、flag 值、scene_file 等
5. ✅ **可视化报告** - 显示错误、警告和提示的详细信息

## 🔧 修改的文件

### 1. `studio/src/components/BatchConfigEditor.jsx`

#### 修改内容:

**A. 添加 API 参数支持**
```jsx
function BatchConfigValidator({ 
  config, 
  onChange, 
  vfs, 
  className, 
  apiBaseUrl,  // 新增
  apiKey       // 新增
}) {
```

**B. 实现后端 API 验证**
```jsx
const validate = useCallback(async () => {
  setValidating(true)
  try {
    // 优先调用后端验证 API
    if (apiBaseUrl && apiKey) {
      const response = await fetch(`${apiBaseUrl}/v1/batch/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })
      
      if (response.ok) {
        const data = await response.json()
        setValidationResult(data.data || data)
        setActiveTab('validation')
        return
      }
    }
    
    // 降级到前端验证
    const result = performBasicValidation(config, vfs)
    setValidationResult(result)
    setActiveTab('validation')
  } catch (e) {
    // 错误处理...
  }
}, [config, vfs, apiBaseUrl, apiKey])
```

**C. 增强前端验证函数**
```jsx
function performBasicValidation(config, vfs = null) {
  // ...
  
  // 如果提供了 VFS，检查文件是否存在
  if (vfs) {
    try {
      const exists = vfs.exists(task.video_file)
      if (!exists) {
        issues.push({
          level: 'error',
          field: 'video_file',
          message: `视频文件不存在：${task.video_file}`,
          suggestion: '请检查文件路径是否正确',
        })
      }
    } catch (e) {
      // 忽略 VFS 检查错误
    }
  }
  
  // 验证脚本内容
  if (vfs && task.script_file) {
    try {
      const scriptContent = vfs.readFile(task.script_file)
      if (scriptContent) {
        const script = JSON.parse(scriptContent)
        validateScriptContent(script, issues, task.name)
      }
    } catch (e) {
      issues.push({
        level: 'error',
        field: 'script_file',
        message: `脚本 JSON 格式错误：${e.message}`,
      })
    }
  }
  
  // ...
}
```

**D. 新增脚本内容验证函数**
```jsx
function validateScriptContent(script, issues, taskName) {
  // 验证必需字段
  if (!script.segments) {
    issues.push({
      level: 'error',
      field: 'script_file',
      message: '脚本缺少必需字段：segments',
      suggestion: '请在脚本中添加 segments 数组字段',
    })
    return
  }
  
  if (!Array.isArray(script.segments)) {
    issues.push({
      level: 'error',
      field: 'script_file',
      message: 'segments 必须是数组格式',
      suggestion: '请将 segments 字段修改为数组',
    })
    return
  }
  
  const validFlags = ['human', 'scene', 'transition']
  
  script.segments.forEach((seg, idx) => {
    // 验证 segment 必需字段
    if (!seg.flag) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 缺少必需字段：flag`,
        suggestion: '请添加 flag 字段 (human/scene/transition)',
      })
    }
    
    if (!seg.text) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 缺少必需字段：text`,
        suggestion: '请添加 text 字段',
      })
    }
    
    // 验证 flag 值
    if (seg.flag && !validFlags.includes(seg.flag)) {
      issues.push({
        level: 'warning',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 的 flag 值不常见：${seg.flag}`,
        suggestion: `建议使用以下值之一：${validFlags.join(', ')}`,
      })
    }
    
    // 验证 scene_file (scene 类型必需)
    if (seg.flag === 'scene' && !seg.scene_file) {
      issues.push({
        level: 'error',
        field: `script_file.segments[${idx}]`,
        message: `第 ${idx + 1} 个 segment 是 scene 类型但缺少 scene_file`,
        suggestion: '请提供 scene_file 字段指向场景素材',
      })
    }
  })
}
```

### 2. `studio/src/App.jsx`

#### 修改内容:

**A. 导入 BatchConfigEditor 组件**
```jsx
import BatchConfigEditor from './components/BatchConfigEditor'
```

**B. 添加批量配置状态**
```jsx
const [batchConfig, setBatchConfig] = useState({
  tasks: [],  // 新增
  bgmFile: null,
  customConfig: '',
})
const [showConfigEditor, setShowConfigEditor] = useState(false)
```

**C. 在批量处理页面集成验证器**
```jsx
{showConfigEditor && (
  <div className="card mb-xxl">
    <BatchConfigEditor
      config={batchConfig}
      onChange={setBatchConfig}
      vfs={vfs}
      apiBaseUrl={API_BASE_URL}
      apiKey={apiKey}
    />
  </div>
)}
```

**D. 添加验证按钮**
```jsx
<div className="flex gap-md justify-center">
  <button 
    className="btn btn-ghost"
    onClick={() => setShowConfigEditor(true)}
    disabled={selectedProjects.length === 0}
  >
    🔍 验证配置
  </button>
  
  <button 
    className="btn btn-primary"
    onClick={submitBatchTasks}
    disabled={loading || selectedProjects.length === 0}
  >
    {loading ? '提交中...' : `提交 ${selectedProjects.length} 个项目`}
  </button>
</div>
```

### 3. 新增文档

**A. `studio/BATCH_VALIDATION_TEST.md`**
- 完整的使用指南
- 测试场景示例
- 验证规则详解
- 故障排除指南

**B. `studio/BATCH_VALIDATION_IMPLEMENTATION.md`** (本文件)
- 实现总结
- 修改说明
- 技术细节

## 🎯 功能特性

### 1. 后端 API 验证 (优先)

**优点:**
- ✅ 完整的验证逻辑 (与 `batch_validator.py` 一致)
- ✅ 支持文件存在性检查
- ✅ 支持脚本内容验证
- ✅ 支持条件性必需文件 (如 scene_only 模式)

**调用方式:**
```javascript
POST /v1/batch/validate
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "tasks": [...]
}
```

### 2. 前端降级验证

**触发条件:**
- API 地址未配置
- API Key 未设置
- 网络请求失败

**验证内容:**
- ✅ 必需字段检查 (name, video_file, script_file)
- ✅ VFS 文件存在性检查
- ✅ 脚本内容验证 (segments, flag, text, scene_file)
- ✅ 可选文件提示 (bgm_file, corrections_file, scenes_dir)

### 3. 验证级别

| 级别 | 标识 | 含义 | 处理方式 |
|------|------|------|----------|
| Error | ❌ | 错误 | 必须修复后才能执行 |
| Warning | ⚠️ | 警告 | 建议修复，可跳过 |
| Info | ℹ️ | 提示 | 仅供参考 |

### 4. 验证报告展示

**验证汇总:**
```
✅ 验证通过 (或 ❌ 验证失败)

共 3 个任务 · 2 个有效 · 1 个无效

建议:
• 部分任务缺少背景音乐，建议添加
• 部分任务缺少纠错字典，建议添加
```

**任务详情:**
```
❌ 任务名称
0 个错误 · 2 个警告 · 1 个提示

必需文件:
✓ video_file
✗ script_file

可选文件:
✓ bgm_file
○ corrections_file
○ scenes_dir

[展开] 查看详细问题列表
```

**问题详情:**
```
❌ [ERROR] script_file
缺少必需文件：脚本文件

💡 请提供 script_file 字段，或设置 pipeline.mode="scene_only"

[一键修复] 按钮
```

## 📊 验证规则

### 必需文件检查

| 文件 | 字段 | 格式 | 例外 |
|------|------|------|------|
| 主视频 | `video_file` | MP4/MOV/AVI/MKV | 无 |
| 脚本文件 | `script_file` | JSON | `pipeline.mode="scene_only"` |

### 可选文件提示

| 文件 | 字段 | 推荐度 |
|------|------|------|--------|
| 纠错字典 | `corrections_file` | ⭐⭐⭐⭐ |
| 背景音乐 | `bgm_file` | ⭐⭐⭐⭐ |
| 场景素材 | `scenes_dir` | ⭐⭐⭐ |

### 脚本内容验证

脚本文件必须满足:

1. ✅ 包含 `segments` 数组
2. ✅ 每个 segment 包含 `flag` 和 `text` 字段
3. ✅ `flag` 值为 `human`/`scene`/`transition` 之一
4. ✅ `scene` 类型的 segment 必须包含 `scene_file` 字段

## 🧪 测试方法

### 方法 1: 手动测试

1. 启动 Studio: `cd studio && npm run dev`
2. 访问 `http://localhost:5173`
3. 点击 **"批量处理"** 标签
4. 点击 **"显示配置编辑器"**
5. 输入测试配置
6. 点击 **"🔍 验证配置"**
7. 查看验证报告

### 方法 2: 使用测试配置

```json
{
  "tasks": [
    {
      "name": "test_missing_script",
      "video_file": "./videos/test.mp4"
      // 缺少 script_file - 应该有错误
    },
    {
      "name": "test_scene_only",
      "video_file": "./videos/scenes.mp4",
      "custom_config": {
        "pipeline": {
          "mode": "scene_only"
        }
      }
      // scene_only 模式 - 应该通过
    }
  ]
}
```

## 🔗 相关文件

- `studio/src/components/BatchConfigEditor.jsx` - 配置编辑器组件
- `studio/src/App.jsx` - 主应用
- `batch_validator.py` - Python 验证器
- `api_service.py` - API 服务 (包含 `/v1/batch/validate` 端点)
- `批量处理验证说明.MD` - 详细验证规则文档
- `batch_process_skill.md` - AI 技能文档

## 📝 使用示例

### 示例 1: 验证完整配置

```jsx
import BatchConfigEditor from './components/BatchConfigEditor'

function BatchStudio() {
  const [config, setConfig] = useState({ tasks: [] })
  
  return (
    <BatchConfigEditor
      config={config}
      onChange={setConfig}
      apiBaseUrl="http://localhost:8001"
      apiKey="your-api-key"
    />
  )
}
```

### 示例 2: 在提交前验证

```jsx
const handleSubmit = async () => {
  // 先验证配置
  const validationResult = await validateConfig(config)
  
  if (!validationResult.is_valid) {
    alert('配置验证失败，请修复错误后再提交')
    return
  }
  
  // 验证通过后提交
  await submitBatchTasks(config)
}
```

## 🔄 工作流程

```
用户点击"验证配置"
        ↓
检查 API 配置
        ↓
    ┌───┴───┐
    │       │
  有 API   无 API
    │       │
    ↓       ↓
调用后端  前端验证
  API      (降级)
    │       │
    └───┬───┘
        ↓
  显示验证报告
        ↓
    ┌───┴───┐
    │       │
  有错误  无错误
    │       │
    ↓       ↓
  修复    提交任务
```

## 🎨 UI/UX 改进

### 1. 标签页导航
- ✏️ **编辑配置** - JSON 编辑器和表单
- 🔍 **验证结果** - 详细的验证报告
- 👁️ **预览** - JSON 预览

### 2. 验证状态指示
- 验证中：显示 "验证中..."
- 验证通过：绿色背景 + ✅ 图标
- 验证失败：红色背景 + ❌ 图标

### 3. 问题卡片
- 错误：红色左边框 + ❌ 图标
- 警告：黄色左边框 + ⚠️ 图标
- 提示：蓝色左边框 + ℹ️ 图标

### 4. 一键修复
对简单问题提供 "一键修复" 按钮 (待实现)

## 🚀 后续优化建议

### 短期 (v2.2)
- [ ] 实现 "一键修复" 功能
- [ ] 添加验证历史记录
- [ ] 支持批量修复
- [ ] 优化 VFS 文件路径解析

### 中期 (v2.3)
- [ ] 添加配置文件模板
- [ ] 支持导入/导出配置
- [ ] 添加验证规则配置
- [ ] 支持自定义验证规则

### 长期 (v3.0)
- [ ] AI 智能修复建议
- [ ] 自动检测文件依赖
- [ ] 实时验证 (输入时验证)
- [ ] 验证报告导出 (PDF/Markdown)

## 📚 参考文档

- [Apple 设计系统](../DESIGN.md)
- [批量处理验证说明](../批量处理验证说明.MD)
- [批量处理技能文档](../batch_process_skill.md)
- [API 服务文档](../api_service.py)

---

**作者:** RJCut Team  
**版本:** 2.1  
**实现日期:** 2026-05-06  
**状态:** ✅ 已完成
