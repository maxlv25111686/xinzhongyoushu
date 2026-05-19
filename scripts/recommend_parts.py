from __future__ import annotations

import json
import math
import re
import sqlite3
import sys
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


PACKAGE_PATTERN = re.compile(
    r"\b(?:SOT-?\d+-?\d*|SOT\d+-?\d*|SOT23-?\d*|SOT563-?\d*|SOIC-?\d+|TSSOP-?\d+|MSOP-?\d+|QFN-?\d+|DFN-?\d+|TO-?\d+|TO92-?\d*|X2SON-?\d*|QFN\d+|LQFP-?\d+)\b",
    re.I,
)
INTERFACE_TOKENS = ("SMBus", "I2C", "SPI", "UART", "USB", "CAN", "GPIO", "PWM")

CATEGORY_RULES = [
    ("sensor.temperature.digital", [r"温度", r"temperature", r"smbus", r"\bi2c\b"]),
    ("sensor.hall", [r"霍尔", r"hall", r"磁"]),
    ("power.ldo", [r"\bldo\b", r"线性稳压", r"低压差"]),
    ("power.dcdc.buck", [r"\bbuck\b", r"降压", r"dcdc", r"开关频率"]),
    ("interface.level_shifter", [r"电平转换", r"level shifter", r"电平", r"总线转换"]),
    ("analog.opamp", [r"运算放大器", r"\bop amp\b", r"\bopamp\b", r"压摆率", r"带宽"]),
    ("mcu.general", [r"\bmcu\b", r"微控制器", r"flash", r"ram"]),
]

LABEL_RULES = [
    ("supply_voltage", [r"供电电压", r"电源电压", r"工作电压", r"supply voltage", r"vcc", r"vdd"]),
    ("input_voltage", [r"输入电压", r"input voltage", r"vin"]),
    ("output_voltage", [r"输出电压", r"output voltage", r"vout"]),
    ("operating_temp", [r"工作温度", r"温度范围", r"operating temperature", r"ambient temperature", r"junction temperature", r"\btj\b", r"\bta\b"]),
    ("accuracy", [r"精度", r"accuracy", r"误差"]),
    ("resolution", [r"分辨率", r"resolution"]),
    ("quiescent_current", [r"静态电流", r"工作电流", r"电源电流", r"quiescent current", r"supply current"]),
    ("output_current", [r"输出电流", r"load current", r"output current"]),
    ("switching_frequency", [r"开关频率", r"频率", r"switching frequency", r"frequency"]),
    ("bandwidth", [r"带宽", r"bandwidth", r"gbw", r"gain bandwidth"]),
    ("slew_rate", [r"压摆率", r"slew rate"]),
    ("output_noise", [r"噪声", r"声噪", r"输出噪声", r"noise", r"rms noise", r"noise density"]),
    ("psrr", [r"psrr", r"电源抑制比", r"电源纹波抑制", r"power supply rejection", r"ripple rejection"]),
    ("interface", [r"接口", r"interface", r"i2c", r"spi", r"uart", r"smbus", r"usb", r"can"]),
    ("package", [r"封装", r"package"]),
    ("channel_count", [r"通道", r"channel"]),
    ("pin_count", [r"引脚", r"pin"]),
    ("logic_voltage", [r"逻辑电压", r"io电压", r"logic voltage"]),
    ("memory_flash", [r"flash"]),
    ("memory_ram", [r"\bram\b"]),
]

CORE_REASON_LABELS = {
    "supply_voltage_min": "供电范围",
    "supply_voltage_max": "供电范围",
    "input_voltage_min": "输入范围",
    "input_voltage_max": "输入范围",
    "output_voltage_typ": "输出电压",
    "output_current_max": "输出能力",
    "operating_temp_min": "工作温度",
    "operating_temp_max": "工作温度",
    "accuracy_max": "精度",
    "interface_type": "接口",
    "package": "封装",
    "switching_frequency_typ": "开关频率",
    "bandwidth_typ": "带宽",
    "slew_rate_typ": "压摆率",
    "output_noise_typ": "噪声",
    "psrr_typ": "PSRR",
    "logic_voltage_min": "逻辑电压",
    "logic_voltage_max": "逻辑电压",
}

DISPLAY_SPEC_PRIORITY = {
    "sensor.temperature.digital": [
        "supply_voltage_range",
        "operating_temp_range",
        "accuracy_max",
        "resolution_bits",
        "interface_type",
        "package",
    ],
    "sensor.hall": [
        "supply_voltage_range",
        "operating_temp_range",
        "quiescent_current_typ",
        "package",
        "pin_count",
    ],
    "power.ldo": [
        "input_voltage_range",
        "output_voltage_typ",
        "output_current_max",
        "quiescent_current_typ",
        "output_noise_typ",
        "psrr_typ",
        "package",
        "operating_temp_range",
    ],
    "power.dcdc.buck": [
        "input_voltage_range",
        "output_voltage_typ",
        "output_current_max",
        "switching_frequency_typ",
        "package",
    ],
    "analog.opamp": [
        "supply_voltage_range",
        "bandwidth_typ",
        "slew_rate_typ",
        "channel_count",
        "package",
    ],
    "interface.level_shifter": [
        "logic_voltage_range",
        "channel_count",
        "interface_type",
        "package",
    ],
    "mcu.general": [
        "supply_voltage_range",
        "memory_flash_kb",
        "memory_ram_kb",
        "interface_type",
        "package",
    ],
}

DISPLAY_SPEC_LABELS = {
    "supply_voltage_range": "供电",
    "input_voltage_range": "输入",
    "logic_voltage_range": "逻辑",
    "operating_temp_range": "温度",
    "accuracy_max": "精度",
    "resolution_bits": "分辨率",
    "interface_type": "接口",
    "package": "封装",
    "quiescent_current_typ": "静态电流",
    "output_voltage_typ": "输出电压",
    "output_current_max": "输出电流",
    "switching_frequency_typ": "开关频率",
    "bandwidth_typ": "带宽",
    "slew_rate_typ": "压摆率",
    "output_noise_typ": "噪声",
    "psrr_typ": "PSRR",
    "channel_count": "通道数",
    "memory_flash_kb": "Flash",
    "memory_ram_kb": "RAM",
    "pin_count": "引脚数",
}

ADDITIONAL_SPEC_LABELS = {
    "supply_voltage_min": "供电下限",
    "supply_voltage_max": "供电上限",
    "input_voltage_min": "输入下限",
    "input_voltage_max": "输入上限",
    "logic_voltage_min": "逻辑下限",
    "logic_voltage_max": "逻辑上限",
    "operating_temp_min": "温度下限",
    "operating_temp_max": "温度上限",
    "memory_flash_kb": "Flash",
    "memory_ram_kb": "RAM",
}

THINKING_LABELS = {
    "supply_voltage_range": "供电",
    "input_voltage_range": "输入",
    "logic_voltage_range": "逻辑",
    "operating_temp_range": "温度",
    "accuracy_max": "精度",
    "resolution_bits": "分辨率",
    "interface_type": "接口",
    "package": "封装",
    "quiescent_current_typ": "静态电流",
    "output_voltage_typ": "输出电压",
    "output_current_max": "输出电流",
    "switching_frequency_typ": "开关频率",
    "bandwidth_typ": "带宽",
    "slew_rate_typ": "压摆率",
    "output_noise_typ": "噪声",
    "psrr_typ": "PSRR",
    "channel_count": "通道数",
    "memory_flash_kb": "Flash",
    "memory_ram_kb": "RAM",
    "pin_count": "引脚数",
}

CANONICAL_UNITS = {
    "supply_voltage_min": "V",
    "supply_voltage_max": "V",
    "input_voltage_min": "V",
    "input_voltage_max": "V",
    "logic_voltage_min": "V",
    "logic_voltage_max": "V",
    "output_voltage_typ": "V",
    "output_current_max": "A",
    "quiescent_current_typ": "A",
    "switching_frequency_typ": "Hz",
    "operating_temp_min": "C",
    "operating_temp_max": "C",
    "accuracy_max": "%",
    "bandwidth_typ": "Hz",
    "slew_rate_typ": "V/us",
    "output_noise_typ": "V",
    "psrr_typ": "dB",
}

UNIT_TOKEN_MAP = {
    "pV/sqrtHz": ("V/sqrtHz", 1e-12),
    "nV/sqrtHz": ("V/sqrtHz", 1e-9),
    "uV/sqrtHz": ("V/sqrtHz", 1e-6),
    "mV/sqrtHz": ("V/sqrtHz", 1e-3),
    "V/sqrtHz": ("V/sqrtHz", 1.0),
    "pV/us": ("V/us", 1e-12),
    "nV/us": ("V/us", 1e-9),
    "uV/us": ("V/us", 1e-6),
    "mV/us": ("V/us", 1e-3),
    "V/us": ("V/us", 1.0),
    "pV": ("V", 1e-12),
    "nV": ("V", 1e-9),
    "uV": ("V", 1e-6),
    "mV": ("V", 1e-3),
    "V": ("V", 1.0),
    "kV": ("V", 1e3),
    "MV": ("V", 1e6),
    "pA": ("A", 1e-12),
    "nA": ("A", 1e-9),
    "uA": ("A", 1e-6),
    "mA": ("A", 1e-3),
    "A": ("A", 1.0),
    "Hz": ("Hz", 1.0),
    "kHz": ("Hz", 1e3),
    "MHz": ("Hz", 1e6),
    "GHz": ("Hz", 1e9),
    "pW": ("W", 1e-12),
    "nW": ("W", 1e-9),
    "uW": ("W", 1e-6),
    "mW": ("W", 1e-3),
    "W": ("W", 1.0),
    "dB": ("dB", 1.0),
    "%": ("%", 1.0),
    "ppm": ("ppm", 1.0),
    "°C": ("C", 1.0),
    "C": ("C", 1.0),
}

MEASUREMENT_TOKEN_PATTERN = "|".join(
    sorted((re.escape(token) for token in UNIT_TOKEN_MAP), key=len, reverse=True)
)
MEASUREMENT_PATTERN = re.compile(
    rf"([-+]?\d+(?:\.\d+)?)\s*({MEASUREMENT_TOKEN_PATTERN})(?![A-Za-z])"
)
NUMBER_FIELDS = ("valueNum", "valueNumMin", "valueNumTyp", "valueNumMax")
CONDITION_SPLIT_PATTERN = re.compile(r"[;；。]\s*|\n+")
CONDITION_HINT_PATTERN = re.compile(
    r"(?:"
    r"\b(?:ta|tj|vin|vout|vcc|vdd|iout|iin|iq|cin|cout|load|rl|cl|psrr|gbw|bandwidth|slew\s*rate)\b"
    r"|="
    r"|≤|>=|<=|≥|~|至"
    r"|unless otherwise noted"
    r"|test conditions?"
    r"|在\s*[-+]?\d+(?:\.\d+)?\s*(?:°C|℃|C)\s*(?:下|时)"
    r"|温度|条件|负载|带宽|电容|频率"
    r")",
    re.I,
)
INLINE_CONDITION_PATTERNS = [
    re.compile(r"\b(?:TA|TJ)\s*=\s*[^,;，；]{1,36}", re.I),
    re.compile(r"\b(?:VIN|VOUT|VCC|VDD|IOUT|IIN|IQ|CIN|COUT|PSRR|GBW)\s*=\s*[^,;，；]{1,36}", re.I),
    re.compile(r"\b(?:unless otherwise noted|test conditions?)\b", re.I),
    re.compile(r"在\s*[-+]?\d+(?:\.\d+)?\s*(?:°C|℃|C)\s*(?:下|时)"),
]


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_number(token: str) -> float | None:
    try:
        return float(token)
    except ValueError:
        return None


def normalize_measurement_text(text: str) -> str:
    normalized = str(text or "")
    normalized = normalized.replace("μ", "u").replace("µ", "u").replace("℃", "°C").replace("／", "/")
    normalized = re.sub(r"(?i)(?<![A-Za-z])([pnumkKMGT]?V)\s*(?:RMS|PP|P-P|PK-PK)\b", r"\1", normalized)
    normalized = re.sub(r"(?i)(?<![A-Za-z])([pnumkKMGT]?A)\s*RMS\b", r"\1", normalized)
    normalized = re.sub(r"(?i)/\s*(?:√\s*Hz|sqrt\s*\(?\s*Hz\s*\)?)", "/sqrtHz", normalized)
    normalized = re.sub(r"(?i)/\s*u\s*s", "/us", normalized)
    normalized = re.sub(r"(?i)\bdB\b", "dB", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def extract_numbers(text: str) -> list[float]:
    numbers: list[float] = []
    for match in re.findall(r"[-+]?\d+(?:\.\d+)?", text):
        value = parse_number(match)
        if value is not None:
            numbers.append(value)
    return numbers


def extract_measurements(text: str) -> list[tuple[float, str]]:
    measurements: list[tuple[float, str]] = []
    normalized = normalize_measurement_text(text)
    for match in MEASUREMENT_PATTERN.finditer(normalized):
        number = parse_number(match.group(1))
        unit_token = match.group(2)
        unit_info = UNIT_TOKEN_MAP.get(unit_token)
        if number is None or not unit_info:
            continue
        canonical_unit, factor = unit_info
        measurements.append((number * factor, canonical_unit))
    return measurements


def convert_numeric_unit(value: float | int | None, source_unit: str, target_unit: str) -> float | None:
    if value is None:
        return None
    number = parse_number(str(value))
    if number is None:
        return None

    cleaned_unit = normalize_measurement_text(source_unit)
    unit_info = UNIT_TOKEN_MAP.get(cleaned_unit)
    if unit_info:
        canonical_unit, factor = unit_info
        if canonical_unit == target_unit:
            return number * factor

    if cleaned_unit == target_unit:
        return number
    if target_unit == "%" and cleaned_unit == "ppm":
        return number / 10000.0
    if target_unit == "V" and cleaned_unit == "V/sqrtHz":
        return number
    return None


def extract_values_for_unit(text: str, target_units: tuple[str, ...]) -> list[tuple[float, str]]:
    values: list[tuple[float, str]] = []
    for value, canonical_unit in extract_measurements(text):
        if canonical_unit in target_units:
            values.append((value, canonical_unit))
        elif canonical_unit == "ppm" and "%" in target_units:
            values.append((value / 10000.0, "%"))
        elif canonical_unit == "V/sqrtHz" and "V" in target_units:
            values.append((value, "V"))
    return values


def parse_range(text: str) -> tuple[float | None, float | None]:
    numbers = extract_numbers(text)
    if not numbers:
        return None, None
    if len(numbers) == 1:
        return numbers[0], numbers[0]
    return min(numbers[0], numbers[1]), max(numbers[0], numbers[1])


def parse_range_measurement(text: str, target_unit: str) -> tuple[float | None, float | None]:
    values = [item[0] for item in extract_values_for_unit(text, (target_unit,))]
    if len(values) >= 2:
        return min(values[0], values[1]), max(values[0], values[1])
    if len(values) == 1:
        plain = extract_numbers(text)
        if len(plain) >= 2:
            return min(plain[0], plain[1]), max(plain[0], plain[1])
        return values[0], values[0]
    return parse_range(text)


def parse_scalar_measurement(text: str, target_units: tuple[str, ...]) -> tuple[float | None, str | None]:
    values = extract_values_for_unit(text, target_units)
    if values:
        return values[0]
    numbers = extract_numbers(text)
    if not numbers or not target_units:
        return None, None
    return numbers[0], target_units[0]


def format_number(value: float) -> str:
    rounded = round(float(value), 12)
    if abs(rounded) >= 1000 or rounded == 0:
        return f"{rounded:.0f}" if float(rounded).is_integer() else f"{rounded:g}"
    if abs(rounded) >= 100:
        return f"{rounded:.1f}".rstrip("0").rstrip(".")
    if abs(rounded) >= 10:
        return f"{rounded:.2f}".rstrip("0").rstrip(".")
    if abs(rounded) >= 1:
        return f"{rounded:.3f}".rstrip("0").rstrip(".")
    return f"{rounded:.4g}"


def humanize_value(value: float, unit: str) -> str:
    number = float(value)
    if unit in {"C", "%", "dB"}:
        suffix = {"C": "°C", "%": "%", "dB": "dB"}[unit]
        return f"{format_number(number)}{suffix}"

    prefixes = [
        ("G", 1e9),
        ("M", 1e6),
        ("k", 1e3),
        ("", 1.0),
        ("m", 1e-3),
        ("u", 1e-6),
        ("n", 1e-9),
        ("p", 1e-12),
    ]

    if unit in {"V", "A", "Hz", "W"}:
        absolute = abs(number)
        chosen_prefix, chosen_scale = "", 1.0
        for prefix, scale in prefixes:
            scaled = absolute / scale if scale else absolute
            if absolute == 0 or 0.1 <= scaled < 1000:
                chosen_prefix, chosen_scale = prefix, scale
                break
        scaled_value = number / chosen_scale
        return f"{format_number(scaled_value)}{chosen_prefix}{unit}"

    if unit in {"V/us", "V/sqrtHz"}:
        absolute = abs(number)
        chosen_prefix, chosen_scale = "", 1.0
        for prefix, scale in prefixes:
            scaled = absolute / scale if scale else absolute
            if absolute == 0 or 0.1 <= scaled < 1000:
                chosen_prefix, chosen_scale = prefix, scale
                break
        scaled_value = number / chosen_scale
        suffix = unit.replace("V", f"{chosen_prefix}V", 1)
        return f"{format_number(scaled_value)}{suffix}"

    return f"{format_number(number)}{unit}"


def build_numeric_value_text(value: float | None, unit: str | None) -> str:
    if value is None:
        return ""
    if unit:
        return humanize_value(value, unit)
    return format_number(float(value))


def dedupe_text_fragments(items: list[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = clean_text(item)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(cleaned)
    return unique


def summarize_condition_text(text: str) -> str:
    normalized = normalize_measurement_text(text)
    if not normalized:
        return ""

    clauses = [
        clean_text(clause)
        for clause in CONDITION_SPLIT_PATTERN.split(normalized)
        if clean_text(clause)
    ]
    matched = [clause for clause in clauses if CONDITION_HINT_PATTERN.search(clause)]

    if not matched:
        matched = [
            clean_text(match.group(0))
            for pattern in INLINE_CONDITION_PATTERNS
            for match in pattern.finditer(normalized)
        ]

    concise = []
    for clause in dedupe_text_fragments(matched):
        concise.append(clause if len(clause) <= 52 else f"{clause[:51]}…")
        if len(concise) >= 2:
            break
    return "；".join(concise)


def merge_condition_texts(*params: dict | None) -> str:
    items = dedupe_text_fragments(
        [clean_text((param or {}).get("conditionText")) for param in params]
    )
    if not items:
        return ""
    return "；".join(items[:2])


def normalize_param_entry(param_key: str, param: dict | None) -> dict:
    if not param:
        return {}

    canonical_unit = CANONICAL_UNITS.get(param_key)
    normalized = dict(param)
    source_unit = clean_text(param.get("unit"))

    if not canonical_unit or not source_unit:
        return normalized

    converted_any = False
    for field in NUMBER_FIELDS:
        converted = convert_numeric_unit(param.get(field), source_unit, canonical_unit)
        if converted is None:
            continue
        normalized[field] = converted
        converted_any = True

    if converted_any:
        normalized["unit"] = canonical_unit
        preferred_value = next(
            (normalized.get(field) for field in ("valueNumTyp", "valueNum", "valueNumMin", "valueNumMax") if normalized.get(field) is not None),
            None,
        )
        if preferred_value is not None:
            normalized["valueText"] = build_numeric_value_text(preferred_value, canonical_unit)

    return normalized


def detect_package(text: str) -> str:
    normalized = clean_text(text).upper()
    if re.search(r"\bDBV\b", normalized) and re.search(r"\bSOT-?23\b", normalized, re.I):
        return "SOT23-5"
    if re.search(r"(?:\b5\s*(?:-?\s*PIN|引脚|腳).*?\bSOT-?23\b|\bSOT-?23\b.*?\b5\s*(?:-?\s*PIN|引脚|腳))", normalized, re.I):
        return "SOT23-5"
    match = PACKAGE_PATTERN.search(normalized)
    return normalize_package_code(match.group(0)) if match else ""


def detect_interfaces(text: str) -> list[str]:
    hits = [token for token in INTERFACE_TOKENS if re.search(rf"\b{re.escape(token)}\b", text, re.I)]
    return hits


def detect_label_family(label: str, text: str) -> str:
    content = f"{label} {text}"
    for family, patterns in LABEL_RULES:
        if any(re.search(pattern, content, re.I) for pattern in patterns):
            return family
    return ""


def infer_category(payload: dict) -> str:
    corpus = " ".join(
        [
            clean_text(payload.get("title")),
            clean_text(payload.get("fileName")),
            clean_text(payload.get("summary")),
            *(clean_text(item.get("text")) for item in payload.get("pageSnippets", [])),
            *(clean_text(item.get("label")) for item in payload.get("highlights", [])),
            *(clean_text(item.get("text")) for item in payload.get("highlights", [])),
        ]
    ).lower()
    if re.search(r"霍尔|hall", corpus, re.I):
        return "sensor.hall"
    if re.search(r"\bldo\b|线性稳压|低压差", corpus, re.I):
        return "power.ldo"
    if re.search(r"\bbuck\b|降压|dcdc|开关频率", corpus, re.I):
        return "power.dcdc.buck"
    if re.search(r"电平转换|level shifter", corpus, re.I):
        return "interface.level_shifter"
    if re.search(r"运算放大器|\bop amp\b|\bopamp\b", corpus, re.I):
        return "analog.opamp"
    if re.search(r"\bmcu\b|微控制器", corpus, re.I):
        return "mcu.general"
    if re.search(r"温度|temperature", corpus, re.I) and re.search(r"smbus|\bi2c\b|精度|分辨率", corpus, re.I):
        return "sensor.temperature.digital"

    best_category = "sensor.temperature.digital"
    best_score = 0
    for category_id, patterns in CATEGORY_RULES:
        score = sum(1 for pattern in patterns if re.search(pattern, corpus, re.I))
        if score > best_score:
            best_score = score
            best_category = category_id
    return best_category


def upsert_source_param(store: dict[str, dict], key: str, **values: object) -> None:
    current = store.setdefault(key, {"paramKey": key})
    for field, value in values.items():
        if value is None or value == "":
            continue
        current[field] = value


def normalize_source_params(payload: dict, category_id: str) -> list[dict]:
    params: dict[str, dict] = {}
    for highlight in payload.get("highlights", []):
        label = clean_text(highlight.get("label"))
        value_text = clean_text(highlight.get("value") or highlight.get("text"))
        detail_text = clean_text(highlight.get("text"))
        full_text = clean_text(f"{label} {value_text} {detail_text}")
        family = detect_label_family(label, clean_text(f"{label} {value_text}"))
        if not family and not label:
            family = detect_label_family(label, full_text)
        condition_text = summarize_condition_text(detail_text)

        if family == "package":
            package = detect_package(full_text)
            if package:
                upsert_source_param(params, "package", valueText=package)
        elif family == "interface":
            interfaces = detect_interfaces(full_text)
            if interfaces:
                upsert_source_param(params, "interface_type", valueText=",".join(sorted(set(interfaces))))
        elif family in {"supply_voltage", "input_voltage", "logic_voltage", "operating_temp"}:
            canonical_unit = "C" if family == "operating_temp" else "V"
            lower, upper = parse_range_measurement(full_text, canonical_unit)
            prefix = {
                "supply_voltage": "supply_voltage",
                "input_voltage": "input_voltage",
                "logic_voltage": "logic_voltage",
                "operating_temp": "operating_temp",
            }[family]
            if lower is not None:
                upsert_source_param(
                    params,
                    f"{prefix}_min",
                    valueNum=lower,
                    valueNumMin=lower,
                    valueText=build_numeric_value_text(lower, canonical_unit),
                    unit=canonical_unit,
                    conditionText=condition_text,
                )
            if upper is not None:
                upsert_source_param(
                    params,
                    f"{prefix}_max",
                    valueNum=upper,
                    valueNumMax=upper,
                    valueText=build_numeric_value_text(upper, canonical_unit),
                    unit=canonical_unit,
                    conditionText=condition_text,
                )
        elif family == "output_voltage":
            value, unit = parse_scalar_measurement(full_text, ("V",))
            if value is not None:
                upsert_source_param(
                    params,
                    "output_voltage_typ",
                    valueNum=value,
                    valueNumTyp=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "accuracy":
            value, unit = parse_scalar_measurement(full_text, ("%",))
            if value is not None:
                value = abs(value)
                upsert_source_param(
                    params,
                    "accuracy_max",
                    valueNum=value,
                    valueNumMax=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "resolution":
            numbers = extract_numbers(full_text)
            if numbers:
                upsert_source_param(
                    params,
                    "resolution_bits",
                    valueNum=numbers[0],
                    valueText=str(numbers[0]),
                    conditionText=condition_text,
                )
        elif family == "quiescent_current":
            value, unit = parse_scalar_measurement(full_text, ("A",))
            if value is not None:
                upsert_source_param(
                    params,
                    "quiescent_current_typ",
                    valueNum=value,
                    valueNumTyp=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "output_current":
            value, unit = parse_scalar_measurement(full_text, ("A",))
            if value is not None:
                upsert_source_param(
                    params,
                    "output_current_max",
                    valueNum=value,
                    valueNumMax=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "switching_frequency":
            value, unit = parse_scalar_measurement(full_text, ("Hz",))
            if value is not None:
                upsert_source_param(
                    params,
                    "switching_frequency_typ",
                    valueNum=value,
                    valueNumTyp=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "bandwidth":
            value, unit = parse_scalar_measurement(full_text, ("Hz",))
            if value is not None:
                upsert_source_param(
                    params,
                    "bandwidth_typ",
                    valueNum=value,
                    valueNumTyp=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "slew_rate":
            value, unit = parse_scalar_measurement(full_text, ("V/us",))
            if value is not None:
                upsert_source_param(
                    params,
                    "slew_rate_typ",
                    valueNum=value,
                    valueNumTyp=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "output_noise":
            value, unit = parse_scalar_measurement(full_text, ("V", "V/sqrtHz"))
            if value is not None:
                upsert_source_param(
                    params,
                    "output_noise_typ",
                    valueNum=value,
                    valueNumTyp=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "psrr":
            value, unit = parse_scalar_measurement(full_text, ("dB",))
            if value is not None:
                upsert_source_param(
                    params,
                    "psrr_typ",
                    valueNum=value,
                    valueNumTyp=value,
                    valueText=build_numeric_value_text(value, unit),
                    unit=unit,
                    conditionText=condition_text,
                )
        elif family == "channel_count":
            numbers = extract_numbers(full_text)
            if numbers:
                upsert_source_param(
                    params,
                    "channel_count",
                    valueNum=numbers[0],
                    valueText=str(numbers[0]),
                    conditionText=condition_text,
                )
        elif family == "pin_count":
            numbers = extract_numbers(full_text)
            if numbers:
                upsert_source_param(
                    params,
                    "pin_count",
                    valueNum=numbers[0],
                    valueText=str(numbers[0]),
                    conditionText=condition_text,
                )
        elif family == "memory_flash":
            numbers = extract_numbers(full_text)
            if numbers:
                upsert_source_param(
                    params,
                    "memory_flash_kb",
                    valueNum=numbers[0],
                    valueNumMax=numbers[0],
                    valueText=str(numbers[0]),
                    conditionText=condition_text,
                )
        elif family == "memory_ram":
            numbers = extract_numbers(full_text)
            if numbers:
                upsert_source_param(
                    params,
                    "memory_ram_kb",
                    valueNum=numbers[0],
                    valueNumMax=numbers[0],
                    valueText=str(numbers[0]),
                    conditionText=condition_text,
                )

    if "package" not in params:
        package = detect_package(clean_text(payload.get("summary")))
        if package:
            upsert_source_param(params, "package", valueText=package)

    if "interface_type" not in params:
        interfaces = detect_interfaces(clean_text(payload.get("summary")))
        if interfaces:
            upsert_source_param(params, "interface_type", valueText=",".join(sorted(set(interfaces))))

    return list(params.values())


def fetch_templates(connection: sqlite3.Connection, category_id: str) -> list[dict]:
    rows = connection.execute(
        """
        SELECT param_key, weight, required, hard_filter, comparison_mode
        FROM category_templates
        WHERE category_id = ?
        """,
        (category_id,),
    ).fetchall()
    return [
        {
            "paramKey": row[0],
            "weight": float(row[1]),
            "required": bool(row[2]),
            "hardFilter": bool(row[3]),
            "mode": row[4],
        }
        for row in rows
    ]


def fetch_category_name(connection: sqlite3.Connection, category_id: str) -> str:
    row = connection.execute("SELECT name FROM categories WHERE id = ?", (category_id,)).fetchone()
    return row[0] if row else category_id


def fetch_parts(connection: sqlite3.Connection, category_id: str) -> list[dict]:
    rows = connection.execute(
        """
        SELECT id, mpn, brand, package, description, stock_qty, price_min, lifecycle_status
        FROM parts
        WHERE category_id = ? AND is_domestic = 1
        ORDER BY stock_qty DESC, price_min ASC
        """,
        (category_id,),
    ).fetchall()
    parts: list[dict] = []
    for row in rows:
        part_id = row[0]
        param_rows = connection.execute(
            """
            SELECT param_key, value_num, value_num_min, value_num_typ, value_num_max, value_text, unit
            FROM part_params_std
            WHERE part_id = ?
            """,
            (part_id,),
        ).fetchall()
        params = {
            param_row[0]: normalize_param_entry(
                param_row[0],
                {
                    "valueNum": param_row[1],
                    "valueNumMin": param_row[2],
                    "valueNumTyp": param_row[3],
                    "valueNumMax": param_row[4],
                    "valueText": param_row[5],
                    "unit": param_row[6],
                },
            )
            for param_row in param_rows
        }
        parts.append(
            {
                "id": part_id,
                "mpn": row[1],
                "brand": row[2],
                "package": row[3],
                "description": row[4],
                "stockQty": row[5],
                "priceMin": row[6],
                "lifecycleStatus": row[7],
                "params": params,
            }
        )
    return parts


def fetch_package_compatibility(connection: sqlite3.Connection) -> dict[tuple[str, str], str]:
    rows = connection.execute("SELECT package_a, package_b, compatibility_level FROM package_compatibility").fetchall()
    pairs: dict[tuple[str, str], str] = {}
    for package_a, package_b, level in rows:
        pairs[(package_a.upper(), package_b.upper())] = level
        pairs[(package_b.upper(), package_a.upper())] = level
    return pairs


def source_param_map(source_params: list[dict]) -> dict[str, dict]:
    return {item["paramKey"]: item for item in source_params}


def get_numeric(param: dict | None) -> float | None:
    if not param:
        return None
    for key in ("valueNum", "valueNumTyp", "valueNumMin", "valueNumMax"):
        value = param.get(key)
        if value is not None:
            return float(value)
    return None


def format_spec_value(param: dict | None) -> str:
    if not param:
        return ""

    unit = clean_text(param.get("unit"))
    for key in ("valueNumTyp", "valueNum", "valueNumMin", "valueNumMax"):
        value = param.get(key)
        if value is not None:
            return build_numeric_value_text(float(value), unit)
    value_text = clean_text(param.get("valueText"))
    if value_text:
        return value_text
    return ""


def format_range_spec(params: dict[str, dict], min_key: str, max_key: str) -> str:
    lower = format_spec_value(params.get(min_key))
    upper = format_spec_value(params.get(max_key))
    if lower and upper:
        return f"{lower} ~ {upper}"
    return lower or upper


def resolve_spec_label(key: str) -> str:
    return DISPLAY_SPEC_LABELS.get(key) or ADDITIONAL_SPEC_LABELS.get(key) or key


def build_display_specs(params: dict[str, dict], category_id: str, limit: int | None = None) -> list[dict]:
    priority = DISPLAY_SPEC_PRIORITY.get(category_id, DISPLAY_SPEC_PRIORITY["sensor.temperature.digital"])
    specs: list[dict] = []
    consumed_keys: set[str] = set()

    def push_spec(key: str, value: str, condition: str = "") -> bool:
        if not value or any(item["key"] == key for item in specs):
            return False
        specs.append({
            "key": key,
            "label": resolve_spec_label(key),
            "value": value,
            "condition": condition,
        })
        return limit is not None and len(specs) >= limit

    for key in priority:
        value = ""
        condition = ""
        if key == "supply_voltage_range":
            value = format_range_spec(params, "supply_voltage_min", "supply_voltage_max")
            consumed_keys.update({"supply_voltage_min", "supply_voltage_max"})
            condition = merge_condition_texts(params.get("supply_voltage_min"), params.get("supply_voltage_max"))
        elif key == "input_voltage_range":
            value = format_range_spec(params, "input_voltage_min", "input_voltage_max")
            consumed_keys.update({"input_voltage_min", "input_voltage_max"})
            condition = merge_condition_texts(params.get("input_voltage_min"), params.get("input_voltage_max"))
        elif key == "logic_voltage_range":
            value = format_range_spec(params, "logic_voltage_min", "logic_voltage_max")
            consumed_keys.update({"logic_voltage_min", "logic_voltage_max"})
            condition = merge_condition_texts(params.get("logic_voltage_min"), params.get("logic_voltage_max"))
        elif key == "operating_temp_range":
            value = format_range_spec(params, "operating_temp_min", "operating_temp_max")
            consumed_keys.update({"operating_temp_min", "operating_temp_max"})
            condition = merge_condition_texts(params.get("operating_temp_min"), params.get("operating_temp_max"))
        else:
            value = format_spec_value(params.get(key))
            consumed_keys.add(key)
            condition = clean_text((params.get(key) or {}).get("conditionText"))

        if push_spec(key, value, condition):
            return specs

    for raw_key, param in params.items():
        if raw_key in consumed_keys:
            continue
        value = format_spec_value(param)
        condition = clean_text((param or {}).get("conditionText"))
        if push_spec(raw_key, value, condition):
            return specs

    return specs


def build_display_spec_scores(params: dict[str, dict], category_id: str, metric_map: dict[str, float], limit: int | None = None) -> dict[str, int]:
    priority = DISPLAY_SPEC_PRIORITY.get(category_id, DISPLAY_SPEC_PRIORITY["sensor.temperature.digital"])
    scores: dict[str, int] = {}
    consumed_keys: set[str] = set()

    def push_score(key: str, value: str, score: float) -> bool:
        if not value or key in scores:
            return False
        scores[key] = round(max(20.0, min(100.0, score)))
        return limit is not None and len(scores) >= limit

    for key in priority:
        value = ""
        score = 70.0

        if key == "supply_voltage_range":
            value = format_range_spec(params, "supply_voltage_min", "supply_voltage_max")
            consumed_keys.update({"supply_voltage_min", "supply_voltage_max"})
            low = metric_map.get("supply_voltage_min")
            high = metric_map.get("supply_voltage_max")
            present = [item for item in (low, high) if item is not None]
            if present:
                score = sum(present) / len(present)
        elif key == "input_voltage_range":
            value = format_range_spec(params, "input_voltage_min", "input_voltage_max")
            consumed_keys.update({"input_voltage_min", "input_voltage_max"})
            low = metric_map.get("input_voltage_min")
            high = metric_map.get("input_voltage_max")
            present = [item for item in (low, high) if item is not None]
            if present:
                score = sum(present) / len(present)
        elif key == "logic_voltage_range":
            value = format_range_spec(params, "logic_voltage_min", "logic_voltage_max")
            consumed_keys.update({"logic_voltage_min", "logic_voltage_max"})
            low = metric_map.get("logic_voltage_min")
            high = metric_map.get("logic_voltage_max")
            present = [item for item in (low, high) if item is not None]
            if present:
                score = sum(present) / len(present)
        elif key == "operating_temp_range":
            value = format_range_spec(params, "operating_temp_min", "operating_temp_max")
            consumed_keys.update({"operating_temp_min", "operating_temp_max"})
            low = metric_map.get("operating_temp_min")
            high = metric_map.get("operating_temp_max")
            present = [item for item in (low, high) if item is not None]
            if present:
                score = sum(present) / len(present)
        else:
            value = format_spec_value(params.get(key))
            consumed_keys.add(key)
            if metric_map.get(key) is not None:
                score = metric_map[key]

        if push_score(key, value, score):
            return scores

    for raw_key, param in params.items():
        if raw_key in consumed_keys:
            continue
        value = format_spec_value(param)
        score = metric_map.get(raw_key, 70.0)
        if push_score(raw_key, value, score):
            return scores

    return scores


def build_thinking_steps(
    category_name: str,
    source_params: dict[str, dict],
    category_id: str,
    total_parts: int,
    filtered_parts: int,
) -> list[dict]:
    source_specs = build_display_specs(source_params, category_id, limit=5)
    spec_summary = "；".join(
        f"{THINKING_LABELS.get(item['key'], item['label'])} {item['value']}"
        for item in source_specs
    ) or "未稳定提取出足够多的结构化参数"

    return [
        {
            "title": "类别判断",
            "content": f"当前文档按“{category_name}”处理，后续筛选和打分都会优先使用这一类器件模板。",
        },
        {
            "title": "关键参数",
            "content": spec_summary,
        },
        {
            "title": "筛选范围",
            "content": f"知识库中共找到 {total_parts} 个国产器件，经过硬筛后保留 {filtered_parts} 个可比候选。",
        },
        {
            "title": "排序依据",
            "content": "综合参数覆盖、封装兼容、接口兼容、温度余量、供货稳定和成本优势排序。",
        },
    ]


def normalize_package_code(value: str) -> str:
    text = clean_text(value).upper()
    text = re.sub(r"\s+", "", text)
    if text == "DBV":
        return "SOT23-5"
    text = re.sub(r"^SOT-(\d+)", r"SOT\1", text)
    text = re.sub(r"^SOT23-(\d+)$", r"SOT23-\1", text)
    return text


def split_sot_package(value: str) -> tuple[str, str]:
    match = re.fullmatch(r"(SOT\d+)(?:-(\d+))?", value)
    if not match:
        return "", ""
    return match.group(1), match.group(2) or ""


def compare_package(source_package: str, candidate_package: str, compatibility: dict[tuple[str, str], str]) -> float:
    source_package = normalize_package_code(source_package)
    candidate_package = normalize_package_code(candidate_package)
    if not source_package or not candidate_package:
        return 55.0
    if source_package == candidate_package:
        return 100.0
    level = compatibility.get((source_package.upper(), candidate_package.upper()))
    if level == "exact":
        return 100.0
    if level == "partial":
        return 72.0
    source_family, source_pins = split_sot_package(source_package)
    candidate_family, candidate_pins = split_sot_package(candidate_package)
    if source_family and source_family == candidate_family:
        if not source_pins or not candidate_pins:
            return 92.0
        if source_pins == candidate_pins:
            return 100.0
        return 55.0
    return 35.0


def compare_interface(source_text: str, candidate_text: str) -> float:
    if not source_text:
        return 70.0
    source_set = {token.upper() for token in source_text.split(",") if token}
    candidate_set = {token.upper() for token in candidate_text.split(",") if token}
    if not source_set:
        return 70.0
    if source_set.issubset(candidate_set):
        return 100.0
    overlap = len(source_set & candidate_set)
    return max(20.0, 100.0 * overlap / max(len(source_set), 1))


def compare_template(mode: str, key: str, source: dict | None, candidate: dict | None, source_params: dict, candidate_params: dict, compatibility: dict[tuple[str, str], str]) -> float:
    if mode == "package_match":
        source_package = clean_text((source or {}).get("valueText"))
        candidate_package = clean_text((candidate or {}).get("valueText"))
        return compare_package(source_package, candidate_package, compatibility)
    if mode == "interface_match":
        return compare_interface(clean_text((source or {}).get("valueText")), clean_text((candidate or {}).get("valueText")))
    if mode == "contains":
        return compare_interface(clean_text((source or {}).get("valueText")), clean_text((candidate or {}).get("valueText")))

    source_value = get_numeric(source)
    candidate_value = get_numeric(candidate)
    if source_value is None:
        return 70.0
    if candidate_value is None:
        return 35.0

    if mode == "range_cover":
        if key.endswith("_min"):
            return 100.0 if candidate_value <= source_value else max(0.0, 100.0 - (candidate_value - source_value) * 40)
        if key.endswith("_max"):
            return 100.0 if candidate_value >= source_value else max(0.0, 100.0 - (source_value - candidate_value) * 40)
    if mode == "higher_better":
        if candidate_value >= source_value:
            return 100.0
        return max(0.0, 100.0 * candidate_value / max(source_value, 1e-6))
    if mode == "lower_better":
        if candidate_value <= source_value:
            return 100.0
        if key in {"quiescent_current_typ", "output_noise_typ"}:
            ratio = candidate_value / max(source_value, 1e-12)
            penalty = 70.0 if key == "output_noise_typ" else 38.0
            return max(20.0, 100.0 - (ratio - 1.0) * penalty)
        return max(0.0, 100.0 * source_value / max(candidate_value, 1e-6))
    if mode == "voltage_close":
        delta = abs(candidate_value - source_value)
        return max(0.0, 100.0 - delta * 120.0)
    if mode == "equals":
        return 100.0 if abs(candidate_value - source_value) < 0.01 else 40.0
    return 70.0


def passes_hard_filters(templates: list[dict], source_params: dict, candidate_params: dict, compatibility: dict[tuple[str, str], str]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    for template in templates:
        if not template["hardFilter"]:
            continue
        key = template["paramKey"]
        source = source_params.get(key)
        candidate = candidate_params.get(key)
        score = compare_template(template["mode"], key, source, candidate, source_params, candidate_params, compatibility)
        if source and score < 60:
            reasons.append(key)
            return False, reasons
    return True, reasons


def build_reason(template_key: str, source: dict | None, candidate: dict | None) -> str:
    label = CORE_REASON_LABELS.get(template_key, template_key)
    candidate_text = clean_text((candidate or {}).get("valueText"))
    if template_key in {"operating_temp_min", "operating_temp_max"}:
        return f"{label}覆盖 {candidate_text or '目标范围'}"
    if template_key.endswith("_voltage_min") or template_key.endswith("_voltage_max"):
        return f"{label}满足 {candidate_text or '电压条件'}"
    if template_key == "interface_type":
        return f"接口兼容 {candidate_text or '当前协议'}"
    if template_key == "package":
        return f"封装参考 {candidate_text or '当前封装'}"
    return f"{label}匹配 {candidate_text or clean_text((source or {}).get('valueText'))}"


def score_candidate(part: dict, templates: list[dict], source_params: dict, compatibility: dict[tuple[str, str], str], price_bounds: tuple[float, float], category_id: str) -> dict:
    weighted_score = 0.0
    total_weight = 0.0
    reasons: list[str] = []
    risks: list[str] = []
    metric_map: dict[str, float] = {}

    for template in templates:
        key = template["paramKey"]
        source = source_params.get(key)
        candidate = part["params"].get(key)
        score = compare_template(template["mode"], key, source, candidate, source_params, part["params"], compatibility)
        weighted_score += score * template["weight"]
        total_weight += template["weight"]
        if source and score >= 82 and len(reasons) < 4:
            reasons.append(build_reason(key, source, candidate))
        if source and score < 60:
            risks.append(f"{CORE_REASON_LABELS.get(key, key)}需要人工复核")
        metric_map[key] = score

    fit_score = weighted_score / total_weight if total_weight else 65.0
    package_score = compare_template("package_match", "package", source_params.get("package"), part["params"].get("package"), source_params, part["params"], compatibility)
    interface_score = compare_template("interface_match", "interface_type", source_params.get("interface_type"), part["params"].get("interface_type"), source_params, part["params"], compatibility)

    thermal_min = compare_template("range_cover", "operating_temp_min", source_params.get("operating_temp_min"), part["params"].get("operating_temp_min"), source_params, part["params"], compatibility)
    thermal_max = compare_template("range_cover", "operating_temp_max", source_params.get("operating_temp_max"), part["params"].get("operating_temp_max"), source_params, part["params"], compatibility)
    thermal_score = (thermal_min + thermal_max) / 2

    stock = float(part.get("stockQty") or 0)
    lifecycle = clean_text(part.get("lifecycleStatus")).upper()
    supply_score = min(100.0, 55.0 + math.log10(stock + 1) * 12.0 + (10.0 if lifecycle == "ACTIVE" else 0.0))

    min_price, max_price = price_bounds
    price = float(part.get("priceMin") or 0)
    if max_price > min_price and price > 0:
        cost_score = 100.0 - ((price - min_price) / (max_price - min_price)) * 45.0
    else:
        cost_score = 72.0
    cost_score = max(35.0, min(100.0, cost_score))

    if category_id == "power.ldo":
        total_score = fit_score * 0.72 + package_score * 0.12 + thermal_score * 0.08 + supply_score * 0.04 + cost_score * 0.04
    else:
        total_score = fit_score * 0.4 + package_score * 0.2 + interface_score * 0.15 + thermal_score * 0.1 + supply_score * 0.1 + cost_score * 0.05
    if not reasons:
        reasons.append("参数维度有一定重合，建议结合原理图继续复核")
    if not risks:
        risks.append("当前知识库为初始种子库，推荐前建议交叉核对 datasheet")

    chips = [
        clean_text(part["params"].get("package", {}).get("valueText") or part.get("package")),
        clean_text(part["params"].get("interface_type", {}).get("valueText")),
        f"库存 {int(stock)}",
    ]

    return {
        "id": part["id"],
        "partId": part["id"],
        "name": part["mpn"],
        "vendor": part["brand"],
        "positioning": part["description"],
        "chips": [item for item in chips if item],
        "note": "；".join(risks[:2]),
        "reasons": reasons[:4],
        "risks": risks[:3],
        "scores": {
            "fit": round(fit_score),
            "package": round(package_score),
            "interface": round(interface_score),
            "thermal": round(thermal_score),
            "supply": round(supply_score),
            "cost": round(cost_score),
        },
        "specs": build_display_specs(part["params"], category_id),
        "specScores": build_display_spec_scores(part["params"], category_id, metric_map),
        "totalScore": round(total_score),
        "package": part.get("package", ""),
        "priceMin": part.get("priceMin", 0),
        "stockQty": int(stock),
    }


def build_response(connection: sqlite3.Connection, payload: dict) -> dict:
    category_id = infer_category(payload)
    category_name = fetch_category_name(connection, category_id)
    source_params_list = normalize_source_params(payload, category_id)
    source_params = source_param_map(source_params_list)
    templates = fetch_templates(connection, category_id)
    compatibility = fetch_package_compatibility(connection)
    parts = fetch_parts(connection, category_id)
    thinking = build_thinking_steps(category_name, source_params, category_id, len(parts), 0)
    if not parts:
        return {
            "ok": True,
            "sourceCategory": {"id": category_id, "label": category_name},
            "normalizedParams": source_params_list,
            "referenceSpecs": build_display_specs(source_params, category_id),
            "referenceSpecScores": {item["key"]: 100 for item in build_display_specs(source_params, category_id)},
            "baselineScores": {"fit": 100, "package": 100, "interface": 100, "thermal": 100, "supply": 86, "cost": 60},
            "thinking": thinking,
            "candidates": [],
        }

    candidates: list[dict] = []
    for part in parts:
        allowed, _reasons = passes_hard_filters(templates, source_params, part["params"], compatibility)
        if not allowed:
            continue
        candidates.append(part)

    if not candidates:
        candidates = parts

    thinking = build_thinking_steps(category_name, source_params, category_id, len(parts), len(candidates))

    prices = [float(item.get("priceMin") or 0) for item in candidates if float(item.get("priceMin") or 0) > 0]
    price_bounds = (min(prices), max(prices)) if prices else (0.0, 0.0)
    scored = [score_candidate(part, templates, source_params, compatibility, price_bounds, category_id) for part in candidates]
    scored.sort(key=lambda item: (-item["totalScore"], item["priceMin"]))

    for index, item in enumerate(scored[:5], start=1):
        item["rank"] = index

    return {
        "ok": True,
        "sourceCategory": {"id": category_id, "label": category_name},
        "normalizedParams": source_params_list,
        "referenceSpecs": build_display_specs(source_params, category_id),
        "referenceSpecScores": {item["key"]: 100 for item in build_display_specs(source_params, category_id)},
        "baselineScores": {"fit": 100, "package": 100, "interface": 100, "thermal": 100, "supply": 86, "cost": 60},
        "thinking": thinking,
        "candidates": scored[:5],
    }


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data" / "recommendation" / "parts_knowledge.db"
    raw_input = sys.stdin.buffer.read()
    payload = json.loads(raw_input.decode("utf-8") if raw_input else "{}")

    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        result = build_response(connection, payload)

    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
