# RJCut Agent 核心技能库 (Agent Skills Manual)

本文档面向 LLM Agent，描述如何使用 RJCut API 完成“数字人视频生成”、“专属形象克隆”及“自动混剪合成”三大工作流。
所有的接口都必须在 HTTP Header 中携带身份验证：`Authorization: Bearer <API_KEY>`

## 核心工作流 (Workflows)

Agent 应该根据用户的意图，自主组合以下步骤：

### 工作流 A：数字人播报生成 (Digital Human Video)
**场景**：用户给定一段文案，要求生成数字人讲话的视频。
**执行步骤**：
1. 调用 `GET /v1/dh/persons/common` 获取可用数字人形象，或 `GET /v1/dh/persons/custom` 获取用户的私有形象，提取 `person_id`。
2. 调用 `GET /v1/dh/voices` 获取配音员列表，提取 `audio_man_id`。
3. 调用 `POST /v1/dh/tasks/generate` 提交生成任务，获取 `task_id`。
4. 循环调用 `GET /v1/tasks/{task_id}` 轮询进度，直到 `status` 为 `succeeded`。
5. 调用 `GET /v1/tasks/{task_id}/files/final_video` 获取视频下载直链，返回给用户。

### 工作流 B：数字人克隆训练 (Digital Human Cloning)
**场景**：用户上传了一段真人出镜视频，要求训练专属数字人。
**执行步骤**：
1. 将视频以 multipart 方式提交到 `POST /v1/uploads/relay`，由系统 API 转存至 MinIO 并直接返回已确认的 `oss_key`。
2. 调用 `POST /v1/dh/tasks/create-person` 提交训练任务，传入 `oss_key` 和 `name`。
3. 循环调用 `GET /v1/tasks/{task_id}` 轮询进度 (通常耗时较长)。
4. 成功后，告知用户已克隆完成，可使用其作为 `person_id`。

### 工作流 C：全自动去口播混剪 (Auto Composition & Lip-Sync)
**场景**：用户提供一个带“转场”口播的原始视频，要求切掉无用部分，自动合成并加上大字报字幕。
**执行步骤**：
1. 上传主视频至对象存储，获取 `oss_key`。
2. 调用 `POST /v1/tasks/agent-compose` 提交混剪任务，获取 `task_id`。
3. 循环调用 `GET /v1/tasks/{task_id}` 轮询状态，直到 `status` 为 `succeeded`。
4. 调用 `GET /v1/tasks/{task_id}/files/final_video` 获取成品视频。

---

## 工具接口定义 (Tool Definitions)

### 1. 基础资源查询工具
**1.1 查询公共数字人形象 (`get_common_persons`)**
- Endpoint: `GET /v1/dh/persons/common`
- 描述: 返回可用的 `person_id`、形象名称及封面。

**1.2 查询私有数字人形象 (`get_custom_persons`)**
- Endpoint: `GET /v1/dh/persons/custom`
- 描述: 返回用户自己训练出来的专属数字人列表及 `person_id`。

**1.3 查询声音模型 (`get_voices`)**
- Endpoint: `GET /v1/dh/voices`
- 描述: 返回可用的配音员 `audio_man_id` 及声音特征。

---

### 2. 任务提交工具

**2.1 提交数字人视频生成任务 (`submit_dh_generate`)**
- Endpoint: `POST /v1/dh/tasks/generate`
- Payload:
  ```json
  {
    "text": "<需要播报的文案>",
    "person_id": "<数字人ID>",
    "audio_man_id": "<配音员ID>",
    "figure_type": "half_body", 
    "drive_mode": "random",
    "bg_type": "color",
    "bg_color": "#EDEDED"
  }
  ```
- 返回: `{"data": {"task_id": "xxx", "status": "queued"}}`

**2.2 提交数字人克隆任务 (`submit_dh_clone`)**
- Endpoint: `POST /v1/dh/tasks/create-person`
- Payload:
  ```json
  {
    "name": "<给数字人起个名字>",
    "source_video_oss_key": "<已上传的原视频oss_key>",
    "train_type": "both"
  }
  ```
- 返回: `{"data": {"task_id": "xxx", "status": "queued"}}`

**2.3 提交视频自动混剪合成任务 (`submit_video_compose`)**
- Endpoint: `POST /v1/tasks/agent-compose`
- Payload:
  ```json
  {
    "input": {
      "video_url": "<主视频URL或oss_key>"
    },
    "pipeline": {
      "remove_keyword": "转场",
      "resync_subtitle": true
    },
    "subtitle": {
      "effect": "ad",
      "font_size": 88
    }
  }
  ```
- 返回: `{"data": {"task_id": "xxx", "status": "queued"}}`

---

### 3. 任务轮询与产物获取工具

**3.1 查询任务状态 (`query_task_status`)**
- Endpoint: `GET /v1/tasks/{task_id}`
- 描述: 持续调用此接口，检查 `status` 字段。有效状态包含: `queued`, `processing`, `succeeded`, `failed`, `timeout`。当达到 `succeeded` 时进行下一步。

**3.2 获取产物下载链接 (`get_download_url`)**
- Endpoint: `GET /v1/tasks/{task_id}/files/{file_key}`
- 参数:
  - `task_id`: 任务ID
  - `file_key`: 混剪和数字人视频均固定传 `final_video` 即可。
- 描述: 返回包含有效期 1 小时的直链下载地址 (`download_url`)。

## Agent 异常处理准则
1. 如果返回 HTTP 402 `insufficient quota`，Agent 必须提示用户：“商户余额不足，请联系系统管理员充值”。
2. 如果返回 HTTP 429 `limit reached`，Agent 应自动等待 30 秒后重试提交。
3. 任务轮询时，如发现状态变为 `failed`，Agent 必须读取 `result.error` 字段并翻译成人话反馈给用户。
