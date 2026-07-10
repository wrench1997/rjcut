import { mapSegmentsToTimeRanges, normalizeCharTimings } from "./charTimingMapper.js";
import { matchAssetsForTimeline } from "./assetMatcher.js";

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function purposeDefaultDuration(purpose) {
  switch (purpose) {
    case "hook": return 1200;
    case "pain_point": return 1600;
    case "trust": return 1800;
    case "close": return 1300;
    default: return 1500;
  }
}

function findTransitionPlan(script, segmentId) {
  const list = Array.isArray(script.transition_plan) ? script.transition_plan : [];
  return list.find((item) => item.after_segment_id === segmentId) || null;
}

export function buildTransitionCandidates(script, rawCharTimings, options = {}) {
  const minGapMs = Number.isFinite(Number(options.minGapMs)) ? Number(options.minGapMs) : 500;
  const mappedSegments = mapSegmentsToTimeRanges(script.spoken_text, script.segments, rawCharTimings);
  const candidates = [];
  let lastTransitionMs = -Infinity;

  for (const segment of mappedSegments) {
    if (!segment.time_range) continue;
    if (!segment.transition_after) continue;
    const plan = findTransitionPlan(script, segment.id);
    const transitionMs = segment.time_range.end_ms;
    if (transitionMs - lastTransitionMs < minGapMs) continue;
    lastTransitionMs = transitionMs;
    candidates.push({
      segment_id: segment.id,
      transition_ms: transitionMs,
      purpose: segment.purpose,
      visual_tags: segment.visual_tags || [],
      transition_type: plan?.transition_type || "broll_overlay",
      asset_tag: plan?.asset_tag || "",
      duration_ms: clampNumber(plan?.duration_ms || purposeDefaultDuration(segment.purpose), 600, 5000),
      keep_original_audio: typeof plan?.keep_original_audio === "boolean" ? plan.keep_original_audio : true,
      reason: `after_${segment.purpose || "segment"}`
    });
  }
  return candidates;
}

function getMainDurationMs(rawCharTimings) {
  const timings = normalizeCharTimings(rawCharTimings);
  if (!timings.length) return 0;
  return Math.max(...timings.map((item) => item.end_ms || 0));
}

function avoidOverlayConflict(clips, mainEndMs) {
  const sorted = [...clips].sort((a, b) => a.start_ms - b.start_ms);
  for (let i = 0; i < sorted.length; i += 1) {
    const clip = sorted[i];
    const next = sorted[i + 1];
    if (next && clip.end_ms > next.start_ms - 120) clip.end_ms = Math.max(clip.start_ms + 400, next.start_ms - 120);
    if (clip.end_ms > mainEndMs) clip.end_ms = mainEndMs;
  }
  return sorted.filter((clip) => clip.end_ms > clip.start_ms);
}

export function buildTimelineFromScript(input = {}) {
  const script = input.script;
  const charTimings = input.charTimings || input.digitalHumanResult?.char_timings || [];
  const materialLibrary = input.materialLibrary || [];
  const options = input.options || {};
  if (!script?.spoken_text) throw new Error("script.spoken_text is required.");
  if (!Array.isArray(script.segments)) throw new Error("script.segments is required.");
  if (!Array.isArray(charTimings) || charTimings.length === 0) throw new Error("charTimings is required.");

  const mainEndMs = getMainDurationMs(charTimings);
  const candidates = buildTransitionCandidates(script, charTimings, options);
  const matched = matchAssetsForTimeline(materialLibrary, candidates);
  const overlayClips = matched.map((item) => {
    const startMs = clampNumber(item.transition_ms + (options.cutOffsetMs || 0), 0, Math.max(0, mainEndMs - 200));
    const durationMs = clampNumber(item.duration_ms, 600, 5000);
    return {
      type: item.transition_type || "broll_overlay",
      start_ms: startMs,
      end_ms: Math.min(mainEndMs, startMs + durationMs),
      asset_id: item.matched_asset?.id || null,
      asset_name: item.matched_asset?.name || null,
      asset_url: item.matched_asset?.url || "",
      asset_tag: item.asset_tag || "",
      visual_tags: item.visual_tags || [],
      keep_original_audio: item.keep_original_audio !== false,
      reason: item.reason,
      segment_id: item.segment_id,
      match_score: item.asset_match_score || 0,
      match_reasons: item.asset_match_reasons || []
    };
  });

  return {
    spoken_text: script.spoken_text,
    duration_ms: mainEndMs,
    clips: [{ type: "main_digital_human", start_ms: 0, end_ms: mainEndMs, keep_original_audio: true }, ...avoidOverlayConflict(overlayClips, mainEndMs)],
    debug: { candidates, matched }
  };
}
