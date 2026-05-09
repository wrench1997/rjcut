# 批量处理验证功能测试指南

## 📋 功能概述

Studio 批量处理页面现在集成了完整的脚本和配置验证功能，支持:

1. ✅ **后端 API 验证** - 调用 `/v1/batch/validate` 进行深度验证
2. ✅ **前端降级验证** - 无 API 时使用前端验证
3. ✅ **VFS 文件检查** - 验证虚拟文件系统中的文件存在性
4. ✅ **脚本内容验证** - 检查 segments 数组、flag 值、scene_file 等
5. ✅ **可视化报告** - 显示错误、警告和提示的详细信息

## 🎯 使用步骤

### 步骤 1: 打开批量处理页面

1. 启动 Studio: `cd studio && npm run dev`
2. 访问 `http://localhost:5173`
3. 点击顶部导航的 **"批量处理"** 标签

### 步骤 2: 显示配置编辑器

点击页面右上角的 **"显示配置编辑器"** 按钮。

### 步骤 3: 编辑批量配置

在配置编辑器中，你可以:

#### 方式 A: JSON 直接编辑

在 JSON 编辑器中直接输入配置:

```json
{
  "tasks": [
    {
      "name": "test_video_001",
      "video_file": "./videos/test.mp4",
      "script_file": "./scripts/test.json",
      "corrections_file": "./corrections.json",
      "bgm_file": "./bgm/music.mp3",
      "scenes_dir": "./scenes"
    }
  ]
}
```

#### 方式 B: 表单编辑

1. 点击 **"+ 添加任务"** 按钮
2. 展开任务卡片
3. 填写各个字段:
   - 任务名称
   - 视频文件路径
   - 脚本文件路径
   - 纠错字典 (可选)
   - 背景音乐 (可选)
   - 场景素材目录 (可选)

### 步骤 4: 验证配置

点击 **"🔍 验证配置"** 按钮，系统会:

1. **优先调用后端 API** - 如果配置了 API 地址和 Key
2. **降级到前端验证** - 如果 API 不可用
3. **显示验证结果** - 切换到"验证结果"标签页

### 步骤 5: 查看验证报告

验证结果页面显示:

#### 验证汇总

```
✅ 验证通过 (或 ❌ 验证失败)

共 X 个任务 · X 个有效 · X 个无效

建议:
• 部分任务缺少背景音乐，建议添加
• 部分任务缺少纠错字典，建议添加
```

#### 任务详情

每个任务的验证卡片显示:

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

#### 问题详情

展开问题列表后，每个问题显示:

```
❌ [ERROR] script_file
缺少必需文件：脚本文件

💡 请提供 script_file 字段，或设置 pipeline.mode="scene_only"

[一键修复] 按钮
```

## 🧪 测试场景

### 场景 1: 完整配置验证

**配置:**
```json
{
  "tasks": [
    {
      "name": "complete_test",
      "video_file": "./videos/test.mp4",
      "script_file": "./scripts/test.json",
      "corrections_file": "./corrections.json",
      "bgm_file": "./bgm/music.mp3",
      "scenes_dir": "./scenes"
    }
  ]
}
```

**预期结果:**
- ✅ 验证通过 (如果文件都存在)
- ⚠️ 可能有警告 (如果 VFS 中文件不存在)

### 场景 2: 缺少必需文件

**配置:**
```json
{
  "tasks": [
    {
      "name": "missing_script",
      "video_file": "./videos/test.mp4"
      // 缺少 script_file
    }
  ]
}
```

**预期结果:**
- ❌ 验证失败
- 错误：缺少必需文件：脚本文件

### 场景 3: 纯场景模式

**配置:**
```json
{
  "tasks": [
    {
      "name": "scene_only",
      "video_file": "./videos/scenes.mp4",
      "scenes_dir": "./scenes",
      "custom_config": {
        "pipeline": {
          "mode": "scene_only"
        }
      }
    }
  ]
}
```

**预期结果:**
- ✅ 验证通过 (scene_only 模式不需要脚本)

### 场景 4: 脚本内容错误

**脚本内容:**
```json
{
  "segments": [
    {
      // 缺少 flag 和 text 字段
      "scene_file": "test.mp4"
    },
    {
      "flag": "scene",
      "text": "test"
      // 缺少 scene_file
    }
  ]
}
```

**预期结果:**
- ❌ 验证失败
- 错误 1: 第 1 个 segment 缺少必需字段：flag
- 错误 2: 第 1 个 segment 缺少必需字段：text
- 错误 3: 第 2 个 segment 是 scene 类型但缺少 scene_file

### 场景 5: 多任务混合

**配置:**
```json
{
  "tasks": [
    {
      "name": "task_001",
      "video_file": "./videos/good.mp4",
      "script_file": "./scripts/good.json"
    },
    {
      "name": "task_002",
      "video_file": "./videos/no_script.mp4"
      // 缺少 script_file
    },
    {
      "name": "task_003",
      "video_file": "./videos/minimal.mp4",
      "script_file": "./scripts/minimal.json"
      // 缺少可选文件
    }
  ]
}
```

**预期结果:**
- ❌ 验证失败 (因为有 task_002)
- task_001: ✅ 通过
- task_002: ❌ 失败 (缺少脚本)
- task_003: ✅ 通过 (但有警告 - 缺少可选文件)

## 🔧 验证规则详解

### 必需文件检查

| 文件 | 字段 | 格式 | 例外 |
|------|------|------|------|
| 主视频 | `video_file` | MP4/MOV/AVI/MKV | 无 |
| 脚本文件 | `script_file` | JSON | `pipeline.mode="scene_only"` |

### 可选文件提示

| 文件 | 字段 | 推荐度 |
|------|------|--------|
| 纠错字典 | `corrections_file` | ⭐⭐⭐⭐ |
| 背景音乐 | `bgm_file` | ⭐⭐⭐⭐ |
| 场景素材 | `scenes_dir` | ⭐⭐⭐ |

### 脚本内容验证

脚本文件必须满足:

1. ✅ 包含 `segments` 数组
2. ✅ 每个 segment 包含 `flag` 和 `text` 字段
3. ✅ `flag` 值为 `human`/`scene`/`transition` 之一
4. ✅ `scene` 类型的 segment 必须包含 `scene_file`

### 验证级别

| 级别 | 标识 | 含义 | 处理方式 |
|------|------|------|----------|
| Error | ❌ | 错误 | 必须修复 |
| Warning | ⚠️ | 警告 | 建议修复 |
| Info | ℹ️ | 提示 | 仅供参考 |

## 🛠️ API 集成

### 后端验证端点

```bash
POST /v1/batch/validate
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "tasks": [...]
}
```

**响应:**
```json
{
  "code": 0,
  "data": {
    "is_valid": true,
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
}
```

### 前端降级验证

如果 API 不可用，系统自动切换到前端验证:

1. 检查必需字段是否存在
2. 通过 VFS 检查文件存在性
3. 解析并验证脚本内容
4. 生成验证报告

## 📝 最佳实践

### 1. 提交前验证

在提交批量任务前，**始终先验证配置**:

```
1. 点击"显示配置编辑器"
2. 检查 JSON 配置
3. 点击"🔍 验证配置"
4. 查看验证报告
5. 修复所有错误
6. 考虑修复警告
7. 提交任务
```

### 2. 使用模板

从示例配置开始:

```bash
# 获取模板
curl "http://localhost:8001/v1/batch/template" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 3. 文件组织

推荐的目录结构:

```
./
├── videos/          # 视频文件
├── scripts/         # 脚本文件
├── corrections.json # 纠错字典
├── bgm/            # 背景音乐
└── scenes/         # 场景素材
```

### 4. 命名规范

- 任务名称：使用有意义的名称，如 `product_intro_001`
- 文件路径：使用相对路径，如 `./videos/intro.mp4`
- 脚本文件：与视频同名，如 `intro.json` 对应 `intro.mp4`

## 🐛 故障排除

### 问题 1: 验证按钮无响应

**原因:** API 地址配置错误

**解决:**
1. 检查 `.env` 文件中的 `VITE_API_BASE_URL`
2. 确认 API Key 正确
3. 查看浏览器控制台的错误信息

### 问题 2: 文件验证失败但文件存在

**原因:** VFS 路径不匹配

**解决:**
1. 确认文件已上传到 VFS
2. 使用文件浏览器检查路径
3. 使用绝对路径或正确的相对路径

### 问题 3: 脚本验证通过但执行失败

**原因:** 脚本格式正确但内容有误

**解决:**
1. 检查 segments 数组内容
2. 确认 scene_file 路径正确
3. 验证 flag 值符合业务逻辑

## 📚 相关文档

- [批量处理验证说明](../批量处理验证说明.MD)
- [批量处理技能文档](../batch_process_skill.md)
- [BatchConfigEditor 组件](./src/components/BatchConfigEditor.jsx)
- [API 服务文档](../api_service.py)

## 🔄 更新日志

### v2.1 (2026-05-06)
- ✅ 集成后端验证 API
- ✅ 添加前端降级验证
- ✅ 支持 VFS 文件存在性检查
- ✅ 实现脚本内容验证
- ✅ 优化验证报告展示
- ✅ 添加一键修复功能

---

**作者:** RJCut Team  
**版本:** 2.1  
**最后更新:** 2026-05-06
