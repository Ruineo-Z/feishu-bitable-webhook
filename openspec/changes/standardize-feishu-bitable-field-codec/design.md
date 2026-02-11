## Context

当前 workflow 事件处理与动作执行对飞书字段值的处理分散在多个模块：
- 事件解析在 `src/parser/feishu-parser.ts`
- 条件计算在 `src/engine/condition-evaluator.ts`
- create/query/delete 动作在 `src/workflow/plugins/*`

现状问题：
- 同一字段在不同链路上格式不一致（例如文本字段在事件中是富文本数组，写入时应为字符串）
- 过滤条件与写入 payload 的构造规则重复且不统一
- 错误信息多为 SDK 原始报错，缺少字段级上下文，联调成本高

## Goals / Non-Goals

**Goals:**
- 建立统一的 `Field Codec` 层，覆盖事件 decode、动作 write encode、过滤条件 encode。
- 为 workflow 插件提供字段类型感知的值转换，避免“透传导致类型错误”。
- 建立可扩展的字段类型策略（Text/RichText/User 先落地，后续扩展）。
- 将错误输出升级为“字段 + 类型 + 期望格式 + 原值摘要”的可诊断结构。

**Non-Goals:**
- 不在本变更中重做 workflow DSL 语法。
- 不引入可视化编排器或前端交互改造。
- 不一次性覆盖飞书全部字段类型（优先高频类型）。

## Decisions

### Decision 1: 引入三段式编解码接口
- 方案：定义统一接口 `decodeFromEvent`、`encodeForWrite`、`encodeForFilter`。
- 原因：事件读取与写入规则并不对称，强行复用单函数会丢失语义。
- 备选：仅在插件内局部 if/else 转换。
  - 未选原因：重复逻辑多，难以测试和扩展。

### Decision 2: 以字段 schema 驱动 codec，而非仅靠值形态推断
- 方案：通过字段映射与字段元信息获取目标字段类型，按类型选择 codec。
- 原因：仅靠值形态推断（如数组/对象）容易误判人员、链接、富文本等类型。
- 备选：只做值形态 heuristics。
  - 未选原因：稳定性不足，遇到边界值容易出错。

### Decision 3: 在插件入口统一进行 payload 正规化
- 方案：在 `action.bitable.create`、`action.bitable.delete`、`action.bitable.query` 内接入统一 normalizer。
- 原因：最小改动即可覆盖真实执行链路，且不破坏已有 DSL。
- 备选：在 ContextManager 全局替换时直接改写值。
  - 未选原因：会影响条件判断语义，且难以区分“显示值”与“写入值”。

### Decision 4: 错误模型标准化并保留 SDK 原始上下文
- 方案：新增统一错误码（如 `FIELD_CODEC_ENCODE_FAILED`），同时透传 Feishu `code/msg/log_id`。
- 原因：便于排障与监控，避免只看到通用 `PLUGIN_ERROR`。
- 备选：仅记录 SDK 原始错误。
  - 未选原因：缺少业务语义与字段定位信息。

## Risks / Trade-offs

- [字段类型信息获取不全] → 降级策略：未知类型走透传并打告警，避免阻塞主流程。
- [转换策略过严导致历史 workflow 失败] → 通过 feature flag/灰度开关逐步启用 strict 模式。
- [新增 codec 层带来性能开销] → 引入 table 级 schema 缓存与批量解析，避免每步重复 IO。
- [类型规则维护成本上升] → 采用“每类型独立 codec + 单元测试基线”的可扩展结构。

## Migration Plan

1. 新增 codec 模块与类型注册表，不改现有插件行为（暗发布）。
2. 在 create/delete/query 插件内接入 normalizer，并保持可回退开关。
3. 增加回归测试：文本、人员、空值、数组值、过滤条件组合。
4. 在预发布用 A->B 真实链路做联调，验证 `TextFieldConvFail/InvalidFilter` 消失。
5. 观察执行日志后切换为默认启用，保留回退策略。

回退策略：关闭 codec 开关并回退至旧插件逻辑（不改表结构，低风险回退）。

## Open Questions

- 是否在本期纳入 Phone/URL/Attachment 等复杂字段类型，还是后续迭代？
- 字段类型来源优先级如何定义（实时拉取 vs registry 缓存）？
- 条件表达式是否需要新增“按原始值/按显示值”模式开关？
