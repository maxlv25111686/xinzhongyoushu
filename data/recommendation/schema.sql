PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id TEXT,
  description TEXT DEFAULT '',
  FOREIGN KEY(parent_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS param_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  param_key TEXT NOT NULL UNIQUE,
  label_cn TEXT NOT NULL,
  label_en TEXT DEFAULT '',
  value_type TEXT NOT NULL,
  unit_family TEXT DEFAULT '',
  searchable INTEGER NOT NULL DEFAULT 1,
  comparable INTEGER NOT NULL DEFAULT 1,
  is_core INTEGER NOT NULL DEFAULT 0,
  category_scope TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS domestic_brands (
  id TEXT PRIMARY KEY,
  brand_name TEXT NOT NULL UNIQUE,
  manufacturer_name TEXT DEFAULT '',
  aliases TEXT DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1.0,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS parts (
  id TEXT PRIMARY KEY,
  mpn TEXT NOT NULL UNIQUE,
  normalized_mpn TEXT NOT NULL,
  brand TEXT NOT NULL,
  manufacturer TEXT DEFAULT '',
  manufacturer_country TEXT DEFAULT '',
  is_domestic INTEGER NOT NULL DEFAULT 0,
  category_id TEXT NOT NULL,
  subcategory TEXT DEFAULT '',
  package TEXT DEFAULT '',
  package_raw TEXT DEFAULT '',
  description TEXT DEFAULT '',
  datasheet_url TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  lifecycle_status TEXT DEFAULT 'ACTIVE',
  stock_qty INTEGER NOT NULL DEFAULT 0,
  price_min REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'CNY',
  source TEXT DEFAULT '',
  source_part_code TEXT DEFAULT '',
  last_synced_at TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS part_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  FOREIGN KEY(part_id) REFERENCES parts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS part_params_raw (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id TEXT NOT NULL,
  raw_key TEXT DEFAULT '',
  raw_label TEXT NOT NULL,
  raw_value TEXT DEFAULT '',
  raw_unit TEXT DEFAULT '',
  condition_text TEXT DEFAULT '',
  source_page TEXT DEFAULT '',
  source_type TEXT DEFAULT 'seed',
  FOREIGN KEY(part_id) REFERENCES parts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS part_params_std (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id TEXT NOT NULL,
  param_key TEXT NOT NULL,
  value_num REAL,
  value_num_min REAL,
  value_num_typ REAL,
  value_num_max REAL,
  value_text TEXT DEFAULT '',
  unit TEXT DEFAULT '',
  condition_text TEXT DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1,
  source_raw_id INTEGER,
  FOREIGN KEY(part_id) REFERENCES parts(id) ON DELETE CASCADE,
  FOREIGN KEY(source_raw_id) REFERENCES part_params_raw(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS category_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT NOT NULL,
  param_key TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  required INTEGER NOT NULL DEFAULT 0,
  hard_filter INTEGER NOT NULL DEFAULT 0,
  comparison_mode TEXT NOT NULL DEFAULT 'equals',
  FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS package_compatibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_a TEXT NOT NULL,
  package_b TEXT NOT NULL,
  compatibility_level TEXT NOT NULL DEFAULT 'partial',
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS recommendation_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_signature TEXT NOT NULL UNIQUE,
  category_id TEXT DEFAULT '',
  input_payload_json TEXT NOT NULL,
  result_payload_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_parts_category ON parts(category_id, is_domestic);
CREATE INDEX IF NOT EXISTS idx_parts_brand ON parts(brand);
CREATE INDEX IF NOT EXISTS idx_part_aliases_part ON part_aliases(part_id);
CREATE INDEX IF NOT EXISTS idx_part_params_std_part ON part_params_std(part_id);
CREATE INDEX IF NOT EXISTS idx_part_params_std_key ON part_params_std(param_key);
CREATE INDEX IF NOT EXISTS idx_category_templates_category ON category_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_package_compatibility_pair ON package_compatibility(package_a, package_b);
