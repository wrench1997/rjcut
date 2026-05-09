# RJCut Studio

基于 React + Vite 的批量视频处理工作室，采用 Apple 设计风格。

## 功能特性

- 🎬 **批量视频处理** - 支持同时配置和提交多个视频处理任务
- ⚡ **并发控制** - 可配置最大并发任务数
- 🔄 **自动合成** - 支持草稿完成后自动合成最终视频
- 📊 **任务管理** - 实时查看任务状态、进度和结果
- 🎨 **Apple 设计** - 遵循 Apple 设计系统的极简美学

## 快速开始

### 1. 安装依赖

```bash
cd studio
npm install
```

### 2. 配置环境变量（可选）

创建 `.env` 文件：

```env
VITE_API_BASE_URL=http://localhost:8001
```

### 3. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 4. 构建生产版本

```bash
npm run build
```

## 使用说明

### 批量处理

1. 点击 **批量处理** 标签
2. 配置全局参数：
   - 最大并发数（1-10）
   - 是否自动合成
3. 添加任务配置：
   - 任务名称（可选）
   - 主视频文件（必填）
   - 脚本文件（可选，JSON 格式）
   - 纠错字典（可选，JSON 格式）
   - 背景音乐（可选，MP3 格式）
   - 自定义配置（可选，JSON 格式）
4. 点击 **提交** 按钮

### 任务管理

- 查看所有任务的实时状态
- 刷新任务进度
- 取消排队中或处理中的任务
- 下载已完成的视频

### 设置

- 配置 API Key（保存在本地浏览器）
- 查看商户信息和配额

## 自定义配置示例

```json
{
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
}
```

## 技术栈

- **React 18** - UI 框架
- **Vite 5** - 构建工具
- **CSS Variables** - 样式系统（基于 Apple 设计令牌）

## 设计系统

遵循 Apple 设计系统的核心原则：

- 摄影优先，UI 退居其次
- 单一蓝色强调色 (#0066cc)
- SF Pro 字体系列
- 极简主义，无装饰性渐变
- 基于 8px 的间距系统

## API 接口

依赖后端 API 服务，主要接口：

- `POST /v1/uploads/presign` - 获取预签名上传 URL
- `POST /v1/uploads/confirm` - 确认上传完成
- `GET /v1/merchant/info` - 获取商户信息
- `POST /v1/tasks/agent-draft` - 创建草稿任务
- `POST /v1/tasks/compose-from-draft` - 创建合成任务
- `GET /v1/tasks` - 查询任务列表
- `GET /v1/tasks/{task_id}` - 查询任务详情
- `POST /v1/tasks/{task_id}/cancel` - 取消任务

## 许可证

MIT
