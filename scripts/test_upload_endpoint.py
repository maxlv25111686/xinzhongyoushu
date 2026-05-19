from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from urllib import request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("Usage: test_upload_endpoint.py <pdf-path>")

    pdf_path = Path(sys.argv[1]).resolve()
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
        data = json.loads(response.read().decode("utf-8"))

    analysis = data.get("analysis", {})
    print("ok:", data.get("ok"))
    print("usedOpenClaw:", data.get("usedOpenClaw"))
    print("title:", analysis.get("title"))
    print("pageCount:", analysis.get("pageCount"))
    print("summary:", analysis.get("summary"))
    print("highlights:", len(analysis.get("highlights", [])))
    for item in analysis.get("highlights", [])[:8]:
        print(
            f"- p{item.get('pageNumber')} | {item.get('label')} | {item.get('value')} | {str(item.get('text', ''))[:100]}"
        )


if __name__ == "__main__":
    main()
