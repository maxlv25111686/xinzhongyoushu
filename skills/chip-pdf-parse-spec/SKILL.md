---
name: chip-pdf-parse-spec
description: Stabilize and tune datasheet PDF parameter extraction for 芯中有数. Use when adjusting prompts, dedupe rules, candidate selection, pinout extraction, or JSON output rules for uploaded PDF manuals and structured parameter review workflows.
---

# Chip PDF Parse Spec

## Overview

Use this skill as the single source of truth for 芯中有数的 PDF 参数提取规范. Keep extraction behavior stable across prompt tuning, UI changes, and engine switching by updating the bundled reference instead of rewriting scattered prompt text.

## Workflow

1. Read [references/extraction-spec.md](references/extraction-spec.md) before changing PDF extraction prompts or fallback rules.
2. Keep the runtime prompt focused on:
   - candidate 已经按 page/block/column 切分
   - 只提取核心参数和引脚定义
   - 严格 JSON 输出
   - 不跨 candidate 拼接
3. Prefer reducing prompt noise over adding more examples. If a rule can be expressed as one short bullet in the reference, do that instead of duplicating long instructions in code.
4. When adjusting extraction quality, preserve these invariants:
   - page number and source candidate must remain traceable
   - labels must stay in simplified Chinese
   - uncertain values should be omitted, not invented
   - package drawings and layout notes should not crowd out core specs
5. When changing output shape, keep the JSON contract compatible with:
   - `title`
   - `summary`
   - `parameters[]`
   - `label`, `value`, `sourceId`, `text`, `importance`

## Reference Use

Read [references/extraction-spec.md](references/extraction-spec.md) when:
- prompt text in `server.js` is getting too long or unstable
- pinout extraction misses top-view/bottom-view labels
- the model starts pulling marketing text or package dimensions
- dedupe or label normalization needs to change
- you need a consistent extraction contract for both Ollama and OpenClaw

## Maintenance Rules

- Keep the reference concise enough to serve as runtime prompt material.
- Put detailed extraction rules in the reference file, not inline in multiple JS functions.
- If runtime behavior changes, update the reference first, then adjust code that loads it.
