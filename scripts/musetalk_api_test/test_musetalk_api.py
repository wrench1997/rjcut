#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""MuseTalk v6.0 字级时间轴 API 端到端测试器（仅标准库）。"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_TEXT = (
    "你好，欢迎使用数字人服务。"
    "这是一段字级时间轴接口测试文案，用于检查每个字符的开始时间和结束时间。"
)


class ApiTestError(RuntimeError):
    pass


@dataclass
class Check:
    name: str
    passed: bool
    message: str
    detail: Any = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "passed": self.passed,
            "message": self.message,
            "detail": self.detail,
        }


@dataclass
class Report:
    base_url: str
    text: str
    person_id: str
    audio_man_id: Optional[str]
    started_at: str = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc).isoformat())
    task_id: Optional[str] = None
    final_status: Optional[str] = None
    elapsed_seconds: float = 0.0
    checks: List[Check] = field(default_factory=list)
    responses: Dict[str, Any] = field(default_factory=dict)

    def add(self, name: str, passed: bool, message: str, detail: Any = None) -> None:
        self.checks.append(Check(name, passed, message, detail))
        print(f"[{'PASS' if passed else 'FAIL'}] {name}: {message}")

    @property
    def passed(self) -> bool:
        return bool(self.checks) and all(c.passed for c in self.checks)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema": "musetalk-api-test-report/v0.1",
            "base_url": self.base_url,
            "started_at": self.started_at,
            "request": {
                "text": self.text,
                "person_id": self.person_id,
                "audio_man_id": self.audio_man_id,
            },
            "task_id": self.task_id,
            "final_status": self.final_status,
            "passed": self.passed,
            "summary": {
                "total": len(self.checks),
                "passed": sum(1 for c in self.checks if c.passed),
                "failed": sum(1 for c in self.checks if not c.passed),
            },
            "elapsed_seconds": round(self.elapsed_seconds, 3),
            "checks": [c.to_dict() for c in self.checks],
            "responses": self.responses,
        }


class Client:
    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def url(self, path_or_url: str) -> str:
        value = str(path_or_url or "").strip()
        if value.startswith(("http://", "https://")):
            return value
        return self.base_url + (value if value.startswith("/") else "/" + value)

    def json(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Tuple[int, Any]:
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        req = urllib.request.Request(self.url(path), data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            raise ApiTestError(f"{method} {req.full_url} HTTP {exc.code}: {raw}") from exc
        except urllib.error.URLError as exc:
            raise ApiTestError(f"{method} {req.full_url} 连接失败: {exc}") from exc
        except json.JSONDecodeError as exc:
            raise ApiTestError(f"{method} {req.full_url} 返回的不是合法 JSON") from exc

    def media(self, path_or_url: str) -> Tuple[bool, str, Dict[str, Any]]:
        url = self.url(path_or_url)
        req = urllib.request.Request(url, headers={"Range": "bytes=0-0"}, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                resp.read(1)
                detail = {
                    "url": url,
                    "status": resp.status,
                    "content_type": resp.headers.get("Content-Type", ""),
                    "content_length": resp.headers.get("Content-Length", ""),
                }
                return 200 <= resp.status < 400, f"HTTP {resp.status}", detail
        except Exception as exc:  # noqa: BLE001
            return False, str(exc), {"url": url}


def is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_timings(text: str, timings: Any, duration_ms: Optional[int], allow_missing_punctuation: bool) -> List[Check]:
    if not isinstance(timings, list):
        return [Check("char_timings.type", False, "char_timings 必须是数组", type(timings).__name__)]
    checks = [Check("char_timings.non_empty", len(timings) > 0, f"返回 {len(timings)} 项")]
    if not timings:
        return checks

    malformed: List[Any] = []
    index_errors: List[Any] = []
    char_errors: List[Any] = []
    time_errors: List[Any] = []
    monotonic_errors: List[Any] = []
    overflow: List[Any] = []
    last_index = -1
    last_start = -1
    last_end = -1

    for pos, item in enumerate(timings):
        if not isinstance(item, dict):
            malformed.append({"position": pos, "value": item})
            continue
        missing = [k for k in ("index", "char", "start_ms", "end_ms") if k not in item]
        if missing:
            malformed.append({"position": pos, "missing": missing, "value": item})
            continue
        idx, ch = item["index"], item["char"]
        start, end = item["start_ms"], item["end_ms"]
        if not is_int(idx) or idx < 0:
            index_errors.append({"position": pos, "index": idx})
            continue
        if idx <= last_index:
            index_errors.append({"position": pos, "index": idx, "previous": last_index})
        if not isinstance(ch, str) or not ch:
            char_errors.append({"position": pos, "index": idx, "char": ch})
        elif idx >= len(text):
            char_errors.append({"position": pos, "index": idx, "reason": "越界"})
        elif text[idx] != ch:
            char_errors.append({"position": pos, "index": idx, "expected": text[idx], "actual": ch})
        if not is_int(start) or not is_int(end) or start < 0 or end < start:
            time_errors.append({"position": pos, "index": idx, "start_ms": start, "end_ms": end})
        else:
            if start < last_start or end < last_end:
                monotonic_errors.append({"position": pos, "index": idx, "start_ms": start, "end_ms": end})
            if duration_ms is not None and end > duration_ms + 1000:
                overflow.append({"position": pos, "index": idx, "end_ms": end, "duration_ms": duration_ms})
            last_start, last_end = start, end
        last_index = idx

    checks.extend([
        Check("char_timings.schema", not malformed, "字段完整" if not malformed else f"{len(malformed)} 项字段不完整", malformed[:20] or None),
        Check("char_timings.index", not index_errors, "index 合法且严格递增" if not index_errors else f"{len(index_errors)} 个索引错误", index_errors[:20] or None),
        Check("char_timings.alignment", not char_errors, "char 与 text[index] 完全对应" if not char_errors else f"{len(char_errors)} 个字符错位", char_errors[:20] or None),
        Check("char_timings.time", not time_errors, "时间为非负整数且 end>=start" if not time_errors else f"{len(time_errors)} 个时间错误", time_errors[:20] or None),
        Check("char_timings.monotonic", not monotonic_errors, "时间轴单调递增" if not monotonic_errors else f"{len(monotonic_errors)} 个时间倒退", monotonic_errors[:20] or None),
        Check("char_timings.duration", not overflow, "时间轴未超过总时长" if not overflow else f"{len(overflow)} 项超过 duration_ms", overflow[:20] or None),
    ])

    returned = {i.get("index") for i in timings if isinstance(i, dict) and is_int(i.get("index"))}
    if allow_missing_punctuation:
        required = {i for i, ch in enumerate(text) if ch.isalnum()}
        mode = "允许缺少标点"
    else:
        required = {i for i, ch in enumerate(text) if not ch.isspace()}
        mode = "标点也必须返回"
    missing = sorted(required - returned)
    detail = [{"index": i, "char": text[i]} for i in missing[:50]]
    checks.append(Check("char_timings.coverage", not missing, f"覆盖完整（{mode}）" if not missing else f"缺少 {len(missing)} 个字符（{mode}）", detail or None))
    return checks


def canonical(value: Any) -> List[Tuple[Any, Any, Any, Any]]:
    if not isinstance(value, list):
        return []
    return [(x.get("index"), x.get("char"), x.get("start_ms"), x.get("end_ms")) for x in value if isinstance(x, dict)]


def write_reports(report: Report, report_dir: Path) -> Tuple[Path, Path]:
    report_dir.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = report_dir / f"musetalk_api_test_{stamp}.json"
    html_path = report_dir / f"musetalk_api_test_{stamp}.html"
    json_path.write_text(json.dumps(report.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")
    rows = []
    for c in report.checks:
        state = "PASS" if c.passed else "FAIL"
        detail = "" if c.detail is None else "<pre>" + html.escape(json.dumps(c.detail, ensure_ascii=False, indent=2)) + "</pre>"
        rows.append(f"<tr><td class='{state.lower()}'>{state}</td><td>{html.escape(c.name)}</td><td>{html.escape(c.message)}</td><td>{detail}</td></tr>")
    status = "PASS" if report.passed else "FAIL"
    page = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>MuseTalk API Test</title>
<style>body{{font-family:Arial,"Microsoft YaHei",sans-serif;margin:24px}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ddd;padding:8px;vertical-align:top}}.pass{{color:#087a2f;font-weight:bold}}.fail{{color:#b00020;font-weight:bold}}pre{{white-space:pre-wrap;word-break:break-word}}</style></head>
<body><h1>MuseTalk 字级时间轴 API 测试报告</h1><p>结果：<strong class="{status.lower()}">{status}</strong>　服务：{html.escape(report.base_url)}　任务：{html.escape(report.task_id or '-')}　耗时：{report.elapsed_seconds:.3f}s</p>
<table><thead><tr><th>结果</th><th>检查项</th><th>说明</th><th>详情</th></tr></thead><tbody>{''.join(rows)}</tbody></table></body></html>'''
    html_path.write_text(page, encoding="utf-8")
    return json_path, html_path


def run(args: argparse.Namespace) -> Report:
    begin = time.monotonic()
    report = Report(args.base_url.rstrip("/"), args.text, args.person_id, args.audio_man_id)
    client = Client(report.base_url, args.request_timeout)

    try:
        code, health = client.json("GET", "/health")
        report.responses["health"] = health
        ok = code == 200 and (not isinstance(health, dict) or health.get("code", 0) == 0)
        report.add("health", ok, "健康检查通过" if ok else "健康检查失败", health)
    except Exception as exc:  # noqa: BLE001
        report.add("health", False, str(exc))
        if args.health_only:
            report.elapsed_seconds = time.monotonic() - begin
            return report
    if args.health_only:
        report.elapsed_seconds = time.monotonic() - begin
        return report

    payload: Dict[str, Any] = {
        "text": args.text,
        "person_id": args.person_id,
        "figure_type": args.figure_type,
        "hide_subtitle": args.hide_subtitle,
        "return_char_timing": True,
        "char_timing_level": "char",
        "extra": {"source": "musetalk_api_test_v0_1", "test_run_id": dt.datetime.now().strftime("%Y%m%d_%H%M%S")},
    }
    if args.audio_man_id:
        payload["audio_man_id"] = args.audio_man_id
    if args.callback_url:
        payload["callback_url"] = args.callback_url

    try:
        code, created = client.json("POST", "/v1/digital-human/generate", payload)
        report.responses["create_task"] = created
    except Exception as exc:  # noqa: BLE001
        report.add("create_task", False, str(exc))
        report.elapsed_seconds = time.monotonic() - begin
        return report

    task_id = created.get("task_id") if isinstance(created, dict) else None
    ok = code in (200, 201, 202) and isinstance(created, dict) and created.get("ok") is True and isinstance(task_id, str) and bool(task_id) and created.get("status") in {"queued", "running"}
    report.task_id = task_id
    report.add("create_task", ok, f"任务创建成功: {task_id}" if ok else "创建响应不符合约定", created)
    if not ok:
        report.elapsed_seconds = time.monotonic() - begin
        return report

    deadline = time.monotonic() + args.timeout_seconds
    final: Optional[Dict[str, Any]] = None
    polls = 0
    while time.monotonic() < deadline:
        polls += 1
        try:
            _, data = client.json("GET", f"/v1/digital-human/tasks/{urllib.parse.quote(task_id, safe='')}")
        except Exception as exc:  # noqa: BLE001
            report.add("poll_task", False, str(exc))
            report.elapsed_seconds = time.monotonic() - begin
            return report
        state = data.get("status") if isinstance(data, dict) else None
        print(f"[POLL] #{polls} status={state!r} progress={data.get('progress') if isinstance(data, dict) else None}")
        final = data if isinstance(data, dict) else {}
        if state in {"success", "failed"}:
            break
        if state not in {"queued", "running"}:
            report.add("poll_task.status", False, f"未知状态: {state!r}", data)
            report.elapsed_seconds = time.monotonic() - begin
            return report
        time.sleep(args.poll_interval)

    if not final or final.get("status") not in {"success", "failed"}:
        report.add("poll_task.timeout", False, f"超过 {args.timeout_seconds} 秒仍未完成", final)
        report.elapsed_seconds = time.monotonic() - begin
        return report

    report.responses["final_task"] = final
    report.final_status = final.get("status")
    if final.get("status") == "failed":
        report.add("task_result", False, "任务失败", final.get("error") or final)
        report.elapsed_seconds = time.monotonic() - begin
        return report
    report.add("poll_task", final.get("ok") is True, f"任务成功，共轮询 {polls} 次")

    result = final.get("result")
    report.add("result.object", isinstance(result, dict), "result 为对象" if isinstance(result, dict) else "缺少 result", result)
    if not isinstance(result, dict):
        report.elapsed_seconds = time.monotonic() - begin
        return report

    video_url = result.get("video_url")
    audio_url = result.get("audio_url")
    duration_ms = result.get("duration_ms")
    returned_text = result.get("text")
    normalized_text = result.get("normalized_text")
    task_timings = result.get("char_timings")

    report.add("result.video_url", isinstance(video_url, str) and bool(video_url.strip()), f"video_url={video_url}" if video_url else "缺少 video_url")
    report.add("result.audio_url", isinstance(audio_url, str) and bool(audio_url.strip()), f"audio_url={audio_url}" if audio_url else "缺少 audio_url")
    report.add("result.duration_ms", is_int(duration_ms) and duration_ms > 0, f"duration_ms={duration_ms}" if is_int(duration_ms) and duration_ms > 0 else "duration_ms 必须是正整数")
    report.add("result.text", returned_text == args.text, "返回 text 与请求完全一致" if returned_text == args.text else "返回 text 与请求不一致", {"expected": args.text, "actual": returned_text})
    if normalized_text is not None:
        report.add("result.normalized_text", isinstance(normalized_text, str) and bool(normalized_text), "返回 normalized_text", normalized_text)

    effective_text = normalized_text if isinstance(normalized_text, str) and normalized_text else args.text
    for check in validate_timings(effective_text, task_timings, duration_ms if is_int(duration_ms) else None, args.allow_missing_punctuation):
        report.checks.append(check)
        print(f"[{'PASS' if check.passed else 'FAIL'}] {check.name}: {check.message}")

    try:
        _, timing_resp = client.json("GET", f"/v1/digital-human/tasks/{urllib.parse.quote(task_id, safe='')}/char-timings")
        report.responses["char_timings_endpoint"] = timing_resp
        endpoint_timings = timing_resp.get("char_timings") if isinstance(timing_resp, dict) else None
        endpoint_ok = isinstance(timing_resp, dict) and timing_resp.get("ok") is True and timing_resp.get("task_id") == task_id and isinstance(endpoint_timings, list)
        report.add("char_timings_endpoint", endpoint_ok, "独立时间轴接口正常" if endpoint_ok else "独立时间轴接口不符合约定", timing_resp)
        same = canonical(task_timings) == canonical(endpoint_timings)
        report.add("char_timings.consistency", same, "两处时间轴完全一致" if same else "任务详情与独立接口时间轴不一致", {"task_count": len(task_timings) if isinstance(task_timings, list) else None, "endpoint_count": len(endpoint_timings) if isinstance(endpoint_timings, list) else None})
    except Exception as exc:  # noqa: BLE001
        report.add("char_timings_endpoint", False, str(exc))

    if not args.skip_media_check:
        if isinstance(video_url, str) and video_url:
            ok, msg, detail = client.media(video_url)
            report.add("media.video_access", ok, msg, detail)
        if isinstance(audio_url, str) and audio_url:
            ok, msg, detail = client.media(audio_url)
            report.add("media.audio_access", ok, msg, detail)

    report.elapsed_seconds = time.monotonic() - begin
    return report


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="MuseTalk v6.0 字级时间轴 API 端到端测试")
    p.add_argument("--base-url", default=DEFAULT_BASE_URL)
    p.add_argument("--text", default=DEFAULT_TEXT)
    p.add_argument("--person-id", default="human")
    p.add_argument("--audio-man-id", default="audio_human")
    p.add_argument("--figure-type", choices=("whole_body", "portrait"), default="whole_body")
    p.add_argument("--hide-subtitle", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--callback-url")
    p.add_argument("--poll-interval", type=float, default=3.0)
    p.add_argument("--timeout-seconds", type=float, default=900.0)
    p.add_argument("--request-timeout", type=float, default=30.0)
    p.add_argument("--report-dir", default=str(Path(__file__).resolve().parent / "reports"))
    p.add_argument("--health-only", action="store_true")
    p.add_argument("--skip-media-check", action="store_true")
    p.add_argument("--allow-missing-punctuation", action="store_true")
    return p.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    print("=" * 72)
    print("MuseTalk API 字级时间轴端到端测试")
    print(f"Base URL : {args.base_url}")
    print(f"Person ID: {args.person_id}")
    print(f"Audio ID : {args.audio_man_id}")
    print(f"Text     : {args.text}")
    print("=" * 72)
    try:
        report = run(args)
    except KeyboardInterrupt:
        print("\n[ABORT] 用户中断。")
        return 130
    except Exception as exc:  # noqa: BLE001
        print(f"[FATAL] {exc}")
        traceback.print_exc()
        return 2
    json_path, html_path = write_reports(report, Path(args.report_dir))
    print("=" * 72)
    print(f"Result : {'PASS' if report.passed else 'FAIL'}")
    print(f"JSON   : {json_path}")
    print(f"HTML   : {html_path}")
    print(f"Elapsed: {report.elapsed_seconds:.3f}s")
    print("=" * 72)
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
