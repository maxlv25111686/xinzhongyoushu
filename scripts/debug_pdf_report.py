from __future__ import annotations

import base64
import json
import sys
from collections import Counter
from pathlib import Path
from urllib import request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def load_json_from_parse(script_path: Path, pdf_path: Path) -> dict:
    import subprocess

    result = subprocess.run(
        ["py", "-3", str(script_path), str(pdf_path)],
        capture_output=True,
        text=False,
        check=True,
    )
    return json.loads(result.stdout.decode("utf-8"))


def post_analyze(pdf_path: Path) -> dict:
    payload = {
        "fileName": pdf_path.name,
        "dataBase64": base64.b64encode(pdf_path.read_bytes()).decode("ascii"),
        "agentId": "web",
    }
    req = request.Request(
        "http://127.0.0.1:4173/api/pdf/analyze",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=240) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: debug_pdf_report.py <pdf-path>")

    pdf_path = Path(sys.argv[1]).resolve()
    root = Path(__file__).resolve().parents[1]
    parse_script = root / "scripts" / "parse_pdf.py"

    parsed = load_json_from_parse(parse_script, pdf_path)
    candidate_pages = Counter(item.get("pageNumber") for item in parsed.get("candidates", []))
    page_texts = parsed.get("pages", [])

    print("== parse_pdf.py ==")
    print("pageCount:", parsed.get("pageCount"))
    print("pages_with_text:", len(page_texts))
    print("candidate_total:", len(parsed.get("candidates", [])))
    print("candidate_pages_top10:", dict(candidate_pages.most_common(10)))
    print()

    analyzed = post_analyze(pdf_path)
    highlights = analyzed.get("analysis", {}).get("highlights", [])
    highlight_pages = Counter(item.get("pageNumber") for item in highlights)

    print("== /api/pdf/analyze ==")
    print("usedOpenClaw:", analyzed.get("usedOpenClaw"))
    print("highlight_total:", len(highlights))
    print("highlight_pages:", dict(highlight_pages))
    for item in highlights[:12]:
        print(
            f"- p{item.get('pageNumber')} | {item.get('label')} | {item.get('value')} | {str(item.get('text', ''))[:120]}"
        )


if __name__ == "__main__":
    main()
