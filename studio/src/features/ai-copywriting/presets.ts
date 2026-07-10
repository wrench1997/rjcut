import type { PromptPreset } from "./types";

export const FALLBACK_PROMPT_PRESETS: PromptPreset[] = [
  { id: "avoid_fake", name: "避坑科普型", desc: "真假对比、用户教育、建立信任", riskLevel: "medium" },
  { id: "factory_trace", name: "源头实拍型", desc: "鹿场、工厂、灌装、原料实拍", riskLevel: "low" },
  { id: "live_conversion", name: "直播逼单型", desc: "强转化，但需严格合规过滤", riskLevel: "high" },
  { id: "old_customer", name: "老客复购型", desc: "复购、口碑、熟人推荐感", riskLevel: "medium" },
  { id: "short_hook", name: "短平快钩子型", desc: "10 到 20 秒短视频", riskLevel: "medium" }
];
