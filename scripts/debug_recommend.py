from __future__ import annotations

import base64
import json
import sqlite3
import sys
from pathlib import Path
from urllib import request

from recommend_parts import build_response

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def post_json(url: str, payload: dict) -> dict:
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=240) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: debug_recommend.py <pdf-path>")

    pdf_path = Path(sys.argv[1]).resolve()
    pdf_payload = {
        "fileName": pdf_path.name,
        "dataBase64": base64.b64encode(pdf_path.read_bytes()).decode("ascii"),
        "agentId": "web",
    }
    analyzed = post_json("http://127.0.0.1:4173/api/pdf/analyze", pdf_payload)
    analysis = analyzed.get("analysis", {})
    recommend_payload = {
        "title": analysis.get("title") or pdf_path.stem,
        "fileName": pdf_path.name,
        "summary": analysis.get("summary") or "",
        "pageSnippets": (analysis.get("pages") or [])[:3],
        "highlights": analysis.get("highlights") or [],
    }
    recommended = post_json("http://127.0.0.1:4173/api/recommend/domestic", recommend_payload)
    db_path = Path(__file__).resolve().parents[1] / "data" / "recommendation" / "parts_knowledge.db"
    with sqlite3.connect(db_path) as connection:
        direct_result = build_response(connection, recommend_payload)

    print("== recommend ==")
    print("title:", recommend_payload["title"])
    print("summary:", recommend_payload["summary"][:180])
    first_snippet = (recommend_payload.get("pageSnippets") or [{}])[0].get("text", "")
    print("page1:", first_snippet[:180])
    print("direct_category:", direct_result.get("sourceCategory"))
    print("api_category:", recommended.get("sourceCategory"))
    print("normalized_param_count:", len(recommended.get("normalizedParams") or []))
    print("candidate_count:", len(recommended.get("candidates") or []))
    for item in (recommended.get("candidates") or [])[:5]:
        print(
            f"- {item.get('name')} | {item.get('vendor')} | score={item.get('totalScore')} | chips={item.get('chips')}"
        )


if __name__ == "__main__":
    main()
