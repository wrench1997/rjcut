# 批量验证功能快速入门

## 🚀 5 分钟上手指南

### 第一步：打开批量处理页面

```bash
# 1. 启动 Studio
cd studio
npm run dev

# 2. 访问 http://localhost:5173
# 3. 点击顶部导航的 "批量处理"
```

### 第二步：显示配置编辑器

点击页面右上角的 **"显示配置编辑器"** 按钮。

### 第三步：输入配置

在 JSON 编辑器中输入:

```json
{
  "tasks": [
    {
      "name": "test_001",
      "video_file": "./videos/test.mp4",
      "script_file": "./scripts/test.json"
    }
  ]
}
```

### 第四步：验证配置

点击 **"🔍 验证配置"** 按钮。

### 第五步：查看结果

- ✅ **验证通过** → 可以提交任务
- ❌ **验证失败** → 根据提示修复错误

## 📋 验证检查清单

### 必需项 (必须满足)

- [ ] 任务名称不为空
- [ ] 视频文件路径正确
- [ ] 脚本文件路径正确 (除非使用 scene_only 模式)
- [ ] 脚本包含 segments 数组
- [ ] 每个 segment 有 flag 和 text 字段
- [ ] scene 类型的 segment 有 scene_file

### 推荐项 (建议满足)

- [ ] 提供纠错字典 (corrections_file)
- [ ] 提供背景音乐 (bgm_file)
- [ ] 提供场景素材目录 (scenes_dir)

## ⚡ 常见错误速查

| 错误信息 | 解决方法 |
|----------|----------|
| 缺少必需文件：脚本文件 | 添加 script_file 字段或设置 pipeline.mode="scene_only" |
| 脚本缺少必需字段：segments | 在脚本 JSON 中添加 "segments": [] 数组 |
| 第 X 个 segment 缺少必需字段：flag | 为 segment 添加 "flag": "human/scene/transition" |
| 第 X 个 segment 缺少必需字段：text | 为 segment 添加 "text": "字幕文本" |
| 第 X 个 segment 是 scene 类型但缺少 scene_file | 为 scene 类型 segment 添加 "scene_file": "路径" |
| 视频文件不存在：xxx | 检查文件路径是否正确，或上传文件到 VFS |

## 🎯 标准脚本格式

```json
{
  "segments": [
    {
      "flag": "human",
      "text": "这是一个人声片段"
    },
    {
      "flag": "scene",
      "text": "这是一个场景片段",
      "scene_file": "scenes/intro.mp4"
    },
    {
      "flag": "transition",
      "text": "这是一个转场片段"
    }
  ]
}
```

## 🔧 验证模式对比

| 特性 | 后端 API 验证 | 前端验证 (降级) |
|------|--------------|----------------|
| 触发条件 | 配置了 API 地址和 Key | API 不可用 |
| 文件检查 | ✅ 完整 | ⚠️ 仅 VFS |
| 脚本验证 | ✅ 完整 | ✅ 基础 |
| 速度 | 中等 | 快速 |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

## 💡 使用技巧

### 技巧 1: 使用模板

```bash
# 从 API 获取模板
curl "http://localhost:8001/v1/batch/template" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 技巧 2: 批量添加任务

在 JSON 编辑器中快速复制任务配置:

```json
{
  "tasks": [
    {"name": "video_001", "video_file": "./videos/001.mp4", "script_file": "./scripts/001.json"},
    {"name": "video_002", "video_file": "./videos/002.mp4", "script_file": "./scripts/002.json"},
    {"name": "video_003", "video_file": "./videos/003.mp4", "script_file": "./scripts/003.json"}
  ]
}
```

### 技巧 3: 先验证后提交

**错误做法:**
```
选择项目 → 直接提交 → 失败 → 排查错误
```

**正确做法:**
```
选择项目 → 验证配置 → 修复错误 → 提交 → 成功
```

### 技巧 4: 使用场景模式

如果不需要脚本，使用纯场景模式:

```json
{
  "tasks": [
    {
      "name": "scene_only",
      "video_file": "./videos/intro.mp4",
      "custom_config": {
        "pipeline": {
          "mode": "scene_only"
        }
      }
    }
  ]
}
```

## ❓ 常见问题

### Q: 验证按钮是灰色的？
**A:** 请先选择至少一个项目。

### Q: 验证通过但提交失败？
**A:** 可能是 VFS 文件路径问题，检查文件是否已上传。

### Q: 如何忽略警告？
**A:** 警告不影响提交，可以直接提交。但建议修复以提升质量。

### Q: 一键修复什么时候可用？
**A:** 该功能正在开发中 (v2.2 版本)。

## 📚 深入学习

- 📖 [完整测试指南](./BATCH_VALIDATION_TEST.md)
- 📖 [实现文档](./BATCH_VALIDATION_IMPLEMENTATION.md)
- 📖 [批量处理验证说明](../批量处理验证说明.MD)

---

**提示:** 验证是保证批量处理成功的关键步骤，建议养成**先验证后提交**的好习惯！
