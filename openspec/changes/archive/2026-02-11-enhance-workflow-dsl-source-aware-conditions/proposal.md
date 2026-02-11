## Why

当前 DSL 只能默认读取 `trigger.record.fields`，无法显式表达 “before/after” 数据来源，导致同一业务在“有旧值/无旧值”场景下出现模板未解析和 `InvalidFilter`。项目仍在开发阶段，现在引入语义化 DSL 能力可以在上线前一次性消除这类配置脆弱性。

## What Changes

- 增加条件表达式的来源语义：支持在条件中声明读取 `before` 或 `after` 字段快照，默认保持向后兼容。
- 增加步骤级守卫能力：Action 步骤可声明执行前置条件，条件不满足时安全跳过步骤，不再依赖模板解析失败来“阻断”流程。
- 增加模板解析失败策略：对未解析变量提供可配置行为（失败/跳过），避免将非法参数发往飞书接口。
- 更新工作流 API 校验、示例与管理 UI，使业务人员可直接配置上述能力。
- 补充端到端测试，覆盖“before 为空”“before 有值”“after 为空”三类关键路径。

## Capabilities

### New Capabilities

- `workflow-source-aware-conditions`: 在 DSL 中支持 before/after 字段来源与步骤守卫语义，确保条件与动作在不同事件快照下可稳定执行。

### Modified Capabilities

- `workflow-branching-control-flow`: 扩展分支执行模型，支持步骤级守卫和跳过语义。
- `workflow-management-web-ui`: 增加 before/after 来源与步骤守卫的可视化配置能力。
- `api-documentation`: 更新 workflow DSL schema 与示例，明确新增字段和兼容行为。

## Impact

- 影响代码：`src/workflow/dsl/schema.ts`、`src/workflow/plugins/condition.ts`、`src/workflow/core/engine.ts`、`src/workflow/core/context.ts`、`src/routes/workflow.ts`、`src/ui/workflows/*`。
- 影响测试：新增/调整 workflow DSL、插件、端到端事件流相关测试。
- 影响运维与联调：现有 workflow 配置可保持兼容，但建议将依赖 `.0.id` 的模板路径迁移为来源语义配置。
