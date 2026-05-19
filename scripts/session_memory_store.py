import datetime
import json
import os
import sqlite3
import sys


def utc_now():
    return (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def read_payload():
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    return sanitize_value(json.loads(raw))


def sanitize_text(value):
    return str(value).encode("utf-8", "replace").decode("utf-8", "replace")


def sanitize_value(value):
    if isinstance(value, str):
        return sanitize_text(value)
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    if isinstance(value, dict):
        return {
            sanitize_text(key): sanitize_value(item)
            for key, item in value.items()
        }
    return value


def as_text(value, limit=None):
    if value is None:
        return ""
    text = sanitize_text(value).strip()
    if limit and len(text) > limit:
        return text[:limit]
    return text


def as_int(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def as_float(value, default=0.0):
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def json_text(value):
    return json.dumps(sanitize_value(value), ensure_ascii=False, separators=(",", ":"))


def parse_json_text(value, fallback):
    if not value:
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def connect(db_path):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def ensure_schema(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS review_sessions (
          session_key TEXT PRIMARY KEY,
          session_id TEXT,
          agent_id TEXT,
          title TEXT,
          file_name TEXT,
          memory_summary TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS review_documents (
          session_key TEXT PRIMARY KEY,
          file_name TEXT,
          title TEXT,
          page_count INTEGER,
          summary TEXT,
          used_openclaw INTEGER NOT NULL DEFAULT 0,
          analysis_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(session_key) REFERENCES review_sessions(session_key) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS review_parameters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_key TEXT NOT NULL,
          parameter_key TEXT,
          label TEXT,
          value TEXT,
          source_text TEXT,
          page_number INTEGER,
          rect_json TEXT,
          confidence REAL,
          importance REAL,
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(session_key) REFERENCES review_sessions(session_key) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_review_parameters_session
          ON review_parameters(session_key, display_order);

        CREATE TABLE IF NOT EXISTS review_stage_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_key TEXT NOT NULL,
          session_id TEXT,
          agent_id TEXT,
          phase TEXT,
          status TEXT,
          message TEXT,
          detail_json TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY(session_key) REFERENCES review_sessions(session_key) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_review_stage_logs_session
          ON review_stage_logs(session_key, id DESC);
        """
    )
    conn.commit()


def ensure_session(conn, payload):
    session_key = as_text(payload.get("sessionKey") or payload.get("session_key"))
    if not session_key:
      raise ValueError("sessionKey is required.")

    now = utc_now()
    session_id = as_text(payload.get("sessionId") or payload.get("session_id"))
    agent_id = as_text(payload.get("agentId") or payload.get("agent_id"))
    title = as_text(payload.get("title"), 240)
    file_name = as_text(payload.get("fileName") or payload.get("file_name"), 240)
    memory_summary = as_text(payload.get("memorySummary") or payload.get("summary"), 1200)

    conn.execute(
        """
        INSERT INTO review_sessions (
          session_key, session_id, agent_id, title, file_name, memory_summary, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET
          session_id = CASE
            WHEN excluded.session_id <> '' THEN excluded.session_id
            ELSE review_sessions.session_id
          END,
          agent_id = CASE
            WHEN excluded.agent_id <> '' THEN excluded.agent_id
            ELSE review_sessions.agent_id
          END,
          title = CASE
            WHEN excluded.title <> '' THEN excluded.title
            ELSE review_sessions.title
          END,
          file_name = CASE
            WHEN excluded.file_name <> '' THEN excluded.file_name
            ELSE review_sessions.file_name
          END,
          memory_summary = CASE
            WHEN excluded.memory_summary <> '' THEN excluded.memory_summary
            ELSE review_sessions.memory_summary
          END,
          updated_at = excluded.updated_at
        """,
        (
            session_key,
            session_id,
            agent_id,
            title,
            file_name,
            memory_summary,
            now,
            now,
        ),
    )
    conn.commit()
    return {
        "sessionKey": session_key,
        "sessionId": session_id,
        "agentId": agent_id,
        "updatedAt": now,
    }


def reset_session(conn, payload):
    session_key = as_text(payload.get("sessionKey") or payload.get("session_key"))
    if not session_key:
        raise ValueError("sessionKey is required.")

    conn.execute("DELETE FROM review_stage_logs WHERE session_key = ?", (session_key,))
    conn.execute("DELETE FROM review_parameters WHERE session_key = ?", (session_key,))
    conn.execute("DELETE FROM review_documents WHERE session_key = ?", (session_key,))
    conn.commit()
    session = ensure_session(conn, payload)
    return {
        "ok": True,
        "cleared": True,
        "session": session,
    }


def normalize_page_samples(raw_pages):
    page_samples = []
    for item in raw_pages or []:
        page_number = as_int((item or {}).get("pageNumber"))
        text = as_text((item or {}).get("text"), 1800)
        if not page_number or not text:
            continue
        page_samples.append({
            "pageNumber": page_number,
            "text": text,
        })
        if len(page_samples) >= 6:
            break
    return page_samples


def normalize_parameters(raw_parameters):
    normalized = []
    for index, item in enumerate(raw_parameters or []):
        if not isinstance(item, dict):
            continue
        label = as_text(item.get("label"), 120)
        value = as_text(item.get("value"), 240)
        source_text = as_text(item.get("text") or item.get("sourceText"), 1000)
        if not (label or value or source_text):
            continue
        normalized.append({
            "parameterKey": as_text(item.get("parameterKey") or item.get("parameterId"), 80),
            "label": label,
            "value": value,
            "sourceText": source_text,
            "pageNumber": as_int(item.get("pageNumber"), 0),
            "rect": item.get("rect") if isinstance(item.get("rect"), dict) else None,
            "confidence": as_float(item.get("confidence") or item.get("score"), 0.0),
            "importance": as_float(item.get("importance"), 0.0),
            "displayOrder": index,
        })
    return normalized


def upsert_analysis(conn, payload):
    session = ensure_session(conn, payload)
    session_key = session["sessionKey"]
    now = utc_now()
    title = as_text(payload.get("title"), 240)
    file_name = as_text(payload.get("fileName") or payload.get("file_name"), 240)
    summary = as_text(payload.get("summary"), 1200)
    page_count = as_int(payload.get("pageCount"), 0)
    used_openclaw = 1 if bool(payload.get("usedOpenClaw")) else 0
    page_samples = normalize_page_samples(payload.get("pageSamples"))
    parameters = normalize_parameters(payload.get("parameters"))

    analysis_json = {
        "pageSamples": page_samples,
        "usedOpenClaw": bool(used_openclaw),
        "savedAt": now,
    }

    conn.execute(
        """
        INSERT INTO review_documents (
          session_key, file_name, title, page_count, summary, used_openclaw, analysis_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_key) DO UPDATE SET
          file_name = excluded.file_name,
          title = excluded.title,
          page_count = excluded.page_count,
          summary = excluded.summary,
          used_openclaw = excluded.used_openclaw,
          analysis_json = excluded.analysis_json,
          updated_at = excluded.updated_at
        """,
        (
            session_key,
            file_name,
            title,
            page_count,
            summary,
            used_openclaw,
            json_text(analysis_json),
            now,
            now,
        ),
    )

    conn.execute("DELETE FROM review_parameters WHERE session_key = ?", (session_key,))
    for item in parameters:
        conn.execute(
            """
            INSERT INTO review_parameters (
              session_key, parameter_key, label, value, source_text, page_number, rect_json,
              confidence, importance, display_order, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_key,
                item["parameterKey"],
                item["label"],
                item["value"],
                item["sourceText"],
                item["pageNumber"] if item["pageNumber"] > 0 else None,
                json_text(item["rect"]) if item["rect"] else None,
                item["confidence"],
                item["importance"],
                item["displayOrder"],
                now,
                now,
            ),
        )

    conn.execute(
        """
        UPDATE review_sessions
        SET title = CASE WHEN ? <> '' THEN ? ELSE title END,
            file_name = CASE WHEN ? <> '' THEN ? ELSE file_name END,
            memory_summary = CASE WHEN ? <> '' THEN ? ELSE memory_summary END,
            updated_at = ?
        WHERE session_key = ?
        """,
        (title, title, file_name, file_name, summary, summary, now, session_key),
    )

    conn.commit()
    return {
        "ok": True,
        "sessionKey": session_key,
        "storedParameters": len(parameters),
        "storedPageSamples": len(page_samples),
        "updatedAt": now,
    }


def log_stage(conn, payload):
    session = ensure_session(conn, payload)
    session_key = session["sessionKey"]
    now = utc_now()
    phase = as_text(payload.get("phase"), 80)
    status = as_text(payload.get("status"), 40)
    message = as_text(payload.get("message"), 400)
    detail = payload.get("detail")
    duration_ms = as_int(payload.get("durationMs") or payload.get("duration_ms"), 0)

    cursor = conn.execute(
        """
        INSERT INTO review_stage_logs (
          session_key, session_id, agent_id, phase, status, message, detail_json, duration_ms, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_key,
            as_text(payload.get("sessionId") or payload.get("session_id"), 120),
            as_text(payload.get("agentId") or payload.get("agent_id"), 80),
            phase,
            status,
            message,
            json_text(detail) if detail is not None else None,
            duration_ms if duration_ms > 0 else None,
            now,
        ),
    )
    conn.commit()
    return {
        "ok": True,
        "id": cursor.lastrowid,
        "createdAt": now,
    }


def get_session_context(conn, payload):
    session_key = as_text(payload.get("sessionKey") or payload.get("session_key"))
    if not session_key:
        raise ValueError("sessionKey is required.")

    session = conn.execute(
        "SELECT * FROM review_sessions WHERE session_key = ?",
        (session_key,),
    ).fetchone()
    if not session:
        return {
            "ok": True,
            "memory": None,
        }

    document = conn.execute(
        "SELECT * FROM review_documents WHERE session_key = ?",
        (session_key,),
    ).fetchone()
    parameters = conn.execute(
        """
        SELECT parameter_key, label, value, source_text, page_number, rect_json, confidence, importance, display_order
        FROM review_parameters
        WHERE session_key = ?
        ORDER BY display_order ASC, id ASC
        """,
        (session_key,),
    ).fetchall()

    analysis_payload = parse_json_text(document["analysis_json"] if document else "", {})
    page_samples = analysis_payload.get("pageSamples") if isinstance(analysis_payload, dict) else []

    memory = {
        "sessionKey": session_key,
        "sessionId": session["session_id"] or "",
        "agentId": session["agent_id"] or "",
        "title": (document["title"] if document else "") or (session["title"] or ""),
        "fileName": (document["file_name"] if document else "") or (session["file_name"] or ""),
        "summary": (document["summary"] if document else "") or (session["memory_summary"] or ""),
        "pageCount": as_int(document["page_count"] if document else 0, 0),
        "scannedPages": len(page_samples or []),
        "extractionComplete": bool(document),
        "usedOpenClaw": bool(document["used_openclaw"]) if document else False,
        "pageSamples": page_samples if isinstance(page_samples, list) else [],
        "parameters": [
            {
                "parameterKey": row["parameter_key"] or "",
                "label": row["label"] or "",
                "value": row["value"] or "",
                "text": row["source_text"] or "",
                "pageNumber": as_int(row["page_number"], 0),
                "rect": parse_json_text(row["rect_json"], None),
                "confidence": as_float(row["confidence"], 0.0),
                "importance": as_float(row["importance"], 0.0),
                "displayOrder": as_int(row["display_order"], 0),
            }
            for row in parameters
        ],
    }
    return {
        "ok": True,
        "memory": memory,
    }


def get_stage_logs(conn, payload):
    session_key = as_text(payload.get("sessionKey") or payload.get("session_key"))
    if not session_key:
        raise ValueError("sessionKey is required.")

    limit = as_int(payload.get("limit"), 80)
    limit = max(1, min(limit, 200))
    rows = conn.execute(
        """
        SELECT id, session_key, session_id, agent_id, phase, status, message, detail_json, duration_ms, created_at
        FROM review_stage_logs
        WHERE session_key = ?
        ORDER BY id DESC
        LIMIT ?
        """,
        (session_key, limit),
    ).fetchall()

    logs = [
        {
            "id": row["id"],
            "sessionKey": row["session_key"] or "",
            "sessionId": row["session_id"] or "",
            "agentId": row["agent_id"] or "",
            "phase": row["phase"] or "",
            "status": row["status"] or "",
            "message": row["message"] or "",
            "detail": parse_json_text(row["detail_json"], None),
            "durationMs": as_int(row["duration_ms"], 0),
            "createdAt": row["created_at"] or "",
        }
        for row in reversed(rows)
    ]
    return {
        "ok": True,
        "logs": logs,
    }


def dispatch(conn, action, payload):
    if action == "init":
        ensure_schema(conn)
        return {"ok": True}
    if action == "ensure_session":
        return {"ok": True, "session": ensure_session(conn, payload)}
    if action == "reset_session":
        return reset_session(conn, payload)
    if action == "log_stage":
        return log_stage(conn, payload)
    if action == "upsert_analysis":
        return upsert_analysis(conn, payload)
    if action == "get_session_context":
        return get_session_context(conn, payload)
    if action == "get_stage_logs":
        return get_stage_logs(conn, payload)
    raise ValueError(f"Unsupported action: {action}")


def main():
    if len(sys.argv) < 3:
        raise ValueError("Usage: session_memory_store.py <db_path> <action>")

    db_path = sys.argv[1]
    action = sys.argv[2]
    payload = read_payload()

    conn = connect(db_path)
    try:
        ensure_schema(conn)
        result = dispatch(conn, action, payload)
    finally:
        conn.close()

    print(json.dumps(sanitize_value(result), ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": sanitize_text(error)}, ensure_ascii=False))
        sys.exit(1)
