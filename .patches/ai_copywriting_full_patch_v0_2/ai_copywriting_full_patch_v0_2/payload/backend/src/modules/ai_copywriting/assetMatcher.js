function normalizeTag(tag) {
  return String(tag || "").trim().toLowerCase();
}
function unique(items) { return Array.from(new Set(items.filter(Boolean))); }

export function normalizeAsset(asset) {
  return {
    id: String(asset.id || asset.name || asset.filename || ""),
    name: String(asset.name || asset.filename || asset.id || ""),
    url: asset.url || asset.path || asset.src || "",
    duration_ms: Number.isFinite(Number(asset.duration_ms)) ? Number(asset.duration_ms) : null,
    tags: unique([...(Array.isArray(asset.tags) ? asset.tags : []), asset.name, asset.filename].map(normalizeTag)),
    raw: asset
  };
}

export function scoreAssetByTags(asset, tags) {
  const normalizedAsset = normalizeAsset(asset);
  const wanted = unique((Array.isArray(tags) ? tags : []).map(normalizeTag));
  let score = 0;
  const reasons = [];
  for (const tag of wanted) {
    if (!tag) continue;
    if (normalizedAsset.tags.includes(tag)) { score += 5; reasons.push(`exact:${tag}`); continue; }
    const fuzzyHit = normalizedAsset.tags.find((assetTag) => assetTag.includes(tag) || tag.includes(assetTag));
    if (fuzzyHit) { score += 2; reasons.push(`fuzzy:${tag}`); }
  }
  return { asset: normalizedAsset, score, reasons };
}

export function matchAssetByTags(assets, tags, options = {}) {
  const excludeIds = new Set(options.excludeIds || []);
  const candidates = (Array.isArray(assets) ? assets : [])
    .map((asset) => scoreAssetByTags(asset, tags))
    .filter((item) => item.score > 0)
    .filter((item) => !excludeIds.has(item.asset.id))
    .sort((a, b) => b.score - a.score);
  return candidates[0] || null;
}

export function matchAssetsForTimeline(assets, candidates) {
  const used = new Set();
  return candidates.map((candidate) => {
    const tags = [...(candidate.visual_tags || []), candidate.asset_tag || ""].filter(Boolean);
    const matched = matchAssetByTags(assets, tags, { excludeIds: used });
    if (matched?.asset?.id) used.add(matched.asset.id);
    return { ...candidate, matched_asset: matched?.asset || null, asset_match_score: matched?.score || 0, asset_match_reasons: matched?.reasons || [] };
  });
}
