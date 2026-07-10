# AI Copywriting Full Patch v0.2

这个补丁同时覆盖：

- 后端：`D:\workspace\rjcut\src\modules\ai_copywriting`
- 前端：`D:\workspace\rjcut\studio\src\features\ai-copywriting`

## 目标

把旧流程：

```text
AI 文案里写“转场” → 数字人读出“转场”
```

改成：

```text
AI 输出 spoken_text + segments + transition_plan
数字人只读 spoken_text
后端根据 char_timings 把段落结束字映射成毫秒级 timeline
前端展示文案、段落、timeline
```

## 后端接入

补丁不会自动改你的 server 入口，避免打坏主项目。你需要把示例路由接进去：

```js
import { createAiCopywritingRouter } from "./examples/ai_copywriting_express_routes.js";

app.use(createAiCopywritingRouter({
  llm: yourLlmAdapter,
  digitalHuman: yourDigitalHumanAdapter
}));
```

`llm` 适配器支持：

```js
await llm.chat({ system, user, input })
```

或者：

```js
await llm.generate({ system, user, input })
```

也可以直接传函数：

```js
async function llm({ system, user }) {
  return "{...json...}";
}
```

`digitalHuman` 适配器支持：

```js
await digitalHuman.generate({ text, need_char_timing: true })
```

要求返回：

```js
{
  char_timings: [
    { index: 0, char: "想", start_ms: 0, end_ms: 120 },
    { index: 1, char: "买", start_ms: 120, end_ms: 230 }
  ]
}
```

也兼容 `start/end` 秒小数，会自动转毫秒。

## 前端接入

在 Studio 里需要的位置引入：

```tsx
import { AiCopywritingPanel } from "./features/ai-copywriting";

export function Page() {
  return (
    <AiCopywritingPanel
      defaultProduct="鹿茸血"
      materialLibrary={[
        { id: "a1", name: "鹿场背景.mp4", tags: ["鹿场背景", "源头", "实拍"] },
        { id: "a2", name: "割二杠鹿茸.mp4", tags: ["割茸实拍", "原料", "采集"] },
        { id: "a3", name: "灌装成瓶.mov", tags: ["灌装", "产品展示", "工艺"] }
      ]}
      onGenerated={(result) => {
        console.log(result.timeline);
      }}
    />
  );
}
```

默认 API：

- `GET /api/ai-copywriting/presets`
- `POST /api/ai-copywriting/generate`

如果前端有代理或后端地址，可以传：

```tsx
<AiCopywritingPanel apiBase="http://127.0.0.1:3000" />
```

## 输出重点

后端返回：

```js
{
  ok: true,
  script: {
    spoken_text: "数字人实际朗读文案",
    segments: [...],
    transition_plan: [...]
  },
  digitalHumanResult: {...},
  timeline: {
    duration_ms: 23000,
    clips: [
      { type: "main_digital_human", start_ms: 0, end_ms: 23000 },
      { type: "broll_overlay", start_ms: 3200, end_ms: 4800, asset_id: "a1" }
    ]
  }
}
```

渲染器以后看 `timeline.clips`，不要再从口播文案里识别“转场”。
