## Context

当前 workflow 运行时在条件判断中仅使用 `record.fields`（after 快照），且 action 配置依赖模板替换路径直接取值。对于“旧值可空”的业务（例如负责人迁移）会出现两类问题：  
1) 无法显式表达 `before` 语义，只能用脆弱路径（如 `.0.id`）；  
2) 模板缺失时要么传入非法参数到 Feishu，要么在步骤阶段硬失败。  

该问题跨越 DSL schema、条件插件、执行引擎、API 与 Web UI，属于跨模块语义缺失，需要先统一模型再进入实现。

## Goals / Non-Goals

**Goals:**
- 在 DSL 层提供稳定的 before/after 数据来源语义，避免依赖路径技巧。
- 支持步骤级执行守卫（guard），在条件不满足时可安全跳过 action。
- 为模板未解析场景提供显式策略（fail/skip），防止外部 API 收到非法 payload。
- 保持现有 workflow JSON 兼容，不要求一次性迁移存量数据。

**Non-Goals:**
- 不在本次引入完整脚本化 DSL（例如任意表达式语言）。
- 不重构插件体系或替换现有 condition evaluator 内核。
- 不在本次实现跨工作流事务语义。

## Decisions

### 决策 1：条件表达式增加 `source` 字段（`before` | `after`）
- 方案：在 `condition.expressions[]` 增加可选字段 `source`，默认 `after`。
- 原因：最小增量即可表达业务真实语义，且对现有表达式兼容。
- 备选：
  - 备选 A：新增 `beforeFields.xxx` 特殊字段路径约定。  
    - 放弃原因：语义隐式、UI 难校验、路径仍脆弱。
  - 备选 B：新增独立 `condition.before` 结构。  
    - 放弃原因：增加语法分裂和迁移复杂度。

### 决策 2：步骤新增可选 `when` 守卫，复用 condition 语法
- 方案：任意 step（尤其 action）可配置 `when`；执行前先评估，失败则标记 skipped 并跳转下一节点。
- 原因：可减少“仅用于前置判断”的样板条件节点，JSON 更短、更不易错。
- 备选：
  - 备选 A：强制通过独立 condition 节点建模。  
    - 放弃原因：配置冗长，业务人员维护成本高。

### 决策 3：模板未解析策略引入 `templatePolicy`
- 方案：为 action 执行引入 `templatePolicy`（默认 `fail`，可设 `skip`），由 runtime 统一处理。
- 原因：把“模板缺失”从隐式错误转为显式策略，便于不同动作按风险分级。
- 备选：
  - 备选 A：始终 fail。  
    - 放弃原因：对于删除/查询类动作会造成不必要失败。
  - 备选 B：始终 skip。  
    - 放弃原因：会掩盖创建/更新类关键写操作错误。

### 决策 4：保持持久化结构向后兼容
- 方案：新增字段全部可选并有默认值；老 workflow 不改数据即可运行。
- 原因：当前仍在开发期但已有大量联调配置，兼容可降低切换风险。

## Risks / Trade-offs

- [Risk] 条件语义增强后，配置错误可能从“执行失败”变成“被跳过”，增加排查复杂度  
  → Mitigation：在 execution log 中新增 `skip_reason`、`evaluated_source`、`template_policy` 结构化字段。

- [Risk] UI 引入新字段后，用户可能产生“source/guard 重复配置”冲突  
  → Mitigation：前端校验规则与后端 schema 双重约束，并在 Swagger 示例中给出推荐模式。

- [Risk] 模板策略默认值选择不当会影响现有行为  
  → Mitigation：默认 `fail` 保持安全侧，逐步对 delete/query 示例切换为 `skip`。

## Migration Plan

1. 扩展 DSL schema 与 runtime 评估上下文（支持 `source` 与 `when`）。  
2. 扩展执行引擎跳过语义与日志结构（可观测）。  
3. 扩展 API 文档与 UI 表单（新增字段可视化配置）。  
4. 增加回归测试（before 有值/为空、after 有值/为空、template fail/skip）。  
5. 灰度联调：先迁移 A→B 负责人同步用例，再迁移其它依赖 before 语义的 workflow。

## Open Questions

- `templatePolicy` 是否允许按步骤覆盖全局默认策略（推荐允许，默认继承全局）。
- `when` 为 false 时是否允许自定义跳转目标（当前建议先使用现有 next/linear 语义，后续再扩展）。
