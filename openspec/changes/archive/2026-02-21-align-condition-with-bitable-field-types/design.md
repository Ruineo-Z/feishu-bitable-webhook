## Context

当前链路已经具备字段类型解析能力（codec），并在事件映射与 bitable action（create/query/delete）里使用类型信息；但 `condition` 节点执行时没有注入 `fieldTypes`，导致评估器常回退到文本处理器。  
这会让人员、多选、关联、空值等字段在条件判断中出现语义偏差，尤其在“记录变更触发后续动作”的主业务场景中容易产生隐性误判。

## Goals / Non-Goals

**Goals:**
- 在运行时条件评估上下文中注入真实字段类型映射，确保 `condition` 按字段语义执行。
- 对齐字段类型命名（codec 侧 snake_case 与条件处理器侧 camelCase）并建立稳定映射。
- 固化并文档化两套操作符语义：`condition` 与 `query/delete filter`。
- 提供可回归的测试基线，覆盖人员、数字、文本、多选、日期、关联与空值场景。

**Non-Goals:**
- 不扩展新的飞书事件订阅类型（本次仍聚焦 record_changed 主链路）。
- 不改造 workflow DSL 结构（不新增表达式语法）。
- 不重写 codec 架构或新增大规模字段类型支持。

## Decisions

### Decision 1: 在事件执行入口构建并透传 `fieldTypes`
- 方案：在 workflow runtime 构建 `EvaluationContext` 时注入字段类型映射，而不是在 `ConditionEvaluator` 内部自行拉取 schema。
- 原因：保持评估器纯函数化、减少 IO 依赖、避免评估阶段发生远程调用。
- 备选：评估器内按需查询 `fieldMappingsDb`。
  - 未选原因：耦合数据访问层、增加延迟与失败面。

### Decision 2: 建立条件引擎字段类型别名映射层
- 方案：在条件评估前将 `single_select/multi_select` 等 codec 类型归一为处理器可识别键（`singleSelect/multiSelect`）。
- 原因：最小改动兼容现有处理器实现，避免一次性重构全部 handler 命名。
- 备选：统一重命名全部 handler 为 snake_case。
  - 未选原因：改动面过大，回归成本高。

### Decision 3: 明确“类型缺失回退”策略
- 方案：字段类型缺失时继续回退文本处理器，但行为必须可预期且可测试。
- 原因：兼容历史数据与字段元信息不可用场景，避免中断执行链路。
- 备选：字段类型缺失即失败。
  - 未选原因：会放大临时元信息故障影响，不符合当前稳定性目标。

### Decision 4: 文档层同时维护两套操作符矩阵
- 方案：在 README/API 文档中显式区分 `condition` 操作符与 `query/delete filter` 操作符。
- 原因：两套语义命名不同，是当前使用误解的主要来源。
- 备选：仅在代码注释说明。
  - 未选原因：对配置者不可见，无法降低误配。

## Risks / Trade-offs

- [字段类型映射不完整] → 继续保留文本回退并增加测试覆盖，确保最差情况下行为可预测。  
- [类型别名映射遗漏] → 增加类型映射单测，覆盖 snake_case/camelCase 对应关系。  
- [历史规则行为变化] → 通过回归用例对比关键场景（人员包含、多选包含、数值比较、空值判断）。  
- [文档与实现漂移] → 将 README 与 OpenSpec 同步更新，后续变更要求同时更新矩阵表。  

## Migration Plan

1. 在 runtime 构建 `EvaluationContext` 时注入字段类型映射。
2. 在条件评估层加入字段类型别名归一。
3. 补充条件评估回归测试，覆盖类型感知与回退路径。
4. 更新 README 与 API 文档矩阵，明确两套操作符语义。
5. 在预发执行真实 record_changed 联调，确认判断结果与预期一致。

回退策略：若出现异常，可暂时关闭类型注入路径（回退文本处理），保留现有事件接入与动作执行链路不变。

## Open Questions

- 条件表达式字段键是否统一按“字段名”还是支持“字段 ID + 字段名”双键映射？
- 类型缺失回退是否需要输出结构化 warning 进入 execution_logs？
- `action.bitable.update` 是否在同一阶段补齐 codec 接入，还是独立变更处理？
