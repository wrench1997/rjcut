# 数字人功能集成说明

## 概述

本文档说明如何将 RJCut 数字人 API 集成到前端 Studio 中。

## 新增文件

### 1. `src/components/DigitalHumanManager.jsx`

数字人管理主组件，提供以下功能：
- 📋 查看公共数字人列表
- 🎭 查看自定义数字人列表
- 🔄 同步自定义数字人状态
- 🎬 创建视频生成任务
- 📹 训练新的自定义数字人
- 🗑️ 删除数字人

### 2. `src/api/api.js` (已更新)

新增数字人 API 接口：
```javascript
// 获取公共数字人列表
export const getCommonPersons = () => apiClient.get('/v1/dh/persons/common');

// 获取自定义数字人列表
export const getCustomPersons = () => apiClient.get('/v1/dh/persons/custom');

// 获取自定义数字人详情
export const getCustomPersonDetail = (person_id) => apiClient.get(`/v1/dh/persons/custom/${person_id}`);

// 同步自定义数字人
export const syncCustomPersons = () => apiClient.post('/v1/dh/persons/custom/sync');

// 删除自定义数字人
export const deleteCustomPerson = (person_id) => apiClient.post(`/v1/dh/persons/custom/${person_id}/delete`);

// 获取声音列表
export const getVoices = () => apiClient.get('/v1/dh/voices');

// 删除定制声音
export const deleteVoice = (audio_id) => apiClient.post(`/v1/dh/voices/${audio_id}/delete`);

// 创建视频生成任务
export const createDhGenerateTask = (payload) => apiClient.post('/v1/dh/tasks/generate', payload);

// 创建自定义数字人训练任务
export const createDhPersonTask = (payload) => apiClient.post('/v1/dh/tasks/create-person', payload);

// 删除视频任务
export const deleteDhTask = (task_id) => apiClient.post(`/v1/dh/tasks/${task_id}/delete`);

// 删除文件
export const deleteDhFile = (file_id) => apiClient.post(`/v1/dh/files/${file_id}/delete`);
```

### 3. `src/App.jsx` (已更新)

- 新增顶部导航按钮：🎭 数字人
- 新增数字人管理页面路由
- 集成 `DigitalHumanManager` 组件

## 使用指南

### 1. 启动前端服务

```bash
cd studio
npm run dev
```

### 2. 访问数字人管理页面

1. 打开浏览器访问 `http://localhost:5173`（或你的 Vite 开发服务器地址）
2. 点击顶部导航栏的 **🎭 数字人** 按钮

### 3. 功能说明

#### 公共数字人
- 查看平台提供的所有公共数字人模型
- 点击 "使用此数字人" 可以创建视频生成任务

#### 自定义数字人
- 查看自己训练的私有数字人
- 点击 "🔄 刷新" 获取最新训练进度
- 点击 "🗑️ 删除" 删除数字人（不可恢复）
- 点击 "同步" 从蝉镜平台同步最新状态

#### 训练新数字人
1. 点击 "训练新数字人" 标签
2. 填写数字人名称
3. 上传素材视频（需要清晰的正面人像视频）
4. 选择训练类型（声音 + 形象 / 仅声音 / 仅形象）
5. 点击 "开始训练"

#### 创建视频任务
1. 在数字人列表中点击 "使用此数字人"
2. 填写要合成的文本内容
3. 选择声音模型（可选，不选则使用数字人原生声音）
4. 选择形象类型、驱动模式、背景等
5. 点击 "创建视频任务"

## API 响应格式

所有数字人 API 返回统一格式：

```json
{
  "code": 0,
  "message": "ok",
  "data": { ... }
}
```

- `code: 0` 表示成功
- `code != 0` 表示失败，查看 `message` 字段了解错误原因

## 状态码说明

### 数字人训练状态
| 状态码 | 说明 |
|--------|------|
| 10 | 训练中 |
| 30 | 成功 |
| 40 | 失败 |

### 任务状态
| 状态 | 说明 |
|------|------|
| queued | 等待中 |
| processing | 处理中 |
| succeeded | 成功 |
| failed | 失败 |
| cancelled | 已取消 |

## 注意事项

1. **API 地址配置**：确保 `studio/.env` 中的 `VITE_API_BASE_URL` 指向正确的后端地址

2. **API Key 认证**：所有请求会自动携带 API Key，无需手动配置

3. **训练时间**：自定义数字人训练通常需要 30 分钟到 2 小时

4. **配额控制**：创建任务会消耗配额，请确保商户配额充足

5. **文件上传**：训练数字人需要先上传素材视频到 OSS

## 故障排除

### 问题：无法加载数字人列表
- 检查后端服务是否运行
- 检查 API 地址配置是否正确
- 检查 API Key 是否有效

### 问题：上传视频失败
- 检查网络连接
- 检查文件大小是否超限
- 检查浏览器控制台错误信息

### 问题：创建任务失败
- 检查配额是否充足
- 检查参数是否完整
- 查看错误提示信息

## 相关文件

- 后端 API 实现：`../api_digital_human.py`
- API 文档：`../数字人 API.MD`
- 任务处理器：`../tasks/chanjing_video.py`
- 蝉镜 API 客户端：`../chanjing_api.py`
