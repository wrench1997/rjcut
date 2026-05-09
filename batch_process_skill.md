下面是为你这套 **RJCut 批量处理脚本 v2.0** 编写的 `skill.md`。  

目标：  
✅ 让 AI 通过自然语言调用脚本  
✅ 用户一句话即可发起批量处理  
✅ AI 自动生成 batch_config.json 并执行  
✅ 支持可选参数自动识别  

---

# skill.md

# 🧠 RJCut Batch Processing Skill

## 1️⃣ Skill 名称

**rjcut_batch_processor**

---

## 2️⃣ Skill 描述

通过自然语言指令批量处理视频任务。

支持：

- 批量视频自动剪辑
- 自动上传视频 / 脚本 / 纠错字典 / 场景素材 / 背景音乐
- 自动执行草稿任务
- 自动执行合成任务
- 并发控制
- 自动生成批量报告

用户只需一句话描述需求，AI 自动：

1. 解析需求
2. 构建 batch_config.json
3. 调用 batch 脚本
4. 返回处理结果摘要

---

## 3️⃣ 用户一句话示例

### ✅ 基础用法

> 把 videos 目录下所有 mp4 批量生成带字幕的成片

---

### ✅ 指定并发数

> 并发 5 个任务处理 videos 目录的视频并自动合成

---

### ✅ 指定脚本目录

> 批量处理 videos 目录视频，脚本在 scripts 目录，自动合成

---

### ✅ 指定 BGM

> 批量处理 videos，背景音乐用 bgm.mp3

---

### ✅ 只生成草稿不合成

> 批量处理 videos 目录，只生成草稿不要合成

---

### ✅ 带纠错字典

> 批量处理 videos，使用 corrections.json 纠错字典

---

### ✅ 带场景素材

> 批量处理 videos，脚本在 scripts，场景素材在 scenes 目录

---

## 4️⃣ AI 行为规范（AI 交互指南）

当用户发出自然语言指令时，AI 必须执行以下步骤：

---

### ✅ 第一步：意图识别

识别以下字段：

| 语义 | 解析目标 |
|------|----------|
| 视频目录 | video_dir |
| 脚本目录 | script_dir |
| 场景目录 | scenes_dir |
| 背景音乐 | bgm_file |
| 纠错字典 | corrections_file |
| 是否合成 | AUTO_COMPOSE |
| 并发数量 | MAX_CONCURRENT |

如果未提及：

- AUTO_COMPOSE 默认 true
- MAX_CONCURRENT 默认 3

---

### ✅ 第二步：自动生成 batch_config.json

AI 自动构建：

```json
{
  "tasks": [
    {
      "name": "video1",
      "video_file": "videos/video1.mp4",
      "script_file": "scripts/video1.json",
      "corrections_file": "corrections.json",
      "scenes_dir": "scenes",
      "bgm_file": "bgm.mp3"
    }
  ]
}
```

规则：

- 遍历视频目录
- 文件名作为 task name
- 自动匹配同名脚本
- 自动匹配同名场景素材（可选）
- 如果无脚本字段可省略
- 如果无 bgm 字段可省略

---

### ✅ 第三步：生成执行命令

AI 必须输出标准执行命令：

```bash
export MAX_CONCURRENT=5
export AUTO_COMPOSE=true
export BATCH_CONFIG=./batch_config.json

bash rjcut_batch.sh
```

若未指定并发：

```
export MAX_CONCURRENT=3
```

若用户说“不要合成”：

```
export AUTO_COMPOSE=false
```

---

### ✅ 第四步：执行后响应格式

AI 返回：

```
✅ 批量任务已提交

总任务数: X
并发数: X
自动合成: true/false

输出目录:
./batch_output/tasks/

处理完成后可查看:
./batch_output/batch_report.txt
```

---

## 5️⃣ 默认推断规则

### 🔹 自动识别视频

默认扫描：

```
./videos/*.mp4
```

---

### 🔹 自动识别脚本

如果存在：

```
./scripts/同名.json
```

自动匹配。

---

### 🔹 自动识别纠错字典

如果存在：

```
./corrections.json
```

自动附加。

---

### 🔹 自动识别背景音乐

如果存在：

```
./bgm.mp3
```

自动附加。

---

## 6️⃣ 高级参数识别规则

如果用户说：

| 用户语句 | AI 行为 |
|----------|---------|
| 字幕大一点 | 修改 subtitle.font_size=110 |
| 开启转场 | use_transitions=true |
| 转场 1 秒 | transition_duration=1 |
| BGM 小一点 | bgm_volume=0.2 |
| 人声大一点 | original_volume=1.2 |
| 不循环 BGM | bgm_loop=false |

AI 需自动生成 custom_config 字段。

---

## 7️⃣ 错误处理规范

如果：

- 视频目录不存在 → 提示用户
- 没有 mp4 文件 → 提示
- API_KEY 未设置 → 明确提示

---

## 8️⃣ 文件验证规范

### ✅ 必需文件检查

每个任务必须包含以下文件：

| 文件 | 字段 | 说明 | 例外 |
|------|------|------|------|
| 主视频 | `video_file` | MP4/MOV/AVI/MKV 格式 | 无 |
| 脚本文件 | `script_file` | JSON 格式 | `pipeline.mode="scene_only"` 时可选 |

### ⚠️ 可选文件提示

以下文件虽然不是必需，但建议提供：

| 文件 | 字段 | 作用 | 推荐度 |
|------|------|------|--------|
| 纠错字典 | `corrections_file` | 提高字幕准确性 | ⭐⭐⭐⭐ |
| 背景音乐 | `bgm_file` | 提升视频质量 | ⭐⭐⭐⭐ |
| 场景素材 | `scenes_dir` | 场景替换 | ⭐⭐⭐ |

### 📋 脚本内容验证

脚本文件必须满足：

1. 包含 `segments` 数组
2. 每个 segment 包含 `flag` 和 `text` 字段
3. `flag` 值为 `human`/`scene`/`transition` 之一
4. `scene` 类型的 segment 必须包含 `scene_file`

### 🔍 验证命令

AI 应该支持以下验证指令：

> 验证 batch_config.json 的配置是否正确

AI 响应：

```bash
# 运行验证器
python batch_validator.py ./batch_config.json

# 查看验证结果
{
  "is_valid": false,
  "total_tasks": 3,
  "valid_tasks": 2,
  "invalid_tasks": 1,
  "task_results": [...],
  "summary": {
    "total_errors": 2,
    "total_warnings": 5,
    "recommendations": [...]
  }
}
```

---

## 9️⃣ 推荐交互风格

✅ 不问过多问题  
✅ 自动合理推断  
✅ 输出清晰执行命令  
✅ 告诉用户结果在哪  
✅ 主动验证配置并提示问题

---

## 🔟 示例完整交互

### 👤 用户

> 并发 4 个任务批量处理 videos 目录的视频，脚本在 scripts，背景音乐用 bgm.mp3

---

### 🤖 AI

已为你生成批量配置 ✅

执行命令：

```bash
export MAX_CONCURRENT=4
export AUTO_COMPOSE=true
export BATCH_CONFIG=./batch_config.json

bash rjcut_batch.sh
```

处理完成后查看：

```
./batch_output/batch_report.txt
```

---

# 🎯 设计目标

✅ 用户一句话搞定  
✅ AI 自动推断配置  
✅ 零手动写 JSON  
✅ 零手动写命令  
✅ 支持批量自动化生产  
✅ 智能验证文件完整性  
✅ 支持 JSON 查看和修改  

---

## 📊 JSON 编辑器功能

在 Studio 界面中，用户可以通过 `BatchConfigEditor` 组件：

1. **可视化编辑** - 通过表单或 JSON 直接编辑任务配置
2. **实时验证** - 点击"验证配置"检查所有任务
3. **问题定位** - 查看每个任务的错误、警告和提示
4. **一键修复** - 对常见问题提供快速修复按钮
5. **预览导出** - 预览最终 JSON 并导出

### 使用示例

```jsx
import BatchConfigEditor from './components/BatchConfigEditor'

function App() {
  const [config, setConfig] = useState({ tasks: [] })
  
  return (
    <BatchConfigEditor
      config={config}
      onChange={setConfig}
    />
  )
}
```

### 验证规则示例

**任务 123 的配置检查：**

```
✅ 脚本文件：scripts/123.json (必需)
✅ 数字人文件：1 分钟时长
⚠️ 转场文件：缺少，建议添加
⚠️ 背景音乐：缺少，建议添加
⚠️ 纠错字典：缺少，建议添加
```

**AI 提示用户：**

> 任务 123 的配置基本完整，但缺少以下可选文件：
> - 背景音乐（建议添加以提升视频质量）
> - 纠错字典（建议添加以提高字幕准确性）
> - 转场素材（如果有转场需求请添加）
> 
> 是否继续执行批量处理？
