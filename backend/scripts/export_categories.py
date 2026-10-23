"""Write frontend/src/lib/categories.json from backend/classifier/categories.py.

The frontend imports that JSON at build time, so it never needs a second, hand-kept list.
Run after changing categories.py (a test fails until you do):
    .venv\\Scripts\\python backend/scripts/export_categories.py
"""

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from classifier.categories import export  # noqa: E402

OUT = BACKEND_DIR.parent / "frontend" / "src" / "lib" / "categories.json"


def render() -> str:
    return json.dumps(export(), indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    OUT.write_text(render(), encoding="utf-8", newline="\n")
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
