// 示例：把这个文件里的逻辑接到你现有后端 server。
// 不确定你的后端框架，所以补丁不会自动改入口文件。

import express from "express";
import {
  getPromptPresetOptions,
  generateAiCopywritingVideoPlan
} from "../src/modules/ai_copywriting/index.js";

export function createAiCopywritingRouter(deps) {
  const router = express.Router();

  router.get("/api/ai-copywriting/presets", (_req, res) => {
    res.json({ ok: true, presets: getPromptPresetOptions() });
  });

  router.post("/api/ai-copywriting/generate", async (req, res) => {
    try {
      const result = await generateAiCopywritingVideoPlan(req.body || {}, deps);
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: "AI_COPYWRITING_FAILED", message: err?.message || String(err) });
    }
  });

  return router;
}

// 接入示例：
// import { createAiCopywritingRouter } from "./examples/ai_copywriting_express_routes.js";
// app.use(createAiCopywritingRouter({
//   llm: yourLlmAdapter,
//   digitalHuman: yourDigitalHumanAdapter
// }));
