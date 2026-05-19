from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

from recommendation_kb import load_recommendation_kb


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_schema(root: Path) -> str:
    schema_path = root / "data" / "recommendation" / "schema.sql"
    return schema_path.read_text(encoding="utf-8")


def clear_tables(cursor: sqlite3.Cursor) -> None:
    cursor.executescript(
        """
        DELETE FROM recommendation_cache;
        DELETE FROM package_compatibility;
        DELETE FROM category_templates;
        DELETE FROM part_params_std;
        DELETE FROM part_params_raw;
        DELETE FROM part_aliases;
        DELETE FROM parts;
        DELETE FROM domestic_brands;
        DELETE FROM param_definitions;
        DELETE FROM categories;
        """
    )


def insert_knowledge_base(cursor: sqlite3.Cursor, kb_data: dict) -> None:
    cursor.executemany(
        "INSERT INTO categories (id, code, name, description) VALUES (?, ?, ?, ?)",
        [
            (
                item["id"],
                item["code"],
                item["name"],
                item.get("description", ""),
            )
            for item in kb_data["categories"]
        ],
    )
    cursor.executemany(
        """
        INSERT INTO param_definitions
        (param_key, label_cn, label_en, value_type, unit_family, searchable, comparable, is_core, category_scope)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                item["paramKey"],
                item["labelCn"],
                item.get("labelEn", ""),
                item["valueType"],
                item.get("unitFamily", ""),
                int(bool(item.get("searchable", True))),
                int(bool(item.get("comparable", True))),
                int(bool(item.get("isCore", False))),
                item.get("categoryScope", "*"),
            )
            for item in kb_data["paramDefinitions"]
        ],
    )
    cursor.executemany(
        """
        INSERT INTO category_templates
        (category_id, param_key, weight, required, hard_filter, comparison_mode)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                item["categoryId"],
                item["paramKey"],
                float(item.get("weight", 1)),
                int(bool(item.get("required", False))),
                int(bool(item.get("hardFilter", False))),
                item["comparisonMode"],
            )
            for item in kb_data["categoryTemplates"]
        ],
    )
    cursor.executemany(
        """
        INSERT INTO domestic_brands
        (id, brand_name, manufacturer_name, aliases, confidence, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (
                item["id"],
                item["brandName"],
                item.get("manufacturerName", ""),
                ",".join(item.get("aliases", [])),
                float(item.get("confidence", 1)),
                item.get("notes", ""),
            )
            for item in kb_data["domesticBrands"]
        ],
    )
    cursor.executemany(
        """
        INSERT INTO package_compatibility
        (package_a, package_b, compatibility_level, note)
        VALUES (?, ?, ?, ?)
        """,
        [
            (
                item["packageA"],
                item["packageB"],
                item["compatibilityLevel"],
                item.get("note", ""),
            )
            for item in kb_data["packageCompatibility"]
        ],
    )

    for part in kb_data["parts"]:
        cursor.execute(
            """
            INSERT INTO parts
            (
              id, mpn, normalized_mpn, brand, manufacturer, manufacturer_country, is_domestic,
              category_id, subcategory, package, package_raw, description, lifecycle_status,
              stock_qty, price_min, currency, source, source_part_code
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                part["id"],
                part["mpn"],
                part["mpn"].upper(),
                part["brand"],
                part.get("manufacturer", ""),
                part.get("manufacturerCountry", ""),
                int(bool(part.get("isDomestic", True))),
                part["categoryId"],
                part.get("subcategory", ""),
                part.get("package", ""),
                part.get("packageRaw", ""),
                part.get("description", ""),
                "ACTIVE",
                part.get("stockQty", 0),
                part.get("priceMin", 0),
                "CNY",
                "recommendation-kb",
                part["mpn"],
            ),
        )

        for alias in part.get("aliases", []):
            cursor.execute(
                "INSERT INTO part_aliases (part_id, alias) VALUES (?, ?)",
                (part["id"], alias),
            )

        for param in part.get("params", []):
            param_key = param["paramKey"]
            value_num = param.get("valueNum")
            value_num_min = param.get("valueNumMin")
            value_num_typ = param.get("valueNumTyp")
            value_num_max = param.get("valueNumMax")
            value_text = param.get("valueText", "")
            unit = param.get("unit", "")
            cursor.execute(
                """
                INSERT INTO part_params_raw
                (part_id, raw_key, raw_label, raw_value, raw_unit, source_page, source_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    part["id"],
                    param_key,
                    param_key,
                    value_text,
                    unit,
                    "knowledge-base",
                    "recommendation-kb",
                ),
            )
            raw_id = cursor.lastrowid
            cursor.execute(
                """
                INSERT INTO part_params_std
                (
                  part_id, param_key, value_num, value_num_min, value_num_typ, value_num_max,
                  value_text, unit, confidence, source_raw_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    part["id"],
                    param_key,
                    value_num,
                    value_num_min,
                    value_num_typ,
                    value_num_max,
                    value_text,
                    unit,
                    0.92,
                    raw_id,
                ),
            )


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data" / "recommendation" / "parts_knowledge.db"
    ensure_parent(db_path)
    kb_data, kb_path = load_recommendation_kb(root)

    with sqlite3.connect(db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(load_schema(root))
        clear_tables(connection.cursor())
        insert_knowledge_base(connection.cursor(), kb_data)
        connection.commit()

    print(f"{db_path}\nsource={kb_path}")


if __name__ == "__main__":
    main()
