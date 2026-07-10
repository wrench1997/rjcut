# AI 文案 + 字级时间轴自动转场 v0.3（Python 后端版）

这版修正了 v0.2 的问题：后端不是 JS，而是 Python/FastAPI。

## 新增后端文件

- `ai_copywriting_timeline.py`
- `api_ai_copywriting.py`

新增接口：

- `GET /v1/ai-copywriting/presets`
- `POST /v1/ai-copywriting/validate-prompt`
- `POST /v1/ai-copywriting/generate-plan`
- `POST /v1/ai-copywriting/build-timeline`

## 新增前端文件

- `studio/src/features/template-batch/aiCopywritingClient.js`

并修改：

- `studio/src/features/template-batch/aiAssistant.js`
- `studio/src/features/template-batch/templateRegistry.js`
- `studio/src/features/template-batch/templateRunAdapter.js`
- `studio/src/components/DigitalHumanStudio.jsx`
- `studio/src/components/AIScriptGenerator.jsx`
- `studio/src/api/api.js`

## 核心变化

旧逻辑：

```text
AI 文案里写“转场” → 数字人读出来 → 后端再识别并切掉
```

新逻辑：

```text
AI 输出 spoken_text + segments + transition_plan
数字人只读 spoken_text
拿到字级 char_timings 后，后端 build-timeline 生成 timeline.clips
```

## 注意

这个补丁不会删除旧的 `cut_transition.py`，因为旧任务可能还依赖它。新版文案不再主动生成“转场”，所以旧切除逻辑通常会检测不到关键词并保留完整视频。
