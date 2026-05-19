import json
import math
import os
import re
import sys

import fitz


RANGE_JOINER = re.compile(r"(?:to|~|〜|-|–|—|至)", re.I)
TABLE_SIGNAL_PATTERN = re.compile(r"[:：]|\t| {2,}|(?:^|[\s(])[-−–—]\d")
MARKETING_NOISE_PATTERN = re.compile(
    r"(典型应用|应用示例|布局建议|参考设计|曲线|波形|图表|figure|legend|block diagram|functional block|application diagram|封装信息|订货信息)",
    re.I,
)
SPEC_SECTION_PATTERN = re.compile(
    r"(electrical characteristics|recommended operating conditions|absolute maximum ratings|thermal characteristics|thermal information|switching characteristics|specifications|参数说明|规格参数|主要参数|电气特性|推荐工作条件|绝对最大额定值|热特性|开关特性)",
    re.I,
)
SPEC_HEADER_PATTERN = re.compile(
    r"(parameter|symbol|min|typ|max|unit|conditions?|参数|符号|最小值|典型值|最大值|单位|条件)",
    re.I,
)
PARAMETER_VALUE_HINT = re.compile(
    r"(?:°C|℃|\bV\b|mV|nA|uA|μA|mA|\bA\b|nW|uW|μW|mW|\bW\b|Hz|kHz|MHz|GHz|%|ppm|LSB|bit|bits|位|SOT-?\d+|SOIC-?\d+|TSSOP-?\d+|MSOP-?\d+|QFN-?\d+|DFN-?\d+|X2SON-?\d*|TO-?\d+|SMBus|I2C|SPI|UART)",
    re.I,
)
ASSIGNMENT_PATTERN = re.compile(r"\b(?:vin|vout|fsw|ta|tj)\s*=\s*[-+]?\d", re.I)
PACKAGE_CONTEXT_NOISE_PATTERN = re.compile(
    r"(?:thermal pad|connect to gnd|leave floating|no internal electrical connection|bottom view|top view|pin functions?|land pattern|layout example|recommended layout|solder(?:ed)?|printed circuit board)",
    re.I,
)
VOLTAGE_CONTEXT_NOISE_PATTERN = re.compile(
    r"(?:dropout|voutpulled|below the nominal|lessor of|lesser of|absolute maximum|abs max|hbm|esd)",
    re.I,
)
FREQUENCY_CONTEXT_NOISE_PATTERN = re.compile(
    r"(?:cut-?off frequency|psrr|noise)",
    re.I,
)
TEXT_EXPLANATION_NOISE_PATTERN = re.compile(
    r"(?:unless otherwise stated|unless otherwise noted|typical values? represent|most likely parametric norm|guard band)",
    re.I,
)
TEST_CONDITION_PATTERN = re.compile(
    r"(?:ta\s*=\s*25\s*(?:°C|℃|C)|tj\s*=\s*25\s*(?:°C|℃|C)|unless otherwise noted|test conditions|vin\s*=|vout\s*=|iout\s*=|cin\s*=|cout\s*=)",
    re.I,
)
TOC_HEADER_PATTERN = re.compile(r"^(?:内容|目录|contents?)$", re.I)
TOC_LINE_PATTERN = re.compile(r"^(?:\d+(?:\.\d+)*\s*)?.{2,140}(?:\.{4,}|…{2,}|·{4,})\s*\d+\s*$")
REVISION_NOISE_PATTERN = re.compile(
    r"(copyright|product folder links|english data sheet|submission feedback|提交文档反馈|www\.)",
    re.I,
)
PACKAGE_DRAWING_PATTERN = re.compile(
    r"(package materials information|package outline|land pattern|solder mask|plastic small outline|exposed metal|opening,\s*typ|all around|pack materials-page|scale:\s*\d+|package drawing)",
    re.I,
)
GENERIC_NOISE_LABEL_PATTERN = re.compile(
    r"^(?:parameter|notes?|scale|device|package(?: drawing)?|length|width|height|unit|conditions?|symbol|table|figure)$",
    re.I,
)
PIN_NAME_PATTERN_TEXT = (
    r"(?:V\+|V-|VIN|VOUT|VDD|VCC|GND|IN|OUT|EN|CE|N/C|NC|FB|PG|SCL|SDA|"
    r"ALERT|ADD0|ADDR|BYPASS|NR|ADJ|SET|SS|SW|BOOT|LX|COMP|CS|RT|SYNC|"
    r"MODE|PGND|AGND|EP|PAD)"
)
PIN_ID_PATTERN_TEXT = r"(?:\d{1,2}|[A-Z]\d{1,2})"
PIN_CONTEXT_PATTERN = re.compile(
    r"(?:pin\s*(?:configuration|functions?|description|assignment|diagram)|"
    r"terminal functions?|top view|bottom view|\u5f15\u811a|\u7ba1\u811a|"
    r"\u9876\u89c6\u56fe|\u5e95\u89c6\u56fe)",
    re.I,
)
PIN_PACKAGE_PATTERN = re.compile(
    r"(?<![A-Za-z0-9])(?:SOT-?\d+|X2SON-?\d*|DFN-?\d+|QFN-?\d+|WSON-?\d+|DBV|DQN|DRL|DPW)(?![A-Za-z0-9])",
    re.I,
)
PIN_ASSIGNMENT_PATTERNS = [
    re.compile(rf"\b(?P<pin>{PIN_ID_PATTERN_TEXT})\s*[-:：]?\s*(?P<name>{PIN_NAME_PATTERN_TEXT})\b", re.I),
    re.compile(rf"\b(?P<name>{PIN_NAME_PATTERN_TEXT})\s*[-:：]?\s*(?P<pin>{PIN_ID_PATTERN_TEXT})\b", re.I),
]
PIN_TOKEN_PATTERN = re.compile(
    rf"(?<![A-Za-z0-9])(?P<name>{PIN_NAME_PATTERN_TEXT})(?![A-Za-z0-9])|"
    rf"(?<![A-Za-z0-9.])(?P<pin>{PIN_ID_PATTERN_TEXT})(?![A-Za-z0-9.])",
    re.I,
)
PIN_LAYOUT_TOKEN_ONLY_PATTERN = re.compile(rf"^(?:{PIN_NAME_PATTERN_TEXT}|{PIN_ID_PATTERN_TEXT})$", re.I)


def bounded_pattern(source):
    return re.compile(rf"(?<![A-Za-z0-9])(?:{source})(?![A-Za-z0-9])", re.I)


NUMBER_PATTERN = r"[-+]?\d+(?:\.\d+)?"
RANGE_VALUE_PATTERN = rf"{NUMBER_PATTERN}\s*(?:to|~|〜|-|–|—|至)\s*{NUMBER_PATTERN}"
RANGE_SEPARATOR_PATTERN = r"(?:to|~|〜|-|–|—|至)"
TEMP_RANGE_PATTERNS = [
    bounded_pattern(
        rf"{NUMBER_PATTERN}\s*(?:°C|℃|C)\s*{RANGE_SEPARATOR_PATTERN}\s*{NUMBER_PATTERN}\s*(?:°C|℃|C)"
    ),
    bounded_pattern(
        rf"{NUMBER_PATTERN}\s*{RANGE_SEPARATOR_PATTERN}\s*{NUMBER_PATTERN}\s*(?:°C|℃|C)"
    ),
]
VOLTAGE_RANGE_PATTERNS = [
    bounded_pattern(
        rf"{NUMBER_PATTERN}\s*(?:mV|V)\s*{RANGE_SEPARATOR_PATTERN}\s*{NUMBER_PATTERN}\s*(?:mV|V)"
    ),
    bounded_pattern(
        rf"{NUMBER_PATTERN}\s*{RANGE_SEPARATOR_PATTERN}\s*{NUMBER_PATTERN}\s*(?:mV|V)"
    ),
]
GENERIC_VALUE_PATTERNS = [
    *TEMP_RANGE_PATTERNS,
    *VOLTAGE_RANGE_PATTERNS,
    bounded_pattern(
        rf"{RANGE_VALUE_PATTERN}\s*(?:°C|℃|C|mV|V|nA|uA|μA|mA|A|nW|uW|μW|mW|W|Hz|kHz|MHz|GHz|%|ppm|LSB)"
    ),
    bounded_pattern(
        rf"(?:±\s*)?{NUMBER_PATTERN}\s*(?:°C|℃|C|mV|V|nA|uA|μA|mA|A|nW|uW|μW|mW|W|Hz|kHz|MHz|GHz|%|ppm|LSB|bit|bits|位)"
    ),
    re.compile(r"\b(?:SOT-?\d+|SOIC-?\d+|TSSOP-?\d+|MSOP-?\d+|QFN-?\d+|DFN-?\d+|BGA|X2SON-?\d*|TO-?\d+)\b", re.I),
    re.compile(r"\b(?:I2C|SPI|UART|SMBus|PWM)\b", re.I),
]


PARAMETER_DEFINITIONS = [
    {
        "id": "working_temperature",
        "label": "Working temperature",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [
                r"工作温度",
                r"温度范围",
                r"operating temperature",
                r"working temperature",
                r"ambient temperature",
                r"junction temperature",
                r"\bta\b",
                r"\btj\b",
            ]
        ],
        "value_patterns": TEMP_RANGE_PATTERNS,
    },
    {
        "id": "input_voltage",
        "label": "Input voltage",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"输入电压", r"input voltage", r"input range", r"wide input"]
        ],
        "value_patterns": [
            *VOLTAGE_RANGE_PATTERNS,
            bounded_pattern(r"\d+(?:\.\d+)?\s*(?:mV|V)\b"),
        ],
    },
    {
        "id": "supply_voltage",
        "label": "Supply voltage",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [
                r"工作电压",
                r"供电电压",
                r"电源电压",
                r"supply voltage",
                r"operating voltage",
                r"\bvdd\b",
                r"\bvcc\b",
            ]
        ],
        "value_patterns": [
            *VOLTAGE_RANGE_PATTERNS,
            bounded_pattern(r"\d+(?:\.\d+)?\s*(?:mV|V)\b"),
        ],
    },
    {
        "id": "output_voltage",
        "label": "Output voltage",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"输出电压", r"output voltage", r"regulated output"]
        ],
        "value_patterns": [
            *VOLTAGE_RANGE_PATTERNS,
            bounded_pattern(r"\d+(?:\.\d+)?\s*(?:mV|V)\b"),
        ],
    },
    {
        "id": "current",
        "label": "Current",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"工作电流", r"静态电流", r"电源电流", r"supply current", r"quiescent current"]
        ],
        "value_patterns": [bounded_pattern(r"\d+(?:\.\d+)?\s*(?:nA|uA|μA|mA|A)\b")],
    },
    {
        "id": "output_current",
        "label": "Output current",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"输出电流", r"output current", r"load current", r"current limit"]
        ],
        "value_patterns": [bounded_pattern(r"\d+(?:\.\d+)?\s*(?:nA|uA|μA|mA|A)\b")],
    },
    {
        "id": "power",
        "label": "Power",
        "keywords": [re.compile(pattern, re.I) for pattern in [r"功耗", r"功率", r"power consumption", r"\bpower\b"]],
        "value_patterns": [bounded_pattern(r"\d+(?:\.\d+)?\s*(?:nW|uW|μW|mW|W)\b")],
    },
    {
        "id": "noise",
        "label": "Noise",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [
                r"噪声",
                r"声噪",
                r"输出噪声",
                r"低噪声",
                r"\bnoise\b",
                r"low noise",
                r"output noise",
                r"voltage noise",
            ]
        ],
        "value_patterns": [
            re.compile(
                r"\b\d+(?:\.\d+)?\s*(?:nV|uV|μV|mV)(?:\s*/\s*(?:√\s*)?Hz|\s*rms)?\b",
                re.I,
            )
        ],
    },
    {
        "id": "psrr",
        "label": "PSRR",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"\bpsrr\b", r"电源抑制比", r"power supply rejection"]
        ],
        "value_patterns": [bounded_pattern(r"\d+(?:\.\d+)?\s*dB\b")],
    },
    {
        "id": "dropout_voltage",
        "label": "Dropout voltage",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"压差", r"压降", r"dropout voltage", r"\bdropout\b"]
        ],
        "value_patterns": [
            bounded_pattern(r"\d+(?:\.\d+)?\s*(?:mV|V)\b"),
        ],
    },
    {
        "id": "reference_voltage",
        "label": "Reference voltage",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"基准电压", r"参考电压", r"reference voltage"]
        ],
        "value_patterns": [
            bounded_pattern(r"\d+(?:\.\d+)?\s*(?:mV|V)\b"),
        ],
    },
    {
        "id": "accuracy",
        "label": "Accuracy",
        "keywords": [re.compile(pattern, re.I) for pattern in [r"精度", r"accuracy", r"误差", r"tolerance"]],
        "value_patterns": [bounded_pattern(r"(?:±\s*)?\d+(?:\.\d+)?\s*(?:°C|℃|%|ppm|LSB)\b")],
    },
    {
        "id": "resolution",
        "label": "Resolution",
        "keywords": [re.compile(pattern, re.I) for pattern in [r"分辨率", r"resolution"]],
        "value_patterns": [bounded_pattern(r"\d+\s*(?:bit|bits|位)\b")],
    },
    {
        "id": "frequency",
        "label": "Frequency",
        "keywords": [
            re.compile(pattern, re.I)
            for pattern in [r"开关频率", r"频率", r"switching frequency", r"frequency"]
        ],
        "value_patterns": [bounded_pattern(r"\d+(?:\.\d+)?\s*(?:Hz|kHz|MHz|GHz)\b")],
    },
    {
        "id": "efficiency",
        "label": "Efficiency",
        "keywords": [re.compile(pattern, re.I) for pattern in [r"效率", r"efficiency"]],
        "value_patterns": [bounded_pattern(r"\d+(?:\.\d+)?\s*%")],
    },
    {
        "id": "package",
        "label": "Package",
        "keywords": [re.compile(pattern, re.I) for pattern in [r"封装", r"package"]],
        "value_patterns": [re.compile(r"\b(?:SOT-?\d+|SOIC-?\d+|TSSOP-?\d+|MSOP-?\d+|QFN-?\d+|DFN-?\d+|BGA|X2SON-?\d*|TO-?\d+)\b", re.I)],
    },
    {
        "id": "interface",
        "label": "Interface",
        "keywords": [re.compile(pattern, re.I) for pattern in [r"接口", r"interface", r"\bi2c\b", r"\bspi\b", r"\buart\b", r"\bsmbus\b"]],
        "value_patterns": [re.compile(r"\b(?:I2C|SPI|UART|SMBus|PWM)\b", re.I)],
    },
]

VALUE_ONLY_PARAMETER_IDS = {"package", "interface"}


def clean_text(value):
    normalized = (
        (value or "")
        .replace("\x00", " ")
        .replace("–", "-")
        .replace("—", "-")
        .replace("−", "-")
    )
    return re.sub(r"\s+", " ", normalized).strip()


def extract_raw_block_text(block):
    parts = []
    for line in block.get("lines", []):
        for span in line.get("spans", []):
            text = clean_text(span.get("text", ""))
            if text:
                parts.append(text)
    return clean_text(" ".join(parts))


def normalize_pin_token(value):
    return re.sub(r"\s+", "", (value or "").upper()).replace("/", "")


def extract_pinout_assignments(text):
    cleaned = clean_text(text)
    tokens = []

    for match in PIN_TOKEN_PATTERN.finditer(cleaned):
        kind = "name" if match.group("name") else "pin"
        tokens.append((match.start(), match.end(), kind, normalize_pin_token(match.group(0))))

    assignments = []
    seen = set()
    index = 0

    while index + 1 < len(tokens):
        first_start, first_end, first_kind, first_value = tokens[index]
        second_start, _second_end, second_kind, second_value = tokens[index + 1]
        separator = cleaned[first_end:second_start]

        if len(separator) > 12 or re.search(r"[=<>]", separator):
            index += 1
            continue

        if first_kind == "pin" and second_kind == "name":
            pin = first_value
            name = second_value
        elif first_kind == "name" and second_kind == "pin":
            pin = second_value
            name = first_value
        else:
            index += 1
            continue

        key = (pin, name)
        if key not in seen:
            seen.add(key)
            assignments.append((pin, name))
        index += 2

    return assignments


def extract_pinout_value(text):
    cleaned = clean_text(text)
    assignments = extract_pinout_assignments(cleaned)
    has_context = bool(PIN_CONTEXT_PATTERN.search(cleaned))

    if not has_context or len(assignments) < 2:
        return ""

    packages = []
    for match in PIN_PACKAGE_PATTERN.finditer(cleaned):
        package = normalize_pin_token(match.group(0))
        if package not in packages:
            packages.append(package)
        if len(packages) >= 2:
            break

    pin_text = ", ".join(f"{pin}={name}" for pin, name in assignments[:12])
    if packages:
        return f"{' / '.join(packages)}: {pin_text}"
    return pin_text


def build_pinout_excerpt(text, max_chars=420):
    cleaned = clean_text(text)
    if len(cleaned) <= max_chars:
        return cleaned

    first_match = None
    for pattern in PIN_ASSIGNMENT_PATTERNS:
        match = pattern.search(cleaned)
        if match and (first_match is None or match.start() < first_match.start()):
            first_match = match

    if not first_match:
        return cleaned[:max_chars].strip()

    start = max(0, first_match.start() - 120)
    return cleaned[start : start + max_chars].strip()


def rect_center(rect):
    x0, y0, x1, y1 = rect
    return ((x0 + x1) / 2, (y0 + y1) / 2)


def rect_center_in_region(rect, region):
    center_x, center_y = rect_center(rect)
    x0, y0, x1, y1 = region
    return x0 <= center_x <= x1 and y0 <= center_y <= y1


def collect_pin_tokens_from_blocks(blocks, region=None):
    tokens = []
    for block in blocks:
        for line in block.get("lines", []):
            for segment in line.get("segments", []):
                segment_text = clean_text(segment.get("text", ""))
                segment_rect = segment.get("bbox")
                if not segment_text or not segment_rect:
                    continue
                if region and not rect_center_in_region(segment_rect, region):
                    continue
                for match in PIN_TOKEN_PATTERN.finditer(segment_text):
                    tokens.append(
                        {
                            "kind": "name" if match.group("name") else "pin",
                            "value": normalize_pin_token(match.group(0)),
                            "bbox": segment_rect,
                            "center": rect_center(segment_rect),
                            "sourceId": line.get("id", ""),
                        }
                    )
    return tokens


def sort_pin_key(pin):
    if re.fullmatch(r"\d{1,2}", pin or ""):
        return (0, int(pin), "")
    match = re.fullmatch(r"([A-Z]+)(\d{1,2})", pin or "")
    if match:
        return (1, int(match.group(2)), match.group(1))
    return (2, 999, pin or "")


def format_pinout_from_layout_tokens(tokens, caption_text=""):
    pin_tokens = [item for item in tokens if item["kind"] == "pin"]
    name_tokens = [item for item in tokens if item["kind"] == "name"]
    pairs = []
    seen = set()

    for pin_token in pin_tokens:
        pin_x, pin_y = pin_token["center"]
        best = None
        for name_token in name_tokens:
            name_x, name_y = name_token["center"]
            delta_y = abs(pin_y - name_y)
            delta_x = abs(pin_x - name_x)
            if delta_y > 12 or delta_x > 135:
                continue
            score = delta_y * 4 + delta_x
            if best is None or score < best[0]:
                best = (score, name_token)

        if not best:
            continue

        key = (pin_token["value"], best[1]["value"])
        if key in seen:
            continue
        seen.add(key)
        pairs.append(key)

    if len(pairs) < 2:
        return ""

    packages = []
    for match in PIN_PACKAGE_PATTERN.finditer(clean_text(caption_text)):
        package = normalize_pin_token(match.group(0))
        if package not in packages:
            packages.append(package)

    pair_text = ", ".join(f"{pin}={name}" for pin, name in sorted(pairs, key=lambda item: sort_pin_key(item[0]))[:12])
    return f"{' / '.join(packages[:2])}: {pair_text}" if packages else pair_text


def build_layout_pinout_groups(ordered_blocks):
    groups = []
    for block in ordered_blocks:
        caption_text = clean_text(block.get("text", ""))
        if not re.search(r"(?:\bfig(?:ure)?\b|\u56fe)", caption_text, re.I):
            continue
        if not PIN_CONTEXT_PATTERN.search(caption_text) or not PIN_PACKAGE_PATTERN.search(caption_text):
            continue

        x0, y0, x1, y1 = block["bbox"]
        region = (
            max(0, x0 - 110),
            max(0, y0 - 120),
            x1 + 110,
            y1 + 35,
        )
        region_blocks = [
            item
            for item in ordered_blocks
            if item.get("bbox") and rect_center_in_region(item["bbox"], region)
        ]
        tokens = collect_pin_tokens_from_blocks(region_blocks, region)
        value = format_pinout_from_layout_tokens(tokens, caption_text)
        if not value:
            continue
        score = 48 if re.search(r"(?<![A-Za-z0-9])(?:DBV|SOT-?23)(?![A-Za-z0-9])", value, re.I) else 44

        rects = [item["bbox"] for item in region_blocks if item.get("bbox")]
        source_ids = [
            line["id"]
            for item in region_blocks
            for line in item.get("lines", [])
            if line.get("id")
        ]
        text = clean_text("\n".join(item.get("text", "") for item in region_blocks))
        groups.append(
            {
                "value": value,
                "text": build_pinout_excerpt(text),
                "rect": merge_rects(rects) if rects else block["bbox"],
                "sourceIds": source_ids[:24],
                "score": score,
                "columnId": block.get("column_id", 0),
                "blockId": block["id"],
            }
        )

    return groups


def is_cjk(char):
    return bool(re.search(r"[\u3400-\u9fff]", char or ""))


def join_spans(spans):
    parts = []
    previous_end = None

    for span in spans:
        text = clean_text(span.get("text", ""))
        bbox = span.get("bbox") or (0, 0, 0, 0)
        x0, _, x1, y1 = bbox
        if not text:
            continue
        if not parts:
            parts.append(text)
            previous_end = x1
            continue
        gap = x0 - (previous_end or x0)
        previous_char = parts[-1][-1] if parts[-1] else ""
        next_char = text[0]
        needs_space = gap > max(2.5, (y1 - bbox[1]) * 0.18) and not (is_cjk(previous_char) and is_cjk(next_char))
        if needs_space:
            parts.append(" ")
        parts.append(text)
        previous_end = x1

    return clean_text("".join(parts))


def rect_to_dict(rect):
    x0, y0, x1, y1 = rect
    return {
        "x": round(float(x0), 2),
        "y": round(float(y0), 2),
        "width": round(max(float(x1 - x0), 1.0), 2),
        "height": round(max(float(y1 - y0), 1.0), 2),
    }


def merge_rects(rects):
    valid = [rect for rect in rects if rect]
    if not valid:
        return None
    x0 = min(rect[0] for rect in valid)
    y0 = min(rect[1] for rect in valid)
    x1 = max(rect[2] for rect in valid)
    y1 = max(rect[3] for rect in valid)
    return (x0, y0, x1, y1)


def looks_like_toc_line(text):
    normalized = clean_text(text)
    if not normalized:
        return False

    if TOC_LINE_PATTERN.search(normalized):
        return True

    dotted = normalized.count(".") + normalized.count("…") + normalized.count("·")
    return dotted >= 8 and bool(re.search(r"\d+\s*$", normalized))


def classify_page(lines):
    page_lines = [clean_text(line) for line in lines if clean_text(line)]
    if not page_lines:
        return {
            "is_toc_page": False,
            "is_package_page": False,
        }

    first_window = page_lines[:40]
    toc_header_hits = sum(1 for line in page_lines[:8] if TOC_HEADER_PATTERN.search(line))
    toc_line_hits = sum(1 for line in first_window if looks_like_toc_line(line))
    package_hits = sum(1 for line in first_window if PACKAGE_DRAWING_PATTERN.search(line))

    return {
        "is_toc_page": toc_header_hits > 0 or toc_line_hits >= 6,
        "is_package_page": package_hits >= 3,
    }


def build_focus_rect(segments, definition, label_hint, value_hint, fallback_rect):
    if not segments:
        return fallback_rect

    normalized_label = clean_text(label_hint).lower()
    normalized_value = clean_text(value_hint).lower()
    matched_rects = []

    for segment in segments:
        segment_text = clean_text(segment.get("text", ""))
        segment_rect = segment.get("bbox")

        if not segment_text or not segment_rect:
            continue

        lower_text = segment_text.lower()
        should_include = False

        if normalized_value and (normalized_value in lower_text or lower_text in normalized_value):
            should_include = True

        if definition and any(keyword.search(segment_text) for keyword in definition["keywords"]):
            should_include = True

        if definition and any(pattern.search(segment_text) for pattern in definition["value_patterns"]):
            should_include = True

        if normalized_label and normalized_label not in {"parameter", "参数"} and normalized_label in lower_text:
            should_include = True

        if should_include:
            matched_rects.append(segment_rect)

    if not matched_rects and normalized_value:
        for segment in segments:
            segment_text = clean_text(segment.get("text", ""))
            segment_rect = segment.get("bbox")
            if segment_text and segment_rect and PARAMETER_VALUE_HINT.search(segment_text):
                matched_rects.append(segment_rect)

    return merge_rects(matched_rects) or fallback_rect


def estimate_column_boundary(blocks, page_width):
    if page_width <= 0 or len(blocks) < 6:
        return None

    centers = []
    for block in blocks:
        x0, _, x1, _ = block["bbox"]
        width = x1 - x0
        center = x0 + width / 2
        if width < 20 or width > page_width * 0.6:
            continue
        if center <= page_width * 0.12 or center >= page_width * 0.88:
            continue
        centers.append(center)

    centers.sort()
    if len(centers) < 6:
        return None

    best_gap = 0
    best_boundary = None
    for index in range(1, len(centers)):
        previous = centers[index - 1]
        current = centers[index]
        gap = current - previous
        boundary = previous + gap / 2
        left_count = index
        right_count = len(centers) - index
        if boundary < page_width * 0.3 or boundary > page_width * 0.7:
            continue
        if left_count < 2 or right_count < 2:
            continue
        if gap > best_gap:
            best_gap = gap
            best_boundary = boundary

    return best_boundary if best_gap >= page_width * 0.06 else None


def build_pages(document):
    pages = []
    all_candidates = []
    global_candidate_index = 1

    for page_index in range(document.page_count):
        page = document.load_page(page_index)
        page_dict = page.get_text("dict", sort=False)
        page_width = float(page.rect.width)
        page_height = float(page.rect.height)

        raw_blocks = []
        for raw_index, block in enumerate(page_dict.get("blocks", [])):
            if block.get("type") != 0:
                continue

            bbox = tuple(block.get("bbox", (0, 0, 0, 0)))
            raw_block_text = extract_raw_block_text(block)
            is_pin_layout_token = bool(PIN_LAYOUT_TOKEN_ONLY_PATTERN.fullmatch(raw_block_text))
            if (bbox[2] - bbox[0] < 8 or bbox[3] - bbox[1] < 6) and not is_pin_layout_token:
                continue

            lines = []
            for line_index, line in enumerate(block.get("lines", [])):
                spans = sorted(line.get("spans", []), key=lambda item: item.get("bbox", [0, 0, 0, 0])[0])
                text = join_spans(spans)
                if not text:
                    continue
                line_bbox = tuple(line.get("bbox", bbox))
                segments = [
                    {
                        "text": clean_text(span.get("text", "")),
                        "bbox": tuple(span.get("bbox", line_bbox)),
                    }
                    for span in spans
                    if clean_text(span.get("text", ""))
                ]
                lines.append(
                    {
                        "id": f"p{page_index + 1}-b{raw_index}-l{line_index}",
                        "text": text,
                        "bbox": line_bbox,
                        "segments": segments,
                    }
                )

            if not lines:
                continue

            block_text = "\n".join(line["text"] for line in lines)
            raw_blocks.append(
                {
                    "id": f"p{page_index + 1}-b{raw_index}",
                    "bbox": bbox,
                    "lines": lines,
                    "text": block_text,
                }
            )

        boundary = estimate_column_boundary(raw_blocks, page_width)

        for block in raw_blocks:
            x0, _, x1, _ = block["bbox"]
            center = x0 + (x1 - x0) / 2
            block["column_id"] = 1 if boundary is not None and center >= boundary else 0

        ordered_blocks = sorted(
            raw_blocks,
            key=lambda block: (block["column_id"], round(block["bbox"][1], 2), round(block["bbox"][0], 2)),
        )

        page_text_lines = []
        block_lookup = {}
        for block in ordered_blocks:
            page_text_lines.extend(line["text"] for line in block["lines"])
            block_lookup[block["id"]] = block

        page_payload = {
            "pageNumber": page_index + 1,
            "width": round(page_width, 2),
            "height": round(page_height, 2),
            "text": "\n".join(page_text_lines),
        }
        pages.append(page_payload)
        page_context = classify_page(page_text_lines)

        page_candidates = build_page_candidates(
            page_number=page_index + 1,
            page_width=page_width,
            page_height=page_height,
            ordered_blocks=ordered_blocks,
            first_candidate_index=global_candidate_index,
            page_context=page_context,
        )
        all_candidates.extend(page_candidates)
        global_candidate_index += len(page_candidates)

    return pages, all_candidates


def extract_first_value(text, patterns):
    best_match = ""
    for pattern in patterns:
        for match in pattern.finditer(text):
            candidate = clean_text(match.group(0))
            if len(candidate) > len(best_match):
                best_match = candidate
    return best_match


def has_parameter_keyword(text):
    for definition in PARAMETER_DEFINITIONS:
        if any(keyword.search(text) for keyword in definition["keywords"]):
            return True
    return False


def normalize_label_hint(text, fallback_label):
    normalized = clean_text(
        re.sub(
            r"^(?:parameter|symbol|min|typ|max|unit|conditions?|参数|符号|最小值|典型值|最大值|单位|条件)[:：\s-]*",
            "",
            text,
            flags=re.I,
        )
    )
    normalized = re.sub(r"\s*[（(][A-Z0-9_\-+/%. ]+[）)]\s*$", "", normalized, flags=re.I)
    normalized = normalized.strip(" :-：")
    if not normalized or len(normalized) > 42:
        return fallback_label
    return normalized


def derive_generic_label(text):
    def finalize_label(value):
        if not value:
            return ""
        if GENERIC_NOISE_LABEL_PATTERN.search(value):
            return ""
        if re.fullmatch(r"[A-Z]{2,8}", value):
            return ""
        return value

    cleaned = clean_text(text)
    colon_match = re.search(r"[:：]", cleaned)
    if colon_match:
        left = cleaned[: colon_match.start()]
        label = normalize_label_hint(left, "Parameter")
        return finalize_label(label)
    match = re.search(
        r"[-+]?\d+(?:\.\d+)?\s*(?:to|~|〜|-|–|—|至)?\s*[-+]?\d*(?:\.\d+)?\s*(?:°C|℃|C|mV|V|nA|uA|μA|mA|A|nW|uW|μW|mW|W|Hz|kHz|MHz|GHz|%|ppm|LSB|bit|bits|位)",
        cleaned,
        re.I,
    )
    if match and match.start() > 1:
        label = normalize_label_hint(cleaned[: match.start()], "Parameter")
        return finalize_label(label)
    return ""


def score_variant(text, page_number, block_text, spec_context):
    if not text or len(text) < 5 or len(text) > 180:
        return 0

    if MARKETING_NOISE_PATTERN.search(text) or REVISION_NOISE_PATTERN.search(text) or looks_like_toc_line(text):
        return 0

    score = 0
    lower_penalty = bool(re.fullmatch(r"[-–—:;,.()\d\s]+", text))
    if lower_penalty:
        return 0

    if page_number <= 8:
        score += 2

    if PARAMETER_VALUE_HINT.search(text):
        score += 3

    if RANGE_JOINER.search(text):
        score += 1

    if TABLE_SIGNAL_PATTERN.search(text):
        score += 2

    if ":" in text or "：" in text:
        score += 1

    if re.search(r"\d", text):
        score += 1

    if SPEC_SECTION_PATTERN.search(block_text) or SPEC_HEADER_PATTERN.search(block_text):
        score += 2

    if spec_context:
        score += 3

    keyword_hits = 0
    for definition in PARAMETER_DEFINITIONS:
        matched = any(keyword.search(text) for keyword in definition["keywords"])
        if matched:
            keyword_hits += 1
            score += 4

    if ASSIGNMENT_PATTERN.search(text) and keyword_hits == 0:
        score -= 4

    if len(text) <= 96:
        score += 1

    if PACKAGE_DRAWING_PATTERN.search(text) and not re.search(r"\b(?:SOT|SOIC|TSSOP|MSOP|QFN|DFN|X2SON|TO)\b", text, re.I):
        score -= 4

    return max(score, 0)


def build_variants(block, line_index):
    line = block["lines"][line_index]
    text = clean_text(line["text"])
    variants = [
        {
            "text": text,
            "source_ids": [line["id"]],
            "rect": line["bbox"],
            "segments": list(line.get("segments", [])),
        }
    ]

    if line_index + 1 >= len(block["lines"]):
        return variants

    next_line = block["lines"][line_index + 1]
    next_text = clean_text(next_line["text"])
    if not next_text or len(text) > 60 or len(next_text) > 84:
        return variants

    current_rect = line["bbox"]
    next_rect = next_line["bbox"]
    current_height = current_rect[3] - current_rect[1]
    gap = next_rect[1] - current_rect[3]

    should_merge = (
        ((has_parameter_keyword(text) or text.endswith(":") or text.endswith("：")) and not PARAMETER_VALUE_HINT.search(text) and PARAMETER_VALUE_HINT.search(next_text))
        or (re.search(r"[:：]$", text) and PARAMETER_VALUE_HINT.search(next_text))
    )

    if should_merge and gap <= max(current_height * 0.9, 10):
        variants.append(
            {
                "text": clean_text(f"{text} {next_text}"),
                "source_ids": [line["id"], next_line["id"]],
                "rect": merge_rects([current_rect, next_rect]),
                "segments": [*line.get("segments", []), *next_line.get("segments", [])],
            }
        )

    return variants


def build_page_candidates(page_number, page_width, page_height, ordered_blocks, first_candidate_index, page_context):
    if page_context.get("is_toc_page"):
        return []

    candidates = []
    block_context = {}

    for index, block in enumerate(ordered_blocks):
        local_window = ordered_blocks[max(0, index - 1) : min(len(ordered_blocks), index + 2)]
        local_text = "\n".join(item["text"] for item in local_window)
        block_context[block["id"]] = bool(
            SPEC_SECTION_PATTERN.search(local_text) or SPEC_HEADER_PATTERN.search(local_text)
        )

    candidate_index = first_candidate_index

    pinout_seen = set()

    for pinout_group in build_layout_pinout_groups(ordered_blocks):
        pinout_key = re.sub(r"[^a-z0-9=,+/-]+", "", pinout_group["value"].lower())
        if not pinout_key or pinout_key in pinout_seen:
            continue
        pinout_seen.add(pinout_key)
        candidates.append(
            {
                "id": f"cand-{candidate_index}",
                "parameterId": "pinout",
                "labelHint": "Pinout",
                "valueHint": pinout_group["value"],
                "text": pinout_group["text"],
                "pageNumber": page_number,
                "pageWidth": round(page_width, 2),
                "pageHeight": round(page_height, 2),
                "rect": rect_to_dict(pinout_group["rect"]),
                "sourceIds": pinout_group["sourceIds"],
                "score": pinout_group["score"],
                "columnId": pinout_group["columnId"],
                "blockId": pinout_group["blockId"],
            }
        )
        candidate_index += 1

    for block_index, block in enumerate(ordered_blocks):
        spec_context = block_context.get(block["id"], False)
        local_window = ordered_blocks[max(0, block_index - 1) : min(len(ordered_blocks), block_index + 2)]
        local_text = "\n".join(item["text"] for item in local_window)
        pinout_value = "" if pinout_seen else extract_pinout_value(local_text)
        if pinout_value:
            pinout_key = re.sub(r"[^a-z0-9=,+/-]+", "", pinout_value.lower())
            if pinout_key and pinout_key not in pinout_seen:
                pinout_seen.add(pinout_key)
                candidate_rects = [item["bbox"] for item in local_window if item.get("bbox")]
                source_ids = [
                    line["id"]
                    for item in local_window
                    for line in item.get("lines", [])
                    if line.get("id")
                ]
                candidates.append(
                    {
                        "id": f"cand-{candidate_index}",
                        "parameterId": "pinout",
                        "labelHint": "Pinout",
                        "valueHint": pinout_value,
                        "text": build_pinout_excerpt(local_text),
                        "pageNumber": page_number,
                        "pageWidth": round(page_width, 2),
                        "pageHeight": round(page_height, 2),
                        "rect": rect_to_dict(merge_rects(candidate_rects) if candidate_rects else block["bbox"]),
                        "sourceIds": source_ids[:24],
                        "score": round(30 + min(len(extract_pinout_assignments(local_text)) * 2, 14), 2),
                        "columnId": block["column_id"],
                        "blockId": block["id"],
                    }
                )
                candidate_index += 1

        for line_index, _line in enumerate(block["lines"]):
            variants = build_variants(block, line_index)
            for variant in variants:
                text = variant["text"]
                score = score_variant(text, page_number, block["text"], spec_context)
                if score < 6:
                    continue

                best_label = "Parameter"
                best_parameter_id = "generic"
                best_value = ""
                best_score = score
                best_definition = None

                for definition in PARAMETER_DEFINITIONS:
                    keyword_hits = sum(1 for keyword in definition["keywords"] if keyword.search(text))
                    value = extract_first_value(text, definition["value_patterns"])
                    definition_score = score
                    if keyword_hits:
                        definition_score += keyword_hits * 2
                    if value:
                        definition_score += 2
                    allow_value_only = definition["id"] in VALUE_ONLY_PARAMETER_IDS and bool(value)
                    if definition_score > best_score and (keyword_hits > 0 or allow_value_only):
                        best_score = definition_score
                        best_label = definition["label"]
                        best_parameter_id = definition["id"]
                        best_value = value
                        best_definition = definition

                if best_parameter_id == "generic":
                    best_label = derive_generic_label(text)
                    best_value = extract_first_value(text, GENERIC_VALUE_PATTERNS)
                    if not best_label and not best_value:
                        continue
                    if page_context.get("is_package_page") and not best_value:
                        continue
                    if GENERIC_NOISE_LABEL_PATTERN.search(best_label or ""):
                        continue
                    if not spec_context and not has_parameter_keyword(text) and not PARAMETER_VALUE_HINT.search(text):
                        continue
                else:
                    normalized_text = clean_text(text)
                    if not best_value:
                        continue
                    if re.search(
                        r"(?:equation|derated|max ambient temperature|ta-max|tj-max|unless otherwise noted|test conditions|create a custom design|webench|appendix)",
                        normalized_text,
                        re.I,
                    ):
                        continue
                    if TEST_CONDITION_PATTERN.search(normalized_text) and TEXT_EXPLANATION_NOISE_PATTERN.search(normalized_text):
                        continue
                    if (
                        best_parameter_id == "working_temperature"
                        and TEST_CONDITION_PATTERN.search(normalized_text)
                    ):
                        continue
                    if (
                        best_parameter_id in {"input_voltage", "supply_voltage", "output_voltage"}
                        and VOLTAGE_CONTEXT_NOISE_PATTERN.search(normalized_text)
                    ):
                        continue
                    if (
                        best_parameter_id == "frequency"
                        and FREQUENCY_CONTEXT_NOISE_PATTERN.search(normalized_text)
                    ):
                        continue
                    if (
                        best_parameter_id == "package"
                        and PACKAGE_CONTEXT_NOISE_PATTERN.search(normalized_text)
                    ):
                        continue
                    if page_context.get("is_package_page") and best_parameter_id != "package" and PACKAGE_DRAWING_PATTERN.search(normalized_text):
                        continue

                focus_rect = build_focus_rect(
                    variant.get("segments", []),
                    best_definition,
                    best_label,
                    best_value,
                    variant["rect"],
                )

                candidate = {
                    "id": f"cand-{candidate_index}",
                    "parameterId": best_parameter_id,
                    "labelHint": best_label,
                    "valueHint": best_value,
                    "text": text,
                    "pageNumber": page_number,
                    "pageWidth": round(page_width, 2),
                    "pageHeight": round(page_height, 2),
                    "rect": rect_to_dict(focus_rect),
                    "sourceIds": variant["source_ids"],
                    "score": round(best_score, 2),
                    "columnId": block["column_id"],
                    "blockId": block["id"],
                }
                candidates.append(candidate)
                candidate_index += 1

    deduped = []
    seen = set()
    for candidate in sorted(candidates, key=lambda item: (-item["score"], item["pageNumber"], item["id"])):
        key = re.sub(r"[，。；：、“”‘’（）()\s]", "", candidate["text"]).lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)

    return deduped[:160]


def pick_title(pages, file_name):
    if not pages:
        return os.path.splitext(file_name)[0]

    first_page_lines = [line for line in pages[0]["text"].split("\n") if clean_text(line)]
    best_line = ""
    best_score = -1

    for index, line in enumerate(first_page_lines[:20]):
        text = clean_text(line)
        if len(text) < 4 or len(text) > 120:
            continue
        if not re.search(r"[A-Za-z\u3400-\u9fff]", text):
            continue
        score = 0
        if index < 6:
            score += 3
        if len(text) >= 12:
            score += 2
        if len(text) <= 80:
            score += 1
        if re.search(r"(datasheet|spec|temperature|sensor|converter|controller|module|芯片|传感器|转换器|控制器)", text, re.I):
            score += 2
        if SPEC_HEADER_PATTERN.search(text):
            score -= 2
        if score > best_score:
            best_score = score
            best_line = text

    return best_line or os.path.splitext(file_name)[0]


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: parse_pdf.py <pdf-path>")

    pdf_path = sys.argv[1]
    file_name = os.path.basename(pdf_path)

    with fitz.open(pdf_path) as document:
        pages, candidates = build_pages(document)

    payload = {
        "title": pick_title(pages, file_name),
        "fileName": file_name,
        "pageCount": len(pages),
        "pages": pages,
        "candidates": candidates,
    }
    sys.stdout.buffer.write(json.dumps(payload, ensure_ascii=False).encode("utf-8"))


if __name__ == "__main__":
    main()
