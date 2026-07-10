import type { GenerateCopywritingInput, GenerateCopywritingResult, PromptPreset } from "./types";
import { FALLBACK_PROMPT_PRESETS } from "./presets";

export async function fetchAiCopywritingPresets(apiBase = ""): Promise<PromptPreset[]> {
  try {
    const res = await fetch(`${apiBase}/api/ai-copywriting/presets`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return Array.isArray(json.presets) ? json.presets : FALLBACK_PROMPT_PRESETS;
  } catch (_) {
    return FALLBACK_PROMPT_PRESETS;
  }
}

export async function generateAiCopywritingPlan(
  input: GenerateCopywritingInput,
  apiBase = ""
): Promise<GenerateCopywritingResult> {
  const res = await fetch(`${apiBase}/api/ai-copywriting/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok && json?.ok !== false) {
    return { ok: false, error: `HTTP_${res.status}`, message: json?.message || res.statusText };
  }
  return json;
}
