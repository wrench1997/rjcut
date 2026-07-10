# Visual Script Editor API 使用文档

## 概述

Visual Script Editor 是一个基于 AI 的自动剪辑功能，它可以根据你提供的**视觉脚本**（visual script）自动分析视频素材库，并智能选择、排序和剪辑出符合脚本要求的特殊片段。

### 核心技术

- **TwelveLabs Pegasus 1.5**: 用于视频内容理解和分析，将原始视频分割成带有语义描述的候选镜头
- **Google Gemini**: 作为"导演"角色，根据视觉脚本从候选镜头中选择最匹配的片段并编排顺序

### 工作流程

```
1. 提交视觉脚本 + 视频素材
   ↓
2. TwelveLabs Pegasus 分析视频 → 生成候选镜头目录（shot catalog）
   ↓
3. Gemini 根据脚本选择镜头 → 生成编辑计划（edit plan）
   ↓
4. 生成输出产物：
   - shot_catalog.json: 所有候选镜头的详细信息
   - edit_plan.json: Gemini 的编辑决策和创意说明
   - edit_decision_list.json (EDL): 最终选中的镜头列表和时间点
   - script_overlay.srt: 字幕文件
   - ffmpeg_render_commands.txt: FFmpeg 渲染命令
   - rough_cut.mp4 (可选): 渲染好的粗剪视频
```

## API 端点

### POST /v1/tasks/visual-script-editor

创建视觉脚本编辑器任务。

#### 请求体

```json
{
  "script_lines": [
    "镜头缓缓推进，模特从远处走向镜头",
    "特写：模特转身，头发飘动",
    "中景：模特直视镜头，表情冷峻",
    "细节：服装面料的质感和光泽"
  ],
  "style": "高级时尚广告；冷感、克制、留白；竖屏 9:16",
  "sources": [
    {
      "oss_key": "uploads/model_shoot_01.mp4",
      "label": "模特拍摄 01"
    },
    {
      "oss_key": "uploads/model_shoot_02.mp4",
      "label": "模特拍摄 02"
    }
  ],
  "options": {
    "min_shot_seconds": 2.0,
    "max_shot_seconds": 10.0,
    "max_candidates_per_video": 30,
    "target_seconds": 45.0,
    "thinking_level": "low",
    "gemini_model": "gemini-3-flash-preview",
    "render": false,
    "canvas": "9:16",
    "fit": "contain",
    "reuse_catalog_oss_key": null
  },
  "callback_url": "https://your-server.com/callback",
  "client_ref_id": "your-internal-id-123",
  "timeout_seconds": 3600
}
```

#### 参数说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `script_lines` | string[] | ✅ | 视觉脚本，每行一个视觉 beat/镜头描述 |
| `style` | string | ✅ | 整体视觉风格描述，如"高级时尚广告；冷感、克制、留白；竖屏 9:16" |
| `sources` | Source[] | ✅ | 视频源列表，至少一个 |
| `options` | Options | ❌ | 可选配置，默认值适合大多数场景 |
| `callback_url` | string | ❌ | 任务完成后的回调 URL |
| `client_ref_id` | string | ❌ | 客户端内部引用 ID |
| `timeout_seconds` | int | ❌ | 任务超时时间（秒），默认 3600 |

##### Source 对象

| 字段 | 类型 | 说明 |
|------|------|------|
| `oss_key` | string | OSS 文件路径（推荐） |
| `local_path` | string | 本地文件路径（仅当后端可访问本地文件时） |
| `url` | string | 公开直链 URL（需要可下载） |
| `label` | string | 可选，视频标签/名称，默认使用文件名 |
| `source_id` | string | 可选，自定义源 ID，默认自动生成 |

##### Options 对象

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `min_shot_seconds` | float | 2.0 | 最小镜头时长（Pegasus 要求至少 2 秒） |
| `max_shot_seconds` | float | 10.0 | 最大镜头时长 |
| `max_candidates_per_video` | int | 30 | 每个视频的最大候选镜头数 |
| `target_seconds` | float | 45.0 | 目标总时长（秒） |
| `thinking_level` | string | "low" | Gemini 思考级别：minimal/low/medium/high |
| `gemini_model` | string | "gemini-3-flash-preview" | Gemini 模型 |
| `render` | bool | false | 是否渲染 rough cut MP4 |
| `canvas` | string | "9:16" | 渲染画布比例：9:16/16:9/1:1 |
| `fit` | string | "contain" | 填充模式：contain/cover |
| `reuse_catalog_oss_key` | string | null | 复用已有 shot_catalog.json 的 OSS 路径（避免重复分析） |

#### 响应

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_abc123def456",
    "task_type": "visual_script_editor",
    "status": "queued",
    "trace_id": "trace_xyz789",
    "estimated_seconds": 300
  },
  "trace_id": "trace_xyz789"
}
```

## 查询任务状态

使用通用任务查询接口：

```bash
GET /v1/tasks/{task_id}
```

### 成功响应示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "task_id": "task_abc123",
    "task_type": "visual_script_editor",
    "status": "succeeded",
    "progress": 100,
    "stage": "completed",
    "result": {
      "shot_catalog_oss_key": "visual_script/task_abc123/shot_catalog.json",
      "edit_plan_oss_key": "visual_script/task_abc123/edit_plan.json",
      "edl_oss_key": "visual_script/task_abc123/edit_decision_list.json",
      "srt_oss_key": "visual_script/task_abc123/script_overlay.srt",
      "ffmpeg_commands_oss_key": "visual_script/task_abc123/ffmpeg_render_commands.txt",
      "rough_cut_oss_key": null,
      "total_candidates": 45,
      "selected_clips": 12,
      "uncovered_beats": 1,
      "total_duration": 52.3
    },
    "created_at": "2024-01-01T12:00:00Z",
    "finished_at": "2024-01-01T12:05:30Z"
  }
}
```

## 输出产物说明

### 1. shot_catalog.json

所有候选镜头的详细信息：

```json
{
  "style": "高级时尚广告；冷感、克制、留白；竖屏 9:16",
  "script": ["镜头缓缓推进...", ...],
  "sources": [...],
  "candidate_shots": [
    {
      "candidate_id": "src_01_shot_001",
      "source_id": "src_01",
      "source_label": "模特拍摄 01",
      "start_time": 0.0,
      "end_time": 5.2,
      "duration": 5.2,
      "selection_score": 85.5,
      "metadata": {
        "shot_description": "模特从远处向镜头走来，表情自然",
        "shot_size": "full_body",
        "camera_motion": "static",
        "actions": ["向镜头走来", "自然行走"],
        "moods": ["冷感", "自信"],
        "visual_roles": ["人物登场", "开场建立"],
        "technical_quality_score": 88,
        "visual_strength_score": 85,
        "continuity_notes": "动作完整，适合开场使用"
      }
    }
  ]
}
```

### 2. edit_plan.json

Gemini 的编辑决策和创意说明：

```json
{
  "project_title": "visual_rough_cut",
  "creative_rationale": "整体采用冷感克制的视觉风格，通过...",
  "timeline": [
    {
      "script_index": 1,
      "script_line": "镜头缓缓推进，模特从远处走向镜头",
      "shots": [
        {
          "candidate_id": "src_01_shot_003",
          "start_time": 10.5,
          "end_time": 15.2,
          "duration": 4.7,
          "why_this_shot": "这个镜头完整展现了模特走向镜头的过程",
          "transition": "cut",
          "on_screen_text": "镜头缓缓推进，模特从远处走向镜头",
          "edit_intent": "establishing",
          "confidence": 0.92
        }
      ]
    }
  ],
  "uncovered_script_lines": [],
  "review_flags": []
}
```

### 3. edit_decision_list.json (EDL)

最终选中的镜头列表，可直接用于后期制作：

```json
[
  {
    "candidate_id": "src_01_shot_003",
    "source_id": "src_01",
    "source_label": "模特拍摄 01",
    "source_locator": "uploads/model_shoot_01.mp4",
    "start_time": 10.5,
    "end_time": 15.2,
    "duration": 4.7,
    "script_index": 1,
    "script_line": "镜头缓缓推进，模特从远处走向镜头",
    "why_this_shot": "这个镜头完整展现了模特走向镜头的过程",
    "transition": "cut",
    "on_screen_text": "镜头缓缓推进，模特从远处走向镜头",
    "edit_intent": "establishing",
    "confidence": 0.92
  }
]
```

### 4. script_overlay.srt

标准 SRT 格式字幕文件，可用于后期添加字幕。

### 5. ffmpeg_render_commands.txt

FFmpeg 渲染命令脚本，可在本地执行生成 rough cut 视频。

## 使用示例

### 示例 1：基础使用

```bash
curl -X POST http://localhost:8000/v1/tasks/visual-script-editor \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "script_lines": [
      "开场：产品全景展示",
      "特写：产品细节和质感",
      "使用场景演示",
      "结尾：品牌 logo 定格"
    ],
    "style": "电商产品广告；明亮、清晰、专业；横屏 16:9",
    "sources": [
      {
        "oss_key": "uploads/product_demo.mp4"
      }
    ]
  }'
```

### 示例 2：高级使用（启用渲染）

```bash
curl -X POST http://localhost:8000/v1/tasks/visual-script-editor \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "script_lines": [
      "模特从远处走向镜头",
      "转身，头发飘动",
      "直视镜头，表情冷峻",
      "服装细节特写"
    ],
    "style": "高级时尚广告；冷感、克制、留白；竖屏 9:16",
    "sources": [
      {"oss_key": "uploads/model_01.mp4", "label": "拍摄 01"},
      {"oss_key": "uploads/model_02.mp4", "label": "拍摄 02"}
    ],
    "options": {
      "target_seconds": 30,
      "render": true,
      "canvas": "9:16",
      "fit": "cover"
    },
    "callback_url": "https://your-server.com/webhook"
  }'
```

### 示例 3：复用已有 Catalog（节省成本）

第一次分析后，可以复用 catalog 进行多次脚本尝试：

```bash
# 第一次：完整分析
curl -X POST ... -d '{...}'  # 得到 shot_catalog_oss_key

# 第二次：使用相同素材，不同脚本，复用 catalog
curl -X POST ... -d '{
  "script_lines": ["不同的脚本内容..."],
  "style": "不同的风格...",
  "sources": [...],
  "options": {
    "reuse_catalog_oss_key": "visual_script/task_abc123/shot_catalog.json"
  }
}'
```

## 环境变量配置

使用前需要设置以下环境变量：

```bash
# TwelveLabs API Key（必需）
export TWELVELABS_API_KEY="your_twelvelabs_api_key"

# Google Gemini API Key（必需）
export GEMINI_API_KEY="your_gemini_api_key"
```

## 注意事项

1. **视频大小限制**: TwelveLabs 直接上传限制 200MB，超过会自动创建代理视频
2. **最小镜头时长**: Pegasus 要求至少 2 秒
3. **成本优化**: 使用 `reuse_catalog_oss_key` 可以避免重复分析相同素材
4. **渲染限制**: 渲染 rough cut 需要所有选中片段都有本地源文件
5. **未覆盖脚本**: 如果没有匹配的镜头，会在 `uncovered_script_lines` 中标注

## 与原始脚本的兼容性

本实现完全兼容原始 `visual_script_editor_free_director.py` 的核心逻辑：
- 相同的 Pegasus 镜头定义
- 相同的 Gemini prompt 和响应 schema
- 相同的去重和评分算法
- 相同的输出格式

差异仅在于：
- 集成到 RJCut 任务队列系统
- 支持 OSS 存储而非仅本地文件
- 添加数据库状态追踪
- 支持回调通知

## 故障排查

### 问题：TwelveLabs SDK 未安装

```bash
pip install twelvelabs
```

### 问题：Gemini SDK 未安装

```bash
pip install google-genai
```

### 问题：API Key 未设置

检查环境变量：
```bash
echo $TWELVELABS_API_KEY
echo $GEMINI_API_KEY
```

### 问题：视频分析失败

查看任务错误信息，常见原因：
- 视频格式不支持
- 视频损坏
- 网络超时

可尝试：
1. 转换视频格式为 MP4 H.264
2. 减小视频大小
3. 增加 timeout_seconds