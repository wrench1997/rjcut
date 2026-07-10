function toCharArray(text) {
  return Array.from(String(text || ""));
}

function isIgnoredChar(ch) {
  return /\s/.test(ch) || ch === "\u200B" || ch === "\u200C" || ch === "\u200D" || ch === "\uFEFF";
}

function compactWithMap(text) {
  const chars = toCharArray(text);
  const compact = [];
  const map = [];
  for (let i = 0; i < chars.length; i += 1) {
    if (isIgnoredChar(chars[i])) continue;
    compact.push(chars[i]);
    map.push(i);
  }
  return { text: compact.join(""), map };
}

function maybeMs(value, maxEnd) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (maxEnd <= 300 && Math.abs(n - Math.round(n)) > 0.00001) return Math.round(n * 1000);
  return Math.round(n);
}

export function normalizeCharTimings(rawTimings) {
  if (!Array.isArray(rawTimings)) throw new Error("char timings must be an array.");
  const roughMaxEnd = Math.max(0, ...rawTimings.map((item) => Number(item.end_ms ?? item.endMs ?? item.end ?? item.end_time ?? item.endTime ?? 0)));
  return rawTimings.map((item, fallbackIndex) => {
    const index = Number.isFinite(Number(item.index)) ? Number(item.index) : fallbackIndex;
    const char = item.char ?? item.text ?? item.word ?? item.token ?? "";
    const startRaw = item.start_ms ?? item.startMs ?? item.start ?? item.start_time ?? item.startTime ?? 0;
    const endRaw = item.end_ms ?? item.endMs ?? item.end ?? item.end_time ?? item.endTime ?? startRaw;
    return { index, char: String(char), start_ms: maybeMs(startRaw, roughMaxEnd), end_ms: maybeMs(endRaw, roughMaxEnd) };
  });
}

function buildTimingIndex(charTimings) {
  const map = new Map();
  for (const item of charTimings) map.set(item.index, item);
  return map;
}

function getTimingNear(indexMap, charTimings, index, direction) {
  if (indexMap.has(index)) return indexMap.get(index);
  if (direction === "left") {
    for (let i = index; i >= 0; i -= 1) if (indexMap.has(i)) return indexMap.get(i);
  } else {
    const max = Math.max(index + 10, charTimings.length + 10);
    for (let i = index; i <= max; i += 1) if (indexMap.has(i)) return indexMap.get(i);
  }
  return charTimings[Math.max(0, Math.min(index, charTimings.length - 1))];
}

export function findSegmentTimeRange(fullText, segmentText, rawCharTimings, searchFromIndex = 0) {
  const fullChars = toCharArray(fullText);
  const segmentChars = toCharArray(segmentText);
  const charTimings = normalizeCharTimings(rawCharTimings);
  const indexMap = buildTimingIndex(charTimings);
  if (!fullChars.length || !segmentChars.length) return null;

  const full = fullChars.join("");
  const segment = segmentChars.join("");
  let start = full.indexOf(segment, searchFromIndex);

  if (start < 0) {
    const compactFull = compactWithMap(full);
    const compactSegment = compactWithMap(segment);
    let compactStart = compactFull.text.indexOf(compactSegment.text);
    while (compactStart >= 0) {
      const originalStart = compactFull.map[compactStart];
      if (originalStart >= searchFromIndex) {
        start = originalStart;
        break;
      }
      compactStart = compactFull.text.indexOf(compactSegment.text, compactStart + 1);
    }
  }

  if (start < 0) return null;
  const end = start + segmentChars.length - 1;
  const startTiming = getTimingNear(indexMap, charTimings, start, "right");
  const endTiming = getTimingNear(indexMap, charTimings, end, "left");
  if (!startTiming || !endTiming) return null;
  return { char_start: start, char_end: end, start_ms: startTiming.start_ms, end_ms: endTiming.end_ms, nextSearchFrom: end + 1 };
}

export function mapSegmentsToTimeRanges(spokenText, segments, rawCharTimings) {
  let cursor = 0;
  return segments.map((segment) => {
    const range = findSegmentTimeRange(spokenText, segment.text, rawCharTimings, cursor);
    if (range) cursor = range.nextSearchFrom;
    return { ...segment, time_range: range };
  });
}
