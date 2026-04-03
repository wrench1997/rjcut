from typing import Dict, List, Any


def build_editable_script_from_result(result: dict):
    timeline = (result or {}).get("draft", {}).get("timeline") or {}
    transcription = (result or {}).get("draft", {}).get("transcription") or {}
    timeline_segments = timeline.get("segments") or []
    transcription_segments = transcription.get("segments") or []

    editable_segments = []

    for i, seg in enumerate(timeline_segments, 1):
        text = ""
        if i - 1 < len(transcription_segments):
            text = transcription_segments[i - 1].get("text", "").strip()

        editable_segments.append({
            "id": seg.get("id", i),
            "text": text,
            "type": seg.get("type", "human"),
            "scene_file": seg.get("scene_file"),
            "start": seg.get("start"),
            "end": seg.get("end"),
            "duration": seg.get("duration"),
        })

    return {"segments": editable_segments}


def apply_corrections_to_editable_script(editable_script: dict, corrections: list):
    if not editable_script or not corrections:
        return editable_script

    corr_pairs = []
    for item in corrections:
        if isinstance(item, dict):
            src = item.get("src")
            dst = item.get("dst")
        else:
            src = getattr(item, "src", None)
            dst = getattr(item, "dst", None)
        if src and dst:
            corr_pairs.append((src, dst))

    for seg in editable_script.get("segments", []):
        text = seg.get("text", "") or ""
        for src, dst in corr_pairs:
            text = text.replace(src, dst)
        seg["text"] = text

    return editable_script


def editable_script_to_script_json(editable_script: dict):
    return {
        "segments": [
            {
                "flag": seg.get("type", "human"),
                "text": seg.get("text", ""),
                "scene_file": seg.get("scene_file"),
            }
            for seg in (editable_script or {}).get("segments", [])
        ]
    }


def simple_ai_correct_text(text: str, mode: str = "rewrite", prompt: str = None):
    replacements = {
        "蓝牙耳际": "蓝牙耳机",
        "冲电": "充电",
        "兰牙": "蓝牙",
        "帯货": "带货",
    }

    corrected = text
    changes = []
    for src, dst in replacements.items():
        if src in corrected:
            corrected = corrected.replace(src, dst)
            changes.append({
                "src": src,
                "dst": dst,
                "reason": "rule_based_ai_correction"
            })

    return corrected, changes