from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: read_glob_text.py <base_dir> <glob_pattern> [encoding] [max_chars]", file=sys.stderr)
        return 2

    base_dir = Path(sys.argv[1])
    pattern = sys.argv[2]
    encoding = sys.argv[3] if len(sys.argv) >= 4 else "utf-8"
    max_chars = int(sys.argv[4]) if len(sys.argv) >= 5 else 12000

    path = next(base_dir.glob(pattern))
    text = path.read_text(encoding=encoding)
    output = f"{path}\n---CUT---\n{text[:max_chars]}"
    sys.stdout.buffer.write(output.encode("utf-8", errors="replace"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
