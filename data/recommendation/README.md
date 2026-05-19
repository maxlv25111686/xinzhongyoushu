# 推荐知识库维护说明

推荐页的候选器件池现在由 [knowledge_base.json](/C:/Users/18403/Desktop/小冰对话台/data/recommendation/knowledge_base.json) 驱动，不再需要直接改 `scripts/recommendation_seed.py`。

## 你平时只需要改哪里

- 编辑 [knowledge_base.json](/C:/Users/18403/Desktop/小冰对话台/data/recommendation/knowledge_base.json)
- 常见维护内容：
  - 新增 `parts`
  - 修改已有器件的 `params`
  - 增补 `packageCompatibility`
  - 调整 `categoryTemplates` 的权重和硬筛规则

## 修改后怎么生效

1. 运行 `python scripts/validate_recommendation_kb.py`
2. 运行 `python scripts/build_recommendation_db.py data/recommendation/parts_knowledge.db`
3. 重启 `node server.js`

如果你直接重启服务，服务启动时也会自动重建推荐数据库。

## 核心字段说明

### `parts`

- `id`: 内部唯一 ID
- `mpn`: 器件型号
- `brand`: 品牌
- `manufacturer`: 厂商名
- `categoryId`: 器件分类，例如 `sensor.temperature.digital`
- `package`: 标准封装名
- `description`: 简短描述
- `stockQty`: 库存量
- `priceMin`: 最低单价
- `aliases`: 可选别名数组
- `params`: 结构化参数数组

### `parts[].params`

- `paramKey`: 参数键，例如 `supply_voltage_min`
- `valueNum`: 单值数值
- `valueNumMin`: 范围下限
- `valueNumTyp`: 典型值
- `valueNumMax`: 范围上限
- `valueText`: 展示文本
- `unit`: 单位

并不是每个字段都必须填，按参数类型填对应字段即可。

## 推荐维护方式

- 新增器件时优先复制同类器件，改 `mpn`、`brand`、`params`
- 封装尽量统一命名，例如 `SOT23-5`、`QFN-32`
- 温度、电压、电流这类可比较参数尽量同时填数值字段和 `valueText`
- 如果某类器件推荐总是不准，优先调整 `categoryTemplates`，不要先改前端

## 现状说明

- 当前默认知识库是从原来的 demo 种子数据自动迁移出来的
- `scripts/recommendation_seed.py` 仍保留作兜底和初始化来源
- 后续维护建议只改 `knowledge_base.json`
