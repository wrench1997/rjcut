import { buildCopywritingPrompt } from "./scriptPromptBuilder.js";
import { validateUserPrompt, validateSpokenText, buildRepairInstruction } from "./scriptFilter.js";
import { normalizeScriptJson, assertScriptJson } from "./scriptSchema.js";
import { buildTimelineFromScript } from "./transitionPlanner.js";

async function callLlm(llm, messages) {
  if (!llm) throw new Error("deps.llm is required.");
  if (typeof llm.chat === "function") return llm.chat(messages);
  if (typeof llm.generate === "function") return llm.generate(messages);
  if (typeof llm === "function") return llm(messages);
  throw new Error("deps.llm must be function or { chat/generate }.");
}

async function callDigitalHuman(digitalHuman, text) {
  if (!digitalHuman) throw new Error("deps.digitalHuman is required.");
  if (typeof digitalHuman.generate === "function") return digitalHuman.generate({ text, need_char_timing: true });
  if (typeof digitalHuman.create === "function") return digitalHuman.create({ text, need_char_timing: true });
  if (typeof digitalHuman === "function") return digitalHuman({ text, need_char_timing: true });
  throw new Error("deps.digitalHuman must be function or { generate/create }.");
}

export async function generateStructuredCopywriting(input = {}, deps = {}) {
  const userPromptCheck = validateUserPrompt(input.userStylePrompt || "");
  if (!userPromptCheck.ok) {
    return { ok: false, error: "USER_PROMPT_BLOCKED", detail: userPromptCheck.hits };
  }

  const prompt = buildCopywritingPrompt(input);
  const rawScript = await callLlm(deps.llm, { system: prompt.system, user: prompt.user, input });
  let script = normalizeScriptJson(rawScript);
  assertScriptJson(script);

  let scriptCheck = validateSpokenText(script.spoken_text, { extraForbiddenWords: input.forbiddenWords || [] });
  if (!scriptCheck.ok && deps.llm) {
    const repaired = await callLlm(deps.llm, {
      system: prompt.system,
      user: [buildRepairInstruction(scriptCheck), "", "原始 JSON：", JSON.stringify(script)].join("\n"),
      input
    });
    script = normalizeScriptJson(repaired);
    assertScriptJson(script);
    scriptCheck = validateSpokenText(script.spoken_text, { extraForbiddenWords: input.forbiddenWords || [] });
  }

  if (!scriptCheck.ok) {
    return { ok: false, error: "SCRIPT_BLOCKED", detail: scriptCheck.hits, script };
  }

  return { ok: true, script, promptPreset: prompt.preset };
}

export async function generateAiCopywritingVideoPlan(input = {}, deps = {}) {
  const scriptResult = await generateStructuredCopywriting(input, deps);
  if (!scriptResult.ok) return scriptResult;

  const digitalHumanResult = input.digitalHumanResult || await callDigitalHuman(deps.digitalHuman, scriptResult.script.spoken_text);
  const charTimings = digitalHumanResult.char_timings || digitalHumanResult.charTimings || digitalHumanResult.timings || [];

  const timeline = buildTimelineFromScript({
    script: scriptResult.script,
    charTimings,
    materialLibrary: input.materialLibrary || [],
    options: { minGapMs: 500, cutOffsetMs: 0, ...(input.timelineOptions || {}) }
  });

  return { ok: true, script: scriptResult.script, digitalHumanResult, timeline };
}
