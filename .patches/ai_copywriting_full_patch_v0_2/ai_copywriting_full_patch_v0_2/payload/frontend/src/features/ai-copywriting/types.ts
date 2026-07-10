export type PromptPreset = {
  id: string;
  name: string;
  desc: string;
  riskLevel?: "low" | "medium" | "high" | string;
};

export type MaterialAsset = {
  id: string;
  name: string;
  url?: string;
  path?: string;
  tags?: string[];
  duration_ms?: number;
};

export type ScriptSegment = {
  id: string;
  text: string;
  purpose: string;
  visual_tags: string[];
  transition_after: boolean;
};

export type ScriptJson = {
  spoken_text: string;
  segments: ScriptSegment[];
  transition_plan?: Array<{
    after_segment_id: string;
    transition_type: string;
    asset_tag?: string;
    duration_ms?: number;
    keep_original_audio?: boolean;
  }>;
  meta?: Record<string, unknown>;
};

export type TimelineClip = {
  type: string;
  start_ms: number;
  end_ms: number;
  asset_id?: string | null;
  asset_name?: string | null;
  asset_url?: string;
  asset_tag?: string;
  visual_tags?: string[];
  keep_original_audio?: boolean;
  segment_id?: string;
  reason?: string;
  match_score?: number;
};

export type TimelineResult = {
  spoken_text: string;
  duration_ms: number;
  clips: TimelineClip[];
  debug?: unknown;
};

export type GenerateCopywritingInput = {
  product: string;
  presetId: string;
  userStylePrompt?: string;
  platform?: string;
  targetAudience?: string;
  durationSeconds?: number;
  sellingPoints?: string[];
  forbiddenWords?: string[];
  materialLibrary?: MaterialAsset[];
};

export type GenerateCopywritingResult = {
  ok: boolean;
  error?: string;
  message?: string;
  detail?: unknown;
  script?: ScriptJson;
  digitalHumanResult?: unknown;
  timeline?: TimelineResult;
};
