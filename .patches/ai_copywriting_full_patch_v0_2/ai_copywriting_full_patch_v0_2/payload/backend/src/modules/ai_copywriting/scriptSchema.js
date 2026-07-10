import { normalizePlainText, removeDirectorWordsFromSpokenText } from "./scriptFilter.js";

function splitIntoSentences(text) {
  const normalized = normalizePlainText(text);
  if (!normalized) return [];
  const parts = normalized.split(/(?<=[。！？!?；;])/).map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

export function makeSegmentsFromText(text) {
  return splitIntoSentences(text).map((part, index, arr) => ({
    id: `s${index + 1}`,
    text: part,
    purpose: index === 0 ? "hook" : index === arr.length - 1 ? "close" : "explain",
    visual_tags: [],
    transition_after: index !== arr.length - 1
  }));
}

export function tryParseJson(raw) {
  if (typeof raw !== "string") return raw;
  const text = raw.trim();
  try { return JSON.parse(text); } catch (_) {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return JSON.parse(fenced[1].trim());
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return JSON.parse(text.slice(firstBrace, lastBrace + 1));
  throw new Error("LLM output is not valid JSON.");
}

function guessPurpose(index, total) {
  if (index === 0) return "hook";
  if (index === total - 1) return "close";
  if (index === 1) return "pain_point";
  return "explain";
}

export function normalizeScriptJson(raw) {
  const parsed = tryParseJson(raw);
  const spokenText = removeDirectorWordsFromSpokenText(parsed.spoken_text || parsed.text || parsed.script || parsed.copywriting || "");
  const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : makeSegmentsFromText(spokenText);

  const segments = rawSegments.map((seg, index) => ({
    id: String(seg.id || `s${index + 1}`),
    text: removeDirectorWordsFromSpokenText(seg.text || ""),
    purpose: String(seg.purpose || guessPurpose(index, rawSegments.length)),
    visual_tags: Array.isArray(seg.visual_tags) ? seg.visual_tags.map(String).filter(Boolean) : [],
    transition_after: typeof seg.transition_after === "boolean" ? seg.transition_after : index !== rawSegments.length - 1
  })).filter((seg) => seg.text);

  const transition_plan = Array.isArray(parsed.transition_plan)
    ? parsed.transition_plan.map((item, index) => ({
        after_segment_id: String(item.after_segment_id || item.segment_id || segments[Math.min(index, segments.length - 1)]?.id || `s${index + 1}`),
        transition_type: String(item.transition_type || "broll_overlay"),
        asset_tag: item.asset_tag ? String(item.asset_tag) : "",
        duration_ms: Number.isFinite(Number(item.duration_ms)) ? Number(item.duration_ms) : 1600,
        keep_original_audio: typeof item.keep_original_audio === "boolean" ? item.keep_original_audio : true
      }))
    : [];

  return { spoken_text: spokenText, segments, transition_plan, meta: parsed.meta || {} };
}

export function assertScriptJson(script) {
  if (!script || typeof script !== "object") throw new Error("script must be an object.");
  if (!script.spoken_text || typeof script.spoken_text !== "string") throw new Error("script.spoken_text is required.");
  if (!Array.isArray(script.segments) || script.segments.length === 0) throw new Error("script.segments must be a non-empty array.");
  for (const seg of script.segments) {
    if (!seg.id) throw new Error("segment.id is required.");
    if (!seg.text) throw new Error(`segment ${seg.id} text is required.`);
  }
  return true;
}
