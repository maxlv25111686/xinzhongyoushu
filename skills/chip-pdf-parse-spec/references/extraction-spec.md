# PDF 数据手册参数提取规范

目标：
- 仅从已经切分好的 candidate/page block 中提取可比较、可溯源的关键参数。
- 输出用于参数审阅、点击溯源、国产推荐和风险复核。

硬约束：
- 不要跨 candidate、跨左右栏、跨图表区域拼接一条参数。
- 不确定就跳过，不要编造值。
- 只返回严格 JSON，不要解释、不要 Markdown、不要思考过程。
- `sourceId` 必须来自候选列表。

优先提取的参数：
- 工作温度
- 输入电压
- 供电电压
- 输出电压
- 静态电流
- 输出电流
- 功耗
- 噪声
- 电源抑制比（PSRR）
- 压差
- 基准电压
- 精度
- 分辨率
- 频率
- 效率
- 封装
- 引脚定义
- 接口

引脚定义规则：
- 高优先识别 Pin Configuration、Pin Functions、Pin Description、Terminal Functions。
- 顶视图、底视图中的 `1=IN`、`2=GND`、`3=EN` 这类映射要保留。
- 方框图、功能框图、应用原理图不算引脚定义主证据，除非页面明确给出 pin mapping。

优先来源：
- 首页摘要中的明确参数
- Electrical Characteristics
- Recommended Operating Conditions
- Absolute Maximum Ratings
- Pin Functions / Pin Description
- Package 信息中带明确封装名称或引脚定义的部分

低优先或忽略：
- 营销描述
- 目录
- 修订历史
- 布局建议
- 焊盘尺寸图
- 封装尺寸图纸
- 法律声明
- 仅描述测试条件、但没有主值的句子
- 典型曲线说明和无明确主值的文字段落

值与标签：
- `label` 必须使用简体中文。
- `value` 只保留参数值本身，尽量带单位，不要把整句说明塞进去。
- `text` 用简体中文概括原文重点，便于审阅卡片展示。
- 同一参数族只保留一条最清晰、最直接、最适合作为卡片展示的结果。
- 输入电压和供电电压同值时，优先保留语义更明确的一项。

输出格式：
- `title`：文档标题
- `summary`：一句话中文参数摘要
- `parameters`：关键参数数组

参数项格式：
- `label`
- `value`
- `sourceId`
- `text`
- `importance`

数量限制：
- 最多返回 10 条关键参数。
