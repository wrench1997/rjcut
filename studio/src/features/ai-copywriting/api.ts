import type { GenerateCopywritingInput, GenerateCopywritingResult, PromptPreset } from "./types";
import { FALLBACK_PROMPT_PRESETS } from "./presets";
import { getApiKey, getBaseUrl } from "../../api/api";

function buildAuthHeaders(includeContentType = false) {
  const token = getApiKey && getApiKey();
  const headers: Record<string, string> = {};
  if (includeContentType) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function resolveApiBase(apiBase = "") {
  return (apiBase || getBaseUrl()).replace(/\/$/, "");
}

export async function fetchAiCopywritingPresets(apiBase = ""): Promise<PromptPreset[]> {
  const base = resolveApiBase(apiBase);
  try {
    const res = await fetch(`${base}/v1/ai-copywriting/presets`, {
      headers: buildAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = json?.data;
    const rawPresets = Array.isArray(data?.presets) ? data.presets : [];
    if (!rawPresets.length) {
      return FALLBACK_PROMPT_PRESETS;
    }

    return rawPresets
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const preset = item as Record<string, unknown>;
        return {
          id: String(preset.id || ""),
          name: String(preset.name || ""),
          desc: String(preset.desc || preset.description || ""),
          riskLevel: String(preset.riskLevel || preset.risk_level || ""),
        };
      })
      .filter((preset): preset is PromptPreset => Boolean(preset?.id && preset?.name));
  } catch (_) {
    return FALLBACK_PROMPT_PRESETS;
  }
}

export async function generateAiCopywritingPlan(
  input: GenerateCopywritingInput,
  apiBase = ""
): Promise<GenerateCopywritingResult> {
  const base = resolveApiBase(apiBase);
  const res = await fetch(`${base}/v1/ai-copywriting/generate-plan`, {
    method: "POST",
    headers: buildAuthHeaders(true),
    body: JSON.stringify(input)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok && json?.ok !== false) {
    return { ok: false, error: `HTTP_${res.status}`, message: json?.message || res.statusText };
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP_${res.status}`, message: json?.message || res.statusText };
  }

  const data = json?.data;
  if (json?.code !== undefined && json.code !== 0 && json.code !== 200) {
    return { ok: false, error: String(json.code), message: json?.message || res.statusText };
  }

  return { ok: true, ...data };
}
