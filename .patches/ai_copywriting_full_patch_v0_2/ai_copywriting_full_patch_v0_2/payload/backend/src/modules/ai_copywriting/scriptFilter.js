const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;

export const DEFAULT_FORBIDDEN_WORDS = Object.freeze([
  "转场", "切镜", "镜头切到", "画面切到", "画面给到", "这里放", "此处插入", "插入素材",
  "包治", "根治", "治愈", "神效", "特效", "无副作用", "100%有效", "百分百有效", "永久有效",
  "全网最低", "第一品牌", "最高级", "国家级", "绝对", "唯一"
]);

export const USER_PROMPT_BLOCK_RULES = Object.freeze([
  {
    name: "prompt_injection",
    message: "用户提示词疑似要求绕过系统规则。",
    re: /(忽略|无视|绕过|覆盖|删除|取消).{0,16}(规则|系统|限制|审核|禁用词|提示词|安全|合规)/i
  },
  {
    name: "force_banned_claim",
    message: "用户提示词包含高风险功效或绝对化表达。",
    re: /(包治|根治|治愈|神效|特效|无副作用|100%有效|百分百有效|永久有效|全网最低|绝对|保证有效)/i
  },
  {
    name: "fake_or_fraud_instruction",
    message: "用户提示词疑似要求虚构、伪造或冒充。",
    re: /(虚假宣传|夸大功效|编造|伪造|假装|冒充|骗过|规避平台|躲审核)/i
  }
]);

export const SPOKEN_TEXT_BLOCK_RULES = Object.freeze([
  {
    name: "director_words_in_spoken_text",
    message: "口播文案中包含导演提示词，应移动到 visual_tags 或 timeline。",
    re: /(转场|切镜|镜头切到|画面切到|画面给到|这里放|此处插入|插入素材|B-roll|broll)/i
  },
  {
    name: "absolute_ad_words",
    message: "口播文案中包含绝对化广告词。",
    re: /(国家级|最高级|最佳|第一品牌|全网最低|100%|百分百|永久|绝对|保证有效|唯一)/i
  },
  {
    name: "medical_claims",
    message: "口播文案中包含医疗功效或疾病治疗表达。",
    re: /(治疗|治愈|根治|药效|疗效|降三高|壮阳|补肾|改善疾病|无副作用|药到病除)/i
  }
]);

export function normalizePlainText(input) {
  return String(input || "")
    .replace(ZERO_WIDTH_RE, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateByRules(text, rules) {
  const normalized = normalizePlainText(text);
  const hits = [];
  for (const rule of rules) {
    if (rule.re.test(normalized)) hits.push({ name: rule.name, message: rule.message });
  }
  return { ok: hits.length === 0, hits };
}

export function validateUserPrompt(input, options = {}) {
  const maxLength = options.maxLength || 800;
  const text = normalizePlainText(input);
  if (text.length > maxLength) {
    return { ok: false, hits: [{ name: "too_long", message: `用户自定义提示词过长，最大 ${maxLength} 字。` }] };
  }
  return validateByRules(text, USER_PROMPT_BLOCK_RULES);
}

export function validateSpokenText(text, options = {}) {
  const extraForbiddenWords = Array.isArray(options.extraForbiddenWords) ? options.extraForbiddenWords : [];
  const extraRules = extraForbiddenWords.filter(Boolean).map((word) => ({
    name: `extra_forbidden_word:${word}`,
    message: `口播文案包含业务禁用词：${word}`,
    re: new RegExp(escapeRegExp(word), "i")
  }));
  return validateByRules(text, [...SPOKEN_TEXT_BLOCK_RULES, ...extraRules]);
}

export function removeDirectorWordsFromSpokenText(text) {
  return normalizePlainText(text)
    .replace(/转场/g, "")
    .replace(/切镜/g, "")
    .replace(/镜头切到/g, "")
    .replace(/画面切到/g, "")
    .replace(/画面给到/g, "")
    .replace(/这里放/g, "")
    .replace(/此处插入/g, "")
    .replace(/插入素材/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildRepairInstruction(validateResult) {
  const names = (validateResult?.hits || []).map((item) => item.name).join("、") || "unknown";
  return [
    `以下口播文案命中过滤规则：${names}`,
    "请保留原意并重写。",
    "要求：",
    "1. 删除所有导演提示词，例如“转场”“镜头切到”“画面给到”。",
    "2. 不出现医疗功效、绝对化、虚假承诺。",
    "3. 只输出 JSON。",
    "4. spoken_text 只能是数字人要朗读的内容。",
    "5. 剪辑建议必须放到 segments.visual_tags 或 transition_plan，不得混入口播。"
  ].join("\n");
}
