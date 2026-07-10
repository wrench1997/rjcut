#!/usr/bin/env python3
"""
Visual Script Editor Demo
==========================

Turn raw fashion/model footage plus a written visual script into an editable
rough cut:

1. TwelveLabs Pegasus 1.5 segments each source video into technically usable,
   visually described candidate shots (one segment definition per video).
2. Gemini chooses and orders those candidates according to the visual script.
3. The script writes a shot catalog, edit decision list (EDL), captions SRT,
   FFmpeg commands, and optionally renders a silent rough-cut MP4.

This is intentionally an *editorial rough-cut* demo. It does not invent shots,
re-time performances, generate B-roll, or burn Chinese captions into the MP4.
It only selects from the original footage. Review the resulting EDL before
publishing.

Required environment variables:
    TWELVELABS_API_KEY  # needed only when building a new Pegasus catalog
    GEMINI_API_KEY      # needed for the Gemini director step

Typical PowerShell run:
    python .\\visual_script_editor_demo.py `
      --script .\\script.txt `
      --style "高级时尚广告；冷感、克制、留白；竖屏 9:16" `
      --files .\\raw\\model_01.mp4 .\\raw\\model_02.mp4 `
      --render

Public URLs must be direct raw media URLs (for example, a CDN .mp4), not a
YouTube / Douyin / Bilibili page URL. Rendering requires local source files.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    from twelvelabs import TwelveLabs
    from twelvelabs.types import AsyncResponseFormat, VideoContext_AssetId, VideoContext_Url
except ImportError as exc:
    raise SystemExit(
        "Missing TwelveLabs SDK. Install dependencies with:\n"
        "  pip install -r requirements_visual_script_editor.txt\n\n"
        f"Details: {exc}"
    )

# Google GenAI (Gemini) is optional. Import lazily when needed.
_genai_available = False
try:
    from google import genai
    _genai_available = True
except ImportError:
    pass  # Will fail later only if Gemini is actually used


# One definition only. On paid TwelveLabs plans, each additional segment
# definition can multiply video-processing cost, so do not split this into
# separate "close-up", "walk", "turn", etc. definitions for a first test.
CANDIDATE_SHOT_DEFINITION: dict[str, Any] = {
    "id": "usable_editorial_shots",
    "description": (
        "Extract all distinct, continuous, editor-ready fashion or commercial visual shots. "
        "A shot may show a model walking, turning, posing, looking at camera, interacting with a product, "
        "or a useful atmospheric/detail/establishing image. Keep only footage with a readable subject and action, "
        "a deliberate composition, and acceptable technical quality. Exclude camera setup, crew, clapperboards, "
        "empty waiting, accidental framing, obvious focus failures, severe shake, duplicate takes when one is clearly inferior, "
        "and unusable blurred or blocked moments. Segment at meaningful action/composition changes. "
        "The result will be used later to match an abstract advertising script to real shots, so describe visual intent precisely."
    ),
    "fields": [
        {
            "name": "shot_description",
            "type": "string",
            "description": "Chinese description of the exact visible subject, action, pose, setting, clothing/product, and composition in this segment.",
        },
        {
            "name": "shot_size",
            "type": "string",
            "enum": ["extreme_wide", "wide", "full_body", "medium", "close_up", "extreme_close_up", "detail"],
            "description": "The dominant framing size.",
        },
        {
            "name": "camera_motion",
            "type": "string",
            "enum": ["static", "handheld", "push_in", "pull_out", "pan", "tilt", "tracking", "orbit", "unknown"],
            "description": "The dominant camera motion.",
        },
        {
            "name": "actions",
            "type": "array",
            "items": {"type": "string"},
            "description": "Short Chinese action/pose tags, such as 向镜头走来, 回头, 直视镜头, 衣料细节, 停步摆姿势.",
        },
        {
            "name": "moods",
            "type": "array",
            "items": {"type": "string"},
            "description": "Short Chinese visual-emotion tags, such as 冷感, 自信, 松弛, 张力, 神秘, 活力, 高级感.",
        },
        {
            "name": "visual_roles",
            "type": "array",
            "items": {"type": "string"},
            "description": "Potential editorial uses, such as 开场建立, 人物登场, 氛围过渡, 产品细节, 情绪高潮, 收尾定格.",
        },
        {
            "name": "technical_quality_score",
            "type": "number",
            "description": "0-100. Score focus, exposure, framing, camera stability, and freedom from obvious mistakes.",
        },
        {
            "name": "visual_strength_score",
            "type": "number",
            "description": "0-100. Score clarity of action, facial expression, styling/product visibility, composition, and commercial/editorial impact.",
        },
        {
            "name": "continuity_notes",
            "type": "string",
            "description": "Chinese note about how to enter/exit this shot, e.g. 动作刚开始, 可接回头特写, 适合 2-4 秒使用.",
        },
    ],
}


@dataclass(frozen=True)
class Source:
    source_id: str
    label: str
    locator: str
    local_path: Path | None
    video_context: Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use Pegasus + Gemini to select model footage from a written visual script."
    )
    parser.add_argument(
        "--script",
        type=Path,
        required=True,
        help="UTF-8 text file. One visual beat / sentence per non-empty line.",
    )
    parser.add_argument(
        "--style",
        required=True,
        help="Overall visual direction, for example: 高级时尚广告；冷感、克制、留白；竖屏 9:16.",
    )
    parser.add_argument(
        "--files",
        type=Path,
        nargs="*",
        default=[],
        help="Local source videos. Required for --render. Direct upload demo limit is 200 MB per file.",
    )
    parser.add_argument(
        "--urls",
        nargs="*",
        default=[],
        help="Public DIRECT raw media URLs. Page links from video platforms are not supported.",
    )
    parser.add_argument("--out", type=Path, default=Path("visual_edit_output"), help="Output directory.")
    parser.add_argument(
        "--catalog",
        type=Path,
        help="Reuse an existing shot_catalog.json and skip TwelveLabs upload/analysis. Ideal after a Gemini retry or script rewrite.",
    )
    parser.add_argument(
        "--gemini-model",
        default="gemini-3-flash-preview",
        help="Gemini director model. Default is Gemini 3 Flash Preview, which currently has a Gemini API free tier.",
    )
    parser.add_argument(
        "--thinking-level",
        choices=["minimal", "low", "medium", "high"],
        default="low",
        help="Gemini thinking level. low keeps the director pass fast and inexpensive; use medium/high only when needed.",
    )
    parser.add_argument(
        "--skip-gemini",
        action="store_true",
        help="Skip Gemini director step. Only run Pegasus to build shot catalog.",
    )
    parser.add_argument(
        "--max-candidates-per-video",
        type=int,
        default=30,
        help="Maximum catalog entries sent from each source to Gemini.",
    )
    parser.add_argument(
        "--target-seconds",
        type=float,
        default=45.0,
        help="Approximate final duration used by the director when planning.",
    )
    parser.add_argument(
        "--min-shot-seconds",
        type=float,
        default=2.0,
        help="Minimum Pegasus candidate-shot duration. Pegasus requires at least 2 seconds.",
    )
    parser.add_argument(
        "--max-shot-seconds",
        type=float,
        default=10.0,
        help="Maximum Pegasus candidate-shot duration.",
    )
    parser.add_argument(
        "--render",
        action="store_true",
        help="Render a silent rough-cut MP4 with FFmpeg. Requires all selected footage to be local files.",
    )
    parser.add_argument(
        "--canvas",
        choices=["9:16", "16:9", "1:1"],
        default="9:16",
        help="Canvas used only by --render.",
    )
    parser.add_argument(
        "--fit",
        choices=["contain", "cover"],
        default="contain",
        help="How original footage fills the render canvas. contain preserves all pixels; cover crops edges.",
    )
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=5.0,
        help="Async TwelveLabs polling interval.",
    )
    parser.add_argument(
        "--keep-assets",
        action="store_true",
        help="Reserved for later cleanup workflows; assets are not deleted automatically in this demo.",
    )
    return parser.parse_args()


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(
            f"{name} is not set.\n\n"
            "PowerShell example:\n"
            f'  $env:{name} = "your_key_here"\n'
        )
    return value


def read_visual_script(path: Path) -> list[str]:
    if not path.is_file():
        raise FileNotFoundError(f"Script file not found: {path}")
    lines: list[str] = []
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        clean = raw.strip()
        if not clean or clean.startswith("#"):
            continue
        clean = re.sub(r"^\s*(?:\d+[.)、]|[-*•])\s*", "", clean)
        if clean:
            lines.append(clean)
    if not lines:
        raise ValueError("The script has no non-empty visual beats. Put one visual beat per line.")
    return lines


def checked_local_file(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Video file not found: {resolved}")
    size_mb = resolved.stat().st_size / 1024 / 1024
    if size_mb > 200:
        raise ValueError(
            f"{resolved.name} is {size_mb:.1f} MB. This quick demo uses TwelveLabs direct local upload, "
            "which supports local video/audio files up to 200 MB. Create a short proxy first, for example:\n"
            f'  ffmpeg -i "{resolved}" -vf scale=720:-2 -c:v libx264 -crf 23 -c:a aac "{resolved.stem}_proxy.mp4"'
        )
    return resolved


def wait_for_asset(client: TwelveLabs, asset_id: str, poll_seconds: float) -> None:
    while True:
        asset = client.assets.retrieve(asset_id)
        print(f"[asset] {asset_id} status={asset.status}")
        if asset.status == "ready":
            return
        if asset.status == "failed":
            raise RuntimeError(f"Asset processing failed: {asset_id}")
        time.sleep(poll_seconds)


def build_sources(client: TwelveLabs, args: argparse.Namespace) -> list[Source]:
    sources: list[Source] = []
    counter = 1

    for candidate in args.files:
        path = checked_local_file(candidate)
        size_mb = path.stat().st_size / 1024 / 1024
        print(f"[upload] {path.name} ({size_mb:.1f} MB)")
        with path.open("rb") as file_handle:
            asset = client.assets.create(method="direct", file=file_handle, filename=path.name)
        if not asset.id:
            raise RuntimeError(f"TwelveLabs did not return an asset id for {path.name}.")
        wait_for_asset(client, asset.id, args.poll_seconds)
        sources.append(
            Source(
                source_id=f"src_{counter:02d}",
                label=path.name,
                locator=str(path),
                local_path=path,
                video_context=VideoContext_AssetId(asset_id=asset.id),
            )
        )
        counter += 1

    for url in args.urls:
        label = url.rsplit("/", 1)[-1].split("?", 1)[0] or f"remote_{counter:02d}"
        sources.append(
            Source(
                source_id=f"src_{counter:02d}",
                label=label,
                locator=url,
                local_path=None,
                video_context=VideoContext_Url(url=url),
            )
        )
        counter += 1

    if not sources:
        raise ValueError("Pass at least one local source with --files or one direct media URL with --urls.")
    return sources


def wait_for_analysis(client: TwelveLabs, task_id: str, poll_seconds: float):
    while True:
        task = client.analyze_async.tasks.retrieve(task_id)
        print(f"[pegasus] task={task_id} status={task.status}")
        if task.status == "ready":
            return task
        if task.status == "failed":
            message = getattr(getattr(task, "error", None), "message", "Unknown error")
            raise RuntimeError(f"Pegasus analysis failed: {message}")
        time.sleep(poll_seconds)


def to_number(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def candidate_score(candidate: dict[str, Any]) -> float:
    metadata = candidate.get("metadata", {})
    technical = to_number(metadata.get("technical_quality_score"), 0.0)
    visual = to_number(metadata.get("visual_strength_score"), 0.0)
    return round(technical * 0.45 + visual * 0.55, 2)


def overlap_ratio(a: dict[str, Any], b: dict[str, Any]) -> float:
    start = max(to_number(a.get("start_time")), to_number(b.get("start_time")))
    end = min(to_number(a.get("end_time")), to_number(b.get("end_time")))
    intersection = max(0.0, end - start)
    shortest = min(
        max(0.001, to_number(a.get("end_time")) - to_number(a.get("start_time"))),
        max(0.001, to_number(b.get("end_time")) - to_number(b.get("start_time"))),
    )
    return intersection / shortest


def normalize_catalog(
    source: Source,
    raw_response: dict[str, Any],
    max_candidates: int,
) -> list[dict[str, Any]]:
    items = raw_response.get("usable_editorial_shots", [])
    if not isinstance(items, list):
        raise ValueError(f"Unexpected Pegasus result for {source.label}: usable_editorial_shots is not a list.")

    normalized: list[dict[str, Any]] = []
    for idx, item in enumerate(items, start=1):
        start = to_number(item.get("start_time"), -1)
        end = to_number(item.get("end_time"), -1)
        if start < 0 or end <= start:
            continue
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        normalized.append(
            {
                "candidate_id": f"{source.source_id}_shot_{idx:03d}",
                "source_id": source.source_id,
                "source_label": source.label,
                "source_locator": source.locator,
                "local_source": str(source.local_path) if source.local_path else None,
                "start_time": round(start, 3),
                "end_time": round(end, 3),
                "duration": round(end - start, 3),
                "selection_score": candidate_score(item),
                "metadata": metadata,
            }
        )

    # Prefer strong shots but remove near-duplicate overlapping alternatives.
    chosen: list[dict[str, Any]] = []
    for candidate in sorted(normalized, key=candidate_score, reverse=True):
        if any(overlap_ratio(candidate, existing) >= 0.80 for existing in chosen):
            continue
        chosen.append(candidate)
        if len(chosen) >= max_candidates:
            break
    chosen.sort(key=lambda row: row["start_time"])
    return chosen


def load_existing_catalog(path: Path) -> tuple[list[dict[str, Any]], list[Source], dict[str, Any], dict[str, str]]:
    """Load a prior Pegasus catalog so Gemini can be retried without reprocessing video."""
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Catalog file not found: {resolved}")
    payload = json.loads(resolved.read_text(encoding="utf-8-sig"))
    catalog = payload.get("candidate_shots", [])
    if not isinstance(catalog, list) or not catalog:
        raise ValueError(f"Catalog has no candidate_shots: {resolved}")
    valid_catalog = [row for row in catalog if isinstance(row, dict) and row.get("candidate_id")]
    if not valid_catalog:
        raise ValueError(f"Catalog has no valid candidate records: {resolved}")

    task_ids: dict[str, str] = {}
    sources: list[Source] = []
    for source_data in payload.get("sources", []):
        if not isinstance(source_data, dict):
            continue
        source_id = str(source_data.get("source_id", ""))
        if not source_id:
            continue
        local_path_raw = source_data.get("local_path")
        local_path = Path(local_path_raw) if local_path_raw else None
        # video_context is intentionally None: a reused catalog never calls TwelveLabs.
        sources.append(
            Source(
                source_id=source_id,
                label=str(source_data.get("label", source_id)),
                locator=str(source_data.get("locator", "")),
                local_path=local_path,
                video_context=None,
            )
        )
        if source_data.get("pegasus_task_id"):
            task_ids[source_id] = str(source_data["pegasus_task_id"])

    # Preserve raw payload when available, but do not require it.
    raw = payload.get("raw_pegasus_responses", {})
    if not isinstance(raw, dict):
        raw = {}
    return valid_catalog, sources, raw, task_ids


def analyze_source(
    client: TwelveLabs,
    source: Source,
    args: argparse.Namespace,
) -> tuple[list[dict[str, Any]], dict[str, Any], str]:
    print(f"\n=== Pegasus catalog: {source.source_id} / {source.label} ===")
    task = client.analyze_async.tasks.create(
        video=source.video_context,
        model_name="pegasus1.5",
        analysis_mode="time_based_metadata",
        temperature=0.1,
        max_tokens=16384,
        min_segment_duration=args.min_shot_seconds,
        max_segment_duration=args.max_shot_seconds,
        response_format=AsyncResponseFormat(
            type="segment_definitions",
            segment_definitions=[CANDIDATE_SHOT_DEFINITION],
            segment_time_format="seconds",
        ),
    )
    completed = wait_for_analysis(client, task.task_id, args.poll_seconds)
    if not completed.result or not completed.result.data:
        raise RuntimeError(f"Pegasus returned no analysis data for {source.label}.")
    raw = json.loads(completed.result.data)
    catalog = normalize_catalog(source, raw, args.max_candidates_per_video)
    return catalog, raw, completed.task_id


def compact_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    metadata = candidate.get("metadata", {})
    return {
        "candidate_id": candidate["candidate_id"],
        "source_id": candidate["source_id"],
        "source_label": candidate["source_label"],
        "start_time": candidate["start_time"],
        "end_time": candidate["end_time"],
        "duration": candidate["duration"],
        "selection_score": candidate["selection_score"],
        "shot_description": str(metadata.get("shot_description", ""))[:260],
        "shot_size": metadata.get("shot_size", "unknown"),
        "camera_motion": metadata.get("camera_motion", "unknown"),
        "actions": metadata.get("actions", []),
        "moods": metadata.get("moods", []),
        "visual_roles": metadata.get("visual_roles", []),
        "continuity_notes": str(metadata.get("continuity_notes", ""))[:180],
    }


def director_schema(candidate_ids: list[str]) -> dict[str, Any]:
    shot_choice = {
        "type": "object",
        "properties": {
            "candidate_id": {"type": "string", "enum": candidate_ids},
            "trim_start_offset_sec": {"type": "number"},
            "trim_end_offset_sec": {"type": "number"},
            "why_this_shot": {"type": "string"},
        },
        "required": ["candidate_id", "trim_start_offset_sec", "trim_end_offset_sec", "why_this_shot"],
    }
    return {
        "type": "object",
        "properties": {
            "project_title": {"type": "string"},
            "creative_rationale": {"type": "string"},
            "timeline": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "script_index": {"type": "integer"},
                        "script_line": {"type": "string"},
                        "shots": {"type": "array", "items": shot_choice},
                        "on_screen_text": {"type": "string"},
                        "transition": {"type": "string", "enum": ["cut", "fade"]},
                        "edit_intent": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required": [
                        "script_index",
                        "script_line",
                        "shots",
                        "on_screen_text",
                        "transition",
                        "edit_intent",
                        "confidence",
                    ],
                },
            },
            "uncovered_script_lines": {"type": "array", "items": {"type": "string"}},
            "review_flags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["project_title", "creative_rationale", "timeline", "uncovered_script_lines", "review_flags"],
    }


def make_director_prompt(
    script_lines: list[str],
    style: str,
    candidates: list[dict[str, Any]],
    target_seconds: float,
) -> str:
    beats = "\n".join(f"{idx}. {line}" for idx, line in enumerate(script_lines, start=1))
    compact = [compact_candidate(item) for item in candidates]
    catalog_json = json.dumps(compact, ensure_ascii=False, indent=2)
    return f"""
You are an expert fashion-film and commercial editor. Build a conservative, footage-grounded rough-cut plan.

PROJECT STYLE:
{style}

TARGET DURATION:
About {target_seconds:.0f} seconds total. Favor 2-6 second shots unless a shot clearly needs longer.

WRITTEN VISUAL SCRIPT (one beat per line):
{beats}

AVAILABLE FOOTAGE CATALOG:
{catalog_json}

RULES:
1. Use only candidate_id values from the catalog. Do not invent footage, people, props, camera angles, or timestamps.
2. Match each script beat by its visual meaning, emotional rhythm, composition, action, and commercial purpose—not by literal word overlap only.
3. Keep the sequence coherent: establish -> reveal/personality -> escalation/detail -> payoff/closing when the script supports it.
4. Avoid near-duplicate shots, repeated poses, accidental jump cuts, and reuse of a candidate unless it is genuinely essential.
5. For every selected shot, give offsets relative to the candidate boundaries. Use 0 <= trim_start_offset_sec < trim_end_offset_sec <= candidate duration. Prefer the strongest continuous moment.
6. If no footage honestly matches a script line, leave shots empty and list that exact line in uncovered_script_lines. Do not hallucinate a match.
7. on_screen_text should normally repeat or slightly condense that script line for later title/subtitle work. It is NOT burned into the demo MP4 automatically.
8. Return the full plan in Chinese. Use cut by default; use fade only where it helps the mood.
""".strip()


def run_gemini_director(
    api_key: str,
    model: str,
    script_lines: list[str],
    style: str,
    catalog: list[dict[str, Any]],
    target_seconds: float,
    thinking_level: str,
) -> dict[str, Any]:
    if not catalog:
        raise ValueError("No usable candidate shots were found, so Gemini cannot build a plan.")
    client = genai.Client(api_key=api_key)
    prompt = make_director_prompt(script_lines, style, catalog, target_seconds)
    last_error: Exception | None = None
    # A retry helps transient free-tier RPM/TPM bursts, but it cannot create quota
    # for a paid-only model. We state that distinction explicitly after retrying.
    for attempt in range(1, 4):
        try:
            response = client.interactions.create(
                model=model,
                input=prompt,
                generation_config={"thinking_level": thinking_level},
                response_format={
                    "type": "text",
                    "mime_type": "application/json",
                    "schema": director_schema([row["candidate_id"] for row in catalog]),
                },
            )
            if not response.output_text:
                raise RuntimeError("Gemini returned an empty director response.")
            try:
                return json.loads(response.output_text)
            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"Gemini returned invalid JSON despite structured output: {exc}\n{response.output_text}"
                ) from exc
        except Exception as exc:
            last_error = exc
            message = str(exc).lower()
            is_quota = "429" in message or "quota" in message or "too_many_requests" in message
            if not is_quota or attempt == 3:
                break
            delay = 4 * (2 ** (attempt - 1))
            print(f"[gemini] quota/rate-limit on attempt {attempt}/3; retrying in {delay}s ...")
            time.sleep(delay)

    assert last_error is not None
    message = str(last_error)
    if "gemini-3.1-pro-preview" in model:
        raise RuntimeError(
            "Gemini 3.1 Pro Preview has no Gemini API free tier. "
            "Use --gemini-model gemini-3-flash-preview for the free test path, "
            "or enable paid billing for Pro. Original error: " + message
        ) from last_error
    raise RuntimeError(
        "Gemini director request failed. The Pegasus catalog was saved, so do NOT rerun TwelveLabs. "
        "Retry with --catalog <your shot_catalog.json>. Original error: " + message
    ) from last_error


def clamp(value: Any, low: float, high: float, fallback: float) -> float:
    number = to_number(value, fallback)
    return max(low, min(high, number))


def validate_plan(
    plan: dict[str, Any],
    script_lines: list[str],
    catalog: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    catalog_by_id = {row["candidate_id"]: row for row in catalog}
    seen_script_indices: set[int] = set()
    edl: list[dict[str, Any]] = []
    normalized_timeline: list[dict[str, Any]] = []
    review_flags: list[str] = list(plan.get("review_flags", [])) if isinstance(plan.get("review_flags"), list) else []

    raw_timeline = plan.get("timeline", [])
    if not isinstance(raw_timeline, list):
        raw_timeline = []

    for entry in raw_timeline:
        if not isinstance(entry, dict):
            continue
        script_index = int(to_number(entry.get("script_index"), 0))
        if not 1 <= script_index <= len(script_lines):
            review_flags.append(f"忽略了无效 script_index: {entry.get('script_index')}")
            continue
        if script_index in seen_script_indices:
            review_flags.append(f"文案第 {script_index} 句出现重复计划，保留第一次。")
            continue
        seen_script_indices.add(script_index)

        shots = entry.get("shots", [])
        if not isinstance(shots, list):
            shots = []
        accepted_shots: list[dict[str, Any]] = []
        for shot in shots:
            if not isinstance(shot, dict):
                continue
            candidate_id = shot.get("candidate_id")
            candidate = catalog_by_id.get(candidate_id)
            if not candidate:
                review_flags.append(f"Gemini 选择了不存在的候选镜头 {candidate_id}，已忽略。")
                continue
            duration = candidate["duration"]
            start_offset = clamp(shot.get("trim_start_offset_sec"), 0.0, max(0.01, duration - 0.05), 0.0)
            end_offset = clamp(shot.get("trim_end_offset_sec"), start_offset + 0.05, duration, duration)
            if end_offset <= start_offset + 0.05:
                start_offset, end_offset = 0.0, duration
            clip = {
                "candidate_id": candidate_id,
                "source_id": candidate["source_id"],
                "source_label": candidate["source_label"],
                "source_locator": candidate["source_locator"],
                "local_source": candidate["local_source"],
                "start_time": round(candidate["start_time"] + start_offset, 3),
                "end_time": round(candidate["start_time"] + end_offset, 3),
                "duration": round(end_offset - start_offset, 3),
                "script_index": script_index,
                "script_line": script_lines[script_index - 1],
                "why_this_shot": str(shot.get("why_this_shot", "")),
                "transition": entry.get("transition", "cut"),
                "on_screen_text": str(entry.get("on_screen_text", script_lines[script_index - 1])),
                "edit_intent": str(entry.get("edit_intent", "")),
                "confidence": to_number(entry.get("confidence"), 0.0),
            }
            accepted_shots.append(clip)
            edl.append(clip)

        normalized_timeline.append(
            {
                "script_index": script_index,
                "script_line": script_lines[script_index - 1],
                "shots": accepted_shots,
                "on_screen_text": str(entry.get("on_screen_text", script_lines[script_index - 1])),
                "transition": entry.get("transition", "cut"),
                "edit_intent": str(entry.get("edit_intent", "")),
                "confidence": to_number(entry.get("confidence"), 0.0),
            }
        )

    missing = [f"{idx}. {line}" for idx, line in enumerate(script_lines, start=1) if idx not in seen_script_indices]
    uncovered = plan.get("uncovered_script_lines", [])
    if not isinstance(uncovered, list):
        uncovered = []
    all_uncovered = list(dict.fromkeys([*uncovered, *missing]))
    normalized_plan = {
        "project_title": str(plan.get("project_title", "visual_rough_cut")),
        "creative_rationale": str(plan.get("creative_rationale", "")),
        "timeline": normalized_timeline,
        "uncovered_script_lines": all_uncovered,
        "review_flags": review_flags,
    }
    return normalized_plan, edl


def timecode(seconds: float) -> str:
    milliseconds = max(0, int(round(seconds * 1000)))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def write_srt(edl: Iterable[dict[str, Any]], path: Path) -> None:
    blocks: list[str] = []
    cursor = 0.0
    for index, clip in enumerate(edl, start=1):
        end = cursor + float(clip["duration"])
        text = str(clip.get("on_screen_text") or clip.get("script_line") or "")
        blocks.extend([str(index), f"{timecode(cursor)} --> {timecode(end)}", text, ""])
        cursor = end
    path.write_text("\n".join(blocks), encoding="utf-8")


def canvas_dimensions(canvas: str) -> tuple[int, int]:
    return {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}[canvas]


def ffmpeg_filter(width: int, height: int, fit: str) -> str:
    if fit == "cover":
        return (
            f"scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},setsar=1,fps=30,format=yuv420p"
        )
    return (
        f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p"
    )


def quote_for_command(value: str) -> str:
    return '"' + value.replace('"', '\\"') + '"'


def write_ffmpeg_commands(edl: list[dict[str, Any]], out_dir: Path, canvas: str, fit: str) -> Path:
    width, height = canvas_dimensions(canvas)
    vf = ffmpeg_filter(width, height, fit)
    clips_dir = out_dir / "clips"
    lines = [
        "# Generated by visual_script_editor_demo.py",
        "# All clips are normalized to the same silent canvas before concatenation.",
        "",
    ]
    for index, clip in enumerate(edl, start=1):
        source = str(clip["source_locator"])
        target = clips_dir / f"{index:03d}_{clip['candidate_id']}.mp4"
        lines.append(f"# {index:03d} | script {clip['script_index']} | {clip['script_line']}")
        lines.append(
            "ffmpeg -y -i {source} -ss {start:.3f} -t {duration:.3f} "
            "-filter_complex \"[0:v]{vf}[v];anullsrc=channel_layout=stereo:sample_rate=48000[a]\" "
            "-map \"[v]\" -map \"[a]\" -shortest -c:v libx264 -crf 18 -preset medium "
            "-pix_fmt yuv420p -c:a aac -b:a 192k {target}".format(
                start=float(clip["start_time"]),
                source=quote_for_command(source),
                duration=float(clip["duration"]),
                vf=vf,
                target=quote_for_command(str(target)),
            )
        )
        lines.append("")
    lines.extend(
        [
            "# concat.txt is generated automatically by --render.",
            f"ffmpeg -y -f concat -safe 0 -i {quote_for_command(str(out_dir / 'concat.txt'))} -c copy {quote_for_command(str(out_dir / 'rough_cut.mp4'))}",
        ]
    )
    command_path = out_dir / "ffmpeg_render_commands.txt"
    command_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return command_path


def render_rough_cut(edl: list[dict[str, Any]], out_dir: Path, canvas: str, fit: str) -> Path:
    if not edl:
        raise ValueError("No EDL clips to render.")
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("FFmpeg was not found in PATH. Install FFmpeg or run without --render.")
    remote = [clip for clip in edl if not clip.get("local_source")]
    if remote:
        ids = ", ".join(clip["candidate_id"] for clip in remote)
        raise RuntimeError(f"--render requires local source videos. Remote candidates selected: {ids}")

    width, height = canvas_dimensions(canvas)
    vf = ffmpeg_filter(width, height, fit)
    clips_dir = out_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    rendered: list[Path] = []
    for index, clip in enumerate(edl, start=1):
        source = str(clip["local_source"])
        target = clips_dir / f"{index:03d}_{clip['candidate_id']}.mp4"
        print(f"[render] {index:03d}: {clip['source_label']} {clip['start_time']:.2f}s–{clip['end_time']:.2f}s")
        command = [
            "ffmpeg", "-y", "-i", source, "-ss", f"{float(clip['start_time']):.3f}",
            "-t", f"{float(clip['duration']):.3f}",
            "-filter_complex", f"[0:v]{vf}[v];anullsrc=channel_layout=stereo:sample_rate=48000[a]",
            "-map", "[v]", "-map", "[a]", "-shortest",
            "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", str(target),
        ]
        subprocess.run(command, check=True)
        rendered.append(target)

    concat = out_dir / "concat.txt"
    concat_lines = [f"file '{path.resolve().as_posix().replace(chr(39), chr(39) + chr(92) + chr(39) + chr(39))}'" for path in rendered]
    concat.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")
    final_path = out_dir / "rough_cut.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(concat), "-c", "copy", str(final_path)],
        check=True,
    )
    return final_path


def main() -> int:
    args = parse_args()
    if args.min_shot_seconds < 2:
        raise SystemExit("--min-shot-seconds must be at least 2 seconds (Pegasus requirement).")
    if args.max_shot_seconds < args.min_shot_seconds:
        raise SystemExit("--max-shot-seconds must be >= --min-shot-seconds.")
    if args.max_candidates_per_video < 1:
        raise SystemExit("--max-candidates-per-video must be at least 1.")
    if args.target_seconds <= 0:
        raise SystemExit("--target-seconds must be positive.")
    if args.render and not args.files and not args.catalog:
        raise SystemExit("--render needs local --files on a first run, or --catalog from a prior local-file run.")
    if args.catalog and (args.files or args.urls):
        raise SystemExit("Use either --catalog to resume, or --files/--urls to build a new catalog; do not combine them.")

    args.out.mkdir(parents=True, exist_ok=True)
    visual_script = read_visual_script(args.script)
    gemini_key = os.getenv("GEMINI_API_KEY")  # Optional when --skip-gemini

    if args.catalog:
        all_catalog, sources, raw_by_source, task_ids = load_existing_catalog(args.catalog)
        catalog_path = args.catalog.expanduser().resolve()
        print(f"[resume] loaded {len(all_catalog)} candidate shots from {catalog_path}")
        print("[resume] TwelveLabs is skipped; no video is re-uploaded or re-analyzed.")
    else:
        twelvelabs_key = require_env("TWELVELABS_API_KEY")
        twelve_client = TwelveLabs(api_key=twelvelabs_key)
        sources = build_sources(twelve_client, args)
        all_catalog = []
        raw_by_source = {}
        task_ids = {}
        for source in sources:
            catalog, raw, task_id = analyze_source(twelve_client, source, args)
            print(f"[pegasus] retained {len(catalog)} candidate shots for {source.label}")
            all_catalog.extend(catalog)
            raw_by_source[source.source_id] = raw
            task_ids[source.source_id] = task_id

        catalog_payload = {
            "style": args.style,
            "script": visual_script,
            "sources": [
                {
                    "source_id": item.source_id,
                    "label": item.label,
                    "locator": item.locator,
                    "local_path": str(item.local_path) if item.local_path else None,
                    "pegasus_task_id": task_ids.get(item.source_id),
                }
                for item in sources
            ],
            "candidate_shots": all_catalog,
            "raw_pegasus_responses": raw_by_source,
        }
        catalog_path = args.out / "shot_catalog.json"
        catalog_path.write_text(json.dumps(catalog_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.skip_gemini:
        print("\n=== Pegasus-only mode ===")
        print(f"Candidate catalog: {catalog_path}")
        print(f"Total candidate shots: {len(all_catalog)}")
        print("Gemini step skipped. No EDL or render generated.")
        return 0

    if not gemini_key:
        raise SystemExit(
            "GEMINI_API_KEY is not set. Either set it or use --skip-gemini to only run Pegasus."
        )
    if not _genai_available:
        raise SystemExit(
            "Google GenAI SDK is not installed. Install it with:\n"
            "  pip install -r requirements_visual_script_editor.txt\n"
            "Or use --skip-gemini to only run Pegasus."
        )

    print(f"\n=== Gemini director: {args.gemini_model} ===")
    raw_plan = run_gemini_director(
        api_key=gemini_key,
        model=args.gemini_model,
        script_lines=visual_script,
        style=args.style,
        catalog=all_catalog,
        target_seconds=args.target_seconds,
        thinking_level=args.thinking_level,
    )
    plan, edl = validate_plan(raw_plan, visual_script, all_catalog)

    plan_path = args.out / "edit_plan.json"
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    edl_path = args.out / "edit_decision_list.json"
    edl_path.write_text(json.dumps(edl, ensure_ascii=False, indent=2), encoding="utf-8")
    srt_path = args.out / "script_overlay.srt"
    write_srt(edl, srt_path)
    commands_path = write_ffmpeg_commands(edl, args.out, args.canvas, args.fit)

    print("\n=== Result ===")
    print(f"Candidate catalog: {catalog_path}")
    print(f"Gemini edit plan:  {plan_path}")
    print(f"EDL:              {edl_path}")
    print(f"Script SRT:       {srt_path}")
    print(f"FFmpeg commands:  {commands_path}")
    print(f"Selected clips:   {len(edl)}")
    if plan["uncovered_script_lines"]:
        print("Uncovered script beats (needs pickup/B-roll/title card):")
        for line in plan["uncovered_script_lines"]:
            print(f"  - {line}")
    if plan["review_flags"]:
        print("Review flags:")
        for flag in plan["review_flags"]:
            print(f"  - {flag}")

    if args.render:
        final_path = render_rough_cut(edl, args.out, args.canvas, args.fit)
        print(f"Rough cut:        {final_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit("\nCancelled.")
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
