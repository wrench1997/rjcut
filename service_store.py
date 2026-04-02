#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import sqlite3
from threading import Lock
from datetime import datetime, timezone
from typing import Optional, Dict, Any


DB_PATH = os.path.abspath("./service_data/tasks.db")
_LOCK = Lock()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            task_id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            status TEXT NOT NULL,
            progress INTEGER NOT NULL DEFAULT 0,
            stage TEXT,
            payload_json TEXT,
            result_json TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """)
        conn.commit()


def get_conn():
    ensure_db()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def create_task(task_id: str, payload: Dict[str, Any]):
    now = utc_now()
    with _LOCK:
        with get_conn() as conn:
            conn.execute("""
                INSERT INTO tasks (
                    task_id, type, status, progress, stage,
                    payload_json, result_json, error,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                task_id,
                "agent_compose",
                "queued",
                0,
                "queued",
                json.dumps(payload, ensure_ascii=False),
                None,
                None,
                now,
                now,
            ))
            conn.commit()


def update_task(task_id: str, **kwargs):
    allowed = {
        "type", "status", "progress", "stage",
        "payload", "result", "error"
    }

    fields = []
    values = []

    for k, v in kwargs.items():
        if k not in allowed:
            continue

        db_key = k
        db_value = v

        if k == "payload":
            db_key = "payload_json"
            db_value = json.dumps(v, ensure_ascii=False)
        elif k == "result":
            db_key = "result_json"
            db_value = json.dumps(v, ensure_ascii=False)

        fields.append(f"{db_key} = ?")
        values.append(db_value)

    fields.append("updated_at = ?")
    values.append(utc_now())
    values.append(task_id)

    sql = f"UPDATE tasks SET {', '.join(fields)} WHERE task_id = ?"

    with _LOCK:
        with get_conn() as conn:
            conn.execute(sql, values)
            conn.commit()


def _row_to_task(row: sqlite3.Row) -> Optional[Dict[str, Any]]:
    if not row:
        return None

    payload = None
    result = None

    if row["payload_json"]:
        try:
            payload = json.loads(row["payload_json"])
        except Exception:
            payload = None

    if row["result_json"]:
        try:
            result = json.loads(row["result_json"])
        except Exception:
            result = None

    return {
        "task_id": row["task_id"],
        "type": row["type"],
        "status": row["status"],
        "progress": row["progress"],
        "stage": row["stage"],
        "payload": payload,
        "result": result,
        "error": row["error"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def get_task(task_id: str) -> Optional[Dict[str, Any]]:
    with _LOCK:
        with get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM tasks WHERE task_id = ?",
                (task_id,)
            ).fetchone()
            return _row_to_task(row)


def list_tasks(limit: int = 100):
    with _LOCK:
        with get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
            return [_row_to_task(r) for r in rows]


def set_task_result(task_id: str, result: Dict[str, Any]):
    update_task(
        task_id,
        status="succeeded",
        progress=100,
        stage="finished",
        result=result,
        error=None,
    )


def set_task_error(task_id: str, error: str):
    update_task(
        task_id,
        status="failed",
        stage="failed",
        error=error,
    )


def mark_stale_processing_tasks_failed():
    with _LOCK:
        with get_conn() as conn:
            conn.execute("""
                UPDATE tasks
                SET status = 'failed',
                    stage = 'failed',
                    error = 'service restarted during processing',
                    updated_at = ?
                WHERE status = 'processing'
            """, (utc_now(),))
            conn.commit()