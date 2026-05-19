from __future__ import annotations

import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    if len(sys.argv) < 4:
        raise SystemExit("Usage: print_lines.py <path> <start> <end>")

    path = Path(sys.argv[1])
    start = int(sys.argv[2])
    end = int(sys.argv[3])

    lines = path.read_text(encoding="utf-8").splitlines()
    for line_no in range(max(1, start), min(len(lines), end) + 1):
        print(f"{line_no}:{lines[line_no - 1]}")


if __name__ == "__main__":
    main()
