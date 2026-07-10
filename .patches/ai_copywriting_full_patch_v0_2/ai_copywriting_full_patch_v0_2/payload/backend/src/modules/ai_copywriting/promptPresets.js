export const AD_PROMPT_PRESETS = Object.freeze([
  {
    id: "avoid_fake",
    name: "避坑科普型",
    desc: "真假对比、用户教育、建立信任",
    riskLevel: "medium",
    prompt: "开头用避坑提醒吸引注意，主体讲清真假差异、来源、辨别方式，结尾轻度引导。不要夸大功效，不要制造恐慌。"
  },
  {
    id: "factory_trace",
    name: "源头实拍型",
    desc: "鹿场、工厂、灌装、原料实拍",
    riskLevel: "low",
    prompt: "强调源头、采集过程、实拍画面、批次感和真实感。语气朴素，少形容，多证据。"
  },
  {
    id: "live_conversion",
    name: "直播逼单型",
    desc: "强转化，但需严格合规过滤",
    riskLevel: "high",
    prompt: "前三秒强钩子，中段讲购买理由，结尾给明确动作。避免全网最低、百分百、疗效、绝对承诺。"
  },
  {
    id: "old_customer",
    name: "老客复购型",
    desc: "复购、口碑、熟人推荐感",
    riskLevel: "medium",
    prompt: "从老客复购、日常使用场景、信任感切入。不要编造具体客户案例，不要虚构销量。"
  },
  {
    id: "short_hook",
    name: "短平快钩子型",
    desc: "10 到 20 秒短视频",
    riskLevel: "medium",
    prompt: "前三秒给强钩子，中间只讲一个核心卖点，结尾给一个动作。句子短，适合数字人口播。"
  }
]);

export function listPromptPresets() {
  return AD_PROMPT_PRESETS.map((item) => ({ ...item }));
}

export function getPromptPreset(id) {
  return AD_PROMPT_PRESETS.find((item) => item.id === id) || AD_PROMPT_PRESETS[0];
}

export function getPromptPresetOptions() {
  return AD_PROMPT_PRESETS.map(({ id, name, desc, riskLevel }) => ({ id, name, desc, riskLevel }));
}
