from __future__ import annotations

import json
from pathlib import Path

from recommendation_seed import (
    CATEGORIES,
    CATEGORY_TEMPLATES,
    DOMESTIC_BRANDS,
    PACKAGE_COMPATIBILITY,
    PARAM_DEFINITIONS,
    PARTS,
)


KB_FILE_NAME = "knowledge_base.json"


def kb_path_for_root(root: Path) -> Path:
    return root / "data" / "recommendation" / KB_FILE_NAME


def _legacy_kb_data() -> dict:
    return {
        "categories": [
            {
                "id": item[0],
                "code": item[1],
                "name": item[2],
                "description": item[3],
                "parentId": "",
            }
            for item in CATEGORIES
        ],
        "paramDefinitions": [
            {
                "paramKey": item[0],
                "labelCn": item[1],
                "labelEn": item[2],
                "valueType": item[3],
                "unitFamily": item[4],
                "searchable": bool(item[5]),
                "comparable": bool(item[6]),
                "isCore": bool(item[7]),
                "categoryScope": item[8],
            }
            for item in PARAM_DEFINITIONS
        ],
        "categoryTemplates": [
            {
                "categoryId": item[0],
                "paramKey": item[1],
                "weight": item[2],
                "required": bool(item[3]),
                "hardFilter": bool(item[4]),
                "comparisonMode": item[5],
            }
            for item in CATEGORY_TEMPLATES
        ],
        "domesticBrands": [
            {
                "id": item[0],
                "brandName": item[1],
                "manufacturerName": item[2],
                "aliases": [alias.strip() for alias in str(item[3]).split(",") if alias.strip()],
                "confidence": item[4],
                "notes": item[5],
            }
            for item in DOMESTIC_BRANDS
        ],
        "packageCompatibility": [
            {
                "packageA": item[0],
                "packageB": item[1],
                "compatibilityLevel": item[2],
                "note": item[3],
            }
            for item in PACKAGE_COMPATIBILITY
        ],
        "parts": [
            {
                "id": part["id"],
                "mpn": part["mpn"],
                "brand": part["brand"],
                "manufacturer": part["manufacturer"],
                "manufacturerCountry": part["manufacturer_country"],
                "isDomestic": bool(part["is_domestic"]),
                "categoryId": part["category_id"],
                "subcategory": part.get("subcategory", ""),
                "package": part.get("package", ""),
                "packageRaw": part.get("package_raw", ""),
                "description": part.get("description", ""),
                "stockQty": part.get("stock_qty", 0),
                "priceMin": part.get("price_min", 0),
                "aliases": list(part.get("aliases", [])),
                "params": [
                    {
                        "paramKey": param[0],
                        "valueNum": param[1],
                        "valueNumMin": param[2],
                        "valueNumTyp": param[3],
                        "valueNumMax": param[4],
                        "valueText": param[5],
                        "unit": param[6],
                    }
                    for param in part.get("params", [])
                ],
            }
            for part in PARTS
        ],
    }


def bootstrap_recommendation_kb(root: Path) -> Path:
    path = kb_path_for_root(root)
    if path.exists():
        return path

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(_legacy_kb_data(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return path


def _expect_list(data: dict, key: str) -> list:
    value = data.get(key)
    if not isinstance(value, list):
      raise ValueError(f"Recommendation knowledge base field '{key}' must be a list.")
    return value


def _require_fields(item: dict, fields: tuple[str, ...], scope: str) -> None:
    missing = [field for field in fields if not str(item.get(field, "")).strip()]
    if missing:
        raise ValueError(f"{scope} is missing required fields: {', '.join(missing)}")


def validate_recommendation_kb(data: dict) -> dict:
    categories = _expect_list(data, "categories")
    param_definitions = _expect_list(data, "paramDefinitions")
    category_templates = _expect_list(data, "categoryTemplates")
    domestic_brands = _expect_list(data, "domesticBrands")
    package_compatibility = _expect_list(data, "packageCompatibility")
    parts = _expect_list(data, "parts")

    for index, item in enumerate(categories, start=1):
        _require_fields(item, ("id", "code", "name"), f"categories[{index}]")

    for index, item in enumerate(param_definitions, start=1):
        _require_fields(item, ("paramKey", "labelCn", "valueType"), f"paramDefinitions[{index}]")

    for index, item in enumerate(category_templates, start=1):
        _require_fields(item, ("categoryId", "paramKey", "comparisonMode"), f"categoryTemplates[{index}]")

    for index, item in enumerate(domestic_brands, start=1):
        _require_fields(item, ("id", "brandName"), f"domesticBrands[{index}]")

    for index, item in enumerate(package_compatibility, start=1):
        _require_fields(item, ("packageA", "packageB", "compatibilityLevel"), f"packageCompatibility[{index}]")

    for index, item in enumerate(parts, start=1):
        _require_fields(item, ("id", "mpn", "brand", "categoryId"), f"parts[{index}]")
        if not isinstance(item.get("params", []), list):
            raise ValueError(f"parts[{index}].params must be a list.")
        for param_index, param in enumerate(item.get("params", []), start=1):
            _require_fields(param, ("paramKey",), f"parts[{index}].params[{param_index}]")

    return {
        "categories": categories,
        "paramDefinitions": param_definitions,
        "categoryTemplates": category_templates,
        "domesticBrands": domestic_brands,
        "packageCompatibility": package_compatibility,
        "parts": parts,
    }


def load_recommendation_kb(root: Path) -> tuple[dict, Path]:
    path = bootstrap_recommendation_kb(root)
    raw = json.loads(path.read_text(encoding="utf-8"))
    return validate_recommendation_kb(raw), path
