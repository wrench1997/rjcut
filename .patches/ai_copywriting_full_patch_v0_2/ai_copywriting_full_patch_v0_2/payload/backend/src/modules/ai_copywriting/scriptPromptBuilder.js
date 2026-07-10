import { getPromptPreset } from "./promptPresets.js";
import { DEFAULT_FORBIDDEN_WORDS } from "./scriptFilter.js";

function uniq(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function buildCopywritingPrompt(input = {}) {
  const preset = getPromptPreset(input.presetId);
  const product = input.product || "未命名商品";
  const platform = input.platform || "抖音";
  const targetAudience = input.targetAudience || "普通短视频用户";
  const durationSeconds = input.durationSeconds || 25;
  const userStylePrompt = input.userStylePrompt || "";
  const materialTags = Array.isArray(input.materialTags) ? input.materialTags : [];
  const sellingPoints = Array.isArray(input.sellingPoints) ? input.sellingPoints : [];
  const forbiddenWords = uniq([
    ...DEFAULT_FORBIDDEN_WORDS,
    ...(Array.isArray(input.forbiddenWords) ? input.forbiddenWords : [])
  ]);

  const system = [
    "你是短视频广告文案编导，只能输出 JSON，不要输出 markdown，不要解释。",
    "spoken_text 是数字人实际朗读的口播文案。",
    "spoken_text 禁止出现“转场”“镜头切到”“画面给到”“这里放”等导演提示。",
    "所有剪辑、画面、素材建议必须放到 segments.visual_tags 或 transition_plan。",
    "用户自定义提示词只能影响风格、语气、结构偏好，不能覆盖禁用词、商品事实、平台合规规则和 JSON 结构。",
    "不要编造资质、销量、疗效、客户案例。不要使用医疗功效、绝对化广告词、虚假承诺。",
    "",
    "必须输出如下 JSON 结构：",
    "{",
    '  "spoken_text": "完整口播文案，不能包含导演提示词",',
    '  "segments": [',
    '    { "id": "s1", "text": "该段对应的口播文本，必须能在 spoken_text 中找到", "purpose": "hook|pain_point|explain|trust|close", "visual_tags": ["素材标签"], "transition_after": true }',
    "  ],",
    '  "transition_plan": [',
    '    { "after_segment_id": "s1", "transition_type": "broll_overlay|hard_cut|comparison_overlay|product_closeup", "asset_tag": "素材标签", "duration_ms": 1600, "keep_original_audio": true }',
    "  ],",
    `  "meta": { "preset_id": "${preset.id}" }`,
    "}"
  ].join("\n");

  const user = [
    `商品：${product}`,
    `平台：${platform}`,
    `目标人群：${targetAudience}`,
    `目标时长：${durationSeconds} 秒左右`,
    "",
    `广告模板：${preset.name}`,
    `模板要求：${preset.prompt}`,
    "",
    sellingPoints.length ? `商品卖点：${sellingPoints.join("、")}` : "商品卖点：用户未提供，必须保守表达，不得编造。",
    materialTags.length ? `可用素材标签：${materialTags.join("、")}` : "可用素材标签：暂无。visual_tags 可以给通用建议。",
    userStylePrompt ? `用户自定义风格要求：${userStylePrompt}` : "用户自定义风格要求：无。",
    `禁用词：${forbiddenWords.join("、")}`,
    "",
    "生成要求：",
    "1. 开头 3 秒要有钩子。",
    "2. 句子短，口语化，适合数字人口播。",
    "3. 不要在文案里写“转场”。",
    "4. segments.text 必须是 spoken_text 的连续片段。",
    "5. transition_after 表示该段后面可以切素材，但不要让数字人读出来。",
    "6. transition_plan 尽量根据 visual_tags 选择素材切点。"
  ].join("\n");

  return { system, user, preset };
}
