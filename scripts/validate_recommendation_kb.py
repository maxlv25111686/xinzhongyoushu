from __future__ import annotations

from pathlib import Path

from recommendation_kb import load_recommendation_kb


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    kb_data, kb_path = load_recommendation_kb(root)

    print(f"knowledge_base={kb_path}")
    print(f"categories={len(kb_data['categories'])}")
    print(f"paramDefinitions={len(kb_data['paramDefinitions'])}")
    print(f"categoryTemplates={len(kb_data['categoryTemplates'])}")
    print(f"domesticBrands={len(kb_data['domesticBrands'])}")
    print(f"packageCompatibility={len(kb_data['packageCompatibility'])}")
    print(f"parts={len(kb_data['parts'])}")


if __name__ == "__main__":
    main()
