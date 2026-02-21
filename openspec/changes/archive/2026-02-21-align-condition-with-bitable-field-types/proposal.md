## Why

当前运行时虽然已经具备字段 codec（可按字段类型 decode/write/filter），但 `condition` 节点在执行时没有注入真实 `fieldTypes`，导致不少表达式会回退到文本逻辑。这样会在人员、多选、关联、空值判断等场景产生隐性误判，和我们对“按字段类型判断”的预期不一致。  
在我们确认“以记录变更触发后续动作”为当前主业务模式后，这个偏差已经成为可靠性的主要风险点，需要尽快补齐。

## What Changes

- 在工作流事件执行链路中注入字段类型上下文（`fieldTypes`），让 `condition` 评估器能够基于真实字段类型选择处理器。
- 对齐字段类型命名与处理器命名（如 `single_select` / `multi_select` 与 `singleSelect` / `multiSelect`），避免类型已解析但条件层无法命中的问题。
- 明确并固化各字段类型的判断语义（包含、为空、大小比较、before/after source、changed）。
- 补充类型感知条件判断的回归测试，覆盖人员、数字、文本、多选、日期、关联等关键类型。
- 更新文档，给出 `condition` 与 `query/delete filter` 两套操作符的差异和按类型可用判断矩阵。

## Capabilities

### New Capabilities
- （无）

### Modified Capabilities
- `workflow-source-aware-conditions`: 条件表达式在 `before/after` 快照基础上，增加字段类型感知评估要求。
- `workflow-runtime`: 运行时上下文需携带字段类型映射，保证条件节点执行一致性。
- `api-documentation`: 补充按字段类型的数据判断能力、操作符矩阵与限制说明。

## Impact

- Affected code:
  - `src/workflow/core/engine.ts`
  - `src/workflow/plugins/condition.ts`
  - `src/engine/condition-evaluator.ts`
  - `src/db/field-mappings.ts`
  - `README.md`
  - `tests/engine/*`
- Affected APIs: 不新增对外 API；主要是 workflow 运行时行为与条件判断结果的正确性变化。
- Dependencies: 继续依赖飞书字段 schema 拉取能力（`appTableField.list`）与已有字段映射缓存。
- Systems: 影响 workflow-only 实时事件执行链路，重点是“记录变更触发后续动作”的稳定性与可预期性。
